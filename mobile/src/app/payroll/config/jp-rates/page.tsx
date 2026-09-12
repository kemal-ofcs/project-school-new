"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { MobileAppShell } from "@/components/MobileAppShell";
import {
  CONFIG_INPUT_CLASS,
  CONFIG_LABEL_CLASS,
  ConfigEmptyState,
  ConfigFormModal,
  ConfigRowActions,
  ConfigSkeletonList,
  ConfirmDeleteModal,
  FROZEN_RUN_NOTE,
  IDR,
  PayrollConfigHeader,
  todayLocal,
} from "@/components/payroll/ConfigShared";
import { FeedbackBanner } from "@/components/ui/FeedbackBanner";
import { Icon } from "@/components/ui/Icon";
import { hasPermission } from "@/lib/auth/access";
import { triggerHaptic } from "@/lib/client/haptics";
import { useAuth } from "@/lib/context/AuthContext";
import { getDaftarMapel } from "@/lib/gateways/academic";
import { getDaftarKaryawan } from "@/lib/gateways/employee";
import {
  deleteJpRate,
  getJpRates,
  type JpRateRow,
  saveJpRate,
} from "@/lib/gateways/payroll";
import { isTeacherPersonnel } from "@/lib/validations/payroll-policy";

/*
 * Tarif honor per jam pelajaran untuk Mobile — padanan
 * `web-desktop/src/app/payroll/config/jp-rates/page.tsx`.
 *
 * Tarif khusus (guru + mapel) menang atas tarif umum mapel, dan keduanya menang
 * atas tarif bawaan orang itu di Konfigurasi Penggajian. Urutan itu dieja sekali
 * di `resolveJpRate` / `resolve_jp_rate`, tidak pernah di layar.
 */

interface JpRateDraft {
  id: string;
  id_mapel: string;
  id_guru: string;
  rate: string;
  effective_date: string;
  status_aktif: number;
}

export default function MobileJpRatesPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const canManage = hasPermission(user, "payroll.config.manage");

  const [rates, setRates] = useState<JpRateRow[]>([]);
  const [mapelList, setMapelList] = useState<Record<string, unknown>[]>([]);
  const [guruList, setGuruList] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [draft, setDraft] = useState<JpRateDraft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    label: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const isSubmittingRef = useRef(false);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.replace("/login");
      return;
    }
    if (!hasPermission(user, "payroll.config.manage")) {
      router.replace("/payroll");
    }
  }, [authLoading, isAuthenticated, user, router]);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [rateRows, mapelRows, personnel] = await Promise.all([
        getJpRates(),
        getDaftarMapel(),
        getDaftarKaryawan(),
      ]);
      setRates(rateRows);
      setMapelList(mapelRows as Record<string, unknown>[]);
      setGuruList(
        (personnel as Record<string, unknown>[]).filter((row) =>
          isTeacherPersonnel(row.jenis_personil),
        ),
      );
    } catch (err) {
      if (!silent) {
        setFeedback({
          type: "error",
          message:
            err instanceof Error
              ? err.message
              : "Gagal memuat tarif jam pelajaran.",
        });
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated && canManage) void loadData();
  }, [isAuthenticated, canManage, loadData]);

  useEffect(() => {
    const onSyncCompleted = () => {
      void loadData(true);
    };
    window.addEventListener("sppg:sync-completed", onSyncCompleted);
    return () => {
      window.removeEventListener("sppg:sync-completed", onSyncCompleted);
    };
  }, [loadData]);

  const openAdd = () => {
    triggerHaptic("light");
    setFormError(null);
    setDraft({
      id: "",
      id_mapel: "",
      id_guru: "",
      rate: "0",
      effective_date: todayLocal(),
      status_aktif: 1,
    });
  };

  const openEdit = (row: JpRateRow) => {
    setFormError(null);
    setDraft({
      id: row.id,
      id_mapel: row.id_mapel,
      id_guru: row.id_guru ?? "",
      rate: String(row.rate_per_jp),
      effective_date: row.effective_date,
      status_aktif: row.status_aktif,
    });
  };

  const submit = async () => {
    if (!draft || isSubmittingRef.current) return;
    const rate = Number(draft.rate);

    if (!draft.id_mapel) {
      setFormError("Pilih mata pelajaran terlebih dahulu.");
      return;
    }
    // Rust menyimpan `rate_per_jp` sebagai i64: pecahan ditolak saat
    // deserialisasi dengan pesan yang tidak bisa dipahami pengguna.
    if (!Number.isInteger(rate) || rate < 0) {
      setFormError("Tarif per JP harus bilangan bulat rupiah, minimal 0.");
      return;
    }
    if (!draft.effective_date) {
      setFormError("Tanggal berlaku wajib diisi.");
      return;
    }

    isSubmittingRef.current = true;
    setSaving(true);
    setFormError(null);
    try {
      await saveJpRate({
        id: draft.id,
        id_mapel: draft.id_mapel,
        id_guru: draft.id_guru || null,
        rate_per_jp: rate,
        effective_date: draft.effective_date,
        status_aktif: draft.status_aktif,
      });
      triggerHaptic("success");
      setDraft(null);
      setFeedback({
        type: "success",
        message: "Tarif jam pelajaran berhasil disimpan.",
      });
      await loadData(true);
    } catch (err) {
      triggerHaptic("error");
      setFormError(
        err instanceof Error ? err.message : "Gagal menyimpan tarif JP.",
      );
    } finally {
      isSubmittingRef.current = false;
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setSaving(true);
    try {
      await deleteJpRate(deleteTarget.id);
      triggerHaptic("success");
      setFeedback({
        type: "success",
        message: `Tarif ${deleteTarget.label} berhasil dihapus.`,
      });
      await loadData(true);
    } catch (err) {
      triggerHaptic("error");
      setFeedback({
        type: "error",
        message:
          err instanceof Error ? err.message : "Gagal menghapus tarif JP.",
      });
    } finally {
      setDeleteTarget(null);
      isSubmittingRef.current = false;
      setSaving(false);
    }
  };

  if (authLoading || !isAuthenticated || !canManage) {
    return <div className="min-h-dvh bg-slate-950" />;
  }

  return (
    <MobileAppShell>
      <div className="flex flex-col gap-4 text-slate-100">
        <PayrollConfigHeader
          title="Tarif Honor per JP"
          subtitle="Honor mengajar per mata pelajaran"
          backHref="/payroll/config"
          backLabel="Kembali ke Konfigurasi Penggajian"
          loading={loading}
          onReload={() => void loadData()}
        />

        {feedback ? (
          <FeedbackBanner
            type={feedback.type}
            message={feedback.message}
            onClose={() => setFeedback(null)}
          />
        ) : null}

        <p className="rounded-2xl border border-white/10 bg-slate-900/60 p-3.5 text-[11px] leading-4 text-slate-400">
          Honor dihitung dari jam pelajaran yang jurnalnya sudah diparaf. Tarif
          khusus seorang guru menang atas tarif umum mapelnya, dan tarif
          mengikuti tanggal sesi sehingga kenaikan tidak berlaku surut.
        </p>

        <button
          type="button"
          onClick={openAdd}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-sky-500 text-sm font-black text-slate-950 shadow-lg transition hover:bg-sky-400 active:scale-95"
        >
          <Icon name="plus" className="size-5" />
          Tambah Tarif JP
        </button>

        {loading ? (
          <ConfigSkeletonList count={4} />
        ) : rates.length === 0 ? (
          <ConfigEmptyState>
            Belum ada tarif. Tanpa tarif apa pun, honor mengajar memakai tarif
            bawaan tiap orang di Konfigurasi Penggajian.
          </ConfigEmptyState>
        ) : (
          <ul className="flex flex-col gap-2">
            {rates.map((row) => (
              <li
                key={row.id}
                className="rounded-2xl border border-white/10 bg-slate-900/80 p-3.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-white">
                      {row.nama_mapel || row.id_mapel}
                    </p>
                    <p className="truncate text-[11px] text-slate-400">
                      {row.id_guru
                        ? row.nama_guru || row.id_guru
                        : "Semua guru mapel ini"}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-md border border-white/10 bg-slate-950/60 px-2 py-0.5 font-mono text-sm font-black text-sky-300">
                    {IDR.format(row.rate_per_jp)}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
                  <span
                    className={`rounded-md border px-2 py-0.5 font-bold ${
                      row.status_aktif === 1
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                        : "border-white/10 bg-slate-950/60 text-slate-400"
                    }`}
                  >
                    {row.status_aktif === 1 ? "Aktif" : "Nonaktif"}
                  </span>
                  <span className="rounded-md border border-white/10 bg-slate-950/60 px-2 py-0.5 font-mono text-slate-400">
                    berlaku {row.effective_date || "-"}
                  </span>
                </div>
                <div className="mt-2.5 flex items-center justify-end">
                  <ConfigRowActions
                    deleteLabel={`Hapus tarif ${row.nama_mapel || row.id_mapel}`}
                    onEdit={() => openEdit(row)}
                    onDelete={() =>
                      setDeleteTarget({
                        id: row.id,
                        label: `${row.nama_mapel || row.id_mapel}`,
                      })
                    }
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfigFormModal
        isOpen={Boolean(draft)}
        title={draft?.id ? "Ubah Tarif JP" : "Tambah Tarif JP"}
        titleId="payroll-jp-rate-title"
        error={formError}
        saving={saving}
        submitLabel="Simpan Tarif"
        onDismissError={() => setFormError(null)}
        onClose={() => setDraft(null)}
        onSubmit={() => void submit()}
      >
        {draft ? (
          <>
            <div>
              <label htmlFor="jp-rate-mapel" className={CONFIG_LABEL_CLASS}>
                Mata pelajaran
              </label>
              <select
                id="jp-rate-mapel"
                value={draft.id_mapel}
                onChange={(event) =>
                  setDraft((prev) =>
                    prev ? { ...prev, id_mapel: event.target.value } : prev,
                  )
                }
                required
                className={CONFIG_INPUT_CLASS}
              >
                <option value="">-- Pilih mata pelajaran --</option>
                {mapelList.map((mapel) => (
                  <option
                    key={String(mapel.id_mapel)}
                    value={String(mapel.id_mapel)}
                  >
                    {String(mapel.nama_mapel)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="jp-rate-guru" className={CONFIG_LABEL_CLASS}>
                Berlaku untuk
              </label>
              <select
                id="jp-rate-guru"
                value={draft.id_guru}
                onChange={(event) =>
                  setDraft((prev) =>
                    prev ? { ...prev, id_guru: event.target.value } : prev,
                  )
                }
                className={CONFIG_INPUT_CLASS}
              >
                <option value="">Semua guru mapel ini</option>
                {guruList.map((guru) => (
                  <option
                    key={String(guru.id_unik)}
                    value={String(guru.id_unik)}
                  >
                    {String(guru.nama)}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[10px] leading-4 text-slate-500">
                Pilih seorang guru untuk tarif khusus, misalnya guru senior
                dengan honor lebih tinggi pada mapel yang sama.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="jp-rate-value" className={CONFIG_LABEL_CLASS}>
                  Tarif (Rp/JP)
                </label>
                <input
                  id="jp-rate-value"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={draft.rate}
                  onChange={(event) =>
                    setDraft((prev) =>
                      prev ? { ...prev, rate: event.target.value } : prev,
                    )
                  }
                  required
                  className={`${CONFIG_INPUT_CLASS} font-mono`}
                />
              </div>
              <div>
                <label htmlFor="jp-rate-date" className={CONFIG_LABEL_CLASS}>
                  Berlaku sejak
                </label>
                <input
                  id="jp-rate-date"
                  type="date"
                  value={draft.effective_date}
                  onChange={(event) =>
                    setDraft((prev) =>
                      prev
                        ? { ...prev, effective_date: event.target.value }
                        : prev,
                    )
                  }
                  required
                  className={CONFIG_INPUT_CLASS}
                />
              </div>
            </div>

            <label className="flex items-center gap-3 text-[11px] font-semibold text-slate-300">
              <input
                type="checkbox"
                checked={draft.status_aktif === 1}
                onChange={(event) =>
                  setDraft((prev) =>
                    prev
                      ? { ...prev, status_aktif: event.target.checked ? 1 : 0 }
                      : prev,
                  )
                }
                className="size-4 rounded border-white/20 bg-slate-950 accent-sky-500"
              />
              <span>Tarif aktif</span>
            </label>
          </>
        ) : null}
      </ConfigFormModal>

      <ConfirmDeleteModal
        label={deleteTarget?.label ?? null}
        note={FROZEN_RUN_NOTE}
        titleId="payroll-jp-rate-delete-title"
        busy={saving}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
      />
    </MobileAppShell>
  );
}
