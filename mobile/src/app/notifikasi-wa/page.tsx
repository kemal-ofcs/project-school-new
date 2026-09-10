"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { MobileAppShell } from "@/components/MobileAppShell";
import { FeedbackBanner } from "@/components/ui/FeedbackBanner";
import { canAccessArea } from "@/lib/auth/access";
import { triggerHaptic } from "@/lib/client/haptics";
import { useAuth } from "@/lib/context/AuthContext";
import {
  listWaNotificationsGateway,
  type WaNotificationItem,
} from "@/lib/gateways/wa-notification";

/**
 * Tinjauan antrean WhatsApp versi genggam — HANYA BACA, dan dari CLOUD.
 *
 * `notifikasi_wa` berada di luar `SNAPSHOT_TABLES`: barisnya lahir di perangkat
 * yang melakukan pemindaian, didorong ke cloud, dan TIDAK pernah ditarik
 * kembali. Membaca tabel lokal di ponsel yang bukan terminal karena itu selalu
 * menghasilkan daftar kosong — dan kosong tidak bisa dibedakan dari "tidak ada
 * notifikasi". Karena itu gateway-nya bercabang ke `mobile_list_wa_notifications`
 * yang membaca cloud.
 *
 * Konsekuensinya halaman ini MENUNTUT JARINGAN, dan kegagalannya wajib berkata
 * apa adanya alih-alih menampilkan daftar kosong.
 *
 * Sengaja tanpa aksi ubah: membatalkan atau mengantre ulang notifikasi menyentuh
 * jalur pengiriman pesan ke nomor wali seorang siswa — tidak bisa ditarik
 * kembali — dan itu keputusan yang pantas dibuat di layar besar.
 */

const BATAS_ANTREAN = 200;

const STATUS_PILIHAN = ["Semua", "Menunggu", "Terkirim", "Gagal", "Dibatalkan"];

const JENIS_LABEL: Record<string, string> = {
  scan_masuk: "Scan Masuk",
  scan_pulang: "Scan Pulang",
  bolos: "Bolos",
  ambang_alfa: "Ambang Alfa",
};

function warnaStatus(status: string) {
  if (status === "Terkirim")
    return "border-emerald-400/30 bg-emerald-400/10 text-emerald-200";
  if (status === "Gagal")
    return "border-rose-400/30 bg-rose-400/10 text-rose-200";
  if (status === "Dibatalkan")
    return "border-slate-400/30 bg-slate-400/10 text-slate-300";
  return "border-amber-400/30 bg-amber-400/10 text-amber-200";
}

function formatWaktu(value: string) {
  if (!value) return "-";
  const bersih = value.replace(" ", "T");
  const waktu = new Date(bersih.endsWith("Z") ? bersih : `${bersih}Z`);
  if (Number.isNaN(waktu.getTime())) return value;
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(waktu);
}

export default function NotifikasiWaMobilePage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const canView = canAccessArea(user, "notifikasi_wa");

  const [items, setItems] = useState<WaNotificationItem[]>([]);
  const [status, setStatus] = useState("Semua");
  const [tanggal, setTanggal] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const muat = useCallback(async () => {
    setLoading(true);
    try {
      const hasil = await listWaNotificationsGateway({
        status: status === "Semua" ? null : status,
        tanggal: tanggal || null,
        // Antrean tumbuh ±1.600 baris per hari pada sekolah 800 siswa; batas
        // ini yang menjaga balasannya tetap wajar di perangkat genggam.
        limit: BATAS_ANTREAN,
      });
      setItems(hasil.items);
      setError(null);
    } catch (err) {
      setItems([]);
      setError(
        err instanceof Error
          ? `${err.message} — antrean dibaca dari cloud, jadi tinjauan ini membutuhkan koneksi.`
          : "Gagal memuat antrean. Tinjauan notifikasi membutuhkan koneksi jaringan.",
      );
    } finally {
      setLoading(false);
    }
  }, [status, tanggal]);

  useEffect(() => {
    if (authLoading || !isAuthenticated || !canView) return;
    void muat();
  }, [authLoading, isAuthenticated, canView, muat]);

  return (
    <MobileAppShell>
      <div className="flex flex-col gap-4 text-slate-100">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              triggerHaptic("light");
              router.push("/dashboard");
            }}
            aria-label="Kembali ke Dasbor"
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
            <h1 className="text-lg font-black text-white">Antrean WhatsApp</h1>
            <p className="text-[11px] text-slate-400">
              Dibaca dari cloud · membutuhkan koneksi
            </p>
          </div>
        </div>

        {error ? (
          <FeedbackBanner
            type="error"
            message={error}
            onClose={() => setError(null)}
          />
        ) : null}

        <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-3">
          <label
            htmlFor="wa-filter-status"
            className="text-[10px] font-semibold uppercase tracking-wide text-slate-400"
          >
            Filter status
          </label>
          <select
            id="wa-filter-status"
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
            htmlFor="wa-filter-tanggal"
            className="mt-3 block text-[10px] font-semibold uppercase tracking-wide text-slate-400"
          >
            Filter tanggal
          </label>
          <div className="mt-1.5 flex gap-2">
            <input
              id="wa-filter-tanggal"
              type="date"
              value={tanggal}
              onChange={(event) => setTanggal(event.target.value)}
              className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white"
            />
            <button
              type="button"
              onClick={() => {
                triggerHaptic("light");
                void muat();
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
        ) : items.length === 0 && !error ? (
          <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-6 text-center text-xs text-slate-400">
            Tidak ada notifikasi pada filter ini.
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((item) => (
              <li
                key={item.id_notifikasi}
                className="rounded-2xl border border-white/10 bg-slate-900/80 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-white">
                      {item.nama_siswa || item.tujuan_nomor}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {item.nama_rombel ? `${item.nama_rombel} · ` : ""}
                      {item.tujuan_nomor}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${warnaStatus(item.status)}`}
                  >
                    {item.status}
                  </span>
                </div>
                <p className="mt-2 line-clamp-3 whitespace-pre-line text-xs text-slate-300">
                  {item.isi_pesan}
                </p>
                {item.last_error ? (
                  <p className="mt-1 text-[11px] text-rose-200">
                    {item.last_error}
                  </p>
                ) : null}
                <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-slate-500">
                  <span className="uppercase tracking-wide">
                    {JENIS_LABEL[item.jenis] ?? item.jenis}
                  </span>
                  <span>{formatWaktu(item.created_at)}</span>
                  {item.attempt_count > 0 ? (
                    <span>{item.attempt_count}x percobaan</span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </MobileAppShell>
  );
}
