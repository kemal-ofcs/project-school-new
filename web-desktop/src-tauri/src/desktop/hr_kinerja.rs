//! HRIS Fase 5 (`prd-hris.md` §23): penilaian kinerja guru dan tendik.
//!
//! Kelima tabel `hr_kinerja_*` KHUSUS CLOUD (Q-91): dibaca dan ditulis lewat
//! `TursoClient`, tidak pernah masuk SQLite perangkat, snapshot, atau outbox.
//! Tanpa koneksi, command mengembalikan `hris_cloud::PESAN_LURING`. Pengaturan
//! `hr_kinerja_*` tetap di `setting_gex_system` yang tersinkron (lokal + outbox).
//!
//! Kembaran TS: aturan dan SQL di `src/lib/validations/hr-kinerja.ts`,
//! penulisan di `src/lib/services/hr-kinerja.ts`. Vektornya
//! `validations/hr-kinerja.vektor.json`; teks SQL dan pesan dibandingkan
//! harfiah oleh `hr-kinerja.test.ts`.

use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use super::config::DesktopState;
use super::hari_kerja::tanggal_valid;
use super::hris::{self, new_id, rows_json_with};
use super::models::{CommandError, OperatorUser};
use super::time_policy::days_between;
use super::turso::{Statement, TursoClient};
use super::{storage, sync};

// Konstanta (cermin `validations/hr-kinerja.ts`)

pub const KELOMPOK_KINERJA: [&str; 2] = ["Guru", "Tendik"];
pub const TIPE_MANUAL: &str = "Manual";
pub const TIPE_KEHADIRAN: &str = "Otomatis Kehadiran";
pub const TIPE_PRESENSI: &str = "Otomatis Presensi Kelas";
pub const TIPE_JURNAL: &str = "Otomatis Jurnal";
pub const TIPE_ASPEK: [&str; 4] = [TIPE_MANUAL, TIPE_KEHADIRAN, TIPE_PRESENSI, TIPE_JURNAL];
/// Aspek yang hanya punya data untuk guru (jadwal, presensi, jurnal).
pub const TIPE_KHUSUS_GURU: [&str; 2] = [TIPE_PRESENSI, TIPE_JURNAL];

pub const MAKS_NAMA_TEMPLATE: usize = 100;
pub const MAKS_KETERANGAN: usize = 1000;
pub const MAKS_ASPEK: usize = 100;
pub const MAKS_ASPEK_AKTIF: usize = 20;
pub const MAKS_NAMA_ASPEK: usize = 100;
pub const MAKS_PANDUAN: usize = 1000;
pub const TOTAL_BOBOT: i64 = 100;

pub const KUNCI_AMBANG: &str = "hr_kinerja_ambang";
pub const KUNCI_PREDIKAT: &str = "hr_kinerja_predikat";
pub const KUNCI_TANPA_KBM: &str = "hr_kinerja_tanpa_kbm";
pub const AMBANG_BAWAAN: [i64; 4] = [950, 900, 800, 700];
/// Rentang PKG/PermenPAN-RB 16/2009 (Q-101); ambang dalam nilai ×100.
pub const PREDIKAT_BAWAAN: &str = "9100:Amat Baik|7600:Baik|6100:Cukup|5100:Sedang|0:Kurang";
pub const MIN_PREDIKAT: usize = 2;
pub const MAKS_PREDIKAT: usize = 7;
pub const MAKS_NAMA_PREDIKAT: usize = 50;
pub const MAKS_RENTANG_KBM: usize = 30;
pub const MAKS_HARI_RENTANG: i64 = 31;
pub const MAKS_NAMA_RENTANG: usize = 50;

pub const PESAN_AMBANG: &str = "Ambang harus empat bilangan bulat 1 sampai 1000 yang turun, misalnya 950,900,800,700.";
pub const PESAN_PREDIKAT: &str = "Predikat harus 2 sampai 7 pasangan nilai:nama dengan nilai turun dari 10000 dan yang terakhir 0.";
pub const PESAN_NAMA_PREDIKAT: &str = "Nama predikat 1 sampai 50 karakter tanpa tanda | dan :.";

// SQL kembar (teks harfiah sama dengan `hr-kinerja.ts`)

pub const TEMPLATE_KINERJA_SQL: &str = "SELECT id_template, nama, kelompok, COALESCE(keterangan, '') AS keterangan, is_bawaan, is_aktif, diubah_oleh, updated_at FROM hr_kinerja_template ORDER BY kelompok, is_aktif DESC, is_bawaan DESC, nama, id_template\n-- batas: template kinerja sekolah, dibuat tangan oleh pengatur\n;";
pub const ASPEK_KINERJA_SQL: &str = "SELECT id_aspek, id_template, nama, tipe, bobot, COALESCE(panduan, '') AS panduan, urutan, is_aktif FROM hr_kinerja_aspek ORDER BY id_template, urutan, id_aspek\n-- batas: paling banyak 100 aspek per template\n;";
pub const TEMPLATE_SATU_SQL: &str = "SELECT id_template, kelompok FROM hr_kinerja_template WHERE id_template = ?1;";
pub const ASPEK_TEMPLATE_SQL: &str = "SELECT id_aspek, tipe FROM hr_kinerja_aspek WHERE id_template = ?1 ORDER BY id_aspek\n-- batas: paling banyak 100 aspek per template\n;";
pub const BENTROK_TEMPLATE_SQL: &str = "SELECT 1 FROM hr_kinerja_template WHERE LOWER(TRIM(nama)) = LOWER(TRIM(?1)) AND id_template <> ?2 LIMIT 1;";
/// Kelompok tidak ikut diperbarui: terkunci sejak dibuat.
pub const SIMPAN_TEMPLATE_SQL: &str = "INSERT INTO hr_kinerja_template (id_template, nama, kelompok, keterangan, is_bawaan, is_aktif, diubah_oleh, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, datetime('now'), datetime('now')) ON CONFLICT(id_template) DO UPDATE SET nama = excluded.nama, keterangan = excluded.keterangan, is_bawaan = excluded.is_bawaan, is_aktif = excluded.is_aktif, diubah_oleh = excluded.diubah_oleh, updated_at = excluded.updated_at;";
/// Satu bawaan per kelompok, di batch yang sama dengan simpan template.
pub const LEPAS_BAWAAN_SQL: &str = "UPDATE hr_kinerja_template SET is_bawaan = 0, updated_at = datetime('now') WHERE kelompok = ?1 AND id_template <> ?2 AND is_bawaan = 1;";
/// Tipe dan template aspek tidak ikut diperbarui: terkunci sejak dibuat.
pub const SIMPAN_ASPEK_SQL: &str = "INSERT INTO hr_kinerja_aspek (id_aspek, id_template, nama, tipe, bobot, panduan, urutan, is_aktif, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, datetime('now'), datetime('now')) ON CONFLICT(id_aspek) DO UPDATE SET nama = excluded.nama, bobot = excluded.bobot, panduan = excluded.panduan, urutan = excluded.urutan, is_aktif = excluded.is_aktif, updated_at = excluded.updated_at;";
pub const SEED_TEMPLATE_SQL: &str = "INSERT OR IGNORE INTO hr_kinerja_template (id_template, nama, kelompok, keterangan, is_bawaan, is_aktif, diubah_oleh) VALUES (?1, ?2, ?3, ?4, 1, 1, 'sistem');";
pub const SEED_ASPEK_SQL: &str = "INSERT OR IGNORE INTO hr_kinerja_aspek (id_aspek, id_template, nama, tipe, bobot, panduan, urutan) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7);";
/// Penanda Kepala TU untuk penilai bawaan tendik (Q-103), tersinkron.
pub const SEED_TUGAS_KA_TU_SQL: &str = "INSERT OR IGNORE INTO hr_tugas_jenis (id_jenis, nama, ekuivalen_jp) VALUES ('tgs-ka-tu', 'Kepala Tata Usaha', 0);";
pub const PENGATURAN_KINERJA_SQL: &str = "SELECT key, value FROM setting_gex_system WHERE key IN ('hr_kinerja_ambang', 'hr_kinerja_predikat', 'hr_kinerja_tanpa_kbm') ORDER BY key;";

// Template bawaan (seed cloud v71)

const TEMPLATE_BAWAAN_JSON: &str = include_str!("../../../src/lib/validations/hr-kinerja-template-bawaan.json");

#[derive(Debug, Clone, Deserialize)]
pub struct AspekBawaan {
    pub id_aspek: String,
    pub nama: String,
    pub tipe: String,
    pub bobot: i64,
    pub panduan: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TemplateBawaan {
    pub id_template: String,
    pub nama: String,
    pub kelompok: String,
    pub keterangan: String,
    pub aspek: Vec<AspekBawaan>,
}

pub fn template_bawaan() -> Vec<TemplateBawaan> {
    serde_json::from_str(TEMPLATE_BAWAAN_JSON).expect("hr-kinerja-template-bawaan.json sah")
}

/// Cermin `seedKinerja`: template, aspeknya, lalu `tgs-ka-tu`.
pub fn seed_statements() -> Vec<Statement> {
    let mut hasil = Vec::new();
    for t in template_bawaan() {
        hasil.push(Statement::new(
            SEED_TEMPLATE_SQL,
            vec![json!(t.id_template), json!(t.nama), json!(t.kelompok), json!(t.keterangan)],
        ));
        for (urutan, a) in t.aspek.iter().enumerate() {
            hasil.push(Statement::new(
                SEED_ASPEK_SQL,
                vec![
                    json!(a.id_aspek),
                    json!(t.id_template),
                    json!(a.nama),
                    json!(a.tipe),
                    json!(a.bobot),
                    json!(a.panduan),
                    json!(urutan as i64),
                ],
            ));
        }
    }
    hasil.push(Statement::new(SEED_TUGAS_KA_TU_SQL, vec![]));
    hasil
}

// Template

fn panjang(teks: &str) -> usize {
    teks.chars().count()
}

fn teks_draft(draft: &Value, kunci: &str) -> String {
    draft.get(kunci).and_then(Value::as_str).unwrap_or_default().to_owned()
}

fn bendera(draft: &Value, kunci: &str) -> bool {
    draft.get(kunci).and_then(Value::as_bool).unwrap_or(false)
}

fn kosong_jadi_none(teks: &str) -> Option<String> {
    let t = teks.trim();
    (!t.is_empty()).then(|| t.to_owned())
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct AspekSah {
    pub id_aspek: Option<String>,
    pub nama: String,
    pub tipe: String,
    pub bobot: i64,
    pub panduan: Option<String>,
    pub urutan: i64,
    pub is_aktif: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct TemplateSah {
    pub id_template: Option<String>,
    pub nama: String,
    pub kelompok: String,
    pub keterangan: Option<String>,
    pub is_bawaan: bool,
    pub is_aktif: bool,
    pub aspek: Vec<AspekSah>,
}

/// Cermin `validasiTemplate`; urutan pemeriksaan dan pesannya sama.
pub fn validasi_template(draft: &Value) -> Result<TemplateSah, String> {
    let nama = teks_draft(draft, "nama").trim().to_owned();
    if nama.is_empty() {
        return Err("Nama template wajib diisi.".into());
    }
    if panjang(&nama) > MAKS_NAMA_TEMPLATE {
        return Err(format!("Nama template maksimal {MAKS_NAMA_TEMPLATE} karakter."));
    }
    let kelompok = teks_draft(draft, "kelompok");
    if !KELOMPOK_KINERJA.contains(&kelompok.as_str()) {
        return Err("Kelompok template harus Guru atau Tendik.".into());
    }
    let keterangan = kosong_jadi_none(&teks_draft(draft, "keterangan"));
    if keterangan.as_deref().is_some_and(|k| panjang(k) > MAKS_KETERANGAN) {
        return Err(format!("Keterangan maksimal {MAKS_KETERANGAN} karakter."));
    }
    let is_bawaan = bendera(draft, "is_bawaan");
    let is_aktif = bendera(draft, "is_aktif");
    if is_bawaan && !is_aktif {
        return Err("Template bawaan tidak bisa dinonaktifkan.".into());
    }
    let daftar = draft.get("aspek").and_then(Value::as_array).cloned().unwrap_or_default();
    if daftar.len() > MAKS_ASPEK {
        return Err(format!("Aspek paling banyak {MAKS_ASPEK}."));
    }

    let mut aspek = Vec::new();
    let mut nama_dipakai = HashSet::new();
    for (urutan, a) in daftar.iter().enumerate() {
        let nama_aspek = teks_draft(a, "nama").trim().to_owned();
        if nama_aspek.is_empty() {
            return Err("Nama aspek wajib diisi.".into());
        }
        if panjang(&nama_aspek) > MAKS_NAMA_ASPEK {
            return Err(format!("Nama aspek maksimal {MAKS_NAMA_ASPEK} karakter."));
        }
        let tipe = teks_draft(a, "tipe");
        if !TIPE_ASPEK.contains(&tipe.as_str()) {
            return Err(format!("Tipe aspek \"{tipe}\" tidak dikenal."));
        }
        if kelompok == "Tendik" && TIPE_KHUSUS_GURU.contains(&tipe.as_str()) {
            return Err(format!("Aspek {tipe} hanya untuk template Guru."));
        }
        let bobot = a.get("bobot").and_then(Value::as_i64).filter(|b| (1..=TOTAL_BOBOT).contains(b));
        let Some(bobot) = bobot else {
            return Err(format!("Bobot aspek \"{nama_aspek}\" harus bilangan bulat 1 sampai 100."));
        };
        let panduan = kosong_jadi_none(&teks_draft(a, "panduan"));
        if panduan.as_deref().is_some_and(|p| panjang(p) > MAKS_PANDUAN) {
            return Err(format!("Panduan aspek \"{nama_aspek}\" maksimal {MAKS_PANDUAN} karakter."));
        }
        if !nama_dipakai.insert(nama_aspek.to_lowercase()) {
            return Err(format!("Nama aspek \"{nama_aspek}\" dipakai dua kali."));
        }
        aspek.push(AspekSah {
            id_aspek: kosong_jadi_none(&teks_draft(a, "id_aspek")),
            nama: nama_aspek,
            tipe,
            bobot,
            panduan,
            urutan: urutan as i64,
            is_aktif: bendera(a, "is_aktif"),
        });
    }

    let aktif: Vec<&AspekSah> = aspek.iter().filter(|a| a.is_aktif).collect();
    if aktif.is_empty() {
        return Err("Template butuh paling sedikit satu aspek aktif.".into());
    }
    if aktif.len() > MAKS_ASPEK_AKTIF {
        return Err(format!("Aspek aktif paling banyak {MAKS_ASPEK_AKTIF}."));
    }
    for tipe in TIPE_ASPEK.iter().filter(|t| **t != TIPE_MANUAL) {
        if aktif.iter().filter(|a| a.tipe == *tipe).count() > 1 {
            return Err(format!("Aspek {tipe} hanya boleh satu per template."));
        }
    }
    let total: i64 = aktif.iter().map(|a| a.bobot).sum();
    if total != TOTAL_BOBOT {
        return Err(format!("Total bobot aspek aktif harus 100, sekarang {total}."));
    }

    Ok(TemplateSah {
        id_template: kosong_jadi_none(&teks_draft(draft, "id_template")),
        nama,
        kelompok,
        keterangan,
        is_bawaan,
        is_aktif,
        aspek,
    })
}

/// Cermin `periksaTemplateLama`: kelompok, tipe aspek, dan keberadaan aspek
/// lama terkunci. `kelompok_lama` `None` = template baru.
pub fn periksa_template_lama(
    baru: &TemplateSah,
    kelompok_lama: Option<&str>,
    aspek_lama: &[(String, String)],
) -> Result<(), String> {
    if kelompok_lama.is_some_and(|k| k != baru.kelompok) {
        return Err("Kelompok template tidak bisa diubah.".into());
    }
    let lama: HashMap<&str, &str> = aspek_lama.iter().map(|(id, tipe)| (id.as_str(), tipe.as_str())).collect();
    for a in &baru.aspek {
        let Some(id) = a.id_aspek.as_deref() else {
            continue;
        };
        match lama.get(id) {
            None => return Err("Aspek tidak dikenal untuk template ini.".into()),
            Some(tipe) if *tipe != a.tipe => {
                return Err(format!("Tipe aspek \"{}\" tidak bisa diubah.", a.nama));
            }
            Some(_) => {}
        }
    }
    let dikirim: HashSet<&str> = baru.aspek.iter().filter_map(|a| a.id_aspek.as_deref()).collect();
    if lama.keys().any(|id| !dikirim.contains(id)) {
        return Err("Aspek tidak bisa dihapus; nonaktifkan saja.".into());
    }
    Ok(())
}

// Pengaturan

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Predikat {
    pub ambang: i64,
    pub nama: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct RentangTanpaKbm {
    pub mulai: String,
    pub selesai: String,
    pub nama: String,
}

fn angka_sah(teks: &str) -> Option<i64> {
    if teks.is_empty() || !teks.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    teks.parse().ok()
}

/// Cermin `validasiAmbang`: bentuk kanonik `950,900,800,700`.
pub fn validasi_ambang(teks: &str) -> Result<String, String> {
    let bagian: Vec<&str> = teks.split(',').map(str::trim).collect();
    let angka: Vec<i64> = bagian.iter().filter_map(|s| angka_sah(s)).collect();
    if bagian.len() != 4 || angka.len() != 4 {
        return Err(PESAN_AMBANG.into());
    }
    for (i, a) in angka.iter().enumerate() {
        if !(1..=1000).contains(a) || (i > 0 && *a >= angka[i - 1]) {
            return Err(PESAN_AMBANG.into());
        }
    }
    Ok(angka.iter().map(i64::to_string).collect::<Vec<_>>().join(","))
}

/// Cermin `parseAmbang`: kosong atau rusak = bawaan.
pub fn parse_ambang(nilai: Option<&str>) -> [i64; 4] {
    match nilai.map(validasi_ambang) {
        Some(Ok(kanonik)) => {
            let a: Vec<i64> = kanonik.split(',').filter_map(|s| s.parse().ok()).collect();
            [a[0], a[1], a[2], a[3]]
        }
        _ => AMBANG_BAWAAN,
    }
}

/// Cermin `validasiPredikat`: bentuk kanonik `9100:Amat Baik|…|0:Kurang`.
pub fn validasi_predikat(teks: &str) -> Result<String, String> {
    let bagian: Vec<&str> = teks.split('|').collect();
    if bagian.len() < MIN_PREDIKAT || bagian.len() > MAKS_PREDIKAT {
        return Err(PESAN_PREDIKAT.into());
    }
    let mut daftar: Vec<Predikat> = Vec::new();
    for b in bagian {
        let Some((ambang_teks, nama)) = b.split_once(':') else {
            return Err(PESAN_PREDIKAT.into());
        };
        let Some(ambang) = angka_sah(ambang_teks.trim()) else {
            return Err(PESAN_PREDIKAT.into());
        };
        if ambang > 10000 {
            return Err(PESAN_PREDIKAT.into());
        }
        let nama = nama.trim();
        if nama.is_empty() || panjang(nama) > MAKS_NAMA_PREDIKAT || nama.contains(':') {
            return Err(PESAN_NAMA_PREDIKAT.into());
        }
        if daftar.last().is_some_and(|p| ambang >= p.ambang) {
            return Err(PESAN_PREDIKAT.into());
        }
        daftar.push(Predikat { ambang, nama: nama.to_owned() });
    }
    if daftar.last().map(|p| p.ambang) != Some(0) {
        return Err(PESAN_PREDIKAT.into());
    }
    Ok(daftar
        .iter()
        .map(|p| format!("{}:{}", p.ambang, p.nama))
        .collect::<Vec<_>>()
        .join("|"))
}

fn urai_predikat(kanonik: &str) -> Vec<Predikat> {
    kanonik
        .split('|')
        .filter_map(|b| b.split_once(':'))
        .map(|(a, n)| Predikat { ambang: a.parse().unwrap_or(0), nama: n.to_owned() })
        .collect()
}

/// Cermin `parsePredikat`: kosong atau rusak = bawaan.
pub fn parse_predikat(nilai: Option<&str>) -> Vec<Predikat> {
    match nilai.map(validasi_predikat) {
        Some(Ok(kanonik)) => urai_predikat(&kanonik),
        _ => urai_predikat(PREDIKAT_BAWAAN),
    }
}

/// Cermin `predikatNilai`: pasangan pertama yang ambangnya ≤ nilai ×100.
// Dipakai alur penilaian 5b; sampai itu hanya diuji vektor.
#[cfg(test)]
pub fn predikat_nilai(nilai_x100: i64, daftar: &[Predikat]) -> String {
    daftar
        .iter()
        .find(|p| p.ambang <= nilai_x100)
        .or_else(|| daftar.last())
        .map(|p| p.nama.clone())
        .unwrap_or_default()
}

fn bentuk_tanggal(teks: &str) -> bool {
    let b = teks.as_bytes();
    b.len() == 10
        && b.iter().enumerate().all(|(i, c)| if i == 4 || i == 7 { *c == b'-' } else { c.is_ascii_digit() })
}

/// Potongan manual yang sama dengan regex `RENTANG` di TS:
/// `YYYY-MM-DD..YYYY-MM-DD:<apa pun>`.
fn urai_rentang(teks: &str) -> Option<(&str, &str, &str)> {
    let mulai = teks.get(0..10)?;
    let titik = teks.get(10..12)?;
    let selesai = teks.get(12..22)?;
    let pemisah = teks.get(22..23)?;
    let nama = teks.get(23..)?;
    (bentuk_tanggal(mulai) && titik == ".." && bentuk_tanggal(selesai) && pemisah == ":")
        .then_some((mulai, selesai, nama))
}

/// Cermin `validasiTanpaKbm`: kosong sah; bentuk kanonik dipisah `|`.
pub fn validasi_tanpa_kbm(teks: &str) -> Result<String, String> {
    let isi = teks.trim();
    if isi.is_empty() {
        return Ok(String::new());
    }
    let bagian: Vec<&str> = isi.split('|').map(str::trim).collect();
    if bagian.len() > MAKS_RENTANG_KBM {
        return Err(format!("Rentang tanpa KBM paling banyak {MAKS_RENTANG_KBM}."));
    }
    let mut hasil = Vec::new();
    for b in bagian {
        let Some((mulai, selesai, nama)) = urai_rentang(b) else {
            return Err(format!("Rentang \"{b}\" harus berbentuk YYYY-MM-DD..YYYY-MM-DD:Nama."));
        };
        let nama = nama.trim();
        if nama.is_empty() || panjang(nama) > MAKS_NAMA_RENTANG {
            return Err(format!("Nama rentang 1 sampai {MAKS_NAMA_RENTANG} karakter."));
        }
        if !tanggal_valid(mulai) || !tanggal_valid(selesai) {
            return Err(format!("Tanggal rentang \"{nama}\" tidak valid."));
        }
        let hari = days_between(mulai, selesai).map_err(|_| format!("Tanggal rentang \"{nama}\" tidak valid."))?;
        if hari < 0 {
            return Err(format!("Rentang \"{nama}\" berakhir sebelum mulai."));
        }
        if hari + 1 > MAKS_HARI_RENTANG {
            return Err(format!("Rentang \"{nama}\" paling panjang {MAKS_HARI_RENTANG} hari."));
        }
        hasil.push(format!("{mulai}..{selesai}:{nama}"));
    }
    Ok(hasil.join("|"))
}

/// Cermin `parseTanpaKbm`: kosong atau rusak = tanpa rentang.
pub fn parse_tanpa_kbm(nilai: Option<&str>) -> Vec<RentangTanpaKbm> {
    match nilai.map(validasi_tanpa_kbm) {
        Some(Ok(kanonik)) if !kanonik.is_empty() => kanonik
            .split('|')
            .filter_map(urai_rentang)
            .map(|(mulai, selesai, nama)| RentangTanpaKbm {
                mulai: mulai.to_owned(),
                selesai: selesai.to_owned(),
                nama: nama.to_owned(),
            })
            .collect(),
        _ => Vec::new(),
    }
}

/// Cermin `validasiPengaturanKinerja`: ketiga kunci wajib sekaligus, kunci
/// asing ditolak (Web menolaknya lewat Zod `.strict()`).
pub fn validasi_pengaturan_kinerja(draft: &Value) -> Result<Vec<(String, String)>, String> {
    let Some(objek) = draft.as_object() else {
        return Err("Pengaturan kinerja tidak valid.".into());
    };
    if objek.keys().any(|k| !matches!(k.as_str(), "ambang" | "predikat" | "tanpa_kbm")) {
        return Err("Pengaturan kinerja tidak valid.".into());
    }
    let ambang = validasi_ambang(&teks_draft(draft, "ambang"))?;
    let predikat = validasi_predikat(&teks_draft(draft, "predikat"))?;
    let tanpa_kbm = validasi_tanpa_kbm(&teks_draft(draft, "tanpa_kbm"))?;
    Ok(vec![
        (KUNCI_AMBANG.to_owned(), ambang),
        (KUNCI_PREDIKAT.to_owned(), predikat),
        (KUNCI_TANPA_KBM.to_owned(), tanpa_kbm),
    ])
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct PengaturanKinerja {
    pub ambang: [i64; 4],
    pub predikat: Vec<Predikat>,
    pub tanpa_kbm: Vec<RentangTanpaKbm>,
}

/// Cermin `pengaturanKinerja`: nilai berlaku dari `setting_gex_system`.
pub fn pengaturan_kinerja(peta: &HashMap<String, String>) -> PengaturanKinerja {
    PengaturanKinerja {
        ambang: parse_ambang(peta.get(KUNCI_AMBANG).map(String::as_str)),
        predikat: parse_predikat(peta.get(KUNCI_PREDIKAT).map(String::as_str)),
        tanpa_kbm: parse_tanpa_kbm(peta.get(KUNCI_TANPA_KBM).map(String::as_str)),
    }
}

/// Cermin `skorAmbang`: permil ke skor 1–5 lewat (a₅, a₄, a₃, a₂).
// Dipakai aspek otomatis 5b; sampai itu hanya diuji vektor.
#[cfg(test)]
pub fn skor_ambang(permil: i64, ambang: &[i64; 4]) -> i64 {
    ambang
        .iter()
        .position(|a| permil >= *a)
        .map_or(1, |i| 5 - i as i64)
}

// Akses cloud dan lokal

fn galat(pesan: impl Into<String>) -> CommandError {
    CommandError::new("VALIDATION_ERROR", pesan)
}

fn teks(baris: &Value, kunci: &str) -> String {
    match baris.get(kunci) {
        Some(Value::String(s)) => s.clone(),
        Some(Value::Number(n)) => n.to_string(),
        _ => String::new(),
    }
}

async fn baris(client: &TursoClient, sql: &str, args: Vec<Value>) -> Result<Vec<Value>, CommandError> {
    Ok(client
        .query_one(sql, args)
        .await?
        .to_objects()
        .into_iter()
        .map(|b| json!(b))
        .collect())
}

async fn satu(client: &TursoClient, sql: &str, args: Vec<Value>) -> Result<Option<Value>, CommandError> {
    Ok(baris(client, sql, args).await?.into_iter().next())
}

fn pengaturan_dari(rows: &[Value]) -> Value {
    let peta: HashMap<String, String> = rows.iter().map(|r| (teks(r, "key"), teks(r, "value"))).collect();
    json!(pengaturan_kinerja(&peta))
}

/// Pengaturan kinerja dari SQLite perangkat (tersinkron, lebih baru daripada
/// cloud sampai outbox terdorong).
pub fn pengaturan_lokal(state: &DesktopState) -> Result<Value, CommandError> {
    let connection = storage::database(&state.data_dir)?;
    Ok(pengaturan_dari(&rows_json_with(&connection, PENGATURAN_KINERJA_SQL, [])?))
}

/// `desktop_hr_performance_templates`: template dengan aspeknya + pengaturan.
pub async fn daftar_template(client: &TursoClient, pengaturan: Value) -> Result<Value, CommandError> {
    client.ensure_schema_current().await?;
    let template = baris(client, TEMPLATE_KINERJA_SQL, vec![]).await?;
    let aspek = baris(client, ASPEK_KINERJA_SQL, vec![]).await?;
    let susun: Vec<Value> = template
        .into_iter()
        .map(|mut t| {
            let id = teks(&t, "id_template");
            t["aspek"] = json!(aspek.iter().filter(|a| teks(a, "id_template") == id).collect::<Vec<_>>());
            t
        })
        .collect();
    Ok(json!({ "template": susun, "pengaturan": pengaturan }))
}

/// `desktop_hr_performance_template_save`: buat atau ubah template beserta
/// semua aspeknya dalam satu batch cloud; bawaan lain sekelompok dilepas di
/// batch yang sama.
pub async fn simpan_template(
    client: &TursoClient,
    operator: &OperatorUser,
    draft: &Value,
) -> Result<Value, CommandError> {
    client.ensure_schema_current().await?;
    let sah = validasi_template(draft).map_err(galat)?;
    let (id, kelompok_lama, aspek_lama) = match &sah.id_template {
        Some(id) => {
            let lama = satu(client, TEMPLATE_SATU_SQL, vec![json!(id)])
                .await?
                .ok_or_else(|| galat("Template kinerja tidak ditemukan."))?;
            let aspek: Vec<(String, String)> = baris(client, ASPEK_TEMPLATE_SQL, vec![json!(id)])
                .await?
                .iter()
                .map(|a| (teks(a, "id_aspek"), teks(a, "tipe")))
                .collect();
            (id.clone(), Some(teks(&lama, "kelompok")), aspek)
        }
        None => (new_id("ktp-"), None, Vec::new()),
    };
    periksa_template_lama(&sah, kelompok_lama.as_deref(), &aspek_lama).map_err(galat)?;
    if satu(client, BENTROK_TEMPLATE_SQL, vec![json!(sah.nama), json!(id)]).await?.is_some() {
        return Err(galat(format!("Nama \"{}\" sudah dipakai template lain.", sah.nama)));
    }

    let mut perintah = vec![Statement::new(
        SIMPAN_TEMPLATE_SQL,
        vec![
            json!(id),
            json!(sah.nama),
            json!(sah.kelompok),
            json!(sah.keterangan),
            json!(i64::from(sah.is_bawaan)),
            json!(i64::from(sah.is_aktif)),
            json!(operator.username),
        ],
    )];
    if sah.is_bawaan {
        perintah.push(Statement::new(LEPAS_BAWAAN_SQL, vec![json!(sah.kelompok), json!(id)]));
    }
    for a in &sah.aspek {
        let id_aspek = a.id_aspek.clone().unwrap_or_else(|| new_id(&format!("{id}:")));
        perintah.push(Statement::new(
            SIMPAN_ASPEK_SQL,
            vec![
                json!(id_aspek),
                json!(id),
                json!(a.nama),
                json!(a.tipe),
                json!(a.bobot),
                json!(a.panduan),
                json!(a.urutan),
                json!(i64::from(a.is_aktif)),
            ],
        ));
    }
    client.execute_atomic(perintah).await?;
    Ok(json!({ "sukses": true, "id_template": id }))
}

/// `desktop_hr_performance_settings_save`: ketiga kunci dalam satu transaksi
/// lokal, masing-masing dengan event outbox `setting` (`hris::tulis_setting`).
pub fn simpan_pengaturan(state: &DesktopState, draft: &Value) -> Result<Value, CommandError> {
    let nilai = validasi_pengaturan_kinerja(draft).map_err(galat)?;
    let client_id = sync::ensure_client_id(state)?;
    let mut connection = storage::database(&state.data_dir)?;
    let transaction = connection.transaction().map_err(|_| CommandError::internal())?;
    for (kunci, isi) in &nilai {
        hris::tulis_setting(&transaction, &client_id, kunci, isi)?;
    }
    let hasil = pengaturan_dari(&rows_json_with(&transaction, PENGATURAN_KINERJA_SQL, [])?);
    transaction.commit().map_err(|_| CommandError::internal())?;
    Ok(hasil)
}

#[cfg(test)]
mod tests {
    //! Vektor sama dengan `validations/hr-kinerja.test.ts`.
    use super::*;

    const VEKTOR: &str = include_str!("../../../src/lib/validations/hr-kinerja.vektor.json");

    fn vektor() -> Value {
        serde_json::from_str(VEKTOR).expect("hr-kinerja.vektor.json sah")
    }

    fn cocok<T: Serialize>(hasil: Result<T, String>, k: &Value) {
        match k["galat"].as_str() {
            Some(pesan) => assert_eq!(hasil.err().as_deref(), Some(pesan), "{}", k["nama"]),
            None => assert_eq!(json!(hasil.expect("sah")), k["hasil"], "{}", k["nama"]),
        }
    }

    #[test]
    fn hr_kinerja_vektor_template() {
        let v = vektor();
        for k in v["template"].as_array().expect("template") {
            cocok(validasi_template(&k["draft"]), k);
        }
        for k in v["template_lama"].as_array().expect("template_lama") {
            let baru = validasi_template(&k["draft"]).expect("draft sah");
            let lama: Vec<(String, String)> = k["aspek_lama"]
                .as_array()
                .expect("aspek_lama")
                .iter()
                .map(|a| (teks(a, "id_aspek"), teks(a, "tipe")))
                .collect();
            let hasil = periksa_template_lama(&baru, k["kelompok_lama"].as_str(), &lama);
            cocok(hasil.map(|()| Value::Null), k);
        }
    }

    #[test]
    fn hr_kinerja_vektor_pengaturan() {
        let v = vektor();
        for k in v["ambang"].as_array().expect("ambang") {
            cocok(validasi_ambang(k["masukan"].as_str().unwrap()), k);
        }
        for k in v["predikat"].as_array().expect("predikat") {
            cocok(validasi_predikat(k["masukan"].as_str().unwrap()), k);
        }
        for k in v["tanpa_kbm"].as_array().expect("tanpa_kbm") {
            cocok(validasi_tanpa_kbm(k["masukan"].as_str().unwrap()), k);
        }
        for k in v["pengaturan"].as_array().expect("pengaturan") {
            let hasil = validasi_pengaturan_kinerja(&k["draft"])
                .map(|n| n.into_iter().map(|(a, b)| vec![a, b]).collect::<Vec<_>>());
            cocok(hasil, k);
        }
        for k in v["berlaku"].as_array().expect("berlaku") {
            let peta: HashMap<String, String> = k["peta"]
                .as_object()
                .expect("peta")
                .iter()
                .map(|(a, b)| (a.clone(), b.as_str().unwrap_or_default().to_owned()))
                .collect();
            assert_eq!(json!(pengaturan_kinerja(&peta)), k["hasil"], "{}", k["nama"]);
        }
    }

    #[test]
    fn hr_kinerja_vektor_skor_dan_predikat() {
        let v = vektor();
        for k in v["skor_ambang"].as_array().expect("skor_ambang") {
            let a: Vec<i64> = serde_json::from_value(k["ambang"].clone()).expect("ambang");
            let skor = skor_ambang(k["permil"].as_i64().unwrap(), &[a[0], a[1], a[2], a[3]]);
            assert_eq!(skor, k["skor"].as_i64().unwrap(), "{k}");
        }
        for k in v["pilih_predikat"].as_array().expect("pilih_predikat") {
            let daftar = parse_predikat(k["predikat"].as_str());
            assert_eq!(predikat_nilai(k["nilai"].as_i64().unwrap(), &daftar), k["hasil"].as_str().unwrap(), "{k}");
        }
    }

    #[test]
    fn hr_kinerja_template_bawaan_sah() {
        for t in template_bawaan() {
            let draft = json!({
                "nama": t.nama, "kelompok": t.kelompok, "keterangan": t.keterangan,
                "is_bawaan": true, "is_aktif": true,
                "aspek": t.aspek.iter().map(|a| json!({
                    "nama": a.nama, "tipe": a.tipe, "bobot": a.bobot,
                    "panduan": a.panduan, "is_aktif": true,
                })).collect::<Vec<_>>(),
            });
            validasi_template(&draft).unwrap_or_else(|e| panic!("{}: {e}", t.id_template));
            assert!(t.aspek.iter().all(|a| a.id_aspek.starts_with(&format!("{}:", t.id_template))));
        }
        // Dua template, 14 aspek, satu jenis tugas.
        assert_eq!(seed_statements().len(), 2 + 14 + 1);
    }

    fn operator(izin: &[&str]) -> OperatorUser {
        OperatorUser {
            id: 2,
            kode_operator: "OP2".into(),
            nama_operator: "Uji".into(),
            username: "uji".into(),
            role: "Admin".into(),
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
        }
    }

    /// Cloud lewat `TursoClient::local_file` di atas `ensure_schema`: seed
    /// dua template bawaan + `tgs-ka-tu` sekali, satu bawaan per kelompok,
    /// kelompok dan tipe terkunci, aspek tidak bisa dihapus, nama kembar
    /// ditolak.
    #[test]
    fn hr_kinerja_template_cloud() {
        let runtime = tokio::runtime::Builder::new_current_thread().build().expect("runtime uji");
        runtime.block_on(async {
            let dir = tempfile::tempdir().expect("direktori sementara");
            let hub = dir.path().join("sppg-hub.db");
            let client = TursoClient::local_file(
                url::Url::parse("https://hr-kinerja.sppg.invalid").expect("origin uji"),
                &hub,
                reqwest::Client::new(),
            );
            client.ensure_schema().await.expect("provisioning lokal");
            client.ensure_schema().await.expect("provisioning ulang");
            let c = rusqlite::Connection::open(&hub).expect("buka hub");
            let hitung = |sql: &str| c.query_row(sql, [], |r| r.get::<_, i64>(0)).expect(sql);
            assert_eq!(hitung("SELECT COUNT(*) FROM hr_kinerja_template WHERE is_bawaan = 1;"), 2);
            assert_eq!(hitung("SELECT COUNT(*) FROM hr_kinerja_aspek;"), 14);
            assert_eq!(hitung("SELECT COUNT(*) FROM hr_tugas_jenis WHERE id_jenis = 'tgs-ka-tu';"), 1);
            assert_eq!(hitung("SELECT COUNT(*) FROM schema_migration WHERE version IN (71, -2047);"), 2);

            let pengatur = operator(&["hr.performance.config"]);
            let galat_dari = |h: Result<Value, CommandError>| h.err().map(|e| e.message).unwrap_or_default();
            let aspek = |nama: &str, tipe: &str, bobot: i64| {
                json!({ "nama": nama, "tipe": tipe, "bobot": bobot, "is_aktif": true })
            };
            let draft = json!({
                "nama": "Satpam", "kelompok": "Tendik", "is_bawaan": true, "is_aktif": true,
                "aspek": [aspek("Kehadiran", TIPE_KEHADIRAN, 40), aspek("Kewaspadaan", TIPE_MANUAL, 60)],
            });
            let hasil = simpan_template(&client, &pengatur, &draft).await.expect("template baru");
            let id = hasil["id_template"].as_str().unwrap().to_owned();
            assert!(id.starts_with("ktp-"));
            // Bawaan tendik pindah; bawaan guru tetap.
            assert_eq!(hitung("SELECT is_bawaan FROM hr_kinerja_template WHERE id_template = 'ktp-tendik';"), 0);
            assert_eq!(hitung("SELECT is_bawaan FROM hr_kinerja_template WHERE id_template = 'ktp-guru';"), 1);
            assert_eq!(hitung("SELECT COUNT(*) FROM hr_kinerja_template WHERE is_bawaan = 1;"), 2);
            // Provisioning ulang tidak mengembalikan bawaan seed.
            client.ensure_schema().await.expect("provisioning ketiga");
            assert_eq!(hitung("SELECT is_bawaan FROM hr_kinerja_template WHERE id_template = 'ktp-tendik';"), 0);

            let tersimpan: Vec<(String, String)> = {
                let mut s = c
                    .prepare("SELECT id_aspek, tipe FROM hr_kinerja_aspek WHERE id_template = ?1 ORDER BY urutan;")
                    .expect("aspek");
                s.query_map([&id], |r| Ok((r.get(0)?, r.get(1)?))).expect("baris").map(Result::unwrap).collect()
            };
            assert_eq!(tersimpan.len(), 2);
            let ubah = |nama: &str, kelompok: &str, tipe_pertama: &str, dengan_kedua: bool| {
                let mut daftar = vec![json!({
                    "id_aspek": tersimpan[0].0, "nama": "Kehadiran", "tipe": tipe_pertama,
                    "bobot": 40, "is_aktif": true,
                })];
                if dengan_kedua {
                    daftar.push(json!({
                        "id_aspek": tersimpan[1].0, "nama": "Kewaspadaan", "tipe": TIPE_MANUAL,
                        "bobot": 60, "is_aktif": true,
                    }));
                } else {
                    daftar.push(aspek("Ronda", TIPE_MANUAL, 60));
                }
                json!({
                    "id_template": id, "nama": nama, "kelompok": kelompok,
                    "is_bawaan": true, "is_aktif": true, "aspek": daftar,
                })
            };
            assert_eq!(
                galat_dari(simpan_template(&client, &pengatur, &ubah("Satpam", "Guru", TIPE_KEHADIRAN, true)).await),
                "Kelompok template tidak bisa diubah."
            );
            assert_eq!(
                galat_dari(simpan_template(&client, &pengatur, &ubah("Satpam", "Tendik", TIPE_MANUAL, true)).await),
                "Tipe aspek \"Kehadiran\" tidak bisa diubah."
            );
            assert_eq!(
                galat_dari(simpan_template(&client, &pengatur, &ubah("Satpam", "Tendik", TIPE_KEHADIRAN, false)).await),
                "Aspek tidak bisa dihapus; nonaktifkan saja."
            );
            assert_eq!(
                galat_dari(
                    simpan_template(&client, &pengatur, &ubah("penilaian kinerja guru", "Tendik", TIPE_KEHADIRAN, true))
                        .await
                ),
                "Nama \"penilaian kinerja guru\" sudah dipakai template lain."
            );
            simpan_template(&client, &pengatur, &ubah("Satpam Malam", "Tendik", TIPE_KEHADIRAN, true))
                .await
                .expect("ubah nama");
            assert_eq!(hitung("SELECT COUNT(*) FROM hr_kinerja_aspek WHERE id_template = (SELECT id_template FROM hr_kinerja_template WHERE nama = 'Satpam Malam');"), 2);
            assert_eq!(
                galat_dari(
                    simpan_template(&client, &pengatur, &json!({
                        "id_template": "ktp-tidak-ada", "nama": "X", "kelompok": "Guru",
                        "is_bawaan": false, "is_aktif": true, "aspek": [aspek("A", TIPE_MANUAL, 100)],
                    }))
                    .await
                ),
                "Template kinerja tidak ditemukan."
            );
        });
    }
}
