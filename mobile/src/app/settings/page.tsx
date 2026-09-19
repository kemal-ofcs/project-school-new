"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { MobileAppShell } from "@/components/MobileAppShell";
import { HubRow } from "@/components/ui/HubRow";
import { Icon } from "@/components/ui/Icon";
import { canAccessArea, hasPermission } from "@/lib/auth/access";
import { triggerHaptic } from "@/lib/client/haptics";
import { useAuth } from "@/lib/context/AuthContext";
import { useConfirmDialog } from "@/lib/hooks/useConfirmDialog";
import { useOnlineStatus } from "@/lib/hooks/useOnlineStatus";

export default function SettingsPage() {
  const { konfirmasi, dialogKonfirmasi } = useConfirmDialog();
  const { user, isAuthenticated, isLoading: authLoading, logout } = useAuth();
  const router = useRouter();
  const isOnline = useOnlineStatus();

  const canStrukturJadwal =
    canAccessArea(user, "akademik") ||
    canAccessArea(user, "shift") ||
    canAccessArea(user, "holidays") ||
    hasPermission(user, "settings.manage");
  const canKeamananAbsensi =
    Boolean(user?.isSuperadmin) || hasPermission(user, "branding.manage");
  const canSistemInfrastruktur =
    hasPermission(user, "settings.manage") ||
    hasPermission(user, "alfa.trigger") ||
    canAccessArea(user, "sync") ||
    Boolean(user?.isSuperadmin);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [authLoading, isAuthenticated, router]);

  const handleLogout = async () => {
    triggerHaptic("warning");
    if (
      await konfirmasi({
        title: "Keluar dari akun ini?",
        description:
          "Sesi di perangkat ini diakhiri dan Anda perlu masuk kembali dengan kata sandi.",
        preserved:
          "Data yang sudah tersimpan dan antrean sinkronisasi tidak hilang.",
        confirmLabel: "Ya, keluar",
      })
    ) {
      await logout();
      router.replace("/login");
    }
  };

  if (!user) return null;

  return (
    <MobileAppShell>
      <div className="flex flex-col gap-4">
        {/* Operator Profile Card */}
        <div className="rounded-3xl border border-white/15 bg-gradient-to-br from-slate-900 via-slate-900/90 to-sky-950/40 p-5 shadow-xl backdrop-blur-xl">
          <div className="flex items-center gap-3.5 mb-4">
            <div className="grid size-14 place-items-center rounded-2xl bg-gradient-to-tr from-sky-400 to-blue-600 font-black text-xl text-slate-950 shadow-lg">
              {user.nama_operator?.charAt(0)?.toUpperCase() || "O"}
            </div>
            <div className="flex flex-col min-w-0">
              <h2 className="text-base font-black text-white truncate">
                {user.nama_operator}
              </h2>
              <span className="text-xs font-semibold text-sky-300">
                {user.role} • {user.kode_operator}
              </span>
              <span className="text-[11px] text-slate-400 mt-0.5">
                Username: @{user.username}
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-3 text-xs text-slate-300 space-y-1.5">
            <div className="flex justify-between">
              <span className="text-slate-500">Status Server:</span>
              <span
                className={isOnline ? "text-emerald-400" : "text-amber-400"}
              >
                {isOnline ? "Terhubung Online" : "Mode Offline"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Revisi Izin:</span>
              <span className="font-semibold text-white">
                v{user.permissionRevision}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <HubRow
            href="/settings/akun"
            icon="lock"
            title="Akun & Keamanan Pribadi"
            subtitle="Tema tampilan, verifikasi 2 langkah, kode pemulihan"
            tone="emerald"
          />
          {canStrukturJadwal && (
            <HubRow
              href="/settings/struktur-jadwal"
              icon="calendar"
              title="Struktur & Jadwal Sekolah"
              subtitle="Struktur akademik, jam pelajaran, shift, hari libur"
              tone="teal"
            />
          )}
          {canKeamananAbsensi && (
            <HubRow
              href="/settings/keamanan-absensi"
              icon="scanner"
              title="Keamanan Absensi"
              subtitle="Foto bukti, batasan IP, geofencing & keamanan pemindai"
              tone="amber"
            />
          )}
          {canSistemInfrastruktur && (
            <HubRow
              href="/settings/sistem"
              icon="database"
              title="Sistem & Infrastruktur"
              subtitle="Profil instansi, email, auto alfa, database & sinkronisasi"
              tone="cyan"
            />
          )}
        </div>

        {/* Hardware & App Information */}
        <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-4 backdrop-blur-md">
          <h3 className="text-sm font-bold text-white mb-2">
            Informasi Native
          </h3>
          <div className="rounded-2xl border border-white/5 bg-slate-950/60 p-3 text-xs text-slate-400 space-y-1.5">
            <div className="flex justify-between">
              <span>Runtime Core:</span>
              <span className="font-semibold text-sky-300">
                Tauri v2 Mobile
              </span>
            </div>
            <div className="flex justify-between">
              <span>Local Storage:</span>
              <span className="font-semibold text-white">
                Private SQLite rusqlite (WAL)
              </span>
            </div>
            <div className="flex justify-between">
              <span>Cloud Engine:</span>
              <span className="font-semibold text-white">
                Turso LibSQL Sync
              </span>
            </div>
            <div className="flex justify-between">
              <span>Haptic Feedback:</span>
              <span className="text-emerald-400">Aktif (Native Vibration)</span>
            </div>
          </div>
        </div>

        {/* Logout Button */}
        <button
          type="button"
          onClick={handleLogout}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-rose-500/20 border border-rose-500/40 text-sm font-black text-rose-300 active:scale-[0.98] transition hover:bg-rose-500/30"
        >
          <Icon name="logout" className="size-4" />
          <span>Keluar dari Akun</span>
        </button>
      </div>

      {dialogKonfirmasi}
    </MobileAppShell>
  );
}
