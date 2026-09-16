"use client";

import { Icon } from "@/components/ui/Icon";
import type { WaConfig } from "@/types/wa-notification";

interface WaQueueEmptyDiagnosticProps {
  config: WaConfig | null;
  hasActiveFilter: boolean;
  onResetFilter?: () => void;
  onOpenConfig?: () => void;
  canManage?: boolean;
}

export function WaQueueEmptyDiagnostic({
  config,
  hasActiveFilter,
  onResetFilter,
  onOpenConfig,
  canManage,
}: WaQueueEmptyDiagnosticProps) {
  const allTriggersOff =
    config !== null &&
    !config.scanMasukEnabled &&
    !config.scanPulangEnabled &&
    !config.bolosEnabled &&
    !config.ambangAlfaEnabled;

  return (
    <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-4">
      {hasActiveFilter ? (
        <div className="flex flex-col items-center justify-center py-4 text-center">
          <div className="grid size-10 place-items-center rounded-xl bg-amber-500/10 text-amber-400 ring-1 ring-inset ring-amber-500/20 mb-2">
            <Icon name="alert" className="size-5" />
          </div>
          <h4 className="text-xs font-bold text-slate-200">
            Tidak Ada Pesan Sesuai Filter
          </h4>
          <p className="mt-1 max-w-xs text-[11px] text-slate-400">
            Antrean tidak ditemukan pada kombinasi filter status atau tanggal
            saat ini.
          </p>
          {onResetFilter && (
            <button
              type="button"
              onClick={onResetFilter}
              className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 ring-1 ring-slate-700 transition active:scale-95"
            >
              <Icon name="refresh" className="size-3" />
              Reset Filter
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div className="flex items-center gap-2">
              <span className="grid size-6 place-items-center rounded-lg bg-indigo-500/20 text-indigo-400">
                <Icon name="alert" className="size-3.5" />
              </span>
              <h4 className="text-xs font-bold text-slate-200">
                Diagnostik Antrean WhatsApp
              </h4>
            </div>
            {canManage && onOpenConfig && (
              <button
                type="button"
                onClick={onOpenConfig}
                className="inline-flex items-center gap-1 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-2 py-1 text-[11px] font-semibold text-indigo-300 transition"
              >
                <Icon name="settings" className="size-3" />
                Gateway
              </button>
            )}
          </div>

          <div className="grid gap-3">
            {/* Status Gateway */}
            <div className="rounded-2xl border border-white/5 bg-slate-950/60 p-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-400">
                  Jalur Pengiriman
                </span>
                <span
                  className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[9px] font-bold ${
                    config?.isActive
                      ? "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20"
                      : "bg-sky-500/10 text-sky-400 ring-1 ring-sky-500/20"
                  }`}
                >
                  {config?.isActive ? "API Otomatis" : "Manual (wa.me)"}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-slate-300">
                {config?.isActive
                  ? `Pesan dikirim via API ${config?.provider?.toUpperCase() || "FONNTE"}.`
                  : "Gateway API nonaktif. Pesan dikirim mandiri 1-klik via WhatsApp gratis."}
              </p>
            </div>

            {/* Status Pemicu */}
            <div className="rounded-2xl border border-white/5 bg-slate-950/60 p-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-400">
                  Sakelar Peristiwa
                </span>
                <span
                  className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[9px] font-bold ${
                    allTriggersOff
                      ? "bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20"
                      : "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20"
                  }`}
                >
                  {allTriggersOff ? "Semua Nonaktif" : "Pemicu Aktif"}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1 text-[10px]">
                <div className="flex items-center gap-1.5 text-slate-300">
                  <span
                    className={`size-1.5 rounded-full ${
                      config?.scanMasukEnabled
                        ? "bg-emerald-400"
                        : "bg-slate-600"
                    }`}
                  />
                  <span>Scan Masuk</span>
                </div>
                <div className="flex items-center gap-1.5 text-slate-300">
                  <span
                    className={`size-1.5 rounded-full ${
                      config?.scanPulangEnabled
                        ? "bg-emerald-400"
                        : "bg-slate-600"
                    }`}
                  />
                  <span>Scan Pulang</span>
                </div>
                <div className="flex items-center gap-1.5 text-slate-300">
                  <span
                    className={`size-1.5 rounded-full ${
                      config?.bolosEnabled ? "bg-emerald-400" : "bg-slate-600"
                    }`}
                  />
                  <span>Bolos KBM</span>
                </div>
                <div className="flex items-center gap-1.5 text-slate-300">
                  <span
                    className={`size-1.5 rounded-full ${
                      config?.ambangAlfaEnabled
                        ? "bg-emerald-400"
                        : "bg-slate-600"
                    }`}
                  />
                  <span>Ambang Alfa</span>
                </div>
              </div>
            </div>
          </div>

          {/* Kesimpulan */}
          <div
            className={`rounded-2xl border p-3 ${
              allTriggersOff
                ? "border-amber-500/20 bg-amber-500/5 text-amber-200"
                : "border-emerald-500/20 bg-emerald-500/5 text-emerald-200"
            }`}
          >
            <div className="flex items-start gap-2">
              <div
                className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-full ${
                  allTriggersOff
                    ? "bg-amber-500/20 text-amber-400"
                    : "bg-emerald-500/20 text-emerald-400"
                }`}
              >
                <Icon
                  name={allTriggersOff ? "alert" : "check"}
                  className="size-3"
                />
              </div>
              <div className="text-[11px]">
                <p className="font-bold">
                  {allTriggersOff
                    ? "Semua Pemicu Nonaktif"
                    : "Kondisi Operasional Tertib"}
                </p>
                <p className="mt-0.5 text-slate-400">
                  {allTriggersOff
                    ? "Aktifkan sakelar pemicu di menu Pengaturan agar antrean notifikasi dapat dibangkitkan."
                    : "Tidak ditemukan anomali bolos KBM dan belum ada siswa melampaui ambang batas Alfa."}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
