// BERKAS INI HASIL SALIN OTOMATIS dari web-desktop oleh
// `mobile/scripts/sync-rust-modules.ts`. JANGAN disunting dengan tangan —
// perubahannya akan tertimpa diam-diam pada sinkronisasi berikutnya.
// Sunting sumbernya: `web-desktop/src-tauri/src/desktop/billing.rs`.

//! Tagihan siswa (Fase K3a): jenis tagihan, tarif per unit/tingkat,
//! keringanan, penerbitan massal, dan pembatalan.
//!
//! Lima tabel tersinkron. `keu_tagihan` dan `keu_tagihan_batal` append-only
//! (prinsip 5.2 PRD): tagihan tidak pernah diubah, pembatalan adalah baris
//! baru, dan status "Dibatalkan" diturunkan dari keberadaan baris itu. Dengan
//! begitu keduanya ditarik inkremental (`sync::APPEND_ONLY_TABLES`) walau
//! tumbuh ribuan baris per bulan. Id tagihan deterministik
//! `tgh-<jenis>-<siswa>-<periode>`, sehingga dua perangkat yang menerbitkan
//! bulan yang sama menghasilkan PK yang sama. Setiap tagihan bernilai bersih
//! > 0 punya jurnal Piutang Siswa (D) / Pendapatan (K) berid `jrn-<tagihan>`.
//!
//! Aturan murni dicerminkan `src/lib/validations/billing.ts` dan diuji dengan
//! vektor yang sama. Pesan galatnya pun wajib identik.

use std::collections::{HashMap, HashSet};

use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::Deserialize;
use serde_json::{json, Value};

use super::{
    accounting::{self, BarisTulis, HeaderTulis},
    config::MobileState,
    license, loan,
    models::CommandError,
    storage, sync,
};

/// WAJIB sama dengan CHECK `keu_jenis_tagihan.periodik` di ketiga DDL.
pub const PERIODIK: [&str; 3] = ["Bulanan", "Tahunan", "Sekali"];
/// WAJIB sama dengan CHECK `keu_keringanan.jenis` di ketiga DDL.
pub const JENIS_KERINGANAN: [&str; 2] = ["Persen", "Nominal"];
pub const PERIODE_SEKALI: &str = "SEKALI";
pub const MAKS_NOMINAL_TAGIHAN: i64 = 100_000_000;
pub const MAKS_NAMA_TAGIHAN: usize = 80;
pub const MAKS_ALASAN_KERINGANAN: usize = 80;
pub const MAKS_PERIODE: usize = 20;
pub const MAKS_ALASAN_BATAL_TAGIHAN: usize = 150;
pub const AKUN_PIUTANG_SISWA: &str = "akun-piutang-siswa";
pub const AKUN_TITIPAN_WALI: &str = "akun-titipan-wali";
/// WAJIB sama dengan CHECK `keu_pembayaran.metode` di ketiga DDL.
pub const METODE_BAYAR: [&str; 3] = ["Tunai", "Transfer", "Titipan"];
pub const MAKS_KETERANGAN_BAYAR: usize = 150;
pub const MAKS_TAGIHAN_PER_KUITANSI: usize = 100;
pub const MAKS_NAMA_PERANGKAT: usize = 60;
pub const SERI_KUITANSI_WEB: &str = "WEB";

// ── Aturan murni ────────────────────────────────────────────────────────────

fn panjang(value: &str) -> usize {
    value.chars().count()
}

fn rupiah(value: &Value) -> Option<i64> {
    match value {
        Value::Null => Some(0),
        Value::Number(number) => number.as_i64().filter(|nilai| *nilai >= 0),
        _ => None,
    }
}

fn bersih(value: &Option<String>) -> Option<String> {
    value
        .as_deref()
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(str::to_owned)
}

/// Cermin `kunciUnit`.
pub fn kunci_unit(unit: Option<&str>) -> String {
    unit.unwrap_or("").trim().to_lowercase()
}

pub fn id_tagihan(id_jenis: &str, id_siswa: &str, periode: &str) -> String {
    format!("tgh-{id_jenis}-{id_siswa}-{periode}")
}
pub fn id_jurnal_tagihan(id: &str) -> String {
    format!("jrn-{id}")
}

/// Cermin `validatePeriodeTagihan`.
pub fn validate_periode_tagihan(periodik: &str, periode: &str) -> Result<String, String> {
    let bersih = periode.trim();
    match periodik {
        "Sekali" => Ok(PERIODE_SEKALI.to_owned()),
        "Bulanan" => {
            if loan::is_valid_periode(bersih) {
                Ok(bersih.to_owned())
            } else {
                Err("Periode bulanan harus berbentuk YYYY-MM.".into())
            }
        }
        "Tahunan" => {
            if bersih.is_empty() {
                return Err("Tahun ajaran wajib dipilih.".into());
            }
            if panjang(bersih) > MAKS_PERIODE {
                return Err("Periode maksimal 20 karakter.".into());
            }
            Ok(bersih.to_owned())
        }
        _ => Err("Jenis periode tagihan tidak dikenal.".into()),
    }
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct JenisTagihanDraft {
    #[serde(default)]
    pub id_jenis_tagihan: Option<String>,
    #[serde(default)]
    pub nama: String,
    #[serde(default)]
    pub periodik: String,
    #[serde(default)]
    pub nominal_bawaan: Value,
    #[serde(default)]
    pub id_akun_pendapatan: String,
    #[serde(default = "bawaan_aktif")]
    pub is_aktif: bool,
}

fn bawaan_aktif() -> bool {
    true
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct JenisTagihanValid {
    pub nama: String,
    pub periodik: String,
    pub nominal_bawaan: i64,
    pub id_akun_pendapatan: String,
    pub is_aktif: bool,
}

/// Cermin `validateJenisTagihan`.
pub fn validate_jenis_tagihan(draft: &JenisTagihanDraft) -> Result<JenisTagihanValid, String> {
    let nama = draft.nama.trim();
    if nama.is_empty() {
        return Err("Nama tagihan wajib diisi.".into());
    }
    if panjang(nama) > MAKS_NAMA_TAGIHAN {
        return Err("Nama tagihan maksimal 80 karakter.".into());
    }
    if !PERIODIK.contains(&draft.periodik.as_str()) {
        return Err("Jenis periode tagihan tidak dikenal.".into());
    }
    let Some(nominal_bawaan) = rupiah(&draft.nominal_bawaan) else {
        return Err("Nominal harus rupiah bulat dan tidak negatif.".into());
    };
    if nominal_bawaan > MAKS_NOMINAL_TAGIHAN {
        return Err(format!(
            "Nominal maksimal {}.",
            accounting::format_rupiah(MAKS_NOMINAL_TAGIHAN)
        ));
    }
    let id_akun_pendapatan = draft.id_akun_pendapatan.trim();
    if id_akun_pendapatan.is_empty() {
        return Err("Akun pendapatan wajib dipilih.".into());
    }
    Ok(JenisTagihanValid {
        nama: nama.to_owned(),
        periodik: draft.periodik.clone(),
        nominal_bawaan,
        id_akun_pendapatan: id_akun_pendapatan.to_owned(),
        is_aktif: draft.is_aktif,
    })
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TarifDraft {
    #[serde(default)]
    pub id_tarif: Option<String>,
    #[serde(default)]
    pub id_jenis_tagihan: String,
    #[serde(default)]
    pub nama_unit: Option<String>,
    #[serde(default)]
    pub tingkat: Value,
    #[serde(default)]
    pub nominal: Value,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TarifValid {
    pub id_jenis_tagihan: String,
    pub nama_unit: String,
    pub tingkat: Option<i64>,
    pub nominal: i64,
}

/// Cermin `validateTarif`.
pub fn validate_tarif(draft: &TarifDraft) -> Result<TarifValid, String> {
    let id_jenis_tagihan = draft.id_jenis_tagihan.trim();
    if id_jenis_tagihan.is_empty() {
        return Err("Jenis tagihan wajib dipilih.".into());
    }
    let nama_unit = draft.nama_unit.as_deref().unwrap_or("").trim();
    if panjang(nama_unit) > MAKS_NAMA_TAGIHAN {
        return Err("Nama unit maksimal 80 karakter.".into());
    }
    let tingkat = match &draft.tingkat {
        Value::Null => None,
        value => Some(
            value
                .as_i64()
                .filter(|t| (1..=20).contains(t))
                .ok_or_else(|| "Tingkat harus bilangan 1 sampai 20.".to_string())?,
        ),
    };
    if nama_unit.is_empty() && tingkat.is_none() {
        return Err(
            "Pilih unit atau tingkat. Tarif untuk semua siswa diatur di nominal bawaan.".into(),
        );
    }
    let Some(nominal) = rupiah(&draft.nominal) else {
        return Err("Nominal harus rupiah bulat dan tidak negatif.".into());
    };
    if nominal > MAKS_NOMINAL_TAGIHAN {
        return Err(format!(
            "Nominal maksimal {}.",
            accounting::format_rupiah(MAKS_NOMINAL_TAGIHAN)
        ));
    }
    Ok(TarifValid {
        id_jenis_tagihan: id_jenis_tagihan.to_owned(),
        nama_unit: nama_unit.to_owned(),
        tingkat,
        nominal,
    })
}

#[derive(Debug, Clone)]
pub struct TarifBerlaku {
    pub nama_unit: String,
    pub tingkat: Option<i64>,
    pub nominal: i64,
}

/// Cermin `pilihTarif`: unit + tingkat > unit > tingkat > nominal bawaan.
pub fn pilih_tarif(
    tarif: &[TarifBerlaku],
    nominal_bawaan: i64,
    unit: Option<&str>,
    tingkat: Option<i64>,
) -> i64 {
    let kunci = kunci_unit(unit);
    let cocok = |item: &TarifBerlaku, pakai_unit: bool, pakai_tingkat: bool| {
        let unit_ok = if pakai_unit {
            !kunci.is_empty() && kunci_unit(Some(&item.nama_unit)) == kunci
        } else {
            item.nama_unit.is_empty()
        };
        let tingkat_ok = if pakai_tingkat {
            item.tingkat.is_some() && item.tingkat == tingkat
        } else {
            item.tingkat.is_none()
        };
        unit_ok && tingkat_ok
    };
    for (pakai_unit, pakai_tingkat) in [(true, true), (true, false), (false, true)] {
        if let Some(item) = tarif
            .iter()
            .find(|item| cocok(item, pakai_unit, pakai_tingkat))
        {
            return item.nominal;
        }
    }
    nominal_bawaan
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct KeringananDraft {
    #[serde(default)]
    pub id_keringanan: Option<String>,
    #[serde(default)]
    pub id_siswa: String,
    #[serde(default)]
    pub id_jenis_tagihan: String,
    #[serde(default)]
    pub jenis: String,
    #[serde(default)]
    pub nilai: Value,
    #[serde(default)]
    pub periode_mulai: Option<String>,
    #[serde(default)]
    pub periode_selesai: Option<String>,
    #[serde(default)]
    pub alasan: Option<String>,
    #[serde(default = "bawaan_aktif")]
    pub is_aktif: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct KeringananValid {
    pub id_siswa: String,
    pub id_jenis_tagihan: String,
    pub jenis: String,
    pub nilai: i64,
    pub periode_mulai: Option<String>,
    pub periode_selesai: Option<String>,
    pub alasan: Option<String>,
    pub is_aktif: bool,
}

/// Cermin `validateKeringanan`.
pub fn validate_keringanan(draft: &KeringananDraft) -> Result<KeringananValid, String> {
    let id_siswa = draft.id_siswa.trim();
    if id_siswa.is_empty() {
        return Err("Siswa wajib dipilih.".into());
    }
    let id_jenis_tagihan = draft.id_jenis_tagihan.trim();
    if id_jenis_tagihan.is_empty() {
        return Err("Jenis tagihan wajib dipilih.".into());
    }
    if !JENIS_KERINGANAN.contains(&draft.jenis.as_str()) {
        return Err("Jenis keringanan harus Persen atau Nominal.".into());
    }
    let Some(nilai) = draft.nilai.as_i64().filter(|nilai| *nilai > 0) else {
        return Err("Nilai keringanan harus bilangan bulat lebih dari nol.".into());
    };
    if draft.jenis == "Persen" && nilai > 100 {
        return Err("Keringanan persen maksimal 100.".into());
    }
    if draft.jenis == "Nominal" && nilai > MAKS_NOMINAL_TAGIHAN {
        return Err(format!(
            "Keringanan nominal maksimal {}.",
            accounting::format_rupiah(MAKS_NOMINAL_TAGIHAN)
        ));
    }
    let periode_mulai = bersih(&draft.periode_mulai);
    let periode_selesai = bersih(&draft.periode_selesai);
    if periode_mulai
        .as_deref()
        .is_some_and(|p| panjang(p) > MAKS_PERIODE)
        || periode_selesai
            .as_deref()
            .is_some_and(|p| panjang(p) > MAKS_PERIODE)
    {
        return Err("Periode maksimal 20 karakter.".into());
    }
    if let (Some(mulai), Some(selesai)) = (&periode_mulai, &periode_selesai) {
        if selesai < mulai {
            return Err("Periode selesai tidak boleh sebelum periode mulai.".into());
        }
    }
    let alasan = bersih(&draft.alasan);
    if alasan
        .as_deref()
        .is_some_and(|a| panjang(a) > MAKS_ALASAN_KERINGANAN)
    {
        return Err("Alasan maksimal 80 karakter.".into());
    }
    Ok(KeringananValid {
        id_siswa: id_siswa.to_owned(),
        id_jenis_tagihan: id_jenis_tagihan.to_owned(),
        jenis: draft.jenis.clone(),
        nilai,
        periode_mulai,
        periode_selesai,
        alasan,
        is_aktif: draft.is_aktif,
    })
}

#[derive(Debug, Clone)]
pub struct KeringananBerlaku {
    pub jenis: String,
    pub nilai: i64,
    pub periode_mulai: Option<String>,
    pub periode_selesai: Option<String>,
}

/// Cermin `keringananBerlaku`.
pub fn keringanan_berlaku(item: &KeringananBerlaku, periodik: &str, periode: &str) -> bool {
    if periodik == "Sekali" {
        return true;
    }
    if item
        .periode_mulai
        .as_deref()
        .is_some_and(|mulai| periode < mulai)
    {
        return false;
    }
    if item
        .periode_selesai
        .as_deref()
        .is_some_and(|selesai| periode > selesai)
    {
        return false;
    }
    true
}

/// Cermin `hitungPotongan`: persen dibulatkan setengah ke atas dengan
/// aritmetika bilangan bulat, dijumlah, dibatasi nominal.
pub fn hitung_potongan(nominal: i64, keringanan: &[KeringananBerlaku]) -> i64 {
    let total: i64 = keringanan
        .iter()
        .map(|item| {
            if item.jenis == "Persen" {
                (nominal * item.nilai + 50).div_euclid(100)
            } else {
                item.nilai
            }
        })
        .sum();
    total.min(nominal)
}

// ── Pembayaran (K3b) ────────────────────────────────────────────────────────

pub fn id_jurnal_pembayaran(id: &str) -> String {
    format!("jrn-{id}")
}
pub fn id_alokasi(id_pembayaran: &str, urutan: usize) -> String {
    format!("{id_pembayaran}-{urutan}")
}

/// Cermin `formatNomorKuitansi`.
pub fn format_nomor_kuitansi(tahun: &str, seri: &str, nomor_urut: i64) -> String {
    format!("KWT/{tahun}/{seri}/{nomor_urut:04}")
}

/// Cermin `validateSeri`.
pub fn validate_seri(seri: &str) -> Result<String, String> {
    let bersih = seri.trim();
    let n = panjang(bersih);
    if !(2..=8).contains(&n) || !bersih.chars().all(|c| c.is_ascii_alphanumeric()) {
        return Err("Seri harus 2 sampai 8 huruf atau angka.".into());
    }
    let kapital = bersih.to_ascii_uppercase();
    if kapital == SERI_KUITANSI_WEB {
        return Err("Seri WEB dipakai aplikasi Web.".into());
    }
    Ok(kapital)
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PembayaranDraft {
    #[serde(default)]
    pub id_siswa: String,
    #[serde(default)]
    pub tanggal: String,
    #[serde(default)]
    pub metode: String,
    #[serde(default)]
    pub total: Value,
    #[serde(default)]
    pub id_akun_kas: Option<String>,
    #[serde(default)]
    pub keterangan: Option<String>,
    #[serde(default)]
    pub id_tagihan: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PembayaranValid {
    pub id_siswa: String,
    pub tanggal: String,
    pub metode: String,
    pub total: i64,
    pub id_akun_kas: Option<String>,
    pub keterangan: Option<String>,
    pub id_tagihan: Vec<String>,
}

/// Cermin `validatePembayaran`. Tanggal masa depan diperiksa saat menulis.
pub fn validate_pembayaran(draft: &PembayaranDraft) -> Result<PembayaranValid, String> {
    let id_siswa = draft.id_siswa.trim();
    if id_siswa.is_empty() {
        return Err("Siswa wajib dipilih.".into());
    }
    if !super::inventory::is_valid_date(&draft.tanggal) {
        return Err("Tanggal pembayaran tidak valid.".into());
    }
    if !METODE_BAYAR.contains(&draft.metode.as_str()) {
        return Err("Metode pembayaran tidak dikenal.".into());
    }
    let Some(total) = draft.total.as_i64().filter(|t| *t > 0) else {
        return Err("Jumlah bayar harus rupiah bulat lebih dari nol.".into());
    };
    if total > MAKS_NOMINAL_TAGIHAN {
        return Err(format!(
            "Jumlah bayar maksimal {}.",
            accounting::format_rupiah(MAKS_NOMINAL_TAGIHAN)
        ));
    }
    let titipan = draft.metode == "Titipan";
    let id_akun_kas = if titipan {
        None
    } else {
        bersih(&draft.id_akun_kas)
    };
    if !titipan && id_akun_kas.is_none() {
        return Err("Akun penerima wajib dipilih.".into());
    }
    let keterangan = bersih(&draft.keterangan);
    if keterangan
        .as_deref()
        .is_some_and(|k| panjang(k) > MAKS_KETERANGAN_BAYAR)
    {
        return Err("Keterangan maksimal 150 karakter.".into());
    }
    let mut id_tagihan: Vec<String> = Vec::new();
    for id in &draft.id_tagihan {
        let id = id.trim();
        if !id.is_empty() && !id_tagihan.iter().any(|ada| ada == id) {
            id_tagihan.push(id.to_owned());
        }
    }
    if id_tagihan.len() > MAKS_TAGIHAN_PER_KUITANSI {
        return Err("Satu kuitansi paling banyak 100 tagihan.".into());
    }
    if titipan && id_tagihan.is_empty() {
        return Err("Pilih tagihan yang dibayar dari titipan.".into());
    }
    Ok(PembayaranValid {
        id_siswa: id_siswa.to_owned(),
        tanggal: draft.tanggal.clone(),
        metode: draft.metode.clone(),
        total,
        id_akun_kas,
        keterangan,
        id_tagihan,
    })
}

#[derive(Debug, Clone)]
pub struct TagihanTerbuka {
    pub id_tagihan: String,
    pub jatuh_tempo: String,
    pub periode: String,
    pub sisa: i64,
}

/// Cermin `alokasiPembayaran`: `(alokasi per tagihan, kelebihan ke titipan)`.
pub fn alokasi_pembayaran(tagihan: &[TagihanTerbuka], total: i64) -> (Vec<(String, i64)>, i64) {
    let mut urut: Vec<&TagihanTerbuka> = tagihan.iter().collect();
    urut.sort_by(|a, b| {
        a.jatuh_tempo
            .cmp(&b.jatuh_tempo)
            .then_with(|| a.periode.cmp(&b.periode))
            .then_with(|| a.id_tagihan.cmp(&b.id_tagihan))
    });
    let mut sisa = total;
    let mut alokasi = Vec::new();
    for item in urut {
        if sisa <= 0 {
            break;
        }
        if item.sisa <= 0 {
            continue;
        }
        let nominal = item.sisa.min(sisa);
        alokasi.push((item.id_tagihan.clone(), nominal));
        sisa -= nominal;
    }
    (alokasi, sisa)
}

/// Cermin `barisJurnalPembayaran`: `(akun, debit, kredit)`.
pub fn baris_jurnal_pembayaran(
    metode: &str,
    id_akun_kas: Option<&str>,
    ke_tagihan: i64,
    ke_titipan: i64,
) -> Vec<(String, i64, i64)> {
    if metode == "Titipan" {
        return vec![
            (AKUN_TITIPAN_WALI.to_owned(), ke_tagihan, 0),
            (AKUN_PIUTANG_SISWA.to_owned(), 0, ke_tagihan),
        ];
    }
    let mut baris = vec![(
        id_akun_kas.unwrap_or("").to_owned(),
        ke_tagihan + ke_titipan,
        0,
    )];
    if ke_tagihan > 0 {
        baris.push((AKUN_PIUTANG_SISWA.to_owned(), 0, ke_tagihan));
    }
    if ke_titipan > 0 {
        baris.push((AKUN_TITIPAN_WALI.to_owned(), 0, ke_titipan));
    }
    baris
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

fn hari_ini(connection: &Connection) -> Result<String, CommandError> {
    connection
        .query_row("SELECT date('now', '+7 hours');", [], |row| row.get(0))
        .map_err(db_error)
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

fn satu_json(connection: &Connection, sql: &str, id: &str) -> Result<Value, CommandError> {
    query_json(connection, sql, &[&id])?
        .into_iter()
        .next()
        .ok_or_else(CommandError::internal)
}

const JENIS_SQL: &str =
    "SELECT id_jenis_tagihan, nama, periodik, nominal_bawaan, id_akun_pendapatan,
        is_aktif, created_at, updated_at FROM keu_jenis_tagihan WHERE id_jenis_tagihan = ?;";
const TARIF_SQL: &str =
    "SELECT id_tarif, id_jenis_tagihan, nama_unit, tingkat, nominal, created_at,
        updated_at FROM keu_tarif_tagihan WHERE id_tarif = ?;";
const KERINGANAN_SQL: &str = "SELECT id_keringanan, id_siswa, id_jenis_tagihan, jenis, nilai,
        periode_mulai, periode_selesai, alasan, is_aktif, dibuat_oleh, created_at, updated_at
        FROM keu_keringanan WHERE id_keringanan = ?;";
const TAGIHAN_SQL: &str = "SELECT id_tagihan, id_siswa, nama_siswa, id_jenis_tagihan, nama_tagihan,
        periode, nominal, potongan, jatuh_tempo, dibuat_oleh, created_at
        FROM keu_tagihan WHERE id_tagihan = ?;";

/// Data pendukung halaman tagihan: jenis, tarif, dan pilihan unit, rombel,
/// serta tahun ajaran untuk menerbitkan. Dibaca dengan izin tagihan, bukan
/// `academic.view`.
pub fn master(state: &MobileState) -> Result<Value, CommandError> {
    let connection = storage::database(&state.data_dir)?;
    let jenis = query_json(
        &connection,
        "SELECT id_jenis_tagihan, nama, periodik, nominal_bawaan, id_akun_pendapatan, is_aktif
         FROM keu_jenis_tagihan ORDER BY nama, id_jenis_tagihan LIMIT 500;",
        &[],
    )?;
    let tarif = query_json(
        &connection,
        "SELECT id_tarif, id_jenis_tagihan, nama_unit, tingkat, nominal
         FROM keu_tarif_tagihan ORDER BY id_jenis_tagihan, nama_unit, tingkat LIMIT 2000;",
        &[],
    )?;
    let unit = query_json(
        &connection,
        "SELECT nama_unit AS nama FROM akademik_unit WHERE status_aktif = 1
         UNION SELECT DISTINCT unit FROM master_data WHERE TRIM(COALESCE(unit, '')) <> ''
         ORDER BY 1 LIMIT 200;",
        &[],
    )?;
    let rombel = query_json(
        &connection,
        "SELECT id_rombel, nama_rombel, tingkat FROM akademik_rombel WHERE is_aktif = 1
         ORDER BY tingkat, nama_rombel LIMIT 500;",
        &[],
    )?;
    let tahun_ajaran = query_json(
        &connection,
        "SELECT nama_tahun FROM akademik_tahun_ajaran ORDER BY nama_tahun DESC LIMIT 50;",
        &[],
    )?;
    Ok(json!({
        "jenis": jenis,
        "tarif": tarif,
        "unit": unit.iter().filter_map(|row| row["nama"].as_str().map(str::to_owned)).collect::<Vec<_>>(),
        "rombel": rombel,
        "tahun_ajaran": tahun_ajaran.iter().filter_map(|row| row["nama_tahun"].as_str().map(str::to_owned)).collect::<Vec<_>>(),
    }))
}

pub fn save_jenis(state: &MobileState, draft: Value) -> Result<Value, CommandError> {
    let draft: JenisTagihanDraft =
        serde_json::from_value(draft).map_err(|_| invalid("Data jenis tagihan tidak valid."))?;
    let valid = validate_jenis_tagihan(&draft).map_err(invalid)?;
    let client_id = sync::ensure_client_id(state)?;
    let mut connection = storage::database(&state.data_dir)?;
    let transaction = connection.transaction().map_err(db_error)?;
    let akun_sah: bool = transaction
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM keu_akun WHERE id_akun = ? AND kelompok = 'Pendapatan' AND is_aktif = 1);",
            params![valid.id_akun_pendapatan],
            |row| row.get(0),
        )
        .map_err(db_error)?;
    if !akun_sah {
        return Err(invalid("Akun pendapatan harus akun Pendapatan yang aktif."));
    }
    let id = bersih(&draft.id_jenis_tagihan).unwrap_or_else(|| new_id("jt-"));
    let nama_dipakai: bool = transaction
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM keu_jenis_tagihan WHERE LOWER(nama) = LOWER(?) AND id_jenis_tagihan <> ?);",
            params![valid.nama, id],
            |row| row.get(0),
        )
        .map_err(db_error)?;
    if nama_dipakai {
        return Err(invalid("Nama tagihan sudah dipakai jenis lain."));
    }
    transaction
        .execute(
            "INSERT INTO keu_jenis_tagihan (
                id_jenis_tagihan, nama, periodik, nominal_bawaan, id_akun_pendapatan, is_aktif,
                created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
             ON CONFLICT(id_jenis_tagihan) DO UPDATE SET
                nama = excluded.nama,
                periodik = excluded.periodik,
                nominal_bawaan = excluded.nominal_bawaan,
                id_akun_pendapatan = excluded.id_akun_pendapatan,
                is_aktif = excluded.is_aktif,
                updated_at = excluded.updated_at;",
            params![
                id,
                valid.nama,
                valid.periodik,
                valid.nominal_bawaan,
                valid.id_akun_pendapatan,
                valid.is_aktif as i64
            ],
        )
        .map_err(db_error)?;
    let payload = satu_json(&transaction, JENIS_SQL, &id)?;
    sync::enqueue(
        &transaction,
        &client_id,
        "billing-type",
        "save",
        &id,
        &payload,
        None,
    )?;
    transaction.commit().map_err(db_error)?;
    Ok(json!({ "sukses": true, "id_jenis_tagihan": id }))
}

pub fn save_tarif(state: &MobileState, draft: Value) -> Result<Value, CommandError> {
    let draft: TarifDraft =
        serde_json::from_value(draft).map_err(|_| invalid("Data tarif tidak valid."))?;
    let valid = validate_tarif(&draft).map_err(invalid)?;
    let client_id = sync::ensure_client_id(state)?;
    let mut connection = storage::database(&state.data_dir)?;
    let transaction = connection.transaction().map_err(db_error)?;
    let id = bersih(&draft.id_tarif).unwrap_or_else(|| new_id("trf-"));
    // Keunikan dijaga aplikasi, bukan UNIQUE: dua perangkat offline boleh
    // membuat tarif yang sama tanpa membuat push macet permanen.
    let kembar = query_json(
        &transaction,
        "SELECT nama_unit, tingkat FROM keu_tarif_tagihan
         WHERE id_jenis_tagihan = ? AND id_tarif <> ? LIMIT 2000;",
        &[&valid.id_jenis_tagihan, &id],
    )?
    .iter()
    .any(|row| {
        kunci_unit(row["nama_unit"].as_str()) == kunci_unit(Some(&valid.nama_unit))
            && row["tingkat"].as_i64() == valid.tingkat
    });
    if kembar {
        return Err(invalid("Tarif untuk unit dan tingkat ini sudah ada."));
    }
    transaction
        .execute(
            "INSERT INTO keu_tarif_tagihan (
                id_tarif, id_jenis_tagihan, nama_unit, tingkat, nominal, created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
             ON CONFLICT(id_tarif) DO UPDATE SET
                id_jenis_tagihan = excluded.id_jenis_tagihan,
                nama_unit = excluded.nama_unit,
                tingkat = excluded.tingkat,
                nominal = excluded.nominal,
                updated_at = excluded.updated_at;",
            params![
                id,
                valid.id_jenis_tagihan,
                valid.nama_unit,
                valid.tingkat,
                valid.nominal
            ],
        )
        .map_err(db_error)?;
    let payload = satu_json(&transaction, TARIF_SQL, &id)?;
    sync::enqueue(
        &transaction,
        &client_id,
        "billing-rate",
        "save",
        &id,
        &payload,
        None,
    )?;
    transaction.commit().map_err(db_error)?;
    Ok(json!({ "sukses": true, "id_tarif": id }))
}

pub fn delete_tarif(state: &MobileState, id_tarif: &str) -> Result<Value, CommandError> {
    let client_id = sync::ensure_client_id(state)?;
    let mut connection = storage::database(&state.data_dir)?;
    let transaction = connection.transaction().map_err(db_error)?;
    let dihapus = transaction
        .execute(
            "DELETE FROM keu_tarif_tagihan WHERE id_tarif = ?;",
            params![id_tarif],
        )
        .map_err(db_error)?;
    if dihapus > 0 {
        sync::enqueue(
            &transaction,
            &client_id,
            "billing-rate",
            "delete",
            id_tarif,
            &json!({ "id_tarif": id_tarif }),
            None,
        )?;
    }
    transaction.commit().map_err(db_error)?;
    Ok(json!({ "sukses": true }))
}

pub fn discounts(state: &MobileState) -> Result<Value, CommandError> {
    let connection = storage::database(&state.data_dir)?;
    let items = query_json(
        &connection,
        "SELECT k.id_keringanan, k.id_siswa, COALESCE(s.nama_lengkap, k.id_siswa) AS nama_siswa,
                k.id_jenis_tagihan, COALESCE(j.nama, k.id_jenis_tagihan) AS nama_tagihan,
                k.jenis, k.nilai, k.periode_mulai, k.periode_selesai, k.alasan, k.is_aktif
         FROM keu_keringanan k
         LEFT JOIN siswa_data s ON s.id_siswa = k.id_siswa
         LEFT JOIN keu_jenis_tagihan j ON j.id_jenis_tagihan = k.id_jenis_tagihan
         ORDER BY k.is_aktif DESC, nama_siswa, k.id_keringanan
         LIMIT 2000;",
        &[],
    )?;
    Ok(json!({ "items": items }))
}

pub fn save_keringanan(
    state: &MobileState,
    operator: &str,
    draft: Value,
) -> Result<Value, CommandError> {
    let draft: KeringananDraft =
        serde_json::from_value(draft).map_err(|_| invalid("Data keringanan tidak valid."))?;
    let valid = validate_keringanan(&draft).map_err(invalid)?;
    let client_id = sync::ensure_client_id(state)?;
    let mut connection = storage::database(&state.data_dir)?;
    let transaction = connection.transaction().map_err(db_error)?;
    let ada_siswa: bool = transaction
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM siswa_data WHERE id_siswa = ?);",
            params![valid.id_siswa],
            |row| row.get(0),
        )
        .map_err(db_error)?;
    if !ada_siswa {
        return Err(invalid("Siswa tidak ditemukan."));
    }
    let id = bersih(&draft.id_keringanan).unwrap_or_else(|| new_id("krg-"));
    transaction
        .execute(
            "INSERT INTO keu_keringanan (
                id_keringanan, id_siswa, id_jenis_tagihan, jenis, nilai, periode_mulai,
                periode_selesai, alasan, is_aktif, dibuat_oleh, created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
             ON CONFLICT(id_keringanan) DO UPDATE SET
                id_siswa = excluded.id_siswa,
                id_jenis_tagihan = excluded.id_jenis_tagihan,
                jenis = excluded.jenis,
                nilai = excluded.nilai,
                periode_mulai = excluded.periode_mulai,
                periode_selesai = excluded.periode_selesai,
                alasan = excluded.alasan,
                is_aktif = excluded.is_aktif,
                updated_at = excluded.updated_at;",
            params![
                id,
                valid.id_siswa,
                valid.id_jenis_tagihan,
                valid.jenis,
                valid.nilai,
                valid.periode_mulai,
                valid.periode_selesai,
                valid.alasan,
                valid.is_aktif as i64,
                operator
            ],
        )
        .map_err(db_error)?;
    let payload = satu_json(&transaction, KERINGANAN_SQL, &id)?;
    sync::enqueue(
        &transaction,
        &client_id,
        "billing-discount",
        "save",
        &id,
        &payload,
        None,
    )?;
    transaction.commit().map_err(db_error)?;
    Ok(json!({ "sukses": true, "id_keringanan": id }))
}

/// Siswa aktif untuk dipilih pada keringanan, dengan izin tagihan.
pub fn students(state: &MobileState) -> Result<Value, CommandError> {
    let connection = storage::database(&state.data_dir)?;
    let items = query_json(
        &connection,
        "SELECT s.id_siswa, s.nama_lengkap, COALESCE(s.nis, '') AS nis,
                COALESCE(r.nama_rombel, '') AS kelas
         FROM siswa_data s
         LEFT JOIN akademik_rombel r ON r.id_rombel = s.id_rombel
         WHERE s.status = 'Aktif'
         ORDER BY s.nama_lengkap, s.id_siswa
         LIMIT 3000;",
        &[],
    )?;
    Ok(json!({ "items": items }))
}

struct Jenis {
    id: String,
    nama: String,
    periodik: String,
    nominal_bawaan: i64,
    id_akun_pendapatan: String,
}

#[derive(Debug, Clone)]
pub struct Calon {
    pub id_siswa: String,
    pub nama: String,
    pub kelas: String,
    pub nominal: i64,
    pub potongan: i64,
    pub sudah_ada: bool,
}

/// Inti penerbitan, dipakai pratinjau dan penerbitan sungguhan sehingga
/// keduanya tidak mungkin menghitung berbeda.
fn susun_calon(
    connection: &Connection,
    id_jenis: &str,
    periode_mentah: &str,
    unit: Option<&str>,
    id_rombel: Option<&str>,
) -> Result<(Jenis, String, Vec<Calon>), CommandError> {
    let jenis = connection
        .query_row(
            "SELECT id_jenis_tagihan, nama, periodik, nominal_bawaan, id_akun_pendapatan, is_aktif
             FROM keu_jenis_tagihan WHERE id_jenis_tagihan = ?;",
            params![id_jenis],
            |row| {
                Ok((
                    Jenis {
                        id: row.get(0)?,
                        nama: row.get(1)?,
                        periodik: row.get(2)?,
                        nominal_bawaan: row.get(3)?,
                        id_akun_pendapatan: row.get(4)?,
                    },
                    row.get::<_, i64>(5)?,
                ))
            },
        )
        .optional()
        .map_err(db_error)?
        .ok_or_else(|| invalid("Jenis tagihan tidak ditemukan."))?;
    if jenis.1 != 1 {
        return Err(invalid("Jenis tagihan ini nonaktif."));
    }
    let jenis = jenis.0;
    let periode = validate_periode_tagihan(&jenis.periodik, periode_mentah).map_err(invalid)?;

    let tarif: Vec<TarifBerlaku> = query_json(
        connection,
        "SELECT nama_unit, tingkat, nominal FROM keu_tarif_tagihan WHERE id_jenis_tagihan = ? LIMIT 2000;",
        &[&jenis.id],
    )?
    .iter()
    .map(|row| TarifBerlaku {
        nama_unit: row["nama_unit"].as_str().unwrap_or("").to_owned(),
        tingkat: row["tingkat"].as_i64(),
        nominal: row["nominal"].as_i64().unwrap_or(0),
    })
    .collect();
    let mut keringanan: HashMap<String, Vec<KeringananBerlaku>> = HashMap::new();
    for row in query_json(
        connection,
        "SELECT id_siswa, jenis, nilai, periode_mulai, periode_selesai FROM keu_keringanan
         WHERE id_jenis_tagihan = ? AND is_aktif = 1 LIMIT 5000;",
        &[&jenis.id],
    )? {
        let item = KeringananBerlaku {
            jenis: row["jenis"].as_str().unwrap_or("").to_owned(),
            nilai: row["nilai"].as_i64().unwrap_or(0),
            periode_mulai: row["periode_mulai"].as_str().map(str::to_owned),
            periode_selesai: row["periode_selesai"].as_str().map(str::to_owned),
        };
        if keringanan_berlaku(&item, &jenis.periodik, &periode) {
            keringanan
                .entry(row["id_siswa"].as_str().unwrap_or("").to_owned())
                .or_default()
                .push(item);
        }
    }
    let sudah: HashSet<String> = query_json(
        connection,
        "SELECT id_siswa FROM keu_tagihan WHERE id_jenis_tagihan = ? AND periode = ? LIMIT 5000;",
        &[&jenis.id, &periode],
    )?
    .iter()
    .filter_map(|row| row["id_siswa"].as_str().map(str::to_owned))
    .collect();

    let kunci = unit.map(|u| kunci_unit(Some(u))).filter(|k| !k.is_empty());
    let rombel = id_rombel.map(str::trim).filter(|r| !r.is_empty());
    let calon = query_json(
        connection,
        "SELECT s.id_siswa, s.nama_lengkap, s.id_rombel, COALESCE(r.nama_rombel, '') AS kelas,
                r.tingkat, COALESCE(m.unit, '') AS unit
         FROM siswa_data s
         LEFT JOIN akademik_rombel r ON r.id_rombel = s.id_rombel
         LEFT JOIN master_data m ON m.id_unik = s.id_siswa
         WHERE s.status = 'Aktif'
         ORDER BY r.tingkat, r.nama_rombel, s.nama_lengkap, s.id_siswa
         LIMIT 3000;",
        &[],
    )?
    .into_iter()
    .filter(|row| {
        kunci
            .as_ref()
            .map_or(true, |k| kunci_unit(row["unit"].as_str()) == *k)
            && rombel.map_or(true, |r| row["id_rombel"].as_str() == Some(r))
    })
    .map(|row| {
        let id_siswa = row["id_siswa"].as_str().unwrap_or("").to_owned();
        let nominal = pilih_tarif(
            &tarif,
            jenis.nominal_bawaan,
            row["unit"].as_str(),
            row["tingkat"].as_i64(),
        );
        let potongan = hitung_potongan(
            nominal,
            keringanan.get(&id_siswa).map(Vec::as_slice).unwrap_or(&[]),
        );
        Calon {
            sudah_ada: sudah.contains(&id_siswa),
            nama: row["nama_lengkap"].as_str().unwrap_or("").to_owned(),
            kelas: row["kelas"].as_str().unwrap_or("").to_owned(),
            id_siswa,
            nominal,
            potongan,
        }
    })
    .collect();
    Ok((jenis, periode, calon))
}

fn calon_json(calon: &[Calon]) -> Value {
    let baru: Vec<&Calon> = calon.iter().filter(|c| !c.sudah_ada).collect();
    json!({
        "items": calon.iter().map(|c| json!({
            "id_siswa": c.id_siswa,
            "nama": c.nama,
            "kelas": c.kelas,
            "nominal": c.nominal,
            "potongan": c.potongan,
            "bersih": c.nominal - c.potongan,
            "sudah_ada": c.sudah_ada,
        })).collect::<Vec<_>>(),
        "jumlah_baru": baru.len(),
        "jumlah_sudah_ada": calon.len() - baru.len(),
        "total_bersih": baru.iter().map(|c| c.nominal - c.potongan).sum::<i64>(),
    })
}

pub fn preview(
    state: &MobileState,
    id_jenis: &str,
    periode: &str,
    unit: Option<&str>,
    id_rombel: Option<&str>,
) -> Result<Value, CommandError> {
    let connection = storage::database(&state.data_dir)?;
    let (_, periode, calon) = susun_calon(&connection, id_jenis, periode, unit, id_rombel)?;
    let mut hasil = calon_json(&calon);
    hasil["periode"] = json!(periode);
    Ok(hasil)
}

#[allow(clippy::too_many_arguments)]
pub fn issue(
    state: &MobileState,
    operator: &str,
    id_jenis: &str,
    periode: &str,
    jatuh_tempo: &str,
    unit: Option<&str>,
    id_rombel: Option<&str>,
) -> Result<Value, CommandError> {
    if !super::inventory::is_valid_date(jatuh_tempo) {
        return Err(invalid("Tanggal jatuh tempo tidak valid."));
    }
    let client_id = sync::ensure_client_id(state)?;
    let mut connection = storage::database(&state.data_dir)?;
    let transaction = connection.transaction().map_err(db_error)?;
    let (jenis, periode, calon) = susun_calon(&transaction, id_jenis, periode, unit, id_rombel)?;
    let tanggal = hari_ini(&transaction)?;
    let mut terbit = 0usize;
    for item in calon.iter().filter(|c| !c.sudah_ada) {
        let id = id_tagihan(&jenis.id, &item.id_siswa, &periode);
        transaction
            .execute(
                "INSERT OR IGNORE INTO keu_tagihan (
                    id_tagihan, id_siswa, nama_siswa, id_jenis_tagihan, nama_tagihan, periode,
                    nominal, potongan, jatuh_tempo, dibuat_oleh, created_at
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'));",
                params![
                    id,
                    item.id_siswa,
                    item.nama,
                    jenis.id,
                    jenis.nama,
                    periode,
                    item.nominal,
                    item.potongan,
                    jatuh_tempo,
                    operator
                ],
            )
            .map_err(db_error)?;
        let payload = satu_json(&transaction, TAGIHAN_SQL, &id)?;
        sync::enqueue(
            &transaction,
            &client_id,
            "billing",
            "create",
            &id,
            &payload,
            None,
        )?;
        let bersih = item.nominal - item.potongan;
        if bersih > 0 {
            let id_jurnal = id_jurnal_tagihan(&id);
            accounting::tulis_jurnal_tx(
                &transaction,
                state,
                &client_id,
                HeaderTulis {
                    id_jurnal: id_jurnal.clone(),
                    tanggal: tanggal.clone(),
                    keterangan: format!("{} {} {}", jenis.nama, periode, item.nama),
                    sumber: "Tagihan",
                    id_sumber: Some(id.clone()),
                    id_jurnal_batal: None,
                    dibuat_oleh: operator.to_owned(),
                },
                &[
                    BarisTulis {
                        id_baris: format!("{id_jurnal}-1"),
                        id_akun: AKUN_PIUTANG_SISWA.to_owned(),
                        debit: bersih,
                        kredit: 0,
                        keterangan: None,
                        urutan: 1,
                    },
                    BarisTulis {
                        id_baris: format!("{id_jurnal}-2"),
                        id_akun: jenis.id_akun_pendapatan.clone(),
                        debit: 0,
                        kredit: bersih,
                        keterangan: None,
                        urutan: 2,
                    },
                ],
            )?;
        }
        terbit += 1;
    }
    transaction.commit().map_err(db_error)?;
    Ok(json!({
        "sukses": true,
        "terbit": terbit,
        "dilewati": calon.len() - terbit,
        "periode": periode,
    }))
}

pub fn cancel(
    state: &MobileState,
    operator: &str,
    id: &str,
    alasan: &str,
) -> Result<Value, CommandError> {
    let alasan = alasan.trim();
    if alasan.is_empty() {
        return Err(invalid("Alasan pembatalan wajib diisi."));
    }
    if panjang(alasan) > MAKS_ALASAN_BATAL_TAGIHAN {
        return Err(invalid("Alasan pembatalan maksimal 150 karakter."));
    }
    let client_id = sync::ensure_client_id(state)?;
    let mut connection = storage::database(&state.data_dir)?;
    let transaction = connection.transaction().map_err(db_error)?;
    let (nama_siswa, nama_tagihan, periode): (String, String, String) = transaction
        .query_row(
            "SELECT nama_siswa, nama_tagihan, periode FROM keu_tagihan WHERE id_tagihan = ?;",
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()
        .map_err(db_error)?
        .ok_or_else(|| invalid("Tagihan tidak ditemukan."))?;
    let dibayar: i64 = transaction
        .query_row(
            &format!("SELECT COALESCE(SUM(dibayar), 0) FROM ({DIBAYAR_SQL}) WHERE id_tagihan = ?;"),
            params![id],
            |row| row.get(0),
        )
        .map_err(db_error)?;
    if dibayar > 0 {
        return Err(invalid(
            "Tagihan ini sudah dibayar. Batalkan kuitansinya atau pindahkan ke titipan lebih dulu.",
        ));
    }
    let ditulis = transaction
        .execute(
            "INSERT OR IGNORE INTO keu_tagihan_batal (id_tagihan, alasan, dibatalkan_oleh, created_at)
             VALUES (?, ?, ?, datetime('now'));",
            params![id, alasan, operator],
        )
        .map_err(db_error)?;
    if ditulis == 0 {
        return Err(invalid("Tagihan ini sudah dibatalkan."));
    }
    accounting::balik_jurnal_tx(
        &transaction,
        state,
        &client_id,
        &id_jurnal_tagihan(id),
        format!("Pembatalan {nama_tagihan} {periode} {nama_siswa}: {alasan}"),
        operator,
    )?;
    let payload = satu_json(
        &transaction,
        "SELECT id_tagihan, alasan, dibatalkan_oleh, created_at FROM keu_tagihan_batal WHERE id_tagihan = ?;",
        id,
    )?;
    sync::enqueue(
        &transaction,
        &client_id,
        "billing-cancel",
        "create",
        id,
        &payload,
        None,
    )?;
    transaction.commit().map_err(db_error)?;
    Ok(json!({ "sukses": true }))
}

/// Daftar tagihan (tunggakan) dengan saringan opsional. `sisa` = nominal −
/// potongan − alokasi kuitansi yang tidak dibatalkan, untuk tagihan aktif.
pub fn list(
    state: &MobileState,
    periode: Option<&str>,
    id_jenis: Option<&str>,
    id_rombel: Option<&str>,
    status: Option<&str>,
) -> Result<Value, CommandError> {
    let connection = storage::database(&state.data_dir)?;
    let isi = |v: Option<&str>| {
        v.map(str::trim)
            .filter(|v| !v.is_empty())
            .map(str::to_owned)
    };
    let (periode, id_jenis, id_rombel, status) =
        (isi(periode), isi(id_jenis), isi(id_rombel), isi(status));
    if status
        .as_deref()
        .is_some_and(|s| !["Aktif", "Lunas", "Dibatalkan"].contains(&s))
    {
        return Err(invalid("Status tagihan tidak dikenal."));
    }
    let mut sql = String::from(
        "SELECT t.id_tagihan, t.id_siswa, t.nama_siswa, COALESCE(r.nama_rombel, '') AS kelas,
                t.id_jenis_tagihan, t.nama_tagihan, t.periode, t.nominal, t.potongan, t.jatuh_tempo,
                b.alasan AS alasan_batal, COALESCE(d.dibayar, 0) AS dibayar,
                CASE WHEN b.id_tagihan IS NOT NULL THEN 'Dibatalkan'
                     WHEN t.nominal - t.potongan <= COALESCE(d.dibayar, 0) THEN 'Lunas'
                     ELSE 'Aktif' END AS status
         FROM keu_tagihan t
         LEFT JOIN keu_tagihan_batal b ON b.id_tagihan = t.id_tagihan
         -- subquery ini = `DIBAYAR_SQL`, ditulis utuh supaya `audit:sql` bisa menjalankannya
         LEFT JOIN (
            SELECT a.id_tagihan, SUM(a.nominal) AS dibayar
            FROM keu_pembayaran_alokasi a
            JOIN keu_pembayaran p ON p.id_pembayaran = a.id_pembayaran
            LEFT JOIN keu_pembayaran_batal pb ON pb.id_pembayaran = p.id_pembayaran
            WHERE a.id_tagihan IS NOT NULL AND pb.id_pembayaran IS NULL
            GROUP BY a.id_tagihan
         ) d ON d.id_tagihan = t.id_tagihan
         LEFT JOIN siswa_data s ON s.id_siswa = t.id_siswa
         LEFT JOIN akademik_rombel r ON r.id_rombel = s.id_rombel
         WHERE 1 = 1",
    );
    let mut args: Vec<String> = Vec::new();
    if let Some(value) = periode {
        sql.push_str(" AND t.periode = ?");
        args.push(value);
    }
    if let Some(value) = id_jenis {
        sql.push_str(" AND t.id_jenis_tagihan = ?");
        args.push(value);
    }
    if let Some(value) = id_rombel {
        sql.push_str(" AND s.id_rombel = ?");
        args.push(value);
    }
    if let Some(value) = status {
        sql.push_str(match value.as_str() {
            "Aktif" => {
                " AND b.id_tagihan IS NULL AND t.nominal - t.potongan > COALESCE(d.dibayar, 0)"
            }
            "Lunas" => {
                " AND b.id_tagihan IS NULL AND t.nominal - t.potongan <= COALESCE(d.dibayar, 0)"
            }
            _ => " AND b.id_tagihan IS NOT NULL",
        });
    }
    // `LIMIT 1000` = `BATAS_DAFTAR_TAGIHAN` di `validations/billing.ts`.
    sql.push_str(" ORDER BY t.periode DESC, kelas, t.nama_siswa, t.id_tagihan LIMIT 1000;");
    let params: Vec<&dyn rusqlite::ToSql> =
        args.iter().map(|a| a as &dyn rusqlite::ToSql).collect();
    let hari = hari_ini(&connection)?;
    let items: Vec<Value> = query_json(&connection, &sql, &params)?
        .into_iter()
        .map(|mut row| {
            let aktif = row["status"] == "Aktif";
            let sisa = if aktif {
                row["nominal"].as_i64().unwrap_or(0)
                    - row["potongan"].as_i64().unwrap_or(0)
                    - row["dibayar"].as_i64().unwrap_or(0)
            } else {
                0
            };
            let terlambat = sisa > 0
                && row["jatuh_tempo"]
                    .as_str()
                    .is_some_and(|j| j < hari.as_str());
            row["sisa"] = json!(sisa);
            row["terlambat"] = json!(terlambat);
            row
        })
        .collect();
    let total_sisa: i64 = items
        .iter()
        .map(|row| row["sisa"].as_i64().unwrap_or(0))
        .sum();
    Ok(json!({ "items": items, "total_sisa": total_sisa }))
}

// ── Pembayaran dan kuitansi (K3b) ───────────────────────────────────────────

/// Jumlah alokasi kuitansi yang TIDAK dibatalkan per tagihan. Dieja sama di
/// `services/billing.ts`; dipakai sebagai subquery, jadi baris komentarnya
/// diakhiri baris baru.
pub const DIBAYAR_SQL: &str = "SELECT a.id_tagihan, SUM(a.nominal) AS dibayar
     FROM keu_pembayaran_alokasi a
     JOIN keu_pembayaran p ON p.id_pembayaran = a.id_pembayaran
     LEFT JOIN keu_pembayaran_batal pb ON pb.id_pembayaran = p.id_pembayaran
     WHERE a.id_tagihan IS NOT NULL AND pb.id_pembayaran IS NULL
     GROUP BY a.id_tagihan
     -- batas: subquery yang di-JOIN ke tagihan, dibatasi kueri luarnya
     ";

/// Saldo Titipan Wali satu siswa: kelebihan bayar dikurangi pemakaian
/// titipan, dari kuitansi yang tidak dibatalkan. Kuitansi bermetode Titipan
/// hanya beralokasi ke tagihan, jadi alokasinya sama dengan totalnya.
pub const SALDO_TITIPAN_SQL: &str = "SELECT COALESCE(SUM(CASE
            WHEN p.metode = 'Titipan' THEN -a.nominal
            WHEN a.id_tagihan IS NULL THEN a.nominal
            ELSE 0 END), 0) AS saldo
     FROM keu_pembayaran p
     JOIN keu_pembayaran_alokasi a ON a.id_pembayaran = p.id_pembayaran
     LEFT JOIN keu_pembayaran_batal pb ON pb.id_pembayaran = p.id_pembayaran
     WHERE p.id_siswa = ? AND pb.id_pembayaran IS NULL
     -- batas: agregat, selalu satu baris
     ;";

const PEMBAYARAN_SQL: &str =
    "SELECT id_pembayaran, id_siswa, nama_siswa, tanggal, seri, nomor_urut,
        nomor, metode, id_akun_kas, total, keterangan, dibuat_oleh, created_at
        FROM keu_pembayaran WHERE id_pembayaran = ?;";

fn saldo_titipan(connection: &Connection, id_siswa: &str) -> Result<i64, CommandError> {
    connection
        .query_row(SALDO_TITIPAN_SQL, params![id_siswa], |row| row.get(0))
        .map_err(db_error)
}

/// Tagihan aktif siswa yang belum lunas, berurutan jatuh tempo.
fn tagihan_terbuka(connection: &Connection, id_siswa: &str) -> Result<Vec<Value>, CommandError> {
    let mut rows = query_json(
        connection,
        &format!(
            "SELECT t.id_tagihan, t.nama_tagihan, t.periode, t.jatuh_tempo,
                    t.nominal - t.potongan AS bersih, COALESCE(d.dibayar, 0) AS dibayar
             FROM keu_tagihan t
             LEFT JOIN keu_tagihan_batal b ON b.id_tagihan = t.id_tagihan
             LEFT JOIN ({DIBAYAR_SQL}) d ON d.id_tagihan = t.id_tagihan
             WHERE t.id_siswa = ? AND b.id_tagihan IS NULL
               AND t.nominal - t.potongan > COALESCE(d.dibayar, 0)
             ORDER BY t.jatuh_tempo, t.periode, t.id_tagihan
             LIMIT 500;"
        ),
        &[&id_siswa],
    )?;
    for row in &mut rows {
        row["sisa"] =
            json!(row["bersih"].as_i64().unwrap_or(0) - row["dibayar"].as_i64().unwrap_or(0));
    }
    Ok(rows)
}

/// Seri kuitansi perangkat ini: yang didaftarkan admin, atau seri otomatis.
fn seri_kuitansi(
    connection: &Connection,
    device_code: &str,
) -> Result<(String, bool), CommandError> {
    let terdaftar: Option<String> = connection
        .query_row(
            "SELECT seri FROM keu_seri_perangkat WHERE device_code = ?;",
            params![device_code],
            |row| row.get(0),
        )
        .optional()
        .map_err(db_error)?;
    Ok(match terdaftar {
        Some(seri) => (seri, true),
        None => (accounting::seri_perangkat(device_code), false),
    })
}

/// Akun tagihan satu siswa untuk layar Bayar: tunggakan, saldo titipan, dan
/// kuitansi terakhirnya (supaya petugas melihat tagihan yang baru saja dibayar).
pub fn account(state: &MobileState, id_siswa: &str) -> Result<Value, CommandError> {
    let connection = storage::database(&state.data_dir)?;
    let siswa = query_json(
        &connection,
        "SELECT s.id_siswa, s.nama_lengkap, COALESCE(r.nama_rombel, '') AS kelas,
                COALESCE(s.nama_wali, '') AS nama_wali, COALESCE(s.no_whatsapp_wali, '') AS no_wali
         FROM siswa_data s
         LEFT JOIN akademik_rombel r ON r.id_rombel = s.id_rombel
         WHERE s.id_siswa = ?;",
        &[&id_siswa],
    )?
    .into_iter()
    .next()
    .ok_or_else(|| invalid("Siswa tidak ditemukan."))?;
    let riwayat = query_json(
        &connection,
        "SELECT p.id_pembayaran, p.nomor, p.tanggal, p.metode, p.total,
                CASE WHEN pb.id_pembayaran IS NULL THEN 'Sah' ELSE 'Dibatalkan' END AS status,
                (SELECT GROUP_CONCAT(COALESCE(t.nama_tagihan || ' ' || t.periode, 'Titipan'), ', ')
                 FROM keu_pembayaran_alokasi a
                 LEFT JOIN keu_tagihan t ON t.id_tagihan = a.id_tagihan
                 WHERE a.id_pembayaran = p.id_pembayaran) AS rincian
         FROM keu_pembayaran p
         LEFT JOIN keu_pembayaran_batal pb ON pb.id_pembayaran = p.id_pembayaran
         WHERE p.id_siswa = ?
         ORDER BY p.tanggal DESC, p.created_at DESC, p.id_pembayaran
         LIMIT 10;",
        &[&id_siswa],
    )?;
    Ok(json!({
        "siswa": siswa,
        "tagihan": tagihan_terbuka(&connection, id_siswa)?,
        "titipan": saldo_titipan(&connection, id_siswa)?,
        "riwayat": riwayat,
    }))
}

/// Menulis satu kuitansi beserta alokasi, event outbox, dan jurnalnya di dalam
/// transaksi pemanggil. Dipakai pencatatan biasa dan "pindahkan ke titipan".
fn catat_pembayaran_tx(
    transaction: &Transaction<'_>,
    state: &MobileState,
    client_id: &str,
    operator: &str,
    valid: &PembayaranValid,
) -> Result<Value, CommandError> {
    if valid.tanggal > hari_ini(transaction)? {
        return Err(invalid("Tanggal pembayaran tidak boleh melewati hari ini."));
    }
    let nama_siswa: String = transaction
        .query_row(
            "SELECT nama_lengkap FROM siswa_data WHERE id_siswa = ?;",
            params![valid.id_siswa],
            |row| row.get(0),
        )
        .optional()
        .map_err(db_error)?
        .ok_or_else(|| invalid("Siswa tidak ditemukan."))?;
    if let Some(akun) = &valid.id_akun_kas {
        accounting::assert_akun_bayar(transaction, akun)?;
    }
    let terbuka: Vec<TagihanTerbuka> = tagihan_terbuka(transaction, &valid.id_siswa)?
        .iter()
        .filter(|row| {
            valid
                .id_tagihan
                .iter()
                .any(|id| row["id_tagihan"].as_str() == Some(id))
        })
        .map(|row| TagihanTerbuka {
            id_tagihan: row["id_tagihan"].as_str().unwrap_or("").to_owned(),
            jatuh_tempo: row["jatuh_tempo"].as_str().unwrap_or("").to_owned(),
            periode: row["periode"].as_str().unwrap_or("").to_owned(),
            sisa: row["sisa"].as_i64().unwrap_or(0),
        })
        .collect();
    let (alokasi, ke_titipan) = alokasi_pembayaran(&terbuka, valid.total);
    if valid.metode == "Titipan" {
        if ke_titipan > 0 {
            return Err(invalid(
                "Pembayaran dari titipan tidak boleh melebihi sisa tagihan yang dipilih.",
            ));
        }
        let saldo = saldo_titipan(transaction, &valid.id_siswa)?;
        if valid.total > saldo {
            return Err(invalid(format!(
                "Saldo titipan tidak cukup. Tersedia {}.",
                accounting::format_rupiah(saldo.max(0))
            )));
        }
    }

    let (seri, _) = seri_kuitansi(transaction, &license::current_device_code(state)?)?;
    let tahun: String = valid.tanggal.chars().take(4).collect();
    let nomor_urut: i64 = transaction
        .query_row(
            "SELECT COALESCE(MAX(nomor_urut), 0) + 1 FROM keu_pembayaran
             WHERE seri = ? AND substr(tanggal, 1, 4) = ?
             -- batas: agregat, selalu satu baris
             ;",
            params![seri, tahun],
            |row| row.get(0),
        )
        .map_err(db_error)?;
    let nomor = format_nomor_kuitansi(&tahun, &seri, nomor_urut);
    let id = new_id("kwt-");
    transaction
        .execute(
            "INSERT INTO keu_pembayaran (
                id_pembayaran, id_siswa, nama_siswa, tanggal, seri, nomor_urut, nomor, metode,
                id_akun_kas, total, keterangan, dibuat_oleh, created_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'));",
            params![
                id,
                valid.id_siswa,
                nama_siswa,
                valid.tanggal,
                seri,
                nomor_urut,
                nomor,
                valid.metode,
                valid.id_akun_kas,
                valid.total,
                valid.keterangan,
                operator
            ],
        )
        .map_err(db_error)?;
    let mut baris_alokasi: Vec<(Option<String>, i64)> = alokasi
        .iter()
        .map(|(id_tagihan, nominal)| (Some(id_tagihan.clone()), *nominal))
        .collect();
    if ke_titipan > 0 {
        baris_alokasi.push((None, ke_titipan));
    }
    for (indeks, (id_tagihan, nominal)) in baris_alokasi.iter().enumerate() {
        transaction
            .execute(
                "INSERT INTO keu_pembayaran_alokasi (id_alokasi, id_pembayaran, id_tagihan, nominal)
                 VALUES (?, ?, ?, ?);",
                params![id_alokasi(&id, indeks + 1), id, id_tagihan, nominal],
            )
            .map_err(db_error)?;
    }
    let payload = json!({
        "pembayaran": satu_json(transaction, PEMBAYARAN_SQL, &id)?,
        "alokasi": query_json(
            transaction,
            "SELECT id_alokasi, id_pembayaran, id_tagihan, nominal FROM keu_pembayaran_alokasi
             WHERE id_pembayaran = ? ORDER BY id_alokasi LIMIT 200;",
            &[&id],
        )?,
    });
    sync::enqueue(
        transaction,
        client_id,
        "billing-payment",
        "create",
        &id,
        &payload,
        None,
    )?;

    let ke_tagihan: i64 = alokasi.iter().map(|(_, nominal)| nominal).sum();
    let id_jurnal = id_jurnal_pembayaran(&id);
    let baris: Vec<BarisTulis> = baris_jurnal_pembayaran(
        &valid.metode,
        valid.id_akun_kas.as_deref(),
        ke_tagihan,
        ke_titipan,
    )
    .into_iter()
    .enumerate()
    .map(|(indeks, (id_akun, debit, kredit))| BarisTulis {
        id_baris: format!("{id_jurnal}-{}", indeks + 1),
        id_akun,
        debit,
        kredit,
        keterangan: None,
        urutan: indeks as i64 + 1,
    })
    .collect();
    accounting::tulis_jurnal_tx(
        transaction,
        state,
        client_id,
        HeaderTulis {
            id_jurnal,
            tanggal: valid.tanggal.clone(),
            keterangan: format!("Kuitansi {nomor} {nama_siswa}"),
            sumber: "Pembayaran",
            id_sumber: Some(id.clone()),
            id_jurnal_batal: None,
            dibuat_oleh: operator.to_owned(),
        },
        &baris,
    )?;
    Ok(json!({
        "sukses": true,
        "id_pembayaran": id,
        "nomor": nomor,
        "ke_titipan": ke_titipan,
    }))
}

pub fn pay(state: &MobileState, operator: &str, draft: Value) -> Result<Value, CommandError> {
    let draft: PembayaranDraft =
        serde_json::from_value(draft).map_err(|_| invalid("Data pembayaran tidak valid."))?;
    let valid = validate_pembayaran(&draft).map_err(invalid)?;
    let client_id = sync::ensure_client_id(state)?;
    let mut connection = storage::database(&state.data_dir)?;
    let transaction = connection.transaction().map_err(db_error)?;
    let hasil = catat_pembayaran_tx(&transaction, state, &client_id, operator, &valid)?;
    transaction.commit().map_err(db_error)?;
    Ok(hasil)
}

fn validasi_alasan_batal(alasan: &str) -> Result<&str, CommandError> {
    let alasan = alasan.trim();
    if alasan.is_empty() {
        return Err(invalid("Alasan pembatalan wajib diisi."));
    }
    if panjang(alasan) > MAKS_ALASAN_BATAL_TAGIHAN {
        return Err(invalid("Alasan pembatalan maksimal 150 karakter."));
    }
    Ok(alasan)
}

/// Membatalkan satu kuitansi di dalam transaksi pemanggil; nomornya tetap
/// terpakai. Mengembalikan baris kuitansinya.
fn batal_pembayaran_tx(
    transaction: &Transaction<'_>,
    state: &MobileState,
    client_id: &str,
    operator: &str,
    id: &str,
    alasan: &str,
) -> Result<Value, CommandError> {
    let asal = query_json(transaction, PEMBAYARAN_SQL, &[&id])?
        .into_iter()
        .next()
        .ok_or_else(|| invalid("Kuitansi tidak ditemukan."))?;
    let ditulis = transaction
        .execute(
            "INSERT OR IGNORE INTO keu_pembayaran_batal (id_pembayaran, alasan, dibatalkan_oleh, created_at)
             VALUES (?, ?, ?, datetime('now'));",
            params![id, alasan, operator],
        )
        .map_err(db_error)?;
    if ditulis == 0 {
        return Err(invalid("Kuitansi ini sudah dibatalkan."));
    }
    accounting::balik_jurnal_tx(
        transaction,
        state,
        client_id,
        &id_jurnal_pembayaran(id),
        format!(
            "Pembatalan {} {}: {alasan}",
            asal["nomor"].as_str().unwrap_or(""),
            asal["nama_siswa"].as_str().unwrap_or("")
        ),
        operator,
    )?;
    let payload = satu_json(
        transaction,
        "SELECT id_pembayaran, alasan, dibatalkan_oleh, created_at FROM keu_pembayaran_batal WHERE id_pembayaran = ?;",
        id,
    )?;
    sync::enqueue(
        transaction,
        client_id,
        "billing-payment-cancel",
        "create",
        id,
        &payload,
        None,
    )?;
    Ok(asal)
}

pub fn cancel_payment(
    state: &MobileState,
    operator: &str,
    id: &str,
    alasan: &str,
) -> Result<Value, CommandError> {
    let alasan = validasi_alasan_batal(alasan)?;
    let client_id = sync::ensure_client_id(state)?;
    let mut connection = storage::database(&state.data_dir)?;
    let transaction = connection.transaction().map_err(db_error)?;
    batal_pembayaran_tx(&transaction, state, &client_id, operator, id, alasan)?;
    transaction.commit().map_err(db_error)?;
    Ok(json!({ "sukses": true }))
}

/// Kuitansi yang salah alokasi (mis. tagihan yang sudah dibayar di perangkat
/// lain) dibatalkan dan diganti kuitansi baru bernilai sama yang seluruhnya
/// masuk Titipan Wali, dalam SATU transaksi. Alokasi tidak pernah diubah.
pub fn move_to_deposit(
    state: &MobileState,
    operator: &str,
    id: &str,
    alasan: &str,
) -> Result<Value, CommandError> {
    let alasan = validasi_alasan_batal(alasan)?;
    let client_id = sync::ensure_client_id(state)?;
    let mut connection = storage::database(&state.data_dir)?;
    let transaction = connection.transaction().map_err(db_error)?;
    let metode: Option<String> = transaction
        .query_row(
            "SELECT metode FROM keu_pembayaran WHERE id_pembayaran = ?;",
            params![id],
            |row| row.get(0),
        )
        .optional()
        .map_err(db_error)?;
    if metode.as_deref() == Some("Titipan") {
        return Err(invalid(
            "Kuitansi dari titipan cukup dibatalkan; saldonya kembali dengan sendirinya.",
        ));
    }
    let asal = batal_pembayaran_tx(&transaction, state, &client_id, operator, id, alasan)?;
    let pengganti = PembayaranValid {
        id_siswa: asal["id_siswa"].as_str().unwrap_or("").to_owned(),
        tanggal: asal["tanggal"].as_str().unwrap_or("").to_owned(),
        metode: asal["metode"].as_str().unwrap_or("").to_owned(),
        total: asal["total"].as_i64().unwrap_or(0),
        id_akun_kas: asal["id_akun_kas"].as_str().map(str::to_owned),
        keterangan: Some(format!(
            "Pengganti {}",
            asal["nomor"].as_str().unwrap_or("")
        )),
        id_tagihan: Vec::new(),
    };
    let hasil = catat_pembayaran_tx(&transaction, state, &client_id, operator, &pengganti)?;
    transaction.commit().map_err(db_error)?;
    Ok(hasil)
}

/// Daftar kuitansi per rentang tanggal (dan seri). `nomor_ganda` menandai
/// nomor yang sama dari dua perangkat yang diberi seri sama saat offline.
pub fn payments(
    state: &MobileState,
    dari: &str,
    sampai: &str,
    seri: Option<&str>,
) -> Result<Value, CommandError> {
    if !super::inventory::is_valid_date(dari)
        || !super::inventory::is_valid_date(sampai)
        || dari > sampai
    {
        return Err(invalid("Rentang tanggal tidak valid."));
    }
    let connection = storage::database(&state.data_dir)?;
    let mut sql = String::from(
        "SELECT p.id_pembayaran, p.nomor, p.seri, p.tanggal, p.id_siswa, p.nama_siswa,
                COALESCE(r.nama_rombel, '') AS kelas, p.metode, p.total, p.dibuat_oleh,
                pb.alasan AS alasan_batal,
                CASE WHEN pb.id_pembayaran IS NULL THEN 'Sah' ELSE 'Dibatalkan' END AS status
         FROM keu_pembayaran p
         LEFT JOIN keu_pembayaran_batal pb ON pb.id_pembayaran = p.id_pembayaran
         LEFT JOIN siswa_data s ON s.id_siswa = p.id_siswa
         LEFT JOIN akademik_rombel r ON r.id_rombel = s.id_rombel
         WHERE p.tanggal >= ? AND p.tanggal <= ?",
    );
    let mut args: Vec<String> = vec![dari.to_owned(), sampai.to_owned()];
    if let Some(seri) = seri.map(str::trim).filter(|s| !s.is_empty()) {
        sql.push_str(" AND p.seri = ?");
        args.push(seri.to_owned());
    }
    // `LIMIT 1000` = `BATAS_DAFTAR_KUITANSI` di `validations/billing.ts`.
    sql.push_str(" ORDER BY p.tanggal DESC, p.nomor DESC, p.id_pembayaran LIMIT 1000;");
    let params: Vec<&dyn rusqlite::ToSql> =
        args.iter().map(|a| a as &dyn rusqlite::ToSql).collect();
    let mut items = query_json(&connection, &sql, &params)?;
    let mut jumlah: HashMap<String, usize> = HashMap::new();
    for row in &items {
        *jumlah
            .entry(row["nomor"].as_str().unwrap_or("").to_owned())
            .or_default() += 1;
    }
    for row in &mut items {
        let ganda = jumlah
            .get(row["nomor"].as_str().unwrap_or(""))
            .is_some_and(|n| *n > 1);
        row["nomor_ganda"] = json!(ganda);
    }
    let total_sah: i64 = items
        .iter()
        .filter(|row| row["status"] == "Sah")
        .map(|row| row["total"].as_i64().unwrap_or(0))
        .sum();
    Ok(json!({ "items": items, "total_sah": total_sah }))
}

/// Isi satu kuitansi untuk dicetak atau dikirim ke wali. Kop sekolah ikut di
/// sini, dengan izin tagihan, karena membaca profil sekolah menuntut
/// `settings.manage`.
pub fn payment_detail(state: &MobileState, id: &str) -> Result<Value, CommandError> {
    let connection = storage::database(&state.data_dir)?;
    let pembayaran = query_json(
        &connection,
        "SELECT p.id_pembayaran, p.id_siswa, p.nama_siswa, p.tanggal, p.seri, p.nomor, p.metode,
                p.id_akun_kas, COALESCE(k.nama, '') AS nama_akun, p.total, p.keterangan,
                p.dibuat_oleh, p.created_at, COALESCE(r.nama_rombel, '') AS kelas,
                COALESCE(s.nama_wali, '') AS nama_wali, COALESCE(s.no_whatsapp_wali, '') AS no_wali,
                pb.alasan AS alasan_batal,
                CASE WHEN pb.id_pembayaran IS NULL THEN 'Sah' ELSE 'Dibatalkan' END AS status
         FROM keu_pembayaran p
         LEFT JOIN keu_pembayaran_batal pb ON pb.id_pembayaran = p.id_pembayaran
         LEFT JOIN keu_akun k ON k.id_akun = p.id_akun_kas
         LEFT JOIN siswa_data s ON s.id_siswa = p.id_siswa
         LEFT JOIN akademik_rombel r ON r.id_rombel = s.id_rombel
         WHERE p.id_pembayaran = ?;",
        &[&id],
    )?
    .into_iter()
    .next()
    .ok_or_else(|| invalid("Kuitansi tidak ditemukan."))?;
    let alokasi = query_json(
        &connection,
        "SELECT a.id_alokasi, a.id_tagihan, t.nama_tagihan, t.periode, a.nominal
         FROM keu_pembayaran_alokasi a
         LEFT JOIN keu_tagihan t ON t.id_tagihan = a.id_tagihan
         WHERE a.id_pembayaran = ?
         ORDER BY a.id_alokasi
         LIMIT 200;",
        &[&id],
    )?;
    let id_siswa = pembayaran["id_siswa"].as_str().unwrap_or("").to_owned();
    Ok(json!({
        "pembayaran": pembayaran,
        "alokasi": alokasi,
        "saldo_titipan": saldo_titipan(&connection, &id_siswa)?,
        "kop": super::inventory::kop_sekolah(&connection)?,
    }))
}

/// Kuitansi yang perlu ditinjau setelah sinkronisasi: tagihan lebih bayar,
/// kuitansi kembar dari perangkat berbeda, dan saldo titipan minus.
pub fn review(state: &MobileState) -> Result<Value, CommandError> {
    let connection = storage::database(&state.data_dir)?;
    let mut lebih_bayar = query_json(
        &connection,
        &format!(
            "SELECT t.id_tagihan, t.id_siswa, t.nama_siswa, t.nama_tagihan, t.periode,
                    CASE WHEN b.id_tagihan IS NULL THEN t.nominal - t.potongan ELSE 0 END AS bersih,
                    d.dibayar, CASE WHEN b.id_tagihan IS NULL THEN 0 ELSE 1 END AS dibatalkan
             FROM ({DIBAYAR_SQL}) d
             JOIN keu_tagihan t ON t.id_tagihan = d.id_tagihan
             LEFT JOIN keu_tagihan_batal b ON b.id_tagihan = t.id_tagihan
             WHERE d.dibayar > CASE WHEN b.id_tagihan IS NULL THEN t.nominal - t.potongan ELSE 0 END
             ORDER BY t.nama_siswa, t.periode, t.id_tagihan
             LIMIT 500;"
        ),
        &[],
    )?;
    for row in &mut lebih_bayar {
        let id_tagihan = row["id_tagihan"].as_str().unwrap_or("").to_owned();
        row["kuitansi"] = json!(query_json(
            &connection,
            "SELECT p.id_pembayaran, p.nomor, p.tanggal, p.metode, p.seri, a.nominal
             FROM keu_pembayaran_alokasi a
             JOIN keu_pembayaran p ON p.id_pembayaran = a.id_pembayaran
             LEFT JOIN keu_pembayaran_batal pb ON pb.id_pembayaran = p.id_pembayaran
             WHERE a.id_tagihan = ? AND pb.id_pembayaran IS NULL
             ORDER BY p.tanggal, p.nomor
             LIMIT 20;",
            &[&id_tagihan],
        )?);
    }
    let kemungkinan_ganda = query_json(
        &connection,
        "SELECT p.id_pembayaran, p.nomor, p.seri, p.tanggal, p.id_siswa, p.nama_siswa, p.total, p.metode
         FROM keu_pembayaran p
         LEFT JOIN keu_pembayaran_batal pb ON pb.id_pembayaran = p.id_pembayaran
         WHERE pb.id_pembayaran IS NULL
           AND EXISTS (
             SELECT 1 FROM keu_pembayaran q
             LEFT JOIN keu_pembayaran_batal qb ON qb.id_pembayaran = q.id_pembayaran
             WHERE qb.id_pembayaran IS NULL AND q.id_pembayaran <> p.id_pembayaran
               AND q.id_siswa = p.id_siswa AND q.tanggal = p.tanggal
               AND q.total = p.total AND q.seri <> p.seri
           )
         ORDER BY p.nama_siswa, p.tanggal, p.total, p.nomor
         LIMIT 500;",
        &[],
    )?;
    let titipan_minus = query_json(
        &connection,
        "SELECT p.id_siswa, MAX(p.nama_siswa) AS nama_siswa,
                SUM(CASE WHEN p.metode = 'Titipan' THEN -a.nominal
                         WHEN a.id_tagihan IS NULL THEN a.nominal ELSE 0 END) AS saldo
         FROM keu_pembayaran p
         JOIN keu_pembayaran_alokasi a ON a.id_pembayaran = p.id_pembayaran
         LEFT JOIN keu_pembayaran_batal pb ON pb.id_pembayaran = p.id_pembayaran
         WHERE pb.id_pembayaran IS NULL
         GROUP BY p.id_siswa
         HAVING saldo < 0
         ORDER BY nama_siswa, p.id_siswa
         LIMIT 500;",
        &[],
    )?;
    Ok(json!({
        "lebih_bayar": lebih_bayar,
        "kemungkinan_ganda": kemungkinan_ganda,
        "titipan_minus": titipan_minus,
    }))
}

/// Seri kuitansi: perangkat ini dan seluruh seri yang terdaftar.
pub fn series(state: &MobileState) -> Result<Value, CommandError> {
    let connection = storage::database(&state.data_dir)?;
    let device_code = license::current_device_code(state)?;
    let (seri, terdaftar) = seri_kuitansi(&connection, &device_code)?;
    let items = query_json(
        &connection,
        "SELECT device_code, seri, nama_perangkat, updated_at FROM keu_seri_perangkat
         ORDER BY seri, device_code LIMIT 500;",
        &[],
    )?;
    Ok(json!({
        "device_code": device_code,
        "seri_aktif": seri,
        "terdaftar": terdaftar,
        "items": items,
    }))
}

pub fn save_series(
    state: &MobileState,
    device_code: &str,
    seri: &str,
    nama_perangkat: &str,
) -> Result<Value, CommandError> {
    let device_code = device_code.trim();
    if device_code.is_empty() || panjang(device_code) > 100 {
        return Err(invalid("Kode perangkat wajib diisi."));
    }
    let seri = validate_seri(seri).map_err(invalid)?;
    let nama = nama_perangkat.trim();
    if panjang(nama) > MAKS_NAMA_PERANGKAT {
        return Err(invalid("Nama perangkat maksimal 60 karakter."));
    }
    let client_id = sync::ensure_client_id(state)?;
    let mut connection = storage::database(&state.data_dir)?;
    let transaction = connection.transaction().map_err(db_error)?;
    let dipakai: bool = transaction
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM keu_seri_perangkat WHERE UPPER(seri) = ? AND device_code <> ?);",
            params![seri, device_code],
            |row| row.get(0),
        )
        .map_err(db_error)?;
    if dipakai {
        return Err(invalid("Seri ini sudah dipakai perangkat lain."));
    }
    transaction
        .execute(
            "INSERT INTO keu_seri_perangkat (device_code, seri, nama_perangkat, created_at, updated_at)
             VALUES (?, ?, ?, datetime('now'), datetime('now'))
             ON CONFLICT(device_code) DO UPDATE SET
                seri = excluded.seri,
                nama_perangkat = excluded.nama_perangkat,
                updated_at = excluded.updated_at;",
            params![device_code, seri, nama],
        )
        .map_err(db_error)?;
    let payload = satu_json(
        &transaction,
        "SELECT device_code, seri, nama_perangkat, created_at, updated_at FROM keu_seri_perangkat WHERE device_code = ?;",
        device_code,
    )?;
    sync::enqueue(
        &transaction,
        &client_id,
        "billing-series",
        "save",
        device_code,
        &payload,
        None,
    )?;
    transaction.commit().map_err(db_error)?;
    Ok(json!({ "sukses": true, "seri": seri }))
}

// ── Penerapan event di cloud ────────────────────────────────────────────────

fn payload_text(row: &Value, key: &str) -> Option<String> {
    row.get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(str::to_owned)
}

pub const CLOUD_UPSERT_TYPE_SQL: &str = "INSERT INTO keu_jenis_tagihan (
        id_jenis_tagihan, nama, periodik, nominal_bawaan, id_akun_pendapatan, is_aktif,
        created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')), COALESCE(?, datetime('now')))
    ON CONFLICT(id_jenis_tagihan) DO UPDATE SET
        nama = excluded.nama,
        periodik = excluded.periodik,
        nominal_bawaan = excluded.nominal_bawaan,
        id_akun_pendapatan = excluded.id_akun_pendapatan,
        is_aktif = excluded.is_aktif,
        updated_at = excluded.updated_at;";

pub fn cloud_type_values(row: &Value, entity_key: &str) -> Option<Vec<Value>> {
    let id = payload_text(row, "id_jenis_tagihan").unwrap_or_else(|| entity_key.trim().to_owned());
    let periodik = payload_text(row, "periodik").filter(|v| PERIODIK.contains(&v.as_str()))?;
    let nominal = row
        .get("nominal_bawaan")
        .and_then(Value::as_i64)
        .filter(|v| *v >= 0)?;
    if id.is_empty() {
        return None;
    }
    Some(vec![
        json!(id),
        json!(payload_text(row, "nama")?),
        json!(periodik),
        json!(nominal),
        json!(payload_text(row, "id_akun_pendapatan")?),
        json!(if row.get("is_aktif").and_then(Value::as_i64) == Some(0) {
            0
        } else {
            1
        }),
        json!(payload_text(row, "created_at")),
        json!(payload_text(row, "updated_at")),
    ])
}

pub const CLOUD_UPSERT_RATE_SQL: &str = "INSERT INTO keu_tarif_tagihan (
        id_tarif, id_jenis_tagihan, nama_unit, tingkat, nominal, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, COALESCE(?, datetime('now')), COALESCE(?, datetime('now')))
    ON CONFLICT(id_tarif) DO UPDATE SET
        id_jenis_tagihan = excluded.id_jenis_tagihan,
        nama_unit = excluded.nama_unit,
        tingkat = excluded.tingkat,
        nominal = excluded.nominal,
        updated_at = excluded.updated_at;";

pub fn cloud_rate_values(row: &Value, entity_key: &str) -> Option<Vec<Value>> {
    let id = payload_text(row, "id_tarif").unwrap_or_else(|| entity_key.trim().to_owned());
    let nominal = row
        .get("nominal")
        .and_then(Value::as_i64)
        .filter(|v| *v >= 0)?;
    if id.is_empty() {
        return None;
    }
    Some(vec![
        json!(id),
        json!(payload_text(row, "id_jenis_tagihan")?),
        json!(row
            .get("nama_unit")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim()),
        json!(row.get("tingkat").and_then(Value::as_i64)),
        json!(nominal),
        json!(payload_text(row, "created_at")),
        json!(payload_text(row, "updated_at")),
    ])
}

pub const CLOUD_UPSERT_DISCOUNT_SQL: &str = "INSERT INTO keu_keringanan (
        id_keringanan, id_siswa, id_jenis_tagihan, jenis, nilai, periode_mulai, periode_selesai,
        alasan, is_aktif, dibuat_oleh, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')), COALESCE(?, datetime('now')))
    ON CONFLICT(id_keringanan) DO UPDATE SET
        id_siswa = excluded.id_siswa,
        id_jenis_tagihan = excluded.id_jenis_tagihan,
        jenis = excluded.jenis,
        nilai = excluded.nilai,
        periode_mulai = excluded.periode_mulai,
        periode_selesai = excluded.periode_selesai,
        alasan = excluded.alasan,
        is_aktif = excluded.is_aktif,
        updated_at = excluded.updated_at;";

pub fn cloud_discount_values(row: &Value, entity_key: &str) -> Option<Vec<Value>> {
    let id = payload_text(row, "id_keringanan").unwrap_or_else(|| entity_key.trim().to_owned());
    let jenis = payload_text(row, "jenis").filter(|v| JENIS_KERINGANAN.contains(&v.as_str()))?;
    let nilai = row
        .get("nilai")
        .and_then(Value::as_i64)
        .filter(|v| *v > 0)?;
    if id.is_empty() {
        return None;
    }
    Some(vec![
        json!(id),
        json!(payload_text(row, "id_siswa")?),
        json!(payload_text(row, "id_jenis_tagihan")?),
        json!(jenis),
        json!(nilai),
        json!(payload_text(row, "periode_mulai")),
        json!(payload_text(row, "periode_selesai")),
        json!(payload_text(row, "alasan")),
        json!(if row.get("is_aktif").and_then(Value::as_i64) == Some(0) {
            0
        } else {
            1
        }),
        json!(payload_text(row, "dibuat_oleh")?),
        json!(payload_text(row, "created_at")),
        json!(payload_text(row, "updated_at")),
    ])
}

pub const CLOUD_INSERT_BILL_SQL: &str = "INSERT INTO keu_tagihan (
        id_tagihan, id_siswa, nama_siswa, id_jenis_tagihan, nama_tagihan, periode, nominal,
        potongan, jatuh_tempo, dibuat_oleh, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))
    ON CONFLICT(id_tagihan) DO NOTHING;";

pub fn cloud_bill_values(row: &Value, entity_key: &str) -> Option<Vec<Value>> {
    let id = payload_text(row, "id_tagihan").unwrap_or_else(|| entity_key.trim().to_owned());
    let nominal = row
        .get("nominal")
        .and_then(Value::as_i64)
        .filter(|v| *v >= 0)?;
    let potongan = row
        .get("potongan")
        .and_then(Value::as_i64)
        .filter(|v| *v >= 0 && *v <= nominal)?;
    if id.is_empty() {
        return None;
    }
    Some(vec![
        json!(id),
        json!(payload_text(row, "id_siswa")?),
        json!(payload_text(row, "nama_siswa")?),
        json!(payload_text(row, "id_jenis_tagihan")?),
        json!(payload_text(row, "nama_tagihan")?),
        json!(payload_text(row, "periode")?),
        json!(nominal),
        json!(potongan),
        json!(payload_text(row, "jatuh_tempo")?),
        json!(payload_text(row, "dibuat_oleh")?),
        json!(payload_text(row, "created_at")),
    ])
}

pub const CLOUD_INSERT_BILL_CANCEL_SQL: &str = "INSERT INTO keu_tagihan_batal (
        id_tagihan, alasan, dibatalkan_oleh, created_at
    ) VALUES (?, ?, ?, COALESCE(?, datetime('now')))
    ON CONFLICT(id_tagihan) DO NOTHING;";

pub fn cloud_bill_cancel_values(row: &Value, entity_key: &str) -> Option<Vec<Value>> {
    let id = payload_text(row, "id_tagihan").unwrap_or_else(|| entity_key.trim().to_owned());
    if id.is_empty() {
        return None;
    }
    Some(vec![
        json!(id),
        json!(payload_text(row, "alasan")?),
        json!(payload_text(row, "dibatalkan_oleh")?),
        json!(payload_text(row, "created_at")),
    ])
}

pub const CLOUD_UPSERT_SERIES_SQL: &str = "INSERT INTO keu_seri_perangkat (
        device_code, seri, nama_perangkat, created_at, updated_at
    ) VALUES (?, ?, ?, COALESCE(?, datetime('now')), COALESCE(?, datetime('now')))
    ON CONFLICT(device_code) DO UPDATE SET
        seri = excluded.seri,
        nama_perangkat = excluded.nama_perangkat,
        updated_at = excluded.updated_at;";

pub fn cloud_series_values(row: &Value, entity_key: &str) -> Option<Vec<Value>> {
    let device_code =
        payload_text(row, "device_code").unwrap_or_else(|| entity_key.trim().to_owned());
    let seri = validate_seri(&payload_text(row, "seri")?).ok()?;
    if device_code.is_empty() {
        return None;
    }
    Some(vec![
        json!(device_code),
        json!(seri),
        json!(row
            .get("nama_perangkat")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim()),
        json!(payload_text(row, "created_at")),
        json!(payload_text(row, "updated_at")),
    ])
}

pub const CLOUD_INSERT_PAYMENT_SQL: &str = "INSERT INTO keu_pembayaran (
        id_pembayaran, id_siswa, nama_siswa, tanggal, seri, nomor_urut, nomor, metode,
        id_akun_kas, total, keterangan, dibuat_oleh, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))
    ON CONFLICT(id_pembayaran) DO NOTHING;";

pub const CLOUD_INSERT_ALLOCATION_SQL: &str = "INSERT INTO keu_pembayaran_alokasi (
        id_alokasi, id_pembayaran, id_tagihan, nominal
    ) VALUES (?, ?, ?, ?)
    ON CONFLICT(id_alokasi) DO NOTHING;";

/// Statement kuitansi + seluruh alokasi dari payload `billing-payment/create`.
/// Semua-atau-tidak-sama-sekali, seperti jurnal: satu alokasi cacat atau
/// jumlah alokasi yang tidak sama dengan total membuat SELURUH event dilewati.
pub fn cloud_payment_statements(
    payload: &Value,
    entity_key: &str,
) -> Option<Vec<(&'static str, Vec<Value>)>> {
    let kuitansi = payload.get("pembayaran")?;
    let id =
        payload_text(kuitansi, "id_pembayaran").unwrap_or_else(|| entity_key.trim().to_owned());
    let tanggal =
        payload_text(kuitansi, "tanggal").filter(|value| super::inventory::is_valid_date(value))?;
    let metode =
        payload_text(kuitansi, "metode").filter(|value| METODE_BAYAR.contains(&value.as_str()))?;
    let nomor_urut = kuitansi
        .get("nomor_urut")
        .and_then(Value::as_i64)
        .filter(|value| *value > 0)?;
    let total = kuitansi
        .get("total")
        .and_then(Value::as_i64)
        .filter(|value| *value > 0)?;
    if id.is_empty() {
        return None;
    }
    let alokasi = payload.get("alokasi")?.as_array()?;
    if alokasi.is_empty() || alokasi.len() > MAKS_TAGIHAN_PER_KUITANSI + 1 {
        return None;
    }
    let mut statements = vec![(
        CLOUD_INSERT_PAYMENT_SQL,
        vec![
            json!(id),
            json!(payload_text(kuitansi, "id_siswa")?),
            json!(payload_text(kuitansi, "nama_siswa")?),
            json!(tanggal),
            json!(payload_text(kuitansi, "seri")?),
            json!(nomor_urut),
            json!(payload_text(kuitansi, "nomor")?),
            json!(metode),
            json!(payload_text(kuitansi, "id_akun_kas")),
            json!(total),
            json!(payload_text(kuitansi, "keterangan")),
            json!(payload_text(kuitansi, "dibuat_oleh")?),
            json!(payload_text(kuitansi, "created_at")),
        ],
    )];
    let mut jumlah = 0i64;
    for item in alokasi {
        let nominal = item
            .get("nominal")
            .and_then(Value::as_i64)
            .filter(|value| *value > 0)?;
        jumlah += nominal;
        statements.push((
            CLOUD_INSERT_ALLOCATION_SQL,
            vec![
                json!(payload_text(item, "id_alokasi")?),
                json!(id),
                json!(payload_text(item, "id_tagihan")),
                json!(nominal),
            ],
        ));
    }
    if jumlah != total {
        return None;
    }
    Some(statements)
}

pub const CLOUD_INSERT_PAYMENT_CANCEL_SQL: &str = "INSERT INTO keu_pembayaran_batal (
        id_pembayaran, alasan, dibatalkan_oleh, created_at
    ) VALUES (?, ?, ?, COALESCE(?, datetime('now')))
    ON CONFLICT(id_pembayaran) DO NOTHING;";

pub fn cloud_payment_cancel_values(row: &Value, entity_key: &str) -> Option<Vec<Value>> {
    let id = payload_text(row, "id_pembayaran").unwrap_or_else(|| entity_key.trim().to_owned());
    if id.is_empty() {
        return None;
    }
    Some(vec![
        json!(id),
        json!(payload_text(row, "alasan")?),
        json!(payload_text(row, "dibatalkan_oleh")?),
        json!(payload_text(row, "created_at")),
    ])
}

#[cfg(test)]
mod tests {
    use super::*;

    // Vektor kembar `src/lib/validations/billing.test.ts`.

    #[test]
    fn periode_dan_id() {
        assert_eq!(
            validate_periode_tagihan("Bulanan", "2026-07"),
            Ok("2026-07".into())
        );
        assert_eq!(
            validate_periode_tagihan("Bulanan", "2026-7"),
            Err("Periode bulanan harus berbentuk YYYY-MM.".into())
        );
        assert_eq!(
            validate_periode_tagihan("Tahunan", " 2026/2027 "),
            Ok("2026/2027".into())
        );
        assert_eq!(
            validate_periode_tagihan("Tahunan", ""),
            Err("Tahun ajaran wajib dipilih.".into())
        );
        assert_eq!(
            validate_periode_tagihan("Sekali", "apa saja"),
            Ok("SEKALI".into())
        );
        assert_eq!(
            validate_periode_tagihan("Mingguan", "x"),
            Err("Jenis periode tagihan tidak dikenal.".into())
        );
        assert_eq!(id_tagihan("spp", "S-01", "2026-07"), "tgh-spp-S-01-2026-07");
    }

    fn jenis(ubah: Value) -> JenisTagihanDraft {
        let mut dasar = json!({
            "nama": " SPP ",
            "periodik": "Bulanan",
            "nominal_bawaan": 300_000,
            "id_akun_pendapatan": "akun-pendapatan-spp"
        });
        for (k, v) in ubah.as_object().expect("objek") {
            dasar[k] = v.clone();
        }
        serde_json::from_value(dasar).expect("draft")
    }

    #[test]
    fn validasi_jenis() {
        assert_eq!(
            validate_jenis_tagihan(&jenis(json!({}))),
            Ok(JenisTagihanValid {
                nama: "SPP".into(),
                periodik: "Bulanan".into(),
                nominal_bawaan: 300_000,
                id_akun_pendapatan: "akun-pendapatan-spp".into(),
                is_aktif: true,
            })
        );
        let galat = |u: Value| validate_jenis_tagihan(&jenis(u)).err();
        assert_eq!(
            galat(json!({ "nama": " " })).as_deref(),
            Some("Nama tagihan wajib diisi.")
        );
        assert_eq!(
            galat(json!({ "periodik": "Mingguan" })).as_deref(),
            Some("Jenis periode tagihan tidak dikenal.")
        );
        assert_eq!(
            galat(json!({ "nominal_bawaan": -1 })).as_deref(),
            Some("Nominal harus rupiah bulat dan tidak negatif.")
        );
        assert_eq!(
            galat(json!({ "nominal_bawaan": 100_000_001 })).as_deref(),
            Some("Nominal maksimal Rp100.000.000.")
        );
        assert_eq!(
            galat(json!({ "id_akun_pendapatan": "" })).as_deref(),
            Some("Akun pendapatan wajib dipilih.")
        );
    }

    fn tarif(ubah: Value) -> TarifDraft {
        let mut dasar = json!({
            "id_jenis_tagihan": "spp", "nama_unit": " SMP ", "tingkat": 7, "nominal": 500_000
        });
        for (k, v) in ubah.as_object().expect("objek") {
            dasar[k] = v.clone();
        }
        serde_json::from_value(dasar).expect("draft")
    }

    #[test]
    fn validasi_dan_pilihan_tarif() {
        assert_eq!(
            validate_tarif(&tarif(json!({}))),
            Ok(TarifValid {
                id_jenis_tagihan: "spp".into(),
                nama_unit: "SMP".into(),
                tingkat: Some(7),
                nominal: 500_000,
            })
        );
        let galat = |u: Value| validate_tarif(&tarif(u)).err();
        assert_eq!(
            galat(json!({ "nama_unit": "", "tingkat": null })).as_deref(),
            Some("Pilih unit atau tingkat. Tarif untuk semua siswa diatur di nominal bawaan.")
        );
        assert_eq!(
            galat(json!({ "tingkat": 0 })).as_deref(),
            Some("Tingkat harus bilangan 1 sampai 20.")
        );
        assert_eq!(
            galat(json!({ "tingkat": 1.5 })).as_deref(),
            Some("Tingkat harus bilangan 1 sampai 20.")
        );

        let daftar = vec![
            TarifBerlaku {
                nama_unit: "SMP".into(),
                tingkat: Some(7),
                nominal: 500_000,
            },
            TarifBerlaku {
                nama_unit: "smp ".into(),
                tingkat: None,
                nominal: 450_000,
            },
            TarifBerlaku {
                nama_unit: "".into(),
                tingkat: Some(7),
                nominal: 400_000,
            },
        ];
        assert_eq!(pilih_tarif(&daftar, 300_000, Some("SMP"), Some(7)), 500_000);
        assert_eq!(pilih_tarif(&daftar, 300_000, Some("SMP"), Some(8)), 450_000);
        assert_eq!(pilih_tarif(&daftar, 300_000, Some("SD"), Some(7)), 400_000);
        assert_eq!(pilih_tarif(&daftar, 300_000, Some("SD"), Some(1)), 300_000);
        assert_eq!(pilih_tarif(&daftar, 300_000, None, Some(7)), 400_000);
        assert_eq!(
            pilih_tarif(&daftar, 300_000, Some(" Smp "), Some(9)),
            450_000
        );
    }

    fn keringanan(ubah: Value) -> KeringananDraft {
        let mut dasar = json!({
            "id_siswa": "S-01", "id_jenis_tagihan": "spp", "jenis": "Persen", "nilai": 50,
            "periode_mulai": "2026-07", "periode_selesai": "2026-12", "alasan": " Beasiswa "
        });
        for (k, v) in ubah.as_object().expect("objek") {
            dasar[k] = v.clone();
        }
        serde_json::from_value(dasar).expect("draft")
    }

    #[test]
    fn validasi_dan_hitungan_keringanan() {
        assert_eq!(
            validate_keringanan(&keringanan(json!({}))),
            Ok(KeringananValid {
                id_siswa: "S-01".into(),
                id_jenis_tagihan: "spp".into(),
                jenis: "Persen".into(),
                nilai: 50,
                periode_mulai: Some("2026-07".into()),
                periode_selesai: Some("2026-12".into()),
                alasan: Some("Beasiswa".into()),
                is_aktif: true,
            })
        );
        let galat = |u: Value| validate_keringanan(&keringanan(u)).err();
        assert_eq!(
            galat(json!({ "jenis": "Diskon" })).as_deref(),
            Some("Jenis keringanan harus Persen atau Nominal.")
        );
        assert_eq!(
            galat(json!({ "nilai": 0 })).as_deref(),
            Some("Nilai keringanan harus bilangan bulat lebih dari nol.")
        );
        assert_eq!(
            galat(json!({ "nilai": 101 })).as_deref(),
            Some("Keringanan persen maksimal 100.")
        );
        assert_eq!(
            galat(json!({ "periode_selesai": "2026-06" })).as_deref(),
            Some("Periode selesai tidak boleh sebelum periode mulai.")
        );
        assert_eq!(
            galat(json!({ "alasan": "a".repeat(81) })).as_deref(),
            Some("Alasan maksimal 80 karakter.")
        );

        let k = KeringananBerlaku {
            jenis: "Persen".into(),
            nilai: 50,
            periode_mulai: Some("2026-07".into()),
            periode_selesai: Some("2026-12".into()),
        };
        assert!(keringanan_berlaku(&k, "Sekali", "SEKALI"));
        assert!(keringanan_berlaku(&k, "Bulanan", "2026-08"));
        assert!(!keringanan_berlaku(&k, "Bulanan", "2026-06"));
        assert!(!keringanan_berlaku(&k, "Bulanan", "2027-01"));
        let bebas = KeringananBerlaku {
            periode_mulai: None,
            periode_selesai: None,
            ..k.clone()
        };
        assert!(keringanan_berlaku(&bebas, "Tahunan", "2030/2031"));

        let persen = |nilai| KeringananBerlaku {
            jenis: "Persen".into(),
            nilai,
            periode_mulai: None,
            periode_selesai: None,
        };
        let nominal = |nilai| KeringananBerlaku {
            jenis: "Nominal".into(),
            ..persen(nilai)
        };
        assert_eq!(hitung_potongan(350_000, &[persen(15)]), 52_500);
        assert_eq!(hitung_potongan(100_001, &[persen(33)]), 33_000);
        assert_eq!(hitung_potongan(150, &[persen(1)]), 2);
        assert_eq!(
            hitung_potongan(350_000, &[persen(50), nominal(300_000)]),
            350_000
        );
        assert_eq!(hitung_potongan(350_000, &[]), 0);
    }

    #[test]
    fn aturan_pembayaran() {
        assert_eq!(format_nomor_kuitansi("2026", "TU1", 7), "KWT/2026/TU1/0007");
        assert_eq!(
            format_nomor_kuitansi("2026", "WEB", 12345),
            "KWT/2026/WEB/12345"
        );
        assert_eq!(validate_seri(" tu1 "), Ok("TU1".into()));
        for salah in ["A", "TU-1", "ABCDEFGHI"] {
            assert_eq!(
                validate_seri(salah),
                Err("Seri harus 2 sampai 8 huruf atau angka.".into())
            );
        }
        assert_eq!(
            validate_seri("web"),
            Err("Seri WEB dipakai aplikasi Web.".into())
        );

        let draft = |ubah: Value| -> PembayaranDraft {
            let mut dasar = json!({
                "id_siswa": " S-01 ", "tanggal": "2026-07-15", "metode": "Tunai",
                "total": 500_000, "id_akun_kas": "akun-kas", "keterangan": " Titip kakak ",
                "id_tagihan": ["t2", " t1 ", "t2", ""]
            });
            for (k, v) in ubah.as_object().expect("objek") {
                dasar[k] = v.clone();
            }
            serde_json::from_value(dasar).expect("draft")
        };
        assert_eq!(
            validate_pembayaran(&draft(json!({}))),
            Ok(PembayaranValid {
                id_siswa: "S-01".into(),
                tanggal: "2026-07-15".into(),
                metode: "Tunai".into(),
                total: 500_000,
                id_akun_kas: Some("akun-kas".into()),
                keterangan: Some("Titip kakak".into()),
                id_tagihan: vec!["t2".into(), "t1".into()],
            })
        );
        let galat = |u: Value| validate_pembayaran(&draft(u)).err();
        assert_eq!(
            galat(json!({ "id_siswa": " " })).as_deref(),
            Some("Siswa wajib dipilih.")
        );
        assert_eq!(
            galat(json!({ "tanggal": "2026-02-30" })).as_deref(),
            Some("Tanggal pembayaran tidak valid.")
        );
        assert_eq!(
            galat(json!({ "metode": "QRIS" })).as_deref(),
            Some("Metode pembayaran tidak dikenal.")
        );
        for total in [json!(0), json!(1.5)] {
            assert_eq!(
                galat(json!({ "total": total })).as_deref(),
                Some("Jumlah bayar harus rupiah bulat lebih dari nol.")
            );
        }
        assert_eq!(
            galat(json!({ "total": 100_000_001 })).as_deref(),
            Some("Jumlah bayar maksimal Rp100.000.000.")
        );
        assert_eq!(
            galat(json!({ "id_akun_kas": " " })).as_deref(),
            Some("Akun penerima wajib dipilih.")
        );
        assert_eq!(
            galat(json!({ "keterangan": "a".repeat(151) })).as_deref(),
            Some("Keterangan maksimal 150 karakter.")
        );
        let banyak: Vec<String> = (0..101).map(|i| format!("t{i}")).collect();
        assert_eq!(
            galat(json!({ "id_tagihan": banyak })).as_deref(),
            Some("Satu kuitansi paling banyak 100 tagihan.")
        );
        assert_eq!(
            galat(json!({ "metode": "Titipan", "id_tagihan": [] })).as_deref(),
            Some("Pilih tagihan yang dibayar dari titipan.")
        );
        let titipan = validate_pembayaran(&draft(json!({ "metode": "Titipan" }))).expect("sah");
        assert_eq!(titipan.id_akun_kas, None);

        let t = |id: &str, jatuh: &str, periode: &str, sisa| TagihanTerbuka {
            id_tagihan: id.into(),
            jatuh_tempo: jatuh.into(),
            periode: periode.into(),
            sisa,
        };
        let tagihan = vec![
            t("b", "2026-08-10", "2026-08", 300_000),
            t("a", "2026-07-10", "2026-07", 150_000),
            t("c", "2026-07-10", "2026-07", 0),
            t("d", "2026-07-10", "2026-06", 100_000),
        ];
        assert_eq!(
            alokasi_pembayaran(&tagihan, 400_000),
            (
                vec![
                    ("d".into(), 100_000),
                    ("a".into(), 150_000),
                    ("b".into(), 150_000)
                ],
                0
            )
        );
        assert_eq!(alokasi_pembayaran(&tagihan, 600_000).1, 50_000);
        assert_eq!(alokasi_pembayaran(&[], 75_000), (vec![], 75_000));

        let baris = |v: Vec<(&str, i64, i64)>| -> Vec<(String, i64, i64)> {
            v.into_iter()
                .map(|(a, d, k)| (a.to_owned(), d, k))
                .collect()
        };
        assert_eq!(
            baris_jurnal_pembayaran("Tunai", Some("akun-kas"), 550_000, 50_000),
            baris(vec![
                ("akun-kas", 600_000, 0),
                ("akun-piutang-siswa", 0, 550_000),
                ("akun-titipan-wali", 0, 50_000)
            ])
        );
        assert_eq!(
            baris_jurnal_pembayaran("Transfer", Some("akun-bank"), 0, 75_000),
            baris(vec![
                ("akun-bank", 75_000, 0),
                ("akun-titipan-wali", 0, 75_000)
            ])
        );
        assert_eq!(
            baris_jurnal_pembayaran("Titipan", None, 40_000, 0),
            baris(vec![
                ("akun-titipan-wali", 40_000, 0),
                ("akun-piutang-siswa", 0, 40_000)
            ])
        );
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

    fn saldo(state: &MobileState, akun: &str) -> i64 {
        let neraca = accounting::trial_balance(state, "2099-12-31").expect("neraca");
        assert_eq!(
            neraca["total_debit"], neraca["total_kredit"],
            "neraca timpang"
        );
        neraca["items"]
            .as_array()
            .expect("items")
            .iter()
            .find(|item| item["id_akun"] == akun)
            .map(|item| item["debit"].as_i64().unwrap_or(0) - item["kredit"].as_i64().unwrap_or(0))
            .unwrap_or(0)
    }

    #[test]
    fn terbit_massal_idempoten_dan_batal() {
        let (_dir, state) = state_uji();
        let connection = storage::database(&state.data_dir).expect("db");
        connection
            .execute_batch(
                "INSERT INTO akademik_rombel (id_rombel, id_tahun_ajaran, tingkat, nama_rombel) VALUES
                    ('r7', 'ta', 7, 'VII A'), ('r8', 'ta', 8, 'VIII A');
                 INSERT INTO master_data (id_unik, kode_karyawan, nama, divisi, id_shift, jenis_personil, status_aktif, unit) VALUES
                    ('S-01', 'S-01', 'Ani', 'Siswa', 1, 'Siswa', 'Aktif', 'SMP'),
                    ('S-02', 'S-02', 'Budi', 'Siswa', 1, 'Siswa', 'Aktif', 'SMP'),
                    ('S-03', 'S-03', 'Cici', 'Siswa', 1, 'Siswa', 'Aktif', 'SMP');
                 INSERT INTO siswa_data (id_siswa, nama_lengkap, id_rombel, angkatan, status, created_at, updated_at) VALUES
                    ('S-01', 'Ani', 'r7', 2026, 'Aktif', 'x', 'x'),
                    ('S-02', 'Budi', 'r8', 2025, 'Aktif', 'x', 'x'),
                    ('S-03', 'Cici', 'r8', 2025, 'Lulus', 'x', 'x');",
            )
            .expect("seed siswa");

        let jt = save_jenis(
            &state,
            json!({ "nama": "SPP", "periodik": "Bulanan", "nominal_bawaan": 300_000, "id_akun_pendapatan": "akun-pendapatan-spp" }),
        )
        .expect("jenis")["id_jenis_tagihan"]
            .as_str()
            .expect("id")
            .to_owned();
        save_tarif(
            &state,
            json!({ "id_jenis_tagihan": jt, "nama_unit": "SMP", "tingkat": 7, "nominal": 500_000 }),
        )
        .expect("tarif");
        let kembar = save_tarif(
            &state,
            json!({ "id_jenis_tagihan": jt, "nama_unit": "smp", "tingkat": 7, "nominal": 1 }),
        )
        .expect_err("tarif kembar");
        assert_eq!(
            kembar.message,
            "Tarif untuk unit dan tingkat ini sudah ada."
        );
        save_keringanan(
            &state,
            "bendahara",
            json!({ "id_siswa": "S-02", "id_jenis_tagihan": jt, "jenis": "Persen", "nilai": 50 }),
        )
        .expect("keringanan");

        let pratinjau = preview(&state, &jt, "2026-07", None, None).expect("pratinjau");
        assert_eq!(pratinjau["jumlah_baru"], json!(2));
        assert_eq!(pratinjau["total_bersih"], json!(650_000));

        let hasil = issue(
            &state,
            "bendahara",
            &jt,
            "2026-07",
            "2026-07-10",
            None,
            None,
        )
        .expect("terbit");
        assert_eq!(hasil["terbit"], json!(2));
        assert_eq!(saldo(&state, AKUN_PIUTANG_SISWA), 650_000);
        let ulang = issue(
            &state,
            "bendahara",
            &jt,
            "2026-07",
            "2026-07-10",
            None,
            None,
        )
        .expect("terbit ulang");
        assert_eq!(ulang["terbit"], json!(0));
        assert_eq!(saldo(&state, AKUN_PIUTANG_SISWA), 650_000);

        let id = id_tagihan(&jt, "S-01", "2026-07");
        cancel(&state, "kepala", &id, "Salah tingkat").expect("batal");
        assert_eq!(
            cancel(&state, "kepala", &id, "Lagi")
                .expect_err("batal ganda")
                .message,
            "Tagihan ini sudah dibatalkan."
        );
        assert_eq!(saldo(&state, AKUN_PIUTANG_SISWA), 150_000);
        let daftar = list(&state, Some("2026-07"), None, None, Some("Aktif")).expect("daftar");
        assert_eq!(daftar["items"].as_array().expect("items").len(), 1);
        assert_eq!(daftar["total_sisa"], json!(150_000));
    }

    #[test]
    fn pembayaran_alokasi_titipan_dan_tinjauan() {
        let (_dir, state) = state_uji();
        let connection = storage::database(&state.data_dir).expect("db");
        connection
            .execute_batch(
                "INSERT INTO akademik_rombel (id_rombel, id_tahun_ajaran, tingkat, nama_rombel) VALUES ('r7', 'ta', 7, 'VII A');
                 INSERT INTO master_data (id_unik, kode_karyawan, nama, divisi, id_shift, jenis_personil, status_aktif, unit) VALUES
                    ('S-01', 'S-01', 'Ani', 'Siswa', 1, 'Siswa', 'Aktif', 'SMP');
                 INSERT INTO siswa_data (id_siswa, nama_lengkap, id_rombel, angkatan, status, created_at, updated_at, no_whatsapp_wali) VALUES
                    ('S-01', 'Ani', 'r7', 2026, 'Aktif', 'x', 'x', '+6281234567890');",
            )
            .expect("seed siswa");
        let jt = save_jenis(
            &state,
            json!({ "nama": "SPP", "periodik": "Bulanan", "nominal_bawaan": 300_000, "id_akun_pendapatan": "akun-pendapatan-spp" }),
        )
        .expect("jenis")["id_jenis_tagihan"]
            .as_str()
            .expect("id")
            .to_owned();
        for (periode, jatuh) in [("2026-07", "2026-07-10"), ("2026-08", "2026-08-10")] {
            issue(&state, "tu", &jt, periode, jatuh, None, None).expect("terbit");
        }
        let juli = id_tagihan(&jt, "S-01", "2026-07");
        let agustus = id_tagihan(&jt, "S-01", "2026-08");
        assert_eq!(saldo(&state, AKUN_PIUTANG_SISWA), 600_000);

        let besok = "2999-01-01";
        let galat = pay(
            &state,
            "tu",
            json!({ "id_siswa": "S-01", "tanggal": besok, "metode": "Tunai", "total": 1, "id_akun_kas": "akun-kas", "id_tagihan": [juli] }),
        )
        .expect_err("tanggal masa depan");
        assert_eq!(
            galat.message,
            "Tanggal pembayaran tidak boleh melewati hari ini."
        );

        // 400.000 untuk dua bulan: Juli lunas, Agustus sisa 200.000.
        let kwt1 = pay(
            &state,
            "tu",
            json!({ "id_siswa": "S-01", "tanggal": "2026-07-15", "metode": "Tunai", "total": 400_000, "id_akun_kas": "akun-kas", "id_tagihan": [agustus, juli] }),
        )
        .expect("bayar");
        let nomor1 = kwt1["nomor"].as_str().expect("nomor").to_owned();
        assert!(nomor1.starts_with("KWT/2026/") && nomor1.ends_with("/0001"));
        assert_eq!(saldo(&state, AKUN_PIUTANG_SISWA), 200_000);
        assert_eq!(saldo(&state, "akun-kas"), 400_000);
        let daftar = list(&state, None, None, None, None).expect("daftar");
        let item = |id: &str| {
            daftar["items"]
                .as_array()
                .expect("items")
                .iter()
                .find(|row| row["id_tagihan"] == id)
                .cloned()
                .expect("tagihan")
        };
        assert_eq!(item(&juli)["status"], "Lunas");
        assert_eq!(item(&agustus)["sisa"], json!(200_000));
        assert_eq!(daftar["total_sisa"], json!(200_000));
        assert_eq!(
            cancel(&state, "kepala", &juli, "x")
                .expect_err("sudah dibayar")
                .message,
            "Tagihan ini sudah dibayar. Batalkan kuitansinya atau pindahkan ke titipan lebih dulu."
        );

        // 250.000 untuk Agustus: kelebihan 50.000 menjadi titipan.
        let kwt2 = pay(
            &state,
            "tu",
            json!({ "id_siswa": "S-01", "tanggal": "2026-07-16", "metode": "Transfer", "total": 250_000, "id_akun_kas": "akun-bank", "id_tagihan": [agustus] }),
        )
        .expect("bayar lebih");
        assert_eq!(kwt2["ke_titipan"], json!(50_000));
        assert!(kwt2["nomor"].as_str().expect("nomor").ends_with("/0002"));
        assert_eq!(saldo(&state, AKUN_PIUTANG_SISWA), 0);
        assert_eq!(saldo(&state, AKUN_TITIPAN_WALI), -50_000);
        let akun = account(&state, "S-01").expect("akun siswa");
        assert_eq!(akun["titipan"], json!(50_000));
        assert_eq!(akun["tagihan"].as_array().expect("tagihan").len(), 0);
        assert_eq!(akun["riwayat"].as_array().expect("riwayat").len(), 2);

        // Titipan tidak bisa dipakai tanpa tagihan terbuka.
        assert_eq!(
            pay(
                &state,
                "tu",
                json!({ "id_siswa": "S-01", "tanggal": "2026-07-16", "metode": "Titipan", "total": 10_000, "id_tagihan": [agustus] }),
            )
            .expect_err("tidak ada sisa")
            .message,
            "Pembayaran dari titipan tidak boleh melebihi sisa tagihan yang dipilih."
        );

        // Membatalkan kuitansi pertama: Juli dan sebagian Agustus kembali terutang.
        cancel_payment(
            &state,
            "kepala",
            kwt1["id_pembayaran"].as_str().expect("id"),
            "Salah input",
        )
        .expect("batal kuitansi");
        assert_eq!(
            cancel_payment(
                &state,
                "kepala",
                kwt1["id_pembayaran"].as_str().expect("id"),
                "Lagi"
            )
            .expect_err("batal ganda")
            .message,
            "Kuitansi ini sudah dibatalkan."
        );
        assert_eq!(saldo(&state, AKUN_PIUTANG_SISWA), 400_000);
        assert_eq!(saldo(&state, "akun-kas"), 0);

        // Titipan 50.000 dipakai untuk Juli.
        let kwt3 = pay(
            &state,
            "tu",
            json!({ "id_siswa": "S-01", "tanggal": "2026-07-17", "metode": "Titipan", "total": 50_000, "id_tagihan": [juli] }),
        )
        .expect("pakai titipan");
        assert_eq!(account(&state, "S-01").expect("akun")["titipan"], json!(0));
        assert_eq!(saldo(&state, AKUN_TITIPAN_WALI), 0);
        assert_eq!(
            pay(
                &state,
                "tu",
                json!({ "id_siswa": "S-01", "tanggal": "2026-07-17", "metode": "Titipan", "total": 1, "id_tagihan": [juli] }),
            )
            .expect_err("titipan habis")
            .message,
            "Saldo titipan tidak cukup. Tersedia Rp0."
        );

        // Pindahkan kuitansi kedua ke titipan: Agustus kembali terutang penuh,
        // saldo titipan = 250.000 pengganti - 50.000 yang sudah terpakai.
        let pengganti = move_to_deposit(
            &state,
            "kepala",
            kwt2["id_pembayaran"].as_str().expect("id"),
            "Sudah dibayar di perangkat lain",
        )
        .expect("pindah ke titipan");
        assert_eq!(pengganti["ke_titipan"], json!(250_000));
        assert_eq!(
            account(&state, "S-01").expect("akun")["titipan"],
            json!(200_000)
        );
        assert_eq!(saldo(&state, AKUN_TITIPAN_WALI), -200_000);
        assert_eq!(saldo(&state, AKUN_PIUTANG_SISWA), 550_000);
        assert_eq!(
            move_to_deposit(
                &state,
                "kepala",
                kwt3["id_pembayaran"].as_str().expect("id"),
                "x"
            )
            .expect_err("titipan ke titipan")
            .message,
            "Kuitansi dari titipan cukup dibatalkan; saldonya kembali dengan sendirinya."
        );

        // Kuitansi kembar dari perangkat lain yang tertarik lewat sinkronisasi.
        connection
            .execute_batch(&format!(
                "INSERT INTO keu_pembayaran (id_pembayaran, id_siswa, nama_siswa, tanggal, seri, nomor_urut, nomor, metode, id_akun_kas, total, dibuat_oleh)
                    VALUES ('kwt-lain', 'S-01', 'Ani', '2026-07-17', 'TU9', 1, 'KWT/2026/TU9/0001', 'Titipan', NULL, 50000, 'tu2');
                 INSERT INTO keu_pembayaran_alokasi (id_alokasi, id_pembayaran, id_tagihan, nominal)
                    VALUES ('kwt-lain-1', 'kwt-lain', '{juli}', 50000);"
            ))
            .expect("kuitansi perangkat lain");
        let tinjau = review(&state).expect("tinjauan");
        assert_eq!(
            tinjau["kemungkinan_ganda"].as_array().expect("ganda").len(),
            2
        );
        assert_eq!(tinjau["lebih_bayar"].as_array().expect("lebih").len(), 0);
        assert_eq!(tinjau["titipan_minus"].as_array().expect("minus").len(), 0);

        let detail = payment_detail(&state, pengganti["id_pembayaran"].as_str().expect("id"))
            .expect("detail");
        assert_eq!(detail["pembayaran"]["no_wali"], "+6281234567890");
        assert_eq!(detail["alokasi"][0]["id_tagihan"], Value::Null);
        assert!(detail["pembayaran"]["keterangan"]
            .as_str()
            .expect("keterangan")
            .starts_with("Pengganti KWT/"));
        let semua = payments(&state, "2026-07-01", "2026-07-31", None).expect("kuitansi");
        assert_eq!(semua["items"].as_array().expect("items").len(), 5);
        assert_eq!(semua["total_sah"], json!(350_000));

        let seri = series(&state).expect("seri");
        assert_eq!(seri["terdaftar"], json!(false));
        let kode = seri["device_code"].as_str().expect("kode").to_owned();
        save_series(&state, &kode, " tu1 ", "Loket TU").expect("daftar seri");
        assert_eq!(
            save_series(&state, "kode-lain", "TU1", "")
                .expect_err("seri kembar")
                .message,
            "Seri ini sudah dipakai perangkat lain."
        );
        let kwt4 = pay(
            &state,
            "tu",
            json!({ "id_siswa": "S-01", "tanggal": "2026-07-18", "metode": "Tunai", "total": 300_000, "id_akun_kas": "akun-kas", "id_tagihan": [juli] }),
        )
        .expect("bayar dengan seri");
        assert_eq!(kwt4["nomor"], "KWT/2026/TU1/0001");
    }
}
