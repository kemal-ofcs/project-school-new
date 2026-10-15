import {
  Award,
  CheckCircle2,
  GraduationCap,
  Quote,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { KataMuncul } from "@/components/visual/KataMuncul";
import { SpotlightCard } from "@/components/visual/SpotlightCard";
import { koleksiPilar } from "@/lib/services/landing-collections";
import type { SchoolProfile } from "@/lib/services/school-profile";
import { pecahPoin } from "@/lib/teks";

interface PillarsSectionProps {
  profil: SchoolProfile;
  konten?: Record<string, string>;
}

/**
 * Pilar keunggulan dan sambutan pimpinan: seluruh teksnya dari CMS.
 *
 * Tidak ada teks contoh di sini lagi. Versi sebelumnya membawa empat pilar,
 * kutipan sambutan, bahkan NAMA pimpinan yang tertanam di kode; semuanya
 * tampil di situs setiap sekolah seolah-olah ditulis sekolah itu. Bagian yang
 * belum diisi disembunyikan, dan bila tidak ada satu pun yang terisi seluruh
 * section ini tidak dirender.
 */
export function PillarsSection({ profil, konten = {} }: PillarsSectionProps) {
  const eyebrow = konten["landing.pillars_eyebrow"];
  const title = konten["landing.pillars_title"];
  const subtitle = konten["landing.pillars_subtitle"];
  const badgePill = konten["landing.pillars_badge"];

  const pillarsData = koleksiPilar(konten);

  // Nama dan jabatan jatuh ke profil sekolah (data yang diisi sekolah sendiri
  // di Pengaturan), tidak pernah ke nama yang ditulis di kode.
  const namaPimpinan = konten["landing.sambutan_nama"] || profil.namaPimpinan;
  const jabatanPimpinan =
    konten["landing.sambutan_jabatan"] || profil.jabatanPimpinan;
  const badgePimpinan = konten["landing.sambutan_badge"];
  const sambutanQuote = konten["landing.sambutan_quote"];
  const sambutanBody = konten["landing.sambutan_body"];

  const adaHeader = Boolean(eyebrow || title || subtitle || badgePill);
  const adaSambutan = Boolean(sambutanQuote || sambutanBody);
  if (!adaHeader && pillarsData.length === 0 && !adaSambutan) return null;
  const sematkan = adaHeader && pillarsData.length >= 3;

  return (
    <section className="muncul py-20 sm:py-28 bg-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-16">
        {/* Di desktop, judul disematkan di kiri selama pilar bergulir di kanan
            (`.pilar-lekat` di globals.css). Tanpa judul atau dengan kurang
            dari tiga pilar, tidak ada yang layak disematkan. */}
        <div className={sematkan ? "pilar-lekat space-y-16" : "space-y-16"}>
          {adaHeader ? (
            <div className="pilar-kepala flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div className="max-w-2xl space-y-2">
                {eyebrow ? (
                  <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-secondary">
                    <Award className="h-3.5 w-3.5" />
                    <span>{eyebrow}</span>
                  </div>
                ) : null}
                {title ? (
                  <h2 className="font-bold text-2xl sm:text-4xl text-foreground tracking-tight">
                    <KataMuncul teks={title} />
                  </h2>
                ) : null}
                {subtitle ? (
                  <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
                    {subtitle}
                  </p>
                ) : null}
              </div>
              {badgePill ? (
                <div className="hidden lg:flex items-center gap-2 text-xs font-semibold text-accent rounded-full bg-muted px-4 py-2">
                  <ShieldCheck className="h-4 w-4" />
                  <span>{badgePill}</span>
                </div>
              ) : null}
            </div>
          ) : null}

          {pillarsData.length > 0 ? (
            <div className="pilar-daftar kartu-tengah sm:[--kolom:2] lg:[--kolom:4]">
              {pillarsData.map((item, i) => {
                const poin = pecahPoin(item.desc);
                return (
                  <SpotlightCard
                    key={`${i}-${item.title}`}
                    className="rounded-2xl"
                    glowColor="rgba(0, 35, 111, 0.14)"
                  >
                    <Card className="h-full p-6 sm:p-8 border-border bg-card">
                      {/* Nomor urut, bukan ikon: ikon yang diputar per posisi
                          tidak ada hubungannya dengan isi pilar, sedangkan
                          nomor amber sama dengan daftar misi di halaman Profil. */}
                      <div className="flex items-start gap-4 sm:gap-5">
                        <span
                          aria-hidden="true"
                          className="font-extrabold text-3xl sm:text-4xl leading-none tabular-nums text-secondary"
                        >
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <div className="min-w-0 space-y-1">
                          <h3 className="font-bold text-lg sm:text-xl leading-snug text-foreground text-balance">
                            {item.title}
                          </h3>
                          {item.tag ? (
                            <p className="text-sm font-medium text-primary">
                              {item.tag}
                            </p>
                          ) : null}
                        </div>
                      </div>

                      {poin.length > 1 ? (
                        <ul className="mt-6 grid gap-x-6 gap-y-3 border-t border-border pt-6 sm:grid-cols-2">
                          {poin.map((isi) => (
                            <li className="flex gap-2.5" key={isi}>
                              <CheckCircle2
                                aria-hidden="true"
                                className="mt-0.5 h-4 w-4 shrink-0 text-accent"
                              />
                              <span className="text-sm leading-relaxed text-muted-foreground">
                                {isi}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : poin.length === 1 ? (
                        <p className="mt-5 text-sm sm:text-base leading-relaxed text-muted-foreground">
                          {poin[0]}
                        </p>
                      ) : null}
                    </Card>
                  </SpotlightCard>
                );
              })}
            </div>
          ) : null}
        </div>

        {adaSambutan ? (
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-12 items-center">
              <div className="md:col-span-4 bg-muted/60 p-8 flex flex-col items-center justify-center text-center border-b md:border-b-0 md:border-r border-border h-full">
                <div className="flex h-28 w-28 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-md mb-4">
                  <GraduationCap className="h-14 w-14" />
                </div>
                {namaPimpinan ? (
                  <h4 className="font-bold text-base text-foreground">
                    {namaPimpinan}
                  </h4>
                ) : null}
                {jabatanPimpinan ? (
                  <p className="text-xs font-semibold text-secondary mt-0.5">
                    {jabatanPimpinan}
                  </p>
                ) : null}
                {badgePimpinan ? (
                  <Badge variant="success" className="mt-3 text-[10px]">
                    {badgePimpinan}
                  </Badge>
                ) : null}
              </div>

              <div className="md:col-span-8 p-6 sm:p-10 space-y-4">
                <Quote className="h-8 w-8 text-primary/30" />
                {sambutanQuote ? (
                  <blockquote className="font-medium text-base sm:text-lg text-foreground leading-relaxed italic">
                    {sambutanQuote}
                  </blockquote>
                ) : null}
                {sambutanBody ? (
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {sambutanBody}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
