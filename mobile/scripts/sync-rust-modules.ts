import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const desktopDir = join(__dirname, "../../web-desktop/src-tauri/src/desktop");
const mobileDir = join(__dirname, "../src-tauri/src/mobile");

const filesToSync = [
  "sync.rs",
  "operational.rs",
  "administration.rs",
  "scanner.rs",
  "academic.rs",
  "class_attendance.rs",
  "teaching_journal.rs",
  "attendance_ledger.rs",
  "attendance_dashboard.rs",
  "wa_notification.rs",
  "commands.rs",
  // Tarif default payroll: satu sumber untuk SQLite lokal dan Turso cloud, di
  // kedua workspace. Perbedaan sekecil apa pun di sini membuat baris seed lokal
  // terdorong ke cloud dan menggandakan bracket pajak.
  "payroll_seed.rs",
  // Klien Turso: DDL cloud, seed katalog permission, dan guard prioritas
  // absensi. Dulu berkas ini dipelihara terpisah dan sudah drift dua arah —
  // seed permission Mobile ketinggalan lima permission payroll dan menanam dua
  // permission yang tidak ada di `catalog.ts`, sementara hanya Mobile yang
  // menanam shift default. Karena keduanya membangun database Turso yang sama,
  // berkas ini WAJIB identik.
  "turso.rs",
  // Seam transport SQL. Wajib ikut: ia memuat dekoder sel Hrana yang dipakai
  // jalur cloud DAN jalur SQLite lokal, sehingga bentuk nilai hasil query di
  // kedua platform tidak boleh berbeda satu tipe pun.
  "sql_backend.rs",
  // Ekspor/impor berkas hub. Ikut disinkronkan supaya aturan validasi cadangan
  // — versi skema, integritas, dan penolakan database asing — tidak pernah
  // berbeda antara Desktop dan Mobile.
  "portability.rs",
  // Sumber kebenaran tunggal untuk timestamp absensi: penentuan tanggal kerja,
  // jendela scan pulang, deteksi shift fleksibel, dan cutoff Generate Alfa.
  // Berkas ini dulu dipelihara terpisah di kedua workspace tanpa alat apa pun
  // yang menjaganya tetap sama — persis kelas drift yang membuat aturan shift
  // berbeda antar platform.
  "time_policy.rs",
];

/**
 * Berkas yang memuat kode SENGAJA tidak didaftarkan di biner Mobile.
 *
 * APA YANG MASIH MATI HARI INI — dan hanya ini:
 * jalur WhatsApp yang bersandar pada SQLite lokal dan konfigurasi cloud-only,
 * yaitu `desktop_queue_wa_notification`, `desktop_cancel_wa_notification`,
 * `desktop_list_wa_notifications` (versi LOKAL), `desktop_get_wa_config`, dan
 * `desktop_save_wa_config`, beserta fungsi pendukungnya di `wa_notification.rs`
 * dan `TursoClient::{get,save}_wa_config`.
 *
 * `notifikasi_wa` berada di luar snapshot, sehingga membaca tabel LOKAL di
 * ponsel yang bukan terminal pemindai selalu menghasilkan daftar kosong — dan
 * kosong tidak bisa dibedakan dari "tidak ada notifikasi". Karena itu Mobile
 * memakai `mobile_list_wa_notifications` di `wa_review.rs`, yang membaca cloud;
 * versi lokalnya tetap tersalin tetapi tidak pernah didaftarkan. Mengantre,
 * membatalkan, dan menyunting konfigurasi gateway sengaja tidak dibawa ke
 * ponsel: ketiganya menyentuh pengiriman pesan ke nomor wali seorang siswa.
 *
 * BIMBINGAN KONSELING SUDAH TIDAK ADA DI SINI LAGI. Ketujuh command-nya kini
 * terdaftar di Mobile dan memanggil cloud (`bk_kasus`/`bk_sesi` tidak pernah ada
 * di SQLite lokal), sehingga kodenya hidup dan `dead_code` kembali menjaganya.
 *
 * Kodenya tetap TERSALIN karena `commands.rs`, `turso.rs`, dan `wa_notification.rs`
 * wajib identik dengan Desktop, tetapi `lib.rs` Mobile tidak mendaftarkan yang
 * di atas — sehingga rustc menandainya `dead_code`. Belasan peringatan itu tidak
 * menunjuk satu pun cacat, dan justru itu bahayanya: ia mengubur peringatan yang
 * benar.
 *
 * Daftar ini SENGAJA sempit, dan wajib MENYUSUT begitu jalur di atas didaftarkan.
 * Dua belas berkas generated lainnya tetap diperiksa `dead_code` seperti biasa,
 * sehingga fitur baru yang lupa didaftarkan tetap berteriak. Yang menangkap
 * kesalahan sebenarnya di sini bukan `dead_code` melainkan `bun run audit:contract`,
 * yang menelusuri panggilan gateway dari kedua arah: gateway yang memanggil
 * command tak terdaftar, DAN command terdaftar yang fungsinya tidak ada.
 */
const dibiarkanTakTerpakai = new Set([
  "commands.rs",
  "turso.rs",
  "wa_notification.rs",
]);

const KEPALA_GENERATED = (file: string) =>
  `// BERKAS INI HASIL SALIN OTOMATIS dari web-desktop oleh
// \`mobile/scripts/sync-rust-modules.ts\`. JANGAN disunting dengan tangan —
// perubahannya akan tertimpa diam-diam pada sinkronisasi berikutnya.
// Sunting sumbernya: \`web-desktop/src-tauri/src/desktop/${file}\`.
`;

/** Sesuaikan tipe & jalur modul Desktop ke padanan Mobile. */
function adaptToMobile(content: string) {
  return content
    .replaceAll("DesktopState", "MobileState")
    .replaceAll("DesktopSyncStatus", "MobileSyncStatus")
    .replaceAll("DesktopLoginResult", "MobileLoginResult")
    .replaceAll("DesktopRuntimeStatus", "MobileRuntimeStatus")
    .replaceAll("DesktopSession", "MobileSession")
    .replaceAll("desktop-security.db", "mobile-security.db")
    .replaceAll("crate::desktop::", "crate::mobile::")
    .replaceAll("use crate::desktop", "use crate::mobile")
    .replaceAll("super::super::desktop", "super::super::mobile");
}

for (const file of filesToSync) {
  const srcPath = join(desktopDir, file);
  let content = adaptToMobile(readFileSync(srcPath, "utf-8"));

  // Atribut dalam (`#![...]`) WAJIB mendahului seluruh item, termasuk `use`.
  // Komentar boleh berada di atasnya, jadi kepala berkas tetap terbaca lebih
  // dulu oleh manusia.
  const izin = dibiarkanTakTerpakai.has(file)
    ? "#![allow(dead_code)] // lihat sync-rust-modules.ts: sengaja tidak didaftarkan di Mobile\n"
    : "";
  content = `${KEPALA_GENERATED(file)}${izin}\n${content}`;

  const destPath = join(mobileDir, file);
  writeFileSync(destPath, content, "utf-8");
  console.log(`Synced ${file} to ${destPath}`);
}

// Administrasi payroll (konfigurasi gaji, aturan pajak/BPJS/lembur, payroll
// run). Menyangkut UANG, jadi satu implementasi saja: modul Desktop disalin
// apa adanya, tidak pernah ditulis ulang di Mobile. Tujuannya `payroll_admin/`
// karena `mobile/payroll.rs` sudah dipakai command baca-saja `mobile_*`
// (slip & estimasi karyawan). Command-nya tetap bernama `desktop_*` supaya
// gateway `payroll.ts` yang sama dipakai kedua build tanpa cabang baru.
// Seluruh command-nya didaftarkan di Mobile, jadi berkas ini TIDAK masuk
// `dibiarkanTakTerpakai` — `dead_code` tetap menjaganya.
const payrollAdminFiles = ["mod.rs", "commands.rs", "engine.rs", "models.rs"];
const payrollAdminDest = join(mobileDir, "payroll_admin");
mkdirSync(payrollAdminDest, { recursive: true });
for (const file of payrollAdminFiles) {
  const srcPath = join(desktopDir, "payroll", file);
  const content = `${KEPALA_GENERATED(`payroll/${file}`)}\n${adaptToMobile(readFileSync(srcPath, "utf-8"))}`;
  const destPath = join(payrollAdminDest, file);
  writeFileSync(destPath, content, "utf-8");
  console.log(`Synced payroll/${file} to ${destPath}`);
}
