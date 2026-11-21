//! HRIS Fase 7a (`prd-hris/fase-7.md` §25.2.1–§25.2.4): lowongan, pelamar,
//! tahap seleksi, CV, dan retensi pelamar.
//!
//! `hr_lowongan`, `hr_pelamar`, `hr_pelamar_tahap`, dan `hr_pelamar_berkas`
//! KHUSUS CLOUD (Q-131): dibaca dan ditulis lewat `TursoClient`, tidak pernah
//! masuk SQLite perangkat, snapshot, atau outbox. Tanpa koneksi, command
//! mengembalikan `hris_cloud::PESAN_LURING`. Status lowongan dan pelamar
//! diturunkan, tidak disimpan.
//!
//! Kembaran TS: aturan dan SQL di `src/lib/validations/hr-rekrutmen.ts`,
//! penulisan di `src/lib/services/hr-rekrutmen.ts`. Vektornya
//! `validations/hr-rekrutmen.vektor.json`; teks SQL dibandingkan harfiah oleh
//! `hr-rekrutmen.test.ts`.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use rusqlite::{params, OptionalExtension};

use super::config::DesktopState;
use super::hari_kerja::tanggal_valid;
use super::hris::{new_id, simpan_kontrak_id, validasi_kontrak, KontrakIsian, HARI_INI_SQL};
use super::hris_cloud::{nomor_identitas, urai_berkas_dokumen, JENJANG};
use super::inventory::payload_text;
use super::models::CommandError;
use super::turso::{
    email_personil, is_valid_operator_email, is_valid_operator_phone, normalize_operator_email,
    normalize_operator_phone, Statement, TursoClient,
};
use super::{academic, commands, operational, storage};

// Aturan murni (§25.2.1–§25.2.2)

/// WAJIB sama dengan CHECK `hr_lowongan.kelompok`.
pub const KELOMPOK_LOWONGAN: [&str; 2] = ["Guru", "Tendik"];
/// Tahap proses dan tahap akhir; gabungannya WAJIB sama dengan CHECK
/// `hr_pelamar_tahap.tahap`.
pub const TAHAP_PROSES: [&str; 5] = ["Lamaran", "Seleksi Berkas", "Wawancara", "Microteaching", "Penawaran"];
pub const TAHAP_AKHIR: [&str; 3] = ["Diterima", "Ditolak", "Mundur"];
pub const MAKS_JUDUL: usize = 100;
pub const MAKS_UNIT: usize = 100;
pub const MAKS_KETERANGAN: usize = 2000;
pub const MAKS_NAMA_PELAMAR: usize = 100;
pub const MAKS_ALAMAT_PELAMAR: usize = 1000;
pub const MAKS_TEKS_PELAMAR: usize = 100;
pub const MAKS_CATATAN_PELAMAR: usize = 2000;
pub const MAKS_CATATAN_TAHAP: usize = 1000;
#[cfg_attr(not(test), allow(dead_code))]
pub const MAKS_BERKAS_PELAMAR: usize = 3;
/// UU PDP (Q-140): konstanta, bukan pengaturan. Literal `'+12 months'` di SQL
/// retensi diperiksa terhadap angka ini oleh `hr-rekrutmen.test.ts`.
#[cfg_attr(not(test), allow(dead_code))]
pub const RETENSI_PELAMAR_BULAN: i64 = 12;

pub const PESAN_LOWONGAN_TIDAK_ADA: &str = "Lowongan tidak ditemukan.";
pub const PESAN_LOWONGAN_BERUBAH: &str = "Lowongan ini baru saja berubah. Muat ulang lalu coba lagi.";
pub const PESAN_KELOMPOK_TERKUNCI: &str = "Kelompok lowongan tidak bisa diubah setelah ada pelamar.";
pub const PESAN_LOWONGAN_BELUM_DIBUKA: &str = "Lowongan ini belum dibuka.";
pub const PESAN_PELAMAR_TIDAK_ADA: &str = "Pelamar tidak ditemukan.";
pub const PESAN_PELAMAR_TERKUNCI: &str = "Pelamar ini sudah menjadi personil; datanya tidak bisa diubah atau dihapus.";
pub const PESAN_TAHAP_AKHIR: &str = "Pelamar sudah di tahap akhir. Batalkan tahap terakhir dulu bila keliru.";
pub const PESAN_TAHAP_BERUBAH: &str = "Tahap pelamar baru saja berubah. Muat ulang lalu coba lagi.";
pub const PESAN_BERKAS_PELAMAR_PENUH: &str = "Pelamar tidak ditemukan, sudah menjadi personil, atau sudah berisi 3 berkas.";
pub const PESAN_BELUM_DITERIMA: &str = "Hanya pelamar berstatus Diterima yang bisa dijadikan personil.";
pub const PESAN_KLAIM_GAGAL: &str = "Pelamar ini sudah dijadikan personil atau statusnya berubah.";
pub const PESAN_TANPA_LANJUTAN: &str = "Pelamar ini belum dijadikan personil, jadi tidak ada yang perlu dilanjutkan.";
/// Desktop saja (§25.2.3): `master_data` id itu sudah ada di cloud tetapi
/// belum di perangkat ini, jadi jalur personil tidak boleh membuat token kedua.
pub const PESAN_SINKRONKAN_DULU: &str =
    "Data personil ini sudah ada di database pusat. Sinkronkan perangkat dulu, lalu tekan Lanjutkan lagi.";

fn panjang(teks: &str) -> usize {
    teks.chars().count()
}

fn teks_opsional(draft: &Value, kunci: &str, label: &str, maks: usize) -> Result<Option<String>, String> {
    match payload_text(draft, kunci) {
        Some(t) if panjang(&t) > maks => Err(format!("{label} maksimal {maks} karakter.")),
        lain => Ok(lain),
    }
}

fn teks_wajib(draft: &Value, kunci: &str, label: &str, maks: usize) -> Result<String, String> {
    teks_opsional(draft, kunci, label, maks)?.ok_or_else(|| format!("{label} wajib diisi."))
}

fn tanggal_wajib(draft: &Value, kunci: &str, galat: &str) -> Result<String, String> {
    payload_text(draft, kunci).filter(|t| tanggal_valid(t)).ok_or_else(|| galat.to_owned())
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct LowonganSah {
    pub id_lowongan: Option<String>,
    pub judul: String,
    pub kelompok: String,
    pub unit: Option<String>,
    pub id_bagian: Option<String>,
    pub id_jabatan: Option<String>,
    pub jumlah: i64,
    pub tanggal_buka: String,
    pub tanggal_tutup: Option<String>,
    pub keterangan: Option<String>,
}

/// Cermin `validasiLowongan`. Unit, bagian, dan jabatan diperiksa pemanggil
/// (`REFERENSI_LOWONGAN_SQL`).
pub fn validasi_lowongan(draft: &Value) -> Result<LowonganSah, String> {
    let judul = teks_wajib(draft, "judul", "Judul lowongan", MAKS_JUDUL)?;
    let kelompok = payload_text(draft, "kelompok")
        .filter(|k| KELOMPOK_LOWONGAN.contains(&k.as_str()))
        .ok_or("Kelompok lowongan wajib Guru atau Tendik.")?;
    let unit = teks_opsional(draft, "unit", "Unit", MAKS_UNIT)?;
    let jumlah = draft
        .get("jumlah")
        .and_then(Value::as_i64)
        .filter(|n| (1..=99).contains(n))
        .ok_or("Jumlah yang dibutuhkan harus 1 sampai 99.")?;
    let tanggal_buka = tanggal_wajib(draft, "tanggal_buka", "Tanggal buka tidak valid.")?;
    let tanggal_tutup = match payload_text(draft, "tanggal_tutup") {
        None => None,
        Some(t) if !tanggal_valid(&t) => return Err("Tanggal tutup tidak valid.".into()),
        Some(t) if t < tanggal_buka => return Err("Tanggal tutup tidak boleh sebelum tanggal buka.".into()),
        Some(t) => Some(t),
    };
    let keterangan = teks_opsional(draft, "keterangan", "Keterangan", MAKS_KETERANGAN)?;
    Ok(LowonganSah {
        id_lowongan: payload_text(draft, "id_lowongan"),
        judul,
        kelompok,
        unit,
        id_bagian: payload_text(draft, "id_bagian"),
        id_jabatan: payload_text(draft, "id_jabatan"),
        jumlah,
        tanggal_buka,
        tanggal_tutup,
        keterangan,
    })
}

/// Cermin `statusLowongan` (Q-136). Tidak disimpan.
pub fn status_lowongan(tanggal_buka: &str, tanggal_tutup: &str, ditutup: bool, hari_ini: &str) -> &'static str {
    if ditutup || (!tanggal_tutup.is_empty() && tanggal_tutup < hari_ini) {
        "Ditutup"
    } else if tanggal_buka > hari_ini {
        "Dijadwalkan"
    } else {
        "Dibuka"
    }
}

/// Cermin `periksaBukaLagi`: tanggal tutup yang sudah lewat wajib dimundurkan
/// atau dikosongkan, supaya lowongan tidak langsung Ditutup lagi.
pub fn periksa_buka_lagi(tanggal_tutup: Option<&str>, tanggal_buka: &str, hari_ini: &str) -> Result<(), String> {
    match tanggal_tutup {
        None => Ok(()),
        Some(t) if !tanggal_valid(t) => Err("Tanggal tutup tidak valid.".into()),
        Some(t) if t < hari_ini => Err("Tanggal tutup baru harus hari ini atau sesudahnya, atau dikosongkan.".into()),
        Some(t) if t < tanggal_buka => Err("Tanggal tutup tidak boleh sebelum tanggal buka.".into()),
        Some(_) => Ok(()),
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct PelamarSah {
    pub id_pelamar: Option<String>,
    pub id_lowongan: String,
    pub nama: String,
    pub no_hp: Option<String>,
    pub email: Option<String>,
    pub lp: Option<String>,
    pub tanggal_lahir: Option<String>,
    pub alamat: Option<String>,
    pub pendidikan: Option<String>,
    pub prodi: Option<String>,
    pub sumber: Option<String>,
    pub tanggal_lamaran: String,
    pub catatan: Option<String>,
}

/// Cermin `validasiPelamar`. Tanpa NIK, KK, dan rekening (Q-132). Tanggal
/// lamaran terhadap tanggal buka diperiksa pemanggil.
pub fn validasi_pelamar(draft: &Value, hari_ini: &str) -> Result<PelamarSah, String> {
    let id_lowongan = payload_text(draft, "id_lowongan").ok_or("Lowongan wajib dipilih.")?;
    let nama = teks_wajib(draft, "nama", "Nama pelamar", MAKS_NAMA_PELAMAR)?;
    if panjang(&nama) < 2 {
        return Err("Nama pelamar minimal 2 karakter.".into());
    }
    let no_hp = match payload_text(draft, "no_hp") {
        None => None,
        Some(t) if is_valid_operator_phone(&t) => Some(normalize_operator_phone(&t)),
        Some(_) => return Err("Nomor HP tidak valid.".into()),
    };
    let email = match payload_text(draft, "email").map(|t| normalize_operator_email(&t)) {
        None => None,
        Some(e) if is_valid_operator_email(&e) => Some(e),
        Some(_) => return Err("Format email tidak valid.".into()),
    };
    let lp = match payload_text(draft, "lp") {
        None => None,
        Some(t) if t == "L" || t == "P" => Some(t),
        Some(_) => return Err("Jenis kelamin harus L atau P.".into()),
    };
    let tanggal_lahir = match payload_text(draft, "tanggal_lahir") {
        None => None,
        Some(t) if tanggal_valid(&t) && t.as_str() <= hari_ini => Some(t),
        Some(_) => return Err("Tanggal lahir tidak valid.".into()),
    };
    let alamat = teks_opsional(draft, "alamat", "Alamat", MAKS_ALAMAT_PELAMAR)?;
    let pendidikan = match payload_text(draft, "pendidikan") {
        None => None,
        Some(t) if JENJANG.contains(&t.as_str()) => Some(t),
        Some(_) => return Err("Pendidikan tidak dikenal.".into()),
    };
    let prodi = teks_opsional(draft, "prodi", "Program studi", MAKS_TEKS_PELAMAR)?;
    let sumber = teks_opsional(draft, "sumber", "Sumber lamaran", MAKS_TEKS_PELAMAR)?;
    let tanggal_lamaran = tanggal_wajib(draft, "tanggal_lamaran", "Tanggal lamaran tidak valid.")?;
    if tanggal_lamaran.as_str() > hari_ini {
        return Err("Tanggal lamaran tidak boleh di masa depan.".into());
    }
    let catatan = teks_opsional(draft, "catatan", "Catatan", MAKS_CATATAN_PELAMAR)?;
    Ok(PelamarSah {
        id_pelamar: payload_text(draft, "id_pelamar"),
        id_lowongan,
        nama,
        no_hp,
        email,
        lp,
        tanggal_lahir,
        alamat,
        pendidikan,
        prodi,
        sumber,
        tanggal_lamaran,
        catatan,
    })
}

/// Satu baris `hr_pelamar_tahap` yang dibutuhkan aturan tahap.
#[derive(Debug, Clone, Deserialize)]
pub struct TahapRingkas {
    pub id_tahap: String,
    pub urutan: i64,
    pub tahap: String,
    pub dibatalkan: bool,
}

fn tahap_terakhir(tahap: &[TahapRingkas]) -> Option<&TahapRingkas> {
    tahap.iter().filter(|t| !t.dibatalkan).max_by_key(|t| t.urutan)
}

/// Cermin `statusPelamar`: tahap berurutan terbesar yang belum dibatalkan.
/// Tidak disimpan; kembaran SQL-nya `STATUS_PELAMAR_SQL`.
pub fn status_pelamar(tahap: &[TahapRingkas]) -> String {
    tahap_terakhir(tahap).map_or("Lamaran", |t| t.tahap.as_str()).to_owned()
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct TahapSah {
    pub tahap: String,
    pub tanggal: String,
    pub catatan: Option<String>,
}

/// Cermin `periksaTahap` (Q-135): dari tahap proses ke tahap mana pun (maju,
/// melompat, mengulang); dari tahap akhir tidak ada tahap baru; Microteaching
/// hanya untuk lowongan Guru.
pub fn periksa_tahap(
    draft: &Value,
    kelompok: &str,
    status: &str,
    tanggal_lamaran: &str,
    hari_ini: &str,
) -> Result<TahapSah, String> {
    let tahap = payload_text(draft, "tahap")
        .filter(|t| TAHAP_PROSES.contains(&t.as_str()) || TAHAP_AKHIR.contains(&t.as_str()))
        .ok_or("Tahap tidak dikenal.")?;
    if TAHAP_AKHIR.contains(&status) {
        return Err(PESAN_TAHAP_AKHIR.into());
    }
    if tahap == "Microteaching" && kelompok != "Guru" {
        return Err("Microteaching hanya untuk lowongan Guru.".into());
    }
    let tanggal = tanggal_wajib(draft, "tanggal", "Tanggal tahap tidak valid.")?;
    if tanggal.as_str() > hari_ini {
        return Err("Tanggal tahap tidak boleh di masa depan.".into());
    }
    if tanggal.as_str() < tanggal_lamaran {
        return Err("Tanggal tahap tidak boleh sebelum tanggal lamaran.".into());
    }
    let catatan = teks_opsional(draft, "catatan", "Catatan tahap", MAKS_CATATAN_TAHAP)?;
    if catatan.is_none() && (tahap == "Ditolak" || tahap == "Mundur") {
        return Err("Catatan wajib diisi untuk Ditolak dan Mundur.".into());
    }
    Ok(TahapSah { tahap, tanggal, catatan })
}

/// Cermin `periksaBatalTahap`: hanya tahap terakhir yang belum dibatalkan,
/// tidak untuk `Lamaran` urutan 1, tidak untuk pelamar yang sudah personil.
pub fn periksa_batal_tahap(tahap: &[TahapRingkas], id_tahap: &str, dijadikan: bool) -> Result<(), String> {
    if dijadikan {
        return Err(PESAN_PELAMAR_TERKUNCI.into());
    }
    match tahap_terakhir(tahap) {
        Some(t) if t.id_tahap != id_tahap => Err("Hanya tahap terakhir yang bisa dibatalkan.".into()),
        Some(t) if t.urutan > 1 => Ok(()),
        _ => Err("Tahap Lamaran pertama tidak bisa dibatalkan.".into()),
    }
}

/// Id personil dan kontrak yang diturunkan dari id pelamar (§25.2.3).
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct IdPersonil {
    pub id_unik: String,
    pub kode_karyawan: String,
    pub id_kontrak: String,
}

/// Cermin `idDariPelamar`. Guru = bentuk `new_academic_id` (`ptk_<hex>`, kode
/// kosong = jalur lama); Tendik = `createEmployeeIdentifiers(hex)`.
pub fn id_dari_pelamar(id_pelamar: &str, kelompok: &str) -> Result<IdPersonil, String> {
    let hex = id_pelamar
        .strip_prefix("plm-")
        .filter(|h| h.chars().count() == 32 && h.chars().all(|c| c.is_ascii_digit() || ('a'..='f').contains(&c)))
        .ok_or("Id pelamar tidak dikenal.")?;
    let (id_unik, kode_karyawan) = match kelompok {
        "Guru" => (format!("ptk_{hex}"), String::new()),
        "Tendik" => {
            let besar = hex.to_ascii_uppercase();
            let awal: String = besar.chars().take(12).collect();
            let akhir: String = besar.chars().skip(24).collect();
            (format!("EMP_{awal}"), format!("K{akhir}"))
        }
        _ => return Err("Kelompok lowongan wajib Guru atau Tendik.".into()),
    };
    Ok(IdPersonil {
        id_unik,
        kode_karyawan,
        id_kontrak: format!("kon-{hex}"),
    })
}

/// `plm-` + 32 hex: `id_dari_pelamar` memakai ke-32 karakternya.
pub fn id_pelamar_baru() -> String {
    let mut bytes = [0u8; 16];
    rand_core::RngCore::fill_bytes(&mut rand_core::OsRng, &mut bytes);
    format!("plm-{}", hex::encode(bytes))
}

// SQL kembar (§25.3). Diperiksa harfiah oleh `hr-rekrutmen.test.ts`.

/// Tutup efektif lowongan `l` (jangkar retensi): yang lebih awal di antara
/// tanggal WIB tombol Tutup dan `tanggal_tutup` yang sudah lewat.
#[cfg_attr(not(test), allow(dead_code))]
pub const TUTUP_EFEKTIF_SQL: &str = "CASE WHEN l.ditutup_pada IS NULL THEN CASE WHEN l.tanggal_tutup < date('now', '+7 hours') THEN l.tanggal_tutup END WHEN l.tanggal_tutup < date('now', '+7 hours') THEN min(l.tanggal_tutup, date(l.ditutup_pada, '+7 hours')) ELSE date(l.ditutup_pada, '+7 hours') END";
/// Status pelamar `p`, kembar `status_pelamar`.
#[cfg_attr(not(test), allow(dead_code))]
pub const STATUS_PELAMAR_SQL: &str = "COALESCE((SELECT t.tahap FROM hr_pelamar_tahap t WHERE t.id_pelamar = p.id_pelamar AND t.dibatalkan_pada IS NULL ORDER BY t.urutan DESC LIMIT 1), 'Lamaran')";

pub const LOWONGAN_SQL: &str = "SELECT l.id_lowongan, l.judul, l.kelompok, COALESCE(l.unit, '') AS unit, COALESCE(l.id_bagian, '') AS id_bagian, COALESCE(b.nama, '') AS bagian, COALESCE(l.id_jabatan, '') AS id_jabatan, COALESCE(j.nama, '') AS jabatan, l.jumlah, l.tanggal_buka, COALESCE(l.tanggal_tutup, '') AS tanggal_tutup, COALESCE(l.keterangan, '') AS keterangan, COALESCE(l.ditutup_pada, '') AS ditutup_pada, COALESCE(l.ditutup_oleh, '') AS ditutup_oleh, l.pelamar_dihapus, l.dicatat_oleh, l.created_at, COALESCE(l.diubah_oleh, '') AS diubah_oleh, COALESCE(l.diubah_pada, '') AS diubah_pada, COALESCE(CASE WHEN l.ditutup_pada IS NULL THEN CASE WHEN l.tanggal_tutup < date('now', '+7 hours') THEN l.tanggal_tutup END WHEN l.tanggal_tutup < date('now', '+7 hours') THEN min(l.tanggal_tutup, date(l.ditutup_pada, '+7 hours')) ELSE date(l.ditutup_pada, '+7 hours') END, '') AS tutup_efektif, COALESCE(date(CASE WHEN l.ditutup_pada IS NULL THEN CASE WHEN l.tanggal_tutup < date('now', '+7 hours') THEN l.tanggal_tutup END WHEN l.tanggal_tutup < date('now', '+7 hours') THEN min(l.tanggal_tutup, date(l.ditutup_pada, '+7 hours')) ELSE date(l.ditutup_pada, '+7 hours') END, '+12 months', '+1 day'), '') AS tanggal_hapus FROM hr_lowongan l LEFT JOIN hr_bagian b ON b.id_bagian = l.id_bagian LEFT JOIN hr_jabatan j ON j.id_jabatan = l.id_jabatan ORDER BY l.tanggal_buka DESC, l.created_at DESC, l.id_lowongan\n-- batas: lowongan sekolah, beberapa per tahun\n;";
pub const LOWONGAN_SATU_SQL: &str = "SELECT id_lowongan, kelompok, tanggal_buka, COALESCE(tanggal_tutup, '') AS tanggal_tutup, COALESCE(ditutup_pada, '') AS ditutup_pada FROM hr_lowongan WHERE id_lowongan = ?1 LIMIT 1;";
pub const HITUNG_PELAMAR_SQL: &str = "SELECT p.id_lowongan, COALESCE((SELECT t.tahap FROM hr_pelamar_tahap t WHERE t.id_pelamar = p.id_pelamar AND t.dibatalkan_pada IS NULL ORDER BY t.urutan DESC LIMIT 1), 'Lamaran') AS status, COUNT(*) AS jumlah FROM hr_pelamar p GROUP BY p.id_lowongan, status ORDER BY p.id_lowongan, status\n-- batas: satu baris per lowongan per status, delapan status\n;";
pub const PELAMAR_LOWONGAN_RINGKAS_SQL: &str = "SELECT COUNT(*) AS jumlah, COALESCE(MIN(tanggal_lamaran), '') AS lamaran_awal FROM hr_pelamar WHERE id_lowongan = ?1;";
/// Unit = NAMA `akademik_unit` aktif (§7.1); bagian dan jabatan aktif.
pub const REFERENSI_LOWONGAN_SQL: &str = "SELECT (?1 IS NULL OR EXISTS (SELECT 1 FROM akademik_unit u WHERE u.nama_unit = ?1 AND u.status_aktif = 1)) AS unit_ada, (?2 IS NULL OR EXISTS (SELECT 1 FROM hr_bagian b WHERE b.id_bagian = ?2 AND b.is_aktif = 1)) AS bagian_ada, (?3 IS NULL OR EXISTS (SELECT 1 FROM hr_jabatan j WHERE j.id_jabatan = ?3 AND j.is_aktif = 1)) AS jabatan_ada;";
pub const SIMPAN_LOWONGAN_SQL: &str = "INSERT INTO hr_lowongan (id_lowongan, judul, kelompok, unit, id_bagian, id_jabatan, jumlah, tanggal_buka, tanggal_tutup, keterangan, dicatat_oleh, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, datetime('now'));";
/// Penjaga di statement yang sama: kelompok terkunci setelah ada pelamar, dan
/// tanggal buka tidak melewati tanggal lamaran pelamar mana pun.
pub const UBAH_LOWONGAN_SQL: &str = "UPDATE hr_lowongan SET judul = ?2, kelompok = ?3, unit = ?4, id_bagian = ?5, id_jabatan = ?6, jumlah = ?7, tanggal_buka = ?8, tanggal_tutup = ?9, keterangan = ?10, diubah_oleh = ?11, diubah_pada = datetime('now') WHERE id_lowongan = ?1 AND (kelompok = ?3 OR NOT EXISTS (SELECT 1 FROM hr_pelamar p WHERE p.id_lowongan = ?1)) AND NOT EXISTS (SELECT 1 FROM hr_pelamar p WHERE p.id_lowongan = ?1 AND p.tanggal_lamaran < ?8);";
pub const TUTUP_LOWONGAN_SQL: &str = "UPDATE hr_lowongan SET ditutup_pada = datetime('now'), ditutup_oleh = ?2 WHERE id_lowongan = ?1 AND ditutup_pada IS NULL;";
pub const BUKA_LOWONGAN_SQL: &str = "UPDATE hr_lowongan SET ditutup_pada = NULL, ditutup_oleh = NULL, tanggal_tutup = ?2, diubah_oleh = ?3, diubah_pada = datetime('now') WHERE id_lowongan = ?1 AND (ditutup_pada IS NOT NULL OR tanggal_tutup < date('now', '+7 hours'));";

pub const PELAMAR_SQL: &str = "SELECT p.id_pelamar, p.id_lowongan, l.judul AS judul_lowongan, l.kelompok, p.nama, COALESCE(p.no_hp, '') AS no_hp, COALESCE(p.email, '') AS email, COALESCE(p.lp, '') AS lp, COALESCE(p.tanggal_lahir, '') AS tanggal_lahir, COALESCE(p.alamat, '') AS alamat, COALESCE(p.pendidikan, '') AS pendidikan, COALESCE(p.prodi, '') AS prodi, COALESCE(p.sumber, '') AS sumber, p.tanggal_lamaran, COALESCE(p.catatan, '') AS catatan, COALESCE(p.id_karyawan, '') AS id_karyawan, COALESCE(p.dijadikan_oleh, '') AS dijadikan_oleh, COALESCE(p.dijadikan_pada, '') AS dijadikan_pada, p.dicatat_oleh, p.created_at, COALESCE(p.diubah_oleh, '') AS diubah_oleh, COALESCE(p.diubah_pada, '') AS diubah_pada, COALESCE((SELECT t.tahap FROM hr_pelamar_tahap t WHERE t.id_pelamar = p.id_pelamar AND t.dibatalkan_pada IS NULL ORDER BY t.urutan DESC LIMIT 1), 'Lamaran') AS status, (SELECT COUNT(*) FROM hr_pelamar_berkas b WHERE b.id_pelamar = p.id_pelamar) AS jumlah_berkas, EXISTS (SELECT 1 FROM hr_pelamar g WHERE g.id_lowongan = p.id_lowongan AND g.id_pelamar <> p.id_pelamar AND lower(trim(g.nama)) = lower(trim(p.nama)) AND COALESCE(g.no_hp, '') = COALESCE(p.no_hp, '')) AS mungkin_ganda FROM hr_pelamar p JOIN hr_lowongan l ON l.id_lowongan = p.id_lowongan WHERE p.id_lowongan = ?1 OR p.id_pelamar = ?2 ORDER BY p.tanggal_lamaran, p.created_at, p.id_pelamar\n-- batas: pelamar satu lowongan, dihapus retensi 12 bulan sesudah tutup\n;";
pub const TAHAP_SQL: &str = "SELECT id_tahap, urutan, tahap, tanggal, COALESCE(catatan, '') AS catatan, oleh, created_at, COALESCE(dibatalkan_oleh, '') AS dibatalkan_oleh, COALESCE(dibatalkan_pada, '') AS dibatalkan_pada, COALESCE(alasan_batal, '') AS alasan_batal FROM hr_pelamar_tahap WHERE id_pelamar = ?1 ORDER BY urutan\n-- batas: tahap satu pelamar\n;";
/// Pelamar baru hanya ke lowongan yang sudah dibuka, tanggal lamaran tidak
/// sebelum tanggal buka; ditulis bersama `LAMARAN_PERTAMA_SQL` satu transaksi.
pub const SIMPAN_PELAMAR_SQL: &str = "INSERT INTO hr_pelamar (id_pelamar, id_lowongan, nama, no_hp, email, lp, tanggal_lahir, alamat, pendidikan, prodi, sumber, tanggal_lamaran, catatan, dicatat_oleh, created_at) SELECT ?1, l.id_lowongan, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, datetime('now') FROM hr_lowongan l WHERE l.id_lowongan = ?2 AND l.tanggal_buka <= ?12 AND l.tanggal_buka <= date('now', '+7 hours');";
pub const LAMARAN_PERTAMA_SQL: &str = "INSERT INTO hr_pelamar_tahap (id_tahap, id_pelamar, urutan, tahap, tanggal, oleh, created_at) SELECT p.id_pelamar || ':1', p.id_pelamar, 1, 'Lamaran', p.tanggal_lamaran, ?2, datetime('now') FROM hr_pelamar p WHERE p.id_pelamar = ?1;";
pub const UBAH_PELAMAR_SQL: &str = "UPDATE hr_pelamar SET nama = ?2, no_hp = ?3, email = ?4, lp = ?5, tanggal_lahir = ?6, alamat = ?7, pendidikan = ?8, prodi = ?9, sumber = ?10, catatan = ?11, diubah_oleh = ?12, diubah_pada = datetime('now') WHERE id_pelamar = ?1 AND id_karyawan IS NULL;";
/// Urutan dihitung di statement ini sendiri; `?6` = urutan terbesar yang
/// dibaca saat memeriksa, jadi tahap yang berubah di antaranya ditolak.
pub const CATAT_TAHAP_SQL: &str = "INSERT INTO hr_pelamar_tahap (id_tahap, id_pelamar, urutan, tahap, tanggal, catatan, oleh, created_at) SELECT ?1 || ':' || (x.n + 1), ?1, x.n + 1, ?2, ?3, ?4, ?5, datetime('now') FROM (SELECT COALESCE(MAX(t.urutan), 0) AS n FROM hr_pelamar_tahap t WHERE t.id_pelamar = ?1) x WHERE x.n = ?6 AND EXISTS (SELECT 1 FROM hr_pelamar p WHERE p.id_pelamar = ?1 AND p.id_karyawan IS NULL);";
pub const BATAL_TAHAP_SQL: &str = "UPDATE hr_pelamar_tahap SET dibatalkan_oleh = ?2, dibatalkan_pada = datetime('now'), alasan_batal = ?3 WHERE id_tahap = ?1 AND urutan > 1 AND dibatalkan_pada IS NULL AND urutan = (SELECT MAX(t.urutan) FROM hr_pelamar_tahap t WHERE t.id_pelamar = hr_pelamar_tahap.id_pelamar AND t.dibatalkan_pada IS NULL) AND EXISTS (SELECT 1 FROM hr_pelamar p WHERE p.id_pelamar = hr_pelamar_tahap.id_pelamar AND p.id_karyawan IS NULL);";

pub const BERKAS_PELAMAR_SQL: &str = "SELECT id_berkas, urutan, COALESCE(nama_berkas, '') AS nama_berkas, mime_type, (length(data_base64) / 4) * 3 - (CASE WHEN data_base64 LIKE '%==' THEN 2 WHEN data_base64 LIKE '%=' THEN 1 ELSE 0 END) AS ukuran_byte, created_at FROM hr_pelamar_berkas WHERE id_pelamar = ?1 ORDER BY urutan\n-- batas: berkas satu pelamar, maksimal 3\n;";
pub const AMBIL_BERKAS_PELAMAR_SQL: &str = "SELECT id_berkas, id_pelamar, COALESCE(nama_berkas, '') AS nama_berkas, mime_type, data_base64 FROM hr_pelamar_berkas WHERE id_berkas = ?1 LIMIT 1;";
pub const TAMBAH_BERKAS_PELAMAR_SQL: &str = "WITH slot(n) AS (VALUES (1), (2), (3)) INSERT INTO hr_pelamar_berkas (id_berkas, id_pelamar, urutan, nama_berkas, mime_type, data_base64, created_at) SELECT ?1, ?2, slot.n, ?3, ?4, ?5, datetime('now') FROM slot WHERE slot.n NOT IN (SELECT urutan FROM hr_pelamar_berkas WHERE id_pelamar = ?2) AND EXISTS (SELECT 1 FROM hr_pelamar WHERE id_pelamar = ?2 AND id_karyawan IS NULL) ORDER BY slot.n LIMIT 1;";
pub const HAPUS_BERKAS_PELAMAR_SQL: &str = "DELETE FROM hr_pelamar_berkas WHERE id_berkas = ?1 AND EXISTS (SELECT 1 FROM hr_pelamar p WHERE p.id_pelamar = hr_pelamar_berkas.id_pelamar AND p.id_karyawan IS NULL);";
/// Klaim Jadikan personil (§25.2.3). Penjaga di statement yang sama: belum
/// diklaim dan tahap terakhir yang tidak dibatalkan `Diterima`, jadi dua
/// perangkat yang menekan bersamaan berhenti di cloud.
pub const KLAIM_PELAMAR_SQL: &str = "UPDATE hr_pelamar SET id_karyawan = ?2, dijadikan_oleh = ?3, dijadikan_pada = datetime('now') WHERE id_pelamar = ?1 AND id_karyawan IS NULL AND (SELECT t.tahap FROM hr_pelamar_tahap t WHERE t.id_pelamar = ?1 AND t.dibatalkan_pada IS NULL ORDER BY t.urutan DESC LIMIT 1) = 'Diterima';";
pub const PERSONIL_ADA_SQL: &str = "SELECT 1 AS ada FROM master_data WHERE id_unik = ?1 LIMIT 1;";

/// Pelamar yang lewat masa retensi (§25.2.4): belum menjadi personil, dan
/// tutup efektif lowongannya + 12 bulan sudah lewat (hari ini WIB).
#[cfg_attr(not(test), allow(dead_code))]
pub const PELAMAR_LAMA_SQL: &str = "SELECT p.id_pelamar FROM hr_pelamar p JOIN hr_lowongan l ON l.id_lowongan = p.id_lowongan WHERE p.id_karyawan IS NULL AND date(CASE WHEN l.ditutup_pada IS NULL THEN CASE WHEN l.tanggal_tutup < date('now', '+7 hours') THEN l.tanggal_tutup END WHEN l.tanggal_tutup < date('now', '+7 hours') THEN min(l.tanggal_tutup, date(l.ditutup_pada, '+7 hours')) ELSE date(l.ditutup_pada, '+7 hours') END, '+12 months') < date('now', '+7 hours')";
pub const HITUNG_PELAMAR_LAMA_SQL: &str = "SELECT COUNT(*) AS jumlah FROM hr_pelamar WHERE id_pelamar IN (SELECT p.id_pelamar FROM hr_pelamar p JOIN hr_lowongan l ON l.id_lowongan = p.id_lowongan WHERE p.id_karyawan IS NULL AND date(CASE WHEN l.ditutup_pada IS NULL THEN CASE WHEN l.tanggal_tutup < date('now', '+7 hours') THEN l.tanggal_tutup END WHEN l.tanggal_tutup < date('now', '+7 hours') THEN min(l.tanggal_tutup, date(l.ditutup_pada, '+7 hours')) ELSE date(l.ditutup_pada, '+7 hours') END, '+12 months') < date('now', '+7 hours'));";
/// Satu transaksi, predikat sama di keempatnya; pelamar dihapus terakhir.
/// Dijalankan dua kali hasilnya sama.
pub const HAPUS_PELAMAR_LAMA_SQL: [&str; 4] = [
    "UPDATE hr_lowongan SET pelamar_dihapus = pelamar_dihapus + (SELECT COUNT(*) FROM hr_pelamar x WHERE x.id_lowongan = hr_lowongan.id_lowongan AND x.id_pelamar IN (SELECT p.id_pelamar FROM hr_pelamar p JOIN hr_lowongan l ON l.id_lowongan = p.id_lowongan WHERE p.id_karyawan IS NULL AND date(CASE WHEN l.ditutup_pada IS NULL THEN CASE WHEN l.tanggal_tutup < date('now', '+7 hours') THEN l.tanggal_tutup END WHEN l.tanggal_tutup < date('now', '+7 hours') THEN min(l.tanggal_tutup, date(l.ditutup_pada, '+7 hours')) ELSE date(l.ditutup_pada, '+7 hours') END, '+12 months') < date('now', '+7 hours'))) WHERE EXISTS (SELECT 1 FROM hr_pelamar x WHERE x.id_lowongan = hr_lowongan.id_lowongan AND x.id_pelamar IN (SELECT p.id_pelamar FROM hr_pelamar p JOIN hr_lowongan l ON l.id_lowongan = p.id_lowongan WHERE p.id_karyawan IS NULL AND date(CASE WHEN l.ditutup_pada IS NULL THEN CASE WHEN l.tanggal_tutup < date('now', '+7 hours') THEN l.tanggal_tutup END WHEN l.tanggal_tutup < date('now', '+7 hours') THEN min(l.tanggal_tutup, date(l.ditutup_pada, '+7 hours')) ELSE date(l.ditutup_pada, '+7 hours') END, '+12 months') < date('now', '+7 hours')));",
    "DELETE FROM hr_pelamar_berkas WHERE id_pelamar IN (SELECT p.id_pelamar FROM hr_pelamar p JOIN hr_lowongan l ON l.id_lowongan = p.id_lowongan WHERE p.id_karyawan IS NULL AND date(CASE WHEN l.ditutup_pada IS NULL THEN CASE WHEN l.tanggal_tutup < date('now', '+7 hours') THEN l.tanggal_tutup END WHEN l.tanggal_tutup < date('now', '+7 hours') THEN min(l.tanggal_tutup, date(l.ditutup_pada, '+7 hours')) ELSE date(l.ditutup_pada, '+7 hours') END, '+12 months') < date('now', '+7 hours'));",
    "DELETE FROM hr_pelamar_tahap WHERE id_pelamar IN (SELECT p.id_pelamar FROM hr_pelamar p JOIN hr_lowongan l ON l.id_lowongan = p.id_lowongan WHERE p.id_karyawan IS NULL AND date(CASE WHEN l.ditutup_pada IS NULL THEN CASE WHEN l.tanggal_tutup < date('now', '+7 hours') THEN l.tanggal_tutup END WHEN l.tanggal_tutup < date('now', '+7 hours') THEN min(l.tanggal_tutup, date(l.ditutup_pada, '+7 hours')) ELSE date(l.ditutup_pada, '+7 hours') END, '+12 months') < date('now', '+7 hours'));",
    "DELETE FROM hr_pelamar WHERE id_pelamar IN (SELECT p.id_pelamar FROM hr_pelamar p JOIN hr_lowongan l ON l.id_lowongan = p.id_lowongan WHERE p.id_karyawan IS NULL AND date(CASE WHEN l.ditutup_pada IS NULL THEN CASE WHEN l.tanggal_tutup < date('now', '+7 hours') THEN l.tanggal_tutup END WHEN l.tanggal_tutup < date('now', '+7 hours') THEN min(l.tanggal_tutup, date(l.ditutup_pada, '+7 hours')) ELSE date(l.ditutup_pada, '+7 hours') END, '+12 months') < date('now', '+7 hours'));",
];
/// Hapus satu pelamar lebih cepat (`hr.recruit.delete`): urutan dan penjaga
/// sama dengan retensi untuk satu id; pelamar yang sudah personil tidak
/// tersentuh.
pub const HAPUS_PELAMAR_SQL: [&str; 4] = [
    "UPDATE hr_lowongan SET pelamar_dihapus = pelamar_dihapus + 1 WHERE id_lowongan = (SELECT p.id_lowongan FROM hr_pelamar p WHERE p.id_pelamar = ?1 AND p.id_karyawan IS NULL);",
    "DELETE FROM hr_pelamar_berkas WHERE id_pelamar = (SELECT p.id_pelamar FROM hr_pelamar p WHERE p.id_pelamar = ?1 AND p.id_karyawan IS NULL);",
    "DELETE FROM hr_pelamar_tahap WHERE id_pelamar = (SELECT p.id_pelamar FROM hr_pelamar p WHERE p.id_pelamar = ?1 AND p.id_karyawan IS NULL);",
    "DELETE FROM hr_pelamar WHERE id_pelamar = ?1 AND id_karyawan IS NULL;",
];

// Akses cloud

pub(super) fn galat(pesan: impl Into<String>) -> CommandError {
    CommandError::new("VALIDATION_ERROR", pesan)
}

pub(super) fn teks(baris: &Value, kunci: &str) -> String {
    match baris.get(kunci) {
        Some(Value::String(s)) => s.clone(),
        Some(Value::Number(n)) => n.to_string(),
        _ => String::new(),
    }
}

pub(super) fn angka(baris: &Value, kunci: &str) -> i64 {
    match baris.get(kunci) {
        Some(Value::Number(n)) => n.as_i64().unwrap_or(0),
        Some(Value::String(s)) => s.parse().unwrap_or(0),
        _ => 0,
    }
}

pub(super) async fn baris(client: &TursoClient, sql: &str, args: Vec<Value>) -> Result<Vec<Value>, CommandError> {
    Ok(client
        .query_one(sql, args)
        .await?
        .to_objects()
        .into_iter()
        .map(|b| json!(b))
        .collect())
}

pub(super) async fn satu(client: &TursoClient, sql: &str, args: Vec<Value>) -> Result<Option<Value>, CommandError> {
    Ok(baris(client, sql, args).await?.into_iter().next())
}

pub(super) async fn tulis(client: &TursoClient, sql: &str, args: Vec<Value>) -> Result<u64, CommandError> {
    let hasil = client.execute_pipeline(vec![Statement::new(sql, args)]).await?;
    Ok(hasil.first().map_or(0, |h| h.rows_affected))
}

pub(super) async fn hari_ini(client: &TursoClient) -> Result<String, CommandError> {
    satu(client, HARI_INI_SQL, vec![])
        .await?
        .map(|b| teks(&b, "hari_ini"))
        .filter(|t| !t.is_empty())
        .ok_or_else(CommandError::internal)
}

pub(super) fn id_wajib(draft: &Value, kunci: &str, pesan: &str) -> Result<String, CommandError> {
    payload_text(draft, kunci).ok_or_else(|| galat(pesan))
}

async fn lowongan_satu(client: &TursoClient, id: &str) -> Result<Value, CommandError> {
    satu(client, LOWONGAN_SATU_SQL, vec![json!(id)])
        .await?
        .ok_or_else(|| galat(PESAN_LOWONGAN_TIDAK_ADA))
}

async fn pelamar_satu(client: &TursoClient, id: &str) -> Result<Value, CommandError> {
    satu(client, PELAMAR_SQL, vec![json!(""), json!(id)])
        .await?
        .map(rapikan_pelamar)
        .ok_or_else(|| galat(PESAN_PELAMAR_TIDAK_ADA))
}

fn rapikan_pelamar(mut p: Value) -> Value {
    p["jumlah_berkas"] = json!(angka(&p, "jumlah_berkas"));
    p["mungkin_ganda"] = json!(angka(&p, "mungkin_ganda") != 0);
    p
}

fn ringkas_tahap(daftar: &[Value]) -> Vec<TahapRingkas> {
    daftar
        .iter()
        .map(|t| TahapRingkas {
            id_tahap: teks(t, "id_tahap"),
            urutan: angka(t, "urutan"),
            tahap: teks(t, "tahap"),
            dibatalkan: !teks(t, "dibatalkan_pada").is_empty(),
        })
        .collect()
}

/// `desktop_hr_vacancies`: daftar lowongan dengan status turunan, hitungan
/// pelamar per status, tanda lewat kuota, dan tanggal hapus data pelamar.
pub async fn daftar_lowongan(client: &TursoClient) -> Result<Value, CommandError> {
    client.ensure_schema_current().await?;
    let hari_ini = hari_ini(client).await?;
    let hitungan = baris(client, HITUNG_PELAMAR_SQL, vec![]).await?;
    let mut daftar = baris(client, LOWONGAN_SQL, vec![]).await?;
    for l in &mut daftar {
        let id = teks(l, "id_lowongan");
        let mut per_status = serde_json::Map::new();
        let mut total = 0;
        for h in hitungan.iter().filter(|h| teks(h, "id_lowongan") == id) {
            let n = angka(h, "jumlah");
            per_status.insert(teks(h, "status"), json!(n));
            total += n;
        }
        let diterima = per_status.get("Diterima").and_then(Value::as_i64).unwrap_or(0);
        let jumlah = angka(l, "jumlah");
        l["status"] = json!(status_lowongan(
            &teks(l, "tanggal_buka"),
            &teks(l, "tanggal_tutup"),
            !teks(l, "ditutup_pada").is_empty(),
            &hari_ini,
        ));
        l["jumlah"] = json!(jumlah);
        l["pelamar_dihapus"] = json!(angka(l, "pelamar_dihapus"));
        l["pelamar"] = json!(total);
        l["per_status"] = Value::Object(per_status);
        l["lewat_kuota"] = json!(diterima > jumlah);
    }
    Ok(json!({ "hari_ini": hari_ini, "lowongan": daftar }))
}

/// `desktop_hr_vacancy_save`: aksi `simpan` (buat/ubah), `tutup`, `buka`.
pub async fn simpan_lowongan(client: &TursoClient, oleh: &str, draft: &Value) -> Result<Value, CommandError> {
    client.ensure_schema_current().await?;
    let aksi = payload_text(draft, "aksi").unwrap_or_else(|| "simpan".into());
    match aksi.as_str() {
        "tutup" => {
            let id = id_wajib(draft, "id_lowongan", PESAN_LOWONGAN_TIDAK_ADA)?;
            lowongan_satu(client, &id).await?;
            if tulis(client, TUTUP_LOWONGAN_SQL, vec![json!(id), json!(oleh)]).await? == 0 {
                return Err(galat("Lowongan ini sudah ditutup."));
            }
            Ok(json!({ "sukses": true, "id_lowongan": id }))
        }
        "buka" => {
            let id = id_wajib(draft, "id_lowongan", PESAN_LOWONGAN_TIDAK_ADA)?;
            let lama = lowongan_satu(client, &id).await?;
            let tutup = payload_text(draft, "tanggal_tutup");
            periksa_buka_lagi(tutup.as_deref(), &teks(&lama, "tanggal_buka"), &hari_ini(client).await?).map_err(galat)?;
            if tulis(client, BUKA_LOWONGAN_SQL, vec![json!(id), json!(tutup), json!(oleh)]).await? == 0 {
                return Err(galat("Lowongan ini belum ditutup."));
            }
            Ok(json!({ "sukses": true, "id_lowongan": id }))
        }
        "simpan" => {
            let sah = validasi_lowongan(draft).map_err(galat)?;
            let referensi = satu(
                client,
                REFERENSI_LOWONGAN_SQL,
                vec![json!(sah.unit), json!(sah.id_bagian), json!(sah.id_jabatan)],
            )
            .await?
            .unwrap_or_default();
            if angka(&referensi, "unit_ada") == 0 {
                return Err(galat("Unit tidak ditemukan atau tidak aktif."));
            }
            if angka(&referensi, "bagian_ada") == 0 {
                return Err(galat("Bagian tidak ditemukan atau tidak aktif."));
            }
            if angka(&referensi, "jabatan_ada") == 0 {
                return Err(galat("Jabatan tidak ditemukan atau tidak aktif."));
            }
            let isi = |id: &str| {
                vec![
                    json!(id),
                    json!(sah.judul),
                    json!(sah.kelompok),
                    json!(sah.unit),
                    json!(sah.id_bagian),
                    json!(sah.id_jabatan),
                    json!(sah.jumlah),
                    json!(sah.tanggal_buka),
                    json!(sah.tanggal_tutup),
                    json!(sah.keterangan),
                    json!(oleh),
                ]
            };
            let Some(id) = sah.id_lowongan.clone() else {
                let id = new_id("low-");
                tulis(client, SIMPAN_LOWONGAN_SQL, isi(&id)).await?;
                return Ok(json!({ "sukses": true, "id_lowongan": id }));
            };
            let lama = lowongan_satu(client, &id).await?;
            let pelamar = satu(client, PELAMAR_LOWONGAN_RINGKAS_SQL, vec![json!(id)])
                .await?
                .unwrap_or_default();
            if angka(&pelamar, "jumlah") > 0 && teks(&lama, "kelompok") != sah.kelompok {
                return Err(galat(PESAN_KELOMPOK_TERKUNCI));
            }
            let awal = teks(&pelamar, "lamaran_awal");
            if !awal.is_empty() && sah.tanggal_buka > awal {
                return Err(galat(format!(
                    "Tanggal buka tidak boleh sesudah tanggal lamaran pelamar pertama ({awal})."
                )));
            }
            if tulis(client, UBAH_LOWONGAN_SQL, isi(&id)).await? == 0 {
                return Err(galat(PESAN_LOWONGAN_BERUBAH));
            }
            Ok(json!({ "sukses": true, "id_lowongan": id }))
        }
        _ => Err(galat("Aksi lowongan tidak dikenal.")),
    }
}

/// `desktop_hr_applicants`: pelamar satu lowongan, atau rincian satu pelamar
/// beserta tahap dan daftar berkasnya (tanpa isi berkas).
pub async fn daftar_pelamar(client: &TursoClient, id_lowongan: &str, id_pelamar: &str) -> Result<Value, CommandError> {
    client.ensure_schema_current().await?;
    let (id_lowongan, id_pelamar) = (id_lowongan.trim(), id_pelamar.trim());
    if !id_pelamar.is_empty() {
        let pelamar = pelamar_satu(client, id_pelamar).await?;
        let tahap = baris(client, TAHAP_SQL, vec![json!(id_pelamar)]).await?;
        let berkas = baris(client, BERKAS_PELAMAR_SQL, vec![json!(id_pelamar)]).await?;
        return Ok(json!({ "pelamar": pelamar, "tahap": tahap, "berkas": berkas }));
    }
    if id_lowongan.is_empty() {
        return Err(galat("Lowongan atau pelamar wajib dipilih."));
    }
    let daftar: Vec<Value> = baris(client, PELAMAR_SQL, vec![json!(id_lowongan), json!("")])
        .await?
        .into_iter()
        .map(rapikan_pelamar)
        .collect();
    Ok(json!({ "pelamar": daftar }))
}

/// `desktop_hr_applicant_save`: pelamar baru + tahap `Lamaran` urutan 1 dalam
/// satu transaksi, atau ubah data pelamar yang belum menjadi personil.
pub async fn simpan_pelamar(client: &TursoClient, oleh: &str, draft: &Value) -> Result<Value, CommandError> {
    client.ensure_schema_current().await?;
    let hari_ini = hari_ini(client).await?;
    let sah = validasi_pelamar(draft, &hari_ini).map_err(galat)?;
    let isi = vec![
        json!(sah.nama),
        json!(sah.no_hp),
        json!(sah.email),
        json!(sah.lp),
        json!(sah.tanggal_lahir),
        json!(sah.alamat),
        json!(sah.pendidikan),
        json!(sah.prodi),
        json!(sah.sumber),
    ];
    if let Some(id) = &sah.id_pelamar {
        let lama = pelamar_satu(client, id).await?;
        if !teks(&lama, "id_karyawan").is_empty() {
            return Err(galat(PESAN_PELAMAR_TERKUNCI));
        }
        if teks(&lama, "id_lowongan") != sah.id_lowongan {
            return Err(galat("Lowongan pelamar tidak bisa dipindah."));
        }
        if teks(&lama, "tanggal_lamaran") != sah.tanggal_lamaran {
            return Err(galat("Tanggal lamaran tidak bisa diubah."));
        }
        let mut args = vec![json!(id)];
        args.extend(isi);
        args.extend([json!(sah.catatan), json!(oleh)]);
        if tulis(client, UBAH_PELAMAR_SQL, args).await? == 0 {
            return Err(galat(PESAN_PELAMAR_TERKUNCI));
        }
        let ganda = pelamar_satu(client, id).await?["mungkin_ganda"].clone();
        return Ok(json!({ "sukses": true, "id_pelamar": id, "mungkin_ganda": ganda }));
    }
    let lowongan = lowongan_satu(client, &sah.id_lowongan).await?;
    let tanggal_buka = teks(&lowongan, "tanggal_buka");
    if tanggal_buka > hari_ini {
        return Err(galat(PESAN_LOWONGAN_BELUM_DIBUKA));
    }
    if sah.tanggal_lamaran < tanggal_buka {
        return Err(galat("Tanggal lamaran tidak boleh sebelum tanggal buka lowongan."));
    }
    let id = id_pelamar_baru();
    let mut args = vec![json!(id), json!(sah.id_lowongan)];
    args.extend(isi);
    args.extend([json!(sah.tanggal_lamaran), json!(sah.catatan), json!(oleh)]);
    client
        .execute_atomic(vec![
            Statement::new(SIMPAN_PELAMAR_SQL, args),
            Statement::new(LAMARAN_PERTAMA_SQL, vec![json!(id), json!(oleh)]),
        ])
        .await?;
    let baru = pelamar_satu(client, &id)
        .await
        .map_err(|_| galat(PESAN_LOWONGAN_BELUM_DIBUKA))?;
    Ok(json!({ "sukses": true, "id_pelamar": id, "mungkin_ganda": baru["mungkin_ganda"] }))
}

/// `desktop_hr_applicant_stage`: aksi `catat` (tahap baru) atau `batal`
/// (batalkan tahap terakhir, alasan wajib).
pub async fn tahap_pelamar(client: &TursoClient, oleh: &str, draft: &Value) -> Result<Value, CommandError> {
    client.ensure_schema_current().await?;
    let id = id_wajib(draft, "id_pelamar", PESAN_PELAMAR_TIDAK_ADA)?;
    let pelamar = pelamar_satu(client, &id).await?;
    let dijadikan = !teks(&pelamar, "id_karyawan").is_empty();
    let ringkas = ringkas_tahap(&baris(client, TAHAP_SQL, vec![json!(id)]).await?);
    match payload_text(draft, "aksi").as_deref().unwrap_or("catat") {
        "catat" => {
            if dijadikan {
                return Err(galat(PESAN_PELAMAR_TERKUNCI));
            }
            let sah = periksa_tahap(
                draft,
                &teks(&pelamar, "kelompok"),
                &status_pelamar(&ringkas),
                &teks(&pelamar, "tanggal_lamaran"),
                &hari_ini(client).await?,
            )
            .map_err(galat)?;
            let maks = ringkas.iter().map(|t| t.urutan).max().unwrap_or(0);
            let args = vec![
                json!(id),
                json!(sah.tahap),
                json!(sah.tanggal),
                json!(sah.catatan),
                json!(oleh),
                json!(maks),
            ];
            if tulis(client, CATAT_TAHAP_SQL, args).await? == 0 {
                return Err(galat(PESAN_TAHAP_BERUBAH));
            }
            Ok(json!({ "sukses": true, "id_tahap": format!("{id}:{}", maks + 1), "status": sah.tahap }))
        }
        "batal" => {
            let id_tahap = id_wajib(draft, "id_tahap", "Tahap wajib dipilih.")?;
            let alasan =
                teks_wajib(draft, "alasan", "Alasan pembatalan", MAKS_CATATAN_TAHAP).map_err(galat)?;
            periksa_batal_tahap(&ringkas, &id_tahap, dijadikan).map_err(galat)?;
            if tulis(client, BATAL_TAHAP_SQL, vec![json!(id_tahap), json!(oleh), json!(alasan)]).await? == 0 {
                return Err(galat(PESAN_TAHAP_BERUBAH));
            }
            Ok(json!({ "sukses": true }))
        }
        _ => Err(galat("Aksi tahap tidak dikenal.")),
    }
}

/// `desktop_hr_applicant_file`: isi satu berkas pelamar.
pub async fn berkas_pelamar(client: &TursoClient, id_berkas: &str) -> Result<Value, CommandError> {
    client.ensure_schema_current().await?;
    satu(client, AMBIL_BERKAS_PELAMAR_SQL, vec![json!(id_berkas.trim())])
        .await?
        .ok_or_else(|| galat("Berkas tidak ditemukan."))
}

/// `desktop_hr_applicant_file_save`: aksi `tambah` (maks 3, aturan berkas
/// dokumen) atau `hapus`. Pelamar yang sudah personil terkunci.
pub async fn simpan_berkas_pelamar(client: &TursoClient, draft: &Value) -> Result<Value, CommandError> {
    fn mentah<'a>(draft: &'a Value, kunci: &str) -> &'a str {
        draft.get(kunci).and_then(Value::as_str).unwrap_or_default()
    }
    match payload_text(draft, "aksi").as_deref().unwrap_or("tambah") {
        "tambah" => {
            let id_pelamar = id_wajib(draft, "id_pelamar", PESAN_PELAMAR_TIDAK_ADA)?;
            let berkas =
                urai_berkas_dokumen(mentah(draft, "nama_berkas"), mentah(draft, "mime_type"), mentah(draft, "data_base64"))
                    .map_err(galat)?;
            client.ensure_schema_current().await?;
            let id = new_id("plb-");
            let args = vec![
                json!(id),
                json!(id_pelamar),
                json!(berkas.nama_berkas),
                json!(berkas.mime_type),
                json!(berkas.data_base64),
            ];
            if tulis(client, TAMBAH_BERKAS_PELAMAR_SQL, args).await? == 0 {
                return Err(galat(PESAN_BERKAS_PELAMAR_PENUH));
            }
            Ok(json!({ "id_berkas": id }))
        }
        "hapus" => {
            let id = id_wajib(draft, "id_berkas", "Berkas tidak ditemukan.")?;
            client.ensure_schema_current().await?;
            if tulis(client, HAPUS_BERKAS_PELAMAR_SQL, vec![json!(id)]).await? == 0 {
                return Err(galat("Berkas tidak ditemukan, atau pelamarnya sudah menjadi personil."));
            }
            Ok(json!({ "sukses": true }))
        }
        _ => Err(galat("Aksi berkas tidak dikenal.")),
    }
}

/// `desktop_hr_applicant_delete`: hapus permanen satu pelamar beserta tahap
/// dan berkasnya; `pelamar_dihapus` lowongannya bertambah satu.
pub async fn hapus_pelamar(client: &TursoClient, id_pelamar: &str) -> Result<Value, CommandError> {
    client.ensure_schema_current().await?;
    let id = id_pelamar.trim();
    let pelamar = pelamar_satu(client, id).await?;
    if !teks(&pelamar, "id_karyawan").is_empty() {
        return Err(galat(PESAN_PELAMAR_TERKUNCI));
    }
    client
        .execute_atomic(
            HAPUS_PELAMAR_SQL
                .iter()
                .map(|sql| Statement::new(*sql, vec![json!(id)]))
                .collect(),
        )
        .await?;
    if satu(client, PELAMAR_SQL, vec![json!(""), json!(id)]).await?.is_some() {
        return Err(galat(PESAN_PELAMAR_TERKUNCI));
    }
    Ok(json!({ "sukses": true }))
}

/// `desktop_hr_recruit_cleanup`: retensi pelamar (§25.2.4). Hanya
/// mengembalikan hitungan, jadi cukup sesi.
pub async fn bersihkan_pelamar(client: &TursoClient) -> Result<Value, CommandError> {
    client.ensure_schema_current().await?;
    let jumlah = satu(client, HITUNG_PELAMAR_LAMA_SQL, vec![])
        .await?
        .map_or(0, |b| angka(&b, "jumlah"));
    if jumlah > 0 {
        client
            .execute_atomic(
                HAPUS_PELAMAR_LAMA_SQL
                    .iter()
                    .map(|sql| Statement::new(*sql, vec![]))
                    .collect(),
            )
            .await?;
    }
    Ok(json!({ "dihapus": jumlah }))
}

/// Izin jalur personil menurut kelompok lowongan (Q-142).
pub fn izin_personil(kelompok: &str) -> &'static str {
    if kelompok == "Guru" {
        "teachers.manage"
    } else {
        "employees.manage"
    }
}

/// Draft `save_teacher` / `create_employee` dari isian form: id dari pelamar
/// (id payload diabaikan), kode Tendik bawaan `K<8>`. Pemeriksaannya sama
/// dengan pemeriksaan pertama kedua jalur itu, supaya isian yang pasti
/// ditolak tidak sempat diklaim.
fn draft_personil(isian: Option<&Value>, ids: &IdPersonil, guru: bool) -> Result<Value, CommandError> {
    let mut d = isian.and_then(Value::as_object).cloned().unwrap_or_default();
    d.remove("id_unik");
    d.remove("id_guru");
    let d = if guru {
        d.insert("id_guru".into(), json!(ids.id_unik));
        d.insert("is_edit".into(), json!(false));
        let d = Value::Object(d);
        if payload_text(&d, "nama").is_none() {
            return Err(galat("Nama guru wajib diisi."));
        }
        if let Some(nuptk) = payload_text(&d, "nuptk") {
            nomor_identitas("nuptk", &nuptk).map_err(galat)?;
        }
        d
    } else {
        let kode = d
            .get("kode_karyawan")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|k| !k.is_empty())
            .unwrap_or(ids.kode_karyawan.as_str())
            .to_owned();
        d.insert("id_unik".into(), json!(ids.id_unik));
        d.insert("kode_karyawan".into(), json!(kode));
        let d = Value::Object(d);
        let nama = d.get("nama").and_then(Value::as_str).unwrap_or_default().trim().to_owned();
        if nama.len() < 2 || d.get("id_shift").and_then(Value::as_i64).unwrap_or(0) == 0 {
            return Err(CommandError::new(
                "OPERATIONAL_VALIDATION_FAILED",
                "Data karyawan belum lengkap atau tidak valid.",
            ));
        }
        d
    };
    email_personil(&d)?;
    Ok(d)
}

fn personil_lokal_ada(state: &DesktopState, id: &str) -> Result<bool, CommandError> {
    storage::database(&state.data_dir)?
        .query_row(PERSONIL_ADA_SQL, params![id], |_| Ok(()))
        .optional()
        .map(|ada| ada.is_some())
        .map_err(|_| CommandError::internal())
}

/// `desktop_hr_applicant_hire` (§25.2.3): aksi `jadikan` (klaim lalu personil
/// dan kontrak pertama) atau `lanjutkan` (klaim sudah ada, ulang langkah
/// personil bila belum ada di perangkat, lalu kontrak). Semua validasi
/// sebelum klaim; setiap langkah aman diulang lewat id deterministik.
/// Izin `hr.recruit.manage` + `hr.contract.manage` diperiksa command; izin
/// jalur personil dari kelompok lowongan di cloud, bukan dari payload.
pub async fn jadikan_personil(
    state: &DesktopState,
    client: &TursoClient,
    oleh: &str,
    draft: &Value,
) -> Result<Value, CommandError> {
    client.ensure_schema_current().await?;
    let id_pelamar = id_wajib(draft, "id_pelamar", PESAN_PELAMAR_TIDAK_ADA)?;
    let pelamar = pelamar_satu(client, &id_pelamar).await?;
    let kelompok = teks(&pelamar, "kelompok");
    commands::require_permission(state, izin_personil(&kelompok))?;
    let ids = id_dari_pelamar(&id_pelamar, &kelompok).map_err(galat)?;
    let lanjutkan = match payload_text(draft, "aksi").as_deref().unwrap_or("jadikan") {
        "jadikan" => false,
        "lanjutkan" => true,
        _ => return Err(galat("Aksi tidak dikenal.")),
    };
    if teks(&pelamar, "status") != "Diterima" {
        return Err(galat(PESAN_BELUM_DITERIMA));
    }
    let diklaim = teks(&pelamar, "id_karyawan");
    if lanjutkan && diklaim != ids.id_unik {
        return Err(galat(PESAN_TANPA_LANJUTAN));
    }
    if !lanjutkan && !diklaim.is_empty() {
        return Err(galat(PESAN_KLAIM_GAGAL));
    }
    let guru = kelompok == "Guru";
    let personil = draft_personil(draft.get("personil"), &ids, guru)?;
    let isian: KontrakIsian = serde_json::from_value(draft.get("kontrak").cloned().unwrap_or_else(|| json!({})))
        .map_err(|_| galat("Data kontrak tidak valid."))?;
    let kontrak = validasi_kontrak(&isian, guru).map_err(galat)?;

    let klaim = vec![json!(id_pelamar), json!(ids.id_unik), json!(oleh)];
    if !lanjutkan && tulis(client, KLAIM_PELAMAR_SQL, klaim).await? == 0 {
        return Err(galat(PESAN_KLAIM_GAGAL));
    }
    if !personil_lokal_ada(state, &ids.id_unik)? {
        if lanjutkan && satu(client, PERSONIL_ADA_SQL, vec![json!(ids.id_unik)]).await?.is_some() {
            return Err(galat(PESAN_SINKRONKAN_DULU));
        }
        if guru {
            academic::save_teacher(state, &personil)?;
        } else {
            operational::create_employee(state, &personil)?;
        }
    }
    let mut kontrak = serde_json::to_value(kontrak).map_err(|_| CommandError::internal())?;
    kontrak["id_karyawan"] = json!(ids.id_unik);
    simpan_kontrak_id(state, oleh, kontrak, &ids.id_kontrak)?;
    Ok(json!({ "sukses": true, "id_karyawan": ids.id_unik, "id_kontrak": ids.id_kontrak, "kelompok": kelompok }))
}

#[cfg(test)]
mod tests {
    //! Vektor sama dengan `validations/hr-rekrutmen.test.ts`; alur cloud sama
    //! dengan `services/hr-rekrutmen.test.ts`.
    use super::*;

    const VEKTOR: &str = include_str!("../../../src/lib/validations/hr-rekrutmen.vektor.json");

    fn vektor() -> Value {
        serde_json::from_str(VEKTOR).expect("hr-rekrutmen.vektor.json sah")
    }

    fn cocok<T: Serialize>(hasil: Result<T, String>, k: &Value) {
        match k["galat"].as_str() {
            Some(pesan) => assert_eq!(hasil.err().as_deref(), Some(pesan), "{}", k["nama"]),
            None => assert_eq!(json!(hasil.expect("sah")), k["hasil"], "{}", k["nama"]),
        }
    }

    fn tahap_dari(k: &Value) -> Vec<TahapRingkas> {
        serde_json::from_value(k["tahap"].clone()).expect("tahap")
    }

    fn s<'a>(k: &'a Value, kunci: &str) -> &'a str {
        k[kunci].as_str().unwrap_or_default()
    }

    #[test]
    fn hr_rekrutmen_vektor_lowongan() {
        let v = vektor();
        for k in v["lowongan"].as_array().expect("lowongan") {
            cocok(validasi_lowongan(&k["draft"]), k);
        }
        for k in v["status_lowongan"].as_array().expect("status_lowongan") {
            let status = status_lowongan(
                s(k, "tanggal_buka"),
                s(k, "tanggal_tutup"),
                k["ditutup"].as_bool().unwrap(),
                s(k, "hari_ini"),
            );
            assert_eq!(status, s(k, "hasil"), "{}", k["nama"]);
        }
        for k in v["buka_lagi"].as_array().expect("buka_lagi") {
            let hasil = periksa_buka_lagi(k["tanggal_tutup"].as_str(), s(k, "tanggal_buka"), s(k, "hari_ini"));
            cocok(hasil.map(|()| Value::Null), k);
        }
    }

    #[test]
    fn hr_rekrutmen_vektor_pelamar_dan_tahap() {
        let v = vektor();
        for k in v["pelamar"].as_array().expect("pelamar") {
            cocok(validasi_pelamar(&k["draft"], s(k, "hari_ini")), k);
        }
        for k in v["tahap"].as_array().expect("tahap") {
            let hasil = periksa_tahap(
                &k["draft"],
                s(k, "kelompok"),
                s(k, "status"),
                s(k, "tanggal_lamaran"),
                s(k, "hari_ini"),
            );
            cocok(hasil, k);
        }
        for k in v["status_pelamar"].as_array().expect("status_pelamar") {
            assert_eq!(status_pelamar(&tahap_dari(k)), s(k, "hasil"), "{}", k["nama"]);
        }
        for k in v["batal_tahap"].as_array().expect("batal_tahap") {
            let hasil = periksa_batal_tahap(&tahap_dari(k), s(k, "id_tahap"), k["dijadikan"].as_bool().unwrap());
            cocok(hasil.map(|()| Value::Null), k);
        }
        for k in v["id_personil"].as_array().expect("id_personil") {
            cocok(id_dari_pelamar(s(k, "id_pelamar"), s(k, "kelompok")), k);
        }
        assert!(id_pelamar_baru().strip_prefix("plm-").is_some_and(|h| h.len() == 32));
    }

    /// Cermin "predikat bersama disalin harfiah" di `hr-rekrutmen.test.ts`.
    #[test]
    fn hr_rekrutmen_sql_memuat_predikat_bersama() {
        assert!(LOWONGAN_SQL.contains(TUTUP_EFEKTIF_SQL));
        assert!(PELAMAR_LAMA_SQL.contains(TUTUP_EFEKTIF_SQL));
        assert!(PELAMAR_LAMA_SQL.contains(&format!("'+{RETENSI_PELAMAR_BULAN} months'")));
        for sql in std::iter::once(HITUNG_PELAMAR_LAMA_SQL).chain(HAPUS_PELAMAR_LAMA_SQL) {
            assert!(sql.contains(PELAMAR_LAMA_SQL), "{sql}");
        }
        assert!(HITUNG_PELAMAR_SQL.contains(STATUS_PELAMAR_SQL));
        assert!(PELAMAR_SQL.contains(STATUS_PELAMAR_SQL));
    }

    fn klien(origin: &str, hub: &std::path::Path) -> TursoClient {
        TursoClient::local_file(
            url::Url::parse(origin).expect("origin uji"),
            hub,
            reqwest::Client::new(),
        )
    }

    /// Database bersentinel `-2047` (v71) menerima keenam tabel v72 dan lima
    /// izin lewat `ensure_schema_current`; Admin tidak memegang `hr.recruit.*`.
    #[test]
    fn hr_rekrutmen_sentinel_2047_memicu_v72() {
        let runtime = tokio::runtime::Builder::new_current_thread().build().expect("runtime uji");
        runtime.block_on(async {
            let dir = tempfile::tempdir().expect("direktori sementara");
            let hub = dir.path().join("sppg-hub.db");
            let client = klien("https://sentinel-2047.sppg.invalid", &hub);
            client.ensure_schema().await.expect("provisioning lokal");
            let c = rusqlite::Connection::open(&hub).expect("buka hub");
            c.execute_batch(
                "DROP TABLE hr_lowongan; DROP TABLE hr_pelamar; DROP TABLE hr_pelamar_tahap;
                 DROP TABLE hr_pelamar_berkas; DROP TABLE hr_pelatihan; DROP TABLE hr_pelatihan_peserta;
                 DELETE FROM role_permission WHERE permission_key LIKE 'hr.recruit.%' OR permission_key LIKE 'hr.training.%';
                 DELETE FROM app_permission WHERE permission_key LIKE 'hr.recruit.%' OR permission_key LIKE 'hr.training.%';
                 DELETE FROM schema_migration WHERE version IN (72, -2048, -2049);",
            )
            .expect("siapkan database v71");
            client.ensure_schema_current().await.expect("skema mutakhir");
            let hitung = |sql: &str| c.query_row(sql, [], |r| r.get::<_, i64>(0)).expect(sql);
            assert_eq!(
                hitung("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN ('hr_lowongan', 'hr_pelamar', 'hr_pelamar_tahap', 'hr_pelamar_berkas', 'hr_pelatihan', 'hr_pelatihan_peserta');"),
                6
            );
            assert_eq!(hitung("SELECT COUNT(*) FROM schema_migration WHERE version IN (72, -2048);"), 2);
            assert_eq!(
                hitung("SELECT COUNT(*) FROM app_permission WHERE permission_key LIKE 'hr.recruit.%' OR permission_key LIKE 'hr.training.%';"),
                5
            );
            assert_eq!(
                hitung("SELECT COUNT(*) FROM role_permission rp JOIN app_role r ON r.id = rp.role_id WHERE r.role_key = 'admin' AND rp.permission_key LIKE 'hr.recruit.%';"),
                0
            );
            assert_eq!(
                hitung("SELECT COUNT(*) FROM role_permission rp JOIN app_role r ON r.id = rp.role_id WHERE r.role_key = 'admin' AND rp.permission_key LIKE 'hr.training.%';"),
                2
            );
        });
    }

    /// PNG 1×1 terkecil yang lolos tanda tangan bita.
    const PNG: &str = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

    /// Alur 7a di atas `TursoClient::local_file`, data sama dengan
    /// `services/hr-rekrutmen.test.ts`: lowongan, pelamar + tahap 1, tahap dan
    /// batal, berkas, hapus satu pelamar, retensi dua kali.
    #[test]
    fn hr_rekrutmen_alur_cloud() {
        let runtime = tokio::runtime::Builder::new_current_thread().build().expect("runtime uji");
        runtime.block_on(async {
            let dir = tempfile::tempdir().expect("direktori sementara");
            let hub = dir.path().join("sppg-hub.db");
            let client = klien("https://hr-rekrutmen.sppg.invalid", &hub);
            client.ensure_schema().await.expect("provisioning lokal");
            let c = rusqlite::Connection::open(&hub).expect("buka hub");
            let hitung = |sql: &str| c.query_row(sql, [], |r| r.get::<_, i64>(0)).expect(sql);
            let galat_dari = |h: Result<Value, CommandError>| h.err().map(|e| e.message).unwrap_or_default();
            let hari = hari_ini(&client).await.expect("hari ini");

            // Lowongan Guru dan Tendik.
            let guru = simpan_lowongan(
                &client,
                "uji",
                &json!({ "judul": "Guru Matematika", "kelompok": "Guru", "jumlah": 1, "tanggal_buka": "2020-01-01" }),
            )
            .await
            .expect("lowongan guru")["id_lowongan"]
                .as_str()
                .unwrap()
                .to_owned();
            let tendik = simpan_lowongan(
                &client,
                "uji",
                &json!({ "judul": "Staf TU", "kelompok": "Tendik", "jumlah": 1, "tanggal_buka": "2020-01-01" }),
            )
            .await
            .expect("lowongan tendik")["id_lowongan"]
                .as_str()
                .unwrap()
                .to_owned();
            let unit_asing = json!({ "judul": "X", "kelompok": "Guru", "jumlah": 1, "tanggal_buka": "2020-01-01", "unit": "Tidak Ada" });
            assert_eq!(galat_dari(simpan_lowongan(&client, "uji", &unit_asing).await), "Unit tidak ditemukan atau tidak aktif.");

            // Pelamar + tahap Lamaran urutan 1 dalam satu transaksi.
            let pelamar = |lowongan: &str, nama: &str| {
                json!({ "id_lowongan": lowongan, "nama": nama, "no_hp": "0812 3456 789", "tanggal_lamaran": "2020-02-01" })
            };
            let ani = simpan_pelamar(&client, "uji", &pelamar(&guru, "Ani")).await.expect("pelamar")["id_pelamar"]
                .as_str()
                .unwrap()
                .to_owned();
            let ani2 = simpan_pelamar(&client, "uji", &pelamar(&guru, "ani")).await.expect("pelamar kembar");
            assert_eq!(ani2["mungkin_ganda"], json!(true));
            let ani2 = ani2["id_pelamar"].as_str().unwrap().to_owned();
            assert_eq!(hitung(&format!("SELECT COUNT(*) FROM hr_pelamar_tahap WHERE id_tahap = '{ani}:1' AND tahap = 'Lamaran';")), 1);
            let rincian = daftar_pelamar(&client, "", &ani).await.expect("rincian");
            assert_eq!(rincian["pelamar"]["no_hp"], json!("+628123456789"));
            assert_eq!(rincian["pelamar"]["status"], json!("Lamaran"));
            assert_eq!(
                galat_dari(simpan_pelamar(&client, "uji", &json!({ "id_lowongan": guru, "nama": "Budi", "tanggal_lamaran": "2019-12-31" })).await),
                "Tanggal lamaran tidak boleh sebelum tanggal buka lowongan."
            );

            // Kelompok terkunci setelah ada pelamar.
            let ubah = json!({ "id_lowongan": guru, "judul": "Guru Matematika", "kelompok": "Tendik", "jumlah": 1, "tanggal_buka": "2020-01-01" });
            assert_eq!(galat_dari(simpan_lowongan(&client, "uji", &ubah).await), PESAN_KELOMPOK_TERKUNCI);

            // Tahap: lompat, ulang, Microteaching, tahap akhir, batal.
            let tahap = |id: &str, t: &str, catatan: &str| {
                json!({ "id_pelamar": id, "tahap": t, "tanggal": "2020-02-10", "catatan": catatan })
            };
            tahap_pelamar(&client, "uji", &tahap(&ani, "Wawancara", "")).await.expect("lompat");
            tahap_pelamar(&client, "uji", &tahap(&ani, "Wawancara", "kedua")).await.expect("ulang");
            tahap_pelamar(&client, "uji", &tahap(&ani, "Microteaching", "")).await.expect("microteaching guru");
            tahap_pelamar(&client, "uji", &tahap(&ani, "Diterima", "")).await.expect("diterima");
            assert_eq!(galat_dari(tahap_pelamar(&client, "uji", &tahap(&ani, "Penawaran", "")).await), PESAN_TAHAP_AKHIR);
            let batal = json!({ "aksi": "batal", "id_pelamar": ani, "id_tahap": format!("{ani}:5"), "alasan": "Salah klik" });
            tahap_pelamar(&client, "uji", &batal).await.expect("batal tahap terakhir");
            assert_eq!(daftar_pelamar(&client, "", &ani).await.unwrap()["pelamar"]["status"], json!("Microteaching"));
            let batal_awal = json!({ "aksi": "batal", "id_pelamar": ani2, "id_tahap": format!("{ani2}:1"), "alasan": "x" });
            assert_eq!(galat_dari(tahap_pelamar(&client, "uji", &batal_awal).await), "Tahap Lamaran pertama tidak bisa dibatalkan.");

            let budi = simpan_pelamar(&client, "uji", &pelamar(&tendik, "Budi")).await.unwrap()["id_pelamar"]
                .as_str()
                .unwrap()
                .to_owned();
            assert_eq!(
                galat_dari(tahap_pelamar(&client, "uji", &tahap(&budi, "Microteaching", "")).await),
                "Microteaching hanya untuk lowongan Guru."
            );

            // Berkas: maks 3, terkunci sesudah dijadikan personil.
            let berkas = json!({ "id_pelamar": budi, "nama_berkas": "cv.png", "mime_type": "image/png", "data_base64": PNG });
            for _ in 0..MAKS_BERKAS_PELAMAR {
                simpan_berkas_pelamar(&client, &berkas).await.expect("berkas");
            }
            assert_eq!(galat_dari(simpan_berkas_pelamar(&client, &berkas).await), PESAN_BERKAS_PELAMAR_PENUH);
            let rincian = daftar_pelamar(&client, "", &budi).await.unwrap();
            assert_eq!(rincian["berkas"].as_array().unwrap().len(), 3);
            let id_berkas = rincian["berkas"][0]["id_berkas"].as_str().unwrap().to_owned();
            assert_eq!(berkas_pelamar(&client, &id_berkas).await.unwrap()["data_base64"], json!(PNG));

            // Hapus satu pelamar: tahap dan berkas ikut, hitungan anonim naik.
            hapus_pelamar(&client, &budi).await.expect("hapus pelamar");
            assert_eq!(hitung(&format!("SELECT COUNT(*) FROM hr_pelamar_berkas WHERE id_pelamar = '{budi}';")), 0);
            assert_eq!(hitung(&format!("SELECT pelamar_dihapus FROM hr_lowongan WHERE id_lowongan = '{tendik}';")), 1);

            // Pelamar yang sudah personil tidak bisa dihapus dan lolos retensi.
            c.execute(&format!("UPDATE hr_pelamar SET id_karyawan = 'ptk_x' WHERE id_pelamar = '{ani}';"), [])
                .expect("tandai personil");
            assert_eq!(galat_dari(hapus_pelamar(&client, &ani).await), PESAN_PELAMAR_TERKUNCI);

            // Retensi: lowongan guru ditutup 13 bulan lalu, lowongan baru
            // ditutup hari ini (belum 12 bulan).
            let baru = simpan_lowongan(
                &client,
                "uji",
                &json!({ "judul": "Satpam", "kelompok": "Tendik", "jumlah": 1, "tanggal_buka": "2020-01-01" }),
            )
            .await
            .unwrap()["id_lowongan"]
                .as_str()
                .unwrap()
                .to_owned();
            let cici = simpan_pelamar(&client, "uji", &pelamar(&baru, "Cici")).await.unwrap()["id_pelamar"]
                .as_str()
                .unwrap()
                .to_owned();
            simpan_lowongan(&client, "uji", &json!({ "aksi": "tutup", "id_lowongan": baru })).await.expect("tutup");
            c.execute(
                &format!("UPDATE hr_lowongan SET ditutup_pada = datetime('now', '-13 months') WHERE id_lowongan = '{guru}';"),
                [],
            )
            .expect("tutup lama");
            let daftar = daftar_lowongan(&client).await.expect("daftar");
            let cari = |id: &str| daftar["lowongan"].as_array().unwrap().iter().find(|l| l["id_lowongan"] == json!(id)).cloned().unwrap();
            assert_eq!(cari(&baru)["status"], json!("Ditutup"));
            assert_eq!(cari(&baru)["tutup_efektif"], json!(hari));
            assert_eq!(cari(&tendik)["status"], json!("Dibuka"));
            assert_eq!(cari(&tendik)["tanggal_hapus"], json!(""));

            assert_eq!(bersihkan_pelamar(&client).await.unwrap()["dihapus"], json!(1));
            assert_eq!(bersihkan_pelamar(&client).await.unwrap()["dihapus"], json!(0));
            assert_eq!(hitung(&format!("SELECT COUNT(*) FROM hr_pelamar WHERE id_pelamar IN ('{ani}', '{cici}');")), 2);
            assert_eq!(hitung(&format!("SELECT COUNT(*) FROM hr_pelamar_tahap WHERE id_pelamar = '{ani2}';")), 0);
            assert_eq!(hitung(&format!("SELECT pelamar_dihapus FROM hr_lowongan WHERE id_lowongan = '{guru}';")), 1);

            // Buka lagi: tanggal tutup yang lewat wajib dimundurkan.
            let buka = json!({ "aksi": "buka", "id_lowongan": baru, "tanggal_tutup": "2020-06-01" });
            assert_eq!(
                galat_dari(simpan_lowongan(&client, "uji", &buka).await),
                "Tanggal tutup baru harus hari ini atau sesudahnya, atau dikosongkan."
            );
            simpan_lowongan(&client, "uji", &json!({ "aksi": "buka", "id_lowongan": baru })).await.expect("buka lagi");
            assert_eq!(hitung(&format!("SELECT COUNT(*) FROM hr_lowongan WHERE id_lowongan = '{baru}' AND ditutup_pada IS NULL;")), 1);
        });
    }

    fn sesi(state: &DesktopState, izin: &[&str]) {
        let operator = super::super::models::OperatorUser {
            id: 2,
            kode_operator: "OP2".into(),
            nama_operator: "Uji".into(),
            username: "uji".into(),
            role: "Kepegawaian".into(),
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
        };
        *state.session.lock().unwrap() = Some(super::super::models::DesktopSession {
            operator,
            mode: super::super::models::SessionMode::Offline,
            license: super::super::license::LicenseGrant::default(),
        });
    }

    /// Jadikan personil (7b) di Desktop: SQLite perangkat + `local_file`
    /// sebagai cloud, data sama dengan `services/hr-rekrutmen.test.ts`.
    #[test]
    fn hr_rekrutmen_jadikan_personil() {
        let runtime = tokio::runtime::Builder::new_current_thread().build().expect("runtime uji");
        runtime.block_on(async {
            let lokal = tempfile::tempdir().expect("direktori lokal");
            storage::initialize(lokal.path()).expect("skema lokal");
            let state = DesktopState {
                server_origin: std::sync::RwLock::new("http://localhost:3000".to_string()),
                offline_max_age_hours: 24,
                data_dir: lokal.path().to_path_buf(),
                http: reqwest::Client::new(),
                turso_config: std::sync::RwLock::new(None),
                session: std::sync::Mutex::new(None),
                vault_lock: std::sync::Mutex::new(()),
            };
            let awan = tempfile::tempdir().expect("direktori cloud");
            let hub = awan.path().join("sppg-hub.db");
            let client = klien("https://hr-hire.sppg.invalid", &hub);
            client.ensure_schema().await.expect("provisioning lokal");
            let c = rusqlite::Connection::open(&hub).expect("buka hub");
            let db = storage::database(lokal.path()).expect("db lokal");
            let lokal_n = |sql: &str| db.query_row(sql, [], |r| r.get::<_, i64>(0)).expect(sql);
            let galat_dari = |h: Result<Value, CommandError>| h.err().map(|e| e.message).unwrap_or_default();

            // Pelamar Diterima di lowongan Guru dan Tendik.
            let mut diterima = Vec::new();
            for (judul, kelompok, nama) in [("Guru IPA", "Guru", "Ani"), ("Staf TU", "Tendik", "Budi")] {
                let low = json!({ "judul": judul, "kelompok": kelompok, "jumlah": 1, "tanggal_buka": "2020-01-01" });
                let id_low = simpan_lowongan(&client, "uji", &low).await.unwrap()["id_lowongan"].as_str().unwrap().to_owned();
                let p = json!({ "id_lowongan": id_low, "nama": nama, "tanggal_lamaran": "2020-02-01" });
                let id = simpan_pelamar(&client, "uji", &p).await.unwrap()["id_pelamar"].as_str().unwrap().to_owned();
                let t = json!({ "id_pelamar": id, "tahap": "Diterima", "tanggal": "2020-02-10" });
                tahap_pelamar(&client, "uji", &t).await.expect("diterima");
                diterima.push(id);
            }
            let (ani, budi) = (diterima[0].clone(), diterima[1].clone());
            let guru = id_dari_pelamar(&ani, "Guru").unwrap();
            let tendik = id_dari_pelamar(&budi, "Tendik").unwrap();
            let klaim = |id: &str| {
                c.query_row(&format!("SELECT COALESCE(id_karyawan, '') FROM hr_pelamar WHERE id_pelamar = '{id}';"), [], |r| {
                    r.get::<_, String>(0)
                })
                .expect("pelamar")
            };
            let hire = |id: &str, aksi: &str, personil: Value, status: &str| {
                json!({
                    "aksi": aksi,
                    "id_pelamar": id,
                    "personil": personil,
                    "kontrak": { "status": status, "tanggal_mulai": "2020-03-01", "tanggal_selesai": "2021-02-28" },
                })
            };

            // Izin kurang: Guru butuh `teachers.manage`.
            sesi(&state, &["hr.recruit.manage", "hr.contract.manage", "employees.manage"]);
            let galat = jadikan_personil(&state, &client, "uji", &hire(&ani, "jadikan", json!({ "nama": "Ani" }), "GTT"))
                .await
                .expect_err("izin kurang");
            assert_eq!(galat.code, "DESKTOP_ACCESS_DENIED");
            assert_eq!(klaim(&ani), "");

            // GTY untuk Tendik ditolak sebelum klaim.
            let budi_draft = |status: &str| hire(&budi, "jadikan", json!({ "nama": "Budi", "id_shift": 1, "divisi": "Tata Usaha", "id_unik": "ASING" }), status);
            assert_eq!(galat_dari(jadikan_personil(&state, &client, "uji", &budi_draft("GTY")).await), "Status GTY dan GTT hanya untuk guru.");
            assert_eq!(klaim(&budi), "");

            // Tendik: master_data + id_card + QR id|token + kontrak + outbox, tanpa guru_data.
            let hasil = jadikan_personil(&state, &client, "uji", &budi_draft("PTT")).await.expect("tendik");
            assert_eq!(hasil["id_karyawan"], json!(tendik.id_unik));
            assert_eq!(klaim(&budi), tendik.id_unik);
            let t = &tendik.id_unik;
            assert_eq!(lokal_n(&format!("SELECT COUNT(*) FROM master_data WHERE id_unik = '{t}' AND kode_karyawan = '{}' AND qr_code = id_unik || '|' || token_absensi;", tendik.kode_karyawan)), 1);
            assert_eq!(lokal_n(&format!("SELECT COUNT(*) FROM guru_data WHERE id_guru = '{t}';")), 0);
            assert_eq!(lokal_n(&format!("SELECT COUNT(*) FROM id_card WHERE id_unik = '{t}';")), 1);
            assert_eq!(lokal_n(&format!("SELECT COUNT(*) FROM hr_kontrak WHERE id_kontrak = '{}' AND status = 'PTT';", tendik.id_kontrak)), 1);
            assert_eq!(lokal_n(&format!("SELECT COUNT(*) FROM desktop_sync_outbox WHERE entity_key IN ('{t}', '{}');", tendik.id_kontrak)), 2);

            // Tekan kedua ditolak; data pelamar terkunci.
            assert_eq!(galat_dari(jadikan_personil(&state, &client, "uji", &budi_draft("PTT")).await), PESAN_KLAIM_GAGAL);
            let ubah = json!({ "id_pelamar": budi, "id_lowongan": daftar_pelamar(&client, "", &budi).await.unwrap()["pelamar"]["id_lowongan"], "nama": "Budi X", "tanggal_lamaran": "2020-02-01" });
            assert_eq!(galat_dari(simpan_pelamar(&client, "uji", &ubah).await), PESAN_PELAMAR_TERKUNCI);

            // Guru: klaim lalu gagal (shift tidak ada), lalu Lanjutkan.
            sesi(&state, &["hr.recruit.manage", "hr.contract.manage", "teachers.manage"]);
            let gagal = hire(&ani, "jadikan", json!({ "nama": "Ani", "id_shift": 999 }), "GTY");
            assert_eq!(
                galat_dari(jadikan_personil(&state, &client, "uji", &gagal).await),
                "Shift yang dipilih tidak ditemukan. Muat ulang halaman lalu pilih shift lagi."
            );
            assert_eq!(klaim(&ani), guru.id_unik);
            let g = &guru.id_unik;
            assert_eq!(lokal_n(&format!("SELECT COUNT(*) FROM master_data WHERE id_unik = '{g}';")), 0);
            let lanjut = hire(&ani, "lanjutkan", json!({ "nama": "Ani" }), "GTY");

            // Lanjutkan di Desktop ditolak bila master_data hanya ada di cloud.
            c.execute(&format!("INSERT INTO master_data (id_unik, kode_karyawan, nama, divisi, id_shift) VALUES ('{g}', '{g}', 'Ani', 'Guru', 1);"), [])
                .expect("master_data cloud");
            assert_eq!(galat_dari(jadikan_personil(&state, &client, "uji", &lanjut).await), PESAN_SINKRONKAN_DULU);
            c.execute(&format!("DELETE FROM master_data WHERE id_unik = '{g}';"), []).expect("hapus");

            jadikan_personil(&state, &client, "uji", &lanjut).await.expect("lanjutkan");
            assert_eq!(lokal_n(&format!("SELECT COUNT(*) FROM master_data WHERE id_unik = '{g}' AND jenis_personil = 'GURU' AND qr_code = id_unik || '|' || token_absensi;")), 1);
            assert_eq!(lokal_n(&format!("SELECT COUNT(*) FROM guru_data WHERE id_guru = '{g}' AND status_kepegawaian = 'GTY';")), 1);
            assert_eq!(lokal_n(&format!("SELECT COUNT(*) FROM id_card WHERE id_unik = '{g}';")), 1);
            // Lanjutkan diulang: kontrak berhenti di PK tanpa outbox kedua.
            jadikan_personil(&state, &client, "uji", &lanjut).await.expect("lanjutkan lagi");
            assert_eq!(lokal_n(&format!("SELECT COUNT(*) FROM hr_kontrak WHERE id_karyawan = '{g}';")), 1);
            assert_eq!(lokal_n(&format!("SELECT COUNT(*) FROM desktop_sync_outbox WHERE entity_key = '{}';", guru.id_kontrak)), 1);
            assert_eq!(
                galat_dari(jadikan_personil(&state, &client, "uji", &hire(&budi, "lanjutkan", json!({}), "PTT")).await),
                "Akses ditolak untuk tindakan ini."
            );
            assert_eq!(izin_personil("Guru"), "teachers.manage");
        });
    }
}
