/**
 * HRIS Fase 7a (`prd-hris/fase-7.md` §25.2.1–§25.2.4): lowongan, pelamar,
 * tahap seleksi, CV, dan retensi pelamar.
 *
 * Cermin `desktop/hr_rekrutmen.rs`, diuji dengan vektor yang sama
 * (`hr-rekrutmen.vektor.json`); teks SQL dibandingkan harfiah oleh
 * `hr-rekrutmen.test.ts`. Keempat tabel rekrutmen KHUSUS CLOUD (Q-131).
 */
import { z } from "zod";
import {
  isValidOperatorEmail,
  isValidOperatorPhone,
  normalizeOperatorEmail,
  normalizeOperatorPhone,
} from "@/lib/operators/contact";
import { tanggalValid } from "./hari-kerja";
import { JENJANG, MAKS_BASE64_DOKUMEN } from "./hris";

// Aturan murni (§25.2.1–§25.2.2)

/** WAJIB sama dengan CHECK `hr_lowongan.kelompok`. */
export const KELOMPOK_LOWONGAN = ["Guru", "Tendik"] as const;
export type KelompokLowongan = (typeof KELOMPOK_LOWONGAN)[number];
/** Gabungan keduanya WAJIB sama dengan CHECK `hr_pelamar_tahap.tahap`. */
export const TAHAP_PROSES = [
  "Lamaran",
  "Seleksi Berkas",
  "Wawancara",
  "Microteaching",
  "Penawaran",
] as const;
export const TAHAP_AKHIR = ["Diterima", "Ditolak", "Mundur"] as const;
export type TahapPelamar =
  | (typeof TAHAP_PROSES)[number]
  | (typeof TAHAP_AKHIR)[number];
export const MAKS_JUDUL = 100;
export const MAKS_UNIT = 100;
export const MAKS_KETERANGAN = 2000;
export const MAKS_NAMA_PELAMAR = 100;
export const MAKS_ALAMAT_PELAMAR = 1000;
export const MAKS_TEKS_PELAMAR = 100;
export const MAKS_CATATAN_PELAMAR = 2000;
export const MAKS_CATATAN_TAHAP = 1000;
export const MAKS_BERKAS_PELAMAR = 3;
/** UU PDP (Q-140): konstanta, bukan pengaturan. */
export const RETENSI_PELAMAR_BULAN = 12;

export const PESAN_LOWONGAN_TIDAK_ADA = "Lowongan tidak ditemukan.";
export const PESAN_LOWONGAN_BERUBAH =
  "Lowongan ini baru saja berubah. Muat ulang lalu coba lagi.";
export const PESAN_KELOMPOK_TERKUNCI =
  "Kelompok lowongan tidak bisa diubah setelah ada pelamar.";
export const PESAN_LOWONGAN_BELUM_DIBUKA = "Lowongan ini belum dibuka.";
export const PESAN_PELAMAR_TIDAK_ADA = "Pelamar tidak ditemukan.";
export const PESAN_PELAMAR_TERKUNCI =
  "Pelamar ini sudah menjadi personil; datanya tidak bisa diubah atau dihapus.";
export const PESAN_TAHAP_AKHIR =
  "Pelamar sudah di tahap akhir. Batalkan tahap terakhir dulu bila keliru.";
export const PESAN_TAHAP_BERUBAH =
  "Tahap pelamar baru saja berubah. Muat ulang lalu coba lagi.";
export const PESAN_BERKAS_PELAMAR_PENUH =
  "Pelamar tidak ditemukan, sudah menjadi personil, atau sudah berisi 3 berkas.";

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

function tanggalWajib(draft: Draft, kunci: string, galat: string) {
  const t = isian(draft, kunci);
  return t && tanggalValid(t) ? ok(t) : gagal<string>(galat);
}

export interface LowonganSah {
  id_lowongan: string | null;
  judul: string;
  kelompok: KelompokLowongan;
  unit: string | null;
  id_bagian: string | null;
  id_jabatan: string | null;
  jumlah: number;
  tanggal_buka: string;
  tanggal_tutup: string | null;
  keterangan: string | null;
}

/** Cermin `validasi_lowongan`. Unit, bagian, jabatan diperiksa pemanggil. */
export function validasiLowongan(draft: Draft): Hasil<LowonganSah> {
  const judul = teksWajib(draft, "judul", "Judul lowongan", MAKS_JUDUL);
  if (!judul.ok) return judul;
  const kelompok = isian(draft, "kelompok");
  if (!kelompok || !(KELOMPOK_LOWONGAN as readonly string[]).includes(kelompok))
    return gagal("Kelompok lowongan wajib Guru atau Tendik.");
  const unit = teksOpsional(draft, "unit", "Unit", MAKS_UNIT);
  if (!unit.ok) return unit;
  const jumlah = draft.jumlah;
  if (
    typeof jumlah !== "number" ||
    !Number.isInteger(jumlah) ||
    jumlah < 1 ||
    jumlah > 99
  )
    return gagal("Jumlah yang dibutuhkan harus 1 sampai 99.");
  const buka = tanggalWajib(draft, "tanggal_buka", "Tanggal buka tidak valid.");
  if (!buka.ok) return buka;
  const tutup = isian(draft, "tanggal_tutup");
  if (tutup && !tanggalValid(tutup)) return gagal("Tanggal tutup tidak valid.");
  if (tutup && tutup < buka.nilai)
    return gagal("Tanggal tutup tidak boleh sebelum tanggal buka.");
  const keterangan = teksOpsional(
    draft,
    "keterangan",
    "Keterangan",
    MAKS_KETERANGAN,
  );
  if (!keterangan.ok) return keterangan;
  return ok({
    id_lowongan: isian(draft, "id_lowongan"),
    judul: judul.nilai,
    kelompok: kelompok as KelompokLowongan,
    unit: unit.nilai,
    id_bagian: isian(draft, "id_bagian"),
    id_jabatan: isian(draft, "id_jabatan"),
    jumlah,
    tanggal_buka: buka.nilai,
    tanggal_tutup: tutup,
    keterangan: keterangan.nilai,
  });
}

export type StatusLowongan = "Ditutup" | "Dijadwalkan" | "Dibuka";

/** Cermin `status_lowongan` (Q-136). Tidak disimpan. */
export function statusLowongan(
  tanggalBuka: string,
  tanggalTutup: string,
  ditutup: boolean,
  hariIni: string,
): StatusLowongan {
  if (ditutup || (tanggalTutup !== "" && tanggalTutup < hariIni))
    return "Ditutup";
  return tanggalBuka > hariIni ? "Dijadwalkan" : "Dibuka";
}

/** Cermin `periksa_buka_lagi`. */
export function periksaBukaLagi(
  tanggalTutup: string | null,
  tanggalBuka: string,
  hariIni: string,
): Hasil<null> {
  if (tanggalTutup === null) return ok(null);
  if (!tanggalValid(tanggalTutup)) return gagal("Tanggal tutup tidak valid.");
  if (tanggalTutup < hariIni)
    return gagal(
      "Tanggal tutup baru harus hari ini atau sesudahnya, atau dikosongkan.",
    );
  if (tanggalTutup < tanggalBuka)
    return gagal("Tanggal tutup tidak boleh sebelum tanggal buka.");
  return ok(null);
}

export interface PelamarSah {
  id_pelamar: string | null;
  id_lowongan: string;
  nama: string;
  no_hp: string | null;
  email: string | null;
  lp: string | null;
  tanggal_lahir: string | null;
  alamat: string | null;
  pendidikan: string | null;
  prodi: string | null;
  sumber: string | null;
  tanggal_lamaran: string;
  catatan: string | null;
}

/** Cermin `validasi_pelamar`. Tanpa NIK, KK, dan rekening (Q-132). */
export function validasiPelamar(
  draft: Draft,
  hariIni: string,
): Hasil<PelamarSah> {
  const id_lowongan = isian(draft, "id_lowongan");
  if (!id_lowongan) return gagal("Lowongan wajib dipilih.");
  const nama = teksWajib(draft, "nama", "Nama pelamar", MAKS_NAMA_PELAMAR);
  if (!nama.ok) return nama;
  if (panjang(nama.nilai) < 2) return gagal("Nama pelamar minimal 2 karakter.");
  const hp = isian(draft, "no_hp");
  if (hp && !isValidOperatorPhone(hp)) return gagal("Nomor HP tidak valid.");
  const surel = isian(draft, "email");
  const email = surel === null ? null : normalizeOperatorEmail(surel);
  if (email !== null && !isValidOperatorEmail(email))
    return gagal("Format email tidak valid.");
  const lp = isian(draft, "lp");
  if (lp && lp !== "L" && lp !== "P")
    return gagal("Jenis kelamin harus L atau P.");
  const lahir = isian(draft, "tanggal_lahir");
  if (lahir && (!tanggalValid(lahir) || lahir > hariIni))
    return gagal("Tanggal lahir tidak valid.");
  const alamat = teksOpsional(draft, "alamat", "Alamat", MAKS_ALAMAT_PELAMAR);
  if (!alamat.ok) return alamat;
  const pendidikan = isian(draft, "pendidikan");
  if (pendidikan && !(JENJANG as readonly string[]).includes(pendidikan))
    return gagal("Pendidikan tidak dikenal.");
  const prodi = teksOpsional(
    draft,
    "prodi",
    "Program studi",
    MAKS_TEKS_PELAMAR,
  );
  if (!prodi.ok) return prodi;
  const sumber = teksOpsional(
    draft,
    "sumber",
    "Sumber lamaran",
    MAKS_TEKS_PELAMAR,
  );
  if (!sumber.ok) return sumber;
  const lamaran = tanggalWajib(
    draft,
    "tanggal_lamaran",
    "Tanggal lamaran tidak valid.",
  );
  if (!lamaran.ok) return lamaran;
  if (lamaran.nilai > hariIni)
    return gagal("Tanggal lamaran tidak boleh di masa depan.");
  const catatan = teksOpsional(
    draft,
    "catatan",
    "Catatan",
    MAKS_CATATAN_PELAMAR,
  );
  if (!catatan.ok) return catatan;
  return ok({
    id_pelamar: isian(draft, "id_pelamar"),
    id_lowongan,
    nama: nama.nilai,
    no_hp: hp === null ? null : normalizeOperatorPhone(hp),
    email,
    lp,
    tanggal_lahir: lahir,
    alamat: alamat.nilai,
    pendidikan,
    prodi: prodi.nilai,
    sumber: sumber.nilai,
    tanggal_lamaran: lamaran.nilai,
    catatan: catatan.nilai,
  });
}

/** Satu baris `hr_pelamar_tahap` yang dibutuhkan aturan tahap. */
export interface TahapRingkas {
  id_tahap: string;
  urutan: number;
  tahap: string;
  dibatalkan: boolean;
}

function tahapTerakhir(tahap: readonly TahapRingkas[]) {
  let terakhir: TahapRingkas | null = null;
  for (const t of tahap) {
    if (!t.dibatalkan && (terakhir === null || t.urutan > terakhir.urutan))
      terakhir = t;
  }
  return terakhir;
}

/** Cermin `status_pelamar`; kembaran SQL-nya `STATUS_PELAMAR_SQL`. */
export function statusPelamar(tahap: readonly TahapRingkas[]): string {
  return tahapTerakhir(tahap)?.tahap ?? "Lamaran";
}

export interface TahapSah {
  tahap: string;
  tanggal: string;
  catatan: string | null;
}

/** Cermin `periksa_tahap` (Q-135). */
export function periksaTahap(
  draft: Draft,
  kelompok: string,
  status: string,
  tanggalLamaran: string,
  hariIni: string,
): Hasil<TahapSah> {
  const tahap = isian(draft, "tahap");
  if (
    !tahap ||
    !([...TAHAP_PROSES, ...TAHAP_AKHIR] as readonly string[]).includes(tahap)
  )
    return gagal("Tahap tidak dikenal.");
  if ((TAHAP_AKHIR as readonly string[]).includes(status))
    return gagal(PESAN_TAHAP_AKHIR);
  if (tahap === "Microteaching" && kelompok !== "Guru")
    return gagal("Microteaching hanya untuk lowongan Guru.");
  const tanggal = tanggalWajib(draft, "tanggal", "Tanggal tahap tidak valid.");
  if (!tanggal.ok) return tanggal;
  if (tanggal.nilai > hariIni)
    return gagal("Tanggal tahap tidak boleh di masa depan.");
  if (tanggal.nilai < tanggalLamaran)
    return gagal("Tanggal tahap tidak boleh sebelum tanggal lamaran.");
  const catatan = teksOpsional(
    draft,
    "catatan",
    "Catatan tahap",
    MAKS_CATATAN_TAHAP,
  );
  if (!catatan.ok) return catatan;
  if (catatan.nilai === null && (tahap === "Ditolak" || tahap === "Mundur"))
    return gagal("Catatan wajib diisi untuk Ditolak dan Mundur.");
  return ok({ tahap, tanggal: tanggal.nilai, catatan: catatan.nilai });
}

/** Cermin `periksa_batal_tahap`. */
export function periksaBatalTahap(
  tahap: readonly TahapRingkas[],
  idTahap: string,
  dijadikan: boolean,
): Hasil<null> {
  if (dijadikan) return gagal(PESAN_PELAMAR_TERKUNCI);
  const terakhir = tahapTerakhir(tahap);
  if (terakhir && terakhir.id_tahap !== idTahap)
    return gagal("Hanya tahap terakhir yang bisa dibatalkan.");
  if (terakhir && terakhir.urutan > 1) return ok(null);
  return gagal("Tahap Lamaran pertama tidak bisa dibatalkan.");
}

export interface IdPersonil {
  id_unik: string;
  kode_karyawan: string;
  id_kontrak: string;
}

/**
 * Cermin `id_dari_pelamar` (§25.2.3). Guru = `ptk_<hex>` dengan kode kosong;
 * Tendik = bentuk `createEmployeeIdentifiers(hex)`.
 */
export function idDariPelamar(
  idPelamar: string,
  kelompok: string,
): Hasil<IdPersonil> {
  const hex = idPelamar.startsWith("plm-") ? idPelamar.slice(4) : "";
  if (!/^[0-9a-f]{32}$/.test(hex)) return gagal("Id pelamar tidak dikenal.");
  const besar = hex.toUpperCase();
  if (kelompok === "Guru")
    return ok({
      id_unik: `ptk_${hex}`,
      kode_karyawan: "",
      id_kontrak: `kon-${hex}`,
    });
  if (kelompok === "Tendik")
    return ok({
      id_unik: `EMP_${besar.slice(0, 12)}`,
      kode_karyawan: `K${besar.slice(24)}`,
      id_kontrak: `kon-${hex}`,
    });
  return gagal("Kelompok lowongan wajib Guru atau Tendik.");
}

/** Cermin `id_pelamar_baru`: `plm-` + 32 hex. */
export function idPelamarBaru(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return `plm-${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

// SQL kembar (§25.3), salinan harfiah `hr_rekrutmen.rs`.

export const TUTUP_EFEKTIF_SQL =
  "CASE WHEN l.ditutup_pada IS NULL THEN CASE WHEN l.tanggal_tutup < date('now', '+7 hours') THEN l.tanggal_tutup END WHEN l.tanggal_tutup < date('now', '+7 hours') THEN min(l.tanggal_tutup, date(l.ditutup_pada, '+7 hours')) ELSE date(l.ditutup_pada, '+7 hours') END";
export const STATUS_PELAMAR_SQL =
  "COALESCE((SELECT t.tahap FROM hr_pelamar_tahap t WHERE t.id_pelamar = p.id_pelamar AND t.dibatalkan_pada IS NULL ORDER BY t.urutan DESC LIMIT 1), 'Lamaran')";
export const LOWONGAN_SQL =
  "SELECT l.id_lowongan, l.judul, l.kelompok, COALESCE(l.unit, '') AS unit, COALESCE(l.id_bagian, '') AS id_bagian, COALESCE(b.nama, '') AS bagian, COALESCE(l.id_jabatan, '') AS id_jabatan, COALESCE(j.nama, '') AS jabatan, l.jumlah, l.tanggal_buka, COALESCE(l.tanggal_tutup, '') AS tanggal_tutup, COALESCE(l.keterangan, '') AS keterangan, COALESCE(l.ditutup_pada, '') AS ditutup_pada, COALESCE(l.ditutup_oleh, '') AS ditutup_oleh, l.pelamar_dihapus, l.dicatat_oleh, l.created_at, COALESCE(l.diubah_oleh, '') AS diubah_oleh, COALESCE(l.diubah_pada, '') AS diubah_pada, COALESCE(CASE WHEN l.ditutup_pada IS NULL THEN CASE WHEN l.tanggal_tutup < date('now', '+7 hours') THEN l.tanggal_tutup END WHEN l.tanggal_tutup < date('now', '+7 hours') THEN min(l.tanggal_tutup, date(l.ditutup_pada, '+7 hours')) ELSE date(l.ditutup_pada, '+7 hours') END, '') AS tutup_efektif, COALESCE(date(CASE WHEN l.ditutup_pada IS NULL THEN CASE WHEN l.tanggal_tutup < date('now', '+7 hours') THEN l.tanggal_tutup END WHEN l.tanggal_tutup < date('now', '+7 hours') THEN min(l.tanggal_tutup, date(l.ditutup_pada, '+7 hours')) ELSE date(l.ditutup_pada, '+7 hours') END, '+12 months', '+1 day'), '') AS tanggal_hapus FROM hr_lowongan l LEFT JOIN hr_bagian b ON b.id_bagian = l.id_bagian LEFT JOIN hr_jabatan j ON j.id_jabatan = l.id_jabatan ORDER BY l.tanggal_buka DESC, l.created_at DESC, l.id_lowongan\n-- batas: lowongan sekolah, beberapa per tahun\n;";
export const LOWONGAN_SATU_SQL =
  "SELECT id_lowongan, kelompok, tanggal_buka, COALESCE(tanggal_tutup, '') AS tanggal_tutup, COALESCE(ditutup_pada, '') AS ditutup_pada FROM hr_lowongan WHERE id_lowongan = ?1 LIMIT 1;";
export const HITUNG_PELAMAR_SQL =
  "SELECT p.id_lowongan, COALESCE((SELECT t.tahap FROM hr_pelamar_tahap t WHERE t.id_pelamar = p.id_pelamar AND t.dibatalkan_pada IS NULL ORDER BY t.urutan DESC LIMIT 1), 'Lamaran') AS status, COUNT(*) AS jumlah FROM hr_pelamar p GROUP BY p.id_lowongan, status ORDER BY p.id_lowongan, status\n-- batas: satu baris per lowongan per status, delapan status\n;";
export const PELAMAR_LOWONGAN_RINGKAS_SQL =
  "SELECT COUNT(*) AS jumlah, COALESCE(MIN(tanggal_lamaran), '') AS lamaran_awal FROM hr_pelamar WHERE id_lowongan = ?1;";
export const REFERENSI_LOWONGAN_SQL =
  "SELECT (?1 IS NULL OR EXISTS (SELECT 1 FROM akademik_unit u WHERE u.nama_unit = ?1 AND u.status_aktif = 1)) AS unit_ada, (?2 IS NULL OR EXISTS (SELECT 1 FROM hr_bagian b WHERE b.id_bagian = ?2 AND b.is_aktif = 1)) AS bagian_ada, (?3 IS NULL OR EXISTS (SELECT 1 FROM hr_jabatan j WHERE j.id_jabatan = ?3 AND j.is_aktif = 1)) AS jabatan_ada;";
export const SIMPAN_LOWONGAN_SQL =
  "INSERT INTO hr_lowongan (id_lowongan, judul, kelompok, unit, id_bagian, id_jabatan, jumlah, tanggal_buka, tanggal_tutup, keterangan, dicatat_oleh, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, datetime('now'));";
export const UBAH_LOWONGAN_SQL =
  "UPDATE hr_lowongan SET judul = ?2, kelompok = ?3, unit = ?4, id_bagian = ?5, id_jabatan = ?6, jumlah = ?7, tanggal_buka = ?8, tanggal_tutup = ?9, keterangan = ?10, diubah_oleh = ?11, diubah_pada = datetime('now') WHERE id_lowongan = ?1 AND (kelompok = ?3 OR NOT EXISTS (SELECT 1 FROM hr_pelamar p WHERE p.id_lowongan = ?1)) AND NOT EXISTS (SELECT 1 FROM hr_pelamar p WHERE p.id_lowongan = ?1 AND p.tanggal_lamaran < ?8);";
export const TUTUP_LOWONGAN_SQL =
  "UPDATE hr_lowongan SET ditutup_pada = datetime('now'), ditutup_oleh = ?2 WHERE id_lowongan = ?1 AND ditutup_pada IS NULL;";
export const BUKA_LOWONGAN_SQL =
  "UPDATE hr_lowongan SET ditutup_pada = NULL, ditutup_oleh = NULL, tanggal_tutup = ?2, diubah_oleh = ?3, diubah_pada = datetime('now') WHERE id_lowongan = ?1 AND (ditutup_pada IS NOT NULL OR tanggal_tutup < date('now', '+7 hours'));";
export const PELAMAR_SQL =
  "SELECT p.id_pelamar, p.id_lowongan, l.judul AS judul_lowongan, l.kelompok, p.nama, COALESCE(p.no_hp, '') AS no_hp, COALESCE(p.email, '') AS email, COALESCE(p.lp, '') AS lp, COALESCE(p.tanggal_lahir, '') AS tanggal_lahir, COALESCE(p.alamat, '') AS alamat, COALESCE(p.pendidikan, '') AS pendidikan, COALESCE(p.prodi, '') AS prodi, COALESCE(p.sumber, '') AS sumber, p.tanggal_lamaran, COALESCE(p.catatan, '') AS catatan, COALESCE(p.id_karyawan, '') AS id_karyawan, COALESCE(p.dijadikan_oleh, '') AS dijadikan_oleh, COALESCE(p.dijadikan_pada, '') AS dijadikan_pada, p.dicatat_oleh, p.created_at, COALESCE(p.diubah_oleh, '') AS diubah_oleh, COALESCE(p.diubah_pada, '') AS diubah_pada, COALESCE((SELECT t.tahap FROM hr_pelamar_tahap t WHERE t.id_pelamar = p.id_pelamar AND t.dibatalkan_pada IS NULL ORDER BY t.urutan DESC LIMIT 1), 'Lamaran') AS status, (SELECT COUNT(*) FROM hr_pelamar_berkas b WHERE b.id_pelamar = p.id_pelamar) AS jumlah_berkas, EXISTS (SELECT 1 FROM hr_pelamar g WHERE g.id_lowongan = p.id_lowongan AND g.id_pelamar <> p.id_pelamar AND lower(trim(g.nama)) = lower(trim(p.nama)) AND COALESCE(g.no_hp, '') = COALESCE(p.no_hp, '')) AS mungkin_ganda FROM hr_pelamar p JOIN hr_lowongan l ON l.id_lowongan = p.id_lowongan WHERE p.id_lowongan = ?1 OR p.id_pelamar = ?2 ORDER BY p.tanggal_lamaran, p.created_at, p.id_pelamar\n-- batas: pelamar satu lowongan, dihapus retensi 12 bulan sesudah tutup\n;";
export const TAHAP_SQL =
  "SELECT id_tahap, urutan, tahap, tanggal, COALESCE(catatan, '') AS catatan, oleh, created_at, COALESCE(dibatalkan_oleh, '') AS dibatalkan_oleh, COALESCE(dibatalkan_pada, '') AS dibatalkan_pada, COALESCE(alasan_batal, '') AS alasan_batal FROM hr_pelamar_tahap WHERE id_pelamar = ?1 ORDER BY urutan\n-- batas: tahap satu pelamar\n;";
export const SIMPAN_PELAMAR_SQL =
  "INSERT INTO hr_pelamar (id_pelamar, id_lowongan, nama, no_hp, email, lp, tanggal_lahir, alamat, pendidikan, prodi, sumber, tanggal_lamaran, catatan, dicatat_oleh, created_at) SELECT ?1, l.id_lowongan, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, datetime('now') FROM hr_lowongan l WHERE l.id_lowongan = ?2 AND l.tanggal_buka <= ?12 AND l.tanggal_buka <= date('now', '+7 hours');";
export const LAMARAN_PERTAMA_SQL =
  "INSERT INTO hr_pelamar_tahap (id_tahap, id_pelamar, urutan, tahap, tanggal, oleh, created_at) SELECT p.id_pelamar || ':1', p.id_pelamar, 1, 'Lamaran', p.tanggal_lamaran, ?2, datetime('now') FROM hr_pelamar p WHERE p.id_pelamar = ?1;";
export const UBAH_PELAMAR_SQL =
  "UPDATE hr_pelamar SET nama = ?2, no_hp = ?3, email = ?4, lp = ?5, tanggal_lahir = ?6, alamat = ?7, pendidikan = ?8, prodi = ?9, sumber = ?10, catatan = ?11, diubah_oleh = ?12, diubah_pada = datetime('now') WHERE id_pelamar = ?1 AND id_karyawan IS NULL;";
export const CATAT_TAHAP_SQL =
  "INSERT INTO hr_pelamar_tahap (id_tahap, id_pelamar, urutan, tahap, tanggal, catatan, oleh, created_at) SELECT ?1 || ':' || (COALESCE(MAX(t.urutan), 0) + 1), ?1, COALESCE(MAX(t.urutan), 0) + 1, ?2, ?3, ?4, ?5, datetime('now') FROM hr_pelamar_tahap t WHERE t.id_pelamar = ?1 AND EXISTS (SELECT 1 FROM hr_pelamar p WHERE p.id_pelamar = ?1 AND p.id_karyawan IS NULL) HAVING COALESCE(MAX(t.urutan), 0) = ?6;";
export const BATAL_TAHAP_SQL =
  "UPDATE hr_pelamar_tahap SET dibatalkan_oleh = ?2, dibatalkan_pada = datetime('now'), alasan_batal = ?3 WHERE id_tahap = ?1 AND urutan > 1 AND dibatalkan_pada IS NULL AND urutan = (SELECT MAX(t.urutan) FROM hr_pelamar_tahap t WHERE t.id_pelamar = hr_pelamar_tahap.id_pelamar AND t.dibatalkan_pada IS NULL) AND EXISTS (SELECT 1 FROM hr_pelamar p WHERE p.id_pelamar = hr_pelamar_tahap.id_pelamar AND p.id_karyawan IS NULL);";
export const BERKAS_PELAMAR_SQL =
  "SELECT id_berkas, urutan, COALESCE(nama_berkas, '') AS nama_berkas, mime_type, (length(data_base64) / 4) * 3 - (CASE WHEN data_base64 LIKE '%==' THEN 2 WHEN data_base64 LIKE '%=' THEN 1 ELSE 0 END) AS ukuran_byte, created_at FROM hr_pelamar_berkas WHERE id_pelamar = ?1 ORDER BY urutan\n-- batas: berkas satu pelamar, maksimal 3\n;";
export const AMBIL_BERKAS_PELAMAR_SQL =
  "SELECT id_berkas, id_pelamar, COALESCE(nama_berkas, '') AS nama_berkas, mime_type, data_base64 FROM hr_pelamar_berkas WHERE id_berkas = ?1 LIMIT 1;";
export const TAMBAH_BERKAS_PELAMAR_SQL =
  "WITH slot(n) AS (VALUES (1), (2), (3)) INSERT INTO hr_pelamar_berkas (id_berkas, id_pelamar, urutan, nama_berkas, mime_type, data_base64, created_at) SELECT ?1, ?2, MIN(slot.n), ?3, ?4, ?5, datetime('now') FROM slot WHERE slot.n NOT IN (SELECT urutan FROM hr_pelamar_berkas WHERE id_pelamar = ?2) AND EXISTS (SELECT 1 FROM hr_pelamar WHERE id_pelamar = ?2 AND id_karyawan IS NULL) HAVING MIN(slot.n) IS NOT NULL;";
export const HAPUS_BERKAS_PELAMAR_SQL =
  "DELETE FROM hr_pelamar_berkas WHERE id_berkas = ?1 AND EXISTS (SELECT 1 FROM hr_pelamar p WHERE p.id_pelamar = hr_pelamar_berkas.id_pelamar AND p.id_karyawan IS NULL);";
export const PELAMAR_LAMA_SQL =
  "SELECT p.id_pelamar FROM hr_pelamar p JOIN hr_lowongan l ON l.id_lowongan = p.id_lowongan WHERE p.id_karyawan IS NULL AND date(CASE WHEN l.ditutup_pada IS NULL THEN CASE WHEN l.tanggal_tutup < date('now', '+7 hours') THEN l.tanggal_tutup END WHEN l.tanggal_tutup < date('now', '+7 hours') THEN min(l.tanggal_tutup, date(l.ditutup_pada, '+7 hours')) ELSE date(l.ditutup_pada, '+7 hours') END, '+12 months') < date('now', '+7 hours')";
export const HITUNG_PELAMAR_LAMA_SQL =
  "SELECT COUNT(*) AS jumlah FROM hr_pelamar WHERE id_pelamar IN (SELECT p.id_pelamar FROM hr_pelamar p JOIN hr_lowongan l ON l.id_lowongan = p.id_lowongan WHERE p.id_karyawan IS NULL AND date(CASE WHEN l.ditutup_pada IS NULL THEN CASE WHEN l.tanggal_tutup < date('now', '+7 hours') THEN l.tanggal_tutup END WHEN l.tanggal_tutup < date('now', '+7 hours') THEN min(l.tanggal_tutup, date(l.ditutup_pada, '+7 hours')) ELSE date(l.ditutup_pada, '+7 hours') END, '+12 months') < date('now', '+7 hours'));";
export const HAPUS_PELAMAR_LAMA_SQL = [
  "UPDATE hr_lowongan SET pelamar_dihapus = pelamar_dihapus + (SELECT COUNT(*) FROM hr_pelamar x WHERE x.id_lowongan = hr_lowongan.id_lowongan AND x.id_pelamar IN (SELECT p.id_pelamar FROM hr_pelamar p JOIN hr_lowongan l ON l.id_lowongan = p.id_lowongan WHERE p.id_karyawan IS NULL AND date(CASE WHEN l.ditutup_pada IS NULL THEN CASE WHEN l.tanggal_tutup < date('now', '+7 hours') THEN l.tanggal_tutup END WHEN l.tanggal_tutup < date('now', '+7 hours') THEN min(l.tanggal_tutup, date(l.ditutup_pada, '+7 hours')) ELSE date(l.ditutup_pada, '+7 hours') END, '+12 months') < date('now', '+7 hours'))) WHERE EXISTS (SELECT 1 FROM hr_pelamar x WHERE x.id_lowongan = hr_lowongan.id_lowongan AND x.id_pelamar IN (SELECT p.id_pelamar FROM hr_pelamar p JOIN hr_lowongan l ON l.id_lowongan = p.id_lowongan WHERE p.id_karyawan IS NULL AND date(CASE WHEN l.ditutup_pada IS NULL THEN CASE WHEN l.tanggal_tutup < date('now', '+7 hours') THEN l.tanggal_tutup END WHEN l.tanggal_tutup < date('now', '+7 hours') THEN min(l.tanggal_tutup, date(l.ditutup_pada, '+7 hours')) ELSE date(l.ditutup_pada, '+7 hours') END, '+12 months') < date('now', '+7 hours')));",
  "DELETE FROM hr_pelamar_berkas WHERE id_pelamar IN (SELECT p.id_pelamar FROM hr_pelamar p JOIN hr_lowongan l ON l.id_lowongan = p.id_lowongan WHERE p.id_karyawan IS NULL AND date(CASE WHEN l.ditutup_pada IS NULL THEN CASE WHEN l.tanggal_tutup < date('now', '+7 hours') THEN l.tanggal_tutup END WHEN l.tanggal_tutup < date('now', '+7 hours') THEN min(l.tanggal_tutup, date(l.ditutup_pada, '+7 hours')) ELSE date(l.ditutup_pada, '+7 hours') END, '+12 months') < date('now', '+7 hours'));",
  "DELETE FROM hr_pelamar_tahap WHERE id_pelamar IN (SELECT p.id_pelamar FROM hr_pelamar p JOIN hr_lowongan l ON l.id_lowongan = p.id_lowongan WHERE p.id_karyawan IS NULL AND date(CASE WHEN l.ditutup_pada IS NULL THEN CASE WHEN l.tanggal_tutup < date('now', '+7 hours') THEN l.tanggal_tutup END WHEN l.tanggal_tutup < date('now', '+7 hours') THEN min(l.tanggal_tutup, date(l.ditutup_pada, '+7 hours')) ELSE date(l.ditutup_pada, '+7 hours') END, '+12 months') < date('now', '+7 hours'));",
  "DELETE FROM hr_pelamar WHERE id_pelamar IN (SELECT p.id_pelamar FROM hr_pelamar p JOIN hr_lowongan l ON l.id_lowongan = p.id_lowongan WHERE p.id_karyawan IS NULL AND date(CASE WHEN l.ditutup_pada IS NULL THEN CASE WHEN l.tanggal_tutup < date('now', '+7 hours') THEN l.tanggal_tutup END WHEN l.tanggal_tutup < date('now', '+7 hours') THEN min(l.tanggal_tutup, date(l.ditutup_pada, '+7 hours')) ELSE date(l.ditutup_pada, '+7 hours') END, '+12 months') < date('now', '+7 hours'));",
] as const;
export const HAPUS_PELAMAR_SQL = [
  "UPDATE hr_lowongan SET pelamar_dihapus = pelamar_dihapus + 1 WHERE id_lowongan = (SELECT p.id_lowongan FROM hr_pelamar p WHERE p.id_pelamar = ?1 AND p.id_karyawan IS NULL);",
  "DELETE FROM hr_pelamar_berkas WHERE id_pelamar = (SELECT p.id_pelamar FROM hr_pelamar p WHERE p.id_pelamar = ?1 AND p.id_karyawan IS NULL);",
  "DELETE FROM hr_pelamar_tahap WHERE id_pelamar = (SELECT p.id_pelamar FROM hr_pelamar p WHERE p.id_pelamar = ?1 AND p.id_karyawan IS NULL);",
  "DELETE FROM hr_pelamar WHERE id_pelamar = ?1 AND id_karyawan IS NULL;",
] as const;

// Bentuk rute dan command

const teksBebas = (maks: number) => z.string().max(maks).default("");
const id = z.string().min(1).max(80);

/** Body `vacancies/save`, cermin `draft` `desktop_hr_vacancy_save`. */
export const lowonganDraftSchema = z
  .object({
    aksi: z.enum(["simpan", "tutup", "buka"]).default("simpan"),
    id_lowongan: teksBebas(80),
    judul: teksBebas(MAKS_JUDUL + 100),
    kelompok: teksBebas(20),
    unit: teksBebas(MAKS_UNIT + 20),
    id_bagian: teksBebas(80),
    id_jabatan: teksBebas(80),
    jumlah: z.number().nullable().default(null),
    tanggal_buka: teksBebas(20),
    tanggal_tutup: teksBebas(20),
    keterangan: teksBebas(MAKS_KETERANGAN + 100),
  })
  .strict();
export type LowonganDraft = z.input<typeof lowonganDraftSchema>;

export const pelamarQuerySchema = z
  .object({ id_lowongan: teksBebas(80), id_pelamar: teksBebas(80) })
  .strict();

export const pelamarDraftSchema = z
  .object({
    id_pelamar: teksBebas(80),
    id_lowongan: id,
    nama: teksBebas(MAKS_NAMA_PELAMAR + 100),
    no_hp: teksBebas(40),
    email: teksBebas(200),
    lp: teksBebas(5),
    tanggal_lahir: teksBebas(20),
    alamat: teksBebas(MAKS_ALAMAT_PELAMAR + 100),
    pendidikan: teksBebas(20),
    prodi: teksBebas(MAKS_TEKS_PELAMAR + 100),
    sumber: teksBebas(MAKS_TEKS_PELAMAR + 100),
    tanggal_lamaran: teksBebas(20),
    catatan: teksBebas(MAKS_CATATAN_PELAMAR + 100),
  })
  .strict();
export type PelamarDraft = z.input<typeof pelamarDraftSchema>;

export const tahapDraftSchema = z
  .object({
    aksi: z.enum(["catat", "batal"]).default("catat"),
    id_pelamar: id,
    tahap: teksBebas(40),
    tanggal: teksBebas(20),
    catatan: teksBebas(MAKS_CATATAN_TAHAP + 100),
    id_tahap: teksBebas(120),
    alasan: teksBebas(MAKS_CATATAN_TAHAP + 100),
  })
  .strict();
export type TahapDraft = z.input<typeof tahapDraftSchema>;

export const berkasPelamarSchema = z
  .object({
    id_pelamar: id,
    nama_berkas: z.string().max(400),
    mime_type: z.string().max(40),
    data_base64: z
      .string()
      .max(MAKS_BASE64_DOKUMEN + 8, "Berkas lebih dari 1 MB."),
  })
  .strict();
export type BerkasPelamarDraft = z.input<typeof berkasPelamarSchema>;

export const idRekrutmenSchema = z.object({ id }).strict();
export const kosongSchema = z.object({}).strict();

// Bentuk hasil

export interface LowonganBaris {
  id_lowongan: string;
  judul: string;
  kelompok: KelompokLowongan;
  unit: string;
  id_bagian: string;
  bagian: string;
  id_jabatan: string;
  jabatan: string;
  jumlah: number;
  tanggal_buka: string;
  tanggal_tutup: string;
  keterangan: string;
  ditutup_pada: string;
  ditutup_oleh: string;
  pelamar_dihapus: number;
  dicatat_oleh: string;
  created_at: string;
  diubah_oleh: string;
  diubah_pada: string;
  tutup_efektif: string;
  tanggal_hapus: string;
  status: StatusLowongan;
  pelamar: number;
  per_status: Record<string, number>;
  lewat_kuota: boolean;
}

export interface DaftarLowongan {
  hari_ini: string;
  lowongan: LowonganBaris[];
}

export interface PelamarBaris {
  id_pelamar: string;
  id_lowongan: string;
  judul_lowongan: string;
  kelompok: KelompokLowongan;
  nama: string;
  no_hp: string;
  email: string;
  lp: string;
  tanggal_lahir: string;
  alamat: string;
  pendidikan: string;
  prodi: string;
  sumber: string;
  tanggal_lamaran: string;
  catatan: string;
  id_karyawan: string;
  dijadikan_oleh: string;
  dijadikan_pada: string;
  dicatat_oleh: string;
  created_at: string;
  diubah_oleh: string;
  diubah_pada: string;
  status: TahapPelamar;
  jumlah_berkas: number;
  mungkin_ganda: boolean;
}

export interface TahapBaris {
  id_tahap: string;
  urutan: number;
  tahap: TahapPelamar;
  tanggal: string;
  catatan: string;
  oleh: string;
  created_at: string;
  dibatalkan_oleh: string;
  dibatalkan_pada: string;
  alasan_batal: string;
}

export interface BerkasPelamarBaris {
  id_berkas: string;
  urutan: number;
  nama_berkas: string;
  mime_type: string;
  ukuran_byte: number;
  created_at: string;
}

export interface IsiBerkasPelamar {
  id_berkas: string;
  id_pelamar: string;
  nama_berkas: string;
  mime_type: string;
  data_base64: string;
}

export interface RincianPelamar {
  pelamar: PelamarBaris;
  tahap: TahapBaris[];
  berkas: BerkasPelamarBaris[];
}
