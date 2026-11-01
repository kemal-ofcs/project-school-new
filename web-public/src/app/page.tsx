import { ArrowRight } from "lucide-react";
import Link from "next/link";
import {
  type FotoSorotan,
  SorotanFoto,
} from "@/components/landing/SorotanFoto";
import { StickyAction } from "@/components/landing/StickyActionMobile";
import { ProfilBelumLengkap } from "@/components/SiteChrome";
import { StatusTidakTerbaca } from "@/components/StatusData";
import { Button } from "@/components/ui/button";
import { KataMuncul } from "@/components/visual/KataMuncul";
import { PmbCountdown } from "@/components/visual/PmbCountdown";
import { muatKontenHalaman } from "@/lib/server/content-data";
import { muatGelombangAktif, muatPilihanPmb } from "@/lib/server/pmb-data";
import { muatProfilSekolah } from "@/lib/server/school-data";
import { srcGambarKonten } from "@/lib/services/gambar-konten";
import {
  daftarHalamanUnit,
  MAKS_TOMBOL_UNIT,
} from "@/lib/services/halaman-unit";
import { fotoSorotan } from "@/lib/services/landing-collections";
import { namaTampil } from "@/lib/services/school-profile";

/** Dinamis seperti `/beranda`: foto dari CMS langsung tampil setelah disimpan. */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function HalamanDepan() {
  const [hasilProfil, hasilPilihan, hasilGelombang, hasilLanding, hasilKonten] =
    await Promise.all([
      muatProfilSekolah(),
      muatPilihanPmb(),
      muatGelombangAktif(),
      muatKontenHalaman("landing"),
      muatKontenHalaman("profil"),
    ]);

  if (hasilProfil.status !== "ok") {
    return (
      <main className="mx-auto max-w-5xl px-6 py-16">
        <StatusTidakTerbaca hasil={hasilProfil} konteks="Informasi sekolah" />
      </main>
    );
  }

  const profil = hasilProfil.data;
  const nama = namaTampil(profil);
  const konten = hasilKonten.status === "ok" ? hasilKonten.data : {};
  const gelombang = hasilGelombang.status === "ok" ? hasilGelombang.data : null;
  const unit =
    hasilPilihan.status === "ok"
      ? daftarHalamanUnit(hasilPilihan.data.unit)
      : [];

  const foto: FotoSorotan[] = fotoSorotan(
    hasilLanding.status === "ok" ? hasilLanding.data : {},
  ).flatMap(({ foto: nilai, judul, keterangan }) => {
    const src = srcGambarKonten(nilai);
    return src ? [{ src, judul, keterangan }] : [];
  });

  const kelasTombol =
    "h-auto min-h-12 max-w-full whitespace-normal rounded-full px-6 py-2 text-center";

  return (
    <main>
      {profil.belumDikonfigurasi || !profil.namaSekolah ? (
        <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
          <ProfilBelumLengkap />
        </div>
      ) : null}

      <SorotanFoto foto={foto} logoUrl={profil.logoUrl} nama={nama}>
        <div className="flex flex-col items-start gap-5">
          {/* Navy tetap: hitung mundurnya berwarna putih dan amber. */}
          {gelombang ? (
            <div className="inline-flex flex-wrap items-center gap-2.5 rounded-2xl bg-[#00236f] px-4 py-1.5 text-xs font-semibold text-white sm:rounded-full">
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-full bg-secondary-container"
              />
              <span>Pendaftaran {gelombang.nama} dibuka</span>
              {gelombang.tanggalTutup ? (
                <PmbCountdown tanggalTutup={gelombang.tanggalTutup} />
              ) : null}
            </div>
          ) : null}

          <div className="w-full space-y-3">
            {profil.namaCabang ? (
              <p className="text-sm font-semibold text-secondary">
                {profil.namaCabang}
              </p>
            ) : null}
            <h1
              data-judul-halaman
              className="font-serif text-4xl font-bold leading-[1.15] tracking-tight text-balance wrap-break-word text-primary xl:text-5xl"
            >
              <KataMuncul teks={nama} langsung />
            </h1>
            {konten["profil.tagline"] ? (
              <p className="text-lg font-semibold text-foreground">
                {konten["profil.tagline"]}
              </p>
            ) : null}
            {konten["profil.deskripsi_singkat"] ? (
              <p className="max-w-xl leading-relaxed text-muted-foreground lg:line-clamp-4">
                {konten["profil.deskripsi_singkat"]}
              </p>
            ) : null}
          </div>

          <div className="flex w-full flex-wrap gap-3">
            {unit.slice(0, MAKS_TOMBOL_UNIT).map((u) => (
              <Button asChild className={kelasTombol} key={u.idUnit}>
                <Link href={`/${u.slug}`}>{u.nama}</Link>
              </Button>
            ))}
            {unit.length > MAKS_TOMBOL_UNIT ? (
              <Button asChild className={kelasTombol} variant="outline">
                <Link href="/selengkapnya">
                  Selengkapnya
                  <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </Link>
              </Button>
            ) : null}
            {/* Tanpa unit tidak ada tombol sama sekali, padahal halaman ini
                adalah pintu masuk situs. */}
            {unit.length === 0 ? (
              <Button asChild className={kelasTombol}>
                <Link href="/beranda">
                  Kenali Sekolah
                  <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </Link>
              </Button>
            ) : null}
          </div>
        </div>
      </SorotanFoto>

      <StickyAction nomorTelepon={profil.telepon} />
    </main>
  );
}
