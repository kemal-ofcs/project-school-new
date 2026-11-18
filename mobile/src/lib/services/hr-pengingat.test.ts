import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Client, createClient } from "@libsql/client";
import type { OperatorUser } from "@/lib/auth/operator-user";
import { runDatabaseMigrations } from "@/lib/db-migrations";
import { initDatabaseSchema } from "@/lib/db-schema";
import type { PermissionKey } from "@/lib/rbac/catalog";
import type { ItemPengingat } from "@/lib/validations/hr-pengingat";
import vektor from "@/lib/validations/hr-pengingat.vektor.json";
import { HARI_INI_SQL } from "@/lib/validations/hris";

mock.module("server-only", () => ({}));

const S = await import("./hr-pengingat");

// Pemuat Web pada skema Web sungguhan. Pasangan Rust: `hr_pengingat_muat_cloud`
// di `hr_pengingat.rs`, dengan data `muat` yang sama.
let client: Client;
let testDirectory: string;

const ringkas = (items: readonly ItemPengingat[]) =>
  items.map((i) => [i.kejadian, i.id_karyawan, i.sisa, i.kunci.split(":")[0]]);

beforeAll(async () => {
  testDirectory = mkdtempSync(join(tmpdir(), "kos-pengingat-"));
  client = createClient({ url: `file:${join(testDirectory, "test.db")}` });
  await initDatabaseSchema(client);
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

describe("hr-pengingat: pemuat cloud", () => {
  test("data muat: hasil dan penyaring kepala unit sama dengan Rust", async () => {
    const hariIni = String(
      (await client.execute(HARI_INI_SQL)).rows[0]?.hari_ini ?? "",
    );
    for (const sql of vektor.muat.sql)
      await client.execute({
        sql,
        args: sql.includes("?1") ? [hariIni] : [],
      });
    const { hari_ini, items } = await S.muatPengingat(client);
    expect(hari_ini).toBe(hariIni);
    expect(ringkas(items)).toEqual(vektor.muat.hasil);

    const kepala: OperatorUser = {
      id: 1,
      kode_operator: "KS",
      nama_operator: "Kepala SMP",
      username: "kepala",
      role: "Uji",
      roleId: 9,
      roleKey: "uji",
      isSuperadmin: false,
      permissions: vektor.muat.kepala_smp.izin as PermissionKey[],
      permissionRevision: 1,
      idKaryawan: "KS",
    };
    const kartu = await S.perluPerhatian(client, kepala);
    expect(ringkas(kartu.items)).toEqual(vektor.muat.kepala_smp.hasil);
  });
});
