"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { KeuanganWorkspace } from "@/components/keuangan/KeuanganWorkspace";
import { MobileAppShell } from "@/components/MobileAppShell";
import { canAccessArea } from "@/lib/auth/access";
import { useAuth } from "@/lib/context/AuthContext";
import { useHydrated } from "@/lib/hooks/useHydrated";

export default function MobileKeuanganPage() {
  const isHydrated = useHydrated();
  const { user, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const allowed = canAccessArea(user, "keuangan");

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
          <h1 className="text-base font-bold text-white">Pembukuan</h1>
          <p className="text-xs text-slate-400">
            Jurnal, buku besar, dan neraca saldo. Bisa dicatat tanpa jaringan.
          </p>
        </div>
        {isAuthenticated && allowed ? <KeuanganWorkspace /> : null}
      </div>
    </MobileAppShell>
  );
}
