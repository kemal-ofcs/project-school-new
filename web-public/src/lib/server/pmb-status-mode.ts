import "server-only";

import type { Client } from "@libsql/client";
import { readFullWaConfig } from "@/lib/services/wa-provider";

/**
 * Cara pendaftar membuktikan bahwa pendaftaran itu miliknya.
 *
 * DUA jalur, dan pemilihannya ada di SERVER — bukan pilihan pengguna, karena
 * pengguna akan selalu memilih yang paling mudah dan itu menghapus gunanya.
 *
 *   `otp`           Kode enam digit ke nomor WhatsApp wali yang dicatat saat
 *                   mendaftar. Bukti penguasaan nomor, jauh lebih kuat.
 *   `tanggal_lahir` Cadangan ketika gateway WhatsApp belum dikonfigurasi.
 *
 * Cabang kedua ADA karena pelajaran yang sudah dibayar mahal di repo ini dan
 * dieja di CLAUDE.md: email yang belum dikonfigurasi membuat pengiriman selalu
 * gagal, dan kegagalan itu MEMBATALKAN permintaannya — fitur "Lupa Password"
 * mati total di seluruh pemasangan Mode Database Lokal. Kalau cek status hanya
 * punya jalur OTP, sekolah yang belum menyambungkan gateway WhatsApp akan
 * memasang situs PMB yang menerima pendaftaran tetapi tidak pernah bisa
 * memberitahu hasilnya.
 *
 * Urutannya mengikuti `password_reset_route`: konfigurasi yang AKTIF menang,
 * dan ketiadaannya jatuh ke jalur cadangan — bukan ke kegagalan.
 */
export type ModeCekStatus = "otp" | "tanggal_lahir";

export async function pilihModeCekStatus(
  client: Client,
): Promise<ModeCekStatus> {
  try {
    const konfigurasi = await readFullWaConfig(client);
    return konfigurasi?.isActive && konfigurasi.apiKey
      ? "otp"
      : "tanggal_lahir";
  } catch (error) {
    // Konfigurasi tidak terbaca. Jatuh ke jalur cadangan alih-alih menolak
    // melayani — dicatat, bukan didiamkan, karena ini juga bisa berarti
    // databasenya sedang bermasalah.
    console.error("[web-public] gagal membaca konfigurasi WhatsApp:", error);
    return "tanggal_lahir";
  }
}
