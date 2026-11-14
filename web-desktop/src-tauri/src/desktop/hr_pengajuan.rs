//! HRIS Fase 2 (`prd-hris.md` §20): pengajuan cuti, izin, sakit, dan dinas
//! luar beserta keputusannya.
//!
//! Isi pengajuan diikat sidik (`sidik_pengajuan`); keputusan append-only
//! membawa sidik yang dilihat pemutus, jadi suntingan sesudah diputus
//! menggugurkan keputusan itu tanpa ada event yang ditolak. Status TIDAK
//! disimpan: diturunkan `status_pengajuan` dan, di SQL, `PENGAJUAN_BERLAKU_SQL`.
//! Cloud tidak pernah menolak keputusan (`ON CONFLICT DO NOTHING`).
//!
//! Aturan murni, pesan, dan SQL di berkas ini dicerminkan
//! `src/lib/validations/hr-pengajuan.ts`; vektornya
//! `validations/hr-pengajuan.vektor.json`, teks SQL dibandingkan harfiah oleh
//! `hr-pengajuan.test.ts`.

use std::collections::{HashMap, HashSet};

use rusqlite::{params, OptionalExtension, Transaction};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

use super::hari_kerja::{parse_hari_kerja, tanggal_valid, wajib_masuk};
use super::hris::{self, rows_json_with};
use super::scanner::{evaluate_holiday_scan, HolidayWhitelistEntry};
use super::time_policy::{add_days, days_between};
use super::{config::DesktopState, models::CommandError, models::OperatorUser, storage, sync};

pub const KELOMPOK: [&str; 4] = ["Cuti", "Izin", "Sakit", "Dinas Luar"];
pub const DAMPAK_GAJI: [&str; 3] = ["Dibayar", "Potong Gaji", "Tidak Berpengaruh"];
pub const SATUAN_MAKS: [&str; 2] = ["Hari Kerja", "Hari Kalender"];
pub const IZIN_PEMUTUS: [&str; 2] = ["hr.request.decide", "hr.request.decide_major"];
pub const KEPUTUSAN_FINAL: [&str; 3] = ["Setujui", "Tolak", "Setujui Urgent"];
pub const AKSI_KEPUTUSAN: [&str; 4] = ["Setujui", "Tolak", "Diketahui", "Batal"];
pub const MAKS_ALASAN: usize = 500;
pub const MAKS_RENTANG_HARI: i64 = 366;
pub const MAKS_HARI_JENIS: i64 = 366;
pub const MAKS_JAM_KE: i64 = 20;

const PESAN_IZIN_PUTUS: &str = "Kamu tidak punya izin memutus jenis pengajuan ini.";
const PESAN_DIRI_SENDIRI: &str = "Pengajuan untuk dirimu sendiri harus diputus orang lain.";
const PESAN_CAKUPAN: &str = "Pegawai ini di luar unit yang kamu pegang.";

// SQL kembar (teks identik dengan TS)

/// Predikat "pengajuan berlaku" (Disetujui / Disetujui (urgent)) atas alias
/// `p`. Dipakai SEMUA pembaca; tidak ada kueri status lain. Pembacanya (Alfa,
/// audit, laporan, gaji) lahir di sub-fase 2b.
#[cfg_attr(not(test), allow(dead_code))]
pub const PENGAJUAN_BERLAKU_SQL: &str = "NOT EXISTS (SELECT 1 FROM hr_pengajuan_keputusan b WHERE b.id_pengajuan = p.id_pengajuan AND b.jenis = 'Batal') AND (SELECT k.jenis FROM hr_pengajuan_keputusan k WHERE k.id_pengajuan = p.id_pengajuan AND k.sidik = p.sidik AND k.jenis IN ('Setujui', 'Tolak', 'Setujui Urgent') ORDER BY k.diterima_cloud IS NULL, k.diterima_cloud, k.waktu_perangkat, k.id_keputusan LIMIT 1) IN ('Setujui', 'Setujui Urgent')";
/// Pengajuan berlaku yang bertumpuk dengan `?1`..`?2`.
#[cfg_attr(not(test), allow(dead_code))]
pub const PENGAJUAN_RENTANG_SQL: &str = "SELECT p.id_pengajuan, p.id_karyawan, p.tanggal_mulai, p.tanggal_selesai, p.kelompok, p.dampak_gaji, p.potong_jatah, p.jam_mulai_ke, p.jam_sampai_ke, p.setengah_hari FROM hr_pengajuan p WHERE p.tanggal_mulai <= ?2 AND p.tanggal_selesai >= ?1 AND NOT EXISTS (SELECT 1 FROM hr_pengajuan_keputusan b WHERE b.id_pengajuan = p.id_pengajuan AND b.jenis = 'Batal') AND (SELECT k.jenis FROM hr_pengajuan_keputusan k WHERE k.id_pengajuan = p.id_pengajuan AND k.sidik = p.sidik AND k.jenis IN ('Setujui', 'Tolak', 'Setujui Urgent') ORDER BY k.diterima_cloud IS NULL, k.diterima_cloud, k.waktu_perangkat, k.id_keputusan LIMIT 1) IN ('Setujui', 'Setujui Urgent') ORDER BY p.id_karyawan, p.tanggal_mulai, p.id_pengajuan;";
/// Proses gaji `PAID` yang periodenya menyentuh `?1`..`?2` (Q-52).
pub const PERIODE_DIBAYAR_SQL: &str = "SELECT period_start, period_end FROM payroll_runs WHERE status = 'PAID' AND period_start <= ?2 AND period_end >= ?1 ORDER BY period_start LIMIT 1;";
/// Proses gaji yang belum dibayar dan tidak ditolak: hanya peringatan.
pub const PERIODE_PERLU_ULANG_SQL: &str = "SELECT period_start, period_end FROM payroll_runs WHERE status NOT IN ('PAID', 'REJECTED') AND period_start <= ?2 AND period_end >= ?1 ORDER BY period_start LIMIT 1;";
/// Pengajuan Menunggu atau berlaku lain milik `?1` (bukan `?2`) yang
/// bertumpuk dengan `?3`..`?4`. Irisan jam dinilai `bentrok_pengajuan`.
pub const PENGAJUAN_AKTIF_ORANG_SQL: &str = "SELECT p.id_pengajuan, p.id_karyawan, p.tanggal_mulai, p.tanggal_selesai, p.jam_mulai_ke, p.jam_sampai_ke FROM hr_pengajuan p WHERE p.id_karyawan = ?1 AND p.id_pengajuan <> ?2 AND p.tanggal_mulai <= ?4 AND p.tanggal_selesai >= ?3 AND NOT EXISTS (SELECT 1 FROM hr_pengajuan_keputusan b WHERE b.id_pengajuan = p.id_pengajuan AND b.jenis = 'Batal') AND COALESCE((SELECT k.jenis FROM hr_pengajuan_keputusan k WHERE k.id_pengajuan = p.id_pengajuan AND k.sidik = p.sidik AND k.jenis IN ('Setujui', 'Tolak', 'Setujui Urgent') ORDER BY k.diterima_cloud IS NULL, k.diterima_cloud, k.waktu_perangkat, k.id_keputusan LIMIT 1), '') <> 'Tolak' ORDER BY p.tanggal_mulai, p.id_pengajuan;";
/// Jenis bawaan: `INSERT OR IGNORE`, jenis yang sudah disunting tidak ditimpa.
pub const SEED_JENIS_SQL: &str = "INSERT OR IGNORE INTO hr_jenis_pengajuan (id_jenis, nama, kelompok, izin_pemutus, boleh_urgent, potong_jatah, wajib_dokumen, dampak_gaji, maks_hari, satuan_maks, is_aktif) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 1);";
pub const SIMPAN_JENIS_SQL: &str = "INSERT INTO hr_jenis_pengajuan (id_jenis, nama, kelompok, izin_pemutus, boleh_urgent, potong_jatah, wajib_dokumen, dampak_gaji, maks_hari, satuan_maks, is_aktif, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, datetime('now'), datetime('now')) ON CONFLICT(id_jenis) DO UPDATE SET nama = excluded.nama, kelompok = excluded.kelompok, izin_pemutus = excluded.izin_pemutus, boleh_urgent = excluded.boleh_urgent, potong_jatah = excluded.potong_jatah, wajib_dokumen = excluded.wajib_dokumen, dampak_gaji = excluded.dampak_gaji, maks_hari = excluded.maks_hari, satuan_maks = excluded.satuan_maks, is_aktif = excluded.is_aktif, updated_at = excluded.updated_at;";
/// ?1 = nama ternormalisasi, ?2 = id jenis yang disimpan.
pub const BENTROK_JENIS_SQL: &str =
    "SELECT 1 FROM hr_jenis_pengajuan WHERE lower(nama) = lower(?1) AND id_jenis <> ?2 LIMIT 1;";
pub const JENIS_SQL: &str = "SELECT id_jenis, nama, kelompok, izin_pemutus, boleh_urgent, potong_jatah, wajib_dokumen, dampak_gaji, maks_hari, satuan_maks, is_aktif FROM hr_jenis_pengajuan ORDER BY is_aktif DESC, kelompok, nama, id_jenis\n-- batas: daftar jenis pengajuan sekolah, tidak tumbuh per hari\n;";
/// Upsert penuh; `diajukan_oleh` tidak berubah saat disunting.
pub const SIMPAN_PENGAJUAN_SQL: &str = "INSERT INTO hr_pengajuan (id_pengajuan, id_karyawan, id_jenis, kelompok, potong_jatah, dampak_gaji, izin_pemutus, tanggal_mulai, tanggal_selesai, jam_mulai_ke, jam_sampai_ke, setengah_hari, alasan, sidik, diajukan_oleh, waktu_perangkat, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, datetime('now'), datetime('now')) ON CONFLICT(id_pengajuan) DO UPDATE SET id_karyawan = excluded.id_karyawan, id_jenis = excluded.id_jenis, kelompok = excluded.kelompok, potong_jatah = excluded.potong_jatah, dampak_gaji = excluded.dampak_gaji, izin_pemutus = excluded.izin_pemutus, tanggal_mulai = excluded.tanggal_mulai, tanggal_selesai = excluded.tanggal_selesai, jam_mulai_ke = excluded.jam_mulai_ke, jam_sampai_ke = excluded.jam_sampai_ke, setengah_hari = excluded.setengah_hari, alasan = excluded.alasan, sidik = excluded.sidik, waktu_perangkat = excluded.waktu_perangkat, updated_at = excluded.updated_at;";
/// Keputusan di perangkat: `diterima_cloud` kosong sampai tertarik lagi.
pub const SIMPAN_KEPUTUSAN_SQL: &str = "INSERT OR IGNORE INTO hr_pengajuan_keputusan (id_keputusan, id_pengajuan, jenis, sidik, alasan, oleh, id_karyawan_oleh, waktu_perangkat, diterima_cloud, created_at) VALUES (?1, ?2, ?3, ?4, NULLIF(?5, ''), ?6, NULLIF(?7, ''), ?8, NULL, datetime('now'));";
/// Keputusan di cloud (handler dan Web): yang pertama sampai berlaku.
pub const CLOUD_KEPUTUSAN_SQL: &str = "INSERT INTO hr_pengajuan_keputusan (id_keputusan, id_pengajuan, jenis, sidik, alasan, oleh, id_karyawan_oleh, waktu_perangkat, diterima_cloud, created_at) VALUES (?1, ?2, ?3, ?4, NULLIF(?5, ''), ?6, NULLIF(?7, ''), ?8, datetime('now'), datetime('now')) ON CONFLICT(id_keputusan) DO NOTHING;";
/// ?1 = dari, ?2 = sampai. Pengajuan tanpa keputusan apa pun selalu ikut,
/// supaya yang menunggu lama tidak hilang dari daftar.
pub const DAFTAR_PENGAJUAN_SQL: &str = "SELECT p.id_pengajuan, p.id_karyawan, COALESCE(m.nama, p.id_karyawan) AS nama, COALESCE(m.unit, '') AS unit, CASE WHEN EXISTS (SELECT 1 FROM guru_data g WHERE g.id_guru = p.id_karyawan) THEN 1 ELSE 0 END AS guru, p.id_jenis, COALESCE(j.nama, p.id_jenis) AS nama_jenis, p.kelompok, p.potong_jatah, p.dampak_gaji, p.izin_pemutus, p.tanggal_mulai, p.tanggal_selesai, p.jam_mulai_ke, p.jam_sampai_ke, p.setengah_hari, p.alasan, p.sidik, p.diajukan_oleh, p.waktu_perangkat FROM hr_pengajuan p LEFT JOIN master_data m ON m.id_unik = p.id_karyawan LEFT JOIN hr_jenis_pengajuan j ON j.id_jenis = p.id_jenis WHERE (p.tanggal_mulai <= ?2 AND p.tanggal_selesai >= ?1) OR NOT EXISTS (SELECT 1 FROM hr_pengajuan_keputusan k WHERE k.id_pengajuan = p.id_pengajuan) ORDER BY p.tanggal_mulai DESC, p.id_pengajuan LIMIT 1000;";
/// ?1 = larik JSON id pengajuan.
pub const DAFTAR_KEPUTUSAN_SQL: &str = "SELECT k.id_keputusan, k.id_pengajuan, k.jenis, k.sidik, COALESCE(k.alasan, '') AS alasan, k.oleh, COALESCE(k.id_karyawan_oleh, '') AS id_karyawan_oleh, COALESCE(mo.unit, '') AS unit_oleh, k.waktu_perangkat, k.diterima_cloud FROM hr_pengajuan_keputusan k LEFT JOIN master_data mo ON mo.id_unik = k.id_karyawan_oleh WHERE k.id_pengajuan IN (SELECT value FROM json_each(?1)) ORDER BY k.id_pengajuan, k.created_at, k.id_keputusan;";
/// Pegawai aktif untuk form ajukan.
pub const PEGAWAI_PENGAJUAN_SQL: &str = "SELECT m.id_unik, m.nama, COALESCE(m.unit, '') AS unit, CASE WHEN EXISTS (SELECT 1 FROM guru_data g WHERE g.id_guru = m.id_unik) THEN 1 ELSE 0 END AS guru FROM master_data m WHERE COALESCE(m.status_aktif, 'Aktif') = 'Aktif' AND LOWER(TRIM(COALESCE(m.jenis_personil, ''))) <> 'siswa' AND NOT EXISTS (SELECT 1 FROM siswa_data sd WHERE sd.id_siswa = m.id_unik) ORDER BY m.nama, m.id_unik\n-- batas: pegawai aktif, dibatasi jumlah pegawai sekolah\n;";
/// Satu pegawai (bukan siswa) + jadwal shift kininya.
pub const PEGAWAI_SATU_SQL: &str = "SELECT COALESCE(m.unit, '') AS unit, CASE WHEN EXISTS (SELECT 1 FROM guru_data g WHERE g.id_guru = m.id_unik) THEN 1 ELSE 0 END AS guru, COALESCE(m.divisi, '') AS divisi, s.hari_kerja, s.kode_shift FROM master_data m LEFT JOIN tbl_shift s ON s.id_shift = m.id_shift WHERE m.id_unik = ?1 AND LOWER(TRIM(COALESCE(m.jenis_personil, ''))) <> 'siswa' AND NOT EXISTS (SELECT 1 FROM siswa_data sd WHERE sd.id_siswa = m.id_unik);";
/// Unit personil yang tertaut ke sesi (A-5).
pub const UNIT_PERSONIL_SQL: &str =
    "SELECT COALESCE(unit, '') AS unit FROM master_data WHERE id_unik = ?1;";
/// Batas JP unit bernama ?1 dan batas sekolah (`jp_max_for_unit`).
pub const JP_MAX_SQL: &str = "SELECT (SELECT s.value FROM akademik_unit u JOIN setting_gex_system s ON s.key = 'jp_max_per_hari:' || u.id_unit WHERE lower(trim(u.nama_unit)) = lower(trim(?1)) ORDER BY u.status_aktif DESC, u.id_unit LIMIT 1) AS unit, (SELECT value FROM setting_gex_system WHERE key = 'jp_max_per_hari') AS sekolah;";
pub const LIBUR_SQL: &str = "SELECT tanggal FROM tbl_hari_libur WHERE status_aktif = 1 AND tanggal >= ?1 AND tanggal <= ?2;";
pub const WHITELIST_SQL: &str = "SELECT id, scope_type, scope_value, tanggal_libur, status_aktif FROM hari_libur_whitelist WHERE status_aktif = 1\n-- batas: daftar pengecualian libur, tidak tumbuh per hari\n;";
pub const PENGAJUAN_SATU_SQL: &str = "SELECT id_pengajuan, id_karyawan, id_jenis, kelompok, potong_jatah, dampak_gaji, izin_pemutus, tanggal_mulai, tanggal_selesai, jam_mulai_ke, jam_sampai_ke, setengah_hari, alasan, sidik, diajukan_oleh, waktu_perangkat FROM hr_pengajuan WHERE id_pengajuan = ?1;";
pub const KEPUTUSAN_SATU_SQL: &str = "SELECT id_keputusan, jenis, sidik, oleh, waktu_perangkat, diterima_cloud FROM hr_pengajuan_keputusan WHERE id_pengajuan = ?1 ORDER BY created_at, id_keputusan\n-- batas: satu sampai tiga keputusan per pengajuan\n;";
pub const WAKTU_SQL: &str =
    "SELECT datetime('now', '+7 hours') AS waktu, date('now', '+7 hours') AS hari_ini;";

// Rute 2b/2c, didaftarkan sejak v69 karena tabelnya lahir bersama. TS
// mendapat kembarannya bersama layar yang menulisnya.
pub const CLOUD_PENYESUAIAN_SQL: &str = "INSERT INTO hr_cuti_penyesuaian (id_penyesuaian, id_karyawan, periode, jenis, id_ref, hari, alasan, dicatat_oleh, created_at) VALUES (?1, ?2, ?3, ?4, NULLIF(?5, ''), ?6, ?7, ?8, datetime('now')) ON CONFLICT(id_penyesuaian) DO NOTHING;";
pub const CLOUD_PENANGANAN_SQL: &str = "INSERT INTO hr_jp_penanganan (id_penanganan, id_pengajuan, tanggal, id_jadwal, id_rombel, id_mapel, jam_ke, status, id_guru_pengganti, catatan, dicatat_oleh, waktu_perangkat, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, NULLIF(?5, ''), NULLIF(?6, ''), NULLIF(?7, ''), ?8, NULLIF(?9, ''), NULLIF(?10, ''), ?11, ?12, datetime('now'), datetime('now')) ON CONFLICT(id_penanganan) DO UPDATE SET id_rombel = excluded.id_rombel, id_mapel = excluded.id_mapel, jam_ke = excluded.jam_ke, status = excluded.status, id_guru_pengganti = excluded.id_guru_pengganti, catatan = excluded.catatan, dicatat_oleh = excluded.dicatat_oleh, waktu_perangkat = excluded.waktu_perangkat, updated_at = excluded.updated_at;";

// Jenis bawaan

const JENIS_BAWAAN_JSON: &str = include_str!("../../../src/lib/validations/hr-jenis-bawaan.json");

#[derive(Debug, Clone, Deserialize)]
pub struct JenisBawaan {
    pub id_jenis: String,
    pub nama: String,
    pub kelompok: String,
    pub izin_pemutus: String,
    pub boleh_urgent: bool,
    pub potong_jatah: bool,
    pub dampak_gaji: String,
    pub maks_hari: Option<i64>,
    pub satuan_maks: String,
    pub wajib_dokumen: bool,
}

/// Jenis bawaan §20.2.2, berkas yang sama dengan seed Web.
pub fn jenis_bawaan() -> Vec<JenisBawaan> {
    serde_json::from_str(JENIS_BAWAAN_JSON).expect("hr-jenis-bawaan.json sah")
}

/// Argumen `SEED_JENIS_SQL`. Cermin `seedJenisArgs`.
pub fn seed_jenis_args(j: &JenisBawaan) -> Vec<Value> {
    vec![
        json!(j.id_jenis),
        json!(j.nama),
        json!(j.kelompok),
        json!(j.izin_pemutus),
        json!(i64::from(j.boleh_urgent)),
        json!(i64::from(j.potong_jatah)),
        json!(i64::from(j.wajib_dokumen)),
        json!(j.dampak_gaji),
        json!(j.maks_hari),
        json!(j.satuan_maks),
    ]
}

/// Seed lokal tanpa outbox: jenis bawaan berid tetap juga ada di cloud.
pub fn seed_jenis_lokal(connection: &rusqlite::Connection) -> rusqlite::Result<()> {
    for jenis in jenis_bawaan() {
        connection.execute(
            SEED_JENIS_SQL,
            params![
                jenis.id_jenis,
                jenis.nama,
                jenis.kelompok,
                jenis.izin_pemutus,
                i64::from(jenis.boleh_urgent),
                i64::from(jenis.potong_jatah),
                i64::from(jenis.wajib_dokumen),
                jenis.dampak_gaji,
                jenis.maks_hari,
                jenis.satuan_maks,
            ],
        )?;
    }
    Ok(())
}

// Pembantu isian

/// Cermin `teks`: string dirapikan, angka ditulis ulang, lainnya kosong.
fn teks(draft: &Value, kunci: &str) -> String {
    match draft.get(kunci) {
        Some(Value::String(s)) => s.trim().to_owned(),
        Some(Value::Number(n)) => n.to_string(),
        _ => String::new(),
    }
}

/// Cermin `bendera`: hanya `true` atau `1`.
fn bendera(draft: &Value, kunci: &str) -> bool {
    match draft.get(kunci) {
        Some(Value::Bool(b)) => *b,
        Some(v) => v.as_i64() == Some(1),
        None => false,
    }
}

/// Cermin `angkaOpsional`: kosong = `Ok(None)`, bilangan bulat dalam
/// `min..=maks` = `Ok(Some)`, selain itu `Err`.
fn angka_opsional(draft: &Value, kunci: &str, min: i64, maks: i64) -> Result<Option<i64>, ()> {
    match draft.get(kunci) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(s)) if s.trim().is_empty() => Ok(None),
        Some(v) => v
            .as_i64()
            .filter(|n| (min..=maks).contains(n))
            .map(Some)
            .ok_or(()),
    }
}

fn panjang(teks: &str) -> usize {
    teks.chars().count()
}

/// Cermin `tanggalRentang`: inklusif, paling banyak 400 tanggal.
pub fn tanggal_rentang(mulai: &str, selesai: &str) -> Vec<String> {
    let mut hasil = Vec::new();
    let mut t = mulai.to_owned();
    while t.as_str() <= selesai && hasil.len() < 400 {
        hasil.push(t.clone());
        match add_days(&t, 1) {
            Ok(berikut) => t = berikut,
            Err(_) => break,
        }
    }
    hasil
}

// Jenis pengajuan

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct JenisPengajuan {
    pub nama: String,
    pub kelompok: String,
    pub izin_pemutus: String,
    pub boleh_urgent: bool,
    pub potong_jatah: bool,
    pub dampak_gaji: String,
    pub maks_hari: Option<i64>,
    pub satuan_maks: String,
    pub wajib_dokumen: bool,
    pub is_aktif: bool,
}

/// Cermin `validasiJenis`. Id diurus pemanggil.
pub fn validasi_jenis(draft: &Value) -> Result<JenisPengajuan, String> {
    let nama = hris::validasi_nama_master(&teks(draft, "nama"), "jenis pengajuan")?;
    let kelompok = teks(draft, "kelompok");
    if !KELOMPOK.contains(&kelompok.as_str()) {
        return Err("Kelompok harus Cuti, Izin, Sakit, atau Dinas Luar.".into());
    }
    let mut izin_pemutus = teks(draft, "izin_pemutus");
    if izin_pemutus.is_empty() {
        izin_pemutus = IZIN_PEMUTUS[0].to_owned();
    }
    if !IZIN_PEMUTUS.contains(&izin_pemutus.as_str()) {
        return Err("Pemutus pengajuan tidak dikenal.".into());
    }
    let dampak_gaji = teks(draft, "dampak_gaji");
    if !DAMPAK_GAJI.contains(&dampak_gaji.as_str()) {
        return Err("Dampak gaji tidak dikenal.".into());
    }
    let mut satuan_maks = teks(draft, "satuan_maks");
    if satuan_maks.is_empty() {
        satuan_maks = SATUAN_MAKS[0].to_owned();
    }
    if !SATUAN_MAKS.contains(&satuan_maks.as_str()) {
        return Err("Satuan batas hari tidak dikenal.".into());
    }
    let potong_jatah = bendera(draft, "potong_jatah");
    if potong_jatah && kelompok != "Cuti" {
        return Err("Hanya kelompok Cuti yang bisa memotong jatah cuti.".into());
    }
    let maks_hari = angka_opsional(draft, "maks_hari", 1, MAKS_HARI_JENIS)
        .map_err(|_| format!("Batas hari harus 1 sampai {MAKS_HARI_JENIS}."))?;
    Ok(JenisPengajuan {
        nama,
        kelompok,
        izin_pemutus,
        boleh_urgent: bendera(draft, "boleh_urgent"),
        potong_jatah,
        dampak_gaji,
        maks_hari,
        satuan_maks,
        wajib_dokumen: bendera(draft, "wajib_dokumen"),
        is_aktif: draft.get("is_aktif").is_none() || bendera(draft, "is_aktif"),
    })
}

// Isian pengajuan

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PengajuanSah {
    pub id_karyawan: String,
    pub id_jenis: String,
    pub tanggal_mulai: String,
    pub tanggal_selesai: String,
    pub jam_mulai_ke: Option<i64>,
    pub jam_sampai_ke: Option<i64>,
    pub setengah_hari: bool,
    pub alasan: String,
    pub urgent: bool,
}

/// Cermin `validasiPengajuan`: kelengkapan isian, tanpa data jenis.
pub fn validasi_pengajuan(draft: &Value) -> Result<PengajuanSah, String> {
    let id_karyawan = teks(draft, "id_karyawan");
    if id_karyawan.is_empty() {
        return Err("Pilih pegawai.".into());
    }
    let id_jenis = teks(draft, "id_jenis");
    if id_jenis.is_empty() {
        return Err("Pilih jenis pengajuan.".into());
    }
    let mulai = teks(draft, "tanggal_mulai");
    let selesai = teks(draft, "tanggal_selesai");
    if !tanggal_valid(&mulai) || !tanggal_valid(&selesai) {
        return Err("Tanggal pengajuan tidak valid.".into());
    }
    if selesai < mulai {
        return Err("Tanggal selesai tidak boleh sebelum tanggal mulai.".into());
    }
    if days_between(&mulai, &selesai).unwrap_or(i64::MAX) >= MAKS_RENTANG_HARI {
        return Err(format!(
            "Rentang pengajuan paling panjang {MAKS_RENTANG_HARI} hari."
        ));
    }
    let pesan_jam = || format!("Jam ke-N harus angka 1 sampai {MAKS_JAM_KE}.");
    let jam_mulai_ke =
        angka_opsional(draft, "jam_mulai_ke", 1, MAKS_JAM_KE).map_err(|_| pesan_jam())?;
    let jam_sampai_ke =
        angka_opsional(draft, "jam_sampai_ke", 1, MAKS_JAM_KE).map_err(|_| pesan_jam())?;
    let setengah_hari = bendera(draft, "setengah_hari");
    if setengah_hari && mulai != selesai {
        return Err("Setengah hari hanya untuk satu tanggal.".into());
    }
    if setengah_hari && (jam_mulai_ke.is_some() || jam_sampai_ke.is_some()) {
        return Err("Pilih setengah hari atau jam ke-N, tidak keduanya.".into());
    }
    if let (Some(a), Some(b)) = (jam_mulai_ke, jam_sampai_ke) {
        if mulai == selesai && b < a {
            return Err("Jam selesai tidak boleh sebelum jam mulai.".into());
        }
    }
    let alasan = teks(draft, "alasan");
    if alasan.is_empty() {
        return Err("Alasan wajib diisi.".into());
    }
    if panjang(&alasan) > MAKS_ALASAN {
        return Err(format!("Alasan maksimal {MAKS_ALASAN} karakter."));
    }
    Ok(PengajuanSah {
        id_karyawan,
        id_jenis,
        tanggal_mulai: mulai,
        tanggal_selesai: selesai,
        jam_mulai_ke,
        jam_sampai_ke,
        setengah_hari,
        alasan,
        urgent: bendera(draft, "urgent"),
    })
}

/// Cermin `periksaJenis`. `guru` = punya `guru_data` (Q-24); `jp_max` =
/// batas JP unit pegawai (`jp_max_for_unit`).
pub fn periksa_jenis(
    p: &PengajuanSah,
    jenis: &JenisPengajuan,
    guru: bool,
    jp_max: i64,
) -> Result<(), String> {
    if !jenis.is_aktif {
        return Err("Jenis pengajuan ini sudah nonaktif.".into());
    }
    if p.urgent && !jenis.boleh_urgent {
        return Err("Jenis pengajuan ini tidak boleh urgent.".into());
    }
    if p.setengah_hari {
        if jenis.kelompok != "Izin" {
            return Err("Setengah hari hanya untuk kelompok Izin.".into());
        }
        if guru {
            return Err("Guru memakai jam ke-N, bukan setengah hari.".into());
        }
    }
    let jam = [p.jam_mulai_ke, p.jam_sampai_ke];
    if jam.iter().any(Option::is_some) {
        if !guru {
            return Err("Jam ke-N hanya untuk guru.".into());
        }
        if jenis.kelompok == "Cuti" {
            return Err("Cuti selalu hari penuh.".into());
        }
        if jam.iter().flatten().any(|n| *n > jp_max) {
            return Err(format!("Jam ke-N paling besar {jp_max}."));
        }
    }
    Ok(())
}

/// Cermin `periksaMaks`.
pub fn periksa_maks(
    jenis: &JenisPengajuan,
    hari_kerja: i64,
    hari_kalender: i64,
) -> Result<(), String> {
    let Some(maks) = jenis.maks_hari else {
        return Ok(());
    };
    let kalender = jenis.satuan_maks == "Hari Kalender";
    let jumlah = if kalender { hari_kalender } else { hari_kerja };
    if jumlah > maks {
        let satuan = if kalender {
            "hari kalender"
        } else {
            "hari kerja"
        };
        return Err(format!("{} paling lama {maks} {satuan}.", jenis.nama));
    }
    Ok(())
}

// Sidik

/// Isi yang ikut sidik: salinan jenis saat diajukan + isian.
#[derive(Debug, Clone, Deserialize)]
pub struct IsiPengajuan {
    pub id_karyawan: String,
    pub id_jenis: String,
    pub kelompok: String,
    pub potong_jatah: bool,
    pub dampak_gaji: String,
    pub izin_pemutus: String,
    pub tanggal_mulai: String,
    pub tanggal_selesai: String,
    pub jam_mulai_ke: Option<i64>,
    pub jam_sampai_ke: Option<i64>,
    pub setengah_hari: bool,
    pub alasan: String,
}

/// Cermin `kanonikPengajuan`: bagian dipisah `\u{1f}`, karakter yang tidak
/// bisa diketik di isian mana pun.
pub fn kanonik_pengajuan(isi: &IsiPengajuan) -> String {
    let angka = |n: Option<i64>| n.map(|n| n.to_string()).unwrap_or_default();
    [
        isi.id_karyawan.clone(),
        isi.id_jenis.clone(),
        isi.kelompok.clone(),
        if isi.potong_jatah { "1" } else { "0" }.to_owned(),
        isi.dampak_gaji.clone(),
        isi.izin_pemutus.clone(),
        isi.tanggal_mulai.clone(),
        isi.tanggal_selesai.clone(),
        angka(isi.jam_mulai_ke),
        angka(isi.jam_sampai_ke),
        if isi.setengah_hari { "1" } else { "0" }.to_owned(),
        isi.alasan.clone(),
    ]
    .join("\u{1f}")
}

/// Cermin `sidikPengajuan` (`services/hr-pengajuan.ts`): SHA-256 heks.
pub fn sidik_pengajuan(isi: &IsiPengajuan) -> String {
    hex::encode(Sha256::digest(kanonik_pengajuan(isi).as_bytes()))
}

// Status dan tanda

#[derive(Debug, Clone, Deserialize)]
pub struct Keputusan {
    pub id_keputusan: String,
    pub jenis: String,
    pub sidik: String,
    pub oleh: String,
    pub waktu_perangkat: String,
    #[serde(default)]
    pub diterima_cloud: Option<String>,
}

/// Cermin `urutKeputusan`, sama dengan ORDER BY `PENGAJUAN_BERLAKU_SQL`.
pub fn urut_keputusan(a: &Keputusan, b: &Keputusan) -> std::cmp::Ordering {
    a.diterima_cloud
        .is_none()
        .cmp(&b.diterima_cloud.is_none())
        .then_with(|| a.diterima_cloud.cmp(&b.diterima_cloud))
        .then_with(|| a.waktu_perangkat.cmp(&b.waktu_perangkat))
        .then_with(|| a.id_keputusan.cmp(&b.id_keputusan))
}

fn final_(k: &Keputusan) -> bool {
    KEPUTUSAN_FINAL.contains(&k.jenis.as_str())
}

/// Cermin `keputusanBerlaku`: keputusan final pertama bersidik sama.
pub fn keputusan_berlaku<'a>(sidik: &str, keputusan: &'a [Keputusan]) -> Option<&'a Keputusan> {
    keputusan
        .iter()
        .filter(|k| final_(k) && k.sidik == sidik)
        .min_by(|a, b| urut_keputusan(a, b))
}

/// Cermin `statusPengajuan`.
pub fn status_pengajuan(sidik: &str, keputusan: &[Keputusan]) -> &'static str {
    if keputusan.iter().any(|k| k.jenis == "Batal") {
        return "Dibatalkan";
    }
    match keputusan_berlaku(sidik, keputusan).map(|k| k.jenis.as_str()) {
        Some("Tolak") => "Ditolak",
        Some("Setujui") => "Disetujui",
        Some("Setujui Urgent") => "Disetujui (urgent)",
        _ => "Menunggu",
    }
}

pub fn status_berlaku(status: &str) -> bool {
    status == "Disetujui" || status == "Disetujui (urgent)"
}

fn sama_orang(a: &str, b: &str) -> bool {
    a.trim().to_lowercase() == b.trim().to_lowercase()
}

/// Cermin `tandaKeputusan`. `cakupan_berlaku` = keputusan yang berlaku
/// dibuat pemutus yang (kini) dalam cakupan unit pegawai; `None` = tidak
/// diketahui (pemutus tanpa tautan personil).
pub fn tanda_keputusan(
    sidik: &str,
    diajukan_oleh: &str,
    keputusan: &[Keputusan],
    cakupan_berlaku: Option<bool>,
) -> Vec<&'static str> {
    let status = status_pengajuan(sidik, keputusan);
    let mut tanda = Vec::new();
    if status == "Disetujui (urgent)" && !keputusan.iter().any(|k| k.jenis == "Diketahui") {
        tanda.push("perlu_diketahui");
    }
    let finals: Vec<&Keputusan> = keputusan.iter().filter(|k| final_(k)).collect();
    let sah: Vec<&&Keputusan> = finals.iter().filter(|k| k.sidik == sidik).collect();
    if sah.iter().any(|k| k.jenis == "Tolak") && sah.iter().any(|k| k.jenis != "Tolak") {
        tanda.push("keputusan_ganda");
    }
    if status != "Dibatalkan" && !finals.is_empty() && sah.is_empty() {
        tanda.push("keputusan_gugur");
    }
    if status != "Dibatalkan" && status != "Menunggu" {
        if let Some(berlaku) = keputusan_berlaku(sidik, keputusan) {
            // Urgent memang diputus pengajunya; Q-57 hanya Setujui/Tolak.
            if berlaku.jenis != "Setujui Urgent" && sama_orang(&berlaku.oleh, diajukan_oleh) {
                tanda.push("diputus_sendiri");
            }
        }
        if cakupan_berlaku == Some(false) {
            tanda.push("di_luar_cakupan");
        }
    }
    tanda
}

// Bertumpuk, hari wajib, cakupan

#[derive(Debug, Clone, Deserialize)]
pub struct Ringkas {
    pub id_karyawan: String,
    pub tanggal_mulai: String,
    pub tanggal_selesai: String,
    #[serde(default)]
    pub jam_mulai_ke: Option<i64>,
    #[serde(default)]
    pub jam_sampai_ke: Option<i64>,
}

/// Jam ke-N yang ditutup pengajuan pada tanggal `t` (inklusif).
fn jam_pada(r: &Ringkas, t: &str) -> (i64, i64) {
    let awal = if t == r.tanggal_mulai {
        r.jam_mulai_ke.unwrap_or(1)
    } else {
        1
    };
    let akhir = if t == r.tanggal_selesai {
        r.jam_sampai_ke.unwrap_or(i64::MAX)
    } else {
        i64::MAX
    };
    (awal, akhir)
}

/// Cermin `bentrokPengajuan`: orang sama, tanggal beririsan, dan jam ke-N
/// beririsan di salah satu tanggal irisannya. Setengah hari = hari penuh.
pub fn bentrok_pengajuan(a: &Ringkas, b: &Ringkas) -> bool {
    if a.id_karyawan.trim() != b.id_karyawan.trim() {
        return false;
    }
    let mulai = a.tanggal_mulai.as_str().max(b.tanggal_mulai.as_str());
    let selesai = a.tanggal_selesai.as_str().min(b.tanggal_selesai.as_str());
    if mulai > selesai {
        return false;
    }
    // Tanggal di tengah irisan adalah hari tengah keduanya: penuh.
    if days_between(mulai, selesai).unwrap_or(i64::MAX) >= 2 {
        return true;
    }
    [mulai, selesai].iter().any(|t| {
        let (a0, a1) = jam_pada(a, t);
        let (b0, b1) = jam_pada(b, t);
        a0 <= b1 && b0 <= a1
    })
}

pub struct Jadwal {
    pub hari_masuk: Vec<i64>,
    pub divisi: String,
    pub kode_shift: Option<i64>,
}

/// Cermin `tanggalWajib`: tanggal dalam rentang yang wajib masuk bagi orang
/// itu (shift kini, libur aktif, whitelist libur).
pub fn tanggal_wajib(
    jadwal: &Jadwal,
    libur: &HashSet<String>,
    whitelist: &[HolidayWhitelistEntry],
    mulai: &str,
    selesai: &str,
) -> Vec<String> {
    tanggal_rentang(mulai, selesai)
        .into_iter()
        .filter(|t| {
            let hari_libur = libur.contains(t);
            let masuk_saat_libur = hari_libur
                && evaluate_holiday_scan(whitelist, t, &jadwal.divisi, jadwal.kode_shift).is_some();
            wajib_masuk(t, &jadwal.hari_masuk, hari_libur, masuk_saat_libur)
        })
        .collect()
}

fn unit_normal(unit: &str) -> String {
    unit.trim().to_lowercase()
}

/// Cermin `dalamCakupan` (A-5): `hr.scope.all`, atau unit akun tidak kosong
/// dan sama dengan unit sasaran.
pub fn dalam_cakupan(lingkup_semua: bool, unit_akun: &str, unit_sasaran: &str) -> bool {
    lingkup_semua
        || (!unit_normal(unit_akun).is_empty()
            && unit_normal(unit_akun) == unit_normal(unit_sasaran))
}

// Aturan aksi

#[derive(Debug, Clone, Deserialize)]
pub struct KeadaanAksi {
    pub status: String,
    pub sudah_diketahui: bool,
    pub pengaju_sendiri: bool,
    pub superadmin: bool,
    /// Pegawai pengajuan = personil yang tertaut ke sesi.
    pub karyawan_sendiri: bool,
    /// Sesi memegang `izin_pemutus` jenisnya.
    pub boleh_putus: bool,
    pub dalam_cakupan: bool,
}

fn boleh_memutus(k: &KeadaanAksi) -> Result<(), String> {
    if !k.boleh_putus {
        return Err(PESAN_IZIN_PUTUS.into());
    }
    if k.karyawan_sendiri {
        return Err(PESAN_DIRI_SENDIRI.into());
    }
    if !k.dalam_cakupan {
        return Err(PESAN_CAKUPAN.into());
    }
    Ok(())
}

/// Cermin `periksaAksi`.
pub fn periksa_aksi(aksi: &str, alasan: &str, k: &KeadaanAksi) -> Result<(), String> {
    if !AKSI_KEPUTUSAN.contains(&aksi) {
        return Err("Keputusan tidak dikenal.".into());
    }
    if panjang(alasan.trim()) > MAKS_ALASAN {
        return Err(format!("Alasan maksimal {MAKS_ALASAN} karakter."));
    }
    let tanpa_alasan = alasan.trim().is_empty();
    match aksi {
        "Setujui" | "Tolak" => {
            if k.status != "Menunggu" {
                return Err("Pengajuan ini tidak lagi menunggu keputusan.".into());
            }
            boleh_memutus(k)?;
            if aksi == "Tolak" && tanpa_alasan {
                return Err("Alasan penolakan wajib diisi.".into());
            }
        }
        "Diketahui" => {
            if k.status != "Disetujui (urgent)" || k.sudah_diketahui {
                return Err(
                    "Hanya pengajuan urgent yang belum diketahui yang bisa ditandai.".into(),
                );
            }
            boleh_memutus(k)?;
        }
        _ => {
            if tanpa_alasan {
                return Err("Alasan pembatalan wajib diisi.".into());
            }
            if k.status == "Menunggu" {
                if !k.pengaju_sendiri && !k.superadmin {
                    return Err(
                        "Hanya pengaju yang bisa membatalkan pengajuan yang masih menunggu.".into(),
                    );
                }
            } else if status_berlaku(&k.status) {
                boleh_memutus(k)?;
            } else {
                return Err(
                    "Pengajuan yang ditolak atau dibatalkan tidak bisa dibatalkan lagi.".into(),
                );
            }
        }
    }
    Ok(())
}

/// Cermin `periksaSunting`.
pub fn periksa_sunting(
    status: &str,
    pengaju_sendiri: bool,
    superadmin: bool,
) -> Result<(), String> {
    if status != "Menunggu" {
        return Err("Pengajuan yang sudah diputus tidak bisa disunting.".into());
    }
    if !pengaju_sendiri && !superadmin {
        return Err("Hanya pengaju yang bisa menyunting pengajuan ini.".into());
    }
    Ok(())
}

/// Cermin `periksaUrgent`: urgent = menyetujui sekaligus.
pub fn periksa_urgent(karyawan_sendiri: bool, dalam_cakupan: bool) -> Result<(), String> {
    if karyawan_sendiri {
        return Err("Pengajuan urgent untuk dirimu sendiri tidak bisa disetujui sendiri.".into());
    }
    if !dalam_cakupan {
        return Err(PESAN_CAKUPAN.into());
    }
    Ok(())
}

pub fn pesan_periode_dibayar(mulai: &str, selesai: &str) -> String {
    format!("Gaji periode {mulai} s.d. {selesai} sudah dibayar; pengajuan di tanggal itu tidak bisa diubah.")
}

pub fn pesan_bertumpuk(mulai: &str, selesai: &str) -> String {
    format!("Tanggal itu bertumpuk dengan pengajuan lain pegawai ini ({mulai} s.d. {selesai}).")
}

pub fn pesan_run_ulang(mulai: &str, selesai: &str) -> String {
    format!("Proses gaji periode {mulai} s.d. {selesai} sudah dibuat; buat ulang supaya pengajuan ini ikut dihitung.")
}

// Handler cloud (tidak pernah menolak)

fn id_dari(payload: &Value, kunci: &str, entity_key: &str) -> String {
    Some(teks(payload, kunci))
        .filter(|id| !id.is_empty())
        .unwrap_or_else(|| entity_key.trim().to_owned())
}

fn nilai_opsional(payload: &Value, kunci: &str) -> Value {
    payload
        .get(kunci)
        .and_then(Value::as_i64)
        .map_or(Value::Null, |n| json!(n))
}

/// `hr-request-type/save`: upsert penuh. Payload cacat = tanpa statement.
pub fn cloud_jenis_statements(payload: &Value, entity_key: &str) -> Vec<(String, Vec<Value>)> {
    let id = id_dari(payload, "id_jenis", entity_key);
    let Ok(j) = validasi_jenis(payload) else {
        return Vec::new();
    };
    if id.is_empty() {
        return Vec::new();
    }
    vec![(SIMPAN_JENIS_SQL.to_owned(), jenis_args(&id, &j))]
}

fn jenis_args(id: &str, j: &JenisPengajuan) -> Vec<Value> {
    vec![
        json!(id),
        json!(j.nama),
        json!(j.kelompok),
        json!(j.izin_pemutus),
        json!(i64::from(j.boleh_urgent)),
        json!(i64::from(j.potong_jatah)),
        json!(i64::from(j.wajib_dokumen)),
        json!(j.dampak_gaji),
        json!(j.maks_hari),
        json!(j.satuan_maks),
        json!(i64::from(j.is_aktif)),
    ]
}

/// Argumen `SIMPAN_PENGAJUAN_SQL` dari payload `hr-request/save`.
fn pengajuan_args(p: &Value) -> Vec<Value> {
    vec![
        json!(teks(p, "id_pengajuan")),
        json!(teks(p, "id_karyawan")),
        json!(teks(p, "id_jenis")),
        json!(teks(p, "kelompok")),
        json!(i64::from(bendera(p, "potong_jatah"))),
        json!(teks(p, "dampak_gaji")),
        json!(teks(p, "izin_pemutus")),
        json!(teks(p, "tanggal_mulai")),
        json!(teks(p, "tanggal_selesai")),
        nilai_opsional(p, "jam_mulai_ke"),
        nilai_opsional(p, "jam_sampai_ke"),
        json!(i64::from(bendera(p, "setengah_hari"))),
        json!(teks(p, "alasan")),
        json!(teks(p, "sidik")),
        json!(teks(p, "diajukan_oleh")),
        json!(teks(p, "waktu_perangkat")),
    ]
}

/// `hr-request/save`: upsert penuh. Suntingan yang telat menggugurkan
/// keputusan lewat sidik, bukan lewat penolakan.
pub fn cloud_pengajuan_statements(payload: &Value, entity_key: &str) -> Vec<(String, Vec<Value>)> {
    let mut p = payload.clone();
    p["id_pengajuan"] = json!(id_dari(payload, "id_pengajuan", entity_key));
    let wajib = [
        "id_pengajuan",
        "id_karyawan",
        "id_jenis",
        "kelompok",
        "dampak_gaji",
        "izin_pemutus",
        "alasan",
        "sidik",
        "diajukan_oleh",
        "waktu_perangkat",
    ];
    let mulai = teks(&p, "tanggal_mulai");
    let selesai = teks(&p, "tanggal_selesai");
    let jam_sah = ["jam_mulai_ke", "jam_sampai_ke"]
        .iter()
        .all(|k| angka_opsional(&p, k, 1, MAKS_JAM_KE).is_ok());
    if wajib.iter().any(|k| teks(&p, k).is_empty())
        || !tanggal_valid(&mulai)
        || !tanggal_valid(&selesai)
        || selesai < mulai
        || !jam_sah
    {
        return Vec::new();
    }
    vec![(SIMPAN_PENGAJUAN_SQL.to_owned(), pengajuan_args(&p))]
}

fn keputusan_args(p: &Value) -> Vec<Value> {
    [
        "id_keputusan",
        "id_pengajuan",
        "jenis",
        "sidik",
        "alasan",
        "oleh",
        "id_karyawan_oleh",
        "waktu_perangkat",
    ]
    .iter()
    .map(|k| json!(teks(p, k)))
    .collect()
}

/// `hr-request-decision/create`: `ON CONFLICT DO NOTHING`, jam cloud di
/// `diterima_cloud`. Keputusan ganda dari dua perangkat menjadi tanda.
pub fn cloud_keputusan_statements(payload: &Value, entity_key: &str) -> Vec<(String, Vec<Value>)> {
    let mut p = payload.clone();
    p["id_keputusan"] = json!(id_dari(payload, "id_keputusan", entity_key));
    let jenis = teks(&p, "jenis");
    let sah = KEPUTUSAN_FINAL.contains(&jenis.as_str()) || jenis == "Diketahui" || jenis == "Batal";
    let wajib = [
        "id_keputusan",
        "id_pengajuan",
        "sidik",
        "oleh",
        "waktu_perangkat",
    ];
    if !sah || wajib.iter().any(|k| teks(&p, k).is_empty()) {
        return Vec::new();
    }
    vec![(CLOUD_KEPUTUSAN_SQL.to_owned(), keputusan_args(&p))]
}

/// `hr-leave-adjustment/create` (2b): append-only.
pub fn cloud_penyesuaian_statements(
    payload: &Value,
    entity_key: &str,
) -> Vec<(String, Vec<Value>)> {
    let id = id_dari(payload, "id_penyesuaian", entity_key);
    let jenis = teks(payload, "jenis");
    let hari = payload.get("hari").and_then(Value::as_i64);
    let wajib = ["id_karyawan", "periode", "alasan", "dicatat_oleh"];
    if id.is_empty()
        || !["Saldo Awal", "Koreksi", "Pembatalan"].contains(&jenis.as_str())
        || hari.is_none()
        || wajib.iter().any(|k| teks(payload, k).is_empty())
    {
        return Vec::new();
    }
    vec![(
        CLOUD_PENYESUAIAN_SQL.to_owned(),
        vec![
            json!(id),
            json!(teks(payload, "id_karyawan")),
            json!(teks(payload, "periode")),
            json!(jenis),
            json!(teks(payload, "id_ref")),
            json!(hari),
            json!(teks(payload, "alasan")),
            json!(teks(payload, "dicatat_oleh")),
        ],
    )]
}

/// `hr-substitute/save` (2c): upsert atas id deterministik (Q-48).
pub fn cloud_penanganan_statements(payload: &Value, entity_key: &str) -> Vec<(String, Vec<Value>)> {
    let id = id_dari(payload, "id_penanganan", entity_key);
    let status = teks(payload, "status");
    let wajib = [
        "id_pengajuan",
        "tanggal",
        "id_jadwal",
        "dicatat_oleh",
        "waktu_perangkat",
    ];
    if id.is_empty()
        || !["Diganti", "Tugas Mandiri", "Digabung"].contains(&status.as_str())
        || wajib.iter().any(|k| teks(payload, k).is_empty())
    {
        return Vec::new();
    }
    let kolom = [
        "id_pengajuan",
        "tanggal",
        "id_jadwal",
        "id_rombel",
        "id_mapel",
        "jam_ke",
        "status",
        "id_guru_pengganti",
        "catatan",
        "dicatat_oleh",
        "waktu_perangkat",
    ];
    let mut args = vec![json!(id)];
    args.extend(kolom.iter().map(|k| json!(teks(payload, k))));
    vec![(CLOUD_PENANGANAN_SQL.to_owned(), args)]
}

// Penulisan dan baca lokal (Desktop/Mobile)

fn invalid(message: impl Into<String>) -> CommandError {
    CommandError::new("VALIDATION_ERROR", message)
}

fn db_error(_: rusqlite::Error) -> CommandError {
    CommandError::internal()
}

fn punya(operator: &OperatorUser, izin: &str) -> bool {
    operator.is_superadmin || operator.permissions.iter().any(|p| p == izin)
}

fn tautan(operator: &OperatorUser) -> String {
    operator
        .id_karyawan
        .as_deref()
        .unwrap_or("")
        .trim()
        .to_owned()
}

fn satu_teks(
    connection: &rusqlite::Connection,
    sql: &str,
    arg: &str,
) -> Result<String, CommandError> {
    Ok(connection
        .query_row(sql, params![arg], |row| row.get::<_, Option<String>>(0))
        .optional()
        .map_err(db_error)?
        .flatten()
        .unwrap_or_default())
}

/// Unit personil sesi; akun tanpa tautan = `""` (hanya `hr.scope.all`).
fn unit_akun(
    connection: &rusqlite::Connection,
    operator: &OperatorUser,
) -> Result<String, CommandError> {
    let id = tautan(operator);
    if id.is_empty() {
        return Ok(String::new());
    }
    satu_teks(connection, UNIT_PERSONIL_SQL, &id)
}

fn waktu(connection: &rusqlite::Connection) -> Result<(String, String), CommandError> {
    connection
        .query_row(WAKTU_SQL, [], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(db_error)
}

fn keputusan_dari(rows: &[Value]) -> Vec<Keputusan> {
    rows.iter()
        .filter_map(|r| serde_json::from_value(r.clone()).ok())
        .collect()
}

fn periode(
    connection: &rusqlite::Connection,
    sql: &str,
    mulai: &str,
    selesai: &str,
) -> Result<Option<(String, String)>, CommandError> {
    connection
        .query_row(sql, params![mulai, selesai], |row| {
            Ok((row.get(0)?, row.get(1)?))
        })
        .optional()
        .map_err(db_error)
}

/// `desktop_hr_requests`: daftar + status + tanda, jenis, pegawai, dan sesi.
pub fn requests(
    state: &DesktopState,
    operator: &OperatorUser,
    dari: &str,
    sampai: &str,
) -> Result<Value, CommandError> {
    if !tanggal_valid(dari) || !tanggal_valid(sampai) || sampai < dari {
        return Err(invalid("Rentang tanggal tidak valid."));
    }
    let connection = storage::database(&state.data_dir)?;
    let mut pengajuan = rows_json_with(&connection, DAFTAR_PENGAJUAN_SQL, params![dari, sampai])?;
    let ids: Vec<String> = pengajuan.iter().map(|p| teks(p, "id_pengajuan")).collect();
    let keputusan = rows_json_with(
        &connection,
        DAFTAR_KEPUTUSAN_SQL,
        params![json!(ids).to_string()],
    )?;
    susun_daftar(&mut pengajuan, &keputusan);
    Ok(json!({
        "pengajuan": pengajuan,
        "jenis": rows_json_with(&connection, JENIS_SQL, [])?,
        "pegawai": rows_json_with(&connection, PEGAWAI_PENGAJUAN_SQL, [])?,
        "sesi": {
            "id_karyawan": tautan(operator),
            "unit": unit_akun(&connection, operator)?,
            "lingkup_semua": punya(operator, "hr.scope.all"),
        },
        "dari": dari,
        "sampai": sampai,
    }))
}

/// Cermin `susunDaftar`: status, tanda, dan keputusan per pengajuan.
/// `bertumpuk` = pengajuan Menunggu/berlaku lain orang yang sama di daftar.
pub fn susun_daftar(pengajuan: &mut [Value], keputusan: &[Value]) {
    let mut per: HashMap<String, Vec<Value>> = HashMap::new();
    for k in keputusan {
        per.entry(teks(k, "id_pengajuan"))
            .or_default()
            .push(k.clone());
    }
    for p in pengajuan.iter_mut() {
        let rows = per.remove(&teks(p, "id_pengajuan")).unwrap_or_default();
        let daftar = keputusan_dari(&rows);
        let sidik = teks(p, "sidik");
        let status = status_pengajuan(&sidik, &daftar);
        let cakupan = keputusan_berlaku(&sidik, &daftar).and_then(|b| {
            rows.iter()
                .find(|r| teks(r, "id_keputusan") == b.id_keputusan)
                .filter(|r| !teks(r, "id_karyawan_oleh").is_empty())
                .map(|r| dalam_cakupan(false, &teks(r, "unit_oleh"), &teks(p, "unit")))
        });
        let tanda = tanda_keputusan(&sidik, &teks(p, "diajukan_oleh"), &daftar, cakupan);
        p["status"] = json!(status);
        p["tanda"] = json!(tanda);
        p["keputusan"] = Value::Array(rows);
    }
    let aktif: Vec<(usize, Ringkas)> = pengajuan
        .iter()
        .enumerate()
        .filter(|(_, p)| {
            let s = teks(p, "status");
            s == "Menunggu" || status_berlaku(&s)
        })
        .filter_map(|(i, p)| {
            serde_json::from_value::<Ringkas>(p.clone())
                .ok()
                .map(|r| (i, r))
        })
        .collect();
    for (i, a) in &aktif {
        if aktif.iter().any(|(j, b)| i != j && bentrok_pengajuan(a, b)) {
            if let Some(tanda) = pengajuan[*i]["tanda"].as_array_mut() {
                tanda.push(json!("bertumpuk"));
            }
        }
    }
}

struct Pegawai {
    unit: String,
    guru: bool,
    jadwal: Jadwal,
}

fn pegawai(transaction: &Transaction<'_>, id: &str) -> Result<Option<Pegawai>, CommandError> {
    transaction
        .query_row(PEGAWAI_SATU_SQL, params![id], |row| {
            Ok(Pegawai {
                unit: row.get(0)?,
                guru: row.get::<_, i64>(1)? == 1,
                jadwal: Jadwal {
                    divisi: row.get(2)?,
                    hari_masuk: parse_hari_kerja(row.get::<_, Option<String>>(3)?.as_deref()),
                    kode_shift: row.get(4)?,
                },
            })
        })
        .optional()
        .map_err(db_error)
}

fn jenis_satu(
    transaction: &Transaction<'_>,
    id_jenis: &str,
) -> Result<Option<JenisPengajuan>, CommandError> {
    let baris = rows_json_with(transaction, JENIS_SQL, [])?
        .into_iter()
        .find(|r| teks(r, "id_jenis") == id_jenis);
    Ok(baris.and_then(|r| validasi_jenis(&r).ok()))
}

fn jp_max(transaction: &Transaction<'_>, unit: &str) -> Result<i64, CommandError> {
    let (u, s): (Option<String>, Option<String>) = transaction
        .query_row(JP_MAX_SQL, params![unit], |row| {
            Ok((row.get(0)?, row.get(1)?))
        })
        .map_err(db_error)?;
    Ok(i64::from(super::class_attendance::jp_max_for_unit(
        u.as_deref(),
        s.as_deref(),
    )))
}

fn hari_kerja(
    transaction: &Transaction<'_>,
    jadwal: &Jadwal,
    mulai: &str,
    selesai: &str,
) -> Result<i64, CommandError> {
    let libur: HashSet<String> = rows_json_with(transaction, LIBUR_SQL, params![mulai, selesai])?
        .iter()
        .map(|r| teks(r, "tanggal"))
        .collect();
    let whitelist: Vec<HolidayWhitelistEntry> = rows_json_with(transaction, WHITELIST_SQL, [])?
        .iter()
        .map(|r| HolidayWhitelistEntry {
            id: teks(r, "id"),
            scope_type: teks(r, "scope_type"),
            scope_value: teks(r, "scope_value"),
            tanggal_libur: Some(teks(r, "tanggal_libur")).filter(|t| !t.is_empty()),
            status_aktif: r.get("status_aktif").and_then(Value::as_i64).unwrap_or(0),
        })
        .collect();
    Ok(tanggal_wajib(jadwal, &libur, &whitelist, mulai, selesai).len() as i64)
}

fn tulis_pengajuan(transaction: &Transaction<'_>, payload: &Value) -> Result<(), CommandError> {
    let args = pengajuan_args(payload);
    transaction
        .execute(
            SIMPAN_PENGAJUAN_SQL,
            rusqlite::params_from_iter(args.iter().map(json_ke_sql)),
        )
        .map_err(db_error)?;
    Ok(())
}

fn tulis_keputusan(transaction: &Transaction<'_>, payload: &Value) -> Result<(), CommandError> {
    let args = keputusan_args(payload);
    transaction
        .execute(
            SIMPAN_KEPUTUSAN_SQL,
            rusqlite::params_from_iter(args.iter().map(json_ke_sql)),
        )
        .map_err(db_error)?;
    Ok(())
}

fn json_ke_sql(v: &Value) -> rusqlite::types::Value {
    match v {
        Value::String(s) => rusqlite::types::Value::Text(s.clone()),
        Value::Number(n) => n.as_i64().map_or(
            rusqlite::types::Value::Null,
            rusqlite::types::Value::Integer,
        ),
        _ => rusqlite::types::Value::Null,
    }
}

fn keputusan_payload(
    id: &str,
    id_pengajuan: &str,
    jenis: &str,
    sidik: &str,
    alasan: &str,
    operator: &OperatorUser,
    waktu: &str,
) -> Value {
    json!({
        "id_keputusan": id,
        "id_pengajuan": id_pengajuan,
        "jenis": jenis,
        "sidik": sidik,
        "alasan": alasan,
        "oleh": operator.username,
        "id_karyawan_oleh": tautan(operator),
        "waktu_perangkat": waktu,
    })
}

fn tolak_periode_dibayar(
    transaction: &Transaction<'_>,
    mulai: &str,
    selesai: &str,
) -> Result<(), CommandError> {
    if let Some((a, b)) = periode(transaction, PERIODE_DIBAYAR_SQL, mulai, selesai)? {
        return Err(invalid(pesan_periode_dibayar(&a, &b)));
    }
    Ok(())
}

/// `desktop_hr_request_save`: buat atau sunting (selama Menunggu), urgent
/// sekaligus. Pengajuan dan keputusan urgent ditulis dalam satu transaksi.
pub fn simpan(
    state: &DesktopState,
    operator: &OperatorUser,
    draft: Value,
) -> Result<Value, CommandError> {
    let p = validasi_pengajuan(&draft).map_err(invalid)?;
    let id_lama = teks(&draft, "id_pengajuan");
    let client_id = sync::ensure_client_id(state)?;
    let mut connection = storage::database(&state.data_dir)?;
    let transaction = connection.transaction().map_err(db_error)?;
    let orang = pegawai(&transaction, &p.id_karyawan)?
        .ok_or_else(|| invalid("Pengajuan hanya untuk pegawai (guru dan tendik)."))?;
    let jenis = jenis_satu(&transaction, &p.id_jenis)?
        .ok_or_else(|| invalid("Jenis pengajuan tidak ditemukan."))?;
    periksa_jenis(&p, &jenis, orang.guru, jp_max(&transaction, &orang.unit)?).map_err(invalid)?;
    if jenis.maks_hari.is_some() {
        let kalender = days_between(&p.tanggal_mulai, &p.tanggal_selesai).unwrap_or(0) + 1;
        let kerja = hari_kerja(
            &transaction,
            &orang.jadwal,
            &p.tanggal_mulai,
            &p.tanggal_selesai,
        )?;
        periksa_maks(&jenis, kerja, kalender).map_err(invalid)?;
    }
    let (sekarang, _) = waktu(&transaction)?;
    let (id, diajukan_oleh) = if id_lama.is_empty() {
        (hris::new_id("pgn-"), operator.username.clone())
    } else {
        let lama = rows_json_with(&transaction, PENGAJUAN_SATU_SQL, params![id_lama])?
            .into_iter()
            .next()
            .ok_or_else(|| invalid("Pengajuan tidak ditemukan."))?;
        let rows = rows_json_with(&transaction, KEPUTUSAN_SATU_SQL, params![id_lama])?;
        let status = status_pengajuan(&teks(&lama, "sidik"), &keputusan_dari(&rows));
        let pengaju = teks(&lama, "diajukan_oleh");
        periksa_sunting(
            status,
            sama_orang(&pengaju, &operator.username),
            operator.is_superadmin,
        )
        .map_err(invalid)?;
        tolak_periode_dibayar(
            &transaction,
            &teks(&lama, "tanggal_mulai"),
            &teks(&lama, "tanggal_selesai"),
        )?;
        (id_lama.clone(), pengaju)
    };
    tolak_periode_dibayar(&transaction, &p.tanggal_mulai, &p.tanggal_selesai)?;
    let saya = Ringkas {
        id_karyawan: p.id_karyawan.clone(),
        tanggal_mulai: p.tanggal_mulai.clone(),
        tanggal_selesai: p.tanggal_selesai.clone(),
        jam_mulai_ke: p.jam_mulai_ke,
        jam_sampai_ke: p.jam_sampai_ke,
    };
    let lain = rows_json_with(
        &transaction,
        PENGAJUAN_AKTIF_ORANG_SQL,
        params![p.id_karyawan, id, p.tanggal_mulai, p.tanggal_selesai],
    )?;
    if let Some(b) = lain
        .iter()
        .filter_map(|r| serde_json::from_value::<Ringkas>(r.clone()).ok())
        .find(|b| bentrok_pengajuan(&saya, b))
    {
        return Err(invalid(pesan_bertumpuk(
            &b.tanggal_mulai,
            &b.tanggal_selesai,
        )));
    }
    let isi = IsiPengajuan {
        id_karyawan: p.id_karyawan.clone(),
        id_jenis: p.id_jenis.clone(),
        kelompok: jenis.kelompok.clone(),
        potong_jatah: jenis.potong_jatah,
        dampak_gaji: jenis.dampak_gaji.clone(),
        izin_pemutus: jenis.izin_pemutus.clone(),
        tanggal_mulai: p.tanggal_mulai.clone(),
        tanggal_selesai: p.tanggal_selesai.clone(),
        jam_mulai_ke: p.jam_mulai_ke,
        jam_sampai_ke: p.jam_sampai_ke,
        setengah_hari: p.setengah_hari,
        alasan: p.alasan.clone(),
    };
    let sidik = sidik_pengajuan(&isi);
    let payload = json!({
        "id_pengajuan": id,
        "id_karyawan": isi.id_karyawan,
        "id_jenis": isi.id_jenis,
        "kelompok": isi.kelompok,
        "potong_jatah": i64::from(isi.potong_jatah),
        "dampak_gaji": isi.dampak_gaji,
        "izin_pemutus": isi.izin_pemutus,
        "tanggal_mulai": isi.tanggal_mulai,
        "tanggal_selesai": isi.tanggal_selesai,
        "jam_mulai_ke": isi.jam_mulai_ke,
        "jam_sampai_ke": isi.jam_sampai_ke,
        "setengah_hari": i64::from(isi.setengah_hari),
        "alasan": isi.alasan,
        "sidik": sidik,
        "diajukan_oleh": diajukan_oleh,
        "waktu_perangkat": sekarang,
    });
    let mut urgent = Value::Null;
    if p.urgent {
        if !punya(operator, "hr.request.urgent") {
            return Err(CommandError::new(
                "DESKTOP_ACCESS_DENIED",
                "Kamu tidak punya izin pengajuan urgent.",
            ));
        }
        let lingkup = punya(operator, "hr.scope.all");
        let cakupan = dalam_cakupan(lingkup, &unit_akun(&transaction, operator)?, &orang.unit);
        periksa_urgent(tautan(operator) == p.id_karyawan, cakupan).map_err(invalid)?;
        urgent = keputusan_payload(
            &format!("urgent-{id}"),
            &id,
            "Setujui Urgent",
            &sidik,
            "",
            operator,
            &sekarang,
        );
    }
    tulis_pengajuan(&transaction, &payload)?;
    sync::enqueue(
        &transaction,
        &client_id,
        "hr-request",
        "save",
        &id,
        &payload,
        None,
    )?;
    if !urgent.is_null() {
        tulis_keputusan(&transaction, &urgent)?;
        sync::enqueue(
            &transaction,
            &client_id,
            "hr-request-decision",
            "create",
            &teks(&urgent, "id_keputusan"),
            &urgent,
            None,
        )?;
    }
    let peringatan = periode(
        &transaction,
        PERIODE_PERLU_ULANG_SQL,
        &p.tanggal_mulai,
        &p.tanggal_selesai,
    )?
    .map(|(a, b)| pesan_run_ulang(&a, &b));
    transaction.commit().map_err(db_error)?;
    Ok(json!({ "pengajuan": payload, "peringatan": peringatan }))
}

/// `desktop_hr_request_decide`: Setujui, Tolak, Diketahui, atau Batal.
/// Izin pemutus, cakupan unit, dan "bukan untuk diri sendiri" dari sesi.
pub fn putuskan(
    state: &DesktopState,
    operator: &OperatorUser,
    id_pengajuan: &str,
    aksi: &str,
    alasan: &str,
) -> Result<Value, CommandError> {
    let id_pengajuan = id_pengajuan.trim();
    let client_id = sync::ensure_client_id(state)?;
    let mut connection = storage::database(&state.data_dir)?;
    let transaction = connection.transaction().map_err(db_error)?;
    let p = rows_json_with(&transaction, PENGAJUAN_SATU_SQL, params![id_pengajuan])?
        .into_iter()
        .next()
        .ok_or_else(|| invalid("Pengajuan tidak ditemukan."))?;
    let daftar = keputusan_dari(&rows_json_with(
        &transaction,
        KEPUTUSAN_SATU_SQL,
        params![id_pengajuan],
    )?);
    let sidik = teks(&p, "sidik");
    let status = status_pengajuan(&sidik, &daftar);
    let id_karyawan = teks(&p, "id_karyawan");
    let unit_pegawai = satu_teks(&transaction, UNIT_PERSONIL_SQL, &id_karyawan)?;
    let keadaan = KeadaanAksi {
        status: status.to_owned(),
        sudah_diketahui: daftar.iter().any(|k| k.jenis == "Diketahui"),
        pengaju_sendiri: sama_orang(&teks(&p, "diajukan_oleh"), &operator.username),
        superadmin: operator.is_superadmin,
        karyawan_sendiri: !tautan(operator).is_empty() && tautan(operator) == id_karyawan,
        boleh_putus: punya(operator, &teks(&p, "izin_pemutus")),
        dalam_cakupan: dalam_cakupan(
            punya(operator, "hr.scope.all"),
            &unit_akun(&transaction, operator)?,
            &unit_pegawai,
        ),
    };
    periksa_aksi(aksi, alasan, &keadaan).map_err(invalid)?;
    if aksi == "Setujui" || aksi == "Batal" {
        tolak_periode_dibayar(
            &transaction,
            &teks(&p, "tanggal_mulai"),
            &teks(&p, "tanggal_selesai"),
        )?;
    }
    let id = match aksi {
        "Diketahui" => format!("tahu-{id_pengajuan}"),
        "Batal" => format!("batal-{id_pengajuan}"),
        _ => hris::new_id("kpt-"),
    };
    let (sekarang, _) = waktu(&transaction)?;
    let payload = keputusan_payload(
        &id,
        id_pengajuan,
        aksi,
        &sidik,
        alasan.trim(),
        operator,
        &sekarang,
    );
    tulis_keputusan(&transaction, &payload)?;
    sync::enqueue(
        &transaction,
        &client_id,
        "hr-request-decision",
        "create",
        &id,
        &payload,
        None,
    )?;
    transaction.commit().map_err(db_error)?;
    Ok(payload)
}

/// `desktop_hr_request_types_save`: jenis baru atau sunting.
pub fn simpan_jenis(state: &DesktopState, draft: Value) -> Result<Value, CommandError> {
    let j = validasi_jenis(&draft).map_err(invalid)?;
    let client_id = sync::ensure_client_id(state)?;
    let mut connection = storage::database(&state.data_dir)?;
    let transaction = connection.transaction().map_err(db_error)?;
    let id = match Some(teks(&draft, "id_jenis")).filter(|id| !id.is_empty()) {
        Some(id) => {
            if jenis_satu(&transaction, &id)?.is_none() {
                return Err(invalid("Jenis pengajuan tidak ditemukan."));
            }
            id
        }
        None => hris::new_id("jns-"),
    };
    let bentrok = transaction
        .query_row(BENTROK_JENIS_SQL, params![j.nama, id], |_| Ok(()))
        .optional()
        .map_err(db_error)?;
    if bentrok.is_some() {
        return Err(invalid(format!(
            "Nama \"{}\" sudah dipakai jenis pengajuan lain.",
            j.nama
        )));
    }
    let args = jenis_args(&id, &j);
    transaction
        .execute(
            SIMPAN_JENIS_SQL,
            rusqlite::params_from_iter(args.iter().map(json_ke_sql)),
        )
        .map_err(db_error)?;
    let mut payload = serde_json::to_value(&j).map_err(|_| CommandError::internal())?;
    payload["id_jenis"] = json!(id);
    sync::enqueue(
        &transaction,
        &client_id,
        "hr-request-type",
        "save",
        &id,
        &payload,
        None,
    )?;
    transaction.commit().map_err(db_error)?;
    Ok(payload)
}

#[cfg(test)]
mod tests {
    // Vektor yang sama diuji `validations/hr-pengajuan.test.ts`.
    use super::*;

    const VEKTOR: &str = include_str!("../../../src/lib/validations/hr-pengajuan.vektor.json");

    fn vektor() -> Value {
        serde_json::from_str(VEKTOR).expect("vektor hr-pengajuan")
    }

    fn galat<T>(hasil: Result<T, String>) -> Value {
        hasil.err().map_or(Value::Null, Value::String)
    }

    fn jenis(v: &Value) -> JenisPengajuan {
        serde_json::from_value(v.clone()).expect("jenis")
    }

    #[test]
    fn hr_pengajuan_vektor_jenis() {
        for k in vektor()["jenis"].as_array().expect("jenis") {
            let hasil = validasi_jenis(&k["masuk"]);
            assert_eq!(galat(hasil.clone()), k["galat"], "{}", k["masuk"]);
            if let Ok(j) = hasil {
                assert_eq!(serde_json::to_value(j).expect("json"), k["hasil"]);
            }
        }
    }

    #[test]
    fn hr_pengajuan_vektor_isian() {
        for k in vektor()["pengajuan"].as_array().expect("pengajuan") {
            let hasil = validasi_pengajuan(&k["masuk"]);
            assert_eq!(galat(hasil.clone()), k["galat"], "{}", k["masuk"]);
            if let Ok(p) = hasil {
                assert_eq!(serde_json::to_value(p).expect("json"), k["hasil"]);
            }
        }
        for k in vektor()["periksa_jenis"].as_array().expect("periksa_jenis") {
            let p: PengajuanSah = serde_json::from_value(k["pengajuan"].clone()).expect("isian");
            let hasil = periksa_jenis(
                &p,
                &jenis(&k["jenis"]),
                k["guru"] == true,
                k["jp_max"].as_i64().expect("jp"),
            );
            assert_eq!(galat(hasil), k["galat"], "{k}");
        }
        for k in vektor()["maks"].as_array().expect("maks") {
            let hasil = periksa_maks(
                &jenis(&k["jenis"]),
                k["hari_kerja"].as_i64().expect("kerja"),
                k["hari_kalender"].as_i64().expect("kalender"),
            );
            assert_eq!(galat(hasil), k["galat"], "{k}");
        }
    }

    #[test]
    fn hr_pengajuan_vektor_sidik() {
        for k in vektor()["kanonik"].as_array().expect("kanonik") {
            let isi: IsiPengajuan = serde_json::from_value(k["isi"].clone()).expect("isi");
            assert_eq!(
                kanonik_pengajuan(&isi),
                k["kanonik"].as_str().expect("teks")
            );
            assert_eq!(sidik_pengajuan(&isi), k["sidik"].as_str().expect("sidik"));
        }
    }

    #[test]
    fn hr_pengajuan_vektor_status_dan_tanda() {
        let daftar =
            |v: &Value| -> Vec<Keputusan> { serde_json::from_value(v.clone()).expect("keputusan") };
        for k in vektor()["status"].as_array().expect("status") {
            let kep = daftar(&k["keputusan"]);
            let sidik = k["sidik"].as_str().expect("sidik");
            assert_eq!(
                status_pengajuan(sidik, &kep),
                k["status"].as_str().expect("status"),
                "{k}"
            );
            assert_eq!(
                keputusan_berlaku(sidik, &kep)
                    .map(|b| json!(b.id_keputusan))
                    .unwrap_or(Value::Null),
                k["berlaku"],
                "{k}"
            );
        }
        for k in vektor()["tanda"].as_array().expect("tanda") {
            let hasil = tanda_keputusan(
                k["sidik"].as_str().expect("sidik"),
                k["diajukan_oleh"].as_str().expect("oleh"),
                &daftar(&k["keputusan"]),
                k["cakupan"].as_bool(),
            );
            assert_eq!(json!(hasil), k["hasil"], "{k}");
        }
    }

    #[test]
    fn hr_pengajuan_vektor_bentrok_wajib_cakupan() {
        let v = vektor();
        for k in v["bentrok"].as_array().expect("bentrok") {
            let a: Ringkas = serde_json::from_value(k["a"].clone()).expect("a");
            let b: Ringkas = serde_json::from_value(k["b"].clone()).expect("b");
            assert_eq!(json!(bentrok_pengajuan(&a, &b)), k["hasil"], "{k}");
            assert_eq!(json!(bentrok_pengajuan(&b, &a)), k["hasil"], "simetris {k}");
        }
        for k in v["tanggal_wajib"].as_array().expect("tanggal_wajib") {
            let j = &k["jadwal"];
            let jadwal = Jadwal {
                hari_masuk: serde_json::from_value(j["hari_masuk"].clone()).expect("hari"),
                divisi: j["divisi"].as_str().expect("divisi").to_owned(),
                kode_shift: j["kode_shift"].as_i64(),
            };
            let libur: HashSet<String> = serde_json::from_value(k["libur"].clone()).expect("libur");
            let whitelist: Vec<HolidayWhitelistEntry> = k["whitelist"]
                .as_array()
                .expect("whitelist")
                .iter()
                .map(|w| HolidayWhitelistEntry {
                    id: teks(w, "id"),
                    scope_type: teks(w, "scope_type"),
                    scope_value: teks(w, "scope_value"),
                    tanggal_libur: w["tanggal_libur"].as_str().map(str::to_owned),
                    status_aktif: w["status_aktif"].as_i64().expect("aktif"),
                })
                .collect();
            let hasil = tanggal_wajib(
                &jadwal,
                &libur,
                &whitelist,
                k["mulai"].as_str().expect("mulai"),
                k["selesai"].as_str().expect("selesai"),
            );
            assert_eq!(json!(hasil), k["hasil"], "{k}");
        }
        for k in v["cakupan"].as_array().expect("cakupan") {
            let hasil = dalam_cakupan(
                k["lingkup_semua"] == true,
                k["unit_akun"].as_str().expect("akun"),
                k["unit_sasaran"].as_str().expect("sasaran"),
            );
            assert_eq!(json!(hasil), k["hasil"], "{k}");
        }
    }

    #[test]
    fn hr_pengajuan_vektor_aksi() {
        let v = vektor();
        for k in v["aksi"].as_array().expect("aksi") {
            let keadaan: KeadaanAksi =
                serde_json::from_value(k["keadaan"].clone()).expect("keadaan");
            let hasil = periksa_aksi(
                k["aksi"].as_str().expect("aksi"),
                k["alasan"].as_str().expect("alasan"),
                &keadaan,
            );
            assert_eq!(galat(hasil), k["galat"], "{k}");
        }
        for k in v["sunting"].as_array().expect("sunting") {
            let hasil = periksa_sunting(
                k["status"].as_str().expect("status"),
                k["pengaju_sendiri"] == true,
                k["superadmin"] == true,
            );
            assert_eq!(galat(hasil), k["galat"], "{k}");
        }
        for k in v["urgent"].as_array().expect("urgent") {
            assert_eq!(
                galat(periksa_urgent(
                    k["karyawan_sendiri"] == true,
                    k["dalam_cakupan"] == true
                )),
                k["galat"],
                "{k}"
            );
        }
        let pesan = &v["pesan"];
        let tiga = |kunci: &str| -> (String, String, String) {
            let a = pesan[kunci].as_array().expect("pesan");
            (
                a[0].as_str().expect("0").to_owned(),
                a[1].as_str().expect("1").to_owned(),
                a[2].as_str().expect("2").to_owned(),
            )
        };
        let (a, b, c) = tiga("periode_dibayar");
        assert_eq!(pesan_periode_dibayar(&a, &b), c);
        let (a, b, c) = tiga("bertumpuk");
        assert_eq!(pesan_bertumpuk(&a, &b), c);
        let (a, b, c) = tiga("run_ulang");
        assert_eq!(pesan_run_ulang(&a, &b), c);
    }

    #[test]
    fn hr_pengajuan_sql_turunan_berlaku() {
        assert!(PENGAJUAN_RENTANG_SQL.contains(PENGAJUAN_BERLAKU_SQL));
        let urutan = "ORDER BY k.diterima_cloud IS NULL, k.diterima_cloud, k.waktu_perangkat, k.id_keputusan LIMIT 1";
        assert!(PENGAJUAN_AKTIF_ORANG_SQL.contains(urutan));
        assert!(PENGAJUAN_BERLAKU_SQL.contains(urutan));
    }

    #[test]
    fn hr_pengajuan_jenis_bawaan() {
        let bawaan = jenis_bawaan();
        assert_eq!(bawaan.len(), 10);
        for j in &bawaan {
            let draft = json!({
                "nama": j.nama, "kelompok": j.kelompok, "izin_pemutus": j.izin_pemutus,
                "boleh_urgent": j.boleh_urgent, "potong_jatah": j.potong_jatah, "dampak_gaji": j.dampak_gaji,
                "maks_hari": j.maks_hari, "satuan_maks": j.satuan_maks, "wajib_dokumen": j.wajib_dokumen,
            });
            assert!(validasi_jenis(&draft).is_ok(), "{}", j.id_jenis);
        }
    }
}
