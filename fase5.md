Sistem Manajemen & Absensi Sekolah — Fase 5

Landing Page Publik, PMB Online & Portal Wali Murid
Fase pertama yang membuka aplikasi ke internet publik tanpa sesi, dan fase pertama yang memberi orang di luar sekolah sebuah jendela ke data seorang anak. Keduanya menuntut pemisahan yang tidak diperlukan empat fase sebelumnya.

    Workspace          2 → 3 (web-public/)
    Versi skema        25 → 27
    Tabel cloud        54 → 59
    Rute kanonik       tidak berubah (0 rute baru)
    Tabel snapshot     32 → 32 (tidak berubah)
    Permission         +4 (pmb.*)

---

## 1. Keputusan arsitektur: workspace ketiga, bukan folder di web-desktop

Landing page, PMB, dan portal wali hidup di `web-public/` — aplikasi Next.js berdinding sendiri, di-deploy ke Vercel, TANPA Tauri, TANPA SQLite lokal, TANPA outbox, TANPA `src-tauri/`.

Tiga alasan teknis, semuanya sudah ada di kode hari ini:

**1. `web-desktop/src/app` dikompilasi DUA kali.** `next.config.ts` menyalakan `output: "export"` saat `SPPG_BUILD_TARGET=desktop`. Setiap halaman di sana wajib lolos export statis untuk masuk installer Desktop: tanpa SSR, tanpa `GET` route handler, tanpa server action, tanpa metadata dinamis. Landing page butuh SEO dan SSR; PMB butuh unggah berkas dan form publik. Menaruhnya di sana berarti melumpuhkan situsnya demi menjaga `build:desktop` tetap hijau — sekaligus mengirim halaman pemasaran sekolah ke dalam binary Desktop dan APK Android, tempat ia tidak pernah dibuka siapa pun.

**2. `/` sudah dipakai.** `web-desktop/src/app/page.tsx` adalah dasbor operator.

**3. Identitasnya berbeda domain.** `layout.tsx` membungkus seluruh aplikasi dengan `AuthProvider` sesi `master_operator` + RBAC. Wali murid dan calon siswa bukan operator: tidak punya role, tidak punya permission, tidak boleh punya baris di `master_operator`. Menumpuk keduanya di satu `AuthContext` adalah cara termurah menciptakan bug di mana sesi wali diperlakukan sebagai sesi staf.

Tambahannya: seluruh audit root menyapu `web-desktop/src/app`, sehingga halaman publik akan dinilai dengan aturan aplikasi internal. Dan secara keamanan, web-desktop hari ini hanya melayani staf terautentikasi — menaruh trafik internet publik di origin yang sama dengan UI payroll memperluas permukaan serangan tanpa perlu.

Root bukan bun workspace (`bun install --cwd web-desktop && --cwd mobile`), jadi folder ketiga cocok persis dengan pola yang sudah ada.

Domain: `sekolah.sch.id` untuk web-public, `app.sekolah.sch.id` untuk web-desktop. Satu domain tetap bisa lewat rewrite Vercel; itu urusan deployment, bukan alasan menyatukan kode.

---

## 2. Temuan yang mengubah lingkup: TIDAK ADA tabel nilai

Permintaannya menyebut "wali bisa mengecek absensi ATAU NILAI anaknya". Dari 58 tabel cloud yang ada hari ini, tidak satu pun menyimpan nilai:

| Yang ada | Isinya |
| --- | --- |
| `akademik_*` | tahun ajaran, jurusan, rombel, mapel, jam pelajaran, jadwal |
| `presensi_mapel` / `presensi_mapel_detail` | kehadiran per jam pelajaran |
| `leger_kehadiran` | rekap KEHADIRAN beku untuk rapor |
| `jurnal_mengajar` | catatan materi + paraf |
| `bk_kasus` / `bk_sesi` | kasus dan sesi konseling |

Yang dibekukan untuk rapor adalah kehadiran, bukan nilai. Tidak ada tabel penilaian, tidak ada KD, tidak ada ulangan, tidak ada rapor.

Artinya "cek nilai" bukan fitur portal — ia modul penilaian akademik yang utuh, dan modul itu harus lahir di `web-desktop` lebih dulu, bukan di web-public: yang menginput nilai adalah guru, dan guru memakai Desktop/Mobile yang wajib bisa bekerja offline. Itu berarti empat lapis skema penuh, `SNAPSHOT_TABLES` baru, rute outbox kanonik baru, dan UI input di dua build. Lingkupnya lebih besar daripada seluruh portal walinya.

**Keputusan:** Fase 5 mengirim ABSENSI dan KEHADIRAN ke wali. Nilai menjadi Fase 6, dan dimulai dari sisi guru. Portal wali dirancang sejak awal dengan satu tab "Nilai" berisi pesan "belum tersedia", agar penambahannya nanti tidak membongkar navigasinya.

---

## 3. Arsitektur data: tiga kelas tabel, dan satu-satunya jembatan

Pertanyaan "bagaimana sync-nya" terjawab dengan memisahkan tabel menjadi tiga kelas dan memberi web-public izin yang berbeda pada masing-masing.

**KELAS A — tabel snapshot** (32 tabel, ikut `SNAPSHOT_TABLES`): `master_data`, `siswa_data`, `absensi_harian`, `presensi_mapel_detail`, `leger_kehadiran`, `akademik_rombel`, `tbl_shift`, dan seterusnya.

→ web-public **HANYA MEMBACA**. Tidak pernah INSERT, UPDATE, atau DELETE. Alasannya keras: setiap tulisan ke tabel Kelas A menaikkan `sync_pulse` dan ditarik ke SQLite SETIAP perangkat pada siklus berikutnya. Sebuah bug di form publik tidak boleh bisa menyebar ke seluruh terminal pemindai.

**KELAS B — tabel cloud-only yang sudah ada**: `password_reset_request`, `app_mail_config`, `bk_kasus`, `bk_sesi`, `app_session`, `app_wa_config`, `auth_login_rate_limit`.

→ web-public membaca `app_wa_config` (untuk mengirim OTP) dan menulis `auth_login_rate_limit` (dengan prefix `rate_key` sendiri). Selebihnya tidak disentuh.

**KELAS C — tabel cloud-only BARU milik Fase 5** (5 tabel): `pmb_gelombang`, `pmb_pendaftar`, `pmb_berkas`, `wali_otp`, `wali_session`.

→ web-public membaca dan menulis penuh. Tidak satu pun masuk `SNAPSHOT_TABLES` / `SNAPSHOT_SOURCES`, sehingga tidak pernah tersalin ke SQLite perangkat mana pun dan tidak pernah menyentuh outbox.

Konsekuensi yang harus diterima secara sadar: **PMB dan portal wali MENUNTUT JARINGAN**, sama persis seperti Bimbingan Konseling. Halaman tinjauan PMB di Desktop wajib MENGATAKAN itu saat offline, bukan menampilkan daftar kosong — daftar kosong yang sebenarnya kegagalan tidak bisa dibedakan dari "belum ada pendaftar". Ini pelajaran yang sudah dibayar di Fase 4.

### Satu-satunya jembatan Kelas C → Kelas A

Promosi pendaftar menjadi siswa. Dan jembatan itu SENGAJA tidak dilewati web-public:

```
pendaftar diterima  →  status 'Diterima' di pmb_pendaftar   (Kelas C)
                    →  operator menekan "Jadikan Siswa" di web-desktop
                    →  service academic.ts yang SUDAH ADA membuat
                       master_data + siswa_data + id_card + token QR
                    →  jalur sync yang sudah teruji mengantarkannya
                       ke seluruh perangkat                  (Kelas A)
                    →  pmb_pendaftar.id_siswa diisi sebagai jejak
```

Kenapa begitu: membuat seorang siswa bukan satu INSERT. Ia menyentuh `master_data` (dengan `jenis_personil`, `id_shift`, `token_absensi` acak, dan `qr_code = "{id}|{token}"` yang dituntut kontrak scanner), `siswa_data`, dan baris `id_card`. Menulis ulang rangkaian itu di web-public adalah tempat lahir error constraint dan siswa hantu tanpa QR. Reuse-nya dijamin dengan cara paling sederhana yang ada: **web-public tidak diberi kemampuan itu sama sekali.**

---

## 4. Bagaimana wali melihat data anaknya

**Jangkar identitas:** `siswa_data.no_whatsapp_wali` — kolomnya sudah ada, sudah terisi, dan sudah dipakai mengirim notifikasi bolos sejak Fase 4. Nomor itu secara de facto sudah terverifikasi: kalau salah, notifikasi bolos selama ini tidak sampai dan sekolah sudah tahu.

### Alur masuk (tanpa password, dan itu disengaja)

1. Wali membuka `/wali` dan memasukkan NIS atau NISN anaknya.
2. Server mencari `siswa_data` dengan `status = 'Aktif'` dan `no_whatsapp_wali` tidak kosong. **Balasannya SELALU sama bentuknya**, ketemu atau tidak — layar ini tidak boleh bisa dipakai memetakan NIS mana yang terdaftar. Pola yang sama dengan gerbang 2FA yang berjalan setelah password terbukti benar.
3. Bila ketemu: kode 6 digit dibuat, hash SHA-256-nya disimpan di `wali_otp`, bentuk aslinya dikirim ke nomor wali lewat provider di `app_wa_config`. Layar hanya menampilkan nomor tersamar (`+62812****7788`) sebagai konfirmasi, tidak pernah nomor utuh.
4. Wali memasukkan kode. Maksimal 5 percobaan per baris OTP, umur 10 menit, dihitung SQLite (`datetime('now')`), tidak pernah `new Date()`.
5. Sesi `wali_session` terbit, umur 7 hari, cookie HttpOnly + SameSite=Lax + Secure. Yang disimpan adalah hash token-nya, bukan tokennya.

**Kenapa bukan password:** wali tidak akan mengingatnya, dan begitu ia lupa, sekolah butuh satu lagi jalur pemulihan lengkap dengan bukti identitas — persis kerumitan yang sudah dibayar untuk "Lupa Password" operator. Nomor WA sudah ada, sudah dipakai, dan penguasaannya adalah bukti yang lebih baik daripada kata sandi yang ditulis di buku tulis.

**Kenapa TIDAK lewat `notifikasi_wa`:** CHECK constraint kolom `jenis` hanya menerima empat nilai, dan daftarnya dieja di EMPAT tempat yang wajib sama (CHECK di dua jalur provisioning, enum Zod `sync-schema.ts`, `queue_wa_notification_tx` di `wa_notification.rs`, dan `src/lib/validations/wa-notification.ts`). Menambahkan `otp_wali` ke sana berarti mengubah empat lapis untuk sebuah pesan yang justru tidak boleh mengantre — OTP yang terkirim tiga menit kemudian sudah kedaluwarsa. web-public memanggil provider LANGSUNG lewat salinan `wa-sender.ts`, dan menyimpan jejaknya di `wali_otp.delivery_status`.

### Pembatasan cakupan — pertahanan terhadap IDOR

> Setiap query portal wali WAJIB mengambil `id_siswa` DARI SESI, tidak pernah dari parameter request, query string, atau body. Tidak ada satu pun endpoint portal yang menerima `idSiswa` sebagai masukan.

Ini bukan kehati-hatian berlebihan. Di portal publik, mengganti `?id=` di address bar adalah kelas kerentanan nomor satu, dan konsekuensinya di sini adalah riwayat kehadiran anak orang lain. Aturannya sama persis dengan "sakelar role dibaca dari SESI, tidak pernah dari payload scan" yang sudah berlaku di scanner.

### Yang ditampilkan

| Layar | Sumber | Catatan wajib |
| --- | --- | --- |
| Kehadiran gerbang | `absensi_harian` | WAJIB lewat `GATE_SUMMARY_SUBQUERY` (`attendance-dashboard.ts`). Join langsung menggandakan baris karena `izinkan_multi_sesi`, dan wali akan melihat anaknya "hadir dua kali". Default 31 hari terakhir, maksimum satu semester. |
| Presensi mapel | `presensi_mapel` + `presensi_mapel_detail` | Urut `CAST(jam_ke AS INTEGER) ASC, jam_ke ASC` — `jam_ke` bertipe TEXT. |
| Rekap semester | `leger_kehadiran` | Hanya bila sudah dibekukan. |
| Nilai | — | Tab kosong, "belum tersedia" (bagian 2). |

### Yang sengaja TIDAK ditampilkan

- **`bk_kasus` / `bk_sesi`** — catatan konseling adalah pekerjaan ruangan. Menaruhnya di portal berarti orang tua membaca penilaian tentang perilaku anaknya tanpa ada konselor di sebelahnya.
- **`absensi_foto`** — foto wajah anak di terminal pemindai. Membukanya ke internet bukan fitur.
- **Data siswa lain** — termasuk peringkat, rata-rata kelas, dan daftar hadir sekelas.

---

## 5. Pencegahan drift skema — daftar periksa yang mengikat

Database Turso yang sama diprovisioning oleh TEPAT DUA jalur: `turso.rs::ensure_schema` (Rust) dan `db-schema.ts` + `db-migrations.ts` (TS). `CREATE TABLE IF NOT EXISTS` tidak pernah memperbaiki tabel yang sudah ada, sehingga satu selisih merusak permanen jalur yang tidak sempat membuatnya.

**ATURAN NOL: web-public TIDAK PERNAH menjadi jalur provisioning ketiga.** Ia tidak memanggil `initDatabaseSchema`, tidak memanggil `runDatabaseMigrations`, dan tidak punya satu pun `CREATE TABLE`. Bila tabel yang dibutuhkannya belum ada, ia GAGAL CEPAT dengan pesan yang menyebut tindakannya: *"Skema belum lengkap — buka aplikasi Desktop atau app.sekolah.sch.id sekali untuk memasangnya."* Jalur ketiga yang diam-diam membuat tabel adalah cara paling pasti menghasilkan dua bentuk tabel berbeda di dua pemasangan.

Untuk SETIAP tabel baru, kerjakan **kesepuluh langkah ini dalam satu perubahan**:

1. DDL di `web-desktop/src/lib/db-migrations.ts`.
2. DDL **identik** di `web-desktop/src-tauri/src/desktop/turso.rs::ensure_schema` — kolom sama, urutan sama, tipe sama, DEFAULT sama, CHECK sama. Presedennya `password_reset_request`: salin gayanya, komentarnya ikut.
3. Naikkan `CURRENT_SCHEMA_VERSION` di `db-schema.ts` (25 → 26 → 27).
4. Naikkan `REQUIRED_TABLE_COUNT` (54 → 57 → 59).
5. Tambahkan nama tabel ke daftar `IN (...)` di `isDatabaseSchemaReady`. Melewatkan ini membuat skema dianggap belum siap SELAMANYA, dan `initDatabaseSchema` mengulang seluruh provisioning setiap permintaan.
6. Catat baris `schema_migration` di kedua jalur dengan versi yang sama. `isDatabaseSchemaReady` membandingkan `MAX(version)` dengan konstanta di langkah 3 — tanpa baris ini, angkanya tidak pernah tercapai.
7. **JANGAN** daftarkan di `SNAPSHOT_TABLES` (`sync.rs`) maupun `SNAPSHOT_SOURCES` (`turso.rs`). Karena `ensure_sync_pulse` melingkupi `SNAPSHOT_SOURCES`, tabel ini otomatis tidak mendapat trigger `sync_pulse` maupun `sync_tombstone` — dan itu memang yang diinginkan.
8. **JANGAN** tambahkan ke `storage.rs` (SQLite lokal). Tabel Kelas C tidak pernah ada di perangkat.
9. **Naikkan `CLIENT_SCHEMA_VERSION` di `web-desktop/src-tauri/src/desktop/sync.rs`** — pasangan Rust dari langkah 3. Melewatkannya membuat setiap klien Desktop/Mobile menganggap dirinya ketinggalan skema terhadap cloud yang baru saja ia provisioning sendiri, dan `is_client_schema_outdated` akan menolak sinkronisasi di seluruh perangkat. *(Langkah ini semula tidak ada di daftar; ia ditemukan Fase 5.2 oleh cargo test `provisioning_lokal_membangun_seluruh_tabel_cloud`, yang membandingkan versi hasil provisioning dengan konstanta klien. Tanpa tes itu, kegagalannya baru muncul sebagai perangkat yang berhenti menyinkronkan setelah pembaruan.)*
10. Jalankan `cd mobile && bun scripts/sync-rust-modules.ts` supaya `mobile/src-tauri/src/mobile/turso.rs` dan `sync.rs` ikut. Melewatkannya membuat `audit:schema` bagian 3 (paritas Desktop ↔ Mobile) gagal.

**JANGAN menambahkan apa pun ke `WEB_ONLY_CLOUD_TABLES`** di `audit-sync-contract.ts`. Daftar itu kosong hari ini dan harus tetap kosong — CLAUDE.md melarang melonggarkan audit untuk membuat gerbang lewat. Kalau audit mengeluh "tabel cloud hanya dibuat jalur Web", jawabannya adalah menulis DDL-nya di `turso.rs`, bukan mendaftarkan pengecualian.

Gerbang yang membuktikannya — ketiganya **menjalankan** SQL-nya, bukan membaca teksnya:

| Perintah | Yang dilakukan |
| --- | --- |
| `bun run audit:schema` | menjalankan DDL kedua jalur ke SQLite sementara lalu membandingkan tabel dan kolom yang NYATA terbentuk |
| `bun run audit:contract` | membandingkan himpunan tabel kedua jalur provisioning |
| `bun run audit:sql` | meminta SQLite mem-`prepare` setiap literal SQL di repo |

---

## 6. Pencegahan error constraint — aturan spesifik per jenis

### PRIMARY KEY — TEXT buatan aplikasi, bukan AUTOINCREMENT

`pmb-<epoch>-<48 bit acak>`, pola yang sama dengan `new_payroll_id` dan `hlw-<128 bit acak>`. Id epoch-detik telanjang sudah pernah bertabrakan di repo ini, di dalam satu penyimpanan massal. AUTOINCREMENT menghasilkan angka berbeda di tiap sumber dan tidak boleh dipakai untuk apa pun yang direferensikan lintas tabel.

### UNIQUE — diizinkan di sini, dan ini pengecualian yang harus dipahami

Aturan "jangan ada UNIQUE selain PK" berlaku pada tabel **tersinkronisasi**: dua perangkat offline boleh menulis nilai yang sama, dan penolakan cloud menghentikan event-nya di `failed` dengan `next_retry_at = NULL` — hilang tanpa jalan pulih dari UI.

Tabel Kelas C tidak pernah melewati outbox; ia ditulis langsung dalam keadaan online, sehingga bentrokannya muncul saat itu juga sebagai error HTTP yang bisa dijawab pengguna. Tetap batasi UNIQUE pada nilai yang dihasilkan **mesin** (`wali_session.token_hash`, `pmb_pendaftar.nomor_pendaftaran`). Untuk nilai yang diketik manusia dan boleh kosong, pakai partial unique index seperti `idx_master_operator_email`, agar baris NULL tidak saling bentrok.

### FOREIGN KEY — jangan mengaitkan Kelas C ke Kelas A

Godaannya besar: `wali_session.id_siswa REFERENCES siswa_data(id_siswa) ON DELETE CASCADE`. **Jangan.** `siswa_data` ikut snapshot, dan `apply_table` boleh menghapus lalu menulis ulang barisnya saat rekonsiliasi. FK CASCADE akan menghapus sesi wali diam-diam di tengah pemakaian, dan gejalanya ("kadang tiba-tiba logout") tidak akan pernah tertelusur ke sync.

Simpan `id_siswa` sebagai TEXT biasa dan validasi keberadaannya di lapisan aplikasi pada setiap permintaan — yang memang sudah wajib dilakukan untuk memastikan siswanya masih `Aktif`.

FK ke sesama Kelas C boleh: `pmb_berkas.id_pendaftar` → `pmb_pendaftar` ON DELETE CASCADE aman, karena kedua tabel hanya ditulis satu jalur.

### CHECK — nilainya WAJIB sama persis dengan validator TypeScript-nya

Setiap enum ditulis dua kali: di CHECK constraint dan di Zod `.strict()`. Keduanya diuji dengan vektor yang sama, pola `ip-allowlist` dan `totp`. Nilai tak dikenal **DITOLAK** dengan `VALIDATION_ERROR`, tidak pernah dinormalkan diam-diam menjadi nilai bawaan. Pelajaran `notifikasi_wa`: menormalkan status asing menjadi `Menunggu` mengubah bug klien menjadi pesan WhatsApp yang tidak bisa ditarik kembali.

### UKURAN & MIME — divalidasi di server SEBELUM INSERT

`pmb_berkas` maksimum 500 KB per berkas (angka yang sama dengan foto siswa), MIME hanya `image/jpeg`, `image/png`, `image/webp`, `application/pdf`. SQLite bersifat loose-typing: nilai cacat tersimpan dengan senang hati dan baru ditolak di tempat lain, jauh dari penyebabnya.

### WAKTU — dihitung SQLite, tidak pernah JavaScript

Semua stempel dan perbandingan kedaluwarsa memakai `datetime('now')`. Satu baris bisa ditulis Rust dan dibaca TypeScript, dan `new Date("2026-08-29 10:15:00")` diparsing sebagai waktu lokal.

Untuk **tanggal operasional** (rentang absensi yang ditampilkan ke wali) berlaku standar WIB: `date('now','+7 hours')`. Antara 00:00–07:00 WIB, `date('now')` menunjuk hari kemarin.

### BATAS QUERY — wajib, dan diaudit

`absensi_harian` dan `presensi_mapel_detail` tumbuh setiap hari operasional. Setiap query portal wali membawa `LIMIT` dan rentang tanggal eksplisit. `bun run audit:list-bound` menegakkannya; cakupannya diperluas ke `web-public/` pada Fase 5.0.

### BERKAS BESAR — tidak pernah ikut query daftar

`pmb_berkas.konten_base64` tidak boleh muncul di `SELECT *` daftar pendaftar. Satu berkas ~400 KB; seratus pendaftar membuat balasannya puluhan megabyte. Ambil satu per satu lewat endpoint terpisah — aturan yang sama dengan `photo_base64` di riwayat reset password.

---

## 7. Tabel baru

### v26 — PMB

```sql
CREATE TABLE IF NOT EXISTS pmb_gelombang (
  id_gelombang TEXT PRIMARY KEY,
  nama TEXT NOT NULL,
  tahun_ajaran TEXT NOT NULL,
  tanggal_buka TEXT NOT NULL,
  tanggal_tutup TEXT NOT NULL,
  kuota INTEGER NOT NULL DEFAULT 0,
  biaya_pendaftaran INTEGER NOT NULL DEFAULT 0,
  is_aktif INTEGER NOT NULL DEFAULT 0 CHECK(is_aktif IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

Gelombang aktif bersifat tunggal. Handler-nya WAJIB menonaktifkan yang lain secara atomik dalam batch yang sama: `UPDATE pmb_gelombang SET is_aktif = 0 WHERE id_gelombang <> ?` — pola idempoten yang sudah dipakai `akademik_tahun_ajaran.is_aktif`.

```sql
CREATE TABLE IF NOT EXISTS pmb_pendaftar (
  id_pendaftar TEXT PRIMARY KEY,            -- pmb-<epoch>-<48 bit acak>
  nomor_pendaftaran TEXT NOT NULL,          -- ditampilkan, dipakai cek status
  id_gelombang TEXT NOT NULL,
  nama_lengkap TEXT NOT NULL,
  nisn TEXT,
  jenis_kelamin TEXT CHECK(jenis_kelamin IN ('L', 'P')),
  tempat_lahir TEXT,
  tanggal_lahir TEXT,
  asal_sekolah TEXT,
  alamat TEXT,
  nama_wali TEXT NOT NULL,
  no_whatsapp_wali TEXT NOT NULL,           -- kanonik +62…
  email_wali TEXT,
  pilihan_jurusan TEXT,
  status TEXT NOT NULL DEFAULT 'Baru'
    CHECK(status IN ('Baru', 'Berkas Lengkap', 'Terverifikasi',
                     'Diterima', 'Ditolak', 'Dibatalkan', 'Terdaftar')),
  catatan_verifikator TEXT,
  diverifikasi_oleh TEXT,
  diverifikasi_at TEXT,
  id_siswa TEXT,                            -- diisi saat promosi, TANPA FK
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

`Terdaftar` adalah status akhir setelah promosi berhasil dan `id_siswa` terisi. Membedakannya dari `Diterima` mencegah promosi ganda: tombolnya hanya muncul pada `Diterima`, dan transisinya diperiksa **di server**, bukan hanya disembunyikan di UI.

Nomor WA dinormalkan dengan `normalize_operator_phone` / `src/lib/operators/contact.ts` — fungsi yang sama yang sudah menjaga `master_operator`, supaya nomor yang sama di dua tabel berbentuk sama.

```sql
CREATE TABLE IF NOT EXISTS pmb_berkas (
  id_berkas TEXT PRIMARY KEY,
  id_pendaftar TEXT NOT NULL,
  jenis TEXT NOT NULL
    CHECK(jenis IN ('kartu_keluarga', 'akta_lahir', 'ijazah', 'rapor',
                    'foto', 'lainnya')),
  nama_file TEXT NOT NULL,
  mime TEXT NOT NULL
    CHECK(mime IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  ukuran_byte INTEGER NOT NULL,
  konten_base64 TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (id_pendaftar) REFERENCES pmb_pendaftar(id_pendaftar)
    ON DELETE CASCADE
);
```

### v27 — portal wali

```sql
CREATE TABLE IF NOT EXISTS wali_otp (
  id TEXT PRIMARY KEY,
  subjek TEXT NOT NULL CHECK(subjek IN ('wali', 'pmb')),
  subjek_id TEXT NOT NULL,                  -- id_siswa atau id_pendaftar
  tujuan_nomor TEXT NOT NULL,
  kode_hash TEXT NOT NULL,                  -- SHA-256, tidak pernah kodenya
  attempt_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Menunggu'
    CHECK(status IN ('Menunggu', 'Terpakai', 'Kedaluwarsa', 'Dibatalkan')),
  delivery_status TEXT,
  delivery_error TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);
```

Satu tabel untuk dua subjek karena alurnya identik; `subjek` memisahkannya. OTP untuk cek status PMB memakai baris yang sama dengan `subjek = 'pmb'`.

```sql
CREATE TABLE IF NOT EXISTS wali_session (
  session_id TEXT PRIMARY KEY,
  token_hash TEXT UNIQUE NOT NULL,
  id_siswa TEXT NOT NULL,                   -- TANPA FK, lihat bagian 6
  no_whatsapp_wali TEXT NOT NULL,           -- dibekukan saat sesi lahir
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  revoked_at TEXT,
  revoked_reason TEXT,
  user_agent_hash TEXT
);
```

`no_whatsapp_wali` dibekukan di sesi supaya perubahan nomor di `siswa_data` (oleh operator, atau lewat pull snapshot) langsung membuat sesi lama tidak sah pada pemeriksaan berikutnya — nomor berubah berarti walinya mungkin orang yang berbeda.

### Index

```sql
CREATE INDEX        IF NOT EXISTS idx_pmb_pendaftar_gelombang ON pmb_pendaftar(id_gelombang, status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pmb_pendaftar_nomor     ON pmb_pendaftar(nomor_pendaftaran);
CREATE INDEX        IF NOT EXISTS idx_pmb_berkas_pendaftar    ON pmb_berkas(id_pendaftar);
CREATE INDEX        IF NOT EXISTS idx_wali_otp_subjek         ON wali_otp(subjek, subjek_id, status, created_at DESC);
CREATE INDEX        IF NOT EXISTS idx_wali_session_siswa      ON wali_session(id_siswa, expires_at);
```

### Permission baru

Di-seed di `turso.rs` **dan** katalog TypeScript — `audit:contract` membandingkan kedua himpunan dan menolak selisihnya.

| Permission | Untuk |
| --- | --- |
| `pmb.view` | melihat daftar dan detail pendaftar |
| `pmb.manage` | mengelola gelombang, mengubah status verifikasi |
| `pmb.delete` | **SENSITIVE** — menghapus pendaftar beserta berkasnya |
| `pmb.promote` | **SENSITIVE** — mengangkat pendaftar menjadi siswa |

Promosi menyentuh `master_data`, `siswa_data`, dan `id_card` sekaligus, jadi handler-nya menuntut `pmb.promote` **DAN** `students.manage`. Aturan least-privilege di repo ini berjalan dua arah: jangan meminta izin yang terlalu luas, dan jangan menyembunyikan tulisan berdampak luas di balik izin yang sempit.

---

## 8. Tahapan

### Fase 5.0 — Fondasi workspace (nol tabel baru, nol perubahan skema) — **SELESAI**

- `web-public/` — Next.js + Bun, biome, tsconfig, dependensi minimal (`@libsql/client`, zod). TIDAK ada `@tauri-apps/api`, `@zxing/*`, `exceljs`, atau stack 3D.
- `web-public/src/lib/server/db.ts` — klien Turso read-mostly, lazy seperti `web-desktop/src/lib/db.ts` (Proxy; koneksi lahir saat permintaan dilayani, bukan saat modul di-import). Gagal cepat bila skema belum lengkap; TIDAK pernah provisioning.
- Skrip berbagi `web-public/scripts/sync-shared-lib.ts`, meniru `mobile/scripts/sync-frontend-lib.ts` dengan `filesToCopy` eksplisit dan berkomentar. Isi awalnya: `services/wa-sender.ts`, `operators/contact.ts`, `security/totp.ts` (untuk hash & normalisasi). **JANGAN** menyalin `db-schema.ts` / `db-migrations.ts` — itu justru menciptakan jalur provisioning ketiga yang dilarang bagian 5.
- Root `package.json`: `setup` menambah `bun install --cwd web-public`; `check:quick` dan `check` menambah gerbangnya.
- Perluas cakupan `audit-a11y.ts`, `audit-dialog.ts`, `audit-list-bound.ts`, dan `audit-route-guard.ts` ke `web-public/src`. **`audit-page-guard.ts` TIDAK diperluas** — kriterianya "halaman yang me-redirect ke `/login`", dan portal wali tidak punya `/login` operator; memaksakannya hanya menghasilkan tuduhan palsu, dan audit yang menuduh kode benar akan dimatikan orang.
- Deploy kosong ke Vercel, pastikan `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` terbaca.

**Gerbang:** `bun run check:quick` hijau tanpa satu pun tabel baru.

**Catatan pelaksanaan** (tiga penyesuaian terhadap rencana di atas, semuanya lebih sempit, bukan lebih luas):

1. **Daftar `filesToCopy` dimulai dari dua berkas, bukan tiga yang direncanakan.** Yang disalin sekarang adalah `validations/database-endpoint.ts` + `server/database-config.ts` (beserta tesnya) — keduanya benar-benar dipakai klien database hari ini. `wa-sender.ts`, `operators/contact.ts`, dan `security/totp.ts` baru dipakai di 5.2/5.4, dan menyalinnya sekarang hanya menambah kode mati yang ikut dinilai lint dan typecheck tanpa satu pun pemanggil. Ketiganya sudah tercatat di komentar skripnya lengkap dengan fase pemakaiannya.
2. **`server-only` dideklarasikan sebagai dependensi**, berbeda dari `web-desktop` yang mengandalkan stub bawaan Next. Alasannya: stub itu hanya ada saat `next build`, sehingga `bun test` gagal mengimpor modul apa pun yang memakainya. Penandanya juga dipindah ke tempat yang benar — `db.ts` (yang membaca environment dan membuka koneksi) memakainya; `schema-readiness.ts` tidak, karena ia fungsi murni yang menerima `Client` sebagai argumen dan justru harus bisa diuji.
3. **`audit:confirm` dan `audit:silent-catch` belum diperluas** ke `web-public`. Keduanya memeriksa `try/catch` dan dialog sistem yang belum ada satu pun di sana. Perluas pada 5.2, bersamaan dengan route handler pertama.

Yang terbukti berjalan: `bun run check:quick` dari root — 11 audit + tiga workspace — keluar dengan kode 0, dan `next build` di `web-public` selesai bersih.

### Fase 5.1 — Landing page (masih nol tabel baru) — **SELESAI**

- `/` profil sekolah, `/profil`, `/program`, `/kontak`, `/berita` (statis dulu), `/pmb` (informasi).
- Sumber data: `company_profile` dan kunci branding di `setting_gex_system` — keduanya Kelas A, dibaca saja. Sekolah mengubah nama, logo, dan alamat dari halaman Pengaturan yang sudah ada; landing page ikut berubah tanpa deploy ulang.
- SEO: metadata dinamis, Open Graph, sitemap, robots.txt. Inilah yang tidak mungkin dilakukan di bawah `output: "export"`.
- Revalidasi ISR 5 menit supaya halaman publik tidak memukul Turso tiap kunjungan.

**Catatan pelaksanaan:**

1. **`audit:sql` ikut diperluas ke `web-public`**, di luar empat audit yang disebut Fase 5.0. Alasannya muncul begitu halaman pertama menyentuh database: web-public menyebut tabel dan kolom yang seluruhnya dibuat jalur provisioning lain, dan ia sendiri tidak punya satu pun `CREATE TABLE` yang bisa menambal salah ketik. Jumlah query yang diperiksa naik 1014 → 1017 — ketiganya milik web-public, benar-benar di-`prepare` SQLite terhadap skema sungguhan.
2. **Build produksi tanpa `TURSO_DATABASE_URL` kini DITOLAK**, bukan menghasilkan situs yang tampak sehat. Tanpa penjaga ini, `next build` tetap sukses, setiap halaman jatuh ke cabang "gagal", dan HTML kegagalan itulah yang dibekukan sebagai hasil prerender — dengan `revalidate` 300, setiap pengunjung pada lima menit pertama setelah deploy membaca pesan kegagalan pada situs yang sebenarnya sehat, tanpa satu pun baris merah di log. Yang ditolak HANYA konfigurasi yang belum disetel; skema yang belum lengkap dan database yang sedang tidak terjangkau tetap dilayani halaman dengan anggun, karena keduanya keadaan operasional, bukan kesalahan build.
3. **Tiga keadaan dibedakan di setiap halaman berdata**: `ok`, `belum-siap` (skema belum dipasang — pekerjaan administrator), dan `gagal` (database sedang tidak terjangkau — sementara). Daftar kosong yang sah punya tampilannya sendiri lagi. Menggabungkan keempatnya menjadi satu layar kosong adalah cara membuat kegagalan tidak terlihat sampai ada yang menelepon sekolah.
4. **Tidak ada teks profil, berita, atau jurusan yang ditulis di dalam kode.** Nilai placeholder template (`YOUR COMPANY`, `Your Company Address`, `-`) dikenali dan diperlakukan sebagai "belum diisi": nomor telepon yang dikarang lebih buruk daripada tidak ada nomor, karena pengunjung akan meneleponnya. `/berita` sengaja kosong — tidak ada tabel berita di skema, dan berita yang ditulis di dalam kode menuntut seorang programmer untuk setiap pengumuman sekolah.
5. **`robots.txt` sudah melarang `/wali` dan `/pmb/status`** sebelum keduanya ada, supaya tidak ada jendela waktu di mana halamannya hidup sementara aturannya belum menyusul.

Yang terbukti berjalan: `bun run check:quick` dari root keluar dengan kode 0 (11 audit + tiga workspace); build tanpa konfigurasi gagal dengan pesan yang menyebut perbaikannya; build dengan konfigurasi selesai dengan sembilan rute ber-ISR 5 menit; dan database berkas yang dipakai build itu diperiksa setelahnya — **nol tabel dibuat**, membuktikan aturan nol pada database sungguhan, bukan hanya di test.

### Fase 5.2 — PMB, sisi publik (v26, 3 tabel baru) — **SELESAI**

- Sembilan langkah bagian 5, dijalankan utuh **sebelum** satu baris UI ditulis.
- `/pmb/daftar` — form bertahap, unggah berkas, hasil akhir menampilkan nomor pendaftaran.
- `/pmb/status` — nomor pendaftaran + tanggal lahir (ditingkatkan ke OTP di 5.4, saat `wali_otp` sudah ada).
- Rate limit lewat `auth_login_rate_limit` dengan `rate_key` berprefiks `pmb:daftar:<hash ip>`.
- Semua handler mutasi memakai `assertSameOriginMutation` — `audit:route-guard` menuntutnya, dan form publik tetap same-origin.

**Catatan pelaksanaan:**

1. **Daftar periksanya ternyata kurang satu langkah, dan fase ini yang menemukannya.** Sembilan langkah dijalankan — skema 25 → 26, `REQUIRED_TABLE_COUNT` 54 → 57, ketiga tabel masuk daftar `isDatabaseSchemaReady`, baris `schema_migration` versi 26 dicatat di **kedua** jalur, tidak ada yang masuk `SNAPSHOT_TABLES` maupun `storage.rs`, `sync-rust-modules.ts` dijalankan — lalu cargo test `provisioning_lokal_membangun_seluruh_tabel_cloud` menolak: `CLIENT_SCHEMA_VERSION` di `sync.rs` masih 25 sementara database yang baru diprovisioning sudah 26. Konstanta itu kini menjadi **langkah 9** di bagian 5. Tanpa tes tersebut, kegagalannya tidak akan terlihat sampai perangkat Desktop/Mobile berhenti menyinkronkan setelah pembaruan, karena `is_client_schema_outdated` menganggap klien tertinggal dari cloud yang ia bangun sendiri.
2. **`WEB_ONLY_CLOUD_TABLES` tetap kosong.** Tabel PMB ditulis lengkap di `turso.rs::ensure_schema`, bukan didaftarkan sebagai pengecualian.
3. **Dua tes yang ada sengaja gagal lebih dulu, dan itu memang gunanya.** `rbac-migration.test.ts` mengunci daftar versi migrasi persis, dan `schema-consistency.test.ts` mengunci daftar tabel wajib. Keduanya menolak sampai versi 26 dan ketiga tabel didaftarkan — penjaga yang memaksa setiap penambahan skema disadari, bukan menyelinap.
4. **`audit:confirm` dan `audit:silent-catch` ikut diperluas** ke `web-public`, menepati catatan Fase 5.0. Keduanya lulus: 289 berkas tanpa dialog sistem, 736 blok catch dengan 81 yang sengaja diam dan seluruhnya beralasan tertulis.
5. **`request-security.ts` TIDAK ikut disinkronkan** meski sempat direncanakan. Versi web-desktop melempar `AuthorizationError`, yang menarik seluruh pohon RBAC (`hasPermission`, `PermissionKey`, `OperatorUser`) ke dalam situs yang tidak punya satu pun operator. Yang dibagi adalah ATURAN-nya — `auth/request-origin.ts` kini ada di daftar salin — sementara pembungkus yang melempar ditulis lokal.
6. **Rate limit memakai ulang `auth_login_rate_limit`**, bukan tabel baru: kuncinya sudah generik. Kuncinya diberi prefiks `pmb:` dan alamat IP-nya di-hash — tabel itu bisa dibaca siapa pun yang punya akses database sekolah, dan daftar alamat pengunjung situs publik tidak perlu ikut tersimpan di sana. Percobaan dicatat SEBELUM hasilnya diketahui; mencatat hanya saat gagal membuat seribu pendaftaran palsu yang sah secara format tidak pernah tersentuh rate limit.
7. **Halaman PMB tidak di-cache** (`revalidate = 0`, membatalkan warisan 300 detik dari layout). Halaman yang memberitahu apakah pendaftaran sedang dibuka tidak boleh basi lima menit: versi beku akan mengirim orang mengisi formulir yang sudah ditutup, dan mereka baru tahu setelah seluruh berkas terunggah.
8. **Cek status memakai `POST` meski hanya membaca.** Nomor pendaftaran dan tanggal lahir seorang anak tidak boleh berakhir di query string, tempat mereka tersimpan di riwayat peramban, log server, dan header `Referer`. Balasan untuk "nomor tidak ada" dan "tanggal lahir salah" dibuat identik — perbedaannya saja sudah cukup untuk memetakan nomor mana yang terdaftar.
9. **Nomor pendaftaran memakai alfabet tanpa karakter yang mudah tertukar** (tanpa O/0, I/1, S/5, B/8). Nomor ini dieja lewat telepon oleh orang tua kepada panitia, dan satu karakter salah berarti pendaftaran yang tidak ditemukan.

Yang terbukti berjalan: `audit:schema` hijau dengan 57 tabel di kedua jalur; `audit:sql` naik 1017 → 1024 query, seluruhnya di-`prepare` SQLite terhadap skema sungguhan; `audit:route-guard` 108 endpoint, 108 terjaga; 85 tes web-public lolos, termasuk yang membuktikan `batch("write")` benar-benar satu transaksi (berkas yang ditolak CHECK tidak menyisakan pendaftar setengah jadi) dan bahwa balasan cek status tidak pernah membawa isi berkas.

### Fase 5.3 — PMB, sisi sekolah (tanpa tabel baru) — **SELESAI**

- Halaman `/pmb` di `web-desktop`: daftar pendaftar, detail, pratinjau berkas satu per satu, ubah status, tombol "Jadikan Siswa".
- Jalur data mengikuti preseden Bimbingan Konseling: command Rust yang memanggil `get_turso_client()` langsung, tanpa outbox, tanpa menyentuh empat lapis skema. Halamannya WAJIB menyatakan "butuh jaringan" saat offline, bukan menampilkan daftar kosong.
- Mobile: `assertTersediaDiMobile("Tinjauan PMB")` untuk sekarang. Meninjau berkas identitas dan mengangkat seseorang menjadi siswa adalah pekerjaan layar besar. Bila nanti dibuka, ingat tiga berkas pendaftaran Mobile: `lib.rs`, `build.rs`, dan `capabilities/default.json`.
- Promosi memanggil service `academic.ts` yang sudah ada. Tidak ada satu pun INSERT baru ke `master_data` atau `siswa_data` yang ditulis di fase ini.
- Halaman ini tunduk pada `audit:page-guard`, `audit:ui-guard`, `audit:a11y`, `audit:dialog`, dan `audit:confirm` seperti halaman internal lainnya.

**Catatan pelaksanaan:**

1. **Pengelolaan gelombang ikut dikerjakan, di luar daftar rencana.** Rencana 5.3 hanya menyebut daftar/detail/berkas/status/promosi, tetapi tanpa satu pun gelombang aktif, formulir yang dibangun Fase 5.2 tidak akan pernah bisa dipakai siapa pun — `readGelombangAktif` mengembalikan `null` dan situs publik menampilkan "belum ada gelombang dibuka" selamanya. Tiga command tambahan (`list`/`save`/`delete` gelombang) menutup lubang itu. Penghapusan gelombang yang sudah punya pendaftar ditolak di lapisan aplikasi, karena `pmb_pendaftar.id_gelombang` sengaja tanpa foreign key.
2. **Empat permission baru** (`pmb.view`, `pmb.manage`, `pmb.delete`, `pmb.promote`) di-seed di `turso.rs` **dan** katalog TypeScript; `audit:contract` membandingkan kedua himpunan dan kini melaporkan **70 permission konsisten**. `pmb.delete` dan `pmb.promote` masuk `SENSITIVE_MUTATION_PERMISSIONS` sehingga tidak ikut paket bawaan Admin.
3. **Promosi menuntut DUA izin sekaligus** — `pmb.promote` *dan* `students.manage` — di kedua jalur. Yang pertama izin aksinya, yang kedua izin atas data yang benar-benar disentuh: aksi ini membuat `master_data` + `siswa_data` + `id_card` lalu menyebarkannya ke seluruh perangkat. Least privilege berjalan dua arah.
4. **Tidak ada satu pun INSERT ke `master_data` yang ditulis fase ini.** Pembuatan siswa diserahkan utuh ke `academic::save_student` (Rust) dan `saveStudent` (Web) — jalur yang sudah menangani token QR acak, `qr_code = "{id}|{token}"` yang dituntut kontrak scanner, baris kartu identitas, dan pendaftaran outbox-nya sekaligus.
5. **Urutan promosi disengaja:** siswanya dibuat LEBIH DULU, baris PMB ditandai sesudahnya. Kalau penandaan gagal, yang tersisa adalah siswa yang sudah ada plus pendaftar yang masih `Diterima` — panitia mencoba lagi dan `assert_unique` pada NIS menolak duplikatnya. Urutan sebaliknya menghasilkan pendaftar yang tercatat `Terdaftar` tanpa siswa mana pun yang mewakilinya, dan tidak ada yang akan mencarinya.
6. **Promosi ganda dicegah di DATABASE, bukan di UI.** Klausa `WHERE ... AND status = 'Diterima'` pada `mark_pmb_registered` adalah penjaganya; menyembunyikan tombol hanya menyembunyikannya dari orang yang sopan, sementara dua klik cepat pada perangkat lambat tetap mengirim dua permintaan. `isSubmittingRef` di halaman adalah lapisan kedua, bukan satu-satunya.
7. **`audit:contract` menangkap berkas pendaftaran yang terlewat.** Desktop ternyata juga menuntut `capabilities/default.json` — bukan hanya Mobile seperti yang dicatat CLAUDE.md — dan kesembilan command ditolak sampai izin `allow-desktop-*`-nya didaftarkan. Tanpa audit itu, kegagalannya baru muncul saat runtime Tauri menolak IPC-nya di tangan pengguna.
8. **Mobile ditutup dengan `assertTersediaDiMobile`.** Meninjau berkas identitas seorang anak dan memutuskan mengangkatnya menjadi siswa adalah pekerjaan layar besar, dan berkasnya ratusan kilobyte yang tidak pantas diunduh lewat paket data.
9. **Sebuah tes flaky dari Fase 5.2 terbongkar di sini, dan di baliknya ada bug produksi.** Tes "nomor yang bentrok dicoba ulang" memakai `() => 0.5` sebagai sumber acak tanpa memaku `sekarang`, sehingga ia lulus atau gagal tergantung apakah kedua INSERT jatuh pada milidetik yang sama — lulus di 5.2, gagal di 5.3 tanpa satu baris kode produksi pun berubah. Setelah urutan acaknya diskrip agar benar-benar membenturkan nomor (dan bukan primary key), tes itu membuka masalah yang sebenarnya: `bentrokNomorPendaftaran` mencocokkan **nama index** (`idx_pmb_pendaftar_nomor`), padahal SQLite menyebut **kolomnya** (`UNIQUE constraint failed: pmb_pendaftar.nomor_pendaftaran`). Percobaan ulangnya karena itu tidak pernah aktif, dan bentrok nomor yang seharusnya pulih sendiri akan sampai ke pendaftar sebagai "Terjadi gangguan". Keduanya diperbaiki; tesnya kini deterministik dan diverifikasi dengan menjalankannya berulang kali.

### Fase 5.4 — Portal wali (v27, 2 tabel baru) — **SELESAI**

- Sembilan langkah bagian 5 lagi.
- `/wali` (masuk), `/wali/kehadiran`, `/wali/presensi`, `/wali/rapor`, `/wali/nilai` (placeholder), `/wali/profil`.
- Middleware sesi: **satu** tempat yang membaca cookie, memvalidasi `wali_session`, memastikan siswanya masih `Aktif` dan nomornya belum berubah, lalu menaruh `id_siswa` di konteks permintaan. Tidak ada handler yang membaca `id_siswa` dari tempat lain.
- Rate limit OTP: `wali:otp:<hash nomor>` dan `wali:login:<hash ip>`.
- Tombol "Keluar" mencabut sesi di server, bukan hanya menghapus cookie.

**Catatan pelaksanaan:**

1. **Sepuluh langkah dijalankan utuh**, termasuk langkah 9 yang baru ditemukan di Fase 5.2: skema 26 → 27, `REQUIRED_TABLE_COUNT` 57 → 59, `CLIENT_SCHEMA_VERSION` 26 → 27, kedua tabel masuk `isDatabaseSchemaReady`, baris `schema_migration` versi 27 di kedua jalur, tidak satu pun masuk `SNAPSHOT_TABLES` atau `storage.rs`, dan `sync-rust-modules.ts` dijalankan. Kali ini tidak ada cargo test yang menolak — daftar periksanya sudah lengkap.
2. **`wali_session.id_siswa` sengaja TANPA foreign key** ke `siswa_data`. Tabel itu ikut snapshot, dan `apply_table` boleh menghapus lalu menulis ulang barisnya saat rekonsiliasi; FK berkaskade akan menghapus sesi wali diam-diam di tengah pemakaian, dan gejalanya ("kadang tiba-tiba logout") tidak akan pernah tertelusur ke sinkronisasi. Keberadaan siswanya divalidasi di aplikasi, pada setiap permintaan.
3. **Tiga syarat sesi diperiksa dalam SATU query** — sesi belum kedaluwarsa dan belum dicabut, siswanya masih `Aktif`, dan nomor walinya masih sama dengan yang dibekukan saat sesi lahir. Memisahkannya membuka jendela di mana sesi sudah tidak sah tetapi masih terpakai. Pembekuan nomor itu yang membuat pergantian nomor wali langsung memutus sesi lama: nomor berubah berarti walinya mungkin orang yang berbeda.
4. **`id_siswa` HANYA berasal dari sesi.** Tidak ada satu pun halaman atau endpoint portal yang menerimanya sebagai parameter. Di portal publik, mengganti `?id=` di address bar adalah kelas kerentanan nomor satu, dan konsekuensinya di sini adalah riwayat kehadiran anak orang lain.
5. **Kode OTP dan token sesi disimpan sebagai hash SHA-256**, tidak pernah bentuk aslinya, dan keduanya diuji dengan membandingkan nilai tersimpan terhadap nilai yang dikembalikan. Siapa pun yang bisa membaca database sekolah tidak boleh bisa masuk sebagai wali mana pun.
6. **Layar masuk tidak membedakan NIS yang ada dari yang tidak.** Balasannya selalu berbentuk sama; nomor tersamar hanya muncul bila siswanya memang ada, dan ketika tidak, layar tetap meminta kode. Pola yang sama dengan gerbang 2FA yang berjalan SETELAH password terbukti benar.
7. **Kehadiran dibaca lewat subquery agregasi**, bukan join langsung ke `absensi_harian`. Tabel itu mengizinkan multi-sesi per tanggal, dan join langsung akan menampilkan anak yang sama "hadir dua kali" pada hari yang sama.
8. **`/pmb/status` ditingkatkan ke OTP — dengan jalur cadangan.** Modenya ditentukan SERVER (`pilihModeCekStatus`): OTP bila gateway WhatsApp aktif, tanggal lahir bila belum. Membiarkan klien memilih akan membuat jalur OTP sekadar hiasan. Cabang cadangannya ADA karena pelajaran yang sudah dibayar mahal: email yang belum dikonfigurasi pernah membuat "Lupa Password" mati total di seluruh pemasangan Mode Database Lokal. Tanpa cadangan, sekolah yang belum menyambungkan gateway akan memasang situs PMB yang menerima pendaftaran tetapi tidak pernah bisa memberitahu hasilnya.
9. **`wa-provider.ts` diekstrak dari `wa-sender.ts`** supaya web-public bisa mengirim OTP tanpa ikut membawa mesin antrean (`drainWaQueue`, pemangkasan retensi, tabel `notifikasi_wa`) yang tidak punya satu pun pemanggil di sana. Satu implementasi kontrak provider, dua pemakai — aturan yang ditulis dua kali akan salah di salah satunya, dan yang membayar tagihan pesan gagal adalah sekolah.
10. **`security/totp.ts` TIDAK jadi disinkronkan** meski direncanakan. OTP di sini enam digit acak yang di-hash SHA-256 lewat WebCrypto, bukan kode berbasis waktu; menyalin modul TOTP hanya untuk satu fungsi hash akan membawa seluruh aritmetika HOTP/RFC 6238 yang tidak punya pemanggil. Alasannya dicatat di daftar "sengaja tidak disalin".
11. **Satu bug tertangkap saat menulis:** query presensi mapel memakai `pmd.status_kehadiran` dan `pmd.keterangan`, padahal kolomnya bernama `status` dan `catatan`. Ketahuan sebelum sempat dijalankan, dan `audit:sql` — yang kini mem-`prepare` 1.059 query terhadap skema sungguhan — adalah jaring yang menangkapnya kalau terlewat.

### Fase 6 — Modul nilai

Dimulai dari sisi guru di `web-desktop`, empat lapis skema penuh, `SNAPSHOT_TABLES` bertambah, rute outbox kanonik baru. Tab `/wali/nilai` diisi setelahnya.

---

## 9. Yang sengaja TIDAK dikerjakan

- **Pembayaran online.** Menerima uang menuntut rekonsiliasi, refund, dan jejak audit keuangan yang setara dengan payroll. Fase 5 mencatat `biaya_pendaftaran` sebagai informasi; pembayarannya di luar sistem.
- **Wali menyunting data anaknya.** Portal ini HANYA BACA. Satu-satunya tulisan yang dilakukan sesi wali adalah `last_seen_at` miliknya sendiri.
- **Akun wali dengan password.** Lihat bagian 4.
- **Login wali di Desktop/Mobile.** Dua build itu untuk staf sekolah.
- **Notifikasi push.** `notifikasi_wa` sudah melayaninya dari sisi sekolah.
