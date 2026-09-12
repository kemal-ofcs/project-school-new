import type { Metadata } from "next";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { muatProfilSekolah } from "@/lib/server/school-data";
import { namaTampil, profilKosong } from "@/lib/services/school-profile";
import "./globals.css";

/**
 * Layout situs publik.
 *
 * Perhatikan yang TIDAK ada di sini: `AuthProvider`. Panel admin membungkus
 * seluruh aplikasinya dengan sesi `master_operator` beserta RBAC-nya, dan itu
 * benar di sana. Pengunjung situs ini bukan operator — ia tidak punya role,
 * tidak punya permission, dan tidak boleh punya baris di `master_operator`.
 * Sesi wali murid (Fase 5.4) berdiri sendiri di atas `wali_session` dan dibaca
 * lewat middleware, bukan lewat context React yang dibagi dengan staf.
 */

/**
 * Halaman publik di-cache lima menit.
 *
 * Profil sekolah berubah beberapa kali setahun, sementara halaman ini bisa
 * dibuka ratusan kali sehari pada musim pendaftaran. Tanpa ISR, setiap
 * kunjungan menjadi satu perjalanan ke Turso untuk baris yang sama — dan
 * database itu juga melayani setiap terminal pemindai yang sedang mencatat
 * absensi. Lima menit cukup cepat untuk terasa langsung setelah admin
 * menyunting, dan cukup lama untuk melindungi jam sibuk pagi.
 */
export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const hasil = await muatProfilSekolah();
  const profil = hasil.status === "ok" ? hasil.data : profilKosong();
  const nama = namaTampil(profil);

  return {
    title: {
      default: nama,
      template: `%s · ${nama}`,
    },
    description: profil.alamat
      ? `Informasi resmi ${nama}. ${profil.alamat}`
      : `Informasi sekolah, pendaftaran peserta didik baru, dan portal wali murid ${nama}.`,
    openGraph: {
      type: "website",
      siteName: nama,
      title: nama,
      locale: "id_ID",
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const hasil = await muatProfilSekolah();
  // Kerangka halaman tetap tampil meski profil tidak terbaca, supaya pengunjung
  // masih bisa berpindah halaman. Isinya tidak dikarang: `profilKosong()`
  // membuat setiap bagian opsional sekadar tidak dirender. Badan halaman yang
  // menjelaskan apa yang sedang terjadi, bukan header.
  const profil = hasil.status === "ok" ? hasil.data : profilKosong();

  return (
    <html lang="id">
      <body className="flex min-h-dvh flex-col">
        <SiteHeader profil={profil} />
        <div className="flex-1">{children}</div>
        <SiteFooter profil={profil} />
      </body>
    </html>
  );
}
