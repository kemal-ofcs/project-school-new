"use client";

import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { PengajuanWorkspace } from "@/components/kepegawaian/PengajuanWorkspace";
import { PageHeader } from "@/components/ui/PageHeader";
import { canAccessArea } from "@/lib/auth/access";
import { useAuth } from "@/lib/context/AuthContext";

export default function PengajuanPage() {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (!isLoading && isAuthenticated && !canAccessArea(user, "pengajuan")) {
    redirect("/forbidden");
  }

  return (
    <AppShell contentClassName="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6 md:py-8 lg:px-8">
      <PageHeader
        eyebrow="Personil"
        title="Cuti & Izin"
        description="Pengajuan cuti, izin, sakit, dan dinas luar pegawai beserta keputusannya."
      />
      {isAuthenticated ? <PengajuanWorkspace user={user} /> : null}
    </AppShell>
  );
}
