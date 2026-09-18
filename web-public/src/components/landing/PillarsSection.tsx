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
import {
  bangunKoleksi,
  KUNCI_KOLEKSI,
  normalisasiPilar,
  uraiKoleksi,
} from "@/lib/services/landing-collections";
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
  konten?: Record<string, string>;
}

export function PillarsSection({ profil, konten = {} }: PillarsSectionProps) {
  const eyebrow = konten["landing.pillars_eyebrow"] || "Keunggulan Institusi";
  const title =
    konten["landing.pillars_title"] || "4 Pilar Pendidikan Masa Depan";
  const subtitle =
    konten["landing.pillars_subtitle"] ||
    "Kami memadukan ketangguhan moral spiritual, kurikulum berstandar internasional, serta ekosistem pembelajaran modern untuk melahirkan inovator muda yang berakhlak mulia.";
  const badgePill =
    konten["landing.pillars_badge"] ||
    "Green & Digital Eco-Campus Bersertifikasi";

  // Jumlah pilar ditentukan isinya, bukan kode. Kunci bernomor lama tetap
  // dibaca sebagai lapis kedua supaya konten yang sudah diisi lewat panel versi
  // sebelumnya tidak lenyap saat aplikasi diperbarui.
  const pilarLama = PILAR.map((bawaan, i) => ({
    title: konten[`landing.pilar${i + 1}_title`] || bawaan.title,
    desc: konten[`landing.pilar${i + 1}_desc`] || bawaan.desc,
    tag: konten[`landing.pilar${i + 1}_tag`] || bawaan.tag,
  }));
  const adaKunciLama = PILAR.some(
    (_, i) =>
      konten[`landing.pilar${i + 1}_title`] ||
      konten[`landing.pilar${i + 1}_desc`] ||
      konten[`landing.pilar${i + 1}_tag`],
  );

  const pilarFinal = bangunKoleksi(
    uraiKoleksi(konten[KUNCI_KOLEKSI.pilar]),
    adaKunciLama ? pilarLama : [],
    PILAR.map(({ title, desc, tag }) => ({ title, desc, tag })),
    normalisasiPilar,
  );

  // Ikonnya tidak bisa datang dari database — ia komponen React. Paletnya
  // diputar berdasarkan posisi, sehingga pilar kelima dan seterusnya tetap
  // punya ikon tanpa menuntut orang yang mengisi konten memilih satu.
  const pillarsData = pilarFinal.map((item, i) => ({
    ...item,
    icon: PILAR[i % PILAR.length].icon,
  }));

  const namaPimpinan =
    konten["landing.sambutan_nama"] || profil.namaPimpinan || "Nanang Kosim";
  const jabatanPimpinan =
    konten["landing.sambutan_jabatan"] ||
    profil.jabatanPimpinan ||
    "Kepala Yayasan";
  const badgePimpinan =
    konten["landing.sambutan_badge"] || "Dewan Pembina Kurikulum";
  const sambutanQuote =
    konten["landing.sambutan_quote"] ||
    "“Pendidikan sejati bukan sekadar mengisi wadah pengetahuan, melainkan menyalakan api keingintahuan, memperkuat kompas moral, dan membekali anak-anak kita dengan keberanian untuk menjadi pemecah masalah di panggung global.”";
  const sambutanBody =
    konten["landing.sambutan_body"] ||
    "Kami menyambut hangat setiap calon siswa dan orang tua untuk bertumbuh bersama dalam keluarga besar sekolah kami. Mari persiapkan generasi emas yang mandiri, berkarakter, dan berdaya saing internasional.";

  return (
    <section className="py-20 sm:py-28 bg-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-16">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="max-w-2xl space-y-2">
            <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-secondary">
              <Sparkles className="h-3.5 w-3.5" />
              <span>{eyebrow}</span>
            </div>
            <h2 className="font-bold text-2xl sm:text-4xl text-foreground tracking-tight">
              {title}
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
              {subtitle}
            </p>
          </div>
          <div className="hidden lg:flex items-center gap-2 text-xs font-semibold text-accent rounded-full bg-muted px-4 py-2">
            <ShieldCheck className="h-4 w-4" />
            <span>{badgePill}</span>
          </div>
        </div>

        {/* 4 Pillars Grid */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {pillarsData.map((item) => {
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

        {/* Sambutan Pimpinan Sekolah / Yayasan */}
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
                {badgePimpinan}
              </Badge>
            </div>

            {/* Pesan Visi & Sambutan */}
            <div className="md:col-span-8 p-6 sm:p-10 space-y-4">
              <Quote className="h-8 w-8 text-primary/30" />
              <blockquote className="font-medium text-base sm:text-lg text-foreground leading-relaxed italic">
                {sambutanQuote}
              </blockquote>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {sambutanBody}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
