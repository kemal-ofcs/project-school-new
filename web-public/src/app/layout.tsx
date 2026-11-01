import type { Metadata } from "next";
import { Playfair_Display, Plus_Jakarta_Sans } from "next/font/google";
import { EfekDesktop } from "@/components/visual/EfekDesktop";
import { SKRIP_GERBANG_EFEK } from "@/components/visual/gerbang-efek";
import { muatProfilSekolah } from "@/lib/server/school-data";
import { namaTampil, profilKosong } from "@/lib/services/school-profile";
import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

// Judul section: serif editorial supaya beranda terasa berwibawa seperti
// buku induk sekolah; teks isi tetap Plus Jakarta Sans demi keterbacaan.
const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-judul",
  display: "swap",
});

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
  // Header dan footer ada di `(umum)/layout.tsx` dan `[unit]/layout.tsx`, karena
  // situs unit memakai isi unitnya sendiri. Membaca alamat di sini untuk
  // membedakannya akan mematikan cache lima menit seluruh situs.
  return (
    // `suppressHydrationWarning`: skrip gerbang di bawah memasang
    // `data-efek` pada <html> sebelum React mengambil alih halaman.
    <html lang="id" suppressHydrationWarning>
      <head>
        <script
          // Harus berjalan sebelum halaman tergambar, supaya judul desktop
          // tidak tampil lalu tiba-tiba mulai beranimasi. Isinya konstanta
          // dari kode, bukan data dari luar.
          // biome-ignore lint/security/noDangerouslySetInnerHtml: skrip gerbang konstanta
          dangerouslySetInnerHTML={{ __html: SKRIP_GERBANG_EFEK }}
        />
      </head>
      <body
        className={`${plusJakartaSans.variable} ${playfair.variable} font-sans flex min-h-dvh flex-col`}
      >
        {children}
        <EfekDesktop />
      </body>
    </html>
  );
}
