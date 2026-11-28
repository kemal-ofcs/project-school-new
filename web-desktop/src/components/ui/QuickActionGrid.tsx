"use client";

import {
  QuickActionTile,
  type QuickActionTileProps,
} from "@/components/ui/QuickActionTile";
import { type AppArea, canAccessArea } from "@/lib/auth/access";
import { useAuth } from "@/lib/context/AuthContext";

export interface QuickActionItem extends QuickActionTileProps {
  area?: AppArea;
  /** Syarat izin tambahan (mis. `hasPermission`); `false` menyembunyikan kartu. */
  visible?: boolean;
}

interface QuickActionGridProps {
  tiles?: QuickActionItem[];
  className?: string;
  /** Kolom di layar >= 640px; HP selalu 2 kolom supaya label tidak terpotong. */
  kolom?: 2 | 3 | 4;
}

const KOLOM_SM = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-4",
};

const DEFAULT_TILES: QuickActionItem[] = [
  {
    href: "/id-cards",
    icon: "user",
    title: "Cetak ID Card",
    area: "idcards",
  },
  {
    href: "/jurnal-mengajar",
    icon: "document",
    title: "Jurnal Mengajar",
    area: "jurnal_mengajar",
  },
  {
    href: "/leger-kehadiran",
    icon: "calendar",
    title: "Leger Kehadiran",
    area: "leger_kehadiran",
  },
  {
    href: "/audit-absensi",
    icon: "alert",
    title: "Live Audit Presensi",
    area: "audit",
  },
  {
    href: "/notifikasi-wa",
    icon: "whatsapp",
    title: "Notifikasi WhatsApp",
    area: "notifikasi_wa",
  },
  {
    href: "/payroll",
    icon: "document",
    title: "Penggajian & Slip Gaji",
    area: "payroll",
  },
  {
    href: "/presensi-kelas",
    icon: "clock",
    title: "Presensi Mapel & Anomali",
    area: "presensi_kelas",
  },
  {
    href: "/history",
    icon: "clock",
    title: "Riwayat Presensi",
    area: "history",
  },
];

export function QuickActionGrid({
  tiles = DEFAULT_TILES,
  className = "",
  kolom = 4,
}: QuickActionGridProps) {
  const { user } = useAuth();
  const visibleTiles = tiles.filter(
    (tile) =>
      tile.visible !== false && (!tile.area || canAccessArea(user, tile.area)),
  );

  return (
    <section aria-label="Aksi Cepat Operasional" className={className}>
      <div className={`grid grid-cols-2 gap-2.5 sm:gap-3.5 ${KOLOM_SM[kolom]}`}>
        {visibleTiles.map((tile) => (
          <QuickActionTile key={tile.href} {...tile} />
        ))}
      </div>
    </section>
  );
}
