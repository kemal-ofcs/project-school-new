import type { Client } from "@libsql/client";

/**
 * Data anak untuk portal wali — HANYA BACA, dan hanya untuk satu `id_siswa`.
 *
 * Setiap fungsi di sini menerima `idSiswa` dari SESI, tidak pernah dari
 * permintaan. Lihat `bacaSesiWali` untuk alasan lengkapnya.
 *
 * Tanggalnya memakai standar WIB (`date('now','+7 hours')`), bukan `new Date()`
 * di proses Node. Server berjalan pada UTC, dan antara pukul 00:00–07:00 WIB
 * sebuah perbandingan UTC menunjuk hari kemarin — wali yang membuka portal
 * pagi-pagi akan melihat rentang yang meleset satu hari.
 */

/**
 * Agregasi scan gerbang per hari.
 *
 * `absensi_harian` mengizinkan multi-sesi per tanggal (`izinkan_multi_sesi`),
 * sehingga join langsung MENGGANDAKAN baris: wali akan melihat anaknya "hadir
 * dua kali" pada hari yang sama. Subquery ini menyatukannya persis seperti
 * `GATE_SUMMARY_SUBQUERY` di `attendance-dashboard.ts` pada panel admin —
 * `MIN` untuk jam masuk, `MAX` untuk jam pulang, dan sanitasi string kosong.
 */
const RINGKASAN_GERBANG = `(
  SELECT
    id_karyawan,
    tanggal,
    MIN(NULLIF(TRIM(jam_masuk), '')) AS jam_masuk,
    MAX(NULLIF(TRIM(jam_pulang), '')) AS jam_pulang,
    MAX(COALESCE(status_kehadiran, '')) AS status_kehadiran,
    MAX(COALESCE(menit_terlambat, 0)) AS menit_terlambat
  FROM absensi_harian
  GROUP BY id_karyawan, tanggal
)`;

/** Rentang bawaan dan batas keras, dalam hari. */
export const RENTANG_BAWAAN_HARI = 31;
export const RENTANG_MAKS_HARI = 186;

export interface HariKehadiran {
  tanggal: string;
  jamMasuk: string | null;
  jamPulang: string | null;
  status: string;
  menitTerlambat: number;
}

/**
 * Riwayat kehadiran gerbang.
 *
 * `absensi_harian` tumbuh setiap hari operasional dan tidak ada yang
 * memangkasnya, jadi query ini WAJIB berbatas — `audit:list-bound`
 * menegakkannya. Rentangnya dibatasi dua kali: jendela tanggal dan `LIMIT`.
 */
export async function bacaKehadiran(
  client: Client,
  idSiswa: string,
  hari = RENTANG_BAWAAN_HARI,
): Promise<HariKehadiran[]> {
  const jendela = Math.min(RENTANG_MAKS_HARI, Math.max(1, hari));

  const hasil = await client.execute({
    sql: `SELECT ah.tanggal, ah.jam_masuk, ah.jam_pulang,
                 ah.status_kehadiran, ah.menit_terlambat
            FROM ${RINGKASAN_GERBANG} ah
           WHERE ah.id_karyawan = ?
             AND ah.tanggal >= date('now', '+7 hours', ?)
             AND ah.tanggal <= date('now', '+7 hours')
        ORDER BY ah.tanggal DESC
           LIMIT ?;`,
    args: [idSiswa, `-${jendela} days`, RENTANG_MAKS_HARI],
  });

  return hasil.rows.map((baris) => ({
    tanggal: String(baris.tanggal),
    jamMasuk: String(baris.jam_masuk ?? "").trim() || null,
    jamPulang: String(baris.jam_pulang ?? "").trim() || null,
    status: String(baris.status_kehadiran ?? "").trim() || "—",
    menitTerlambat: Number(baris.menit_terlambat ?? 0),
  }));
}

export interface PresensiMapelItem {
  tanggal: string;
  jamKe: string;
  namaMapel: string;
  status: string;
  catatan: string | null;
}

/**
 * Kehadiran per jam pelajaran.
 *
 * `ORDER BY CAST(jam_ke AS INTEGER)` — kolomnya bertipe TEXT, sehingga
 * pengurutan leksikografis biasa meletakkan jam ke-10 sebelum jam ke-2.
 *
 * `presensi_mapel_detail` adalah tabel yang tumbuh PALING cepat di sistem ini
 * (satu baris per siswa per jam pelajaran), jadi batasnya sama ketatnya.
 */
export async function bacaPresensiMapel(
  client: Client,
  idSiswa: string,
  hari = RENTANG_BAWAAN_HARI,
): Promise<PresensiMapelItem[]> {
  const jendela = Math.min(RENTANG_MAKS_HARI, Math.max(1, hari));

  const hasil = await client.execute({
    sql: `SELECT pm.tanggal, pm.jam_ke,
                 COALESCE(mp.nama_mapel, '') AS nama_mapel,
                 pmd.status, pmd.catatan
            FROM presensi_mapel_detail pmd
            JOIN presensi_mapel pm ON pm.id_presensi_mapel = pmd.id_presensi_mapel
            LEFT JOIN akademik_mapel mp ON mp.id_mapel = pm.id_mapel
           WHERE pmd.id_siswa = ?
             AND pm.tanggal >= date('now', '+7 hours', ?)
             AND pm.tanggal <= date('now', '+7 hours')
        ORDER BY pm.tanggal DESC, CAST(pm.jam_ke AS INTEGER) ASC, pm.jam_ke ASC
           LIMIT 400;`,
    args: [idSiswa, `-${jendela} days`],
  });

  return hasil.rows.map((baris) => ({
    tanggal: String(baris.tanggal),
    jamKe: String(baris.jam_ke ?? ""),
    namaMapel: String(baris.nama_mapel ?? "").trim() || "—",
    status: String(baris.status ?? "").trim() || "—",
    catatan: String(baris.catatan ?? "").trim() || null,
  }));
}

export interface LegerItem {
  namaTahun: string;
  semester: string;
  totalHariEfektif: number;
  hadir: number;
  izin: number;
  sakit: number;
  alfa: number;
  dispensasi: number;
  persenKehadiran: number;
}

/**
 * Rekap kehadiran yang sudah DIBEKUKAN untuk rapor.
 *
 * Sengaja membaca `leger_kehadiran` dan bukan menghitung ulang: angka yang
 * dilihat wali harus sama persis dengan angka di rapor anaknya. Menghitung
 * ulang akan menghasilkan angka yang bergeser setiap kali admin melengkapi
 * daftar hari libur, dan orang tua akan membandingkan dua angka berbeda untuk
 * hal yang sama.
 */
export async function bacaLeger(
  client: Client,
  idSiswa: string,
): Promise<LegerItem[]> {
  const hasil = await client.execute({
    sql: `SELECT COALESCE(ta.nama_tahun, '') AS nama_tahun,
                 lk.semester, lk.total_hari_efektif, lk.hadir, lk.izin,
                 lk.sakit, lk.alfa, lk.dispensasi, lk.persen_kehadiran
            FROM leger_kehadiran lk
            LEFT JOIN akademik_tahun_ajaran ta
                   ON ta.id_tahun_ajaran = lk.id_tahun_ajaran
           WHERE lk.id_siswa = ?
        ORDER BY lk.dibekukan_at DESC
           LIMIT 20;`,
    args: [idSiswa],
  });

  return hasil.rows.map((baris) => ({
    namaTahun: String(baris.nama_tahun ?? "").trim() || "—",
    semester: String(baris.semester ?? ""),
    totalHariEfektif: Number(baris.total_hari_efektif ?? 0),
    hadir: Number(baris.hadir ?? 0),
    izin: Number(baris.izin ?? 0),
    sakit: Number(baris.sakit ?? 0),
    alfa: Number(baris.alfa ?? 0),
    dispensasi: Number(baris.dispensasi ?? 0),
    persenKehadiran: Number(baris.persen_kehadiran ?? 0),
  }));
}

export interface ProfilAnak {
  namaLengkap: string;
  nis: string | null;
  nisn: string | null;
  namaRombel: string | null;
  namaWali: string | null;
}

export async function bacaProfilAnak(
  client: Client,
  idSiswa: string,
): Promise<ProfilAnak | null> {
  const hasil = await client.execute({
    sql: `SELECT s.nama_lengkap, s.nis, s.nisn, s.nama_wali,
                 COALESCE(r.nama_rombel, '') AS nama_rombel
            FROM siswa_data s
            LEFT JOIN akademik_rombel r ON r.id_rombel = s.id_rombel
           WHERE s.id_siswa = ?
           LIMIT 1;`,
    args: [idSiswa],
  });

  const baris = hasil.rows[0];
  if (!baris) return null;

  return {
    namaLengkap: String(baris.nama_lengkap ?? ""),
    nis: String(baris.nis ?? "").trim() || null,
    nisn: String(baris.nisn ?? "").trim() || null,
    namaRombel: String(baris.nama_rombel ?? "").trim() || null,
    namaWali: String(baris.nama_wali ?? "").trim() || null,
  };
}
