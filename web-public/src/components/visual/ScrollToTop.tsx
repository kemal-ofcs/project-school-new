"use client";

import { ChevronUp } from "lucide-react";
import { useEffect, useState } from "react";

export function ScrollToTop() {
  const [visible, setVisible] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY;
      const docHeight =
        document.documentElement.scrollHeight - window.innerHeight;
      const progress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;

      setScrollProgress(Math.min(100, Math.max(0, progress)));
      setVisible(scrollTop > 280);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (!visible) return null;

  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset =
    circumference - (scrollProgress / 100) * circumference;

  return (
    <button
      type="button"
      onClick={scrollToTop}
      aria-label="Kembali ke bagian atas halaman"
      className="fixed bottom-20 right-4 md:bottom-24 md:right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-card/95 text-foreground shadow-lg backdrop-blur-md border border-border/80 transition-all duration-300 hover:scale-110 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {/* Circular Progress Ring */}
      <svg
        className="absolute inset-0 h-full w-full -rotate-90 p-1"
        viewBox="0 0 44 44"
        aria-hidden="true"
      >
        <circle
          cx="22"
          cy="22"
          r={radius}
          className="text-border stroke-current"
          strokeWidth="2.5"
          fill="transparent"
        />
        <circle
          cx="22"
          cy="22"
          r={radius}
          className="text-secondary stroke-current transition-[stroke-dashoffset] duration-150"
          strokeWidth="2.5"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          fill="transparent"
        />
      </svg>
      <ChevronUp className="relative z-10 h-5 w-5 text-foreground" />
    </button>
  );
}
