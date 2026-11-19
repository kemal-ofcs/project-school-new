//! HRIS Fase 8a (`prd-hris/fase-8.md` §26.2.1): berkas transfer gaji ke bank.
//!
//! `app_bank`, `app_bank_rekening`, dan `app_bank_format` KHUSUS CLOUD
//! (§26.3): dibaca dan ditulis lewat `TursoClient`, tidak pernah masuk SQLite
//! perangkat, snapshot, atau outbox. Tanpa koneksi, command mengembalikan
//! `hris_cloud::PESAN_LURING`. Run dan slip juga dibaca dari cloud, supaya
//! Web dan Desktop memakai kueri yang sama. Nominal berkas =
//! `payroll_items.net_salary` apa adanya, dijumlahkan sebagai bilangan bulat.
//! Baris yang tidak bisa ditransfer ditandai, tidak ditolak. Isi berkas
//! (CSV/TXT/XLSX) dirender di TS, sama untuk Web dan Desktop.
//!
//! Kembaran TS: aturan dan SQL di `src/lib/validations/transfer.ts`, penulisan
//! di `src/lib/services/transfer.ts`. Vektornya `validations/transfer.vektor.json`;
//! teks SQL dan pesan dibandingkan harfiah oleh `transfer.test.ts`.

use std::collections::HashSet;
use std::sync::OnceLock;

use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};

use super::hr_rekrutmen::{angka, baris, galat, hari_ini, satu, teks, tulis};
use super::hris::{kunci_nama, new_id};
use super::hris_cloud::nomor_identitas;
use super::inventory::{is_valid_date, payload_text};
use super::models::CommandError;
use super::turso::TursoClient;

/// Unduh berkas membuka nomor rekening semua pegawai: wajib KEDUANYA (§26.4).
pub const IZIN_UNDUH: [&str; 2] = ["payroll.run.disburse", "hr.finance.view"];
/// Bank, rekening debet, dan urutan kolom menentukan ke mana uang pergi:
/// khusus Superadmin lewat `SUPERADMIN_ONLY_PERMISSIONS`.
pub const IZIN_PENGATURAN: &str = "payroll.config.manage";
/// Nilai `aksi` draft `desktop_transfer_settings_save`.
pub const AKSI_PENGATURAN: [&str; 3] = ["bank", "rekening", "format"];

/// Satu bank bawaan. `kode` = kode bank BI 3 digit.
#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct BankBawaan {
    pub id_bank: String,
    pub nama: String,
    pub kode: Option<String>,
    pub alias: Vec<String>,
}

/// Bank bawaan dari berkas JSON yang SAMA dengan yang diimpor
/// `validations/transfer.ts`; semuanya bisa disunting di Pengaturan.
pub fn bank_bawaan() -> &'static [BankBawaan] {
    static BANK: OnceLock<Vec<BankBawaan>> = OnceLock::new();
    BANK.get_or_init(|| {
        serde_json::from_str(include_str!(
            "../../../src/lib/validations/bank-bawaan.json"
        ))
        .expect("bank-bawaan.json tidak valid")
    })
}

/// Bank yang sudah disunting tidak ditimpa.
pub const SEED_BANK_SQL: &str = "INSERT OR IGNORE INTO app_bank (id_bank, nama, kode, alias, is_bawaan) VALUES (?1, ?2, ?3, ?4, 1);";

pub fn seed_bank_args(bank: &BankBawaan) -> Vec<Value> {
    vec![
        json!(bank.id_bank),
        json!(bank.nama),
        json!(bank.kode),
        json!(serde_json::to_string(&bank.alias).expect("alias bank")),
    ]
}

// Konstanta

pub const MAKS_NAMA: usize = 100;
pub const MAKS_KETERANGAN: usize = 200;
pub const MAKS_ALIAS: usize = 20;
pub const MAKS_KOLOM_FORMAT: usize = 30;
pub const MAKS_JUDUL_KOLOM: usize = 60;
pub const MAKS_TEKS_KOLOM: usize = 100;
/// WAJIB sama dengan CHECK `app_bank_format.maks_berita`.
pub const MAKS_PANJANG_BERITA: i64 = 200;
/// WAJIB sama dengan CHECK `app_bank_format.jenis`.
pub const JENIS_BERKAS: [&str; 3] = ["csv", "txt", "xlsx"];
/// WAJIB sama dengan CHECK `app_bank_format.pemisah` (`char(9)` = tab).
pub const PEMISAH: [&str; 4] = [",", ";", "\t", "|"];
/// WAJIB sama dengan CHECK `app_bank_format.cakupan`.
pub const CAKUPAN: [&str; 3] = ["semua", "sesama", "antarbank"];
/// Isian yang boleh dipakai kolom format.
pub const ISIAN_TRANSFER: [&str; 13] = [
    "nama_karyawan",
    "kode_karyawan",
    "nama_bank",
    "kode_bank",
    "no_rekening",
    "nama_rekening",
    "nominal",
    "berita",
    "rekening_debet",
    "nama_debet",
    "tanggal_efektif",
    "nomor_urut",
    "teks_tetap",
];
/// Status run yang boleh diunduh berkasnya (§26.2.1).
pub const STATUS_RUN_TRANSFER: [&str; 2] = ["APPROVED", "PAID"];

pub const PESAN_STATUS_RUN: &str =
    "Berkas transfer hanya untuk proses gaji yang sudah disetujui (APPROVED) atau dibayar (PAID).";
pub const PESAN_RUN_TIDAK_ADA: &str = "Proses gaji tidak ditemukan di database pusat.";
pub const PESAN_DEBET_NONAKTIF: &str = "Rekening debet tidak ditemukan atau sudah nonaktif.";
pub const PESAN_FORMAT_NONAKTIF: &str = "Format berkas tidak ditemukan atau sudah nonaktif.";
pub const PESAN_REKENING_GANDA: &str = "Rekening ini sudah tercatat.";
pub const PESAN_FORMAT_GANDA: &str = "Nama format sudah dipakai.";
pub const PESAN_BANK_NONAKTIF: &str = "Bank sudah nonaktif.";
pub const PESAN_AKSI_PENGATURAN: &str = "Jenis pengaturan tidak dikenal.";

/// Cermin `pesanBankGanda`.
pub fn pesan_bank_ganda(nama: &str) -> String {
    format!("Nama atau alias sudah dipakai bank {nama}.")
}

// SQL kembar (harfiah di `validations/transfer.ts`)

pub const BANK_SQL: &str = "SELECT id_bank, nama, COALESCE(kode, '') AS kode, alias, is_aktif, is_bawaan, COALESCE(diubah_oleh, '') AS diubah_oleh, created_at, updated_at FROM app_bank ORDER BY is_aktif DESC, nama, id_bank\n-- batas: daftar bank Indonesia, puluhan baris\n;";
pub const REKENING_SQL: &str = "SELECT r.id_rekening, r.id_bank, r.no_rekening, r.nama_rekening, COALESCE(r.keterangan, '') AS keterangan, r.is_aktif, COALESCE(r.diubah_oleh, '') AS diubah_oleh, r.updated_at, COALESCE(b.nama, '') AS nama_bank, COALESCE(b.kode, '') AS kode_bank, COALESCE(b.is_aktif, 0) AS bank_aktif FROM app_bank_rekening r LEFT JOIN app_bank b ON b.id_bank = r.id_bank ORDER BY r.is_aktif DESC, b.nama, r.no_rekening, r.id_rekening\n-- batas: rekening debet sekolah, beberapa baris\n;";
pub const FORMAT_SQL: &str = "SELECT f.id_format, f.nama, COALESCE(f.id_bank, '') AS id_bank, f.jenis, f.pemisah, f.pakai_judul, f.kutip, f.desimal, f.cakupan, f.kolom, f.maks_berita, f.is_aktif, COALESCE(f.diubah_oleh, '') AS diubah_oleh, f.updated_at, COALESCE(b.nama, '') AS nama_bank FROM app_bank_format f LEFT JOIN app_bank b ON b.id_bank = f.id_bank ORDER BY f.is_aktif DESC, f.nama, f.id_format\n-- batas: format berkas per bank, beberapa baris\n;";
pub const BANK_SATU_SQL: &str =
    "SELECT id_bank, nama, is_aktif FROM app_bank WHERE id_bank = ?1 LIMIT 1;";
pub const SIMPAN_BANK_SQL: &str = "INSERT INTO app_bank (id_bank, nama, kode, alias, is_aktif, diubah_oleh) VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT(id_bank) DO UPDATE SET nama = excluded.nama, kode = excluded.kode, alias = excluded.alias, is_aktif = excluded.is_aktif, diubah_oleh = excluded.diubah_oleh, updated_at = datetime('now');";
pub const SIMPAN_REKENING_SQL: &str = "INSERT INTO app_bank_rekening (id_rekening, id_bank, no_rekening, nama_rekening, keterangan, is_aktif, diubah_oleh) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) ON CONFLICT(id_rekening) DO UPDATE SET id_bank = excluded.id_bank, no_rekening = excluded.no_rekening, nama_rekening = excluded.nama_rekening, keterangan = excluded.keterangan, is_aktif = excluded.is_aktif, diubah_oleh = excluded.diubah_oleh, updated_at = datetime('now');";
pub const SIMPAN_FORMAT_SQL: &str = "INSERT INTO app_bank_format (id_format, nama, id_bank, jenis, pemisah, pakai_judul, kutip, desimal, cakupan, kolom, maks_berita, is_aktif, diubah_oleh) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13) ON CONFLICT(id_format) DO UPDATE SET nama = excluded.nama, id_bank = excluded.id_bank, jenis = excluded.jenis, pemisah = excluded.pemisah, pakai_judul = excluded.pakai_judul, kutip = excluded.kutip, desimal = excluded.desimal, cakupan = excluded.cakupan, kolom = excluded.kolom, maks_berita = excluded.maks_berita, is_aktif = excluded.is_aktif, diubah_oleh = excluded.diubah_oleh, updated_at = datetime('now');";
pub const RUN_TRANSFER_SQL: &str = "SELECT id, period_start, period_end, status, total_net_payout, total_employees FROM payroll_runs WHERE id = ?1 LIMIT 1;";
/// Rekening dibaca saat mengunduh, tidak dibekukan di run.
pub const BARIS_TRANSFER_SQL: &str = "SELECT i.id_karyawan, i.nama_karyawan, COALESCE(m.kode_karyawan, '') AS kode_karyawan, i.net_salary, COALESCE(m.id_keluar, '') AS id_keluar, COALESCE(p.bank, '') AS bank, COALESCE(p.no_rekening, '') AS no_rekening, COALESCE(p.nama_rekening, '') AS nama_rekening FROM payroll_items i LEFT JOIN master_data m ON m.id_unik = i.id_karyawan LEFT JOIN hr_profil p ON p.id_karyawan = i.id_karyawan WHERE i.payroll_run_id = ?1 ORDER BY i.nama_karyawan, i.id\n-- batas: slip satu run, sejumlah pegawai lembaga\n;";
/// Jejak unduhan langsung di cloud; status run tidak berubah.
pub const CATAT_UNDUH_SQL: &str = "INSERT INTO payroll_audit_logs (id, payroll_run_id, action, old_status, new_status, performed_by, notes, created_at) VALUES (?1, ?2, 'TRANSFER_EXPORT', ?3, ?3, ?4, ?5, datetime('now'));";
pub const RIWAYAT_UNDUH_SQL: &str = "SELECT id, performed_by, COALESCE(notes, '') AS notes, created_at FROM payroll_audit_logs WHERE payroll_run_id = ?1 AND action = 'TRANSFER_EXPORT' ORDER BY created_at DESC, id DESC\n-- batas: unduhan satu run, beberapa kali\n;";

// Aturan murni

fn panjang(t: &str) -> usize {
    t.chars().count()
}

pub(super) fn rapikan(t: &str) -> String {
    t.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Cermin `adaKendali`: karakter di bawah spasi (tab, baris baru).
fn ada_kendali(t: &str) -> bool {
    t.chars().any(|c| c < ' ')
}

/// Cermin `objekKetat`: objek dengan kunci dari `kolom` saja.
pub(super) fn objek_ketat<'a>(draft: &'a Value, kolom: &[&str]) -> Result<&'a Map<String, Value>, String> {
    let objek = draft.as_object().ok_or("Isian tidak valid.")?;
    if let Some(kunci) = objek.keys().find(|k| !kolom.contains(&k.as_str())) {
        return Err(format!("Isian '{kunci}' tidak dikenal."));
    }
    Ok(objek)
}

/// Cermin `teksWajib`: spasi dirapikan, wajib, maksimal `maks`.
fn teks_wajib(draft: &Value, kunci: &str, label: &str, maks: usize) -> Result<String, String> {
    let t = payload_text(draft, kunci)
        .map(|t| rapikan(&t))
        .ok_or_else(|| format!("{label} wajib diisi."))?;
    if panjang(&t) > maks {
        return Err(format!("{label} maksimal {maks} karakter."));
    }
    Ok(t)
}

/// Cermin `bendera`: true/false atau 0/1; absen atau null = `bawaan`.
fn bendera(draft: &Value, kunci: &str, label: &str, bawaan: i64) -> Result<i64, String> {
    match draft.get(kunci) {
        None | Some(Value::Null) => Ok(bawaan),
        Some(Value::Bool(b)) => Ok(i64::from(*b)),
        Some(v) => v
            .as_i64()
            .filter(|n| *n == 0 || *n == 1)
            .ok_or_else(|| format!("{label} tidak valid.")),
    }
}

/// Cermin `bacaAlias`: larik JSON teks; rusak = kosong.
pub fn baca_alias(t: &str) -> Vec<String> {
    match serde_json::from_str::<Value>(if t.is_empty() { "[]" } else { t }) {
        Ok(Value::Array(daftar)) => daftar
            .into_iter()
            .filter_map(|v| v.as_str().map(str::to_owned))
            .collect(),
        _ => Vec::new(),
    }
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct BankSah {
    pub nama: String,
    pub kode: Option<String>,
    pub alias: Vec<String>,
    pub is_aktif: i64,
}

/// Cermin `validasiBank`. `nama_lama` = nama tersimpan saat menyunting: bila
/// nama berubah, nama lama masuk alias supaya profil lama tetap cocok.
pub fn validasi_bank(draft: &Value, nama_lama: Option<&str>) -> Result<BankSah, String> {
    objek_ketat(draft, &["nama", "kode", "alias", "is_aktif"])?;
    let nama = teks_wajib(draft, "nama", "Nama bank", MAKS_NAMA)?;
    let kode = match draft.get("kode") {
        None | Some(Value::Null) => None,
        Some(Value::String(t)) => {
            let t = t.trim();
            if !t.is_empty() && !(t.chars().count() == 3 && t.chars().all(|c| c.is_ascii_digit())) {
                return Err("Kode bank harus 3 digit angka.".into());
            }
            Some(t.to_owned()).filter(|t| !t.is_empty())
        }
        Some(_) => return Err("Kode bank tidak valid.".into()),
    };
    let mentah: Vec<&str> = match draft.get("alias") {
        None | Some(Value::Null) => Vec::new(),
        Some(Value::Array(daftar)) => daftar
            .iter()
            .map(Value::as_str)
            .collect::<Option<_>>()
            .ok_or("Alias tidak valid.")?,
        Some(_) => return Err("Alias tidak valid.".into()),
    };
    let mut alias = Vec::new();
    let mut dipakai = HashSet::from([kunci_nama(&nama)]);
    let mut tambah = |t: &str| {
        let a = rapikan(t);
        if !a.is_empty() && dipakai.insert(kunci_nama(&a)) {
            alias.push(a);
        }
    };
    for a in mentah {
        if panjang(&rapikan(a)) > MAKS_NAMA {
            return Err(format!("Alias maksimal {MAKS_NAMA} karakter."));
        }
        tambah(a);
    }
    if let Some(lama) = nama_lama {
        tambah(lama);
    }
    if alias.len() > MAKS_ALIAS {
        return Err(format!("Alias maksimal {MAKS_ALIAS} nama."));
    }
    let is_aktif = bendera(draft, "is_aktif", "Status aktif", 1)?;
    Ok(BankSah {
        nama,
        kode,
        alias,
        is_aktif,
    })
}

/// Baris `app_bank` seperti dibaca `BANK_SQL` (`kode` kosong = tanpa kode).
#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct BankBaris {
    pub id_bank: String,
    pub nama: String,
    #[serde(default)]
    pub kode: String,
    #[serde(default)]
    pub alias: String,
    pub is_aktif: i64,
}

/// Cermin `bankBentrok`: nama atau alias `sah` sudah dipakai nama atau alias
/// bank lain (keunikan ditegakkan aplikasi). Hasil = nama bank lain itu.
pub fn bank_bentrok(id: Option<&str>, sah: &BankSah, bank: &[BankBaris]) -> Option<String> {
    let kunci: HashSet<String> = std::iter::once(&sah.nama)
        .chain(&sah.alias)
        .map(|n| kunci_nama(n))
        .collect();
    bank.iter()
        .filter(|b| Some(b.id_bank.as_str()) != id)
        .find(|b| {
            std::iter::once(b.nama.clone())
                .chain(baca_alias(&b.alias))
                .any(|n| kunci.contains(&kunci_nama(&n)))
        })
        .map(|b| b.nama.clone())
}

/// Cermin `cocokBank`: teks `hr_profil.bank` → bank, lewat nama lalu alias
/// sesudah huruf besar kecil dan spasi dirapikan. Bank nonaktif tetap cocok;
/// pemanggil menandainya `bank_tidak_dikenal`.
pub fn cocok_bank<'a>(t: &str, bank: &'a [BankBaris]) -> Option<&'a BankBaris> {
    let kunci = kunci_nama(t);
    if kunci.is_empty() {
        return None;
    }
    bank.iter()
        .find(|b| kunci_nama(&b.nama) == kunci)
        .or_else(|| {
            bank.iter()
                .find(|b| baca_alias(&b.alias).iter().any(|a| kunci_nama(a) == kunci))
        })
}

/// Cermin `jenisTransfer`: bank pegawai sama dengan bank rekening debet.
pub fn jenis_transfer(id_bank_pegawai: &str, id_bank_debet: &str) -> &'static str {
    if id_bank_pegawai == id_bank_debet {
        "sesama"
    } else {
        "antarbank"
    }
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct RekeningSah {
    pub id_bank: String,
    pub no_rekening: String,
    pub nama_rekening: String,
    pub keterangan: Option<String>,
    pub is_aktif: i64,
}

/// Cermin `validasiRekening`: rekening debet sekolah.
pub fn validasi_rekening(draft: &Value) -> Result<RekeningSah, String> {
    objek_ketat(
        draft,
        &[
            "id_bank",
            "no_rekening",
            "nama_rekening",
            "keterangan",
            "is_aktif",
        ],
    )?;
    let id_bank = payload_text(draft, "id_bank").ok_or("Bank wajib dipilih.")?;
    let no = match draft.get("no_rekening") {
        None | Some(Value::Null) => "",
        Some(Value::String(t)) => t.as_str(),
        Some(_) => return Err("Nomor rekening tidak valid.".into()),
    };
    let no_rekening = nomor_identitas("no_rekening", no)?;
    if no_rekening.is_empty() {
        return Err("Nomor rekening wajib diisi.".into());
    }
    let nama_rekening = teks_wajib(draft, "nama_rekening", "Nama pemilik rekening", MAKS_NAMA)?;
    let keterangan = payload_text(draft, "keterangan");
    if keterangan
        .as_deref()
        .is_some_and(|k| panjang(k) > MAKS_KETERANGAN)
    {
        return Err(format!("Keterangan maksimal {MAKS_KETERANGAN} karakter."));
    }
    let is_aktif = bendera(draft, "is_aktif", "Status aktif", 1)?;
    Ok(RekeningSah {
        id_bank,
        no_rekening,
        nama_rekening,
        keterangan,
        is_aktif,
    })
}

/// Baris `app_bank_rekening` yang dibandingkan `rekening_bentrok`.
#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct RekeningBaris {
    pub id_rekening: String,
    pub id_bank: String,
    pub no_rekening: String,
}

/// Cermin `rekeningBentrok`: bank + nomor yang sama sudah tercatat.
pub fn rekening_bentrok(id: Option<&str>, sah: &RekeningSah, rekening: &[RekeningBaris]) -> bool {
    rekening.iter().any(|r| {
        Some(r.id_rekening.as_str()) != id
            && r.id_bank == sah.id_bank
            && r.no_rekening == sah.no_rekening
    })
}

/// Satu kolom format. Urutan field = urutan kunci `kolomTeks`.
#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct KolomFormat {
    pub isian: String,
    pub judul: String,
    pub teks: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct FormatSah {
    pub nama: String,
    pub id_bank: Option<String>,
    pub jenis: String,
    pub pemisah: Option<String>,
    pub pakai_judul: i64,
    pub kutip: i64,
    pub desimal: i64,
    pub cakupan: String,
    pub kolom: Vec<KolomFormat>,
    pub maks_berita: Option<i64>,
    pub is_aktif: i64,
}

/// Teks opsional kolom: absen/null = kosong, bukan teks = galat.
fn teks_kolom(kolom: &Value, kunci: &str, pesan: String) -> Result<String, String> {
    match kolom.get(kunci) {
        None | Some(Value::Null) => Ok(String::new()),
        Some(Value::String(t)) => Ok(t.trim().to_owned()),
        Some(_) => Err(pesan),
    }
}

/// Cermin `validasiKolom`: larik kolom format, juga untuk membaca ulang `kolom`.
pub fn validasi_kolom(mentah: Option<&Value>) -> Result<Vec<KolomFormat>, String> {
    let daftar = mentah
        .and_then(Value::as_array)
        .filter(|d| !d.is_empty() && d.len() <= MAKS_KOLOM_FORMAT)
        .ok_or_else(|| format!("Format wajib punya 1–{MAKS_KOLOM_FORMAT} kolom."))?;
    let mut kolom = Vec::with_capacity(daftar.len());
    for (i, item) in daftar.iter().enumerate() {
        let ke = format!("Kolom ke-{}", i + 1);
        objek_ketat(item, &["isian", "judul", "teks"]).map_err(|e| format!("{ke}: {e}"))?;
        let isian = item
            .get("isian")
            .and_then(Value::as_str)
            .filter(|s| ISIAN_TRANSFER.contains(s))
            .ok_or_else(|| format!("{ke}: isian tidak dikenal."))?;
        let judul = teks_kolom(item, "judul", format!("{ke}: judul tidak valid."))?;
        if judul.is_empty() {
            return Err(format!("{ke}: judul wajib diisi."));
        }
        if panjang(&judul) > MAKS_JUDUL_KOLOM {
            return Err(format!("{ke}: judul maksimal {MAKS_JUDUL_KOLOM} karakter."));
        }
        if ada_kendali(&judul) {
            return Err(format!(
                "{ke}: judul tidak boleh berisi tab atau baris baru."
            ));
        }
        let t = teks_kolom(item, "teks", format!("{ke}: teks tidak valid."))?;
        if isian != "teks_tetap" {
            if !t.is_empty() {
                return Err(format!("{ke}: teks hanya untuk isian teks tetap."));
            }
            kolom.push(KolomFormat {
                isian: isian.to_owned(),
                judul,
                teks: None,
            });
            continue;
        }
        if panjang(&t) > MAKS_TEKS_KOLOM {
            return Err(format!("{ke}: teks maksimal {MAKS_TEKS_KOLOM} karakter."));
        }
        if ada_kendali(&t) {
            return Err(format!(
                "{ke}: teks tidak boleh berisi tab atau baris baru."
            ));
        }
        kolom.push(KolomFormat {
            isian: isian.to_owned(),
            judul,
            teks: Some(t),
        });
    }
    Ok(kolom)
}

/// Cermin `validasiFormat`: format kustom dari Pengaturan.
pub fn validasi_format(draft: &Value) -> Result<FormatSah, String> {
    objek_ketat(
        draft,
        &[
            "nama",
            "id_bank",
            "jenis",
            "pemisah",
            "pakai_judul",
            "kutip",
            "desimal",
            "cakupan",
            "kolom",
            "maks_berita",
            "is_aktif",
        ],
    )?;
    let nama = teks_wajib(draft, "nama", "Nama format", MAKS_NAMA)?;
    let id_bank = payload_text(draft, "id_bank");
    let jenis = draft
        .get("jenis")
        .and_then(Value::as_str)
        .filter(|j| JENIS_BERKAS.contains(j))
        .ok_or("Jenis berkas tidak dikenal.")?
        .to_owned();
    // Pemisah tidak dipangkas: tab adalah spasi.
    let pemisah = draft.get("pemisah").filter(|v| !v.is_null());
    let pemisah = if jenis == "xlsx" {
        if pemisah.is_some_and(|v| v.as_str() != Some("")) {
            return Err("Berkas Excel tidak memakai pemisah.".into());
        }
        None
    } else {
        Some(
            pemisah
                .and_then(Value::as_str)
                .filter(|p| PEMISAH.contains(p))
                .ok_or("Pemisah tidak dikenal.")?
                .to_owned(),
        )
    };
    let pakai_judul = bendera(draft, "pakai_judul", "Baris judul", 1)?;
    let kutip = bendera(draft, "kutip", "Kutip", 0)?;
    let desimal = bendera(draft, "desimal", "Desimal", 0)?;
    let cakupan = match draft.get("cakupan") {
        None | Some(Value::Null) => "semua",
        Some(v) => v
            .as_str()
            .filter(|c| CAKUPAN.contains(c))
            .ok_or("Cakupan tidak dikenal.")?,
    }
    .to_owned();
    let kolom = validasi_kolom(draft.get("kolom"))?;
    let maks_berita = match draft.get("maks_berita") {
        None | Some(Value::Null) => None,
        Some(v) => Some(
            v.as_i64()
                .filter(|n| (1..=MAKS_PANJANG_BERITA).contains(n))
                .ok_or_else(|| {
                    format!("Panjang berita harus bilangan bulat 1–{MAKS_PANJANG_BERITA}.")
                })?,
        ),
    };
    let is_aktif = bendera(draft, "is_aktif", "Status aktif", 1)?;
    Ok(FormatSah {
        nama,
        id_bank,
        jenis,
        pemisah,
        pakai_judul,
        kutip,
        desimal,
        cakupan,
        kolom,
        maks_berita,
        is_aktif,
    })
}

/// Cermin `kolomTeks`: bentuk tersimpan `app_bank_format.kolom`.
pub fn kolom_teks(kolom: &[KolomFormat]) -> String {
    serde_json::to_string(kolom).expect("kolom format")
}

// Susun baris transfer

#[derive(Clone, Debug, Deserialize)]
pub struct ItemTransfer {
    pub id_karyawan: String,
    pub nama_karyawan: String,
    #[serde(default)]
    pub kode_karyawan: String,
    pub net_salary: i64,
    #[serde(default)]
    pub id_keluar: String,
    #[serde(default)]
    pub bank: String,
    #[serde(default)]
    pub no_rekening: String,
    #[serde(default)]
    pub nama_rekening: String,
}

#[derive(Clone, Debug, Deserialize)]
pub struct RunTransfer {
    pub period_start: String,
    pub period_end: String,
}

#[derive(Clone, Debug, Deserialize)]
pub struct DebetTransfer {
    pub id_bank: String,
    pub no_rekening: String,
    pub nama_rekening: String,
}

#[derive(Clone, Debug, Deserialize)]
pub struct IsianKolom {
    pub isian: String,
}

/// Bagian format yang menentukan isi baris; `None` = Excel umum.
#[derive(Clone, Debug, Deserialize)]
pub struct FormatSusun {
    pub cakupan: String,
    pub kolom: Vec<IsianKolom>,
    #[serde(default)]
    pub maks_berita: Option<i64>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct MasukanTransfer {
    pub run: RunTransfer,
    pub item: Vec<ItemTransfer>,
    pub bank: Vec<BankBaris>,
    pub debet: DebetTransfer,
    pub format: Option<FormatSusun>,
    pub tanggal_efektif: String,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct BarisTransfer {
    pub nomor_urut: Option<i64>,
    pub id_karyawan: String,
    pub nama_karyawan: String,
    pub kode_karyawan: String,
    pub nama_bank: String,
    pub kode_bank: String,
    pub no_rekening: String,
    pub nama_rekening: String,
    pub nominal: i64,
    pub jenis: Option<&'static str>,
    pub tanda: Vec<&'static str>,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize)]
pub struct Jumlah {
    pub jumlah: i64,
    pub total: i64,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct JumlahBank {
    pub nama_bank: String,
    pub jumlah: i64,
    pub total: i64,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct PerJenis {
    pub sesama: Jumlah,
    pub antarbank: Jumlah,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct RingkasanTransfer {
    pub jumlah_baris: i64,
    pub total: i64,
    pub total_run: i64,
    pub selisih: i64,
    pub jumlah_manual: i64,
    pub total_manual: i64,
    pub jumlah_luar_cakupan: i64,
    pub total_luar_cakupan: i64,
    pub per_bank: Vec<JumlahBank>,
    pub per_jenis: PerJenis,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct SusunanTransfer {
    pub berita: String,
    pub rekening_debet: String,
    pub nama_debet: String,
    pub tanggal_efektif: String,
    pub baris: Vec<BarisTransfer>,
    pub manual: Vec<BarisTransfer>,
    pub luar_cakupan: Vec<BarisTransfer>,
    pub ringkasan: RingkasanTransfer,
}

/// Cermin `beritaTransfer`: dipangkas per karakter ke `maks`.
pub fn berita_transfer(run: &RunTransfer, maks: Option<i64>) -> String {
    let t = format!("Gaji {} s.d. {}", run.period_start, run.period_end);
    match maks {
        Some(n) => t.chars().take(usize::try_from(n).unwrap_or(0)).collect(),
        None => t,
    }
}

fn jumlahkan<'a>(daftar: impl IntoIterator<Item = &'a BarisTransfer>) -> Jumlah {
    daftar.into_iter().fold(Jumlah::default(), |j, r| Jumlah {
        jumlah: j.jumlah + 1,
        total: j.total + r.nominal,
    })
}

/// Cermin `susunTransfer`. Urutan pemeriksaan: tanda manual yang tidak
/// bergantung format, lalu cakupan, lalu `tanpa_kode_bank`. Baris di luar
/// cakupan bukan "manual": berkas lain (sesama/antarbank) memuatnya.
/// `nama_berbeda` dan `pegawai_keluar` hanya peringatan: barisnya tetap masuk,
/// karena gaji terakhir pegawai keluar tetap dibayar.
pub fn susun_transfer(masukan: &MasukanTransfer) -> SusunanTransfer {
    let format = masukan.format.as_ref();
    let pakai_kode = format.is_some_and(|f| f.kolom.iter().any(|k| k.isian == "kode_bank"));
    let cakupan = format.map_or("semua", |f| f.cakupan.as_str());
    let (mut baris, mut manual, mut luar) = (Vec::new(), Vec::new(), Vec::new());
    for it in &masukan.item {
        let no_rekening = it.no_rekening.trim().to_owned();
        let nama_rekening = it.nama_rekening.trim().to_owned();
        let teks_bank = it.bank.trim().to_owned();
        let b = cocok_bank(&teks_bank, &masukan.bank);
        let dikenal = b.filter(|b| b.is_aktif == 1);
        let jenis = dikenal.map(|b| jenis_transfer(&b.id_bank, &masukan.debet.id_bank));
        let mut tanda = Vec::new();
        if teks_bank.is_empty() || no_rekening.is_empty() {
            tanda.push("tanpa_rekening");
        } else if dikenal.is_none() {
            tanda.push("bank_tidak_dikenal");
        }
        if it.net_salary <= 0 {
            tanda.push("nominal_nol");
        }
        let keluar_cakupan = tanda.is_empty() && cakupan != "semua" && jenis != Some(cakupan);
        if tanda.is_empty()
            && !keluar_cakupan
            && pakai_kode
            && b.map_or(true, |b| b.kode.is_empty())
        {
            tanda.push("tanpa_kode_bank");
        }
        let masuk = tanda.is_empty() && !keluar_cakupan;
        if !nama_rekening.is_empty() && kunci_nama(&nama_rekening) != kunci_nama(&it.nama_karyawan)
        {
            tanda.push("nama_berbeda");
        }
        if !it.id_keluar.trim().is_empty() {
            tanda.push("pegawai_keluar");
        }
        let r = BarisTransfer {
            nomor_urut: masuk.then(|| baris.len() as i64 + 1),
            id_karyawan: it.id_karyawan.clone(),
            nama_karyawan: it.nama_karyawan.clone(),
            kode_karyawan: it.kode_karyawan.clone(),
            nama_bank: b.map_or(teks_bank, |b| b.nama.clone()),
            kode_bank: b.map(|b| b.kode.clone()).unwrap_or_default(),
            no_rekening,
            nama_rekening,
            nominal: it.net_salary,
            jenis,
            tanda,
        };
        if masuk {
            baris.push(r);
        } else if keluar_cakupan {
            luar.push(r);
        } else {
            manual.push(r);
        }
    }
    let mut per_bank: Vec<JumlahBank> = Vec::new();
    for r in &baris {
        match per_bank.iter_mut().find(|k| k.nama_bank == r.nama_bank) {
            Some(k) => {
                k.jumlah += 1;
                k.total += r.nominal;
            }
            None => per_bank.push(JumlahBank {
                nama_bank: r.nama_bank.clone(),
                jumlah: 1,
                total: r.nominal,
            }),
        }
    }
    let isi = jumlahkan(&baris);
    let total_run: i64 = masukan.item.iter().map(|it| it.net_salary).sum();
    let m = jumlahkan(&manual);
    let l = jumlahkan(&luar);
    let per_jenis = PerJenis {
        sesama: jumlahkan(baris.iter().filter(|r| r.jenis == Some("sesama"))),
        antarbank: jumlahkan(baris.iter().filter(|r| r.jenis == Some("antarbank"))),
    };
    SusunanTransfer {
        berita: berita_transfer(&masukan.run, format.and_then(|f| f.maks_berita)),
        rekening_debet: masukan.debet.no_rekening.clone(),
        nama_debet: masukan.debet.nama_rekening.clone(),
        tanggal_efektif: masukan.tanggal_efektif.clone(),
        ringkasan: RingkasanTransfer {
            jumlah_baris: isi.jumlah,
            total: isi.total,
            total_run,
            selisih: total_run - isi.total,
            jumlah_manual: m.jumlah,
            total_manual: m.total,
            jumlah_luar_cakupan: l.jumlah,
            total_luar_cakupan: l.total,
            per_bank,
            per_jenis,
        },
        baris,
        manual,
        luar_cakupan: luar,
    }
}

/// Pilihan pratinjau/unduhan yang sudah divalidasi.
#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct PilihanTransfer {
    pub run_id: String,
    pub id_rekening: String,
    pub id_format: Option<String>,
    pub tanggal_efektif: Option<String>,
}

/// Cermin `validasiPilihanTransfer`. Format kosong = Excel umum; tanggal
/// efektif kosong = hari ini WIB jam database.
pub fn validasi_pilihan_transfer(draft: &Value) -> Result<PilihanTransfer, String> {
    objek_ketat(
        draft,
        &["run_id", "id_rekening", "id_format", "tanggal_efektif"],
    )?;
    let run_id = payload_text(draft, "run_id").ok_or("Proses gaji wajib dipilih.")?;
    let id_rekening = payload_text(draft, "id_rekening").ok_or("Rekening debet wajib dipilih.")?;
    let tanggal_efektif = payload_text(draft, "tanggal_efektif");
    if tanggal_efektif
        .as_deref()
        .is_some_and(|t| !is_valid_date(t))
    {
        return Err("Tanggal efektif tidak valid.".into());
    }
    Ok(PilihanTransfer {
        run_id,
        id_rekening,
        id_format: payload_text(draft, "id_format"),
        tanggal_efektif,
    })
}

/// Cermin `catatanUnduh`: isi `payroll_audit_logs.notes`. Kunci urut abjad
/// (serde_json tanpa `preserve_order`), sama dengan `JSON.stringify` di TS.
pub fn catatan_unduh(
    format: Option<&str>,
    pilihan: &PilihanTransfer,
    susunan: &SusunanTransfer,
) -> String {
    json!({
        "format": format,
        "id_format": pilihan.id_format,
        "id_rekening": pilihan.id_rekening,
        "jumlah_baris": susunan.ringkasan.jumlah_baris,
        "rekening_debet": susunan.rekening_debet,
        "tanggal_efektif": susunan.tanggal_efektif,
        "total": susunan.ringkasan.total,
    })
    .to_string()
}

// Akses cloud

fn aktif(b: &Value, kunci: &str) -> bool {
    angka(b, kunci) == 1
}

/// Baris bank untuk layar: `alias` sebagai larik.
fn bank_tampil(mut b: Value) -> Value {
    b["alias"] = json!(baca_alias(&teks(&b, "alias")));
    b
}

/// Baris format untuk layar dan perender: `kolom` sebagai larik, `pemisah`
/// null untuk xlsx. Kolom yang tidak lagi sah menjadi null, dan format itu
/// tidak bisa dipakai mengunduh.
fn format_tampil(mut f: Value) -> Value {
    let kolom = serde_json::from_str::<Value>(&teks(&f, "kolom"))
        .ok()
        .and_then(|v| validasi_kolom(Some(&v)).ok());
    f["kolom"] = json!(kolom);
    f
}

fn dari_nilai<T: serde::de::DeserializeOwned>(v: Value) -> Result<T, CommandError> {
    serde_json::from_value(v).map_err(|_| CommandError::internal())
}

/// `desktop_transfer_banks`: bank aktif untuk isian profil keuangan (sesi).
pub async fn bank_aktif(client: &TursoClient) -> Result<Value, CommandError> {
    client.ensure_schema_current().await?;
    let bank: Vec<Value> = baris(client, BANK_SQL, vec![])
        .await?
        .into_iter()
        .filter(|b| aktif(b, "is_aktif"))
        .map(bank_tampil)
        .collect();
    Ok(json!({ "bank": bank }))
}

/// `desktop_transfer_settings`: `atur` = semua bank, rekening, dan format
/// (Pengaturan); selain itu hanya yang aktif (layar berkas transfer).
pub async fn pengaturan(client: &TursoClient, atur: bool) -> Result<Value, CommandError> {
    client.ensure_schema_current().await?;
    let bank: Vec<Value> = baris(client, BANK_SQL, vec![])
        .await?
        .into_iter()
        .filter(|b| atur || aktif(b, "is_aktif"))
        .map(bank_tampil)
        .collect();
    let rekening: Vec<Value> = baris(client, REKENING_SQL, vec![])
        .await?
        .into_iter()
        .filter(|r| atur || (aktif(r, "is_aktif") && aktif(r, "bank_aktif")))
        .collect();
    let format: Vec<Value> = baris(client, FORMAT_SQL, vec![])
        .await?
        .into_iter()
        .filter(|f| atur || aktif(f, "is_aktif"))
        .map(format_tampil)
        .collect();
    Ok(json!({ "bank": bank, "rekening": rekening, "format": format, "atur": atur }))
}

/// Bank harus ada; aktif kecuali tidak berubah dari yang tersimpan.
async fn periksa_bank(
    client: &TursoClient,
    id_bank: &str,
    tetap: bool,
) -> Result<(), CommandError> {
    let b = satu(client, BANK_SATU_SQL, vec![json!(id_bank)])
        .await?
        .ok_or_else(|| galat("Bank tidak ditemukan."))?;
    if !tetap && !aktif(&b, "is_aktif") {
        return Err(galat(PESAN_BANK_NONAKTIF));
    }
    Ok(())
}

/// Baris tersimpan berid `id`; galat bila `id` diisi tetapi tidak ditemukan.
fn baris_lama<'a>(
    daftar: &'a [Value],
    kunci: &str,
    id: Option<&str>,
    apa: &str,
) -> Result<Option<&'a Value>, CommandError> {
    let Some(id) = id else { return Ok(None) };
    daftar
        .iter()
        .find(|b| teks(b, kunci) == id)
        .map(Some)
        .ok_or_else(|| galat(format!("{apa} tidak ditemukan.")))
}

/// `desktop_transfer_settings_save`: draft `{ aksi, id, data }` dengan aksi
/// `bank`, `rekening`, atau `format`; nonaktifkan = simpan `is_aktif = 0`
/// (tanpa hapus, karena `hr_profil.bank` merujuk nama bank). Keunikan nama
/// diperiksa di sini, bukan di skema.
pub async fn simpan_pengaturan(
    client: &TursoClient,
    oleh: &str,
    draft: &Value,
) -> Result<Value, CommandError> {
    objek_ketat(draft, &["aksi", "id", "data"]).map_err(galat)?;
    let aksi = payload_text(draft, "aksi").unwrap_or_default();
    if !AKSI_PENGATURAN.contains(&aksi.as_str()) {
        return Err(galat(PESAN_AKSI_PENGATURAN));
    }
    let id = payload_text(draft, "id");
    let id = id.as_deref();
    let data = draft.get("data").cloned().unwrap_or(Value::Null);
    client.ensure_schema_current().await?;
    let id_baru = match aksi.as_str() {
        "bank" => {
            let semua = baris(client, BANK_SQL, vec![]).await?;
            let lama = baris_lama(&semua, "id_bank", id, "Bank")?;
            let sah =
                validasi_bank(&data, lama.map(|l| teks(l, "nama")).as_deref()).map_err(galat)?;
            if let Some(nama) = bank_bentrok(id, &sah, &dari_nilai::<Vec<BankBaris>>(json!(semua))?)
            {
                return Err(galat(pesan_bank_ganda(&nama)));
            }
            let id = id.map_or_else(|| new_id("bnk-"), str::to_owned);
            let alias = serde_json::to_string(&sah.alias).map_err(|_| CommandError::internal())?;
            tulis(
                client,
                SIMPAN_BANK_SQL,
                vec![
                    json!(id),
                    json!(sah.nama),
                    json!(sah.kode),
                    json!(alias),
                    json!(sah.is_aktif),
                    json!(oleh),
                ],
            )
            .await?;
            id
        }
        "rekening" => {
            let semua = baris(client, REKENING_SQL, vec![]).await?;
            let lama = baris_lama(&semua, "id_rekening", id, "Rekening")?;
            let sah = validasi_rekening(&data).map_err(galat)?;
            let tetap = lama.is_some_and(|l| teks(l, "id_bank") == sah.id_bank);
            periksa_bank(client, &sah.id_bank, tetap).await?;
            if rekening_bentrok(id, &sah, &dari_nilai::<Vec<RekeningBaris>>(json!(semua))?) {
                return Err(galat(PESAN_REKENING_GANDA));
            }
            let id = id.map_or_else(|| new_id("rek-"), str::to_owned);
            tulis(
                client,
                SIMPAN_REKENING_SQL,
                vec![
                    json!(id),
                    json!(sah.id_bank),
                    json!(sah.no_rekening),
                    json!(sah.nama_rekening),
                    json!(sah.keterangan),
                    json!(sah.is_aktif),
                    json!(oleh),
                ],
            )
            .await?;
            id
        }
        _ => {
            let semua = baris(client, FORMAT_SQL, vec![]).await?;
            let lama = baris_lama(&semua, "id_format", id, "Format")?;
            let sah = validasi_format(&data).map_err(galat)?;
            if let Some(id_bank) = &sah.id_bank {
                let tetap = lama.is_some_and(|l| teks(l, "id_bank") == *id_bank);
                periksa_bank(client, id_bank, tetap).await?;
            }
            let kunci = kunci_nama(&sah.nama);
            if semua.iter().any(|f| {
                Some(teks(f, "id_format").as_str()) != id && kunci_nama(&teks(f, "nama")) == kunci
            }) {
                return Err(galat(PESAN_FORMAT_GANDA));
            }
            let id = id.map_or_else(|| new_id("fmt-"), str::to_owned);
            tulis(
                client,
                SIMPAN_FORMAT_SQL,
                vec![
                    json!(id),
                    json!(sah.nama),
                    json!(sah.id_bank),
                    json!(sah.jenis),
                    json!(sah.pemisah),
                    json!(sah.pakai_judul),
                    json!(sah.kutip),
                    json!(sah.desimal),
                    json!(sah.cakupan),
                    json!(kolom_teks(&sah.kolom)),
                    json!(sah.maks_berita),
                    json!(sah.is_aktif),
                    json!(oleh),
                ],
            )
            .await?;
            id
        }
    };
    Ok(json!({ "sukses": true, "id": id_baru }))
}

/// `desktop_transfer_preview` (`catat = false`) dan `desktop_transfer_export`
/// (`catat = true`): baris berkas satu run `APPROVED`/`PAID`, rekening pegawai
/// dibaca SAAT INI dari `hr_profil`. Unduhan dicatat `TRANSFER_EXPORT`
/// langsung di cloud; status run tidak berubah. `riwayat` = unduhan SEBELUM
/// permintaan ini, untuk peringatan unggahan ganda.
pub async fn berkas_transfer(
    client: &TursoClient,
    oleh: &str,
    draft: &Value,
    catat: bool,
) -> Result<Value, CommandError> {
    let pilihan = validasi_pilihan_transfer(draft).map_err(galat)?;
    client.ensure_schema_current().await?;
    let run = satu(client, RUN_TRANSFER_SQL, vec![json!(pilihan.run_id)])
        .await?
        .ok_or_else(|| galat(PESAN_RUN_TIDAK_ADA))?;
    let status = teks(&run, "status");
    if !STATUS_RUN_TRANSFER.contains(&status.as_str()) {
        return Err(galat(PESAN_STATUS_RUN));
    }
    let debet = baris(client, REKENING_SQL, vec![])
        .await?
        .into_iter()
        .find(|r| teks(r, "id_rekening") == pilihan.id_rekening)
        .filter(|r| aktif(r, "is_aktif") && aktif(r, "bank_aktif"))
        .ok_or_else(|| galat(PESAN_DEBET_NONAKTIF))?;
    let format = match &pilihan.id_format {
        Some(id) => Some(
            baris(client, FORMAT_SQL, vec![])
                .await?
                .into_iter()
                .find(|f| teks(f, "id_format") == *id)
                .filter(|f| aktif(f, "is_aktif"))
                .map(format_tampil)
                .filter(|f| !f["kolom"].is_null())
                .ok_or_else(|| galat(PESAN_FORMAT_NONAKTIF))?,
        ),
        None => None,
    };
    let tanggal_efektif = match &pilihan.tanggal_efektif {
        Some(t) => t.clone(),
        None => hari_ini(client).await?,
    };
    let masukan = MasukanTransfer {
        run: dari_nilai(run.clone())?,
        item: dari_nilai(json!(
            baris(client, BARIS_TRANSFER_SQL, vec![json!(pilihan.run_id)]).await?
        ))?,
        bank: dari_nilai(json!(baris(client, BANK_SQL, vec![]).await?))?,
        debet: dari_nilai(debet.clone())?,
        format: format.clone().map(dari_nilai).transpose()?,
        tanggal_efektif,
    };
    let susunan = susun_transfer(&masukan);
    let riwayat = baris(client, RIWAYAT_UNDUH_SQL, vec![json!(pilihan.run_id)]).await?;
    if catat {
        let nama_format = format.as_ref().map(|f| teks(f, "nama"));
        let catatan = catatan_unduh(nama_format.as_deref(), &pilihan, &susunan);
        tulis(
            client,
            CATAT_UNDUH_SQL,
            vec![
                json!(new_id("trf-")),
                json!(pilihan.run_id),
                json!(status),
                json!(oleh),
                json!(catatan),
            ],
        )
        .await?;
    }
    Ok(json!({
        "run": run,
        "debet": debet,
        "format": format,
        "susunan": susunan,
        "riwayat": riwayat,
        "dicatat": catat,
    }))
}

#[cfg(test)]
mod tests {
    //! Vektor bersama `transfer.vektor.json` dan alur cloud di atas
    //! `TursoClient::local_file`, data sama dengan `services/transfer.test.ts`.
    use super::*;

    const VEKTOR: &str = include_str!("../../../src/lib/validations/transfer.vektor.json");

    fn vektor() -> Value {
        serde_json::from_str(VEKTOR).expect("transfer.vektor.json sah")
    }

    fn cocok<T: Serialize>(hasil: Result<T, String>, k: &Value) {
        match k["galat"].as_str() {
            Some(pesan) => assert_eq!(hasil.err().as_deref(), Some(pesan), "{}", k["nama"]),
            None => assert_eq!(json!(hasil.expect("sah")), k["hasil"], "{}", k["nama"]),
        }
    }

    fn bank(v: &Value) -> Vec<BankBaris> {
        serde_json::from_value(v.clone()).expect("bank vektor")
    }

    #[test]
    fn transfer_vektor_validasi() {
        let v = vektor();
        for k in v["bank"].as_array().expect("bank") {
            cocok(validasi_bank(&k["draft"], k["nama_lama"].as_str()), k);
        }
        for k in v["rekening"].as_array().expect("rekening") {
            cocok(validasi_rekening(&k["draft"]), k);
        }
        for k in v["format"].as_array().expect("format") {
            cocok(validasi_format(&k["draft"]), k);
        }
        for k in v["pilihan"].as_array().expect("pilihan") {
            cocok(validasi_pilihan_transfer(&k["draft"]), k);
        }
    }

    #[test]
    fn transfer_vektor_cocok_dan_bentrok() {
        let v = vektor();
        let daftar = bank(&v["daftar_bank"]);
        for k in v["cocok_bank"].as_array().expect("cocok_bank") {
            let hasil = cocok_bank(k["teks"].as_str().unwrap_or_default(), &daftar)
                .map(|b| b.id_bank.clone());
            assert_eq!(json!(hasil), k["hasil"], "{}", k["nama"]);
        }
        for k in v["jenis_transfer"].as_array().expect("jenis_transfer") {
            let hasil = jenis_transfer(
                k["bank_pegawai"].as_str().unwrap(),
                k["bank_debet"].as_str().unwrap(),
            );
            assert_eq!(hasil, k["hasil"].as_str().unwrap(), "{}", k["nama"]);
        }
        for k in v["bank_bentrok"].as_array().expect("bank_bentrok") {
            let sah = validasi_bank(&k["draft"], None).expect("draft sah");
            assert_eq!(
                json!(bank_bentrok(k["id"].as_str(), &sah, &daftar)),
                k["hasil"],
                "{}",
                k["nama"]
            );
        }
    }

    #[test]
    fn transfer_vektor_susun() {
        let v = vektor();
        for k in v["susun"].as_array().expect("susun") {
            let masukan: MasukanTransfer =
                serde_json::from_value(k["masukan"].clone()).expect("masukan");
            let hasil = susun_transfer(&masukan);
            assert_eq!(json!(hasil), k["hasil"], "{}", k["nama"]);
            assert_eq!(
                hasil.ringkasan.total,
                hasil.baris.iter().map(|r| r.nominal).sum::<i64>(),
                "{}",
                k["nama"]
            );
        }
    }

    #[test]
    fn transfer_bank_bawaan_sah_dan_tidak_bentrok() {
        let daftar: Vec<BankBaris> = bank_bawaan()
            .iter()
            .map(|b| BankBaris {
                id_bank: b.id_bank.clone(),
                nama: b.nama.clone(),
                kode: b.kode.clone().unwrap_or_default(),
                alias: serde_json::to_string(&b.alias).unwrap(),
                is_aktif: 1,
            })
            .collect();
        for b in bank_bawaan() {
            let sah = validasi_bank(
                &json!({ "nama": b.nama, "kode": b.kode, "alias": b.alias }),
                None,
            )
            .expect("bank bawaan sah");
            assert_eq!(
                bank_bentrok(Some(&b.id_bank), &sah, &daftar),
                None,
                "{}",
                b.nama
            );
            assert_eq!(
                b.id_bank,
                format!("bnk-{}", b.kode.as_deref().unwrap_or_default())
            );
        }
    }

    fn klien(origin: &str, hub: &std::path::Path) -> TursoClient {
        TursoClient::local_file(
            url::Url::parse(origin).expect("origin uji"),
            hub,
            reqwest::Client::new(),
        )
    }

    /// Database bersentinel `-2048` (v72) menerima kesepuluh tabel v73, seed
    /// bank dan jenis reimbursement, serta lima izin lewat
    /// `ensure_schema_current`; seed yang dijalankan dua kali tidak menimpa
    /// bank yang disunting, dan Admin tidak memegang `hr.reimburse.decide|pay`.
    #[test]
    fn transfer_sentinel_2048_memicu_v73() {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .build()
            .expect("runtime uji");
        runtime.block_on(async {
            let dir = tempfile::tempdir().expect("direktori sementara");
            let hub = dir.path().join("sppg-hub.db");
            let client = klien("https://sentinel-2048.sppg.invalid", &hub);
            client.ensure_schema().await.expect("provisioning lokal");
            let c = rusqlite::Connection::open(&hub).expect("buka hub");
            c.execute_batch(
                "DROP TABLE app_bank; DROP TABLE app_bank_rekening; DROP TABLE app_bank_format; DROP TABLE app_lapor_setting;
                 DROP TABLE hr_reimburse_jenis; DROP TABLE hr_reimburse; DROP TABLE hr_reimburse_keputusan;
                 DROP TABLE hr_reimburse_berkas; DROP TABLE hr_reimburse_bayar; DROP TABLE hr_reimburse_bayar_baris;
                 DELETE FROM role_permission WHERE permission_key LIKE 'hr.reimburse.%';
                 DELETE FROM app_permission WHERE permission_key LIKE 'hr.reimburse.%';
                 DELETE FROM schema_migration WHERE version IN (73, -2049);",
            )
            .expect("siapkan database v72");
            client.ensure_schema_current().await.expect("skema mutakhir");
            let hitung = |sql: &str| c.query_row(sql, [], |r| r.get::<_, i64>(0)).expect(sql);
            assert_eq!(
                hitung("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN ('app_bank', 'app_bank_rekening', 'app_bank_format', 'app_lapor_setting', 'hr_reimburse_jenis', 'hr_reimburse', 'hr_reimburse_keputusan', 'hr_reimburse_berkas', 'hr_reimburse_bayar', 'hr_reimburse_bayar_baris');"),
                10
            );
            assert_eq!(hitung("SELECT COUNT(*) FROM schema_migration WHERE version IN (73, -2049);"), 2);
            assert_eq!(hitung("SELECT COUNT(*) FROM app_bank WHERE is_bawaan = 1;"), bank_bawaan().len() as i64);
            assert_eq!(hitung("SELECT COUNT(*) FROM hr_reimburse_jenis;"), 5);
            assert_eq!(hitung("SELECT COUNT(*) FROM app_permission WHERE permission_key LIKE 'hr.reimburse.%';"), 5);
            assert_eq!(
                hitung("SELECT COUNT(*) FROM role_permission rp JOIN app_role r ON r.id = rp.role_id WHERE r.role_key = 'admin' AND rp.permission_key IN ('hr.reimburse.decide', 'hr.reimburse.pay', 'hr.reimburse.view');"),
                0
            );
            // Seed kedua kali: bank yang disunting tetap.
            c.execute_batch(
                "UPDATE app_bank SET nama = 'BCA Sekolah' WHERE id_bank = 'bnk-014';
                 DELETE FROM schema_migration WHERE version IN (73, -2049);",
            )
            .expect("sunting bank");
            client.ensure_schema_current().await.expect("skema mutakhir lagi");
            assert_eq!(hitung("SELECT COUNT(*) FROM app_bank WHERE id_bank = 'bnk-014' AND nama = 'BCA Sekolah';"), 1);
            assert_eq!(hitung("SELECT COUNT(*) FROM app_bank;"), bank_bawaan().len() as i64);
            assert_eq!(hitung("SELECT COUNT(*) FROM hr_reimburse_jenis;"), 5);
        });
    }

    /// Alur 8a, data sama dengan `services/transfer.test.ts`: pengaturan
    /// (ganti nama bank menambah alias, rekening ganda ditolak), run `DRAFT`
    /// ditolak, pratinjau tanpa jejak, unduh `APPROVED` mencatat
    /// `TRANSFER_EXPORT`, `PAID` tetap boleh dan memuat riwayat.
    #[test]
    fn transfer_alur_cloud() {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .build()
            .expect("runtime uji");
        runtime.block_on(async {
            let dir = tempfile::tempdir().expect("direktori sementara");
            let hub = dir.path().join("sppg-hub.db");
            let client = klien("https://transfer.sppg.invalid", &hub);
            client.ensure_schema().await.expect("provisioning lokal");
            let c = rusqlite::Connection::open(&hub).expect("buka hub");
            c.execute_batch(include_str!("../../../src/lib/services/transfer.uji.sql")).expect("data uji");

            // Ganti nama bank bawaan: nama lama masuk alias.
            let bank = json!({ "aksi": "bank", "id": "bnk-451", "data": { "nama": "Bank Syariah Indonesia", "kode": "451", "alias": ["BSM"] } });
            simpan_pengaturan(&client, "admin", &bank).await.expect("ubah bank");
            let alias: String =
                c.query_row("SELECT alias FROM app_bank WHERE id_bank = 'bnk-451';", [], |r| r.get(0)).expect("alias");
            assert_eq!(alias, r#"["BSM","BSI"]"#);
            let rek = json!({ "aksi": "rekening", "data": { "id_bank": "bnk-014", "no_rekening": "123-456-7890", "nama_rekening": "Yayasan Uji" } });
            let id_rek = simpan_pengaturan(&client, "admin", &rek).await.expect("rekening")["id"].as_str().unwrap().to_owned();
            let ganda = simpan_pengaturan(&client, "admin", &rek).await.expect_err("rekening ganda");
            assert_eq!(ganda.message, PESAN_REKENING_GANDA);

            let draft = |run: &str| json!({ "run_id": run, "id_rekening": id_rek, "tanggal_efektif": "2026-11-25" });
            let draf = berkas_transfer(&client, "bendahara", &draft("run-draft"), false).await.expect_err("run DRAFT");
            assert_eq!(draf.message, PESAN_STATUS_RUN);

            let pratinjau = berkas_transfer(&client, "bendahara", &draft("run-ok"), false).await.expect("pratinjau");
            assert_eq!(pratinjau["susunan"]["ringkasan"]["jumlah_baris"], 2);
            assert_eq!(pratinjau["susunan"]["ringkasan"]["total"], 7_500_000);
            assert_eq!(pratinjau["susunan"]["ringkasan"]["jumlah_manual"], 1);
            assert_eq!(pratinjau["susunan"]["baris"][0]["jenis"], "sesama");
            assert_eq!(pratinjau["susunan"]["baris"][1]["jenis"], "antarbank");
            assert_eq!(pratinjau["susunan"]["baris"][1]["tanda"], json!(["pegawai_keluar"]));
            let jejak = |run: &str| {
                c.query_row(
                    "SELECT COUNT(*) FROM payroll_audit_logs WHERE payroll_run_id = ?1 AND action = 'TRANSFER_EXPORT';",
                    [run],
                    |r| r.get::<_, i64>(0),
                )
                .unwrap()
            };
            assert_eq!(jejak("run-ok"), 0);

            berkas_transfer(&client, "bendahara", &draft("run-ok"), true).await.expect("unduh");
            assert_eq!(jejak("run-ok"), 1);
            let notes: String = c
                .query_row("SELECT notes FROM payroll_audit_logs WHERE action = 'TRANSFER_EXPORT';", [], |r| r.get(0))
                .unwrap();
            assert_eq!(
                notes,
                r#"{"format":null,"id_format":null,"id_rekening":"ID","jumlah_baris":2,"rekening_debet":"1234567890","tanggal_efektif":"2026-11-25","total":7500000}"#
                    .replace("ID", &id_rek)
            );

            let dibayar = berkas_transfer(&client, "bendahara", &draft("run-paid"), true).await.expect("PAID boleh");
            assert_eq!(dibayar["riwayat"].as_array().unwrap().len(), 0);
            let ulang = berkas_transfer(&client, "bendahara", &draft("run-paid"), false).await.expect("PAID lagi");
            assert_eq!(ulang["riwayat"].as_array().unwrap().len(), 1);
        });
    }
}
