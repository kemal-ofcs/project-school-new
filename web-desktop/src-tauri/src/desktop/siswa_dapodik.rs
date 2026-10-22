//! Data DAPODIK per siswa (`siswa_dapodik`, schema v57, cloud-only).
//!
//! Kembaran `src/lib/validations/siswa-dapodik.ts`. Konstanta SQL dan daftar
//! pilihan dieja sama persis (diperiksa `siswa-dapodik.test.ts` dengan membaca
//! berkas ini); `validasi_simpan` diuji dengan vektor bersama
//! `siswa-dapodik.vektor.json`. Daftar pilihan berasal dari
//! `validations/pmb-dapodik.ts`, satu-satunya tempat ejaannya diputuskan.

use serde_json::{Map, Value};

use super::turso::{
    is_valid_operator_email, is_valid_operator_phone, normalize_operator_email,
    normalize_operator_phone,
};

pub const SQL_SALIN_DAPODIK_PMB: &str = "INSERT OR IGNORE INTO siswa_dapodik (id_siswa, tempat_lahir, tanggal_lahir, sekolah_asal, data_dapodik, diubah_oleh, created_at, updated_at) SELECT id_siswa, tempat_lahir, tanggal_lahir, asal_sekolah, data_dapodik, 'PMB', datetime('now', '+7 hours'), datetime('now', '+7 hours') FROM pmb_pendaftar WHERE status = 'Terdaftar' AND TRIM(COALESCE(id_siswa, '')) <> ''";

pub const SQL_SIMPAN_DAPODIK_SISWA: &str = "INSERT INTO siswa_dapodik (id_siswa, tempat_lahir, tanggal_lahir, sekolah_asal, data_dapodik, diubah_oleh, created_at, updated_at) SELECT ?, ?, ?, ?, ?, ?, datetime('now', '+7 hours'), datetime('now', '+7 hours') WHERE EXISTS (SELECT 1 FROM siswa_data WHERE id_siswa = ?) ON CONFLICT(id_siswa) DO UPDATE SET tempat_lahir = excluded.tempat_lahir, tanggal_lahir = excluded.tanggal_lahir, sekolah_asal = excluded.sekolah_asal, data_dapodik = excluded.data_dapodik, diubah_oleh = excluded.diubah_oleh, updated_at = excluded.updated_at";

pub const SQL_KOSONGKAN_DAPODIK_SISWA: &str = "UPDATE siswa_dapodik SET tempat_lahir = NULL, tanggal_lahir = NULL, sekolah_asal = NULL, data_dapodik = NULL, diubah_oleh = ?, updated_at = datetime('now', '+7 hours') WHERE id_siswa = ?";

pub const PESAN_SISWA_BELUM_DI_CLOUD: &str =
    "Siswa ini belum ada di database cloud. Jalankan sinkronisasi, lalu simpan lagi.";

/// Batas id per permintaan baca, sama dengan `MAKS_ID_BACA_DAPODIK`.
pub const MAKS_ID_BACA: usize = 200;

/// Sama dengan `VERSI_DATA_DAPODIK`.
pub const VERSI_DATA_DAPODIK: i64 = 1;

pub const AGAMA: &[&str] = &[
    "Islam",
    "Kristen",
    "Katholik",
    "Hindu",
    "Budha",
    "Khonghucu",
];

pub const JENIS_TINGGAL: &[&str] = &[
    "Bersama orang tua",
    "Wali",
    "Kos",
    "Asrama",
    "Panti asuhan",
    "Pesantren",
    "Lainnya",
];

pub const ALAT_TRANSPORTASI: &[&str] = &[
    "Jalan kaki",
    "Sepeda",
    "Sepeda motor",
    "Mobil pribadi",
    "Angkutan umum/bus/pete-pete",
    "Mobil/bus antar jemput",
    "Ojek",
    "Kereta api",
    "Andong/bendi/sado/dokar/delman/becak",
    "Perahu penyeberangan/rakit/getek",
    "Lainnya",
];

pub const JENJANG_PENDIDIKAN: &[&str] = &[
    "Tidak sekolah",
    "SD / sederajat",
    "SMP / sederajat",
    "SMA / sederajat",
    "Paket A",
    "Paket B",
    "Paket C",
    "D1",
    "D2",
    "D3",
    "D4",
    "S1",
    "Profesi",
    "S2",
    "S3",
    "Lainnya",
];

pub const PEKERJAAN: &[&str] = &[
    "Tidak bekerja",
    "Nelayan",
    "Petani",
    "Peternak",
    "PNS/TNI/Polri",
    "Karyawan Swasta",
    "Karyawan BUMN",
    "Pedagang Kecil",
    "Pedagang Besar",
    "Wiraswasta",
    "Wirausaha",
    "Buruh",
    "Pensiunan",
    "Tenaga Kerja Indonesia",
    "Sudah Meninggal",
    "Lainnya",
];

pub const PENGHASILAN: &[&str] = &[
    "Tidak Berpenghasilan",
    "Kurang dari Rp500.000",
    "Rp500.000 - Rp1.000.000",
    "Rp1.000.001 - Rp3.000.000",
    "Rp3.000.001 - Rp5.000.000",
    "Lebih dari Rp5.000.000",
];

pub const KEBUTUHAN_KHUSUS: &[&str] = &[
    "Tidak ada",
    "Netra",
    "Rungu",
    "Grahita ringan",
    "Grahita sedang",
    "Daksa ringan",
    "Daksa sedang",
    "Laras",
    "Wicara",
    "Tuna ganda",
    "Hiperaktif",
    "Cerdas istimewa",
    "Bakat istimewa",
    "Kesulitan belajar",
    "Autis",
    "Lainnya",
];

enum Aturan {
    /// Teks bebas, dipangkas, maksimal sekian karakter.
    Teks(usize),
    Pilihan(&'static [&'static str], &'static str),
    /// Hanya angka, panjang min..=maks.
    Digit(usize, usize, &'static str),
    Angka(f64, f64, &'static str),
    YaTidak,
    Hp(&'static str),
    Email(&'static str),
}

/// Urutan = urutan skema `dataDapodikSchema`, ditambah `lingkarKepalaCm`.
const ATURAN: &[(&str, Aturan)] = &[
    (
        "nik",
        Aturan::Digit(16, 16, "NIK calon siswa harus 16 angka."),
    ),
    ("agama", Aturan::Pilihan(AGAMA, "Pilih agama calon siswa.")),
    ("noAktaLahir", Aturan::Teks(40)),
    (
        "kebutuhanKhusus",
        Aturan::Pilihan(KEBUTUHAN_KHUSUS, "Pilih kebutuhan khusus."),
    ),
    (
        "anakKe",
        Aturan::Angka(1.0, 20.0, "Anak ke- harus 1 sampai 20."),
    ),
    (
        "jumlahSaudara",
        Aturan::Angka(0.0, 20.0, "Jumlah saudara kandung harus 0 sampai 20."),
    ),
    ("hpSiswa", Aturan::Hp("Nomor HP calon siswa tidak valid.")),
    ("emailSiswa", Aturan::Email("Email siswa tidak valid.")),
    ("rt", Aturan::Digit(1, 3, "RT berupa angka (maksimal 3).")),
    ("rw", Aturan::Digit(1, 3, "RW berupa angka (maksimal 3).")),
    ("dusun", Aturan::Teks(80)),
    ("kelurahan", Aturan::Teks(80)),
    ("kecamatan", Aturan::Teks(80)),
    ("kodePos", Aturan::Digit(5, 5, "Kode pos harus 5 angka.")),
    (
        "jenisTinggal",
        Aturan::Pilihan(JENIS_TINGGAL, "Pilih tinggal bersama siapa."),
    ),
    (
        "transportasi",
        Aturan::Pilihan(ALAT_TRANSPORTASI, "Pilih alat transportasi."),
    ),
    (
        "jarakKm",
        Aturan::Angka(0.0, 500.0, "Jarak ke sekolah harus 0 sampai 500 km."),
    ),
    ("noKk", Aturan::Digit(16, 16, "Nomor KK harus 16 angka.")),
    ("ayahNama", Aturan::Teks(120)),
    (
        "ayahTahunLahir",
        Aturan::Angka(1900.0, 2100.0, "Tahun lahir ayah wajib diisi dengan benar."),
    ),
    (
        "ayahPendidikan",
        Aturan::Pilihan(JENJANG_PENDIDIKAN, "Pilih pendidikan ayah."),
    ),
    (
        "ayahPekerjaan",
        Aturan::Pilihan(PEKERJAAN, "Pilih pekerjaan ayah."),
    ),
    (
        "ayahPenghasilan",
        Aturan::Pilihan(PENGHASILAN, "Pilih penghasilan ayah."),
    ),
    ("ayahNik", Aturan::Digit(16, 16, "NIK ayah harus 16 angka.")),
    ("ibuNama", Aturan::Teks(120)),
    (
        "ibuTahunLahir",
        Aturan::Angka(1900.0, 2100.0, "Tahun lahir ibu wajib diisi dengan benar."),
    ),
    (
        "ibuPendidikan",
        Aturan::Pilihan(JENJANG_PENDIDIKAN, "Pilih pendidikan ibu."),
    ),
    (
        "ibuPekerjaan",
        Aturan::Pilihan(PEKERJAAN, "Pilih pekerjaan ibu."),
    ),
    (
        "ibuPenghasilan",
        Aturan::Pilihan(PENGHASILAN, "Pilih penghasilan ibu."),
    ),
    ("ibuNik", Aturan::Digit(16, 16, "NIK ibu harus 16 angka.")),
    ("waliNama", Aturan::Teks(120)),
    (
        "waliTahunLahir",
        Aturan::Angka(1900.0, 2100.0, "Tahun lahir wali wajib diisi dengan benar."),
    ),
    (
        "waliPendidikan",
        Aturan::Pilihan(JENJANG_PENDIDIKAN, "Pilih pendidikan wali."),
    ),
    (
        "waliPekerjaan",
        Aturan::Pilihan(PEKERJAAN, "Pilih pekerjaan wali."),
    ),
    (
        "waliPenghasilan",
        Aturan::Pilihan(PENGHASILAN, "Pilih penghasilan wali."),
    ),
    ("waliNik", Aturan::Digit(16, 16, "NIK wali harus 16 angka.")),
    ("kps", Aturan::YaTidak),
    ("noKps", Aturan::Teks(40)),
    ("kip", Aturan::YaTidak),
    ("noKip", Aturan::Teks(40)),
    ("namaKip", Aturan::Teks(120)),
    ("noKks", Aturan::Teks(40)),
    (
        "beratKg",
        Aturan::Angka(1.0, 200.0, "Berat badan harus 1 sampai 200 kg."),
    ),
    (
        "tinggiCm",
        Aturan::Angka(30.0, 250.0, "Tinggi badan harus 30 sampai 250 cm."),
    ),
    (
        "lingkarKepalaCm",
        Aturan::Angka(1.0, 100.0, "Lingkar kepala harus 1 sampai 100 cm."),
    ),
];

fn kosong(nilai: &Value) -> bool {
    match nilai {
        Value::Null => true,
        Value::String(teks) => teks.trim().is_empty(),
        _ => false,
    }
}

/// Angka utuh disimpan sebagai bilangan bulat, sama dengan JSON dari JS.
fn ke_angka_json(angka: f64) -> Value {
    if angka.fract() == 0.0 && angka.abs() < 9_007_199_254_740_992.0 {
        Value::from(angka as i64)
    } else {
        Value::from(angka)
    }
}

fn periksa(nilai: &Value, aturan: &Aturan) -> Result<Value, String> {
    let teks = || nilai.as_str().map(str::trim);
    match aturan {
        Aturan::Teks(maks) => {
            let isi = teks().ok_or_else(|| format!("Maksimal {maks} karakter."))?;
            if isi.chars().count() > *maks {
                return Err(format!("Maksimal {maks} karakter."));
            }
            Ok(Value::from(isi))
        }
        Aturan::Pilihan(daftar, pesan) => match nilai.as_str() {
            Some(isi) if daftar.contains(&isi) => Ok(Value::from(isi)),
            _ => Err((*pesan).to_owned()),
        },
        Aturan::Digit(min, maks, pesan) => match teks() {
            Some(isi)
                if (*min..=*maks).contains(&isi.chars().count())
                    && isi.chars().all(|c| c.is_ascii_digit()) =>
            {
                Ok(Value::from(isi))
            }
            _ => Err((*pesan).to_owned()),
        },
        Aturan::Angka(min, maks, pesan) => {
            let angka = match nilai {
                Value::Number(angka) => angka.as_f64(),
                Value::String(isi) => isi.trim().replacen(',', ".", 1).parse::<f64>().ok(),
                _ => None,
            };
            match angka {
                Some(angka) if angka.is_finite() && angka >= *min && angka <= *maks => {
                    Ok(ke_angka_json(angka))
                }
                _ => Err((*pesan).to_owned()),
            }
        }
        Aturan::YaTidak => match nilai {
            Value::Bool(_) => Ok(nilai.clone()),
            Value::String(isi) if isi == "Ya" => Ok(Value::Bool(true)),
            Value::String(isi) if isi == "Tidak" => Ok(Value::Bool(false)),
            _ => Err("Pilih Ya atau Tidak.".to_owned()),
        },
        Aturan::Hp(pesan) => match teks() {
            Some(isi) if is_valid_operator_phone(isi) => {
                Ok(Value::from(normalize_operator_phone(isi)))
            }
            _ => Err((*pesan).to_owned()),
        },
        Aturan::Email(pesan) => match teks() {
            Some(isi) if is_valid_operator_email(isi) => {
                Ok(Value::from(normalize_operator_email(isi)))
            }
            _ => Err((*pesan).to_owned()),
        },
    }
}

fn teks_opsional(
    masukan: &Map<String, Value>,
    kunci: &str,
    maks: usize,
    pesan: &str,
) -> Result<Value, String> {
    match masukan.get(kunci) {
        None => Ok(Value::Null),
        Some(nilai) if kosong(nilai) => Ok(Value::Null),
        Some(Value::String(isi)) if isi.trim().chars().count() <= maks => {
            Ok(Value::from(isi.trim()))
        }
        Some(_) => Err(pesan.to_owned()),
    }
}

fn tanggal_sah(teks: &str) -> bool {
    let bagian: Vec<&str> = teks.split('-').collect();
    let [tahun, bulan, hari] = bagian.as_slice() else {
        return false;
    };
    if tahun.len() != 4
        || bulan.len() != 2
        || hari.len() != 2
        || !teks.chars().all(|c| c.is_ascii_digit() || c == '-')
    {
        return false;
    }
    let (Ok(tahun), Ok(bulan), Ok(hari)) = (
        tahun.parse::<u32>(),
        bulan.parse::<u32>(),
        hari.parse::<u32>(),
    ) else {
        return false;
    };
    if tahun < 1900 || !(1..=12).contains(&bulan) || hari < 1 {
        return false;
    }
    let kabisat = (tahun % 4 == 0 && tahun % 100 != 0) || tahun % 400 == 0;
    let jumlah_hari = [
        31,
        if kabisat { 29 } else { 28 },
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31,
    ];
    hari <= jumlah_hari[(bulan - 1) as usize]
}

/// Validasi permintaan simpan berbentuk sama dengan kiriman gateway
/// (`{ idSiswa, tempatLahir, tanggalLahir, sekolahAsal, data }`). Kembaran
/// `validasiSimpanDapodikSiswa`; galatnya pesan isian pertama yang salah.
pub fn validasi_simpan(masukan: &Value) -> Result<Value, String> {
    let masukan = masukan.as_object().ok_or("Data DAPODIK tidak valid.")?;
    const KUNCI_ATAS: &[&str] = &[
        "idSiswa",
        "tempatLahir",
        "tanggalLahir",
        "sekolahAsal",
        "data",
    ];

    let id_siswa = masukan
        .get("idSiswa")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|id| !id.is_empty() && id.chars().count() <= 80)
        .ok_or("Siswa tidak dikenal.")?;
    let tempat_lahir = teks_opsional(
        masukan,
        "tempatLahir",
        80,
        "Tempat lahir maksimal 80 karakter.",
    )?;
    let tanggal_lahir = match masukan.get("tanggalLahir") {
        None => Value::Null,
        Some(nilai) if kosong(nilai) => Value::Null,
        Some(Value::String(isi)) if tanggal_sah(isi.trim()) => Value::from(isi.trim()),
        Some(_) => return Err("Tanggal lahir tidak valid.".to_owned()),
    };
    let sekolah_asal = teks_opsional(
        masukan,
        "sekolahAsal",
        120,
        "Sekolah asal maksimal 120 karakter.",
    )?;

    let data_masuk = masukan
        .get("data")
        .and_then(Value::as_object)
        .ok_or("Data DAPODIK tidak valid.")?;
    let mut data = Map::new();
    for (kunci, aturan) in ATURAN {
        match data_masuk.get(*kunci) {
            Some(nilai) if !kosong(nilai) => {
                data.insert((*kunci).to_owned(), periksa(nilai, aturan)?);
            }
            _ => {}
        }
    }
    if let Some(asing) = data_masuk
        .keys()
        .find(|kunci| !ATURAN.iter().any(|(nama, _)| nama == kunci))
    {
        return Err(format!("Isian tidak dikenal: {asing}."));
    }
    if let Some(asing) = masukan
        .keys()
        .find(|kunci| !KUNCI_ATAS.contains(&kunci.as_str()))
    {
        return Err(format!("Isian tidak dikenal: {asing}."));
    }

    Ok(serde_json::json!({
        "idSiswa": id_siswa,
        "tempatLahir": tempat_lahir,
        "tanggalLahir": tanggal_lahir,
        "sekolahAsal": sekolah_asal,
        "data": data,
    }))
}

/// Isi kolom `data_dapodik`: `{versi, ...data}`, bentuk yang sama dengan
/// tulisan formulir PMB; data kosong disimpan NULL.
pub fn json_data_dapodik(data: &Value) -> Option<String> {
    let data = data.as_object().filter(|data| !data.is_empty())?;
    let mut isi = Map::new();
    isi.insert("versi".to_owned(), Value::from(VERSI_DATA_DAPODIK));
    isi.extend(data.clone());
    Some(Value::Object(isi).to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Vektor yang sama dibaca `siswa-dapodik.test.ts`.
    #[test]
    fn vektor_bersama_validasi_simpan() {
        let vektor: Vec<Value> = serde_json::from_str(include_str!(
            "../../../src/lib/validations/siswa-dapodik.vektor.json"
        ))
        .expect("vektor valid");
        assert!(vektor.len() > 10);
        for kasus in vektor {
            let nama = kasus["nama"].as_str().unwrap_or_default();
            let hasil = validasi_simpan(&kasus["masukan"]);
            if let Some(harapan) = kasus.get("hasil") {
                assert_eq!(hasil.as_ref(), Ok(harapan), "{nama}");
            } else {
                let galat = hasil.expect_err(nama);
                if let Some(pesan) = kasus.get("galat").and_then(Value::as_str) {
                    assert_eq!(galat, pesan, "{nama}");
                }
            }
        }
    }

    #[test]
    fn data_dapodik_diberi_versi_dan_kosong_jadi_null() {
        assert_eq!(json_data_dapodik(&serde_json::json!({})), None);
        let isi: Value =
            serde_json::from_str(&json_data_dapodik(&serde_json::json!({ "nik": "1" })).unwrap())
                .unwrap();
        assert_eq!(isi, serde_json::json!({ "versi": 1, "nik": "1" }));
    }
}
