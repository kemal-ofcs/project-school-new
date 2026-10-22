// BERKAS INI HASIL SALIN OTOMATIS dari web-desktop oleh
// `mobile/scripts/sync-rust-modules.ts`. JANGAN disunting dengan tangan —
// perubahannya akan tertimpa diam-diam pada sinkronisasi berikutnya.
// Sunting sumbernya: `web-desktop/src-tauri/src/desktop/berkas_sekolah.rs`.

//! Berkas pendaftar dan siswa (`pmb_berkas`, `siswa_berkas` v59, cloud-only).
//!
//! Kembaran TypeScript: `src/lib/validations/berkas-sekolah.ts` (aturan + SQL)
//! dan `src/lib/services/berkas-sekolah.ts`. Keduanya diuji dengan vektor yang
//! sama di `berkas-sekolah.vektor.json`; mengubah satu sisi saja membuat berkas
//! yang lolos di Web ditolak di Desktop, atau sebaliknya.

use serde_json::{json, Value};

use super::{
    models::CommandError,
    turso::{Statement, TursoClient},
};

pub const JENIS_BERKAS: &[&str] = &[
    "kartu_keluarga",
    "akta_lahir",
    "ijazah",
    "rapor",
    "foto",
    "lainnya",
];
pub const MIME_BERKAS: &[&str] = &["image/jpeg", "image/png", "image/webp", "application/pdf"];
pub const MAKS_BYTE_BERKAS: usize = 200 * 1024;

pub const SQL_HAPUS_JENIS_BERKAS_PMB: &str = "DELETE FROM pmb_berkas WHERE id_pendaftar = ? AND jenis = ? AND EXISTS (SELECT 1 FROM pmb_pendaftar WHERE id_pendaftar = ? AND status <> 'Terdaftar')";
pub const SQL_SIMPAN_BERKAS_PMB: &str = "INSERT INTO pmb_berkas (id_berkas, id_pendaftar, jenis, nama_file, mime, ukuran_byte, konten_base64, created_at) SELECT ?, ?, ?, ?, ?, ?, ?, datetime('now') WHERE EXISTS (SELECT 1 FROM pmb_pendaftar WHERE id_pendaftar = ? AND status <> 'Terdaftar')";
pub const SQL_HAPUS_BERKAS_PMB: &str = "DELETE FROM pmb_berkas WHERE id_berkas = ?";
pub const SQL_HAPUS_JENIS_BERKAS_SISWA: &str = "DELETE FROM siswa_berkas WHERE id_siswa = ? AND jenis = ? AND EXISTS (SELECT 1 FROM siswa_data WHERE id_siswa = ?)";
pub const SQL_SIMPAN_BERKAS_SISWA: &str = "INSERT INTO siswa_berkas (id_berkas, id_siswa, jenis, nama_file, mime, ukuran_byte, konten_base64, diunggah_oleh, created_at) SELECT ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+7 hours') WHERE EXISTS (SELECT 1 FROM siswa_data WHERE id_siswa = ?)";
pub const SQL_HAPUS_BERKAS_SISWA: &str = "DELETE FROM siswa_berkas WHERE id_berkas = ?";
pub const SQL_PINDAH_BERKAS_PMB: &str = "INSERT OR IGNORE INTO siswa_berkas (id_berkas, id_siswa, jenis, nama_file, mime, ukuran_byte, konten_base64, diunggah_oleh, created_at) SELECT b.id_berkas, p.id_siswa, b.jenis, b.nama_file, b.mime, b.ukuran_byte, b.konten_base64, 'PMB', b.created_at FROM pmb_berkas b JOIN pmb_pendaftar p ON p.id_pendaftar = b.id_pendaftar WHERE p.status = 'Terdaftar' AND TRIM(COALESCE(p.id_siswa, '')) <> ''";
pub const SQL_BUANG_BERKAS_PMB_TERPINDAH: &str =
    "DELETE FROM pmb_berkas WHERE id_berkas IN (SELECT id_berkas FROM siswa_berkas)";

pub const PESAN_PENDAFTAR_SUDAH_SISWA: &str =
    "Pendaftar tidak ditemukan, atau sudah menjadi siswa. Kelola berkasnya di halaman Siswa.";
const PESAN_SISWA_BELUM_DI_CLOUD: &str = super::siswa_dapodik::PESAN_SISWA_BELUM_DI_CLOUD;

#[derive(Debug, PartialEq)]
pub struct BerkasSah {
    pub jenis: &'static str,
    pub nama_file: String,
    pub mime: &'static str,
    pub ukuran_byte: usize,
    pub konten_base64: String,
}

impl BerkasSah {
    #[cfg(test)]
    fn ke_json(&self) -> Value {
        json!({
            "jenis": self.jenis,
            "namaFile": self.nama_file,
            "mime": self.mime,
            "ukuranByte": self.ukuran_byte,
            "kontenBase64": self.konten_base64,
        })
    }
}

fn ukuran_base64(base64: &str) -> Option<usize> {
    let tanpa_padding = base64.trim_end_matches('=');
    let sah = base64.len() % 4 == 0
        && base64.len() - tanpa_padding.len() <= 2
        && tanpa_padding
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'+' || b == b'/');
    if !sah {
        return None;
    }
    let ukuran = base64.len() / 4 * 3 - (base64.len() - tanpa_padding.len());
    (ukuran > 0).then_some(ukuran)
}

fn tanda_tangan_cocok(mime: &str, base64: &str) -> bool {
    let awal_base64 = &base64[..base64.len().min(16)];
    // `atob` di TS memaafkan sisa bit; Rust disamakan supaya hasilnya kembar.
    let mesin = base64::engine::GeneralPurpose::new(
        &base64::alphabet::STANDARD,
        base64::engine::GeneralPurposeConfig::new()
            .with_decode_allow_trailing_bits(true)
            .with_decode_padding_mode(base64::engine::DecodePaddingMode::Indifferent),
    );
    let Ok(awal) = base64::Engine::decode(&mesin, awal_base64) else {
        return false;
    };
    match mime {
        "image/jpeg" => awal.starts_with(&[0xff, 0xd8, 0xff]),
        "image/png" => awal.starts_with(b"\x89PNG"),
        "image/webp" => awal.len() >= 12 && &awal[0..4] == b"RIFF" && &awal[8..12] == b"WEBP",
        "application/pdf" => awal.starts_with(b"%PDF-"),
        _ => false,
    }
}

/// Cermin `uraiBerkasSekolah`: pesan galatnya identik.
pub fn urai_berkas(
    jenis: &str,
    nama_file: &str,
    mime: &str,
    konten_base64: &str,
) -> Result<BerkasSah, String> {
    let Some(jenis) = JENIS_BERKAS.iter().copied().find(|j| *j == jenis) else {
        return Err("Jenis berkas tidak dikenal.".into());
    };
    let nama_file = nama_file.trim();
    if nama_file.is_empty() {
        return Err("Nama berkas wajib diisi.".into());
    }
    if nama_file.chars().count() > 180 {
        return Err("Nama berkas maksimal 180 karakter.".into());
    }
    let Some(mime) = MIME_BERKAS.iter().copied().find(|m| *m == mime) else {
        return Err("Berkas harus berupa JPG, PNG, WEBP, atau PDF.".into());
    };
    let konten_base64 = konten_base64.trim();
    let Some(ukuran_byte) = ukuran_base64(konten_base64) else {
        return Err("Berkas tidak terbaca.".into());
    };
    if ukuran_byte > MAKS_BYTE_BERKAS {
        return Err(format!("Berkas lebih dari {} KB.", MAKS_BYTE_BERKAS / 1024));
    }
    if !tanda_tangan_cocok(mime, konten_base64) {
        return Err("Isi berkas tidak sesuai formatnya.".into());
    }
    Ok(BerkasSah {
        jenis,
        nama_file: nama_file.to_string(),
        mime,
        ukuran_byte,
        konten_base64: konten_base64.to_string(),
    })
}

/// Bentuk `pmbf-<ms>-<12 hex>`, sama dengan `buatIdBerkas` situs publik.
fn id_berkas(awalan: &str) -> String {
    let mut acak = [0u8; 6];
    rand_core::RngCore::fill_bytes(&mut rand_core::OsRng, &mut acak);
    let milidetik = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_millis());
    format!("{awalan}-{milidetik}-{}", hex::encode(acak))
}

fn galat_validasi(pesan: impl AsRef<str>) -> CommandError {
    CommandError::new("VALIDATION_ERROR", pesan.as_ref())
}

/// Unggah atau ganti satu berkas pendaftar; satu berkas per jenis.
pub async fn simpan_berkas_pmb(
    client: &TursoClient,
    id_pendaftar: &str,
    berkas: &BerkasSah,
) -> Result<Value, CommandError> {
    client.ensure_schema_current().await?;
    let id = id_berkas("pmbf");
    let hasil = client
        .execute_pipeline(vec![
            Statement::new(
                SQL_HAPUS_JENIS_BERKAS_PMB,
                vec![
                    json!(id_pendaftar),
                    json!(berkas.jenis),
                    json!(id_pendaftar),
                ],
            ),
            Statement::new(
                SQL_SIMPAN_BERKAS_PMB,
                vec![
                    json!(id),
                    json!(id_pendaftar),
                    json!(berkas.jenis),
                    json!(berkas.nama_file),
                    json!(berkas.mime),
                    json!(berkas.ukuran_byte),
                    json!(berkas.konten_base64),
                    json!(id_pendaftar),
                ],
            ),
        ])
        .await?;
    if hasil.get(1).map_or(0, |baris| baris.rows_affected) == 0 {
        return Err(galat_validasi(PESAN_PENDAFTAR_SUDAH_SISWA));
    }
    Ok(json!({ "idBerkas": id }))
}

pub async fn hapus_berkas_pmb(
    client: &TursoClient,
    id_berkas: &str,
) -> Result<Value, CommandError> {
    client.ensure_schema_current().await?;
    client
        .query_one(SQL_HAPUS_BERKAS_PMB, vec![json!(id_berkas)])
        .await?;
    Ok(json!({ "sukses": true }))
}

/// Daftar berkas seorang siswa, tanpa isinya.
pub async fn daftar_berkas_siswa(
    client: &TursoClient,
    id_siswa: &str,
) -> Result<Value, CommandError> {
    client.ensure_schema_current().await?;
    let res = client
        .query_one(
            "SELECT id_berkas, jenis, nama_file, mime, ukuran_byte, diunggah_oleh, created_at FROM siswa_berkas WHERE id_siswa = ? ORDER BY jenis ASC LIMIT 20;",
            vec![json!(id_siswa.trim())],
        )
        .await?;
    Ok(json!({ "items": res.to_objects() }))
}

pub async fn ambil_berkas_siswa(
    client: &TursoClient,
    id_berkas: &str,
) -> Result<Value, CommandError> {
    client.ensure_schema_current().await?;
    client
        .query_one(
            "SELECT id_berkas, jenis, nama_file, mime, ukuran_byte, konten_base64 FROM siswa_berkas WHERE id_berkas = ? LIMIT 1;",
            vec![json!(id_berkas)],
        )
        .await?
        .to_objects()
        .into_iter()
        .next()
        .map(|baris| json!(baris))
        .ok_or_else(|| CommandError::new("NOT_FOUND", "Berkas tidak ditemukan."))
}

/// Unggah atau ganti satu berkas siswa; satu berkas per jenis.
pub async fn simpan_berkas_siswa(
    client: &TursoClient,
    id_siswa: &str,
    berkas: &BerkasSah,
    operator: &str,
) -> Result<Value, CommandError> {
    client.ensure_schema_current().await?;
    let id_siswa = id_siswa.trim();
    let id = id_berkas("sisf");
    let hasil = client
        .execute_pipeline(vec![
            Statement::new(
                SQL_HAPUS_JENIS_BERKAS_SISWA,
                vec![json!(id_siswa), json!(berkas.jenis), json!(id_siswa)],
            ),
            Statement::new(
                SQL_SIMPAN_BERKAS_SISWA,
                vec![
                    json!(id),
                    json!(id_siswa),
                    json!(berkas.jenis),
                    json!(berkas.nama_file),
                    json!(berkas.mime),
                    json!(berkas.ukuran_byte),
                    json!(berkas.konten_base64),
                    json!(operator),
                    json!(id_siswa),
                ],
            ),
        ])
        .await?;
    if hasil.get(1).map_or(0, |baris| baris.rows_affected) == 0 {
        return Err(galat_validasi(PESAN_SISWA_BELUM_DI_CLOUD));
    }
    Ok(json!({ "idBerkas": id }))
}

pub async fn hapus_berkas_siswa(
    client: &TursoClient,
    id_berkas: &str,
) -> Result<Value, CommandError> {
    client.ensure_schema_current().await?;
    client
        .query_one(SQL_HAPUS_BERKAS_SISWA, vec![json!(id_berkas)])
        .await?;
    Ok(json!({ "sukses": true }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::prelude::*;

    /// Vektor yang sama dibaca `berkas-sekolah.test.ts`.
    #[test]
    fn vektor_bersama_urai_berkas() {
        let vektor: Vec<Value> = serde_json::from_str(include_str!(
            "../../../src/lib/validations/berkas-sekolah.vektor.json"
        ))
        .expect("vektor valid");
        assert!(vektor.len() > 10);
        for kasus in vektor {
            let nama = kasus["nama"].as_str().unwrap_or_default();
            let m = &kasus["masukan"];
            let teks = |kunci: &str| m[kunci].as_str().unwrap_or_default().to_string();
            let hasil = urai_berkas(
                &teks("jenis"),
                &teks("namaFile"),
                &teks("mime"),
                &teks("kontenBase64"),
            );
            if let Some(harapan) = kasus.get("hasil") {
                assert_eq!(hasil.map(|b| b.ke_json()).as_ref(), Ok(harapan), "{nama}");
            } else {
                assert_eq!(
                    hasil.map(|b| b.ke_json()),
                    Err(kasus["galat"].as_str().unwrap().to_string()),
                    "{nama}"
                );
            }
        }
    }

    #[test]
    fn batas_ukuran_dihitung_dari_isi() {
        let jpeg = |byte: usize| {
            let mut isi = vec![0xff, 0xd8, 0xff];
            isi.resize(byte, 0);
            BASE64_STANDARD.encode(isi)
        };
        let pas =
            urai_berkas("foto", "f.jpg", "image/jpeg", &jpeg(MAKS_BYTE_BERKAS)).expect("pas batas");
        assert_eq!(pas.ukuran_byte, MAKS_BYTE_BERKAS);
        assert_eq!(
            urai_berkas("foto", "f.jpg", "image/jpeg", &jpeg(MAKS_BYTE_BERKAS + 1)),
            Err("Berkas lebih dari 200 KB.".to_string())
        );
    }
}
