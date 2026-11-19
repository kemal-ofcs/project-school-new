/**
 * HRIS Fase 8 (`prd-hris/fase-8.md` §26.2.3): reimbursement.
 *
 * Cermin `desktop/hr_reimburse.rs`, diuji dengan vektor yang sama
 * (`hr-reimburse.vektor.json`); teks SQL dan pesan dibandingkan harfiah oleh
 * `hr-reimburse.test.ts`. Keenam tabel `hr_reimburse*` KHUSUS CLOUD (Q-160).
 */
import { z } from "zod";
import { tanggalValid } from "./hari-kerja";
import { MAKS_BASE64_DOKUMEN } from "./hris";

/**
 * Cermin `SEED_JENIS_REIMBURSE_SQL`. Berid tetap dan `INSERT OR IGNORE`:
 * jenis yang sudah disunting tidak ditimpa.
 */
export const SEED_JENIS_REIMBURSE_SQL =
  "INSERT OR IGNORE INTO hr_reimburse_jenis (id_jenis, nama, wajib_nota) VALUES ('rmj-transport', 'Transport', 0), ('rmj-kesehatan', 'Kesehatan', 1), ('rmj-konsumsi', 'Konsumsi', 1), ('rmj-dinas', 'Dinas', 1), ('rmj-lainnya', 'Lainnya', 1);";

// Aturan murni (§26.2.3)

/** WAJIB sama dengan CHECK `hr_reimburse_keputusan.aksi`. */
export const AKSI_KEPUTUSAN = ["Setujui", "Tolak", "Batal"] as const;
export type AksiKeputusan = (typeof AKSI_KEPUTUSAN)[number];
export const MAKS_NOMINAL_REIMBURSE = 1_000_000_000;
export const MAKS_NAMA_JENIS_REIMBURSE = 100;
export const MAKS_KEPERLUAN = 1000;
export const MAKS_ALASAN_REIMBURSE = 1000;
export const MAKS_KETERANGAN_BAYAR = 500;
export const MAKS_KLAIM_BAYAR = 100;
/**
 * Pemegang salah satunya membaca semua klaim; pemegang `hr.reimburse.submit`
 * saja hanya klaim yang ia ajukan.
 */
export const IZIN_LIHAT_REIMBURSE = [
  "hr.reimburse.view",
  "hr.reimburse.decide",
  "hr.reimburse.pay",
] as const;

export const PESAN_KLAIM_TIDAK_ADA = "Klaim tidak ditemukan.";
export const PESAN_KLAIM_DITOLAK_SIMPAN =
  "Klaim tidak tersimpan: pegawai belum ada di database pusat, atau jenisnya tidak aktif.";
export const PESAN_KLAIM_TERKUNCI =
  "Klaim ini sudah diputus. Batalkan lalu ajukan ulang bila perlu dikoreksi.";
export const PESAN_KLAIM_SELESAI = "Klaim ini sudah ditolak atau dibatalkan.";
export const PESAN_BATAL_TERBAYAR =
  "Klaim ini sudah dibayar. Batalkan pembayarannya dulu.";
export const PESAN_DIRI_SENDIRI_REIMBURSE =
  "Klaim atas diri sendiri tidak bisa Anda putus.";
export const PESAN_DI_LUAR_CAKUPAN_REIMBURSE = "Klaim ini di luar unit Anda.";
export const PESAN_BUTUH_PEMUTUS =
  "Hanya pemutus reimbursement yang bisa melakukan ini.";
export const PESAN_KLAIM_BERUBAH =
  "Klaim berubah sejak dimuat. Muat ulang lalu coba lagi.";
export const PESAN_NOTA_TERKUNCI =
  "Nota tidak bisa diubah sesudah klaim diputus.";
export const PESAN_NOTA_PENUH = "Klaim ini sudah berisi 5 nota.";
export const PESAN_NOTA_DITOLAK =
  "Nota hanya bisa diubah oleh yang mengajukan klaim.";
export const PESAN_JENIS_GANDA =
  "Nama jenis reimbursement sudah dipakai jenis aktif lain.";
export const PESAN_BAYAR_KOSONG = "Pilih minimal satu klaim.";
export const PESAN_BAYAR_TIDAK_SAH =
  "Hanya klaim Disetujui yang belum dibayar milik pegawai yang sama yang bisa dibayar.";
export const PESAN_BAYAR_TIDAK_ADA = "Pembayaran tidak ditemukan.";
export const PESAN_BAYAR_SUDAH_BATAL = "Pembayaran ini sudah dibatalkan.";

type Hasil<T> = { ok: true; nilai: T } | { ok: false; galat: string };
const ok = <T>(nilai: T): Hasil<T> => ({ ok: true, nilai });
const gagal = <T = never>(galat: string): Hasil<T> => ({ ok: false, galat });
type Draft = Record<string, unknown>;

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
  if (t && [...t].length > maks)
    return gagal(`${label} maksimal ${maks} karakter.`);
  return ok(t);
}

/** Cermin `bulat`: `null` = kosong, `undefined` = bukan bulat dalam rentang. */
function bulat(
  draft: Draft,
  kunci: string,
  min: number,
  maks: number,
): number | null | undefined {
  const n = draft[kunci];
  if (n === undefined || n === null) return null;
  return typeof n === "number" && Number.isInteger(n) && n >= min && n <= maks
    ? n
    : undefined;
}

const benar = (draft: Draft, kunci: string, bawaan: boolean) =>
  typeof draft[kunci] === "boolean" ? (draft[kunci] as boolean) : bawaan;

export interface JenisSah {
  id_jenis: string | null;
  nama: string;
  wajib_nota: boolean;
  batas_bulanan: number | null;
  is_aktif: boolean;
}

/** Cermin `validasi_jenis`. Batas bulanan hanya memberi tanda. */
export function validasiJenis(draft: Draft): Hasil<JenisSah> {
  const nama = teksOpsional(
    draft,
    "nama",
    "Nama jenis",
    MAKS_NAMA_JENIS_REIMBURSE,
  );
  if (!nama.ok) return nama;
  if (nama.nilai === null) return gagal("Nama jenis wajib diisi.");
  const batas = bulat(draft, "batas_bulanan", 1, MAKS_NOMINAL_REIMBURSE);
  if (batas === undefined)
    return gagal("Batas bulanan harus bilangan bulat 1 sampai 1000000000.");
  return ok({
    id_jenis: isian(draft, "id_jenis"),
    nama: nama.nilai,
    wajib_nota: benar(draft, "wajib_nota", false),
    batas_bulanan: batas,
    is_aktif: benar(draft, "is_aktif", true),
  });
}

export interface KlaimSah {
  id_karyawan: string;
  id_jenis: string;
  tanggal: string;
  nominal: number;
  keperluan: string;
}

/** Cermin `validasi_klaim`: tanggal biaya tidak lewat hari ini WIB. */
export function validasiKlaim(draft: Draft, hariIni: string): Hasil<KlaimSah> {
  const idKaryawan = isian(draft, "id_karyawan");
  if (!idKaryawan) return gagal("Pegawai wajib dipilih.");
  const idJenis = isian(draft, "id_jenis");
  if (!idJenis) return gagal("Jenis reimbursement wajib dipilih.");
  const tanggal = isian(draft, "tanggal");
  if (!tanggal || !tanggalValid(tanggal))
    return gagal("Tanggal biaya tidak valid.");
  if (tanggal > hariIni)
    return gagal("Tanggal biaya tidak boleh sesudah hari ini.");
  const nominal = bulat(draft, "nominal", 1, MAKS_NOMINAL_REIMBURSE);
  if (nominal === null || nominal === undefined)
    return gagal("Nominal harus bilangan bulat 1 sampai 1000000000.");
  const keperluan = teksOpsional(
    draft,
    "keperluan",
    "Keperluan",
    MAKS_KEPERLUAN,
  );
  if (!keperluan.ok) return keperluan;
  if (keperluan.nilai === null) return gagal("Keperluan wajib diisi.");
  return ok({
    id_karyawan: idKaryawan,
    id_jenis: idJenis,
    tanggal,
    nominal,
    keperluan: keperluan.nilai,
  });
}

export type StatusKlaim = "Menunggu" | "Disetujui" | "Ditolak" | "Dibatalkan";
export type StatusBayar = "Belum dibayar" | "Dibayar";

/** Cermin `status_klaim`: Batal selalu menang (Q-162). */
export function statusKlaim(aksi: readonly string[]): StatusKlaim {
  if (aksi.includes("Batal")) return "Dibatalkan";
  if (aksi.includes("Setujui")) return "Disetujui";
  if (aksi.includes("Tolak")) return "Ditolak";
  return "Menunggu";
}

/** Cermin `status_bayar`: jumlah pembayaran aktif yang memuat klaim itu. */
export function statusBayar(jumlahAktif: number): StatusBayar {
  return jumlahAktif > 0 ? "Dibayar" : "Belum dibayar";
}

/** Keadaan klaim dan wewenang SESI saat memutus, cermin `KeadaanKeputusan`. */
export interface KeadaanKeputusan {
  status: string;
  dibayar: boolean;
  nominal: number;
  /** Sesi memegang `hr.reimburse.decide`. */
  boleh_putus: boolean;
  /** Klaim atas personil yang tertaut ke sesi (A-2). */
  sendiri: boolean;
  dalam_cakupan: boolean;
  /** Sesi adalah akun yang mencatat klaim (`diajukan_oleh`). */
  pengaju_sendiri: boolean;
}

export interface KeputusanSah {
  aksi: AksiKeputusan;
  nominal_disetujui: number | null;
  alasan: string | null;
}

/** Cermin `pemutus_sah`. */
export const pemutusSah = (k: KeadaanKeputusan) =>
  k.boleh_putus && !k.sendiri && k.dalam_cakupan;

/** Cermin `periksa_keputusan` (§26.2.3). */
export function periksaKeputusan(
  draft: Draft,
  k: KeadaanKeputusan,
): Hasil<KeputusanSah> {
  const aksi = isian(draft, "aksi");
  if (!aksi || !(AKSI_KEPUTUSAN as readonly string[]).includes(aksi))
    return gagal("Aksi keputusan harus Setujui, Tolak, atau Batal.");
  const alasan = teksOpsional(draft, "alasan", "Alasan", MAKS_ALASAN_REIMBURSE);
  if (!alasan.ok) return alasan;
  const batalPengaju =
    aksi === "Batal" && k.pengaju_sendiri && k.status === "Menunggu";
  if (!batalPengaju) {
    if (!k.boleh_putus) return gagal(PESAN_BUTUH_PEMUTUS);
    if (k.sendiri) return gagal(PESAN_DIRI_SENDIRI_REIMBURSE);
    if (!k.dalam_cakupan) return gagal(PESAN_DI_LUAR_CAKUPAN_REIMBURSE);
  }
  if (aksi !== "Batal" && k.status !== "Menunggu")
    return gagal(PESAN_KLAIM_TERKUNCI);
  if (aksi === "Batal" && (k.status === "Ditolak" || k.status === "Dibatalkan"))
    return gagal(PESAN_KLAIM_SELESAI);
  if (aksi === "Batal" && k.dibayar) return gagal(PESAN_BATAL_TERBAYAR);
  let nominalDisetujui: number | null = null;
  if (aksi === "Setujui") {
    const n = bulat(draft, "nominal_disetujui", 1, k.nominal);
    if (n === undefined)
      return gagal(`Nominal disetujui harus 1 sampai ${k.nominal}.`);
    nominalDisetujui = n ?? k.nominal;
    if (nominalDisetujui < k.nominal && alasan.nilai === null)
      return gagal(
        "Nominal disetujui lebih kecil dari pengajuan; alasannya wajib diisi.",
      );
  }
  if (aksi === "Tolak" && alasan.nilai === null)
    return gagal("Alasan penolakan wajib diisi.");
  if (aksi === "Batal" && alasan.nilai === null)
    return gagal("Alasan pembatalan wajib diisi.");
  return ok({
    aksi: aksi as AksiKeputusan,
    nominal_disetujui: nominalDisetujui,
    alasan: alasan.nilai,
  });
}

/** Cermin `lewat_batas`: batas bulanan hanya tanda, tidak pernah menolak. */
export const lewatBatas = (batasBulanan: number | null, total: number) =>
  batasBulanan !== null && total > batasBulanan;

/** Bahan `tandaKlaim`, cermin `KlaimTanda`. */
export interface KlaimTanda {
  id_karyawan: string;
  id_jenis: string;
  tanggal: string;
  status: string;
  nominal: number;
  nominal_disetujui: number | null;
  wajib_nota: boolean;
  batas_bulanan: number | null;
  jumlah_nota: number;
  jumlah_bayar: number;
}

export type TandaKlaim = "tanpa_nota" | "lewat_batas" | "dibayar_ganda";

const masihDihitung = (k: KlaimTanda) =>
  k.status === "Menunggu" || k.status === "Disetujui";

/** Cermin `tanda_klaim`. Tanda tidak pernah menolak. */
export function tandaKlaim(daftar: readonly KlaimTanda[]): TandaKlaim[][] {
  const nilai = (k: KlaimTanda) =>
    k.status === "Disetujui" ? (k.nominal_disetujui ?? k.nominal) : k.nominal;
  return daftar.map((k) => {
    const tanda: TandaKlaim[] = [];
    if (k.wajib_nota && k.jumlah_nota === 0) tanda.push("tanpa_nota");
    if (masihDihitung(k)) {
      const bulan = k.tanggal.slice(0, 7);
      const total = daftar
        .filter(
          (x) =>
            masihDihitung(x) &&
            x.id_karyawan === k.id_karyawan &&
            x.id_jenis === k.id_jenis &&
            x.tanggal.slice(0, 7) === bulan,
        )
        .reduce((jumlah, x) => jumlah + nilai(x), 0);
      if (lewatBatas(k.batas_bulanan, total)) tanda.push("lewat_batas");
    }
    if (k.jumlah_bayar > 1) tanda.push("dibayar_ganda");
    return tanda;
  });
}

export interface BayarSah {
  id_karyawan: string;
  id_klaim: string[];
  tanggal: string;
  keterangan: string | null;
}

/** Cermin `validasi_bayar`: tanggal kosong = hari ini WIB. */
export function validasiBayar(draft: Draft, hariIni: string): Hasil<BayarSah> {
  const idKaryawan = isian(draft, "id_karyawan");
  if (!idKaryawan) return gagal("Pegawai wajib dipilih.");
  const mentah = Array.isArray(draft.id_klaim) ? draft.id_klaim : [];
  const idKlaim = mentah
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.trim())
    .filter((t) => t !== "");
  const t = isian(draft, "tanggal");
  if (t !== null && !tanggalValid(t))
    return gagal("Tanggal bayar tidak valid.");
  if (t !== null && t > hariIni)
    return gagal("Tanggal bayar tidak boleh sesudah hari ini.");
  const keterangan = teksOpsional(
    draft,
    "keterangan",
    "Keterangan",
    MAKS_KETERANGAN_BAYAR,
  );
  if (!keterangan.ok) return keterangan;
  return ok({
    id_karyawan: idKaryawan,
    id_klaim: idKlaim,
    tanggal: t ?? hariIni,
    keterangan: keterangan.nilai,
  });
}

/** Bahan `periksaBayar`, cermin `KlaimBayar`. */
export interface KlaimBayar {
  id_klaim: string;
  id_karyawan: string;
  status: string;
  nominal_disetujui: number | null;
  jumlah_bayar: number;
}

/** Cermin `periksa_bayar`: total = Σ nominal disetujui, tidak dari isian. */
export function periksaBayar(
  idKaryawan: string,
  idKlaim: readonly string[],
  klaim: readonly KlaimBayar[],
): Hasil<number> {
  if (idKlaim.length === 0) return gagal(PESAN_BAYAR_KOSONG);
  if (idKlaim.length > MAKS_KLAIM_BAYAR)
    return gagal(`Satu pembayaran maksimal ${MAKS_KLAIM_BAYAR} klaim.`);
  let total = 0;
  for (const [i, id] of idKlaim.entries()) {
    if (idKlaim.slice(0, i).includes(id))
      return gagal("Klaim yang sama dipilih dua kali.");
    const k = klaim.find((x) => x.id_klaim === id);
    if (
      !k ||
      k.id_karyawan !== idKaryawan ||
      k.status !== "Disetujui" ||
      k.jumlah_bayar !== 0
    )
      return gagal(PESAN_BAYAR_TIDAK_SAH);
    total += k.nominal_disetujui ?? 0;
  }
  return ok(total);
}

/** Cermin `periksa_batal_bayar`. Pembatalan berid `batal-<id_bayar>`. */
export function periksaBatalBayar(
  jenis: string,
  sudahDibatalkan: boolean,
  alasan: string | null,
): Hasil<null> {
  if (jenis !== "Bayar") return gagal(PESAN_BAYAR_TIDAK_ADA);
  if (sudahDibatalkan) return gagal(PESAN_BAYAR_SUDAH_BATAL);
  if (alasan === null) return gagal("Alasan pembatalan wajib diisi.");
  return ok(null);
}

// SQL kembar (§26.3), salinan harfiah `hr_reimburse.rs`.

export const BAYAR_AKTIF_SQL =
  "b.jenis = 'Bayar' AND NOT EXISTS (SELECT 1 FROM hr_reimburse_bayar x WHERE x.jenis = 'Pembatalan' AND x.id_ref = b.id_bayar)";
export const JENIS_REIMBURSE_SQL =
  "SELECT id_jenis, nama, wajib_nota, batas_bulanan, is_aktif, COALESCE(diubah_oleh, '') AS diubah_oleh, updated_at FROM hr_reimburse_jenis ORDER BY is_aktif DESC, nama, id_jenis\n-- batas: jenis reimbursement, tidak tumbuh per hari\n;";
export const SIMPAN_JENIS_REIMBURSE_SQL =
  "INSERT INTO hr_reimburse_jenis (id_jenis, nama, wajib_nota, batas_bulanan, is_aktif, diubah_oleh, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'), datetime('now')) ON CONFLICT(id_jenis) DO UPDATE SET nama = excluded.nama, wajib_nota = excluded.wajib_nota, batas_bulanan = excluded.batas_bulanan, is_aktif = excluded.is_aktif, diubah_oleh = excluded.diubah_oleh, updated_at = excluded.updated_at;";
export const BENTROK_JENIS_REIMBURSE_SQL =
  "SELECT 1 AS ada FROM hr_reimburse_jenis WHERE id_jenis <> ?2 AND is_aktif = 1 AND lower(trim(nama)) = lower(trim(?1)) LIMIT 1;";
export const KLAIM_SQL =
  "SELECT r.id_klaim, r.id_karyawan, COALESCE(m.nama, r.id_karyawan) AS nama, COALESCE(m.unit, '') AS unit, r.id_jenis, COALESCE(j.nama, r.id_jenis) AS jenis, COALESCE(j.wajib_nota, 0) AS wajib_nota, j.batas_bulanan, r.tanggal, r.nominal, r.keperluan, r.diajukan_oleh, r.created_at, COALESCE((SELECT group_concat(k.aksi, ',') FROM hr_reimburse_keputusan k WHERE k.id_klaim = r.id_klaim), '') AS aksi, (SELECT k.nominal_disetujui FROM hr_reimburse_keputusan k WHERE k.id_klaim = r.id_klaim AND k.aksi = 'Setujui' LIMIT 1) AS nominal_disetujui, (SELECT COUNT(*) FROM hr_reimburse_berkas f WHERE f.id_klaim = r.id_klaim) AS jumlah_nota, (SELECT COUNT(*) FROM hr_reimburse_bayar_baris bb JOIN hr_reimburse_bayar b ON b.id_bayar = bb.id_bayar WHERE bb.id_klaim = r.id_klaim AND b.jenis = 'Bayar' AND NOT EXISTS (SELECT 1 FROM hr_reimburse_bayar x WHERE x.jenis = 'Pembatalan' AND x.id_ref = b.id_bayar)) AS jumlah_bayar FROM hr_reimburse r LEFT JOIN master_data m ON m.id_unik = r.id_karyawan LEFT JOIN hr_reimburse_jenis j ON j.id_jenis = r.id_jenis WHERE substr(r.tanggal, 1, 7) = ?1 OR r.id_karyawan = ?2 OR r.id_klaim = ?3 ORDER BY r.tanggal DESC, r.created_at DESC, r.id_klaim\n-- batas: klaim satu bulan, atau riwayat klaim satu pegawai\n;";
export const SIMPAN_KLAIM_SQL =
  "INSERT INTO hr_reimburse (id_klaim, id_karyawan, id_jenis, tanggal, nominal, keperluan, diajukan_oleh, created_at) SELECT ?1, m.id_unik, ?3, ?4, ?5, ?6, ?7, datetime('now') FROM master_data m WHERE m.id_unik = ?2 AND LOWER(TRIM(COALESCE(m.jenis_personil, ''))) <> 'siswa' AND NOT EXISTS (SELECT 1 FROM siswa_data sd WHERE sd.id_siswa = m.id_unik) AND EXISTS (SELECT 1 FROM hr_reimburse_jenis j WHERE j.id_jenis = ?3 AND j.is_aktif = 1);";
export const KEPUTUSAN_SQL =
  "SELECT id_keputusan, aksi, nominal_disetujui, COALESCE(alasan, '') AS alasan, diputus_oleh, created_at FROM hr_reimburse_keputusan WHERE id_klaim = ?1 ORDER BY created_at, id_keputusan\n-- batas: keputusan satu klaim, paling banyak dua\n;";
export const PUTUS_KLAIM_SQL =
  "INSERT INTO hr_reimburse_keputusan (id_keputusan, id_klaim, aksi, nominal_disetujui, alasan, diputus_oleh, created_at) SELECT ?1, r.id_klaim, ?3, ?4, ?5, ?6, datetime('now') FROM hr_reimburse r WHERE r.id_klaim = ?2 AND (?7 = 0 OR NOT EXISTS (SELECT 1 FROM hr_reimburse_keputusan k WHERE k.id_klaim = r.id_klaim)) AND ((?3 IN ('Setujui', 'Tolak') AND NOT EXISTS (SELECT 1 FROM hr_reimburse_keputusan k WHERE k.id_klaim = r.id_klaim)) OR (?3 = 'Batal' AND NOT EXISTS (SELECT 1 FROM hr_reimburse_keputusan k WHERE k.id_klaim = r.id_klaim AND k.aksi IN ('Tolak', 'Batal')) AND NOT EXISTS (SELECT 1 FROM hr_reimburse_bayar_baris bb JOIN hr_reimburse_bayar b ON b.id_bayar = bb.id_bayar WHERE bb.id_klaim = r.id_klaim AND b.jenis = 'Bayar' AND NOT EXISTS (SELECT 1 FROM hr_reimburse_bayar x WHERE x.jenis = 'Pembatalan' AND x.id_ref = b.id_bayar))));";
export const NOTA_SQL =
  "SELECT id_berkas, urutan, COALESCE(nama_berkas, '') AS nama_berkas, mime_type, (length(data_base64) / 4) * 3 - (CASE WHEN data_base64 LIKE '%==' THEN 2 WHEN data_base64 LIKE '%=' THEN 1 ELSE 0 END) AS ukuran_byte, COALESCE(diunggah_oleh, '') AS diunggah_oleh, created_at FROM hr_reimburse_berkas WHERE id_klaim = ?1 ORDER BY urutan\n-- batas: nota satu klaim, maksimal 5\n;";
export const AMBIL_NOTA_SQL =
  "SELECT f.id_berkas, f.id_klaim, COALESCE(f.nama_berkas, '') AS nama_berkas, f.mime_type, f.data_base64, r.diajukan_oleh FROM hr_reimburse_berkas f JOIN hr_reimburse r ON r.id_klaim = f.id_klaim WHERE f.id_berkas = ?1 LIMIT 1;";
export const PEMILIK_NOTA_SQL =
  "SELECT f.id_klaim, r.diajukan_oleh FROM hr_reimburse_berkas f JOIN hr_reimburse r ON r.id_klaim = f.id_klaim WHERE f.id_berkas = ?1 LIMIT 1;";
export const TAMBAH_NOTA_SQL =
  "WITH slot(n) AS (VALUES (1), (2), (3), (4), (5)) INSERT INTO hr_reimburse_berkas (id_berkas, id_klaim, urutan, nama_berkas, mime_type, data_base64, diunggah_oleh, created_at) SELECT ?1, ?2, MIN(slot.n), ?3, ?4, ?5, ?6, datetime('now') FROM slot WHERE slot.n NOT IN (SELECT urutan FROM hr_reimburse_berkas WHERE id_klaim = ?2) AND EXISTS (SELECT 1 FROM hr_reimburse WHERE id_klaim = ?2) AND NOT EXISTS (SELECT 1 FROM hr_reimburse_keputusan WHERE id_klaim = ?2) HAVING MIN(slot.n) IS NOT NULL;";
export const HAPUS_NOTA_SQL =
  "DELETE FROM hr_reimburse_berkas WHERE id_berkas = ?1 AND NOT EXISTS (SELECT 1 FROM hr_reimburse_keputusan k WHERE k.id_klaim = hr_reimburse_berkas.id_klaim);";
export const PEMBAYARAN_SQL =
  "SELECT b.id_bayar, b.jenis, COALESCE(b.id_ref, '') AS id_ref, b.id_karyawan, b.tanggal, b.total, COALESCE(b.keterangan, '') AS keterangan, b.dicatat_oleh, b.created_at, COALESCE((SELECT group_concat(bb.id_klaim, ',') FROM hr_reimburse_bayar_baris bb WHERE bb.id_bayar = b.id_bayar), '') AS klaim, EXISTS (SELECT 1 FROM hr_reimburse_bayar x WHERE x.jenis = 'Pembatalan' AND x.id_ref = b.id_bayar) AS dibatalkan FROM hr_reimburse_bayar b WHERE b.id_karyawan = ?1 OR b.id_bayar = ?2 ORDER BY b.tanggal DESC, b.created_at DESC, b.id_bayar\n-- batas: pembayaran reimbursement satu pegawai\n;";
export const BAYAR_SQL =
  "INSERT INTO hr_reimburse_bayar (id_bayar, jenis, id_ref, id_karyawan, tanggal, total, keterangan, dicatat_oleh, created_at) SELECT ?1, 'Bayar', NULL, ?2, ?3, ?4, ?5, ?6, datetime('now') WHERE NOT EXISTS (SELECT 1 FROM json_each(?7) d WHERE NOT EXISTS (SELECT 1 FROM hr_reimburse r JOIN hr_reimburse_keputusan k ON k.id_klaim = r.id_klaim AND k.aksi = 'Setujui' WHERE r.id_klaim = d.value AND r.id_karyawan = ?2 AND NOT EXISTS (SELECT 1 FROM hr_reimburse_keputusan y WHERE y.id_klaim = r.id_klaim AND y.aksi = 'Batal') AND NOT EXISTS (SELECT 1 FROM hr_reimburse_bayar_baris bb JOIN hr_reimburse_bayar b ON b.id_bayar = bb.id_bayar WHERE bb.id_klaim = r.id_klaim AND b.jenis = 'Bayar' AND NOT EXISTS (SELECT 1 FROM hr_reimburse_bayar x WHERE x.jenis = 'Pembatalan' AND x.id_ref = b.id_bayar))));";
export const BAYAR_BARIS_SQL =
  "INSERT INTO hr_reimburse_bayar_baris (id_baris, id_bayar, id_klaim, nominal) SELECT ?1 || ':' || k.id_klaim, ?1, k.id_klaim, k.nominal_disetujui FROM hr_reimburse_keputusan k JOIN json_each(?2) d ON d.value = k.id_klaim WHERE k.aksi = 'Setujui' AND EXISTS (SELECT 1 FROM hr_reimburse_bayar b WHERE b.id_bayar = ?1);";
export const BATAL_BAYAR_SQL =
  "INSERT INTO hr_reimburse_bayar (id_bayar, jenis, id_ref, id_karyawan, tanggal, total, keterangan, dicatat_oleh, created_at) SELECT 'batal-' || b.id_bayar, 'Pembatalan', b.id_bayar, b.id_karyawan, ?2, b.total, ?3, ?4, datetime('now') FROM hr_reimburse_bayar b WHERE b.id_bayar = ?1 AND b.jenis = 'Bayar' AND NOT EXISTS (SELECT 1 FROM hr_reimburse_bayar x WHERE x.id_bayar = 'batal-' || b.id_bayar);";

// Bentuk rute dan command

const teksBebas = (maks: number) => z.string().max(maks).default("");
const id = z.string().min(1).max(200);

/** Body `reimburse/types/save`, cermin `draft` `desktop_hr_reimburse_types_save`. */
export const jenisReimburseDraftSchema = z
  .object({
    id_jenis: teksBebas(80),
    nama: teksBebas(MAKS_NAMA_JENIS_REIMBURSE + 100),
    wajib_nota: z.boolean().default(false),
    batas_bulanan: z.number().nullable().default(null),
    is_aktif: z.boolean().default(true),
  })
  .strict();
export type JenisReimburseDraft = z.input<typeof jenisReimburseDraftSchema>;

/** Body `reimburse/query`, cermin `query` `desktop_hr_reimburse_list`. */
export const klaimQuerySchema = z
  .object({
    mode: z.enum(["bulan", "pegawai", "rincian"]).default("bulan"),
    bulan: teksBebas(7),
    id_karyawan: teksBebas(80),
    id_klaim: teksBebas(80),
  })
  .strict();
export type KlaimQuery = z.input<typeof klaimQuerySchema>;

/** Body `reimburse/save`. */
export const klaimDraftSchema = z
  .object({
    id_karyawan: teksBebas(80),
    id_jenis: teksBebas(80),
    tanggal: teksBebas(20),
    nominal: z.number().nullable().default(null),
    keperluan: teksBebas(MAKS_KEPERLUAN + 100),
  })
  .strict();
export type KlaimDraft = z.input<typeof klaimDraftSchema>;

/** Body `reimburse/decide`. */
export const keputusanDraftSchema = z
  .object({
    id_klaim: id,
    aksi: z.enum(AKSI_KEPUTUSAN),
    nominal_disetujui: z.number().nullable().default(null),
    alasan: teksBebas(MAKS_ALASAN_REIMBURSE + 100),
  })
  .strict();
export type KeputusanDraft = z.input<typeof keputusanDraftSchema>;

/** Body `reimburse/file`; berkas hanya untuk `tambah`. */
export const notaDraftSchema = z
  .object({
    aksi: z.enum(["tambah", "hapus"]).default("tambah"),
    id_klaim: teksBebas(80),
    id_berkas: teksBebas(80),
    nama_berkas: teksBebas(400),
    mime_type: teksBebas(40),
    data_base64: z
      .string()
      .max(MAKS_BASE64_DOKUMEN + 8, "Berkas lebih dari 1 MB.")
      .default(""),
  })
  .strict();
export type NotaDraft = z.input<typeof notaDraftSchema>;

export const idNotaSchema = z.object({ id }).strict();

/** Body `reimburse/pay`. */
export const bayarDraftSchema = z
  .object({
    id_karyawan: teksBebas(80),
    id_klaim: z.array(z.string().max(80)).max(MAKS_KLAIM_BAYAR + 1),
    tanggal: teksBebas(20),
    keterangan: teksBebas(MAKS_KETERANGAN_BAYAR + 100),
  })
  .strict();
export type BayarDraft = z.input<typeof bayarDraftSchema>;

/** Body `reimburse/pay/cancel`. */
export const batalBayarDraftSchema = z
  .object({ id_bayar: id, alasan: teksBebas(MAKS_ALASAN_REIMBURSE + 100) })
  .strict();
export type BatalBayarDraft = z.input<typeof batalBayarDraftSchema>;

// Bentuk hasil

export interface JenisReimburse {
  id_jenis: string;
  nama: string;
  wajib_nota: boolean;
  batas_bulanan: number | null;
  is_aktif: boolean;
  diubah_oleh: string;
  updated_at: string;
}

export interface KlaimBaris {
  id_klaim: string;
  id_karyawan: string;
  nama: string;
  unit: string;
  id_jenis: string;
  jenis: string;
  wajib_nota: boolean;
  batas_bulanan: number | null;
  tanggal: string;
  nominal: number;
  keperluan: string;
  diajukan_oleh: string;
  created_at: string;
  nominal_disetujui: number | null;
  jumlah_nota: number;
  jumlah_bayar: number;
  status: StatusKlaim;
  status_bayar: StatusBayar;
  tanda: TandaKlaim[];
}

export interface KeputusanBaris {
  id_keputusan: string;
  aksi: AksiKeputusan;
  nominal_disetujui: number | null;
  alasan: string;
  diputus_oleh: string;
  created_at: string;
}

export interface NotaBaris {
  id_berkas: string;
  urutan: number;
  nama_berkas: string;
  mime_type: string;
  ukuran_byte: number;
  diunggah_oleh: string;
  created_at: string;
}

export interface IsiNota {
  id_berkas: string;
  id_klaim: string;
  nama_berkas: string;
  mime_type: string;
  data_base64: string;
  diajukan_oleh: string;
}

export interface PembayaranBaris {
  id_bayar: string;
  jenis: "Bayar" | "Pembatalan";
  id_ref: string;
  id_karyawan: string;
  tanggal: string;
  total: number;
  keterangan: string;
  dicatat_oleh: string;
  created_at: string;
  klaim: string[];
  dibatalkan: boolean;
}

/** Sesi pembaca, supaya layar menilai tombol tanpa menebak. */
export interface SesiReimburse {
  id_karyawan: string;
  unit: string;
  lingkup_semua: boolean;
  lihat_semua: boolean;
}

export interface KlaimBulan {
  hari_ini: string;
  bulan: string;
  sesi: SesiReimburse;
  klaim: KlaimBaris[];
}

export interface KlaimPegawai {
  hari_ini: string;
  sesi: SesiReimburse;
  klaim: KlaimBaris[];
  bayar: PembayaranBaris[];
}

export interface RincianKlaim {
  hari_ini: string;
  sesi: SesiReimburse;
  klaim: KlaimBaris;
  keputusan: KeputusanBaris[];
  nota: NotaBaris[];
  bayar: PembayaranBaris[];
}
