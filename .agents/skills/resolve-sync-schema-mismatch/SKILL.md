---
name: resolve-sync-schema-mismatch
description: Diagnosa dan atasi error ketidakcocokan versi skema sinkronisasi client-cloud (SCHEMA_VERSION_OUTDATED), lakukan audit paritas 4 lapisan skema (DDL lokal, DDL cloud, outbox, Web), verifikasi fitur baru yang belum tersinkronisasi, dan selaraskan kejelasan pesan error di aplikasi Desktop dan Mobile.
---

# Resolve Sync Schema Mismatch & 4-Layer Parity Audit

Panduan operasional dan standar rekayasa untuk mendiagnosis, memverifikasi, dan menyelesaikan kegagalan sinkronisasi yang disebabkan oleh perbedaan versi skema antara database cloud dan klien offline-first (Desktop / Mobile), serta memastikan tidak ada fitur baru yang tertinggal atau luput dari sinkronisasi.

---

## 1. Nama Singkat (Action-Oriented)
`resolve-sync-schema-mismatch`

---

## 2. Deskripsi & Trigger Presisi

### Kapan Skill Ini WAJIB Dipakai:
- Aplikasi Desktop atau Mobile memunculkan pesan error sinkronisasi:
  `"Aplikasi perlu diperbarui. Skema database cloud sudah versi X, sedangkan aplikasi ini hanya mendukung versi Y. Pengiriman data dihentikan agar kolom versi baru tidak tertimpa data lama."`
- Kode error `SCHEMA_VERSION_OUTDATED` muncul pada status sinkronisasi atau outbox queue.
- Terjadi penambahan tabel baru, kolom baru, atau migrasi skema di cloud yang membuat klien offline menolak push/pull.
- Pengguna khawatir ada fitur baru yang belum ikut tersinkronisasi setelah pembaruan versi skema.
- Pesan error sinkronisasi di Desktop tidak jelas, tertelan, atau menampilkan sukses semu padahal ada `pushError`.

### Kalimat Trigger Pengguna:
- *"Sinkronisasi gagal, katanya skema cloud sudah versi 32 tapi aplikasi cuma versi 31."*
- *"Muncul error SCHEMA_VERSION_OUTDATED di desktop/mobile."*
- *"Tolong cek apakah ada fitur baru yang belum ikut tersinkronisasi sebelum menaikkan versi skema."*
- *"Pesan error sinkronisasi di versi desktop tolong dibikin jelas seperti di mobile."*
- *"Antrean outbox nyangkut karena beda versi skema aplikasi dan server."*

### Kapan Skill Ini DILARANG Dipakai:
- Masalah murni koneksi jaringan (misal: DNS down, URL Turso/LibSQL salah, auth token kedaluwarsa tanpa error versi skema).
- Error validasi payload tunggal (misal: format nomor telepon salah, gambar melebihi batas ukuran).
- Bug logika frontend murni yang tidak berhubungan dengan outbox, push/pull, atau konstanta skema.
- Pembuatan fitur baru dari nol yang belum menyentuh fase sinkronisasi database.

---

## 3. Instruksi Langkah Demi Langkah (Step-by-Step Instructions)

### Langkah 1: Investigasi Nilai Versi Skema di Kode Sumber
1. Cek `CURRENT_SCHEMA_VERSION` di file skema Web (contoh: `src/lib/db-schema.ts`).
2. Cek riwayat migrasi dan versi migrasi tertinggi di file migrasi (contoh: `src/lib/db-migrations.ts`).
3. Cek `CLIENT_SCHEMA_VERSION` di backend Rust Desktop (contoh: `src-tauri/src/desktop/sync.rs`).
4. Cek `CLIENT_SCHEMA_VERSION` di backend Rust Mobile (contoh: `mobile/src-tauri/src/mobile/sync.rs`).
5. Bandingkan angka-angka tersebut untuk mengetahui selisih versi (misal: Cloud/Web = 32, Rust Klien = 31).

### Langkah 2: Audit Fitur Baru pada Versi Skema Tersebut (Zero-Guesswork)
Sebelum menaikkan angka versi, telusuri apa persisnya yang ditambahkan pada migrasi versi tersebut:
1. Baca DDL migrasi versi target (misal v32 menambahkan tabel `personil_foto`).
2. Periksa apakah tabel/kolom tersebut sudah terpasang di **4 Lapisan Wajib**:
   - **Lapisan 1 (SQLite Lokal)**: Terdaftar di `storage.rs` (DDL `CREATE TABLE` dan daftar tabel SQLite lokal).
   - **Lapisan 2 (DDL Cloud & Push Handler)**: Terdaftar di `turso.rs` (DDL cloud dan match handler `(domain, operation)`).
   - **Lapisan 3 (Outbox & Snapshot)**: Terdaftar di `sync.rs` (rute kanonik dan `SNAPSHOT_TABLES`, atau documented selective sync per Aturan Foto/Media).
   - **Lapisan 4 (Skema Web & Zod)**: Terdaftar di `db-schema.ts`, `db-migrations.ts`, dan `sync-schema.ts` (`z.object().strict()`).
3. Periksa apakah IPC command Rust dan gateway frontend sudah tersedia untuk entitas baru tersebut.
4. Jalankan audit otomatis:
   ```bash
   bun run audit:contract
   bun run audit:schema
   ```

### Langkah 3: Susun Implementation Plan & Konfirmasi ke Pengguna
1. Buat dokumen `implementation_plan.md` yang memaparkan:
   - Akar masalah selisih versi skema.
   - Hasil audit 4 lapisan yang membuktikan ada/tidaknya fitur yang tertinggal.
   - Rencana perubahan minimal (file mana yang diubah dan baris persisnya).
2. Tunggu persetujuan eksplisit dari pengguna sebelum mengubah file kode.

### Langkah 4: Terapkan Perubahan Versi Skema
1. Ubah `pub const CLIENT_SCHEMA_VERSION: i64 = <VERSI_BARU>;` di `web-desktop/src-tauri/src/desktop/sync.rs`.
2. Jangan edit file mobile secara manual. Jalankan generator sinkronisasi kode bersama:
   ```bash
   bun run sync:mobile
   ```
3. Verifikasi bahwa `CLIENT_SCHEMA_VERSION` di `mobile/src-tauri/src/mobile/sync.rs` sudah otomatis ter-update.

### Langkah 5: Perjelas Pesan Error Sinkronisasi di Desktop (Paritas Mobile)
1. Periksa komponen kartu sinkronisasi desktop (contoh: `SinkronisasiDesktopCard.tsx`):
   - Pastikan menampilkan `syncStatus?.pushError` secara eksplisit jika ada, bukan hanya `autoSyncError`.
   - Gunakan judul kontekstual: `"Data cloud berhasil ditarik, tetapi antrean kirim gagal"`.
2. Periksa fungsi pemicu sinkronisasi di halaman Pengaturan:
   - Pastikan jika `status?.pushError` bernilai truthy, sistem menampilkan notifikasi error (bukan notifikasi sukses semu).

### Langkah 6: Jalankan Verifikasi Penuh Bertingkat
1. Jalankan audit kontrak: `bun run audit:contract` (Wajib Lulus).
2. Jalankan audit skema: `bun run audit:schema` (Wajib Lulus).
3. Jalankan linter, typecheck, dan tes: `bun run check:quick` (Wajib Lulus).

---

## 4. Rules & Constraints

1. **JANGAN PERNAH menaikkan `CLIENT_SCHEMA_VERSION` tanpa memeriksa 4 lapisan**: Menaikkan konstanta secara serampangan pada klien yang belum memiliki tabel/kolom baru akan memicu kegagalan push permanen (*permanent outbox jam*) saat klien mencoba menulis kolom yang belum ada.
2. **Haram Mengedit Langsung File Mobile**: Seluruh kode bersama Rust di `mobile/` adalah hasil dari `bun run sync:mobile`. Mengeditnya manual akan hilang tertimpa saat build berikutnya.
3. **Patuhi Aturan 42 (Selective Sync vs Snapshot)**: Tabel dengan payload media berat (seperti `personil_foto`, `absensi_foto`, `siswa_foto`) SENGAJA di luar `SNAPSHOT_TABLES` agar pull rutin ringan. Tetapi mutasi lokalnya WAJIB masuk antrean outbox push.
4. **Anti-Sukses Semu**: Jika penarikan data (pull) berhasil tetapi pengiriman (push) gagal, status UI DILARANG melaporkan "Sinkronisasi Berhasil". Wajib laporkan "Data cloud berhasil ditarik, tetapi antrean kirim gagal" beserta detail error dari server.
5. **Dilarang Melonggarkan Audit**: DILARANG mengubah skrip audit (`audit-sync-contract.ts`, `schema-audit.ts`) demi meloloskan pengujian secara palsu.

---

## 5. Output Format

Setelah menyelesaikan task, hasilkan laporan terstruktur dengan format berikut:

```markdown
### 1. Diagnosis Selisih Versi
- Versi Skema Cloud / Web: `v<X>` (via `CURRENT_SCHEMA_VERSION` / `schema_migration`)
- Versi Skema Klien Rust: `v<Y>` (via `CLIENT_SCHEMA_VERSION`)
- Status Error: `SCHEMA_VERSION_OUTDATED` terpicu pada guard `assert_cloud_schema_compatible`.

### 2. Hasil Audit Paritas 4 Lapisan Fitur v<X>
- Entitas Baru: `<nama_tabel>` (<deskripsi_fitur>)
- Lapisan 1 (SQLite Lokal): [Hadir / Absen] di `storage.rs`
- Lapisan 2 (DDL Cloud & Push Handler): [Hadir / Absen] di `turso.rs`
- Lapisan 3 (Outbox & Snapshot): [Hadir / Absen] di `sync.rs` (Status: Snapshot / Selective Sync)
- Lapisan 4 (Skema Web & Zod): [Hadir / Absen] di `db-schema.ts` & `sync-schema.ts`
- Kesimpulan Audit: Tidak ada fitur baru yang tertinggal / belum tersinkronisasi.

### 3. Perubahan Kode
- File Diubah: `<path/to/sync.rs>` (`CLIENT_SCHEMA_VERSION = <X>`)
- Propagasi Mobile: Dijalankan via `bun run sync:mobile`
- Peningkatan UI: Pesan error push gagal kini ditampilkan transparan di antarmuka Desktop.

### 4. Hasil Verifikasi
- `bun run audit:contract`: LULUS (X rute kanonik, Y tabel snapshot, Z command, W permission)
- `bun run audit:schema`: LULUS (A tabel cloud, B tabel lokal, C tabel web)
- `bun run check:quick`: LULUS (Linter, Typecheck, Unit Test)
```

---

## 6. Contoh Nyata (End-to-End Example)

### Masukan (User Input):
> *"Sinkronisasi di Desktop gagal. Statusnya: 'Aplikasi perlu diperbarui. Skema database cloud sudah versi 32, sedangkan aplikasi ini hanya mendukung versi 31. Pengiriman data dihentikan agar kolom versi baru tidak tertimpa data lama.' Tolong periksa dulu apakah ada fitur baru yang belum ikut tersinkronisasi, lalu buatkan implementation plan sebelum ubah kode."*

### Langkah Eksekusi AI:
1. Membaca `CURRENT_SCHEMA_VERSION = 32` di `db-schema.ts`.
2. Membaca migrasi v32 di `db-migrations.ts`: `PERSONNEL_PHOTO_MIGRATION_VERSION = 32` (`personil_foto`).
3. Menemukan `CLIENT_SCHEMA_VERSION = 31` di `web-desktop/src-tauri/src/desktop/sync.rs`.
4. Mengaudit `personil_foto` di 4 lapisan:
   - DDL lokal ada di `storage.rs:1146`.
   - DDL cloud & push handler ada di `turso.rs:2681` & `turso.rs:7749`.
   - Outbox validator ada di `sync-schema.ts:1092`.
   - IPC commands ada di `academic.rs:2395`.
   - UI ada di `PersonnelPhotoField.tsx` dan `id-cards/page.tsx`.
5. Menjalankan `bun run audit:schema` dan `bun run audit:contract` (Keduanya LULUS).
6. Membuat `implementation_plan.md` dan menunggu persetujuan pengguna.
7. Setelah disetujui, mengubah `CLIENT_SCHEMA_VERSION: i64 = 32;` di `sync.rs`.
8. Menjalankan `bun run sync:mobile`.
9. Memperbarui `SinkronisasiDesktopCard.tsx` dan `settings/page.tsx` agar menampilkan `pushError` secara detail jika terjadi kegagalan parsial.
10. Menjalankan `bun run check:quick` (Semua tes hijau).

---

## 7. Failure Modes & Mitigasi

| Failure Mode | Penyebab Utama | Cara Mencegah / Mitigasi |
| :--- | :--- | :--- |
| **1. Permanent Outbox Jam** | Menaikkan versi skema di Klien padahal DDL lokal atau Zod validator belum memuat tabel/kolom baru. Klien menulis data cacat, lalu ditolak cloud selamanya. | WAJIB jalankan `bun run audit:schema` dan cek keberadaan kolom di 4 lapisan SEBELUM menaikkan `CLIENT_SCHEMA_VERSION`. |
| **2. Mobile Code Drift** | Mengedit file `mobile/src-tauri/src/mobile/sync.rs` langsung dengan editor file tanpa menjalankan generator sinkronisasi. | DILARANG edit file mobile. Selalu ubah di `web-desktop` lalu jalankan `bun run sync:mobile`. |
| **3. False Success Feedback** | Frontend hanya memeriksa apakah request IPC selesai tanpa memeriksa isi properti `pushError`. Pengguna mengira data terkirim padahal antrean tertahan. | Periksa `status?.pushError`. Jika ada isinya, tampilkan banner peringatan merah dan jelaskan bahwa data lokal tertahan. |
| **4. Linter / Formatter Biome Failure** | Menulis format tag JSX atau urutan import secara sembarang saat mengedit komponen UI error. | Ikuti sorting import Biome (komponen UI di atas lib, type terpisah) dan jalankan `bun run check:quick` untuk auto-cek. |
| **5. Mengabaikan Tabel di Luar Snapshot** | Mengira tabel baru hilang dari sinkronisasi karena tidak ada di `SNAPSHOT_TABLES`, lalu memasukkannya ke snapshot sehingga startup aplikasi membengkak. | Pahami Rule 42: Tabel media/foto memang SENGAJA di luar `SNAPSHOT_TABLES` (selective sync via outbox push + on-demand fetch). |
