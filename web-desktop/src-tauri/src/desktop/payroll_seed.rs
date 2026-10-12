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
                ("tax_rules", 125),
                ("bpjs_rules", 8)
            ]
        );
        let ids = default_rate_ids();
        assert_eq!(ids.len(), 138);
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
