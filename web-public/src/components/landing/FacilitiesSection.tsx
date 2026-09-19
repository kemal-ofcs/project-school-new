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
import { koleksiFasilitas } from "@/lib/services/landing-collections";

/**
 * Ikon fasilitas diputar berdasarkan posisi. Ia komponen React sehingga tidak
 * bisa disimpan di database, dan fasilitas ke-N tetap butuh satu.
 */
const IKON_FASILITAS = [Tv, Cpu, BookOpen, Dumbbell, Radio, Building2];

interface FacilitiesSectionProps {
  konten?: Record<string, string>;
}

export function FacilitiesSection({ konten = {} }: FacilitiesSectionProps) {
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
    <section className="py-20 sm:py-28 bg-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-12">
        {adaHeader ? (
          <div className="text-center max-w-2xl mx-auto space-y-3">
            {eyebrow ? (
              <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-secondary">
                <Building2 className="h-3.5 w-3.5" />
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

        {/* Facilities Grid */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {facilitiesList.map((item, i) => {
            const Icon = item.icon;
            return (
              <Card
                key={`${i}-${item.name}`}
                className="group flex flex-col justify-between p-6 transition-all duration-300 hover:shadow-lg hover:-translate-y-1 bg-card border-border"
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                      <Icon className="h-6 w-6" />
                    </div>
                    {item.tag ? (
                      <Badge variant="outline" className="text-[11px]">
                        {item.tag}
                      </Badge>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <h3 className="font-bold text-lg text-foreground group-hover:text-primary transition-colors">
                      {item.name}
                    </h3>
                    {item.shortDesc ? (
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {item.shortDesc}
                      </p>
                    ) : null}
                  </div>
                </div>

                {/* Tombol spesifikasi hanya bila ada spesifikasinya — dialog
                    yang terbuka kosong adalah tombol yang tidak melakukan apa-apa. */}
                {item.specs.length > 0 ? (
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
                ) : null}
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
