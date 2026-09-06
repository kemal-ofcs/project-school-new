"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MobileAppShell } from "@/components/MobileAppShell";
import { FeedbackBanner } from "@/components/ui/FeedbackBanner";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { canAccessArea, hasPermission } from "@/lib/auth/access";
import { triggerHaptic } from "@/lib/client/haptics";
import { createQrPng, employeeQrPayload } from "@/lib/client/qr-code";
import { useAuth } from "@/lib/context/AuthContext";
import {
  type GuruInput,
  getDaftarGuru,
  hapusGuru,
  simpanGuru,
} from "@/lib/gateways/teacher";
import { useDebounce } from "@/lib/hooks/useDebounce";
import { useHydrated } from "@/lib/hooks/useHydrated";

const STATUS_KEPEGAWAIAN = [
  "Honorer",
  "PNS",
  "PPPK",
  "GTY",
  "Kontrak",
] as const;

function emptyForm(): GuruInput {
  return {
    id_guru: "",
    nama: "",
    kode_karyawan: "",
    nip: "",
    nuptk: "",
    gelar: "",
    spesialisasi_mapel: "",
    status_kepegawaian: "Honorer",
    no_hp: "",
    lp: "L",
    id_shift: 1,
    status_aktif: "Aktif",
  };
}

/**
 * Direktori Pendidik & Tenaga Kependidikan (Mobile).
 *
 * `teachers.view` untuk membuka halaman, `teachers.manage` untuk mengubahnya.
 */
export default function GuruMobilePage() {
  const isHydrated = useHydrated();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const canView = canAccessArea(user, "guru");
  const canManage = hasPermission(user, "teachers.manage");

  const [guru, setGuru] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 200);
  const [filterStatus, setFilterStatus] = useState("");

  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [qrPng, setQrPng] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<GuruInput>(emptyForm());

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
      setGuru(await getDaftarGuru());
      setErrorMsg(null);
    } catch (err: unknown) {
      if (!silent) {
        setErrorMsg(
          err instanceof Error ? err.message : "Data guru gagal dimuat.",
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

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return guru.filter((item) => {
      if (filterStatus && String(item.status_kepegawaian) !== filterStatus) {
        return false;
      }
      if (!q) return true;
      return [item.nama, item.nip, item.nuptk, item.spesialisasi_mapel].some(
        (field) =>
          String(field ?? "")
            .toLowerCase()
            .includes(q),
      );
    });
  }, [guru, debouncedSearch, filterStatus]);

  const handleShowQr = useCallback(async (item: Record<string, unknown>) => {
    setDetail(item);
    setQrPng(null);
    try {
      const png = await createQrPng(
        employeeQrPayload({ ...item, id_unik: item.id_guru }),
        360,
      );
      setQrPng(png);
    } catch {
      setErrorMsg(
        "Barcode belum tersedia. Simpan ulang data guru untuk menerbitkan token absensinya.",
      );
    }
  }, []);

  const handleEdit = useCallback((item: Record<string, unknown>) => {
    setForm({
      id_guru: String(item.id_guru ?? ""),
      nama: String(item.nama ?? ""),
      kode_karyawan: String(item.kode_karyawan ?? ""),
      nip: String(item.nip ?? ""),
      nuptk: String(item.nuptk ?? ""),
      gelar: String(item.gelar ?? ""),
      spesialisasi_mapel: String(item.spesialisasi_mapel ?? ""),
      status_kepegawaian: String(item.status_kepegawaian ?? "Honorer"),
      no_hp: String(item.no_hp ?? ""),
      lp: String(item.lp ?? "L"),
      id_shift: Number(item.id_shift ?? 1),
      status_aktif: String(item.status_aktif ?? "Aktif"),
    });
    setFormOpen(true);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!canManage || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    try {
      await simpanGuru(form);
      setSuccessMsg("Data guru berhasil disimpan.");
      triggerHaptic("success");
      setFormOpen(false);
      await loadData(true);
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : "Gagal menyimpan data guru.",
      );
      triggerHaptic("error");
    } finally {
      isSubmittingRef.current = false;
    }
  }, [canManage, form, loadData]);

  const handleDelete = useCallback(
    async (id: string) => {
      if (!canManage || isSubmittingRef.current) return;
      if (!window.confirm("Hapus profil guru ini?")) return;
      isSubmittingRef.current = true;
      try {
        await hapusGuru(id);
        setSuccessMsg("Profil guru berhasil dihapus.");
        triggerHaptic("success");
        setDetail(null);
        await loadData(true);
      } catch (err: unknown) {
        setErrorMsg(
          err instanceof Error ? err.message : "Gagal menghapus guru.",
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
              className="h-24 rounded-2xl border border-white/5 bg-slate-900/40 animate-pulse"
            />
          ))}
        </div>
      </MobileAppShell>
    );
  }

  return (
    <MobileAppShell>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-black leading-tight text-white">
            Guru &amp; Tenaga Kependidikan
          </h1>
          <p className="mt-0.5 text-[11px] text-slate-400">
            {loading
              ? "Memuat data..."
              : `${filtered.length} dari ${guru.length} PTK`}
          </p>
        </div>
        {canManage ? (
          <button
            type="button"
            onClick={() => {
              setForm(emptyForm());
              setFormOpen(true);
              triggerHaptic("light");
            }}
            aria-label="Tambah guru baru"
            className="grid size-10 place-items-center rounded-2xl bg-gradient-to-tr from-indigo-500 to-violet-600 text-on-accent shadow-lg shadow-indigo-500/30 transition-all hover:brightness-110 active:scale-90"
          >
            <Icon name="plus" className="size-5" />
          </button>
        ) : null}
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

      <div className="relative mb-3">
        <Icon
          name="user"
          className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
        />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari nama, NIP, NUPTK, atau mapel..."
          className="w-full rounded-xl border border-white/10 bg-slate-800/60 py-2.5 pl-9 pr-4 text-sm text-white placeholder-slate-500 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
        />
      </div>

      <div className="mb-4 flex gap-2 overflow-x-auto pb-2 scrollbar-none">
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          aria-label="Saring berdasarkan status kepegawaian"
          className="shrink-0 rounded-xl border border-white/10 bg-slate-800/60 px-3 py-2 text-xs font-semibold text-white outline-none focus:border-indigo-500"
        >
          <option value="">Semua Kepegawaian</option>
          {STATUS_KEPEGAWAIAN.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-24 rounded-2xl border border-white/5 bg-slate-900/40 animate-pulse"
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-6 text-center">
          <p className="text-sm text-slate-300">Belum ada PTK yang cocok.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {filtered.map((item) => {
            const id = String(item.id_guru);
            return (
              <li
                key={id}
                className="rounded-2xl border border-white/10 bg-slate-900/60 p-3.5"
              >
                <div className="flex items-start gap-3">
                  <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-indigo-500/20 bg-indigo-500/10 text-sm font-black text-indigo-300">
                    {String(item.nama ?? "?")
                      .charAt(0)
                      .toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-white">
                      {String(item.nama)}
                      {item.gelar ? `, ${String(item.gelar)}` : ""}
                    </p>
                    <p className="mt-0.5 truncate font-mono text-[11px] text-slate-400">
                      NIP {String(item.nip || "-")} &middot;{" "}
                      {String(item.spesialisasi_mapel || "Umum")}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="rounded-lg border border-white/10 bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-300">
                        {String(item.status_kepegawaian || "Honorer")}
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleShowQr(item)}
                        className="rounded-lg border border-white/10 bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-200 active:scale-95"
                      >
                        Barcode
                      </button>
                      {canManage ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleEdit(item)}
                            className="rounded-lg border border-indigo-500/20 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-bold text-indigo-300 active:scale-95"
                          >
                            Ubah
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDelete(id)}
                            className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-300 active:scale-95"
                          >
                            Hapus
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {detail ? (
        <Modal
          isOpen
          onClose={() => setDetail(null)}
          title="Barcode Absensi Guru"
          subtitle={String(detail.nama ?? "")}
        >
          <div className="flex flex-col items-center gap-3 py-2">
            {qrPng ? (
              // biome-ignore lint/performance/noImgElement: data URI QR, bukan aset terkelola
              <img
                src={qrPng}
                alt={`Barcode absensi ${String(detail.nama ?? "")}`}
                className="size-56 rounded-2xl bg-white p-2"
              />
            ) : (
              <div className="grid size-56 place-items-center rounded-2xl border border-white/10 bg-slate-900/60 text-xs text-slate-400">
                Menyiapkan barcode...
              </div>
            )}
            <p className="text-center text-[11px] text-slate-400">
              Arahkan barcode ini ke kamera terminal pemindai saat tiba dan
              pulang.
            </p>
          </div>
        </Modal>
      ) : null}

      {formOpen ? (
        <Modal
          isOpen
          onClose={() => setFormOpen(false)}
          title={form.id_guru ? "Ubah Data Guru" : "Tambah Guru"}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSubmit();
            }}
            className="flex flex-col gap-3 py-1"
          >
            <label className="text-[11px] font-semibold text-slate-300">
              Nama Lengkap
              <input
                required
                value={form.nama}
                onChange={(e) =>
                  setForm((p) => ({ ...p, nama: e.target.value }))
                }
                className="mt-1 w-full rounded-xl border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-[11px] font-semibold text-slate-300">
                NIP
                <input
                  value={form.nip ?? ""}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, nip: e.target.value }))
                  }
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
                />
              </label>
              <label className="text-[11px] font-semibold text-slate-300">
                NUPTK
                <input
                  value={form.nuptk ?? ""}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, nuptk: e.target.value }))
                  }
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
                />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-[11px] font-semibold text-slate-300">
                Gelar
                <input
                  value={form.gelar ?? ""}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, gelar: e.target.value }))
                  }
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
                />
              </label>
              <label className="text-[11px] font-semibold text-slate-300">
                Kepegawaian
                <select
                  value={form.status_kepegawaian ?? "Honorer"}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      status_kepegawaian: e.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
                >
                  {STATUS_KEPEGAWAIAN.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="text-[11px] font-semibold text-slate-300">
              Spesialisasi Mapel
              <input
                value={form.spesialisasi_mapel ?? ""}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    spesialisasi_mapel: e.target.value,
                  }))
                }
                className="mt-1 w-full rounded-xl border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
              />
            </label>
            <label className="text-[11px] font-semibold text-slate-300">
              Nomor HP
              <input
                inputMode="tel"
                placeholder="08xxxxxxxxxx"
                value={form.no_hp ?? ""}
                onChange={(e) =>
                  setForm((p) => ({ ...p, no_hp: e.target.value }))
                }
                className="mt-1 w-full rounded-xl border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
              />
            </label>
            <label className="text-[11px] font-semibold text-slate-300">
              Status Keaktifan
              <select
                value={form.status_aktif ?? "Aktif"}
                onChange={(e) =>
                  setForm((p) => ({ ...p, status_aktif: e.target.value }))
                }
                className="mt-1 w-full rounded-xl border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
              >
                <option value="Aktif">Aktif</option>
                <option value="Nonaktif">Nonaktif</option>
              </select>
            </label>
            <div className="mt-1 flex gap-2">
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="flex-1 rounded-xl border border-white/10 bg-slate-800 py-2.5 text-sm font-bold text-slate-200 active:scale-95"
              >
                Batal
              </button>
              <button
                type="submit"
                className="flex-1 rounded-xl bg-indigo-500 py-2.5 text-sm font-black text-on-accent active:scale-95"
              >
                Simpan
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </MobileAppShell>
  );
}
