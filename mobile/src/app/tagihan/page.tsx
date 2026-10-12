"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { TagihanWorkspace } from "@/components/keuangan/TagihanWorkspace";
import { MobileAppShell } from "@/components/MobileAppShell";
import { canAccessArea } from "@/lib/auth/access";
import { useAuth } from "@/lib/context/AuthContext";
import { useHydrated } from "@/lib/hooks/useHydrated";

export default function MobileTagihanPage() {
  const isHydrated = useHydrated();
  const { user, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const allowed = canAccessArea(user, "tagihan");

  // Static export Mobile tidak punya rute /forbidden.
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
    }
    if (isHydrated && isAuthenticated && !allowed) {
      router.replace("/dashboard");
    }
  }, [isLoading, isAuthenticated, isHydrated, allowed, router]);

  return (
    <MobileAppShell>
      <div className="space-y-4 pb-16">
        <div>
          <h1 className="text-base font-bold text-white">Tagihan Siswa</h1>
          <p className="text-xs text-slate-400">
            SPP dan tagihan lain per siswa. Bisa diterbitkan tanpa jaringan.
          </p>
        </div>
        {isAuthenticated && allowed ? <TagihanWorkspace /> : null}
      </div>
    </MobileAppShell>
  );
}
