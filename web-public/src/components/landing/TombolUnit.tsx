"use client";

import { ArrowRight, ChevronDown } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  type HalamanUnit,
  MAKS_TOMBOL_UNIT,
} from "@/lib/services/halaman-unit";

const KELAS_TOMBOL =
  "h-auto min-h-12 max-w-full whitespace-normal rounded-full px-6 py-2 text-center";
const KELAS_TERANG = `${KELAS_TOMBOL} bg-white font-semibold text-[#00236f] shadow-lg shadow-black/20 hover:bg-secondary-container hover:text-secondary-container-foreground`;
const KELAS_GARIS = `${KELAS_TOMBOL} border border-white/30 bg-white/10 text-white shadow-none hover:bg-white/20 hover:text-white`;

/**
 * Tombol unit di halaman depan. Unit di atas batas dilipat dan dibuka di tempat
 * lewat Selengkapnya, tanpa halaman tersendiri.
 */
export function TombolUnit({ unit }: { unit: HalamanUnit[] }) {
  const [terbuka, setTerbuka] = React.useState(false);

  // Tanpa unit tidak ada tombol sama sekali, padahal halaman ini pintu masuk.
  if (unit.length === 0) {
    return (
      <Button asChild className={KELAS_TERANG}>
        <Link href="/profil">
          Kenali Sekolah
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </Link>
      </Button>
    );
  }

  const tampil = terbuka ? unit : unit.slice(0, MAKS_TOMBOL_UNIT);

  return (
    <div className="flex w-full flex-wrap gap-3">
      {tampil.map((u) => (
        <Button asChild className={KELAS_TERANG} key={u.idUnit}>
          <Link href={`/${u.slug}`}>{u.nama}</Link>
        </Button>
      ))}
      {unit.length > MAKS_TOMBOL_UNIT ? (
        <Button
          aria-expanded={terbuka}
          className={KELAS_GARIS}
          onClick={() => setTerbuka((nilai) => !nilai)}
          type="button"
        >
          {terbuka ? "Lebih sedikit" : "Selengkapnya"}
          <ChevronDown
            aria-hidden="true"
            className={`h-4 w-4 transition-transform motion-reduce:transition-none ${
              terbuka ? "rotate-180" : ""
            }`}
          />
        </Button>
      ) : null}
    </div>
  );
}
