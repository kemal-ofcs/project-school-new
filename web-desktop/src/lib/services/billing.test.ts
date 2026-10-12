import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Client, createClient } from "@libsql/client";
import { initDatabaseSchema } from "@/lib/db-schema";

mock.module("server-only", () => ({}));

const { cancel, issue, list, preview, saveJenis, saveKeringanan, saveTarif } =
  await import("@/lib/services/billing");
const { trialBalance } = await import("@/lib/services/accounting");

// Berkas sungguhan, satu klien per berkas (pola `inventory.test.ts`).
let client: Client;
let testDirectory: string;

beforeAll(async () => {
  testDirectory = mkdtempSync(join(tmpdir(), "kos-billing-web-"));
  client = createClient({ url: `file:${join(testDirectory, "test.db")}` });
  await initDatabaseSchema(client);
  await client.batch(
    [
      `INSERT INTO akademik_rombel (id_rombel, id_tahun_ajaran, tingkat, nama_rombel) VALUES
         ('r7', 'ta', 7, 'VII A'), ('r8', 'ta', 8, 'VIII A');`,
      `INSERT INTO master_data (id_unik, kode_karyawan, nama, divisi, id_shift, jenis_personil, status_aktif, unit) VALUES
         ('S-01', 'S-01', 'Ani', 'Siswa', 1, 'Siswa', 'Aktif', 'SMP'),
         ('S-02', 'S-02', 'Budi', 'Siswa', 1, 'Siswa', 'Aktif', 'SMP'),
         ('S-03', 'S-03', 'Cici', 'Siswa', 1, 'Siswa', 'Aktif', 'SMP');`,
      `INSERT INTO siswa_data (id_siswa, nama_lengkap, id_rombel, angkatan, status, created_at, updated_at) VALUES
         ('S-01', 'Ani', 'r7', 2026, 'Aktif', 'x', 'x'),
         ('S-02', 'Budi', 'r8', 2025, 'Aktif', 'x', 'x'),
         ('S-03', 'Cici', 'r8', 2025, 'Lulus', 'x', 'x');`,
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

async function saldo(akun: string): Promise<number> {
  const neraca = await trialBalance(client, "2099-12-31");
  expect(neraca.total_debit).toBe(neraca.total_kredit);
  const baris = neraca.items.find((item) => item.id_akun === akun);
  return baris ? baris.debit - baris.kredit : 0;
}

// Cermin `terbit_massal_idempoten_dan_batal` di `desktop/billing.rs`.
describe("tagihan Web terhadap skema cloud asli", () => {
  test("terbit massal idempoten, keringanan, dan pembatalan", async () => {
    const { id_jenis_tagihan: jt } = await saveJenis(client, {
      nama: "SPP",
      periodik: "Bulanan",
      nominal_bawaan: 300_000,
      id_akun_pendapatan: "akun-pendapatan-spp",
    });
    await expect(
      saveJenis(client, {
        nama: "Buku",
        periodik: "Tahunan",
        nominal_bawaan: 1,
        id_akun_pendapatan: "akun-kas",
      }),
    ).rejects.toThrow("Akun pendapatan harus akun Pendapatan yang aktif.");
    await saveTarif(client, {
      id_jenis_tagihan: jt,
      nama_unit: "SMP",
      tingkat: 7,
      nominal: 500_000,
    });
    await expect(
      saveTarif(client, {
        id_jenis_tagihan: jt,
        nama_unit: "smp",
        tingkat: 7,
        nominal: 1,
      }),
    ).rejects.toThrow("Tarif untuk unit dan tingkat ini sudah ada.");
    await saveKeringanan(client, "bendahara", {
      id_siswa: "S-02",
      id_jenis_tagihan: jt,
      jenis: "Persen",
      nilai: 50,
    });

    const pratinjau = await preview(client, jt, "2026-07", null, null);
    expect(pratinjau.jumlah_baru).toBe(2);
    expect(pratinjau.total_bersih).toBe(650_000);

    const hasil = await issue(
      client,
      "bendahara",
      jt,
      "2026-07",
      "2026-07-10",
      null,
      null,
    );
    expect(hasil.terbit).toBe(2);
    expect(await saldo("akun-piutang-siswa")).toBe(650_000);
    const ulang = await issue(
      client,
      "bendahara",
      jt,
      "2026-07",
      "2026-07-10",
      null,
      null,
    );
    expect(ulang.terbit).toBe(0);
    expect(await saldo("akun-piutang-siswa")).toBe(650_000);

    const id = `tgh-${jt}-S-01-2026-07`;
    await cancel(client, "kepala", id, "Salah tingkat");
    await expect(cancel(client, "kepala", id, "Lagi")).rejects.toThrow(
      "Tagihan ini sudah dibatalkan.",
    );
    expect(await saldo("akun-piutang-siswa")).toBe(150_000);
    const daftar = await list(client, { periode: "2026-07", status: "Aktif" });
    expect(daftar.items.length).toBe(1);
    expect(daftar.total_sisa).toBe(150_000);
  });
});
