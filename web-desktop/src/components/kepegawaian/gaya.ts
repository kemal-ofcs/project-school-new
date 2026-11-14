// Gaya bersama halaman /kepegawaian (Web/Desktop; tidak disalin ke Mobile).

export const INPUT =
  "min-h-10 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-sm text-white outline-none focus:border-sky-500";
export const TOMBOL =
  "min-h-10 rounded-xl border border-white/10 px-3 text-sm font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-50";
export const TOMBOL_UTAMA =
  "min-h-10 rounded-xl bg-sky-500 px-4 text-sm font-semibold text-slate-950 hover:bg-sky-400 disabled:opacity-50";
export const LABEL = "mb-1 block text-sm font-semibold text-slate-300";
export const PERINGATAN =
  "rounded-xl border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-sm text-amber-100";

export function pesanGalat(error: unknown) {
  return error instanceof Error ? error.message : "Permintaan gagal.";
}
