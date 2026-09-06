# Absensi SPPG — Panduan Penting Rekayasa & Arsitektur Sistem

Dokumen ini memuat rangkuman prinsip, guard code, batasan terlarang, arsitektur backend, domain payroll & pajak, serta optimasi performa untuk pengembangan aplikasi Absensi SPPG (Mobile APK & Web/Desktop).

---

## 1. Performa: Cepat & Ringan

- **Next.js Static Export:** Menggunakan `output: 'export'` pada mode desktop/mobile statis — Tauri hanya perlu menyajikan static HTML/JS tanpa server Node.js di perangkat klien.
- **Kalkulasi Berat di Rust:** Proses agregasi, rekapitulasi data absensi, dan kalkulasi payroll dijalankan di sisi Rust (`tauri::command`), bukan di JavaScript.
- **Turso LibSQL Pipeline / Embedded Database:** Komunikasi langsung ke Turso LibSQL dengan SQLite lokal sebagai cache offline-first. Data tersimpan lokal saat offline dan tersinkronisasi otomatis saat online.
- **SQLite WAL Mode:** Mengaktifkan Write-Ahead Logging untuk konkurensi baca-tulis yang stabil dan cepat.
- **Library Ringan:** Menghindari library berat (seperti moment.js), gunakan `date-fns` atau `dayjs`.
- **Virtualisasi Tabel:** Gunakan `@tanstack/react-virtual` untuk daftar karyawan atau riwayat absensi ribuan baris agar memori tetap hemat dan render 60 FPS.
- **Minimalisasi Tauri Plugin:** Batasi plugin sesuai kebutuhan nyata untuk menjaga ukuran binary dan mengurangi surface permission.

---

## 2. Guard Code yang Wajib Ada

- **Auth Guard di Frontend:** Menggunakan wrapper `<AuthGuard>` di komponen React karena Next.js middleware tidak berjalan pada mode static export.
- **Role Guard Dinamis:** Hook `useRole()` untuk memfilter antarmuka berdasarkan peran (misal: HR/Superadmin yang berhak mengelola payroll/koreksi).
- **Rust Backend Guard:** Setiap `#[tauri::command]` sensitif wajib memverifikasi permission dan sesi di Rust. Jangan mengandalkan proteksi frontend semata karena IPC `invoke()` dapat dipanggil langsung dari DevTools.
- **Database Level Constraints:** Pasang constraint ketat di DDL: `UNIQUE(employee_id, date)` untuk cegah absen ganda, `CHECK(jam_keluar >= jam_masuk)`, `CHECK(gaji >= 0)`.
- **Idempotency Guard:** Mencegah double-processing pada kalkulasi dan pembukuan payroll saat tombol ditekan berulang kali.
- **Conflict Guard Sync:** Strategi resolusi data terdistribusi (last-write-wins dengan versioning `updated_at` / monotonic revisions).

---

## 3. Autentikasi & Keamanan Kredensial

- **Password Hashing:** Menggunakan **Argon2id** di sisi Rust, dilarang menggunakan plaintext atau hashing lemah.
- **Vault Kredensial Terenkripsi:** Token sesi dan kredensial database disimpan dalam vault `secrets.rs` (AES-256-GCM + Argon2id), bukan plaintext di `localStorage`.
- **Session Expiry & Auto-Logout:** Batas masa aktif sesi saat idle, terutama untuk perangkat tablet/kiosk bersama.
- **Biometrik Android:** Dukungan biometrik (PIN/Fingerprint) untuk validasi kehadiran perangkat mobile dipadukan dengan geofencing.
- **Immutable Audit Trail:** Catat seluruh log mutasi data penting (siapa mengubah data, kapan, nilai lama, nilai baru) ke tabel event audit yang tidak dapat dihapus/diubah.

---

## 4. Larangan Keras (Anti-Patterns)

- DILARANG menghitung gaji atau rumus pajak hanya di JavaScript frontend.
- DILARANG menanam hardcoded token/secret Turso di bundle release frontend.
- DILARANG mengosongkan CSP di `tauri.conf.json` atau memberikan izin capability global tanpa batas (gunakan prinsip *least privilege*).
- DILARANG menggunakan `dangerouslySetInnerHTML` untuk input pengguna.
- DILARANG membiarkan kolom yang sering difilter (`employee_id`, `tanggal`, `shift_id`) tanpa indeks database.
- DILARANG menggunakan tipe data float (`f64` / `number`) untuk kalkulasi mata uang/rupiah; wajib gunakan `rust_decimal` di Rust.
- DILARANG memuat aset 3D/animasi (`.glb`, `.splinecode`, `.riv`, `.wasm`, benchmark `detect-gpu`) dari CDN; aplikasi ini offline-first sehingga seluruh aset wajib di-bundle di `public/3d/`.
- DILARANG memount canvas 3D (WebGL) di halaman scanner saat kamera aktif, dan dilarang menjalankan lebih dari satu konteks WebGL sekaligus.
- DILARANG menyimpan preferensi kualitas visual/3D di tabel tersinkron (`setting_gex_system`); preferensi itu bersifat per-perangkat dan disimpan di `localStorage`.

---

## 5. Domain Logic: Payroll, Pajak (PPh 21) & BPJS

- **PPh 21 (Metode TER & Pasal 17):**
  - Pemotongan bulanan menggunakan metode Tarif Efektif Rata-rata (TER) Kategori A, B, atau C sesuai status PTKP.
  - Rekonsiliasi masa pajak Desember menggunakan tarif progresif Pasal 17 UU HPP (5 lapisan tarif 5%–35%).
  - Dukungan flag insentif DTP (Ditanggung Pemerintah) jika berlaku.
- **BPJS Ketenagakerjaan:**
  - JHT: 5,7% (2% karyawan, 3,7% perusahaan).
  - JP: 3% (1% karyawan, 2% perusahaan, terdapat batas plafon upah).
  - JKK & JKM: Ditanggung penuh perusahaan sesuai tingkat risiko kerja.
- **BPJS Kesehatan:**
  - Total 5% (4% perusahaan, 1% karyawan) dengan batas plafon upah tertentu.
- **Rule Table Dinamis (`effective_date`):**
  - Parameter tarif pajak, PTKP, dan plafon BPJS wajib disimpan dalam tabel konfigurasi (`tax_rules` / `bpjs_rules`) dengan kolom `effective_date`, bukan hardcoded di kode sumber.
- **Snapshot Tarif pada Payroll Runs:**
  - Setiap run payroll wajib menyimpan snapshot tarif yang berlaku saat itu ke tabel `payroll_runs` agar perhitungan masa lalu tidak berubah saat aturan pemerintah diperbarui.

---

## 6. Arsitektur Backend Rust & Tauri

- **Layered Architecture:**
  - *Command Layer:* Handler tipis untuk validasi input dan otorisasi sesi.
  - *Service Layer:* Business logic murni, kalkulasi payroll, evaluasi kehadiran, state transitions.
  - *Repository Layer:* Query dan manipulasi SQLite lokal / Turso pipeline.
- **State Machine Approval:** Alur status transaksi (Draft -> Review -> Approved -> Paid) dikelola menggunakan `enum` Rust dan `match` yang exhaustive.
- **Outbox Pattern:** Pencatatan mutasi ke tabel antrean outbox lokal sebelum dikirim ke cloud untuk menjamin keandalan saat jaringan offline/flaky.

---

## 7. Penanganan Platform (Desktop vs Android)

- **Android Mobile:**
  - Background task dibatasi oleh OS; sinkronisasi dijalankan saat aplikasi dibuka kembali atau saat koneksi pulih.
  - Runtime permissions (Kamera, Lokasi, Biometrik) wajib memiliki fallback anggun (*graceful degradation*) tanpa menyebabkan crash.
  - **Scoped Storage:** DILARANG menulis langsung ke `/storage/emulated/0/Download`. Sejak Android 10 penulisan itu ditolak, dan kegagalannya diam — berkas tetap dibuat di folder privat, pemanggil melapor sukses, pengguna tidak pernah menemukannya. Berkas untuk pengguna diserahkan lewat dialog Storage Access Framework (`tauri-plugin-android-fs`), memakai `android_fs_async()` agar antarmuka tidak membeku menunggu dialog.
  - Perintah yang hanya ada di biner Mobile ditulis di modul di luar daftar salin `sync-rust-modules.ts` dan namanya berawalan `mobile_`; di gateway bersama dipanggil dari dalam `if (isMobileRuntime()) { … }`.
- **Desktop (Windows/Mac/Linux):**
  - Dukungan single-instance (`tauri-plugin-single-instance`) untuk mencegah multiple instance pada perangkat kiosk.
  - Window state retention dan akses pencetakan slip gaji/laporan langsung ke printer.

---

## 7.1 Mode Database Lokal (offline-first tanpa server)

- Provider ada **TIGA**, bukan dua: `turso`, `self_hosted`, dan `local_file`. Nilainya disimpan eksplisit dan tidak pernah ditebak dari bentuk URL.
- Pada `local_file`, yang ditukar hanya **transport**-nya (`LocalTransport` di `sql_backend.rs`), bukan SQL-nya. `ensure_schema()` yang sama membangun database cloud maupun berkas lokal, sehingga drift antara keduanya mustahil secara struktural.
- Perangkat memegang **DUA berkas terpisah**: `desktop-security.db` (operasional + outbox) dan `sppg-hub.db` (berperan sebagai cloud). Mutasi lokal hanya menyentuh yang pertama; hub baru terisi lewat `push_outbox`.
- Karena `export_database` dan promosi ke cloud sama-sama membaca **hub**, outbox yang tidak pernah terkuras berarti cadangan dan migrasi kehilangan data tanpa satu pun pesan error.
- Karena itu mesin sinkronisasi **tetap wajib berjalan** di mode lokal. "Tidak ada jaringan" bukan alasan melewatkan siklus sync: push di sini adalah operasi berkas, bukan operasi jaringan.

---

## 8. Standar Visual: Immersive 3D & Motion UI

- **Stack Resmi (8 Kategori):**
  - *3D Rendering:* React Three Fiber (v9+) + Drei — objek 3D penuh, interaksi model, visualisasi data.
  - *No-Code 3D:* Spline (`@splinetool/react-spline`) — kartu hero & maskot interaktif.
  - *Pseudo-3D & Animasi UI:* Motion (Framer Motion) — tilt 3D, parallax hover, transisi layout.
  - *Animasi Mikro & Status:* Rive (`@rive-app/react-canvas`) — ikon interaktif & indikator status sinkronisasi Turso.
  - *Komponen Visual Modern:* Aceternity UI & Magic UI (kode di-vendor, bukan dependency npm).
  - *Deteksi Hardware:* `detect-gpu` — menentukan kualitas grafis otomatis sesuai spek laptop/HP.
  - *Kompresi Aset:* Draco / GLTF-Transform — memperkecil model hingga 80% (devDependency saja).
  - *State Bridge:* Zustand — menghubungkan data SQLite ke canvas 3D tanpa re-render berlebih.
- **Offline-First Mutlak:** seluruh aset dan runtime WASM di-bundle di `public/3d/`; tidak boleh ada satupun request keluar saat aplikasi berjalan tanpa internet.
- **Graceful Degradation:** tier kualitas `high | medium | low | off` ditentukan `detect-gpu` (default aman `low` bila deteksi gagal), disimpan device-local, dan turun otomatis saat frame rate di bawah target. Seluruh alur inti wajib tetap berfungsi penuh pada tier `off`.
- **Hemat Baterai:** `frameloop="demand"` untuk scene statis, render loop berhenti saat aplikasi tidak terlihat, `prefers-reduced-motion` dihormati.
- Kontrak lengkap: `.agents/skills/absensi-sppg-rules/references/07-immersive-3d-ui-ux.md`.
