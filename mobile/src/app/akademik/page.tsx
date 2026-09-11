"use client";

import { useRouter } from "next/navigation";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  type AcademicDraft,
  type AcademicKind,
  AkademikFormFields,
  KELOMPOK_MAPEL,
  KIND_LABEL,
  toAcademicInput,
} from "@/components/akademik/AkademikForm";
import { MobileAppShell } from "@/components/MobileAppShell";
import { FeedbackBanner } from "@/components/ui/FeedbackBanner";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { canAccessArea, hasPermission } from "@/lib/auth/access";
import { triggerHaptic } from "@/lib/client/haptics";
import { useAuth } from "@/lib/context/AuthContext";
import {
  aktifkanTahunAjaran,
  getDaftarJurusan,
  getDaftarMapel,
  getDaftarPenugasanGuru,
  getDaftarRombel,
  getDaftarTahunAjaran,
  hapusJurusan,
  hapusMapel,
  hapusPenugasanGuru,
  hapusRombel,
  hapusTahunAjaran,
  simpanJurusan,
  simpanMapel,
  simpanPenugasanGuru,
  simpanRombel,
  simpanTahunAjaran,
} from "@/lib/gateways/academic";
import { getDaftarSesiPresensi } from "@/lib/gateways/class-attendance";
import { getDaftarGuru } from "@/lib/gateways/teacher";
import { useConfirmDialog } from "@/lib/hooks/useConfirmDialog";
import { useHydrated } from "@/lib/hooks/useHydrated";

type Rows = Record<string, unknown>[];

const TABS: [AcademicKind, string][] = [
  ["tahun_ajaran", "Tahun Ajaran"],
  ["rombel", "Rombel"],
  ["mapel", "Mapel"],
  ["jurusan", "Jurusan"],
  ["penugasan", "Penugasan"],
];

/**
 * Struktur Akademik (Mobile) — padanan `web-desktop/src/app/akademik`.
 *
 * Seluruh master (tahun ajaran, jurusan, rombel, mapel, penugasan guru) bisa
 * ditambah, diubah, dan dihapus oleh pemegang `academic.manage`.
 *
 * Dua perbedaan yang DISENGAJA dari Web, keduanya demi data yang sudah ada:
 * 1. Tabel akademik tidak punya foreign key. Backend kini menolak penghapusan
 *    baris yang masih dipakai (`ensure_academic_unused` di `academic.rs`),
 *    tetapi pemakaiannya tetap diperiksa DULU di sini (`findUsage`) supaya
 *    penolakannya muncul sebelum dialog konfirmasi, lengkap dengan saran
 *    menonaktifkan.
 * 2. Tahun ajaran baru TIDAK otomatis aktif. Menyimpan `is_aktif = 1`
 *    menonaktifkan tahun ajaran lain di seluruh sekolah; itu harus pilihan
 *    sadar, bukan efek samping dari "Tambah".
 */
export default function AkademikMobilePage() {
  const isHydrated = useHydrated();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const { konfirmasi, dialogKonfirmasi } = useConfirmDialog();

  const canView = canAccessArea(user, "akademik");
  const canManage = hasPermission(user, "academic.manage");

  const [tab, setTab] = useState<AcademicKind>("tahun_ajaran");
  const [tahunAjaran, setTahunAjaran] = useState<Rows>([]);
  const [rombel, setRombel] = useState<Rows>([]);
  const [mapel, setMapel] = useState<Rows>([]);
  const [jurusan, setJurusan] = useState<Rows>([]);
  const [guru, setGuru] = useState<Rows>([]);
  const [penugasan, setPenugasan] = useState<Rows>([]);
  const [selectedTa, setSelectedTa] = useState("");
  const [selectedRombel, setSelectedRombel] = useState("");
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error" | "warning";
    message: string;
  } | null>(null);

  const [draft, setDraft] = useState<AcademicDraft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isSubmittingRef = useRef(false);

  // Filter dibaca lewat ref supaya `loadData` tidak lahir ulang (dan menarik
  // ulang semua master) setiap kali dropdown diganti — pola yang sama dengan Web.
  const selectedTaRef = useRef(selectedTa);
  const selectedRombelRef = useRef(selectedRombel);
  useEffect(() => {
    selectedTaRef.current = selectedTa;
    selectedRombelRef.current = selectedRombel;
  });

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.replace("/login");
  }, [authLoading, isAuthenticated, router]);

  useEffect(() => {
    if (isHydrated && isAuthenticated && !canView) router.replace("/dashboard");
  }, [isHydrated, isAuthenticated, canView, router]);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [ta, jur, map, gr] = await Promise.all([
        getDaftarTahunAjaran(),
        getDaftarJurusan(),
        getDaftarMapel(),
        getDaftarGuru(),
      ]);
      setTahunAjaran(ta);
      setJurusan(jur);
      setMapel(map);
      setGuru(gr);

      // Pilihan filter operator dipertahankan selama barisnya masih ada;
      // bawaannya tahun ajaran AKTIF.
      const aktif = ta.find((t) => Number(t.is_aktif) === 1);
      const fallbackTa = aktif
        ? String(aktif.id_tahun_ajaran)
        : ta[0]
          ? String(ta[0].id_tahun_ajaran)
          : "";
      const taId =
        selectedTaRef.current &&
        ta.some((t) => String(t.id_tahun_ajaran) === selectedTaRef.current)
          ? selectedTaRef.current
          : fallbackTa;
      setSelectedTa(taId);

      const rom = await getDaftarRombel(taId || undefined);
      setRombel(rom);
      const rId =
        selectedRombelRef.current &&
        rom.some((r) => String(r.id_rombel) === selectedRombelRef.current)
          ? selectedRombelRef.current
          : rom[0]
            ? String(rom[0].id_rombel)
            : "";
      setSelectedRombel(rId);
      setPenugasan(rId ? await getDaftarPenugasanGuru(rId) : []);
    } catch (err: unknown) {
      if (!silent) {
        setFeedback({
          tone: "error",
          message:
            err instanceof Error ? err.message : "Data akademik gagal dimuat.",
        });
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

  const changeTaFilter = async (taId: string) => {
    setSelectedTa(taId);
    try {
      const rom = await getDaftarRombel(taId || undefined);
      setRombel(rom);
      const rId = rom[0] ? String(rom[0].id_rombel) : "";
      setSelectedRombel(rId);
      setPenugasan(rId ? await getDaftarPenugasanGuru(rId) : []);
    } catch (err: unknown) {
      // Daftar lama yang tetap tampil untuk filter BARU lebih menyesatkan
      // daripada daftar kosong.
      setRombel([]);
      setPenugasan([]);
      setFeedback({
        tone: "error",
        message:
          err instanceof Error ? err.message : "Daftar rombel gagal dimuat.",
      });
    }
  };

  const changeRombelFilter = async (rombelId: string) => {
    setSelectedRombel(rombelId);
    try {
      setPenugasan(rombelId ? await getDaftarPenugasanGuru(rombelId) : []);
    } catch (err: unknown) {
      setPenugasan([]);
      setFeedback({
        tone: "error",
        message:
          err instanceof Error ? err.message : "Daftar penugasan gagal dimuat.",
      });
    }
  };

  // ── Formulir ──────────────────────────────────────────────────────────────

  const openNew = (kind: AcademicKind) => {
    triggerHaptic("light");
    setFormError(null);
    const today = new Date().toLocaleDateString("en-CA");
    const sixMonths = new Date(
      Date.now() + 180 * 86_400_000,
    ).toLocaleDateString("en-CA");
    const drafts: Record<AcademicKind, AcademicDraft> = {
      tahun_ajaran: {
        kind: "tahun_ajaran",
        nama_tahun: "",
        semester: "Ganjil",
        tanggal_mulai: today,
        tanggal_selesai: sixMonths,
        is_aktif: 0,
      },
      jurusan: {
        kind: "jurusan",
        kode_jurusan: "",
        nama_jurusan: "",
        deskripsi: "",
        is_aktif: 1,
      },
      rombel: {
        kind: "rombel",
        id_tahun_ajaran: selectedTa,
        tingkat: "10",
        id_jurusan: "",
        nama_rombel: "",
        id_wali_kelas: "",
        kapasitas: "36",
        ruang_kelas: "",
        is_aktif: 1,
      },
      mapel: {
        kind: "mapel",
        kode_mapel: "",
        nama_mapel: "",
        tingkat: 10,
        kelompok: "Wajib",
        beban_jam: "2",
        kkm: "75",
        is_aktif: 1,
      },
      penugasan: {
        kind: "penugasan",
        id_tahun_ajaran: selectedTa,
        id_rombel: selectedRombel,
        id_mapel: "",
        id_guru: "",
      },
    };
    setDraft(drafts[kind]);
  };

  const openEdit = (kind: AcademicKind, item: Record<string, unknown>) => {
    triggerHaptic("light");
    setFormError(null);
    if (kind === "tahun_ajaran") {
      setDraft({
        kind,
        id: String(item.id_tahun_ajaran),
        nama_tahun: String(item.nama_tahun ?? ""),
        semester: String(item.semester) === "Genap" ? "Genap" : "Ganjil",
        tanggal_mulai: String(item.tanggal_mulai ?? ""),
        tanggal_selesai: String(item.tanggal_selesai ?? ""),
        is_aktif: Number(item.is_aktif) === 1 ? 1 : 0,
      });
    } else if (kind === "jurusan") {
      setDraft({
        kind,
        id: String(item.id_jurusan),
        kode_jurusan: String(item.kode_jurusan ?? ""),
        nama_jurusan: String(item.nama_jurusan ?? ""),
        deskripsi: item.deskripsi ? String(item.deskripsi) : "",
        is_aktif: Number(item.is_aktif ?? 1) === 1 ? 1 : 0,
      });
    } else if (kind === "rombel") {
      setDraft({
        kind,
        id: String(item.id_rombel),
        id_tahun_ajaran: String(item.id_tahun_ajaran ?? ""),
        tingkat: String(item.tingkat ?? "10"),
        id_jurusan: item.id_jurusan ? String(item.id_jurusan) : "",
        nama_rombel: String(item.nama_rombel ?? ""),
        id_wali_kelas: item.id_wali_kelas ? String(item.id_wali_kelas) : "",
        kapasitas: String(item.kapasitas ?? 36),
        ruang_kelas: item.ruang_kelas ? String(item.ruang_kelas) : "",
        is_aktif: Number(item.is_aktif ?? 1) === 1 ? 1 : 0,
      });
    } else if (kind === "mapel") {
      setDraft({
        kind,
        id: String(item.id_mapel),
        kode_mapel: String(item.kode_mapel ?? ""),
        nama_mapel: String(item.nama_mapel ?? ""),
        tingkat: item.tingkat ? Number(item.tingkat) : null,
        kelompok:
          KELOMPOK_MAPEL.find((k) => k === String(item.kelompok)) ?? "Wajib",
        beban_jam: String(item.beban_jam ?? 2),
        kkm: String(item.kkm ?? 75),
        is_aktif: Number(item.is_aktif ?? 1) === 1 ? 1 : 0,
      });
    }
  };

  const submitDraft = async () => {
    if (!draft || !canManage || isSubmittingRef.current) return;
    const parsed = toAcademicInput(draft);
    if ("error" in parsed) {
      setFormError(parsed.error);
      return;
    }
    if (
      parsed.kind === "tahun_ajaran" &&
      !parsed.input.id_tahun_ajaran &&
      parsed.input.is_aktif === 1 &&
      !(await konfirmasi({
        title: "Jadikan tahun ajaran aktif?",
        description:
          "Tahun ajaran aktif yang sekarang akan dinonaktifkan di semua perangkat. Rombel dan presensi kelas mengikuti tahun ajaran aktif.",
        confirmLabel: "Ya, aktifkan",
        tone: "warning",
      }))
    ) {
      return;
    }
    isSubmittingRef.current = true;
    setBusy(true);
    setFormError(null);
    try {
      if (parsed.kind === "tahun_ajaran") await simpanTahunAjaran(parsed.input);
      else if (parsed.kind === "jurusan") await simpanJurusan(parsed.input);
      else if (parsed.kind === "rombel") await simpanRombel(parsed.input);
      else if (parsed.kind === "mapel") await simpanMapel(parsed.input);
      else await simpanPenugasanGuru(parsed.input);
      triggerHaptic("success");
      setFeedback({
        tone: "success",
        message: `${KIND_LABEL[parsed.kind]} berhasil disimpan.`,
      });
      setDraft(null);
      await loadData(true);
    } catch (err: unknown) {
      triggerHaptic("error");
      setFormError(
        err instanceof Error ? err.message : "Data akademik gagal disimpan.",
      );
    } finally {
      isSubmittingRef.current = false;
      setBusy(false);
    }
  };

  // ── Aktifkan & hapus ──────────────────────────────────────────────────────

  const handleActivate = async (item: Record<string, unknown>) => {
    if (!canManage || isSubmittingRef.current) return;
    const ok = await konfirmasi({
      title: "Ganti tahun ajaran aktif?",
      description: (
        <>
          <strong>
            {String(item.nama_tahun)} ({String(item.semester)})
          </strong>{" "}
          menjadi tahun ajaran aktif di semua perangkat. Rombel dan presensi
          kelas akan mengikuti tahun ajaran ini.
        </>
      ),
      preserved: "Data tahun ajaran sebelumnya tidak dihapus.",
      confirmLabel: "Ya, aktifkan",
      tone: "warning",
    });
    if (!ok || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setBusy(true);
    try {
      await aktifkanTahunAjaran(String(item.id_tahun_ajaran));
      triggerHaptic("success");
      setFeedback({
        tone: "success",
        message: "Tahun ajaran aktif berhasil diperbarui.",
      });
      await loadData(true);
    } catch (err: unknown) {
      triggerHaptic("error");
      setFeedback({
        tone: "error",
        message:
          err instanceof Error
            ? err.message
            : "Gagal mengaktifkan tahun ajaran.",
      });
    } finally {
      isSubmittingRef.current = false;
      setBusy(false);
    }
  };

  /** Daftar alasan sebuah baris MASIH dipakai. Kosong = aman dihapus. */
  const findUsage = async (
    kind: AcademicKind,
    item: Record<string, unknown>,
  ): Promise<string[]> => {
    const reasons: string[] = [];
    if (kind === "tahun_ajaran") {
      const id = String(item.id_tahun_ajaran);
      if (Number(item.is_aktif) === 1)
        reasons.push("ini tahun ajaran aktif — aktifkan tahun lain dulu");
      const [rom, sesi] = await Promise.all([
        getDaftarRombel(id),
        getDaftarSesiPresensi({ id_tahun_ajaran: id, limit: 1 }),
      ]);
      if (rom.length > 0) reasons.push(`${rom.length} rombel`);
      if (sesi.length > 0) reasons.push("riwayat presensi kelas");
    } else if (kind === "jurusan") {
      const id = String(item.id_jurusan);
      const semuaRombel = await getDaftarRombel();
      const dipakai = semuaRombel.filter((r) => String(r.id_jurusan) === id);
      if (dipakai.length > 0) reasons.push(`${dipakai.length} rombel`);
    } else if (kind === "rombel") {
      const id = String(item.id_rombel);
      const siswa = Number(item.jumlah_siswa ?? 0);
      if (siswa > 0) reasons.push(`${siswa} siswa aktif`);
      const [pen, sesi] = await Promise.all([
        getDaftarPenugasanGuru(id),
        getDaftarSesiPresensi({ id_rombel: id, limit: 1 }),
      ]);
      if (pen.length > 0) reasons.push(`${pen.length} penugasan guru`);
      if (sesi.length > 0) reasons.push("riwayat presensi kelas");
    } else if (kind === "mapel") {
      const id = String(item.id_mapel);
      const [semuaPenugasan, sesi] = await Promise.all([
        getDaftarPenugasanGuru(),
        getDaftarSesiPresensi({ id_mapel: id, limit: 1 }),
      ]);
      const dipakai = semuaPenugasan.filter((p) => String(p.id_mapel) === id);
      if (dipakai.length > 0) reasons.push(`${dipakai.length} penugasan guru`);
      if (sesi.length > 0) reasons.push("riwayat presensi kelas");
    }
    return reasons;
  };

  const handleDelete = async (
    kind: AcademicKind,
    id: string,
    item: Record<string, unknown>,
    label: string,
  ) => {
    if (!canManage || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setBusy(true);
    let reasons: string[];
    try {
      reasons = await findUsage(kind, item);
    } catch (err: unknown) {
      setFeedback({
        tone: "error",
        message:
          err instanceof Error
            ? `Pemakaian data belum bisa diperiksa: ${err.message}`
            : "Pemakaian data belum bisa diperiksa, jadi penghapusan dibatalkan.",
      });
      isSubmittingRef.current = false;
      setBusy(false);
      return;
    }
    isSubmittingRef.current = false;
    setBusy(false);

    if (reasons.length > 0) {
      triggerHaptic("error");
      setFeedback({
        tone: "warning",
        message: `${label} tidak dihapus karena masih dipakai: ${reasons.join(", ")}.${
          kind === "tahun_ajaran" ? "" : " Nonaktifkan lewat tombol Ubah."
        }`,
      });
      return;
    }

    const ok = await konfirmasi({
      title: `Hapus ${KIND_LABEL[kind].toLowerCase()}?`,
      description: (
        <>
          <strong>{label}</strong> dihapus permanen dan penghapusannya ikut
          tersinkronisasi ke seluruh perangkat.
        </>
      ),
      preserved:
        "Sudah diperiksa: tidak ada siswa, rombel, penugasan, atau riwayat presensi yang masih memakainya.",
      confirmLabel: "Ya, hapus",
      tone: "danger",
    });
    if (!ok || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setBusy(true);
    try {
      if (kind === "tahun_ajaran") await hapusTahunAjaran(id);
      else if (kind === "jurusan") await hapusJurusan(id);
      else if (kind === "rombel") await hapusRombel(id);
      else if (kind === "mapel") await hapusMapel(id);
      else await hapusPenugasanGuru(id);
      triggerHaptic("success");
      setFeedback({ tone: "success", message: `${label} berhasil dihapus.` });
      await loadData(true);
    } catch (err: unknown) {
      triggerHaptic("error");
      setFeedback({
        tone: "error",
        message: err instanceof Error ? err.message : "Gagal menghapus data.",
      });
    } finally {
      isSubmittingRef.current = false;
      setBusy(false);
    }
  };

  if (authLoading || !isHydrated) {
    return (
      <MobileAppShell>
        <SkeletonList count={4} />
      </MobileAppShell>
    );
  }

  const rowsByTab: Record<AcademicKind, Rows> = {
    tahun_ajaran: tahunAjaran,
    rombel,
    mapel,
    jurusan,
    penugasan,
  };
  const formId = "akademik-form";

  return (
    <MobileAppShell>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-black leading-tight text-white">
            Struktur Akademik
          </h1>
          <p className="mt-0.5 text-[11px] text-slate-400">
            Tahun ajaran, rombel, mata pelajaran, jurusan, dan penugasan guru.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            triggerHaptic("light");
            void loadData();
          }}
          disabled={loading}
          aria-label="Muat ulang data akademik"
          className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-slate-900/80 text-slate-300 active:scale-95 disabled:opacity-50"
        >
          <Icon
            name="refresh"
            className={`size-4 ${loading ? "animate-spin" : ""}`}
          />
        </button>
      </div>

      {feedback ? (
        <FeedbackBanner
          type={feedback.tone}
          message={feedback.message}
          className="mb-3"
          onClose={() => setFeedback(null)}
        />
      ) : null}

      <div className="mb-3 flex gap-2 overflow-x-auto pb-2 scrollbar-none">
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

      {tab === "rombel" || tab === "penugasan" ? (
        <div className="mb-3 grid grid-cols-1 gap-2">
          <select
            aria-label="Filter tahun ajaran"
            value={selectedTa}
            onChange={(e) => void changeTaFilter(e.target.value)}
            className="min-h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-xs font-semibold text-white outline-none"
          >
            {tahunAjaran.map((ta) => (
              <option
                key={String(ta.id_tahun_ajaran)}
                value={String(ta.id_tahun_ajaran)}
              >
                {String(ta.nama_tahun)} ({String(ta.semester)})
                {Number(ta.is_aktif) === 1 ? " · aktif" : ""}
              </option>
            ))}
          </select>
          {tab === "penugasan" ? (
            <select
              aria-label="Filter rombel"
              value={selectedRombel}
              onChange={(e) => void changeRombelFilter(e.target.value)}
              className="min-h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-xs font-semibold text-white outline-none"
            >
              {rombel.length === 0 ? (
                <option value="">Belum ada rombel</option>
              ) : null}
              {rombel.map((r) => (
                <option key={String(r.id_rombel)} value={String(r.id_rombel)}>
                  {String(r.nama_rombel)}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      ) : null}

      {canManage ? (
        <button
          type="button"
          onClick={() => openNew(tab)}
          disabled={tab === "penugasan" && rombel.length === 0}
          className="mb-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-sky-500 text-xs font-black text-slate-950 shadow-lg active:scale-95 disabled:opacity-50"
        >
          <Icon name="plus" className="size-4" />
          Tambah {KIND_LABEL[tab]}
        </button>
      ) : null}

      {loading ? (
        <SkeletonList count={3} />
      ) : rowsByTab[tab].length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-6 text-center">
          <p className="text-sm text-slate-300">Belum ada data.</p>
          {tab === "rombel" || tab === "penugasan" ? (
            <p className="mt-1 text-[11px] text-slate-500">
              Untuk tahun ajaran{tab === "penugasan" ? " & rombel" : ""} yang
              dipilih.
            </p>
          ) : null}
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {tab === "tahun_ajaran"
            ? tahunAjaran.map((item) => {
                const id = String(item.id_tahun_ajaran);
                const aktif = Number(item.is_aktif) === 1;
                const label = `${String(item.nama_tahun)} ${String(item.semester)}`;
                return (
                  <RowCard
                    key={id}
                    title={`${String(item.nama_tahun)} · ${String(item.semester)}`}
                    subtitle={`${String(item.tanggal_mulai)} → ${String(item.tanggal_selesai)}`}
                    badge={
                      aktif ? (
                        <span className="shrink-0 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[10px] font-black text-emerald-300">
                          AKTIF
                        </span>
                      ) : null
                    }
                    actions={
                      canManage ? (
                        <>
                          {aktif ? null : (
                            <button
                              type="button"
                              onClick={() => void handleActivate(item)}
                              disabled={busy}
                              className="min-h-9 rounded-lg bg-sky-500 px-2.5 text-[11px] font-black text-slate-950 active:scale-95 disabled:opacity-50"
                            >
                              Aktifkan
                            </button>
                          )}
                          <RowActions
                            busy={busy}
                            label={label}
                            onEdit={() => openEdit("tahun_ajaran", item)}
                            onDelete={() =>
                              void handleDelete("tahun_ajaran", id, item, label)
                            }
                          />
                        </>
                      ) : null
                    }
                  />
                );
              })
            : null}

          {tab === "rombel"
            ? rombel.map((item) => {
                const id = String(item.id_rombel);
                const label = `Rombel ${String(item.nama_rombel)}`;
                return (
                  <RowCard
                    key={id}
                    title={String(item.nama_rombel)}
                    subtitle={`Tingkat ${String(item.tingkat)} · ${String(
                      item.nama_jurusan || "Umum",
                    )} · Wali: ${String(item.nama_wali_kelas || "belum ditunjuk")}`}
                    badge={
                      <span className="shrink-0 rounded-lg border border-white/10 bg-slate-800 px-2 py-1 text-[10px] font-bold text-slate-300">
                        {String(item.jumlah_siswa ?? 0)}/
                        {String(item.kapasitas ?? 36)}
                      </span>
                    }
                    inactive={Number(item.is_aktif ?? 1) === 0}
                    actions={
                      canManage ? (
                        <RowActions
                          busy={busy}
                          label={label}
                          onEdit={() => openEdit("rombel", item)}
                          onDelete={() =>
                            void handleDelete("rombel", id, item, label)
                          }
                        />
                      ) : null
                    }
                  />
                );
              })
            : null}

          {tab === "mapel"
            ? mapel.map((item) => {
                const id = String(item.id_mapel);
                const label = `Mapel ${String(item.nama_mapel)}`;
                return (
                  <RowCard
                    key={id}
                    title={String(item.nama_mapel)}
                    subtitle={`${String(item.kode_mapel)} · ${String(
                      item.kelompok,
                    )} · KKM ${String(item.kkm ?? 75)}`}
                    badge={
                      <span className="shrink-0 rounded-lg border border-white/10 bg-slate-800 px-2 py-1 text-[10px] font-bold text-slate-300">
                        {String(item.beban_jam ?? 2)} JP
                      </span>
                    }
                    inactive={Number(item.is_aktif ?? 1) === 0}
                    actions={
                      canManage ? (
                        <RowActions
                          busy={busy}
                          label={label}
                          onEdit={() => openEdit("mapel", item)}
                          onDelete={() =>
                            void handleDelete("mapel", id, item, label)
                          }
                        />
                      ) : null
                    }
                  />
                );
              })
            : null}

          {tab === "jurusan"
            ? jurusan.map((item) => {
                const id = String(item.id_jurusan);
                const label = `Jurusan ${String(item.nama_jurusan)}`;
                return (
                  <RowCard
                    key={id}
                    title={String(item.nama_jurusan)}
                    subtitle={`${String(item.kode_jurusan)}${
                      item.deskripsi ? ` · ${String(item.deskripsi)}` : ""
                    }`}
                    inactive={Number(item.is_aktif ?? 1) === 0}
                    actions={
                      canManage ? (
                        <RowActions
                          busy={busy}
                          label={label}
                          onEdit={() => openEdit("jurusan", item)}
                          onDelete={() =>
                            void handleDelete("jurusan", id, item, label)
                          }
                        />
                      ) : null
                    }
                  />
                );
              })
            : null}

          {tab === "penugasan"
            ? penugasan.map((item) => {
                const id = String(item.id_penugasan);
                const label = `Penugasan ${String(item.nama_mapel)} – ${String(
                  item.nama_guru || "-",
                )}`;
                return (
                  <RowCard
                    key={id}
                    title={String(item.nama_mapel)}
                    subtitle={`${String(item.nama_guru || "-")}${
                      item.nip ? ` · NIP ${String(item.nip)}` : ""
                    }`}
                    badge={
                      <span className="shrink-0 rounded-lg border border-white/10 bg-slate-800 px-2 py-1 text-[10px] font-bold text-slate-300">
                        {String(item.beban_jam ?? "-")} JP
                      </span>
                    }
                    actions={
                      canManage ? (
                        <button
                          type="button"
                          onClick={() =>
                            void handleDelete("penugasan", id, item, label)
                          }
                          disabled={busy}
                          aria-label={`Hapus ${label}`}
                          className="grid size-9 place-items-center rounded-lg border border-rose-500/25 bg-rose-500/10 text-rose-300 active:scale-95 disabled:opacity-50"
                        >
                          <Icon name="trash" className="size-4" />
                        </button>
                      ) : null
                    }
                  />
                );
              })
            : null}
        </ul>
      )}

      <Modal
        isOpen={Boolean(draft)}
        onClose={() => {
          if (!busy) setDraft(null);
        }}
        title={
          draft
            ? `${"id" in draft && draft.id ? "Ubah" : "Tambah"} ${KIND_LABEL[draft.kind]}`
            : "Data akademik"
        }
        titleId="akademik-form-title"
        maxWidth="max-w-md"
        footer={
          <div className="flex w-full items-center gap-2">
            <button
              type="button"
              onClick={() => setDraft(null)}
              disabled={busy}
              className="min-h-11 flex-1 rounded-xl border border-white/10 bg-white/5 text-xs font-bold text-slate-300 active:scale-95 disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="submit"
              form={formId}
              disabled={busy}
              className="min-h-11 flex-1 rounded-xl bg-sky-500 text-xs font-black text-slate-950 shadow-lg active:scale-95 disabled:opacity-50"
            >
              {busy ? "Menyimpan..." : "Simpan"}
            </button>
          </div>
        }
      >
        {draft ? (
          <form
            id={formId}
            onSubmit={(event) => {
              event.preventDefault();
              void submitDraft();
            }}
            className="flex flex-col gap-3 text-xs"
          >
            {formError ? (
              <FeedbackBanner
                type="error"
                message={formError}
                onClose={() => setFormError(null)}
                className="text-xs"
              />
            ) : null}
            <AkademikFormFields
              draft={draft}
              options={{ tahunAjaran, jurusan, rombel, mapel, guru }}
              onChange={setDraft}
            />
          </form>
        ) : null}
      </Modal>
      {dialogKonfirmasi}
    </MobileAppShell>
  );
}

function RowCard({
  title,
  subtitle,
  badge,
  inactive,
  actions,
}: {
  title: string;
  subtitle: string;
  badge?: ReactNode;
  inactive?: boolean;
  actions?: ReactNode;
}) {
  return (
    <li className="rounded-2xl border border-white/10 bg-slate-900/60 p-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 truncate text-sm font-bold text-white">
            <span className="truncate">{title}</span>
            {inactive ? (
              <span className="shrink-0 rounded-md border border-white/15 bg-slate-500/15 px-1.5 py-0.5 text-[9px] font-bold text-slate-400">
                Nonaktif
              </span>
            ) : null}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-slate-400">
            {subtitle}
          </p>
        </div>
        {badge}
      </div>
      {actions ? (
        <div className="mt-2.5 flex items-center justify-end gap-1.5">
          {actions}
        </div>
      ) : null}
    </li>
  );
}

function RowActions({
  busy,
  label,
  onEdit,
  onDelete,
}: {
  busy: boolean;
  label: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <>
      <button
        type="button"
        onClick={onEdit}
        disabled={busy}
        className="min-h-9 rounded-lg border border-white/10 bg-white/5 px-3 text-[11px] font-bold text-sky-300 active:scale-95 disabled:opacity-50"
      >
        Ubah
      </button>
      <button
        type="button"
        onClick={onDelete}
        disabled={busy}
        aria-label={`Hapus ${label}`}
        className="grid size-9 place-items-center rounded-lg border border-rose-500/25 bg-rose-500/10 text-rose-300 active:scale-95 disabled:opacity-50"
      >
        <Icon name="trash" className="size-4" />
      </button>
    </>
  );
}

function SkeletonList({ count }: { count: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: count }, (_, i) => `sk-${i + 1}`).map((key) => (
        <div
          key={key}
          className="h-20 animate-pulse rounded-2xl border border-white/5 bg-slate-900/40"
        />
      ))}
    </div>
  );
}
