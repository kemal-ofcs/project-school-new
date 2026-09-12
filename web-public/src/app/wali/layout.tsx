import type { Metadata } from "next";
import Link from "next/link";
import { ambilSesiWali } from "@/lib/server/wali-session";
import { TombolKeluar } from "./TombolKeluar";

export const metadata: Metadata = {
  title: "Portal Wali Murid",
  // Halaman ini menampilkan data seorang anak setelah pemeriksaan identitas.
  // `robots.ts` sudah melarang crawl-nya sejak Fase 5.1; ini penegasan kedua
  // pada level halaman, karena tautan yang dibagikan lewat pesan bisa sampai ke
  // perayap yang tidak membaca robots.txt.
  robots: { index: false, follow: false },
};

/**
 * Portal wali TIDAK PERNAH di-cache.
 *
 * `revalidate = 0` membatalkan warisan 300 detik dari layout situs. Halaman
 * yang di-cache di sini bukan sekadar basi — ia bisa menyajikan HTML berisi
 * data anak A kepada wali anak B, karena cache ISR tidak tahu apa pun tentang
 * cookie sesi.
 */
export const revalidate = 0;

const MENU = [
  { href: "/wali/kehadiran", label: "Kehadiran" },
  { href: "/wali/presensi", label: "Presensi Mapel" },
  { href: "/wali/rapor", label: "Rekap Rapor" },
  { href: "/wali/nilai", label: "Nilai" },
  { href: "/wali/profil", label: "Profil" },
] as const;

export default async function WaliLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const sesi = await ambilSesiWali();

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      {sesi ? (
        <div className="mb-8 border-garis border-b pb-5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <p className="text-sm text-teks-lembut">Portal Wali Murid</p>
              <p className="font-semibold text-xl">{sesi.namaSiswa}</p>
            </div>
            <TombolKeluar />
          </div>
          <nav aria-label="Navigasi portal wali" className="mt-4">
            <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
              {MENU.map((item) => (
                <li key={item.href}>
                  <Link
                    className="text-teks-lembut transition-colors hover:text-aksen"
                    href={item.href}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      ) : null}
      {children}
    </div>
  );
}
