"use client";

import {
  BookOpen,
  Building2,
  CheckCircle2,
  Cpu,
  Dumbbell,
  Eye,
  Radio,
  Tv,
} from "lucide-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { KataMuncul } from "@/components/visual/KataMuncul";
import { srcGambarKonten } from "@/lib/services/gambar-konten";
import { koleksiFasilitas } from "@/lib/services/landing-collections";
import { TautanGaleri, type TautanGaleriData } from "./FotoKartu";

/**
 * Ikon fasilitas diputar berdasarkan posisi. Ia komponen React sehingga tidak
 * bisa disimpan di database, dan fasilitas ke-N tetap butuh satu.
 */
const IKON_FASILITAS = [Tv, Cpu, BookOpen, Dumbbell, Radio, Building2];

interface FacilitiesSectionProps {
  konten?: Record<string, string>;
  galeri?: TautanGaleriData | null;
  /** Pengganti judul CMS beranda, dipakai halaman Program. */
  kepala?: React.ReactNode;
}

export function FacilitiesSection({
  konten = {},
  galeri = null,
  kepala,
}: FacilitiesSectionProps) {
  // Seluruh teksnya dari CMS; tidak ada teks contoh di kode.
  const eyebrow = konten["landing.fasilitas_eyebrow"];
  const title = konten["landing.fasilitas_title"];
  const subtitle = konten["landing.fasilitas_subtitle"];

  const facilitiesList = koleksiFasilitas(konten).map((item, i) => ({
    icon: IKON_FASILITAS[i % IKON_FASILITAS.length],
    name: item.name,
    tag: item.tag,
    shortDesc: item.desc,
    specs: item.specs,
    foto: item.foto,
  }));

  const [selectedFacility, setSelectedFacility] = React.useState<
    (typeof facilitiesList)[number] | null
  >(null);

  // Section tanpa satu fasilitas pun tidak dirender. Pengembalian awal ini
  // SENGAJA diletakkan sesudah `useState`: bila di atasnya, jumlah hook yang
  // dipanggil berubah begitu fasilitas pertama diisi dan React menjatuhkan
  // seluruh halaman depan.
  if (facilitiesList.length === 0) return null;
  const adaHeader = Boolean(eyebrow || title || subtitle);

  return (
    <section className="muncul py-20 sm:py-28 bg-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-12">
        {kepala ? (
          kepala
        ) : adaHeader ? (
          <div className="text-center max-w-2xl mx-auto space-y-3">
            {eyebrow ? (
              <p className="text-sm font-semibold text-secondary">{eyebrow}</p>
            ) : null}
            {title ? (
              <h2 className="font-serif text-3xl font-bold tracking-tight text-primary text-balance md:text-5xl">
                <KataMuncul teks={title} />
              </h2>
            ) : null}
            {subtitle ? (
              <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
                {subtitle}
              </p>
            ) : null}
          </div>
        ) : null}

        {/* Bento: fasilitas pertama (biasanya gedung utama) paling besar,
            yang kedua melebar, sisanya kotak biasa. Urutannya diatur sekolah
            di CMS, jadi sekolah yang memilih mana yang paling ditonjolkan. */}
        <div className="grid grid-flow-dense auto-rows-62.5 grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-4">
          {facilitiesList.map((item, i) => {
            const Icon = item.icon;
            const src = srcGambarKonten(item.foto);
            const besar = i === 0;
            const ukuran = besar
              ? "sm:col-span-2 md:row-span-2"
              : i === 1
                ? "sm:col-span-2"
                : "";
            const adaRincian = Boolean(item.shortDesc || item.specs.length > 0);
            const isi = (
              <>
                {src ? (
                  // biome-ignore lint/performance/noImgElement: foto dari database, dilayani rute ber-cache sendiri
                  <img
                    src={src}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                  />
                ) : (
                  <Icon
                    aria-hidden="true"
                    className="absolute right-6 top-6 h-14 w-14 text-white/20"
                  />
                )}
                <div
                  aria-hidden="true"
                  className="absolute inset-0 bg-linear-to-t from-[#00153f] via-[#00153f]/60 via-35% to-transparent"
                />
                {item.tag ? (
                  <span className="absolute left-5 top-5 rounded-full bg-[#00236f]/90 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white">
                    {item.tag}
                  </span>
                ) : null}
                <div className="absolute inset-x-0 bottom-0 p-5 text-left sm:p-6">
                  <h3
                    className={`font-serif font-bold leading-snug text-white ${
                      besar ? "text-2xl md:text-3xl" : "text-xl"
                    }`}
                  >
                    {item.name}
                  </h3>
                  {besar && item.shortDesc ? (
                    <p className="mt-2 max-w-md text-sm leading-relaxed text-white/85 line-clamp-2">
                      {item.shortDesc}
                    </p>
                  ) : null}
                  {adaRincian ? (
                    <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-secondary-container">
                      Lihat rincian
                      <Eye aria-hidden="true" className="h-3.5 w-3.5" />
                    </span>
                  ) : null}
                </div>
              </>
            );
            const kelas = `group relative overflow-hidden rounded-[28px] bg-[#00236f] shadow-[0_10px_30px_-10px_rgba(0,35,111,0.25)] ${ukuran}`;
            return adaRincian ? (
              <button
                key={`${i}-${item.name}`}
                type="button"
                onClick={() => setSelectedFacility(item)}
                className={`${kelas} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`}
              >
                {isi}
              </button>
            ) : (
              <div key={`${i}-${item.name}`} className={kelas}>
                {isi}
              </div>
            );
          })}
        </div>

        <TautanGaleri tautan={galeri} />

        {/* Interactive Facility Modal Dialog */}
        <Dialog
          open={selectedFacility !== null}
          onOpenChange={(open) => {
            if (!open) setSelectedFacility(null);
          }}
        >
          {selectedFacility ? (
            <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
              {srcGambarKonten(selectedFacility.foto) ? (
                <div className="-mx-6 -mt-6 mb-5 aspect-video overflow-hidden rounded-t-2xl bg-muted">
                  {/* biome-ignore lint/performance/noImgElement: foto dari database, dilayani rute ber-cache sendiri */}
                  <img
                    src={srcGambarKonten(selectedFacility.foto) ?? ""}
                    alt={selectedFacility.name}
                    decoding="async"
                    className="h-full w-full object-cover"
                  />
                </div>
              ) : null}
              <DialogHeader className="pr-8">
                {selectedFacility.tag ? (
                  <div className="flex items-center gap-2 text-xs font-bold text-secondary uppercase tracking-wider">
                    <Badge variant="outline">{selectedFacility.tag}</Badge>
                  </div>
                ) : null}
                <DialogTitle className="mt-1">
                  {selectedFacility.name}
                </DialogTitle>
                <DialogDescription>
                  {selectedFacility.shortDesc}
                </DialogDescription>
              </DialogHeader>

              {selectedFacility.specs.length > 0 ? (
                <div className="space-y-3 py-3 border-t border-border mt-3">
                  <h4 className="font-semibold text-xs text-foreground uppercase tracking-wider">
                    Fitur & Spesifikasi:
                  </h4>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    {selectedFacility.specs.map((spec) => (
                      <li key={spec} className="flex items-start gap-2">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-accent mt-0.5" />
                        <span>{spec}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="pt-4 border-t border-border flex justify-end">
                <Button
                  type="button"
                  variant="default"
                  onClick={() => setSelectedFacility(null)}
                >
                  Tutup
                </Button>
              </div>
            </DialogContent>
          ) : null}
        </Dialog>
      </div>
    </section>
  );
}
