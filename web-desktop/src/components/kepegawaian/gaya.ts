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

/** Masa kerja dari TMT sampai hari ini WIB; tidak disimpan (§19.2.1). */
export function masaKerja(tmt: string, hariIni: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tmt) || tmt > hariIni) return "-";
  const [ty, tm, td] = tmt.split("-").map(Number);
  const [hy, hm, hd] = hariIni.split("-").map(Number);
  let bulan = (hy - ty) * 12 + (hm - tm);
  if (hd < td) bulan -= 1;
  const tahun = Math.floor(bulan / 12);
  const sisa = bulan % 12;
  if (tahun === 0) return `${sisa} bln`;
  return sisa === 0 ? `${tahun} th` : `${tahun} th ${sisa} bln`;
}
