//! Foto konten situs publik (tabel cloud-only `konten_gambar`, v48).
//!
//! Kembaran TypeScript: `src/lib/validations/konten-gambar.ts` (aturan) dan
//! `src/lib/services/content-images.ts` (baca/tulis). Pembersihan foto yatim
//! saat konten disimpan dirangkai di `TursoClient::save_page_content`. Keduanya diuji dengan
//! vektor yang sama; mengubah satu sisi saja membuat foto yang lolos di Web
//! ditolak di Desktop, atau sebaliknya.
//!
//! Foto dirujuk dari `konten_publik` lewat id = 32 hex pertama SHA-256 isinya,
//! dihitung di sini, bukan dipercaya dari klien. Isi yang sama selalu satu
//! baris, dan situs publik boleh menyimpan gambarnya di cache selamanya.

use base64::prelude::*;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

use super::{
    models::CommandError,
    turso::{Statement, TursoClient},
};

pub const MAKS_BYTE_GAMBAR_KONTEN: usize = 400 * 1024;
pub const MAKS_ID_PRATINJAU_GAMBAR: usize = 30;
pub const JENIS_GAMBAR_KONTEN: [&str; 2] = ["image/webp", "image/jpeg"];

/// Dieja sama dengan `HAPUS_GAMBAR_YATIM_SQL` di `konten-gambar.ts`.
pub const HAPUS_GAMBAR_YATIM_SQL: &str = "DELETE FROM konten_gambar
  WHERE created_at < datetime('now', '-1 day')
    AND NOT EXISTS (
      SELECT 1 FROM konten_publik k WHERE instr(k.nilai, konten_gambar.id_gambar) > 0
    );";

pub fn id_gambar_konten_sah(nilai: &str) -> bool {
    nilai.len() == 32 && nilai.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

/// 32 hex pertama SHA-256 isi berkas.
pub fn id_gambar_konten(bytes: &[u8]) -> String {
    let hash = Sha256::digest(bytes);
    hash.iter().take(16).map(|b| format!("{b:02x}")).collect()
}

pub fn tanda_tangan_cocok(jenis: &str, awal: &[u8]) -> bool {
    match jenis {
        "image/jpeg" => awal.starts_with(&[0xff, 0xd8, 0xff]),
        "image/webp" => awal.len() >= 12 && &awal[0..4] == b"RIFF" && &awal[8..12] == b"WEBP",
        _ => false,
    }
}

pub fn ukuran_base64(base64: &str) -> i64 {
    if base64.len() % 4 != 0 {
        return -1;
    }
    let padding = if base64.ends_with("==") {
        2
    } else if base64.ends_with('=') {
        1
    } else {
        0
    };
    (base64.len() / 4 * 3) as i64 - padding
}

#[derive(Debug, PartialEq)]
pub struct GambarTerurai {
    pub jenis: &'static str,
    pub bytes: Vec<u8>,
}

/// Cermin `uraiGambarKonten`: pesan galatnya identik.
pub fn urai_gambar_konten(data_url: &str) -> Result<GambarTerurai, String> {
    const TIDAK_TERBACA: &str = "Berkas foto tidak terbaca.";
    let teks = data_url.trim();
    let Some(sisa) = teks.strip_prefix("data:") else {
        return Err(TIDAK_TERBACA.into());
    };
    let Some((jenis_mentah, base64)) = sisa.split_once(";base64,") else {
        return Err(TIDAK_TERBACA.into());
    };
    let jenis_sah_bentuk = jenis_mentah
        .strip_prefix("image/")
        .is_some_and(|akhir| !akhir.is_empty() && akhir.bytes().all(|b| b.is_ascii_lowercase()));
    let base64_sah_bentuk = base64
        .trim_end_matches('=')
        .bytes()
        .all(|b| b.is_ascii_alphanumeric() || b == b'+' || b == b'/')
        && base64.len() - base64.trim_end_matches('=').len() <= 2;
    if !jenis_sah_bentuk || !base64_sah_bentuk {
        return Err(TIDAK_TERBACA.into());
    }
    let Some(jenis) = JENIS_GAMBAR_KONTEN.into_iter().find(|j| *j == jenis_mentah) else {
        return Err("Foto harus berformat WebP atau JPEG.".into());
    };
    let ukuran = ukuran_base64(base64);
    if ukuran <= 0 {
        return Err(TIDAK_TERBACA.into());
    }
    if ukuran as usize > MAKS_BYTE_GAMBAR_KONTEN {
        return Err("Foto masih lebih dari 400 KB setelah dikompres. Pilih foto lain.".into());
    }
    let bytes = BASE64_STANDARD.decode(base64).map_err(|_| TIDAK_TERBACA.to_string())?;
    if !tanda_tangan_cocok(jenis, &bytes) {
        return Err("Isi berkas tidak sesuai formatnya.".into());
    }
    Ok(GambarTerurai { jenis, bytes })
}

/// Simpan satu foto (idempoten terhadap isi) lalu bersihkan foto yatim.
pub async fn simpan(client: &TursoClient, data_url: &str) -> Result<Value, CommandError> {
    let gambar = urai_gambar_konten(data_url)
        .map_err(|pesan| CommandError::new("VALIDATION_ERROR", pesan))?;
    client.ensure_schema_current().await?;
    let id = id_gambar_konten(&gambar.bytes);
    client
        .execute_pipeline(vec![
            Statement::new(
                "INSERT OR IGNORE INTO konten_gambar (id_gambar, jenis, data_base64, ukuran_byte)
                 VALUES (?, ?, ?, ?);",
                vec![
                    json!(id),
                    json!(gambar.jenis),
                    json!(BASE64_STANDARD.encode(&gambar.bytes)),
                    json!(gambar.bytes.len()),
                ],
            ),
            Statement::new(HAPUS_GAMBAR_YATIM_SQL, vec![]),
        ])
        .await?;
    Ok(json!({ "id": id }))
}

/// Data URL beberapa foto untuk pratinjau di panel konten.
pub async fn ambil(client: &TursoClient, ids: &[String]) -> Result<Value, CommandError> {
    let sah: Vec<&String> = ids
        .iter()
        .filter(|id| id_gambar_konten_sah(id))
        .take(MAKS_ID_PRATINJAU_GAMBAR)
        .collect();
    let mut items = serde_json::Map::new();
    if sah.is_empty() {
        return Ok(json!({ "items": items }));
    }
    client.ensure_schema_current().await?;
    let tanda = vec!["?"; sah.len()].join(", ");
    let hasil = client
        .query_one(
            format!("SELECT id_gambar, jenis, data_base64 FROM konten_gambar WHERE id_gambar IN ({tanda});"),
            sah.iter().map(|id| json!(id)).collect(),
        )
        .await?;
    for baris in hasil.to_objects() {
        let ambil_teks = |kunci: &str| baris.get(kunci).and_then(Value::as_str).unwrap_or("").to_owned();
        let id = ambil_teks("id_gambar");
        items.insert(
            id,
            json!(format!("data:{};base64,{}", ambil_teks("jenis"), ambil_teks("data_base64"))),
        );
    }
    Ok(json!({ "items": items }))
}

#[cfg(test)]
mod tests {
    use super::*;

    // Vektor kembar dengan `konten-gambar.test.ts`. Ubah keduanya bersamaan.
    const JPEG: &str = "data:image/jpeg;base64,/9j/4AAQSkZJRgAB";
    const WEBP: &str = "data:image/webp;base64,UklGRiQAAABXRUJQVlA4IA==";
    const PNG: &str = "data:image/png;base64,iVBORw0KGgoAAAAA";
    const WEBP_ISI_JPEG: &str = "data:image/webp;base64,/9j/4AAQSkZJRgAB";

    #[test]
    fn menerima_jpeg_dan_webp_bertanda_tangan_sah() {
        let jpeg = urai_gambar_konten(JPEG).expect("jpeg");
        assert_eq!(jpeg.jenis, "image/jpeg");
        assert_eq!(jpeg.bytes.len(), 12);
        assert_eq!(urai_gambar_konten(WEBP).expect("webp").bytes.len(), 16);
    }

    #[test]
    fn menolak_jenis_lain_isi_tidak_cocok_dan_bentuk_rusak() {
        assert_eq!(urai_gambar_konten(PNG), Err("Foto harus berformat WebP atau JPEG.".into()));
        assert_eq!(
            urai_gambar_konten(WEBP_ISI_JPEG),
            Err("Isi berkas tidak sesuai formatnya.".into())
        );
        for rusak in ["", "bukan data url", "data:image/jpeg;base64,", "data:image/jpeg;base64,abc"] {
            assert_eq!(urai_gambar_konten(rusak), Err("Berkas foto tidak terbaca.".into()), "{rusak}");
        }
    }

    #[test]
    fn menolak_foto_di_atas_400_kb() {
        let besar = format!("data:image/jpeg;base64,/9j/{}", "A".repeat(546_132));
        assert_eq!(ukuran_base64(&besar[23..]), (MAKS_BYTE_GAMBAR_KONTEN + 2) as i64);
        assert_eq!(
            urai_gambar_konten(&besar),
            Err("Foto masih lebih dari 400 KB setelah dikompres. Pilih foto lain.".into())
        );
    }

    #[test]
    fn id_adalah_32_hex_pertama_sha256() {
        // Vektor yang sama di `content-images.test.ts`.
        assert_eq!(id_gambar_konten(b"abc"), "ba7816bf8f01cfea414140de5dae2223");
        assert!(id_gambar_konten_sah("ba7816bf8f01cfea414140de5dae2223"));
        assert!(!id_gambar_konten_sah("BA7816BF8F01CFEA414140DE5DAE2223"));
        assert!(!id_gambar_konten_sah("ba7816bf8f01cfea414140de5dae222"));
        assert!(!id_gambar_konten_sah("../../etc/passwd"));
    }

    #[test]
    fn sql_bersih_yatim_bisa_disiapkan() {
        let conn = rusqlite::Connection::open_in_memory().expect("db");
        conn.execute_batch(
            "CREATE TABLE konten_publik (halaman TEXT, kunci TEXT, nilai TEXT);
             CREATE TABLE konten_gambar (id_gambar TEXT PRIMARY KEY, jenis TEXT, data_base64 TEXT,
               ukuran_byte INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')));
             INSERT INTO konten_gambar (id_gambar, created_at) VALUES
               ('a1', datetime('now', '-2 day')), ('b2', datetime('now', '-2 day')), ('c3', datetime('now'));
             INSERT INTO konten_publik VALUES ('landing', 'landing.fasilitas_items', '[{\"foto\":\"b2\"}]');",
        )
        .expect("siapkan");
        conn.execute_batch(HAPUS_GAMBAR_YATIM_SQL).expect("hapus");
        let sisa: Vec<String> = conn
            .prepare("SELECT id_gambar FROM konten_gambar ORDER BY id_gambar")
            .unwrap()
            .query_map([], |r| r.get(0))
            .unwrap()
            .map(Result::unwrap)
            .collect();
        assert_eq!(sisa, vec!["b2", "c3"]);
    }
}
