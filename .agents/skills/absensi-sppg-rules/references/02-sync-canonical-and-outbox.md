# Modul Kontrak Sinkronisasi Kanonik, Outbox & Idempotensi

Dokumen ini mendefinisikan kontrak resmi komunikasi sinkronisasi dua arah antara klien (Desktop/Mobile SQLite) dan Turso Cloud LibSQL Pipeline (`/v2/pipeline`).

---

## 1. 37 Route Kanonik Outbox (The 37 Canonical Hyphen Routes)

Hanya 37 pasangan `(domain, operation)` berikut yang diizinkan untuk diproduksi oleh outbox dan diproses oleh consumer backend/Turso:

```text
1.  attendance/create            20. id-card-template/save
2.  attendance/delete            21. id-card/update
3.  attendance/scan              22. log-scan/delete
4.  attendance/update            23. offline-import/delete
5.  backup/cancel                24. offline-import/row
6.  backup/create                25. payroll/bpjs-rule
7.  company-profile/update       26. payroll/create-run
8.  correction/create            27. payroll/delete
9.  correction/delete            28. payroll/overtime-rule
10. employee/create              29. payroll/payroll-component
11. employee/status              30. payroll/salary-config
12. employee/token               31. payroll/tax-rule
13. employee/update              32. payroll/transition-status
14. holiday-whitelist/create     33. setting/update
15. holiday-whitelist/delete     34. setting/upsert
16. holiday-whitelist/update     35. shift/create
17. holiday/create               36. shift/delete
18. holiday/delete               37. shift/update
19. holiday/update
```

### Aturan Penamaan & Boundary Compatibility:
- **Format Kanonik:** Seluruh nama domain majemuk menggunakan format **hyphen-case** (misal: `company-profile`, `id-card-template`, `offline-import`, `log-scan`).
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
- Menambah tabel snapshot baru cukup di `SNAPSHOT_SOURCES` (turso.rs) — daftar
  itu sekaligus menentukan tabel mana yang dipasangi trigger pulse.

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
