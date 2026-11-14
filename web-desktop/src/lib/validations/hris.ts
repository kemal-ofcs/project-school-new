/**
 * HRIS Fase 1a (`prd-hris.md` §19.2.1): bagian dan jabatan sebagai master.
 * Cermin `desktop/hris.rs`: fungsi bernama sama dalam snake_case, vektor
 * `hris.vektor.json` diuji kedua bahasa, dan konstanta SQL di bawah disalin
 * harfiah (diperiksa `hris.test.ts`). Pesan galatnya pun wajib identik.
 */

import { z } from "zod";
import { tanggalValid } from "./hari-kerja";

export const NAMA_MAKS = 60;

/** Spasi beruntun menjadi satu, spasi tepi dibuang. */
export function normalisasiNama(nama: string): string {
  return nama.split(/\s+/).filter(Boolean).join(" ");
}

/** Kunci pembanding nama: tanpa beda huruf besar-kecil dan spasi ganda. */
export function kunciNama(nama: string): string {
  return normalisasiNama(nama).toLowerCase();
}

export function validasiNamaMaster(
  nama: string,
  jenis: string,
): { ok: true; nama: string } | { ok: false; galat: string } {
  const normal = normalisasiNama(nama);
  const panjang = [...normal].length;
  if (panjang < 2)
    return { ok: false, galat: `Nama ${jenis} minimal 2 karakter.` };
  if (panjang > NAMA_MAKS)
    return {
      ok: false,
      galat: `Nama ${jenis} maksimal ${NAMA_MAKS} karakter.`,
    };
  return { ok: true, nama: normal };
}

/**
 * Id `hr_bagian_nama`. Huruf kecil ASCII saja, sama dengan `lower()` SQLite
 * di SQL migrasi.
 */
export function idNamaBagian(idBagian: string, nama: string): string {
  const kecil = nama.replace(/[A-Z]/g, (c) => c.toLowerCase());
  const hex = [...new TextEncoder().encode(kecil)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${idBagian}:${hex}`;
}

/** Atasan untuk pegawai: bukan dirinya, tanpa siklus. `atasan` = peta pegawai → atasannya. */
export function periksaAtasan(
  idKaryawan: string,
  idAtasan: string,
  atasan: ReadonlyMap<string, string>,
): string | null {
  if (idAtasan === "") return null;
  if (idAtasan === idKaryawan) return "Atasan tidak boleh dirinya sendiri.";
  const dilalui = new Set<string>();
  let kini = idAtasan;
  for (;;) {
    const berikut = atasan.get(kini);
    if (!berikut) break;
    if (berikut === idKaryawan)
      return "Atasan ini membuat rantai atasan yang berputar.";
    if (dilalui.has(kini)) break;
    dilalui.add(kini);
    kini = berikut;
  }
  return null;
}

/** Pegawai yang berada di dalam siklus atasan, terurut. */
export function dalamSiklusAtasan(
  atasan: ReadonlyMap<string, string>,
): string[] {
  const hasil = new Set<string>();
  for (const awal of atasan.keys()) {
    const dilalui = new Set<string>();
    let kini = awal;
    for (;;) {
      const berikut = atasan.get(kini);
      if (!berikut) break;
      if (berikut === awal) {
        hasil.add(awal);
        break;
      }
      if (dilalui.has(kini)) break;
      dilalui.add(kini);
      kini = berikut;
    }
  }
  return [...hasil].sort(bandingTeks);
}

/** Urutan byte seperti `BTreeSet<String>` Rust, bukan `localeCompare`. */
function bandingTeks(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export interface PegawaiOrg {
  id_unik: string;
  divisi: string;
  id_bagian: string;
  id_jabatan: string;
  id_atasan: string;
}

export interface MasterOrg {
  id: string;
  nama: string;
  is_aktif: number;
}

export interface NamaLama {
  id_bagian: string;
  nama: string;
}

export interface BagianOrg {
  id_bagian: string;
  nama: string;
  is_aktif: number;
  anggota: number;
  nama_lama: string[];
  nama_ganda: boolean;
}

export interface JabatanOrg {
  id_jabatan: string;
  nama: string;
  is_aktif: number;
  anggota: number;
  nama_ganda: boolean;
}

export interface SusunanOrg {
  bagian: BagianOrg[];
  jabatan: JabatanOrg[];
  tanpa_master: { divisi: string; jumlah: number }[];
  atasan_siklus: string[];
}

/** Turunan halaman Organisasi; cermin `susun_org`. */
export function susunOrg(
  pegawai: readonly PegawaiOrg[],
  bagian: readonly MasterOrg[],
  namaLama: readonly NamaLama[],
  jabatan: readonly MasterOrg[],
): SusunanOrg {
  const ganda = (daftar: readonly MasterOrg[]) => {
    const hitung = new Map<string, number>();
    for (const m of daftar) {
      if (m.is_aktif !== 1) continue;
      const k = kunciNama(m.nama);
      hitung.set(k, (hitung.get(k) ?? 0) + 1);
    }
    return hitung;
  };
  const gandaBagian = ganda(bagian);
  const gandaJabatan = ganda(jabatan);
  const dikenal = new Set([
    ...namaLama.map((n) => kunciNama(n.nama)),
    ...bagian.map((b) => kunciNama(b.nama)),
  ]);
  const tanpa = new Map<string, { divisi: string; jumlah: number }>();
  for (const p of pegawai) {
    if (p.id_bagian !== "") continue;
    const k = kunciNama(p.divisi);
    if (k === "" || dikenal.has(k)) continue;
    const entri = tanpa.get(k) ?? {
      divisi: normalisasiNama(p.divisi),
      jumlah: 0,
    };
    entri.jumlah += 1;
    tanpa.set(k, entri);
  }
  return {
    bagian: bagian.map((b) => ({
      id_bagian: b.id,
      nama: b.nama,
      is_aktif: b.is_aktif,
      anggota: pegawai.filter((p) => p.id_bagian === b.id).length,
      nama_lama: namaLama
        .filter(
          (n) =>
            n.id_bagian === b.id && kunciNama(n.nama) !== kunciNama(b.nama),
        )
        .map((n) => n.nama),
      nama_ganda:
        b.is_aktif === 1 && (gandaBagian.get(kunciNama(b.nama)) ?? 0) > 1,
    })),
    jabatan: jabatan.map((j) => ({
      id_jabatan: j.id,
      nama: j.nama,
      is_aktif: j.is_aktif,
      anggota: pegawai.filter((p) => p.id_jabatan === j.id).length,
      nama_ganda:
        j.is_aktif === 1 && (gandaJabatan.get(kunciNama(j.nama)) ?? 0) > 1,
    })),
    tanpa_master: [...tanpa.entries()]
      .sort(([a], [b]) => bandingTeks(a, b))
      .map(([, v]) => v),
    atasan_siklus: dalamSiklusAtasan(
      new Map(pegawai.map((p) => [p.id_unik, p.id_atasan])),
    ),
  };
}

/** Baris pegawai `ORG_PEGAWAI_SQL`. */
export interface PegawaiKepegawaian extends PegawaiOrg {
  kode_karyawan: string;
  nama: string;
  unit: string;
  jabatan_status: string;
  status_aktif: string;
  tmt: string;
  kelompok: "Guru" | "Tendik";
  status_kepegawaian: string;
}

export interface OrgKepegawaian extends SusunanOrg {
  /** `status_kepegawaian` di sini = status kini (`STATUS_KINI_SQL`, hari ini WIB). */
  pegawai: PegawaiKepegawaian[];
  jenis_tugas: JenisTugas[];
  pengaturan: PengaturanKontrak;
}

export const bagianDraftSchema = z
  .object({
    id: z.string().trim().max(80).optional(),
    nama: z.string().max(200),
    is_aktif: z.union([z.literal(0), z.literal(1)]).default(1),
  })
  .strict();
export type MasterDraft = z.input<typeof bagianDraftSchema>;

export const gabungBagianSchema = z
  .object({
    id_asal: z.string().trim().min(1).max(80),
    id_tujuan: z.string().trim().min(1).max(80),
  })
  .strict();

/** Kolom organisasi di payload simpan Karyawan/Guru; kosong = tidak dipilih. */
export const organisasiPegawaiSchema = {
  id_bagian: z.string().trim().max(80).optional(),
  id_jabatan: z.string().trim().max(80).optional(),
  id_atasan: z.string().trim().max(80).optional(),
};

// SQL (harfiah sama dengan hris.rs)

export const PEGAWAI_SQL =
  "LOWER(TRIM(COALESCE(m.jenis_personil, ''))) <> 'siswa' AND NOT EXISTS (SELECT 1 FROM siswa_data sd WHERE sd.id_siswa = m.id_unik)";

export const MIGRASI_ORGANISASI_SQL = [
  "INSERT OR IGNORE INTO hr_bagian (id_bagian, nama) SELECT 'bag-' || lower(hex(lower(trim(m.divisi)))), trim(m.divisi) FROM master_data m WHERE LOWER(TRIM(COALESCE(m.jenis_personil, ''))) <> 'siswa' AND NOT EXISTS (SELECT 1 FROM siswa_data sd WHERE sd.id_siswa = m.id_unik) AND trim(COALESCE(m.divisi, '')) <> '' GROUP BY lower(trim(m.divisi)), trim(m.divisi) ORDER BY lower(trim(m.divisi)), COUNT(*) DESC, trim(m.divisi);",
  "INSERT OR IGNORE INTO hr_bagian_nama (id_nama, id_bagian, nama) SELECT b.id_bagian || ':' || lower(hex(lower(b.nama))), b.id_bagian, b.nama FROM hr_bagian b;",
  "INSERT OR IGNORE INTO hr_jabatan (id_jabatan, nama) SELECT 'jab-' || lower(hex(lower(trim(m.jabatan_status)))), trim(m.jabatan_status) FROM master_data m WHERE LOWER(TRIM(COALESCE(m.jenis_personil, ''))) <> 'siswa' AND NOT EXISTS (SELECT 1 FROM siswa_data sd WHERE sd.id_siswa = m.id_unik) AND trim(COALESCE(m.jabatan_status, '')) NOT IN ('', '-') GROUP BY lower(trim(m.jabatan_status)), trim(m.jabatan_status) ORDER BY lower(trim(m.jabatan_status)), COUNT(*) DESC, trim(m.jabatan_status);",
  "UPDATE master_data SET id_bagian = 'bag-' || lower(hex(lower(trim(divisi)))) WHERE id_bagian IS NULL AND trim(COALESCE(divisi, '')) <> '' AND id_unik IN (SELECT m.id_unik FROM master_data m WHERE LOWER(TRIM(COALESCE(m.jenis_personil, ''))) <> 'siswa' AND NOT EXISTS (SELECT 1 FROM siswa_data sd WHERE sd.id_siswa = m.id_unik));",
  "UPDATE master_data SET id_jabatan = 'jab-' || lower(hex(lower(trim(jabatan_status)))) WHERE id_jabatan IS NULL AND trim(COALESCE(jabatan_status, '')) NOT IN ('', '-') AND id_unik IN (SELECT m.id_unik FROM master_data m WHERE LOWER(TRIM(COALESCE(m.jenis_personil, ''))) <> 'siswa' AND NOT EXISTS (SELECT 1 FROM siswa_data sd WHERE sd.id_siswa = m.id_unik));",
  "INSERT OR IGNORE INTO hr_tugas_jenis (id_jenis, nama, ekuivalen_jp) VALUES ('tgs-kepsek', 'Kepala Sekolah', 24), ('tgs-wakasek', 'Wakil Kepala Sekolah', 12), ('tgs-kaprog', 'Kepala Program Keahlian', 12), ('tgs-kaperpus', 'Kepala Perpustakaan', 12), ('tgs-kalab', 'Kepala Laboratorium/Bengkel', 12), ('tgs-wali-kelas', 'Wali Kelas', 2), ('tgs-pembina-osis', 'Pembina OSIS', 2), ('tgs-pembina-ekskul', 'Pembina Ekstrakurikuler', 2), ('tgs-piket', 'Guru Piket', 1), ('tgs-bendahara-bos', 'Bendahara BOS', 0);",
  "INSERT OR IGNORE INTO hr_dokumen_jenis (id_jenis, nama) VALUES ('dok-ktp', 'KTP'), ('dok-kk', 'Kartu Keluarga'), ('dok-npwp', 'NPWP'), ('dok-ijazah', 'Ijazah'), ('dok-transkrip', 'Transkrip Nilai'), ('dok-serdik', 'Sertifikat Pendidik'), ('dok-sk-yayasan', 'SK Yayasan'), ('dok-sk-tugas', 'SK Tugas'), ('dok-kontrak', 'Kontrak Kerja'), ('dok-skck', 'SKCK'), ('dok-sehat', 'Surat Keterangan Sehat'), ('dok-pelatihan', 'Sertifikat Pelatihan'), ('dok-lainnya', 'Lainnya');",
] as const;

export const SIMPAN_BAGIAN_SQL =
  "INSERT INTO hr_bagian (id_bagian, nama, is_aktif, created_at, updated_at) VALUES (?1, ?2, ?3, datetime('now'), datetime('now')) ON CONFLICT(id_bagian) DO UPDATE SET nama = excluded.nama, is_aktif = excluded.is_aktif, updated_at = excluded.updated_at;";

export const CATAT_NAMA_BAGIAN_SQL =
  "INSERT OR IGNORE INTO hr_bagian_nama (id_nama, id_bagian, nama, created_at) VALUES (?1, ?2, ?3, datetime('now'));";

export const SIMPAN_JABATAN_SQL =
  "INSERT INTO hr_jabatan (id_jabatan, nama, is_aktif, created_at, updated_at) VALUES (?1, ?2, ?3, datetime('now'), datetime('now')) ON CONFLICT(id_jabatan) DO UPDATE SET nama = excluded.nama, is_aktif = excluded.is_aktif, updated_at = excluded.updated_at;";

export const TULIS_ULANG_BAGIAN_SQL = [
  "UPDATE master_data SET id_bagian = ?1 WHERE COALESCE(id_bagian, '') = '' AND EXISTS (SELECT 1 FROM hr_bagian WHERE id_bagian = ?1 AND is_aktif = 1) AND lower(trim(divisi)) IN (SELECT lower(trim(nama)) FROM hr_bagian_nama WHERE id_bagian = ?1) AND LOWER(TRIM(COALESCE(jenis_personil, ''))) <> 'siswa' AND NOT EXISTS (SELECT 1 FROM siswa_data sd WHERE sd.id_siswa = master_data.id_unik);",
  "UPDATE master_data SET divisi = (SELECT nama FROM hr_bagian WHERE id_bagian = ?1) WHERE id_bagian = ?1 AND EXISTS (SELECT 1 FROM hr_bagian WHERE id_bagian = ?1) AND divisi IS NOT (SELECT nama FROM hr_bagian WHERE id_bagian = ?1);",
  "UPDATE id_card SET divisi = (SELECT nama FROM hr_bagian WHERE id_bagian = ?1) WHERE id_unik IN (SELECT id_unik FROM master_data WHERE id_bagian = ?1) AND EXISTS (SELECT 1 FROM hr_bagian WHERE id_bagian = ?1) AND divisi IS NOT (SELECT nama FROM hr_bagian WHERE id_bagian = ?1);",
  "UPDATE absensi_harian SET kelas_divisi = (SELECT nama FROM hr_bagian WHERE id_bagian = ?1) WHERE id_karyawan IN (SELECT id_unik FROM master_data WHERE id_bagian = ?1) AND EXISTS (SELECT 1 FROM hr_bagian WHERE id_bagian = ?1) AND kelas_divisi IS NOT (SELECT nama FROM hr_bagian WHERE id_bagian = ?1);",
  "UPDATE log_scan SET divisi = (SELECT nama FROM hr_bagian WHERE id_bagian = ?1) WHERE id_karyawan IN (SELECT id_unik FROM master_data WHERE id_bagian = ?1) AND EXISTS (SELECT 1 FROM hr_bagian WHERE id_bagian = ?1) AND divisi IS NOT (SELECT nama FROM hr_bagian WHERE id_bagian = ?1);",
  "UPDATE backup_karyawan SET divisi_pengganti = (SELECT nama FROM hr_bagian WHERE id_bagian = ?1) WHERE id_karyawan_pengganti IN (SELECT id_unik FROM master_data WHERE id_bagian = ?1) AND EXISTS (SELECT 1 FROM hr_bagian WHERE id_bagian = ?1) AND divisi_pengganti IS NOT (SELECT nama FROM hr_bagian WHERE id_bagian = ?1);",
  "UPDATE backup_karyawan SET divisi_asal = (SELECT nama FROM hr_bagian WHERE id_bagian = ?1) WHERE id_karyawan_asal IN (SELECT id_unik FROM master_data WHERE id_bagian = ?1) AND EXISTS (SELECT 1 FROM hr_bagian WHERE id_bagian = ?1) AND divisi_asal IS NOT (SELECT nama FROM hr_bagian WHERE id_bagian = ?1);",
  "UPDATE koreksi_admin SET divisi = (SELECT nama FROM hr_bagian WHERE id_bagian = ?1) WHERE id_karyawan IN (SELECT id_unik FROM master_data WHERE id_bagian = ?1) AND EXISTS (SELECT 1 FROM hr_bagian WHERE id_bagian = ?1) AND divisi IS NOT (SELECT nama FROM hr_bagian WHERE id_bagian = ?1);",
  "UPDATE payroll_components SET applies_to = 'DIVISI:' || (SELECT nama FROM hr_bagian WHERE id_bagian = ?1) WHERE EXISTS (SELECT 1 FROM hr_bagian WHERE id_bagian = ?1) AND upper(substr(trim(applies_to), 1, 7)) = 'DIVISI:' AND lower(trim(substr(trim(applies_to), 8))) IN (SELECT lower(trim(nama)) FROM hr_bagian_nama WHERE id_bagian = ?1) AND applies_to IS NOT ('DIVISI:' || (SELECT nama FROM hr_bagian WHERE id_bagian = ?1));",
  "UPDATE hari_libur_whitelist SET scope_value = (SELECT nama FROM hr_bagian WHERE id_bagian = ?1), updated_at = datetime('now') WHERE scope_type = 'DIVISI' AND EXISTS (SELECT 1 FROM hr_bagian WHERE id_bagian = ?1) AND lower(trim(scope_value)) IN (SELECT lower(trim(nama)) FROM hr_bagian_nama WHERE id_bagian = ?1) AND scope_value IS NOT (SELECT nama FROM hr_bagian WHERE id_bagian = ?1);",
] as const;

export const TULIS_ULANG_JABATAN_SQL =
  "UPDATE master_data SET jabatan_status = (SELECT nama FROM hr_jabatan WHERE id_jabatan = ?1) WHERE id_jabatan = ?1 AND EXISTS (SELECT 1 FROM hr_jabatan WHERE id_jabatan = ?1) AND jabatan_status IS NOT (SELECT nama FROM hr_jabatan WHERE id_jabatan = ?1);";

export const GABUNG_BAGIAN_SQL = [
  "INSERT OR IGNORE INTO hr_bagian_nama (id_nama, id_bagian, nama, created_at) SELECT ?2 || substr(id_nama, length(?1) + 1), ?2, nama, created_at FROM hr_bagian_nama WHERE id_bagian = ?1 AND ?1 <> ?2 AND EXISTS (SELECT 1 FROM hr_bagian WHERE id_bagian = ?2);",
  "UPDATE master_data SET id_bagian = ?2 WHERE id_bagian = ?1 AND ?1 <> ?2 AND EXISTS (SELECT 1 FROM hr_bagian WHERE id_bagian = ?2);",
  "UPDATE hr_bagian SET is_aktif = 0, updated_at = datetime('now') WHERE id_bagian = ?1 AND ?1 <> ?2 AND EXISTS (SELECT 1 FROM hr_bagian WHERE id_bagian = ?2);",
] as const;

export const PETA_BAGIAN_SQL =
  "SELECT n.id_bagian, b.nama FROM hr_bagian_nama n JOIN hr_bagian b ON b.id_bagian = n.id_bagian WHERE lower(trim(n.nama)) = lower(trim(?1)) ORDER BY b.is_aktif DESC, n.created_at DESC, n.id_nama LIMIT 1;";

export const PETA_JABATAN_SQL =
  "SELECT id_jabatan, nama FROM hr_jabatan WHERE lower(trim(nama)) = lower(trim(?1)) ORDER BY is_aktif DESC, id_jabatan LIMIT 1;";

export const BENTROK_BAGIAN_SQL =
  "SELECT 1 FROM hr_bagian b WHERE b.id_bagian <> ?2 AND b.is_aktif = 1 AND lower(trim(b.nama)) = lower(trim(?1)) UNION ALL SELECT 1 FROM hr_bagian_nama n JOIN hr_bagian b ON b.id_bagian = n.id_bagian WHERE n.id_bagian <> ?2 AND b.is_aktif = 1 AND lower(trim(n.nama)) = lower(trim(?1)) LIMIT 1;";

export const BENTROK_JABATAN_SQL =
  "SELECT 1 FROM hr_jabatan WHERE id_jabatan <> ?2 AND is_aktif = 1 AND lower(trim(nama)) = lower(trim(?1)) LIMIT 1;";

export const ORG_PEGAWAI_SQL =
  "SELECT m.id_unik, COALESCE(m.kode_karyawan, '') AS kode_karyawan, m.nama, COALESCE(m.unit, '') AS unit, COALESCE(m.divisi, '') AS divisi, COALESCE(m.jabatan_status, '') AS jabatan_status, COALESCE(m.id_bagian, '') AS id_bagian, COALESCE(m.id_jabatan, '') AS id_jabatan, COALESCE(m.id_atasan, '') AS id_atasan, COALESCE(m.status_aktif, 'Aktif') AS status_aktif, COALESCE(m.tanggal_mulai_aktif, '') AS tmt, CASE WHEN g.id_guru IS NOT NULL OR LOWER(TRIM(COALESCE(m.jenis_personil, ''))) = 'guru' THEN 'Guru' ELSE 'Tendik' END AS kelompok, COALESCE(g.status_kepegawaian, '') AS status_kepegawaian FROM master_data m LEFT JOIN guru_data g ON g.id_guru = m.id_unik WHERE LOWER(TRIM(COALESCE(m.jenis_personil, ''))) <> 'siswa' AND NOT EXISTS (SELECT 1 FROM siswa_data sd WHERE sd.id_siswa = m.id_unik) ORDER BY m.nama, m.id_unik\n-- batas: pegawai sekolah (guru dan tendik), dibatasi jumlah personil lembaga\n;";

export const ORG_BAGIAN_SQL =
  "SELECT id_bagian, nama, is_aktif FROM hr_bagian ORDER BY nama, id_bagian\n-- batas: daftar bagian sekolah, tidak tumbuh per hari\n;";

export const ORG_BAGIAN_NAMA_SQL =
  "SELECT id_bagian, nama FROM hr_bagian_nama ORDER BY created_at, id_nama\n-- batas: nama yang pernah dipakai bagian sekolah\n;";

export const ORG_JABATAN_SQL =
  "SELECT id_jabatan, nama, is_aktif FROM hr_jabatan ORDER BY nama, id_jabatan\n-- batas: daftar jabatan sekolah, tidak tumbuh per hari\n;";

// Fase 1b: kontrak dan status kepegawaian (§19.2.4)

/** K-1, Q-24. Cermin `STATUS_KONTRAK` dan CHECK `hr_kontrak.status`. */
export const STATUS_KONTRAK = [
  "GTY",
  "PTY",
  "GTT",
  "PTT",
  "Honorer",
  "PNS",
  "PPPK",
] as const;
export type StatusKontrak = (typeof STATUS_KONTRAK)[number];
export const STATUS_PEMBATALAN = "Pembatalan";
export const NOMOR_MAKS = 80;
export const CATATAN_MAKS = 500;

/** Angka hukum kontrak sebagai pengaturan sekolah (Q-28); kosong = bawaan. */
export const KUNCI_PERCOBAAN_MAKS = "hr_percobaan_maks_bulan";
export const KUNCI_PKWT_MAKS = "hr_pkwt_maks_bulan";
export const ATURAN_PERCOBAAN = { bawaan: 3, min: 1, maks: 12 } as const;
export const ATURAN_PKWT = { bawaan: 60, min: 12, maks: 120 } as const;

type Hasil<T> = { ok: true; nilai: T } | { ok: false; galat: string };

const panjang = (teks: string) => [...teks].length;

/** Isian kontrak (form, payload outbox); kosong = tidak diisi. */
export interface KontrakIsian {
  status: string;
  nomor: string;
  tanggal_mulai: string;
  tanggal_selesai: string;
  percobaan_selesai: string;
  catatan: string;
}

/** Kelengkapan kontrak, bukan angka hukum. `guru` = punya `guru_data`. */
export function validasiKontrak(
  isian: KontrakIsian,
  guru: boolean,
): Hasil<KontrakIsian> {
  const k: KontrakIsian = {
    status: isian.status.trim(),
    nomor: isian.nomor.trim(),
    tanggal_mulai: isian.tanggal_mulai.trim(),
    tanggal_selesai: isian.tanggal_selesai.trim(),
    percobaan_selesai: isian.percobaan_selesai.trim(),
    catatan: isian.catatan.trim(),
  };
  const salah = (galat: string) => ({ ok: false as const, galat });
  if (!(STATUS_KONTRAK as readonly string[]).includes(k.status))
    return salah("Status kontrak tidak dikenal.");
  if (!tanggalValid(k.tanggal_mulai))
    return salah("Tanggal mulai kontrak tidak valid.");
  if (k.tanggal_selesai !== "" && !tanggalValid(k.tanggal_selesai))
    return salah("Tanggal selesai kontrak tidak valid.");
  if (k.percobaan_selesai !== "" && !tanggalValid(k.percobaan_selesai))
    return salah("Tanggal akhir masa percobaan tidak valid.");
  if ((k.status === "GTY" || k.status === "GTT") && !guru)
    return salah("Status GTY dan GTT hanya untuk guru.");
  if ((k.status === "PTY" || k.status === "PTT") && guru)
    return salah("Status PTY dan PTT hanya untuk tenaga kependidikan.");
  if ((k.status === "GTT" || k.status === "PTT") && k.tanggal_selesai === "")
    return salah("Kontrak GTT dan PTT wajib punya tanggal selesai.");
  if (k.tanggal_selesai !== "" && k.tanggal_selesai < k.tanggal_mulai)
    return salah("Tanggal selesai tidak boleh sebelum tanggal mulai.");
  if (k.percobaan_selesai !== "") {
    if (k.status !== "GTY" && k.status !== "PTY")
      return salah("Masa percobaan hanya untuk GTY dan PTY.");
    if (k.percobaan_selesai < k.tanggal_mulai)
      return salah("Akhir masa percobaan tidak boleh sebelum tanggal mulai.");
    if (k.tanggal_selesai !== "" && k.percobaan_selesai > k.tanggal_selesai)
      return salah("Akhir masa percobaan melewati tanggal selesai kontrak.");
  }
  if (panjang(k.nomor) > NOMOR_MAKS)
    return salah(`Nomor SK/kontrak maksimal ${NOMOR_MAKS} karakter.`);
  if (panjang(k.catatan) > CATATAN_MAKS)
    return salah(`Catatan maksimal ${CATATAN_MAKS} karakter.`);
  return { ok: true, nilai: k };
}

/** Alasan pembatalan kontrak atau tugas. */
export function validasiAlasan(alasan: string): Hasil<string> {
  const teks = alasan.trim();
  if (teks === "")
    return { ok: false, galat: "Alasan pembatalan wajib diisi." };
  if (panjang(teks) > CATATAN_MAKS)
    return { ok: false, galat: `Alasan maksimal ${CATATAN_MAKS} karakter.` };
  return { ok: true, nilai: teks };
}

function hariDalamBulan(tahun: number, bulan: number): number {
  return new Date(Date.UTC(tahun, bulan, 0)).getUTCDate();
}

/** Tanggal + n bulan; tanggal di luar bulan tujuan menjadi akhir bulan. */
export function tambahBulan(tanggal: string, bulan: number): string | null {
  if (!tanggalValid(tanggal)) return null;
  const [y, m, d] = tanggal.split("-").map(Number);
  const total = y * 12 + (m - 1) + bulan;
  const ty = Math.floor(total / 12);
  const tm = (total % 12) + 1;
  const td = Math.min(d, hariDalamBulan(ty, tm));
  const dua = (n: number) => String(n).padStart(2, "0");
  return `${String(ty).padStart(4, "0")}-${dua(tm)}-${dua(td)}`;
}

/** Baris `hr_kontrak` (`KONTRAK_SQL`); kolom kosong = `""`. */
export interface KontrakBaris {
  id_kontrak: string;
  id_karyawan: string;
  status: string;
  id_ref: string;
  nomor: string;
  tanggal_mulai: string;
  tanggal_selesai: string;
  percobaan_selesai: string;
  catatan: string;
  dicatat_oleh: string;
  created_at: string;
}

/** Kontrak tidak dibatalkan, urut (tanggal mulai, id) seperti `STATUS_KINI_SQL`. */
export function kontrakSah(kontrak: readonly KontrakBaris[]): KontrakBaris[] {
  const batal = new Set(
    kontrak.filter((k) => k.status === STATUS_PEMBATALAN).map((k) => k.id_ref),
  );
  return kontrak
    .filter((k) => k.status !== STATUS_PEMBATALAN && !batal.has(k.id_kontrak))
    .sort(
      (a, b) =>
        bandingTeks(a.tanggal_mulai, b.tanggal_mulai) ||
        bandingTeks(a.id_kontrak, b.id_kontrak),
    );
}

export interface StatusKerja {
  keadaan: "Berlaku" | "Berakhir" | "Akan berlaku" | "Tanpa kontrak";
  status: string;
  id_kontrak: string;
  sampai: string;
  percobaan_sampai: string;
}

/** Keadaan kontrak satu orang pada `tanggal`; cermin `status_kerja`. */
export function statusKerja(
  kontrak: readonly KontrakBaris[],
  tanggal: string,
): StatusKerja {
  const sah = kontrakSah(kontrak);
  const berjalan = sah.filter((k) => k.tanggal_mulai <= tanggal);
  const k = berjalan[berjalan.length - 1];
  if (!k) {
    const nanti = sah[0];
    if (!nanti)
      return {
        keadaan: "Tanpa kontrak",
        status: "",
        id_kontrak: "",
        sampai: "",
        percobaan_sampai: "",
      };
    return {
      keadaan: "Akan berlaku",
      status: nanti.status,
      id_kontrak: nanti.id_kontrak,
      sampai: nanti.tanggal_selesai,
      percobaan_sampai: nanti.percobaan_selesai,
    };
  }
  return {
    keadaan:
      k.tanggal_selesai !== "" && k.tanggal_selesai < tanggal
        ? "Berakhir"
        : "Berlaku",
    status: k.status,
    id_kontrak: k.id_kontrak,
    sampai: k.tanggal_selesai,
    percobaan_sampai:
      k.percobaan_selesai !== "" && k.percobaan_selesai >= tanggal
        ? k.percobaan_selesai
        : "",
  };
}

export interface AturanKontrak {
  percobaan_maks_bulan: number;
  pkwt_maks_bulan: number;
}

/**
 * Tanda, bukan penolakan (Q-28). `pkwt_lewat`: rangkaian GTT/PTT terakhir
 * (diputus status lain) lebih panjang dari batas, dihitung dari tanggal mulai
 * kontrak pertamanya sampai tanggal selesai terjauh; celah tidak memutus.
 */
export function tandaKontrak(
  kontrak: readonly KontrakBaris[],
  aturan: AturanKontrak,
): string[] {
  const sah = kontrakSah(kontrak);
  const tanda: string[] = [];
  const percobaanLewat = sah.some((k) => {
    if (k.percobaan_selesai === "") return false;
    const batas = tambahBulan(k.tanggal_mulai, aturan.percobaan_maks_bulan);
    return batas !== null && k.percobaan_selesai > batas;
  });
  if (percobaanLewat) tanda.push("percobaan_lewat");
  let awal = sah.length;
  while (
    awal > 0 &&
    (sah[awal - 1].status === "GTT" || sah[awal - 1].status === "PTT")
  )
    awal--;
  const rangkaian = sah.slice(awal);
  if (rangkaian.length > 0) {
    const batas = tambahBulan(
      rangkaian[0].tanggal_mulai,
      aturan.pkwt_maks_bulan,
    );
    const akhir = rangkaian
      .map((k) => k.tanggal_selesai)
      .reduce((a, b) => (b > a ? b : a), "");
    if (batas !== null && akhir > batas) tanda.push("pkwt_lewat");
  }
  return tanda;
}

export interface RingkasKontrak extends StatusKerja {
  id_karyawan: string;
  tanda: string[];
}

export interface SusunanKontrak {
  ringkas: RingkasKontrak[];
  dibatalkan: string[];
}

/** Ringkasan tab Kontrak per pegawai (urut id); cermin `susun_kontrak`. */
export function susunKontrak(
  kontrak: readonly KontrakBaris[],
  hariIni: string,
  aturan: AturanKontrak,
): SusunanKontrak {
  const per = new Map<string, KontrakBaris[]>();
  for (const k of kontrak) {
    const daftar = per.get(k.id_karyawan) ?? [];
    daftar.push(k);
    per.set(k.id_karyawan, daftar);
  }
  return {
    ringkas: [...per.keys()].sort(bandingTeks).map((id) => {
      const daftar = per.get(id) ?? [];
      return {
        id_karyawan: id,
        ...statusKerja(daftar, hariIni),
        tanda: tandaKontrak(daftar, aturan),
      };
    }),
    dibatalkan: [
      ...new Set(
        kontrak
          .filter((k) => k.status === STATUS_PEMBATALAN && k.id_ref !== "")
          .map((k) => k.id_ref),
      ),
    ].sort(bandingTeks),
  };
}

/** Nilai kunci angka kontrak; kosong, rusak, atau di luar rentang = bawaan. */
export function angkaPengaturan(
  nilai: string | null,
  aturan: { bawaan: number; min: number; maks: number },
): number {
  const teks = (nilai ?? "").trim();
  if (!/^\d{1,4}$/.test(teks)) return aturan.bawaan;
  const n = Number(teks);
  return n >= aturan.min && n <= aturan.maks ? n : aturan.bawaan;
}

/** Isian pengaturan dari layar; `""` = kembali ke bawaan. */
export function validasiAngkaPengaturan(
  teks: string,
  aturan: { bawaan: number; min: number; maks: number },
  label: string,
): Hasil<string> {
  const isi = teks.trim();
  if (isi === "") return { ok: true, nilai: "" };
  const n = /^\d{1,4}$/.test(isi) ? Number(isi) : Number.NaN;
  if (!(n >= aturan.min && n <= aturan.maks))
    return {
      ok: false,
      galat: `${label} harus ${aturan.min} sampai ${aturan.maks} bulan, atau kosong untuk bawaan ${aturan.bawaan}.`,
    };
  return { ok: true, nilai: String(n) };
}

// Fase 1b: tugas tambahan (§19.2.2)

/** Satu-satunya id jenis yang dikenal kode: wali kelas dibaca dari rombel. */
export const ID_WALI_KELAS = "tgs-wali-kelas";
export const EKUIVALEN_MAKS = 40;

export interface TugasIsian {
  id_karyawan: string;
  id_jenis: string;
  unit: string;
  tahun_ajaran: string;
  id_rombel: string;
  nomor_sk: string;
  tanggal_sk: string;
  ekuivalen_jp: number | null;
  tanggal_mulai: string;
  tanggal_selesai: string;
}

const ekuivalenSah = (n: number) =>
  Number.isInteger(n) && n >= 0 && n <= EKUIVALEN_MAKS;

/** Kelengkapan tugas tambahan; cermin `validasi_tugas`. */
export function validasiTugas(isian: TugasIsian): Hasil<TugasIsian> {
  const t: TugasIsian = {
    id_karyawan: isian.id_karyawan.trim(),
    id_jenis: isian.id_jenis.trim(),
    unit: normalisasiNama(isian.unit),
    tahun_ajaran: isian.tahun_ajaran.trim(),
    id_rombel: isian.id_rombel.trim(),
    nomor_sk: isian.nomor_sk.trim(),
    tanggal_sk: isian.tanggal_sk.trim(),
    ekuivalen_jp: isian.ekuivalen_jp,
    tanggal_mulai: isian.tanggal_mulai.trim(),
    tanggal_selesai: isian.tanggal_selesai.trim(),
  };
  const salah = (galat: string) => ({ ok: false as const, galat });
  if (t.id_karyawan === "") return salah("Pilih pegawai.");
  if (t.id_jenis === "") return salah("Pilih jenis tugas.");
  if (t.tahun_ajaran === "") return salah("Tahun ajaran wajib dipilih.");
  if (panjang(t.tahun_ajaran) > 20) return salah("Tahun ajaran tidak valid.");
  if (!tanggalValid(t.tanggal_mulai))
    return salah("Tanggal mulai tugas tidak valid.");
  if (t.tanggal_selesai !== "" && !tanggalValid(t.tanggal_selesai))
    return salah("Tanggal selesai tugas tidak valid.");
  if (t.tanggal_selesai !== "" && t.tanggal_selesai < t.tanggal_mulai)
    return salah("Tanggal selesai tidak boleh sebelum tanggal mulai.");
  if (t.tanggal_sk !== "" && !tanggalValid(t.tanggal_sk))
    return salah("Tanggal SK tidak valid.");
  if (t.ekuivalen_jp !== null && !ekuivalenSah(t.ekuivalen_jp))
    return salah(`Ekuivalen JP harus 0 sampai ${EKUIVALEN_MAKS}.`);
  if (panjang(t.nomor_sk) > NOMOR_MAKS)
    return salah(`Nomor SK maksimal ${NOMOR_MAKS} karakter.`);
  if (panjang(t.unit) > NOMOR_MAKS)
    return salah(`Unit maksimal ${NOMOR_MAKS} karakter.`);
  if (t.id_jenis === ID_WALI_KELAS) {
    if (t.id_rombel === "")
      return salah("Tugas wali kelas wajib memilih rombel.");
  } else {
    t.id_rombel = "";
  }
  return { ok: true, nilai: t };
}

/** Jenis tugas dari layar Organisasi. */
export function validasiJenisTugas(isian: {
  nama: string;
  ekuivalen_jp: number;
}): Hasil<{ nama: string; ekuivalen_jp: number }> {
  const nama = validasiNamaMaster(isian.nama, "jenis tugas");
  if (!nama.ok) return nama;
  if (!ekuivalenSah(isian.ekuivalen_jp))
    return {
      ok: false,
      galat: `Ekuivalen JP harus 0 sampai ${EKUIVALEN_MAKS}.`,
    };
  return {
    ok: true,
    nilai: { nama: nama.nama, ekuivalen_jp: isian.ekuivalen_jp },
  };
}

export type StatusTugas = "Berlaku" | "Akan berlaku" | "Selesai" | "Dibatalkan";

/** Status tugas diturunkan, tidak disimpan; cermin `status_tugas`. */
export function statusTugas(
  t: {
    tanggal_mulai: string;
    tanggal_selesai: string;
    dibatalkan_pada: string;
  },
  hariIni: string,
): StatusTugas {
  if (t.dibatalkan_pada !== "") return "Dibatalkan";
  if (t.tanggal_selesai !== "" && t.tanggal_selesai < hariIni) return "Selesai";
  if (t.tanggal_mulai > hariIni) return "Akan berlaku";
  return "Berlaku";
}

// Skema rute Fase 1b

const teksOpsional = (maks: number) =>
  z.string().max(maks).optional().default("");

export const kontrakDraftSchema = z
  .object({
    id_karyawan: z.string().trim().min(1).max(80),
    status: z.string().max(20),
    nomor: teksOpsional(200),
    tanggal_mulai: z.string().max(20),
    tanggal_selesai: teksOpsional(20),
    percobaan_selesai: teksOpsional(20),
    catatan: teksOpsional(1000),
  })
  .strict();
export type KontrakDraft = z.input<typeof kontrakDraftSchema>;

export const batalSchema = z
  .object({
    id: z.string().trim().min(1).max(80),
    alasan: z.string().max(1000),
  })
  .strict();

export const jenisTugasDraftSchema = z
  .object({
    id: z.string().trim().max(80).optional(),
    nama: z.string().max(200),
    ekuivalen_jp: z.number().int(),
    is_aktif: z.union([z.literal(0), z.literal(1)]).default(1),
  })
  .strict();
export type JenisTugasDraft = z.input<typeof jenisTugasDraftSchema>;

export const tugasDraftSchema = z
  .object({
    id: z.string().trim().max(80).optional(),
    id_karyawan: z.string().max(80),
    id_jenis: z.string().max(80),
    unit: teksOpsional(200),
    tahun_ajaran: z.string().max(40),
    id_rombel: teksOpsional(80),
    nomor_sk: teksOpsional(200),
    tanggal_sk: teksOpsional(20),
    ekuivalen_jp: z.number().int().nullable().default(null),
    tanggal_mulai: z.string().max(20),
    tanggal_selesai: teksOpsional(20),
  })
  .strict();
export type TugasDraft = z.input<typeof tugasDraftSchema>;

export const pengaturanKontrakSchema = z
  .object({
    percobaan_maks_bulan: z.string().max(10),
    pkwt_maks_bulan: z.string().max(10),
  })
  .strict();
export type PengaturanKontrakDraft = z.infer<typeof pengaturanKontrakSchema>;

// Bentuk kembalian command/rute Fase 1b

export interface JenisTugas {
  id_jenis: string;
  nama: string;
  ekuivalen_jp: number;
  is_aktif: number;
}

export interface PengaturanKontrak {
  /** Isi kunci apa adanya; `""` = bawaan. */
  percobaan_maks_bulan: string;
  pkwt_maks_bulan: string;
  berlaku: AturanKontrak;
}

export interface DaftarKontrak extends SusunanKontrak {
  kontrak: KontrakBaris[];
  hari_ini: string;
  pengaturan: PengaturanKontrak;
}

export interface TugasBaris extends Omit<TugasIsian, "ekuivalen_jp"> {
  id_tugas: string;
  ekuivalen_jp: number | null;
  dicatat_oleh: string;
  dibatalkan_pada: string;
  dibatalkan_oleh: string;
  alasan_batal: string;
  status: StatusTugas;
}

export interface WaliKelasRombel {
  id_rombel: string;
  nama_rombel: string;
  id_wali_kelas: string;
  nama_tahun: string;
  semester: string;
  tanggal_mulai: string;
  tanggal_selesai: string;
}

export interface TahunAjaranRentang {
  nama_tahun: string;
  tanggal_mulai: string;
  tanggal_selesai: string;
}

export interface DaftarTugas {
  jenis: JenisTugas[];
  tugas: TugasBaris[];
  wali_kelas: WaliKelasRombel[];
  tahun_ajaran: TahunAjaranRentang[];
  hari_ini: string;
}

// SQL Fase 1b (harfiah sama dengan hris.rs)

/**
 * Status kepegawaian per pegawai pada ?1 (Q-25): kontrak tidak dibatalkan
 * terakhir yang sudah mulai, lalu `guru_data`, lalu kosong. Dipakai ketiga
 * titik hitung gaji dan daftar Kepegawaian.
 */
export const STATUS_KINI_SQL =
  "SELECT m.id_unik, COALESCE((SELECT k.status FROM hr_kontrak k WHERE k.id_karyawan = m.id_unik AND k.status <> 'Pembatalan' AND k.tanggal_mulai <= ?1 AND NOT EXISTS (SELECT 1 FROM hr_kontrak b WHERE b.status = 'Pembatalan' AND b.id_ref = k.id_kontrak) ORDER BY k.tanggal_mulai DESC, k.id_kontrak DESC LIMIT 1), g.status_kepegawaian, '') AS status FROM master_data m LEFT JOIN guru_data g ON g.id_guru = m.id_unik WHERE LOWER(TRIM(COALESCE(m.jenis_personil, ''))) <> 'siswa' AND NOT EXISTS (SELECT 1 FROM siswa_data sd WHERE sd.id_siswa = m.id_unik)\n-- batas: pegawai sekolah (guru dan tendik), dibatasi jumlah personil lembaga\n;";

/**
 * Cermin status kontrak terakhir ke `guru_data` (tanggal 9999-12-31, tidak
 * bergantung jam). Tanpa kontrak sah tersisa, `guru_data` tidak diubah
 * (keputusan A). ?1 = id pegawai.
 */
export const CERMIN_STATUS_SQL =
  "UPDATE guru_data SET status_kepegawaian = (SELECT k.status FROM hr_kontrak k WHERE k.id_karyawan = ?1 AND k.status <> 'Pembatalan' AND NOT EXISTS (SELECT 1 FROM hr_kontrak b WHERE b.status = 'Pembatalan' AND b.id_ref = k.id_kontrak) ORDER BY k.tanggal_mulai DESC, k.id_kontrak DESC LIMIT 1) WHERE id_guru = ?1 AND EXISTS (SELECT 1 FROM hr_kontrak k WHERE k.id_karyawan = ?1 AND k.status <> 'Pembatalan' AND NOT EXISTS (SELECT 1 FROM hr_kontrak b WHERE b.status = 'Pembatalan' AND b.id_ref = k.id_kontrak)) AND status_kepegawaian IS NOT (SELECT k.status FROM hr_kontrak k WHERE k.id_karyawan = ?1 AND k.status <> 'Pembatalan' AND NOT EXISTS (SELECT 1 FROM hr_kontrak b WHERE b.status = 'Pembatalan' AND b.id_ref = k.id_kontrak) ORDER BY k.tanggal_mulai DESC, k.id_kontrak DESC LIMIT 1);";

/** Guru (alias `g`) yang punya kontrak sah: isian status di form terkunci. */
export const BERKONTRAK_SQL =
  "EXISTS (SELECT 1 FROM hr_kontrak k WHERE k.id_karyawan = g.id_guru AND k.status <> 'Pembatalan' AND NOT EXISTS (SELECT 1 FROM hr_kontrak b WHERE b.status = 'Pembatalan' AND b.id_ref = k.id_kontrak))";

/** ?1 id, ?2 pegawai, ?3 status, ?4 id_ref, ?5 nomor, ?6 mulai, ?7 selesai, ?8 percobaan, ?9 catatan, ?10 pencatat. */
export const SIMPAN_KONTRAK_SQL =
  "INSERT OR IGNORE INTO hr_kontrak (id_kontrak, id_karyawan, status, id_ref, nomor, tanggal_mulai, tanggal_selesai, percobaan_selesai, catatan, dicatat_oleh, created_at) VALUES (?1, ?2, ?3, NULLIF(?4, ''), NULLIF(?5, ''), ?6, NULLIF(?7, ''), NULLIF(?8, ''), NULLIF(?9, ''), NULLIF(?10, ''), datetime('now'));";

export const KONTRAK_SQL =
  "SELECT id_kontrak, id_karyawan, status, COALESCE(id_ref, '') AS id_ref, COALESCE(nomor, '') AS nomor, tanggal_mulai, COALESCE(tanggal_selesai, '') AS tanggal_selesai, COALESCE(percobaan_selesai, '') AS percobaan_selesai, COALESCE(catatan, '') AS catatan, COALESCE(dicatat_oleh, '') AS dicatat_oleh, created_at FROM hr_kontrak ORDER BY id_karyawan, tanggal_mulai, id_kontrak\n-- batas: kontrak pegawai sekolah, beberapa baris per orang sepanjang masa kerja\n;";

export const PENGATURAN_KONTRAK_SQL =
  "SELECT key, value FROM setting_gex_system WHERE key IN ('hr_percobaan_maks_bulan', 'hr_pkwt_maks_bulan')\n-- batas: dua kunci pengaturan\n;";

export const HARI_INI_SQL = "SELECT date('now', '+7 hours') AS hari_ini;";

/** ?1 id, ?2 nama, ?3 ekuivalen JP, ?4 aktif. */
export const SIMPAN_JENIS_TUGAS_SQL =
  "INSERT INTO hr_tugas_jenis (id_jenis, nama, ekuivalen_jp, is_aktif, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, datetime('now'), datetime('now')) ON CONFLICT(id_jenis) DO UPDATE SET nama = excluded.nama, ekuivalen_jp = excluded.ekuivalen_jp, is_aktif = excluded.is_aktif, updated_at = excluded.updated_at;";

export const BENTROK_JENIS_TUGAS_SQL =
  "SELECT 1 FROM hr_tugas_jenis WHERE id_jenis <> ?2 AND is_aktif = 1 AND lower(trim(nama)) = lower(trim(?1)) LIMIT 1;";

export const JENIS_TUGAS_SQL =
  "SELECT id_jenis, nama, ekuivalen_jp, is_aktif FROM hr_tugas_jenis ORDER BY nama, id_jenis\n-- batas: jenis tugas tambahan sekolah, tidak tumbuh per hari\n;";

/**
 * Upsert penuh tugas; baris yang sudah dibatalkan tidak berubah lagi.
 * ?1 id, ?2 pegawai, ?3 jenis, ?4 unit, ?5 tahun ajaran, ?6 rombel, ?7 nomor
 * SK, ?8 tanggal SK, ?9 ekuivalen, ?10 mulai, ?11 selesai, ?12 pencatat.
 */
export const SIMPAN_TUGAS_SQL =
  "INSERT INTO hr_tugas_tambahan (id_tugas, id_karyawan, id_jenis, unit, tahun_ajaran, id_rombel, nomor_sk, tanggal_sk, ekuivalen_jp, tanggal_mulai, tanggal_selesai, dicatat_oleh, created_at, updated_at) VALUES (?1, ?2, ?3, NULLIF(?4, ''), ?5, NULLIF(?6, ''), NULLIF(?7, ''), NULLIF(?8, ''), ?9, ?10, NULLIF(?11, ''), NULLIF(?12, ''), datetime('now'), datetime('now')) ON CONFLICT(id_tugas) DO UPDATE SET id_karyawan = excluded.id_karyawan, id_jenis = excluded.id_jenis, unit = excluded.unit, tahun_ajaran = excluded.tahun_ajaran, id_rombel = excluded.id_rombel, nomor_sk = excluded.nomor_sk, tanggal_sk = excluded.tanggal_sk, ekuivalen_jp = excluded.ekuivalen_jp, tanggal_mulai = excluded.tanggal_mulai, tanggal_selesai = excluded.tanggal_selesai, updated_at = excluded.updated_at WHERE hr_tugas_tambahan.dibatalkan_pada IS NULL;";

/** ?1 id, ?2 pembatal, ?3 alasan; hanya bila belum dibatalkan. */
export const BATAL_TUGAS_SQL =
  "UPDATE hr_tugas_tambahan SET dibatalkan_pada = datetime('now'), dibatalkan_oleh = ?2, alasan_batal = ?3, updated_at = datetime('now') WHERE id_tugas = ?1 AND dibatalkan_pada IS NULL;";

/**
 * Jenis tugas yang dipegang tiap pegawai pada periode [?1, ?2] (Q-29):
 * tugas tidak dibatalkan yang beririsan, ditambah wali kelas dari rombel aktif
 * yang semesternya beririsan. Baris berjenis wali kelas hanya pembawa nomor
 * SK, tidak memberi tugas sendiri.
 */
export const TUGAS_BERLAKU_SQL =
  "SELECT t.id_karyawan, t.id_jenis FROM hr_tugas_tambahan t WHERE t.dibatalkan_pada IS NULL AND t.id_jenis <> 'tgs-wali-kelas' AND t.tanggal_mulai <= ?2 AND (COALESCE(t.tanggal_selesai, '') = '' OR t.tanggal_selesai >= ?1) UNION SELECT r.id_wali_kelas, 'tgs-wali-kelas' FROM akademik_rombel r JOIN akademik_tahun_ajaran ta ON ta.id_tahun_ajaran = r.id_tahun_ajaran WHERE r.is_aktif = 1 AND COALESCE(r.id_wali_kelas, '') <> '' AND ta.tanggal_mulai <= ?2 AND ta.tanggal_selesai >= ?1 ORDER BY 1, 2\n-- batas: tugas tambahan pegawai sekolah pada satu periode gaji\n;";

export const TUGAS_SQL =
  "SELECT id_tugas, id_karyawan, id_jenis, COALESCE(unit, '') AS unit, tahun_ajaran, COALESCE(id_rombel, '') AS id_rombel, COALESCE(nomor_sk, '') AS nomor_sk, COALESCE(tanggal_sk, '') AS tanggal_sk, ekuivalen_jp, tanggal_mulai, COALESCE(tanggal_selesai, '') AS tanggal_selesai, COALESCE(dicatat_oleh, '') AS dicatat_oleh, COALESCE(dibatalkan_pada, '') AS dibatalkan_pada, COALESCE(dibatalkan_oleh, '') AS dibatalkan_oleh, COALESCE(alasan_batal, '') AS alasan_batal FROM hr_tugas_tambahan ORDER BY tahun_ajaran DESC, tanggal_mulai, id_tugas\n-- batas: tugas tambahan sekolah, beberapa per pegawai per tahun ajaran\n;";

export const WALI_KELAS_SQL =
  "SELECT r.id_rombel, r.nama_rombel, r.id_wali_kelas, ta.nama_tahun, ta.semester, ta.tanggal_mulai, ta.tanggal_selesai FROM akademik_rombel r JOIN akademik_tahun_ajaran ta ON ta.id_tahun_ajaran = r.id_tahun_ajaran WHERE r.is_aktif = 1 AND COALESCE(r.id_wali_kelas, '') <> '' ORDER BY ta.nama_tahun DESC, ta.semester, r.nama_rombel, r.id_rombel\n-- batas: rombel aktif sekolah, satu wali per rombel\n;";

export const TAHUN_AJARAN_SQL =
  "SELECT nama_tahun, MIN(tanggal_mulai) AS tanggal_mulai, MAX(tanggal_selesai) AS tanggal_selesai FROM akademik_tahun_ajaran GROUP BY nama_tahun ORDER BY nama_tahun DESC\n-- batas: tahun ajaran sekolah, satu per tahun\n;";
