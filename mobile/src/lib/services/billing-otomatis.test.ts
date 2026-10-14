import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Client, createClient } from "@libsql/client";
import { initDatabaseSchema } from "@/lib/db-schema";

mock.module("server-only", () => ({}));

const { remindAuto } = await import("@/lib/services/billing");

let client: Client;
let testDirectory: string;

beforeAll(async () => {
  testDirectory = mkdtempSync(join(tmpdir(), "kos-billing-otomatis-"));
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

// Cermin `pengingat_otomatis_h_n_dan_lewat_sekali_sehari` di `desktop/billing.rs`.
describe("pengingat tagihan otomatis", () => {
  test("H-n dan lewat jatuh tempo, sekali sehari", async () => {
    await client.executeMultiple(`
      INSERT INTO akademik_rombel (id_rombel, id_tahun_ajaran, tingkat, nama_rombel) VALUES ('r7', 'ta', 7, 'VII A');
      INSERT INTO master_data (id_unik, kode_karyawan, nama, divisi, id_shift, jenis_personil, status_aktif) VALUES
        ('S-1', 'S-1', 'Ani', 'Siswa', 1, 'Siswa', 'Aktif'),
        ('S-2', 'S-2', 'Budi', 'Siswa', 1, 'Siswa', 'Aktif'),
        ('S-3', 'S-3', 'Cici', 'Siswa', 1, 'Siswa', 'Aktif');
      INSERT INTO siswa_data (id_siswa, nama_lengkap, id_rombel, angkatan, status, no_whatsapp_wali, created_at, updated_at) VALUES
        ('S-1', 'Ani', 'r7', 2026, 'Aktif', '081200000001', 'x', 'x'),
        ('S-2', 'Budi', 'r7', 2026, 'Aktif', '081200000002', 'x', 'x'),
        ('S-3', 'Cici', 'r7', 2026, 'Aktif', '081200000003', 'x', 'x');
      INSERT INTO keu_tagihan (id_tagihan, id_siswa, nama_siswa, id_jenis_tagihan, nama_tagihan, periode, nominal, potongan, jatuh_tempo, dibuat_oleh) VALUES
        ('t-h3', 'S-1', 'Ani', 'spp', 'SPP', '2026-10', 100000, 0, date('now', '+7 hours', '+3 days'), 'tu'),
        ('t-lewat', 'S-2', 'Budi', 'spp', 'SPP', '2000-01', 100000, 0, '2000-01-10', 'tu'),
        ('t-jauh', 'S-3', 'Cici', 'spp', 'SPP', '2999-01', 100000, 0, '2999-01-10', 'tu');
      INSERT INTO setting_gex_system (key, value) VALUES ('wa_notify_tagihan', 'true');
    `);
    expect((await remindAuto(client)).dijalankan).toBe(false);
    const hari = await client.execute(
      "SELECT CAST(strftime('%w', date('now', '+7 hours')) AS INTEGER) AS w;",
    );
    const w = Number(hari.rows[0]?.w ?? 0);
    await client.execute({
      sql: `INSERT INTO setting_gex_system (key, value) VALUES
              ('pengingat_tagihan_otomatis', 'true'),
              ('pengingat_tagihan_hari_sebelum', '3'),
              ('pengingat_tagihan_hari_lewat', ?);`,
      args: [String(w === 0 ? 7 : w)],
    });
    const hasil = await remindAuto(client);
    expect(hasil.dijalankan).toBe(true);
    if (hasil.dijalankan) {
      expect([hasil.siswa, hasil.diantre]).toEqual([2, 2]);
    }
    expect(await remindAuto(client)).toMatchObject({
      dijalankan: false,
      alasan: "Sudah dijalankan hari ini.",
    });
  });
});
