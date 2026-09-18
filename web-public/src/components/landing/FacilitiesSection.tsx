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
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  bangunKoleksi,
  KUNCI_KOLEKSI,
  normalisasiFasilitas,
  uraiKoleksi,
} from "@/lib/services/landing-collections";

const FASILITAS = [
  {
    icon: Tv,
    name: "Interactive Smart Classroom",
    tag: "Akademik Digital",
    shortDesc:
      "Papan tulis pintar 86 inci 4K, sistem tata udara sentral, dan koneksi internet serat optik dedicated.",
    specs: [
      "Interactive Smart Board 86 Inch 4K Touch",
      "Kapasitas ergonomis 24 siswa per kelas",
      "Sistem sirkulasi udara HEPA Filter & AC Inverter",
      "High-speed Wi-Fi 6 per ruangan",
    ],
  },
  {
    icon: Cpu,
    name: "Laboratorium Robotika & AI",
    tag: "High-Tech Lab",
    shortDesc:
      "Workstation Core i9 generasi terbaru, perangkat mikrokontroler IoT, 3D Printer, dan arena uji robot.",
    specs: [
      "40 Unit Workstation Grafis High-Performance",
      "3D Printer & CNC Laser Cutter untuk prototipe",
      "Toolkit sensor IoT, drone autonomous, dan kit robotik",
      "Lisensi software riset AI & IDE pemrograman",
    ],
  },
  {
    icon: BookOpen,
    name: "Perpustakaan Digital & E-Learning",
    tag: "Pusat Riset",
    shortDesc:
      "Akses 10.000+ e-book, jurnal internasional terakreditasi, kubikel riset hening, dan ruang diskusi.",
    specs: [
      "Akses repositori jurnal Cambridge & JSTOR",
      "Tablet e-reader & workstation katalog digital",
      "Silent study pods untuk belajar mandiri",
      "Koleksi literatur fisik 15.000 judul terkurasi",
    ],
  },
  {
    icon: Dumbbell,
    name: "Indoor Sport Hall & Gymnasium",
    tag: "Kebugaran Fisik",
    shortDesc:
      "Lapangan multifungsi basket berstandar FIBA, lapangan futsal vinyl, bulu tangkis, dan fitness corner.",
    specs: [
      "Lantai kayu parket standar turnamen DBL/FIBA",
      "Tribun penonton kapasitas 600 orang",
      "Peralatan kebugaran & conditioning modern",
      "Loker privat dan kamar mandi bilas bersih",
    ],
  },
  {
    icon: Radio,
    name: "Studio Podcast & Penyiaran Media",
    tag: "Komunikasi Kreatif",
    shortDesc:
      "Peredam suara akustik profesional, kamera cinema 4K, mikrofon broadcast, dan software editing video.",
    specs: [
      "Ruang rekaman kedap suara standar broadcast",
      "Multi-camera setup 4K & switcher video live",
      "Mikrofon podcast Shure dengan audio interface",
      "Wadah kreasi karya jurnalistik siswa & warta sekolah",
    ],
  },
  {
    icon: Building2,
    name: "Auditorium & Gedung Serbaguna",
    tag: "Ajang Prestasi",
    shortDesc:
      "Kapasitas 1.000 kursi dengan tata panggung audio-visual canggih untuk wisuda, seminar, dan festival seni.",
    specs: [
      "Kapasitas ampiteater 1.000 audiens",
      "Videotron LED raksasa P2.5 High-Definition",
      "Sistem tata suara digital line array 20.000 watt",
      "Ruang transit VIP dan ruang rias pengisi acara",
    ],
  },
] as const;

function parseSpecs(
  raw: string | undefined,
  fallback: readonly string[],
): string[] {
  if (!raw || !raw.trim()) return [...fallback];
  const lines = raw
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  return lines.length > 0 ? lines : [...fallback];
}

interface FacilitiesSectionProps {
  konten?: Record<string, string>;
}

export function FacilitiesSection({ konten = {} }: FacilitiesSectionProps) {
  const eyebrow = konten["landing.fasilitas_eyebrow"] || "Infrastruktur Kampus";
  const title =
    konten["landing.fasilitas_title"] || "Fasilitas Modern Penunjang Potensi";
  const subtitle =
    konten["landing.fasilitas_subtitle"] ||
    "Sarana dan prasarana berstandar internasional yang dirancang untuk kenyamanan belajar, kesehatan raga, dan eksplorasi kreativitas tanpa batas.";

  // Jumlah fasilitas ditentukan isinya, bukan kode. Kunci bernomor lama tetap
  // dibaca sebagai lapis kedua supaya konten yang sudah diisi lewat panel versi
  // sebelumnya tidak lenyap saat aplikasi diperbarui.
  const fasilitasLama = FASILITAS.map((bawaan, i) => ({
    name: konten[`landing.fasilitas${i + 1}_name`] || bawaan.name,
    tag: konten[`landing.fasilitas${i + 1}_tag`] || bawaan.tag,
    desc: konten[`landing.fasilitas${i + 1}_desc`] || bawaan.shortDesc,
    specs: parseSpecs(konten[`landing.fasilitas${i + 1}_specs`], bawaan.specs),
  }));
  const adaFasilitasLama = FASILITAS.some(
    (_, i) =>
      konten[`landing.fasilitas${i + 1}_name`] ||
      konten[`landing.fasilitas${i + 1}_tag`] ||
      konten[`landing.fasilitas${i + 1}_desc`] ||
      konten[`landing.fasilitas${i + 1}_specs`],
  );

  const fasilitasFinal = bangunKoleksi(
    uraiKoleksi(konten[KUNCI_KOLEKSI.fasilitas]),
    adaFasilitasLama ? fasilitasLama : [],
    FASILITAS.map(({ name, tag, shortDesc, specs }) => ({
      name,
      tag,
      desc: shortDesc,
      specs: [...specs],
    })),
    normalisasiFasilitas,
  );

  // `shortDesc` dipertahankan sebagai nama field yang dipakai JSX di bawah;
  // koleksinya menyimpannya sebagai `desc` supaya seragam dengan blok lain.
  const facilitiesList = fasilitasFinal.map((item, i) => ({
    icon: FASILITAS[i % FASILITAS.length].icon,
    name: item.name,
    tag: item.tag,
    shortDesc: item.desc,
    specs: item.specs,
  }));

  const [selectedFacility, setSelectedFacility] = React.useState<
    (typeof facilitiesList)[number] | null
  >(null);

  return (
    <section className="py-20 sm:py-28 bg-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-12">
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto space-y-3">
          <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-secondary">
            <Building2 className="h-3.5 w-3.5" />
            <span>{eyebrow}</span>
          </div>
          <h2 className="font-bold text-2xl sm:text-4xl text-foreground tracking-tight">
            {title}
          </h2>
          <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
            {subtitle}
          </p>
        </div>

        {/* Facilities Grid */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {facilitiesList.map((item) => {
            const Icon = item.icon;
            return (
              <Card
                key={item.name}
                className="group flex flex-col justify-between p-6 transition-all duration-300 hover:shadow-lg hover:-translate-y-1 bg-card border-border"
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                      <Icon className="h-6 w-6" />
                    </div>
                    <Badge variant="outline" className="text-[11px]">
                      {item.tag}
                    </Badge>
                  </div>

                  <div className="space-y-2">
                    <h3 className="font-bold text-lg text-foreground group-hover:text-primary transition-colors">
                      {item.name}
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {item.shortDesc}
                    </p>
                  </div>
                </div>

                <div className="pt-6 border-t border-border/60">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full justify-between text-xs font-semibold text-primary hover:bg-primary/10"
                    onClick={() => setSelectedFacility(item)}
                  >
                    <span>Lihat Spesifikasi Fasilitas</span>
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Interactive Facility Modal Dialog */}
        <Dialog
          open={selectedFacility !== null}
          onOpenChange={(open) => {
            if (!open) setSelectedFacility(null);
          }}
        >
          {selectedFacility ? (
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <div className="flex items-center gap-2 text-xs font-bold text-secondary uppercase tracking-wider">
                  <Badge variant="outline">{selectedFacility.tag}</Badge>
                </div>
                <DialogTitle className="mt-1">
                  {selectedFacility.name}
                </DialogTitle>
                <DialogDescription>
                  {selectedFacility.shortDesc}
                </DialogDescription>
              </DialogHeader>

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
