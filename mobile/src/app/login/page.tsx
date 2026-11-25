"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { BootstrapPanel } from "@/components/BootstrapPanel";
import { LicenseActivationPanel } from "@/components/license/LicenseActivationPanel";
import { ThemeToggle } from "@/components/ThemeToggle";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { FeedbackBanner } from "@/components/ui/FeedbackBanner";
import { Icon } from "@/components/ui/Icon";
import { triggerHaptic } from "@/lib/client/haptics";
import { BRANDING } from "@/lib/constants/branding";
import { useAuth } from "@/lib/context/AuthContext";
import {
  type BootstrapStatus,
  getBootstrapStatus,
} from "@/lib/gateways/bootstrap";
import { isLicenseBlocking } from "@/lib/gateways/license";
import { useAppName } from "@/lib/hooks/useAppName";
import { useCompanyName } from "@/lib/hooks/useCompanyName";
import { useLicenseStatus } from "@/lib/hooks/useLicenseStatus";
import { useOnlineStatus } from "@/lib/hooks/useOnlineStatus";
import packageJson from "../../../package.json";

/** Hanya username yang diingat, dan hanya bila pengguna mencentangnya. */
const REMEMBER_USERNAME_KEY = "sppg_ingat_username";

function parseCooldownSeconds(msg: string): number {
  if (
    !msg.toLowerCase().includes("terlalu banyak") &&
    !msg.toLowerCase().includes("rate_limited") &&
    !msg.toLowerCase().includes("dikunci")
  ) {
    return 0;
  }
  let totalSec = 0;
  const minMatch = msg.match(/(\d+)\s*menit/i);
  const secMatch = msg.match(/(\d+)\s*detik/i);
  if (minMatch) totalSec += Number.parseInt(minMatch[1], 10) * 60;
  if (secMatch) totalSec += Number.parseInt(secMatch[1], 10);
  if (totalSec === 0) totalSec = 120;
  return totalSec;
}

export default function LoginPage() {
  const { login, isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const isOnline = useOnlineStatus();
  const appName = useAppName();
  const companyName = useCompanyName();
  const hasCompany =
    Boolean(companyName) && companyName !== BRANDING.defaultCompanyName;

  const [username, setUsername] = useState("");
  // Kolom kode baru muncul setelah server menyatakan password sudah benar.
  const [totpCode, setTotpCode] = useState<string>("");
  const [needsTotp, setNeedsTotp] = useState<boolean>(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberUsername, setRememberUsername] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);
  const [bootstrapStatus, setBootstrapStatus] =
    useState<BootstrapStatus | null>(null);
  // Dibuka manual ketika kredensial database tersimpan tetapi database cloud-nya
  // tidak menjawab. Tanpa pintu ini, perangkat yang menunjuk database Turso yang
  // sudah dihapus terkunci di form login: provisioning tidak pernah muncul lagi
  // dan tidak ada tempat untuk memasukkan URL database baru.
  const [showDatabaseSetup, setShowDatabaseSetup] = useState(false);
  // Status provisioning belum diketahui pada render pertama. Tanpa penanda ini
  // form login sempat tampil lebih dulu di peluncuran pertama, sehingga instalasi
  // baru terlihat seperti "langsung masuk ke halaman login" padahal layar
  // provisioning menyusul sepersekian detik kemudian.
  const [bootstrapChecked, setBootstrapChecked] = useState(false);

  const refreshBootstrapStatus = useCallback(() => {
    void getBootstrapStatus()
      .then((status) => {
        setBootstrapStatus(status);
        if (status?.reachable) setShowDatabaseSetup(false);
      })
      .catch(() => setBootstrapStatus(null))
      .finally(() => setBootstrapChecked(true));
  }, []);

  useEffect(() => {
    refreshBootstrapStatus();
  }, [refreshBootstrapStatus]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(REMEMBER_USERNAME_KEY);
      if (saved) {
        setUsername(saved);
        setRememberUsername(true);
      }
    } catch {
      // Penyimpanan diblokir: form tetap jalan tanpa username tersimpan.
    }
  }, []);

  // Dibaca setelah database siap: database yang belum diprovisioning meminta
  // lisensinya di BootstrapPanel.
  const {
    status: licenseStatus,
    refresh: refreshLicense,
    setStatus: setLicenseStatus,
  } = useLicenseStatus(false);
  // Dibaca ulang setiap status database berubah: perangkat yang baru
  // bergabung ke database berlisensi menemukan lisensinya di sana.
  useEffect(() => {
    if (bootstrapStatus) void refreshLicense();
  }, [bootstrapStatus, refreshLicense]);
  // Pemasangan baru meminta lisensi SEBELUM provisioning; perangkat lain
  // milik lembaga yang sama melewatinya karena lisensinya sudah di database.
  const [joiningLicensedDatabase, setJoiningLicensedDatabase] = useState(false);

  // Live countdown ticker
  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = setInterval(() => {
      setCooldownSeconds((prev) => {
        if (prev <= 1) {
          setErrorMessage("");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownSeconds]);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      router.replace("/dashboard");
    }
  }, [authLoading, isAuthenticated, router]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (
      isSubmittingRef.current ||
      cooldownSeconds > 0 ||
      !username.trim() ||
      !password
    )
      return;

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setErrorMessage("");
    triggerHaptic("light");

    try {
      const result = await login(
        username.trim(),
        password,
        needsTotp ? totpCode : undefined,
      );
      if (result.sukses) {
        triggerHaptic("success");
        try {
          if (rememberUsername) {
            localStorage.setItem(REMEMBER_USERNAME_KEY, username.trim());
          } else {
            localStorage.removeItem(REMEMBER_USERNAME_KEY);
          }
        } catch {
          // Gagal menyimpan username tidak boleh menggagalkan login.
        }
        router.replace("/dashboard");
      } else {
        triggerHaptic("error");
        if (result.requiresTotp) setNeedsTotp(true);
        const msg = result.pesan || "Login gagal.";
        setErrorMessage(msg);
        const cooldown = parseCooldownSeconds(msg);
        if (cooldown > 0) setCooldownSeconds(cooldown);
        void refreshLicense();
      }
    } catch (err: unknown) {
      triggerHaptic("error");
      const message =
        err instanceof Error
          ? err.message
          : "Gagal terhubung ke modul autentikasi.";
      setErrorMessage(message);
      const cooldown = parseCooldownSeconds(message);
      if (cooldown > 0) setCooldownSeconds(cooldown);
      // Login bisa ditolak karena lisensinya; membaca ulang status memunculkan
      // layar aktivasi alih-alih membiarkan form login buntu.
      void refreshLicense();
    } finally {
      setIsSubmitting(false);
      isSubmittingRef.current = false;
    }
  };

  if (!isAuthenticated && !bootstrapChecked) {
    return (
      <div className="login-shell min-h-dvh flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="size-10 rounded-full border-3 border-amber-400 border-t-transparent animate-spin" />
          <span className="login-muted text-xs font-semibold">
            Memeriksa konfigurasi database...
          </span>
        </div>
      </div>
    );
  }

  if (
    !isAuthenticated &&
    bootstrapStatus?.required &&
    !joiningLicensedDatabase &&
    licenseStatus &&
    isLicenseBlocking(licenseStatus)
  ) {
    return (
      <div className="login-shell min-h-dvh flex items-center p-4 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <div className="w-full max-w-sm mx-auto rounded-3xl border border-white/15 bg-slate-900/90 p-6 shadow-2xl">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Langkah 1 dari 2 · setelah lisensi aktif, lanjut ke pengaturan
            database
          </p>
          <LicenseActivationPanel
            status={licenseStatus}
            onInstalled={setLicenseStatus}
          />
          <button
            type="button"
            onClick={() => setJoiningLicensedDatabase(true)}
            className="mt-3 min-h-10 w-full rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 text-xs font-semibold text-sky-300 active:scale-[0.98] transition"
          >
            Perangkat ini bergabung ke database lembaga yang sudah berlisensi
          </button>
        </div>
      </div>
    );
  }

  if (!isAuthenticated && bootstrapStatus?.required) {
    return (
      <BootstrapPanel
        status={bootstrapStatus}
        onCompleted={refreshBootstrapStatus}
      />
    );
  }

  if (!isAuthenticated && bootstrapStatus && showDatabaseSetup) {
    return (
      <BootstrapPanel
        status={bootstrapStatus}
        onCompleted={refreshBootstrapStatus}
        onCancel={() => setShowDatabaseSetup(false)}
      />
    );
  }

  if (!isAuthenticated && licenseStatus && isLicenseBlocking(licenseStatus)) {
    return (
      <div className="login-shell min-h-dvh flex items-center p-4 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <div className="w-full max-w-sm mx-auto rounded-3xl border border-white/15 bg-slate-900/90 p-6 shadow-2xl">
          <LicenseActivationPanel
            status={licenseStatus}
            onInstalled={(next) => {
              setLicenseStatus(next);
              setErrorMessage("");
            }}
          />
          <button
            type="button"
            onClick={() => setShowDatabaseSetup(true)}
            className="mt-3 min-h-10 w-full rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 text-xs font-semibold text-sky-300 active:scale-[0.98] transition"
          >
            Koneksi Database
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="login-shell min-h-dvh flex flex-col">
      {/* Hero selalu navy; `theme-invariant` menjaga isinya tetap palet gelap
          walau tema terang aktif. */}
      <header className="login-hero theme-invariant overflow-hidden px-6 pt-[calc(1.25rem+env(safe-area-inset-top))] pb-16">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <BrandLogo size={44} />
            {hasCompany ? (
              <p className="login-hero-name truncate text-sm font-bold leading-tight">
                {companyName}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="login-chip inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium">
              <span
                aria-hidden="true"
                className={`size-2 rounded-full ${
                  isOnline ? "bg-emerald-400" : "bg-amber-400"
                }`}
              />
              {isOnline ? "Online" : "Offline"}
            </span>
            <ThemeToggle />
          </div>
        </div>
        <h1 className="login-hero-title mt-7 text-3xl font-black tracking-tight">
          {appName}
        </h1>
        <p className="login-hero-sub mt-1 text-sm">
          Sistem Absensi & Manajemen Operator
        </p>
      </header>

      <main className="relative -mt-10 flex flex-1 flex-col px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        {/* Database cloud tersimpan tetapi tidak menjawab: tawarkan konfigurasi
            ulang, jangan biarkan pengguna menebak-nebak di form login. */}
        {bootstrapStatus?.configured && !bootstrapStatus.reachable ? (
          <div className="mb-4 w-full max-w-sm mx-auto rounded-2xl border border-amber-500/30 bg-amber-950/50 p-4 text-xs leading-5 text-amber-100">
            <p className="font-bold text-amber-300">
              Database cloud tidak dapat dihubungi
            </p>
            <p className="mt-1 text-[11px] text-amber-200/90">
              {bootstrapStatus.message ??
                "Perangkat ini masih menunjuk database lama."}
            </p>
            <p className="mt-1 text-[11px] text-amber-200/70">
              Kalau internet aktif dan database sudah diganti/dihapus, arahkan
              aplikasi ke database yang baru. Login offline tetap bisa dipakai
              bila perangkat ini pernah login online sebelumnya.
            </p>
            <button
              type="button"
              onClick={() => setShowDatabaseSetup(true)}
              className="mt-3 min-h-10 w-full rounded-xl border border-amber-400/40 bg-amber-500/10 px-3 text-xs font-bold text-amber-200 active:scale-[0.98] transition"
            >
              Konfigurasi ulang database
            </button>
          </div>
        ) : null}

        <div className="login-panel w-full max-w-sm mx-auto rounded-3xl p-6 shadow-2xl">
          <h2 className="login-heading text-2xl font-extrabold tracking-tight">
            Masuk ke Aplikasi
          </h2>
          <p className="login-muted mt-1 mb-5 text-sm">
            Masukkan username dan kata sandi Anda.
          </p>

          {cooldownSeconds > 0 ? (
            <div
              role="alert"
              className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-950/50 p-4 text-center text-xs font-medium text-amber-200"
            >
              <p className="mb-1 font-bold text-amber-300">
                Akun Terkunci Sementara
              </p>
              <p className="text-[11px] text-amber-200/80">
                Terlalu banyak percobaan gagal. Silakan coba lagi dalam:
              </p>
              <div className="mt-2 inline-flex items-center gap-1 rounded-xl bg-slate-950/80 px-3 py-1 font-mono text-sm font-black text-amber-400 border border-amber-500/20">
                <span>
                  {Math.floor(cooldownSeconds / 60) > 0
                    ? `${Math.floor(cooldownSeconds / 60)}m `
                    : ""}
                  {cooldownSeconds % 60}s
                </span>
              </div>
            </div>
          ) : errorMessage ? (
            <FeedbackBanner
              type="error"
              message={errorMessage}
              className="mb-4"
              onClose={() => setErrorMessage("")}
            />
          ) : null}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label
                htmlFor="username"
                className="login-label mb-1.5 block text-sm font-medium"
              >
                Username / Kode Operator
              </label>
              <div className="login-field flex items-center gap-3 rounded-2xl px-4">
                <Icon
                  name="user"
                  className="login-field-icon size-5 shrink-0"
                />
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="contoh: super001"
                  autoComplete="username"
                  autoCapitalize="none"
                  required
                  disabled={cooldownSeconds > 0}
                  className="min-h-12 w-full min-w-0 bg-transparent text-base outline-none disabled:opacity-50"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="password"
                className="login-label mb-1.5 block text-sm font-medium"
              >
                Kata Sandi / PIN
              </label>
              <div className="login-field flex items-center gap-3 rounded-2xl pl-4 pr-1">
                <Icon
                  name="lock"
                  className="login-field-icon size-5 shrink-0"
                />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="kata sandi"
                  autoComplete="current-password"
                  required
                  disabled={cooldownSeconds > 0}
                  className="min-h-12 w-full min-w-0 bg-transparent text-base outline-none disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label="Tampilkan kata sandi"
                  aria-pressed={showPassword}
                  className="login-field-btn grid size-11 shrink-0 place-items-center rounded-xl transition"
                >
                  <Icon
                    name={showPassword ? "eye-off" : "eye"}
                    className="size-5"
                  />
                </button>
              </div>
            </div>

            {needsTotp ? (
              <div>
                <label
                  htmlFor="totp-input"
                  className="login-label mb-1.5 block text-sm font-medium"
                >
                  Kode Verifikasi 2FA
                </label>
                <div className="login-field rounded-2xl px-4">
                  <input
                    id="totp-input"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={16}
                    value={totpCode}
                    onChange={(event) => setTotpCode(event.target.value)}
                    placeholder="123456 atau kode cadangan"
                    className="min-h-12 w-full min-w-0 bg-transparent text-base font-mono tracking-[0.25em] outline-none"
                  />
                </div>
                <p className="login-muted mt-1.5 text-xs">
                  Buka aplikasi autentikator Anda, atau masukkan kode cadangan.
                </p>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
              <label className="login-label inline-flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={rememberUsername}
                  onChange={(e) => setRememberUsername(e.target.checked)}
                  className="login-check size-5"
                />
                Ingat username
              </label>
              <Link
                href="/lupa-password"
                className="login-link inline-flex min-h-11 items-center rounded text-sm font-semibold"
              >
                Lupa Password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={
                isSubmitting ||
                cooldownSeconds > 0 ||
                !username.trim() ||
                !password
              }
              className="login-btn flex min-h-12 w-full items-center justify-center rounded-2xl font-bold text-sm disabled:opacity-50 active:scale-[0.98] transition-all"
            >
              {isSubmitting ? (
                <div className="flex items-center gap-2">
                  <div className="size-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
                  <span>Memverifikasi...</span>
                </div>
              ) : cooldownSeconds > 0 ? (
                <span>Terkunci ({cooldownSeconds}s)</span>
              ) : (
                <span>Masuk Aplikasi</span>
              )}
            </button>
          </form>

          {/* Perangkat login langsung ke database (Turso, server sendiri,
              atau lokal). Jalur "URL Server Origin" ke server web sudah
              dipensiunkan: dispatcher sinkronisasinya tidak mengenal data
              akademik, sehingga antrean perangkat macet permanen. */}
          <button
            type="button"
            onClick={() => setShowDatabaseSetup(true)}
            className="login-link mt-4 inline-flex min-h-11 w-full items-center justify-center rounded text-xs font-semibold"
          >
            Koneksi Database
          </button>
        </div>

        <footer className="login-muted mt-auto pt-6 text-center text-xs space-y-0.5">
          {licenseStatus?.license ? (
            <p>Berlisensi untuk {licenseStatus.license.holder}</p>
          ) : null}
          <p>
            {appName} v{packageJson.version} • KOS
          </p>
        </footer>
      </main>
    </div>
  );
}
