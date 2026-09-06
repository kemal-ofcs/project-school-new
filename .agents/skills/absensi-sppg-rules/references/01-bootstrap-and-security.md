# Modul Keamanan, Vault Terenkripsi & Bootstrap Superadmin

Dokumen ini menjelaskan standar keamanan tertinggi, manajemen kredensial, proteksi secret build-time, dan alur bootstrap Superadmin untuk aplikasi Absensi SPPG (2-Tier Desktop & Mobile).

---

## 1. Zero Build-Time Secret Leakage Standard

### Prinsip Utama:
- **DILARANG KERAS** menanam URL Database Turso atau Auth Token dari mesin pengembang/build machine ke dalam binary release (Desktop Installer / APK Android).
- Di file `config.rs` (Rust), environment variable `option_env!("TURSO_DATABASE_URL")` dan `option_env!("TURSO_AUTH_TOKEN")` HANYA diizinkan pada mode debug (`#[cfg(debug_assertions)]`).
- Pada mode rilis (`#[cfg(not(debug_assertions))]`), kedua konstanta tersebut **WAJIB di-hardcode menjadi `None`**:

```rust
#[cfg(debug_assertions)]
pub const BUILD_TURSO_DATABASE_URL: Option<&str> = option_env!("TURSO_DATABASE_URL");
#[cfg(debug_assertions)]
pub const BUILD_TURSO_AUTH_TOKEN: Option<&str> = option_env!("TURSO_AUTH_TOKEN");

#[cfg(not(debug_assertions))]
pub const BUILD_TURSO_DATABASE_URL: Option<&str> = None;
#[cfg(not(debug_assertions))]
pub const BUILD_TURSO_AUTH_TOKEN: Option<&str> = None;
```

---

## 1.1 Pilihan Provider Database (Turso Cloud, Server Sendiri, Mode Lokal)

Ada **TIGA** provider, bukan dua. `provider` disimpan eksplisit dan TIDAK PERNAH
ditebak dari bentuk URL:

| `provider` | Alamat | Auth Token | Transport |
| :-- | :-- | :-- | :-- |
| `turso` | `libsql://…` wajib HTTPS | **wajib** | Hrana `/v2/pipeline` |
| `self_hosted` | sqld milik sendiri; HTTP polos boleh ke jaringan privat | opsional di LAN, wajib bila publik | Hrana `/v2/pipeline` |
| `local_file` | path berkas SQLite di perangkat | **tidak pernah** | `LocalTransport` (rusqlite) |

- `TursoConfig` menyimpan empat nilai: `database_url`, `auth_token`, `provider`, dan `allow_insecure_transport`.
- `provider` dan `allow_insecure_transport` memakai `#[serde(default)]`, sehingga vault lama yang hanya berisi dua field tetap terbaca dan otomatis dianggap `turso` — default paling ketat.
- Cermin non-rahasianya disimpan di `setting_gex_system` sebagai `turso_database_provider` dan `turso_allow_insecure_transport`. Keduanya WAJIB terdaftar di `sync::DEVICE_LOCAL_SETTING_KEYS`: kalau ikut tersinkronisasi, perangkat lain akan menarik alamat LAN milik kantor dan mencoba menghubunginya dari jaringan yang sama sekali berbeda.
- Perbandingan "apakah ini database yang sama" WAJIB memakai `TursoConfig::matches_url` (ternormalisasi). Perbandingan string mentah pernah membuat token vault dianggap milik database lain hanya karena pengguna mengetik `https://x` untuk vault berisi `libsql://x`.
- `normalize_database_url` di `turso.rs` adalah **satu-satunya gerbang** ketiga cabang di atas. Jangan menambah pemeriksaan alamat di tempat lain.

### Mode Database Lokal (`local_file`) — offline-first tanpa server

- Transportnya ditukar, SQL-nya TIDAK. `turso.rs` hanya punya satu titik panggil HTTP; `local_file` mengarahkannya ke `LocalTransport` (`sql_backend.rs`). `ensure_schema()` yang sama membangun database cloud maupun berkas lokal, sehingga drift antara keduanya mustahil secara struktural. Uji `provisioning_lokal_membangun_seluruh_tabel_cloud` menjaga janji ini.
- **Origin-nya konstanta** (`LOCAL_FILE_ORIGIN`), bukan turunan isi path. Origin dipakai sebagai kunci `desktop_client_identity`; kalau ikut berubah saat berkas hub dipindahkan, perangkat yang sama dianggap perangkat baru dan seluruh kursor sinkronisasinya kembali ke nol.
- Path kosong adalah error yang HARUS terlihat (`LOCAL_DB_PATH_MISSING`), bukan berkas kosong yang diam-diam dibuat di direktori kerja.
- Formulir provisioning sengaja tidak menampilkan kolom alamat untuk mode ini. Karena itu `resolve_bootstrap_turso_config` WAJIB menentukan provider **sebelum** menolak alamat kosong; urutan terbalik pernah membuat provisioning mode lokal selalu berhenti dengan "Alamat database wajib diisi" — menuntut sesuatu yang tidak pernah bisa diisi pengguna.

#### DUA berkas, bukan satu — dan ini sumber banyak kesalahpahaman

Pada mode lokal perangkat memegang **dua** berkas SQLite yang berbeda:

| Berkas | Peran | Ditulis oleh |
| :-- | :-- | :-- |
| `desktop-security.db` | database operasional + outbox + vault | mutasi lokal, langsung |
| `sppg-hub.db` | berperan sebagai "cloud" | HANYA oleh `push_outbox` |

Konsekuensi yang wajib diingat sebelum menyentuh apa pun di sekitar sini:

- Mutasi lokal menulis ke `desktop-security.db` dan mengantre di outbox. Hub **tidak** ikut berubah sampai push berjalan.
- `export_database` membaca **hub**, bukan database operasional. Outbox yang tidak pernah terkuras berarti berkas cadangan kehilangan data tanpa satu pun pesan error.
- `database-promotion.ts` (naik dari 1 perangkat ke cloud) juga membaca **hub**. Hub yang tertinggal berarti data hilang permanen saat migrasi.
- Karena itu mesin sinkronisasi TETAP WAJIB berjalan di mode lokal. "Tidak ada jaringan" bukan alasan melewatkan siklus sync — push di sini adalah operasi berkas, bukan jaringan.

---

## 2. Vault Offline Terenkripsi (AES-256-GCM + Argon2id)

### Prinsip Utama:
- Kredensial Turso (URL & Auth Token) dan snapshot login pengguna disimpan dalam vault terenkripsi di disk lokal (`secrets.rs`).
- Kunci enkripsi diderivasi menggunakan **Argon2id** dengan salt acak dan diamankan dengan cipher **AES-256-GCM**.
- **Device & Origin Hard-Binding:** Snapshot sesi login diikat secara matematis ke `server_origin` + `username` + `device_id`. Snapshot dari origin atau perangkat lain HARUS ditolak untuk mencegah impersonation.
- **Pembersihan Memori (Zeroize):** Struktur data sensitif yang memegang plaintext password atau token wajib mengimplementasikan trait `zeroize::Zeroize` untuk menghapus byte rahasia dari RAM setelah digunakan.

### Izin Mutasi Sensitif (`SENSITIVE_MUTATION_PERMISSIONS`):

Izin di daftar ini SENGAJA tidak ikut paket bawaan role Admin. Semuanya
menghancurkan atau menyerahkan sesuatu yang tidak bisa dibuat ulang, jadi harus
diberikan secara sadar lewat Role & Akses. Daftar resminya ada di
`src/lib/rbac/catalog.ts`; yang di bawah ini alasannya:

| Izin | Yang hilang bila disalahgunakan |
| :-- | :-- |
| `history.edit`, `history.delete` | Jejak absensi historis — sumber perhitungan payroll |
| `operational.edit`, `operational.delete` | Data operasional berjalan, termasuk baris yang sudah dipakai slip |
| `password_reset.delete` | Satu-satunya jejak siapa yang pernah mengajukan pemulihan, beserta foto wajahnya |
| `password_reset.approve` | Kendali sebuah akun, diserahkan kepada orang yang berdiri di depan layar |
| `two_factor.reset` | Lapisan kedua akun orang lain |
| `attendance_photo.delete` | Satu-satunya bukti visual bahwa sebuah scan benar dilakukan orangnya |
| `database_backup.restore` | SELURUH data perangkat sekaligus — tidak ada operasi lain yang menghapus sebanyak ini dalam satu langkah |

### Penanganan Form Input Konfigurasi (Token Retention):
- Token yang sudah tersimpan di vault TIDAK PERNAH diekspos kembali ke frontend dalam bentuk plaintext.
- Frontend hanya menampilkan status `"Tersimpan di Vault"`.
- Saat fungsi `set_turso_config` dipanggil: jika field `auth_token` dikirim kosong (`""` atau `None`), backend Rust **WAJIB mempertahankan token lama yang ada di vault**, bukan menimpanya menjadi kosong.

---

## 3. Protokol Bootstrap Superadmin Tunggal & Bebas Default Password

### Masalah Historis:
- Sebelumnya, seed inisialisasi membuat akun bawaan `admin` / `admin123` yang seragam di semua customer. Ini menciptakan celah keamanan fatal dan satu titik kompromi massal.

### Standar Emas Bootstrap Baru:
1. **Tidak Ada Akun Bawaan:** Database production baru tidak memiliki seed operator otomatis.
2. **Klaim Sekali Pakai (Single-Claim Atomic Provisioning):**
   - Jika Turso belum memiliki Superadmin aktif, sistem menampilkan layar inisialisasi / provisioning.
   - Customer menentukan sendiri URL Turso, Auth Token, Nama, Username, dan Password Superadmin pertama.
3. **Kebijakan Password Kuat:**
   - Minimal 12 karakter.
   - Wajib mengandung huruf besar, huruf kecil, angka, dan simbol/karakter khusus.
   - Dilarang memuat substring username.
4. **Pencarian Role Dinamis (No Magic Number):**
   - **DILARANG MENGASUMSIKAN `role_id = 1`**.
   - Sistem wajib mencari role Superadmin dengan query dinamis: `WHERE role_key = 'superadmin' AND is_superadmin = 1 AND is_active = 1`.
5. **Transaksi Atomik:**
   - Pembuatan skema, pengecekan status, klaim `app_bootstrap_state`, dan penambahan record operator di `master_operator` wajib dibungkus dalam satu transaksi database atomik (`BEGIN IMMEDIATE`).
   - Jika salah satu query gagal, seluruh operasi di-rollback.

---

## 4. Keamanan Sesi, Rate Limiting & Dynamic RBAC

### Rate Limiting Login Persisten:
- Backend menerapkan batas percobaan login (maksimal 5 kali kegagalan).
- Kegagalan berulang mengunci akun sementara secara bertingkat.
- Reservasi percobaan login dilakukan secara atomik untuk mencegah bypass via request paralel konkuren.

### Dynamic RBAC & Session Revocation:
- Setiap perubahan permission role atau status aktif operator di database langsung mencabut (*revoke*) token sesi terkait.
- Operator yang dinonaktifkan (`is_active = 0`) langsung ditolak pada request berikutnya.
- Superadmin aktif terakhir di sistem dilindungi agar tidak dapat dihapus, dinonaktifkan, atau diturunkan role-nya secara tidak sengaja.

---

## 5. Pemulihan Password Mandiri & Verifikasi Dua Langkah

### Alur "Lupa Password" (delapan langkah, tanpa sesi):
- `lookup` → `confirm` → `verify` → `inspect-token` → `complete`, ditambah `swap-challenge`, `route`, dan `recover-with-code`. Dilayani `POST /api/password-reset` di Web dan command `desktop_password_reset_*` / `desktop_password_recovery_with_code` di Desktop/Mobile.
- MENGAJUKAN reset tidak butuh izin apa pun — pemohon justru sedang terkunci di luar akunnya. Penjaganya adalah rate limit `auth_login_rate_limit`, verifikasi wajah, urutan tantangan acak yang hanya diketahui database, dan token sekali-pakai berumur 30 menit.
- Yang di-RBAC adalah MEMBACA, MENYETUJUI, dan MENGHAPUS jejaknya: `password_reset.view`, `password_reset.approve`, dan `password_reset.delete`. Dua yang terakhir masuk `SENSITIVE_MUTATION_PERMISSIONS` sehingga tidak ikut paket bawaan Admin — menyetujui berarti menyerahkan kendali sebuah akun kepada orang yang sedang berdiri di depan layar.

### TIGA jalur penyerahan token — jangan pernah mengasumsikan email

Ini pernah salah dan akibatnya fatal: versi sebelumnya SELALU mengirim email, dan
kegagalan pengiriman **membatalkan** permintaannya. Di setiap pemasangan yang
belum mengonfigurasi email — termasuk seluruh Mode Database Lokal yang memang
tidak punya jaringan — fitur "Lupa Password" mati total.

1. **Email** — bila `app_mail_config.is_active`.
2. **Persetujuan di aplikasi** (`in_app`) — baris tetap `Menunggu Verifikasi` dengan `delivery_status = 'Menunggu Persetujuan'`. Token **tidak dibuat saat `verify`**, melainkan lahir di layar peninjau saat `approve`. Kalau dibuat lebih dulu, bentuk aslinya harus disimpan di suatu tempat sampai disetujui — padahal database hanya boleh memegang hash-nya.
3. **Kode pemulihan cetak** — delapan kode diterbitkan sekali saat provisioning Superadmin, disimpan hanya sebagai hash SHA-256, dihapus begitu dipakai. Satu-satunya jalan pulih bagi Superadmin pada pemasangan tanpa jaringan: akun itu tidak punya siapa pun di atasnya yang bisa menyetujui permintaannya.

- Pemilihnya `password_reset_route` (Rust) / `resolvePasswordResetRoute` (Web). **Urutannya tidak boleh dibalik**: nilai eksplisit di `setting_gex_system` menang lebih dulu, baru `app_mail_config.is_active` dipakai sebagai bawaan. Satu database yang sama bisa dilayani Web dan Desktop bergantian; bila keduanya menyimpulkan jalur berbeda, sebuah permintaan akan menunggu persetujuan yang tidak pernah diminta.
- `generateRecoveryCodes`/`normalizeRecoveryCode` (`src/lib/security/totp.ts`) dan `generate_recovery_codes`/`normalize_recovery_code` (`turso.rs`) **wajib tetap identik**, termasuk membuang SETIAP karakter non-alfanumerik. Kode yang dicetak di satu build dipakai untuk masuk lewat build yang lain, jadi normalisasi yang berbeda menghasilkan hash yang berbeda untuk kode yang sama.
- Foto wajah yang dilihat peninjau adalah faktor kedua di jalur `in_app`, dan sebenarnya lebih kuat daripada email: email hanya membuktikan penguasaan kotak masuk, bukan siapa yang meminta.
- Token disimpan hanya sebagai hash SHA-256, dan dikonsumsi SEBELUM password ditulis.
- Daftar riwayat tidak pernah membawa `photo_base64`: satu foto sekitar 40 KB, dan ratusan baris akan membuat balasannya puluhan megabyte. Foto diambil satu per satu lewat endpoint terpisah.
- `password_reset_request` dan `app_mail_config` cloud-only: TIDAK pernah masuk `SNAPSHOT_TABLES`.
- Menghapus operator DITOLAK selama riwayat resetnya masih ada — tabelnya ber-CASCADE ke `master_operator`, jadi menghapus akun ikut memusnahkan foto bukti. Aturan yang sama wajib ada di `operator-admin.ts` (Web) dan `delete_operator` (Rust).

### Waktu:
- **Seluruh stempel waktu dan perbandingan kedaluwarsa pada alur ini WAJIB dihitung SQLite** (`datetime('now')`, `strftime('%s','now')`), tidak pernah `new Date()`. Satu baris bisa ditulis Rust dan dibaca TypeScript, dan `new Date("2026-08-29 10:15:00")` diparsing sebagai waktu lokal.

### 2FA TOTP:
- RFC 6238 dengan **SHA-1** — Google Authenticator mengabaikan parameter `algorithm` pada URI otpauth, sehingga SHA-256 menghasilkan kode yang tidak pernah cocok tanpa pesan error apa pun.
- Inti algoritmenya ada di `src/lib/security/totp.ts` dengan cerminan Rust di `turso.rs`; keduanya diuji terhadap vektor resmi RFC 4226/6238 yang sama.
- Gerbang 2FA dijalankan SETELAH password terbukti benar, agar layar login tidak bisa dipakai memetakan akun mana yang memakai 2FA.
- `TOTP_REQUIRED`, `TOTP_INVALID`, dan `TOTP_ENROLLMENT_REQUIRED` dikembalikan LANGSUNG oleh `desktop_login` dan tidak boleh jatuh ke lengan error umum: lengan itu memperlakukannya sebagai "cloud tidak terjangkau" dan meneruskan login ke fallback offline yang hanya memeriksa username + password — 2FA terlewati sepenuhnya meskipun jaringan hidup. Hanya `TOTP_INVALID` yang dihitung sebagai percobaan gagal; "belum mengirim kode" adalah langkah normal.
- Mendaftarkan atau mematikan 2FA untuk akun SENDIRI tidak butuh izin (id operator selalu diambil dari sesi, tidak pernah dari argumen). Mematikan 2FA operator LAIN dijaga `two_factor.reset`, yang masuk `SENSITIVE_MUTATION_PERMISSIONS`.
- Kode cadangan disimpan sebagai hash SHA-256 dan dihapus pada percobaan yang berhasil.

### Indeks di atas kolom hasil migrasi:
- `idx_master_operator_email` memakai `LOWER(email)` dan WAJIB dibuat SETELAH `ensure_column` (Rust) / di `INDEX_MIGRATIONS`, bukan di DDL awal. Pada database yang sudah berjalan kolom `email` belum ada saat pipeline DDL jalan, dan satu statement yang gagal membatalkan seluruh pipeline — termasuk `ensure_column` yang justru akan menambahkan kolomnya. Database lama terkunci selamanya. `bun run audit:contract` menegakkan urutan ini.
