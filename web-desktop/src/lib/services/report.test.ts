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

const { rekapPerTanggal } = await import("@/lib/services/report");

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

beforeAll(async () => {
  await initDatabaseSchema(client);
  await client.execute(FIXTURE_REKAP_PER_TANGGAL);
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
