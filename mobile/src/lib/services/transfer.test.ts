import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Client, createClient } from "@libsql/client";
import { initDatabaseSchema } from "@/lib/db-schema";
import { SEED_JENIS_REIMBURSE_SQL } from "@/lib/validations/hr-reimburse";
import {
  BANK_BAWAAN,
  PESAN_REKENING_GANDA,
  PESAN_STATUS_RUN,
  SEED_BANK_SQL,
  seedBankArgs,
} from "@/lib/validations/transfer";

mock.module("server-only", () => ({}));

// Jalur Web berkas transfer (HRIS Fase 8a) pada skema Web sungguhan. Pasangan
// Rust: `transfer_alur_cloud` dan `transfer_sentinel_2048_memicu_v73` di
// `transfer.rs`, dengan data yang sama (`transfer.uji.sql`). Satu klien untuk
// seluruh berkas.
const testDirectory: string = mkdtempSync(join(tmpdir(), "kos-transfer-"));
const client: Client = createClient({
  url: `file:${join(testDirectory, "test.db")}`,
});

const S = await import("./transfer");

const galat = async (janji: Promise<unknown>) => {
  try {
    await janji;
    return null;
  } catch (error) {
    return (error as Error).message;
  }
};

const hitung = async (sql: string) =>
  Number((await client.execute(sql)).rows[0]?.[0] ?? 0);

beforeAll(async () => {
  await initDatabaseSchema(client);
  await client.executeMultiple(
    readFileSync(join(import.meta.dir, "transfer.uji.sql"), "utf8"),
  );
}, 60_000);

afterAll(async () => {
  client.close();
  await Bun.sleep(50);
  try {
    rmSync(testDirectory, { recursive: true, force: true });
  } catch {
    // Berkas libsql di Windows kadang masih terkunci; folder sementara saja.
  }
});

describe("transfer: skema v73", () => {
  test("seed bank dan jenis reimbursement aman diulang, suntingan tetap", async () => {
    expect(
      await hitung("SELECT COUNT(*) FROM app_bank WHERE is_bawaan = 1"),
    ).toBe(BANK_BAWAAN.length);
    expect(await hitung("SELECT COUNT(*) FROM hr_reimburse_jenis")).toBe(5);
    await client.execute(
      "UPDATE app_bank SET nama = 'BCA Sekolah' WHERE id_bank = 'bnk-014'",
    );
    await client.batch(
      [
        ...BANK_BAWAAN.map((b) => ({
          sql: SEED_BANK_SQL,
          args: seedBankArgs(b),
        })),
        { sql: SEED_JENIS_REIMBURSE_SQL, args: [] },
      ],
      "write",
    );
    expect(
      await hitung(
        "SELECT COUNT(*) FROM app_bank WHERE id_bank = 'bnk-014' AND nama = 'BCA Sekolah'",
      ),
    ).toBe(1);
    expect(await hitung("SELECT COUNT(*) FROM app_bank")).toBe(
      BANK_BAWAAN.length,
    );
    expect(await hitung("SELECT COUNT(*) FROM hr_reimburse_jenis")).toBe(5);
    await client.execute(
      "UPDATE app_bank SET nama = 'BCA' WHERE id_bank = 'bnk-014'",
    );
  });
});

describe("transfer: alur Web sama dengan transfer_alur_cloud", () => {
  test("pengaturan, run DRAFT ditolak, pratinjau, unduh, PAID", async () => {
    await S.simpanPengaturanTransfer(client, "admin", {
      aksi: "bank",
      id: "bnk-451",
      data: { nama: "Bank Syariah Indonesia", kode: "451", alias: ["BSM"] },
    });
    const alias = (
      await client.execute(
        "SELECT alias FROM app_bank WHERE id_bank = 'bnk-451'",
      )
    ).rows[0]?.alias;
    expect(alias).toBe('["BSM","BSI"]');

    const rek = {
      aksi: "rekening",
      data: {
        id_bank: "bnk-014",
        no_rekening: "123-456-7890",
        nama_rekening: "Yayasan Uji",
      },
    };
    const { id: idRek } = await S.simpanPengaturanTransfer(
      client,
      "admin",
      rek,
    );
    expect(await galat(S.simpanPengaturanTransfer(client, "admin", rek))).toBe(
      PESAN_REKENING_GANDA,
    );

    const draft = (run: string) => ({
      run_id: run,
      id_rekening: idRek,
      tanggal_efektif: "2026-11-25",
    });
    expect(
      await galat(
        S.berkasTransfer(client, "bendahara", draft("run-draft"), false),
      ),
    ).toBe(PESAN_STATUS_RUN);

    const pratinjau = await S.berkasTransfer(
      client,
      "bendahara",
      draft("run-ok"),
      false,
    );
    const r = pratinjau.susunan.ringkasan;
    expect([r.jumlah_baris, r.total, r.jumlah_manual]).toEqual([
      2, 7_500_000, 1,
    ]);
    expect(pratinjau.susunan.baris.map((b) => b.jenis)).toEqual([
      "sesama",
      "antarbank",
    ]);
    expect(pratinjau.susunan.baris[1]?.tanda).toEqual(["pegawai_keluar"]);
    const jejak = (run: string) =>
      hitung(
        `SELECT COUNT(*) FROM payroll_audit_logs WHERE payroll_run_id = '${run}' AND action = 'TRANSFER_EXPORT'`,
      );
    expect(await jejak("run-ok")).toBe(0);

    await S.berkasTransfer(client, "bendahara", draft("run-ok"), true);
    expect(await jejak("run-ok")).toBe(1);
    const notes = (
      await client.execute(
        "SELECT notes FROM payroll_audit_logs WHERE action = 'TRANSFER_EXPORT'",
      )
    ).rows[0]?.notes;
    expect(notes).toBe(
      `{"format":null,"id_format":null,"id_rekening":"${idRek}","jumlah_baris":2,"rekening_debet":"1234567890","tanggal_efektif":"2026-11-25","total":7500000}`,
    );

    const dibayar = await S.berkasTransfer(
      client,
      "bendahara",
      draft("run-paid"),
      true,
    );
    expect(dibayar.riwayat).toHaveLength(0);
    const ulang = await S.berkasTransfer(
      client,
      "bendahara",
      draft("run-paid"),
      false,
    );
    expect(ulang.riwayat).toHaveLength(1);
  });
});
