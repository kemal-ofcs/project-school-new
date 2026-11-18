# PRD HRIS — Fase 1

Bagian §19 dari `prd-hris.md`, dipindahkan apa adanya pada 2026-11-18 supaya satu sesi cukup membaca satu fase. Nomor bagian tidak berubah: rujukan `prd-hris.md §19.x` di kode menunjuk ke berkas ini. Istilah, keputusan pemilik (§5), hak akses umum (§15), dan sinkronisasi (§17) ada di `prd-hris.md`.

## 19. Urutan pengerjaan Fase 1

Ditulis setelah menelusuri kode sekolah (14 Nov 2026), dengan Fase 1
perusahaan (§5, §16 di `C:\dev\absensi-perusahaan\prd-hris.md`, modul
`desktop/hris.rs` ↔ `validations/hris.ts` + `services/hris.ts` di sana)
sebagai rujukan pola, bukan sumber salinan. Bila §7 dan bagian ini berbeda,
**bagian ini yang berlaku** setelah Q-16 sampai Q-39 dijawab. Belum ada kode
yang diubah.

### 19.1 Temuan dari kode

Diverifikasi ke kode sekolah (baris per 14 Nov 2026).

**Salah atau perlu diubah:**

1. **`master_data` juga memuat siswa.** Siswa ditulis dengan `divisi =
   'Peserta Didik'`, `jabatan_status = 'Siswa'`, `jenis_personil = 'SISWA'`
   (`academic.rs:2131-2135`, `personnel.ts:332-336`). Migrasi "setiap teks
   divisi menjadi satu bagian" dari perusahaan akan membuat bagian "Peserta
   Didik" dan jabatan "Siswa". Organisasi hanya untuk **pegawai** (guru +
   tendik); siswa dikecualikan dengan penyaring yang sudah dipakai halaman
   Karyawan (`employee.ts:170-172`, `operational.rs:120-122`).
2. **Guru ditulis dengan divisi dan jabatan terkunci.** `save_teacher`
   menyisipkan `'Tenaga Pengajar'`/`'Guru'` (`academic.rs:1794-1797`,
   `personnel.ts:123-127`), `ON CONFLICT` tidak pernah mengubah `divisi`, dan
   kartu ID ditimpa `divisi = 'Tenaga Pengajar'` (`academic.rs:1868`). Bagian
   dan jabatan guru tidak bisa diubah sama sekali hari ini.
3. **`jenis_personil` adalah penanda peran, bukan status kerja.** Nilainya
   `GURU`/`SISWA`/`Pegawai` dan dipakai memisahkan daftar Karyawan dari Guru
   dan Siswa (temuan 1) serta sasaran `PERSONIL:`. Keputusan perusahaan Q-40
   ("kontrak menimpa `jenis_personil`") **tidak boleh** dipakai di sini:
   kontrak GTT akan mengubah guru menjadi "Kontrak" dan memindahkannya ke
   daftar Karyawan.
4. **Handler cloud `employee/update` tidak menulis `tanggal_daftar`**
   (`turso.rs:10420-10439`; cabang `create` menulisnya di `:10532`, Web
   `updateKaryawan` di `employee.ts:376-378`). Koreksi "Tgl Daftar /
   Bergabung" dari Desktop/Mobile tidak pernah sampai cloud dan tertimpa
   tarikan berikutnya. Bug yang sama dengan perusahaan (§16.1 di sana).
5. **Handler cloud `teacher/*` menimpa `status_kepegawaian` tanpa syarat**
   (`turso.rs:13093-13110`, bawaan `'Honorer'` bila kuncinya absen). Setelah
   status diturunkan dari kontrak, simpan guru dari perangkat lama akan
   mengembalikan status form. Handler wajib menghitung ulang dari kontrak
   sesudah upsert.
6. **Tiga daftar status kepegawaian yang tidak sama.** Form guru
   `STATUS_KEPEGAWAIAN_GURU` = PNS, PPPK, GTY, GTT, Honorer, **Kontrak**
   (`validations/personnel.ts:31-38`, gabungan ejaan Web dan Mobile); pemilih
   sasaran komponen gaji `TEACHER_EMPLOYMENT_STATUSES` = PNS, GTY, GTT,
   Honorer (`payroll-policy.ts:113-118`, dipakai `payroll/config/page.tsx:956`),
   jadi tunjangan `STATUS:PPPK` tidak bisa dipilih; K-1 = GTY, GTT, PTY, PTT,
   Honorer, PNS/PPPK. PTY dan PTT belum ada di mana pun.
7. **Guru berstatus `Kontrak` dianggap pegawai tetap oleh Fase 0.** Bawaan
   `pajak_status_tidak_tetap` = Honorer, GTT, PTT (`pajak-bawaan.json`,
   `pajak.rs:140`), sedangkan Mobile pernah menyimpan `Kontrak` untuk arti
   yang sama dengan GTT. Lihat Q-27.
8. **Tendik tidak punya status kepegawaian.** Kolomnya hanya di `guru_data`;
   rekap gaji membaca `COALESCE(g.status_kepegawaian, '')`
   (`payroll/commands.rs:1601`, `payroll-recap.ts:364`), jadi tendik selalu
   "tetap" untuk pajak dan tidak pernah cocok dengan `STATUS:`.
9. **Konfigurasi kini mencocokkan NAMA divisi.** Sasaran `DIVISI:`
   (`engine.rs:330` ↔ `payroll-policy.ts:201`), cakupan whitelist libur
   `DIVISI` (`holiday-whitelist.ts:13`, `:128`), dan saringan laporan
   (`report.ts:194`, `:305`, `kelas_divisi`). Ganti nama bagian tanpa
   menyentuhnya membuat tunjangan per divisi berhenti dibayar dan whitelist
   libur berhenti berlaku, diam-diam. Pemilih `DIVISI:` di form komponen
   memakai teks unik dari personil (`payroll/config/page.tsx:962`).
10. **Halaman Pengaturan dijaga `branding.manage`** (`access.ts:76`). Tab
    "Organisasi" di Pengaturan (§7.1) mengunci role Kepegawaian; perusahaan
    memindahkannya ke halaman HRIS (§16.9 di sana).
11. **Paket Admin = semua izin yang tidak sensitif** (`catalog.ts:563-568`;
    Rust `ADMIN_DEFAULT_EXCLUDED_PERMISSIONS`, `turso.rs:645`, dipakai seed
    `:3308-3315`). Tanpa daftar pengecualian baru, Admin otomatis melihat NIK,
    rekening, dan pindaian KTP (Q-33).
12. **Tahun ajaran disimpan per semester.** `akademik_tahun_ajaran` satu baris
    per (`nama_tahun`, `semester`) (`storage.rs:1611-1620`). "Per tahun ajaran"
    di §7.2 berarti `nama_tahun` (mis. `2026/2027`), bukan `id_tahun_ajaran`.

**Sudah ada, dipakai ulang (tidak dibuat dua kali):**

- **Ganti identitas menulis ulang riwayat orang itu** di tiga tempat: lokal
  `update_employee` (`operational.rs:546-577`), Web `updateKaryawan`
  (`employee.ts:402-468`), handler cloud `employee/update`
  (`turso.rs:10472-10497`): `id_card`, `absensi_harian.kelas_divisi`,
  `log_scan`, `backup_karyawan`, `koreksi_admin`. Ganti nama bagian (Q-17)
  memakai perilaku yang sama, untuk semua anggotanya sekaligus.
- **Guru tiba di cloud lewat event `employee/update`**
  (`enqueue_employee_snapshot`, `academic.rs:1915`; komentar
  `turso.rs:10412-10417`). Jadi kolom organisasi guru cukup ditangani di
  satu handler, `employee/*`.
- `master_data.unit` menyimpan **nama** unit (`storage.rs:622-629`);
  `jabatan_status` tercetak di kartu ID (`client/id-card-renderer.ts`);
  `lp` = jenis kelamin; `tanggal_mulai_aktif` sudah ditulis handler
  `employee/update` (`turso.rs:10438`) dan ada di form Karyawan
  (`karyawan/page.tsx:1536`); `tanggal_selesai_aktif` sudah dipakai Fase 0
  untuk masa terakhir.
- `guru_data` (`nip`, `nuptk`, `gelar`, `spesialisasi_mapel`,
  `status_kepegawaian`, `storage.rs:1659-1668`) dan
  `akademik_rombel.id_wali_kelas` (`storage.rs:1634`).
- Sasaran komponen `applies_to_subject` (`engine.rs:313-337`) ↔
  `appliesToSubject` (`payroll-policy.ts:177-206`) dan
  `APPLIES_TO_GROUP_PREFIXES` (`payroll-policy.ts:97`).
- Status pajak `status_pph` (`pajak.rs:155`) ↔ `statusPph` (`pajak.ts:155`),
  `daftar_status_tidak_tetap` (`pajak.rs:140`), kunci
  `KUNCI_STATUS_TIDAK_TETAP` (`pajak.rs:37`) dibaca di
  `payroll/commands.rs:2692`.
- **Berkas cloud-only dengan aturan kembar**: `berkas_sekolah.rs` ↔
  `validations/berkas-sekolah.ts` (`siswa_berkas` v59, `MIME_BERKAS`,
  `MAKS_BYTE_BERKAS` 200 KB, `berkas-sekolah.vektor.json`); command cloud
  lewat `TursoClient` seperti `konten_gambar.rs:110`, `:134`.
- `assert_unique_value` (`academic.rs:141`), `sync::enqueue` (`sync.rs:2537`),
  penyimpan setting per modul dengan outbox `setting` (pola JP,
  `class_attendance.rs:622-626`), `PilihCari`, `KonfirmasiSimpan`.
- Dari perusahaan (pola, ditulis ulang): `nomor_identitas`,
  `validasi_pribadi`/`validasi_keuangan`, `periksa_atasan` +
  `dalam_siklus_atasan`, `status_kerja`, `tanda_kontrak`, `validasi_berkas`
  (tanda tangan bita), id migrasi deterministik `'div-' ||
  lower(hex(lower(trim(divisi))))`.

**Kait:**

- Versi: `CURRENT_SCHEMA_VERSION` 67 (`db-schema.ts:5`),
  `REQUIRED_TABLE_COUNT` 104 (`:6`) + daftar `isDatabaseSchemaReady`
  (`:15-51`), `CLIENT_SCHEMA_VERSION` 67 (`sync.rs:23`), sentinel `-2043`
  (`turso.rs:4916`, pemeriksa `:5269`, daftar `DELETE … version IN` di tes
  `:17578` dan seterusnya), `ensure_pajak_masa_v67` (`turso.rs:4993`) dan
  `ensure_schema_current` (`:5251`), blok v67 `db-migrations.ts:85`,
  `:3409`, daftar versi `rbac-migration.test.ts:188-189`.
- Snapshot: 70 `SnapshotTable` (`sync.rs:81`) = 70 `SnapshotSource`
  (`turso.rs:842`); kolom `master_data` di `sync.rs:85-105`;
  `CANONICAL_SYNC_ROUTES` (`sync.rs:1605`).
- `master_operator` cloud-only (`turso.rs:2049-2068`), tanpa `id_karyawan`;
  daftar `ensure_column`-nya `turso.rs:4396-4415`; simpan akun Rust
  `turso.rs:6963`/`:7154`, Web `lib/operators/operator-admin.ts`.
- `PROMOTION_PLAN` (`database-promotion.ts:41`), `CLOUD_MIRRORED_TABLES`
  (`storage.rs:2419`), `reset_cloud_linked_data` (`storage.rs:2549`).
- `AppArea` (`access.ts:3-38`); `SYSTEM_ROLE_KEYS` (`catalog.ts:550`), seed
  role Rust (`turso.rs:3185-3189`).
- Command terdaftar: Desktop 365 (`lib.rs`), Mobile 371 (362 `desktop_*` +
  9 `mobile_*`). `commands.rs`, `turso.rs`, `sync.rs`, `academic.rs`,
  `operational.rs`, `payroll/*` ada di `filesToSync`
  (`mobile/scripts/sync-rust-modules.ts`); `storage.rs`, `lib.rs`,
  `build.rs`, `capabilities/default.json`, `mod.rs`, dan `mobile/src/app/**`
  disunting tangan.

### 19.2 Rancangan per bagian

#### 19.2.1 Organisasi (§7.1, A-1)

- **Lingkup**: pegawai = `master_data` yang bukan siswa (penyaring temuan 1).
  Siswa tidak punya bagian, jabatan, atasan, atau kontrak; form dan alur siswa
  tidak berubah.
- **Bagian** (`hr_bagian`) dan **jabatan** (`hr_jabatan`) global, berlaku di
  semua unit (Q-18). Pegawai memilih unit, bagian, dan jabatan terpisah; "TU
  SMP" adalah kombinasi, bukan bagian baru.
- **Nama unik** tanpa beda huruf besar-kecil dan spasi ganda (`kunci_nama`),
  ditegakkan di aplikasi (`assert_unique_value`), tidak dengan `UNIQUE`. Nama
  bagian juga tidak boleh sama dengan nama lama bagian **lain**
  (`hr_bagian_nama`, dicadangkan). Kembaran dari dua perangkat offline tidak
  ditolak cloud; muncul sebagai tanda `nama_ganda` di tab Organisasi.
- **Tidak pernah dihapus**, hanya dinonaktifkan. Pilihan baru harus master
  aktif; master nonaktif yang sudah dipakai orang itu boleh tetap.
- **Ganti nama bagian** (Q-17 (a)): satu transaksi menulis `hr_bagian`,
  `hr_bagian_nama` (bila nama baru), lalu menulis ulang **untuk semua
  anggotanya** kolom yang hari ini ditulis ulang saat identitas satu orang
  berubah (`master_data.divisi`, `id_card`, `absensi_harian.kelas_divisi`,
  `log_scan`, `backup_karyawan`, `koreksi_admin`), ditambah konfigurasi kini:
  `payroll_components.applies_to = 'DIVISI:<lama>'` dan
  `hari_libur_whitelist` cakupan `DIVISI`. Lokal dan handler cloud
  `hr-section/save` menjalankan SQL kembar yang sama; perangkat lain menerima
  hasilnya lewat tarikan. `payroll_items.divisi` (slip beku) tidak disentuh.
- **Gabungkan bagian** (Q-38): memindahkan semua anggota bagian A ke B
  (penulisan ulang yang sama), nama-nama A dicatat sebagai nama lama B, A
  dinonaktifkan. Dibutuhkan karena migrasi teks pasti melahirkan kembaran
  salah ketik ("Operational"/"Operasional").
- **Jabatan** sama dengan bagian tanpa riwayat nama (pola perusahaan Q-39):
  `jabatan_status` tetap diisi nama sekarang (tercetak di kartu ID), ganti
  nama ikut menulis ulang `master_data.jabatan_status` anggotanya.
- **Atasan langsung** `master_data.id_atasan`: pegawai lain yang ada, bukan
  dirinya, bukan siswa, tanpa siklus (`periksa_atasan` ↔ `periksaAtasan`).
  Siklus dari dua perangkat offline menjadi tanda `atasan_siklus`. Tidak
  membatasi akses apa pun.
- **Form Karyawan dan form Guru** (Q-19): `PilihCari` bagian (wajib untuk
  pegawai baru dari form), jabatan, atasan (opsional). Teks `divisi` dan
  `jabatan_status` selalu diisi dari master. Form guru memakai bawaan bagian
  "Tenaga Pengajar" dan jabatan "Guru" bila keduanya ada (hasil migrasi),
  sehingga menambah guru tetap satu langkah. Kartu ID guru tidak lagi
  dikunci ke `'Tenaga Pengajar'`.
- **Impor Excel Karyawan**: teks divisi/jabatan dipetakan ke master termasuk
  nama lama; yang tidak dikenal menolak barisnya dengan "Divisi 'X' belum
  terdaftar di Kepegawaian → Organisasi." (Q-21). Impor guru tidak punya kolom
  divisi dan tetap memakai bawaan.
- **TMT** = `master_data.tanggal_mulai_aktif` (Q-20), diberi label "TMT
  (Tanggal Mulai Tugas)" di form Karyawan dan ditambahkan ke form Guru.
  **Masa kerja** = TMT sampai hari ini WIB, tidak disimpan.
- **Diturunkan, tidak disimpan**: jumlah anggota per bagian/jabatan, tanda
  `nama_ganda`/`atasan_siklus`, "teks divisi tanpa master" (pegawai ber-
  `id_bagian` kosong yang teksnya tidak cocok nama mana pun).

#### 19.2.2 Tugas tambahan (§7.2)

- **Jenis** (`hr_tugas_jenis`): nama, ekuivalen JP per minggu bawaan, aktif.
  Bawaan di-seed di cloud dengan id tetap (Q-30); bisa diganti nama dan
  ekuivalennya. Satu id dikenal kode: `tgs-wali-kelas`.
- **Tugas** (`hr_tugas_tambahan`): pegawai, jenis, unit (nama unit, kosong =
  lintas unit/yayasan), tahun ajaran (`nama_tahun`), nomor dan tanggal SK,
  ekuivalen JP (kosong = dari jenis), **tanggal mulai dan selesai**. Form
  mengisi tanggal bawaan dari rentang semester tahun ajaran itu. Satu orang
  boleh lebih dari satu tugas.
- **Wali kelas dibaca dari `akademik_rombel.id_wali_kelas`**: pegawai
  memegang `tgs-wali-kelas` selama ia wali rombel aktif yang semesternya
  beririsan dengan periode. Baris `hr_tugas_tambahan` berjenis wali kelas
  hanya menambah nomor SK untuk satu rombel (`id_rombel` wajib, dan rombel itu
  harus berwali orang yang sama saat disimpan); baris itu tidak pernah
  memberi tugas sendiri, supaya tidak tercatat dua kali.
- **Berlaku** pada periode `[a, b]` = `tanggal_mulai ≤ b`, `tanggal_selesai`
  kosong atau `≥ a`, tidak dibatalkan. Dicopot di tengah tahun = isi tanggal
  selesai. Salah input = **batal** dengan alasan (`dibatalkan_pada/_oleh`,
  `alasan_batal`), tidak ada `DELETE`. Status (Berlaku / Selesai / Dibatalkan)
  diturunkan.
- **Sasaran komponen `TUGAS:<id_jenis>`** (Q-29) di `applies_to_subject` ↔
  `appliesToSubject` dan `APPLIES_TO_GROUP_PREFIXES`. `ComponentSubject`
  mendapat `tugas` (daftar id jenis yang berlaku di periode run), diisi satu
  SQL kembar `TUGAS_BERLAKU_SQL` di ketiga titik hitung gaji (pratinjau dan
  pembekuan Rust, `computePayrollRecap` Web). Prefiks lain dan nilai tak
  dikenal tidak berubah: tetap diperlakukan sebagai id. Pemilih sasaran di
  form komponen (Web dan Mobile) mendapat kelompok "Tugas tambahan".
- **Siapa**: lihat = `employees.view` atau `teachers.view`; simpan dan batal
  = `hr.duty.manage`. Ditolak: jenis nonaktif untuk baris baru, tanggal
  selesai sebelum mulai, ekuivalen di luar 0–40, wali kelas tanpa rombel atau
  rombel berwali orang lain, siswa.

#### 19.2.3 Data kepegawaian (§7.3)

- **Kerja** (unit, bagian, jabatan, atasan, TMT, status kepegawaian dari
  kontrak, masa kerja): tersinkron, `employees.view`/`teachers.view`.
- **Pribadi** dan **Keuangan** di `hr_profil` **cloud-only** (A-2 §7.3): tidak
  pernah ada di SQLite perangkat, hanya terbaca saat terhubung. Profil
  mengembalikan hanya kelompok yang izinnya dipegang. Daftar pegawai tidak
  memuat NIK atau rekening sama sekali.
- **Pendidik**: `nip`, `nuptk`, `gelar` tetap di `guru_data`. Riwayat
  pendidikan (`hr_pendidikan`: jenjang, prodi, perguruan tinggi, tahun lulus,
  tanda linier) dan sertifikat pendidik (`hr_sertifikasi`: nomor, NRG, tahun,
  bidang studi) **cloud-only** (Q-31). Baca `teachers.view`, ubah
  `teachers.manage`. Bisa diisi untuk tendik juga (ijazah).
- **Validasi kembar** Rust ↔ TS, vektor di `validations/hris.vektor.json`:
  NIK dan KK 16 digit, NPWP 15/16 digit, NUPTK 16 digit, NRG 12 digit
  (dicek ulang), BPJS dan rekening 5–20 digit; tanda baca dibuang sebelum
  disimpan. HP darurat lewat normalisasi kontak yang sudah ada.

#### 19.2.4 Status kepegawaian dan kontrak (§7.4)

- **`hr_kontrak` tersinkron, append-only**: status (K-1: `GTY`, `PTY`, `GTT`,
  `PTT`, `Honorer`, `PNS`, `PPPK`; Q-24), nomor SK/kontrak, tanggal mulai
  (untuk PNS/PPPK = tanggal SK penempatan), tanggal selesai, akhir masa
  percobaan, catatan. Pembatalan = baris `Pembatalan` berid
  `batal-<id_kontrak>`, wajib alasan.
- **Ditolak** (kelengkapan, bukan angka hukum): GTT/PTT tanpa tanggal selesai;
  selesai sebelum mulai; masa percobaan selain GTY/PTY; `GTY`/`GTT` untuk
  personil tanpa `guru_data`, `PTY`/`PTT` untuk guru (Q-24); pembatalan tanpa
  alasan atau atas kontrak yang sudah dibatalkan; siswa.
- **Tanda, bukan penolakan** (angka di `setting_gex_system`, Q-28):
  `percobaan_lewat` (> `hr_percobaan_maks_bulan`, bawaan 3) dan `pkwt_lewat`
  (jumlah GTT/PTT berturut-turut sejak GTY/PTY terakhir > `hr_pkwt_maks_bulan`,
  bawaan 60).
- **Status kini tidak disimpan**: `STATUS_KINI_SQL(id, tanggal)` = status
  kontrak tidak dibatalkan dengan `tanggal_mulai ≤ tanggal` terakhir (seri
  `id_kontrak`), lalu `guru_data.status_kepegawaian`, lalu kosong. Satu SQL
  kembar Rust ↔ TS (teks diperiksa harfiah seperti `RUN_TAHUN_SQL`).
- **Cermin ke `guru_data.status_kepegawaian`** (§7.4): menyimpan kontrak atau
  pembatalan untuk guru menulis status kontrak terakhir (tanggal
  `9999-12-31`) di transaksi yang sama, lokal dan di handler cloud
  `hr-contract/create`; handler `teacher/*` menghitung ulang sesudah upsert
  (temuan 5). Tidak bergantung jam, jadi urutan tiba di cloud tidak mengubah
  hasil. Kontrak berawal di masa depan langsung terlihat di cermin; gaji
  memakai tanggal periodenya. Isian status di form guru (Web dan Mobile)
  terkunci bila guru itu punya kontrak; tanpa kontrak, isian lama berlaku.
  **Tidak** menulis `jenis_personil` (temuan 3).
- **Gaji** (Q-25): rekap di ketiga titik hitung membaca `status_kepegawaian`
  dari `STATUS_KINI_SQL(id, period_end)` untuk guru **dan** tendik. Dengan
  itu `STATUS:` dan status pajak berlaku untuk tendik yang punya kontrak.
- **`pajak_status_tidak_tetap` dan `status_pph`** (Q-26 (a)): fungsi
  `status_pph` ↔ `statusPph` dan arti kunci (belum ada = bawaan, kosong =
  tidak ada) **tidak berubah**; yang berubah hanya masukannya (status kini
  dari kontrak, bukan langsung `guru_data`). Kunci mendapat layar: centang
  per status di kartu konstanta halaman Pajak (Web dan Mobile), izin
  `payroll.config.manage`, disimpan lewat outbox `setting` (pola JP).
  Daftar pilihannya = status K-1 ditambah nilai lama yang masih tersimpan
  (`Kontrak`), supaya tidak ada status yang tidak bisa dicentang.
- **Data lama tidak dimigrasi menjadi kontrak** (Q-27): kontrak butuh tanggal
  yang tidak dimiliki aplikasi. Status `guru_data` lama berlaku sampai kontrak
  pertama dicatat.
- **Siapa**: lihat = `employees.view`/`teachers.view`; tambah dan batal =
  `hr.contract.manage`; angka hukum = `hr.org.manage`.

#### 19.2.5 Dokumen (§7.5)

- **Cloud-only** (Q-31), seperti `siswa_berkas` dan HRIS perusahaan Q-45:
  `hr_dokumen_jenis` (bawaan berid tetap), `hr_dokumen` (data wajib: jenis,
  nomor, tanggal terbit, kedaluwarsa opsional, catatan), `hr_dokumen_berkas`
  (opsional). Tidak ada outbox, jadi "batas sebelum outbox" di §7.5 menjadi
  "batas sebelum menulis ke cloud", diperiksa Rust dan TS kembar.
- Berkas JPEG/PNG/WEBP/PDF, MIME harus cocok tanda tangan bita, maks 1 MB per
  berkas dan 5 per dokumen (Q-32); diunggah satu berkas per permintaan. Daftar
  dokumen tidak pernah membawa isi berkas; berkas ditarik per id saat dibuka.
- Hapus dokumen = `DELETE` sungguhan bersama berkasnya dalam satu transaksi
  (tidak ada perangkat yang bisa menghidupkannya kembali).
- Lihat `hr.document.view`, ubah `hr.document.manage`. Jenis dokumen disunting
  di Organisasi (`hr.org.manage`).

#### 19.2.6 Tautan akun ke personil (§7.6, A-2)

- Kolom `master_operator.id_karyawan` (cloud-only). Form operator Web/Desktop
  dan Mobile mendapat `PilihCari` "Personil" (pegawai aktif, bukan siswa).
- Satu personil hanya untuk satu akun **aktif**, ditegakkan di simpan akun
  Rust dan Web. Tautan boleh kosong; akun tanpa tautan berfungsi seperti
  sekarang. Mengubah tautan butuh `operators.manage` (sudah Superadmin-only).
- Fase ini hanya menyimpan. Membawa `id_karyawan` ke sesi (termasuk identitas
  luring) dan memakainya untuk "tidak untuk diri sendiri" dan cakupan unit
  (A-5) dikerjakan di Fase 2, saat ada aksi yang membutuhkannya.

#### 19.2.7 Laporan PTK (§7.7)

- Ekspor Excel per unit (`client/excel-export.ts`), Web/Desktop, butuh
  koneksi (membaca `hr_pendidikan`/`hr_sertifikasi`). Izin `teachers.view`.
- Kolom: nama, NIP, NUPTK, unit, bagian, jabatan, status kini, TMT, masa
  kerja, pendidikan tertinggi, prodi, sertifikat (bidang, tahun, NRG), mapel
  yang diajar (`jadwal_mengajar` aktif), tanda linier. Ringkasan: persentase
  berpendidikan S1/D4 ke atas dan persentase bersertifikat, per unit.
- Linieritas (Q-36): tanda manual pada riwayat pendidikan, ditampilkan
  berdampingan dengan bidang sertifikat dan mapel yang diajar; tanpa
  pencocokan otomatis.

### 19.3 Model data dan sinkronisasi

**Usulan: skema v68, sentinel `-2044` `hris-org-v1`. Seluruh DDL Fase 1
ditulis di langkah pertama (sub-fase 1a)**, walau logikanya baru dipakai di
1b dan 1c: satu versi hanya bisa dibangun sekali per database, dan menambah
tabel ke v68 di sesi berikutnya tidak akan sampai ke database pengembangan
yang sudah v68.

**Tersinkron** (keempat lapis: `storage.rs` Desktop + Mobile (tangan),
`turso.rs` `ensure_schema`, `db-schema.ts`/`db-migrations.ts`,
`SNAPSHOT_TABLES` = `SNAPSHOT_SOURCES`). Semua `delete_missing: false` (tidak
ada baris yang dihapus), tanpa `UNIQUE` selain PK.

| Tabel | Kolom | Snapshot / rute |
| :-- | :-- | :-- |
| `hr_bagian` | `id_bagian` PK, `nama` NOT NULL, `is_aktif` INTEGER NOT NULL DEFAULT 1 CHECK (0,1), `created_at`, `updated_at` | `hrBagian` / `hr-section/save` |
| `hr_bagian_nama` | `id_nama` PK = `<id_bagian>:<hex(lower(trim(nama)))>` (dua perangkat mencatat nama yang sama → satu baris), `id_bagian` NOT NULL, `nama` NOT NULL, `created_at`. Indeks `id_bagian`. Tidak pernah diubah | `hrBagianNama` / menumpang `hr-section/save` dan `hr-section/merge` |
| `hr_jabatan` | `id_jabatan` PK, `nama`, `is_aktif`, `created_at`, `updated_at` | `hrJabatan` / `hr-position/save` |
| `hr_tugas_jenis` | `id_jenis` PK, `nama` NOT NULL, `ekuivalen_jp` INTEGER NOT NULL DEFAULT 0 CHECK (0–40), `is_aktif`, `created_at`, `updated_at` | `hrTugasJenis` / `hr-duty-type/save` |
| `hr_tugas_tambahan` | `id_tugas` PK, `id_karyawan` NOT NULL, `id_jenis` NOT NULL, `unit`, `tahun_ajaran` NOT NULL, `id_rombel`, `nomor_sk`, `tanggal_sk`, `ekuivalen_jp` INTEGER NULL CHECK (NULL atau 0–40), `tanggal_mulai` NOT NULL, `tanggal_selesai`, `dicatat_oleh`, `dibatalkan_pada`, `dibatalkan_oleh`, `alasan_batal`, `created_at`, `updated_at`. Indeks `id_karyawan`, `tahun_ajaran` | `hrTugasTambahan` / `hr-duty/save`, `hr-duty/cancel` |
| `hr_kontrak` | `id_kontrak` PK, `id_karyawan` NOT NULL, `status` CHECK IN (`GTY`, `PTY`, `GTT`, `PTT`, `Honorer`, `PNS`, `PPPK`, `Pembatalan`), `id_ref`, `nomor`, `tanggal_mulai` NOT NULL, `tanggal_selesai`, `percobaan_selesai`, `catatan`, `dicatat_oleh` (dari sesi), `created_at`. Indeks `id_karyawan`. Append-only | `hrKontrak` / `hr-contract/create` (kontrak dan pembatalan) |
| `master_data` + 3 kolom | `id_bagian`, `id_jabatan`, `id_atasan` (TEXT, boleh kosong). DDL + `ensure_column` lokal dan cloud + `hasColumn`/`ALTER` TS + daftar kolom `SNAPSHOT_TABLES` | ikut `employee` |

`hr_kontrak` dan `hr_bagian_nama` tidak dimasukkan `APPEND_ONLY_TABLES`:
barisnya sedikit, tarikan utuh cukup.

**Khusus cloud** (hanya `turso.rs` + `db-migrations.ts`; tidak di
`storage.rs`, tidak di snapshot, tidak lewat outbox; dibaca dan ditulis
command Rust lewat `TursoClient` dan route Web, hanya saat terhubung; pada
Mode Database Lokal tabelnya ada di hub):

| Tabel | Kolom |
| :-- | :-- |
| `hr_profil` | `id_karyawan` PK; pribadi: `nik`, `no_kk`, `tempat_lahir`, `tanggal_lahir`, `agama` CHECK NULL atau IN (`Islam`, `Kristen`, `Katolik`, `Hindu`, `Buddha`, `Konghucu`, `Lainnya`), `status_nikah` CHECK NULL atau IN (`Belum Kawin`, `Kawin`, `Cerai Hidup`, `Cerai Mati`), `nama_ibu_kandung` (Q-37), `alamat_ktp`, `alamat_domisili`, `darurat_nama`, `darurat_hubungan`, `darurat_hp`; keuangan: `bank`, `no_rekening`, `nama_rekening`, `npwp`, `bpjs_kesehatan`, `bpjs_ketenagakerjaan`; jejak `pribadi_diubah_oleh/_pada`, `keuangan_diubah_oleh/_pada` (jam database) |
| `hr_pendidikan` | `id_pendidikan` PK, `id_karyawan` NOT NULL, `jenjang` CHECK IN (`SD`, `SMP`, `SMA/SMK`, `D1`, `D2`, `D3`, `D4`, `S1`, `S2`, `S3`), `prodi`, `perguruan_tinggi`, `tahun_lulus` INTEGER, `linier` INTEGER NOT NULL DEFAULT 0 CHECK (0,1), `catatan`, `dicatat_oleh`, `created_at`, `updated_at`. Indeks `id_karyawan` |
| `hr_sertifikasi` | `id_sertifikasi` PK, `id_karyawan` NOT NULL, `nomor_sertifikat`, `nrg`, `tahun` INTEGER, `bidang_studi`, `catatan`, `dicatat_oleh`, `created_at`, `updated_at`. Indeks `id_karyawan` |
| `hr_dokumen_jenis` | `id_jenis` PK, `nama`, `is_aktif`, `created_at`, `updated_at`. Bawaan `INSERT OR IGNORE`: `dok-ktp`, `dok-kk`, `dok-npwp`, `dok-ijazah`, `dok-transkrip`, `dok-serdik`, `dok-sk-yayasan`, `dok-sk-tugas`, `dok-kontrak`, `dok-skck`, `dok-sehat`, `dok-pelatihan`, `dok-lainnya` |
| `hr_dokumen` | `id_dokumen` PK, `id_karyawan` NOT NULL, `id_jenis` NOT NULL, `nomor`, `tanggal_terbit`, `tanggal_kedaluwarsa`, `catatan`, `dicatat_oleh`, `created_at`, `updated_at`. Indeks `id_karyawan`, `tanggal_kedaluwarsa` |
| `hr_dokumen_berkas` | `id_berkas` PK, `id_dokumen` NOT NULL, `urutan` CHECK 1–5, `nama_berkas`, `mime_type` CHECK IN (`image/jpeg`, `image/png`, `image/webp`, `application/pdf`), `data_base64` NOT NULL, `created_at`. Indeks `id_dokumen` |
| `master_operator` + 1 kolom | `id_karyawan` TEXT (DDL + `ensure_column` `turso.rs`, `ALTER` TS) |

Bila Q-31 (b) dipilih, `hr_pendidikan` dan `hr_sertifikasi` pindah ke tabel
tersinkron (rute `hr-education/save|delete`, `hr-certification/save|delete`,
`delete_missing: true` dengan tombstone), dan angka di bawah naik 2.

**Pengaturan** (`setting_gex_system`, tanpa skema baru, lewat outbox
`setting`): `hr_percobaan_maks_bulan` = 3, `hr_pkwt_maks_bulan` = 60 (kosong =
bawaan); `pajak_status_tidak_tetap` (kunci Fase 0, kini punya layar).

**Bawaan jenis tugas** (`hr_tugas_jenis`, tersinkron, di-seed `INSERT OR
IGNORE` hanya di cloud `turso.rs` + `db-migrations.ts`; perangkat
menerimanya lewat tarikan, Q-30). Ekuivalen JP mengikuti Permendikbud
15/2018 dan **wajib dicek ulang**: `tgs-kepsek` Kepala Sekolah 24,
`tgs-wakasek` Wakasek 12, `tgs-kaprog` Kaprog 12, `tgs-kaperpus` Kepala
Perpustakaan 12, `tgs-kalab` Kepala Lab/Bengkel 12, `tgs-wali-kelas` Wali
Kelas 2, `tgs-pembina-osis` Pembina OSIS 2, `tgs-pembina-ekskul` Pembina
Ekskul 2, `tgs-piket` Guru Piket 1, `tgs-bendahara-bos` Bendahara BOS 0.

**Handler cloud** (tidak pernah menolak karena master; kunci yang tidak
dibawa = tidak diubah, pola §17):

- `employee/create|update`: `id_bagian`, `id_jabatan`, `id_atasan` absen atau
  `null` = tidak dibawa, `""` = dikosongkan (penyimpangan perusahaan §16.9).
  Dengan `id_bagian` yang dikenal, teks `divisi` diambil dari master (event
  lama yang telat tidak mengembalikan nama lama); tanpa `id_bagian` (perangkat
  lama), teks dipetakan lewat `hr_bagian_nama` lalu dinormalkan ke nama
  sekarang; teks tak dikenal disimpan apa adanya dengan `id_bagian` kosong.
  Jabatan sama lewat nama `hr_jabatan`. `tanggal_daftar` ditulis bila payload
  membawanya tidak kosong (temuan 4). Siswa dilewati (tanpa pemetaan).
- `teacher/create|update`: sesudah upsert `guru_data`, cermin status dari
  kontrak dijalankan (temuan 5).
- `hr-section/save` dan `hr-section/merge`: upsert + nama lama + penulisan
  ulang anggota dan konfigurasi kini (§19.2.1), SQL yang sama dengan lokal.
  `hr-position/save` sama untuk jabatan.
- `hr-contract/create`: insert baris + cermin status guru.
- `hr-duty/save`: upsert penuh (form selalu membawa semua kolom);
  `hr-duty/cancel` hanya mengisi kolom batal bila masih kosong.

**Rute sync kanonik baru (7)**: `hr-section/save`, `hr-section/merge`,
`hr-position/save`, `hr-duty-type/save`, `hr-duty/save`, `hr-duty/cancel`,
`hr-contract/create`. Masuk `CANONICAL_SYNC_ROUTES` dan peta normalisasi
`turso.rs`; `audit:contract` memeriksa keduanya.

**Migrasi data** (sekali, hanya di cloud: blok sentinel `-2044` `turso.rs`
sesudah loop `ensure_column`, dan blok v68 `db-migrations.ts`, teks SQL
kembar `MIGRASI_ORGANISASI_SQL`; perangkat mendapat hasilnya lewat tarikan):

1. Setiap `LOWER(TRIM(divisi))` berbeda dari **pegawai** (bukan siswa, teks
   tidak kosong) menjadi `hr_bagian` berid `'bag-' ||
   lower(hex(lower(trim(divisi))))`, nama = ejaan yang paling banyak dipakai,
   plus satu `hr_bagian_nama`.
2. Sama untuk `jabatan_status` → `hr_jabatan` (`'jab-' || …`), kecuali kosong
   dan `-`.
3. `master_data.id_bagian`/`id_jabatan` diisi untuk pegawai `WHERE … IS NULL`.
4. Seed `hr_tugas_jenis` dan `hr_dokumen_jenis`.

Semua `INSERT OR IGNORE` / `WHERE … IS NULL`, aman diulang. Database baru
tanpa personil tidak mendapat bagian apa pun (tidak ada seed bagian, seperti
`company_profile`). Teks di tabel riwayat yang tidak cocok bagian mana pun
tetap tampil apa adanya.

**Ikut naik**: `CURRENT_SCHEMA_VERSION`/`CLIENT_SCHEMA_VERSION` 68 (Desktop
dan Mobile); sentinel `-2044` di INSERT, pemeriksa `ensure_schema_current`,
dan daftar `DELETE … version IN` di tes sentinel yang ada;
`REQUIRED_TABLE_COUNT` 104 → **116** dan 12 nama baru di
`isDatabaseSchemaReady`; `schema-consistency.test.ts`; daftar versi
`rbac-migration.test.ts`; `SNAPSHOT_TABLES`/`SNAPSHOT_SOURCES` 70 → **76**.
Keenam tabel tersinkron masuk `CLOUD_MIRRORED_TABLES` (dibuang
`reset_cloud_linked_data` saat pindah database); kedua belas tabel masuk
`PROMOTION_PLAN` (lapisan 1, tanpa ketergantungan FK). Perangkat v67 berhenti
sinkron begitu cloud v68.

### 19.4 Hak akses

**Izin baru fase ini (9)**, dari §15.1:

| Izin | Sensitif | Rahasia (Q-33) | Admin bawaan | Yayasan | Kepala Sekolah | Kepegawaian |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| `hr.org.manage` | | | ya | ya | | ya |
| `hr.contract.manage` | | | ya | ya | | ya |
| `hr.duty.manage` | | | ya | ya | ya | ya |
| `hr.personal.view` / `.manage` | | ya | **tidak** | | | ya |
| `hr.finance.view` | | ya | **tidak** | | | ya |
| `hr.finance.manage` | ya | ya | tidak | | | ya |
| `hr.document.view` / `.manage` | | ya | **tidak** | | | ya |

- `hr.finance.manage` masuk `SENSITIVE_MUTATION_PERMISSIONS` dan
  `ADMIN_DEFAULT_EXCLUDED_PERMISSIONS`. Daftar baru `CONFIDENTIAL_PERMISSIONS`
  di `catalog.ts` dan cerminnya di Rust dikecualikan dari paket Admin tanpa
  menjadi sensitif (pola perusahaan Q-42).
- **Role bawaan baru (Q-34)**: `yayasan`, `kepala-sekolah`, `kepegawaian`,
  diseed lewat `role_key` tanpa id eksplisit (id 1–4 sudah dipakai), di Rust
  dan `SYSTEM_ROLE_KEYS`/`DEFAULT_ROLE_PERMISSIONS`. Paket dasar ketiganya:
  `home.view`, `employees.view`, `teachers.view`; Kepegawaian juga
  `employees.manage`, `teachers.manage`. `kepala-tu` dan `guru-piket` lahir di
  Fase 2 bersama izin pengajuan.
- **Area baru `kepegawaian`** = `employees.view` **atau** `teachers.view`
  (cabang khusus di `canAccessArea`, pola `operational`). Setiap tab memeriksa
  izinnya sendiri; backend memeriksa ulang dari sesi.
- **Pemeriksaan `DEFAULT_ROLE_PERMISSIONS`**: tidak ada halaman lama yang
  mendapat penjaga baru. Halaman Karyawan, Guru, Operator, dan Payroll tetap
  dengan izinnya sekarang. Operator bawaan sudah memegang `employees.view` dan
  `teachers.view` (`catalog.ts:573`, `:578`), jadi ia bisa membuka daftar
  `/kepegawaian` (data yang sama dengan halaman Karyawan dan Guru yang sudah
  ia lihat). Yang **berkurang**: role buatan sendiri yang punya
  `employees.manage` tanpa `hr.org.manage` tidak bisa lagi menulis nama
  divisi baru (hanya memilih bagian yang ada); dan pemegang `teachers.manage`
  tanpa `hr.contract.manage` tidak bisa mengubah status guru yang sudah
  berkontrak. Admin bawaan tidak terdampak.

### 19.5 Command, rute, gateway, dan layar

**Rust**: modul baru `desktop/hris.rs` (aturan murni + SQL kembar + penulisan
lokal; masuk `filesToSync`, `pub mod` di kedua `mod.rs`) dan
`desktop/hris_cloud.rs` (command cloud-only lewat `TursoClient`; juga di
`filesToSync`). Command baru (29), semuanya terdaftar di kedua `lib.rs`,
`build.rs`, `capabilities/default.json`, dan `permissions/autogenerated`:

| Kelompok | Command | Izin |
| :-- | :-- | :-- |
| Organisasi (6) | `desktop_hr_org` (master + nama lama + tanda + teks tanpa master + angka kontrak) | `employees.view`/`teachers.view` |
| | `desktop_hr_section_save`, `desktop_hr_section_merge`, `desktop_hr_position_save`, `desktop_hr_settings_save` | `hr.org.manage` |
| | `desktop_hr_document_types_save` (cloud) | `hr.org.manage` |
| Tugas (4) | `desktop_hr_duty_types_save` | `hr.org.manage` |
| | `desktop_hr_duties` | `employees.view`/`teachers.view` |
| | `desktop_hr_duty_save`, `desktop_hr_duty_cancel` | `hr.duty.manage` |
| Kontrak (3) | `desktop_hr_contracts` | `employees.view`/`teachers.view` |
| | `desktop_hr_contract_create`, `desktop_hr_contract_cancel` | `hr.contract.manage` |
| Profil dan pendidik (7, cloud) | `desktop_hr_profile` | salah satu `hr.personal.view`/`hr.finance.view`/`teachers.view`, per kelompok |
| | `desktop_hr_profile_save_personal` / `_finance` | `hr.personal.manage` / `hr.finance.manage` |
| | `desktop_hr_education_save`, `desktop_hr_education_delete`, `desktop_hr_certification_save`, `desktop_hr_certification_delete` | `teachers.manage` |
| Dokumen (6, cloud) | `desktop_hr_documents`, `desktop_hr_document_file` | `hr.document.view` |
| | `desktop_hr_document_save`, `desktop_hr_document_delete`, `desktop_hr_document_file_add`, `desktop_hr_document_file_delete` | `hr.document.manage` |
| Pajak (2) | `desktop_get_pajak_status_tidak_tetap` | `payroll.view` |
| | `desktop_save_pajak_status_tidak_tetap` | `payroll.config.manage` |
| Laporan (1, cloud) | `desktop_hr_ptk_report` | `teachers.view` |

Command pembaca kunci pajak dibutuhkan karena kartu konstanta hari ini hanya
menampilkan bawaan dari JSON (`KonstantaPajak.tsx:15`, `:31`); nilai
tersimpan hanya dibaca rekap gaji (`payroll-recap.ts:441`,
`payroll/commands.rs:2692`). Command cloud memberi pesan "butuh koneksi ke
database" pada `TURSO_NOT_CONFIGURED` atau jaringan gagal.

**Sesudahnya: Desktop 365 → 394, Mobile 371 → 400.**

Berubah tanpa command baru: `create/update/import_employees`, `save_teacher`
(kolom organisasi, TMT guru, kartu ID), simpan operator (`id_karyawan`),
pratinjau dan pembekuan gaji (`STATUS_KINI_SQL`, `TUGAS_BERLAKU_SQL`), simpan
komponen (`TUGAS:`), handler cloud §19.3.

**Web**: `validations/hris.ts` + `services/hris.ts` (kembar Rust, vektor
`hris.vektor.json`), rute `POST /api/kepegawaian/<…>` (Zod `.strict()`,
`assertSameOriginMutation`, `requireWebPermission`, tanpa `GET`): `org/query`,
`section`, `section/merge`, `position`, `duty-type`, `settings`,
`document-types`, `duties/query`, `duties`, `duties/cancel`,
`contracts/query`, `contracts`, `contracts/cancel`, `profile/query`,
`profile/personal`, `profile/finance`, `education`, `certification`,
`documents/query`, `documents`, `documents/file/query`, `documents/file`,
`ptk/query` (hapus lewat `DELETE` pada rute yang sama); plus
`POST /api/payroll/config/pajak-status/query` dan
`POST /api/payroll/config/pajak-status`. Body unggah berkas maks 1,6 MB.
Gateway `gateways/hris.ts`, satu fungsi per command, dua cabang.

**Layar**:

1. **`/kepegawaian`** (Web/Desktop; tidak di menu Mobile): tab Daftar (guru +
   tendik, saring unit/bagian/jabatan/status), Struktur (daftar berjenjang
   menurut atasan, dan per unit/bagian), Organisasi (bagian dengan nama lama
   dan jumlah anggota, ganti nama dengan peringatan, gabungkan, jabatan, jenis
   tugas, jenis dokumen, teks tanpa master + Jadikan bagian, angka kontrak;
   aktif/nonaktif tanpa hapus), Tugas Tambahan (per tahun ajaran, wali kelas
   dari rombel ditampilkan baca-saja), Laporan PTK. Rincian pegawai bertab
   Kerja, Pribadi, Keuangan, Pendidik, Kontrak, Dokumen; tab cloud-only
   menampilkan pesan saat luring.
2. **Form Karyawan dan Guru** (Web/Desktop dan Mobile): komponen bersama
   `components/personnel/IsianOrganisasi.tsx` (di `filesToCopy`): `PilihCari`
   bagian, jabatan, atasan; TMT; status guru terkunci bila berkontrak.
   Saringan divisi halaman Karyawan dari `hr_bagian`.
3. **Form operator** (Web/Desktop dan Mobile): `PilihCari` Personil.
4. **Form komponen gaji** (Web/Desktop dan Mobile): kelompok `TUGAS:`;
   `DIVISI:` dari `hr_bagian`; `STATUS:` dari daftar K-1 (temuan 6).
5. **Kartu konstanta pajak** (`KonstantaPajak.tsx`, sudah di `filesToCopy`):
   daftar status tidak tetap bisa dicentang bagi `payroll.config.manage`.
6. Menu sidebar "Kepegawaian" (Web/Desktop).

Halaman Mobile (`mobile/src/app/karyawan`, `guru`, `operators`,
`payroll/config`) disunting tangan.

### 19.6 Tidak dikerjakan di fase ini

- Pengajuan izin/cuti, JP terdampak, guru pengganti (Fase 2), termasuk
  pemeriksaan cakupan unit (A-5) dan `id_karyawan` di sesi.
- Role `kepala-tu` dan `guru-piket`.
- Rekap beban mengajar dan cetak SK (Fase 3); pencocokan otomatis mapel ↔
  bidang sertifikat.
- Pengingat kontrak habis, KGB, pensiun, dokumen kedaluwarsa, Telegram
  `kepegawaian` (Fase 6). Kolom `tanggal_kedaluwarsa` sudah ada.
- Riwayat jabatan/mutasi bagian per orang (hanya keadaan kini + riwayat nama
  bagian).
- Bagan struktur bergambar; HRIS lengkap di Mobile.
- Angka kontrak per unit; kontrak otomatis dari data lama (Q-27).
- Nama bagian kini di laporan dan `mutasi_json` inventaris (sama dengan
  perusahaan §16.9).
- Sinkron Dapodik/Info GTK.

### 19.7 Langkah

Fase 1 terlalu besar untuk satu sesi (12 tabel, 29 command, ±25 rute, lima
layar). **Dipecah menjadi tiga sub-fase**; rilis hanya sesudah 1c, karena
ketiganya berbagi v68. Setiap sub-fase berakhir dengan typecheck, Biome, dan
tes per berkas hijau, dan bisa dihentikan tanpa merusak data.

**1a — Skema, organisasi, tautan akun** (batas: sesudah langkah 6, aplikasi
sudah memakai bagian/jabatan; kontrak, tugas, dan cloud-only baru berupa
tabel kosong):

| # | Langkah | Gerbang |
| :-- | :-- | :-- |
| 1 | **Skema v68 penuh**: 6 tabel tersinkron + 3 kolom `master_data` di keempat lapis, 6 tabel cloud-only + `master_operator.id_karyawan`, migrasi teks → master, seed jenis tugas dan dokumen, sentinel `-2044`, angka §19.3, promosi, purge, klasifikasi | `audit:schema`; `cargo test sentinel_2043` Desktop dan Mobile (tes baru: migrasi mengecualikan siswa, id deterministik sama dengan Web, aman diulang); tes migrasi Web `schema-consistency.test.ts` |
| 2 | **Aturan kembar** `hris.rs` ↔ `validations/hris.ts`: `kunci_nama`, validasi master, `periksa_atasan`, SQL `MIGRASI_ORGANISASI_SQL`, penulisan ulang ganti nama/gabung, pemetaan teks lama | `bun test src/lib/validations/hris.test.ts`; `cargo test hris` kedua workspace; teks SQL diperiksa harfiah |
| 3 | **Sinkronisasi organisasi**: rute `hr-section/save|merge`, `hr-position/save`; handler cloud; perubahan handler `employee/*` (kunci baru, pemetaan, `tanggal_daftar`) | `audit:contract`; tes cloud `TursoClient::local_file`: event lama tanpa `id_bagian`, ganti nama menulis ulang riwayat + `DIVISI:` + whitelist |
| 4 | **RBAC**: 9 izin, `CONFIDENTIAL_PERMISSIONS`, 3 role, area `kepegawaian` | `web-rbac-boundary.test.ts`, `rbac-migration.test.ts`; `cargo test` seed role |
| 5 | **Karyawan dan guru**: simpan Rust/Web dengan `id_*`, impor Excel, `save_teacher`, `IsianOrganisasi` di form Web dan Mobile; operator `id_karyawan` | tes impor dan `employee`/`personnel` yang ada tetap lulus; tes baru satu akun aktif per personil |
| 6 | **Layar** `/kepegawaian` tab Daftar, Struktur, Organisasi | typecheck + Biome; `audit:page-guard`, `audit:a11y`, `audit:ui-guard` |

**1b — Kontrak, status, tugas tambahan, gaji** (batas: sesudah langkah 10,
status pajak dan `TUGAS:` sudah dipakai gaji):

| # | Langkah | Gerbang |
| :-- | :-- | :-- |
| 7 | Kontrak: validasi, `status_kerja`, tanda, `STATUS_KINI_SQL`, cermin `guru_data`; rute `hr-contract/create`; handler `teacher/*` | vektor kembar; `cargo test hris::kontrak`; tes cloud: perangkat lama menyimpan guru berkontrak → status tetap dari kontrak |
| 8 | Tugas tambahan: jenis, simpan/batal, wali kelas dari rombel, `TUGAS_BERLAKU_SQL`; rute `hr-duty-type/save`, `hr-duty/save|cancel` | vektor kembar; `audit:contract`, `audit:sql` |
| 9 | Gaji: `STATUS_KINI_SQL` + `TUGAS_BERLAKU_SQL` di pratinjau dan pembekuan Rust dan `computePayrollRecap`; `TUGAS:` di `applies_to_subject` ↔ `appliesToSubject` dan validasi komponen; kunci `pajak_status_tidak_tetap` bisa disimpan | `bun test` `payroll-policy`, `payroll-pajak`, `payroll-calculator`, `payroll-rapel`; `cargo test payroll::` dan `payroll_admin::`; tes baru: tendik PTT tidak tetap, `TUGAS:tgs-wali-kelas` dari rombel |
| 10 | Layar: tab Kontrak dan Tugas Tambahan, form komponen (Web dan Mobile), kartu konstanta pajak | typecheck + Biome; `audit:a11y` |

**1c — Data cloud-only dan laporan** (batas: Fase 1 lengkap):

| # | Langkah | Gerbang |
| :-- | :-- | :-- |
| 11 | `hris_cloud.rs` ↔ `services/hris.ts`: profil, pendidikan, sertifikasi, dokumen, berkas (tanda tangan bita, ukuran) | vektor kembar berkas dan pengenal; tes cloud `TursoClient::local_file`: kelompok yang dikembalikan sesuai izin |
| 12 | Rute dan gateway cloud-only; pesan luring | `web-rbac-boundary.test.ts`; `audit:contract` |
| 13 | Layar rincian Pribadi, Keuangan, Pendidik, Dokumen; Laporan PTK | typecheck + Biome; `audit:a11y`, `audit:list-bound` |
| 14 | `sync-rust-modules`, `sync-frontend-lib`, paragraf ringkas `CLAUDE.md`, catatan "Sudah dibangun" | `audit:contract`, `audit:schema`; `bun run check` penuh oleh pemilik |

### 19.8 Pertanyaan untuk pemilik (Fase 1)

| No | Pertanyaan | Usulan | Alasan |
| :-- | :-- | :-- | :-- |
| Q-16 | Setujui **A-1** (bagian dan jabatan menjadi master; teks `divisi`/`jabatan_status` tetap ada dan diisi nama sekarang)? | Ya | Scanner, kartu ID, payroll, dan semua kueri lama tetap jalan tanpa diubah |
| Q-17 | Ganti nama bagian: (a) tulis ulang riwayat anggota (`id_card`, `absensi_harian`, `log_scan`, `backup_karyawan`, `koreksi_admin`) dan konfigurasi kini (`DIVISI:` komponen gaji, whitelist libur), seperti ganti identitas satu orang hari ini; (b) pola perusahaan: riwayat tidak ditulis ulang, laporan memetakan lewat `DIVISI_KINI_SQL` | (a) | Aplikasi ini sudah menulis ulang riwayat setiap kali satu orang diubah (temuan "sudah ada"), jadi (a) tidak menambah perilaku baru; (b) butuh potongan SQL di setiap laporan dan pencocok di gaji dan whitelist, dan tanpa itu tunjangan per divisi berhenti diam-diam (temuan 9). Risiko (a): event luring yang telat bisa membawa nama lama ke riwayat; tampil apa adanya |
| Q-18 | Bagian dan jabatan berlaku di semua unit (global), atau milik satu unit? | Global | Sama dengan perusahaan Q-29; "TU SMP" = unit + bagian. Per unit menggandakan master setiap unit |
| Q-19 | Bagian dan jabatan guru: (a) dipilih di form guru, bawaan "Tenaga Pengajar"/"Guru"; (b) tetap terkunci | (a) | Guru Mapel vs Guru Kelas vs Guru BK adalah jabatan; hari ini tidak bisa dibedakan |
| Q-20 | TMT: (a) pakai `tanggal_mulai_aktif` yang ada, diberi label TMT dan ditambahkan ke form guru; (b) kolom baru `master_data.tmt` | (a) | Kolomnya sudah ada, tersinkron, dan sudah ditulis handler cloud; tidak dipakai aturan lain. Nilai lama berisi tanggal input ke aplikasi, perlu dikoreksi TU di kedua pilihan |
| Q-21 | Impor Excel Karyawan dengan teks divisi/jabatan yang belum ada: (a) tolak barisnya dengan pesan; (b) buat bagian baru otomatis | (a) | Sama dengan perusahaan Q-44; (b) melahirkan kembaran salah ketik lagi |
| Q-22 | Setujui **A-2** (`master_operator.id_karyawan` cloud-only, satu personil satu akun aktif)? Sesi baru membacanya di Fase 2 | Ya | Fase 2 butuh "tidak untuk diri sendiri" dan cakupan unit |
| Q-23 | Setujui **A-5** (pemutus dibatasi unit, `hr.scope.all` lintas unit) untuk dibangun di Fase 2 sesuai §15.2? | Ya | Fase 1 tidak punya aksi berlingkup unit; persetujuan sekarang supaya A-2 dirancang untuknya |
| Q-24 | Nilai status kontrak = GTY, PTY, GTT, PTT, Honorer, PNS, PPPK (PNS dan PPPK dua nilai). GTY/GTT hanya untuk guru, PTY/PTT hanya untuk tendik? | Ya, ditolak di perangkat dan Web; cloud tidak menolak | Sesuai K-1; G/P memang membedakan guru dan tendik |
| Q-25 | Status untuk gaji: dari kontrak untuk guru **dan tendik** (jatuh ke `guru_data` bila belum ada kontrak)? | Ya | Tanpa ini PTT/Honorer tendik tetap dihitung pegawai tetap, dan `STATUS:` tidak pernah berlaku bagi tendik (temuan 8) |
| Q-26 | Nasib kunci `pajak_status_tidak_tetap`: (a) tetap, `status_pph` tidak berubah, masukannya dari kontrak, kunci diberi layar centang di halaman Pajak (`payroll.config.manage`); (b) kolom `status_pajak` per kontrak (tetap/tidak tetap dipilih per orang); (c) hapus kunci, peta tetap (GTY/PTY/PNS/PPPK tetap, sisanya tidak) | (a) | Perubahan terkecil yang menutup Fase 0. PMK 168 menganggap pegawai kontrak penuh waktu yang dibayar bulanan sebagai pegawai tetap, jadi GTT tidak selalu "tidak tetap"; (a) membiarkan sekolah memutuskan per status, (b) per orang bila nanti dibutuhkan |
| Q-27 | Status lama `Kontrak` (dari Mobile) dan status tanpa kontrak: (a) tidak dimigrasi, berlaku sampai kontrak pertama; `Kontrak` ditambahkan ke bawaan tidak tetap; (b) diubah menjadi GTT | (a) | Bawaan Fase 0 menganggap guru `Kontrak` pegawai tetap, padahal artinya sama dengan GTT (temuan 7). Mengubah data menjadi GTT menyentuh `guru_data` semua perangkat; menambah bawaan cukup satu baris JSON |
| Q-28 | Angka hukum kontrak (percobaan 3 bulan, GTT/PTT berturut-turut 60 bulan) sebagai pengaturan sekolah dan tanda, bukan penolakan? | Ya | Sama dengan perusahaan Q-46; angka dicek konsultan klien |
| Q-29 | Sasaran tunjangan tugas: (a) `TUGAS:<id jenis>`; (b) `TUGAS:<nama jenis>` | (a) | Id tidak berubah saat jenis diganti nama; label tetap menampilkan nama |
| Q-30 | Jenis tugas bawaan dan ekuivalen JP §19.3 di-seed di cloud dengan id tetap (angka Permendikbud 15/2018 dicek ulang; Bendahara BOS 0)? | Ya | Tunjangan `TUGAS:` butuh id yang sama di semua sekolah; ekuivalen JP baru dipakai Fase 3 |
| Q-31 | Riwayat pendidikan, sertifikasi, dan dokumen: (a) cloud-only seperti `hr_profil` dan `siswa_berkas`; (b) pendidikan dan sertifikasi tersinkron, dokumen cloud-only | (a) | Tidak berguna di terminal scanner; pindaian KTP/KK serahasia NIK; tanpa outbox dan tanpa empat lapis. Kekurangannya: diisi dan dibaca hanya saat terhubung, dan pemeriksaan "mapel ≠ bidang sertifikat" Fase 3 juga butuh koneksi |
| Q-32 | Batas berkas dokumen: (a) 1 MB per berkas, 5 per dokumen; (b) 200 KB seperti berkas siswa | (a) | Pindaian ijazah dan SK berhalaman banyak jarang muat 200 KB |
| Q-33 | Admin bawaan dan data rahasia: pribadi, keuangan, dan dokumen tidak ikut paket Admin (`CONFIDENTIAL_PERMISSIONS`)? | Ya | Paket Admin memuat semua izin tidak sensitif (temuan 11); sama dengan perusahaan Q-42 |
| Q-34 | Role bawaan: Yayasan, Kepala Sekolah, Kepegawaian sekarang; Kepala TU dan Guru Piket di Fase 2? | Ya | Kepala TU dan Guru Piket belum punya izin apa pun di Fase 1 |
| Q-35 | Letak layar: halaman baru `/kepegawaian` (Web/Desktop) dengan tab Organisasi, bukan di Pengaturan; Mobile hanya form karyawan, guru, operator, dan komponen gaji? | Ya | Pengaturan dijaga `branding.manage` (temuan 10); HRIS Mobile lengkap di Fase 8 |
| Q-36 | Linieritas di Laporan PTK: tanda manual per riwayat pendidikan, ditampilkan berdampingan dengan bidang sertifikat dan mapel yang diajar, tanpa pencocokan otomatis? | Ya | Nama prodi dan mapel tidak bisa dicocokkan andal sebagai teks; pencocokan dirancang di Fase 3 bila perlu |
| Q-37 | Tambah `nama_ibu_kandung` di data pribadi? | Ya | Wajib di data PTK Dapodik, dan Laporan PTK dipakai memeriksa data Dapodik |
| Q-38 | Tombol "Gabungkan bagian" (pindah semua anggota, nama lama dicadangkan ke bagian tujuan, bagian asal dinonaktifkan)? | Ya | Migrasi teks pasti melahirkan kembaran salah ketik; tanpa tombol ini TU memindahkan orang satu per satu |
| Q-39 | Fase 1 dipecah 1a/1b/1c (§19.7), satu skema v68 ditulis penuh di langkah 1, dirilis sesudah 1c? | Ya | Satu versi hanya dibangun sekali per database; tiga versi berarti tiga kali semua perangkat wajib diperbarui |

### 19.9 Penanda yang ditinjau pemilik

Disetujui bersama jawaban §19.10.

**Yang dirasakan pengguna:**

- Divisi di form Karyawan tidak lagi diketik bebas: pilih bagian dari
  Kepegawaian → Organisasi. Teks lama otomatis menjadi bagian; kembaran salah
  ketik perlu digabungkan TU.
- Guru bisa diberi bagian dan jabatan sendiri; kartu ID guru mengikuti
  bagiannya.
- Ganti nama bagian mengubah nama itu di riwayat absensi, log scan, koreksi,
  backup, kartu ID, tunjangan `DIVISI:`, dan whitelist libur (Q-17 (a)).
- Status kepegawaian guru terkunci begitu guru punya kontrak; diubah lewat
  kontrak baru.
- Label "Tanggal Mulai Aktif" menjadi "TMT" (Q-20).

**Risiko data dan uang:**

- **Tendik yang dicatatkan kontrak PTT/Honorer berubah pajaknya**: dihitung
  tidak tetap (tanpa rekonsiliasi Desember), dan mulai cocok dengan tunjangan
  `STATUS:` (Q-25).
- Guru berstatus `Kontrak` menjadi tidak tetap untuk pajak bila Q-27 (a).
- Mengubah centang status tidak tetap memengaruhi semua run berikutnya; run
  lama tidak dihitung ulang (§6.4).
- Kontrak berawal di masa depan langsung mengubah status yang tampil di
  daftar guru, sebelum tanggalnya.
- Data pribadi, keuangan, pendidik, dan dokumen hanya ada di cloud: hilang
  bersama database cloud, tidak ada di cadangan perangkat, dan ikut promosi
  dari Mode Database Lokal.
- PNS/PPPK yang dipekerjakan (gaji pokok dari pemerintah, honor dari yayasan)
  kini dianggap pegawai tetap oleh bawaan, sehingga PTKP-nya dihitung lagi
  di potongan sekolah. **Wajib dicek konsultan pajak** sebelum dicentang atau
  dibiarkan.
- Angka ekuivalen JP, batas kontrak, dan panjang NRG wajib dicek ulang.

**Perangkat:**

- Naik ke v68: **semua perangkat Desktop dan Mobile wajib diperbarui**;
  perangkat v67 berhenti sinkron begitu cloud v68.
- Migrasi organisasi berjalan sekali di cloud; perangkat mendapat bagian dan
  jabatan lewat tarikan berikutnya, jadi form karyawan di perangkat yang
  belum menarik menampilkan pilihan kosong sampai sinkron.

### 19.10 Jawaban Fase 1 (14 Nov 2026)

- **Q-16 sampai Q-39**: semuanya sesuai usulan §19.8, dan penanda §19.9
  disetujui. Artinya: A-1, A-2, A-5 disetujui (A-5 dibangun di Fase 2);
  ganti nama bagian menulis ulang riwayat anggota dan konfigurasi kini
  (`DIVISI:`, whitelist libur); bagian dan jabatan global; bagian dan jabatan
  guru bisa dipilih (bawaan "Tenaga Pengajar"/"Guru"); TMT =
  `tanggal_mulai_aktif`; impor dengan divisi tak dikenal ditolak; status
  kontrak GTY/PTY/GTT/PTT/Honorer/PNS/PPPK, G untuk guru dan P untuk tendik;
  status gaji dan pajak dari kontrak untuk guru dan tendik; kunci
  `pajak_status_tidak_tetap` tetap dengan layar centang (`status_pph` tidak
  berubah); `Kontrak` lama tidak dimigrasi dan masuk bawaan tidak tetap;
  angka kontrak sebagai pengaturan dan tanda; `TUGAS:<id jenis>`; jenis tugas
  di-seed di cloud; pendidikan, sertifikasi, dan dokumen cloud-only; berkas
  1 MB × 5; data rahasia di luar paket Admin; role Yayasan, Kepala Sekolah,
  Kepegawaian sekarang; halaman `/kepegawaian`; linieritas manual;
  `nama_ibu_kandung`; tombol Gabungkan bagian; sub-fase 1a/1b/1c dengan satu
  v68.
- Status PNS/PPPK yang dipekerjakan tetap menunggu konsultan pajak (§19.9);
  bawaannya tidak diubah di fase ini.
- Eksekusi per sub-fase §19.7 di sesi terpisah, mulai 1a.

### 19.11 Sudah dibangun: sub-fase 1a (14 Nov 2026)

Langkah 1–6 §19.7 dibangun: skema v68 penuh (sentinel `-2044` `hris-org-v1`,
6 tabel tersinkron + 3 kolom `master_data` di keempat lapis, 6 tabel
cloud-only + `master_operator.id_karyawan`, migrasi teks → master, seed jenis
tugas dan dokumen), `desktop/hris.rs` ↔ `validations/hris.ts` +
`services/hris.ts`, rute sync `hr-section/save|merge` dan `hr-position/save`,
9 izin + `CONFIDENTIAL_PERMISSIONS` + role Yayasan/Kepala Sekolah/Kepegawaian
+ area `kepegawaian`, organisasi di form Karyawan/Guru/Operator (Web dan
Mobile), dan halaman `/kepegawaian` tab Daftar, Struktur, Organisasi.
Command baru 4 (`desktop_hr_org`, `desktop_hr_section_save`,
`desktop_hr_section_merge`, `desktop_hr_position_save`): Desktop 365 → 369,
Mobile 371 → 375. Gerbang (oleh Claude, per berkas/per nama; `bun run check`
belum):

| # | Gerbang | Hasil |
| :-- | :-- | :-- |
| 1 | `audit:schema`; `cargo test sentinel_20` Desktop (9 tes sentinel, termasuk baru `sentinel_2043_memicu_organisasi_v68`); `schema-consistency.test.ts`, `rbac-migration.test.ts` | Lulus. Migrasi hanya pegawai (siswa tidak), id `bag-`/`jab-` + hex teks sama di Web dan Rust, sekali per database (dijaga versi 68) |
| 2 | `bun test validations/hris.test.ts` (5); `cargo test hris` Desktop (7) dan Mobile (7, crate Mobile terkompilasi) | Lulus. Vektor `hris.vektor.json`; 16 konstanta SQL dicek harfiah ke kedua `hris.rs` |
| 3 | `audit:contract`; tes cloud `sentinel_2043…` lewat `TursoClient::local_file` + `apply_event_to_turso` | Lulus: event `employee/update` lama tanpa `id_bagian` dipetakan lewat nama, `tanggal_daftar` kini sampai cloud, ganti nama menulis ulang absensi + `DIVISI:` + whitelist, siswa tidak tersentuh |
| 4 | `rbac-migration.test.ts` (10, termasuk paket role HRIS Rust = TS), `web-rbac-boundary.test.ts` (7) | Lulus |
| 5 | `services/hris.test.ts` (4: migrasi Web, ganti nama, Jadikan bagian, atasan + satu akun aktif per personil); `cargo test operational::tests` (9); tes personnel/operator/stabilization yang ada | Lulus |
| 6 | `tsc --noEmit` dan Biome kedua workspace; `audit:page-guard`, `audit:a11y`, `audit:ui-guard`, `audit:sql` | Lulus |

Penyimpangan dan catatan, untuk ditinjau:

- **`audit:list-bound` pada `RUN_TAHUN_SQL` (Fase 0) diperbaiki**: penanda
  `-- batas:` ditambahkan di `payroll/pajak.rs` dan `validations/pajak.ts`
  (teks tetap kembar). `pajak.test.ts` 7 dan `payroll-pajak.test.ts` 4 lulus,
  `cargo test tests_pajak` 3 lulus.
- **`PROMOTION_PLAN` tidak ditambah.** Daftar itu hanya dipakai tesnya
  sendiri dan tidak memuat satu pun tabel sejak era payroll; menambah 12
  tabel di sana tidak mengubah perilaku apa pun.
- **Migrasi organisasi dijaga baris versi 68**, bukan hanya `INSERT OR
  IGNORE`: diulang sesudah ganti nama, langkah 1 melahirkan bagian kembar dari
  teks nama baru.
- **"Jadikan bagian"**: statement pertama `TULIS_ULANG_BAGIAN_SQL` menautkan
  pegawai tanpa bagian yang teks divisinya cocok dengan nama bagian itu (lokal,
  handler cloud, Web). Tanpa itu, bagian baru dari teks lama tidak punya
  anggota.
- **Id bagian/jabatan baru acak** (`bag-`/`jab-` + 24 hex), bukan dari nama:
  nama lama bagian yang diganti nama tidak boleh menghasilkan id bagian itu
  lagi. Kembaran dua perangkat luring tampil sebagai tanda `nama_ganda`.
- **Kosong di perangkat = `''`, NULL = tidak dibawa.** Snapshot
  `employee/update` membawa `''` sebagai "dikosongkan"; cloud menyimpan NULL,
  tarikan berikutnya menormalkan perangkat.
- **Bagian wajib hanya untuk pegawai baru dari form** (kunci `id_bagian`
  dibawa form v68). Edit tanpa bagian mempertahankan teks lama; pemanggil
  lain (`create_employee` dari tes/alur lain, impor guru) tetap memakai teks.
- **Impor Excel Karyawan**: divisi dan jabatan dipetakan ke master (divisi
  termasuk nama lama); yang tidak dikenal menolak barisnya. Jabatan kosong
  tetap "Staff" tanpa master, seperti impor lama.
- **Suntingan massal Karyawan** (Web dan Mobile) kini memilih Bagian/Jabatan
  dari master, bukan teks bebas. Saringan divisi halaman Karyawan tetap dari
  teks (sama dengan nama bagian setelah migrasi).
- **Menu Mobile menyembunyikan Kepegawaian** (`navigation-items.ts` disalin
  ke Mobile; `menu/page.tsx` memfilternya, Q-35).
- `desktop_hr_settings_save`, jenis tugas, dan jenis dokumen (§19.5
  kelompok Organisasi) dikerjakan di 1b/1c bersama pemakainya.

### 19.12 Sudah dibangun: sub-fase 1b (14 Nov 2026)

Langkah 7–10 §19.7 dibangun di skema v68 yang sama (tanpa versi baru):
aturan kembar kontrak dan tugas di `desktop/hris.rs` ↔ `validations/hris.ts`
+ `services/hris.ts` (vektor `hris.vektor.json`, 16 konstanta SQL baru dicek
harfiah), rute sync `hr-contract/create`, `hr-duty-type/save`,
`hr-duty/save|cancel`, cermin status kontrak di `save_teacher`/`saveTeacher`
dan handler cloud `teacher/*`, `STATUS_KINI_SQL` + `TUGAS_BERLAKU_SQL` di
rekap gaji Rust dan `computePayrollRecap`, sasaran `TUGAS:`, kunci
`pajak_status_tidak_tetap` bisa disimpan (`PILIHAN_STATUS_TIDAK_TETAP`), tab
Kontrak dan Tugas Tambahan, jenis tugas dan angka kontrak di tab Organisasi,
kunci status di form guru (Web dan Mobile), kelompok "Tugas tambahan" di form
komponen (Web dan Mobile), dan centang status di kartu konstanta pajak.
Command baru 10 (`desktop_hr_settings_save`, `desktop_hr_duty_types_save`,
`desktop_hr_duties`, `desktop_hr_duty_save`, `desktop_hr_duty_cancel`,
`desktop_hr_contracts`, `desktop_hr_contract_create`,
`desktop_hr_contract_cancel`, `desktop_get_pajak_status_tidak_tetap`,
`desktop_save_pajak_status_tidak_tetap`): Desktop 369 → 379, Mobile 375 →
385. Rute Web baru 10 (`/api/kepegawaian/contracts|contracts/query|
contracts/cancel|duties|duties/query|duties/cancel|duty-type|settings`,
`/api/payroll/config/pajak-status` + `/query`).

Keputusan 1b (semua sesuai rekomendasi, 14 Nov 2026):

- **A.** Membatalkan kontrak sah terakhir tidak mengubah `guru_data`; isian
  status di form guru terbuka lagi (`CERMIN_STATUS_SQL` hanya berjalan bila
  masih ada kontrak sah).
- **B.** Kontrak pertama yang berawal di masa depan langsung dicerminkan;
  untuk periode sebelum mulainya gaji jatuh ke `guru_data` (sudah status
  baru). Form kontrak memperingatkan dan menyarankan mencatat kontrak yang
  sedang berjalan lebih dulu.
- **C.** Kontrak yang lewat tanggal selesai tanpa kontrak baru tetap menjadi
  status gaji; layar menandainya "Berakhir".
- **D.** Pilihan centang = K-1 + `Kontrak`; nilai lain ditolak saat simpan.
- **E.** Angka kontrak: percobaan 1–12 bulan, PKWT 12–120 bulan, kosong =
  bawaan 3/60.
- **F.** Simpan komponen `TUGAS:<id>` menolak id jenis yang tidak ada
  (perangkat dan Web); cloud tidak menolak.
- **G.** `Kontrak` masuk bawaan tidak tetap (`pajak-bawaan.json`, Q-27).
- **H.** Tes cloud memakai statement handler di SQLite memori (pola tes 1a).

Gerbang (oleh Claude, per berkas/per nama; `bun run check` belum):

| # | Gerbang | Hasil |
| :-- | :-- | :-- |
| 7–8 | `cargo test hris` Desktop (11) dan Mobile (11, crate Mobile terkompilasi dengan 10 command baru;  termasuk baru `hris_vektor_kontrak`, `hris_vektor_tugas`, `hris_kontrak_status_kini_dan_cermin`, `hris_tugas_berlaku_dan_batal`); `bun test validations/hris.test.ts` (9), `services/hris.test.ts` (4) | Lulus. Cermin tidak bergantung urutan tiba; perangkat lama yang menyimpan guru berkontrak tidak mengubah status; pembatalan ganda satu baris; tendik PTT berstatus PTT; wali kelas dari rombel per semester; baris wali kelas tidak memberi tugas sendiri; batal ganda mempertahankan alasan pertama |
| 9 | `cargo test payroll::` Desktop (28); `bun test` `pajak.test.ts` (7), `payroll-calculator.test.ts` (17), `payroll-pajak.test.ts` (4, timeout 30 s seperti `run-tests.ts`) | Lulus. Vektor sasaran `TUGAS:` kembar; vektor `simpan_status` dan `Kontrak` bawaan tidak tetap |
| 10 | `tsc --noEmit` dan Biome kedua workspace; `audit:contract`, `audit:sql`, `audit:schema`, `audit:a11y`, `audit:page-guard`, `audit:ui-guard`, `audit:list-bound`, `audit:confirm`, `audit:dialog`, `audit:route-guard`, `audit:silent-catch` | Lulus |

Penyimpangan dan catatan, untuk ditinjau:

- **Alasan pembatalan kontrak disimpan di `catatan` baris `Pembatalan`**:
  `hr_kontrak` tidak punya kolom alasan, dan skema tidak dinaikkan.
- **Status tugas punya nilai keempat "Akan berlaku"** (mulai sesudah hari
  ini), selain Berlaku/Selesai/Dibatalkan.
- **Tugas non-wali kelas membuang `id_rombel`**; rombel hanya bermakna untuk
  wali kelas.
- **`DIVISI:` di form komponen tetap dari teks divisi personil**, belum dari
  `hr_bagian` (sama dengan saringan halaman Karyawan di 1a; nama bagian =
  teks divisi sesudah migrasi).
- **Label `STATUS:` menjadi "Berstatus X"** (bukan "Guru berstatus X"),
  karena status kini berlaku untuk tendik juga (Q-25).
- **Daftar jenis tugas di form komponen dibaca lewat `desktop_hr_org`**:
  pengguna payroll tanpa `employees.view`/`teachers.view` tidak melihat
  kelompok "Tugas tambahan"; komponen `TUGAS:` yang sudah ada tetap tampil
  lewat labelnya (id jenis).
- Mobile tetap tanpa tab Kepegawaian (Q-35); kontrak dan tugas dicatat di
  Web/Desktop.

### 19.13 Sudah dibangun: sub-fase 1c (14 Nov 2026)

Langkah 11–14 §19.7 dibangun di skema v68 yang sama (tanpa versi baru).
Modul baru `desktop/hris_cloud.rs` (di `filesToSync`, `pub mod` di kedua
`mod.rs`) ↔ `validations/hris.ts` + `services/hris.ts`: aturan murni kembar
(`nomor_identitas`, `validasi_pribadi`, `validasi_keuangan`,
`validasi_pendidikan`, `validasi_sertifikasi`, `validasi_dokumen`,
`urai_berkas_dokumen`, `kelompok_profil`, `boleh_baca_dokumen`) dengan vektor
baru di `hris.vektor.json` (`nomor_identitas`, `pribadi`, `keuangan`,
`pendidikan`, `sertifikasi`, `dokumen`, `berkas_dokumen`), dan 21 konstanta SQL
yang dicek harfiah ke kedua `hris_cloud.rs`. Semua tabelnya dibaca dan ditulis
lewat `TursoClient` (Desktop/Mobile) atau klien server (Web), tidak pernah ke
SQLite perangkat, snapshot, atau outbox. Tanpa database atau jaringan
(`TURSO_NOT_CONFIGURED`, `TURSO_NETWORK_ERROR`), command mengembalikan "Data
ini butuh koneksi ke database. Periksa jaringan, lalu coba lagi."

Command baru 15 (§19.5 kelompok Profil, Dokumen, Laporan, plus
`desktop_hr_document_types_save`), terdaftar di kedua `lib.rs`, `build.rs`,
`capabilities/default.json`, dan `permissions/autogenerated`: Desktop 379 →
394, Mobile 384 → 399. Angka Mobile 385 di §19.12 salah hitung: ikut
menghitung atribut `mobile_entry_point`; `audit:contract` dan `lib.rs` HEAD
sama-sama menunjukkan 384. Jadi angka akhir Fase 1 adalah Desktop 394, Mobile
399 (§19.5 menulis 400). Rute Web baru 11: `/api/kepegawaian/profile/query`,
`profile/personal`, `profile/finance`, `education` (POST + DELETE),
`certification` (POST + DELETE), `documents/query`, `documents` (POST +
DELETE), `documents/file/query`, `documents/file` (POST + DELETE, body maks
1,6 MB), `document-types`, `ptk/query`. Gateway di `gateways/hris.ts`
(`cloud()`: tanpa `kickDesktopSync`, karena tidak ada outbox).

Layar: tombol **Rincian** di tab Daftar membuka Modal bertab Kerja, Pribadi,
Keuangan, Pendidik, Kontrak, Dokumen (`RincianPegawai.tsx`,
`PendidikPegawai.tsx`, `DokumenPegawai.tsx`); tab tanpa izin tidak tampil, tab
cloud-only menampilkan pesan galat dan tombol "Coba lagi" saat luring. Bagian
**Jenis dokumen pegawai** di tab Organisasi (`JenisDokumenOrganisasi.tsx`,
dimuat sendiri sehingga bagian tersinkron tetap tampil saat luring). Tab baru
**Laporan PTK** (`TabLaporanPtk.tsx`, hanya `teachers.view`).

Keputusan 1c (semua sesuai rekomendasi, 14 Nov 2026):

- **A.** `desktop_hr_documents` / `documents/query` menerima
  `hr.document.view` atau `hr.org.manage`; tanpa `id_karyawan` hanya jenis
  dokumen yang dikembalikan, sehingga Admin bawaan mengelola jenis tanpa
  melihat dokumen siapa pun. Jumlah command tetap 15.
- **B.** Dokumen: jenis dan tanggal terbit wajib, nomor opsional.
- **C.** NUPTK 16 digit di `save_teacher` ↔ `saveTeacher`, hanya bila diisi,
  ditolak sebelum outbox. Guru dengan NUPTK lama yang cacat harus dibetulkan
  saat disunting; impor guru ikut aturan yang sama.
- **D.** `siapkanBerkas(file, maksByte)`: bawaan tetap 200 KB untuk berkas
  siswa/PMB, 1 MB untuk dokumen pegawai. Foto tetap dipadatkan; PDF di atas
  1 MB ditolak.
- **E.** Laporan PTK: satu SQL cloud (`PTK_SQL`, pegawai aktif, pendidikan
  tertinggi, sertifikat terakhir, mapel dari `jadwal_mengajar` aktif pada
  tahun ajaran aktif) + status kini dari `STATUS_KINI_SQL`; layar menampilkan
  saringan unit dan tabel ringkasan per unit; Excel satu sheet (baris pegawai,
  satu baris kosong, ringkasan per unit dan total).
- **F.** Tab Kontrak di rincian baca-saja (dari `desktop_hr_contracts`);
  tambah dan batal tetap di tab Kontrak.
- **G.** Tanpa guard gateway Mobile; kalimat usang tentang
  `assertTersediaDiMobile()` di references 03 §8 dan 02 dibetulkan.
- **H.** Tes cloud lewat `TursoClient::local_file` di atas `ensure_schema`
  (Rust) dan database Web sungguhan (TS).

Gerbang (oleh Claude, per berkas/per nama; `bun run check` belum):

| # | Gerbang | Hasil |
| :-- | :-- | :-- |
| 11 | `bun test validations/hris.test.ts` (15, 6 baru); `services/hris.test.ts` (5, 1 baru); `cargo test hris_cloud` Mobile (5, crate Mobile terkompilasi dengan 15 command baru); `cargo test hris` Desktop (16: 11 lama + 5 baru, tanpa warning) | Lulus. Vektor kembar pengenal, isian, dan berkas (batas tepat 1 MB lolos, +1 bita ditolak); profil hanya membawa kelompok sesuai izin; siswa ditolak; berkas keenam ditolak; hapus dokumen membuang semua berkasnya; daftar tidak membawa isi berkas |
| 12 | `web-rbac-boundary.test.ts` + `berkas-sekolah.test.ts` (29); `audit:contract` (Desktop 394, Mobile 399 terdaftar lengkap); `audit:route-guard` | Lulus |
| 13 | `tsc --noEmit` dan Biome kedua workspace; `audit:a11y`, `audit:list-bound`, `audit:page-guard`, `audit:ui-guard`, `audit:dialog`, `audit:confirm`, `audit:silent-catch`, `audit:sql`, `audit:schema` | Lulus. `audit:a11y` awalnya menolak tiga kontrol form profil yang membawa `id` lewat spread; diperbaiki dengan `id` eksplisit |
| 14 | `sync-rust-modules.ts`, `sync-frontend-lib.ts`; paragraf HRIS v68 di `CLAUDE.md` | Selesai; `bun run check` penuh oleh pemilik sesudah semua fase HRIS |

Penyimpangan dan catatan, untuk ditinjau:

- **Ringkasan PTK hanya di TS** (`ringkasPtk`, diuji `hris.test.ts`), tidak
  kembar Rust: barisnya datang dari SQL kembar, dan ringkasan dihitung di
  layar yang sama untuk Web dan Desktop. Persentase S1/D4 ke atas dan
  bersertifikat dihitung atas **guru**, bukan seluruh PTK (kualifikasi itu
  syarat guru); tendik dihitung sebagai jumlah saja.
- **Saringan unit Laporan PTK di layar**, bukan di SQL: barisnya dibatasi
  jumlah pegawai aktif.
- **Upsert pendidikan, sertifikat, dan dokumen tidak bisa memindah baris ke
  pegawai lain** (`ON CONFLICT … WHERE id_karyawan = excluded.id_karyawan`).
  Simpan ke pegawai yang belum ada di cloud (dibuat luring, belum
  tersinkron) ditolak dengan "Pegawai ini belum ada di database pusat".
- **Urutan berkas = slot kosong terkecil 1–5** dalam satu `INSERT … SELECT`.
  Tanpa `UNIQUE`, dua unggahan yang benar-benar bersamaan pada dokumen yang
  sama bisa mendapat slot yang sama dan membuat dokumen berisi 6 berkas.
  Batasnya diterima karena dokumen pegawai diunggah satu operator.
- **Ukuran berkas di daftar dihitung dari panjang base64**: `hr_dokumen_berkas`
  tidak punya kolom ukuran dan skema tidak dinaikkan.
- **Jejak `pribadi_/keuangan_diubah_pada` memakai `datetime('now')` (UTC)**,
  sama dengan `created_at` tabel v68 lain; layar menampilkannya apa adanya.
- **Baris `hr_profil` lahir dari simpan kelompok mana pun**; kelompok lain
  tampil kosong ("Belum pernah diisi") sampai disimpan.
- **Simpan jenis dokumen dengan id yang tidak ada membuat jenis baru** (upsert
  biasa), berbeda dari jenis tugas yang menolak id tak dikenal. Layar hanya
  mengirim id dari daftar.
- **Pemakaian ulang**: `ukuran_base64`/`tanda_tangan_cocok` (Rust) dan
  `tandaTanganCocok` (TS) dari `berkas_sekolah` kini publik; `new_id`
  `hris.rs` menjadi `pub(crate)`; `masaKerja` pindah ke
  `components/kepegawaian/gaya.ts`.
- **Belum diuji di browser**: rincian pegawai, unggah/lihat berkas, dan unduh
  Laporan PTK baru diuji lewat tes service dan typecheck.
