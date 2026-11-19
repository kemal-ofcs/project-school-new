//! HRIS Fase 8b (`prd-hris/fase-8.md` §26.2.2): rekap PPh 21 bulanan, BPJS
//! bulanan, dan A1 tahunan.
//!
//! Angka laporan = angka yang dibekukan slip: bruto dan rincian dari
//! `breakdown_snapshot`, PPh dari `payroll_items.pph21_amount`. Tidak ada yang
//! dihitung ulang; slip pra-v67 tanpa `pajak` hanya ditandai `slip_lama`.
//! Masa = bulan `period_start`, hanya run `PAID` (Q-156). Run dan slip dibaca
//! dari cloud lewat `TursoClient`, supaya Web dan Desktop memakai kueri yang
//! sama. Data pemotong di `app_lapor_setting` (KHUSUS CLOUD, Q-155). Tanpa
//! status "sudah dilapor": portal DJP/BPJS sumber kebenarannya.
//!
//! Kembaran TS: `src/lib/validations/lapor-pajak.ts` (aturan + SQL) dan
//! `src/lib/services/lapor-pajak.ts` (I/O). Vektornya
//! `validations/lapor-pajak.vektor.json`; teks SQL, pesan, dan tanda
//! dibandingkan harfiah oleh `lapor-pajak.test.ts`.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use super::hr_rekrutmen::{baris, galat, teks};
use super::inventory::payload_text;
use super::models::CommandError;
use super::transfer::{objek_ketat, rapikan};
use super::turso::{Statement, TursoClient};

/// Laporan membuka NIK, NPWP, dan gaji semua pegawai: wajib KEDUANYA (§26.4).
pub const IZIN_LAPOR: [&str; 2] = ["payroll.export", "hr.finance.view"];
/// Data pemotong: khusus Superadmin lewat `SUPERADMIN_ONLY_PERMISSIONS`.
pub const IZIN_PEMOTONG: &str = "payroll.config.manage";
/// Hanya run yang sudah dibayar yang sudah dipotong (Q-156).
pub const STATUS_RUN_LAPOR: &str = "PAID";
/// Run yang dibuang tidak diperingatkan sebagai "belum dibayar".
pub const STATUS_RUN_DITOLAK: &str = "REJECTED";
/// Ejaan `payroll::pajak` (modul itu tidak ikut tersalin ke Mobile dengan
/// jalur yang sama); kesamaannya diperiksa `lapor-pajak.test.ts`.
pub const STATUS_TIDAK_TETAP: &str = "tidak_tetap";
pub const METODE_PASAL_17_TERAKHIR: &str = "PASAL_17_TERAKHIR";

/// Urutan kanonik tanda rekap PPh 21: tanda laporan, lalu `pajak::TANDA_PAJAK`
/// yang dibawa slip. Tanda tidak pernah menolak.
pub const TANDA_PPH: [&str; 11] = [
    "tanpa_nik",
    "tanpa_npwp",
    "pph_negatif",
    "slip_lama",
    "lebih_potong_masa",
    "lintas_bulan",
    "tanpa_hari",
    "tarif_tidak_ada",
    "rumus_lama",
    "status_pajak_berubah",
    "komponen_per_run",
];
/// `tarif_tidak_sah` dibawa `bpjs_masa.tanda` slip.
pub const TANDA_BPJS: [&str; 4] = [
    "dipotong_tanpa_nomor",
    "bernomor_tanpa_potongan",
    "slip_lama",
    "tarif_tidak_sah",
];
pub const TANDA_A1: [&str; 5] = [
    "tanpa_nik",
    "tanpa_npwp",
    "slip_lama",
    "belum_masa_terakhir",
    "pph_tidak_cocok",
];

/// Kunci `app_lapor_setting`, juga kunci draft simpan.
pub const KUNCI_PEMOTONG: [&str; 6] = [
    "npwp",
    "nitku",
    "nama_penandatangan",
    "nik_penandatangan",
    "no_bpjs_ketenagakerjaan",
    "no_bpjs_kesehatan",
];
pub const MAKS_NAMA_PENANDATANGAN: usize = 100;

pub const PESAN_MASA: &str = "Masa wajib berformat YYYY-MM.";
pub const PESAN_TAHUN: &str = "Tahun wajib 4 digit.";
pub const PESAN_NITKU_NPWP: &str = "NITKU harus diawali NPWP pemotong.";

// SQL kembar (harfiah di `validations/lapor-pajak.ts`)

/// ?1 = `YYYY-MM` atau `YYYY`. Semua status ikut supaya run yang belum
/// dibayar bisa diperingatkan; penyaringan `PAID` di `pilah`. Profil dibaca
/// saat laporan dibuka, tidak dibekukan di slip.
pub const SLIP_LAPOR_SQL: &str = "SELECT r.id AS run_id, r.status AS status_run, r.period_start, i.id_karyawan, i.nama_karyawan, COALESCE(m.kode_karyawan, '') AS kode_karyawan, i.ptkp_status, i.gross_salary, i.pph21_amount, i.breakdown_snapshot, COALESCE(p.nik, '') AS nik, COALESCE(p.npwp, '') AS npwp, COALESCE(p.bpjs_kesehatan, '') AS bpjs_kesehatan, COALESCE(p.bpjs_ketenagakerjaan, '') AS bpjs_ketenagakerjaan FROM payroll_items i JOIN payroll_runs r ON r.id = i.payroll_run_id LEFT JOIN master_data m ON m.id_unik = i.id_karyawan LEFT JOIN hr_profil p ON p.id_karyawan = i.id_karyawan WHERE r.period_start LIKE ?1 || '-%' ORDER BY i.nama_karyawan, i.id_karyawan, r.period_start, r.id\n-- batas: slip satu masa atau satu tahun, jumlah pegawai kali run\n;";
pub const PEMOTONG_SQL: &str = "SELECT kunci, nilai FROM app_lapor_setting ORDER BY kunci LIMIT 50;";
pub const SIMPAN_PEMOTONG_SQL: &str = "INSERT INTO app_lapor_setting (kunci, nilai, diubah_oleh, updated_at) VALUES (?1, ?2, ?3, datetime('now')) ON CONFLICT(kunci) DO UPDATE SET nilai = excluded.nilai, diubah_oleh = excluded.diubah_oleh, updated_at = excluded.updated_at;";

// Validasi

fn isian_teks(draft: &Value, kunci: &str) -> Result<String, String> {
    match draft.get(kunci) {
        None | Some(Value::Null) => Ok(String::new()),
        Some(Value::String(t)) => Ok(t.trim().to_owned()),
        Some(_) => Err(format!("Isian '{kunci}' tidak valid.")),
    }
}

/// Cermin `validasiMasa`: `{ masa: "YYYY-MM" }`.
pub fn validasi_masa(draft: &Value) -> Result<String, String> {
    objek_ketat(draft, &["masa"])?;
    let masa = payload_text(draft, "masa").unwrap_or_default();
    let b = masa.as_bytes();
    let sah = b.len() == 7
        && b[4] == b'-'
        && b[..4].iter().chain(&b[5..]).all(u8::is_ascii_digit)
        && (1..=12).contains(&masa[5..].parse::<u8>().unwrap_or(0));
    if sah {
        Ok(masa)
    } else {
        Err(PESAN_MASA.into())
    }
}

/// Cermin `validasiTahun`: `{ tahun: "YYYY" }`.
pub fn validasi_tahun(draft: &Value) -> Result<String, String> {
    objek_ketat(draft, &["tahun"])?;
    let tahun = payload_text(draft, "tahun").unwrap_or_default();
    if tahun.len() == 4 && tahun.bytes().all(|c| c.is_ascii_digit()) {
        Ok(tahun)
    } else {
        Err(PESAN_TAHUN.into())
    }
}

#[derive(Clone, Debug, Default, PartialEq, Serialize)]
pub struct DataPemotong {
    pub npwp: String,
    pub nitku: String,
    pub nama_penandatangan: String,
    pub nik_penandatangan: String,
    pub no_bpjs_ketenagakerjaan: String,
    pub no_bpjs_kesehatan: String,
}

/// Cermin `bersihkan`: tanpa tanda baca dan spasi.
fn bersihkan(t: &str) -> String {
    t.chars()
        .filter(|c| !(c.is_ascii_punctuation() || c.is_whitespace()))
        .collect()
}

fn digit(t: &str, label: &str, n: usize) -> Result<String, String> {
    let a = bersihkan(t);
    if a.is_empty() {
        return Ok(a);
    }
    if !a.chars().all(|c| c.is_ascii_digit()) {
        return Err(format!("{label} hanya boleh berisi angka."));
    }
    if a.len() != n {
        return Err(format!("{label} harus {n} digit."));
    }
    Ok(a)
}

/// Nomor pendaftaran pemberi kerja BPJS: huruf atau angka, 5–20.
fn nomor_daftar(t: &str, label: &str) -> Result<String, String> {
    let a = bersihkan(t);
    if a.is_empty() {
        return Ok(a);
    }
    if !a.chars().all(|c| c.is_ascii_alphanumeric()) || !(5..=20).contains(&a.len()) {
        return Err(format!("{label} harus 5 sampai 20 huruf atau angka."));
    }
    Ok(a.to_ascii_uppercase())
}

/// Cermin `validasiPemotong`. Semua isian opsional; kosong = belum diisi.
/// NITKU = NPWP 16 digit + 6 digit kode tempat usaha.
pub fn validasi_pemotong(draft: &Value) -> Result<DataPemotong, String> {
    objek_ketat(draft, &KUNCI_PEMOTONG)?;
    // Jenis setiap isian diperiksa dulu, urut `KUNCI_PEMOTONG`, seperti TS.
    let mut t = Vec::with_capacity(KUNCI_PEMOTONG.len());
    for k in KUNCI_PEMOTONG {
        t.push(isian_teks(draft, k)?);
    }
    let npwp = digit(&t[0], "NPWP pemotong", 16)?;
    let nitku = digit(&t[1], "NITKU", 22)?;
    if !nitku.is_empty() && (npwp.is_empty() || !nitku.starts_with(&npwp)) {
        return Err(PESAN_NITKU_NPWP.into());
    }
    let nama_penandatangan = rapikan(&t[2]);
    if nama_penandatangan.chars().count() > MAKS_NAMA_PENANDATANGAN {
        return Err(format!(
            "Nama penandatangan maksimal {MAKS_NAMA_PENANDATANGAN} karakter."
        ));
    }
    Ok(DataPemotong {
        npwp,
        nitku,
        nama_penandatangan,
        nik_penandatangan: digit(&t[3], "NIK penandatangan", 16)?,
        no_bpjs_ketenagakerjaan: nomor_daftar(&t[4], "Nomor pendaftaran BPJS Ketenagakerjaan")?,
        no_bpjs_kesehatan: nomor_daftar(&t[5], "Nomor pendaftaran BPJS Kesehatan")?,
    })
}

/// Cermin `bacaPemotong`: baris `PEMOTONG_SQL` → data; kunci asing diabaikan.
pub fn baca_pemotong(daftar: &[Value]) -> DataPemotong {
    let nilai = |k: &str| {
        daftar
            .iter()
            .find(|b| teks(b, "kunci") == k)
            .map(|b| teks(b, "nilai"))
            .unwrap_or_default()
    };
    DataPemotong {
        npwp: nilai("npwp"),
        nitku: nilai("nitku"),
        nama_penandatangan: nilai("nama_penandatangan"),
        nik_penandatangan: nilai("nik_penandatangan"),
        no_bpjs_ketenagakerjaan: nilai("no_bpjs_ketenagakerjaan"),
        no_bpjs_kesehatan: nilai("no_bpjs_kesehatan"),
    }
}

// Rekap

/// Satu baris `SLIP_LAPOR_SQL`. `breakdown_snapshot` berupa teks JSON dari
/// database atau objek dari vektor.
#[derive(Clone, Debug, Deserialize)]
pub struct SlipLapor {
    pub run_id: String,
    pub status_run: String,
    pub period_start: String,
    pub id_karyawan: String,
    pub nama_karyawan: String,
    #[serde(default)]
    pub kode_karyawan: String,
    #[serde(default)]
    pub ptkp_status: String,
    #[serde(default)]
    pub gross_salary: i64,
    #[serde(default)]
    pub pph21_amount: i64,
    #[serde(default)]
    pub breakdown_snapshot: Value,
    #[serde(default)]
    pub nik: String,
    #[serde(default)]
    pub npwp: String,
    #[serde(default)]
    pub bpjs_kesehatan: String,
    #[serde(default)]
    pub bpjs_ketenagakerjaan: String,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct RunBelumDibayar {
    pub id: String,
    pub status: String,
    pub period_start: String,
}

/// Slip satu pegawai yang ikut laporan, dengan snapshot yang sudah diurai.
struct SlipBaca<'a> {
    slip: &'a SlipLapor,
    snap: Value,
}

struct Pilahan<'a> {
    pegawai: Vec<Vec<SlipBaca<'a>>>,
    jumlah_run: i64,
    run_belum_dibayar: Vec<RunBelumDibayar>,
}

fn urai_snapshot(v: &Value) -> Value {
    match v {
        Value::String(t) => serde_json::from_str(t).unwrap_or(Value::Null),
        Value::Object(_) => v.clone(),
        _ => Value::Null,
    }
}

/// Slip ber-`period_start` di `periode` (masa atau tahun) dari run `PAID`,
/// dikelompokkan per pegawai dengan urutan masukan. Run lain selain
/// `REJECTED` dicatat sebagai belum dibayar.
fn pilah<'a>(slip: &'a [SlipLapor], periode: &str) -> Pilahan<'a> {
    let awalan = format!("{periode}-");
    let mut pegawai: Vec<Vec<SlipBaca>> = Vec::new();
    let mut run: Vec<&str> = Vec::new();
    let mut belum: Vec<RunBelumDibayar> = Vec::new();
    for s in slip.iter().filter(|s| s.period_start.starts_with(&awalan)) {
        if s.status_run != STATUS_RUN_LAPOR {
            if s.status_run != STATUS_RUN_DITOLAK && !belum.iter().any(|r| r.id == s.run_id) {
                belum.push(RunBelumDibayar {
                    id: s.run_id.clone(),
                    status: s.status_run.clone(),
                    period_start: s.period_start.clone(),
                });
            }
            continue;
        }
        if !run.contains(&s.run_id.as_str()) {
            run.push(&s.run_id);
        }
        let baca = SlipBaca {
            slip: s,
            snap: urai_snapshot(&s.breakdown_snapshot),
        };
        match pegawai
            .iter_mut()
            .find(|g| g[0].slip.id_karyawan == s.id_karyawan)
        {
            Some(g) => g.push(baca),
            None => pegawai.push(vec![baca]),
        }
    }
    belum.sort_by(|a, b| (&a.period_start, &a.id).cmp(&(&b.period_start, &b.id)));
    Pilahan {
        pegawai,
        jumlah_run: run.len() as i64,
        run_belum_dibayar: belum,
    }
}

fn urut_tanda(kanon: &[&'static str], aktif: &[String]) -> Vec<&'static str> {
    kanon
        .iter()
        .copied()
        .filter(|t| aktif.iter().any(|a| a == t))
        .collect()
}

fn daftar_teks(v: &Value) -> Vec<String> {
    v.as_array()
        .map(|d| d.iter().filter_map(|t| t.as_str().map(str::to_owned)).collect())
        .unwrap_or_default()
}

fn opsi_teks(v: &Value) -> Option<String> {
    v.as_str().map(str::to_owned)
}

/// Bruto pajak slip; slip lama tanpa `pajak` memakai `gross_salary` beku.
fn bruto(s: &SlipBaca) -> (i64, bool) {
    match s.snap["pajak"]["bruto_pajak"].as_i64() {
        Some(b) => (b, false),
        None => (s.slip.gross_salary, true),
    }
}

fn status_pajak(s: &SlipBaca) -> &'static str {
    if s.snap["pajak"]["status"].as_str() == Some(STATUS_TIDAK_TETAP) {
        STATUS_TIDAK_TETAP
    } else {
        "tetap"
    }
}

/// PTKP yang dipakai menghitung (awal tahun, `tax.ptkp_status`); slip
/// lama memakai kolom slip.
fn ptkp_status(s: &SlipBaca) -> String {
    s.snap["tax"]["ptkp_status"]
        .as_str()
        .map(str::to_owned)
        .unwrap_or_else(|| s.slip.ptkp_status.clone())
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct BarisPph {
    pub id_karyawan: String,
    pub nama_karyawan: String,
    pub kode_karyawan: String,
    pub nik: String,
    pub npwp: String,
    pub ptkp_status: String,
    pub status: &'static str,
    pub metode: Option<String>,
    pub kategori: Option<String>,
    pub bruto: i64,
    pub pph: i64,
    pub jumlah_run: i64,
    pub tanda: Vec<&'static str>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct RekapPph {
    pub masa: String,
    pub jumlah_run: i64,
    pub run_belum_dibayar: Vec<RunBelumDibayar>,
    pub total_bruto: i64,
    pub total_pph: i64,
    pub baris: Vec<BarisPph>,
}

/// Cermin `rekapPph`: per pegawai, run `PAID` sebulan dijumlah. Status,
/// metode, dan kategori dari slip terakhir; PPh boleh negatif di masa
/// terakhir (pengembalian).
pub fn rekap_pph(slip: &[SlipLapor], masa: &str) -> RekapPph {
    let p = pilah(slip, masa);
    let baris: Vec<BarisPph> = p
        .pegawai
        .iter()
        .map(|g| {
            let akhir = g.last().expect("kelompok tidak kosong");
            let s = akhir.slip;
            let mut aktif: Vec<String> = Vec::new();
            let (mut jumlah_bruto, mut pph) = (0, 0);
            for b in g {
                let (nilai, lama) = bruto(b);
                jumlah_bruto += nilai;
                pph += b.slip.pph21_amount;
                if lama {
                    aktif.push("slip_lama".into());
                }
                aktif.extend(daftar_teks(&b.snap["pajak"]["tanda"]));
            }
            if s.nik.trim().is_empty() {
                aktif.push("tanpa_nik".into());
            }
            if s.npwp.trim().is_empty() {
                aktif.push("tanpa_npwp".into());
            }
            if pph < 0 {
                aktif.push("pph_negatif".into());
            }
            BarisPph {
                id_karyawan: s.id_karyawan.clone(),
                nama_karyawan: s.nama_karyawan.clone(),
                kode_karyawan: s.kode_karyawan.clone(),
                nik: s.nik.trim().to_owned(),
                npwp: s.npwp.trim().to_owned(),
                ptkp_status: ptkp_status(akhir),
                status: status_pajak(akhir),
                metode: opsi_teks(&akhir.snap["pajak"]["metode"]),
                kategori: opsi_teks(&akhir.snap["pajak"]["kategori"]),
                bruto: jumlah_bruto,
                pph,
                jumlah_run: g.len() as i64,
                tanda: urut_tanda(&TANDA_PPH, &aktif),
            }
        })
        .collect();
    RekapPph {
        masa: masa.to_owned(),
        jumlah_run: p.jumlah_run,
        run_belum_dibayar: p.run_belum_dibayar,
        total_bruto: baris.iter().map(|b| b.bruto).sum(),
        total_pph: baris.iter().map(|b| b.pph).sum(),
        baris,
    }
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct BarisBpjs {
    pub id_karyawan: String,
    pub nama_karyawan: String,
    pub kode_karyawan: String,
    pub nik: String,
    pub no_bpjs_ketenagakerjaan: String,
    pub no_bpjs_kesehatan: String,
    pub dasar: i64,
    pub iuran: BTreeMap<String, i64>,
    pub pekerja: i64,
    pub perusahaan: i64,
    pub jumlah_run: i64,
    pub tanda: Vec<&'static str>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct KodeBpjs {
    pub code: String,
    pub name: String,
    pub is_employee: bool,
    pub total: i64,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct RekapBpjs {
    pub masa: String,
    pub jumlah_run: i64,
    pub run_belum_dibayar: Vec<RunBelumDibayar>,
    pub total_dasar: i64,
    pub total_pekerja: i64,
    pub total_perusahaan: i64,
    /// Kolom iuran, urut kode.
    pub kode: Vec<KodeBpjs>,
    pub baris: Vec<BarisBpjs>,
}

/// Kode program BPJS Kesehatan (`BPJS_KES_*`, kode lama `KES_CO`); sisanya
/// Ketenagakerjaan (JHT, JP, JKK, JKM).
pub fn kode_kesehatan(code: &str) -> bool {
    code.contains("KES")
}

/// Cermin `rekapBpjs`: iuran per kode dari `breakdown_snapshot.bpjs`, dasar
/// dari `bpjs_masa.dasar_run`. Nomor kepesertaan dibandingkan per program.
pub fn rekap_bpjs(slip: &[SlipLapor], masa: &str) -> RekapBpjs {
    let p = pilah(slip, masa);
    let mut kode: BTreeMap<String, KodeBpjs> = BTreeMap::new();
    let baris: Vec<BarisBpjs> = p
        .pegawai
        .iter()
        .map(|g| {
            let s = g.last().expect("kelompok tidak kosong").slip;
            let mut aktif: Vec<String> = Vec::new();
            let mut iuran: BTreeMap<String, i64> = BTreeMap::new();
            let (mut dasar, mut pekerja, mut perusahaan, mut tk, mut kes) = (0, 0, 0, 0, 0);
            for b in g {
                match b.snap["bpjs_masa"]["dasar_run"].as_i64() {
                    Some(d) => dasar += d,
                    None => aktif.push("slip_lama".into()),
                }
                aktif.extend(daftar_teks(&b.snap["bpjs_masa"]["tanda"]));
                for r in b.snap["bpjs"].as_array().into_iter().flatten() {
                    let Some(code) = r["code"].as_str() else { continue };
                    let nominal = r["nominal"].as_i64().unwrap_or(0);
                    let is_employee = r["is_employee"].as_bool().unwrap_or(false);
                    *iuran.entry(code.to_owned()).or_insert(0) += nominal;
                    kode.entry(code.to_owned())
                        .or_insert_with(|| KodeBpjs {
                            code: code.to_owned(),
                            name: r["name"].as_str().unwrap_or_default().to_owned(),
                            is_employee,
                            total: 0,
                        })
                        .total += nominal;
                    if is_employee {
                        pekerja += nominal;
                    } else {
                        perusahaan += nominal;
                    }
                    if kode_kesehatan(code) {
                        kes += nominal;
                    } else {
                        tk += nominal;
                    }
                }
            }
            let no_tk = s.bpjs_ketenagakerjaan.trim();
            let no_kes = s.bpjs_kesehatan.trim();
            if (tk > 0 && no_tk.is_empty()) || (kes > 0 && no_kes.is_empty()) {
                aktif.push("dipotong_tanpa_nomor".into());
            }
            if (!no_tk.is_empty() && tk == 0) || (!no_kes.is_empty() && kes == 0) {
                aktif.push("bernomor_tanpa_potongan".into());
            }
            BarisBpjs {
                id_karyawan: s.id_karyawan.clone(),
                nama_karyawan: s.nama_karyawan.clone(),
                kode_karyawan: s.kode_karyawan.clone(),
                nik: s.nik.trim().to_owned(),
                no_bpjs_ketenagakerjaan: no_tk.to_owned(),
                no_bpjs_kesehatan: no_kes.to_owned(),
                dasar,
                iuran,
                pekerja,
                perusahaan,
                jumlah_run: g.len() as i64,
                tanda: urut_tanda(&TANDA_BPJS, &aktif),
            }
        })
        .collect();
    RekapBpjs {
        masa: masa.to_owned(),
        jumlah_run: p.jumlah_run,
        run_belum_dibayar: p.run_belum_dibayar,
        total_dasar: baris.iter().map(|b| b.dasar).sum(),
        total_pekerja: baris.iter().map(|b| b.pekerja).sum(),
        total_perusahaan: baris.iter().map(|b| b.perusahaan).sum(),
        kode: kode.into_values().collect(),
        baris,
    }
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct BarisA1 {
    pub id_karyawan: String,
    pub nama_karyawan: String,
    pub kode_karyawan: String,
    pub nik: String,
    pub npwp: String,
    pub ptkp_status: String,
    pub status: &'static str,
    pub masa_awal: String,
    pub masa_akhir: String,
    pub jumlah_masa: i64,
    /// Σ bruto pajak slip `PAID` setahun.
    pub bruto: i64,
    /// Σ `pph21_amount` slip `PAID` setahun.
    pub pph_dipotong: i64,
    /// Pegawai tetap; pegawai tidak tetap hanya direkap jumlahnya.
    pub a1: bool,
    /// Dari `pajak` slip `PASAL_17_TERAKHIR` terakhir; null bila belum ada.
    pub bruto_tahun: Option<i64>,
    pub biaya_jabatan: Option<i64>,
    pub iuran_pensiun: Option<i64>,
    pub ptkp: Option<i64>,
    pub pkp: Option<i64>,
    pub pph_setahun: Option<i64>,
    pub tanda: Vec<&'static str>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct RekapA1 {
    pub tahun: String,
    pub jumlah_run: i64,
    pub run_belum_dibayar: Vec<RunBelumDibayar>,
    pub jumlah_a1: i64,
    pub total_bruto: i64,
    pub total_pph: i64,
    pub baris: Vec<BarisA1>,
}

/// Cermin `rekapA1`: per pegawai yang punya slip `PAID` di tahun itu. Angka
/// A1 diambil dari `pajak` slip Pasal 17 masa terakhir yang terakhir; PPh
/// setahun ≠ Σ yang dipotong ditandai `pph_tidak_cocok`.
pub fn rekap_a1(slip: &[SlipLapor], tahun: &str) -> RekapA1 {
    let p = pilah(slip, tahun);
    let baris: Vec<BarisA1> = p
        .pegawai
        .iter()
        .map(|g| {
            let akhir = g.last().expect("kelompok tidak kosong");
            let s = akhir.slip;
            let mut aktif: Vec<String> = Vec::new();
            let (mut jumlah_bruto, mut pph) = (0, 0);
            let mut masa: Vec<String> = Vec::new();
            for b in g {
                let (nilai, lama) = bruto(b);
                jumlah_bruto += nilai;
                pph += b.slip.pph21_amount;
                if lama {
                    aktif.push("slip_lama".into());
                }
                let m: String = b.slip.period_start.chars().take(7).collect();
                if !masa.contains(&m) {
                    masa.push(m);
                }
            }
            masa.sort();
            let status = status_pajak(akhir);
            let a1 = status != STATUS_TIDAK_TETAP;
            let pasal_17 = g
                .iter()
                .rev()
                .find(|b| b.snap["pajak"]["metode"].as_str() == Some(METODE_PASAL_17_TERAKHIR))
                .filter(|_| a1)
                .map(|b| &b.snap["pajak"]);
            let ambil = |k: &str| pasal_17.and_then(|j| j[k].as_i64());
            if a1 && pasal_17.is_none() {
                aktif.push("belum_masa_terakhir".into());
            }
            if ambil("pph_setahun").is_some_and(|v| v != pph) {
                aktif.push("pph_tidak_cocok".into());
            }
            if s.nik.trim().is_empty() {
                aktif.push("tanpa_nik".into());
            }
            if s.npwp.trim().is_empty() {
                aktif.push("tanpa_npwp".into());
            }
            BarisA1 {
                id_karyawan: s.id_karyawan.clone(),
                nama_karyawan: s.nama_karyawan.clone(),
                kode_karyawan: s.kode_karyawan.clone(),
                nik: s.nik.trim().to_owned(),
                npwp: s.npwp.trim().to_owned(),
                ptkp_status: ptkp_status(akhir),
                status,
                masa_awal: masa.first().cloned().unwrap_or_default(),
                masa_akhir: masa.last().cloned().unwrap_or_default(),
                jumlah_masa: masa.len() as i64,
                bruto: jumlah_bruto,
                pph_dipotong: pph,
                a1,
                bruto_tahun: ambil("bruto_tahun"),
                biaya_jabatan: ambil("biaya_jabatan"),
                iuran_pensiun: ambil("iuran_pensiun"),
                ptkp: ambil("ptkp"),
                pkp: ambil("pkp"),
                pph_setahun: ambil("pph_setahun"),
                tanda: urut_tanda(&TANDA_A1, &aktif),
            }
        })
        .collect();
    RekapA1 {
        tahun: tahun.to_owned(),
        jumlah_run: p.jumlah_run,
        run_belum_dibayar: p.run_belum_dibayar,
        jumlah_a1: baris.iter().filter(|b| b.a1).count() as i64,
        total_bruto: baris.iter().map(|b| b.bruto).sum(),
        total_pph: baris.iter().map(|b| b.pph_dipotong).sum(),
        baris,
    }
}

// Akses cloud

/// Data pemotong untuk Pengaturan (`desktop_report_setting`).
pub async fn data_pemotong(client: &TursoClient) -> Result<DataPemotong, CommandError> {
    client.ensure_schema_current().await?;
    Ok(baca_pemotong(&baris(client, PEMOTONG_SQL, vec![]).await?))
}

/// `desktop_report_setting_save`: semua kunci ditulis dalam satu pipeline.
pub async fn simpan_pemotong(
    client: &TursoClient,
    oleh: &str,
    draft: &Value,
) -> Result<Value, CommandError> {
    let sah = validasi_pemotong(draft).map_err(galat)?;
    client.ensure_schema_current().await?;
    let isi = json!(sah);
    client
        .execute_pipeline(
            KUNCI_PEMOTONG
                .iter()
                .map(|k| Statement::new(SIMPAN_PEMOTONG_SQL, vec![json!(k), isi[k].clone(), json!(oleh)]))
                .collect(),
        )
        .await?;
    Ok(json!({ "sukses": true, "pemotong": sah }))
}

async fn muat(client: &TursoClient, periode: &str) -> Result<(Vec<SlipLapor>, DataPemotong), CommandError> {
    client.ensure_schema_current().await?;
    let slip = serde_json::from_value(json!(
        baris(client, SLIP_LAPOR_SQL, vec![json!(periode)]).await?
    ))
    .map_err(|_| CommandError::internal())?;
    let pemotong = baca_pemotong(&baris(client, PEMOTONG_SQL, vec![]).await?);
    Ok((slip, pemotong))
}

/// `desktop_report_pph_monthly`.
pub async fn laporan_pph(client: &TursoClient, draft: &Value) -> Result<Value, CommandError> {
    let masa = validasi_masa(draft).map_err(galat)?;
    let (slip, pemotong) = muat(client, &masa).await?;
    Ok(json!({ "rekap": rekap_pph(&slip, &masa), "pemotong": pemotong }))
}

/// `desktop_report_bpjs_monthly`.
pub async fn laporan_bpjs(client: &TursoClient, draft: &Value) -> Result<Value, CommandError> {
    let masa = validasi_masa(draft).map_err(galat)?;
    let (slip, pemotong) = muat(client, &masa).await?;
    Ok(json!({ "rekap": rekap_bpjs(&slip, &masa), "pemotong": pemotong }))
}

/// `desktop_report_a1_yearly`.
pub async fn laporan_a1(client: &TursoClient, draft: &Value) -> Result<Value, CommandError> {
    let tahun = validasi_tahun(draft).map_err(galat)?;
    let (slip, pemotong) = muat(client, &tahun).await?;
    Ok(json!({ "rekap": rekap_a1(&slip, &tahun), "pemotong": pemotong }))
}

#[cfg(test)]
mod tests {
    //! Vektor bersama `lapor-pajak.vektor.json` dan alur cloud di atas
    //! `TursoClient::local_file`, data sama dengan `services/lapor-pajak.test.ts`.
    use super::*;

    const VEKTOR: &str = include_str!("../../../src/lib/validations/lapor-pajak.vektor.json");

    fn vektor() -> Value {
        serde_json::from_str(VEKTOR).expect("lapor-pajak.vektor.json sah")
    }

    fn cocok<T: Serialize>(hasil: Result<T, String>, k: &Value) {
        match k["galat"].as_str() {
            Some(pesan) => assert_eq!(hasil.err().as_deref(), Some(pesan), "{}", k["nama"]),
            None => assert_eq!(json!(hasil.expect("sah")), k["hasil"], "{}", k["nama"]),
        }
    }

    #[test]
    fn lapor_pajak_vektor_validasi() {
        let v = vektor();
        for k in v["masa"].as_array().expect("masa") {
            cocok(validasi_masa(&k["draft"]), k);
        }
        for k in v["tahun"].as_array().expect("tahun") {
            cocok(validasi_tahun(&k["draft"]), k);
        }
        for k in v["pemotong"].as_array().expect("pemotong") {
            cocok(validasi_pemotong(&k["draft"]), k);
        }
    }

    #[test]
    fn lapor_pajak_vektor_rekap() {
        let v = vektor();
        let slip: Vec<SlipLapor> = serde_json::from_value(v["slip"].clone()).expect("slip vektor");
        for k in v["pph"].as_array().expect("pph") {
            let masa = k["masa"].as_str().unwrap();
            assert_eq!(json!(rekap_pph(&slip, masa)), k["hasil"], "{}", k["nama"]);
        }
        for k in v["bpjs"].as_array().expect("bpjs") {
            let masa = k["masa"].as_str().unwrap();
            assert_eq!(json!(rekap_bpjs(&slip, masa)), k["hasil"], "{}", k["nama"]);
        }
        for k in v["a1"].as_array().expect("a1") {
            let tahun = k["tahun"].as_str().unwrap();
            assert_eq!(json!(rekap_a1(&slip, tahun)), k["hasil"], "{}", k["nama"]);
        }
    }

    /// Data sama dengan `services/lapor-pajak.test.ts`: dua run sebulan
    /// dijumlah, run `REJECTED` dilewati, run `APPROVED` diperingatkan, data
    /// pemotong tersimpan dan ikut di laporan, NPWP salah ditolak.
    #[test]
    fn lapor_pajak_alur_cloud() {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .build()
            .expect("runtime uji");
        runtime.block_on(async {
            let dir = tempfile::tempdir().expect("direktori sementara");
            let hub = dir.path().join("sppg-hub.db");
            let client = TursoClient::local_file(
                url::Url::parse("https://lapor-pajak.sppg.invalid").expect("origin uji"),
                &hub,
                reqwest::Client::new(),
            );
            client.ensure_schema().await.expect("provisioning lokal");
            let c = rusqlite::Connection::open(&hub).expect("buka hub");
            c.execute_batch(include_str!("../../../src/lib/services/lapor-pajak.uji.sql"))
                .expect("data uji");

            let salah = simpan_pemotong(&client, "admin", &json!({ "npwp": "123" }))
                .await
                .expect_err("NPWP salah");
            assert_eq!(salah.message, "NPWP pemotong harus 16 digit.");
            simpan_pemotong(
                &client,
                "admin",
                &json!({ "npwp": "0123.4567.8901.2345", "nitku": "0123456789012345000000", "nama_penandatangan": "Kepala  Sekolah" }),
            )
            .await
            .expect("simpan pemotong");
            let pemotong = data_pemotong(&client).await.expect("baca pemotong");
            assert_eq!(pemotong.npwp, "0123456789012345");
            assert_eq!(pemotong.nama_penandatangan, "Kepala Sekolah");

            let pph = laporan_pph(&client, &json!({ "masa": "2026-11" })).await.expect("rekap PPh");
            assert_eq!(pph["pemotong"]["nitku"], "0123456789012345000000");
            let r = &pph["rekap"];
            assert_eq!(r["jumlah_run"], 2);
            assert_eq!(r["run_belum_dibayar"], json!([{ "id": "lp-run-ok", "status": "APPROVED", "period_start": "2026-11-21" }]));
            assert_eq!(r["baris"][0]["id_karyawan"], "lp-p1");
            assert_eq!(r["baris"][0]["bruto"], 5_000_000);
            assert_eq!(r["baris"][0]["pph"], 150_000);
            assert_eq!(r["baris"][0]["jumlah_run"], 2);
            assert_eq!(r["total_pph"], 150_000);

            let bpjs = laporan_bpjs(&client, &json!({ "masa": "2026-11" })).await.expect("rekap BPJS");
            assert_eq!(bpjs["rekap"]["baris"][0]["iuran"]["JHT_EMP"], 100_000);
            assert_eq!(bpjs["rekap"]["total_pekerja"], 100_000);

            let a1 = laporan_a1(&client, &json!({ "tahun": "2026" })).await.expect("rekap A1");
            assert_eq!(a1["rekap"]["baris"][0]["tanda"], json!(["belum_masa_terakhir"]));
            let masa = laporan_pph(&client, &json!({ "masa": "2026-13" })).await.expect_err("masa salah");
            assert_eq!(masa.message, PESAN_MASA);
        });
    }
}
