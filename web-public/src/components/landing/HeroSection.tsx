import { BookOpen, Calendar, GraduationCap } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AnimatedCounter } from "@/components/visual/AnimatedCounter";
import { KataMuncul } from "@/components/visual/KataMuncul";
import { PmbCountdown } from "@/components/visual/PmbCountdown";
import { srcGambarKonten } from "@/lib/services/gambar-konten";
import { koleksiStat } from "@/lib/services/landing-collections";
import type { GelombangAktif } from "@/lib/services/pmb";

interface HeroSectionProps {
  namaSekolah: string;
  gelombangAktif: GelombangAktif | null;
  konten?: Record<string, string>;
}

/**
 * Hero berlatar foto sekolah dengan lapisan navy, atau navy polos bila foto
 * belum diunggah. Lapisannya membuat teks putih tetap terbaca seterang apa pun
 * fotonya, jadi judul selalu menjadi pusat perhatian.
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

  return (
    <section
      data-hero
      className="relative overflow-hidden bg-[#00236f] py-16 text-white sm:py-24 lg:py-32"
    >
      {/* Navy tetap, bukan token `primary` yang menjadi terang di mode gelap:
          teks hero selalu putih. */}
      {heroImage ? (
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
          {/* Di HP teks memenuhi lebar layar, jadi sisi kanan pun harus cukup
              gelap; di desktop teks hanya di kiri, kanan boleh lebih terang. */}
          <div className="absolute inset-0 bg-linear-to-r from-[#00153f]/90 via-[#00153f]/75 to-[#00153f]/60 lg:via-[#00153f]/65 lg:to-[#00153f]/25" />
          <div className="absolute inset-0 bg-linear-to-t from-[#00153f]/85 via-transparent to-transparent" />
        </div>
      ) : (
        // Satu cahaya amber yang diam di pojok kanan atas: cukup supaya navy
        // tidak datar, tanpa gelembung yang bergerak terus menarik mata dari
        // judul dan tombol pendaftaran.
        <div
          aria-hidden="true"
          data-hero-latar
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_85%_0%,rgba(254,166,25,0.16),transparent_55%)]"
        />
      )}

      <div
        data-hero-isi
        className="relative mx-auto flex max-w-7xl flex-col items-start gap-6 px-4 sm:px-6 lg:px-8"
      >
        {/* Titiknya menandai keadaan nyata (gelombang sedang dibuka), jadi
            ia hanya tampil bersama data gelombang. */}
        {gelombangAktif ? (
          <div className="inline-flex flex-wrap items-center gap-2.5 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-xs font-semibold">
            <span
              aria-hidden="true"
              className="h-2 w-2 rounded-full bg-secondary-container"
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
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-1.5 text-xs font-semibold text-white/90">
            <Calendar aria-hidden="true" className="h-3.5 w-3.5" />
            <span>Pendaftaran tahun ajaran baru belum dibuka</span>
          </div>
        )}

        <div className="max-w-3xl space-y-4">
          {heroBadge ? (
            <p className="text-sm font-semibold text-secondary-container">
              {heroBadge}
            </p>
          ) : null}
          <h1
            data-judul-halaman
            className="font-serif text-4xl font-bold leading-[1.15] tracking-tight text-balance md:text-6xl"
          >
            <KataMuncul teks={heroTitle} langsung />
          </h1>
          {heroSubtitle ? (
            <p className="max-w-2xl text-base leading-relaxed text-white/90 md:text-lg">
              {heroSubtitle}
            </p>
          ) : null}
        </div>

        <div className="flex w-full flex-col gap-3 pt-2 sm:w-auto sm:flex-row sm:items-center">
          <Button
            asChild
            variant="secondary"
            size="lg"
            className="h-14 w-full justify-center rounded-full px-7 font-bold shadow-xl sm:w-auto"
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
            className="h-14 w-full justify-center rounded-full border-white/30 bg-white/10 px-7 text-white hover:border-secondary-container hover:bg-white/20 hover:text-white sm:w-auto"
          >
            <Link href="/program">
              <BookOpen aria-hidden="true" className="mr-2 h-5 w-5" />
              <span>Lihat Program Sekolah</span>
            </Link>
          </Button>
        </div>

        {stats.length > 0 ? (
          <dl className="grid w-full grid-cols-2 gap-4 pt-8 md:grid-cols-4">
            {stats.map((stat) => (
              <div
                key={`${stat.label}-${stat.value}`}
                className="min-w-0 rounded-2xl border border-white/15 bg-[#00153f]/50 p-5"
              >
                <dt className="text-xs font-semibold text-secondary-container">
                  {stat.label}
                </dt>
                <dd className="font-serif text-2xl font-bold sm:text-3xl">
                  <AnimatedCounter value={stat.value} />
                </dd>
                {stat.sub ? (
                  <dd className="text-xs text-white/80">{stat.sub}</dd>
                ) : null}
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </section>
  );
}
