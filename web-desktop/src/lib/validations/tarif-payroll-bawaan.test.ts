import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Client, createClient } from "@libsql/client";
import { runDatabaseMigrations } from "@/lib/db-migrations";
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
    expect(TARIF.tabel.map((tabel) => tabel.baris.length)).toEqual([5, 125, 8]);
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
});
