import type { Metadata } from "next";
import { IsiProgram } from "@/components/halaman/IsiProgram";
import { lingkupDariSlug } from "@/lib/server/lingkup-data";

export const metadata: Metadata = { title: "Program" };

export default async function ProgramUnit({
  params,
}: {
  params: Promise<{ unit: string }>;
}) {
  return <IsiProgram lingkup={await lingkupDariSlug((await params).unit)} />;
}
