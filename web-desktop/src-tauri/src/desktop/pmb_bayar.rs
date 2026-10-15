//! Pembayaran biaya pendaftaran PMB (schema v52).
//!
//! Kembaran `src/lib/validations/pmb-pembayaran.ts`. Konstanta SQL dieja sama
//! persis (diuji `pmb-pembayaran.test.ts` dengan membaca berkas ini), fungsi
//! penolakan diuji dengan vektor yang sama di kedua bahasa. Keadaan bayar
//! tidak disimpan; ia diturunkan SQLite dengan jam WIB. Alias `p` =
//! `pmb_pendaftar`.

pub const SQL_MEMAKAN_KUOTA_PMB: &str = "(p.status NOT IN ('Ditolak', 'Dibatalkan') AND NOT (p.biaya_tagihan > 0 AND p.dibayar_dicatat_at IS NULL AND p.batas_bayar IS NOT NULL AND p.batas_bayar < date('now', '+7 hours')))";

pub const SQL_KEADAAN_BAYAR_PMB: &str = "(CASE WHEN p.biaya_tagihan <= 0 THEN 'Tanpa biaya' WHEN p.dibayar_dicatat_at IS NOT NULL THEN 'Lunas' WHEN p.batas_bayar IS NOT NULL AND p.batas_bayar < date('now', '+7 hours') THEN 'Kedaluwarsa' ELSE 'Menunggu Pembayaran' END)";

/// Metode yang dipilih panitia; `gateway` hanya untuk webhook payment gateway nanti.
pub const METODE_BAYAR_PMB: &[&str] = &["tunai", "transfer", "qris"];

const STATUS_TUTUP: &[&str] = &["Ditolak", "Dibatalkan", "Terdaftar"];

fn belum_lunas(keadaan: &str) -> bool {
    keadaan == "Menunggu Pembayaran" || keadaan == "Kedaluwarsa"
}

/// `150000` → `"150.000"`, sama dengan `rupiahPmb`.
pub fn rupiah(nilai: i64) -> String {
    let digit = nilai.abs().to_string();
    let mut hasil = String::new();
    for (i, c) in digit.chars().enumerate() {
        if i > 0 && (digit.len() - i) % 3 == 0 {
            hasil.push('.');
        }
        hasil.push(c);
    }
    if nilai < 0 {
        format!("-{hasil}")
    } else {
        hasil
    }
}

pub fn tolak_ubah_status(keadaan: &str, status_baru: &str) -> Option<String> {
    if belum_lunas(keadaan) && !["Baru", "Ditolak", "Dibatalkan"].contains(&status_baru) {
        return Some(
            "Pendaftar belum melunasi biaya pendaftaran. Catat pembayarannya lebih dulu.".into(),
        );
    }
    None
}

pub struct KeadaanPendaftar<'a> {
    pub status: &'a str,
    pub keadaan: &'a str,
    pub biaya_tagihan: i64,
    /// `date('now','+7 hours')` dari database, bukan jam perangkat.
    pub hari_ini: &'a str,
}

pub fn tolak_konfirmasi_bayar(p: &KeadaanPendaftar, jumlah: i64, tanggal: &str) -> Option<String> {
    if STATUS_TUTUP.contains(&p.status) {
        return Some(format!(
            "Pendaftar berstatus '{}' tidak dapat dicatat pembayarannya.",
            p.status
        ));
    }
    if p.keadaan == "Tanpa biaya" {
        return Some("Pendaftar ini tidak dikenai biaya pendaftaran.".into());
    }
    if p.keadaan == "Lunas" {
        return Some("Pembayaran pendaftar ini sudah tercatat.".into());
    }
    if p.keadaan == "Kedaluwarsa" {
        return Some("Batas bayar sudah lewat. Perpanjang batas bayarnya lebih dulu.".into());
    }
    if jumlah != p.biaya_tagihan {
        return Some(format!(
            "Jumlah bayar harus sama dengan biaya pendaftaran, Rp{}.",
            rupiah(p.biaya_tagihan)
        ));
    }
    if tanggal > p.hari_ini {
        return Some("Tanggal bayar tidak boleh melewati hari ini.".into());
    }
    None
}

pub fn tolak_batal_bayar(p: &KeadaanPendaftar) -> Option<String> {
    if p.keadaan != "Lunas" {
        return Some("Pendaftar ini belum punya pembayaran yang tercatat.".into());
    }
    if p.status != "Baru" {
        return Some(
            "Pembayaran hanya bisa dibatalkan selama status pendaftar masih 'Baru'.".into(),
        );
    }
    None
}

pub fn tolak_perpanjang_bayar(
    p: &KeadaanPendaftar,
    kuota_penuh: bool,
    batas_baru: &str,
) -> Option<String> {
    if STATUS_TUTUP.contains(&p.status) {
        return Some(format!(
            "Pendaftar berstatus '{}' tidak dapat diubah batas bayarnya.",
            p.status
        ));
    }
    if p.keadaan == "Lunas" {
        return Some("Pembayaran sudah tercatat; batas bayar tidak perlu diubah.".into());
    }
    if !belum_lunas(p.keadaan) {
        return Some("Pendaftar ini tidak dikenai biaya pendaftaran.".into());
    }
    if batas_baru < p.hari_ini {
        return Some("Batas bayar baru tidak boleh sebelum hari ini.".into());
    }
    if p.keadaan == "Kedaluwarsa" && kuota_penuh {
        return Some(
            "Kuota gelombang penuh. Naikkan kuota atau tolak pendaftar lain lebih dulu.".into(),
        );
    }
    None
}

#[cfg(test)]
mod tests {
    // Vektor kembar `src/lib/validations/pmb-pembayaran.test.ts`.
    use super::*;

    fn p<'a>(status: &'a str, keadaan: &'a str) -> KeadaanPendaftar<'a> {
        KeadaanPendaftar {
            status,
            keadaan,
            biaya_tagihan: 150000,
            hari_ini: "2026-10-15",
        }
    }

    #[test]
    fn rupiah_titik_ribuan() {
        assert_eq!(rupiah(0), "0");
        assert_eq!(rupiah(999), "999");
        assert_eq!(rupiah(150000), "150.000");
        assert_eq!(rupiah(1250000), "1.250.000");
    }

    #[test]
    fn ubah_status_saat_belum_lunas() {
        assert!(tolak_ubah_status("Menunggu Pembayaran", "Diterima").is_some());
        assert!(tolak_ubah_status("Kedaluwarsa", "Berkas Lengkap").is_some());
        assert!(tolak_ubah_status("Menunggu Pembayaran", "Ditolak").is_none());
        assert!(tolak_ubah_status("Kedaluwarsa", "Dibatalkan").is_none());
        assert!(tolak_ubah_status("Menunggu Pembayaran", "Baru").is_none());
        assert!(tolak_ubah_status("Lunas", "Diterima").is_none());
        assert!(tolak_ubah_status("Tanpa biaya", "Terverifikasi").is_none());
    }

    #[test]
    fn konfirmasi_bayar() {
        let menunggu = p("Baru", "Menunggu Pembayaran");
        assert_eq!(
            tolak_konfirmasi_bayar(&menunggu, 150000, "2026-10-15"),
            None
        );
        assert_eq!(
            tolak_konfirmasi_bayar(&menunggu, 100000, "2026-10-15").as_deref(),
            Some("Jumlah bayar harus sama dengan biaya pendaftaran, Rp150.000.")
        );
        assert_eq!(
            tolak_konfirmasi_bayar(&menunggu, 150000, "2026-10-16").as_deref(),
            Some("Tanggal bayar tidak boleh melewati hari ini.")
        );
        assert_eq!(
            tolak_konfirmasi_bayar(&p("Baru", "Kedaluwarsa"), 150000, "2026-10-15").as_deref(),
            Some("Batas bayar sudah lewat. Perpanjang batas bayarnya lebih dulu.")
        );
        assert_eq!(
            tolak_konfirmasi_bayar(&p("Baru", "Lunas"), 150000, "2026-10-15").as_deref(),
            Some("Pembayaran pendaftar ini sudah tercatat.")
        );
        assert_eq!(
            tolak_konfirmasi_bayar(&p("Ditolak", "Menunggu Pembayaran"), 150000, "2026-10-15")
                .as_deref(),
            Some("Pendaftar berstatus 'Ditolak' tidak dapat dicatat pembayarannya.")
        );
        assert_eq!(
            tolak_konfirmasi_bayar(&p("Baru", "Tanpa biaya"), 150000, "2026-10-15").as_deref(),
            Some("Pendaftar ini tidak dikenai biaya pendaftaran.")
        );
    }

    #[test]
    fn batal_bayar() {
        assert_eq!(tolak_batal_bayar(&p("Baru", "Lunas")), None);
        assert_eq!(
            tolak_batal_bayar(&p("Diterima", "Lunas")).as_deref(),
            Some("Pembayaran hanya bisa dibatalkan selama status pendaftar masih 'Baru'.")
        );
        assert_eq!(
            tolak_batal_bayar(&p("Baru", "Menunggu Pembayaran")).as_deref(),
            Some("Pendaftar ini belum punya pembayaran yang tercatat.")
        );
    }

    #[test]
    fn perpanjang_bayar() {
        assert_eq!(
            tolak_perpanjang_bayar(&p("Baru", "Kedaluwarsa"), false, "2026-10-20"),
            None
        );
        assert_eq!(
            tolak_perpanjang_bayar(&p("Baru", "Menunggu Pembayaran"), true, "2026-10-15"),
            None
        );
        assert_eq!(
            tolak_perpanjang_bayar(&p("Baru", "Kedaluwarsa"), true, "2026-10-20").as_deref(),
            Some("Kuota gelombang penuh. Naikkan kuota atau tolak pendaftar lain lebih dulu.")
        );
        assert_eq!(
            tolak_perpanjang_bayar(&p("Baru", "Kedaluwarsa"), false, "2026-10-14").as_deref(),
            Some("Batas bayar baru tidak boleh sebelum hari ini.")
        );
        assert_eq!(
            tolak_perpanjang_bayar(&p("Baru", "Lunas"), false, "2026-10-20").as_deref(),
            Some("Pembayaran sudah tercatat; batas bayar tidak perlu diubah.")
        );
        assert_eq!(
            tolak_perpanjang_bayar(&p("Baru", "Tanpa biaya"), false, "2026-10-20").as_deref(),
            Some("Pendaftar ini tidak dikenai biaya pendaftaran.")
        );
        assert_eq!(
            tolak_perpanjang_bayar(&p("Terdaftar", "Kedaluwarsa"), false, "2026-10-20").as_deref(),
            Some("Pendaftar berstatus 'Terdaftar' tidak dapat diubah batas bayarnya.")
        );
    }

    /// Ekspresi SQL dijalankan sungguhan di SQLite, vektor yang sama dengan uji integrasi TS.
    #[test]
    fn ekspresi_sql_keadaan_dan_kuota() {
        let db = rusqlite::Connection::open_in_memory().unwrap();
        db.execute_batch(
            "CREATE TABLE pmb_pendaftar (id TEXT, status TEXT, biaya_tagihan INTEGER, batas_bayar TEXT, dibayar_dicatat_at TEXT);
             INSERT INTO pmb_pendaftar VALUES
               ('tanpa', 'Baru', 0, NULL, NULL),
               ('lunas', 'Baru', 150000, date('now', '+7 hours', '-3 days'), datetime('now')),
               ('menunggu', 'Baru', 150000, date('now', '+7 hours'), NULL),
               ('kedaluwarsa', 'Baru', 150000, date('now', '+7 hours', '-1 day'), NULL),
               ('ditolak', 'Ditolak', 0, NULL, NULL);",
        )
        .unwrap();
        let sql = format!(
            "SELECT p.id, {SQL_KEADAAN_BAYAR_PMB}, {SQL_MEMAKAN_KUOTA_PMB} FROM pmb_pendaftar p ORDER BY p.rowid"
        );
        let mut stmt = db.prepare(&sql).unwrap();
        let baris: Vec<(String, String, i64)> = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
            .unwrap()
            .map(Result::unwrap)
            .collect();
        assert_eq!(
            baris,
            vec![
                ("tanpa".into(), "Tanpa biaya".into(), 1),
                ("lunas".into(), "Lunas".into(), 1),
                ("menunggu".into(), "Menunggu Pembayaran".into(), 1),
                ("kedaluwarsa".into(), "Kedaluwarsa".into(), 0),
                ("ditolak".into(), "Tanpa biaya".into(), 0),
            ]
        );
    }
}
