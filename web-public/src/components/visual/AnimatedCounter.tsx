"use client";

import { useEffect, useRef } from "react";

interface AnimatedCounterProps {
  value: string;
  className?: string;
}

/**
 * Komponen penghitung angka beranimasi halus saat masuk ke viewport.
 * Memisahkan angka dan sufiks (misal "1.200+" -> angka 1200, sufiks "+").
 * Menggunakan direct DOM manipulation via ref untuk performa 60 FPS bebas lag.
 */
export function AnimatedCounter({ value, className }: AnimatedCounterProps) {
  const spanRef = useRef<HTMLSpanElement>(null);
  const animatedRef = useRef(false);

  useEffect(() => {
    const el = spanRef.current;
    if (!el) return;

    // Bersihkan format titik/koma untuk membaca angka asli
    // Contoh: "1.200+" -> digits: "1200", prefix: "", suffix: "+"
    const match = value.match(/^([^0-9]*)([0-9.,]+)(.*)$/);
    if (!match) {
      el.textContent = value;
      return;
    }

    const prefix = match[1] || "";
    const rawNumberStr = match[2].replace(/\./g, "").replace(/,/g, ".");
    const targetNumber = Number.parseFloat(rawNumberStr);
    const suffix = match[3] || "";

    if (Number.isNaN(targetNumber)) {
      el.textContent = value;
      return;
    }

    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (prefersReduced) {
      el.textContent = value;
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && !animatedRef.current) {
          animatedRef.current = true;
          const duration = 1200;
          const startTime = performance.now();

          const step = (currentTime: number) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // Ease-out cubic curve: 1 - (1 - t)^3
            const ease = 1 - (1 - progress) ** 3;
            const currentVal = Math.round(targetNumber * ease);

            // Format kembali angka ke standar Indonesia dengan pemisah ribuan
            const formattedNum = currentVal.toLocaleString("id-ID");
            el.textContent = `${prefix}${formattedNum}${suffix}`;

            if (progress < 1) {
              requestAnimationFrame(step);
            } else {
              el.textContent = value;
            }
          };

          requestAnimationFrame(step);
        }
      },
      { threshold: 0.2 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [value]);

  return (
    <span ref={spanRef} className={className}>
      {value}
    </span>
  );
}
