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
import type { ProgramStudi } from "@/lib/services/school-profile";

const EKSKUL = [
  {
    icon: Code2,
    title: "Robotika & Coding Club",
    category: "Sains & Teknologi",
    desc: "Eksplorasi kecerdasan buatan, mikrokontroler IoT, kompetisi robotik nasional & internasional.",
  },
  {
    icon: FlaskConical,
    title: "Karya Ilmiah Remaja (KIR)",
    category: "Riset Akademis",
    desc: "Inkubasi riset sains terapan, bioteknologi, dan publikasi jurnal ilmiah tingkat SMA.",
  },
  {
    icon: Mic,
    title: "English Debate & Model UN",
    category: "Bahasa & Diplomasi",
    desc: "Pengasahan retorika kritis, diplomasi internasional simulasi PBB, serta sertifikasi IELTS/TOEFL.",
  },
  {
    icon: Trophy,
    title: "Sport Club (Basket & Futsal)",
    category: "Olahraga & Fisik",
    desc: "Pelatihan fisik intensif bersama pelatih berlisensi nasional, turnamen DBL dan liga antar-sekolah.",
  },
  {
    icon: Palette,
    title: "Desain Grafis & Sinematografi",
    category: "Kreatif & Seni",
    desc: "Produksi film pendek, fotografi jurnalistik, animasi 3D, serta manajemen media digital sekolah.",
  },
  {
    icon: GraduationCap,
    title: "Olimpiade Sains Nasional (OSN)",
    category: "Intensif Prestasi",
    desc: "Bimbingan khusus calon juara OSN di bidang Matematika, Fisika, Kimia, Astronomi, dan Informatika.",
  },
] as const;

interface ProgramsSectionProps {
  programStudi: ProgramStudi[];
  konten?: Record<string, string>;
}

export function ProgramsSection({
  programStudi,
  konten = {},
}: ProgramsSectionProps) {
  const eyebrow =
    konten["landing.ekskul_eyebrow"] || "Eksplorasi Minat & Bakat";
  const title =
    konten["landing.ekskul_title"] || "Program Akademik & Pengembangan Diri";
  const subtitle =
    konten["landing.ekskul_subtitle"] ||
    "Pilihan kurikulum terintegrasi dan wadah ekstrakurikuler komprehensif untuk mengasah potensi intelektual, artistik, dan kepemimpinan setiap siswa.";

  const ekskulList = [
    {
      icon: EKSKUL[0].icon,
      title: konten["landing.ekskul1_title"] || EKSKUL[0].title,
      category: konten["landing.ekskul1_cat"] || EKSKUL[0].category,
      desc: konten["landing.ekskul1_desc"] || EKSKUL[0].desc,
    },
    {
      icon: EKSKUL[1].icon,
      title: konten["landing.ekskul2_title"] || EKSKUL[1].title,
      category: konten["landing.ekskul2_cat"] || EKSKUL[1].category,
      desc: konten["landing.ekskul2_desc"] || EKSKUL[1].desc,
    },
    {
      icon: EKSKUL[2].icon,
      title: konten["landing.ekskul3_title"] || EKSKUL[2].title,
      category: konten["landing.ekskul3_cat"] || EKSKUL[2].category,
      desc: konten["landing.ekskul3_desc"] || EKSKUL[2].desc,
    },
    {
      icon: EKSKUL[3].icon,
      title: konten["landing.ekskul4_title"] || EKSKUL[3].title,
      category: konten["landing.ekskul4_cat"] || EKSKUL[3].category,
      desc: konten["landing.ekskul4_desc"] || EKSKUL[3].desc,
    },
    {
      icon: EKSKUL[4].icon,
      title: konten["landing.ekskul5_title"] || EKSKUL[4].title,
      category: konten["landing.ekskul5_cat"] || EKSKUL[4].category,
      desc: konten["landing.ekskul5_desc"] || EKSKUL[4].desc,
    },
    {
      icon: EKSKUL[5].icon,
      title: konten["landing.ekskul6_title"] || EKSKUL[5].title,
      category: konten["landing.ekskul6_cat"] || EKSKUL[5].category,
      desc: konten["landing.ekskul6_desc"] || EKSKUL[5].desc,
    },
  ];

  return (
    <section className="py-20 sm:py-28 bg-muted/40 border-y border-border">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-12">
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto space-y-3">
          <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-secondary">
            <Layers className="h-3.5 w-3.5" />
            <span>{eyebrow}</span>
          </div>
          <h2 className="font-bold text-2xl sm:text-4xl text-foreground tracking-tight">
            {title}
          </h2>
          <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
            {subtitle}
          </p>
        </div>

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
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {prodi.deskripsi ??
                            "Program kurikulum komprehensif dengan pembelajaran berbasis riset, proyek terapan, dan pengayaan sertifikasi kompetensi keahlian."}
                        </p>
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
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {ekskulList.map((item) => {
                const Icon = item.icon;
                return (
                  <Card
                    key={item.title}
                    className="flex flex-col justify-between p-6 transition-all duration-300 hover:shadow-md hover:border-border"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary/15 text-secondary">
                          <Icon className="h-5 w-5" />
                        </div>
                        <Badge variant="outline" className="text-[11px]">
                          {item.category}
                        </Badge>
                      </div>

                      <h3 className="font-bold text-base text-foreground">
                        {item.title}
                      </h3>
                      <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                        {item.desc}
                      </p>
                    </div>
                  </Card>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </section>
  );
}
