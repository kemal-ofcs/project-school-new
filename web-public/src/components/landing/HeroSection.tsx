import {
  Award,
  BookOpen,
  Calendar,
  GraduationCap,
  Trophy,
  Users,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AnimatedCounter } from "@/components/visual/AnimatedCounter";
import { PmbCountdown } from "@/components/visual/PmbCountdown";
import { koleksiStat } from "@/lib/services/landing-collections";
import type { GelombangAktif } from "@/lib/services/pmb";

interface HeroSectionProps {
  namaSekolah: string;
  gelombangAktif: GelombangAktif | null;
  konten?: Record<string, string>;
}

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
  const heroImage = konten["landing.hero_image"];

  // Ikon tetap di kode karena ia komponen React; paletnya diputar berdasarkan
  // posisi sehingga kartu ke-N tetap punya ikon.
  const IKON_STAT = [Award, GraduationCap, Trophy, Users];
  const statsData = koleksiStat(konten).map((item, i) => ({
    ...item,
    Ikon: IKON_STAT[i % IKON_STAT.length],
  }));

  const hasCustomHeroImage = Boolean(heroImage && heroImage.trim().length > 0);

  return (
    <section className="relative overflow-hidden bg-primary text-primary-foreground py-14 sm:py-20 lg:py-28 border-b border-primary-container">
      {/* 1. Latar Belakang Hero Dinamis: Foto Kampus atau Aurora Ambient */}
      {hasCustomHeroImage ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
        >
          {/* biome-ignore lint/performance/noImgElement: user uploaded data url or photo */}
          <img
            src={heroImage}
            alt=""
            className="h-full w-full object-cover object-center"
          />
          {/* Lapisan Gradien Elegan: Foto sekolah tetap jelas dan hidup, teks tetap kontras tajam */}
          <div className="absolute inset-0 bg-gradient-to-r from-slate-950/75 via-slate-950/40 to-slate-950/15" />
          <div className="absolute inset-0 bg-gradient-to-t from-primary/85 via-primary/20 to-transparent" />
        </div>
      ) : (
        // Satu cahaya amber yang diam di pojok kanan atas: cukup supaya navy
        // tidak datar, tanpa gelembung yang bergerak terus menarik mata dari
        // judul dan tombol pendaftaran.
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_85%_0%,rgba(254,166,25,0.16),transparent_55%)]"
        />
      )}

      {/* 2. Konten Utama Hero */}
      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col items-start gap-8">
        {/* Urgency / Active PMB Banner */}
        {gelombangAktif ? (
          <div className="inline-flex flex-wrap items-center gap-2.5 rounded-full bg-white/10 px-4 py-1.5 text-xs font-medium backdrop-blur-md border border-white/20 shadow-md">
            <span className="flex h-2 w-2 rounded-full bg-secondary-container" />
            <span className="font-bold text-secondary-container uppercase tracking-wider">
              PMB DIBUKA
            </span>
            <span className="text-white/40">•</span>
            <span className="text-white/95 font-semibold">
              {gelombangAktif.nama} (TA {gelombangAktif.tahunAjaran})
            </span>
            {gelombangAktif.tanggalTutup ? (
              <PmbCountdown tanggalTutup={gelombangAktif.tanggalTutup} />
            ) : null}
          </div>
        ) : (
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-xs font-medium backdrop-blur-md border border-white/15">
            <Calendar className="h-3.5 w-3.5 text-secondary-container" />
            <span className="text-white/90 font-semibold">
              Tahun Ajaran Baru Segera Dibuka
            </span>
          </div>
        )}

        {/* Main Title & Lead */}
        <div className="max-w-3xl space-y-4">
          {/* Lencana CMS tampil sebagai teks biasa. Pil hijau yang dulu
              selalu tampil mengulang nama sekolah, yang sudah ada di header
              dan sering juga di judul tepat di bawahnya. */}
          {heroBadge ? (
            <p className="font-semibold text-sm text-secondary-container">
              {heroBadge}
            </p>
          ) : null}

          <h1 className="font-extrabold text-3xl tracking-tight sm:text-5xl lg:text-6xl text-white leading-tight drop-shadow-sm">
            {heroTitle}
          </h1>

          {heroSubtitle ? (
            <p className="text-base sm:text-lg text-white/90 leading-relaxed max-w-2xl font-normal drop-shadow-xs">
              {heroSubtitle}
            </p>
          ) : null}
        </div>

        {/* Primary Call to Actions */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5 pt-2 w-full sm:w-auto">
          <Button
            asChild
            variant="secondary"
            size="lg"
            className="h-12 w-full sm:w-auto font-bold shadow-lg justify-center transition-transform hover:scale-[1.02] active:scale-[0.98]"
          >
            <Link href="/pmb">
              <GraduationCap className="h-5 w-5 mr-2" />
              <span>Daftar PMB Sekarang</span>
            </Link>
          </Button>

          <Button
            asChild
            variant="outline"
            size="lg"
            className="h-12 w-full sm:w-auto border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white backdrop-blur-md justify-center transition-all hover:border-white/50"
          >
            <Link href="/program">
              <BookOpen className="h-5 w-5 mr-2" />
              <span>Jelajahi Program Studi</span>
            </Link>
          </Button>
        </div>

        {/* Quick Stats Strip */}
        {statsData.length > 0 ? (
          <div className="w-full pt-8 grid grid-cols-2 md:grid-cols-4 gap-4">
            {statsData.map((stat) => (
              <div
                key={`${stat.label}-${stat.value}`}
                className="rounded-2xl bg-white/10 p-5 border border-white/15 space-y-1.5"
              >
                <div className="flex items-center gap-1.5 text-secondary-container">
                  <stat.Ikon className="h-4 w-4" />
                  <span className="font-semibold text-xs uppercase tracking-wider">
                    {stat.label}
                  </span>
                </div>
                <p className="font-extrabold text-2xl sm:text-3xl text-white">
                  <AnimatedCounter value={stat.value} />
                </p>
                {stat.sub ? (
                  <p className="text-xs text-white/75">{stat.sub}</p>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
