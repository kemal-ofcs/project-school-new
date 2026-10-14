/**
 * Aturan nilai akhir (Fase N2a), cermin `desktop/nilai_akhir.rs`.
 *
 * Setiap fungsi di sini punya pasangan Rust bernama sama dalam snake_case dan
 * diuji dengan vektor yang sama (`nilai-akhir.test.ts` ↔ `mod tests` di
 * `nilai_akhir.rs`). Pesan galatnya pun wajib identik. Urutan operasi pecahan
 * dijaga sama persis supaya hasil `f64` di kedua sisi identik bit per bit.
 */

import { z } from "zod";
import type { Hasil } from "./accounting";
import JENIS_BAWAAN from "./jenis-nilai-bawaan.json";

export interface JenisBawaan {
  id_jenis: string;
  nama: string;
  urutan: number;
}

/** Lima jenis lama berid tetap. Dibaca Rust dari berkas JSON yang sama. */
export const JENIS_NILAI_BAWAAN: readonly JenisBawaan[] = JENIS_BAWAAN;

/** Kunci setting tersinkron (`setting_gex_system`). Kebijakan sekolah, bukan pengaturan perangkat. */
export const KUNCI_BOBOT_KEHADIRAN = "nilai_bobot_kehadiran";
export const KUNCI_HARI_SEKOLAH = "hari_sekolah";
/** CHECK lama `nilai_penilaian.jenis` hanya mengenal lima nama; jenis buatan sekolah menulis nilai warisan ini. */
export const JENIS_WARISAN_BUATAN = "Tugas";
export const MAKS_NAMA_JENIS = 40;
/** Cermin `LIMIT 500` penilaian per mapel di rekap. */
export const BATAS_PENILAIAN_REKAP = 500;

/** Cermin `SEED_JENIS_SQL`. Idempoten: bobot yang sudah diatur tidak ditimpa. */
export const SEED_JENIS_SQL =
  "INSERT OR IGNORE INTO nilai_jenis (id_jenis, nama, bobot, urutan, is_aktif, created_at, updated_at) VALUES (?, ?, 0, ?, 1, datetime('now'), datetime('now'));";

export function isJenisBawaan(idJenis: string): boolean {
  return JENIS_NILAI_BAWAAN.some((item) => item.id_jenis === idJenis);
}

/** Cermin `id_jenis_efektif`: kolom `id_jenis` NULL (baris lama/perangkat lama) diturunkan dari nama jenisnya. */
export function idJenisEfektif(
  idJenis: string | null | undefined,
  jenis: string,
): string | null {
  const id = idJenis?.trim();
  if (id) return id;
  return (
    JENIS_NILAI_BAWAAN.find((item) => item.nama === jenis)?.id_jenis ?? null
  );
}

/** Cermin `jenis_warisan`: nilai kolom `jenis` lama untuk sebuah `id_jenis`. */
export function jenisWarisan(idJenis: string): string {
  return (
    JENIS_NILAI_BAWAAN.find((item) => item.id_jenis === idJenis)?.nama ??
    JENIS_WARISAN_BUATAN
  );
}

// ── Jenis dan bobot ─────────────────────────────────────────────────────────

export const jenisNilaiDraftSchema = z
  .object({
    id_jenis: z.string().nullish(),
    nama: z.string().default(""),
    urutan: z.number().default(0),
    is_aktif: z.boolean().default(true),
  })
  .strict();

export type JenisNilaiDraft = z.input<typeof jenisNilaiDraftSchema>;

export interface JenisNilaiValid {
  nama: string;
  urutan: number;
  is_aktif: boolean;
}

/** Cermin `validate_jenis_nilai`. */
export function validateJenisNilai(
  draft: z.output<typeof jenisNilaiDraftSchema>,
): Hasil<JenisNilaiValid> {
  const nama = draft.nama.trim();
  if (!nama) return { ok: false, error: "Nama jenis wajib diisi." };
  if (Array.from(nama).length > MAKS_NAMA_JENIS) {
    return { ok: false, error: "Nama jenis maksimal 40 karakter." };
  }
  if (
    !Number.isInteger(draft.urutan) ||
    draft.urutan < 0 ||
    draft.urutan > 999
  ) {
    return { ok: false, error: "Urutan harus bilangan 0 sampai 999." };
  }
  return {
    ok: true,
    value: { nama, urutan: draft.urutan, is_aktif: draft.is_aktif },
  };
}

export interface BobotJenis {
  id_jenis: string;
  bobot: number;
  is_aktif: boolean;
}

/**
 * Cermin `validate_bobot_nilai`: bobot jenis aktif + bobot kehadiran wajib
 * tepat 100. Nilai yang tidak sah ditolak, tidak pernah dinormalkan.
 */
export function validateBobotNilai(
  bobotKehadiran: number,
  jenis: readonly BobotJenis[],
): Hasil<number> {
  const sah = (nilai: number) =>
    Number.isInteger(nilai) && nilai >= 0 && nilai <= 100;
  if (!sah(bobotKehadiran) || jenis.some((item) => !sah(item.bobot))) {
    return { ok: false, error: "Bobot harus bilangan bulat 0 sampai 100." };
  }
  if (jenis.some((item) => !item.is_aktif && item.bobot > 0)) {
    return { ok: false, error: "Jenis nonaktif tidak boleh berbobot." };
  }
  const total = jenis.reduce((sum, item) => sum + item.bobot, bobotKehadiran);
  if (total !== 100) {
    return { ok: false, error: `Total bobot harus 100%, sekarang ${total}%.` };
  }
  return { ok: true, value: total };
}

// ── Hari Sekolah ────────────────────────────────────────────────────────────

/** 1 = Senin s.d. 7 = Minggu, sama dengan Jadwal Mengajar. */
export interface HariSekolah {
  bawaan: number[];
  unit: Record<string, number[]>;
}

export const HARI_SEKOLAH_BAWAAN: HariSekolah = {
  bawaan: [1, 2, 3, 4, 5],
  unit: {},
};

/** Cermin `validate_daftar_hari`: hasilnya terurut naik. */
export function validateDaftarHari(daftar: unknown): Hasil<number[]> {
  if (!Array.isArray(daftar) || daftar.length === 0) {
    return { ok: false, error: "Pilih minimal satu hari sekolah." };
  }
  if (daftar.some((hari) => !Number.isInteger(hari) || hari < 1 || hari > 7)) {
    return {
      ok: false,
      error: "Hari sekolah harus angka 1 (Senin) sampai 7 (Minggu).",
    };
  }
  if (new Set(daftar).size !== daftar.length) {
    return { ok: false, error: "Hari sekolah tidak boleh ganda." };
  }
  return { ok: true, value: [...(daftar as number[])].sort((a, b) => a - b) };
}

/** Cermin `validate_hari_sekolah`. */
export function validateHariSekolah(nilai: unknown): Hasil<HariSekolah> {
  const bentukSalah = {
    ok: false as const,
    error: "Data hari sekolah tidak valid.",
  };
  if (typeof nilai !== "object" || nilai === null || Array.isArray(nilai)) {
    return bentukSalah;
  }
  const kunci = Object.keys(nilai);
  if (kunci.some((k) => k !== "bawaan" && k !== "unit")) return bentukSalah;
  const objek = nilai as { bawaan?: unknown; unit?: unknown };
  const bawaan = validateDaftarHari(objek.bawaan);
  if (!bawaan.ok) return bawaan;
  const unitMentah = objek.unit ?? {};
  if (
    typeof unitMentah !== "object" ||
    unitMentah === null ||
    Array.isArray(unitMentah)
  ) {
    return bentukSalah;
  }
  const unit: Record<string, number[]> = {};
  for (const [idUnit, daftar] of Object.entries(unitMentah)) {
    if (!idUnit.trim()) return bentukSalah;
    const hasil = validateDaftarHari(daftar);
    if (!hasil.ok) return hasil;
    unit[idUnit] = hasil.value;
  }
  return { ok: true, value: { bawaan: bawaan.value, unit } };
}

/** Cermin `parse_hari_sekolah`: setting yang kosong atau rusak jatuh ke bawaan Senin sampai Jumat. */
export function parseHariSekolah(
  tersimpan: string | null | undefined,
): HariSekolah {
  if (!tersimpan) return HARI_SEKOLAH_BAWAAN;
  try {
    const hasil = validateHariSekolah(JSON.parse(tersimpan));
    return hasil.ok ? hasil.value : HARI_SEKOLAH_BAWAAN;
  } catch {
    return HARI_SEKOLAH_BAWAAN;
  }
}

export function hariSekolahUntuk(
  konfigurasi: HariSekolah,
  idUnit: string | null,
): number[] {
  return (idUnit ? konfigurasi.unit[idUnit] : undefined) ?? konfigurasi.bawaan;
}

// ── Rentang semester ────────────────────────────────────────────────────────

export interface BarisTahunAjaran {
  nama_tahun: string;
  semester: string;
  tanggal_mulai: string;
  tanggal_selesai: string;
}

/**
 * Cermin `rentang_semester` (keputusan B): baris terpilih bila semesternya
 * sama; baris bernama sama untuk semester yang diminta; atau aturan tetap
 * Ganjil Juli sampai Desember, Genap Januari sampai Juni, dipotong ke rentang
 * baris terpilih.
 */
export function rentangSemester(
  pilihan: BarisTahunAjaran,
  saudara: { tanggal_mulai: string; tanggal_selesai: string } | null,
  diminta: string,
): Hasil<{ mulai: string; selesai: string }> {
  if (pilihan.semester === diminta) {
    return {
      ok: true,
      value: { mulai: pilihan.tanggal_mulai, selesai: pilihan.tanggal_selesai },
    };
  }
  if (saudara) {
    return {
      ok: true,
      value: { mulai: saudara.tanggal_mulai, selesai: saudara.tanggal_selesai },
    };
  }
  const tahun =
    /^(\d{4})/.exec(pilihan.nama_tahun.trim())?.[1] ??
    pilihan.tanggal_mulai.slice(0, 4);
  const awal = Number(tahun);
  const [a, b] =
    diminta === "Ganjil"
      ? [`${awal}-07-01`, `${awal}-12-31`]
      : [`${awal + 1}-01-01`, `${awal + 1}-06-30`];
  const mulai = pilihan.tanggal_mulai > a ? pilihan.tanggal_mulai : a;
  const selesai = pilihan.tanggal_selesai < b ? pilihan.tanggal_selesai : b;
  if (!Number.isInteger(awal) || mulai > selesai) {
    return {
      ok: false,
      error: `Rentang tanggal semester ${diminta} tidak bisa ditentukan. Buat baris tahun ajaran untuk semester ${diminta}.`,
    };
  }
  return { ok: true, value: { mulai, selesai } };
}

// ── Kehadiran ───────────────────────────────────────────────────────────────

export type KategoriHari =
  | "Hadir"
  | "Bolos"
  | "Dispensasi"
  | "Izin"
  | "Sakit"
  | "Alfa";

/** Cermin `hadir_di_gerbang`: scan gerbang sah, atau status hadir hasil koreksi. */
export function hadirDiGerbang(hadirGerbang: number, status: string): boolean {
  return hadirGerbang === 1 || status === "Hadir" || status === "Terlambat";
}

/**
 * Cermin `klasifikasi_hari` (PRD 4.3). Hadir dan Dispensasi = masuk; Izin
 * dan Sakit seharian keluar dari pembagi; Bolos (datang tetapi Alfa di
 * mapel) dan Alfa = tidak masuk.
 */
export function klasifikasiHari(
  gerbang: boolean,
  alfaMapel: boolean,
  status: string,
): KategoriHari {
  if (gerbang) return alfaMapel ? "Bolos" : "Hadir";
  if (status === "Dispensasi" || status === "Izin" || status === "Sakit") {
    return status;
  }
  return "Alfa";
}

/** Cermin `persen_kehadiran`. Pembagi nol (sakit sepanjang semester) = tanpa angka. */
export function persenKehadiran(
  masuk: number,
  hariEfektif: number,
  keluar: number,
): number | null {
  const pembagi = hariEfektif - keluar;
  return pembagi > 0 ? (masuk * 100) / pembagi : null;
}

// ── Nilai akhir ─────────────────────────────────────────────────────────────

/** Cermin `bulat_akhir`: dibulatkan SEKALI di akhir, setengah ke atas. */
export function bulatAkhir(nilai: number): number {
  return Math.floor(nilai + 0.5 + 1e-9);
}

export interface SkorPenilaian {
  skor: number | null;
  nilai_maks: number;
  bobot: number;
}

/**
 * Cermin `rata_jenis`: rata-rata skor ternormalisasi (0 sampai 100) satu
 * jenis, ditimbang bobot per penilaian (keputusan D). Skor kosong = 0.
 * Tanpa penilaian sama sekali = tanpa angka.
 */
export function rataJenis(items: readonly SkorPenilaian[]): number | null {
  let jumlah = 0;
  let timbang = 0;
  for (const item of items) {
    const ternormalisasi = ((item.skor ?? 0) * 100) / item.nilai_maks;
    jumlah += ternormalisasi * item.bobot;
    timbang += item.bobot;
  }
  return timbang > 0 ? jumlah / timbang : null;
}

export interface KomponenNilai {
  bobot: number;
  /** `null` = komponen tidak ada (jenis tanpa penilaian, atau kehadiran tanpa pembagi). */
  nilai: number | null;
}

/**
 * Cermin `hitung_nilai_akhir` (PRD 4.4): bobot komponen yang tidak ada dibagi
 * proporsional ke komponen yang ada. Tanpa komponen berbobot = tanpa angka.
 */
export function hitungNilaiAkhir(komponen: readonly KomponenNilai[]): {
  nilai_akhir: number | null;
  bobot_efektif: Array<number | null>;
} {
  let total = 0;
  for (const item of komponen) if (item.nilai !== null) total += item.bobot;
  if (total <= 0) {
    return { nilai_akhir: null, bobot_efektif: komponen.map(() => null) };
  }
  let jumlah = 0;
  for (const item of komponen) {
    if (item.nilai !== null) jumlah += item.nilai * item.bobot;
  }
  return {
    nilai_akhir: bulatAkhir(jumlah / total),
    bobot_efektif: komponen.map((item) =>
      item.nilai === null ? null : (item.bobot * 100) / total,
    ),
  };
}
