"use client";

import {
  ArrowRight,
  BookOpen,
  Code2,
  FlaskConical,
  GraduationCap,
  Mic,
  Palette,
  Trophy,
} from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { KataMuncul } from "@/components/visual/KataMuncul";
import { SpotlightCard } from "@/components/visual/SpotlightCard";
import { srcGambarKonten } from "@/lib/services/gambar-konten";
import {
  fotoJurusan,
  type ItemEkskul,
  koleksiEkskul,
} from "@/lib/services/landing-collections";
import type { ProgramStudi } from "@/lib/services/school-profile";
import { FotoKartu, TautanGaleri, type TautanGaleriData } from "./FotoKartu";

/**
 * Ikon ekstrakurikuler diputar berdasarkan posisi. Ia komponen React sehingga
 * tidak bisa disimpan di database, dan kegiatan ke-N tetap butuh satu.
 */
const IKON_EKSKUL = [Code2, FlaskConical, Mic, Trophy, Palette, GraduationCap];

interface ProgramsSectionProps {
  programStudi: ProgramStudi[];
  konten?: Record<string, string>;
  galeri?: TautanGaleriData | null;
}

/**
 * Jurusan (dari database akademik) dan ekstrakurikuler (dari CMS) dalam satu
 * section. Sekolah tanpa jurusan (SMP, SD) hanya melihat ekstrakurikuler,
 * tanpa judul kecil "Jurusan" yang kosong.
 */
export function ProgramsSection({
  programStudi,
  konten = {},
  galeri = null,
}: ProgramsSectionProps) {
  const [kategoriEkskul, setKategoriEkskul] = React.useState("Semua");

  const eyebrow = konten["landing.ekskul_eyebrow"];
  const title = konten["landing.ekskul_title"];
  const subtitle = konten["landing.ekskul_subtitle"];

  const fotoPerJurusan = React.useMemo(() => fotoJurusan(konten), [konten]);
  const adaFotoJurusan = Object.keys(fotoPerJurusan).length > 0;

  const ekskulList = React.useMemo(() => {
    return koleksiEkskul(konten).map((item, i) => ({ ...item, indeks: i }));
  }, [konten]);

  const adaFotoEkskul = ekskulList.some((item) => item.foto);

  const daftarKategori = React.useMemo(() => {
    const setKat = new Set<string>();
    for (const e of ekskulList) {
      if (e.category?.trim()) setKat.add(e.category.trim());
    }
    return ["Semua", ...Array.from(setKat)];
  }, [ekskulList]);

  const ekskulTerfilter =
    kategoriEkskul === "Semua"
      ? ekskulList
      : ekskulList.filter(
          (e) =>
            e.category?.trim().toLowerCase() === kategoriEkskul.toLowerCase(),
        );

  const adaJurusan = programStudi.length > 0;
  const adaEkskul = ekskulList.length > 0;
  if (!adaJurusan && !adaEkskul) return null;
  const adaHeader = Boolean(eyebrow || title || subtitle);
  const keduanya = adaJurusan && adaEkskul;

  return (
    <section className="muncul bg-background py-20 sm:py-28">
      <div className="mx-auto max-w-7xl space-y-12 px-4 sm:px-6 lg:px-8">
        {adaHeader ? (
          <div className="max-w-2xl space-y-3">
            {eyebrow ? (
              <p className="text-sm font-semibold text-secondary">{eyebrow}</p>
            ) : null}
            {title ? (
              <h2 className="font-serif text-3xl font-bold tracking-tight text-primary text-balance md:text-5xl">
                <KataMuncul teks={title} />
              </h2>
            ) : null}
            {subtitle ? (
              <p className="text-base leading-relaxed text-muted-foreground md:text-lg">
                {subtitle}
              </p>
            ) : null}
          </div>
        ) : null}

        {adaJurusan ? (
          <div className="space-y-6">
            {keduanya ? (
              <h3 className="font-serif text-2xl font-bold text-foreground">
                Jurusan
              </h3>
            ) : null}
            <div className="kartu-tengah md:[--kolom:2] lg:[--kolom:3]">
              {programStudi.map((prodi) => (
                <KartuJurusan
                  key={prodi.kode || prodi.nama}
                  prodi={prodi}
                  foto={fotoPerJurusan[prodi.kode] ?? ""}
                  adaFoto={adaFotoJurusan}
                />
              ))}
            </div>
          </div>
        ) : null}

        {adaEkskul ? (
          <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              {keduanya ? (
                <h3 className="font-serif text-2xl font-bold text-foreground">
                  Ekstrakurikuler
                </h3>
              ) : (
                <span />
              )}
              {daftarKategori.length > 2 ? (
                <fieldset className="flex flex-wrap gap-2">
                  <legend className="sr-only">
                    Saring ekstrakurikuler menurut kategori
                  </legend>
                  {daftarKategori.map((kat) => (
                    <button
                      key={kat}
                      type="button"
                      aria-pressed={kategoriEkskul === kat}
                      onClick={() => setKategoriEkskul(kat)}
                      className={`min-h-11 rounded-full px-4 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        kategoriEkskul === kat
                          ? "bg-primary text-primary-foreground"
                          : "border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      {kat}
                    </button>
                  ))}
                </fieldset>
              ) : null}
            </div>

            {ekskulTerfilter.length === 0 ? (
              <div className="space-y-3 rounded-2xl border border-dashed border-border bg-card p-10 text-center">
                <p className="text-sm text-muted-foreground">
                  Belum ada ekstrakurikuler di kategori {kategoriEkskul}.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setKategoriEkskul("Semua")}
                >
                  Tampilkan semua
                </Button>
              </div>
            ) : (
              <div className="kartu-tengah sm:[--kolom:2] lg:[--kolom:3]">
                {ekskulTerfilter.map((item) => (
                  <KartuEkskul
                    key={`${item.indeks}-${item.title}`}
                    item={item}
                    indeks={item.indeks}
                    adaFoto={adaFotoEkskul}
                  />
                ))}
              </div>
            )}
            <TautanGaleri tautan={galeri} />
          </div>
        ) : null}
      </div>
    </section>
  );
}

/**
 * Kartu satu jurusan, dipakai beranda dan halaman Program. `adaFoto` = ada
 * jurusan lain yang berfoto, sehingga yang belum berfoto diberi bingkai ikon.
 */
export function KartuJurusan({
  prodi,
  foto,
  adaFoto,
}: {
  prodi: ProgramStudi;
  foto: string;
  adaFoto: boolean;
}) {
  return (
    <SpotlightCard className="h-full">
      <Card className="group flex flex-col justify-between h-full overflow-hidden p-6 transition-colors duration-300 hover:border-primary/40 bg-card border-border">
        <div className="space-y-4">
          <FotoKartu
            id={foto}
            alt={prodi.nama}
            ikon={adaFoto ? <BookOpen className="h-12 w-12" /> : undefined}
          />
          <div className="flex items-center justify-between">
            {adaFoto ? (
              <span />
            ) : (
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <BookOpen className="h-5 w-5" />
              </div>
            )}
            {prodi.kode ? (
              <Badge variant="prestige" className="text-xs">
                {prodi.kode}
              </Badge>
            ) : null}
          </div>

          <div className="space-y-2">
            <h3 className="font-bold text-lg text-foreground">{prodi.nama}</h3>
            {prodi.deskripsi ? (
              <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
                {prodi.deskripsi}
              </p>
            ) : null}
          </div>
        </div>

        <div className="pt-6 mt-4 border-t border-border/60 flex items-center justify-between text-xs font-semibold text-primary">
          <Link
            href="/pmb"
            className="inline-flex items-center gap-1.5 hover:underline"
          >
            <span>Pilih di PMB</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </Card>
    </SpotlightCard>
  );
}

/**
 * Kartu satu kegiatan: foto 16:10 di atas, teks di permukaan kartu di bawah.
 * Ikonnya dipilih dari `indeks` di dalam komponen ini, bukan dikirim sebagai
 * prop: halaman server tidak bisa mengirim komponen React ke komponen klien.
 * Garis di dasar kartu memanjang saat disorot, menandai kartu yang sedang
 * dibaca tanpa menggeser tata letaknya.
 */
export function KartuEkskul({
  item,
  indeks,
  adaFoto,
}: {
  item: ItemEkskul;
  indeks: number;
  adaFoto: boolean;
}) {
  const Icon = IKON_EKSKUL[indeks % IKON_EKSKUL.length];
  const src = srcGambarKonten(item.foto);
  return (
    <SpotlightCard className="h-full rounded-3xl">
      <article className="group relative flex h-full flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-[0_10px_30px_-10px_rgba(0,35,111,0.08)]">
        {adaFoto ? (
          <div className="relative aspect-16/10 overflow-hidden bg-muted">
            {src ? (
              // biome-ignore lint/performance/noImgElement: foto dari database, dilayani rute ber-cache sendiri
              <img
                src={src}
                alt={item.title}
                width={1600}
                height={1000}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
              />
            ) : (
              <div
                aria-hidden="true"
                className="flex h-full items-center justify-center text-primary/40"
              >
                <Icon className="h-12 w-12" />
              </div>
            )}
            {item.category ? (
              <span className="absolute left-4 top-4 rounded-full bg-[#00236f]/90 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white">
                {item.category}
              </span>
            ) : null}
          </div>
        ) : null}
        <div className="flex flex-1 flex-col gap-2 p-6">
          {!adaFoto ? (
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary/15 text-secondary">
                <Icon aria-hidden="true" className="h-5 w-5" />
              </div>
              {item.category ? (
                <Badge variant="outline" className="text-[11px]">
                  {item.category}
                </Badge>
              ) : null}
            </div>
          ) : null}
          <h3 className="font-serif text-xl font-bold text-foreground">
            {item.title}
          </h3>
          {item.desc ? (
            <p className="text-sm leading-relaxed text-muted-foreground">
              {item.desc}
            </p>
          ) : null}
        </div>
        <span
          aria-hidden="true"
          className="absolute bottom-0 left-0 h-1 w-0 bg-linear-to-r from-secondary to-primary transition-all duration-500 group-hover:w-full"
        />
      </article>
    </SpotlightCard>
  );
}
