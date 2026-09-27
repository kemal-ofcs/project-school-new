"use client";

import {
  ArrowRight,
  BookOpen,
  Code2,
  FlaskConical,
  GraduationCap,
  Layers,
  Mic,
  Palette,
  Search,
  Trophy,
  X,
} from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SpotlightCard } from "@/components/visual/SpotlightCard";
import { koleksiEkskul } from "@/lib/services/landing-collections";
import type { ProgramStudi } from "@/lib/services/school-profile";

/**
 * Ikon ekstrakurikuler diputar berdasarkan posisi. Ia komponen React sehingga
 * tidak bisa disimpan di database, dan kegiatan ke-N tetap butuh satu.
 */
const IKON_EKSKUL = [Code2, FlaskConical, Mic, Trophy, Palette, GraduationCap];

interface ProgramsSectionProps {
  programStudi: ProgramStudi[];
  konten?: Record<string, string>;
}

export function ProgramsSection({
  programStudi,
  konten = {},
}: ProgramsSectionProps) {
  const [kataKunci, setKataKunci] = React.useState("");
  const [kategoriEkskul, setKategoriEkskul] = React.useState("Semua");

  const eyebrow = konten["landing.ekskul_eyebrow"];
  const title = konten["landing.ekskul_title"];
  const subtitle = konten["landing.ekskul_subtitle"];

  const ekskulList = React.useMemo(() => {
    return koleksiEkskul(konten).map((item, i) => ({
      ...item,
      icon: IKON_EKSKUL[i % IKON_EKSKUL.length],
    }));
  }, [konten]);

  // Ekstrak kategori unik untuk filter chips
  const daftarKategori = React.useMemo(() => {
    const setKat = new Set<string>();
    ekskulList.forEach((e) => {
      if (e.category?.trim()) setKat.add(e.category.trim());
    });
    return ["Semua", ...Array.from(setKat)];
  }, [ekskulList]);

  // Filter program studi berdasarkan kata kunci
  const prodiTerfilter = React.useMemo(() => {
    const q = kataKunci.trim().toLowerCase();
    if (!q) return programStudi;
    return programStudi.filter(
      (p) =>
        p.nama.toLowerCase().includes(q) ||
        p.kode?.toLowerCase().includes(q) ||
        p.deskripsi?.toLowerCase().includes(q),
    );
  }, [programStudi, kataKunci]);

  // Filter ekskul berdasarkan kata kunci dan kategori
  const ekskulTerfilter = React.useMemo(() => {
    const q = kataKunci.trim().toLowerCase();
    return ekskulList.filter((e) => {
      const matchKat =
        kategoriEkskul === "Semua" ||
        e.category?.trim().toLowerCase() === kategoriEkskul.toLowerCase();
      if (!matchKat) return false;
      if (!q) return true;
      return (
        e.title.toLowerCase().includes(q) ||
        e.desc?.toLowerCase().includes(q) ||
        e.category?.toLowerCase().includes(q)
      );
    });
  }, [ekskulList, kataKunci, kategoriEkskul]);

  if (programStudi.length === 0 && ekskulList.length === 0) return null;
  const adaHeader = Boolean(eyebrow || title || subtitle);

  return (
    <section className="py-20 sm:py-28 bg-muted/40 border-y border-border">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-10">
        {adaHeader ? (
          <div className="text-center max-w-2xl mx-auto space-y-3">
            {eyebrow ? (
              <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-secondary">
                <Layers className="h-3.5 w-3.5" />
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
        ) : null}

        {/* Interactive Tabs */}
        <Tabs defaultValue="jurusan" className="w-full space-y-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <TabsList>
              <TabsTrigger value="jurusan">
                Program Keahlian / Jurusan ({programStudi.length})
              </TabsTrigger>
              <TabsTrigger value="ekskul">
                Ekstrakurikuler Unggulan ({ekskulList.length})
              </TabsTrigger>
            </TabsList>

            {/* Pencarian Cepat */}
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={kataKunci}
                onChange={(e) => setKataKunci(e.target.value)}
                placeholder="Cari jurusan atau ekskul..."
                aria-label="Cari jurusan atau ekstrakurikuler"
                className="w-full h-10 pl-9 pr-8 rounded-xl border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition-shadow"
              />
              {kataKunci ? (
                <button
                  type="button"
                  onClick={() => setKataKunci("")}
                  aria-label="Hapus pencarian"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
          </div>

          {/* Tab 1: Program Keahlian (Dari DB) */}
          <TabsContent value="jurusan" className="space-y-6">
            {programStudi.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground bg-card">
                Belum ada jurusan aktif yang terdaftar di database.
              </div>
            ) : prodiTerfilter.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-10 text-center space-y-3 bg-card">
                <p className="text-sm text-muted-foreground">
                  Tidak ada jurusan yang cocok dengan pencarian &quot;
                  {kataKunci}&quot;.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setKataKunci("")}
                >
                  Reset Pencarian
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                {prodiTerfilter.map((prodi) => (
                  <SpotlightCard
                    key={prodi.kode || prodi.nama}
                    className="h-full"
                  >
                    <Card className="flex flex-col justify-between h-full p-6 transition-all duration-300 hover:shadow-lg hover:border-primary/50 bg-card border-border">
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <BookOpen className="h-5 w-5" />
                          </div>
                          {prodi.kode ? (
                            <Badge variant="prestige" className="text-xs">
                              {prodi.kode}
                            </Badge>
                          ) : null}
                        </div>

                        <div className="space-y-2">
                          <h3 className="font-bold text-lg text-foreground">
                            {prodi.nama}
                          </h3>
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
                ))}
              </div>
            )}
          </TabsContent>

          {/* Tab 2: Ekstrakurikuler */}
          <TabsContent value="ekskul" className="space-y-6">
            {/* Filter Chips Kategori */}
            {daftarKategori.length > 2 ? (
              <div className="flex flex-wrap gap-2 pt-1">
                {daftarKategori.map((kat) => (
                  <button
                    key={kat}
                    type="button"
                    onClick={() => setKategoriEkskul(kat)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      kategoriEkskul === kat
                        ? "bg-secondary text-secondary-foreground shadow-xs"
                        : "bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                    }`}
                  >
                    {kat}
                  </button>
                ))}
              </div>
            ) : null}

            {ekskulList.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground bg-card">
                Belum ada kegiatan ekstrakurikuler yang ditampilkan.
              </div>
            ) : ekskulTerfilter.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-10 text-center space-y-3 bg-card">
                <p className="text-sm text-muted-foreground">
                  Tidak ada ekstrakurikuler yang cocok dengan kriteria filter.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setKataKunci("");
                    setKategoriEkskul("Semua");
                  }}
                >
                  Reset Filter
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {ekskulTerfilter.map((item, i) => {
                  const Icon = item.icon;
                  return (
                    <SpotlightCard
                      key={`${i}-${item.title}`}
                      className="h-full"
                    >
                      <Card className="flex flex-col justify-between h-full p-6 transition-all duration-300 hover:shadow-md hover:border-border bg-card border-border">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary/15 text-secondary">
                              <Icon className="h-5 w-5" />
                            </div>
                            {item.category ? (
                              <Badge variant="outline" className="text-[11px]">
                                {item.category}
                              </Badge>
                            ) : null}
                          </div>

                          <h3 className="font-bold text-base text-foreground">
                            {item.title}
                          </h3>
                          {item.desc ? (
                            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                              {item.desc}
                            </p>
                          ) : null}
                        </div>
                      </Card>
                    </SpotlightCard>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </section>
  );
}
