mod administration;
pub mod commands;
pub mod config;
pub mod models;
mod operational;
mod payroll_seed;
mod scanner;
pub mod secrets;
pub mod sql_backend;
pub mod storage;
pub mod sync;
mod time_policy;
pub mod turso;

pub mod academic;
pub mod attendance_dashboard;
pub mod attendance_ledger;
pub mod class_attendance;
pub mod grades;
// Inventaris: SALINAN `desktop/inventory.rs` oleh sync-rust-modules.ts.
pub mod inventory;
// Lisensi offline Ed25519: SALINAN `desktop/license.rs` oleh sync-rust-modules.ts.
pub mod license;
pub mod payroll;
// Administrasi payroll: SALINAN `desktop/payroll/*` oleh sync-rust-modules.ts.
pub mod payroll_admin;
pub mod portability;
pub mod share;
pub mod teaching_journal;
// Buku Kunjungan UKS: SALINAN `desktop/uks.rs` oleh sync-rust-modules.ts.
pub mod uks;
pub mod wa_notification;
pub mod wa_sender;
pub mod wa_review;
pub use config::MobileState;
