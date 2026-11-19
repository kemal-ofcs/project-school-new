# PRD HRIS — Fase 8

Bagian §26 dari `prd-hris.md`. Istilah, keputusan pemilik (§5), hak akses umum (§15), dan sinkronisasi (§17) ada di `prd-hris.md`. Invarian HRIS v67–v72 ada di `references/18-hris-kepegawaian.md` (pajak: `references/17`). Aturan bisnis diambil dari HRIS perusahaan (`C:\dev\absensi-perusahaan\prd-hris.md` §19 reimbursement, §27 transfer bank, §28 pelaporan); kodenya tidak disalin.

## 26. Urutan pengerjaan Fase 8

**Rancangan disetujui pemilik** (Q-152 sampai Q-167, §26.10). 8a sudah
ditulis (§26.11); berikutnya 8b. Isi Fase 8 dipilih pemilik pada 19 Nov 2026 dari daftar
§14: **berkas transfer gaji ke bank, laporan PPh 21/BPJS, dan
reimbursement**. HRIS di Mobile, bagan organisasi, lembur SPL, tukar jam, dan
Portal Guru tetap di §14 untuk fase berikutnya.

Ringkasnya: **skema v73, sentinel `-2049` (`hris-transfer-lapor-reimburse-v1`),
sepuluh tabel KHUSUS CLOUD (sembilan bila Q-153 (b)), lima izin baru plus
`payroll.export` yang mulai dipakai, tanpa tabel snapshot dan tanpa rute sync
baru.** Tiga modul aturan kembar baru:

| Rust (`src-tauri/src/desktop/`) | TS (`src/lib/`) |
| :-- | :-- |
| `transfer.rs` | `validations/transfer.ts` + `services/transfer.ts` |
| `lapor_pajak.rs` | `validations/lapor-pajak.ts` + `services/lapor-pajak.ts` |
| `hr_reimburse.rs` | `validations/hr-reimburse.ts` + `services/hr-reimburse.ts` |

Rumus gaji, PPh 21, dan BPJS **tidak diubah**. Laporan dan berkas transfer
membaca angka yang sudah dibekukan di `payroll_items`.

### 26.1 Temuan dari kode

Diverifikasi ke kode sekolah (19 Nov 2026). Angka `audit:contract` "sebelum"
dicatat di langkah 1, tidak disalin dari dokumen.

**Mengubah rancangan HRIS perusahaan:**

- **Reimbursement tidak bisa menumpang `hr_pengajuan`.** Di perusahaan, klaim
  adalah baris `hr_pengajuan` berkelompok `Reimburse`. Di sekolah, CHECK
  `hr_jenis_pengajuan.kelompok` hanya `Cuti`/`Izin`/`Sakit`/`Dinas Luar`, dan
  CHECK `izin_pemutus` hanya `hr.request.decide`/`hr.request.decide_major`
  (`db-migrations.ts:3740-3741`). Kelima tabel pengajuan tersinkron
  (`sync.rs:1725-1815`, `storage.rs`), jadi menambah nilai CHECK berarti
  membangun ulang tabel di cloud DAN di SQLite setiap perangkat, ditambah
  perangkat v72 yang menolak baris asing. Usulan: tabel reimbursement sendiri
  yang KHUSUS CLOUD (pola Fase 4–7), Q-160.
- **Mode "masuk gaji" tidak bisa memakai tabel khusus cloud.** Rekap gaji
  Desktop (`payroll/commands.rs::rekap_gaji`) membaca SQLite lokal: kasbon
  (`keu_pinjaman`), cuti (`hr_pengajuan::cuti_dibayar`), dan pegawai keluar
  (`master_data.id_keluar`, `hr_keluar::KELUAR_DI_PERIODE_SQL`) semuanya
  tersinkron. Klaim yang hanya ada di cloud tidak terbaca pratinjau dan
  pembekuan Desktop, sehingga Web dan Desktop menghasilkan gaji bersih
  berbeda. Usulan: Fase 8 hanya **pembayaran terpisah**, mode `gaji` ditunda
  (Q-161).
- **Fase 0 sudah memperbaiki rumus.** Temuan perusahaan §28.2 (TER per run,
  tanpa rekonsiliasi Desember) tidak berlaku di sini. `breakdown_snapshot.pajak`
  (`HasilPph`: `masa`, `status`, `metode`, `kategori`, `tarif`, `bruto_pajak`,
  `bruto_tahun`, `biaya_jabatan`, `iuran_pensiun`, `ptkp`, `pkp`,
  `pph_setahun`, `pph`, `tanda`) dan `bpjs_masa` (`HasilBpjs`: `karyawan`,
  `perusahaan`, `rincian[]`, `dasar_masa`) sudah memuat bahan bukti potong
  bulanan maupun A1, sehingga rekap A1 tahunan bisa disusun (Q-157).

**Sudah ada dan dipakai ulang:**

- Rekening di `hr_profil` (khusus cloud): `bank` teks bebas, `no_rekening`
  5–20 digit (`validations/hris.ts:1081`), `nama_rekening`; juga `nik`,
  `npwp`, `bpjs_kesehatan`, `bpjs_ketenagakerjaan`. Dibaca dengan
  `hr.finance.view`.
- Status run `DRAFT → SUBMITTED → REVIEWED → APPROVED → PAID` / `REJECTED`
  (`db-migrations.ts:1171`); `payroll_items.net_salary` INTEGER `>= 0` adalah
  gaji bersih akhir sesudah kasbon. Ini nominal transfer, tanpa hitung ulang.
- Izin `payroll.export` ada di katalog (`rbac/catalog.ts:173`) tetapi **tidak
  dipakai guard mana pun**. `payroll.run.disburse` ada. `payroll.config.manage`
  khusus Superadmin (`SUPERADMIN_ONLY_PERMISSIONS`).
- `payroll_audit_logs` (tersinkron, `action` tanpa CHECK) untuk mencatat
  unduhan berkas transfer.
- Excel lewat `client/xlsx.ts` (`createXlsxWorkbook`), simpan lewat
  `client/download.ts::saveFileWithPicker` (SAF di Mobile).
- Pengaturan khusus cloud berpola key/value: `app_telegram_setting`
  (`db-migrations.ts:3431`).
- `company_profile` tidak punya NPWP, NITKU, atau nomor BPJS pemberi kerja.
- `keu_jurnal.sumber` CHECK: `Manual`, `Kasbon`, `Payroll`, `Pembayaran`,
  `Tagihan`, `Inventaris`, `Cicilan`, `Pembatalan`. Tidak ada `Reimburse`.
  Preseden bangun ulang CHECK ada (`'Cicilan'`, `db-migrations.ts:3217`).
- Pola berkas khusus cloud (1 MB × 5) dan sidik keputusan dari Fase 2
  (`hr_pengajuan_berkas`, `sidik_pengajuan`); pola pembayaran append-only
  `batal-<id>` dari kasbon dan PMB.

### 26.2 Rancangan per bagian

#### 26.2.1 Berkas transfer gaji ke bank

Diambil dari HRIS perusahaan §27, sesudah disesuaikan:

- **Pengaturan** (Superadmin, `payroll.config.manage`): daftar bank
  (`app_bank`: nama, kode BI 3 digit, alias), rekening debet sekolah
  (`app_bank_rekening`), dan format berkas kustom (`app_bank_format`) bila
  Q-153 (a). Seed bank bawaan dari satu berkas `validations/bank-bawaan.json`
  (BCA, Mandiri, BRI, BNI, BSI, BPD umum), kode BI diverifikasi saat
  langkah 1.
- **Isian bank di profil keuangan** menjadi `PilihCari` dari `app_bank` aktif
  dan tetap menyimpan nama (teks). Data lama tidak ditulis ulang. Pencocokan
  memakai `cocok_bank` ↔ `cocokBank` (nama + alias, trim, huruf kecil).
- **Sumber berkas**: satu run `APPROVED` atau `PAID` dan satu rekening debet.
  Baris = `payroll_items` run itu + `hr_profil` + `app_bank`. Nominal =
  `net_salary`.
- **Jenis per baris**: `sesama` bila bank pegawai = bank rekening debet, selain
  itu `antarbank`.
- **Tanda, bukan penolakan**: `tanpa_rekening`, `bank_tidak_dikenal`,
  `tanpa_kode_bank`, `nominal_nol`, `nama_berbeda` (peringatan saja),
  `pegawai_keluar`. Baris bertanda tidak masuk berkas bank, tetapi masuk sheet
  "Perlu dibayar manual".
- **Berkas**: Excel umum selalu ada (sheet Transfer, Perlu dibayar manual,
  Ringkasan per bank/jenis). Format kustom CSV/TXT/XLSX bila Q-153 (a),
  dirender fungsi murni `render_format` ↔ `renderFormat`. Total berkas wajib
  sama dengan Σ `net_salary` baris yang masuk (bilangan bulat).
- **Jejak**: setiap unduhan menulis satu baris `payroll_audit_logs`
  `action = 'TRANSFER_EXPORT'` langsung di cloud. Status run tidak berubah;
  `PAID` tetap ditandai manual sesudah transfer di bank. Layar memperingatkan
  bila run sudah `PAID` atau sudah pernah diunduh.

#### 26.2.2 Laporan PPh 21 dan BPJS

- **Data pemotong** (Q-155): NPWP sekolah/yayasan 16 digit, NITKU, nama dan
  NIK penandatangan bukti potong, nomor pendaftaran BPJS Ketenagakerjaan dan
  Kesehatan. Disimpan di `app_lapor_setting` (key/value khusus cloud).
- **Masa** = bulan `period_start`, hanya run `PAID` (Q-156). Dua run dalam
  sebulan dijumlah per pegawai; angka diambil dari `breakdown_snapshot`, tidak
  dihitung ulang.
- **Rekap PPh 21 bulanan**: per pegawai NIK/NPWP, nama, PTKP, status
  tetap/tidak tetap, metode, kategori TER, bruto, PPh dipotong (boleh negatif
  di masa terakhir), jumlah run. Tanda: `tanpa_nik`, `tanpa_npwp` (hanya
  info), `pph_negatif`, ditambah tanda `pajak.tanda` yang sudah ada.
- **Rekap BPJS bulanan**: nomor kepesertaan, dasar masa, setiap kode dari
  `bpjs_masa.rincian`, total pekerja/perusahaan. Tanda
  `dipotong_tanpa_nomor`, `bernomor_tanpa_potongan`.
- **Rekap A1 tahunan** (Q-157): per pegawai yang punya run `PAID` di tahun
  itu: masa awal–akhir, bruto setahun, biaya jabatan, iuran pensiun, PTKP,
  PKP, PPh setahun (dari `pajak` masa terakhir yang `metode` Pasal 17), PPh
  sudah dipotong. Pegawai tidak tetap: rekap jumlah saja, tanpa A1.
- **Ekspor**: Excel rekap per laporan. Template impor Coretax/e-Bupot dan
  unggah SIPP/e-Dabu **hanya dibangun dari template resmi yang diberikan
  pemilik** (Q-154). Tanpa template, Fase 8 berhenti di Excel rekap.
- Tanpa status "sudah dilapor" yang disimpan; portal DJP/BPJS sumber
  kebenarannya.

#### 26.2.3 Reimbursement

- **Kategori** = `hr_reimburse_jenis` (nama, aktif, wajib nota, batas per
  bulan opsional yang hanya memberi peringatan). Seed: Transport, Kesehatan,
  Konsumsi, Dinas, Lainnya (`INSERT OR IGNORE`).
- **Klaim** `hr_reimburse` untuk satu personil, satu tanggal biaya (tidak
  lewat hari ini WIB), nominal INTEGER 1–1.000.000.000, keperluan. Diisi
  pemegang `hr.reimburse.submit` atas nama personil (Portal Guru ditunda,
  K-5).
- **Nota** `hr_reimburse_berkas`: aturan berkas dokumen Fase 1c (1 MB × 5,
  MIME `image/jpeg|png|webp` + PDF bila dokumen HRIS mengizinkannya). Jenis
  wajib nota tanpa berkas = tanda `tanpa_nota`, bukan penolakan.
- **Keputusan** `hr_reimburse_keputusan` append-only: `Setujui` (dengan
  `nominal_disetujui` 1–`nominal`; lebih kecil wajib alasan), `Tolak` (alasan
  wajib), `Batal`. Klaim **terkunci** sesudah keputusan pertama (Q-162);
  koreksi = Batal lalu ajukan ulang. Status diturunkan: Menunggu, Disetujui,
  Ditolak, Dibatalkan.
- **Pemutus**: `hr.reimburse.decide` dalam cakupan unit (A-5, §15.2), tidak
  untuk klaim atas diri sendiri (akun tertaut A-2). Dibaca dari sesi.
- **Pembayaran terpisah** `hr_reimburse_bayar` + `hr_reimburse_bayar_baris`
  (pola PMB/kasbon): satu pembayaran untuk satu personil, satu atau beberapa
  klaim Disetujui yang Belum dibayar; total = Σ nominal disetujui saat
  dicatat, tidak dari isian. Pembatalan `batal-<id_bayar>` dengan alasan.
  Status bayar diturunkan (Belum dibayar / Dibayar); dua pembayaran aktif =
  tanda `dibayar_ganda`, tidak ditolak. Klaim yang sudah dibayar tidak bisa
  dibatalkan sebelum pembayarannya dibatalkan.
- **Pembukuan** (Q-163): usulan jurnal manual, seperti perusahaan Q-31. Akun
  bawaan baru `akun-beban-reimburse` di `akun-bawaan.json` supaya jurnal
  manual punya akun tujuan.
- **Pegawai keluar**: klaim lama tetap bisa diputus dan dibayar (pembayaran
  terpisah tidak bergantung pada `status_aktif`).

### 26.3 Model data dan sinkronisasi

Semua tabel KHUSUS CLOUD: hanya `turso.rs::ensure_schema` + blok v73
`db-migrations.ts` (DDL identik), lewat `TursoClient`. Tidak menyentuh
`storage.rs`, `SNAPSHOT_TABLES`, outbox, atau rute sync. Tanpa koneksi:
`hris_cloud::PESAN_LURING`. Tanpa `UNIQUE` selain PK. Semua masuk
`PROMOTION_PLAN` dan dibuang saat pindah database.

| Tabel | Kolom inti | Catatan |
| :-- | :-- | :-- |
| `app_bank` | `id_bank` PK (`bnk-<kode>` / `bnk-<hex>`), `nama` NOT NULL, `kode`, `alias` (JSON larik), `is_aktif`, `is_bawaan`, `diubah_oleh`, `created_at`, `updated_at` | seed dari `bank-bawaan.json`; tanpa hapus |
| `app_bank_rekening` | `id_rekening` PK, `id_bank` NOT NULL, `no_rekening` NOT NULL, `nama_rekening` NOT NULL, `keterangan`, `is_aktif`, stempel | rekening debet sekolah |
| `app_bank_format` | `id_format` PK, `nama`, `id_bank`, `jenis` CHECK `csv`/`txt`/`xlsx`, `pemisah`, `pakai_judul`, `kutip`, `desimal`, `cakupan` CHECK `semua`/`sesama`/`antarbank`, `kolom` JSON, `maks_berita`, `is_aktif`, stempel | hanya bila Q-153 (a) |
| `app_lapor_setting` | `kunci` PK, `nilai`, `diubah_oleh`, `updated_at` | pola `app_telegram_setting` |
| `hr_reimburse_jenis` | `id_jenis` PK, `nama` NOT NULL, `wajib_nota` 0/1, `batas_bulanan` INTEGER NULL, `is_aktif`, stempel | seed lima jenis |
| `hr_reimburse` | `id_klaim` PK (`rmb-<hex>`), `id_karyawan` NOT NULL, `id_jenis` NOT NULL, `tanggal` NOT NULL, `nominal` INTEGER CHECK 1–1e9, `keperluan` NOT NULL, `diajukan_oleh`, `created_at` | baris tidak diubah sesudah keputusan pertama |
| `hr_reimburse_keputusan` | `id_keputusan` PK, `id_klaim` NOT NULL, `aksi` CHECK `Setujui`/`Tolak`/`Batal`, `nominal_disetujui` INTEGER NULL, `alasan`, `diputus_oleh`, `created_at` | append-only; status diturunkan dari baris terakhir |
| `hr_reimburse_berkas` | pola `hr_pengajuan_berkas` | luar snapshot sejak awal (khusus cloud) |
| `hr_reimburse_bayar` | `id_bayar` PK (`rbb-<hex>`, pembatalan `batal-<id>`), `jenis` CHECK `Bayar`/`Pembatalan`, `id_ref`, `id_karyawan`, `tanggal` (WIB), `total` INTEGER `>= 0`, `keterangan`, `dicatat_oleh`, `created_at` | append-only |
| `hr_reimburse_bayar_baris` | `id_baris` PK (`<id_bayar>:<id_klaim>`), `id_bayar`, `id_klaim`, `nominal` INTEGER `>= 0` | nominal disalin saat dibayar |

Angka akhir `REQUIRED_TABLE_COUNT` dihitung di langkah 1 dari kode.

Kedua jalur: `CURRENT_SCHEMA_VERSION`/`CLIENT_SCHEMA_VERSION` 73 (Desktop dan
Mobile), sentinel `-2049` + `ensure_schema_current`, kesepuluh daftar sentinel
di tes `turso.rs`, `isDatabaseSchemaReady`, `schema-consistency.test.ts`,
`rbac-migration.test.ts` versi 73.

### 26.4 Hak akses

| Izin | Sensitif | Rahasia | Paket bawaan |
| :-- | :-- | :-- | :-- |
| `payroll.export` (sudah ada, mulai dipakai) | | | Superadmin saja sampai diberikan |
| `hr.reimburse.view` | | ya | Kepegawaian, Kepala Sekolah, Yayasan |
| `hr.reimburse.submit` | | | Kepegawaian, Kepala Sekolah, Kepala TU |
| `hr.reimburse.decide` | ya | | Kepala Sekolah, Yayasan |
| `hr.reimburse.pay` | ya | | — (diberikan Superadmin ke bendahara, Q-164) |
| `hr.reimburse.config` | | | Kepegawaian |

- **Unduh berkas transfer**: `payroll.run.disburse` **dan** `hr.finance.view`,
  karena berkas membuka nomor rekening semua pegawai.
- **Laporan PPh 21/BPJS/A1**: `payroll.export` **dan** `hr.finance.view` (NIK,
  NPWP, gaji semua pegawai).
- **Pengaturan bank, rekening debet, format, data pemotong**:
  `payroll.config.manage` (Superadmin). Membaca daftar bank aktif cukup sesi,
  karena dipakai isian profil keuangan.
- Izin sensitif masuk `SENSITIVE_MUTATION_PERMISSIONS` dan `NOT IN` seed Admin
  Rust; `hr.reimburse.view` masuk `CONFIDENTIAL_PERMISSIONS`. Paket di
  `ROLE_HRIS_BAWAAN` ↔ `DEFAULT_ROLE_PERMISSIONS`. Sebelum menjaga halaman
  dengan area baru, cek `DEFAULT_ROLE_PERMISSIONS` supaya role lama tidak
  terkunci.

### 26.5 Command, rute, gateway, layar

**Rust** (Desktop, disalin ke Mobile lewat `sync-rust-modules.ts`; Mobile
mendaftarkan command tetapi tanpa layar, Q-166):

| Modul | Command (perkiraan) |
| :-- | :-- |
| `transfer.rs` | `desktop_transfer_settings`, `desktop_transfer_settings_save` (bank / rekening / format dalam satu draft ber-`aksi`), `desktop_transfer_banks` (bank aktif, sesi saja), `desktop_transfer_preview`, `desktop_transfer_export` |
| `lapor_pajak.rs` | `desktop_report_pph_monthly`, `desktop_report_bpjs_monthly`, `desktop_report_a1_yearly`, `desktop_report_setting`, `desktop_report_setting_save` |
| `hr_reimburse.rs` | `desktop_hr_reimburse_types`, `desktop_hr_reimburse_types_save`, `desktop_hr_reimburse_list`, `desktop_hr_reimburse_save`, `desktop_hr_reimburse_decide`, `desktop_hr_reimburse_file` (+ hapus), `desktop_hr_reimburse_pay`, `desktop_hr_reimburse_pay_cancel` |

Baca payroll di Desktop: `payroll_runs`/`payroll_items` dari cloud lewat
`TursoClient` (sama dengan `hr_profil`), supaya satu kueri dipakai Web dan
Desktop dan hasilnya sama. Run lokal yang belum terdorong tidak muncul; itu
benar karena hanya `APPROVED`/`PAID` yang dibaca.

**Web**: rute `POST` di `/api/payroll/transfer/…`, `/api/payroll/reports/…`,
`/api/kepegawaian/reimburse/…` (`assertSameOriginMutation`,
`requireWebPermission`, Zod `.strict()`, berkas dengan batas body). Gateway:
`gateways/payroll.ts` (transfer + laporan) dan `gateways/hris.ts`
(reimbursement).

**Layar** (Web dan Desktop):

1. Penggajian → rincian run: tombol **Berkas transfer** (pilih rekening debet,
   format, tanggal efektif; pratinjau 5 baris, ringkasan tanda, unduh).
2. Penggajian → halaman **Pelaporan**: tab PPh 21, BPJS, A1; pemilih
   bulan/tahun; tabel bertanda; ekspor Excel.
3. Pengaturan: kartu **Bank dan transfer** dan **Data pemotong** (Superadmin).
4. Profil keuangan pegawai: isian bank menjadi `PilihCari`.
5. Kepegawaian → tab **Reimbursement**: daftar + saringan status/bayar,
   isian klaim + nota, dialog Setujui dengan nominal, bagian Pembayaran (hanya
   `hr.reimburse.pay`). Tab kategori di Organisasi (`hr.reimburse.config`).

### 26.6 Tidak dikerjakan

- Mode reimbursement "masuk gaji" (Q-161), jurnal otomatis pembayaran
  reimbursement (Q-163), cetak tanda terima.
- Format bank khusus berlebar tetap atau ber-checksum; hanya dibangun dari
  contoh berkas asli bank.
- Template impor Coretax/e-Bupot/SIPP tanpa template resmi (Q-154);
  mengirim/menyetor ke portal mana pun; kode billing, NTPN.
- PPh 21 bukan pegawai, pesangon final, PPh 26; WLKP (Q-158).
- Layar Mobile untuk ketiga bagian (Q-166); Telegram untuk reimbursement
  (Q-165).

### 26.7 Langkah per sub-fase dengan gerbang

Empat sub-fase, satu sesi per sub-fase. Setiap sub-fase: semua langkahnya
ditulis dulu, lalu satu putaran cek di akhir (CLAUDE.md, "cara kerja hemat
konteks"). Kolom "Isi tes" adalah kasus yang wajib ADA di tes. `bun run check`
penuh oleh pemilik sesudah Fase 8 (didahului `jalankan-antislop`).

**8a — Skema, izin, transfer** (batas: berkas transfer bekerja lewat command
dan rute):

| # | Langkah | Isi tes |
| :-- | :-- | :-- |
| 1 | Catat angka `audit:contract` sebelum. Skema v73: semua tabel §26.3 di `turso.rs` + `db-migrations.ts`, seed bank + jenis reimbursement, sentinel `-2049`, versi 73, `REQUIRED_TABLE_COUNT`, `isDatabaseSchemaReady`, `PROMOTION_PLAN` | sentinel `-2048` memicu v73; semua tabel ada di kedua jalur; seed dijalankan dua kali tetap sama |
| 2 | RBAC: lima izin baru + `payroll.export` mulai dipakai; `SENSITIVE`/`CONFIDENTIAL`, baris `app_permission` + `NOT IN` Admin Rust, paket ↔ `DEFAULT_ROLE_PERMISSIONS` | `rbac-migration.test.ts` versi 73; Admin tidak memegang `hr.reimburse.decide/pay` |
| 3 | Aturan kembar `transfer.rs` ↔ `validations/transfer.ts`: `cocok_bank`, `jenis_transfer`, tanda baris, `validasi_format`, `render_format`, ringkasan | vektor `transfer.vektor.json`: alias dan spasi, sesama/antarbank, keenam tanda, format CSV ber-kutip/desimal, `maks_berita`, total = Σ baris masuk |
| 4 | Transaksi cloud: pengaturan, pratinjau, unduh + `TRANSFER_EXPORT` | `TursoClient::local_file` ↔ `services/transfer.test.ts` data sama: run `DRAFT` ditolak, `PAID` diperingatkan, izin kurang ditolak |
| 5 | Command, rute, gateway | `audit:contract` |

Cek akhir 8a: `tsc` + Biome berkas yang diubah, tes vektor + service sekali,
`cargo test transfer` Desktop, `audit:contract`, `audit:schema`, `audit:sql`.

**8b — Laporan PPh 21, BPJS, A1** (batas: tiga laporan bekerja lewat command
dan rute):

| # | Langkah | Isi tes |
| :-- | :-- | :-- |
| 6 | Aturan kembar `lapor_pajak.rs` ↔ `validations/lapor-pajak.ts`: agregasi per pegawai dari `breakdown_snapshot`, tanda, validasi data pemotong (NPWP 16 digit, NITKU) | vektor `lapor-pajak.vektor.json`: dua run sebulan dijumlah, run `REJECTED`/belum `PAID` dilewati, masa = bulan `period_start`, PPh negatif Desember, pegawai tidak tetap tanpa A1, slip lama tanpa `pajak` (pra-v67) ditandai bukan dihitung ulang |
| 7 | Bacaan cloud + data pemotong (Rust + TS) | `local_file` ↔ `services/lapor-pajak.test.ts` data sama |
| 8 | Command, rute, gateway, Excel rekap | `audit:contract`; tes workbook satu laporan |

Cek akhir 8b: `tsc` + Biome, tes berkas baru sekali, `cargo test lapor_pajak`,
`audit:contract`, `audit:sql`.

**8c — Reimbursement** (batas: klaim, keputusan, nota, pembayaran lewat
command dan rute):

| # | Langkah | Isi tes |
| :-- | :-- | :-- |
| 9 | Aturan kembar `hr_reimburse.rs` ↔ `validations/hr-reimburse.ts`: `validasi_klaim`, `periksa_keputusan`, `status_klaim`, `status_bayar`, `lewat_batas`, `periksa_bayar`, `periksa_batal_bayar`, SQL harfiah | vektor `hr-reimburse.vektor.json`: tanggal masa depan ditolak, nominal disetujui > diajukan ditolak, lebih kecil tanpa alasan ditolak, klaim terkunci sesudah keputusan, Batal klaim terbayar ditolak, batas bulanan hanya tanda, dibayar ganda ditandai |
| 10 | Transaksi cloud: jenis, klaim, nota, keputusan (cakupan unit + bukan diri sendiri dari sesi), bayar + batal | `local_file` ↔ `services/hr-reimburse.test.ts`: pemutus beda unit ditolak, `hr.scope.all` lolos, akun tertaut ke pengaju ditolak, total bayar dari nominal disetujui bukan isian |
| 11 | Command, rute, gateway | `audit:contract` |

Cek akhir 8c: `tsc` + Biome, tes berkas baru sekali, `cargo test hr_reimburse`,
`audit:contract`, `audit:sql`, `audit:list-bound`.

**8d — Layar dan dokumen** (batas: Fase 8 lengkap):

| # | Langkah | Isi tes |
| :-- | :-- | :-- |
| 12 | Layar §26.5 nomor 1–5 | — |
| 13 | `sync-rust-modules.ts` (+ tiga modul), `sync-frontend-lib.ts`, paragraf `references/18` "HRIS transfer, pelaporan, reimbursement (schema v73)", catatan "Sudah dibangun" §26.11 | — |

Cek akhir 8d: `tsc` + Biome berkas yang diubah, `audit:a11y`,
`audit:ui-guard`, `audit:page-guard`, `audit:contract`. Pemilik:
`jalankan-antislop` lalu `jalankan-check` (termasuk tes salinan Mobile dan
`cargo test` Mobile), uji browser.

### 26.8 Pertanyaan untuk pemilik (Fase 8)

| No | Pertanyaan | Usulan | Alasan |
| :-- | :-- | :-- | :-- |
| Q-152 | Urutan sub-fase: transfer → laporan → reimbursement → layar? | Ya | Transfer paling sempit dan tidak bergantung yang lain; skema v73 sekali di 8a untuk semuanya |
| Q-153 | Berkas transfer: (a) Excel umum + format kustom dari Pengaturan; (b) Excel umum saja dulu? | (a) | Bank menuntut urutan kolom sendiri; tanpa format kustom TU tetap menyalin manual |
| Q-154 | Ada template resmi terbaru (impor bukti potong Coretax, unggah upah SIPP/e-Dabu) atau contoh berkas transfer bank yang dipakai sekolah? | Kirim bila ada; tanpa itu berhenti di Excel rekap | Format resmi berubah dan tidak boleh ditebak |
| Q-155 | Data pemotong: (a) tabel khusus cloud `app_lapor_setting`; (b) kolom `company_profile`; (c) `setting_gex_system`? | (a) | Tidak perlu ada di terminal scanner; (b) menyentuh keempat lapis tabel platform |
| Q-156 | Masa laporan = run `PAID` dengan `period_start` di bulan itu? | Ya | Sama dengan aturan Fase 0; run yang belum dibayar belum dipotong |
| Q-157 | Rekap A1 tahunan dari `pajak` masa terakhir (Pasal 17 sudah ada sejak Fase 0)? | Ya, sebagai rekap Excel, bukan formulir resmi | Bahan sudah lengkap di slip; bentuk resmi menunggu template Q-154 |
| Q-158 | WLKP (wajib lapor ketenagakerjaan) ikut? | Tidak di Fase 8 | Butuh kolom kewarganegaraan dan data yang belum ada; sekolah negeri tidak wajib |
| Q-159 | Bank pada data lama yang tidak cocok daftar: biarkan dan tandai `bank_tidak_dikenal`? | Ya, tanpa menulis ulang `hr_profil` | Pola perusahaan; TU memperbaiki per pegawai |
| Q-160 | Reimbursement: (a) tabel sendiri khusus cloud; (b) kelompok baru di `hr_pengajuan` dengan bangun ulang CHECK di cloud dan setiap perangkat? | (a) | (b) membongkar lima tabel tersinkron dan memaksa semua perangkat diperbarui |
| Q-161 | Cara bayar reimbursement di Fase 8: (a) pembayaran terpisah saja, mode masuk gaji ditunda; (b) masuk gaji juga, dengan tabel klaim tersinkron? | (a) | Rekap gaji Desktop membaca SQLite lokal; klaim khusus cloud membuat gaji bersih Web ≠ Desktop |
| Q-162 | Klaim terkunci sesudah keputusan pertama (koreksi = batal lalu ajukan ulang)? | Ya | Lebih sederhana dari sidik isi Fase 2; klaim satu nota jarang disunting |
| Q-163 | Pembukuan pembayaran reimbursement: (a) jurnal manual + akun bawaan `akun-beban-reimburse`; (b) jurnal otomatis dengan bangun ulang CHECK `keu_jurnal.sumber`? | (a) | `keu_jurnal` tersinkron; bangun ulang CHECK menyentuh semua perangkat |
| Q-164 | Izin memutus dan membayar dipisah (`hr.reimburse.decide` ≠ `hr.reimburse.pay`)? | Ya | Di sekolah pemutus (kepala sekolah) dan pembayar (bendahara) biasanya orang berbeda |
| Q-165 | Kejadian Telegram "klaim baru menunggu" di bidang kepegawaian? | Tidak di Fase 8 | Perangkat lama membatalkan kejadian yang tidak dikenalnya; tambah sesudah semua perangkat v73 |
| Q-166 | Layar Mobile untuk transfer, laporan, reimbursement? | Tidak | Pekerjaan meja keuangan; HRIS Mobile masuk daftar §14 |
| Q-167 | Cakupan unit (A-5) berlaku untuk memutus reimbursement? | Ya | Konsisten dengan pengajuan cuti; Yayasan memegang `hr.scope.all` |

### 26.9 Penanda yang ditinjau pemilik

- **Aplikasi menyusun berkas dan rekap; transfer, melapor, dan menyetor tetap
  manual** di internet banking dan portal masing-masing.
- **Angka laporan = angka yang dipotong slip.** Slip yang keliru ikut keliru di
  laporan; slip lama tidak dihitung ulang.
- `PAID` tetap ditandai manual sesudah transfer berhasil.
- Reimbursement di Fase 8 dibayar terpisah, tidak masuk slip gaji.
- Semua bagian Fase 8 butuh koneksi ke database (khusus cloud), Desktop
  sekalipun.

### 26.10 Jawaban Fase 8 (19 Nov 2026)

Q-152 sampai Q-167 **disetujui semua sesuai usulan** §26.8. Akibatnya:
format kustom transfer ikut (Q-153 (a), sepuluh tabel); template resmi
belum diberikan (Q-154), jadi laporan berhenti di Excel rekap sampai template
datang; reimbursement khusus cloud, dibayar terpisah, jurnal manual, izin
memutus dan membayar dipisah, cakupan unit berlaku. Pengerjaan mulai dari 8a.

### 26.11 Sudah dibangun

**8a (19 Nov 2026), belum di-commit, `bun run check` belum oleh pemilik.**

- Skema v73 (sentinel `-2049` `hris-transfer-lapor-reimburse-v1`, nama
  versi `hris-transfer-lapor-reimburse`): kesepuluh tabel §26.3 di
  `turso.rs::ensure_schema` + blok v73 `db-migrations.ts` (DDL dibangkitkan
  dari satu sumber, identik), seed `bank-bawaan.json` (25 bank: daftar HRIS
  perusahaan + BPD DIY, Jateng, Jatim, Sumut, Nagari, Bali; kode BI bisa
  disunting di Pengaturan) dan lima jenis reimbursement lewat
  `ensure_hris_transfer_v73`. `REQUIRED_TABLE_COUNT` 137 → 147.
- `audit:contract` sebelum → sesudah (dihitung dari selisih): command Desktop
  445 → 450, Mobile 450 → 455, izin 136 → 141, tabel snapshot tetap 81, tanpa
  rute sync baru.
- RBAC: lima izin `hr.reimburse.*` (sort 1433–1437); `decide`/`pay` sensitif,
  `view` rahasia; paket §26.4 di `ROLE_HRIS_BAWAAN` ↔ `DEFAULT_ROLE_PERMISSIONS`.
  `payroll.export` tetap di paket Admin seperti sebelumnya; laporan 8b tetap
  hanya Superadmin karena juga butuh `hr.finance.view`.
- Modul `desktop/transfer.rs` ↔ `validations/transfer.ts` +
  `services/transfer.ts`; command `desktop_transfer_banks|settings|settings_save|preview|export`,
  rute `POST /api/payroll/transfer/{banks/query,settings/query,settings/save,preview,export}`,
  gateway `gateways/payroll.ts` (`muatBankAktif`, `muatPengaturanTransfer`,
  `simpanPengaturanTransfer`, `pratinjauTransfer`, `unduhTransfer`).
  `hr_reimburse.rs` ↔ `hr-reimburse.ts` baru berisi seed jenis (8c mengisinya).
- Tes: `transfer.test.ts` (vektor, SQL/pesan harfiah terhadap kedua
  `transfer.rs`, izin unduh, render CSV/TXT), `services/transfer.test.ts`,
  `cargo test transfer` 6 lulus (vektor, bank bawaan, sentinel `-2048` → v73
  dengan seed diulang, alur cloud). Data uji bersama `services/transfer.uji.sql`.

Penyimpangan, untuk ditinjau:

- **`render_format` hanya di TS** (`renderTeks`), seperti HRIS perusahaan:
  berkas disimpan layar lewat `saveFileWithPicker`, jadi perender Rust tidak
  pernah dipanggil. Vektor render diuji di TS saja.
- **Pratinjau dan unduh dua command** (§26.5), satu fungsi
  `berkas_transfer(..., catat)`. Simpan pengaturan = draft `{ aksi, id, data }`.
- **`pegawai_keluar` hanya peringatan** (baris tetap masuk berkas), sama
  dengan `nama_berbeda`: gaji terakhir pegawai keluar tetap dibayar.
- **Belum dibangun di 8a**: Excel umum dan xlsx format kustom (butuh opsi
  tanpa baris judul di `client/xlsx.ts`), dipasang bersama layar di 8d.
- **Bug lama diperbaiki**: `database-promotion.test.ts` gagal sejak 7a karena
  `hr_pelatihan_peserta` bergantung pada `hr_dokumen`, sedangkan keenam tabel
  HRIS 1c (`hr_profil`, `hr_pendidikan`, `hr_sertifikasi`, `hr_dokumen_jenis`,
  `hr_dokumen`, `hr_dokumen_berkas`) tidak ada di `PROMOTION_PLAN`. Keenamnya
  kini masuk sebagai "Lapisan 5b". Catatan: `PROMOTION_PLAN` belum punya
  pemakai selain tesnya, dan tabel tersinkron (mis. `siswa_data`, `keu_*`,
  `hr_pengajuan`) juga belum terdaftar; melengkapinya baru berguna bila skrip
  promosi benar-benar dibangun.
