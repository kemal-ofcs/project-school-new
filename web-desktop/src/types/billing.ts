/**
 * Bentuk data tagihan siswa (K3a). Dibaca dari Rust (`desktop/billing.rs`) di
 * Desktop/Mobile dan dari `services/billing.ts` di Web; keduanya wajib
 * mengembalikan kunci yang sama.
 */

import type {
  JenisKeringanan,
  MetodeBayar,
  Periodik,
  StatusTagihan,
} from "@/lib/validations/billing";
import type { KopSekolah } from "@/lib/validations/inventory";

export interface JenisTagihanItem {
  id_jenis_tagihan: string;
  nama: string;
  periodik: Periodik;
  nominal_bawaan: number;
  id_akun_pendapatan: string;
  is_aktif: number;
}

export interface TarifItem {
  id_tarif: string;
  id_jenis_tagihan: string;
  nama_unit: string;
  tingkat: number | null;
  nominal: number;
}

export interface MasterTagihan {
  jenis: JenisTagihanItem[];
  tarif: TarifItem[];
  unit: string[];
  rombel: Array<{ id_rombel: string; nama_rombel: string; tingkat: number }>;
  tahun_ajaran: string[];
  /** Halaman Tagihan di portal wali dibuka (K4c). */
  portal_wali_tagihan: boolean;
}

export interface KeringananItem {
  id_keringanan: string;
  id_siswa: string;
  nama_siswa: string;
  id_jenis_tagihan: string;
  nama_tagihan: string;
  jenis: JenisKeringanan;
  nilai: number;
  periode_mulai: string | null;
  periode_selesai: string | null;
  alasan: string | null;
  is_aktif: number;
}

export interface SiswaTagihan {
  id_siswa: string;
  nama_lengkap: string;
  nis: string;
  kelas: string;
}

export interface PratinjauTagihan {
  periode: string;
  items: Array<{
    id_siswa: string;
    nama: string;
    kelas: string;
    nominal: number;
    potongan: number;
    bersih: number;
    sudah_ada: boolean;
  }>;
  jumlah_baru: number;
  jumlah_sudah_ada: number;
  total_bersih: number;
}

export interface TagihanItem {
  id_tagihan: string;
  id_siswa: string;
  nama_siswa: string;
  kelas: string;
  id_jenis_tagihan: string;
  nama_tagihan: string;
  periode: string;
  nominal: number;
  potongan: number;
  jatuh_tempo: string;
  alasan_batal: string | null;
  /** Jumlah alokasi kuitansi yang tidak dibatalkan. */
  dibayar: number;
  status: StatusTagihan;
  sisa: number;
  terlambat: boolean;
}

// ── Pembayaran (K3b) ────────────────────────────────────────────────────────

export type StatusKuitansi = "Sah" | "Dibatalkan";

/** Hasil daftar tunggakan. `pengingat_wa` = sakelar `wa_notify_tagihan`. */
export interface DaftarTagihan {
  items: TagihanItem[];
  total_sisa: number;
  pengingat_wa: boolean;
}

/** Hasil satu kali "Kirim pengingat WhatsApp" (K4b). */
export interface HasilPengingat {
  siswa: number;
  diantre: number;
  terpotong: boolean;
}

/** Hasil satu panggilan pengingat otomatis dari komponen latar. */
export type HasilPengingatOtomatis =
  | { dijalankan: false; alasan: string; hari?: string }
  | {
      dijalankan: true;
      hari: string;
      siswa: number;
      diantre: number;
      terpotong: boolean;
    };

export interface TagihanTerbukaItem {
  id_tagihan: string;
  nama_tagihan: string;
  periode: string;
  jatuh_tempo: string;
  bersih: number;
  dibayar: number;
  sisa: number;
}

export interface RiwayatKuitansi {
  id_pembayaran: string;
  nomor: string;
  tanggal: string;
  metode: MetodeBayar;
  total: number;
  status: StatusKuitansi;
  rincian: string;
}

export interface AkunSiswaTagihan {
  siswa: {
    id_siswa: string;
    nama_lengkap: string;
    kelas: string;
    nama_wali: string;
    no_wali: string;
  };
  tagihan: TagihanTerbukaItem[];
  titipan: number;
  riwayat: RiwayatKuitansi[];
}

export interface HasilBayar {
  sukses: boolean;
  id_pembayaran: string;
  nomor: string;
  ke_titipan: number;
}

export interface KuitansiItem {
  id_pembayaran: string;
  nomor: string;
  seri: string;
  tanggal: string;
  id_siswa: string;
  nama_siswa: string;
  kelas: string;
  metode: MetodeBayar;
  total: number;
  dibuat_oleh: string;
  alasan_batal: string | null;
  status: StatusKuitansi;
  nomor_ganda: boolean;
}

export interface DetailKuitansi {
  pembayaran: {
    id_pembayaran: string;
    id_siswa: string;
    nama_siswa: string;
    tanggal: string;
    seri: string;
    nomor: string;
    metode: MetodeBayar;
    id_akun_kas: string | null;
    nama_akun: string;
    total: number;
    keterangan: string | null;
    dibuat_oleh: string;
    created_at: string;
    kelas: string;
    nama_wali: string;
    no_wali: string;
    alasan_batal: string | null;
    status: StatusKuitansi;
  };
  alokasi: Array<{
    id_alokasi: string;
    /** `null` = masuk Titipan Wali. */
    id_tagihan: string | null;
    nama_tagihan: string | null;
    periode: string | null;
    nominal: number;
  }>;
  saldo_titipan: number;
  kop: KopSekolah;
}

export interface TinjauanPembayaran {
  lebih_bayar: Array<{
    id_tagihan: string;
    id_siswa: string;
    nama_siswa: string;
    nama_tagihan: string;
    periode: string;
    bersih: number;
    dibayar: number;
    dibatalkan: number;
    kuitansi: Array<{
      id_pembayaran: string;
      nomor: string;
      tanggal: string;
      metode: MetodeBayar;
      seri: string;
      nominal: number;
    }>;
  }>;
  kemungkinan_ganda: Array<{
    id_pembayaran: string;
    nomor: string;
    seri: string;
    tanggal: string;
    id_siswa: string;
    nama_siswa: string;
    total: number;
    metode: MetodeBayar;
  }>;
  titipan_minus: Array<{ id_siswa: string; nama_siswa: string; saldo: number }>;
}

export interface SeriKuitansi {
  /** Kode perangkat ini; `null` di Web. */
  device_code: string | null;
  seri_aktif: string;
  terdaftar: boolean;
  items: Array<{
    device_code: string;
    seri: string;
    nama_perangkat: string;
    updated_at: string;
  }>;
}

// ── Rekap (lanjutan K4) ─────────────────────────────────────────────────────

export interface BarisRekapTagihan {
  nama: string;
  siswa: number;
  ditagih: number;
  terbayar: number;
  sisa: number;
  persen: number;
  menunggak: number;
}

export interface RekapRombel {
  periode: string;
  dicetak: string;
  baris: BarisRekapTagihan[];
  total: BarisRekapTagihan;
}

export interface BarisMatriksPenerimaan {
  id_jenis: string;
  nama: string;
  per_bulan: number[];
  total: number;
}

export interface RekapPenerimaan {
  dicetak: string;
  bulan: string[];
  kas: BarisMatriksPenerimaan[];
  total_per_bulan: number[];
  total: number;
  dipakai_titipan: BarisMatriksPenerimaan[];
  dipakai_per_bulan: number[];
  total_dipakai: number;
}
