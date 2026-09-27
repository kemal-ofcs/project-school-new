"use client";

import { useEffect, useState } from "react";

/**
 * Lapisan gradien ambient aurora berbasis GPU compositor murni.
 * Bekerja tanpa WebGL dan tanpa memicu layout reflow.
 * Berhenti bergerak secara otomatis bila pengguna mengaktifkan prefers-reduced-motion.
 */
export function AuroraBackground() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {/* Blob 1: Navy Royal Glow */}
      <div
        className={`absolute -top-1/4 -left-1/4 h-[550px] w-[550px] rounded-full bg-primary/25 blur-3xl ${
          reducedMotion ? "" : "animate-aurora-slow"
        }`}
      />
      {/* Blob 2: Amber Gold Pulse */}
      <div
        className={`absolute top-1/3 -right-1/4 h-[480px] w-[480px] rounded-full bg-secondary-container/20 blur-3xl ${
          reducedMotion ? "" : "animate-aurora-reverse"
        }`}
      />
      {/* Blob 3: Emerald Accent Shimmer */}
      <div
        className={`absolute -bottom-1/4 left-1/3 h-[420px] w-[420px] rounded-full bg-accent/20 blur-3xl ${
          reducedMotion ? "" : "animate-aurora-float"
        }`}
      />
      {/* Subtle Geometric Overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:24px_24px] opacity-60" />
    </div>
  );
}
