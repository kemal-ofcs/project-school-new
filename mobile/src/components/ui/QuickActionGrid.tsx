"use client";

import {
  QuickActionTile,
  type QuickActionTileProps,
} from "@/components/ui/QuickActionTile";

interface QuickActionGridProps {
  tiles?: QuickActionTileProps[];
  className?: string;
}

const DEFAULT_TILES: QuickActionTileProps[] = [
  {
    href: "/scanner",
    icon: "scanner",
    title: "Terminal QR",
    subtitle: "Pindai Absensi",
    tone: "primary",
    isPrimaryAction: true,
  },
  {
    href: "/presensi-kelas",
    icon: "clock",
    title: "Presensi KBM",
    subtitle: "Jam Mengajar",
    tone: "emerald",
  },
  {
    href: "/siswa",
    icon: "users",
    title: "Siswa & Guru",
    subtitle: "Master Data",
    tone: "primary",
  },
  {
    href: "/payroll",
    icon: "document",
    title: "Penggajian",
    subtitle: "Slip Gaji",
    tone: "emerald",
  },
  {
    href: "/dasbor-kehadiran",
    icon: "dashboard",
    title: "Live Pantau",
    subtitle: "Audit Realtime",
    tone: "amber",
  },
  {
    href: "/id-cards",
    icon: "user",
    title: "Cetak Kartu",
    subtitle: "Studio ID Card",
    tone: "purple",
  },
  {
    href: "/notifikasi-wa",
    icon: "whatsapp",
    title: "Notifikasi WA",
    subtitle: "Kirim ke Wali",
    tone: "emerald",
  },
  {
    href: "/settings",
    icon: "settings",
    title: "Pengaturan",
    subtitle: "Sistem & Sync",
    tone: "neutral",
  },
];

export function QuickActionGrid({
  tiles = DEFAULT_TILES,
  className = "",
}: QuickActionGridProps) {
  return (
    <section aria-label="Layanan Cepat Operasional" className={className}>
      <div className="flex items-center justify-between mb-2.5 px-0.5">
        <h2 className="text-sm font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
          Layanan Cepat
        </h2>
        <span className="text-[11px] font-semibold text-blue-600 dark:text-sky-400">
          Akses 1-Ketukan
        </span>
      </div>

      <div className="grid grid-cols-4 gap-2 sm:gap-3">
        {tiles.map((tile) => (
          <QuickActionTile key={tile.href} {...tile} />
        ))}
      </div>
    </section>
  );
}
