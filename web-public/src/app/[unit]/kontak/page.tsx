import type { Metadata } from "next";
import { IsiKontak } from "@/components/halaman/IsiKontak";
import { lingkupDariSlug } from "@/lib/server/lingkup-data";

export const metadata: Metadata = { title: "Kontak" };

export default async function KontakUnit({
  params,
}: {
  params: Promise<{ unit: string }>;
}) {
  return <IsiKontak lingkup={await lingkupDariSlug((await params).unit)} />;
}
