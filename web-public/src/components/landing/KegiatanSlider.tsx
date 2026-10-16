"use client";

import useEmblaCarousel from "embla-carousel-react";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { KataMuncul } from "@/components/visual/KataMuncul";
import { srcGambarKonten } from "@/lib/services/gambar-konten";
import {
  type ItemProgram,
  koleksiProgram,
} from "@/lib/services/landing-collections";
import { TautanGaleri, type TautanGaleriData } from "./FotoKartu";

/**
 * Program & kegiatan unggulan sebagai deretan kartu foto yang bisa digeser.
 *
 * Viewport Embla sengaja `overflow: visible` di dalam kontainer konten, dan
 * section-lah yang memotong di tepi layar: kartu sebelum dan sesudah tetap
 * mengintip di kedua sisi, petunjuk bahwa deretannya bisa digeser.
 */
export function KegiatanSlider({
  konten = {},
  galeri = null,
}: {
  konten?: Record<string, string>;
  galeri?: TautanGaleriData | null;
}) {
  const program = React.useMemo(() => koleksiProgram(konten), [konten]);
  const judul = konten["landing.program_title"] || "Program Unggulan";
  const pengantar = konten["landing.program_subtitle"];

  const [viewportRef, api] = useEmblaCarousel({
    align: "start",
    dragFree: true,
    containScroll: "trimSnaps",
  });
  const [jumlahSnap, setJumlahSnap] = React.useState(0);
  const [snapAktif, setSnapAktif] = React.useState(0);
  const [bisaMundur, setBisaMundur] = React.useState(false);
  const [bisaMaju, setBisaMaju] = React.useState(false);
  const [dipilih, setDipilih] = React.useState<ItemProgram | null>(null);

  React.useEffect(() => {
    if (!api) return;
    const segarkan = () => {
      setJumlahSnap(api.scrollSnapList().length);
      setSnapAktif(api.selectedScrollSnap());
      setBisaMundur(api.canScrollPrev());
      setBisaMaju(api.canScrollNext());
    };
    segarkan();
    api.on("select", segarkan).on("reInit", segarkan);
    return () => {
      api.off("select", segarkan).off("reInit", segarkan);
    };
  }, [api]);

  // Pengembalian awal sesudah semua hook: lihat catatan di FacilitiesSection.
  if (program.length === 0) return null;

  return (
    <section
      id="program"
      className="muncul overflow-hidden border-y border-border bg-muted/40 py-20 sm:py-28"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-10 flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-2xl space-y-3">
            <h2 className="font-serif text-3xl font-bold tracking-tight text-primary text-balance md:text-5xl">
              <KataMuncul teks={judul} />
            </h2>
            {pengantar ? (
              <p className="text-base leading-relaxed text-muted-foreground md:text-lg">
                {pengantar}
              </p>
            ) : null}
          </div>

          {jumlahSnap > 1 ? (
            <div className="flex flex-col items-start gap-4 md:items-end">
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => api?.scrollPrev()}
                  disabled={!bisaMundur}
                  aria-label="Program sebelumnya"
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform hover:opacity-90 active:scale-95 disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <ChevronLeft aria-hidden="true" className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => api?.scrollNext()}
                  disabled={!bisaMaju}
                  aria-label="Program berikutnya"
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-secondary-foreground transition-transform hover:opacity-90 active:scale-95 disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <ChevronRight aria-hidden="true" className="h-5 w-5" />
                </button>
              </div>
              {/* Penanda posisi saja, bukan tombol: titik 8px terlalu kecil
                  untuk jempol, dan tombol panah serta geser sudah cukup. */}
              <div aria-hidden="true" className="flex items-center gap-1.5">
                {Array.from({ length: jumlahSnap }, (_, i) => (
                  <span
                    // biome-ignore lint/suspicious/noArrayIndexKey: urutan titik = urutan snap
                    key={i}
                    className={`h-2 rounded-full transition-all duration-300 ${
                      i === snapAktif ? "w-7 bg-primary" : "w-2 bg-secondary/40"
                    }`}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div
          ref={viewportRef}
          className="cursor-grab overflow-visible active:cursor-grabbing"
        >
          <div className="-ml-5 flex touch-pan-y">
            {program.map((item, i) => (
              <div key={`${i}-${item.title}`} className="shrink-0 pl-5">
                <KartuProgram item={item} onDetail={() => setDipilih(item)} />
              </div>
            ))}
          </div>
        </div>

        {galeri ? (
          <div className="mt-10">
            <TautanGaleri tautan={galeri} />
          </div>
        ) : null}
      </div>

      <Dialog
        open={dipilih !== null}
        onOpenChange={(buka) => {
          if (!buka) setDipilih(null);
        }}
      >
        {dipilih ? (
          <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
            <DetailProgram item={dipilih} galeri={galeri} />
          </DialogContent>
        ) : null}
      </Dialog>
    </section>
  );
}

/**
 * Scrim dan lencana memakai navy tetap, bukan token `primary`: di mode gelap
 * `primary` berubah terang, sedangkan teks di atas foto harus tetap putih.
 */
function KartuProgram({
  item,
  onDetail,
}: {
  item: ItemProgram;
  onDetail: () => void;
}) {
  const src = srcGambarKonten(item.foto);
  return (
    <article className="group relative h-[440px] w-[310px] select-none overflow-hidden rounded-[28px] bg-[#00236f] shadow-[0_10px_30px_-10px_rgba(0,35,111,0.25)] transition-shadow duration-500 hover:shadow-[0_24px_48px_-12px_rgba(0,35,111,0.35)] sm:w-[350px]">
      {src ? (
        // biome-ignore lint/performance/noImgElement: foto dari database, dilayani rute ber-cache sendiri
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
        />
      ) : null}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-linear-to-t from-[#00153f] via-[#00153f]/75 via-40% to-transparent"
      />

      {item.category ? (
        <span className="absolute left-5 top-5 rounded-full border border-white/15 bg-[#00236f]/90 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white">
          {item.category}
        </span>
      ) : null}

      <div className="absolute inset-x-0 bottom-0 flex flex-col p-6">
        <h3 className="font-serif text-3xl font-bold leading-snug text-white line-clamp-2">
          {item.title}
        </h3>
        {item.subtitle ? (
          <p className="mt-1 text-sm font-medium text-white/85 line-clamp-1">
            {item.subtitle}
          </p>
        ) : null}
        <div className="mt-5 flex items-center justify-between gap-3">
          <ul className="flex min-w-0 flex-wrap gap-1.5">
            {item.tags.slice(0, 2).map((tagar) => (
              <li
                key={tagar}
                className="max-w-[9rem] truncate rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs text-white"
              >
                #{tagar}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={onDetail}
            className="-mr-2 inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full px-2 text-xs font-semibold text-secondary-container focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary-container"
          >
            <span>Lihat Detail</span>
            <span className="sr-only">{item.title}</span>
            <ArrowRight
              aria-hidden="true"
              className="h-4 w-4 transition-transform group-hover:translate-x-1"
            />
          </button>
        </div>
      </div>
    </article>
  );
}

function DetailProgram({
  item,
  galeri,
}: {
  item: ItemProgram;
  galeri: TautanGaleriData | null;
}) {
  const src = srcGambarKonten(item.foto);
  return (
    <div className="space-y-5">
      {src ? (
        <div className="-mx-6 -mt-6 aspect-video overflow-hidden rounded-t-2xl bg-muted">
          {/* biome-ignore lint/performance/noImgElement: foto dari database, dilayani rute ber-cache sendiri */}
          <img
            src={src}
            alt={item.title}
            decoding="async"
            className="h-full w-full object-cover"
          />
        </div>
      ) : null}
      <DialogHeader className="pr-8">
        {item.category ? (
          <p className="text-xs font-bold uppercase tracking-wider text-secondary">
            {item.category}
          </p>
        ) : null}
        <DialogTitle className="font-serif text-2xl leading-snug">
          {item.title}
        </DialogTitle>
        {item.subtitle ? (
          <DialogDescription className="pt-0">
            {item.subtitle}
          </DialogDescription>
        ) : null}
      </DialogHeader>
      {item.desc ? (
        <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
          {item.desc}
        </p>
      ) : null}
      {item.tags.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {item.tags.map((tagar) => (
            <li
              key={tagar}
              className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground"
            >
              #{tagar}
            </li>
          ))}
        </ul>
      ) : null}
      <TautanGaleri tautan={galeri} />
    </div>
  );
}
