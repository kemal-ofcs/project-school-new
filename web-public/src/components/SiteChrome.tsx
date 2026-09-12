import Link from "next/link";
import type { SchoolProfile } from "@/lib/services/school-profile";
import { namaTampil } from "@/lib/services/school-profile";

/**
 * Kerangka halaman publik: navigasi, isi, dan footer.
 *
 * Komponen di situs ini sengaja TIDAK berbagi berkas dengan panel admin.
 * `src/components` di web-desktop dibangun untuk operator yang memakainya
 * berjam-jam di layar besar — basis gelap, kepadatan tinggi, banyak kontrol.
 * Pengunjung situs ini membukanya sekali, di ponsel, untuk mencari satu hal.
 * Menyatukan keduanya akan memaksa salah satu memakai bahasa visual yang bukan
 * miliknya.
 */

export const NAVIGASI = [
  { href: "/", label: "Beranda" },
  { href: "/profil", label: "Profil" },
  { href: "/program", label: "Program" },
  { href: "/pmb", label: "Pendaftaran" },
  { href: "/berita", label: "Berita" },
  { href: "/kontak", label: "Kontak" },
] as const;

export function SiteHeader({ profil }: { profil: SchoolProfile }) {
  const nama = namaTampil(profil);

  return (
    <header className="border-garis border-b bg-latar">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-3 px-6 py-4">
        <Link className="font-semibold text-lg" href="/">
          {nama}
        </Link>
        <nav aria-label="Navigasi utama" className="ml-auto">
          <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            {NAVIGASI.map((item) => (
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
    </header>
  );
}

export function SiteFooter({ profil }: { profil: SchoolProfile }) {
  const nama = namaTampil(profil);
  const tahun = new Date().getFullYear();

  return (
    <footer className="mt-16 border-garis border-t bg-latar-lembut">
      <div className="mx-auto grid max-w-5xl gap-8 px-6 py-10 sm:grid-cols-2">
        <div>
          <p className="font-semibold">{nama}</p>
          {profil.alamat ? (
            <p className="mt-2 text-sm text-teks-lembut leading-relaxed">
              {profil.alamat}
            </p>
          ) : null}
        </div>
        <div className="text-sm text-teks-lembut">
          {profil.telepon ? (
            <p>
              Telepon:{" "}
              <a className="hover:text-aksen" href={`tel:${profil.telepon}`}>
                {profil.telepon}
              </a>
            </p>
          ) : null}
          {profil.email ? (
            <p className="mt-1">
              Surel:{" "}
              <a className="hover:text-aksen" href={`mailto:${profil.email}`}>
                {profil.email}
              </a>
            </p>
          ) : null}
          <p className="mt-4">
            © {tahun} {nama}
          </p>
        </div>
      </div>
    </footer>
  );
}

/**
 * Ditampilkan ketika sekolah belum mengisi profilnya.
 *
 * Situs publik tidak boleh mengarang nama, alamat, atau nomor telepon untuk
 * menutupi kekosongan itu — pengunjung akan menelepon nomor yang tidak ada.
 * Yang benar adalah mengatakan apa adanya, dan menyebut siapa yang bisa
 * memperbaikinya.
 */
export function ProfilBelumLengkap() {
  return (
    <div className="rounded-lg border border-garis bg-latar-lembut p-5 text-sm text-teks-lembut leading-relaxed">
      Informasi sekolah belum dilengkapi. Administrator dapat mengisinya melalui
      menu Pengaturan di panel admin, dan halaman ini akan mengikuti tanpa perlu
      pemasangan ulang.
    </div>
  );
}
