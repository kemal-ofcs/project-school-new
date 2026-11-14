//! HRIS Fase 4 (`prd-hris.md` §22): surat peringatan dan pegawai keluar.
//!
//! `hr_sp`, `hr_keluar`, `hr_keluar_rincian`, dan `hr_keluar_alasan` KHUSUS
//! CLOUD (Q-73): dibaca dan ditulis lewat `TursoClient`, tidak pernah masuk
//! SQLite perangkat, snapshot, atau outbox. Yang tersinkron hanya
//! `master_data.id_keluar`, ditulis transaksi cloud Berlakukan/Batalkan (4b).
//! Tanpa koneksi, command mengembalikan `hris_cloud::PESAN_LURING`.
//!
//! Kembaran TS: aturan dan SQL di `src/lib/validations/hr-keluar.ts`, penulisan
//! di `src/lib/services/hr-keluar.ts`. Vektornya
//! `validations/hr-keluar.vektor.json`; teks SQL dibandingkan harfiah oleh
//! `hr-keluar.test.ts`.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use super::hari_kerja::tanggal_valid;
use super::hr_pengajuan::{dalam_cakupan, UNIT_PERSONIL_SQL};
use super::hris::{new_id, HARI_INI_SQL, NOMOR_MAKS};
use super::inventory::payload_text;
use super::models::{CommandError, OperatorUser};
use super::time_policy::add_days;
use super::turso::{Statement, TursoClient};

// ── Alasan keluar bawaan (seed cloud v70) ──

const ALASAN_BAWAAN_JSON: &str = include_str!("../../../src/lib/validations/hr-keluar-alasan-bawaan.json");

/// Satu alasan keluar bawaan. Pengali dalam persen dari kelipatan UP/UPMK.
#[derive(Debug, Clone, Deserialize)]
pub struct AlasanBawaan {
    pub id_alasan: String,
    pub nama: String,
    pub pengali_up: i64,
    pub pengali_upmk: i64,
    pub uph: bool,
    pub kompensasi_pkwt: bool,
    pub uang_pisah: bool,
    pub dasar_hukum: Option<String>,
}

pub fn alasan_bawaan() -> Vec<AlasanBawaan> {
    serde_json::from_str(ALASAN_BAWAAN_JSON).expect("hr-keluar-alasan-bawaan.json sah")
}

/// Alasan yang sudah disunting tidak ditimpa. Cermin `SEED_ALASAN_SQL`.
pub const SEED_ALASAN_SQL: &str = "INSERT OR IGNORE INTO hr_keluar_alasan (id_alasan, nama, pengali_up, pengali_upmk, uph, kompensasi_pkwt, uang_pisah, dasar_hukum) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8);";

/// Argumen `SEED_ALASAN_SQL`. Cermin `seedAlasanArgs`.
pub fn seed_alasan_args(a: &AlasanBawaan) -> Vec<Value> {
    vec![
        json!(a.id_alasan),
        json!(a.nama),
        json!(a.pengali_up),
        json!(a.pengali_upmk),
        json!(i64::from(a.uph)),
        json!(i64::from(a.kompensasi_pkwt)),
        json!(i64::from(a.uang_pisah)),
        json!(a.dasar_hukum),
    ]
}

// ── Surat peringatan: aturan murni (§22.2.1) ──

/// WAJIB sama dengan CHECK `hr_sp.tingkat`.
pub const TINGKAT_SP: [&str; 3] = ["SP1", "SP2", "SP3"];
pub const MAKS_PELANGGARAN: usize = 2000;
pub const MAKS_TEKS_SP: usize = 1000;
pub const MAKS_PENANDA: usize = 120;
pub const MAKS_NIP_PENANDA: usize = 30;

pub const PESAN_DIRI_SENDIRI: &str = "Tindakan ini tidak bisa dilakukan untuk diri sendiri.";
pub const PESAN_DI_LUAR_CAKUPAN: &str = "Pegawai ini di luar unit Anda.";
pub const PESAN_BUTUH_SP3: &str = "SP3 hanya bisa dibuat atau diubah pemegang izin Terbitkan SP3.";

fn panjang(teks: &str) -> usize {
    teks.chars().count()
}

fn teks_opsional(draft: &Value, kunci: &str, label: &str, maks: usize) -> Result<Option<String>, String> {
    match payload_text(draft, kunci) {
        Some(t) if panjang(&t) > maks => Err(format!("{label} maksimal {maks} karakter.")),
        lain => Ok(lain),
    }
}

fn teks_wajib(draft: &Value, kunci: &str, label: &str, maks: usize) -> Result<String, String> {
    teks_opsional(draft, kunci, label, maks)?.ok_or_else(|| format!("{label} wajib diisi."))
}

/// Cermin `akhirMasaSp`: hari terakhir SP berlaku (inklusif).
pub fn akhir_masa_sp(tanggal: &str, masa_bulan: i64) -> Option<String> {
    let akhir = super::hris::tambah_bulan(tanggal, masa_bulan)?;
    add_days(&akhir, -1).ok()
}

/// Cermin `statusSp`. Tidak disimpan.
pub fn status_sp(tanggal: &str, berlaku_sampai: &str, dicabut: bool, hari_ini: &str) -> &'static str {
    if dicabut {
        "Dicabut"
    } else if tanggal <= hari_ini && hari_ini <= berlaku_sampai {
        "Berlaku"
    } else {
        "Berakhir"
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct SpRingkas {
    pub tingkat: String,
    pub tanggal: String,
    pub berlaku_sampai: String,
    pub dicabut: bool,
}

/// Cermin `usulanTingkat`: SP Berlaku tertinggi pada `tanggal` + 1, maksimal
/// SP3. Nilai kedua benar bila SP3 masih Berlaku (saatnya proses keluar).
pub fn usulan_tingkat(sp: &[SpRingkas], tanggal: &str) -> (&'static str, bool) {
    let tertinggi = sp
        .iter()
        .filter(|s| status_sp(&s.tanggal, &s.berlaku_sampai, s.dicabut, tanggal) == "Berlaku")
        .filter_map(|s| TINGKAT_SP.iter().position(|t| *t == s.tingkat))
        .max();
    match tertinggi {
        None => ("SP1", false),
        Some(0) => ("SP2", false),
        Some(1) => ("SP3", false),
        Some(_) => ("SP3", true),
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct SpSah {
    pub id_sp: Option<String>,
    pub id_karyawan: String,
    pub tingkat: String,
    pub tanggal: String,
    pub nomor: Option<String>,
    pub pelanggaran: String,
    pub harapan: Option<String>,
    pub alasan_tingkat: Option<String>,
    pub penanda_nama: String,
    pub penanda_jabatan: String,
    pub penanda_nip: Option<String>,
}

/// Cermin `validasiSp`. Usulan tingkat, tanggal masuk, dan wewenang diperiksa
/// pemanggil.
pub fn validasi_sp(draft: &Value, hari_ini: &str) -> Result<SpSah, String> {
    let id_karyawan = payload_text(draft, "id_karyawan").ok_or("Pegawai wajib dipilih.")?;
    let tingkat = payload_text(draft, "tingkat")
        .filter(|t| TINGKAT_SP.contains(&t.as_str()))
        .ok_or("Tingkat SP tidak dikenal.")?;
    let tanggal = payload_text(draft, "tanggal")
        .filter(|t| tanggal_valid(t))
        .ok_or("Tanggal SP tidak valid.")?;
    if tanggal.as_str() > hari_ini {
        return Err("Tanggal SP tidak boleh di masa depan.".into());
    }
    Ok(SpSah {
        id_sp: payload_text(draft, "id_sp"),
        id_karyawan,
        tingkat,
        tanggal,
        nomor: teks_opsional(draft, "nomor", "Nomor surat", NOMOR_MAKS)?,
        pelanggaran: teks_wajib(draft, "pelanggaran", "Pelanggaran", MAKS_PELANGGARAN)?,
        harapan: teks_opsional(draft, "harapan", "Perbaikan yang diminta", MAKS_TEKS_SP)?,
        alasan_tingkat: teks_opsional(draft, "alasan_tingkat", "Alasan tingkat", MAKS_TEKS_SP)?,
        penanda_nama: teks_wajib(draft, "penanda_nama", "Nama penanda tangan", MAKS_PENANDA)?,
        penanda_jabatan: teks_wajib(draft, "penanda_jabatan", "Jabatan penanda tangan", MAKS_PENANDA)?,
        penanda_nip: teks_opsional(draft, "penanda_nip", "NIP penanda tangan", MAKS_NIP_PENANDA)?,
    })
}

/// Cermin `periksaTingkat`: tingkat lain dari usulan wajib beralasan.
pub fn periksa_tingkat(tingkat: &str, usulan: &str, alasan: Option<&str>) -> Result<(), String> {
    if tingkat != usulan && alasan.is_none() {
        return Err(format!("Tingkat berbeda dari usulan ({usulan}); alasannya wajib diisi."));
    }
    Ok(())
}

/// Wewenang dari SESI (§22.4), cermin `periksaWewenangSp`. `boleh_sp3` hanya
/// dinilai untuk tingkat SP3; cabut memanggilnya dengan tingkat kosong.
pub fn periksa_wewenang_sp(tingkat: &str, sendiri: bool, dalam_cakupan: bool, boleh_sp3: bool) -> Result<(), String> {
    if sendiri {
        return Err(PESAN_DIRI_SENDIRI.into());
    }
    if !dalam_cakupan {
        return Err(PESAN_DI_LUAR_CAKUPAN.into());
    }
    if tingkat == "SP3" && !boleh_sp3 {
        return Err(PESAN_BUTUH_SP3.into());
    }
    Ok(())
}

/// Cermin `masaSpBerlaku`: nilai kunci `hr_sp_masa_bulan`; kosong atau rusak = bawaan.
pub fn masa_sp_berlaku(nilai: Option<&str>) -> i64 {
    super::hris::angka_pengaturan(nilai, super::hris::ATURAN_SP_MASA)
}

// ── SQL, dieja harfiah sama di `validations/hr-keluar.ts` ──

pub const SP_PEGAWAI_SQL: &str = "SELECT id_sp, id_karyawan, tingkat, usulan_tingkat, COALESCE(alasan_tingkat, '') AS alasan_tingkat, tanggal, masa_bulan, berlaku_sampai, COALESCE(nomor, '') AS nomor, pelanggaran, COALESCE(harapan, '') AS harapan, penanda_nama, penanda_jabatan, COALESCE(penanda_nip, '') AS penanda_nip, COALESCE(unit, '') AS unit, dicatat_oleh, created_at, COALESCE(diubah_oleh, '') AS diubah_oleh, COALESCE(diubah_pada, '') AS diubah_pada, COALESCE(dicabut_oleh, '') AS dicabut_oleh, COALESCE(dicabut_pada, '') AS dicabut_pada, COALESCE(alasan_cabut, '') AS alasan_cabut FROM hr_sp WHERE id_karyawan = ?1 ORDER BY tanggal DESC, created_at DESC, id_sp DESC\n-- batas: surat peringatan satu pegawai\n;";
pub const SP_SATU_SQL: &str = "SELECT id_sp, id_karyawan, tingkat, tanggal, COALESCE(unit, '') AS unit, COALESCE(dicabut_pada, '') AS dicabut_pada FROM hr_sp WHERE id_sp = ?1 LIMIT 1;";
/// Pegawai (bukan siswa) sasaran SP, dari cloud.
pub const PEGAWAI_SP_SQL: &str = "SELECT m.id_unik, COALESCE(m.status_aktif, 'Aktif') AS status_aktif, COALESCE(m.tanggal_daftar, '') AS tanggal_daftar, COALESCE(m.unit, '') AS unit FROM master_data m WHERE m.id_unik = ?1 AND LOWER(TRIM(COALESCE(m.jenis_personil, ''))) <> 'siswa' AND NOT EXISTS (SELECT 1 FROM siswa_data sd WHERE sd.id_siswa = m.id_unik) LIMIT 1;";
pub const MASA_SP_SQL: &str = "SELECT value FROM setting_gex_system WHERE key = 'hr_sp_masa_bulan' LIMIT 1;";
/// Nomor sama dipakai SP lain: ditandai, tidak ditolak (Q-74).
pub const NOMOR_KEMBAR_SQL: &str = "SELECT COUNT(*) AS jumlah FROM hr_sp WHERE nomor = ?1 AND id_sp <> ?2;";
pub const SIMPAN_SP_SQL: &str = "INSERT INTO hr_sp (id_sp, id_karyawan, tingkat, usulan_tingkat, alasan_tingkat, tanggal, masa_bulan, berlaku_sampai, nomor, pelanggaran, harapan, penanda_nama, penanda_jabatan, penanda_nip, unit, dicatat_oleh, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, datetime('now'));";
/// Ubah teks selama belum dicabut; tingkat dan tanggal terkunci.
pub const UBAH_SP_SQL: &str = "UPDATE hr_sp SET nomor = ?2, pelanggaran = ?3, harapan = ?4, penanda_nama = ?5, penanda_jabatan = ?6, penanda_nip = ?7, diubah_oleh = ?8, diubah_pada = datetime('now') WHERE id_sp = ?1 AND dicabut_pada IS NULL;";
/// Sekali: baris yang sudah dicabut tidak tersentuh lagi.
pub const CABUT_SP_SQL: &str = "UPDATE hr_sp SET dicabut_oleh = ?2, dicabut_pada = datetime('now'), alasan_cabut = ?3 WHERE id_sp = ?1 AND dicabut_pada IS NULL;";

pub const PESAN_SP_DICABUT: &str = "SP ini sudah dicabut.";

// ── Akses cloud ──

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

fn angka(baris: &Value, kunci: &str) -> i64 {
    match baris.get(kunci) {
        Some(Value::Number(n)) => n.as_i64().unwrap_or(0),
        Some(Value::String(s)) => s.parse().unwrap_or(0),
        _ => 0,
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

async fn hari_ini(client: &TursoClient) -> Result<String, CommandError> {
    satu(client, HARI_INI_SQL, vec![])
        .await?
        .map(|b| teks(&b, "hari_ini"))
        .filter(|t| !t.is_empty())
        .ok_or_else(CommandError::internal)
}

async fn masa_sp(client: &TursoClient) -> Result<i64, CommandError> {
    let nilai = satu(client, MASA_SP_SQL, vec![]).await?.map(|b| teks(&b, "value"));
    Ok(masa_sp_berlaku(nilai.as_deref()))
}

fn punya(operator: &OperatorUser, izin: &str) -> bool {
    operator.is_superadmin || operator.permissions.iter().any(|p| p == izin)
}

fn tautan(operator: &OperatorUser) -> String {
    operator.id_karyawan.as_deref().unwrap_or("").trim().to_owned()
}

/// "Diri sendiri" dan cakupan unit dari SESI: `id_karyawan` tertaut sesi dan
/// unitnya di cloud (`UNIT_PERSONIL_SQL`), bukan dari payload.
async fn wewenang(
    client: &TursoClient,
    operator: &OperatorUser,
    id_karyawan: &str,
    unit_sasaran: &str,
    tingkat: &str,
) -> Result<(), CommandError> {
    let sesi = tautan(operator);
    let unit_akun = if sesi.is_empty() {
        String::new()
    } else {
        satu(client, UNIT_PERSONIL_SQL, vec![json!(sesi)])
            .await?
            .map(|b| teks(&b, "unit"))
            .unwrap_or_default()
    };
    periksa_wewenang_sp(
        tingkat,
        !sesi.is_empty() && sesi == id_karyawan,
        dalam_cakupan(punya(operator, "hr.scope.all"), &unit_akun, unit_sasaran),
        punya(operator, "hr.warning.sp3"),
    )
    .map_err(galat)
}

fn ringkas(daftar: &[Value]) -> Vec<SpRingkas> {
    daftar
        .iter()
        .map(|b| SpRingkas {
            tingkat: teks(b, "tingkat"),
            tanggal: teks(b, "tanggal"),
            berlaku_sampai: teks(b, "berlaku_sampai"),
            dicabut: !teks(b, "dicabut_pada").is_empty(),
        })
        .collect()
}

/// `desktop_hr_warnings`: riwayat SP satu pegawai dengan status turunan,
/// usulan tingkat pada hari ini, dan masa SP yang berlaku.
pub async fn daftar_sp(client: &TursoClient, id_karyawan: &str) -> Result<Value, CommandError> {
    client.ensure_schema_current().await?;
    let id = id_karyawan.trim();
    if id.is_empty() {
        return Err(galat("Pegawai wajib dipilih."));
    }
    let hari_ini = hari_ini(client).await?;
    let mut daftar = baris(client, SP_PEGAWAI_SQL, vec![json!(id)]).await?;
    let (tingkat, sp3_berlaku) = usulan_tingkat(&ringkas(&daftar), &hari_ini);
    for b in &mut daftar {
        let status = status_sp(
            &teks(b, "tanggal"),
            &teks(b, "berlaku_sampai"),
            !teks(b, "dicabut_pada").is_empty(),
            &hari_ini,
        );
        b["status"] = json!(status);
        b["masa_bulan"] = json!(angka(b, "masa_bulan"));
    }
    Ok(json!({
        "sp": daftar,
        "usulan": { "tingkat": tingkat, "sp3_berlaku": sp3_berlaku },
        "masa_bulan": masa_sp(client).await?,
        "hari_ini": hari_ini,
    }))
}

async fn nomor_kembar(client: &TursoClient, nomor: Option<&str>, id_sp: &str) -> Result<bool, CommandError> {
    let Some(nomor) = nomor else {
        return Ok(false);
    };
    Ok(satu(client, NOMOR_KEMBAR_SQL, vec![json!(nomor), json!(id_sp)])
        .await?
        .is_some_and(|b| angka(&b, "jumlah") > 0))
}

/// `desktop_hr_warning_save`: SP baru, atau ubah teks SP yang belum dicabut.
pub async fn simpan_sp(client: &TursoClient, operator: &OperatorUser, draft: &Value) -> Result<Value, CommandError> {
    client.ensure_schema_current().await?;
    let hari_ini = hari_ini(client).await?;
    let sah = validasi_sp(draft, &hari_ini).map_err(galat)?;
    if let Some(id_sp) = &sah.id_sp {
        let lama = satu(client, SP_SATU_SQL, vec![json!(id_sp)])
            .await?
            .ok_or_else(|| galat("SP tidak ditemukan."))?;
        if !teks(&lama, "dicabut_pada").is_empty() {
            return Err(galat(PESAN_SP_DICABUT));
        }
        if teks(&lama, "id_karyawan") != sah.id_karyawan
            || teks(&lama, "tingkat") != sah.tingkat
            || teks(&lama, "tanggal") != sah.tanggal
        {
            return Err(galat("Tingkat dan tanggal SP tidak bisa diubah. Cabut SP ini lalu buat yang baru."));
        }
        wewenang(client, operator, &sah.id_karyawan, &teks(&lama, "unit"), &sah.tingkat).await?;
        let hasil = client
            .execute_pipeline(vec![Statement::new(
                UBAH_SP_SQL,
                vec![
                    json!(id_sp),
                    json!(sah.nomor),
                    json!(sah.pelanggaran),
                    json!(sah.harapan),
                    json!(sah.penanda_nama),
                    json!(sah.penanda_jabatan),
                    json!(sah.penanda_nip),
                    json!(operator.username),
                ],
            )])
            .await?;
        if hasil.first().map_or(0, |h| h.rows_affected) == 0 {
            return Err(galat(PESAN_SP_DICABUT));
        }
        let kembar = nomor_kembar(client, sah.nomor.as_deref(), id_sp).await?;
        return Ok(json!({ "sukses": true, "id_sp": id_sp, "nomor_kembar": kembar }));
    }
    let pegawai = satu(client, PEGAWAI_SP_SQL, vec![json!(sah.id_karyawan)])
        .await?
        .ok_or_else(|| galat(super::hris_cloud::PESAN_PEGAWAI_BELUM_DI_CLOUD))?;
    let unit = teks(&pegawai, "unit");
    wewenang(client, operator, &sah.id_karyawan, &unit, &sah.tingkat).await?;
    if teks(&pegawai, "status_aktif") != "Aktif" {
        return Err(galat("SP hanya untuk pegawai aktif."));
    }
    let masuk = teks(&pegawai, "tanggal_daftar");
    if !masuk.is_empty() && sah.tanggal < masuk {
        return Err(galat("Tanggal SP tidak boleh sebelum tanggal masuk pegawai."));
    }
    let riwayat = baris(client, SP_PEGAWAI_SQL, vec![json!(sah.id_karyawan)]).await?;
    let (usulan, _) = usulan_tingkat(&ringkas(&riwayat), &sah.tanggal);
    periksa_tingkat(&sah.tingkat, usulan, sah.alasan_tingkat.as_deref()).map_err(galat)?;
    let masa_bulan = masa_sp(client).await?;
    let berlaku_sampai = akhir_masa_sp(&sah.tanggal, masa_bulan).ok_or_else(|| galat("Tanggal SP tidak valid."))?;
    let id_sp = new_id("sp-");
    client
        .execute_pipeline(vec![Statement::new(
            SIMPAN_SP_SQL,
            vec![
                json!(id_sp),
                json!(sah.id_karyawan),
                json!(sah.tingkat),
                json!(usulan),
                json!(sah.alasan_tingkat.as_ref().filter(|_| sah.tingkat != usulan)),
                json!(sah.tanggal),
                json!(masa_bulan),
                json!(berlaku_sampai),
                json!(sah.nomor),
                json!(sah.pelanggaran),
                json!(sah.harapan),
                json!(sah.penanda_nama),
                json!(sah.penanda_jabatan),
                json!(sah.penanda_nip),
                json!(unit),
                json!(operator.username),
            ],
        )])
        .await?;
    let kembar = nomor_kembar(client, sah.nomor.as_deref(), &id_sp).await?;
    Ok(json!({ "sukses": true, "id_sp": id_sp, "nomor_kembar": kembar }))
}

/// `desktop_hr_warning_revoke`: cabut dengan alasan, sekali.
pub async fn cabut_sp(client: &TursoClient, operator: &OperatorUser, id_sp: &str, alasan: &str) -> Result<Value, CommandError> {
    let id_sp = id_sp.trim();
    let alasan = teks_wajib(&json!({ "alasan": alasan }), "alasan", "Alasan pencabutan", MAKS_TEKS_SP).map_err(galat)?;
    client.ensure_schema_current().await?;
    let lama = satu(client, SP_SATU_SQL, vec![json!(id_sp)])
        .await?
        .ok_or_else(|| galat("SP tidak ditemukan."))?;
    if !teks(&lama, "dicabut_pada").is_empty() {
        return Err(galat(PESAN_SP_DICABUT));
    }
    wewenang(client, operator, &teks(&lama, "id_karyawan"), &teks(&lama, "unit"), "").await?;
    let hasil = client
        .execute_pipeline(vec![Statement::new(
            CABUT_SP_SQL,
            vec![json!(id_sp), json!(operator.username), json!(alasan)],
        )])
        .await?;
    if hasil.first().map_or(0, |h| h.rows_affected) == 0 {
        return Err(galat(PESAN_SP_DICABUT));
    }
    Ok(json!({ "sukses": true }))
}

// ── Pegawai keluar: aturan murni (§22.2.2) ──

pub const MAKS_TEKS_KELUAR: usize = 1000;

pub const PESAN_SUDAH_KELUAR: &str =
    "Pegawai ini sudah keluar. Batalkan proses keluarnya di Kepegawaian untuk mengaktifkannya lagi.";
pub const PESAN_HAPUS_GURU_KELUAR: &str =
    "Guru ini sudah keluar, jadi datanya disimpan untuk surat keterangan dan rekap lama. Proses keluarnya diurus di Kepegawaian, tab Keluar.";
pub const PESAN_SESI_KELUAR: &str =
    "Akun ini tertaut ke pegawai yang sudah keluar dan tidak bisa dipakai lagi. Hubungi Superadmin.";
pub const PESAN_SUPERADMIN_TERAKHIR: &str =
    "Pegawai ini tertaut ke akun Superadmin aktif terakhir. Pindahkan peran Superadmin ke akun lain lebih dulu.";
pub const PESAN_BLOKIR_JADWAL: &str =
    "Masih ada jadwal mengajar aktif di semester yang berlanjut sesudah hari terakhir. Alihkan ke guru lain di Jadwal dulu.";
pub const PESAN_BLOKIR_WALI: &str =
    "Masih menjadi wali kelas di semester yang berlanjut sesudah hari terakhir. Ganti wali kelasnya di Rombel dulu.";
pub const PESAN_KELUAR_BERLAKU: &str = "Proses keluar ini sudah berlaku.";
pub const PESAN_KELUAR_DIBATALKAN: &str = "Proses keluar ini sudah dibatalkan.";
pub const PESAN_BELUM_JATUH_TEMPO: &str = "Proses keluar baru bisa diberlakukan mulai hari terakhir bekerja.";
pub const PESAN_KELUAR_TERBUKA: &str = "Pegawai ini sudah punya proses keluar yang belum dibatalkan.";

/// Cermin `statusKeluar`. Tidak disimpan.
pub fn status_keluar(tanggal_terakhir: &str, berlaku: bool, dibatalkan: bool, hari_ini: &str) -> &'static str {
    if dibatalkan {
        "Dibatalkan"
    } else if berlaku {
        "Berlaku"
    } else if tanggal_terakhir <= hari_ini {
        "Jatuh tempo"
    } else {
        "Dijadwalkan"
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct KeluarSah {
    pub id_keluar: Option<String>,
    pub id_karyawan: String,
    pub id_alasan: String,
    pub id_sp: Option<String>,
    pub tanggal_pemberitahuan: Option<String>,
    pub tanggal_terakhir: String,
    pub keterangan: Option<String>,
    pub kartu_ditarik: bool,
    pub catatan_checklist: Option<String>,
}

/// Cermin `validasiKeluar`. Hanya bentuk isian; status pegawai, tanggal
/// masuk, alasan aktif, dan wewenang diperiksa pemanggil. Hari terakhir boleh
/// di masa depan.
pub fn validasi_keluar(draft: &Value) -> Result<KeluarSah, String> {
    let id_karyawan = payload_text(draft, "id_karyawan").ok_or("Pegawai wajib dipilih.")?;
    let id_alasan = payload_text(draft, "id_alasan").ok_or("Alasan keluar wajib dipilih.")?;
    let tanggal_terakhir = payload_text(draft, "tanggal_terakhir")
        .filter(|t| tanggal_valid(t))
        .ok_or("Hari terakhir bekerja tidak valid.")?;
    let tanggal_pemberitahuan = payload_text(draft, "tanggal_pemberitahuan");
    if let Some(t) = &tanggal_pemberitahuan {
        if !tanggal_valid(t) {
            return Err("Tanggal pemberitahuan tidak valid.".into());
        }
        if *t > tanggal_terakhir {
            return Err("Tanggal pemberitahuan tidak boleh sesudah hari terakhir bekerja.".into());
        }
    }
    Ok(KeluarSah {
        id_keluar: payload_text(draft, "id_keluar"),
        id_karyawan,
        id_alasan,
        id_sp: payload_text(draft, "id_sp"),
        tanggal_pemberitahuan,
        tanggal_terakhir,
        keterangan: teks_opsional(draft, "keterangan", "Keterangan", MAKS_TEKS_KELUAR)?,
        kartu_ditarik: draft.get("kartu_ditarik").and_then(Value::as_bool).unwrap_or(false),
        catatan_checklist: teks_opsional(draft, "catatan_checklist", "Catatan checklist", MAKS_TEKS_KELUAR)?,
    })
}

// ── Normalisasi zombie (Q-80) dan gaji terakhir (§22.2.4) ──

/// Status yang boleh ditulis penulis `master_data` mana pun: selama
/// `id_keluar` terisi, tetap Nonaktif. `{baru}` = nilai kiriman. Cermin
/// `statusAktifKeluar`.
pub const STATUS_AKTIF_KELUAR_SQL: &str =
    "CASE WHEN COALESCE(master_data.id_keluar, '') <> '' THEN 'Nonaktif' ELSE {baru} END";
/// Padanan untuk `tanggal_selesai_aktif`. Cermin `tanggalSelesaiKeluar`.
pub const TANGGAL_SELESAI_KELUAR_SQL: &str =
    "CASE WHEN COALESCE(master_data.id_keluar, '') <> '' THEN master_data.tanggal_selesai_aktif ELSE {baru} END";

pub fn status_aktif_keluar(baru: &str) -> String {
    STATUS_AKTIF_KELUAR_SQL.replace("{baru}", baru)
}

pub fn tanggal_selesai_keluar(baru: &str) -> String {
    TANGGAL_SELESAI_KELUAR_SQL.replace("{baru}", baru)
}

/// Pegawai keluar ikut rekap gaji periode yang memuat hari terakhirnya walau
/// tanpa absensi (`?1` = awal periode). Disisipkan harfiah di predikat rekap
/// `payroll/commands.rs` dan `payroll-recap.ts`.
pub const KELUAR_DI_PERIODE_SQL: &str = "OR (md.id_keluar IS NOT NULL AND md.tanggal_selesai_aktif >= ?1)";

/// `master_data` lokal ber-`id_keluar` (penjaga sesi dan penulis lokal).
pub const KELUAR_LOKAL_SQL: &str =
    "SELECT COALESCE(id_keluar, '') FROM master_data WHERE id_unik = ?1 AND COALESCE(id_keluar, '') <> '' LIMIT 1;";

/// Pegawai lokal yang sudah keluar; personil yang belum ada di perangkat = tidak.
pub fn sudah_keluar_lokal(connection: &rusqlite::Connection, id_karyawan: &str) -> Result<bool, CommandError> {
    use rusqlite::OptionalExtension;
    let id = id_karyawan.trim();
    if id.is_empty() {
        return Ok(false);
    }
    connection
        .query_row(KELUAR_LOKAL_SQL, [id], |r| r.get::<_, String>(0))
        .optional()
        .map(|v| v.is_some())
        .map_err(|_| CommandError::internal())
}

/// Penulis lokal: mengaktifkan pegawai ber-`id_keluar` ditolak (§22.2.2).
pub fn tolak_aktifkan_keluar(
    connection: &rusqlite::Connection,
    id_karyawan: &str,
    status_baru: Option<&str>,
) -> Result<(), CommandError> {
    if status_baru == Some("Aktif") && sudah_keluar_lokal(connection, id_karyawan)? {
        return Err(galat(PESAN_SUDAH_KELUAR));
    }
    Ok(())
}

/// Penjaga sesi Desktop/Mobile (temuan 3): akun yang tertaut ke pegawai
/// keluar di SQLite perangkat ditolak, termasuk Superadmin.
pub fn tolak_sesi_keluar(connection: &rusqlite::Connection, id_karyawan: Option<&str>) -> Result<(), CommandError> {
    if sudah_keluar_lokal(connection, id_karyawan.unwrap_or(""))? {
        return Err(CommandError::new("DESKTOP_SESSION_MISSING", PESAN_SESI_KELUAR));
    }
    Ok(())
}

// ── SQL keluar, dieja harfiah sama di `validations/hr-keluar.ts` ──
// Checklist: `?1` = id pegawai, `?2` = hari terakhir bekerja.

/// Memblokir: jadwal aktif di semester yang berlanjut sesudah hari terakhir.
pub const JADWAL_AKTIF_KELUAR_SQL: &str = "SELECT j.id_jadwal, j.hari, j.jam_ke, COALESCE(r.nama_rombel, j.id_rombel) AS nama_rombel, COALESCE(mp.nama_mapel, j.id_mapel) AS nama_mapel, t.nama_tahun, t.semester FROM jadwal_mengajar j JOIN akademik_tahun_ajaran t ON t.id_tahun_ajaran = j.id_tahun_ajaran LEFT JOIN akademik_rombel r ON r.id_rombel = j.id_rombel LEFT JOIN akademik_mapel mp ON mp.id_mapel = j.id_mapel WHERE j.id_guru = ?1 AND j.is_aktif = 1 AND t.tanggal_selesai > ?2 ORDER BY t.tanggal_mulai, j.hari, CAST(j.jam_ke AS INTEGER), j.jam_ke, j.id_jadwal LIMIT 200;";
/// Memblokir: wali rombel aktif di semester yang berlanjut sesudah hari terakhir.
pub const WALI_KELUAR_SQL: &str = "SELECT r.id_rombel, r.nama_rombel, t.nama_tahun, t.semester FROM akademik_rombel r JOIN akademik_tahun_ajaran t ON t.id_tahun_ajaran = r.id_tahun_ajaran WHERE r.id_wali_kelas = ?1 AND r.is_aktif = 1 AND t.tanggal_selesai > ?2 ORDER BY t.tanggal_mulai, r.nama_rombel, r.id_rombel LIMIT 50;";
/// Tanda: tugas tambahan yang masih berjalan sesudah hari terakhir.
pub const TUGAS_KELUAR_SQL: &str = "SELECT t.id_tugas, COALESCE(j.nama, t.id_jenis) AS nama_jenis, t.tahun_ajaran, t.tanggal_mulai, COALESCE(t.tanggal_selesai, '') AS tanggal_selesai FROM hr_tugas_tambahan t LEFT JOIN hr_tugas_jenis j ON j.id_jenis = t.id_jenis WHERE t.id_karyawan = ?1 AND t.dibatalkan_pada IS NULL AND t.id_jenis <> 'tgs-wali-kelas' AND (COALESCE(t.tanggal_selesai, '') = '' OR t.tanggal_selesai > ?2) ORDER BY t.tanggal_mulai, t.id_tugas LIMIT 50;";
/// Tanda: barang dipinjam belum kembali penuh. Predikat "belum kembali"
/// salinan harfiah `inventory::list_loans`.
pub const PINJAMAN_PERSONIL_SQL: &str = "SELECT * FROM (SELECT p.id_mutasi, b.nama_barang, b.kode_barang, b.satuan, p.tanggal, p.jumlah, COALESCE((SELECT SUM(r.jumlah) FROM inventory_mutasi r WHERE r.id_ref = p.id_mutasi AND r.alasan = 'Pengembalian' AND NOT EXISTS (SELECT 1 FROM inventory_mutasi rb WHERE rb.id_mutasi = 'batal-' || r.id_mutasi)), 0) AS kembali, b.desimal FROM inventory_mutasi p JOIN inventory_barang b ON b.id_barang = p.id_barang WHERE p.alasan = 'Peminjaman' AND p.penerima_tipe = 'Personil' AND p.penerima_id = ?1 AND NOT EXISTS (SELECT 1 FROM inventory_mutasi pb WHERE pb.id_mutasi = 'batal-' || p.id_mutasi)) WHERE jumlah > kembali ORDER BY tanggal, id_mutasi LIMIT 200;";
/// Tanda: kasbon Disetujui dengan sisa efektif (`pokok − BAYAR − PENDING`,
/// salinan harfiah `loan.rs`) > 0.
pub const KASBON_KELUAR_SQL: &str = "SELECT * FROM (SELECT p.id_pinjaman, p.pokok, p.cicilan, COALESCE(p.tanggal_cair, '') AS tanggal_cair, p.pokok - COALESCE((SELECT SUM(m.jumlah) FROM keu_pinjaman_mutasi m WHERE m.id_pinjaman = p.id_pinjaman AND m.jenis IN ('Angsuran Gaji', 'Pelunasan Tunai')), 0) - COALESCE((SELECT SUM(CAST(json_extract(k.value, '$.jumlah') AS INTEGER)) FROM payroll_items i JOIN payroll_runs r ON r.id = i.payroll_run_id, json_each(i.breakdown_snapshot, '$.kasbon') k WHERE r.status NOT IN ('PAID', 'REJECTED') AND json_extract(k.value, '$.id_pinjaman') = p.id_pinjaman), 0) AS sisa FROM keu_pinjaman p WHERE p.id_karyawan = ?1 AND p.status = 'Disetujui') WHERE sisa > 0 ORDER BY tanggal_cair, id_pinjaman LIMIT 50;";
/// Tanda: rapel Menunggu (predikat salinan harfiah `rapel::MENUNGGU_SQL`).
pub const RAPEL_KELUAR_SQL: &str = "SELECT rp.id_rapel, rp.jumlah, rp.period_start, rp.period_end FROM payroll_rapel rp WHERE rp.id_karyawan = ?1 AND rp.dibatalkan_pada IS NULL AND NOT EXISTS (SELECT 1 FROM payroll_items i JOIN payroll_runs r ON r.id = i.payroll_run_id, json_each(CASE WHEN json_valid(i.breakdown_snapshot) THEN i.breakdown_snapshot ELSE '{}' END, '$.rapel') k WHERE i.id_karyawan = rp.id_karyawan AND r.status <> 'REJECTED' AND json_extract(k.value, '$.id_rapel') = rp.id_rapel) ORDER BY rp.period_start, rp.id_rapel LIMIT 50;";
/// Tanda: pengajuan Menunggu atau berlaku sesudah hari terakhir (predikat
/// salinan harfiah `PENGAJUAN_AKTIF_ORANG_SQL`).
pub const PENGAJUAN_SESUDAH_SQL: &str = "SELECT p.id_pengajuan, p.tanggal_mulai, p.tanggal_selesai, COALESCE(j.nama, p.id_jenis) AS nama_jenis FROM hr_pengajuan p LEFT JOIN hr_jenis_pengajuan j ON j.id_jenis = p.id_jenis WHERE p.id_karyawan = ?1 AND p.tanggal_selesai > ?2 AND NOT EXISTS (SELECT 1 FROM hr_pengajuan_keputusan b WHERE b.id_pengajuan = p.id_pengajuan AND b.jenis = 'Batal') AND COALESCE((SELECT k.jenis FROM hr_pengajuan_keputusan k WHERE k.id_pengajuan = p.id_pengajuan AND k.sidik = p.sidik AND k.jenis IN ('Setujui', 'Tolak', 'Setujui Urgent') ORDER BY k.diterima_cloud IS NULL, k.diterima_cloud, k.waktu_perangkat, k.id_keputusan LIMIT 1), '') <> 'Tolak' ORDER BY p.tanggal_mulai, p.id_pengajuan LIMIT 50;";
/// Tanda: JP yang ia gantikan sesudah hari terakhir (predikat `PENANGANAN_SQL`).
pub const JP_PENGGANTI_SESUDAH_SQL: &str = "SELECT h.id_penanganan, h.tanggal, COALESCE(h.jam_ke, '') AS jam_ke, COALESCE(mg.nama, p.id_karyawan) AS nama_guru FROM hr_jp_penanganan h JOIN hr_pengajuan p ON p.id_pengajuan = h.id_pengajuan LEFT JOIN master_data mg ON mg.id_unik = p.id_karyawan WHERE h.id_guru_pengganti = ?1 AND h.tanggal > ?2 AND NOT EXISTS (SELECT 1 FROM hr_pengajuan_keputusan b WHERE b.id_pengajuan = p.id_pengajuan AND b.jenis = 'Batal') AND COALESCE((SELECT k.jenis FROM hr_pengajuan_keputusan k WHERE k.id_pengajuan = p.id_pengajuan AND k.sidik = p.sidik AND k.jenis IN ('Setujui', 'Tolak', 'Setujui Urgent') ORDER BY k.diterima_cloud IS NULL, k.diterima_cloud, k.waktu_perangkat, k.id_keputusan LIMIT 1), '') <> 'Tolak' ORDER BY h.tanggal, h.id_penanganan LIMIT 100;";
/// Tanda (temuan 5): run masa terakhir yang sudah dibuat memakai TER biasa.
pub const RUN_MASA_TERAKHIR_SQL: &str = "SELECT id, period_start, period_end, status FROM payroll_runs WHERE status <> 'REJECTED' AND period_end >= ?2 AND substr(period_end, 1, 7) = substr(?2, 1, 7) ORDER BY period_start, id LIMIT 20;";
/// Alfa sistem sesudah hari terakhir: disebut di dialog Berlakukan, tidak dihapus.
pub const ALFA_SESUDAH_SQL: &str = "SELECT COUNT(*) AS jumlah FROM absensi_harian WHERE id_karyawan = ?1 AND tanggal > ?2 AND sumber = 'Generate Sistem';";
/// Akun operator tertaut: dinonaktifkan otomatis saat Berlakukan.
pub const AKUN_TERTAUT_SQL: &str = "SELECT m.id, m.username, m.nama_operator, COALESCE(m.status, 'Aktif') AS status, COALESCE(r.is_superadmin, 0) AS is_superadmin FROM master_operator m LEFT JOIN app_role r ON r.id = m.role_id WHERE m.id_karyawan = ?1 ORDER BY m.username LIMIT 20;";
pub const SUPERADMIN_AKTIF_SQL: &str = "SELECT COUNT(*) AS jumlah FROM master_operator m JOIN app_role r ON r.id = m.role_id WHERE r.is_superadmin = 1 AND COALESCE(m.status, 'Aktif') = 'Aktif';";

pub const PEGAWAI_KELUAR_SQL: &str = "SELECT m.id_unik, m.nama, COALESCE(m.status_aktif, 'Aktif') AS status_aktif, COALESCE(m.tanggal_daftar, '') AS tanggal_daftar, COALESCE(m.unit, '') AS unit, COALESCE(m.id_keluar, '') AS id_keluar FROM master_data m WHERE m.id_unik = ?1 AND LOWER(TRIM(COALESCE(m.jenis_personil, ''))) <> 'siswa' AND NOT EXISTS (SELECT 1 FROM siswa_data sd WHERE sd.id_siswa = m.id_unik) LIMIT 1;";
pub const ALASAN_KELUAR_SQL: &str = "SELECT id_alasan, nama, pengali_up, pengali_upmk, uph, kompensasi_pkwt, uang_pisah, is_aktif, COALESCE(dasar_hukum, '') AS dasar_hukum FROM hr_keluar_alasan ORDER BY is_aktif DESC, nama, id_alasan LIMIT 100;";
pub const ALASAN_SATU_SQL: &str = "SELECT id_alasan, nama, is_aktif FROM hr_keluar_alasan WHERE id_alasan = ?1 LIMIT 1;";
pub const DAFTAR_KELUAR_SQL: &str = "SELECT k.id_keluar, k.id_karyawan, COALESCE(m.nama, k.id_karyawan) AS nama, COALESCE(m.unit, '') AS unit, k.id_alasan, COALESCE(k.alasan_nama, '') AS alasan_nama, COALESCE(k.id_sp, '') AS id_sp, COALESCE(k.status_kepegawaian, '') AS status_kepegawaian, COALESCE(k.tanggal_pemberitahuan, '') AS tanggal_pemberitahuan, k.tanggal_terakhir, COALESCE(k.keterangan, '') AS keterangan, COALESCE(k.masa_kerja_mulai, '') AS masa_kerja_mulai, k.kartu_ditarik, COALESCE(k.catatan_checklist, '') AS catatan_checklist, k.dicatat_oleh, k.created_at, COALESCE(k.diubah_oleh, '') AS diubah_oleh, COALESCE(k.diubah_pada, '') AS diubah_pada, COALESCE(k.berlaku_oleh, '') AS berlaku_oleh, COALESCE(k.berlaku_pada, '') AS berlaku_pada, COALESCE(k.dibatalkan_oleh, '') AS dibatalkan_oleh, COALESCE(k.dibatalkan_pada, '') AS dibatalkan_pada, COALESCE(k.alasan_batal, '') AS alasan_batal FROM hr_keluar k LEFT JOIN master_data m ON m.id_unik = k.id_karyawan ORDER BY k.tanggal_terakhir DESC, k.created_at DESC, k.id_keluar LIMIT 500;";
pub const KELUAR_SATU_SQL: &str = "SELECT k.id_keluar, k.id_karyawan, COALESCE(m.nama, k.id_karyawan) AS nama, COALESCE(m.unit, '') AS unit, k.id_alasan, COALESCE(k.alasan_nama, '') AS alasan_nama, COALESCE(k.id_sp, '') AS id_sp, COALESCE(k.status_kepegawaian, '') AS status_kepegawaian, COALESCE(k.tanggal_pemberitahuan, '') AS tanggal_pemberitahuan, k.tanggal_terakhir, COALESCE(k.keterangan, '') AS keterangan, COALESCE(k.masa_kerja_mulai, '') AS masa_kerja_mulai, k.kartu_ditarik, COALESCE(k.catatan_checklist, '') AS catatan_checklist, k.dicatat_oleh, k.created_at, COALESCE(k.diubah_oleh, '') AS diubah_oleh, COALESCE(k.diubah_pada, '') AS diubah_pada, COALESCE(k.berlaku_oleh, '') AS berlaku_oleh, COALESCE(k.berlaku_pada, '') AS berlaku_pada, COALESCE(k.dibatalkan_oleh, '') AS dibatalkan_oleh, COALESCE(k.dibatalkan_pada, '') AS dibatalkan_pada, COALESCE(k.alasan_batal, '') AS alasan_batal FROM hr_keluar k LEFT JOIN master_data m ON m.id_unik = k.id_karyawan WHERE k.id_keluar = ?1 LIMIT 1;";
/// Proses baru hanya bila pegawai belum punya proses yang tidak dibatalkan;
/// dijaga di transaksi cloud yang sama.
pub const SIMPAN_KELUAR_SQL: &str = "INSERT INTO hr_keluar (id_keluar, id_karyawan, id_alasan, alasan_nama, id_sp, status_kepegawaian, tanggal_pemberitahuan, tanggal_terakhir, keterangan, masa_kerja_mulai, kartu_ditarik, catatan_checklist, dicatat_oleh, created_at) SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, datetime('now') WHERE NOT EXISTS (SELECT 1 FROM hr_keluar x WHERE x.id_karyawan = ?2 AND x.dibatalkan_pada IS NULL);";
/// Ubah hanya selama belum berlaku dan belum dibatalkan.
pub const UBAH_KELUAR_SQL: &str = "UPDATE hr_keluar SET id_alasan = ?3, alasan_nama = ?4, id_sp = ?5, status_kepegawaian = ?6, tanggal_pemberitahuan = ?7, tanggal_terakhir = ?8, keterangan = ?9, masa_kerja_mulai = ?10, kartu_ditarik = ?11, catatan_checklist = ?12, diubah_oleh = ?13, diubah_pada = datetime('now') WHERE id_keluar = ?1 AND id_karyawan = ?2 AND berlaku_pada IS NULL AND dibatalkan_pada IS NULL;";

/// Berlakukan dalam satu batch (`?1` id keluar, `?2` operator, `?3` potret
/// checklist, `?4` id pegawai). Statement pertama memeriksa ulang blokir;
/// statement berikutnya hanya berjalan bila proses itu sudah berlaku dan
/// tidak dibatalkan, jadi tekan ganda tidak menggandakan apa pun.
pub const BERLAKUKAN_SQL: [&str; 4] = [
    "UPDATE hr_keluar SET berlaku_oleh = ?2, berlaku_pada = datetime('now'), checklist_saat_berlaku = ?3 WHERE id_keluar = ?1 AND id_karyawan = ?4 AND berlaku_pada IS NULL AND dibatalkan_pada IS NULL AND tanggal_terakhir <= date('now', '+7 hours') AND NOT EXISTS (SELECT 1 FROM jadwal_mengajar j JOIN akademik_tahun_ajaran t ON t.id_tahun_ajaran = j.id_tahun_ajaran WHERE j.id_guru = ?4 AND j.is_aktif = 1 AND t.tanggal_selesai > hr_keluar.tanggal_terakhir) AND NOT EXISTS (SELECT 1 FROM akademik_rombel r JOIN akademik_tahun_ajaran t ON t.id_tahun_ajaran = r.id_tahun_ajaran WHERE r.id_wali_kelas = ?4 AND r.is_aktif = 1 AND t.tanggal_selesai > hr_keluar.tanggal_terakhir);",
    "UPDATE master_data SET status_aktif = 'Nonaktif', tanggal_selesai_aktif = (SELECT k.tanggal_terakhir FROM hr_keluar k WHERE k.id_keluar = ?1), id_keluar = ?1 WHERE id_unik = ?4 AND EXISTS (SELECT 1 FROM hr_keluar k WHERE k.id_keluar = ?1 AND k.id_karyawan = ?4 AND k.berlaku_pada IS NOT NULL AND k.dibatalkan_pada IS NULL);",
    "UPDATE master_operator SET status = 'Nonaktif', updated_at = datetime('now') WHERE id_karyawan = ?4 AND COALESCE(status, 'Aktif') = 'Aktif' AND EXISTS (SELECT 1 FROM hr_keluar k WHERE k.id_keluar = ?1 AND k.id_karyawan = ?4 AND k.berlaku_pada IS NOT NULL AND k.dibatalkan_pada IS NULL);",
    "UPDATE app_session SET revoked_at = datetime('now'), revoked_reason = 'pegawai-keluar' WHERE revoked_at IS NULL AND operator_id IN (SELECT id FROM master_operator WHERE id_karyawan = ?4) AND EXISTS (SELECT 1 FROM hr_keluar k WHERE k.id_keluar = ?1 AND k.id_karyawan = ?4 AND k.berlaku_pada IS NOT NULL AND k.dibatalkan_pada IS NULL);",
];
/// Batalkan (`?1` id keluar, `?2` operator, `?3` alasan): `master_data`
/// dikembalikan hanya bila proses ITU yang menonaktifkannya; akun operator
/// tidak diaktifkan lagi (Q-79). Statement pertama hanya memakai `?1`.
pub const BATALKAN_SQL: [&str; 2] = [
    "UPDATE master_data SET status_aktif = 'Aktif', tanggal_selesai_aktif = NULL, id_keluar = NULL WHERE id_keluar = ?1 AND EXISTS (SELECT 1 FROM hr_keluar k WHERE k.id_keluar = ?1 AND k.dibatalkan_pada IS NULL);",
    "UPDATE hr_keluar SET dibatalkan_oleh = ?2, dibatalkan_pada = datetime('now'), alasan_batal = ?3 WHERE id_keluar = ?1 AND dibatalkan_pada IS NULL;",
];

// ── Pegawai keluar: akses cloud ──

fn dengan_status_keluar(b: &mut Value, hari_ini: &str) {
    let status = status_keluar(
        &teks(b, "tanggal_terakhir"),
        !teks(b, "berlaku_pada").is_empty(),
        !teks(b, "dibatalkan_pada").is_empty(),
        hari_ini,
    );
    b["status"] = json!(status);
    b["kartu_ditarik"] = json!(angka(b, "kartu_ditarik") == 1);
}

/// `desktop_hr_offboardings`: semua proses keluar dengan status turunan,
/// beserta daftar alasan.
pub async fn daftar_keluar(client: &TursoClient) -> Result<Value, CommandError> {
    client.ensure_schema_current().await?;
    let hari_ini = hari_ini(client).await?;
    let mut keluar = baris(client, DAFTAR_KELUAR_SQL, vec![]).await?;
    for b in &mut keluar {
        dengan_status_keluar(b, &hari_ini);
    }
    Ok(json!({
        "keluar": keluar,
        "alasan": alasan_json(client).await?,
        "hari_ini": hari_ini,
    }))
}

async fn alasan_json(client: &TursoClient) -> Result<Vec<Value>, CommandError> {
    let mut alasan = baris(client, ALASAN_KELUAR_SQL, vec![]).await?;
    for a in &mut alasan {
        for kunci in ["pengali_up", "pengali_upmk"] {
            a[kunci] = json!(angka(a, kunci));
        }
        for kunci in ["uph", "kompensasi_pkwt", "uang_pisah", "is_aktif"] {
            a[kunci] = json!(angka(a, kunci) == 1);
        }
    }
    Ok(alasan)
}

/// Checklist keluar dari cloud (§22.2.2). `sisa_cuti` dihitung pemanggil:
/// Desktop dari SQLite perangkat, Web dari database yang sama.
pub async fn checklist_keluar(
    client: &TursoClient,
    id_karyawan: &str,
    tanggal_terakhir: &str,
    sisa_cuti: Value,
) -> Result<Value, CommandError> {
    let args = || vec![json!(id_karyawan), json!(tanggal_terakhir)];
    let jadwal = baris(client, JADWAL_AKTIF_KELUAR_SQL, args()).await?;
    let wali = baris(client, WALI_KELUAR_SQL, args()).await?;
    let mut kasbon = baris(client, KASBON_KELUAR_SQL, vec![json!(id_karyawan)]).await?;
    for k in &mut kasbon {
        for kunci in ["pokok", "cicilan", "sisa"] {
            k[kunci] = json!(angka(k, kunci));
        }
    }
    let sisa_kasbon: i64 = kasbon.iter().map(|k| angka(k, "sisa")).sum();
    let mut rapel = baris(client, RAPEL_KELUAR_SQL, vec![json!(id_karyawan)]).await?;
    for r in &mut rapel {
        r["jumlah"] = json!(angka(r, "jumlah"));
    }
    let mut akun = baris(client, AKUN_TERTAUT_SQL, vec![json!(id_karyawan)]).await?;
    for a in &mut akun {
        a["id"] = json!(angka(a, "id"));
        a["is_superadmin"] = json!(angka(a, "is_superadmin") == 1);
    }
    let alfa = satu(client, ALFA_SESUDAH_SQL, args()).await?.map_or(0, |b| angka(&b, "jumlah"));
    Ok(json!({
        "blokir": jadwal.len() + wali.len(),
        "jadwal": jadwal,
        "wali": wali,
        "tugas": baris(client, TUGAS_KELUAR_SQL, args()).await?,
        "barang": baris(client, PINJAMAN_PERSONIL_SQL, vec![json!(id_karyawan)]).await?,
        "kasbon": kasbon,
        "sisa_kasbon": sisa_kasbon,
        "sisa_cuti": sisa_cuti,
        "rapel": rapel,
        "pengajuan": baris(client, PENGAJUAN_SESUDAH_SQL, args()).await?,
        "jp_pengganti": baris(client, JP_PENGGANTI_SESUDAH_SQL, args()).await?,
        "run_masa_terakhir": baris(client, RUN_MASA_TERAKHIR_SQL, args()).await?,
        "alfa_sesudah": alfa,
        "akun": akun,
    }))
}

/// Status kepegawaian kini pada `tanggal` (`hris::STATUS_KINI_SQL` dipakai utuh).
async fn status_kini(client: &TursoClient, id_karyawan: &str, tanggal: &str) -> Result<String, CommandError> {
    Ok(baris(client, super::hris::STATUS_KINI_SQL, vec![json!(tanggal)])
        .await?
        .into_iter()
        .find(|b| teks(b, "id_unik") == id_karyawan)
        .map(|b| teks(&b, "status"))
        .unwrap_or_default())
}

async fn header_keluar(client: &TursoClient, id_keluar: &str) -> Result<Value, CommandError> {
    satu(client, KELUAR_SATU_SQL, vec![json!(id_keluar.trim())])
        .await?
        .ok_or_else(|| galat("Proses keluar tidak ditemukan."))
}

/// Cakupan unit dan "bukan diri sendiri" dari sesi, dengan unit pegawai kini.
async fn wewenang_keluar(client: &TursoClient, operator: &OperatorUser, id_karyawan: &str) -> Result<(), CommandError> {
    let unit = satu(client, PEGAWAI_KELUAR_SQL, vec![json!(id_karyawan)])
        .await?
        .map(|b| teks(&b, "unit"))
        .unwrap_or_default();
    wewenang(client, operator, id_karyawan, &unit, "").await
}

/// `desktop_hr_offboarding`: rincian proses (`id_keluar`) atau pratinjau
/// (`id_karyawan` + `tanggal_terakhir`) beserta checklist.
pub async fn rincian_keluar(
    client: &TursoClient,
    id_keluar: Option<&str>,
    id_karyawan: Option<&str>,
    tanggal_terakhir: Option<&str>,
    sisa_cuti: impl FnOnce(&str, &str) -> Result<Value, CommandError>,
) -> Result<Value, CommandError> {
    client.ensure_schema_current().await?;
    let hari_ini = hari_ini(client).await?;
    let (header, id, tanggal) = match id_keluar.map(str::trim).filter(|t| !t.is_empty()) {
        Some(id_keluar) => {
            let mut h = header_keluar(client, id_keluar).await?;
            dengan_status_keluar(&mut h, &hari_ini);
            let id = teks(&h, "id_karyawan");
            let tanggal = teks(&h, "tanggal_terakhir");
            (Some(h), id, tanggal)
        }
        None => {
            let id = id_karyawan.map(str::trim).filter(|t| !t.is_empty()).ok_or_else(|| galat("Pegawai wajib dipilih."))?;
            let tanggal = tanggal_terakhir
                .map(str::trim)
                .filter(|t| tanggal_valid(t))
                .ok_or_else(|| galat("Hari terakhir bekerja tidak valid."))?;
            (None, id.to_owned(), tanggal.to_owned())
        }
    };
    let pegawai = satu(client, PEGAWAI_KELUAR_SQL, vec![json!(id)])
        .await?
        .ok_or_else(|| galat(super::hris_cloud::PESAN_PEGAWAI_BELUM_DI_CLOUD))?;
    let cuti = sisa_cuti(&id, &tanggal)?;
    Ok(json!({
        "keluar": header,
        "pegawai": pegawai,
        "status_kepegawaian": status_kini(client, &id, &tanggal).await?,
        "checklist": checklist_keluar(client, &id, &tanggal, cuti).await?,
        "alasan": alasan_json(client).await?,
        "hari_ini": hari_ini,
    }))
}

/// `desktop_hr_offboarding_save`: catat atau ubah proses yang belum berlaku.
/// `master_data` tidak berubah: pegawai tetap scan, ikut Alfa dan gaji.
pub async fn simpan_keluar(client: &TursoClient, operator: &OperatorUser, draft: &Value) -> Result<Value, CommandError> {
    client.ensure_schema_current().await?;
    let sah = validasi_keluar(draft).map_err(galat)?;
    let pegawai = satu(client, PEGAWAI_KELUAR_SQL, vec![json!(sah.id_karyawan)])
        .await?
        .ok_or_else(|| galat(super::hris_cloud::PESAN_PEGAWAI_BELUM_DI_CLOUD))?;
    wewenang(client, operator, &sah.id_karyawan, &teks(&pegawai, "unit"), "").await?;
    if let Some(id_keluar) = &sah.id_keluar {
        let lama = header_keluar(client, id_keluar).await?;
        if teks(&lama, "id_karyawan") != sah.id_karyawan {
            return Err(galat("Pegawai pada proses keluar tidak bisa diganti."));
        }
        if !teks(&lama, "dibatalkan_pada").is_empty() {
            return Err(galat(PESAN_KELUAR_DIBATALKAN));
        }
        if !teks(&lama, "berlaku_pada").is_empty() {
            return Err(galat(PESAN_KELUAR_BERLAKU));
        }
    } else if teks(&pegawai, "status_aktif") != "Aktif" {
        return Err(galat("Proses keluar hanya untuk pegawai aktif."));
    }
    let masuk = teks(&pegawai, "tanggal_daftar");
    if !masuk.is_empty() && sah.tanggal_terakhir < masuk {
        return Err(galat("Hari terakhir bekerja tidak boleh sebelum tanggal masuk pegawai."));
    }
    let alasan = satu(client, ALASAN_SATU_SQL, vec![json!(sah.id_alasan)])
        .await?
        .ok_or_else(|| galat("Alasan keluar tidak ditemukan."))?;
    if angka(&alasan, "is_aktif") != 1 {
        return Err(galat("Alasan keluar sudah nonaktif."));
    }
    let id = sah.id_keluar.clone().unwrap_or_else(|| new_id("klr-"));
    let args = vec![
        json!(id),
        json!(sah.id_karyawan),
        json!(sah.id_alasan),
        json!(teks(&alasan, "nama")),
        json!(sah.id_sp),
        json!(status_kini(client, &sah.id_karyawan, &sah.tanggal_terakhir).await?),
        json!(sah.tanggal_pemberitahuan),
        json!(sah.tanggal_terakhir),
        json!(sah.keterangan),
        json!(Some(masuk).filter(|m| !m.is_empty())),
        json!(i64::from(sah.kartu_ditarik)),
        json!(sah.catatan_checklist),
        json!(operator.username),
    ];
    let sql = if sah.id_keluar.is_some() { UBAH_KELUAR_SQL } else { SIMPAN_KELUAR_SQL };
    let hasil = client.execute_pipeline(vec![Statement::new(sql, args)]).await?;
    if hasil.first().map_or(0, |h| h.rows_affected) == 0 {
        return Err(galat(if sah.id_keluar.is_some() {
            PESAN_KELUAR_BERLAKU
        } else {
            PESAN_KELUAR_TERBUKA
        }));
    }
    Ok(json!({ "sukses": true, "id_keluar": id }))
}

/// `desktop_hr_offboarding_apply`: Berlakukan dalam satu batch cloud.
pub async fn berlakukan_keluar(
    client: &TursoClient,
    operator: &OperatorUser,
    id_keluar: &str,
    sisa_cuti: impl FnOnce(&str, &str) -> Result<Value, CommandError>,
) -> Result<Value, CommandError> {
    client.ensure_schema_current().await?;
    let hari_ini = hari_ini(client).await?;
    let header = header_keluar(client, id_keluar).await?;
    let id_keluar = teks(&header, "id_keluar");
    let id_karyawan = teks(&header, "id_karyawan");
    let tanggal = teks(&header, "tanggal_terakhir");
    wewenang_keluar(client, operator, &id_karyawan).await?;
    match status_keluar(
        &tanggal,
        !teks(&header, "berlaku_pada").is_empty(),
        !teks(&header, "dibatalkan_pada").is_empty(),
        &hari_ini,
    ) {
        "Jatuh tempo" => {}
        "Dijadwalkan" => return Err(galat(PESAN_BELUM_JATUH_TEMPO)),
        "Berlaku" => return Err(galat(PESAN_KELUAR_BERLAKU)),
        _ => return Err(galat(PESAN_KELUAR_DIBATALKAN)),
    }
    let cuti = sisa_cuti(&id_karyawan, &tanggal)?;
    let potret = checklist_keluar(client, &id_karyawan, &tanggal, cuti).await?;
    periksa_blokir(&potret)?;
    let akun = potret["akun"].as_array().cloned().unwrap_or_default();
    if akun.iter().any(|a| angka(a, "id") == operator.id) {
        return Err(galat(PESAN_DIRI_SENDIRI));
    }
    let super_tertaut = akun
        .iter()
        .filter(|a| a["is_superadmin"] == json!(true) && teks(a, "status") == "Aktif")
        .count() as i64;
    if super_tertaut > 0 {
        let total = satu(client, SUPERADMIN_AKTIF_SQL, vec![]).await?.map_or(0, |b| angka(&b, "jumlah"));
        if total <= super_tertaut {
            return Err(galat(PESAN_SUPERADMIN_TERAKHIR));
        }
    }
    let args = vec![json!(id_keluar), json!(operator.username), json!(potret.to_string()), json!(id_karyawan)];
    client
        .execute_atomic(BERLAKUKAN_SQL.iter().map(|sql| Statement::new(*sql, args.clone())).collect())
        .await?;
    // Blokir yang muncul di antara pemeriksaan dan batch membuat statement
    // pertama tidak menyentuh apa pun; laporkan butirnya.
    let sesudah = header_keluar(client, &id_keluar).await?;
    if teks(&sesudah, "berlaku_pada").is_empty() {
        periksa_blokir(&checklist_keluar(client, &id_karyawan, &tanggal, Value::Null).await?)?;
        return Err(galat(if teks(&sesudah, "dibatalkan_pada").is_empty() {
            PESAN_BELUM_JATUH_TEMPO
        } else {
            PESAN_KELUAR_DIBATALKAN
        }));
    }
    Ok(json!({ "sukses": true }))
}

fn periksa_blokir(checklist: &Value) -> Result<(), CommandError> {
    let ada = |kunci: &str| checklist[kunci].as_array().is_some_and(|d| !d.is_empty());
    if ada("jadwal") {
        return Err(galat(PESAN_BLOKIR_JADWAL));
    }
    if ada("wali") {
        return Err(galat(PESAN_BLOKIR_WALI));
    }
    Ok(())
}

/// `desktop_hr_offboarding_cancel`: alasan wajib, kapan saja.
pub async fn batalkan_keluar(
    client: &TursoClient,
    operator: &OperatorUser,
    id_keluar: &str,
    alasan: &str,
) -> Result<Value, CommandError> {
    let alasan = teks_wajib(&json!({ "alasan": alasan }), "alasan", "Alasan pembatalan", MAKS_TEKS_KELUAR).map_err(galat)?;
    client.ensure_schema_current().await?;
    let header = header_keluar(client, id_keluar).await?;
    let id_keluar = teks(&header, "id_keluar");
    wewenang_keluar(client, operator, &teks(&header, "id_karyawan")).await?;
    if !teks(&header, "dibatalkan_pada").is_empty() {
        return Err(galat(PESAN_KELUAR_DIBATALKAN));
    }
    let args = [json!(id_keluar), json!(operator.username), json!(alasan)];
    client
        .execute_atomic(vec![
            Statement::new(BATALKAN_SQL[0], args[..1].to_vec()),
            Statement::new(BATALKAN_SQL[1], args.to_vec()),
        ])
        .await?;
    if teks(&header_keluar(client, &id_keluar).await?, "dibatalkan_pada").is_empty() {
        return Err(galat(PESAN_KELUAR_DIBATALKAN));
    }
    Ok(json!({ "sukses": true }))
}

#[cfg(test)]
mod tests {
    //! Vektor sama dengan `validations/hr-keluar.test.ts`.
    use super::*;

    const VEKTOR: &str = include_str!("../../../src/lib/validations/hr-keluar.vektor.json");

    fn vektor() -> Value {
        serde_json::from_str(VEKTOR).expect("hr-keluar.vektor.json sah")
    }

    #[test]
    fn hr_keluar_vektor_masa_dan_status() {
        let v = vektor();
        for k in v["akhir_masa"].as_array().expect("akhir_masa") {
            let hasil = akhir_masa_sp(k["tanggal"].as_str().unwrap(), k["masa_bulan"].as_i64().unwrap());
            assert_eq!(json!(hasil), k["hasil"], "{k}");
        }
        for k in v["status"].as_array().expect("status") {
            let hasil = status_sp(
                k["tanggal"].as_str().unwrap(),
                k["berlaku_sampai"].as_str().unwrap(),
                k["dicabut"].as_bool().unwrap(),
                k["hari_ini"].as_str().unwrap(),
            );
            assert_eq!(hasil, k["hasil"].as_str().unwrap(), "{k}");
        }
        for k in v["masa_setting"].as_array().expect("masa_setting") {
            assert_eq!(json!(masa_sp_berlaku(k["nilai"].as_str())), k["hasil"], "{k}");
        }
    }

    #[test]
    fn hr_keluar_vektor_usulan_tingkat() {
        for k in vektor()["usulan"].as_array().expect("usulan") {
            let sp: Vec<SpRingkas> = serde_json::from_value(k["sp"].clone()).expect("sp");
            let (tingkat, sp3) = usulan_tingkat(&sp, k["tanggal"].as_str().unwrap());
            assert_eq!(tingkat, k["tingkat"].as_str().unwrap(), "{}", k["nama"]);
            assert_eq!(sp3, k["sp3_berlaku"].as_bool().unwrap(), "{}", k["nama"]);
        }
    }

    #[test]
    fn hr_keluar_vektor_validasi_dan_wewenang() {
        let v = vektor();
        for k in v["validasi"].as_array().expect("validasi") {
            let hasil = validasi_sp(&k["draft"], k["hari_ini"].as_str().unwrap());
            match k["galat"].as_str() {
                Some(pesan) => assert_eq!(hasil.err().as_deref(), Some(pesan), "{}", k["nama"]),
                None => assert_eq!(json!(hasil.expect("sah")), k["hasil"], "{}", k["nama"]),
            }
        }
        for k in v["tingkat"].as_array().expect("tingkat") {
            let hasil = periksa_tingkat(
                k["tingkat"].as_str().unwrap(),
                k["usulan"].as_str().unwrap(),
                k["alasan"].as_str(),
            );
            assert_eq!(hasil.err().as_deref(), k["galat"].as_str(), "{k}");
        }
        for k in v["wewenang"].as_array().expect("wewenang") {
            let hasil = periksa_wewenang_sp(
                k["tingkat"].as_str().unwrap(),
                k["sendiri"].as_bool().unwrap(),
                k["dalam_cakupan"].as_bool().unwrap(),
                k["boleh_sp3"].as_bool().unwrap(),
            );
            assert_eq!(hasil.err().as_deref(), k["galat"].as_str(), "{}", k["nama"]);
        }
    }

    #[test]
    fn hr_keluar_alasan_bawaan_sah() {
        let alasan = alasan_bawaan();
        assert_eq!(alasan.len(), 9);
        assert!(alasan.iter().all(|a| (0..=1000).contains(&a.pengali_up) && (0..=1000).contains(&a.pengali_upmk)));
        assert_eq!(seed_alasan_args(&alasan[0]).len(), 8);
    }

    fn operator(id_karyawan: Option<&str>, izin: &[&str]) -> OperatorUser {
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
            id_karyawan: id_karyawan.map(str::to_owned),
            login_at: None,
        }
    }

    /// Cloud lewat `TursoClient::local_file` di atas `ensure_schema`: SP3
    /// tanpa izin ditolak, unit lain ditolak, diri sendiri ditolak, tingkat
    /// terkunci saat diubah, dan cabut hanya sekali.
    #[test]
    fn hr_keluar_sp_cloud() {
        let runtime = tokio::runtime::Builder::new_current_thread().build().expect("runtime uji");
        runtime.block_on(async {
            let dir = tempfile::tempdir().expect("direktori sementara");
            let hub = dir.path().join("sppg-hub.db");
            let client = TursoClient::local_file(
                url::Url::parse("https://hr-keluar.sppg.invalid").expect("origin uji"),
                &hub,
                reqwest::Client::new(),
            );
            client.ensure_schema().await.expect("provisioning lokal");
            let c = rusqlite::Connection::open(&hub).expect("buka hub");
            c.execute_batch(
                "INSERT INTO master_data (id_unik, kode_karyawan, nama, divisi, id_shift, jenis_personil, unit, tanggal_daftar, status_aktif) VALUES
                   ('P1', 'K1', 'Ani', 'Guru', 1, 'GURU', 'SMP', '2020-01-01', 'Aktif'),
                   ('P2', 'K2', 'Budi', 'Guru', 1, 'GURU', 'SMA', '2020-01-01', 'Aktif'),
                   ('KS', 'K3', 'Kepala SMP', 'Guru', 1, 'GURU', 'SMP', '2020-01-01', 'Aktif');",
            )
            .expect("pegawai");
            assert_eq!(
                c.query_row("SELECT COUNT(*) FROM hr_keluar_alasan;", [], |r| r.get::<_, i64>(0)).expect("alasan"),
                9
            );
            let kepsek = operator(Some("KS"), &["hr.warning.view", "hr.warning.manage"]);
            let draft = |id: &str, tingkat: &str| {
                json!({
                    "id_karyawan": id, "tingkat": tingkat, "tanggal": "2026-01-10",
                    "pelanggaran": "Terlambat berulang", "penanda_nama": "Kepala SMP",
                    "penanda_jabatan": "Kepala SMP", "alasan_tingkat": "Pelanggaran berat",
                })
            };
            let galat_dari = |h: Result<Value, CommandError>| h.err().map(|e| e.message).unwrap_or_default();

            assert_eq!(galat_dari(simpan_sp(&client, &kepsek, &draft("P2", "SP1")).await), PESAN_DI_LUAR_CAKUPAN);
            assert_eq!(galat_dari(simpan_sp(&client, &kepsek, &draft("KS", "SP1")).await), PESAN_DIRI_SENDIRI);
            assert_eq!(galat_dari(simpan_sp(&client, &kepsek, &draft("P1", "SP3")).await), PESAN_BUTUH_SP3);
            let mut tanpa_alasan = draft("P1", "SP2");
            tanpa_alasan["alasan_tingkat"] = json!("");
            assert_eq!(
                galat_dari(simpan_sp(&client, &kepsek, &tanpa_alasan).await),
                "Tingkat berbeda dari usulan (SP1); alasannya wajib diisi."
            );

            let baru = simpan_sp(&client, &kepsek, &draft("P1", "SP1")).await.expect("SP1");
            let id_sp = baru["id_sp"].as_str().expect("id").to_owned();
            let (unit, masa, sampai, alasan_tingkat): (String, i64, String, Option<String>) = c
                .query_row(
                    "SELECT unit, masa_bulan, berlaku_sampai, alasan_tingkat FROM hr_sp WHERE id_sp = ?1;",
                    [&id_sp],
                    |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
                )
                .expect("baris SP");
            assert_eq!((unit.as_str(), masa, sampai.as_str()), ("SMP", 6, "2026-07-09"));
            assert_eq!(alasan_tingkat, None, "alasan hanya disimpan bila tingkat beda dari usulan");

            let mut ubah = draft("P1", "SP2");
            ubah["id_sp"] = json!(id_sp);
            assert!(galat_dari(simpan_sp(&client, &kepsek, &ubah).await).starts_with("Tingkat dan tanggal SP"));
            let mut ubah = draft("P1", "SP1");
            ubah["id_sp"] = json!(id_sp);
            ubah["nomor"] = json!("001/SP/SMP/I/2026");
            let hasil = simpan_sp(&client, &kepsek, &ubah).await.expect("ubah teks");
            assert_eq!(hasil["nomor_kembar"], json!(false));

            let daftar = daftar_sp(&client, "P1").await.expect("daftar");
            assert_eq!(daftar["sp"].as_array().map(Vec::len), Some(1));
            assert_eq!(daftar["sp"][0]["nomor"], json!("001/SP/SMP/I/2026"));
            assert_eq!(daftar["masa_bulan"], json!(6));

            let yayasan = operator(None, &["hr.warning.cancel", "hr.scope.all"]);
            assert_eq!(galat_dari(cabut_sp(&client, &yayasan, &id_sp, " ").await), "Alasan pencabutan wajib diisi.");
            cabut_sp(&client, &yayasan, &id_sp, "Salah orang").await.expect("cabut");
            assert_eq!(galat_dari(cabut_sp(&client, &yayasan, &id_sp, "Lagi").await), PESAN_SP_DICABUT);
            assert_eq!(galat_dari(simpan_sp(&client, &kepsek, &ubah).await), PESAN_SP_DICABUT);
            let daftar = daftar_sp(&client, "P1").await.expect("daftar");
            assert_eq!(daftar["sp"][0]["status"], json!("Dicabut"));
            assert_eq!(daftar["usulan"]["tingkat"], json!("SP1"));
        });
    }

    #[test]
    fn hr_keluar_vektor_status_dan_validasi_keluar() {
        let v = vektor();
        for k in v["status_keluar"].as_array().expect("status_keluar") {
            let hasil = status_keluar(
                k["tanggal_terakhir"].as_str().unwrap(),
                k["berlaku"].as_bool().unwrap(),
                k["dibatalkan"].as_bool().unwrap(),
                k["hari_ini"].as_str().unwrap(),
            );
            assert_eq!(hasil, k["hasil"].as_str().unwrap(), "{}", k["nama"]);
        }
        for k in v["validasi_keluar"].as_array().expect("validasi_keluar") {
            let hasil = validasi_keluar(&k["draft"]);
            match k["galat"].as_str() {
                Some(pesan) => assert_eq!(hasil.err().as_deref(), Some(pesan), "{}", k["nama"]),
                None => assert_eq!(json!(hasil.expect("sah")), k["hasil"], "{}", k["nama"]),
            }
        }
        assert_eq!(
            status_aktif_keluar("?"),
            "CASE WHEN COALESCE(master_data.id_keluar, '') <> '' THEN 'Nonaktif' ELSE ? END"
        );
    }

    fn hub_uji() -> (tempfile::TempDir, TursoClient, std::path::PathBuf) {
        let dir = tempfile::tempdir().expect("direktori sementara");
        let hub = dir.path().join("sppg-hub.db");
        let client = TursoClient::local_file(
            url::Url::parse("https://hr-keluar.sppg.invalid").expect("origin uji"),
            &hub,
            reqwest::Client::new(),
        );
        (dir, client, hub)
    }

    /// Alur 4b di cloud (`local_file` di atas `ensure_schema`): satu proses
    /// terbuka per pegawai, blokir jadwal lalu wali, Berlakukan menonaktifkan
    /// pegawai + akun + sesi Web, tekan ganda ditolak tanpa menggandakan, dan
    /// Batalkan mengembalikan pegawai tetapi tidak akunnya.
    #[test]
    fn hr_keluar_berlakukan_dan_batalkan_cloud() {
        let runtime = tokio::runtime::Builder::new_current_thread().build().expect("runtime uji");
        runtime.block_on(async {
            let (_dir, client, hub) = hub_uji();
            client.ensure_schema().await.expect("provisioning lokal");
            let c = rusqlite::Connection::open(&hub).expect("buka hub");
            c.execute_batch(
                "INSERT INTO master_data (id_unik, kode_karyawan, nama, divisi, id_shift, jenis_personil, unit, tanggal_daftar, status_aktif) VALUES
                   ('P1', 'K1', 'Ani', 'Guru', 1, 'GURU', 'SMP', '2020-01-01', 'Aktif'),
                   ('KS', 'K3', 'Kepala SMP', 'Guru', 1, 'GURU', 'SMP', '2020-01-01', 'Aktif');
                 INSERT INTO akademik_tahun_ajaran (id_tahun_ajaran, nama_tahun, semester, tanggal_mulai, tanggal_selesai, is_aktif, created_at, updated_at) VALUES
                   ('T1', '2025/2026', 'Genap', '2026-01-01', '2026-06-30', 0, 'x', 'x'),
                   ('T2', '2026/2027', 'Ganjil', '2026-07-01', '2026-12-31', 1, 'x', 'x');
                 INSERT INTO akademik_rombel (id_rombel, id_tahun_ajaran, tingkat, nama_rombel, id_wali_kelas, is_aktif) VALUES
                   ('R1', 'T1', 7, '7A lama', 'P1', 1), ('R2', 'T2', 8, '8A', 'P1', 1);
                 INSERT INTO jadwal_mengajar (id_jadwal, id_tahun_ajaran, id_rombel, id_mapel, id_guru, hari, jam_ke, is_aktif, created_at, updated_at) VALUES
                   ('J1', 'T1', 'R1', 'M1', 'P1', 1, '1', 1, 'x', 'x'), ('J2', 'T2', 'R2', 'M1', 'P1', 1, '2', 1, 'x', 'x');
                 INSERT INTO master_operator (id, kode_operator, nama_operator, username, password_hash, role, status, id_karyawan) VALUES
                   (10, 'OP10', 'Ani', 'ani', 'x', 'Operator', 'Aktif', 'P1');
                 INSERT INTO app_session (session_id, token_hash, operator_id, permission_revision, created_at, expires_at, last_seen_at) VALUES
                   ('s1', 'h1', 10, 1, 'x', '2999-01-01', 'x');",
            )
            .expect("data uji");
            let galat_dari = |h: Result<Value, CommandError>| h.err().map(|e| e.message).unwrap_or_default();
            let kepeg = operator(Some("KS"), &["hr.offboard.manage"]);
            let draft = json!({ "id_karyawan": "P1", "id_alasan": "klr-resign", "tanggal_terakhir": "2026-06-30" });

            assert_eq!(galat_dari(simpan_keluar(&client, &kepeg, &json!({ "id_karyawan": "KS", "id_alasan": "klr-resign", "tanggal_terakhir": "2026-06-30" })).await), PESAN_DIRI_SENDIRI);
            let id = simpan_keluar(&client, &kepeg, &draft).await.expect("catat")["id_keluar"].as_str().expect("id").to_owned();
            assert_eq!(galat_dari(simpan_keluar(&client, &kepeg, &draft).await), PESAN_KELUAR_TERBUKA);
            let status: String = c
                .query_row("SELECT status_aktif FROM master_data WHERE id_unik = 'P1';", [], |r| r.get(0))
                .expect("status");
            assert_eq!(status, "Aktif", "selama belum berlaku master_data tidak berubah");

            let rincian = rincian_keluar(&client, Some(&id), None, None, |_, _| Ok(Value::Null)).await.expect("rincian");
            assert_eq!(rincian["keluar"]["status"], json!("Jatuh tempo"));
            assert_eq!(rincian["checklist"]["blokir"], json!(2), "jadwal T2 dan wali R2; T1 berakhir pada hari terakhir");
            assert_eq!(rincian["checklist"]["akun"][0]["username"], json!("ani"));

            let yayasan = operator(None, &["hr.offboard.decide", "hr.scope.all"]);
            let tanpa_cuti = |_: &str, _: &str| Ok(Value::Null);
            assert_eq!(galat_dari(berlakukan_keluar(&client, &yayasan, &id, tanpa_cuti).await), PESAN_BLOKIR_JADWAL);
            c.execute("UPDATE jadwal_mengajar SET is_aktif = 0 WHERE id_jadwal = 'J2';", []).expect("alihkan jadwal");
            assert_eq!(galat_dari(berlakukan_keluar(&client, &yayasan, &id, tanpa_cuti).await), PESAN_BLOKIR_WALI);
            c.execute("UPDATE akademik_rombel SET id_wali_kelas = 'KS' WHERE id_rombel = 'R2';", []).expect("ganti wali");
            let akun_sendiri = OperatorUser { id: 10, ..operator(None, &["hr.offboard.decide", "hr.scope.all"]) };
            assert_eq!(galat_dari(berlakukan_keluar(&client, &akun_sendiri, &id, tanpa_cuti).await), PESAN_DIRI_SENDIRI);
            berlakukan_keluar(&client, &yayasan, &id, tanpa_cuti).await.expect("berlakukan");
            assert_eq!(galat_dari(berlakukan_keluar(&client, &yayasan, &id, tanpa_cuti).await), PESAN_KELUAR_BERLAKU);
            // Batch yang sama dijalankan ulang (tekan ganda lolos pemeriksaan) tidak mengubah apa pun.
            let args = vec![json!(id), json!("lain"), json!("{}"), json!("P1")];
            client
                .execute_atomic(BERLAKUKAN_SQL.iter().map(|sql| Statement::new(*sql, args.clone())).collect())
                .await
                .expect("ulang");

            let (status, selesai, id_keluar): (String, String, String) = c
                .query_row("SELECT status_aktif, tanggal_selesai_aktif, id_keluar FROM master_data WHERE id_unik = 'P1';", [], |r| {
                    Ok((r.get(0)?, r.get(1)?, r.get(2)?))
                })
                .expect("pegawai");
            assert_eq!((status.as_str(), selesai.as_str(), id_keluar.as_str()), ("Nonaktif", "2026-06-30", id.as_str()));
            let (akun, sesi): (String, i64) = c
                .query_row(
                    "SELECT (SELECT status FROM master_operator WHERE id = 10), (SELECT COUNT(*) FROM app_session WHERE revoked_at IS NOT NULL);",
                    [],
                    |r| Ok((r.get(0)?, r.get(1)?)),
                )
                .expect("akun");
            assert_eq!((akun.as_str(), sesi), ("Nonaktif", 1));
            let (oleh, potret): (String, String) = c
                .query_row("SELECT berlaku_oleh, checklist_saat_berlaku FROM hr_keluar WHERE id_keluar = ?1;", [&id], |r| {
                    Ok((r.get(0)?, r.get(1)?))
                })
                .expect("potret");
            assert_eq!(oleh, "uji", "tekan ulang tidak menimpa pemberlaku");
            assert!(potret.contains("\"akun\""));
            let mut ubah = draft.clone();
            ubah["id_keluar"] = json!(id);
            assert_eq!(galat_dari(simpan_keluar(&client, &kepeg, &ubah).await), PESAN_KELUAR_BERLAKU);

            assert_eq!(galat_dari(batalkan_keluar(&client, &yayasan, &id, " ").await), "Alasan pembatalan wajib diisi.");
            batalkan_keluar(&client, &yayasan, &id, "Batal resign").await.expect("batal");
            assert_eq!(galat_dari(batalkan_keluar(&client, &yayasan, &id, "Lagi").await), PESAN_KELUAR_DIBATALKAN);
            let (status, id_keluar, akun): (String, Option<String>, String) = c
                .query_row(
                    "SELECT m.status_aktif, m.id_keluar, (SELECT status FROM master_operator WHERE id = 10) FROM master_data m WHERE m.id_unik = 'P1';",
                    [],
                    |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
                )
                .expect("sesudah batal");
            assert_eq!((status.as_str(), id_keluar, akun.as_str()), ("Aktif", None, "Nonaktif"));
            let daftar = daftar_keluar(&client).await.expect("daftar");
            assert_eq!(daftar["keluar"][0]["status"], json!("Dibatalkan"));
            assert_eq!(daftar["alasan"].as_array().map(Vec::len), Some(9));
            // Proses baru boleh dicatat lagi sesudah yang lama dibatalkan.
            simpan_keluar(&client, &kepeg, &draft).await.expect("catat ulang");
        });
    }

    /// Superadmin aktif terakhir tidak bisa dikeluarkan lewat pegawai tertautnya.
    #[test]
    fn hr_keluar_superadmin_terakhir_ditolak() {
        let runtime = tokio::runtime::Builder::new_current_thread().build().expect("runtime uji");
        runtime.block_on(async {
            let (_dir, client, hub) = hub_uji();
            client.ensure_schema().await.expect("provisioning lokal");
            let c = rusqlite::Connection::open(&hub).expect("buka hub");
            c.execute_batch(
                "UPDATE master_operator SET status = 'Nonaktif';
                 INSERT INTO master_data (id_unik, kode_karyawan, nama, divisi, id_shift, jenis_personil, unit, tanggal_daftar, status_aktif) VALUES
                   ('P9', 'K9', 'Budi', 'TU', 1, 'Pegawai', 'SMP', '2020-01-01', 'Aktif');
                 INSERT INTO master_operator (id, kode_operator, nama_operator, username, password_hash, role, role_id, status, id_karyawan)
                   SELECT 20, 'OP20', 'Budi', 'budi', 'x', 'Admin', id, 'Aktif', 'P9' FROM app_role WHERE is_superadmin = 1 LIMIT 1;",
            )
            .expect("data uji");
            let yayasan = operator(None, &["hr.offboard.manage", "hr.offboard.decide", "hr.scope.all"]);
            let id = simpan_keluar(&client, &yayasan, &json!({ "id_karyawan": "P9", "id_alasan": "klr-resign", "tanggal_terakhir": "2026-06-30" }))
                .await
                .expect("catat")["id_keluar"]
                .as_str()
                .expect("id")
                .to_owned();
            let hasil = berlakukan_keluar(&client, &yayasan, &id, |_, _| Ok(Value::Null)).await;
            assert_eq!(hasil.err().map(|e| e.message).as_deref(), Some(PESAN_SUPERADMIN_TERAKHIR));
        });
    }

    /// Penjaga sesi dan penulis lokal: hanya `id_keluar` yang menolak;
    /// personil yang belum ada di perangkat lolos.
    #[test]
    fn hr_keluar_penjaga_sesi_lokal() {
        let dir = tempfile::tempdir().expect("tempdir");
        super::super::storage::initialize(dir.path()).expect("skema lokal");
        let c = super::super::storage::database(dir.path()).expect("db");
        c.execute_batch(
            "INSERT INTO master_data (id_unik, kode_karyawan, nama, divisi, id_shift, status_aktif, id_keluar, tanggal_selesai_aktif) VALUES
               ('P1', 'K1', 'Ani', 'Guru', 1, 'Nonaktif', 'klr-1', '2026-06-30'),
               ('P2', 'K2', 'Budi', 'Guru', 1, 'Nonaktif', NULL, NULL);",
        )
        .expect("data");
        assert_eq!(tolak_sesi_keluar(&c, Some("P1")).err().map(|e| e.message).as_deref(), Some(PESAN_SESI_KELUAR));
        assert!(tolak_sesi_keluar(&c, Some("P2")).is_ok(), "nonaktif manual tidak mengunci akun");
        assert!(tolak_sesi_keluar(&c, Some("TIDAK-ADA")).is_ok());
        assert!(tolak_sesi_keluar(&c, None).is_ok());
        assert_eq!(tolak_aktifkan_keluar(&c, "P1", Some("Aktif")).err().map(|e| e.message).as_deref(), Some(PESAN_SUDAH_KELUAR));
        assert!(tolak_aktifkan_keluar(&c, "P1", Some("Nonaktif")).is_ok());
        assert!(tolak_aktifkan_keluar(&c, "P2", Some("Aktif")).is_ok());

        let state = super::super::config::DesktopState {
            server_origin: std::sync::RwLock::new("http://localhost:3000".to_string()),
            offline_max_age_hours: 24,
            data_dir: dir.path().to_path_buf(),
            http: reqwest::Client::new(),
            turso_config: std::sync::RwLock::new(None),
            session: std::sync::Mutex::new(None),
            vault_lock: std::sync::Mutex::new(()),
        };
        let sesi = |id: Option<&str>, superadmin: bool| super::super::models::DesktopSession {
            operator: OperatorUser { is_superadmin: superadmin, ..operator(id, &["employees.view"]) },
            mode: super::super::models::SessionMode::Offline,
            license: super::super::license::LicenseGrant::default(),
        };
        *state.session.lock().unwrap() = Some(sesi(Some("P2"), false));
        assert!(super::super::commands::require_any_permission(&state, &["employees.view"]).is_ok());
        *state.session.lock().unwrap() = Some(sesi(Some("P1"), true));
        let galat = super::super::commands::require_any_permission(&state, &["employees.view"]).expect_err("ditolak");
        assert_eq!(galat.message, PESAN_SESI_KELUAR);
        assert!(state.session.lock().unwrap().is_none(), "sesi dibuang supaya layar kembali login");

        // Penulis lokal: Aktifkan dan Hapus guru ditolak; ubah biasa jalan
        // dengan status dan tanggal selesai yang tetap.
        let pesan = |h: Result<Value, CommandError>| h.err().map(|e| e.message).unwrap_or_default();
        assert_eq!(pesan(super::super::operational::set_employee_status(&state, "P1", "Aktif")), PESAN_SUDAH_KELUAR);
        assert_eq!(pesan(super::super::academic::delete_teacher(&state, "P1")), PESAN_HAPUS_GURU_KELUAR);
        let ubah = |status: &str| json!({ "kode_karyawan": "K1", "nama": "Ani Baru", "status_aktif": status, "tanggal_selesai_aktif": "" });
        assert_eq!(pesan(super::super::operational::update_employee(&state, "P1", &ubah("Aktif"))), PESAN_SUDAH_KELUAR);
        super::super::operational::update_employee(&state, "P1", &ubah("Nonaktif")).expect("ubah nama");
        let (nama, status, selesai): (String, String, String) = c
            .query_row("SELECT nama, status_aktif, tanggal_selesai_aktif FROM master_data WHERE id_unik = 'P1';", [], |r| {
                Ok((r.get(0)?, r.get(1)?, r.get(2)?))
            })
            .expect("pegawai");
        assert_eq!((nama.as_str(), status.as_str(), selesai.as_str()), ("Ani Baru", "Nonaktif", "2026-06-30"));
        super::super::operational::set_employee_status(&state, "P2", "Aktif").expect("nonaktif manual boleh diaktifkan");
    }
}
