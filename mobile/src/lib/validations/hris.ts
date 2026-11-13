/**
 * HRIS Fase 1a (`prd-hris.md` §19.2.1): bagian dan jabatan sebagai master.
 * Cermin `desktop/hris.rs`: fungsi bernama sama dalam snake_case, vektor
 * `hris.vektor.json` diuji kedua bahasa, dan konstanta SQL di bawah disalin
 * harfiah (diperiksa `hris.test.ts`). Pesan galatnya pun wajib identik.
 */

import { z } from "zod";

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
  pegawai: PegawaiKepegawaian[];
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

// ─── SQL (harfiah sama dengan hris.rs) ──────────────────────────────────────

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
