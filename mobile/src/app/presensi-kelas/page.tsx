"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MobileAppShell } from "@/components/MobileAppShell";
import { FeedbackBanner } from "@/components/ui/FeedbackBanner";
import { Icon } from "@/components/ui/Icon";
import { formatTanggalOperasional } from "@/lib/attendance/time-policy";
import { canAccessArea, hasPermission } from "@/lib/auth/access";
import { triggerHaptic } from "@/lib/client/haptics";
import { useAuth } from "@/lib/context/AuthContext";
import {
  getDaftarMapel,
  getDaftarRombel,
  getDaftarTahunAjaran,
} from "@/lib/gateways/academic";
import {
  type AttendanceAnomalyItem,
  type ClassAttendanceSession,
  getDaftarSesiPresensi,
  getRekonsiliasiPresensi,
  getRosterUntukPresensi,
  type StudentAttendanceDetailItem,
  saveClassAttendance,
} from "@/lib/gateways/class-attendance";
import { syncNow } from "@/lib/gateways/sync-status";
import { getDaftarGuru } from "@/lib/gateways/teacher";
import { useConfirmDialog } from "@/lib/hooks/useConfirmDialog";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { normalizeOperatorPhone } from "@/lib/operators/contact";
import {
  buildParentNotificationText,
  buildPresentWithoutGateScanWarning,
  hasUnsavedAttendanceMarks,
} from "@/lib/validations/class-attendance";

type TabKey = "input" | "reconciliation" | "history";

export default function MobilePresensiKelasPage() {
  const isHydrated = useHydrated();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const canManage = hasPermission(user, "class_attendance.manage");

  const [activeTab, setActiveTab] = useState<TabKey>("input");
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error" | "warning";
    message: string;
  } | null>(null);

  // Master options
  const [rombelList, setRombelList] = useState<Record<string, unknown>[]>([]);
  const [mapelList, setMapelList] = useState<Record<string, unknown>[]>([]);
  const [guruList, setGuruList] = useState<Record<string, unknown>[]>([]);

  // Input Form States
  const [selectedTa, setSelectedTa] = useState<string>("");
  const [selectedRombel, setSelectedRombel] = useState<string>("");
  const [selectedMapel, setSelectedMapel] = useState<string>("");
  const [selectedGuru, setSelectedGuru] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>(
    formatTanggalOperasional(new Date()),
  );
  const [selectedJamKe, setSelectedJamKe] = useState<string>("1-2");
  const [materiPokok, setMateriPokok] = useState<string>("");

  // Roster items for active input session
  const [rosterItems, setRosterItems] = useState<StudentAttendanceDetailItem[]>(
    [],
  );
  const [savingAttendance, setSavingAttendance] = useState(false);
  // Penjaga balapan wajib (AGENTS.md aturan 5). `savingAttendance` adalah
  // state React yang baru berlaku setelah render berikutnya, sehingga ketukan
  // ganda — sangat mudah terjadi di layar sentuh — bisa memicu dua penyimpanan
  // sebelum tombolnya sempat nonaktif. Pada jalur Web kedua permintaan itu bisa
  // sama-sama lolos pemeriksaan duplikat dan membuat DUA sesi.
  const isSubmittingRef = useRef(false);
  const { konfirmasi, dialogKonfirmasi } = useConfirmDialog();

  // Pilihan filter dibaca `loadMasterData` lewat REF, bukan lewat dependency.
  // Menjadikannya dependency membuat callback-nya lahir ulang setiap kali
  // dropdown diubah, dan efek pemuatan di bawah ikut menarik ULANG keempat
  // daftar master hanya untuk mengganti satu filter — empat perjalanan bolak-
  // balik yang datanya tidak berubah sama sekali. Pada pemuatan pertama pun
  // callback ini menulis ketiga state itu, sehingga efeknya berjalan berkali-
  // kali sebelum akhirnya tenang.
  const selectedRombelRef = useRef(selectedRombel);
  const selectedMapelRef = useRef(selectedMapel);
  const selectedGuruRef = useRef(selectedGuru);
  useEffect(() => {
    selectedRombelRef.current = selectedRombel;
    selectedMapelRef.current = selectedMapel;
    selectedGuruRef.current = selectedGuru;
  });

  // Reconciliation states
  const [reconDate, setReconDate] = useState<string>(
    formatTanggalOperasional(new Date()),
  );
  const [reconRombel, setReconRombel] = useState<string>("");
  const [anomalies, setAnomalies] = useState<AttendanceAnomalyItem[]>([]);
  const [loadingRecon, setLoadingRecon] = useState(false);

  // History states
  const [historyList, setHistoryList] = useState<ClassAttendanceSession[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Load master dropdown options
  const loadMasterData = useCallback(async () => {
    try {
      const [taData, rombelData, mapelData, guruData] = await Promise.all([
        getDaftarTahunAjaran(),
        getDaftarRombel(),
        getDaftarMapel(),
        getDaftarGuru(),
      ]);

      setRombelList(rombelData);
      setMapelList(mapelData);
      setGuruList(guruData);

      const activeTa = taData.find(
        (ta) => ta.is_aktif === 1 || ta.is_aktif === "1",
      );
      if (activeTa) setSelectedTa(String(activeTa.id_tahun_ajaran));
      else if (taData.length > 0)
        setSelectedTa(String(taData[0]?.id_tahun_ajaran));

      if (rombelData.length > 0 && !selectedRombelRef.current)
        setSelectedRombel(String(rombelData[0]?.id_rombel));
      if (mapelData.length > 0 && !selectedMapelRef.current)
        setSelectedMapel(String(mapelData[0]?.id_mapel));
      if (guruData.length > 0 && !selectedGuruRef.current)
        setSelectedGuru(String(guruData[0]?.id_guru));
    } catch {
      setFeedback({
        tone: "error",
        message: "Gagal memuat data master akademik.",
      });
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    void loadMasterData();
  }, [isAuthenticated, loadMasterData]);

  // Load roster students for input session
  const handleLoadRoster = useCallback(async () => {
    if (!selectedRombel || !selectedDate) {
      setFeedback({
        tone: "warning",
        message: "Pilih rombel dan tanggal terlebih dahulu.",
      });
      return;
    }

    // Memuat ulang mengembalikan SELURUH siswa ke status bawaan dan menghapus
    // sesi yang sedang disunting. Hanya ditanyakan bila memang ada yang hilang.
    if (
      hasUnsavedAttendanceMarks(rosterItems) &&
      !(await konfirmasi({
        title: "Muat ulang roster?",
        description:
          "Tanda kehadiran yang belum disimpan akan hilang dan seluruh siswa kembali ke status bawaan.",
        preserved: "Presensi yang sudah tersimpan sebelumnya tidak berubah.",
        confirmLabel: "Ya, muat ulang",
        tone: "warning",
      }))
    ) {
      return;
    }

    setLoading(true);
    setFeedback(null);
    triggerHaptic("light");
    try {
      const roster = await getRosterUntukPresensi(selectedRombel, selectedDate);
      setRosterItems(roster);
      if (roster.length === 0) {
        setFeedback({
          tone: "warning",
          message: "Belum ada siswa aktif terdaftar di rombel ini.",
        });
      }
    } catch (err: unknown) {
      setFeedback({
        tone: "error",
        message:
          err instanceof Error ? err.message : "Gagal memuat roster siswa.",
      });
    } finally {
      setLoading(false);
    }
  }, [selectedRombel, selectedDate, rosterItems, konfirmasi]);

  // Load reconciliation anomalies
  const handleLoadReconciliation = useCallback(async () => {
    setLoadingRecon(true);
    setFeedback(null);
    try {
      const res = await getRekonsiliasiPresensi({
        tanggal: reconDate || undefined,
        id_rombel: reconRombel || undefined,
      });
      setAnomalies(res.anomalies);
    } catch (err: unknown) {
      setFeedback({
        tone: "error",
        message:
          err instanceof Error ? err.message : "Gagal memuat rekonsiliasi.",
      });
    } finally {
      setLoadingRecon(false);
    }
  }, [reconDate, reconRombel]);

  // Load session history
  const handleLoadHistory = useCallback(async () => {
    setLoadingHistory(true);
    setFeedback(null);
    try {
      const sessions = await getDaftarSesiPresensi({ limit: 50 });
      setHistoryList(sessions);
    } catch (err: unknown) {
      setFeedback({
        tone: "error",
        message:
          err instanceof Error ? err.message : "Gagal memuat riwayat presensi.",
      });
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "reconciliation") void handleLoadReconciliation();
    else if (activeTab === "history") void handleLoadHistory();
  }, [activeTab, handleLoadReconciliation, handleLoadHistory]);

  const metrics = useMemo(() => {
    let hadir = 0;
    let izin = 0;
    let sakit = 0;
    let alfa = 0;
    let dispensasi = 0;

    for (const item of rosterItems) {
      if (item.status === "Hadir") hadir++;
      else if (item.status === "Izin") izin++;
      else if (item.status === "Sakit") sakit++;
      else if (item.status === "Alfa") alfa++;
      else if (item.status === "Dispensasi") dispensasi++;
    }

    return { total: rosterItems.length, hadir, izin, sakit, alfa, dispensasi };
  }, [rosterItems]);

  const updateStudentStatus = (
    idSiswa: string,
    status: "Hadir" | "Izin" | "Sakit" | "Alfa" | "Dispensasi",
  ) => {
    triggerHaptic("light");
    setRosterItems((prev) =>
      prev.map((item) =>
        item.id_siswa === idSiswa ? { ...item, status } : item,
      ),
    );
  };

  const handleMarkAllHadir = () => {
    triggerHaptic("success");
    setRosterItems((prev) =>
      prev.map((item) => ({ ...item, status: "Hadir" })),
    );
  };

  const handleSaveAttendance = async () => {
    if (
      !selectedTa ||
      !selectedRombel ||
      !selectedMapel ||
      !selectedGuru ||
      !selectedDate ||
      !selectedJamKe
    ) {
      setFeedback({
        tone: "warning",
        message: "Lengkapi informasi rombel, mapel, dan tanggal.",
      });
      return;
    }

    if (rosterItems.length === 0) {
      setFeedback({
        tone: "warning",
        message: "Roster siswa belum dimuat.",
      });
      return;
    }

    // Seluruh roster berstatus Hadir secara bawaan, jadi menyimpan tanpa
    // memeriksa akan menandai hadir siswa yang benar-benar tidak masuk.
    // Peringatan ini tidak pernah mengubah status siapa pun — gurunya yang
    // memutuskan.
    const peringatan = buildPresentWithoutGateScanWarning(rosterItems);
    if (
      peringatan &&
      !(await konfirmasi({
        title: "Simpan presensi ini?",
        description: peringatan,
        preserved:
          "Peringatan ini tidak mengubah status siapa pun — keputusannya tetap di tangan guru.",
        confirmLabel: "Ya, simpan",
        tone: "warning",
      }))
    ) {
      return;
    }

    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setSavingAttendance(true);
    setFeedback(null);
    triggerHaptic("light");

    try {
      const draft = {
        id_tahun_ajaran: selectedTa,
        id_rombel: selectedRombel,
        id_mapel: selectedMapel,
        id_guru: selectedGuru,
        tanggal: selectedDate,
        jam_ke: selectedJamKe,
        materi_pokok: materiPokok || null,
        items: rosterItems.map((item) => ({
          id_siswa: item.id_siswa,
          status: item.status,
          catatan: item.catatan || null,
        })),
      };

      await saveClassAttendance(draft);
      triggerHaptic("success");
      setFeedback({
        tone: "success",
        message: "Presensi kelas KBM berhasil disimpan.",
      });
    } catch (err: unknown) {
      triggerHaptic("error");
      setFeedback({
        tone: "error",
        message:
          err instanceof Error
            ? err.message
            : "Gagal menyimpan presensi kelas.",
      });
    } finally {
      isSubmittingRef.current = false;
      setSavingAttendance(false);
    }
  };

  const getWhatsAppLink = (item: AttendanceAnomalyItem) => {
    if (!item.no_whatsapp_wali) return null;
    const normalized = normalizeOperatorPhone(item.no_whatsapp_wali);
    if (!normalized) return null;

    const cleanNumber = normalized.replace("+", "");
    // Teks dibedakan per jenis anomali di satu tempat bersama; dua anomali
    // rekonsiliasi artinya berlawanan dan tidak boleh memakai kalimat sama.
    const text = encodeURIComponent(buildParentNotificationText(item));

    return `https://wa.me/${cleanNumber}?text=${text}`;
  };

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/login");
    }
    if (
      isHydrated &&
      isAuthenticated &&
      !canAccessArea(user, "presensi_kelas")
    ) {
      router.replace("/dashboard");
    }
  }, [authLoading, isAuthenticated, isHydrated, user, router]);

  if (!isAuthenticated || !canAccessArea(user, "presensi_kelas")) {
    return null;
  }

  return (
    <MobileAppShell>
      <div className="space-y-4 pb-16">
        {feedback ? (
          <FeedbackBanner
            type={feedback.tone}
            message={feedback.message}
            onClose={() => setFeedback(null)}
          />
        ) : null}

        {/* Header Actions */}
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-400">
            Presensi Mapel & Deteksi Anomali
          </p>
          <button
            type="button"
            onClick={async () => {
              triggerHaptic("light");
              setFeedback(null);
              await syncNow().catch(() => undefined);
              if (activeTab === "reconciliation")
                void handleLoadReconciliation();
              else if (activeTab === "history") void handleLoadHistory();
              else void loadMasterData();
            }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-slate-900/80 px-2.5 py-1.5 text-xs font-semibold text-slate-300 active:scale-95"
          >
            <Icon name="refresh" className="size-3.5" />
            <span>Muat Ulang</span>
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="grid grid-cols-3 gap-1 rounded-2xl border border-white/10 bg-slate-900/80 p-1">
          <button
            type="button"
            onClick={() => {
              triggerHaptic("light");
              setActiveTab("input");
            }}
            className={`rounded-xl py-2 text-xs font-bold transition ${
              activeTab === "input"
                ? "bg-sky-500 text-slate-950 shadow"
                : "text-slate-400"
            }`}
          >
            Input KBM
          </button>
          <button
            type="button"
            onClick={() => {
              triggerHaptic("light");
              setActiveTab("reconciliation");
            }}
            className={`rounded-xl py-2 text-xs font-bold transition relative ${
              activeTab === "reconciliation"
                ? "bg-rose-500 text-white shadow"
                : "text-slate-400"
            }`}
          >
            Deteksi Bolos
            {anomalies.length > 0 ? (
              <span className="ml-1 rounded-full bg-rose-950 px-1.5 py-0.2 text-[9px] font-black text-rose-300">
                {anomalies.length}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            onClick={() => {
              triggerHaptic("light");
              setActiveTab("history");
            }}
            className={`rounded-xl py-2 text-xs font-bold transition ${
              activeTab === "history"
                ? "bg-emerald-500 text-slate-950 shadow"
                : "text-slate-400"
            }`}
          >
            Riwayat
          </button>
        </div>

        {/* TAB 1: INPUT PRESENSI KBM */}
        {activeTab === "input" ? (
          <div className="space-y-4">
            {/* Header Form Card */}
            <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 space-y-3">
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label
                    htmlFor="mobile-input-rombel"
                    className="block text-[10px] font-semibold text-slate-400 uppercase mb-1"
                  >
                    Rombel
                  </label>
                  <select
                    id="mobile-input-rombel"
                    value={selectedRombel}
                    onChange={(e) => setSelectedRombel(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-2.5 py-2 text-xs font-semibold text-white outline-none"
                  >
                    {rombelList.map((r) => (
                      <option
                        key={String(r.id_rombel)}
                        value={String(r.id_rombel)}
                        className="bg-slate-900 text-white"
                      >
                        {String(r.nama_rombel)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="mobile-input-mapel"
                    className="block text-[10px] font-semibold text-slate-400 uppercase mb-1"
                  >
                    Mata Pelajaran
                  </label>
                  <select
                    id="mobile-input-mapel"
                    value={selectedMapel}
                    onChange={(e) => setSelectedMapel(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-2.5 py-2 text-xs font-semibold text-white outline-none"
                  >
                    {mapelList.map((m) => (
                      <option
                        key={String(m.id_mapel)}
                        value={String(m.id_mapel)}
                        className="bg-slate-900 text-white"
                      >
                        {String(m.nama_mapel)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="mobile-input-date"
                    className="block text-[10px] font-semibold text-slate-400 uppercase mb-1"
                  >
                    Tanggal
                  </label>
                  <input
                    id="mobile-input-date"
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-2.5 py-2 text-xs font-semibold text-white outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="mobile-input-jam"
                    className="block text-[10px] font-semibold text-slate-400 uppercase mb-1"
                  >
                    Jam Pelajaran
                  </label>
                  <select
                    id="mobile-input-jam"
                    value={selectedJamKe}
                    onChange={(e) => setSelectedJamKe(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-2.5 py-2 text-xs font-semibold text-white outline-none"
                  >
                    <option value="1">Jam ke-1</option>
                    <option value="2">Jam ke-2</option>
                    <option value="3">Jam ke-3</option>
                    <option value="4">Jam ke-4</option>
                    <option value="1-2">Jam ke 1-2</option>
                    <option value="3-4">Jam ke 3-4</option>
                    <option value="5-6">Jam ke 5-6</option>
                    <option value="7-8">Jam ke 7-8</option>
                  </select>
                </div>

                <div className="col-span-2">
                  <label
                    htmlFor="mobile-input-guru"
                    className="block text-[10px] font-semibold text-slate-400 uppercase mb-1"
                  >
                    Guru Pengampu
                  </label>
                  <select
                    id="mobile-input-guru"
                    value={selectedGuru}
                    onChange={(e) => setSelectedGuru(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-2.5 py-2 text-xs font-semibold text-white outline-none"
                  >
                    {guruList.map((g) => (
                      <option
                        key={String(g.id_guru)}
                        value={String(g.id_guru)}
                        className="bg-slate-900 text-white"
                      >
                        {String(g.nama_guru || g.nama || "Guru")}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <input
                  aria-label="Materi pokok pembelajaran"
                  type="text"
                  value={materiPokok}
                  onChange={(e) => setMateriPokok(e.target.value)}
                  placeholder="Materi pokok pembelajaran (opsional)..."
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-500 outline-none"
                />
              </div>

              <button
                type="button"
                onClick={handleLoadRoster}
                disabled={loading}
                className="w-full rounded-xl bg-sky-500 py-2.5 text-xs font-black text-slate-950 shadow transition active:scale-[0.98] disabled:opacity-50"
              >
                {loading ? "Memuat..." : "Tampilkan Roster Siswa"}
              </button>
            </div>

            {/* Roster List Card */}
            {rosterItems.length > 0 ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-900/80 p-3">
                  <div className="flex items-center gap-2 font-mono text-[11px]">
                    <span className="text-emerald-400 font-bold">
                      H:{metrics.hadir}
                    </span>
                    <span className="text-sky-400 font-bold">
                      I:{metrics.izin}
                    </span>
                    <span className="text-amber-400 font-bold">
                      S:{metrics.sakit}
                    </span>
                    <span className="text-rose-400 font-bold">
                      A:{metrics.alfa}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleMarkAllHadir}
                    className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold text-emerald-300"
                  >
                    Semua Hadir
                  </button>
                </div>

                <div className="space-y-2">
                  {rosterItems.map((item) => (
                    <div
                      key={item.id_siswa}
                      className="rounded-2xl border border-white/10 bg-slate-900/60 p-3.5 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-bold text-sm text-white leading-tight">
                            {item.nama_lengkap}
                          </p>
                          <p className="text-[10px] font-mono text-slate-400 mt-0.5">
                            NIS: {item.nis || "-"} · L/P:{" "}
                            {item.jenis_kelamin || "-"}
                          </p>
                        </div>
                        {item.jam_masuk ? (
                          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-300 font-mono">
                            {item.jam_masuk}
                          </span>
                        ) : (
                          <span className="rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400">
                            Belum Scan
                          </span>
                        )}
                      </div>

                      {/* Quick Status Buttons */}
                      <div className="grid grid-cols-5 gap-1 pt-1">
                        {(
                          [
                            { key: "Hadir", label: "Hadir", tone: "emerald" },
                            { key: "Izin", label: "Izin", tone: "sky" },
                            { key: "Sakit", label: "Sakit", tone: "amber" },
                            { key: "Alfa", label: "Alfa", tone: "rose" },
                            {
                              key: "Dispensasi",
                              label: "Disp",
                              tone: "purple",
                            },
                          ] as const
                        ).map((opt) => {
                          const isActive = item.status === opt.key;
                          return (
                            <button
                              key={opt.key}
                              type="button"
                              onClick={() =>
                                updateStudentStatus(item.id_siswa, opt.key)
                              }
                              className={`py-1.5 rounded-lg text-xs font-black transition ${
                                isActive
                                  ? opt.tone === "emerald"
                                    ? "bg-emerald-500 text-slate-950"
                                    : opt.tone === "sky"
                                      ? "bg-sky-500 text-slate-950"
                                      : opt.tone === "amber"
                                        ? "bg-amber-500 text-slate-950"
                                        : opt.tone === "rose"
                                          ? "bg-rose-500 text-white"
                                          : "bg-purple-500 text-white"
                                  : "bg-slate-950 text-slate-400 border border-white/5"
                              }`}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                {canManage ? (
                  <button
                    type="button"
                    onClick={handleSaveAttendance}
                    disabled={savingAttendance}
                    className="w-full rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 py-3.5 text-xs font-black text-slate-950 shadow-lg shadow-emerald-950 transition active:scale-[0.98] disabled:opacity-50"
                  >
                    {savingAttendance
                      ? "Menyimpan..."
                      : "Simpan Presensi Kelas"}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* TAB 2: DETEKSI BOLOS */}
        {activeTab === "reconciliation" ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/10 bg-slate-900/60 p-3.5">
              <input
                aria-label="Tanggal rekonsiliasi"
                type="date"
                value={reconDate}
                onChange={(e) => setReconDate(e.target.value)}
                className="rounded-xl border border-white/10 bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white outline-none"
              />
              <select
                aria-label="Rombongan belajar rekonsiliasi"
                value={reconRombel}
                onChange={(e) => setReconRombel(e.target.value)}
                className="rounded-xl border border-white/10 bg-slate-950 px-2.5 py-1.5 text-xs font-semibold text-white outline-none"
              >
                <option value="">Semua Rombel</option>
                {rombelList.map((r) => (
                  <option
                    key={String(r.id_rombel)}
                    value={String(r.id_rombel)}
                    className="bg-slate-900 text-white"
                  >
                    {String(r.nama_rombel)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleLoadReconciliation}
                disabled={loadingRecon}
                className="rounded-xl bg-rose-500 px-3 py-1.5 text-xs font-bold text-white shadow"
              >
                {loadingRecon ? "..." : "Analisis"}
              </button>
            </div>

            {anomalies.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-8 text-center text-xs text-slate-400">
                <Icon
                  name="check"
                  className="size-8 mx-auto text-emerald-400 mb-2"
                />
                <p className="font-bold text-white">Tidak Ada Siswa Bolos</p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Seluruh siswa tertib masuk kelas sesuai rekaman scan gerbang.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {anomalies.map((item, idx) => {
                  const waLink = getWhatsAppLink(item);
                  return (
                    <div
                      key={`${item.id_presensi_mapel}-${item.id_siswa}-${idx}`}
                      className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-4 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-[9px] font-black uppercase text-rose-300">
                            {item.anomaly_type === "BOLOS_DI_SEKOLAH"
                              ? "Siswa Bolos"
                              : "Tanpa Scan Gerbang"}
                          </span>
                          <h4 className="font-bold text-sm text-white mt-1">
                            {item.nama_siswa}
                          </h4>
                          <p className="text-[11px] text-slate-400">
                            {item.nama_rombel} · Mapel: {item.nama_mapel} (Jam{" "}
                            {item.jam_ke})
                          </p>
                        </div>
                        {waLink ? (
                          <a
                            href={waLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-xl bg-emerald-500 px-3 py-1.5 text-xs font-bold text-slate-950 shadow"
                          >
                            <Icon name="whatsapp" className="size-3.5" />
                            <span>WA</span>
                          </a>
                        ) : null}
                      </div>

                      <p className="text-[11px] text-rose-300 bg-rose-950/40 p-2 rounded-xl border border-rose-500/20">
                        {item.anomaly_label} (Gerbang:{" "}
                        {item.jam_masuk_gerbang || "Tidak scan"})
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}

        {/* TAB 3: RIWAYAT */}
        {activeTab === "history" ? (
          <div className="space-y-3">
            {loadingHistory ? (
              <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-8 text-center text-xs text-slate-400">
                Memuat riwayat presensi...
              </div>
            ) : historyList.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-8 text-center text-xs text-slate-500">
                Belum ada sesi presensi KBM yang tersimpan.
              </div>
            ) : (
              historyList.map((session) => (
                <div
                  key={session.id_presensi_mapel}
                  className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-bold text-sm text-white block">
                        {session.nama_rombel} - {session.nama_mapel}
                      </span>
                      <p className="text-[11px] text-slate-400">
                        {session.tanggal} · Jam ke-{session.jam_ke} ·{" "}
                        {session.nama_guru}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 font-mono text-[10px]">
                    <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 font-bold text-emerald-300">
                      H:{session.total_hadir}
                    </span>
                    <span className="rounded bg-sky-500/20 px-1.5 py-0.5 font-bold text-sky-300">
                      I:{session.total_izin}
                    </span>
                    <span className="rounded bg-amber-500/20 px-1.5 py-0.5 font-bold text-amber-300">
                      S:{session.total_sakit}
                    </span>
                    <span className="rounded bg-rose-500/20 px-1.5 py-0.5 font-bold text-rose-300">
                      A:{session.total_alfa}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : null}
      </div>
      {dialogKonfirmasi}
    </MobileAppShell>
  );
}
