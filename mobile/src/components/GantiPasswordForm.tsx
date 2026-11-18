"use client";

import type { FormEvent } from "react";
import { useRef, useState } from "react";
import { periksaPasswordBaru } from "@/lib/auth/password";
import { useAuth } from "@/lib/context/AuthContext";
import { gantiPasswordSaya } from "@/lib/gateways/password-saya";
import { isDesktopRuntime } from "@/lib/runtime/app-runtime";

/**
 * Form "Ganti Password" milik pengguna yang sedang login. Dipakai bersama Web,
 * Desktop, dan Mobile (`filesToCopy`). Di Web semua sesi akun dicabut setelah
 * berhasil, jadi pengguna diarahkan login lagi; di Desktop/Mobile sesi
 * perangkat tetap berjalan.
 */
export function GantiPasswordForm({ onSelesai }: { onSelesai?: () => void }) {
  const { logout } = useAuth();
  const [lama, setLama] = useState("");
  const [baru, setBaru] = useState("");
  const [ulang, setUlang] = useState("");
  const [pesan, setPesan] = useState<{
    tone: "error" | "success";
    teks: string;
  } | null>(null);
  const [menyimpan, setMenyimpan] = useState(false);
  const isSubmittingRef = useRef(false);

  const simpan = async (event: FormEvent) => {
    event.preventDefault();
    if (isSubmittingRef.current) return;
    const galat =
      baru !== ulang
        ? "Ulangi password baru dengan tepat."
        : periksaPasswordBaru(lama, baru);
    if (galat) {
      setPesan({ tone: "error", teks: galat });
      return;
    }
    isSubmittingRef.current = true;
    setMenyimpan(true);
    setPesan(null);
    try {
      await gantiPasswordSaya(lama, baru);
      setLama("");
      setBaru("");
      setUlang("");
      if (isDesktopRuntime()) {
        setPesan({ tone: "success", teks: "Password berhasil diganti." });
        onSelesai?.();
      } else {
        // Sesi Web sudah dicabut di server; login lagi dengan password baru.
        await logout();
      }
    } catch (error: unknown) {
      setPesan({
        tone: "error",
        teks:
          error instanceof Error ? error.message : "Gagal mengganti password.",
      });
    } finally {
      isSubmittingRef.current = false;
      setMenyimpan(false);
    }
  };

  const kelasInput =
    "w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-sky-500";

  return (
    <form
      onSubmit={simpan}
      data-tanpa-konfirmasi
      className="space-y-3 text-sm text-slate-300"
    >
      <label className="grid gap-1.5 text-xs font-semibold text-slate-400">
        Password saat ini
        <input
          type="password"
          autoComplete="current-password"
          value={lama}
          onChange={(e) => setLama(e.target.value)}
          required
          className={kelasInput}
        />
      </label>
      <label className="grid gap-1.5 text-xs font-semibold text-slate-400">
        Password baru
        <input
          type="password"
          autoComplete="new-password"
          value={baru}
          onChange={(e) => setBaru(e.target.value)}
          required
          minLength={12}
          className={kelasInput}
        />
      </label>
      <label className="grid gap-1.5 text-xs font-semibold text-slate-400">
        Ulangi password baru
        <input
          type="password"
          autoComplete="new-password"
          value={ulang}
          onChange={(e) => setUlang(e.target.value)}
          required
          minLength={12}
          className={kelasInput}
        />
      </label>
      <p className="text-[11px] leading-4 text-slate-400">
        Minimal 12 karakter, dengan huruf besar, huruf kecil, dan angka.
      </p>
      {pesan ? (
        <p
          role={pesan.tone === "error" ? "alert" : "status"}
          className={`text-xs ${
            pesan.tone === "error" ? "text-rose-400" : "text-emerald-400"
          }`}
        >
          {pesan.teks}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={menyimpan}
        className="min-h-11 w-full rounded-xl bg-sky-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-800 disabled:opacity-50"
      >
        {menyimpan ? "Menyimpan..." : "Ganti Password"}
      </button>
    </form>
  );
}
