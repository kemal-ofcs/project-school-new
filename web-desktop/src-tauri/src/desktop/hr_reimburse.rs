//! HRIS Fase 8 (`prd-hris/fase-8.md` §26.2.3): reimbursement.
//!
//! Keenam tabel `hr_reimburse*` KHUSUS CLOUD (Q-160): dibaca dan ditulis lewat
//! `TursoClient`, tanpa SQLite perangkat, snapshot, atau outbox. Tanpa koneksi,
//! command mengembalikan `hris_cloud::PESAN_LURING`. Klaim tidak pernah
//! diubah; keputusan dan pembayaran append-only; status klaim dan status bayar
//! diturunkan, tidak disimpan. Dibayar terpisah dari slip gaji (Q-161).
//!
//! Kembaran TS: aturan dan SQL di `src/lib/validations/hr-reimburse.ts`,
//! penulisan di `src/lib/services/hr-reimburse.ts`. Vektornya
//! `validations/hr-reimburse.vektor.json`; teks SQL dan pesan dibandingkan
//! harfiah oleh `hr-reimburse.test.ts`.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use super::hari_kerja::tanggal_valid;
use super::hr_pengajuan::{dalam_cakupan, sama_orang, UNIT_PERSONIL_SQL};
use super::hr_rekrutmen::{angka, baris, galat, hari_ini, id_wajib, satu, teks, tulis};
use super::hris::new_id;
use super::hris_cloud::urai_berkas_dokumen;
use super::inventory::payload_text;
use super::models::{CommandError, OperatorUser};
use super::turso::{Statement, TursoClient};

/// Berid tetap dan `INSERT OR IGNORE`: jenis yang sudah disunting tidak
/// ditimpa. Kembar harfiah `SEED_JENIS_REIMBURSE_SQL` di TS.
pub const SEED_JENIS_REIMBURSE_SQL: &str = "INSERT OR IGNORE INTO hr_reimburse_jenis (id_jenis, nama, wajib_nota) VALUES ('rmj-transport', 'Transport', 0), ('rmj-kesehatan', 'Kesehatan', 1), ('rmj-konsumsi', 'Konsumsi', 1), ('rmj-dinas', 'Dinas', 1), ('rmj-lainnya', 'Lainnya', 1);";

// Aturan murni (§26.2.3)

/// WAJIB sama dengan CHECK `hr_reimburse_keputusan.aksi`.
pub const AKSI_KEPUTUSAN: [&str; 3] = ["Setujui", "Tolak", "Batal"];
pub const MAKS_NOMINAL_REIMBURSE: i64 = 1_000_000_000;
pub const MAKS_NAMA_JENIS_REIMBURSE: usize = 100;
pub const MAKS_KEPERLUAN: usize = 1000;
pub const MAKS_ALASAN_REIMBURSE: usize = 1000;
pub const MAKS_KETERANGAN_BAYAR: usize = 500;
pub const MAKS_KLAIM_BAYAR: usize = 100;
/// Pemegang salah satunya membaca semua klaim; pemegang
/// `hr.reimburse.submit` saja hanya klaim yang ia ajukan.
pub const IZIN_LIHAT_REIMBURSE: [&str; 3] = ["hr.reimburse.view", "hr.reimburse.decide", "hr.reimburse.pay"];

pub const PESAN_KLAIM_TIDAK_ADA: &str = "Klaim tidak ditemukan.";
pub const PESAN_KLAIM_DITOLAK_SIMPAN: &str =
    "Klaim tidak tersimpan: pegawai belum ada di database pusat, atau jenisnya tidak aktif.";
pub const PESAN_KLAIM_TERKUNCI: &str = "Klaim ini sudah diputus. Batalkan lalu ajukan ulang bila perlu dikoreksi.";
pub const PESAN_KLAIM_SELESAI: &str = "Klaim ini sudah ditolak atau dibatalkan.";
pub const PESAN_BATAL_TERBAYAR: &str = "Klaim ini sudah dibayar. Batalkan pembayarannya dulu.";
pub const PESAN_DIRI_SENDIRI_REIMBURSE: &str = "Klaim atas diri sendiri tidak bisa Anda putus.";
pub const PESAN_DI_LUAR_CAKUPAN_REIMBURSE: &str = "Klaim ini di luar unit Anda.";
pub const PESAN_BUTUH_PEMUTUS: &str = "Hanya pemutus reimbursement yang bisa melakukan ini.";
pub const PESAN_KLAIM_BERUBAH: &str = "Klaim berubah sejak dimuat. Muat ulang lalu coba lagi.";
pub const PESAN_NOTA_TERKUNCI: &str = "Nota tidak bisa diubah sesudah klaim diputus.";
pub const PESAN_NOTA_PENUH: &str = "Klaim ini sudah berisi 5 nota.";
pub const PESAN_NOTA_DITOLAK: &str = "Nota hanya bisa diubah oleh yang mengajukan klaim.";
pub const PESAN_JENIS_GANDA: &str = "Nama jenis reimbursement sudah dipakai jenis aktif lain.";
pub const PESAN_BAYAR_KOSONG: &str = "Pilih minimal satu klaim.";
pub const PESAN_BAYAR_TIDAK_SAH: &str =
    "Hanya klaim Disetujui yang belum dibayar milik pegawai yang sama yang bisa dibayar.";
pub const PESAN_BAYAR_TIDAK_ADA: &str = "Pembayaran tidak ditemukan.";
pub const PESAN_BAYAR_SUDAH_BATAL: &str = "Pembayaran ini sudah dibatalkan.";

fn panjang(t: &str) -> usize {
    t.chars().count()
}

fn teks_opsional(draft: &Value, kunci: &str, label: &str, maks: usize) -> Result<Option<String>, String> {
    match payload_text(draft, kunci) {
        Some(t) if panjang(&t) > maks => Err(format!("{label} maksimal {maks} karakter.")),
        lain => Ok(lain),
    }
}

/// `Ok(None)` = kosong; `Err(())` = bukan bilangan bulat dalam rentang.
fn bulat(draft: &Value, kunci: &str, min: i64, maks: i64) -> Result<Option<i64>, ()> {
    match draft.get(kunci) {
        None | Some(Value::Null) => Ok(None),
        Some(n) => n.as_i64().filter(|n| (min..=maks).contains(n)).map(Some).ok_or(()),
    }
}

fn benar(draft: &Value, kunci: &str, bawaan: bool) -> bool {
    draft.get(kunci).and_then(Value::as_bool).unwrap_or(bawaan)
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct JenisSah {
    pub id_jenis: Option<String>,
    pub nama: String,
    pub wajib_nota: bool,
    pub batas_bulanan: Option<i64>,
    pub is_aktif: bool,
}

/// Cermin `validasiJenis`. Batas bulanan hanya memberi tanda.
pub fn validasi_jenis(draft: &Value) -> Result<JenisSah, String> {
    let nama = teks_opsional(draft, "nama", "Nama jenis", MAKS_NAMA_JENIS_REIMBURSE)?
        .ok_or("Nama jenis wajib diisi.")?;
    let batas_bulanan = bulat(draft, "batas_bulanan", 1, MAKS_NOMINAL_REIMBURSE)
        .map_err(|()| "Batas bulanan harus bilangan bulat 1 sampai 1000000000.")?;
    Ok(JenisSah {
        id_jenis: payload_text(draft, "id_jenis"),
        nama,
        wajib_nota: benar(draft, "wajib_nota", false),
        batas_bulanan,
        is_aktif: benar(draft, "is_aktif", true),
    })
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct KlaimSah {
    pub id_karyawan: String,
    pub id_jenis: String,
    pub tanggal: String,
    pub nominal: i64,
    pub keperluan: String,
}

/// Cermin `validasiKlaim`: tanggal biaya tidak lewat hari ini WIB.
pub fn validasi_klaim(draft: &Value, hari_ini: &str) -> Result<KlaimSah, String> {
    let id_karyawan = payload_text(draft, "id_karyawan").ok_or("Pegawai wajib dipilih.")?;
    let id_jenis = payload_text(draft, "id_jenis").ok_or("Jenis reimbursement wajib dipilih.")?;
    let tanggal = payload_text(draft, "tanggal")
        .filter(|t| tanggal_valid(t))
        .ok_or("Tanggal biaya tidak valid.")?;
    if tanggal.as_str() > hari_ini {
        return Err("Tanggal biaya tidak boleh sesudah hari ini.".into());
    }
    let nominal = bulat(draft, "nominal", 1, MAKS_NOMINAL_REIMBURSE)
        .ok()
        .flatten()
        .ok_or("Nominal harus bilangan bulat 1 sampai 1000000000.")?;
    let keperluan = teks_opsional(draft, "keperluan", "Keperluan", MAKS_KEPERLUAN)?.ok_or("Keperluan wajib diisi.")?;
    Ok(KlaimSah { id_karyawan, id_jenis, tanggal, nominal, keperluan })
}

/// Cermin `statusKlaim`. Klaim terkunci sesudah keputusan pertama (Q-162),
/// jadi urutan yang mungkin hanya Setujui/Tolak lalu Batal, atau Batal saja;
/// Batal selalu menang supaya urutan baris tidak menentukan.
pub fn status_klaim(aksi: &[String]) -> &'static str {
    let ada = |a: &str| aksi.iter().any(|x| x == a);
    if ada("Batal") {
        "Dibatalkan"
    } else if ada("Setujui") {
        "Disetujui"
    } else if ada("Tolak") {
        "Ditolak"
    } else {
        "Menunggu"
    }
}

/// Cermin `statusBayar`: jumlah pembayaran aktif yang memuat klaim itu.
pub fn status_bayar(jumlah_aktif: i64) -> &'static str {
    if jumlah_aktif > 0 {
        "Dibayar"
    } else {
        "Belum dibayar"
    }
}

/// Keadaan klaim dan wewenang SESI saat memutus.
#[derive(Debug, Clone, Deserialize)]
pub struct KeadaanKeputusan {
    pub status: String,
    pub dibayar: bool,
    pub nominal: i64,
    /// Sesi memegang `hr.reimburse.decide`.
    pub boleh_putus: bool,
    /// Klaim atas personil yang tertaut ke sesi (A-2).
    pub sendiri: bool,
    pub dalam_cakupan: bool,
    /// Sesi adalah akun yang mencatat klaim (`diajukan_oleh`).
    pub pengaju_sendiri: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct KeputusanSah {
    pub aksi: String,
    pub nominal_disetujui: Option<i64>,
    pub alasan: Option<String>,
}

/// Cermin `pemutusSah`: pemegang izin, bukan diri sendiri, dalam cakupan.
pub fn pemutus_sah(k: &KeadaanKeputusan) -> bool {
    k.boleh_putus && !k.sendiri && k.dalam_cakupan
}

/// Cermin `periksaKeputusan` (§26.2.3). Pengaju boleh membatalkan klaim yang
/// belum diputus tanpa izin memutus; selebihnya wewenang pemutus dari sesi.
pub fn periksa_keputusan(draft: &Value, k: &KeadaanKeputusan) -> Result<KeputusanSah, String> {
    let aksi = payload_text(draft, "aksi")
        .filter(|a| AKSI_KEPUTUSAN.contains(&a.as_str()))
        .ok_or("Aksi keputusan harus Setujui, Tolak, atau Batal.")?;
    let alasan = teks_opsional(draft, "alasan", "Alasan", MAKS_ALASAN_REIMBURSE)?;
    let batal_pengaju = aksi == "Batal" && k.pengaju_sendiri && k.status == "Menunggu";
    if !batal_pengaju {
        if !k.boleh_putus {
            return Err(PESAN_BUTUH_PEMUTUS.into());
        }
        if k.sendiri {
            return Err(PESAN_DIRI_SENDIRI_REIMBURSE.into());
        }
        if !k.dalam_cakupan {
            return Err(PESAN_DI_LUAR_CAKUPAN_REIMBURSE.into());
        }
    }
    match aksi.as_str() {
        "Setujui" | "Tolak" if k.status != "Menunggu" => return Err(PESAN_KLAIM_TERKUNCI.into()),
        "Batal" if k.status == "Ditolak" || k.status == "Dibatalkan" => return Err(PESAN_KLAIM_SELESAI.into()),
        "Batal" if k.dibayar => return Err(PESAN_BATAL_TERBAYAR.into()),
        _ => {}
    }
    let nominal_disetujui = match aksi.as_str() {
        "Setujui" => {
            let n = bulat(draft, "nominal_disetujui", 1, k.nominal)
                .map_err(|()| format!("Nominal disetujui harus 1 sampai {}.", k.nominal))?
                .unwrap_or(k.nominal);
            if n < k.nominal && alasan.is_none() {
                return Err("Nominal disetujui lebih kecil dari pengajuan; alasannya wajib diisi.".into());
            }
            Some(n)
        }
        "Tolak" if alasan.is_none() => return Err("Alasan penolakan wajib diisi.".into()),
        "Batal" if alasan.is_none() => return Err("Alasan pembatalan wajib diisi.".into()),
        _ => None,
    };
    Ok(KeputusanSah { aksi, nominal_disetujui, alasan })
}

/// Cermin `lewatBatas`: batas bulanan hanya tanda, tidak pernah menolak.
pub fn lewat_batas(batas_bulanan: Option<i64>, total: i64) -> bool {
    batas_bulanan.is_some_and(|b| total > b)
}

/// Bahan `tanda_klaim`, satu klaim yang sudah dirapikan.
#[derive(Debug, Clone, Deserialize)]
pub struct KlaimTanda {
    pub id_karyawan: String,
    pub id_jenis: String,
    pub tanggal: String,
    pub status: String,
    pub nominal: i64,
    pub nominal_disetujui: Option<i64>,
    pub wajib_nota: bool,
    pub batas_bulanan: Option<i64>,
    pub jumlah_nota: i64,
    pub jumlah_bayar: i64,
}

fn masih_dihitung(k: &KlaimTanda) -> bool {
    k.status == "Menunggu" || k.status == "Disetujui"
}

fn bulan_dari(tanggal: &str) -> String {
    tanggal.chars().take(7).collect()
}

/// Cermin `tandaKlaim`: `tanpa_nota`, `lewat_batas` (Σ klaim Menunggu +
/// Disetujui per pegawai, jenis, dan bulan; Disetujui memakai nominal
/// disetujui), `dibayar_ganda`. Tanda tidak pernah menolak.
pub fn tanda_klaim(daftar: &[KlaimTanda]) -> Vec<Vec<&'static str>> {
    let nilai = |k: &KlaimTanda| match k.status.as_str() {
        "Disetujui" => k.nominal_disetujui.unwrap_or(k.nominal),
        _ => k.nominal,
    };
    daftar
        .iter()
        .map(|k| {
            let mut tanda = Vec::new();
            if k.wajib_nota && k.jumlah_nota == 0 {
                tanda.push("tanpa_nota");
            }
            if masih_dihitung(k) {
                let bulan = bulan_dari(&k.tanggal);
                let total: i64 = daftar
                    .iter()
                    .filter(|x| {
                        masih_dihitung(x)
                            && x.id_karyawan == k.id_karyawan
                            && x.id_jenis == k.id_jenis
                            && bulan_dari(&x.tanggal) == bulan
                    })
                    .map(nilai)
                    .sum();
                if lewat_batas(k.batas_bulanan, total) {
                    tanda.push("lewat_batas");
                }
            }
            if k.jumlah_bayar > 1 {
                tanda.push("dibayar_ganda");
            }
            tanda
        })
        .collect()
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct BayarSah {
    pub id_karyawan: String,
    pub id_klaim: Vec<String>,
    pub tanggal: String,
    pub keterangan: Option<String>,
}

/// Cermin `validasiBayar`: tanggal kosong = hari ini WIB, tidak boleh sesudahnya.
pub fn validasi_bayar(draft: &Value, hari_ini: &str) -> Result<BayarSah, String> {
    let id_karyawan = payload_text(draft, "id_karyawan").ok_or("Pegawai wajib dipilih.")?;
    let id_klaim = draft
        .get("id_klaim")
        .and_then(Value::as_array)
        .map(|daftar| {
            daftar
                .iter()
                .filter_map(Value::as_str)
                .map(str::trim)
                .filter(|t| !t.is_empty())
                .map(str::to_owned)
                .collect()
        })
        .unwrap_or_default();
    let tanggal = match payload_text(draft, "tanggal") {
        None => hari_ini.to_owned(),
        Some(t) if !tanggal_valid(&t) => return Err("Tanggal bayar tidak valid.".into()),
        Some(t) if t.as_str() > hari_ini => return Err("Tanggal bayar tidak boleh sesudah hari ini.".into()),
        Some(t) => t,
    };
    let keterangan = teks_opsional(draft, "keterangan", "Keterangan", MAKS_KETERANGAN_BAYAR)?;
    Ok(BayarSah { id_karyawan, id_klaim, tanggal, keterangan })
}

/// Bahan `periksa_bayar`, satu klaim yang sudah dirapikan.
#[derive(Debug, Clone, Deserialize)]
pub struct KlaimBayar {
    pub id_klaim: String,
    pub id_karyawan: String,
    pub status: String,
    pub nominal_disetujui: Option<i64>,
    pub jumlah_bayar: i64,
}

/// Cermin `periksaBayar`: total = Σ nominal disetujui klaim terpilih, tidak
/// pernah dari isian.
pub fn periksa_bayar(id_karyawan: &str, id_klaim: &[String], klaim: &[KlaimBayar]) -> Result<i64, String> {
    if id_klaim.is_empty() {
        return Err(PESAN_BAYAR_KOSONG.into());
    }
    if id_klaim.len() > MAKS_KLAIM_BAYAR {
        return Err(format!("Satu pembayaran maksimal {MAKS_KLAIM_BAYAR} klaim."));
    }
    let mut total = 0;
    for (i, id) in id_klaim.iter().enumerate() {
        if id_klaim[..i].contains(id) {
            return Err("Klaim yang sama dipilih dua kali.".into());
        }
        let k = klaim
            .iter()
            .find(|k| &k.id_klaim == id)
            .filter(|k| k.id_karyawan == id_karyawan && k.status == "Disetujui" && k.jumlah_bayar == 0)
            .ok_or(PESAN_BAYAR_TIDAK_SAH)?;
        total += k.nominal_disetujui.unwrap_or(0);
    }
    Ok(total)
}

/// Cermin `periksaBatalBayar`. Pembatalan berid `batal-<id_bayar>`.
pub fn periksa_batal_bayar(jenis: &str, sudah_dibatalkan: bool, alasan: Option<&str>) -> Result<(), String> {
    if jenis != "Bayar" {
        return Err(PESAN_BAYAR_TIDAK_ADA.into());
    }
    if sudah_dibatalkan {
        return Err(PESAN_BAYAR_SUDAH_BATAL.into());
    }
    if alasan.is_none() {
        return Err("Alasan pembatalan wajib diisi.".into());
    }
    Ok(())
}

// SQL kembar (§26.3). Diperiksa harfiah oleh `hr-reimburse.test.ts`.

/// Predikat pembayaran aktif atas alias `b`: baris `Bayar` tanpa pembatalan.
/// Disalin harfiah ke setiap SQL yang menilai "sudah dibayar"; hanya tes yang
/// membacanya.
#[cfg_attr(not(test), allow(dead_code))]
pub const BAYAR_AKTIF_SQL: &str = "b.jenis = 'Bayar' AND NOT EXISTS (SELECT 1 FROM hr_reimburse_bayar x WHERE x.jenis = 'Pembatalan' AND x.id_ref = b.id_bayar)";

pub const JENIS_REIMBURSE_SQL: &str = "SELECT id_jenis, nama, wajib_nota, batas_bulanan, is_aktif, COALESCE(diubah_oleh, '') AS diubah_oleh, updated_at FROM hr_reimburse_jenis ORDER BY is_aktif DESC, nama, id_jenis\n-- batas: jenis reimbursement, tidak tumbuh per hari\n;";
pub const SIMPAN_JENIS_REIMBURSE_SQL: &str = "INSERT INTO hr_reimburse_jenis (id_jenis, nama, wajib_nota, batas_bulanan, is_aktif, diubah_oleh, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'), datetime('now')) ON CONFLICT(id_jenis) DO UPDATE SET nama = excluded.nama, wajib_nota = excluded.wajib_nota, batas_bulanan = excluded.batas_bulanan, is_aktif = excluded.is_aktif, diubah_oleh = excluded.diubah_oleh, updated_at = excluded.updated_at;";
pub const BENTROK_JENIS_REIMBURSE_SQL: &str = "SELECT 1 AS ada FROM hr_reimburse_jenis WHERE id_jenis <> ?2 AND is_aktif = 1 AND lower(trim(nama)) = lower(trim(?1)) LIMIT 1;";

/// ?1 bulan `YYYY-MM`, ?2 pegawai (riwayat), ?3 satu klaim. `aksi` =
/// keputusan dipisah koma, bahan `status_klaim`.
pub const KLAIM_SQL: &str = "SELECT r.id_klaim, r.id_karyawan, COALESCE(m.nama, r.id_karyawan) AS nama, COALESCE(m.unit, '') AS unit, r.id_jenis, COALESCE(j.nama, r.id_jenis) AS jenis, COALESCE(j.wajib_nota, 0) AS wajib_nota, j.batas_bulanan, r.tanggal, r.nominal, r.keperluan, r.diajukan_oleh, r.created_at, COALESCE((SELECT group_concat(k.aksi, ',') FROM hr_reimburse_keputusan k WHERE k.id_klaim = r.id_klaim), '') AS aksi, (SELECT k.nominal_disetujui FROM hr_reimburse_keputusan k WHERE k.id_klaim = r.id_klaim AND k.aksi = 'Setujui' LIMIT 1) AS nominal_disetujui, (SELECT COUNT(*) FROM hr_reimburse_berkas f WHERE f.id_klaim = r.id_klaim) AS jumlah_nota, (SELECT COUNT(*) FROM hr_reimburse_bayar_baris bb JOIN hr_reimburse_bayar b ON b.id_bayar = bb.id_bayar WHERE bb.id_klaim = r.id_klaim AND b.jenis = 'Bayar' AND NOT EXISTS (SELECT 1 FROM hr_reimburse_bayar x WHERE x.jenis = 'Pembatalan' AND x.id_ref = b.id_bayar)) AS jumlah_bayar FROM hr_reimburse r LEFT JOIN master_data m ON m.id_unik = r.id_karyawan LEFT JOIN hr_reimburse_jenis j ON j.id_jenis = r.id_jenis WHERE substr(r.tanggal, 1, 7) = ?1 OR r.id_karyawan = ?2 OR r.id_klaim = ?3 ORDER BY r.tanggal DESC, r.created_at DESC, r.id_klaim\n-- batas: klaim satu bulan, atau riwayat klaim satu pegawai\n;";
/// Hanya pegawai (`PEGAWAI_SQL`), termasuk yang sudah keluar, dan jenis aktif.
pub const SIMPAN_KLAIM_SQL: &str = "INSERT INTO hr_reimburse (id_klaim, id_karyawan, id_jenis, tanggal, nominal, keperluan, diajukan_oleh, created_at) SELECT ?1, m.id_unik, ?3, ?4, ?5, ?6, ?7, datetime('now') FROM master_data m WHERE m.id_unik = ?2 AND LOWER(TRIM(COALESCE(m.jenis_personil, ''))) <> 'siswa' AND NOT EXISTS (SELECT 1 FROM siswa_data sd WHERE sd.id_siswa = m.id_unik) AND EXISTS (SELECT 1 FROM hr_reimburse_jenis j WHERE j.id_jenis = ?3 AND j.is_aktif = 1);";
pub const KEPUTUSAN_SQL: &str = "SELECT id_keputusan, aksi, nominal_disetujui, COALESCE(alasan, '') AS alasan, diputus_oleh, created_at FROM hr_reimburse_keputusan WHERE id_klaim = ?1 ORDER BY created_at, id_keputusan\n-- batas: keputusan satu klaim, paling banyak dua\n;";
/// Penjaga di statement yang sama (Q-162): Setujui/Tolak hanya selama belum
/// ada keputusan; Batal hanya bila belum ditolak/dibatalkan dan tidak ada
/// pembayaran aktif; ?7 = 1 (pengaju tanpa izin memutus) menuntut belum ada
/// keputusan sama sekali.
pub const PUTUS_KLAIM_SQL: &str = "INSERT INTO hr_reimburse_keputusan (id_keputusan, id_klaim, aksi, nominal_disetujui, alasan, diputus_oleh, created_at) SELECT ?1, r.id_klaim, ?3, ?4, ?5, ?6, datetime('now') FROM hr_reimburse r WHERE r.id_klaim = ?2 AND (?7 = 0 OR NOT EXISTS (SELECT 1 FROM hr_reimburse_keputusan k WHERE k.id_klaim = r.id_klaim)) AND ((?3 IN ('Setujui', 'Tolak') AND NOT EXISTS (SELECT 1 FROM hr_reimburse_keputusan k WHERE k.id_klaim = r.id_klaim)) OR (?3 = 'Batal' AND NOT EXISTS (SELECT 1 FROM hr_reimburse_keputusan k WHERE k.id_klaim = r.id_klaim AND k.aksi IN ('Tolak', 'Batal')) AND NOT EXISTS (SELECT 1 FROM hr_reimburse_bayar_baris bb JOIN hr_reimburse_bayar b ON b.id_bayar = bb.id_bayar WHERE bb.id_klaim = r.id_klaim AND b.jenis = 'Bayar' AND NOT EXISTS (SELECT 1 FROM hr_reimburse_bayar x WHERE x.jenis = 'Pembatalan' AND x.id_ref = b.id_bayar))));";

/// Daftar nota tanpa isinya.
pub const NOTA_SQL: &str = "SELECT id_berkas, urutan, COALESCE(nama_berkas, '') AS nama_berkas, mime_type, (length(data_base64) / 4) * 3 - (CASE WHEN data_base64 LIKE '%==' THEN 2 WHEN data_base64 LIKE '%=' THEN 1 ELSE 0 END) AS ukuran_byte, COALESCE(diunggah_oleh, '') AS diunggah_oleh, created_at FROM hr_reimburse_berkas WHERE id_klaim = ?1 ORDER BY urutan\n-- batas: nota satu klaim, maksimal 5\n;";
pub const AMBIL_NOTA_SQL: &str = "SELECT f.id_berkas, f.id_klaim, COALESCE(f.nama_berkas, '') AS nama_berkas, f.mime_type, f.data_base64, r.diajukan_oleh FROM hr_reimburse_berkas f JOIN hr_reimburse r ON r.id_klaim = f.id_klaim WHERE f.id_berkas = ?1 LIMIT 1;";
pub const PEMILIK_NOTA_SQL: &str = "SELECT f.id_klaim, r.diajukan_oleh FROM hr_reimburse_berkas f JOIN hr_reimburse r ON r.id_klaim = f.id_klaim WHERE f.id_berkas = ?1 LIMIT 1;";
/// Slot 1–5 seperti lampiran pengajuan; terkunci sesudah keputusan pertama.
pub const TAMBAH_NOTA_SQL: &str = "WITH slot(n) AS (VALUES (1), (2), (3), (4), (5)) INSERT INTO hr_reimburse_berkas (id_berkas, id_klaim, urutan, nama_berkas, mime_type, data_base64, diunggah_oleh, created_at) SELECT ?1, ?2, slot.n, ?3, ?4, ?5, ?6, datetime('now') FROM slot WHERE slot.n NOT IN (SELECT urutan FROM hr_reimburse_berkas WHERE id_klaim = ?2) AND EXISTS (SELECT 1 FROM hr_reimburse WHERE id_klaim = ?2) AND NOT EXISTS (SELECT 1 FROM hr_reimburse_keputusan WHERE id_klaim = ?2) ORDER BY slot.n LIMIT 1;";
pub const HAPUS_NOTA_SQL: &str = "DELETE FROM hr_reimburse_berkas WHERE id_berkas = ?1 AND NOT EXISTS (SELECT 1 FROM hr_reimburse_keputusan k WHERE k.id_klaim = hr_reimburse_berkas.id_klaim);";

/// ?1 pegawai, ?2 satu pembayaran. `klaim` = id klaim dipisah koma.
pub const PEMBAYARAN_SQL: &str = "SELECT b.id_bayar, b.jenis, COALESCE(b.id_ref, '') AS id_ref, b.id_karyawan, b.tanggal, b.total, COALESCE(b.keterangan, '') AS keterangan, b.dicatat_oleh, b.created_at, COALESCE((SELECT group_concat(bb.id_klaim, ',') FROM hr_reimburse_bayar_baris bb WHERE bb.id_bayar = b.id_bayar), '') AS klaim, EXISTS (SELECT 1 FROM hr_reimburse_bayar x WHERE x.jenis = 'Pembatalan' AND x.id_ref = b.id_bayar) AS dibatalkan FROM hr_reimburse_bayar b WHERE b.id_karyawan = ?1 OR b.id_bayar = ?2 ORDER BY b.tanggal DESC, b.created_at DESC, b.id_bayar\n-- batas: pembayaran reimbursement satu pegawai\n;";
/// Kepala pembayaran; ?7 = larik JSON id klaim. Ditulis hanya bila SETIAP
/// klaim milik pegawai ?2, Disetujui, tidak dibatalkan, dan tanpa pembayaran
/// aktif, dinilai di transaksi yang sama.
pub const BAYAR_SQL: &str = "INSERT INTO hr_reimburse_bayar (id_bayar, jenis, id_ref, id_karyawan, tanggal, total, keterangan, dicatat_oleh, created_at) SELECT ?1, 'Bayar', NULL, ?2, ?3, ?4, ?5, ?6, datetime('now') WHERE NOT EXISTS (SELECT 1 FROM json_each(?7) d WHERE NOT EXISTS (SELECT 1 FROM hr_reimburse r JOIN hr_reimburse_keputusan k ON k.id_klaim = r.id_klaim AND k.aksi = 'Setujui' WHERE r.id_klaim = d.value AND r.id_karyawan = ?2 AND NOT EXISTS (SELECT 1 FROM hr_reimburse_keputusan y WHERE y.id_klaim = r.id_klaim AND y.aksi = 'Batal') AND NOT EXISTS (SELECT 1 FROM hr_reimburse_bayar_baris bb JOIN hr_reimburse_bayar b ON b.id_bayar = bb.id_bayar WHERE bb.id_klaim = r.id_klaim AND b.jenis = 'Bayar' AND NOT EXISTS (SELECT 1 FROM hr_reimburse_bayar x WHERE x.jenis = 'Pembatalan' AND x.id_ref = b.id_bayar))));";
/// Baris pembayaran; nominal disalin dari keputusan Setujui saat dicatat.
pub const BAYAR_BARIS_SQL: &str = "INSERT INTO hr_reimburse_bayar_baris (id_baris, id_bayar, id_klaim, nominal) SELECT ?1 || ':' || k.id_klaim, ?1, k.id_klaim, k.nominal_disetujui FROM hr_reimburse_keputusan k JOIN json_each(?2) d ON d.value = k.id_klaim WHERE k.aksi = 'Setujui' AND EXISTS (SELECT 1 FROM hr_reimburse_bayar b WHERE b.id_bayar = ?1);";
/// Append-only: pembatalan berid `batal-<id>`, PK menahan pembatalan ganda.
pub const BATAL_BAYAR_SQL: &str = "INSERT INTO hr_reimburse_bayar (id_bayar, jenis, id_ref, id_karyawan, tanggal, total, keterangan, dicatat_oleh, created_at) SELECT 'batal-' || b.id_bayar, 'Pembatalan', b.id_bayar, b.id_karyawan, ?2, b.total, ?3, ?4, datetime('now') FROM hr_reimburse_bayar b WHERE b.id_bayar = ?1 AND b.jenis = 'Bayar' AND NOT EXISTS (SELECT 1 FROM hr_reimburse_bayar x WHERE x.id_bayar = 'batal-' || b.id_bayar);";

// Jurnal otomatis pembayaran reimbursement (v75, membalik Q-163). Ditulis di
// cloud dalam batch yang SAMA dengan `BAYAR_SQL`/`BATAL_BAYAR_SQL`, bernomor
// seri Web yang dihitung di statement itu sendiri, id `jrn-reimb-<id_bayar>`
// dan pembaliknya `batal-jrn-reimb-<id_bayar>`. Cermin `hr-reimburse.ts`.
pub const AKUN_BEBAN_REIMBURSE: &str = "akun-beban-reimburse";
pub const AKUN_BAYAR_BAWAAN: &str = "akun-kas";
pub const PESAN_AKUN_BAYAR: &str = "Akun pembayaran harus akun aset yang aktif.";
pub const AKUN_BAYAR_SQL: &str = "SELECT 1 AS sah FROM keu_akun WHERE id_akun = ?1 AND kelompok = 'Aset' AND is_aktif = 1 AND dihapus_pada IS NULL LIMIT 1;";
pub const BATAS_TUTUP_SQL: &str = "SELECT MAX(sampai_tanggal) AS batas FROM keu_tutup_buku WHERE status = 'Aktif';";
/// Header: ?2 = dicatat oleh; baris kredit: ?2 = akun bayar.
pub const JURNAL_BAYAR_SQL: [&str; 3] = [
    "INSERT INTO keu_jurnal (id_jurnal, tanggal, seri, nomor_urut, nomor, keterangan, sumber, id_sumber, id_jurnal_batal, dibuat_oleh, created_at) SELECT 'jrn-reimb-' || b.id_bayar, b.tanggal, 'WEB', n.urut, 'JU/' || substr(b.tanggal, 1, 4) || '/WEB/' || printf('%04d', n.urut), 'Pembayaran reimbursement ' || COALESCE(m.nama, b.id_karyawan), 'Reimburse', b.id_bayar, NULL, ?2, datetime('now') FROM hr_reimburse_bayar b LEFT JOIN master_data m ON m.id_unik = b.id_karyawan, (SELECT COALESCE(MAX(j.nomor_urut), 0) + 1 AS urut FROM keu_jurnal j WHERE j.seri = 'WEB' AND substr(j.tanggal, 1, 4) = (SELECT substr(x.tanggal, 1, 4) FROM hr_reimburse_bayar x WHERE x.id_bayar = ?1)) n WHERE b.id_bayar = ?1 AND b.jenis = 'Bayar' AND b.total > 0 ON CONFLICT(id_jurnal) DO NOTHING;",
    "INSERT INTO keu_jurnal_baris (id_baris, id_jurnal, id_akun, debit, kredit, keterangan, urutan) SELECT 'jrn-reimb-' || b.id_bayar || ':1', 'jrn-reimb-' || b.id_bayar, 'akun-beban-reimburse', b.total, 0, NULL, 1 FROM hr_reimburse_bayar b WHERE b.id_bayar = ?1 AND b.jenis = 'Bayar' AND b.total > 0 AND EXISTS (SELECT 1 FROM keu_jurnal j WHERE j.id_jurnal = 'jrn-reimb-' || b.id_bayar) ON CONFLICT(id_baris) DO NOTHING;",
    "INSERT INTO keu_jurnal_baris (id_baris, id_jurnal, id_akun, debit, kredit, keterangan, urutan) SELECT 'jrn-reimb-' || b.id_bayar || ':2', 'jrn-reimb-' || b.id_bayar, ?2, 0, b.total, NULL, 2 FROM hr_reimburse_bayar b WHERE b.id_bayar = ?1 AND b.jenis = 'Bayar' AND b.total > 0 AND EXISTS (SELECT 1 FROM keu_jurnal j WHERE j.id_jurnal = 'jrn-reimb-' || b.id_bayar) ON CONFLICT(id_baris) DO NOTHING;",
];
/// Pembalik: header ?2 = tanggal hari ini WIB, ?3 = dicatat oleh.
pub const JURNAL_BATAL_BAYAR_SQL: [&str; 2] = [
    "INSERT INTO keu_jurnal (id_jurnal, tanggal, seri, nomor_urut, nomor, keterangan, sumber, id_sumber, id_jurnal_batal, dibuat_oleh, created_at) SELECT 'batal-' || j.id_jurnal, ?2, 'WEB', n.urut, 'JU/' || substr(?2, 1, 4) || '/WEB/' || printf('%04d', n.urut), 'Pembatalan ' || j.keterangan, 'Pembatalan', NULL, j.id_jurnal, ?3, datetime('now') FROM keu_jurnal j, (SELECT COALESCE(MAX(x.nomor_urut), 0) + 1 AS urut FROM keu_jurnal x WHERE x.seri = 'WEB' AND substr(x.tanggal, 1, 4) = substr(?2, 1, 4)) n WHERE j.id_jurnal = 'jrn-reimb-' || ?1 AND EXISTS (SELECT 1 FROM hr_reimburse_bayar c WHERE c.id_bayar = 'batal-' || ?1) ON CONFLICT(id_jurnal) DO NOTHING;",
    "INSERT INTO keu_jurnal_baris (id_baris, id_jurnal, id_akun, debit, kredit, keterangan, urutan) SELECT 'batal-' || g.id_baris, 'batal-' || g.id_jurnal, g.id_akun, g.kredit, g.debit, g.keterangan, g.urutan FROM keu_jurnal_baris g WHERE g.id_jurnal = 'jrn-reimb-' || ?1 AND EXISTS (SELECT 1 FROM keu_jurnal p WHERE p.id_jurnal = 'batal-jrn-reimb-' || ?1) ON CONFLICT(id_baris) DO NOTHING;",
];

// Akses cloud

fn punya(operator: &OperatorUser, izin: &str) -> bool {
    operator.is_superadmin || operator.permissions.iter().any(|p| p == izin)
}

fn lihat_semua(operator: &OperatorUser) -> bool {
    IZIN_LIHAT_REIMBURSE.iter().any(|i| punya(operator, i))
}

fn tautan(operator: &OperatorUser) -> String {
    operator.id_karyawan.as_deref().unwrap_or("").trim().to_owned()
}

fn angka_opsional(b: &Value, kunci: &str) -> Option<i64> {
    match b.get(kunci) {
        None | Some(Value::Null) => None,
        Some(_) => Some(angka(b, kunci)),
    }
}

fn daftar_koma(t: &str) -> Vec<String> {
    t.split(',').filter(|a| !a.is_empty()).map(str::to_owned).collect()
}

fn rapikan_klaim(mut k: Value) -> Value {
    let aksi = daftar_koma(&teks(&k, "aksi"));
    k["status"] = json!(status_klaim(&aksi));
    k["status_bayar"] = json!(status_bayar(angka(&k, "jumlah_bayar")));
    for kunci in ["nominal", "jumlah_nota", "jumlah_bayar"] {
        k[kunci] = json!(angka(&k, kunci));
    }
    for kunci in ["nominal_disetujui", "batas_bulanan"] {
        k[kunci] = json!(angka_opsional(&k, kunci));
    }
    k["wajib_nota"] = json!(angka(&k, "wajib_nota") != 0);
    if let Some(o) = k.as_object_mut() {
        o.remove("aksi");
    }
    k
}

fn bahan_tanda(k: &Value) -> KlaimTanda {
    KlaimTanda {
        id_karyawan: teks(k, "id_karyawan"),
        id_jenis: teks(k, "id_jenis"),
        tanggal: teks(k, "tanggal"),
        status: teks(k, "status"),
        nominal: angka(k, "nominal"),
        nominal_disetujui: angka_opsional(k, "nominal_disetujui"),
        wajib_nota: k["wajib_nota"] == json!(true),
        batas_bulanan: angka_opsional(k, "batas_bulanan"),
        jumlah_nota: angka(k, "jumlah_nota"),
        jumlah_bayar: angka(k, "jumlah_bayar"),
    }
}

/// Rapikan semua baris lalu beri tanda atas himpunan yang sama.
fn rapikan_semua(daftar: Vec<Value>) -> Vec<Value> {
    let rapi: Vec<Value> = daftar.into_iter().map(rapikan_klaim).collect();
    let tanda = tanda_klaim(&rapi.iter().map(bahan_tanda).collect::<Vec<_>>());
    rapi.into_iter()
        .zip(tanda)
        .map(|(mut k, t)| {
            k["tanda"] = json!(t);
            k
        })
        .collect()
}

async fn klaim_satu(client: &TursoClient, id: &str) -> Result<Value, CommandError> {
    satu(client, KLAIM_SQL, vec![json!(""), json!(""), json!(id)])
        .await?
        .map(rapikan_klaim)
        .ok_or_else(|| galat(PESAN_KLAIM_TIDAK_ADA))
}

async fn klaim_pegawai(client: &TursoClient, id_karyawan: &str) -> Result<Vec<Value>, CommandError> {
    Ok(rapikan_semua(baris(client, KLAIM_SQL, vec![json!(""), json!(id_karyawan), json!("")]).await?))
}

async fn pembayaran(client: &TursoClient, id_karyawan: &str, id_bayar: &str) -> Result<Vec<Value>, CommandError> {
    Ok(baris(client, PEMBAYARAN_SQL, vec![json!(id_karyawan), json!(id_bayar)])
        .await?
        .into_iter()
        .map(|mut b| {
            b["total"] = json!(angka(&b, "total"));
            b["dibatalkan"] = json!(angka(&b, "dibatalkan") != 0);
            b["klaim"] = json!(daftar_koma(&teks(&b, "klaim")));
            b
        })
        .collect())
}

async fn unit_sesi(client: &TursoClient, operator: &OperatorUser) -> Result<String, CommandError> {
    let id = tautan(operator);
    if id.is_empty() {
        return Ok(String::new());
    }
    Ok(satu(client, UNIT_PERSONIL_SQL, vec![json!(id)])
        .await?
        .map(|b| teks(&b, "unit"))
        .unwrap_or_default())
}

fn bulan_valid(bulan: &str) -> bool {
    bulan.chars().count() == 7 && tanggal_valid(&format!("{bulan}-01"))
}

/// `desktop_hr_reimburse_types`: semua jenis (layar menyaring yang aktif).
pub async fn jenis_reimburse(client: &TursoClient) -> Result<Value, CommandError> {
    client.ensure_schema_current().await?;
    let jenis: Vec<Value> = baris(client, JENIS_REIMBURSE_SQL, vec![])
        .await?
        .into_iter()
        .map(|mut j| {
            j["wajib_nota"] = json!(angka(&j, "wajib_nota") != 0);
            j["is_aktif"] = json!(angka(&j, "is_aktif") != 0);
            j["batas_bulanan"] = json!(angka_opsional(&j, "batas_bulanan"));
            j
        })
        .collect();
    Ok(json!({ "jenis": jenis }))
}

/// `desktop_hr_reimburse_types_save`: buat atau ubah satu jenis; tanpa hapus.
pub async fn simpan_jenis(client: &TursoClient, oleh: &str, draft: &Value) -> Result<Value, CommandError> {
    client.ensure_schema_current().await?;
    let sah = validasi_jenis(draft).map_err(galat)?;
    let id = sah.id_jenis.clone().unwrap_or_else(|| new_id("rmj-"));
    if sah.is_aktif && satu(client, BENTROK_JENIS_REIMBURSE_SQL, vec![json!(sah.nama), json!(id)]).await?.is_some() {
        return Err(galat(PESAN_JENIS_GANDA));
    }
    let args = vec![
        json!(id),
        json!(sah.nama),
        json!(i64::from(sah.wajib_nota)),
        json!(sah.batas_bulanan),
        json!(i64::from(sah.is_aktif)),
        json!(oleh),
    ];
    tulis(client, SIMPAN_JENIS_REIMBURSE_SQL, args).await?;
    Ok(json!({ "sukses": true, "id_jenis": id }))
}

/// `desktop_hr_reimburse_list`: `mode` `bulan` (bawaan, bulan ini WIB),
/// `pegawai` (riwayat klaim + pembayaran), atau `rincian` (satu klaim +
/// keputusan, nota, pembayaran). Pemegang `hr.reimburse.submit` saja hanya
/// melihat klaim yang ia ajukan.
pub async fn daftar_klaim(client: &TursoClient, operator: &OperatorUser, query: &Value) -> Result<Value, CommandError> {
    client.ensure_schema_current().await?;
    let hari = hari_ini(client).await?;
    let semua = lihat_semua(operator);
    let sesi = json!({
        "id_karyawan": tautan(operator),
        "unit": unit_sesi(client, operator).await?,
        "lingkup_semua": punya(operator, "hr.scope.all"),
        "lihat_semua": semua,
    });
    let milik = |k: &Value| semua || sama_orang(&teks(k, "diajukan_oleh"), &operator.username);
    match payload_text(query, "mode").as_deref().unwrap_or("bulan") {
        "bulan" => {
            let bulan = payload_text(query, "bulan").unwrap_or_else(|| hari.chars().take(7).collect());
            if !bulan_valid(&bulan) {
                return Err(galat("Bulan tidak valid."));
            }
            let klaim: Vec<Value> = rapikan_semua(baris(client, KLAIM_SQL, vec![json!(bulan), json!(""), json!("")]).await?)
                .into_iter()
                .filter(milik)
                .collect();
            Ok(json!({ "hari_ini": hari, "bulan": bulan, "sesi": sesi, "klaim": klaim }))
        }
        "pegawai" => {
            let id = id_wajib(query, "id_karyawan", "Pegawai wajib dipilih.")?;
            let klaim: Vec<Value> = klaim_pegawai(client, &id).await?.into_iter().filter(milik).collect();
            let bayar = if semua { pembayaran(client, &id, "").await? } else { Vec::new() };
            Ok(json!({ "hari_ini": hari, "sesi": sesi, "klaim": klaim, "bayar": bayar }))
        }
        "rincian" => {
            let id = id_wajib(query, "id_klaim", PESAN_KLAIM_TIDAK_ADA)?;
            let pegawai = teks(&klaim_satu(client, &id).await?, "id_karyawan");
            let klaim = klaim_pegawai(client, &pegawai)
                .await?
                .into_iter()
                .find(|k| teks(k, "id_klaim") == id)
                .filter(milik)
                .ok_or_else(|| galat(PESAN_KLAIM_TIDAK_ADA))?;
            let keputusan: Vec<Value> = baris(client, KEPUTUSAN_SQL, vec![json!(id)])
                .await?
                .into_iter()
                .map(|mut k| {
                    k["nominal_disetujui"] = json!(angka_opsional(&k, "nominal_disetujui"));
                    k
                })
                .collect();
            let nota = baris(client, NOTA_SQL, vec![json!(id)]).await?;
            let bayar: Vec<Value> = if semua {
                pembayaran(client, &pegawai, "")
                    .await?
                    .into_iter()
                    .filter(|b| b["klaim"].as_array().is_some_and(|d| d.contains(&json!(id))))
                    .collect()
            } else {
                Vec::new()
            };
            Ok(json!({ "hari_ini": hari, "sesi": sesi, "klaim": klaim, "keputusan": keputusan, "nota": nota, "bayar": bayar }))
        }
        _ => Err(galat("Mode reimbursement tidak dikenal.")),
    }
}

/// `desktop_hr_reimburse_save`: catat klaim atas nama personil. Klaim tidak
/// pernah diubah; koreksi = Batal lalu ajukan ulang (Q-162).
pub async fn simpan_klaim(client: &TursoClient, oleh: &str, draft: &Value) -> Result<Value, CommandError> {
    client.ensure_schema_current().await?;
    let hari = hari_ini(client).await?;
    let sah = validasi_klaim(draft, &hari).map_err(galat)?;
    let id = new_id("rmb-");
    let args = vec![
        json!(id),
        json!(sah.id_karyawan),
        json!(sah.id_jenis),
        json!(sah.tanggal),
        json!(sah.nominal),
        json!(sah.keperluan),
        json!(oleh),
    ];
    if tulis(client, SIMPAN_KLAIM_SQL, args).await? == 0 {
        return Err(galat(PESAN_KLAIM_DITOLAK_SIMPAN));
    }
    Ok(json!({ "sukses": true, "id_klaim": id }))
}

/// `desktop_hr_reimburse_decide`: Setujui, Tolak, atau Batal. Wewenang,
/// cakupan unit (A-5, Q-167), dan "bukan diri sendiri" dari SESI.
pub async fn putus_klaim(client: &TursoClient, operator: &OperatorUser, draft: &Value) -> Result<Value, CommandError> {
    client.ensure_schema_current().await?;
    let id = id_wajib(draft, "id_klaim", PESAN_KLAIM_TIDAK_ADA)?;
    let klaim = klaim_satu(client, &id).await?;
    let sesi = tautan(operator);
    let keadaan = KeadaanKeputusan {
        status: teks(&klaim, "status"),
        dibayar: angka(&klaim, "jumlah_bayar") > 0,
        nominal: angka(&klaim, "nominal"),
        boleh_putus: punya(operator, "hr.reimburse.decide"),
        sendiri: !sesi.is_empty() && sesi == teks(&klaim, "id_karyawan"),
        dalam_cakupan: dalam_cakupan(
            punya(operator, "hr.scope.all"),
            &unit_sesi(client, operator).await?,
            &teks(&klaim, "unit"),
        ),
        pengaju_sendiri: sama_orang(&teks(&klaim, "diajukan_oleh"), &operator.username),
    };
    let sah = periksa_keputusan(draft, &keadaan).map_err(galat)?;
    let hanya_menunggu = i64::from(!pemutus_sah(&keadaan));
    let id_keputusan = new_id("rmk-");
    let args = vec![
        json!(id_keputusan),
        json!(id),
        json!(sah.aksi),
        json!(sah.nominal_disetujui),
        json!(sah.alasan),
        json!(operator.username),
        json!(hanya_menunggu),
    ];
    if tulis(client, PUTUS_KLAIM_SQL, args).await? == 0 {
        return Err(galat(PESAN_KLAIM_BERUBAH));
    }
    let status = teks(&klaim_satu(client, &id).await?, "status");
    Ok(json!({ "sukses": true, "id_keputusan": id_keputusan, "status": status }))
}

/// `desktop_hr_reimburse_file_save`: aksi `tambah` atau `hapus` nota, hanya
/// oleh pengaju klaim (atau Superadmin) dan selama belum diputus.
pub async fn simpan_nota(client: &TursoClient, operator: &OperatorUser, draft: &Value) -> Result<Value, CommandError> {
    client.ensure_schema_current().await?;
    let boleh = |pengaju: &str| operator.is_superadmin || sama_orang(pengaju, &operator.username);
    let mentah = |kunci: &str| draft.get(kunci).and_then(Value::as_str).unwrap_or_default().to_owned();
    match payload_text(draft, "aksi").as_deref().unwrap_or("tambah") {
        "tambah" => {
            let id_klaim = id_wajib(draft, "id_klaim", PESAN_KLAIM_TIDAK_ADA)?;
            let klaim = klaim_satu(client, &id_klaim).await?;
            if !boleh(&teks(&klaim, "diajukan_oleh")) {
                return Err(CommandError::new("DESKTOP_ACCESS_DENIED", PESAN_NOTA_DITOLAK));
            }
            let berkas =
                urai_berkas_dokumen(&mentah("nama_berkas"), &mentah("mime_type"), &mentah("data_base64")).map_err(galat)?;
            let id = new_id("rmf-");
            let args = vec![
                json!(id),
                json!(id_klaim),
                json!(berkas.nama_berkas),
                json!(berkas.mime_type),
                json!(berkas.data_base64),
                json!(operator.username),
            ];
            if tulis(client, TAMBAH_NOTA_SQL, args).await? == 0 {
                let terkunci = teks(&klaim_satu(client, &id_klaim).await?, "status") != "Menunggu";
                return Err(galat(if terkunci { PESAN_NOTA_TERKUNCI } else { PESAN_NOTA_PENUH }));
            }
            Ok(json!({ "sukses": true, "id_berkas": id }))
        }
        "hapus" => {
            let id = id_wajib(draft, "id_berkas", "Berkas tidak ditemukan.")?;
            let pemilik = satu(client, PEMILIK_NOTA_SQL, vec![json!(id)])
                .await?
                .ok_or_else(|| CommandError::new("NOT_FOUND", "Berkas tidak ditemukan."))?;
            if !boleh(&teks(&pemilik, "diajukan_oleh")) {
                return Err(CommandError::new("DESKTOP_ACCESS_DENIED", PESAN_NOTA_DITOLAK));
            }
            if tulis(client, HAPUS_NOTA_SQL, vec![json!(id)]).await? == 0 {
                return Err(galat(PESAN_NOTA_TERKUNCI));
            }
            Ok(json!({ "sukses": true }))
        }
        _ => Err(galat("Aksi nota tidak dikenal.")),
    }
}

/// `desktop_hr_reimburse_file`: isi satu nota; pemegang `submit` saja hanya
/// nota klaim yang ia ajukan.
pub async fn ambil_nota(client: &TursoClient, operator: &OperatorUser, id_berkas: &str) -> Result<Value, CommandError> {
    client.ensure_schema_current().await?;
    satu(client, AMBIL_NOTA_SQL, vec![json!(id_berkas.trim())])
        .await?
        .filter(|b| lihat_semua(operator) || sama_orang(&teks(b, "diajukan_oleh"), &operator.username))
        .ok_or_else(|| CommandError::new("NOT_FOUND", "Berkas tidak ditemukan."))
}

/// `desktop_hr_reimburse_pay`: satu pembayaran untuk satu pegawai. Total dari
/// nominal disetujui (bukan isian), dijaga ulang di transaksi cloud.
pub async fn bayar_klaim(client: &TursoClient, oleh: &str, draft: &Value) -> Result<Value, CommandError> {
    client.ensure_schema_current().await?;
    let hari = hari_ini(client).await?;
    let sah = validasi_bayar(draft, &hari).map_err(galat)?;
    let bahan: Vec<KlaimBayar> = klaim_pegawai(client, &sah.id_karyawan)
        .await?
        .iter()
        .map(|k| KlaimBayar {
            id_klaim: teks(k, "id_klaim"),
            id_karyawan: teks(k, "id_karyawan"),
            status: teks(k, "status"),
            nominal_disetujui: angka_opsional(k, "nominal_disetujui"),
            jumlah_bayar: angka(k, "jumlah_bayar"),
        })
        .collect();
    let total = periksa_bayar(&sah.id_karyawan, &sah.id_klaim, &bahan).map_err(galat)?;
    // Jurnal otomatis (v75): akun bayar dan periode diperiksa SEBELUM batch.
    let akun_bayar = Some(teks(draft, "id_akun_bayar").trim().to_owned())
        .filter(|a| !a.is_empty())
        .unwrap_or_else(|| AKUN_BAYAR_BAWAAN.to_owned());
    if satu(client, AKUN_BAYAR_SQL, vec![json!(akun_bayar)]).await?.is_none() {
        return Err(galat(PESAN_AKUN_BAYAR));
    }
    let batas = satu(client, BATAS_TUTUP_SQL, vec![])
        .await?
        .map(|b| teks(&b, "batas"))
        .filter(|b| !b.is_empty());
    super::tutup_buku::cek_periode_terbuka(&sah.tanggal, batas.as_deref()).map_err(galat)?;
    let id = new_id("rbb-");
    let daftar = json!(sah.id_klaim).to_string();
    client
        .execute_atomic(vec![
            Statement::new(
                BAYAR_SQL,
                vec![
                    json!(id),
                    json!(sah.id_karyawan),
                    json!(sah.tanggal),
                    json!(total),
                    json!(sah.keterangan),
                    json!(oleh),
                    json!(daftar),
                ],
            ),
            Statement::new(BAYAR_BARIS_SQL, vec![json!(id), json!(daftar)]),
            Statement::new(JURNAL_BAYAR_SQL[0], vec![json!(id), json!(oleh)]),
            Statement::new(JURNAL_BAYAR_SQL[1], vec![json!(id)]),
            Statement::new(JURNAL_BAYAR_SQL[2], vec![json!(id), json!(akun_bayar)]),
        ])
        .await?;
    if pembayaran(client, "", &id).await?.is_empty() {
        return Err(galat(PESAN_KLAIM_BERUBAH));
    }
    Ok(json!({ "sukses": true, "id_bayar": id, "total": total }))
}

/// `desktop_hr_reimburse_pay_cancel`: baris pembatalan `batal-<id>` beralasan.
pub async fn batal_bayar(client: &TursoClient, oleh: &str, draft: &Value) -> Result<Value, CommandError> {
    client.ensure_schema_current().await?;
    let id = id_wajib(draft, "id_bayar", PESAN_BAYAR_TIDAK_ADA)?;
    let alasan = teks_opsional(draft, "alasan", "Alasan pembatalan", MAKS_ALASAN_REIMBURSE).map_err(galat)?;
    let bayar = pembayaran(client, "", &id)
        .await?
        .into_iter()
        .next()
        .ok_or_else(|| galat(PESAN_BAYAR_TIDAK_ADA))?;
    periksa_batal_bayar(&teks(&bayar, "jenis"), bayar["dibatalkan"] == json!(true), alasan.as_deref())
        .map_err(galat)?;
    let hari = hari_ini(client).await?;
    // Pembalik jurnal di batch yang sama; dijaga baris `batal-<id>` (v75).
    client
        .execute_atomic(vec![
            Statement::new(BATAL_BAYAR_SQL, vec![json!(id), json!(hari), json!(alasan), json!(oleh)]),
            Statement::new(JURNAL_BATAL_BAYAR_SQL[0], vec![json!(id), json!(hari), json!(oleh)]),
            Statement::new(JURNAL_BATAL_BAYAR_SQL[1], vec![json!(id)]),
        ])
        .await?;
    if satu(client, "SELECT 1 FROM hr_reimburse_bayar WHERE id_bayar = ?1;", vec![json!(format!("batal-{id}"))])
        .await?
        .is_none()
    {
        return Err(galat(PESAN_BAYAR_SUDAH_BATAL));
    }
    Ok(json!({ "sukses": true, "id_bayar": format!("batal-{id}") }))
}

#[cfg(test)]
mod tests {
    //! Vektor sama dengan `validations/hr-reimburse.test.ts`; alur cloud sama
    //! dengan `services/hr-reimburse.test.ts` (`hr-reimburse.uji.sql`).
    use super::*;

    const VEKTOR: &str = include_str!("../../../src/lib/validations/hr-reimburse.vektor.json");

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
    fn hr_reimburse_vektor() {
        let v: Value = serde_json::from_str(VEKTOR).expect("hr-reimburse.vektor.json sah");
        for k in v["jenis"].as_array().expect("jenis") {
            cocok(validasi_jenis(&k["draft"]), k);
        }
        for k in v["klaim"].as_array().expect("klaim") {
            cocok(validasi_klaim(&k["draft"], s(k, "hari_ini")), k);
        }
        for k in v["status"].as_array().expect("status") {
            let aksi: Vec<String> = serde_json::from_value(k["aksi"].clone()).expect("aksi");
            assert_eq!(status_klaim(&aksi), s(k, "hasil"), "{}", k["nama"]);
        }
        for k in v["status_bayar"].as_array().expect("status_bayar") {
            assert_eq!(status_bayar(k["jumlah"].as_i64().unwrap()), s(k, "hasil"), "{}", k["nama"]);
        }
        for k in v["keputusan"].as_array().expect("keputusan") {
            let keadaan: KeadaanKeputusan = serde_json::from_value(k["keadaan"].clone()).expect("keadaan");
            cocok(periksa_keputusan(&k["draft"], &keadaan), k);
        }
        for k in v["tanda"].as_array().expect("tanda") {
            let bahan: Vec<KlaimTanda> = serde_json::from_value(k["klaim"].clone()).expect("klaim");
            assert_eq!(json!(tanda_klaim(&bahan)), k["hasil"], "{}", k["nama"]);
        }
        for k in v["validasi_bayar"].as_array().expect("validasi_bayar") {
            cocok(validasi_bayar(&k["draft"], s(k, "hari_ini")), k);
        }
        for k in v["bayar"].as_array().expect("bayar") {
            let id: Vec<String> = serde_json::from_value(k["id_klaim"].clone()).expect("id_klaim");
            let bahan: Vec<KlaimBayar> = serde_json::from_value(k["klaim"].clone()).expect("klaim");
            cocok(periksa_bayar(s(k, "id_karyawan"), &id, &bahan), k);
        }
        for k in v["batal_bayar"].as_array().expect("batal_bayar") {
            let hasil = periksa_batal_bayar(s(k, "jenis"), k["sudah_dibatalkan"].as_bool().unwrap(), k["alasan"].as_str());
            assert_eq!(hasil.err().as_deref(), k["galat"].as_str(), "{}", k["nama"]);
        }
    }

    #[test]
    fn hr_reimburse_sql_memuat_predikat_bersama() {
        assert!(SIMPAN_KLAIM_SQL.contains(super::super::hris::PEGAWAI_SQL));
        for sql in [KLAIM_SQL, PUTUS_KLAIM_SQL, BAYAR_SQL] {
            assert!(sql.contains(BAYAR_AKTIF_SQL), "{sql}");
        }
    }

    fn operator(username: &str, id_karyawan: Option<&str>, izin: &[&str]) -> OperatorUser {
        OperatorUser {
            id: 2,
            kode_operator: "OP2".into(),
            nama_operator: username.into(),
            username: username.into(),
            role: "Uji".into(),
            role_id: 9,
            role_key: "uji".into(),
            is_superadmin: false,
            permissions: izin.iter().map(|i| (*i).to_owned()).collect(),
            permission_revision: 1,
            require_scan_photo: false,
            totp_enabled: false,
            require_scan_ip_allowlist: false,
            id_karyawan: id_karyawan.map(str::to_owned),
            login_at: None,
        }
    }

    /// PNG 1×1 terkecil yang lolos tanda tangan bita.
    const PNG: &str = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

    /// Alur 8c di atas `TursoClient::local_file`, data dan langkah sama dengan
    /// `services/hr-reimburse.test.ts`.
    #[test]
    fn hr_reimburse_alur_cloud() {
        let runtime = tokio::runtime::Builder::new_current_thread().build().expect("runtime uji");
        runtime.block_on(async {
            let dir = tempfile::tempdir().expect("direktori sementara");
            let hub = dir.path().join("sppg-hub.db");
            let client = TursoClient::local_file(
                url::Url::parse("https://hr-reimburse.sppg.invalid").expect("origin uji"),
                &hub,
                reqwest::Client::new(),
            );
            client.ensure_schema().await.expect("provisioning lokal");
            let c = rusqlite::Connection::open(&hub).expect("buka hub");
            c.execute_batch(include_str!("../../../src/lib/services/hr-reimburse.uji.sql")).expect("data uji");
            let hitung = |sql: &str| c.query_row(sql, [], |r| r.get::<_, i64>(0)).expect(sql);
            let galat_dari = |h: Result<Value, CommandError>| h.err().map(|e| e.message).unwrap_or_default();

            let staf = operator("staf", None, &["hr.reimburse.submit"]);
            let lain = operator("lain", None, &["hr.reimburse.submit"]);
            let kepala_sd = operator("kepsd", Some("rb-ks"), &["hr.reimburse.decide"]);
            let kepala_smp = operator("kepsmp", Some("rb-kp"), &["hr.reimburse.decide"]);
            let ani = operator("ani", Some("rb-g1"), &["hr.reimburse.decide", "hr.scope.all"]);
            let yayasan = operator("yayasan", None, &["hr.reimburse.decide", "hr.scope.all"]);

            // Jenis: nama aktif kembar ditolak; jenis nonaktif menolak klaim.
            let ganda = json!({ "nama": " transport " });
            assert_eq!(galat_dari(simpan_jenis(&client, "admin", &ganda).await), PESAN_JENIS_GANDA);
            let nonaktif = json!({ "id_jenis": "rmj-lainnya", "nama": "Lainnya", "is_aktif": false });
            simpan_jenis(&client, "admin", &nonaktif).await.expect("nonaktifkan");

            let klaim = |jenis: &str, tanggal: &str, nominal: i64| {
                json!({ "id_karyawan": "rb-g1", "id_jenis": jenis, "tanggal": tanggal, "nominal": nominal, "keperluan": "Biaya dinas" })
            };
            let id_dari = |h: Value| h["id_klaim"].as_str().unwrap().to_owned();
            assert_eq!(
                galat_dari(simpan_klaim(&client, "staf", &klaim("rmj-lainnya", "2026-11-02", 5000)).await),
                PESAN_KLAIM_DITOLAK_SIMPAN
            );
            let k1 = id_dari(simpan_klaim(&client, "staf", &klaim("rmj-uji", "2026-11-02", 150000)).await.expect("k1"));
            let k2 = id_dari(simpan_klaim(&client, "staf", &klaim("rmj-uji", "2026-11-03", 80000)).await.expect("k2"));
            let k3 = id_dari(simpan_klaim(&client, "staf", &klaim("rmj-transport", "2026-11-04", 20000)).await.expect("k3"));

            // Nota: hanya pengaju.
            let nota = json!({ "aksi": "tambah", "id_klaim": k1, "nama_berkas": "nota.png", "mime_type": "image/png", "data_base64": PNG });
            assert_eq!(galat_dari(simpan_nota(&client, &lain, &nota).await), PESAN_NOTA_DITOLAK);
            let id_nota = simpan_nota(&client, &staf, &nota).await.expect("nota")["id_berkas"].as_str().unwrap().to_owned();
            assert_eq!(ambil_nota(&client, &staf, &id_nota).await.expect("isi")["data_base64"], json!(PNG));
            assert!(ambil_nota(&client, &lain, &id_nota).await.is_err());

            // Keputusan: beda unit dan diri sendiri ditolak, hr.scope.all lolos.
            let setujui = |id: &str, nominal: i64| json!({ "id_klaim": id, "aksi": "Setujui", "nominal_disetujui": nominal, "alasan": "Tarif" });
            assert_eq!(galat_dari(putus_klaim(&client, &kepala_smp, &setujui(&k1, 100000)).await), PESAN_DI_LUAR_CAKUPAN_REIMBURSE);
            assert_eq!(galat_dari(putus_klaim(&client, &ani, &setujui(&k1, 100000)).await), PESAN_DIRI_SENDIRI_REIMBURSE);
            assert_eq!(galat_dari(putus_klaim(&client, &staf, &setujui(&k1, 100000)).await), PESAN_BUTUH_PEMUTUS);
            let hasil = putus_klaim(&client, &yayasan, &setujui(&k1, 100000)).await.expect("yayasan setujui");
            assert_eq!(hasil["status"], json!("Disetujui"));
            assert_eq!(galat_dari(putus_klaim(&client, &yayasan, &setujui(&k1, 100000)).await), PESAN_KLAIM_TERKUNCI);
            assert_eq!(galat_dari(simpan_nota(&client, &staf, &nota).await), PESAN_NOTA_TERKUNCI);
            let hapus = json!({ "aksi": "hapus", "id_berkas": id_nota });
            assert_eq!(galat_dari(simpan_nota(&client, &staf, &hapus).await), PESAN_NOTA_TERKUNCI);
            putus_klaim(&client, &kepala_sd, &json!({ "id_klaim": k2, "aksi": "Setujui" })).await.expect("kepala SD");
            let batal = |id: &str| json!({ "id_klaim": id, "aksi": "Batal", "alasan": "Salah" });
            assert_eq!(putus_klaim(&client, &staf, &batal(&k3)).await.expect("pengaju batal")["status"], json!("Dibatalkan"));

            // Bayar: total dari nominal disetujui (100000 + 80000), bukan pengajuan.
            let bayar = json!({ "id_karyawan": "rb-g1", "id_klaim": [k1, k2], "tanggal": "2026-11-05" });
            let dibayar = bayar_klaim(&client, "bendahara", &bayar).await.expect("bayar");
            assert_eq!(dibayar["total"], json!(180000));
            assert_eq!(hitung("SELECT SUM(nominal) FROM hr_reimburse_bayar_baris;"), 180000);
            assert_eq!(galat_dari(bayar_klaim(&client, "bendahara", &bayar).await), PESAN_BAYAR_TIDAK_SAH);
            assert_eq!(galat_dari(putus_klaim(&client, &yayasan, &batal(&k1)).await), PESAN_BATAL_TERBAYAR);

            // Batal bayar sekali, lalu klaim bisa dibatalkan.
            let id_bayar = dibayar["id_bayar"].as_str().unwrap();
            let batal_b = json!({ "id_bayar": id_bayar, "alasan": "Salah transfer" });
            batal_bayar(&client, "bendahara", &batal_b).await.expect("batal bayar");
            assert_eq!(galat_dari(batal_bayar(&client, "bendahara", &batal_b).await), PESAN_BAYAR_SUDAH_BATAL);
            assert_eq!(putus_klaim(&client, &yayasan, &batal(&k1)).await.expect("batal k1")["status"], json!("Dibatalkan"));

            // Daftar: pengaju lain tidak melihat klaim staf; staf melihat tiga.
            let q = json!({ "mode": "pegawai", "id_karyawan": "rb-g1" });
            assert_eq!(daftar_klaim(&client, &lain, &q).await.expect("lain")["klaim"], json!([]));
            let milik_staf = daftar_klaim(&client, &staf, &q).await.expect("staf");
            assert_eq!(milik_staf["klaim"].as_array().unwrap().len(), 3);
            assert_eq!(milik_staf["bayar"], json!([]));
            let rincian = daftar_klaim(&client, &yayasan, &json!({ "mode": "rincian", "id_klaim": k2 })).await.expect("rincian");
            assert_eq!(rincian["klaim"]["status"], json!("Disetujui"));
            assert_eq!(rincian["klaim"]["status_bayar"], json!("Belum dibayar"));
            assert_eq!(rincian["klaim"]["tanda"], json!(["tanpa_nota"]));
            assert_eq!(rincian["bayar"].as_array().unwrap().len(), 1);
            assert_eq!(rincian["bayar"][0]["dibatalkan"], json!(true));
        });
    }
}
