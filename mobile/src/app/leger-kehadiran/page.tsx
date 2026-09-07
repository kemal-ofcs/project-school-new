"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { MobileAppShell } from "@/components/MobileAppShell";
import { FeedbackBanner } from "@/components/ui/FeedbackBanner";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { canAccessArea, hasPermission } from "@/lib/auth/access";
import { triggerHaptic } from "@/lib/client/haptics";
import { useAuth } from "@/lib/context/AuthContext";
import { getDaftarRombel, getDaftarTahunAjaran } from "@/lib/gateways/academic";
import {
  deleteFrozenLedger,
  type FrozenLedgerItem,
  freezeAttendanceLedger,
  getFrozenLedger,
  getLedgerPreview,
  type LedgerStudentItem,
} from "@/lib/gateways/attendance-ledger";
import { syncNow } from "@/lib/gateways/sync-status";
import { useHydrated } from "@/lib/hooks/useHydrated";

type ModeTab = "preview" | "frozen";

export default function MobileLegerKehadiranPage() {
  const isHydrated = useHydrated();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const canManage = hasPermission(user, "attendance_ledger.manage");
  const canDelete = hasPermission(user, "attendance_ledger.delete");

  const [activeTab, setActiveTab] = useState<ModeTab>("preview");
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error" | "warning";
    message: string;
  } | null>(null);

  // Filters
  const [tahunAjaranList, setTahunAjaranList] = useState<
    Record<string, unknown>[]
  >([]);
  const [rombelList, setRombelList] = useState<Record<string, unknown>[]>([]);

  const [selectedTa, setSelectedTa] = useState<string>("");
  const [selectedSemester, setSelectedSemester] = useState<string>("Ganjil");
  const [selectedRombel, setSelectedRombel] = useState<string>("");

  // Data
  const [previewStudents, setPreviewStudents] = useState<LedgerStudentItem[]>(
    [],
  );
  const [totalHariEfektif, setTotalHariEfektif] = useState(0);
  const [frozenStudents, setFrozenStudents] = useState<FrozenLedgerItem[]>([]);

  // Modals
  const [showFreezeConfirm, setShowFreezeConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const isSubmittingRef = useRef(false);

  // Client guard untuk Mobile static export
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/login");
    }
    if (
      isHydrated &&
      isAuthenticated &&
      !canAccessArea(user, "leger_kehadiran")
    ) {
      router.replace("/dashboard");
    }
  }, [authLoading, isAuthenticated, isHydrated, user, router]);

  // Load masters
  const loadMasterData = useCallback(async () => {
    try {
      const [taData, rData] = await Promise.all([
        getDaftarTahunAjaran(),
        getDaftarRombel(),
      ]);
      setTahunAjaranList(taData || []);
      setRombelList(rData || []);

      const activeTa = taData?.find(
        (ta) => ta.is_aktif === 1 || ta.is_aktif === "1",
      );
      if (activeTa) {
        setSelectedTa(String(activeTa.id_tahun_ajaran));
        if (activeTa.semester) {
          setSelectedSemester(String(activeTa.semester));
        }
      } else if (taData && taData.length > 0) {
        setSelectedTa(String(taData[0].id_tahun_ajaran));
      }

      if (rData && rData.length > 0) {
        setSelectedRombel(String(rData[0].id_rombel));
      }
    } catch {
      // Abaikan galat master
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      void loadMasterData();
    }
  }, [isAuthenticated, loadMasterData]);

  // Load ledger data
  const loadLedger = useCallback(async () => {
    if (!selectedTa) return;
    setLoading(true);
    try {
      if (activeTab === "preview") {
        const res = await getLedgerPreview(
          selectedTa,
          selectedSemester,
          selectedRombel || undefined,
        );
        setPreviewStudents(res.students || []);
        setTotalHariEfektif(res.total_hari_efektif || 0);
      } else {
        const res = await getFrozenLedger(
          selectedTa,
          selectedSemester,
          selectedRombel || undefined,
        );
        setFrozenStudents(res || []);
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Gagal memuat data leger.";
      setFeedback({ type: "error", message: msg });
    } finally {
      setLoading(false);
    }
  }, [selectedTa, selectedSemester, selectedRombel, activeTab]);

  useEffect(() => {
    if (isAuthenticated && selectedTa) {
      void loadLedger();
    }
  }, [isAuthenticated, selectedTa, loadLedger]);

  // Background sync listener
  useEffect(() => {
    const onSyncCompleted = () => {
      void loadLedger();
    };
    window.addEventListener("sppg:sync-completed", onSyncCompleted);
    return () => {
      window.removeEventListener("sppg:sync-completed", onSyncCompleted);
    };
  }, [loadLedger]);

  const handleRefresh = async () => {
    triggerHaptic("light");
    try {
      await syncNow();
    } catch {
      // Abaikan galat sinkronisasi sementara
    }
    await loadLedger();
    setFeedback({
      type: "success",
      message: "Data leger kehadiran berhasil dimuat ulang.",
    });
  };

  const handleFreeze = async () => {
    if (isSubmittingRef.current || !selectedTa || !selectedRombel) return;
    isSubmittingRef.current = true;
    try {
      const result = await freezeAttendanceLedger({
        id_tahun_ajaran: selectedTa,
        semester: selectedSemester,
        id_rombel: selectedRombel,
      });
      triggerHaptic("success");
      setShowFreezeConfirm(false);
      setFeedback({
        type: "success",
        message: `Leger berhasil dibekukan untuk ${result.total_dibekukan} siswa.`,
      });
      setActiveTab("frozen");
      await loadLedger();
    } catch (err: unknown) {
      triggerHaptic("error");
      const msg =
        err instanceof Error ? err.message : "Gagal membekukan leger.";
      setFeedback({ type: "error", message: msg });
    } finally {
      isSubmittingRef.current = false;
    }
  };

  const handleDeleteFrozen = async () => {
    if (isSubmittingRef.current || !selectedTa || !selectedRombel) return;
    isSubmittingRef.current = true;
    try {
      const result = await deleteFrozenLedger(
        selectedTa,
        selectedSemester,
        selectedRombel,
      );
      triggerHaptic("success");
      setShowDeleteConfirm(false);
      setFeedback({
        type: "success",
        message: `Arsip leger berhasil dihapus (${result.deleted_count} baris).`,
      });
      await loadLedger();
    } catch (err: unknown) {
      triggerHaptic("error");
      const msg =
        err instanceof Error ? err.message : "Gagal menghapus leger beku.";
      setFeedback({ type: "error", message: msg });
    } finally {
      isSubmittingRef.current = false;
    }
  };

  if (!isAuthenticated || !canAccessArea(user, "leger_kehadiran")) {
    return null;
  }

  return (
    <MobileAppShell>
      <div className="space-y-4 pb-16">
        {feedback ? (
          <FeedbackBanner
            type={feedback.type}
            message={feedback.message}
            onClose={() => setFeedback(null)}
          />
        ) : null}

        {/* Header Bar */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-bold text-white">Leger Kehadiran</h1>
            <p className="text-xs text-slate-400">
              Rekapitulasi Semester &amp; Arsip Rapor
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleRefresh()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-slate-900/80 px-2.5 py-1.5 text-xs font-semibold text-slate-300 active:scale-95 transition"
          >
            <Icon name="refresh" className="size-3.5" />
            <span>Muat Ulang</span>
          </button>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="grid grid-cols-2 gap-1 rounded-2xl border border-white/10 bg-slate-900/80 p-1">
          <button
            type="button"
            onClick={() => {
              triggerHaptic("light");
              setActiveTab("preview");
            }}
            className={`rounded-xl py-2 text-xs font-bold transition ${
              activeTab === "preview"
                ? "bg-sky-500 text-slate-950 shadow"
                : "text-slate-400"
            }`}
          >
            Pratinjau Langsung
          </button>
          <button
            type="button"
            onClick={() => {
              triggerHaptic("light");
              setActiveTab("frozen");
            }}
            className={`rounded-xl py-2 text-xs font-bold transition ${
              activeTab === "frozen"
                ? "bg-sky-500 text-slate-950 shadow"
                : "text-slate-400"
            }`}
          >
            Leger Beku (Arsip)
          </button>
        </div>

        {/* Filter Controls */}
        <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-3 backdrop-blur-md space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="block text-[11px] font-medium text-slate-400 mb-1">
                Tahun Ajaran
              </span>
              <select
                value={selectedTa}
                onChange={(e) => setSelectedTa(e.target.value)}
                className="w-full text-xs rounded-xl px-2.5 py-2 bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                {tahunAjaranList.map((ta) => (
                  <option
                    key={String(ta.id_tahun_ajaran)}
                    value={String(ta.id_tahun_ajaran)}
                  >
                    {String(ta.tahun)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <span className="block text-[11px] font-medium text-slate-400 mb-1">
                Semester
              </span>
              <select
                value={selectedSemester}
                onChange={(e) => setSelectedSemester(e.target.value)}
                className="w-full text-xs rounded-xl px-2.5 py-2 bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                <option value="Ganjil">Semester Ganjil</option>
                <option value="Genap">Semester Genap</option>
              </select>
            </div>
          </div>

          <div>
            <span className="block text-[11px] font-medium text-slate-400 mb-1">
              Rombongan Belajar
            </span>
            <select
              value={selectedRombel}
              onChange={(e) => setSelectedRombel(e.target.value)}
              className="w-full text-xs rounded-xl px-2.5 py-2 bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
            >
              <option value="">Pilih Rombel...</option>
              {rombelList.map((r) => (
                <option key={String(r.id_rombel)} value={String(r.id_rombel)}>
                  {String(r.nama_rombel)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Tab 1: Pratinjau Langsung */}
        {activeTab === "preview" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs text-slate-400">
                Total Hari Efektif KBM:{" "}
                <strong className="text-sky-400">
                  {totalHariEfektif} hari
                </strong>
              </span>
              {canManage && selectedRombel && previewStudents.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic("light");
                    setShowFreezeConfirm(true);
                  }}
                  className="rounded-xl bg-sky-500 px-3 py-1.5 text-xs font-bold text-slate-950 active:scale-95 transition shadow"
                >
                  Bekukan Nilai Leger
                </button>
              )}
            </div>

            {loading ? (
              <div className="py-12 text-center text-slate-400">
                <Icon
                  name="refresh"
                  className="size-7 mx-auto animate-spin mb-2"
                />
                <p className="text-xs">
                  Menghitung pratinjau kehadiran siswa...
                </p>
              </div>
            ) : previewStudents.length === 0 ? (
              <div className="py-10 px-4 text-center rounded-2xl border border-dashed border-white/10 bg-slate-900/30 text-slate-400">
                <Icon
                  name="document"
                  className="size-8 mx-auto mb-2 opacity-50"
                />
                <p className="font-semibold text-xs text-slate-300">
                  Tidak ada data siswa untuk rombel ini.
                </p>
                <p className="text-[11px] text-slate-500 mt-1">
                  Pastikan anggota rombel telah didaftarkan dan presensi harian
                  telah berjalan.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {previewStudents.map((s, idx) => (
                  <div
                    key={s.id_siswa}
                    className="rounded-2xl border border-white/10 bg-slate-900/70 p-3.5 backdrop-blur-md space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-slate-400">
                            #{idx + 1}
                          </span>
                          <h4 className="font-bold text-sm text-white truncate">
                            {s.nama_lengkap}
                          </h4>
                        </div>
                        <p className="text-[11px] text-slate-400 font-mono">
                          NIS: {s.nis} · {s.nama_rombel || "-"}
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        <span
                          className={`text-sm font-black font-mono ${
                            s.persen_kehadiran >= 85
                              ? "text-emerald-400"
                              : s.persen_kehadiran >= 75
                                ? "text-amber-400"
                                : "text-rose-400"
                          }`}
                        >
                          {s.persen_kehadiran.toFixed(1)}%
                        </span>
                        <span className="block text-[10px] text-slate-400">
                          Kehadiran
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-6 gap-1 pt-1.5 border-t border-white/5 text-center">
                      <div className="bg-emerald-500/10 rounded-lg p-1">
                        <span className="block text-[9px] text-slate-400">
                          H
                        </span>
                        <span className="text-xs font-bold text-emerald-400">
                          {s.hadir}
                        </span>
                      </div>
                      <div className="bg-sky-500/10 rounded-lg p-1">
                        <span className="block text-[9px] text-slate-400">
                          I
                        </span>
                        <span className="text-xs font-bold text-sky-400">
                          {s.izin}
                        </span>
                      </div>
                      <div className="bg-amber-500/10 rounded-lg p-1">
                        <span className="block text-[9px] text-slate-400">
                          S
                        </span>
                        <span className="text-xs font-bold text-amber-400">
                          {s.sakit}
                        </span>
                      </div>
                      <div className="bg-rose-500/10 rounded-lg p-1">
                        <span className="block text-[9px] text-slate-400">
                          A
                        </span>
                        <span className="text-xs font-bold text-rose-400">
                          {s.alfa}
                        </span>
                      </div>
                      <div className="bg-purple-500/10 rounded-lg p-1">
                        <span className="block text-[9px] text-slate-400">
                          D
                        </span>
                        <span className="text-xs font-bold text-purple-400">
                          {s.dispensasi}
                        </span>
                      </div>
                      <div className="bg-slate-500/10 rounded-lg p-1">
                        <span className="block text-[9px] text-slate-400">
                          HE
                        </span>
                        <span className="text-xs font-bold text-slate-300">
                          {s.total_hari_efektif}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Leger Beku (Arsip Rapor) */}
        {activeTab === "frozen" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs text-slate-400">
                Data Arsip Rapor:{" "}
                <strong className="text-sky-400">
                  {frozenStudents.length} siswa
                </strong>
              </span>
              {canDelete && selectedRombel && frozenStudents.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic("warning");
                    setShowDeleteConfirm(true);
                  }}
                  className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-xs font-semibold text-rose-400 active:scale-95 transition"
                >
                  Hapus Arsip
                </button>
              )}
            </div>

            {loading ? (
              <div className="py-12 text-center text-slate-400">
                <Icon
                  name="refresh"
                  className="size-7 mx-auto animate-spin mb-2"
                />
                <p className="text-xs">Memuat arsip leger beku...</p>
              </div>
            ) : frozenStudents.length === 0 ? (
              <div className="py-10 px-4 text-center rounded-2xl border border-dashed border-white/10 bg-slate-900/30 text-slate-400">
                <Icon
                  name="document"
                  className="size-8 mx-auto mb-2 opacity-50"
                />
                <p className="font-semibold text-xs text-slate-300">
                  Belum ada leger beku untuk rombel ini.
                </p>
                <p className="text-[11px] text-slate-500 mt-1">
                  Buka tab Pratinjau Langsung dan tekan &quot;Bekukan Nilai
                  Leger&quot; untuk mengunci angka rapor.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {frozenStudents.map((s, idx) => (
                  <div
                    key={s.id_leger}
                    className="rounded-2xl border border-white/10 bg-slate-900/70 p-3.5 backdrop-blur-md space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-slate-400">
                            #{idx + 1}
                          </span>
                          <h4 className="font-bold text-sm text-white truncate">
                            {s.nama_lengkap}
                          </h4>
                        </div>
                        <p className="text-[11px] text-slate-400 font-mono">
                          NIS: {s.nis} · {s.nama_rombel || "-"}
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        <span
                          className={`text-sm font-black font-mono ${
                            s.persen_kehadiran >= 85
                              ? "text-emerald-400"
                              : s.persen_kehadiran >= 75
                                ? "text-amber-400"
                                : "text-rose-400"
                          }`}
                        >
                          {s.persen_kehadiran.toFixed(1)}%
                        </span>
                        <span className="block text-[10px] text-slate-400">
                          Terkunci
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-6 gap-1 pt-1.5 border-t border-white/5 text-center">
                      <div className="bg-emerald-500/10 rounded-lg p-1">
                        <span className="block text-[9px] text-slate-400">
                          H
                        </span>
                        <span className="text-xs font-bold text-emerald-400">
                          {s.hadir}
                        </span>
                      </div>
                      <div className="bg-sky-500/10 rounded-lg p-1">
                        <span className="block text-[9px] text-slate-400">
                          I
                        </span>
                        <span className="text-xs font-bold text-sky-400">
                          {s.izin}
                        </span>
                      </div>
                      <div className="bg-amber-500/10 rounded-lg p-1">
                        <span className="block text-[9px] text-slate-400">
                          S
                        </span>
                        <span className="text-xs font-bold text-amber-400">
                          {s.sakit}
                        </span>
                      </div>
                      <div className="bg-rose-500/10 rounded-lg p-1">
                        <span className="block text-[9px] text-slate-400">
                          A
                        </span>
                        <span className="text-xs font-bold text-rose-400">
                          {s.alfa}
                        </span>
                      </div>
                      <div className="bg-purple-500/10 rounded-lg p-1">
                        <span className="block text-[9px] text-slate-400">
                          D
                        </span>
                        <span className="text-xs font-bold text-purple-400">
                          {s.dispensasi}
                        </span>
                      </div>
                      <div className="bg-slate-500/10 rounded-lg p-1">
                        <span className="block text-[9px] text-slate-400">
                          HE
                        </span>
                        <span className="text-xs font-bold text-slate-300">
                          {s.total_hari_efektif}
                        </span>
                      </div>
                    </div>

                    <div className="pt-1.5 border-t border-white/5 text-[10px] text-slate-500 flex justify-between">
                      <span>Dibekukan: {s.dibekukan_at}</span>
                      <span>Oleh: {s.dibekukan_oleh}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Modal Konfirmasi Pembekuan */}
        {showFreezeConfirm && (
          <Modal
            isOpen={true}
            onClose={() => setShowFreezeConfirm(false)}
            title="Bekukan Leger Kehadiran"
          >
            <div className="space-y-4">
              <p className="text-xs text-slate-300">
                Apakah Anda yakin ingin membekukan nilai kehadiran rombel ini?
                Nilai kehadiran akan dikunci secara resmi untuk arsip rapor
                semester dan tidak akan terpengaruh oleh koreksi data di
                kemudian hari.
              </p>
              <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/20 text-xs text-sky-300">
                Nilai yang dibekukan mencakup persentase kehadiran gerbang,
                total alfa, dan jam bolos KBM seluruh siswa di kelas ini.
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowFreezeConfirm(false)}
                  className="px-3.5 py-2 text-xs font-semibold rounded-xl border border-white/10 text-slate-400 active:scale-95 transition"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => void handleFreeze()}
                  disabled={isSubmittingRef.current}
                  className="px-4 py-2 text-xs font-bold rounded-xl bg-sky-500 text-slate-950 shadow active:scale-95 transition disabled:opacity-50"
                >
                  Ya, Bekukan Sekarang
                </button>
              </div>
            </div>
          </Modal>
        )}

        {/* Modal Konfirmasi Hapus Arsip */}
        {showDeleteConfirm && (
          <Modal
            isOpen={true}
            onClose={() => setShowDeleteConfirm(false)}
            title="Konfirmasi Hapus Arsip Leger"
          >
            <div className="space-y-4">
              <p className="text-xs text-slate-300">
                Apakah Anda yakin ingin menghapus arsip leger beku rombel ini?
                Arsip nilai kehadiran yang terkunci akan dibatalkan sehingga
                memungkinkan penghitungan dan pembekuan ulang.
              </p>
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300">
                Tindakan ini memerlukan izin sensitif dan akan disinkronkan ke
                seluruh perangkat.
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-3.5 py-2 text-xs font-semibold rounded-xl border border-white/10 text-slate-400 active:scale-95 transition"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => void handleDeleteFrozen()}
                  disabled={isSubmittingRef.current}
                  className="px-4 py-2 text-xs font-bold rounded-xl bg-rose-600 text-white shadow active:scale-95 transition disabled:opacity-50"
                >
                  Hapus Arsip
                </button>
              </div>
            </div>
          </Modal>
        )}
      </div>
    </MobileAppShell>
  );
}
