"use client";

import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { RapelWorkspace } from "@/components/payroll/RapelWorkspace";
import { PageHeader } from "@/components/ui/PageHeader";
import { canAccessArea } from "@/lib/auth/access";
import { useAuth } from "@/lib/context/AuthContext";

export default function RapelPage() {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (!isLoading && isAuthenticated && !canAccessArea(user, "payroll")) {
    redirect("/forbidden");
  }

  return (
    <AppShell contentClassName="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6 md:py-8 lg:px-8">
      <div className="space-y-6">
        <PageHeader
          eyebrow="Penggajian"
          title="Rapel Gaji"
          description="Selisih gaji bulan yang sudah dibayar ketika tarif per jam dinaikkan dengan tanggal berlaku mundur."
        />
        {isAuthenticated ? <RapelWorkspace /> : null}
      </div>
    </AppShell>
  );
}
