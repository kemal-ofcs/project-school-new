import { ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import { srcGambarKonten } from "@/lib/services/gambar-konten";

/**
 * Foto di puncak kartu Fasilitas, Jurusan, dan Ekstrakurikuler.
 *
 * Bingkai 4:3 dipesan sebelum gambar tiba (latar `muted`), jadi kartu tidak
 * melompat saat foto dimuat (CLS 0). `loading="lazy"` membuat foto di bawah
 * layar pertama baru diunduh saat digulir mendekat. Margin negatif menarik
 * foto ke tepi kartu yang ber-padding `p-6`.
 */
export function FotoKartu({
  id,
  alt,
  ikon,
}: {
  id: string;
  alt: string;
  /**
   * Diisi bila item lain di koleksi yang sama berfoto: item tanpa foto mendapat
   * bingkai yang sama berisi ikonnya, supaya kartu sebaris tetap sejajar.
   */
  ikon?: ReactNode;
}) {
  const src = srcGambarKonten(id);
  if (!src) {
    if (!ikon) return null;
    return (
      <div
        aria-hidden="true"
        className="-mx-6 -mt-6 mb-5 flex aspect-[4/3] items-center justify-center bg-muted text-primary/40"
      >
        {ikon}
      </div>
    );
  }
  return (
    <div className="-mx-6 -mt-6 mb-5 aspect-[4/3] overflow-hidden bg-muted">
      {/* biome-ignore lint/performance/noImgElement: foto dari database, dilayani rute ber-cache sendiri */}
      <img
        src={src}
        alt={alt}
        width={1600}
        height={1200}
        loading="lazy"
        decoding="async"
        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
      />
    </div>
  );
}

/** Tujuan "Lihat foto lainnya": tautan galeri CMS, atau Instagram sekolah. */
export interface TautanGaleriData {
  href: string;
  label: string;
}

export function TautanGaleri({ tautan }: { tautan: TautanGaleriData | null }) {
  if (!tautan) return null;
  return (
    <div className="flex justify-center">
      <a
        href={tautan.href}
        target="_blank"
        rel="noreferrer"
        className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-5 text-sm font-semibold text-primary transition-colors hover:border-primary/40 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {tautan.label}
        <ExternalLink aria-hidden="true" className="h-4 w-4" />
      </a>
    </div>
  );
}
