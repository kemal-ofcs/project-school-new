import { describe, expect, test } from "bun:test";
import { createClient } from "@libsql/client";
import {
  autentikasiPasswordWali,
  bacaSesiWali,
  buatKodeOtp,
  cabutSesiWali,
  cariSiswaUntukOtp,
  gantiPasswordWali,
  hitungPasswordDefaultWali,
  OTP_MAKS_PERCOBAAN,
  samarkanNomor,
  terbitkanOtp,
  terbitkanSesiWali,
  verifikasiOtp,
} from "./wali-auth";

async function siapkanDatabase() {
  const client = createClient({ url: ":memory:" });
  await client.execute(`
    CREATE TABLE siswa_data (
      id_siswa TEXT PRIMARY KEY,
      nis TEXT,
      nisn TEXT,
      nama_lengkap TEXT NOT NULL,
      jenis_kelamin TEXT CHECK (jenis_kelamin IN ('L', 'P')),
      id_rombel TEXT NOT NULL,
      nama_wali TEXT,
      no_whatsapp_wali TEXT,
      alamat TEXT,
      angkatan INTEGER NOT NULL,
      unit TEXT,
      status TEXT NOT NULL DEFAULT 'Aktif'
        CHECK (status IN ('Aktif', 'Lulus', 'Pindah', 'Keluar', 'Drop Out')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  await client.execute(`
    CREATE TABLE wali_otp (
      id TEXT PRIMARY KEY,
      subjek TEXT NOT NULL CHECK(subjek IN ('wali', 'pmb')),
      subjek_id TEXT NOT NULL,
      tujuan_nomor TEXT NOT NULL,
      kode_hash TEXT NOT NULL,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Menunggu'
        CHECK(status IN ('Menunggu', 'Terpakai', 'Kedaluwarsa', 'Dibatalkan')),
      delivery_status TEXT,
      delivery_error TEXT,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT
    );
  `);
  await client.execute(`
    CREATE TABLE wali_session (
      session_id TEXT PRIMARY KEY,
      token_hash TEXT UNIQUE NOT NULL,
      id_siswa TEXT NOT NULL,
      no_whatsapp_wali TEXT,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      revoked_at TEXT,
      revoked_reason TEXT,
      user_agent_hash TEXT
    );
  `);
  await client.execute(`
    CREATE TABLE IF NOT EXISTS master_data (
      id_unik TEXT PRIMARY KEY,
      unit TEXT
    );
  `);
  await client.execute(`
    CREATE TABLE IF NOT EXISTS wali_kredensial (
      id_siswa TEXT PRIMARY KEY,
      password_hash TEXT NOT NULL,
      changed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  return client;
}

type Klien = Awaited<ReturnType<typeof siapkanDatabase>>;

async function tambahSiswa(
  client: Klien,
  opsi: {
    id?: string;
    nis?: string;
    nisn?: string;
    status?: string;
    wa?: string | null;
    unit?: string | null;
  } = {},
) {
  await client.execute({
    sql: `INSERT INTO siswa_data (
            id_siswa, nis, nisn, nama_lengkap, id_rombel, nama_wali,
            no_whatsapp_wali, angkatan, unit, status, created_at, updated_at
          ) VALUES (?, ?, ?, 'Anisa Putri', 'rom-1', 'Budi Santoso',
                    ?, 2026, ?, ?, datetime('now'), datetime('now'));`,
    args: [
      opsi.id ?? "sis-1",
      opsi.nis ?? "1001",
      opsi.nisn ?? "0091001",
      opsi.wa === undefined ? "+6281200000000" : opsi.wa,
      opsi.unit ?? "SMP",
      opsi.status ?? "Aktif",
    ],
  });
  await client.execute({
    sql: `INSERT OR REPLACE INTO master_data (id_unik, unit) VALUES (?, ?);`,
    args: [opsi.id ?? "sis-1", opsi.unit ?? "SMP"],
  });
}

describe("buatKodeOtp", () => {
  test("selalu enam digit", () => {
    for (let i = 0; i < 200; i++) {
      expect(buatKodeOtp()).toMatch(/^\d{6}$/);
    }
  });
});

describe("samarkanNomor", () => {
  test("menyisakan empat digit terakhir saja", () => {
    const tersamar = samarkanNomor("+6281234567788");
    expect(tersamar).toContain("7788");
    // Menampilkan nomor utuh akan mengubah layar ini menjadi alat pencarian
    // nomor telepon wali: siapa pun yang tahu NIS memperoleh nomor orang tuanya.
    expect(tersamar).not.toBe("+6281234567788");
    expect(tersamar).not.toContain("234567");
  });
});

describe("cariSiswaUntukOtp", () => {
  test("cocok lewat NIS maupun NISN", async () => {
    const client = await siapkanDatabase();
    await tambahSiswa(client);

    expect((await cariSiswaUntukOtp(client, "1001"))?.idSiswa).toBe("sis-1");
    expect((await cariSiswaUntukOtp(client, "0091001"))?.idSiswa).toBe("sis-1");
  });

  test("siswa yang sudah lulus tidak bisa dipakai masuk", async () => {
    const client = await siapkanDatabase();
    await tambahSiswa(client, { status: "Lulus" });

    expect(await cariSiswaUntukOtp(client, "1001")).toBeNull();
  });

  test("siswa tanpa nomor wali tidak bisa dipakai masuk", async () => {
    const client = await siapkanDatabase();
    await tambahSiswa(client, { wa: null });

    expect(await cariSiswaUntukOtp(client, "1001")).toBeNull();
  });

  test("nomor induk asing menghasilkan null", async () => {
    const client = await siapkanDatabase();
    await tambahSiswa(client);

    expect(await cariSiswaUntukOtp(client, "9999")).toBeNull();
  });
});

describe("terbitkanOtp dan verifikasiOtp", () => {
  test("kode yang benar diterima sekali saja", async () => {
    const client = await siapkanDatabase();
    const { kode } = await terbitkanOtp(
      client,
      "wali",
      "sis-1",
      "+6281200000000",
    );

    expect((await verifikasiOtp(client, "wali", "sis-1", kode)).hasil).toBe(
      "cocok",
    );
    // Sekali pakai: kode yang sudah dipakai tidak boleh bisa dipakai lagi,
    // termasuk oleh orang lain yang sempat membaca pesannya.
    expect((await verifikasiOtp(client, "wali", "sis-1", kode)).hasil).toBe(
      "habis",
    );
  });

  test("kode asli tidak pernah tersimpan di database", async () => {
    const client = await siapkanDatabase();
    const { kode } = await terbitkanOtp(
      client,
      "wali",
      "sis-1",
      "+6281200000000",
    );

    const baris = await client.execute("SELECT kode_hash FROM wali_otp;");
    // Siapa pun yang bisa membaca database sekolah tidak boleh bisa masuk
    // sebagai wali mana pun.
    expect(String(baris.rows[0]?.kode_hash)).not.toBe(kode);
    expect(String(baris.rows[0]?.kode_hash)).toHaveLength(64);
  });

  test("kode salah mengurangi sisa percobaan, lalu habis", async () => {
    const client = await siapkanDatabase();
    const { kode } = await terbitkanOtp(
      client,
      "wali",
      "sis-1",
      "+6281200000000",
    );
    const salah = kode === "000000" ? "111111" : "000000";

    for (let i = 1; i < OTP_MAKS_PERCOBAAN; i++) {
      const hasil = await verifikasiOtp(client, "wali", "sis-1", salah);
      expect(hasil).toEqual({
        hasil: "salah",
        sisaPercobaan: OTP_MAKS_PERCOBAAN - i,
      });
    }

    expect((await verifikasiOtp(client, "wali", "sis-1", salah)).hasil).toBe(
      "habis",
    );
    // Kode yang benar pun tidak lagi berlaku setelah jatahnya habis.
    expect((await verifikasiOtp(client, "wali", "sis-1", kode)).hasil).toBe(
      "habis",
    );
  });

  test("menerbitkan kode baru membatalkan kode lama", async () => {
    const client = await siapkanDatabase();
    const pertama = await terbitkanOtp(client, "wali", "sis-1", "+62812");
    const kedua = await terbitkanOtp(client, "wali", "sis-1", "+62812");

    // Yang diuji adalah PROPERTINYA, bukan label kegagalannya: hanya boleh ada
    // satu kode yang masih menunggu. Tanpa pembatalan, wali yang menekan "kirim
    // ulang" tiga kali akan punya tiga kode sah sekaligus, dan jendela tebakan
    // penyerang melebar tiga kali lipat.
    const status = await client.execute(
      "SELECT status, COUNT(*) AS total FROM wali_otp GROUP BY status ORDER BY status;",
    );
    expect(
      status.rows.map((baris) => [String(baris.status), Number(baris.total)]),
    ).toEqual([
      ["Dibatalkan", 1],
      ["Menunggu", 1],
    ]);

    // Kode lama tidak mengautentikasi. Labelnya `salah`, bukan `habis`, karena
    // verifikasi selalu memeriksa baris TERBARU — dan membakar satu jatah
    // percobaan pada baris itu justru perilaku yang diinginkan.
    if (pertama.kode !== kedua.kode) {
      expect(
        (await verifikasiOtp(client, "wali", "sis-1", pertama.kode)).hasil,
      ).not.toBe("cocok");
    }
    expect(
      (await verifikasiOtp(client, "wali", "sis-1", kedua.kode)).hasil,
    ).toBe("cocok");
  });

  test("kode kedaluwarsa ditolak", async () => {
    const client = await siapkanDatabase();
    const { kode } = await terbitkanOtp(client, "wali", "sis-1", "+62812");
    await client.execute(
      "UPDATE wali_otp SET expires_at = datetime('now', '-1 minute');",
    );

    expect((await verifikasiOtp(client, "wali", "sis-1", kode)).hasil).toBe(
      "habis",
    );
  });

  test("subjek yang berbeda tidak saling menerima kode", async () => {
    const client = await siapkanDatabase();
    const { kode } = await terbitkanOtp(client, "wali", "sis-1", "+62812");

    expect((await verifikasiOtp(client, "pmb", "sis-1", kode)).hasil).toBe(
      "habis",
    );
    expect((await verifikasiOtp(client, "wali", "sis-2", kode)).hasil).toBe(
      "habis",
    );
  });
});

describe("sesi wali", () => {
  test("token yang sah mengembalikan id_siswa dari sesi", async () => {
    const client = await siapkanDatabase();
    await tambahSiswa(client);
    const { token } = await terbitkanSesiWali(
      client,
      "sis-1",
      "+6281200000000",
      "peramban-uji",
    );

    const sesi = await bacaSesiWali(client, token);
    expect(sesi?.idSiswa).toBe("sis-1");
    expect(sesi?.namaSiswa).toBe("Anisa Putri");
  });

  test("token mentah tidak tersimpan", async () => {
    const client = await siapkanDatabase();
    await tambahSiswa(client);
    const { token } = await terbitkanSesiWali(client, "sis-1", "+62812", null);

    const baris = await client.execute("SELECT token_hash FROM wali_session;");
    expect(String(baris.rows[0]?.token_hash)).not.toBe(token);
  });

  test("token asing ditolak", async () => {
    const client = await siapkanDatabase();
    await tambahSiswa(client);
    await terbitkanSesiWali(client, "sis-1", "+6281200000000", null);

    expect(await bacaSesiWali(client, "token-palsu")).toBeNull();
    expect(await bacaSesiWali(client, "")).toBeNull();
  });

  test("sesi kedaluwarsa ditolak", async () => {
    const client = await siapkanDatabase();
    await tambahSiswa(client);
    const { token } = await terbitkanSesiWali(
      client,
      "sis-1",
      "+6281200000000",
      null,
    );
    await client.execute(
      "UPDATE wali_session SET expires_at = datetime('now', '-1 day');",
    );

    expect(await bacaSesiWali(client, token)).toBeNull();
  });

  test("siswa yang berubah status membuat sesi tidak sah", async () => {
    const client = await siapkanDatabase();
    await tambahSiswa(client);
    const { token } = await terbitkanSesiWali(
      client,
      "sis-1",
      "+6281200000000",
      null,
    );
    await client.execute("UPDATE siswa_data SET status = 'Pindah';");

    expect(await bacaSesiWali(client, token)).toBeNull();
  });

  test("nomor wali yang berubah membuat sesi tidak sah", async () => {
    const client = await siapkanDatabase();
    await tambahSiswa(client);
    const { token } = await terbitkanSesiWali(
      client,
      "sis-1",
      "+6281200000000",
      null,
    );

    // Nomor berubah berarti walinya mungkin orang yang berbeda — sesi lama
    // tidak boleh terus membaca data anak itu.
    await client.execute(
      "UPDATE siswa_data SET no_whatsapp_wali = '+6289999999999';",
    );

    expect(await bacaSesiWali(client, token)).toBeNull();
  });

  test("keluar mencabut sesi di server", async () => {
    const client = await siapkanDatabase();
    await tambahSiswa(client);
    const { token } = await terbitkanSesiWali(
      client,
      "sis-1",
      "+6281200000000",
      null,
    );

    await cabutSesiWali(client, token);

    // Menghapus cookie saja tidak cukup: tokennya tetap sah bila sempat
    // disalin. "Keluar" harus berarti keluar.
    expect(await bacaSesiWali(client, token)).toBeNull();
  });
});

describe("kredensial kata sandi portal wali", () => {
  test("hitungPasswordDefaultWali menghitung formula nisn/nis + unit uppercase", () => {
    expect(hitungPasswordDefaultWali("1001", "0091001", "SMP")).toBe(
      "0091001SMP",
    );
    expect(hitungPasswordDefaultWali("1001", "", "smp")).toBe("1001SMP");
    expect(hitungPasswordDefaultWali("1001", null, null)).toBe("1001");
    expect(hitungPasswordDefaultWali("1001", "0091001", "  smk ")).toBe(
      "0091001SMK",
    );
  });

  test("autentikasi login pertama dengan password default sukses dan menandai perlu ganti", async () => {
    const client = await siapkanDatabase();
    await tambahSiswa(client, {
      id: "sis-1",
      nis: "1001",
      nisn: "0091001",
      unit: "SMP",
    });

    // Login pertama menggunakan password bawaan: 0091001SMP
    const login = await autentikasiPasswordWali(
      client,
      "0091001",
      "0091001SMP",
    );
    expect(login.sukses).toBe(true);
    expect(login.idSiswa).toBe("sis-1");
    expect(login.perluGantiPassword).toBe(true);

    // Verifikasi row wali_kredensial tercipta di database dengan changed_at NULL
    const check = await client.execute(
      "SELECT id_siswa, changed_at FROM wali_kredensial WHERE id_siswa = 'sis-1';",
    );
    expect(check.rows.length).toBe(1);
    expect(check.rows[0]?.changed_at).toBeNull();
  });

  test("autentikasi dengan password salah ditolak", async () => {
    const client = await siapkanDatabase();
    await tambahSiswa(client, {
      id: "sis-1",
      nis: "1001",
      nisn: "0091001",
      unit: "SMP",
    });

    const login = await autentikasiPasswordWali(
      client,
      "0091001",
      "passwordSalah123",
    );
    expect(login.sukses).toBe(false);
  });

  test("ganti password memperbarui kredensial dan menonaktifkan perluGantiPassword", async () => {
    const client = await siapkanDatabase();
    await tambahSiswa(client, {
      id: "sis-1",
      nis: "1001",
      nisn: "0091001",
      unit: "SMP",
    });

    // Initial default auth
    await autentikasiPasswordWali(client, "0091001", "0091001SMP");

    // Ganti password ke yang baru
    const ubah = await gantiPasswordWali(
      client,
      "sis-1",
      "0091001SMP",
      "KataSandiBaru#2026",
    );
    expect(ubah.sukses).toBe(true);

    // Login dengan password baru
    const loginBaru = await autentikasiPasswordWali(
      client,
      "0091001",
      "KataSandiBaru#2026",
    );
    expect(loginBaru.sukses).toBe(true);
    expect(loginBaru.perluGantiPassword).toBe(false);

    // Login dengan password lama sekarang ditolak
    const loginLama = await autentikasiPasswordWali(
      client,
      "0091001",
      "0091001SMP",
    );
    expect(loginLama.sukses).toBe(false);
  });
});
