import type { Metadata } from "next";
import { IsiKontak } from "@/components/halaman/IsiKontak";
import { LINGKUP_UMUM } from "@/lib/services/halaman-unit";

export const metadata: Metadata = {
  title: "Kontak & Layanan",
  description:
    "Informasi kontak resmi, lokasi kampus, nomor WhatsApp layanan, dan jam operasional sekolah.",
};

export default function HalamanKontak() {
  return <IsiKontak lingkup={LINGKUP_UMUM} />;
}
