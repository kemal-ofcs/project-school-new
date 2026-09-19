import {
  ArrowRight,
  Cpu,
  Globe,
  GraduationCap,
  Quote,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { koleksiPilar } from "@/lib/services/landing-collections";
import type { SchoolProfile } from "@/lib/services/school-profile";

/**
 * Ikon pilar diputar berdasarkan posisi. Ia komponen React sehingga tidak bisa
 * disimpan di database, dan pilar ke-N di luar empat pertama tetap butuh satu.
 */
const IKON_PILAR = [Globe, GraduationCap, ShieldCheck, Cpu];

interface PillarsSectionProps {
  profil: SchoolProfile;
  konten?: Record<string, string>;
}

/**
 * Pilar keunggulan dan sambutan pimpinan — seluruh teksnya dari CMS.
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

  const pillarsData = koleksiPilar(konten).map((item, i) => ({
    ...item,
    icon: IKON_PILAR[i % IKON_PILAR.length],
  }));

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

  return (
    <section className="py-20 sm:py-28 bg-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-16">
        {adaHeader ? (
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="max-w-2xl space-y-2">
              {eyebrow ? (
                <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-secondary">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>{eyebrow}</span>
                </div>
              ) : null}
              {title ? (
                <h2 className="font-bold text-2xl sm:text-4xl text-foreground tracking-tight">
                  {title}
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
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {pillarsData.map((item, i) => {
              const Icon = item.icon;
              return (
                <Card
                  key={`${i}-${item.title}`}
                  className="group relative flex flex-col justify-between p-6 transition-all duration-300 hover:shadow-lg hover:-translate-y-1 border-border bg-card"
                >
                  <div className="space-y-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-200">
                      <Icon className="h-6 w-6" />
                    </div>
                    <div className="space-y-2">
                      <h3 className="font-semibold text-lg text-foreground leading-snug">
                        {item.title}
                      </h3>
                      {item.desc ? (
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {item.desc}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="pt-6 flex items-center justify-between text-xs font-semibold text-primary">
                    {item.tag ? (
                      <Badge
                        variant="outline"
                        className="text-[11px] font-medium"
                      >
                        {item.tag}
                      </Badge>
                    ) : (
                      <span />
                    )}
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                  </div>
                </Card>
              );
            })}
          </div>
        ) : null}

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
