---
name: fix-mobile-theme-and-native-share
description: Perbaiki warna tema terang (light mode) yang terbalik/terlalu gelap dan perbaiki fitur "Bagikan" (Share) di aplikasi mobile Android (Tauri v2 + WebView) agar membuka Android Native Share Sheet (WhatsApp/Telegram) alih-alih aplikasi "Files", lalu verifikasi dan build APK ARM64.
---

# Fix Mobile Theme and Native Share

Panduan operasional mandiri untuk:
1. Memperbaiki kontras dan harmoni warna tema terang (*light mode*) pada aplikasi Mobile hybrid (Next.js / Tailwind CSS di WebView) yang terpengaruh pembalikan variabel dark-first.
2. Memperbaiki fitur "Bagikan" (Share gambar/berkas seperti ID Card) di Android WebView agar membuka menu aplikasi native (*Android Share Sheet*) alih-alih jatuh ke fallback dialog simpan berkas (*Storage Access Framework / "Files"*).
3. Menjalankan gerbang verifikasi kualitas (`bun run check`, `cargo check`) dan kompilasi biner release Android ARM64 (`bun run tauri:android:build:arm64`).

---

## 1. Trigger yang Presisi

### Kapan Skill ini WAJIB Dipakai:
- Pengguna melaporkan warna tema terang di versi mobile terlalu gelap, kusam, atau kotaknya berwarna hitam padahal sedang mode terang (misalnya kartu dashboard/kehadiran).
- Pengguna melaporkan tombol "Bagikan" / "Share" di Android membuka aplikasi "Files" (pengelola berkas) sehingga fungsinya sama persis dengan tombol "Unduh".
- Pengguna meminta perbaikan UI tema terang dan fitur bagikan mobile, lalu meminta build APK ARM64.
- Kalimat umum yang diucapkan user:
  - *"di versi mobile warna nya masih kurang selaras jika menggunakan tema terang. warna nya masih teralu gelap."*
  - *"fitur 'bagikan' masih salah. seharusnya membuka aplikasi seperti whatsapp, telegram dan lainnya. tetapi ini malah membuka aplikasi 'files'"*
  - *"perbaiki tampilan light mode mobile dan share button, lalu jalankan check dan build apk arm64"*

### Kapan Skill ini DILARANG Dipakai:
- Perbaikan UI khusus Web/Desktop (tanpa ada kaitan dengan Android WebView).
- Masalah sinkronisasi database cloud/lokal murni (gunakan skill `resolve-sync-schema-mismatch`).
- Berbagi teks murni yang sudah sukses menggunakan Web Share API atau clipboard.
- Masalah hardware scanner kamera atau siklus QR scanner.

---

## 2. Instructions (Langkah demi Langkah)

### Langkah 1: Investigasi Masalah UI Tema Terang (Light Mode)
1. Periksa komponen kartu/tampilan target di `mobile/src/components/...`.
2. Periksa `mobile/src/app/globals.css`. Perhatikan apakah ada pembalikan warna dasar Tailwind v4 (misal: `--color-white: #0f172a;` di root).
   - Jika CSS bertumpu pada dark-first di mana `white` didefinisikan sebagai warna gelap, kelas seperti `bg-white/80` akan merender kotak hitam saat tema terang aktif!
3. Tambahkan kelas penanda semantik (misal: `.status-hero-card`, `.hero-status-box`, `.hero-status-value`) pada elemen-elemen di komponen JSX.
4. Buat aturan eksplisit di `globals.css` di bawah pemilih `html[data-theme="light"] .nama-kelas`:
   - Gunakan warna heksadesimal eksplisit dengan `!important` (misal: background `#ffffff !important`, text `#0f172a !important`).
   - Gunakan gradien yang lembut dan selaras (contoh langit cerah: `linear-gradient(180deg, #bde0fe 0%, #d0e8ff 50%, #e8f2ff 100%)`).
5. Pastikan `ThemeProvider.tsx` menyinkronkan class `.light` / `.dark` ke `document.documentElement` bersamaan dengan atribut `data-theme`.

### Langkah 2: Investigasi Fitur "Bagikan" (Share vs Download)
1. Periksa utilitas share di `mobile/src/lib/client/share.ts`.
2. Pahami akar masalah Android WebView:
   - WebView Android **tidak** mendukung `navigator.share` dengan berkas lampiran (*files attachment*) secara native, sehingga melempar error atau jatuh ke blok `catch`.
   - Jika jatuh ke fallback `downloadDataUrl`, fungsi tersebut memanggil Storage Access Framework (SAF) via Rust/Android API, yang membuka aplikasi "Files" (Save As dialog). Akibatnya, tombol "Bagikan" menjadi salinan tombol "Unduh".
3. Solusi standar: Sediakan bridge native Android (`@JavascriptInterface`) di Kotlin yang menerima base64 gambar, menyimpannya ke cache sementara, dan menyiarkannya via `Intent(Intent.ACTION_SEND)`.

### Langkah 3: Implementasi Native Share Sheet di Android (Kotlin)
1. Buka `mobile/src-tauri/gen/android/app/src/main/java/.../MainActivity.kt`.
2. Buat kelas `AndroidNativeBridge(private val activity: Activity)`:
   - Method `@JavascriptInterface fun shareImage(base64Data: String, filename: String, title: String): String`.
   - Bersihkan prefix base64 (`data:image/png;base64,`).
   - Tulis byte gambar ke folder cache privat: `File(activity.cacheDir, "shared_images")`.
   - Dapatkan content URI aman via `androidx.core.content.FileProvider.getUriForFile(activity, "${activity.packageName}.fileprovider", imageFile)`.
   - Buat `Intent(Intent.ACTION_SEND)`:
     - `type = "image/png"`
     - `putExtra(Intent.EXTRA_STREAM, contentUri)`
     - `addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)`
   - Eksekusi pembukaan dialog di UI thread:
     ```kotlin
     activity.runOnUiThread {
         val chooser = Intent.createChooser(shareIntent, title)
         chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
         activity.startActivity(chooser)
     }
     ```
   - Kembalikan string JSON: `"""{"sukses":true}"""`.
3. Daftarkan bridge ke WebView pada saat inisialisasi / `onWebViewCreate`:
   ```kotlin
   webView.addJavascriptInterface(AndroidNativeBridge(this), "AndroidBridge")
   ```
4. Pastikan `res/xml/file_paths.xml` dan `AndroidManifest.xml` sudah memiliki konfigurasi `<provider>` untuk `androidx.core.content.FileProvider` dengan `<cache-path name="shared_images" path="shared_images/" />`.

### Langkah 4: Hubungkan Frontend ke Native Bridge
1. Di `mobile/src/types/android-bridge.d.ts`, pastikan interface `Window` mendeklarasikan:
   ```typescript
   export interface AndroidNativeBridgeInterface {
     shareImage?: (base64Data: string, filename: string, title: string) => string;
     // ...
   }
   declare global {
     interface Window {
       AndroidBridge?: AndroidNativeBridgeInterface;
     }
   }
   ```
2. Di `mobile/src/lib/client/share.ts`, tempatkan pemeriksaan native bridge di **urutan pertama**:
   ```typescript
   if (typeof window !== "undefined" && window.AndroidBridge?.shareImage) {
     const raw = window.AndroidBridge.shareImage(cleanBase64, filename, title);
     const res = JSON.parse(raw);
     if (res.sukses) return { sukses: true };
   }
   ```
3. Pastikan `share.ts` ada dalam daftar `MOBILE_ONLY_IN_SYNCED_DIRS` di `mobile/scripts/sync-frontend-lib.ts` agar tidak tertimpa saat sinkronisasi kode bersama.

### Langkah 5: Verifikasi Paritas Skema (Jika Menyentuh Rust)
1. Jika ada modifikasi skema/sentinel, pastikan `CLIENT_SCHEMA_VERSION` di `sync.rs` sama dengan `MAX(version)` di `turso.rs`.
2. Jalankan `bun run sync:mobile` jika ada perubahan pada modul Rust bersama di `web-desktop`.

### Langkah 6: Eksekusi Pipeline Verifikasi dan Build
1. Jalankan pengujian unit Rust spesifik (jika ada):
   ```bash
   cargo test --manifest-path mobile/src-tauri/Cargo.toml <nama_test>
   ```
2. Jalankan pemeriksaan penuh di workspace mobile:
   ```bash
   cd mobile && bun run check
   ```
   *(Memastikan `biome check`, `tsc --noEmit`, `scripts/run-tests.ts`, dan `test:rust` lulus 100%)*
3. Jalankan `cargo check` di `mobile/src-tauri`:
   ```bash
   cargo check --manifest-path mobile/src-tauri/Cargo.toml
   ```
4. Jalankan build biner release Android ARM64:
   ```bash
   cd mobile && bun run tauri:android:build:arm64
   ```
5. Verifikasi keberadaan output APK:
   `mobile/src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk`

---

## 3. Rules & Constraints

1. **Dilarang Menebak Selector CSS:** Jangan mengubah kelas global Tailwind tanpa membatasi scopenya ke pemilih spesifik (misal `html[data-theme="light"] .status-hero-card`), agar tema gelap tidak ikut rusak.
2. **Prioritas Native Bridge di Android WebView:** Jangan mengandalkan `navigator.share` dengan file lampiran di WebView Android — WebView Chromium di Android terkenal melempar `AbortError` atau gagal membaca blob. Native bridge via `Intent.ACTION_SEND` wajib diutamakan.
3. **Wajib `runOnUiThread` untuk Chooser:** Membuka `Intent.createChooser` dari method `@JavascriptInterface` WAJIB dibungkus `activity.runOnUiThread { ... }` karena JavaScriptInterface berjalan di background worker thread (`JavaBridge`).
4. **Wajib FileProvider Aman:** Dilarang menggunakan `Uri.fromFile(...)` mentah karena akan memicu `FileUriExposedException` fatal di Android 7.0 (API 24)+. Gunakan `FileProvider.getUriForFile(...)`.
5. **Jaga `isMinifyEnabled = false`:** Dilarang mengaktifkan R8 minifier di Android Gradle karena akan menghapus class bridge reflection dan memicu crash runtime.
6. **Eksekusi Bertahap:** Jangan langsung menjalankan build APK sebelum `bun run check` dan `cargo check` berhasil tanpa error.

---

## 4. Output Format

Setelah proses selesai, laporkan hasil dengan format berikut:

```markdown
### Ringkasan Eksekusi & Hasil

1. **Penyelarasan Warna Tema Terang (Mobile):**
   - Komponen diperbarui: `<Path File>`
   - CSS diperbarui: `<Path File>` (Latar belakang gradien `<kode hex>`, status box `#ffffff`, teks `#0f172a`).

2. **Perbaikan Fitur Bagikan (Share Sheet):**
   - Bridge Android ditambahkan di: `MainActivity.kt` (`AndroidNativeBridge.shareImage`)
   - Handler frontend: `share.ts`
   - Perilaku: Membuka Android Native Share Sheet (WhatsApp, Telegram, dll.) melalui `FileProvider` dan `Intent.ACTION_SEND`.

3. **Status Verifikasi & Build:**
   - `bun run check` (Mobile): **Lulus 100%** (`lint`, `typecheck`, `test`, `test:rust`)
   - `cargo check` (Mobile): **Lulus**
   - `bun run tauri:android:build:arm64`: **Selesai Sukses**
   - Berkas APK: `mobile/src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk`
```

---

## 5. Contoh Lengkap (Input sampai Output)

### Input User:
> "di versi mobile warna nya masih kurang selaras jika menggunakan tema terang. warna nya masih teralu gelap. seharus nya buat yang lebih terang, mungkin biru muda. lalu fitur 'bagikan' masih salah. seharusnya membuka aplikasi seperti whatsapp, telegram dan lainnya. tetapi ini malah membuka aplikasi 'files'. perbaiki, lalu cek bun run check di mobile dan build apk arm64."

### Alur Eksekusi:
1. Menambahkan class `.status-hero-card` dan box styling pada `StatusHeroCard.tsx`.
2. Menambahkan CSS theme light di `globals.css` dengan gradien biru muda (`#bde0fe` ke `#e8f2ff`) dan box putih `#ffffff !important`.
3. Menambahkan `AndroidNativeBridge` di `MainActivity.kt` dengan `@JavascriptInterface fun shareImage`.
4. Mengarahkan `share.ts` memanggil `window.AndroidBridge?.shareImage` di urutan pertama.
5. Menjalankan `bun run check` di `mobile/` $\to$ 246 rust test ok, lint ok, typecheck ok.
6. Menjalankan `cargo check --manifest-path mobile/src-tauri/Cargo.toml` $\to$ ok.
7. Menjalankan `bun run tauri:android:build:arm64` $\to$ Berhasil membuat APK.

### Output:
*(Sesuai template Output Format di atas)*

---

## 6. Failure Modes & Cara Menghindarinya

| Failure Mode | Penyebab Utama | Cara Menghindari |
| :--- | :--- | :--- |
| **Kotak status tetap hitam di tema terang** | Variabel `--color-white` di Tailwind v4 di-override menjadi `#0f172a` untuk dark mode default. | Berikan styling CSS spesifik `html[data-theme="light"] .hero-status-box { background: #ffffff !important; color: #0f172a !important; }`. |
| **Aplikasi crash saat menekan "Bagikan"** | `startActivity` dipanggil dari background thread bridge atau `FileUriExposedException` terjadi karena pakai `Uri.fromFile`. | Bungkus `startActivity` di dalam `activity.runOnUiThread { ... }` dan gunakan `FileProvider.getUriForFile`. |
| **Tombol "Bagikan" tetap membuka dialog unduh / "Files"** | `window.AndroidBridge` tidak terdeteksi atau tidak di-inject sebelum WebView memuat JavaScript. | Injeksi bridge di `onWebViewCreate(webView)` dan pasang pemeriksaan `typeof window !== "undefined" && window.AndroidBridge?.shareImage` di frontend. |
| **`sync:mobile` menghapus perubahan `share.ts`** | Skrip sinkronisasi menganggap `share.ts` sebagai duplikat dari `web-desktop` yang perlu ditimpa. | Daftarkan `lib/client/share.ts` di dalam array `MOBILE_ONLY_IN_SYNCED_DIRS` pada `mobile/scripts/sync-frontend-lib.ts`. |
| **Build APK gagal di langkah Rust (`test:rust` / `cargo check`)** | Versi skema klien dan migration sentinel berbeda (`CLIENT_SCHEMA_VERSION` mismatch). | Pastikan `turso.rs` menyemai versi migrasi tertinggi yang sama dengan `CLIENT_SCHEMA_VERSION` di `sync.rs`. |
