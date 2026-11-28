"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { PayrollRecapTable } from "@/components/payroll/PayrollRecapTable";
import { FeedbackBanner } from "@/components/ui/FeedbackBanner";
import { Icon } from "@/components/ui/Icon";
import { MemuatHalaman } from "@/components/ui/MemuatHalaman";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { QuickActionGrid } from "@/components/ui/QuickActionGrid";
import { formatTanggalOperasional } from "@/lib/attendance/time-policy";
import { canAccessArea, hasPermission } from "@/lib/auth/access";
import { useAuth } from "@/lib/context/AuthContext";
import {
  createPayrollRun,
  getPayrollRecap,
  type PayrollRecapRow,
} from "@/lib/gateways/payroll";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { nadaStat } from "@/lib/utils/stat-card";
import { bolehLapor } from "@/lib/validations/lapor-pajak";

const IDR = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

// Tanggal kalender dihitung dari tanggal WIB sebagai teks. `toISOString()` pada
// tanggal lokal memakai UTC, sehingga "awal bulan" jatuh di hari terakhir
// bulan sebelumnya dan periode gaji membayar hari itu dua kali.
function geserTanggal(tanggal: string, hari: number): string {
  const d = new Date(`${tanggal}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + hari);
  return d.toISOString().slice(0, 10);
}

function awalBulan(tanggal: string, geserBulan = 0): string {
  const d = new Date(`${tanggal.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + geserBulan);
  return d.toISOString().slice(0, 10);
}

export default function PayrollDashboardPage() {
  // Penjaga anti klik ganda (Aturan 5). `useState` tidak cukup: pembaruannya
  // dijadwalkan, sehingga dua klik dalam satu tick React sama-sama membaca
  // nilai lama dan keduanya lolos. Dideklarasikan di ATAS, sebelum setiap
  // early return, supaya urutan hook tidak pernah berubah antar-render.
  const isSubmittingRef = useRef(false);

  const isHydrated = useHydrated();
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  const [periodStart, setPeriodStart] = useState(() =>
    awalBulan(formatTanggalOperasional(Date.now())),
  );
  const [periodEnd, setPeriodEnd] = useState(() =>
    formatTanggalOperasional(Date.now()),
  );
  const [activePreset, setActivePreset] = useState<
    "today" | "week" | "thisMonth" | "lastMonth" | "last30" | null
  >("thisMonth");
  const [data, setData] = useState<PayrollRecapRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [modalRunOpen, setModalRunOpen] = useState(false);

  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const rows = await getPayrollRecap(periodStart, periodEnd);
      setData(rows);
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        message:
          err instanceof Error
            ? err.message
            : "Gagal memuat data rekap payroll.",
      });
    } finally {
      setLoading(false);
    }
  }, [periodStart, periodEnd]);

  useEffect(() => {
    if (!isHydrated || authLoading) return;
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    // Otorisasi, bukan sekadar autentikasi. Sebelumnya halaman ini hanya
    // menuntut sesi yang sah, sehingga operator terminal pemindai maupun guru
    // bisa membukanya dan melihat gaji seluruh karyawan. `hasPermission` yang
    // ada di bawah hanya menyalakan tombol — datanya tetap termuat.
    if (!canAccessArea(user, "payroll")) {
      router.push("/forbidden");
      return;
    }
    void loadData();
  }, [isHydrated, authLoading, isAuthenticated, user, loadData, router]);

  const handleCreateRun = async () => {
    if (isSubmittingRef.current) return;
    setCreating(true);
    setFeedback(null);
    isSubmittingRef.current = true;
    try {
      const idempotencyKey = `PR-RUN-${periodStart}-${periodEnd}-${Date.now()}`;
      const run = await createPayrollRun(
        idempotencyKey,
        periodStart,
        periodEnd,
      );
      setModalRunOpen(false);
      setFeedback({
        type: "success",
        message: `Batch payroll ${run.id} berhasil dibuat sebagai DRAFT.`,
      });
      router.push(`/payroll/runs/detail?id=${encodeURIComponent(run.id)}`);
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        message:
          err instanceof Error ? err.message : "Gagal membuat batch payroll.",
      });
    } finally {
      isSubmittingRef.current = false;
      setCreating(false);
    }
  };

  const setPresetRange = (
    preset: "today" | "week" | "thisMonth" | "lastMonth" | "last30",
  ) => {
    setActivePreset(preset);
    const todayStr = formatTanggalOperasional(Date.now());

    if (preset === "today") {
      setPeriodStart(todayStr);
      setPeriodEnd(todayStr);
    } else if (preset === "week") {
      const day = new Date(`${todayStr}T00:00:00Z`).getUTCDay();
      setPeriodStart(geserTanggal(todayStr, day === 0 ? -6 : 1 - day));
      setPeriodEnd(todayStr);
    } else if (preset === "thisMonth") {
      setPeriodStart(awalBulan(todayStr));
      setPeriodEnd(todayStr);
    } else if (preset === "lastMonth") {
      setPeriodStart(awalBulan(todayStr, -1));
      setPeriodEnd(geserTanggal(awalBulan(todayStr), -1));
    } else if (preset === "last30") {
      setPeriodStart(geserTanggal(todayStr, -30));
      setPeriodEnd(todayStr);
    }
  };

  const totalTakeHome = data.reduce(
    (acc, curr) => acc + curr.est_net_salary,
    0,
  );
  const totalLembur = data.reduce(
    (acc, curr) => acc + curr.total_overtime_hours,
    0,
  );
  const totalRegular = data.reduce(
    (acc, curr) => acc + curr.total_regular_hours,
    0,
  );

  const canCreateRun = hasPermission(user, "payroll.run.create");
  const canManageConfig = hasPermission(user, "payroll.config.manage");

  if (!isHydrated || authLoading) {
    return <MemuatHalaman />;
  }

  return (
    <AppShell contentClassName="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 md:py-8 lg:px-8">
      <div className="space-y-6">
        <PageHeader
          eyebrow="Penggajian"
          title="Penggajian & Slip Gaji"
          description="Hitung honor, tunjangan, potongan pajak/BPJS, dan cetak slip gaji personil."
          actions={
            canCreateRun ? (
              <button
                type="button"
                onClick={() => setModalRunOpen(true)}
                disabled={loading || data.length === 0}
                className="px-4 py-2.5 text-sm font-bold rounded-xl bg-sky-700 hover:bg-sky-600 text-on-accent transition flex items-center gap-2 disabled:opacity-50 shadow-sm"
              >
                <Icon name="plus" className="w-4 h-4" />
                Buat Batch Payroll
              </button>
            ) : undefined
          }
        />

        <QuickActionGrid
          kolom={2}
          tiles={[
            {
              href: "/payroll/runs",
              icon: "history",
              title: "Batch Runs",
            },
            { href: "/payroll/rapel", icon: "refresh", title: "Rapel Gaji" },
            {
              href: "/payroll/pelaporan",
              icon: "document",
              title: "Pelaporan",
              visible: bolehLapor(user),
            },
            {
              href: "/payroll/config",
              icon: "settings",
              title: "Konfigurasi Gaji",
              visible: canManageConfig,
            },
          ]}
        />

        {feedback ? (
          <FeedbackBanner
            tone={feedback.type}
            onDismiss={() => setFeedback(null)}
          >
            {feedback.message}
          </FeedbackBanner>
        ) : null}

        {/* Filter Rentang Tanggal & Preset */}
        <div className="app-group-bar p-4 bg-slate-900/80 border border-slate-800 rounded-2xl flex flex-wrap gap-4 items-center justify-between">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Periode Rekap:
            </span>
            <input
              aria-label="Tanggal mulai periode rekap"
              type="date"
              value={periodStart}
              onChange={(e) => {
                setPeriodStart(e.target.value);
                setActivePreset(null);
              }}
              className="min-h-10 px-3 text-sm bg-slate-950 border border-slate-700 rounded-xl text-slate-200 focus:outline-none focus:border-sky-500"
            />
            <span className="text-slate-500 text-sm">s.d.</span>
            <input
              aria-label="Tanggal selesai periode rekap"
              type="date"
              value={periodEnd}
              onChange={(e) => {
                setPeriodEnd(e.target.value);
                setActivePreset(null);
              }}
              className="min-h-10 px-3 text-sm bg-slate-950 border border-slate-700 rounded-xl text-slate-200 focus:outline-none focus:border-sky-500"
            />
            <button
              type="button"
              onClick={loadData}
              disabled={loading}
              className="min-h-10 px-4 text-sm bg-sky-700 hover:bg-sky-600 text-on-accent rounded-xl font-bold transition shadow-sm disabled:opacity-50 flex items-center gap-1.5"
            >
              {loading ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Memuat...
                </>
              ) : (
                "Terapkan Filter"
              )}
            </button>
          </div>

          <div className="app-segment-track flex flex-wrap gap-1 rounded-xl p-1">
            {(
              [
                ["today", "Hari Ini"],
                ["week", "Minggu Ini"],
                ["thisMonth", "Bulan Ini"],
                ["lastMonth", "Bulan Lalu"],
                ["last30", "30 Hari Terakhir"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setPresetRange(key)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                  activePreset === key
                    ? "bg-sky-700 text-on-accent shadow-sm"
                    : "text-slate-400 hover:bg-white/10 hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Ringkasan Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div
            data-tone={nadaStat(data.length, "sky")}
            className="stat-card rounded-2xl p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="stat-card-label text-xs font-bold uppercase">
                Total Karyawan Aktif
              </div>
              <Icon name="users" className="stat-card-icon size-4 shrink-0" />
            </div>
            <div className="stat-card-value text-2xl font-black mt-1">
              {data.length} Personil
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Terjadwal dalam database
            </div>
          </div>
          <div
            data-tone={nadaStat(totalRegular, "sky")}
            className="stat-card rounded-2xl p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="stat-card-label text-xs font-bold uppercase">
                Total Jam Reguler
              </div>
              <Icon name="clock" className="stat-card-icon size-4 shrink-0" />
            </div>
            <div className="stat-card-value text-2xl font-black mt-1">
              {totalRegular.toFixed(1)} Jam
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Akumulasi jam kerja efektif
            </div>
          </div>
          <div
            data-tone={nadaStat(totalLembur, "amber")}
            className="stat-card rounded-2xl p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="stat-card-label text-xs font-bold uppercase">
                Total Jam Lembur
              </div>
              <Icon name="clock" className="stat-card-icon size-4 shrink-0" />
            </div>
            <div className="stat-card-value text-2xl font-black mt-1">
              {totalLembur.toFixed(1)} Jam
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Mengikuti perkalian PP 35/2021
            </div>
          </div>
          <div
            data-tone={nadaStat(totalTakeHome, "emerald")}
            className="stat-card rounded-2xl p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="stat-card-label text-xs font-bold uppercase">
                Estimasi Total Payout
              </div>
              <Icon
                name="document"
                className="stat-card-icon size-4 shrink-0"
              />
            </div>
            <div className="stat-card-value text-2xl font-black mt-1">
              {IDR.format(totalTakeHome)}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Sebelum pemotongan batch resmi
            </div>
          </div>
        </div>

        {/* Tabel Rekap Karyawan */}
        <PayrollRecapTable
          data={data}
          isLoading={loading}
          periodStart={periodStart}
          periodEnd={periodEnd}
        />

        {/* Modal Konfirmasi Buat Run */}
        {modalRunOpen ? (
          <Modal
            title="Konfirmasi Buat Batch Payroll"
            titleId="modal-confirm-payroll-run"
            onClose={() => setModalRunOpen(false)}
          >
            <div className="space-y-4 text-slate-300 text-sm">
              <p>
                Anda akan membuat batch eksekusi payroll resmi untuk periode:
              </p>
              <div className="p-3 bg-slate-800 rounded-lg border border-slate-700 font-mono text-center">
                <strong>{periodStart}</strong> s.d. <strong>{periodEnd}</strong>
              </div>
              <p>
                Batch ini akan mengunci snapshot jam kerja, tarif lembur, pajak
                PPh 21, dan potongan BPJS untuk{" "}
                <strong>{data.length} karyawan</strong> dengan total estimasi{" "}
                <strong className="text-emerald-400">
                  {IDR.format(totalTakeHome)}
                </strong>
                .
              </p>
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
                <button
                  type="button"
                  onClick={() => setModalRunOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleCreateRun}
                  disabled={creating}
                  className="px-4 py-2 rounded-lg bg-sky-700 hover:bg-sky-800 text-white text-sm font-semibold disabled:opacity-50 shadow-md shadow-sky-600/30"
                >
                  {creating ? "Memproses..." : "Ya, Buat Batch DRAFT"}
                </button>
              </div>
            </div>
          </Modal>
        ) : null}
      </div>
    </AppShell>
  );
}
