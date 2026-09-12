"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { MobileAppShell } from "@/components/MobileAppShell";
import { FeedbackBanner } from "@/components/ui/FeedbackBanner";
import { Modal } from "@/components/ui/Modal";
import { canAccessArea, hasPermission } from "@/lib/auth/access";
import { triggerHaptic } from "@/lib/client/haptics";
import { useAuth } from "@/lib/context/AuthContext";
import {
  cancelWaNotificationGateway,
  getWaConfigGateway,
  listWaNotificationsGateway,
  saveWaConfigGateway,
  type WaConfig,
  type WaNotificationItem,
} from "@/lib/gateways/wa-notification";
import { useConfirmDialog } from "@/lib/hooks/useConfirmDialog";

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
 * PARITAS DENGAN DESKTOP. Versi pertama halaman ini sengaja hanya-baca, dengan
 * alasan "membatalkan menyentuh pengiriman pesan ke nomor wali, dan itu pantas
 * dibuat di layar besar". Alasan itu keliru sebagai aturan: justru pembatalan
 * adalah tindakan yang paling mendesak waktunya — pesan yang salah harus
 * dihentikan SEBELUM terkirim, dan orang yang menyadarinya sering sedang tidak
 * di depan laptop. Menutupnya tidak membuat keputusan itu lebih hati-hati, ia
 * hanya membuatnya terlambat.
 *
 * Yang dijaga bukan kewenangannya melainkan kebenarannya: pembatalan dan
 * pengantrean di Mobile menuju CLOUD lewat `mobile_cancel_wa_notification` dan
 * `mobile_queue_wa_notification`. Memakai ulang command Desktop di sini akan
 * mengubah SQLite lokal yang tidak pernah punya barisnya — `UPDATE` mengenai
 * nol baris, tidak ada event outbox, dan tombolnya mengembalikan sukses tanpa
 * membatalkan apa pun. Tombol yang berbohong lebih buruk daripada tombol yang
 * tidak ada.
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
  const [kabar, setKabar] = useState("");
  const [modalConfig, setModalConfig] = useState(false);
  const [config, setConfig] = useState<WaConfig | null>(null);
  const { konfirmasi, dialogKonfirmasi } = useConfirmDialog();

  /**
   * Penjaga klik ganda.
   *
   * Di halaman ini akibatnya bukan data ganda melainkan pembatalan yang
   * berlomba: dua permintaan pada baris yang sama, dan yang kedua menemukan
   * statusnya sudah bukan `Menunggu` lalu melapor gagal — padahal pembatalannya
   * berhasil. Pengguna akan mengira pesannya tetap terkirim.
   */
  const isSubmittingRef = useRef(false);

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

  const bolehBatalkan = hasPermission(user, "notification.delete");
  const bolehKelola = hasPermission(user, "notification.manage");

  async function batalkan(item: WaNotificationItem) {
    const setuju = await konfirmasi({
      title: "Batalkan pesan ini?",
      description: (
        <>
          Pesan untuk <strong>{item.nama_siswa || item.tujuan_nomor}</strong>{" "}
          tidak akan dikirim. Pembatalan hanya berlaku selama pesannya masih
          berstatus Menunggu.
        </>
      ),
      preserved:
        "Pesan lain dalam antrean dan riwayat pengiriman tidak terpengaruh.",
      confirmLabel: "Batalkan pesan",
      tone: "warning",
    });
    if (!setuju) return;

    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setError(null);
    try {
      await cancelWaNotificationGateway(item.id_notifikasi);
      setKabar("Pesan dibatalkan.");
      await muat();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pesan gagal dibatalkan.");
    } finally {
      isSubmittingRef.current = false;
    }
  }

  async function bukaPengaturan() {
    setError(null);
    try {
      setConfig(await getWaConfigGateway());
      setModalConfig(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Pengaturan gateway gagal dimuat.",
      );
    }
  }

  async function simpanPengaturan(peristiwa: React.FormEvent<HTMLFormElement>) {
    peristiwa.preventDefault();
    if (!config) return;
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setError(null);

    try {
      await saveWaConfigGateway(config);
      setKabar("Pengaturan gateway disimpan.");
      setModalConfig(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Pengaturan gagal disimpan.",
      );
    } finally {
      isSubmittingRef.current = false;
    }
  }

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
          <div className="min-w-0 flex-1">
            <h1 className="font-black text-lg text-white">Antrean WhatsApp</h1>
            <p className="text-[11px] text-slate-400">
              Dibaca dari cloud · membutuhkan koneksi
            </p>
          </div>
          {bolehKelola ? (
            <button
              className="shrink-0 rounded-xl border border-white/15 px-3 py-2 font-bold text-[11px] text-white"
              onClick={() => {
                triggerHaptic("light");
                void bukaPengaturan();
              }}
              type="button"
            >
              Gateway
            </button>
          ) : null}
        </div>

        {error ? (
          <FeedbackBanner
            message={error}
            onClose={() => setError(null)}
            type="error"
          />
        ) : null}
        {kabar ? (
          <FeedbackBanner
            message={kabar}
            onClose={() => setKabar("")}
            type="success"
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
                {/* Hanya baris yang masih Menunggu yang bisa dibatalkan —
                    pesan yang sudah terkirim tidak bisa ditarik kembali, dan
                    menawarkan tombolnya hanya menjanjikan yang tidak bisa
                    ditepati. */}
                {bolehBatalkan && item.status === "Menunggu" ? (
                  <button
                    className="mt-3 rounded-xl border border-amber-400/40 px-3 py-1.5 font-bold text-[11px] text-amber-200"
                    onClick={() => {
                      triggerHaptic("light");
                      void batalkan(item);
                    }}
                    type="button"
                  >
                    Batalkan pesan
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal
        isOpen={modalConfig}
        onClose={() => setModalConfig(false)}
        title="Gateway WhatsApp"
      >
        {config ? (
          <form className="space-y-3 text-sm" onSubmit={simpanPengaturan}>
            <div>
              <label
                className="block text-slate-400 text-xs"
                htmlFor="wa-cfg-provider"
              >
                Provider
              </label>
              <select
                className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white"
                id="wa-cfg-provider"
                onChange={(e) =>
                  setConfig((c) =>
                    c
                      ? {
                          ...c,
                          provider: e.target.value as WaConfig["provider"],
                        }
                      : c,
                  )
                }
                value={config.provider}
              >
                <option value="fonnte">Fonnte</option>
                <option value="wablas">Wablas</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            <div>
              <label
                className="block text-slate-400 text-xs"
                htmlFor="wa-cfg-key"
              >
                API key
              </label>
              <input
                className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white"
                id="wa-cfg-key"
                onChange={(e) =>
                  setConfig((c) => (c ? { ...c, apiKey: e.target.value } : c))
                }
                type="password"
                value={config.apiKey ?? ""}
              />
            </div>
            <div>
              <label
                className="block text-slate-400 text-xs"
                htmlFor="wa-cfg-url"
              >
                API URL <span className="text-[10px]">(opsional)</span>
              </label>
              <input
                className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white"
                id="wa-cfg-url"
                onChange={(e) =>
                  setConfig((c) => (c ? { ...c, apiUrl: e.target.value } : c))
                }
                type="url"
                value={config.apiUrl ?? ""}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                checked={config.isActive}
                id="wa-cfg-aktif"
                onChange={(e) =>
                  setConfig((c) =>
                    c ? { ...c, isActive: e.target.checked } : c,
                  )
                }
                type="checkbox"
              />
              <label className="text-slate-300 text-xs" htmlFor="wa-cfg-aktif">
                Aktifkan pengiriman WhatsApp
              </label>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Sakelar jenis notifikasi (scan masuk, pulang, bolos, ambang alfa)
              ikut sinkronisasi dan diatur di halaman Pengaturan — sakelar itu
              dibaca saat MENGANTRE, bukan saat mengirim.
            </p>
            <button
              className="w-full rounded-xl bg-indigo-500 px-4 py-3 font-bold text-sm text-white"
              type="submit"
            >
              Simpan pengaturan
            </button>
          </form>
        ) : null}
      </Modal>

      {dialogKonfirmasi}
    </MobileAppShell>
  );
}
