"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { MobileAppShell } from "@/components/MobileAppShell";
import { FeedbackBanner } from "@/components/ui/FeedbackBanner";
import { canAccessArea, hasPermission } from "@/lib/auth/access";
import { triggerHaptic } from "@/lib/client/haptics";
import { useAuth } from "@/lib/context/AuthContext";
import {
  addCounselingSessionGateway,
  type CounselingCaseDetail,
  type CounselingCaseItem,
  getCounselingCaseGateway,
  listCounselingCasesGateway,
} from "@/lib/gateways/counseling";

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
 * Halaman ini tidak menyentuh SQLite lokal, outbox, maupun `SNAPSHOT_TABLES`.
 */

const BATAS_KASUS = 100;

const STATUS_PILIHAN = ["Semua", "Terbuka", "Dalam Bimbingan", "Selesai"];

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
                        <span className="text-[10px] text-slate-500">
                          {sesi.konselor}
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
    </MobileAppShell>
  );
}
