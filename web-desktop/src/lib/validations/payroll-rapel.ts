/**
 * Aturan rapel gaji (schema v51), cermin `desktop/rapel.rs`.
 *
 * Rapel = selisih upah slip yang SUDAH DIBAYAR karena tarif per jam yang
 * berlaku untuk periodenya berubah sesudah slip dibekukan. Selisihnya dihitung
 * dari angka beku slip asal (menit kerja, indeks lembur, komponen persen saat
 * itu), tidak pernah dari absensi atau aturan hari ini. Setiap fungsi di sini
 * punya pasangan Rust bernama sama dalam snake_case dan diuji dengan vektor
 * yang sama (`payroll-rapel.test.ts` ↔ `mod tests` di `rapel.rs`). Pesan
 * galatnya pun wajib identik.
 */

import type { Hasil } from "./accounting";
import { isValidPeriode } from "./loan";

/** Rentang deteksi terpanjang, supaya kueri atas `payroll_items` tetap terbatas. */
export const MAKS_BULAN_DETEKSI = 12;
export const MAKS_SIMPAN_RAPEL = 500;
export const MAKS_ALASAN_BATAL_RAPEL = 200;
/** `calc_type` entri slip, sejajar dengan `KASBON`. */
export const CALC_TYPE_RAPEL = "RAPEL";

export const STATUS_RAPEL = [
  "Menunggu",
  "Diproses",
  "Dibayar",
  "Dibatalkan",
] as const;
export type StatusRapel = (typeof STATUS_RAPEL)[number];

const NAMA_BULAN = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

/**
 * Id deterministik: dua perangkat yang menyetujui rapel yang sama untuk slip
 * yang sama menghasilkan satu baris. Tarif baru ikut di id supaya kenaikan
 * kedua atas slip yang sama menjadi rapel tersendiri.
 */
export const idRapel = (idItem: string, rateBaru: number) =>
  `rpl-${idItem}-${rateBaru}`;

function bulanKe(periode: string): number {
  return Number(periode.slice(0, 4)) * 12 + Number(periode.slice(5, 7));
}

/** Rentang deteksi `YYYY-MM` s.d. `YYYY-MM`, paling banyak 12 bulan. */
export function validateRentang(dari: string, sampai: string): Hasil<null> {
  if (!isValidPeriode(dari) || !isValidPeriode(sampai)) {
    return {
      ok: false,
      error: "Bulan awal dan akhir wajib berformat YYYY-MM.",
    };
  }
  const jumlah = bulanKe(sampai) - bulanKe(dari) + 1;
  if (jumlah < 1) {
    return { ok: false, error: "Bulan awal tidak boleh sesudah bulan akhir." };
  }
  if (jumlah > MAKS_BULAN_DETEKSI) {
    return {
      ok: false,
      error: `Rentang pencarian paling lama ${MAKS_BULAN_DETEKSI} bulan.`,
    };
  }
  return { ok: true, value: null };
}

export function validateAlasanBatal(alasan: string): Hasil<string> {
  const rapi = alasan.trim();
  if (rapi.length === 0) {
    return { ok: false, error: "Alasan pembatalan wajib diisi." };
  }
  if (Array.from(rapi).length > MAKS_ALASAN_BATAL_RAPEL) {
    return {
      ok: false,
      error: `Alasan pembatalan maksimal ${MAKS_ALASAN_BATAL_RAPEL} karakter.`,
    };
  }
  return { ok: true, value: rapi };
}

export interface KomponenPersen {
  category: string;
  rate: number;
}

/**
 * Komponen PERSENTASE yang dibekukan di slip asal. Hanya jenis inilah yang
 * berubah ketika gaji pokok berubah; tetap, per JP, per hadir, kasbon, dan
 * rapel lain tidak. Snapshot yang tidak terbaca berarti tidak ada komponen.
 */
export function komponenPersen(snapshot: string): KomponenPersen[] {
  let data: unknown;
  try {
    data = JSON.parse(snapshot);
  } catch {
    return [];
  }
  const daftar = (data as { components?: unknown } | null)?.components;
  if (!Array.isArray(daftar)) return [];
  return daftar
    .filter(
      (entri) =>
        entri?.calc_type === "PERCENTAGE" &&
        typeof entri?.category === "string" &&
        typeof entri?.rate === "number" &&
        Number.isFinite(entri.rate),
    )
    .map((entri) => ({ category: entri.category, rate: entri.rate }));
}

export interface SlipBeku {
  /** `payroll_items.total_regular_hours` (menit / 60). */
  regular_hours: number;
  overtime_index: number;
  holiday_overtime_index: number;
  komponen_persen: KomponenPersen[];
}

export interface RincianRapel {
  selisih_pokok: number;
  selisih_lembur: number;
  selisih_komponen: number;
  jumlah: number;
}

/** Bulat setengah menjauhi nol, sama dengan `roundMoney` di kalkulator gaji. */
function bulat(nilai: number): number {
  return Math.sign(nilai) * Math.round(Math.abs(nilai));
}

/**
 * Upah slip pada satu tarif, dengan rumus yang sama dengan pembekuan gaji:
 * pokok dari menit bulat, lembur dari indeks dua desimal × tarif sekali,
 * komponen persen dari pokok.
 */
function upahPadaTarif(slip: SlipBeku, rate: number) {
  const menit = Math.round(slip.regular_hours * 60);
  const pokok = bulat((menit * rate) / 60);
  const indeksRatusan = Math.round(
    (slip.overtime_index + slip.holiday_overtime_index) * 100,
  );
  const lembur = bulat((indeksRatusan * rate) / 100);
  let komponen = 0;
  for (const item of slip.komponen_persen) {
    const nominal = bulat(pokok * (item.rate / 100));
    komponen += item.category === "ALLOWANCE" ? nominal : -nominal;
  }
  return { pokok, lembur, komponen };
}

/**
 * Selisih upah bila slip dihitung dengan `rateKe`, bukan `rateDari`. Kedua sisi
 * dihitung dari angka beku yang sama, sehingga galat pembulatan slip asal
 * tidak ikut menjadi rapel. Negatif berarti kelebihan bayar.
 */
export function hitungRapel(
  slip: SlipBeku,
  rateDari: number,
  rateKe: number,
): RincianRapel {
  const lama = upahPadaTarif(slip, rateDari);
  const baru = upahPadaTarif(slip, rateKe);
  const selisih_pokok = baru.pokok - lama.pokok;
  const selisih_lembur = baru.lembur - lama.lembur;
  const selisih_komponen = baru.komponen - lama.komponen;
  return {
    selisih_pokok,
    selisih_lembur,
    selisih_komponen,
    jumlah: selisih_pokok + selisih_lembur + selisih_komponen,
  };
}

/** Nama baris di slip: "Rapel Juli 2026". */
export function labelRapel(periodStart: string): string {
  const bulan = Number(periodStart.slice(5, 7));
  if (!isValidPeriode(periodStart.slice(0, 7))) {
    return `Rapel ${periodStart}`;
  }
  return `Rapel ${NAMA_BULAN[bulan - 1]} ${periodStart.slice(0, 4)}`;
}

/**
 * Status tidak disimpan: dibatalkan dari kolomnya, sisanya dari proses gaji
 * (bukan REJECTED) yang memuat id rapel di `breakdown_snapshot.rapel`.
 */
export function statusRapel(
  dibatalkan: boolean,
  statusRunPemegang: string | null,
): StatusRapel {
  if (dibatalkan) return "Dibatalkan";
  if (statusRunPemegang === null) return "Menunggu";
  return statusRunPemegang === "PAID" ? "Dibayar" : "Diproses";
}

export interface RapelMenunggu {
  id_rapel: string;
  jumlah: number;
  period_start: string;
}

/** Entri `breakdown_snapshot.components`, supaya slip langsung menampilkannya. */
export function komponenRapel(rapel: RapelMenunggu[]) {
  return rapel.map((item) => ({
    id: `rapel-${item.id_rapel}`,
    name: labelRapel(item.period_start),
    category: "ALLOWANCE",
    calc_type: CALC_TYPE_RAPEL,
    rate: 0,
    nominal: item.jumlah,
  }));
}

/** Daftar `breakdown_snapshot.rapel`: yang menandai rapel sudah dipegang proses gaji. */
export function rincianRapelJson(rapel: RapelMenunggu[]) {
  return rapel.map((item) => ({
    id_rapel: item.id_rapel,
    jumlah: item.jumlah,
  }));
}
