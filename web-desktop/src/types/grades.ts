/**
 * Tipe bersama modul nilai akademik (v28).
 *
 * Berbeda dari PMB: kedua tabelnya IKUT SINKRONISASI, sehingga fitur ini
 * bekerja penuh tanpa jaringan. Guru menilai di kelas, dan kelas tidak selalu
 * punya sinyal.
 */

import type { HariSekolah } from "@/lib/validations/nilai-akhir";

/**
 * Dieja sama persis dengan CHECK constraint `nilai_penilaian.jenis`. Sejak
 * N2a ini hanya nilai WARISAN kolom `jenis`; jenis yang sesungguhnya adalah
 * `id_jenis` (tabel `nilai_jenis`).
 */
export const JENIS_PENILAIAN = [
  "Tugas",
  "Ulangan Harian",
  "Praktik",
  "UTS",
  "UAS",
] as const;

export type JenisPenilaian = (typeof JENIS_PENILAIAN)[number];

export const SEMESTER_LIST = ["Ganjil", "Genap"] as const;
export type Semester = (typeof SEMESTER_LIST)[number];

export interface PenilaianItem {
  id_penilaian: string;
  id_tahun_ajaran: string;
  semester: Semester;
  id_rombel: string;
  id_mapel: string;
  id_guru: string;
  jenis: JenisPenilaian;
  nama_penilaian: string;
  tanggal: string;
  bobot: number;
  kkm: number;
  nilai_maks: number;
  catatan: string | null;
  created_at: string;
  updated_at: string;
  nama_mapel: string;
  nama_rombel: string;
  jumlah_siswa: number;
  jumlah_dinilai: number;
  /**
   * `null` berarti belum ada satu pun skor — bukan rata-rata nol.
   *
   * Dihitung `AVG(skor)` yang mengabaikan NULL, sehingga rata-ratanya berasal
   * dari anak yang SUDAH dinilai. Memakai `COALESCE(skor, 0)` akan menurunkan
   * angka seluruh kelas hanya karena gurunya belum selesai.
   */
  rata_rata: number | null;
  /** Jenis efektif: `id_jenis`, atau turunan nama jenis lama. */
  id_jenis: string | null;
  nama_jenis: string;
}

export interface PenilaianDraft {
  id_penilaian?: string | null;
  id_tahun_ajaran: string;
  semester: Semester;
  id_rombel: string;
  id_mapel: string;
  id_guru: string;
  /** Klien lama hanya mengirim `jenis`; klien baru mengirim `id_jenis`. */
  jenis?: JenisPenilaian;
  id_jenis?: string | null;
  nama_penilaian: string;
  tanggal: string;
  bobot: number;
  /** Hanya dipakai saat penilaian BARU dibuat; sesudahnya dibekukan. */
  kkm?: number;
  nilai_maks: number;
  catatan?: string | null;
}

export interface NilaiSiswaItem {
  id_siswa: string;
  nama_lengkap: string;
  nis: string;
  id_nilai: string | null;
  /** `null` berarti BELUM DINILAI, bukan nol. */
  skor: number | null;
  keterangan: string | null;
}

export interface PenilaianDetail {
  penilaian: PenilaianItem;
  items: NilaiSiswaItem[];
}

export interface SimpanNilaiDraft {
  id_penilaian: string;
  items: Array<{
    id_siswa: string;
    skor: number | null;
    keterangan?: string | null;
  }>;
}

/**
 * Batas baris daftar penilaian. Cermin `LIMIT 300` di `listAssessments`
 * (`services/grades.ts`) dan `assessment_list_query` (`grades.rs`); dipakai UI
 * untuk memberi tahu bahwa daftarnya terpotong.
 */
export const BATAS_DAFTAR_PENILAIAN = 300;

export interface PenilaianFilter {
  id_tahun_ajaran: string;
  semester: Semester;
  /** Kosong/`null` berarti semua rombel. */
  id_rombel?: string | null;
  id_mapel?: string | null;
  /** `id_jenis`, atau nama jenis lama. */
  jenis?: string | null;
}

// ── Nilai akhir (N2a) ───────────────────────────────────────────────────────

export interface JenisNilaiItem {
  id_jenis: string;
  nama: string;
  bobot: number;
  urutan: number;
  is_aktif: number;
  bawaan: boolean;
  /** Banyak penilaian yang memakai jenis ini. */
  dipakai: number;
}

export interface KonfigurasiNilai {
  jenis: JenisNilaiItem[];
  bobot_kehadiran: number;
  total_bobot: number;
  hari_sekolah: HariSekolah;
  unit: Array<{ id_unit: string; nama_unit: string }>;
}

export interface RekapNilaiAkhir {
  nama_mapel: string;
  rentang: { mulai: string; selesai: string };
  bobot_kehadiran: number;
  jenis: Array<{
    id_jenis: string;
    nama: string;
    bobot: number;
    jumlah_penilaian: number;
  }>;
  /** "<Mapel>: belum ada penilaian <Jenis>". */
  catatan: string[];
  /** Banyak skor kosong yang dihitung 0. */
  nilai_kosong: number;
  siswa: Array<{
    id_siswa: string;
    nama_lengkap: string;
    nis: string;
    komponen: Array<{
      id_jenis: string;
      rata: number | null;
      bobot_efektif: number | null;
      nilai_berbobot: number | null;
    }>;
    kehadiran: {
      hari_efektif: number;
      masuk: number;
      izin_sakit: number;
      tidak_masuk: number;
      persen: number | null;
      bobot_efektif: number | null;
      nilai_berbobot: number | null;
      bolos: Array<{ tanggal: string; mapel: string[] }>;
    };
    nilai_akhir: number | null;
    kosong: number;
  }>;
  /** Waktu cetak (WIB); rekap tidak dibekukan. */
  dicetak: string;
}

// ── Ekspor e-Rapor (N3) ─────────────────────────────────────────────────────

export interface BahanErapor {
  tahun_ajaran: string;
  semester: "Ganjil" | "Genap";
  rombel: string;
  tingkat: number;
  dicetak: string;
  jenis: Array<{ id_jenis: string; nama: string; is_aktif: number }>;
  siswa: Array<{ id_siswa: string; nama: string; nis: string; nisn: string }>;
  mapel: Array<{
    id_mapel: string;
    kode_mapel: string;
    nama_mapel: string;
    /** Guru yang memberi penilaian, dipisah "; ". */
    guru: string;
    penilaian: Array<{
      id_penilaian: string;
      id_jenis: string;
      nama_penilaian: string;
      tanggal: string;
      nilai_maks: number;
      kkm: number;
    }>;
    /** Hanya skor yang sudah diisi. */
    skor: Array<{ id_penilaian: string; id_siswa: string; skor: number }>;
    /** Dari rekap nilai akhir N2. */
    rekap: Array<{
      id_siswa: string;
      nilai_akhir: number | null;
      rata: Record<string, number | null>;
    }>;
  }>;
}
