import { GraduationCap, MessageCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BlokProfil } from "@/components/BlokProfil";
import { StatusTidakTerbaca } from "@/components/StatusData";
import { Button } from "@/components/ui/button";
import { KataMuncul } from "@/components/visual/KataMuncul";
import { muatKontenHalaman } from "@/lib/server/content-data";
import { muatPilihanPmb } from "@/lib/server/pmb-data";
import { muatProfilSekolah } from "@/lib/server/school-data";
import { srcGambarKonten } from "@/lib/services/gambar-konten";
import {
  daftarHalamanUnit,
  halamanKontenUnit,
  KUNCI_UNIT,
} from "@/lib/services/halaman-unit";
import { namaTampil } from "@/lib/services/school-profile";
import { tautanWhatsApp } from "@/lib/teks";
import { jurusanUntukUnit } from "@/lib/validations/pmb";

type Props = { params: Promise<{ unit: string }> };

async function muatUnit(slug: string) {
  const pilihan = await muatPilihanPmb();
  if (pilihan.status !== "ok") return { pilihan, unit: null };
  return {
    pilihan,
    unit: daftarHalamanUnit(pilihan.data.unit).find((u) => u.slug === slug),
  };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { unit } = await muatUnit((await params).unit);
  if (!unit) return {};
  const hasil = await muatKontenHalaman(halamanKontenUnit(unit.idUnit));
  const konten = hasil.status === "ok" ? hasil.data : {};
  return {
    title: unit.nama,
    description: konten[KUNCI_UNIT.deskripsi] || konten[KUNCI_UNIT.tagline],
  };
}

/**
 * Isi yang belum diisi admin tidak ditampilkan dan tidak diganti teks contoh:
 * halaman tetap ada dengan nama unit, jurusan, dan tombol daftar.
 */
export default async function HalamanUnit({ params }: Props) {
  const { pilihan, unit } = await muatUnit((await params).unit);

  if (pilihan.status !== "ok") {
    return (
      <main className="mx-auto max-w-5xl px-6 py-16">
        <StatusTidakTerbaca hasil={pilihan} konteks="Informasi unit" />
      </main>
    );
  }
  if (!unit) notFound();

  const [hasilProfil, hasilKonten] = await Promise.all([
    muatProfilSekolah(),
    muatKontenHalaman(halamanKontenUnit(unit.idUnit)),
  ]);
  const profil = hasilProfil.status === "ok" ? hasilProfil.data : null;
  const konten = hasilKonten.status === "ok" ? hasilKonten.data : {};

  const foto = srcGambarKonten(konten[KUNCI_UNIT.foto]);
  const akreditasi = konten[KUNCI_UNIT.akreditasi];
  const tagline = konten[KUNCI_UNIT.tagline];
  const deskripsi = konten[KUNCI_UNIT.deskripsi];
  const jurusan = jurusanUntukUnit(pilihan.data, unit.nama);
  const whatsapp = tautanWhatsApp(
    konten[KUNCI_UNIT.whatsapp] || profil?.telepon,
    `Halo, saya ingin bertanya tentang ${unit.nama}.`,
  );

  return (
    <main>
      <section className="border-b border-border bg-muted/60">
        <div
          className={`mx-auto grid max-w-7xl items-center gap-8 px-4 py-10 sm:px-6 lg:px-8 lg:py-14 ${
            foto ? "lg:grid-cols-2" : ""
          }`}
        >
          <div className="flex min-w-0 flex-col items-start gap-4">
            {profil ? (
              <p className="text-sm font-semibold text-secondary">
                {namaTampil(profil)}
              </p>
            ) : null}
            <h1
              data-judul-halaman
              className="font-serif text-4xl font-bold leading-[1.15] tracking-tight text-balance wrap-break-word text-primary md:text-5xl"
            >
              <KataMuncul teks={unit.nama} langsung />
            </h1>
            {akreditasi ? (
              <p className="rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-accent">
                {akreditasi}
              </p>
            ) : null}
            {tagline ? (
              <p className="text-lg font-semibold text-foreground">{tagline}</p>
            ) : null}
            {deskripsi ? (
              <p className="max-w-2xl leading-relaxed text-muted-foreground whitespace-pre-line">
                {deskripsi}
              </p>
            ) : null}
            <div className="flex w-full flex-wrap gap-3 pt-2">
              <Button
                asChild
                className="h-auto min-h-12 max-w-full whitespace-normal rounded-full px-6 py-2 text-center"
                variant="secondary"
              >
                <Link href={`/pmb/daftar?unit=${unit.slug}`}>
                  <GraduationCap aria-hidden="true" className="h-5 w-5" />
                  Daftar ke {unit.nama}
                </Link>
              </Button>
              {whatsapp ? (
                <Button
                  asChild
                  className="min-h-12 rounded-full px-6"
                  variant="outline"
                >
                  <a href={whatsapp} rel="noopener noreferrer" target="_blank">
                    <MessageCircle aria-hidden="true" className="h-5 w-5" />
                    WhatsApp
                  </a>
                </Button>
              ) : null}
            </div>
          </div>

          {foto ? (
            <div className="aspect-[4/3] overflow-hidden rounded-[28px] bg-muted shadow-[0_10px_30px_-10px_rgba(0,35,111,0.25)]">
              {/* biome-ignore lint/performance/noImgElement: foto dari database, dilayani rute ber-cache sendiri */}
              <img
                src={foto}
                alt={`Foto ${unit.nama}`}
                fetchPriority="high"
                decoding="async"
                className="h-full w-full object-cover"
              />
            </div>
          ) : null}
        </div>
      </section>

      <div className="mx-auto max-w-4xl space-y-16 px-6 py-12 sm:py-16">
        <BlokProfil
          jabatanPimpinan={
            konten[KUNCI_UNIT.kepalaJabatan] || `Kepala ${unit.nama}`
          }
          misi={konten[KUNCI_UNIT.misi]}
          namaPimpinan={konten[KUNCI_UNIT.kepalaNama]}
          sambutan={konten[KUNCI_UNIT.sambutan]}
          sebutan={unit.nama}
          sejarah={konten[KUNCI_UNIT.sejarah]}
          visi={konten[KUNCI_UNIT.visi]}
        />

        {jurusan.length > 0 ? (
          <section className="muncul">
            <h2 className="font-bold text-2xl text-foreground">
              <KataMuncul teks="Jurusan & Program" />
            </h2>
            <ul className="mt-6 flex flex-wrap gap-3">
              {jurusan.map((nama) => (
                <li
                  className="rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground"
                  key={nama}
                >
                  {nama}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </main>
  );
}
