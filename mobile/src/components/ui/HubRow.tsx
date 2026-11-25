"use client";

import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/Icon";
import { triggerHaptic } from "@/lib/client/haptics";

export interface HubRowProps {
  href: string;
  icon: IconName;
  title: string;
  subtitle?: string;
  badge?: string | number;
}

/**
 * Baris sub-menu standar untuk layar hub (Beranda, Operasional, Karyawan & PD,
 * Pengaturan). Subjudul wajib diisi oleh pemanggil kapan pun tujuannya bukan
 * hal yang jelas dari judul saja — grid ikon tanpa subjudul adalah sebab kartu
 * sub-menu sulit dibedakan cepat.
 *
 * Satu nada navy + emas untuk semua menu (warna identitas). Warna hanya untuk
 * `badge`, karena badge menyatakan status. Gaya di `.hub-row*` (globals.css),
 * bukan utilitas slate/white yang dibalik blok tema terang.
 */
export function HubRow({ href, icon, title, subtitle, badge }: HubRowProps) {
  return (
    <Link
      href={href}
      onClick={() => triggerHaptic("light")}
      className="hub-row flex items-center gap-3 rounded-2xl p-3.5 active:scale-[0.98]"
    >
      <div className="ikon-navy grid size-10 shrink-0 place-items-center rounded-xl">
        <Icon name={icon} className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="hub-row-judul truncate text-sm font-bold">{title}</p>
        {subtitle ? (
          <p className="hub-row-sub truncate text-[11px]">{subtitle}</p>
        ) : null}
      </div>
      {badge !== undefined ? (
        <span className="shrink-0 rounded-full bg-rose-700 px-2 py-0.5 text-[10px] font-black text-on-accent">
          {badge}
        </span>
      ) : null}
      <Icon name="chevron-right" className="hub-row-sub size-4 shrink-0" />
    </Link>
  );
}

/** Label pemisah kelompok di dalam satu layar hub (mis. "Operasional Harian"). */
export function HubGroupLabel({
  children,
  id,
}: {
  children: string;
  id?: string;
}) {
  return (
    <h3
      id={id}
      className="mb-2 mt-1 px-1 text-[11px] font-black uppercase tracking-wider text-slate-500"
    >
      {children}
    </h3>
  );
}

/** Tautan kembali di puncak layar anak (mis. "‹ Pengaturan" di atas /settings/akun). */
export function BackHeader({
  href,
  label,
  title,
}: {
  href: string;
  label: string;
  title: string;
}) {
  return (
    <div className="mb-1 flex flex-col gap-2">
      <Link
        href={href}
        onClick={() => triggerHaptic("light")}
        className="hub-kembali inline-flex w-fit items-center gap-1.5 text-xs font-bold active:scale-95 transition"
      >
        <Icon name="arrow-left" className="size-3.5" />
        <span>{label}</span>
      </Link>
      <h1 className="text-lg font-black text-white">{title}</h1>
    </div>
  );
}
