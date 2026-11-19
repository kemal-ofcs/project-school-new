//! HRIS Fase 8 (`prd-hris/fase-8.md` §26.2.3): reimbursement.
//!
//! Kelima tabel `hr_reimburse*` KHUSUS CLOUD. Sejauh 8a baru seed jenis
//! bawaan; aturan klaim, keputusan, dan pembayaran menyusul di 8c. Kembaran
//! TS: `src/lib/validations/hr-reimburse.ts`.

/// Berid tetap dan `INSERT OR IGNORE`: jenis yang sudah disunting tidak
/// ditimpa. Kembar harfiah `SEED_JENIS_REIMBURSE_SQL` di TS.
pub const SEED_JENIS_REIMBURSE_SQL: &str = "INSERT OR IGNORE INTO hr_reimburse_jenis (id_jenis, nama, wajib_nota) VALUES ('rmj-transport', 'Transport', 0), ('rmj-kesehatan', 'Kesehatan', 1), ('rmj-konsumsi', 'Konsumsi', 1), ('rmj-dinas', 'Dinas', 1), ('rmj-lainnya', 'Lainnya', 1);";
