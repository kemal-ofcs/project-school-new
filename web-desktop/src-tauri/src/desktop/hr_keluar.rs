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

// Alasan keluar bawaan (seed cloud v70)

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

// Surat peringatan: aturan murni (§22.2.1)

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

// SQL, dieja harfiah sama di `validations/hr-keluar.ts`

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

// Akses cloud

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

// Pegawai keluar: aturan murni (§22.2.2)

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
    /// Kosong = pakai usulan (`UPAH_RATA_SQL`).
    pub upah_pokok: Option<i64>,
    pub alasan_upah: Option<String>,
    pub tunjangan_tetap: i64,
    /// Hanya baris yang nominalnya diisi; sisanya mengikuti usulan.
    pub rincian: Vec<IsianRincian>,
}

fn rupiah(draft: &Value, kunci: &str, label: &str, maks: i64) -> Result<Option<i64>, String> {
    match draft.get(kunci) {
        None | Some(Value::Null) => Ok(None),
        Some(nilai) => nilai
            .as_i64()
            .filter(|n| (0..=maks).contains(n))
            .map(Some)
            .ok_or_else(|| format!("{label} tidak valid.")),
    }
}

/// Cermin `validasiKeluar`. Hanya bentuk isian; status pegawai, tanggal
/// masuk, alasan aktif, wewenang, dan usulan diperiksa pemanggil. Hari
/// terakhir boleh di masa depan.
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
    let keterangan = teks_opsional(draft, "keterangan", "Keterangan", MAKS_TEKS_KELUAR)?;
    let catatan_checklist = teks_opsional(draft, "catatan_checklist", "Catatan checklist", MAKS_TEKS_KELUAR)?;
    let upah_pokok = rupiah(draft, "upah_pokok", "Upah pokok", MAKS_UPAH)?;
    let tunjangan_tetap = rupiah(draft, "tunjangan_tetap", "Tunjangan tetap", MAKS_UPAH)?.unwrap_or(0);
    if upah_pokok.unwrap_or(0) + tunjangan_tetap > MAKS_UPAH {
        return Err("Upah pokok + tunjangan tetap terlalu besar.".into());
    }
    let alasan_upah = teks_opsional(draft, "alasan_upah", "Alasan upah", MAKS_TEKS_KELUAR)?;
    let mut rincian: Vec<IsianRincian> = Vec::new();
    if let Some(daftar) = draft.get("rincian").filter(|v| !v.is_null()) {
        for baris in daftar.as_array().ok_or("Rincian tidak valid.")? {
            let komponen = payload_text(baris, "komponen")
                .filter(|k| KOMPONEN_RINCIAN.contains(&k.as_str()))
                .ok_or("Komponen rincian tidak dikenal.")?;
            if rincian.iter().any(|r| r.komponen == komponen) {
                return Err(format!("Komponen {komponen} tercantum dua kali."));
            }
            let nominal = rupiah(baris, "nominal", &format!("Nominal {komponen}"), MAKS_NOMINAL_RINCIAN)?
                .ok_or_else(|| format!("Nominal {komponen} tidak valid."))?;
            rincian.push(IsianRincian {
                alasan_ubah: teks_opsional(baris, "alasan_ubah", "Alasan perubahan", MAKS_TEKS_KELUAR)?,
                komponen,
                nominal,
            });
        }
    }
    Ok(KeluarSah {
        id_keluar: payload_text(draft, "id_keluar"),
        id_karyawan,
        id_alasan,
        id_sp: payload_text(draft, "id_sp"),
        tanggal_pemberitahuan,
        tanggal_terakhir,
        keterangan,
        kartu_ditarik: draft.get("kartu_ditarik").and_then(Value::as_bool).unwrap_or(false),
        catatan_checklist,
        upah_pokok,
        alasan_upah,
        tunjangan_tetap,
        rincian,
    })
}

// Pesangon: aturan murni (§22.2.3), cermin `validations/hr-keluar.ts`

/// WAJIB sama dengan CHECK `hr_keluar_rincian.komponen`; urutannya urutan tampil.
pub const KOMPONEN_RINCIAN: [&str; 7] = [
    "UP",
    "UPMK",
    "UPH Cuti",
    "UPH Lainnya",
    "Kompensasi PKWT",
    "Uang Pisah",
    "Lainnya",
];
pub const MAKS_UPAH: i64 = 1_000_000_000;
pub const MAKS_NOMINAL_RINCIAN: i64 = 100_000_000_000;
pub const MAKS_PENGALI: i64 = 1000;
pub const MAKS_NAMA_ALASAN: usize = 100;

/// Cermin `bulanPenuh`: n terbesar dengan `tambah_bulan(mulai, n)` ≤ `akhir`.
pub fn bulan_penuh(mulai: &str, akhir: &str) -> i64 {
    if !tanggal_valid(mulai) || !tanggal_valid(akhir) {
        return 0;
    }
    let bulan_ke = |t: &str| -> i64 {
        t.get(0..4).and_then(|y| y.parse::<i64>().ok()).unwrap_or(0) * 12
            + t.get(5..7).and_then(|m| m.parse::<i64>().ok()).unwrap_or(0)
    };
    let mut n = bulan_ke(akhir) - bulan_ke(mulai);
    while n > 0 && super::hris::tambah_bulan(mulai, n).is_none_or(|t| t.as_str() > akhir) {
        n -= 1;
    }
    n.max(0)
}

/// Cermin `masaKerjaBulan`: bulan penuh dari `mulai` sampai hari sesudah
/// `tanggal_terakhir` (eksklusif).
pub fn masa_kerja_bulan(mulai: &str, tanggal_terakhir: &str) -> i64 {
    add_days(tanggal_terakhir, 1)
        .map(|akhir| bulan_penuh(mulai, &akhir))
        .unwrap_or(0)
}

/// Kelipatan UP menurut tahun masa kerja (PP 35/2021 Pasal 40 ayat 2).
pub fn kelipatan_up(tahun: i64) -> i64 {
    (tahun + 1).clamp(1, 9)
}

/// Kelipatan UPMK menurut tahun masa kerja (PP 35/2021 Pasal 40 ayat 3).
pub fn kelipatan_upmk(tahun: i64) -> i64 {
    if tahun < 3 {
        0
    } else if tahun >= 24 {
        10
    } else {
        tahun / 3 + 1
    }
}

/// Cermin `rataUpah` (Q-82): total slip dibagi jumlah bulan berbeda,
/// dibulatkan setengah ke atas. Tanpa slip = 0 (wajib diisi tangan).
pub fn rata_upah(total: i64, bulan: i64) -> i64 {
    if bulan <= 0 || total <= 0 {
        return 0;
    }
    ((2 * total + bulan) / (2 * bulan)).min(MAKS_UPAH)
}

/// Cermin `pembagiUph` (Q-83): 25 bila shift ≥ 6 hari kerja (kosong = 7), 21 bila kurang.
pub fn pembagi_uph(hari_kerja: Option<&str>) -> i64 {
    if super::hari_kerja::parse_hari_kerja(hari_kerja).len() >= 6 {
        25
    } else {
        21
    }
}

/// Cermin `kelompokStatus` (Q-81): `tetap` GTY/PTY, `kontrak` GTT/PTT,
/// `negeri` PNS/PPPK, `lainnya` Honorer, tanpa status, dan teks lain.
pub fn kelompok_status(status: &str) -> &'static str {
    match status.trim().to_uppercase().as_str() {
        "GTY" | "PTY" => "tetap",
        "GTT" | "PTT" => "kontrak",
        "PNS" | "PPPK" => "negeri",
        _ => "lainnya",
    }
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
pub struct MasukanPesangon {
    /// Status kini pada hari terakhir (`STATUS_KINI_SQL`).
    pub status: String,
    /// Upah pokok + tunjangan tetap.
    pub upah: i64,
    /// `tanggal_daftar`; kosong = UP dan UPMK 0.
    pub masa_kerja_mulai: Option<String>,
    pub tanggal_terakhir: String,
    pub pengali_up: i64,
    pub pengali_upmk: i64,
    pub uph: bool,
    pub kompensasi_pkwt: bool,
    pub uang_pisah: bool,
    /// Sisa cuti periode yang memuat hari terakhir.
    pub sisa_cuti: i64,
    pub sebelum_berhak: bool,
    /// 25 atau 21 (`pembagi_uph`).
    pub pembagi: i64,
    /// Mulai kontrak berlaku pada hari terakhir yang punya tanggal selesai.
    pub kontrak_mulai: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Usulan {
    pub komponen: &'static str,
    pub dasar: Option<String>,
    pub usulan: i64,
}

fn baris_usulan(komponen: &'static str, dasar: Option<String>, usulan: i64) -> Usulan {
    Usulan { komponen, dasar, usulan }
}

/// Cermin `usulanPesangon` (§22.2.3, Q-81). Bilangan bulat, dibulatkan ke
/// rupiah terdekat (setengah ke atas); urutan = `KOMPONEN_RINCIAN`.
pub fn usulan_pesangon(m: &MasukanPesangon) -> Vec<Usulan> {
    let kelompok = kelompok_status(&m.status);
    if kelompok == "negeri" {
        return Vec::new();
    }
    let upah = m.upah.clamp(0, MAKS_UPAH);
    let yayasan = kelompok == "tetap" || kelompok == "kontrak";
    let mut hasil = Vec::new();
    if kelompok == "tetap" {
        match m.masa_kerja_mulai.as_deref().filter(|t| tanggal_valid(t)) {
            Some(mulai) => {
                let tahun = masa_kerja_bulan(mulai, &m.tanggal_terakhir) / 12;
                for (komponen, kelipatan, pengali) in [
                    ("UP", kelipatan_up(tahun), m.pengali_up),
                    ("UPMK", kelipatan_upmk(tahun), m.pengali_upmk),
                ] {
                    hasil.push(baris_usulan(
                        komponen,
                        Some(format!("Masa kerja {tahun} tahun: {kelipatan} × upah × {pengali}%")),
                        (upah * kelipatan * pengali + 50) / 100,
                    ));
                }
            }
            None => {
                for komponen in ["UP", "UPMK"] {
                    hasil.push(baris_usulan(komponen, Some("Tanggal masuk kosong".into()), 0));
                }
            }
        }
    }
    if yayasan && m.uph {
        if m.sisa_cuti > 0 && !m.sebelum_berhak {
            let pembagi = m.pembagi.max(1);
            hasil.push(baris_usulan(
                "UPH Cuti",
                Some(format!("Sisa cuti {} hari × upah ÷ {pembagi}", m.sisa_cuti)),
                (2 * m.sisa_cuti * upah + pembagi) / (2 * pembagi),
            ));
        }
        hasil.push(baris_usulan("UPH Lainnya", None, 0));
    }
    if kelompok == "kontrak" && m.kompensasi_pkwt {
        if let Some(mulai) = m.kontrak_mulai.as_deref().filter(|t| tanggal_valid(t)) {
            let bulan = masa_kerja_bulan(mulai, &m.tanggal_terakhir).max(1);
            hasil.push(baris_usulan(
                "Kompensasi PKWT",
                Some(format!("Kontrak {bulan} bulan: upah × {bulan} ÷ 12")),
                (upah * bulan + 6) / 12,
            ));
        }
    }
    if kelompok == "tetap" && m.uang_pisah {
        hasil.push(baris_usulan("Uang Pisah", None, 0));
    }
    hasil.push(baris_usulan("Lainnya", None, 0));
    hasil
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct IsianRincian {
    pub komponen: String,
    pub nominal: i64,
    pub alasan_ubah: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct RincianSah {
    pub komponen: &'static str,
    pub dasar: Option<String>,
    pub usulan: i64,
    pub nominal: i64,
    pub alasan_ubah: Option<String>,
    pub urutan: i64,
}

/// Cermin `susunRincian`: setiap baris usulan mendapat nominalnya (bawaan =
/// usulan); nominal lain dari usulan wajib beralasan, alasan hanya disimpan
/// bila nominal berbeda.
pub fn susun_rincian(usulan: &[Usulan], isian: &[IsianRincian]) -> Result<Vec<RincianSah>, String> {
    if let Some(asing) = isian.iter().find(|i| !usulan.iter().any(|u| u.komponen == i.komponen)) {
        return Err(format!("Komponen {} tidak berlaku untuk proses ini.", asing.komponen));
    }
    usulan
        .iter()
        .enumerate()
        .map(|(urutan, u)| {
            let isi = isian.iter().find(|i| i.komponen == u.komponen);
            let nominal = isi.map_or(u.usulan, |i| i.nominal);
            let alasan_ubah = isi.and_then(|i| i.alasan_ubah.clone()).filter(|_| nominal != u.usulan);
            if nominal != u.usulan && alasan_ubah.is_none() {
                return Err(format!("Nominal {} berbeda dari usulan; alasannya wajib diisi.", u.komponen));
            }
            Ok(RincianSah {
                komponen: u.komponen,
                dasar: u.dasar.clone(),
                usulan: u.usulan,
                nominal,
                alasan_ubah,
                urutan: urutan as i64 + 1,
            })
        })
        .collect()
}

/// Cermin `periksaUpah`: upah pokok lain dari usulan wajib beralasan.
pub fn periksa_upah(upah_pokok: i64, usulan: i64, alasan: Option<&str>) -> Result<(), String> {
    if upah_pokok != usulan && alasan.is_none() {
        return Err("Upah pokok berbeda dari usulan; alasannya wajib diisi.".into());
    }
    Ok(())
}

/// Cermin `ringkasanPesangon`: tidak disimpan kecuali di potret Berlakukan.
/// Perkiraan diterima boleh negatif (sisa kasbon lebih besar dari pesangon).
pub fn ringkasan_pesangon(nominal: &[i64], sisa_kasbon: i64) -> Value {
    let total: i64 = nominal.iter().sum();
    json!({ "total": total, "sisa_kasbon": sisa_kasbon, "perkiraan_diterima": total - sisa_kasbon })
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct AlasanSah {
    pub id_alasan: Option<String>,
    pub nama: String,
    pub pengali_up: i64,
    pub pengali_upmk: i64,
    pub uph: bool,
    pub kompensasi_pkwt: bool,
    pub uang_pisah: bool,
    pub is_aktif: bool,
    pub dasar_hukum: Option<String>,
}

/// Cermin `validasiAlasan`. Sakelar yang tidak dikirim = bawaan.
pub fn validasi_alasan(draft: &Value) -> Result<AlasanSah, String> {
    let pengali = |kunci: &str, label: &str| -> Result<i64, String> {
        draft
            .get(kunci)
            .and_then(Value::as_i64)
            .filter(|n| (0..=MAKS_PENGALI).contains(n))
            .ok_or_else(|| format!("{label} harus bilangan bulat 0–{MAKS_PENGALI} (persen)."))
    };
    let sakelar = |kunci: &str, bawaan: bool| draft.get(kunci).and_then(Value::as_bool).unwrap_or(bawaan);
    Ok(AlasanSah {
        id_alasan: payload_text(draft, "id_alasan"),
        nama: teks_wajib(draft, "nama", "Nama alasan", MAKS_NAMA_ALASAN)?,
        pengali_up: pengali("pengali_up", "Pengali UP")?,
        pengali_upmk: pengali("pengali_upmk", "Pengali UPMK")?,
        uph: sakelar("uph", true),
        kompensasi_pkwt: sakelar("kompensasi_pkwt", false),
        uang_pisah: sakelar("uang_pisah", false),
        is_aktif: sakelar("is_aktif", true),
        dasar_hukum: teks_opsional(draft, "dasar_hukum", "Dasar hukum", MAKS_TEKS_KELUAR)?,
    })
}

/// Jenis surat keluar (kunci `hr_surat_pola:<jenis>`, §22.2.5).
pub const SURAT_KELUAR: [&str; 2] = ["berhenti", "pengalaman"];
pub const PESAN_SURAT_BELUM_BERLAKU: &str = "Surat keluar hanya untuk proses yang sudah berlaku.";
pub const PESAN_SK_BUKAN_TETAP: &str = "SK Pemberhentian hanya untuk GTY dan PTY.";
pub const PESAN_KETERANGAN_NEGERI: &str = "Surat keterangan pengalaman kerja tidak untuk PNS dan PPPK.";

/// Cermin `periksaSuratKeluar` (Q-86): SK Pemberhentian untuk GTY/PTY,
/// keterangan pengalaman kerja untuk semua kecuali PNS/PPPK; keduanya hanya
/// untuk proses Berlaku.
pub fn periksa_surat_keluar(jenis: &str, status_keluar: &str, status_kepegawaian: &str) -> Result<(), String> {
    if !SURAT_KELUAR.contains(&jenis) {
        return Err("Jenis surat tidak dikenal.".into());
    }
    if status_keluar != "Berlaku" {
        return Err(PESAN_SURAT_BELUM_BERLAKU.into());
    }
    match (jenis, kelompok_status(status_kepegawaian)) {
        ("berhenti", k) if k != "tetap" => Err(PESAN_SK_BUKAN_TETAP.into()),
        ("pengalaman", "negeri") => Err(PESAN_KETERANGAN_NEGERI.into()),
        _ => Ok(()),
    }
}

// Normalisasi zombie (Q-80) dan gaji terakhir (§22.2.4)

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

// SQL keluar, dieja harfiah sama di `validations/hr-keluar.ts`
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

pub const PEGAWAI_KELUAR_SQL: &str = "SELECT m.id_unik, m.nama, COALESCE(m.status_aktif, 'Aktif') AS status_aktif, COALESCE(m.tanggal_daftar, '') AS tanggal_daftar, COALESCE(m.unit, '') AS unit, COALESCE(m.id_keluar, '') AS id_keluar, COALESCE(m.jenis_personil, '') AS jenis_personil, COALESCE(m.divisi, '') AS divisi, COALESCE(s.hari_kerja, '') AS hari_kerja FROM master_data m LEFT JOIN tbl_shift s ON s.id_shift = m.id_shift WHERE m.id_unik = ?1 AND LOWER(TRIM(COALESCE(m.jenis_personil, ''))) <> 'siswa' AND NOT EXISTS (SELECT 1 FROM siswa_data sd WHERE sd.id_siswa = m.id_unik) LIMIT 1;";
pub const ALASAN_KELUAR_SQL: &str = "SELECT id_alasan, nama, pengali_up, pengali_upmk, uph, kompensasi_pkwt, uang_pisah, is_aktif, COALESCE(dasar_hukum, '') AS dasar_hukum FROM hr_keluar_alasan ORDER BY is_aktif DESC, nama, id_alasan LIMIT 100;";
pub const ALASAN_SATU_SQL: &str = "SELECT id_alasan, nama, pengali_up, pengali_upmk, uph, kompensasi_pkwt, uang_pisah, is_aktif FROM hr_keluar_alasan WHERE id_alasan = ?1 LIMIT 1;";
pub const DAFTAR_KELUAR_SQL: &str = "SELECT k.id_keluar, k.id_karyawan, COALESCE(m.nama, k.id_karyawan) AS nama, COALESCE(m.unit, '') AS unit, k.id_alasan, COALESCE(k.alasan_nama, '') AS alasan_nama, COALESCE(k.id_sp, '') AS id_sp, COALESCE(k.status_kepegawaian, '') AS status_kepegawaian, COALESCE(k.tanggal_pemberitahuan, '') AS tanggal_pemberitahuan, k.tanggal_terakhir, COALESCE(k.keterangan, '') AS keterangan, COALESCE(k.masa_kerja_mulai, '') AS masa_kerja_mulai, k.kartu_ditarik, COALESCE(k.catatan_checklist, '') AS catatan_checklist, k.dicatat_oleh, k.created_at, COALESCE(k.diubah_oleh, '') AS diubah_oleh, COALESCE(k.diubah_pada, '') AS diubah_pada, COALESCE(k.berlaku_oleh, '') AS berlaku_oleh, COALESCE(k.berlaku_pada, '') AS berlaku_pada, COALESCE(k.dibatalkan_oleh, '') AS dibatalkan_oleh, COALESCE(k.dibatalkan_pada, '') AS dibatalkan_pada, COALESCE(k.alasan_batal, '') AS alasan_batal, k.upah_pokok, k.usulan_upah_pokok, k.tunjangan_tetap, COALESCE(k.alasan_upah, '') AS alasan_upah, COALESCE(k.nomor_sk, '') AS nomor_sk, COALESCE(k.nomor_keterangan, '') AS nomor_keterangan FROM hr_keluar k LEFT JOIN master_data m ON m.id_unik = k.id_karyawan ORDER BY k.tanggal_terakhir DESC, k.created_at DESC, k.id_keluar LIMIT 500;";
pub const KELUAR_SATU_SQL: &str = "SELECT k.id_keluar, k.id_karyawan, COALESCE(m.nama, k.id_karyawan) AS nama, COALESCE(m.unit, '') AS unit, k.id_alasan, COALESCE(k.alasan_nama, '') AS alasan_nama, COALESCE(k.id_sp, '') AS id_sp, COALESCE(k.status_kepegawaian, '') AS status_kepegawaian, COALESCE(k.tanggal_pemberitahuan, '') AS tanggal_pemberitahuan, k.tanggal_terakhir, COALESCE(k.keterangan, '') AS keterangan, COALESCE(k.masa_kerja_mulai, '') AS masa_kerja_mulai, k.kartu_ditarik, COALESCE(k.catatan_checklist, '') AS catatan_checklist, k.dicatat_oleh, k.created_at, COALESCE(k.diubah_oleh, '') AS diubah_oleh, COALESCE(k.diubah_pada, '') AS diubah_pada, COALESCE(k.berlaku_oleh, '') AS berlaku_oleh, COALESCE(k.berlaku_pada, '') AS berlaku_pada, COALESCE(k.dibatalkan_oleh, '') AS dibatalkan_oleh, COALESCE(k.dibatalkan_pada, '') AS dibatalkan_pada, COALESCE(k.alasan_batal, '') AS alasan_batal, k.upah_pokok, k.usulan_upah_pokok, k.tunjangan_tetap, COALESCE(k.alasan_upah, '') AS alasan_upah, COALESCE(k.nomor_sk, '') AS nomor_sk, COALESCE(k.nomor_keterangan, '') AS nomor_keterangan FROM hr_keluar k LEFT JOIN master_data m ON m.id_unik = k.id_karyawan WHERE k.id_keluar = ?1 LIMIT 1;";
/// Proses baru hanya bila pegawai belum punya proses yang tidak dibatalkan;
/// dijaga di transaksi cloud yang sama.
pub const SIMPAN_KELUAR_SQL: &str = "INSERT INTO hr_keluar (id_keluar, id_karyawan, id_alasan, alasan_nama, id_sp, status_kepegawaian, tanggal_pemberitahuan, tanggal_terakhir, keterangan, masa_kerja_mulai, kartu_ditarik, catatan_checklist, dicatat_oleh, created_at, upah_pokok, usulan_upah_pokok, tunjangan_tetap, alasan_upah) SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, datetime('now'), ?14, ?15, ?16, ?17 WHERE NOT EXISTS (SELECT 1 FROM hr_keluar x WHERE x.id_karyawan = ?2 AND x.dibatalkan_pada IS NULL);";
/// Ubah hanya selama belum berlaku dan belum dibatalkan.
pub const UBAH_KELUAR_SQL: &str = "UPDATE hr_keluar SET id_alasan = ?3, alasan_nama = ?4, id_sp = ?5, status_kepegawaian = ?6, tanggal_pemberitahuan = ?7, tanggal_terakhir = ?8, keterangan = ?9, masa_kerja_mulai = ?10, kartu_ditarik = ?11, catatan_checklist = ?12, upah_pokok = ?14, usulan_upah_pokok = ?15, tunjangan_tetap = ?16, alasan_upah = ?17, diubah_oleh = ?13, diubah_pada = datetime('now') WHERE id_keluar = ?1 AND id_karyawan = ?2 AND berlaku_pada IS NULL AND dibatalkan_pada IS NULL;";

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

// SQL pesangon dan surat keluar (4c), dieja harfiah sama di TS

/// Upah sebulan (Q-82): Σ(gaji pokok jam + honor JP) slip run PAID yang
/// `period_end`-nya dalam 12 bulan sampai hari terakhir, dan jumlah bulan
/// berbeda (`?1` pegawai, `?2` hari terakhir).
pub const UPAH_RATA_SQL: &str = "SELECT COALESCE(SUM(i.basic_salary + i.teaching_salary), 0) AS total, COUNT(DISTINCT substr(r.period_end, 1, 7)) AS bulan FROM payroll_items i JOIN payroll_runs r ON r.id = i.payroll_run_id WHERE i.id_karyawan = ?1 AND r.status = 'PAID' AND r.period_end <= ?2 AND r.period_end > date(?2, '-12 months')\n-- batas: satu baris agregat atas slip satu pegawai dalam 12 bulan\n;";
/// Kontrak berlaku pada hari terakhir (`?1`) untuk pegawai `?2`; predikatnya
/// salinan harfiah subkueri `hris::STATUS_KINI_SQL`.
pub const KONTRAK_KELUAR_SQL: &str = "SELECT k.tanggal_mulai, COALESCE(k.tanggal_selesai, '') AS tanggal_selesai FROM hr_kontrak k WHERE k.id_karyawan = ?2 AND k.status <> 'Pembatalan' AND k.tanggal_mulai <= ?1 AND NOT EXISTS (SELECT 1 FROM hr_kontrak b WHERE b.status = 'Pembatalan' AND b.id_ref = k.id_kontrak) ORDER BY k.tanggal_mulai DESC, k.id_kontrak DESC LIMIT 1;";
/// Acuan tunjangan tetap: komponen ALLOWANCE nominal tetap yang aktif; layar
/// menyaring yang berlaku untuk pegawai itu (`appliesToSubject`).
pub const TUNJANGAN_ACUAN_SQL: &str = "SELECT id, name, CAST(ROUND(default_value) AS INTEGER) AS nilai, applies_to FROM payroll_components WHERE category = 'ALLOWANCE' AND calc_type = 'FIXED' AND is_active = 1 ORDER BY name, id LIMIT 100;";
pub const RINCIAN_KELUAR_SQL: &str = "SELECT komponen, COALESCE(dasar, '') AS dasar, usulan, nominal, COALESCE(alasan_ubah, '') AS alasan_ubah, urutan FROM hr_keluar_rincian WHERE id_keluar = ?1 ORDER BY urutan, komponen LIMIT 20;";
/// Rincian ditulis ulang di batch simpan, hanya selama proses belum berlaku
/// dan belum dibatalkan (rincian beku sejak berlaku).
pub const HAPUS_RINCIAN_SQL: &str = "DELETE FROM hr_keluar_rincian WHERE id_keluar = ?1 AND EXISTS (SELECT 1 FROM hr_keluar k WHERE k.id_keluar = ?1 AND k.berlaku_pada IS NULL AND k.dibatalkan_pada IS NULL);";
pub const SIMPAN_RINCIAN_SQL: &str = "INSERT INTO hr_keluar_rincian (id_rincian, id_keluar, komponen, dasar, usulan, nominal, alasan_ubah, urutan) SELECT ?1 || ':' || ?2, ?1, ?2, ?3, ?4, ?5, ?6, ?7 WHERE EXISTS (SELECT 1 FROM hr_keluar k WHERE k.id_keluar = ?1 AND k.berlaku_pada IS NULL AND k.dibatalkan_pada IS NULL);";
pub const SIMPAN_ALASAN_SQL: &str = "INSERT INTO hr_keluar_alasan (id_alasan, nama, pengali_up, pengali_upmk, uph, kompensasi_pkwt, uang_pisah, is_aktif, dasar_hukum, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, datetime('now'), datetime('now'));";
pub const UBAH_ALASAN_SQL: &str = "UPDATE hr_keluar_alasan SET nama = ?2, pengali_up = ?3, pengali_upmk = ?4, uph = ?5, kompensasi_pkwt = ?6, uang_pisah = ?7, is_aktif = ?8, dasar_hukum = ?9, updated_at = datetime('now') WHERE id_alasan = ?1;";
/// Nomor surat keluar, urutan `SURAT_KELUAR`; hanya proses yang berlaku.
pub const NOMOR_KELUAR_SQL: [&str; 2] = [
    "UPDATE hr_keluar SET nomor_sk = ?2 WHERE id_keluar = ?1 AND berlaku_pada IS NOT NULL AND dibatalkan_pada IS NULL;",
    "UPDATE hr_keluar SET nomor_keterangan = ?2 WHERE id_keluar = ?1 AND berlaku_pada IS NOT NULL AND dibatalkan_pada IS NULL;",
];
/// Nomor sama dipakai surat keluar lain: ditandai, tidak ditolak (Q-74).
pub const NOMOR_KELUAR_KEMBAR_SQL: &str = "SELECT COUNT(*) AS jumlah FROM hr_keluar WHERE id_keluar <> ?2 AND (nomor_sk = ?1 OR nomor_keterangan = ?1);";

// Pegawai keluar: akses cloud

fn dengan_status_keluar(b: &mut Value, hari_ini: &str) {
    let status = status_keluar(
        &teks(b, "tanggal_terakhir"),
        !teks(b, "berlaku_pada").is_empty(),
        !teks(b, "dibatalkan_pada").is_empty(),
        hari_ini,
    );
    b["status"] = json!(status);
    b["kartu_ditarik"] = json!(angka(b, "kartu_ditarik") == 1);
    for kunci in ["upah_pokok", "usulan_upah_pokok", "tunjangan_tetap"] {
        b[kunci] = json!(angka(b, kunci));
    }
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
    let bahan = bahan_pesangon(client, &pegawai, &tanggal).await?;
    let checklist = checklist_keluar(client, &id, &tanggal, cuti).await?;
    let rincian = match &header {
        Some(h) => rincian_tersimpan(client, &teks(h, "id_keluar")).await?,
        None => Vec::new(),
    };
    Ok(json!({
        "keluar": header,
        "pegawai": pegawai,
        "status_kepegawaian": bahan["status"],
        "ringkasan": ringkasan_pesangon(&nominal(&rincian), angka(&checklist, "sisa_kasbon")),
        "rincian": rincian,
        "pesangon": bahan,
        "checklist": checklist,
        "alasan": alasan_json(client).await?,
        "hari_ini": hari_ini,
    }))
}

/// Bahan usulan pesangon dari cloud (§22.2.3): status kini, upah rata-rata
/// slip PAID, pembagi UPH, kontrak ber-tanggal selesai, dan acuan tunjangan
/// tetap. Layar menghitung pratinjau dengan `usulanPesangon`; simpan
/// menghitung ulang di sini.
async fn bahan_pesangon(client: &TursoClient, pegawai: &Value, tanggal: &str) -> Result<Value, CommandError> {
    let id = teks(pegawai, "id_unik");
    let (total, bulan) = satu(client, UPAH_RATA_SQL, vec![json!(id), json!(tanggal)])
        .await?
        .map_or((0, 0), |b| (angka(&b, "total"), angka(&b, "bulan")));
    let kontrak_mulai = satu(client, KONTRAK_KELUAR_SQL, vec![json!(tanggal), json!(id)])
        .await?
        .filter(|k| !teks(k, "tanggal_selesai").is_empty())
        .map(|k| teks(&k, "tanggal_mulai"))
        .unwrap_or_default();
    let mut tunjangan = baris(client, TUNJANGAN_ACUAN_SQL, vec![]).await?;
    for t in &mut tunjangan {
        t["nilai"] = json!(angka(t, "nilai"));
    }
    let tugas: Vec<String> = baris(client, super::hris::TUGAS_BERLAKU_SQL, vec![json!(tanggal), json!(tanggal)])
        .await?
        .into_iter()
        .filter(|b| teks(b, "id_karyawan") == id)
        .map(|b| teks(&b, "id_jenis"))
        .collect();
    Ok(json!({
        "status": status_kini(client, &id, tanggal).await?,
        "usulan_upah_pokok": rata_upah(total, bulan),
        "bulan_slip": bulan,
        "pembagi": pembagi_uph(Some(&teks(pegawai, "hari_kerja"))),
        "kontrak_mulai": kontrak_mulai,
        "tunjangan": tunjangan,
        "tugas": tugas,
    }))
}

/// Cermin `masukanPesangon`: bahan cloud + alasan + sisa cuti + upah.
fn masukan_pesangon(
    bahan: &Value,
    pegawai: &Value,
    alasan: &Value,
    sisa_cuti: &Value,
    tanggal: &str,
    upah: i64,
) -> MasukanPesangon {
    let ya = |kunci: &str| alasan[kunci] == json!(true) || angka(alasan, kunci) == 1;
    MasukanPesangon {
        status: teks(bahan, "status"),
        upah,
        masa_kerja_mulai: Some(teks(pegawai, "tanggal_daftar")).filter(|t| !t.is_empty()),
        tanggal_terakhir: tanggal.to_owned(),
        pengali_up: angka(alasan, "pengali_up"),
        pengali_upmk: angka(alasan, "pengali_upmk"),
        uph: ya("uph"),
        kompensasi_pkwt: ya("kompensasi_pkwt"),
        uang_pisah: ya("uang_pisah"),
        sisa_cuti: angka(sisa_cuti, "sisa"),
        sebelum_berhak: sisa_cuti["sebelum_berhak"] == json!(true),
        pembagi: angka(bahan, "pembagi"),
        kontrak_mulai: Some(teks(bahan, "kontrak_mulai")).filter(|t| !t.is_empty()),
    }
}

async fn rincian_tersimpan(client: &TursoClient, id_keluar: &str) -> Result<Vec<Value>, CommandError> {
    let mut rincian = baris(client, RINCIAN_KELUAR_SQL, vec![json!(id_keluar)]).await?;
    for r in &mut rincian {
        for kunci in ["usulan", "nominal", "urutan"] {
            r[kunci] = json!(angka(r, kunci));
        }
    }
    Ok(rincian)
}

fn nominal(rincian: &[Value]) -> Vec<i64> {
    rincian.iter().map(|r| angka(r, "nominal")).collect()
}

/// `desktop_hr_offboarding_save`: catat atau ubah proses yang belum berlaku.
/// `master_data` tidak berubah: pegawai tetap scan, ikut Alfa dan gaji.
pub async fn simpan_keluar(
    client: &TursoClient,
    operator: &OperatorUser,
    draft: &Value,
    sisa_cuti: impl FnOnce(&str, &str) -> Result<Value, CommandError>,
) -> Result<Value, CommandError> {
    client.ensure_schema_current().await?;
    if draft.get("jenis_surat").is_some() {
        return simpan_nomor_keluar(client, operator, draft).await;
    }
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
    let bahan = bahan_pesangon(client, &pegawai, &sah.tanggal_terakhir).await?;
    let usulan_upah = angka(&bahan, "usulan_upah_pokok");
    let upah_pokok = sah.upah_pokok.unwrap_or(usulan_upah);
    let alasan_upah = sah.alasan_upah.clone().filter(|_| upah_pokok != usulan_upah);
    periksa_upah(upah_pokok, usulan_upah, alasan_upah.as_deref()).map_err(galat)?;
    let cuti = sisa_cuti(&sah.id_karyawan, &sah.tanggal_terakhir)?;
    let usulan = usulan_pesangon(&masukan_pesangon(
        &bahan,
        &pegawai,
        &alasan,
        &cuti,
        &sah.tanggal_terakhir,
        upah_pokok + sah.tunjangan_tetap,
    ));
    let rincian = susun_rincian(&usulan, &sah.rincian).map_err(galat)?;
    let args = vec![
        json!(id),
        json!(sah.id_karyawan),
        json!(sah.id_alasan),
        json!(teks(&alasan, "nama")),
        json!(sah.id_sp),
        bahan["status"].clone(),
        json!(sah.tanggal_pemberitahuan),
        json!(sah.tanggal_terakhir),
        json!(sah.keterangan),
        json!(Some(masuk).filter(|m| !m.is_empty())),
        json!(i64::from(sah.kartu_ditarik)),
        json!(sah.catatan_checklist),
        json!(operator.username),
        json!(upah_pokok),
        json!(usulan_upah),
        json!(sah.tunjangan_tetap),
        json!(alasan_upah),
    ];
    // Header + rincian dalam satu batch; rincian dijaga keadaan "belum
    // berlaku" proses yang sama, jadi header yang tidak tertulis tidak
    // meninggalkan rincian.
    let sql = if sah.id_keluar.is_some() { UBAH_KELUAR_SQL } else { SIMPAN_KELUAR_SQL };
    let mut perintah = vec![Statement::new(sql, args), Statement::new(HAPUS_RINCIAN_SQL, vec![json!(id)])];
    for r in &rincian {
        perintah.push(Statement::new(
            SIMPAN_RINCIAN_SQL,
            vec![
                json!(id),
                json!(r.komponen),
                json!(r.dasar),
                json!(r.usulan),
                json!(r.nominal),
                json!(r.alasan_ubah),
                json!(r.urutan),
            ],
        ));
    }
    client.execute_atomic(perintah).await?;
    match satu(client, KELUAR_SATU_SQL, vec![json!(id)]).await? {
        None => Err(galat(PESAN_KELUAR_TERBUKA)),
        Some(h) if !teks(&h, "dibatalkan_pada").is_empty() => Err(galat(PESAN_KELUAR_DIBATALKAN)),
        Some(h) if !teks(&h, "berlaku_pada").is_empty() => Err(galat(PESAN_KELUAR_BERLAKU)),
        Some(_) => Ok(json!({ "sukses": true, "id_keluar": id })),
    }
}

/// Nomor SK Pemberhentian atau surat keterangan pengalaman kerja dari dialog
/// cetak (`{ id_keluar, jenis_surat, nomor }` lewat `desktop_hr_offboarding_save`);
/// nomor kembar hanya ditandai (Q-74).
async fn simpan_nomor_keluar(client: &TursoClient, operator: &OperatorUser, draft: &Value) -> Result<Value, CommandError> {
    let id_keluar = payload_text(draft, "id_keluar").ok_or_else(|| galat("Proses keluar tidak ditemukan."))?;
    let jenis = payload_text(draft, "jenis_surat").unwrap_or_default();
    let nomor = teks_opsional(draft, "nomor", "Nomor surat", NOMOR_MAKS).map_err(galat)?;
    let hari_ini = hari_ini(client).await?;
    let mut header = header_keluar(client, &id_keluar).await?;
    dengan_status_keluar(&mut header, &hari_ini);
    wewenang_keluar(client, operator, &teks(&header, "id_karyawan")).await?;
    periksa_surat_keluar(&jenis, &teks(&header, "status"), &teks(&header, "status_kepegawaian")).map_err(galat)?;
    let sql = if jenis == SURAT_KELUAR[0] { NOMOR_KELUAR_SQL[0] } else { NOMOR_KELUAR_SQL[1] };
    client
        .execute_atomic(vec![Statement::new(sql, vec![json!(id_keluar), json!(nomor)])])
        .await?;
    let kembar = match &nomor {
        Some(n) => satu(client, NOMOR_KELUAR_KEMBAR_SQL, vec![json!(n), json!(id_keluar)])
            .await?
            .is_some_and(|b| angka(&b, "jumlah") > 0),
        None => false,
    };
    Ok(json!({ "sukses": true, "id_keluar": id_keluar, "nomor_kembar": kembar }))
}

/// `desktop_hr_exit_reasons_save`: ubah (`id_alasan`) atau tambah alasan
/// keluar. Proses yang sudah berlaku tidak tersentuh karena rinciannya beku;
/// proses terbuka memakai nilai baru saat disimpan berikutnya.
pub async fn simpan_alasan(client: &TursoClient, draft: &Value) -> Result<Value, CommandError> {
    client.ensure_schema_current().await?;
    let sah = validasi_alasan(draft).map_err(galat)?;
    let id = match &sah.id_alasan {
        Some(id) => {
            satu(client, ALASAN_SATU_SQL, vec![json!(id)])
                .await?
                .ok_or_else(|| galat("Alasan keluar tidak ditemukan."))?;
            id.clone()
        }
        None => new_id("klr-"),
    };
    let args = vec![
        json!(id),
        json!(sah.nama),
        json!(sah.pengali_up),
        json!(sah.pengali_upmk),
        json!(i64::from(sah.uph)),
        json!(i64::from(sah.kompensasi_pkwt)),
        json!(i64::from(sah.uang_pisah)),
        json!(i64::from(sah.is_aktif)),
        json!(sah.dasar_hukum),
    ];
    let sql = if sah.id_alasan.is_some() { UBAH_ALASAN_SQL } else { SIMPAN_ALASAN_SQL };
    client.execute_atomic(vec![Statement::new(sql, args)]).await?;
    Ok(json!({ "sukses": true, "id_alasan": id, "alasan": alasan_json(client).await? }))
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
    let mut potret = checklist_keluar(client, &id_karyawan, &tanggal, cuti).await?;
    periksa_blokir(&potret)?;
    // Rincian dan ringkasan ikut potret: angka saat berlaku tetap terbaca
    // walau kasbon dilunasi sesudahnya.
    let rincian = rincian_tersimpan(client, &id_keluar).await?;
    potret["ringkasan"] = ringkasan_pesangon(&nominal(&rincian), angka(&potret, "sisa_kasbon"));
    potret["rincian"] = json!(rincian);
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

    /// Pesangon (4c): vektor perusahaan §20.5 + status sekolah (Q-81),
    /// upah rata-rata (Q-82), pembagi 25/21 (Q-83), dan surat keluar (Q-86).
    #[test]
    fn hr_keluar_vektor_pesangon() {
        let v = vektor();
        let s = |x: &Value| x.as_str().unwrap_or_default().to_owned();
        for k in v["bulan_penuh"].as_array().expect("bulan_penuh") {
            assert_eq!(json!(bulan_penuh(&s(&k["mulai"]), &s(&k["akhir"]))), k["hasil"], "{k}");
        }
        for k in v["masa_kerja"].as_array().expect("masa_kerja") {
            assert_eq!(json!(masa_kerja_bulan(&s(&k["mulai"]), &s(&k["terakhir"]))), k["hasil"], "{k}");
        }
        for k in v["kelipatan"].as_array().expect("kelipatan") {
            let tahun = k["tahun"].as_i64().unwrap();
            assert_eq!((json!(kelipatan_up(tahun)), json!(kelipatan_upmk(tahun))), (k["up"].clone(), k["upmk"].clone()), "{k}");
        }
        for k in v["rata_upah"].as_array().expect("rata_upah") {
            let hasil = rata_upah(k["total"].as_i64().unwrap(), k["bulan"].as_i64().unwrap());
            assert_eq!(json!(hasil), k["hasil"], "{k}");
        }
        for k in v["pembagi"].as_array().expect("pembagi") {
            assert_eq!(json!(pembagi_uph(k["hari_kerja"].as_str())), k["hasil"], "{k}");
        }
        for k in v["kelompok"].as_array().expect("kelompok") {
            assert_eq!(kelompok_status(&s(&k["status"])), s(&k["hasil"]), "{k}");
        }
        for k in v["pesangon"].as_array().expect("pesangon") {
            let masukan: MasukanPesangon = serde_json::from_value(k["masukan"].clone()).expect("masukan");
            assert_eq!(json!(usulan_pesangon(&masukan)), k["hasil"], "{}", k["nama"]);
        }
        for k in v["susun"].as_array().expect("susun") {
            let usulan: Vec<Usulan> = k["usulan"]
                .as_array()
                .unwrap()
                .iter()
                .map(|u| Usulan {
                    komponen: KOMPONEN_RINCIAN.iter().find(|c| **c == u["komponen"]).copied().expect("komponen"),
                    dasar: u["dasar"].as_str().map(str::to_owned),
                    usulan: u["usulan"].as_i64().unwrap(),
                })
                .collect();
            let isian: Vec<IsianRincian> = serde_json::from_value(k["isian"].clone()).expect("isian");
            match (susun_rincian(&usulan, &isian), k["galat"].as_str()) {
                (Err(e), Some(galat)) => assert_eq!(e, galat, "{}", k["nama"]),
                (Ok(hasil), None) => assert_eq!(json!(hasil), k["hasil"], "{}", k["nama"]),
                (hasil, _) => panic!("{}: {hasil:?}", k["nama"]),
            }
        }
        for k in v["upah"].as_array().expect("upah") {
            let hasil = periksa_upah(
                k["upah_pokok"].as_i64().unwrap(),
                k["usulan"].as_i64().unwrap(),
                k["alasan"].as_str(),
            );
            assert_eq!(hasil.err().as_deref(), k["galat"].as_str(), "{k}");
        }
        for k in v["alasan"].as_array().expect("alasan") {
            match (validasi_alasan(&k["draft"]), k["galat"].as_str()) {
                (Err(e), Some(galat)) => assert_eq!(e, galat, "{}", k["nama"]),
                (Ok(hasil), None) => assert_eq!(json!(hasil), k["hasil"], "{}", k["nama"]),
                (hasil, _) => panic!("{}: {hasil:?}", k["nama"]),
            }
        }
        for k in v["surat_keluar"].as_array().expect("surat_keluar") {
            let hasil = periksa_surat_keluar(&s(&k["jenis"]), &s(&k["status_keluar"]), &s(&k["status_kepegawaian"]));
            assert_eq!(hasil.err().as_deref(), k["galat"].as_str(), "{k}");
        }
        for k in v["ringkasan"].as_array().expect("ringkasan") {
            let nominal: Vec<i64> = serde_json::from_value(k["nominal"].clone()).expect("nominal");
            assert_eq!(ringkasan_pesangon(&nominal, k["sisa_kasbon"].as_i64().unwrap()), k["hasil"], "{k}");
        }
    }

    /// Data uji 4c, sama dengan `services/hr-keluar.test.ts` ("pesangon"):
    /// P1 GTY sejak 2020-07-01, P2 GTT berkontrak 2026, shift lima hari (÷ 21),
    /// slip PAID April–Mei 2026 (dua run di Mei) + slip di luar jendela.
    const DATA_PESANGON_SQL: &str = "
        INSERT INTO tbl_shift (id_shift, kode_shift, nama_shift, jam_masuk, jam_pulang, jam_kerja_normal_menit, hari_kerja) VALUES (77, 77, 'Lima hari', '07:00', '15:00', 420, '1,2,3,4,5');
        INSERT INTO master_data (id_unik, kode_karyawan, nama, divisi, id_shift, jenis_personil, unit, tanggal_daftar, status_aktif) VALUES
          ('P1', 'K1', 'Ani', 'Guru', 77, 'GURU', 'SMP', '2020-07-01', 'Aktif'),
          ('P2', 'K2', 'Budi', 'Guru', 77, 'GURU', 'SMP', '2025-07-01', 'Aktif');
        INSERT INTO hr_kontrak (id_kontrak, id_karyawan, status, tanggal_mulai, tanggal_selesai) VALUES
          ('k1', 'P1', 'GTY', '2020-07-01', NULL), ('k2', 'P2', 'GTT', '2026-01-01', '2026-12-31');
        INSERT INTO payroll_runs (id, idempotency_key, period_start, period_end, status, created_by) VALUES
          ('r-apr', 'r-apr', '2026-04-01', '2026-04-30', 'PAID', 'x'), ('r-mei', 'r-mei', '2026-05-01', '2026-05-31', 'PAID', 'x'),
          ('r-mei2', 'r-mei2', '2026-05-01', '2026-05-31', 'PAID', 'x'), ('r-jun', 'r-jun', '2026-06-01', '2026-06-30', 'DRAFT', 'x'),
          ('r-lama', 'r-lama', '2025-05-01', '2025-05-31', 'PAID', 'x');
        INSERT INTO payroll_items (id, payroll_run_id, id_karyawan, nama_karyawan, divisi, total_regular_hours, total_overtime_hours, total_overtime_index, rate_per_hour, basic_salary, teaching_salary, overtime_salary, gross_salary, net_salary, breakdown_snapshot) VALUES
          ('i1', 'r-apr', 'P1', 'Ani', 'Guru', 0, 0, 0, 0, 3000000, 1000000, 500000, 0, 0, '{}'),
          ('i2', 'r-mei', 'P1', 'Ani', 'Guru', 0, 0, 0, 0, 3000000, 500000, 0, 0, 0, '{}'),
          ('i3', 'r-mei2', 'P1', 'Ani', 'Guru', 0, 0, 0, 0, 0, 500000, 0, 0, 0, '{}'),
          ('i4', 'r-jun', 'P1', 'Ani', 'Guru', 0, 0, 0, 0, 9000000, 0, 0, 0, 0, '{}'),
          ('i5', 'r-lama', 'P1', 'Ani', 'Guru', 0, 0, 0, 0, 9000000, 0, 0, 0, 0, '{}');";

    fn sisa_tiga(_: &str, _: &str) -> Result<Value, CommandError> {
        Ok(json!({ "sisa": 3, "sebelum_berhak": false }))
    }

    /// Alur 4c di cloud: usulan upah dari slip PAID, rincian ditulis ulang di
    /// batch simpan, nominal/upah beda wajib alasan, alasan & pengali disunting
    /// tanpa menyentuh rincian tersimpan, rincian beku dan ikut potret sejak
    /// berlaku, nomor surat keluar disimpan dan nomor kembar hanya ditandai.
    #[test]
    fn hr_keluar_pesangon_cloud() {
        let runtime = tokio::runtime::Builder::new_current_thread().build().expect("runtime uji");
        runtime.block_on(async {
            let (_dir, client, hub) = hub_uji();
            client.ensure_schema().await.expect("provisioning lokal");
            let c = rusqlite::Connection::open(&hub).expect("buka hub");
            c.execute_batch(DATA_PESANGON_SQL).expect("data uji");
            let galat_dari = |h: Result<Value, CommandError>| h.err().map(|e| e.message).unwrap_or_default();
            let yayasan = operator(None, &["hr.offboard.manage", "hr.offboard.decide", "hr.scope.all"]);
            let rincian_db = |id: &str| -> Vec<(String, i64, i64, Option<String>)> {
                let mut q = c
                    .prepare("SELECT komponen, usulan, nominal, alasan_ubah FROM hr_keluar_rincian WHERE id_keluar = ?1 ORDER BY urutan;")
                    .expect("query");
                q.query_map([id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))
                    .expect("rincian")
                    .map(Result::unwrap)
                    .collect()
            };

            let mut draft = json!({ "id_karyawan": "P1", "id_alasan": "klr-efisiensi", "tanggal_terakhir": "2026-06-30" });
            let id1 = simpan_keluar(&client, &yayasan, &draft, sisa_tiga).await.expect("catat")["id_keluar"]
                .as_str()
                .expect("id")
                .to_owned();
            let (upah, usulan, tunjangan): (i64, i64, i64) = c
                .query_row("SELECT upah_pokok, usulan_upah_pokok, tunjangan_tetap FROM hr_keluar WHERE id_keluar = ?1;", [&id1], |r| {
                    Ok((r.get(0)?, r.get(1)?, r.get(2)?))
                })
                .expect("upah");
            assert_eq!((upah, usulan, tunjangan), (4_000_000, 4_000_000, 0), "(4 + 3,5 + 0,5) juta ÷ 2 bulan");
            let ringkas = |r: Vec<(String, i64, i64, Option<String>)>| -> Vec<(String, i64)> {
                r.into_iter().map(|(k, _, n, _)| (k, n)).collect()
            };
            assert_eq!(
                ringkas(rincian_db(&id1)),
                vec![
                    ("UP".into(), 28_000_000),
                    ("UPMK".into(), 12_000_000),
                    ("UPH Cuti".into(), 571_429),
                    ("UPH Lainnya".into(), 0),
                    ("Lainnya".into(), 0)
                ]
            );

            draft["id_keluar"] = json!(id1);
            draft["rincian"] = json!([{ "komponen": "Lainnya", "nominal": 250_000 }]);
            assert_eq!(
                galat_dari(simpan_keluar(&client, &yayasan, &draft, sisa_tiga).await),
                "Nominal Lainnya berbeda dari usulan; alasannya wajib diisi."
            );
            draft["rincian"] = json!([{ "komponen": "Lainnya", "nominal": 250_000, "alasan_ubah": "Penghargaan masa bakti" }]);
            draft["upah_pokok"] = json!(4_500_000);
            assert_eq!(
                galat_dari(simpan_keluar(&client, &yayasan, &draft, sisa_tiga).await),
                "Upah pokok berbeda dari usulan; alasannya wajib diisi."
            );
            draft["alasan_upah"] = json!("Honor JP Juni");
            draft["tunjangan_tetap"] = json!(500_000);
            simpan_keluar(&client, &yayasan, &draft, sisa_tiga).await.expect("ubah dengan alasan");
            let r = rincian_db(&id1);
            assert_eq!(r.len(), 5, "rincian ditulis ulang, tidak menumpuk");
            assert_eq!(r[0].2, 35_000_000, "UP 7 × (4,5 + 0,5) juta");
            assert_eq!(r[4], ("Lainnya".into(), 0, 250_000, Some("Penghargaan masa bakti".into())));

            // Pengali disunting: tidak menyentuh rincian tersimpan.
            let alasan = json!({ "id_alasan": "klr-efisiensi", "nama": "PHK Efisiensi", "pengali_up": 50, "pengali_upmk": 100, "uph": true });
            simpan_alasan(&client, &alasan).await.expect("ubah pengali");
            assert_eq!(rincian_db(&id1)[0].2, 35_000_000);
            assert_eq!(
                galat_dari(simpan_alasan(&client, &json!({ "id_alasan": "klr-hilang", "nama": "X", "pengali_up": 0, "pengali_upmk": 0 })).await),
                "Alasan keluar tidak ditemukan."
            );
            let baru = simpan_alasan(&client, &json!({ "nama": "Mutasi Yayasan", "pengali_up": 0, "pengali_upmk": 0 })).await.expect("tambah");
            assert_eq!(baru["alasan"].as_array().map(Vec::len), Some(10));

            let rincian = rincian_keluar(&client, Some(&id1), None, None, sisa_tiga).await.expect("rincian");
            assert_eq!(rincian["pesangon"]["usulan_upah_pokok"], json!(4_000_000));
            assert_eq!(rincian["pesangon"]["bulan_slip"], json!(2));
            assert_eq!(rincian["pesangon"]["pembagi"], json!(21));
            assert_eq!(rincian["status_kepegawaian"], json!("GTY"));
            assert_eq!(rincian["rincian"].as_array().map(Vec::len), Some(5));
            assert_eq!(rincian["ringkasan"]["total"], json!(35_000_000 + 15_000_000 + 714_286 + 250_000));

            // GTT habis kontrak: kompensasi PKWT; tanpa slip upah wajib diisi beralasan.
            let mut gtt = json!({ "id_karyawan": "P2", "id_alasan": "klr-habis-kontrak", "tanggal_terakhir": "2026-06-30", "upah_pokok": 3_000_000 });
            assert_eq!(
                galat_dari(simpan_keluar(&client, &yayasan, &gtt, sisa_tiga).await),
                "Upah pokok berbeda dari usulan; alasannya wajib diisi."
            );
            gtt["alasan_upah"] = json!("Belum ada slip PAID");
            let id2 = simpan_keluar(&client, &yayasan, &gtt, sisa_tiga).await.expect("GTT")["id_keluar"]
                .as_str()
                .expect("id")
                .to_owned();
            assert_eq!(
                ringkas(rincian_db(&id2)),
                vec![
                    ("UPH Cuti".into(), 428_571),
                    ("UPH Lainnya".into(), 0),
                    ("Kompensasi PKWT".into(), 1_500_000),
                    ("Lainnya".into(), 0)
                ]
            );

            // Berlakukan: rincian beku dan ikut potret.
            berlakukan_keluar(&client, &yayasan, &id1, sisa_tiga).await.expect("berlakukan P1");
            berlakukan_keluar(&client, &yayasan, &id2, sisa_tiga).await.expect("berlakukan P2");
            let potret: String = c
                .query_row("SELECT checklist_saat_berlaku FROM hr_keluar WHERE id_keluar = ?1;", [&id1], |r| r.get(0))
                .expect("potret");
            let potret: Value = serde_json::from_str(&potret).expect("json");
            assert_eq!(potret["rincian"].as_array().map(Vec::len), Some(5));
            assert_eq!(potret["ringkasan"]["perkiraan_diterima"], potret["ringkasan"]["total"]);
            draft["rincian"] = json!([]);
            assert_eq!(galat_dari(simpan_keluar(&client, &yayasan, &draft, sisa_tiga).await), PESAN_KELUAR_BERLAKU);
            assert_eq!(rincian_db(&id1)[4].2, 250_000, "rincian beku sejak berlaku");

            // Nomor surat keluar: disimpan; kembar ditandai; SK hanya GTY/PTY.
            let nomor = |id: &str, jenis: &str, nomor: &str| json!({ "id_keluar": id, "jenis_surat": jenis, "nomor": nomor });
            let sk = simpan_keluar(&client, &yayasan, &nomor(&id1, "berhenti", "001/SK"), sisa_tiga).await.expect("nomor SK");
            assert_eq!(sk["nomor_kembar"], json!(false));
            assert_eq!(
                galat_dari(simpan_keluar(&client, &yayasan, &nomor(&id2, "berhenti", "002/SK"), sisa_tiga).await),
                PESAN_SK_BUKAN_TETAP
            );
            let ket = simpan_keluar(&client, &yayasan, &nomor(&id2, "pengalaman", "001/SK"), sisa_tiga).await.expect("nomor keterangan");
            assert_eq!(ket["nomor_kembar"], json!(true));
            let (sk1, ket2): (String, String) = c
                .query_row(
                    "SELECT (SELECT nomor_sk FROM hr_keluar WHERE id_keluar = ?1), (SELECT nomor_keterangan FROM hr_keluar WHERE id_keluar = ?2);",
                    [&id1, &id2],
                    |r| Ok((r.get(0)?, r.get(1)?)),
                )
                .expect("nomor");
            assert_eq!((sk1.as_str(), ket2.as_str()), ("001/SK", "001/SK"));
        });
    }

    fn tanpa_cuti(_: &str, _: &str) -> Result<Value, CommandError> {
        Ok(Value::Null)
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

            assert_eq!(galat_dari(simpan_keluar(&client, &kepeg, &json!({ "id_karyawan": "KS", "id_alasan": "klr-resign", "tanggal_terakhir": "2026-06-30" }), tanpa_cuti).await), PESAN_DIRI_SENDIRI);
            let id = simpan_keluar(&client, &kepeg, &draft, tanpa_cuti).await.expect("catat")["id_keluar"].as_str().expect("id").to_owned();
            assert_eq!(galat_dari(simpan_keluar(&client, &kepeg, &draft, tanpa_cuti).await), PESAN_KELUAR_TERBUKA);
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
            assert_eq!(galat_dari(simpan_keluar(&client, &kepeg, &ubah, tanpa_cuti).await), PESAN_KELUAR_BERLAKU);

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
            simpan_keluar(&client, &kepeg, &draft, tanpa_cuti).await.expect("catat ulang");
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
            let id = simpan_keluar(&client, &yayasan, &json!({ "id_karyawan": "P9", "id_alasan": "klr-resign", "tanggal_terakhir": "2026-06-30" }), tanpa_cuti)
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
