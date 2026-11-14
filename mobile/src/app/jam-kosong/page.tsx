"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { JamKosongWorkspace } from "@/components/kepegawaian/JamKosongWorkspace";
import { MobileAppShell } from "@/components/MobileAppShell";
import { canAccessArea } from "@/lib/auth/access";
import { useAuth } from "@/lib/context/AuthContext";
import { useHydrated } from "@/lib/hooks/useHydrated";

export default function MobileJamKosongPage() {
  const isHydrated = useHydrated();
  const { user, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const allowed = canAccessArea(user, "jam_kosong");

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
          <h1 className="text-base font-bold text-white">Jam Kosong</h1>
          <p className="text-xs text-slate-400">
            Jam pelajaran guru yang cuti atau izin, dan siapa yang
            menggantikannya.
          </p>
        </div>
        {isAuthenticated && allowed ? <JamKosongWorkspace /> : null}
      </div>
    </MobileAppShell>
  );
}
