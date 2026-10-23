import "server-only";

import { formatTanggalOperasional } from "@/lib/attendance/time-policy";
import { db, ensureDbInitialized } from "@/lib/db";
import {
  type DataLaporanKehadiran,
  validateRentangLaporan,
} from "@/lib/validations/laporan-kehadiran";
import { KUNCI_HARI_SEKOLAH } from "@/lib/validations/nilai-akhir";

export interface DashboardMetrics {
  totalKaryawan: number;
  hadirHariIni: number;
  terlambatHariIni: number;
  sakitIzinHariIni: number;
  alfaHariIni: number;
  persentaseKehadiran: number;
}

export interface RekapBulananItem {
  idKaryawan: string;
  nama: string;
  divisi: string;
  totalHadir: number;
  totalTerlambat: number; // Menit
  frekuensiTelat: number;
  totalSakit: number;
  totalIzin: number;
  totalDispen: number;
  totalAlfa: number;
  totalJamKerja: number; // Jam
  totalLembur: number; // Jam
}

/** Hitungan kehadiran satu tanggal; kategorinya saling lepas per orang. */
export interface RekapTanggal {
  tanggal: string;
  tepat_waktu: number;
  terlambat: number;
  sakit_izin: number;
  alfa: number;
}

export interface TrenMingguan {
  /** Senin pekan berjalan (WIB), dihitung SQLite, bukan jam perangkat. */
  mulai: string;
  hari_ini: string;
  /** Hanya tanggal yang punya data; tanggal lain berarti nol. */
  hari: RekapTanggal[];
}

/**
 * Satu orang dihitung SEKALI per tanggal walau punya beberapa sesi
 * (`izinkan_multi_sesi`); menghitung baris mentah menggandakannya. Hadir
 * mengikuti leger (`attendance-ledger.ts`): scan gerbang yang bukan Alfa ATAU
 * status Hadir/Terlambat. Terlambat bila SALAH SATU sesi terlambat. Hadir
 * menang atas Sakit/Izin, yang menang atas Alfa. Cermin persis
 * `REKAP_PER_TANGGAL_SQL` di `administration.rs`; keduanya diuji dengan fixture
 * yang sama (`report.test.ts` ↔ `rekap_per_tanggal_*`).
 */
const REKAP_PER_TANGGAL_SQL = `
  SELECT tanggal,
    SUM(CASE WHEN hadir = 1 AND telat = 0 THEN 1 ELSE 0 END) AS tepat_waktu,
    SUM(CASE WHEN hadir = 1 AND telat > 0 THEN 1 ELSE 0 END) AS terlambat,
    SUM(CASE WHEN hadir = 0 AND sakit_izin = 1 THEN 1 ELSE 0 END) AS sakit_izin,
    SUM(CASE WHEN hadir = 0 AND sakit_izin = 0 AND alfa = 1 THEN 1 ELSE 0 END) AS alfa
  FROM (
    SELECT id_karyawan, tanggal,
      MAX(CASE
        WHEN (COALESCE(TRIM(jam_masuk), '') <> ''
              AND COALESCE(status_kehadiran, '') <> 'Alfa')
          OR status_kehadiran IN ('Hadir', 'Terlambat')
        THEN 1 ELSE 0 END) AS hadir,
      MAX(COALESCE(menit_terlambat, 0)) AS telat,
      MAX(CASE WHEN status_kehadiran IN ('Sakit', 'Izin', 'Dispen', 'Dispensasi')
        THEN 1 ELSE 0 END) AS sakit_izin,
      MAX(CASE WHEN status_kehadiran = 'Alfa' THEN 1 ELSE 0 END) AS alfa
    FROM absensi_harian
    WHERE tanggal BETWEEN ? AND ?
    GROUP BY id_karyawan, tanggal
  )
  GROUP BY tanggal
  ORDER BY tanggal;
`;

export async function rekapPerTanggal(
  mulai: string,
  selesai: string,
): Promise<RekapTanggal[]> {
  const result = await db.execute({
    sql: REKAP_PER_TANGGAL_SQL,
    args: [mulai, selesai],
  });
  return result.rows.map((row) => ({
    tanggal: String(row.tanggal),
    tepat_waktu: Number(row.tepat_waktu || 0),
    terlambat: Number(row.terlambat || 0),
    sakit_izin: Number(row.sakit_izin || 0),
    alfa: Number(row.alfa || 0),
  }));
}

export async function getTrenMingguan(): Promise<TrenMingguan> {
  await ensureDbInitialized();
  // `weekday 0` maju ke Minggu terdekat (hari ini bila sudah Minggu), lalu
  // mundur 6 hari ke Senin pekan yang sama.
  const pekan = await db.execute(`
    SELECT date('now', '+7 hours', 'weekday 0', '-6 days') AS mulai,
      date('now', '+7 hours', 'weekday 0') AS selesai,
      date('now', '+7 hours') AS hari_ini;
  `);
  const { mulai, selesai, hari_ini } = pekan.rows[0] as Record<string, unknown>;
  return {
    mulai: String(mulai),
    hari_ini: String(hari_ini),
    hari: await rekapPerTanggal(String(mulai), String(selesai)),
  };
}

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  await ensureDbInitialized();

  const todayStr = formatTanggalOperasional(new Date());

  // 1. Total Karyawan Aktif
  const empRes = await db.execute(
    "SELECT COUNT(*) as count FROM master_data WHERE status_aktif = 'Aktif';",
  );
  const totalKaryawan = Number(empRes.rows[0]?.count || 0);

  // 2. Statistik hari ini: rumus yang sama dengan tren mingguan, sehingga
  //    kartu KPI, donat, dan batang hari ini tidak pernah berselisih.
  const [hariIni] = await rekapPerTanggal(todayStr, todayStr);
  const terlambatHariIni = hariIni?.terlambat ?? 0;
  const hadirHariIni = (hariIni?.tepat_waktu ?? 0) + terlambatHariIni;
  const sakitIzinHariIni = hariIni?.sakit_izin ?? 0;
  const alfaHariIni = hariIni?.alfa ?? 0;

  const persentaseKehadiran =
    totalKaryawan > 0 ? Math.round((hadirHariIni / totalKaryawan) * 100) : 0;

  return {
    totalKaryawan,
    hadirHariIni,
    terlambatHariIni,
    sakitIzinHariIni,
    alfaHariIni,
    persentaseKehadiran,
  };
}

export async function getRekapHarian(filter?: {
  tanggal?: string;
  tanggal_mulai?: string;
  tanggal_selesai?: string;
  divisi?: string;
  limit?: number;
  offset?: number;
}) {
  await ensureDbInitialized();

  // `absensi_harian` bertambah satu baris per personil per hari dan tidak
  // pernah dipangkas: pada 800 personil, rentang satu bulan berarti ±24.000
  // baris dalam satu balasan. Batasnya dijepit di sini — bukan diserahkan ke
  // pemanggil — mengikuti pola `getRiwayatScan` di bawah.
  //
  // Bawaannya sama dengan pagar maksimumnya, dan itu disengaja: angka ini PAGAR
  // TERHADAP BENCANA, bukan ukuran halaman. Satu hari kerja pada 800 personil
  // dengan multi-sesi bisa melewati 1.000 baris, sehingga bawaan yang lebih
  // kecil akan memotong SATU HARI — dan pemotongan itu tidak meninggalkan jejak
  // apa pun di layar. Halaman yang perlu menelusuri lebih jauh wajib memaginasi
  // lewat `limit`/`offset`, seperti yang dilakukan halaman Riwayat.
  const limit = Math.min(2000, Math.max(1, filter?.limit || 2000));
  const offset = Math.max(0, filter?.offset || 0);

  let query = `
    SELECT a.*, m.kode_karyawan, s.nama_shift, s.kode_shift
    FROM absensi_harian a
    LEFT JOIN master_data m ON a.id_karyawan = m.id_unik
    LEFT JOIN tbl_shift s ON a.id_shift = s.id_shift
  `;
  const params: (string | number | boolean | null)[] = [];

  if (filter?.tanggal_mulai && filter?.tanggal_selesai) {
    query += " WHERE a.tanggal >= ? AND a.tanggal <= ?";
    params.push(filter.tanggal_mulai, filter.tanggal_selesai);
  } else {
    const tanggalStr = filter?.tanggal || formatTanggalOperasional(new Date());
    query += " WHERE a.tanggal = ?";
    params.push(tanggalStr);
  }

  if (filter?.divisi) {
    query += " AND a.kelas_divisi = ?";
    params.push(filter.divisi);
  }

  query += " ORDER BY a.update_terakhir DESC, a.tanggal DESC, a.nama ASC";
  query += " LIMIT ? OFFSET ?;";
  params.push(limit, offset);

  const res = await db.execute({ sql: query, args: params });
  return res.rows as unknown as Record<string, unknown>[];
}

export async function getRiwayatScan(filter?: {
  tanggal?: string;
  tanggal_mulai?: string;
  tanggal_selesai?: string;
  search?: string;
  limit?: number;
  offset?: number;
}) {
  await ensureDbInitialized();
  const search = filter?.search?.trim() || "";
  const limit = Math.min(500, Math.max(1, filter?.limit || 200));
  const offset = Math.max(0, filter?.offset || 0);

  let whereClause = "";
  const params: (string | number | boolean | null)[] = [];

  if (filter?.tanggal_mulai && filter?.tanggal_selesai) {
    whereClause = "tanggal_kerja >= ? AND tanggal_kerja <= ?";
    params.push(filter.tanggal_mulai, filter.tanggal_selesai);
  } else {
    const tanggal = filter?.tanggal || formatTanggalOperasional(new Date());
    whereClause = "tanggal_kerja = ?";
    params.push(tanggal);
  }

  params.push(
    search,
    `%${search}%`,
    `%${search}%`,
    `%${search}%`,
    `%${search}%`,
    `%${search}%`,
    limit,
    offset,
  );

  const result = await db.execute({
    sql: `
      SELECT id_log, timestamp_scan, tanggal_kerja, jam_scan, id_karyawan,
        nama, divisi, jenis_scan, status_proses, sumber_data,
        catatan_sistem, keterangan, menit_terlambat, menit_datang_awal,
        id_referensi, kode_operator
      FROM log_scan
      WHERE ${whereClause}
        AND (? = '' OR nama LIKE ? OR id_karyawan LIKE ? OR divisi LIKE ? OR id_referensi LIKE ? OR kode_operator LIKE ?)
      ORDER BY timestamp_scan DESC, id_log DESC
      LIMIT ? OFFSET ?;
    `,
    args: params,
  });
  return result.rows as unknown as Record<string, unknown>[];
}

export async function getRekapBulanan(filter?: {
  bulan?: string; // Nama Bulan (e.g. "Agustus")
  tahun?: number;
  divisi?: string;
}): Promise<RekapBulananItem[]> {
  await ensureDbInitialized();

  const monthNames = [
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember",
  ];
  const operationalDate = formatTanggalOperasional(new Date());
  const operationalYear = Number(operationalDate.slice(0, 4));
  const operationalMonth = Number(operationalDate.slice(5, 7));
  const bulanStr =
    filter?.bulan || monthNames[operationalMonth - 1] || "Agustus";
  const tahunNum = filter?.tahun || operationalYear;

  let query = `
    SELECT 
      id_karyawan, nama, kelas_divisi as divisi,
      SUM(CASE WHEN status_kehadiran = 'Hadir' THEN 1 ELSE 0 END) as totalHadir,
      SUM(menit_terlambat) as totalTerlambat,
      SUM(CASE WHEN menit_terlambat > 0 THEN 1 ELSE 0 END) as frekuensiTelat,
      SUM(CASE WHEN status_kehadiran = 'Sakit' THEN 1 ELSE 0 END) as totalSakit,
      SUM(CASE WHEN status_kehadiran = 'Izin' THEN 1 ELSE 0 END) as totalIzin,
      SUM(CASE WHEN status_kehadiran = 'Dispen' THEN 1 ELSE 0 END) as totalDispen,
      SUM(CASE WHEN status_kehadiran = 'Alfa' THEN 1 ELSE 0 END) as totalAlfa,
      ROUND(SUM(jam_kerja) / 60.0, 1) as totalJamKerja,
      ROUND(SUM(lembur) / 60.0, 1) as totalLembur
    FROM absensi_harian
    WHERE bulan = ? AND tahun = ?
  `;
  const params: (string | number | boolean | null)[] = [bulanStr, tahunNum];

  if (filter?.divisi) {
    query += " AND kelas_divisi = ?";
    params.push(filter.divisi);
  }

  query += " GROUP BY id_karyawan ORDER BY nama ASC;";

  const res = await db.execute({ sql: query, args: params });

  return res.rows.map((r) => {
    const row = r as Record<string, unknown>;
    return {
      idKaryawan: String(row.id_karyawan || ""),
      nama: String(row.nama || ""),
      divisi: String(row.divisi || ""),
      totalHadir: Number(row.totalHadir || 0),
      totalTerlambat: Number(row.totalTerlambat || 0),
      frekuensiTelat: Number(row.frekuensiTelat || 0),
      totalSakit: Number(row.totalSakit || 0),
      totalIzin: Number(row.totalIzin || 0),
      totalDispen: Number(row.totalDispen || 0),
      totalAlfa: Number(row.totalAlfa || 0),
      totalJamKerja: Number(row.totalJamKerja || 0),
      totalLembur: Number(row.totalLembur || 0),
    };
  });
}

/**
 * Data mentah laporan kehadiran; matriksnya disusun `susunLaporanKehadiran`.
 * Setiap kueri berbentuk satu kolom `json_object` dengan parameter ?1 = mulai
 * dan ?2 = selesai. Cermin persis `LAPORAN_KEHADIRAN_SQL` di
 * `administration.rs`, diuji dengan fixture yang sama.
 *
 * - personil: aktif, ditambah yang sudah nonaktif tetapi punya catatan di
 *   rentang itu. Predikat siswa dan unitnya sama dengan `generateAlfaHarian`.
 * - hari: satu baris per orang per tanggal; hadir dan telat memakai rumus
 *   `REKAP_PER_TANGGAL_SQL` supaya totalnya cocok dengan kartu dasbor;
 *   `menit` menjumlah menit terlambat semua sesi hari itu.
 * - whitelist: yang berlaku untuk semua libur, atau tanggalnya di rentang.
 */
export const LAPORAN_KEHADIRAN_SQL = {
  personil: `
    SELECT json_object(
      'id', m.id_unik, 'kode', COALESCE(m.kode_karyawan, ''), 'nama', m.nama,
      'jenis', CASE
        WHEN LOWER(TRIM(COALESCE(m.jenis_personil, ''))) = 'siswa'
          OR EXISTS (SELECT 1 FROM siswa_data s WHERE s.id_siswa = m.id_unik)
          THEN 'Peserta Didik'
        WHEN LOWER(TRIM(COALESCE(m.jenis_personil, ''))) = 'guru'
          OR EXISTS (SELECT 1 FROM guru_data g WHERE g.id_guru = m.id_unik)
          THEN 'Guru'
        ELSE 'Pegawai' END,
      'divisi', COALESCE(m.divisi, ''),
      'aktif', CASE WHEN m.status_aktif = 'Aktif' THEN 1 ELSE 0 END,
      'hari_kerja', sh.hari_kerja, 'kode_shift', sh.kode_shift,
      'id_unit_siswa', (SELECT u.id_unit FROM akademik_unit u
        WHERE LOWER(TRIM(u.nama_unit)) = LOWER(TRIM(m.unit))
        ORDER BY u.id_unit LIMIT 1))
    FROM master_data m LEFT JOIN tbl_shift sh ON sh.id_shift = m.id_shift
    WHERE m.status_aktif = 'Aktif'
      OR EXISTS (SELECT 1 FROM absensi_harian a WHERE a.id_karyawan = m.id_unik
        AND a.tanggal BETWEEN ?1 AND ?2)
    ORDER BY m.nama;
  `,
  hari: `
    SELECT json_object(
      'id', id_karyawan, 'tanggal', tanggal,
      'hadir', MAX(CASE
        WHEN (COALESCE(TRIM(jam_masuk), '') <> ''
              AND COALESCE(status_kehadiran, '') <> 'Alfa')
          OR status_kehadiran IN ('Hadir', 'Terlambat')
        THEN 1 ELSE 0 END),
      'telat', MAX(COALESCE(menit_terlambat, 0)),
      'menit', SUM(COALESCE(menit_terlambat, 0)),
      'sakit', MAX(CASE WHEN status_kehadiran = 'Sakit' THEN 1 ELSE 0 END),
      'izin', MAX(CASE WHEN status_kehadiran = 'Izin' THEN 1 ELSE 0 END),
      'dispensasi', MAX(CASE WHEN status_kehadiran IN ('Dispen', 'Dispensasi')
        THEN 1 ELSE 0 END),
      'alfa', MAX(CASE WHEN status_kehadiran = 'Alfa' THEN 1 ELSE 0 END))
    FROM absensi_harian
    WHERE tanggal BETWEEN ?1 AND ?2
    GROUP BY id_karyawan, tanggal
    ORDER BY id_karyawan, tanggal;
  `,
  libur: `
    SELECT json_object('tanggal', tanggal, 'nama', nama_libur)
    FROM tbl_hari_libur
    WHERE status_aktif = 1 AND tanggal BETWEEN ?1 AND ?2
    ORDER BY tanggal;
  `,
  whitelist: `
    SELECT json_object('id', id, 'scope_type', scope_type,
      'scope_value', scope_value, 'tanggal_libur', tanggal_libur,
      'keterangan', keterangan, 'status_aktif', status_aktif)
    FROM hari_libur_whitelist
    WHERE status_aktif = 1 AND (COALESCE(TRIM(tanggal_libur), '') = ''
      OR tanggal_libur BETWEEN ?1 AND ?2)
    ORDER BY id;
  `,
} as const;

export class RentangLaporanError extends Error {}

export async function getLaporanKehadiran(
  mulai: string,
  selesai: string,
): Promise<DataLaporanKehadiran> {
  const rentang = validateRentangLaporan(mulai, selesai);
  if (!rentang.ok) throw new RentangLaporanError(rentang.error);
  await ensureDbInitialized();

  const daftar = async <T>(sql: string): Promise<T[]> => {
    const result = await db.execute({ sql, args: [mulai, selesai] });
    return result.rows.map((row) => JSON.parse(String(row[0])) as T);
  };
  const umum = await db.execute({
    sql: "SELECT date('now', '+7 hours') AS hari_ini, (SELECT value FROM setting_gex_system WHERE key = ?) AS hari_sekolah;",
    args: [KUNCI_HARI_SEKOLAH],
  });
  const baris = umum.rows[0] as Record<string, unknown>;
  return {
    mulai,
    selesai,
    hari_ini: String(baris.hari_ini),
    hari_sekolah:
      baris.hari_sekolah == null ? null : String(baris.hari_sekolah),
    personil: await daftar(LAPORAN_KEHADIRAN_SQL.personil),
    hari: await daftar(LAPORAN_KEHADIRAN_SQL.hari),
    libur: await daftar(LAPORAN_KEHADIRAN_SQL.libur),
    whitelist: await daftar(LAPORAN_KEHADIRAN_SQL.whitelist),
  };
}

export async function getTopKaryawanTerajin(limit = 5) {
  await ensureDbInitialized();

  const res = await db.execute({
    sql: `
      SELECT 
        id_karyawan, nama, kelas_divisi as divisi,
        COUNT(*) as total_kehadiran,
        SUM(menit_terlambat) as total_telat
      FROM absensi_harian
      WHERE status_kehadiran = 'Hadir'
      GROUP BY id_karyawan
      ORDER BY total_kehadiran DESC, total_telat ASC
      LIMIT ?;
    `,
    args: [limit],
  });

  return res.rows as unknown as Record<string, unknown>[];
}
