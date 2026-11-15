/**
 * HRIS Fase 4 (`prd-hris.md` §22): surat peringatan dan pegawai keluar.
 *
 * Cermin `desktop/hr_keluar.rs`, diuji dengan vektor yang sama
 * (`hr-keluar.vektor.json`); teks SQL dibandingkan harfiah oleh
 * `hr-keluar.test.ts`. `hr_sp`, `hr_keluar`, `hr_keluar_rincian`, dan
 * `hr_keluar_alasan` KHUSUS CLOUD (Q-73); yang tersinkron hanya
 * `master_data.id_keluar`.
 */
import { z } from "zod";
import { parseHariKerja, tanggalValid } from "./hari-kerja";
import alasanBawaan from "./hr-keluar-alasan-bawaan.json";
import { tambahHari } from "./hr-pengajuan";
import {
  ATURAN_SP_MASA,
  angkaPengaturan,
  NOMOR_MAKS,
  tambahBulan,
} from "./hris";

export interface AlasanBawaan {
  id_alasan: string;
  nama: string;
  pengali_up: number;
  pengali_upmk: number;
  uph: boolean;
  kompensasi_pkwt: boolean;
  uang_pisah: boolean;
  dasar_hukum: string | null;
}

/** Angkanya wajib dicek ulang yayasan/konsultan; bisa disunting pemutus. */
export const ALASAN_BAWAAN: readonly AlasanBawaan[] = alasanBawaan;

/** Cermin `SEED_ALASAN_SQL`. Alasan yang sudah disunting tidak ditimpa. */
export const SEED_ALASAN_SQL =
  "INSERT OR IGNORE INTO hr_keluar_alasan (id_alasan, nama, pengali_up, pengali_upmk, uph, kompensasi_pkwt, uang_pisah, dasar_hukum) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8);";

/** Cermin `seed_alasan_args`. */
export function seedAlasanArgs(a: AlasanBawaan) {
  return [
    a.id_alasan,
    a.nama,
    a.pengali_up,
    a.pengali_upmk,
    a.uph ? 1 : 0,
    a.kompensasi_pkwt ? 1 : 0,
    a.uang_pisah ? 1 : 0,
    a.dasar_hukum,
  ];
}

// Surat peringatan: aturan murni (§22.2.1)

/** WAJIB sama dengan CHECK `hr_sp.tingkat`. */
export const TINGKAT_SP = ["SP1", "SP2", "SP3"] as const;
export type TingkatSp = (typeof TINGKAT_SP)[number];
export const MAKS_PELANGGARAN = 2000;
export const MAKS_TEKS_SP = 1000;
export const MAKS_PENANDA = 120;
export const MAKS_NIP_PENANDA = 30;

export const PESAN_DIRI_SENDIRI =
  "Tindakan ini tidak bisa dilakukan untuk diri sendiri.";
export const PESAN_DI_LUAR_CAKUPAN = "Pegawai ini di luar unit Anda.";
export const PESAN_BUTUH_SP3 =
  "SP3 hanya bisa dibuat atau diubah pemegang izin Terbitkan SP3.";
export const PESAN_SP_DICABUT = "SP ini sudah dicabut.";

type Hasil<T> = { ok: true; nilai: T } | { ok: false; galat: string };
const ok = <T>(nilai: T): Hasil<T> => ({ ok: true, nilai });
const gagal = <T = never>(galat: string): Hasil<T> => ({ ok: false, galat });
type Draft = Record<string, unknown>;

const panjang = (teks: string) => [...teks].length;

/** Cermin `payload_text`: teks dirapikan, kosong = `null`. */
function isian(draft: Draft, kunci: string): string | null {
  const nilai = draft[kunci];
  if (typeof nilai !== "string") return null;
  return nilai.trim() || null;
}

function teksOpsional(
  draft: Draft,
  kunci: string,
  label: string,
  maks: number,
): Hasil<string | null> {
  const t = isian(draft, kunci);
  if (t && panjang(t) > maks)
    return gagal(`${label} maksimal ${maks} karakter.`);
  return ok(t);
}

function teksWajib(
  draft: Draft,
  kunci: string,
  label: string,
  maks: number,
): Hasil<string> {
  const t = teksOpsional(draft, kunci, label, maks);
  if (!t.ok) return t;
  return t.nilai ? ok(t.nilai) : gagal(`${label} wajib diisi.`);
}

/** Cermin `akhir_masa_sp`: hari terakhir SP berlaku (inklusif). */
export function akhirMasaSp(tanggal: string, masaBulan: number): string | null {
  const akhir = tambahBulan(tanggal, masaBulan);
  return akhir ? tambahHari(akhir, -1) : null;
}

export type StatusSp = "Dicabut" | "Berlaku" | "Berakhir";

/** Cermin `status_sp`. Tidak disimpan. */
export function statusSp(
  tanggal: string,
  berlakuSampai: string,
  dicabut: boolean,
  hariIni: string,
): StatusSp {
  if (dicabut) return "Dicabut";
  return tanggal <= hariIni && hariIni <= berlakuSampai
    ? "Berlaku"
    : "Berakhir";
}

export interface SpRingkas {
  tingkat: string;
  tanggal: string;
  berlaku_sampai: string;
  dicabut: boolean;
}

/**
 * Cermin `usulan_tingkat`: SP Berlaku tertinggi pada `tanggal` + 1, maksimal
 * SP3. `sp3_berlaku` benar bila SP3 masih Berlaku (saatnya proses keluar).
 */
export function usulanTingkat(
  sp: readonly SpRingkas[],
  tanggal: string,
): { tingkat: TingkatSp; sp3_berlaku: boolean } {
  let tertinggi = -1;
  for (const s of sp) {
    if (statusSp(s.tanggal, s.berlaku_sampai, s.dicabut, tanggal) !== "Berlaku")
      continue;
    tertinggi = Math.max(
      tertinggi,
      (TINGKAT_SP as readonly string[]).indexOf(s.tingkat),
    );
  }
  if (tertinggi < 0) return { tingkat: "SP1", sp3_berlaku: false };
  if (tertinggi === 0) return { tingkat: "SP2", sp3_berlaku: false };
  return { tingkat: "SP3", sp3_berlaku: tertinggi >= 2 };
}

export interface SpSah {
  id_sp: string | null;
  id_karyawan: string;
  tingkat: TingkatSp;
  tanggal: string;
  nomor: string | null;
  pelanggaran: string;
  harapan: string | null;
  alasan_tingkat: string | null;
  penanda_nama: string;
  penanda_jabatan: string;
  penanda_nip: string | null;
}

/**
 * Cermin `validasi_sp`. Usulan tingkat, tanggal masuk, dan wewenang diperiksa
 * pemanggil.
 */
export function validasiSp(draft: Draft, hariIni: string): Hasil<SpSah> {
  const id_karyawan = isian(draft, "id_karyawan");
  if (!id_karyawan) return gagal("Pegawai wajib dipilih.");
  const tingkat = isian(draft, "tingkat");
  if (!tingkat || !(TINGKAT_SP as readonly string[]).includes(tingkat))
    return gagal("Tingkat SP tidak dikenal.");
  const tanggal = isian(draft, "tanggal");
  if (!tanggal || !tanggalValid(tanggal))
    return gagal("Tanggal SP tidak valid.");
  if (tanggal > hariIni) return gagal("Tanggal SP tidak boleh di masa depan.");
  const nomor = teksOpsional(draft, "nomor", "Nomor surat", NOMOR_MAKS);
  if (!nomor.ok) return nomor;
  const pelanggaran = teksWajib(
    draft,
    "pelanggaran",
    "Pelanggaran",
    MAKS_PELANGGARAN,
  );
  if (!pelanggaran.ok) return pelanggaran;
  const harapan = teksOpsional(
    draft,
    "harapan",
    "Perbaikan yang diminta",
    MAKS_TEKS_SP,
  );
  if (!harapan.ok) return harapan;
  const alasan_tingkat = teksOpsional(
    draft,
    "alasan_tingkat",
    "Alasan tingkat",
    MAKS_TEKS_SP,
  );
  if (!alasan_tingkat.ok) return alasan_tingkat;
  const penanda_nama = teksWajib(
    draft,
    "penanda_nama",
    "Nama penanda tangan",
    MAKS_PENANDA,
  );
  if (!penanda_nama.ok) return penanda_nama;
  const penanda_jabatan = teksWajib(
    draft,
    "penanda_jabatan",
    "Jabatan penanda tangan",
    MAKS_PENANDA,
  );
  if (!penanda_jabatan.ok) return penanda_jabatan;
  const penanda_nip = teksOpsional(
    draft,
    "penanda_nip",
    "NIP penanda tangan",
    MAKS_NIP_PENANDA,
  );
  if (!penanda_nip.ok) return penanda_nip;
  return ok({
    id_sp: isian(draft, "id_sp"),
    id_karyawan,
    tingkat: tingkat as TingkatSp,
    tanggal,
    nomor: nomor.nilai,
    pelanggaran: pelanggaran.nilai,
    harapan: harapan.nilai,
    alasan_tingkat: alasan_tingkat.nilai,
    penanda_nama: penanda_nama.nilai,
    penanda_jabatan: penanda_jabatan.nilai,
    penanda_nip: penanda_nip.nilai,
  });
}

/** Cermin `periksa_tingkat`: tingkat lain dari usulan wajib beralasan. */
export function periksaTingkat(
  tingkat: string,
  usulan: string,
  alasan: string | null,
): Hasil<null> {
  if (tingkat !== usulan && !alasan) {
    return gagal(
      `Tingkat berbeda dari usulan (${usulan}); alasannya wajib diisi.`,
    );
  }
  return ok(null);
}

/**
 * Cermin `periksa_wewenang_sp`: wewenang dari SESI (§22.4). `bolehSp3` hanya
 * dinilai untuk tingkat SP3; cabut memanggilnya dengan tingkat kosong.
 */
export function periksaWewenangSp(
  tingkat: string,
  sendiri: boolean,
  dalamCakupan: boolean,
  bolehSp3: boolean,
): Hasil<null> {
  if (sendiri) return gagal(PESAN_DIRI_SENDIRI);
  if (!dalamCakupan) return gagal(PESAN_DI_LUAR_CAKUPAN);
  if (tingkat === "SP3" && !bolehSp3) return gagal(PESAN_BUTUH_SP3);
  return ok(null);
}

/** Cermin `masa_sp_berlaku`: kunci `hr_sp_masa_bulan`; kosong/rusak = bawaan. */
export function masaSpBerlaku(nilai: string | null | undefined): number {
  return angkaPengaturan(nilai ?? "", ATURAN_SP_MASA);
}

// SQL, dieja harfiah sama di `desktop/hr_keluar.rs`

export const SP_PEGAWAI_SQL =
  "SELECT id_sp, id_karyawan, tingkat, usulan_tingkat, COALESCE(alasan_tingkat, '') AS alasan_tingkat, tanggal, masa_bulan, berlaku_sampai, COALESCE(nomor, '') AS nomor, pelanggaran, COALESCE(harapan, '') AS harapan, penanda_nama, penanda_jabatan, COALESCE(penanda_nip, '') AS penanda_nip, COALESCE(unit, '') AS unit, dicatat_oleh, created_at, COALESCE(diubah_oleh, '') AS diubah_oleh, COALESCE(diubah_pada, '') AS diubah_pada, COALESCE(dicabut_oleh, '') AS dicabut_oleh, COALESCE(dicabut_pada, '') AS dicabut_pada, COALESCE(alasan_cabut, '') AS alasan_cabut FROM hr_sp WHERE id_karyawan = ?1 ORDER BY tanggal DESC, created_at DESC, id_sp DESC\n-- batas: surat peringatan satu pegawai\n;";
export const SP_SATU_SQL =
  "SELECT id_sp, id_karyawan, tingkat, tanggal, COALESCE(unit, '') AS unit, COALESCE(dicabut_pada, '') AS dicabut_pada FROM hr_sp WHERE id_sp = ?1 LIMIT 1;";
export const PEGAWAI_SP_SQL =
  "SELECT m.id_unik, COALESCE(m.status_aktif, 'Aktif') AS status_aktif, COALESCE(m.tanggal_daftar, '') AS tanggal_daftar, COALESCE(m.unit, '') AS unit FROM master_data m WHERE m.id_unik = ?1 AND LOWER(TRIM(COALESCE(m.jenis_personil, ''))) <> 'siswa' AND NOT EXISTS (SELECT 1 FROM siswa_data sd WHERE sd.id_siswa = m.id_unik) LIMIT 1;";
export const MASA_SP_SQL =
  "SELECT value FROM setting_gex_system WHERE key = 'hr_sp_masa_bulan' LIMIT 1;";
export const NOMOR_KEMBAR_SQL =
  "SELECT COUNT(*) AS jumlah FROM hr_sp WHERE nomor = ?1 AND id_sp <> ?2;";
export const SIMPAN_SP_SQL =
  "INSERT INTO hr_sp (id_sp, id_karyawan, tingkat, usulan_tingkat, alasan_tingkat, tanggal, masa_bulan, berlaku_sampai, nomor, pelanggaran, harapan, penanda_nama, penanda_jabatan, penanda_nip, unit, dicatat_oleh, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, datetime('now'));";
export const UBAH_SP_SQL =
  "UPDATE hr_sp SET nomor = ?2, pelanggaran = ?3, harapan = ?4, penanda_nama = ?5, penanda_jabatan = ?6, penanda_nip = ?7, diubah_oleh = ?8, diubah_pada = datetime('now') WHERE id_sp = ?1 AND dicabut_pada IS NULL;";
export const CABUT_SP_SQL =
  "UPDATE hr_sp SET dicabut_oleh = ?2, dicabut_pada = datetime('now'), alasan_cabut = ?3 WHERE id_sp = ?1 AND dicabut_pada IS NULL;";

// Pegawai keluar: aturan murni (§22.2.2), cermin `desktop/hr_keluar.rs`

export const MAKS_TEKS_KELUAR = 1000;

export type StatusKeluar =
  | "Dibatalkan"
  | "Berlaku"
  | "Jatuh tempo"
  | "Dijadwalkan";

/** Cermin `status_keluar`. Tidak disimpan. */
export function statusKeluar(
  tanggalTerakhir: string,
  berlaku: boolean,
  dibatalkan: boolean,
  hariIni: string,
): StatusKeluar {
  if (dibatalkan) return "Dibatalkan";
  if (berlaku) return "Berlaku";
  return tanggalTerakhir <= hariIni ? "Jatuh tempo" : "Dijadwalkan";
}

export interface KeluarSah {
  id_keluar: string | null;
  id_karyawan: string;
  id_alasan: string;
  id_sp: string | null;
  tanggal_pemberitahuan: string | null;
  tanggal_terakhir: string;
  keterangan: string | null;
  kartu_ditarik: boolean;
  catatan_checklist: string | null;
  /** `null` = pakai usulan (`UPAH_RATA_SQL`). */
  upah_pokok: number | null;
  alasan_upah: string | null;
  tunjangan_tetap: number;
  /** Hanya baris yang nominalnya diisi; sisanya mengikuti usulan. */
  rincian: IsianRincian[];
}

/** Cermin `rupiah`: bilangan bulat 0..maks; tidak dikirim/`null` = `null`. */
function rupiah(
  draft: Draft,
  kunci: string,
  label: string,
  maks: number,
): Hasil<number | null> {
  const nilai = draft[kunci];
  if (nilai === undefined || nilai === null) return ok(null);
  if (
    typeof nilai !== "number" ||
    !Number.isInteger(nilai) ||
    nilai < 0 ||
    nilai > maks
  )
    return gagal(`${label} tidak valid.`);
  return ok(nilai);
}

/**
 * Cermin `validasi_keluar`. Hanya bentuk isian; status pegawai, tanggal masuk,
 * alasan aktif, wewenang, dan usulan diperiksa pemanggil. Hari terakhir boleh
 * di masa depan.
 */
export function validasiKeluar(draft: Draft): Hasil<KeluarSah> {
  const id_karyawan = isian(draft, "id_karyawan");
  if (!id_karyawan) return gagal("Pegawai wajib dipilih.");
  const id_alasan = isian(draft, "id_alasan");
  if (!id_alasan) return gagal("Alasan keluar wajib dipilih.");
  const tanggal_terakhir = isian(draft, "tanggal_terakhir");
  if (!tanggal_terakhir || !tanggalValid(tanggal_terakhir))
    return gagal("Hari terakhir bekerja tidak valid.");
  const tanggal_pemberitahuan = isian(draft, "tanggal_pemberitahuan");
  if (tanggal_pemberitahuan) {
    if (!tanggalValid(tanggal_pemberitahuan))
      return gagal("Tanggal pemberitahuan tidak valid.");
    if (tanggal_pemberitahuan > tanggal_terakhir)
      return gagal(
        "Tanggal pemberitahuan tidak boleh sesudah hari terakhir bekerja.",
      );
  }
  const keterangan = teksOpsional(
    draft,
    "keterangan",
    "Keterangan",
    MAKS_TEKS_KELUAR,
  );
  if (!keterangan.ok) return keterangan;
  const catatan = teksOpsional(
    draft,
    "catatan_checklist",
    "Catatan checklist",
    MAKS_TEKS_KELUAR,
  );
  if (!catatan.ok) return catatan;
  const upah = rupiah(draft, "upah_pokok", "Upah pokok", MAKS_UPAH);
  if (!upah.ok) return upah;
  const tunjangan = rupiah(
    draft,
    "tunjangan_tetap",
    "Tunjangan tetap",
    MAKS_UPAH,
  );
  if (!tunjangan.ok) return tunjangan;
  const tunjanganTetap = tunjangan.nilai ?? 0;
  if ((upah.nilai ?? 0) + tunjanganTetap > MAKS_UPAH)
    return gagal("Upah pokok + tunjangan tetap terlalu besar.");
  const alasanUpah = teksOpsional(
    draft,
    "alasan_upah",
    "Alasan upah",
    MAKS_TEKS_KELUAR,
  );
  if (!alasanUpah.ok) return alasanUpah;
  const rincian: IsianRincian[] = [];
  const daftar = draft.rincian;
  if (daftar !== undefined && daftar !== null) {
    if (!Array.isArray(daftar)) return gagal("Rincian tidak valid.");
    for (const baris of daftar as Draft[]) {
      const komponen = isian(baris ?? {}, "komponen");
      if (
        !komponen ||
        !(KOMPONEN_RINCIAN as readonly string[]).includes(komponen)
      )
        return gagal("Komponen rincian tidak dikenal.");
      if (rincian.some((r) => r.komponen === komponen))
        return gagal(`Komponen ${komponen} tercantum dua kali.`);
      const nominal = rupiah(
        baris,
        "nominal",
        `Nominal ${komponen}`,
        MAKS_NOMINAL_RINCIAN,
      );
      if (!nominal.ok) return nominal;
      if (nominal.nilai === null)
        return gagal(`Nominal ${komponen} tidak valid.`);
      const alasanUbah = teksOpsional(
        baris,
        "alasan_ubah",
        "Alasan perubahan",
        MAKS_TEKS_KELUAR,
      );
      if (!alasanUbah.ok) return alasanUbah;
      rincian.push({
        komponen: komponen as KomponenRincian,
        nominal: nominal.nilai,
        alasan_ubah: alasanUbah.nilai,
      });
    }
  }
  return ok({
    id_keluar: isian(draft, "id_keluar"),
    id_karyawan,
    id_alasan,
    id_sp: isian(draft, "id_sp"),
    tanggal_pemberitahuan,
    tanggal_terakhir,
    keterangan: keterangan.nilai,
    kartu_ditarik: draft.kartu_ditarik === true,
    catatan_checklist: catatan.nilai,
    upah_pokok: upah.nilai,
    alasan_upah: alasanUpah.nilai,
    tunjangan_tetap: tunjanganTetap,
    rincian,
  });
}

// Pesangon: aturan murni (§22.2.3), cermin `desktop/hr_keluar.rs`

/** WAJIB sama dengan CHECK `hr_keluar_rincian.komponen`; urutannya urutan tampil. */
export const KOMPONEN_RINCIAN = [
  "UP",
  "UPMK",
  "UPH Cuti",
  "UPH Lainnya",
  "Kompensasi PKWT",
  "Uang Pisah",
  "Lainnya",
] as const;
export type KomponenRincian = (typeof KOMPONEN_RINCIAN)[number];
export const MAKS_UPAH = 1_000_000_000;
export const MAKS_NOMINAL_RINCIAN = 100_000_000_000;
export const MAKS_PENGALI = 1000;
export const MAKS_NAMA_ALASAN = 100;

/** Cermin `bulan_penuh`: n terbesar dengan `tambahBulan(mulai, n)` ≤ `akhir`. */
export function bulanPenuh(mulai: string, akhir: string): number {
  if (!tanggalValid(mulai) || !tanggalValid(akhir)) return 0;
  const bulanKe = (t: string) =>
    Number(t.slice(0, 4)) * 12 + Number(t.slice(5, 7));
  let n = bulanKe(akhir) - bulanKe(mulai);
  while (n > 0) {
    const t = tambahBulan(mulai, n);
    if (t !== null && t <= akhir) break;
    n--;
  }
  return Math.max(n, 0);
}

/**
 * Cermin `masa_kerja_bulan`: bulan penuh dari `mulai` sampai hari sesudah
 * `tanggalTerakhir` (eksklusif).
 */
export function masaKerjaBulan(mulai: string, tanggalTerakhir: string): number {
  if (!tanggalValid(tanggalTerakhir)) return 0;
  return bulanPenuh(mulai, tambahHari(tanggalTerakhir, 1));
}

/** Kelipatan UP menurut tahun masa kerja (PP 35/2021 Pasal 40 ayat 2). */
export const kelipatanUp = (tahun: number) =>
  Math.min(Math.max(tahun + 1, 1), 9);

/** Kelipatan UPMK menurut tahun masa kerja (PP 35/2021 Pasal 40 ayat 3). */
export function kelipatanUpmk(tahun: number): number {
  if (tahun < 3) return 0;
  if (tahun >= 24) return 10;
  return Math.floor(tahun / 3) + 1;
}

/**
 * Cermin `rata_upah` (Q-82): total slip dibagi jumlah bulan berbeda,
 * dibulatkan setengah ke atas. Tanpa slip = 0 (wajib diisi tangan).
 */
export function rataUpah(total: number, bulan: number): number {
  if (bulan <= 0 || total <= 0) return 0;
  return Math.min(Math.floor((2 * total + bulan) / (2 * bulan)), MAKS_UPAH);
}

/** Cermin `pembagi_uph` (Q-83): 25 bila shift ≥ 6 hari kerja (kosong = 7), 21 bila kurang. */
export const pembagiUph = (hariKerja: string | null | undefined) =>
  parseHariKerja(hariKerja).length >= 6 ? 25 : 21;

export type KelompokStatus = "tetap" | "kontrak" | "negeri" | "lainnya";

/**
 * Cermin `kelompok_status` (Q-81): `tetap` GTY/PTY, `kontrak` GTT/PTT,
 * `negeri` PNS/PPPK, `lainnya` Honorer, tanpa status, dan teks lain.
 */
export function kelompokStatus(status: string): KelompokStatus {
  switch (status.trim().toUpperCase()) {
    case "GTY":
    case "PTY":
      return "tetap";
    case "GTT":
    case "PTT":
      return "kontrak";
    case "PNS":
    case "PPPK":
      return "negeri";
    default:
      return "lainnya";
  }
}

export interface MasukanPesangon {
  /** Status kini pada hari terakhir (`STATUS_KINI_SQL`). */
  status: string;
  /** Upah pokok + tunjangan tetap. */
  upah: number;
  /** `tanggal_daftar`; kosong = UP dan UPMK 0. */
  masa_kerja_mulai: string | null;
  tanggal_terakhir: string;
  pengali_up: number;
  pengali_upmk: number;
  uph: boolean;
  kompensasi_pkwt: boolean;
  uang_pisah: boolean;
  /** Sisa cuti periode yang memuat hari terakhir. */
  sisa_cuti: number;
  sebelum_berhak: boolean;
  /** 25 atau 21 (`pembagiUph`). */
  pembagi: number;
  /** Mulai kontrak berlaku pada hari terakhir yang punya tanggal selesai. */
  kontrak_mulai: string | null;
}

export interface Usulan {
  komponen: KomponenRincian;
  dasar: string | null;
  usulan: number;
}

/**
 * Cermin `usulan_pesangon` (§22.2.3, Q-81). Bilangan bulat, dibulatkan ke
 * rupiah terdekat (setengah ke atas); urutan = `KOMPONEN_RINCIAN`.
 */
export function usulanPesangon(m: MasukanPesangon): Usulan[] {
  const kelompok = kelompokStatus(m.status);
  if (kelompok === "negeri") return [];
  const upah = Math.min(Math.max(m.upah, 0), MAKS_UPAH);
  const yayasan = kelompok === "tetap" || kelompok === "kontrak";
  const hasil: Usulan[] = [];
  const baris = (komponen: KomponenRincian, dasar: string | null, n: number) =>
    hasil.push({ komponen, dasar, usulan: n });
  if (kelompok === "tetap") {
    const mulai = m.masa_kerja_mulai;
    if (mulai && tanggalValid(mulai)) {
      const tahun = Math.floor(masaKerjaBulan(mulai, m.tanggal_terakhir) / 12);
      for (const [komponen, kelipatan, pengali] of [
        ["UP", kelipatanUp(tahun), m.pengali_up],
        ["UPMK", kelipatanUpmk(tahun), m.pengali_upmk],
      ] as const) {
        baris(
          komponen,
          `Masa kerja ${tahun} tahun: ${kelipatan} × upah × ${pengali}%`,
          Math.floor((upah * kelipatan * pengali + 50) / 100),
        );
      }
    } else {
      baris("UP", "Tanggal masuk kosong", 0);
      baris("UPMK", "Tanggal masuk kosong", 0);
    }
  }
  if (yayasan && m.uph) {
    if (m.sisa_cuti > 0 && !m.sebelum_berhak) {
      const pembagi = Math.max(m.pembagi, 1);
      baris(
        "UPH Cuti",
        `Sisa cuti ${m.sisa_cuti} hari × upah ÷ ${pembagi}`,
        Math.floor((2 * m.sisa_cuti * upah + pembagi) / (2 * pembagi)),
      );
    }
    baris("UPH Lainnya", null, 0);
  }
  if (kelompok === "kontrak" && m.kompensasi_pkwt) {
    const mulai = m.kontrak_mulai;
    if (mulai && tanggalValid(mulai)) {
      const bulan = Math.max(masaKerjaBulan(mulai, m.tanggal_terakhir), 1);
      baris(
        "Kompensasi PKWT",
        `Kontrak ${bulan} bulan: upah × ${bulan} ÷ 12`,
        Math.floor((upah * bulan + 6) / 12),
      );
    }
  }
  if (kelompok === "tetap" && m.uang_pisah) baris("Uang Pisah", null, 0);
  baris("Lainnya", null, 0);
  return hasil;
}

export interface IsianRincian {
  komponen: KomponenRincian;
  nominal: number;
  alasan_ubah: string | null;
}

export interface RincianSah extends Usulan {
  nominal: number;
  alasan_ubah: string | null;
  urutan: number;
}

/**
 * Cermin `susun_rincian`: setiap baris usulan mendapat nominalnya (bawaan =
 * usulan); nominal lain dari usulan wajib beralasan, alasan hanya disimpan
 * bila nominal berbeda.
 */
export function susunRincian(
  usulan: readonly Usulan[],
  isianRincian: readonly IsianRincian[],
): Hasil<RincianSah[]> {
  const asing = isianRincian.find(
    (i) => !usulan.some((u) => u.komponen === i.komponen),
  );
  if (asing)
    return gagal(`Komponen ${asing.komponen} tidak berlaku untuk proses ini.`);
  const hasil: RincianSah[] = [];
  for (const [i, u] of usulan.entries()) {
    const isi = isianRincian.find((r) => r.komponen === u.komponen);
    const nominal = isi ? isi.nominal : u.usulan;
    const alasan_ubah =
      nominal !== u.usulan ? (isi?.alasan_ubah ?? null) : null;
    if (nominal !== u.usulan && !alasan_ubah)
      return gagal(
        `Nominal ${u.komponen} berbeda dari usulan; alasannya wajib diisi.`,
      );
    hasil.push({ ...u, nominal, alasan_ubah, urutan: i + 1 });
  }
  return ok(hasil);
}

/** Cermin `periksa_upah`: upah pokok lain dari usulan wajib beralasan. */
export function periksaUpah(
  upahPokok: number,
  usulan: number,
  alasan: string | null,
): Hasil<null> {
  if (upahPokok !== usulan && !alasan)
    return gagal("Upah pokok berbeda dari usulan; alasannya wajib diisi.");
  return ok(null);
}

export interface RingkasanPesangon {
  total: number;
  sisa_kasbon: number;
  /** Boleh negatif: sisa kasbon lebih besar dari pesangon. */
  perkiraan_diterima: number;
}

/** Cermin `ringkasan_pesangon`: tidak disimpan kecuali di potret Berlakukan. */
export function ringkasanPesangon(
  nominal: readonly number[],
  sisaKasbon: number,
): RingkasanPesangon {
  const total = nominal.reduce((n, x) => n + x, 0);
  return {
    total,
    sisa_kasbon: sisaKasbon,
    perkiraan_diterima: total - sisaKasbon,
  };
}

export interface AlasanSah {
  id_alasan: string | null;
  nama: string;
  pengali_up: number;
  pengali_upmk: number;
  uph: boolean;
  kompensasi_pkwt: boolean;
  uang_pisah: boolean;
  is_aktif: boolean;
  dasar_hukum: string | null;
}

/** Cermin `validasi_alasan`. Sakelar yang tidak dikirim = bawaan. */
export function validasiAlasan(draft: Draft): Hasil<AlasanSah> {
  const nama = teksWajib(draft, "nama", "Nama alasan", MAKS_NAMA_ALASAN);
  if (!nama.ok) return nama;
  const pengali = (kunci: string, label: string): Hasil<number> => {
    const n = draft[kunci];
    return typeof n === "number" &&
      Number.isInteger(n) &&
      n >= 0 &&
      n <= MAKS_PENGALI
      ? ok(n)
      : gagal(`${label} harus bilangan bulat 0–${MAKS_PENGALI} (persen).`);
  };
  const up = pengali("pengali_up", "Pengali UP");
  if (!up.ok) return up;
  const upmk = pengali("pengali_upmk", "Pengali UPMK");
  if (!upmk.ok) return upmk;
  const sakelar = (kunci: string, bawaan: boolean) =>
    typeof draft[kunci] === "boolean" ? (draft[kunci] as boolean) : bawaan;
  const dasar = teksOpsional(
    draft,
    "dasar_hukum",
    "Dasar hukum",
    MAKS_TEKS_KELUAR,
  );
  if (!dasar.ok) return dasar;
  return ok({
    id_alasan: isian(draft, "id_alasan"),
    nama: nama.nilai,
    pengali_up: up.nilai,
    pengali_upmk: upmk.nilai,
    uph: sakelar("uph", true),
    kompensasi_pkwt: sakelar("kompensasi_pkwt", false),
    uang_pisah: sakelar("uang_pisah", false),
    is_aktif: sakelar("is_aktif", true),
    dasar_hukum: dasar.nilai,
  });
}

/** Jenis surat keluar (kunci `hr_surat_pola:<jenis>`, §22.2.5). */
export const SURAT_KELUAR = ["berhenti", "pengalaman"] as const;
export type SuratKeluar = (typeof SURAT_KELUAR)[number];
export const PESAN_SURAT_BELUM_BERLAKU =
  "Surat keluar hanya untuk proses yang sudah berlaku.";
export const PESAN_SK_BUKAN_TETAP = "SK Pemberhentian hanya untuk GTY dan PTY.";
export const PESAN_KETERANGAN_NEGERI =
  "Surat keterangan pengalaman kerja tidak untuk PNS dan PPPK.";

/**
 * Cermin `periksa_surat_keluar` (Q-86): SK Pemberhentian untuk GTY/PTY,
 * keterangan pengalaman kerja untuk semua kecuali PNS/PPPK; keduanya hanya
 * untuk proses Berlaku.
 */
export function periksaSuratKeluar(
  jenis: string,
  statusKeluarIni: string,
  statusKepegawaian: string,
): Hasil<null> {
  if (!(SURAT_KELUAR as readonly string[]).includes(jenis))
    return gagal("Jenis surat tidak dikenal.");
  if (statusKeluarIni !== "Berlaku") return gagal(PESAN_SURAT_BELUM_BERLAKU);
  const kelompok = kelompokStatus(statusKepegawaian);
  if (jenis === "berhenti" && kelompok !== "tetap")
    return gagal(PESAN_SK_BUKAN_TETAP);
  if (jenis === "pengalaman" && kelompok === "negeri")
    return gagal(PESAN_KETERANGAN_NEGERI);
  return ok(null);
}

/** Cermin `status_aktif_keluar`: potongan SQL melawan zombie (Q-80). */
export const statusAktifKeluar = (baru: string) =>
  STATUS_AKTIF_KELUAR_SQL.replace("{baru}", baru);
/** Cermin `tanggal_selesai_keluar`. */
export const tanggalSelesaiKeluar = (baru: string) =>
  TANGGAL_SELESAI_KELUAR_SQL.replace("{baru}", baru);

// SQL keluar, dieja harfiah sama di `desktop/hr_keluar.rs`
// Checklist: `?1` = id pegawai, `?2` = hari terakhir bekerja.

export const PESAN_SUDAH_KELUAR =
  "Pegawai ini sudah keluar. Batalkan proses keluarnya di Kepegawaian untuk mengaktifkannya lagi.";
export const PESAN_HAPUS_GURU_KELUAR =
  "Guru ini sudah keluar, jadi datanya disimpan untuk surat keterangan dan rekap lama. Proses keluarnya diurus di Kepegawaian, tab Keluar.";
export const PESAN_SESI_KELUAR =
  "Akun ini tertaut ke pegawai yang sudah keluar dan tidak bisa dipakai lagi. Hubungi Superadmin.";
export const PESAN_SUPERADMIN_TERAKHIR =
  "Pegawai ini tertaut ke akun Superadmin aktif terakhir. Pindahkan peran Superadmin ke akun lain lebih dulu.";
export const PESAN_BLOKIR_JADWAL =
  "Masih ada jadwal mengajar aktif di semester yang berlanjut sesudah hari terakhir. Alihkan ke guru lain di Jadwal dulu.";
export const PESAN_BLOKIR_WALI =
  "Masih menjadi wali kelas di semester yang berlanjut sesudah hari terakhir. Ganti wali kelasnya di Rombel dulu.";
export const PESAN_KELUAR_BERLAKU = "Proses keluar ini sudah berlaku.";
export const PESAN_KELUAR_DIBATALKAN = "Proses keluar ini sudah dibatalkan.";
export const PESAN_BELUM_JATUH_TEMPO =
  "Proses keluar baru bisa diberlakukan mulai hari terakhir bekerja.";
export const PESAN_KELUAR_TERBUKA =
  "Pegawai ini sudah punya proses keluar yang belum dibatalkan.";
export const STATUS_AKTIF_KELUAR_SQL =
  "CASE WHEN COALESCE(master_data.id_keluar, '') <> '' THEN 'Nonaktif' ELSE {baru} END";
export const TANGGAL_SELESAI_KELUAR_SQL =
  "CASE WHEN COALESCE(master_data.id_keluar, '') <> '' THEN master_data.tanggal_selesai_aktif ELSE {baru} END";
export const KELUAR_DI_PERIODE_SQL =
  "OR (md.id_keluar IS NOT NULL AND md.tanggal_selesai_aktif >= ?1)";
export const KELUAR_LOKAL_SQL =
  "SELECT COALESCE(id_keluar, '') FROM master_data WHERE id_unik = ?1 AND COALESCE(id_keluar, '') <> '' LIMIT 1;";
export const JADWAL_AKTIF_KELUAR_SQL =
  "SELECT j.id_jadwal, j.hari, j.jam_ke, COALESCE(r.nama_rombel, j.id_rombel) AS nama_rombel, COALESCE(mp.nama_mapel, j.id_mapel) AS nama_mapel, t.nama_tahun, t.semester FROM jadwal_mengajar j JOIN akademik_tahun_ajaran t ON t.id_tahun_ajaran = j.id_tahun_ajaran LEFT JOIN akademik_rombel r ON r.id_rombel = j.id_rombel LEFT JOIN akademik_mapel mp ON mp.id_mapel = j.id_mapel WHERE j.id_guru = ?1 AND j.is_aktif = 1 AND t.tanggal_selesai > ?2 ORDER BY t.tanggal_mulai, j.hari, CAST(j.jam_ke AS INTEGER), j.jam_ke, j.id_jadwal LIMIT 200;";
export const WALI_KELUAR_SQL =
  "SELECT r.id_rombel, r.nama_rombel, t.nama_tahun, t.semester FROM akademik_rombel r JOIN akademik_tahun_ajaran t ON t.id_tahun_ajaran = r.id_tahun_ajaran WHERE r.id_wali_kelas = ?1 AND r.is_aktif = 1 AND t.tanggal_selesai > ?2 ORDER BY t.tanggal_mulai, r.nama_rombel, r.id_rombel LIMIT 50;";
export const TUGAS_KELUAR_SQL =
  "SELECT t.id_tugas, COALESCE(j.nama, t.id_jenis) AS nama_jenis, t.tahun_ajaran, t.tanggal_mulai, COALESCE(t.tanggal_selesai, '') AS tanggal_selesai FROM hr_tugas_tambahan t LEFT JOIN hr_tugas_jenis j ON j.id_jenis = t.id_jenis WHERE t.id_karyawan = ?1 AND t.dibatalkan_pada IS NULL AND t.id_jenis <> 'tgs-wali-kelas' AND (COALESCE(t.tanggal_selesai, '') = '' OR t.tanggal_selesai > ?2) ORDER BY t.tanggal_mulai, t.id_tugas LIMIT 50;";
export const PINJAMAN_PERSONIL_SQL =
  "SELECT * FROM (SELECT p.id_mutasi, b.nama_barang, b.kode_barang, b.satuan, p.tanggal, p.jumlah, COALESCE((SELECT SUM(r.jumlah) FROM inventory_mutasi r WHERE r.id_ref = p.id_mutasi AND r.alasan = 'Pengembalian' AND NOT EXISTS (SELECT 1 FROM inventory_mutasi rb WHERE rb.id_mutasi = 'batal-' || r.id_mutasi)), 0) AS kembali, b.desimal FROM inventory_mutasi p JOIN inventory_barang b ON b.id_barang = p.id_barang WHERE p.alasan = 'Peminjaman' AND p.penerima_tipe = 'Personil' AND p.penerima_id = ?1 AND NOT EXISTS (SELECT 1 FROM inventory_mutasi pb WHERE pb.id_mutasi = 'batal-' || p.id_mutasi)) WHERE jumlah > kembali ORDER BY tanggal, id_mutasi LIMIT 200;";
export const KASBON_KELUAR_SQL =
  "SELECT * FROM (SELECT p.id_pinjaman, p.pokok, p.cicilan, COALESCE(p.tanggal_cair, '') AS tanggal_cair, p.pokok - COALESCE((SELECT SUM(m.jumlah) FROM keu_pinjaman_mutasi m WHERE m.id_pinjaman = p.id_pinjaman AND m.jenis IN ('Angsuran Gaji', 'Pelunasan Tunai')), 0) - COALESCE((SELECT SUM(CAST(json_extract(k.value, '$.jumlah') AS INTEGER)) FROM payroll_items i JOIN payroll_runs r ON r.id = i.payroll_run_id, json_each(i.breakdown_snapshot, '$.kasbon') k WHERE r.status NOT IN ('PAID', 'REJECTED') AND json_extract(k.value, '$.id_pinjaman') = p.id_pinjaman), 0) AS sisa FROM keu_pinjaman p WHERE p.id_karyawan = ?1 AND p.status = 'Disetujui') WHERE sisa > 0 ORDER BY tanggal_cair, id_pinjaman LIMIT 50;";
export const RAPEL_KELUAR_SQL =
  "SELECT rp.id_rapel, rp.jumlah, rp.period_start, rp.period_end FROM payroll_rapel rp WHERE rp.id_karyawan = ?1 AND rp.dibatalkan_pada IS NULL AND NOT EXISTS (SELECT 1 FROM payroll_items i JOIN payroll_runs r ON r.id = i.payroll_run_id, json_each(CASE WHEN json_valid(i.breakdown_snapshot) THEN i.breakdown_snapshot ELSE '{}' END, '$.rapel') k WHERE i.id_karyawan = rp.id_karyawan AND r.status <> 'REJECTED' AND json_extract(k.value, '$.id_rapel') = rp.id_rapel) ORDER BY rp.period_start, rp.id_rapel LIMIT 50;";
export const PENGAJUAN_SESUDAH_SQL =
  "SELECT p.id_pengajuan, p.tanggal_mulai, p.tanggal_selesai, COALESCE(j.nama, p.id_jenis) AS nama_jenis FROM hr_pengajuan p LEFT JOIN hr_jenis_pengajuan j ON j.id_jenis = p.id_jenis WHERE p.id_karyawan = ?1 AND p.tanggal_selesai > ?2 AND NOT EXISTS (SELECT 1 FROM hr_pengajuan_keputusan b WHERE b.id_pengajuan = p.id_pengajuan AND b.jenis = 'Batal') AND COALESCE((SELECT k.jenis FROM hr_pengajuan_keputusan k WHERE k.id_pengajuan = p.id_pengajuan AND k.sidik = p.sidik AND k.jenis IN ('Setujui', 'Tolak', 'Setujui Urgent') ORDER BY k.diterima_cloud IS NULL, k.diterima_cloud, k.waktu_perangkat, k.id_keputusan LIMIT 1), '') <> 'Tolak' ORDER BY p.tanggal_mulai, p.id_pengajuan LIMIT 50;";
export const JP_PENGGANTI_SESUDAH_SQL =
  "SELECT h.id_penanganan, h.tanggal, COALESCE(h.jam_ke, '') AS jam_ke, COALESCE(mg.nama, p.id_karyawan) AS nama_guru FROM hr_jp_penanganan h JOIN hr_pengajuan p ON p.id_pengajuan = h.id_pengajuan LEFT JOIN master_data mg ON mg.id_unik = p.id_karyawan WHERE h.id_guru_pengganti = ?1 AND h.tanggal > ?2 AND NOT EXISTS (SELECT 1 FROM hr_pengajuan_keputusan b WHERE b.id_pengajuan = p.id_pengajuan AND b.jenis = 'Batal') AND COALESCE((SELECT k.jenis FROM hr_pengajuan_keputusan k WHERE k.id_pengajuan = p.id_pengajuan AND k.sidik = p.sidik AND k.jenis IN ('Setujui', 'Tolak', 'Setujui Urgent') ORDER BY k.diterima_cloud IS NULL, k.diterima_cloud, k.waktu_perangkat, k.id_keputusan LIMIT 1), '') <> 'Tolak' ORDER BY h.tanggal, h.id_penanganan LIMIT 100;";
export const RUN_MASA_TERAKHIR_SQL =
  "SELECT id, period_start, period_end, status FROM payroll_runs WHERE status <> 'REJECTED' AND period_end >= ?2 AND substr(period_end, 1, 7) = substr(?2, 1, 7) ORDER BY period_start, id LIMIT 20;";
export const ALFA_SESUDAH_SQL =
  "SELECT COUNT(*) AS jumlah FROM absensi_harian WHERE id_karyawan = ?1 AND tanggal > ?2 AND sumber = 'Generate Sistem';";
export const AKUN_TERTAUT_SQL =
  "SELECT m.id, m.username, m.nama_operator, COALESCE(m.status, 'Aktif') AS status, COALESCE(r.is_superadmin, 0) AS is_superadmin FROM master_operator m LEFT JOIN app_role r ON r.id = m.role_id WHERE m.id_karyawan = ?1 ORDER BY m.username LIMIT 20;";
export const SUPERADMIN_AKTIF_SQL =
  "SELECT COUNT(*) AS jumlah FROM master_operator m JOIN app_role r ON r.id = m.role_id WHERE r.is_superadmin = 1 AND COALESCE(m.status, 'Aktif') = 'Aktif';";
export const PEGAWAI_KELUAR_SQL =
  "SELECT m.id_unik, m.nama, COALESCE(m.status_aktif, 'Aktif') AS status_aktif, COALESCE(m.tanggal_daftar, '') AS tanggal_daftar, COALESCE(m.unit, '') AS unit, COALESCE(m.id_keluar, '') AS id_keluar, COALESCE(m.jenis_personil, '') AS jenis_personil, COALESCE(m.divisi, '') AS divisi, COALESCE(s.hari_kerja, '') AS hari_kerja FROM master_data m LEFT JOIN tbl_shift s ON s.id_shift = m.id_shift WHERE m.id_unik = ?1 AND LOWER(TRIM(COALESCE(m.jenis_personil, ''))) <> 'siswa' AND NOT EXISTS (SELECT 1 FROM siswa_data sd WHERE sd.id_siswa = m.id_unik) LIMIT 1;";
export const ALASAN_KELUAR_SQL =
  "SELECT id_alasan, nama, pengali_up, pengali_upmk, uph, kompensasi_pkwt, uang_pisah, is_aktif, COALESCE(dasar_hukum, '') AS dasar_hukum FROM hr_keluar_alasan ORDER BY is_aktif DESC, nama, id_alasan LIMIT 100;";
export const ALASAN_SATU_SQL =
  "SELECT id_alasan, nama, pengali_up, pengali_upmk, uph, kompensasi_pkwt, uang_pisah, is_aktif FROM hr_keluar_alasan WHERE id_alasan = ?1 LIMIT 1;";
export const DAFTAR_KELUAR_SQL =
  "SELECT k.id_keluar, k.id_karyawan, COALESCE(m.nama, k.id_karyawan) AS nama, COALESCE(m.unit, '') AS unit, k.id_alasan, COALESCE(k.alasan_nama, '') AS alasan_nama, COALESCE(k.id_sp, '') AS id_sp, COALESCE(k.status_kepegawaian, '') AS status_kepegawaian, COALESCE(k.tanggal_pemberitahuan, '') AS tanggal_pemberitahuan, k.tanggal_terakhir, COALESCE(k.keterangan, '') AS keterangan, COALESCE(k.masa_kerja_mulai, '') AS masa_kerja_mulai, k.kartu_ditarik, COALESCE(k.catatan_checklist, '') AS catatan_checklist, k.dicatat_oleh, k.created_at, COALESCE(k.diubah_oleh, '') AS diubah_oleh, COALESCE(k.diubah_pada, '') AS diubah_pada, COALESCE(k.berlaku_oleh, '') AS berlaku_oleh, COALESCE(k.berlaku_pada, '') AS berlaku_pada, COALESCE(k.dibatalkan_oleh, '') AS dibatalkan_oleh, COALESCE(k.dibatalkan_pada, '') AS dibatalkan_pada, COALESCE(k.alasan_batal, '') AS alasan_batal, k.upah_pokok, k.usulan_upah_pokok, k.tunjangan_tetap, COALESCE(k.alasan_upah, '') AS alasan_upah, COALESCE(k.nomor_sk, '') AS nomor_sk, COALESCE(k.nomor_keterangan, '') AS nomor_keterangan FROM hr_keluar k LEFT JOIN master_data m ON m.id_unik = k.id_karyawan ORDER BY k.tanggal_terakhir DESC, k.created_at DESC, k.id_keluar LIMIT 500;";
export const KELUAR_SATU_SQL =
  "SELECT k.id_keluar, k.id_karyawan, COALESCE(m.nama, k.id_karyawan) AS nama, COALESCE(m.unit, '') AS unit, k.id_alasan, COALESCE(k.alasan_nama, '') AS alasan_nama, COALESCE(k.id_sp, '') AS id_sp, COALESCE(k.status_kepegawaian, '') AS status_kepegawaian, COALESCE(k.tanggal_pemberitahuan, '') AS tanggal_pemberitahuan, k.tanggal_terakhir, COALESCE(k.keterangan, '') AS keterangan, COALESCE(k.masa_kerja_mulai, '') AS masa_kerja_mulai, k.kartu_ditarik, COALESCE(k.catatan_checklist, '') AS catatan_checklist, k.dicatat_oleh, k.created_at, COALESCE(k.diubah_oleh, '') AS diubah_oleh, COALESCE(k.diubah_pada, '') AS diubah_pada, COALESCE(k.berlaku_oleh, '') AS berlaku_oleh, COALESCE(k.berlaku_pada, '') AS berlaku_pada, COALESCE(k.dibatalkan_oleh, '') AS dibatalkan_oleh, COALESCE(k.dibatalkan_pada, '') AS dibatalkan_pada, COALESCE(k.alasan_batal, '') AS alasan_batal, k.upah_pokok, k.usulan_upah_pokok, k.tunjangan_tetap, COALESCE(k.alasan_upah, '') AS alasan_upah, COALESCE(k.nomor_sk, '') AS nomor_sk, COALESCE(k.nomor_keterangan, '') AS nomor_keterangan FROM hr_keluar k LEFT JOIN master_data m ON m.id_unik = k.id_karyawan WHERE k.id_keluar = ?1 LIMIT 1;";
export const SIMPAN_KELUAR_SQL =
  "INSERT INTO hr_keluar (id_keluar, id_karyawan, id_alasan, alasan_nama, id_sp, status_kepegawaian, tanggal_pemberitahuan, tanggal_terakhir, keterangan, masa_kerja_mulai, kartu_ditarik, catatan_checklist, dicatat_oleh, created_at, upah_pokok, usulan_upah_pokok, tunjangan_tetap, alasan_upah) SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, datetime('now'), ?14, ?15, ?16, ?17 WHERE NOT EXISTS (SELECT 1 FROM hr_keluar x WHERE x.id_karyawan = ?2 AND x.dibatalkan_pada IS NULL);";
export const UBAH_KELUAR_SQL =
  "UPDATE hr_keluar SET id_alasan = ?3, alasan_nama = ?4, id_sp = ?5, status_kepegawaian = ?6, tanggal_pemberitahuan = ?7, tanggal_terakhir = ?8, keterangan = ?9, masa_kerja_mulai = ?10, kartu_ditarik = ?11, catatan_checklist = ?12, upah_pokok = ?14, usulan_upah_pokok = ?15, tunjangan_tetap = ?16, alasan_upah = ?17, diubah_oleh = ?13, diubah_pada = datetime('now') WHERE id_keluar = ?1 AND id_karyawan = ?2 AND berlaku_pada IS NULL AND dibatalkan_pada IS NULL;";
export const BERLAKUKAN_SQL = [
  "UPDATE hr_keluar SET berlaku_oleh = ?2, berlaku_pada = datetime('now'), checklist_saat_berlaku = ?3 WHERE id_keluar = ?1 AND id_karyawan = ?4 AND berlaku_pada IS NULL AND dibatalkan_pada IS NULL AND tanggal_terakhir <= date('now', '+7 hours') AND NOT EXISTS (SELECT 1 FROM jadwal_mengajar j JOIN akademik_tahun_ajaran t ON t.id_tahun_ajaran = j.id_tahun_ajaran WHERE j.id_guru = ?4 AND j.is_aktif = 1 AND t.tanggal_selesai > hr_keluar.tanggal_terakhir) AND NOT EXISTS (SELECT 1 FROM akademik_rombel r JOIN akademik_tahun_ajaran t ON t.id_tahun_ajaran = r.id_tahun_ajaran WHERE r.id_wali_kelas = ?4 AND r.is_aktif = 1 AND t.tanggal_selesai > hr_keluar.tanggal_terakhir);",
  "UPDATE master_data SET status_aktif = 'Nonaktif', tanggal_selesai_aktif = (SELECT k.tanggal_terakhir FROM hr_keluar k WHERE k.id_keluar = ?1), id_keluar = ?1 WHERE id_unik = ?4 AND EXISTS (SELECT 1 FROM hr_keluar k WHERE k.id_keluar = ?1 AND k.id_karyawan = ?4 AND k.berlaku_pada IS NOT NULL AND k.dibatalkan_pada IS NULL);",
  "UPDATE master_operator SET status = 'Nonaktif', updated_at = datetime('now') WHERE id_karyawan = ?4 AND COALESCE(status, 'Aktif') = 'Aktif' AND EXISTS (SELECT 1 FROM hr_keluar k WHERE k.id_keluar = ?1 AND k.id_karyawan = ?4 AND k.berlaku_pada IS NOT NULL AND k.dibatalkan_pada IS NULL);",
  "UPDATE app_session SET revoked_at = datetime('now'), revoked_reason = 'pegawai-keluar' WHERE revoked_at IS NULL AND operator_id IN (SELECT id FROM master_operator WHERE id_karyawan = ?4) AND EXISTS (SELECT 1 FROM hr_keluar k WHERE k.id_keluar = ?1 AND k.id_karyawan = ?4 AND k.berlaku_pada IS NOT NULL AND k.dibatalkan_pada IS NULL);",
] as const;
export const BATALKAN_SQL = [
  "UPDATE master_data SET status_aktif = 'Aktif', tanggal_selesai_aktif = NULL, id_keluar = NULL WHERE id_keluar = ?1 AND EXISTS (SELECT 1 FROM hr_keluar k WHERE k.id_keluar = ?1 AND k.dibatalkan_pada IS NULL);",
  "UPDATE hr_keluar SET dibatalkan_oleh = ?2, dibatalkan_pada = datetime('now'), alasan_batal = ?3 WHERE id_keluar = ?1 AND dibatalkan_pada IS NULL;",
] as const;

// SQL pesangon dan surat keluar (4c), dieja harfiah sama di Rust

export const UPAH_RATA_SQL =
  "SELECT COALESCE(SUM(i.basic_salary + i.teaching_salary), 0) AS total, COUNT(DISTINCT substr(r.period_end, 1, 7)) AS bulan FROM payroll_items i JOIN payroll_runs r ON r.id = i.payroll_run_id WHERE i.id_karyawan = ?1 AND r.status = 'PAID' AND r.period_end <= ?2 AND r.period_end > date(?2, '-12 months')\n-- batas: satu baris agregat atas slip satu pegawai dalam 12 bulan\n;";
export const KONTRAK_KELUAR_SQL =
  "SELECT k.tanggal_mulai, COALESCE(k.tanggal_selesai, '') AS tanggal_selesai FROM hr_kontrak k WHERE k.id_karyawan = ?2 AND k.status <> 'Pembatalan' AND k.tanggal_mulai <= ?1 AND NOT EXISTS (SELECT 1 FROM hr_kontrak b WHERE b.status = 'Pembatalan' AND b.id_ref = k.id_kontrak) ORDER BY k.tanggal_mulai DESC, k.id_kontrak DESC LIMIT 1;";
export const TUNJANGAN_ACUAN_SQL =
  "SELECT id, name, CAST(ROUND(default_value) AS INTEGER) AS nilai, applies_to FROM payroll_components WHERE category = 'ALLOWANCE' AND calc_type = 'FIXED' AND is_active = 1 ORDER BY name, id LIMIT 100;";
export const RINCIAN_KELUAR_SQL =
  "SELECT komponen, COALESCE(dasar, '') AS dasar, usulan, nominal, COALESCE(alasan_ubah, '') AS alasan_ubah, urutan FROM hr_keluar_rincian WHERE id_keluar = ?1 ORDER BY urutan, komponen LIMIT 20;";
export const HAPUS_RINCIAN_SQL =
  "DELETE FROM hr_keluar_rincian WHERE id_keluar = ?1 AND EXISTS (SELECT 1 FROM hr_keluar k WHERE k.id_keluar = ?1 AND k.berlaku_pada IS NULL AND k.dibatalkan_pada IS NULL);";
export const SIMPAN_RINCIAN_SQL =
  "INSERT INTO hr_keluar_rincian (id_rincian, id_keluar, komponen, dasar, usulan, nominal, alasan_ubah, urutan) SELECT ?1 || ':' || ?2, ?1, ?2, ?3, ?4, ?5, ?6, ?7 WHERE EXISTS (SELECT 1 FROM hr_keluar k WHERE k.id_keluar = ?1 AND k.berlaku_pada IS NULL AND k.dibatalkan_pada IS NULL);";
export const SIMPAN_ALASAN_SQL =
  "INSERT INTO hr_keluar_alasan (id_alasan, nama, pengali_up, pengali_upmk, uph, kompensasi_pkwt, uang_pisah, is_aktif, dasar_hukum, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, datetime('now'), datetime('now'));";
export const UBAH_ALASAN_SQL =
  "UPDATE hr_keluar_alasan SET nama = ?2, pengali_up = ?3, pengali_upmk = ?4, uph = ?5, kompensasi_pkwt = ?6, uang_pisah = ?7, is_aktif = ?8, dasar_hukum = ?9, updated_at = datetime('now') WHERE id_alasan = ?1;";
/** Urutan `SURAT_KELUAR`. */
export const NOMOR_KELUAR_SQL = [
  "UPDATE hr_keluar SET nomor_sk = ?2 WHERE id_keluar = ?1 AND berlaku_pada IS NOT NULL AND dibatalkan_pada IS NULL;",
  "UPDATE hr_keluar SET nomor_keterangan = ?2 WHERE id_keluar = ?1 AND berlaku_pada IS NOT NULL AND dibatalkan_pada IS NULL;",
] as const;
export const NOMOR_KELUAR_KEMBAR_SQL =
  "SELECT COUNT(*) AS jumlah FROM hr_keluar WHERE id_keluar <> ?2 AND (nomor_sk = ?1 OR nomor_keterangan = ?1);";

// Bentuk rute dan command

const teksBebas = (maks: number) => z.string().max(maks).default("");

/** Body `warnings/save`, cermin `draft` `desktop_hr_warning_save`. */
export const spDraftSchema = z
  .object({
    id_sp: teksBebas(40),
    id_karyawan: z.string().min(1).max(80),
    tingkat: z.enum(TINGKAT_SP),
    tanggal: z.string().max(20),
    nomor: teksBebas(NOMOR_MAKS + 20),
    pelanggaran: z.string().max(MAKS_PELANGGARAN + 100),
    harapan: teksBebas(MAKS_TEKS_SP + 100),
    alasan_tingkat: teksBebas(MAKS_TEKS_SP + 100),
    penanda_nama: z.string().max(MAKS_PENANDA + 20),
    penanda_jabatan: z.string().max(MAKS_PENANDA + 20),
    penanda_nip: teksBebas(MAKS_NIP_PENANDA + 20),
  })
  .strict();
export type SpDraft = z.input<typeof spDraftSchema>;

export const spQuerySchema = z
  .object({ id_karyawan: z.string().min(1).max(80) })
  .strict();

export const spCabutSchema = z
  .object({
    id_sp: z.string().min(1).max(40),
    alasan: z.string().max(MAKS_TEKS_SP + 100),
  })
  .strict();

export interface SpBaris {
  id_sp: string;
  id_karyawan: string;
  tingkat: TingkatSp;
  usulan_tingkat: TingkatSp;
  alasan_tingkat: string;
  tanggal: string;
  masa_bulan: number;
  berlaku_sampai: string;
  nomor: string;
  pelanggaran: string;
  harapan: string;
  penanda_nama: string;
  penanda_jabatan: string;
  penanda_nip: string;
  unit: string;
  dicatat_oleh: string;
  created_at: string;
  diubah_oleh: string;
  diubah_pada: string;
  dicabut_oleh: string;
  dicabut_pada: string;
  alasan_cabut: string;
  status: StatusSp;
}

export interface DaftarSp {
  sp: SpBaris[];
  usulan: { tingkat: TingkatSp; sp3_berlaku: boolean };
  masa_bulan: number;
  hari_ini: string;
}

export interface HasilSimpanSp {
  sukses: true;
  id_sp: string;
  nomor_kembar: boolean;
}

// Bentuk rute dan command: pegawai keluar (4b)

/** Body `offboarding/save`, cermin `draft` `desktop_hr_offboarding_save`. */
export const keluarDraftSchema = z
  .object({
    id_keluar: teksBebas(40),
    id_karyawan: z.string().min(1).max(80),
    id_alasan: z.string().min(1).max(40),
    id_sp: teksBebas(40),
    tanggal_pemberitahuan: teksBebas(20),
    tanggal_terakhir: z.string().max(20),
    keterangan: teksBebas(MAKS_TEKS_KELUAR + 100),
    kartu_ditarik: z.boolean().default(false),
    catatan_checklist: teksBebas(MAKS_TEKS_KELUAR + 100),
    // Isinya diperiksa `validasiKeluar` (pesan yang sama dengan Rust).
    upah_pokok: z.number().nullable().default(null),
    alasan_upah: teksBebas(MAKS_TEKS_KELUAR + 100),
    tunjangan_tetap: z.number().default(0),
    rincian: z
      .array(
        z
          .object({
            komponen: z.enum(KOMPONEN_RINCIAN),
            nominal: z.number(),
            alasan_ubah: teksBebas(MAKS_TEKS_KELUAR + 100),
          })
          .strict(),
      )
      .max(KOMPONEN_RINCIAN.length)
      .default([]),
  })
  .strict();
export type KeluarDraft = z.input<typeof keluarDraftSchema>;

/**
 * Nomor surat keluar dari dialog cetak, lewat rute/command simpan yang sama
 * (`desktop_hr_offboarding_save` membedakannya dari kunci `jenis_surat`).
 */
export const keluarNomorSchema = z
  .object({
    id_keluar: z.string().min(1).max(40),
    jenis_surat: z.enum(SURAT_KELUAR),
    nomor: teksBebas(NOMOR_MAKS + 20),
  })
  .strict();
export type KeluarNomor = z.input<typeof keluarNomorSchema>;
export const keluarSimpanSchema = z.union([
  keluarNomorSchema,
  keluarDraftSchema,
]);

/** Body `offboarding/reasons`, cermin `draft` `desktop_hr_exit_reasons_save`. */
export const alasanDraftSchema = z
  .object({
    id_alasan: teksBebas(40),
    nama: z.string().max(MAKS_NAMA_ALASAN + 20),
    pengali_up: z.number(),
    pengali_upmk: z.number(),
    uph: z.boolean(),
    kompensasi_pkwt: z.boolean(),
    uang_pisah: z.boolean(),
    is_aktif: z.boolean(),
    dasar_hukum: teksBebas(MAKS_TEKS_KELUAR + 100),
  })
  .strict();
export type AlasanDraft = z.input<typeof alasanDraftSchema>;

/** Rincian (`id_keluar`) atau pratinjau (`id_karyawan` + `tanggal_terakhir`). */
export const keluarRincianSchema = z
  .object({
    id_keluar: teksBebas(40),
    id_karyawan: teksBebas(80),
    tanggal_terakhir: teksBebas(20),
  })
  .strict();

export const keluarIdSchema = z
  .object({ id_keluar: z.string().min(1).max(40) })
  .strict();

export const keluarBatalSchema = z
  .object({
    id_keluar: z.string().min(1).max(40),
    alasan: z.string().max(MAKS_TEKS_KELUAR + 100),
  })
  .strict();

export interface KeluarBaris {
  id_keluar: string;
  id_karyawan: string;
  nama: string;
  unit: string;
  id_alasan: string;
  alasan_nama: string;
  id_sp: string;
  status_kepegawaian: string;
  tanggal_pemberitahuan: string;
  tanggal_terakhir: string;
  keterangan: string;
  masa_kerja_mulai: string;
  kartu_ditarik: boolean;
  catatan_checklist: string;
  dicatat_oleh: string;
  created_at: string;
  diubah_oleh: string;
  diubah_pada: string;
  berlaku_oleh: string;
  berlaku_pada: string;
  dibatalkan_oleh: string;
  dibatalkan_pada: string;
  alasan_batal: string;
  upah_pokok: number;
  usulan_upah_pokok: number;
  tunjangan_tetap: number;
  alasan_upah: string;
  nomor_sk: string;
  nomor_keterangan: string;
  status: StatusKeluar;
}

export interface AlasanKeluar {
  id_alasan: string;
  nama: string;
  pengali_up: number;
  pengali_upmk: number;
  uph: boolean;
  kompensasi_pkwt: boolean;
  uang_pisah: boolean;
  is_aktif: boolean;
  dasar_hukum: string;
}

export interface DaftarKeluar {
  keluar: KeluarBaris[];
  alasan: AlasanKeluar[];
  hari_ini: string;
}

type Baris = Record<string, string>;

export interface ChecklistKeluar {
  /** Jumlah butir memblokir (jadwal + wali). */
  blokir: number;
  jadwal: Baris[];
  wali: Baris[];
  tugas: Baris[];
  barang: Baris[];
  kasbon: {
    id_pinjaman: string;
    tanggal_cair: string;
    pokok: number;
    cicilan: number;
    sisa: number;
  }[];
  sisa_kasbon: number;
  /** Periode jatah yang memuat hari terakhir; `null` = tanpa periode. */
  sisa_cuti: {
    mulai: string;
    selesai: string;
    sisa: number;
    sebelum_berhak: boolean;
  } | null;
  rapel: {
    id_rapel: string;
    period_start: string;
    period_end: string;
    jumlah: number;
  }[];
  pengajuan: Baris[];
  jp_pengganti: Baris[];
  run_masa_terakhir: Baris[];
  alfa_sesudah: number;
  akun: {
    id: number;
    username: string;
    nama_operator: string;
    status: string;
    is_superadmin: boolean;
  }[];
}

export interface RincianKeluar {
  keluar: KeluarBaris | null;
  pegawai: {
    id_unik: string;
    nama: string;
    status_aktif: string;
    tanggal_daftar: string;
    unit: string;
    id_keluar: string;
    jenis_personil: string;
    divisi: string;
    hari_kerja: string;
  };
  status_kepegawaian: string;
  /** Rincian tersimpan (kosong untuk pratinjau). */
  rincian: RincianTersimpan[];
  ringkasan: RingkasanPesangon;
  pesangon: BahanPesangon;
  checklist: ChecklistKeluar;
  alasan: AlasanKeluar[];
  hari_ini: string;
}

export interface RincianTersimpan {
  komponen: KomponenRincian;
  dasar: string;
  usulan: number;
  nominal: number;
  alasan_ubah: string;
  urutan: number;
}

/** Cermin `bahan_pesangon`: masukan usulan dari cloud. */
export interface BahanPesangon {
  status: string;
  usulan_upah_pokok: number;
  /** Jumlah bulan slip PAID yang dirata-rata; 0 = upah wajib diisi. */
  bulan_slip: number;
  pembagi: number;
  /** `""` = tanpa kontrak bertanggal selesai. */
  kontrak_mulai: string;
  /** Komponen ALLOWANCE nominal tetap aktif; disaring `appliesToSubject`. */
  tunjangan: { id: string; name: string; nilai: number; applies_to: string }[];
  /** Id jenis tugas tambahan yang berlaku pada hari terakhir. */
  tugas: string[];
}

/** Cermin `masukan_pesangon`: bahan cloud + alasan + sisa cuti + upah. */
export function masukanPesangon(
  bahan: BahanPesangon,
  pegawai: { tanggal_daftar: string },
  alasan: Pick<
    AlasanKeluar,
    "pengali_up" | "pengali_upmk" | "uph" | "kompensasi_pkwt" | "uang_pisah"
  >,
  sisaCuti: ChecklistKeluar["sisa_cuti"],
  tanggal: string,
  upah: number,
): MasukanPesangon {
  return {
    status: bahan.status,
    upah,
    masa_kerja_mulai: pegawai.tanggal_daftar || null,
    tanggal_terakhir: tanggal,
    pengali_up: alasan.pengali_up,
    pengali_upmk: alasan.pengali_upmk,
    uph: alasan.uph,
    kompensasi_pkwt: alasan.kompensasi_pkwt,
    uang_pisah: alasan.uang_pisah,
    sisa_cuti: sisaCuti?.sisa ?? 0,
    sebelum_berhak: sisaCuti?.sebelum_berhak === true,
    pembagi: bahan.pembagi,
    kontrak_mulai: bahan.kontrak_mulai || null,
  };
}

export interface HasilNomorKeluar {
  sukses: true;
  id_keluar: string;
  nomor_kembar: boolean;
}
