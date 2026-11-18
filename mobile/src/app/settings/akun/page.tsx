"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { GantiPasswordForm } from "@/components/GantiPasswordForm";
import { LicenseCard } from "@/components/license/LicenseCard";
import { MobileAppShell } from "@/components/MobileAppShell";
import { PasswordRecoveryCard } from "@/components/PasswordRecoveryCard";
import { ThemeSettingsCard } from "@/components/ThemeSettingsCard";
import { TwoFactorCard } from "@/components/TwoFactorCard";
import { BackHeader } from "@/components/ui/HubRow";
import { useAuth } from "@/lib/context/AuthContext";

export default function AkunKeamananPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [authLoading, isAuthenticated, router]);

  return (
    <MobileAppShell>
      <div className="flex flex-col gap-4">
        <BackHeader
          href="/settings"
          label="Pengaturan"
          title="Akun & Keamanan Pribadi"
        />

        {/* Tidak dijaga izin apa pun: setiap operator berhak mengamankan
            akunnya sendiri, termasuk role paling terbatas. */}
        <ThemeSettingsCard />
        <section className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
          <h2 className="mb-3 text-sm font-bold text-white">Ganti Password</h2>
          <GantiPasswordForm />
        </section>
        <TwoFactorCard />
        <PasswordRecoveryCard />
        <LicenseCard />
      </div>
    </MobileAppShell>
  );
}
