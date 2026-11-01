import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { StatusTidakTerbaca } from "@/components/StatusData";
import {
  muatKontenLingkup,
  muatProfilLingkup,
} from "@/lib/server/lingkup-data";
import { muatPilihanPmb } from "@/lib/server/pmb-data";
import { daftarHalamanUnit, lingkupUnit } from "@/lib/services/halaman-unit";
import { profilKosong } from "@/lib/services/school-profile";

type Props = {
  children: React.ReactNode;
  params: Promise<{ unit: string }>;
};

export async function generateMetadata({
  params,
}: Omit<Props, "children">): Promise<Metadata> {
  const { unit: slug } = await params;
  const pilihan = await muatPilihanPmb();
  const unit =
    pilihan.status === "ok"
      ? daftarHalamanUnit(pilihan.data.unit).find((u) => u.slug === slug)
      : null;
  if (!unit) return {};
  const konten = await muatKontenLingkup(lingkupUnit(unit), "profil");
  return {
    title: { default: unit.nama, template: `%s · ${unit.nama}` },
    description: konten["profil.deskripsi_singkat"] || konten["profil.tagline"],
  };
}

/** Kerangka situs satu unit: menu dan footer memakai isi unit itu. */
export default async function LayoutUnit({ children, params }: Props) {
  const { unit: slug } = await params;
  const pilihan = await muatPilihanPmb();

  if (pilihan.status !== "ok") {
    return (
      <>
        <SiteHeader profil={profilKosong()} />
        <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-16">
          <StatusTidakTerbaca hasil={pilihan} konteks="Informasi unit" />
        </main>
        <SiteFooter profil={profilKosong()} />
      </>
    );
  }

  const unit = daftarHalamanUnit(pilihan.data.unit).find(
    (u) => u.slug === slug,
  );
  if (!unit) notFound();

  const lingkup = lingkupUnit(unit);
  const [hasilProfil, kontak, kontenProfil] = await Promise.all([
    muatProfilLingkup(lingkup),
    muatKontenLingkup(lingkup, "kontak"),
    muatKontenLingkup(lingkup, "profil"),
  ]);
  const profil =
    hasilProfil.status === "ok" ? hasilProfil.data : profilKosong();
  const kontenSitus = { ...kontak, ...kontenProfil };

  return (
    <>
      <SiteHeader profil={profil} konten={kontenSitus} lingkup={lingkup} />
      <div className="flex-1">{children}</div>
      <SiteFooter profil={profil} konten={kontenSitus} lingkup={lingkup} />
    </>
  );
}
