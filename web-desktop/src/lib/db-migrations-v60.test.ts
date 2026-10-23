import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { type Client, createClient } from "@libsql/client";
import { initDatabaseSchema } from "@/lib/db-schema";

/**
 * v60 di database Web yang SUDAH ada: jadwal bel lama dibangun ulang untuk
 * jenis `Pulang` tanpa kehilangan baris, dan kolom unit mapel/rombel
 * ditambahkan. Cerminan `jadwal_bel_lama_dibangun_ulang_untuk_pulang` di
 * `storage.rs`. Satu klien per berkas (libsql native di Bun Windows).
 */
let client: Client;

beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  await client.execute(`
    CREATE TABLE akademik_jam_pelajaran (
      id_jam_pelajaran TEXT PRIMARY KEY,
      jam_ke INTEGER NOT NULL CHECK (jam_ke >= 1),
      jam_mulai TEXT NOT NULL,
      jam_selesai TEXT NOT NULL,
      jenis TEXT NOT NULL DEFAULT 'KBM'
        CHECK (jenis IN ('KBM', 'Istirahat', 'Upacara', 'Ekstrakurikuler')),
      keterangan TEXT,
      is_aktif INTEGER NOT NULL DEFAULT 1 CHECK (is_aktif IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  await client.execute(`
    INSERT INTO akademik_jam_pelajaran (id_jam_pelajaran, jam_ke, jam_mulai, jam_selesai, jenis)
    VALUES ('jp-1', 1, '07:00', '07:45', 'KBM');
  `);
  await initDatabaseSchema(client);
});

afterAll(() => {
  client.close();
});

describe("migrasi v60", () => {
  test("baris bel lama tetap ada dan menjadi semua unit, setiap hari, berbunyi", async () => {
    const res = await client.execute(
      "SELECT jam_mulai, id_unit, hari, bunyi, suara FROM akademik_jam_pelajaran WHERE id_jam_pelajaran = 'jp-1';",
    );
    expect(res.rows[0]).toMatchObject({
      jam_mulai: "07:00",
      id_unit: null,
      hari: null,
      bunyi: 1,
      suara: null,
    });
  });

  test("jenis Pulang diterima, hari di luar 1-7 ditolak", async () => {
    await client.execute(`
      INSERT INTO akademik_jam_pelajaran
        (id_jam_pelajaran, jam_ke, jam_mulai, jam_selesai, jenis, hari)
      VALUES ('jp-2', 1, '14:00', '14:00', 'Pulang', 5);
    `);
    await expect(
      client.execute(
        "UPDATE akademik_jam_pelajaran SET hari = 8 WHERE id_jam_pelajaran = 'jp-2';",
      ),
    ).rejects.toThrow();
  });

  test("mapel dan rombel punya kolom id_unit", async () => {
    for (const table of ["akademik_mapel", "akademik_rombel"]) {
      const cols = await client.execute(`PRAGMA table_info(${table});`);
      expect(cols.rows.map((row) => String(row.name))).toContain("id_unit");
    }
  });
});
