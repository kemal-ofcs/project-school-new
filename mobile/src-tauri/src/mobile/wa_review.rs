use serde_json::Value;
use tauri::State;

use super::commands::require_permission;
use super::config::MobileState;
use super::models::CommandError;

/// Tinjauan antrean WhatsApp khusus Mobile — membaca CLOUD, bukan SQLite lokal.
///
/// MENGAPA MODUL INI TERPISAH, DAN MENGAPA NAMANYA BERAWALAN `mobile_`.
/// `commands.rs` adalah salinan otomatis dari `web-desktop` (lihat
/// `mobile/scripts/sync-rust-modules.ts`), sehingga apa pun yang ditambahkan di
/// sana akan tertimpa pada sinkronisasi berikutnya. Perintah yang HANYA ada di
/// biner Mobile karena itu wajib hidup di modul di luar daftar salin, dan
/// namanya wajib berawalan `mobile_` — awalan itulah yang dipakai
/// `audit:contract` untuk membedakan "command hantu" dari command khusus
/// Mobile.
///
/// MENGAPA CLOUD, BUKAN LOKAL. `desktop_list_wa_notifications` di
/// `wa_notification.rs` membaca SQLite lokal, dan itu benar untuk sebuah
/// terminal pemindai yang ingin melihat antrean buatannya sendiri. Tetapi
/// `notifikasi_wa` berada di luar `SNAPSHOT_TABLES`: barisnya didorong ke cloud
/// dan TIDAK pernah ditarik kembali. Sebuah ponsel yang bukan terminal karena
/// itu selalu melihat tabel lokal yang kosong — dan kosong tidak bisa dibedakan
/// dari "tidak ada notifikasi". Halaman yang tampak sehat sambil berbohong
/// lebih buruk daripada halaman yang berkata tidak tersedia.
///
/// Konsekuensinya, seperti Bimbingan Konseling, halaman ini MENUNTUT JARINGAN,
/// dan antarmukanya wajib mengatakan itu alih-alih menampilkan daftar kosong.
///
/// Modul ini tidak menyentuh SQLite lokal, outbox, maupun `SNAPSHOT_TABLES`.
#[tauri::command]
pub async fn mobile_list_wa_notifications(
    state: State<'_, MobileState>,
    status: Option<String>,
    jenis: Option<String>,
    id_siswa: Option<String>,
    tanggal: Option<String>,
    limit: Option<i64>,
) -> Result<Value, CommandError> {
    require_permission(&state, "notification.view")?;
    state
        .get_turso_client()?
        .list_wa_notifications_cloud(
            status.as_deref(),
            jenis.as_deref(),
            id_siswa.as_deref(),
            tanggal.as_deref(),
            limit,
        )
        .await
}
