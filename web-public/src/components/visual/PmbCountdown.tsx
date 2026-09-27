"use client";

import { useEffect, useState } from "react";

interface PmbCountdownProps {
  tanggalTutup: string;
}

interface TimeRemaining {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isExpired: boolean;
}

export function PmbCountdown({ tanggalTutup }: PmbCountdownProps) {
  const [mounted, setMounted] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<TimeRemaining | null>(
    null,
  );

  useEffect(() => {
    setMounted(true);

    // Parsing target date (tutup pada akhir hari 23:59:59)
    // Mendukung format YYYY-MM-DD atau ISO string
    let targetTime: number;
    if (tanggalTutup.includes("T")) {
      targetTime = new Date(tanggalTutup).getTime();
    } else {
      const parts = tanggalTutup.split("-");
      if (parts.length === 3) {
        const year = Number.parseInt(parts[0], 10);
        const month = Number.parseInt(parts[1], 10) - 1;
        const day = Number.parseInt(parts[2], 10);
        targetTime = new Date(year, month, day, 23, 59, 59).getTime();
      } else {
        targetTime = new Date(`${tanggalTutup} 23:59:59`).getTime();
      }
    }

    if (Number.isNaN(targetTime)) return;

    const calculate = () => {
      const now = Date.now();
      const diff = targetTime - now;

      if (diff <= 0) {
        setTimeRemaining({
          days: 0,
          hours: 0,
          minutes: 0,
          seconds: 0,
          isExpired: true,
        });
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((diff / (1000 * 60)) % 60);
      const seconds = Math.floor((diff / 1000) % 60);

      setTimeRemaining({
        days,
        hours,
        minutes,
        seconds,
        isExpired: false,
      });
    };

    calculate();
    const interval = setInterval(calculate, 1000);
    return () => clearInterval(interval);
  }, [tanggalTutup]);

  if (!mounted || !timeRemaining || timeRemaining.isExpired) {
    return null;
  }

  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div className="inline-flex items-center gap-1.5 rounded-full bg-secondary/20 px-3 py-1 text-[11px] font-bold text-secondary-container border border-secondary-container/30 backdrop-blur-md shadow-xs">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-secondary-container opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-secondary-container" />
      </span>
      <span>Tersisa:</span>
      <span className="font-mono font-extrabold text-white">
        {timeRemaining.days > 0 ? `${timeRemaining.days}h ` : ""}
        {pad(timeRemaining.hours)}j : {pad(timeRemaining.minutes)}m :{" "}
        {pad(timeRemaining.seconds)}d
      </span>
    </div>
  );
}
