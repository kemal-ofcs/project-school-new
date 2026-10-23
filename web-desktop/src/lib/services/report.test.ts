import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { type Client, createClient } from "@libsql/client";
import { initDatabaseSchema } from "@/lib/db-schema";

mock.module("server-only", () => ({}));

const client: Client = createClient({ url: "file::memory:" });

// Layanan laporan memakai klien tingkat modul; mock ini mengarahkannya ke
// database sementara dengan skema cloud asli, pola `attendance-dashboard.test.ts`.
mock.module("@/lib/db", () => ({
  db: client,
  ensureDbInitialized: async () => {},
}));

const { getLaporanKehadiran, rekapPerTanggal } = await import(
  "@/lib/services/report"
);

/**
 * IDENTIK dengan `FIXTURE_REKAP_PER_TANGGAL` di `administration.rs`, dan angka
 * yang diharapkan juga sama: kartu KPI dan tren dasbor punya dua implementasi
 * (TS untuk Web, Rust untuk Desktop/Mobile) yang wajib menghitung sama.
 *
 * Senin 2026-10-05: A dua sesi tepat waktu (dihitung sekali), B terlambat,
 * C Sakit, D Dispensasi, E Alfa.
 * Selasa 2026-10-06: A sesi kedua terlambat (terlambat bila SALAH SATU sesi
 * terlambat), F Dispen, G Alfa sistem + scan Hadir (Hadir menang), H Koreksi
 * Admin "Hadir" tanpa jam scan (hadir lewat status).
 * Minggu 2026-10-04 di luar rentang dan tidak boleh terhitung.
 */
const FIXTURE_REKAP_PER_TANGGAL = `
INSERT INTO absensi_harian (
  tanggal, id_karyawan, nama, kelas_divisi, jam_masuk, jam_pulang,
  status_kehadiran, status_absen, sumber, update_terakhir,
  menit_terlambat, id_shift, bulan, tahun, id_sesi
) VALUES
  ('2026-10-04', 'A', 'A', 'X', '07:00', '', 'Hadir', 'Masuk', 'Scanner', '2026-10-04 07:00:00', 0, 1, 'Oktober', 2026, 'a-04'),
  ('2026-10-05', 'A', 'A', 'X', '07:00', '', 'Hadir', 'Masuk', 'Scanner', '2026-10-05 07:00:00', 0, 1, 'Oktober', 2026, 'a-05-1'),
  ('2026-10-05', 'A', 'A', 'X', '', '15:00', 'Hadir', 'Pulang', 'Scanner', '2026-10-05 15:00:00', 0, 1, 'Oktober', 2026, 'a-05-2'),
  ('2026-10-05', 'B', 'B', 'X', '07:20', '', 'Hadir', 'Masuk', 'Scanner', '2026-10-05 07:20:00', 20, 1, 'Oktober', 2026, 'b-05'),
  ('2026-10-05', 'C', 'C', 'X', '', '', 'Sakit', 'Izin', 'Koreksi Admin', '2026-10-05 08:00:00', 0, 1, 'Oktober', 2026, 'c-05'),
  ('2026-10-05', 'D', 'D', 'X', '', '', 'Dispensasi', 'Izin', 'Koreksi Admin', '2026-10-05 08:00:00', 0, 1, 'Oktober', 2026, 'd-05'),
  ('2026-10-05', 'E', 'E', 'X', '', '', 'Alfa', 'Alfa', 'Generate Sistem', '2026-10-05 23:00:00', 0, 1, 'Oktober', 2026, 'e-05'),
  ('2026-10-06', 'A', 'A', 'X', '07:00', '', 'Hadir', 'Masuk', 'Scanner', '2026-10-06 07:00:00', 0, 1, 'Oktober', 2026, 'a-06-1'),
  ('2026-10-06', 'A', 'A', 'X', '13:10', '', 'Hadir', 'Masuk', 'Scanner', '2026-10-06 13:10:00', 10, 1, 'Oktober', 2026, 'a-06-2'),
  ('2026-10-06', 'F', 'F', 'X', '', '', 'Dispen', 'Izin', 'Koreksi Admin', '2026-10-06 08:00:00', 0, 1, 'Oktober', 2026, 'f-06'),
  ('2026-10-06', 'G', 'G', 'X', '', '', 'Alfa', 'Alfa', 'Generate Sistem', '2026-10-06 23:00:00', 0, 1, 'Oktober', 2026, 'g-06-1'),
  ('2026-10-06', 'G', 'G', 'X', '06:55', '', 'Hadir', 'Masuk', 'Scanner', '2026-10-06 06:55:00', 0, 1, 'Oktober', 2026, 'g-06-2'),
  ('2026-10-06', 'H', 'H', 'X', '', '', 'Hadir', 'Masuk', 'Koreksi Admin', '2026-10-06 09:00:00', 0, 1, 'Oktober', 2026, 'h-06');
`;

/**
 * IDENTIK dengan `FIXTURE_LAPORAN_KEHADIRAN` di `administration.rs`. A aktif
 * (Guru), B nonaktif tetapi punya catatan di rentang, Z nonaktif tanpa
 * catatan. Libur 8 Oktober nonaktif; whitelist bertanggal 1 November di luar
 * rentang.
 */
const FIXTURE_LAPORAN_KEHADIRAN = `
INSERT INTO master_data (id_unik, kode_karyawan, nama, divisi, id_shift, status_aktif, jenis_personil) VALUES
  ('A', 'K-A', 'Ani', 'X', 1, 'Aktif', 'Guru'),
  ('B', 'K-B', 'Budi', 'X', 1, 'Nonaktif', 'Pegawai'),
  ('Z', 'K-Z', 'Zaki', 'X', 1, 'Nonaktif', 'Pegawai');
INSERT INTO tbl_hari_libur (tanggal, nama_libur, status_aktif) VALUES
  ('2026-10-07', 'Libur Uji', 1),
  ('2026-10-08', 'Libur Nonaktif', 0);
INSERT INTO hari_libur_whitelist (id, scope_type, scope_value, tanggal_libur, keterangan, status_aktif) VALUES
  ('w-semua', 'DIVISI', 'X', NULL, NULL, 1),
  ('w-luar', 'SHIFT', '1', '2026-11-01', NULL, 1);
`;

beforeAll(async () => {
  await initDatabaseSchema(client);
  await client.execute(FIXTURE_REKAP_PER_TANGGAL);
  await client.executeMultiple(FIXTURE_LAPORAN_KEHADIRAN);
});

afterAll(() => client.close());

describe("rekap kehadiran per tanggal (jalur Web)", () => {
  test("satu orang sekali per hari dan hasilnya sama dengan Rust", async () => {
    expect(await rekapPerTanggal("2026-10-05", "2026-10-11")).toEqual([
      {
        tanggal: "2026-10-05",
        tepat_waktu: 1,
        terlambat: 1,
        sakit_izin: 2,
        alfa: 1,
      },
      {
        tanggal: "2026-10-06",
        tepat_waktu: 2,
        terlambat: 1,
        sakit_izin: 1,
        alfa: 0,
      },
    ]);
  });
});

describe("data laporan kehadiran (jalur Web)", () => {
  const hari = (id: string, tanggal: string, n: number[]) => ({
    id,
    tanggal,
    hadir: n[0],
    telat: n[1],
    sakit: n[2],
    izin: n[3],
    dispensasi: n[4],
    alfa: n[5],
  });

  test("sesi digabung per hari dan personil disaring, sama dengan Rust", async () => {
    const hasil = await getLaporanKehadiran("2026-10-05", "2026-10-08");
    expect(hasil.personil.map((p) => [p.id, p.jenis, p.aktif])).toEqual([
      ["A", "Guru", 1],
      ["B", "Pegawai", 0],
    ]);
    expect(hasil.hari).toEqual([
      hari("A", "2026-10-05", [1, 0, 0, 0, 0, 0]),
      hari("A", "2026-10-06", [1, 10, 0, 0, 0, 0]),
      hari("B", "2026-10-05", [1, 20, 0, 0, 0, 0]),
      hari("C", "2026-10-05", [0, 0, 1, 0, 0, 0]),
      hari("D", "2026-10-05", [0, 0, 0, 0, 1, 0]),
      hari("E", "2026-10-05", [0, 0, 0, 0, 0, 1]),
      hari("F", "2026-10-06", [0, 0, 0, 0, 1, 0]),
      hari("G", "2026-10-06", [1, 0, 0, 0, 0, 1]),
      hari("H", "2026-10-06", [1, 0, 0, 0, 0, 0]),
    ]);
    expect(hasil.libur).toEqual([{ tanggal: "2026-10-07", nama: "Libur Uji" }]);
    expect(hasil.whitelist.map((w) => w.id)).toEqual(["w-semua"]);
  });

  test("rentang yang tidak sah ditolak sebelum menyentuh database", async () => {
    await expect(
      getLaporanKehadiran("2026-10-01", "2027-01-01"),
    ).rejects.toThrow("Rentang laporan paling panjang 92 hari.");
  });
});
