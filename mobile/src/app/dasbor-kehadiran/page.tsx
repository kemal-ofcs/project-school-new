"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { MobileAppShell } from "@/components/MobileAppShell";
import { canAccessArea } from "@/lib/auth/access";
import { triggerHaptic } from "@/lib/client/haptics";
import { useAuth } from "@/lib/context/AuthContext";
import {
  type AttendanceDashboardCategoryMetrics,
  type AttendanceDashboardMetrics,
  getAttendanceDashboardMetrics,
} from "@/lib/gateways/attendance-dashboard";

/**
 * Dasbor Audit Kehadiran versi genggam.
 *
 * Halaman ini bekerja TANPA JARINGAN: gateway-nya memanggil command Rust lokal
 * yang membaca SQLite perangkat, dan seluruh tabel yang dibacanya ikut
 * `SNAPSHOT_TABLES` sehingga sudah tersedia setelah sinkronisasi terakhir.
 * Angkanya berumur sesuai pull terakhir, bukan gagal total saat sinyal hilang.
 */

function formatTanggalPanjang(value: string) {
  if (!value) return "-";
  try {
    const [y, m, d] = value.split("-").map(Number);
    return new Intl.DateTimeFormat("id-ID", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(y, (m ?? 1) - 1, d));
  } catch {
    return value;
  }
}

function toneKehadiran(persentase: number) {
  if (persentase >= 90) return "text-emerald-400";
  if (persentase >= 75) return "text-amber-400";
  return "text-rose-400";
}

function StatTile({
  label,
  value,
  tone = "text-white",
}: {
  label: string;
  value: number | string;
  tone?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className={`mt-0.5 text-xl font-black ${tone}`}>{value}</div>
    </div>
  );
}

function KartuKategori({
  judul,
  data,
}: {
  judul: string;
  data: AttendanceDashboardCategoryMetrics;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-4 backdrop-blur-md">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-bold text-white">{judul}</h2>
        <div className="text-right">
          <div
            className={`text-2xl font-black ${toneKehadiran(data.persentase)}`}
          >
            {data.persentase}%
          </div>
          <div className="text-[10px] text-slate-400">
            {data.hadir} dari {data.total} hadir
          </div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <StatTile
          label="Terlambat"
          value={data.terlambat}
          tone={data.terlambat > 0 ? "text-amber-300" : "text-white"}
        />
        <StatTile label="Sakit" value={data.sakit} />
        <StatTile label="Izin" value={data.izin} />
        <StatTile label="Dispen" value={data.dispen} />
        <StatTile
          label="Alfa"
          value={data.alfa}
          tone={data.alfa > 0 ? "text-rose-400" : "text-white"}
        />
        <StatTile label="Total" value={data.total} />
      </div>
    </div>
  );
}

export default function DasborKehadiranMobilePage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const canView = canAccessArea(user, "dasbor_kehadiran");

  const [tanggal, setTanggal] = useState("");
  const [data, setData] = useState<AttendanceDashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Mobile memakai static export dan tidak punya rute `/forbidden`, jadi
  // proteksinya lewat `router.replace`, bukan `redirect()`.
  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.replace("/login");
      return;
    }
    if (!canView) {
      router.replace("/dashboard");
    }
  }, [authLoading, isAuthenticated, canView, router]);

  const loadData = useCallback(async (targetTanggal?: string) => {
    setLoading(true);
    try {
      const hasil = await getAttendanceDashboardMetrics({
        tanggal: targetTanggal || undefined,
      });
      setData(hasil);
      // Tanggal operasional ditentukan backend (WIB), bukan jam perangkat.
      setTanggal((current) => current || hasil.tanggal);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Gagal memuat dasbor audit kehadiran.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading || !isAuthenticated || !canView) return;
    void loadData();
  }, [authLoading, isAuthenticated, canView, loadData]);

  return (
    <MobileAppShell>
      <div className="flex flex-col gap-4 text-slate-100">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              triggerHaptic("light");
              router.push("/settings");
            }}
            aria-label="Kembali ke Pengaturan"
            className="grid size-9 place-items-center rounded-2xl bg-white/5 text-slate-300 transition hover:bg-white/10 active:scale-95"
          >
            <svg
              className="size-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <title>Kembali</title>
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <div>
            <h1 className="text-lg font-black text-white">Dasbor Kehadiran</h1>
            <p className="text-[11px] text-slate-400">
              {formatTanggalPanjang(data?.tanggal ?? tanggal)}
            </p>
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-3">
          <label
            htmlFor="tanggal-dasbor"
            className="text-[10px] font-semibold uppercase tracking-wide text-slate-400"
          >
            Tanggal
          </label>
          <div className="mt-1.5 flex gap-2">
            <input
              id="tanggal-dasbor"
              type="date"
              value={tanggal}
              onChange={(event) => setTanggal(event.target.value)}
              className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white"
            />
            <button
              type="button"
              onClick={() => {
                triggerHaptic("light");
                void loadData(tanggal);
              }}
              className="rounded-xl bg-indigo-500 px-4 py-2 text-xs font-black text-white transition hover:bg-indigo-400 active:scale-95"
            >
              Muat
            </button>
          </div>
        </div>

        {error ? (
          <div className="rounded-2xl border border-rose-400/30 bg-rose-400/10 p-3 text-xs text-rose-200">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="grid place-items-center py-16">
            <div className="size-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
          </div>
        ) : data ? (
          <>
            <KartuKategori judul="Siswa" data={data.siswa} />
            <KartuKategori judul="Guru / PTK" data={data.guru} />

            {data.anomaliBolos > 0 ? (
              <div className="rounded-3xl border border-rose-400/30 bg-rose-400/10 p-4">
                <div className="text-sm font-bold text-rose-200">
                  {data.anomaliBolos} siswa terindikasi bolos
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-rose-200/80">
                  Tercatat masuk gerbang tetapi ditandai Alfa pada presensi mata
                  pelajaran hari itu.
                </p>
              </div>
            ) : null}

            <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-4">
              <h2 className="text-sm font-bold text-white">Rekap per Rombel</h2>
              {data.rekapRombel.length === 0 ? (
                <p className="mt-2 text-xs text-slate-400">
                  Belum ada rombongan belajar terdaftar.
                </p>
              ) : (
                <ul className="mt-3 flex flex-col gap-2">
                  {data.rekapRombel.map((rombel) => (
                    <li
                      key={rombel.id_rombel}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-950/60 px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-bold text-white">
                          {rombel.nama_rombel}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {rombel.hadir}/{rombel.total_siswa} hadir ·{" "}
                          {rombel.sakit_izin} izin/sakit · {rombel.alfa} alfa
                        </div>
                      </div>
                      <div
                        className={`shrink-0 text-lg font-black ${toneKehadiran(rombel.persentase)}`}
                      >
                        {rombel.persentase}%
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-4">
              <h2 className="text-sm font-bold text-white">
                Guru / PTK Hari Ini
              </h2>
              {data.rekapGuru.length === 0 ? (
                <p className="mt-2 text-xs text-slate-400">
                  Belum ada data guru untuk tanggal ini.
                </p>
              ) : (
                <ul className="mt-3 flex flex-col gap-2">
                  {data.rekapGuru.map((guru) => (
                    <li
                      key={guru.id_karyawan}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-950/60 px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-bold text-white">
                          {guru.nama_lengkap}
                        </div>
                        <div className="truncate text-[10px] text-slate-400">
                          {guru.jabatan}
                          {guru.jam_masuk ? ` · masuk ${guru.jam_masuk}` : ""}
                          {guru.menit_terlambat > 0
                            ? ` · telat ${guru.menit_terlambat} mnt`
                            : ""}
                        </div>
                      </div>
                      <span
                        className={`shrink-0 rounded-lg px-2 py-1 text-[10px] font-black ${
                          guru.status_kehadiran === "Belum Hadir"
                            ? "bg-slate-800 text-slate-400"
                            : guru.status_kehadiran === "Alfa"
                              ? "bg-rose-500/20 text-rose-300"
                              : "bg-emerald-500/20 text-emerald-300"
                        }`}
                      >
                        {guru.status_kehadiran}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        ) : null}
      </div>
    </MobileAppShell>
  );
}
