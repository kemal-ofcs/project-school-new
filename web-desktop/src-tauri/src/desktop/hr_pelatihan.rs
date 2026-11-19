//! HRIS Fase 7b (`prd-hris/fase-7.md` §25.2.5–§25.2.6): pelatihan, peserta,
//! sertifikat, dan rekap jam pelatihan per pegawai per tahun.
//!
//! `hr_pelatihan` dan `hr_pelatihan_peserta` KHUSUS CLOUD (Q-131): dibaca dan
//! ditulis lewat `TursoClient`, tanpa SQLite perangkat, snapshot, atau outbox.
//! Tanpa koneksi, command mengembalikan `hris_cloud::PESAN_LURING`. Status
//! pelatihan diturunkan, tidak disimpan. Sertifikat = `hr_dokumen` lewat inti
//! dokumen `hris_cloud` (Q-147, Q-148).
//!
//! Kembaran TS: aturan dan SQL di `src/lib/validations/hr-pelatihan.ts`,
//! penulisan di `src/lib/services/hr-pelatihan.ts`. Vektornya
//! `validations/hr-pelatihan.vektor.json`; teks SQL dibandingkan harfiah oleh
//! `hr-pelatihan.test.ts`.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use super::hari_kerja::tanggal_valid;
use super::hr_rekrutmen::{angka, baris, galat, hari_ini, id_wajib, satu, teks, tulis};
use super::hris::new_id;
use super::hris_cloud;
use super::inventory::payload_text;
use super::models::CommandError;
use super::turso::{Statement, TursoClient};

// Aturan murni (§25.2.5–§25.2.6)

/// WAJIB sama dengan CHECK `hr_pelatihan.jenis_penyelenggara`.
pub const JENIS_PENYELENGGARA: [&str; 5] = ["KKG", "MGMP", "Dinas", "Internal", "Lainnya"];
/// WAJIB sama dengan CHECK `hr_pelatihan_peserta.hasil`.
pub const HASIL_PESERTA: [&str; 3] = ["Lulus", "Tidak Lulus", "Tidak Hadir"];
pub const MAKS_NAMA_PELATIHAN: usize = 150;
pub const MAKS_PENYELENGGARA: usize = 100;
pub const MAKS_LOKASI: usize = 100;
pub const MAKS_KETERANGAN_PELATIHAN: usize = 2000;
pub const MAKS_CATATAN_PESERTA: usize = 1000;
pub const MAKS_JAM_PELATIHAN: i64 = 1000;
pub const MAKS_BIAYA_PELATIHAN: i64 = 1_000_000_000;
/// Jenis dokumen bawaan sertifikat (seed `hris.rs`); boleh diganti jenis aktif
/// lain (Q-147).
pub const JENIS_SERTIFIKAT_BAWAAN: &str = "dok-pelatihan";

pub const PESAN_PELATIHAN_TIDAK_ADA: &str = "Pelatihan tidak ditemukan.";
pub const PESAN_PELATIHAN_DIBATALKAN: &str = "Pelatihan ini sudah dibatalkan.";
pub const PESAN_PESERTA_TIDAK_ADA: &str = "Peserta tidak ditemukan.";
pub const PESAN_PESERTA_GANDA: &str = "Pegawai ini sudah menjadi peserta pelatihan ini.";
pub const PESAN_PESERTA_DITOLAK: &str =
    "Hanya pegawai aktif yang belum keluar yang bisa ditambahkan, dan pelatihannya tidak dibatalkan.";
pub const PESAN_LEPAS_BERSERTIFIKAT: &str = "Peserta ini sudah punya sertifikat. Hapus sertifikatnya dulu.";
pub const PESAN_BELUM_BERSERTIFIKAT: &str = "Peserta ini belum punya sertifikat.";
pub const PESAN_JENIS_NONAKTIF: &str = "Jenis dokumen tidak ditemukan atau tidak aktif.";
pub const PESAN_SERTIFIKAT_DITOLAK: &str =
    "Sertifikat tidak tersimpan: peserta sudah punya sertifikat lain, pegawainya belum ada di database pusat, atau jenis dokumennya tidak dikenal.";

fn panjang(teks: &str) -> usize {
    teks.chars().count()
}

fn teks_opsional(draft: &Value, kunci: &str, label: &str, maks: usize) -> Result<Option<String>, String> {
    match payload_text(draft, kunci) {
        Some(t) if panjang(&t) > maks => Err(format!("{label} maksimal {maks} karakter.")),
        lain => Ok(lain),
    }
}

fn bulat(draft: &Value, kunci: &str, bawaan: Option<i64>, min: i64, maks: i64) -> Option<i64> {
    match draft.get(kunci) {
        None | Some(Value::Null) => bawaan,
        Some(n) => n.as_i64().filter(|n| (min..=maks).contains(n)),
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct PelatihanSah {
    pub id_pelatihan: Option<String>,
    pub nama: String,
    pub jenis_penyelenggara: String,
    pub penyelenggara: Option<String>,
    pub tanggal_mulai: String,
    pub tanggal_selesai: String,
    pub lokasi: Option<String>,
    pub jumlah_jam: i64,
    pub biaya: i64,
    pub keterangan: Option<String>,
}

/// Cermin `validasiPelatihan`. Tanggal boleh di masa depan; biaya satu total
/// per pelatihan, kosong = 0 (Q-146).
pub fn validasi_pelatihan(draft: &Value) -> Result<PelatihanSah, String> {
    let nama = teks_opsional(draft, "nama", "Nama pelatihan", MAKS_NAMA_PELATIHAN)?
        .ok_or("Nama pelatihan wajib diisi.")?;
    let jenis_penyelenggara = payload_text(draft, "jenis_penyelenggara")
        .filter(|j| JENIS_PENYELENGGARA.contains(&j.as_str()))
        .ok_or("Jenis penyelenggara wajib KKG, MGMP, Dinas, Internal, atau Lainnya.")?;
    let penyelenggara = teks_opsional(draft, "penyelenggara", "Penyelenggara", MAKS_PENYELENGGARA)?;
    let tanggal_mulai = payload_text(draft, "tanggal_mulai")
        .filter(|t| tanggal_valid(t))
        .ok_or("Tanggal mulai tidak valid.")?;
    let tanggal_selesai = payload_text(draft, "tanggal_selesai")
        .filter(|t| tanggal_valid(t))
        .ok_or("Tanggal selesai tidak valid.")?;
    if tanggal_selesai < tanggal_mulai {
        return Err("Tanggal selesai tidak boleh sebelum tanggal mulai.".into());
    }
    let lokasi = teks_opsional(draft, "lokasi", "Lokasi", MAKS_LOKASI)?;
    let jumlah_jam = bulat(draft, "jumlah_jam", None, 1, MAKS_JAM_PELATIHAN)
        .ok_or("Jumlah jam harus bilangan bulat 1 sampai 1000.")?;
    let biaya = bulat(draft, "biaya", Some(0), 0, MAKS_BIAYA_PELATIHAN)
        .ok_or("Biaya harus bilangan bulat 0 sampai 1000000000.")?;
    let keterangan = teks_opsional(draft, "keterangan", "Keterangan", MAKS_KETERANGAN_PELATIHAN)?;
    Ok(PelatihanSah {
        id_pelatihan: payload_text(draft, "id_pelatihan"),
        nama,
        jenis_penyelenggara,
        penyelenggara,
        tanggal_mulai,
        tanggal_selesai,
        lokasi,
        jumlah_jam,
        biaya,
        keterangan,
    })
}

/// Cermin `statusPelatihan`. Tidak disimpan.
pub fn status_pelatihan(tanggal_mulai: &str, tanggal_selesai: &str, dibatalkan: bool, hari_ini: &str) -> &'static str {
    if dibatalkan {
        "Dibatalkan"
    } else if tanggal_mulai > hari_ini {
        "Dijadwalkan"
    } else if tanggal_selesai < hari_ini {
        "Selesai"
    } else {
        "Berlangsung"
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct HasilPesertaSah {
    pub hasil: Option<String>,
    pub catatan: Option<String>,
}

/// Cermin `validasiHasilPeserta`: hasil opsional dan bisa diubah.
pub fn validasi_hasil_peserta(draft: &Value) -> Result<HasilPesertaSah, String> {
    let hasil = match payload_text(draft, "hasil") {
        None => None,
        Some(h) if HASIL_PESERTA.contains(&h.as_str()) => Some(h),
        Some(_) => return Err("Hasil peserta harus Lulus, Tidak Lulus, atau Tidak Hadir.".into()),
    };
    let catatan = teks_opsional(draft, "catatan", "Catatan peserta", MAKS_CATATAN_PESERTA)?;
    Ok(HasilPesertaSah { hasil, catatan })
}

/// Satu baris `REKAP_PELATIHAN_SQL`.
#[derive(Debug, Clone, Deserialize)]
pub struct BarisRekap {
    pub id_karyawan: String,
    pub nama: String,
    pub unit: String,
    pub kelompok: String,
    pub tanggal_selesai: String,
    pub jenis_penyelenggara: String,
    pub jumlah_jam: i64,
    pub hasil: String,
    pub dibatalkan: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct RekapPegawai {
    pub id_karyawan: String,
    pub nama: String,
    pub unit: String,
    pub kelompok: String,
    pub tahun: String,
    pub jumlah_pelatihan: i64,
    pub total_jam: i64,
    pub jam_per_jenis: BTreeMap<String, i64>,
}

/// Cermin `rekapPelatihan` (§25.2.6, Q-145): per (pegawai, tahun
/// `tanggal_selesai`), melewati pelatihan Dibatalkan, yang `tanggal_selesai`
/// sesudah hari ini, dan peserta `Tidak Hadir`. Urutan = kemunculan pertama.
pub fn rekap_pelatihan(daftar: &[BarisRekap], hari_ini: &str) -> Vec<RekapPegawai> {
    let mut hasil: Vec<RekapPegawai> = Vec::new();
    for b in daftar {
        if b.dibatalkan || b.tanggal_selesai.as_str() > hari_ini || b.hasil == "Tidak Hadir" {
            continue;
        }
        let tahun: String = b.tanggal_selesai.chars().take(4).collect();
        let ada = hasil.iter().position(|r| r.id_karyawan == b.id_karyawan && r.tahun == tahun);
        let posisi = ada.unwrap_or(hasil.len());
        if ada.is_none() {
            hasil.push(RekapPegawai {
                id_karyawan: b.id_karyawan.clone(),
                nama: b.nama.clone(),
                unit: b.unit.clone(),
                kelompok: b.kelompok.clone(),
                tahun,
                jumlah_pelatihan: 0,
                total_jam: 0,
                jam_per_jenis: JENIS_PENYELENGGARA.iter().map(|j| ((*j).to_owned(), 0)).collect(),
            });
        }
        let r = &mut hasil[posisi];
        r.jumlah_pelatihan += 1;
        r.total_jam += b.jumlah_jam;
        *r.jam_per_jenis.entry(b.jenis_penyelenggara.clone()).or_insert(0) += b.jumlah_jam;
    }
    hasil
}

// SQL kembar (§25.3). Diperiksa harfiah oleh `hr-pelatihan.test.ts`.

/// ?1 tahun (mulai ATAU selesai di tahun itu), ?2 satu id.
pub const PELATIHAN_SQL: &str = "SELECT p.id_pelatihan, p.nama, p.jenis_penyelenggara, COALESCE(p.penyelenggara, '') AS penyelenggara, p.tanggal_mulai, p.tanggal_selesai, COALESCE(p.lokasi, '') AS lokasi, p.jumlah_jam, p.biaya, COALESCE(p.keterangan, '') AS keterangan, p.dicatat_oleh, p.created_at, COALESCE(p.diubah_oleh, '') AS diubah_oleh, COALESCE(p.diubah_pada, '') AS diubah_pada, COALESCE(p.dibatalkan_oleh, '') AS dibatalkan_oleh, COALESCE(p.dibatalkan_pada, '') AS dibatalkan_pada, COALESCE(p.alasan_batal, '') AS alasan_batal, (SELECT COUNT(*) FROM hr_pelatihan_peserta ps WHERE ps.id_pelatihan = p.id_pelatihan) AS jumlah_peserta FROM hr_pelatihan p WHERE substr(p.tanggal_mulai, 1, 4) = ?1 OR substr(p.tanggal_selesai, 1, 4) = ?1 OR p.id_pelatihan = ?2 ORDER BY p.tanggal_mulai DESC, p.created_at DESC, p.id_pelatihan\n-- batas: pelatihan satu tahun, beberapa per bulan\n;";
pub const SIMPAN_PELATIHAN_SQL: &str = "INSERT INTO hr_pelatihan (id_pelatihan, nama, jenis_penyelenggara, penyelenggara, tanggal_mulai, tanggal_selesai, lokasi, jumlah_jam, biaya, keterangan, dicatat_oleh, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, datetime('now'));";
pub const UBAH_PELATIHAN_SQL: &str = "UPDATE hr_pelatihan SET nama = ?2, jenis_penyelenggara = ?3, penyelenggara = ?4, tanggal_mulai = ?5, tanggal_selesai = ?6, lokasi = ?7, jumlah_jam = ?8, biaya = ?9, keterangan = ?10, diubah_oleh = ?11, diubah_pada = datetime('now') WHERE id_pelatihan = ?1 AND dibatalkan_pada IS NULL;";
/// Batal = kolom diisi sekali; tidak ada hapus pelatihan.
pub const BATAL_PELATIHAN_SQL: &str = "UPDATE hr_pelatihan SET dibatalkan_oleh = ?2, dibatalkan_pada = datetime('now'), alasan_batal = ?3 WHERE id_pelatihan = ?1 AND dibatalkan_pada IS NULL;";

/// ?1 pelatihan, ?2 pegawai (riwayat), ?3 satu peserta. Riwayat tetap terbaca
/// sesudah pegawai keluar.
pub const PESERTA_SQL: &str = "SELECT ps.id_peserta, ps.id_pelatihan, p.nama AS nama_pelatihan, p.jenis_penyelenggara, p.tanggal_mulai, p.tanggal_selesai, p.jumlah_jam, COALESCE(p.dibatalkan_pada, '') AS dibatalkan_pada, ps.id_karyawan, COALESCE(m.nama, ps.id_karyawan) AS nama, COALESCE(m.unit, '') AS unit, COALESCE(ps.hasil, '') AS hasil, COALESCE(ps.catatan, '') AS catatan, COALESCE(ps.id_dokumen, '') AS id_dokumen, COALESCE(d.id_jenis, '') AS id_jenis, COALESCE(j.nama, d.id_jenis, '') AS jenis_dokumen, COALESCE(d.nomor, '') AS nomor, COALESCE(d.tanggal_terbit, '') AS tanggal_terbit, COALESCE(d.tanggal_kedaluwarsa, '') AS tanggal_kedaluwarsa, COALESCE(d.catatan, '') AS catatan_dokumen, ps.dicatat_oleh, ps.created_at FROM hr_pelatihan_peserta ps JOIN hr_pelatihan p ON p.id_pelatihan = ps.id_pelatihan LEFT JOIN master_data m ON m.id_unik = ps.id_karyawan LEFT JOIN hr_dokumen d ON d.id_dokumen = ps.id_dokumen LEFT JOIN hr_dokumen_jenis j ON j.id_jenis = d.id_jenis WHERE ps.id_pelatihan = ?1 OR ps.id_karyawan = ?2 OR ps.id_peserta = ?3 ORDER BY p.tanggal_mulai DESC, COALESCE(m.nama, ps.id_karyawan), ps.id_peserta\n-- batas: peserta satu pelatihan, atau riwayat pelatihan satu pegawai\n;";
/// Daftar berkas sertifikat tanpa isinya; ?1 pelatihan, ?2 pegawai.
pub const BERKAS_SERTIFIKAT_SQL: &str = "SELECT b.id_berkas, b.id_dokumen, b.urutan, COALESCE(b.nama_berkas, '') AS nama_berkas, b.mime_type, (length(b.data_base64) / 4) * 3 - (CASE WHEN b.data_base64 LIKE '%==' THEN 2 WHEN b.data_base64 LIKE '%=' THEN 1 ELSE 0 END) AS ukuran_byte FROM hr_dokumen_berkas b JOIN hr_pelatihan_peserta ps ON ps.id_dokumen = b.id_dokumen WHERE ps.id_pelatihan = ?1 OR ps.id_karyawan = ?2 ORDER BY b.id_dokumen, b.urutan\n-- batas: berkas sertifikat satu pelatihan atau satu pegawai, maksimal 5 per sertifikat\n;";
/// Pegawai (`PEGAWAI_SQL`) Aktif tanpa `id_keluar`, ke pelatihan yang tidak
/// dibatalkan, diperiksa di statement yang sama. PK
/// `<id_pelatihan>:<id_karyawan>` menahan peserta ganda.
pub const TAMBAH_PESERTA_SQL: &str = "INSERT OR IGNORE INTO hr_pelatihan_peserta (id_peserta, id_pelatihan, id_karyawan, dicatat_oleh, created_at) SELECT ?1 || ':' || m.id_unik, ?1, m.id_unik, ?3, datetime('now') FROM master_data m WHERE m.id_unik = ?2 AND LOWER(TRIM(COALESCE(m.jenis_personil, ''))) <> 'siswa' AND NOT EXISTS (SELECT 1 FROM siswa_data sd WHERE sd.id_siswa = m.id_unik) AND m.status_aktif = 'Aktif' AND COALESCE(m.id_keluar, '') = '' AND EXISTS (SELECT 1 FROM hr_pelatihan p WHERE p.id_pelatihan = ?1 AND p.dibatalkan_pada IS NULL);";
pub const HASIL_PESERTA_SQL: &str = "UPDATE hr_pelatihan_peserta SET hasil = ?2, catatan = ?3 WHERE id_peserta = ?1;";
/// Satu-satunya hapus baris di pelatihan; ditolak selama bersertifikat.
pub const LEPAS_PESERTA_SQL: &str = "DELETE FROM hr_pelatihan_peserta WHERE id_peserta = ?1 AND id_dokumen IS NULL;";
pub const JENIS_AKTIF_SQL: &str = "SELECT 1 AS ada FROM hr_dokumen_jenis WHERE id_jenis = ?1 AND is_aktif = 1 LIMIT 1;";
/// ?1 dokumen, ?2 peserta. Hanya dokumen milik pegawai peserta itu, dan tidak
/// menimpa sertifikat lain.
pub const TAUT_SERTIFIKAT_SQL: &str = "UPDATE hr_pelatihan_peserta SET id_dokumen = ?1 WHERE id_peserta = ?2 AND (id_dokumen IS NULL OR id_dokumen = ?1) AND EXISTS (SELECT 1 FROM hr_dokumen d WHERE d.id_dokumen = ?1 AND d.id_karyawan = hr_pelatihan_peserta.id_karyawan);";
/// Dokumen baru yang gagal ditautkan dibuang di transaksi yang sama.
pub const BUANG_SERTIFIKAT_LEPAS_SQL: &str = "DELETE FROM hr_dokumen WHERE id_dokumen = ?1 AND NOT EXISTS (SELECT 1 FROM hr_pelatihan_peserta ps WHERE ps.id_dokumen = ?1);";
/// Isi berkas hanya dari dokumen yang tertaut ke peserta (Q-148).
pub const AMBIL_BERKAS_SERTIFIKAT_SQL: &str = "SELECT b.id_berkas, b.id_dokumen, COALESCE(b.nama_berkas, '') AS nama_berkas, b.mime_type, b.data_base64 FROM hr_dokumen_berkas b WHERE b.id_berkas = ?1 AND EXISTS (SELECT 1 FROM hr_pelatihan_peserta ps WHERE ps.id_dokumen = b.id_dokumen) LIMIT 1;";
/// ?1 berkas, ?2 peserta.
pub const HAPUS_BERKAS_SERTIFIKAT_SQL: &str = "DELETE FROM hr_dokumen_berkas WHERE id_berkas = ?1 AND id_dokumen = (SELECT ps.id_dokumen FROM hr_pelatihan_peserta ps WHERE ps.id_peserta = ?2);";
/// Bahan `rekap_pelatihan`: ?1 tahun `tanggal_selesai`, ?2 kelompok
/// (`''` = semua, pola `ORG_PEGAWAI_SQL`), ?3 nama unit kini (`''` = semua).
pub const REKAP_PELATIHAN_SQL: &str = "SELECT ps.id_karyawan, COALESCE(m.nama, ps.id_karyawan) AS nama, COALESCE(m.unit, '') AS unit, CASE WHEN g.id_guru IS NOT NULL OR LOWER(TRIM(COALESCE(m.jenis_personil, ''))) = 'guru' THEN 'Guru' ELSE 'Tendik' END AS kelompok, p.tanggal_selesai, p.jenis_penyelenggara, p.jumlah_jam, COALESCE(ps.hasil, '') AS hasil, p.dibatalkan_pada IS NOT NULL AS dibatalkan FROM hr_pelatihan_peserta ps JOIN hr_pelatihan p ON p.id_pelatihan = ps.id_pelatihan LEFT JOIN master_data m ON m.id_unik = ps.id_karyawan LEFT JOIN guru_data g ON g.id_guru = ps.id_karyawan WHERE substr(p.tanggal_selesai, 1, 4) = ?1 AND (?2 = '' OR CASE WHEN g.id_guru IS NOT NULL OR LOWER(TRIM(COALESCE(m.jenis_personil, ''))) = 'guru' THEN 'Guru' ELSE 'Tendik' END = ?2) AND (?3 = '' OR COALESCE(m.unit, '') = ?3) ORDER BY COALESCE(m.nama, ps.id_karyawan), ps.id_karyawan, p.tanggal_selesai\n-- batas: keikutsertaan pelatihan satu tahun, beberapa per pegawai\n;";

// Akses cloud

fn rapikan_pelatihan(mut p: Value, hari_ini: &str) -> Value {
    p["status"] = json!(status_pelatihan(
        &teks(&p, "tanggal_mulai"),
        &teks(&p, "tanggal_selesai"),
        !teks(&p, "dibatalkan_pada").is_empty(),
        hari_ini,
    ));
    for kunci in ["jumlah_jam", "biaya", "jumlah_peserta"] {
        p[kunci] = json!(angka(&p, kunci));
    }
    p
}

async fn pelatihan_satu(client: &TursoClient, id: &str, hari_ini: &str) -> Result<Value, CommandError> {
    satu(client, PELATIHAN_SQL, vec![json!(""), json!(id)])
        .await?
        .map(|p| rapikan_pelatihan(p, hari_ini))
        .ok_or_else(|| galat(PESAN_PELATIHAN_TIDAK_ADA))
}

async fn peserta(client: &TursoClient, id_pelatihan: &str, id_karyawan: &str, id_peserta: &str) -> Result<Vec<Value>, CommandError> {
    Ok(baris(client, PESERTA_SQL, vec![json!(id_pelatihan), json!(id_karyawan), json!(id_peserta)])
        .await?
        .into_iter()
        .map(|mut p| {
            p["jumlah_jam"] = json!(angka(&p, "jumlah_jam"));
            p
        })
        .collect())
}

async fn peserta_satu(client: &TursoClient, id_peserta: &str) -> Result<Value, CommandError> {
    peserta(client, "", "", id_peserta)
        .await?
        .into_iter()
        .next()
        .ok_or_else(|| galat(PESAN_PESERTA_TIDAK_ADA))
}

/// `desktop_hr_trainings`: `mode` `daftar` (per tahun), `rincian` (satu
/// pelatihan + peserta + berkas sertifikat), `riwayat` (satu pegawai), atau
/// `rekap` (jam per pegawai per tahun).
pub async fn daftar_pelatihan(client: &TursoClient, query: &Value) -> Result<Value, CommandError> {
    client.ensure_schema_current().await?;
    let hari = hari_ini(client).await?;
    let tahun = payload_text(query, "tahun").unwrap_or_else(|| hari.chars().take(4).collect());
    match payload_text(query, "mode").as_deref().unwrap_or("daftar") {
        "daftar" => {
            let daftar: Vec<Value> = baris(client, PELATIHAN_SQL, vec![json!(tahun), json!("")])
                .await?
                .into_iter()
                .map(|p| rapikan_pelatihan(p, &hari))
                .collect();
            Ok(json!({ "hari_ini": hari, "tahun": tahun, "pelatihan": daftar }))
        }
        "rincian" => {
            let id = id_wajib(query, "id_pelatihan", PESAN_PELATIHAN_TIDAK_ADA)?;
            let pelatihan = pelatihan_satu(client, &id, &hari).await?;
            let daftar = peserta(client, &id, "", "").await?;
            let berkas = baris(client, BERKAS_SERTIFIKAT_SQL, vec![json!(id), json!("")]).await?;
            Ok(json!({ "hari_ini": hari, "pelatihan": pelatihan, "peserta": daftar, "berkas": berkas }))
        }
        "riwayat" => {
            let id = id_wajib(query, "id_karyawan", "Pegawai wajib dipilih.")?;
            let daftar = peserta(client, "", &id, "").await?;
            let berkas = baris(client, BERKAS_SERTIFIKAT_SQL, vec![json!(""), json!(id)]).await?;
            Ok(json!({ "hari_ini": hari, "peserta": daftar, "berkas": berkas }))
        }
        "rekap" => {
            let kelompok = payload_text(query, "kelompok").unwrap_or_default();
            let unit = payload_text(query, "unit").unwrap_or_default();
            let bahan: Vec<BarisRekap> = baris(client, REKAP_PELATIHAN_SQL, vec![json!(tahun), json!(kelompok), json!(unit)])
                .await?
                .iter()
                .map(|b| BarisRekap {
                    id_karyawan: teks(b, "id_karyawan"),
                    nama: teks(b, "nama"),
                    unit: teks(b, "unit"),
                    kelompok: teks(b, "kelompok"),
                    tanggal_selesai: teks(b, "tanggal_selesai"),
                    jenis_penyelenggara: teks(b, "jenis_penyelenggara"),
                    jumlah_jam: angka(b, "jumlah_jam"),
                    hasil: teks(b, "hasil"),
                    dibatalkan: angka(b, "dibatalkan") != 0,
                })
                .collect();
            Ok(json!({ "hari_ini": hari, "tahun": tahun, "rekap": rekap_pelatihan(&bahan, &hari) }))
        }
        _ => Err(galat("Mode pelatihan tidak dikenal.")),
    }
}

/// `desktop_hr_training_save`: aksi `simpan` (buat/ubah) atau `batal`.
pub async fn simpan_pelatihan(client: &TursoClient, oleh: &str, draft: &Value) -> Result<Value, CommandError> {
    client.ensure_schema_current().await?;
    match payload_text(draft, "aksi").as_deref().unwrap_or("simpan") {
        "simpan" => {
            let sah = validasi_pelatihan(draft).map_err(galat)?;
            let isi = |id: &str| {
                vec![
                    json!(id),
                    json!(sah.nama),
                    json!(sah.jenis_penyelenggara),
                    json!(sah.penyelenggara),
                    json!(sah.tanggal_mulai),
                    json!(sah.tanggal_selesai),
                    json!(sah.lokasi),
                    json!(sah.jumlah_jam),
                    json!(sah.biaya),
                    json!(sah.keterangan),
                    json!(oleh),
                ]
            };
            let Some(id) = sah.id_pelatihan.clone() else {
                let id = new_id("plt-");
                tulis(client, SIMPAN_PELATIHAN_SQL, isi(&id)).await?;
                return Ok(json!({ "sukses": true, "id_pelatihan": id }));
            };
            if tulis(client, UBAH_PELATIHAN_SQL, isi(&id)).await? == 0 {
                pelatihan_satu(client, &id, "").await?;
                return Err(galat(PESAN_PELATIHAN_DIBATALKAN));
            }
            Ok(json!({ "sukses": true, "id_pelatihan": id }))
        }
        "batal" => {
            let id = id_wajib(draft, "id_pelatihan", PESAN_PELATIHAN_TIDAK_ADA)?;
            let alasan = teks_opsional(draft, "alasan", "Alasan pembatalan", MAKS_CATATAN_PESERTA)
                .map_err(galat)?
                .ok_or_else(|| galat("Alasan pembatalan wajib diisi."))?;
            if tulis(client, BATAL_PELATIHAN_SQL, vec![json!(id), json!(oleh), json!(alasan)]).await? == 0 {
                pelatihan_satu(client, &id, "").await?;
                return Err(galat(PESAN_PELATIHAN_DIBATALKAN));
            }
            Ok(json!({ "sukses": true }))
        }
        _ => Err(galat("Aksi pelatihan tidak dikenal.")),
    }
}

/// `desktop_hr_training_participants_save`: aksi `tambah`, `lepas`, `hasil`.
pub async fn simpan_peserta(client: &TursoClient, oleh: &str, draft: &Value) -> Result<Value, CommandError> {
    client.ensure_schema_current().await?;
    match payload_text(draft, "aksi").as_deref().unwrap_or("tambah") {
        "tambah" => {
            let id_pelatihan = id_wajib(draft, "id_pelatihan", PESAN_PELATIHAN_TIDAK_ADA)?;
            let id_karyawan = id_wajib(draft, "id_karyawan", "Pegawai wajib dipilih.")?;
            let args = vec![json!(id_pelatihan), json!(id_karyawan), json!(oleh)];
            let id = format!("{id_pelatihan}:{id_karyawan}");
            if tulis(client, TAMBAH_PESERTA_SQL, args).await? == 0 {
                let ganda = !peserta(client, "", "", &id).await?.is_empty();
                return Err(galat(if ganda { PESAN_PESERTA_GANDA } else { PESAN_PESERTA_DITOLAK }));
            }
            Ok(json!({ "sukses": true, "id_peserta": id }))
        }
        "lepas" => {
            let id = id_wajib(draft, "id_peserta", PESAN_PESERTA_TIDAK_ADA)?;
            if tulis(client, LEPAS_PESERTA_SQL, vec![json!(id)]).await? == 0 {
                peserta_satu(client, &id).await?;
                return Err(galat(PESAN_LEPAS_BERSERTIFIKAT));
            }
            Ok(json!({ "sukses": true }))
        }
        "hasil" => {
            let id = id_wajib(draft, "id_peserta", PESAN_PESERTA_TIDAK_ADA)?;
            let sah = validasi_hasil_peserta(draft).map_err(galat)?;
            if tulis(client, HASIL_PESERTA_SQL, vec![json!(id), json!(sah.hasil), json!(sah.catatan)]).await? == 0 {
                return Err(galat(PESAN_PESERTA_TIDAK_ADA));
            }
            Ok(json!({ "sukses": true }))
        }
        _ => Err(galat("Aksi peserta tidak dikenal.")),
    }
}

/// `desktop_hr_training_certificate_save` (Q-147, Q-148): aksi `simpan`
/// (dokumen + tautan satu transaksi), `hapus`, `berkas_tambah`,
/// `berkas_hapus`. Dokumen selalu dibaca dari baris peserta, tidak pernah dari
/// payload, jadi `hr.training.manage` hanya menjangkau dokumen yang tertaut.
pub async fn simpan_sertifikat(client: &TursoClient, oleh: &str, draft: &Value) -> Result<Value, CommandError> {
    client.ensure_schema_current().await?;
    let id_peserta = id_wajib(draft, "id_peserta", PESAN_PESERTA_TIDAK_ADA)?;
    let p = peserta_satu(client, &id_peserta).await?;
    let id_lama = teks(&p, "id_dokumen");
    let aksi = payload_text(draft, "aksi").unwrap_or_else(|| "simpan".into());
    if aksi != "simpan" && id_lama.is_empty() {
        return Err(galat(PESAN_BELUM_BERSERTIFIKAT));
    }
    let mentah = |kunci: &str| draft.get(kunci).and_then(Value::as_str).unwrap_or_default().to_owned();
    match aksi.as_str() {
        "simpan" => {
            let id_jenis = payload_text(draft, "id_jenis").unwrap_or_else(|| JENIS_SERTIFIKAT_BAWAAN.into());
            if id_jenis != teks(&p, "id_jenis") && satu(client, JENIS_AKTIF_SQL, vec![json!(id_jenis)]).await?.is_none() {
                return Err(galat(PESAN_JENIS_NONAKTIF));
            }
            let mut dokumen = json!({
                "id_karyawan": teks(&p, "id_karyawan"),
                "id_jenis": id_jenis,
                "nomor": mentah("nomor"),
                "tanggal_terbit": mentah("tanggal_terbit"),
                "tanggal_kedaluwarsa": mentah("tanggal_kedaluwarsa"),
                "catatan": payload_text(draft, "catatan").unwrap_or_else(|| teks(&p, "nama_pelatihan")),
            });
            if !id_lama.is_empty() {
                dokumen["id"] = json!(id_lama);
            }
            let (id, statement) = hris_cloud::pernyataan_dokumen(dokumen, oleh)?;
            client
                .execute_atomic(vec![
                    statement,
                    Statement::new(TAUT_SERTIFIKAT_SQL, vec![json!(id), json!(id_peserta)]),
                    Statement::new(BUANG_SERTIFIKAT_LEPAS_SQL, vec![json!(id)]),
                ])
                .await?;
            if teks(&peserta_satu(client, &id_peserta).await?, "id_dokumen") != id {
                return Err(galat(PESAN_SERTIFIKAT_DITOLAK));
            }
            Ok(json!({ "sukses": true, "id_dokumen": id }))
        }
        "hapus" => hris_cloud::hapus_dokumen(client, &id_lama).await,
        "berkas_tambah" => {
            hris_cloud::tambah_berkas(client, &id_lama, &mentah("nama_berkas"), &mentah("mime_type"), &mentah("data_base64"))
                .await
        }
        "berkas_hapus" => {
            let id_berkas = id_wajib(draft, "id_berkas", "Berkas tidak ditemukan.")?;
            if tulis(client, HAPUS_BERKAS_SERTIFIKAT_SQL, vec![json!(id_berkas), json!(id_peserta)]).await? == 0 {
                return Err(galat("Berkas tidak ditemukan."));
            }
            Ok(json!({ "sukses": true }))
        }
        _ => Err(galat("Aksi sertifikat tidak dikenal.")),
    }
}

/// `desktop_hr_training_certificate_file`: isi satu berkas sertifikat yang
/// tertaut ke peserta (dibaca dengan `hr.training.view`, Q-148).
pub async fn berkas_sertifikat(client: &TursoClient, id_berkas: &str) -> Result<Value, CommandError> {
    client.ensure_schema_current().await?;
    satu(client, AMBIL_BERKAS_SERTIFIKAT_SQL, vec![json!(id_berkas.trim())])
        .await?
        .ok_or_else(|| CommandError::new("NOT_FOUND", "Berkas tidak ditemukan."))
}

#[cfg(test)]
mod tests {
    //! Vektor sama dengan `validations/hr-pelatihan.test.ts`; alur cloud sama
    //! dengan `services/hr-pelatihan.test.ts`.
    use super::*;

    const VEKTOR: &str = include_str!("../../../src/lib/validations/hr-pelatihan.vektor.json");

    fn cocok<T: Serialize>(hasil: Result<T, String>, k: &Value) {
        match k["galat"].as_str() {
            Some(pesan) => assert_eq!(hasil.err().as_deref(), Some(pesan), "{}", k["nama"]),
            None => assert_eq!(json!(hasil.expect("sah")), k["hasil"], "{}", k["nama"]),
        }
    }

    fn s<'a>(k: &'a Value, kunci: &str) -> &'a str {
        k[kunci].as_str().unwrap_or_default()
    }

    #[test]
    fn hr_pelatihan_vektor() {
        let v: Value = serde_json::from_str(VEKTOR).expect("hr-pelatihan.vektor.json sah");
        for k in v["pelatihan"].as_array().expect("pelatihan") {
            cocok(validasi_pelatihan(&k["draft"]), k);
        }
        for k in v["status"].as_array().expect("status") {
            let status = status_pelatihan(
                s(k, "tanggal_mulai"),
                s(k, "tanggal_selesai"),
                k["dibatalkan"].as_bool().unwrap(),
                s(k, "hari_ini"),
            );
            assert_eq!(status, s(k, "hasil"), "{}", k["nama"]);
        }
        for k in v["hasil_peserta"].as_array().expect("hasil_peserta") {
            cocok(validasi_hasil_peserta(&k["draft"]), k);
        }
        for k in v["rekap"].as_array().expect("rekap") {
            let bahan: Vec<BarisRekap> = serde_json::from_value(k["baris"].clone()).expect("baris");
            assert_eq!(json!(rekap_pelatihan(&bahan, s(k, "hari_ini"))), k["hasil"], "{}", k["nama"]);
        }
    }

    #[test]
    fn hr_pelatihan_sql_memuat_predikat_pegawai() {
        assert!(TAMBAH_PESERTA_SQL.contains(super::super::hris::PEGAWAI_SQL));
    }

    /// PNG 1×1 terkecil yang lolos tanda tangan bita.
    const PNG: &str = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

    /// Alur 7b di atas `TursoClient::local_file`, data sama dengan
    /// `services/hr-pelatihan.test.ts`: pelatihan, peserta ganda berhenti di PK,
    /// pegawai keluar ditolak, sertifikat tampil di dokumen pegawai, hapus
    /// dokumen mengosongkan `id_dokumen`, lepas peserta bersertifikat ditolak,
    /// rekap.
    #[test]
    fn hr_pelatihan_alur_cloud() {
        let runtime = tokio::runtime::Builder::new_current_thread().build().expect("runtime uji");
        runtime.block_on(async {
            let dir = tempfile::tempdir().expect("direktori sementara");
            let hub = dir.path().join("sppg-hub.db");
            let client = TursoClient::local_file(
                url::Url::parse("https://hr-pelatihan.sppg.invalid").expect("origin uji"),
                &hub,
                reqwest::Client::new(),
            );
            client.ensure_schema().await.expect("provisioning lokal");
            let c = rusqlite::Connection::open(&hub).expect("buka hub");
            c.execute_batch(
                "INSERT INTO master_data (id_unik, kode_karyawan, nama, divisi, id_shift, status_aktif, unit, id_keluar) VALUES
                   ('G1', 'KG1', 'Ani', 'Guru', 1, 'Aktif', 'SD', NULL),
                   ('T1', 'KT1', 'Budi', 'TU', 1, 'Aktif', 'SD', NULL),
                   ('X1', 'KX1', 'Cici', 'TU', 1, 'Nonaktif', 'SD', 'klr-1');
                 INSERT INTO guru_data (id_guru, created_at, updated_at) VALUES ('G1', datetime('now'), datetime('now'));",
            )
            .expect("pegawai");
            let hitung = |sql: &str| c.query_row(sql, [], |r| r.get::<_, i64>(0)).expect(sql);
            let galat_dari = |h: Result<Value, CommandError>| h.err().map(|e| e.message).unwrap_or_default();

            let pelatihan = |nama: &str, jenis: &str, mulai: &str, selesai: &str, jam: i64| {
                json!({ "nama": nama, "jenis_penyelenggara": jenis, "tanggal_mulai": mulai, "tanggal_selesai": selesai, "jumlah_jam": jam, "biaya": 500000 })
            };
            let id_dari = |h: Value| h["id_pelatihan"].as_str().unwrap().to_owned();
            let kkg = id_dari(simpan_pelatihan(&client, "uji", &pelatihan("KKG Matematika", "KKG", "2024-03-01", "2024-03-02", 16)).await.expect("kkg"));
            let dinas = id_dari(simpan_pelatihan(&client, "uji", &pelatihan("Bimtek Dinas", "Dinas", "2024-12-30", "2025-01-02", 32)).await.expect("dinas"));
            let batal = id_dari(simpan_pelatihan(&client, "uji", &pelatihan("Batal", "Internal", "2024-05-01", "2024-05-01", 8)).await.expect("batal"));
            let nanti = id_dari(simpan_pelatihan(&client, "uji", &pelatihan("Nanti", "MGMP", "2999-01-01", "2999-01-02", 8)).await.expect("nanti"));

            // Peserta: ganda berhenti di PK, pegawai keluar ditolak.
            let tambah = |id: &str, pegawai: &str| json!({ "aksi": "tambah", "id_pelatihan": id, "id_karyawan": pegawai });
            for (id, pegawai) in [(&kkg, "G1"), (&kkg, "T1"), (&dinas, "G1"), (&batal, "G1"), (&nanti, "G1")] {
                simpan_peserta(&client, "uji", &tambah(id, pegawai)).await.expect("peserta");
            }
            assert_eq!(galat_dari(simpan_peserta(&client, "uji", &tambah(&kkg, "G1")).await), PESAN_PESERTA_GANDA);
            assert_eq!(galat_dari(simpan_peserta(&client, "uji", &tambah(&kkg, "X1")).await), PESAN_PESERTA_DITOLAK);
            simpan_pelatihan(&client, "uji", &json!({ "aksi": "batal", "id_pelatihan": batal, "alasan": "Ditunda" }))
                .await
                .expect("batal");
            assert_eq!(
                galat_dari(simpan_peserta(&client, "uji", &tambah(&batal, "T1")).await),
                PESAN_PESERTA_DITOLAK
            );
            let hasil = json!({ "aksi": "hasil", "id_peserta": format!("{kkg}:T1"), "hasil": "Tidak Hadir" });
            simpan_peserta(&client, "uji", &hasil).await.expect("hasil");

            let rincian = daftar_pelatihan(&client, &json!({ "mode": "rincian", "id_pelatihan": kkg })).await.expect("rincian");
            assert_eq!(rincian["pelatihan"]["status"], json!("Selesai"));
            assert_eq!(rincian["pelatihan"]["jumlah_peserta"], json!(2));
            let daftar = daftar_pelatihan(&client, &json!({ "tahun": "2999" })).await.expect("daftar");
            assert_eq!(daftar["pelatihan"][0]["status"], json!("Dijadwalkan"));

            // Sertifikat: dokumen + tautan, tampil di tab Dokumen pegawai.
            let peserta_g1 = format!("{kkg}:G1");
            let sertifikat = json!({ "id_peserta": peserta_g1, "nomor": "S-01", "tanggal_terbit": "2024-03-02" });
            let id_dok = simpan_sertifikat(&client, "uji", &sertifikat).await.expect("sertifikat")["id_dokumen"]
                .as_str()
                .unwrap()
                .to_owned();
            let dokumen = hris_cloud::dokumen(&client, "G1").await.expect("dokumen");
            let tampil = &dokumen["dokumen"][0];
            assert_eq!(tampil["id_dokumen"], json!(id_dok));
            assert_eq!(tampil["id_jenis"], json!(JENIS_SERTIFIKAT_BAWAAN));
            assert_eq!(tampil["catatan"], json!("KKG Matematika"));
            let berkas = json!({ "aksi": "berkas_tambah", "id_peserta": peserta_g1, "nama_berkas": "s.png", "mime_type": "image/png", "data_base64": PNG });
            let id_berkas = simpan_sertifikat(&client, "uji", &berkas).await.expect("berkas")["id_berkas"]
                .as_str()
                .unwrap()
                .to_owned();
            assert_eq!(berkas_sertifikat(&client, &id_berkas).await.expect("isi")["data_base64"], json!(PNG));
            let lepas = json!({ "aksi": "lepas", "id_peserta": peserta_g1 });
            assert_eq!(galat_dari(simpan_peserta(&client, "uji", &lepas).await), PESAN_LEPAS_BERSERTIFIKAT);

            // Hapus dari tab Dokumen mengosongkan tautan; lalu lepas boleh.
            hris_cloud::hapus_dokumen(&client, &id_dok).await.expect("hapus dokumen");
            assert_eq!(hitung(&format!("SELECT COUNT(*) FROM hr_pelatihan_peserta WHERE id_peserta = '{peserta_g1}' AND id_dokumen IS NULL;")), 1);
            assert_eq!(hitung(&format!("SELECT COUNT(*) FROM hr_dokumen_berkas WHERE id_berkas = '{id_berkas}';")), 0);
            simpan_peserta(&client, "uji", &lepas).await.expect("lepas");
            simpan_peserta(&client, "uji", &tambah(&kkg, "G1")).await.expect("tambah lagi");

            // Rekap 2025: hanya Bimtek (tahun dari tanggal selesai).
            let rekap = daftar_pelatihan(&client, &json!({ "mode": "rekap", "tahun": "2025" })).await.expect("rekap");
            assert_eq!(rekap["rekap"].as_array().unwrap().len(), 1);
            assert_eq!(rekap["rekap"][0]["total_jam"], json!(32));
            assert_eq!(rekap["rekap"][0]["jam_per_jenis"]["Dinas"], json!(32));
            // Rekap 2024: KKG untuk Ani; Budi Tidak Hadir, pelatihan batal dilewati.
            let rekap = daftar_pelatihan(&client, &json!({ "mode": "rekap", "tahun": "2024", "kelompok": "Guru" })).await.expect("rekap");
            assert_eq!(rekap["rekap"].as_array().unwrap().len(), 1);
            assert_eq!(rekap["rekap"][0]["id_karyawan"], json!("G1"));
            assert_eq!(rekap["rekap"][0]["total_jam"], json!(16));
            let tendik = daftar_pelatihan(&client, &json!({ "mode": "rekap", "tahun": "2024", "kelompok": "Tendik" })).await.expect("rekap");
            assert_eq!(tendik["rekap"], json!([]));

            // Riwayat tetap terbaca sesudah pegawai keluar.
            c.execute("UPDATE master_data SET status_aktif = 'Nonaktif', id_keluar = 'klr-2' WHERE id_unik = 'G1';", [])
                .expect("keluar");
            let riwayat = daftar_pelatihan(&client, &json!({ "mode": "riwayat", "id_karyawan": "G1" })).await.expect("riwayat");
            assert_eq!(riwayat["peserta"].as_array().unwrap().len(), 4);
        });
    }
}
