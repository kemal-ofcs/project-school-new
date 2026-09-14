import {
  CheckCircle2,
  ChevronRight,
  Clock,
  GraduationCap,
  Mail,
  MapPin,
  Phone,
  UserCheck,
} from "lucide-react";
import Link from "next/link";
import { MobileNav } from "@/components/MobileNav";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { SchoolProfile } from "@/lib/services/school-profile";
import { namaTampil } from "@/lib/services/school-profile";

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
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/90 backdrop-blur-xl shadow-xs transition-colors duration-300 pt-safe">
      <div className="mx-auto flex h-18 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        {/* Brand & Identity */}
        <Link
          className="flex items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg p-1"
          href="/"
        >
          {profil.logoUrl ? (
            // biome-ignore lint/performance/noImgElement: dynamic logo URL from database
            <img
              alt={nama}
              className="h-10 w-10 object-contain rounded-md"
              src={profil.logoUrl}
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <GraduationCap className="h-6 w-6" />
            </div>
          )}
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="font-bold text-base text-foreground tracking-tight sm:text-lg">
                {nama}
              </span>
              <Badge
                variant="prestige"
                className="hidden sm:inline-flex text-[10px] px-1.5 py-0"
              >
                TERAKREDITASI
              </Badge>
            </div>
            <p className="hidden text-xs text-muted-foreground md:block">
              {profil.namaCabang ?? "Portal Akademik & Penerimaan Murid Baru"}
            </p>
          </div>
        </Link>

        {/* Desktop Navigation Links */}
        <nav
          aria-label="Navigasi utama"
          className="hidden lg:flex items-center gap-6"
        >
          {NAVIGASI.map((item) => (
            <Link
              key={item.href}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
              href={item.href}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Action Controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Hotline Quick Link (Desktop) */}
          {profil.telepon ? (
            <a
              href={`tel:${profil.telepon}`}
              className="hidden xl:flex items-center gap-1.5 rounded-full bg-muted px-3.5 py-1.5 text-xs font-semibold text-foreground hover:text-primary transition-colors"
              title="Hubungi Hotline Sekolah"
            >
              <Phone className="h-3.5 w-3.5 text-secondary" />
              <span>{profil.telepon}</span>
            </a>
          ) : null}

          {/* Dark / Light Mode Switch */}
          <ThemeToggle />

          {/* PMB CTA Button */}
          <Button
            asChild
            variant="secondary"
            size="default"
            className="hidden sm:inline-flex"
          >
            <Link href="/pmb">
              <UserCheck className="h-4 w-4" />
              <span>Daftar PMB</span>
            </Link>
          </Button>

          {/* Mobile Navigation Drawer */}
          <MobileNav navigasi={NAVIGASI} telepon={profil.telepon} nama={nama} />
        </div>
      </div>
    </header>
  );
}

export function SiteFooter({ profil }: { profil: SchoolProfile }) {
  const nama = namaTampil(profil);
  const tahun = new Date().getFullYear();

  return (
    <footer className="mt-20 border-t border-border bg-card text-card-foreground transition-colors duration-300">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-16 pb-12">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-4 pb-12 border-b border-border">
          {/* Kolom 1: Profil & Legalitas */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
                <GraduationCap className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-bold text-lg leading-tight">{nama}</h3>
                <p className="text-xs text-muted-foreground">
                  Institusi Pendidikan Unggulan
                </p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Membentuk generasi pemimpin yang cerdas, berintegritas, berwawasan
              global, dan berakar kuat pada nilai karakter luhur.
            </p>
            <div className="inline-flex items-center gap-2 rounded-lg bg-muted px-3 py-1.5 text-xs font-semibold text-accent">
              <CheckCircle2 className="h-4 w-4" />
              <span>Terakreditasi Unggul (A) BAN-SM</span>
            </div>
          </div>

          {/* Kolom 2: Navigasi Cepat */}
          <div className="space-y-3">
            <h4 className="font-semibold text-sm uppercase tracking-wider text-foreground">
              Navigasi Cepat
            </h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link
                  className="hover:text-primary transition-colors flex items-center gap-1.5"
                  href="/profil"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                  Profil & Sejarah
                </Link>
              </li>
              <li>
                <Link
                  className="hover:text-primary transition-colors flex items-center gap-1.5"
                  href="/program"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                  Program Keahlian
                </Link>
              </li>
              <li>
                <Link
                  className="hover:text-primary transition-colors flex items-center gap-1.5"
                  href="/berita"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                  Warta & Pengumuman
                </Link>
              </li>
              <li>
                <Link
                  className="hover:text-primary transition-colors flex items-center gap-1.5"
                  href="/wali"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                  Portal Wali Murid
                </Link>
              </li>
            </ul>
          </div>

          {/* Kolom 3: Layanan PMB */}
          <div className="space-y-3">
            <h4 className="font-semibold text-sm uppercase tracking-wider text-foreground">
              Penerimaan Siswa Baru
            </h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link
                  className="hover:text-primary transition-colors flex items-center gap-1.5"
                  href="/pmb"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                  Informasi Gelombang & Syarat
                </Link>
              </li>
              <li>
                <Link
                  className="hover:text-primary transition-colors flex items-center gap-1.5"
                  href="/pmb/daftar"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                  Formulir Pendaftaran Online
                </Link>
              </li>
              <li>
                <Link
                  className="hover:text-primary transition-colors flex items-center gap-1.5"
                  href="/pmb/status"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                  Cek Status Seleksi Berkas
                </Link>
              </li>
              <li>
                <Link
                  className="hover:text-primary transition-colors flex items-center gap-1.5"
                  href="/kontak"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                  Konsultasi Beasiswa & Biaya
                </Link>
              </li>
            </ul>
          </div>

          {/* Kolom 4: Hubungi Kami */}
          <div className="space-y-3">
            <h4 className="font-semibold text-sm uppercase tracking-wider text-foreground">
              Hubungi Kami
            </h4>
            <div className="space-y-2.5 text-sm text-muted-foreground">
              {profil.alamat ? (
                <p className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                  <span>{profil.alamat}</span>
                </p>
              ) : null}
              {profil.telepon ? (
                <p className="flex items-center gap-2">
                  <Phone className="h-4 w-4 shrink-0 text-primary" />
                  <a
                    className="hover:text-primary"
                    href={`tel:${profil.telepon}`}
                  >
                    {profil.telepon}
                  </a>
                </p>
              ) : null}
              {profil.email ? (
                <p className="flex items-center gap-2">
                  <Mail className="h-4 w-4 shrink-0 text-primary" />
                  <a
                    className="hover:text-primary"
                    href={`mailto:${profil.email}`}
                  >
                    {profil.email}
                  </a>
                </p>
              ) : null}
              <div className="rounded-lg bg-muted p-3 text-xs space-y-1 mt-2">
                <div className="flex items-center gap-1.5 font-semibold text-foreground">
                  <Clock className="h-3.5 w-3.5 text-secondary" />
                  <span>Jam Layanan Sekretariat:</span>
                </div>
                <p>Senin - Jumat: 07.30 - 16.00 WIB</p>
                <p>Sabtu: 08.00 - 13.00 WIB</p>
              </div>
            </div>
          </div>
        </div>

        {/* Baris Bawah */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground text-center sm:text-left">
          <p>
            © {tahun} {nama}. Hak Cipta Dilindungi Undang-Undang.
          </p>
          <p className="font-medium text-foreground">
            Standar Pendidikan Nasional & Pengayaan Kurikulum Global
          </p>
        </div>
      </div>
    </footer>
  );
}

export function ProfilBelumLengkap() {
  return (
    <div className="rounded-xl border border-dashed border-border bg-muted p-6 text-sm text-muted-foreground leading-relaxed">
      Informasi sekolah belum dilengkapi. Administrator dapat melengkapinya
      melalui menu Pengaturan di panel admin, dan halaman publik akan
      menyesuaikan secara otomatis.
    </div>
  );
}
