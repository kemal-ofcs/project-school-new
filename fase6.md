Sistem Manajemen & Absensi Sekolah — Fase 6

Modul Nilai Akademik
Fase pertama sejak Fase 4 yang menambah tabel ke dalam **mesin sinkronisasi**. Empat fase terakhir menambah tabel cloud-only yang tidak pernah menyentuh outbox; yang ini menyentuh keempat lapisnya sekaligus, dan di sana kesalahan bersifat permanen.

    Versi skema        27 → 28
    Tabel cloud        59 → 61
    Tabel snapshot     35 → 37   (pertama kali bertambah sejak Fase 4)
    Rute kanonik       76 → 81
    Permission         +3

---

## 1. Kenapa fase ini berbeda, dan apa yang membuatnya berisiko

Tabel Fase 5 semuanya **cloud-only**: ditulis langsung dalam keadaan online, bentroknya muncul seketika sebagai error HTTP yang bisa dijawab. Tabel Fase 6 **melewati outbox**, dan itu mengubah setiap keputusan:

- **UNIQUE selain primary key DILARANG.** Dua guru offline boleh menilai kelas yang sama; penolakan cloud akan menghentikan event-nya di `failed` dengan `next_retry_at = NULL` — datanya hilang tanpa jalan pulih dari UI. Keunikan ditegakkan di lapisan aplikasi (`assert_unique`), seperti yang sudah dilakukan `hari_libur_whitelist` dan tabel akademik lain.
- **Primary key TEXT buatan klien**, bukan AUTOINCREMENT. Angka AUTOINCREMENT berbeda di tiap perangkat, dan baris yang sama akan lahir dua kali dengan id berlainan.
- **Kolomnya harus identik di EMPAT lapis** — `SNAPSHOT_TABLES` (sync.rs), DDL lokal (storage.rs), DDL cloud (turso.rs + db-migrations.ts), dan validator Zod (sync-schema.ts). Kolom yang hanya ada di satu sisi membuat push gagal "no such column" pada perangkat yang tidak memilikinya.
- **`SNAPSHOT_SOURCES` wajib 100% paritas dengan `SNAPSHOT_TABLES`**, karena ia yang membangkitkan SELECT snapshot sekaligus memasang trigger `sync_pulse` di cloud.

Semuanya diverifikasi mesin oleh `audit:schema` bagian 4 dan `audit:contract`. Tidak ada satu pun yang boleh dikerjakan "nanti".

---

## 2. Bentuk datanya: meniru `presensi_mapel`, bukan menciptakan pola baru

Struktur header-detail yang sudah terbukti end-to-end di repo ini dipakai ulang apa adanya:

| Fase 6 | Cerminannya yang sudah ada |
| --- | --- |
| `nilai_penilaian` (header) | `presensi_mapel` |
| `nilai_siswa` (detail) | `presensi_mapel_detail` |

Satu **penilaian** adalah satu peristiwa menilai: ulangan harian, tugas, praktik, UTS, atau UAS — untuk satu mapel pada satu rombel di satu semester. Satu **nilai siswa** adalah skor seorang anak pada penilaian itu.

Kenapa header-detail dan bukan satu tabel lebar: bobot, KKM, dan tanggal dimiliki penilaiannya, bukan tiap skor. Menyalinnya ke setiap baris nilai berarti 30 salinan per kelas yang bisa saling bertentangan setelah sinkronisasi.

### `nilai_penilaian`

```sql
id_penilaian TEXT PRIMARY KEY          -- nil-<epoch>-<48 bit acak>
id_tahun_ajaran TEXT NOT NULL
semester TEXT NOT NULL CHECK (semester IN ('Ganjil', 'Genap'))
id_rombel TEXT NOT NULL
id_mapel TEXT NOT NULL
id_guru TEXT NOT NULL
jenis TEXT NOT NULL
  CHECK (jenis IN ('Tugas', 'Ulangan Harian', 'Praktik', 'UTS', 'UAS'))
nama_penilaian TEXT NOT NULL
tanggal TEXT NOT NULL
bobot INTEGER NOT NULL DEFAULT 1       -- bobot relatif dalam jenisnya
kkm INTEGER NOT NULL DEFAULT 75        -- dibekukan dari akademik_mapel saat dibuat
nilai_maks INTEGER NOT NULL DEFAULT 100
catatan TEXT
created_at TEXT NOT NULL
updated_at TEXT NOT NULL
```

`kkm` **dibekukan** dari `akademik_mapel.kkm` saat penilaian dibuat, bukan di-join saat dibaca. Alasannya sama dengan `payroll_runs` yang menyimpan tarif yang dipakainya: KKM yang diubah admin di tengah semester tidak boleh mengubah penilaian yang sudah berlangsung dan sudah dilihat orang tua.

### `nilai_siswa`

```sql
id_nilai TEXT PRIMARY KEY              -- nis-<epoch>-<48 bit acak>
id_penilaian TEXT NOT NULL
id_siswa TEXT NOT NULL
skor REAL                              -- NULL = belum dinilai
keterangan TEXT
created_at TEXT NOT NULL
updated_at TEXT NOT NULL
```

**`skor` NULL berarti BELUM DINILAI, bukan nol.** Ini perbedaan yang paling mudah salah dan paling mahal: seorang anak yang belum sempat mengumpulkan tugas bukan anak yang mendapat nol. Setiap agregasi wajib memakai `AVG(skor)` yang mengabaikan NULL, tidak pernah `COALESCE(skor, 0)`. Diuji secara eksplisit.

**Tidak ada FOREIGN KEY sama sekali.** `id_penilaian`, `id_siswa`, `id_rombel`, `id_mapel` semuanya divalidasi di lapisan aplikasi. Dua alasan: `apply_table` menghapus lalu menulis ulang baris saat rekonsiliasi, sehingga FK berkaskade bisa menghapus nilai yang sah; dan urutan penerapan snapshot antar-tabel tidak dijamin, sehingga detail bisa tiba sebelum headernya.

---

## 3. Rute kanonik baru (76 → 81)

```
("grade", "create")          buat penilaian baru
("grade", "update")          ubah judul/bobot/tanggal penilaian
("grade", "delete")          hapus penilaian beserta seluruh nilainya
("grade-detail", "save")     simpan/ubah skor satu siswa
("grade-detail", "delete")   hapus skor satu siswa (misal siswa pindah rombel)
```

Penghapusan penilaian WAJIB mendaftarkan event `grade-detail/delete` untuk setiap detail yang ikut dibuang — pelajaran `save_class_attendance`: detail basi yang dibiarkan membuat header dan detail tidak sinkron dan menghasilkan rekonsiliasi palsu.

---

## 4. Permission (+3)

| Permission | Untuk |
| --- | --- |
| `grades.view` | melihat daftar penilaian dan nilai |
| `grades.manage` | membuat penilaian dan menginput nilai |
| `grades.delete` | **SENSITIVE** — menghapus penilaian beserta seluruh nilai kelas |

`grades.delete` masuk `SENSITIVE_MUTATION_PERMISSIONS` dengan alasan yang sama seperti `class_attendance.delete`: menghapus satu penilaian memusnahkan skor seluruh kelas untuk peristiwa itu, dan tidak ada jalan memulihkannya selain menilai ulang.

Area baru `nilai` → `grades.view`. `grades.view` ditambahkan ke paket bawaan role **operator** supaya role yang ada hari ini tidak terkunci dari halaman yang akan mereka pakai — periksa `DEFAULT_ROLE_PERMISSIONS` sebelum memasang penjaga area.

---

## 5. Sepuluh langkah skema, plus tujuh yang khusus untuk tabel TERSINKRONISASI

Sepuluh langkah bagian 5 `fase5.md` berlaku utuh (versi 27 → 28, `REQUIRED_TABLE_COUNT` 59 → 61, `CLIENT_SCHEMA_VERSION` 27 → 28, dan seterusnya). Karena tabel ini ikut sinkronisasi, TUJUH langkah berikut menyusul — dan tidak satu pun opsional:

11. **DDL lokal di `storage.rs`.** Tanpa ini perangkat tidak punya tempat menyimpannya dan seluruh fiturnya mati offline.
12. **Entri di `SNAPSHOT_TABLES`** (`sync.rs`) dengan daftar kolom yang sama persis.
13. **Entri di `SNAPSHOT_SOURCES`** (`turso.rs`) — paritas 100% dengan langkah 12, karena ia juga yang memasang trigger `sync_pulse`.
14. **Rute di `CANONICAL_SYNC_ROUTES`** (`sync.rs`) dan handler `apply_event_to_turso` di `turso.rs`.
15. **Validator Zod `.strict()`** di `sync-schema.ts`, enum-nya sama persis dengan CHECK constraint.
16. **Modul `grades.rs` ditambahkan ke `filesToSync`** di `mobile/scripts/sync-rust-modules.ts`, dan dideklarasikan di `mod.rs` KEDUA workspace (berkas itu tidak ikut disinkronkan).
17. **Klasifikasi pindah database** di `CLOUD_MIRRORED_TABLES` (`storage.rs`), **di kedua workspace** — `storage.rs` tidak ikut `sync-rust-modules.ts`. Setiap tabel lokal wajib diputuskan nasibnya saat perangkat pindah ke database sekolah lain: ikut dibuang, atau milik perangkat. Nilai ikut dibuang — skor seorang anak milik sekolah tempat ia bersekolah, dan membiarkannya tertinggal membuat nilai dari database lama muncul di kelas database baru. *(Langkah ini semula tidak ada di daftar; ia ditemukan oleh dua cargo test — `every_local_table_is_classified_for_database_switch` dan `every_snapshot_table_is_purged_on_database_switch` — yang menolak setiap tabel baru yang belum diklasifikasikan.)*

Gerbangnya: `audit:schema` bagian 4 memeriksa setiap kolom `SNAPSHOT_TABLES` ada di sisi lokal DAN cloud; `audit:contract` memeriksa rute kanonik dan pendaftaran command; `audit:sql` mem-`prepare` setiap query baru terhadap skema sungguhan.

---

## 6. Tahapan

### Fase 6.0 — Skema empat lapis + jalur sinkronisasi — **SELESAI**
Enam belas langkah di atas, tanpa satu pun halaman. Selesai ketika `bun run check` hijau dan `audit:schema` melaporkan 37 tabel snapshot konsisten di kedua workspace.

**Catatan pelaksanaan:**

1. **Angka yang terbukti:** `audit:schema` melaporkan **399 kolom pada 37 tabel snapshot hadir di kedua sisi** dan **61 tabel wajib dibuat kedua jalur**; `audit:contract` melaporkan **81 rute kanonik** dan **73 permission** konsisten di kedua workspace; `audit:sql` naik 1.059 → **1.066 query** yang di-`prepare` SQLite terhadap skema sungguhan.
2. **`audit:schema` menangkap `storage.rs` Mobile yang terlewat.** Berkas itu TIDAK ikut `sync-rust-modules.ts` — Mobile memakai nama database (`mobile-security.db`) dan nama migrasi sendiri — sehingga DDL lokalnya harus disunting tangan di kedua workspace. Audit bagian 3 ("Skema SQLite lokal Desktop = Mobile") yang menolak sampai bloknya ditambahkan. Tanpa itu, Mobile akan menarik snapshot nilai ke tabel yang tidak ada, dan seluruh siklus sinkronisasinya gagal di perangkat yang justru paling dipakai guru.
3. **`kkm` tidak ikut `excluded` pada `ON CONFLICT DO UPDATE`.** Ia dibekukan saat penilaian dibuat. Tanpa pengecualian itu, KKM yang diubah admin di tengah semester akan menulis ulang penilaian yang sudah berlangsung dan sudah dilihat orang tua — pola yang sama dengan `payroll_runs` yang menyimpan tarif yang dipakainya.
4. **`grade/delete` menghapus detailnya lebih dulu, dalam urutan eksplisit.** Tidak ada FOREIGN KEY yang melakukannya — tabel tersinkronisasi sengaja tanpa FK — jadi urutan itulah yang mencegah baris nilai yatim yang tetap ditarik setiap perangkat tanpa induk mana pun.
5. **`skor` NULL diuji secara eksplisit**, bukan diasumsikan. Lima tes baru di `sync-schema.test.ts` memastikan NULL diterima, angka diterima, kolom asing ditolak (`.strict()`), dan nilai enum di luar CHECK constraint ditolak SEBELUM sempat menjadi push yang mati permanen dengan `next_retry_at = NULL`.
6. **`grades.view` ditambahkan ke paket bawaan role operator.** `DEFAULT_ROLE_PERMISSIONS` diperiksa lebih dulu: permission yang absen dari paket bawaan akan mengunci role yang sudah ada dari halaman yang akan mereka pakai begitu Fase 6.1 hidup.

### Fase 6.1 — Sisi guru di `web-desktop` — **SELESAI**
Halaman `/nilai`: pilih rombel + mapel + semester, buat penilaian, input skor sekelas dalam satu tabel, simpan dalam satu transaksi. Offline-capable lewat outbox, seperti presensi kelas.

**Catatan pelaksanaan:**

1. **`grades.rs`** menulis SQLite lokal + mendaftarkan event outbox dalam SATU transaksi. Menulis lokal tanpa event berarti nilai yang hanya ada di satu perangkat; mendaftarkan event tanpa tulisan lokal berarti guru tidak melihat apa yang baru ia simpan.
2. **Lima command** terdaftar di `lib.rs`, `build.rs`, dan `capabilities/default.json` — Desktop juga menuntut berkas ketiga itu, bukan hanya Mobile.
3. **Invarian `skor` NULL dijaga di enam titik**: kolom nullable, `Value::as_f64()` tanpa `unwrap_or(0.0)` di Rust, `?? 0` yang tidak pernah ditulis di TS, input yang menyimpan STRING (bukan number) supaya kosong bisa dibedakan dari nol, `AVG(skor)` yang mengabaikan NULL, dan `rata_rata === null` yang dirender `—` bukan `0,0`.
4. **Roster dari `siswa_data` LEFT JOIN ke `nilai_siswa`**, bukan sebaliknya. Mengambil dari tabel nilai menyembunyikan anak yang belum punya baris — justru anak yang paling perlu dinilai.
5. **Keunikan nama penilaian ditegakkan di aplikasi**, bukan UNIQUE constraint, karena tabel ini melewati outbox.

### Fase 6.2 — Mobile — **SELESAI**
`commands.rs` dan `grades.rs` ikut tersinkronisasi otomatis lewat `sync-rust-modules.ts`; gateway dan tipenya lewat `sync-frontend-lib.ts`. Yang dikerjakan tangan hanya tiga berkas pendaftaran dan halamannya.

**Catatan pelaksanaan:**

1. **TIDAK ada `assertTersediaDiMobile` di gateway nilai** — berbeda dari PMB. Modul ini ikut sinkronisasi dan menulis ke SQLite lokal, jadi ia bekerja penuh tanpa jaringan, dan itu justru alasan halaman Mobile-nya ada: guru menilai di kelas, membawa ponsel, bukan laptop.
2. **Halaman Mobile HANYA mengisi skor.** Membuat dan menghapus penilaian sengaja ditinggalkan di layar besar: keduanya menyentuh struktur yang dipakai seluruh kelas, sementara ponsel dipakai untuk pekerjaan yang benar-benar dilakukan di ruang kelas.
3. **Penjaga area memakai `router.replace("/dashboard")`**, bukan `redirect("/forbidden")` — Mobile memakai static export dan tidak punya rute itu.
4. **Komponen Mobile punya kontrak props sendiri** (`message`/`type`/`onClose` pada `FeedbackBanner`), sesuai catatan CLAUDE.md bahwa `src/components` sengaja tidak disinkronkan.

### Fase 6.3 — Portal wali — **SELESAI**
Tab `/wali/nilai` diisi: daftar penilaian per mapel beserta skor anaknya dan KKM yang berlaku saat itu. **Rata-rata akhir dan rapor TIDAK ikut** — itu memerlukan pembekuan seperti `leger_kehadiran`, dan pembekuan nilai adalah keputusan akademik yang pantas mendapat fasenya sendiri.

**Catatan pelaksanaan:**

1. **TIGA keadaan dibedakan, bukan dua**: modul nilai belum ada di database sekolah itu (skema masih di bawah v28), modul ada tetapi guru belum memasukkan nilai, dan gagal dibaca. Menggabungkannya menjadi satu layar kosong membuat orang tua menyimpulkan anaknya tidak punya nilai sama sekali — kesimpulan yang salah pada dua dari tiga keadaan itu.
2. **`MINIMUM_SCHEMA_VERSION` TIDAK dinaikkan ke 28.** Konstanta itu menjaga SELURUH situs; menaikkannya akan mematikan landing page dan PMB pada sekolah yang databasenya masih v27, hanya karena satu tab portal wali belum punya tabelnya. Ketersediaan modul diperiksa per halaman lewat `modulNilaiTersedia`.
3. **Rata-rata kelas dan peringkat SENGAJA tidak ditampilkan.** Portal ini memperlihatkan satu anak kepada walinya, bukan posisinya terhadap teman-temannya. Angka pembanding mengubah percakapan di rumah dari "bagaimana kamu belajar" menjadi "kenapa kamu kalah", dan sekolah tidak bisa menariknya kembali.
4. **`skor` NULL dirender "Belum dinilai"**, bukan 0. Ini titik paling mahal dari invarian itu: di layar guru angka nol keliru, di layar orang tua ia menuduh.

### Paritas Mobile (disisipkan atas permintaan pengguna)

Prinsipnya dinyatakan langsung: **fitur yang ada di Desktop harus ada juga di Mobile.** Dua keputusan sesi ini dibalik karenanya:

- **Nilai di Mobile** bukan lagi hanya mengisi skor — membuat dan menghapus penilaian ikut, dengan permission dan konfirmasi merusak yang sama.
- **PMB dibuka untuk Mobile**: `assertTersediaDiMobile` dicabut, kesembilan command didaftarkan di `lib.rs`, `build.rs`, dan `capabilities/default.json` Mobile, dan halaman tinjauannya dibuat.

Alasan lama — "pekerjaan layar besar" — keliru sebagai aturan: banyak guru dan panitia tidak memegang laptop sama sekali, sehingga fitur yang hanya ada di Desktop sama saja dengan fitur yang tidak ada bagi mereka. Yang membedakan Mobile adalah tata letaknya, bukan kewenangannya. Yang tetap dipertahankan dari kekhawatiran lama hanyalah soal ukuran: berkas identitas tetap diambil satu per satu lewat endpoint terpisah, tidak pernah ikut daftar maupun detail.

**Belum disamakan:** tinjauan notifikasi WhatsApp di Mobile masih hanya-baca. Itu aturan yang tertulis di CLAUDE.md, bukan keputusan sesi ini, dan pengguna menundanya sampai Fase 6 tuntas.

---

## 7. Yang sengaja TIDAK dikerjakan di Fase 6

- **Perhitungan nilai akhir dan rapor.** Membekukan nilai akhir adalah analog `leger_kehadiran` untuk nilai, dan rumus pembobotannya adalah kebijakan tiap sekolah. Menebaknya sekarang berarti menuliskan kebijakan yang salah untuk hampir semua pemakai.
- **Bobot lintas jenis penilaian** (misal "UAS 40%, UTS 30%, harian 30%"). Satu angka `bobot` relatif di dalam jenisnya sudah cukup untuk Fase 6; pembobotan lintas jenis ikut ke fase pembekuan.
- **Impor nilai dari Excel.** Jalur impor punya aturan validasinya sendiri dan pantas menyusul setelah input manualnya terbukti.
