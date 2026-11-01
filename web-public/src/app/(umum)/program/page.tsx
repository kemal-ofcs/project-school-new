import type { Metadata } from "next";
import { IsiProgram } from "@/components/halaman/IsiProgram";
import { LINGKUP_UMUM } from "@/lib/services/halaman-unit";

export const metadata: Metadata = {
  title: "Program Sekolah",
  description:
    "Program, fasilitas, dan kegiatan ekstrakurikuler yang tersedia di sekolah.",
};

export default function HalamanProgram() {
  return <IsiProgram lingkup={LINGKUP_UMUM} />;
}
