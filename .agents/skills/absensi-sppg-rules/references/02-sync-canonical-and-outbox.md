# Modul Kontrak Sinkronisasi Kanonik, Outbox & Idempotensi

Dokumen ini mendefinisikan kontrak resmi komunikasi sinkronisasi dua arah antara klien (Desktop/Mobile SQLite) dan Turso Cloud LibSQL Pipeline (`/v2/pipeline`).

---

## 1. 57 Route Kanonik Outbox (The 57 Canonical Hyphen Routes)

Hanya 57 pasangan `(domain, operation)` berikut yang diizinkan untuk diproduksi oleh outbox dan diproses oleh consumer backend/Turso:

```text
1.  academic-assignment/create       20. backup/create                    39. payroll/bpjs-rule
2.  academic-assignment/delete       21. company-profile/update           40. payroll/create-run
3.  academic-class/create            22. correction/create                41. payroll/delete
4.  academic-class/delete            23. correction/delete                42. payroll/overtime-rule
5.  academic-class/update            24. employee/create                  43. payroll/payroll-component
6.  academic-department/create       25. employee/status                  44. payroll/salary-config
7.  academic-department/delete       26. employee/token                   45. payroll/tax-rule
8.  academic-department/update       27. employee/update                  46. payroll/transition-status
9.  academic-subject/create          28. holiday/create                   47. setting/update
10. academic-subject/delete          29. holiday/delete                   48. setting/upsert
11. academic-subject/update          30. holiday/update                   49. shift/create
12. academic-year/create             31. holiday-whitelist/create         50. shift/delete
13. academic-year/delete             32. holiday-whitelist/delete         51. shift/update
14. academic-year/update             33. holiday-whitelist/update         52. student/create
15. attendance/create                34. id-card/update                   53. student/delete
16. attendance/delete                35. id-card-template/save            54. student/update
17. attendance/scan                  36. log-scan/delete                  55. teacher/create
18. attendance/update                37. offline-import/delete            56. teacher/delete
19. backup/cancel                    38. offline-import/row               57. teacher/update
```

### Aturan Penamaan & Boundary Compatibility:
- **Format Kanonik:** Seluruh nama domain majemuk menggunakan format **hyphen-case** (misal: `company-profile`, `id-card-template`, `offline-import`, `log-scan`, `academic-year`, `academic-department`, `academic-class`, `academic-subject`, `academic-assignment`).
- **Normalisasi Boundary:** Alias lama seperti `company_profile`, `id_card_template`, `offline_import`, atau `scan_log` HANYA dinormalisasi pada pintu masuk boundary Turso.
- Setelah normalisasi, nama yang disimpan ke `sync_changelog` dan `sync_operation_receipt` **WAJIB berbentuk nama kanonik**.

---

## 2. Struktur Payload & Integritas Entity Key

### Aturan Validasi Input:
1. **JSON Object Wajib:** Payload outbox wajib berupa JSON Object yang valid. Nilai primitif (`string`, `number`, `boolean`, `null`, `array`) di tingkat root payload HARUS ditolak.
2. **Entity Key sebagai Sumber Identitas Resmi:**
   - Untuk operasi `update`, `status`, dan `delete`, kolom `entity_key` pada antrean outbox adalah identitas resmi record yang dimutasi.
   - Field ID di dalam payload hanya diperlakukan sebagai override yang telah divalidasi.
3. **Batas Ukuran Payload:**
   - Field string biasa: `shortText` (maks 255 karakter), `longText` (maks 8192 karakter).
   - Field gambar/elemen besar: `assetText` (maks 10MB = `10_485_760` karakter).
   - Route handler HTTP wajib membatasi JSON body maksimal 25MB (`25_165_824` byte).

---

## 3. Atomisitas Transaksi & Idempotensi Receipt

### Standar Transaksi Cloud (`BEGIN IMMEDIATE`):
Setiap batch event yang di-push ke Turso dijalankan dalam satu blok transaksi atomik:
1. Validasi route kanonik & payload schema via Zod.
2. Cek apakah receipt event sudah ada di `sync_operation_receipt`.
   - Jika `event_id` sudah ada dan payload identik: kembalikan receipt lama (idempoten).
   - Jika `event_id` sama tetapi payload berbeda: tolak sebagai **Event Collision**.
3. Evaluasi mutasi SQL:
   - **DILARANG** menandai event sebagai `applied` jika tidak ada statement mutasi SQL yang dihasilkan (`mutations.is_empty()`). Mutasi kosong wajib ditandai `conflict`/`rejected`.
4. Eksekusi `BEGIN IMMEDIATE`:
   - Eksekusi seluruh statement mutasi target.
   - Insert ke `sync_changelog` untuk mencatat revisi baru.
   - Insert ke `sync_operation_receipt` dengan status `applied` dan `serverRevision > 0`.
   - `COMMIT` bersama atau `ROLLBACK` jika ada error.

---

## 4. Urutan Siklus Sinkronisasi Resmi

Proses sinkronisasi lokal ke cloud WAJIB mematuhi urutan berikut tanpa dibalik:
```text
1. Mutasi data lokal + catat outbox dalam 1 transaksi SQLite lokal
2. Push batch outbox lokal ke Turso Cloud
3. Verifikasi respons push (seluruh item wajib memiliki serverRevision > 0)
4. Tandai antrean outbox lokal sebagai synced / conflict
5. Probe `sync_pulse` cloud; tarik HANYA tabel yang revisinya berbeda
6. Terapkan snapshot ke database SQLite lokal dalam 1 transaksi
7. Broadcast event browser 'sppg:sync-completed' ke UI bila ada baris berubah
```

Kegagalan langkah 2-4 TIDAK BOLEH membatalkan langkah 5-6. Satu event outbox
bermasalah atau gangguan jaringan sesaat pernah membuat pull ikut mati, sehingga
perangkat berhenti menerima data cloud sama sekali. `sync::synchronize` kini
menyimpan kegagalan push ke `DesktopSyncStatus.push_error`, membiarkan backoff
outbox bekerja, lalu tetap menjalankan pull.

### 4.1 Pull Inkremental via `sync_pulse`

- Tabel cloud `sync_pulse (table_name, revision, updated_at)` menyimpan penghitung
  perubahan per tabel. Nilainya dinaikkan oleh **trigger SQLite** `AFTER
  INSERT/UPDATE/DELETE` yang dipasang `TursoClient::ensure_sync_pulse`.
- Karena penghitung dinaikkan di level database, penulisan dari jalur mana pun
  ikut terdeteksi: push Desktop/Mobile, route handler Web yang menulis langsung
  ke Turso, maupun perubahan manual. Probe berbasis `MAX(sync_changelog.id)`
  saja TIDAK cukup — jalur Web tidak menulis ke changelog.
- Client menyimpan nilai terakhir yang berhasil diterapkan di tabel lokal
  `desktop_sync_table_cursor`. Bila seluruh tabel cocok, siklus sync selesai
  tanpa menarik satu baris pun.
- Kunci payload yang **tidak dikirim** berarti "tabel ini tidak berubah", BUKAN
  "tabel ini kosong". `apply_table` wajib berhenti lebih awal untuk kunci yang
  absen, termasuk melewatkan blok `delete_missing`.
- Menambah tabel snapshot baru WAJIB didaftarkan di KEDUA tempat: `SNAPSHOT_TABLES`
  di `sync.rs` DAN `SNAPSHOT_SOURCES` di `turso.rs:625`. `SNAPSHOT_SOURCES` adalah sumber
  tunggal untuk menyusun query SELECT snapshot pembacaan Turso DAN memasang trigger SQLite
  `sync_pulse` di cloud. Jika absen di `SNAPSHOT_SOURCES`, klien tidak pernah menarik tabel
  tersebut dan mutasi Web tidak memicu pulsa sinkronisasi.

### 4.1.1 Yang TIDAK Boleh Ikut Sinkronisasi

- **Kunci koneksi perangkat.** `turso_database_url`, `turso_auth_token`, dan
  `server_api_base_url` tinggal di tabel `setting_gex_system` yang ikut snapshot.
  Daftarnya ada di `sync::DEVICE_LOCAL_SETTING_KEYS`; `enqueue` menolaknya dan
  `apply_table` melewatkannya. Tanpa ini, "Kirim ulang pengaturan lokal" pernah
  mendorong URL database satu perangkat ke cloud, lalu perangkat lain menariknya
  dan `DesktopState::load` mengarahkan aplikasi ke database yang salah.
- **Baris tarif default payroll.** `payroll_seed::DEFAULT_RATE_IDS` dikecualikan
  dari backfill outbox. Baris itu sudah disediakan seed di kedua sisi; kalau ikut
  didorong, instalasi baru akan menimpa tarif yang sudah disesuaikan admin.

### 4.1.2 Tarif Default Payroll Punya Satu Sumber

- `overtime_tier_rules`, `tax_rules`, dan `bpjs_rules` di-seed dari
  `desktop/payroll_seed.rs` (disalin ke Mobile oleh `sync-rust-modules.ts`),
  dipakai `storage.rs` untuk SQLite lokal DAN `turso.rs` untuk cloud.
- DILARANG menulis ulang `INSERT OR IGNORE INTO <tabel tarif>` di berkas lain —
  `bun run audit:contract` menolaknya. Dulu lokal memakai id bertanda hubung
  (`tax-p17-1`, `bpjs-jkk`, tarif JKK 0.24, berlaku 2024) sedangkan cloud memakai
  garis bawah (`tax_p17_1`, `bpjs_jkk_co`, JKK 0.54, berlaku 2026). Akibatnya:
  bracket PASAL_17 dobel di cloud, TER tidak pernah ada di lokal, dan push BPJS
  selalu gagal karena `component_code` UNIQUE sudah dipakai baris cloud ber-id
  lain — event outbox itu macet permanen.

### 4.2 Lewati Baris yang Tidak Berubah

- `apply_table` menghitung SHA-256 per baris (nama tabel ikut di-hash) dan
  membandingkannya dengan `desktop_entity_revision.payload_hash` yang dimuat
  sekali per snapshot. Baris identik dilewati tanpa satu pun penulisan.
- Pengecualian: bila tabel lokal kosong sementara server mengirim baris, cache
  hash tidak dipercaya dan seluruh tabel ditulis ulang sekali agar drift sembuh.
- Pemeriksaan "baris ini punya antrean outbox" juga dimuat sekali ke memori
  (`PendingGuard`), bukan 1-4 query per baris seperti versi lama.

---

## 5. Proteksi Cloud Kosong (Empty-Cloud Safety)

### Masalah Historis:
- Sebelumnya, algoritma `delete_missing` pada saat sync snapshot dapat menghapus seluruh data lokal legacy jika database cloud Turso yang baru masih kosong.

### Guard Pencegahan Wajib:
- Snapshot `delete_missing` HANYA BOLEH menghapus baris lokal yang terbukti memiliki catatan `desktop_entity_revision` (artinya baris tersebut memang pernah diunduh dari cloud).
- Baris lokal legacy yang belum memiliki revision cloud **TIDAK BOLEH DIHAPUS**.
- Baris lokal yang memiliki antrean outbox berstatus `pending` atau `conflict` **TIDAK BOLEH DITIMPA ATAU DIHAPUS** oleh snapshot.

---

## Pemicu Siklus Sinkronisasi (siapa yang menguras outbox)

Mesin sinkronisasi **tidak** punya loop latar di Rust. Yang menjalankannya:

| Pemicu | Kapan |
| :-- | :-- |
| `AutoSyncRunner` | 12 dtk bila ada antrean, 30 dtk idle, 90 dtk saat jendela tersembunyi, backoff sampai 5 menit |
| `desktop_login` | sekali per login, dan HANYA bila operatornya punya `sync.view` |
| Lima perintah pengaturan | `update_scan_security`, `update_geofence_settings`, `update_scanner_settings`, `update_app_display_name`, `save_alfa_settings` |
| `requestSyncNow()` | dipancarkan halaman setelah mutasi penting — termasuk setiap scan absensi yang berhasil |

**Absensi tidak memicu push di Rust.** Ia mengandalkan `AutoSyncRunner`, jadi
halaman scanner WAJIB memanggil `requestSyncNow()` setelah scan berhasil —
lepas dari alur scan (tanpa `await`) supaya tidak menambah waktu respons
terminal. Throttle 5 detik di runner menjaga antrean jam masuk tidak berubah
menjadi badai siklus.

### `navigator.onLine` TIDAK berlaku di Mode Database Lokal

`AutoSyncRunner` melewatkan siklus ketika peramban melapor offline — benar untuk
mode cloud, karena round-trip-nya pasti gagal. Di `local_file` penjagaan itu
SALAH dan pernah menjadi bug diam:

- "Cloud"-nya adalah berkas `sppg-hub.db` di perangkat yang sama, jadi push adalah operasi **berkas**, bukan jaringan.
- Mesin yang benar-benar terputus justru kasus penggunaan utama mode ini.
- Akibatnya outbox tidak pernah terkuras, hub tertinggal, lalu `export_database` dan promosi ke cloud — keduanya membaca **hub** — kehilangan data tanpa satu pun pesan error.

Benderanya dibawa `DesktopSyncStatus.local_mode` (bukan lewat
`desktop_get_database_config`, yang menuntut `settings.view` + Superadmin
sementara siklus otomatis berjalan untuk SETIAP peran termasuk `scanner`), dan
disemai sekali saat mount lewat `getSyncStatus()` supaya siklus PERTAMA pun
sudah tahu jawabannya.

> `models.rs` TIDAK ikut disalin `sync-rust-modules.ts` sedangkan `sync.rs` ikut.
> Setiap field baru pada `DesktopSyncStatus` wajib ditambahkan manual di
> `mobile/src-tauri/src/mobile/models.rs`, atau build Mobile gagal begitu
> salinan `sync.rs` yang baru masuk.

---

## 6. Larangan UNIQUE Constraint pada Kolom Bisnis Tabel Sinkronisasi

### Dampak Fatal Constraint Unik di Sinkronisasi:
- Pada arsitektur offline-first multi-perangkat, dua operator dapat mendaftarkan entitas bisnis yang sama secara independen dalam kondisi offline (misal: dua operator memasukkan siswa dengan NIS atau NISN yang sama, atau mendaftarkan kode mapel yang sama).
- Jika kolom bisnis tersebut dipasangi `UNIQUE` constraint pada DDL database (SQLite lokal maupun LibSQL cloud):
  1. Perangkat pertama berhasil melakukan push outbox ke cloud.
  2. Perangkat kedua gagal melakukan push outbox karena bentrok constraint `UNIQUE`.
  3. Status event di outbox berubah menjadi `failed` dengan `next_retry_at = NULL` (`sync.rs:2035`).
  4. Antrean sinkronisasi pada perangkat kedua macet permanen sampai ada intervensi database manual.

### Standar Penegakan Keunikan (Application-Layer Unique Checks):
- Seluruh tabel yang ikut disinkronkan DILARANG memiliki `UNIQUE` constraint pada kolom bisnis selain Primary Key.
- Penegakan keunikan wajib dilakukan di **lapisan aplikasi**:
  - Di Rust: periksa keberadaan entitas sebelum mutasi (`assert_unique`).
  - Di TypeScript: periksa keberadaan duplikat pada service sebelum eksekusi SQL.
  - Berikan pesan error yang ramah dan informatif ke pengguna, bukan membiarkan database menolak transaksi secara kasar di level driver.

---

## 7. Idempotensi Handler Cloud & Status Aktif Tunggal

### Anomali Status Aktif Ganda di Cloud:
- Entitas yang hanya boleh memiliki satu baris aktif dalam satu waktu (misalnya `akademik_tahun_ajaran.is_aktif = 1`) rawan mengalami status aktif ganda jika klien hanya meng-enqueue mutasi untuk baris yang diaktifkan.
- Jika klien menjalankan `UPDATE ... SET is_aktif = 0` secara lokal saja lalu hanya meng-enqueue event `academic-year/update` untuk tahun baru yang diaktifkan, maka Turso Cloud tidak pernah mengetahui bahwa tahun ajaran lama harus dimatikan. Hasilnya: cloud memiliki dua baris dengan `is_aktif = 1`.

### Solusi Idempoten Wajib di Handler Cloud:
- Handler cloud untuk domain terkait WAJIB idempoten dan mematikan record aktif lainnya dalam transaksi atomik yang sama:
  ```sql
  -- Saat is_aktif = 1
  UPDATE akademik_tahun_ajaran SET is_aktif = 0 WHERE id_tahun_ajaran <> ?;
  UPDATE akademik_tahun_ajaran SET is_aktif = 1 WHERE id_tahun_ajaran = ?;
  ```

---

## 8. Atomisitas Mutasi Multi-Tabel & Perlindungan Anti-Zombie Resurrection

### Gejala Zombie Resurrection:
- Entitas personil (`guru_data`, `siswa_data`) berelasi 1-to-1 dengan `master_data`.
- Jika operasi `delete_student` atau `delete_teacher` hanya menghapus baris di tabel profil anak (`siswa_data`) atau hanya mengubah status lokal tanpa memperbarui status di `master_data` (`status_aktif = 'Nonaktif'`) di cloud:
  1. Baris `master_data` di cloud tetap berstatus `Aktif`.
  2. Karena `master_data` ikut snapshot dengan `delete_missing: false`, siklus pull snapshot berikutnya akan menarik kembali `master_data` berstatus `Aktif`.
  3. Personil yang telah dinonaktifkan/dihapus bangkit kembali ("zombie resurrection") dan kartu QR-nya kembali dapat digunakan untuk scan absensi.

### Aturan Mutasi Relasional Wajib:
1. **Atomisitas Mutasi:** Penonaktifan personil WAJIB memperbarui `master_data.status_aktif = 'Nonaktif'` dan tabel profil dalam satu transaksi atomik.
2. **Paritas Handler Cloud:** Handler cloud DILARANG meng-hardcode `status_aktif = 'Aktif'` pada operasi upsert dan DILARANG menghilangkan kolom relasi penting (`id_shift`, `no_hp`, `lp`).
3. **Audit Konsistensi:** Setiap mutasi relasional wajib memiliki tes integrasi yang memverifikasi bahwa penonaktifan di satu sisi tidak dibatalkan oleh snapshot pull di sisi lain.
