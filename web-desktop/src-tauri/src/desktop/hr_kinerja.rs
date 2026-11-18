//! HRIS Fase 5 (`prd-hris.md` §23): penilaian kinerja guru dan tendik.
//!
//! Kelima tabel `hr_kinerja_*` KHUSUS CLOUD (Q-91): dibaca dan ditulis lewat
//! `TursoClient`, tidak pernah masuk SQLite perangkat, snapshot, atau outbox.
//! Tanpa koneksi, command mengembalikan `hris_cloud::PESAN_LURING`. Pengaturan
//! `hr_kinerja_*` tetap di `setting_gex_system` yang tersinkron (lokal + outbox).
//!
//! Kembaran TS: aturan dan SQL di `src/lib/validations/hr-kinerja.ts`,
//! penulisan di `src/lib/services/hr-kinerja.ts`. Vektornya
//! `validations/hr-kinerja.vektor.json`; teks SQL dan pesan dibandingkan
//! harfiah oleh `hr-kinerja.test.ts`.

use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use super::config::DesktopState;
use super::hari_kerja::{parse_hari_kerja, tanggal_valid};
use super::hr_keluar::kelompok_status;
use super::hr_pengajuan::{
    dalam_cakupan, tanggal_rentang, tanggal_wajib, Jadwal, LIBUR_SQL, UNIT_PERSONIL_SQL, WHITELIST_SQL,
};
use super::hris::{self, new_id, rows_json_with, HARI_INI_SQL, STATUS_KINI_SQL};
use super::models::{CommandError, OperatorUser};
use super::scanner::HolidayWhitelistEntry;
use super::time_policy::days_between;
use super::turso::{Statement, TursoClient};
use super::{hr_beban, storage, sync};

// Konstanta (cermin `validations/hr-kinerja.ts`)

pub const KELOMPOK_KINERJA: [&str; 2] = ["Guru", "Tendik"];
pub const TIPE_MANUAL: &str = "Manual";
pub const TIPE_KEHADIRAN: &str = "Otomatis Kehadiran";
pub const TIPE_PRESENSI: &str = "Otomatis Presensi Kelas";
pub const TIPE_JURNAL: &str = "Otomatis Jurnal";
pub const TIPE_ASPEK: [&str; 4] = [TIPE_MANUAL, TIPE_KEHADIRAN, TIPE_PRESENSI, TIPE_JURNAL];
/// Aspek yang hanya punya data untuk guru (jadwal, presensi, jurnal).
pub const TIPE_KHUSUS_GURU: [&str; 2] = [TIPE_PRESENSI, TIPE_JURNAL];

pub const MAKS_NAMA_TEMPLATE: usize = 100;
pub const MAKS_KETERANGAN: usize = 1000;
pub const MAKS_ASPEK: usize = 100;
pub const MAKS_ASPEK_AKTIF: usize = 20;
pub const MAKS_NAMA_ASPEK: usize = 100;
pub const MAKS_PANDUAN: usize = 1000;
pub const TOTAL_BOBOT: i64 = 100;

pub const KUNCI_AMBANG: &str = "hr_kinerja_ambang";
pub const KUNCI_PREDIKAT: &str = "hr_kinerja_predikat";
pub const KUNCI_TANPA_KBM: &str = "hr_kinerja_tanpa_kbm";
pub const AMBANG_BAWAAN: [i64; 4] = [950, 900, 800, 700];
/// Rentang PKG/PermenPAN-RB 16/2009 (Q-101); ambang dalam nilai ×100.
pub const PREDIKAT_BAWAAN: &str = "9100:Amat Baik|7600:Baik|6100:Cukup|5100:Sedang|0:Kurang";
pub const MIN_PREDIKAT: usize = 2;
pub const MAKS_PREDIKAT: usize = 7;
pub const MAKS_NAMA_PREDIKAT: usize = 50;
pub const MAKS_RENTANG_KBM: usize = 30;
pub const MAKS_HARI_RENTANG: i64 = 31;
pub const MAKS_NAMA_RENTANG: usize = 50;

pub const PESAN_AMBANG: &str = "Ambang harus empat bilangan bulat 1 sampai 1000 yang turun, misalnya 950,900,800,700.";
pub const PESAN_PREDIKAT: &str = "Predikat harus 2 sampai 7 pasangan nilai:nama dengan nilai turun dari 10000 dan yang terakhir 0.";
pub const PESAN_NAMA_PREDIKAT: &str = "Nama predikat 1 sampai 50 karakter tanpa tanda | dan :.";

// SQL kembar (teks harfiah sama dengan `hr-kinerja.ts`)

pub const TEMPLATE_KINERJA_SQL: &str = "SELECT id_template, nama, kelompok, COALESCE(keterangan, '') AS keterangan, is_bawaan, is_aktif, diubah_oleh, updated_at FROM hr_kinerja_template ORDER BY kelompok, is_aktif DESC, is_bawaan DESC, nama, id_template\n-- batas: template kinerja sekolah, dibuat tangan oleh pengatur\n;";
pub const ASPEK_KINERJA_SQL: &str = "SELECT id_aspek, id_template, nama, tipe, bobot, COALESCE(panduan, '') AS panduan, urutan, is_aktif FROM hr_kinerja_aspek ORDER BY id_template, urutan, id_aspek\n-- batas: paling banyak 100 aspek per template\n;";
pub const TEMPLATE_SATU_SQL: &str = "SELECT id_template, kelompok FROM hr_kinerja_template WHERE id_template = ?1;";
pub const ASPEK_TEMPLATE_SQL: &str = "SELECT id_aspek, tipe FROM hr_kinerja_aspek WHERE id_template = ?1 ORDER BY id_aspek\n-- batas: paling banyak 100 aspek per template\n;";
pub const BENTROK_TEMPLATE_SQL: &str = "SELECT 1 FROM hr_kinerja_template WHERE LOWER(TRIM(nama)) = LOWER(TRIM(?1)) AND id_template <> ?2 LIMIT 1;";
/// Kelompok tidak ikut diperbarui: terkunci sejak dibuat.
pub const SIMPAN_TEMPLATE_SQL: &str = "INSERT INTO hr_kinerja_template (id_template, nama, kelompok, keterangan, is_bawaan, is_aktif, diubah_oleh, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, datetime('now'), datetime('now')) ON CONFLICT(id_template) DO UPDATE SET nama = excluded.nama, keterangan = excluded.keterangan, is_bawaan = excluded.is_bawaan, is_aktif = excluded.is_aktif, diubah_oleh = excluded.diubah_oleh, updated_at = excluded.updated_at;";
/// Satu bawaan per kelompok, di batch yang sama dengan simpan template.
pub const LEPAS_BAWAAN_SQL: &str = "UPDATE hr_kinerja_template SET is_bawaan = 0, updated_at = datetime('now') WHERE kelompok = ?1 AND id_template <> ?2 AND is_bawaan = 1;";
/// Tipe dan template aspek tidak ikut diperbarui: terkunci sejak dibuat.
pub const SIMPAN_ASPEK_SQL: &str = "INSERT INTO hr_kinerja_aspek (id_aspek, id_template, nama, tipe, bobot, panduan, urutan, is_aktif, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, datetime('now'), datetime('now')) ON CONFLICT(id_aspek) DO UPDATE SET nama = excluded.nama, bobot = excluded.bobot, panduan = excluded.panduan, urutan = excluded.urutan, is_aktif = excluded.is_aktif, updated_at = excluded.updated_at;";
pub const SEED_TEMPLATE_SQL: &str = "INSERT OR IGNORE INTO hr_kinerja_template (id_template, nama, kelompok, keterangan, is_bawaan, is_aktif, diubah_oleh) VALUES (?1, ?2, ?3, ?4, 1, 1, 'sistem');";
pub const SEED_ASPEK_SQL: &str = "INSERT OR IGNORE INTO hr_kinerja_aspek (id_aspek, id_template, nama, tipe, bobot, panduan, urutan) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7);";
/// Penanda Kepala TU untuk penilai bawaan tendik (Q-103), tersinkron.
pub const SEED_TUGAS_KA_TU_SQL: &str = "INSERT OR IGNORE INTO hr_tugas_jenis (id_jenis, nama, ekuivalen_jp) VALUES ('tgs-ka-tu', 'Kepala Tata Usaha', 0);";
pub const PENGATURAN_KINERJA_SQL: &str = "SELECT key, value FROM setting_gex_system WHERE key IN ('hr_kinerja_ambang', 'hr_kinerja_predikat', 'hr_kinerja_tanpa_kbm') ORDER BY key;";

// SQL penilaian (5b). Penjaga keadaan memakai ?1 = id_penilaian.

/// Belum Final dan belum Batal.
/// Fragmen penjaga; statement di bawah memuat salinannya (diuji).
#[cfg(test)]
pub const TERBUKA_SQL: &str = "NOT EXISTS (SELECT 1 FROM hr_kinerja_keputusan k WHERE k.id_penilaian = ?1 AND k.jenis IN ('Final', 'Batal'))";
/// Draf: terbuka, dan keputusan Ajukan/Kembalikan terakhir bukan Ajukan.
/// Fragmen penjaga; statement di bawah memuat salinannya (diuji).
#[cfg(test)]
pub const DRAF_SQL: &str = "NOT EXISTS (SELECT 1 FROM hr_kinerja_keputusan k WHERE k.id_penilaian = ?1 AND k.jenis IN ('Final', 'Batal')) AND COALESCE((SELECT a.jenis FROM hr_kinerja_keputusan a WHERE a.id_penilaian = ?1 AND a.jenis IN ('Ajukan', 'Kembalikan') ORDER BY a.urut DESC LIMIT 1), '') <> 'Ajukan'";
/// Diajukan: terbuka, dan keputusan Ajukan/Kembalikan terakhir adalah Ajukan.
/// Fragmen penjaga; statement di bawah memuat salinannya (diuji).
#[cfg(test)]
pub const DIAJUKAN_SQL: &str = "NOT EXISTS (SELECT 1 FROM hr_kinerja_keputusan k WHERE k.id_penilaian = ?1 AND k.jenis IN ('Final', 'Batal')) AND COALESCE((SELECT a.jenis FROM hr_kinerja_keputusan a WHERE a.id_penilaian = ?1 AND a.jenis IN ('Ajukan', 'Kembalikan') ORDER BY a.urut DESC LIMIT 1), '') = 'Ajukan'";

pub const TAHUN_AJARAN_SQL: &str = "SELECT id_tahun_ajaran, nama_tahun, semester, tanggal_mulai, tanggal_selesai FROM akademik_tahun_ajaran ORDER BY tanggal_mulai, id_tahun_ajaran\n-- batas: dua semester per tahun ajaran sekolah\n;";
/// Pegawai (bukan siswa) untuk penilaian; ?1 kosong = semua. Atasan hanya
/// bila aktif dan belum keluar.
pub const KINERJA_PEGAWAI_SQL: &str = "SELECT m.id_unik, m.nama, COALESCE(m.unit, '') AS unit, COALESCE(m.divisi, '') AS divisi, CASE WHEN g.id_guru IS NOT NULL OR LOWER(TRIM(COALESCE(m.jenis_personil, ''))) = 'guru' THEN 'Guru' ELSE 'Tendik' END AS kelompok, s.hari_kerja, s.kode_shift, COALESCE(m.tanggal_daftar, '') AS tanggal_daftar, COALESCE(m.id_keluar, '') AS id_keluar, COALESCE(m.tanggal_selesai_aktif, '') AS tanggal_selesai_aktif, COALESCE(m.status_aktif, 'Aktif') AS status_aktif, CASE WHEN EXISTS (SELECT 1 FROM master_data a WHERE a.id_unik = m.id_atasan AND a.status_aktif = 'Aktif' AND a.id_keluar IS NULL) THEN m.id_atasan ELSE '' END AS id_atasan, COALESCE(j.nama, m.jabatan_status, '') AS jabatan FROM master_data m LEFT JOIN guru_data g ON g.id_guru = m.id_unik LEFT JOIN tbl_shift s ON s.id_shift = m.id_shift LEFT JOIN hr_jabatan j ON j.id_jabatan = m.id_jabatan WHERE (?1 = '' OR m.id_unik = ?1) AND LOWER(TRIM(COALESCE(m.jenis_personil, ''))) <> 'siswa' AND NOT EXISTS (SELECT 1 FROM siswa_data sd WHERE sd.id_siswa = m.id_unik) ORDER BY m.nama, m.id_unik\n-- batas: pegawai sekolah (guru dan tendik), dibatasi jumlah personil lembaga\n;";
/// Kolom `LAPORAN_KEHADIRAN_SQL.hari` apa adanya + saringan satu pegawai
/// (?3), bukan `GATE_SUMMARY_SUBQUERY` (§23.1 temuan 1).
pub const KINERJA_HARI_SQL: &str = "SELECT json_object('id', id_karyawan, 'tanggal', tanggal, 'hadir', MAX(CASE WHEN (COALESCE(TRIM(jam_masuk), '') <> '' AND COALESCE(status_kehadiran, '') <> 'Alfa') OR status_kehadiran IN ('Hadir', 'Terlambat') THEN 1 ELSE 0 END), 'telat', MAX(COALESCE(menit_terlambat, 0)), 'menit', SUM(COALESCE(menit_terlambat, 0)), 'sakit', MAX(CASE WHEN status_kehadiran = 'Sakit' THEN 1 ELSE 0 END), 'izin', MAX(CASE WHEN status_kehadiran = 'Izin' THEN 1 ELSE 0 END), 'dispensasi', MAX(CASE WHEN status_kehadiran IN ('Dispen', 'Dispensasi') THEN 1 ELSE 0 END), 'alfa', MAX(CASE WHEN status_kehadiran = 'Alfa' THEN 1 ELSE 0 END)) FROM absensi_harian WHERE id_karyawan = ?3 AND tanggal BETWEEN ?1 AND ?2 GROUP BY id_karyawan, tanggal ORDER BY tanggal\n-- batas: satu baris per tanggal dalam satu periode penilaian\n;";
/// Kolom `PENGAJUAN_RENTANG_SQL` + satu pegawai (?3), predikat
/// `PENGAJUAN_BERLAKU_SQL` harfiah.
pub const KINERJA_PENGAJUAN_SQL: &str = "SELECT p.id_pengajuan, p.id_karyawan, p.tanggal_mulai, p.tanggal_selesai, p.kelompok, p.dampak_gaji, p.potong_jatah, p.jam_mulai_ke, p.jam_sampai_ke, p.setengah_hari FROM hr_pengajuan p WHERE p.id_karyawan = ?3 AND p.tanggal_mulai <= ?2 AND p.tanggal_selesai >= ?1 AND NOT EXISTS (SELECT 1 FROM hr_pengajuan_keputusan b WHERE b.id_pengajuan = p.id_pengajuan AND b.jenis = 'Batal') AND (SELECT k.jenis FROM hr_pengajuan_keputusan k WHERE k.id_pengajuan = p.id_pengajuan AND k.sidik = p.sidik AND k.jenis IN ('Setujui', 'Tolak', 'Setujui Urgent') ORDER BY k.diterima_cloud IS NULL, k.diterima_cloud, k.waktu_perangkat, k.id_keputusan LIMIT 1) IN ('Setujui', 'Setujui Urgent') ORDER BY p.tanggal_mulai, p.id_pengajuan\n-- batas: pengajuan satu pegawai dalam satu periode penilaian\n;";
/// Pengajuan Menunggu (tanpa keputusan atas sidik kini) per pegawai dalam
/// rentang; ?3 kosong = semua. Tanda `pengajuan_menunggu`.
pub const KINERJA_MENUNGGU_SQL: &str = "SELECT p.id_karyawan, COUNT(*) AS jumlah FROM hr_pengajuan p WHERE (?3 = '' OR p.id_karyawan = ?3) AND p.tanggal_mulai <= ?2 AND p.tanggal_selesai >= ?1 AND NOT EXISTS (SELECT 1 FROM hr_pengajuan_keputusan b WHERE b.id_pengajuan = p.id_pengajuan AND b.jenis = 'Batal') AND NOT EXISTS (SELECT 1 FROM hr_pengajuan_keputusan k WHERE k.id_pengajuan = p.id_pengajuan AND k.sidik = p.sidik AND k.jenis IN ('Setujui', 'Tolak', 'Setujui Urgent')) GROUP BY p.id_karyawan ORDER BY p.id_karyawan\n-- batas: satu baris per pegawai\n;";
/// Salinan harfiah `KEPALA_UNIT_SQL` dengan jenis tugas `tgs-ka-tu` (Q-103).
pub const KEPALA_TU_SQL: &str = "SELECT LOWER(TRIM(COALESCE(t.unit, ''))) AS kunci_unit, COALESCE(t.unit, '') AS unit, t.id_karyawan, m.nama, COALESCE(g.gelar, '') AS gelar, COALESCE(g.nip, '') AS nip FROM hr_tugas_tambahan t JOIN master_data m ON m.id_unik = t.id_karyawan LEFT JOIN guru_data g ON g.id_guru = t.id_karyawan WHERE t.id_jenis = 'tgs-ka-tu' AND t.dibatalkan_pada IS NULL AND t.tanggal_mulai <= ?1 AND (COALESCE(t.tanggal_selesai, '') = '' OR t.tanggal_selesai >= ?1) AND NOT EXISTS (SELECT 1 FROM hr_tugas_tambahan b WHERE b.id_jenis = 'tgs-ka-tu' AND b.dibatalkan_pada IS NULL AND b.tanggal_mulai <= ?1 AND (COALESCE(b.tanggal_selesai, '') = '' OR b.tanggal_selesai >= ?1) AND LOWER(TRIM(COALESCE(b.unit, ''))) = LOWER(TRIM(COALESCE(t.unit, ''))) AND (b.tanggal_mulai > t.tanggal_mulai OR (b.tanggal_mulai = t.tanggal_mulai AND b.id_tugas > t.id_tugas))) ORDER BY 1\n-- batas: satu kepala per unit sekolah\n;";
/// SP yang berlaku pada suatu saat di dalam periode (Q-109, informasi).
pub const KINERJA_SP_SQL: &str = "SELECT id_sp, tingkat, tanggal, berlaku_sampai, COALESCE(nomor, '') AS nomor, pelanggaran FROM hr_sp WHERE id_karyawan = ?1 AND dicabut_pada IS NULL AND tanggal <= ?3 AND berlaku_sampai >= ?2 ORDER BY tanggal, id_sp\n-- batas: surat peringatan satu pegawai\n;";

pub const PENILAIAN_SATU_SQL: &str = "SELECT p.id_penilaian, p.id_karyawan, COALESCE(m.nama, p.id_karyawan) AS nama, COALESCE(p.id_ref, '') AS id_ref, COALESCE(p.alasan_koreksi, '') AS alasan_koreksi, p.periode_jenis, p.periode_kunci, p.periode_nama, p.periode_mulai, p.periode_selesai, p.id_template, p.template_nama, p.kelompok, COALESCE(p.unit, '') AS unit, COALESCE(p.jabatan, '') AS jabatan, COALESCE(p.status_kepegawaian, '') AS status_kepegawaian, COALESCE(p.id_penilai, '') AS id_penilai, COALESCE(p.penilai_nama, '') AS penilai_nama, p.penilai_oleh, COALESCE(p.catatan, '') AS catatan, COALESCE(p.dihitung_sampai, '') AS dihitung_sampai, p.dibuat_oleh, p.created_at, p.updated_at FROM hr_kinerja_penilaian p LEFT JOIN master_data m ON m.id_unik = p.id_karyawan WHERE p.id_penilaian = ?1;";
pub const PENILAIAN_PERIODE_SQL: &str = "SELECT p.id_penilaian, p.id_karyawan, COALESCE(m.nama, p.id_karyawan) AS nama, COALESCE(p.id_ref, '') AS id_ref, COALESCE(p.alasan_koreksi, '') AS alasan_koreksi, p.periode_jenis, p.periode_kunci, p.periode_nama, p.periode_mulai, p.periode_selesai, p.id_template, p.template_nama, p.kelompok, COALESCE(p.unit, '') AS unit, COALESCE(p.jabatan, '') AS jabatan, COALESCE(p.status_kepegawaian, '') AS status_kepegawaian, COALESCE(p.id_penilai, '') AS id_penilai, COALESCE(p.penilai_nama, '') AS penilai_nama, p.penilai_oleh, COALESCE(p.catatan, '') AS catatan, COALESCE(p.dihitung_sampai, '') AS dihitung_sampai, p.dibuat_oleh, p.created_at, p.updated_at FROM hr_kinerja_penilaian p LEFT JOIN master_data m ON m.id_unik = p.id_karyawan WHERE p.periode_jenis = ?1 AND p.periode_kunci = ?2 ORDER BY nama, p.created_at, p.id_penilaian\n-- batas: satu penilaian akar per pegawai per periode, ditambah koreksinya\n;";
pub const PENILAIAN_PEGAWAI_SQL: &str = "SELECT p.id_penilaian, p.id_karyawan, COALESCE(m.nama, p.id_karyawan) AS nama, COALESCE(p.id_ref, '') AS id_ref, COALESCE(p.alasan_koreksi, '') AS alasan_koreksi, p.periode_jenis, p.periode_kunci, p.periode_nama, p.periode_mulai, p.periode_selesai, p.id_template, p.template_nama, p.kelompok, COALESCE(p.unit, '') AS unit, COALESCE(p.jabatan, '') AS jabatan, COALESCE(p.status_kepegawaian, '') AS status_kepegawaian, COALESCE(p.id_penilai, '') AS id_penilai, COALESCE(p.penilai_nama, '') AS penilai_nama, p.penilai_oleh, COALESCE(p.catatan, '') AS catatan, COALESCE(p.dihitung_sampai, '') AS dihitung_sampai, p.dibuat_oleh, p.created_at, p.updated_at FROM hr_kinerja_penilaian p LEFT JOIN master_data m ON m.id_unik = p.id_karyawan WHERE p.id_karyawan = ?1 ORDER BY p.periode_mulai DESC, p.created_at, p.id_penilaian\n-- batas: dua penilaian per tahun sepanjang masa kerja satu pegawai\n;";
/// Akar ?1 dan koreksinya.
pub const KELUARGA_SQL: &str = "SELECT p.id_penilaian, p.id_karyawan, COALESCE(m.nama, p.id_karyawan) AS nama, COALESCE(p.id_ref, '') AS id_ref, COALESCE(p.alasan_koreksi, '') AS alasan_koreksi, p.periode_jenis, p.periode_kunci, p.periode_nama, p.periode_mulai, p.periode_selesai, p.id_template, p.template_nama, p.kelompok, COALESCE(p.unit, '') AS unit, COALESCE(p.jabatan, '') AS jabatan, COALESCE(p.status_kepegawaian, '') AS status_kepegawaian, COALESCE(p.id_penilai, '') AS id_penilai, COALESCE(p.penilai_nama, '') AS penilai_nama, p.penilai_oleh, COALESCE(p.catatan, '') AS catatan, COALESCE(p.dihitung_sampai, '') AS dihitung_sampai, p.dibuat_oleh, p.created_at, p.updated_at FROM hr_kinerja_penilaian p LEFT JOIN master_data m ON m.id_unik = p.id_karyawan WHERE p.id_penilaian = ?1 OR p.id_ref = ?1 ORDER BY p.created_at, p.id_penilaian\n-- batas: satu penilaian akar dan koreksinya\n;";
/// ?1 = larik JSON id penilaian.
pub const KEPUTUSAN_KINERJA_SQL: &str = "SELECT k.id_keputusan, k.id_penilaian, k.urut, k.jenis, COALESCE(k.alasan, '') AS alasan, k.nilai_akhir, COALESCE(k.predikat, '') AS predikat, k.oleh, COALESCE(k.id_karyawan_oleh, '') AS id_karyawan_oleh, k.created_at FROM hr_kinerja_keputusan k WHERE k.id_penilaian IN (SELECT value FROM json_each(?1)) ORDER BY k.id_penilaian, k.urut\n-- batas: beberapa keputusan per penilaian yang dibaca\n;";
/// ?1 = larik JSON id penilaian.
pub const NILAI_KINERJA_SQL: &str = "SELECT id_penilaian, id_aspek, aspek_nama, tipe, bobot, urutan, skor, skor_hitung, catatan, rincian FROM hr_kinerja_nilai WHERE id_penilaian IN (SELECT value FROM json_each(?1)) ORDER BY id_penilaian, urutan, id_aspek\n-- batas: paling banyak 20 aspek per penilaian yang dibaca\n;";
/// Akar hidup (tidak dibatalkan) yang bertumpuk dengan ?1..?2; ?3 kosong =
/// semua pegawai.
pub const AKAR_RENTANG_SQL: &str = "SELECT x.id_penilaian, x.id_karyawan, x.periode_mulai, x.periode_selesai FROM hr_kinerja_penilaian x WHERE x.id_ref IS NULL AND x.periode_mulai <= ?2 AND x.periode_selesai >= ?1 AND (?3 = '' OR x.id_karyawan = ?3) AND NOT EXISTS (SELECT 1 FROM hr_kinerja_keputusan b WHERE b.id_penilaian = x.id_penilaian AND b.jenis = 'Batal') ORDER BY x.id_karyawan, x.periode_mulai\n-- batas: satu penilaian akar per pegawai per periode\n;";
pub const KEPUTUSAN_ADA_SQL: &str = "SELECT 1 FROM hr_kinerja_keputusan WHERE id_keputusan = ?1;";

/// Penilaian akar baru; tumpang tindih ditolak di statement yang sama
/// (Q-94). ?16 penilai_oleh juga menjadi `dibuat_oleh`.
pub const BUAT_PENILAIAN_SQL: &str = "INSERT INTO hr_kinerja_penilaian (id_penilaian, id_karyawan, id_ref, alasan_koreksi, periode_jenis, periode_kunci, periode_nama, periode_mulai, periode_selesai, id_template, template_nama, kelompok, unit, jabatan, status_kepegawaian, id_penilai, penilai_nama, penilai_oleh, catatan, dihitung_sampai, dibuat_oleh, created_at, updated_at) SELECT ?1, ?2, NULL, NULL, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?16, datetime('now'), datetime('now') WHERE NOT EXISTS (SELECT 1 FROM hr_kinerja_penilaian x WHERE x.id_karyawan = ?2 AND x.id_ref IS NULL AND x.periode_mulai <= ?7 AND x.periode_selesai >= ?6 AND NOT EXISTS (SELECT 1 FROM hr_kinerja_keputusan b WHERE b.id_penilaian = x.id_penilaian AND b.jenis = 'Batal'));";
/// Koreksi atas akar ?10: hanya bila akar Final, tidak Batal, dan tanpa
/// koreksi terbuka.
pub const KOREKSI_PENILAIAN_SQL: &str = "INSERT INTO hr_kinerja_penilaian (id_penilaian, id_karyawan, id_ref, alasan_koreksi, periode_jenis, periode_kunci, periode_nama, periode_mulai, periode_selesai, id_template, template_nama, kelompok, unit, jabatan, status_kepegawaian, id_penilai, penilai_nama, penilai_oleh, catatan, dihitung_sampai, dibuat_oleh, created_at, updated_at) SELECT ?1, a.id_karyawan, a.id_penilaian, ?2, a.periode_jenis, a.periode_kunci, a.periode_nama, a.periode_mulai, a.periode_selesai, ?3, ?4, a.kelompok, a.unit, a.jabatan, a.status_kepegawaian, ?5, ?6, ?7, ?8, ?9, ?7, datetime('now'), datetime('now') FROM hr_kinerja_penilaian a WHERE a.id_penilaian = ?10 AND a.id_ref IS NULL AND EXISTS (SELECT 1 FROM hr_kinerja_keputusan f WHERE f.id_penilaian = a.id_penilaian AND f.jenis = 'Final') AND NOT EXISTS (SELECT 1 FROM hr_kinerja_keputusan b WHERE b.id_penilaian = a.id_penilaian AND b.jenis = 'Batal') AND NOT EXISTS (SELECT 1 FROM hr_kinerja_penilaian x WHERE x.id_ref = a.id_penilaian AND NOT EXISTS (SELECT 1 FROM hr_kinerja_keputusan k WHERE k.id_penilaian = x.id_penilaian AND k.jenis IN ('Final', 'Batal')));";
pub const UBAH_PENILAIAN_SQL: &str = "UPDATE hr_kinerja_penilaian SET id_template = ?2, template_nama = ?3, id_penilai = ?4, penilai_nama = ?5, penilai_oleh = ?6, catatan = ?7, dihitung_sampai = ?8, updated_at = datetime('now') WHERE id_penilaian = ?1 AND NOT EXISTS (SELECT 1 FROM hr_kinerja_keputusan k WHERE k.id_penilaian = ?1 AND k.jenis IN ('Final', 'Batal')) AND COALESCE((SELECT a.jenis FROM hr_kinerja_keputusan a WHERE a.id_penilaian = ?1 AND a.jenis IN ('Ajukan', 'Kembalikan') ORDER BY a.urut DESC LIMIT 1), '') <> 'Ajukan';";
pub const SAMPAI_PENILAIAN_SQL: &str = "UPDATE hr_kinerja_penilaian SET dihitung_sampai = ?2, updated_at = datetime('now') WHERE id_penilaian = ?1 AND NOT EXISTS (SELECT 1 FROM hr_kinerja_keputusan k WHERE k.id_penilaian = ?1 AND k.jenis IN ('Final', 'Batal')) AND COALESCE((SELECT a.jenis FROM hr_kinerja_keputusan a WHERE a.id_penilaian = ?1 AND a.jenis IN ('Ajukan', 'Kembalikan') ORDER BY a.urut DESC LIMIT 1), '') <> 'Ajukan';";
/// Baris nilai hanya ditulis ulang selama Draf.
pub const HAPUS_NILAI_SQL: &str = "DELETE FROM hr_kinerja_nilai WHERE id_penilaian = ?1 AND NOT EXISTS (SELECT 1 FROM hr_kinerja_keputusan k WHERE k.id_penilaian = ?1 AND k.jenis IN ('Final', 'Batal')) AND COALESCE((SELECT a.jenis FROM hr_kinerja_keputusan a WHERE a.id_penilaian = ?1 AND a.jenis IN ('Ajukan', 'Kembalikan') ORDER BY a.urut DESC LIMIT 1), '') <> 'Ajukan';";
pub const SIMPAN_NILAI_SQL: &str = "INSERT INTO hr_kinerja_nilai (id_nilai, id_penilaian, id_aspek, aspek_nama, tipe, bobot, urutan, skor, skor_hitung, catatan, rincian) SELECT ?1 || ':' || ?2, ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10 WHERE EXISTS (SELECT 1 FROM hr_kinerja_penilaian p WHERE p.id_penilaian = ?1) AND NOT EXISTS (SELECT 1 FROM hr_kinerja_keputusan k WHERE k.id_penilaian = ?1 AND k.jenis IN ('Final', 'Batal')) AND COALESCE((SELECT a.jenis FROM hr_kinerja_keputusan a WHERE a.id_penilaian = ?1 AND a.jenis IN ('Ajukan', 'Kembalikan') ORDER BY a.urut DESC LIMIT 1), '') <> 'Ajukan';";
/// Keputusan append-only; `urut` = MAX + 1 di statement yang sama.
/// Ajukan dijaga `DRAF_SQL`.
pub const KEPUTUSAN_DRAF_SQL: &str = "INSERT INTO hr_kinerja_keputusan (id_keputusan, id_penilaian, urut, jenis, alasan, nilai_akhir, predikat, oleh, id_karyawan_oleh, created_at) SELECT ?2, ?1, (SELECT COALESCE(MAX(u.urut), 0) + 1 FROM hr_kinerja_keputusan u WHERE u.id_penilaian = ?1), ?3, ?4, ?5, ?6, ?7, ?8, datetime('now') WHERE EXISTS (SELECT 1 FROM hr_kinerja_penilaian p WHERE p.id_penilaian = ?1) AND NOT EXISTS (SELECT 1 FROM hr_kinerja_keputusan k WHERE k.id_penilaian = ?1 AND k.jenis IN ('Final', 'Batal')) AND COALESCE((SELECT a.jenis FROM hr_kinerja_keputusan a WHERE a.id_penilaian = ?1 AND a.jenis IN ('Ajukan', 'Kembalikan') ORDER BY a.urut DESC LIMIT 1), '') <> 'Ajukan';";
/// Kembalikan dan Final dijaga `DIAJUKAN_SQL`.
pub const KEPUTUSAN_DIAJUKAN_SQL: &str = "INSERT INTO hr_kinerja_keputusan (id_keputusan, id_penilaian, urut, jenis, alasan, nilai_akhir, predikat, oleh, id_karyawan_oleh, created_at) SELECT ?2, ?1, (SELECT COALESCE(MAX(u.urut), 0) + 1 FROM hr_kinerja_keputusan u WHERE u.id_penilaian = ?1), ?3, ?4, ?5, ?6, ?7, ?8, datetime('now') WHERE NOT EXISTS (SELECT 1 FROM hr_kinerja_keputusan k WHERE k.id_penilaian = ?1 AND k.jenis IN ('Final', 'Batal')) AND COALESCE((SELECT a.jenis FROM hr_kinerja_keputusan a WHERE a.id_penilaian = ?1 AND a.jenis IN ('Ajukan', 'Kembalikan') ORDER BY a.urut DESC LIMIT 1), '') = 'Ajukan';";
/// Batal dijaga `TERBUKA_SQL`.
pub const KEPUTUSAN_TERBUKA_SQL: &str = "INSERT INTO hr_kinerja_keputusan (id_keputusan, id_penilaian, urut, jenis, alasan, nilai_akhir, predikat, oleh, id_karyawan_oleh, created_at) SELECT ?2, ?1, (SELECT COALESCE(MAX(u.urut), 0) + 1 FROM hr_kinerja_keputusan u WHERE u.id_penilaian = ?1), ?3, ?4, ?5, ?6, ?7, ?8, datetime('now') WHERE NOT EXISTS (SELECT 1 FROM hr_kinerja_keputusan k WHERE k.id_penilaian = ?1 AND k.jenis IN ('Final', 'Batal'));";

// Template bawaan (seed cloud v71)

const TEMPLATE_BAWAAN_JSON: &str = include_str!("../../../src/lib/validations/hr-kinerja-template-bawaan.json");

#[derive(Debug, Clone, Deserialize)]
pub struct AspekBawaan {
    pub id_aspek: String,
    pub nama: String,
    pub tipe: String,
    pub bobot: i64,
    pub panduan: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TemplateBawaan {
    pub id_template: String,
    pub nama: String,
    pub kelompok: String,
    pub keterangan: String,
    pub aspek: Vec<AspekBawaan>,
}

pub fn template_bawaan() -> Vec<TemplateBawaan> {
    serde_json::from_str(TEMPLATE_BAWAAN_JSON).expect("hr-kinerja-template-bawaan.json sah")
}

/// Cermin `seedKinerja`: template, aspeknya, lalu `tgs-ka-tu`.
pub fn seed_statements() -> Vec<Statement> {
    let mut hasil = Vec::new();
    for t in template_bawaan() {
        hasil.push(Statement::new(
            SEED_TEMPLATE_SQL,
            vec![json!(t.id_template), json!(t.nama), json!(t.kelompok), json!(t.keterangan)],
        ));
        for (urutan, a) in t.aspek.iter().enumerate() {
            hasil.push(Statement::new(
                SEED_ASPEK_SQL,
                vec![
                    json!(a.id_aspek),
                    json!(t.id_template),
                    json!(a.nama),
                    json!(a.tipe),
                    json!(a.bobot),
                    json!(a.panduan),
                    json!(urutan as i64),
                ],
            ));
        }
    }
    hasil.push(Statement::new(SEED_TUGAS_KA_TU_SQL, vec![]));
    hasil
}

// Template

fn panjang(teks: &str) -> usize {
    teks.chars().count()
}

fn teks_draft(draft: &Value, kunci: &str) -> String {
    draft.get(kunci).and_then(Value::as_str).unwrap_or_default().to_owned()
}

fn bendera(draft: &Value, kunci: &str) -> bool {
    draft.get(kunci).and_then(Value::as_bool).unwrap_or(false)
}

fn kosong_jadi_none(teks: &str) -> Option<String> {
    let t = teks.trim();
    (!t.is_empty()).then(|| t.to_owned())
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct AspekSah {
    pub id_aspek: Option<String>,
    pub nama: String,
    pub tipe: String,
    pub bobot: i64,
    pub panduan: Option<String>,
    pub urutan: i64,
    pub is_aktif: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct TemplateSah {
    pub id_template: Option<String>,
    pub nama: String,
    pub kelompok: String,
    pub keterangan: Option<String>,
    pub is_bawaan: bool,
    pub is_aktif: bool,
    pub aspek: Vec<AspekSah>,
}

/// Cermin `validasiTemplate`; urutan pemeriksaan dan pesannya sama.
pub fn validasi_template(draft: &Value) -> Result<TemplateSah, String> {
    let nama = teks_draft(draft, "nama").trim().to_owned();
    if nama.is_empty() {
        return Err("Nama template wajib diisi.".into());
    }
    if panjang(&nama) > MAKS_NAMA_TEMPLATE {
        return Err(format!("Nama template maksimal {MAKS_NAMA_TEMPLATE} karakter."));
    }
    let kelompok = teks_draft(draft, "kelompok");
    if !KELOMPOK_KINERJA.contains(&kelompok.as_str()) {
        return Err("Kelompok template harus Guru atau Tendik.".into());
    }
    let keterangan = kosong_jadi_none(&teks_draft(draft, "keterangan"));
    if keterangan.as_deref().is_some_and(|k| panjang(k) > MAKS_KETERANGAN) {
        return Err(format!("Keterangan maksimal {MAKS_KETERANGAN} karakter."));
    }
    let is_bawaan = bendera(draft, "is_bawaan");
    let is_aktif = bendera(draft, "is_aktif");
    if is_bawaan && !is_aktif {
        return Err("Template bawaan tidak bisa dinonaktifkan.".into());
    }
    let daftar = draft.get("aspek").and_then(Value::as_array).cloned().unwrap_or_default();
    if daftar.len() > MAKS_ASPEK {
        return Err(format!("Aspek paling banyak {MAKS_ASPEK}."));
    }

    let mut aspek = Vec::new();
    let mut nama_dipakai = HashSet::new();
    for (urutan, a) in daftar.iter().enumerate() {
        let nama_aspek = teks_draft(a, "nama").trim().to_owned();
        if nama_aspek.is_empty() {
            return Err("Nama aspek wajib diisi.".into());
        }
        if panjang(&nama_aspek) > MAKS_NAMA_ASPEK {
            return Err(format!("Nama aspek maksimal {MAKS_NAMA_ASPEK} karakter."));
        }
        let tipe = teks_draft(a, "tipe");
        if !TIPE_ASPEK.contains(&tipe.as_str()) {
            return Err(format!("Tipe aspek \"{tipe}\" tidak dikenal."));
        }
        if kelompok == "Tendik" && TIPE_KHUSUS_GURU.contains(&tipe.as_str()) {
            return Err(format!("Aspek {tipe} hanya untuk template Guru."));
        }
        let bobot = a.get("bobot").and_then(Value::as_i64).filter(|b| (1..=TOTAL_BOBOT).contains(b));
        let Some(bobot) = bobot else {
            return Err(format!("Bobot aspek \"{nama_aspek}\" harus bilangan bulat 1 sampai 100."));
        };
        let panduan = kosong_jadi_none(&teks_draft(a, "panduan"));
        if panduan.as_deref().is_some_and(|p| panjang(p) > MAKS_PANDUAN) {
            return Err(format!("Panduan aspek \"{nama_aspek}\" maksimal {MAKS_PANDUAN} karakter."));
        }
        if !nama_dipakai.insert(nama_aspek.to_lowercase()) {
            return Err(format!("Nama aspek \"{nama_aspek}\" dipakai dua kali."));
        }
        aspek.push(AspekSah {
            id_aspek: kosong_jadi_none(&teks_draft(a, "id_aspek")),
            nama: nama_aspek,
            tipe,
            bobot,
            panduan,
            urutan: urutan as i64,
            is_aktif: bendera(a, "is_aktif"),
        });
    }

    let aktif: Vec<&AspekSah> = aspek.iter().filter(|a| a.is_aktif).collect();
    if aktif.is_empty() {
        return Err("Template butuh paling sedikit satu aspek aktif.".into());
    }
    if aktif.len() > MAKS_ASPEK_AKTIF {
        return Err(format!("Aspek aktif paling banyak {MAKS_ASPEK_AKTIF}."));
    }
    for tipe in TIPE_ASPEK.iter().filter(|t| **t != TIPE_MANUAL) {
        if aktif.iter().filter(|a| a.tipe == *tipe).count() > 1 {
            return Err(format!("Aspek {tipe} hanya boleh satu per template."));
        }
    }
    let total: i64 = aktif.iter().map(|a| a.bobot).sum();
    if total != TOTAL_BOBOT {
        return Err(format!("Total bobot aspek aktif harus 100, sekarang {total}."));
    }

    Ok(TemplateSah {
        id_template: kosong_jadi_none(&teks_draft(draft, "id_template")),
        nama,
        kelompok,
        keterangan,
        is_bawaan,
        is_aktif,
        aspek,
    })
}

/// Cermin `periksaTemplateLama`: kelompok, tipe aspek, dan keberadaan aspek
/// lama terkunci. `kelompok_lama` `None` = template baru.
pub fn periksa_template_lama(
    baru: &TemplateSah,
    kelompok_lama: Option<&str>,
    aspek_lama: &[(String, String)],
) -> Result<(), String> {
    if kelompok_lama.is_some_and(|k| k != baru.kelompok) {
        return Err("Kelompok template tidak bisa diubah.".into());
    }
    let lama: HashMap<&str, &str> = aspek_lama.iter().map(|(id, tipe)| (id.as_str(), tipe.as_str())).collect();
    for a in &baru.aspek {
        let Some(id) = a.id_aspek.as_deref() else {
            continue;
        };
        match lama.get(id) {
            None => return Err("Aspek tidak dikenal untuk template ini.".into()),
            Some(tipe) if *tipe != a.tipe => {
                return Err(format!("Tipe aspek \"{}\" tidak bisa diubah.", a.nama));
            }
            Some(_) => {}
        }
    }
    let dikirim: HashSet<&str> = baru.aspek.iter().filter_map(|a| a.id_aspek.as_deref()).collect();
    if lama.keys().any(|id| !dikirim.contains(id)) {
        return Err("Aspek tidak bisa dihapus; nonaktifkan saja.".into());
    }
    Ok(())
}

// Pengaturan

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Predikat {
    pub ambang: i64,
    pub nama: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct RentangTanpaKbm {
    pub mulai: String,
    pub selesai: String,
    pub nama: String,
}

fn angka_sah(teks: &str) -> Option<i64> {
    if teks.is_empty() || !teks.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    teks.parse().ok()
}

/// Cermin `validasiAmbang`: bentuk kanonik `950,900,800,700`.
pub fn validasi_ambang(teks: &str) -> Result<String, String> {
    let bagian: Vec<&str> = teks.split(',').map(str::trim).collect();
    let angka: Vec<i64> = bagian.iter().filter_map(|s| angka_sah(s)).collect();
    if bagian.len() != 4 || angka.len() != 4 {
        return Err(PESAN_AMBANG.into());
    }
    for (i, a) in angka.iter().enumerate() {
        if !(1..=1000).contains(a) || (i > 0 && *a >= angka[i - 1]) {
            return Err(PESAN_AMBANG.into());
        }
    }
    Ok(angka.iter().map(i64::to_string).collect::<Vec<_>>().join(","))
}

/// Cermin `parseAmbang`: kosong atau rusak = bawaan.
pub fn parse_ambang(nilai: Option<&str>) -> [i64; 4] {
    match nilai.map(validasi_ambang) {
        Some(Ok(kanonik)) => {
            let a: Vec<i64> = kanonik.split(',').filter_map(|s| s.parse().ok()).collect();
            [a[0], a[1], a[2], a[3]]
        }
        _ => AMBANG_BAWAAN,
    }
}

/// Cermin `validasiPredikat`: bentuk kanonik `9100:Amat Baik|…|0:Kurang`.
pub fn validasi_predikat(teks: &str) -> Result<String, String> {
    let bagian: Vec<&str> = teks.split('|').collect();
    if bagian.len() < MIN_PREDIKAT || bagian.len() > MAKS_PREDIKAT {
        return Err(PESAN_PREDIKAT.into());
    }
    let mut daftar: Vec<Predikat> = Vec::new();
    for b in bagian {
        let Some((ambang_teks, nama)) = b.split_once(':') else {
            return Err(PESAN_PREDIKAT.into());
        };
        let Some(ambang) = angka_sah(ambang_teks.trim()) else {
            return Err(PESAN_PREDIKAT.into());
        };
        if ambang > 10000 {
            return Err(PESAN_PREDIKAT.into());
        }
        let nama = nama.trim();
        if nama.is_empty() || panjang(nama) > MAKS_NAMA_PREDIKAT || nama.contains(':') {
            return Err(PESAN_NAMA_PREDIKAT.into());
        }
        if daftar.last().is_some_and(|p| ambang >= p.ambang) {
            return Err(PESAN_PREDIKAT.into());
        }
        daftar.push(Predikat { ambang, nama: nama.to_owned() });
    }
    if daftar.last().map(|p| p.ambang) != Some(0) {
        return Err(PESAN_PREDIKAT.into());
    }
    Ok(daftar
        .iter()
        .map(|p| format!("{}:{}", p.ambang, p.nama))
        .collect::<Vec<_>>()
        .join("|"))
}

fn urai_predikat(kanonik: &str) -> Vec<Predikat> {
    kanonik
        .split('|')
        .filter_map(|b| b.split_once(':'))
        .map(|(a, n)| Predikat { ambang: a.parse().unwrap_or(0), nama: n.to_owned() })
        .collect()
}

/// Cermin `parsePredikat`: kosong atau rusak = bawaan.
pub fn parse_predikat(nilai: Option<&str>) -> Vec<Predikat> {
    match nilai.map(validasi_predikat) {
        Some(Ok(kanonik)) => urai_predikat(&kanonik),
        _ => urai_predikat(PREDIKAT_BAWAAN),
    }
}

/// Cermin `predikatNilai`: pasangan pertama yang ambangnya ≤ nilai ×100.
pub fn predikat_nilai(nilai_x100: i64, daftar: &[Predikat]) -> String {
    daftar
        .iter()
        .find(|p| p.ambang <= nilai_x100)
        .or_else(|| daftar.last())
        .map(|p| p.nama.clone())
        .unwrap_or_default()
}

fn bentuk_tanggal(teks: &str) -> bool {
    let b = teks.as_bytes();
    b.len() == 10
        && b.iter().enumerate().all(|(i, c)| if i == 4 || i == 7 { *c == b'-' } else { c.is_ascii_digit() })
}

/// Potongan manual yang sama dengan regex `RENTANG` di TS:
/// `YYYY-MM-DD..YYYY-MM-DD:<apa pun>`.
fn urai_rentang(teks: &str) -> Option<(&str, &str, &str)> {
    let mulai = teks.get(0..10)?;
    let titik = teks.get(10..12)?;
    let selesai = teks.get(12..22)?;
    let pemisah = teks.get(22..23)?;
    let nama = teks.get(23..)?;
    (bentuk_tanggal(mulai) && titik == ".." && bentuk_tanggal(selesai) && pemisah == ":")
        .then_some((mulai, selesai, nama))
}

/// Cermin `validasiTanpaKbm`: kosong sah; bentuk kanonik dipisah `|`.
pub fn validasi_tanpa_kbm(teks: &str) -> Result<String, String> {
    let isi = teks.trim();
    if isi.is_empty() {
        return Ok(String::new());
    }
    let bagian: Vec<&str> = isi.split('|').map(str::trim).collect();
    if bagian.len() > MAKS_RENTANG_KBM {
        return Err(format!("Rentang tanpa KBM paling banyak {MAKS_RENTANG_KBM}."));
    }
    let mut hasil = Vec::new();
    for b in bagian {
        let Some((mulai, selesai, nama)) = urai_rentang(b) else {
            return Err(format!("Rentang \"{b}\" harus berbentuk YYYY-MM-DD..YYYY-MM-DD:Nama."));
        };
        let nama = nama.trim();
        if nama.is_empty() || panjang(nama) > MAKS_NAMA_RENTANG {
            return Err(format!("Nama rentang 1 sampai {MAKS_NAMA_RENTANG} karakter."));
        }
        if !tanggal_valid(mulai) || !tanggal_valid(selesai) {
            return Err(format!("Tanggal rentang \"{nama}\" tidak valid."));
        }
        let hari = days_between(mulai, selesai).map_err(|_| format!("Tanggal rentang \"{nama}\" tidak valid."))?;
        if hari < 0 {
            return Err(format!("Rentang \"{nama}\" berakhir sebelum mulai."));
        }
        if hari + 1 > MAKS_HARI_RENTANG {
            return Err(format!("Rentang \"{nama}\" paling panjang {MAKS_HARI_RENTANG} hari."));
        }
        hasil.push(format!("{mulai}..{selesai}:{nama}"));
    }
    Ok(hasil.join("|"))
}

/// Cermin `parseTanpaKbm`: kosong atau rusak = tanpa rentang.
pub fn parse_tanpa_kbm(nilai: Option<&str>) -> Vec<RentangTanpaKbm> {
    match nilai.map(validasi_tanpa_kbm) {
        Some(Ok(kanonik)) if !kanonik.is_empty() => kanonik
            .split('|')
            .filter_map(urai_rentang)
            .map(|(mulai, selesai, nama)| RentangTanpaKbm {
                mulai: mulai.to_owned(),
                selesai: selesai.to_owned(),
                nama: nama.to_owned(),
            })
            .collect(),
        _ => Vec::new(),
    }
}

/// Cermin `validasiPengaturanKinerja`: ketiga kunci wajib sekaligus, kunci
/// asing ditolak (Web menolaknya lewat Zod `.strict()`).
pub fn validasi_pengaturan_kinerja(draft: &Value) -> Result<Vec<(String, String)>, String> {
    let Some(objek) = draft.as_object() else {
        return Err("Pengaturan kinerja tidak valid.".into());
    };
    if objek.keys().any(|k| !matches!(k.as_str(), "ambang" | "predikat" | "tanpa_kbm")) {
        return Err("Pengaturan kinerja tidak valid.".into());
    }
    let ambang = validasi_ambang(&teks_draft(draft, "ambang"))?;
    let predikat = validasi_predikat(&teks_draft(draft, "predikat"))?;
    let tanpa_kbm = validasi_tanpa_kbm(&teks_draft(draft, "tanpa_kbm"))?;
    Ok(vec![
        (KUNCI_AMBANG.to_owned(), ambang),
        (KUNCI_PREDIKAT.to_owned(), predikat),
        (KUNCI_TANPA_KBM.to_owned(), tanpa_kbm),
    ])
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct PengaturanKinerja {
    pub ambang: [i64; 4],
    pub predikat: Vec<Predikat>,
    pub tanpa_kbm: Vec<RentangTanpaKbm>,
}

/// Cermin `pengaturanKinerja`: nilai berlaku dari `setting_gex_system`.
pub fn pengaturan_kinerja(peta: &HashMap<String, String>) -> PengaturanKinerja {
    PengaturanKinerja {
        ambang: parse_ambang(peta.get(KUNCI_AMBANG).map(String::as_str)),
        predikat: parse_predikat(peta.get(KUNCI_PREDIKAT).map(String::as_str)),
        tanpa_kbm: parse_tanpa_kbm(peta.get(KUNCI_TANPA_KBM).map(String::as_str)),
    }
}

/// Cermin `skorAmbang`: permil ke skor 1–5 lewat (a₅, a₄, a₃, a₂).
pub fn skor_ambang(permil: i64, ambang: &[i64; 4]) -> i64 {
    ambang
        .iter()
        .position(|a| permil >= *a)
        .map_or(1, |i| 5 - i as i64)
}

// Penilaian: aturan murni (5b, §23.2.2–23.2.6)

pub const JENIS_PERIODE: [&str; 2] = ["Semester", "Tahun Ajaran"];
pub const AKSI_SIMPAN: [&str; 4] = ["Buat", "Simpan", "Muat ulang", "Koreksi"];
pub const JENIS_KEPUTUSAN: [&str; 4] = ["Ajukan", "Kembalikan", "Final", "Batal"];
pub const STATUS_DRAF: &str = "Draf";
pub const STATUS_DIAJUKAN: &str = "Diajukan";
pub const STATUS_FINAL: &str = "Final";
pub const STATUS_DIBATALKAN: &str = "Dibatalkan";
pub const MAKS_CATATAN_ASPEK: usize = 1000;
pub const MAKS_CATATAN: usize = 2000;
pub const MAKS_ALASAN: usize = 500;
pub const MAKS_ALASAN_KOREKSI: usize = 1000;
/// Kelompok pengajuan berlaku yang mengeluarkan tanggal dari pembagi (§23.2.3 baris 5).
pub const KELOMPOK_DIKECUALIKAN: [&str; 3] = ["Cuti", "Izin", "Sakit"];
/// Dinas Luar dihitung tepat waktu, seperti laporan sekolah (§23.2.3 baris 4).
pub const KELOMPOK_DINAS_LUAR: &str = "Dinas Luar";

pub const PESAN_IZIN: &str = "Anda tidak punya izin untuk aksi penilaian ini.";
pub const PESAN_OTOMATIS_BERUBAH: &str =
    "Angka aspek otomatis berubah sejak layar dimuat. Periksa angka barunya, lalu ajukan sekali lagi.";
pub const PESAN_KEADAAN_BERUBAH: &str = "Penilaian ini baru saja diubah orang lain. Muat ulang, lalu coba lagi.";
pub const PESAN_BELUM_FINAL_SENDIRI: &str = "Penilaian atas diri Anda baru bisa dilihat sesudah final.";
pub const PESAN_TIDAK_DITEMUKAN: &str = "Penilaian kinerja tidak ditemukan.";

#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct TahunAjaran {
    pub id_tahun_ajaran: String,
    pub nama_tahun: String,
    pub semester: String,
    pub tanggal_mulai: String,
    pub tanggal_selesai: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Periode {
    pub jenis: String,
    pub kunci: String,
    pub nama: String,
    pub mulai: String,
    pub selesai: String,
}

/// Cermin `periodeDariTahunAjaran` (Q-94): `Semester` = satu baris
/// (`kunci` = `id_tahun_ajaran`), `Tahun Ajaran` = semua baris ber-`nama_tahun`
/// sama (`kunci` = `nama_tahun`), rentang MIN mulai..MAX selesai.
pub fn periode_dari_tahun_ajaran(jenis: &str, kunci: &str, baris: &[TahunAjaran]) -> Result<Periode, String> {
    if !JENIS_PERIODE.contains(&jenis) {
        return Err("Jenis periode harus Semester atau Tahun Ajaran.".into());
    }
    let kunci = kunci.trim();
    let semester = jenis == "Semester";
    let dipilih: Vec<&TahunAjaran> = baris
        .iter()
        .filter(|t| if semester { t.id_tahun_ajaran == kunci } else { t.nama_tahun.trim() == kunci })
        .collect();
    let Some(pertama) = dipilih.first().filter(|_| !kunci.is_empty()) else {
        return Err("Periode tidak ditemukan.".into());
    };
    let nama = if semester {
        format!("{} Semester {}", pertama.nama_tahun.trim(), pertama.semester)
    } else {
        format!("Tahun Ajaran {kunci}")
    };
    if dipilih.iter().any(|t| {
        !tanggal_valid(&t.tanggal_mulai) || !tanggal_valid(&t.tanggal_selesai) || t.tanggal_selesai < t.tanggal_mulai
    }) {
        return Err(format!("Tanggal {nama} tidak valid."));
    }
    let mulai = dipilih.iter().map(|t| t.tanggal_mulai.clone()).min().unwrap_or_default();
    let selesai = dipilih.iter().map(|t| t.tanggal_selesai.clone()).max().unwrap_or_default();
    Ok(Periode { jenis: jenis.to_owned(), kunci: kunci.to_owned(), nama, mulai, selesai })
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct RentangAktif {
    pub mulai: String,
    pub akhir: String,
    /// `false` = tanda `periode_tidak_penuh`.
    pub penuh: bool,
}

/// Cermin `rentangAktif` (§23.2.2): periode dipotong tanggal masuk dan, bila
/// pegawai keluar, tanggal selesai aktif. Kosong/tidak valid = tidak memotong.
/// `None` = tidak aktif sama sekali di periode itu.
pub fn rentang_aktif(
    periode_mulai: &str,
    periode_selesai: &str,
    tanggal_daftar: &str,
    tanggal_keluar: &str,
) -> Option<RentangAktif> {
    let sah = |t: &str| Some(t.trim()).filter(|t| tanggal_valid(t)).map(str::to_owned);
    let mulai = sah(tanggal_daftar).map_or(periode_mulai.to_owned(), |t| t.max(periode_mulai.to_owned()));
    let akhir = sah(tanggal_keluar).map_or(periode_selesai.to_owned(), |t| t.min(periode_selesai.to_owned()));
    (mulai <= akhir).then(|| RentangAktif {
        penuh: mulai == periode_mulai && akhir == periode_selesai,
        mulai,
        akhir,
    })
}

/// Cermin `periksaBuat` (§23.2.2): hanya untuk penilaian akar baru.
pub fn periksa_buat(
    aktif: bool,
    sudah_keluar: bool,
    periode_mulai: &str,
    hari_ini: &str,
    rentang: Option<&RentangAktif>,
) -> Result<(), String> {
    if sudah_keluar {
        return Err("Pegawai ini sudah keluar; penilaian baru tidak bisa dibuat.".into());
    }
    if !aktif {
        return Err("Pegawai nonaktif tidak bisa dinilai.".into());
    }
    if periode_mulai > hari_ini {
        return Err("Periode ini belum dimulai.".into());
    }
    if rentang.is_none() {
        return Err("Pegawai ini tidak aktif selama periode itu.".into());
    }
    Ok(())
}

/// Cermin `pesanBertumpuk`.
pub fn pesan_bertumpuk(mulai: &str, selesai: &str) -> String {
    format!("Pegawai ini sudah punya penilaian untuk periode {mulai} s.d. {selesai}.")
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct IsianNilai {
    pub id_aspek: String,
    pub skor: Option<i64>,
    pub catatan: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct PenilaianSah {
    pub aksi: String,
    pub id_penilaian: Option<String>,
    pub id_karyawan: Option<String>,
    pub periode_jenis: Option<String>,
    pub periode_kunci: Option<String>,
    pub id_template: Option<String>,
    pub catatan: Option<String>,
    pub alasan_koreksi: Option<String>,
    pub nilai: Vec<IsianNilai>,
}

fn opsional(draft: &Value, kunci: &str, label: &str, maks: usize) -> Result<Option<String>, String> {
    let isi = kosong_jadi_none(&teks_draft(draft, kunci));
    if isi.as_deref().is_some_and(|t| panjang(t) > maks) {
        return Err(format!("{label} maksimal {maks} karakter."));
    }
    Ok(isi)
}

/// Cermin `validasiPenilaian`: bentuk isian `desktop_hr_performance_save`,
/// tanpa data template.
pub fn validasi_penilaian(draft: &Value) -> Result<PenilaianSah, String> {
    let aksi = teks_draft(draft, "aksi");
    if !AKSI_SIMPAN.contains(&aksi.as_str()) {
        return Err("Aksi penilaian tidak dikenal.".into());
    }
    let id_penilaian = kosong_jadi_none(&teks_draft(draft, "id_penilaian"));
    let (mut id_karyawan, mut periode_jenis, mut periode_kunci) = (None, None, None);
    if aksi == "Buat" {
        id_karyawan = Some(kosong_jadi_none(&teks_draft(draft, "id_karyawan")).ok_or("Pilih pegawai yang dinilai.")?);
        let jenis = teks_draft(draft, "periode_jenis");
        if !JENIS_PERIODE.contains(&jenis.as_str()) {
            return Err("Jenis periode harus Semester atau Tahun Ajaran.".into());
        }
        periode_jenis = Some(jenis);
        periode_kunci = Some(kosong_jadi_none(&teks_draft(draft, "periode_kunci")).ok_or("Pilih periode penilaian.")?);
    } else if id_penilaian.is_none() {
        return Err("Penilaian wajib dipilih.".into());
    }
    let catatan = opsional(draft, "catatan", "Catatan penilaian", MAKS_CATATAN)?;
    let alasan_koreksi = if aksi == "Koreksi" {
        Some(opsional(draft, "alasan_koreksi", "Alasan koreksi", MAKS_ALASAN_KOREKSI)?.ok_or("Alasan koreksi wajib diisi.")?)
    } else {
        None
    };
    let daftar = match draft.get("nilai") {
        None | Some(Value::Null) => Vec::new(),
        Some(Value::Array(isi)) if isi.len() <= MAKS_ASPEK => isi.clone(),
        Some(_) => return Err("Isian nilai tidak valid.".into()),
    };
    let mut nilai: Vec<IsianNilai> = Vec::new();
    for n in &daftar {
        let id_aspek = teks_draft(n, "id_aspek").trim().to_owned();
        if id_aspek.is_empty() {
            return Err("Isian nilai tidak valid.".into());
        }
        if nilai.iter().any(|x| x.id_aspek == id_aspek) {
            return Err("Aspek ganda dalam isian nilai.".into());
        }
        let skor = match n.get("skor") {
            None | Some(Value::Null) => None,
            Some(v) => Some(v.as_i64().filter(|s| (1..=5).contains(s)).ok_or("Skor harus bilangan bulat 1 sampai 5.")?),
        };
        let catatan = opsional(n, "catatan", "Catatan aspek", MAKS_CATATAN_ASPEK)?;
        nilai.push(IsianNilai { id_aspek, skor, catatan });
    }
    Ok(PenilaianSah {
        aksi,
        id_penilaian,
        id_karyawan,
        periode_jenis,
        periode_kunci,
        id_template: kosong_jadi_none(&teks_draft(draft, "id_template")),
        catatan,
        alasan_koreksi,
        nilai,
    })
}

/// Satu baris `hr_kinerja_nilai` tanpa `id_nilai`/`id_penilaian`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BarisNilai {
    pub id_aspek: String,
    pub aspek_nama: String,
    pub tipe: String,
    pub bobot: i64,
    pub urutan: i64,
    pub skor: Option<i64>,
    pub skor_hitung: Option<i64>,
    pub catatan: Option<String>,
    pub rincian: Option<String>,
}

/// Hitungan satu tipe aspek otomatis. `skor` `None` = tidak bisa dihitung
/// (D = 0): penilai mengisi manual dengan catatan.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Otomatis {
    pub skor: Option<i64>,
    pub rincian: String,
}

/// Cermin `muatUlangTemplate`: baris dari template kini; skor dan catatan
/// aspek yang `id_aspek`-nya masih ada dipertahankan.
pub fn muat_ulang_template(baru: Vec<BarisNilai>, lama: &[BarisNilai]) -> Vec<BarisNilai> {
    baru.into_iter()
        .map(|mut b| {
            if let Some(l) = lama.iter().find(|l| l.id_aspek == b.id_aspek) {
                b.skor = l.skor;
                b.skor_hitung = l.skor_hitung;
                b.catatan = l.catatan.clone();
            }
            b
        })
        .collect()
}

/// Cermin `isianTersimpan`: isian dari baris tersimpan. Skor aspek otomatis
/// yang sama dengan hitungannya dilepas supaya mengikuti hitungan baru.
pub fn isian_tersimpan(baris: &[BarisNilai]) -> Vec<IsianNilai> {
    baris
        .iter()
        .map(|b| IsianNilai {
            id_aspek: b.id_aspek.clone(),
            skor: b.skor.filter(|s| b.tipe == TIPE_MANUAL || b.skor_hitung != Some(*s)),
            catatan: b.catatan.clone(),
        })
        .collect()
}

/// Cermin `susunNilai` (Q-100): isian dipasang ke baris salinan. Aspek
/// otomatis yang terhitung memakai `skor_hitung` kecuali penilai mengubahnya
/// dengan catatan; yang tidak terhitung (tipe tanpa hitungan atau D = 0)
/// diisi manual, juga dengan catatan.
pub fn susun_nilai(
    baris: &[BarisNilai],
    isian: &[IsianNilai],
    otomatis: &HashMap<String, Otomatis>,
) -> Result<Vec<BarisNilai>, String> {
    if isian.iter().any(|i| !baris.iter().any(|b| b.id_aspek == i.id_aspek)) {
        return Err("Aspek penilaian tidak dikenal; muat ulang template.".into());
    }
    let mut hasil = Vec::new();
    for b in baris {
        let isi = isian.iter().find(|i| i.id_aspek == b.id_aspek);
        let mut baru = b.clone();
        baru.skor = isi.and_then(|i| i.skor);
        baru.catatan = isi.and_then(|i| i.catatan.clone());
        baru.skor_hitung = None;
        baru.rincian = None;
        if b.tipe != TIPE_MANUAL {
            if let Some(o) = otomatis.get(&b.tipe) {
                baru.rincian = Some(o.rincian.clone());
                baru.skor_hitung = o.skor;
            }
            match baru.skor_hitung {
                Some(h) if baru.skor.is_none() => baru.skor = Some(h),
                Some(h) if baru.skor != Some(h) && baru.catatan.is_none() => {
                    return Err(format!("Skor aspek \"{}\" yang diubah dari hitungan wajib diberi catatan alasannya.", b.aspek_nama));
                }
                None if baru.skor.is_some() && baru.catatan.is_none() => {
                    return Err(format!("Aspek \"{}\" belum bisa dihitung otomatis; beri catatan alasan skornya.", b.aspek_nama));
                }
                _ => {}
            }
        }
        hasil.push(baru);
    }
    Ok(hasil)
}

pub fn skor_lengkap(baris: &[BarisNilai]) -> bool {
    !baris.is_empty() && baris.iter().all(|b| b.skor.is_some())
}

/// Cermin `nilaiAkhir` (§23.2.5): Σ bobot × 25 × (skor − 1), ×100 tanpa
/// pembulatan. `None` bila ada skor kosong.
pub fn nilai_akhir(baris: &[BarisNilai]) -> Option<i64> {
    baris.iter().try_fold(0, |total, b| Some(total + b.bobot * 25 * (b.skor? - 1)))
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct KeputusanRingkas {
    pub urut: i64,
    pub jenis: String,
}

/// Cermin `statusKinerja` (§23.2.6, berurutan), turunan dari keputusan.
pub fn status_kinerja(keputusan: &[KeputusanRingkas]) -> &'static str {
    if keputusan.iter().any(|k| k.jenis == "Batal") {
        return STATUS_DIBATALKAN;
    }
    if keputusan.iter().any(|k| k.jenis == "Final") {
        return STATUS_FINAL;
    }
    match keputusan
        .iter()
        .filter(|k| k.jenis == "Ajukan" || k.jenis == "Kembalikan")
        .max_by_key(|k| k.urut)
    {
        Some(k) if k.jenis == "Ajukan" => STATUS_DIAJUKAN,
        _ => STATUS_DRAF,
    }
}

/// Keadaan yang menentukan boleh-tidaknya satu aksi; semuanya dari sesi dan
/// cloud, tidak dari payload.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
pub struct KeadaanKinerja {
    /// Kosong = penilaian baru.
    pub status: String,
    /// Penilaian ini koreksi (`id_ref` terisi).
    pub koreksi: bool,
    /// `id_karyawan` sesi = pegawai yang dinilai.
    pub sendiri: bool,
    pub boleh_assess: bool,
    pub boleh_finalize: bool,
    pub dalam_cakupan: bool,
    pub skor_lengkap: bool,
    /// `rincian` kiriman layar = hitungan backend saat Ajukan.
    pub otomatis_sama: bool,
    /// Koreksi: akar Final dan belum punya koreksi terbuka.
    pub akar_final: bool,
    pub koreksi_terbuka: bool,
}

pub const AKSI_KINERJA: [&str; 8] = ["Buat", "Simpan", "Muat ulang", "Koreksi", "Ajukan", "Kembalikan", "Final", "Batal"];

/// Cermin `periksaAksiKinerja` (§23.2.6, §23.4).
pub fn periksa_aksi_kinerja(aksi: &str, alasan: &str, k: &KeadaanKinerja) -> Result<(), String> {
    if !AKSI_KINERJA.contains(&aksi) {
        return Err("Aksi penilaian tidak dikenal.".into());
    }
    if aksi != "Koreksi" && panjang(alasan.trim()) > MAKS_ALASAN {
        return Err(format!("Alasan maksimal {MAKS_ALASAN} karakter."));
    }
    if k.sendiri {
        return Err(super::hr_keluar::PESAN_DIRI_SENDIRI.into());
    }
    // Koreksi diisi pemegang assess atau pemutus yang membuatnya.
    let pengisi = k.boleh_assess || (k.koreksi && k.boleh_finalize);
    let izin = match aksi {
        "Buat" => k.boleh_assess,
        "Simpan" | "Muat ulang" | "Ajukan" => pengisi,
        "Batal" => k.boleh_assess || k.boleh_finalize,
        _ => k.boleh_finalize,
    };
    if !izin {
        return Err(PESAN_IZIN.into());
    }
    if !k.dalam_cakupan {
        return Err(super::hr_keluar::PESAN_DI_LUAR_CAKUPAN.into());
    }
    let tanpa_alasan = alasan.trim().is_empty();
    match aksi {
        "Buat" => {}
        "Simpan" | "Muat ulang" => {
            if k.status != STATUS_DRAF {
                return Err("Penilaian yang sudah diajukan atau selesai tidak bisa disunting.".into());
            }
        }
        "Koreksi" => {
            if !k.akar_final {
                return Err("Koreksi hanya untuk penilaian yang sudah final.".into());
            }
            if k.koreksi_terbuka {
                return Err("Penilaian ini masih punya koreksi yang belum selesai.".into());
            }
        }
        "Ajukan" => {
            if k.status != STATUS_DRAF {
                return Err("Hanya draf yang bisa diajukan.".into());
            }
            if !k.skor_lengkap {
                return Err("Isi skor semua aspek sebelum mengajukan.".into());
            }
            if !k.otomatis_sama {
                return Err(PESAN_OTOMATIS_BERUBAH.into());
            }
        }
        "Kembalikan" | "Final" => {
            if k.status != STATUS_DIAJUKAN {
                return Err("Penilaian ini tidak sedang diajukan.".into());
            }
            if aksi == "Kembalikan" && tanpa_alasan {
                return Err("Alasan pengembalian wajib diisi.".into());
            }
        }
        _ => {
            if k.status == STATUS_FINAL {
                return Err("Penilaian final tidak bisa dibatalkan; buat koreksi.".into());
            }
            if k.status == STATUS_DIBATALKAN {
                return Err("Penilaian ini sudah dibatalkan.".into());
            }
            if tanpa_alasan {
                return Err("Alasan pembatalan wajib diisi.".into());
            }
        }
    }
    Ok(())
}

/// Cermin `bolehBacaKinerja` (Q-105): penilaian atas diri sesi baru terbaca
/// sesudah Final, dan hanya lewat `hr.performance.view`.
pub fn boleh_baca_kinerja(sendiri: bool, status: &str, boleh_view: bool) -> bool {
    !sendiri || (status == STATUS_FINAL && boleh_view)
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
pub struct InfoTanda {
    pub status: String,
    pub penilai_oleh: String,
    pub id_penilai: String,
    /// Kosong = belum ada penilai bawaan.
    pub penilai_bawaan: String,
    /// `oleh` keputusan `Final`, bila ada.
    pub final_oleh: String,
    pub nilai: Vec<BarisNilai>,
    pub periode_penuh: bool,
    pub periode_selesai: String,
    pub dihitung_sampai: String,
    pub pengajuan_menunggu: bool,
    /// `kelompok_status` = `negeri` (Q-106).
    pub asn: bool,
}

fn sama_orang(a: &str, b: &str) -> bool {
    let (a, b) = (a.trim(), b.trim());
    !a.is_empty() && a.to_lowercase() == b.to_lowercase()
}

/// Cermin `tandaKinerja` (§23.2.6). `otomatis_berubah` dihitung terpisah di
/// rincian.
pub fn tanda_kinerja(i: &InfoTanda) -> Vec<&'static str> {
    let mut tanda = Vec::new();
    let bawaan = i.penilai_bawaan.trim();
    if !bawaan.is_empty() && i.id_penilai.trim() != bawaan {
        tanda.push("bukan_penilai_bawaan");
    }
    if i.status == STATUS_FINAL && sama_orang(&i.final_oleh, &i.penilai_oleh) {
        tanda.push("dinilai_dan_difinalkan_sama");
    }
    let otomatis = || i.nilai.iter().filter(|b| b.tipe != TIPE_MANUAL);
    if otomatis().any(|b| b.skor_hitung.is_some() && b.skor != b.skor_hitung) {
        tanda.push("otomatis_diubah");
    }
    if otomatis().any(|b| b.skor_hitung.is_none()) {
        tanda.push("otomatis_manual");
    }
    if !i.periode_penuh {
        tanda.push("periode_tidak_penuh");
    }
    if !i.dihitung_sampai.is_empty() && i.dihitung_sampai < i.periode_selesai {
        tanda.push("periode_belum_selesai");
    }
    if i.pengajuan_menunggu {
        tanda.push("pengajuan_menunggu");
    }
    if i.asn {
        tanda.push("asn");
    }
    tanda
}

#[derive(Debug, Clone, Deserialize)]
pub struct KandidatBerlaku {
    pub id_penilaian: String,
    /// `created_at` keputusan `Final`.
    pub final_pada: String,
    pub koreksi: bool,
}

/// Cermin `kinerjaBerlaku`: di antara akar dan koreksinya yang Final, yang
/// keputusan `Final`-nya paling akhir (seri: koreksi menang).
pub fn kinerja_berlaku(kandidat: &[KandidatBerlaku]) -> Option<String> {
    kandidat
        .iter()
        .max_by(|a, b| (&a.final_pada, a.koreksi).cmp(&(&b.final_pada, b.koreksi)))
        .map(|k| k.id_penilaian.clone())
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
pub struct MasukanPenilai {
    pub id_karyawan: String,
    pub kelompok: String,
    /// `id_atasan` yang aktif (kosong bila tidak ada atau nonaktif).
    pub id_atasan: String,
    /// Kepala unit (`tgs-kepsek`) pada `periode_selesai`.
    pub kepala_unit: String,
    /// Kepala TU (`tgs-ka-tu`) pada `periode_selesai`.
    pub kepala_tu: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct PenilaiBawaan {
    pub id: String,
    pub sumber: &'static str,
}

/// Cermin `penilaiBawaan` (Q-103): atasan, lalu kepala unit (guru) atau
/// kepala TU (tendik). Calon yang sama dengan pegawai itu dilewati.
pub fn penilai_bawaan(m: &MasukanPenilai) -> Option<PenilaiBawaan> {
    let kedua = if m.kelompok == "Guru" { (&m.kepala_unit, "kepala_unit") } else { (&m.kepala_tu, "kepala_tu") };
    [(&m.id_atasan, "atasan"), kedua]
        .into_iter()
        .map(|(id, sumber)| (id.trim(), sumber))
        .find(|(id, _)| !id.is_empty() && *id != m.id_karyawan.trim())
        .map(|(id, sumber)| PenilaiBawaan { id: id.to_owned(), sumber })
}

// Aspek otomatis kehadiran (§23.2.3)

#[derive(Debug, Clone, Default, PartialEq)]
pub struct HariKehadiran {
    pub tanggal: String,
    pub hadir: bool,
    /// `MAX(menit_terlambat) > 0`.
    pub telat: bool,
    pub sakit: bool,
    pub izin: bool,
    pub dispensasi: bool,
    pub alfa: bool,
}

fn angka_json(nilai: Option<&Value>) -> Option<i64> {
    match nilai? {
        Value::Number(n) => n.as_i64(),
        Value::String(s) => s.trim().parse().ok(),
        _ => None,
    }
}

impl HariKehadiran {
    /// Satu baris `KINERJA_HARI_SQL`.
    pub fn dari_json(v: &Value) -> Self {
        let satu = |k: &str| angka_json(v.get(k)) == Some(1);
        Self {
            tanggal: teks_draft(v, "tanggal"),
            hadir: satu("hadir"),
            telat: angka_json(v.get("telat")).unwrap_or(0) > 0,
            sakit: satu("sakit"),
            izin: satu("izin"),
            dispensasi: satu("dispensasi"),
            alfa: satu("alfa"),
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct PengajuanKehadiran {
    pub mulai: String,
    pub selesai: String,
    pub kelompok: String,
}

impl PengajuanKehadiran {
    /// Satu baris `KINERJA_PENGAJUAN_SQL`.
    pub fn dari_json(v: &Value) -> Self {
        Self {
            mulai: teks_draft(v, "tanggal_mulai"),
            selesai: teks_draft(v, "tanggal_selesai"),
            kelompok: teks_draft(v, "kelompok"),
        }
    }
}

pub struct MasukanKehadiran<'a> {
    /// Rentang aktif (§23.2.2), dipotong `hari_ini`.
    pub mulai: &'a str,
    pub akhir: &'a str,
    pub hari_ini: &'a str,
    pub jadwal: &'a Jadwal,
    pub hari: &'a [HariKehadiran],
    /// Hanya pengajuan berlaku.
    pub pengajuan: &'a [PengajuanKehadiran],
    pub libur: &'a HashSet<String>,
    pub whitelist: &'a [HolidayWhitelistEntry],
    pub ambang: &'a [i64; 4],
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Kehadiran {
    /// D = tepat + telat + alfa + kosong.
    pub hari: i64,
    pub tepat: i64,
    pub telat: i64,
    pub alfa: i64,
    pub kosong: i64,
    pub dikecualikan: i64,
    /// Permil; `None` bila D = 0.
    pub permil: Option<i64>,
    pub ambang: [i64; 4],
    pub skor: Option<i64>,
    /// Dihitung sampai = min(akhir aktif, hari ini).
    pub sampai: String,
    /// `K|D|tepat|telat|alfa|kosong|dikecualikan|P|a5,a4,a3,a2|sampai`.
    pub rincian: String,
    pub tanggal_telat: Vec<String>,
    pub tanggal_alfa: Vec<String>,
    pub tanggal_kosong: Vec<String>,
}

/// Kode catatan satu tanggal, sama dengan `kodeTercatat` laporan kehadiran.
fn kode_tercatat(hari: Option<&HariKehadiran>) -> Option<&'static str> {
    let h = hari?;
    if h.hadir {
        return Some(if h.telat { "T" } else { "H" });
    }
    [(h.sakit, "S"), (h.izin, "I"), (h.dispensasi, "D"), (h.alfa, "A")]
        .into_iter()
        .find(|(ada, _)| *ada)
        .map(|(_, kode)| kode)
}

/// Cermin `hitungKehadiran` (Q-95). Klasifikasi per tanggal mengikuti tabel
/// §23.2.3; yang pertama cocok menang.
pub fn hitung_kehadiran(m: &MasukanKehadiran<'_>) -> Kehadiran {
    let sampai = m.akhir.min(m.hari_ini).to_owned();
    let tanggal = if m.mulai <= sampai.as_str() { tanggal_rentang(m.mulai, &sampai) } else { Vec::new() };
    let dijadwalkan: HashSet<String> = if tanggal.is_empty() {
        HashSet::new()
    } else {
        tanggal_wajib(m.jadwal, m.libur, m.whitelist, m.mulai, &sampai).into_iter().collect()
    };
    let catatan: HashMap<&str, &HariKehadiran> = m.hari.iter().map(|h| (h.tanggal.as_str(), h)).collect();
    let mut k = Kehadiran {
        hari: 0,
        tepat: 0,
        telat: 0,
        alfa: 0,
        kosong: 0,
        dikecualikan: 0,
        permil: None,
        ambang: *m.ambang,
        skor: None,
        sampai: sampai.clone(),
        rincian: String::new(),
        tanggal_telat: Vec::new(),
        tanggal_alfa: Vec::new(),
        tanggal_kosong: Vec::new(),
    };
    for t in &tanggal {
        let kelompok: Vec<&str> = m
            .pengajuan
            .iter()
            .filter(|p| p.mulai.as_str() <= t.as_str() && t.as_str() <= p.selesai.as_str())
            .map(|p| p.kelompok.as_str())
            .collect();
        let kode = kode_tercatat(catatan.get(t.as_str()).copied());
        let tercatat_atau_jadwal = kode.is_some() || dijadwalkan.contains(t);
        match kode {
            Some("H") => k.tepat += 1,
            Some("T") if !kelompok.is_empty() => k.tepat += 1,
            Some("T") => {
                k.telat += 1;
                k.tanggal_telat.push(t.clone());
            }
            _ if tercatat_atau_jadwal && kelompok.contains(&KELOMPOK_DINAS_LUAR) => k.tepat += 1,
            _ if tercatat_atau_jadwal && kelompok.iter().any(|g| KELOMPOK_DIKECUALIKAN.contains(g)) => {
                k.dikecualikan += 1;
            }
            Some("S" | "I" | "D") => k.dikecualikan += 1,
            Some(_) => {
                k.alfa += 1;
                k.tanggal_alfa.push(t.clone());
            }
            None if dijadwalkan.contains(t) => {
                k.kosong += 1;
                k.tanggal_kosong.push(t.clone());
            }
            None => {}
        }
    }
    k.hari = k.tepat + k.telat + k.alfa + k.kosong;
    k.permil = (k.hari > 0).then(|| (2 * k.tepat + k.telat) * 1000 / (2 * k.hari));
    k.skor = k.permil.map(|p| skor_ambang(p, m.ambang));
    let a = m.ambang;
    k.rincian = format!(
        "K|{}|{}|{}|{}|{}|{}|{}|{},{},{},{}|{}",
        k.hari,
        k.tepat,
        k.telat,
        k.alfa,
        k.kosong,
        k.dikecualikan,
        k.permil.map(|p| p.to_string()).unwrap_or_default(),
        a[0],
        a[1],
        a[2],
        a[3],
        k.sampai
    );
    k
}

// Akses cloud dan lokal

fn galat(pesan: impl Into<String>) -> CommandError {
    CommandError::new("VALIDATION_ERROR", pesan)
}

fn teks(baris: &Value, kunci: &str) -> String {
    match baris.get(kunci) {
        Some(Value::String(s)) => s.clone(),
        Some(Value::Number(n)) => n.to_string(),
        _ => String::new(),
    }
}

async fn baris(client: &TursoClient, sql: &str, args: Vec<Value>) -> Result<Vec<Value>, CommandError> {
    Ok(client
        .query_one(sql, args)
        .await?
        .to_objects()
        .into_iter()
        .map(|b| json!(b))
        .collect())
}

async fn satu(client: &TursoClient, sql: &str, args: Vec<Value>) -> Result<Option<Value>, CommandError> {
    Ok(baris(client, sql, args).await?.into_iter().next())
}

fn pengaturan_dari(rows: &[Value]) -> Value {
    let peta: HashMap<String, String> = rows.iter().map(|r| (teks(r, "key"), teks(r, "value"))).collect();
    json!(pengaturan_kinerja(&peta))
}

/// Pengaturan kinerja dari SQLite perangkat (tersinkron, lebih baru daripada
/// cloud sampai outbox terdorong).
pub fn pengaturan_lokal(state: &DesktopState) -> Result<Value, CommandError> {
    let connection = storage::database(&state.data_dir)?;
    Ok(pengaturan_dari(&rows_json_with(&connection, PENGATURAN_KINERJA_SQL, [])?))
}

/// `desktop_hr_performance_templates`: template dengan aspeknya + pengaturan.
pub async fn daftar_template(client: &TursoClient, pengaturan: Value) -> Result<Value, CommandError> {
    client.ensure_schema_current().await?;
    let template = baris(client, TEMPLATE_KINERJA_SQL, vec![]).await?;
    let aspek = baris(client, ASPEK_KINERJA_SQL, vec![]).await?;
    let susun: Vec<Value> = template
        .into_iter()
        .map(|mut t| {
            let id = teks(&t, "id_template");
            t["aspek"] = json!(aspek.iter().filter(|a| teks(a, "id_template") == id).collect::<Vec<_>>());
            t
        })
        .collect();
    Ok(json!({ "template": susun, "pengaturan": pengaturan }))
}

/// `desktop_hr_performance_template_save`: buat atau ubah template beserta
/// semua aspeknya dalam satu batch cloud; bawaan lain sekelompok dilepas di
/// batch yang sama.
pub async fn simpan_template(
    client: &TursoClient,
    operator: &OperatorUser,
    draft: &Value,
) -> Result<Value, CommandError> {
    client.ensure_schema_current().await?;
    let sah = validasi_template(draft).map_err(galat)?;
    let (id, kelompok_lama, aspek_lama) = match &sah.id_template {
        Some(id) => {
            let lama = satu(client, TEMPLATE_SATU_SQL, vec![json!(id)])
                .await?
                .ok_or_else(|| galat("Template kinerja tidak ditemukan."))?;
            let aspek: Vec<(String, String)> = baris(client, ASPEK_TEMPLATE_SQL, vec![json!(id)])
                .await?
                .iter()
                .map(|a| (teks(a, "id_aspek"), teks(a, "tipe")))
                .collect();
            (id.clone(), Some(teks(&lama, "kelompok")), aspek)
        }
        None => (new_id("ktp-"), None, Vec::new()),
    };
    periksa_template_lama(&sah, kelompok_lama.as_deref(), &aspek_lama).map_err(galat)?;
    if satu(client, BENTROK_TEMPLATE_SQL, vec![json!(sah.nama), json!(id)]).await?.is_some() {
        return Err(galat(format!("Nama \"{}\" sudah dipakai template lain.", sah.nama)));
    }

    let mut perintah = vec![Statement::new(
        SIMPAN_TEMPLATE_SQL,
        vec![
            json!(id),
            json!(sah.nama),
            json!(sah.kelompok),
            json!(sah.keterangan),
            json!(i64::from(sah.is_bawaan)),
            json!(i64::from(sah.is_aktif)),
            json!(operator.username),
        ],
    )];
    if sah.is_bawaan {
        perintah.push(Statement::new(LEPAS_BAWAAN_SQL, vec![json!(sah.kelompok), json!(id)]));
    }
    for a in &sah.aspek {
        let id_aspek = a.id_aspek.clone().unwrap_or_else(|| new_id(&format!("{id}:")));
        perintah.push(Statement::new(
            SIMPAN_ASPEK_SQL,
            vec![
                json!(id_aspek),
                json!(id),
                json!(a.nama),
                json!(a.tipe),
                json!(a.bobot),
                json!(a.panduan),
                json!(a.urutan),
                json!(i64::from(a.is_aktif)),
            ],
        ));
    }
    client.execute_atomic(perintah).await?;
    Ok(json!({ "sukses": true, "id_template": id }))
}

/// `desktop_hr_performance_settings_save`: ketiga kunci dalam satu transaksi
/// lokal, masing-masing dengan event outbox `setting` (`hris::tulis_setting`).
pub fn simpan_pengaturan(state: &DesktopState, draft: &Value) -> Result<Value, CommandError> {
    let nilai = validasi_pengaturan_kinerja(draft).map_err(galat)?;
    let client_id = sync::ensure_client_id(state)?;
    let mut connection = storage::database(&state.data_dir)?;
    let transaction = connection.transaction().map_err(|_| CommandError::internal())?;
    for (kunci, isi) in &nilai {
        hris::tulis_setting(&transaction, &client_id, kunci, isi)?;
    }
    let hasil = pengaturan_dari(&rows_json_with(&transaction, PENGATURAN_KINERJA_SQL, [])?);
    transaction.commit().map_err(|_| CommandError::internal())?;
    Ok(hasil)
}

// Penilaian: I/O cloud (5b). Izin, cakupan, dan "diri sendiri" dari SESI;
// keadaan dijaga di batch cloud lalu dibaca ulang.

fn angka(baris: &Value, kunci: &str) -> i64 {
    angka_json(baris.get(kunci)).unwrap_or(0)
}

fn teks_opsi(baris: &Value, kunci: &str) -> Option<String> {
    Some(teks(baris, kunci)).filter(|t| !t.is_empty())
}

fn punya(operator: &OperatorUser, izin: &str) -> bool {
    operator.is_superadmin || operator.permissions.iter().any(|p| p == izin)
}

fn tautan(operator: &OperatorUser) -> String {
    operator.id_karyawan.as_deref().unwrap_or("").trim().to_owned()
}

fn diri_sendiri(operator: &OperatorUser, id_karyawan: &str) -> bool {
    let sesi = tautan(operator);
    !sesi.is_empty() && sesi == id_karyawan.trim()
}

fn kunci_unit(unit: &str) -> String {
    unit.trim().to_lowercase()
}

/// Baris SQL `json_object(...)`: satu kolom berisi teks JSON.
async fn baris_json(client: &TursoClient, sql: &str, args: Vec<Value>) -> Result<Vec<Value>, CommandError> {
    Ok(client
        .query_one(sql, args)
        .await?
        .to_objects()
        .into_iter()
        .filter_map(|b| b.into_values().next())
        .map(|v| match v {
            Value::String(s) => serde_json::from_str(&s).unwrap_or(Value::Null),
            lain => lain,
        })
        .collect())
}

async fn hari_ini(client: &TursoClient) -> Result<String, CommandError> {
    satu(client, HARI_INI_SQL, vec![])
        .await?
        .map(|b| teks(&b, "hari_ini"))
        .filter(|t| !t.is_empty())
        .ok_or_else(CommandError::internal)
}

/// Pengaturan dari cloud: hitungan otomatis satu sumber untuk Web dan Desktop.
async fn pengaturan_cloud(client: &TursoClient) -> Result<PengaturanKinerja, CommandError> {
    let peta = baris(client, PENGATURAN_KINERJA_SQL, vec![])
        .await?
        .iter()
        .map(|r| (teks(r, "key"), teks(r, "value")))
        .collect();
    Ok(pengaturan_kinerja(&peta))
}

async fn baca_periode(client: &TursoClient, jenis: &str, kunci: &str) -> Result<Periode, CommandError> {
    let tahun: Vec<TahunAjaran> = baris(client, TAHUN_AJARAN_SQL, vec![])
        .await?
        .iter()
        .map(|r| TahunAjaran {
            id_tahun_ajaran: teks(r, "id_tahun_ajaran"),
            nama_tahun: teks(r, "nama_tahun"),
            semester: teks(r, "semester"),
            tanggal_mulai: teks(r, "tanggal_mulai"),
            tanggal_selesai: teks(r, "tanggal_selesai"),
        })
        .collect();
    periode_dari_tahun_ajaran(jenis, kunci, &tahun).map_err(galat)
}

async fn pegawai(client: &TursoClient, id: &str) -> Result<Vec<Value>, CommandError> {
    baris(client, KINERJA_PEGAWAI_SQL, vec![json!(id)]).await
}

async fn satu_pegawai(client: &TursoClient, id: &str) -> Result<Value, CommandError> {
    pegawai(client, id)
        .await?
        .into_iter()
        .next()
        .ok_or_else(|| galat(super::hris_cloud::PESAN_PEGAWAI_BELUM_DI_CLOUD))
}

/// Pemegang tugas per unit (kunci huruf kecil) pada `tanggal`.
async fn kepala(client: &TursoClient, sql: &str, tanggal: &str) -> Result<HashMap<String, String>, CommandError> {
    Ok(baris(client, sql, vec![json!(tanggal)])
        .await?
        .iter()
        .map(|r| (teks(r, "kunci_unit"), teks(r, "id_karyawan")))
        .collect())
}

async fn unit_sesi(client: &TursoClient, operator: &OperatorUser) -> Result<String, CommandError> {
    let sesi = tautan(operator);
    if sesi.is_empty() {
        return Ok(String::new());
    }
    Ok(satu(client, UNIT_PERSONIL_SQL, vec![json!(sesi)]).await?.map(|b| teks(&b, "unit")).unwrap_or_default())
}

fn rentang_pegawai(p: &Value, mulai: &str, selesai: &str) -> Option<RentangAktif> {
    let keluar = if teks(p, "id_keluar").is_empty() { String::new() } else { teks(p, "tanggal_selesai_aktif") };
    rentang_aktif(mulai, selesai, &teks(p, "tanggal_daftar"), &keluar)
}

fn masukan_penilai(p: &Value, kepsek: &HashMap<String, String>, katu: &HashMap<String, String>) -> MasukanPenilai {
    let unit = kunci_unit(&teks(p, "unit"));
    MasukanPenilai {
        id_karyawan: teks(p, "id_unik"),
        kelompok: teks(p, "kelompok"),
        id_atasan: teks(p, "id_atasan"),
        kepala_unit: kepsek.get(&unit).cloned().unwrap_or_default(),
        kepala_tu: katu.get(&unit).cloned().unwrap_or_default(),
    }
}

/// Kehadiran atas rentang aktif; `None` bila tidak aktif di periode itu.
async fn hitung_otomatis(
    client: &TursoClient,
    p: &Value,
    rentang: Option<&RentangAktif>,
    hari_ini: &str,
    ambang: &[i64; 4],
) -> Result<Option<Kehadiran>, CommandError> {
    let Some(r) = rentang else {
        return Ok(None);
    };
    let args = vec![json!(r.mulai), json!(r.akhir), json!(teks(p, "id_unik"))];
    let hari: Vec<HariKehadiran> =
        baris_json(client, KINERJA_HARI_SQL, args.clone()).await?.iter().map(HariKehadiran::dari_json).collect();
    let pengajuan: Vec<PengajuanKehadiran> =
        baris(client, KINERJA_PENGAJUAN_SQL, args).await?.iter().map(PengajuanKehadiran::dari_json).collect();
    let libur: HashSet<String> = baris(client, LIBUR_SQL, vec![json!(r.mulai), json!(r.akhir)])
        .await?
        .iter()
        .map(|b| teks(b, "tanggal"))
        .collect();
    let whitelist: Vec<HolidayWhitelistEntry> = baris(client, WHITELIST_SQL, vec![])
        .await?
        .iter()
        .map(|w| HolidayWhitelistEntry {
            id: teks(w, "id"),
            scope_type: teks(w, "scope_type"),
            scope_value: teks(w, "scope_value"),
            tanggal_libur: teks_opsi(w, "tanggal_libur"),
            status_aktif: angka(w, "status_aktif"),
        })
        .collect();
    let jadwal = Jadwal {
        hari_masuk: parse_hari_kerja(teks_opsi(p, "hari_kerja").as_deref()),
        divisi: teks(p, "divisi"),
        kode_shift: angka_json(p.get("kode_shift")),
    };
    Ok(Some(hitung_kehadiran(&MasukanKehadiran {
        mulai: &r.mulai,
        akhir: &r.akhir,
        hari_ini,
        jadwal: &jadwal,
        hari: &hari,
        pengajuan: &pengajuan,
        libur: &libur,
        whitelist: &whitelist,
        ambang,
    })))
}

/// Hitungan per tipe aspek otomatis. Presensi kelas dan jurnal menyusul di
/// 5c; sampai itu diisi manual (`otomatis_manual`).
fn peta_otomatis(kehadiran: Option<&Kehadiran>) -> HashMap<String, Otomatis> {
    kehadiran
        .map(|k| HashMap::from([(TIPE_KEHADIRAN.to_owned(), Otomatis { skor: k.skor, rincian: k.rincian.clone() })]))
        .unwrap_or_default()
}

fn baris_nilai(v: &Value) -> BarisNilai {
    BarisNilai {
        id_aspek: teks(v, "id_aspek"),
        aspek_nama: teks(v, "aspek_nama"),
        tipe: teks(v, "tipe"),
        bobot: angka(v, "bobot"),
        urutan: angka(v, "urutan"),
        skor: angka_json(v.get("skor")),
        skor_hitung: angka_json(v.get("skor_hitung")),
        catatan: teks_opsi(v, "catatan"),
        rincian: teks_opsi(v, "rincian"),
    }
}

fn milik<'a>(rows: &'a [Value], id: &'a str) -> impl Iterator<Item = &'a Value> + 'a {
    rows.iter().filter(move |r| teks(r, "id_penilaian") == id)
}

fn status_dari(keputusan: &[Value], id: &str) -> &'static str {
    let ringkas: Vec<KeputusanRingkas> = milik(keputusan, id)
        .map(|k| KeputusanRingkas { urut: angka(k, "urut"), jenis: teks(k, "jenis") })
        .collect();
    status_kinerja(&ringkas)
}

fn final_dari<'a>(keputusan: &'a [Value], id: &'a str) -> Option<&'a Value> {
    milik(keputusan, id).filter(|k| teks(k, "jenis") == "Final").last()
}

/// Keputusan dan baris nilai untuk sekumpulan penilaian.
async fn keputusan_dan_nilai(client: &TursoClient, ids: &[String]) -> Result<(Vec<Value>, Vec<Value>), CommandError> {
    let larik = json!(json!(ids).to_string());
    Ok((
        baris(client, KEPUTUSAN_KINERJA_SQL, vec![larik.clone()]).await?,
        baris(client, NILAI_KINERJA_SQL, vec![larik]).await?,
    ))
}

/// Template aktif sekelompok: pilihan penilai, atau bawaan kelompoknya.
async fn template_aspek(
    client: &TursoClient,
    id_template: Option<&str>,
    kelompok: &str,
) -> Result<(String, String, Vec<BarisNilai>), CommandError> {
    let template = baris(client, TEMPLATE_KINERJA_SQL, vec![]).await?;
    let pilih = template.iter().find(|t| match id_template {
        Some(id) => teks(t, "id_template") == id,
        None => teks(t, "kelompok") == kelompok && angka(t, "is_bawaan") == 1,
    });
    let Some(t) = pilih.filter(|t| teks(t, "kelompok") == kelompok && angka(t, "is_aktif") == 1) else {
        return Err(galat(match id_template {
            Some(_) => format!("Pilih template aktif kelompok {kelompok}."),
            None => format!("Belum ada template kinerja bawaan untuk kelompok {kelompok}."),
        }));
    };
    let id = teks(t, "id_template");
    let aspek = baris(client, ASPEK_KINERJA_SQL, vec![])
        .await?
        .iter()
        .filter(|a| teks(a, "id_template") == id && angka(a, "is_aktif") == 1)
        .map(|a| BarisNilai {
            id_aspek: teks(a, "id_aspek"),
            aspek_nama: teks(a, "nama"),
            tipe: teks(a, "tipe"),
            bobot: angka(a, "bobot"),
            urutan: angka(a, "urutan"),
            skor: None,
            skor_hitung: None,
            catatan: None,
            rincian: None,
        })
        .collect();
    Ok((id, teks(t, "nama"), aspek))
}

/// Penilai = personil tertaut sesi (nama dari data pegawai), atau nama operator.
async fn penilai_sesi(client: &TursoClient, operator: &OperatorUser) -> Result<(String, String), CommandError> {
    let id = tautan(operator);
    let nama = if id.is_empty() {
        None
    } else {
        pegawai(client, &id).await?.first().map(|p| teks(p, "nama"))
    };
    Ok((id, nama.unwrap_or_else(|| operator.nama_operator.clone())))
}

async fn keadaan_dasar(
    client: &TursoClient,
    operator: &OperatorUser,
    id_karyawan: &str,
    unit_sasaran: &str,
) -> Result<KeadaanKinerja, CommandError> {
    let unit_akun = unit_sesi(client, operator).await?;
    Ok(KeadaanKinerja {
        sendiri: diri_sendiri(operator, id_karyawan),
        boleh_assess: punya(operator, "hr.performance.assess"),
        boleh_finalize: punya(operator, "hr.performance.finalize"),
        dalam_cakupan: dalam_cakupan(punya(operator, "hr.scope.all"), &unit_akun, unit_sasaran),
        ..KeadaanKinerja::default()
    })
}

fn statement_nilai(id_penilaian: &str, nilai: &[BarisNilai]) -> Vec<Statement> {
    nilai
        .iter()
        .map(|b| {
            Statement::new(
                SIMPAN_NILAI_SQL,
                vec![
                    json!(id_penilaian),
                    json!(b.id_aspek),
                    json!(b.aspek_nama),
                    json!(b.tipe),
                    json!(b.bobot),
                    json!(b.urutan),
                    json!(b.skor),
                    json!(b.skor_hitung),
                    json!(b.catatan),
                    json!(b.rincian),
                ],
            )
        })
        .collect()
}

fn sampai(rentang: Option<&RentangAktif>, hari_ini: &str) -> Option<String> {
    rentang.map(|r| r.akhir.as_str().min(hari_ini).to_owned())
}

/// `desktop_hr_performance_list`: penilaian satu periode (status, tanda,
/// belum dinilai, perlu saya nilai) atau riwayat satu pegawai.
pub async fn daftar_kinerja(client: &TursoClient, operator: &OperatorUser, draft: &Value) -> Result<Value, CommandError> {
    client.ensure_schema_current().await?;
    let hari_ini = hari_ini(client).await?;
    let sesi = tautan(operator);
    let view = punya(operator, "hr.performance.view");
    let id_karyawan = teks_draft(draft, "id_karyawan").trim().to_owned();

    if !id_karyawan.is_empty() {
        let rows = baris(client, PENILAIAN_PEGAWAI_SQL, vec![json!(id_karyawan)]).await?;
        let ids: Vec<String> = rows.iter().map(|r| teks(r, "id_penilaian")).collect();
        let (keputusan, _) = keputusan_dan_nilai(client, &ids).await?;
        let mut kandidat: HashMap<String, Vec<KandidatBerlaku>> = HashMap::new();
        let mut hasil = Vec::new();
        for mut r in rows {
            let id = teks(&r, "id_penilaian");
            let status = status_dari(&keputusan, &id);
            if !boleh_baca_kinerja(diri_sendiri(operator, &id_karyawan), status, view) {
                continue;
            }
            let akar = teks_opsi(&r, "id_ref").unwrap_or_else(|| id.clone());
            if let Some(f) = final_dari(&keputusan, &id).filter(|_| status == STATUS_FINAL) {
                r["nilai_akhir"] = json!(angka(f, "nilai_akhir"));
                r["predikat"] = json!(teks(f, "predikat"));
                kandidat.entry(akar.clone()).or_default().push(KandidatBerlaku {
                    id_penilaian: id.clone(),
                    final_pada: teks(f, "created_at"),
                    koreksi: akar != id,
                });
            }
            r["status"] = json!(status);
            hasil.push(r);
        }
        let berlaku: HashSet<String> = kandidat.values().filter_map(|k| kinerja_berlaku(k)).collect();
        for r in &mut hasil {
            r["berlaku"] = json!(berlaku.contains(&teks(r, "id_penilaian")));
        }
        return Ok(json!({ "penilaian": hasil, "hari_ini": hari_ini }));
    }

    let periode = baca_periode(client, &teks_draft(draft, "periode_jenis"), &teks_draft(draft, "periode_kunci")).await?;
    let semua = pegawai(client, "").await?;
    let peta: HashMap<String, &Value> = semua.iter().map(|p| (teks(p, "id_unik"), p)).collect();
    let tanggal_status = periode.selesai.as_str().min(hari_ini.as_str()).to_owned();
    let status_kini: HashMap<String, String> = baris(client, STATUS_KINI_SQL, vec![json!(tanggal_status)])
        .await?
        .iter()
        .map(|r| (teks(r, "id_unik"), teks(r, "status")))
        .collect();
    let kepsek = kepala(client, hr_beban::KEPALA_UNIT_SQL, &periode.selesai).await?;
    let katu = kepala(client, KEPALA_TU_SQL, &periode.selesai).await?;
    let rentang_args = vec![json!(periode.mulai), json!(periode.selesai), json!("")];
    let akar: HashSet<String> =
        baris(client, AKAR_RENTANG_SQL, rentang_args.clone()).await?.iter().map(|r| teks(r, "id_karyawan")).collect();
    let menunggu: HashSet<String> =
        baris(client, KINERJA_MENUNGGU_SQL, rentang_args).await?.iter().map(|r| teks(r, "id_karyawan")).collect();
    let rows = baris(client, PENILAIAN_PERIODE_SQL, vec![json!(periode.jenis), json!(periode.kunci)]).await?;
    let ids: Vec<String> = rows.iter().map(|r| teks(r, "id_penilaian")).collect();
    let (keputusan, nilai) = keputusan_dan_nilai(client, &ids).await?;
    let pengaturan = pengaturan_cloud(client).await?;

    let mut penilaian = Vec::new();
    for mut r in rows {
        let id = teks(&r, "id_penilaian");
        let id_k = teks(&r, "id_karyawan");
        let status = status_dari(&keputusan, &id);
        if !boleh_baca_kinerja(diri_sendiri(operator, &id_k), status, view) {
            continue;
        }
        let p = peta.get(&id_k).copied();
        let bawaan = p.and_then(|p| penilai_bawaan(&masukan_penilai(p, &kepsek, &katu)));
        let rentang = p.and_then(|p| rentang_pegawai(p, &teks(&r, "periode_mulai"), &teks(&r, "periode_selesai")));
        let baris_r: Vec<BarisNilai> = milik(&nilai, &id).map(baris_nilai).collect();
        let akhir = final_dari(&keputusan, &id).filter(|_| status == STATUS_FINAL);
        let tanda = tanda_kinerja(&InfoTanda {
            status: status.to_owned(),
            penilai_oleh: teks(&r, "penilai_oleh"),
            id_penilai: teks(&r, "id_penilai"),
            penilai_bawaan: bawaan.as_ref().map(|b| b.id.clone()).unwrap_or_default(),
            final_oleh: akhir.map(|f| teks(f, "oleh")).unwrap_or_default(),
            periode_penuh: rentang.as_ref().is_none_or(|x| x.penuh),
            periode_selesai: teks(&r, "periode_selesai"),
            dihitung_sampai: teks(&r, "dihitung_sampai"),
            pengajuan_menunggu: menunggu.contains(&id_k),
            asn: kelompok_status(&teks(&r, "status_kepegawaian")) == "negeri",
            nilai: baris_r.clone(),
        });
        let nilai_akhir_r = akhir.map(|f| angka(f, "nilai_akhir")).or_else(|| nilai_akhir(&baris_r));
        r["status"] = json!(status);
        r["tanda"] = json!(tanda);
        r["nilai_akhir"] = json!(nilai_akhir_r);
        r["predikat"] = json!(match akhir {
            Some(f) => Some(teks(f, "predikat")),
            None => nilai_akhir_r.map(|n| predikat_nilai(n, &pengaturan.predikat)),
        });
        r["perlu_saya"] = json!(status == STATUS_DRAF && !sesi.is_empty() && bawaan.as_ref().is_some_and(|b| b.id == sesi));
        r["penilai_bawaan"] = json!(bawaan);
        penilaian.push(r);
    }

    let mut belum = Vec::new();
    for p in &semua {
        let id = teks(p, "id_unik");
        let status = status_kini.get(&id).cloned().unwrap_or_default();
        let rentang = rentang_pegawai(p, &periode.mulai, &periode.selesai);
        if diri_sendiri(operator, &id)
            || teks(p, "status_aktif") != "Aktif"
            || !teks(p, "id_keluar").is_empty()
            || akar.contains(&id)
            || kelompok_status(&status) == "negeri"
            || rentang.is_none()
        {
            continue;
        }
        let bawaan = penilai_bawaan(&masukan_penilai(p, &kepsek, &katu));
        belum.push(json!({
            "id_karyawan": id,
            "nama": teks(p, "nama"),
            "unit": teks(p, "unit"),
            "kelompok": teks(p, "kelompok"),
            "jabatan": teks(p, "jabatan"),
            "status_kepegawaian": status,
            "perlu_saya": !sesi.is_empty() && bawaan.as_ref().is_some_and(|b| b.id == sesi),
            "penilai_bawaan": bawaan,
            "periode_tidak_penuh": rentang.is_some_and(|r| !r.penuh),
        }));
    }
    Ok(json!({
        "periode": periode,
        "hari_ini": hari_ini,
        "penilaian": penilaian,
        "belum_dinilai": belum,
        "sesi": {
            "id_karyawan": sesi,
            "unit": unit_sesi(client, operator).await?,
            "lingkup_semua": punya(operator, "hr.scope.all"),
        },
    }))
}

/// `desktop_hr_performance_detail`: rincian, hitungan otomatis hidup,
/// keluarga koreksi, SP berlaku, dan penilai bawaan.
pub async fn rincian_kinerja(client: &TursoClient, operator: &OperatorUser, id_penilaian: &str) -> Result<Value, CommandError> {
    client.ensure_schema_current().await?;
    let id = id_penilaian.trim();
    let p = satu(client, PENILAIAN_SATU_SQL, vec![json!(id)]).await?.ok_or_else(|| galat(PESAN_TIDAK_DITEMUKAN))?;
    let id_k = teks(&p, "id_karyawan");
    let akar = teks_opsi(&p, "id_ref").unwrap_or_else(|| id.to_owned());
    let keluarga = baris(client, KELUARGA_SQL, vec![json!(akar)]).await?;
    let ids: Vec<String> = keluarga.iter().map(|r| teks(r, "id_penilaian")).collect();
    let (keputusan, nilai) = keputusan_dan_nilai(client, &ids).await?;
    let status = status_dari(&keputusan, id);
    let view = punya(operator, "hr.performance.view");
    let sendiri = diri_sendiri(operator, &id_k);
    if !boleh_baca_kinerja(sendiri, status, view) {
        return Err(galat(PESAN_BELUM_FINAL_SENDIRI));
    }
    let hari_ini = hari_ini(client).await?;
    let pengaturan = pengaturan_cloud(client).await?;
    let (mulai, selesai) = (teks(&p, "periode_mulai"), teks(&p, "periode_selesai"));
    let orang = pegawai(client, &id_k).await?.into_iter().next();
    let rentang = orang.as_ref().and_then(|o| rentang_pegawai(o, &mulai, &selesai));
    let kehadiran = match &orang {
        Some(o) => hitung_otomatis(client, o, rentang.as_ref(), &hari_ini, &pengaturan.ambang).await?,
        None => None,
    };
    let hidup = peta_otomatis(kehadiran.as_ref());
    let baris_p: Vec<BarisNilai> = milik(&nilai, id).map(baris_nilai).collect();

    let kepsek = kepala(client, hr_beban::KEPALA_UNIT_SQL, &selesai).await?;
    let katu = kepala(client, KEPALA_TU_SQL, &selesai).await?;
    let bawaan = orang.as_ref().and_then(|o| penilai_bawaan(&masukan_penilai(o, &kepsek, &katu)));
    let bawaan_nama = match &bawaan {
        Some(b) => pegawai(client, &b.id).await?.first().map(|x| teks(x, "nama")),
        None => None,
    };
    let menunggu = !baris(client, KINERJA_MENUNGGU_SQL, vec![json!(mulai), json!(selesai), json!(id_k)]).await?.is_empty();
    let akhir = final_dari(&keputusan, id).filter(|_| status == STATUS_FINAL);
    let mut tanda = tanda_kinerja(&InfoTanda {
        status: status.to_owned(),
        penilai_oleh: teks(&p, "penilai_oleh"),
        id_penilai: teks(&p, "id_penilai"),
        penilai_bawaan: bawaan.as_ref().map(|b| b.id.clone()).unwrap_or_default(),
        final_oleh: akhir.map(|f| teks(f, "oleh")).unwrap_or_default(),
        nilai: baris_p.clone(),
        periode_penuh: rentang.as_ref().is_none_or(|r| r.penuh),
        periode_selesai: selesai.clone(),
        dihitung_sampai: teks(&p, "dihitung_sampai"),
        pengajuan_menunggu: menunggu,
        asn: kelompok_status(&teks(&p, "status_kepegawaian")) == "negeri",
    });
    let berubah = status != STATUS_DRAF
        && baris_p
            .iter()
            .any(|b| b.rincian.is_some() && hidup.get(&b.tipe).is_some_and(|o| b.rincian.as_deref() != Some(o.rincian.as_str())));
    if berubah {
        tanda.push("otomatis_berubah");
    }
    let nilai_akhir_p = akhir.map(|f| angka(f, "nilai_akhir")).or_else(|| nilai_akhir(&baris_p));
    let predikat_p = match akhir {
        Some(f) => Some(teks(f, "predikat")),
        None => nilai_akhir_p.map(|n| predikat_nilai(n, &pengaturan.predikat)),
    };

    let mut kandidat = Vec::new();
    let mut riwayat = Vec::new();
    for r in &keluarga {
        let id_r = teks(r, "id_penilaian");
        let status_r = status_dari(&keputusan, &id_r);
        if !boleh_baca_kinerja(sendiri, status_r, view) {
            continue;
        }
        let f = final_dari(&keputusan, &id_r).filter(|_| status_r == STATUS_FINAL);
        if let Some(f) = f {
            kandidat.push(KandidatBerlaku {
                id_penilaian: id_r.clone(),
                final_pada: teks(f, "created_at"),
                koreksi: id_r != akar,
            });
        }
        riwayat.push(json!({
            "id_penilaian": id_r,
            "id_ref": teks(r, "id_ref"),
            "alasan_koreksi": teks(r, "alasan_koreksi"),
            "status": status_r,
            "created_at": teks(r, "created_at"),
            "nilai_akhir": f.map(|f| angka(f, "nilai_akhir")),
            "predikat": f.map(|f| teks(f, "predikat")),
        }));
    }
    let berlaku = kinerja_berlaku(&kandidat);
    for r in &mut riwayat {
        r["berlaku"] = json!(berlaku.as_deref() == Some(teks(r, "id_penilaian").as_str()));
    }
    let sp = baris(client, KINERJA_SP_SQL, vec![json!(id_k), json!(mulai), json!(selesai)]).await?;
    Ok(json!({
        "penilaian": p,
        "status": status,
        "tanda": tanda,
        "nilai": baris_p,
        "keputusan": milik(&keputusan, id).collect::<Vec<_>>(),
        "nilai_akhir": nilai_akhir_p,
        "predikat": predikat_p,
        "kehadiran": kehadiran,
        "hidup": hidup,
        "rentang": rentang,
        "keluarga": riwayat,
        "berlaku": berlaku,
        "sp": sp,
        "penilai_bawaan": bawaan.map(|b| json!({ "id": b.id, "sumber": b.sumber, "nama": bawaan_nama })),
        "pengaturan": pengaturan,
        "unit_pegawai": orang.as_ref().map(|o| teks(o, "unit")).unwrap_or_default(),
        "sendiri": sendiri,
        "hari_ini": hari_ini,
    }))
}

/// `desktop_hr_performance_save`: Buat, Simpan, Muat ulang, Koreksi. Aspek
/// otomatis dihitung ulang setiap kali.
pub async fn simpan_kinerja(client: &TursoClient, operator: &OperatorUser, draft: &Value) -> Result<Value, CommandError> {
    client.ensure_schema_current().await?;
    let sah = validasi_penilaian(draft).map_err(galat)?;
    let hari_ini = hari_ini(client).await?;
    let pengaturan = pengaturan_cloud(client).await?;
    let (id_penilai, penilai_nama) = penilai_sesi(client, operator).await?;

    if sah.aksi == "Buat" {
        let id_k = sah.id_karyawan.clone().unwrap_or_default();
        let orang = satu_pegawai(client, &id_k).await?;
        let keadaan = keadaan_dasar(client, operator, &id_k, &teks(&orang, "unit")).await?;
        periksa_aksi_kinerja("Buat", "", &keadaan).map_err(galat)?;
        let periode = baca_periode(
            client,
            sah.periode_jenis.as_deref().unwrap_or_default(),
            sah.periode_kunci.as_deref().unwrap_or_default(),
        )
        .await?;
        let rentang = rentang_pegawai(&orang, &periode.mulai, &periode.selesai);
        periksa_buat(
            teks(&orang, "status_aktif") == "Aktif",
            !teks(&orang, "id_keluar").is_empty(),
            &periode.mulai,
            &hari_ini,
            rentang.as_ref(),
        )
        .map_err(galat)?;
        let bentrok = |rows: Vec<Value>| {
            rows.first().map(|b| galat(pesan_bertumpuk(&teks(b, "periode_mulai"), &teks(b, "periode_selesai"))))
        };
        let args_bentrok = vec![json!(periode.mulai), json!(periode.selesai), json!(id_k)];
        if let Some(e) = bentrok(baris(client, AKAR_RENTANG_SQL, args_bentrok.clone()).await?) {
            return Err(e);
        }
        let kelompok = teks(&orang, "kelompok");
        let (id_t, nama_t, salinan) = template_aspek(client, sah.id_template.as_deref(), &kelompok).await?;
        let kehadiran = hitung_otomatis(client, &orang, rentang.as_ref(), &hari_ini, &pengaturan.ambang).await?;
        let nilai = susun_nilai(&salinan, &sah.nilai, &peta_otomatis(kehadiran.as_ref())).map_err(galat)?;
        let status_kini = baris(client, STATUS_KINI_SQL, vec![json!(hari_ini)])
            .await?
            .iter()
            .find(|r| teks(r, "id_unik") == id_k)
            .map(|r| teks(r, "status"))
            .unwrap_or_default();
        let id = new_id("knj-");
        let mut perintah = vec![Statement::new(
            BUAT_PENILAIAN_SQL,
            vec![
                json!(id),
                json!(id_k),
                json!(periode.jenis),
                json!(periode.kunci),
                json!(periode.nama),
                json!(periode.mulai),
                json!(periode.selesai),
                json!(id_t),
                json!(nama_t),
                json!(kelompok),
                json!(teks(&orang, "unit")),
                json!(teks(&orang, "jabatan")),
                json!(status_kini),
                json!(Some(id_penilai).filter(|s| !s.is_empty())),
                json!(penilai_nama),
                json!(operator.username),
                json!(sah.catatan),
                json!(sampai(rentang.as_ref(), &hari_ini)),
            ],
        )];
        perintah.extend(statement_nilai(&id, &nilai));
        client.execute_atomic(perintah).await?;
        if satu(client, PENILAIAN_SATU_SQL, vec![json!(id)]).await?.is_none() {
            return Err(bentrok(baris(client, AKAR_RENTANG_SQL, args_bentrok).await?)
                .unwrap_or_else(|| galat(PESAN_KEADAAN_BERUBAH)));
        }
        return Ok(json!({ "sukses": true, "id_penilaian": id }));
    }

    let id_awal = sah.id_penilaian.clone().unwrap_or_default();
    let p = satu(client, PENILAIAN_SATU_SQL, vec![json!(id_awal)]).await?.ok_or_else(|| galat(PESAN_TIDAK_DITEMUKAN))?;
    let id_k = teks(&p, "id_karyawan");
    let akar = teks_opsi(&p, "id_ref").unwrap_or_else(|| id_awal.clone());
    let keluarga = baris(client, KELUARGA_SQL, vec![json!(akar)]).await?;
    let ids: Vec<String> = keluarga.iter().map(|r| teks(r, "id_penilaian")).collect();
    let (keputusan, nilai_semua) = keputusan_dan_nilai(client, &ids).await?;
    let orang = satu_pegawai(client, &id_k).await?;
    let rentang = rentang_pegawai(&orang, &teks(&p, "periode_mulai"), &teks(&p, "periode_selesai"));
    let mut keadaan = keadaan_dasar(client, operator, &id_k, &teks(&orang, "unit")).await?;
    let kehadiran = hitung_otomatis(client, &orang, rentang.as_ref(), &hari_ini, &pengaturan.ambang).await?;
    let otomatis = peta_otomatis(kehadiran.as_ref());
    let dihitung = sampai(rentang.as_ref(), &hari_ini);

    if sah.aksi == "Koreksi" {
        let status_akar = status_dari(&keputusan, &akar);
        keadaan.akar_final = status_akar == STATUS_FINAL;
        keadaan.koreksi_terbuka = ids
            .iter()
            .filter(|x| **x != akar)
            .any(|x| matches!(status_dari(&keputusan, x), STATUS_DRAF | STATUS_DIAJUKAN));
        periksa_aksi_kinerja("Koreksi", "", &keadaan).map_err(galat)?;
        let kandidat: Vec<KandidatBerlaku> = ids
            .iter()
            .filter(|x| status_dari(&keputusan, x) == STATUS_FINAL)
            .filter_map(|x| {
                final_dari(&keputusan, x).map(|f| KandidatBerlaku {
                    id_penilaian: x.clone(),
                    final_pada: teks(f, "created_at"),
                    koreksi: *x != akar,
                })
            })
            .collect();
        let sumber = kinerja_berlaku(&kandidat).unwrap_or_else(|| akar.clone());
        let asal = keluarga.iter().find(|r| teks(r, "id_penilaian") == sumber).unwrap_or(&p);
        let lama: Vec<BarisNilai> = milik(&nilai_semua, &sumber).map(baris_nilai).collect();
        let nilai = susun_nilai(&lama, &isian_tersimpan(&lama), &otomatis).map_err(galat)?;
        let id = new_id("knj-");
        let mut perintah = vec![Statement::new(
            KOREKSI_PENILAIAN_SQL,
            vec![
                json!(id),
                json!(sah.alasan_koreksi),
                json!(teks(asal, "id_template")),
                json!(teks(asal, "template_nama")),
                json!(Some(id_penilai).filter(|s| !s.is_empty())),
                json!(penilai_nama),
                json!(operator.username),
                json!(teks_opsi(asal, "catatan")),
                json!(dihitung),
                json!(akar),
            ],
        )];
        perintah.extend(statement_nilai(&id, &nilai));
        client.execute_atomic(perintah).await?;
        if satu(client, PENILAIAN_SATU_SQL, vec![json!(id)]).await?.is_none() {
            return Err(galat("Penilaian ini masih punya koreksi yang belum selesai."));
        }
        return Ok(json!({ "sukses": true, "id_penilaian": id }));
    }

    keadaan.status = status_dari(&keputusan, &id_awal).to_owned();
    keadaan.koreksi = !teks(&p, "id_ref").is_empty();
    periksa_aksi_kinerja(&sah.aksi, "", &keadaan).map_err(galat)?;
    let tersimpan: Vec<BarisNilai> = milik(&nilai_semua, &id_awal).map(baris_nilai).collect();
    let (id_t, nama_t, nilai) = if sah.aksi == "Muat ulang" {
        let pilihan = sah.id_template.clone().unwrap_or_else(|| teks(&p, "id_template"));
        let (id_t, nama_t, salinan) = template_aspek(client, Some(&pilihan), &teks(&p, "kelompok")).await?;
        let baru = muat_ulang_template(salinan, &tersimpan);
        let nilai = susun_nilai(&baru, &isian_tersimpan(&baru), &otomatis).map_err(galat)?;
        (id_t, nama_t, nilai)
    } else {
        let nilai = susun_nilai(&tersimpan, &sah.nilai, &otomatis).map_err(galat)?;
        (teks(&p, "id_template"), teks(&p, "template_nama"), nilai)
    };
    let catatan = if sah.aksi == "Muat ulang" { teks_opsi(&p, "catatan") } else { sah.catatan.clone() };
    let mut perintah = vec![
        Statement::new(
            UBAH_PENILAIAN_SQL,
            vec![
                json!(id_awal),
                json!(id_t),
                json!(nama_t),
                json!(Some(id_penilai).filter(|s| !s.is_empty())),
                json!(penilai_nama),
                json!(operator.username),
                json!(catatan),
                json!(dihitung),
            ],
        ),
        Statement::new(HAPUS_NILAI_SQL, vec![json!(id_awal)]),
    ];
    perintah.extend(statement_nilai(&id_awal, &nilai));
    client.execute_atomic(perintah).await?;
    let (sesudah, _) = keputusan_dan_nilai(client, std::slice::from_ref(&id_awal)).await?;
    if status_dari(&sesudah, &id_awal) != STATUS_DRAF {
        return Err(galat(PESAN_KEADAAN_BERUBAH));
    }
    Ok(json!({ "sukses": true, "id_penilaian": id_awal }))
}

/// `desktop_hr_performance_decide`: Ajukan, Kembalikan, Final, Batal.
pub async fn putuskan_kinerja(client: &TursoClient, operator: &OperatorUser, draft: &Value) -> Result<Value, CommandError> {
    client.ensure_schema_current().await?;
    let jenis = teks_draft(draft, "jenis");
    if !JENIS_KEPUTUSAN.contains(&jenis.as_str()) {
        return Err(galat("Aksi penilaian tidak dikenal."));
    }
    let id = teks_draft(draft, "id_penilaian").trim().to_owned();
    let alasan = teks_draft(draft, "alasan").trim().to_owned();
    let p = satu(client, PENILAIAN_SATU_SQL, vec![json!(id)]).await?.ok_or_else(|| galat(PESAN_TIDAK_DITEMUKAN))?;
    let id_k = teks(&p, "id_karyawan");
    let (keputusan, nilai_semua) = keputusan_dan_nilai(client, std::slice::from_ref(&id)).await?;
    let orang = satu_pegawai(client, &id_k).await?;
    let mut keadaan = keadaan_dasar(client, operator, &id_k, &teks(&orang, "unit")).await?;
    keadaan.status = status_dari(&keputusan, &id).to_owned();
    keadaan.koreksi = !teks(&p, "id_ref").is_empty();
    keadaan.skor_lengkap = true;
    keadaan.otomatis_sama = true;
    let tersimpan: Vec<BarisNilai> = milik(&nilai_semua, &id).map(baris_nilai).collect();
    let hari_ini = hari_ini(client).await?;
    let pengaturan = pengaturan_cloud(client).await?;
    let id_keputusan = new_id("kpk-");
    let sesi = Some(tautan(operator)).filter(|s| !s.is_empty());
    let mut perintah = Vec::new();

    match jenis.as_str() {
        "Ajukan" => {
            let rentang = rentang_pegawai(&orang, &teks(&p, "periode_mulai"), &teks(&p, "periode_selesai"));
            let kehadiran = hitung_otomatis(client, &orang, rentang.as_ref(), &hari_ini, &pengaturan.ambang).await?;
            let otomatis = peta_otomatis(kehadiran.as_ref());
            let layar = draft.get("rincian").cloned().unwrap_or(Value::Null);
            keadaan.otomatis_sama = tersimpan.iter().all(|b| match otomatis.get(&b.tipe) {
                Some(o) if b.tipe != TIPE_MANUAL => layar.get(&b.id_aspek).and_then(Value::as_str) == Some(o.rincian.as_str()),
                _ => true,
            });
            let susun = susun_nilai(&tersimpan, &isian_tersimpan(&tersimpan), &otomatis);
            keadaan.skor_lengkap = susun.as_ref().map_or(true, |n| skor_lengkap(n));
            periksa_aksi_kinerja("Ajukan", &alasan, &keadaan).map_err(galat)?;
            let nilai = susun.map_err(galat)?;
            perintah.push(Statement::new(HAPUS_NILAI_SQL, vec![json!(id)]));
            perintah.extend(statement_nilai(&id, &nilai));
            perintah.push(Statement::new(SAMPAI_PENILAIAN_SQL, vec![json!(id), json!(sampai(rentang.as_ref(), &hari_ini))]));
            perintah.push(Statement::new(
                KEPUTUSAN_DRAF_SQL,
                vec![json!(id), json!(id_keputusan), json!("Ajukan"), json!(Some(alasan).filter(|a| !a.is_empty())), Value::Null, Value::Null, json!(operator.username), json!(sesi)],
            ));
        }
        "Kembalikan" | "Final" => {
            periksa_aksi_kinerja(&jenis, &alasan, &keadaan).map_err(galat)?;
            let (nilai, predikat) = if jenis == "Final" {
                let n = nilai_akhir(&tersimpan).ok_or_else(|| galat("Isi skor semua aspek sebelum mengajukan."))?;
                (json!(n), json!(predikat_nilai(n, &pengaturan.predikat)))
            } else {
                (Value::Null, Value::Null)
            };
            perintah.push(Statement::new(
                KEPUTUSAN_DIAJUKAN_SQL,
                vec![json!(id), json!(id_keputusan), json!(jenis), json!(Some(alasan).filter(|a| !a.is_empty())), nilai, predikat, json!(operator.username), json!(sesi)],
            ));
        }
        _ => {
            periksa_aksi_kinerja("Batal", &alasan, &keadaan).map_err(galat)?;
            perintah.push(Statement::new(
                KEPUTUSAN_TERBUKA_SQL,
                vec![json!(id), json!(id_keputusan), json!("Batal"), json!(alasan), Value::Null, Value::Null, json!(operator.username), json!(sesi)],
            ));
        }
    }
    client.execute_atomic(perintah).await?;
    if satu(client, KEPUTUSAN_ADA_SQL, vec![json!(id_keputusan)]).await?.is_none() {
        return Err(galat(PESAN_KEADAAN_BERUBAH));
    }
    Ok(json!({ "sukses": true, "id_penilaian": id, "id_keputusan": id_keputusan }))
}

#[cfg(test)]
mod tests {
    //! Vektor sama dengan `validations/hr-kinerja.test.ts`.
    use super::*;

    const VEKTOR: &str = include_str!("../../../src/lib/validations/hr-kinerja.vektor.json");

    fn vektor() -> Value {
        serde_json::from_str(VEKTOR).expect("hr-kinerja.vektor.json sah")
    }

    fn cocok<T: Serialize>(hasil: Result<T, String>, k: &Value) {
        match k["galat"].as_str() {
            Some(pesan) => assert_eq!(hasil.err().as_deref(), Some(pesan), "{}", k["nama"]),
            None => assert_eq!(json!(hasil.expect("sah")), k["hasil"], "{}", k["nama"]),
        }
    }

    #[test]
    fn hr_kinerja_vektor_template() {
        let v = vektor();
        for k in v["template"].as_array().expect("template") {
            cocok(validasi_template(&k["draft"]), k);
        }
        for k in v["template_lama"].as_array().expect("template_lama") {
            let baru = validasi_template(&k["draft"]).expect("draft sah");
            let lama: Vec<(String, String)> = k["aspek_lama"]
                .as_array()
                .expect("aspek_lama")
                .iter()
                .map(|a| (teks(a, "id_aspek"), teks(a, "tipe")))
                .collect();
            let hasil = periksa_template_lama(&baru, k["kelompok_lama"].as_str(), &lama);
            cocok(hasil.map(|()| Value::Null), k);
        }
    }

    #[test]
    fn hr_kinerja_vektor_pengaturan() {
        let v = vektor();
        for k in v["ambang"].as_array().expect("ambang") {
            cocok(validasi_ambang(k["masukan"].as_str().unwrap()), k);
        }
        for k in v["predikat"].as_array().expect("predikat") {
            cocok(validasi_predikat(k["masukan"].as_str().unwrap()), k);
        }
        for k in v["tanpa_kbm"].as_array().expect("tanpa_kbm") {
            cocok(validasi_tanpa_kbm(k["masukan"].as_str().unwrap()), k);
        }
        for k in v["pengaturan"].as_array().expect("pengaturan") {
            let hasil = validasi_pengaturan_kinerja(&k["draft"])
                .map(|n| n.into_iter().map(|(a, b)| vec![a, b]).collect::<Vec<_>>());
            cocok(hasil, k);
        }
        for k in v["berlaku"].as_array().expect("berlaku") {
            let peta: HashMap<String, String> = k["peta"]
                .as_object()
                .expect("peta")
                .iter()
                .map(|(a, b)| (a.clone(), b.as_str().unwrap_or_default().to_owned()))
                .collect();
            assert_eq!(json!(pengaturan_kinerja(&peta)), k["hasil"], "{}", k["nama"]);
        }
    }

    #[test]
    fn hr_kinerja_vektor_skor_dan_predikat() {
        let v = vektor();
        for k in v["skor_ambang"].as_array().expect("skor_ambang") {
            let a: Vec<i64> = serde_json::from_value(k["ambang"].clone()).expect("ambang");
            let skor = skor_ambang(k["permil"].as_i64().unwrap(), &[a[0], a[1], a[2], a[3]]);
            assert_eq!(skor, k["skor"].as_i64().unwrap(), "{k}");
        }
        for k in v["pilih_predikat"].as_array().expect("pilih_predikat") {
            let daftar = parse_predikat(k["predikat"].as_str());
            assert_eq!(predikat_nilai(k["nilai"].as_i64().unwrap(), &daftar), k["hasil"].as_str().unwrap(), "{k}");
        }
    }

    #[test]
    fn hr_kinerja_template_bawaan_sah() {
        for t in template_bawaan() {
            let draft = json!({
                "nama": t.nama, "kelompok": t.kelompok, "keterangan": t.keterangan,
                "is_bawaan": true, "is_aktif": true,
                "aspek": t.aspek.iter().map(|a| json!({
                    "nama": a.nama, "tipe": a.tipe, "bobot": a.bobot,
                    "panduan": a.panduan, "is_aktif": true,
                })).collect::<Vec<_>>(),
            });
            validasi_template(&draft).unwrap_or_else(|e| panic!("{}: {e}", t.id_template));
            assert!(t.aspek.iter().all(|a| a.id_aspek.starts_with(&format!("{}:", t.id_template))));
        }
        // Dua template, 14 aspek, satu jenis tugas.
        assert_eq!(seed_statements().len(), 2 + 14 + 1);
    }

    fn operator(izin: &[&str]) -> OperatorUser {
        OperatorUser {
            id: 2,
            kode_operator: "OP2".into(),
            nama_operator: "Uji".into(),
            username: "uji".into(),
            role: "Admin".into(),
            role_id: 2,
            role_key: "uji".into(),
            is_superadmin: false,
            permissions: izin.iter().map(|i| (*i).to_owned()).collect(),
            permission_revision: 1,
            require_scan_photo: false,
            totp_enabled: false,
            require_scan_ip_allowlist: false,
            id_karyawan: None,
            login_at: None,
        }
    }

    /// Cloud lewat `TursoClient::local_file` di atas `ensure_schema`: seed
    /// dua template bawaan + `tgs-ka-tu` sekali, satu bawaan per kelompok,
    /// kelompok dan tipe terkunci, aspek tidak bisa dihapus, nama kembar
    /// ditolak.
    #[test]
    fn hr_kinerja_template_cloud() {
        let runtime = tokio::runtime::Builder::new_current_thread().build().expect("runtime uji");
        runtime.block_on(async {
            let dir = tempfile::tempdir().expect("direktori sementara");
            let hub = dir.path().join("sppg-hub.db");
            let client = TursoClient::local_file(
                url::Url::parse("https://hr-kinerja.sppg.invalid").expect("origin uji"),
                &hub,
                reqwest::Client::new(),
            );
            client.ensure_schema().await.expect("provisioning lokal");
            client.ensure_schema().await.expect("provisioning ulang");
            let c = rusqlite::Connection::open(&hub).expect("buka hub");
            let hitung = |sql: &str| c.query_row(sql, [], |r| r.get::<_, i64>(0)).expect(sql);
            assert_eq!(hitung("SELECT COUNT(*) FROM hr_kinerja_template WHERE is_bawaan = 1;"), 2);
            assert_eq!(hitung("SELECT COUNT(*) FROM hr_kinerja_aspek;"), 14);
            assert_eq!(hitung("SELECT COUNT(*) FROM hr_tugas_jenis WHERE id_jenis = 'tgs-ka-tu';"), 1);
            assert_eq!(hitung("SELECT COUNT(*) FROM schema_migration WHERE version IN (71, -2047);"), 2);

            let pengatur = operator(&["hr.performance.config"]);
            let galat_dari = |h: Result<Value, CommandError>| h.err().map(|e| e.message).unwrap_or_default();
            let aspek = |nama: &str, tipe: &str, bobot: i64| {
                json!({ "nama": nama, "tipe": tipe, "bobot": bobot, "is_aktif": true })
            };
            let draft = json!({
                "nama": "Satpam", "kelompok": "Tendik", "is_bawaan": true, "is_aktif": true,
                "aspek": [aspek("Kehadiran", TIPE_KEHADIRAN, 40), aspek("Kewaspadaan", TIPE_MANUAL, 60)],
            });
            let hasil = simpan_template(&client, &pengatur, &draft).await.expect("template baru");
            let id = hasil["id_template"].as_str().unwrap().to_owned();
            assert!(id.starts_with("ktp-"));
            // Bawaan tendik pindah; bawaan guru tetap.
            assert_eq!(hitung("SELECT is_bawaan FROM hr_kinerja_template WHERE id_template = 'ktp-tendik';"), 0);
            assert_eq!(hitung("SELECT is_bawaan FROM hr_kinerja_template WHERE id_template = 'ktp-guru';"), 1);
            assert_eq!(hitung("SELECT COUNT(*) FROM hr_kinerja_template WHERE is_bawaan = 1;"), 2);
            // Provisioning ulang tidak mengembalikan bawaan seed.
            client.ensure_schema().await.expect("provisioning ketiga");
            assert_eq!(hitung("SELECT is_bawaan FROM hr_kinerja_template WHERE id_template = 'ktp-tendik';"), 0);

            let tersimpan: Vec<(String, String)> = {
                let mut s = c
                    .prepare("SELECT id_aspek, tipe FROM hr_kinerja_aspek WHERE id_template = ?1 ORDER BY urutan;")
                    .expect("aspek");
                s.query_map([&id], |r| Ok((r.get(0)?, r.get(1)?))).expect("baris").map(Result::unwrap).collect()
            };
            assert_eq!(tersimpan.len(), 2);
            let ubah = |nama: &str, kelompok: &str, tipe_pertama: &str, dengan_kedua: bool| {
                let mut daftar = vec![json!({
                    "id_aspek": tersimpan[0].0, "nama": "Kehadiran", "tipe": tipe_pertama,
                    "bobot": 40, "is_aktif": true,
                })];
                if dengan_kedua {
                    daftar.push(json!({
                        "id_aspek": tersimpan[1].0, "nama": "Kewaspadaan", "tipe": TIPE_MANUAL,
                        "bobot": 60, "is_aktif": true,
                    }));
                } else {
                    daftar.push(aspek("Ronda", TIPE_MANUAL, 60));
                }
                json!({
                    "id_template": id, "nama": nama, "kelompok": kelompok,
                    "is_bawaan": true, "is_aktif": true, "aspek": daftar,
                })
            };
            assert_eq!(
                galat_dari(simpan_template(&client, &pengatur, &ubah("Satpam", "Guru", TIPE_KEHADIRAN, true)).await),
                "Kelompok template tidak bisa diubah."
            );
            assert_eq!(
                galat_dari(simpan_template(&client, &pengatur, &ubah("Satpam", "Tendik", TIPE_MANUAL, true)).await),
                "Tipe aspek \"Kehadiran\" tidak bisa diubah."
            );
            assert_eq!(
                galat_dari(simpan_template(&client, &pengatur, &ubah("Satpam", "Tendik", TIPE_KEHADIRAN, false)).await),
                "Aspek tidak bisa dihapus; nonaktifkan saja."
            );
            assert_eq!(
                galat_dari(
                    simpan_template(&client, &pengatur, &ubah("penilaian kinerja guru", "Tendik", TIPE_KEHADIRAN, true))
                        .await
                ),
                "Nama \"penilaian kinerja guru\" sudah dipakai template lain."
            );
            simpan_template(&client, &pengatur, &ubah("Satpam Malam", "Tendik", TIPE_KEHADIRAN, true))
                .await
                .expect("ubah nama");
            assert_eq!(hitung("SELECT COUNT(*) FROM hr_kinerja_aspek WHERE id_template = (SELECT id_template FROM hr_kinerja_template WHERE nama = 'Satpam Malam');"), 2);
            assert_eq!(
                galat_dari(
                    simpan_template(&client, &pengatur, &json!({
                        "id_template": "ktp-tidak-ada", "nama": "X", "kelompok": "Guru",
                        "is_bawaan": false, "is_aktif": true, "aspek": [aspek("A", TIPE_MANUAL, 100)],
                    }))
                    .await
                ),
                "Template kinerja tidak ditemukan."
            );
        });
    }

    fn dari<T: serde::de::DeserializeOwned>(v: &Value) -> T {
        serde_json::from_value(v.clone()).expect("vektor sah")
    }

    #[test]
    fn hr_kinerja_vektor_penilaian() {
        let v = vektor();
        for k in v["periode"].as_array().expect("periode") {
            let tahun: Vec<TahunAjaran> = dari(&k["tahun"]);
            cocok(periode_dari_tahun_ajaran(k["jenis"].as_str().unwrap(), k["kunci"].as_str().unwrap(), &tahun), k);
        }
        for k in v["rentang_aktif"].as_array().expect("rentang_aktif") {
            let p = &k["periode"];
            let hasil = rentang_aktif(
                p[0].as_str().unwrap(),
                p[1].as_str().unwrap(),
                k["tanggal_daftar"].as_str().unwrap(),
                k["tanggal_keluar"].as_str().unwrap(),
            );
            assert_eq!(json!(hasil), k["hasil"], "{}", k["nama"]);
        }
        for k in v["periksa_buat"].as_array().expect("periksa_buat") {
            let r = RentangAktif { mulai: String::new(), akhir: String::new(), penuh: true };
            let hasil = periksa_buat(
                k["aktif"].as_bool().unwrap(),
                k["sudah_keluar"].as_bool().unwrap(),
                k["periode_mulai"].as_str().unwrap(),
                k["hari_ini"].as_str().unwrap(),
                k["rentang"].as_bool().unwrap().then_some(&r),
            );
            assert_eq!(hasil.err().as_deref(), k["galat"].as_str(), "{}", k["nama"]);
        }
        for k in v["validasi_penilaian"].as_array().expect("validasi_penilaian") {
            cocok(validasi_penilaian(&k["draft"]), k);
        }
        for k in v["susun_nilai"].as_array().expect("susun_nilai") {
            let baris: Vec<BarisNilai> = dari(&k["baris"]);
            let isian: Vec<IsianNilai> = dari(&k["isian"]);
            let otomatis: HashMap<String, Otomatis> = dari(&k["otomatis"]);
            cocok(susun_nilai(&baris, &isian, &otomatis), k);
        }
        for k in v["isian_tersimpan"].as_array().expect("isian_tersimpan") {
            let baris: Vec<BarisNilai> = dari(&k["baris"]);
            assert_eq!(json!(isian_tersimpan(&baris)), k["hasil"], "{}", k["nama"]);
        }
        for k in v["muat_ulang"].as_array().expect("muat_ulang") {
            let baru: Vec<BarisNilai> = dari(&k["baru"]);
            let lama: Vec<BarisNilai> = dari(&k["lama"]);
            assert_eq!(json!(muat_ulang_template(baru, &lama)), k["hasil"], "{}", k["nama"]);
        }
        for k in v["status"].as_array().expect("status") {
            let keputusan: Vec<KeputusanRingkas> = dari(&k["keputusan"]);
            assert_eq!(status_kinerja(&keputusan), k["hasil"].as_str().unwrap(), "{k}");
        }
        for k in v["aksi"].as_array().expect("aksi") {
            let keadaan: KeadaanKinerja = dari(&k["keadaan"]);
            let hasil = periksa_aksi_kinerja(k["aksi"].as_str().unwrap(), k["alasan"].as_str().unwrap(), &keadaan);
            assert_eq!(hasil.err().as_deref(), k["galat"].as_str(), "{}", k["nama"]);
        }
        for k in v["boleh_baca"].as_array().expect("boleh_baca") {
            let hasil = boleh_baca_kinerja(
                k["sendiri"].as_bool().unwrap(),
                k["status"].as_str().unwrap(),
                k["view"].as_bool().unwrap(),
            );
            assert_eq!(hasil, k["hasil"].as_bool().unwrap(), "{k}");
        }
        for k in v["tanda"].as_array().expect("tanda") {
            let info: InfoTanda = dari(&k["info"]);
            assert_eq!(json!(tanda_kinerja(&info)), k["hasil"], "{}", k["nama"]);
        }
        for k in v["nilai_akhir"].as_array().expect("nilai_akhir") {
            let baris: Vec<BarisNilai> = dari(&k["baris"]);
            assert_eq!(json!(nilai_akhir(&baris)), k["hasil"], "{}", k["nama"]);
        }
        for k in v["kinerja_berlaku"].as_array().expect("kinerja_berlaku") {
            let kandidat: Vec<KandidatBerlaku> = dari(&k["kandidat"]);
            assert_eq!(json!(kinerja_berlaku(&kandidat)), k["hasil"], "{k}");
        }
        for k in v["penilai_bawaan"].as_array().expect("penilai_bawaan") {
            let m: MasukanPenilai = dari(&k["masukan"]);
            assert_eq!(json!(penilai_bawaan(&m)), k["hasil"], "{}", k["nama"]);
        }
    }

    #[test]
    fn hr_kinerja_vektor_kehadiran() {
        let v = vektor();
        for k in v["kehadiran"].as_array().expect("kehadiran") {
            let m = &k["masukan"];
            let s = |kunci: &str| m[kunci].as_str().unwrap_or_default().to_owned();
            let jadwal = Jadwal {
                hari_masuk: parse_hari_kerja(m["hari_kerja"].as_str()),
                divisi: s("divisi"),
                kode_shift: m["kode_shift"].as_i64(),
            };
            let hari: Vec<HariKehadiran> = m["hari"].as_array().unwrap().iter().map(HariKehadiran::dari_json).collect();
            let pengajuan: Vec<PengajuanKehadiran> =
                m["pengajuan"].as_array().unwrap().iter().map(PengajuanKehadiran::dari_json).collect();
            let libur: HashSet<String> = dari(&m["libur"]);
            let whitelist: Vec<HolidayWhitelistEntry> = m["whitelist"]
                .as_array()
                .unwrap()
                .iter()
                .map(|w| HolidayWhitelistEntry {
                    id: teks(w, "id"),
                    scope_type: teks(w, "scope_type"),
                    scope_value: teks(w, "scope_value"),
                    tanggal_libur: teks_opsi(w, "tanggal_libur"),
                    status_aktif: angka(w, "status_aktif"),
                })
                .collect();
            let ambang: [i64; 4] = dari(&m["ambang"]);
            let hasil = hitung_kehadiran(&MasukanKehadiran {
                mulai: &s("mulai"),
                akhir: &s("akhir"),
                hari_ini: &s("hari_ini"),
                jadwal: &jadwal,
                hari: &hari,
                pengajuan: &pengajuan,
                libur: &libur,
                whitelist: &whitelist,
                ambang: &ambang,
            });
            assert_eq!(json!(hasil), k["hasil"], "{}", k["nama"]);
        }
    }

    /// Pasangan pemeriksaan harfiah TS di `hr-kinerja.test.ts`.
    #[test]
    fn hr_kinerja_sql_salinan() {
        assert!(KINERJA_PENGAJUAN_SQL.contains(super::super::hr_pengajuan::PENGAJUAN_BERLAKU_SQL));
        assert_eq!(KEPALA_TU_SQL.replace("'tgs-ka-tu'", "'tgs-kepsek'"), hr_beban::KEPALA_UNIT_SQL);
        assert!(DRAF_SQL.starts_with(TERBUKA_SQL) && DIAJUKAN_SQL.starts_with(TERBUKA_SQL));
        for sql in [UBAH_PENILAIAN_SQL, SAMPAI_PENILAIAN_SQL, HAPUS_NILAI_SQL, SIMPAN_NILAI_SQL, KEPUTUSAN_DRAF_SQL] {
            assert!(sql.contains(DRAF_SQL), "{sql}");
        }
        assert!(KEPUTUSAN_DIAJUKAN_SQL.contains(DIAJUKAN_SQL));
        assert!(KEPUTUSAN_TERBUKA_SQL.contains(TERBUKA_SQL) && !KEPUTUSAN_TERBUKA_SQL.contains(DRAF_SQL));
    }

    /// Data dan angka sama dengan `services/hr-kinerja.test.ts` ("alur
    /// penilaian"). Semester uji 2024-01-08..19, libur 11 Jan, G1 (SMP):
    /// H 8, 9, 12, 15; telat 10; telat 16 + izin berlaku; Alfa 17; 18 kosong
    /// (cuti Menunggu); 19 Dinas Luar berlaku.
    pub(super) const DATA_PENILAIAN_SQL: &str = "
        INSERT INTO tbl_shift (id_shift, kode_shift, nama_shift, jam_masuk, jam_pulang, jam_kerja_normal_menit, hari_kerja) VALUES (77, 77, 'Lima hari', '07:00', '15:00', 420, '1,2,3,4,5');
        INSERT INTO master_data (id_unik, kode_karyawan, nama, divisi, id_shift, jenis_personil, unit, tanggal_daftar, status_aktif, id_keluar, tanggal_selesai_aktif) VALUES
          ('G1', 'K-G1', 'Guru Satu', 'Guru', 77, 'GURU', 'SMP', '2020-01-01', 'Aktif', NULL, NULL),
          ('K1', 'K-K1', 'Kepala SMP', 'Guru', 77, 'GURU', 'SMP', '2015-01-01', 'Aktif', NULL, NULL),
          ('G2', 'K-G2', 'Guru SD', 'Guru', 77, 'GURU', 'SD', '2020-01-01', 'Aktif', NULL, NULL),
          ('G3', 'K-G3', 'Guru Keluar', 'Guru', 77, 'GURU', 'SMP', '2020-01-01', 'Nonaktif', 'klr-1', '2024-01-10'),
          ('Y1', 'K-Y1', 'Ketua Yayasan', 'Yayasan', 77, 'Pegawai', '', '2010-01-01', 'Aktif', NULL, NULL);
        INSERT INTO akademik_tahun_ajaran (id_tahun_ajaran, nama_tahun, semester, tanggal_mulai, tanggal_selesai, is_aktif, created_at, updated_at) VALUES
          ('ta-1', '2023/2024', 'Ganjil', '2023-07-17', '2023-12-22', 0, 'x', 'x'),
          ('ta-2', '2023/2024', 'Genap', '2024-01-08', '2024-01-19', 0, 'x', 'x');
        INSERT INTO tbl_hari_libur (tanggal, nama_libur, status_aktif) VALUES ('2024-01-11', 'Libur uji', 1);
        INSERT INTO hr_tugas_tambahan (id_tugas, id_karyawan, id_jenis, unit, tahun_ajaran, tanggal_mulai) VALUES ('tt-1', 'K1', 'tgs-kepsek', 'SMP', '2023/2024', '2023-07-01');
        INSERT INTO absensi_harian (tanggal, id_karyawan, nama, kelas_divisi, jam_masuk, status_kehadiran, status_absen, sumber, update_terakhir, menit_terlambat, id_shift, bulan, tahun, id_sesi) VALUES
          ('2024-01-08', 'G1', 'Guru Satu', 'Guru', '06:55', 'Hadir', 'Masuk', 'Scanner', 'x', 0, 77, 'Januari', 2024, 's-08'),
          ('2024-01-09', 'G1', 'Guru Satu', 'Guru', '06:50', 'Hadir', 'Masuk', 'Scanner', 'x', 0, 77, 'Januari', 2024, 's-09'),
          ('2024-01-10', 'G1', 'Guru Satu', 'Guru', '07:15', 'Terlambat', 'Masuk', 'Scanner', 'x', 15, 77, 'Januari', 2024, 's-10'),
          ('2024-01-12', 'G1', 'Guru Satu', 'Guru', '06:58', 'Hadir', 'Masuk', 'Scanner', 'x', 0, 77, 'Januari', 2024, 's-12'),
          ('2024-01-15', 'G1', 'Guru Satu', 'Guru', '06:57', 'Hadir', 'Masuk', 'Scanner', 'x', 0, 77, 'Januari', 2024, 's-15'),
          ('2024-01-16', 'G1', 'Guru Satu', 'Guru', '09:40', 'Terlambat', 'Masuk', 'Scanner', 'x', 160, 77, 'Januari', 2024, 's-16'),
          ('2024-01-17', 'G1', 'Guru Satu', 'Guru', '', 'Alfa', 'Alfa', 'Generate Sistem', 'x', 0, 77, 'Januari', 2024, 's-17');
        INSERT INTO hr_pengajuan (id_pengajuan, id_karyawan, id_jenis, kelompok, potong_jatah, dampak_gaji, izin_pemutus, tanggal_mulai, tanggal_selesai, jam_mulai_ke, jam_sampai_ke, setengah_hari, alasan, sidik, diajukan_oleh, waktu_perangkat) VALUES
          ('pgn-1', 'G1', 'jns-izin', 'Izin', 0, 'Dibayar', 'hr.request.decide', '2024-01-16', '2024-01-16', 1, 3, 0, 'urusan keluarga', 's1', 'tu', 'x'),
          ('pgn-2', 'G1', 'jns-dl', 'Dinas Luar', 0, 'Dibayar', 'hr.request.decide', '2024-01-19', '2024-01-19', NULL, NULL, 0, 'lomba', 's2', 'tu', 'x'),
          ('pgn-3', 'G1', 'jns-cuti', 'Cuti', 1, 'Dibayar', 'hr.request.decide', '2024-01-18', '2024-01-18', NULL, NULL, 0, 'cuti', 's3', 'tu', 'x');
        INSERT INTO hr_pengajuan_keputusan (id_keputusan, id_pengajuan, jenis, sidik, oleh, waktu_perangkat) VALUES
          ('pk-1', 'pgn-1', 'Setujui', 's1', 'kepsek', 'x'), ('pk-2', 'pgn-2', 'Setujui', 's2', 'kepsek', 'x');
    ";

    fn operator_sesi(izin: &[&str], id_karyawan: &str, username: &str) -> OperatorUser {
        let mut op = operator(izin);
        op.username = username.into();
        op.id_karyawan = Some(id_karyawan.into());
        op
    }

    /// Alur 5b di atas `TursoClient::local_file`: buat, tumpang tindih, simpan,
    /// otomatis berubah, ajukan, kembalikan, final beku, simpan sesudah Final,
    /// koreksi, diri sendiri, unit lain, pegawai keluar, batal.
    #[test]
    fn hr_kinerja_penilaian_cloud() {
        let runtime = tokio::runtime::Builder::new_current_thread().build().expect("runtime uji");
        runtime.block_on(async {
            let dir = tempfile::tempdir().expect("direktori sementara");
            let hub = dir.path().join("sppg-hub.db");
            let client = TursoClient::local_file(
                url::Url::parse("https://hr-kinerja.sppg.invalid").expect("origin uji"),
                &hub,
                reqwest::Client::new(),
            );
            client.ensure_schema().await.expect("provisioning lokal");
            let c = rusqlite::Connection::open(&hub).expect("buka hub");
            c.execute_batch(DATA_PENILAIAN_SQL).expect("data uji");
            let kepsek = operator_sesi(&["hr.performance.assess"], "K1", "kepsek");
            let yayasan = operator_sesi(
                &["hr.performance.view", "hr.performance.assess", "hr.performance.finalize", "hr.scope.all"],
                "Y1",
                "yayasan",
            );
            let pesan = |h: Result<Value, CommandError>| h.err().map(|e| e.message).unwrap_or_default();
            let buat = |id: &str, jenis: &str, kunci: &str| {
                json!({ "aksi": "Buat", "id_karyawan": id, "periode_jenis": jenis, "periode_kunci": kunci })
            };

            // Buat: kehadiran terhitung, presensi/jurnal menunggu isian manual.
            let id = simpan_kinerja(&client, &kepsek, &buat("G1", "Semester", "ta-2")).await.expect("buat")["id_penilaian"]
                .as_str()
                .unwrap()
                .to_owned();
            let rincian_awal = "K|9|6|1|1|1|0|722|950,900,800,700|2024-01-19";
            let (skor, hitung, rincian): (i64, i64, String) = c
                .query_row(
                    "SELECT skor, skor_hitung, rincian FROM hr_kinerja_nilai WHERE id_penilaian = ?1 AND tipe = 'Otomatis Kehadiran';",
                    [&id],
                    |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
                )
                .expect("nilai kehadiran");
            assert_eq!((skor, hitung, rincian.as_str()), (2, 2, rincian_awal));
            assert_eq!(
                pesan(simpan_kinerja(&client, &kepsek, &buat("G1", "Tahun Ajaran", "2023/2024")).await),
                "Pegawai ini sudah punya penilaian untuk periode 2024-01-08 s.d. 2024-01-19."
            );

            let rinci = rincian_kinerja(&client, &kepsek, &id).await.expect("rincian");
            assert_eq!(rinci["status"], "Draf");
            assert_eq!(rinci["penilai_bawaan"]["id"], "K1");
            let tanda = rinci["tanda"].as_array().unwrap();
            assert!(tanda.contains(&json!("pengajuan_menunggu")) && tanda.contains(&json!("otomatis_manual")));
            assert_eq!(rinci["kehadiran"]["tanggal_kosong"], json!(["2024-01-18"]));

            // Simpan: aspek manual 4; presensi/jurnal wajib bercatatan.
            let isian = |dengan_catatan: bool| {
                let daftar: Vec<Value> = rinci["nilai"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .filter(|b| b["tipe"] != TIPE_KEHADIRAN)
                    .map(|b| {
                        let manual_otomatis = b["tipe"] != TIPE_MANUAL;
                        json!({
                            "id_aspek": b["id_aspek"], "skor": 4,
                            "catatan": if manual_otomatis && dengan_catatan { Some("dari supervisi") } else { None },
                        })
                    })
                    .collect();
                json!({ "aksi": "Simpan", "id_penilaian": id, "catatan": "Baik", "nilai": daftar })
            };
            assert_eq!(
                pesan(simpan_kinerja(&client, &kepsek, &isian(false)).await),
                "Aspek \"Keterisian presensi kelas\" belum bisa dihitung otomatis; beri catatan alasan skornya."
            );
            simpan_kinerja(&client, &kepsek, &isian(true)).await.expect("simpan draf");

            // Otomatis berubah sesudah layar dimuat: Ajukan ditolak.
            let aspek_k = rinci["nilai"]
                .as_array()
                .unwrap()
                .iter()
                .find(|b| b["tipe"] == TIPE_KEHADIRAN)
                .unwrap()["id_aspek"]
                .as_str()
                .unwrap()
                .to_owned();
            let rincian_layar = |r: &str| Value::Object(serde_json::Map::from_iter([(aspek_k.clone(), json!(r))]));
            let ajukan = |r: &str| json!({ "id_penilaian": id, "jenis": "Ajukan", "rincian": rincian_layar(r) });
            c.execute(
                "INSERT INTO absensi_harian (tanggal, id_karyawan, nama, kelas_divisi, jam_masuk, status_kehadiran, status_absen, sumber, update_terakhir, menit_terlambat, id_shift, bulan, tahun, id_sesi) VALUES ('2024-01-18', 'G1', 'Guru Satu', 'Guru', '06:59', 'Hadir', 'Masuk', 'Scanner', 'x', 0, 77, 'Januari', 2024, 's-18');",
                [],
            )
            .expect("absensi baru");
            assert_eq!(pesan(putuskan_kinerja(&client, &kepsek, &ajukan(rincian_awal)).await), PESAN_OTOMATIS_BERUBAH);
            let rincian_baru = "K|9|7|1|1|0|0|833|950,900,800,700|2024-01-19";
            assert_eq!(rincian_kinerja(&client, &kepsek, &id).await.unwrap()["hidup"][TIPE_KEHADIRAN]["rincian"], rincian_baru);
            putuskan_kinerja(&client, &kepsek, &ajukan(rincian_baru)).await.expect("ajukan");

            // Kembalikan hanya pemutus, dengan alasan.
            let putus = |jenis: &str, alasan: &str| json!({ "id_penilaian": id, "jenis": jenis, "alasan": alasan });
            assert_eq!(pesan(putuskan_kinerja(&client, &kepsek, &putus("Kembalikan", "x")).await), PESAN_IZIN);
            assert_eq!(
                pesan(putuskan_kinerja(&client, &yayasan, &putus("Kembalikan", " ")).await),
                "Alasan pengembalian wajib diisi."
            );
            putuskan_kinerja(&client, &yayasan, &putus("Kembalikan", "lengkapi supervisi")).await.expect("kembalikan");
            simpan_kinerja(&client, &kepsek, &isian(true)).await.expect("simpan lagi");
            putuskan_kinerja(&client, &kepsek, &ajukan(rincian_baru)).await.expect("ajukan lagi");
            assert_eq!(
                pesan(simpan_kinerja(&client, &kepsek, &isian(true)).await),
                "Penilaian yang sudah diajukan atau selesai tidak bisa disunting."
            );

            // Final beku: 500 + 90 × 75 = 7250 = Cukup.
            putuskan_kinerja(&client, &yayasan, &putus("Final", "")).await.expect("final");
            let (nilai, predikat, urut): (i64, String, i64) = c
                .query_row(
                    "SELECT nilai_akhir, predikat, urut FROM hr_kinerja_keputusan WHERE id_penilaian = ?1 AND jenis = 'Final';",
                    [&id],
                    |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
                )
                .expect("keputusan final");
            assert_eq!((nilai, predikat.as_str(), urut), (7250, "Cukup", 4));
            c.execute("UPDATE absensi_harian SET menit_terlambat = 0, status_kehadiran = 'Hadir' WHERE id_sesi = 's-10';", [])
                .expect("koreksi absensi");
            let beku = rincian_kinerja(&client, &yayasan, &id).await.expect("rincian final");
            assert_eq!((beku["status"].clone(), beku["nilai_akhir"].clone()), (json!("Final"), json!(7250)));
            assert!(beku["tanda"].as_array().unwrap().contains(&json!("otomatis_berubah")));
            assert_eq!(
                pesan(simpan_kinerja(&client, &kepsek, &isian(true)).await),
                "Penilaian yang sudah diajukan atau selesai tidak bisa disunting."
            );

            // Koreksi oleh pemutus; satu koreksi terbuka per akar.
            let koreksi = |alasan: &str| json!({ "aksi": "Koreksi", "id_penilaian": id, "alasan_koreksi": alasan });
            assert_eq!(pesan(simpan_kinerja(&client, &kepsek, &koreksi("x")).await), PESAN_IZIN);
            assert_eq!(pesan(simpan_kinerja(&client, &yayasan, &koreksi(" ")).await), "Alasan koreksi wajib diisi.");
            let id_kor = simpan_kinerja(&client, &yayasan, &koreksi("absensi 10 Jan dikoreksi")).await.expect("koreksi")
                ["id_penilaian"]
                .as_str()
                .unwrap()
                .to_owned();
            assert_eq!(
                pesan(simpan_kinerja(&client, &yayasan, &koreksi("lagi")).await),
                "Penilaian ini masih punya koreksi yang belum selesai."
            );
            let rinci_kor = rincian_kinerja(&client, &yayasan, &id_kor).await.expect("rincian koreksi");
            assert_eq!(rinci_kor["penilaian"]["id_ref"], json!(id));
            let rincian_kor = "K|9|8|0|1|0|0|888|950,900,800,700|2024-01-19";
            assert_eq!(rinci_kor["hidup"][TIPE_KEHADIRAN]["rincian"], rincian_kor);
            putuskan_kinerja(
                &client,
                &yayasan,
                &json!({ "id_penilaian": id_kor, "jenis": "Ajukan", "rincian": rincian_layar(rincian_kor) }),
            )
            .await
            .expect("ajukan koreksi");
            putuskan_kinerja(&client, &yayasan, &json!({ "id_penilaian": id_kor, "jenis": "Final" }))
                .await
                .expect("final koreksi");
            assert_eq!(rincian_kinerja(&client, &yayasan, &id).await.unwrap()["berlaku"], json!(id_kor));

            // Diri sendiri, unit lain, pegawai keluar.
            assert_eq!(
                pesan(simpan_kinerja(&client, &kepsek, &buat("K1", "Semester", "ta-2")).await),
                super::super::hr_keluar::PESAN_DIRI_SENDIRI
            );
            let id_k1 = simpan_kinerja(&client, &yayasan, &buat("K1", "Semester", "ta-2")).await.expect("yayasan menilai K1")
                ["id_penilaian"]
                .as_str()
                .unwrap()
                .to_owned();
            assert_eq!(pesan(rincian_kinerja(&client, &kepsek, &id_k1).await), PESAN_BELUM_FINAL_SENDIRI);
            assert_eq!(
                pesan(simpan_kinerja(&client, &kepsek, &buat("G2", "Semester", "ta-2")).await),
                super::super::hr_keluar::PESAN_DI_LUAR_CAKUPAN
            );
            assert_eq!(
                pesan(simpan_kinerja(&client, &yayasan, &buat("G3", "Semester", "ta-2")).await),
                "Pegawai ini sudah keluar; penilaian baru tidak bisa dibuat."
            );
            let daftar = daftar_kinerja(&client, &kepsek, &json!({ "periode_jenis": "Semester", "periode_kunci": "ta-2" }))
                .await
                .expect("daftar kepsek");
            let ids_daftar: Vec<&str> =
                daftar["penilaian"].as_array().unwrap().iter().map(|p| p["id_karyawan"].as_str().unwrap()).collect();
            assert_eq!(ids_daftar, ["G1", "G1"]);
            let belum: Vec<&str> =
                daftar["belum_dinilai"].as_array().unwrap().iter().map(|p| p["id_karyawan"].as_str().unwrap()).collect();
            assert_eq!(belum, ["G2", "Y1"]);

            // Batal wajib beralasan; akar batal tidak lagi menghalangi.
            let batal = |alasan: &str| json!({ "id_penilaian": id_k1, "jenis": "Batal", "alasan": alasan });
            assert_eq!(pesan(putuskan_kinerja(&client, &yayasan, &batal("")).await), "Alasan pembatalan wajib diisi.");
            putuskan_kinerja(&client, &yayasan, &batal("salah periode")).await.expect("batal");
            let daftar = daftar_kinerja(&client, &yayasan, &json!({ "periode_jenis": "Semester", "periode_kunci": "ta-2" }))
                .await
                .expect("daftar yayasan");
            let belum: Vec<&str> =
                daftar["belum_dinilai"].as_array().unwrap().iter().map(|p| p["id_karyawan"].as_str().unwrap()).collect();
            assert_eq!(belum, ["G2", "K1"]);
            let riwayat = daftar_kinerja(&client, &yayasan, &json!({ "id_karyawan": "G1" })).await.expect("riwayat");
            let berlaku: Vec<bool> =
                riwayat["penilaian"].as_array().unwrap().iter().map(|p| p["berlaku"].as_bool().unwrap()).collect();
            assert_eq!(berlaku.iter().filter(|b| **b).count(), 1);
        });
    }
}
