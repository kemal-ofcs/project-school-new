/**
 * Bentuk data tagihan siswa (K3a). Dibaca dari Rust (`desktop/billing.rs`) di
 * Desktop/Mobile dan dari `services/billing.ts` di Web; keduanya wajib
 * mengembalikan kunci yang sama.
 */

import type {
  JenisKeringanan,
  Periodik,
  StatusTagihan,
} from "@/lib/validations/billing";

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
  status: StatusTagihan;
  sisa: number;
  terlambat: boolean;
}
