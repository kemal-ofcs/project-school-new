// BERKAS INI HASIL SALIN OTOMATIS dari web-desktop oleh
// `mobile/scripts/sync-rust-modules.ts`. JANGAN disunting dengan tangan —
// perubahannya akan tertimpa diam-diam pada sinkronisasi berikutnya.
// Sunting sumbernya: `web-desktop/src-tauri/src/desktop/rapel.rs`.

//! Rapel gaji (schema v51): selisih upah slip yang SUDAH DIBAYAR karena tarif
//! per jam yang berlaku untuk periodenya berubah sesudah slip dibekukan.
//!
//! Satu tabel tersinkron, `payroll_rapel`. Selisihnya dihitung dari angka beku
//! slip asal (menit kerja, indeks lembur, komponen persen saat itu), tidak
//! pernah dari absensi atau aturan hari ini. Status tidak disimpan: dibatalkan
//! dari kolomnya, sisanya dari proses gaji (bukan REJECTED) yang memuat id
//! rapel di `breakdown_snapshot.rapel`, persis pola kasbon.
//!
//! Aturan murni di berkas ini dicerminkan `src/lib/validations/payroll-rapel.ts`
//! dan diuji dengan vektor yang sama. Pesan galatnya pun wajib identik. SQL di
//! bawah dieja sama persis di `services/payroll-rapel.ts`.

use std::collections::{HashMap, HashSet};

use rusqlite::{params, Connection, OptionalExtension};
use rust_decimal::prelude::*;
use rust_decimal::Decimal;
use serde::Deserialize;
use serde_json::{json, Value};

use super::{config::MobileState, loan, models::CommandError, storage, sync};

pub const MAKS_BULAN_DETEKSI: i64 = 12;
pub const MAKS_SIMPAN_RAPEL: usize = 500;
pub const MAKS_ALASAN_BATAL_RAPEL: usize = 200;
/// `calc_type` entri slip, sejajar dengan `KASBON`.
pub const CALC_TYPE_RAPEL: &str = "RAPEL";

const NAMA_BULAN: [&str; 12] = [
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember",
];

// Aturan murni

/// Cermin `idRapel`. Tarif baru ikut di id supaya kenaikan kedua atas slip
/// yang sama menjadi rapel tersendiri.
pub fn id_rapel(id_item: &str, rate_baru: i64) -> String {
    format!("rpl-{id_item}-{rate_baru}")
}

fn bulan_ke(periode: &str) -> i64 {
    let tahun: i64 = periode
        .chars()
        .take(4)
        .collect::<String>()
        .parse()
        .unwrap_or(0);
    let bulan: i64 = periode
        .chars()
        .skip(5)
        .take(2)
        .collect::<String>()
        .parse()
        .unwrap_or(0);
    tahun * 12 + bulan
}

/// Cermin `validateRentang`.
pub fn validate_rentang(dari: &str, sampai: &str) -> Result<(), String> {
    if !loan::is_valid_periode(dari) || !loan::is_valid_periode(sampai) {
        return Err("Bulan awal dan akhir wajib berformat YYYY-MM.".to_owned());
    }
    let jumlah = bulan_ke(sampai) - bulan_ke(dari) + 1;
    if jumlah < 1 {
        return Err("Bulan awal tidak boleh sesudah bulan akhir.".to_owned());
    }
    if jumlah > MAKS_BULAN_DETEKSI {
        return Err(format!(
            "Rentang pencarian paling lama {MAKS_BULAN_DETEKSI} bulan."
        ));
    }
    Ok(())
}

/// Cermin `validateAlasanBatal`.
pub fn validate_alasan_batal(alasan: &str) -> Result<String, String> {
    let rapi = alasan.trim();
    if rapi.is_empty() {
        return Err("Alasan pembatalan wajib diisi.".to_owned());
    }
    if rapi.chars().count() > MAKS_ALASAN_BATAL_RAPEL {
        return Err(format!(
            "Alasan pembatalan maksimal {MAKS_ALASAN_BATAL_RAPEL} karakter."
        ));
    }
    Ok(rapi.to_owned())
}

#[derive(Debug, Clone, PartialEq)]
pub struct KomponenPersen {
    pub category: String,
    pub rate: f64,
}

/// Cermin `komponenPersen`: hanya komponen PERSENTASE yang berubah ketika gaji
/// pokok berubah. Snapshot yang tidak terbaca berarti tidak ada komponen.
pub fn komponen_persen(snapshot: &str) -> Vec<KomponenPersen> {
    let Ok(data) = serde_json::from_str::<Value>(snapshot) else {
        return Vec::new();
    };
    let Some(daftar) = data.get("components").and_then(Value::as_array) else {
        return Vec::new();
    };
    daftar
        .iter()
        .filter(|entri| entri.get("calc_type").and_then(Value::as_str) == Some("PERCENTAGE"))
        .filter_map(|entri| {
            let category = entri.get("category").and_then(Value::as_str)?;
            let rate = entri.get("rate").filter(|v| v.is_number())?.as_f64()?;
            rate.is_finite().then(|| KomponenPersen {
                category: category.to_owned(),
                rate,
            })
        })
        .collect()
}

#[derive(Debug, Clone, PartialEq)]
pub struct SlipBeku {
    /// `payroll_items.total_regular_hours` (menit / 60).
    pub regular_hours: f64,
    pub overtime_index: f64,
    pub holiday_overtime_index: f64,
    pub komponen_persen: Vec<KomponenPersen>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RincianRapel {
    pub selisih_pokok: i64,
    pub selisih_lembur: i64,
    pub selisih_komponen: i64,
    pub jumlah: i64,
}

fn bulat(nilai: Decimal) -> i64 {
    nilai
        .round_dp_with_strategy(0, RoundingStrategy::MidpointAwayFromZero)
        .to_i64()
        .unwrap_or(0)
}

/// Upah slip pada satu tarif, dengan rumus pembekuan gaji (`wage_from_minutes`,
/// indeks lembur × tarif sekali, komponen persen dari pokok).
fn upah_pada_tarif(slip: &SlipBeku, rate: i64) -> (i64, i64, i64) {
    let menit = (slip.regular_hours * 60.0).round() as i64;
    let pokok = bulat(Decimal::from(menit * rate) / Decimal::from(60));
    let indeks_ratusan =
        ((slip.overtime_index + slip.holiday_overtime_index) * 100.0).round() as i64;
    let lembur = bulat(Decimal::from(indeks_ratusan * rate) / Decimal::from(100));
    let mut komponen = 0i64;
    for item in &slip.komponen_persen {
        let persen = Decimal::from_f64_retain(item.rate).unwrap_or(Decimal::ZERO);
        let nominal = bulat(Decimal::from(pokok) * (persen / Decimal::from(100)));
        komponen += if item.category == "ALLOWANCE" {
            nominal
        } else {
            -nominal
        };
    }
    (pokok, lembur, komponen)
}

/// Cermin `hitungRapel`. Kedua sisi dihitung dari angka beku yang sama, jadi
/// galat pembulatan slip asal tidak ikut menjadi rapel. Negatif = kelebihan bayar.
pub fn hitung_rapel(slip: &SlipBeku, rate_dari: i64, rate_ke: i64) -> RincianRapel {
    let lama = upah_pada_tarif(slip, rate_dari);
    let baru = upah_pada_tarif(slip, rate_ke);
    let selisih_pokok = baru.0 - lama.0;
    let selisih_lembur = baru.1 - lama.1;
    let selisih_komponen = baru.2 - lama.2;
    RincianRapel {
        selisih_pokok,
        selisih_lembur,
        selisih_komponen,
        jumlah: selisih_pokok + selisih_lembur + selisih_komponen,
    }
}

/// Cermin `labelRapel`: "Rapel Juli 2026".
pub fn label_rapel(period_start: &str) -> String {
    let bulan_teks: String = period_start.chars().take(7).collect();
    if !loan::is_valid_periode(&bulan_teks) {
        return format!("Rapel {period_start}");
    }
    let bulan = (bulan_ke(&bulan_teks) - 1) % 12;
    let tahun: String = period_start.chars().take(4).collect();
    format!("Rapel {} {tahun}", NAMA_BULAN[bulan as usize])
}

/// Cermin `statusRapel`.
pub fn status_rapel(dibatalkan: bool, status_run_pemegang: Option<&str>) -> &'static str {
    match (dibatalkan, status_run_pemegang) {
        (true, _) => "Dibatalkan",
        (false, None) => "Menunggu",
        (false, Some("PAID")) => "Dibayar",
        (false, Some(_)) => "Diproses",
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RapelMenunggu {
    pub id_rapel: String,
    pub jumlah: i64,
    pub period_start: String,
}

/// Cermin `komponenRapel`: entri `breakdown_snapshot.components`.
pub fn komponen_rapel(rapel: &[RapelMenunggu]) -> Vec<Value> {
    rapel
        .iter()
        .map(|item| {
            json!({
                "id": format!("rapel-{}", item.id_rapel),
                "name": label_rapel(&item.period_start),
                "category": "ALLOWANCE",
                "calc_type": CALC_TYPE_RAPEL,
                "rate": 0,
                "nominal": item.jumlah,
            })
        })
        .collect()
}

/// Cermin `rincianRapelJson`: daftar `breakdown_snapshot.rapel`.
pub fn rincian_rapel_json(rapel: &[RapelMenunggu]) -> Vec<Value> {
    rapel
        .iter()
        .map(|item| json!({ "id_rapel": item.id_rapel, "jumlah": item.jumlah }))
        .collect()
}

// SQL (dieja sama persis di services/payroll-rapel.ts)

/// Slip PAID dalam rentang bulan, beserta tarif yang sudah dibayarkan (rapel
/// terakhir yang tidak dibatalkan, atau tarif beku) dan tarif yang SEKARANG
/// berlaku untuk akhir periodenya.
pub const DETEKSI_RENTANG_SQL: &str = "SELECT i.id, i.payroll_run_id, i.id_karyawan, i.nama_karyawan, r.period_start, r.period_end,
       i.total_regular_hours, i.total_overtime_index, i.total_holiday_overtime_index, i.breakdown_snapshot,
       COALESCE((SELECT rp.rate_baru FROM payroll_rapel rp
                 WHERE rp.id_item_asal = i.id AND rp.dibatalkan_pada IS NULL
                 ORDER BY rp.created_at DESC, rp.id_rapel DESC LIMIT 1), i.rate_per_hour) AS rate_terbayar,
       (SELECT sc.rate_per_hour FROM salary_configs sc
         WHERE sc.id_karyawan = i.id_karyawan AND sc.effective_date <= r.period_end
         ORDER BY sc.effective_date DESC LIMIT 1) AS rate_berlaku
FROM payroll_items i
JOIN payroll_runs r ON r.id = i.payroll_run_id
WHERE r.status = 'PAID' AND substr(r.period_start, 1, 7) BETWEEN ?1 AND ?2
ORDER BY i.nama_karyawan, r.period_start, i.id
LIMIT 5000;";

/// Sama dengan `DETEKSI_RENTANG_SQL`, untuk slip yang dipilih (array JSON id).
pub const DETEKSI_ITEM_SQL: &str = "SELECT i.id, i.payroll_run_id, i.id_karyawan, i.nama_karyawan, r.period_start, r.period_end,
       i.total_regular_hours, i.total_overtime_index, i.total_holiday_overtime_index, i.breakdown_snapshot,
       COALESCE((SELECT rp.rate_baru FROM payroll_rapel rp
                 WHERE rp.id_item_asal = i.id AND rp.dibatalkan_pada IS NULL
                 ORDER BY rp.created_at DESC, rp.id_rapel DESC LIMIT 1), i.rate_per_hour) AS rate_terbayar,
       (SELECT sc.rate_per_hour FROM salary_configs sc
         WHERE sc.id_karyawan = i.id_karyawan AND sc.effective_date <= r.period_end
         ORDER BY sc.effective_date DESC LIMIT 1) AS rate_berlaku
FROM payroll_items i
JOIN payroll_runs r ON r.id = i.payroll_run_id
WHERE r.status = 'PAID' AND i.id IN (SELECT value FROM json_each(?1))
ORDER BY i.nama_karyawan, r.period_start, i.id
LIMIT 5000;";

/// Rapel yang belum dipegang proses gaji mana pun (selain yang ditolak).
pub const MENUNGGU_SQL: &str = "SELECT rp.id_karyawan, rp.id_rapel, rp.jumlah, rp.period_start
FROM payroll_rapel rp
WHERE rp.dibatalkan_pada IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM payroll_items i
    JOIN payroll_runs r ON r.id = i.payroll_run_id,
         json_each(CASE WHEN json_valid(i.breakdown_snapshot) THEN i.breakdown_snapshot ELSE '{}' END, '$.rapel') k
    WHERE i.id_karyawan = rp.id_karyawan AND r.status <> 'REJECTED'
      AND json_extract(k.value, '$.id_rapel') = rp.id_rapel)
ORDER BY rp.id_karyawan, rp.period_start, rp.id_rapel
LIMIT 5000;";

pub const DAFTAR_SQL: &str = "SELECT rp.id_rapel, rp.id_karyawan, rp.nama_karyawan, rp.id_item_asal, rp.id_run_asal,
       rp.period_start, rp.period_end, rp.rate_lama, rp.rate_baru, rp.selisih_pokok, rp.selisih_lembur,
       rp.selisih_komponen, rp.jumlah, rp.dibuat_oleh, rp.created_at, rp.dibatalkan_oleh,
       rp.dibatalkan_pada, rp.alasan_batal,
       (SELECT r.id FROM payroll_items i
         JOIN payroll_runs r ON r.id = i.payroll_run_id,
              json_each(CASE WHEN json_valid(i.breakdown_snapshot) THEN i.breakdown_snapshot ELSE '{}' END, '$.rapel') k
         WHERE i.id_karyawan = rp.id_karyawan AND r.status <> 'REJECTED'
           AND json_extract(k.value, '$.id_rapel') = rp.id_rapel
         ORDER BY CASE r.status WHEN 'PAID' THEN 0 ELSE 1 END, r.id LIMIT 1) AS id_run,
       (SELECT r.status FROM payroll_items i
         JOIN payroll_runs r ON r.id = i.payroll_run_id,
              json_each(CASE WHEN json_valid(i.breakdown_snapshot) THEN i.breakdown_snapshot ELSE '{}' END, '$.rapel') k
         WHERE i.id_karyawan = rp.id_karyawan AND r.status <> 'REJECTED'
           AND json_extract(k.value, '$.id_rapel') = rp.id_rapel
         ORDER BY CASE r.status WHEN 'PAID' THEN 0 ELSE 1 END, r.id LIMIT 1) AS status_run
FROM payroll_rapel rp
ORDER BY rp.created_at DESC, rp.id_rapel
LIMIT 1000;";

/// Pemeriksaan sebelum membatalkan: sudah batal? sudah dipegang proses gaji?
pub const STATUS_SATU_SQL: &str = "SELECT rp.dibatalkan_pada,
       (SELECT r.id FROM payroll_items i
         JOIN payroll_runs r ON r.id = i.payroll_run_id,
              json_each(CASE WHEN json_valid(i.breakdown_snapshot) THEN i.breakdown_snapshot ELSE '{}' END, '$.rapel') k
         WHERE i.id_karyawan = rp.id_karyawan AND r.status <> 'REJECTED'
           AND json_extract(k.value, '$.id_rapel') = rp.id_rapel
         LIMIT 1) AS id_run
FROM payroll_rapel rp
WHERE rp.id_rapel = ?1;";

pub const INSERT_RAPEL_SQL: &str = "INSERT OR IGNORE INTO payroll_rapel (
        id_rapel, id_karyawan, nama_karyawan, id_item_asal, id_run_asal, period_start, period_end,
        rate_lama, rate_baru, selisih_pokok, selisih_lembur, selisih_komponen, jumlah, dibuat_oleh, created_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, datetime('now'));";

pub const BATAL_RAPEL_SQL: &str = "UPDATE payroll_rapel
    SET dibatalkan_oleh = ?2, dibatalkan_pada = datetime('now'), alasan_batal = ?3
    WHERE id_rapel = ?1 AND dibatalkan_pada IS NULL;";

const SATU_RAPEL_SQL: &str =
    "SELECT id_rapel, id_karyawan, nama_karyawan, id_item_asal, id_run_asal, period_start,
       period_end, rate_lama, rate_baru, selisih_pokok, selisih_lembur, selisih_komponen, jumlah,
       dibuat_oleh, dibatalkan_oleh, dibatalkan_pada, alasan_batal, created_at
FROM payroll_rapel WHERE id_rapel = ?1;";

// Penulisan dan pembacaan lokal

fn invalid(message: impl Into<String>) -> CommandError {
    CommandError::new("VALIDATION_ERROR", message)
}

fn db_error(_: rusqlite::Error) -> CommandError {
    CommandError::internal()
}

struct BarisSlip {
    id_item: String,
    id_run: String,
    id_karyawan: String,
    nama: String,
    period_start: String,
    period_end: String,
    slip: SlipBeku,
    rate_terbayar: i64,
    rate_berlaku: Option<i64>,
}

fn baca_slip(
    connection: &Connection,
    sql: &str,
    args: &[&dyn rusqlite::ToSql],
) -> Result<Vec<BarisSlip>, CommandError> {
    let mut statement = connection.prepare(sql).map_err(db_error)?;
    let rows = statement
        .query_map(args, |row| {
            let snapshot: Option<String> = row.get(9)?;
            Ok(BarisSlip {
                id_item: row.get(0)?,
                id_run: row.get(1)?,
                id_karyawan: row.get(2)?,
                nama: row.get(3)?,
                period_start: row.get(4)?,
                period_end: row.get(5)?,
                slip: SlipBeku {
                    regular_hours: row.get(6)?,
                    overtime_index: row.get(7)?,
                    holiday_overtime_index: row.get(8)?,
                    komponen_persen: komponen_persen(snapshot.as_deref().unwrap_or("{}")),
                },
                rate_terbayar: row.get(10)?,
                rate_berlaku: row.get(11)?,
            })
        })
        .map_err(db_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(db_error)?;
    Ok(rows)
}

/// Selisih slip terhadap tarif yang sekarang berlaku, atau `None` bila tidak
/// ada yang perlu dirapel.
fn calon(baris: &BarisSlip) -> Option<(i64, RincianRapel)> {
    let rate_baru = baris.rate_berlaku?;
    if rate_baru == baris.rate_terbayar {
        return None;
    }
    let rincian = hitung_rapel(&baris.slip, baris.rate_terbayar, rate_baru);
    (rincian.jumlah != 0).then_some((rate_baru, rincian))
}

pub fn detect(state: &MobileState, dari: &str, sampai: &str) -> Result<Value, CommandError> {
    validate_rentang(dari, sampai).map_err(invalid)?;
    let connection = storage::database(&state.data_dir)?;
    let items: Vec<Value> = baca_slip(&connection, DETEKSI_RENTANG_SQL, &[&dari, &sampai])?
        .iter()
        .filter_map(|baris| {
            let (rate_baru, rincian) = calon(baris)?;
            Some(json!({
                "id_item": baris.id_item,
                "id_run": baris.id_run,
                "id_karyawan": baris.id_karyawan,
                "nama_karyawan": baris.nama,
                "period_start": baris.period_start,
                "period_end": baris.period_end,
                "label": label_rapel(&baris.period_start),
                "rate_lama": baris.rate_terbayar,
                "rate_baru": rate_baru,
                "selisih_pokok": rincian.selisih_pokok,
                "selisih_lembur": rincian.selisih_lembur,
                "selisih_komponen": rincian.selisih_komponen,
                "jumlah": rincian.jumlah,
                "kelebihan_bayar": rincian.jumlah < 0,
            }))
        })
        .collect();
    Ok(json!({ "items": items }))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PilihanRapel {
    pub id_item: String,
    pub rate_baru: i64,
}

fn rapel_json(connection: &Connection, id: &str) -> Result<Option<Value>, CommandError> {
    connection
        .query_row(SATU_RAPEL_SQL, params![id], |row| {
            Ok(json!({
                "id_rapel": row.get::<_, String>(0)?,
                "id_karyawan": row.get::<_, String>(1)?,
                "nama_karyawan": row.get::<_, String>(2)?,
                "id_item_asal": row.get::<_, String>(3)?,
                "id_run_asal": row.get::<_, String>(4)?,
                "period_start": row.get::<_, String>(5)?,
                "period_end": row.get::<_, String>(6)?,
                "rate_lama": row.get::<_, i64>(7)?,
                "rate_baru": row.get::<_, i64>(8)?,
                "selisih_pokok": row.get::<_, i64>(9)?,
                "selisih_lembur": row.get::<_, i64>(10)?,
                "selisih_komponen": row.get::<_, i64>(11)?,
                "jumlah": row.get::<_, i64>(12)?,
                "dibuat_oleh": row.get::<_, String>(13)?,
                "dibatalkan_oleh": row.get::<_, Option<String>>(14)?,
                "dibatalkan_pada": row.get::<_, Option<String>>(15)?,
                "alasan_batal": row.get::<_, Option<String>>(16)?,
                "created_at": row.get::<_, String>(17)?,
            }))
        })
        .optional()
        .map_err(db_error)
}

/// Menyimpan rapel yang dicentang. Jumlahnya selalu dihitung ulang di sini;
/// tarif yang dikirim layar hanya dipakai memastikan admin menyetujui angka
/// yang sama dengan yang ditulis.
pub fn save(
    state: &MobileState,
    operator: &str,
    pilihan: Vec<PilihanRapel>,
) -> Result<Value, CommandError> {
    if pilihan.is_empty() {
        return Err(invalid("Pilih minimal satu rapel."));
    }
    if pilihan.len() > MAKS_SIMPAN_RAPEL {
        return Err(invalid(format!(
            "Paling banyak {MAKS_SIMPAN_RAPEL} rapel sekali simpan."
        )));
    }
    let client_id = sync::ensure_client_id(state)?;
    let mut connection = storage::database(&state.data_dir)?;
    let transaction = connection.transaction().map_err(db_error)?;
    let ids: Vec<&str> = pilihan
        .iter()
        .map(|item| item.id_item.as_str())
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();
    let ids_json = serde_json::to_string(&ids).map_err(|_| CommandError::internal())?;
    let slip: HashMap<String, BarisSlip> = baca_slip(&transaction, DETEKSI_ITEM_SQL, &[&ids_json])?
        .into_iter()
        .map(|baris| (baris.id_item.clone(), baris))
        .collect();

    let mut disimpan = 0;
    for item in &pilihan {
        let baris = slip.get(&item.id_item).ok_or_else(|| {
            invalid("Slip asal tidak ditemukan atau proses gajinya belum dibayar.")
        })?;
        let label = label_rapel(&baris.period_start);
        let (rate_baru, rincian) = calon(baris)
            .filter(|(rate, _)| *rate == item.rate_baru)
            .ok_or_else(|| {
                invalid(format!(
                    "Tarif {} untuk {label} berubah sejak dihitung. Muat ulang daftar.",
                    baris.nama
                ))
            })?;
        if rincian.jumlah < 0 {
            return Err(invalid(format!(
                "{} {label}: tarif turun, ini kelebihan bayar dan tidak bisa disimpan sebagai rapel.",
                baris.nama
            )));
        }
        let id = id_rapel(&baris.id_item, rate_baru);
        let ditulis = transaction
            .execute(
                INSERT_RAPEL_SQL,
                params![
                    id,
                    baris.id_karyawan,
                    baris.nama,
                    baris.id_item,
                    baris.id_run,
                    baris.period_start,
                    baris.period_end,
                    baris.rate_terbayar,
                    rate_baru,
                    rincian.selisih_pokok,
                    rincian.selisih_lembur,
                    rincian.selisih_komponen,
                    rincian.jumlah,
                    operator,
                ],
            )
            .map_err(db_error)?;
        if ditulis > 0 {
            let payload = rapel_json(&transaction, &id)?.ok_or_else(CommandError::internal)?;
            sync::enqueue(
                &transaction,
                &client_id,
                "payroll-rapel",
                "save",
                &id,
                &payload,
                None,
            )?;
            disimpan += 1;
        }
    }
    transaction.commit().map_err(db_error)?;
    Ok(json!({ "sukses": true, "disimpan": disimpan }))
}

pub fn cancel(
    state: &MobileState,
    operator: &str,
    id: &str,
    alasan: &str,
) -> Result<Value, CommandError> {
    let alasan = validate_alasan_batal(alasan).map_err(invalid)?;
    let client_id = sync::ensure_client_id(state)?;
    let mut connection = storage::database(&state.data_dir)?;
    let transaction = connection.transaction().map_err(db_error)?;
    let status: Option<(Option<String>, Option<String>)> = transaction
        .query_row(STATUS_SATU_SQL, params![id], |row| {
            Ok((row.get(0)?, row.get(1)?))
        })
        .optional()
        .map_err(db_error)?;
    match status {
        None => return Err(CommandError::new("NOT_FOUND", "Rapel tidak ditemukan.")),
        Some((Some(_), _)) => return Err(invalid("Rapel ini sudah dibatalkan.")),
        Some((None, Some(_))) => {
            return Err(invalid(
                "Rapel sudah masuk proses gaji dan tidak bisa dibatalkan. Tolak proses gajinya lebih dulu bila perlu.",
            ))
        }
        Some((None, None)) => {}
    }
    transaction
        .execute(BATAL_RAPEL_SQL, params![id, operator, alasan])
        .map_err(db_error)?;
    let baris = rapel_json(&transaction, id)?.ok_or_else(CommandError::internal)?;
    let payload = json!({
        "id_rapel": id,
        "dibatalkan_oleh": baris.get("dibatalkan_oleh"),
        "dibatalkan_pada": baris.get("dibatalkan_pada"),
        "alasan_batal": baris.get("alasan_batal"),
    });
    sync::enqueue(
        &transaction,
        &client_id,
        "payroll-rapel",
        "cancel",
        id,
        &payload,
        None,
    )?;
    transaction.commit().map_err(db_error)?;
    Ok(json!({ "sukses": true }))
}

pub fn list(state: &MobileState) -> Result<Value, CommandError> {
    let connection = storage::database(&state.data_dir)?;
    let mut statement = connection.prepare(DAFTAR_SQL).map_err(db_error)?;
    let items = statement
        .query_map([], |row| {
            let dibatalkan_pada: Option<String> = row.get(16)?;
            let status_run: Option<String> = row.get(19)?;
            let period_start: String = row.get(5)?;
            Ok(json!({
                "id_rapel": row.get::<_, String>(0)?,
                "id_karyawan": row.get::<_, String>(1)?,
                "nama_karyawan": row.get::<_, String>(2)?,
                "id_item_asal": row.get::<_, String>(3)?,
                "id_run_asal": row.get::<_, String>(4)?,
                "label": label_rapel(&period_start),
                "period_start": period_start,
                "period_end": row.get::<_, String>(6)?,
                "rate_lama": row.get::<_, i64>(7)?,
                "rate_baru": row.get::<_, i64>(8)?,
                "selisih_pokok": row.get::<_, i64>(9)?,
                "selisih_lembur": row.get::<_, i64>(10)?,
                "selisih_komponen": row.get::<_, i64>(11)?,
                "jumlah": row.get::<_, i64>(12)?,
                "dibuat_oleh": row.get::<_, String>(13)?,
                "created_at": row.get::<_, String>(14)?,
                "dibatalkan_oleh": row.get::<_, Option<String>>(15)?,
                "status": status_rapel(dibatalkan_pada.is_some(), status_run.as_deref()),
                "dibatalkan_pada": dibatalkan_pada,
                "alasan_batal": row.get::<_, Option<String>>(17)?,
                "id_run": row.get::<_, Option<String>>(18)?,
            }))
        })
        .map_err(db_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(db_error)?;
    Ok(json!({ "items": items }))
}

// Integrasi payroll

/// Rapel yang ikut dibayar di proses gaji berikutnya, per karyawan. Cermin
/// `rapelMenunggu` di `services/payroll-rapel.ts`.
pub fn rapel_menunggu(
    connection: &Connection,
) -> Result<HashMap<String, Vec<RapelMenunggu>>, CommandError> {
    let mut statement = connection.prepare(MENUNGGU_SQL).map_err(db_error)?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                RapelMenunggu {
                    id_rapel: row.get(1)?,
                    jumlah: row.get(2)?,
                    period_start: row.get(3)?,
                },
            ))
        })
        .map_err(db_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(db_error)?;
    let mut hasil: HashMap<String, Vec<RapelMenunggu>> = HashMap::new();
    for (id_karyawan, rapel) in rows.into_iter().filter(|(_, r)| r.jumlah > 0) {
        hasil.entry(id_karyawan).or_default().push(rapel);
    }
    Ok(hasil)
}

// Penerapan event di cloud

fn payload_text(row: &Value, key: &str) -> Option<String> {
    row.get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(str::to_owned)
}

pub const CLOUD_INSERT_RAPEL_SQL: &str = "INSERT INTO payroll_rapel (
        id_rapel, id_karyawan, nama_karyawan, id_item_asal, id_run_asal, period_start, period_end,
        rate_lama, rate_baru, selisih_pokok, selisih_lembur, selisih_komponen, jumlah, dibuat_oleh,
        dibatalkan_oleh, dibatalkan_pada, alasan_batal, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))
    ON CONFLICT(id_rapel) DO NOTHING;";

/// Nilai `payroll_rapel` dari payload `payroll-rapel/save`. Bentuk cacat
/// dilewati, tidak pernah ditolak: menolak mengunci outbox.
pub fn cloud_rapel_values(row: &Value, entity_key: &str) -> Option<Vec<Value>> {
    let id = payload_text(row, "id_rapel").unwrap_or_else(|| entity_key.trim().to_owned());
    let angka = |key: &str| row.get(key).and_then(Value::as_i64);
    let jumlah = angka("jumlah").filter(|v| *v > 0)?;
    let rate_lama = angka("rate_lama").filter(|v| *v >= 0)?;
    let rate_baru = angka("rate_baru").filter(|v| *v >= 0)?;
    if id.is_empty() {
        return None;
    }
    Some(vec![
        json!(id),
        json!(payload_text(row, "id_karyawan")?),
        json!(payload_text(row, "nama_karyawan")?),
        json!(payload_text(row, "id_item_asal")?),
        json!(payload_text(row, "id_run_asal")?),
        json!(payload_text(row, "period_start")?),
        json!(payload_text(row, "period_end")?),
        json!(rate_lama),
        json!(rate_baru),
        json!(angka("selisih_pokok")?),
        json!(angka("selisih_lembur")?),
        json!(angka("selisih_komponen")?),
        json!(jumlah),
        json!(payload_text(row, "dibuat_oleh")?),
        json!(payload_text(row, "dibatalkan_oleh")),
        json!(payload_text(row, "dibatalkan_pada")),
        json!(payload_text(row, "alasan_batal")),
        json!(payload_text(row, "created_at")),
    ])
}

pub const CLOUD_CANCEL_RAPEL_SQL: &str = "UPDATE payroll_rapel
    SET dibatalkan_oleh = ?, dibatalkan_pada = COALESCE(?, datetime('now')), alasan_batal = ?
    WHERE id_rapel = ? AND dibatalkan_pada IS NULL;";

pub fn cloud_cancel_values(row: &Value, entity_key: &str) -> Option<Vec<Value>> {
    let id = payload_text(row, "id_rapel").unwrap_or_else(|| entity_key.trim().to_owned());
    if id.is_empty() {
        return None;
    }
    Some(vec![
        json!(payload_text(row, "dibatalkan_oleh")?),
        json!(payload_text(row, "dibatalkan_pada")),
        json!(payload_text(row, "alasan_batal")?),
        json!(id),
    ])
}

#[cfg(test)]
mod tests {
    use super::*;

    // Vektor kembar `src/lib/validations/payroll-rapel.test.ts`.

    fn slip_a() -> SlipBeku {
        SlipBeku {
            regular_hours: 160.0,
            overtime_index: 3.5,
            holiday_overtime_index: 0.0,
            komponen_persen: vec![
                KomponenPersen {
                    category: "ALLOWANCE".into(),
                    rate: 10.0,
                },
                KomponenPersen {
                    category: "DEDUCTION".into(),
                    rate: 2.0,
                },
            ],
        }
    }

    #[test]
    fn hitung_rapel_kenaikan_tarif() {
        assert_eq!(
            hitung_rapel(&slip_a(), 20_000, 22_000),
            RincianRapel {
                selisih_pokok: 320_000,
                selisih_lembur: 7_000,
                selisih_komponen: 25_600,
                jumlah: 352_600,
            }
        );
    }

    #[test]
    fn hitung_rapel_pembulatan_dari_angka_beku() {
        let slip = SlipBeku {
            regular_hours: 11.0 / 60.0,
            overtime_index: 0.0,
            holiday_overtime_index: 1.25,
            komponen_persen: vec![KomponenPersen {
                category: "ALLOWANCE".into(),
                rate: 12.5,
            }],
        };
        assert_eq!(
            hitung_rapel(&slip, 18_750, 18_751),
            RincianRapel {
                selisih_pokok: 0,
                selisih_lembur: 1,
                selisih_komponen: 0,
                jumlah: 1,
            }
        );
    }

    #[test]
    fn hitung_rapel_turun_dan_sama() {
        assert_eq!(hitung_rapel(&slip_a(), 22_000, 20_000).jumlah, -352_600);
        assert_eq!(hitung_rapel(&slip_a(), 20_000, 20_000).jumlah, 0);
    }

    #[test]
    fn komponen_persen_hanya_percentage() {
        let snapshot = json!({
            "components": [
                { "category": "ALLOWANCE", "calc_type": "PERCENTAGE", "rate": 10 },
                { "category": "ALLOWANCE", "calc_type": "FIXED", "rate": 50_000 },
                { "category": "DEDUCTION", "calc_type": "PERCENTAGE", "rate": 2 },
                { "category": "DEDUCTION", "calc_type": "KASBON", "rate": 0 },
                { "category": "ALLOWANCE", "calc_type": "PERCENTAGE", "rate": "5" },
            ]
        })
        .to_string();
        assert_eq!(
            komponen_persen(&snapshot),
            vec![
                KomponenPersen {
                    category: "ALLOWANCE".into(),
                    rate: 10.0
                },
                KomponenPersen {
                    category: "DEDUCTION".into(),
                    rate: 2.0
                },
            ]
        );
        assert!(komponen_persen("bukan json").is_empty());
        assert!(komponen_persen("{}").is_empty());
    }

    #[test]
    fn rentang_alasan_label_status_id() {
        assert_eq!(validate_rentang("2026-01", "2026-12"), Ok(()));
        assert_eq!(
            validate_rentang("2026-01", "2027-01").unwrap_err(),
            "Rentang pencarian paling lama 12 bulan."
        );
        assert_eq!(
            validate_rentang("2026-05", "2026-04").unwrap_err(),
            "Bulan awal tidak boleh sesudah bulan akhir."
        );
        assert_eq!(
            validate_rentang("2026-1", "2026-02").unwrap_err(),
            "Bulan awal dan akhir wajib berformat YYYY-MM."
        );

        assert_eq!(
            validate_alasan_batal("  salah hitung "),
            Ok("salah hitung".to_owned())
        );
        assert_eq!(
            validate_alasan_batal("   ").unwrap_err(),
            "Alasan pembatalan wajib diisi."
        );
        assert_eq!(
            validate_alasan_batal(&"a".repeat(201)).unwrap_err(),
            "Alasan pembatalan maksimal 200 karakter."
        );

        assert_eq!(label_rapel("2026-07-01"), "Rapel Juli 2026");
        assert_eq!(label_rapel("2026-12-16"), "Rapel Desember 2026");
        assert_eq!(label_rapel("x"), "Rapel x");

        assert_eq!(status_rapel(true, Some("PAID")), "Dibatalkan");
        assert_eq!(status_rapel(false, None), "Menunggu");
        assert_eq!(status_rapel(false, Some("DRAFT")), "Diproses");
        assert_eq!(status_rapel(false, Some("PAID")), "Dibayar");

        assert_eq!(id_rapel("PR-1-K01", 22_000), "rpl-PR-1-K01-22000");
        assert_eq!(
            komponen_rapel(&[RapelMenunggu {
                id_rapel: "rpl-x-1".into(),
                jumlah: 5_000,
                period_start: "2026-08-01".into(),
            }]),
            vec![json!({
                "id": "rapel-rpl-x-1",
                "name": "Rapel Agustus 2026",
                "category": "ALLOWANCE",
                "calc_type": "RAPEL",
                "rate": 0,
                "nominal": 5_000,
            })]
        );
    }

    // I/O terhadap skema asli `storage::initialize`

    fn state_uji() -> (tempfile::TempDir, MobileState) {
        let dir = tempfile::tempdir().expect("tempdir");
        storage::initialize(dir.path()).expect("skema lokal");
        let state = MobileState {
            server_origin: std::sync::RwLock::new("http://localhost:3000".to_string()),
            offline_max_age_hours: 24,
            data_dir: dir.path().to_path_buf(),
            http: reqwest::Client::new(),
            turso_config: std::sync::RwLock::new(None),
            session: std::sync::Mutex::new(None),
            vault_lock: std::sync::Mutex::new(()),
        };
        (dir, state)
    }

    fn tulis_run(connection: &Connection, id: &str, status: &str, snapshot: &str) {
        connection
            .execute(
                "INSERT INTO payroll_runs (id, idempotency_key, period_start, period_end, status,
                    created_by, created_at, updated_at)
                 VALUES (?1, ?1, '2026-07-01', '2026-07-31', ?2, 'admin', 'x', 'x');",
                params![id, status],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO payroll_items (id, payroll_run_id, id_karyawan, nama_karyawan, divisi,
                    total_regular_hours, total_overtime_hours, total_overtime_index,
                    rate_per_hour, basic_salary, overtime_salary, gross_salary, net_salary,
                    breakdown_snapshot, created_at)
                 VALUES (?1 || '-K01', ?1, 'K01', 'Budi', 'Guru', 160, 2, 3.5,
                    20000, 3200000, 70000, 3270000, 3270000, ?2, 'x');",
                params![id, snapshot],
            )
            .unwrap();
    }

    fn status_di_daftar(state: &MobileState) -> String {
        list(state).unwrap()["items"][0]["status"]
            .as_str()
            .unwrap()
            .to_owned()
    }

    #[test]
    fn deteksi_simpan_pegang_dan_batal() {
        let (_dir, state) = state_uji();
        let connection = storage::database(&state.data_dir).unwrap();
        let snapshot = json!({
            "components": [{ "category": "ALLOWANCE", "calc_type": "PERCENTAGE", "rate": 10 }]
        })
        .to_string();
        tulis_run(&connection, "PR1", "PAID", &snapshot);
        connection
            .execute_batch(
                "INSERT INTO salary_configs (id, id_karyawan, rate_per_hour, effective_date, created_by, created_at)
                 VALUES ('sc1', 'K01', 20000, '2026-01-01', 'admin', 'x'),
                        ('sc2', 'K01', 22000, '2026-07-01', 'admin', 'x');",
            )
            .unwrap();

        let hasil = detect(&state, "2026-07", "2026-07").unwrap();
        let item = &hasil["items"][0];
        assert_eq!(item["jumlah"], 359_000);
        assert_eq!(item["rate_lama"], 20_000);
        assert_eq!(item["label"], "Rapel Juli 2026");

        let pilih = || {
            vec![PilihanRapel {
                id_item: "PR1-K01".into(),
                rate_baru: 22_000,
            }]
        };
        // Tarif yang dilihat admin berbeda dari yang berlaku: ditolak.
        let galat = save(
            &state,
            "admin",
            vec![PilihanRapel {
                id_item: "PR1-K01".into(),
                rate_baru: 21_000,
            }],
        )
        .unwrap_err();
        assert!(galat.message.contains("berubah sejak dihitung"));

        assert_eq!(save(&state, "admin", pilih()).unwrap()["disimpan"], 1);
        // Slip yang sudah dirapel tidak terdeteksi lagi, dan simpan ulang gagal.
        assert_eq!(
            detect(&state, "2026-07", "2026-07").unwrap()["items"],
            json!([])
        );
        assert!(save(&state, "admin", pilih()).is_err());

        let id = id_rapel("PR1-K01", 22_000);
        let menunggu = rapel_menunggu(&connection).unwrap();
        assert_eq!(menunggu["K01"][0].jumlah, 359_000);
        assert_eq!(status_di_daftar(&state), "Menunggu");

        // Draf proses gaji yang memuatnya memegang rapel itu.
        let pegang = json!({ "rapel": [{ "id_rapel": id, "jumlah": 359_000 }] }).to_string();
        tulis_run(&connection, "PR2", "DRAFT", &pegang);
        assert!(rapel_menunggu(&connection).unwrap().is_empty());
        assert_eq!(status_di_daftar(&state), "Diproses");
        assert!(cancel(&state, "admin", &id, "salah")
            .unwrap_err()
            .message
            .contains("sudah masuk proses gaji"));

        // Ditolak: rapel kembali menunggu dan bisa dibatalkan.
        connection
            .execute(
                "UPDATE payroll_runs SET status = 'REJECTED' WHERE id = 'PR2';",
                [],
            )
            .unwrap();
        assert_eq!(status_di_daftar(&state), "Menunggu");
        cancel(&state, "admin", &id, "salah hitung").unwrap();
        assert_eq!(status_di_daftar(&state), "Dibatalkan");
        assert!(rapel_menunggu(&connection).unwrap().is_empty());
        // Rapel yang dibatalkan tidak lagi menutup slip: terdeteksi kembali.
        assert_eq!(
            detect(&state, "2026-07", "2026-07").unwrap()["items"][0]["jumlah"],
            359_000
        );

        let event: Vec<String> = connection
            .prepare(
                "SELECT operation FROM desktop_sync_outbox WHERE domain = 'payroll-rapel'
                 ORDER BY rowid;",
            )
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(event, vec!["save", "cancel"]);
    }

    /// SQL cloud dipakai apa adanya; `prepare` terhadap skema lokal menangkap
    /// kolom yang salah eja.
    #[test]
    fn sql_rapel_siap_di_skema_lokal() {
        let (_dir, state) = state_uji();
        let connection = storage::database(&state.data_dir).unwrap();
        for sql in [
            DETEKSI_RENTANG_SQL,
            DETEKSI_ITEM_SQL,
            MENUNGGU_SQL,
            DAFTAR_SQL,
            STATUS_SATU_SQL,
            INSERT_RAPEL_SQL,
            BATAL_RAPEL_SQL,
            SATU_RAPEL_SQL,
            CLOUD_INSERT_RAPEL_SQL,
            CLOUD_CANCEL_RAPEL_SQL,
        ] {
            connection
                .prepare(sql)
                .unwrap_or_else(|e| panic!("{e}\n{sql}"));
        }
    }
}
