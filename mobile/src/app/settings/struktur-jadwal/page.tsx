"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { MobileAppShell } from "@/components/MobileAppShell";
import { JamPelajaranCard } from "@/components/settings/JamPelajaranCard";
import { BackHeader, HubRow } from "@/components/ui/HubRow";
import { canAccessArea, hasPermission } from "@/lib/auth/access";
import { useAuth } from "@/lib/context/AuthContext";

export default function StrukturJadwalPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const canAkademik = canAccessArea(user, "akademik");
  const canShift = canAccessArea(user, "shift");
  const canHolidays = canAccessArea(user, "holidays");
  const canManageCompanyProfile = hasPermission(user, "settings.manage");
  const bolehBukaHalaman =
    canAkademik || canShift || canHolidays || canManageCompanyProfile;

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/login");
      return;
    }
    if (!authLoading && isAuthenticated && !bolehBukaHalaman) {
      router.replace("/settings");
    }
  }, [authLoading, isAuthenticated, bolehBukaHalaman, router]);

  return (
    <MobileAppShell>
      <div className="flex flex-col gap-4">
        <BackHeader
          href="/settings"
          label="Pengaturan"
          title="Struktur & Jadwal Sekolah"
        />

        {/* Jam pelajaran: batas sesi presensi & lama satu JP. */}
        {canManageCompanyProfile ? <JamPelajaranCard /> : null}

        <div className="flex flex-col gap-2">
          {canAkademik && (
            <HubRow
              href="/akademik"
              icon="calendar"
              title="Struktur Akademik"
              subtitle="Tahun ajaran, rombel, mapel & jurusan"
              tone="amber"
            />
          )}
          {canShift && (
            <HubRow
              href="/shift"
              icon="clock"
              title="Shift Kerja & Jadwal"
              subtitle="Jam masuk, jam pulang, toleransi & istirahat"
              tone="sky"
            />
          )}
          {canHolidays && (
            <HubRow
              href="/holidays"
              icon="calendar"
              title="Hari Libur & Whitelist"
              subtitle="Kalender libur & Shift/Divisi yang tetap boleh scan"
              tone="teal"
            />
          )}
        </div>
      </div>
    </MobileAppShell>
  );
}
