import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Client, createClient } from "@libsql/client";
import type { OperatorUser } from "@/lib/auth/operator-user";
import { runDatabaseMigrations } from "@/lib/db-migrations";
import { initDatabaseSchema } from "@/lib/db-schema";
import type { PermissionKey } from "@/lib/rbac/catalog";
import {
  PESAN_DI_LUAR_CAKUPAN,
  PESAN_DIRI_SENDIRI,
} from "@/lib/validations/hr-keluar";
import * as K from "@/lib/validations/hr-kinerja";
import {
  PREDIKAT_BAWAAN,
  type TemplateDraft,
  TIPE_KEHADIRAN,
  TIPE_MANUAL,
} from "@/lib/validations/hr-kinerja";

mock.module("server-only", () => ({}));

const S = await import("./hr-kinerja");

// Jalur Web template kinerja (HRIS Fase 5a) pada skema Web sungguhan.
// Pasangan Rust: `hr_kinerja_template_cloud` di `hr_kinerja.rs`, dengan data
// yang sama. Satu klien per berkas.
let client: Client;
let testDirectory: string;

const pengatur: OperatorUser = {
  id: 1,
  kode_operator: "UJI",
  nama_operator: "uji",
  username: "uji",
  role: "Uji",
  roleId: 9,
  roleKey: "uji",
  isSuperadmin: false,
  permissions: ["hr.performance.config"] as PermissionKey[],
  permissionRevision: 1,
  idKaryawan: null,
};

const galat = async (janji: Promise<unknown>) => {
  try {
    await janji;
    return null;
  } catch (error) {
    return (error as Error).message;
  }
};

const hitung = async (sql: string) =>
  Number((await client.execute(sql)).rows[0]?.[0] ?? -1);

beforeAll(async () => {
  testDirectory = mkdtempSync(join(tmpdir(), "kos-kinerja-"));
  client = createClient({ url: `file:${join(testDirectory, "test.db")}` });
  await initDatabaseSchema(client);
  // Migrasi diulang: seed tetap sekali.
  await runDatabaseMigrations(client);
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

describe("hr-kinerja: template di database Web", () => {
  test("seed dua template bawaan, 14 aspek, dan tgs-ka-tu sekali", async () => {
    expect(
      await hitung(
        "SELECT COUNT(*) FROM hr_kinerja_template WHERE is_bawaan = 1;",
      ),
    ).toBe(2);
    expect(await hitung("SELECT COUNT(*) FROM hr_kinerja_aspek;")).toBe(14);
    expect(
      await hitung(
        "SELECT COUNT(*) FROM hr_tugas_jenis WHERE id_jenis = 'tgs-ka-tu';",
      ),
    ).toBe(1);
    expect(
      await hitung("SELECT COUNT(*) FROM schema_migration WHERE version = 71;"),
    ).toBe(1);
    const data = await S.daftarTemplate(client);
    const guru = data.template.find((t) => t.id_template === "ktp-guru");
    expect(guru?.aspek).toHaveLength(8);
    expect(guru?.aspek.reduce((n, a) => n + a.bobot, 0)).toBe(100);
    expect(data.pengaturan.ambang).toEqual([950, 900, 800, 700]);
    expect(
      data.pengaturan.predikat.map((p) => `${p.ambang}:${p.nama}`).join("|"),
    ).toBe(PREDIKAT_BAWAAN);
  });

  test("satu bawaan per kelompok, kelompok dan tipe terkunci, aspek tidak dihapus", async () => {
    const aspek = (nama: string, tipe: string, bobot: number) => ({
      nama,
      tipe,
      bobot,
      is_aktif: true,
    });
    const { id_template: id } = await S.simpanTemplate(client, pengatur, {
      nama: "Satpam",
      kelompok: "Tendik",
      is_bawaan: true,
      is_aktif: true,
      aspek: [
        aspek("Kehadiran", TIPE_KEHADIRAN, 40),
        aspek("Kewaspadaan", TIPE_MANUAL, 60),
      ],
    });
    expect(id.startsWith("ktp-")).toBe(true);
    expect(
      await hitung(
        "SELECT is_bawaan FROM hr_kinerja_template WHERE id_template = 'ktp-tendik';",
      ),
    ).toBe(0);
    expect(
      await hitung(
        "SELECT is_bawaan FROM hr_kinerja_template WHERE id_template = 'ktp-guru';",
      ),
    ).toBe(1);
    // Migrasi ulang tidak mengembalikan bawaan seed.
    await runDatabaseMigrations(client);
    expect(
      await hitung(
        "SELECT is_bawaan FROM hr_kinerja_template WHERE id_template = 'ktp-tendik';",
      ),
    ).toBe(0);

    const tersimpan = (
      await client.execute({
        sql: "SELECT id_aspek FROM hr_kinerja_aspek WHERE id_template = ? ORDER BY urutan;",
        args: [id],
      })
    ).rows.map((r) => String(r.id_aspek));
    const ubah = (
      nama: string,
      kelompok: string,
      tipePertama: string,
      denganKedua: boolean,
    ): TemplateDraft => ({
      id_template: id,
      nama,
      kelompok,
      is_bawaan: true,
      is_aktif: true,
      aspek: [
        {
          id_aspek: tersimpan[0],
          nama: "Kehadiran",
          tipe: tipePertama,
          bobot: 40,
          is_aktif: true,
        },
        denganKedua
          ? {
              id_aspek: tersimpan[1],
              nama: "Kewaspadaan",
              tipe: TIPE_MANUAL,
              bobot: 60,
              is_aktif: true,
            }
          : aspek("Ronda", TIPE_MANUAL, 60),
      ],
    });
    expect(
      await galat(
        S.simpanTemplate(
          client,
          pengatur,
          ubah("Satpam", "Guru", TIPE_KEHADIRAN, true),
        ),
      ),
    ).toBe("Kelompok template tidak bisa diubah.");
    expect(
      await galat(
        S.simpanTemplate(
          client,
          pengatur,
          ubah("Satpam", "Tendik", TIPE_MANUAL, true),
        ),
      ),
    ).toBe('Tipe aspek "Kehadiran" tidak bisa diubah.');
    expect(
      await galat(
        S.simpanTemplate(
          client,
          pengatur,
          ubah("Satpam", "Tendik", TIPE_KEHADIRAN, false),
        ),
      ),
    ).toBe("Aspek tidak bisa dihapus; nonaktifkan saja.");
    expect(
      await galat(
        S.simpanTemplate(
          client,
          pengatur,
          ubah("penilaian kinerja guru", "Tendik", TIPE_KEHADIRAN, true),
        ),
      ),
    ).toBe('Nama "penilaian kinerja guru" sudah dipakai template lain.');
    await S.simpanTemplate(
      client,
      pengatur,
      ubah("Satpam Malam", "Tendik", TIPE_KEHADIRAN, true),
    );
    expect(
      await hitung(
        "SELECT COUNT(*) FROM hr_kinerja_aspek WHERE id_template = (SELECT id_template FROM hr_kinerja_template WHERE nama = 'Satpam Malam');",
      ),
    ).toBe(2);
    expect(
      await galat(
        S.simpanTemplate(client, pengatur, {
          id_template: "ktp-tidak-ada",
          nama: "X",
          kelompok: "Guru",
          is_bawaan: false,
          is_aktif: true,
          aspek: [aspek("A", TIPE_MANUAL, 100)],
        }),
      ),
    ).toBe("Template kinerja tidak ditemukan.");
  });

  test("pengaturan tiga kunci sekaligus; salah satu rusak = tidak ada yang tertulis", async () => {
    expect(
      await galat(
        S.simpanPengaturanKinerja(client, {
          ambang: "900,800,700,600",
          predikat: "0:A",
          tanpa_kbm: "",
        }),
      ),
    ).toBe(
      "Predikat harus 2 sampai 7 pasangan nilai:nama dengan nilai turun dari 10000 dan yang terakhir 0.",
    );
    expect(
      await hitung(
        "SELECT COUNT(*) FROM setting_gex_system WHERE key LIKE 'hr_kinerja_%';",
      ),
    ).toBe(0);
    const hasil = await S.simpanPengaturanKinerja(client, {
      ambang: "900,800,700,600",
      predikat: "9000:A|0:B",
      tanpa_kbm: "2026-12-01..2026-12-12:PAS",
    });
    expect(hasil).toEqual({
      ambang: [900, 800, 700, 600],
      predikat: [
        { ambang: 9000, nama: "A" },
        { ambang: 0, nama: "B" },
      ],
      tanpa_kbm: [{ mulai: "2026-12-01", selesai: "2026-12-12", nama: "PAS" }],
    });
  });
});

// Alur 5b, pasangan `hr_kinerja_penilaian_cloud` di `hr_kinerja.rs` dengan
// data (`DATA_PENILAIAN_SQL`) dan angka yang sama.
const DATA_PENILAIAN_SQL = `
  INSERT INTO tbl_shift (id_shift, kode_shift, nama_shift, jam_masuk, jam_pulang, jam_kerja_normal_menit, hari_kerja) VALUES (77, 77, 'Lima hari', '07:00', '15:00', 420, '1,2,3,4,5');
  INSERT INTO master_data (id_unik, kode_karyawan, nama, divisi, id_shift, jenis_personil, unit, tanggal_daftar, status_aktif, id_keluar, tanggal_selesai_aktif) VALUES
    ('G1', 'K-G1', 'Guru Satu', 'Guru', 77, 'GURU', 'SMP', '2020-01-01', 'Aktif', NULL, NULL),
    ('K1', 'K-K1', 'Kepala SMP', 'Guru', 77, 'GURU', 'SMP', '2015-01-01', 'Aktif', NULL, NULL),
    ('G2', 'K-G2', 'Guru SD', 'Guru', 77, 'GURU', 'SD', '2020-01-01', 'Aktif', NULL, NULL),
    ('G3', 'K-G3', 'Guru Keluar', 'Guru', 77, 'GURU', 'SMP', '2020-01-01', 'Nonaktif', 'klr-1', '2024-01-10'),
    ('Y1', 'K-Y1', 'Ketua Yayasan', 'Yayasan', 77, 'Pegawai', '', '2010-01-01', 'Aktif', NULL, NULL);
  INSERT INTO akademik_tahun_ajaran (id_tahun_ajaran, nama_tahun, semester, tanggal_mulai, tanggal_selesai, is_aktif, created_at, updated_at) VALUES
    ('ta-1', '2023/2024', 'Ganjil', '2023-07-17', '2023-12-22', 0, 'x', 'x'),
    ('ta-2', '2023/2024', 'Genap', '2024-01-08', '2024-01-19', 0, 'x', 'x');
  INSERT INTO tbl_hari_libur (tanggal, nama_libur, status_aktif) VALUES ('2024-01-11', 'Libur uji', 1);
  INSERT INTO hr_tugas_tambahan (id_tugas, id_karyawan, id_jenis, unit, tahun_ajaran, tanggal_mulai) VALUES ('tt-1', 'K1', 'tgs-kepsek', 'SMP', '2023/2024', '2023-07-01');
  INSERT INTO absensi_harian (tanggal, id_karyawan, nama, kelas_divisi, jam_masuk, status_kehadiran, status_absen, sumber, update_terakhir, menit_terlambat, id_shift, bulan, tahun, id_sesi) VALUES
    ('2024-01-08', 'G1', 'Guru Satu', 'Guru', '06:55', 'Hadir', 'Masuk', 'Scanner', 'x', 0, 77, 'Januari', 2024, 's-08'),
    ('2024-01-09', 'G1', 'Guru Satu', 'Guru', '06:50', 'Hadir', 'Masuk', 'Scanner', 'x', 0, 77, 'Januari', 2024, 's-09'),
    ('2024-01-10', 'G1', 'Guru Satu', 'Guru', '07:15', 'Terlambat', 'Masuk', 'Scanner', 'x', 15, 77, 'Januari', 2024, 's-10'),
    ('2024-01-12', 'G1', 'Guru Satu', 'Guru', '06:58', 'Hadir', 'Masuk', 'Scanner', 'x', 0, 77, 'Januari', 2024, 's-12'),
    ('2024-01-15', 'G1', 'Guru Satu', 'Guru', '06:57', 'Hadir', 'Masuk', 'Scanner', 'x', 0, 77, 'Januari', 2024, 's-15'),
    ('2024-01-16', 'G1', 'Guru Satu', 'Guru', '09:40', 'Terlambat', 'Masuk', 'Scanner', 'x', 160, 77, 'Januari', 2024, 's-16'),
    ('2024-01-17', 'G1', 'Guru Satu', 'Guru', '', 'Alfa', 'Alfa', 'Generate Sistem', 'x', 0, 77, 'Januari', 2024, 's-17');
  INSERT INTO hr_pengajuan (id_pengajuan, id_karyawan, id_jenis, kelompok, potong_jatah, dampak_gaji, izin_pemutus, tanggal_mulai, tanggal_selesai, jam_mulai_ke, jam_sampai_ke, setengah_hari, alasan, sidik, diajukan_oleh, waktu_perangkat) VALUES
    ('pgn-1', 'G1', 'jns-izin', 'Izin', 0, 'Dibayar', 'hr.request.decide', '2024-01-16', '2024-01-16', 1, 3, 0, 'urusan keluarga', 's1', 'tu', 'x'),
    ('pgn-2', 'G1', 'jns-dl', 'Dinas Luar', 0, 'Dibayar', 'hr.request.decide', '2024-01-19', '2024-01-19', NULL, NULL, 0, 'lomba', 's2', 'tu', 'x'),
    ('pgn-3', 'G1', 'jns-cuti', 'Cuti', 1, 'Dibayar', 'hr.request.decide', '2024-01-18', '2024-01-18', NULL, NULL, 0, 'cuti', 's3', 'tu', 'x');
  INSERT INTO hr_pengajuan_keputusan (id_keputusan, id_pengajuan, jenis, sidik, oleh, waktu_perangkat) VALUES
    ('pk-1', 'pgn-1', 'Setujui', 's1', 'kepsek', 'x'), ('pk-2', 'pgn-2', 'Setujui', 's2', 'kepsek', 'x');
`;

const sesi = (
  izin: string[],
  idKaryawan: string,
  username: string,
): OperatorUser => ({
  ...pengatur,
  username,
  permissions: izin as PermissionKey[],
  idKaryawan,
});

describe("hr-kinerja: alur penilaian di database Web", () => {
  test("KINERJA_HARI_SQL = kolom LAPORAN_KEHADIRAN_SQL.hari", async () => {
    const { LAPORAN_KEHADIRAN_SQL } = await import("./report");
    const rapat = (s: string) => s.replace(/\s+/g, "");
    const kolom = rapat(LAPORAN_KEHADIRAN_SQL.hari).split("WHERE")[0] as string;
    expect(kolom.endsWith("FROMabsensi_harian")).toBe(true);
    expect(rapat(K.KINERJA_HARI_SQL)).toContain(kolom);
    expect(rapat(K.KINERJA_HARI_SQL)).toContain("WHEREid_karyawan=?3AND");
  });

  test("buat, tumpang tindih, ajukan, kembalikan, final, koreksi, wewenang", async () => {
    // Tes pengaturan di atas menulis ambang lain; kembali ke bawaan.
    await client.execute(
      "DELETE FROM setting_gex_system WHERE key LIKE 'hr_kinerja_%';",
    );
    await client.executeMultiple(DATA_PENILAIAN_SQL);
    const kepsek = sesi(["hr.performance.assess"], "K1", "kepsek");
    const yayasan = sesi(
      [
        "hr.performance.view",
        "hr.performance.assess",
        "hr.performance.finalize",
        "hr.scope.all",
      ],
      "Y1",
      "yayasan",
    );
    const buat = (id: string, jenis: string, kunci: string) => ({
      aksi: "Buat",
      id_karyawan: id,
      periode_jenis: jenis,
      periode_kunci: kunci,
    });

    const { id_penilaian: id } = await S.simpanKinerja(
      client,
      kepsek,
      buat("G1", "Semester", "ta-2"),
    );
    const rincianAwal = "K|9|6|1|1|1|0|722|950,900,800,700|2024-01-19";
    const kehadiran = (
      await client.execute({
        sql: "SELECT skor, skor_hitung, rincian FROM hr_kinerja_nilai WHERE id_penilaian = ?1 AND tipe = 'Otomatis Kehadiran';",
        args: [id],
      })
    ).rows[0];
    expect([
      Number(kehadiran?.skor),
      Number(kehadiran?.skor_hitung),
      kehadiran?.rincian,
    ]).toEqual([2, 2, rincianAwal]);
    expect(
      await galat(
        S.simpanKinerja(
          client,
          kepsek,
          buat("G1", "Tahun Ajaran", "2023/2024"),
        ),
      ),
    ).toBe(
      "Pegawai ini sudah punya penilaian untuk periode 2024-01-08 s.d. 2024-01-19.",
    );

    const rinci = await S.rincianKinerja(client, kepsek, id);
    expect(rinci.status).toBe("Draf");
    expect(rinci.penilai_bawaan?.id).toBe("K1");
    expect(rinci.tanda).toContain("pengajuan_menunggu");
    expect(rinci.tanda).toContain("otomatis_manual");
    expect(rinci.kehadiran?.tanggal_kosong).toEqual(["2024-01-18"]);

    const isian = (denganCatatan: boolean) => ({
      aksi: "Simpan",
      id_penilaian: id,
      catatan: "Baik",
      nilai: rinci.nilai
        .filter((b) => b.tipe !== TIPE_KEHADIRAN)
        .map((b) => ({
          id_aspek: b.id_aspek,
          skor: 4,
          catatan:
            b.tipe !== TIPE_MANUAL && denganCatatan ? "dari supervisi" : null,
        })),
    });
    expect(await galat(S.simpanKinerja(client, kepsek, isian(false)))).toBe(
      'Aspek "Keterisian presensi kelas" belum bisa dihitung otomatis; beri catatan alasan skornya.',
    );
    await S.simpanKinerja(client, kepsek, isian(true));

    const aspekK = rinci.nilai.find((b) => b.tipe === TIPE_KEHADIRAN)
      ?.id_aspek as string;
    const ajukan = (r: string, target = id) => ({
      id_penilaian: target,
      jenis: "Ajukan",
      rincian: { [aspekK]: r },
    });
    await client.execute(
      "INSERT INTO absensi_harian (tanggal, id_karyawan, nama, kelas_divisi, jam_masuk, status_kehadiran, status_absen, sumber, update_terakhir, menit_terlambat, id_shift, bulan, tahun, id_sesi) VALUES ('2024-01-18', 'G1', 'Guru Satu', 'Guru', '06:59', 'Hadir', 'Masuk', 'Scanner', 'x', 0, 77, 'Januari', 2024, 's-18');",
    );
    expect(
      await galat(S.putuskanKinerja(client, kepsek, ajukan(rincianAwal))),
    ).toBe(K.PESAN_OTOMATIS_BERUBAH);
    const rincianBaru = "K|9|7|1|1|0|0|833|950,900,800,700|2024-01-19";
    expect(
      (await S.rincianKinerja(client, kepsek, id)).hidup[TIPE_KEHADIRAN]
        ?.rincian,
    ).toBe(rincianBaru);
    await S.putuskanKinerja(client, kepsek, ajukan(rincianBaru));

    const putus = (jenis: string, alasan: string) => ({
      id_penilaian: id,
      jenis,
      alasan,
    });
    expect(
      await galat(S.putuskanKinerja(client, kepsek, putus("Kembalikan", "x"))),
    ).toBe(K.PESAN_IZIN);
    expect(
      await galat(S.putuskanKinerja(client, yayasan, putus("Kembalikan", " "))),
    ).toBe("Alasan pengembalian wajib diisi.");
    await S.putuskanKinerja(
      client,
      yayasan,
      putus("Kembalikan", "lengkapi supervisi"),
    );
    await S.simpanKinerja(client, kepsek, isian(true));
    await S.putuskanKinerja(client, kepsek, ajukan(rincianBaru));
    const terkunci =
      "Penilaian yang sudah diajukan atau selesai tidak bisa disunting.";
    expect(await galat(S.simpanKinerja(client, kepsek, isian(true)))).toBe(
      terkunci,
    );

    // Final beku: 500 + 90 × 75 = 7250 = Cukup.
    await S.putuskanKinerja(client, yayasan, putus("Final", ""));
    const final = (
      await client.execute({
        sql: "SELECT nilai_akhir, predikat, urut FROM hr_kinerja_keputusan WHERE id_penilaian = ?1 AND jenis = 'Final';",
        args: [id],
      })
    ).rows[0];
    expect([
      Number(final?.nilai_akhir),
      final?.predikat,
      Number(final?.urut),
    ]).toEqual([7250, "Cukup", 4]);
    await client.execute(
      "UPDATE absensi_harian SET menit_terlambat = 0, status_kehadiran = 'Hadir' WHERE id_sesi = 's-10';",
    );
    const beku = await S.rincianKinerja(client, yayasan, id);
    expect([beku.status, beku.nilai_akhir]).toEqual(["Final", 7250]);
    expect(beku.tanda).toContain("otomatis_berubah");
    expect(await galat(S.simpanKinerja(client, kepsek, isian(true)))).toBe(
      terkunci,
    );

    const koreksi = (alasan: string) => ({
      aksi: "Koreksi",
      id_penilaian: id,
      alasan_koreksi: alasan,
    });
    expect(await galat(S.simpanKinerja(client, kepsek, koreksi("x")))).toBe(
      K.PESAN_IZIN,
    );
    expect(await galat(S.simpanKinerja(client, yayasan, koreksi(" ")))).toBe(
      "Alasan koreksi wajib diisi.",
    );
    const { id_penilaian: idKor } = await S.simpanKinerja(
      client,
      yayasan,
      koreksi("absensi 10 Jan dikoreksi"),
    );
    expect(await galat(S.simpanKinerja(client, yayasan, koreksi("lagi")))).toBe(
      "Penilaian ini masih punya koreksi yang belum selesai.",
    );
    const rinciKor = await S.rincianKinerja(client, yayasan, idKor);
    expect(rinciKor.penilaian.id_ref).toBe(id);
    const rincianKor = "K|9|8|0|1|0|0|888|950,900,800,700|2024-01-19";
    expect(rinciKor.hidup[TIPE_KEHADIRAN]?.rincian).toBe(rincianKor);
    await S.putuskanKinerja(client, yayasan, ajukan(rincianKor, idKor));
    await S.putuskanKinerja(client, yayasan, {
      id_penilaian: idKor,
      jenis: "Final",
    });
    expect((await S.rincianKinerja(client, yayasan, id)).berlaku).toBe(idKor);

    // Diri sendiri, unit lain, pegawai keluar.
    expect(
      await galat(
        S.simpanKinerja(client, kepsek, buat("K1", "Semester", "ta-2")),
      ),
    ).toBe(PESAN_DIRI_SENDIRI);
    const { id_penilaian: idK1 } = await S.simpanKinerja(
      client,
      yayasan,
      buat("K1", "Semester", "ta-2"),
    );
    expect(await galat(S.rincianKinerja(client, kepsek, idK1))).toBe(
      K.PESAN_BELUM_FINAL_SENDIRI,
    );
    expect(
      await galat(
        S.simpanKinerja(client, kepsek, buat("G2", "Semester", "ta-2")),
      ),
    ).toBe(PESAN_DI_LUAR_CAKUPAN);
    expect(
      await galat(
        S.simpanKinerja(client, yayasan, buat("G3", "Semester", "ta-2")),
      ),
    ).toBe("Pegawai ini sudah keluar; penilaian baru tidak bisa dibuat.");
    const periode = { periode_jenis: "Semester", periode_kunci: "ta-2" };
    const daftar = (await S.daftarKinerja(
      client,
      kepsek,
      periode,
    )) as K.DaftarKinerja;
    expect(daftar.penilaian.map((p) => p.id_karyawan)).toEqual(["G1", "G1"]);
    expect(daftar.belum_dinilai.map((p) => p.id_karyawan)).toEqual([
      "G2",
      "Y1",
    ]);

    const batal = (alasan: string) => ({
      id_penilaian: idK1,
      jenis: "Batal",
      alasan,
    });
    expect(await galat(S.putuskanKinerja(client, yayasan, batal("")))).toBe(
      "Alasan pembatalan wajib diisi.",
    );
    await S.putuskanKinerja(client, yayasan, batal("salah periode"));
    const daftarY = (await S.daftarKinerja(
      client,
      yayasan,
      periode,
    )) as K.DaftarKinerja;
    expect(daftarY.belum_dinilai.map((p) => p.id_karyawan)).toEqual([
      "G2",
      "K1",
    ]);
    const riwayat = (await S.daftarKinerja(client, yayasan, {
      id_karyawan: "G1",
    })) as K.RiwayatKinerja;
    expect(riwayat.penilaian.filter((p) => p.berlaku)).toHaveLength(1);
  });
});
