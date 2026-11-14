import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Client, createClient } from "@libsql/client";
import { initDatabaseSchema } from "@/lib/db-schema";
import { METODE_PASAL_17_TERAKHIR } from "@/lib/validations/pajak";

mock.module("server-only", () => ({}));

const { computePayrollRecap } = await import("@/lib/services/payroll-recap");

// HRIS Fase 4b (Q-85), pasangan Rust
// `rekap_gaji_memuat_pegawai_keluar_di_periode_terakhirnya`: pegawai keluar
// ikut rekap periode hari terakhirnya walau tanpa absensi, memicu Pasal 17
// masa terakhir, lalu tidak masuk periode berikutnya. Satu klien per berkas.
let client: Client;
let testDirectory: string;

beforeAll(async () => {
  testDirectory = mkdtempSync(join(tmpdir(), "kos-payroll-keluar-"));
  client = createClient({ url: `file:${join(testDirectory, "test.db")}` });
  await initDatabaseSchema(client);
  await client.execute(
    `INSERT INTO master_data (id_unik, kode_karyawan, nama, divisi, id_shift, jenis_personil, status_aktif, tanggal_selesai_aktif, id_keluar)
     VALUES ('P1', 'K1', 'Ani', 'TU', 1, 'Pegawai', 'Nonaktif', '2026-06-20', 'klr-1'),
            ('P2', 'K2', 'Budi', 'TU', 1, 'Pegawai', 'Nonaktif', '2026-06-20', NULL);`,
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

describe("rekap gaji dan pegawai keluar", () => {
  test("ikut periode hari terakhirnya saja, nonaktif manual tidak", async () => {
    const juni = await computePayrollRecap(client, "2026-06-01", "2026-06-30");
    expect(juni.map((r) => r.id_karyawan)).toEqual(["P1"]);
    expect(juni[0]?.pajak.metode).toBe(METODE_PASAL_17_TERAKHIR);
    expect(
      await computePayrollRecap(client, "2026-07-01", "2026-07-31"),
    ).toEqual([]);
  });
});
