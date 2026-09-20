import {
  Award,
  BookOpen,
  Calendar,
  CheckCircle2,
  GraduationCap,
  Trophy,
  Users,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

  // Ikon tetap di kode karena ia komponen React; paletnya diputar berdasarkan
  // posisi sehingga kartu ke-N tetap punya ikon.
  const IKON_STAT = [Award, GraduationCap, Trophy, Users];
  const statsData = koleksiStat(konten).map((item, i) => ({
    ...item,
    Ikon: IKON_STAT[i % IKON_STAT.length],
  }));

  return (
    <section className="relative overflow-hidden bg-primary text-primary-foreground py-14 sm:py-20 lg:py-24 border-b border-primary-container">
      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col items-start gap-8">
        {/* Urgency / Active PMB Banner */}
        {gelombangAktif ? (
          <div className="inline-flex flex-wrap items-center gap-2.5 rounded-full bg-white/10 px-4 py-1.5 text-xs font-medium backdrop-blur-md border border-white/15 shadow-sm">
            <span className="flex h-2 w-2 rounded-full bg-secondary-container" />
            <span className="font-bold text-secondary-container uppercase tracking-wider">
              PMB DIBUKA
            </span>
            <span className="text-white/40">•</span>
            <span className="text-white/90">
              {gelombangAktif.nama} (TA {gelombangAktif.tahunAjaran})
            </span>
            <Badge variant="warning" className="text-[10px] ml-1">
              Batas: {gelombangAktif.tanggalTutup}
            </Badge>
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
          <div className="inline-flex items-center gap-2 rounded-lg bg-accent/80 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>
              {heroBadge ? `${heroBadge} • ${namaSekolah}` : namaSekolah}
            </span>
          </div>

          <h1 className="font-extrabold text-3xl tracking-tight sm:text-5xl lg:text-6xl text-white leading-tight">
            {heroTitle}
          </h1>

          {heroSubtitle ? (
            <p className="text-base sm:text-lg text-white/85 leading-relaxed max-w-2xl font-normal">
              {heroSubtitle}
            </p>
          ) : null}
        </div>

        {/* Primary Call to Actions */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2 w-full sm:w-auto">
          <Button
            asChild
            variant="secondary"
            size="lg"
            className="h-12 w-full sm:w-auto font-bold shadow-md justify-center"
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
            className="h-12 w-full sm:w-auto border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white backdrop-blur-sm justify-center"
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
                className="rounded-xl bg-white/10 p-5 backdrop-blur-md border border-white/10 space-y-1"
              >
                <div className="flex items-center gap-1.5 text-secondary-container">
                  <stat.Ikon className="h-4 w-4" />
                  <span className="font-semibold text-xs uppercase tracking-wider">
                    {stat.label}
                  </span>
                </div>
                <p className="font-extrabold text-2xl sm:text-3xl text-white">
                  {stat.value}
                </p>
                {stat.sub ? (
                  <p className="text-xs text-white/70">{stat.sub}</p>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
