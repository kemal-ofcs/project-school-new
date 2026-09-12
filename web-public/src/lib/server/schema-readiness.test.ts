import { describe, expect, test } from "bun:test";
import { createClient } from "@libsql/client";
import {
  assertSchemaReady,
  inspectSchemaReadiness,
  MINIMUM_SCHEMA_VERSION,
  REQUIRED_TABLES,
  SchemaNotReadyError,
} from "./schema-readiness";

/**
 * Database kosong di memori, lalu diisi persis sebanyak yang diminta tiap tes.
 *
 * Yang dijaga tes ini bukan sekadar "true/false"-nya, melainkan bahwa modul ini
 * TIDAK PERNAH membuat tabel. Sebuah regresi di sana tidak akan terlihat dari
 * UI mana pun — situsnya justru akan tampak bekerja — dan baru muncul berbulan
 * kemudian sebagai tabel dengan bentuk berbeda di satu pemasangan.
 */
function emptyDatabase() {
  return createClient({ url: ":memory:" });
}

async function seedSchema(
  client: ReturnType<typeof emptyDatabase>,
  version: number,
  tables: readonly string[] = REQUIRED_TABLES,
) {
  for (const table of tables) {
    if (table === "schema_migration") continue;
    await client.execute(`CREATE TABLE ${table} (id TEXT PRIMARY KEY);`);
  }
  await client.execute(
    "CREATE TABLE schema_migration (version INTEGER PRIMARY KEY, name TEXT, applied_at TEXT);",
  );
  await client.execute({
    sql: "INSERT INTO schema_migration (version, name, applied_at) VALUES (?, 'tes', datetime('now'));",
    args: [version],
  });
}

describe("inspectSchemaReadiness", () => {
  test("database kosong dilaporkan belum siap, bukan dibuatkan tabelnya", async () => {
    const client = emptyDatabase();

    const readiness = await inspectSchemaReadiness(client);

    expect(readiness.ready).toBe(false);
    expect(readiness.version).toBe(0);
    expect(readiness.missingTables).toEqual([...REQUIRED_TABLES]);

    // Inti tes ini: pemeriksaannya TIDAK boleh punya efek samping. Jalur
    // provisioning ketiga adalah cara paling pasti menghasilkan dua bentuk
    // tabel yang berbeda di dua pemasangan.
    const after = await client.execute(
      "SELECT COUNT(*) AS total FROM sqlite_master WHERE type = 'table';",
    );
    expect(Number(after.rows[0]?.total)).toBe(0);
  });

  test("skema lengkap pada versi minimum dilaporkan siap", async () => {
    const client = emptyDatabase();
    await seedSchema(client, MINIMUM_SCHEMA_VERSION);

    const readiness = await inspectSchemaReadiness(client);

    expect(readiness.ready).toBe(true);
    expect(readiness.version).toBe(MINIMUM_SCHEMA_VERSION);
    expect(readiness.missingTables).toEqual([]);
  });

  test("versi di atas minimum tetap diterima", async () => {
    const client = emptyDatabase();
    await seedSchema(client, MINIMUM_SCHEMA_VERSION + 5);

    // Panel admin menaikkan versinya setiap kali menambah tabel untuk
    // keperluannya sendiri. Situs publik tidak boleh mati karena itu.
    expect((await inspectSchemaReadiness(client)).ready).toBe(true);
  });

  test("versi di bawah minimum ditolak meski semua tabel ada", async () => {
    const client = emptyDatabase();
    await seedSchema(client, MINIMUM_SCHEMA_VERSION - 1);

    const readiness = await inspectSchemaReadiness(client);

    expect(readiness.ready).toBe(false);
    expect(readiness.missingTables).toEqual([]);
  });

  test("satu tabel hilang cukup untuk menolak", async () => {
    const client = emptyDatabase();
    // Semua tabel wajib KECUALI yang terakhir. Ditulis sebagai turunan dari
    // `REQUIRED_TABLES`, bukan daftar tersendiri, supaya tes ini tetap menguji
    // hal yang sama ketika daftarnya bertambah per fase.
    const kurangSatu = REQUIRED_TABLES.slice(0, -1);
    const yangHilang = REQUIRED_TABLES[REQUIRED_TABLES.length - 1];
    await seedSchema(client, MINIMUM_SCHEMA_VERSION, kurangSatu);

    const readiness = await inspectSchemaReadiness(client);

    expect(readiness.ready).toBe(false);
    expect(readiness.missingTables).toEqual([yangHilang as string]);
  });
});

describe("assertSchemaReady", () => {
  test("menyebut tabel yang hilang di dalam pesannya", async () => {
    const client = emptyDatabase();
    await seedSchema(client, MINIMUM_SCHEMA_VERSION, [
      "schema_migration",
      "company_profile",
    ]);

    const error = await assertSchemaReady(client).catch((caught) => caught);

    expect(error).toBeInstanceOf(SchemaNotReadyError);
    expect((error as SchemaNotReadyError).message).toContain(
      "setting_gex_system",
    );
    expect((error as SchemaNotReadyError).message).toContain(
      "akademik_jurusan",
    );
  });

  test("menyebut versi yang kurang, dan tindakan yang menyelesaikannya", async () => {
    const client = emptyDatabase();
    await seedSchema(client, MINIMUM_SCHEMA_VERSION - 2);

    const error = await assertSchemaReady(client).catch((caught) => caught);

    expect(error).toBeInstanceOf(SchemaNotReadyError);
    const { message } = error as SchemaNotReadyError;
    expect(message).toContain(String(MINIMUM_SCHEMA_VERSION));
    // Pesan yang hanya berbunyi "skema belum siap" memaksa orang menebak.
    expect(message).toContain("Desktop");
  });

  test("tidak melempar saat skema siap", async () => {
    const client = emptyDatabase();
    await seedSchema(client, MINIMUM_SCHEMA_VERSION);

    expect(await assertSchemaReady(client).then(() => "ok")).toBe("ok");
  });
});
