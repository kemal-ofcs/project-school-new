import { FacilitiesSection } from "@/components/landing/FacilitiesSection";
import { FaqSection } from "@/components/landing/FaqSection";
import { HeroSection } from "@/components/landing/HeroSection";
import { KegiatanSlider } from "@/components/landing/KegiatanSlider";
import { PmbOverviewSection } from "@/components/landing/PmbOverviewSection";
import { ProgramsSection } from "@/components/landing/ProgramsSection";
import { SambutanVisiSection } from "@/components/landing/SambutanVisiSection";
import { StickyAction } from "@/components/landing/StickyActionMobile";
import { StatusTidakTerbaca } from "@/components/StatusData";
import {
  lingkupDariSlug,
  muatKontenLingkup,
  muatProfilLingkup,
} from "@/lib/server/lingkup-data";
import { muatGelombangAktif, muatPilihanPmb } from "@/lib/server/pmb-data";
import { muatProgramStudi } from "@/lib/server/school-data";
import { tautanGaleri } from "@/lib/services/gambar-konten";
import { hrefDaftarLingkup } from "@/lib/services/halaman-unit";
import { jurusanUntukUnit } from "@/lib/validations/pmb";

/**
 * Beranda satu unit, dinamis agar perubahan konten dan foto latar yang diunggah
 * dari CMS admin langsung tampil seketika tanpa tertahan cache.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function BerandaUnit({
  params,
}: {
  params: Promise<{ unit: string }>;
}) {
  const lingkup = await lingkupDariSlug((await params).unit);
  const [hasilProfil, hasilProgram, hasilPilihan, hasilGelombang] =
    await Promise.all([
      muatProfilLingkup(lingkup),
      muatProgramStudi(),
      muatPilihanPmb(),
      muatGelombangAktif(),
    ]);
  const [konten, kontak, kontenProfil] = await Promise.all([
    muatKontenLingkup(lingkup, "landing"),
    muatKontenLingkup(lingkup, "kontak"),
    muatKontenLingkup(lingkup, "profil"),
  ]);

  if (hasilProfil.status !== "ok") {
    return (
      <main className="mx-auto max-w-5xl px-6 py-16">
        <StatusTidakTerbaca hasil={hasilProfil} konteks="Informasi unit" />
      </main>
    );
  }

  const profil = hasilProfil.data;
  const nama = lingkup.unit?.nama ?? "";
  // `akademik_jurusan` tanpa unit berlaku di semua unit; aturannya sama dengan
  // pilihan program di formulir PMB.
  const jurusanUnit = new Set(
    hasilPilihan.status === "ok"
      ? jurusanUntukUnit(hasilPilihan.data, nama)
      : [],
  );
  const programStudi =
    hasilProgram.status === "ok"
      ? hasilProgram.data.filter((prodi) => jurusanUnit.has(prodi.nama))
      : [];
  const gelombangAktif =
    hasilGelombang.status === "ok" ? hasilGelombang.data : null;
  const galeri = tautanGaleri(kontak);
  const hrefDaftar = hrefDaftarLingkup(lingkup);
  const nomorWhatsApp = kontak["kontak.whatsapp"] || profil.telepon;

  return (
    <main className="flex flex-col w-full">
      <HeroSection
        namaSekolah={nama}
        gelombangAktif={gelombangAktif}
        konten={konten}
        hrefDaftar={hrefDaftar}
        hrefProgram={`${lingkup.prefiks}/program`}
      />
      <KegiatanSlider konten={konten} galeri={galeri} />
      <SambutanVisiSection
        profil={profil}
        konten={konten}
        kontenProfil={kontenProfil}
      />
      <FacilitiesSection konten={konten} galeri={galeri} />
      <ProgramsSection
        programStudi={programStudi}
        konten={konten}
        galeri={galeri}
        hrefDaftar={hrefDaftar}
      />
      <PmbOverviewSection
        gelombangAktif={gelombangAktif}
        konten={konten}
        nomorTelepon={nomorWhatsApp}
        hrefDaftar={hrefDaftar}
        hrefKontak={`${lingkup.prefiks}/kontak`}
      />
      <FaqSection konten={konten} />
      <StickyAction nomorTelepon={nomorWhatsApp} hrefDaftar={hrefDaftar} />
    </main>
  );
}
