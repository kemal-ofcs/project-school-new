import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Client, createClient } from "@libsql/client";
import { initDatabaseSchema } from "@/lib/db-schema";
import type { Pembanding, StatusPph } from "@/lib/validations/pajak";

mock.module("server-only", () => ({}));

const { computePayrollRecap } = await import("./payroll-recap");
const { hitungPajakMasa } = await import("./payroll-calculator");
const P = await import("@/lib/validations/pajak");
const { default: TARIF } = await import(
  "@/lib/validations/tarif-payroll-bawaan.json"
);

// Data dan harapan yang SAMA dengan `tests_pajak` di `payroll/commands.rs`
// (`prd-hris.md` §6.9 langkah 3), dijalankan pada skema Web. Satu klien per
// berkas (pola `payroll-recap-hari-kerja.test.ts`).
let client: Client;
let testDirectory: string;

const run = (id: string, mulai: string, akhir: string, status: string) => ({
  sql: `INSERT INTO payroll_runs (id, idempotency_key, period_start, period_end, status, created_by)
        VALUES (?1, ?1, ?2, ?3, ?4, 'uji');`,
  args: [id, mulai, akhir, status],
});

const item = (
  idRun: string,
  orang: string,
  gross: number,
  pph: number,
  snapshot: unknown,
) => ({
  sql: `INSERT INTO payroll_items (id, payroll_run_id, id_karyawan, nama_karyawan, divisi,
          total_regular_hours, total_overtime_hours, total_overtime_index, rate_per_hour,
          basic_salary, overtime_salary, gross_salary, pph21_amount, net_salary, breakdown_snapshot)
        VALUES (?1 || '-' || ?2, ?1, ?2, 'Uji', 'Umum', 0, 0, 0, 0, ?3, 0, ?3, ?4, ?3, ?5);`,
  args: [idRun, orang, gross, pph, JSON.stringify(snapshot)],
});

const snapshotBaru = (bruto: number, bpjs: unknown) => ({
  pajak: { bruto_pajak: bruto, status: "tetap" },
  bpjs_masa: { dasar_run: bruto },
  bpjs,
});

const JP_EMP = [
  {
    id: "bpjs_jp_emp",
    component_code: "JP_EMP",
    component_name: "JP",
    rate_percentage: 1,
    wage_cap: 11_086_300,
    effective_date: "2026-03-01",
  },
];

const LAPIS = (
  TARIF.tabel.find((t) => t.nama === "tax_rules")?.baris ?? []
).map((b) => ({
  id: String(b[0]),
  category: String(b[1]),
  bracket_min: Number(b[2]),
  bracket_max: b[3] === null ? null : Number(b[3]),
  rate_percentage: Number(b[4]),
  effective_date: String(b[5]),
}));

async function pembanding(orang: string, periodStart: string) {
  const hasil = await client.execute({
    sql: P.RUN_TAHUN_SQL,
    args: [periodStart],
  });
  return hasil.rows
    .filter((r) => String(r.id_karyawan) === orang)
    .map((r) => ({
      masa: String(r.masa),
      gross_salary: Number(r.gross_salary),
      overtime_salary: Number(r.overtime_salary),
      pph21_amount: Number(r.pph21_amount),
      breakdown_snapshot: String(r.breakdown_snapshot),
    }));
}

/** Cermin `bayar` di tes Rust: gaji pokok `gross` tanpa komponen. */
function bayar(
  gross: number,
  [periodStart, periodEnd]: [string, string],
  status: StatusPph,
  ptkpAwalTahun: string,
  keluarPada: string | null,
  ringkas: Pembanding,
  bpjsRules: typeof JP_EMP,
) {
  return hitungPajakMasa(
    gross,
    gross,
    false,
    {
      period_start: periodStart,
      period_end: periodEnd,
      status,
      ptkp_awal_tahun: ptkpAwalTahun,
      keluar_pada: keluarPada,
      hari: 20,
      pembanding: ringkas,
    },
    bpjsRules,
    LAPIS,
  );
}

beforeAll(async () => {
  testDirectory = mkdtempSync(join(tmpdir(), "kos-payroll-pajak-"));
  client = createClient({ url: `file:${join(testDirectory, "test.db")}` });
  await initDatabaseSchema(client);
  const jp = [{ code: "JP_EMP", nominal: 80_000 }];
  const jht = [{ code: "JHT_EMP", nominal: 100_000 }];
  const desember = Array.from({ length: 11 }, (_, i) => {
    const bulan = String(i + 1).padStart(2, "0");
    return [
      run(`D${bulan}`, `2026-${bulan}-01`, `2026-${bulan}-28`, "PAID"),
      item(
        `D${bulan}`,
        "G2",
        10_000_000,
        200_000,
        i === 0 ? { bpjs: jht } : snapshotBaru(10_000_000, jht),
      ),
    ];
  }).flat();
  await client.batch(
    [
      run("R1", "2026-01-01", "2026-01-15", "DRAFT"),
      item("R1", "G1", 8_000_000, 120_000, snapshotBaru(8_000_000, jp)),
      run("RX", "2026-01-01", "2026-01-15", "REJECTED"),
      item("RX", "G1", 8_000_000, 999_999, snapshotBaru(8_000_000, jp)),
      run("R0", "2025-12-01", "2025-12-31", "PAID"),
      item("R0", "G1", 8_000_000, 120_000, snapshotBaru(8_000_000, jp)),
      run("RF", "2026-02-01", "2026-02-28", "DRAFT"),
      item("RF", "G1", 8_000_000, 120_000, snapshotBaru(8_000_000, jp)),
      ...desember,
      `INSERT INTO master_data (id_unik, kode_karyawan, nama, divisi, id_shift, status_aktif, jenis_personil, tanggal_selesai_aktif) VALUES
         ('G1', 'E1', 'Dua Run', 'Umum', 1, 'Aktif', 'Pegawai', NULL),
         ('G3', 'E3', 'Keluar', 'Umum', 1, 'Nonaktif', 'Pegawai', '2026-08-20'),
         ('G4', 'E4', 'Baru', 'Umum', 1, 'Aktif', 'Pegawai', NULL),
         ('G5', 'E5', 'Masih aktif', 'Umum', 1, 'Aktif', 'Pegawai', '2026-08-20'),
         ('G6', 'E6', 'Honorer', 'Guru', 1, 'Aktif', 'GURU', NULL);`,
      `INSERT INTO guru_data (id_guru, status_kepegawaian, created_at, updated_at)
         VALUES ('G6', 'Honorer', 'x', 'x');`,
      `INSERT INTO salary_configs (id, id_karyawan, rate_per_hour, ptkp_status, effective_date, created_by) VALUES
         ('s0', 'G1', 0, 'TK/0', '2025-01-01', 'uji'),
         ('s1', 'G3', 1, 'K/1', '2025-06-01', 'uji'),
         ('s2', 'G3', 1, 'K/2', '2026-05-01', 'uji'),
         ('s3', 'G4', 1, 'TK/1', '2026-03-01', 'uji'),
         ('s4', 'G4', 1, 'K/0', '2026-07-01', 'uji'),
         ('s6', 'G6', 0, 'TK/0', '2025-01-01', 'uji');`,
    ],
    "write",
  );
});

afterAll(async () => {
  client.close();
  await Bun.sleep(50);
  try {
    rmSync(testDirectory, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 50,
    });
  } catch {}
});

describe("PPh 21 dan BPJS per masa di jalur Web (cermin tests_pajak)", () => {
  test("dua run sebulan; REJECTED, tahun lalu, dan masa sesudahnya diabaikan", async () => {
    const items = await pembanding("G1", "2026-01-16");
    expect(items.length).toBe(1);
    const ringkas = P.ringkasPembanding(items, "2026-01", P.STATUS_TETAP);
    expect([ringkas.bruto_masa, ringkas.pph_masa, ringkas.run_masa]).toEqual([
      8_000_000, 120_000, 1,
    ]);
    const hasil = bayar(
      8_000_000,
      ["2026-01-16", "2026-01-31"],
      P.STATUS_TETAP,
      "TK/0",
      null,
      ringkas,
      JP_EMP,
    );
    expect(hasil.bpjs.karyawan).toBe(30_863);
    expect(hasil.pph.pph).toBe(1_000_000);
    expect([hasil.pph.bruto_masa, hasil.pph.tarif]).toEqual([16_000_000, 700]);
    expect(hasil.pph.tanda).toEqual([]);
  });

  test("masa Desember menghitung ulang setahun termasuk run lama", async () => {
    const ringkas = P.ringkasPembanding(
      await pembanding("G2", "2026-12-01"),
      "2026-12",
      P.STATUS_TETAP,
    );
    expect([ringkas.bruto_tahun, ringkas.masa_berbruto_lain]).toEqual([
      110_000_000, 11,
    ]);
    const p = bayar(
      10_000_000,
      ["2026-12-01", "2026-12-31"],
      P.STATUS_TETAP,
      "K/0",
      null,
      ringkas,
      [],
    ).pph;
    expect(p.metode).toBe(P.METODE_PASAL_17_TERAKHIR);
    expect([p.biaya_jabatan, p.iuran_pensiun, p.pkp]).toEqual([
      6_000_000, 1_100_000, 54_400_000,
    ]);
    expect([p.pph_setahun, p.pph]).toEqual([2_720_000, 520_000]);
    expect(p.tanda).toEqual(["rumus_lama"]);

    const honorer = bayar(
      2_400_000,
      ["2026-12-01", "2026-12-31"],
      P.STATUS_TIDAK_TETAP,
      "TK/0",
      null,
      ringkas,
      [],
    ).pph;
    expect([honorer.metode, honorer.pph]).toEqual([P.METODE_TER_BULANAN, 0]);
  });

  test("kolom konteks pajak dan personil keluar", async () => {
    const baca = async (id: string) => {
      const hasil = await client.execute({
        sql: `SELECT ${P.KOLOM_PAJAK_SQL} FROM master_data md WHERE md.id_unik = ?3;`,
        args: ["2026-08-01", "2026-08-31", id],
      });
      const r = hasil.rows[0];
      return [r?.keluar_pada, r?.ptkp_awal_tahun];
    };
    expect(await baca("G3")).toEqual(["2026-08-20", "K/1"]);
    expect(await baca("G4")).toEqual([null, "TK/1"]);
    expect(await baca("G5")).toEqual([null, "TK/0"]);

    const kosong = { ...P.PEMBANDING_KOSONG, bpjs_masa: {} };
    const agustus = bayar(
      17_500_000,
      ["2026-08-01", "2026-08-31"],
      P.STATUS_TETAP,
      "K/1",
      "2026-08-20",
      kosong,
      [],
    );
    expect(agustus.pph.metode).toBe(P.METODE_PASAL_17_TERAKHIR);
    expect(agustus.pph.ptkp).toBe(63_000_000);
    const juli = bayar(
      17_500_000,
      ["2026-07-01", "2026-07-31"],
      P.STATUS_TETAP,
      "K/1",
      "2026-08-20",
      kosong,
      [],
    );
    expect(juli.pph.metode).toBe(P.METODE_TER_BULANAN);
  });

  test("computePayrollRecap memakai run pembanding, status honorer, dan menulis kunci pajak", async () => {
    // Tunjangan tetap 8.000.000 sebagai seluruh bruto G1; BPJS hanya JP_EMP.
    // Honor honorer G6 2.400.000 tanpa tanda dasar BPJS.
    await client.batch(
      [
        "DELETE FROM bpjs_rules WHERE component_code <> 'JP_EMP';",
        `INSERT INTO payroll_components (id, name, category, calc_type, default_value, applies_to, is_active, dasar_bpjs)
         VALUES ('cmp-tetap', 'Tunjangan Tetap', 'ALLOWANCE', 'FIXED', 8000000, 'G1', 1, 1),
                ('cmp-honor', 'Honor', 'ALLOWANCE', 'FIXED', 2400000, 'G6', 1, 0);`,
      ],
      "write",
    );
    const rekap = await computePayrollRecap(client, "2026-01-16", "2026-01-31");
    const baris = rekap.find((r) => r.id_karyawan === "G1");
    expect(baris?.est_gross_salary).toBe(8_000_000);
    expect(baris?.est_bpjs_employee).toBe(30_863);
    expect(baris?.est_pph21).toBe(1_000_000);
    expect(baris?.est_net_salary).toBe(8_000_000 - 30_863 - 1_000_000);
    expect(baris?.pajak.tanda).toEqual(["komponen_per_run"]);
    const snapshot = JSON.parse(baris?.breakdown_snapshot ?? "{}");
    expect(snapshot.pajak.bruto_masa).toBe(16_000_000);
    expect(snapshot.bpjs_masa).toEqual({
      dasar_run: 8_000_000,
      dasar_masa: 16_000_000,
      tanda: [],
    });
    expect(snapshot.tax.rate_percentage).toBe(7);

    // Honorer, run setengah bulan: TER harian atas hari hadir. Tanpa absensi
    // dihitung 1 hari dan ditandai: 2.400.000 ≤ 2.500.000 → 0,5% = 12.000.
    const honorer = rekap.find((r) => r.id_karyawan === "G6");
    expect([
      honorer?.pajak.status,
      honorer?.pajak.metode,
      honorer?.pajak.tanda,
      honorer?.est_pph21,
      honorer?.est_bpjs_employee,
    ]).toEqual([
      P.STATUS_TIDAK_TETAP,
      P.METODE_TER_HARIAN,
      ["tanpa_hari"],
      12_000,
      0,
    ]);
    const bulanan = await computePayrollRecap(
      client,
      "2026-01-01",
      "2026-01-31",
    );
    const penuh = bulanan.find((r) => r.id_karyawan === "G6");
    expect([penuh?.pajak.metode, penuh?.pajak.tarif, penuh?.est_pph21]).toEqual(
      [P.METODE_TER_BULANAN, 0, 0],
    );
  });
});
