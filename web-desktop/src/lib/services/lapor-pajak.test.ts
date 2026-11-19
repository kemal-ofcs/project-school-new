import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Client, createClient } from "@libsql/client";
import { initDatabaseSchema } from "@/lib/db-schema";
import { PESAN_MASA } from "@/lib/validations/lapor-pajak";

mock.module("server-only", () => ({}));

// Jalur Web rekap PPh 21/BPJS/A1 (HRIS Fase 8b) pada skema Web sungguhan.
// Pasangan Rust: `lapor_pajak_alur_cloud` di `lapor_pajak.rs`, data sama
// (`lapor-pajak.uji.sql`).
const testDirectory: string = mkdtempSync(join(tmpdir(), "kos-lapor-"));
const client: Client = createClient({
  url: `file:${join(testDirectory, "test.db")}`,
});

const S = await import("./lapor-pajak");

const galat = async (janji: Promise<unknown>) => {
  try {
    await janji;
    return null;
  } catch (error) {
    return (error as Error).message;
  }
};

beforeAll(async () => {
  await initDatabaseSchema(client);
  await client.executeMultiple(
    readFileSync(join(import.meta.dir, "lapor-pajak.uji.sql"), "utf8"),
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

describe("lapor-pajak: alur Web sama dengan lapor_pajak_alur_cloud", () => {
  test("data pemotong, dua run dijumlah, REJECTED dilewati, APPROVED diperingatkan", async () => {
    expect(
      await galat(S.simpanPemotong(client, "admin", { npwp: "123" })),
    ).toBe("NPWP pemotong harus 16 digit.");
    await S.simpanPemotong(client, "admin", {
      npwp: "0123.4567.8901.2345",
      nitku: "0123456789012345000000",
      nama_penandatangan: "Kepala  Sekolah",
    });
    const pemotong = await S.dataPemotong(client);
    expect(pemotong.npwp).toBe("0123456789012345");
    expect(pemotong.nama_penandatangan).toBe("Kepala Sekolah");

    const pph = await S.laporanPph(client, { masa: "2026-11" });
    expect(pph.pemotong.nitku).toBe("0123456789012345000000");
    const r = pph.rekap;
    expect(r.jumlah_run).toBe(2);
    expect(r.run_belum_dibayar).toEqual([
      { id: "lp-run-ok", status: "APPROVED", period_start: "2026-11-21" },
    ]);
    expect(r.baris[0]?.id_karyawan).toBe("lp-p1");
    expect(r.baris[0]?.bruto).toBe(5_000_000);
    expect(r.baris[0]?.pph).toBe(150_000);
    expect(r.baris[0]?.jumlah_run).toBe(2);
    expect(r.total_pph).toBe(150_000);

    const bpjs = await S.laporanBpjs(client, { masa: "2026-11" });
    expect(bpjs.rekap.baris[0]?.iuran.JHT_EMP).toBe(100_000);
    expect(bpjs.rekap.total_pekerja).toBe(100_000);

    const a1 = await S.laporanA1(client, { tahun: "2026" });
    expect(a1.rekap.baris[0]?.tanda).toEqual(["belum_masa_terakhir"]);
    expect(await galat(S.laporanPph(client, { masa: "2026-13" }))).toBe(
      PESAN_MASA,
    );
  });
});
