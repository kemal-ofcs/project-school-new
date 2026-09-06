"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { MobileAppShell } from "@/components/MobileAppShell";
import { FeedbackBanner } from "@/components/ui/FeedbackBanner";
import { Icon } from "@/components/ui/Icon";
import { canAccessArea, hasPermission } from "@/lib/auth/access";
import { triggerHaptic } from "@/lib/client/haptics";
import { useAuth } from "@/lib/context/AuthContext";
import {
  aktifkanTahunAjaran,
  getDaftarJurusan,
  getDaftarMapel,
  getDaftarRombel,
  getDaftarTahunAjaran,
} from "@/lib/gateways/academic";
import { useHydrated } from "@/lib/hooks/useHydrated";

type TabKey = "tahun_ajaran" | "rombel" | "mapel" | "jurusan";

const TABS: [TabKey, string][] = [
  ["tahun_ajaran", "Tahun Ajaran"],
  ["rombel", "Rombel"],
  ["mapel", "Mapel"],
  ["jurusan", "Jurusan"],
];

/**
 * Struktur Akademik (Mobile).
 *
 * Sengaja BACA-SAJA kecuali satu aksi: mengaktifkan tahun ajaran. Menyusun
 * kurikulum, rombel, dan penugasan pengajar adalah pekerjaan meja yang jauh
 * lebih nyaman di layar lebar, dan halaman Web/Desktop sudah menyediakannya
 * lengkap. Yang dibutuhkan di lapangan adalah melihat struktur yang berlaku —
 * dan mengalihkan tahun ajaran aktif saat semester berganti.
 */
export default function AkademikMobilePage() {
  const isHydrated = useHydrated();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const canView = canAccessArea(user, "akademik");
  const canManage = hasPermission(user, "academic.manage");

  const [tab, setTab] = useState<TabKey>("tahun_ajaran");
  const [tahunAjaran, setTahunAjaran] = useState<Record<string, unknown>[]>([]);
  const [rombel, setRombel] = useState<Record<string, unknown>[]>([]);
  const [mapel, setMapel] = useState<Record<string, unknown>[]>([]);
  const [jurusan, setJurusan] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const isSubmittingRef = useRef(false);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.replace("/login");
  }, [authLoading, isAuthenticated, router]);

  useEffect(() => {
    if (isHydrated && isAuthenticated && !canView) router.replace("/dashboard");
  }, [isHydrated, isAuthenticated, canView, router]);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [ta, jur, map] = await Promise.all([
        getDaftarTahunAjaran(),
        getDaftarJurusan(),
        getDaftarMapel(),
      ]);
      setTahunAjaran(ta);
      setJurusan(jur);
      setMapel(map);

      // Rombel selalu mengikuti tahun ajaran AKTIF: di layar sekecil ini daftar
      // seluruh angkatan lintas tahun lebih membingungkan daripada berguna.
      const aktif = ta.find((t) => Number(t.is_aktif) === 1);
      setRombel(
        await getDaftarRombel(
          aktif ? String(aktif.id_tahun_ajaran) : undefined,
        ),
      );
      setErrorMsg(null);
    } catch (err: unknown) {
      if (!silent) {
        setErrorMsg(
          err instanceof Error ? err.message : "Data akademik gagal dimuat.",
        );
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isHydrated && isAuthenticated && canView) void loadData();
  }, [isHydrated, isAuthenticated, canView, loadData]);

  useEffect(() => {
    const onSyncCompleted = () => void loadData(true);
    window.addEventListener("sppg:sync-completed", onSyncCompleted);
    return () =>
      window.removeEventListener("sppg:sync-completed", onSyncCompleted);
  }, [loadData]);

  const handleActivate = useCallback(
    async (id: string) => {
      if (!canManage || isSubmittingRef.current) return;
      isSubmittingRef.current = true;
      try {
        await aktifkanTahunAjaran(id);
        setSuccessMsg("Tahun ajaran aktif berhasil diperbarui.");
        triggerHaptic("success");
        await loadData(true);
      } catch (err: unknown) {
        setErrorMsg(
          err instanceof Error
            ? err.message
            : "Gagal mengaktifkan tahun ajaran.",
        );
        triggerHaptic("error");
      } finally {
        isSubmittingRef.current = false;
      }
    },
    [canManage, loadData],
  );

  if (authLoading || !isHydrated) {
    return (
      <MobileAppShell>
        <div className="flex flex-col gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-20 rounded-2xl border border-white/5 bg-slate-900/40 animate-pulse"
            />
          ))}
        </div>
      </MobileAppShell>
    );
  }

  const rows: Record<TabKey, Record<string, unknown>[]> = {
    tahun_ajaran: tahunAjaran,
    rombel,
    mapel,
    jurusan,
  };

  return (
    <MobileAppShell>
      <div className="mb-4">
        <h1 className="text-lg font-black leading-tight text-white">
          Struktur Akademik
        </h1>
        <p className="mt-0.5 text-[11px] text-slate-400">
          Tahun ajaran, rombel, mata pelajaran, dan program keahlian.
        </p>
      </div>

      {errorMsg ? (
        <FeedbackBanner
          type="error"
          message={errorMsg}
          className="mb-3"
          onClose={() => setErrorMsg(null)}
        />
      ) : null}
      {successMsg ? (
        <FeedbackBanner
          type="success"
          message={successMsg}
          className="mb-3"
          onClose={() => setSuccessMsg(null)}
        />
      ) : null}

      <div className="mb-4 flex gap-2 overflow-x-auto pb-2 scrollbar-none">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setTab(key);
              triggerHaptic("light");
            }}
            className={`shrink-0 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
              tab === key
                ? "bg-sky-500 text-slate-950"
                : "border border-white/10 bg-slate-800/60 text-slate-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-20 rounded-2xl border border-white/5 bg-slate-900/40 animate-pulse"
            />
          ))}
        </div>
      ) : rows[tab].length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-6 text-center">
          <p className="text-sm text-slate-300">Belum ada data.</p>
          <p className="mt-1 text-[11px] text-slate-500">
            Struktur akademik disusun lewat aplikasi Web atau Desktop.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {tab === "tahun_ajaran"
            ? tahunAjaran.map((item) => {
                const id = String(item.id_tahun_ajaran);
                const aktif = Number(item.is_aktif) === 1;
                return (
                  <li
                    key={id}
                    className="rounded-2xl border border-white/10 bg-slate-900/60 p-3.5"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-white">
                          {String(item.nama_tahun)} &middot;{" "}
                          {String(item.semester)}
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-400">
                          {String(item.tanggal_mulai)} &rarr;{" "}
                          {String(item.tanggal_selesai)}
                        </p>
                      </div>
                      {aktif ? (
                        <span className="shrink-0 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[10px] font-black text-emerald-300">
                          AKTIF
                        </span>
                      ) : canManage ? (
                        <button
                          type="button"
                          onClick={() => void handleActivate(id)}
                          className="shrink-0 rounded-lg bg-sky-500 px-2.5 py-1 text-[10px] font-black text-slate-950 active:scale-95"
                        >
                          Aktifkan
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })
            : null}

          {tab === "rombel"
            ? rombel.map((item) => (
                <li
                  key={String(item.id_rombel)}
                  className="rounded-2xl border border-white/10 bg-slate-900/60 p-3.5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-white">
                        {String(item.nama_rombel)}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-slate-400">
                        Tingkat {String(item.tingkat)} &middot;{" "}
                        {String(item.nama_jurusan || "Umum")} &middot; Wali:{" "}
                        {String(item.nama_wali_kelas || "belum ditunjuk")}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-lg border border-white/10 bg-slate-800 px-2 py-1 text-[10px] font-bold text-slate-300">
                      {String(item.jumlah_siswa ?? 0)}/
                      {String(item.kapasitas ?? 36)}
                    </span>
                  </div>
                </li>
              ))
            : null}

          {tab === "mapel"
            ? mapel.map((item) => (
                <li
                  key={String(item.id_mapel)}
                  className="rounded-2xl border border-white/10 bg-slate-900/60 p-3.5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-white">
                        {String(item.nama_mapel)}
                      </p>
                      <p className="mt-0.5 font-mono text-[11px] text-slate-400">
                        {String(item.kode_mapel)} &middot;{" "}
                        {String(item.kelompok)} &middot; KKM{" "}
                        {String(item.kkm ?? 75)}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-lg border border-white/10 bg-slate-800 px-2 py-1 text-[10px] font-bold text-slate-300">
                      {String(item.beban_jam ?? 2)} JP
                    </span>
                  </div>
                </li>
              ))
            : null}

          {tab === "jurusan"
            ? jurusan.map((item) => (
                <li
                  key={String(item.id_jurusan)}
                  className="rounded-2xl border border-white/10 bg-slate-900/60 p-3.5"
                >
                  <p className="truncate text-sm font-bold text-white">
                    {String(item.nama_jurusan)}
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] text-slate-400">
                    {String(item.kode_jurusan)}
                  </p>
                </li>
              ))
            : null}
        </ul>
      )}

      {canManage ? (
        <p className="mt-4 flex items-start gap-2 rounded-2xl border border-white/10 bg-slate-900/40 p-3 text-[11px] text-slate-400">
          <Icon name="alert" className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Penyusunan rombel, mata pelajaran, dan penugasan pengajar dilakukan
            lewat aplikasi Web atau Desktop yang layarnya lebih lapang.
          </span>
        </p>
      ) : null}
    </MobileAppShell>
  );
}
