# PRD HRIS — Fase 0

Bagian §6 dari `prd-hris.md`, dipindahkan apa adanya pada 2026-11-18 supaya satu sesi cukup membaca satu fase. Nomor bagian tidak berubah: rujukan `prd-hris.md §6.x` di kode menunjuk ke berkas ini. Istilah, keputusan pemilik (§5), hak akses umum (§15), dan sinkronisasi (§17) ada di `prd-hris.md`.

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
