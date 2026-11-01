import type { Metadata } from "next";
import { IsiProfil } from "@/components/halaman/IsiProfil";
import { lingkupDariSlug } from "@/lib/server/lingkup-data";

export const metadata: Metadata = { title: "Profil" };

export default async function ProfilUnit({
  params,
}: {
  params: Promise<{ unit: string }>;
}) {
  return <IsiProfil lingkup={await lingkupDariSlug((await params).unit)} />;
}
