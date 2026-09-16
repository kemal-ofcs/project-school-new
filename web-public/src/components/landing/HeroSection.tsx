import {
  Award,
  BookOpen,
  CheckCircle2,
  GraduationCap,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { GelombangAktif } from "@/lib/services/pmb";

interface HeroSectionProps {
  namaSekolah: string;
  gelombangAktif: GelombangAktif | null;
  heroTitle?: string;
  heroSubtitle?: string;
}

export function HeroSection({
  namaSekolah,
  gelombangAktif,
  heroTitle,
  heroSubtitle,
}: HeroSectionProps) {
  return (
    <section className="relative overflow-hidden bg-primary text-primary-foreground py-16 sm:py-24 lg:py-28">
      {/* Background Decorative Pattern */}
      <div
        className="absolute inset-0 z-0 opacity-15 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:24px_24px]"
        aria-hidden="true"
      />
      <div
        className="absolute -top-40 -right-40 h-96 w-96 rounded-full bg-secondary-container/20 blur-3xl pointer-events-none"
        aria-hidden="true"
      />
      <div
        className="absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-accent/20 blur-3xl pointer-events-none"
        aria-hidden="true"
      />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col items-start gap-8">
        {/* Urgency / Active PMB Banner */}
        {gelombangAktif ? (
          <div className="inline-flex flex-wrap items-center gap-2.5 rounded-full bg-white/10 px-4 py-1.5 text-xs font-medium backdrop-blur-md border border-white/15 shadow-sm">
            <span className="flex h-2 w-2 rounded-full bg-secondary-container animate-pulse" />
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
            <Sparkles className="h-3.5 w-3.5 text-secondary-container" />
            <span className="text-white/90 font-semibold">
              Tahun Ajaran Baru Segera Dibuka
            </span>
          </div>
        )}

        {/* Main Title & Lead */}
        <div className="max-w-3xl space-y-4">
          <div className="inline-flex items-center gap-2 rounded-lg bg-accent/80 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>Akreditasi A Unggul (BAN-SM) • {namaSekolah}</span>
          </div>

          <h1 className="font-extrabold text-3xl tracking-tight sm:text-5xl lg:text-6xl text-white leading-tight">
            {heroTitle ||
              "Wujudkan Generasi Pemimpin Cerdas, Berkarakter & Berdaya Saing Global"}
          </h1>

          <p className="text-base sm:text-lg text-white/85 leading-relaxed max-w-2xl font-normal">
            {heroSubtitle ||
              "Pendidikan holistik memadukan ketangguhan karakter moral, pengayaan kurikulum internasional, serta ekosistem pembelajaran modern berbasis riset dan teknologi masa depan."}
          </p>
        </div>

        {/* Primary Call to Actions */}
        <div className="flex flex-wrap items-center gap-4 pt-2">
          <Button asChild variant="secondary" size="lg" className="shadow-xl">
            <Link href="/pmb">
              <GraduationCap className="h-5 w-5" />
              <span>Daftar PMB Sekarang</span>
            </Link>
          </Button>

          <Button
            asChild
            variant="outline"
            size="lg"
            className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white backdrop-blur-sm"
          >
            <Link href="/program">
              <BookOpen className="h-5 w-5" />
              <span>Jelajahi Program Studi</span>
            </Link>
          </Button>
        </div>

        {/* Quick Stats Strip */}
        <div className="w-full pt-8 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="rounded-xl bg-white/10 p-5 backdrop-blur-md border border-white/10 space-y-1">
            <div className="flex items-center gap-1.5 text-secondary-container">
              <Award className="h-4 w-4" />
              <span className="font-semibold text-xs uppercase tracking-wider">
                Akreditasi A
              </span>
            </div>
            <p className="font-extrabold text-2xl sm:text-3xl text-white">
              98 / 100
            </p>
            <p className="text-xs text-white/70">BAN-SM Predikat Unggul</p>
          </div>

          <div className="rounded-xl bg-white/10 p-5 backdrop-blur-md border border-white/10 space-y-1">
            <div className="flex items-center gap-1.5 text-secondary-container">
              <GraduationCap className="h-4 w-4" />
              <span className="font-semibold text-xs uppercase tracking-wider">
                Lulusan PTN/LN
              </span>
            </div>
            <p className="font-extrabold text-2xl sm:text-3xl text-white">
              98.4%
            </p>
            <p className="text-xs text-white/70">UI, ITB, UGM & Luar Negeri</p>
          </div>

          <div className="rounded-xl bg-white/10 p-5 backdrop-blur-md border border-white/10 space-y-1">
            <div className="flex items-center gap-1.5 text-secondary-container">
              <Trophy className="h-4 w-4" />
              <span className="font-semibold text-xs uppercase tracking-wider">
                Prestasi 2024
              </span>
            </div>
            <p className="font-extrabold text-2xl sm:text-3xl text-white">
              150+
            </p>
            <p className="text-xs text-white/70">Tingkat Nasional & Dunia</p>
          </div>

          <div className="rounded-xl bg-white/10 p-5 backdrop-blur-md border border-white/10 space-y-1">
            <div className="flex items-center gap-1.5 text-secondary-container">
              <Users className="h-4 w-4" />
              <span className="font-semibold text-xs uppercase tracking-wider">
                Komunitas
              </span>
            </div>
            <p className="font-extrabold text-2xl sm:text-3xl text-white">
              1.250+
            </p>
            <p className="text-xs text-white/70">Siswa & Alumni Aktif</p>
          </div>
        </div>
      </div>
    </section>
  );
}
