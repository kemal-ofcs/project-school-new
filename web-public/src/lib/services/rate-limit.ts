import type { Client } from "@libsql/client";

/**
 * Rate limit untuk endpoint publik, di atas tabel `auth_login_rate_limit`.
 *
 * Tabel itu sudah ada dan kuncinya generik (`rate_key TEXT PRIMARY KEY`),
 * sehingga tidak perlu tabel baru — cukup ruang nama kunci sendiri. Itu juga
 * berarti pembersihan dan pemantauan yang sudah berjalan untuk login operator
 * ikut mencakup ini.
 *
 * Kuncinya diberi prefiks `pmb:` supaya tidak mungkin bertabrakan dengan kunci
 * login operator. Sebuah tabrakan akan memblokir hal yang salah: alamat IP yang
 * gagal login sebagai operator akan ikut terblokir dari mendaftar PMB, dan
 * sebaliknya — dua kebijakan berbeda yang saling mengunci tanpa ada yang tahu
 * kenapa.
 *
 * SELURUH perbandingan waktu dihitung SQLite. Baris ini juga ditulis panel
 * admin dan Rust; `new Date()` di proses Node akan membandingkan jam yang
 * berbeda dengan jam yang menuliskannya.
 */

export interface KebijakanRateLimit {
  /** Berapa percobaan sebelum diblokir. */
  maksPercobaan: number;
  /** Panjang jendela penghitungan, dalam menit. */
  jendelaMenit: number;
  /** Lama pemblokiran setelah ambang terlampaui, dalam menit. */
  blokirMenit: number;
}

export const KEBIJAKAN_DAFTAR_PMB: KebijakanRateLimit = {
  maksPercobaan: 5,
  jendelaMenit: 30,
  blokirMenit: 30,
};

/**
 * Cek status lebih ketat daripada mendaftar, dan itu disengaja.
 *
 * Mendaftar menghasilkan baris baru yang akan dilihat manusia; menebak status
 * adalah upaya membaca data orang lain dengan mencoba kombinasi nomor dan
 * tanggal lahir. Yang kedua tidak punya alasan sah untuk diulang belasan kali.
 */
export const KEBIJAKAN_CEK_STATUS: KebijakanRateLimit = {
  maksPercobaan: 8,
  jendelaMenit: 15,
  blokirMenit: 15,
};

export interface HasilRateLimit {
  diizinkan: boolean;
  /** Detik tersisa sampai boleh mencoba lagi; 0 bila diizinkan. */
  cobaLagiDetik: number;
}

/**
 * Apakah kunci ini sedang diblokir.
 *
 * Dipanggil SEBELUM pekerjaan dilakukan, sehingga permintaan yang diblokir
 * tidak pernah menyentuh tabel PMB sama sekali.
 */
export async function periksaRateLimit(
  client: Client,
  kunci: string,
): Promise<HasilRateLimit> {
  const hasil = await client.execute({
    sql: `SELECT CAST(
              (julianday(blocked_until) - julianday('now')) * 86400 AS INTEGER
            ) AS sisa_detik
            FROM auth_login_rate_limit
           WHERE rate_key = ?
             AND blocked_until IS NOT NULL
             AND blocked_until > datetime('now')
           LIMIT 1;`,
    args: [kunci],
  });

  const sisa = Number(hasil.rows[0]?.sisa_detik ?? 0);
  if (sisa <= 0) return { diizinkan: true, cobaLagiDetik: 0 };
  return { diizinkan: false, cobaLagiDetik: Math.max(1, sisa) };
}

/**
 * Catat satu percobaan, dan blokir bila ambangnya terlampaui.
 *
 * Jendelanya bergulir: percobaan yang lebih tua dari `jendelaMenit` membuat
 * hitungannya dimulai ulang alih-alih menumpuk selamanya. Tanpa itu, sebuah
 * alamat IP bersama — warnet, atau satu sekolah yang mendaftarkan siswanya
 * beramai-ramai dari satu jaringan — akan terblokir permanen setelah cukup
 * banyak pendaftaran yang sah.
 */
export async function catatPercobaan(
  client: Client,
  kunci: string,
  kebijakan: KebijakanRateLimit,
): Promise<void> {
  await client.execute({
    sql: `INSERT INTO auth_login_rate_limit (
            rate_key, attempt_count, window_started_at, blocked_until, updated_at
          ) VALUES (?, 1, datetime('now'), NULL, datetime('now'))
          ON CONFLICT(rate_key) DO UPDATE SET
            attempt_count = CASE
              WHEN auth_login_rate_limit.window_started_at <= datetime('now', ?)
                THEN 1
              ELSE auth_login_rate_limit.attempt_count + 1
            END,
            window_started_at = CASE
              WHEN auth_login_rate_limit.window_started_at <= datetime('now', ?)
                THEN datetime('now')
              ELSE auth_login_rate_limit.window_started_at
            END,
            blocked_until = CASE
              WHEN auth_login_rate_limit.window_started_at > datetime('now', ?)
               AND auth_login_rate_limit.attempt_count + 1 >= ?
                THEN datetime('now', ?)
              ELSE auth_login_rate_limit.blocked_until
            END,
            updated_at = datetime('now');`,
    args: [
      kunci,
      `-${kebijakan.jendelaMenit} minutes`,
      `-${kebijakan.jendelaMenit} minutes`,
      `-${kebijakan.jendelaMenit} minutes`,
      kebijakan.maksPercobaan,
      `+${kebijakan.blokirMenit} minutes`,
    ],
  });
}

/**
 * Bersihkan hitungan setelah percobaan yang berhasil.
 *
 * Pendaftaran yang berhasil bukan percobaan gagal, dan tidak boleh ikut
 * menghabiskan jatah keluarga berikutnya yang mendaftar dari jaringan yang
 * sama.
 */
export async function bersihkanPercobaan(
  client: Client,
  kunci: string,
): Promise<void> {
  await client.execute({
    sql: "DELETE FROM auth_login_rate_limit WHERE rate_key = ?;",
    args: [kunci],
  });
}

/**
 * Kunci rate limit dari alamat pemanggil.
 *
 * Alamatnya di-hash, bukan disimpan apa adanya: tabel ini bisa dibaca siapa pun
 * yang punya akses database sekolah, dan daftar alamat IP pengunjung situs
 * publik bukan sesuatu yang perlu ikut tersimpan di sana.
 */
export async function kunciRateLimit(
  ruang: string,
  alamat: string,
): Promise<string> {
  const data = new TextEncoder().encode(`${ruang}:${alamat}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const hex = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `pmb:${ruang}:${hex}`;
}
