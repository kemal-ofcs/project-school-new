import type { Metadata } from "next";
import { IsiProfil } from "@/components/halaman/IsiProfil";
import { LINGKUP_UMUM } from "@/lib/services/halaman-unit";

export const metadata: Metadata = {
  title: "Profil Sekolah",
  description:
    "Profil lengkap, visi, misi, sejarah, serta sambutan pimpinan sekolah.",
};

export default function HalamanProfil() {
  return <IsiProfil lingkup={LINGKUP_UMUM} />;
}
