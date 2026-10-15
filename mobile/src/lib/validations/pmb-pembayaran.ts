/**
 * Pembayaran biaya pendaftaran PMB (schema v52).
 *
 * Keadaan bayar TIDAK disimpan: diturunkan dari `biaya_tagihan`,
 * `batas_bayar`, dan `dibayar_dicatat_at` dengan ekspresi SQL di bawah, yang
 * selalu dihitung SQLite dengan jam WIB. Menambah nilai ke CHECK `status`
 * berarti membangun ulang `pmb_pendaftar`, dan DROP tabel itu berkaskade ke
 * `pmb_berkas` (berkas KK/akta yang diunggah orang tua).
 *
 * Kembarannya `desktop/pmb_bayar.rs`: konstanta SQL dieja sama persis (diuji
 * `pmb-pembayaran.test.ts` dengan membaca berkas Rust), fungsi penolakan diuji
 * dengan vektor yang sama di kedua bahasa. Berkas ini disalin ke Mobile
 * (`sync-frontend-lib.ts`) dan ke `web-public` (`sync-shared-lib.ts`).
 *
 * Semua ekspresi memakai alias `p` untuk `pmb_pendaftar`.
 */

export const KEADAAN_BAYAR_PMB = [
  "Tanpa biaya",
  "Menunggu Pembayaran",
  "Kedaluwarsa",
  "Lunas",
] as const;

export type KeadaanBayarPmb = (typeof KEADAAN_BAYAR_PMB)[number];

/**
 * Metode yang dipilih panitia. CHECK `dibayar_metode` juga menerima `gateway`
 * untuk webhook payment gateway nanti; nilai itu tidak pernah datang dari
 * layar admin.
 */
export const METODE_BAYAR_PMB = ["tunai", "transfer", "qris"] as const;

export type MetodeBayarPmb = (typeof METODE_BAYAR_PMB)[number];

/** Pendaftar yang memakan kuota gelombang: belum ditolak/batal dan belum kedaluwarsa. */
export const SQL_MEMAKAN_KUOTA_PMB =
  "(p.status NOT IN ('Ditolak', 'Dibatalkan') AND NOT (p.biaya_tagihan > 0 AND p.dibayar_dicatat_at IS NULL AND p.batas_bayar IS NOT NULL AND p.batas_bayar < date('now', '+7 hours')))";

export const SQL_KEADAAN_BAYAR_PMB =
  "(CASE WHEN p.biaya_tagihan <= 0 THEN 'Tanpa biaya' WHEN p.dibayar_dicatat_at IS NOT NULL THEN 'Lunas' WHEN p.batas_bayar IS NOT NULL AND p.batas_bayar < date('now', '+7 hours') THEN 'Kedaluwarsa' ELSE 'Menunggu Pembayaran' END)";

const STATUS_TUTUP = ["Ditolak", "Dibatalkan", "Terdaftar"];

function belumLunas(keadaan: string): boolean {
  return keadaan === "Menunggu Pembayaran" || keadaan === "Kedaluwarsa";
}

/** `150000` → `"150.000"`. Dieja ulang di Rust (`rupiah`), jadi tanpa `Intl`. */
export function rupiahPmb(nilai: number): string {
  return String(Math.trunc(nilai)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/**
 * Status yang boleh disetel manual selama biaya belum lunas: `Baru` (tetap),
 * `Ditolak`, `Dibatalkan`. Angkat siswa mensyaratkan `Diterima`, jadi
 * pendaftar yang belum bayar tidak bisa menjadi siswa.
 */
export function tolakUbahStatusPmb(
  keadaan: string,
  statusBaru: string,
): string | null {
  if (
    belumLunas(keadaan) &&
    !["Baru", "Ditolak", "Dibatalkan"].includes(statusBaru)
  ) {
    return "Pendaftar belum melunasi biaya pendaftaran. Catat pembayarannya lebih dulu.";
  }
  return null;
}

export interface KeadaanPendaftarPmb {
  status: string;
  keadaan: string;
  biayaTagihan: number;
  /** `date('now','+7 hours')` dari database, bukan jam perangkat. */
  hariIni: string;
}

export function tolakKonfirmasiBayarPmb(
  p: KeadaanPendaftarPmb,
  masukan: { jumlah: number; tanggal: string },
): string | null {
  if (STATUS_TUTUP.includes(p.status)) {
    return `Pendaftar berstatus '${p.status}' tidak dapat dicatat pembayarannya.`;
  }
  if (p.keadaan === "Tanpa biaya") {
    return "Pendaftar ini tidak dikenai biaya pendaftaran.";
  }
  if (p.keadaan === "Lunas") return "Pembayaran pendaftar ini sudah tercatat.";
  if (p.keadaan === "Kedaluwarsa") {
    return "Batas bayar sudah lewat. Perpanjang batas bayarnya lebih dulu.";
  }
  if (masukan.jumlah !== p.biayaTagihan) {
    return `Jumlah bayar harus sama dengan biaya pendaftaran, Rp${rupiahPmb(p.biayaTagihan)}.`;
  }
  if (masukan.tanggal > p.hariIni) {
    return "Tanggal bayar tidak boleh melewati hari ini.";
  }
  return null;
}

export function tolakBatalBayarPmb(p: KeadaanPendaftarPmb): string | null {
  if (p.keadaan !== "Lunas") {
    return "Pendaftar ini belum punya pembayaran yang tercatat.";
  }
  if (p.status !== "Baru") {
    return "Pembayaran hanya bisa dibatalkan selama status pendaftar masih 'Baru'.";
  }
  return null;
}

export function tolakPerpanjangBayarPmb(
  p: KeadaanPendaftarPmb & { kuotaPenuh: boolean },
  batasBaru: string,
): string | null {
  if (STATUS_TUTUP.includes(p.status)) {
    return `Pendaftar berstatus '${p.status}' tidak dapat diubah batas bayarnya.`;
  }
  if (p.keadaan === "Lunas") {
    return "Pembayaran sudah tercatat; batas bayar tidak perlu diubah.";
  }
  if (!belumLunas(p.keadaan)) {
    return "Pendaftar ini tidak dikenai biaya pendaftaran.";
  }
  if (batasBaru < p.hariIni) {
    return "Batas bayar baru tidak boleh sebelum hari ini.";
  }
  if (p.keadaan === "Kedaluwarsa" && p.kuotaPenuh) {
    return "Kuota gelombang penuh. Naikkan kuota atau tolak pendaftar lain lebih dulu.";
  }
  return null;
}
