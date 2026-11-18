//! HRIS Fase 6 (`prd-hris/fase-6.md` §24): pengingat kepegawaian.
//!
//! Satu pemuat cloud (`muat_pengingat`) dan satu fungsi murni (`pengingat`)
//! dipakai kartu "Perlu perhatian" dan, di 6b, pengirim Telegram; yang
//! berbeda hanya penyaringnya (`saring_pengingat` atas SESI untuk kartu).
//! Separuh sumbernya KHUSUS CLOUD (`hr_profil`, `hr_dokumen`, `hr_sp`), jadi
//! pemuat selalu membaca cloud lewat `TursoClient`; tanpa koneksi command
//! mengembalikan `hris_cloud::PESAN_LURING`.
//!
//! Kembaran TS: `src/lib/validations/hr-pengingat.ts` (aturan + SQL) dan
//! `src/lib/services/hr-pengingat.ts` (pemuat). Vektor
//! `validations/hr-pengingat.vektor.json`; teks SQL diperiksa harfiah oleh
//! `hr-pengingat.test.ts`.

use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use super::hari_kerja::tanggal_valid;
use super::hr_pengajuan::{
    dalam_cakupan, jp_terdampak, JadwalJp, Jp, PengajuanJp, JADWAL_JP_SQL, JP_TERDAMPAK_SQL, LIBUR_SQL,
    PENANGANAN_SQL, UNIT_PERSONIL_SQL,
};
use super::hris::{angka_pengaturan, ATURAN_KGB, ATURAN_PENSIUN, HARI_INI_SQL, KUNCI_KGB_TAHUN, KUNCI_PENSIUN_USIA, PENGATURAN_KONTRAK_SQL};
use super::models::{CommandError, OperatorUser};
use super::time_policy::{add_days, days_between};
use super::turso::TursoClient;

/// Urutan kejadian di kartu dan Telegram (§24.2.2).
pub const KEJADIAN_PENGINGAT: [&str; 9] = [
    "kontrak_berakhir",
    "percobaan_berakhir",
    "kgb",
    "pensiun",
    "dokumen_kedaluwarsa",
    "sp_berakhir",
    "pengajuan_menunggu",
    "jp_tanpa_penanganan",
    "sk_pembagian_tugas",
];

/// Gabungan izin kartu; `require_any_permission` atas daftar ini.
pub const IZIN_PENGINGAT: [&str; 8] = [
    "hr.contract.manage",
    "hr.personal.view",
    "hr.document.view",
    "hr.warning.view",
    "hr.request.decide",
    "hr.request.decide_major",
    "hr.substitute.manage",
    "hr.duty.manage",
];

/// Status kontrak yang diingatkan berakhir (Q-115) dan status KGB (Q-117).
pub const STATUS_KONTRAK_BERAKHIR: [&str; 2] = ["GTT", "PTT"];
pub const STATUS_KGB: [&str; 2] = ["GTY", "PTY"];
/// Kartu menampilkan kontrak yang lewat tanpa perpanjangan sampai 30 hari
/// (Q-114) dan SK pembagian tugas sampai H+14 (Q-123).
pub const KONTRAK_LEWAT_HARI: i64 = 30;
pub const SK_LEWAT_HARI: i64 = 14;

// SQL, dieja harfiah sama di `validations/hr-pengingat.ts`. ?1 = hari ini WIB
// dari `HARI_INI_SQL` di cloud.

/// Pegawai aktif yang tidak keluar, status kini (predikat `STATUS_KINI_SQL`),
/// dan tanggal lahir (`hr_profil`, khusus cloud).
pub const PENGINGAT_PEGAWAI_SQL: &str = "SELECT m.id_unik AS id_karyawan, m.nama, COALESCE(m.jabatan_status, '') AS jabatan, COALESCE(m.unit, '') AS unit, COALESCE(m.tanggal_mulai_aktif, '') AS tmt, COALESCE((SELECT k.status FROM hr_kontrak k WHERE k.id_karyawan = m.id_unik AND k.status <> 'Pembatalan' AND k.tanggal_mulai <= ?1 AND NOT EXISTS (SELECT 1 FROM hr_kontrak b WHERE b.status = 'Pembatalan' AND b.id_ref = k.id_kontrak) ORDER BY k.tanggal_mulai DESC, k.id_kontrak DESC LIMIT 1), g.status_kepegawaian, '') AS status, COALESCE(pr.tanggal_lahir, '') AS tanggal_lahir FROM master_data m LEFT JOIN guru_data g ON g.id_guru = m.id_unik LEFT JOIN hr_profil pr ON pr.id_karyawan = m.id_unik WHERE COALESCE(m.status_aktif, 'Aktif') = 'Aktif' AND COALESCE(m.id_keluar, '') = '' AND LOWER(TRIM(COALESCE(m.jenis_personil, ''))) <> 'siswa' AND NOT EXISTS (SELECT 1 FROM siswa_data sd WHERE sd.id_siswa = m.id_unik) ORDER BY m.nama, m.id_unik\n-- batas: pegawai aktif sekolah, dibatasi jumlah personil lembaga\n;";
/// Kontrak sah terakhir per pegawai aktif, urutan dan predikat
/// `CERMIN_STATUS_SQL` (tanpa saringan tanggal: perpanjangan yang sudah
/// dicatat menutup pengingat kontrak lama).
pub const PENGINGAT_KONTRAK_SQL: &str = "SELECT x.id_kontrak, x.id_karyawan, x.status, COALESCE(x.tanggal_selesai, '') AS tanggal_selesai, COALESCE(x.percobaan_selesai, '') AS percobaan_selesai FROM master_data m JOIN hr_kontrak x ON x.id_kontrak = (SELECT k.id_kontrak FROM hr_kontrak k WHERE k.id_karyawan = m.id_unik AND k.status <> 'Pembatalan' AND NOT EXISTS (SELECT 1 FROM hr_kontrak b WHERE b.status = 'Pembatalan' AND b.id_ref = k.id_kontrak) ORDER BY k.tanggal_mulai DESC, k.id_kontrak DESC LIMIT 1) WHERE COALESCE(m.status_aktif, 'Aktif') = 'Aktif' AND COALESCE(m.id_keluar, '') = '' ORDER BY m.id_unik\n-- batas: satu kontrak terakhir per pegawai aktif\n;";
/// Dokumen terbaru per (pegawai, jenis) yang kedaluwarsa dalam 30 hari atau
/// sudah lewat; dokumen pengganti bertanggal lebih akhir menutupnya.
pub const PENGINGAT_DOKUMEN_SQL: &str = "SELECT d.id_dokumen, d.id_karyawan, COALESCE(j.nama, d.id_jenis) AS nama_jenis, d.tanggal_kedaluwarsa FROM hr_dokumen d LEFT JOIN hr_dokumen_jenis j ON j.id_jenis = d.id_jenis WHERE COALESCE(d.tanggal_kedaluwarsa, '') <> '' AND d.tanggal_kedaluwarsa <= date(?1, '+30 days') AND NOT EXISTS (SELECT 1 FROM hr_dokumen n WHERE n.id_karyawan = d.id_karyawan AND n.id_jenis = d.id_jenis AND n.id_dokumen <> d.id_dokumen AND COALESCE(n.tanggal_kedaluwarsa, '') <> '' AND (n.tanggal_kedaluwarsa > d.tanggal_kedaluwarsa OR (n.tanggal_kedaluwarsa = d.tanggal_kedaluwarsa AND n.id_dokumen > d.id_dokumen))) ORDER BY d.tanggal_kedaluwarsa, d.id_dokumen\n-- batas: dokumen terbaru per pegawai dan jenis yang kedaluwarsa dalam 30 hari atau belum diganti\n;";
/// SP tidak dicabut yang hari terakhirnya kemarin: hari ini hari pertama
/// `Berakhir` menurut `status_sp` (Q-121).
pub const PENGINGAT_SP_SQL: &str = "SELECT s.id_sp, s.id_karyawan, s.berlaku_sampai FROM hr_sp s WHERE s.dicabut_pada IS NULL AND s.berlaku_sampai = date(?1, '-1 day') ORDER BY s.id_karyawan, s.id_sp\n-- batas: SP yang berakhir hari ini, beberapa per tahun\n;";
/// Pengajuan Menunggu (tanpa `Batal`, tanpa keputusan final bersidik kini;
/// potongan harfiah `PENGAJUAN_AKTIF_ORANG_SQL`) yang tersunting terakhir
/// lebih dari dua hari lalu (Q-122).
pub const PENGINGAT_PENGAJUAN_SQL: &str = "SELECT p.id_pengajuan, p.id_karyawan, p.izin_pemutus, date(p.updated_at, '+7 hours') AS tanggal FROM hr_pengajuan p WHERE datetime(p.updated_at) < datetime('now', '-2 days') AND NOT EXISTS (SELECT 1 FROM hr_pengajuan_keputusan b WHERE b.id_pengajuan = p.id_pengajuan AND b.jenis = 'Batal') AND COALESCE((SELECT k.jenis FROM hr_pengajuan_keputusan k WHERE k.id_pengajuan = p.id_pengajuan AND k.sidik = p.sidik AND k.jenis IN ('Setujui', 'Tolak', 'Setujui Urgent') ORDER BY k.diterima_cloud IS NULL, k.diterima_cloud, k.waktu_perangkat, k.id_keputusan LIMIT 1), '') = '' ORDER BY p.updated_at, p.id_pengajuan\n-- batas: pengajuan yang belum diputus lebih dari dua hari, dibatasi jumlah pegawai\n;";
/// Semester yang mulai dalam `[?1 - 14, ?1 + 7]` beserta unit rombel aktifnya.
pub const PENGINGAT_SEMESTER_SQL: &str = "SELECT t.id_tahun_ajaran, t.nama_tahun, t.semester, t.tanggal_mulai, COALESCE(u.nama_unit, '') AS unit FROM akademik_tahun_ajaran t LEFT JOIN akademik_rombel r ON r.id_tahun_ajaran = t.id_tahun_ajaran AND r.is_aktif = 1 LEFT JOIN akademik_unit u ON u.id_unit = r.id_unit WHERE t.tanggal_mulai >= date(?1, '-14 days') AND t.tanggal_mulai <= date(?1, '+7 days') GROUP BY t.id_tahun_ajaran, t.nama_tahun, t.semester, t.tanggal_mulai, COALESCE(u.nama_unit, '') ORDER BY t.tanggal_mulai, t.id_tahun_ajaran, unit\n-- batas: semester yang mulai dalam tiga minggu, sebesar jumlah unit\n;";

// Aturan murni (cermin TS)

fn kabisat(tahun: i64) -> bool {
    (tahun % 4 == 0 && tahun % 100 != 0) || tahun % 400 == 0
}

/// Cermin `tambahTahun`: 29 Februari ke tahun bukan kabisat menjadi
/// 28 Februari (bukan 1 Maret seperti `date(..., '+N years')` SQLite).
pub fn tambah_tahun(tanggal: &str, tahun: i64) -> Option<String> {
    if !tanggal_valid(tanggal) {
        return None;
    }
    let (y, bulan_hari) = tanggal.split_once('-')?;
    let baru = y.parse::<i64>().ok()? + tahun;
    if !(1..=9999).contains(&baru) {
        return None;
    }
    let bulan_hari = if bulan_hari == "02-29" && !kabisat(baru) { "02-28" } else { bulan_hari };
    Some(format!("{baru:04}-{bulan_hari}"))
}

/// Cermin `sisaHari`: `tanggal - hari_ini` dalam hari; tanggal rusak = `None`.
pub fn sisa_hari(tanggal: &str, hari_ini: &str) -> Option<i64> {
    if !tanggal_valid(tanggal) {
        return None;
    }
    days_between(hari_ini, tanggal).ok()
}

/// Cermin `jendela`: batas terkecil (menaik) yang memuat `sisa`, mulai 0.
/// `[7, 30]`: 0..=7 → 7, 8..=30 → 30, lainnya `None`. Jendela bertingkat
/// tidak bertumpuk; setiap jendela dicatat sekali lewat id-nya.
pub fn jendela(sisa: i64, batas: &[i64]) -> Option<i64> {
    if sisa < 0 {
        return None;
    }
    batas.iter().copied().find(|b| sisa <= *b)
}

/// Cermin `tanggalKgb`: TMT + k × N tahun, k terkecil ≥ 1 yang ≥ hari ini.
pub fn tanggal_kgb(tmt: &str, siklus: i64, hari_ini: &str) -> Option<String> {
    if siklus < 1 || !tanggal_valid(tmt) {
        return None;
    }
    (1..=100)
        .map_while(|k| tambah_tahun(tmt, k * siklus))
        .find(|t| t.as_str() >= hari_ini)
}

/// Cermin `tanggalPensiun`: tanggal lahir + usia pensiun.
pub fn tanggal_pensiun(lahir: &str, usia: i64) -> Option<String> {
    tambah_tahun(lahir, usia)
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct PegawaiPengingat {
    pub id_karyawan: String,
    pub nama: String,
    pub jabatan: String,
    pub unit: String,
    pub tmt: String,
    pub status: String,
    pub tanggal_lahir: String,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct KontrakPengingat {
    pub id_kontrak: String,
    pub id_karyawan: String,
    pub status: String,
    pub tanggal_selesai: String,
    pub percobaan_selesai: String,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct DokumenPengingat {
    pub id_dokumen: String,
    pub id_karyawan: String,
    pub nama_jenis: String,
    pub tanggal_kedaluwarsa: String,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct SpPengingat {
    pub id_sp: String,
    pub id_karyawan: String,
    pub berlaku_sampai: String,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct PengajuanPengingat {
    pub id_karyawan: String,
    pub izin_pemutus: String,
    pub tanggal: String,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct SemesterPengingat {
    pub id_tahun_ajaran: String,
    pub nama_tahun: String,
    pub semester: String,
    pub tanggal_mulai: String,
    pub unit: String,
}

/// Bahan mentah dari cloud; `jp` = JP terdampak hari ini, `ditangani` = id
/// penanganan yang tercatat.
#[derive(Debug, Clone, Default, Deserialize)]
pub struct DataPengingat {
    pub pegawai: Vec<PegawaiPengingat>,
    pub kontrak: Vec<KontrakPengingat>,
    pub dokumen: Vec<DokumenPengingat>,
    pub sp: Vec<SpPengingat>,
    pub pengajuan: Vec<PengajuanPengingat>,
    pub semester: Vec<SemesterPengingat>,
    pub jp: Vec<Jp>,
    pub ditangani: Vec<String>,
}

#[derive(Debug, Clone, Copy, Deserialize)]
pub struct PengaturanPengingat {
    pub kgb_tahun: i64,
    pub pensiun_usia: i64,
}

/// `kunci` = id deterministik Telegram (§24.2.2); `""` = hanya untuk kartu
/// (di luar jendela kirim). `izin` = izin pemutus pengajuan, lainnya `""`.
#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
pub struct ItemPengingat {
    pub kejadian: String,
    pub id_karyawan: String,
    pub nama: String,
    pub jabatan: String,
    pub unit: String,
    pub tanggal: String,
    pub sisa: i64,
    pub kunci: String,
    pub keterangan: String,
    pub izin: String,
}

fn item(kejadian: &str, p: Option<&PegawaiPengingat>, tanggal: &str, sisa: i64, kunci: String) -> ItemPengingat {
    ItemPengingat {
        kejadian: kejadian.to_owned(),
        id_karyawan: p.map(|p| p.id_karyawan.clone()).unwrap_or_default(),
        nama: p.map(|p| p.nama.clone()).unwrap_or_default(),
        jabatan: p.map(|p| p.jabatan.clone()).unwrap_or_default(),
        unit: p.map(|p| p.unit.clone()).unwrap_or_default(),
        tanggal: tanggal.to_owned(),
        sisa,
        kunci,
        keterangan: String::new(),
        izin: String::new(),
    }
}

/// Cermin `pengingat`: semua item pada `hari_ini`, urut per kejadian lalu
/// tanggal (stabil terhadap urutan SQL). Pegawai yang tidak ada di daftar
/// pegawai aktif (keluar, nonaktif, siswa) tidak pernah diingatkan.
pub fn pengingat(data: &DataPengingat, hari_ini: &str, aturan: PengaturanPengingat) -> Vec<ItemPengingat> {
    let pegawai: HashMap<&str, &PegawaiPengingat> =
        data.pegawai.iter().map(|p| (p.id_karyawan.as_str(), p)).collect();
    let sisa = |t: &str| sisa_hari(t, hari_ini);
    let mut hasil: Vec<ItemPengingat> = Vec::new();

    for k in &data.kontrak {
        let Some(p) = pegawai.get(k.id_karyawan.as_str()) else { continue };
        if STATUS_KONTRAK_BERAKHIR.contains(&k.status.as_str()) {
            if let Some(s) = sisa(&k.tanggal_selesai).filter(|s| (-KONTRAK_LEWAT_HARI..=30).contains(s)) {
                let kunci = jendela(s, &[7, 30]).map_or(String::new(), |j| format!("ktr-{j}:{}", k.id_kontrak));
                hasil.push(item("kontrak_berakhir", Some(p), &k.tanggal_selesai, s, kunci));
            }
        }
        if let Some(s) = sisa(&k.percobaan_selesai).filter(|s| jendela(*s, &[7]).is_some()) {
            hasil.push(item("percobaan_berakhir", Some(p), &k.percobaan_selesai, s, format!("coba:{}", k.id_kontrak)));
        }
    }
    for p in &data.pegawai {
        if STATUS_KGB.contains(&p.status.as_str()) {
            if let Some(t) = tanggal_kgb(&p.tmt, aturan.kgb_tahun, hari_ini) {
                if let Some(s) = sisa(&t).filter(|s| jendela(*s, &[30]).is_some()) {
                    let kunci = format!("kgb:{}:{t}", p.id_karyawan);
                    hasil.push(item("kgb", Some(p), &t, s, kunci));
                }
            }
        }
    }
    for p in &data.pegawai {
        if let Some(t) = tanggal_pensiun(&p.tanggal_lahir, aturan.pensiun_usia) {
            if let Some(s) = sisa(&t).filter(|s| jendela(*s, &[90]).is_some()) {
                let kunci = format!("pensiun:{}:{t}", p.id_karyawan);
                hasil.push(item("pensiun", Some(p), &t, s, kunci));
            }
        }
    }
    for d in &data.dokumen {
        let Some(p) = pegawai.get(d.id_karyawan.as_str()) else { continue };
        let Some(s) = sisa(&d.tanggal_kedaluwarsa).filter(|s| *s <= 30) else { continue };
        let kunci = jendela(s, &[30]).map_or(String::new(), |_| format!("dok:{}:{}", d.id_dokumen, d.tanggal_kedaluwarsa));
        let mut i = item("dokumen_kedaluwarsa", Some(p), &d.tanggal_kedaluwarsa, s, kunci);
        i.keterangan = d.nama_jenis.clone();
        hasil.push(i);
    }
    for sp in &data.sp {
        let Some(p) = pegawai.get(sp.id_karyawan.as_str()) else { continue };
        if !tanggal_valid(&sp.berlaku_sampai) {
            continue;
        }
        let Ok(t) = add_days(&sp.berlaku_sampai, 1) else { continue };
        if sisa(&t) == Some(0) {
            hasil.push(item("sp_berakhir", Some(p), &t, 0, format!("sp-akhir:{}", sp.id_sp)));
        }
    }
    for a in &data.pengajuan {
        let Some(p) = pegawai.get(a.id_karyawan.as_str()) else { continue };
        let Some(s) = sisa(&a.tanggal) else { continue };
        let mut i = item("pengajuan_menunggu", Some(p), &a.tanggal, s, format!("pgj-tunggu:{hari_ini}"));
        i.izin = a.izin_pemutus.clone();
        hasil.push(i);
    }
    let ditangani: HashSet<&str> = data.ditangani.iter().map(String::as_str).collect();
    for j in data.jp.iter().filter(|j| j.tanggal == hari_ini && !ditangani.contains(j.id_penanganan.as_str())) {
        let Some(p) = pegawai.get(j.id_karyawan.as_str()) else { continue };
        let mut i = item("jp_tanpa_penanganan", Some(p), hari_ini, 0, format!("jp-kosong:{hari_ini}"));
        i.unit = j.unit.clone();
        i.keterangan = format!("{} jam ke-{}", j.nama_rombel, j.jam_ke);
        hasil.push(i);
    }
    for t in &data.semester {
        let Some(s) = sisa(&t.tanggal_mulai).filter(|s| (-SK_LEWAT_HARI..=7).contains(s)) else { continue };
        let kunci = jendela(s, &[7]).map_or(String::new(), |_| format!("sk-tugas:{}", t.id_tahun_ajaran));
        let mut i = item("sk_pembagian_tugas", None, &t.tanggal_mulai, s, kunci);
        i.unit = t.unit.clone();
        i.keterangan = format!("{} {}", t.semester, t.nama_tahun);
        hasil.push(i);
    }

    let urutan = |k: &str| KEJADIAN_PENGINGAT.iter().position(|x| *x == k).unwrap_or(usize::MAX);
    hasil.sort_by(|a, b| (urutan(&a.kejadian), a.tanggal.as_str()).cmp(&(urutan(&b.kejadian), b.tanggal.as_str())));
    hasil
}

/// Sesi penilai kartu, selalu dari SESI di backend.
#[derive(Debug, Clone, Default, Deserialize)]
pub struct SesiPengingat {
    pub id_karyawan: String,
    pub unit: String,
    pub lingkup_semua: bool,
    pub superadmin: bool,
    pub izin: Vec<String>,
}

/// Izin kartu per kejadian (§24.2.2); pengajuan memakai izin pemutus item.
pub fn izin_kejadian(kejadian: &str) -> &'static str {
    match kejadian {
        "kontrak_berakhir" | "percobaan_berakhir" | "kgb" => "hr.contract.manage",
        "pensiun" => "hr.personal.view",
        "dokumen_kedaluwarsa" => "hr.document.view",
        "sp_berakhir" => "hr.warning.view",
        "jp_tanpa_penanganan" => "hr.substitute.manage",
        "sk_pembagian_tugas" => "hr.duty.manage",
        _ => "",
    }
}

/// Cermin `saringPengingat`: izin HR per kejadian; pengajuan hanya yang boleh
/// diputus sesi (izin pemutus, cakupan unit, bukan diri sendiri), JP hanya
/// unit rombel dalam cakupan dan bukan JP sendiri (§15.2, §24.4).
pub fn saring_pengingat(sesi: &SesiPengingat, items: Vec<ItemPengingat>) -> Vec<ItemPengingat> {
    let punya = |izin: &str| !izin.is_empty() && (sesi.superadmin || sesi.izin.iter().any(|i| i == izin));
    let sendiri = |id: &str| !sesi.id_karyawan.is_empty() && sesi.id_karyawan == id;
    items
        .into_iter()
        .filter(|i| match i.kejadian.as_str() {
            "pengajuan_menunggu" | "jp_tanpa_penanganan" => {
                let izin = if i.kejadian == "pengajuan_menunggu" { i.izin.as_str() } else { izin_kejadian(&i.kejadian) };
                punya(izin) && !sendiri(&i.id_karyawan) && dalam_cakupan(sesi.lingkup_semua, &sesi.unit, &i.unit)
            }
            kejadian => punya(izin_kejadian(kejadian)),
        })
        .collect()
}

// Pemuat cloud

fn teks(baris: &Value, kunci: &str) -> String {
    match baris.get(kunci) {
        Some(Value::String(s)) => s.clone(),
        Some(Value::Number(n)) => n.to_string(),
        _ => String::new(),
    }
}

fn angka_opsional(baris: &Value, kunci: &str) -> Option<i64> {
    match baris.get(kunci) {
        Some(Value::Number(n)) => n.as_i64(),
        Some(Value::String(s)) => s.parse().ok(),
        _ => None,
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

/// Kolom teks baris ke struct (`Deserialize` atas teks semua).
fn dari_teks<T: serde::de::DeserializeOwned>(rows: &[Value], kolom: &[&str]) -> Vec<T> {
    rows.iter()
        .filter_map(|r| {
            let objek: serde_json::Map<String, Value> =
                kolom.iter().map(|k| ((*k).to_owned(), Value::String(teks(r, k)))).collect();
            serde_json::from_value(Value::Object(objek)).ok()
        })
        .collect()
}

/// JP terdampak hari ini dan id penanganannya, dari cloud dengan SQL yang
/// sama dengan `jp_terdampak_baca` (yang membaca SQLite perangkat).
async fn muat_jp_hari_ini(client: &TursoClient, hari_ini: &str) -> Result<(Vec<Jp>, Vec<String>), CommandError> {
    let pengajuan: Vec<PengajuanJp> = baris(client, JP_TERDAMPAK_SQL, vec![json!(hari_ini), json!(hari_ini), json!("")])
        .await?
        .iter()
        .map(|r| PengajuanJp {
            id_pengajuan: teks(r, "id_pengajuan"),
            id_karyawan: teks(r, "id_karyawan"),
            nama_guru: teks(r, "nama_guru"),
            tanggal_mulai: teks(r, "tanggal_mulai"),
            tanggal_selesai: teks(r, "tanggal_selesai"),
            jam_mulai_ke: angka_opsional(r, "jam_mulai_ke"),
            jam_sampai_ke: angka_opsional(r, "jam_sampai_ke"),
        })
        .collect();
    if pengajuan.is_empty() {
        return Ok((Vec::new(), Vec::new()));
    }
    let rentang = vec![json!(hari_ini), json!(hari_ini)];
    let jadwal: Vec<JadwalJp> = baris(client, JADWAL_JP_SQL, rentang.clone())
        .await?
        .iter()
        .map(|r| JadwalJp {
            id_jadwal: teks(r, "id_jadwal"),
            id_guru: teks(r, "id_guru"),
            hari: angka_opsional(r, "hari").unwrap_or(0),
            jam_ke: teks(r, "jam_ke"),
            id_rombel: teks(r, "id_rombel"),
            nama_rombel: teks(r, "nama_rombel"),
            id_mapel: teks(r, "id_mapel"),
            nama_mapel: teks(r, "nama_mapel"),
            unit: teks(r, "unit"),
            ta_mulai: teks(r, "ta_mulai"),
            ta_selesai: teks(r, "ta_selesai"),
        })
        .collect();
    let libur: HashSet<String> = baris(client, LIBUR_SQL, rentang.clone()).await?.iter().map(|r| teks(r, "tanggal")).collect();
    let ditangani = baris(client, PENANGANAN_SQL, rentang).await?.iter().map(|r| teks(r, "id_penanganan")).collect();
    Ok((jp_terdampak(&pengajuan, &jadwal, &libur, hari_ini, hari_ini), ditangani))
}

/// Cermin `muatPengingat`: satu sumber untuk kartu dan Telegram.
pub async fn muat_pengingat(client: &TursoClient) -> Result<(String, Vec<ItemPengingat>), CommandError> {
    client.ensure_schema_current().await?;
    let hari_ini = baris(client, HARI_INI_SQL, vec![])
        .await?
        .first()
        .map(|b| teks(b, "hari_ini"))
        .filter(|t| tanggal_valid(t))
        .ok_or_else(CommandError::internal)?;
    let h = || vec![json!(hari_ini)];
    let setelan: HashMap<String, String> =
        baris(client, PENGATURAN_KONTRAK_SQL, vec![]).await?.iter().map(|r| (teks(r, "key"), teks(r, "value"))).collect();
    let aturan = PengaturanPengingat {
        kgb_tahun: angka_pengaturan(setelan.get(KUNCI_KGB_TAHUN).map(String::as_str), ATURAN_KGB),
        pensiun_usia: angka_pengaturan(setelan.get(KUNCI_PENSIUN_USIA).map(String::as_str), ATURAN_PENSIUN),
    };
    let (jp, ditangani) = muat_jp_hari_ini(client, &hari_ini).await?;
    let data = DataPengingat {
        pegawai: dari_teks(
            &baris(client, PENGINGAT_PEGAWAI_SQL, h()).await?,
            &["id_karyawan", "nama", "jabatan", "unit", "tmt", "status", "tanggal_lahir"],
        ),
        kontrak: dari_teks(
            &baris(client, PENGINGAT_KONTRAK_SQL, vec![]).await?,
            &["id_kontrak", "id_karyawan", "status", "tanggal_selesai", "percobaan_selesai"],
        ),
        dokumen: dari_teks(
            &baris(client, PENGINGAT_DOKUMEN_SQL, h()).await?,
            &["id_dokumen", "id_karyawan", "nama_jenis", "tanggal_kedaluwarsa"],
        ),
        sp: dari_teks(&baris(client, PENGINGAT_SP_SQL, h()).await?, &["id_sp", "id_karyawan", "berlaku_sampai"]),
        pengajuan: dari_teks(
            &baris(client, PENGINGAT_PENGAJUAN_SQL, vec![]).await?,
            &["id_karyawan", "izin_pemutus", "tanggal"],
        ),
        semester: dari_teks(
            &baris(client, PENGINGAT_SEMESTER_SQL, h()).await?,
            &["id_tahun_ajaran", "nama_tahun", "semester", "tanggal_mulai", "unit"],
        ),
        jp,
        ditangani,
    };
    let items = pengingat(&data, &hari_ini, aturan);
    Ok((hari_ini, items))
}

/// `desktop_hr_attention`: item kartu "Perlu perhatian" yang boleh dilihat
/// sesi. Unit akun dibaca dari cloud (`UNIT_PERSONIL_SQL`).
pub async fn perlu_perhatian(client: &TursoClient, operator: &OperatorUser) -> Result<Value, CommandError> {
    let (hari_ini, items) = muat_pengingat(client).await?;
    let id = operator.id_karyawan.as_deref().unwrap_or("").trim().to_owned();
    let unit = if id.is_empty() {
        String::new()
    } else {
        baris(client, UNIT_PERSONIL_SQL, vec![json!(id)]).await?.first().map(|b| teks(b, "unit")).unwrap_or_default()
    };
    let sesi = SesiPengingat {
        lingkup_semua: operator.is_superadmin || operator.permissions.iter().any(|p| p == "hr.scope.all"),
        superadmin: operator.is_superadmin,
        izin: operator.permissions.clone(),
        id_karyawan: id,
        unit,
    };
    Ok(json!({ "hari_ini": hari_ini, "items": saring_pengingat(&sesi, items) }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vektor() -> Value {
        serde_json::from_str(include_str!("../../../src/lib/validations/hr-pengingat.vektor.json")).expect("vektor")
    }

    #[test]
    fn hr_pengingat_vektor_tanggal() {
        let v = vektor();
        for k in v["tambah_tahun"].as_array().expect("tambah_tahun") {
            assert_eq!(tambah_tahun(k[0].as_str().unwrap(), k[1].as_i64().unwrap()).as_deref(), k[2].as_str(), "{k}");
        }
        for k in v["sisa_hari"].as_array().expect("sisa_hari") {
            assert_eq!(sisa_hari(k[0].as_str().unwrap(), k[1].as_str().unwrap()), k[2].as_i64(), "{k}");
        }
        for k in v["jendela"].as_array().expect("jendela") {
            let batas: Vec<i64> = serde_json::from_value(k[1].clone()).unwrap();
            assert_eq!(jendela(k[0].as_i64().unwrap(), &batas), k[2].as_i64(), "{k}");
        }
        for k in v["tanggal_kgb"].as_array().expect("tanggal_kgb") {
            let hasil = tanggal_kgb(k[0].as_str().unwrap(), k[1].as_i64().unwrap(), k[2].as_str().unwrap());
            assert_eq!(hasil.as_deref(), k[3].as_str(), "{k}");
        }
        for k in v["tanggal_pensiun"].as_array().expect("tanggal_pensiun") {
            assert_eq!(tanggal_pensiun(k[0].as_str().unwrap(), k[1].as_i64().unwrap()).as_deref(), k[2].as_str(), "{k}");
        }
    }

    #[test]
    fn hr_pengingat_vektor_pengingat_dan_saring() {
        let v = vektor();
        for k in v["pengingat"].as_array().expect("pengingat") {
            let data: DataPengingat = serde_json::from_value(k["data"].clone()).expect("data");
            let aturan: PengaturanPengingat = serde_json::from_value(k["aturan"].clone()).expect("aturan");
            let hasil = pengingat(&data, k["hari_ini"].as_str().unwrap(), aturan);
            assert_eq!(json!(hasil), k["hasil"], "{}", k["nama"]);
        }
        for k in v["saring"].as_array().expect("saring") {
            let sesi: SesiPengingat = serde_json::from_value(k["sesi"].clone()).expect("sesi");
            let items: Vec<ItemPengingat> = serde_json::from_value(v["saring_items"].clone()).expect("items");
            let hasil: Vec<String> = saring_pengingat(&sesi, items).into_iter().map(|i| i.kunci).collect();
            assert_eq!(json!(hasil), k["kunci"], "{}", k["nama"]);
        }
    }

    fn ringkas(items: &[ItemPengingat]) -> Value {
        json!(items
            .iter()
            .map(|i| json!([i.kejadian, i.id_karyawan, i.sisa, i.kunci.split(':').next().unwrap_or("")]))
            .collect::<Vec<_>>())
    }

    /// Pemuat di cloud (`local_file` di atas `ensure_schema`) dengan data
    /// `muat` di vektor, sama dengan `services/hr-pengingat.test.ts`:
    /// perpanjangan dan pembatalan kontrak, dokumen pengganti, SP dicabut,
    /// pengajuan ditolak/dibatalkan, pegawai keluar, siswa, JP yang sudah
    /// ditangani, dan penyaring kepala unit.
    #[test]
    fn hr_pengingat_muat_cloud() {
        let runtime = tokio::runtime::Builder::new_current_thread().build().expect("runtime uji");
        runtime.block_on(async {
            let dir = tempfile::tempdir().expect("direktori sementara");
            let hub = dir.path().join("sppg-hub.db");
            let client = TursoClient::local_file(
                url::Url::parse("https://hr-pengingat.sppg.invalid").expect("origin uji"),
                &hub,
                reqwest::Client::new(),
            );
            client.ensure_schema().await.expect("provisioning lokal");
            let c = rusqlite::Connection::open(&hub).expect("buka hub");
            let hari_ini: String = c.query_row(HARI_INI_SQL, [], |r| r.get(0)).expect("hari ini");
            let v = vektor();
            for sql in v["muat"]["sql"].as_array().expect("sql") {
                let sql = sql.as_str().unwrap();
                if sql.contains("?1") {
                    c.execute(sql, [&hari_ini]).expect(sql);
                } else {
                    c.execute(sql, []).expect(sql);
                }
            }
            let (hari, items) = muat_pengingat(&client).await.expect("muat");
            assert_eq!(hari, hari_ini);
            assert_eq!(ringkas(&items), v["muat"]["hasil"]);

            let izin: Vec<String> = serde_json::from_value(v["muat"]["kepala_smp"]["izin"].clone()).unwrap();
            let kepala = OperatorUser {
                id: 1,
                kode_operator: "KS".into(),
                nama_operator: "Kepala SMP".into(),
                username: "kepala".into(),
                role: "Uji".into(),
                role_id: 9,
                role_key: "uji".into(),
                is_superadmin: false,
                permissions: izin,
                permission_revision: 1,
                require_scan_photo: false,
                totp_enabled: false,
                require_scan_ip_allowlist: false,
                id_karyawan: Some("KS".into()),
                login_at: None,
            };
            let kartu = perlu_perhatian(&client, &kepala).await.expect("kartu");
            let items: Vec<ItemPengingat> = serde_json::from_value(kartu["items"].clone()).unwrap();
            assert_eq!(ringkas(&items), v["muat"]["kepala_smp"]["hasil"]);
        });
    }
}
