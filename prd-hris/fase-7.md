# PRD HRIS — Fase 7

Bagian §25 dari `prd-hris.md`. Istilah, keputusan pemilik (§5), hak akses umum (§15), dan sinkronisasi (§17) ada di `prd-hris.md`. Invarian HRIS v68–v71 dan Fase 6 ada di `references/18-hris-kepegawaian.md`. Aturan bisnis rekrutmen dan pelatihan diambil dari HRIS perusahaan (`C:\dev\absensi-perusahaan\prd-hris.md` §11.2 dan §22, Q-86 sampai Q-100); kodenya tidak disalin.

## 25. Urutan pengerjaan Fase 7

Ditulis setelah menelusuri kode sekolah (19 Nov 2026), sesudah Fase 6 lengkap
(§24.11). Bila §13 atau §17 (baris Fase 7) berbeda dengan bagian ini, **bagian
ini yang berlaku** setelah Q-130 sampai Q-151 dijawab (disetujui semua,
§25.10). Belum ada kode yang diubah.

Ringkasnya: **skema v72, sentinel `-2048` (`hris-rekrutmen-pelatihan-v1`),
enam tabel KHUSUS CLOUD, lima izin baru, tanpa tabel snapshot dan tanpa rute
sync baru.** Dua modul aturan kembar baru: `desktop/hr_rekrutmen.rs` ↔
`validations/hr-rekrutmen.ts` + `services/hr-rekrutmen.ts`, dan
`desktop/hr_pelatihan.rs` ↔ `validations/hr-pelatihan.ts` +
`services/hr-pelatihan.ts`. "Jadikan personil" tidak menulis `master_data`
sendiri: ia memanggil `save_teacher` atau `create_employee` yang sudah ada, lalu
kontrak lewat `simpan_kontrak` yang sudah ada, dengan id deterministik supaya
bisa diulang.

### 25.1 Temuan dari kode

Diverifikasi ke kode sekolah (baris per 19 Nov 2026). Angka "sebelum" dari
`bun run audit:contract` (19 Nov 2026): 145 rute kanonik, 81 tabel snapshot,
430 command Desktop, 435 command Mobile, 131 permission; 320 berkas `route.ts`
di `web-desktop/src/app/api`.

**Salah atau perlu diubah:**

1. **Lima tabel di §17 tidak cukup.** CV pelamar butuh tabel berkas sendiri
   (`hr_pelamar_berkas`), sama seperti `hr_dokumen_berkas` dan
   `hr_pengajuan_berkas`. Fase 7 = **enam** tabel.
2. **Izin baru berarti versi skema baru.** `hr.training.*` dan `hr.recruit.*`
   belum ada di `PERMISSION_CATALOG` (`rbac/catalog.ts`, daftar HR berakhir di
   `hr.performance.config` `:587`). Seed `app_permission` dan
   `ROLE_HRIS_BAWAAN` (`turso.rs:724`) hanya dijalankan `ensure_schema`, yang
   dilewati selama sentinel `-2047` ada (`turso.rs:6143`); Web hanya migrasi
   bila `MAX(version) < CURRENT_SCHEMA_VERSION` (`db-schema.ts:5`). Jadi v72 +
   sentinel `-2048`, dan `is_client_schema_outdated` (`sync.rs:27`) menghentikan
   sinkron setiap perangkat v71 sampai diperbarui (sama dengan temuan 3 Fase 3).
3. **Tabel khusus cloud tidak menyentuh empat lapisan**, dan tidak ada yang
   "dibuang saat pindah database" (§17). Tabel khusus cloud hanya ada di
   `turso.rs::ensure_schema` + `db-migrations.ts` + daftar
   `isDatabaseSchemaReady` (`db-schema.ts:55`) + `PROMOTION_PLAN`
   (`server/database-promotion.ts:41`, baris HR di `:154-182`) + daftar
   `expectedCloudOnlyTables`
   (`.agents/skills/absensi-sppg-rules/scripts/audit-sync-contract.ts:97`).
   Tidak ada salinan di SQLite perangkat, jadi tidak ada yang dibuang.
4. **Tidak ada runner pembersihan.** HRIS perusahaan menjalankan retensi
   pelamar dari `AutoFotoCleanupRunner`; sekolah tidak punya runner itu
   (`AppShell.tsx:30-35`: Alfa, Sync, WA, Telegram, Pemberitahuan, Bel).
   Yang paling dekat: `useKetukBerkala` di `AutoPemberitahuanRunner.tsx:18`
   (ketuk tiap 30 menit, pertama 60 detik sesudah login, galat hanya ke
   konsol). Retensi memakai satu ketukan baru di sana (Q-140).
5. **Pengingat dokumen menyatukan semua sertifikat pelatihan seorang pegawai.**
   `PENGINGAT_DOKUMEN_SQL` (`hr_pengingat.rs:75`) hanya mengambil dokumen
   ber-`tanggal_kedaluwarsa` terakhir per **(pegawai, jenis)**. Bila semua
   sertifikat pelatihan berjenis `dok-pelatihan` (`hris.rs:37`), sertifikat K3
   yang habis Desember tidak diingatkan selama sertifikat Pramuka yang sama
   pegawainya habis tahun depan. Usulan: sertifikat dari layar pelatihan boleh
   memilih jenis dokumen aktif mana pun (bawaan `dok-pelatihan`), sehingga
   sertifikat yang memang saling menggantikan memakai jenis sendiri
   ("Sertifikat K3"); SQL Fase 6 tidak diubah (Q-147).
6. **Data pribadi tidak bisa diisi dari pelamar di Desktop pada saat
   "Jadikan personil".** Setiap tulisan cloud-only pegawai mensyaratkan
   `master_data` sudah ada di cloud (`SIMPAN_PRIBADI_SQL` `hris_cloud.rs:47`,
   `SIMPAN_DOKUMEN_SQL` `:70`, pesan `PESAN_PEGAWAI_BELUM_DI_CLOUD` `:36`),
   sedangkan Desktop menulis `master_data` ke SQLite + outbox dulu. Isian awal
   `hr_profil` (Q-94 perusahaan) baru bisa sesudah outbox terdorong. Usulan:
   tidak diisi otomatis (Q-139).
7. **Pembuatan personil dan kontrak tidak bisa satu transaksi.**
   `create_employee` (`operational.rs:185`) dan `save_teacher`
   (`academic.rs:1683`) masing-masing membuka koneksi dan transaksinya sendiri;
   `simpan_kontrak` (`hris.rs:1243`) juga, dengan id acak `new_id("kon-")`
   (`:1253`). Yang bisa: setiap langkah dibuat aman diulang. `SIMPAN_KONTRAK_SQL`
   sudah `INSERT OR IGNORE` (`hris.rs:327`), jadi kontrak berid deterministik
   berhenti di PK; `create_employee` menolak `id_unik` yang sudah ada
   (`assert_employee_identity_free` `:57`), dan `save_teacher` dengan
   `is_edit = false` juga (`academic.rs:1733-1750`).
8. **Web `tambahKaryawan` tidak atomik** (`services/employee.ts:330`: tiga
   `db.execute` terpisah untuk `master_data`, `id_card`, organisasi), sedangkan
   `saveTeacher` Web memakai `db.batch` (`services/academic/personnel.ts:148`).
   Fase 7 tidak memperbaikinya; urutan langkah yang aman diulang (§25.2.3)
   menutup celahnya untuk jalur rekrutmen (dicatat di §25.6).
9. **Jurnal otomatis biaya pelatihan butuh membangun ulang tabel.**
   `keu_jurnal.sumber` punya CHECK tetap (`db-migrations.ts:1898`: `Manual`,
   `Kasbon`, `Payroll`, `Pembayaran`, `Tagihan`, `Inventaris`, `Cicilan`,
   `Pembatalan`). Menambah `Pelatihan` berarti rebuild tabel tersinkron di
   cloud dan setiap SQLite perangkat. Usulan: biaya hanya dicatat (Q-146).
10. **`hr_profil` tidak punya kolom pendidikan** (`db-migrations.ts:3566-3590`);
    pendidikan ada di `hr_pendidikan` dengan CHECK jenjang
    (`:3596`: SD … S3). Kolom `pendidikan` pelamar memakai daftar jenjang yang
    sama.

**Sudah ada dan dipakai ulang:**

- **Preseden "jadikan" di sekolah:** `desktop_promote_pmb_registrant`
  (`commands.rs:5412`) membaca pendaftar dari cloud, menyerahkan pembuatan
  siswa utuh ke `academic::save_student` (`:5482`), lalu menandai cloud
  (`:5497`). Tidak ada penulis `master_data` kedua. Fase 7 memakai pola yang
  sama, dengan satu beda urutan (klaim dulu, §25.2.3) karena guru/tendik tidak
  punya kunci alami seperti NIS.
- **Token dan QR:** `token_from_event` (`operational.rs:45`) dipakai
  `create_employee` (`:199-200`, `qr_code = "{id}|{token}"`) dan
  `ensure_scan_token` di `save_teacher` (`academic.rs:113-116`, token lama
  dipertahankan); Web `generateRandomToken(10)` (`services/employee.ts:342`) dan
  `ensureScanToken` (`services/academic/shared.ts:101`).
- **`id_card` `WHERE NOT EXISTS`:** `operational.rs:291-293`,
  `academic.rs:1914-1918`, dan kembaran Web.
- **Peran personil:** `save_teacher` menulis `jenis_personil = 'GURU'`
  (`academic.rs:1835`, `:1849`); `create_employee` bawaan `'Pegawai'`
  (`operational.rs:267-271`). `normalizePersonnelRole`
  (`contracts/scanner.ts:54`) memetakan keduanya ke `Guru`/`Pegawai` untuk
  scanner dan template kartu. "Jadikan personil" tidak pernah menulis
  `jenis_personil` sendiri.
- **Kontrak:** `validasi_kontrak(isian, guru)` (`hris.rs:376`; GTY/GTT hanya
  guru), `STATUS_KONTRAK` tujuh nilai (`:284`), `CERMIN_STATUS_SQL` ditulis
  bersama kontrak, outbox `hr-contract/create`; Web `simpanKontrak`
  (`services/hris.ts:355`).
- **Pembuat id pegawai:** `createEmployeeIdentifiers(uuid)`
  (`validations/stabilization.ts:33`) → `EMP_<12>` / `K<8>`; id guru
  `ptk_<32 hex>` (`new_academic_id`, `academic.rs:60`).
- **Berkas:** `urai_berkas_dokumen` ↔ `uraiBerkasDokumen` (`hris_cloud.rs:341`:
  1 MB, JPEG/PNG/WEBP/PDF, tanda tangan bita), daftar tanpa `data_base64`.
- **Dokumen:** jenis `dok-pelatihan` "Sertifikat Pelatihan" sudah di seed
  (`hris.rs:37`); `simpan_dokumen`, `tambah_berkas`, `hapus_dokumen`
  (`hris_cloud.rs:619`, `:655`, `:646`; `HAPUS_DOKUMEN_SQL` dua statement
  `:72`); `tanggal_kedaluwarsa` sudah dibaca pengingat Fase 6.
- **Cloud-only:** `luring` + `PESAN_LURING` (`hris_cloud.rs:415`, `:35`),
  `ensure_schema_current` (`turso.rs:6125`), `execute_atomic`.
- **Hari ini WIB dari database:** `HARI_INI_SQL` (`hris.rs:330` ↔
  `validations/hris.ts:983`).
- **Nomor HP:** `normalize_operator_phone` (`turso.rs:16940`) ↔
  `normalizeOperatorPhone` (`operators/contact.ts:28`).
- **Konfirmasi hapus permanen:** `KONFIRMASI_HAPUS_PERMANEN` = "Hapus Permanen"
  (`validations/inventory.ts:1506`).
- **Pegawai yang boleh menjadi peserta:** `PEGAWAI_SQL` (`hris.rs:25`) +
  `status_aktif = 'Aktif'` + `id_keluar` kosong (aturan pegawai Fase 6).
- **Layar:** `/kepegawaian` dengan baris tab (`app/kepegawaian/page.tsx:64`),
  `RincianPegawai` bertab (`components/kepegawaian/RincianPegawai.tsx`),
  `PilihCari`, `KonfirmasiSimpan`.

**Kait:**

- **Fase 6:** sertifikat pelatihan yang diberi tanggal kedaluwarsa otomatis
  ikut kartu "Perlu perhatian" dan Telegram `dokumen_kedaluwarsa` tanpa kode
  baru (dengan batas temuan 5).
- **Area:** `canAccessArea(user, "kepegawaian")` = `employees.view` atau
  `teachers.view` (`auth/access.ts:108`). Role yang hanya memegang izin Fase 7
  tidak bisa membuka halaman; paket bawaan yang diusulkan semuanya sudah
  memegang `employees.view` (§25.4).
- **Gaji, absensi, scanner:** tidak disentuh. Personil hasil rekrutmen masuk
  scanner, gaji, dan kartu ID lewat jalur pembuatan yang sudah ada.

### 25.2 Rancangan per bagian

#### 25.2.1 Lowongan

`validasi_lowongan` ↔ `validasiLowongan`:

- `judul` 1–100 (mis. "Guru Matematika SMP"); `kelompok` wajib, `Guru` atau
  `Tendik` (menentukan jalur pembuatan personil, jenis kontrak yang sah, dan
  boleh tidaknya tahap Microteaching); `unit` = **nama** `akademik_unit` aktif
  (id unit dibuat per perangkat, §7.1), boleh kosong untuk lowongan yayasan;
  `id_bagian` dan `id_jabatan` opsional, bila diisi harus ada dan aktif;
  `jumlah` 1–99; `tanggal_buka` wajib; `tanggal_tutup` opsional dan ≥
  `tanggal_buka`; `keterangan` ≤ 2.000.
- Nama bagian, jabatan, dan unit dibaca hidup (`LEFT JOIN`), tidak disalin.
- **Status diturunkan** (`status_lowongan` ↔ `statusLowongan`, hari ini dari
  `HARI_INI_SQL`): `Ditutup` bila `ditutup_pada` terisi ATAU `tanggal_tutup` <
  hari ini; `Dijadwalkan` bila `tanggal_buka` > hari ini; selain itu `Dibuka`
  (Q-136).
- **Tutup efektif** (`TUTUP_EFEKTIF_SQL` kembar, jangkar retensi): yang lebih
  awal di antara `date(ditutup_pada, '+7 hours')` dan `tanggal_tutup` yang sudah
  lewat; kosong selama belum Ditutup.
- **Tutup** mengisi `ditutup_pada = datetime('now')` + `ditutup_oleh` sekali.
  **Buka lagi** mengosongkan keduanya dan wajib memundurkan atau mengosongkan
  `tanggal_tutup` yang sudah lewat; jam retensi mulai dari nol.
- Lowongan tidak pernah dihapus. Kelompok tidak bisa diubah setelah ada
  pelamar.
- Daftar membawa hitungan pelamar per status, `pelamar_dihapus`, jumlah
  Diterima dibanding `jumlah` (tanda `lewat_kuota`, tidak menolak), dan tanggal
  hapus data pelamar bila tutup efektif sudah ada.

#### 25.2.2 Pelamar, tahap, dan CV

**Pelamar** (`validasi_pelamar` ↔ `validasiPelamar`):

- Wajib: lowongan (Q-134), `nama` 2–100, `tanggal_lamaran` (tidak di masa
  depan, tidak sebelum `tanggal_buka`). Opsional: `no_hp` (dinormalkan
  `normalize_operator_phone`), `email` (≤ 255), `lp` (`L`/`P`),
  `tanggal_lahir`, `alamat` ≤ 1.000, `pendidikan` (jenjang `hr_pendidikan`),
  `prodi` ≤ 100 (dibaca untuk linieritas guru), `sumber` ≤ 100 (teks bebas
  dengan saran: Brosur, Media Sosial, Situs Sekolah, Referensi Guru/Pegawai,
  Dinas, Datang Langsung, Lainnya), `catatan` ≤ 2.000.
- **Tanpa NIK, KK, dan rekening** (Q-132). Itu baru diisi di `hr_profil`
  sesudah menjadi personil.
- Menambah pelamar hanya ke lowongan `Dibuka` atau `Ditutup`; pelamar baru dan
  tahap `Lamaran` urutan 1 ditulis di satu `execute_atomic`.
- Pelamar kembar (nama + no. HP sama di lowongan sama) hanya diberi tanda
  `mungkin_ganda`. Lowongan pelamar tidak bisa dipindah. Data pelamar bisa
  diubah selama belum dijadikan personil.

**Tahap** (append-only, `hr_pelamar_tahap`):

- Urutan tetap: `Lamaran` → `Seleksi Berkas` → `Wawancara` → `Microteaching`
  → `Penawaran` → `Diterima` / `Ditolak`, ditambah `Mundur` (pelamar menarik
  diri, bukan ditolak).
- `periksa_tahap` ↔ `periksaTahap` (Q-135): dari tahap proses boleh ke tahap
  proses mana pun (maju, melompat, mengulang, misalnya wawancara kedua) dan ke
  tahap akhir; dari tahap akhir tidak ada tahap baru. **`Microteaching` hanya
  untuk lowongan `Guru`.** `tanggal` tidak di masa depan dan tidak sebelum
  `tanggal_lamaran`; `catatan` ≤ 1.000, wajib untuk `Ditolak` dan `Mundur`.
- `id_tahap = <id_pelamar>:<urutan>`, urutan dihitung di statement INSERT-nya
  sendiri (`COALESCE(MAX(urutan), 0) + 1`), jadi dua sesi bersamaan bertabrakan
  di PK, tidak menghasilkan dua tahap "terakhir".
- **Status pelamar diturunkan** (`status_pelamar` ↔ `statusPelamar`): tahap
  urutan terbesar yang belum dibatalkan. Tidak disimpan di `hr_pelamar`.
- **Batalkan tahap terakhir:** kolom `dibatalkan_oleh/pada/alasan_batal` diisi
  sekali (pola "cabut/batal adalah kolom yang diisi sekali" Fase 4), alasan
  wajib. Ditolak untuk `Lamaran` urutan 1 dan untuk pelamar yang sudah
  dijadikan personil. Penjaga keadaan ada di statement UPDATE yang sama.
- Lowongan Ditutup tidak mengunci tahap; layar menandai pelamar yang masih di
  tahap proses pada lowongan Ditutup, karena retensi tetap berjalan.

**CV dan berkas** (`hr_pelamar_berkas`): opsional, maks **3** per pelamar,
`urai_berkas_dokumen` apa adanya, slot urutan kosong terkecil. Isi diambil per
berkas. Tidak disalin ke Dokumen pegawai (Q-139).

#### 25.2.3 Jadikan personil

Syarat: status pelamar `Diterima` dan `id_karyawan` kosong (atau sama dengan id
deterministiknya, jalur Lanjutkan).

**Id deterministik** (`id_dari_pelamar` ↔ `idDariPelamar`, vektor sama;
`hex` = 32 karakter sesudah `plm-`):

| Kelompok | `id_unik` | `kode_karyawan` | Jalur | Kontrak |
| :-- | :-- | :-- | :-- | :-- |
| Guru | `ptk_<hex>` (bentuk `new_academic_id`) | kosong = jalur lama (NIP atau id) | `save_teacher` ↔ `saveTeacher`, `is_edit = false` | `kon-<hex>` |
| Tendik | `createEmployeeIdentifiers(hex).idUnik` (`EMP_<12>`) | usulan `K<8>`, boleh disunting | `create_employee` ↔ `tambahKaryawan` | `kon-<hex>` |

Backend menghitung id sendiri dan mengabaikan id dari payload.

**Alur** (sama di Desktop dan Web; setiap langkah aman diulang):

1. Layar membuka form personil yang sudah dipakai halaman Guru/Pegawai, terisi
   dari pelamar (nama, no. HP, L/P) dan lowongan (unit, bagian, jabatan),
   ditambah isian kontrak pertama (status, nomor, tanggal mulai, tanggal
   selesai, masa percobaan). Operator melengkapi shift, TMT, dan data guru
   (NIP, NUPTK, mapel) bila perlu.
2. **Semua validasi dulu, tanpa menulis:** validasi draft personil yang sudah
   ada, `validasi_kontrak(isian, kelompok == Guru)`, status pelamar.
3. **Klaim di cloud** (`KLAIM_PELAMAR_SQL` kembar):
   `UPDATE hr_pelamar SET id_karyawan = ?, dijadikan_oleh = ?, dijadikan_pada =
   datetime('now') WHERE id_pelamar = ? AND id_karyawan IS NULL AND <status
   Diterima>`. Nol baris dan `id_karyawan` berbeda/kosong = "Pelamar ini sudah
   dijadikan personil atau statusnya berubah." Klaim dulu karena guru/tendik
   tidak punya kunci alami (NIP opsional), jadi dua perangkat yang menekan
   bersamaan hanya bisa dihentikan di cloud.
4. **Personil** lewat jalur yang ada (`save_teacher` / `create_employee` di
   Desktop dan Mobile; `saveTeacher` / `tambahKaryawan` di Web) dengan id
   deterministik. Token acak, `qr_code = "{id}|{token}"`, `id_card` `WHERE NOT
   EXISTS`, `guru_data` (guru), organisasi, dan outbox dibuat jalur itu sendiri.
5. **Kontrak pertama** lewat `simpan_kontrak` yang dipecah menjadi inti
   ber-id (`simpan_kontrak_id(state, oleh, draft, id)`; command lama memanggilnya
   dengan `new_id("kon-")`, perilaku tidak berubah) ↔ `simpanKontrak` dengan id
   opsional. Id `kon-<hex>` + `INSERT OR IGNORE` = berhenti di PK bila diulang.
   Status kepegawaian guru tercermin lewat `CERMIN_STATUS_SQL` yang sudah ada.
6. Desktop: `syncNow()` sesudahnya (pola layar lain).

**Lanjutkan** (klaim berhasil, langkah 4 atau 5 gagal): pelamar tampil
"Diterima, data personil belum lengkap". Tombol Lanjutkan mengulang 4–5:

- `master_data` id itu sudah ada di SQLite lokal → langkah 4 dilewati.
- Desktop: belum ada di lokal tetapi sudah ada di cloud (dibaca lewat
  `TursoClient`) → berhenti dengan "Sinkronkan perangkat dulu", supaya
  perangkat kedua tidak membuat token kedua untuk orang yang sama.
- Web: ada di cloud → langkah 4 dilewati.
- Langkah 5 selalu diulang (berhenti di PK).

**Sesudahnya:** `id_karyawan` terisi = "Sudah menjadi personil" dengan tautan
ke rincian pegawai. Data pelamar, tahap, dan berkasnya terkunci dan
**dikecualikan dari retensi** (sudah menjadi data kepegawaian). Tidak ada
"batal jadikan personil"; salah orang diselesaikan lewat Pegawai Keluar
(Fase 4) atau menonaktifkan personil.

**Yang tidak ikut:** akun operator, kartu ID (dicetak dari menu Kartu ID),
data pribadi/keuangan `hr_profil` (temuan 6, Q-139), CV.

**Yang tersisa sebagai celah:** dua perangkat menekan Lanjutkan pada saat yang
sama sebelum salah satunya terdorong; token yang sampai terakhir yang berlaku
(kartu belum dicetak pada saat itu).

#### 25.2.4 Retensi pelamar (UU PDP)

- **Yang dihapus:** pelamar ber-`id_karyawan` KOSONG yang lowongannya punya
  tutup efektif dan `date(<tutup efektif>, '+12 months')` < hari ini WIB
  (jam database). Itu mencakup Ditolak, Mundur, Diterima yang tidak pernah
  dijadikan personil, dan proses yang menggantung. Bersamanya terhapus seluruh
  tahap dan berkasnya.
- **12 bulan adalah konstanta kembar** `RETENSI_PELAMAR_BULAN` (Rust ↔ TS),
  bukan pengaturan (Q-140).
- **Satu `execute_atomic`** (`HAPUS_PELAMAR_LAMA_SQL`, empat statement teks
  kembar, predikat sama): tambah `hr_lowongan.pelamar_dihapus`, hapus berkas,
  hapus tahap, hapus pelamar (terakhir). Dijalankan dua kali hasilnya sama.
- **Yang tersisa:** baris lowongan dan satu angka anonim `pelamar_dihapus`.
  Tanpa nama, sumber, atau tahap.
- **Penjalan:** command `desktop_hr_recruit_cleanup` ↔ rute
  `kepegawaian/recruitment/cleanup` (cukup sesi, hanya mengembalikan hitungan),
  diketuk `useKetukBerkala` ketiga di `AutoPemberitahuanRunner` untuk setiap
  sesi yang login (temuan 4). Tidak ada login = tidak ada penghapusan sampai
  login berikutnya.
- **Hapus lebih cepat** (`hr.recruit.delete`): satu pelamar, kapan saja,
  dengan mengetik `KONFIRMASI_HAPUS_PERMANEN`; statement yang sama untuk satu
  id, tetap menambah `pelamar_dihapus`, tetap menolak pelamar ber-`id_karyawan`.
- **Peringatan di layar:** "Data pelamar dihapus pada <tanggal>" sejak lowongan
  Ditutup, ditonjolkan 30 hari sebelumnya.
- **Cadangan:** berkas cadangan dan ekspor lama tetap memuat pelamar yang sudah
  dihapus; itu di luar jangkauan aplikasi (§25.9).

#### 25.2.5 Pelatihan dan peserta

**Pelatihan** (`validasi_pelatihan` ↔ `validasiPelatihan`):

- `nama` 1–150; `jenis_penyelenggara` wajib: `KKG`, `MGMP`, `Dinas`,
  `Internal`, `Lainnya` (CHECK); `penyelenggara` (nama lembaga) ≤ 100,
  opsional; `tanggal_mulai` ≤ `tanggal_selesai`, boleh di masa depan;
  `lokasi` ≤ 100; `jumlah_jam` bilangan bulat 1–1.000 (jam pelatihan yang
  diakui per peserta, Q-144); `biaya` bilangan bulat 0–1.000.000.000, satu
  total per pelatihan (Q-146); `keterangan` ≤ 2.000.
- **Status diturunkan** (`status_pelatihan` ↔ `statusPelatihan`):
  `Dibatalkan` bila `dibatalkan_pada` terisi; `Dijadwalkan` bila
  `tanggal_mulai` > hari ini; `Selesai` bila `tanggal_selesai` < hari ini;
  selain itu `Berlangsung`.
- **Batal** = kolom diisi sekali, alasan wajib. Tidak ada hapus.

**Peserta** (`hr_pelatihan_peserta`):

- Hanya pegawai (`PEGAWAI_SQL`) `Aktif` tanpa `id_keluar` saat ditambahkan,
  diperiksa di statement `INSERT … SELECT FROM master_data` yang sama (pola
  `SIMPAN_DOKUMEN_SQL`). PK `<id_pelatihan>:<id_karyawan>` menahan duplikat.
- `hasil` opsional dan bisa diubah: `Lulus`, `Tidak Lulus`, `Tidak Hadir`;
  `catatan` ≤ 1.000.
- **Lepas peserta** menghapus barisnya (satu-satunya hapus baris di pelatihan),
  ditolak selama `id_dokumen` terisi.
- Riwayat tetap terbaca sesudah pegawai keluar.
- Biaya per peserta hanya ditampilkan (biaya ÷ peserta), tidak disimpan.

**Sertifikat** = `hr_dokumen` (Q-147):

- Dari baris peserta, "Tambah sertifikat" memanggil inti `simpan_dokumen` dan
  `tambah_berkas` yang ada dengan `id_karyawan` peserta, jenis bawaan
  `dok-pelatihan` (boleh diganti jenis aktif lain, temuan 5), lalu mengisi
  `hr_pelatihan_peserta.id_dokumen`, dalam satu `execute_atomic` (dokumen +
  tautan; berkas menyusul per berkas seperti tab Dokumen). Isian: nomor,
  tanggal terbit, tanggal kedaluwarsa (opsional), catatan (bawaan nama
  pelatihan), berkas (maks 5 × 1 MB).
- Sertifikat itu tampil di tab Dokumen pegawai dan ikut pengingat Fase 6 tanpa
  kode baru.
- `HAPUS_DOKUMEN_SQL` (`hris_cloud.rs:72`) ↔ kembar TS mendapat statement
  ketiga: `UPDATE hr_pelatihan_peserta SET id_dokumen = NULL WHERE id_dokumen =
  ?1;`, supaya hapus dari tab Dokumen tidak meninggalkan tautan mati.

#### 25.2.6 Rekap jam pelatihan per pegawai per tahun

- `REKAP_PELATIHAN_SQL` kembar: per (`id_karyawan`, tahun) dengan tahun =
  `substr(tanggal_selesai, 1, 4)` (tahun kalender, Q-145); hanya pelatihan
  tidak dibatalkan yang `tanggal_selesai` ≤ hari ini, peserta yang hasilnya
  bukan `Tidak Hadir`. Isi: jumlah pelatihan, total jam, total jam per
  `jenis_penyelenggara`.
- Untuk guru dan tendik, dengan saringan kelompok (Guru/Tendik, pola
  `ORG_PEGAWAI_SQL`) dan unit (`master_data.unit` kini).
- Tidak ada target jam minimal dan tidak ada tanda kurang jam (§25.6).
- Ekspor Excel lewat `src/lib/client/xlsx.ts` yang ada.

#### 25.2.7 Pengingat dan Telegram

**Tidak ada kejadian atau kartu baru di Fase 7** (Q-149). Alasannya:
pelatihan dicatat sesudah atau menjelang terjadi oleh orang yang sama yang
mengurusnya, dan pelamar menunggu tahap sudah terlihat di daftar lowongan. Satu
kait yang sudah jalan: sertifikat berkedaluwarsa (25.2.5).

Bila pemilik memilih opsi (b) Q-149: dua kejadian `pelatihan_besok` dan
`pelamar_menunggu` (> 7 hari di tahap proses) masuk `muat_pengingat` ↔
`muatPengingat` Fase 6 dengan jendela dan id deterministik, sakelar
`kirim:<kejadian>` **bawaan mati**, karena perangkat sebelum 6b membatalkan
kejadian yang tidak dikenalnya. Isi pesan tanpa data pelamar selain nama dan
lowongan.

### 25.3 Model data dan sinkronisasi

**Skema v72, sentinel `-2048` (`hris-rekrutmen-pelatihan-v1`).** Perlu karena
enam tabel baru dan lima izin baru (temuan 2). Semua tabel **KHUSUS CLOUD**
(Q-131): hanya `turso.rs::ensure_schema` + `db-migrations.ts`; tidak di
`storage.rs`, tidak di `SNAPSHOT_TABLES`/`SNAPSHOT_SOURCES`, tanpa outbox dan
tanpa rute sync. Tanpa `UNIQUE` selain PK. Indeks dibuat sesudah tabelnya.

| Tabel | Kenapa khusus cloud |
| :-- | :-- |
| `hr_pelamar`, `hr_pelamar_tahap`, `hr_pelamar_berkas` | Data pribadi orang yang bukan pegawai (UU PDP), preseden `hr_profil`. Retensi mewajibkan data benar-benar hilang; baris tersinkron yang dihapus tetap tertinggal di SQLite perangkat yang jarang dibuka, dan terminal scanner tidak punya alasan memegangnya |
| `hr_lowongan` | Tanpa data pribadi, tetapi hanya berguna bersama pelamar, dan jangkar retensinya dibaca SQL cloud |
| `hr_pelatihan`, `hr_pelatihan_peserta` | Sertifikatnya `hr_dokumen` (khusus cloud), jadi layarnya tetap butuh koneksi; tidak ada alur luring yang membacanya. Menyinkronkan = dua tabel empat lapis + dua rute tanpa pemakai |

| Tabel | Kolom |
| :-- | :-- |
| `hr_lowongan` | `id_lowongan` PK (`low-<hex>`); `judul` NOT NULL; `kelompok` NOT NULL CHECK IN (`Guru`, `Tendik`); `unit` (nama unit); `id_bagian`; `id_jabatan`; `jumlah` INTEGER NOT NULL CHECK 1–99; `tanggal_buka` NOT NULL; `tanggal_tutup`, CHECK `tanggal_tutup IS NULL OR tanggal_tutup >= tanggal_buka`; `keterangan`; `ditutup_pada`, `ditutup_oleh`; `pelamar_dihapus` INTEGER NOT NULL DEFAULT 0 CHECK ≥ 0; `dicatat_oleh` NOT NULL, `created_at`; `diubah_oleh`, `diubah_pada`. Indeks `tanggal_buka` |
| `hr_pelamar` | `id_pelamar` PK (`plm-<32 hex>`); `id_lowongan` NOT NULL; `nama` NOT NULL; `no_hp`; `email`; `lp` CHECK (`lp IS NULL OR lp IN ('L','P')`); `tanggal_lahir`; `alamat`; `pendidikan` CHECK = jenjang `hr_pendidikan` atau NULL; `prodi`; `sumber`; `tanggal_lamaran` NOT NULL; `catatan`; `id_karyawan`, `dijadikan_oleh`, `dijadikan_pada`; `dicatat_oleh` NOT NULL, `created_at`; `diubah_oleh`, `diubah_pada`. Indeks `id_lowongan`, `id_karyawan` |
| `hr_pelamar_tahap` | `id_tahap` PK (`<id_pelamar>:<urutan>`); `id_pelamar` NOT NULL; `urutan` INTEGER NOT NULL CHECK ≥ 1; `tahap` NOT NULL CHECK IN (`Lamaran`, `Seleksi Berkas`, `Wawancara`, `Microteaching`, `Penawaran`, `Diterima`, `Ditolak`, `Mundur`); `tanggal` NOT NULL; `catatan`; `oleh` NOT NULL, `created_at`; `dibatalkan_oleh`, `dibatalkan_pada`, `alasan_batal`. Indeks `id_pelamar` |
| `hr_pelamar_berkas` | `id_berkas` PK (`plb-<hex>`); `id_pelamar` NOT NULL; `urutan` INTEGER NOT NULL CHECK 1–3; `nama_berkas`; `mime_type` NOT NULL CHECK sama dengan `hr_dokumen_berkas`; `data_base64` NOT NULL; `created_at`. Indeks `id_pelamar` |
| `hr_pelatihan` | `id_pelatihan` PK (`plt-<hex>`); `nama` NOT NULL; `jenis_penyelenggara` NOT NULL CHECK IN (`KKG`, `MGMP`, `Dinas`, `Internal`, `Lainnya`); `penyelenggara`; `tanggal_mulai` NOT NULL, `tanggal_selesai` NOT NULL, CHECK `tanggal_selesai >= tanggal_mulai`; `lokasi`; `jumlah_jam` INTEGER NOT NULL CHECK 1–1000; `biaya` INTEGER NOT NULL DEFAULT 0 CHECK ≥ 0; `keterangan`; `dicatat_oleh` NOT NULL, `created_at`; `diubah_oleh`, `diubah_pada`; `dibatalkan_oleh`, `dibatalkan_pada`, `alasan_batal`. Indeks `tanggal_mulai` |
| `hr_pelatihan_peserta` | `id_peserta` PK (`<id_pelatihan>:<id_karyawan>`); `id_pelatihan` NOT NULL; `id_karyawan` NOT NULL; `hasil` CHECK (`hasil IS NULL OR hasil IN ('Lulus','Tidak Lulus','Tidak Hadir')`); `id_dokumen`; `catatan`; `dicatat_oleh` NOT NULL, `created_at`. Indeks `id_pelatihan`, `id_karyawan`, `id_dokumen` |

- **Status tidak disimpan** di tabel mana pun (lowongan, pelamar, pelatihan).
  Tahap append-only; satu-satunya penghapus baris tahap adalah retensi dan
  hapus pelamar.
- **Tanpa seed** dan tanpa perubahan seed jenis dokumen (`dok-pelatihan` sudah
  ada; tes yang menghitung jenis tidak berubah).
- **Tanpa pengaturan baru** di `setting_gex_system`: retensi konstanta
  (Q-140), jadi `desktop_hr_settings_save` tetap tujuh isian.
- **Paritas yang disentuh (dua jalur provisioning):**
  - `CURRENT_SCHEMA_VERSION` (`db-schema.ts:5`) dan `CLIENT_SCHEMA_VERSION`
    (`sync.rs:23`, Desktop DAN Mobile) = 72.
  - Sentinel `-2048` di INSERT `ensure_schema` (`turso.rs:5688`) dan cek
    `ensure_schema_current` (`:6143`); daftar sentinel di tes `turso.rs`
    (`:18854` dst.) ikut.
  - `REQUIRED_TABLE_COUNT` 131 → 137 + enam nama di `isDatabaseSchemaReady`
    (`db-schema.ts:55`).
  - `PROMOTION_PLAN` + 6 (urutan: `hr_lowongan` → `hr_pelamar` →
    `hr_pelamar_tahap`, `hr_pelamar_berkas`; `hr_pelatihan` →
    `hr_pelatihan_peserta`, yang juga bergantung `master_data` dan
    `hr_dokumen`).
  - `expectedCloudOnlyTables` di `audit-sync-contract.ts` + 6 (pengetatan,
    bukan pelonggaran).
  - `schema-consistency.test.ts` + 6.
  - `SNAPSHOT_TABLES`, `SNAPSHOT_SOURCES`, `CANONICAL_SYNC_ROUTES`,
    `storage.rs`, `apply_event_to_turso`, `CLOUD_MIRRORED_TABLES`: **tidak
    disentuh**.
- **SQL kembar baru**, teks diperiksa harfiah oleh `hr-rekrutmen.test.ts` dan
  `hr-pelatihan.test.ts` (Desktop + salinan Mobile), setiap SQL daftar dengan
  `-- batas:` (`audit:list-bound`): `TUTUP_EFEKTIF_SQL`, `LOWONGAN_SQL`,
  `PELAMAR_SQL`, `TAHAP_SQL`, `KLAIM_PELAMAR_SQL`, `HAPUS_PELAMAR_LAMA_SQL`,
  `HAPUS_PELAMAR_SQL`, `PELATIHAN_SQL`, `PESERTA_SQL`, `REKAP_PELATIHAN_SQL`;
  `HAPUS_DOKUMEN_SQL` menjadi tiga statement.

### 25.4 Hak akses

**Lima izin baru** (nama §15.1, ditambah `hr.recruit.delete`):

| Izin | Sensitif | Rahasia | Paket bawaan |
| :-- | :-- | :-- | :-- |
| `hr.recruit.view` | | ya | Kepegawaian, Yayasan |
| `hr.recruit.manage` | | ya | Kepegawaian |
| `hr.recruit.delete` | ya | | Kepegawaian |
| `hr.training.view` | | | Admin (otomatis), Kepegawaian, Yayasan, Kepala Sekolah |
| `hr.training.manage` | | | Admin (otomatis), Kepegawaian |

- Rahasia = `CONFIDENTIAL_PERMISSIONS` (`catalog.ts:720`); sensitif =
  `SENSITIVE_MUTATION_PERMISSIONS` (`:602`); keduanya di luar paket Admin
  (`:755-761`) dan di `ADMIN_DEFAULT_EXCLUDED_PERMISSIONS` (`turso.rs:651`).
  `hr.recruit.delete` sensitif tetapi masuk paket Kepegawaian (pola
  `hr.performance.config`), karena UU PDP menuntut penghapusan bisa dilakukan
  petugasnya (Q-141).
- **`DEFAULT_ROLE_PERMISSIONS` dicek:** Kepegawaian, Yayasan, dan Kepala
  Sekolah sudah memegang `employees.view` (`catalog.ts:786-849`), jadi area
  `kepegawaian` terbuka. Tidak ada izin lama yang dipindah atau dicabut; role
  lama tidak terkunci dari halaman apa pun. Role buatan Superadmin yang hanya
  diberi izin Fase 7 tanpa `employees.view` tidak bisa membuka halaman (penanda
  §25.9). Cermin Rust: baris `app_permission` (`turso.rs:3459` dan sekitarnya)
  + `ROLE_HRIS_BAWAAN` (`:724`); `rbac-migration.test.ts` + versi 72.
- **Jadikan personil tanpa izin baru** (Q-142): `hr.recruit.manage` +
  `hr.contract.manage` + izin jalur personilnya (`teachers.manage` untuk Guru,
  `employees.manage` untuk Tendik, sama dengan `desktop_save_teacher`
  `commands.rs:2585` dan `desktop_create_employee` `:1254`). Kelompok dibaca
  dari lowongan di cloud, tidak dari payload. Paket Kepegawaian memegang
  semuanya.
- **Sertifikat dari layar pelatihan:** `hr.training.manage` cukup untuk
  menulis dan menghapus `hr_dokumen` yang **tertaut ke baris peserta**; isi
  berkas sertifikat dibaca dengan `hr.training.view`. Dokumen lain tetap butuh
  `hr.document.*` (`boleh_baca_dokumen`, `hris_cloud.rs:392`) (Q-148).
- **Pembersihan retensi:** cukup sesi (aturan tetap tanpa pilihan, hasil hanya
  hitungan).
- **Cakupan unit tidak berlaku di Fase 7** (Q-143): §15.2 hanya membatasi
  memutus, urgent, dan menunjuk pengganti; rekrutmen dan pelatihan dikelola
  Kepegawaian/Yayasan untuk semua unit. **"Bukan diri sendiri" juga tidak
  berlaku:** pelamar bukan akun dan bukan pegawai, dan mencatat pelatihan diri
  sendiri tidak memberi kuasa apa pun. Semua izin dinilai dari SESI di backend
  (`require_any_permission` / `requireWebPermission`, sekaligus gerbang
  lisensi).
- Layar: tab Rekrutmen untuk `hr.recruit.view|manage`, tab Pelatihan untuk
  `hr.training.view|manage`; backend memeriksa ulang.

### 25.5 Command, rute, gateway, layar

**Rust** (`desktop/hr_rekrutmen.rs` dan `desktop/hr_pelatihan.rs`, disalin ke
Mobile lewat `sync-rust-modules.ts`; terdaftar di `lib.rs`, `build.rs`,
`capabilities/default.json` kedua workspace; doc comment sebelum
`#[tauri::command]`; semuanya `async` lewat `TursoClient`, galat jaringan
`luring` → `PESAN_LURING`):

| Command | Izin (sesi) | Rute Web (`POST` kecuali disebut) |
| :-- | :-- | :-- |
| `desktop_hr_vacancies` (daftar + hitungan + tanggal hapus) | `recruit.view`/`manage` | `kepegawaian/recruitment/vacancies/query` |
| `desktop_hr_vacancy_save` (buat, ubah, tutup, buka lagi) | `recruit.manage` | `kepegawaian/recruitment/vacancies/save` |
| `desktop_hr_applicants` (pelamar satu lowongan, atau rincian satu pelamar + tahap + daftar berkas) | `recruit.view`/`manage` | `kepegawaian/recruitment/applicants/query` |
| `desktop_hr_applicant_save` | `recruit.manage` | `kepegawaian/recruitment/applicants/save` |
| `desktop_hr_applicant_stage` (catat, batalkan terakhir) | `recruit.manage` | `kepegawaian/recruitment/applicants/stage` |
| `desktop_hr_applicant_file` (isi satu berkas) | `recruit.view`/`manage` | `kepegawaian/recruitment/applicants/file/query` |
| `desktop_hr_applicant_file_save` (tambah, hapus) | `recruit.manage` | `kepegawaian/recruitment/applicants/file` (`POST`, `DELETE`) |
| `desktop_hr_applicant_hire` (klaim + personil + kontrak, juga Lanjutkan) | `recruit.manage` + `contract.manage` + `teachers.manage`/`employees.manage` | `kepegawaian/recruitment/applicants/hire` |
| `desktop_hr_applicant_delete` | `recruit.delete` | `kepegawaian/recruitment/applicants/delete` (`DELETE`) |
| `desktop_hr_recruit_cleanup` | sesi | `kepegawaian/recruitment/cleanup` |
| `desktop_hr_trainings` (daftar per tahun, rincian + peserta, riwayat satu pegawai, atau rekap jam) | `training.view`/`manage` | `kepegawaian/training/query` |
| `desktop_hr_training_save` (buat, ubah, batal) | `training.manage` | `kepegawaian/training/save` |
| `desktop_hr_training_participants_save` (tambah, lepas, hasil) | `training.manage` | `kepegawaian/training/participants` |
| `desktop_hr_training_certificate_save` (dokumen + tautan, hapus) | `training.manage` | `kepegawaian/training/certificate` |
| `desktop_hr_training_certificate_file` (isi satu berkas sertifikat yang tertaut ke peserta) | `training.view`/`manage` | `kepegawaian/training/certificate/file/query` |

Berkas sertifikat ditambah/dihapus lewat inti `tambah_berkas` yang dipanggil
`desktop_hr_training_certificate_save` (aksi `berkas_tambah`/`berkas_hapus`),
jadi tidak ada command keenam belas.

**Diubah:** `hris::simpan_kontrak` dipecah menjadi inti ber-id (command lama
tidak berubah) ↔ `simpanKontrak` dengan id opsional; `HAPUS_DOKUMEN_SQL` (+1
statement) ↔ TS; `AutoPemberitahuanRunner` (+1 ketukan); `catalog.ts`,
`turso.rs` (izin, paket, sentinel, enam tabel), `db-migrations.ts`,
`db-schema.ts`, `database-promotion.ts`, `audit-sync-contract.ts`.
`create_employee`, `save_teacher`, `saveTeacher`, `tambahKaryawan` **tidak
diubah**; Jadikan personil hanya memanggilnya.

**Web:** `validations/hr-rekrutmen.ts` + `services/hr-rekrutmen.ts`,
`validations/hr-pelatihan.ts` + `services/hr-pelatihan.ts` (kembar Rust,
termasuk teks SQL); 15 `route.ts` di atas (Zod `.strict()`, tanpa `GET`, batas
body besar hanya untuk rute berkas); gateway di `gateways/hris.ts` yang ada.

**Layar** (Web/Desktop saja, Q-150):

1. `/kepegawaian` tab **Rekrutmen** (`components/kepegawaian/TabRekrutmen.tsx`):
   daftar lowongan dengan status, hitungan, kuota, tanggal hapus; rincian
   lowongan berisi pelamar per status dan tanda `mungkin_ganda`; rincian
   pelamar dengan riwayat tahap, CV, Catat tahap, Batalkan tahap terakhir,
   Jadikan personil / Lanjutkan, Hapus (ketik "Hapus Permanen").
2. `/kepegawaian` tab **Pelatihan** (`TabPelatihan.tsx`): daftar per tahun,
   rincian dengan peserta (`PilihCari`), hasil, sertifikat; sub-tampilan Rekap
   jam per pegawai per tahun dengan ekspor Excel.
3. `RincianPegawai` tab **Pelatihan** (`hr.training.view`): riwayat dan
   sertifikat.
4. Form Jadikan personil memakai form Guru/Pegawai yang ada (prop isian awal),
   tidak membuat form ketiga.
5. Mobile: modul disalin dan command terdaftar (biner Mobile tetap utuh), tanpa
   layar (pola Fase 5).

**Angka sebelum → sesudah Fase 7**

| Angka | Sebelum (`audit:contract` 19 Nov 2026) | Sesudah |
| :-- | :-- | :-- |
| Versi skema / sentinel | v71 / `-2047` | v72 / `-2048` |
| `REQUIRED_TABLE_COUNT` | 131 | 137 |
| Tabel snapshot | 81 | 81 |
| Rute kanonik sync | 145 | 145 |
| Permission | 131 | 136 |
| Command Desktop / Mobile | 430 / 435 | 445 / 450 |
| Rute Web (`route.ts`) | 320 | 335 |
| Bidang / kejadian Telegram | 4 / 17 | 4 / 17 (opsi b Q-149: 4 / 19) |

### 25.6 Tidak dikerjakan

- Formulir lamaran publik dan unggah CV oleh pelamar (§18).
- NIK/KK pelamar; menyalin data pelamar ke `hr_profil`; menyalin CV ke Dokumen
  pegawai.
- Jurnal otomatis biaya pelatihan, status "biaya sudah dibayar", sumber dana
  (BOS/yayasan), anggaran dan rencana pelatihan.
- Target jam PKB minimal per tahun dan tanda kurang jam; integrasi SIMPKB.
- Penilaian wawancara/microteaching berskor, jadwal dan pewawancara: cukup
  catatan tahap.
- Surat penawaran, surat penolakan, cetak apa pun di rekrutmen.
- Talent pool lintas lowongan, memindah pelamar antar lowongan.
- Statistik per sumber yang bertahan setelah retensi.
- Cakupan unit untuk rekrutmen/pelatihan.
- Telegram dan kartu "Perlu perhatian" untuk rekrutmen/pelatihan (kecuali
  opsi b Q-149).
- Layar Mobile.
- Membuat `tambahKaryawan` Web atomik (temuan 8).
- Membersihkan data pelamar dari berkas cadangan lama.

### 25.7 Langkah per sub-fase dengan gerbang

Tiga sub-fase, satu sesi per sub-fase. Setiap sub-fase: semua langkahnya
ditulis dulu, lalu satu putaran cek di akhir (CLAUDE.md, "cara kerja hemat
konteks"). Kolom "Isi tes" adalah kasus yang wajib ADA di tes, bukan perintah
per langkah. `bun run check` penuh oleh pemilik sesudah semua fase HRIS.

**7a — Skema, izin, dan rekrutmen tanpa Jadikan personil** (batas: lowongan,
pelamar, tahap, CV, retensi bekerja lewat command dan rute):

| # | Langkah | Isi tes |
| :-- | :-- | :-- |
| 1 | Skema v72: enam tabel di `turso.rs` + `db-migrations.ts`, sentinel `-2048`, versi 72 (Desktop dan Mobile), `REQUIRED_TABLE_COUNT` 137, `isDatabaseSchemaReady`, `PROMOTION_PLAN`, `expectedCloudOnlyTables`, `schema-consistency.test.ts` | sentinel `-2047` memicu skema v72; enam tabel ada di kedua jalur |
| 2 | RBAC: lima izin, `CONFIDENTIAL`/`SENSITIVE`, baris `app_permission` + `NOT IN` Admin Rust, paket `ROLE_HRIS_BAWAAN` ↔ `DEFAULT_ROLE_PERMISSIONS` | `rbac-migration.test.ts` versi 72; Admin tidak memegang `hr.recruit.*` |
| 3 | Aturan kembar `hr_rekrutmen.rs` ↔ `validations/hr-rekrutmen.ts`: `validasi_lowongan`, `status_lowongan`, `validasi_pelamar`, `periksa_tahap`, `status_pelamar`, `id_dari_pelamar`, `RETENSI_PELAMAR_BULAN`, SQL §25.3 | vektor `hr-rekrutmen.vektor.json`: Microteaching di lowongan Tendik ditolak, tahap sesudah tahap akhir ditolak, lompat dan ulang tahap, `Lamaran` 1 tidak bisa dibatalkan, status lowongan tiga keadaan, tutup efektif, id deterministik guru/tendik; `hr-rekrutmen.test.ts` teks harfiah |
| 4 | Transaksi cloud rekrutmen (Rust + TS): lowongan, pelamar + tahap 1, tahap dan batal, berkas, hapus satu pelamar, retensi | `TursoClient::local_file` dan `services/hr-rekrutmen.test.ts` data sama: retensi menghapus pelamar + tahap + berkas dan menambah `pelamar_dihapus`, melewati pelamar ber-`id_karyawan` dan lowongan yang belum 12 bulan, dijalankan dua kali hasilnya sama |
| 5 | Sembilan command rekrutmen (semua kecuali `hire`), rute, gateway | `audit:contract` (439 / 444 command, 136 permission) |

Putaran cek akhir 7a: `tsc` + Biome berkas yang diubah, tes vektor dan
service sekali, `cargo test hr_rekrutmen` Desktop, `audit:contract`,
`audit:schema`, `audit:sql`, `audit:list-bound`.

**7b — Jadikan personil dan pelatihan** (batas: semua 15 command dan rute
lengkap):

| # | Langkah | Isi tes |
| :-- | :-- | :-- |
| 6 | `simpan_kontrak` inti ber-id ↔ `simpanKontrak` id opsional; `desktop_hr_applicant_hire` + rute: klaim, `save_teacher`/`create_employee`, kontrak `kon-<hex>`, Lanjutkan | tes alur Rust: guru → `master_data` + `guru_data` + `id_card` + QR `id|token` + kontrak + outbox; tendik tanpa `guru_data`; tekan kedua ditolak; klaim lalu gagal lalu Lanjutkan; Lanjutkan Desktop ditolak bila `master_data` hanya ada di cloud; pelamar terkunci; GTY untuk Tendik ditolak; izin kurang ditolak. `services/hr-rekrutmen.test.ts` alur sama untuk Web |
| 7 | Aturan kembar `hr_pelatihan.rs` ↔ `validations/hr-pelatihan.ts`: `validasi_pelatihan`, `status_pelatihan`, validasi peserta, SQL §25.3 termasuk `REKAP_PELATIHAN_SQL` | vektor `hr-pelatihan.vektor.json`: status empat keadaan, rekap melewati Dibatalkan, Tidak Hadir, dan pelatihan yang belum selesai, tahun dari `tanggal_selesai`; `hr-pelatihan.test.ts` teks harfiah |
| 8 | Transaksi cloud pelatihan + sertifikat lewat inti dokumen; `HAPUS_DOKUMEN_SQL` tiga statement | `local_file` + `services/hr-pelatihan.test.ts`: peserta ganda berhenti di PK, pegawai keluar ditolak, sertifikat tampil di `dokumen`, hapus dokumen mengosongkan `id_dokumen`, lepas peserta bersertifikat ditolak |
| 9 | Lima command pelatihan + `hire` didaftarkan, rute, gateway | `audit:contract` (445 / 450 command, 136 permission, 145 rute, 81 snapshot) |

Putaran cek akhir 7b: `tsc` + Biome, tes berkas baru/diubah sekali (termasuk
`hris.test.ts` karena `HAPUS_DOKUMEN_SQL`), `cargo test hr_pelatihan` dan
`cargo test hr_rekrutmen` Desktop, `audit:contract`, `audit:sql`,
`audit:list-bound`.

**7c — Layar, runner, Mobile, dokumen** (batas: Fase 7 lengkap):

| # | Langkah | Isi tes |
| :-- | :-- | :-- |
| 10 | `TabRekrutmen`, `TabPelatihan`, tab Pelatihan di `RincianPegawai`, form personil dengan isian awal | — |
| 11 | Ketukan retensi di `AutoPemberitahuanRunner` | — |
| 12 | `sync-rust-modules.ts` (+ dua modul), `sync-frontend-lib.ts`, paragraf `references/18` "HRIS rekrutmen dan pelatihan (schema v72)", catatan "Sudah dibangun" §25.11 | — |

Putaran cek akhir 7c: `tsc` + Biome berkas yang diubah, `audit:a11y`,
`audit:ui-guard`, `audit:page-guard`, `audit:contract`. Pemilik:
`jalankan-antislop` lalu `jalankan-check` (termasuk tes salinan Mobile dan
`cargo test` Mobile), uji browser.

### 25.8 Pertanyaan untuk pemilik (Fase 7)

| No | Pertanyaan | Usulan | Alasan |
| :-- | :-- | :-- | :-- |
| Q-130 | Fase 7 menaikkan skema ke **v72** (sentinel `-2048`)? | Ya | Enam tabel dan lima izin baru hanya sampai ke database lewat versi baru (temuan 2). Akibatnya setiap Desktop/Mobile v71 berhenti sinkron sampai diperbarui |
| Q-131 | Keenam tabel **KHUSUS CLOUD** (termasuk pelatihan dan peserta)? | Ya | Pelamar: retensi UU PDP hanya bisa dijamin bila data tidak pernah tersalin ke perangkat. Pelatihan: sertifikatnya di `hr_dokumen` yang khusus cloud; tanpa snapshot dan rute baru |
| Q-132 | Pelamar **tanpa NIK, KK, dan rekening**? | Ya | Minimisasi data: NIK baru dibutuhkan sesudah menjadi pegawai dan disimpan di `hr_profil`. Lebih sedikit data pribadi orang yang ditolak = risiko lebih kecil |
| Q-133 | Lowongan wajib **kelompok Guru/Tendik**; unit disimpan sebagai **nama** unit; bagian dan jabatan opsional? | Ya | Kelompok menentukan jalur personil, status kontrak, dan Microteaching. Id `akademik_unit` dibuat per perangkat, jadi yang dibandingkan nama (§7.1) |
| Q-134 | Pelamar **wajib tertaut lowongan**; pelamar umum dicatat di lowongan "Umum" buatan Kepegawaian? | Ya | Retensi dihitung dari tutupnya lowongan; pelamar tanpa lowongan butuh aturan retensi kedua |
| Q-135 | Tahap **bebas di antara tahap proses** (melompat, mengulang), tahap akhir mengunci, tambah **`Mundur`**, **Microteaching hanya untuk lowongan Guru**; pelamar kembar dan kuota hanya tanda? | Ya | Tidak semua lowongan memakai semua tahap; wawancara bisa dua kali; menarik diri bukan ditolak; tendik tidak mengajar |
| Q-136 | Lowongan Ditutup **lewat tombol ATAU otomatis** sesudah `tanggal_tutup`? | Keduanya | Lowongan yang lupa ditutup membuat retensi tidak pernah mulai |
| Q-137 | Jadikan personil: **klaim cloud dulu**, lalu jalur `save_teacher`/`create_employee` dan `simpan_kontrak` yang ada dengan **id deterministik** dan tombol **Lanjutkan**, tanpa transaksi gabungan? | Ya | Tanpa penulis `master_data` kedua (pola PMB). Ketiga jalur membuka transaksinya sendiri (temuan 7); id deterministik membuat setiap langkah aman diulang. Klaim dulu karena guru/tendik tidak punya kunci alami seperti NIS |
| Q-138 | **Kontrak pertama wajib** saat Jadikan personil? | Ya | Status kepegawaian diturunkan dari kontrak (`STATUS_KINI_SQL`); ketujuh status, termasuk Honorer dan PNS/PPPK, bisa dicatat sebagai kontrak |
| Q-139 | Data pelamar **tidak** mengisi `hr_profil`, dan CV **tidak** disalin ke Dokumen? | Ya | Desktop belum punya `master_data` di cloud saat itu (temuan 6); CV tetap terbaca dari tab Rekrutmen karena pelamar yang dijadikan personil tidak pernah terhapus |
| Q-140 | Retensi **12 bulan sebagai konstanta** (bukan pengaturan) sejak lowongan ditutup; yang tersisa lowongan + angka anonim; dijalankan **setiap sesi login** lewat `AutoPemberitahuanRunner`; hapus lebih cepat dengan `hr.recruit.delete`? | Ya | Angka dari UU PDP di §13, tidak perlu layar pengaturan. Sekolah tidak punya penjadwal; sesi login satu-satunya penjalan (temuan 4) |
| Q-141 | Paket izin: Kepegawaian kelima izin; Yayasan `hr.recruit.view` + `hr.training.view`; Kepala Sekolah `hr.training.view`; `hr.recruit.view|manage` rahasia; `hr.recruit.delete` sensitif tetapi ikut Kepegawaian; `hr.training.*` biasa (ikut Admin)? | Ya | Yayasan memutus pengangkatan di sekolah swasta; kepala sekolah perlu melihat pelatihan gurunya; riwayat pelatihan bukan data rahasia |
| Q-142 | Jadikan personil **tanpa izin baru**: `hr.recruit.manage` + `hr.contract.manage` + `teachers.manage` (Guru) atau `employees.manage` (Tendik)? | Ya | Aksi itu tidak memberi kuasa lebih dari tambah guru/pegawai + catat kontrak yang sudah bisa dilakukan pemegang izin itu |
| Q-143 | **Tanpa cakupan unit** dan tanpa aturan "bukan diri sendiri" untuk rekrutmen dan pelatihan? | Ya | §15.2 hanya membatasi memutus, urgent, dan pengganti; rekrutmen dikelola terpusat. Pelamar bukan akun; mencatat pelatihan sendiri tidak memberi kuasa |
| Q-144 | Pelatihan: `jenis_penyelenggara` tetap (KKG, MGMP, Dinas, Internal, Lainnya) + nama penyelenggara bebas; **jam per pelatihan** berlaku untuk semua peserta yang hadir? | Ya | Lima jenis cukup untuk rekap; jam per peserta baru perlu bila ada yang hadir sebagian, dan untuk itu ada `Tidak Hadir` |
| Q-145 | Rekap jam per **tahun kalender** dari `tanggal_selesai`, hanya pelatihan Selesai tanpa `Tidak Hadir`, untuk guru dan tendik dengan saringan kelompok? | Ya | Laporan PKB dan sertifikat memakai tahun kalender; tendik juga ikut pelatihan. Opsi (b): tahun ajaran |
| Q-146 | Biaya pelatihan **hanya dicatat**, tanpa jurnal otomatis? | Ya | `keu_jurnal.sumber` ber-CHECK tetap; jurnal otomatis = membangun ulang tabel tersinkron (temuan 9). Pembukuannya lewat jurnal manual seperti sekarang |
| Q-147 | Sertifikat = `hr_dokumen`, jenis bawaan **Sertifikat Pelatihan** tetapi **boleh dipilih jenis aktif lain**? | Ya | Pengingat Fase 6 hanya mengingatkan sertifikat terakhir per jenis (temuan 5); sertifikat yang perlu diingatkan sendiri-sendiri (K3, STR) diberi jenis sendiri tanpa mengubah SQL Fase 6 |
| Q-148 | `hr.training.manage` boleh menulis/menghapus dokumen yang **tertaut ke peserta** tanpa `hr.document.manage`, dan berkasnya dibaca dengan `hr.training.view`? | Ya | Tanpa itu petugas pelatihan butuh izin rahasia dokumen (KTP, KK) hanya untuk mengunggah sertifikat |
| Q-149 | **Tanpa Telegram dan kartu baru** di Fase 7? | Ya, opsi (a) | Opsi (b): `pelatihan_besok` dan `pelamar_menunggu` lewat `muat_pengingat`, sakelar bawaan mati. Usulan (a) karena pengurus pelatihan dan rekrutmen adalah orang yang sama yang mencatatnya |
| Q-150 | Layar **Web/Desktop saja**; modul dan command tetap terdaftar di Mobile? | Ya | Q-35, Q-88, Q-108, Q-126 |
| Q-151 | Tiga sub-fase **7a** (skema, izin, rekrutmen), **7b** (Jadikan personil, pelatihan), **7c** (layar, runner, Mobile), satu sesi per sub-fase? | Ya | 7a berdiri sendiri dan menetapkan versi; 7b bergantung pada skema 7a; layar paling akhir supaya kontraknya sudah tetap |

### 25.9 Penanda yang ditinjau pemilik

**Yang dirasakan pengguna:**

- Dua tab baru di Kepegawaian: **Rekrutmen** dan **Pelatihan**; tab
  **Pelatihan** di rincian pegawai. Semuanya butuh koneksi, di Desktop
  sekalipun; tanpa koneksi muncul `PESAN_LURING`.
- Pelamar yang diterima dijadikan guru atau tendik dari form yang sama dengan
  halaman Guru/Pegawai, termasuk kontrak pertamanya. Kartu ID tetap dicetak
  dari menu Kartu ID; akun operator tetap dibuat terpisah.
- Data pribadi (NIK, rekening) diisi sesudah menjadi pegawai di tab Pribadi
  dan Keuangan, seperti pegawai lain.
- Sertifikat pelatihan tampil di tab Dokumen pegawai dan ikut pengingat
  kedaluwarsa Fase 6.

**Risiko data dan keputusan:**

- **Data pelamar yang tidak menjadi pegawai dihapus permanen** 12 bulan sesudah
  lowongannya ditutup, termasuk yang prosesnya belum selesai. Membuka lagi
  lowongan mengulang hitungannya; lowongan tanpa tanggal tutup yang tidak
  pernah ditutup menyimpan pelamarnya tanpa batas.
- Penghapusan hanya berjalan saat ada sesi yang login.
- Berkas cadangan dan ekspor lama tetap memuat pelamar yang sudah dihapus.
- Sesudah retensi hanya tersisa jumlah pelamar yang dihapus per lowongan.
- Jadikan personil di Desktop bukan satu transaksi; celahnya ditutup dengan id
  deterministik dan tombol Lanjutkan. `id_unik` personil hasil rekrutmen
  diturunkan dari id pelamar.
- Tidak ada "batal jadikan personil".
- `hr.training.manage` bisa menulis dokumen berjenis apa pun asal tertaut ke
  peserta (Q-147, Q-148).
- Sertifikat yang dicatat dengan jenis sama tetap hanya diingatkan yang
  terakhir (temuan 5).
- Biaya pelatihan tidak masuk pembukuan otomatis.
- Role buatan sendiri yang hanya diberi izin Fase 7 tanpa `employees.view` atau
  `teachers.view` tidak bisa membuka halaman Kepegawaian.

**Perangkat:**

- **v72 menghentikan sinkron setiap Desktop/Mobile v71** sampai diperbarui
  (`SCHEMA_VERSION_OUTDATED`), begitu satu perangkat atau Web menaikkan cloud.
  Tidak ada tabel snapshot atau rute baru, jadi perangkat lama tidak bisa
  merusak data Fase 7; yang dirasakan hanya berhentinya sinkron.
- Telegram tidak berubah (kecuali opsi b Q-149).

### 25.10 Jawaban Fase 7 (19 Nov 2026)

Pemilik menyetujui semua usulan Q-130 sampai Q-151 apa adanya, termasuk opsi
(a) Q-149 (tanpa Telegram dan kartu baru) dan tahun kalender Q-145. Isi
§25.1–§25.9 tidak berubah. Pengerjaan dimulai dari 7a (§25.7) di sesi baru.

### 25.11 Sudah dibangun

**Sudah dibangun: sub-fase 7a** (19 Nov 2026). Skema v72, sentinel `-2048`
(`hris-rekrutmen-pelatihan-v1`); tanpa tabel snapshot, rute sync, atau
perubahan `storage.rs`.

- **Langkah 1, skema.** Keenam tabel §25.3 (termasuk `hr_pelatihan` dan
  `hr_pelatihan_peserta`) + sembilan indeks di `turso.rs::ensure_schema` dan
  blok v72 `db-migrations.ts`, DDL identik. `ensure_schema` menulis baris
  `72 'hris-rekrutmen-pelatihan'` dan sentinel `-2048`;
  `ensure_schema_current` memeriksa `-2048`; kesepuluh daftar sentinel di tes
  `turso.rs` mendapat `-2048`. `CURRENT_SCHEMA_VERSION` dan
  `CLIENT_SCHEMA_VERSION` (Desktop, Mobile lewat sinkron) 72,
  `REQUIRED_TABLE_COUNT` 137, `isDatabaseSchemaReady`,
  `schema-consistency.test.ts`, `PROMOTION_PLAN` lapisan 8 (urutan §25.3).
- **Langkah 2, RBAC.** Lima izin di `PERMISSION_CATALOG` dan baris
  `app_permission` Rust (urutan 1428–1432); `hr.recruit.delete` di
  `SENSITIVE_MUTATION_PERMISSIONS`, `hr.recruit.view|manage` di
  `CONFIDENTIAL_PERMISSIONS`, ketiganya di `ADMIN_DEFAULT_EXCLUDED_PERMISSIONS`.
  Paket: Kepegawaian kelima izin, Yayasan `hr.recruit.view` +
  `hr.training.view`, Kepala Sekolah `hr.training.view` (`ROLE_HRIS_BAWAAN` ↔
  `DEFAULT_ROLE_PERMISSIONS`); Admin mendapat `hr.training.*` otomatis.
  `rbac-migration.test.ts` memuat versi 72.
- **Langkah 3, aturan kembar** `desktop/hr_rekrutmen.rs` ↔
  `validations/hr-rekrutmen.ts`: `validasi_lowongan`, `status_lowongan`,
  `periksa_buka_lagi`, `validasi_pelamar`, `status_pelamar`, `periksa_tahap`,
  `periksa_batal_tahap`, `id_dari_pelamar`, `id_pelamar_baru`,
  `RETENSI_PELAMAR_BULAN`, dan 26 SQL (yang berupa daftar ber-`-- batas:`).
  Predikat bersama `TUTUP_EFEKTIF_SQL`, `STATUS_PELAMAR_SQL`, dan
  `PELAMAR_LAMA_SQL` disalin harfiah ke SQL pemakainya, diperiksa di TS dan
  Rust. Vektor `hr-rekrutmen.vektor.json`: Microteaching di lowongan Tendik,
  tahap sesudah Diterima/Mundur, lompat/ulang/mundur tahap proses, Ditolak
  tanpa catatan, `Lamaran` 1 tidak bisa dibatalkan, bukan tahap terakhir,
  status lowongan (termasuk tombol Tutup menang atas Dijadwalkan), buka lagi,
  normalisasi nomor HP dan email, id deterministik guru/tendik.
  `hr-rekrutmen.test.ts` memeriksa teks SQL dan pesan harfiah ke Desktop dan
  Mobile.
- **Langkah 4, transaksi cloud** `hr_rekrutmen.rs` ↔
  `services/hr-rekrutmen.ts`: lowongan (`simpan`/`tutup`/`buka` dalam satu
  draft ber-`aksi`), pelamar + tahap 1 satu `execute_atomic`/`batch`, tahap
  `catat` (urutan dihitung di INSERT, penjaga urutan terbesar `?6` di
  statement yang sama) dan `batal`, berkas (maks 3, `urai_berkas_dokumen`
  apa adanya, terkunci sesudah personil), hapus satu pelamar
  (`HAPUS_PELAMAR_SQL` empat statement), retensi `HAPUS_PELAMAR_LAMA_SQL`.
  Data uji sama di `hr_rekrutmen_alur_cloud` (Rust, `TursoClient::local_file`)
  dan `services/hr-rekrutmen.test.ts`; `hr_rekrutmen_sentinel_2047_memicu_v72`
  menguji database v71 menerima enam tabel dan lima izin, Admin tanpa
  `hr.recruit.*`.
- **Langkah 5, command, rute, gateway.** Sembilan command di `commands.rs`,
  `lib.rs`, `build.rs`, `capabilities/default.json` (Desktop dan Mobile);
  sembilan `route.ts` di `/api/kepegawaian/recruitment/…` (`applicants/file`
  `POST` + `DELETE` dengan batas body berkas, `applicants/delete` `DELETE`,
  `cleanup` `requireWebSession`); sebelas fungsi di `gateways/hris.ts`
  (`muatLowongan` … `bersihkanPelamar`). `hr_rekrutmen.rs` terdaftar di
  `sync-rust-modules.ts` dan `mobile/mod.rs`; kedua skrip sinkron dijalankan.

**Keputusan kecil yang diambil saat membangun** (tinjau bila tidak sesuai):

- **`expectedCloudOnlyTables` tidak disentuh.** Daftar itu hanya ada di
  salinan lama `.agents/skills/absensi-sppg-rules/scripts/audit-sync-contract.ts`
  yang tidak dijalankan `audit:contract` (yang berjalan adalah
  `scripts/audit-sync-contract.ts`, tanpa daftar tabel khusus cloud) dan
  memang tidak memuat satu pun tabel v68–v71. Temuan 3 §25.1 keliru di titik
  ini.
- Email pelamar memakai `is_valid_operator_email` ↔ `isValidOperatorEmail`
  yang sudah ada (maks 120, bukan 255 seperti §25.2.2).
- Nomor HP pelamar wajib lolos `is_valid_operator_phone` (9–15 digit), bukan
  hanya dinormalkan.
- Tanggal lamaran dan lowongan pelamar tidak bisa diubah (supaya tahap 1 tetap
  sama dengan tanggal lamaran); salah ketik = hapus lalu catat ulang.
- Ubah lowongan juga menolak tanggal buka sesudah tanggal lamaran pelamar
  pertama (pesan sendiri, dijaga juga di statement UPDATE).
- `mungkin_ganda` = nama (tanpa beda huruf besar) dan nomor HP sama, termasuk
  sama-sama tanpa nomor HP.
- `tanggal_hapus` di daftar lowongan = hari pertama pelamar boleh terhapus
  (`tutup efektif + 12 bulan + 1 hari`).
- Tutup efektif hanya dihitung di SQL (`TUTUP_EFEKTIF_SQL`), tanpa fungsi
  murni kembar; kasusnya ada di tes alur, bukan di vektor.
- `KLAIM_PELAMAR_SQL` dipindah ke 7b bersama pemakainya (`hire`).
  `id_dari_pelamar` dan `IdPersonil` sudah ada (vektor), ditandai
  `cfg_attr(not(test), allow(dead_code))` sampai 7b memakainya.
- `KONFIRMASI_HAPUS_PERMANEN` tetap diperiksa di layar (7c), tidak di
  backend; backend cukup `hr.recruit.delete` (pola inventaris).
- Cleanup Desktop lewat `require_session` (tanpa gerbang lisensi, seperti
  2FA); Web `requireWebSession` (lisensi tidak sah ditolak, baca-saja lolos).

**Angka sesudah 7a:** `audit:contract` 439 command Desktop / 444 Mobile, 136
permission, 145 rute kanonik, 81 tabel snapshot; `REQUIRED_TABLE_COUNT` 137;
329 `route.ts`.

**Gerbang yang dijalankan:** `tsc` Desktop dan Biome berkas yang diubah;
`bun test` per berkas `validations/hr-rekrutmen.test.ts`,
`services/hr-rekrutmen.test.ts`, `rbac-migration.test.ts`,
`schema-consistency.test.ts` (Desktop); `cargo test hr_rekrutmen` Desktop (5
lulus, tanpa peringatan); `audit:contract`, `audit:schema`, `audit:sql`,
`audit:list-bound`. Belum: `bun run check` penuh, suite Rust penuh, tes
salinan Mobile dan `cargo test` Mobile, `tsc` Mobile, tes sentinel lama
`turso.rs` lain yang daftarnya disunting.
