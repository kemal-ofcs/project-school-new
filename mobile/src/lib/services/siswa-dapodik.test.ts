import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Client, createClient } from "@libsql/client";
import { initDatabaseSchema } from "@/lib/db-schema";
import { SQL_SALIN_DAPODIK_PMB } from "@/lib/validations/siswa-dapodik";

mock.module("server-only", () => ({}));

const { markPmbRegistered } = await import("@/lib/services/pmb-admin");
const { clearSiswaDapodik, listSiswaDapodik, saveSiswaDapodik } = await import(
  "@/lib/services/siswa-dapodik"
);

// Berkas sungguhan, bukan `file::memory:`: `client.batch` membuka transaksi di
// koneksi baru. Satu klien per berkas, pola `accounting.test.ts`.
let client: Client;
let testDirectory: string;

beforeAll(async () => {
  testDirectory = mkdtempSync(join(tmpdir(), "kos-siswa-dapodik-"));
  client = createClient({ url: `file:${join(testDirectory, "test.db")}` });
  await initDatabaseSchema(client);
  await client.execute(
    `INSERT INTO siswa_data (id_siswa, nama_lengkap, id_rombel, angkatan, created_at, updated_at)
     VALUES ('sis-1', 'Ani', 'r1', 2026, '2026-10-22', '2026-10-22');`,
  );
  await client.execute(
    `INSERT INTO pmb_pendaftar (id_pendaftar, nomor_pendaftaran, id_gelombang, nama_lengkap,
       tempat_lahir, tanggal_lahir, asal_sekolah, nama_wali, no_whatsapp_wali, status,
       data_dapodik, created_at, updated_at)
     VALUES ('pmb-1', 'PMB-1', 'g1', 'Ani', 'Garut', '2010-05-01', 'SMPN 1', 'Budi',
       '+628123456789', 'Diterima', '{"versi":1,"nik":"3201234567890123"}',
       '2026-10-22', '2026-10-22');`,
  );
  // Skema penuh di berkas SQLite bisa lewat dari 5 detik bawaan di mesin sibuk.
}, 60_000);

// Di Windows berkas SQLite bisa masih terkunci sesaat setelah `close()`.
afterAll(async () => {
  client.close();
  await Bun.sleep(50);
  try {
    rmSync(testDirectory, { recursive: true, force: true });
  } catch {
    // Berkas sementara; sistem membersihkannya nanti.
  }
});

describe("siswa_dapodik", () => {
  test("angkat siswa menyalin biodata PMB", async () => {
    await markPmbRegistered(client, "pmb-1", "sis-1");
    const [baris] = await listSiswaDapodik(client, ["sis-1"]);
    expect(baris).toMatchObject({
      id_siswa: "sis-1",
      tempat_lahir: "Garut",
      tanggal_lahir: "2010-05-01",
      sekolah_asal: "SMPN 1",
      data_dapodik: '{"versi":1,"nik":"3201234567890123"}',
      diubah_oleh: "PMB",
    });
  });

  test("simpan admin menimpa, siswa yang belum di cloud ditolak", async () => {
    await saveSiswaDapodik(
      client,
      { idSiswa: "sis-1", tempatLahir: "Bandung", data: { agama: "Islam" } },
      "admin",
    );
    const [baris] = await listSiswaDapodik(client, ["sis-1"]);
    expect(baris.tempat_lahir).toBe("Bandung");
    expect(baris.tanggal_lahir).toBeNull();
    expect(JSON.parse(String(baris.data_dapodik))).toEqual({
      versi: 1,
      agama: "Islam",
    });
    expect(baris.diubah_oleh).toBe("admin");

    await expect(
      saveSiswaDapodik(client, { idSiswa: "offline-1", data: {} }, "admin"),
    ).rejects.toThrow("belum ada di database cloud");
    await expect(
      saveSiswaDapodik(
        client,
        { idSiswa: "sis-1", data: { agama: "Lainnya" } },
        "admin",
      ),
    ).rejects.toThrow("Pilih agama calon siswa.");
  });

  test("dikosongkan tidak dihidupkan lagi oleh salinan PMB", async () => {
    await clearSiswaDapodik(client, "sis-1", "admin");
    await client.execute(`${SQL_SALIN_DAPODIK_PMB};`);
    const [baris] = await listSiswaDapodik(client, ["sis-1"]);
    expect(baris.data_dapodik).toBeNull();
    expect(baris.tempat_lahir).toBeNull();
  });
});
