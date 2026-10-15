import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Client, createClient } from "@libsql/client";
import { initDatabaseSchema } from "@/lib/db-schema";

mock.module("server-only", () => ({}));

const {
  cancelPmbPayment,
  confirmPmbPayment,
  extendPmbPaymentDeadline,
  getPmbRegistrant,
  listPmbRegistrants,
  listPmbWaves,
  updatePmbStatus,
} = await import("@/lib/services/pmb-admin");

// Pembayaran PMB (v52) di atas skema sungguhan dari `initDatabaseSchema`.
// Satu klien per berkas (pola `loan.test.ts`).
let client: Client;
let testDirectory: string;

async function hari(geser: number): Promise<string> {
  const res = await client.execute({
    sql: "SELECT date('now', '+7 hours', ? || ' days') AS t;",
    args: [String(geser)],
  });
  return String(res.rows[0]?.t);
}

async function tambahPendaftar(
  id: string,
  opsi: { biaya: number; batas: number | null },
) {
  await client.execute({
    sql: `INSERT INTO pmb_pendaftar (
            id_pendaftar, nomor_pendaftaran, id_gelombang, nama_lengkap,
            nama_wali, no_whatsapp_wali, biaya_tagihan, batas_bayar,
            created_at, updated_at
          ) VALUES (?, ?, 'gel-1', 'Anak', 'Wali', '+6281200000000', ?, ?,
                    datetime('now'), datetime('now'));`,
    args: [
      id,
      `PMB-2026-${id}`,
      opsi.biaya,
      opsi.batas === null ? null : await hari(opsi.batas),
    ],
  });
}

const bayar = async (id: string, tanggal?: string) =>
  confirmPmbPayment(
    client,
    {
      idPendaftar: id,
      jumlah: 150000,
      tanggal: tanggal ?? (await hari(0)),
      metode: "tunai",
    },
    "kasir",
  );

beforeAll(async () => {
  testDirectory = mkdtempSync(join(tmpdir(), "kos-pmb-bayar-"));
  client = createClient({ url: `file:${join(testDirectory, "test.db")}` });
  await initDatabaseSchema(client);
});

beforeEach(async () => {
  await client.batch(
    [
      "DELETE FROM pmb_pendaftar;",
      "DELETE FROM pmb_gelombang;",
      `INSERT INTO pmb_gelombang (id_gelombang, nama, tahun_ajaran, tanggal_buka,
         tanggal_tutup, kuota, biaya_pendaftaran, is_aktif, created_at, updated_at)
       VALUES ('gel-1', 'Gelombang 1', '2026/2027', '2000-01-01', '2999-12-31',
               2, 150000, 1, 'x', 'x');`,
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
    // Windows bisa masih memegang berkas database sesaat setelah ditutup.
    if (
      !(error instanceof Error) ||
      !("code" in error) ||
      error.code !== "EBUSY"
    ) {
      throw error;
    }
  }
});

describe("pembayaran PMB", () => {
  test("keadaan bayar diturunkan dan bisa disaring", async () => {
    await tambahPendaftar("A", { biaya: 150000, batas: 0 });
    await tambahPendaftar("B", { biaya: 150000, batas: -1 });
    await tambahPendaftar("C", { biaya: 0, batas: null });

    const semua = await listPmbRegistrants(client, {});
    const keadaan = Object.fromEntries(
      semua.items.map((p) => [p.id_pendaftar, p.keadaan_bayar]),
    );
    expect(keadaan).toEqual({
      A: "Menunggu Pembayaran",
      B: "Kedaluwarsa",
      C: "Tanpa biaya",
    });

    const kedaluwarsa = await listPmbRegistrants(client, {
      pembayaran: "Kedaluwarsa",
    });
    expect(kedaluwarsa.items.map((p) => p.id_pendaftar)).toEqual(["B"]);

    // Kedaluwarsa melepas kuotanya.
    const [gelombang] = await listPmbWaves(client);
    expect(Number(gelombang?.terpakai)).toBe(2);
  });

  test("konfirmasi mencatat pencatat dan tidak bisa diulang", async () => {
    await tambahPendaftar("A", { biaya: 150000, batas: 2 });
    await bayar("A");

    const { pendaftar } = await getPmbRegistrant(client, "A");
    expect(pendaftar.keadaan_bayar).toBe("Lunas");
    expect(pendaftar.dibayar_dicatat_oleh).toBe("kasir");
    expect(pendaftar.dibayar_jumlah).toBe(150000);

    await expect(bayar("A")).rejects.toThrow(
      "Pembayaran pendaftar ini sudah tercatat.",
    );
  });

  test("jumlah yang berbeda, tanggal masa depan, dan kedaluwarsa ditolak", async () => {
    await tambahPendaftar("A", { biaya: 150000, batas: 2 });
    await tambahPendaftar("B", { biaya: 150000, batas: -1 });

    await expect(
      confirmPmbPayment(
        client,
        {
          idPendaftar: "A",
          jumlah: 100000,
          tanggal: await hari(0),
          metode: "tunai",
        },
        "kasir",
      ),
    ).rejects.toThrow("Rp150.000");
    await expect(bayar("A", await hari(1))).rejects.toThrow(
      "melewati hari ini",
    );
    await expect(bayar("B")).rejects.toThrow("Perpanjang batas bayarnya");
  });

  test("status terkunci sampai lunas, kecuali ditolak atau dibatalkan", async () => {
    await tambahPendaftar("A", { biaya: 150000, batas: 2 });

    await expect(
      updatePmbStatus(client, "A", "Diterima", null, "admin"),
    ).rejects.toThrow("belum melunasi");
    await updatePmbStatus(client, "A", "Ditolak", null, "admin");
    await updatePmbStatus(client, "A", "Baru", null, "admin");

    await bayar("A");
    await updatePmbStatus(client, "A", "Diterima", null, "admin");
    expect((await getPmbRegistrant(client, "A")).pendaftar.status).toBe(
      "Diterima",
    );
  });

  test("batal konfirmasi menyimpan alasan dan hanya selama status Baru", async () => {
    await tambahPendaftar("A", { biaya: 150000, batas: 2 });
    await bayar("A");

    await expect(cancelPmbPayment(client, "A", "x", "admin")).rejects.toThrow(
      "5 sampai 255",
    );
    await cancelPmbPayment(client, "A", "salah pendaftar", "admin");
    const { pendaftar } = await getPmbRegistrant(client, "A");
    expect(pendaftar.keadaan_bayar).toBe("Menunggu Pembayaran");
    expect(pendaftar.pembayaran_batal_catatan).toContain("admin");
    expect(pendaftar.pembayaran_batal_catatan).toContain("salah pendaftar");

    await bayar("A");
    await updatePmbStatus(client, "A", "Diterima", null, "admin");
    await expect(
      cancelPmbPayment(client, "A", "terlambat", "admin"),
    ).rejects.toThrow("masih 'Baru'");
  });

  test("perpanjang menghidupkan kembali yang kedaluwarsa, kecuali kuota penuh", async () => {
    await tambahPendaftar("A", { biaya: 150000, batas: -1 });
    await extendPmbPaymentDeadline(client, "A", await hari(3));
    expect((await getPmbRegistrant(client, "A")).pendaftar.keadaan_bayar).toBe(
      "Menunggu Pembayaran",
    );

    await tambahPendaftar("B", { biaya: 150000, batas: -1 });
    await tambahPendaftar("C", { biaya: 150000, batas: 1 });
    // Kuota 2 terisi A dan C; B yang kedaluwarsa tidak boleh kembali.
    await expect(
      extendPmbPaymentDeadline(client, "B", await hari(3)),
    ).rejects.toThrow("Kuota gelombang penuh");
    await expect(
      extendPmbPaymentDeadline(client, "A", await hari(-1)),
    ).rejects.toThrow("sebelum hari ini");
  });
});
