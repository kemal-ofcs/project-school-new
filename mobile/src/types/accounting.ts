/**
 * Bentuk data modul akuntansi (K1). Dibaca dari Rust (`desktop/accounting.rs`)
 * di Desktop/Mobile dan dari `services/accounting.ts` di Web; keduanya wajib
 * mengembalikan kunci yang sama.
 */

import type {
  KelompokAkun,
  SaldoNormal,
  SumberJurnal,
} from "@/lib/validations/accounting";

export interface AkunItem {
  id_akun: string;
  kode: string;
  nama: string;
  kelompok: KelompokAkun;
  saldo_normal: SaldoNormal;
  is_aktif: boolean;
  sistem: boolean;
  punya_jurnal: boolean;
}

export interface JurnalItem {
  id_jurnal: string;
  tanggal: string;
  nomor: string;
  keterangan: string;
  sumber: SumberJurnal;
  id_jurnal_batal: string | null;
  dibuat_oleh: string;
  created_at: string;
  total: number;
  dibatalkan: boolean;
  /** Dua perangkat bisa mendapat seri kembar; nomornya ditandai, datanya tetap utuh. */
  nomor_ganda: boolean;
}

export interface JurnalDetail {
  jurnal: {
    id_jurnal: string;
    tanggal: string;
    nomor: string;
    keterangan: string;
    sumber: SumberJurnal;
    id_sumber: string | null;
    id_jurnal_batal: string | null;
    dibuat_oleh: string;
    created_at: string;
    nomor_pembalik: string | null;
  };
  baris: Array<{
    id_baris: string;
    id_akun: string;
    kode_akun: string;
    nama_akun: string;
    debit: number;
    kredit: number;
    keterangan: string | null;
    urutan: number;
  }>;
}

export interface BukuBesar {
  akun: {
    id_akun: string;
    kode: string;
    nama: string;
    kelompok: KelompokAkun;
    saldo_normal: SaldoNormal;
    is_aktif: number;
  };
  saldo_awal: number;
  total_debit: number;
  total_kredit: number;
  saldo_akhir: number;
  terpotong: boolean;
  baris: Array<{
    id_jurnal: string;
    tanggal: string;
    nomor: string;
    keterangan: string;
    sumber: SumberJurnal;
    debit: number;
    kredit: number;
    saldo: number;
  }>;
}

export interface NeracaSaldo {
  items: Array<{
    id_akun: string;
    kode: string;
    nama: string;
    kelompok: KelompokAkun;
    saldo_normal: SaldoNormal;
    debit: number;
    kredit: number;
  }>;
  total_debit: number;
  total_kredit: number;
}
