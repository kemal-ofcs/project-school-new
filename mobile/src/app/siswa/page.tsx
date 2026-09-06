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
import { getDaftarRombel } from "@/lib/gateways/academic";
import {
  getDaftarSiswa,
  hapusSiswa,
  type SiswaInput,
  simpanSiswa,
} from "@/lib/gateways/student";
import { useDebounce } from "@/lib/hooks/useDebounce";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { normalizeOperatorPhone } from "@/lib/operators/contact";

const STATUS_SISWA = [
  "Aktif",
  "Lulus",
  "Pindah",
  "Keluar",
  "Drop Out",
] as const;

function emptyForm(idRombel = ""): SiswaInput {
  return {
    id_siswa: "",
    nama_lengkap: "",
    nis: "",
    nisn: "",
    jenis_kelamin: "L",
    id_rombel: idRombel,
    nama_wali: "",
    no_whatsapp_wali: "",
    alamat: "",
    angkatan: new Date().getFullYear(),
    status: "Aktif",
  };
}

/**
 * Direktori Peserta Didik (Mobile).
 *
 * Dua lapis RBAC seperti halaman Karyawan: `students.view` untuk membuka
 * halaman, `students.manage` untuk tombol tambah/ubah/hapus. Backend tetap
 * menegakkan keduanya — gerbang di sini hanya lapisan kedua.
 */
export default function SiswaMobilePage() {
  const isHydrated = useHydrated();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const canView = canAccessArea(user, "siswa");
  const canManage = hasPermission(user, "students.manage");

  const [siswa, setSiswa] = useState<Record<string, unknown>[]>([]);
  const [rombel, setRombel] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 200);
  const [filterRombel, setFilterRombel] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [qrPng, setQrPng] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<SiswaInput>(emptyForm());

  const isSubmittingRef = useRef(false);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.replace("/login");
  }, [authLoading, isAuthenticated, router]);

  useEffect(() => {
    if (isHydrated && isAuthenticated && !canView) router.replace("/dashboard");
  }, [isHydrated, isAuthenticated, canView, router]);

  const loadData = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const [sData, rData] = await Promise.all([
          getDaftarSiswa(filterRombel || undefined),
          getDaftarRombel(),
        ]);
        setSiswa(sData);
        setRombel(rData);
        setErrorMsg(null);
      } catch (err: unknown) {
        if (!silent) {
          setErrorMsg(
            err instanceof Error ? err.message : "Data siswa gagal dimuat.",
          );
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [filterRombel],
  );

  useEffect(() => {
    if (isHydrated && isAuthenticated && canView) void loadData();
  }, [isHydrated, isAuthenticated, canView, loadData]);

  useEffect(() => {
    const onSyncCompleted = () => void loadData(true);
    window.addEventListener("sppg:sync-completed", onSyncCompleted);
    return () =>
      window.removeEventListener("sppg:sync-completed", onSyncCompleted);
  }, [loadData]);

  // Pencarian dan status disaring di klien: gateway hanya menerima filter
  // rombel, dan jumlah siswa per rombel selalu jauh di bawah seribu baris.
  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return siswa.filter((item) => {
      if (filterStatus && String(item.status) !== filterStatus) return false;
      if (!q) return true;
      return [item.nama_lengkap, item.nis, item.nisn, item.nama_wali].some(
        (field) =>
          String(field ?? "")
            .toLowerCase()
            .includes(q),
      );
    });
  }, [siswa, debouncedSearch, filterStatus]);

  const handleShowQr = useCallback(async (item: Record<string, unknown>) => {
    setDetail(item);
    setQrPng(null);
    try {
      // Helper kanonik yang sama dengan kartu karyawan dan halaman Web.
      const png = await createQrPng(
        employeeQrPayload({ ...item, id_unik: item.id_siswa }),
        360,
      );
      setQrPng(png);
    } catch {
      setErrorMsg(
        "Barcode belum tersedia. Simpan ulang data siswa untuk menerbitkan token absensinya.",
      );
    }
  }, []);

  const handleEdit = useCallback((item: Record<string, unknown>) => {
    setForm({
      id_siswa: String(item.id_siswa ?? ""),
      nama_lengkap: String(item.nama_lengkap ?? ""),
      nis: String(item.nis ?? ""),
      nisn: String(item.nisn ?? ""),
      jenis_kelamin: item.jenis_kelamin === "P" ? "P" : "L",
      id_rombel: String(item.id_rombel ?? ""),
      nama_wali: String(item.nama_wali ?? ""),
      no_whatsapp_wali: String(item.no_whatsapp_wali ?? ""),
      alamat: String(item.alamat ?? ""),
      angkatan: Number(item.angkatan ?? new Date().getFullYear()),
      status: String(item.status ?? "Aktif"),
    });
    setFormOpen(true);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!canManage || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    try {
      await simpanSiswa(form);
      setSuccessMsg("Data siswa berhasil disimpan.");
      triggerHaptic("success");
      setFormOpen(false);
      await loadData(true);
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : "Gagal menyimpan data siswa.",
      );
      triggerHaptic("error");
    } finally {
      isSubmittingRef.current = false;
    }
  }, [canManage, form, loadData]);

  const handleDelete = useCallback(
    async (id: string) => {
      if (!canManage || isSubmittingRef.current) return;
      if (!window.confirm("Hapus profil siswa ini?")) return;
      isSubmittingRef.current = true;
      try {
        await hapusSiswa(id);
        setSuccessMsg("Profil siswa berhasil dihapus.");
        triggerHaptic("success");
        setDetail(null);
        await loadData(true);
      } catch (err: unknown) {
        setErrorMsg(
          err instanceof Error ? err.message : "Gagal menghapus siswa.",
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
            Peserta Didik
          </h1>
          <p className="mt-0.5 text-[11px] text-slate-400">
            {loading
              ? "Memuat data..."
              : `${filtered.length} dari ${siswa.length} siswa`}
          </p>
        </div>
        {canManage ? (
          <button
            type="button"
            onClick={() => {
              setForm(
                emptyForm(filterRombel || String(rombel[0]?.id_rombel ?? "")),
              );
              setFormOpen(true);
              triggerHaptic("light");
            }}
            aria-label="Tambah siswa baru"
            className="grid size-10 place-items-center rounded-2xl bg-gradient-to-tr from-sky-500 to-blue-600 text-on-accent shadow-lg shadow-sky-500/30 transition-all hover:brightness-110 active:scale-90"
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
          name="users"
          className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
        />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari nama, NIS, NISN, atau wali..."
          className="w-full rounded-xl border border-white/10 bg-slate-800/60 py-2.5 pl-9 pr-4 text-sm text-white placeholder-slate-500 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
        />
      </div>

      <div className="mb-4 flex gap-2 overflow-x-auto pb-2 scrollbar-none">
        <select
          value={filterRombel}
          onChange={(e) => setFilterRombel(e.target.value)}
          aria-label="Saring berdasarkan rombel"
          className="shrink-0 rounded-xl border border-white/10 bg-slate-800/60 px-3 py-2 text-xs font-semibold text-white outline-none focus:border-sky-500"
        >
          <option value="">Semua Rombel</option>
          {rombel.map((r) => (
            <option key={String(r.id_rombel)} value={String(r.id_rombel)}>
              {String(r.nama_rombel)}
            </option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          aria-label="Saring berdasarkan status"
          className="shrink-0 rounded-xl border border-white/10 bg-slate-800/60 px-3 py-2 text-xs font-semibold text-white outline-none focus:border-sky-500"
        >
          <option value="">Semua Status</option>
          {STATUS_SISWA.map((s) => (
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
          <p className="text-sm text-slate-300">Belum ada siswa yang cocok.</p>
          <p className="mt-1 text-[11px] text-slate-500">
            Ubah filter atau tambahkan peserta didik baru.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {filtered.map((item) => {
            const id = String(item.id_siswa);
            const wa = normalizeOperatorPhone(
              String(item.no_whatsapp_wali ?? ""),
            ).replace(/^\+/, "");
            return (
              <li
                key={id}
                className="rounded-2xl border border-white/10 bg-slate-900/60 p-3.5"
              >
                <div className="flex items-start gap-3">
                  <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-sky-500/20 bg-sky-500/10 text-sm font-black text-sky-300">
                    {String(item.nama_lengkap ?? "?")
                      .charAt(0)
                      .toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-white">
                      {String(item.nama_lengkap)}
                    </p>
                    <p className="mt-0.5 truncate font-mono text-[11px] text-slate-400">
                      NIS {String(item.nis || "-")} &middot;{" "}
                      {String(item.nama_rombel || "-")}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span
                        className={`rounded-lg px-2 py-0.5 text-[10px] font-bold ${
                          String(item.status) === "Aktif"
                            ? "border border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                            : "border border-white/10 bg-slate-800 text-slate-400"
                        }`}
                      >
                        {String(item.status)}
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleShowQr(item)}
                        className="rounded-lg border border-white/10 bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-200 active:scale-95"
                      >
                        Barcode
                      </button>
                      {wa ? (
                        <a
                          href={`https://wa.me/${wa}`}
                          target="_blank"
                          rel="noreferrer"
                          onClick={() => triggerHaptic("light")}
                          className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-300 active:scale-95"
                        >
                          <Icon name="whatsapp" className="size-3" />
                          Wali
                        </a>
                      ) : null}
                      {canManage ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleEdit(item)}
                            className="rounded-lg border border-sky-500/20 bg-sky-500/10 px-2 py-0.5 text-[10px] font-bold text-sky-300 active:scale-95"
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
          title="Barcode Absensi Siswa"
          subtitle={String(detail.nama_lengkap ?? "")}
        >
          <div className="flex flex-col items-center gap-3 py-2">
            {qrPng ? (
              // biome-ignore lint/performance/noImgElement: data URI QR, bukan aset terkelola
              <img
                src={qrPng}
                alt={`Barcode absensi ${String(detail.nama_lengkap ?? "")}`}
                className="size-56 rounded-2xl bg-white p-2"
              />
            ) : (
              <div className="grid size-56 place-items-center rounded-2xl border border-white/10 bg-slate-900/60 text-xs text-slate-400">
                Menyiapkan barcode...
              </div>
            )}
            <p className="text-center text-[11px] text-slate-400">
              Pindai barcode ini di scanner gerbang saat masuk dan pulang.
            </p>
          </div>
        </Modal>
      ) : null}

      {formOpen ? (
        <Modal
          isOpen
          onClose={() => setFormOpen(false)}
          title={form.id_siswa ? "Ubah Data Siswa" : "Tambah Siswa"}
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
                value={form.nama_lengkap}
                onChange={(e) =>
                  setForm((p) => ({ ...p, nama_lengkap: e.target.value }))
                }
                className="mt-1 w-full rounded-xl border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white outline-none focus:border-sky-500"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-[11px] font-semibold text-slate-300">
                NIS
                <input
                  value={form.nis ?? ""}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, nis: e.target.value }))
                  }
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white outline-none focus:border-sky-500"
                />
              </label>
              <label className="text-[11px] font-semibold text-slate-300">
                NISN
                <input
                  value={form.nisn ?? ""}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, nisn: e.target.value }))
                  }
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white outline-none focus:border-sky-500"
                />
              </label>
            </div>
            <label className="text-[11px] font-semibold text-slate-300">
              Rombel
              <select
                required
                value={form.id_rombel}
                onChange={(e) =>
                  setForm((p) => ({ ...p, id_rombel: e.target.value }))
                }
                className="mt-1 w-full rounded-xl border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white outline-none focus:border-sky-500"
              >
                <option value="">Pilih rombel...</option>
                {rombel.map((r) => (
                  <option key={String(r.id_rombel)} value={String(r.id_rombel)}>
                    {String(r.nama_rombel)}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-[11px] font-semibold text-slate-300">
                Jenis Kelamin
                <select
                  value={form.jenis_kelamin ?? "L"}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      jenis_kelamin: e.target.value === "P" ? "P" : "L",
                    }))
                  }
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white outline-none focus:border-sky-500"
                >
                  <option value="L">Laki-laki</option>
                  <option value="P">Perempuan</option>
                </select>
              </label>
              <label className="text-[11px] font-semibold text-slate-300">
                Angkatan
                <input
                  type="number"
                  value={form.angkatan ?? new Date().getFullYear()}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, angkatan: Number(e.target.value) }))
                  }
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white outline-none focus:border-sky-500"
                />
              </label>
            </div>
            <label className="text-[11px] font-semibold text-slate-300">
              Nama Wali
              <input
                value={form.nama_wali ?? ""}
                onChange={(e) =>
                  setForm((p) => ({ ...p, nama_wali: e.target.value }))
                }
                className="mt-1 w-full rounded-xl border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white outline-none focus:border-sky-500"
              />
            </label>
            <label className="text-[11px] font-semibold text-slate-300">
              WhatsApp Wali
              <input
                inputMode="tel"
                placeholder="08xxxxxxxxxx"
                value={form.no_whatsapp_wali ?? ""}
                onChange={(e) =>
                  setForm((p) => ({ ...p, no_whatsapp_wali: e.target.value }))
                }
                className="mt-1 w-full rounded-xl border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white outline-none focus:border-sky-500"
              />
            </label>
            <label className="text-[11px] font-semibold text-slate-300">
              Status
              <select
                value={form.status ?? "Aktif"}
                onChange={(e) =>
                  setForm((p) => ({ ...p, status: e.target.value }))
                }
                className="mt-1 w-full rounded-xl border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white outline-none focus:border-sky-500"
              >
                {STATUS_SISWA.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
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
                className="flex-1 rounded-xl bg-sky-500 py-2.5 text-sm font-black text-slate-950 active:scale-95"
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
