"use client";

import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { TagihanWorkspace } from "@/components/keuangan/TagihanWorkspace";
import { PageHeader } from "@/components/ui/PageHeader";
import { canAccessArea } from "@/lib/auth/access";
import { useAuth } from "@/lib/context/AuthContext";

export default function TagihanPage() {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (!isLoading && isAuthenticated && !canAccessArea(user, "tagihan")) {
    redirect("/forbidden");
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          eyebrow="KEUANGAN"
          title="Tagihan Siswa"
          description="SPP dan tagihan lain per siswa. Nominal dibekukan saat terbit, keringanan dihitung otomatis, dan setiap tagihan tercatat sebagai piutang di pembukuan."
        />
        {isAuthenticated ? <TagihanWorkspace /> : null}
      </div>
    </AppShell>
  );
}
