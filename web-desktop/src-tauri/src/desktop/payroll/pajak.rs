//! PPh 21 dan BPJS per masa pajak (HRIS Fase 0, `prd-hris.md` §6.3).
//!
//! Aturan murni: tanpa database. Cermin `validations/pajak.ts`, diuji dengan
//! `validations/pajak.vektor.json` yang sama. Uang `i64` rupiah, tarif dalam
//! basis per sepuluh ribu (`persen_ke_basis`), pembulatan
//! `MidpointAwayFromZero` lewat `rust_decimal`. Dipindahkan dari fase 13 HRIS
//! perusahaan, disesuaikan: status pajak dari `guru_data.status_kepegawaian`
//! (Q-2 (b)), tanpa `FLAT_DAILY`, dan item lama memakai `overtime_salary`.
//!
//! Masa = bulan `period_start` (Q-1). "Sudah dipotong" adalah jumlah item
//! personil yang sama di run lain bermasa sama atau setahun, kecuali
//! `REJECTED` (Q-8), dibaca `RUN_TAHUN_SQL` lalu diringkas
//! `ringkas_pembanding`.

use std::collections::BTreeMap;
use std::sync::OnceLock;

use rust_decimal::prelude::*;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use super::models::{BpjsRule, TaxRule};

/// Naik bila bentuk kunci `breakdown_snapshot.pajak` berubah.
pub const VERSI_PAJAK: i64 = 1;

pub const STATUS_TETAP: &str = "tetap";
pub const STATUS_TIDAK_TETAP: &str = "tidak_tetap";

pub const METODE_TER_BULANAN: &str = "TER_BULANAN";
pub const METODE_TER_HARIAN: &str = "TER_HARIAN";
pub const METODE_PASAL_17_HARIAN: &str = "PASAL_17_HARIAN";
pub const METODE_PASAL_17_TERAKHIR: &str = "PASAL_17_TERAKHIR";

/// Kunci `setting_gex_system`: status kepegawaian yang dianggap pegawai tidak
/// tetap, dipisah koma. Kunci yang belum ada = `status_tidak_tetap` bawaan.
pub const KUNCI_STATUS_TIDAK_TETAP: &str = "pajak_status_tidak_tetap";

/// Premi yang dibayar sekolah dan masuk bruto pajak (PMK 168): JKK, JKM,
/// BPJS Kesehatan. Termasuk kode seed lama Web untuk item run lama.
pub const KODE_PREMI: [&str; 6] = ["JKK_CO", "JKM_CO", "BPJS_KES_CO", "JKK", "JKM", "KES_CO"];

/// Iuran pensiun/JHT/JP yang dibayar pegawai, pengurang di masa terakhir.
pub const KODE_IURAN_PENSIUN: [&str; 2] = ["JHT_EMP", "JP_EMP"];

/// Urutan kanonik tanda PPh 21 (§6.3). Tanda tidak pernah menolak.
pub const TANDA_PAJAK: [&str; 7] = [
    "lebih_potong_masa",
    "lintas_bulan",
    "tanpa_hari",
    "tarif_tidak_ada",
    "rumus_lama",
    "status_pajak_berubah",
    "komponen_per_run",
];

pub const TANDA_BPJS_TARIF_TIDAK_SAH: &str = "tarif_tidak_sah";

#[derive(Debug, Deserialize)]
pub struct Ptkp {
    pub dasar: i64,
    pub kawin: i64,
    pub per_tanggungan: i64,
    pub maks_tanggungan: i64,
}

#[derive(Debug, Deserialize)]
pub struct BiayaJabatan {
    pub basis: i64,
    pub maks_per_masa: i64,
}

#[derive(Debug, Deserialize)]
pub struct TerHarian {
    pub batas_nol: i64,
    pub batas_tarif: i64,
    pub basis: i64,
    pub basis_dasar_pasal_17: i64,
}

#[derive(Debug, Deserialize)]
pub struct PajakBawaan {
    pub ptkp: Ptkp,
    pub biaya_jabatan: BiayaJabatan,
    pub ter_harian: TerHarian,
    pub pembulatan_pkp: i64,
    pub status_tidak_tetap: Vec<String>,
}

/// PTKP, biaya jabatan, TER harian, dan status tidak tetap bawaan (Q-9 (a)),
/// berkas yang sama dengan TS.
pub fn pajak_bawaan() -> &'static PajakBawaan {
    static BAWAAN: OnceLock<PajakBawaan> = OnceLock::new();
    BAWAAN.get_or_init(|| {
        serde_json::from_str(include_str!("../../../../src/lib/validations/pajak-bawaan.json"))
            .expect("pajak-bawaan.json tidak valid")
    })
}

// Aritmetika

/// `round(nilai × basis / 10.000)`, titik tengah menjauhi nol.
pub fn kali_basis(nilai: i64, basis: i64) -> i64 {
    bulatkan(Decimal::from(nilai) * Decimal::from(basis))
}

/// Pembilang dalam satuan rupiah × basis, dibagi 10.000 lalu dibulatkan.
fn bulatkan(pembilang: Decimal) -> i64 {
    (pembilang / Decimal::from(10_000))
        .round_dp_with_strategy(0, RoundingStrategy::MidpointAwayFromZero)
        .to_i64()
        .unwrap_or(0)
}

/// Persen tersimpan (REAL) → basis per sepuluh ribu: 0,25 → 25, 3,7 → 370.
/// Lebih dari dua desimal, negatif, atau bukan angka = `None`. `Display` f64
/// menulis desimal terpendek, sama dengan `String(number)` di TS.
pub fn persen_ke_basis(persen: f64) -> Option<i64> {
    if !persen.is_finite() || persen < 0.0 {
        return None;
    }
    let teks = persen.to_string();
    let (bulat, pecahan) = teks.split_once('.').unwrap_or((teks.as_str(), ""));
    if bulat.is_empty()
        || !bulat.chars().all(|c| c.is_ascii_digit())
        || pecahan.chars().count() > 2
        || !pecahan.chars().all(|c| c.is_ascii_digit())
    {
        return None;
    }
    let bulat: i64 = bulat.parse().ok()?;
    let pecahan: i64 = format!("{pecahan:0<2}").parse().ok()?;
    bulat.checked_mul(100)?.checked_add(pecahan)
}

// Status, PTKP, masa

/// Isi kunci `pajak_status_tidak_tetap`. Kunci yang belum ada = bawaan;
/// kunci yang ada tetapi kosong = tidak ada yang tidak tetap.
pub fn daftar_status_tidak_tetap(nilai: Option<&str>) -> Vec<String> {
    match nilai {
        None => pajak_bawaan().status_tidak_tetap.clone(),
        Some(teks) => teks
            .split(',')
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_owned)
            .collect(),
    }
}

/// Pilihan centang kunci `pajak_status_tidak_tetap` (Q-26 (a)): status kontrak
/// K-1 ditambah nilai lama `Kontrak`. Cermin `PILIHAN_STATUS_TIDAK_TETAP` di
/// `validations/pajak.ts`.
pub const PILIHAN_STATUS_TIDAK_TETAP: [&str; 8] =
    ["GTY", "PTY", "GTT", "PTT", "Honorer", "PNS", "PPPK", "Kontrak"];

/// Isi kunci dari centang layar, urut seperti pilihan. Daftar kosong = `""`;
/// nilai di luar pilihan ditolak. Cermin `validasiStatusTidakTetap`.
pub fn validasi_status_tidak_tetap(daftar: &[String]) -> Result<String, String> {
    let mut dipilih = Vec::new();
    for isi in daftar {
        let isi = isi.trim();
        let cocok = PILIHAN_STATUS_TIDAK_TETAP
            .iter()
            .find(|p| p.to_lowercase() == isi.to_lowercase())
            .ok_or_else(|| format!("Status \"{isi}\" tidak dikenal."))?;
        dipilih.push(*cocok);
    }
    Ok(PILIHAN_STATUS_TIDAK_TETAP
        .iter()
        .filter(|p| dipilih.contains(p))
        .copied()
        .collect::<Vec<_>>()
        .join(","))
}

/// Q-2 (b): status kepegawaian yang tercantum di daftar = tidak tetap,
/// sisanya (termasuk tendik tanpa `guru_data`) tetap. Huruf besar-kecil
/// diabaikan.
pub fn status_pph(status_kepegawaian: &str, tidak_tetap: &[String]) -> &'static str {
    let status = status_kepegawaian.trim().to_lowercase();
    if !status.is_empty() && tidak_tetap.iter().any(|t| t.trim().to_lowercase() == status) {
        STATUS_TIDAK_TETAP
    } else {
        STATUS_TETAP
    }
}

fn status_kanonik(status: &str) -> &'static str {
    if status == STATUS_TIDAK_TETAP {
        STATUS_TIDAK_TETAP
    } else {
        STATUS_TETAP
    }
}

/// Status PTKP yang dirapikan; yang tidak dikenal dianggap TK/0.
fn bentuk_ptkp(ptkp_status: &str) -> (bool, i64) {
    let teks = ptkp_status.trim().to_uppercase();
    let (kawin, tanggungan) = match teks.split_once('/') {
        Some(("TK", n)) => (false, n),
        Some(("K", n)) => (true, n),
        _ => return (false, 0),
    };
    match tanggungan.parse::<i64>() {
        Ok(n) if (0..=3).contains(&n) && tanggungan.len() == 1 => (kawin, n),
        _ => (false, 0),
    }
}

/// Peta PMK 168: TK/0, TK/1, K/0 → A; TK/2, TK/3, K/1, K/2 → B; K/3 → C.
pub fn kategori_ter(ptkp_status: &str) -> &'static str {
    match bentuk_ptkp(ptkp_status) {
        (false, 0 | 1) | (true, 0) => "TER_A",
        (true, 3) => "TER_C",
        _ => "TER_B",
    }
}

pub fn nilai_ptkp(ptkp_status: &str) -> i64 {
    let ptkp = &pajak_bawaan().ptkp;
    let (kawin, tanggungan) = bentuk_ptkp(ptkp_status);
    ptkp.dasar
        + if kawin { ptkp.kawin } else { 0 }
        + tanggungan.min(ptkp.maks_tanggungan) * ptkp.per_tanggungan
}

/// `YYYY-MM` dari tanggal `YYYY-MM-DD`.
pub fn masa(tanggal: &str) -> String {
    tanggal.chars().take(7).collect()
}

fn tanggal(teks: &str) -> Option<(i64, i64, i64)> {
    let mut bagian = teks.split('-');
    let tahun = bagian.next()?.parse().ok()?;
    let bulan = bagian.next()?.parse().ok()?;
    let hari = bagian.next()?.parse().ok()?;
    Some((tahun, bulan, hari))
}

fn hari_dalam_bulan(tahun: i64, bulan: i64) -> i64 {
    match bulan {
        2 if (tahun % 4 == 0 && tahun % 100 != 0) || tahun % 400 == 0 => 29,
        2 => 28,
        4 | 6 | 9 | 11 => 30,
        _ => 31,
    }
}

/// Run tepat satu bulan kalender (pegawai tidak tetap "dibayar bulanan").
pub fn bulan_penuh(period_start: &str, period_end: &str) -> bool {
    match (tanggal(period_start), tanggal(period_end)) {
        (Some((t1, b1, h1)), Some((t2, b2, h2))) => {
            t1 == t2 && b1 == b2 && h1 == 1 && h2 == hari_dalam_bulan(t2, b2)
        }
        _ => false,
    }
}

/// Masa Desember, atau bulan tanggal selesai aktif personil yang keluar.
pub fn masa_terakhir(masa_run: &str, keluar_pada: Option<&str>) -> bool {
    masa_run.ends_with("-12") || keluar_pada.is_some_and(|tanggal| masa(tanggal) == masa_run)
}

// Tarif

fn lapis_urut<'a>(lapis: &'a [TaxRule], kategori: &str) -> Vec<&'a TaxRule> {
    let mut hasil: Vec<&TaxRule> = lapis.iter().filter(|l| l.category == kategori).collect();
    hasil.sort_by_key(|l| l.bracket_min);
    hasil
}

/// Basis TER bulanan. Batas atas inklusif; `bracket_min` = batas atas lapis
/// sebelumnya, jadi eksklusif kecuali lapis pertama (V12).
pub fn tarif_ter(kategori: &str, bruto: i64, lapis: &[TaxRule]) -> Option<i64> {
    lapis_urut(lapis, kategori)
        .into_iter()
        .find(|l| (bruto > l.bracket_min || l.bracket_min == 0) && l.bracket_max.map_or(true, |m| bruto <= m))
        .and_then(|l| persen_ke_basis(l.rate_percentage))
}

/// Tarif progresif Pasal 17 dari baris `PASAL_17`. `None` bila tidak ada
/// lapis atau tarifnya tidak sah.
pub fn pasal_17(pkp: i64, lapis: &[TaxRule]) -> Option<i64> {
    let lapis = lapis_urut(lapis, "PASAL_17");
    if lapis.is_empty() {
        return None;
    }
    let mut pembilang = Decimal::ZERO;
    for l in lapis {
        if pkp <= l.bracket_min {
            break;
        }
        let atas = l.bracket_max.map_or(pkp, |m| pkp.min(m));
        pembilang += Decimal::from(atas - l.bracket_min) * Decimal::from(persen_ke_basis(l.rate_percentage)?);
    }
    Some(bulatkan(pembilang))
}

// PPh 21 satu item

/// Masukan satu personil satu run. Angka `*_sebelum` dan `*_lain` dari run
/// pembanding (langkah 3). Kunci yang absen dianggap nol/kosong.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
pub struct MasukanPph {
    pub period_start: String,
    pub period_end: String,
    /// `status_pph` (tetap/tidak_tetap); selain `tidak_tetap` = tetap.
    pub status: String,
    /// Status awal tahun pajak (Q-4), untuk kategori TER dan PTKP.
    pub ptkp_status: String,
    pub gross: i64,
    /// JKK, JKM, BPJS Kesehatan sekolah run ini (`KODE_PREMI`).
    pub premi: i64,
    /// Hari hadir (`total_hadir`), untuk TER harian.
    pub hari: i64,
    /// `tanggal_selesai_aktif` bila personil sudah nonaktif saat run dibuat.
    pub keluar_pada: Option<String>,
    pub bruto_masa_sebelum: i64,
    pub pph_masa_sebelum: i64,
    /// Item berstatus tetap tahun itu, di luar run ini.
    pub bruto_tahun_sebelum: i64,
    pub pph_tahun_sebelum: i64,
    pub iuran_pensiun_sebelum: i64,
    pub iuran_pensiun_run: i64,
    /// Masa lain di tahun itu yang berbruto (untuk batas biaya jabatan).
    pub masa_berbruto_lain: i64,
    pub rumus_lama: bool,
    pub status_pajak_berubah: bool,
    pub komponen_per_run: bool,
}

/// Isi `breakdown_snapshot.pajak`. Kunci yang tidak berlaku bernilai `null`.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct HasilPph {
    pub versi: i64,
    pub masa: String,
    pub status: &'static str,
    pub metode: &'static str,
    pub kategori: Option<&'static str>,
    /// Basis per sepuluh ribu (125 = 1,25%); `null` untuk Pasal 17.
    pub tarif: Option<i64>,
    pub bruto_pajak: i64,
    pub premi: i64,
    pub bruto_masa: Option<i64>,
    pub sudah_dipotong: i64,
    pub hari: Option<i64>,
    pub bruto_tahun: Option<i64>,
    pub biaya_jabatan: Option<i64>,
    pub iuran_pensiun: Option<i64>,
    pub ptkp: Option<i64>,
    pub pkp: Option<i64>,
    pub pph_setahun: Option<i64>,
    /// Potongan run ini; negatif = pengembalian di masa terakhir (Q-5).
    pub pph: i64,
    pub tanda: Vec<&'static str>,
}

pub fn hitung_pph(m: &MasukanPph, lapis: &[TaxRule]) -> HasilPph {
    let bawaan = pajak_bawaan();
    let status = status_kanonik(&m.status);
    let masa_run = masa(&m.period_start);
    let bruto = m.gross + m.premi;
    let kategori = kategori_ter(&m.ptkp_status);
    let mut aktif: Vec<&'static str> = Vec::new();
    if masa_run != masa(&m.period_end) {
        aktif.push("lintas_bulan");
    }
    let mut hasil = HasilPph {
        versi: VERSI_PAJAK,
        masa: masa_run.clone(),
        status,
        metode: METODE_TER_BULANAN,
        kategori: Some(kategori),
        tarif: None,
        bruto_pajak: bruto,
        premi: m.premi,
        bruto_masa: None,
        sudah_dipotong: 0,
        hari: None,
        bruto_tahun: None,
        biaya_jabatan: None,
        iuran_pensiun: None,
        ptkp: None,
        pkp: None,
        pph_setahun: None,
        pph: 0,
        tanda: Vec::new(),
    };

    if status == STATUS_TIDAK_TETAP && !bulan_penuh(&m.period_start, &m.period_end) {
        // §6.3 (6): TER harian atas bruto run, tanpa masa dan rekonsiliasi.
        let harian = &bawaan.ter_harian;
        let hari = if m.hari > 0 {
            m.hari
        } else if bruto > 0 {
            aktif.push("tanpa_hari");
            1
        } else {
            0
        };
        hasil.kategori = None;
        hasil.hari = Some(hari);
        hasil.metode = METODE_TER_HARIAN;
        if bruto <= harian.batas_nol * hari {
            hasil.tarif = Some(0);
        } else if bruto <= harian.batas_tarif * hari {
            hasil.tarif = Some(harian.basis);
            hasil.pph = kali_basis(bruto, harian.basis);
        } else {
            hasil.metode = METODE_PASAL_17_HARIAN;
            match pasal_17(kali_basis(bruto, harian.basis_dasar_pasal_17), lapis) {
                Some(pph) => hasil.pph = pph,
                None => aktif.push("tarif_tidak_ada"),
            }
        }
    } else {
        let bruto_masa = m.bruto_masa_sebelum + bruto;
        hasil.bruto_masa = Some(bruto_masa);
        if status == STATUS_TETAP && masa_terakhir(&masa_run, m.keluar_pada.as_deref()) {
            // §6.3 (5): Pasal 17 setahun dikurangi yang sudah dipotong.
            let bruto_tahun = m.bruto_tahun_sebelum + bruto;
            let jumlah_masa = m.masa_berbruto_lain + i64::from(bruto_masa > 0);
            let biaya_jabatan = kali_basis(bruto_tahun, bawaan.biaya_jabatan.basis)
                .min(bawaan.biaya_jabatan.maks_per_masa * jumlah_masa);
            let iuran = m.iuran_pensiun_sebelum + m.iuran_pensiun_run;
            let ptkp = nilai_ptkp(&m.ptkp_status);
            let sisa = bruto_tahun - biaya_jabatan - iuran - ptkp;
            let pkp = if sisa > 0 {
                sisa / bawaan.pembulatan_pkp * bawaan.pembulatan_pkp
            } else {
                0
            };
            hasil.metode = METODE_PASAL_17_TERAKHIR;
            hasil.sudah_dipotong = m.pph_tahun_sebelum;
            hasil.bruto_tahun = Some(bruto_tahun);
            hasil.biaya_jabatan = Some(biaya_jabatan);
            hasil.iuran_pensiun = Some(iuran);
            hasil.ptkp = Some(ptkp);
            hasil.pkp = Some(pkp);
            match pasal_17(pkp, lapis) {
                Some(setahun) => {
                    hasil.pph_setahun = Some(setahun);
                    hasil.pph = setahun - m.pph_tahun_sebelum;
                }
                None => aktif.push("tarif_tidak_ada"),
            }
        } else {
            // §6.3 (4) dan (6): TER bulanan atas bruto sebulan.
            hasil.sudah_dipotong = m.pph_masa_sebelum;
            match tarif_ter(kategori, bruto_masa, lapis) {
                Some(basis) => {
                    let pph_masa = kali_basis(bruto_masa, basis);
                    hasil.tarif = Some(basis);
                    hasil.pph = (pph_masa - m.pph_masa_sebelum).max(0);
                    if m.pph_masa_sebelum > pph_masa {
                        aktif.push("lebih_potong_masa");
                    }
                }
                None => aktif.push("tarif_tidak_ada"),
            }
        }
    }

    for (nyala, tanda) in [
        (m.rumus_lama, "rumus_lama"),
        (m.status_pajak_berubah, "status_pajak_berubah"),
        (m.komponen_per_run, "komponen_per_run"),
    ] {
        if nyala {
            aktif.push(tanda);
        }
    }
    hasil.tanda = TANDA_PAJAK.iter().copied().filter(|t| aktif.contains(t)).collect();
    hasil
}

// BPJS satu item

/// Satu baris `breakdown_snapshot.bpjs`, bentuk sama dengan rumus lama.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct RincianBpjs {
    pub code: String,
    pub name: String,
    pub rate: f64,
    pub wage_cap: Option<i64>,
    pub nominal: i64,
    pub is_employee: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct HasilBpjs {
    pub karyawan: i64,
    pub perusahaan: i64,
    pub rincian: Vec<RincianBpjs>,
    pub dasar_run: i64,
    pub dasar_masa: i64,
    pub tanda: Vec<&'static str>,
}

/// §6.3 (2): iuran sebulan atas dasar masa yang dibatasi, dikurangi yang
/// sudah dipotong per kode di run pembanding, paling kecil 0.
pub fn hitung_bpjs_masa(
    dasar_run: i64,
    dasar_masa_sebelum: i64,
    aturan: &[BpjsRule],
    sudah: &BTreeMap<String, i64>,
) -> HasilBpjs {
    let dasar_masa = dasar_masa_sebelum + dasar_run;
    let mut hasil = HasilBpjs {
        karyawan: 0,
        perusahaan: 0,
        rincian: Vec::new(),
        dasar_run,
        dasar_masa,
        tanda: Vec::new(),
    };
    for rule in aturan {
        let basis = persen_ke_basis(rule.rate_percentage).unwrap_or_else(|| {
            if !hasil.tanda.contains(&TANDA_BPJS_TARIF_TIDAK_SAH) {
                hasil.tanda.push(TANDA_BPJS_TARIF_TIDAK_SAH);
            }
            0
        });
        let dasar = match rule.wage_cap {
            Some(batas) if batas > 0 => dasar_masa.min(batas),
            _ => dasar_masa,
        };
        let sebelumnya = sudah.get(&rule.component_code).copied().unwrap_or(0);
        let nominal = (kali_basis(dasar, basis) - sebelumnya).max(0);
        let is_employee = rule.component_code.ends_with("_EMP");
        if is_employee {
            hasil.karyawan += nominal;
        } else {
            hasil.perusahaan += nominal;
        }
        hasil.rincian.push(RincianBpjs {
            code: rule.component_code.clone(),
            name: rule.component_name.clone(),
            rate: rule.rate_percentage,
            wage_cap: rule.wage_cap,
            nominal,
            is_employee,
        });
    }
    hasil
}

// Run pembanding

/// Item setiap personil di run TAHUN itu sampai masa run ini, kecuali
/// `REJECTED` (Q-8; `DRAFT` ikut, preseden kasbon). Himpunan masa diambil
/// dari hasil yang sama (`masa` = bulan `period_start`, Q-1). ?1 =
/// `period_start` run yang dihitung; run itu sendiri belum tertulis.
/// Cermin `RUN_TAHUN_SQL` di `validations/pajak.ts`.
pub const RUN_TAHUN_SQL: &str = "SELECT pi.id_karyawan AS id_karyawan, substr(pr.period_start, 1, 7) AS masa, pi.gross_salary AS gross_salary, pi.overtime_salary AS overtime_salary, pi.pph21_amount AS pph21_amount, pi.breakdown_snapshot AS breakdown_snapshot FROM payroll_items pi JOIN payroll_runs pr ON pr.id = pi.payroll_run_id WHERE pr.status <> 'REJECTED' AND substr(pr.period_start, 1, 4) = substr(?1, 1, 4) AND substr(pr.period_start, 1, 7) <= substr(?1, 1, 7) ORDER BY pi.id_karyawan, pr.period_start, pr.id\n-- batas: item setahun sampai masa ini, dibatasi jumlah personil kali dua belas bulan\n;";

/// Kolom rekap untuk pajak, disisipkan ke SELECT rekap (`md` = `master_data`,
/// ?1/?2 = awal/akhir periode). PTKP awal tahun (Q-4): konfigurasi yang
/// berlaku 1 Januari, atau konfigurasi pertama tahun itu. Tanggal keluar hanya
/// bila personil sudah nonaktif. Cermin `KOLOM_PAJAK_SQL`.
pub const KOLOM_PAJAK_SQL: &str = "CASE WHEN COALESCE(md.status_aktif, 'Aktif') <> 'Aktif' THEN NULLIF(TRIM(COALESCE(md.tanggal_selesai_aktif, '')), '') END AS keluar_pada, COALESCE((SELECT s.ptkp_status FROM salary_configs s WHERE s.id_karyawan = md.id_unik AND s.effective_date <= substr(?1, 1, 4) || '-01-01' ORDER BY s.effective_date DESC LIMIT 1), (SELECT s.ptkp_status FROM salary_configs s WHERE s.id_karyawan = md.id_unik AND s.effective_date <= ?2 ORDER BY s.effective_date ASC LIMIT 1), 'TK/0') AS ptkp_awal_tahun";

/// Satu baris `RUN_TAHUN_SQL` untuk satu personil.
#[derive(Debug, Clone, Default, Deserialize)]
pub struct ItemPembanding {
    pub masa: String,
    pub gross_salary: i64,
    pub overtime_salary: i64,
    pub pph21_amount: i64,
    pub breakdown_snapshot: String,
}

/// Angka "sudah dipotong" untuk `hitung_pph` dan `hitung_bpjs_masa`.
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
pub struct Pembanding {
    pub bruto_masa: i64,
    pub pph_masa: i64,
    pub dasar_bpjs_masa: i64,
    pub bpjs_masa: BTreeMap<String, i64>,
    pub run_masa: i64,
    /// Hanya item berstatus tetap.
    pub bruto_tahun: i64,
    pub pph_tahun: i64,
    pub iuran_pensiun_tahun: i64,
    pub masa_berbruto_lain: i64,
    /// Item masa ini / tahun ini tanpa kunci `pajak` (dibuat rumus lama).
    pub rumus_lama_masa: bool,
    pub rumus_lama_tahun: bool,
    /// Ada item tahun ini yang status pajaknya berbeda dengan sekarang.
    pub status_berubah: bool,
}

/// Bruto pajak, status, dan dasar BPJS satu item. Item rumus lama (tanpa
/// `pajak`) dihitung ulang dengan cara yang sama: bruto + premi dari
/// `breakdown_snapshot.bpjs`, status tetap (rumus lama tidak mengenal status),
/// dasar BPJS = bruto tanpa lembur (dasar rumus lama).
fn baca_item(item: &ItemPembanding) -> (i64, &'static str, i64, Vec<(String, i64)>, bool) {
    let snapshot: serde_json::Value = serde_json::from_str(&item.breakdown_snapshot).unwrap_or_default();
    let rincian: Vec<(String, i64)> = snapshot["bpjs"]
        .as_array()
        .map(|daftar| {
            daftar
                .iter()
                .filter_map(|r| Some((r["code"].as_str()?.to_owned(), r["nominal"].as_i64()?)))
                .collect()
        })
        .unwrap_or_default();
    let dasar = snapshot["bpjs_masa"]["dasar_run"]
        .as_i64()
        .unwrap_or(item.gross_salary - item.overtime_salary);
    match snapshot["pajak"]["bruto_pajak"].as_i64() {
        Some(bruto) => {
            let status = status_kanonik(snapshot["pajak"]["status"].as_str().unwrap_or(STATUS_TETAP));
            (bruto, status, dasar, rincian, false)
        }
        None => {
            let premi = jumlah_kode(rincian.iter().map(|(c, n)| (c.as_str(), *n)), &KODE_PREMI);
            (item.gross_salary + premi, STATUS_TETAP, dasar, rincian, true)
        }
    }
}

/// Ringkasan run pembanding satu personil untuk run bermasa `masa_run` dan
/// berstatus `status`. Cermin `ringkasPembanding`.
pub fn ringkas_pembanding(items: &[ItemPembanding], masa_run: &str, status: &str) -> Pembanding {
    let mut hasil = Pembanding::default();
    let mut masa_lain: Vec<&str> = Vec::new();
    for item in items {
        let (bruto, status_item, dasar, rincian, lama) = baca_item(item);
        if item.masa == masa_run {
            hasil.bruto_masa += bruto;
            hasil.pph_masa += item.pph21_amount;
            hasil.dasar_bpjs_masa += dasar;
            for (kode, nominal) in &rincian {
                *hasil.bpjs_masa.entry(kode.clone()).or_insert(0) += nominal;
            }
            hasil.run_masa += 1;
            hasil.rumus_lama_masa |= lama;
        }
        hasil.rumus_lama_tahun |= lama;
        hasil.status_berubah |= status_item != status;
        if status_item == STATUS_TETAP {
            hasil.bruto_tahun += bruto;
            hasil.pph_tahun += item.pph21_amount;
            hasil.iuran_pensiun_tahun +=
                jumlah_kode(rincian.iter().map(|(c, n)| (c.as_str(), *n)), &KODE_IURAN_PENSIUN);
            if item.masa != masa_run && bruto > 0 && !masa_lain.contains(&item.masa.as_str()) {
                masa_lain.push(&item.masa);
            }
        }
    }
    hasil.masa_berbruto_lain = masa_lain.len() as i64;
    hasil
}

/// Jumlah nominal rincian BPJS berkode tertentu (`KODE_PREMI`,
/// `KODE_IURAN_PENSIUN`), juga untuk `breakdown_snapshot.bpjs` item lama.
pub fn jumlah_kode<'a>(rincian: impl IntoIterator<Item = (&'a str, i64)>, kode: &[&str]) -> i64 {
    rincian
        .into_iter()
        .filter(|(code, _)| kode.contains(code))
        .map(|(_, nominal)| nominal)
        .sum()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    fn vektor() -> Value {
        serde_json::from_str(include_str!("../../../../src/lib/validations/pajak.vektor.json")).expect("vektor")
    }

    /// Baris seed `tarif-payroll-bawaan.json`, tabel `nama`.
    fn seed(nama: &str) -> &'static [Vec<Value>] {
        &super::super::super::payroll_seed::tarif_bawaan()
            .tabel
            .iter()
            .find(|t| t.nama == nama)
            .expect("tabel seed")
            .baris
    }

    fn lapis() -> Vec<TaxRule> {
        seed("tax_rules")
            .iter()
            .map(|b| TaxRule {
                id: b[0].as_str().expect("id").to_owned(),
                category: b[1].as_str().expect("kategori").to_owned(),
                bracket_min: b[2].as_i64().expect("min"),
                bracket_max: b[3].as_i64(),
                rate_percentage: b[4].as_f64().expect("tarif"),
                effective_date: b[5].as_str().expect("tanggal").to_owned(),
            })
            .collect()
    }

    fn aturan_bpjs() -> Vec<BpjsRule> {
        seed("bpjs_rules")
            .iter()
            .map(|b| BpjsRule {
                id: b[0].as_str().expect("id").to_owned(),
                component_code: b[1].as_str().expect("kode").to_owned(),
                component_name: b[2].as_str().expect("nama").to_owned(),
                rate_percentage: b[3].as_f64().expect("tarif"),
                wage_cap: b[4].as_i64(),
                effective_date: b[5].as_str().expect("tanggal").to_owned(),
            })
            .collect()
    }

    #[test]
    fn pajak_persen_status_ptkp_bulan_penuh() {
        let v = vektor();
        for k in v["persen_ke_basis"].as_array().expect("persen") {
            assert_eq!(persen_ke_basis(k[0].as_f64().expect("persen")), k[1].as_i64(), "{k}");
        }
        for k in v["status"].as_array().expect("status") {
            let daftar = daftar_status_tidak_tetap(k[1].as_str());
            assert_eq!(status_pph(k[0].as_str().expect("status kepegawaian"), &daftar), k[2], "{k}");
        }
        for k in v["simpan_status"].as_array().expect("simpan status") {
            let daftar: Vec<String> = serde_json::from_value(k[0].clone()).expect("daftar");
            let hasil = validasi_status_tidak_tetap(&daftar);
            assert_eq!(hasil.as_ref().ok().map(String::as_str), k[1].as_str(), "{k}");
            assert_eq!(hasil.err().as_deref(), k[2].as_str(), "{k}");
        }
        for k in v["ptkp"].as_array().expect("ptkp") {
            let status = k[0].as_str().expect("ptkp");
            assert_eq!(
                (kategori_ter(status), nilai_ptkp(status)),
                (k[1].as_str().expect("kategori"), k[2].as_i64().expect("nilai")),
                "{k}"
            );
        }
        for k in v["bulan_penuh"].as_array().expect("bulan penuh") {
            assert_eq!(bulan_penuh(k[0].as_str().expect("awal"), k[1].as_str().expect("akhir")), k[2], "{k}");
        }
    }

    /// Penggabungan dangkal kasus di atas `bawaan`, sama dengan spread di TS.
    fn gabung(bawaan: &Value, kasus: &Value) -> Value {
        let mut hasil = bawaan.clone();
        if let (Some(tujuan), Some(isi)) = (hasil.as_object_mut(), kasus.as_object()) {
            for (kunci, nilai) in isi {
                tujuan.insert(kunci.clone(), nilai.clone());
            }
        }
        hasil
    }

    #[test]
    fn pajak_vektor_pph() {
        let lapis = lapis();
        let v = vektor();
        for k in v["pph"].as_array().expect("pph") {
            let masukan: MasukanPph =
                serde_json::from_value(gabung(&v["bawaan"]["masukan"], &k["masukan"])).expect("masukan");
            let dipakai: &[TaxRule] = if k["lapis_kosong"] == true { &[] } else { &lapis };
            let hasil = serde_json::to_value(hitung_pph(&masukan, dipakai)).expect("hasil");
            assert_eq!(hasil, gabung(&v["bawaan"]["harapan"], &k["harapan"]), "{}", k["nama"]);
        }
    }

    #[test]
    fn pajak_vektor_bpjs() {
        let aturan = aturan_bpjs();
        for k in vektor()["bpjs"].as_array().expect("bpjs") {
            let sudah: BTreeMap<String, i64> = serde_json::from_value(k["masukan"]["sudah"].clone()).expect("sudah");
            let hasil = hitung_bpjs_masa(
                k["masukan"]["dasar_run"].as_i64().expect("dasar run"),
                k["masukan"]["dasar_masa_sebelum"].as_i64().expect("dasar sebelum"),
                &aturan,
                &sudah,
            );
            let nominal: BTreeMap<String, i64> = hasil.rincian.iter().map(|r| (r.code.clone(), r.nominal)).collect();
            let ringkas = serde_json::json!({
                "karyawan": hasil.karyawan,
                "perusahaan": hasil.perusahaan,
                "dasar_masa": hasil.dasar_masa,
                "nominal": nominal,
                "premi": jumlah_kode(hasil.rincian.iter().map(|r| (r.code.as_str(), r.nominal)), &KODE_PREMI),
                "iuran_pensiun": jumlah_kode(hasil.rincian.iter().map(|r| (r.code.as_str(), r.nominal)), &KODE_IURAN_PENSIUN),
                "tanda": hasil.tanda,
            });
            assert_eq!(ringkas, k["harapan"], "{}", k["nama"]);
        }
    }

    #[test]
    fn pajak_vektor_pembanding() {
        for k in vektor()["pembanding"].as_array().expect("pembanding") {
            let items: Vec<ItemPembanding> = serde_json::from_value(k["items"].clone()).expect("items");
            let hasil = ringkas_pembanding(
                &items,
                k["masa"].as_str().expect("masa"),
                k["status"].as_str().expect("status"),
            );
            assert_eq!(serde_json::to_value(hasil).expect("hasil"), k["harapan"], "{}", k["nama"]);
        }
    }

    /// Teks konstanta yang dieja kembar di TS diperiksa `pajak.test.ts`;
    /// di sini cukup memastikan pembulatan Decimal tidak lewat f64.
    #[test]
    fn pajak_kali_basis_titik_tengah() {
        assert_eq!(kali_basis(1, 5_000), 1);
        assert_eq!(kali_basis(-1, 5_000), -1);
        assert_eq!(kali_basis(65_605_059, 2_100), 13_777_062);
        assert_eq!(kali_basis(9_007_199_254_740_993, 1), 900_719_925_474);
    }
}
