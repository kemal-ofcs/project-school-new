"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface FeedbackBannerProps {
  type?: "success" | "error" | "warning" | "info";
  message: string;
  className?: string;
  onClose?: () => void;
}

const bannerStyles = {
  success: "border-emerald-500/40 bg-emerald-950/50 text-emerald-200",
  error: "border-rose-500/40 bg-rose-950/50 text-rose-200",
  warning: "border-amber-500/40 bg-amber-950/50 text-amber-200",
  info: "border-sky-500/40 bg-sky-950/50 text-sky-200",
};

const SUCCESS_DISMISS_MS = 5000;

/**
 * Wadah bersama toast di level halaman: di atas bottom nav (z-50), di BAWAH
 * backdrop Modal (z-80). Saat dialog terbuka, pesan halaman yang sama dengan
 * pesan di dalam dialog tertutup backdrop sehingga tidak terbaca dua kali.
 */
function toastHost() {
  const existing = document.getElementById("feedback-toasts");
  if (existing) return existing;
  const host = document.createElement("div");
  host.id = "feedback-toasts";
  host.className =
    "pointer-events-none fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[70] flex flex-col gap-2";
  document.body.appendChild(host);
  return host;
}

/**
 * Pesan di level halaman melayang di atas bottom nav supaya terlihat tanpa
 * menggulir ke atas; pesan di dalam dialog tetap di tempatnya, dekat form yang
 * memicunya. Sukses hilang sendiri, error dan peringatan menunggu ditutup.
 */
export function FeedbackBanner({
  type = "info",
  message,
  className = "",
  onClose,
}: FeedbackBannerProps) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [host, setHost] = useState<HTMLElement | "inline" | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useLayoutEffect(() => {
    setHost(
      anchorRef.current?.closest('[role="dialog"], dialog')
        ? "inline"
        : toastHost(),
    );
  }, []);

  useEffect(() => {
    if (type !== "success" || !message) return;
    const timer = window.setTimeout(
      () => onCloseRef.current?.(),
      SUCCESS_DISMISS_MS,
    );
    return () => window.clearTimeout(timer);
  }, [type, message]);

  // Anchor dirender sebelum pemeriksaan pesan: banner yang selalu terpasang
  // dengan pesan kosong tetap harus tahu apakah ia berada di dalam dialog.
  if (host === null) return <span ref={anchorRef} hidden />;
  if (!message) return null;

  const banner = (
    <div
      role="alert"
      className={`relative flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm font-medium shadow-lg backdrop-blur-md transition-all ${bannerStyles[type]} ${className}`}
    >
      <div className="flex items-center gap-2.5">
        <span className="shrink-0 font-bold">
          {type === "success" && "✓"}
          {type === "error" && "✕"}
          {type === "warning" && "!"}
          {type === "info" && "ℹ"}
        </span>
        <p className="leading-snug">{message}</p>
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup notifikasi"
          className="grid size-7 shrink-0 place-items-center rounded-lg bg-white/10 text-xs font-bold hover:bg-white/20"
        >
          ×
        </button>
      )}
    </div>
  );

  if (host === "inline") return banner;
  // Latar pekat di bawah warna nada: nada 50% transparan saja tidak terbaca
  // di atas daftar yang sedang digulir.
  return createPortal(
    <div className="pointer-events-auto rounded-2xl bg-slate-900">
      {banner}
    </div>,
    host,
  );
}
