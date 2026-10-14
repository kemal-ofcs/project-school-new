import type { ReactNode } from "react";
import { KataMuncul } from "@/components/visual/KataMuncul";
import { cn } from "@/lib/utils";

/**
 * Kepala halaman dalam (Profil, Kontak, Program, Berita).
 *
 * Pita berlatar lembut memisahkan judul dari isi, sehingga halaman tidak
 * dimulai dari teks yang menempel di latar polos. Garis amber pendek di bawah
 * judul adalah satu-satunya aksen amber di sini: warna yang sama dengan tombol
 * "Daftar PMB", jadi setiap halaman dalam terasa satu keluarga dengan header.
 */
export function KepalaHalaman({
  label,
  judul,
  children,
  lebar = "max-w-4xl",
}: {
  label: string;
  judul: string;
  children?: ReactNode;
  /** Kelas lebar (dan bila perlu jarak tepi) agar sejajar dengan isi halaman. */
  lebar?: string;
}) {
  return (
    <div className="border-b border-border bg-muted/60">
      <div className={cn("mx-auto px-6 py-12 sm:py-16", lebar)}>
        <p className="text-sm font-semibold text-primary">{label}</p>
        <h1
          data-judul-halaman
          className="mt-2 font-extrabold text-3xl sm:text-4xl tracking-tight text-foreground"
        >
          <KataMuncul teks={judul} langsung />
        </h1>
        <div
          aria-hidden="true"
          className="mt-4 h-1 w-12 rounded-full bg-secondary-container"
        />
        {children ? (
          <div className="mt-4 max-w-2xl text-sm sm:text-base leading-relaxed text-muted-foreground">
            {children}
          </div>
        ) : null}
      </div>
    </div>
  );
}
