# PRD — HRIS (Kepegawaian Sekolah dan Yayasan)

Status (13 Nov 2026): **PRD awal, belum ada kode.** Arah dan keputusan pemilik
K-1 sampai K-8 di §5. Fase 0 (perbaikan PPh 21 dan BPJS) dirinci sampai
langkah di §6; **Q-1 sampai Q-10 disetujui sesuai usulan** (§6.12), siap
dieksekusi di sesi terpisah. Fase 1 sampai 8
baru berupa cakupan (§7–§14); model data rinci ditulis di awal setiap fase,
dalam bagian "Urutan pengerjaan fase N", seperti `prd-hris.md` proyek
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
