"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { requestSyncNow } from "@/lib/gateways/sync-status";
import { useOnlineStatus } from "@/lib/hooks/useOnlineStatus";

interface StatusHeroCardProps {
  hadir: number;
  total: number;
  terlambat: number;
  persentase: number;
  isLoading?: boolean;
  onRefresh?: () => void;
  shiftName?: string;
  companyName?: string;
}

export function StatusHeroCard({
  hadir,
  total,
  terlambat,
  persentase,
  isLoading = false,
  onRefresh,
  shiftName = "Shift Pagi",
  companyName = "Sistem Sekolah",
}: StatusHeroCardProps) {
  const isOnline = useOnlineStatus();
  const [isSyncing, setIsSyncing] = useState(false);

  const belumAbsen = Math.max(0, total - hadir);
  const tepatWaktu = Math.max(0, hadir - terlambat);

  const todayDateFormatted = new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  const handleSyncClick = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      await requestSyncNow();
      if (onRefresh) onRefresh();
    } catch {
      // Kegagalan pemicu sinkronisasi manual di latar belakang tidak boleh merusak tampilan metrik lokal.
    } finally {
      setTimeout(() => setIsSyncing(false), 800);
    }
  };

  if (isLoading) {
    return (
      <div className="w-full rounded-2xl border border-slate-700/60 bg-slate-900/90 p-5 shadow-card-bca animate-pulse">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="h-4 w-40 bg-slate-800 rounded-md" />
          <div className="h-6 w-24 bg-slate-800 rounded-full" />
        </div>
        <div className="mt-6 flex items-end justify-between gap-4">
          <div className="space-y-2">
            <div className="h-4 w-28 bg-slate-800 rounded" />
            <div className="h-10 w-36 bg-slate-800 rounded-lg" />
          </div>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-2.5">
          <div className="h-16 bg-slate-800 rounded-xl" />
          <div className="h-16 bg-slate-800 rounded-xl" />
          <div className="h-16 bg-slate-800 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <section
      aria-label="Rangkuman Operasional Presensi Hari Ini"
      className="relative overflow-hidden w-full rounded-2xl border border-blue-900/40 bg-gradient-to-br from-[#003399] via-[#002266] to-[#0a183d] text-white p-5 shadow-card-bca"
    >
      {/* Decorative accent geometry */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-sky-500/10 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-16 -bottom-16 size-64 rounded-full bg-blue-600/15 blur-2xl"
      />

      {/* Header bar of the card */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 pb-3.5 border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-white/10 text-sky-300">
            <Icon name="calendar" className="size-4" />
          </div>
          <div>
            <p className="text-xs font-semibold text-sky-200 capitalize">
              {todayDateFormatted}
            </p>
            <p className="text-[10px] text-sky-300/70 font-medium">
              {companyName} • {shiftName}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Online/Offline Badge */}
          <div
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold backdrop-blur-md ${
              isOnline
                ? "bg-emerald-500/20 text-emerald-200 border border-emerald-400/30"
                : "bg-amber-500/20 text-amber-200 border border-amber-400/30"
            }`}
          >
            <span
              className={`size-1.5 rounded-full ${
                isOnline ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
              }`}
            />
            <span>{isOnline ? "Online" : "Offline"}</span>
          </div>

          <button
            type="button"
            onClick={handleSyncClick}
            disabled={isSyncing}
            aria-label="Sinkronkan data sekarang"
            className="flex size-7 items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 active:scale-95 text-white transition-all disabled:opacity-50"
          >
            <Icon
              name="sync"
              className={`size-3.5 ${isSyncing ? "animate-spin text-sky-300" : ""}`}
            />
          </button>
        </div>
      </div>

      {/* Main KPI */}
      <div className="relative z-10 mt-4 flex items-end justify-between gap-3">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-sky-200/80">
            Tingkat Kehadiran
          </span>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-4xl font-extrabold tracking-tight font-mono-data text-white">
              {persentase.toFixed(1)}%
            </span>
          </div>
        </div>

        {/* Total Present Count */}
        <div className="text-right space-y-1">
          <span className="text-[11px] text-sky-200/90 font-medium">
            Total Masuk
          </span>
          <p className="text-sm font-bold font-mono-data text-white">
            {hadir} / {total}
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="relative z-10 mt-3 h-2 w-full overflow-hidden rounded-full bg-black/30 border border-white/10">
        <div
          className="h-full bg-gradient-to-r from-emerald-400 via-teal-300 to-sky-300 transition-all duration-700 ease-out"
          style={{
            width: `${Math.min(100, Math.max(0, total > 0 ? (hadir / total) * 100 : 0))}%`,
          }}
        />
      </div>

      {/* 3 Status Counters */}
      <div className="relative z-10 mt-4 grid grid-cols-3 gap-2">
        <div className="flex flex-col rounded-xl bg-white/10 backdrop-blur-md p-2.5 border border-white/10 text-center">
          <span className="text-[10px] font-semibold text-emerald-300">
            Tepat Waktu
          </span>
          <span className="text-lg font-bold font-mono-data text-white mt-0.5">
            {tepatWaktu}
          </span>
        </div>

        <div className="flex flex-col rounded-xl bg-white/10 backdrop-blur-md p-2.5 border border-white/10 text-center">
          <span className="text-[10px] font-semibold text-amber-300">
            Terlambat
          </span>
          <span className="text-lg font-bold font-mono-data text-white mt-0.5">
            {terlambat}
          </span>
        </div>

        <div className="flex flex-col rounded-xl bg-white/10 backdrop-blur-md p-2.5 border border-white/10 text-center">
          <span className="text-[10px] font-semibold text-rose-300">
            Belum Absen
          </span>
          <span className="text-lg font-bold font-mono-data text-white mt-0.5">
            {belumAbsen}
          </span>
        </div>
      </div>
    </section>
  );
}
