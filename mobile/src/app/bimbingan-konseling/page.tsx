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
import { getDaftarTahunAjaran } from "@/lib/gateways/academic";
import {
  addCounselingSessionGateway,
  type CounselingCaseDetail,
  type CounselingCaseItem,
  type CounselingCategory,
  type CounselingStatus,
  createCounselingCaseGateway,
  deleteCounselingCaseGateway,
  deleteCounselingSessionGateway,
  getCounselingCaseGateway,
  listCounselingCasesGateway,
  updateCounselingCaseGateway,
} from "@/lib/gateways/counseling";
import { getDaftarSiswa } from "@/lib/gateways/student";
import { useConfirmDialog } from "@/lib/hooks/useConfirmDialog";

/**
 * Bimbingan Konseling versi genggam.
 *
 * BERBEDA DENGAN DASBOR KEHADIRAN, HALAMAN INI MENUNTUT JARINGAN — dan itu
 * disengaja. `bk_kasus`/`bk_sesi` sengaja cloud-only: catatan kedisiplinan
 * seorang anak tidak boleh tersimpan di SQLite terminal pemindai di lobi
 * sekolah. Konsekuensinya sama di Desktop; Mobile tidak lebih buruk.
 *
 * Karena itu kegagalan jaringan WAJIB dikatakan, bukan ditampilkan sebagai
 * daftar kosong. Daftar kosong yang sebenarnya kegagalan tidak bisa dibedakan
 * dari "belum ada kasus" — pelajaran yang sama dengan `unwrap_or(0)` di dasbor
 * Rust, hanya dalam bentuk antarmuka.
 *
 * Halaman ini tidak MENULIS ke SQLite lokal, outbox, maupun `SNAPSHOT_TABLES`.
 * Satu-satunya bacaan lokal adalah daftar siswa & tahun ajaran untuk formulir
 * "Catat Kasus Baru" — keduanya memang tabel tersinkronisasi biasa.
 */

const BATAS_KASUS = 100;

const STATUS_PILIHAN = ["Semua", "Terbuka", "Dalam Bimbingan", "Selesai"];

const STATUS_KASUS: CounselingStatus[] = [
  "Terbuka",
  "Dalam Bimbingan",
  "Selesai",
];

const KATEGORI_KASUS: { value: CounselingCategory; label: string }[] = [
  { value: "kedisiplinan", label: "Kedisiplinan" },
  { value: "akademik", label: "Akademik" },
  { value: "kehadiran", label: "Kehadiran / Bolos" },
  { value: "sosial", label: "Sosial / Perilaku" },
];

const CATATAN_JARINGAN =
  "Bimbingan Konseling menulis langsung ke cloud, jadi fitur ini membutuhkan koneksi.";

interface CaseForm {
  id_siswa: string;
  kategori: CounselingCategory;
  status: CounselingStatus;
  ringkasan: string;
  kronologi: string;
}

const FORM_KOSONG: CaseForm = {
  id_siswa: "",
  kategori: "kedisiplinan",
  status: "Terbuka",
  ringkasan: "",
  kronologi: "",
};

const INPUT =
  "min-h-11 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white";

function warnaStatus(status: string) {
  if (status === "Selesai")
    return "border-emerald-400/30 bg-emerald-400/10 text-emerald-200";
  if (status === "Dalam Bimbingan")
    return "border-amber-400/30 bg-amber-400/10 text-amber-200";
  return "border-sky-400/30 bg-sky-400/10 text-sky-200";
}

function formatTanggal(value: string) {
  if (!value) return "-";
  const tanggal = value.slice(0, 10);
  const [y, m, d] = tanggal.split("-").map(Number);
  if (!y || !m || !d) return value;
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(y, m - 1, d));
}

export default function BimbinganKonselingMobilePage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const canView = canAccessArea(user, "bimbingan_konseling");
  const canManage = hasPermission(user, "counseling.manage");
  const canDelete = hasPermission(user, "counseling.delete");
  const { konfirmasi, dialogKonfirmasi } = useConfirmDialog();

  const [createOpen, setCreateOpen] = useState(false);
  const [caseForm, setCaseForm] = useState<CaseForm>(FORM_KOSONG);
  const [createError, setCreateError] = useState<string | null>(null);
  const [students, setStudents] = useState<Record<string, unknown>[]>([]);
  const [studentFilter, setStudentFilter] = useState("");
  const [activeYearId, setActiveYearId] = useState("");

  const [cases, setCases] = useState<CounselingCaseItem[]>([]);
  const [detail, setDetail] = useState<CounselingCaseDetail | null>(null);
  const [status, setStatus] = useState("Semua");
  const [pencarian, setPencarian] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [tanggalSesi, setTanggalSesi] = useState("");
  const [catatanSesi, setCatatanSesi] = useState("");
  const [tindakLanjut, setTindakLanjut] = useState("");

  // Rule 5: penjaga klik ganda. Dideklarasikan SEBELUM early return apa pun —
  // hook yang dilewati pada sebagian render mengubah urutan hook dan
  // menjatuhkan seluruh halaman.
  const isSubmittingRef = useRef(false);
  const [menyimpan, setMenyimpan] = useState(false);

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

  const muatKasus = useCallback(async () => {
    setLoading(true);
    try {
      const hasil = await listCounselingCasesGateway({
        status: status === "Semua" ? null : status,
        search: pencarian.trim() || null,
        // `bk_kasus` tumbuh sepanjang tahun ajaran; batas ini yang menjaga
        // balasannya tetap wajar di perangkat genggam.
        limit: BATAS_KASUS,
      });
      setCases(hasil.items);
      setError(null);
    } catch (err) {
      setCases([]);
      setError(
        err instanceof Error
          ? `${err.message} — Bimbingan Konseling membaca data dari cloud, jadi fitur ini membutuhkan koneksi.`
          : "Gagal memuat kasus. Bimbingan Konseling membutuhkan koneksi jaringan.",
      );
    } finally {
      setLoading(false);
    }
  }, [status, pencarian]);

  useEffect(() => {
    if (authLoading || !isAuthenticated || !canView) return;
    void muatKasus();
  }, [authLoading, isAuthenticated, canView, muatKasus]);

  const bukaDetail = useCallback(async (idKasus: string) => {
    setDetailLoading(true);
    setError(null);
    try {
      const hasil = await getCounselingCaseGateway(idKasus);
      setDetail(hasil);
      setTanggalSesi("");
      setCatatanSesi("");
      setTindakLanjut("");
    } catch (err) {
      setError(
        err instanceof Error
          ? `${err.message} — detail kasus diambil dari cloud dan membutuhkan koneksi.`
          : "Gagal memuat detail kasus.",
      );
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const simpanSesi = async () => {
    if (!detail) return;
    if (isSubmittingRef.current) return;
    if (!tanggalSesi || !catatanSesi.trim()) {
      setError("Tanggal dan catatan konseling wajib diisi.");
      return;
    }
    isSubmittingRef.current = true;
    setMenyimpan(true);
    try {
      await addCounselingSessionGateway({
        id_kasus: detail.id_kasus,
        tanggal: tanggalSesi,
        catatan_konseling: catatanSesi.trim(),
        tindak_lanjut: tindakLanjut.trim() || null,
      });
      setFeedback("Sesi konseling tersimpan.");
      setError(null);
      await bukaDetail(detail.id_kasus);
      await muatKasus();
    } catch (err) {
      setError(
        err instanceof Error
          ? `${err.message} — sesi belum tersimpan. Fitur ini menulis langsung ke cloud dan membutuhkan koneksi.`
          : "Gagal menyimpan sesi konseling.",
      );
    } finally {
      isSubmittingRef.current = false;
      setMenyimpan(false);
    }
  };

  const filteredStudents = useMemo(() => {
    const kata = studentFilter.trim().toLowerCase();
    if (!kata) return students;
    return students.filter(
      (s) =>
        String(s.nama_lengkap ?? "")
          .toLowerCase()
          .includes(kata) ||
        String(s.nis ?? "")
          .toLowerCase()
          .includes(kata),
    );
  }, [students, studentFilter]);

  const bukaBuatKasus = async () => {
    triggerHaptic("light");
    setCaseForm(FORM_KOSONG);
    setStudentFilter("");
    setCreateError(null);
    setCreateOpen(true);
    try {
      // Daftar siswa & tahun ajaran dibaca dari SQLite lokal (keduanya ikut
      // sinkronisasi); hanya kasusnya sendiri yang cloud-only.
      const [siswa, tahun] = await Promise.all([
        getDaftarSiswa(),
        getDaftarTahunAjaran(),
      ]);
      setStudents(siswa);
      const aktif = tahun.find((t) => Number(t.is_aktif) === 1);
      setActiveYearId(aktif ? String(aktif.id_tahun_ajaran) : "");
      if (!aktif) {
        setCreateError(
          "Belum ada tahun ajaran aktif. Aktifkan tahun ajaran di menu Akademik lebih dulu.",
        );
      }
    } catch (err) {
      setCreateError(
        err instanceof Error
          ? err.message
          : "Daftar siswa atau tahun ajaran gagal dimuat.",
      );
    }
  };

  const simpanKasusBaru = async () => {
    if (!canManage || isSubmittingRef.current) return;
    if (!caseForm.id_siswa || !caseForm.ringkasan.trim()) {
      setCreateError("Siswa dan ringkasan kasus wajib diisi.");
      return;
    }
    if (!activeYearId) {
      setCreateError(
        "Belum ada tahun ajaran aktif. Aktifkan tahun ajaran di menu Akademik lebih dulu.",
      );
      return;
    }
    isSubmittingRef.current = true;
    setMenyimpan(true);
    setCreateError(null);
    try {
      const hasil = await createCounselingCaseGateway({
        id_siswa: caseForm.id_siswa,
        id_tahun_ajaran: activeYearId,
        kategori: caseForm.kategori,
        ringkasan: caseForm.ringkasan.trim(),
        kronologi: caseForm.kronologi.trim() || null,
        status: caseForm.status,
      });
      triggerHaptic("success");
      setCreateOpen(false);
      setFeedback("Kasus Bimbingan Konseling berhasil dicatat.");
      await muatKasus();
      if (hasil.id_kasus) await bukaDetail(hasil.id_kasus);
    } catch (err) {
      triggerHaptic("error");
      setCreateError(
        err instanceof Error
          ? `${err.message} — kasus belum tersimpan. ${CATATAN_JARINGAN}`
          : "Gagal mencatat kasus baru.",
      );
    } finally {
      isSubmittingRef.current = false;
      setMenyimpan(false);
    }
  };

  const ubahStatus = async (nextStatus: CounselingStatus) => {
    if (!detail || !canManage || isSubmittingRef.current) return;
    if (detail.status === nextStatus) return;
    isSubmittingRef.current = true;
    setMenyimpan(true);
    try {
      await updateCounselingCaseGateway(detail.id_kasus, {
        status: nextStatus,
      });
      triggerHaptic("success");
      setDetail({ ...detail, status: nextStatus });
      setFeedback(`Status kasus diperbarui menjadi ${nextStatus}.`);
      setError(null);
      await muatKasus();
    } catch (err) {
      triggerHaptic("error");
      setError(
        err instanceof Error
          ? `${err.message} — status belum berubah. ${CATATAN_JARINGAN}`
          : "Gagal memperbarui status kasus.",
      );
    } finally {
      isSubmittingRef.current = false;
      setMenyimpan(false);
    }
  };

  const hapusKasus = async () => {
    if (!detail || !canDelete || isSubmittingRef.current) return;
    const ok = await konfirmasi({
      title: `Hapus rekam jejak BK ${detail.nama_siswa}?`,
      description: `Kasus ini beserta ${detail.sesi.length} sesi konselingnya dihapus permanen dari cloud dan tidak dapat dipulihkan.`,
      preserved: "Data absensi dan presensi kelas siswa tidak ikut terhapus.",
      confirmLabel: "Ya, hapus rekam jejak",
      tone: "danger",
    });
    if (!ok || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setMenyimpan(true);
    try {
      await deleteCounselingCaseGateway(detail.id_kasus);
      triggerHaptic("success");
      setDetail(null);
      setFeedback("Kasus Bimbingan Konseling berhasil dihapus.");
      setError(null);
      await muatKasus();
    } catch (err) {
      triggerHaptic("error");
      setError(
        err instanceof Error
          ? `${err.message} — kasus belum terhapus. ${CATATAN_JARINGAN}`
          : "Gagal menghapus kasus.",
      );
    } finally {
      isSubmittingRef.current = false;
      setMenyimpan(false);
    }
  };

  const hapusSesi = async (idSesi: string, tanggal: string) => {
    if (!detail || !canDelete || isSubmittingRef.current) return;
    const ok = await konfirmasi({
      title: "Hapus catatan sesi ini?",
      description: `Catatan sesi ${formatTanggal(tanggal)} beserta tindak lanjutnya dihapus permanen dari rekam jejak kasus.`,
      preserved: "Kasus induknya dan sesi lainnya tetap tersimpan.",
      confirmLabel: "Ya, hapus sesi",
      tone: "danger",
    });
    if (!ok || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setMenyimpan(true);
    try {
      await deleteCounselingSessionGateway(idSesi);
      triggerHaptic("success");
      setFeedback("Sesi konseling berhasil dihapus.");
      setError(null);
      await bukaDetail(detail.id_kasus);
      await muatKasus();
    } catch (err) {
      triggerHaptic("error");
      setError(
        err instanceof Error
          ? `${err.message} — sesi belum terhapus. ${CATATAN_JARINGAN}`
          : "Gagal menghapus sesi konseling.",
      );
    } finally {
      isSubmittingRef.current = false;
      setMenyimpan(false);
    }
  };

  return (
    <MobileAppShell>
      <div className="flex flex-col gap-4 text-slate-100">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              triggerHaptic("light");
              if (detail) {
                setDetail(null);
                return;
              }
              router.push("/dashboard");
            }}
            aria-label={
              detail ? "Kembali ke daftar kasus" : "Kembali ke Dasbor"
            }
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
            <h1 className="text-lg font-black text-white">
              Bimbingan Konseling
            </h1>
            <p className="text-[11px] text-slate-400">
              {detail ? detail.nama_siswa : "Membutuhkan koneksi jaringan"}
            </p>
          </div>
        </div>

        {feedback ? (
          <FeedbackBanner
            type="success"
            message={feedback}
            onClose={() => setFeedback(null)}
          />
        ) : null}
        {error ? (
          <FeedbackBanner
            type="error"
            message={error}
            onClose={() => setError(null)}
          />
        ) : null}

        {detail ? (
          <>
            <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-black text-white">
                    {detail.nama_siswa}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {detail.nis} · {detail.nama_rombel}
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${warnaStatus(detail.status)}`}
                >
                  {detail.status}
                </span>
              </div>
              <p className="mt-3 text-sm text-slate-200">{detail.ringkasan}</p>
              {detail.kronologi ? (
                <p className="mt-2 whitespace-pre-line text-xs text-slate-400">
                  {detail.kronologi}
                </p>
              ) : null}

              {canManage ? (
                <fieldset className="mt-4">
                  <legend className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    Status kasus
                  </legend>
                  <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                    {STATUS_KASUS.map((pilihan) => {
                      const aktif = detail.status === pilihan;
                      return (
                        <button
                          key={pilihan}
                          type="button"
                          onClick={() => void ubahStatus(pilihan)}
                          disabled={menyimpan || aktif}
                          aria-pressed={aktif}
                          className={`min-h-10 rounded-xl border px-1.5 text-[11px] font-bold transition active:scale-95 disabled:cursor-default ${
                            aktif
                              ? warnaStatus(pilihan)
                              : "border-white/10 bg-slate-950/60 text-slate-400"
                          }`}
                        >
                          {pilihan}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              ) : null}

              {canDelete ? (
                <button
                  type="button"
                  onClick={() => void hapusKasus()}
                  disabled={menyimpan}
                  className="mt-3 flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-rose-500/25 bg-rose-500/10 text-xs font-bold text-rose-300 active:scale-95 disabled:opacity-50"
                >
                  <Icon name="trash" className="size-4" />
                  Hapus rekam jejak kasus
                </button>
              ) : null}
            </div>

            <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-4">
              <h2 className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                Riwayat Sesi ({detail.sesi.length})
              </h2>
              {detail.sesi.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">
                  Belum ada sesi konseling yang dicatat.
                </p>
              ) : (
                <ul className="mt-2 flex flex-col gap-2">
                  {detail.sesi.map((sesi) => (
                    <li
                      key={sesi.id_sesi}
                      className="rounded-2xl border border-white/5 bg-slate-950/60 p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-white">
                          {formatTanggal(sesi.tanggal)}
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-500">
                            {sesi.konselor}
                          </span>
                          {canDelete ? (
                            <button
                              type="button"
                              onClick={() =>
                                void hapusSesi(sesi.id_sesi, sesi.tanggal)
                              }
                              disabled={menyimpan}
                              aria-label={`Hapus sesi ${formatTanggal(sesi.tanggal)}`}
                              className="grid size-8 place-items-center rounded-lg border border-rose-500/25 bg-rose-500/10 text-rose-300 active:scale-95 disabled:opacity-50"
                            >
                              <Icon name="trash" className="size-3.5" />
                            </button>
                          ) : null}
                        </span>
                      </div>
                      <p className="mt-1 whitespace-pre-line text-xs text-slate-300">
                        {sesi.catatan_konseling}
                      </p>
                      {sesi.tindak_lanjut ? (
                        <p className="mt-1 text-[11px] text-amber-200">
                          Tindak lanjut: {sesi.tindak_lanjut}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {canManage ? (
              <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-4">
                <h2 className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  Catat Sesi Baru
                </h2>
                <div className="mt-2 flex flex-col gap-2">
                  <label
                    htmlFor="bk-tanggal-sesi"
                    className="text-[10px] font-semibold uppercase tracking-wide text-slate-400"
                  >
                    Tanggal sesi
                  </label>
                  <input
                    id="bk-tanggal-sesi"
                    type="date"
                    value={tanggalSesi}
                    onChange={(event) => setTanggalSesi(event.target.value)}
                    className="rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white"
                  />

                  <label
                    htmlFor="bk-catatan-sesi"
                    className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400"
                  >
                    Catatan konseling
                  </label>
                  <textarea
                    id="bk-catatan-sesi"
                    rows={4}
                    value={catatanSesi}
                    onChange={(event) => setCatatanSesi(event.target.value)}
                    className="rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white"
                  />

                  <label
                    htmlFor="bk-tindak-lanjut"
                    className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400"
                  >
                    Tindak lanjut (opsional)
                  </label>
                  <textarea
                    id="bk-tindak-lanjut"
                    rows={2}
                    value={tindakLanjut}
                    onChange={(event) => setTindakLanjut(event.target.value)}
                    className="rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white"
                  />

                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic("light");
                      void simpanSesi();
                    }}
                    disabled={menyimpan}
                    className="mt-2 rounded-xl bg-indigo-500 px-4 py-2.5 text-xs font-black text-white transition hover:bg-indigo-400 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {menyimpan ? "Menyimpan..." : "Simpan Sesi"}
                  </button>
                </div>
              </div>
            ) : null}

            {detailLoading ? (
              <div className="grid place-items-center py-6">
                <div className="size-7 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
              </div>
            ) : null}
          </>
        ) : (
          <>
            {canManage ? (
              <button
                type="button"
                onClick={() => void bukaBuatKasus()}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-indigo-500 text-sm font-black text-white shadow-lg transition hover:bg-indigo-400 active:scale-95"
              >
                <Icon name="plus" className="size-5" />
                Catat Kasus Baru
              </button>
            ) : null}

            <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-3">
              <label
                htmlFor="bk-filter-status"
                className="text-[10px] font-semibold uppercase tracking-wide text-slate-400"
              >
                Filter status
              </label>
              <select
                id="bk-filter-status"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white"
              >
                {STATUS_PILIHAN.map((pilihan) => (
                  <option key={pilihan} value={pilihan}>
                    {pilihan}
                  </option>
                ))}
              </select>

              <label
                htmlFor="bk-pencarian"
                className="mt-3 block text-[10px] font-semibold uppercase tracking-wide text-slate-400"
              >
                Cari nama atau NIS
              </label>
              <div className="mt-1.5 flex gap-2">
                <input
                  id="bk-pencarian"
                  type="search"
                  value={pencarian}
                  onChange={(event) => setPencarian(event.target.value)}
                  className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white"
                />
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic("light");
                    void muatKasus();
                  }}
                  className="rounded-xl bg-indigo-500 px-4 py-2 text-xs font-black text-white transition hover:bg-indigo-400 active:scale-95"
                >
                  Muat
                </button>
              </div>
            </div>

            {loading ? (
              <div className="grid place-items-center py-16">
                <div className="size-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
              </div>
            ) : cases.length === 0 && !error ? (
              <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-6 text-center text-xs text-slate-400">
                Belum ada kasus bimbingan pada filter ini.
              </div>
            ) : (
              <ul className="flex flex-col gap-2">
                {cases.map((kasus) => (
                  <li key={kasus.id_kasus}>
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic("light");
                        void bukaDetail(kasus.id_kasus);
                      }}
                      className="w-full rounded-2xl border border-white/10 bg-slate-900/80 p-3 text-left transition hover:bg-slate-900 active:scale-[0.99]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-bold text-white">
                            {kasus.nama_siswa}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {kasus.nis} · {kasus.nama_rombel}
                          </div>
                        </div>
                        <span
                          className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${warnaStatus(kasus.status)}`}
                        >
                          {kasus.status}
                        </span>
                      </div>
                      <p className="mt-2 line-clamp-2 text-xs text-slate-300">
                        {kasus.ringkasan}
                      </p>
                      <div className="mt-2 flex items-center gap-3 text-[10px] text-slate-500">
                        <span className="uppercase tracking-wide">
                          {kasus.kategori}
                        </span>
                        <span>{kasus.total_sesi} sesi</span>
                        <span>{formatTanggal(kasus.updated_at)}</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <Modal
        isOpen={createOpen}
        onClose={() => {
          if (!menyimpan) setCreateOpen(false);
        }}
        title="Catat Kasus Baru"
        titleId="bk-create-case-title"
        maxWidth="max-w-md"
        footer={
          <div className="flex w-full items-center gap-2">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              disabled={menyimpan}
              className="min-h-11 flex-1 rounded-xl border border-white/10 bg-white/5 text-xs font-bold text-slate-300 active:scale-95 disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="submit"
              form="bk-create-case-form"
              disabled={menyimpan || !activeYearId}
              className="min-h-11 flex-1 rounded-xl bg-indigo-500 text-xs font-black text-white shadow-lg active:scale-95 disabled:opacity-50"
            >
              {menyimpan ? "Menyimpan..." : "Simpan Kasus"}
            </button>
          </div>
        }
      >
        <form
          id="bk-create-case-form"
          onSubmit={(event) => {
            event.preventDefault();
            void simpanKasusBaru();
          }}
          className="flex flex-col gap-3 text-xs"
        >
          {createError ? (
            <FeedbackBanner
              type="error"
              message={createError}
              onClose={() => setCreateError(null)}
              className="text-xs"
            />
          ) : null}

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="bk-create-filter-siswa"
              className="text-[10px] font-semibold uppercase tracking-wide text-slate-400"
            >
              Siswa
            </label>
            <input
              id="bk-create-filter-siswa"
              type="search"
              value={studentFilter}
              onChange={(event) => setStudentFilter(event.target.value)}
              placeholder="Saring nama / NIS..."
              className={INPUT}
            />
            <select
              aria-label="Pilih siswa"
              value={caseForm.id_siswa}
              onChange={(event) =>
                setCaseForm((prev) => ({
                  ...prev,
                  id_siswa: event.target.value,
                }))
              }
              required
              className={INPUT}
            >
              <option value="">
                -- Pilih siswa ({filteredStudents.length}) --
              </option>
              {filteredStudents.map((s) => (
                <option key={String(s.id_siswa)} value={String(s.id_siswa)}>
                  {String(s.nama_lengkap)} · {String(s.nama_rombel || "-")} ·
                  NIS {String(s.nis || "-")}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label
                htmlFor="bk-create-kategori"
                className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400"
              >
                Kategori
              </label>
              <select
                id="bk-create-kategori"
                value={caseForm.kategori}
                onChange={(event) =>
                  setCaseForm((prev) => ({
                    ...prev,
                    kategori:
                      KATEGORI_KASUS.find((k) => k.value === event.target.value)
                        ?.value ?? "kedisiplinan",
                  }))
                }
                className={INPUT}
              >
                {KATEGORI_KASUS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="bk-create-status"
                className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400"
              >
                Status awal
              </label>
              <select
                id="bk-create-status"
                value={caseForm.status}
                onChange={(event) =>
                  setCaseForm((prev) => ({
                    ...prev,
                    status:
                      STATUS_KASUS.find((s) => s === event.target.value) ??
                      "Terbuka",
                  }))
                }
                className={INPUT}
              >
                {STATUS_KASUS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label
              htmlFor="bk-create-ringkasan"
              className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400"
            >
              Ringkasan kasus
            </label>
            <input
              id="bk-create-ringkasan"
              value={caseForm.ringkasan}
              onChange={(event) =>
                setCaseForm((prev) => ({
                  ...prev,
                  ringkasan: event.target.value,
                }))
              }
              required
              className={INPUT}
            />
          </div>

          <div>
            <label
              htmlFor="bk-create-kronologi"
              className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400"
            >
              Kronologi (opsional)
            </label>
            <textarea
              id="bk-create-kronologi"
              rows={4}
              value={caseForm.kronologi}
              onChange={(event) =>
                setCaseForm((prev) => ({
                  ...prev,
                  kronologi: event.target.value,
                }))
              }
              className={INPUT}
            />
          </div>

          <p className="text-[10px] leading-4 text-slate-500">
            Kasus dicatat pada tahun ajaran aktif dan disimpan langsung di cloud
            — tidak pernah di perangkat ini.
          </p>
        </form>
      </Modal>
      {dialogKonfirmasi}
    </MobileAppShell>
  );
}
