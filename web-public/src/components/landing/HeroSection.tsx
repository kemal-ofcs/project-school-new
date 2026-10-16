import { BookOpen, Calendar, GraduationCap } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AnimatedCounter } from "@/components/visual/AnimatedCounter";
import { KataMuncul } from "@/components/visual/KataMuncul";
import { PmbCountdown } from "@/components/visual/PmbCountdown";
import { srcGambarKonten } from "@/lib/services/gambar-konten";
import { type ItemStat, koleksiStat } from "@/lib/services/landing-collections";
import type { GelombangAktif } from "@/lib/services/pmb";

interface HeroSectionProps {
  namaSekolah: string;
  gelombangAktif: GelombangAktif | null;
  konten?: Record<string, string>;
}

/**
 * Hero dua kolom: ajakan mendaftar di kiri, foto sekolah di kanan.
 *
 * Dua statistik pertama dari CMS menempel di sudut foto sebagai kartu
 * melayang; sisanya berderet di bawah tombol. Tanpa foto, kolom kanan tidak
 * ada dan semua statistik berderet di kiri.
 */
export function HeroSection({
  namaSekolah,
  gelombangAktif,
  konten = {},
}: HeroSectionProps) {
  // Seluruh teksnya dari CMS. Tanpa teks contoh di kode: judul yang belum
  // diisi memakai nama sekolah (data, bukan tulisan kita), dan subjudul serta
  // lencana yang belum diisi disembunyikan.
  const heroTitle = konten["landing.hero_title"] || namaSekolah;
  const heroSubtitle = konten["landing.hero_subtitle"];
  const heroBadge = konten["landing.hero_badge"];
  const heroImage = srcGambarKonten(konten["landing.hero_image"]);

  const stats = koleksiStat(konten);
  const statMelayang = heroImage ? stats.slice(0, 2) : [];
  const statBaris = stats.slice(statMelayang.length);

  return (
    <section
      data-hero
      className="relative overflow-hidden bg-background pt-8 pb-16 sm:pt-12 sm:pb-24 lg:pt-16 lg:pb-28"
    >
      <div
        data-hero-isi
        className={`relative mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:items-center lg:px-8 ${
          heroImage ? "lg:grid-cols-12 lg:gap-10" : ""
        }`}
      >
        <div
          className={`flex flex-col items-start gap-6 ${
            heroImage ? "lg:col-span-7" : "max-w-3xl"
          }`}
        >
          {/* Titiknya menandai keadaan nyata (gelombang sedang dibuka), jadi
              ia hanya tampil bersama data gelombang. */}
          {gelombangAktif ? (
            <div className="inline-flex flex-wrap items-center gap-2.5 rounded-full border border-accent/25 bg-accent/10 px-4 py-1.5 text-xs font-semibold text-accent">
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-full bg-accent"
              />
              <span>
                Pendaftaran {gelombangAktif.nama} dibuka (TA{" "}
                {gelombangAktif.tahunAjaran})
              </span>
              {gelombangAktif.tanggalTutup ? (
                <PmbCountdown tanggalTutup={gelombangAktif.tanggalTutup} />
              ) : null}
            </div>
          ) : (
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted px-4 py-1.5 text-xs font-semibold text-muted-foreground">
              <Calendar aria-hidden="true" className="h-3.5 w-3.5" />
              <span>Pendaftaran tahun ajaran baru belum dibuka</span>
            </div>
          )}

          <div className="space-y-4">
            {heroBadge ? (
              <p className="text-sm font-semibold text-secondary">
                {heroBadge}
              </p>
            ) : null}
            <h1
              data-judul-halaman
              className="font-serif text-4xl font-bold leading-[1.15] tracking-tight text-primary text-balance md:text-6xl"
            >
              <KataMuncul teks={heroTitle} langsung />
            </h1>
            {heroSubtitle ? (
              <p className="max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
                {heroSubtitle}
              </p>
            ) : null}
          </div>

          <div className="flex w-full flex-col gap-3 pt-2 sm:w-auto sm:flex-row sm:items-center">
            <Button
              asChild
              size="lg"
              className="h-14 w-full justify-center rounded-full px-7 font-bold shadow-xl shadow-primary/15 sm:w-auto"
            >
              <Link href="/pmb">
                <GraduationCap aria-hidden="true" className="mr-2 h-5 w-5" />
                <span>Daftar PMB Sekarang</span>
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="h-14 w-full justify-center rounded-full border-border bg-card px-7 hover:border-secondary sm:w-auto"
            >
              <Link href="/program">
                <BookOpen aria-hidden="true" className="mr-2 h-5 w-5" />
                <span>Lihat Program Sekolah</span>
              </Link>
            </Button>
          </div>

          {statBaris.length > 0 ? (
            <dl className="flex w-full flex-wrap gap-x-10 gap-y-5 border-t border-border pt-6">
              {statBaris.map((stat) => (
                <div key={`${stat.label}-${stat.value}`} className="min-w-0">
                  <dt className="text-xs font-semibold text-muted-foreground">
                    {stat.label}
                  </dt>
                  <dd className="font-serif text-2xl font-bold text-primary sm:text-3xl">
                    <AnimatedCounter value={stat.value} />
                  </dd>
                  {stat.sub ? (
                    <dd className="text-xs text-muted-foreground">
                      {stat.sub}
                    </dd>
                  ) : null}
                </div>
              ))}
            </dl>
          ) : null}
        </div>

        {heroImage ? (
          <div className="relative lg:col-span-5">
            <div className="relative aspect-4/3 overflow-hidden rounded-[28px] bg-muted shadow-[0_24px_48px_-12px_rgba(0,35,111,0.28)] lg:aspect-4/5">
              <div
                aria-hidden="true"
                data-hero-latar
                className="pointer-events-none absolute inset-0"
              >
                {/* biome-ignore lint/performance/noImgElement: foto dari database, dilayani rute ber-cache sendiri */}
                <img
                  src={heroImage}
                  alt=""
                  fetchPriority="high"
                  decoding="async"
                  className="h-full w-full object-cover object-center"
                />
              </div>
            </div>
            {statMelayang[0] ? (
              <KartuStatMelayang
                stat={statMelayang[0]}
                className="left-3 bottom-3 lg:-left-8 lg:bottom-10"
              />
            ) : null}
            {statMelayang[1] ? (
              <KartuStatMelayang
                stat={statMelayang[1]}
                className="right-3 top-3 lg:-right-6 lg:top-10"
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

/**
 * Kartu padat, bukan kaca: kaca sudah dipakai header, dan dua permukaan buram
 * yang bertumpuk di atas foto membuat angkanya sulit dibaca. Gerak mengapung
 * hanya di desktop (`.mengapung` di globals.css).
 */
function KartuStatMelayang({
  stat,
  className,
}: {
  stat: ItemStat;
  className: string;
}) {
  return (
    <div
      className={`mengapung absolute max-w-[60%] rounded-2xl border border-border bg-card px-4 py-3 shadow-xl ${className}`}
    >
      <p className="text-[11px] font-semibold text-muted-foreground">
        {stat.label}
      </p>
      <p className="font-serif text-2xl font-bold leading-tight text-primary">
        <AnimatedCounter value={stat.value} />
      </p>
      {stat.sub ? (
        <p className="text-[11px] text-muted-foreground">{stat.sub}</p>
      ) : null}
    </div>
  );
}
