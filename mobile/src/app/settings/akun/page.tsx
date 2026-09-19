"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
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
        <TwoFactorCard />
        <PasswordRecoveryCard />
      </div>
    </MobileAppShell>
  );
}
