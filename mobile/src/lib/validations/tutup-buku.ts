import { type Hasil, isValidDate } from "./accounting";

/**
 * Aturan murni tutup buku (Tahap 1), cermin `desktop/tutup_buku.rs` dengan
 * vektor yang sama. Pesan galat wajib identik dengan Rust.
 */

/** WAJIB sama dengan CHECK `keu_tutup_buku.status` dan `STATUS_TUTUP`. */
export const STATUS_TUTUP = [
  "Aktif",
  "Dibuka",
  "Digantikan",
  "Menunggu",
] as const;
export type StatusTutup = (typeof STATUS_TUTUP)[number];

export const MAKS_ALASAN_BUKA = 150;

/** `2026-09-30` → `30/09/2026`. */
export function tanggalTampil(tanggal: string): string {
  const bagian = tanggal.split("-");
  return bagian.length === 3
    ? `${bagian[2]}/${bagian[1]}/${bagian[0]}`
    : tanggal;
}

/** `2026-10-14 08:05:09` → `14/10/2026 08:05:09 WIB`. Hanya untuk tampilan. */
export function waktuTampil(waktu: string): string {
  const [tanggal, jam] = waktu.split(" ");
  return jam ? `${tanggalTampil(tanggal ?? "")} ${jam} WIB` : waktu;
}

/** Cermin `cek_periode_terbuka`. */
export function cekPeriodeTerbuka(
  tanggal: string,
  batas: string | null,
): Hasil<true> {
  if (batas !== null && tanggal <= batas) {
    return {
      ok: false,
      error: `Tanggal ${tanggalTampil(tanggal)} masuk periode yang sudah ditutup (sampai ${tanggalTampil(batas)}). Catat dengan tanggal sesudahnya, atau minta pemegang izin tutup buku membuka periode itu.`,
    };
  }
  return { ok: true, value: true };
}

/** Cermin `validate_tutup`. */
export function validateTutup(
  sampaiMentah: string,
  batas: string | null,
  hariIni: string,
): Hasil<string> {
  const sampai = sampaiMentah.trim();
  if (!isValidDate(sampai)) {
    return { ok: false, error: "Tanggal tutup buku tidak valid." };
  }
  if (sampai >= hariIni) {
    return { ok: false, error: "Tanggal tutup buku harus sebelum hari ini." };
  }
  if (batas !== null && sampai <= batas) {
    return {
      ok: false,
      error: `Buku sudah ditutup sampai ${tanggalTampil(batas)}. Pilih tanggal sesudahnya.`,
    };
  }
  return { ok: true, value: sampai };
}

/** Cermin `validate_alasan_buka`. */
export function validateAlasanBuka(alasanMentah: string): Hasil<string> {
  const alasan = alasanMentah.trim();
  if (!alasan) {
    return { ok: false, error: "Alasan membuka kembali wajib diisi." };
  }
  if ([...alasan].length > MAKS_ALASAN_BUKA) {
    return {
      ok: false,
      error: `Alasan paling banyak ${MAKS_ALASAN_BUKA} karakter.`,
    };
  }
  return { ok: true, value: alasan };
}

/**
 * Cermin `saldo_tutup_json`: potret saldo kanonik (urut `id_akun` secara
 * biner, akun bersaldo nol dibuang), sama byte per byte dengan Rust.
 */
export function saldoTutupJson(
  akun: ReadonlyArray<{ id_akun: string; debit: number; kredit: number }>,
): string {
  const isi = akun
    .filter((a) => a.debit !== 0 || a.kredit !== 0)
    .sort((a, b) =>
      a.id_akun < b.id_akun ? -1 : a.id_akun > b.id_akun ? 1 : 0,
    )
    .map(
      (a) =>
        `{"id_akun":${JSON.stringify(a.id_akun)},"debit":${a.debit},"kredit":${a.kredit}}`,
    );
  return `[${isi.join(",")}]`;
}
