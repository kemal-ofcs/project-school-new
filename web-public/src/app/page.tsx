import { FacilitiesSection } from "@/components/landing/FacilitiesSection";
import { FaqSection } from "@/components/landing/FaqSection";
import { HeroSection } from "@/components/landing/HeroSection";
import { PillarsSection } from "@/components/landing/PillarsSection";
import { PmbOverviewSection } from "@/components/landing/PmbOverviewSection";
import { ProgramsSection } from "@/components/landing/ProgramsSection";
import { StickyAction } from "@/components/landing/StickyActionMobile";
import { ProfilBelumLengkap } from "@/components/SiteChrome";
import { StatusTidakTerbaca } from "@/components/StatusData";
import { muatKontenHalaman } from "@/lib/server/content-data";
import { muatGelombangAktif } from "@/lib/server/pmb-data";
import { muatProfilSekolah, muatProgramStudi } from "@/lib/server/school-data";
import { namaTampil } from "@/lib/services/school-profile";

export default async function Beranda() {
  // Pemuatan data paralel dari database Turso
  const [hasilProfil, hasilProgram, hasilGelombang, hasilKonten] =
    await Promise.all([
      muatProfilSekolah(),
      muatProgramStudi(),
      muatGelombangAktif(),
      muatKontenHalaman("landing"),
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

  return (
    <main className="flex flex-col w-full">
      {/* Peringatan jika profil administrator belum dilengkapi */}
      {profil.belumDikonfigurasi || !profil.namaSekolah ? (
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-6">
          <ProfilBelumLengkap />
        </div>
      ) : null}

      {/* 1. Hero Section dengan countdown gelombang & quick stats */}
      <HeroSection
        namaSekolah={nama}
        gelombangAktif={gelombangAktif}
        heroTitle={kontenLanding["landing.hero_title"]}
        heroSubtitle={kontenLanding["landing.hero_subtitle"]}
      />

      {/* 2. 4 Pilar Keunggulan & Sambutan Pimpinan */}
      <PillarsSection profil={profil} />

      {/* 3. Program Keahlian / Jurusan (Dari DB) & Ekstrakurikuler */}
      <ProgramsSection programStudi={programStudi} />

      {/* 4. Fasilitas Kampus Unggulan dengan Modal Preview */}
      <FacilitiesSection />

      {/* 5. Alur PMB 4 Tahapan & Rincian Gelombang Aktif */}
      <PmbOverviewSection gelombangAktif={gelombangAktif} />

      {/* 6. FAQ Accordion Interaktif */}
      <FaqSection />

      {/* 7. Floating WhatsApp Desktop & Sticky Action Bar Mobile */}
      <StickyAction nomorTelepon={profil.telepon} />
    </main>
  );
}
