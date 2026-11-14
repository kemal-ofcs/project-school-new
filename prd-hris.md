# PRD — HRIS (Kepegawaian Sekolah dan Yayasan)

Status (14 Nov 2026): Keputusan pemilik K-1 sampai K-8 di §5. **Fase 0
(PPh 21 dan BPJS per masa, v67) sudah dibangun** (§6.13); `bun run check`
penuh sengaja ditunda sampai semua fase selesai. **Fase 1 (v68, sub-fase
1a/1b/1c) sudah dibangun** (§19.11–§19.13). **Fase 2 dirancang sampai
langkah di §20** (v69, sentinel `-2045`, sub-fase 2a/2b/2c), belum ada kode;
**Q-40 sampai Q-58 disetujui sesuai usulan** (§20.10), siap dieksekusi mulai 2a. Fase 3 sampai 8 baru
berupa cakupan (§8–§14); model data rinci ditulis di awal setiap fase, dalam
bagian "Urutan pengerjaan Fase N", seperti `prd-hris.md` proyek
`absensi-perusahaan`.

Rujukan: `C:\dev\absensi-perusahaan\prd-hris.md` (HRIS perusahaan, fase 1–14
sudah dibangun). Aturan bisnisnya dan vektor ujinya dipakai ulang di sini.
Kodenya tidak disalin begitu saja: skema di sana v45, di sini v66; nomor
sentinel berbeda; "cabang" di sana adalah `akademik_unit` di sini; dan gaji di
sini dihitung per jam ditambah per JP, bukan bulanan atau harian.

---

## 1. Masalah

Aplikasi ini sudah mengurus absensi, jadwal mengajar, presensi kelas, jurnal
mengajar, gaji per jam dan per JP, pajak, BPJS, kasbon, rapel, dan pembukuan.
Pekerjaan kepegawaian di sekitarnya masih dikerjakan TU dan yayasan di luar
aplikasi:

- struktur organisasi per unit, jabatan, dan tugas tambahan tiap tahun ajaran;
- biodata, status kepegawaian (GTY, GTT, PTY, PTT, Honorer, PNS/PPPK DPK),
  kontrak, SK, dan dokumen;
- izin, sakit, cuti, dan dinas luar guru beserta **siapa yang menggantikan jam
  mengajarnya**;
- beban mengajar per guru dan kelayakannya untuk tunjangan profesi;
- kualifikasi dan sertifikasi pendidik untuk akreditasi;
- surat peringatan, pegawai keluar, penilaian kinerja, pelatihan, rekrutmen;
- pengingat kontrak habis, kenaikan gaji berkala, pensiun, sertifikat
  kedaluwarsa.

Sekarang izin dan sakit hanya bisa dicatat lewat Koreksi Admin (`Sakit`,
`Izin`, `Dispen`), tanpa jejak siapa yang meminta, siapa yang menyetujui, sisa
jatah cuti, dan kelas mana yang kosong karenanya.

Di luar HRIS, penelusuran menemukan **tarif PPh 21 TER B dan C yang salah** di
seed gaji (§6.1). Itu dikerjakan lebih dulu sebagai Fase 0.

## 2. Apakah fitur ini masuk aplikasi ini?

**Ya.** Hampir semua yang dibutuhkan sudah ada datanya:

| Kebutuhan | Yang sudah ada |
| :-- | :-- |
| Daftar personil | `master_data` (`divisi` teks, `unit` nama unit, `jabatan_status`, `tanggal_mulai_aktif`) |
| Data guru | `guru_data` (`nip`, `nuptk`, `gelar`, `spesialisasi_mapel`, `status_kepegawaian`) |
| Unit (pengganti "cabang") | `akademik_unit`, `master_data.unit`, `akademik_rombel.id_unit` |
| Wali kelas | `akademik_rombel.id_wali_kelas` |
| Jadwal dan JP | `jadwal_mengajar` (`id_guru`, `hari`, `jam_ke`), `akademik_jam_pelajaran` |
| Siapa yang benar-benar mengajar | `presensi_mapel.id_guru`; honor JP sudah mengikuti kolom ini (`summarize_teaching`) |
| Hari wajib masuk | `tbl_shift.hari_kerja`, `tbl_hari_libur`, `hari_libur_whitelist` |
| Status S/I di laporan | `laporan-kehadiran.ts` |
| Tunjangan per kelompok | `payroll_components.applies_to` (`PERSONIL:`, `STATUS:`, `DIVISI:`) |
| Kenaikan tarif berlaku surut | `payroll_rapel` (v51) |
| Pengajuan dengan persetujuan | kasbon (`keu_pinjaman`), pengajuan pembelian inventaris (sidik isi) |
| Riwayat append-only, status diturunkan | `inventory_mutasi`, `keu_pinjaman_mutasi`, rapel |
| Berkas di luar snapshot | `absensi_foto`, `siswa_berkas`, `pmb_berkas` |
| Riwayat ganti identitas | `riwayat_identitas_karyawan` |
| Cetak A4 dengan kop | `company_profile` + pola cetak kuitansi/slip |
| Pemberitahuan grup | Telegram v66 (`notifikasi_telegram`, `bidang_kejadian`) |

**Batasnya:** Portal Guru (guru login sendiri, mengajukan izin, melihat slip)
ditunda (K-5). Formulir lamaran publik tidak dibuat. Integrasi ke sistem luar
(Dapodik, Info GTK, BPJS online, e-Bupot) di luar cakupan; yang ada hanya
ekspor Excel.

## 3. Perubahan arsitektur yang butuh persetujuan

Sesuai AGENTS.md aturan 3. Belum disetujui; diputuskan per fase di bagian
"Urutan pengerjaan".

| # | Perubahan | Kenapa perlu | Usulan paling aman |
| :-- | :-- | :-- | :-- |
| A-1 | **Bagian dan jabatan menjadi master** | Nama bagian kini teks bebas di `master_data.divisi` dan disalin ke `id_card`, `log_scan`, `absensi_harian`, `koreksi_admin` | Pola HRIS perusahaan §5.2: tabel master + daftar nama lama. Kolom teks lama TIDAK dihapus dan tetap diisi nama sekarang, supaya scanner dan kueri lama jalan tanpa diubah |
| A-2 | **Akun operator tertaut ke personil** | Peran Atasan, aturan "tidak untuk diri sendiri", dan cakupan unit butuh tahu akun ini milik siapa. `master_operator` belum punya kolomnya | Kolom `master_operator.id_karyawan` (boleh kosong). Tabel ini cloud-only, jadi cukup `db-migrations.ts` + `ensure_column` di `turso.rs` |
| A-3 | **Absensi membaca pengajuan yang disetujui** | Cuti dan dinas luar tidak boleh menjadi Alfa | Pengajuan tidak menulis `absensi_harian`. Generate Alfa, audit, dan laporan membaca SQL kembar `PENGAJUAN_BERLAKU_SQL` |
| A-4 | **Gaji membaca HRIS** | Cuti dibayar/tidak dibayar, tugas tambahan sebagai dasar tunjangan, gaji terakhir pegawai keluar | Titik kait di ketiga titik hitung gaji (pratinjau Rust, pembekuan Rust, `computePayrollRecap` Web), seperti kasbon dan rapel |
| A-5 | **Pemutus dibatasi unit** (K-4) | Yayasan bisa punya TK, SD, SMP. Kepala SD tidak memutus izin guru SMP | Cakupan dihitung dari unit utama personil yang tertaut ke akun (A-2). Pemegang izin `hr.scope.all` (Yayasan) memutus untuk semua unit. Lihat §15.2 |
| A-6 | **Bidang Telegram baru `kepegawaian`** | Pengingat kontrak, pensiun, KGB, dan pengajuan | Kejadian baru dinyalakan setelah semua perangkat diperbarui (perangkat lama membatalkan kejadian yang tidak dikenalnya) |

**A-5 berbeda dari HRIS perusahaan.** Di sana cakupan bawahan ditolak (Q-38):
atasan melihat semua karyawan. Di sini yang dibatasi hanya **memutus** dan
**mengajukan urgent**. Melihat daftar tetap mengikuti izin biasa, supaya
halaman lama tidak tiba-tiba kosong.

## 4. Istilah

| Istilah | Arti |
| :-- | :-- |
| **Yayasan** | Pengurus yayasan (swasta). Pemutus tertinggi untuk SK, pengangkatan, cuti panjang, SP3, dan pegawai keluar. Di sekolah negeri peran ini dipegang kepala sekolah; dinas tidak punya akun |
| **Kepala Sekolah** | Atasan semua guru dan tendik di unitnya. Pemutus izin/cuti harian guru |
| **Kepala TU** | Atasan tendik (staf TU, kebersihan, keamanan) di unitnya |
| **Guru** dan **Tendik** | Dua kelompok sejajar, bukan berjenjang. Guru di bawah kepala sekolah (lewat wakasek); tendik di bawah kepala TU |
| **Komite sekolah** | Mitra dan pengawas, **bukan** atasan. Tidak punya peran di alur persetujuan |
| **Atasan** | Akun yang tertaut ke satu personil (A-2) dan memegang izin pengaju |
| **Pemutus** | Pemegang izin pemutus jenis pengajuan itu, dalam cakupan unitnya (A-5) |
| **Unit utama** | Unit `master_data.unit` seorang personil. Guru yang mengajar di dua unit tetap punya satu unit utama |
| **Tugas tambahan** | Kepala sekolah, wakasek, wali kelas, kaprog, kepala perpustakaan/lab, bendahara BOS, pembina ekskul, guru piket. Berlaku per tahun ajaran, satu orang boleh lebih dari satu |
| **JP terdampak** | Satu jam pelajaran di `jadwal_mengajar` milik guru yang sedang izin/sakit/cuti/dinas luar |
| **Guru pengganti** | Guru yang mengajar JP terdampak. Honornya otomatis karena ia menyimpan presensi kelas atas namanya sendiri |
| **Masa pajak** | Satu bulan kalender (Fase 0) |

## 5. Keputusan pemilik (13 Nov 2026)

| No | Pertanyaan | Jawaban |
| :-- | :-- | :-- |
| K-1 | Status kepegawaian yang dipakai | GTY, GTT, PTY, PTT, Honorer, PNS/PPPK yang dipekerjakan. Sudah lengkap |
| K-2 | Jatah cuti guru dan staf | Diatur di Pengaturan, terpisah untuk guru dan tendik (jumlah hari dan aturannya) |
| K-3 | Honor JP saat guru izin | **Ke guru pengganti.** JP yang sudah diajar tetap ke guru asli. Izin guru dihitung per JP ("mulai jam ke-N"), bukan per hari |
| K-3a | Pengganti wajib? | Tidak menghalangi persetujuan izin (sakit mendadak harus tetap tercatat). Yang wajib: **setiap JP terdampak punya status** (Diganti / Tugas mandiri / Digabung). JP tanpa status muncul di "Jam kosong hari ini" dan kartu "Perlu perhatian" |
| K-4 | Struktur atasan | Swasta: Yayasan → Kepala Sekolah → Wakasek (guru) / Kepala TU (tendik). Negeri: Kepala Sekolah tertinggi di aplikasi. Komite bukan atasan. Perbedaannya hanya data dan izin, tanpa kode berbeda |
| K-4a | Pemutus per unit | **Ya.** Pemutus dibatasi unitnya; Yayasan untuk semua unit (A-5) |
| K-5 | Portal Guru (self-service) | Ditunda |
| K-6 | Perbaikan PPh 21 TER | Ditulis PRD-nya dulu (§6), lalu dikerjakan paling pertama |
| K-7 | Usulan urutan fase | Disetujui: §6–§14 |
| K-8 | HRIS bagian dari produk yang sama atau modul berlisensi terpisah | Belum ditanyakan; usulan Q-11 (§16) |

## 6. Fase 0 — Perbaikan PPh 21 dan BPJS

Bukan nasihat pajak: angka dan aturan di §6.2 wajib dicocokkan dengan
konsultan pajak sebelum dipakai klien. Rancangan mengikuti fase 13 HRIS
perusahaan (§29 di sana), yang sudah dibangun dan lulus `bun run check`
(13 Nov 2026), disesuaikan dengan mesin gaji sekolah.

### 6.1 Temuan dari kode

Diverifikasi ke kode sekolah, bukan disalin dari PRD perusahaan.

**Salah, wajib diperbaiki:**

1. **Tabel TER B dan TER C di seed salah**, persis bug perusahaan.
   `tarif-payroll-bawaan.json` TER B benar sampai lapis 6, lalu memakai batas
   TER A: `tax_ter_b_7` 10.750.000–12.500.000 2% (baris 88; seharusnya s.d.
   11.250.000 2%, lalu 2,5% dan 3%). Totalnya 37 lapis, tertinggi 32%
   (`tax_ter_b_37`, baris 118); seharusnya 40 lapis, 34%. TER C benar sampai
   lapis 15, lalu `tax_ter_c_16` 22.700.000–24.700.000 9% (baris 134;
   seharusnya s.d. 26.600.000). Totalnya 39 lapis, tertinggi 32%; seharusnya
   41 lapis, 34%. Contoh: K/1 bruto 12.000.000 dipotong 2% = 240.000,
   seharusnya 3% = 360.000.
2. **Batas upah Jaminan Pensiun lama.** Seed `bpjs_jp_emp`/`bpjs_jp_co`
   `wage_cap` 10.042.300 (angka 2024). Menurut riset fase 13 perusahaan, yang
   berlaku sejak Maret 2026 adalah 11.086.300.
3. **Tidak ada rekonsiliasi masa terakhir.** `calculate_pph21_ter`
   (`payroll/engine.rs:410`) hanya mencari lapis TER; baris `PASAL_17` di
   `tax_rules` tidak pernah dipakai mesin. PPh setahun pegawai tetap tidak
   pernah dihitung ulang dengan Pasal 17 di Desember atau di bulan pegawai
   berhenti, sehingga kekurangan atau kelebihan potong setahun tidak pernah
   diselesaikan.
4. **TER per run, bukan per masa.** Run tidak boleh beririsan
   (`RUN_BERIRISAN_SQL`, `payroll/commands.rs:101`), tetapi dua run dalam satu
   bulan (1–15 dan 16–30) diperbolehkan. Masing-masing dihitung TER atas
   bruto separuh bulan, sehingga potongannya terlalu kecil. Di sekolah yang
   menggaji bulanan dampaknya nol; tetap diperbaiki karena rumusnya sama.
5. **BPJS per run.** Batas upah diterapkan per run, jadi dua run sebulan
   bisa melewati batas JP. Sama seperti temuan 4.
6. **Dasar BPJS terlalu lebar.** `calculate_bpjs_and_pph21`
   (`engine.rs:478`) memakai `bruto − lembur`. Bruto itu memuat SEMUA
   komponen ALLOWANCE, termasuk honor `PER_JP` dan `PER_HADIR` yang berubah
   tiap bulan, padahal dasar iuran adalah gaji pokok + tunjangan tetap.
7. **PTKP per run.** Status diambil dari `salary_configs` yang berlaku untuk
   periode run, sedangkan PMK 168 memakai keadaan awal tahun pajak (ragu, perlu
   dicek konsultan).
8. **PPh negatif belum dikenal di hilir.** `susun_jurnal_payroll`
   (`loan.rs:297`) membuang baris berdebit/berkredit ≤ 0, sehingga
   pengembalian PPh di masa terakhir akan masuk ke `akun-potongan-gaji`.
   `payroll_items.net_salary` CHECK ≥ 0 tetap aman karena pengembalian
   menambah bersih.
9. **`bpjs_rules.component_code` UNIQUE**: satu kode hanya punya satu baris,
   jadi `effective_date` tidak pernah memilih apa-apa dan mengubah batas
   berarti menimpa. Dicatat, tidak diubah di fase ini (sama dengan keputusan
   perusahaan).

**Sudah benar di sini (tidak diulang dari PRD perusahaan):**

- Premi JKK, JKM, dan BPJS Kesehatan bagian sekolah sudah masuk bruto pajak
  (`PREMI_KENA_PAJAK`, `engine.rs:511`).
- Dasar BPJS sudah tanpa lembur.
- Web menanam tarif dari berkas yang sama (`db-migrations.ts:17`, `:1168`).
  Bug "Web tanpa TER" di perusahaan tidak ada di sini.
- Tidak ada jenis gaji `FLAT_DAILY`; semua personil dihitung per jam + per JP.
- Run yang beririsan sudah ditolak.

**Kait yang dipakai rancangan:**

- Masa sebuah run: preseden kasbon (`substr(period_start, 1, 7)`,
  `status <> 'REJECTED'`).
- Status tetap/tidak tetap belum ada (kontrak baru lahir di Fase 1). Yang
  terdekat: `guru_data.status_kepegawaian` (teks, hanya guru) dan
  `master_data.jenis_personil`. Lihat Q-2.
- Pegawai keluar belum punya penanda selain `master_data.status_aktif` dan
  `tanggal_selesai_aktif`.
- Uang di Rust `rust_decimal` `MidpointAwayFromZero`, TS bilangan bulat;
  vektor kembar yang menjaga keduanya sama.
- Mobile: `payroll/*.rs` disalin ke `payroll_admin/`, `payroll_seed.rs` ikut
  daftar salin; halaman payroll Mobile berkas terpisah.

### 6.2 Aturan menurut regulasi

Diambil dari §29.2 PRD perusahaan (sumber: paparan DJP PMK 168/2023, PP
58/2023, surat BPJS Ketenagakerjaan B/1226/022026, Perpres 59/2024 Pasal 32).
Ringkasnya:

- **Pegawai tetap, masa biasa:** PPh = TER bulanan × bruto sebulan. Batas atas
  lapis inklusif. Bruto memuat premi JKK, JKM, dan Kesehatan yang dibayar
  pemberi kerja.
- **Pegawai tetap, masa terakhir** (Desember, atau bulan berhenti): PPh
  setahun = Pasal 17 × PKP; PKP = bruto setahun − biaya jabatan (5%, maks
  500.000 per bulan bekerja) − iuran JHT/JP pegawai − PTKP, dibulatkan ke bawah
  ribuan. PPh masa terakhir = PPh setahun − PPh masa sebelumnya, **boleh
  negatif** (dikembalikan ke pegawai).
- **PTKP:** 54.000.000, + 4.500.000 kawin, + 4.500.000 per tanggungan (maks 3).
- **Pegawai tidak tetap dibayar bulanan:** TER bulanan × bruto, tanpa
  rekonsiliasi Pasal 17. **Tidak dibayar bulanan:** TER harian (≤ 450.000
  sehari 0%; s.d. 2.500.000 0,5%; di atasnya Pasal 17 × 50% bruto).
- **BPJS:** dasar = gaji pokok + tunjangan tetap, tanpa lembur. JP pekerja 1%,
  perusahaan 2%, batas 11.086.300 sejak Maret 2026. Kesehatan batas atas
  12.000.000. JHT, JKK, JKM tanpa batas.

Vektor uji V1–V12 dipakai apa adanya dari `pajak.vektor.json` proyek
perusahaan, ditambah vektor sekolah:

| # | Kasus | Hasil |
| :-- | :-- | :-- |
| VS1 | Guru tetap K/1, bruto 12.000.000 | TER B 3% = 360.000 (sekarang 240.000) |
| VS2 | Guru honorer (tidak tetap, dibayar bulanan), TK/0, honor JP 2.400.000 | TER A 0% = 0, Desember juga 0 |
| VS3 | Guru tetap, honor JP 3.000.000 + gaji pokok jam 4.000.000, BPJS | Dasar BPJS sesuai Q-3; honor JP masuk bruto pajak |

### 6.3 Rancangan rumus

Satu modul murni kembar `payroll/pajak.rs` (ikut daftar salin
`payroll_admin`) ↔ `validations/pajak.ts`, vektor di
`validations/pajak.vektor.json` (dibaca Rust lewat `include_str!`). Logika
dan vektornya dipindahkan dari proyek perusahaan, lalu disesuaikan:

1. **Status pajak** `status_pph` ↔ `statusPph`: sesuai Q-2. Mulai Fase 1,
   diturunkan dari kontrak terakhir.
2. **BPJS per masa:** `dasar_run` sesuai Q-3. `D_masa = Σ dasar run pembanding
   + dasar_run`; iuran masa per kode = `round(tarif × min(D_masa, wage_cap))`;
   potongan run = iuran masa − yang sudah dipotong run pembanding, paling
   kecil 0.
3. **Bruto pajak** = bruto + premi `PREMI_KENA_PAJAK` (sudah ada, tidak
   berubah).
4. **Tetap, masa biasa:** `P_masa = round(TER(kategori, B_masa) × B_masa)`;
   potongan = `P_masa − Σ PPh pembanding`, paling kecil 0.
5. **Tetap, masa terakhir:** Desember, atau bulan `tanggal_selesai_aktif` bila
   pegawai sudah dinonaktifkan saat run dibuat. Rumus §6.2. Potongan boleh
   negatif.
6. **Tidak tetap:** run sebulan penuh → TER bulanan tanpa masa terakhir; run
   lain → TER harian atas `total_hadir`.
7. **Run pembanding** = item personil yang sama di run lain bermasa sama (atau
   setahun untuk masa terakhir), `status <> 'REJECTED'`. SQL kembar
   `RUN_TAHUN_SQL`. Gateway Desktop/Mobile menjalankan `syncNow()` sebelum
   membuat run.
8. **Konstanta** PTKP, biaya jabatan, TER harian di
   `validations/pajak-bawaan.json`. TER bulanan dan Pasal 17 tetap di
   `tax_rules`.
9. **Snapshot:** `breakdown_snapshot` mendapat kunci `pajak` (versi, masa,
   status, metode, kategori, tarif, bruto pajak, sudah dipotong, dan rincian
   masa terakhir) dan `bpjs_masa`. Kunci lama `tax`/`bpjs` tetap untuk slip
   lama. Tanpa kolom baru di `payroll_items`.
10. **Tanda, tidak menolak:** `lebih_potong_masa`, `lintas_bulan`,
    `rumus_lama`, `status_pajak_berubah`, `komponen_per_run`,
    `tarif_tidak_ada`.

### 6.4 Run lama

- Tidak ada run yang dihitung ulang. Run terbuka yang dibuat sebelum
  pembaruan tetap berangka lama dan ditandai `rumus_lama`.
- Angka run lama masuk sebagai "sudah dipotong". **Masa terakhir 2026
  mengoreksi seluruh tahun**, termasuk kekurangan akibat TER B/C yang salah,
  jadi potongan Desember 2026 bisa besar, atau berupa pengembalian.
- Slip Web dan Mobile menampilkan PPh bila `!== 0` dengan label metode;
  pengembalian ditulis "Pengembalian PPh 21".
- Jurnal `pay-<run>`: PPh negatif masuk DEBIT `akun-utang-pph21` (temuan 8),
  vektor baru di kedua tes jurnal.
- Kasbon dan rapel: aturannya tidak berubah. Rapel tetap masuk sebagai
  tunjangan, jadi ikut bruto pajak.

### 6.5 Model data dan sinkronisasi

**Usulan: skema v67, sentinel `-2043` `payroll-pajak-masa-v1`.**

1. Koreksi TER B dan C di `turso.rs` dan `db-migrations.ts`: `UPDATE` baris
   `tax_ter_b_7..37` dan `tax_ter_c_16..39` HANYA bila nilainya masih sama
   dengan seed lama, lalu `INSERT OR IGNORE` lapis yang kurang. Seed
   `tarif-payroll-bawaan.json` ikut dibetulkan untuk pemasangan baru.
2. Batas JP 11.086.300, berlaku 2026-03-01, hanya untuk baris yang masih
   bernilai seed 10.042.300.
3. Bila Q-3 (a): kolom `payroll_components.dasar_bpjs INTEGER NOT NULL DEFAULT
   0 CHECK (dasar_bpjs IN (0,1))` di keempat lapis (`storage.rs` kedua
   workspace, `turso.rs` DDL + `ensure_column` + handler yang menimpa hanya
   bila payload membawa kuncinya, `sync.rs`, `db-schema.ts`/`db-migrations.ts`),
   plus Zod `.strict()` rute komponen.
4. Bila Q-2 (b): kunci `pajak_status_tidak_tetap` di `setting_gex_system`
   (daftar status kepegawaian), tanpa kolom baru.

Ikut naik: `CURRENT_SCHEMA_VERSION`/`CLIENT_SCHEMA_VERSION` 67 (Desktop dan
Mobile), sentinel di INSERT dan `ensure_schema_current`,
`isDatabaseSchemaReady`, `schema-consistency.test.ts`, daftar versi
`rbac-migration.test.ts`. Tanpa tabel baru. Perangkat v66 berhenti sinkron
begitu cloud v67.

### 6.6 Hak akses

Tanpa izin baru. Membuat run `payroll.run.create`, tarif dan komponen
`payroll.config.manage`.

### 6.7 Command, rute, dan layar

- Tanpa command atau rute baru. Berubah: pratinjau rekap dan pembuatan run
  (Rust, salinan `payroll_admin` ikut), `computePayrollRecap` dan rute run
  (Web), simpan komponen bila Q-3 (a).
- Rekap dan rincian run menampilkan metode dan tanda di bawah angka PPh;
  ringkasan run menyebut berapa slip bertanda `rumus_lama`.
- Form komponen: centang "Tunjangan tetap (dasar BPJS)" bila Q-3 (a).
- Halaman pajak: kartu baca-saja PTKP, biaya jabatan, TER harian; halaman
  BPJS: catatan bahwa batas JP berubah setiap Maret.
- Halaman payroll Mobile disunting manual (bukan salinan).

### 6.8 Tidak dikerjakan di fase ini

Zakat lewat pemberi kerja, PPh 21 DTP, gross-up, pegawai dengan dua pemberi
kerja, PPh 26, pesangon final, pemisahan penghasilan teratur/tidak teratur
(THR), batas bawah UMK BPJS Kesehatan, generasi tarif `bpjs_rules`, komponen
FIXED sebagai jatah per bulan, laporan e-Bupot/BPJS.

### 6.9 Langkah

| # | Langkah | Gerbang |
| :-- | :-- | :-- |
| 1 | Skema v67: koreksi TER B/C dan JP bersyarat, seed diperbaiki, kolom/kunci sesuai Q-2/Q-3 | `audit:schema` + tes sentinel kedua workspace (seed lama dikoreksi, suntingan admin tidak) + tes migrasi Web |
| 2 | Aturan kembar `pajak.rs` ↔ `pajak.ts`, vektor V1–V12 + VS1–VS3 | `bun test validations/pajak.test.ts` + `cargo test pajak` kedua workspace |
| 3 | SQL kembar `RUN_TAHUN_SQL` + integrasi pratinjau dan pembekuan Rust | tes SQLite: dua run sebulan, Desember, pegawai keluar, run lama, `REJECTED` diabaikan |
| 4 | Web `computePayrollRecap` + rute run | `services/*.test.ts`: data langkah 3, hasil sama |
| 5 | Hilir: jurnal PPh negatif, slip Web dan Mobile, layar §6.7 | vektor jurnal kembar; typecheck + Biome |
| 6 | `sync:mobile`, CLAUDE.md, "Sudah dibangun" | `audit:contract`; `bun run check` oleh pemilik |

### 6.10 Pertanyaan untuk pemilik (Fase 0)

| No | Pertanyaan | Usulan | Alasan |
| :-- | :-- | :-- | :-- |
| Q-1 | Masa pajak sebuah run: (a) bulan `period_start`; (b) bulan `period_end`? | (a) | Sama dengan kasbon |
| Q-2 | Sebelum ada kontrak (Fase 1), siapa pegawai tidak tetap? (a) semua dianggap tetap; (b) status kepegawaian yang tercantum di Pengaturan (bawaan: Honorer, GTT, PTT) tidak tetap, sisanya tetap | (b) | Guru honorer per JP bukan pegawai tetap; tanpa ini Desember merekonsiliasi Pasal 17 untuk mereka. Tendik tanpa `guru_data` dianggap tetap sampai Fase 1 |
| Q-3 | Dasar BPJS: (a) gaji pokok + tunjangan yang ditandai "tetap" (kolom baru, bawaan tidak ditandai); (b) gaji pokok saja; (c) seperti sekarang (bruto tanpa lembur) | (a) | Honor JP dan uang hadir berubah tiap bulan, bukan upah tetap; aplikasi tidak bisa menebak tunjangan mana yang tetap |
| Q-4 | PTKP: (a) status per 1 Januari (atau konfigurasi pertama tahun itu); (b) per run seperti sekarang | (a) | PMK memakai keadaan awal tahun (perlu dicek konsultan) |
| Q-5 | Lebih potong di masa terakhir: (a) dikembalikan lewat gaji bersih run itu; (b) PPh 0, diurus manual | (a) | Kewajiban pemotong menurut PMK 168 |
| Q-6 | Run terbuka saat pembaruan: (a) biarkan berangka lama, ditandai; (b) wajib ditolak dan dibuat ulang | (a) | Masa terakhir mengoreksi |
| Q-7 | Koreksi TER dan batas JP: (a) hanya baris yang masih sama dengan seed; (b) timpa semua | (a) | Tarif yang sengaja diubah admin tidak ditimpa |
| Q-8 | Run pembanding: (a) semua kecuali `REJECTED`, termasuk `DRAFT`; (b) hanya `APPROVED`/`PAID` | (a) | Sama dengan kasbon |
| Q-9 | PTKP, biaya jabatan, TER harian: (a) konstanta JSON di kode; (b) tabel yang bisa diubah | (a) | Jarang berubah; (b) butuh membangun ulang CHECK `tax_rules` di empat lapis |
| Q-10 | Fase 0 dirilis sendiri (v67) sebelum Fase 1 | Ya | Dampak uangnya sudah berjalan setiap bulan |

### 6.11 Penanda yang ditinjau pemilik

- Gaji bersih berubah untuk personil PTKP kategori B/C, personil dengan lebih
  dari satu run sebulan, personil di atas batas JP, dan semua pegawai tetap di
  Desember.
- **Desember 2026 menanggung koreksi setahun** dari tarif yang salah.
- Bila Q-3 (a): iuran BPJS guru yang sebagian besar penghasilannya honor JP
  **turun**, karena honor tidak lagi menjadi dasar iuran.
- Naik ke v67: semua perangkat wajib diperbarui.
- Aturan §6.2 wajib dicek konsultan pajak.

### 6.12 Jawaban Fase 0 (13 Nov 2026)

- **Q-1 sampai Q-10**: semuanya sesuai usulan §6.10, dan penanda §6.11
  disetujui. Artinya: masa = bulan `period_start`; status tidak tetap dari
  daftar `pajak_status_tidak_tetap` (bawaan Honorer, GTT, PTT); dasar BPJS
  gaji pokok + tunjangan bertanda (kolom `payroll_components.dasar_bpjs`
  masuk langkah 1); PTKP awal tahun; lebih potong dikembalikan lewat gaji
  bersih; run terbuka ditandai `rumus_lama`; koreksi tarif hanya baris yang
  masih sama dengan seed; pembanding semua run kecuali `REJECTED`; konstanta
  di JSON; Fase 0 dirilis sendiri sebagai v67.
- Eksekusi per langkah §6.9 di sesi terpisah.

### 6.13 Sudah dibangun (14 Nov 2026)

Langkah 1–6 dibangun: skema v67 (sentinel `-2043` `payroll-pajak-masa-v1`,
tanpa tabel baru, tanpa izin baru, tanpa command atau rute baru). Gerbang
yang dijalankan (oleh Claude, per berkas/per nama; `bun run check` belum):

| # | Gerbang | Hasil |
| :-- | :-- | :-- |
| 1 | `audit:schema`; `cargo test sentinel_2042` Desktop dan Mobile; `tarif-payroll-bawaan.test.ts` | Lulus. 130 lapis pajak (TER 125), seed lama dikoreksi, lapis dan batas JP yang disunting admin tidak ditimpa, koreksi hanya sekali per database, `dasar_bpjs` lahir, handler komponen mempertahankan penanda bila kuncinya absen |
| 2 | `bun test validations/pajak.test.ts` (7); `cargo test pajak` Desktop dan Mobile (9 masing-masing) | Lulus. Vektor V1–V12 + VS1–VS3 dari satu `pajak.vektor.json`; teks konstanta dan SQL dicek harfiah ke kedua `pajak.rs` |
| 3 | `payroll::commands::tests_pajak` (3) | Lulus: dua run sebulan, `REJECTED`/tahun lalu/bulan sesudahnya diabaikan, Desember dengan run lama, personil keluar, status tidak tetap dari setting |
| 4 | `services/payroll-pajak.test.ts` (4), plus `payroll-calculator`, `loan`, `payroll-rapel`, `payroll-recap-hari-kerja` | Lulus, kedua workspace. Data langkah 3, ditambah `computePayrollRecap` ujung ke ujung (guru tetap dan honorer) |
| 5 | `jurnal_payroll` kembar (Rust Desktop/Mobile, `loan.test.ts`); `tsc --noEmit` dan Biome kedua workspace | Lulus |
| 6 | `sync-rust-modules`, `sync-frontend-lib`; `audit:contract`, `audit:sql`, `audit:a11y` | Lulus. `cargo test payroll::`/`payroll_admin::` 28 masing-masing |

Penyimpangan dan catatan, untuk ditinjau:

- **Setting `pajak_status_tidak_tetap` belum punya layar.** §6.7 melarang
  command dan rute baru, dan tidak ada penyimpan setting umum. Kuncinya
  dibaca (kosong = tidak ada yang tidak tetap; belum ada = bawaan Honorer,
  GTT, PTT); kartu konstanta di halaman pajak menampilkan daftar bawaan.
  Mengubahnya butuh keputusan: perluas command kebijakan payroll yang ada,
  atau tunggu Fase 1 (kontrak).
- **Urutan seed di `turso.rs` diperbaiki** (bug yang sama dengan §29.14
  perusahaan): seed tarif kini berjalan sesudah `purge_legacy_rate_rows`.
  Sebelumnya baris lama Web `bpjs-jht-emp` menahan seed (`component_code`
  UNIQUE) lalu dihapus, sehingga JHT_EMP hilang sampai versi berikutnya.
- **Versi 67 ditulis sesudah koreksi** (`ensure_pajak_masa_v67`), bukan di
  daftar `schema_migration` awal, karena baris itulah penjaga "sekali per
  database". ALTER `dasar_bpjs` ada di badan `ensure_schema` sesudah rebuild
  `payroll_components` (daftar kolom rebuild eksplisit; `audit:schema` hanya
  membaca DDL di wilayah itu).
- **Angka TER B/C** disalin dari seed perusahaan (tabel PP 58/2023, sudah
  dicocokkan di sana); 55 baris lama di `koreksi_v67` sama persis dengan
  seed sekolah sebelum v67. V2 Desember dan V3 Agustus tetap "hitungan
  sendiri".
- **Item run lama**: status dianggap tetap (rumus lama tidak mengenal status),
  dasar BPJS = `gross_salary − overtime_salary` (dasar rumus lama), bruto
  pajak = bruto + premi dari `breakdown_snapshot.bpjs`.
- **Personil keluar** = `status_aktif <> 'Aktif'` dan
  `tanggal_selesai_aktif` terisi saat run dibuat. Nonaktif tanpa tanggal
  tidak memicu masa terakhir.
- **Rumus lama dihapus**: `calculate_bpjs`, `calculate_pph21_ter`,
  `calculate_bpjs_and_pph21`, `PREMI_KENA_PAJAK` (Rust dan TS) diganti
  `calculate_pajak_masa` ↔ `hitungPajakMasa`; premi memakai `KODE_PREMI`
  (termasuk kode lama Web). Tes engine lama diganti VS3 tingkat slip.
  `calculate_components` ↔ `calculateComponents` kini juga mengembalikan
  jumlah tunjangan bertanda `dasar_bpjs`.
- **Baris rekap** (Rust dan TS) mendapat `ptkp_awal_tahun`, `keluar_pada`,
  `pajak`. `payroll_items.ptkp_status` tetap menyimpan PTKP konfigurasi yang
  berlaku (seperti sebelumnya); pajak memakai PTKP awal tahun. Snapshot
  `tax.rate_percentage` `null` untuk metode Pasal 17.
- **Rute `config/components`** kini Zod `.strict()` (sebelumnya validasi
  manual); `created_at` boleh terbawa dan diabaikan.
- **Bug yang ikut ditutup**: draft komponen Mobile dibangun eksplisit, jadi
  tanpa field `dasar_bpjs` setiap simpan dari HP akan melepas tandanya. Draft
  itu kini membawanya.
- **Tidak dibangun** (bukan cakupan §6): validasi tarif lebih dari dua desimal
  saat disimpan (perusahaan punya `periksa_tarif`). Tarif seperti itu kini
  ditandai `tarif_tidak_sah` (BPJS) / `tarif_tidak_ada` (PPh) dan dihitung 0.
- **Honorer pada run bukan sebulan penuh tanpa absensi** dihitung 1 hari dan
  ditandai `tanpa_hari`: honor 2.400.000 kena TER harian 0,5% = 12.000.
- **Batas JP** dicocokkan lewat `component_code`; karena `bpjs_rules` satu
  baris per kode (temuan 9), run Januari–Februari 2026 yang dibuat sesudah
  pembaruan juga memakai 11.086.300.
- **Layar**: slip Web dan Mobile menampilkan PPh bila `!== 0` dengan label
  metode (Mobile menulis pengembalian `+` hijau); rincian run kedua versi
  menampilkan metode dan tanda di bawah angka PPh plus catatan `rumus_lama`;
  form komponen kedua versi punya centang "Tunjangan tetap (ikut dasar
  BPJS)"; `components/payroll/KonstantaPajak.tsx` (di `filesToCopy`) di
  halaman pajak dan BPJS. Rekap pratinjau sebelum membuat run belum
  menampilkan metode (nilainya sudah ada di baris rekap). Belum dicoba di
  aplikasi yang berjalan (tema gelap dan terang, lebar 360 px).

## 7. Fase 1 — Organisasi, data kepegawaian, kontrak, dokumen

### 7.1 Struktur organisasi

Tingkatannya tetap: **Unit → Bagian → Jabatan**. Unit memakai `akademik_unit`
yang sudah ada (tidak ada tabel cabang). Isi bagian dan jabatan disunting di
Pengaturan tab "Organisasi".

- **Bagian** (A-1) menggantikan teks `master_data.divisi`: Guru, Tata Usaha,
  Kebersihan, Keamanan, dan seterusnya. Migrasi: setiap teks `divisi` yang
  berbeda menjadi satu bagian. Nama lama dicatat dan dicadangkan (pola HRIS
  perusahaan §5.2).
- **Jabatan** adalah jabatan pokok, satu per orang: Guru Mapel, Guru Kelas,
  Staf TU, Operator Dapodik, Pustakawan, Laboran, Satpam, dan seterusnya.
- **Atasan langsung** (`id_atasan`) satu personil lain, siklus ditolak.
  Hanya untuk bagan dan penilai kinerja bawaan; tidak membatasi akses.
- Bagian dan jabatan tidak pernah dihapus, hanya dinonaktifkan. Keunikan nama
  ditegakkan di aplikasi, bukan `UNIQUE`.
- Catatan: id `akademik_unit` dibuat per perangkat, namanya yang sama di
  semua perangkat (komentar `master_data.unit`). Cakupan unit (A-5)
  membandingkan **nama** unit, sama seperti kolom itu.

### 7.2 Tugas tambahan per tahun ajaran

Tabel `hr_tugas_tambahan`: personil, jenis tugas, unit, tahun ajaran, nomor
SK, tanggal SK, ekuivalen JP per minggu.

- Jenis tugas adalah master yang bisa disunting. Bawaan dengan ekuivalen JP
  (Permendikbud 15/2018, **wajib dicek ulang**): Kepala Sekolah, Wakasek,
  Kaprog, Kepala Perpustakaan, Kepala Lab, Wali Kelas, Pembina OSIS, Pembina
  Ekskul, Guru Piket, Bendahara BOS.
- **Wali kelas dibaca dari `akademik_rombel.id_wali_kelas`**, tidak dicatat
  dua kali. Tabel ini hanya menambah nomor SK-nya bila ada.
- Tunjangan tugas tambahan memakai komponen gaji yang sudah ada dengan
  sasaran kelompok baru `TUGAS:<jenis>` di `applies_to_subject` ↔
  `appliesToSubject` (A-4). Nilai yang tidak dikenal tetap diperlakukan
  sebagai id, sesuai aturan lama.

### 7.3 Data kepegawaian

| Kelompok | Isi | Izin baca |
| :-- | :-- | :-- |
| Kerja | unit, bagian, jabatan, atasan, TMT (tanggal mulai tugas), status kepegawaian | `employees.view` |
| Pribadi | NIK, KK, tempat/tanggal lahir, jenis kelamin, agama, status nikah, alamat, kontak darurat | `hr.personal.view` |
| Keuangan | bank, rekening, NPWP, BPJS Kesehatan dan Ketenagakerjaan | `hr.finance.view` |
| Pendidik | NUPTK, NIP, NRG, riwayat pendidikan (jenjang, prodi, PT, tahun, linier), sertifikat pendidik (nomor, tahun, bidang studi) | `teachers.view` |

- `nip`, `nuptk`, `gelar` tetap di `guru_data`, tidak diduplikasi.
- Pribadi dan keuangan **cloud-only** (`hr_profil`, pola `master_operator`):
  tidak pernah ada di SQLite terminal scanner, hanya terbaca saat online.
- **Masa kerja** dihitung dari TMT, tidak disimpan.
- Validasi format kembar Rust ↔ TS (NIK 16 digit, NPWP 15/16 digit, NUPTK 16
  digit).

### 7.4 Status kepegawaian dan kontrak

`hr_kontrak` append-only. **Status kepegawaian tidak disimpan sebagai angka
baru**: diturunkan dari kontrak/SK terakhir yang berlaku, lalu ditulis ke
`guru_data.status_kepegawaian` di transaksi yang sama supaya aturan tunjangan
`STATUS:` yang sudah ada tetap jalan.

| Status (K-1) | Jenis hubungan | Peringatan |
| :-- | :-- | :-- |
| GTY / PTY | tetap yayasan (PKWTT) | masa percobaan maks 3 bulan |
| GTT / PTT | kontrak (PKWT) | wajib tanggal selesai; total berturut-turut maks 5 tahun |
| Honorer | tidak tetap | — |
| PNS / PPPK dipekerjakan | ASN, gaji dari pemerintah | tanggal SK penempatan |

Angka hukum adalah bawaan yang bisa diubah dan dicek ulang konsultan klien.
Status pajak Fase 0 (Q-2) beralih membaca kontrak di fase ini.

### 7.5 Dokumen

Data wajib, berkas opsional (pola HRIS perusahaan §5.5). Jenis bawaan: KTP,
KK, NPWP, Ijazah, Transkrip, Sertifikat Pendidik, SK Yayasan, SK Pembagian
Tugas, Kontrak Kerja, SKCK, Surat Keterangan Sehat, Sertifikat Pelatihan,
Lainnya. Berkas JPEG/PNG/WEBP/PDF, batas ukuran ditegakkan Rust sebelum
outbox, di luar snapshot, ditarik per id saat dibuka.

### 7.6 Tautan akun ke personil (A-2)

Form operator mendapat pilihan "Personil" (`PilihCari`). Satu personil hanya
boleh tertaut ke satu akun aktif (ditegakkan aplikasi). Tanpa tautan, akun
tetap bisa dipakai seperti sekarang tetapi tidak bisa memutus pengajuan
berlingkup unit (A-5) kecuali memegang `hr.scope.all`.

### 7.7 Laporan PTK

Ekspor Excel per unit: daftar PTK, kualifikasi (persentase S1/D4),
sertifikasi (persentase bersertifikat), linieritas mapel dengan sertifikat,
masa kerja, status kepegawaian. Dipakai untuk akreditasi dan pemeriksaan data
Dapodik. Tidak ada sinkron ke Dapodik.

## 8. Fase 2 — Pengajuan izin, sakit, cuti, dinas luar, dan guru pengganti

### 8.1 Alur

Pola HRIS perusahaan §6.1–§6.2: atasan mengajukan dengan alasan, pemutus
menyetujui/menolak; jenis yang mengizinkan "urgent" langsung berlaku dan
pemutus menandai "Diketahui". Status tidak disimpan, diturunkan dari
keputusan append-only dengan sidik isi. Cloud tidak pernah menolak keputusan.

**Perbedaan dari perusahaan:**

- **Pemutus dibatasi unit** (A-5): pemutus hanya untuk personil yang unit
  utamanya sama dengan unit akun pemutus, kecuali `hr.scope.all`. Diperiksa
  di backend, kembar Rust ↔ TS.
- **Pemutus per jenis** (bawaan, bisa diubah): izin, sakit, dinas luar, cuti
  ≤ N hari → Kepala Sekolah / Kepala TU; cuti melahirkan, cuti di luar
  tanggungan, cuti > N hari → Yayasan.
- **Tidak untuk diri sendiri**: akun yang tertaut ke personil X tidak bisa
  memutus atau mengajukan urgent untuk X.

### 8.2 Jenis pengajuan

Master `hr_jenis_pengajuan` (kelompok tetap: Cuti, Izin, Sakit, Dinas Luar;
nama, pemutus, boleh urgent, potong jatah, dampak gaji, maks hari, wajib
dokumen). Bawaan mengikuti HRIS perusahaan §6.3, ditambah **Dinas Luar**
(lomba, KKG/MGMP, study tour, diklat) yang tidak memotong jatah dan dibayar.

### 8.3 Rentang dan jam (K-3)

- Pengajuan untuk **guru** mencatat tanggal mulai, tanggal selesai, dan
  opsional **"mulai jam ke-N"** di hari pertama dan **"sampai jam ke-M"** di
  hari terakhir. Untuk tendik cukup rentang tanggal, opsional setengah hari.
- Hari terpakai = hari dalam rentang yang wajib masuk menurut shift dan
  libur; libur sekolah tidak memotong jatah.
- Pengajuan bertumpuk ditolak di perangkat; yang lahir dari dua perangkat
  offline ditandai `bertumpuk`.
- Tanggal lewat boleh, ditolak bila periodenya sudah dibayar (run `PAID`).

### 8.4 Jatah cuti per kelompok (K-2)

Jatah tidak disimpan: hak periode + penyesuaian − hari terpakai. Pengaturan
**terpisah untuk guru dan tendik** di `setting_gex_system` (kunci berakhiran
`:guru` / `:tendik`): hak hari, periode (kalender / tahun ajaran / ulang
tahun kerja), syarat masa kerja, sisa (hangus/dibawa/diuangkan), maks dibawa.

Catatan untuk pemilik: untuk guru ASN, libur sekolah disamakan dengan cuti
tahunan (PP 11/2017, dicek ulang). Sekolah yang meniru aturan ini cukup
mengisi hak cuti guru 0 dan memakai jenis "Izin Dibayar" untuk keperluan
mendesak.

### 8.5 JP terdampak dan guru pengganti (K-3, K-3a)

Saat pengajuan guru **Menunggu atau Disetujui**, sistem menurunkan daftar JP
terdampak dari `jadwal_mengajar` (hari, `jam_ke`, rombel, mapel) dalam rentang
tanggal dan jamnya. Daftar ini tidak disimpan; yang disimpan hanya
**penanganannya**:

Tabel `hr_jp_penanganan` (append-only, id deterministik
`jp:<id_pengajuan>:<tanggal>:<jam_ke>:<id_rombel>`): status, guru pengganti,
catatan, operator.

| Status | Arti | Honor JP |
| :-- | :-- | :-- |
| **Diganti** | Guru X mengajar | ke X, karena X menyimpan presensi kelas atas namanya |
| **Tugas mandiri** | Siswa diberi tugas, tidak ada yang mengajar | tidak dibayar ke siapa pun |
| **Digabung** | Kelas digabung dengan kelas lain | ke guru kelas gabungan; `summarize_teaching` sudah menghitung jam gabungan sekali |
| (kosong) | Belum ditangani | muncul di "Jam kosong hari ini" dan "Perlu perhatian" |

- **Honor sudah benar tanpa kode gaji baru.** `presensi_mapel.id_guru`
  boleh guru siapa pun (`class_attendance.rs` tidak memeriksanya terhadap
  jadwal), dan honor JP dihitung dari kolom itu. Guru asli yang izin mulai
  jam ke-3 tetap dibayar untuk jam 1–2 yang ia simpan presensinya.
- Status penanganan **tidak menghalangi** persetujuan pengajuan (K-3a).
- Form presensi kelas: bila guru yang login adalah pengganti tercatat untuk
  JP itu, rombel dan mapel terisi otomatis.
- Pengganti tercatat tetapi presensi disimpan guru lain → tanda
  `pengganti_berbeda` untuk ditinjau, tidak menolak.
- Halaman **"Jam kosong hari ini"** untuk guru piket: JP terdampak hari ini
  yang belum berstatus, dengan tombol tunjuk pengganti. Pengganti yang
  sendiri sedang mengajar di jam itu diberi peringatan.

### 8.6 Dampak ke absensi (A-3)

Pola driver di HRIS perusahaan: pengajuan berlaku tidak menulis
`absensi_harian`. Generate Alfa melewati tanggal yang ditutupi pengajuan;
audit absensi tidak menilainya; laporan kehadiran menampilkan C, I, S, DL.
Izin "mulai jam ke-N" membuat hari itu tidak ditandai "tidak scan pulang".
Scan Hadir di hari cuti: Hadir menang, jatah tidak terpotong, ada tanda
"hadir saat cuti". Koreksi Admin Sakit/Izin/Dispen tetap berfungsi dan tidak
dimigrasi.

### 8.7 Dampak ke gaji (A-4)

Gaji pokok di sini adalah menit kerja × tarif per jam dari absensi gerbang.

- `Dibayar`: hari itu dibayar `jam_kerja_normal_menit` shift × tarif per jam.
  Honor JP **tidak** dibayar ke guru asli untuk JP yang tidak ia ajar (K-3).
- `Potong Gaji`: tidak ada menit yang dibayar; tidak ada rumus potongan baru
  karena gaji per jam memang hanya membayar menit tercatat.
- `Tidak Berpengaruh`: hanya menghapus Alfa.
- Komponen `PER_HADIR`: hari cuti/izin dibayar tidak dihitung hadir, kecuali
  Q-12 memutuskan lain.

## 9. Fase 3 — Beban mengajar dan cetak SK

### 9.1 Rekap beban mengajar

Per guru per semester, tanpa tabel baru:

- JP tatap muka per minggu dari `jadwal_mengajar` aktif (`is_aktif = 1`),
  dihitung sebagai gabungan jam (pola `summarize_teaching`).
- Ditambah ekuivalen JP tugas tambahan (§7.2).
- Dibandingkan dengan batas di Pengaturan (bawaan 24–40 JP per minggu, syarat
  tunjangan profesi, **dicek ulang**).
- Peringatan: kurang dari batas bawah, lebih dari batas atas, dan **mapel
  tidak sesuai bidang sertifikat pendidik**.
- Ekspor Excel per unit.

### 9.2 Cetak SK dan surat

Cetak A4 dari browser dengan kop `company_profile` (pola cetak yang sudah
ada; disembunyikan di Mobile bila tidak didukung):

| Dokumen | Sumber isi |
| :-- | :-- |
| SK Pembagian Tugas Mengajar (per semester, lampiran per guru) | `jadwal_mengajar` + `hr_tugas_tambahan` |
| SK Tugas Tambahan | `hr_tugas_tambahan` |
| SK Pengangkatan GTY/PTY | `hr_kontrak` |
| Surat Tugas (dinas luar) | pengajuan Dinas Luar yang disetujui |
| Surat Keterangan Aktif Bekerja/Mengajar | data kepegawaian + masa kerja |

Nomor surat diketik pengguna atau dari pola penomoran di Pengaturan (Q-13).
Penanda tangan bawaan: kepala sekolah unit itu (dari tugas tambahan), atau
ketua yayasan untuk SK yayasan.

## 10. Fase 4 — Surat peringatan dan pegawai keluar

Pola HRIS perusahaan §9 (SP1–SP3 dengan masa berlaku, eskalasi, cetak,
pencabutan `batal-<id>`; alasan keluar, usulan pesangon untuk GTY/PTY,
kompensasi PKWT untuk GTT/PTT). Pemutus SP3 dan pegawai keluar: Yayasan.

**Checklist keluar khusus sekolah** (dibaca dari modul yang ada):

- jadwal mengajar yang masih aktif atas namanya (harus dialihkan dulu);
- wali kelas rombel tahun ajaran berjalan;
- tugas tambahan yang masih berlaku;
- barang inventaris yang dipinjam;
- sisa kasbon;
- sisa cuti (diuangkan bila pengaturannya begitu);
- rapel `Menunggu` (dibayar di gaji terakhir);
- akun operator tertaut dinonaktifkan; kartu ID ditarik (centang manual).

Saat berlaku: `master_data.status_aktif = 'Nonaktif'`, `tanggal_selesai_aktif`,
`guru_data` ikut, akun dinonaktifkan, dalam satu transaksi. Gaji terakhir
memicu masa terakhir PPh 21 (Fase 0).

## 11. Fase 5 — Penilaian kinerja guru dan tendik

Pola HRIS perusahaan §11.1 (template per jabatan, aspek berbobot 1–5, nilai
akhir 0–100, predikat bisa disunting, final tidak bisa diubah kecuali dengan
penilaian koreksi). Penilai bawaan: kepala sekolah untuk guru, kepala TU untuk
tendik.

**Aspek otomatis khusus sekolah** (rumus ditampilkan ke penilai):

| Aspek | Sumber |
| :-- | :-- |
| Kehadiran dan keterlambatan | `absensi_harian` lewat `GATE_SUMMARY_SUBQUERY` |
| Keterisian presensi kelas | sesi `presensi_mapel` yang tersimpan ÷ JP terjadwal |
| Kelengkapan jurnal mengajar | `jurnal_mengajar` berparaf ÷ sesi presensi |
| JP yang ditinggalkan tanpa penanganan | `hr_jp_penanganan` kosong (Fase 2) |

Aspek manual: supervisi akademik (observasi kelas oleh kepala sekolah),
kompetensi pedagogik, kepribadian, sosial, profesional.

## 12. Fase 6 — Pengingat dan Telegram kepegawaian

Kartu "Perlu perhatian" di beranda HRIS dan beranda aplikasi, plus bidang
Telegram baru `kepegawaian` (A-6). Pengirimnya modul Telegram v66 apa adanya:
satu SQL sumber + fungsi pesan kembar + entri `bidang_kejadian`.

| Kejadian | Kapan |
| :-- | :-- |
| Kontrak GTT/PTT berakhir | H-30 dan H-7 |
| Masa percobaan berakhir | H-7 |
| Kenaikan gaji berkala (setiap N tahun masa kerja, diatur) | H-30 |
| Usia pensiun (bawaan 60 tahun, diatur) | H-90 |
| Dokumen/sertifikat kedaluwarsa | H-30 |
| SP berakhir | hari H |
| Pengajuan menunggu > 2 hari | ringkasan harian |
| JP terdampak belum ditangani hari ini | ringkasan pagi |
| SK pembagian tugas semester belum dibuat | awal semester |

Isi pesan: nama + jabatan + unit saja. NIK, gaji, alasan sakit, dan isi SP
tidak pernah dikirim. KGB yang disetujui ditindaklanjuti dengan
`salary_configs` baru; bila tanggal berlakunya sudah lewat, rapel yang ada
menangani selisihnya.

## 13. Fase 7 — Pelatihan (PKB) dan rekrutmen

**Pelatihan dan pengembangan keprofesian:** nama, penyelenggara (KKG, MGMP,
dinas, internal), tanggal, jumlah jam, biaya (INTEGER), peserta. Sertifikat
masuk Dokumen jenis Sertifikat Pelatihan. Rekap jam pelatihan per guru per
tahun.

**Rekrutmen**, input TU/HRD saja (pola HRIS perusahaan §11.2): lowongan per
unit dan jabatan; pelamar; tahap Lamaran → Seleksi Berkas → Wawancara →
**Microteaching** → Penawaran → Diterima/Ditolak. "Jadikan personil" membuat
`master_data` dengan token dan QR `id|token`, `guru_data` bila guru, dan
kontrak pertama. Retensi pelamar yang tidak diterima 12 bulan (UU PDP).

## 14. Fase 8 dan sesudahnya

Dikerjakan bila diminta, urutan diputuskan nanti:

- HRIS di Mobile untuk kepala sekolah dan TU, plus bagan struktur organisasi.
- Reimbursement.
- Lembur dengan SPL (tendik, satpam, kebersihan).
- Tukar jam mengajar antar guru.
- **Portal Guru** (K-5): guru mengajukan izin sendiri, melihat sisa cuti,
  slip gaji, dan jadwal. Preseden keamanannya portal wali (`wali_session`).
- Laporan PPh 21/BPJS dan berkas transfer gaji ke bank (pola fase 12 dan 14
  HRIS perusahaan).

## 15. Hak akses

### 15.1 Izin baru (usulan)

| Izin | Sensitif | Paket bawaan |
| :-- | :-- | :-- |
| `hr.org.manage` | | Yayasan, Kepegawaian |
| `hr.personal.view` / `.manage` | | Kepegawaian |
| `hr.finance.view` / `.manage` | ya (manage) | Kepegawaian |
| `hr.contract.manage` | | Yayasan, Kepegawaian |
| `hr.document.view` / `.manage` | | Kepegawaian |
| `hr.duty.manage` (tugas tambahan, SK) | | Yayasan, Kepala Sekolah |
| `hr.request.view` / `.submit` | | Kepala Sekolah, Kepala TU, Kepegawaian |
| `hr.request.urgent` | | Kepala Sekolah, Kepala TU |
| `hr.request.decide` | ya | Kepala Sekolah, Kepala TU |
| `hr.request.decide_major` (cuti panjang dan jenis bertanda Yayasan) | ya | Yayasan |
| `hr.substitute.manage` (tunjuk pengganti) | | Kepala Sekolah, Guru Piket, Kepegawaian |
| `hr.scope.all` (lintas unit) | ya | Yayasan |
| `hr.leave.adjust` | ya | — |
| `hr.warning.view` / `.manage` / `.cancel` (cancel sensitif) | | Kepala Sekolah, Yayasan |
| `hr.offboard.manage` | ya | Yayasan |
| `hr.performance.view` / `.assess` / `.config` | | Kepala Sekolah, Kepala TU |
| `hr.training.view` / `.manage`, `hr.recruit.view` / `.manage` | | Kepegawaian |

Izin sensitif masuk `SENSITIVE_MUTATION_PERMISSIONS` dan `NOT IN` seed Admin
Rust. Role bawaan baru: **Yayasan**, **Kepala Sekolah**, **Kepala TU**,
**Kepegawaian**, **Guru Piket**; bisa diubah Superadmin. Sebelum menjaga
halaman dengan area baru, periksa `DEFAULT_ROLE_PERMISSIONS` supaya role lama
tidak terkunci.

### 15.2 Cakupan unit (A-5)

- Berlaku untuk **memutus**, **mengajukan urgent**, dan **menunjuk
  pengganti**. Melihat daftar tetap menurut izin biasa.
- Unit akun = `master_data.unit` personil yang tertaut (A-2), dibandingkan
  sebagai nama (normalisasi trim + huruf kecil).
- Akun tanpa tautan atau personil tanpa unit: hanya `hr.scope.all` yang bisa
  memutus.
- Diperiksa di backend (Rust dan TS kembar), dari sesi, bukan dari payload.

## 16. Pertanyaan lintas fase

| No | Pertanyaan | Usulan |
| :-- | :-- | :-- |
| Q-11 | HRIS bagian dari produk yang sama atau modul berlisensi terpisah? | Bagian produk yang sama; gerbang lisensi yang ada otomatis berlaku untuk izin HRIS |
| Q-12 | Hari izin/cuti dibayar dihitung hadir untuk komponen `PER_HADIR` (uang makan/transport)? | Tidak; uang hadir untuk yang benar-benar hadir |
| Q-13 | Nomor SK: diketik manual atau pola otomatis per unit per tahun? | Pola otomatis yang bisa diubah sebelum cetak |
| Q-14 | Guru yang mengajar di dua unit: siapa yang memutus izinnya? | Kepala unit utamanya; JP terdampak di unit lain tetap tampil di "Jam kosong" unit itu |
| Q-15 | Sekolah negeri tanpa yayasan: siapa memegang `hr.request.decide_major` dan `hr.offboard.manage`? | Kepala Sekolah (diatur lewat role, tanpa kode khusus) |

## 17. Sinkronisasi dan skema

Aturan umum untuk semua fase (sama dengan HRIS perusahaan §12):

- Setiap tabel baru menyentuh keempat lapisan dalam satu perubahan;
  `SNAPSHOT_SOURCES` ↔ `SNAPSHOT_TABLES` identik. Pengecualian cloud-only:
  `hr_profil`.
- Setiap fase menaikkan versi skema (Fase 0 = v67, sentinel mulai `-2043`).
- Tanpa `UNIQUE` di kolom bisnis; riwayat append-only dengan status
  diturunkan; pembatalan berid `batal-<id>`; tabel yang barisnya tidak pernah
  dihapus memakai `delete_missing: false`.
- Berkas (dokumen, CV) di luar snapshot, didorong per berkas.
- Handler cloud menimpa kolom hanya bila payload membawa kuncinya.
- Seluruh tabel HRIS ikut `PROMOTION_PLAN` dan dibuang saat pindah database.

Usulan tabel per fase:

| Fase | Tabel |
| :-- | :-- |
| 0 | tanpa tabel (kolom `payroll_components.dasar_bpjs` bila Q-3 (a)) |
| 1 | `hr_bagian`, `hr_bagian_nama`, `hr_jabatan`, `hr_tugas_jenis`, `hr_tugas_tambahan`, `hr_profil` (cloud-only), `hr_pendidikan`, `hr_sertifikasi`, `hr_kontrak`, `hr_dokumen_jenis`, `hr_dokumen`, `hr_dokumen_berkas` (luar snapshot); kolom `master_data.id_bagian/id_jabatan/id_atasan/tmt`, `master_operator.id_karyawan` |
| 2 | `hr_jenis_pengajuan`, `hr_pengajuan`, `hr_pengajuan_keputusan`, `hr_cuti_penyesuaian`, `hr_jp_penanganan`, `hr_pengajuan_berkas` (luar snapshot) |
| 3 | tanpa tabel (penomoran SK di `setting_gex_system`) |
| 4 | `hr_sp`, `hr_keluar`, `hr_keluar_alasan`, `hr_pesangon_pengali` |
| 5 | `hr_kinerja_template`, `hr_kinerja_aspek`, `hr_kinerja_penilaian`, `hr_kinerja_nilai` |
| 6 | tanpa tabel (Telegram v66) |
| 7 | `hr_pelatihan`, `hr_pelatihan_peserta`, `hr_lowongan`, `hr_pelamar`, `hr_pelamar_tahap` |

## 18. Di luar cakupan

- Portal Guru (K-5) dan formulir lamaran publik.
- Sinkron ke Dapodik, Info GTK, SIMPKB, BPJS online, e-Bupot.
- Tunjangan profesi guru (dibayar pemerintah); aplikasi hanya merekap syarat
  JP-nya.
- Penilaian kinerja ASN di Platform Merdeka Mengajar.
- Upah cuti melahirkan bertingkat UU KIA secara otomatis.

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

## 20. Urutan pengerjaan Fase 2

Ditulis setelah menelusuri kode sekolah (14 Nov 2026) sesudah Fase 1
lengkap, dengan Fase 2–3 perusahaan (§6, §17, §18.6 di
`C:\dev\absensi-perusahaan\prd-hris.md`) sebagai rujukan pola: sidik isi,
keputusan append-only, urgent/"Diketahui", `PENGAJUAN_BERLAKU_SQL`,
`cuti_dibayar`, jatah diturunkan. Aturan dan vektornya dipakai ulang, kodenya
tidak disalin. Bila §8 dan bagian ini berbeda, **bagian ini yang berlaku**
setelah Q-40 sampai Q-58 dijawab. Belum ada kode yang diubah.

### 20.1 Temuan dari kode

Diverifikasi ke kode sekolah (baris per 14 Nov 2026).

**Salah atau perlu diubah:**

1. **Guru yang login dicocokkan lewat tebakan.** Presensi kelas memilih
   "guru saya" dengan `g.id_guru === user.id || g.id_guru ===
   user.kode_operator` (`web-desktop/src/app/presensi-kelas/page.tsx:249-258`,
   `mobile/src/app/presensi-kelas/page.tsx:245-252`). `user.id` adalah id
   angka `master_operator`, jadi yang cocok hanya akun yang kode operatornya
   kebetulan sama dengan id guru. Isi otomatis pengganti (§8.5) butuh
   `id_karyawan` sesi (A-2), dan pencocokan ini ikut beralih ke sana.
2. **`id_karyawan` belum ada di sesi mana pun.** Rust `OperatorUser`
   (`desktop/models.rs:6-42`) diisi `turso.rs:6277` saat login dan
   `reload_operator` (`turso.rs:6304`) saat revisi RBAC berubah; struct ini
   juga isi vault luring (`OfflineCredential.operator`, `models.rs:47-56`).
   Web `readSessionRecord` (`lib/auth/session-store.ts:57-120`) tidak membaca
   `m.id_karyawan`; tipe `OperatorUser` di `lib/auth/operator-user.ts:3`.
3. **Daftar jadwal per tanggal tidak menyaring tahun ajaran.**
   `list_teaching_schedules` (`academic.rs:1337-1366`) ↔
   `services/academic/schedule.ts:219-247` menurunkan hari dari `tanggal`,
   tetapi tidak memilih tahun ajaran yang semesternya memuat tanggal itu, dan
   tidak ada yang menonaktifkan jadwal semester lama (tidak ada `UPDATE
   jadwal_mengajar SET is_aktif` di kode mana pun). Usulan "Sesi sekarang
   menurut jadwal" di presensi kelas bisa memakai baris semester lalu. JP
   terdampak (§8.5) wajib memakai jadwal semester yang memuat tanggalnya
   (`akademik_tahun_ajaran.tanggal_mulai/selesai`, `storage.rs:1686-1695`).
4. **`jadwal_mengajar.jam_ke` boleh rentang** (`"3-4"`, `normalize_jam_ke`
   `class_attendance.rs:677`, `jam_ke_range` `:735`). Satu baris jadwal bisa
   terdampak sebagian ("izin mulai jam ke-4" atas baris `3-4`). JP terdampak
   dinilai per baris jadwal yang rentangnya beririsan (Q-46).
5. **Hari tanpa scan pulang bernilai 0 menit.** `recalculate_from_clock`
   (`time_policy.rs:277-300`) tanpa durasi tidak menghasilkan jam kerja, dan
   rekap gaji hanya menjumlah `ah.jam_kerja` (`payroll-recap.ts:377` ↔
   `payroll/commands.rs:1632` dst.). Guru yang izin "mulai jam ke-3" lalu
   pulang tanpa scan kehilangan upah jam 1–2 dari gerbang; honor JP-nya tetap
   aman karena dari presensi kelas.
6. **TER harian pegawai tidak tetap memakai `total_hadir`**
   (`validations/pajak.ts:418-430` ↔ `payroll/pajak.rs`, dipanggil
   `payroll-recap.ts:569` dan `payroll/commands.rs:1822`, `:2065`). Hari cuti
   dibayar yang menambah bruto tanpa menambah `hari` menaikkan bruto harian,
   sehingga pajaknya naik. Q-12 (`PER_HADIR`) ternyata juga menyentuh pajak
   (Q-41).
7. **Presensi kelas menerima `id_guru` dari payload**
   (`save_class_attendance`, `class_attendance.rs:1152`; Web
   `services/class-attendance.ts`). Tidak salah untuk §8.5 (pengganti memang
   boleh siapa pun), tetapi berarti honor JP mengikuti apa pun yang dipilih di
   form. Tanda `pengganti_berbeda` hanya pemantau, bukan pengaman.

**Sudah ada, dipakai ulang (tidak dibuat dua kali):**

- **Generate Alfa** satu titik lewati per orang per tanggal, kembar:
  `generate_alfa_harian` (`operational.rs:2475`, cek baris yang ada `:2790`)
  ↔ `generateAlfaHarian` (`services/alfa-audit.ts:82`, cek `:337-349`).
  Pengajuan berlaku menjadi satu syarat lewati lagi di titik yang sama.
- **Audit kualitas absensi**: `get_attendance_audit` (`operational.rs:3080`,
  "Tanpa Data Absensi"/"Belum Scan Masuk"/"Belum Scan Pulang" `:3420-3480`) ↔
  `auditKualitasAbsensi` (`services/attendance-audit.ts:125`).
- **Laporan kehadiran**: backend hanya mengirim data mentah (`hari`, `libur`,
  `whitelist`; `report.ts:340-405` ↔ `laporan_kehadiran`
  `administration.rs:2451`), matriks dan kode disusun SEKALI di TS
  `susunLaporanKehadiran` (`validations/laporan-kehadiran.ts:150`), dipakai
  ketiga build. Kode C dan DL cukup di TS (pola perusahaan §17.12); backend
  menambah kunci data `pengajuan`.
- **Hari wajib**: `wajibMasuk` ↔ `wajib_masuk` (`validations/hari-kerja.ts`
  ↔ `desktop/hari_kerja.rs`) + `evaluateHolidayScan` + Hari Sekolah unit.
- **Rekap gaji satu baris agregat per orang** dipakai pratinjau DAN pembekuan:
  `desktop_get_payroll_recap` (`payroll/commands.rs:1579`), dipanggil ulang
  oleh pembekuan (`:1961`); Web `computePayrollRecap`
  (`services/payroll-recap.ts:320`). Kait kasbon, rapel, `STATUS_KINI_SQL`,
  `TUGAS_BERLAKU_SQL` sudah memakai pola "satu loader di `Promise.all` / satu
  fungsi di Rust" (`payroll-recap.ts:325-454`, `commands.rs:1599-1616`).
  `cuti_dibayar` menempel di sana.
- **Honor JP sudah mengikuti `presensi_mapel.id_guru`** dengan jurnal berparaf
  (`loadTaughtSessions` `payroll-recap.ts:142-181` ↔ `load_taught_sessions`
  `commands.rs:605`), dan `summarizeTeaching` menghitung jam gabungan sekali.
  K-3 terpenuhi tanpa kode gaji baru, seperti diduga §8.5.
- **Irisan jam pelajaran**: `jam_ke_range`, `jam_ke_overlaps_public`
  (`class_attendance.rs:731-751`), `rentangJamKe` (TS).
- **Sesi bentrok presensi**: `find_overlapping_session`
  (`class_attendance.rs:775`) menolak dua sesi rombel yang sama di jam yang
  beririsan. Pengganti tidak bisa menyimpan dobel dengan guru asli.
- **Berkas cloud-only**: `urai_berkas_dokumen`/`validasi_dokumen`
  (`hris_cloud.rs`) ↔ `validations/hris.ts`, 1 MB × 5, tanda tangan bita;
  `siapkanBerkas(file, maksByte)` di layar.
- `STATUS_KINI_SQL`, `new_id` (`hris.rs`, `pub(crate)`),
  `assert_unique_value`, `sync::enqueue`, penyimpan setting lewat outbox
  `setting` (pola `desktop_hr_settings_save`), `PilihCari`,
  `KonfirmasiSimpan`, `Modal`.
- Status run gaji `REVIEWED/APPROVED/PAID/REJECTED` (Telegram v66) untuk
  `PERIODE_DIBAYAR_SQL`.

**Kait:**

- Versi: `CURRENT_SCHEMA_VERSION` 68 dan `REQUIRED_TABLE_COUNT` 116
  (`db-schema.ts:5-6`), `CLIENT_SCHEMA_VERSION` 68 (`sync.rs:23`), sentinel
  terakhir `-2044` `hris-org-v1` (`turso.rs:5225`, pemeriksa `:5614`, daftar
  `DELETE … version IN` di tes sentinel `turso.rs:18059` dst.).
- Snapshot: 76 `SnapshotTable` (`sync.rs:81`) = 76 `SnapshotSource`
  (`turso.rs:884`); `CANONICAL_SYNC_ROUTES` 140 (`sync.rs:1721`);
  `APPEND_ONLY_TABLES` 12 (`sync.rs:1888`).
- Command terdaftar: Desktop 394 (`lib.rs`), Mobile 399 (tanpa atribut
  `mobile_entry_point`).
- RBAC: `SENSITIVE_MUTATION_PERMISSIONS` dan `CONFIDENTIAL_PERMISSIONS`
  (`rbac/catalog.ts:504-612`), `SYSTEM_ROLE_KEYS` (`:614`),
  `DEFAULT_ROLE_PERMISSIONS` (`:627-692`); `AppArea` dan cabang khusus
  `kepegawaian`/`operational` (`auth/access.ts:3-110`).
- Pengaturan HRIS `desktop_hr_settings_save` (1b) untuk angka; aturan cuti
  bercampur teks dan angka, jadi command sendiri (pola perusahaan §17.12).

### 20.2 Rancangan per bagian

#### 20.2.1 Alur dan keputusan append-only (§8.1)

```
Atasan / TU ──ajukan + alasan──▶ Menunggu ──Pemutus──▶ Disetujui / Ditolak
Urgent (jenis mengizinkan): ajukan + ACC sekaligus ─▶ Disetujui (urgent) ─Pemutus─▶ Diketahui
```

- **Pengaju** = pemegang `hr.request.submit`, untuk pegawai mana pun (bukan
  siswa). Tidak dibatasi unit (§15.2: hanya memutus, urgent, dan menunjuk
  pengganti yang berlingkup).
- **`hr_pengajuan`** menyimpan isi + `sidik` (SHA-256 isi kanonik dipisah
  `\u001f`, kembar `sidik_pengajuan` ↔ `sidikPengajuan`): `id_karyawan`,
  `id_jenis`, `kelompok`, `potong_jatah`, `dampak_gaji`, `izin_pemutus`,
  `tanggal_mulai`, `tanggal_selesai`, `jam_mulai_ke`, `jam_sampai_ke`,
  `setengah_hari`, `alasan`. Salinan jenis saat diajukan, jadi menyunting
  jenis tidak mengubah pengajuan lama.
- **`hr_pengajuan_keputusan`** append-only: `Setujui`, `Tolak`, `Setujui
  Urgent`, `Diketahui`, `Batal`, masing-masing membawa sidik yang dilihat.
  Id tetap untuk keputusan tunggal (`urgent-<id>`, `tahu-<id>`,
  `batal-<id>`); `Setujui`/`Tolak` acak supaya keputusan ganda terlihat.
  `diterima_cloud` diisi jam database cloud saat INSERT; kosong di perangkat
  sampai tertarik.
- **Status diturunkan** (`status_pengajuan` ↔ `statusPengajuan`): ada `Batal`
  → Dibatalkan; keputusan final pertama bersidik sama dengan isi sekarang,
  diurutkan `diterima_cloud IS NULL, diterima_cloud, waktu_perangkat,
  id_keputusan` → Ditolak / Disetujui / Disetujui (urgent); selain itu
  Menunggu. Suntingan sesudah keputusan menggugurkannya.
- **Cloud tidak pernah menolak keputusan.** Handler memakai `ON CONFLICT DO
  NOTHING`; keputusan berbeda dari dua perangkat menjadi tanda
  `keputusan_ganda`, yang pertama sampai di cloud yang berlaku.
- **Pengajuan berlaku** = Disetujui atau Disetujui (urgent), satu potongan SQL
  kembar `PENGAJUAN_BERLAKU_SQL` (predikat atas alias `p`, teks diperiksa
  harfiah seperti `RUN_TAHUN_SQL`), dipakai SEMUA pembaca. Turunannya:
  `PENGAJUAN_RENTANG_SQL` (`?1..?2` → karyawan, tanggal, kelompok, dampak,
  potong jatah, jam ke, setengah hari).
- **Batal**: Menunggu → pengaju (atau Superadmin); berlaku → pemutus jenis
  itu dalam cakupannya, alasan wajib.
- **Tanda** (`tanda_pengajuan` ↔ `tandaPengajuan`, tidak pernah menolak):
  `perlu_diketahui`, `keputusan_ganda`, `keputusan_gugur`, `diputus_sendiri`
  (Q-57), `bertumpuk`, `hadir_saat_cuti`, `di_luar_cakupan` (keputusan yang
  sampai di cloud dari pemutus di luar unit, mis. unit pegawai berubah
  sesudahnya).

#### 20.2.2 Jenis pengajuan (§8.2)

Master `hr_jenis_pengajuan`, disunting di `/kepegawaian` → Organisasi
(`hr.org.manage`):

| Kolom | Arti |
| :-- | :-- |
| `kelompok` | `Cuti`, `Izin`, `Sakit`, `Dinas Luar` (tetap; menentukan isian form dan kode laporan C/I/S/DL) |
| `nama` | bisa diganti |
| `izin_pemutus` | `hr.request.decide` (Kepala Sekolah / Kepala TU) atau `hr.request.decide_major` (Yayasan) (Q-44) |
| `boleh_urgent`, `potong_jatah` (hanya Cuti), `wajib_dokumen` | 0/1 |
| `dampak_gaji` | `Dibayar`, `Potong Gaji`, `Tidak Berpengaruh` |
| `maks_hari` + `satuan_maks` | batas per pengajuan, `Hari Kerja` atau `Hari Kalender` |

Bawaan (`validations/hr-jenis-bawaan.json`, `include_str!` di Rust, import di
TS, `INSERT OR IGNORE` berid tetap di ketiga lapis; **dicek ulang pemilik**,
Q-54):

| Id | Nama | Kelompok | Potong jatah | Gaji | Urgent | Maks | Pemutus |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| `jns-cuti-tahunan` | Cuti Tahunan | Cuti | ya | Dibayar | tidak | — | decide |
| `jns-cuti-menikah` | Cuti Menikah | Cuti | tidak | Dibayar | tidak | 3 | decide |
| `jns-cuti-duka` | Duka keluarga inti | Cuti | tidak | Dibayar | ya | 2 | decide |
| `jns-cuti-istri-melahirkan` | Istri melahirkan / keguguran | Cuti | tidak | Dibayar | ya | 2 | decide |
| `jns-cuti-melahirkan` | Cuti Melahirkan | Cuti | tidak | Dibayar | tidak | 90 kalender | major |
| `jns-cuti-luar-tanggungan` | Cuti di Luar Tanggungan | Cuti | tidak | Potong Gaji | tidak | — | major |
| `jns-izin-dibayar` | Izin Dibayar | Izin | tidak | Dibayar | ya | — | decide |
| `jns-izin-tidak-dibayar` | Izin Tidak Dibayar | Izin | tidak | Potong Gaji | ya | — | decide |
| `jns-sakit` | Sakit | Sakit | tidak | Dibayar | ya | — | decide (wajib dokumen) |
| `jns-dinas-luar` | Dinas Luar (lomba, KKG/MGMP, study tour, diklat) | Dinas Luar | tidak | Dibayar | ya | — | decide |

#### 20.2.3 Rentang dan jam (§8.3, K-3)

- **Guru** (personil yang punya `guru_data`, sama dengan Q-24): tanggal mulai
  dan selesai, ditambah opsional `jam_mulai_ke` (hari pertama) dan
  `jam_sampai_ke` (hari terakhir), hanya untuk Izin, Sakit, dan Dinas Luar
  (Q-45). Cuti selalu hari penuh. Nomornya nomor JP bel unit
  (`akademik_jam_pelajaran`), 1 sampai batas `jp_max_for_unit`.
- **Tendik**: rentang tanggal; `setengah_hari` hanya Izin satu tanggal.
- **Hari terpakai** = tanggal dalam rentang yang `wajib_masuk` untuk orang
  itu (shift `master_data.id_shift` kini, `tbl_hari_libur`, whitelist), fungsi
  `tanggal_wajib` ↔ `tanggalWajib`. Libur sekolah tidak memotong jatah.
  Riwayat shift tidak ada, jadi pengajuan lama mengikuti shift kini.
- **Bertumpuk** dengan pengajuan Menunggu/berlaku orang yang sama ditolak di
  perangkat dan Web (`bentrok_pengajuan` ↔ `bentrokPengajuan`); dua jam-ke
  di tanggal yang sama boleh bila tidak beririsan (izin pagi, dinas siang).
  Yang lahir dari dua perangkat luring menjadi tanda `bertumpuk`.
- **Tanggal lewat** boleh; ditolak bila ada run gaji `PAID` yang periodenya
  menyentuh rentang (`PERIODE_DIBAYAR_SQL`, Q-52). Run bukan `PAID` dan bukan
  `REJECTED` yang menyentuh rentang memberi peringatan "proses gaji periode
  ini perlu dibuat ulang", tidak menolak.
- Rentang ≤ 366 hari; alasan 1–500 karakter; `maks_hari` dibanding hari kerja
  atau hari kalender menurut `satuan_maks`.

#### 20.2.4 Jatah cuti per kelompok guru/tendik (§8.4, K-2)

Tidak disimpan. `jatah_cuti(...)` ↔ `jatahCuti` murni, vektor yang sama;
datanya dikumpulkan satu fungsi baca per jalur.

```
sisa = hak periode + dibawa + penyesuaian − hari terpakai pengajuan Cuti
       ber-potong_jatah yang berlaku, dikurangi tanggal yang ada scan Hadir
```

Pengaturan per kelompok di `setting_gex_system`, kunci berakhiran `:guru`
atau `:tendik` (kosong = bawaan), lewat command aturan cuti
(`hr.org.manage`), outbox `setting`:

| Kunci | Pilihan | Bawaan |
| :-- | :-- | :-- |
| `hr_cuti_hak:<k>` | 0–60 hari | guru 12, tendik 12 (Q-47) |
| `hr_cuti_periode:<k>` | `tahunan` / `ulang_tahun_kerja` | `tahunan` |
| `hr_cuti_bulan_awal:<k>` | 1–12 (1 = kalender, 7 = tahun ajaran Juli) | guru 7, tendik 1 |
| `hr_cuti_syarat_bulan:<k>` | 0–24 bulan masa kerja dari TMT | 12 |
| `hr_cuti_sisa:<k>` | `hangus` / `dibawa` | `hangus` |
| `hr_cuti_bawa_maks:<k>` | 0–60 | 6 |
| `hr_cuti_bawa_bulan:<k>` | 1–12 | 3 |

- **Kelompok**: guru = punya `guru_data`; selain itu tendik.
- **Tanggal mulai** = TMT (`master_data.tanggal_mulai_aktif`, Q-20); kosong =
  tanpa hak, tanda `tanpa_tmt`. Tanggal berhak = TMT + syarat bulan (akhir
  bulan dijepit, `tambah_bulan` Fase 1).
- **Dibawa** diturunkan tanpa baris (pola perusahaan Q-50): bawaan = min(maks
  (sisa periode sebelumnya, 0), `bawa_maks`), dipakai lebih dulu dalam
  `bawa_bulan` bulan pertama periode, sisanya hangus.
- **Penyesuaian** `hr_cuti_penyesuaian` append-only (`Saldo Awal`, `Koreksi`,
  `Pembatalan` berid `batal-<id>`), izin `hr.leave.adjust`. Saldo awal saat
  mulai memakai aplikasi dicatat lewat ini.
- **Sisa minus boleh** (pemutus menyetujui melebihi jatah), tampil peringatan
  `jatah_minus`. Form pengajuan menampilkan hari terpakai dan sisa sebelum
  disimpan.
- **Diuangkan dan prorata tidak dikerjakan** (Q-47): diuangkan butuh jalur
  pembayaran di gaji; syarat bulan sudah menutup kebutuhan pegawai baru.
- Ganti periode berlaku langsung untuk semua periode, dengan konfirmasi
  (perusahaan Q-54).

#### 20.2.5 JP terdampak dan `hr_jp_penanganan` (§8.5, K-3, K-3a)

- **JP terdampak diturunkan, tidak disimpan** (`JP_TERDAMPAK_SQL` + fungsi
  murni `jp_terdampak` ↔ `jpTerdampak`): untuk pengajuan guru yang
  **Menunggu atau berlaku**, setiap tanggal dalam rentang yang bukan
  `tbl_hari_libur` aktif, setiap baris `jadwal_mengajar` aktif milik guru itu
  pada hari tersebut **dari tahun ajaran yang semesternya memuat tanggal itu**
  (temuan 3), yang rentang `jam_ke`-nya beririsan dengan jam pengajuan (hari
  pertama dari `jam_mulai_ke`, hari terakhir sampai `jam_sampai_ke`, hari
  tengah penuh; temuan 4). Pengajuan Ditolak/Dibatalkan tidak menghasilkan JP
  terdampak; penanganan yang sudah dicatat tetap tersimpan tetapi tidak
  tampil.
- **`hr_jp_penanganan`** berid deterministik
  `jp:<id_pengajuan>:<tanggal>:<id_jadwal>` (Q-48: `id_jadwal`, bukan
  `jam_ke`+rombel, karena satu baris jadwal = satu JP terdampak), **upsert**
  (bukan append-only): `status` CHECK IN (`Diganti`, `Tugas Mandiri`,
  `Digabung`), `id_guru_pengganti` (wajib untuk Diganti dan Digabung),
  salinan `id_rombel`, `id_mapel`, `jam_ke` saat ditangani, `catatan`,
  `dicatat_oleh` (sesi), `waktu_perangkat`. Mengganti pengganti = menimpa
  baris; cloud menyimpan yang terakhir tiba.
- **Honor tanpa kode gaji baru**: Diganti → ke guru yang menyimpan presensi
  atas namanya; Tugas Mandiri → tidak dibayar ke siapa pun; Digabung → ke guru
  kelas gabungan, jam gabungan dihitung sekali oleh `summarizeTeaching`.
- **Tidak menghalangi persetujuan** (K-3a). JP tanpa status tampil di "Jam
  kosong hari ini" dan hitungan "Belum ditangani" pengajuan itu.
- **Tanda** (tidak menolak): `pengganti_berbeda` (presensi rombel itu di
  tanggal dan jam yang beririsan disimpan `id_guru` lain dari pengganti
  tercatat), `pengganti_bentrok` (pengganti punya jadwal atau JP pengganti
  lain di jam yang beririsan; ditampilkan sebagai peringatan sebelum simpan).
- **Isi otomatis di presensi kelas** (Web/Desktop dan Mobile): pencocokan
  "guru saya" pindah ke `user.idKaryawan` (temuan 1; tebakan lama tetap sebagai
  cadangan untuk akun tak tertaut). Usulan sesi sekarang menggabungkan jadwal
  sendiri (kini disaring semester, temuan 3) dengan JP yang ia gantikan hari
  ini (`Diganti`/`Digabung` atas namanya); memilih usulan pengganti mengisi
  rombel, mapel, jam, dan guru = dirinya.
- **"Jam kosong hari ini"** (guru piket): JP terdampak hari ini (WIB) dalam
  cakupan unit rombel (Q-42), berstatus atau belum, dengan tombol Tunjuk
  pengganti / Tugas mandiri / Digabung, saringan "Belum ditangani". Data
  tersinkron, jadi jalan luring di perangkat.

#### 20.2.6 Dampak ke absensi (§8.6, A-3)

Pengajuan berlaku **tidak menulis** `absensi_harian`. Semua pembaca memakai
`PENGAJUAN_RENTANG_SQL`:

- **Generate Alfa** (`operational.rs:2790` ↔ `alfa-audit.ts:337`): orang dengan
  pengajuan berlaku di tanggal itu dilewati, termasuk hari sebagian (jam ke-N
  / setengah hari); hitungan baru `jumlahPengajuan` di pesan ringkasan.
- **Audit kualitas**: "Tanpa Data Absensi"/"Belum Scan Masuk" tidak dinilai
  di tanggal yang ditutup pengajuan hari penuh; "Belum Scan Pulang" tidak
  dinilai di hari sebagian (§8.6); kategori info baru "Pengajuan" untuk
  hitungan.
- **Laporan kehadiran**: kunci data baru `pengajuan` (`report.ts` ↔
  `administration.rs`, satu SQL kembar). `susunLaporanKehadiran` mendapat kode
  **C** (Cuti) dan **DL** (Dinas Luar), dan I/S ikut dari pengajuan. Urutan:
  H/T > pengajuan > S/I/D Koreksi Admin > A > L/M/-. Kode pengajuan hanya di
  tanggal wajib atau yang punya catatan. Total baru `cuti` dan `dinas`; DL
  dihitung hari wajib dan **ikut persen hadir** (bekerja di luar sekolah,
  perusahaan §18.6). Ekspor Excel + kolom Cuti dan DL.
- **Scan Hadir di hari cuti**: Hadir menang, jatah tidak terpotong, tanda
  `hadir_saat_cuti`.
- **Baris Alfa lama** (sakit diajukan sesudah Alfa dibuat) tetap di
  `absensi_harian`; pembaca memenangkan pengajuan. Gaji tidak membaca Alfa.
- **Koreksi Admin** Sakit/Izin/Dispen tetap berfungsi, tidak dimigrasi. Form
  koreksi (Web/Desktop dan Mobile) memberi catatan "Untuk catatan baru, pakai
  Pengajuan di menu Cuti & Izin."
- **Tidak diubah**: dasbor kehadiran (`REKAP_PER_TANGGAL_SQL`), leger
  kehadiran siswa, notifikasi ambang Alfa siswa (pengajuan hanya untuk
  pegawai).

#### 20.2.7 Dampak ke gaji (§8.7, A-4)

`cuti_dibayar(conn, mulai, akhir)` ↔ `cutiDibayar` mengembalikan per orang
`{ hari, menit }` dari pengajuan berlaku ber-`dampak_gaji = 'Dibayar'`, atas
tanggal wajib dalam periode (satu tanggal dihitung sekali walau bertumpuk);
aturan per tanggal murni `menit_cuti_dibayar` ↔ `menitCutiDibayar`, vektor
yang sama:

| | Tanpa scan Hadir | Ada scan Hadir |
| :-- | :-- | :-- |
| **Hari penuh** | + `jam_kerja_normal_menit` shift kini, +1 hari | 0 (Hadir menang) |
| **Hari sebagian** (jam ke-N, setengah hari) | + `jam_kerja_normal_menit` | + max(0, normal − `jam_kerja` tercatat) (Q-46) |

- Dikaitkan di baris agregat rekap (Rust `desktop_get_payroll_recap`, dipakai
  pratinjau dan pembekuan; TS `computePayrollRecap`): menit reguler `+=
  menit` sebelum `apply_overtime_policy`, sebagai jam hari biasa (tanggal
  wajib tidak pernah tanggal libur). `breakdown_snapshot.cuti_dibayar = {
  hari, menit }` untuk slip; run lama tidak dihitung ulang.
- **Honor JP**: tidak ada kait (K-3). Guru asli tidak dibayar JP yang tidak
  ia simpan presensinya.
- **`PER_HADIR`** (Q-12, Q-41): hari cuti dibayar **tidak** dihitung hadir.
- **TER harian tidak tetap** (temuan 6, Q-41): `hari` pajak = hadir + `hari`
  cuti dibayar, supaya bruto per hari tidak naik karena cuti.
- **`Potong Gaji` dan `Tidak Berpengaruh`**: tanpa kait; menit yang tidak
  tercatat memang tidak dibayar (gaji per jam).
- Shift ber-jam normal 0 → 0 menit dan tanda `jam_normal_nol` di rekap.

#### 20.2.8 Cakupan unit (A-5, §15.2)

- **Unit akun** = `LOWER(TRIM(master_data.unit))` personil yang tertaut ke
  sesi (`id_karyawan`, A-2), dibaca dari database lokal (tersinkron), jadi
  berlaku juga luring. **Unit pegawai** = `master_data.unit` pegawai
  pengajuan. **Unit JP** = nama `akademik_unit` dari `akademik_rombel.id_unit`
  rombel itu.
- **Berlaku untuk**: memutus (Setujui/Tolak/Diketahui/Batal pengajuan
  berlaku) dan urgent → unit pegawai; menunjuk pengganti → unit JP (Q-42).
  Melihat daftar dan mengajukan biasa tidak dibatasi.
- **Lolos** bila sesi memegang `hr.scope.all`, atau unit akun tidak kosong
  dan sama dengan unit sasaran. Akun tanpa tautan, personil tanpa unit, atau
  rombel tanpa unit: hanya `hr.scope.all` (Q-42).
- Satu fungsi murni `dalam_cakupan` ↔ `dalamCakupan`, vektor yang sama;
  dipanggil backend dari sesi, tidak pernah dari payload. Cloud tidak menilai
  ulang (tidak pernah menolak); keputusan di luar cakupan yang tiba di cloud
  menjadi tanda `di_luar_cakupan`.

#### 20.2.9 Tidak untuk diri sendiri

- Akun yang `id_karyawan`-nya = pegawai pengajuan **tidak boleh** Setujui
  Urgent, Setujui, Tolak, Diketahui, atau membatalkan pengajuan berlaku untuk
  dirinya. Berlaku juga untuk Superadmin. Pengajuan biasa untuk diri sendiri
  boleh dan tetap menunggu pemutus lain.
- Pengaju yang memutus pengajuan yang ia ajukan **untuk orang lain** boleh,
  ditandai `diputus_sendiri` untuk ditinjau (Q-57).
- Menunjuk pengganti untuk JP dirinya sendiri juga ditolak (guru piket yang
  sedang izin).

#### 20.2.10 `id_karyawan` di sesi

- Rust: `OperatorUser.id_karyawan: Option<String>` dengan `#[serde(default)]`
  (vault luring lama tetap terbaca → `None`), diisi `turso.rs` saat login dan
  `reload_operator`. Web: `readSessionRecord` membaca `m.id_karyawan`, tipe
  `OperatorUser.idKaryawan`. Klien (`AuthContext`) ikut membawanya.
- Mengubah tautan di form operator menaikkan `rbac_revision` (pola
  `update_role`), sehingga sesi Desktop/Mobile memuat ulang tanpa logout
  (Q-53). Vault luring lama tanpa `id_karyawan` = akun tak tertaut sampai
  login daring berikutnya.

### 20.3 Model data dan sinkronisasi

**Usulan: skema v69, sentinel `-2045` `hris-pengajuan-v1`. Seluruh DDL Fase 2
ditulis di langkah pertama (sub-fase 2a)**, alasan yang sama dengan §19.3.

**Tersinkron** (keempat lapis: `storage.rs` Desktop + Mobile (tangan),
`turso.rs` `ensure_schema`, `db-schema.ts`/`db-migrations.ts`,
`SNAPSHOT_TABLES` = `SNAPSHOT_SOURCES`). Semua `delete_missing: false`, tanpa
`UNIQUE` selain PK, tanpa `PendingGuard`.

| Tabel | Kolom | Snapshot / rute |
| :-- | :-- | :-- |
| `hr_jenis_pengajuan` | `id_jenis` PK; `nama` NOT NULL; `kelompok` NOT NULL CHECK IN (`Cuti`, `Izin`, `Sakit`, `Dinas Luar`); `izin_pemutus` NOT NULL DEFAULT `hr.request.decide` CHECK IN (`hr.request.decide`, `hr.request.decide_major`); `boleh_urgent`, `potong_jatah`, `wajib_dokumen`, `is_aktif` INTEGER 0/1; CHECK (`potong_jatah = 0 OR kelompok = 'Cuti'`); `dampak_gaji` NOT NULL CHECK IN (`Dibayar`, `Potong Gaji`, `Tidak Berpengaruh`); `maks_hari` INTEGER CHECK NULL atau > 0; `satuan_maks` NOT NULL DEFAULT `Hari Kerja` CHECK IN (`Hari Kerja`, `Hari Kalender`); `created_at`, `updated_at` | `hrJenisPengajuan` / `hr-request-type/save` |
| `hr_pengajuan` | `id_pengajuan` PK (`pgn-<acak>`); `id_karyawan`, `id_jenis` NOT NULL; salinan `kelompok`, `potong_jatah`, `dampak_gaji`, `izin_pemutus`; `tanggal_mulai`, `tanggal_selesai` NOT NULL, CHECK `tanggal_selesai >= tanggal_mulai`; `jam_mulai_ke`, `jam_sampai_ke` INTEGER NULL CHECK NULL atau 1–20; `setengah_hari` 0/1; `alasan` NOT NULL; `sidik` NOT NULL; `diajukan_oleh` NOT NULL (username sesi); `waktu_perangkat` NOT NULL; `created_at`, `updated_at`. Indeks `(id_karyawan, tanggal_mulai)`, `(tanggal_mulai, tanggal_selesai)` | `hrPengajuan` / `hr-request/save` (buat dan sunting, upsert) |
| `hr_pengajuan_keputusan` | `id_keputusan` PK; `id_pengajuan` NOT NULL; `jenis` CHECK IN (`Setujui`, `Tolak`, `Setujui Urgent`, `Diketahui`, `Batal`); `sidik` NOT NULL; `alasan`; `oleh` NOT NULL; `id_karyawan_oleh` (tautan sesi pemutus, untuk tanda); `waktu_perangkat` NOT NULL; `diterima_cloud`; `created_at`. Indeks `id_pengajuan`. Append-only | `hrPengajuanKeputusan` / `hr-request-decision/create` |
| `hr_cuti_penyesuaian` | `id_penyesuaian` PK; `id_karyawan` NOT NULL; `periode` NOT NULL (`YYYY-MM-DD` awal periode); `jenis` CHECK IN (`Saldo Awal`, `Koreksi`, `Pembatalan`); `id_ref`; `hari` INTEGER NOT NULL (boleh negatif); `alasan` NOT NULL; `dicatat_oleh` NOT NULL; `created_at`. Indeks `(id_karyawan, periode)`. Append-only, pembatalan `batal-<id>` | `hrCutiPenyesuaian` / `hr-leave-adjustment/create` |
| `hr_jp_penanganan` | `id_penanganan` PK = `jp:<id_pengajuan>:<tanggal>:<id_jadwal>`; `id_pengajuan`, `tanggal`, `id_jadwal` NOT NULL; salinan `id_rombel`, `id_mapel`, `jam_ke`; `status` NOT NULL CHECK IN (`Diganti`, `Tugas Mandiri`, `Digabung`); `id_guru_pengganti`; `catatan`; `dicatat_oleh` NOT NULL; `waktu_perangkat` NOT NULL; `created_at`, `updated_at`. Indeks `(tanggal)`, `(id_pengajuan)`, `(id_guru_pengganti, tanggal)`. Upsert (Q-48) | `hrJpPenanganan` / `hr-substitute/save` |

Tidak ada yang masuk `APPEND_ONLY_TABLES`: volumenya kecil (puluhan baris
per bulan), tarikan utuh cukup, sama dengan `hr_kontrak` (§19.3).

**Khusus cloud** (Q-51, pola `hr_dokumen_berkas`; hanya `turso.rs` +
`db-migrations.ts`):

| Tabel | Kolom |
| :-- | :-- |
| `hr_pengajuan_berkas` | `id_berkas` PK, `id_pengajuan` NOT NULL, `urutan` CHECK 1–5, `nama_berkas`, `mime_type` CHECK IN (`image/jpeg`, `image/png`, `image/webp`, `application/pdf`), `data_base64` NOT NULL, `diunggah_oleh`, `created_at`. Indeks `id_pengajuan` |

Lampiran ditambahkan setelah pengajuan sampai di cloud, hanya saat terhubung.
`wajib_dokumen` menghasilkan tanda `tanpa_dokumen` di rincian (saat daring),
bukan penolakan.

**Handler cloud** (tidak pernah menolak):

- `hr-request-type/save`: upsert penuh.
- `hr-request/save`: upsert penuh (suntingan yang telat menggugurkan keputusan
  lewat sidik).
- `hr-request-decision/create`, `hr-leave-adjustment/create`: `INSERT … ON
  CONFLICT DO NOTHING`; keputusan mengisi `diterima_cloud = datetime('now')`.
- `hr-substitute/save`: upsert penuh atas PK deterministik.

**Rute sync kanonik baru (5)**: `hr-request-type/save`, `hr-request/save`,
`hr-request-decision/create`, `hr-leave-adjustment/create`,
`hr-substitute/save` → 145. Masuk `CANONICAL_SYNC_ROUTES` dan peta
normalisasi `turso.rs`.

**Pengaturan** (`setting_gex_system`, outbox `setting`): kunci cuti §20.2.4.

**Ikut naik**: `CURRENT_SCHEMA_VERSION`/`CLIENT_SCHEMA_VERSION` 69 (Desktop dan
Mobile); sentinel `-2045` di INSERT, pemeriksa `ensure_schema_current`, dan
daftar `DELETE … version IN` di tes sentinel; `REQUIRED_TABLE_COUNT` 116 →
**122** dan 6 nama baru di `isDatabaseSchemaReady`;
`schema-consistency.test.ts`; daftar versi `rbac-migration.test.ts`;
`SNAPSHOT_TABLES`/`SNAPSHOT_SOURCES` 76 → **81**. Kelima tabel tersinkron masuk
`CLOUD_MIRRORED_TABLES` (dibuang saat pindah database). `PROMOTION_PLAN`
tidak ditambah (§19.11). Seed jenis bawaan `INSERT OR IGNORE` di ketiga lapis
(lokal tanpa outbox). Perangkat v68 berhenti sinkron begitu cloud v69.

### 20.4 Hak akses

**Izin baru fase ini (8)**, dari §15.1:

| Izin | Sensitif | Admin bawaan | Yayasan | Kepala Sekolah | Kepala TU (baru) | Kepegawaian | Guru Piket (baru) |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| `hr.request.view` | | ya | ya | ya | ya | ya | |
| `hr.request.submit` | | ya | ya | ya | ya | ya | |
| `hr.request.urgent` | **ya** (Q-49) | tidak | | ya | ya | | |
| `hr.request.decide` | ya | tidak | ya | ya | ya | | |
| `hr.request.decide_major` | ya | tidak | ya | | | | |
| `hr.scope.all` | ya | tidak | ya | | | | |
| `hr.substitute.manage` | | ya | | ya | | ya | ya |
| `hr.leave.adjust` | ya | tidak | | | | ya | |

- Sensitif = `SENSITIVE_MUTATION_PERMISSIONS` + `ADMIN_DEFAULT_EXCLUDED_PERMISSIONS`
  Rust (`turso.rs:645`). Tidak ada izin rahasia baru (alasan sakit terlihat
  oleh pemegang `hr.request.view`; lampiran surat dokter cloud-only).
- **Role bawaan baru (Q-34)**: `kepala-tu` (`home.view`, `employees.view`,
  `hr.request.view/submit/urgent/decide`) dan `guru-piket` (`home.view`,
  `sync.view`, `hr.substitute.manage`). Role Fase 1 mendapat tambahan sesuai
  tabel. Hanya paket bawaan; role yang sudah disunting Superadmin tidak
  ditimpa (pola Fase 1).
- **Kepala TU memutus tendik, Kepala Sekolah memutus guru** tidak dibedakan
  kode: keduanya memegang `hr.request.decide` dan dibatasi unit yang sama.
  Pembagian guru/tendik diserahkan ke kebiasaan sekolah (K-4 "perbedaannya
  hanya data dan izin").
- **Area baru**: `pengajuan` = `hr.request.view` (halaman `/pengajuan`
  Web/Desktop) dan `jam_kosong` = `hr.substitute.manage` (halaman
  `/jam-kosong` Web/Desktop dan Mobile). Tab Cuti di rincian pegawai serta
  jenis dan aturan cuti di tab Organisasi tetap di `/kepegawaian`.
- **Pemeriksaan `DEFAULT_ROLE_PERMISSIONS`**: tidak ada halaman lama yang
  mendapat penjaga baru; presensi kelas tetap `class_attendance.view`. Kedua
  area baru hanya untuk halaman baru. Operator bawaan tidak mendapat izin
  pengajuan (tidak ada di paketnya, `catalog.ts:638-659`); Admin mendapat
  view/submit/substitute otomatis karena tidak sensitif. Tidak ada role yang
  kehilangan akses.

### 20.5 Command, rute, gateway, dan layar

**Rust**: modul baru `desktop/hr_pengajuan.rs` (aturan murni + SQL kembar +
penulisan lokal + baca; masuk `filesToSync`, `pub mod` di kedua `mod.rs`).
Lampiran di `hris_cloud.rs` yang ada. Command baru (14), terdaftar di kedua
`lib.rs`, `build.rs`, `capabilities/default.json`, `permissions/autogenerated`:

| Kelompok | Command | Izin |
| :-- | :-- | :-- |
| Pengajuan (3) | `desktop_hr_requests` (daftar + status + tanda + JP belum ditangani, saringan) | `hr.request.view` |
| | `desktop_hr_request_save` (buat/sunting; urgent) | `hr.request.submit` (+ `hr.request.urgent`, cakupan) |
| | `desktop_hr_request_decide` (`Setujui`/`Tolak`/`Diketahui`/`Batal`) | izin pemutus jenis + cakupan; Batal Menunggu oleh pengaju |
| Jenis dan aturan (2) | `desktop_hr_request_types_save`, `desktop_hr_leave_settings_save` | `hr.org.manage` |
| Jatah (2) | `desktop_hr_leave_balance` (per periode + rincian satu pegawai) | `hr.request.view` |
| | `desktop_hr_leave_adjust` (penyesuaian + pembatalan) | `hr.leave.adjust` |
| JP (3) | `desktop_hr_affected_jp` (per pengajuan, atau per tanggal = Jam kosong) | `hr.request.view` atau `hr.substitute.manage` |
| | `desktop_hr_substitute_save` | `hr.substitute.manage` + cakupan unit JP |
| | `desktop_hr_my_substitutions` (JP yang saya gantikan hari ini) | `class_attendance.view` |
| Lampiran (4, cloud) | `desktop_hr_request_files`, `desktop_hr_request_file` | `hr.request.view` |
| | `desktop_hr_request_file_add`, `desktop_hr_request_file_delete` | pengaju atau pemegang izin pemutus jenis |

**Sesudahnya: Desktop 394 → 408, Mobile 399 → 413.**

Berubah tanpa command baru: `generate_alfa_harian`, `get_attendance_audit`,
`laporan_kehadiran`, `desktop_get_payroll_recap` (dan pembekuannya lewat
baris yang sama), `list_teaching_schedules` (saring semester bila `tanggal`
dibawa), login + `reload_operator` (`id_karyawan`), simpan operator (naikkan
`rbac_revision` bila tautan berubah), seed role.

**Web**: `validations/hr-pengajuan.ts` + `services/hr-pengajuan.ts` (kembar
Rust, vektor `hr-pengajuan.vektor.json`), rute `POST /api/pengajuan/<…>`
(Zod `.strict()`, `assertSameOriginMutation`, `requireWebPermission`, tanpa
`GET`): `query`, `save`, `decide`, `types`, `leave/query`, `leave/adjust`,
`leave/settings`, `jp/query`, `jp/substitute`, `jp/mine/query`,
`files/query`, `file/query`, `file` (POST + DELETE, body maks 1,6 MB). Plus
perubahan di `alfa-audit.ts`, `attendance-audit.ts`, `report.ts`,
`payroll-recap.ts`, `academic/schedule.ts`, `session-store.ts`,
`operator-admin.ts`. Gateway `gateways/hr-pengajuan.ts`.

**Layar**:

1. **`/pengajuan`** (Web/Desktop, menu "Cuti & Izin"): komponen
   `components/kepegawaian/PengajuanWorkspace.tsx`. Daftar dengan saringan
   (Menunggu, Perlu diketahui, Perlu ditinjau = bertanda, Semua) + rentang +
   unit; form Ajukan (`PilihCari` pegawai, jenis, tanggal, jam ke-N bila guru
   dan kelompoknya Izin/Sakit/DL, setengah hari bila tendik Izin, alasan,
   Urgent bila boleh; ringkasan hari terpakai, sisa jatah, dan JP terdampak
   sebelum disimpan); rincian (isi, riwayat keputusan, tanda, JP terdampak +
   penanganan, lampiran saat daring, tombol sesuai izin dan cakupan).
2. **`/jam-kosong`** (Web/Desktop dan Mobile, Q-50): komponen
   `components/kepegawaian/JamKosongWorkspace.tsx` di `filesToCopy`; tanggal
   bawaan hari ini WIB, saringan unit dan "Belum ditangani", dialog Tunjuk
   pengganti (`PilihCari` guru aktif, peringatan bentrok), Tugas mandiri,
   Digabung.
3. **Rincian pegawai `/kepegawaian`**: tab baru **Cuti** (jatah per periode:
   hak, dibawa, penyesuaian, terpakai, sisa; riwayat pengajuan; Penyesuaian
   bagi `hr.leave.adjust`).
4. **Tab Organisasi `/kepegawaian`**: bagian **Jenis pengajuan** dan **Aturan
   cuti** (dua kolom guru/tendik).
5. **Presensi kelas** Web/Desktop dan Mobile (disunting tangan): pencocokan
   `idKaryawan`, usulan JP pengganti, usulan jadwal disaring semester.
6. **Koreksi Admin** Web/Desktop dan Mobile: catatan untuk Sakit/Izin.
7. **Laporan kehadiran**: legenda dan kolom C, DL.
8. **Slip/rekap gaji**: baris "Cuti dibayar (N hari)" dari
   `breakdown_snapshot.cuti_dibayar`.

### 20.6 Tidak dikerjakan di fase ini

- Pengajuan dan jatah cuti di Mobile (Q-35, Q-50); hanya Jam kosong dan isi
  otomatis presensi kelas yang ke Mobile.
- Cuti diuangkan, prorata jatah, upah cuti melahirkan bertingkat UU KIA.
- Pemutus berjenjang berdasarkan jumlah hari (Q-44).
- Jam kosong karena guru tidak hadir tanpa pengajuan (Alfa, belum scan)
  (Q-55).
- Kelompok Lembur dan Tukar Jam (Fase 8); CHECK `kelompok` sengaja hanya
  empat nilai, jadi Fase 8 membangun ulang CHECK itu.
- Dasbor kehadiran dan leger kehadiran membaca pengajuan.
- Telegram `kepegawaian` (pengajuan menunggu > 2 hari, JP belum ditangani)
  di Fase 6; cetak Surat Tugas dinas luar di Fase 3.
- Riwayat shift (pengajuan lama mengikuti shift kini).
- Portal Guru (K-5).

### 20.7 Langkah

Dipecah menjadi tiga sub-fase; rilis hanya sesudah 2c, karena ketiganya
berbagi v69. Setiap sub-fase berakhir dengan typecheck, Biome, dan tes per
berkas hijau, dan bisa dihentikan tanpa merusak data. Pengajuan yang disetujui
di antara 2a dan 2b belum berdampak ke Alfa dan gaji; karena itu tidak dirilis
sebelum 2c.

**2a — Skema, sesi, RBAC, mesin pengajuan** (batas: sesudah langkah 6,
pengajuan bisa diajukan, diputus, dan disinkronkan di Web/Desktop):

| # | Langkah | Gerbang |
| :-- | :-- | :-- |
| 1 | **Skema v69 penuh**: 5 tabel tersinkron + 1 cloud-only di keempat lapis, jenis bawaan JSON, sentinel `-2045`, angka §20.3, purge, klasifikasi | `audit:schema`; `cargo test sentinel_20` Desktop dan Mobile (tes baru: seed jenis sekali, aman diulang); `schema-consistency.test.ts`, `rbac-migration.test.ts` |
| 2 | **Aturan murni kembar** `hr_pengajuan.rs` ↔ `validations/hr-pengajuan.ts`: sidik, status, tanda, `validasi_pengajuan`, `bentrok_pengajuan`, `tanggal_wajib`, `dalam_cakupan`, tidak-untuk-diri-sendiri, `PENGAJUAN_BERLAKU_SQL`/`PENGAJUAN_RENTANG_SQL`/`PERIODE_DIBAYAR_SQL` (teks harfiah) | `bun test validations/hr-pengajuan.test.ts`; `cargo test hr_pengajuan` kedua workspace; vektor `hr-pengajuan.vektor.json` |
| 3 | **`id_karyawan` di sesi**: `OperatorUser` Rust (`serde(default)`), login + `reload_operator`, `readSessionRecord`, tipe TS, `AuthContext`; simpan operator menaikkan `rbac_revision` | tes vault lama tanpa kolom tetap terbaca (`secrets.rs`); `web-rbac-boundary.test.ts`; tes sesi Web |
| 4 | **Sinkronisasi**: rute §20.3, handler cloud, penulisan lokal + outbox satu transaksi | `audit:contract`; tes cloud `TursoClient::local_file`: keputusan ganda tidak ditolak, `diterima_cloud` terisi, suntingan telat menggugurkan |
| 5 | **RBAC + command + rute + gateway** pengajuan, jenis, keputusan | `rbac-migration.test.ts` (paket role Rust = TS); `cargo test` seed role; `audit:route-guard` |
| 6 | **Layar** `/pengajuan`, Jenis pengajuan di Organisasi | typecheck + Biome; `audit:page-guard`, `audit:a11y`, `audit:ui-guard`, `audit:dialog` |

**2b — Absensi, gaji, jatah** (batas: sesudah langkah 10, pengajuan berlaku
menutup Alfa dan membayar cuti):

| # | Langkah | Gerbang |
| :-- | :-- | :-- |
| 7 | **A-3**: Generate Alfa, audit, laporan kehadiran (kunci `pengajuan`, kode C/DL), catatan Koreksi Admin | `alfa-audit`, `attendance-audit`, `laporan-kehadiran`, `report` (dijalankan terpisah); `cargo test operational::tests`, `administration::tests` per nama |
| 8 | **A-4**: `cuti_dibayar` + `menit_cuti_dibayar` di rekap Rust dan `computePayrollRecap`, `hari` TER harian, `breakdown_snapshot` | vektor kembar; `payroll-calculator`, `payroll-pajak`, `payroll-rapel` tetap lulus; `cargo test payroll::` |
| 9 | **Jatah cuti**: `jatah_cuti`, penyesuaian (rute `hr-leave-adjustment/create`), aturan cuti per kelompok | vektor kembar (periode tahunan bulan 7, ulang tahun kerja, dibawa, minus) |
| 10 | Layar: tab Cuti di rincian pegawai, Aturan cuti, sisa jatah di form ajukan, slip | typecheck + Biome; `audit:a11y`, `audit:list-bound` |

**2c — JP terdampak, pengganti, lampiran** (batas: Fase 2 lengkap):

| # | Langkah | Gerbang |
| :-- | :-- | :-- |
| 11 | `JP_TERDAMPAK_SQL` + `jp_terdampak`, saring semester di `list_teaching_schedules` ↔ `schedule.ts`, penanganan (rute `hr-substitute/save`), tanda `pengganti_berbeda`/`pengganti_bentrok`, cakupan unit JP | vektor kembar (rentang `3-4` terdampak sebagian, hari tengah penuh, libur dilewati, semester lama tidak ikut); `audit:sql` |
| 12 | `/jam-kosong` Web/Desktop + Mobile, isi otomatis presensi kelas (Web/Desktop + Mobile), `desktop_hr_my_substitutions` | typecheck + Biome kedua workspace; `audit:contract` (command Mobile terdaftar), `audit:page-guard` |
| 13 | Lampiran cloud-only (`hr_pengajuan_berkas`, aturan berkas dokumen Fase 1) | vektor berkas yang ada; tes cloud lampiran ke-6 ditolak |
| 14 | `sync-rust-modules`, `sync-frontend-lib`, paragraf ringkas `CLAUDE.md`, catatan "Sudah dibangun" | `audit:contract`, `audit:schema`; `bun run check` penuh oleh pemilik sesudah semua fase HRIS |

### 20.8 Pertanyaan untuk pemilik (Fase 2)

Q-12, Q-14, dan Q-15 (§16) belum dijawab; ketiganya dijawab lewat Q-41,
Q-42, dan Q-43.

| No | Pertanyaan | Usulan | Alasan |
| :-- | :-- | :-- | :-- |
| Q-40 | Setujui **A-3** dan **A-4** sesuai §20.2.6–§20.2.7 (pengajuan tidak menulis absensi; Alfa, audit, laporan, dan gaji membaca `PENGAJUAN_BERLAKU_SQL`; cuti Dibayar = jam normal shift kini per hari wajib tanpa scan Hadir)? | Ya | Pola yang sama dengan kasbon dan rapel; tidak menyentuh jalur sync absensi yang sensitif |
| Q-41 | Q-12: hari cuti/izin dibayar **tidak** dihitung untuk `PER_HADIR`, tetapi **dihitung** untuk `hari` TER harian pegawai tidak tetap? | Ya keduanya | Uang hadir untuk yang benar-benar hadir; tanpa penambahan `hari`, bruto per hari naik karena cuti dan PPh 21 pegawai tidak tetap ikut naik (temuan 6) |
| Q-42 | Q-14: guru di dua unit diputus kepala **unit utamanya**; JP terdampak ditangani guru piket **unit rombelnya**; rombel tanpa unit hanya oleh `hr.scope.all`? | Ya | Kepala SMP tidak memutus izin guru SD, tetapi guru piket SMP yang melihat kelas SMP kosong |
| Q-43 | Q-15: sekolah negeri tanpa yayasan memberi `hr.request.decide_major` dan `hr.scope.all` ke role Kepala Sekolah lewat Role & Akses, tanpa kode khusus? | Ya | K-4: perbedaannya hanya data dan izin |
| Q-44 | Pemutus ditentukan **per jenis saja** (`izin_pemutus`), tanpa aturan "cuti > N hari naik ke Yayasan" (§8.1)? | Per jenis saja | Cuti panjang memang jenis tersendiri (melahirkan, di luar tanggungan); aturan N hari menambah kolom, pesan, dan kasus "hari terpakai berubah karena libur ditambah". Bisa ditambah nanti tanpa mengubah data |
| Q-45 | "Jam ke-N" hanya untuk Izin, Sakit, dan Dinas Luar guru; Cuti selalu hari penuh; tendik setengah hari hanya Izin satu tanggal? | Ya | Cuti memotong jatah per hari; setengah hari cuti butuh jatah pecahan |
| Q-46 | Hari sebagian yang Dibayar: menit dibayar hari itu = max(tercatat, jam normal); Potong Gaji: hanya yang tercatat. Baris jadwal `3-4` dengan izin mulai jam ke-4 dihitung **terdampak** (seluruh baris)? | Ya | Guru yang izin di tengah hari dan lupa scan pulang tetap dibayar penuh bila jenisnya Dibayar (temuan 5); satu baris jadwal = satu penanganan, honornya tetap dari presensi yang benar-benar disimpan |
| Q-47 | Jatah cuti: periode `tahunan` dengan bulan awal (guru 7 = tahun ajaran, tendik 1 = kalender) atau `ulang_tahun_kerja` dari TMT; sisa `hangus`/`dibawa`; hak bawaan 12 hari keduanya; diuangkan dan prorata tidak dibuat? | Ya | Bulan awal menutup "kalender" dan "tahun ajaran" dengan satu angka; diuangkan butuh jalur pembayaran di gaji yang belum ada. Untuk guru ASN, isi hak 0 (§8.4) |
| Q-48 | `hr_jp_penanganan` **upsert** per JP (id `jp:<pengajuan>:<tanggal>:<id_jadwal>`, yang terakhir tiba di cloud berlaku, tanpa riwayat), bukan append-only? | Upsert | Mengganti pengganti karena berhalangan itu biasa; riwayat penunjukan tidak memengaruhi uang (honor dari presensi). Id dari `id_jadwal` karena `jam_ke` bisa disunting |
| Q-49 | `hr.request.urgent` dijadikan **sensitif** (beda dari §15.1)? | Ya | Urgent = menyetujui; tanpa itu Admin bawaan otomatis bisa meloloskan izin tanpa pemutus |
| Q-50 | Mobile: hanya `/jam-kosong` dan isi otomatis presensi kelas; pengajuan, jatah, dan pengaturan tetap Web/Desktop? | Ya | Guru piket berkeliling dengan HP dan datanya tersinkron (jalan luring); HRIS Mobile lengkap di Fase 8 (Q-35) |
| Q-51 | Lampiran pengajuan cloud-only `hr_pengajuan_berkas` (1 MB × 5, aturan berkas dokumen Fase 1); `wajib_dokumen` = tanda, bukan penolakan? | Ya | Surat dokter serahasia dokumen pegawai; sakit mendadak harus tetap bisa dicatat tanpa surat (K-3a) |
| Q-52 | Pengajuan tanggal lewat ditolak bila run `PAID` mencakup tanggalnya; run lain (bukan `REJECTED`) hanya diperingatkan? | Ya | Run yang belum dibayar bisa ditolak dan dibuat ulang; run `PAID` hanya bisa dikoreksi lewat jalur lain |
| Q-53 | Mengubah tautan akun ↔ personil menaikkan `rbac_revision`, dan vault luring lama tanpa `id_karyawan` dianggap tak tertaut sampai login daring berikutnya? | Ya | Tanpa kenaikan revisi, Desktop/Mobile baru memakai tautan baru setelah logout (pola `update_role`) |
| Q-54 | Jenis bawaan §20.2.2 (10 jenis, angka dicek ulang konsultan sekolah)? | Ya | Mengikuti perusahaan §6.3 ditambah Dinas Luar; cuti melahirkan dan di luar tanggungan ke Yayasan |
| Q-55 | "Jam kosong" hanya dari pengajuan; guru yang Alfa atau belum scan tanpa pengajuan tidak masuk daftar? | Ya | K-3a hanya untuk pengajuan; menilai "guru belum datang" dari gerbang setiap jam butuh aturan dan pengingat sendiri (Fase 6) |
| Q-56 | Fase 2 dipecah 2a/2b/2c (§20.7), satu v69 ditulis penuh di 2a, dirilis sesudah 2c? | Ya | Alasan sama dengan Q-39 |
| Q-57 | Pengaju boleh memutus pengajuan yang ia ajukan untuk **orang lain** (Kepala Sekolah mengajukan lalu menyetujui), ditandai `diputus_sendiri`? | Ya | Di sekolah kecil pengaju dan pemutus sering satu orang; perusahaan Q-28 sama |
| Q-58 | Saring jadwal per semester (temuan 3) juga dipakai usulan sesi di presensi kelas yang ada? | Ya | Usulan hari ini bisa memakai jadwal semester lalu; perbaikannya satu syarat di SQL yang sama |

### 20.9 Penanda yang ditinjau pemilik

**Yang dirasakan pengguna:**

- Menu baru "Cuti & Izin" (`/pengajuan`) dan "Jam Kosong" (`/jam-kosong`,
  juga di Mobile). Role baru Kepala TU dan Guru Piket.
- Cuti/izin yang disetujui menghapus Alfa dari laporan dan Generate Alfa;
  laporan kehadiran mendapat kode C dan DL.
- Presensi kelas mengenali guru yang login lewat tautan akun (perlu ditautkan
  di form operator) dan mengusulkan JP yang ia gantikan.
- Kepala sekolah yang akunnya belum ditautkan ke personil **tidak bisa
  memutus** sampai ditautkan (kecuali memegang `hr.scope.all`).

**Risiko data dan uang:**

- **Cuti Dibayar menambah gaji pokok** sebesar jam normal shift per hari: bila
  shift seseorang salah (jam normal 0 atau terlalu besar), cuti ikut salah.
  Shift kini dipakai untuk pengajuan lama.
- Hari sebagian Dibayar menutup kekurangan menit sampai jam normal, termasuk
  bila pegawai lupa scan pulang (Q-46).
- TER harian pegawai tidak tetap menghitung hari cuti dibayar (Q-41).
- Pengajuan disetujui sesudah run dibekukan tidak mengubah run itu; run
  `PAID` menolak tanggalnya, run lain hanya diperingatkan (Q-52).
- Alasan sakit terlihat oleh semua pemegang `hr.request.view`.
- Jenis bawaan, jatah 12 hari, dan aturan cuti guru ASN wajib dicek ulang.

**Perangkat:**

- Naik ke v69: **semua perangkat Desktop dan Mobile wajib diperbarui**;
  perangkat v68 berhenti sinkron begitu cloud v69.
- Vault luring lama tanpa `id_karyawan`: pemutus yang login luring pertama
  kali sesudah pembaruan dianggap tak tertaut sampai login daring (Q-53).
- Jam kosong dan isi otomatis presensi memakai data tersinkron; perangkat yang
  belum menarik penunjukan terbaru menampilkan status lama.

### 20.10 Jawaban Fase 2 (14 Nov 2026)

- **Q-40 sampai Q-58**: semuanya sesuai usulan §20.8, dan penanda §20.9
  disetujui. Artinya: A-3 dan A-4 disetujui (pengajuan tidak menulis
  absensi); Q-12 = hari cuti dibayar tidak ikut `PER_HADIR` tetapi ikut
  `hari` TER harian; Q-14 = pemutus kepala unit utama, JP ditangani unit
  rombel, rombel tanpa unit hanya `hr.scope.all`; Q-15 = sekolah negeri lewat
  Role & Akses; pemutus per jenis saja; jam ke-N hanya Izin/Sakit/Dinas Luar
  guru; hari sebagian Dibayar = max(tercatat, jam normal); jatah tahunan
  dengan bulan awal atau ulang tahun kerja, hangus/dibawa, tanpa diuangkan
  dan prorata; penanganan JP upsert berid `id_jadwal`; `hr.request.urgent`
  sensitif; Mobile hanya Jam Kosong dan isi otomatis presensi kelas;
  lampiran cloud-only, wajib dokumen = tanda; run `PAID` menolak, run lain
  memperingatkan; ganti tautan menaikkan `rbac_revision`; 10 jenis bawaan;
  Jam Kosong hanya dari pengajuan; sub-fase 2a/2b/2c dengan satu v69;
  `diputus_sendiri` boleh dengan tanda; saring semester juga di usulan
  presensi kelas.
- Angka jenis bawaan, jatah 12 hari, dan aturan cuti guru ASN tetap dicek
  ulang konsultan sekolah; bawaannya tidak diubah di fase ini.
- Eksekusi per sub-fase §20.7 di sesi terpisah, mulai 2a.

### 20.11 Sudah dibangun: sub-fase 2a (14 Nov 2026)

Langkah 1–6 §20.7 dibangun: skema v69 penuh (sentinel `-2045`
`hris-pengajuan-v1`, versi 69 `hris-pengajuan`; 5 tabel tersinkron di keempat
lapis + `hr_pengajuan_berkas` cloud-only; jenis bawaan
`validations/hr-jenis-bawaan.json` di-seed `INSERT OR IGNORE` di ketiga lapis,
lokal juga sesudah pindah database), modul baru `desktop/hr_pengajuan.rs`
(`filesToSync`, `pub mod` di kedua `mod.rs`) ↔ `validations/hr-pengajuan.ts` +
`services/hr-pengajuan.ts`, `id_karyawan` di sesi, 5 rute sync + handler cloud,
8 izin + role `kepala-tu`/`guru-piket` + paket role Fase 1, area `pengajuan` dan
`jam_kosong`, halaman `/pengajuan` (menu "Cuti & Izin", Web/Desktop) dan bagian
**Jenis pengajuan cuti dan izin** di tab Organisasi.

Angka (dihitung ulang dari kode, `audit:contract` sebagai acuan):

| | Sebelum | Sesudah |
| :-- | :-- | :-- |
| Skema / sentinel | v68 / `-2044` | v69 / `-2045` |
| `REQUIRED_TABLE_COUNT` | 116 | 122 |
| `SNAPSHOT_TABLES` = `SNAPSHOT_SOURCES` | 76 | 81 |
| Rute kanonik | 140 | 145 |
| Command Desktop / Mobile | 394 / 399 | 398 / 403 |

Command baru 2a (4): `desktop_hr_requests` (`hr.request.view`),
`desktop_hr_request_save` (`hr.request.submit`; urgent + cakupan dari sesi),
`desktop_hr_request_decide` (salah satu `hr.request.submit|decide|decide_major`;
izin pemutus jenis, cakupan, dan diri sendiri dinilai `periksa_aksi`),
`desktop_hr_request_types_save` (`hr.org.manage`). Rute Web baru 4: `POST
/api/pengajuan/query|save|decide|types`. Gateway `gateways/hr-pengajuan.ts`.
Sisa 10 command §20.5 (jatah, aturan cuti, JP, lampiran) lahir di 2b/2c, jadi
angka akhir Fase 2 tetap Desktop 408 / Mobile 413.

Gerbang (oleh Claude, per berkas/per nama; `bun run check` belum, sesuai
keputusan pemilik):

| # | Gerbang | Hasil |
| :-- | :-- | :-- |
| 1 | `audit:schema` (867 kolom, 81 tabel snapshot); `cargo test sentinel_20` Desktop (10, termasuk baru `sentinel_2045_hr_pengajuan_cloud_tidak_pernah_menolak`); `schema-consistency.test.ts` (1); `rbac-migration.test.ts` (10) | Lulus. Jenis bawaan 10 baris walau `ensure_schema` diulang; versi 69 dan `-2045` tercatat |
| 2 | `bun test validations/hr-pengajuan.test.ts` (8, juga salinan Mobile 8); `cargo test hr_pengajuan` Desktop (9) dan Mobile (9, crate Mobile terkompilasi tanpa warning) | Lulus. Vektor `hr-pengajuan.vektor.json` (jenis, isian, periksa jenis, batas hari, kanonik + SHA-256, status, tanda, bentrok, tanggal wajib, cakupan, aksi, sunting, urgent, pesan); 22 konstanta SQL + 6 daftar enum + 4 batas dicek harfiah ke kedua `hr_pengajuan.rs` |
| 3 | `cargo test vault_lama_tanpa_id_karyawan` Desktop dan Mobile (baru, `secrets.rs`); `web-rbac-boundary.test.ts` (7); `operator-admin.test.ts` (8, 1 baru: hanya tautan yang berubah menaikkan `rbac_revision`) | Lulus |
| 4 | `audit:contract` (145 rute, 81 tabel, Desktop 398 / Mobile 403 terdaftar lengkap); tes cloud `TursoClient::local_file` | Lulus: keputusan ganda dua perangkat sama-sama diterima, kiriman ulang id tidak menimpa, `diterima_cloud` terisi, yang pertama sampai di cloud berlaku, suntingan telat menggugurkan lewat sidik, `Batal` menutup, payload cacat diabaikan tanpa menggagalkan event |
| 5 | `services/hr-pengajuan.test.ts` (5, database Web sungguhan); `services/hris.test.ts` (5), `validations/hris.test.ts` (15); `audit:route-guard` | Lulus: siswa ditolak, jam ke-N hanya guru, bertumpuk ditolak tetapi jam pagi + jam siang boleh, cakupan unit, izin pemutus, sunting sesudah diputus ditolak, urgent untuk diri sendiri ditolak, urgent → `perlu_diketahui` → Diketahui → Batal, batas hari jenis, run `PAID` menolak |
| 6 | `tsc --noEmit` dan Biome kedua workspace (berkas yang diubah); `audit:page-guard`, `audit:a11y`, `audit:ui-guard`, `audit:dialog`, `audit:list-bound`, `audit:sql`, `audit:confirm`, `audit:silent-catch` | Lulus |

Keputusan yang diambil di tengah jalan:

- **Hanya 4 command di 2a**, bukan 14: §20.7 membatasi 2a pada pengajuan,
  jenis, dan keputusan. Daftar jenis untuk tab Organisasi ikut `desktop_hr_org`
  / `/api/kepegawaian/org/query` (kunci baru `jenis_pengajuan`), tanpa command
  baca tersendiri.
- **Handler cloud `hr-leave-adjustment/create` dan `hr-substitute/save` sudah
  ada di Rust** (insert `ON CONFLICT DO NOTHING` / upsert atas PK
  deterministik), karena rutenya didaftarkan sekarang. SQL-nya
  (`CLOUD_PENYESUAIAN_SQL`, `CLOUD_PENANGANAN_SQL`) belum punya kembaran TS:
  kembarannya lahir bersama layar yang menulisnya di 2b/2c.
- **CHECK di `hr_pengajuan` hanya yang ditulis §20.3** (tanggal, jam ke-N 1–20,
  0/1). Salinan `kelompok`, `dampak_gaji`, `izin_pemutus` tanpa CHECK, supaya
  Fase 8 hanya membangun ulang CHECK di `hr_jenis_pengajuan`. Handler cloud
  menyaring payload cacat sebelum INSERT.
- **Jenis bawaan di-seed setiap `ensure_schema`/migrasi** (`INSERT OR IGNORE`
  berid tetap), tidak dijaga baris versi seperti v68: jenis tidak pernah
  dihapus (hanya nonaktif), jadi seed ulang tidak menghidupkan apa pun.
- **Daftar pengajuan** = rentang tanggal (bawaan 60 hari ke belakang dan ke
  depan dari hari ini WIB) **ditambah setiap pengajuan yang belum punya
  keputusan apa pun**, supaya yang menunggu lama tidak hilang; maks 1000
  baris.
- **Tanda yang hidup di 2a**: `perlu_diketahui`, `keputusan_ganda`,
  `keputusan_gugur`, `diputus_sendiri`, `di_luar_cakupan`, `bertumpuk` (antar
  pengajuan Menunggu/berlaku di daftar yang sama). `hadir_saat_cuti` dan
  `jatah_minus` di 2b, `tanpa_dokumen` di 2c.
- **`di_luar_cakupan` dinilai dari unit KINI pemutus**: keputusan yang berlaku
  dari pemutus bertaut personil yang unitnya kini berbeda dengan unit pegawai.
  Pemutus tanpa tautan tidak ditandai (tidak bisa diketahui apakah ia memegang
  `hr.scope.all` saat itu). Akibatnya akun Yayasan yang **ditautkan** ke
  personil unit tertentu ikut ditandai saat memutus unit lain.
- **Urgent tanpa izin**: Desktop/Mobile menolak dengan `DESKTOP_ACCESS_DENIED`,
  Web dengan galat validasi 400 (status 403 tidak tersedia di
  `ApiRequestError`). Pesannya sama.
- **Batas jam ke-N** = `jp_max_for_unit` unit pegawai (nama `master_data.unit`
  → `akademik_unit` → `jp_max_per_hari:<id_unit>`, jatuh ke nilai sekolah).
- **Batal pengajuan berlaku dan Setujui ditolak bila run `PAID` menyentuh
  rentangnya** (pola perusahaan §17.4); Tolak dan Diketahui tidak.
- **`OperatorUser.idKaryawan` di TS opsional** (`string | null`), pola
  `requireScanPhoto`: sesi dan tes lama tetap terbaca.

Penyimpangan dari §20 untuk ditinjau:

- Form Ajukan **belum** menampilkan hari terpakai, sisa jatah, dan JP
  terdampak (§20.5 layar 1): ketiganya bergantung pada jatah (2b) dan JP
  terdampak (2c). Lampiran dan tanda `tanpa_dokumen` juga 2c; form hanya
  mengingatkan bila jenisnya perlu dokumen.
- Menu "Jam Kosong" belum ada; area `jam_kosong` sudah terdaftar untuk halaman
  2c.
- **Belum diuji di browser**: `/pengajuan` (ajukan, sunting, putus, urgent) dan
  bagian Jenis pengajuan baru diuji lewat tes service dan typecheck. Jalur
  `simpan` Rust (penulisan lokal + outbox satu transaksi) diuji lewat
  kompilasi dan tes handler cloud, belum lewat tes perangkat.
- Pengajuan yang disetujui di 2a **belum** menutup Alfa dan belum dibayar
  (2b); karena itu tidak dirilis sebelum 2c (§20.7).

### 20.12 Sudah dibangun: sub-fase 2b (14 Nov 2026)

Langkah 7–10 §20.7 dibangun di v69 yang sama (tanpa versi, tabel, atau rute
sync baru). Pengajuan berlaku sekarang menutup Generate Alfa dan audit,
muncul sebagai C/I/S/DL di laporan kehadiran, membayar cuti Dibayar di
ketiga titik hitung gaji, dan memotong jatah cuti yang diturunkan.

- **A-3**: `pengajuan_pada` ↔ `pengajuanPada` (id pegawai → hari penuh, dari
  `PENGAJUAN_RENTANG_SQL`) dipakai `generate_alfa_harian` ↔
  `generateAlfaHarian` (lewati sesudah cek baris yang ada, hitungan
  `jumlahPengajuan`, "Pengajuan: N" di pesan) dan `get_attendance_audit` ↔
  `auditKualitasAbsensi` (kategori info "Pengajuan", hitungan
  `ringkasan.pengajuan`; hari penuh menutup "Tanpa Data"/"Belum Scan Masuk"
  dan Alfa lama, hari sebagian hanya "Belum Scan Pulang"). Laporan kehadiran
  mendapat kunci `pengajuan` dari `LAPORAN_PENGAJUAN_SQL` (dibaca
  `laporan_kehadiran` Rust dan `getLaporanKehadiran` Web); `kodeKelompok` dan
  urutan H/T > pengajuan > S/I/D > A > L/M/- di `susunLaporanKehadiran`, total
  `cuti`/`dinas`, persen = (hadir + DL) ÷ hari wajib, kolom Cuti dan Dinas
  Luar di ekspor Excel, dua baris kode baru di sheet Keterangan. Tanda
  `hadir_saat_cuti` di daftar `/pengajuan` dan riwayat tab Cuti. Catatan
  Koreksi Admin (Sakit/Izin/Dispen) di Web/Desktop dan Mobile.
- **A-4**: `penuh_pada`, `menit_cuti_dibayar`, `hitung_cuti_dibayar` murni
  ↔ `penuhPada`, `menitCutiDibayar`, `hitungCutiDibayar`; pembaca
  `cuti_dibayar` ↔ `cutiDibayar`. Menitnya ditambahkan ke menit reguler
  SEBELUM `apply_overtime_policy` di `desktop_get_payroll_recap` (pratinjau,
  dan pembekuan lewat `total_regular_minutes` baris yang sama) dan
  `computePayrollRecap`; uangnya lewat `wage_from_minutes` / pembulatan yang
  sudah ada, tanpa f64 baru. `hari` TER harian = `total_hadir` + hari cuti;
  `PER_HADIR` tetap `total_hadir`. Baris rekap membawa `cuti_dibayar_hari`,
  `cuti_dibayar_menit`, `jam_normal_nol`; `breakdown_snapshot.cuti_dibayar =
  { hari, menit }`. Run lama tidak dihitung ulang.
- **Jatah cuti**: `aturan_cuti`, `validasi_aturan_cuti`, `jatah_cuti`,
  `validasi_penyesuaian` ↔ kembar TS. Aturan per kelompok di
  `hr_cuti_<isian>:guru|tendik` lewat outbox `setting`. Terpakai = tanggal
  wajib Cuti `potong_jatah` yang berlaku dikurangi tanggal Hadir;
  penyesuaian `Saldo Awal`/`Koreksi` dan `Pembatalan` berid `batal-<id>`
  (`hari` 0, `id_ref` = yang dibatalkan), keduanya lewat
  `CLOUD_PENYESUAIAN_SQL` yang kini punya kembaran TS dan dicek harfiah.
  Tanda `tanpa_tmt` dan `jatah_minus` (periode berjalan) di tab Cuti dan
  ringkasan form Ajukan.
- **Layar**: tab **Cuti** di rincian pegawai (`CutiPegawai.tsx`, untuk
  `hr.request.view`; Penyesuaian dan Batalkan untuk `hr.leave.adjust`),
  bagian **Aturan cuti** dua kolom di tab Organisasi
  (`AturanCutiOrganisasi.tsx`), ringkasan hari kerja + sisa jatah sebelum
  dan sesudah di form Ajukan, baris "Cuti dibayar (N hari)" di slip Web
  (`SlipGajiPrintView`), slip Mobile, dan rincian rekap
  (`PayrollRecapTable`, dengan peringatan `jam_normal_nol`), kotak "Cuti &
  Izin Berlaku" di ringkasan Generate Alfa (Pengaturan Web, Sistem Mobile),
  dan badge di `/audit-absensi`.

Angka (dihitung ulang dari kode, `audit:contract` sebagai acuan):

| | Sebelum | Sesudah |
| :-- | :-- | :-- |
| Command Desktop / Mobile | 398 / 403 | 401 / 406 |
| Rute Web (`src/app/api/**/route.ts`) | 289 | 292 |
| Rute `/api/pengajuan/*` | 4 | 7 (`leave/query`, `leave/adjust`, `leave/settings`) |
| Skema, tabel, snapshot, rute kanonik | v69, 122, 81, 145 | tetap |

Command baru 2b (3): `desktop_hr_leave_settings_save` (`hr.org.manage`),
`desktop_hr_leave_balance` (`hr.request.view`, atau `hr.org.manage` untuk
aturan saja), `desktop_hr_leave_adjust` (`hr.leave.adjust`), terdaftar di
kedua `lib.rs`, `build.rs`, `capabilities/default.json`, dan
`permissions/autogenerated`. Gateway `muatSaldoCuti`, `simpanAturanCuti`,
`sesuaikanJatahCuti` di `gateways/hr-pengajuan.ts`. Sisa 7 command §20.5 (JP
dan lampiran) lahir di 2c, jadi angka akhir Fase 2 tetap Desktop 408 / Mobile
413.

Gerbang (oleh Claude, per berkas/per nama; `bun run check` belum, sesuai
keputusan pemilik):

| # | Gerbang | Hasil |
| :-- | :-- | :-- |
| 7 | `alfa-audit.test.ts` (10), `attendance-audit.test.ts` (13), `laporan-kehadiran.test.ts` (10, 1 baru: urutan H/T > pengajuan > koreksi, DL ikut persen), `report.test.ts` (3), dijalankan terpisah; `cargo test operational::tests`, `administration::tests` Desktop dan Mobile | Lulus; Rust `operational::tests` 9 dan `administration::tests` 24 (tes laporan kini menegaskan kunci `pengajuan`), Desktop dan Mobile |
| 8 | `payroll-calculator` (17), `payroll-pajak` (4), `payroll-rapel` (1), `payroll-recap-hari-kerja` (4); `cargo test payroll::` Desktop, `payroll_admin::` Mobile | Lulus (TS dengan `--timeout 30000` seperti `run-tests.ts`); `payroll::` Desktop 28, `payroll_admin::` Mobile 28 |
| 9 | `bun test validations/hr-pengajuan.test.ts` (10 di Desktop dan salinan Mobile; vektor baru `penuh_pada`, `menit_cuti_dibayar`, `cuti_dibayar`, `hadir_saat_cuti`, `aturan_cuti`, `validasi_aturan_cuti`, `jatah_cuti` (tahunan bulan 7, dibawa + hangus, ulang tahun kerja + akhir bulan dijepit + minus, tanpa TMT, tendik syarat 0), `penyesuaian`; 11 SQL baru, 4 daftar enum, `MAKS_HARI_PENYESUAIAN`, dan `BATAS_CUTI` dicek harfiah ke kedua `hr_pengajuan.rs`); `cargo test hr_pengajuan` Desktop dan Mobile; `services/hr-pengajuan-absensi.test.ts` (6, baru, database Web sungguhan, fixture sama dengan tes Rust `hr_pengajuan_cuti_dibayar_dari_database`); `services/hr-pengajuan.test.ts` (5) | Lulus; `hr_pengajuan` Desktop 12 dan Mobile 12 (3 baru: vektor cuti dibayar, vektor jatah, cuti dibayar dari database), crate Mobile tanpa warning |
| 10 | `tsc --noEmit` dan Biome kedua workspace (berkas yang diubah); `audit:contract`, `audit:sql`, `audit:a11y`, `audit:list-bound`, `audit:route-guard`, `audit:page-guard`, `audit:ui-guard`, `audit:dialog`, `audit:silent-catch`, `audit:confirm` | Lulus |

Keputusan yang diambil di tengah jalan:

- **Hari sebagian** (`penuh_pada`): setengah hari, hari pertama dengan
  `jam_mulai_ke` > 1, atau hari terakhir dengan `jam_sampai_ke` terisi. "Mulai
  jam ke-1 tanpa jam selesai" dihitung hari penuh.
- **Rumus satu tanggal Dibayar** = `max(0, normal − jam_kerja tercatat)`
  untuk semua kasus kecuali hari penuh dengan scan Hadir (0). Ini Q-46
  ("max(tercatat, normal)") dan tabel §20.2.7 sekaligus; hari penuh tanpa
  Hadir yang punya jam tercatat (Koreksi Admin berjam) tidak dibayar dobel.
  `hari` dihitung bila tidak ada scan Hadir di tanggal itu.
- **"Ada scan Hadir"** = `status_kehadiran IN ('Hadir', 'PRESENT')`, definisi
  yang sama dengan `total_hadir`/`PER_HADIR` rekap gaji
  (`HARI_ABSEN_SQL`), dipakai juga oleh jatah dan `hadir_saat_cuti`.
- **Generate Alfa melewati pengajuan berlaku apa pun** (termasuk Potong Gaji
  dan Tidak Berpengaruh): dampak gaji tidak mengubah fakta bahwa
  ketidakhadirannya tercatat. Ceknya sesudah cek baris yang ada, jadi orang
  yang sudah punya baris tetap dihitung "Sudah Ada".
- **Audit**: setiap pegawai wajib absen yang ditutup pengajuan mendapat satu
  temuan info "Pengajuan" (juga bila ia tetap Hadir); Alfa lama di tanggal
  yang ditutup pengajuan (penuh atau sebagian) tidak dihitung Alfa.
- **`hadir_saat_cuti` hanya kelompok Cuti** dan hanya di tanggal hari penuh;
  izin sebagian dengan scan Hadir memang wajar.
- **Periode tahunan**: periode pertama mulai dari tanggal berhak (TMT +
  syarat bulan) sampai sehari sebelum bulan awal berikutnya, hak penuh
  (tanpa prorata, Q-47); berikutnya `YYYY-<bulan awal>-01` setahun.
  Penyesuaian dikunci ke `mulai` periode, dan backend menolak periode yang
  bukan milik pegawai itu ("Periode itu bukan periode jatah pegawai ini.").
- **`desktop_hr_leave_balance` satu pegawai**, bukan daftar semua pegawai
  per periode: tab Cuti dan form Ajukan hanya butuh satu orang. Tanpa
  `id_karyawan` ia mengembalikan aturan saja, dan bentuk itu boleh untuk
  `hr.org.manage` (tab Organisasi) supaya pengelola organisasi tanpa
  `hr.request.view` tetap bisa menyunting aturan; jatah pegawai tetap
  `hr.request.view` (Web: `requireWebPermission` / `requireAnyWebPermission`
  menurut isi body).
- **Pembatalan penyesuaian** berisi `hari` 0 dan menandai yang dibatalkan
  lewat `id_ref`; jumlah jatah mengabaikan baris `Pembatalan` dan baris yang
  punya pembatalan (pola `UANG_BERLAKU_SQL` perusahaan).
- **Riwayat di tab Cuti** dibatasi 200 pengajuan terbaru
  (`RIWAYAT_PENGAJUAN_SQL`).
- Mobile: catatan Koreksi Admin menyebut "(Web/Desktop)" karena menu Cuti &
  Izin tidak ada di Mobile (Q-50).

Penyimpangan dari §20 untuk ditinjau:

- **Form Ajukan belum menampilkan JP terdampak** (§20.5 layar 1): lahir di 2c
  bersama `JP_TERDAMPAK_SQL`.
- **Sisa jatah di form Ajukan** dihitung dari periode yang memuat tanggal
  mulai dikurangi seluruh hari wajib rentang; rentang yang melintasi batas
  periode menampilkan angka gabungan (backend jatah tetap membaginya per
  tanggal). Pengajuan yang sedang disunting ikut terhitung dua kali bila
  sudah berlaku (sunting hanya boleh selama Menunggu, jadi praktis tidak
  terjadi).
- **Rincian estimasi gaji di halaman Payroll Mobile** belum menampilkan baris
  cuti dibayar; slip Mobile sudah.
- **Belum diuji di browser/perangkat**: tab Cuti, Aturan cuti, ringkasan form
  Ajukan, baris slip. Jalur Rust `saldo_cuti`, `simpan_aturan_cuti`,
  `sesuaikan_cuti` (penulisan lokal + outbox) diuji lewat kompilasi; aturan
  murninya lewat vektor, dan pembaca `cuti_dibayar`/`pengajuan_pada` lewat tes
  database Rust.
- Pengajuan yang disetujui sesudah run dibekukan tidak mengubah run itu
  (§20.9); run bukan PAID perlu dibuat ulang supaya cutinya terbayar.

### 20.13 Sudah dibangun: sub-fase 2c (14 Nov 2026)

Langkah 11–14 §20.7 dibangun di v69 yang sama (tanpa versi, tabel, atau rute
sync baru). **Fase 2 lengkap.** JP guru yang cuti/izin sekarang diturunkan,
ditangani guru piket di Jam Kosong (Web/Desktop dan Mobile), diusulkan ke
guru pengganti di presensi kelas, dan pengajuan bisa diberi lampiran
cloud-only.

- **JP terdampak**: `JP_TERDAMPAK_SQL` (pengajuan guru Menunggu ATAU berlaku
  yang punya jadwal aktif; predikatnya salinan harfiah dari
  `PENGAJUAN_AKTIF_ORANG_SQL`, diperiksa tes kedua bahasa) + `JADWAL_JP_SQL`
  (jadwal aktif tahun ajaran yang bertumpuk rentang, dengan unit rombel) →
  fungsi murni `jp_terdampak` ↔ `jpTerdampak`: libur aktif dilewati, hari
  `hari_iso`, tahun ajaran yang memuat tanggal itu, irisan jam lewat
  `jam_ke_range` ↔ `rentangJamKe` (baris `3-4` tersentuh sebagian dihitung
  utuh, Q-46). Hasil diurutkan tanggal, jam awal numerik, id.
- **Penanganan**: `simpan_penanganan` ↔ `simpanPenanganan` menilai ulang JP dari
  database (JP harus masih terdampak pengajuan itu), cakupan unit JP dari
  sesi (Q-42), `periksa_penanganan` ↔ `periksaPenanganan` (bukan JP sendiri,
  dalam cakupan, pengganti bukan guru asli), dan `GURU_AKTIF_SQL`. Desktop/Mobile
  menulis lokal lewat `cloud_penanganan_statements` + outbox `hr-substitute/save`
  satu transaksi; Web menulis `CLOUD_PENANGANAN_SQL` yang kini punya kembaran TS.
- **Tanda** di `susun_jp` ↔ `susunJp` (tidak pernah menolak):
  `pengganti_berbeda`, `pengganti_bentrok` (`pengganti_bentrok` ↔
  `penggantiBentrok`, juga dipakai dialog sebelum simpan dan sebagai
  `peringatan` hasil simpan).
- **Hitungan per pengajuan**: `hitung_jp` ↔ `hitungJp` di jawaban daftar
  (`jp: { <id>: { total, belum } }`).
- **Saring semester** (Q-58): `list_teaching_schedules` ↔ `getTeachingSchedules`
  dengan `tanggal` hanya mengembalikan jadwal tahun ajaran yang memuat tanggal
  itu.
- **Lampiran** (`hris_cloud.rs` ↔ `services/hris.ts` + SQL di
  `validations/hris.ts`): daftar tanpa isi, buka, tambah (slot 1–5, aturan
  `urai_berkas_dokumen`), hapus. Ubah hanya pengaju atau pemegang izin pemutus
  jenis (dinilai dari sesi). `tanda_lampiran` ↔ `tandaLampiran` memberi
  `tanpa_dokumen` saat daring.
- **Layar**: `/jam-kosong` Web/Desktop (`redirect`) dan Mobile (`useEffect` +
  `router.replace`), komponen `components/kepegawaian/JamKosongWorkspace.tsx`
  di `filesToCopy`; menu "Jam Kosong" di grup Akademik & KBM (menu Mobile
  mengikuti `NAVIGATION` + `canAccessArea`, tanpa suntingan). Rincian
  `/pengajuan`: JP terdampak + penanganannya dan bagian Lampiran
  (`LampiranPengajuan.tsx`); form Ajukan: JP terdampak isian sebelum disimpan;
  daftar: "N jam pelajaran terdampak, M belum ditangani". Presensi kelas Web dan
  Mobile: "guru saya" dari `idKaryawan` (tebakan lama cadangan), usulan sesi
  menggabungkan JP yang ia gantikan hari ini ("menggantikan …") dengan jadwalnya
  sendiri yang kini disaring semester.

Angka (dihitung ulang dari kode, `audit:contract` sebagai acuan):

| | Sebelum | Sesudah |
| :-- | :-- | :-- |
| Command Desktop / Mobile | 401 / 406 | 408 / 413 |
| Rute Web (`src/app/api/**/route.ts`) | 292 | 298 |
| Rute `/api/pengajuan/*` | 7 | 13 (`jp/query`, `jp/substitute`, `jp/mine/query`, `files/query`, `file/query`, `file` POST + DELETE) |
| Skema, tabel, snapshot, rute kanonik | v69, 122, 81, 145 | tetap |

Command baru 2c (7): `desktop_hr_affected_jp` (`hr.request.view` atau
`hr.substitute.manage`), `desktop_hr_substitute_save` (`hr.substitute.manage` +
cakupan unit JP), `desktop_hr_my_substitutions` (`class_attendance.view`),
`desktop_hr_request_files` dan `desktop_hr_request_file` (`hr.request.view`),
`desktop_hr_request_file_add` dan `desktop_hr_request_file_delete` (salah satu
`hr.request.submit|decide|decide_major`, lalu pengaju/izin pemutus jenis dari
sesi), terdaftar di kedua `lib.rs`, `build.rs`, `capabilities/default.json`, dan
`permissions/autogenerated`. Gateway `muatJpTerdampak`, `simpanPenanganan`,
`muatGantiSaya`, `muatLampiran`, `bukaLampiran`, `tambahLampiran`,
`hapusLampiran` di `gateways/hr-pengajuan.ts`.

Gerbang (oleh Claude, per berkas/per nama; `bun run check` belum, sesuai
keputusan pemilik):

| # | Gerbang | Hasil |
| :-- | :-- | :-- |
| 11 | Vektor kembar baru di `hr-pengajuan.vektor.json`: `jp_terdampak` (rentang `3-4` sebagian, hari tengah penuh, libur dilewati, semester lama tidak ikut, satu tanggal, tanpa libur), `pengganti_bentrok` (9 kasus), `susun_jp`, `hitung_jp`, `validasi_penanganan`, `periksa_penanganan`; `bun test validations/hr-pengajuan.test.ts` + `hris.test.ts` Desktop dan Mobile; `cargo test hr_pengajuan` Desktop; `audit:sql` | Lulus. TS 38 tes di empat berkas (validations + services hr-pengajuan dan hris) di kedua workspace, termasuk 9 SQL/pesan baru + `STATUS_PENANGANAN` (hr_pengajuan.rs) dan 9 SQL/pesan lampiran (hris_cloud.rs) dicek harfiah ke Desktop dan Mobile. Rust `hr_pengajuan` Desktop 15 (3 baru: vektor JP, JP dari database, jadwal disaring semester), tanpa warning kode |
| 12 | `tsc --noEmit` dan Biome kedua workspace (berkas yang diubah); `audit:contract` (Desktop 408 / Mobile 413 terdaftar lengkap), `audit:page-guard`, `audit:a11y`, `audit:route-guard`, `audit:ui-guard`, `audit:dialog`, `audit:list-bound`, `audit:silent-catch`, `audit:confirm`; `services/hr-pengajuan-jp.test.ts` (3, baru, database Web sungguhan, Desktop dan salinan Mobile) | Lulus: Menunggu ikut, Ditolak dan semester lama tidak; cakupan unit JP (akun unit lain dan akun tak tertaut ditolak), JP sendiri ditolak, pengganti = guru asli ditolak, jadwal tak terdampak ditolak; Tugas Mandiri lalu Diganti = satu baris (upsert), bentrok jadi peringatan + tanda; "JP saya" untuk pengganti, kosong untuk akun tak tertaut |
| 13 | Tes cloud `TursoClient::local_file` `hris_cloud_lampiran_pengajuan` + vektor `tanda_lampiran`; `cargo test hris_cloud` Desktop | Lulus (6, 1 baru): tanda `tanpa_dokumen`, bukan pengaju/pemutus ditolak, 5 lampiran diterima, **ke-6 ditolak**, pengajuan yang belum di cloud ditolak, daftar tanpa `data_base64`, hapus oleh pihak lain ditolak |
| 14 | `sync-rust-modules`, `sync-frontend-lib`; `audit:contract`, `audit:schema`; `cargo test hr_pengajuan` dan `hris_cloud` Mobile | Lulus: `audit:contract`, `audit:schema`; Mobile `hr_pengajuan` 15 dan `hris_cloud` 6 (crate Mobile terkompilasi tanpa warning kode) |

Keputusan yang diambil di tengah jalan:

- **Dua SQL, satu fungsi murni**: `JP_TERDAMPAK_SQL` hanya memilih pengajuan;
  jadwal dimuat `JADWAL_JP_SQL` terpisah, jadi form Ajukan memakai fungsi yang
  sama atas isian yang belum disimpan (`draft`), dan baris jadwal yang sama
  dipakai cek bentrok pengganti.
- **`pengganti_bentrok`**: Diganti bentrok dengan jadwal pengganti sendiri
  (tahun ajaran yang memuat tanggal itu) atau penanganan lain atas namanya di
  jam yang beririsan. Digabung memang mengajar kelasnya sendiri, jadi hanya
  bentrok dengan tugas Diganti lain; dua Digabung ke guru yang sama di jam yang
  sama (tiga kelas digabung) tidak ditandai. Tugas Mandiri tidak pernah.
- **`pengganti_berbeda`** hanya untuk penanganan berpengganti (Diganti/Digabung):
  presensi rombel itu di tanggal dan jam yang beririsan disimpan `id_guru` lain.
- **Tugas Mandiri mengosongkan pengganti** (`validasi_penanganan`), bukan
  menolak isian yang membawa pengganti.
- **Rincian pengajuan hanya menampilkan JP dan penanganannya**; tombol tangani
  ada di Jam Kosong (satu tempat bagi guru piket dengan cakupan unit JP).
- **Hitungan di daftar** dihitung atas rentang semua pengajuan guru di daftar,
  bukan per pengajuan, supaya satu kueri jadwal cukup.
- **Akses lampiran ditolak** di Desktop/Mobile dengan `DESKTOP_ACCESS_DENIED`,
  di Web dengan galat 400 (pola 2a). Superadmin lolos lewat `punya`/`hasPermission`.
- **Usulan JP pengganti di presensi kelas** memakai `desktop_hr_my_substitutions`
  (sesi), bukan guru terpilih di form; gagal dimuat = usulan jadwal sendiri tetap
  muncul.
- **Menu Mobile tanpa suntingan**: `/jam-kosong` muncul lewat `NAVIGATION`
  (disalin) dan `canAccessArea`, tidak dikecualikan seperti `pengajuan`.

Penyimpangan dari §20 untuk ditinjau:

- **Penanganan yang JP-nya tidak lagi terdampak** (pengajuan disunting selama
  Menunggu) tetap tersimpan; tidak tampil di Jam Kosong, tetapi masih ikut
  dinilai sebagai "tugas lain" pada cek bentrok pengganti di tanggal itu.
- **`pengganti_berbeda`** hanya muncul di Jam Kosong dan rincian pengajuan,
  tidak di daftar `/pengajuan`.
- **Jam Kosong karena Alfa tanpa pengajuan** tidak dibuat (Q-55); pengajuan dan
  jatah di Mobile, baris cuti dibayar di estimasi Payroll Mobile, dan Telegram
  kepegawaian tetap di luar Fase 2 (§20.6).
- **Belum diuji di browser/perangkat**: `/jam-kosong` Web/Desktop/Mobile, dialog
  tunjuk pengganti, usulan "menggantikan …" di presensi kelas, JP di rincian dan
  form Ajukan, lampiran (unggah/buka/hapus). Jalur Rust `simpan_penanganan`
  (penulisan lokal + outbox) diuji lewat kompilasi, pembacanya lewat tes
  database Rust, dan aturannya lewat vektor; jalur Web lewat tes database.
