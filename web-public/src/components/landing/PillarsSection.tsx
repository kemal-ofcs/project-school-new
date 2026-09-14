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
import type { SchoolProfile } from "@/lib/services/school-profile";

const PILAR = [
  {
    icon: Globe,
    title: "Kurikulum Adaptif & Global",
    desc: "Penyelarasan Kurikulum Merdeka dengan standar internasional, bilingual harian, serta muatan riset saintifik dan Coding terapan.",
    tag: "Bilingual Pathway",
  },
  {
    icon: GraduationCap,
    title: "Pendidik Berintegritas & Magister",
    desc: "Lebih dari 90% staf pengajar berkualifikasi Magister & Doktor lulusan perguruan tinggi terkemuka dengan rasio guru-siswa ideal 1:12.",
    tag: "Rasio Guru 1:12",
  },
  {
    icon: ShieldCheck,
    title: "Bina Karakter & Kepemimpinan",
    desc: "Pembiasaan ibadah harian, program mentoring akhlak 1-on-1, wawasan kebangsaan, serta wadah kepemimpinan organisasi siswa aktif.",
    tag: "Mentoring Karakter",
  },
  {
    icon: Cpu,
    title: "Fasilitas Digital & Lab AI",
    desc: "Smart Classroom interaktif, Laboratorium Robotika & Kecerdasan Buatan modern, perpustakaan digital, serta sarana olahraga berstandar.",
    tag: "Smart Eco-Campus",
  },
] as const;

interface PillarsSectionProps {
  profil: SchoolProfile;
}

export function PillarsSection({ profil }: PillarsSectionProps) {
  const namaPimpinan = profil.namaPimpinan ?? "Dr. H. Bambang Sudarmono, M.Pd.";
  const jabatanPimpinan = profil.jabatanPimpinan ?? "Kepala Sekolah";

  return (
    <section className="py-20 sm:py-28 bg-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-16">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="max-w-2xl space-y-2">
            <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-secondary">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Keunggulan Institusi</span>
            </div>
            <h2 className="font-bold text-2xl sm:text-4xl text-foreground tracking-tight">
              4 Pilar Pendidikan Masa Depan
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
              Kami memadukan ketangguhan moral spiritual, kurikulum berstandar
              internasional, serta ekosistem pembelajaran modern untuk
              melahirkan inovator muda yang berakhlak mulia.
            </p>
          </div>
          <div className="hidden lg:flex items-center gap-2 text-xs font-semibold text-accent rounded-full bg-muted px-4 py-2">
            <ShieldCheck className="h-4 w-4" />
            <span>Green & Digital Eco-Campus Bersertifikasi</span>
          </div>
        </div>

        {/* 4 Pillars Grid */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {PILAR.map((item) => {
            const Icon = item.icon;
            return (
              <Card
                key={item.title}
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
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {item.desc}
                    </p>
                  </div>
                </div>

                <div className="pt-6 flex items-center justify-between text-xs font-semibold text-primary">
                  <Badge variant="outline" className="text-[11px] font-medium">
                    {item.tag}
                  </Badge>
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                </div>
              </Card>
            );
          })}
        </div>

        {/* Sambutan Kepala Sekolah */}
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-12 items-center">
            {/* Foto / Ilustrasi Pimpinan */}
            <div className="md:col-span-4 bg-muted/60 p-8 flex flex-col items-center justify-center text-center border-b md:border-b-0 md:border-r border-border h-full">
              <div className="flex h-28 w-28 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-md mb-4">
                <GraduationCap className="h-14 w-14" />
              </div>
              <h4 className="font-bold text-base text-foreground">
                {namaPimpinan}
              </h4>
              <p className="text-xs font-semibold text-secondary mt-0.5">
                {jabatanPimpinan}
              </p>
              <Badge variant="success" className="mt-3 text-[10px]">
                Dewan Pembina Kurikulum
              </Badge>
            </div>

            {/* Pesan Visi & Sambutan */}
            <div className="md:col-span-8 p-6 sm:p-10 space-y-4">
              <Quote className="h-8 w-8 text-primary/30" />
              <blockquote className="font-medium text-base sm:text-lg text-foreground leading-relaxed italic">
                &ldquo;Pendidikan sejati bukan sekadar mengisi wadah
                pengetahuan, melainkan menyalakan api keingintahuan, memperkuat
                kompas moral, dan membekali anak-anak kita dengan keberanian
                untuk menjadi pemecah masalah di panggung global.&rdquo;
              </blockquote>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Kami menyambut hangat setiap calon siswa dan orang tua untuk
                bertumbuh bersama dalam keluarga besar sekolah kami. Mari
                persiapkan generasi emas yang mandiri, berkarakter, dan berdaya
                saing internasional.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
