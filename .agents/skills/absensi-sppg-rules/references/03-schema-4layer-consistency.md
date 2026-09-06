# Modul Konsistensi Skema 4-Layer & Struktur Data

Dokumen ini mengatur arsitektur konsistensi skema database lintas platform agar tidak terjadi *schema drift* antara klien Desktop, klien Mobile, Cloud LibSQL, dan validator TypeScript.

---

## 0. Satu Database Cloud, Dua Jalur Provisioning

Database Turso yang sama bisa lahir dari dua implementasi berbeda:

| Jalur | Berkas | Kapan berjalan |
|---|---|---|
| Desktop / Mobile | `src-tauri/src/<root>/turso.rs` → `ensure_schema()` | Bootstrap Superadmin, link database, dan `ensure_schema_current()` pada sync pertama |
| Web | `src/lib/db-schema.ts` → `initDatabaseSchema()` + `db-migrations.ts` | Saat route handler Web menyentuh database |

**`CREATE TABLE IF NOT EXISTS` tidak pernah memperbaiki tabel yang sudah ada.**
Karena itu tabel atau kolom yang berbeda antara dua jalur merusak jalur yang
tidak membuatnya, secara permanen. Kejadian nyata sebelum perbaikan:

- `app_session` dan `auth_login_rate_limit` dibuat Rust dengan kolom karangan
  sendiri (`last_activity_at`, `identifier_hash`), padahal keduanya DIMILIKI Web
  (`src/lib/auth/session-store.ts`, `login-rate-limit.ts`) dan Rust tidak pernah
  membacanya → login Web gagal total di database hasil provisioning Desktop/Mobile.
- `sync_change_log` dan `role_permission_audit` hanya dibuat jalur Web → jalur
  sync Web dan manajemen role gagal di database hasil provisioning Desktop/Mobile.
  `sync_change_log` juga ikut dihitung `isDatabaseSchemaReady`, sehingga Web
  menganggap skema tidak pernah siap dan mengulang `initDatabaseSchema` terus.
- `master_operator.created_at/updated_at` dan `created_at` pada `tax_rules`,
  `bpjs_rules`, `payroll_components` hanya dibuat jalur Rust → bootstrap
  Superadmin dari Desktop/Mobile gagal di database hasil provisioning Web.
- `master_operator.role` di Web `NOT NULL` dengan CHECK dan tanpa DEFAULT,
  sedangkan `create_operator` di Rust tidak mengisinya → tambah operator gagal.

### Constraint, bukan hanya kolom

Nama kolom yang sama belum berarti selaras. Dua invarian tambahan:

1. **DDL cloud Rust ≡ DDL cloud Web** pada NOT NULL, UNIQUE, PRIMARY KEY,
   DEFAULT, dan CHECK. Contoh nyata: `sync_operation_receipt.receipt_json`
   `NOT NULL` tanpa DEFAULT di Rust membuat INSERT receipt dari Web gagal, dan
   `server_revision NOT NULL` menolak NULL yang sah untuk event rejected/conflict.
2. **SQLite lokal tidak boleh lebih ketat daripada cloud.** Tabel lokal menelan
   apa pun isi cloud lewat `apply_table`; satu baris cloud yang melanggar CHECK
   lokal menggagalkan SELURUH transaksi snapshot — sinkronisasi mati total di
   setiap perangkat, bukan cuma baris itu yang gagal.

### Format penamaan tidak boleh tertukar

| Format | Dipakai untuk |
|---|---|
| `snake_case` | nama tabel dan kolom database |
| `kebab-case` | `domain` dan `operation` pada route kanonik |
| `camelCase` | `payload_key` snapshot dan field metadata event (`eventId`, `attendanceBaseUpdatedAt`) |

Salah format tidak memunculkan error — nilainya hanya terbaca kosong di sisi
penerima. `conflict_column` dan `entity_column` juga wajib menunjuk kolom yang
benar-benar ada di daftar `columns`; salah ketik di sana baru gagal saat runtime.

### Katalog permission punya satu sumber

`PERMISSION_CATALOG` di `src/lib/rbac/catalog.ts` adalah acuan. Jalur Web
menanamnya langsung dari sana; jalur Rust menuliskannya sebagai literal SQL di
`turso.rs` dan WAJIB sama persis. Seed Mobile pernah tertinggal lima permission
payroll dan menanam dua permission yang tidak ada di katalog, sehingga database
hasil provisioning Mobile membuat permission itu mustahil diberikan (FOREIGN KEY
ke `app_permission`) dan hilang diam-diam dari daftar permission Superadmin.

### `turso.rs` ikut disalin ke Mobile

Berkas ini dulu dipelihara terpisah dan sudah drift dua arah. Sekarang ia ada di
`filesToSync` pada `mobile/scripts/sync-rust-modules.ts` — edit versi
`web-desktop`, lalu jalankan skripnya.

### Aturan

1. Tabel milik Web tetap dibuat Rust, tetapi definisinya WAJIB disalin apa adanya
   dari `db-migrations.ts`. Jangan mengarang kolom.
2. Kolom yang hanya dikenal satu sisi WAJIB ditambahkan di dua tempat: daftar
   `ensure_column` pada `turso.rs` DAN `ALTER TABLE` idempoten di
   `db-migrations.ts`. Dengan begitu klien mana pun menyembuhkan database.
3. Setiap `INSERT` Rust ke tabel milik Web WAJIB mengisi kolom `NOT NULL` yang
   ada di definisi Web, walau definisi Rust memberinya DEFAULT.
4. Tabel milik Web yang terlanjur salah bentuk dibangun ulang oleh
   `repair_web_owned_tables()`. Ini hanya boleh untuk tabel berisi data sementara
   (sesi, penghitung rate limit) — jangan pernah untuk tabel operasional.
5. `bun run audit:contract` membandingkan kedua implementasi kolom per kolom dan
   memastikan provisioning Rust membuat seluruh tabel yang dihitung
   `isDatabaseSchemaReady`. Tabel yang memang sengaja satu sisi didaftarkan pada
   `expectedRustOnlyCloudTables` / `expectedWebOnlyCloudTables`.

---

## 1. Empat Lapisan Skema Wajib Identik (Zero Schema Drift)

Setiap perubahan kolom atau tabel wajib diselaraskan pada **4 layer sekaligus**:
1. **Layer 1 (Rust Snapshot):** `SNAPSHOT_TABLES` di `web-desktop/src-tauri/src/desktop/sync.rs` dan `mobile/src-tauri/src/mobile/sync.rs`.
2. **Layer 2 (Rust SQLite DDL):** `CREATE TABLE` di `storage.rs` (Desktop & Mobile).
3. **Layer 3 (Turso Cloud DDL & Migration):** `turso.rs` (Rust), `db-schema.ts`, dan `db-migrations.ts` (Next.js LibSQL).
4. **Layer 4 (TypeScript Zod Validator):** `sync-schema.ts` (Desktop & Mobile).

---

## 2. Daftar 28 Tabel Snapshot Terdistribusi

Terdapat **28 tabel** yang termasuk dalam siklus snapshot klien (identik di `web-desktop` dan `mobile`):

| No | Nama Tabel SQLite | Domain Sync | Payload Key di Snapshot | Keterangan |
| :--- | :--- | :--- | :--- | :--- |
| 1 | `master_data` | `employee` | `employees` | Data master pegawai/guru/siswa |
| 2 | `id_card` | `id-card` | `idCards` | Data kartu ID & barcode |
| 3 | `tbl_shift` | `shift` | `shifts` | Master jadwal shift |
| 4 | `tbl_hari_libur` | `holiday` | `holidays` | Kalender hari libur nasional |
| 5 | `hari_libur_whitelist` | `holiday-whitelist` | `holidayWhitelists` | Whitelist pengecualian hari libur |
| 6 | `setting_gex_system` | `setting` | `settings` | Pengaturan sistem umum |
| 7 | `company_profile` | `company-profile` | `companyProfiles` | Profil instansi / perusahaan |
| 8 | `id_card_template` | `id-card-template` | `idCardTemplates` | Template desain cetak kartu |
| 9 | `backup_karyawan` | `backup` | `backups` | Jadwal penugasan shift backup |
| 10 | `koreksi_admin` | `correction` | `corrections` | Log riwayat koreksi manual admin |
| 11 | `import_offline` | `offline-import` | `imports` | Log impor presensi offline |
| 12 | `absensi_harian` | `attendance` | `attendance` | Rekapitulasi absensi harian |
| 13 | `log_scan` | `log-scan` | `scanLogs` | Catatan mentah setiap event scan |
| 14 | `salary_configs` | `payroll` | `salaryConfigs` | Konfigurasi gaji pokok & tunjangan |
| 15 | `overtime_tier_rules` | `payroll` | `overtimeTierRules` | Aturan jenjang lembur (PP 35/2021) |
| 16 | `payroll_components` | `payroll` | `payrollComponents` | Komponen tunjangan/potongan payroll |
| 17 | `tax_rules` | `payroll` | `taxRules` | Aturan tarif pajak PPh 21 (TER & Pasal 17) |
| 18 | `bpjs_rules` | `payroll` | `bpjsRules` | Aturan tarif BPJS Kesehatan & Ketenagakerjaan |
| 19 | `payroll_runs` | `payroll` | `payrollRuns` | Master proses penggajian bulanan |
| 20 | `payroll_items` | `payroll` | `payrollItems` | Rincian slip gaji per karyawan |
| 21 | `payroll_audit_logs` | `payroll` | `payrollAuditLogs` | Log audit approval & status payroll |
| 22 | `akademik_tahun_ajaran` | `academic-year` | `akademikTahunAjaran` | Master tahun ajaran & semester |
| 23 | `akademik_jurusan` | `academic-department` | `akademikJurusan` | Master jurusan / program keahlian |
| 24 | `akademik_rombel` | `academic-class` | `akademikRombel` | Rombongan belajar / kelas |
| 25 | `akademik_mapel` | `academic-subject` | `akademikMapel` | Master mata pelajaran |
| 26 | `akademik_guru_mapel` | `academic-assignment` | `akademikGuruMapel` | Penugasan guru mata pelajaran per rombel |
| 27 | `guru_data` | `teacher` | `guruData` | Data profil guru & tenaga pendidik |
| 28 | `siswa_data` | `student` | `siswaData` | Data profil siswa & wali |

### PERHATIAN KHUSUS: `master_operator` BUKAN Snapshot Operasional
- Tabel `master_operator` (beserta hash password, role, permission, dan status bootstrap) dikelola secara terpisah sebagai **Boundary Autentikasi / RBAC Cloud**.
- **DILARANG** memasukkan `master_operator` ke dalam `SNAPSHOT_TABLES` perangkat operasional untuk mencegah kebocoran hash password ke perangkat klien dan konflik multi-terminal.

---

## 3. Rekonsiliasi ID Shift Offline (`reconcile_shift_ids`)

### Masalah Foreign Key Shift:
- Saat perangkat membuat Shift baru secara offline, shift tersebut diberi ID lokal sementara.
- Ketika terhubung ke Turso Cloud, server menetapkan `id_shift` permanen baru.

### Aturan Rekonsiliasi:
- Shift offline diidentifikasi menggunakan `kode_shift` sebagai *stable business key*.
- Saat `id_shift` permanen diterima dari Turso Cloud, sistem wajib menjalankan fungsi **`reconcile_shift_ids`**:
  1. Update kolom `id_shift` di tabel `master_data` (karyawan yang memakai shift terkait).
  2. Update kolom `id_shift` di tabel `absensi_harian` (rekap absensi yang memakai shift terkait).
  3. Menyelesaikan update pada tabel `tbl_shift`.
- Seluruh langkah rekonsiliasi wajib dijalankan dalam satu transaksi SQLite atomik sebelum snapshot shift dinyatakan selesai.

---

## 4. Paritas Mutlak SNAPSHOT_SOURCES (turso.rs) & SNAPSHOT_TABLES (sync.rs)

`turso.rs:625` mendefinisikan array `SNAPSHOT_SOURCES` yang menjadi sumber tunggal bagi:
1. Pembangkitan query `SELECT` snapshot saat klien memanggil `pull_snapshot_tables`.
2. Pemasangan trigger SQLite `AFTER INSERT/UPDATE/DELETE` untuk memutakhirkan `sync_pulse` di cloud.

Jika sebuah tabel terdaftar di `SNAPSHOT_TABLES` (sync.rs) tetapi absen dari `SNAPSHOT_SOURCES` (turso.rs):
- `pull_snapshot_tables` tidak akan pernah menghasilkan JSON key untuk tabel tersebut.
- Klien menganggap kunci yang absen sebagai "tabel tidak berubah", sehingga tabel tidak pernah terisi data cloud.
- Trigger `sync_pulse` tidak terpasang di cloud untuk tabel tersebut, sehingga perubahan dari Web route handler tidak pernah menaikkan pulsa sync dan tidak pernah memicu pull di klien.

---

## 5. Larangan UNIQUE Constraint pada Skema Sinkronisasi

- Seluruh tabel yang ikut disinkronkan DILARANG memiliki `UNIQUE` constraint pada kolom selain Primary Key.
- Tabrakan data offline pada constraint unik menyebabkan outbox status `failed` permanen (`next_retry_at = NULL`).
- Penegakan keunikan (misal NIS, NISN, kode jurusan, kode mapel) wajib ditegakkan di lapisan aplikasi sebelum penyimpanan (`assert_unique`), bukan di skema database DDL.

---

## 6. Validasi Zod Ketat Tanpa .passthrough()

- Skema Zod pada `sync-schema.ts` adalah gerbang validasi payload sinkronisasi.
- DILARANG menggunakan `.passthrough()`; WAJIB menggunakan `.strict()` pada seluruh skema event dan entitas.
- Kolom bertipe terbatas (misalnya `jenis_kelamin`, `semester`, `status`) WAJIB divalidasi dengan `z.enum([...])` yang presisi sesuai CHECK constraint cloud.
- Objek bersarang (misal: nested profile `master_data`) WAJIB didefinisikan skemanya secara penuh, bukan diketik `z.record()` atau `z.unknown()`.

---

## 7. Konvensi IPC Tauri v2 & Keamanan String Rust

- **camelCase IPC Mapping:** Tauri v2 memetakan argumen Rust `snake_case` (misal: `id_rombel: Option<String>`) menjadi `camelCase` di JavaScript (`{ idRombel }`). Jangan pernah mengirim kunci `snake_case` dari JavaScript karena nilainya akan menjadi `None` secara diam-diam.
- **Safe Character Slicing di Rust:** DILARANG menggunakan byte-slice mentah `&id[start..end]`. Gunakan iterator karakter yang aman terhadap batas UTF-8: `id.chars().skip(offset).take(count).collect::<String>()`.
