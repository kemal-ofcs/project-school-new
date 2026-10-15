import type { StatusRapel } from "@/lib/validations/payroll-rapel";

/** Satu slip PAID yang tarifnya berbeda dengan tarif yang sekarang berlaku. */
export interface CalonRapel {
  id_item: string;
  id_run: string;
  id_karyawan: string;
  nama_karyawan: string;
  period_start: string;
  period_end: string;
  label: string;
  rate_lama: number;
  rate_baru: number;
  selisih_pokok: number;
  selisih_lembur: number;
  selisih_komponen: number;
  jumlah: number;
  /** Tarif turun: ditampilkan, tidak bisa disimpan sebagai rapel. */
  kelebihan_bayar: boolean;
}

export interface RapelItem {
  id_rapel: string;
  id_karyawan: string;
  nama_karyawan: string;
  id_item_asal: string;
  id_run_asal: string;
  label: string;
  period_start: string;
  period_end: string;
  rate_lama: number;
  rate_baru: number;
  selisih_pokok: number;
  selisih_lembur: number;
  selisih_komponen: number;
  jumlah: number;
  dibuat_oleh: string;
  created_at: string;
  dibatalkan_oleh: string | null;
  status: StatusRapel;
  dibatalkan_pada: string | null;
  alasan_batal: string | null;
  /** Proses gaji yang memegang rapel ini (bukan yang ditolak). */
  id_run: string | null;
}

export interface PilihanRapel {
  idItem: string;
  rateBaru: number;
}
