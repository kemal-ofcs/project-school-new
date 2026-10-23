// Aturan masukan halaman Operasional (koreksi admin dan import manual).
// Dieja kembar dengan `validasi_koreksi` / `validasi_baris_import` di
// `src-tauri/src/desktop/administration.rs`; vektor tesnya sama.

import { isValidDate } from "@/lib/validations/inventory";

export const JENIS_KOREKSI = [
  "Sakit",
  "Izin",
  "Dispen",
  "Alfa",
  "Lupa Absen Masuk",
  "Lupa Absen Pulang",
  "Kendala Sistem - Jam Masuk",
  "Kendala Sistem - Jam Pulang",
  "Terlambat",
] as const;

export type JenisKoreksi = (typeof JENIS_KOREKSI)[number];

const JENIS_KOREKSI_TANPA_JAM = ["Sakit", "Izin", "Dispen", "Alfa"];

export const STATUS_KEHADIRAN_IMPORT = [
  "Hadir",
  "Sakit",
  "Izin",
  "Dispen",
  "Alfa",
] as const;

export const STATUS_ABSEN_IMPORT = [
  "Lengkap",
  "Belum Pulang",
  "Perlu Verifikasi",
  "Tidak Hadir",
  "Tepat Waktu",
  "Terlambat",
  "Datang Lebih Awal",
] as const;

export function isJamKoreksi(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function isJamImport(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(value);
}

export function koreksiButuhJam(jenis: string): boolean {
  return !JENIS_KOREKSI_TANPA_JAM.includes(jenis);
}

/** `jenis_scan` log yang ditulis sebuah koreksi. */
export function jenisScanKoreksi(jenis: string): string {
  if (
    ["Lupa Absen Masuk", "Kendala Sistem - Jam Masuk", "Terlambat"].includes(
      jenis,
    )
  )
    return "Masuk";
  if (["Lupa Absen Pulang", "Kendala Sistem - Jam Pulang"].includes(jenis))
    return "Pulang";
  return jenis;
}

function pesanMasaDepan(tanggal: string) {
  return `Tanggal ${tanggal} belum terjadi; absensi berjam hanya boleh untuk hari ini atau sebelumnya.`;
}

/** `null` bila sah, selain itu pesan galat untuk operator. */
export function validasiKoreksi(
  input: {
    tanggal: string;
    id_karyawan: string;
    jenis_koreksi: string;
    jam_koreksi: string;
  },
  hariIni: string,
): string | null {
  if (
    !isValidDate(input.tanggal) ||
    !input.id_karyawan ||
    !(JENIS_KOREKSI as readonly string[]).includes(input.jenis_koreksi)
  ) {
    return "Data Koreksi Admin tidak valid.";
  }
  if (!koreksiButuhJam(input.jenis_koreksi)) return null;
  if (!input.jam_koreksi) {
    return `Jenis koreksi '${input.jenis_koreksi}' wajib menyertakan jam koreksi (HH:mm).`;
  }
  if (!isJamKoreksi(input.jam_koreksi)) {
    return "Jam koreksi harus berformat HH:mm.";
  }
  if (input.tanggal > hariIni) return pesanMasaDepan(input.tanggal);
  return null;
}

/**
 * Baris bukan Hadir tidak divalidasi jamnya: jamnya dibuang saat disimpan
 * supaya hari Sakit/Alfa tidak menghasilkan `jam_kerja` yang ikut digaji.
 */
export function validasiBarisImport(
  row: {
    tanggal: string;
    id_unik: string;
    jam_masuk: string;
    jam_pulang: string;
    status_kehadiran: string;
    status_absen: string;
  },
  hariIni: string,
): string | null {
  if (!isValidDate(row.tanggal) || !row.id_unik) {
    return "Tanggal atau ID tidak valid.";
  }
  const status = row.status_kehadiran || "Hadir";
  if (!(STATUS_KEHADIRAN_IMPORT as readonly string[]).includes(status)) {
    return `Status kehadiran '${status}' tidak dikenal.`;
  }
  if (
    row.status_absen &&
    !(STATUS_ABSEN_IMPORT as readonly string[]).includes(row.status_absen)
  ) {
    return `Status absen '${row.status_absen}' tidak dikenal.`;
  }
  if (status !== "Hadir") return null;
  if (
    (!row.jam_masuk && !row.jam_pulang) ||
    (row.jam_masuk && !isJamImport(row.jam_masuk)) ||
    (row.jam_pulang && !isJamImport(row.jam_pulang))
  ) {
    return "Jam masuk/pulang tidak valid.";
  }
  if (row.tanggal > hariIni) return pesanMasaDepan(row.tanggal);
  return null;
}
