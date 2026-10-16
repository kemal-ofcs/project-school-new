import { FacilitiesSection } from "@/components/landing/FacilitiesSection";
import { FaqSection } from "@/components/landing/FaqSection";
import { HeroSection } from "@/components/landing/HeroSection";
import { KegiatanSlider } from "@/components/landing/KegiatanSlider";
import { PmbOverviewSection } from "@/components/landing/PmbOverviewSection";
import { ProgramsSection } from "@/components/landing/ProgramsSection";
import { SambutanVisiSection } from "@/components/landing/SambutanVisiSection";
import { StickyAction } from "@/components/landing/StickyActionMobile";
import { ProfilBelumLengkap } from "@/components/SiteChrome";
import { StatusTidakTerbaca } from "@/components/StatusData";
import { muatKontenHalaman } from "@/lib/server/content-data";
import { muatGelombangAktif } from "@/lib/server/pmb-data";
import { muatProfilSekolah, muatProgramStudi } from "@/lib/server/school-data";
import { tautanGaleri } from "@/lib/services/gambar-konten";
import { namaTampil } from "@/lib/services/school-profile";

/**
 * Halaman utama beranda selalu dinamis agar perubahan konten dan foto latar
 * yang diunggah dari CMS admin langsung tampil seketika tanpa tertahan cache.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Beranda() {
  // Pemuatan data paralel dari database Turso
  // `kontak` dan `profil` sudah dimuat layout untuk header dan footer;
  // `cache()` membuat panggilan ini tidak menambah perjalanan ke database.
  const [
    hasilProfil,
    hasilProgram,
    hasilGelombang,
    hasilKonten,
    hasilKontak,
    hasilKontenProfil,
  ] = await Promise.all([
    muatProfilSekolah(),
    muatProgramStudi(),
    muatGelombangAktif(),
    muatKontenHalaman("landing"),
    muatKontenHalaman("kontak"),
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
  const programStudi = hasilProgram.status === "ok" ? hasilProgram.data : [];
  const gelombangAktif =
    hasilGelombang.status === "ok" ? hasilGelombang.data : null;
  const kontenLanding = hasilKonten.status === "ok" ? hasilKonten.data : {};
  const kontenProfil =
    hasilKontenProfil.status === "ok" ? hasilKontenProfil.data : {};
  const galeri = tautanGaleri(
    hasilKontak.status === "ok" ? hasilKontak.data : {},
  );

  return (
    <main className="flex flex-col w-full">
      {/* Peringatan jika profil administrator belum dilengkapi */}
      {profil.belumDikonfigurasi || !profil.namaSekolah ? (
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-6">
          <ProfilBelumLengkap />
        </div>
      ) : null}

      {/* 1. Hero dua kolom: ajakan mendaftar dan foto sekolah */}
      <HeroSection
        namaSekolah={nama}
        gelombangAktif={gelombangAktif}
        konten={kontenLanding}
      />

      {/* 2. Program & kegiatan unggulan, slider yang bisa digeser */}
      <KegiatanSlider konten={kontenLanding} galeri={galeri} />

      {/* 3. Sambutan pimpinan, visi, dan misi */}
      <SambutanVisiSection
        profil={profil}
        konten={kontenLanding}
        kontenProfil={kontenProfil}
      />

      {/* 4. Fasilitas dalam grid bento dengan detail di modal */}
      <FacilitiesSection konten={kontenLanding} galeri={galeri} />

      {/* 5. Jurusan (dari database, bila ada) dan ekstrakurikuler */}
      <ProgramsSection
        programStudi={programStudi}
        konten={kontenLanding}
        galeri={galeri}
      />

      {/* 6. Gelombang aktif, alur pendaftaran, dan banner penutup */}
      <PmbOverviewSection
        gelombangAktif={gelombangAktif}
        konten={kontenLanding}
        nomorTelepon={profil.telepon}
      />

      {/* 7. FAQ Accordion Interaktif */}
      <FaqSection konten={kontenLanding} />

      {/* 8. Floating WhatsApp Desktop & Sticky Action Bar Mobile */}
      <StickyAction nomorTelepon={profil.telepon} />
    </main>
  );
}
