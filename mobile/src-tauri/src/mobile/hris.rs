// BERKAS INI HASIL SALIN OTOMATIS dari web-desktop oleh
// `mobile/scripts/sync-rust-modules.ts`. JANGAN disunting dengan tangan —
// perubahannya akan tertimpa diam-diam pada sinkronisasi berikutnya.
// Sunting sumbernya: `web-desktop/src-tauri/src/desktop/hris.rs`.

//! HRIS Fase 1a (`prd-hris.md` §19.2.1): bagian dan jabatan sebagai master.
//!
//! Teks `master_data.divisi`/`jabatan_status` tetap ada dan selalu diisi nama
//! sekarang (A-1), supaya scanner, kartu ID, payroll, dan kueri lama tidak
//! berubah. Ganti nama dan gabung bagian menulis ulang riwayat anggotanya dan
//! konfigurasi kini (Q-17 (a)), lokal dan di handler cloud dengan SQL yang
//! sama.
//!
//! Aturan murni dan SQL di berkas ini dicerminkan
//! `src/lib/validations/hris.ts`; vektornya `validations/hris.vektor.json`,
//! teks SQL dibandingkan harfiah oleh `hris.test.ts`.

use std::collections::{BTreeMap, BTreeSet, HashMap};

use rusqlite::{params, OptionalExtension, Transaction};
use serde::Deserialize;
use serde_json::{json, Value};

use super::{config::MobileState, models::CommandError, storage, sync};

pub const NAMA_MAKS: usize = 60;

/// Pegawai = personil yang bukan siswa (alias `m` = `master_data`).
pub const PEGAWAI_SQL: &str = "LOWER(TRIM(COALESCE(m.jenis_personil, ''))) <> 'siswa' AND NOT EXISTS (SELECT 1 FROM siswa_data sd WHERE sd.id_siswa = m.id_unik)";

/// Migrasi v68, sekali per database cloud (`ensure_hris_organisasi_v68`).
/// Id bagian/jabatan hasil migrasi deterministik dari teksnya, sehingga Web
/// dan Rust menghasilkan id yang sama.
pub const MIGRASI_ORGANISASI_SQL: [&str; 7] = [
    "INSERT OR IGNORE INTO hr_bagian (id_bagian, nama) SELECT 'bag-' || lower(hex(lower(trim(m.divisi)))), trim(m.divisi) FROM master_data m WHERE LOWER(TRIM(COALESCE(m.jenis_personil, ''))) <> 'siswa' AND NOT EXISTS (SELECT 1 FROM siswa_data sd WHERE sd.id_siswa = m.id_unik) AND trim(COALESCE(m.divisi, '')) <> '' GROUP BY lower(trim(m.divisi)), trim(m.divisi) ORDER BY lower(trim(m.divisi)), COUNT(*) DESC, trim(m.divisi);",
    "INSERT OR IGNORE INTO hr_bagian_nama (id_nama, id_bagian, nama) SELECT b.id_bagian || ':' || lower(hex(lower(b.nama))), b.id_bagian, b.nama FROM hr_bagian b;",
    "INSERT OR IGNORE INTO hr_jabatan (id_jabatan, nama) SELECT 'jab-' || lower(hex(lower(trim(m.jabatan_status)))), trim(m.jabatan_status) FROM master_data m WHERE LOWER(TRIM(COALESCE(m.jenis_personil, ''))) <> 'siswa' AND NOT EXISTS (SELECT 1 FROM siswa_data sd WHERE sd.id_siswa = m.id_unik) AND trim(COALESCE(m.jabatan_status, '')) NOT IN ('', '-') GROUP BY lower(trim(m.jabatan_status)), trim(m.jabatan_status) ORDER BY lower(trim(m.jabatan_status)), COUNT(*) DESC, trim(m.jabatan_status);",
    "UPDATE master_data SET id_bagian = 'bag-' || lower(hex(lower(trim(divisi)))) WHERE id_bagian IS NULL AND trim(COALESCE(divisi, '')) <> '' AND id_unik IN (SELECT m.id_unik FROM master_data m WHERE LOWER(TRIM(COALESCE(m.jenis_personil, ''))) <> 'siswa' AND NOT EXISTS (SELECT 1 FROM siswa_data sd WHERE sd.id_siswa = m.id_unik));",
    "UPDATE master_data SET id_jabatan = 'jab-' || lower(hex(lower(trim(jabatan_status)))) WHERE id_jabatan IS NULL AND trim(COALESCE(jabatan_status, '')) NOT IN ('', '-') AND id_unik IN (SELECT m.id_unik FROM master_data m WHERE LOWER(TRIM(COALESCE(m.jenis_personil, ''))) <> 'siswa' AND NOT EXISTS (SELECT 1 FROM siswa_data sd WHERE sd.id_siswa = m.id_unik));",
    "INSERT OR IGNORE INTO hr_tugas_jenis (id_jenis, nama, ekuivalen_jp) VALUES ('tgs-kepsek', 'Kepala Sekolah', 24), ('tgs-wakasek', 'Wakil Kepala Sekolah', 12), ('tgs-kaprog', 'Kepala Program Keahlian', 12), ('tgs-kaperpus', 'Kepala Perpustakaan', 12), ('tgs-kalab', 'Kepala Laboratorium/Bengkel', 12), ('tgs-wali-kelas', 'Wali Kelas', 2), ('tgs-pembina-osis', 'Pembina OSIS', 2), ('tgs-pembina-ekskul', 'Pembina Ekstrakurikuler', 2), ('tgs-piket', 'Guru Piket', 1), ('tgs-bendahara-bos', 'Bendahara BOS', 0);",
    "INSERT OR IGNORE INTO hr_dokumen_jenis (id_jenis, nama) VALUES ('dok-ktp', 'KTP'), ('dok-kk', 'Kartu Keluarga'), ('dok-npwp', 'NPWP'), ('dok-ijazah', 'Ijazah'), ('dok-transkrip', 'Transkrip Nilai'), ('dok-serdik', 'Sertifikat Pendidik'), ('dok-sk-yayasan', 'SK Yayasan'), ('dok-sk-tugas', 'SK Tugas'), ('dok-kontrak', 'Kontrak Kerja'), ('dok-skck', 'SKCK'), ('dok-sehat', 'Surat Keterangan Sehat'), ('dok-pelatihan', 'Sertifikat Pelatihan'), ('dok-lainnya', 'Lainnya');",
];

/// ?1 = id_bagian, ?2 = nama, ?3 = is_aktif.
pub const SIMPAN_BAGIAN_SQL: &str = "INSERT INTO hr_bagian (id_bagian, nama, is_aktif, created_at, updated_at) VALUES (?1, ?2, ?3, datetime('now'), datetime('now')) ON CONFLICT(id_bagian) DO UPDATE SET nama = excluded.nama, is_aktif = excluded.is_aktif, updated_at = excluded.updated_at;";
/// ?1 = id_nama (`id_nama_bagian`), ?2 = id_bagian, ?3 = nama.
pub const CATAT_NAMA_BAGIAN_SQL: &str = "INSERT OR IGNORE INTO hr_bagian_nama (id_nama, id_bagian, nama, created_at) VALUES (?1, ?2, ?3, datetime('now'));";
/// ?1 = id_jabatan, ?2 = nama, ?3 = is_aktif.
pub const SIMPAN_JABATAN_SQL: &str = "INSERT INTO hr_jabatan (id_jabatan, nama, is_aktif, created_at, updated_at) VALUES (?1, ?2, ?3, datetime('now'), datetime('now')) ON CONFLICT(id_jabatan) DO UPDATE SET nama = excluded.nama, is_aktif = excluded.is_aktif, updated_at = excluded.updated_at;";

/// Nama sekarang bagian ?1 ke semua anggotanya dan ke riwayat yang hari ini
/// ditulis ulang saat identitas satu orang berubah, plus sasaran `DIVISI:`
/// komponen gaji dan whitelist libur yang memakai nama mana pun milik bagian
/// itu. Slip beku (`payroll_items`) tidak disentuh. Aman diulang. Statement
/// pertama menautkan pegawai tanpa bagian yang teks divisinya cocok dengan
/// nama bagian ini ("Jadikan bagian" di tab Organisasi).
pub const TULIS_ULANG_BAGIAN_SQL: [&str; 10] = [
    "UPDATE master_data SET id_bagian = ?1 WHERE COALESCE(id_bagian, '') = '' AND EXISTS (SELECT 1 FROM hr_bagian WHERE id_bagian = ?1 AND is_aktif = 1) AND lower(trim(divisi)) IN (SELECT lower(trim(nama)) FROM hr_bagian_nama WHERE id_bagian = ?1) AND LOWER(TRIM(COALESCE(jenis_personil, ''))) <> 'siswa' AND NOT EXISTS (SELECT 1 FROM siswa_data sd WHERE sd.id_siswa = master_data.id_unik);",
    "UPDATE master_data SET divisi = (SELECT nama FROM hr_bagian WHERE id_bagian = ?1) WHERE id_bagian = ?1 AND EXISTS (SELECT 1 FROM hr_bagian WHERE id_bagian = ?1) AND divisi IS NOT (SELECT nama FROM hr_bagian WHERE id_bagian = ?1);",
    "UPDATE id_card SET divisi = (SELECT nama FROM hr_bagian WHERE id_bagian = ?1) WHERE id_unik IN (SELECT id_unik FROM master_data WHERE id_bagian = ?1) AND EXISTS (SELECT 1 FROM hr_bagian WHERE id_bagian = ?1) AND divisi IS NOT (SELECT nama FROM hr_bagian WHERE id_bagian = ?1);",
    "UPDATE absensi_harian SET kelas_divisi = (SELECT nama FROM hr_bagian WHERE id_bagian = ?1) WHERE id_karyawan IN (SELECT id_unik FROM master_data WHERE id_bagian = ?1) AND EXISTS (SELECT 1 FROM hr_bagian WHERE id_bagian = ?1) AND kelas_divisi IS NOT (SELECT nama FROM hr_bagian WHERE id_bagian = ?1);",
    "UPDATE log_scan SET divisi = (SELECT nama FROM hr_bagian WHERE id_bagian = ?1) WHERE id_karyawan IN (SELECT id_unik FROM master_data WHERE id_bagian = ?1) AND EXISTS (SELECT 1 FROM hr_bagian WHERE id_bagian = ?1) AND divisi IS NOT (SELECT nama FROM hr_bagian WHERE id_bagian = ?1);",
    "UPDATE backup_karyawan SET divisi_pengganti = (SELECT nama FROM hr_bagian WHERE id_bagian = ?1) WHERE id_karyawan_pengganti IN (SELECT id_unik FROM master_data WHERE id_bagian = ?1) AND EXISTS (SELECT 1 FROM hr_bagian WHERE id_bagian = ?1) AND divisi_pengganti IS NOT (SELECT nama FROM hr_bagian WHERE id_bagian = ?1);",
    "UPDATE backup_karyawan SET divisi_asal = (SELECT nama FROM hr_bagian WHERE id_bagian = ?1) WHERE id_karyawan_asal IN (SELECT id_unik FROM master_data WHERE id_bagian = ?1) AND EXISTS (SELECT 1 FROM hr_bagian WHERE id_bagian = ?1) AND divisi_asal IS NOT (SELECT nama FROM hr_bagian WHERE id_bagian = ?1);",
    "UPDATE koreksi_admin SET divisi = (SELECT nama FROM hr_bagian WHERE id_bagian = ?1) WHERE id_karyawan IN (SELECT id_unik FROM master_data WHERE id_bagian = ?1) AND EXISTS (SELECT 1 FROM hr_bagian WHERE id_bagian = ?1) AND divisi IS NOT (SELECT nama FROM hr_bagian WHERE id_bagian = ?1);",
    "UPDATE payroll_components SET applies_to = 'DIVISI:' || (SELECT nama FROM hr_bagian WHERE id_bagian = ?1) WHERE EXISTS (SELECT 1 FROM hr_bagian WHERE id_bagian = ?1) AND upper(substr(trim(applies_to), 1, 7)) = 'DIVISI:' AND lower(trim(substr(trim(applies_to), 8))) IN (SELECT lower(trim(nama)) FROM hr_bagian_nama WHERE id_bagian = ?1) AND applies_to IS NOT ('DIVISI:' || (SELECT nama FROM hr_bagian WHERE id_bagian = ?1));",
    "UPDATE hari_libur_whitelist SET scope_value = (SELECT nama FROM hr_bagian WHERE id_bagian = ?1), updated_at = datetime('now') WHERE scope_type = 'DIVISI' AND EXISTS (SELECT 1 FROM hr_bagian WHERE id_bagian = ?1) AND lower(trim(scope_value)) IN (SELECT lower(trim(nama)) FROM hr_bagian_nama WHERE id_bagian = ?1) AND scope_value IS NOT (SELECT nama FROM hr_bagian WHERE id_bagian = ?1);",
];

/// Nama jabatan ?1 ke semua pemegangnya. Kartu ID membaca `jabatan_status`
/// dari `master_data`, jadi satu tabel cukup.
pub const TULIS_ULANG_JABATAN_SQL: &str = "UPDATE master_data SET jabatan_status = (SELECT nama FROM hr_jabatan WHERE id_jabatan = ?1) WHERE id_jabatan = ?1 AND EXISTS (SELECT 1 FROM hr_jabatan WHERE id_jabatan = ?1) AND jabatan_status IS NOT (SELECT nama FROM hr_jabatan WHERE id_jabatan = ?1);";

/// Gabungkan bagian ?1 ke ?2 (Q-38): nama-nama ?1 menjadi nama lama ?2,
/// anggotanya pindah, ?1 dinonaktifkan. Sesudahnya `TULIS_ULANG_BAGIAN_SQL`
/// dijalankan untuk ?2. Tujuan yang tidak ada = tidak terjadi apa-apa.
pub const GABUNG_BAGIAN_SQL: [&str; 3] = [
    "INSERT OR IGNORE INTO hr_bagian_nama (id_nama, id_bagian, nama, created_at) SELECT ?2 || substr(id_nama, length(?1) + 1), ?2, nama, created_at FROM hr_bagian_nama WHERE id_bagian = ?1 AND ?1 <> ?2 AND EXISTS (SELECT 1 FROM hr_bagian WHERE id_bagian = ?2);",
    "UPDATE master_data SET id_bagian = ?2 WHERE id_bagian = ?1 AND ?1 <> ?2 AND EXISTS (SELECT 1 FROM hr_bagian WHERE id_bagian = ?2);",
    "UPDATE hr_bagian SET is_aktif = 0, updated_at = datetime('now') WHERE id_bagian = ?1 AND ?1 <> ?2 AND EXISTS (SELECT 1 FROM hr_bagian WHERE id_bagian = ?2);",
];

/// Teks divisi → bagian, termasuk nama lama; bagian aktif didahulukan.
/// ?1 = teks yang sudah `normalisasi_nama`.
pub const PETA_BAGIAN_SQL: &str = "SELECT n.id_bagian, b.nama FROM hr_bagian_nama n JOIN hr_bagian b ON b.id_bagian = n.id_bagian WHERE lower(trim(n.nama)) = lower(trim(?1)) ORDER BY b.is_aktif DESC, n.created_at DESC, n.id_nama LIMIT 1;";
/// Teks jabatan → jabatan; jabatan tidak punya riwayat nama (pola Q-39 perusahaan).
pub const PETA_JABATAN_SQL: &str = "SELECT id_jabatan, nama FROM hr_jabatan WHERE lower(trim(nama)) = lower(trim(?1)) ORDER BY is_aktif DESC, id_jabatan LIMIT 1;";

/// ?1 = nama, ?2 = id bagian yang disimpan (kosong untuk bagian baru).
/// Bentrok dengan nama sekarang ATAU nama lama bagian aktif lain.
pub const BENTROK_BAGIAN_SQL: &str = "SELECT 1 FROM hr_bagian b WHERE b.id_bagian <> ?2 AND b.is_aktif = 1 AND lower(trim(b.nama)) = lower(trim(?1)) UNION ALL SELECT 1 FROM hr_bagian_nama n JOIN hr_bagian b ON b.id_bagian = n.id_bagian WHERE n.id_bagian <> ?2 AND b.is_aktif = 1 AND lower(trim(n.nama)) = lower(trim(?1)) LIMIT 1;";
/// ?1 = nama, ?2 = id jabatan yang disimpan.
pub const BENTROK_JABATAN_SQL: &str = "SELECT 1 FROM hr_jabatan WHERE id_jabatan <> ?2 AND is_aktif = 1 AND lower(trim(nama)) = lower(trim(?1)) LIMIT 1;";

/// Pegawai untuk halaman Kepegawaian dan pemilih atasan.
pub const ORG_PEGAWAI_SQL: &str = "SELECT m.id_unik, COALESCE(m.kode_karyawan, '') AS kode_karyawan, m.nama, COALESCE(m.unit, '') AS unit, COALESCE(m.divisi, '') AS divisi, COALESCE(m.jabatan_status, '') AS jabatan_status, COALESCE(m.id_bagian, '') AS id_bagian, COALESCE(m.id_jabatan, '') AS id_jabatan, COALESCE(m.id_atasan, '') AS id_atasan, COALESCE(m.status_aktif, 'Aktif') AS status_aktif, COALESCE(m.tanggal_mulai_aktif, '') AS tmt, CASE WHEN g.id_guru IS NOT NULL OR LOWER(TRIM(COALESCE(m.jenis_personil, ''))) = 'guru' THEN 'Guru' ELSE 'Tendik' END AS kelompok, COALESCE(g.status_kepegawaian, '') AS status_kepegawaian FROM master_data m LEFT JOIN guru_data g ON g.id_guru = m.id_unik WHERE LOWER(TRIM(COALESCE(m.jenis_personil, ''))) <> 'siswa' AND NOT EXISTS (SELECT 1 FROM siswa_data sd WHERE sd.id_siswa = m.id_unik) ORDER BY m.nama, m.id_unik\n-- batas: pegawai sekolah (guru dan tendik), dibatasi jumlah personil lembaga\n;";
pub const ORG_BAGIAN_SQL: &str = "SELECT id_bagian, nama, is_aktif FROM hr_bagian ORDER BY nama, id_bagian\n-- batas: daftar bagian sekolah, tidak tumbuh per hari\n;";
pub const ORG_BAGIAN_NAMA_SQL: &str = "SELECT id_bagian, nama FROM hr_bagian_nama ORDER BY created_at, id_nama\n-- batas: nama yang pernah dipakai bagian sekolah\n;";
pub const ORG_JABATAN_SQL: &str = "SELECT id_jabatan, nama, is_aktif FROM hr_jabatan ORDER BY nama, id_jabatan\n-- batas: daftar jabatan sekolah, tidak tumbuh per hari\n;";

// ─── Aturan murni ───────────────────────────────────────────────────────────

/// Spasi beruntun menjadi satu, spasi tepi dibuang.
pub fn normalisasi_nama(nama: &str) -> String {
    nama.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Kunci pembanding nama: tanpa beda huruf besar-kecil dan spasi ganda.
pub fn kunci_nama(nama: &str) -> String {
    normalisasi_nama(nama).to_lowercase()
}

pub fn validasi_nama_master(nama: &str, jenis: &str) -> Result<String, String> {
    let nama = normalisasi_nama(nama);
    let panjang = nama.chars().count();
    if panjang < 2 {
        return Err(format!("Nama {jenis} minimal 2 karakter."));
    }
    if panjang > NAMA_MAKS {
        return Err(format!("Nama {jenis} maksimal {NAMA_MAKS} karakter."));
    }
    Ok(nama)
}

/// Id `hr_bagian_nama`: dua perangkat yang mencatat nama yang sama untuk satu
/// bagian menghasilkan satu baris. Sama dengan bentuk SQL migrasi
/// (`lower(hex(lower(nama)))`, `lower` SQLite hanya ASCII).
pub fn id_nama_bagian(id_bagian: &str, nama: &str) -> String {
    format!("{id_bagian}:{}", hex::encode(nama.to_ascii_lowercase().as_bytes()))
}

/// Atasan ?id_atasan untuk ?id_karyawan: bukan dirinya, tanpa siklus.
/// `atasan` = peta pegawai → atasannya sekarang. Keberadaan dan "bukan
/// siswa" diperiksa pemanggil.
pub fn periksa_atasan(
    id_karyawan: &str,
    id_atasan: &str,
    atasan: &HashMap<String, String>,
) -> Result<(), String> {
    if id_atasan.is_empty() {
        return Ok(());
    }
    if id_atasan == id_karyawan {
        return Err("Atasan tidak boleh dirinya sendiri.".to_owned());
    }
    let mut dilalui = BTreeSet::new();
    let mut kini = id_atasan.to_owned();
    while let Some(berikut) = atasan.get(&kini).filter(|id| !id.is_empty()) {
        if berikut == id_karyawan {
            return Err("Atasan ini membuat rantai atasan yang berputar.".to_owned());
        }
        if !dilalui.insert(kini.clone()) {
            break;
        }
        kini = berikut.clone();
    }
    Ok(())
}

/// Pegawai yang berada di dalam siklus atasan (dua perangkat luring), terurut.
pub fn dalam_siklus_atasan(atasan: &HashMap<String, String>) -> Vec<String> {
    let mut hasil = BTreeSet::new();
    for awal in atasan.keys() {
        let mut dilalui = BTreeSet::new();
        let mut kini = awal.clone();
        while let Some(berikut) = atasan.get(&kini).filter(|id| !id.is_empty()) {
            if berikut == awal {
                hasil.insert(awal.clone());
                break;
            }
            if !dilalui.insert(kini.clone()) {
                break;
            }
            kini = berikut.clone();
        }
    }
    hasil.into_iter().collect()
}

#[derive(Debug, Deserialize)]
pub struct PegawaiOrg {
    pub id_unik: String,
    pub divisi: String,
    pub id_bagian: String,
    pub id_jabatan: String,
    pub id_atasan: String,
}

#[derive(Debug, Deserialize)]
pub struct MasterOrg {
    pub id: String,
    pub nama: String,
    pub is_aktif: i64,
}

#[derive(Debug, Deserialize)]
pub struct NamaLama {
    pub id_bagian: String,
    pub nama: String,
}

/// Turunan halaman Organisasi: jumlah anggota, nama lama, tanda nama ganda
/// (dua master AKTIF berkunci sama), siklus atasan, dan teks divisi pegawai
/// tanpa master yang tidak cocok nama mana pun.
pub fn susun_org(
    pegawai: &[PegawaiOrg],
    bagian: &[MasterOrg],
    nama_lama: &[NamaLama],
    jabatan: &[MasterOrg],
) -> Value {
    let ganda = |daftar: &[MasterOrg]| {
        let mut hitung: HashMap<String, usize> = HashMap::new();
        for m in daftar.iter().filter(|m| m.is_aktif == 1) {
            *hitung.entry(kunci_nama(&m.nama)).or_default() += 1;
        }
        hitung
    };
    let ganda_bagian = ganda(bagian);
    let ganda_jabatan = ganda(jabatan);
    let anggota = |id: &str, pilih: fn(&PegawaiOrg) -> &str| {
        pegawai.iter().filter(|p| pilih(p) == id).count()
    };
    let bagian_json: Vec<Value> = bagian
        .iter()
        .map(|b| {
            let lama: Vec<&str> = nama_lama
                .iter()
                .filter(|n| n.id_bagian == b.id && kunci_nama(&n.nama) != kunci_nama(&b.nama))
                .map(|n| n.nama.as_str())
                .collect();
            json!({
                "id_bagian": b.id,
                "nama": b.nama,
                "is_aktif": b.is_aktif,
                "anggota": anggota(&b.id, |p| p.id_bagian.as_str()),
                "nama_lama": lama,
                "nama_ganda": b.is_aktif == 1 && ganda_bagian.get(&kunci_nama(&b.nama)).copied().unwrap_or(0) > 1,
            })
        })
        .collect();
    let jabatan_json: Vec<Value> = jabatan
        .iter()
        .map(|j| {
            json!({
                "id_jabatan": j.id,
                "nama": j.nama,
                "is_aktif": j.is_aktif,
                "anggota": anggota(&j.id, |p| p.id_jabatan.as_str()),
                "nama_ganda": j.is_aktif == 1 && ganda_jabatan.get(&kunci_nama(&j.nama)).copied().unwrap_or(0) > 1,
            })
        })
        .collect();
    let dikenal: BTreeSet<String> = nama_lama
        .iter()
        .map(|n| kunci_nama(&n.nama))
        .chain(bagian.iter().map(|b| kunci_nama(&b.nama)))
        .collect();
    let mut tanpa: BTreeMap<String, (String, usize)> = BTreeMap::new();
    for p in pegawai.iter().filter(|p| p.id_bagian.is_empty()) {
        let kunci = kunci_nama(&p.divisi);
        if kunci.is_empty() || dikenal.contains(&kunci) {
            continue;
        }
        let entri = tanpa
            .entry(kunci)
            .or_insert_with(|| (normalisasi_nama(&p.divisi), 0));
        entri.1 += 1;
    }
    let atasan: HashMap<String, String> = pegawai
        .iter()
        .map(|p| (p.id_unik.clone(), p.id_atasan.clone()))
        .collect();
    json!({
        "bagian": bagian_json,
        "jabatan": jabatan_json,
        "tanpa_master": tanpa
            .into_values()
            .map(|(divisi, jumlah)| json!({ "divisi": divisi, "jumlah": jumlah }))
            .collect::<Vec<_>>(),
        "atasan_siklus": dalam_siklus_atasan(&atasan),
    })
}

// ─── Handler cloud (statement murni, tanpa membaca) ─────────────────────────

fn teks(row: &Value, kunci: &str) -> String {
    row.get(kunci)
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .to_owned()
}

fn aktif(row: &Value) -> i64 {
    match row.get("is_aktif") {
        Some(Value::Bool(false)) => 0,
        Some(v) if v.as_i64() == Some(0) => 0,
        _ => 1,
    }
}

/// `hr-section/save`: upsert, catat nama, tulis ulang anggota. Payload
/// cacat = tidak ada statement (cloud tidak menolak karena master).
pub fn cloud_bagian_statements(payload: &Value, entity_key: &str) -> Vec<(String, Vec<Value>)> {
    let id = Some(teks(payload, "id_bagian"))
        .filter(|id| !id.is_empty())
        .unwrap_or_else(|| entity_key.trim().to_owned());
    let nama = normalisasi_nama(&teks(payload, "nama"));
    if id.is_empty() || nama.is_empty() {
        return Vec::new();
    }
    let mut hasil = vec![
        (SIMPAN_BAGIAN_SQL.to_owned(), vec![json!(id), json!(nama), json!(aktif(payload))]),
        (
            CATAT_NAMA_BAGIAN_SQL.to_owned(),
            vec![json!(id_nama_bagian(&id, &nama)), json!(id), json!(nama)],
        ),
    ];
    hasil.extend(
        TULIS_ULANG_BAGIAN_SQL
            .iter()
            .map(|sql| ((*sql).to_owned(), vec![json!(id)])),
    );
    hasil
}

/// `hr-section/merge`: `{ id_asal, id_tujuan }`.
pub fn cloud_gabung_statements(payload: &Value) -> Vec<(String, Vec<Value>)> {
    let asal = teks(payload, "id_asal");
    let tujuan = teks(payload, "id_tujuan");
    if asal.is_empty() || tujuan.is_empty() || asal == tujuan {
        return Vec::new();
    }
    let mut hasil: Vec<(String, Vec<Value>)> = GABUNG_BAGIAN_SQL
        .iter()
        .map(|sql| ((*sql).to_owned(), vec![json!(asal), json!(tujuan)]))
        .collect();
    hasil.extend(
        TULIS_ULANG_BAGIAN_SQL
            .iter()
            .map(|sql| ((*sql).to_owned(), vec![json!(tujuan)])),
    );
    hasil
}

/// `hr-position/save`.
pub fn cloud_jabatan_statements(payload: &Value, entity_key: &str) -> Vec<(String, Vec<Value>)> {
    let id = Some(teks(payload, "id_jabatan"))
        .filter(|id| !id.is_empty())
        .unwrap_or_else(|| entity_key.trim().to_owned());
    let nama = normalisasi_nama(&teks(payload, "nama"));
    if id.is_empty() || nama.is_empty() {
        return Vec::new();
    }
    vec![
        (SIMPAN_JABATAN_SQL.to_owned(), vec![json!(id), json!(nama), json!(aktif(payload))]),
        (TULIS_ULANG_JABATAN_SQL.to_owned(), vec![json!(id)]),
    ]
}

/// Penjaga "pegawai" untuk statement per orang; ?1 = id_unik.
const PEGAWAI_ID_SQL: &str = "LOWER(TRIM(COALESCE(jenis_personil, ''))) <> 'siswa' AND NOT EXISTS (SELECT 1 FROM siswa_data sd WHERE sd.id_siswa = ?1)";

/// Kolom organisasi dari event `employee/*`, dijalankan SESUDAH upsert baris.
/// Kunci absen atau `null` = tidak dibawa (perangkat lama): teks dipetakan
/// lewat nama master; `""` = dikosongkan. Dengan master yang dikenal, teks
/// `divisi`/`jabatan_status` diambil dari master, sehingga event telat tidak
/// mengembalikan nama lama. Siswa dilewati.
pub fn cloud_organisasi_pegawai(id_unik: &str, row: &Value) -> Vec<(String, Vec<Value>)> {
    let mut hasil = Vec::new();
    let id = json!(id_unik);
    match row.get("id_bagian").and_then(Value::as_str) {
        Some(nilai) => hasil.push((
            format!("UPDATE master_data SET id_bagian = NULLIF(TRIM(?2), '') WHERE id_unik = ?1 AND {PEGAWAI_ID_SQL};"),
            vec![id.clone(), json!(nilai)],
        )),
        None => hasil.push((
            format!("UPDATE master_data SET id_bagian = (SELECT n.id_bagian FROM hr_bagian_nama n JOIN hr_bagian b ON b.id_bagian = n.id_bagian WHERE lower(trim(n.nama)) = lower(trim(master_data.divisi)) ORDER BY b.is_aktif DESC, n.created_at DESC, n.id_nama LIMIT 1) WHERE id_unik = ?1 AND {PEGAWAI_ID_SQL};"),
            vec![id.clone()],
        )),
    }
    match row.get("id_jabatan").and_then(Value::as_str) {
        Some(nilai) => hasil.push((
            format!("UPDATE master_data SET id_jabatan = NULLIF(TRIM(?2), '') WHERE id_unik = ?1 AND {PEGAWAI_ID_SQL};"),
            vec![id.clone(), json!(nilai)],
        )),
        None => hasil.push((
            format!("UPDATE master_data SET id_jabatan = (SELECT j.id_jabatan FROM hr_jabatan j WHERE lower(trim(j.nama)) = lower(trim(master_data.jabatan_status)) ORDER BY j.is_aktif DESC, j.id_jabatan LIMIT 1) WHERE id_unik = ?1 AND {PEGAWAI_ID_SQL};"),
            vec![id.clone()],
        )),
    }
    if let Some(nilai) = row.get("id_atasan").and_then(Value::as_str) {
        hasil.push((
            format!("UPDATE master_data SET id_atasan = NULLIF(TRIM(?2), '') WHERE id_unik = ?1 AND {PEGAWAI_ID_SQL};"),
            vec![id.clone(), json!(nilai)],
        ));
    }
    hasil.push((
        "UPDATE master_data SET divisi = (SELECT nama FROM hr_bagian WHERE id_bagian = master_data.id_bagian) WHERE id_unik = ?1 AND EXISTS (SELECT 1 FROM hr_bagian WHERE id_bagian = master_data.id_bagian) AND divisi IS NOT (SELECT nama FROM hr_bagian WHERE id_bagian = master_data.id_bagian);".to_owned(),
        vec![id.clone()],
    ));
    hasil.push((
        "UPDATE master_data SET jabatan_status = (SELECT nama FROM hr_jabatan WHERE id_jabatan = master_data.id_jabatan) WHERE id_unik = ?1 AND EXISTS (SELECT 1 FROM hr_jabatan WHERE id_jabatan = master_data.id_jabatan) AND jabatan_status IS NOT (SELECT nama FROM hr_jabatan WHERE id_jabatan = master_data.id_jabatan);".to_owned(),
        vec![id],
    ));
    hasil
}

// ─── Penulisan lokal (Desktop/Mobile) ───────────────────────────────────────

fn invalid(message: impl Into<String>) -> CommandError {
    CommandError::new("VALIDATION_ERROR", message)
}

fn db_error(_: rusqlite::Error) -> CommandError {
    CommandError::internal()
}

fn new_id(prefix: &str) -> String {
    let mut bytes = [0u8; 12];
    rand_core::RngCore::fill_bytes(&mut rand_core::OsRng, &mut bytes);
    format!("{prefix}{}", hex::encode(bytes))
}

fn rows_json(transaction: &Transaction<'_>, sql: &str) -> Result<Vec<Value>, CommandError> {
    let mut statement = transaction.prepare(sql).map_err(db_error)?;
    let names: Vec<String> = statement.column_names().iter().map(|n| (*n).to_owned()).collect();
    let rows = statement
        .query_map([], |row| {
            let mut obj = serde_json::Map::new();
            for (i, name) in names.iter().enumerate() {
                let value = match row.get_ref(i)? {
                    rusqlite::types::ValueRef::Null => Value::Null,
                    rusqlite::types::ValueRef::Integer(n) => json!(n),
                    rusqlite::types::ValueRef::Real(f) => json!(f),
                    rusqlite::types::ValueRef::Text(t) => json!(String::from_utf8_lossy(t)),
                    rusqlite::types::ValueRef::Blob(_) => Value::Null,
                };
                obj.insert(name.clone(), value);
            }
            Ok(Value::Object(obj))
        })
        .map_err(db_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(db_error)?;
    Ok(rows)
}

fn master_org(rows: &[Value], kunci_id: &str) -> Vec<MasterOrg> {
    rows.iter()
        .map(|r| MasterOrg {
            id: teks(r, kunci_id),
            nama: r.get("nama").and_then(Value::as_str).unwrap_or("").to_owned(),
            is_aktif: r.get("is_aktif").and_then(Value::as_i64).unwrap_or(1),
        })
        .collect()
}

/// `desktop_hr_org`: pegawai + master + turunan (`susun_org`).
pub fn org(state: &MobileState) -> Result<Value, CommandError> {
    let mut connection = storage::database(&state.data_dir)?;
    let transaction = connection.transaction().map_err(db_error)?;
    let pegawai = rows_json(&transaction, ORG_PEGAWAI_SQL)?;
    let bagian = rows_json(&transaction, ORG_BAGIAN_SQL)?;
    let nama = rows_json(&transaction, ORG_BAGIAN_NAMA_SQL)?;
    let jabatan = rows_json(&transaction, ORG_JABATAN_SQL)?;
    let pegawai_org: Vec<PegawaiOrg> = pegawai
        .iter()
        .filter_map(|p| serde_json::from_value(p.clone()).ok())
        .collect();
    let nama_lama: Vec<NamaLama> = nama
        .iter()
        .filter_map(|n| serde_json::from_value(n.clone()).ok())
        .collect();
    let mut hasil = susun_org(
        &pegawai_org,
        &master_org(&bagian, "id_bagian"),
        &nama_lama,
        &master_org(&jabatan, "id_jabatan"),
    );
    hasil["pegawai"] = Value::Array(pegawai);
    Ok(hasil)
}

#[derive(Debug, Deserialize)]
pub struct MasterDraft {
    #[serde(default)]
    pub id: Option<String>,
    pub nama: String,
    #[serde(default = "satu")]
    pub is_aktif: i64,
}

fn satu() -> i64 {
    1
}

fn ada(transaction: &Transaction<'_>, sql: &str, args: impl rusqlite::Params) -> Result<bool, CommandError> {
    transaction
        .query_row(sql, args, |_| Ok(()))
        .optional()
        .map(|r| r.is_some())
        .map_err(db_error)
}

/// `desktop_hr_section_save`: bagian baru atau ganti nama/aktif.
pub fn simpan_bagian(state: &MobileState, draft: Value) -> Result<Value, CommandError> {
    let draft: MasterDraft =
        serde_json::from_value(draft).map_err(|_| invalid("Data bagian tidak valid."))?;
    let nama = validasi_nama_master(&draft.nama, "bagian").map_err(invalid)?;
    if !matches!(draft.is_aktif, 0 | 1) {
        return Err(invalid("Status aktif bagian tidak valid."));
    }
    let client_id = sync::ensure_client_id(state)?;
    let mut connection = storage::database(&state.data_dir)?;
    let transaction = connection.transaction().map_err(db_error)?;
    let id = match draft.id.as_deref().map(str::trim).filter(|id| !id.is_empty()) {
        Some(id) => {
            if !ada(&transaction, "SELECT 1 FROM hr_bagian WHERE id_bagian = ?1;", params![id])? {
                return Err(invalid("Bagian tidak ditemukan."));
            }
            id.to_owned()
        }
        None => new_id("bag-"),
    };
    if ada(&transaction, BENTROK_BAGIAN_SQL, params![nama, id])? {
        return Err(invalid(format!(
            "Nama \"{nama}\" sudah dipakai bagian lain (nama sekarang atau nama lamanya)."
        )));
    }
    transaction
        .execute(SIMPAN_BAGIAN_SQL, params![id, nama, draft.is_aktif])
        .map_err(db_error)?;
    transaction
        .execute(CATAT_NAMA_BAGIAN_SQL, params![id_nama_bagian(&id, &nama), id, nama])
        .map_err(db_error)?;
    for sql in TULIS_ULANG_BAGIAN_SQL {
        transaction.execute(sql, params![id]).map_err(db_error)?;
    }
    let payload = json!({ "id_bagian": id, "nama": nama, "is_aktif": draft.is_aktif });
    sync::enqueue(&transaction, &client_id, "hr-section", "save", &id, &payload, None)?;
    transaction.commit().map_err(db_error)?;
    Ok(payload)
}

/// `desktop_hr_section_merge`: anggota `id_asal` pindah ke `id_tujuan`.
pub fn gabung_bagian(state: &MobileState, id_asal: &str, id_tujuan: &str) -> Result<Value, CommandError> {
    let (asal, tujuan) = (id_asal.trim(), id_tujuan.trim());
    if asal.is_empty() || tujuan.is_empty() || asal == tujuan {
        return Err(invalid("Pilih dua bagian yang berbeda."));
    }
    let client_id = sync::ensure_client_id(state)?;
    let mut connection = storage::database(&state.data_dir)?;
    let transaction = connection.transaction().map_err(db_error)?;
    if !ada(&transaction, "SELECT 1 FROM hr_bagian WHERE id_bagian = ?1;", params![asal])? {
        return Err(invalid("Bagian asal tidak ditemukan."));
    }
    if !ada(&transaction, "SELECT 1 FROM hr_bagian WHERE id_bagian = ?1 AND is_aktif = 1;", params![tujuan])? {
        return Err(invalid("Bagian tujuan harus bagian aktif."));
    }
    for sql in GABUNG_BAGIAN_SQL {
        transaction.execute(sql, params![asal, tujuan]).map_err(db_error)?;
    }
    for sql in TULIS_ULANG_BAGIAN_SQL {
        transaction.execute(sql, params![tujuan]).map_err(db_error)?;
    }
    let payload = json!({ "id_asal": asal, "id_tujuan": tujuan });
    sync::enqueue(&transaction, &client_id, "hr-section", "merge", asal, &payload, None)?;
    transaction.commit().map_err(db_error)?;
    Ok(payload)
}

/// `desktop_hr_position_save`.
pub fn simpan_jabatan(state: &MobileState, draft: Value) -> Result<Value, CommandError> {
    let draft: MasterDraft =
        serde_json::from_value(draft).map_err(|_| invalid("Data jabatan tidak valid."))?;
    let nama = validasi_nama_master(&draft.nama, "jabatan").map_err(invalid)?;
    if !matches!(draft.is_aktif, 0 | 1) {
        return Err(invalid("Status aktif jabatan tidak valid."));
    }
    let client_id = sync::ensure_client_id(state)?;
    let mut connection = storage::database(&state.data_dir)?;
    let transaction = connection.transaction().map_err(db_error)?;
    let id = match draft.id.as_deref().map(str::trim).filter(|id| !id.is_empty()) {
        Some(id) => {
            if !ada(&transaction, "SELECT 1 FROM hr_jabatan WHERE id_jabatan = ?1;", params![id])? {
                return Err(invalid("Jabatan tidak ditemukan."));
            }
            id.to_owned()
        }
        None => new_id("jab-"),
    };
    if ada(&transaction, BENTROK_JABATAN_SQL, params![nama, id])? {
        return Err(invalid(format!("Nama \"{nama}\" sudah dipakai jabatan lain.")));
    }
    transaction
        .execute(SIMPAN_JABATAN_SQL, params![id, nama, draft.is_aktif])
        .map_err(db_error)?;
    transaction.execute(TULIS_ULANG_JABATAN_SQL, params![id]).map_err(db_error)?;
    let payload = json!({ "id_jabatan": id, "nama": nama, "is_aktif": draft.is_aktif });
    sync::enqueue(&transaction, &client_id, "hr-position", "save", &id, &payload, None)?;
    transaction.commit().map_err(db_error)?;
    Ok(payload)
}

/// Isian organisasi satu pegawai yang sudah diperiksa, siap ditulis.
#[derive(Debug, Default, PartialEq)]
pub struct OrganisasiValid {
    pub id_bagian: String,
    pub divisi: String,
    pub id_jabatan: String,
    pub jabatan_status: String,
    pub id_atasan: String,
}

/// Pilihan bagian/jabatan/atasan dari form Karyawan dan Guru (Q-19).
///
/// Bagian dan jabatan baru wajib master aktif; master nonaktif yang SUDAH
/// dipegang orang itu boleh tetap. `bagian_wajib`: pegawai baru dari form.
/// Tanpa `id_bagian` (form lama) teks `divisi` tetap berlaku apa adanya.
pub fn periksa_organisasi(
    transaction: &Transaction<'_>,
    id_karyawan: &str,
    draft: &Value,
    bagian_wajib: bool,
) -> Result<OrganisasiValid, CommandError> {
    let lama: (String, String) = transaction
        .query_row(
            "SELECT COALESCE(id_bagian, ''), COALESCE(id_jabatan, '') FROM master_data WHERE id_unik = ?1;",
            params![id_karyawan],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(db_error)?
        .unwrap_or_default();
    let mut hasil = OrganisasiValid {
        divisi: normalisasi_nama(&teks(draft, "divisi")),
        jabatan_status: normalisasi_nama(&teks(draft, "jabatan_status")),
        ..Default::default()
    };
    let id_bagian = teks(draft, "id_bagian");
    if id_bagian.is_empty() {
        if bagian_wajib {
            return Err(invalid("Bagian wajib dipilih."));
        }
    } else {
        let (nama, aktif): (String, i64) = transaction
            .query_row(
                "SELECT nama, is_aktif FROM hr_bagian WHERE id_bagian = ?1;",
                params![id_bagian],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()
            .map_err(db_error)?
            .ok_or_else(|| invalid("Bagian tidak ditemukan."))?;
        if aktif != 1 && id_bagian != lama.0 {
            return Err(invalid(format!("Bagian \"{nama}\" sudah nonaktif.")));
        }
        hasil.divisi = nama;
        hasil.id_bagian = id_bagian;
    }
    let id_jabatan = teks(draft, "id_jabatan");
    if !id_jabatan.is_empty() {
        let (nama, aktif): (String, i64) = transaction
            .query_row(
                "SELECT nama, is_aktif FROM hr_jabatan WHERE id_jabatan = ?1;",
                params![id_jabatan],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()
            .map_err(db_error)?
            .ok_or_else(|| invalid("Jabatan tidak ditemukan."))?;
        if aktif != 1 && id_jabatan != lama.1 {
            return Err(invalid(format!("Jabatan \"{nama}\" sudah nonaktif.")));
        }
        hasil.jabatan_status = nama;
        hasil.id_jabatan = id_jabatan;
    }
    let id_atasan = teks(draft, "id_atasan");
    if !id_atasan.is_empty() {
        if !ada(
            transaction,
            &format!("SELECT 1 FROM master_data m WHERE m.id_unik = ?1 AND {PEGAWAI_SQL};"),
            params![id_atasan],
        )? {
            return Err(invalid("Atasan harus pegawai yang terdaftar."));
        }
        let atasan: HashMap<String, String> = rows_json(
            transaction,
            "SELECT id_unik, COALESCE(id_atasan, '') AS id_atasan FROM master_data WHERE COALESCE(id_atasan, '') <> ''\n-- batas: pegawai yang punya atasan, dibatasi jumlah personil lembaga\n;",
        )?
        .iter()
        .map(|r| (teks(r, "id_unik"), teks(r, "id_atasan")))
        .collect();
        periksa_atasan(id_karyawan, &id_atasan, &atasan).map_err(invalid)?;
        hasil.id_atasan = id_atasan;
    }
    Ok(hasil)
}

/// Tulis kolom organisasi satu pegawai. Kosong disimpan `''` (bukan NULL)
/// supaya snapshot outbox membawanya sebagai "dikosongkan"; tarikan berikutnya
/// mengembalikannya menjadi NULL dari cloud.
pub fn tulis_organisasi(
    transaction: &Transaction<'_>,
    id_karyawan: &str,
    org: &OrganisasiValid,
) -> Result<(), CommandError> {
    transaction
        .execute(
            "UPDATE master_data SET id_bagian = ?2, id_jabatan = ?3, id_atasan = ?4 WHERE id_unik = ?1;",
            params![id_karyawan, org.id_bagian, org.id_jabatan, org.id_atasan],
        )
        .map_err(db_error)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    // Vektor kembar `src/lib/validations/hris.test.ts`.
    const VEKTOR: &str = include_str!("../../../src/lib/validations/hris.vektor.json");

    fn vektor() -> Value {
        serde_json::from_str(VEKTOR).expect("vektor hris")
    }

    fn peta(nilai: &Value) -> HashMap<String, String> {
        nilai
            .as_object()
            .expect("peta atasan")
            .iter()
            .map(|(k, v)| (k.clone(), v.as_str().unwrap_or("").to_owned()))
            .collect()
    }

    #[test]
    fn hris_vektor_nama() {
        for kasus in vektor()["nama"].as_array().expect("nama") {
            let masuk = kasus["masuk"].as_str().expect("masuk");
            assert_eq!(normalisasi_nama(masuk), kasus["normal"].as_str().unwrap(), "{masuk}");
            assert_eq!(kunci_nama(masuk), kasus["kunci"].as_str().unwrap(), "{masuk}");
            match kasus["galat"].as_str() {
                Some(galat) => assert_eq!(validasi_nama_master(masuk, "bagian").unwrap_err(), galat),
                None => assert_eq!(validasi_nama_master(masuk, "bagian").unwrap(), kasus["normal"].as_str().unwrap()),
            }
        }
    }

    #[test]
    fn hris_vektor_id_nama() {
        for kasus in vektor()["id_nama"].as_array().expect("id_nama") {
            assert_eq!(
                id_nama_bagian(kasus["id_bagian"].as_str().unwrap(), kasus["nama"].as_str().unwrap()),
                kasus["hasil"].as_str().unwrap()
            );
        }
    }

    #[test]
    fn hris_vektor_atasan() {
        for kasus in vektor()["atasan"].as_array().expect("atasan") {
            let hasil = periksa_atasan(
                kasus["id"].as_str().unwrap(),
                kasus["atasan_baru"].as_str().unwrap(),
                &peta(&kasus["peta"]),
            );
            assert_eq!(hasil.err().as_deref(), kasus["galat"].as_str(), "{kasus}");
        }
        for kasus in vektor()["siklus"].as_array().expect("siklus") {
            let harapan: Vec<String> = serde_json::from_value(kasus["hasil"].clone()).unwrap();
            assert_eq!(dalam_siklus_atasan(&peta(&kasus["peta"])), harapan);
        }
    }

    #[test]
    fn hris_vektor_susun_org() {
        for kasus in vektor()["susun"].as_array().expect("susun") {
            let pegawai: Vec<PegawaiOrg> = serde_json::from_value(kasus["pegawai"].clone()).unwrap();
            let bagian: Vec<MasterOrg> = serde_json::from_value(kasus["bagian"].clone()).unwrap();
            let nama: Vec<NamaLama> = serde_json::from_value(kasus["nama_lama"].clone()).unwrap();
            let jabatan: Vec<MasterOrg> = serde_json::from_value(kasus["jabatan"].clone()).unwrap();
            assert_eq!(susun_org(&pegawai, &bagian, &nama, &jabatan), kasus["hasil"]);
        }
    }

    fn hub() -> rusqlite::Connection {
        let connection = rusqlite::Connection::open_in_memory().expect("memori");
        connection
            .execute_batch(
                "CREATE TABLE master_data (id_unik TEXT PRIMARY KEY, nama TEXT, divisi TEXT NOT NULL, jabatan_status TEXT, jenis_personil TEXT, id_bagian TEXT, id_jabatan TEXT, id_atasan TEXT);
                 CREATE TABLE siswa_data (id_siswa TEXT PRIMARY KEY);
                 CREATE TABLE hr_bagian (id_bagian TEXT PRIMARY KEY, nama TEXT NOT NULL, is_aktif INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
                 CREATE TABLE hr_bagian_nama (id_nama TEXT PRIMARY KEY, id_bagian TEXT NOT NULL, nama TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
                 CREATE TABLE hr_jabatan (id_jabatan TEXT PRIMARY KEY, nama TEXT NOT NULL, is_aktif INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
                 CREATE TABLE hr_tugas_jenis (id_jenis TEXT PRIMARY KEY, nama TEXT NOT NULL, ekuivalen_jp INTEGER NOT NULL DEFAULT 0, is_aktif INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
                 CREATE TABLE hr_dokumen_jenis (id_jenis TEXT PRIMARY KEY, nama TEXT NOT NULL, is_aktif INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
                 CREATE TABLE id_card (id_unik TEXT PRIMARY KEY, divisi TEXT NOT NULL);
                 CREATE TABLE absensi_harian (id INTEGER PRIMARY KEY, id_karyawan TEXT, kelas_divisi TEXT);
                 CREATE TABLE log_scan (id INTEGER PRIMARY KEY, id_karyawan TEXT, divisi TEXT NOT NULL);
                 CREATE TABLE backup_karyawan (id INTEGER PRIMARY KEY, id_karyawan_asal TEXT, divisi_asal TEXT NOT NULL, id_karyawan_pengganti TEXT, divisi_pengganti TEXT NOT NULL);
                 CREATE TABLE koreksi_admin (id INTEGER PRIMARY KEY, id_karyawan TEXT, divisi TEXT NOT NULL);
                 CREATE TABLE payroll_components (id TEXT PRIMARY KEY, applies_to TEXT NOT NULL);
                 CREATE TABLE hari_libur_whitelist (id TEXT PRIMARY KEY, scope_type TEXT NOT NULL, scope_value TEXT NOT NULL, updated_at TEXT);
                 INSERT INTO master_data VALUES
                   ('p1', 'Ani', 'Tata Usaha', 'Staf TU', 'Pegawai', NULL, NULL, NULL),
                   ('p2', 'Budi', 'tata usaha', 'Staf TU', 'Pegawai', NULL, NULL, NULL),
                   ('p3', 'Cici', 'Tata Usaha', '-', 'Pegawai', NULL, NULL, NULL),
                   ('g1', 'Dedi', 'Tenaga Pengajar', 'Guru', 'GURU', NULL, NULL, NULL),
                   ('s1', 'Eka', 'Peserta Didik', 'Siswa', 'SISWA', NULL, NULL, NULL),
                   ('s2', 'Fani', 'Kelas 7A', 'Siswa', 'Siswa', NULL, NULL, NULL);
                 INSERT INTO siswa_data VALUES ('s1');",
            )
            .expect("hub uji");
        connection
    }

    fn jalankan(connection: &rusqlite::Connection, statements: &[(String, Vec<Value>)]) {
        for (sql, args) in statements {
            let args: Vec<rusqlite::types::Value> = args
                .iter()
                .map(|v| match v {
                    Value::String(s) => rusqlite::types::Value::Text(s.clone()),
                    Value::Number(n) => rusqlite::types::Value::Integer(n.as_i64().unwrap_or(0)),
                    _ => rusqlite::types::Value::Null,
                })
                .collect();
            connection
                .execute(sql, rusqlite::params_from_iter(args))
                .unwrap_or_else(|e| panic!("{sql}: {e}"));
        }
    }

    fn migrasi(connection: &rusqlite::Connection) {
        for sql in MIGRASI_ORGANISASI_SQL {
            connection.execute(sql, []).expect("migrasi");
        }
    }

    #[test]
    fn hris_migrasi_mengecualikan_siswa_dan_aman_diulang() {
        let connection = hub();
        migrasi(&connection);
        let bagian: Vec<(String, String)> = connection
            .prepare("SELECT id_bagian, nama FROM hr_bagian ORDER BY nama;")
            .unwrap()
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        // Id = hex teks huruf kecil, sama dengan Web; ejaan terbanyak menang.
        assert_eq!(
            bagian,
            vec![
                (format!("bag-{}", hex::encode("tata usaha")), "Tata Usaha".to_owned()),
                (format!("bag-{}", hex::encode("tenaga pengajar")), "Tenaga Pengajar".to_owned()),
            ]
        );
        let jabatan: i64 = connection
            .query_row("SELECT COUNT(*) FROM hr_jabatan;", [], |r| r.get(0))
            .unwrap();
        assert_eq!(jabatan, 2, "Staf TU + Guru; '-' dan Siswa tidak");
        let siswa: i64 = connection
            .query_row("SELECT COUNT(*) FROM master_data WHERE id_unik IN ('s1', 's2') AND id_bagian IS NOT NULL;", [], |r| r.get(0))
            .unwrap();
        assert_eq!(siswa, 0);
        let p2: String = connection
            .query_row("SELECT id_bagian FROM master_data WHERE id_unik = 'p2';", [], |r| r.get(0))
            .unwrap();
        assert_eq!(p2, bagian[0].0);
        assert_eq!(
            connection.query_row("SELECT id_nama FROM hr_bagian_nama WHERE id_bagian = ?1;", [&bagian[0].0], |r| r.get::<_, String>(0)).unwrap(),
            id_nama_bagian(&bagian[0].0, "Tata Usaha")
        );
        migrasi(&connection);
        let total: i64 = connection
            .query_row("SELECT (SELECT COUNT(*) FROM hr_bagian) + (SELECT COUNT(*) FROM hr_bagian_nama) + (SELECT COUNT(*) FROM hr_tugas_jenis) + (SELECT COUNT(*) FROM hr_dokumen_jenis);", [], |r| r.get(0))
            .unwrap();
        assert_eq!(total, 2 + 2 + 10 + 13);
    }

    #[test]
    fn hris_ganti_nama_dan_gabung_menulis_ulang_riwayat() {
        let connection = hub();
        migrasi(&connection);
        let tu = format!("bag-{}", hex::encode("tata usaha"));
        let guru = format!("bag-{}", hex::encode("tenaga pengajar"));
        connection
            .execute_batch(&format!(
                "INSERT INTO id_card VALUES ('p1', 'Tata Usaha');
                 INSERT INTO absensi_harian (id_karyawan, kelas_divisi) VALUES ('p1', 'Tata Usaha'), ('s1', 'Tata Usaha');
                 INSERT INTO log_scan (id_karyawan, divisi) VALUES ('p2', 'tata usaha');
                 INSERT INTO backup_karyawan (id_karyawan_asal, divisi_asal, id_karyawan_pengganti, divisi_pengganti) VALUES ('p1', 'Tata Usaha', 'g1', 'Tenaga Pengajar');
                 INSERT INTO koreksi_admin (id_karyawan, divisi) VALUES ('p3', 'Tata Usaha');
                 INSERT INTO payroll_components VALUES ('c1', 'DIVISI:tata usaha'), ('c2', 'DIVISI:Tenaga Pengajar'), ('c3', 'ALL');
                 INSERT INTO hari_libur_whitelist VALUES ('w1', 'DIVISI', 'Tata Usaha', NULL), ('w2', 'SHIFT', 'Tata Usaha', NULL);"
            ))
            .unwrap();
        jalankan(
            &connection,
            &cloud_bagian_statements(&json!({"id_bagian": tu, "nama": "  Tata   Usaha Sekolah ", "is_aktif": 1}), ""),
        );
        let teks1 = |sql: &str| connection.query_row(sql, [], |r| r.get::<_, String>(0)).unwrap();
        assert_eq!(teks1("SELECT divisi FROM master_data WHERE id_unik = 'p2';"), "Tata Usaha Sekolah");
        assert_eq!(teks1("SELECT divisi FROM id_card WHERE id_unik = 'p1';"), "Tata Usaha Sekolah");
        assert_eq!(teks1("SELECT kelas_divisi FROM absensi_harian WHERE id_karyawan = 'p1';"), "Tata Usaha Sekolah");
        assert_eq!(teks1("SELECT kelas_divisi FROM absensi_harian WHERE id_karyawan = 's1';"), "Tata Usaha", "siswa tersentuh");
        assert_eq!(teks1("SELECT divisi FROM log_scan;"), "Tata Usaha Sekolah");
        assert_eq!(teks1("SELECT divisi_asal FROM backup_karyawan;"), "Tata Usaha Sekolah");
        assert_eq!(teks1("SELECT divisi FROM koreksi_admin;"), "Tata Usaha Sekolah");
        assert_eq!(teks1("SELECT applies_to FROM payroll_components WHERE id = 'c1';"), "DIVISI:Tata Usaha Sekolah");
        assert_eq!(teks1("SELECT scope_value FROM hari_libur_whitelist WHERE id = 'w1';"), "Tata Usaha Sekolah");
        assert_eq!(teks1("SELECT scope_value FROM hari_libur_whitelist WHERE id = 'w2';"), "Tata Usaha");

        // Gabung TU ke Tenaga Pengajar: nama lama ikut, asal nonaktif.
        jalankan(&connection, &cloud_gabung_statements(&json!({"id_asal": tu, "id_tujuan": guru})));
        assert_eq!(teks1("SELECT divisi FROM master_data WHERE id_unik = 'p1';"), "Tenaga Pengajar");
        assert_eq!(teks1("SELECT applies_to FROM payroll_components WHERE id = 'c1';"), "DIVISI:Tenaga Pengajar");
        assert_eq!(teks1("SELECT divisi_asal FROM backup_karyawan;"), "Tenaga Pengajar");
        let aktif: i64 = connection
            .query_row("SELECT is_aktif FROM hr_bagian WHERE id_bagian = ?1;", [&tu], |r| r.get(0))
            .unwrap();
        assert_eq!(aktif, 0);
        let peta: String = connection
            .query_row(PETA_BAGIAN_SQL, ["Tata Usaha"], |r| r.get(0))
            .unwrap();
        assert_eq!(peta, guru, "nama lama dipetakan ke bagian aktif");
    }

    #[test]
    fn hris_event_lama_dipetakan_lewat_nama() {
        let connection = hub();
        migrasi(&connection);
        let tu = format!("bag-{}", hex::encode("tata usaha"));
        jalankan(&connection, &cloud_bagian_statements(&json!({"id_bagian": tu, "nama": "TU"}), ""));
        // Perangkat lama: tanpa kunci id_*, teks lama "Tata Usaha".
        connection
            .execute("UPDATE master_data SET divisi = 'tata usaha', id_bagian = NULL WHERE id_unik = 'p3';", [])
            .unwrap();
        jalankan(&connection, &cloud_organisasi_pegawai("p3", &json!({"divisi": "tata usaha"})));
        let (id, divisi, jab): (Option<String>, String, Option<String>) = connection
            .query_row("SELECT id_bagian, divisi, id_jabatan FROM master_data WHERE id_unik = 'p3';", [], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
            .unwrap();
        assert_eq!((id.as_deref(), divisi.as_str(), jab), (Some(tu.as_str()), "TU", None));
        // Perangkat baru mengosongkan atasan dan jabatan.
        connection.execute("UPDATE master_data SET id_atasan = 'p1' WHERE id_unik = 'p2';", []).unwrap();
        jalankan(&connection, &cloud_organisasi_pegawai("p2", &json!({"id_bagian": tu, "id_jabatan": "", "id_atasan": ""})));
        let (atasan, jab): (Option<String>, Option<String>) = connection
            .query_row("SELECT id_atasan, id_jabatan FROM master_data WHERE id_unik = 'p2';", [], |r| Ok((r.get(0)?, r.get(1)?)))
            .unwrap();
        assert_eq!((atasan, jab), (None, None));
        // Siswa dilewati.
        jalankan(&connection, &cloud_organisasi_pegawai("s1", &json!({"id_bagian": tu})));
        let siswa: Option<String> = connection
            .query_row("SELECT id_bagian FROM master_data WHERE id_unik = 's1';", [], |r| r.get(0))
            .unwrap();
        assert_eq!(siswa, None);
    }
}
