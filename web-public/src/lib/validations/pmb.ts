import { z } from "zod";
import {
  isValidOperatorPhone,
  normalizeOperatorPhone,
} from "@/lib/operators/contact";

/**
 * Validasi pendaftaran PMB.
 *
 * Setiap enum di bawah dieja DUA KALI: di sini, dan sebagai CHECK constraint
 * pada `pmb_pendaftar` / `pmb_berkas` di KEDUA jalur provisioning. Keduanya
 * wajib tetap sama. Nilai yang lolos di sini tetapi ditolak CHECK akan gagal
 * saat INSERT, dan nilai yang ditolak di sini tetapi diterima CHECK berarti
 * validasinya sekadar hiasan.
 *
 * Yang TIDAK dilakukan: menormalkan nilai asing menjadi nilai bawaan. Pelajaran
 * `notifikasi_wa` berlaku di sini juga — menormalkan diam-diam mengubah bug
 * klien menjadi baris yang salah tanpa jejak bahwa ada yang keliru.
 */

export const PMB_STATUS = [
  "Baru",
  "Berkas Lengkap",
  "Terverifikasi",
  "Diterima",
  "Ditolak",
  "Dibatalkan",
  "Terdaftar",
] as const;

export const PMB_JENIS_BERKAS = [
  "kartu_keluarga",
  "akta_lahir",
  "ijazah",
  "rapor",
  "foto",
  "lainnya",
] as const;

export const PMB_MIME_BERKAS = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

/**
 * Batas ukuran satu berkas, dalam byte sebelum base64.
 *
 * Angka yang sama dengan foto siswa di panel admin. Base64 menggembungkan
 * ±4/3, jadi batas panjang stringnya dihitung dari sini alih-alih ditulis
 * sebagai angka kedua yang bisa bergeser sendiri.
 */
export const PMB_BERKAS_MAX_BYTE = 500 * 1024;
export const PMB_BERKAS_MAX_BASE64 = Math.ceil(PMB_BERKAS_MAX_BYTE / 3) * 4;

const teksWajib = (maks: number) => z.string().trim().min(1).max(maks);
const teksOpsional = (maks: number) =>
  z
    .string()
    .trim()
    .max(maks)
    .transform((nilai) => nilai || null)
    .nullable();

/** `YYYY-MM-DD`, dan benar-benar tanggal yang ada di kalender. */
const tanggal = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD")
  .refine((nilai) => {
    const [tahun, bulan, hari] = nilai.split("-").map(Number) as [
      number,
      number,
      number,
    ];
    const waktu = new Date(Date.UTC(tahun, bulan - 1, hari));
    // `new Date(2026, 1, 31)` menghasilkan 3 Maret tanpa mengeluh. Membandingkan
    // hasilnya kembali ke bagian aslinya adalah satu-satunya cara menolak
    // tanggal yang tidak ada.
    return (
      waktu.getUTCFullYear() === tahun &&
      waktu.getUTCMonth() === bulan - 1 &&
      waktu.getUTCDate() === hari
    );
  }, "Tanggal tidak ada di kalender");

export const berkasPendaftaranSchema = z
  .object({
    jenis: z.enum(PMB_JENIS_BERKAS),
    namaFile: teksWajib(180),
    mime: z.enum(PMB_MIME_BERKAS),
    ukuranByte: z.number().int().positive().max(PMB_BERKAS_MAX_BYTE),
    kontenBase64: z.string().min(1).max(PMB_BERKAS_MAX_BASE64),
  })
  .strict();

export const pendaftaranSchema = z
  .object({
    namaLengkap: teksWajib(120),
    nisn: teksOpsional(20),
    jenisKelamin: z.enum(["L", "P"]),
    tempatLahir: teksOpsional(80),
    tanggalLahir: tanggal,
    asalSekolah: teksOpsional(120),
    alamat: teksOpsional(255),
    namaWali: teksWajib(120),
    noWhatsappWali: z
      .string()
      .trim()
      .min(1)
      .refine(isValidOperatorPhone, "Nomor WhatsApp tidak valid")
      .transform(normalizeOperatorPhone),
    emailWali: z
      .string()
      .trim()
      .max(120)
      .email()
      .optional()
      .nullable()
      .or(z.literal("").transform(() => null)),
    pilihanJurusan: teksOpsional(80),
    // Maksimal enam berkas: satu per jenis. Batasnya ada karena satu permintaan
    // membawa seluruh berkasnya sekaligus, dan tanpa batas sebuah permintaan
    // tunggal bisa membawa puluhan megabyte base64.
    berkas: z.array(berkasPendaftaranSchema).max(6).default([]),
  })
  .strict();

export type MasukanPendaftaran = z.infer<typeof pendaftaranSchema>;

export const cekStatusSchema = z
  .object({
    nomorPendaftaran: teksWajib(40),
    // Tanggal lahir sebagai faktor kedua. Ini bukan rahasia yang kuat, dan
    // memang tidak diperlakukan begitu: rate limit-lah yang menahan penebakan,
    // dan Fase 5.4 menggantinya dengan OTP ke nomor wali terdaftar.
    tanggalLahir: tanggal,
  })
  .strict();

export type MasukanCekStatus = z.infer<typeof cekStatusSchema>;

/**
 * Nomor pendaftaran yang dibaca manusia dan dibacakan lewat telepon.
 *
 * Formatnya `PMB-<tahun>-<6 karakter>`. Alfabetnya sengaja membuang huruf dan
 * angka yang mudah tertukar saat didikte atau disalin dari kertas — O/0, I/1,
 * S/5, B/8 — karena nomor ini akan dieja lewat telepon oleh orang tua kepada
 * panitia, dan satu karakter salah berarti pendaftaran yang tidak ditemukan.
 */
const ALFABET_NOMOR = "ACDEFGHJKLMNPQRTUVWXY2346789";

export function buatNomorPendaftaran(
  tahun: number,
  acak: () => number = Math.random,
): string {
  let sufiks = "";
  for (let index = 0; index < 6; index++) {
    sufiks += ALFABET_NOMOR[Math.floor(acak() * ALFABET_NOMOR.length)];
  }
  return `PMB-${tahun}-${sufiks}`;
}

/**
 * Id baris: `pmb-<epoch ms>-<48 bit acak>`.
 *
 * Bentuk yang sama dengan `new_payroll_id` di Rust, dan lahir dari kegagalan
 * yang sama: id epoch-DETIK telanjang bertabrakan di dalam satu penyimpanan
 * massal. Bagian acaknya yang menjamin keunikan; bagian waktunya hanya membuat
 * id terurut secara alami saat dibaca manusia.
 */
export function buatIdPendaftar(
  sekarang: number = Date.now(),
  acak: () => number = Math.random,
): string {
  const tinggi = Math.floor(acak() * 0x1000000);
  const rendah = Math.floor(acak() * 0x1000000);
  const bit48 = (tinggi * 0x1000000 + rendah)
    .toString(16)
    .padStart(12, "0")
    .slice(-12);
  return `pmb-${sekarang}-${bit48}`;
}

export function buatIdBerkas(
  sekarang: number = Date.now(),
  acak: () => number = Math.random,
): string {
  return buatIdPendaftar(sekarang, acak).replace(/^pmb-/, "pmbf-");
}
