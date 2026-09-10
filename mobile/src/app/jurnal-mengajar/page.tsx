"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MobileAppShell } from "@/components/MobileAppShell";
import { FeedbackBanner } from "@/components/ui/FeedbackBanner";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { canAccessArea, hasPermission } from "@/lib/auth/access";
import { triggerHaptic } from "@/lib/client/haptics";
import { useAuth } from "@/lib/context/AuthContext";
import { getDaftarMapel, getDaftarRombel } from "@/lib/gateways/academic";
import {
  type ClassAttendanceSession,
  getDaftarSesiPresensi,
} from "@/lib/gateways/class-attendance";
import { syncNow } from "@/lib/gateways/sync-status";
import { getDaftarGuru } from "@/lib/gateways/teacher";
import {
  deleteTeachingJournal,
  listTeachingJournals,
  saveTeachingJournal,
  type TeachingJournal,
} from "@/lib/gateways/teaching-journal";
import { useHydrated } from "@/lib/hooks/useHydrated";

export default function MobileJurnalMengajarPage() {
  const isHydrated = useHydrated();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const canManage = hasPermission(user, "teaching_journal.manage");
  const canDelete = hasPermission(user, "teaching_journal.delete");

  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error" | "warning";
    message: string;
  } | null>(null);

  // Master Filter Options
  const [rombelList, setRombelList] = useState<Record<string, unknown>[]>([]);
  const [mapelList, setMapelList] = useState<Record<string, unknown>[]>([]);
  const [guruList, setGuruList] = useState<Record<string, unknown>[]>([]);

  const [selectedRombel, setSelectedRombel] = useState<string>("");
  const [selectedMapel, setSelectedMapel] = useState<string>("");
  const [selectedGuru, setSelectedGuru] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  // Data
  const [sessions, setSessions] = useState<ClassAttendanceSession[]>([]);
  const [journals, setJournals] = useState<TeachingJournal[]>([]);

  // Modal State
  const [activeModal, setActiveModal] = useState<
    "create_or_edit" | "delete" | null
  >(null);
  const [targetSession, setTargetSession] =
    useState<ClassAttendanceSession | null>(null);
  const [targetJournal, setTargetJournal] = useState<TeachingJournal | null>(
    null,
  );

  // Form Inputs
  const [materiDisampaikan, setMateriDisampaikan] = useState("");
  const [kendala, setKendala] = useState("");
  const [tindakLanjut, setTindakLanjut] = useState("");
  const [parafNama, setParafNama] = useState("");
  const isSubmittingRef = useRef(false);

  // Client guard untuk Mobile static export
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/login");
    }
    if (
      isHydrated &&
      isAuthenticated &&
      !canAccessArea(user, "jurnal_mengajar")
    ) {
      router.replace("/dashboard");
    }
  }, [authLoading, isAuthenticated, isHydrated, user, router]);

  // Load master data filter
  const loadMasterData = useCallback(async () => {
    try {
      const [rData, mData, gData] = await Promise.all([
        getDaftarRombel(),
        getDaftarMapel(),
        getDaftarGuru(),
      ]);
      setRombelList(rData || []);
      setMapelList(mData || []);
      setGuruList(gData || []);
    } catch {
      // Abaikan galat master
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      void loadMasterData();
    }
  }, [isAuthenticated, loadMasterData]);

  // Load Sessions & Journals
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [sessionData, journalData] = await Promise.all([
        getDaftarSesiPresensi({
          id_rombel: selectedRombel || undefined,
          id_mapel: selectedMapel || undefined,
          id_guru: selectedGuru || undefined,
          start_date: startDate || undefined,
          end_date: endDate || undefined,
        }),
        listTeachingJournals({
          id_rombel: selectedRombel || undefined,
          id_mapel: selectedMapel || undefined,
          id_guru: selectedGuru || undefined,
          tanggal_mulai: startDate || undefined,
          tanggal_selesai: endDate || undefined,
        }),
      ]);
      setSessions(sessionData || []);
      setJournals(journalData || []);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Gagal memuat data jurnal.";
      setFeedback({ type: "error", message: msg });
    } finally {
      setLoading(false);
    }
  }, [selectedRombel, selectedMapel, selectedGuru, startDate, endDate]);

  useEffect(() => {
    if (isAuthenticated) {
      void loadData();
    }
  }, [isAuthenticated, loadData]);

  // Background sync listener
  useEffect(() => {
    const onSyncCompleted = () => {
      void loadData();
    };
    window.addEventListener("sppg:sync-completed", onSyncCompleted);
    return () => {
      window.removeEventListener("sppg:sync-completed", onSyncCompleted);
    };
  }, [loadData]);

  const handleRefresh = async () => {
    triggerHaptic("light");
    try {
      await syncNow();
    } catch {
      // Abaikan galat sinkronisasi sementara
    }
    await loadData();
    setFeedback({
      type: "success",
      message: "Data jurnal berhasil dimuat ulang.",
    });
  };

  const journalMap = useMemo(() => {
    const map = new Map<string, TeachingJournal>();
    for (const j of journals) {
      map.set(j.id_presensi_mapel, j);
    }
    return map;
  }, [journals]);

  const handleOpenForm = (
    session: ClassAttendanceSession,
    existing?: TeachingJournal,
  ) => {
    triggerHaptic("light");
    setTargetSession(session);
    setTargetJournal(existing || null);
    setMateriDisampaikan(existing?.materi_disampaikan || "");
    setKendala(existing?.kendala || "");
    setTindakLanjut(existing?.tindak_lanjut || "");
    setParafNama(
      existing?.paraf_nama || session.nama_guru || user?.nama_operator || "",
    );
    setActiveModal("create_or_edit");
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingRef.current || !targetSession) return;

    if (!materiDisampaikan.trim()) {
      setFeedback({
        type: "warning",
        message: "Materi yang disampaikan wajib diisi.",
      });
      return;
    }

    isSubmittingRef.current = true;
    try {
      await saveTeachingJournal({
        id_jurnal: targetJournal?.id_jurnal,
        id_presensi_mapel: targetSession.id_presensi_mapel,
        materi_disampaikan: materiDisampaikan.trim(),
        kendala: kendala.trim() || null,
        tindak_lanjut: tindakLanjut.trim() || null,
        paraf_nama: parafNama.trim() || null,
      });
      triggerHaptic("success");
      setActiveModal(null);
      setFeedback({
        type: "success",
        message: "Jurnal mengajar dan paraf digital berhasil disimpan.",
      });
      await loadData();
    } catch (err: unknown) {
      triggerHaptic("error");
      const msg =
        err instanceof Error ? err.message : "Gagal menyimpan jurnal mengajar.";
      setFeedback({ type: "error", message: msg });
    } finally {
      isSubmittingRef.current = false;
    }
  };

  const handleDelete = async () => {
    if (isSubmittingRef.current || !targetJournal) return;
    isSubmittingRef.current = true;
    try {
      await deleteTeachingJournal(targetJournal.id_jurnal);
      triggerHaptic("success");
      setActiveModal(null);
      setFeedback({
        type: "success",
        message: "Catatan jurnal mengajar berhasil dihapus.",
      });
      await loadData();
    } catch (err: unknown) {
      triggerHaptic("error");
      const msg =
        err instanceof Error ? err.message : "Gagal menghapus jurnal.";
      setFeedback({ type: "error", message: msg });
    } finally {
      isSubmittingRef.current = false;
    }
  };

  if (!isAuthenticated || !canAccessArea(user, "jurnal_mengajar")) {
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
            <h1 className="text-base font-bold text-white">Jurnal Mengajar</h1>
            <p className="text-xs text-slate-400">
              Catatan KBM &amp; Paraf Digital Guru
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

        {/* Filter Controls */}
        <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-3 backdrop-blur-md space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="block text-[11px] font-medium text-slate-400 mb-1">
                Rombel
              </span>
              <select
                aria-label="Rombongan belajar"
                value={selectedRombel}
                onChange={(e) => setSelectedRombel(e.target.value)}
                className="w-full text-xs rounded-xl px-2.5 py-2 bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                <option value="">Semua Rombel</option>
                {rombelList.map((r) => (
                  <option key={String(r.id_rombel)} value={String(r.id_rombel)}>
                    {String(r.nama_rombel)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <span className="block text-[11px] font-medium text-slate-400 mb-1">
                Mata Pelajaran
              </span>
              <select
                aria-label="Mata pelajaran"
                value={selectedMapel}
                onChange={(e) => setSelectedMapel(e.target.value)}
                className="w-full text-xs rounded-xl px-2.5 py-2 bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                <option value="">Semua Mapel</option>
                {mapelList.map((m) => (
                  <option key={String(m.id_mapel)} value={String(m.id_mapel)}>
                    {String(m.nama_mapel)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <span className="block text-[11px] font-medium text-slate-400 mb-1">
                Guru Pengampu
              </span>
              <select
                aria-label="Guru pengampu"
                value={selectedGuru}
                onChange={(e) => setSelectedGuru(e.target.value)}
                className="w-full text-xs rounded-xl px-2.5 py-2 bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                <option value="">Semua Guru</option>
                {guruList.map((g) => (
                  <option key={String(g.id_guru)} value={String(g.id_guru)}>
                    {String(g.nama || g.nama_guru)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <span className="block text-[11px] font-medium text-slate-400 mb-1">
                Tanggal Mulai
              </span>
              <input
                aria-label="Tanggal mulai"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full text-xs rounded-xl px-2.5 py-2 bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>

            <div>
              <span className="block text-[11px] font-medium text-slate-400 mb-1">
                Tanggal Selesai
              </span>
              <input
                aria-label="Tanggal selesai"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full text-xs rounded-xl px-2.5 py-2 bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>
          </div>
        </div>

        {/* Sessions & Journal List */}
        {loading ? (
          <div className="py-12 text-center text-slate-400">
            <Icon name="refresh" className="size-7 mx-auto animate-spin mb-2" />
            <p className="text-xs">Memuat sesi KBM &amp; jurnal...</p>
          </div>
        ) : sessions.length === 0 ? (
          <div className="py-10 px-4 text-center rounded-2xl border border-dashed border-white/10 bg-slate-900/30 text-slate-400">
            <Icon name="document" className="size-8 mx-auto mb-2 opacity-50" />
            <p className="font-semibold text-xs text-slate-300">
              Tidak ada sesi presensi KBM ditemukan.
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              Jurnal mengajar dapat diisi setelah sesi presensi pelajaran dibuat
              di menu Presensi KBM.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {sessions.map((session) => {
              const journal = journalMap.get(session.id_presensi_mapel);
              const isFilled = Boolean(journal);

              return (
                <div
                  key={session.id_presensi_mapel}
                  className="rounded-2xl border border-white/10 bg-slate-900/70 p-3.5 backdrop-blur-md space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2 pb-2 border-b border-white/5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-sky-500/20 text-sky-400 border border-sky-500/30">
                          {session.nama_rombel}
                        </span>
                        <h3 className="font-bold text-sm text-slate-100 truncate">
                          {session.nama_mapel}
                        </h3>
                        <span className="text-[10px] text-slate-400">
                          (Jam {session.jam_ke})
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1 truncate">
                        Pengampu:{" "}
                        <strong className="text-slate-300">
                          {session.nama_guru}
                        </strong>{" "}
                        · {session.tanggal}
                      </p>
                    </div>

                    <div className="shrink-0">
                      {isFilled ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          <Icon name="check" className="size-3" />
                          Diparaf
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                          <Icon name="clock" className="size-3" />
                          Belum
                        </span>
                      )}
                    </div>
                  </div>

                  {session.materi_pokok ? (
                    <div className="text-[11px] text-slate-400">
                      <span className="font-semibold text-slate-300">
                        Rencana Materi:
                      </span>{" "}
                      {session.materi_pokok}
                    </div>
                  ) : null}

                  {isFilled && journal ? (
                    <div className="space-y-2 pt-1 text-xs bg-slate-950/50 p-2.5 rounded-xl border border-white/5">
                      <div>
                        <span className="block text-[10px] font-semibold text-slate-400">
                          Materi Tersampaikan:
                        </span>
                        <p className="text-slate-200 whitespace-pre-line mt-0.5">
                          {journal.materi_disampaikan || "-"}
                        </p>
                      </div>

                      {journal.kendala ? (
                        <div>
                          <span className="block text-[10px] font-semibold text-slate-400">
                            Kendala:
                          </span>
                          <p className="text-slate-300 whitespace-pre-line mt-0.5">
                            {journal.kendala}
                          </p>
                        </div>
                      ) : null}

                      {journal.tindak_lanjut ? (
                        <div>
                          <span className="block text-[10px] font-semibold text-slate-400">
                            Tindak Lanjut:
                          </span>
                          <p className="text-slate-300 whitespace-pre-line mt-0.5">
                            {journal.tindak_lanjut}
                          </p>
                        </div>
                      ) : null}

                      <div className="pt-2 border-t border-white/5 flex flex-col gap-0.5 text-[10px] text-slate-400">
                        <div>
                          Paraf:{" "}
                          <strong className="text-slate-200">
                            {journal.paraf_nama || "-"}
                          </strong>
                        </div>
                        <div>
                          Operator:{" "}
                          <span className="text-slate-300">
                            {journal.paraf_operator}
                          </span>{" "}
                          · Waktu:{" "}
                          <span className="text-slate-300">
                            {journal.paraf_at}
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {/* Actions */}
                  <div className="flex items-center justify-end gap-2 pt-1">
                    {canManage ? (
                      <button
                        type="button"
                        onClick={() => handleOpenForm(session, journal)}
                        className="rounded-xl bg-sky-500 px-3 py-1.5 text-xs font-bold text-slate-950 active:scale-95 transition shadow"
                      >
                        {isFilled ? "Sunting Jurnal" : "Tulis Jurnal"}
                      </button>
                    ) : null}

                    {isFilled && canDelete ? (
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic("warning");
                          setTargetJournal(journal || null);
                          setActiveModal("delete");
                        }}
                        className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-1.5 text-rose-400 active:scale-95 transition"
                        title="Hapus Jurnal"
                      >
                        <Icon name="trash" className="size-4" />
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Modal Tulis / Sunting Jurnal */}
        {activeModal === "create_or_edit" && targetSession ? (
          <Modal
            isOpen={true}
            onClose={() => setActiveModal(null)}
            title={
              targetJournal
                ? "Sunting Jurnal Mengajar"
                : "Tulis Jurnal Mengajar"
            }
          >
            <form onSubmit={handleSave} className="space-y-3.5">
              <div className="p-2.5 rounded-xl bg-slate-900/90 border border-white/10 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-400">Kelas:</span>
                  <span className="font-semibold text-slate-200">
                    {targetSession.nama_rombel}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Mapel:</span>
                  <span className="font-semibold text-slate-200">
                    {targetSession.nama_mapel}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Guru / Waktu:</span>
                  <span className="font-semibold text-slate-200 truncate max-w-[200px]">
                    {targetSession.nama_guru} · Jam {targetSession.jam_ke}
                  </span>
                </div>
              </div>

              <div>
                <label
                  htmlFor="mobile-materi-disampaikan"
                  className="block text-xs font-medium text-slate-300 mb-1"
                >
                  Materi yang Tersampaikan{" "}
                  <span className="text-rose-400">*</span>
                </label>
                <textarea
                  id="mobile-materi-disampaikan"
                  rows={3}
                  required
                  value={materiDisampaikan}
                  onChange={(e) => setMateriDisampaikan(e.target.value)}
                  placeholder="Cakupan materi yang selesai diajarkan pada sesi ini..."
                  className="w-full text-xs rounded-xl px-3 py-2 bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </div>

              <div>
                <label
                  htmlFor="mobile-kendala-kelas"
                  className="block text-xs font-medium text-slate-300 mb-1"
                >
                  Kendala Kelas (Opsional)
                </label>
                <textarea
                  id="mobile-kendala-kelas"
                  rows={2}
                  value={kendala}
                  onChange={(e) => setKendala(e.target.value)}
                  placeholder="Kendala siswa, media pembelajaran, fasilitas..."
                  className="w-full text-xs rounded-xl px-3 py-2 bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </div>

              <div>
                <label
                  htmlFor="mobile-tindak-lanjut"
                  className="block text-xs font-medium text-slate-300 mb-1"
                >
                  Tindak Lanjut (Opsional)
                </label>
                <textarea
                  id="mobile-tindak-lanjut"
                  rows={2}
                  value={tindakLanjut}
                  onChange={(e) => setTindakLanjut(e.target.value)}
                  placeholder="Rencana remedial, penugasan, koordinasi BK..."
                  className="w-full text-xs rounded-xl px-3 py-2 bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </div>

              <div className="p-3 rounded-xl bg-slate-900/90 border border-white/10 space-y-2">
                <div className="flex items-center gap-2">
                  <Icon name="check" className="size-4 text-sky-400" />
                  <span className="text-xs font-bold text-slate-200">
                    Paraf Digital Otomatis
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Paraf digital disimpan sebagai bukti autentik lengkap dengan
                  identitas operator login dan stempel waktu sistem.
                </p>

                <div>
                  <label
                    htmlFor="mobile-paraf-nama"
                    className="block text-[11px] font-medium text-slate-400 mb-1"
                  >
                    Nama Penandatangan / Pengampu
                  </label>
                  <input
                    id="mobile-paraf-nama"
                    type="text"
                    value={parafNama}
                    onChange={(e) => setParafNama(e.target.value)}
                    placeholder="Nama lengkap guru penandatangan"
                    className="w-full text-xs rounded-xl px-2.5 py-1.5 bg-slate-950 border border-slate-700 text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="px-3.5 py-2 text-xs font-semibold rounded-xl border border-white/10 text-slate-400 active:scale-95 transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingRef.current}
                  className="px-4 py-2 text-xs font-bold rounded-xl bg-sky-500 text-slate-950 shadow active:scale-95 transition disabled:opacity-50"
                >
                  Simpan Jurnal &amp; Paraf
                </button>
              </div>
            </form>
          </Modal>
        ) : null}

        {/* Modal Hapus Jurnal */}
        {activeModal === "delete" && targetJournal ? (
          <Modal
            isOpen={true}
            onClose={() => setActiveModal(null)}
            title="Konfirmasi Hapus Jurnal"
          >
            <div className="space-y-4">
              <p className="text-xs text-slate-300">
                Apakah Anda yakin ingin menghapus catatan jurnal mengajar ini?
                Catatan materi dan paraf digital sesi ini akan dibatalkan.
              </p>
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300">
                Tindakan ini memerlukan izin sensitif dan akan disinkronkan ke
                seluruh perangkat.
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="px-3.5 py-2 text-xs font-semibold rounded-xl border border-white/10 text-slate-400 active:scale-95 transition"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete()}
                  disabled={isSubmittingRef.current}
                  className="px-4 py-2 text-xs font-bold rounded-xl bg-rose-600 text-white shadow active:scale-95 transition disabled:opacity-50"
                >
                  Hapus Jurnal
                </button>
              </div>
            </div>
          </Modal>
        ) : null}
      </div>
    </MobileAppShell>
  );
}
