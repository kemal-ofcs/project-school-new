// BERKAS INI HASIL SALIN OTOMATIS dari web-desktop oleh
// `mobile/scripts/sync-rust-modules.ts`. JANGAN disunting dengan tangan —
// perubahannya akan tertimpa diam-diam pada sinkronisasi berikutnya.
// Sunting sumbernya: `web-desktop/src-tauri/src/desktop/nilai_akhir.rs`.

//! Nilai akhir (Fase N2a): jenis penilaian dinamis berbobot, bobot
//! kehadiran, Hari Sekolah per unit, rekap nilai akhir, dan kehadiran siswa
//! yang dipakai bersama oleh rekap dan leger kehadiran.
//!
//! `nilai_jenis` tersinkron (rute `grade-type/save|delete`). Bobot kehadiran
//! dan Hari Sekolah adalah setting tersinkron `setting_gex_system`. Aturan
//! murni dicerminkan `src/lib/validations/nilai-akhir.ts` dan diuji dengan
//! vektor yang sama; pesan galatnya pun wajib identik. Urutan operasi pecahan
//! dijaga sama dengan TS supaya hasil `f64` identik bit per bit.

use std::collections::{HashMap, HashSet};
use std::sync::OnceLock;

use rusqlite::{params, Connection, OptionalExtension};
use serde::Deserialize;
use serde_json::{json, Value};

use super::{config::MobileState, models::CommandError, storage, sync};

pub const KUNCI_BOBOT_KEHADIRAN: &str = "nilai_bobot_kehadiran";
pub const KUNCI_HARI_SEKOLAH: &str = "hari_sekolah";
pub const JENIS_WARISAN_BUATAN: &str = "Tugas";
pub const MAKS_NAMA_JENIS: usize = 40;

/// Ekspresi id jenis efektif penilaian `p`: kolom `id_jenis`, atau turunan
/// dari nama jenis lama. Cermin `JENIS_EFEKTIF_SQL` di `services/nilai-akhir.ts`.
pub const JENIS_EFEKTIF_SQL: &str = "COALESCE(NULLIF(TRIM(p.id_jenis), ''), CASE p.jenis
    WHEN 'Tugas' THEN 'jns-tugas'
    WHEN 'Ulangan Harian' THEN 'jns-uh'
    WHEN 'Praktik' THEN 'jns-praktik'
    WHEN 'UTS' THEN 'jns-uts'
    WHEN 'UAS' THEN 'jns-uas' END)";

#[derive(Debug, Clone, Deserialize)]
pub struct JenisBawaan {
    pub id_jenis: String,
    pub nama: String,
    pub urutan: i64,
}

/// Lima jenis lama berid tetap, dari berkas JSON yang SAMA dengan TS.
pub fn jenis_bawaan() -> &'static [JenisBawaan] {
    static JENIS: OnceLock<Vec<JenisBawaan>> = OnceLock::new();
    JENIS.get_or_init(|| {
        serde_json::from_str(include_str!(
            "../../../src/lib/validations/jenis-nilai-bawaan.json"
        ))
        .expect("jenis-nilai-bawaan.json tidak valid")
    })
}

pub const SEED_JENIS_SQL: &str = "INSERT OR IGNORE INTO nilai_jenis (id_jenis, nama, bobot, urutan, is_aktif, created_at, updated_at) VALUES (?, ?, 0, ?, 1, datetime('now'), datetime('now'));";

/// Menanam jenis bawaan ke SQLite lokal. Tidak masuk outbox: cloud menanam
/// seed yang sama, dan `INSERT OR IGNORE` tidak menimpa bobot yang sudah diatur.
/// Sekali per perangkat: lupakan kursor tarikan `nilai_jenis`.
///
/// Sampai perbaikan ini, sumber snapshot `nilai_jenis` memakai kunci payload
/// milik `nilai_penilaian`, sehingga jenis penilaian buatan sekolah tidak
/// pernah sampai ke perangkat lain, padahal penghitung perubahannya sudah
/// terbaca dan tabelnya dianggap mutakhir. Menghapus kursornya membuat tarikan
/// berikutnya mengambil seluruh tabel. Penandanya baris `pulih:nilai_jenis`
/// di `desktop_sync_cursor`, jadi tidak berulang di setiap pembukaan aplikasi.
pub fn pulihkan_tarikan_jenis(connection: &Connection) -> rusqlite::Result<()> {
    connection.execute_batch(
        "DELETE FROM desktop_sync_table_cursor
           WHERE table_name = 'nilai_jenis'
             AND NOT EXISTS (SELECT 1 FROM desktop_sync_cursor WHERE domain = 'pulih:nilai_jenis');
         INSERT OR IGNORE INTO desktop_sync_cursor (domain, last_revision, updated_at)
           VALUES ('pulih:nilai_jenis', 1, unixepoch());",
    )
}

pub fn seed_jenis_bawaan(connection: &Connection) -> rusqlite::Result<()> {
    let mut statement = connection.prepare(SEED_JENIS_SQL)?;
    for jenis in jenis_bawaan() {
        statement.execute(params![jenis.id_jenis, jenis.nama, jenis.urutan])?;
    }
    Ok(())
}

// ── Aturan murni ────────────────────────────────────────────────────────────

fn panjang(value: &str) -> usize {
    value.chars().count()
}

pub fn is_jenis_bawaan(id_jenis: &str) -> bool {
    jenis_bawaan().iter().any(|item| item.id_jenis == id_jenis)
}

/// Cermin `idJenisEfektif`.
pub fn id_jenis_efektif(id_jenis: Option<&str>, jenis: &str) -> Option<String> {
    if let Some(id) = id_jenis.map(str::trim).filter(|id| !id.is_empty()) {
        return Some(id.to_owned());
    }
    jenis_bawaan()
        .iter()
        .find(|item| item.nama == jenis)
        .map(|item| item.id_jenis.clone())
}

/// Cermin `jenisWarisan`.
pub fn jenis_warisan(id_jenis: &str) -> String {
    jenis_bawaan()
        .iter()
        .find(|item| item.id_jenis == id_jenis)
        .map(|item| item.nama.clone())
        .unwrap_or_else(|| JENIS_WARISAN_BUATAN.to_owned())
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct JenisNilaiDraft {
    #[serde(default)]
    pub id_jenis: Option<String>,
    #[serde(default)]
    pub nama: String,
    #[serde(default)]
    pub urutan: Value,
    #[serde(default = "bawaan_aktif")]
    pub is_aktif: bool,
}

fn bawaan_aktif() -> bool {
    true
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct JenisNilaiValid {
    pub nama: String,
    pub urutan: i64,
    pub is_aktif: bool,
}

/// Cermin `validateJenisNilai`.
pub fn validate_jenis_nilai(draft: &JenisNilaiDraft) -> Result<JenisNilaiValid, String> {
    let nama = draft.nama.trim();
    if nama.is_empty() {
        return Err("Nama jenis wajib diisi.".into());
    }
    if panjang(nama) > MAKS_NAMA_JENIS {
        return Err("Nama jenis maksimal 40 karakter.".into());
    }
    let urutan = match &draft.urutan {
        Value::Null => Some(0),
        value => value.as_i64().filter(|u| (0..=999).contains(u)),
    };
    let Some(urutan) = urutan else {
        return Err("Urutan harus bilangan 0 sampai 999.".into());
    };
    Ok(JenisNilaiValid {
        nama: nama.to_owned(),
        urutan,
        is_aktif: draft.is_aktif,
    })
}

#[derive(Debug, Clone)]
pub struct BobotJenis {
    pub id_jenis: String,
    pub bobot: Value,
    pub is_aktif: bool,
}

fn bobot_sah(value: &Value) -> Option<i64> {
    value.as_i64().filter(|b| (0..=100).contains(b))
}

/// Cermin `validateBobotNilai`.
pub fn validate_bobot_nilai(bobot_kehadiran: &Value, jenis: &[BobotJenis]) -> Result<i64, String> {
    let kehadiran = bobot_sah(bobot_kehadiran);
    let bobot: Vec<Option<i64>> = jenis.iter().map(|item| bobot_sah(&item.bobot)).collect();
    let (Some(kehadiran), true) = (kehadiran, bobot.iter().all(Option::is_some)) else {
        return Err("Bobot harus bilangan bulat 0 sampai 100.".into());
    };
    if jenis
        .iter()
        .zip(&bobot)
        .any(|(item, b)| !item.is_aktif && b.unwrap_or(0) > 0)
    {
        return Err("Jenis nonaktif tidak boleh berbobot.".into());
    }
    let total = kehadiran + bobot.iter().map(|b| b.unwrap_or(0)).sum::<i64>();
    if total != 100 {
        return Err(format!("Total bobot harus 100%, sekarang {total}%."));
    }
    Ok(total)
}

/// 1 = Senin s.d. 7 = Minggu, sama dengan Jadwal Mengajar.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HariSekolah {
    pub bawaan: Vec<i64>,
    pub unit: Vec<(String, Vec<i64>)>,
}

impl HariSekolah {
    pub fn bawaan_sekolah() -> Self {
        HariSekolah {
            bawaan: vec![1, 2, 3, 4, 5],
            unit: Vec::new(),
        }
    }

    pub fn to_json(&self) -> Value {
        let mut unit = serde_json::Map::new();
        for (id, hari) in &self.unit {
            unit.insert(id.clone(), json!(hari));
        }
        json!({ "bawaan": self.bawaan, "unit": unit })
    }
}

/// Cermin `validateDaftarHari`: hasilnya terurut naik.
pub fn validate_daftar_hari(daftar: &Value) -> Result<Vec<i64>, String> {
    let Some(items) = daftar.as_array().filter(|items| !items.is_empty()) else {
        return Err("Pilih minimal satu hari sekolah.".into());
    };
    let mut hari = Vec::with_capacity(items.len());
    for item in items {
        match item.as_i64().filter(|h| (1..=7).contains(h)) {
            Some(h) if item.is_i64() || item.is_u64() => hari.push(h),
            _ => return Err("Hari sekolah harus angka 1 (Senin) sampai 7 (Minggu).".into()),
        }
    }
    if hari.iter().collect::<HashSet<_>>().len() != hari.len() {
        return Err("Hari sekolah tidak boleh ganda.".into());
    }
    hari.sort_unstable();
    Ok(hari)
}

/// Cermin `validateHariSekolah`.
pub fn validate_hari_sekolah(nilai: &Value) -> Result<HariSekolah, String> {
    let bentuk_salah = || "Data hari sekolah tidak valid.".to_string();
    let objek = nilai.as_object().ok_or_else(bentuk_salah)?;
    if objek.keys().any(|k| k != "bawaan" && k != "unit") {
        return Err(bentuk_salah());
    }
    let bawaan = validate_daftar_hari(objek.get("bawaan").unwrap_or(&Value::Null))?;
    let mut unit = Vec::new();
    match objek.get("unit") {
        None | Some(Value::Null) => {}
        Some(Value::Object(peta)) => {
            for (id, daftar) in peta {
                if id.trim().is_empty() {
                    return Err(bentuk_salah());
                }
                unit.push((id.clone(), validate_daftar_hari(daftar)?));
            }
        }
        Some(_) => return Err(bentuk_salah()),
    }
    Ok(HariSekolah { bawaan, unit })
}

/// Cermin `parseHariSekolah`.
pub fn parse_hari_sekolah(tersimpan: Option<&str>) -> HariSekolah {
    tersimpan
        .and_then(|teks| serde_json::from_str::<Value>(teks).ok())
        .and_then(|nilai| validate_hari_sekolah(&nilai).ok())
        .unwrap_or_else(HariSekolah::bawaan_sekolah)
}

pub fn hari_sekolah_untuk<'a>(konfigurasi: &'a HariSekolah, id_unit: Option<&str>) -> &'a [i64] {
    id_unit
        .and_then(|id| konfigurasi.unit.iter().find(|(kunci, _)| kunci == id))
        .map(|(_, hari)| hari.as_slice())
        .unwrap_or(&konfigurasi.bawaan)
}

#[derive(Debug, Clone)]
pub struct BarisTahunAjaran {
    pub nama_tahun: String,
    pub semester: String,
    pub tanggal_mulai: String,
    pub tanggal_selesai: String,
}

/// Cermin `rentangSemester` (keputusan B).
pub fn rentang_semester(
    pilihan: &BarisTahunAjaran,
    saudara: Option<(&str, &str)>,
    diminta: &str,
) -> Result<(String, String), String> {
    if pilihan.semester == diminta {
        return Ok((
            pilihan.tanggal_mulai.clone(),
            pilihan.tanggal_selesai.clone(),
        ));
    }
    if let Some((mulai, selesai)) = saudara {
        return Ok((mulai.to_owned(), selesai.to_owned()));
    }
    let nama = pilihan.nama_tahun.trim();
    let tahun: String = if nama.chars().take(4).all(|c| c.is_ascii_digit()) && panjang(nama) >= 4 {
        nama.chars().take(4).collect()
    } else {
        pilihan.tanggal_mulai.chars().take(4).collect()
    };
    let galat = || {
        format!(
            "Rentang tanggal semester {diminta} tidak bisa ditentukan. Buat baris tahun ajaran untuk semester {diminta}."
        )
    };
    let awal: i64 = tahun.parse().map_err(|_| galat())?;
    let (a, b) = if diminta == "Ganjil" {
        (format!("{awal}-07-01"), format!("{awal}-12-31"))
    } else {
        (format!("{}-01-01", awal + 1), format!("{}-06-30", awal + 1))
    };
    let mulai = if pilihan.tanggal_mulai > a {
        pilihan.tanggal_mulai.clone()
    } else {
        a
    };
    let selesai = if pilihan.tanggal_selesai < b {
        pilihan.tanggal_selesai.clone()
    } else {
        b
    };
    if mulai > selesai {
        return Err(galat());
    }
    Ok((mulai, selesai))
}

/// Cermin `hadirDiGerbang`.
pub fn hadir_di_gerbang(hadir_gerbang: i64, status: &str) -> bool {
    hadir_gerbang == 1 || status == "Hadir" || status == "Terlambat"
}

/// Cermin `klasifikasiHari` (PRD 4.3).
pub fn klasifikasi_hari(gerbang: bool, alfa_mapel: bool, status: &str) -> &'static str {
    if gerbang {
        return if alfa_mapel { "Bolos" } else { "Hadir" };
    }
    match status {
        "Dispensasi" => "Dispensasi",
        "Izin" => "Izin",
        "Sakit" => "Sakit",
        _ => "Alfa",
    }
}

/// Cermin `persenKehadiran`.
pub fn persen_kehadiran(masuk: i64, hari_efektif: i64, keluar: i64) -> Option<f64> {
    let pembagi = hari_efektif - keluar;
    (pembagi > 0).then(|| (masuk as f64 * 100.0) / pembagi as f64)
}

/// Cermin `bulatAkhir`.
pub fn bulat_akhir(nilai: f64) -> i64 {
    (nilai + 0.5 + 1e-9).floor() as i64
}

#[derive(Debug, Clone)]
pub struct SkorPenilaian {
    pub skor: Option<f64>,
    pub nilai_maks: f64,
    pub bobot: f64,
}

/// Cermin `rataJenis`.
pub fn rata_jenis(items: &[SkorPenilaian]) -> Option<f64> {
    let mut jumlah = 0.0;
    let mut timbang = 0.0;
    for item in items {
        let ternormalisasi = (item.skor.unwrap_or(0.0) * 100.0) / item.nilai_maks;
        jumlah += ternormalisasi * item.bobot;
        timbang += item.bobot;
    }
    (timbang > 0.0).then(|| jumlah / timbang)
}

/// Cermin `hitungNilaiAkhir`: `(nilai akhir, bobot efektif per komponen)`.
pub fn hitung_nilai_akhir(komponen: &[(f64, Option<f64>)]) -> (Option<i64>, Vec<Option<f64>>) {
    let mut total = 0.0;
    for (bobot, nilai) in komponen {
        if nilai.is_some() {
            total += bobot;
        }
    }
    if total <= 0.0 {
        return (None, komponen.iter().map(|_| None).collect());
    }
    let mut jumlah = 0.0;
    for (bobot, nilai) in komponen {
        if let Some(nilai) = nilai {
            jumlah += nilai * bobot;
        }
    }
    (
        Some(bulat_akhir(jumlah / total)),
        komponen
            .iter()
            .map(|(bobot, nilai)| nilai.map(|_| (bobot * 100.0) / total))
            .collect(),
    )
}

// ── I/O lokal ───────────────────────────────────────────────────────────────

fn invalid(message: impl Into<String>) -> CommandError {
    CommandError::new("VALIDATION_ERROR", message)
}

fn db_error(_: rusqlite::Error) -> CommandError {
    CommandError::internal()
}

fn new_id(prefix: &str) -> String {
    let mut bytes = [0u8; 16];
    rand_core::RngCore::fill_bytes(&mut rand_core::OsRng, &mut bytes);
    format!("{prefix}{}", hex::encode(bytes))
}

fn query_json(
    connection: &Connection,
    sql: &str,
    args: &[&dyn rusqlite::ToSql],
) -> Result<Vec<Value>, CommandError> {
    let mut statement = connection.prepare(sql).map_err(db_error)?;
    let names: Vec<String> = statement
        .column_names()
        .iter()
        .map(|n| (*n).to_owned())
        .collect();
    let rows = statement
        .query_map(args, |row| {
            let mut map = serde_json::Map::new();
            for (idx, name) in names.iter().enumerate() {
                let value = match row.get_ref(idx)? {
                    rusqlite::types::ValueRef::Null => Value::Null,
                    rusqlite::types::ValueRef::Integer(v) => json!(v),
                    rusqlite::types::ValueRef::Real(v) => json!(v),
                    rusqlite::types::ValueRef::Text(v) => json!(String::from_utf8_lossy(v)),
                    rusqlite::types::ValueRef::Blob(_) => Value::Null,
                };
                map.insert(name.clone(), value);
            }
            Ok(Value::Object(map))
        })
        .map_err(db_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(db_error)?;
    Ok(rows)
}

fn setting(connection: &Connection, key: &str) -> Result<Option<String>, CommandError> {
    connection
        .query_row(
            "SELECT value FROM setting_gex_system WHERE key = ?;",
            params![key],
            |row| row.get(0),
        )
        .optional()
        .map_err(db_error)
}

fn bobot_kehadiran(connection: &Connection) -> Result<i64, CommandError> {
    Ok(setting(connection, KUNCI_BOBOT_KEHADIRAN)?
        .and_then(|v| v.trim().parse::<i64>().ok())
        .filter(|v| (0..=100).contains(v))
        .unwrap_or(0))
}

pub(crate) fn tulis_setting(
    transaction: &rusqlite::Transaction<'_>,
    client_id: &str,
    key: &str,
    value: &str,
) -> Result<(), CommandError> {
    transaction
        .execute(
            "INSERT INTO setting_gex_system (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value;",
            params![key, value],
        )
        .map_err(db_error)?;
    // Hanya nilai terakhir yang perlu sampai ke cloud (pola template WhatsApp).
    transaction
        .execute(
            "DELETE FROM desktop_sync_outbox WHERE domain = 'setting' AND entity_key = ?1 AND status IN ('pending', 'failed', 'conflict');",
            params![key],
        )
        .map_err(db_error)?;
    sync::enqueue(
        transaction,
        client_id,
        "setting",
        "update",
        key,
        &json!({ "key": key, "value": value }),
        None,
    )?;
    Ok(())
}

const JENIS_SQL: &str = "SELECT id_jenis, nama, bobot, urutan, is_aktif, created_at, updated_at FROM nilai_jenis WHERE id_jenis = ?;";

fn semua_jenis(connection: &Connection) -> Result<Vec<Value>, CommandError> {
    query_json(
        connection,
        "SELECT id_jenis, nama, bobot, urutan, is_aktif FROM nilai_jenis
         ORDER BY urutan, nama, id_jenis LIMIT 200;",
        &[],
    )
}

/// Jenis, bobot, Hari Sekolah, dan daftar unit untuk tab Pengaturan Nilai.
pub fn config(state: &MobileState) -> Result<Value, CommandError> {
    let connection = storage::database(&state.data_dir)?;
    let dipakai: HashMap<String, i64> = query_json(
        &connection,
        &format!(
            "SELECT {JENIS_EFEKTIF_SQL} AS id_jenis, COUNT(*) AS jumlah
             FROM nilai_penilaian p GROUP BY 1
             -- batas: agregat per jenis, satu baris per jenis
             ;"
        ),
        &[],
    )?
    .into_iter()
    .filter_map(|row| {
        Some((
            row["id_jenis"].as_str()?.to_owned(),
            row["jumlah"].as_i64()?,
        ))
    })
    .collect();
    let jenis: Vec<Value> = semua_jenis(&connection)?
        .into_iter()
        .map(|mut row| {
            let id = row["id_jenis"].as_str().unwrap_or("").to_owned();
            row["bawaan"] = json!(is_jenis_bawaan(&id));
            row["dipakai"] = json!(dipakai.get(&id).copied().unwrap_or(0));
            row
        })
        .collect();
    let kehadiran = bobot_kehadiran(&connection)?;
    let total: i64 = kehadiran
        + jenis
            .iter()
            .filter(|row| row["is_aktif"].as_i64() == Some(1))
            .map(|row| row["bobot"].as_i64().unwrap_or(0))
            .sum::<i64>();
    let unit = query_json(
        &connection,
        "SELECT id_unit, nama_unit FROM akademik_unit ORDER BY nama_unit, id_unit LIMIT 100;",
        &[],
    )?;
    Ok(json!({
        "jenis": jenis,
        "bobot_kehadiran": kehadiran,
        "total_bobot": total,
        "hari_sekolah": parse_hari_sekolah(setting(&connection, KUNCI_HARI_SEKOLAH)?.as_deref()).to_json(),
        "unit": unit,
    }))
}

pub fn save_type(state: &MobileState, draft: Value) -> Result<Value, CommandError> {
    let draft: JenisNilaiDraft =
        serde_json::from_value(draft).map_err(|_| invalid("Data jenis penilaian tidak valid."))?;
    let valid = validate_jenis_nilai(&draft).map_err(invalid)?;
    let client_id = sync::ensure_client_id(state)?;
    let mut connection = storage::database(&state.data_dir)?;
    let transaction = connection.transaction().map_err(db_error)?;
    let id = draft
        .id_jenis
        .as_deref()
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .map(str::to_owned)
        .unwrap_or_else(|| new_id("jns-"));
    let kembar: bool = transaction
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM nilai_jenis WHERE LOWER(TRIM(nama)) = LOWER(?) AND id_jenis <> ?);",
            params![valid.nama, id],
            |row| row.get(0),
        )
        .map_err(db_error)?;
    if kembar {
        return Err(invalid("Nama jenis sudah dipakai."));
    }
    let bobot_lama: Option<i64> = transaction
        .query_row(
            "SELECT bobot FROM nilai_jenis WHERE id_jenis = ?;",
            params![id],
            |row| row.get(0),
        )
        .optional()
        .map_err(db_error)?;
    if !valid.is_aktif && bobot_lama.unwrap_or(0) > 0 {
        return Err(invalid(
            "Jenis yang masih berbobot tidak bisa dinonaktifkan. Pindahkan bobotnya ke jenis lain dulu.",
        ));
    }
    transaction
        .execute(
            "INSERT INTO nilai_jenis (id_jenis, nama, bobot, urutan, is_aktif, created_at, updated_at)
             VALUES (?, ?, 0, ?, ?, datetime('now'), datetime('now'))
             ON CONFLICT(id_jenis) DO UPDATE SET
                nama = excluded.nama,
                urutan = excluded.urutan,
                is_aktif = excluded.is_aktif,
                updated_at = excluded.updated_at;",
            params![id, valid.nama, valid.urutan, valid.is_aktif as i64],
        )
        .map_err(db_error)?;
    let payload = query_json(&transaction, JENIS_SQL, &[&id])?
        .into_iter()
        .next()
        .ok_or_else(CommandError::internal)?;
    sync::enqueue(
        &transaction,
        &client_id,
        "grade-type",
        "save",
        &id,
        &payload,
        None,
    )?;
    transaction.commit().map_err(db_error)?;
    Ok(json!({ "sukses": true, "id_jenis": id }))
}

pub fn delete_type(state: &MobileState, id_jenis: &str) -> Result<Value, CommandError> {
    if is_jenis_bawaan(id_jenis) {
        return Err(invalid(
            "Jenis bawaan tidak bisa dihapus; nonaktifkan saja.",
        ));
    }
    let client_id = sync::ensure_client_id(state)?;
    let mut connection = storage::database(&state.data_dir)?;
    let transaction = connection.transaction().map_err(db_error)?;
    let bobot: i64 = transaction
        .query_row(
            "SELECT bobot FROM nilai_jenis WHERE id_jenis = ?;",
            params![id_jenis],
            |row| row.get(0),
        )
        .optional()
        .map_err(db_error)?
        .ok_or_else(|| invalid("Jenis tidak ditemukan."))?;
    let dipakai: bool = transaction
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM nilai_penilaian WHERE id_jenis = ?);",
            params![id_jenis],
            |row| row.get(0),
        )
        .map_err(db_error)?;
    if dipakai {
        return Err(invalid(
            "Jenis ini sudah dipakai penilaian; nonaktifkan saja.",
        ));
    }
    if bobot > 0 {
        return Err(invalid("Jenis yang masih berbobot tidak bisa dihapus."));
    }
    transaction
        .execute(
            "DELETE FROM nilai_jenis WHERE id_jenis = ?;",
            params![id_jenis],
        )
        .map_err(db_error)?;
    sync::enqueue(
        &transaction,
        &client_id,
        "grade-type",
        "delete",
        id_jenis,
        &json!({ "id_jenis": id_jenis }),
        None,
    )?;
    transaction.commit().map_err(db_error)?;
    Ok(json!({ "sukses": true }))
}

/// Menyimpan seluruh bobot sekaligus: bobot satu jenis tidak bisa diubah
/// sendirian tanpa melanggar total 100%.
pub fn save_weights(
    state: &MobileState,
    bobot_kehadiran: Value,
    items: Vec<Value>,
) -> Result<Value, CommandError> {
    let client_id = sync::ensure_client_id(state)?;
    let mut connection = storage::database(&state.data_dir)?;
    let transaction = connection.transaction().map_err(db_error)?;
    let ada = semua_jenis(&transaction)?;
    let mut baru: HashMap<String, Value> = HashMap::new();
    for item in &items {
        let id = item["id_jenis"].as_str().unwrap_or("").trim().to_owned();
        if !ada
            .iter()
            .any(|row| row["id_jenis"].as_str() == Some(id.as_str()))
        {
            return Err(invalid("Jenis tidak ditemukan."));
        }
        baru.insert(id, item.get("bobot").cloned().unwrap_or(Value::Null));
    }
    let daftar: Vec<BobotJenis> = ada
        .iter()
        .map(|row| {
            let id = row["id_jenis"].as_str().unwrap_or("").to_owned();
            BobotJenis {
                bobot: baru
                    .get(&id)
                    .cloned()
                    .unwrap_or_else(|| row["bobot"].clone()),
                is_aktif: row["is_aktif"].as_i64() == Some(1),
                id_jenis: id,
            }
        })
        .collect();
    validate_bobot_nilai(&bobot_kehadiran, &daftar).map_err(invalid)?;
    for (row, item) in ada.iter().zip(&daftar) {
        let bobot = item.bobot.as_i64().unwrap_or(0);
        if row["bobot"].as_i64() == Some(bobot) {
            continue;
        }
        transaction
            .execute(
                "UPDATE nilai_jenis SET bobot = ?, updated_at = datetime('now') WHERE id_jenis = ?;",
                params![bobot, item.id_jenis],
            )
            .map_err(db_error)?;
        let payload = query_json(&transaction, JENIS_SQL, &[&item.id_jenis])?
            .into_iter()
            .next()
            .ok_or_else(CommandError::internal)?;
        sync::enqueue(
            &transaction,
            &client_id,
            "grade-type",
            "save",
            &item.id_jenis,
            &payload,
            None,
        )?;
    }
    let kehadiran = bobot_kehadiran.as_i64().unwrap_or(0).to_string();
    tulis_setting(&transaction, &client_id, KUNCI_BOBOT_KEHADIRAN, &kehadiran)?;
    transaction.commit().map_err(db_error)?;
    Ok(json!({ "sukses": true }))
}

pub fn save_school_days(state: &MobileState, nilai: Value) -> Result<Value, CommandError> {
    let valid = validate_hari_sekolah(&nilai).map_err(invalid)?;
    let teks = valid.to_json().to_string();
    let client_id = sync::ensure_client_id(state)?;
    let mut connection = storage::database(&state.data_dir)?;
    let transaction = connection.transaction().map_err(db_error)?;
    tulis_setting(&transaction, &client_id, KUNCI_HARI_SEKOLAH, &teks)?;
    transaction.commit().map_err(db_error)?;
    Ok(json!({ "sukses": true, "hari_sekolah": valid.to_json() }))
}

/// Rentang tanggal semester untuk satu baris tahun ajaran (keputusan B).
pub fn rentang_untuk(
    connection: &Connection,
    id_tahun_ajaran: &str,
    semester: &str,
) -> Result<(String, String), CommandError> {
    let pilihan = connection
        .query_row(
            "SELECT nama_tahun, semester, tanggal_mulai, tanggal_selesai FROM akademik_tahun_ajaran WHERE id_tahun_ajaran = ?;",
            params![id_tahun_ajaran],
            |row| {
                Ok(BarisTahunAjaran {
                    nama_tahun: row.get(0)?,
                    semester: row.get(1)?,
                    tanggal_mulai: row.get(2)?,
                    tanggal_selesai: row.get(3)?,
                })
            },
        )
        .optional()
        .map_err(db_error)?
        .ok_or_else(|| CommandError::new("NOT_FOUND", "Tahun ajaran tidak ditemukan."))?;
    let saudara: Option<(String, String)> = connection
        .query_row(
            "SELECT tanggal_mulai, tanggal_selesai FROM akademik_tahun_ajaran
             WHERE nama_tahun = ? AND semester = ? AND id_tahun_ajaran <> ?
             ORDER BY tanggal_mulai LIMIT 1;",
            params![pilihan.nama_tahun, semester, id_tahun_ajaran],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(db_error)?;
    rentang_semester(
        &pilihan,
        saudara.as_ref().map(|(a, b)| (a.as_str(), b.as_str())),
        semester,
    )
    .map_err(invalid)
}

#[derive(Debug, Clone, Default)]
pub struct Kehadiran {
    pub hari_efektif: i64,
    pub hadir: i64,
    pub dispensasi: i64,
    pub izin: i64,
    pub sakit: i64,
    pub alfa: i64,
    pub bolos: i64,
    pub catatan_bolos: Vec<(String, Vec<String>)>,
}

impl Kehadiran {
    pub fn persen(&self) -> Option<f64> {
        persen_kehadiran(
            self.hadir + self.dispensasi,
            self.hari_efektif,
            self.izin + self.sakit,
        )
    }
}

/// Siswa aktif (seluruh sekolah atau satu rombel) beserta id unitnya.
/// `master_data.unit` menyimpan NAMA unit, dicocokkan tanpa peduli huruf.
pub fn siswa_berunit(
    connection: &Connection,
    id_rombel: Option<&str>,
) -> Result<Vec<Value>, CommandError> {
    query_json(
        connection,
        "SELECT s.id_siswa, s.nis, s.nisn, s.nama_lengkap, s.id_rombel, r.nama_rombel,
                (SELECT u.id_unit FROM akademik_unit u
                  WHERE LOWER(TRIM(u.nama_unit)) = LOWER(TRIM(m.unit))
                  ORDER BY u.id_unit LIMIT 1) AS id_unit
         FROM siswa_data s
         JOIN akademik_rombel r ON r.id_rombel = s.id_rombel
         LEFT JOIN master_data m ON m.id_unik = s.id_siswa
         WHERE s.status = 'Aktif' AND (?1 IS NULL OR s.id_rombel = ?1)
         ORDER BY s.nama_lengkap ASC, s.id_siswa
         LIMIT 3000;",
        &[&id_rombel],
    )
}

/// Hari dalam rentang: `(tanggal, hari 1-7, libur)`. Dihasilkan SQLite
/// supaya Rust dan TS memakai kalender yang sama tanpa pustaka tanggal.
pub fn hari_dalam_rentang(
    connection: &Connection,
    mulai: &str,
    selesai: &str,
) -> Result<Vec<(String, i64, bool)>, CommandError> {
    Ok(query_json(
        connection,
        "WITH RECURSIVE hari(t) AS (
            SELECT ?1
            UNION ALL
            SELECT date(t, '+1 day') FROM hari WHERE t < ?2 AND t < date(?1, '+400 days')
         )
         SELECT h.t AS tanggal, CAST(strftime('%w', h.t) AS INTEGER) AS w,
                EXISTS(SELECT 1 FROM tbl_hari_libur l WHERE l.tanggal = h.t AND l.status_aktif = 1) AS libur
         FROM hari h;",
        &[&mulai, &selesai],
    )?
    .into_iter()
    .filter_map(|row| {
        let w = row["w"].as_i64()?;
        Some((
            row["tanggal"].as_str()?.to_owned(),
            if w == 0 { 7 } else { w },
            row["libur"].as_i64() == Some(1),
        ))
    })
    .collect())
}

/// Kehadiran per siswa dalam rentang (PRD 4.3), dipakai rekap nilai akhir
/// dan leger kehadiran sehingga keduanya tidak pernah berbeda.
pub fn kehadiran_siswa(
    connection: &Connection,
    mulai: &str,
    selesai: &str,
    id_rombel: Option<&str>,
    siswa: &[Value],
) -> Result<HashMap<String, Kehadiran>, CommandError> {
    let hari = hari_dalam_rentang(connection, mulai, selesai)?;
    let konfigurasi = parse_hari_sekolah(setting(connection, KUNCI_HARI_SEKOLAH)?.as_deref());
    let mut gerbang: HashMap<(String, String), (i64, String)> = HashMap::new();
    for row in query_json(
        connection,
        "SELECT a.id_karyawan, a.tanggal,
                MAX(CASE WHEN COALESCE(TRIM(a.jam_masuk), '') <> ''
                          AND COALESCE(a.status_kehadiran, '') <> 'Alfa'
                         THEN 1 ELSE 0 END) AS hadir_gerbang,
                MAX(COALESCE(a.status_kehadiran, '')) AS status
         FROM absensi_harian a
         JOIN siswa_data s ON s.id_siswa = a.id_karyawan
         WHERE a.tanggal >= ?1 AND a.tanggal <= ?2 AND (?3 IS NULL OR s.id_rombel = ?3)
         GROUP BY a.id_karyawan, a.tanggal
         LIMIT 250000;",
        &[&mulai, &selesai, &id_rombel],
    )? {
        gerbang.insert(
            (
                row["id_karyawan"].as_str().unwrap_or("").to_owned(),
                row["tanggal"].as_str().unwrap_or("").to_owned(),
            ),
            (
                row["hadir_gerbang"].as_i64().unwrap_or(0),
                row["status"].as_str().unwrap_or("").to_owned(),
            ),
        );
    }
    // Alfa di presensi mapel; digabung dengan scan gerbang inilah predikat
    // `BOLOS_DI_SEKOLAH` di `class_attendance.rs`.
    let mut alfa: HashMap<(String, String), Vec<String>> = HashMap::new();
    for row in query_json(
        connection,
        "SELECT d.id_siswa, p.tanggal, COALESCE(m.nama_mapel, p.id_mapel) AS mapel
         FROM presensi_mapel_detail d
         JOIN presensi_mapel p ON p.id_presensi_mapel = d.id_presensi_mapel
         JOIN siswa_data s ON s.id_siswa = d.id_siswa
         LEFT JOIN akademik_mapel m ON m.id_mapel = p.id_mapel
         WHERE d.status = 'Alfa' AND p.tanggal >= ?1 AND p.tanggal <= ?2
           AND (?3 IS NULL OR s.id_rombel = ?3)
         ORDER BY p.tanggal, CAST(p.jam_ke AS INTEGER), p.jam_ke, d.id_detail
         LIMIT 50000;",
        &[&mulai, &selesai, &id_rombel],
    )? {
        let daftar = alfa
            .entry((
                row["id_siswa"].as_str().unwrap_or("").to_owned(),
                row["tanggal"].as_str().unwrap_or("").to_owned(),
            ))
            .or_default();
        let mapel = row["mapel"].as_str().unwrap_or("").to_owned();
        if !daftar.contains(&mapel) {
            daftar.push(mapel);
        }
    }
    let mut hasil = HashMap::new();
    for item in siswa {
        let id = item["id_siswa"].as_str().unwrap_or("").to_owned();
        let sekolah = hari_sekolah_untuk(&konfigurasi, item["id_unit"].as_str());
        let mut k = Kehadiran::default();
        for (tanggal, w, libur) in &hari {
            if *libur || !sekolah.contains(w) {
                continue;
            }
            k.hari_efektif += 1;
            let kunci = (id.clone(), tanggal.clone());
            let (hadir_gerbang, status) = gerbang
                .get(&kunci)
                .map(|(h, s)| (*h, s.as_str()))
                .unwrap_or((0, ""));
            let mapel_alfa = alfa.get(&kunci);
            match klasifikasi_hari(
                hadir_di_gerbang(hadir_gerbang, status),
                mapel_alfa.is_some(),
                status,
            ) {
                "Hadir" => k.hadir += 1,
                "Dispensasi" => k.dispensasi += 1,
                "Izin" => k.izin += 1,
                "Sakit" => k.sakit += 1,
                "Bolos" => {
                    k.bolos += 1;
                    k.catatan_bolos
                        .push((tanggal.clone(), mapel_alfa.cloned().unwrap_or_default()));
                }
                _ => k.alfa += 1,
            }
        }
        hasil.insert(id, k);
    }
    Ok(hasil)
}

/// Hari efektif dengan Hari Sekolah bawaan (siswa tanpa unit).
pub fn hari_efektif_bawaan(
    connection: &Connection,
    mulai: &str,
    selesai: &str,
) -> Result<i64, CommandError> {
    let konfigurasi = parse_hari_sekolah(setting(connection, KUNCI_HARI_SEKOLAH)?.as_deref());
    Ok(hari_dalam_rentang(connection, mulai, selesai)?
        .iter()
        .filter(|(_, w, libur)| !libur && konfigurasi.bawaan.contains(w))
        .count() as i64)
}

fn dua_desimal(nilai: Option<f64>) -> Value {
    json!(nilai.map(|n| (n * 100.0 + 0.5).floor() / 100.0))
}

/// Rekap nilai akhir satu rombel × mapel × semester (PRD 4.4/4.5). Dihitung
/// saat diminta, tanpa pembekuan (keputusan H).
pub fn recap(
    state: &MobileState,
    id_tahun_ajaran: &str,
    semester: &str,
    id_rombel: &str,
    id_mapel: &str,
) -> Result<Value, CommandError> {
    if semester != "Ganjil" && semester != "Genap" {
        return Err(invalid(format!(
            "Semester '{semester}' tidak dikenal. Gunakan Ganjil atau Genap."
        )));
    }
    if id_rombel.trim().is_empty() || id_mapel.trim().is_empty() {
        return Err(invalid("Rombel dan mata pelajaran wajib dipilih."));
    }
    let connection = storage::database(&state.data_dir)?;
    let kehadiran_bobot = bobot_kehadiran(&connection)?;
    let jenis: Vec<Value> = semua_jenis(&connection)?
        .into_iter()
        .filter(|row| row["is_aktif"].as_i64() == Some(1))
        .collect();
    let total: i64 = kehadiran_bobot
        + jenis
            .iter()
            .map(|row| row["bobot"].as_i64().unwrap_or(0))
            .sum::<i64>();
    if total != 100 {
        return Err(invalid(
            "Total bobot penilaian dan kehadiran belum 100%. Atur di tab Pengaturan Nilai.",
        ));
    }
    let (mulai, selesai) = rentang_untuk(&connection, id_tahun_ajaran, semester)?;
    let nama_mapel: String = connection
        .query_row(
            "SELECT nama_mapel FROM akademik_mapel WHERE id_mapel = ?;",
            params![id_mapel],
            |row| row.get(0),
        )
        .optional()
        .map_err(db_error)?
        .unwrap_or_else(|| id_mapel.to_owned());
    let penilaian = query_json(
        &connection,
        &format!(
            "SELECT p.id_penilaian, {JENIS_EFEKTIF_SQL} AS id_jenis, p.bobot, p.nilai_maks
             FROM nilai_penilaian p
             WHERE p.id_tahun_ajaran = ?1 AND p.semester = ?2 AND p.id_rombel = ?3 AND p.id_mapel = ?4
             ORDER BY p.tanggal, p.id_penilaian
             LIMIT 500;"
        ),
        &[&id_tahun_ajaran, &semester, &id_rombel, &id_mapel],
    )?;
    let mut skor: HashMap<(String, String), Option<f64>> = HashMap::new();
    for row in query_json(
        &connection,
        "SELECT n.id_penilaian, n.id_siswa, n.skor
         FROM nilai_siswa n
         JOIN nilai_penilaian p ON p.id_penilaian = n.id_penilaian
         WHERE p.id_tahun_ajaran = ?1 AND p.semester = ?2 AND p.id_rombel = ?3 AND p.id_mapel = ?4
         LIMIT 100000;",
        &[&id_tahun_ajaran, &semester, &id_rombel, &id_mapel],
    )? {
        skor.insert(
            (
                row["id_penilaian"].as_str().unwrap_or("").to_owned(),
                row["id_siswa"].as_str().unwrap_or("").to_owned(),
            ),
            row["skor"].as_f64(),
        );
    }
    let siswa = siswa_berunit(&connection, Some(id_rombel))?;
    let kehadiran = kehadiran_siswa(&connection, &mulai, &selesai, Some(id_rombel), &siswa)?;

    let jumlah_penilaian = |id: &str| {
        penilaian
            .iter()
            .filter(|p| p["id_jenis"].as_str() == Some(id))
            .count()
    };
    let catatan: Vec<String> = jenis
        .iter()
        .filter(|row| {
            row["bobot"].as_i64().unwrap_or(0) > 0
                && jumlah_penilaian(row["id_jenis"].as_str().unwrap_or("")) == 0
        })
        .map(|row| {
            format!(
                "{nama_mapel}: belum ada penilaian {}",
                row["nama"].as_str().unwrap_or("")
            )
        })
        .collect();

    let mut nilai_kosong = 0usize;
    let mut baris = Vec::new();
    for item in &siswa {
        let id_siswa = item["id_siswa"].as_str().unwrap_or("").to_owned();
        let mut kosong = 0usize;
        let mut komponen: Vec<(f64, Option<f64>)> = Vec::new();
        let mut rata_per_jenis = Vec::new();
        for row in &jenis {
            let id_jenis = row["id_jenis"].as_str().unwrap_or("");
            let items: Vec<SkorPenilaian> = penilaian
                .iter()
                .filter(|p| p["id_jenis"].as_str() == Some(id_jenis))
                .map(|p| {
                    let nilai = skor
                        .get(&(
                            p["id_penilaian"].as_str().unwrap_or("").to_owned(),
                            id_siswa.clone(),
                        ))
                        .copied()
                        .flatten();
                    if nilai.is_none() {
                        kosong += 1;
                    }
                    SkorPenilaian {
                        skor: nilai,
                        nilai_maks: p["nilai_maks"].as_f64().unwrap_or(100.0).max(1.0),
                        bobot: p["bobot"].as_f64().unwrap_or(1.0).max(1.0),
                    }
                })
                .collect();
            let rata = rata_jenis(&items);
            rata_per_jenis.push((id_jenis.to_owned(), rata));
            komponen.push((row["bobot"].as_f64().unwrap_or(0.0), rata));
        }
        let k = kehadiran.get(&id_siswa).cloned().unwrap_or_default();
        let persen = k.persen();
        komponen.push((kehadiran_bobot as f64, persen));
        let (nilai_akhir, efektif) = hitung_nilai_akhir(&komponen);
        nilai_kosong += kosong;
        let komponen_json: Vec<Value> = rata_per_jenis
            .iter()
            .zip(&efektif)
            .map(|((id_jenis, rata), bobot)| {
                json!({
                    "id_jenis": id_jenis,
                    "rata": dua_desimal(*rata),
                    "bobot_efektif": dua_desimal(*bobot),
                    "nilai_berbobot": dua_desimal(rata.zip(*bobot).map(|(r, b)| r * b / 100.0)),
                })
            })
            .collect();
        let bobot_hadir = *efektif.last().unwrap_or(&None);
        baris.push(json!({
            "id_siswa": id_siswa,
            "nama_lengkap": item["nama_lengkap"],
            "nis": item["nis"].as_str().unwrap_or(""),
            "komponen": komponen_json,
            "kehadiran": {
                "hari_efektif": k.hari_efektif,
                "masuk": k.hadir + k.dispensasi,
                "izin_sakit": k.izin + k.sakit,
                "tidak_masuk": k.alfa + k.bolos,
                "persen": dua_desimal(persen),
                "bobot_efektif": dua_desimal(bobot_hadir),
                "nilai_berbobot": dua_desimal(persen.zip(bobot_hadir).map(|(p, b)| p * b / 100.0)),
                "bolos": k.catatan_bolos.iter().map(|(tanggal, mapel)| json!({ "tanggal": tanggal, "mapel": mapel })).collect::<Vec<_>>(),
            },
            "nilai_akhir": nilai_akhir,
            "kosong": kosong,
        }));
    }
    let dicetak: String = connection
        .query_row("SELECT datetime('now', '+7 hours');", [], |row| row.get(0))
        .map_err(db_error)?;
    Ok(json!({
        "nama_mapel": nama_mapel,
        "rentang": { "mulai": mulai, "selesai": selesai },
        "bobot_kehadiran": kehadiran_bobot,
        "jenis": jenis.iter().map(|row| json!({
            "id_jenis": row["id_jenis"],
            "nama": row["nama"],
            "bobot": row["bobot"],
            "jumlah_penilaian": jumlah_penilaian(row["id_jenis"].as_str().unwrap_or("")),
        })).collect::<Vec<_>>(),
        "catatan": catatan,
        "nilai_kosong": nilai_kosong,
        "siswa": baris,
        "dicetak": dicetak,
    }))
}

// ── Ekspor e-Rapor (Fase N3) ────────────────────────────────────────────────

/// Bahan ekspor e-Rapor satu rombel × semester untuk SEMUA mapel yang punya
/// penilaian. Rata per jenis dan nilai akhir diambil dari `recap` (rumus N2,
/// keputusan E1), sehingga angka di berkas sama dengan layar Rekap Nilai;
/// baris berkasnya sendiri disusun di klien (`validations/erapor.ts`).
/// Cermin `erapor` di `services/nilai-akhir.ts`.
pub fn erapor(
    state: &MobileState,
    id_tahun_ajaran: &str,
    semester: &str,
    id_rombel: &str,
) -> Result<Value, CommandError> {
    if semester != "Ganjil" && semester != "Genap" {
        return Err(invalid(format!(
            "Semester '{semester}' tidak dikenal. Gunakan Ganjil atau Genap."
        )));
    }
    if id_rombel.trim().is_empty() {
        return Err(invalid("Rombel wajib dipilih."));
    }
    let connection = storage::database(&state.data_dir)?;
    let tahun_ajaran: String = connection
        .query_row(
            "SELECT nama_tahun FROM akademik_tahun_ajaran WHERE id_tahun_ajaran = ?;",
            params![id_tahun_ajaran],
            |row| row.get(0),
        )
        .optional()
        .map_err(db_error)?
        .unwrap_or_else(|| id_tahun_ajaran.to_owned());
    let (nama_rombel, tingkat): (String, i64) = connection
        .query_row(
            "SELECT nama_rombel, tingkat FROM akademik_rombel WHERE id_rombel = ?;",
            params![id_rombel],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(db_error)?
        .ok_or_else(|| invalid("Rombel tidak ditemukan."))?;
    let mapel = query_json(
        &connection,
        "SELECT m.id_mapel, COALESCE(m.kode_mapel, '') AS kode_mapel,
                COALESCE(m.nama_mapel, p.id_mapel) AS nama_mapel
         FROM (SELECT DISTINCT id_mapel FROM nilai_penilaian
               WHERE id_tahun_ajaran = ?1 AND semester = ?2 AND id_rombel = ?3) p
         LEFT JOIN akademik_mapel m ON m.id_mapel = p.id_mapel
         ORDER BY COALESCE(m.kode_mapel, ''), COALESCE(m.nama_mapel, p.id_mapel), p.id_mapel
         LIMIT 100;",
        &[&id_tahun_ajaran, &semester, &id_rombel],
    )?;
    let mut daftar = Vec::with_capacity(mapel.len());
    for item in mapel {
        let id_mapel = item["id_mapel"].as_str().unwrap_or("").to_owned();
        let args: [&dyn rusqlite::ToSql; 4] = [&id_tahun_ajaran, &semester, &id_rombel, &id_mapel];
        // Guru pengampu: nama + gelar, semua guru yang memberi penilaian.
        let guru: Vec<String> = query_json(
            &connection,
            "SELECT DISTINCT TRIM(COALESCE(m.nama, p.id_guru)
                    || CASE WHEN TRIM(COALESCE(g.gelar, '')) <> '' THEN ', ' || TRIM(g.gelar) ELSE '' END) AS nama
             FROM nilai_penilaian p
             LEFT JOIN master_data m ON m.id_unik = p.id_guru
             LEFT JOIN guru_data g ON g.id_guru = p.id_guru
             WHERE p.id_tahun_ajaran = ?1 AND p.semester = ?2 AND p.id_rombel = ?3 AND p.id_mapel = ?4
             ORDER BY 1
             LIMIT 10;",
            &args,
        )?
        .into_iter()
        .filter_map(|row| row["nama"].as_str().map(str::to_owned))
        .collect();
        let penilaian = query_json(
            &connection,
            &format!(
                "SELECT p.id_penilaian, {JENIS_EFEKTIF_SQL} AS id_jenis, p.nama_penilaian, p.tanggal,
                        p.nilai_maks, p.kkm
                 FROM nilai_penilaian p
                 WHERE p.id_tahun_ajaran = ?1 AND p.semester = ?2 AND p.id_rombel = ?3 AND p.id_mapel = ?4
                 ORDER BY p.tanggal, p.id_penilaian
                 LIMIT 500;"
            ),
            &args,
        )?;
        let skor = query_json(
            &connection,
            "SELECT n.id_penilaian, n.id_siswa, n.skor
             FROM nilai_siswa n
             JOIN nilai_penilaian p ON p.id_penilaian = n.id_penilaian
             WHERE p.id_tahun_ajaran = ?1 AND p.semester = ?2 AND p.id_rombel = ?3 AND p.id_mapel = ?4
               AND n.skor IS NOT NULL
             LIMIT 100000;",
            &args,
        )?;
        let rekap = recap(state, id_tahun_ajaran, semester, id_rombel, &id_mapel)?;
        let ringkas: Vec<Value> = rekap["siswa"]
            .as_array()
            .map(|baris| {
                baris
                    .iter()
                    .map(|b| {
                        let rata: serde_json::Map<String, Value> = b["komponen"]
                            .as_array()
                            .map(|komponen| {
                                komponen
                                    .iter()
                                    .map(|k| (k["id_jenis"].as_str().unwrap_or("").to_owned(), k["rata"].clone()))
                                    .collect()
                            })
                            .unwrap_or_default();
                        json!({ "id_siswa": b["id_siswa"], "nilai_akhir": b["nilai_akhir"], "rata": rata })
                    })
                    .collect()
            })
            .unwrap_or_default();
        daftar.push(json!({
            "id_mapel": id_mapel,
            "kode_mapel": item["kode_mapel"],
            "nama_mapel": item["nama_mapel"],
            "guru": guru.join("; "),
            "penilaian": penilaian,
            "skor": skor,
            "rekap": ringkas,
        }));
    }
    let siswa: Vec<Value> = siswa_berunit(&connection, Some(id_rombel))?
        .into_iter()
        .map(|s| {
            json!({
                "id_siswa": s["id_siswa"],
                "nama": s["nama_lengkap"],
                "nis": s["nis"].as_str().unwrap_or(""),
                "nisn": s["nisn"].as_str().unwrap_or(""),
            })
        })
        .collect();
    let jenis: Vec<Value> = semua_jenis(&connection)?
        .into_iter()
        .map(|row| json!({ "id_jenis": row["id_jenis"], "nama": row["nama"], "is_aktif": row["is_aktif"] }))
        .collect();
    let dicetak: String = connection
        .query_row("SELECT datetime('now', '+7 hours');", [], |row| row.get(0))
        .map_err(db_error)?;
    Ok(json!({
        "tahun_ajaran": tahun_ajaran,
        "semester": semester,
        "rombel": nama_rombel,
        "tingkat": tingkat,
        "dicetak": dicetak,
        "jenis": jenis,
        "siswa": siswa,
        "mapel": daftar,
    }))
}

// ── Penerapan event di cloud ────────────────────────────────────────────────

pub const CLOUD_UPSERT_GRADE_TYPE_SQL: &str = "INSERT INTO nilai_jenis (
        id_jenis, nama, bobot, urutan, is_aktif, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, COALESCE(?, datetime('now')), COALESCE(?, datetime('now')))
    ON CONFLICT(id_jenis) DO UPDATE SET
        nama = excluded.nama,
        bobot = excluded.bobot,
        urutan = excluded.urutan,
        is_aktif = excluded.is_aktif,
        updated_at = excluded.updated_at;";

fn payload_text(row: &Value, key: &str) -> Option<String> {
    row.get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(str::to_owned)
}

pub fn cloud_grade_type_values(row: &Value, entity_key: &str) -> Option<Vec<Value>> {
    let id = payload_text(row, "id_jenis").unwrap_or_else(|| entity_key.trim().to_owned());
    let bobot = row
        .get("bobot")
        .and_then(Value::as_i64)
        .filter(|b| (0..=100).contains(b))?;
    if id.is_empty() {
        return None;
    }
    Some(vec![
        json!(id),
        json!(payload_text(row, "nama")?),
        json!(bobot),
        json!(row.get("urutan").and_then(Value::as_i64).unwrap_or(0)),
        json!(if row.get("is_aktif").and_then(Value::as_i64) == Some(0) {
            0
        } else {
            1
        }),
        json!(payload_text(row, "created_at")),
        json!(payload_text(row, "updated_at")),
    ])
}

#[cfg(test)]
mod tests {
    use super::*;

    // Vektor kembar `src/lib/validations/nilai-akhir.test.ts`.

    #[test]
    fn jenis_dan_bobot() {
        assert_eq!(
            id_jenis_efektif(None, "Ulangan Harian").as_deref(),
            Some("jns-uh")
        );
        assert_eq!(
            id_jenis_efektif(Some(" "), "UAS").as_deref(),
            Some("jns-uas")
        );
        assert_eq!(
            id_jenis_efektif(Some("jns-abc"), "Tugas").as_deref(),
            Some("jns-abc")
        );
        assert_eq!(id_jenis_efektif(None, "Kuis"), None);
        assert_eq!(jenis_warisan("jns-uts"), "UTS");
        assert_eq!(jenis_warisan("jns-abc"), "Tugas");

        let draft = |v: Value| -> JenisNilaiDraft { serde_json::from_value(v).expect("draft") };
        assert_eq!(
            validate_jenis_nilai(&draft(json!({ "nama": " Proyek ", "urutan": 6 }))),
            Ok(JenisNilaiValid {
                nama: "Proyek".into(),
                urutan: 6,
                is_aktif: true
            })
        );
        let galat = |v: Value| validate_jenis_nilai(&draft(v)).err();
        assert_eq!(
            galat(json!({ "nama": " " })).as_deref(),
            Some("Nama jenis wajib diisi.")
        );
        assert_eq!(
            galat(json!({ "nama": "a".repeat(41) })).as_deref(),
            Some("Nama jenis maksimal 40 karakter.")
        );
        assert_eq!(
            galat(json!({ "nama": "X", "urutan": 1000 })).as_deref(),
            Some("Urutan harus bilangan 0 sampai 999.")
        );

        let j = |bobot: Value, is_aktif: bool| BobotJenis {
            id_jenis: "j".into(),
            bobot,
            is_aktif,
        };
        assert_eq!(
            validate_bobot_nilai(
                &json!(10),
                &[j(json!(30), true), j(json!(60), true), j(json!(0), false)]
            ),
            Ok(100)
        );
        assert_eq!(
            validate_bobot_nilai(&json!(10), &[j(json!(30), true), j(json!(50), true)]),
            Err("Total bobot harus 100%, sekarang 90%.".into())
        );
        assert_eq!(
            validate_bobot_nilai(&json!(0), &[j(json!(90), true), j(json!(10), false)]),
            Err("Jenis nonaktif tidak boleh berbobot.".into())
        );
        assert_eq!(
            validate_bobot_nilai(&json!(0), &[j(json!(100.5), true)]),
            Err("Bobot harus bilangan bulat 0 sampai 100.".into())
        );
        assert_eq!(
            validate_bobot_nilai(&json!(-1), &[j(json!(101), true)]),
            Err("Bobot harus bilangan bulat 0 sampai 100.".into())
        );
    }

    #[test]
    fn hari_sekolah() {
        assert_eq!(validate_daftar_hari(&json!([5, 1, 3])), Ok(vec![1, 3, 5]));
        assert_eq!(
            validate_daftar_hari(&json!([])),
            Err("Pilih minimal satu hari sekolah.".into())
        );
        assert_eq!(
            validate_daftar_hari(&json!([0, 1])),
            Err("Hari sekolah harus angka 1 (Senin) sampai 7 (Minggu).".into())
        );
        assert_eq!(
            validate_daftar_hari(&json!([1, 1])),
            Err("Hari sekolah tidak boleh ganda.".into())
        );
        assert_eq!(
            validate_hari_sekolah(&json!({ "bawaan": [1, 2, 3, 4, 5], "unit": { "u1": [6, 1] } })),
            Ok(HariSekolah {
                bawaan: vec![1, 2, 3, 4, 5],
                unit: vec![("u1".into(), vec![1, 6])]
            })
        );
        assert_eq!(
            validate_hari_sekolah(&json!({ "bawaan": [1], "lain": 1 })),
            Err("Data hari sekolah tidak valid.".into())
        );
        assert_eq!(
            validate_hari_sekolah(&json!({ "bawaan": [1], "unit": { "u1": [] } })),
            Err("Pilih minimal satu hari sekolah.".into())
        );
        assert_eq!(parse_hari_sekolah(None).bawaan, vec![1, 2, 3, 4, 5]);
        assert_eq!(
            parse_hari_sekolah(Some("bukan json")).bawaan,
            vec![1, 2, 3, 4, 5]
        );
        let cfg = parse_hari_sekolah(Some(
            r#"{"bawaan":[1,2,3,4,5],"unit":{"u1":[1,2,3,4,5,6]}}"#,
        ));
        assert_eq!(hari_sekolah_untuk(&cfg, Some("u1")), [1, 2, 3, 4, 5, 6]);
        assert_eq!(hari_sekolah_untuk(&cfg, Some("u2")), [1, 2, 3, 4, 5]);
        assert_eq!(hari_sekolah_untuk(&cfg, None), [1, 2, 3, 4, 5]);
    }

    #[test]
    fn rentang_semester_tiga_jalan() {
        let ganjil = BarisTahunAjaran {
            nama_tahun: "2026/2027".into(),
            semester: "Ganjil".into(),
            tanggal_mulai: "2026-07-13".into(),
            tanggal_selesai: "2027-06-20".into(),
        };
        assert_eq!(
            rentang_semester(&ganjil, None, "Ganjil"),
            Ok(("2026-07-13".into(), "2027-06-20".into()))
        );
        assert_eq!(
            rentang_semester(&ganjil, Some(("2027-01-04", "2027-06-19")), "Genap"),
            Ok(("2027-01-04".into(), "2027-06-19".into()))
        );
        assert_eq!(
            rentang_semester(&ganjil, None, "Genap"),
            Ok(("2027-01-01".into(), "2027-06-20".into()))
        );
        let genap = BarisTahunAjaran {
            semester: "Genap".into(),
            tanggal_mulai: "2027-01-04".into(),
            tanggal_selesai: "2027-06-30".into(),
            ..ganjil.clone()
        };
        assert_eq!(
            rentang_semester(&genap, None, "Ganjil"),
            Err("Rentang tanggal semester Ganjil tidak bisa ditentukan. Buat baris tahun ajaran untuk semester Ganjil.".into())
        );
    }

    #[test]
    fn kehadiran_dan_nilai() {
        assert!(hadir_di_gerbang(1, ""));
        assert!(hadir_di_gerbang(0, "Terlambat"));
        assert!(!hadir_di_gerbang(0, "Izin"));
        assert_eq!(klasifikasi_hari(true, false, "Hadir"), "Hadir");
        assert_eq!(klasifikasi_hari(true, true, "Hadir"), "Bolos");
        assert_eq!(klasifikasi_hari(true, false, "Izin"), "Hadir");
        assert_eq!(klasifikasi_hari(false, false, "Dispensasi"), "Dispensasi");
        assert_eq!(klasifikasi_hari(false, false, "Sakit"), "Sakit");
        assert_eq!(klasifikasi_hari(false, true, "Izin"), "Izin");
        assert_eq!(klasifikasi_hari(false, false, ""), "Alfa");
        assert_eq!(persen_kehadiran(18, 22, 2), Some(90.0));
        assert_eq!(persen_kehadiran(0, 5, 5), None);

        let s = |skor: Option<f64>, nilai_maks: f64, bobot: f64| SkorPenilaian {
            skor,
            nilai_maks,
            bobot,
        };
        assert_eq!(
            rata_jenis(&[
                s(Some(80.0), 100.0, 1.0),
                s(None, 100.0, 1.0),
                s(Some(45.0), 50.0, 2.0)
            ]),
            Some(65.0)
        );
        assert_eq!(rata_jenis(&[]), None);
        assert_eq!(
            hitung_nilai_akhir(&[
                (30.0, Some(65.0)),
                (20.0, None),
                (40.0, Some(90.0)),
                (10.0, Some(80.0))
            ]),
            (Some(79), vec![Some(37.5), None, Some(50.0), Some(12.5)])
        );
        assert_eq!(
            hitung_nilai_akhir(&[(50.0, Some(75.0)), (50.0, Some(80.0))]).0,
            Some(78)
        );
        assert_eq!(hitung_nilai_akhir(&[(0.0, Some(50.0))]).0, None);
        assert_eq!(hitung_nilai_akhir(&[(60.0, None)]).1, vec![None]);
        assert_eq!(bulat_akhir(77.49999999999), 78);
        assert_eq!(bulat_akhir(77.4), 77);
    }

    // ── I/O terhadap skema asli `storage::initialize` ──

    fn state_uji() -> (tempfile::TempDir, MobileState) {
        let dir = tempfile::tempdir().expect("tempdir");
        storage::initialize(dir.path()).expect("skema lokal");
        let state = MobileState {
            server_origin: std::sync::RwLock::new("http://localhost:3000".to_string()),
            offline_max_age_hours: 24,
            data_dir: dir.path().to_path_buf(),
            http: reqwest::Client::new(),
            turso_config: std::sync::RwLock::new(None),
            session: std::sync::Mutex::new(None),
            vault_lock: std::sync::Mutex::new(()),
        };
        (dir, state)
    }

    /// Skenario kembar `services/nilai-akhir.test.ts`. SQL seed-nya sama persis.
    pub(crate) const SEED_SKENARIO: &str = "
        INSERT INTO akademik_tahun_ajaran (id_tahun_ajaran, nama_tahun, semester, tanggal_mulai, tanggal_selesai, is_aktif, created_at, updated_at)
          VALUES ('ta1', '2026/2027', 'Ganjil', '2026-07-13', '2026-07-19', 1, 'x', 'x');
        INSERT INTO tbl_hari_libur (tanggal, nama_libur, status_aktif) VALUES ('2026-07-15', 'Libur uji', 1);
        INSERT INTO akademik_unit (id_unit, nama_unit, created_at, updated_at) VALUES ('u1', 'SMP', 'x', 'x');
        INSERT INTO akademik_rombel (id_rombel, id_tahun_ajaran, tingkat, nama_rombel) VALUES ('r7', 'ta1', 7, 'VII A');
        INSERT INTO akademik_mapel (id_mapel, kode_mapel, nama_mapel) VALUES ('mtk', 'MTK', 'Matematika'), ('ipa', 'IPA', 'IPA');
        INSERT INTO master_data (id_unik, kode_karyawan, nama, divisi, id_shift, jenis_personil, status_aktif, unit) VALUES
          ('S1', 'S1', 'Ani', 'Siswa', 1, 'Siswa', 'Aktif', 'smp '),
          ('S2', 'S2', 'Budi', 'Siswa', 1, 'Siswa', 'Aktif', NULL);
        INSERT INTO siswa_data (id_siswa, nama_lengkap, id_rombel, angkatan, status, created_at, updated_at) VALUES
          ('S1', 'Ani', 'r7', 2026, 'Aktif', 'x', 'x'),
          ('S2', 'Budi', 'r7', 2026, 'Aktif', 'x', 'x');
        INSERT INTO absensi_harian (tanggal, id_karyawan, nama, kelas_divisi, jam_masuk, status_kehadiran, status_absen, sumber, update_terakhir, id_shift, bulan, tahun, id_sesi) VALUES
          ('2026-07-13', 'S1', 'Ani', 'VII A', '07:00', 'Hadir', 'Masuk', 'Scanner', 'x', 1, '07', 2026, 's1-13'),
          ('2026-07-14', 'S1', 'Ani', 'VII A', '07:00', 'Hadir', 'Masuk', 'Scanner', 'x', 1, '07', 2026, 's1-14'),
          ('2026-07-16', 'S1', 'Ani', 'VII A', NULL, 'Sakit', 'Masuk', 'Koreksi Admin', 'x', 1, '07', 2026, 's1-16'),
          ('2026-07-17', 'S1', 'Ani', 'VII A', NULL, 'Dispensasi', 'Masuk', 'Koreksi Admin', 'x', 1, '07', 2026, 's1-17'),
          ('2026-07-13', 'S2', 'Budi', 'VII A', '07:00', 'Hadir', 'Masuk', 'Scanner', 'x', 1, '07', 2026, 's2-13'),
          ('2026-07-14', 'S2', 'Budi', 'VII A', '07:00', 'Hadir', 'Masuk', 'Scanner', 'x', 1, '07', 2026, 's2-14'),
          ('2026-07-16', 'S2', 'Budi', 'VII A', '07:00', 'Hadir', 'Masuk', 'Scanner', 'x', 1, '07', 2026, 's2-16'),
          ('2026-07-17', 'S2', 'Budi', 'VII A', '07:00', 'Hadir', 'Masuk', 'Scanner', 'x', 1, '07', 2026, 's2-17'),
          ('2026-07-18', 'S2', 'Budi', 'VII A', '07:00', 'Hadir', 'Masuk', 'Scanner', 'x', 1, '07', 2026, 's2-18');
        INSERT INTO presensi_mapel (id_presensi_mapel, id_tahun_ajaran, id_rombel, id_mapel, id_guru, tanggal, jam_ke, created_at, updated_at)
          VALUES ('pm1', 'ta1', 'r7', 'ipa', 'g', '2026-07-14', '3', 'x', 'x');
        INSERT INTO presensi_mapel_detail (id_detail, id_presensi_mapel, id_siswa, status, created_at, updated_at) VALUES
          ('d1', 'pm1', 'S1', 'Alfa', 'x', 'x'),
          ('d2', 'pm1', 'S2', 'Hadir', 'x', 'x');
        INSERT INTO nilai_penilaian (id_penilaian, id_tahun_ajaran, semester, id_rombel, id_mapel, id_guru, jenis, id_jenis, nama_penilaian, tanggal, bobot, nilai_maks, created_at, updated_at) VALUES
          ('p1', 'ta1', 'Ganjil', 'r7', 'mtk', 'g', 'Tugas', NULL, 'Tugas 1', '2026-07-13', 1, 100, 'x', 'x'),
          ('p2', 'ta1', 'Ganjil', 'r7', 'mtk', 'g', 'Tugas', 'jns-tugas', 'Tugas 2', '2026-07-14', 2, 50, 'x', 'x'),
          ('p3', 'ta1', 'Ganjil', 'r7', 'mtk', 'g', 'UTS', NULL, 'UTS', '2026-07-16', 1, 100, 'x', 'x');
        INSERT INTO nilai_siswa (id_nilai, id_penilaian, id_siswa, skor, created_at, updated_at) VALUES
          ('n1', 'p1', 'S1', 80, 'x', 'x'),
          ('n2', 'p2', 'S1', 40, 'x', 'x'),
          ('n3', 'p3', 'S1', 70, 'x', 'x'),
          ('n4', 'p2', 'S2', 50, 'x', 'x'),
          ('n5', 'p3', 'S2', 90, 'x', 'x');
    ";

    #[test]
    fn pengaturan_dan_rekap_nilai_akhir() {
        let (_dir, state) = state_uji();
        let connection = storage::database(&state.data_dir).expect("db");
        connection.execute_batch(SEED_SKENARIO).expect("seed");

        let awal = config(&state).expect("config");
        assert_eq!(awal["jenis"].as_array().expect("jenis").len(), 5);
        assert_eq!(awal["total_bobot"], json!(0));
        let tugas = awal["jenis"]
            .as_array()
            .expect("jenis")
            .iter()
            .find(|j| j["id_jenis"] == "jns-tugas")
            .cloned()
            .expect("tugas");
        assert_eq!(tugas["dipakai"], json!(2));
        assert_eq!(
            recap(&state, "ta1", "Ganjil", "r7", "mtk")
                .expect_err("bobot belum 100")
                .message,
            "Total bobot penilaian dan kehadiran belum 100%. Atur di tab Pengaturan Nilai."
        );

        assert_eq!(
            save_weights(
                &state,
                json!(20),
                vec![json!({ "id_jenis": "jns-tugas", "bobot": 30 })]
            )
            .expect_err("total 50")
            .message,
            "Total bobot harus 100%, sekarang 50%."
        );
        save_weights(
            &state,
            json!(20),
            vec![
                json!({ "id_jenis": "jns-tugas", "bobot": 30 }),
                json!({ "id_jenis": "jns-uts", "bobot": 30 }),
                json!({ "id_jenis": "jns-uas", "bobot": 20 }),
            ],
        )
        .expect("bobot");
        save_school_days(
            &state,
            json!({ "bawaan": [1, 2, 3, 4, 5], "unit": { "u1": [1, 2, 3, 4, 5, 6] } }),
        )
        .expect("hari sekolah");

        assert_eq!(
            save_type(&state, json!({ "id_jenis": "jns-uts", "nama": "UTS", "urutan": 4, "is_aktif": false }))
                .expect_err("berbobot").message,
            "Jenis yang masih berbobot tidak bisa dinonaktifkan. Pindahkan bobotnya ke jenis lain dulu."
        );
        assert_eq!(
            save_type(&state, json!({ "nama": "uts" }))
                .expect_err("kembar")
                .message,
            "Nama jenis sudah dipakai."
        );
        let proyek = save_type(&state, json!({ "nama": "Proyek", "urutan": 6 })).expect("proyek")
            ["id_jenis"]
            .as_str()
            .expect("id")
            .to_owned();
        assert_eq!(
            delete_type(&state, "jns-uh").expect_err("bawaan").message,
            "Jenis bawaan tidak bisa dihapus; nonaktifkan saja."
        );
        delete_type(&state, &proyek).expect("hapus proyek");

        let hasil = recap(&state, "ta1", "Ganjil", "r7", "mtk").expect("rekap");
        assert_eq!(
            hasil["catatan"],
            json!(["Matematika: belum ada penilaian UAS"])
        );
        assert_eq!(hasil["nilai_kosong"], json!(1));
        let baris = |id: &str| {
            hasil["siswa"]
                .as_array()
                .expect("siswa")
                .iter()
                .find(|s| s["id_siswa"] == id)
                .cloned()
                .expect("siswa")
        };
        let ani = baris("S1");
        assert_eq!(ani["kehadiran"]["hari_efektif"], json!(5));
        assert_eq!(ani["kehadiran"]["masuk"], json!(2));
        assert_eq!(ani["kehadiran"]["izin_sakit"], json!(1));
        assert_eq!(ani["kehadiran"]["persen"], json!(50.0));
        assert_eq!(
            ani["kehadiran"]["bolos"],
            json!([{ "tanggal": "2026-07-14", "mapel": ["IPA"] }])
        );
        assert_eq!(ani["nilai_akhir"], json!(69));
        let budi = baris("S2");
        assert_eq!(budi["kehadiran"]["hari_efektif"], json!(4));
        assert_eq!(budi["kehadiran"]["persen"], json!(100.0));
        assert_eq!(budi["nilai_akhir"], json!(84));
        assert_eq!(budi["kosong"], json!(1));

        // Leger kehadiran memakai pengklasifikasi yang sama (keputusan E).
        let leger = super::super::attendance_ledger::get_ledger_preview(
            &state,
            "ta1",
            "Ganjil",
            Some("r7"),
        )
        .expect("leger");
        assert_eq!(leger["total_hari_efektif"], json!(4));
        let murid = |id: &str| {
            leger["students"]
                .as_array()
                .expect("students")
                .iter()
                .find(|s| s["id_siswa"] == id)
                .cloned()
                .expect("murid")
        };
        let ani = murid("S1");
        assert_eq!(
            (
                ani["total_hari_efektif"].clone(),
                ani["hadir"].clone(),
                ani["sakit"].clone(),
                ani["alfa"].clone(),
                ani["dispensasi"].clone(),
                ani["persen_kehadiran"].clone()
            ),
            (
                json!(5),
                json!(1),
                json!(1),
                json!(2),
                json!(1),
                json!(50.0)
            )
        );
        assert_eq!(murid("S2")["persen_kehadiran"], json!(100.0));
    }

    #[test]
    fn kursor_jenis_dilupakan_sekali_saja() {
        let dir = tempfile::tempdir().expect("tempdir");
        storage::initialize(dir.path()).expect("skema lokal");
        let connection = storage::database(dir.path()).expect("db");
        let ada = |c: &rusqlite::Connection| -> i64 {
            c.query_row(
                "SELECT COUNT(*) FROM desktop_sync_table_cursor WHERE table_name = 'nilai_jenis';",
                [],
                |row| row.get(0),
            )
            .expect("kursor")
        };
        let tulis = |c: &rusqlite::Connection| {
            c.execute(
                "INSERT OR REPLACE INTO desktop_sync_table_cursor (table_name, remote_revision, updated_at)
                 VALUES ('nilai_jenis', 7, unixepoch());",
                [],
            )
            .expect("tulis kursor");
        };
        // `initialize` sudah menjalankan pemulihan; kursor baru tidak disentuh lagi.
        tulis(&connection);
        pulihkan_tarikan_jenis(&connection).expect("pemulihan kedua");
        assert_eq!(ada(&connection), 1);
        // Perangkat lama tanpa penanda: kursornya dilupakan.
        connection
            .execute("DELETE FROM desktop_sync_cursor WHERE domain = 'pulih:nilai_jenis';", [])
            .expect("hapus penanda");
        pulihkan_tarikan_jenis(&connection).expect("pemulihan pertama");
        assert_eq!(ada(&connection), 0);
    }

    #[test]
    fn bahan_erapor_dari_rekap_n2() {
        let (_dir, state) = state_uji();
        let connection = storage::database(&state.data_dir).expect("db");
        connection.execute_batch(SEED_SKENARIO).expect("seed");
        connection
            .execute_batch(
                "UPDATE siswa_data SET nis = '1001', nisn = '0012345678' WHERE id_siswa = 'S1';
                 INSERT INTO master_data (id_unik, kode_karyawan, nama, divisi, id_shift, jenis_personil, status_aktif)
                   VALUES ('g', 'G1', 'Budi Santoso', 'Guru', 1, 'GURU', 'Aktif');
                 INSERT INTO guru_data (id_guru, gelar, created_at, updated_at) VALUES ('g', 'S.Kom.', 'x', 'x');",
            )
            .expect("data tambahan");
        save_weights(
            &state,
            json!(0),
            vec![
                json!({ "id_jenis": "jns-tugas", "bobot": 50 }),
                json!({ "id_jenis": "jns-uts", "bobot": 50 }),
            ],
        )
        .expect("bobot");

        let data = erapor(&state, "ta1", "Ganjil", "r7").expect("erapor");
        assert_eq!(data["tahun_ajaran"], json!("2026/2027"));
        assert_eq!((data["rombel"].clone(), data["tingkat"].clone()), (json!("VII A"), json!(7)));
        let mapel = data["mapel"].as_array().expect("mapel");
        assert_eq!(mapel.len(), 1, "hanya mapel yang punya penilaian");
        assert_eq!(mapel[0]["kode_mapel"], json!("MTK"));
        assert_eq!(mapel[0]["guru"], json!("Budi Santoso, S.Kom."));
        assert_eq!(mapel[0]["penilaian"].as_array().expect("penilaian").len(), 3);
        assert_eq!(mapel[0]["skor"].as_array().expect("skor").len(), 5);
        let rekap = |id: &str| {
            mapel[0]["rekap"]
                .as_array()
                .expect("rekap")
                .iter()
                .find(|b| b["id_siswa"] == id)
                .cloned()
                .expect("siswa")
        };
        assert_eq!(rekap("S1")["nilai_akhir"], json!(75));
        assert_eq!(rekap("S1")["rata"]["jns-tugas"], json!(80.0));
        assert_eq!(rekap("S2")["nilai_akhir"], json!(78));
        let siswa = data["siswa"].as_array().expect("siswa");
        assert_eq!(siswa[0]["nisn"], json!("0012345678"));
        assert_eq!(siswa[1]["nisn"], json!(""));
        assert_eq!(
            erapor(&state, "ta1", "Ganjil", "tidak-ada").expect_err("rombel").message,
            "Rombel tidak ditemukan."
        );
    }
}
