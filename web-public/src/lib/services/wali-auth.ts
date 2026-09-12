import type { Client } from "@libsql/client";

/**
 * Masuk portal wali: OTP ke nomor WhatsApp yang sudah terdaftar di sekolah.
 *
 * TIDAK ada password, dan itu keputusan, bukan kemalasan. Wali murid membuka
 * portal ini beberapa kali setahun; kata sandi yang jarang dipakai akan lupa,
 * dan memulihkannya menuntut satu lagi alur bukti identitas — persis kerumitan
 * yang sudah dibayar mahal untuk "Lupa Password" operator. Nomor WhatsApp
 * di `siswa_data.no_whatsapp_wali` sudah ada, sudah dipakai mengirim notifikasi
 * bolos sejak Fase 4, dan karenanya sudah terverifikasi secara de facto: kalau
 * salah, notifikasi selama ini tidak sampai dan sekolah sudah tahu.
 *
 * Seluruh perbandingan waktu dihitung SQLite (`datetime('now')`). Baris ini bisa
 * dibaca panel admin yang ditulis Rust, dan dua sumber jam yang berbeda
 * menghasilkan kedaluwarsa yang tidak bisa dipercaya.
 */

/** Umur satu kode OTP. Cukup untuk membaca pesan, terlalu pendek untuk ditebak. */
export const OTP_UMUR_MENIT = 10;

/** Percobaan salah sebelum kode dibatalkan dan wali harus meminta yang baru. */
export const OTP_MAKS_PERCOBAAN = 5;

/** Umur sesi wali. Ponsel keluarga jarang berpindah tangan; tujuh hari wajar. */
export const SESI_UMUR_HARI = 7;

async function sha256Hex(nilai: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(nilai),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Kode enam digit dari sumber acak kriptografis.
 *
 * `Math.random()` tidak dipakai: nilainya dapat diprediksi dari keluaran
 * sebelumnya, dan di sini keluarannya adalah kunci masuk ke data seorang anak.
 */
export function buatKodeOtp(): string {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return String((buffer[0] as number) % 1_000_000).padStart(6, "0");
}

export function buatTokenSesi(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function buatId(prefix: string): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${prefix}-${Math.floor(Date.now() / 1000)}-${hex}`;
}

/**
 * Nomor yang ditampilkan kembali ke layar, tersamar.
 *
 * Empat digit terakhir cukup bagi wali untuk mengenali nomornya sendiri, dan
 * tidak cukup bagi orang lain untuk mengetahuinya. Menampilkan nomor utuh akan
 * mengubah layar ini menjadi alat pencarian nomor telepon wali murid: siapa pun
 * yang tahu NIS seorang anak akan memperoleh nomor orang tuanya.
 */
export function samarkanNomor(nomor: string): string {
  const bersih = nomor.trim();
  if (bersih.length <= 4) return "••••";
  return `${bersih.slice(0, 5)}••••${bersih.slice(-4)}`;
}

export interface SiswaUntukOtp {
  idSiswa: string;
  namaLengkap: string;
  nomorWali: string;
}

/**
 * Cari siswa aktif berdasarkan NIS atau NISN.
 *
 * Hanya siswa `Aktif` yang bisa dipakai masuk. Siswa yang sudah lulus, pindah,
 * atau keluar tidak lagi punya wali yang berhak melihat riwayat kehadirannya
 * lewat portal ini.
 */
export async function cariSiswaUntukOtp(
  client: Client,
  nomorInduk: string,
): Promise<SiswaUntukOtp | null> {
  const kunci = nomorInduk.trim();
  if (!kunci) return null;

  const hasil = await client.execute({
    sql: `SELECT id_siswa, nama_lengkap, no_whatsapp_wali
            FROM siswa_data
           WHERE status = 'Aktif'
             AND no_whatsapp_wali IS NOT NULL
             AND TRIM(no_whatsapp_wali) <> ''
             AND (TRIM(nis) = ? OR TRIM(nisn) = ?)
           LIMIT 1;`,
    args: [kunci, kunci],
  });

  const baris = hasil.rows[0];
  if (!baris) return null;

  return {
    idSiswa: String(baris.id_siswa),
    namaLengkap: String(baris.nama_lengkap ?? ""),
    nomorWali: String(baris.no_whatsapp_wali ?? "").trim(),
  };
}

export interface OtpTerbit {
  idOtp: string;
  kode: string;
  nomorTersamar: string;
}

/**
 * Terbitkan satu OTP, membatalkan yang masih menunggu untuk subjek yang sama.
 *
 * Pembatalan itu penting: tanpa itu, seorang wali yang menekan "kirim ulang"
 * tiga kali akan punya tiga kode sah sekaligus, dan jendela tebakan penyerang
 * ikut melebar tiga kali lipat. Hanya kode TERAKHIR yang berlaku.
 */
export async function terbitkanOtp(
  client: Client,
  subjek: "wali" | "pmb",
  subjekId: string,
  nomorTujuan: string,
): Promise<OtpTerbit> {
  const kode = buatKodeOtp();
  const idOtp = buatId("otp");

  await client.batch(
    [
      {
        sql: `UPDATE wali_otp
                 SET status = 'Dibatalkan'
               WHERE subjek = ? AND subjek_id = ? AND status = 'Menunggu';`,
        args: [subjek, subjekId],
      },
      {
        sql: `INSERT INTO wali_otp (
                id, subjek, subjek_id, tujuan_nomor, kode_hash,
                attempt_count, status, created_at, expires_at
              ) VALUES (?, ?, ?, ?, ?, 0, 'Menunggu',
                        datetime('now'), datetime('now', ?));`,
        args: [
          idOtp,
          subjek,
          subjekId,
          nomorTujuan,
          await sha256Hex(kode),
          `+${OTP_UMUR_MENIT} minutes`,
        ],
      },
    ],
    "write",
  );

  return { idOtp, kode, nomorTersamar: samarkanNomor(nomorTujuan) };
}

export async function tandaiPengirimanOtp(
  client: Client,
  idOtp: string,
  berhasil: boolean,
  galat?: string,
): Promise<void> {
  await client.execute({
    sql: `UPDATE wali_otp
             SET delivery_status = ?,
                 delivery_error = ?,
                 status = CASE WHEN ? = 1 THEN status ELSE 'Dibatalkan' END
           WHERE id = ?;`,
    // OTP yang gagal dikirim DIBATALKAN, tidak dibiarkan menunggu. Pemiliknya
    // tidak akan pernah memasukkannya, dan baris yang menggantung hanya menahan
    // jatah percobaan berikutnya — pola yang sama dengan antrean WhatsApp, di
    // mana baris yang dilewati bertahan `Menunggu` selamanya.
    args: [
      berhasil ? "Terkirim" : "Gagal",
      berhasil ? null : (galat ?? "Pengiriman ditolak provider"),
      berhasil ? 1 : 0,
      idOtp,
    ],
  });
}

export type HasilVerifikasi =
  | { hasil: "cocok"; subjekId: string; nomorTujuan: string }
  | { hasil: "salah"; sisaPercobaan: number }
  | { hasil: "habis" };

/**
 * Verifikasi kode.
 *
 * Kode yang kedaluwarsa, sudah terpakai, dibatalkan, ATAU tidak pernah ada
 * menghasilkan `habis` — satu bentuk balasan untuk semuanya. Membedakannya
 * memberitahu penyerang apakah ia sedang menebak pada permintaan yang benar.
 */
export async function verifikasiOtp(
  client: Client,
  subjek: "wali" | "pmb",
  subjekId: string,
  kode: string,
): Promise<HasilVerifikasi> {
  const hasil = await client.execute({
    sql: `SELECT id, kode_hash, attempt_count, tujuan_nomor
            FROM wali_otp
           WHERE subjek = ?
             AND subjek_id = ?
             AND status = 'Menunggu'
             AND expires_at > datetime('now')
        ORDER BY created_at DESC
           LIMIT 1;`,
    args: [subjek, subjekId],
  });

  const baris = hasil.rows[0];
  if (!baris) return { hasil: "habis" };

  const idOtp = String(baris.id);
  const percobaan = Number(baris.attempt_count ?? 0);

  if ((await sha256Hex(kode.trim())) !== String(baris.kode_hash)) {
    const berikutnya = percobaan + 1;
    await client.execute({
      sql: `UPDATE wali_otp
               SET attempt_count = ?,
                   status = CASE WHEN ? >= ? THEN 'Dibatalkan' ELSE status END
             WHERE id = ?;`,
      args: [berikutnya, berikutnya, OTP_MAKS_PERCOBAAN, idOtp],
    });
    if (berikutnya >= OTP_MAKS_PERCOBAAN) return { hasil: "habis" };
    return { hasil: "salah", sisaPercobaan: OTP_MAKS_PERCOBAAN - berikutnya };
  }

  await client.execute({
    sql: "UPDATE wali_otp SET status = 'Terpakai', used_at = datetime('now') WHERE id = ?;",
    args: [idOtp],
  });

  return {
    hasil: "cocok",
    subjekId,
    nomorTujuan: String(baris.tujuan_nomor ?? ""),
  };
}

/**
 * Terbitkan sesi wali.
 *
 * Yang disimpan adalah HASH tokennya. Tabel ini bisa dibaca siapa pun yang punya
 * akses database sekolah; menyimpan token mentah berarti mereka bisa memakai
 * ulang sesi wali mana pun tanpa jejak.
 *
 * `no_whatsapp_wali` dibekukan di baris sesi supaya perubahan nomor di
 * `siswa_data` — oleh operator, atau lewat pull snapshot — langsung membuat
 * sesi lama tidak sah pada pemeriksaan berikutnya. Nomor yang berubah berarti
 * walinya mungkin orang yang berbeda.
 */
export async function terbitkanSesiWali(
  client: Client,
  idSiswa: string,
  nomorWali: string,
  userAgent: string | null,
): Promise<{ token: string; sessionId: string }> {
  const token = buatTokenSesi();
  const sessionId = buatId("wsesi");

  await client.execute({
    sql: `INSERT INTO wali_session (
            session_id, token_hash, id_siswa, no_whatsapp_wali,
            created_at, expires_at, last_seen_at, user_agent_hash
          ) VALUES (?, ?, ?, ?, datetime('now'), datetime('now', ?),
                    datetime('now'), ?);`,
    args: [
      sessionId,
      await sha256Hex(token),
      idSiswa,
      nomorWali,
      `+${SESI_UMUR_HARI} days`,
      userAgent ? await sha256Hex(userAgent) : null,
    ],
  });

  return { token, sessionId };
}

export interface SesiWali {
  sessionId: string;
  idSiswa: string;
  namaSiswa: string;
}

/**
 * Validasi sesi, dan kembalikan `id_siswa` yang boleh dibaca.
 *
 * INI SATU-SATUNYA sumber `id_siswa` bagi seluruh endpoint portal. Tidak ada
 * endpoint yang menerimanya sebagai parameter, dan itu bukan kehati-hatian
 * berlebihan: di portal publik, mengganti `?id=` di address bar adalah kelas
 * kerentanan nomor satu, dan konsekuensinya di sini adalah riwayat kehadiran
 * anak orang lain. Aturan yang sama dengan "sakelar role dibaca dari SESI,
 * tidak pernah dari payload scan" di scanner.
 *
 * Tiga syarat diperiksa dalam SATU query, karena memisahkannya membuka jendela
 * di mana sesi sudah tidak sah tetapi masih terpakai: sesi belum kedaluwarsa
 * dan belum dicabut, siswanya masih `Aktif`, dan nomor walinya masih sama
 * dengan yang dibekukan saat sesi lahir.
 */
export async function bacaSesiWali(
  client: Client,
  token: string,
): Promise<SesiWali | null> {
  if (!token) return null;

  const hasil = await client.execute({
    sql: `SELECT w.session_id, w.id_siswa, s.nama_lengkap
            FROM wali_session w
            JOIN siswa_data s ON s.id_siswa = w.id_siswa
           WHERE w.token_hash = ?
             AND w.revoked_at IS NULL
             AND w.expires_at > datetime('now')
             AND s.status = 'Aktif'
             AND TRIM(s.no_whatsapp_wali) = TRIM(w.no_whatsapp_wali)
           LIMIT 1;`,
    args: [await sha256Hex(token)],
  });

  const baris = hasil.rows[0];
  if (!baris) return null;

  return {
    sessionId: String(baris.session_id),
    idSiswa: String(baris.id_siswa),
    namaSiswa: String(baris.nama_lengkap ?? ""),
  };
}

/** Perbarui jejak pemakaian terakhir. Satu-satunya tulisan yang dilakukan sesi wali. */
export async function sentuhSesiWali(
  client: Client,
  sessionId: string,
): Promise<void> {
  await client.execute({
    sql: "UPDATE wali_session SET last_seen_at = datetime('now') WHERE session_id = ?;",
    args: [sessionId],
  });
}

/**
 * Cabut sesi di SERVER, bukan sekadar menghapus cookie.
 *
 * Cookie yang dihapus hanya hilang dari peramban itu; tokennya tetap sah bila
 * sempat disalin. "Keluar" harus berarti keluar.
 */
export async function cabutSesiWali(
  client: Client,
  token: string,
): Promise<void> {
  await client.execute({
    sql: `UPDATE wali_session
             SET revoked_at = datetime('now'), revoked_reason = 'logout'
           WHERE token_hash = ? AND revoked_at IS NULL;`,
    args: [await sha256Hex(token)],
  });
}
