"use client";

import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/Icon";
import { triggerHaptic } from "@/lib/client/haptics";

export type HubRowTone =
  | "sky"
  | "emerald"
  | "amber"
  | "purple"
  | "teal"
  | "indigo"
  | "violet"
  | "cyan"
  | "rose"
  | "neutral";

const TONE_ICON_BG: Record<HubRowTone, string> = {
  sky: "bg-sky-500/15 text-sky-300",
  emerald: "bg-emerald-500/15 text-emerald-300",
  amber: "bg-amber-500/15 text-amber-300",
  purple: "bg-purple-500/15 text-purple-300",
  teal: "bg-teal-500/15 text-teal-300",
  indigo: "bg-indigo-500/15 text-indigo-300",
  violet: "bg-violet-500/15 text-violet-300",
  cyan: "bg-cyan-500/15 text-cyan-300",
  rose: "bg-rose-500/15 text-rose-300",
  neutral: "bg-slate-500/15 text-slate-300",
};

export interface HubRowProps {
  href: string;
  icon: IconName;
  title: string;
  subtitle?: string;
  tone?: HubRowTone;
  badge?: string | number;
}

/**
 * Baris sub-menu standar untuk layar hub (Beranda, Operasional, Karyawan & PD,
 * Pengaturan). Subjudul wajib diisi oleh pemanggil kapan pun tujuannya bukan
 * hal yang jelas dari judul saja — grid ikon tanpa subjudul adalah sebab kartu
 * sub-menu sulit dibedakan cepat.
 */
export function HubRow({
  href,
  icon,
  title,
  subtitle,
  tone = "sky",
  badge,
}: HubRowProps) {
  return (
    <Link
      href={href}
      onClick={() => triggerHaptic("light")}
      className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-900/80 p-3.5 backdrop-blur-md transition active:scale-[0.98] hover:border-white/20"
    >
      <div
        className={`grid size-10 shrink-0 place-items-center rounded-xl ${TONE_ICON_BG[tone]}`}
      >
        <Icon name={icon} className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-white">{title}</p>
        {subtitle ? (
          <p className="truncate text-[11px] text-slate-400">{subtitle}</p>
        ) : null}
      </div>
      {badge !== undefined ? (
        <span className="shrink-0 rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-black text-white">
          {badge}
        </span>
      ) : null}
      <Icon name="chevron-right" className="size-4 shrink-0 text-slate-600" />
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
        className="inline-flex w-fit items-center gap-1.5 text-xs font-bold text-sky-300 active:scale-95 transition"
      >
        <Icon name="arrow-left" className="size-3.5" />
        <span>{label}</span>
      </Link>
      <h1 className="text-lg font-black text-white">{title}</h1>
    </div>
  );
}
