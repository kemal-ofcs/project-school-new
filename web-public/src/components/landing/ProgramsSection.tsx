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
  Trophy,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  // Seluruh teksnya dari CMS; tidak ada teks contoh di kode. Bagian yang
  // belum diisi disembunyikan.
  const eyebrow = konten["landing.ekskul_eyebrow"];
  const title = konten["landing.ekskul_title"];
  const subtitle = konten["landing.ekskul_subtitle"];

  const ekskulList = koleksiEkskul(konten).map((item, i) => ({
    ...item,
    icon: IKON_EKSKUL[i % IKON_EKSKUL.length],
  }));

  // Jurusan datang dari `akademik_jurusan`, jadi section ini tetap punya isi
  // walau CMS-nya belum diisi. Hanya bila keduanya kosong ia disembunyikan.
  if (programStudi.length === 0 && ekskulList.length === 0) return null;
  const adaHeader = Boolean(eyebrow || title || subtitle);

  return (
    <section className="py-20 sm:py-28 bg-muted/40 border-y border-border">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-12">
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
        <Tabs defaultValue="jurusan" className="w-full">
          <div className="flex justify-center">
            <TabsList>
              <TabsTrigger value="jurusan">
                Program Keahlian / Jurusan
              </TabsTrigger>
              <TabsTrigger value="ekskul">Ekstrakurikuler Unggulan</TabsTrigger>
            </TabsList>
          </div>

          {/* Tab 1: Program Keahlian (Dari DB) */}
          <TabsContent value="jurusan">
            {programStudi.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground bg-card">
                Belum ada jurusan aktif yang terdaftar di database.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                {programStudi.map((prodi) => (
                  <Card
                    key={prodi.kode || prodi.nama}
                    className="flex flex-col justify-between p-6 transition-all duration-300 hover:shadow-lg hover:border-primary/50"
                  >
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
                        {/* Deskripsi jurusan diisi di menu Akademik. Yang
                            kosong tidak ditambal teks contoh: sebelumnya
                            setiap jurusan tanpa deskripsi menampilkan kalimat
                            yang sama persis. */}
                        {prodi.deskripsi ? (
                          <p className="text-sm text-muted-foreground leading-relaxed">
                            {prodi.deskripsi}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <div className="pt-6 border-t border-border/60 flex items-center justify-between text-xs font-semibold text-primary">
                      <Link
                        href="/pmb"
                        className="inline-flex items-center gap-1.5 hover:underline"
                      >
                        <span>Pilih di PMB</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Tab 2: Ekstrakurikuler */}
          <TabsContent value="ekskul">
            {ekskulList.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground bg-card">
                Belum ada kegiatan ekstrakurikuler yang ditampilkan.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {ekskulList.map((item, i) => {
                  const Icon = item.icon;
                  return (
                    <Card
                      key={`${i}-${item.title}`}
                      className="flex flex-col justify-between p-6 transition-all duration-300 hover:shadow-md hover:border-border"
                    >
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
