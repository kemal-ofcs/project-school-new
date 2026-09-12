import { describe, expect, test } from "bun:test";
import { createClient } from "@libsql/client";
import {
  bersihkanPercobaan,
  catatPercobaan,
  type KebijakanRateLimit,
  kunciRateLimit,
  periksaRateLimit,
} from "./rate-limit";

async function siapkanDatabase() {
  const client = createClient({ url: ":memory:" });
  // Bentuknya disalin dari `db-migrations.ts`; tabel ini milik jalur Web dan
  // sudah ada sejak versi skema 3.
  await client.execute(`
    CREATE TABLE auth_login_rate_limit (
      rate_key TEXT PRIMARY KEY,
      attempt_count INTEGER NOT NULL,
      window_started_at TEXT NOT NULL,
      blocked_until TEXT,
      updated_at TEXT NOT NULL
    );
  `);
  return client;
}

const KEBIJAKAN: KebijakanRateLimit = {
  maksPercobaan: 3,
  jendelaMenit: 30,
  blokirMenit: 30,
};

describe("periksaRateLimit dan catatPercobaan", () => {
  test("kunci baru diizinkan", async () => {
    const client = await siapkanDatabase();

    expect(await periksaRateLimit(client, "pmb:daftar:abc")).toEqual({
      diizinkan: true,
      cobaLagiDetik: 0,
    });
  });

  test("percobaan di bawah ambang belum memblokir", async () => {
    const client = await siapkanDatabase();

    await catatPercobaan(client, "k", KEBIJAKAN);
    await catatPercobaan(client, "k", KEBIJAKAN);

    expect((await periksaRateLimit(client, "k")).diizinkan).toBe(true);
  });

  test("ambang yang terlampaui memblokir, dengan sisa waktu yang masuk akal", async () => {
    const client = await siapkanDatabase();

    for (let i = 0; i < KEBIJAKAN.maksPercobaan; i++) {
      await catatPercobaan(client, "k", KEBIJAKAN);
    }

    const hasil = await periksaRateLimit(client, "k");
    expect(hasil.diizinkan).toBe(false);
    // 30 menit = 1800 detik; toleransi beberapa detik untuk waktu eksekusi.
    expect(hasil.cobaLagiDetik).toBeGreaterThan(1700);
    expect(hasil.cobaLagiDetik).toBeLessThanOrEqual(1800);
  });

  test("kunci yang berbeda dihitung terpisah", async () => {
    const client = await siapkanDatabase();

    for (let i = 0; i < KEBIJAKAN.maksPercobaan; i++) {
      await catatPercobaan(client, "k1", KEBIJAKAN);
    }

    expect((await periksaRateLimit(client, "k1")).diizinkan).toBe(false);
    expect((await periksaRateLimit(client, "k2")).diizinkan).toBe(true);
  });

  test("jendela yang sudah lewat memulai hitungan dari nol", async () => {
    const client = await siapkanDatabase();

    await catatPercobaan(client, "k", KEBIJAKAN);
    await catatPercobaan(client, "k", KEBIJAKAN);
    // Mundurkan jendelanya melewati batas, seolah dua percobaan itu terjadi
    // sejam lalu. Tanpa jendela bergulir, satu jaringan bersama — warnet, atau
    // sekolah yang mendaftarkan siswanya beramai-ramai — akan terblokir
    // permanen setelah cukup banyak pendaftaran yang sah.
    await client.execute(
      "UPDATE auth_login_rate_limit SET window_started_at = datetime('now', '-2 hours');",
    );

    await catatPercobaan(client, "k", KEBIJAKAN);

    const baris = await client.execute(
      "SELECT attempt_count, blocked_until FROM auth_login_rate_limit WHERE rate_key = 'k';",
    );
    expect(Number(baris.rows[0]?.attempt_count)).toBe(1);
    expect(baris.rows[0]?.blocked_until).toBeNull();
  });

  test("bersihkanPercobaan menghapus hitungannya", async () => {
    const client = await siapkanDatabase();

    for (let i = 0; i < KEBIJAKAN.maksPercobaan; i++) {
      await catatPercobaan(client, "k", KEBIJAKAN);
    }
    expect((await periksaRateLimit(client, "k")).diizinkan).toBe(false);

    await bersihkanPercobaan(client, "k");

    expect((await periksaRateLimit(client, "k")).diizinkan).toBe(true);
  });
});

describe("kunciRateLimit", () => {
  test("alamat yang sama menghasilkan kunci yang sama", async () => {
    expect(await kunciRateLimit("daftar", "10.0.0.1")).toBe(
      await kunciRateLimit("daftar", "10.0.0.1"),
    );
  });

  test("alamat berbeda menghasilkan kunci berbeda", async () => {
    expect(await kunciRateLimit("daftar", "10.0.0.1")).not.toBe(
      await kunciRateLimit("daftar", "10.0.0.2"),
    );
  });

  test("ruang nama berbeda tidak saling mengunci", async () => {
    // Tabrakan akan memblokir hal yang salah: alamat yang gagal mengecek status
    // ikut terblokir dari mendaftar, dua kebijakan berbeda yang saling kunci.
    expect(await kunciRateLimit("daftar", "10.0.0.1")).not.toBe(
      await kunciRateLimit("status", "10.0.0.1"),
    );
  });

  test("alamat tidak tersimpan apa adanya di dalam kunci", async () => {
    const kunci = await kunciRateLimit("daftar", "203.0.113.42");

    // Tabel ini bisa dibaca siapa pun yang punya akses database sekolah.
    // Daftar alamat IP pengunjung situs publik tidak perlu ikut tersimpan.
    expect(kunci).not.toContain("203.0.113.42");
    expect(kunci).toStartWith("pmb:daftar:");
  });
});
