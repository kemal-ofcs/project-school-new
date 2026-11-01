import { ArrowRight, GraduationCap } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { KepalaHalaman } from "@/components/KepalaHalaman";
import { DaftarKosong, StatusTidakTerbaca } from "@/components/StatusData";
import { muatKontenHalaman } from "@/lib/server/content-data";
import { muatPilihanPmb } from "@/lib/server/pmb-data";
import { srcGambarKonten } from "@/lib/services/gambar-konten";
import {
  daftarHalamanUnit,
  halamanKontenUnit,
  KUNCI_UNIT,
} from "@/lib/services/halaman-unit";

export const metadata: Metadata = {
  title: "Semua Unit",
  description: "Daftar seluruh unit pendidikan yang tersedia.",
};

/** Daftar semua unit, dituju tombol Selengkapnya saat unit lebih dari tiga. */
export default async function HalamanSelengkapnya() {
  const pilihan = await muatPilihanPmb();

  if (pilihan.status !== "ok") {
    return (
      <main className="mx-auto max-w-5xl px-6 py-16">
        <StatusTidakTerbaca hasil={pilihan} konteks="Daftar unit" />
      </main>
    );
  }

  const unit = daftarHalamanUnit(pilihan.data.unit);
  // ponytail: satu permintaan per unit; gabung jadi satu query bila unit puluhan.
  const konten = await Promise.all(
    unit.map(async (u) => {
      const hasil = await muatKontenHalaman(halamanKontenUnit(u.idUnit));
      return hasil.status === "ok" ? hasil.data : {};
    }),
  );

  return (
    <main>
      <KepalaHalaman
        judul="Semua Unit"
        label="Unit Pendidikan"
        lebar="max-w-7xl px-4 sm:px-6 lg:px-8"
      />

      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        {unit.length === 0 ? (
          <DaftarKosong pesan="Belum ada unit yang terdaftar." />
        ) : (
          <ul className="kartu-tengah sm:[--kolom:2] lg:[--kolom:3]">
            {unit.map((u, i) => {
              const foto = srcGambarKonten(konten[i]?.[KUNCI_UNIT.foto]);
              const ringkasan =
                konten[i]?.[KUNCI_UNIT.deskripsi] ||
                konten[i]?.[KUNCI_UNIT.tagline];
              return (
                <li key={u.idUnit}>
                  <Link
                    className="group flex h-full flex-col overflow-hidden rounded-3xl border border-border bg-card transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    href={`/${u.slug}`}
                  >
                    <div className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-muted text-primary/40">
                      {foto ? (
                        // biome-ignore lint/performance/noImgElement: foto dari database, dilayani rute ber-cache sendiri
                        <img
                          src={foto}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03] motion-reduce:transition-none"
                        />
                      ) : (
                        <GraduationCap
                          aria-hidden="true"
                          className="h-12 w-12"
                        />
                      )}
                    </div>
                    <div className="flex flex-1 flex-col gap-2 p-6">
                      <h2 className="font-serif text-2xl font-bold text-primary wrap-break-word">
                        {u.nama}
                      </h2>
                      {ringkasan ? (
                        <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                          {ringkasan}
                        </p>
                      ) : null}
                      <span className="mt-auto inline-flex items-center gap-1.5 pt-2 text-sm font-semibold text-primary">
                        Lihat unit
                        <ArrowRight aria-hidden="true" className="h-4 w-4" />
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
