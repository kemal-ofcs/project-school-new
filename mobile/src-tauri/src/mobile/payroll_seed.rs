// BERKAS INI HASIL SALIN OTOMATIS dari web-desktop oleh
// `mobile/scripts/sync-rust-modules.ts`. JANGAN disunting dengan tangan —
// perubahannya akan tertimpa diam-diam pada sinkronisasi berikutnya.
// Sunting sumbernya: `web-desktop/src-tauri/src/desktop/payroll_seed.rs`.

//! Tabel tarif default payroll: SATU sumber untuk SQLite lokal, Turso cloud
//! lewat Rust, DAN database cloud yang diprovisioning Web.
//!
//! Isinya dibaca dari `src/lib/validations/tarif-payroll-bawaan.json`, berkas
//! yang sama dengan yang diimpor `db-migrations.ts`. Dulu seed ditulis dengan
//! tangan di tiga tempat dan langsung menyimpang: `storage.rs` memakai id
//! bertanda hubung (`tax-p17-1`, `bpjs-jkk`) sementara `turso.rs` memakai garis
//! bawah, sehingga bracket PASAL_17 menjadi dobel di cloud; dan Web terus
//! menanam tarif 2024 tanpa TER, sehingga PPh 21 di slip Web selalu nol.
//!
//! Menambah atau mengubah tarif default WAJIB dilakukan di berkas JSON itu saja.

use std::sync::OnceLock;

use rusqlite::types::Value as SqlValue;
use serde::Deserialize;
use serde_json::Value;

#[derive(Debug, Deserialize)]
pub struct TabelSeed {
    pub nama: String,
    pub kolom: Vec<String>,
    pub baris: Vec<Vec<Value>>,
}

#[derive(Debug, Deserialize)]
pub struct TarifBawaan {
    pub tabel: Vec<TabelSeed>,
    /// Id seed keliru dari versi lama, dibersihkan sekali di lokal maupun
    /// cloud. Daftarnya eksplisit supaya pembersihan tidak pernah menyentuh
    /// baris tarif yang dibuat admin.
    pub id_lama: Vec<String>,
    /// Nilai seed SEBELUM v67 untuk lapis TER B/C yang salah dan batas JP lama.
    pub koreksi_v67: KoreksiV67,
}

#[derive(Debug, Deserialize)]
pub struct PajakLama {
    pub id: String,
    pub bracket_min: i64,
    pub bracket_max: Option<i64>,
    pub rate_percentage: f64,
}

#[derive(Debug, Deserialize)]
pub struct KoreksiV67 {
    pub pajak_lama: Vec<PajakLama>,
    pub jp_wage_cap_lama: i64,
}

/// v67: lapis TER B/C seed lama diganti hanya bila ketiga nilainya masih
/// persis seed lama (Q-7 (a)); lapis yang disunting admin dibiarkan.
/// Cermin `KOREKSI_PAJAK_SQL` di `db-migrations.ts`.
pub const KOREKSI_PAJAK_SQL: &str = "UPDATE tax_rules SET bracket_min = ?1, bracket_max = ?2, rate_percentage = ?3 WHERE id = ?4 AND bracket_min = ?5 AND bracket_max IS ?6 AND rate_percentage = ?7;";

/// v67: batas upah JP hanya untuk baris yang masih bernilai seed lama.
/// Dicocokkan lewat kode karena `bpjs_rules.component_code` UNIQUE.
/// Cermin `KOREKSI_JP_SQL` di `db-migrations.ts`.
pub const KOREKSI_JP_SQL: &str = "UPDATE bpjs_rules SET wage_cap = ?1, effective_date = ?2 WHERE component_code = ?3 AND wage_cap = ?4;";

fn baris_seed(nama: &str, id: &str) -> Option<&'static [Value]> {
    tarif_bawaan()
        .tabel
        .iter()
        .find(|tabel| tabel.nama == nama)?
        .baris
        .iter()
        .find(|baris| baris.first().and_then(Value::as_str) == Some(id))
        .map(Vec::as_slice)
}

/// Argumen `KOREKSI_PAJAK_SQL` per lapis: nilai baru dari seed, lama dari JSON.
pub fn koreksi_pajak_args() -> Vec<Vec<Value>> {
    tarif_bawaan()
        .koreksi_v67
        .pajak_lama
        .iter()
        .map(|lama| {
            let baru = baris_seed("tax_rules", &lama.id).expect("koreksi tanpa seed baru");
            vec![
                baru[2].clone(),
                baru[3].clone(),
                baru[4].clone(),
                Value::from(lama.id.clone()),
                Value::from(lama.bracket_min),
                lama.bracket_max.map_or(Value::Null, Value::from),
                Value::from(lama.rate_percentage),
            ]
        })
        .collect()
}

/// Argumen `KOREKSI_JP_SQL` untuk `JP_EMP` dan `JP_CO`.
pub fn koreksi_jp_args() -> Vec<Vec<Value>> {
    ["bpjs_jp_emp", "bpjs_jp_co"]
        .iter()
        .map(|id| {
            let baru = baris_seed("bpjs_rules", id).expect("seed JP");
            vec![
                baru[4].clone(),
                baru[5].clone(),
                baru[1].clone(),
                Value::from(tarif_bawaan().koreksi_v67.jp_wage_cap_lama),
            ]
        })
        .collect()
}

pub fn tarif_bawaan() -> &'static TarifBawaan {
    static TARIF: OnceLock<TarifBawaan> = OnceLock::new();
    TARIF.get_or_init(|| {
        serde_json::from_str(include_str!(
            "../../../src/lib/validations/tarif-payroll-bawaan.json"
        ))
        .expect("tarif-payroll-bawaan.json tidak valid")
    })
}

/// Satu `INSERT OR IGNORE` berparameter per baris tarif. Idempoten: tarif
/// yang sudah disesuaikan admin tidak pernah ditimpa.
pub fn seed_statements() -> Vec<(String, Vec<Value>)> {
    tarif_bawaan()
        .tabel
        .iter()
        .flat_map(|tabel| {
            let sql = format!(
                "INSERT OR IGNORE INTO {} ({}) VALUES ({});",
                tabel.nama,
                tabel.kolom.join(", "),
                vec!["?"; tabel.kolom.len()].join(", ")
            );
            tabel
                .baris
                .iter()
                .map(move |baris| (sql.clone(), baris.clone()))
        })
        .collect()
}

/// Nilai JSON seed dalam bentuk yang diterima rusqlite.
pub fn sql_values(baris: &[Value]) -> Vec<SqlValue> {
    baris
        .iter()
        .map(|value| match value {
            Value::Null => SqlValue::Null,
            Value::Number(number) => number
                .as_i64()
                .map(SqlValue::Integer)
                .or_else(|| number.as_f64().map(SqlValue::Real))
                .unwrap_or(SqlValue::Null),
            Value::String(text) => SqlValue::Text(text.clone()),
            other => SqlValue::Text(other.to_string()),
        })
        .collect()
}

/// Id baris default bawaan aplikasi (kolom pertama setiap baris).
///
/// Baris ini disediakan oleh seed di kedua sisi, jadi TIDAK boleh ikut
/// didorong ulang lewat backfill outbox; kalau ikut, instalasi baru akan
/// menimpa tarif yang sudah disesuaikan admin dengan nilai default.
pub fn default_rate_ids() -> Vec<&'static str> {
    tarif_bawaan()
        .tabel
        .iter()
        .flat_map(|tabel| tabel.baris.iter())
        .filter_map(|baris| baris.first().and_then(Value::as_str))
        .collect()
}

pub fn legacy_rate_ids() -> &'static [String] {
    &tarif_bawaan().id_lama
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tarif_bawaan_lengkap_dan_tidak_memuat_id_lama() {
        let jumlah: Vec<(&str, usize)> = tarif_bawaan()
            .tabel
            .iter()
            .map(|tabel| (tabel.nama.as_str(), tabel.baris.len()))
            .collect();
        assert_eq!(
            jumlah,
            vec![
                ("overtime_tier_rules", 5),
                ("tax_rules", 130),
                ("bpjs_rules", 8)
            ]
        );
        let ids = default_rate_ids();
        assert_eq!(ids.len(), 143);
        // TER A 44, B 40, C 41 lapis (PP 58/2023); 55 lapis lama dikoreksi v67.
        assert_eq!(koreksi_pajak_args().len(), 55);
        assert_eq!(koreksi_jp_args().len(), 2);
        assert_eq!(koreksi_jp_args()[0][0], Value::from(11_086_300));
        for lama in legacy_rate_ids() {
            assert!(
                !ids.contains(&lama.as_str()),
                "id lama masih ditanam: {lama}"
            );
        }
        for tabel in &tarif_bawaan().tabel {
            for baris in &tabel.baris {
                assert_eq!(baris.len(), tabel.kolom.len(), "{}", tabel.nama);
            }
        }
    }
}
