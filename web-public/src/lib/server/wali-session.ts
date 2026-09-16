import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getReadyPublicDatabase } from "@/lib/server/db";
import {
  bacaSesiWali,
  SESI_UMUR_HARI,
  type SesiWali,
} from "@/lib/services/wali-auth";

/**
 * Nama cookie sesi wali.
 *
 * Berbeda dari cookie sesi operator supaya keduanya tidak pernah tertukar
 * meski suatu hari kedua aplikasi dilayani dari satu domain lewat rewrite.
 */
export const COOKIE_SESI_WALI = "sppg_wali";

export const OPSI_COOKIE_SESI = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESI_UMUR_HARI * 24 * 60 * 60,
};

/**
 * Sesi wali untuk permintaan ini, atau null.
 *
 * INI SATU-SATUNYA tempat `id_siswa` boleh berasal. Tidak ada halaman maupun
 * endpoint portal yang menerimanya sebagai parameter — mengganti `?id=` di
 * address bar adalah kelas kerentanan nomor satu pada portal publik, dan
 * konsekuensinya di sini adalah riwayat kehadiran anak orang lain.
 *
 * `cache()` menyatukan pemanggilan dalam satu permintaan: layout membacanya
 * untuk menampilkan nama anak, dan badan halaman membacanya lagi untuk
 * memuat datanya.
 */
export const ambilSesiWali = cache(async (): Promise<SesiWali | null> => {
  const token = (await cookies()).get(COOKIE_SESI_WALI)?.value;
  if (!token) return null;

  try {
    return await bacaSesiWali(await getReadyPublicDatabase(), token);
  } catch (error) {
    // Skema belum siap atau database tidak terjangkau. Diperlakukan sebagai
    // "belum masuk" — TIDAK didiamkan diam-diam: dicatat supaya operator punya
    // jejak, dan pengunjung diarahkan ke layar masuk yang menjelaskan keadaan
    // alih-alih melihat halaman kosong tanpa sebab.
    console.error("[web-public] gagal memvalidasi sesi wali:", error);
    return null;
  }
});

/**
 * Sesi wali yang SUDAH boleh melihat data anak — atau pengalihan.
 *
 * Dipakai oleh kelima halaman data portal. Dua penolakannya sengaja hidup di
 * SATU tempat, bukan disalin ke tiap halaman:
 *
 * 1. Tanpa sesi → layar masuk.
 * 2. Password masih bawaan sistem (`changed_at IS NULL`) → layar ganti
 *    password, dan TIDAK bisa dilewati.
 *
 * Yang kedua itu penegakan yang sebenarnya. Versi pertama fitur password wali
 * hanya mengembalikan `perluGantiPassword` sekali di balasan login sementara
 * cookie sesi penuh sudah ikut terpasang di balasan yang sama, sehingga layar
 * ganti password hanyalah dialog di sisi klien: menutupnya lalu mengetik
 * `/wali/kehadiran` sudah cukup untuk masuk. Password bawaannya berformula
 * `NISN + unit` — bisa dihitung siapa pun yang memegang dokumen anak itu —
 * jadi kewajiban menggantinya adalah satu-satunya penyeimbangnya.
 */
export async function wajibSesiWaliSiap(): Promise<SesiWali> {
  const sesi = await ambilSesiWali();
  if (!sesi) redirect("/wali");
  if (sesi.perluGantiPassword) redirect("/wali/ganti-password");
  return sesi;
}
