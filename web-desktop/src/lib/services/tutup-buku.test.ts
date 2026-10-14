import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Client, createClient } from "@libsql/client";
import { initDatabaseSchema } from "@/lib/db-schema";

mock.module("server-only", () => ({}));

const { postJournal } = await import("@/lib/services/accounting");
const { close, reopen, status } = await import("@/lib/services/tutup-buku");

let client: Client;
let testDirectory: string;

beforeAll(async () => {
  testDirectory = mkdtempSync(join(tmpdir(), "kos-tutup-buku-"));
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

const jurnal = (tanggal: string) =>
  postJournal(client, "tu", {
    tanggal,
    keterangan: "Uji",
    baris: [
      { id_akun: "akun-kas", debit: 100000 },
      { id_akun: "akun-pendapatan-spp", kredit: 100000 },
    ],
  });

// Cermin `tutup_tolak_lalu_buka_kembali` di `desktop/tutup_buku.rs`.
describe("tutup buku Web", () => {
  test("tutup, tolak, lalu buka kembali", async () => {
    await jurnal("2020-01-15");
    const hasil = await close(client, "kepala", "2020-01-31");
    expect(hasil.tutup.saldo_json).toContain(
      '{"id_akun":"akun-kas","debit":100000,"kredit":0}',
    );
    expect(hasil.tutup.kode_perangkat).toBe("WEB");
    expect(hasil.tutup.diterima_cloud).not.toBeNull();
    expect((await status(client)).batas).toBe("2020-01-31");

    await expect(jurnal("2020-01-31")).rejects.toThrow(
      "Tanggal 31/01/2020 masuk periode yang sudah ditutup",
    );
    await jurnal("2020-02-01");

    await expect(close(client, "kepala", "2020-01-31")).rejects.toThrow(
      "Buku sudah ditutup sampai 31/01/2020. Pilih tanggal sesudahnya.",
    );
    await expect(reopen(client, "kepala", " ")).rejects.toThrow(
      "Alasan membuka kembali wajib diisi.",
    );
    expect(
      (await reopen(client, "kepala", "Kuitansi Januari tertinggal")).batas,
    ).toBeNull();
    await jurnal("2020-01-20");
    await expect(reopen(client, "kepala", "Lagi")).rejects.toThrow(
      "Belum ada periode yang ditutup.",
    );
    const riwayat = (await status(client)).riwayat;
    expect(riwayat[0]?.status).toBe("Dibuka");
    expect(riwayat[0]?.alasan_buka).toBe("Kuitansi Januari tertinggal");
  });
});
