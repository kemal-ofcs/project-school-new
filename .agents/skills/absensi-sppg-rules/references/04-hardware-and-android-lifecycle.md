# Modul Siklus Kamera, Hardware Scanner & Android TLS

Dokumen ini mengatur siklus hidup kamera pada Android WebView, konfigurasi TLS Android tanpa crash, proteksi ProGuard R8, serta optimasi performa hardware scanner (GPS & Monotonic Clock).

---

## 1. Siklus Hidup Kamera & Scanner QR Android WebView

### Masalah Historis:
- Pada Android WebView, jika fungsi `stopCamera()` ditaruh di dalam cleanup `useEffect` yang memiliki dependency state (seperti `cameraActive`), kamera akan langsung mati seketika (0.1 detik) setelah dibuka karena re-render memicu cleanup sebelumnya.

### Standar Decoupled Lifecycle Kamera (Wajib Dipatuhi):
1. **Pemisahan Cleanup Unmount Murni:**
   - Cleanup unmount komponen kamera WAJIB dibuat dalam `useEffect` terpisah dengan dependency array kosong `[]`:
   ```typescript
   useEffect(() => {
     return () => {
       stopCamera();
     };
   }, []);
   ```
2. **Pemisahan Listener Visibility Change:**
   - Event `visibilitychange` (saat user beralih aplikasi atau mematikan layar) dibuat dalam `useEffect` terpisah yang hanya bergantung pada referensi `stopCamera` yang stabil:
   ```typescript
   useEffect(() => {
     const handleVisibility = () => {
       if (document.hidden) stopCamera();
     };
     document.addEventListener("visibilitychange", handleVisibility);
     return () => document.removeEventListener("visibilitychange", handleVisibility);
   }, [stopCamera]);
   ```
3. **Fallback Constraints Bertingkat:**
   - Coba constraint ideal environment camera terlebih dahulu: `{ video: { facingMode: { ideal: "environment" } } }`.
   - Tangkap exception dengan `try/catch` dan fallback otomatis ke `{ video: true }` agar tetap dapat terbuka di HP Android lawas / tablet tanpa kamera belakang standar.
4. **Atribut Video Tag Wajib:**
   - Elemen `<video>` untuk viewfinder wajib memiliki atribut: `autoPlay playsInline muted`.

---

## 2. Standar Jaringan TLS & Provider Kriptografi Android

### Aturan Bebas Crash Android (Zero-Crash Standard):
1. **DILARANG** menggunakan `rustls-platform-verifier` pada target Android — crate ini mencoba memanggil VM Java JNI sebelum VM terinisialisasi secara utuh dan memicu crash seketika saat aplikasi dibuka.
2. **WAJIB** menggunakan **`webpki-roots`** (kumpulan sertifikat Mozilla root CA bawaan).
3. **Provider Ring:**
   - **DILARANG** menggunakan `aws-lc-rs` pada Android target.
   - Panggil instalasi provider `ring` di baris paling awal fungsi `run()` di `src-tauri/src/lib.rs` sebelum inisialisasi builder Tauri:
   ```rust
   #[cfg(target_os = "android")]
   {
       let _ = rustls::crypto::ring::default_provider().install_default();
   }
   ```

---

## 3. Konfigurasi ProGuard / R8 Minification

### Aturan Build Gradle:
- **DILARANG MENGAKTIFKAN** `isMinifyEnabled = true` di `build.gradle.kts` pada Tauri Android. R8 akan memotong nama-nama method JNI internal Tauri dan menyebabkan aplikasi crash seketika saat dibuka (*JNI UnsatisfiedLinkError*).
- Pastikan konfigurasi `build.gradle.kts`:
  ```kotlin
  buildTypes {
      release {
          isMinifyEnabled = false
          isShrinkResources = false
      }
  }
  ```
- File `proguard-rules.pro` wajib mempertahankan:
  ```pro
  -keep class app.tauri.** { *; }
  -keep class id.sppg.absensi.mobile.** { *; }
  ```

---

## 4. GPS 0ms In-Memory Caching & Integritas Jam Hardware

### Performa Scan Cepat (GPS 0ms Latency):
- Melakukan query GPS hardware secara sinkron saat kartu di-scan akan menyebabkan keterlambatan respon 2–5 detik.
- Klien wajib mengaktifkan background coordinate watcher (`watchCoordinates()`) dan menyimpan koordinat terakhir dalam in-memory cache dengan **TTL 60 detik**.
- Fungsi scanner membaca koordinat dari cache (`getCachedCoordinates()`) sehingga proses scan selesai dalam **< 10ms**.

### Anti-Rollback Hardware Monotonic Clock:
- Backend Rust tidak mempercayai timestamp dari JavaScript client.
- Waktu absensi divalidasi menggunakan monotonic hardware clock (`time_policy.rs`).
- Jika jam perangkat dimundurkan melebihi batas toleransi keamanan (5 menit), operasi scan ditolak untuk mencegah manipulasi kehadiran.

---

## 5. Keluaran Berkas di Android (Scoped Storage & SAF)

### Larangan Keras:
- **DILARANG menulis ke `/storage/emulated/0/Download`** atau folder publik mana pun secara langsung. Sejak Android 10 (scoped storage) penulisan itu ditolak.
- Bentuk kegagalannya yang berbahaya: berkas tetap dibuat di folder privat aplikasi, pemanggil melaporkan **sukses**, dan pengguna tidak pernah menemukan hasilnya. Tidak ada error yang muncul di mana pun.

### Standar Storage Access Framework:
- Berkas yang harus sampai ke tangan pengguna diserahkan lewat dialog **Simpan ke…** milik sistem, memakai `tauri-plugin-android-fs` yang di-`cfg` khusus `target_os = "android"`.
- Penggunalah yang memilih tujuannya (penyimpanan internal, Drive, SD card). Izin diberikan **per berkas**, sehingga tidak ada satu pun permission manifest yang perlu diminta.
- **WAJIB memakai `android_fs_async()`, bukan `android_fs()`.** Dialognya menunggu interaksi manusia; memblokir thread runtime selama itu membekukan seluruh antarmuka — termasuk dialog yang sedang ditunggu.
- Pengguna yang menutup dialog adalah **PEMBATALAN, bukan kegagalan**. UI wajib membedakan keduanya: berkasnya tetap ada di folder aplikasi, jadi pesan error justru menyesatkan.
- Frontend TIDAK boleh menyerahkan path ke command semacam ini. Perintahnya menghasilkan berkasnya sendiri lalu langsung menyerahkannya, sehingga tidak ada jalan bagi pemanggil untuk menunjuk berkas lain di dalam folder data aplikasi.

### Perintah Khusus Mobile (`mobile_` prefix):
- Perintah yang HANYA ada di biner Mobile hidup di modul **di luar** daftar salin `scripts/sync-rust-modules.ts` (`share.rs`, dan seterusnya). Menaruhnya di `commands.rs` berarti ia terhapus setiap kali sinkronisasi dari `web-desktop` dijalankan.
- Namanya **WAJIB berawalan `mobile_`**. Awalan itu yang dipakai `bun run audit:contract` untuk membedakan "command hantu" dari "command khusus Mobile"; tanpa awalannya, gateway bersama yang memanggilnya dilaporkan sebagai cacat.
- Di sisi gateway bersama, panggilannya WAJIB berada di dalam blok `if (isMobileRuntime()) { … }` — guard **positif**, bukan `if (!isMobileRuntime()) throw`. Hanya bentuk itu yang dikenali `splitMobileBranch` di auditnya.
- Gerbang izinnya tetap `require_permission` yang SAMA (karena itu ia `pub(crate)`, bukan privat). Menyalin logika izin ke modul mobile akan membuat dua gerbang yang cepat atau lambat berbeda.
