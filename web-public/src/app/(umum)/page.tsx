import {
  type FotoSorotan,
  SorotanFoto,
} from "@/components/landing/SorotanFoto";
import { StickyAction } from "@/components/landing/StickyActionMobile";
import { TombolUnit } from "@/components/landing/TombolUnit";
import { ProfilBelumLengkap } from "@/components/SiteChrome";
import { StatusTidakTerbaca } from "@/components/StatusData";
import { KataMuncul } from "@/components/visual/KataMuncul";
import { PmbCountdown } from "@/components/visual/PmbCountdown";
import { muatKontenHalaman } from "@/lib/server/content-data";
import { muatGelombangAktif, muatPilihanPmb } from "@/lib/server/pmb-data";
import { muatProfilSekolah } from "@/lib/server/school-data";
import { srcGambarKonten } from "@/lib/services/gambar-konten";
import { daftarHalamanUnit } from "@/lib/services/halaman-unit";
import { fotoSorotan } from "@/lib/services/landing-collections";
import { namaTampil } from "@/lib/services/school-profile";

/** Dinamis: foto dari CMS langsung tampil setelah disimpan. */
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

  return (
    <main>
      <SorotanFoto foto={foto} logoUrl={profil.logoUrl} nama={nama}>
        <div className="masuk-bertahap flex flex-col items-start gap-4 text-white">
          {profil.belumDikonfigurasi || !profil.namaSekolah ? (
            <ProfilBelumLengkap />
          ) : null}

          {gelombang ? (
            <div className="inline-flex flex-wrap items-center gap-2.5 rounded-2xl border border-white/15 bg-white/10 px-4 py-1.5 text-xs font-semibold sm:rounded-full">
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
              <p className="flex items-center gap-3 text-sm font-semibold text-secondary-container">
                <span
                  aria-hidden="true"
                  className="h-px w-8 bg-secondary-container"
                />
                {profil.namaCabang}
              </p>
            ) : null}
            <h1
              data-judul-halaman
              className="font-serif text-4xl font-bold leading-[1.1] tracking-tight text-balance wrap-break-word xl:text-[3.25rem]"
            >
              <KataMuncul teks={nama} langsung />
            </h1>
          </div>

          {konten["profil.tagline"] ? (
            <p className="text-lg font-semibold text-white">
              {konten["profil.tagline"]}
            </p>
          ) : null}
          {konten["profil.deskripsi_singkat"] ? (
            <p className="max-w-xl leading-relaxed text-white/75 lg:line-clamp-4">
              {konten["profil.deskripsi_singkat"]}
            </p>
          ) : null}

          <TombolUnit unit={unit} />
        </div>
      </SorotanFoto>

      <StickyAction nomorTelepon={profil.telepon} />
    </main>
  );
}
