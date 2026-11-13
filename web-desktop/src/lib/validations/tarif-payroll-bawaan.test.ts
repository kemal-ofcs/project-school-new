import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Client, createClient } from "@libsql/client";
import {
  KOREKSI_JP_SQL,
  KOREKSI_PAJAK_SQL,
  koreksiJpArgs,
  koreksiPajakArgs,
  runDatabaseMigrations,
} from "@/lib/db-migrations";
import { initDatabaseSchema } from "@/lib/db-schema";
import TARIF from "./tarif-payroll-bawaan.json";

// Berkas sungguhan, satu klien per berkas (pola `inventory.test.ts`).
let client: Client;
let testDirectory: string;

beforeAll(async () => {
  testDirectory = mkdtempSync(join(tmpdir(), "kos-tarif-payroll-"));
  client = createClient({ url: `file:${join(testDirectory, "test.db")}` });
  await initDatabaseSchema(client);
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
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !("code" in error) ||
      error.code !== "EBUSY"
    ) {
      throw error;
    }
  }
});

async function jumlah(sql: string): Promise<number> {
  const result = await client.execute(sql);
  return Number(result.rows[0]?.n ?? 0);
}

describe("tarif payroll bawaan di database Web", () => {
  test("database baru memakai tarif yang sama dengan seed Rust", async () => {
    // Angka ini dicek juga oleh `tarif_bawaan_lengkap_dan_tidak_memuat_id_lama`
    // di `payroll_seed.rs`.
    expect(TARIF.tabel.map((tabel) => tabel.baris.length)).toEqual([5, 130, 8]);
    expect(
      await jumlah(
        "SELECT COUNT(*) AS n FROM tax_rules WHERE category = 'TER_A';",
      ),
    ).toBeGreaterThan(0);
    expect(
      await jumlah(
        "SELECT COUNT(*) AS n FROM bpjs_rules WHERE id = 'bpjs_jkk_co' AND rate_percentage = 0.54;",
      ),
    ).toBe(1);
    expect(
      await jumlah(
        "SELECT COUNT(*) AS n FROM tax_rules WHERE id = 'tax-p17-1';",
      ),
    ).toBe(0);
  });

  test("migrasi membersihkan id lama dan tidak menimpa tarif yang disesuaikan", async () => {
    await client.batch(
      [
        "INSERT INTO tax_rules (id, category, bracket_min, bracket_max, rate_percentage, effective_date) VALUES ('tax-p17-1', 'PASAL_17', 0, 60000000, 5.0, '2024-01-01');",
        "UPDATE bpjs_rules SET rate_percentage = 0.89 WHERE id = 'bpjs_jkk_co';",
      ],
      "write",
    );
    await runDatabaseMigrations(client);
    expect(
      await jumlah(
        "SELECT COUNT(*) AS n FROM tax_rules WHERE id = 'tax-p17-1';",
      ),
    ).toBe(0);
    expect(
      await jumlah(
        "SELECT COUNT(*) AS n FROM bpjs_rules WHERE id = 'bpjs_jkk_co' AND rate_percentage = 0.89;",
      ),
    ).toBe(1);
  });

  test("v67 mengoreksi TER B/C dan batas JP seed lama, bukan suntingan admin", async () => {
    await client.batch(
      [
        ...TARIF.koreksi_v67.pajak_lama.map((lama) => ({
          sql: "UPDATE tax_rules SET bracket_min = ?, bracket_max = ?, rate_percentage = ? WHERE id = ?;",
          args: [
            lama.bracket_min,
            lama.bracket_max,
            lama.rate_percentage,
            lama.id,
          ],
        })),
        "DELETE FROM tax_rules WHERE id IN ('tax_ter_b_38', 'tax_ter_b_39', 'tax_ter_b_40', 'tax_ter_c_40', 'tax_ter_c_41');",
        "UPDATE tax_rules SET rate_percentage = 2.75 WHERE id = 'tax_ter_b_8';",
        "UPDATE bpjs_rules SET wage_cap = 10042300, effective_date = '2026-01-01' WHERE component_code = 'JP_EMP';",
        "UPDATE bpjs_rules SET wage_cap = 9999999, effective_date = '2026-01-01' WHERE component_code = 'JP_CO';",
        "ALTER TABLE payroll_components DROP COLUMN dasar_bpjs;",
        "DELETE FROM schema_migration WHERE version = 67;",
      ],
      "write",
    );
    await runDatabaseMigrations(client);

    expect(
      await jumlah(
        "SELECT COUNT(*) AS n FROM tax_rules WHERE category LIKE 'TER_%';",
      ),
    ).toBe(125);
    const pajak = TARIF.tabel.find((tabel) => tabel.nama === "tax_rules");
    for (const baris of pajak?.baris ?? []) {
      if (baris[0] === "tax_ter_b_8") continue;
      const hasil = await client.execute({
        sql: "SELECT bracket_min, bracket_max, rate_percentage FROM tax_rules WHERE id = ?;",
        args: [baris[0]],
      });
      const r = hasil.rows[0];
      expect([
        baris[0],
        r?.bracket_min,
        r?.bracket_max,
        r?.rate_percentage,
      ]).toEqual([baris[0], baris[2], baris[3], baris[4]]);
    }
    expect(
      await jumlah(
        "SELECT COUNT(*) AS n FROM tax_rules WHERE id = 'tax_ter_b_8' AND rate_percentage = 2.75;",
      ),
    ).toBe(1);
    expect(
      await jumlah(
        "SELECT COUNT(*) AS n FROM bpjs_rules WHERE component_code = 'JP_EMP' AND wage_cap = 11086300 AND effective_date = '2026-03-01';",
      ),
    ).toBe(1);
    expect(
      await jumlah(
        "SELECT COUNT(*) AS n FROM bpjs_rules WHERE component_code = 'JP_CO' AND wage_cap = 9999999;",
      ),
    ).toBe(1);
    expect(
      await jumlah(
        "SELECT COUNT(*) AS n FROM pragma_table_info('payroll_components') WHERE name = 'dasar_bpjs';",
      ),
    ).toBe(1);

    // Sekali per database: suntingan sesudah v67 tidak dikoreksi lagi.
    await client.execute(
      "UPDATE bpjs_rules SET wage_cap = 10042300 WHERE component_code = 'JP_EMP';",
    );
    await runDatabaseMigrations(client);
    expect(
      await jumlah(
        "SELECT COUNT(*) AS n FROM bpjs_rules WHERE component_code = 'JP_EMP' AND wage_cap = 10042300;",
      ),
    ).toBe(1);
  });

  test("SQL dan argumen koreksi kembar dengan payroll_seed.rs", () => {
    expect(koreksiPajakArgs().length).toBe(55);
    expect(koreksiJpArgs()).toEqual([
      [11086300, "2026-03-01", "JP_EMP", 10042300],
      [11086300, "2026-03-01", "JP_CO", 10042300],
    ]);
    // Berkas ini ikut tersalin ke Mobile, yang memegang `mobile/payroll_seed.rs`.
    const lokasi = ["desktop", "mobile"]
      .map((dir) =>
        join(import.meta.dir, `../../../src-tauri/src/${dir}/payroll_seed.rs`),
      )
      .find(existsSync);
    expect(lokasi).toBeDefined();
    const rust = readFileSync(lokasi ?? "", "utf8");
    for (const sql of [KOREKSI_PAJAK_SQL, KOREKSI_JP_SQL]) {
      expect(rust).toContain(JSON.stringify(sql));
    }
  });
});
