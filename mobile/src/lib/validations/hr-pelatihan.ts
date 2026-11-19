/**
 * HRIS Fase 7b (`prd-hris/fase-7.md` §25.2.5–§25.2.6): pelatihan, peserta,
 * sertifikat, dan rekap jam pelatihan per pegawai per tahun.
 *
 * Cermin `desktop/hr_pelatihan.rs`, diuji dengan vektor yang sama
 * (`hr-pelatihan.vektor.json`); teks SQL dibandingkan harfiah oleh
 * `hr-pelatihan.test.ts`. Kedua tabel pelatihan KHUSUS CLOUD (Q-131).
 */
import { z } from "zod";
import { tanggalValid } from "./hari-kerja";
import { MAKS_BASE64_DOKUMEN } from "./hris";

// Aturan murni (§25.2.5–§25.2.6)

/** WAJIB sama dengan CHECK `hr_pelatihan.jenis_penyelenggara`. */
export const JENIS_PENYELENGGARA = [
  "KKG",
  "MGMP",
  "Dinas",
  "Internal",
  "Lainnya",
] as const;
export type JenisPenyelenggara = (typeof JENIS_PENYELENGGARA)[number];
/** WAJIB sama dengan CHECK `hr_pelatihan_peserta.hasil`. */
export const HASIL_PESERTA = ["Lulus", "Tidak Lulus", "Tidak Hadir"] as const;
export const MAKS_NAMA_PELATIHAN = 150;
export const MAKS_PENYELENGGARA = 100;
export const MAKS_LOKASI = 100;
export const MAKS_KETERANGAN_PELATIHAN = 2000;
export const MAKS_CATATAN_PESERTA = 1000;
export const MAKS_JAM_PELATIHAN = 1000;
export const MAKS_BIAYA_PELATIHAN = 1_000_000_000;
/** Jenis dokumen bawaan sertifikat; boleh diganti jenis aktif lain (Q-147). */
export const JENIS_SERTIFIKAT_BAWAAN = "dok-pelatihan";

export const PESAN_PELATIHAN_TIDAK_ADA = "Pelatihan tidak ditemukan.";
export const PESAN_PELATIHAN_DIBATALKAN = "Pelatihan ini sudah dibatalkan.";
export const PESAN_PESERTA_TIDAK_ADA = "Peserta tidak ditemukan.";
export const PESAN_PESERTA_GANDA =
  "Pegawai ini sudah menjadi peserta pelatihan ini.";
export const PESAN_PESERTA_DITOLAK =
  "Hanya pegawai aktif yang belum keluar yang bisa ditambahkan, dan pelatihannya tidak dibatalkan.";
export const PESAN_LEPAS_BERSERTIFIKAT =
  "Peserta ini sudah punya sertifikat. Hapus sertifikatnya dulu.";
export const PESAN_BELUM_BERSERTIFIKAT = "Peserta ini belum punya sertifikat.";
export const PESAN_JENIS_NONAKTIF =
  "Jenis dokumen tidak ditemukan atau tidak aktif.";
export const PESAN_SERTIFIKAT_DITOLAK =
  "Sertifikat tidak tersimpan: peserta sudah punya sertifikat lain, pegawainya belum ada di database pusat, atau jenis dokumennya tidak dikenal.";

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

function bulat(
  draft: Draft,
  kunci: string,
  bawaan: number | null,
  min: number,
  maks: number,
): number | null {
  const n = draft[kunci];
  if (n === undefined || n === null) return bawaan;
  return typeof n === "number" && Number.isInteger(n) && n >= min && n <= maks
    ? n
    : null;
}

export interface PelatihanSah {
  id_pelatihan: string | null;
  nama: string;
  jenis_penyelenggara: JenisPenyelenggara;
  penyelenggara: string | null;
  tanggal_mulai: string;
  tanggal_selesai: string;
  lokasi: string | null;
  jumlah_jam: number;
  biaya: number;
  keterangan: string | null;
}

/** Cermin `validasi_pelatihan`. Biaya kosong = 0 (Q-146). */
export function validasiPelatihan(draft: Draft): Hasil<PelatihanSah> {
  const nama = teksOpsional(
    draft,
    "nama",
    "Nama pelatihan",
    MAKS_NAMA_PELATIHAN,
  );
  if (!nama.ok) return nama;
  if (nama.nilai === null) return gagal("Nama pelatihan wajib diisi.");
  const jenis = isian(draft, "jenis_penyelenggara");
  if (!jenis || !(JENIS_PENYELENGGARA as readonly string[]).includes(jenis))
    return gagal(
      "Jenis penyelenggara wajib KKG, MGMP, Dinas, Internal, atau Lainnya.",
    );
  const penyelenggara = teksOpsional(
    draft,
    "penyelenggara",
    "Penyelenggara",
    MAKS_PENYELENGGARA,
  );
  if (!penyelenggara.ok) return penyelenggara;
  const mulai = isian(draft, "tanggal_mulai");
  if (!mulai || !tanggalValid(mulai))
    return gagal("Tanggal mulai tidak valid.");
  const selesai = isian(draft, "tanggal_selesai");
  if (!selesai || !tanggalValid(selesai))
    return gagal("Tanggal selesai tidak valid.");
  if (selesai < mulai)
    return gagal("Tanggal selesai tidak boleh sebelum tanggal mulai.");
  const lokasi = teksOpsional(draft, "lokasi", "Lokasi", MAKS_LOKASI);
  if (!lokasi.ok) return lokasi;
  const jam = bulat(draft, "jumlah_jam", null, 1, MAKS_JAM_PELATIHAN);
  if (jam === null)
    return gagal("Jumlah jam harus bilangan bulat 1 sampai 1000.");
  const biaya = bulat(draft, "biaya", 0, 0, MAKS_BIAYA_PELATIHAN);
  if (biaya === null)
    return gagal("Biaya harus bilangan bulat 0 sampai 1000000000.");
  const keterangan = teksOpsional(
    draft,
    "keterangan",
    "Keterangan",
    MAKS_KETERANGAN_PELATIHAN,
  );
  if (!keterangan.ok) return keterangan;
  return ok({
    id_pelatihan: isian(draft, "id_pelatihan"),
    nama: nama.nilai,
    jenis_penyelenggara: jenis as JenisPenyelenggara,
    penyelenggara: penyelenggara.nilai,
    tanggal_mulai: mulai,
    tanggal_selesai: selesai,
    lokasi: lokasi.nilai,
    jumlah_jam: jam,
    biaya,
    keterangan: keterangan.nilai,
  });
}

export type StatusPelatihan =
  | "Dibatalkan"
  | "Dijadwalkan"
  | "Selesai"
  | "Berlangsung";

/** Cermin `status_pelatihan`. Tidak disimpan. */
export function statusPelatihan(
  tanggalMulai: string,
  tanggalSelesai: string,
  dibatalkan: boolean,
  hariIni: string,
): StatusPelatihan {
  if (dibatalkan) return "Dibatalkan";
  if (tanggalMulai > hariIni) return "Dijadwalkan";
  if (tanggalSelesai < hariIni) return "Selesai";
  return "Berlangsung";
}

export interface HasilPesertaSah {
  hasil: string | null;
  catatan: string | null;
}

/** Cermin `validasi_hasil_peserta`. */
export function validasiHasilPeserta(draft: Draft): Hasil<HasilPesertaSah> {
  const hasil = isian(draft, "hasil");
  if (hasil && !(HASIL_PESERTA as readonly string[]).includes(hasil))
    return gagal("Hasil peserta harus Lulus, Tidak Lulus, atau Tidak Hadir.");
  const catatan = teksOpsional(
    draft,
    "catatan",
    "Catatan peserta",
    MAKS_CATATAN_PESERTA,
  );
  if (!catatan.ok) return catatan;
  return ok({ hasil, catatan: catatan.nilai });
}

/** Satu baris `REKAP_PELATIHAN_SQL`. */
export interface BarisRekap {
  id_karyawan: string;
  nama: string;
  unit: string;
  kelompok: string;
  tanggal_selesai: string;
  jenis_penyelenggara: string;
  jumlah_jam: number;
  hasil: string;
  dibatalkan: boolean;
}

export interface RekapPegawai {
  id_karyawan: string;
  nama: string;
  unit: string;
  kelompok: string;
  tahun: string;
  jumlah_pelatihan: number;
  total_jam: number;
  jam_per_jenis: Record<string, number>;
}

/** Cermin `rekap_pelatihan` (§25.2.6, Q-145). */
export function rekapPelatihan(
  daftar: readonly BarisRekap[],
  hariIni: string,
): RekapPegawai[] {
  const hasil: RekapPegawai[] = [];
  for (const b of daftar) {
    if (
      b.dibatalkan ||
      b.tanggal_selesai > hariIni ||
      b.hasil === "Tidak Hadir"
    )
      continue;
    const tahun = b.tanggal_selesai.slice(0, 4);
    let r = hasil.find(
      (x) => x.id_karyawan === b.id_karyawan && x.tahun === tahun,
    );
    if (!r) {
      r = {
        id_karyawan: b.id_karyawan,
        nama: b.nama,
        unit: b.unit,
        kelompok: b.kelompok,
        tahun,
        jumlah_pelatihan: 0,
        total_jam: 0,
        jam_per_jenis: Object.fromEntries(
          JENIS_PENYELENGGARA.map((j) => [j, 0]),
        ),
      };
      hasil.push(r);
    }
    r.jumlah_pelatihan += 1;
    r.total_jam += b.jumlah_jam;
    r.jam_per_jenis[b.jenis_penyelenggara] =
      (r.jam_per_jenis[b.jenis_penyelenggara] ?? 0) + b.jumlah_jam;
  }
  return hasil;
}

// SQL kembar (§25.3), salinan harfiah `hr_pelatihan.rs`.

export const PELATIHAN_SQL =
  "SELECT p.id_pelatihan, p.nama, p.jenis_penyelenggara, COALESCE(p.penyelenggara, '') AS penyelenggara, p.tanggal_mulai, p.tanggal_selesai, COALESCE(p.lokasi, '') AS lokasi, p.jumlah_jam, p.biaya, COALESCE(p.keterangan, '') AS keterangan, p.dicatat_oleh, p.created_at, COALESCE(p.diubah_oleh, '') AS diubah_oleh, COALESCE(p.diubah_pada, '') AS diubah_pada, COALESCE(p.dibatalkan_oleh, '') AS dibatalkan_oleh, COALESCE(p.dibatalkan_pada, '') AS dibatalkan_pada, COALESCE(p.alasan_batal, '') AS alasan_batal, (SELECT COUNT(*) FROM hr_pelatihan_peserta ps WHERE ps.id_pelatihan = p.id_pelatihan) AS jumlah_peserta FROM hr_pelatihan p WHERE substr(p.tanggal_mulai, 1, 4) = ?1 OR substr(p.tanggal_selesai, 1, 4) = ?1 OR p.id_pelatihan = ?2 ORDER BY p.tanggal_mulai DESC, p.created_at DESC, p.id_pelatihan\n-- batas: pelatihan satu tahun, beberapa per bulan\n;";
export const SIMPAN_PELATIHAN_SQL =
  "INSERT INTO hr_pelatihan (id_pelatihan, nama, jenis_penyelenggara, penyelenggara, tanggal_mulai, tanggal_selesai, lokasi, jumlah_jam, biaya, keterangan, dicatat_oleh, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, datetime('now'));";
export const UBAH_PELATIHAN_SQL =
  "UPDATE hr_pelatihan SET nama = ?2, jenis_penyelenggara = ?3, penyelenggara = ?4, tanggal_mulai = ?5, tanggal_selesai = ?6, lokasi = ?7, jumlah_jam = ?8, biaya = ?9, keterangan = ?10, diubah_oleh = ?11, diubah_pada = datetime('now') WHERE id_pelatihan = ?1 AND dibatalkan_pada IS NULL;";
export const BATAL_PELATIHAN_SQL =
  "UPDATE hr_pelatihan SET dibatalkan_oleh = ?2, dibatalkan_pada = datetime('now'), alasan_batal = ?3 WHERE id_pelatihan = ?1 AND dibatalkan_pada IS NULL;";
export const PESERTA_SQL =
  "SELECT ps.id_peserta, ps.id_pelatihan, p.nama AS nama_pelatihan, p.jenis_penyelenggara, p.tanggal_mulai, p.tanggal_selesai, p.jumlah_jam, COALESCE(p.dibatalkan_pada, '') AS dibatalkan_pada, ps.id_karyawan, COALESCE(m.nama, ps.id_karyawan) AS nama, COALESCE(m.unit, '') AS unit, COALESCE(ps.hasil, '') AS hasil, COALESCE(ps.catatan, '') AS catatan, COALESCE(ps.id_dokumen, '') AS id_dokumen, COALESCE(d.id_jenis, '') AS id_jenis, COALESCE(j.nama, d.id_jenis, '') AS jenis_dokumen, COALESCE(d.nomor, '') AS nomor, COALESCE(d.tanggal_terbit, '') AS tanggal_terbit, COALESCE(d.tanggal_kedaluwarsa, '') AS tanggal_kedaluwarsa, COALESCE(d.catatan, '') AS catatan_dokumen, ps.dicatat_oleh, ps.created_at FROM hr_pelatihan_peserta ps JOIN hr_pelatihan p ON p.id_pelatihan = ps.id_pelatihan LEFT JOIN master_data m ON m.id_unik = ps.id_karyawan LEFT JOIN hr_dokumen d ON d.id_dokumen = ps.id_dokumen LEFT JOIN hr_dokumen_jenis j ON j.id_jenis = d.id_jenis WHERE ps.id_pelatihan = ?1 OR ps.id_karyawan = ?2 OR ps.id_peserta = ?3 ORDER BY p.tanggal_mulai DESC, COALESCE(m.nama, ps.id_karyawan), ps.id_peserta\n-- batas: peserta satu pelatihan, atau riwayat pelatihan satu pegawai\n;";
export const BERKAS_SERTIFIKAT_SQL =
  "SELECT b.id_berkas, b.id_dokumen, b.urutan, COALESCE(b.nama_berkas, '') AS nama_berkas, b.mime_type, (length(b.data_base64) / 4) * 3 - (CASE WHEN b.data_base64 LIKE '%==' THEN 2 WHEN b.data_base64 LIKE '%=' THEN 1 ELSE 0 END) AS ukuran_byte FROM hr_dokumen_berkas b JOIN hr_pelatihan_peserta ps ON ps.id_dokumen = b.id_dokumen WHERE ps.id_pelatihan = ?1 OR ps.id_karyawan = ?2 ORDER BY b.id_dokumen, b.urutan\n-- batas: berkas sertifikat satu pelatihan atau satu pegawai, maksimal 5 per sertifikat\n;";
export const TAMBAH_PESERTA_SQL =
  "INSERT OR IGNORE INTO hr_pelatihan_peserta (id_peserta, id_pelatihan, id_karyawan, dicatat_oleh, created_at) SELECT ?1 || ':' || m.id_unik, ?1, m.id_unik, ?3, datetime('now') FROM master_data m WHERE m.id_unik = ?2 AND LOWER(TRIM(COALESCE(m.jenis_personil, ''))) <> 'siswa' AND NOT EXISTS (SELECT 1 FROM siswa_data sd WHERE sd.id_siswa = m.id_unik) AND m.status_aktif = 'Aktif' AND COALESCE(m.id_keluar, '') = '' AND EXISTS (SELECT 1 FROM hr_pelatihan p WHERE p.id_pelatihan = ?1 AND p.dibatalkan_pada IS NULL);";
export const HASIL_PESERTA_SQL =
  "UPDATE hr_pelatihan_peserta SET hasil = ?2, catatan = ?3 WHERE id_peserta = ?1;";
export const LEPAS_PESERTA_SQL =
  "DELETE FROM hr_pelatihan_peserta WHERE id_peserta = ?1 AND id_dokumen IS NULL;";
export const JENIS_AKTIF_SQL =
  "SELECT 1 AS ada FROM hr_dokumen_jenis WHERE id_jenis = ?1 AND is_aktif = 1 LIMIT 1;";
export const TAUT_SERTIFIKAT_SQL =
  "UPDATE hr_pelatihan_peserta SET id_dokumen = ?1 WHERE id_peserta = ?2 AND (id_dokumen IS NULL OR id_dokumen = ?1) AND EXISTS (SELECT 1 FROM hr_dokumen d WHERE d.id_dokumen = ?1 AND d.id_karyawan = hr_pelatihan_peserta.id_karyawan);";
export const BUANG_SERTIFIKAT_LEPAS_SQL =
  "DELETE FROM hr_dokumen WHERE id_dokumen = ?1 AND NOT EXISTS (SELECT 1 FROM hr_pelatihan_peserta ps WHERE ps.id_dokumen = ?1);";
export const AMBIL_BERKAS_SERTIFIKAT_SQL =
  "SELECT b.id_berkas, b.id_dokumen, COALESCE(b.nama_berkas, '') AS nama_berkas, b.mime_type, b.data_base64 FROM hr_dokumen_berkas b WHERE b.id_berkas = ?1 AND EXISTS (SELECT 1 FROM hr_pelatihan_peserta ps WHERE ps.id_dokumen = b.id_dokumen) LIMIT 1;";
export const HAPUS_BERKAS_SERTIFIKAT_SQL =
  "DELETE FROM hr_dokumen_berkas WHERE id_berkas = ?1 AND id_dokumen = (SELECT ps.id_dokumen FROM hr_pelatihan_peserta ps WHERE ps.id_peserta = ?2);";
export const REKAP_PELATIHAN_SQL =
  "SELECT ps.id_karyawan, COALESCE(m.nama, ps.id_karyawan) AS nama, COALESCE(m.unit, '') AS unit, CASE WHEN g.id_guru IS NOT NULL OR LOWER(TRIM(COALESCE(m.jenis_personil, ''))) = 'guru' THEN 'Guru' ELSE 'Tendik' END AS kelompok, p.tanggal_selesai, p.jenis_penyelenggara, p.jumlah_jam, COALESCE(ps.hasil, '') AS hasil, p.dibatalkan_pada IS NOT NULL AS dibatalkan FROM hr_pelatihan_peserta ps JOIN hr_pelatihan p ON p.id_pelatihan = ps.id_pelatihan LEFT JOIN master_data m ON m.id_unik = ps.id_karyawan LEFT JOIN guru_data g ON g.id_guru = ps.id_karyawan WHERE substr(p.tanggal_selesai, 1, 4) = ?1 AND (?2 = '' OR CASE WHEN g.id_guru IS NOT NULL OR LOWER(TRIM(COALESCE(m.jenis_personil, ''))) = 'guru' THEN 'Guru' ELSE 'Tendik' END = ?2) AND (?3 = '' OR COALESCE(m.unit, '') = ?3) ORDER BY COALESCE(m.nama, ps.id_karyawan), ps.id_karyawan, p.tanggal_selesai\n-- batas: keikutsertaan pelatihan satu tahun, beberapa per pegawai\n;";

// Bentuk rute dan command

const teksBebas = (maks: number) => z.string().max(maks).default("");
const id = z.string().min(1).max(200);

/** Body `training/query`, cermin `query` `desktop_hr_trainings`. */
export const pelatihanQuerySchema = z
  .object({
    mode: z.enum(["daftar", "rincian", "riwayat", "rekap"]).default("daftar"),
    tahun: teksBebas(4),
    id_pelatihan: teksBebas(80),
    id_karyawan: teksBebas(80),
    kelompok: z.enum(["", "Guru", "Tendik"]).default(""),
    unit: teksBebas(120),
  })
  .strict();
export type PelatihanQuery = z.input<typeof pelatihanQuerySchema>;

/** Body `training/save`, cermin `draft` `desktop_hr_training_save`. */
export const pelatihanDraftSchema = z
  .object({
    aksi: z.enum(["simpan", "batal"]).default("simpan"),
    id_pelatihan: teksBebas(80),
    nama: teksBebas(MAKS_NAMA_PELATIHAN + 100),
    jenis_penyelenggara: teksBebas(20),
    penyelenggara: teksBebas(MAKS_PENYELENGGARA + 100),
    tanggal_mulai: teksBebas(20),
    tanggal_selesai: teksBebas(20),
    lokasi: teksBebas(MAKS_LOKASI + 100),
    jumlah_jam: z.number().nullable().default(null),
    biaya: z.number().nullable().default(null),
    keterangan: teksBebas(MAKS_KETERANGAN_PELATIHAN + 100),
    alasan: teksBebas(MAKS_CATATAN_PESERTA + 100),
  })
  .strict();
export type PelatihanDraft = z.input<typeof pelatihanDraftSchema>;

/** Body `training/participants`. */
export const pesertaDraftSchema = z
  .object({
    aksi: z.enum(["tambah", "lepas", "hasil"]).default("tambah"),
    id_pelatihan: teksBebas(80),
    id_karyawan: teksBebas(80),
    id_peserta: teksBebas(200),
    hasil: teksBebas(20),
    catatan: teksBebas(MAKS_CATATAN_PESERTA + 100),
  })
  .strict();
export type PesertaDraft = z.input<typeof pesertaDraftSchema>;

/** Body `training/certificate`; berkas hanya untuk `berkas_tambah`. */
export const sertifikatDraftSchema = z
  .object({
    aksi: z
      .enum(["simpan", "hapus", "berkas_tambah", "berkas_hapus"])
      .default("simpan"),
    id_peserta: id,
    id_jenis: teksBebas(80),
    nomor: teksBebas(200),
    tanggal_terbit: teksBebas(20),
    tanggal_kedaluwarsa: teksBebas(20),
    catatan: teksBebas(1000),
    id_berkas: teksBebas(80),
    nama_berkas: teksBebas(400),
    mime_type: teksBebas(40),
    data_base64: z
      .string()
      .max(MAKS_BASE64_DOKUMEN + 8, "Berkas lebih dari 1 MB.")
      .default(""),
  })
  .strict();
export type SertifikatDraft = z.input<typeof sertifikatDraftSchema>;

export const idBerkasSertifikatSchema = z.object({ id }).strict();

// Bentuk hasil

export interface PelatihanBaris {
  id_pelatihan: string;
  nama: string;
  jenis_penyelenggara: JenisPenyelenggara;
  penyelenggara: string;
  tanggal_mulai: string;
  tanggal_selesai: string;
  lokasi: string;
  jumlah_jam: number;
  biaya: number;
  keterangan: string;
  dicatat_oleh: string;
  created_at: string;
  diubah_oleh: string;
  diubah_pada: string;
  dibatalkan_oleh: string;
  dibatalkan_pada: string;
  alasan_batal: string;
  jumlah_peserta: number;
  status: StatusPelatihan;
}

export interface PesertaBaris {
  id_peserta: string;
  id_pelatihan: string;
  nama_pelatihan: string;
  jenis_penyelenggara: JenisPenyelenggara;
  tanggal_mulai: string;
  tanggal_selesai: string;
  jumlah_jam: number;
  dibatalkan_pada: string;
  id_karyawan: string;
  nama: string;
  unit: string;
  hasil: string;
  catatan: string;
  id_dokumen: string;
  id_jenis: string;
  jenis_dokumen: string;
  nomor: string;
  tanggal_terbit: string;
  tanggal_kedaluwarsa: string;
  catatan_dokumen: string;
  dicatat_oleh: string;
  created_at: string;
}

export interface BerkasSertifikatBaris {
  id_berkas: string;
  id_dokumen: string;
  urutan: number;
  nama_berkas: string;
  mime_type: string;
  ukuran_byte: number;
}

export interface IsiBerkasSertifikat {
  id_berkas: string;
  id_dokumen: string;
  nama_berkas: string;
  mime_type: string;
  data_base64: string;
}

export interface DaftarPelatihan {
  hari_ini: string;
  tahun: string;
  pelatihan: PelatihanBaris[];
}

export interface RincianPelatihan {
  hari_ini: string;
  pelatihan: PelatihanBaris;
  peserta: PesertaBaris[];
  berkas: BerkasSertifikatBaris[];
}

export interface RiwayatPelatihan {
  hari_ini: string;
  peserta: PesertaBaris[];
  berkas: BerkasSertifikatBaris[];
}

export interface RekapPelatihan {
  hari_ini: string;
  tahun: string;
  rekap: RekapPegawai[];
}
