import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Client, createClient } from "@libsql/client";
import { initDatabaseSchema } from "@/lib/db-schema";
import {
  hireDraftSchema,
  idDariPelamar,
  MAKS_BERKAS_PELAMAR,
  PESAN_BERKAS_PELAMAR_PENUH,
  PESAN_KELOMPOK_TERKUNCI,
  PESAN_KLAIM_GAGAL,
  PESAN_PELAMAR_TERKUNCI,
  PESAN_TAHAP_AKHIR,
  type RincianPelamar,
} from "@/lib/validations/hr-rekrutmen";
import { HARI_INI_SQL } from "@/lib/validations/hris";

mock.module("server-only", () => ({}));

// Jalur Web rekrutmen (HRIS Fase 7a–7b) pada skema Web sungguhan. Pasangan
// Rust: `hr_rekrutmen_alur_cloud` dan `hr_rekrutmen_jadikan_personil` di
// `hr_rekrutmen.rs`, dengan data yang sama. Satu klien untuk seluruh berkas:
// `saveTeacher`/`tambahKaryawan` memakai `db` global.
const testDirectory: string = mkdtempSync(join(tmpdir(), "kos-rekrutmen-"));
const client: Client = createClient({
  url: `file:${join(testDirectory, "test.db")}`,
});

mock.module("@/lib/db", () => ({
  db: client,
  ensureDbInitialized: async () => {},
}));

const S = await import("./hr-rekrutmen");

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

const lowongan = async (judul: string, kelompok: "Guru" | "Tendik") =>
  (
    await S.simpanLowongan(client, "uji", {
      judul,
      kelompok,
      jumlah: 1,
      tanggal_buka: "2020-01-01",
    })
  ).id_lowongan;

const pelamar = async (idLowongan: string, nama: string) =>
  S.simpanPelamar(client, "uji", {
    id_lowongan: idLowongan,
    nama,
    no_hp: "0812 3456 789",
    tanggal_lamaran: "2020-02-01",
  });

const tahap = (id: string, t: string, catatan = "") =>
  S.tahapPelamar(client, "uji", {
    id_pelamar: id,
    tahap: t,
    tanggal: "2020-02-10",
    catatan,
  });

const rincian = async (id: string) =>
  (await S.daftarPelamar(client, "", id)) as RincianPelamar;

describe("hr-rekrutmen: alur di database Web", () => {
  test("skema v72: enam tabel cloud-only", async () => {
    expect(
      await hitung(
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN ('hr_lowongan', 'hr_pelamar', 'hr_pelamar_tahap', 'hr_pelamar_berkas', 'hr_pelatihan', 'hr_pelatihan_peserta');",
      ),
    ).toBe(6);
  });

  test("lowongan, pelamar, tahap, berkas, hapus, retensi", async () => {
    const hari = String(
      (await client.execute(HARI_INI_SQL)).rows[0]?.hari_ini ?? "",
    );
    const guru = await lowongan("Guru Matematika", "Guru");
    const tendik = await lowongan("Staf TU", "Tendik");
    expect(
      await galat(
        S.simpanLowongan(client, "uji", {
          judul: "X",
          kelompok: "Guru",
          jumlah: 1,
          tanggal_buka: "2020-01-01",
          unit: "Tidak Ada",
        }),
      ),
    ).toBe("Unit tidak ditemukan atau tidak aktif.");

    // Pelamar + tahap Lamaran urutan 1 dalam satu transaksi.
    const ani = (await pelamar(guru, "Ani")).id_pelamar;
    const kembar = await pelamar(guru, "ani");
    expect(kembar.mungkin_ganda).toBe(true);
    const ani2 = kembar.id_pelamar;
    expect(
      await hitung(
        `SELECT COUNT(*) FROM hr_pelamar_tahap WHERE id_tahap = '${ani}:1' AND tahap = 'Lamaran';`,
      ),
    ).toBe(1);
    const r = await rincian(ani);
    expect(r.pelamar).toMatchObject({
      no_hp: "+628123456789",
      status: "Lamaran",
    });
    expect(
      await galat(
        S.simpanPelamar(client, "uji", {
          id_lowongan: guru,
          nama: "Budi",
          tanggal_lamaran: "2019-12-31",
        }),
      ),
    ).toBe("Tanggal lamaran tidak boleh sebelum tanggal buka lowongan.");

    // Kelompok terkunci setelah ada pelamar.
    expect(
      await galat(
        S.simpanLowongan(client, "uji", {
          id_lowongan: guru,
          judul: "Guru Matematika",
          kelompok: "Tendik",
          jumlah: 1,
          tanggal_buka: "2020-01-01",
        }),
      ),
    ).toBe(PESAN_KELOMPOK_TERKUNCI);

    // Tahap: lompat, ulang, Microteaching, tahap akhir, batal.
    await tahap(ani, "Wawancara");
    await tahap(ani, "Wawancara", "kedua");
    await tahap(ani, "Microteaching");
    await tahap(ani, "Diterima");
    expect(await galat(tahap(ani, "Penawaran"))).toBe(PESAN_TAHAP_AKHIR);
    await S.tahapPelamar(client, "uji", {
      aksi: "batal",
      id_pelamar: ani,
      id_tahap: `${ani}:5`,
      alasan: "Salah klik",
    });
    expect((await rincian(ani)).pelamar.status).toBe("Microteaching");
    expect(
      await galat(
        S.tahapPelamar(client, "uji", {
          aksi: "batal",
          id_pelamar: ani2,
          id_tahap: `${ani2}:1`,
          alasan: "x",
        }),
      ),
    ).toBe("Tahap Lamaran pertama tidak bisa dibatalkan.");

    const budi = (await pelamar(tendik, "Budi")).id_pelamar;
    expect(await galat(tahap(budi, "Microteaching"))).toBe(
      "Microteaching hanya untuk lowongan Guru.",
    );

    // Berkas: maks 3.
    const berkas = {
      id_pelamar: budi,
      nama_berkas: "cv.png",
      mime_type: "image/png",
      data_base64: PNG,
    };
    for (let i = 0; i < MAKS_BERKAS_PELAMAR; i++)
      await S.tambahBerkasPelamar(client, berkas);
    expect(await galat(S.tambahBerkasPelamar(client, berkas))).toBe(
      PESAN_BERKAS_PELAMAR_PENUH,
    );
    const rb = await rincian(budi);
    expect(rb.berkas.length).toBe(3);
    expect(
      (await S.ambilBerkasPelamar(client, rb.berkas[0].id_berkas)).data_base64,
    ).toBe(PNG);

    // Hapus satu pelamar: tahap dan berkas ikut, hitungan anonim naik.
    await S.hapusPelamar(client, budi);
    expect(
      await hitung(
        `SELECT COUNT(*) FROM hr_pelamar_berkas WHERE id_pelamar = '${budi}';`,
      ),
    ).toBe(0);
    expect(
      await hitung(
        `SELECT pelamar_dihapus FROM hr_lowongan WHERE id_lowongan = '${tendik}';`,
      ),
    ).toBe(1);

    // Pelamar yang sudah personil tidak bisa dihapus dan lolos retensi.
    await client.execute(
      `UPDATE hr_pelamar SET id_karyawan = 'ptk_x' WHERE id_pelamar = '${ani}';`,
    );
    expect(await galat(S.hapusPelamar(client, ani))).toBe(
      PESAN_PELAMAR_TERKUNCI,
    );

    // Retensi: lowongan guru ditutup 13 bulan lalu; lowongan baru ditutup
    // hari ini (belum 12 bulan).
    const baru = await lowongan("Satpam", "Tendik");
    const cici = (await pelamar(baru, "Cici")).id_pelamar;
    await S.simpanLowongan(client, "uji", { aksi: "tutup", id_lowongan: baru });
    await client.execute(
      `UPDATE hr_lowongan SET ditutup_pada = datetime('now', '-13 months') WHERE id_lowongan = '${guru}';`,
    );
    const daftar = await S.daftarLowongan(client);
    const cari = (id: string) =>
      daftar.lowongan.find((l) => l.id_lowongan === id);
    expect(cari(baru)).toMatchObject({
      status: "Ditutup",
      tutup_efektif: hari,
    });
    expect(cari(tendik)).toMatchObject({ status: "Dibuka", tanggal_hapus: "" });

    expect((await S.bersihkanPelamar(client)).dihapus).toBe(1);
    expect((await S.bersihkanPelamar(client)).dihapus).toBe(0);
    expect(
      await hitung(
        `SELECT COUNT(*) FROM hr_pelamar WHERE id_pelamar IN ('${ani}', '${cici}');`,
      ),
    ).toBe(2);
    expect(
      await hitung(
        `SELECT COUNT(*) FROM hr_pelamar_tahap WHERE id_pelamar = '${ani2}';`,
      ),
    ).toBe(0);
    expect(
      await hitung(
        `SELECT pelamar_dihapus FROM hr_lowongan WHERE id_lowongan = '${guru}';`,
      ),
    ).toBe(1);

    // Buka lagi: tanggal tutup yang lewat wajib dimundurkan.
    expect(
      await galat(
        S.simpanLowongan(client, "uji", {
          aksi: "buka",
          id_lowongan: baru,
          tanggal_tutup: "2020-06-01",
        }),
      ),
    ).toBe(
      "Tanggal tutup baru harus hari ini atau sesudahnya, atau dikosongkan.",
    );
    await S.simpanLowongan(client, "uji", { aksi: "buka", id_lowongan: baru });
    expect(
      await hitung(
        `SELECT COUNT(*) FROM hr_lowongan WHERE id_lowongan = '${baru}' AND ditutup_pada IS NULL;`,
      ),
    ).toBe(1);
  });

  test("jadikan personil: tendik, guru, klaim, lanjutkan", async () => {
    const diterima = async (judul: string, kelompok: "Guru" | "Tendik") => {
      const id = (await pelamar(await lowongan(judul, kelompok), "Calon"))
        .id_pelamar;
      await tahap(id, "Diterima");
      return id;
    };
    const ani = await diterima("Guru IPA", "Guru");
    const budi = await diterima("Staf TU", "Tendik");
    const ambil = (id: string, kelompok: string) => {
      const h = idDariPelamar(id, kelompok);
      if (!h.ok) throw new Error(h.galat);
      return h.nilai;
    };
    const guru = ambil(ani, "Guru");
    const tendik = ambil(budi, "Tendik");
    const hire = (
      id: string,
      aksi: "jadikan" | "lanjutkan",
      personil: Record<string, unknown>,
      status: string,
    ) =>
      hireDraftSchema.parse({
        aksi,
        id_pelamar: id,
        personil,
        kontrak: {
          status,
          tanggal_mulai: "2020-03-01",
          tanggal_selesai: "2021-02-28",
        },
      });
    const jadikan = async (d: ReturnType<typeof hire>) =>
      S.jadikanPersonil(
        client,
        "uji",
        d,
        await S.pelamarUntukPersonil(client, d.id_pelamar),
      );
    const klaim = async (id: string) =>
      String(
        (
          await client.execute({
            sql: "SELECT COALESCE(id_karyawan, '') AS k FROM hr_pelamar WHERE id_pelamar = ?;",
            args: [id],
          })
        ).rows[0]?.k ?? "",
      );
    const budiDraft = (status: string) =>
      hire(
        budi,
        "jadikan",
        { nama: "Budi", id_shift: 1, divisi: "Tata Usaha", id_unik: "ASING" },
        status,
      );

    // GTY untuk Tendik ditolak sebelum klaim.
    expect(await galat(jadikan(budiDraft("GTY")))).toBe(
      "Status GTY dan GTT hanya untuk guru.",
    );
    expect(await klaim(budi)).toBe("");

    // Tendik: master_data + id_card + QR id|token + kontrak, tanpa guru_data.
    expect((await jadikan(budiDraft("PTT"))).id_karyawan).toBe(tendik.id_unik);
    const t = tendik.id_unik;
    expect(await klaim(budi)).toBe(t);
    expect(
      await hitung(
        `SELECT COUNT(*) FROM master_data WHERE id_unik = '${t}' AND kode_karyawan = '${tendik.kode_karyawan}' AND qr_code = id_unik || '|' || token_absensi;`,
      ),
    ).toBe(1);
    expect(
      await hitung(`SELECT COUNT(*) FROM guru_data WHERE id_guru = '${t}';`),
    ).toBe(0);
    expect(
      await hitung(`SELECT COUNT(*) FROM id_card WHERE id_unik = '${t}';`),
    ).toBe(1);
    expect(
      await hitung(
        `SELECT COUNT(*) FROM hr_kontrak WHERE id_kontrak = '${tendik.id_kontrak}' AND status = 'PTT';`,
      ),
    ).toBe(1);

    // Tekan kedua ditolak; data pelamar terkunci; Lanjutkan Web melewati
    // personil yang sudah ada di database dan kontrak berhenti di PK.
    expect(await galat(jadikan(budiDraft("PTT")))).toBe(PESAN_KLAIM_GAGAL);
    expect(
      await galat(
        S.simpanPelamar(client, "uji", {
          id_pelamar: budi,
          id_lowongan: (await rincian(budi)).pelamar.id_lowongan,
          nama: "Budi X",
          tanggal_lamaran: "2020-02-01",
        }),
      ),
    ).toBe(PESAN_PELAMAR_TERKUNCI);
    await jadikan(
      hire(
        budi,
        "lanjutkan",
        { nama: "Budi", id_shift: 1, divisi: "Tata Usaha" },
        "PTT",
      ),
    );
    expect(
      await hitung(`SELECT COUNT(*) FROM master_data WHERE id_unik = '${t}';`),
    ).toBe(1);
    expect(
      await hitung(
        `SELECT COUNT(*) FROM hr_kontrak WHERE id_karyawan = '${t}';`,
      ),
    ).toBe(1);

    // Guru: klaim lalu gagal (shift tidak ada), lalu Lanjutkan.
    expect(
      await galat(
        jadikan(hire(ani, "jadikan", { nama: "Ani", id_shift: 999 }, "GTY")),
      ),
    ).not.toBeNull();
    const g = guru.id_unik;
    expect(await klaim(ani)).toBe(g);
    expect(
      await hitung(`SELECT COUNT(*) FROM master_data WHERE id_unik = '${g}';`),
    ).toBe(0);
    await jadikan(hire(ani, "lanjutkan", { nama: "Ani" }, "GTY"));
    expect(
      await hitung(
        `SELECT COUNT(*) FROM master_data WHERE id_unik = '${g}' AND jenis_personil = 'GURU' AND qr_code = id_unik || '|' || token_absensi;`,
      ),
    ).toBe(1);
    expect(
      await hitung(
        `SELECT COUNT(*) FROM guru_data WHERE id_guru = '${g}' AND status_kepegawaian = 'GTY';`,
      ),
    ).toBe(1);
    expect(
      await hitung(`SELECT COUNT(*) FROM id_card WHERE id_unik = '${g}';`),
    ).toBe(1);
    expect(
      await hitung(
        `SELECT COUNT(*) FROM hr_kontrak WHERE id_kontrak = '${guru.id_kontrak}';`,
      ),
    ).toBe(1);
  });
});
