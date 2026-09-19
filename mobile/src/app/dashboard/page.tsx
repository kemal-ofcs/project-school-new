"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { DashboardInsights } from "@/components/dashboard/DashboardInsights";
import { MobileAppShell } from "@/components/MobileAppShell";
import { HubGroupLabel, HubRow } from "@/components/ui/HubRow";
import { Icon } from "@/components/ui/Icon";
import { StatusBadgePill } from "@/components/ui/StatusBadgePill";
import { StatusHeroCard } from "@/components/ui/StatusHeroCard";
import { canAccessArea, hasPermission } from "@/lib/auth/access";
import { useAuth } from "@/lib/context/AuthContext";
import {
  type DashboardMetrics,
  getDashboardMetrics,
  getRiwayatScan,
} from "@/lib/gateways/report";

export default function DashboardPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const canViewMetrics = hasPermission(user, "dashboard.view");
  const canViewHome = canAccessArea(user, "home");
  const canViewScanner = canAccessArea(user, "scanner");
  const canViewHistory = canAccessArea(user, "history");
  const canViewKaryawan = canAccessArea(user, "karyawan");
  const canPresensiKelas = canAccessArea(user, "presensi_kelas");
  const canAudit = canAccessArea(user, "audit");
  const canJurnalMengajar = canAccessArea(user, "jurnal_mengajar");
  const canLegerKehadiran = canAccessArea(user, "leger_kehadiran");
  const canPayroll = canAccessArea(user, "payroll");
  const hasAnyHubItem =
    canPresensiKelas ||
    canAudit ||
    canJurnalMengajar ||
    canLegerKehadiran ||
    canPayroll;

  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [recentScans, setRecentScans] = useState<Record<string, unknown>[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [authLoading, isAuthenticated, router]);

  const loadData = useCallback(async () => {
    try {
      const [metricData, scansData] = await Promise.all([
        canViewMetrics ? getDashboardMetrics() : Promise.resolve(null),
        canViewHome
          ? getRiwayatScan({ limit: 5 })
          : Promise.resolve([] as Record<string, unknown>[]),
      ]);
      setMetrics(metricData);
      setRecentScans(scansData || []);
      setLoadError(null);
    } catch (err) {
      setLoadError(
        err instanceof Error
          ? err.message
          : "Data dasbor gagal dimuat. Tarik ke bawah untuk mencoba lagi.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [canViewMetrics, canViewHome]);

  useEffect(() => {
    if (isAuthenticated) {
      void loadData();
    }
  }, [isAuthenticated, loadData]);

  return (
    <MobileAppShell>
      <div className="flex flex-col gap-4 pb-20">
        {loadError ? (
          <div className="rounded-2xl border border-rose-400/30 bg-rose-400/10 p-3 text-xs text-rose-200">
            {loadError}
          </div>
        ) : null}

        {/* 1. Hero Balance Card ala m-BCA */}
        {canViewMetrics ? (
          <StatusHeroCard
            hadir={metrics?.hadirHariIni ?? 0}
            total={metrics?.totalKaryawan ?? 0}
            terlambat={metrics?.terlambatHariIni ?? 0}
            persentase={metrics?.persentaseKehadiran ?? 0}
            isLoading={isLoading}
            onRefresh={loadData}
          />
        ) : null}

        {/* 2. Modul harian: lima tujuan yang dipakai tiap hari, bukan seluruh
            fitur aplikasi. Cetak ID Card sengaja tidak di sini — rumahnya
            Karyawan & PD, karena itu aksi personil, bukan pintasan harian. */}
        {hasAnyHubItem ? (
          <section aria-labelledby="judul-modul-harian">
            <HubGroupLabel>Modul Harian</HubGroupLabel>
            <div id="judul-modul-harian" className="flex flex-col gap-2">
              {canPresensiKelas && (
                <HubRow
                  href="/presensi-kelas"
                  icon="check"
                  title="Presensi Mapel & Anomali"
                  subtitle="Jurnal kelas, rekonsiliasi & deteksi bolos"
                  tone="teal"
                />
              )}
              {canAudit && (
                <HubRow
                  href="/audit-absensi"
                  icon="alert"
                  title="Live Audit Presensi"
                  subtitle="Belum absen, sesi menggantung & perlu verifikasi"
                  tone="amber"
                />
              )}
              {canJurnalMengajar && (
                <HubRow
                  href="/jurnal-mengajar"
                  icon="document"
                  title="Jurnal Mengajar"
                  subtitle="Catatan materi, kendala KBM & paraf guru"
                  tone="sky"
                />
              )}
              {canLegerKehadiran && (
                <HubRow
                  href="/leger-kehadiran"
                  icon="calendar"
                  title="Leger Kehadiran"
                  subtitle="Rekapitulasi semester & pembekuan rapor"
                  tone="indigo"
                />
              )}
              {canPayroll && (
                <HubRow
                  href="/payroll"
                  icon="document"
                  title="Penggajian & Slip Gaji"
                  subtitle="Kalkulasi upah harian & arsip pembayaran"
                  tone="emerald"
                />
              )}
            </div>
          </section>
        ) : null}

        {/* Akses Cepat Area Berizin */}
        {(canViewScanner || canViewHistory || canViewKaryawan) && (
          <div className="flex flex-wrap items-center gap-2 px-0.5">
            {canViewScanner && (
              <Link
                href="/scanner"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600/15 text-sky-300 border border-blue-500/20 text-xs font-bold"
              >
                <Icon name="scanner" className="size-3.5" />
                <span>Pindai QR</span>
              </Link>
            )}
            {canViewHistory && (
              <Link
                href="/history"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/80 text-slate-300 border border-slate-700 text-xs font-bold"
              >
                <Icon name="clock" className="size-3.5" />
                <span>Riwayat</span>
              </Link>
            )}
            {canViewKaryawan && (
              <Link
                href="/karyawan"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/80 text-slate-300 border border-slate-700 text-xs font-bold"
              >
                <Icon name="users" className="size-3.5" />
                <span>Karyawan</span>
              </Link>
            )}
          </div>
        )}

        {/* 3. Smart Insights */}
        {canViewMetrics && <DashboardInsights />}

        {/* 4. Riwayat Scan Terkini */}
        {canViewHome && (
          <section className="rounded-2xl border border-white/10 bg-slate-900/80 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="size-6 rounded-lg bg-blue-500/20 text-sky-400 flex items-center justify-center">
                  <Icon name="clock" className="size-3.5" />
                </div>
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  Scan Terakhir Hari Ini
                </h3>
              </div>
              <Link
                href="/history"
                className="text-xs font-bold text-sky-400 hover:underline inline-flex items-center gap-1"
              >
                <span>Semua</span>
                <Icon name="arrow-right" className="size-3" />
              </Link>
            </div>

            {recentScans.length === 0 ? (
              <div className="py-4 text-center text-xs text-slate-500">
                Belum ada aktivitas presensi hari ini.
              </div>
            ) : (
              <div className="divide-y divide-slate-800/80">
                {recentScans.map((scan, idx) => (
                  <div
                    key={String(scan.id_karyawan || idx)}
                    className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="size-7 rounded-full bg-slate-800 flex items-center justify-center font-bold text-[10px] text-slate-300 shrink-0">
                        {String(scan.nama_karyawan || "S")
                          .slice(0, 2)
                          .toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-white truncate">
                          {String(scan.nama_karyawan || "Personil")}
                        </p>
                        <p className="text-[10px] text-slate-400 truncate">
                          {String(scan.divisi || "Umum")}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[11px] font-mono-data text-slate-400">
                        {String(scan.waktu_scan || scan.jam || "--:--")}
                      </span>
                      <StatusBadgePill
                        status={String(scan.status_kehadiran || "Hadir")}
                        showIcon={false}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </MobileAppShell>
  );
}
