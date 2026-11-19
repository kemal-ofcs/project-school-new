import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Client, createClient } from "@libsql/client";
import { initDatabaseSchema } from "@/lib/db-schema";
import {
  type DaftarPelatihan,
  JENIS_SERTIFIKAT_BAWAAN,
  PESAN_LEPAS_BERSERTIFIKAT,
  PESAN_PESERTA_DITOLAK,
  PESAN_PESERTA_GANDA,
  type RekapPelatihan,
  type RincianPelatihan,
  type RiwayatPelatihan,
} from "@/lib/validations/hr-pelatihan";

mock.module("server-only", () => ({}));

// Jalur Web pelatihan (HRIS Fase 7b) pada skema Web sungguhan. Pasangan
// Rust: `hr_pelatihan_alur_cloud` di `hr_pelatihan.rs`, dengan data yang sama.
const testDirectory: string = mkdtempSync(join(tmpdir(), "kos-pelatihan-"));
const client: Client = createClient({
  url: `file:${join(testDirectory, "test.db")}`,
});

mock.module("@/lib/db", () => ({
  db: client,
  ensureDbInitialized: async () => {},
}));

const S = await import("./hr-pelatihan");
const H = await import("./hris");

const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const galat = async (janji: Promise<unknown>) => {
  try {
    await janji;
    return null;
  } catch (error) {
    return (error as Error).message;
  }
};

const hitung = async (sql: string) =>
  Number((await client.execute(sql)).rows[0]?.[0] ?? 0);

beforeAll(async () => {
  await initDatabaseSchema(client);
  await client.batch(
    [
      "INSERT INTO master_data (id_unik, kode_karyawan, nama, divisi, id_shift, status_aktif, unit, id_keluar) VALUES ('G1', 'KG1', 'Ani', 'Guru', 1, 'Aktif', 'SD', NULL), ('T1', 'KT1', 'Budi', 'TU', 1, 'Aktif', 'SD', NULL), ('X1', 'KX1', 'Cici', 'TU', 1, 'Nonaktif', 'SD', 'klr-1');",
      "INSERT INTO guru_data (id_guru, created_at, updated_at) VALUES ('G1', datetime('now'), datetime('now'));",
    ],
    "write",
  );
}, 60_000);

afterAll(async () => {
  client.close();
  await Bun.sleep(50);
  try {
    rmSync(testDirectory, { recursive: true, force: true, maxRetries: 10 });
  } catch {
    // Berkas sementara Windows kadang masih terkunci; dibersihkan OS nanti.
  }
});

const pelatihan = async (
  nama: string,
  jenis: string,
  mulai: string,
  selesai: string,
  jam: number,
) =>
  String(
    (
      await S.simpanPelatihan(client, "uji", {
        nama,
        jenis_penyelenggara: jenis,
        tanggal_mulai: mulai,
        tanggal_selesai: selesai,
        jumlah_jam: jam,
        biaya: 500000,
      })
    ).id_pelatihan,
  );

const tambah = (id: string, pegawai: string) =>
  S.simpanPeserta(client, "uji", {
    aksi: "tambah",
    id_pelatihan: id,
    id_karyawan: pegawai,
  });

describe("hr-pelatihan: alur di database Web", () => {
  test("peserta, sertifikat, hapus dokumen, lepas, rekap, riwayat", async () => {
    const kkg = await pelatihan(
      "KKG Matematika",
      "KKG",
      "2024-03-01",
      "2024-03-02",
      16,
    );
    const dinas = await pelatihan(
      "Bimtek Dinas",
      "Dinas",
      "2024-12-30",
      "2025-01-02",
      32,
    );
    const batal = await pelatihan(
      "Batal",
      "Internal",
      "2024-05-01",
      "2024-05-01",
      8,
    );
    const nanti = await pelatihan(
      "Nanti",
      "MGMP",
      "2999-01-01",
      "2999-01-02",
      8,
    );

    // Peserta: ganda berhenti di PK, pegawai keluar ditolak.
    for (const [id, pegawai] of [
      [kkg, "G1"],
      [kkg, "T1"],
      [dinas, "G1"],
      [batal, "G1"],
      [nanti, "G1"],
    ])
      await tambah(id, pegawai);
    expect(await galat(tambah(kkg, "G1"))).toBe(PESAN_PESERTA_GANDA);
    expect(await galat(tambah(kkg, "X1"))).toBe(PESAN_PESERTA_DITOLAK);
    await S.simpanPelatihan(client, "uji", {
      aksi: "batal",
      id_pelatihan: batal,
      alasan: "Ditunda",
    });
    expect(await galat(tambah(batal, "T1"))).toBe(PESAN_PESERTA_DITOLAK);
    await S.simpanPeserta(client, "uji", {
      aksi: "hasil",
      id_peserta: `${kkg}:T1`,
      hasil: "Tidak Hadir",
    });

    const rincian = (await S.daftarPelatihan(client, {
      mode: "rincian",
      id_pelatihan: kkg,
    })) as RincianPelatihan;
    expect(rincian.pelatihan).toMatchObject({
      status: "Selesai",
      jumlah_peserta: 2,
    });
    const daftar = (await S.daftarPelatihan(client, {
      tahun: "2999",
    })) as DaftarPelatihan;
    expect(daftar.pelatihan[0]?.status).toBe("Dijadwalkan");

    // Sertifikat: dokumen + tautan, tampil di tab Dokumen pegawai.
    const pesertaG1 = `${kkg}:G1`;
    const idDok = String(
      (
        await S.simpanSertifikat(client, "uji", {
          id_peserta: pesertaG1,
          nomor: "S-01",
          tanggal_terbit: "2024-03-02",
        })
      ).id_dokumen,
    );
    const dokumen = await H.getDokumen(client, "G1");
    expect(dokumen.dokumen?.[0]).toMatchObject({
      id_dokumen: idDok,
      id_jenis: JENIS_SERTIFIKAT_BAWAAN,
      catatan: "KKG Matematika",
    });
    const idBerkas = String(
      (
        (await S.simpanSertifikat(client, "uji", {
          aksi: "berkas_tambah",
          id_peserta: pesertaG1,
          nama_berkas: "s.png",
          mime_type: "image/png",
          data_base64: PNG,
        })) as { id_berkas: string }
      ).id_berkas,
    );
    expect((await S.ambilBerkasSertifikat(client, idBerkas)).data_base64).toBe(
      PNG,
    );
    const lepas = () =>
      S.simpanPeserta(client, "uji", { aksi: "lepas", id_peserta: pesertaG1 });
    expect(await galat(lepas())).toBe(PESAN_LEPAS_BERSERTIFIKAT);

    // Hapus dari tab Dokumen mengosongkan tautan; lalu lepas boleh.
    await H.hapusDokumen(client, idDok);
    expect(
      await hitung(
        `SELECT COUNT(*) FROM hr_pelatihan_peserta WHERE id_peserta = '${pesertaG1}' AND id_dokumen IS NULL;`,
      ),
    ).toBe(1);
    expect(
      await hitung(
        `SELECT COUNT(*) FROM hr_dokumen_berkas WHERE id_berkas = '${idBerkas}';`,
      ),
    ).toBe(0);
    await lepas();
    await tambah(kkg, "G1");

    // Rekap 2025: hanya Bimtek (tahun dari tanggal selesai).
    const r2025 = (await S.daftarPelatihan(client, {
      mode: "rekap",
      tahun: "2025",
    })) as RekapPelatihan;
    expect(r2025.rekap.length).toBe(1);
    expect(r2025.rekap[0]).toMatchObject({ total_jam: 32 });
    expect(r2025.rekap[0]?.jam_per_jenis.Dinas).toBe(32);
    // Rekap 2024: KKG untuk Ani; Budi Tidak Hadir, pelatihan batal dilewati.
    const r2024 = (await S.daftarPelatihan(client, {
      mode: "rekap",
      tahun: "2024",
      kelompok: "Guru",
    })) as RekapPelatihan;
    expect(r2024.rekap.length).toBe(1);
    expect(r2024.rekap[0]).toMatchObject({ id_karyawan: "G1", total_jam: 16 });
    const tendik = (await S.daftarPelatihan(client, {
      mode: "rekap",
      tahun: "2024",
      kelompok: "Tendik",
    })) as RekapPelatihan;
    expect(tendik.rekap).toEqual([]);

    // Riwayat tetap terbaca sesudah pegawai keluar.
    await client.execute(
      "UPDATE master_data SET status_aktif = 'Nonaktif', id_keluar = 'klr-2' WHERE id_unik = 'G1';",
    );
    const riwayat = (await S.daftarPelatihan(client, {
      mode: "riwayat",
      id_karyawan: "G1",
    })) as RiwayatPelatihan;
    expect(riwayat.peserta.length).toBe(4);
  });
});
