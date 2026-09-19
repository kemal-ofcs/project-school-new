"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { DatabaseBackupCard } from "@/components/DatabaseBackupCard";
import { MailSettingsCard } from "@/components/MailSettingsCard";
import { MobileAppShell } from "@/components/MobileAppShell";
import { CompanyProfileCard } from "@/components/settings/CompanyProfileCard";
import { BackHeader } from "@/components/ui/HubRow";
import { Icon } from "@/components/ui/Icon";
import { canAccessArea, hasPermission } from "@/lib/auth/access";
import { triggerHaptic } from "@/lib/client/haptics";
import { useAuth } from "@/lib/context/AuthContext";
import {
  getAutoAlfaSetting,
  type RingkasanAlfa,
  saveAutoAlfaSetting,
  triggerGenerateAlfa,
} from "@/lib/gateways/alfa";
import { subscribeSyncCompleted } from "@/lib/gateways/sync-status";
import {
  clearTursoConfig,
  getDatabaseConfig,
  saveTursoConfig,
  type TursoConnectionStatus,
  testTursoConnection,
} from "@/lib/gateways/turso-config";
import { useConfirmDialog } from "@/lib/hooks/useConfirmDialog";
import {
  DATABASE_PROVIDER_OPTIONS,
  type DatabaseProvider,
  describeProvider,
  providerNeedsEndpoint,
  reviewDatabaseEndpoint,
} from "@/lib/validations/database-endpoint";

export default function SistemInfrastrukturPage() {
  const { konfirmasi, dialogKonfirmasi } = useConfirmDialog();
  const isSubmittingRef = useRef(false);
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const canManageCompanyProfile = hasPermission(user, "settings.manage");
  const canViewSync = canAccessArea(user, "sync");
  const canManageAutoAlfa = hasPermission(user, "settings.manage");
  const canTriggerAlfa = hasPermission(user, "alfa.trigger");
  const canSeeAutoAlfa = canManageAutoAlfa || canTriggerAlfa;

  const [saveMessage, setSaveMessage] = useState("");
  const [autoAlfaEnabled, setAutoAlfaEnabled] = useState(true);
  const [autoAlfaLoading, setAutoAlfaLoading] = useState(true);
  const [autoAlfaBusy, setAutoAlfaBusy] = useState(false);
  const [alfaTriggerBusy, setAlfaTriggerBusy] = useState(false);
  const [alfaSummary, setAlfaSummary] = useState<RingkasanAlfa | null>(null);

  const [tursoUrl, setTursoUrl] = useState("");
  const [tursoProvider, setTursoProvider] = useState<DatabaseProvider>("turso");
  const [tursoAllowInsecure, setTursoAllowInsecure] = useState(false);
  const [tursoTokenSaved, setTursoTokenSaved] = useState(false);
  const [tursoToken, setTursoToken] = useState("");
  const [showTursoToken, setShowTursoToken] = useState(false);
  const [tursoBusy, setTursoBusy] = useState(false);
  const [tursoTesting, setTursoTesting] = useState(false);
  const [tursoTestStatus, setTursoTestStatus] =
    useState<TursoConnectionStatus | null>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/login");
      return;
    }
    // Profil instansi, email sistem, auto alfa, database & sinkronisasi
    // adalah konfigurasi tingkat instansi — tidak ada isinya untuk peran yang
    // tidak memegang satu pun dari izin ini.
    if (
      !authLoading &&
      isAuthenticated &&
      !hasPermission(user, "settings.manage") &&
      !hasPermission(user, "alfa.trigger") &&
      !canAccessArea(user, "sync") &&
      !user?.isSuperadmin
    ) {
      router.replace("/settings");
    }
  }, [authLoading, isAuthenticated, user, router]);

  useEffect(() => {
    let cancelled = false;
    async function loadAutoAlfa() {
      try {
        const enabled = await getAutoAlfaSetting();
        if (!cancelled) setAutoAlfaEnabled(enabled);
      } catch {
        // Pertahankan nilai terakhir; status dimuat ulang saat sync selesai.
      } finally {
        if (!cancelled) setAutoAlfaLoading(false);
      }
    }
    if (isAuthenticated && canSeeAutoAlfa) {
      void loadAutoAlfa();
    } else {
      setAutoAlfaLoading(false);
    }
    if (isAuthenticated && user?.isSuperadmin) {
      // Provider ikut dimuat: tanpa itu perangkat yang terhubung ke server LAN
      // selalu tampil dalam mode Turso dan penyimpanan berikutnya menolak
      // alamat LAN-nya sendiri.
      getDatabaseConfig()
        .then((config) => {
          if (cancelled || !config.configured) return;
          setTursoUrl(config.databaseUrl);
          setTursoProvider(config.provider);
          setTursoAllowInsecure(config.allowInsecureTransport);
          setTursoTokenSaved(config.authTokenSaved);
        })
        .catch(() => undefined);
    }

    const onSyncCompleted = () => {
      if (isAuthenticated && canSeeAutoAlfa) {
        void loadAutoAlfa();
      }
    };
    const lepas = subscribeSyncCompleted(onSyncCompleted);

    return () => {
      cancelled = true;
      lepas();
    };
  }, [isAuthenticated, canSeeAutoAlfa, user?.isSuperadmin]);

  const handleAutoAlfaToggle = async (enabled: boolean) => {
    if (isSubmittingRef.current) return;
    setAutoAlfaBusy(true);
    triggerHaptic("light");
    isSubmittingRef.current = true;
    try {
      await saveAutoAlfaSetting(enabled);
      setAutoAlfaEnabled(enabled);
      triggerHaptic("success");
      setSaveMessage(
        `Auto Generate Alfa berhasil diubah menjadi ${enabled ? "Aktif" : "Nonaktif"}.`,
      );
      setTimeout(() => setSaveMessage(""), 3000);
    } catch (error) {
      triggerHaptic("error");
      setSaveMessage(
        error instanceof Error
          ? error.message
          : "Gagal menyimpan pengaturan Auto Generate Alfa.",
      );
      setTimeout(() => setSaveMessage(""), 4000);
    } finally {
      isSubmittingRef.current = false;
      setAutoAlfaBusy(false);
    }
  };

  const handleTriggerAlfaNow = async () => {
    setAlfaTriggerBusy(true);
    triggerHaptic("light");
    try {
      const ringkasan = await triggerGenerateAlfa();
      setAlfaSummary(ringkasan);
      triggerHaptic("success");
      setSaveMessage(ringkasan.pesan);
      setTimeout(() => setSaveMessage(""), 4000);
    } catch (error) {
      triggerHaptic("error");
      setAlfaSummary(null);
      setSaveMessage(
        error instanceof Error
          ? error.message
          : "Gagal menjalankan Generate Alfa manual.",
      );
      setTimeout(() => setSaveMessage(""), 4000);
    } finally {
      setAlfaTriggerBusy(false);
    }
  };

  // Cermin sisi klien dari `normalize_database_url` di Rust. Backend tetap
  // penjaga sebenarnya; ini hanya supaya formulir bisa menjelaskan lebih awal.
  const tursoEndpoint = reviewDatabaseEndpoint(
    tursoUrl,
    tursoProvider,
    tursoAllowInsecure,
  );
  const tursoProviderInfo = describeProvider(tursoProvider);

  const handleTursoSave = async () => {
    if (isSubmittingRef.current) return;
    const needsEndpoint = providerNeedsEndpoint(tursoProvider);
    if (needsEndpoint && !tursoEndpoint.valid) {
      setSaveMessage(
        tursoEndpoint.issue?.message ?? "URL database tidak dapat dipakai.",
      );
      setTimeout(() => setSaveMessage(""), 4000);
      return;
    }
    if (
      needsEndpoint &&
      tursoEndpoint.tokenRequired &&
      !tursoToken.trim() &&
      !tursoTokenSaved
    ) {
      setSaveMessage("Auth Token wajib diisi untuk alamat database ini.");
      setTimeout(() => setSaveMessage(""), 4000);
      return;
    }
    setTursoBusy(true);
    triggerHaptic("light");
    isSubmittingRef.current = true;
    try {
      await saveTursoConfig(
        needsEndpoint ? tursoUrl.trim() : "",
        needsEndpoint ? tursoToken.trim() : "",
        {
          provider: tursoProvider,
          allowInsecureTransport: tursoAllowInsecure,
        },
      );
      if (tursoToken.trim().length > 0) setTursoTokenSaved(true);
      triggerHaptic("success");
      setSaveMessage(
        `Konfigurasi ${describeProvider(tursoProvider).label} berhasil disimpan ke Vault!`,
      );
      const status = await testTursoConnection(
        tursoUrl.trim(),
        tursoToken.trim(),
        {
          provider: tursoProvider,
          allowInsecureTransport: tursoAllowInsecure,
        },
      );
      setTursoTestStatus(status);
      setTimeout(() => setSaveMessage(""), 4000);
    } catch (error) {
      triggerHaptic("error");
      setSaveMessage(
        error instanceof Error
          ? error.message
          : "Gagal menyimpan konfigurasi Turso.",
      );
      setTimeout(() => setSaveMessage(""), 4000);
    } finally {
      isSubmittingRef.current = false;
      setTursoBusy(false);
    }
  };

  const handleTursoTest = async () => {
    setTursoTesting(true);
    triggerHaptic("light");
    try {
      const status = await testTursoConnection(
        tursoUrl.trim() || undefined,
        tursoToken.trim() || undefined,
        {
          provider: tursoProvider,
          allowInsecureTransport: tursoAllowInsecure,
        },
      );
      setTursoTestStatus(status);
      if (status.connected) {
        triggerHaptic("success");
        setSaveMessage(
          `Koneksi Berhasil! Latensi: ${status.latency_ms ?? 0} ms`,
        );
      } else {
        triggerHaptic("error");
        setSaveMessage(`Koneksi gagal: ${status.error_message || "Error"}`);
      }
      setTimeout(() => setSaveMessage(""), 4000);
    } catch (error) {
      triggerHaptic("error");
      setSaveMessage(
        error instanceof Error ? error.message : "Gagal menguji koneksi Turso.",
      );
      setTimeout(() => setSaveMessage(""), 4000);
    } finally {
      setTursoTesting(false);
    }
  };

  const handleTursoClear = async () => {
    if (
      !(await konfirmasi({
        title: "Hapus konfigurasi database cloud?",
        description:
          "Perangkat ini berhenti tersambung ke database sekolah sampai dikonfigurasi ulang.",
        preserved:
          "Data di cloud tidak terhapus; perangkat lain tetap tersambung seperti biasa.",
        confirmLabel: "Ya, hapus konfigurasi",
        tone: "danger",
      }))
    ) {
      return;
    }
    setTursoBusy(true);
    triggerHaptic("warning");
    try {
      await clearTursoConfig();
      setTursoUrl("");
      setTursoToken("");
      setTursoProvider("turso");
      setTursoAllowInsecure(false);
      setTursoTokenSaved(false);
      setTursoTestStatus(null);
      setSaveMessage("Konfigurasi database cloud Turso berhasil direset.");
      setTimeout(() => setSaveMessage(""), 3000);
    } catch (_error) {
      setSaveMessage("Gagal mereset konfigurasi.");
    } finally {
      setTursoBusy(false);
    }
  };

  return (
    <MobileAppShell>
      <div className="flex flex-col gap-4">
        <BackHeader
          href="/settings"
          label="Pengaturan"
          title="Sistem & Infrastruktur"
        />

        {saveMessage && (
          <div className="rounded-2xl border border-sky-500/30 bg-sky-950/60 p-3 text-xs font-bold text-sky-200 shadow-lg">
            {saveMessage}
          </div>
        )}

        {/* Profil instansi, nama aplikasi, logo & TTD ID Card */}
        {canManageCompanyProfile ? <CompanyProfileCard /> : null}

        {/* Email Sistem: satu-satunya jalur pengiriman link Lupa Password. */}
        {canManageAutoAlfa ? <MailSettingsCard /> : null}

        {/* Auto Generate Alfa (butuh izin settings.manage / alfa.trigger) */}
        {canSeeAutoAlfa ? (
          <div className="rounded-3xl border border-amber-500/20 bg-gradient-to-br from-amber-950/25 via-slate-900/80 to-slate-900/90 p-4 backdrop-blur-md">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-amber-500/20 text-amber-300">
                  <Icon name="clock" className="size-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-white">
                    Auto Generate Alfa
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Tandai Alfa otomatis setelah cutoff shift
                  </p>
                </div>
              </div>
              <span
                className={`shrink-0 rounded-md border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${
                  autoAlfaEnabled
                    ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
                    : "border-white/10 bg-slate-500/10 text-slate-400"
                }`}
              >
                {autoAlfaLoading
                  ? "Memuat"
                  : autoAlfaEnabled
                    ? "Aktif"
                    : "Nonaktif"}
              </span>
            </div>

            <p className="mt-3 rounded-2xl border border-white/10 bg-slate-950/60 p-3 text-[11px] leading-4 text-slate-400">
              Karyawan aktif sesi NORMAL yang belum hadir dan tanpa koreksi
              Sakit/Izin/Dispen ditandai Alfa setelah jam pulang dikurangi
              offset shift. Pada tanggal hari libur aktif, proses ini otomatis
              dilewati.
            </p>

            {canManageAutoAlfa ? (
              <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-950/60 p-3">
                <div className="min-w-0">
                  <span className="text-xs font-bold text-white">
                    Status Otomasi
                  </span>
                  <p className="text-[11px] text-slate-400">
                    Matikan untuk menangguhkan penandaan Alfa di seluruh sistem.
                  </p>
                </div>
                <label className="relative inline-flex shrink-0 cursor-pointer items-center">
                  <input
                    type="checkbox"
                    checked={autoAlfaEnabled}
                    disabled={autoAlfaBusy || autoAlfaLoading}
                    onChange={(e) => {
                      void handleAutoAlfaToggle(e.target.checked);
                    }}
                    className="peer sr-only"
                  />
                  <div className="peer h-6 w-11 rounded-full bg-slate-800 after:absolute after:top-0.5 after:left-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-slate-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-amber-400 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-disabled:opacity-50" />
                </label>
              </div>
            ) : (
              <p className="mt-3 rounded-2xl border border-white/10 bg-slate-950/40 p-3 text-[11px] font-semibold text-slate-500">
                Role Anda hanya dapat menjalankan Generate Alfa manual. Mengubah
                status otomasi membutuhkan izin Kelola Pengaturan Sistem.
              </p>
            )}

            {canTriggerAlfa ? (
              <button
                type="button"
                disabled={alfaTriggerBusy}
                onClick={() => {
                  void handleTriggerAlfaNow();
                }}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-black text-slate-950 shadow-md transition hover:bg-amber-400 active:scale-95 disabled:opacity-50"
              >
                <Icon
                  name={alfaTriggerBusy ? "clock" : "check"}
                  className={`size-4 ${alfaTriggerBusy ? "animate-spin" : ""}`}
                />
                {alfaTriggerBusy
                  ? "Memproses..."
                  : "Jalankan Generate Alfa Sekarang"}
              </button>
            ) : null}

            {alfaSummary ? (
              <div className="mt-3 grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-slate-950/60 p-3 text-[11px]">
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Alfa dibuat:</span>
                  <span className="font-black text-amber-300">
                    {alfaSummary.jumlahAlfaDibuat}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Sudah ada:</span>
                  <span className="font-bold text-slate-200">
                    {alfaSummary.jumlahSudahAda}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Belum waktunya:</span>
                  <span className="font-bold text-slate-200">
                    {alfaSummary.jumlahBelumWaktunya}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Fleksibel (dinilai):</span>
                  <span className="font-bold text-slate-200">
                    {alfaSummary.jumlahFleksibel}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Hari libur:</span>
                  <span className="font-bold text-slate-200">
                    {alfaSummary.jumlahLibur}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Shift tidak valid:</span>
                  <span className="font-bold text-rose-300">
                    {alfaSummary.jumlahShiftTidakValid}
                  </span>
                </div>
                <p className="col-span-2 pt-1 text-[11px] leading-4 text-slate-400">
                  {alfaSummary.pesan}
                </p>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Superadmin Turso Database Cloud Section */}
        {user?.isSuperadmin ? (
          <div className="rounded-3xl border border-cyan-400/20 bg-gradient-to-br from-cyan-950/20 via-slate-900/90 to-slate-900/95 p-4 backdrop-blur-md">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2.5">
                <div className="grid size-9 place-items-center rounded-xl bg-cyan-400/20 text-cyan-300">
                  <Icon name="database" className="size-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    Database (LibSQL)
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Turso Cloud atau server database Anda sendiri
                  </p>
                </div>
              </div>
              <span className="rounded-md bg-cyan-400/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-cyan-300 border border-cyan-400/20">
                Superadmin
              </span>
            </div>

            <div className="space-y-3 pt-1">
              <fieldset className="space-y-2">
                <legend className="block text-[11px] font-bold text-slate-300">
                  Jenis Database
                </legend>
                {DATABASE_PROVIDER_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    className={`grid min-w-0 cursor-pointer gap-1 rounded-xl border p-2.5 text-[11px] leading-4 transition ${
                      tursoProvider === option.value
                        ? "border-cyan-400/60 bg-cyan-400/10 text-cyan-100"
                        : "border-white/10 bg-slate-950/60 text-slate-400"
                    }`}
                  >
                    <span className="flex items-center gap-2 font-black">
                      <input
                        type="radio"
                        name="mobile-database-provider"
                        value={option.value}
                        checked={tursoProvider === option.value}
                        onChange={() => {
                          setTursoProvider(option.value);
                          setTursoAllowInsecure(false);
                          setTursoTestStatus(null);
                        }}
                        className="size-4 shrink-0 accent-cyan-400"
                      />
                      <span className="min-w-0 truncate">{option.label}</span>
                    </span>
                    <span className="font-normal opacity-80">
                      {option.description}
                    </span>
                  </label>
                ))}
              </fieldset>

              {providerNeedsEndpoint(tursoProvider) ? (
                <div>
                  <label
                    htmlFor="turso-url-input"
                    className="block text-[11px] font-bold text-slate-300 mb-1"
                  >
                    {tursoProvider === "turso"
                      ? "URL Database Cloud"
                      : "Alamat Server Database"}
                  </label>
                  <input
                    id="turso-url-input"
                    type="text"
                    inputMode="url"
                    value={tursoUrl}
                    onChange={(e) => {
                      setTursoUrl(e.target.value);
                      setTursoTestStatus(null);
                    }}
                    placeholder={tursoProviderInfo.urlPlaceholder}
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs font-mono text-white outline-none focus:border-cyan-400"
                  />
                  {tursoUrl.trim().length > 0 && tursoEndpoint.issue ? (
                    <p className="mt-1 text-[11px] leading-4 text-amber-300">
                      {tursoEndpoint.issue.message}
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-xl border border-cyan-400/30 bg-cyan-400/5 p-2.5 text-[11px] font-bold leading-4 text-cyan-100">
                  Data disimpan pada berkas SQLite di perangkat ini. Tidak ada
                  alamat server maupun Auth Token yang perlu diisi, dan aplikasi
                  berjalan penuh tanpa internet.
                </div>
              )}

              {tursoProvider === "self_hosted" &&
              (tursoEndpoint.issue?.code === "INSECURE_PUBLIC" ||
                tursoAllowInsecure) ? (
                <label className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-2.5 text-[11px] font-bold leading-4 text-rose-200">
                  <input
                    type="checkbox"
                    checked={tursoAllowInsecure}
                    onChange={(e) => {
                      setTursoAllowInsecure(e.target.checked);
                      setTursoTestStatus(null);
                    }}
                    className="mt-0.5 size-4 shrink-0 accent-rose-400"
                  />
                  <span>
                    Izinkan koneksi tanpa enkripsi ke alamat publik. Auth Token
                    dan data absensi dikirim sebagai teks biasa. Pakai hanya
                    pada jaringan yang benar-benar Anda percayai.
                  </span>
                </label>
              ) : null}

              {providerNeedsEndpoint(tursoProvider) ? (
                <div>
                  <label
                    htmlFor="turso-token-input"
                    className="block text-[11px] font-bold text-slate-300 mb-1"
                  >
                    {tursoEndpoint.tokenRequired
                      ? "Auth Token Database"
                      : "Auth Token Database (opsional)"}
                  </label>
                  <div className="relative">
                    <input
                      id="turso-token-input"
                      type={showTursoToken ? "text" : "password"}
                      value={tursoToken}
                      onChange={(e) => setTursoToken(e.target.value)}
                      placeholder={
                        tursoTokenSaved
                          ? "•••••••••••••••• (Tersimpan di vault)"
                          : tursoProviderInfo.tokenPlaceholder
                      }
                      className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 pr-16 text-xs font-mono text-white outline-none focus:border-cyan-400"
                    />
                    <button
                      type="button"
                      onClick={() => setShowTursoToken((prev) => !prev)}
                      className="absolute right-1.5 top-1.5 rounded-lg bg-white/5 px-2 py-1 text-[10px] font-bold text-slate-300"
                    >
                      {showTursoToken ? "Tutup" : "Lihat"}
                    </button>
                  </div>
                </div>
              ) : null}

              {tursoTestStatus ? (
                <div
                  className={`rounded-xl border p-2.5 text-xs font-semibold ${
                    tursoTestStatus.connected
                      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                      : "border-rose-500/20 bg-rose-500/10 text-rose-300"
                  }`}
                >
                  {tursoTestStatus.connected
                    ? `Terhubung ke ${tursoProviderInfo.label} (Latensi: ${tursoTestStatus.latency_ms ?? 0} ms)`
                    : `Gagal terhubung: ${tursoTestStatus.error_message || "Periksa token/URL"}`}
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleTursoSave}
                  disabled={tursoBusy || tursoTesting}
                  className="flex-1 min-h-10 rounded-xl bg-cyan-400 px-3 text-xs font-black text-slate-950 shadow-md active:scale-95 transition disabled:opacity-50"
                >
                  {tursoBusy ? "Menyimpan..." : "Simpan ke Vault"}
                </button>
                <button
                  type="button"
                  onClick={handleTursoTest}
                  disabled={tursoBusy || tursoTesting}
                  className="min-h-10 rounded-xl border border-cyan-400/40 bg-cyan-400/10 px-3 text-xs font-bold text-cyan-200 active:scale-95 transition disabled:opacity-50"
                >
                  {tursoTesting ? "Menguji..." : "Uji Koneksi"}
                </button>
                {tursoUrl ? (
                  <button
                    type="button"
                    onClick={handleTursoClear}
                    disabled={tursoBusy || tursoTesting}
                    className="min-h-10 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 text-xs font-bold text-rose-300 active:scale-95 transition disabled:opacity-50"
                  >
                    Reset
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {user?.isSuperadmin ? (
          <DatabaseBackupCard provider={tursoProvider} />
        ) : null}

        {/* Pusat Sinkronisasi Shortcut (area sync) */}
        {canViewSync ? (
          <div className="rounded-3xl border border-sky-500/20 bg-gradient-to-br from-sky-950/30 via-slate-900/80 to-slate-900/90 p-4 backdrop-blur-md">
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="flex items-center gap-2.5">
                <div className="grid size-9 place-items-center rounded-xl bg-sky-500/20 text-sky-300">
                  <Icon name="sync" className="size-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    Pusat Sinkronisasi Data
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Antrean outbox offline, riwayat push & snapshot
                  </p>
                </div>
              </div>
              <Link
                href="/sync"
                onClick={() => triggerHaptic("light")}
                className="rounded-xl bg-sky-400 px-3.5 py-1.5 text-xs font-black text-slate-950 shadow-md hover:bg-sky-300 active:scale-95 transition"
              >
                Buka →
              </Link>
            </div>
          </div>
        ) : null}
      </div>

      {dialogKonfirmasi}
    </MobileAppShell>
  );
}
