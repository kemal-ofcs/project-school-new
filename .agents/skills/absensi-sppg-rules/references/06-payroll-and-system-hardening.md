# Absensi SPPG — Referensi 06: Payroll Engine, Guard Architecture & System Hardening

Dokumen ini memuat spesifikasi arsitektur komprehensif untuk modul Payroll, kalkulasi Pajak (PPh 21) & BPJS, implementasi Guard berlapis, manajemen presisi mata uang, serta standardisasi performa lintas platform (Desktop & Android).

---

## 1. Arsitektur Presisi Finansial & Kalkulasi Payroll

### 1.1 Larangan Floating Point (`rust_decimal` Mandatory)
- **DILARANG KERAS** menggunakan tipe data floating-point standar (`f32`, `f64`, atau tipe `number` JavaScript) untuk kalkulasi uang, gaji pokok, tunjangan, potongan, lembur, pajak, atau BPJS.
- **Backend Rust:** Wajib menggunakan crate `rust_decimal` (`Decimal`) dengan rounding strategy `RoundStrategy::MidpointAwayFromZero` atau `BankersRounding` (sesuai regulasi akuntansi keuangan).
- **Frontend / Display:** Hanya gunakan `Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' })` untuk penyajian visual. Jangan lakukan kalkulasi agregasi finansial di JavaScript.

### 1.2 Snapshot Tarif & Versioning Aturan (`tax_rules` & `bpjs_rules`)
- Seluruh persentase, batas PTKP, tarif TER, dan plafon upah BPJS **DILARANG** di-hardcode di dalam kode program.
- Data disimpan dalam tabel aturan dengan kolom `effective_date`:
  - `tax_rules` (kategori TER A, B, C, layer tarif Pasal 17, PTKP TK/0 sampai K/3).
  - `bpjs_rules` (plafon upah JP, plafon upah BPJS Kesehatan, rate JKK, JKM, JHT, JP).
- **Aturan Snapshot:** Setiap kali proses payroll dieksekusi (`payroll_runs`), sistem wajib menyimpan snapshot data tarif dan konfigurasi yang berlaku ke dalam baris/tabel run tersebut.
  - *Rasional:* Jika pemerintah mengubah tarif pajak/BPJS di masa depan, laporan historis payroll bulan-bulan sebelumnya tetap 100% valid dan tidak berubah ketika dibuka kembali.

---

## 2. Regulasi Pajak PPh 21 & BPJS Indonesia

### 2.1 PPh 21 Metode TER & Pasal 17 (PP 58/2023 & PMK 168/2023)
1. **Pemotongan Masa Bulanan (Januari – November):**
   - Menggunakan metode **Tarif Efektif Rata-rata (TER)**.
   - Penentuan Kategori TER berdasarkan status PTKP:
     - **TER A:** TK/0 (54 jt), TK/1 (58,5 jt), K/0 (58,5 jt).
     - **TER B:** TK/2 (63 jt), TK/3 (67,5 jt), K/1 (63 jt), K/2 (67,5 jt).
     - **TER C:** K/3 (72 jt).
   - Nilai potong bulanan = `Bruto Bulanan × Tarif TER (%)`.
2. **Rekonsiliasi Masa Pajak Terakhir (Desember):**
   - Menggunakan tarif progresif **Pasal 17 ayat (1) huruf a UU PPh / UU HPP**:
     - Lapisan 1: s.d. Rp 60.000.000 (5%)
     - Lapisan 2: > Rp 60.000.000 s.d. Rp 250.000.000 (15%)
     - Lapisan 3: > Rp 250.000.000 s.d. Rp 500.000.000 (25%)
     - Lapisan 4: > Rp 500.000.000 s.d. Rp 5.000.000.000 (30%)
     - Lapisan 5: > Rp 5.000.000.000 (35%)
   - Nilai potong Desember = `Total PPh 21 Setahun (Pasal 17) - Total PPh 21 yang Sudah Dipotong (Jan–Nov)`.
3. **Dukungan Insentif:**
   - Disediakan flag `is_dtp` (Ditanggung Pemerintah) per komponen/karyawan untuk industri atau skema khusus.

### 2.2 BPJS Ketenagakerjaan & BPJS Kesehatan
1. **BPJS Ketenagakerjaan:**
   - **Jaminan Hari Tua (JHT):** 5,7% (Karyawan 2%, Perusahaan 3,7%).
   - **Jaminan Pensiun (JP):** 3% (Karyawan 1%, Perusahaan 2%) dengan batas plafon upah maksimal terkonfigurasi.
   - **Jaminan Kecelakaan Kerja (JKK):** 0,24% – 1,74% (sesuai tingkat risiko lingkungan kerja, ditanggung perusahaan).
   - **Jaminan Kematian (JKM):** 0,30% (ditanggung perusahaan).
2. **BPJS Kesehatan:**
   - Total 5% (Karyawan 1%, Perusahaan 4%) dengan batas plafon upah maksimal terkonfigurasi.

---

## 3. Layered Guard Architecture & Defensive Engineering

### 3.1 3-Layer Security Guard
1. **Layer 1 (UI / Frontend):**
   - Wrapper `<AuthGuard>` pada layout Next.js.
   - Hook `useRole()` untuk menyembunyikan aksi/menu di luar wewenang role operator saat ini.
2. **Layer 2 (IPC / Command Guard di Rust):**
   - Setiap `#[tauri::command]` sensitif (seperti kalkulasi payroll, penghapusan data, perubahan shift) wajib memverifikasi permission dan status sesi aktif langsung di Rust sebelum menjalankan logika bisnis.
   - *Prinsip:* Jangan mempercayai frontend karena IPC `invoke()` dapat ditembak langsung via konsol DevTools.
3. **Layer 3 (Database Constraint Guard):**
   - Integritas data dijaga di level schema SQLite/LibSQL:
     - `UNIQUE(karyawan_id, tanggal)` untuk absensi harian.
     - `CHECK(jam_keluar >= jam_masuk OR jam_keluar IS NULL)`.
     - `CHECK(gaji_pokok >= 0)`.
     - Foreign Key constraints dengan cascade yang tepat.

### 3.2 Idempotensi Transaksi & Anti Double-Process
- Proses pembukuan payroll dan koreksi massal wajib menyertakan kunci idempotensi (`idempotency_key` berbasis UUID / run ID + periode).
- Tombol aksi pada UI otomatis dalam kondisi disabled/loading saat proses berjalan. Jika request duplikat terkirim, backend mendeteksi transaksi yang sedang berjalan atau sudah selesai dan mengembalikan status tanpa memproses ulang.

### 3.3 State Machine Alur Approval
- Alur persetujuan dokumen/payroll: `Draft -> Submitted -> Reviewed -> Approved -> Paid / Locked`.
- Di Rust, transisi state dikelola dengan `enum` dan `match` yang exhaustive untuk mencegah bypass alur:
  ```rust
  pub enum PayrollStatus {
      Draft,
      Submitted,
      Reviewed,
      Approved,
      Paid,
      Rejected,
  }
  ```
- Setiap perpindahan status mencatat event ke tabel `audit_logs` (user ID, timestamp, status lama, status baru, catatan).

---

## 4. Performa & Optimasi Klien

### 4.1 Virtualisasi List Data Besar
- Tabel dengan volume baris besar (data absensi harian, master log scan, histori koreksi) wajib menggunakan `@tanstack/react-virtual` atau `@tanstack/react-table`.
- DOM hanya merender elemen yang terlihat di viewport pengguna untuk menjaga rendering tetap 60 FPS dan penggunaan RAM rendah.

### 4.2 SQLite WAL Mode & Bounded Connections
- Konfigurasi SQLite lokal di Rust wajib mengaktifkan:
  - `PRAGMA journal_mode = WAL;` (Write-Ahead Logging untuk konkurensi optimal).
  - `PRAGMA synchronous = NORMAL;` (Keseimbangan performa I/O dan durabilitas data).
  - `PRAGMA foreign_keys = ON;` (Menegakkan integritas relasi).

---

## 5. Platform Polish (Desktop & Android APK)

### 5.1 Desktop Windows/Mac/Linux
- **Single Instance:** Menggunakan `tauri-plugin-single-instance` agar aplikasi absensi/kiosk tidak dapat dibuka berlapis yang berisiko merusak sinkronisasi lokal.
- **Window State Retention:** Mengingat posisi dan ukuran jendela terakhir pengguna.
- **Direct Printing:** Dukungan pencetakan slip gaji/laporan langsung ke printer fisik atau export PDF.

### 5.2 Android Mobile APK
- **Lifecycle & Background Sync Reality:**
  - Android OS dapat mematikan proses latar belakang secara agresif untuk hemat baterai.
  - Arsitektur sinkronisasi tidak boleh bergantung 100% pada background alarm terus-menerus.
  - Sinkronisasi wajib dipicu saat aplikasi dibuka (`onResume` / `focus`), sebelum aksi penting, dan setelah koneksi internet pulih.
- **Graceful Permission Degradation:**
  - Penolakan izin kamera, GPS, atau biometrik tidak boleh membuat aplikasi crash.
  - Sediakan UI dialog ramah yang menjelaskan alasan izin dibutuhkan dan sediakan alur alternatif yang aman.
