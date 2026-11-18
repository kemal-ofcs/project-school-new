# PRD HRIS — Fase 4

Bagian §22 dari `prd-hris.md`, dipindahkan apa adanya pada 2026-11-18 supaya satu sesi cukup membaca satu fase. Nomor bagian tidak berubah: rujukan `prd-hris.md §22.x` di kode menunjuk ke berkas ini. Istilah, keputusan pemilik (§5), hak akses umum (§15), dan sinkronisasi (§17) ada di `prd-hris.md`.

## 22. Urutan pengerjaan Fase 4

Ditulis setelah menelusuri kode sekolah (15 Nov 2026) sesudah Fase 3 lengkap
(§21.12). Bila §10 dan bagian ini berbeda, **bagian ini yang berlaku** setelah
Q-73 sampai Q-90 dijawab. Belum ada kode yang diubah.

Ringkasnya: **v70, sentinel `-2046`**, empat tabel **khusus cloud** (`hr_sp`,
`hr_keluar`, `hr_keluar_rincian`, `hr_keluar_alasan`) ditambah satu kolom
tersinkron `master_data.id_keluar`; tujuh izin baru; tanpa tabel snapshot atau
rute sync baru. Pola dan vektor diambil dari HRIS perusahaan §20 (fase 5);
kodenya ditulis ulang untuk skema, status kepegawaian, dan gaji sekolah.

### 22.1 Temuan dari kode

Diverifikasi ke kode sekolah (baris per 15 Nov 2026).

**Salah atau perlu diubah:**

1. **Status aktif bisa hidup lagi tanpa disadari (zombie).** Penulis
   `master_data.status_aktif` hari ini:
   - lokal `update_employee` (`operational.rs:529`, `COALESCE(NULLIF(?,
     ''), status_aktif)`) dan `set_employee_status` (`operational.rs:712`,
     `employees.manage`, siapa saja, kapan saja);
   - lokal `save_teacher` (`academic.rs:1679`): status kosong di draft =
     `'Aktif'` (`academic.rs:1717`);
   - handler cloud `employee/create|update` (`turso.rs:11076`, `status_aktif =
     excluded.status_aktif` di `:11125` dan `:11218`) dan `employee/status`
     (`turso.rs:11274`, payload tanpa status = `'Aktif'`);
   - Web `updateKaryawan`, `toggleStatusKaryawan`, `importKaryawanMassal`
     (`services/employee.ts:388`, `:585`, `:87`) dan `saveTeacher`
     (`services/academic/personnel.ts:75`, `status_aktif || "Aktif"`, upsert
     `:159`).

   Event `employee/update` dari perangkat yang luring sebelum keluar berlaku
   menulis `'Aktif'` lagi di cloud, dan tarikan tidak menimpa baris yang masih
   punya outbox tertunda. Keluar butuh penanda yang dibaca semua penulis itu
   (Q-80).
2. **"Hapus guru" menghapus `guru_data` secara permanen.** Lokal
   `delete_teacher` (`academic.rs:1950`), handler cloud `teacher/delete`
   (`turso.rs:13887`), dan Web (`personnel.ts:254`) melakukan `DELETE FROM
   guru_data` lalu menonaktifkan `master_data`. Hari ini itulah cara guru
   "keluar"; NIP, NUPTK, gelar, dan `status_kepegawaian` (cadangan
   `STATUS_KINI_SQL`, `hris.rs:311`) ikut hilang, jadi surat keterangan
   pengalaman dan rekap lama kehilangan identitasnya. Keluar Fase 4 tidak
   menyentuh `guru_data` (Q-90).
3. **Sesi akun pegawai yang sudah keluar tetap jalan di perangkat.** Sesi Web
   sudah menolak akun `master_operator.status <> 'Aktif'`
   (`auth/session-store.ts:80`). Desktop/Mobile tidak: login luring hanya
   memeriksa TOTP (`commands.rs:422`), dan `require_any_permission`
   (`commands.rs:49`) tidak melihat personil tertaut (`models.rs:47`
   `id_karyawan`). Vault luring akun yang dinonaktifkan tetap bisa dipakai
   sampai perangkat itu login daring.
4. **Gaji terakhir bisa terlewat.** Rekap gaji memuat personil nonaktif hanya
   bila ada `absensi_harian` atau `presensi_mapel` di periode itu
   (`payroll/commands.rs:1670` ↔ `payroll-recap.ts:420`). Pegawai yang hari
   terakhirnya diisi cuti dibayar (Fase 2b, tanpa absensi) atau yang rapelnya
   masih `Menunggu` (batas v51) tidak masuk proses gaji periode keluarnya.
5. **Rekonsiliasi Pasal 17 bergantung urutan.** `masa_terakhir`
   (`payroll/pajak.rs:262`) memicu hitung ulang setahun bila `keluar_pada`
   (`KOLOM_PAJAK_SQL`, `pajak.rs:564`: `tanggal_selesai_aktif` bila nonaktif)
   jatuh di masa run. Run masa terakhir yang dibuat SEBELUM keluar berlaku
   memakai TER biasa; run lama tidak pernah dihitung ulang (Fase 0).
6. **Sekolah tidak punya pilihan "sisa cuti diuangkan".** `SISA_CUTI` hanya
   `hangus`/`dibawa` (`hr_pengajuan.rs:854`); uang sisa cuti hanya bisa muncul
   sebagai UPH di rincian keluar (Q-83).
7. **Pinjaman barang tidak bisa disaring per orang.** `list_loans`
   (`inventory.rs:3041`) mengembalikan semua pinjaman terbuka tanpa
   `penerima_id`; kolomnya ada (`inventory.rs:981`). Checklist butuh potongan
   SQL sendiri, dengan predikat "belum kembali" salinan harfiah.
8. **Kartu ID tidak punya status ditarik.** `id_card` hanya `idcard_status`
   cetak (`storage.rs:639`). Ditarik = centang manual di `hr_keluar`, tanpa
   kolom baru di tabel tersinkron.
9. **Izin baru = versi baru** (§21.1 temuan 3). Fase 4 memang butuh tabel, jadi
   v70 tidak terhindarkan; perangkat v69 berhenti sinkron sampai diperbarui
   (`sync.rs:23`). Sisi baiknya: setiap perangkat yang mendorong outbox sesudah
   itu menjalankan handler cloud yang sudah dinormalkan (temuan 1).

**Sudah ada, dipakai ulang (tidak dibuat dua kali):**

- **Jalur khusus cloud**: `klien_cloud` (`commands.rs:3191`), `PESAN_LURING`
  dan `luring` (`hris_cloud.rs:35`, `:415`), pola `hr_profil`/`hr_dokumen`
  (Fase 1c) dan `hr_pengajuan_berkas` (Fase 2c).
- **Tanggal**: `tambah_bulan` (`hris.rs:445`), hari ini WIB `HARI_INI_SQL`
  (`hris.rs:322`); `masaKerja` (`components/kepegawaian/gaya.ts`).
- **Status kini pada tanggal**: `STATUS_KINI_SQL` (`hris.rs:311`), dipakai
  untuk menentukan aturan pesangon (GTY/PTY vs GTT/PTT vs lainnya).
- **Cakupan unit** `dalam_cakupan` (`hr_pengajuan.rs:626`) ↔ kembaran TS;
  `id_karyawan` sesi untuk "tidak untuk diri sendiri".
- **Tugas berlaku dan wali kelas**: `TUGAS_BERLAKU_SQL` (`hris.rs:341`),
  `WALI_KELAS_SQL` (`:343`); jadwal `jadwal_mengajar` (`is_aktif`,
  `id_tahun_ajaran`, `storage.rs:2100`).
- **Kasbon**: sisa efektif `pokok − BAYAR_SQL − PENDING_SQL`, `pinjaman_aktif`
  (`loan.rs:1009`); Pelunasan Tunai `pay_off_loan` (`loan.rs:856`).
- **Rapel Menunggu**: `MENUNGGU_SQL` (`rapel.rs:279`).
- **Sisa cuti**: `jatah_cuti` (`hr_pengajuan.rs:971`) ↔ `jatahCuti`.
- **Pengajuan dan JP**: `PENGAJUAN_AKTIF_ORANG_SQL`, `PENANGANAN_SQL` (Fase 2).
- **Akun tertaut**: `master_operator.id_karyawan`, satu akun aktif per pegawai
  (`turso.rs:7491`).
- **Cetak**: `components/cetak-a4.ts`, `suratKepegawaian.ts`,
  `DialogCetakSurat.tsx`, `KEPALA_UNIT_SQL`/`IDENTITAS_PEGAWAI_SQL`
  (`hr_beban.rs:39`, `:42`), pengaturan `hr_surat_*` (Fase 3b).
- **Slip beku** `payroll_items.basic_salary`, `teaching_salary`
  (`storage.rs:1544`) untuk dasar upah (Q-82).

**Kait:**

- Versi sekarang: `CURRENT_SCHEMA_VERSION` 69, `REQUIRED_TABLE_COUNT` 122
  (`db-schema.ts:5-6`), `CLIENT_SCHEMA_VERSION` 69 (`sync.rs:23`), sentinel
  `-2045` (`turso.rs:5427`, pemeriksa `:5841`).
- `audit:contract` 15 Nov 2026: 145 rute kanonik, 81 tabel snapshot, command
  Desktop 411 / Mobile 416, 120 permission; rute Web 301
  (`src/app/api/**/route.ts`).
- RBAC: `SENSITIVE_MUTATION_PERMISSIONS` (`catalog.ts:545`),
  `CONFIDENTIAL_PERMISSIONS` (`:654`), paket HRIS (`:712-764`) ↔
  `ROLE_HRIS_BAWAAN` (`turso.rs`). Kepala Sekolah tidak memegang
  `hr.scope.all`, jadi dibatasi unitnya.
- Telegram: `BIDANG_KEJADIAN` (`validations/telegram.ts:39`), tiga bidang.

### 22.2 Rancangan per bagian

#### 22.2.1 Surat peringatan

- **Isian** (`validasi_sp` ↔ `validasiSp`): pegawai aktif (bukan siswa);
  `tanggal` ≤ hari ini WIB dan ≥ `tanggal_daftar`; `pelanggaran` 1–2.000
  karakter; `harapan` dan `alasan_tingkat` ≤ 1.000; `nomor` ≤ 80. Tidak untuk
  diri sendiri. Dalam cakupan unit (`dalam_cakupan`) kecuali `hr.scope.all`.
- **Masa berlaku**: `berlaku_sampai = tambah_hari(tambah_bulan(tanggal,
  masa_bulan), -1)`; `masa_bulan` dibekukan per SP dari `hr_sp_masa_bulan`
  (bawaan 6, 1–12). Vektor perusahaan dipakai ulang (10 Jan + 6 → 9 Jul; 31
  Agu + 6 → 27 Feb).
- **Status turunan** (`status_sp` ↔ `statusSp`): `Dicabut` bila
  `dicabut_pada`; `Berlaku` bila `tanggal ≤ hari ini ≤ berlaku_sampai`; selain
  itu `Berakhir`.
- **Eskalasi** (`usulan_tingkat` ↔ `usulanTingkat`): SP Berlaku tertinggi + 1,
  tanpa SP Berlaku = SP1, maksimal SP3 (`sp3_berlaku` bila SP3 masih Berlaku →
  tombol "Mulai proses keluar", alasan bawaan PHK Pelanggaran). Tingkat lain
  dari usulan wajib `alasan_tingkat`.
- **SP3 butuh izin pemutus** `hr.warning.sp3` (Yayasan, §10); SP1/SP2 cukup
  `hr.warning.manage` dalam cakupan unit.
- **Penanda tangan**, dibekukan di baris (`penanda_nama`, `penanda_jabatan`,
  `penanda_nip`): bawaan SP1/SP2 kepala unit pegawai pada tanggal SP
  (`KEPALA_UNIT_SQL`, cadangan `company_profile.leader_*`), SP3 ketua yayasan
  (`hr_surat_yayasan_*`); boleh diubah di form.
- **Ubah**: `nomor`, `pelanggaran`, `harapan`, penanda tangan, selama belum
  dicabut. Tingkat dan tanggal terkunci; salah tingkat = cabut lalu buat ulang.
- **Cabut** (`hr.warning.cancel`): alasan wajib, sekali, tidak untuk diri
  sendiri.

#### 22.2.2 Pegawai keluar dan checklist

**Status turunan** (`status_keluar` ↔ `statusKeluar`): `Dibatalkan` bila
`dibatalkan_pada`; `Berlaku` bila `berlaku_pada`; `Jatuh tempo` bila
`tanggal_terakhir` ≤ hari ini WIB; selain itu `Dijadwalkan`.

**Catat dan ubah** (`hr.offboard.manage`; selama Dijadwalkan atau Jatuh tempo):
satu proses tidak dibatalkan per pegawai (diperiksa di transaksi cloud);
pegawai aktif; tidak untuk diri sendiri; `tanggal_terakhir` ≥
`tanggal_daftar`, boleh di masa depan; `tanggal_pemberitahuan` ≤
`tanggal_terakhir`; alasan aktif. Setiap simpan menghitung ulang usulan
(§22.2.3) dan menulis ulang rincian dalam satu batch. Selama belum berlaku,
`master_data` tidak berubah (pegawai tetap scan, ikut Alfa dan gaji).

**Checklist** (Q-77), dibaca dari cloud saat rincian dibuka dan sekali lagi di
dalam transaksi Berlakukan; SQL kembar Rust ↔ TS, teks dicek harfiah:

| Butir | Sumber | Sifat |
| :-- | :-- | :-- |
| Jadwal mengajar aktif | `jadwal_mengajar.is_aktif = 1` di semester yang `tanggal_selesai` > `tanggal_terakhir` | **Memblokir** Berlakukan: alihkan ke guru lain di Jadwal dulu |
| Wali kelas | rombel aktif semester yang `tanggal_selesai` > `tanggal_terakhir` dengan `id_wali_kelas` = pegawai | **Memblokir**: ganti wali di Rombel dulu |
| Tugas tambahan berlaku sesudah hari terakhir | `hr_tugas_tambahan` tidak dibatalkan, `tanggal_selesai` kosong atau > `tanggal_terakhir` | Tanda + tautan ke tab Tugas (diakhiri `hr.duty.manage`) |
| Barang dipinjam belum kembali | `PINJAMAN_PERSONIL_SQL`: potongan `list_loans` + `penerima_tipe = 'Personil' AND penerima_id = ?` | Tanda (Pengembalian tetap bisa dicatat sesudah keluar) |
| Sisa kasbon | pinjaman `Disetujui` dengan sisa efektif > 0 | Tanda + ringkasan "dikurangi sisa kasbon"; dilunasi lewat Pelunasan Tunai yang ada |
| Sisa cuti | `jatah_cuti` periode yang memuat `tanggal_terakhir` | Tanda; masuk baris UPH Cuti (Q-83) |
| Rapel Menunggu | `MENUNGGU_SQL` pegawai itu | Tanda: dibayar di proses gaji periode yang memuat `tanggal_terakhir` (Q-85) |
| Pengajuan dan JP pengganti sesudah hari terakhir | pengajuan Menunggu/berlaku dengan `tanggal_selesai` > `tanggal_terakhir`; `hr_jp_penanganan` dengan pengganti = pegawai sesudah tanggal itu | Tanda |
| Gaji masa terakhir sudah diproses | run bukan `REJECTED` yang `period_end` ≥ `tanggal_terakhir` dan bulan sama | Tanda: "PPh 21 masa terakhir tidak direkonsiliasi; tolak run itu lalu buat ulang sesudah Berlakukan" (temuan 5) |
| Akun operator tertaut | `master_operator.id_karyawan` | Otomatis dinonaktifkan saat Berlakukan |
| Kartu ID ditarik | `hr_keluar.kartu_ditarik` | Centang manual, tidak memblokir |

**Berlakukan** (`hr.offboard.decide`, sensitif; terbuka sejak
`tanggal_terakhir`). Satu batch pipeline cloud, setiap statement dijaga keadaan
`hr_keluar` yang sama sehingga tekan ganda tidak menggandakan:

1. Blokir diperiksa ulang di batch (`WHERE NOT EXISTS` jadwal/wali); gagal =
   pesan yang menyebut butirnya.
2. `hr_keluar`: `berlaku_oleh`, `berlaku_pada = datetime('now')`,
   `checklist_saat_berlaku` (potret JSON checklist + ringkasan); rincian
   terkunci.
3. `master_data`: `status_aktif = 'Nonaktif'`, `tanggal_selesai_aktif =
   tanggal_terakhir`, `id_keluar`.
4. `master_operator.status = 'Nonaktif'` untuk akun ber-`id_karyawan` itu;
   `app_session.revoked_at` akun itu.

Ditolak bila pegawai tertaut ke Superadmin aktif terakhir atau ke akun sesi
sendiri. `guru_data`, `hr_kontrak`, dan tugas tambahan **tidak diubah**
(riwayat tetap utuh; status kini tetap terbaca). Sesudahnya layar memanggil
`syncNow()`; trigger `sync_pulse` `master_data` memberi tahu perangkat lain.

**Batalkan** (`hr.offboard.decide`): alasan wajib, kapan saja, tidak untuk diri
sendiri. Bila sudah berlaku, batch yang sama mengembalikan `master_data`
(`status_aktif = 'Aktif'`, `tanggal_selesai_aktif` dan `id_keluar` kosong,
hanya `WHERE id_keluar = ?`). Akun operator tidak diaktifkan lagi (Superadmin
dari menu Operator). Kembali bekerja bertahun-tahun kemudian = pegawai baru.

**Normalisasi melawan zombie** (Q-80), satu potongan SQL per bahasa:

- Handler cloud `employee/create|update|status`: `status_aktif = CASE WHEN
  master_data.id_keluar IS NOT NULL THEN 'Nonaktif' ELSE <payload> END`,
  `tanggal_selesai_aktif` dipertahankan bila `id_keluar` terisi; payload
  `id_keluar` dari perangkat diabaikan. Tidak menolak (cloud tidak menolak
  karena urutan tiba). Web `services/employee.ts` (buat, ubah, status, impor)
  dan `saveTeacher` memakai potongan yang sama.
- Lokal `update_employee`, `set_employee_status`, `save_teacher`, impor:
  mengaktifkan pegawai ber-`id_keluar` ditolak ("Pegawai ini sudah keluar.
  Batalkan proses keluarnya di Kepegawaian untuk mengaktifkannya lagi."), isian
  status dan tanggal selesai dari draft diabaikan.
- **Penjaga sesi** (temuan 3): login luring dan `require_any_permission`
  menolak sesi yang `id_karyawan`-nya menunjuk `master_data` lokal ber-`id_keluar`
  (bukan setiap nonaktif). Berlaku untuk semua akun termasuk Superadmin;
  personil yang belum ada di SQLite perangkat tidak ditolak.
- **Hapus guru** ditolak untuk pegawai ber-`id_keluar` (Q-90).

#### 22.2.3 Pesangon dan kompensasi

Fungsi murni `usulan_pesangon` ↔ `usulanPesangon`, aritmetika bilangan bulat
(`i64` ↔ `number` < 2^53), pembulatan rupiah setengah ke atas, vektor bersama
`hr-keluar.vektor.json` (vektor perusahaan §20.5 diambil, ditambah kasus
status sekolah). Dihitung dari cloud oleh kedua jalur (Desktop lewat
`TursoClient`), jadi masukannya satu sumber.

**Aturan per status kini pada `tanggal_terakhir`** (Q-81):

| Status | Baris usulan |
| :-- | :-- |
| GTY, PTY | UP, UPMK menurut pengali alasan; UPH Cuti bila alasan ber-`uph`; Uang Pisah bila alasan ber-`uang_pisah` (0, diisi) |
| GTT, PTT | Kompensasi PKWT bila alasan ber-`kompensasi_pkwt` dan kontrak berlaku pada `tanggal_terakhir` ber-`tanggal_selesai`: bulan = max(`bulan_penuh(kontrak.tanggal_mulai, akhir)`, 1), `(upah × bulan + 6) / 12`; UPH Cuti bila ber-`uph` |
| Honorer, tanpa status | Hanya baris yang diisi tangan (usulan 0) |
| PNS, PPPK | Tanpa baris (bukan pegawai yayasan); alasan biasanya "Ditarik Instansi" |

**Masa kerja** dari `tanggal_daftar` sampai `tambah_hari(tanggal_terakhir,
1)`; `bulan_penuh` dan rumus UP/UPMK sama dengan perusahaan:

- UP: kelipatan `min(tahun + 1, 9)`, `(upah × kelipatan × pengali_up + 50) / 100`.
- UPMK: 0 bila < 3 tahun, 10 bila ≥ 24, selain itu `tahun / 3 + 1`; pengali
  `pengali_upmk`.
- `tanggal_daftar` kosong = UP dan UPMK 0 dengan dasar "tanggal masuk kosong".

**Upah sebulan** (Q-82): rata-rata penghasilan per bulan dari slip run `PAID`
dengan `period_end` dalam 12 bulan sebelum `tanggal_terakhir`:
`Σ(basic_salary + teaching_salary) / jumlah bulan berbeda substr(period_end,
1, 7)` (analog Pasal 157 ayat 3 UU 13/2003 untuk upah satuan). Tanpa slip =
0, wajib diisi. Lembur dan tunjangan tidak ikut. **Tunjangan tetap** diisi
Kepegawaian (bawaan 0); komponen ALLOWANCE aktif yang berlaku ditampilkan
sebagai acuan. Upah = upah pokok + tunjangan tetap, maks 1.000.000.000; upah
pokok yang beda dari usulan wajib `alasan_upah`.

**UPH Cuti** (Q-83): `sisa × upah ÷ pembagi`, pembagi 25 bila shift pegawai
punya ≥ 6 hari kerja, 21 bila kurang (`tbl_shift.hari_kerja`, kosong = 7 hari →
25). Hanya sisa > 0 dan bukan `sebelum_berhak`.

**Alasan bawaan** (`validations/hr-keluar-alasan-bawaan.json`, seed `INSERT OR
IGNORE` cloud saja, **wajib dicek ulang yayasan/konsultan**; pengali dalam
persen, semua bisa disunting):

| `id_alasan` | Nama | UP | UPMK | UPH | Komp. PKWT | Uang pisah |
| :-- | :-- | --: | --: | :--: | :--: | :--: |
| `klr-resign` | Mengundurkan Diri | 0 | 0 | ya | | ya |
| `klr-habis-kontrak` | Habis Kontrak | 0 | 0 | ya | ya | |
| `klr-efisiensi` | PHK Efisiensi | 100 | 100 | ya | | |
| `klr-pelanggaran` | PHK Pelanggaran (SP3) | 50 | 100 | ya | | |
| `klr-pensiun` | Pensiun | 175 | 100 | ya | | |
| `klr-meninggal` | Meninggal Dunia | 200 | 100 | ya | | |
| `klr-sakit` | Sakit Berkepanjangan | 200 | 100 | ya | | |
| `klr-instansi` | Ditarik Instansi (PNS/PPPK) | 0 | 0 | | | |
| `klr-lainnya` | Lainnya | 0 | 0 | ya | | |

**Ringkasan** (tidak disimpan kecuali di potret Berlakukan): total rincian,
"dikurangi sisa kasbon", "perkiraan diterima". Rincian beku sejak berlaku;
koreksi sesudahnya = Batalkan lalu catat ulang. Pembayaran dicatat lewat jurnal
manual; PPh 21 final pesangon dihitung manual.

#### 22.2.4 Gaji terakhir

Predikat rekap gaji di ketiga titik hitung (pratinjau dan pembekuan Rust,
`computePayrollRecap` TS) mendapat satu potongan SQL kembar
`KELUAR_DI_PERIODE_SQL`, dicek harfiah: `OR (md.id_keluar IS NOT NULL AND
md.tanggal_selesai_aktif >= ?1)`. Pegawai keluar ikut proses gaji periode yang
memuat hari terakhirnya walau tanpa absensi, jadi cuti dibayar, rapel
`Menunggu`, potongan kasbon, dan Pasal 17 masa terakhir (`masa_terakhir`
sudah membaca `tanggal_selesai_aktif`) ikut tanpa kode tambahan. Sesudah
periode itu ia tidak masuk lagi. Run masa terakhir yang terlanjur dibuat
sebelum Berlakukan hanya ditandai di checklist (temuan 5).

#### 22.2.5 Cetak

Memakai `cetak-a4.ts`, `suratKepegawaian.ts`, dan `DialogCetakSurat` (3b);
Web/Desktop saja.

| Dokumen | Kapan | Penanda tangan |
| :-- | :-- | :-- |
| **Surat Peringatan** (SP1/SP2/SP3) | baris SP mana pun; yang dicabut tercetak dengan tanda DICABUT | dibekukan di baris SP |
| **SK Pemberhentian** | keluar Berlaku, status GTY/PTY | ketua yayasan |
| **Surat Keterangan Pengalaman Kerja** | keluar Berlaku, semua status kecuali PNS/PPPK | kepala unit pegawai pada tanggal surat |

Isi SP: nomor, tanggal, kepada (nama, NIP/NUPTK, jabatan, unit), tingkat,
pelanggaran, harapan, masa berlaku, penanda tangan, kolom tanda terima. Rincian
pesangon tidak dicetak.

**Nomor** (Q-74): pola Q-59 (`hr_surat_pola:sp`, `:berhenti`,
`:pengalaman`, kode bawaan `SP`, `SK-BERHENTI`, `SKET-KERJA`; urut diketik
dari buku agenda). Nomor final SP **disimpan** ke `hr_sp.nomor`, nomor SK dan
surat keterangan ke `hr_keluar.nomor_sk`/`nomor_keterangan`. Nomor yang sama
dengan baris lain ditandai di dialog, tidak ditolak. Tanpa penghitung dan
tanpa register: buku agenda tetap sumber urutnya.

#### 22.2.6 Telegram

Tidak ada kejadian baru (Q-87). "SP berakhir" sudah di daftar Fase 6 (§12);
"pegawai keluar berlaku" ikut dirancang di sana bersama bidang `kepegawaian`.
Isi SP, alasan keluar, dan nominal pesangon tidak pernah dikirim.

### 22.3 Model data dan sinkronisasi

**Kenapa khusus cloud (Q-73).** Isi SP dan pesangon adalah data rahasia
(pola `hr_profil`, Q-33); Berlakukan wajib menulis `master_operator` dan
`app_session` yang memang khusus cloud, dalam satu batch; kejadiannya jarang
dan diputus satu orang, jadi tidak ada dua perangkat luring yang perlu digabung.
Karena itu pencabutan SP dan pembatalan keluar adalah **kolom yang diisi
sekali** (`WHERE dicabut_pada IS NULL`, jam database), bukan baris
`batal-<id>`; status tetap diturunkan, tidak disimpan. `hr_pesangon_pengali`
(§17) tidak dibuat: pengali satu baris dengan alasannya.

**Khusus cloud** (`turso.rs` + `db-schema.ts`/`db-migrations.ts`; tidak di
`storage.rs`, snapshot, atau outbox; tanpa `UNIQUE` selain PK):

| Tabel | Kolom |
| :-- | :-- |
| `hr_sp` | `id_sp` PK (`sp-<acak>`); `id_karyawan` NOT NULL; `tingkat` CHECK IN (`SP1`, `SP2`, `SP3`); `usulan_tingkat` CHECK sama; `alasan_tingkat`; `tanggal` NOT NULL; `masa_bulan` INTEGER NOT NULL CHECK 1–12; `berlaku_sampai` NOT NULL; `nomor`; `pelanggaran` NOT NULL; `harapan`; `penanda_nama`, `penanda_jabatan` NOT NULL, `penanda_nip`; `unit` (salinan unit pegawai, untuk cakupan); `dicatat_oleh`, `created_at`; `diubah_oleh`, `diubah_pada`; `dicabut_oleh`, `dicabut_pada`, `alasan_cabut`. Indeks `(id_karyawan, tanggal)` |
| `hr_keluar_alasan` | `id_alasan` PK; `nama` NOT NULL; `pengali_up`, `pengali_upmk` INTEGER NOT NULL CHECK 0–1000; `uph`, `kompensasi_pkwt`, `uang_pisah`, `is_aktif` INTEGER CHECK (0,1); `dasar_hukum`; `created_at`, `updated_at` |
| `hr_keluar` | `id_keluar` PK (`klr-<acak>`); `id_karyawan` NOT NULL; `id_alasan` NOT NULL, `alasan_nama` (salinan); `id_sp`; `status_kepegawaian` (salinan status kini saat simpan); `tanggal_pemberitahuan`; `tanggal_terakhir` NOT NULL; `keterangan`; `masa_kerja_mulai`; `upah_pokok`, `usulan_upah_pokok`, `tunjangan_tetap` INTEGER CHECK ≥ 0; `alasan_upah`; `kartu_ditarik` CHECK (0,1); `catatan_checklist`; `checklist_saat_berlaku`; `nomor_sk`, `nomor_keterangan`; `dicatat_oleh`, `created_at`, `diubah_oleh`, `diubah_pada`; `berlaku_oleh`, `berlaku_pada`; `dibatalkan_oleh`, `dibatalkan_pada`, `alasan_batal`. Indeks `id_karyawan`, `tanggal_terakhir` |
| `hr_keluar_rincian` | `id_rincian` PK (`<id_keluar>:<komponen>`); `id_keluar` NOT NULL; `komponen` CHECK IN (`UP`, `UPMK`, `UPH Cuti`, `UPH Lainnya`, `Kompensasi PKWT`, `Uang Pisah`, `Lainnya`); `dasar`; `usulan`, `nominal` INTEGER NOT NULL CHECK ≥ 0; `alasan_ubah` (wajib bila beda); `urutan`. Indeks `id_keluar` |

**Tersinkron**: kolom `master_data.id_keluar TEXT` di keempat lapis (`CREATE`
+ `ensure_column` lokal/cloud + `ALTER TABLE` TS sesudah rebuild apa pun),
`SNAPSHOT_TABLES.columns` `master_data` (`sync.rs:103`) ↔ `SNAPSHOT_SOURCES`,
JSON trigger `sync_pulse` (`sync.rs:2758`), dan `storage.rs` Mobile (tangan).
Hanya ditulis transaksi cloud Berlakukan/Batalkan; tidak ada rute, handler
`employee/*` dan perangkat tidak pernah menulisnya.

**Pengaturan** (`setting_gex_system`): `hr_sp_masa_bulan` (6, 1–12) lewat
`desktop_hr_settings_save` (kini lima isian wajib); `hr_surat_pola:sp|berhenti|pengalaman`
lewat `desktop_hr_letter_settings_save` (12 → 15 kunci wajib). Kedua tipe draft
TS wajib, jadi `tsc` menunjuk setiap pembangun.

**Versi dan angka:**

| | Sekarang | Sesudah Fase 4 |
| :-- | :-- | :-- |
| Skema / sentinel | v69 / `-2045` | v70 / `-2046` `hris-keluar-v1` (+ daftar sentinel tes `turso.rs`, versi tes RBAC) |
| `REQUIRED_TABLE_COUNT` | 122 | 126 (+4 khusus cloud; `schema-consistency.test.ts`, daftar harapan khusus cloud `audit-sync-contract.ts`) |
| Tabel snapshot | 81 | 81 (`master_data` +1 kolom) |
| Rute kanonik | 145 | 145 |
| Permission | 120 | 127 |
| Command Desktop / Mobile | 411 / 416 | 420 / 425 |
| Rute Web | 301 | 310 |

`PROMOTION_PLAN` (`server/database-promotion.ts`) mendapat keempat tabel
(`hr_keluar_rincian` sesudah `hr_keluar`, keduanya sesudah `master_data`);
semuanya dibuang saat pindah database seperti tabel HRIS lain. Seed alasan
hanya di cloud sesudah `CREATE`, aman karena tidak lewat outbox.

### 22.4 Hak akses

| Izin | Sensitif | Rahasia | Paket bawaan |
| :-- | :-- | :-- | :-- |
| `hr.warning.view` | | ya | Yayasan, Kepala Sekolah, Kepegawaian |
| `hr.warning.manage` (SP1/SP2, ubah teks) | | ya | Yayasan, Kepala Sekolah |
| `hr.warning.sp3` | ya | | Yayasan |
| `hr.warning.cancel` | ya | | Yayasan |
| `hr.offboard.view` | | ya | Yayasan, Kepegawaian |
| `hr.offboard.manage` (catat, ubah, rincian, checklist manual) | | ya | Yayasan, Kepegawaian |
| `hr.offboard.decide` (Berlakukan, Batalkan, alasan dan pengali) | ya | | Yayasan |

- Sensitif → `SENSITIVE_MUTATION_PERMISSIONS`; rahasia →
  `CONFIDENTIAL_PERMISSIONS`; keduanya `NOT IN` seed Admin Rust
  (`ADMIN_DEFAULT_EXCLUDED_PERMISSIONS`). Admin bawaan tidak mendapat satu pun.
- Paket: `DEFAULT_ROLE_PERMISSIONS` ↔ `ROLE_HRIS_BAWAAN`. Kepala TU tidak
  mendapat apa pun bawaan (cakupan unit tidak membedakan guru/tendik);
  Superadmin memberi lewat Role & Akses.
- **Sekolah negeri** (Q-15): `hr.warning.sp3` dan `hr.offboard.decide`
  diberikan ke Kepala Sekolah lewat Role & Akses, tanpa kode khusus.
- Cakupan unit (`dalam_cakupan`, dari sesi): membuat/mengubah SP, SP3, catat
  keluar, Berlakukan, Batalkan; `hr.scope.all` lintas unit. Tidak untuk diri
  sendiri. Membaca daftar: izin view saja.
- Tidak ada area baru; tab baru di `/kepegawaian` memeriksa izinnya sendiri
  (`auth/access.ts:108`), backend memeriksa ulang.

### 22.5 Command, rute, gateway, dan layar

**Rust**: modul baru `desktop/hr_keluar.rs` (aturan murni, SQL kembar, I/O
cloud lewat `klien_cloud`, tanpa koneksi = `PESAN_LURING`); `filesToSync`,
`pub mod` di kedua `mod.rs`; terdaftar di kedua `lib.rs`, `build.rs`,
`capabilities/default.json`, `permissions/autogenerated`.

| Command | Izin | Rute Web (`POST`) |
| :-- | :-- | :-- |
| `desktop_hr_warnings` (riwayat per pegawai + usulan tingkat + penanda bawaan, atau daftar SP Berlaku) | `hr.warning.view` | `/api/kepegawaian/warnings/query` |
| `desktop_hr_warning_save` | `hr.warning.manage` (+ `hr.warning.sp3` untuk SP3) | `/warnings/save` |
| `desktop_hr_warning_revoke` | `hr.warning.cancel` | `/warnings/revoke` |
| `desktop_hr_offboardings` (daftar + status) | `hr.offboard.view` / `.manage` | `/offboarding/query` |
| `desktop_hr_offboarding` (rincian atau pratinjau: header, rincian, usulan, checklist) | `hr.offboard.view` / `.manage` | `/offboarding/detail` |
| `desktop_hr_offboarding_save` | `hr.offboard.manage` | `/offboarding/save` |
| `desktop_hr_offboarding_apply` | `hr.offboard.decide` | `/offboarding/apply` |
| `desktop_hr_offboarding_cancel` | `hr.offboard.decide` | `/offboarding/cancel` |
| `desktop_hr_exit_reasons_save` | `hr.offboard.decide` | `/offboarding/reasons` |

Semua rute: Zod `.strict()`, `assertSameOriginMutation`,
`requireWebPermission`/`requireAnyWebPermission`. Web:
`validations/hr-keluar.ts` + `services/hr-keluar.ts`, gateway
`gateways/hris.ts`.

**Berubah tanpa command baru**: `desktop_hr_settings_save` (+`hr_sp_masa_bulan`),
`desktop_hr_letter_settings_save` (+3 pola), `update_employee`,
`set_employee_status`, `save_teacher`, `delete_teacher`, impor karyawan, login
luring, `require_any_permission`, handler cloud `employee/*`, rekap gaji tiga
titik, daftar karyawan/guru (membawa `id_keluar`).

**Layar (Web/Desktop, Q-88):**

1. Rincian pegawai di `/kepegawaian`: tab **SP** (riwayat + status, Buat SP
   dengan usulan tingkat, ubah, Cabut, Cetak) dan tombol **Mulai proses
   keluar**.
2. Tab **Keluar** di `/kepegawaian`: daftar per status; rincian dengan
   checklist (blokir merah, tanda kuning), rincian pesangon (usulan, nominal,
   alasan), ringkasan, Berlakukan (dialog menyebut scan ditolak sejak saat itu),
   Batalkan, cetak SK Pemberhentian dan Surat Keterangan Pengalaman Kerja.
   Alasan dan pengali di tab yang sama (`hr.offboard.decide`).
3. Tab Organisasi: masa SP di bagian angka; pola nomor tiga surat baru di
   Pengaturan surat.
4. Halaman Karyawan dan Guru Web/Desktop: tanda "Keluar <tanggal>", tombol
   Aktifkan dan Hapus guru dinonaktifkan dengan pesan.

**Mobile**: command ikut terdaftar (salinan), tanpa layar. Mengaktifkan pegawai
keluar dari halaman Karyawan Mobile ditolak backend dengan pesan di atas.

### 22.6 Tidak dikerjakan di fase ini

- Register surat keluar dan penghitung nomor (Q-74).
- Jurnal otomatis pesangon dan status "pesangon dibayar"; PPh 21 final pesangon
  (PP 68/2009).
- Potong sisa kasbon dari pesangon atau seluruhnya di gaji terakhir: Pelunasan
  Tunai yang ada.
- Ganti rugi PKWT yang diputus sebelum waktunya (Pasal 62 UU 13/2003): baris
  `Lainnya`. Kompensasi PKWT di setiap perpanjangan kontrak.
- Mengakhiri tugas tambahan otomatis saat keluar berlaku (tetap tanda).
- Mengalihkan jadwal massal ke guru lain (dikerjakan di Jadwal yang ada).
- Kolom "ditarik" di `id_card` dan status kartu di layar ID Card.
- Cetak rincian pesangon; layar SP/keluar di Mobile.
- Telegram SP dan keluar (Fase 6).

### 22.7 Langkah

Tiga sub-fase; v70 penuh di 4a supaya perangkat hanya diperbarui sekali.
Setiap sub-fase berakhir dengan typecheck, Biome, dan tes per berkas hijau;
`bun run check` penuh oleh pemilik sesudah semua fase HRIS.

**4a — Skema, hak akses, surat peringatan** (batas: SP bisa dibuat, dicabut,
dan dicetak di Web/Desktop):

| # | Langkah | Gerbang |
| :-- | :-- | :-- |
| 1 | Skema v70: empat tabel khusus cloud + seed alasan dari JSON; `master_data.id_keluar` keempat lapis + `SNAPSHOT_TABLES` ↔ `SNAPSHOT_SOURCES` + `sync_pulse` + `storage.rs` Mobile; versi di `db-schema.ts`, `sync.rs`, sentinel `-2046`, `REQUIRED_TABLE_COUNT` 126, `PROMOTION_PLAN`, tes skema | `audit:schema`, `audit:contract`; `cargo test` sentinel per nama; `schema-consistency.test.ts`, `database-promotion.test.ts` |
| 2 | RBAC: tujuh izin di `catalog.ts`, sensitif/rahasia, `NOT IN` Admin Rust, `ROLE_HRIS_BAWAAN` ↔ `DEFAULT_ROLE_PERMISSIONS`, `rbac-migration.test.ts` + 70 | `rbac-migration.test.ts`, `audit:contract` (127) |
| 3 | Aturan SP kembar `hr_keluar.rs` ↔ `validations/hr-keluar.ts` (`validasi_sp`, `status_sp`, `usulan_tingkat`, `akhir_masa_sp`, `tambah_hari` bersama), `hr_sp_masa_bulan` di `desktop_hr_settings_save` | vektor `hr-keluar.vektor.json` Rust ↔ TS; `cargo test hr_keluar`; `tsc` menunjuk pembangun draft |
| 4 | Command SP (3) + rute + gateway; cakupan unit dan diri sendiri dari sesi | `cargo test hr_keluar` (`TursoClient::local_file`: SP3 tanpa izin ditolak, unit lain ditolak, cabut sekali); `services/hr-keluar.test.ts` database Web sungguhan; `audit:route-guard` |
| 5 | Tab SP, cetak SP, pola `hr_surat_pola:sp` | `tsc` + Biome; `audit:a11y`, `audit:dialog`, `audit:confirm`, `audit:ui-guard`; templat dirender di Edge |

**4b — Pegawai keluar, checklist, penonaktifan** (batas: keluar bisa
dicatat, diberlakukan, dibatalkan; tanpa angka pesangon):

| # | Langkah | Gerbang |
| :-- | :-- | :-- |
| 6 | `validasi_keluar`, `status_keluar`; SQL checklist kembar (`JADWAL_AKTIF_KELUAR_SQL`, `WALI_KELUAR_SQL`, `PINJAMAN_PERSONIL_SQL` dengan predikat salinan harfiah `list_loans`, kasbon, rapel, pengajuan/JP, run masa terakhir) | `hr-keluar.test.ts` teks harfiah Desktop + Mobile; `audit:sql` |
| 7 | Batch Berlakukan/Batalkan (blokir di batch, `master_data`, akun, sesi Web), penjaga Superadmin terakhir | `cargo test hr_keluar` (`local_file`: tekan ganda, blokir jadwal/wali, batal mengembalikan); `services/hr-keluar.test.ts` |
| 8 | Normalisasi zombie di handler cloud `employee/*`, Web `employee.ts`/`saveTeacher`/impor, lokal `update_employee`/`set_employee_status`/`save_teacher`/impor/`delete_teacher` | `cargo test` per nama: event `employee/update` dan `employee/status` lama bernilai `'Aktif'` sesudah keluar tetap `Nonaktif`; tes TS yang sama |
| 9 | Penjaga sesi: login luring + `require_any_permission` | `cargo test` per nama (sesi tertaut pegawai keluar ditolak, personil tak dikenal lolos) |
| 10 | `KELUAR_DI_PERIODE_SQL` di tiga titik rekap gaji | teks harfiah Rust ↔ TS; `cargo test` payroll per nama (keluar di tengah periode tanpa absensi ikut, periode berikutnya tidak, Pasal 17 terpicu); `payroll-recap*.test.ts` |
| 11 | Command keluar (5 tanpa alasan/pesangon) + rute + gateway; tab Keluar (checklist, Berlakukan, Batalkan); tanda di halaman Karyawan/Guru | `audit:contract`, `audit:route-guard`, `audit:a11y`, `audit:dialog`, `audit:ui-guard`, `audit:page-guard` |

**4c — Pesangon dan surat keluar** (batas: Fase 4 lengkap):

| # | Langkah | Gerbang |
| :-- | :-- | :-- |
| 12 | `bulan_penuh`, `usulan_upah` (`UPAH_RATA_SQL`), `usulan_pesangon` per status, UPH Cuti, validasi rincian | vektor `hr-keluar.vektor.json`: vektor perusahaan §20.5, GTY 6 tahun, GTT kompensasi, Honorer, PNS tanpa baris, tanpa slip, pembagi 25/21 |
| 13 | Rincian di `desktop_hr_offboarding_save`, `desktop_hr_exit_reasons_save` | `cargo test hr_keluar`; `services/hr-keluar.test.ts` |
| 14 | Layar rincian pesangon, alasan dan pengali; cetak SK Pemberhentian dan Surat Keterangan Pengalaman Kerja; dua pola nomor | `tsc` + Biome; audit layar; templat di Edge |
| 15 | `sync-rust-modules`, `sync-frontend-lib`, paragraf `CLAUDE.md`, catatan "Sudah dibangun" | `audit:contract`, `audit:schema`; `cargo test hr_keluar` Mobile |

### 22.8 Pertanyaan untuk pemilik (Fase 4)

| No | Pertanyaan | Usulan | Alasan |
| :-- | :-- | :-- | :-- |
| Q-73 | SP dan keluar **khusus cloud** (`hr_sp`, `hr_keluar`, `hr_keluar_rincian`, `hr_keluar_alasan`), pencabutan/pembatalan sebagai kolom yang diisi sekali (bukan baris `batal-<id>`), `hr_pesangon_pengali` digabung ke alasan, plus kolom tersinkron `master_data.id_keluar`? | Ya | Isi SP dan pesangon rahasia (pola `hr_profil`); Berlakukan wajib menulis akun dan sesi yang khusus cloud dalam satu batch; tidak ada penggabungan luring sehingga kolom cukup. Butuh koneksi untuk membuat SP dan keluar |
| Q-74 | Nomor SP dan surat keluar memakai **pola Q-59** (urut diketik dari buku agenda), nomor final **disimpan** di baris SP/keluar, nomor kembar hanya ditandai; tanpa penghitung dan register? | Ya | Buku agenda tetap memuat surat non-kepegawaian, jadi penghitung aplikasi bertabrakan dengannya. Nomor tersimpan cukup untuk mencari SP lama |
| Q-75 | Masa SP bawaan **6 bulan** (`hr_sp_masa_bulan`, 1–12, beku per SP); usulan tingkat = SP Berlaku tertinggi + 1, tingkat lain wajib alasan; SP3 Berlaku memunculkan "Mulai proses keluar"? | Ya | PP 35/2021 Pasal 52; aturan dan vektor perusahaan sudah teruji |
| Q-76 | **Tujuh izin** §22.4: SP1/SP2 oleh `hr.warning.manage` (Yayasan, Kepala Sekolah dalam unitnya), SP3 butuh `hr.warning.sp3`, Berlakukan/Batalkan butuh `hr.offboard.decide` (keduanya sensitif, hanya Yayasan); Kepegawaian menyiapkan keluar (`hr.offboard.manage`) tanpa memberlakukan; Kepala TU tanpa paket; Admin tanpa satu pun? | Ya | §10: pemutus SP3 dan keluar adalah Yayasan; Kepegawaian yang mengurus berkasnya. Negeri (Q-15) memberi dua izin pemutus ke Kepala Sekolah lewat Role & Akses |
| Q-77 | Checklist: **memblokir** hanya jadwal mengajar aktif dan wali kelas di semester yang berlanjut sesudah hari terakhir; tugas tambahan, barang, kasbon, sisa cuti, rapel, pengajuan/JP pengganti, dan run gaji masa terakhir hanya **tanda**; kartu ID **centang manual**; akun operator **otomatis**? | Ya | Jadwal dan wali yang menunjuk orang nonaktif merusak presensi kelas, Jam Kosong, dan rapor setiap hari; butir lain tetap bisa diselesaikan sesudah keluar lewat menu yang ada |
| Q-78 | Berlakukan terbuka **sejak `tanggal_terakhir`**; satu batch cloud menulis `master_data` (Nonaktif, tanggal selesai, `id_keluar`), menonaktifkan akun tertaut dan mencabut sesi Web-nya; `guru_data`, kontrak, dan tugas tambahan tidak diubah? | Ya | Riwayat dan status kini tetap utuh untuk surat dan rekap lama; satu batch berarti tidak ada keadaan setengah jadi |
| Q-79 | Batalkan kapan saja dengan alasan (`hr.offboard.decide`), mengaktifkan kembali pegawai tetapi **tidak akunnya**? | Ya | Akun dipulihkan sadar oleh Superadmin; mencegah akses kembali tanpa diperiksa |
| Q-80 | Normalisasi zombie di semua penulis `status_aktif` (handler cloud, Web, lokal) berdasar `id_keluar`, dan **penjaga sesi** Desktop/Mobile (login luring dan setiap command) untuk akun yang tertaut pegawai keluar, termasuk Superadmin? | Ya | Temuan 1 dan 3; v70 memastikan setiap pengirim outbox menjalankan handler baru. Hanya `id_keluar`, bukan setiap nonaktif, supaya penonaktifan manual lama tidak mengunci akun |
| Q-81 | Pesangon **per status kini**: GTY/PTY UP/UPMK/UPH; GTT/PTT kompensasi PKWT (Habis Kontrak) + UPH; Honorer hanya baris manual; PNS/PPPK tanpa baris (alasan Ditarik Instansi)? | Ya | GTY/PTY = PKWTT yayasan, GTT/PTT = PKWT (PP 35/2021); Honorer tidak punya bentuk hukum seragam; PNS/PPPK dibayar instansinya |
| Q-82 | Upah sebulan = **rata-rata (gaji pokok jam + honor JP) slip PAID 12 bulan terakhir** per bulan, tunjangan tetap diisi, upah boleh diubah dengan alasan? | Ya | Gaji sekolah per jam + per JP, tidak ada gaji bulanan; tarif × 173 (perusahaan) mengabaikan honor JP. Analog Pasal 157 ayat 3 untuk upah satuan; dicek ulang konsultan |
| Q-83 | UPH Cuti = sisa cuti periode berjalan × upah ÷ **25** (shift ≥ 6 hari kerja) atau **÷ 21** (< 6), untuk alasan ber-UPH, apa pun aturan sisa cuti (hangus/dibawa)? | Ya | Sekolah tidak punya pilihan "diuangkan" (temuan 6); sisa cuti saat putus hubungan kerja adalah hak UPH. Pembagi dicek ulang |
| Q-84 | Sembilan alasan bawaan §22.2.3 (termasuk Ditarik Instansi), pengali bisa disunting oleh `hr.offboard.decide`; perubahan tidak menyentuh keluar yang sudah berlaku? | Ya | Pengali menentukan uang, jadi di tangan pemutus; rincian beku sejak berlaku |
| Q-85 | Rekap gaji memuat pegawai keluar pada periode yang memuat hari terakhirnya **walau tanpa absensi** (`KELUAR_DI_PERIODE_SQL`, tiga titik); run masa terakhir yang dibuat sebelum Berlakukan hanya ditandai? | Ya | Menutup batas rapel v51 dan cuti dibayar di akhir masa kerja (temuan 4); Pasal 17 sudah terpicu oleh `tanggal_selesai_aktif`. Run lama tidak pernah dihitung ulang |
| Q-86 | Cetak tiga surat: **SP**, **SK Pemberhentian** (GTY/PTY, ketua yayasan), **Surat Keterangan Pengalaman Kerja** (kepala unit, kecuali PNS/PPPK); rincian pesangon tidak dicetak? | Ya | Surat keterangan kerja wajib diberikan saat berhenti dan diminta sekolah tujuan; templat 3b sudah ada |
| Q-87 | Tidak ada kejadian Telegram baru; "SP berakhir" dan "pegawai keluar" dirancang di Fase 6? | Ya | Fase 6 menambah bidang `kepegawaian` sekaligus; isi SP dan pesangon tidak pernah dikirim |
| Q-88 | Layar SP dan Keluar **Web/Desktop saja**; Mobile hanya menolak aktivasi lewat pesan backend? | Ya | Q-35; pemutus bekerja di Web/Desktop, dan cetak tidak ada di Mobile |
| Q-89 | Tiga sub-fase **4a** (skema v70 penuh + RBAC + SP), **4b** (keluar, checklist, penonaktifan, zombie, sesi, gaji), **4c** (pesangon + surat keluar), satu sesi per sub-fase? | Ya | Skema dan izin sekali di 4a supaya perangkat diperbarui sekali; 4b berguna tanpa angka pesangon |
| Q-90 | "Hapus guru" tetap untuk salah input, tetapi **ditolak** untuk pegawai ber-`id_keluar`, dan teks konfirmasinya menunjuk menu Keluar? | Ya | Hapus guru menghapus `guru_data` permanen (temuan 2); pegawai keluar perlu identitasnya untuk surat keterangan dan rekap lama |

### 22.9 Penanda yang ditinjau pemilik

**Yang dirasakan pengguna:**

- Tab **SP** di rincian pegawai dan tab **Keluar** di Kepegawaian (Web/Desktop,
  butuh koneksi); tanda "Keluar <tanggal>" di Karyawan dan Guru.
- Berlakukan ditolak selama jadwal mengajar atau wali kelas belum dialihkan.
- Sesudah berlaku: scan ditolak, akun tertaut tidak bisa masuk (juga luring),
  Aktifkan dan Hapus guru ditolak.

**Risiko data dan keputusan:**

- Pengali bawaan, upah rata-rata 12 bulan, pembagi 25/21, masa SP 6 bulan, dan
  teks surat wajib dicek ulang yayasan/konsultan.
- Run gaji masa terakhir yang dibuat sebelum Berlakukan tidak direkonsiliasi
  Pasal 17 (ditandai, tidak dihitung ulang).
- Berlakukan ditekan terlambat meninggalkan Alfa sistem sesudah hari terakhir
  (jumlahnya disebut di dialog, tidak dihapus).
- Rincian pesangon beku sejak berlaku; koreksi = Batalkan lalu catat ulang
  (pegawai sesaat aktif kembali).
- Nomor surat diketik; aplikasi hanya menandai nomor kembar.

**Perangkat:**

- **v70 menghentikan sinkron perangkat v69 sampai diperbarui.** Perbarui semua
  Desktop dan Mobile sebelum fitur keluar dipakai; perangkat lama tidak bisa
  mendorong event `employee/*` yang belum dinormalkan karena sinkronnya
  berhenti.
- SP dan keluar butuh koneksi; tanpa koneksi layar menampilkan `PESAN_LURING`.
  Penjaga sesi luring bekerja dari `master_data.id_keluar` yang sudah
  tertarik.

### 22.10 Jawaban Fase 4 (15 Nov 2026)

- **Q-73 sampai Q-90**: semuanya sesuai usulan §22.8, dan penanda §22.9
  disetujui. Artinya: SP dan keluar khusus cloud (`hr_sp`, `hr_keluar`,
  `hr_keluar_rincian`, `hr_keluar_alasan`; cabut/batal sebagai kolom;
  `hr_pesangon_pengali` digabung ke alasan) + kolom tersinkron
  `master_data.id_keluar`; nomor pola Q-59 yang disimpan, nomor kembar hanya
  ditandai; masa SP 6 bulan beku per SP dengan eskalasi +1; tujuh izin (SP3 dan
  Berlakukan/Batalkan hanya Yayasan, sensitif; Kepala Sekolah SP1/SP2 di
  unitnya; Kepegawaian menyiapkan; Admin tanpa paket); checklist memblokir
  hanya jadwal aktif dan wali kelas; Berlakukan sejak hari terakhir dalam satu
  batch tanpa menyentuh `guru_data`/kontrak/tugas; Batalkan mengaktifkan
  pegawai, bukan akunnya; normalisasi zombie + penjaga sesi luring berdasar
  `id_keluar`; pesangon per status kini; upah = rata-rata slip PAID 12 bulan;
  UPH cuti ÷ 25/21; sembilan alasan bawaan disunting pemutus; gaji terakhir
  memuat pegawai keluar walau tanpa absensi; cetak SP, SK Pemberhentian, Surat
  Keterangan Pengalaman Kerja; Telegram ditunda ke Fase 6; layar Web/Desktop
  saja; sub-fase 4a/4b/4c; Hapus guru ditolak untuk pegawai keluar.
- Pengali bawaan, upah rata-rata, pembagi 25/21, masa SP, dan teks surat tetap
  dicek ulang yayasan/konsultan.
- Eksekusi per sub-fase §22.7 di sesi terpisah, mulai 4a.

### 22.11 Sudah dibangun: sub-fase 4a (15 Nov 2026)

Langkah 1–5 §22.7 dibangun: skema v70 penuh (termasuk tabel yang baru dipakai
4b/4c), tujuh izin, aturan dan command SP, tab SP, dan cetak SP. Batas 4a
tercapai: SP bisa dibuat, diubah, dicabut, dan dicetak di Web/Desktop.

- **Skema v70, sentinel `-2046` `hris-keluar-v1`.** `hr_sp`, `hr_keluar`,
  `hr_keluar_rincian`, `hr_keluar_alasan` khusus cloud (`turso.rs` +
  `db-migrations.ts`, tanpa UNIQUE selain PK, DDL kembar); seed sembilan alasan
  dari `validations/hr-keluar-alasan-bawaan.json` (`ensure_hris_keluar_v70` ↔
  blok v70 TS, `INSERT OR IGNORE`, sesudah `CREATE`). `master_data.id_keluar`
  di `CREATE` + `ensure_column` lokal (Desktop dan Mobile, tangan) dan cloud,
  `ALTER TABLE` TS, `SNAPSHOT_TABLES` `master_data`, dan payload
  `enqueue_employee_snapshot`. `PROMOTION_PLAN` lapisan 6.
- **RBAC.** `hr.warning.view/manage/sp3/cancel`, `hr.offboard.view/manage/decide`
  di `catalog.ts` dan seed Rust (urutan 1417–1423); `sp3`, `cancel`, `decide`
  sensitif, empat sisanya rahasia; `NOT IN` Admin Rust; paket Yayasan (ketujuh),
  Kepala Sekolah (`warning.view`, `warning.manage`), Kepegawaian
  (`warning.view`, `offboard.view`, `offboard.manage`) ↔ `ROLE_HRIS_BAWAAN`.
- **Aturan SP kembar** `desktop/hr_keluar.rs` ↔ `validations/hr-keluar.ts`:
  `validasi_sp`, `status_sp`, `usulan_tingkat`, `akhir_masa_sp`
  (`tambah_bulan` + `add_days`/`tambahHari` yang sudah ada), `periksa_tingkat`,
  `periksa_wewenang_sp`, `masa_sp_berlaku`; vektor `hr-keluar.vektor.json`.
  `hr_sp_masa_bulan` (bawaan 6, 1–12) isian kelima `desktop_hr_settings_save`
  (`PENGATURAN_KONTRAK_SQL` lima kunci, kembar).
- **Command dan rute**: `desktop_hr_warnings` (`hr.warning.view`),
  `desktop_hr_warning_save` (`hr.warning.manage`; SP3 juga `hr.warning.sp3`),
  `desktop_hr_warning_revoke` (`hr.warning.cancel`) lewat `klien_cloud` +
  `hris_cloud::luring` ↔ `POST /api/kepegawaian/warnings/query|save|revoke`
  (Zod `.strict()`); gateway `muatSuratPeringatan`, `simpanSuratPeringatan`,
  `cabutSuratPeringatan` di `gateways/hris.ts`. "Diri sendiri" = `id_karyawan`
  sesi; cakupan = `dalam_cakupan` dengan unit akun dari `UNIT_PERSONIL_SQL` di
  cloud dan `hr_sp.unit` (salinan saat SP dibuat) untuk ubah/cabut.
- **Layar**: tab **SP** di rincian pegawai `/kepegawaian`
  (`SuratPeringatanPegawai.tsx`): riwayat + status, usulan tingkat, Buat SP
  (usulan dihitung ulang untuk tanggal yang dipilih; tingkat lain wajib
  alasan; SP3 dinonaktifkan tanpa izinnya; penanda tangan bawaan kepala unit
  atau ketua yayasan sampai disentuh), Ubah teks, Cabut (formulir sebaris), dan
  Cetak. Templat `suratPeringatan` di `suratKepegawaian.ts`; `permintaanSp` di
  `DialogCetakSurat.tsx`. Isian masa SP di tab Organisasi; pola
  `hr_surat_pola:sp` (kode `SP`) di Pengaturan surat, sehingga
  `desktop_hr_letter_settings_save` kini 13 kunci wajib.

Angka (dihitung ulang dari kode; `audit:contract` sebagai acuan):

| | Sebelum | Sesudah |
| :-- | :-- | :-- |
| Skema / sentinel | v69 / `-2045` | v70 / `-2046` `hris-keluar-v1` |
| `REQUIRED_TABLE_COUNT` | 122 | 126 |
| Tabel snapshot / rute kanonik | 81 / 145 | 81 / 145 (`master_data` +1 kolom) |
| Permission | 120 | 127 |
| Command Desktop / Mobile | 411 / 416 | 414 / 419 |
| Rute Web (`src/app/api/**/route.ts`) | 301 | 304 |
| Kunci pengaturan surat | 12 | 13 |
| Isian `desktop_hr_settings_save` | 4 | 5 |

Gerbang (oleh Claude, per berkas/per nama; `bun run check` dan suite Rust penuh
belum, sesuai keputusan pemilik):

| # | Gerbang | Hasil |
| :-- | :-- | :-- |
| 1 | `audit:schema` (126 tabel wajib, cloud Rust = Web, Desktop = Mobile); `audit:contract`; `schema-consistency.test.ts`; `database-promotion.test.ts`; `cargo test sentinel` | Lulus: `cargo test sentinel` 11 tes (daftar sentinel tes kini sampai `-2046`); TS 9 tes skema dan promosi |
| 2 | `rbac-migration.test.ts` (versi 70, pengecualian Admin Rust = TS, paket HRIS Rust = TS); `audit:contract` 127 permission | Lulus |
| 3 | Vektor `hr-keluar.vektor.json` (6 akhir masa, 5 status, 9 masa bawaan, 8 usulan, 18 validasi, 4 tingkat, 7 wewenang) di `hr_keluar_vektor_*` dan `hr-keluar.test.ts`; SQL kembar harfiah Desktop + Mobile; `tsc` kedua workspace | Lulus: Rust 3 tes vektor + 1 alasan bawaan; TS 5 tes di Desktop dan salinan Mobile |
| 4 | `cargo test hr_keluar` (`TursoClient::local_file`: unit lain, diri sendiri, SP3 tanpa izin, tingkat beda tanpa alasan ditolak; masa 6 bulan beku, `unit` tersalin, alasan tingkat hanya bila beda; ubah tingkat ditolak; cabut tanpa alasan ditolak, cabut kedua dan ubah sesudah cabut ditolak; seed 9 alasan); `services/hr-keluar.test.ts` dengan data yang sama di database Web sungguhan (tiga kali); `audit:route-guard` | Lulus: Rust `hr_keluar` 5 tes Desktop dan 5 tes Mobile (crate Mobile terkompilasi tanpa warning kode); TS 2 tes, tiga kali berturut-turut |
| 5 | `tsc` + Biome berkas yang diubah; `audit:a11y`, `audit:dialog`, `audit:confirm`, `audit:ui-guard`, `audit:page-guard`, `audit:list-bound`, `audit:sql`, `audit:silent-catch`; `suratKepegawaian.test.ts` (SP1 dan SP3 dicabut dengan nilai jahat dan data kosong); vektor `hr-surat.vektor.json` 13 kunci di `hr_beban` Rust dan TS; SP1 dan SP3 dicabut dirakit dari templat sungguhan dan dicetak ke PDF A4 di Edge | Lulus: 15 tes templat; `cargo test hr_beban` 4 tes (13 event outbox), `desktop::hris::` 11, `rbac` 5; PDF SP1 dan SP3 dicabut diperiksa |

Keputusan yang diambil di tengah jalan:

- **Bahan cetak untuk pembaca SP**: `desktop_hr_letter_setup` dan
  `letters/query` kini menerima `hr.duty.manage` ATAU `hr.warning.view`, supaya
  penanda tangan bawaan dan cetak SP tidak menuntut izin tugas tambahan. Isinya
  tanpa data pribadi (Q-70).
- **Cabut juga dinilai cakupan unit** (unit di baris SP), selain "bukan diri
  sendiri"; §22.4 hanya menyebut cakupan untuk membuat/mengubah.
- **Ubah SP3 juga butuh `hr.warning.sp3`**: aturan SP3 dinilai dari tingkat
  barisnya, baik dibuat maupun diubah.
- **Nomor kembar** dicek sesudah simpan (`NOMOR_KEMBAR_SQL`) dan ditampilkan:
  di tab SP sebagai pesan, di dialog cetak sesudah surat dicetak (dialog tetap
  terbuka). Nomor dari dialog disimpan hanya bila sesi boleh mengubah SP itu
  dan SP belum dicabut; tanggal surat yang diubah di dialog tidak disimpan
  (tanggal SP terkunci).
- **Batas isian** yang tidak disebut §22.2.1: nama dan jabatan penanda tangan
  120 karakter, NIP penanda 30, nomor 80 (`NOMOR_MAKS`).
- **`alasan_tingkat` disimpan hanya bila tingkat beda dari usulan**.
- **Komentar batas SQL pengaturan surat** (`PENGATURAN_SURAT_SQL`) diganti dari
  "dua belas kunci" menjadi uraian umum di kedua bahasa, supaya tidak salah
  lagi saat 4c menambah dua pola.
- **Regex permission `audit-sync-contract.ts` diperketat**: dulu
  `[a-z_]+\.[a-z_.]+` tidak menerima angka, jadi `hr.warning.sp3` lolos dari
  pemeriksaan seed Rust vs katalog (audit melaporkan 126). Kini angka diterima
  dan audit memeriksa 127.

Penyimpangan dari §22 untuk ditinjau:

- **"Daftar harapan tabel khusus cloud" di `audit-sync-contract.ts` tidak ada.**
  Audit membandingkan tabel kedua jalur provisioning secara otomatis
  (pengecualiannya hanya `sync_pulse`, `sync_tombstone`, `sync_append_log`),
  jadi tidak ada daftar yang perlu ditambah.
- **"JSON trigger `sync_pulse`" (§22.3)** yang dimaksud ternyata payload
  `enqueue_employee_snapshot` (`sync.rs`); trigger `sync_pulse` bekerja per
  tabel tanpa daftar kolom. `id_keluar` ikut payload itu, dan handler cloud
  `employee/*` sudah menulis daftar kolom eksplisit tanpa `id_keluar`, jadi
  nilai dari perangkat tidak pernah tertulis (normalisasi zombie tetap 4b).
- **`PROMOTION_PLAN`**: keempat tabel ditambahkan sesuai §22.3, padahal tabel
  HRIS cloud-only sebelumnya (`hr_profil`, `hr_dokumen*`,
  `hr_pengajuan_berkas`) tidak ada di rencana promosi, jadi tidak ikut saat
  database lokal dipromosikan. Celah lama itu tidak diubah di 4a.
- **Mode "daftar SP Berlaku" `desktop_hr_warnings` tanpa pegawai** (§22.5)
  tidak dibuat: belum ada layar yang memakainya. Command kini wajib membawa
  `id_karyawan`.
- **Tombol "Mulai proses keluar"** belum ada (4b); bila SP3 masih berlaku, tab
  SP menampilkan pesan bahwa langkah berikutnya adalah proses keluar.

Belum diuji di browser/perangkat: alur layar sungguhan tab SP (buat, ubah,
cabut, pesan luring tanpa koneksi, penanda bawaan dari kepala unit/ketua
yayasan, SP3 dinonaktifkan tanpa izin), dialog cetak SP dengan `window.print()`
di Web dan WebView2 Desktop termasuk pesan nomor kembar, simpan masa SP di tab
Organisasi dan pola SP di Pengaturan surat lalu sinkron ke perangkat lain, dan
perangkat v69 yang berhenti sinkron sampai diperbarui. Yang sudah dirender
adalah HTML hasil templat dengan media cetak di Edge.

### 22.12 Sudah dibangun: sub-fase 4b (15 Nov 2026)

Langkah 6–11 §22.7 dibangun. Batas 4b tercapai: proses keluar bisa dicatat,
diubah, diberlakukan, dan dibatalkan di Web/Desktop, tanpa angka pesangon
(kolom upah di `hr_keluar` tetap 0 sampai 4c). Tanpa tabel, kolom, versi skema,
sentinel, izin, atau rute sync baru.

- **Aturan kembar** di modul 4a (`desktop/hr_keluar.rs` ↔
  `validations/hr-keluar.ts`): `status_keluar` (Dibatalkan → Berlaku → Jatuh
  tempo → Dijadwalkan, tidak disimpan) dan `validasi_keluar` (hari terakhir
  boleh di masa depan, pemberitahuan ≤ hari terakhir, keterangan dan catatan
  checklist ≤ 1.000 karakter); vektor `status_keluar` (6) dan
  `validasi_keluar` (13) di `hr-keluar.vektor.json`.
- **Checklist dari cloud** (`checklist_keluar` ↔ `checklistKeluar`), SQL kembar
  dicek harfiah Desktop + Mobile: memblokir `JADWAL_AKTIF_KELUAR_SQL` dan
  `WALI_KELUAR_SQL` (semester `tanggal_selesai` > hari terakhir); tanda
  `TUGAS_KELUAR_SQL`, `PINJAMAN_PERSONIL_SQL`, `KASBON_KELUAR_SQL`,
  `RAPEL_KELUAR_SQL`, `PENGAJUAN_SESUDAH_SQL`, `JP_PENGGANTI_SESUDAH_SQL`,
  `RUN_MASA_TERAKHIR_SQL`, sisa cuti (`sisa_cuti_pada` ↔ `sisaCutiPada`,
  periode jatah yang memuat hari terakhir); info `AKUN_TERTAUT_SQL` dan
  `ALFA_SESUDAH_SQL`. Potongan predikat diperiksa tes sebagai salinan harfiah
  sumbernya: "belum kembali" `inventory::list_loans`, `BAYAR_SQL`/`PENDING_SQL`
  `loan.rs` + `loan.ts`, `MENUNGGU_SQL` `rapel.rs` + `payroll-rapel.ts`, dan
  "Menunggu atau berlaku" `PENGAJUAN_AKTIF_ORANG_SQL` (juga ada di
  `PENANGANAN_SQL`).
- **Catat/ubah** (`SIMPAN_KELUAR_SQL` dengan `WHERE NOT EXISTS` proses terbuka
  di statement yang sama; `UBAH_KELUAR_SQL` hanya bila belum berlaku/batal):
  pegawai aktif, bukan diri sendiri, dalam cakupan unit (unit `master_data`
  kini), hari terakhir ≥ tanggal masuk, alasan aktif; `status_kepegawaian` =
  `STATUS_KINI_SQL` pada hari terakhir, `masa_kerja_mulai` = `tanggal_daftar`.
- **Berlakukan** (`BERLAKUKAN_SQL`, empat statement satu batch, semuanya
  `?1..?4`): statement pertama memeriksa ulang blokir jadwal/wali dan
  `tanggal_terakhir <= date('now', '+7 hours')`; tiga sisanya (`master_data`
  Nonaktif + `tanggal_selesai_aktif` + `id_keluar`, `master_operator`
  Nonaktif, `app_session.revoked_at`) hanya jalan bila proses itu berlaku dan
  tidak dibatalkan. Ditolak untuk akun sesi sendiri dan Superadmin aktif
  terakhir. Potret checklist disimpan di `checklist_saat_berlaku`. Bila batch
  tidak memberlakukan (blokir muncul di antara pemeriksaan dan batch), butirnya
  dilaporkan. **Batalkan** (`BATALKAN_SQL`): alasan wajib, kapan saja;
  `master_data` dikembalikan hanya `WHERE id_keluar = ?1`, akun tidak.
- **Zombie (Q-80)**: `STATUS_AKTIF_KELUAR_SQL`/`TANGGAL_SELESAI_KELUAR_SQL`
  (`status_aktif_keluar` ↔ `statusAktifKeluar`) di handler cloud
  `employee/create|update|status`, Web `updateKaryawan`,
  `toggleStatusKaryawan`, `saveTeacher`, dan lokal `update_employee`,
  `save_teacher`. Lokal menolak "Aktif" untuk pegawai ber-`id_keluar`
  (`tolak_aktifkan_keluar`, `PESAN_SUDAH_KELUAR`) di `update_employee`,
  `set_employee_status`, `save_teacher`. Hapus guru ditolak lokal dan Web
  (`PESAN_HAPUS_GURU_KELUAR`); handler cloud `teacher/delete` melewati DELETE.
- **Penjaga sesi**: `require_any_permission` dan login luring memanggil
  `tolak_sesi_keluar` (`KELUAR_LOKAL_SQL` di SQLite perangkat); semua akun
  termasuk Superadmin, personil yang belum ada di perangkat lolos.
- **Gaji terakhir**: `KELUAR_DI_PERIODE_SQL` disisipkan ke predikat rekap
  `payroll/commands.rs` (pratinjau dan pembekuan memakai fungsi yang sama) dan
  `computePayrollRecap`.
- **Command dan rute**: `desktop_hr_offboardings`, `desktop_hr_offboarding`
  (`hr.offboard.view` atau `.manage`), `desktop_hr_offboarding_save`
  (`.manage`), `desktop_hr_offboarding_apply`, `desktop_hr_offboarding_cancel`
  (`.decide`) ↔ `POST /api/kepegawaian/offboarding/query|detail|save|apply|cancel`
  (Zod `.strict()`); gateway `muatDaftarKeluar`, `muatRincianKeluar`,
  `simpanKeluar`, `berlakukanKeluar`, `batalkanKeluar`.
- **Layar**: tab **Keluar** di `/kepegawaian` (`TabKeluar.tsx`): saring status,
  Catat proses keluar dengan "Periksa checklist" (pratinjau), rincian dengan
  checklist (blokir merah, tanda kuning), Ubah, Berlakukan (konfirmasi menyebut
  scan ditolak, akun nonaktif + sesi Web dicabut, jumlah Alfa sistem sesudah
  hari terakhir), Batalkan; `syncNow()` sesudah Berlakukan/Batalkan. Tombol
  **Mulai proses keluar** di tab SP saat SP3 berlaku (pemegang
  `hr.offboard.manage`, pegawai aktif) membuka form dengan alasan
  `klr-pelanggaran` dan `id_sp`. Halaman Karyawan dan Guru: tanda "Keluar
  <tanggal>", toggle status karyawan diganti tanda itu, Hapus guru menampilkan
  pesan, isian status keaktifan di form terkunci, teks konfirmasi Hapus guru
  menunjuk tab Keluar. Daftar karyawan/guru (Rust dan TS) membawa `id_keluar`.

Angka (dihitung ulang dari kode; `audit:contract` sebagai acuan):

| | Sebelum | Sesudah |
| :-- | :-- | :-- |
| Skema / sentinel | v70 / `-2046` | sama |
| `REQUIRED_TABLE_COUNT` | 126 | 126 |
| Tabel snapshot / rute kanonik | 81 / 145 | 81 / 145 |
| Permission | 127 | 127 |
| Command Desktop / Mobile | 414 / 419 | 419 / 424 |
| Rute Web (`src/app/api/**/route.ts`) | 304 | 309 |

Gerbang (oleh Claude, per berkas/per nama; `bun run check` dan suite Rust penuh
belum, sesuai keputusan pemilik):

| # | Gerbang | Hasil |
| :-- | :-- | :-- |
| 6 | `hr-keluar.test.ts` (SQL harfiah Desktop + Mobile, salinan predikat dari sumbernya, vektor status/validasi keluar) di kedua workspace; `audit:sql` | Lulus: 7 tes di Desktop dan 7 di salinan Mobile; `cargo test hr_keluar_vektor` |
| 7 | `cargo test hr_keluar` (`local_file`: diri sendiri, proses terbuka ganda, blokir jadwal lalu wali, akun sesi sendiri, Berlakukan, tekan ganda + batch diulang tidak mengubah pemberlaku, akun + sesi Web dicabut, ubah sesudah berlaku ditolak, Batalkan mengembalikan pegawai bukan akun, catat ulang; Superadmin terakhir ditolak); `services/hr-keluar.test.ts` data sama di database Web | Lulus: Rust 9 tes Desktop dan 9 Mobile; TS 3 tes, tiga kali berturut-turut |
| 8 | `cargo test event_lama_aktif_tidak_menghidupkan_pegawai_keluar` (event `employee/update`, `create`, `status` 'Aktif' + `teacher/delete`; nonaktif manual tetap bisa diaktifkan); `hr_keluar_penjaga_sesi_lokal` (Aktifkan, ubah karyawan, Hapus guru lokal); potongan Web di `services/hr-keluar.test.ts` | Lulus Desktop dan Mobile |
| 9 | `hr_keluar_penjaga_sesi_lokal` (sesi tertaut pegawai keluar ditolak dan dibuang termasuk Superadmin; nonaktif manual dan personil tak dikenal lolos) | Lulus |
| 10 | `cargo test rekap_gaji_memuat_pegawai_keluar_di_periode_terakhirnya` (ikut Juni tanpa absensi, `PASAL_17_TERAKHIR`, tidak ikut Juli, nonaktif manual tidak ikut); `payroll-recap-keluar.test.ts` data sama; `payroll-recap-hari-kerja.test.ts` | Lulus Desktop dan Mobile; TS 1 + 4 tes |
| 11 | `tsc` kedua workspace; Biome berkas yang diubah; `audit:schema`, `audit:contract`, `audit:sql`, `audit:ui-guard`, `audit:a11y`, `audit:page-guard`, `audit:dialog`, `audit:route-guard`, `audit:confirm`, `audit:silent-catch`, `audit:list-bound` | Lulus semua |

Tes Rust lain yang disentuh, per filter: `desktop::operational::` 9,
`desktop::academic::` 13, `desktop::commands::` 11,
`desktop::payroll::commands::` 9, `desktop::hr_pengajuan::` 14,
`personil_baru_lewat_event` 1; TS `hr-pengajuan*.test.ts` 14. Semua lulus.

Keputusan yang diambil di tengah jalan:

- **Sisa cuti di Desktop dibaca dari SQLite perangkat**, butir lain dari cloud.
  `jatah_cuti` hanya punya pembaca rusqlite (jadwal shift, libur, whitelist),
  dan tabel pengajuan serta penyesuaian tersinkron; Web membacanya dari
  database yang sama. Ditambahkan `sisa_cuti_pada` ↔ `sisaCutiPada` di
  `hr_pengajuan`.
- **`ALFA_SESUDAH_SQL`**: jumlah Alfa sistem sesudah hari terakhir ikut
  checklist supaya dialog Berlakukan bisa menyebutnya (§22.9).
- **Cakupan unit keluar** memakai unit `master_data` saat ini, karena
  `hr_keluar` tidak punya kolom unit (berbeda dari `hr_sp.unit`).
- **`RUN_MASA_TERAKHIR_SQL` tidak disaring per pegawai**: run masa terakhir
  yang tidak memuat pegawai itu juga perlu ditolak dan dibuat ulang.
- **Sesi yang ditolak dibuang** (`DESKTOP_SESSION_MISSING`) supaya perintah
  berikutnya juga gagal dan layar kembali login; login luring menjawab
  `LOGIN_REJECTED` dengan `PESAN_SESI_KELUAR`.
- **`desktop_get_payroll_recap` dipisah** menjadi command tipis +
  `rekap_gaji(&DesktopState, ..)` supaya bisa diuji tanpa `tauri::State`;
  perilaku dan izinnya tidak berubah.
- **Awalan `berlakukan` ditambahkan ke `AWALAN_MUTASI` `audit-ui-guard.ts`**
  (audit menjadi lebih ketat).
- **Tes predikat `hr-keluar.test.ts` membaca berkas kanonik `web-desktop`**
  dari root repo, supaya salinan Mobile tes itu memeriksa hal yang sama.

Penyimpangan dari §22 untuk ditinjau:

- **Web tidak menolak "Aktifkan"** pegawai keluar, hanya mempertahankan status
  dan tanggal selesai lewat potongan SQL (sesuai teks §22.2.2 untuk Web).
  Penolakan berpesan hanya di lokal Desktop/Mobile; di layar Web tombolnya
  diganti tanda "Keluar <tanggal>" dan isian status terkunci, jadi pengguna
  Web tidak melihat "berhasil" palsu dari layar biasa.
- **Tambah dan impor karyawan (Web dan lokal) tidak diubah**: keduanya INSERT
  murni dan menolak ID yang sudah ada, jadi tidak bisa menyentuh pegawai
  ber-`id_keluar`.
- **Handler cloud `teacher/delete` tidak menolak** (outbox akan macet), hanya
  melewati DELETE untuk pegawai ber-`id_keluar`; penolakan berpesan ada di
  lokal dan Web.
- **Paragraf `CLAUDE.md`** untuk Fase 4 ditunda ke 4c (langkah 15).

Belum diuji di browser/perangkat: alur layar tab Keluar (catat, periksa
checklist, ubah, Berlakukan dengan konfirmasi, Batalkan, pesan luring tanpa
koneksi), tombol Mulai proses keluar dari tab SP, tanda "Keluar <tanggal>" dan
penguncian di halaman Karyawan dan Guru Web/Desktop, `syncNow()` sesudah
Berlakukan yang menarik `master_data` ke Desktop, penolakan scan di terminal
sesudah sinkron, penjaga sesi dan login luring di perangkat sungguhan, dan
pesan penolakan Aktifkan di halaman Karyawan Mobile.

### 22.13 Sudah dibangun: sub-fase 4c (15 Nov 2026)

Langkah 12–15 §22.7 dibangun. Batas 4c tercapai, jadi **Fase 4 lengkap**:
rincian pesangon dihitung, disimpan, dibekukan saat berlaku, dan dua surat
keluar bisa dicetak di Web/Desktop. Tanpa tabel, kolom, versi skema, sentinel,
izin, atau rute sync baru; kolom `hr_keluar` dan `hr_keluar_rincian` dari 4a
kini terisi.

- **Aturan murni kembar** di modul 4a (`desktop/hr_keluar.rs` ↔
  `validations/hr-keluar.ts`): `bulan_penuh`, `masa_kerja_bulan` (sampai hari
  sesudah hari terakhir), `kelipatan_up`, `kelipatan_upmk`, `rata_upah`
  (setengah ke atas, maks 1 miliar), `pembagi_uph` (25 bila shift ≥ 6 hari
  kerja, kosong/rusak = 7 hari → 25; selain itu 21), `kelompok_status`
  (`tetap` GTY/PTY, `kontrak` GTT/PTT, `negeri` PNS/PPPK, `lainnya`; huruf dan
  spasi dinormalkan), `usulan_pesangon` per status (§22.2.3), `susun_rincian`,
  `periksa_upah`, `ringkasan_pesangon`, `validasi_alasan`,
  `periksa_surat_keluar`; `validasi_keluar` kini membawa `upah_pokok`
  (kosong = usulan), `alasan_upah`, `tunjangan_tetap`, dan `rincian` (komponen
  dikenal, tidak kembar, nominal bulat 0–100 miliar). Aturan dan vektor
  perusahaan §20.5 dipakai ulang, kodenya ditulis ulang untuk tujuh komponen
  sekolah (tanpa `UPH Ongkos Pulang`).
- **Bahan usulan dari cloud** (`bahan_pesangon` ↔ `bahanPesangon`): status
  kini (`STATUS_KINI_SQL`), `UPAH_RATA_SQL` (Σ gaji pokok jam + honor JP slip
  run PAID dengan `period_end` dalam 12 bulan sampai hari terakhir, dibagi
  jumlah bulan berbeda), `KONTRAK_KELUAR_SQL` (predikat salinan harfiah
  subkueri `STATUS_KINI_SQL`; hanya kontrak bertanggal selesai yang memberi
  Kompensasi PKWT), `pembagi_uph` dari `tbl_shift.hari_kerja` (lewat
  `PEGAWAI_KELUAR_SQL` yang kini juga membawa `jenis_personil` dan `divisi`),
  `TUNJANGAN_ACUAN_SQL` (ALLOWANCE nominal tetap aktif) dan tugas berlaku pada
  hari terakhir (`TUGAS_BERLAKU_SQL`, dipakai utuh). Sisa cuti tetap dari
  `sisa_cuti_pada` (Desktop dari SQLite perangkat, 4b).
- **Simpan** (`desktop_hr_offboarding_save` ↔ `simpanKeluar`): usulan dihitung
  ulang di backend, lalu SATU batch atomik: header (`SIMPAN_KELUAR_SQL`/
  `UBAH_KELUAR_SQL` dengan `upah_pokok`, `usulan_upah_pokok`,
  `tunjangan_tetap`, `alasan_upah` di `?14..?17`), `HAPUS_RINCIAN_SQL`, dan
  `SIMPAN_RINCIAN_SQL` per baris (id `<id_keluar>:<komponen>`); hapus dan
  tulis rincian dijaga `berlaku_pada IS NULL AND dibatalkan_pada IS NULL` pada
  proses yang sama, sehingga header yang tidak tertulis (proses terbuka lain,
  sudah berlaku) tidak meninggalkan rincian. Hasil dibaca ulang sesudah batch
  karena `execute_atomic` tidak mengembalikan jumlah baris. `alasan_upah`
  disimpan hanya bila upah beda dari usulan.
- **Rincian** (`desktop_hr_offboarding`): kini membawa `rincian` tersimpan,
  `ringkasan` (total, sisa kasbon, perkiraan diterima; boleh negatif), dan
  `pesangon` (bahan). **Berlakukan** menambahkan `rincian` dan `ringkasan` ke
  potret `checklist_saat_berlaku`.
- **Alasan dan pengali**: `desktop_hr_exit_reasons_save`
  (`hr.offboard.decide`) ↔ `POST /api/kepegawaian/offboarding/reasons`
  (Zod `.strict()`): ubah (`UBAH_ALASAN_SQL`, id wajib ada) atau tambah
  (`SIMPAN_ALASAN_SQL`, id `klr-<acak>`); proses yang sudah berlaku tidak
  tersentuh. Terdaftar di kedua `lib.rs`, `build.rs`,
  `capabilities/default.json`, dan `permissions/autogenerated`.
- **Nomor surat keluar**: draft `{ id_keluar, jenis_surat, nomor }` lewat
  command/rute simpan yang sama (Zod `keluarSimpanSchema` = union dua bentuk
  `.strict()`), `hr.offboard.manage`, wewenang dari sesi, hanya proses
  Berlaku, SK hanya GTY/PTY dan keterangan bukan PNS/PPPK
  (`periksa_surat_keluar`); `NOMOR_KELUAR_SQL` per jenis, kembar
  (`NOMOR_KELUAR_KEMBAR_SQL`, kedua kolom semua proses lain) hanya ditandai.
- **Pengaturan surat 13 → 15 kunci**: `hr_surat_pola:berhenti` dan
  `:pengalaman` di `JENIS_SURAT` kedua bahasa, kode bawaan `SK-BERHENTI` dan
  `SKET-KERJA`; vektor `hr-surat.vektor.json` (+2 kasus setting).
- **Layar** `TabKeluar.tsx`: form memuat checklist dan bahan usulan otomatis
  saat pegawai/hari terakhir berubah (tombol "Periksa checklist" 4b diganti),
  bagian **Pesangon** (upah pokok dengan usulan dan jumlah bulan slip, alasan
  bila beda, tunjangan tetap dengan acuan komponen gaji, nominal per komponen
  dengan alasan bila beda, ringkasan); saat mengubah, nominal tersimpan yang
  beda dari usulan dipertahankan dan komponen yang tidak lagi diusulkan
  dibuang. Modal rincian menampilkan upah, rincian, dan ringkasan, serta
  tombol **Cetak SK Pemberhentian** / **Cetak surat keterangan kerja** untuk
  proses Berlaku (dialog cetak dibuka sesudah modal rincian ditutup). Tombol
  **Alasan dan pengali** (`hr.offboard.decide`) membuka daftar alasan dengan
  formulir ubah/tambah. Templat `suratPemberhentian` dan
  `suratPengalamanKerja` di `suratKepegawaian.ts`, `permintaanSuratKeluar` di
  `DialogCetakSurat.tsx`.

Angka (dihitung ulang dari kode; `audit:contract` sebagai acuan):

| | Sebelum | Sesudah |
| :-- | :-- | :-- |
| Skema / sentinel | v70 / `-2046` | sama |
| `REQUIRED_TABLE_COUNT` | 126 | 126 |
| Tabel snapshot / rute kanonik | 81 / 145 | 81 / 145 |
| Permission | 127 | 127 |
| Command Desktop / Mobile | 419 / 424 | 420 / 425 |
| Rute Web (`src/app/api/**/route.ts`) | 309 | 310 |
| Kunci pengaturan surat | 13 | 15 |

Gerbang (oleh Claude, per berkas/per nama; `bun run check` dan suite Rust penuh
belum, sesuai keputusan pemilik):

| # | Gerbang | Hasil |
| :-- | :-- | :-- |
| 12 | Vektor `hr-keluar.vektor.json` (bulan penuh 7, masa kerja 5, kelipatan 10, rata upah 6, pembagi 6, kelompok 9, pesangon 16, susun 5, upah 3, alasan 8, surat keluar 11, ringkasan 2; validasi keluar 13 → 25) di `hr_keluar_vektor_pesangon` dan `hr-keluar.test.ts`; pesangon memuat vektor perusahaan §20.5 (6 tahun, 5 tahun, pensiun 175%), GTY 6 tahun ÷ 21, GTY 26 tahun, GTY tanpa slip, GTT kompensasi 7 bulan, PTT < 1 bulan, GTT tanpa tanggal selesai, Honorer, tanpa status, PNS dan PPPK tanpa baris | Lulus Rust dan TS (Desktop + salinan Mobile) |
| 13 | `cargo test hr_keluar_pesangon_cloud` (`TursoClient::local_file`: usulan upah 4 juta dari dua bulan slip PAID termasuk dua run di Mei, DRAFT dan slip di luar 12 bulan diabaikan; rincian 5 baris; nominal dan upah beda tanpa alasan ditolak; simpan ulang menulis ulang rincian; pengali disunting tidak menyentuh rincian tersimpan; alasan tak dikenal ditolak; GTT kompensasi 1,5 juta + UPH Cuti ÷ 21; potret memuat rincian dan ringkasan; simpan sesudah berlaku ditolak dan rincian tetap; nomor SK disimpan, SK untuk GTT ditolak, nomor kembar ditandai); `services/hr-keluar.test.ts` dengan data dan angka yang sama di database Web sungguhan | Lulus: Desktop `hr_` 30 tes (11 di `hr_keluar`), TS 4 tes dua kali di Desktop dan sekali di salinan Mobile |
| 14 | `tsc` kedua workspace; Biome berkas yang diubah; `audit:a11y`, `audit:dialog`, `audit:confirm`, `audit:ui-guard`, `audit:route-guard`, `audit:page-guard`, `audit:sql`, `audit:silent-catch`, `audit:list-bound`; `suratKepegawaian.test.ts` (dua surat baru dengan nilai jahat dan data kosong, isi SK dan keterangan, tanpa angka pesangon); `hr-beban.test.ts` 15 kunci; SK Pemberhentian dan Surat Keterangan Pengalaman Kerja dirakit dari templat sungguhan dan dicetak ke PDF A4 di Edge | Lulus: templat 16 tes, `hr-beban` 18 + 3 tes; PDF kedua surat diperiksa |
| 15 | `sync-rust-modules`, `sync-frontend-lib`; `audit:contract` (420/425 command, 127 permission, 145 rute, 81 snapshot), `audit:schema`; `cargo test hr_` di Mobile | Lulus: angka sesuai target; `audit:schema` hijau; Mobile `hr_` 30 tes (11 di `hr_keluar`), crate Mobile terkompilasi tanpa warning kode |

Keputusan yang diambil di tengah jalan:

- **Nomor surat keluar lewat `desktop_hr_offboarding_save`**, bukan command
  baru, supaya angka target (satu command, satu rute) tetap: draft berkunci
  `jenis_surat` dibedakan di backend, dan Zod menerima union dua bentuk
  `.strict()` yang kuncinya tidak tumpang tindih.
- **Menimbang/Mengingat SK Pemberhentian tetap** (teks bawaan
  `hr-surat-bawaan.json` kunci `berhenti`), tidak bisa diubah di Pengaturan
  surat: kunci `hr_surat_dasar:berhenti` akan menjadikan 16 kunci, padahal
  target 15. Wajib dicek ulang yayasan seperti teks bawaan lain.
- **Bahan cetak untuk pembaca keluar**: `desktop_hr_letter_setup` dan
  `letters/query` kini juga menerima `hr.offboard.view`, supaya peran yang
  hanya memegang izin keluar bisa mencetak. Isinya tetap tanpa data pribadi.
- **Pratinjau dihitung di layar** dengan `usulanPesangon` + `masukanPesangon`
  TS (aturan yang sama dengan backend); backend tidak menerima usulan dari
  layar, hanya isian, lalu menghitung ulang.
- **Acuan tunjangan disaring di layar** dengan `appliesToSubject` yang sudah
  ada (subjek: jenis personil, divisi, status kini, tugas pada hari terakhir);
  backend hanya mengirim daftar mentah dan data subjeknya.
- **Masa kerja di surat keterangan** dihitung sampai hari sesudah hari
  terakhir (hari terakhir ikut), sama dengan masa kerja pesangon.
- **`UPAH_RATA_SQL` diberi komentar `-- batas:`** karena `audit:list-bound`
  tidak mengenali agregat SUM satu baris; audit tidak diubah.
- **Kembar nomor surat keluar** hanya membandingkan `hr_keluar` (SK dan
  keterangan semua proses lain), tidak `hr_sp`.

Penyimpangan dari §22 untuk ditinjau:

- **Honorer dan tanpa status** mendapat satu baris `Lainnya` (usulan 0) untuk
  diisi tangan, bukan semua komponen kosong; PNS/PPPK tanpa baris sama
  sekali, jadi rincian dan ringkasannya 0.
- **Uang Pisah hanya untuk GTY/PTY** (tabel §22.2.3); GTT/PTT dengan alasan
  ber-`uang_pisah` tidak mendapat baris itu.
- **GTT/PTT tanpa kontrak bertanggal selesai** (status dari `guru_data`, atau
  kontrak tanpa tanggal selesai) tidak mendapat baris Kompensasi PKWT; bisa
  diisi lewat `Lainnya`.
- **Proses keluar yang dicatat di 4b** belum punya rincian; modal rincian
  meminta Ubah lalu simpan untuk menghitungnya. Proses 4b yang sudah berlaku
  tetap tanpa rincian (beku).
- **Blok tanda tangan SK Pemberhentian** jatuh ke halaman kedua pada kertas
  A4 dengan Menimbang/Mengingat bawaan, sama seperti SK lain yang memakai
  kerangka `keputusan` 3b.

Belum diuji di browser/perangkat: form Catat/Ubah dengan bagian Pesangon
(muat otomatis saat pegawai/hari terakhir berubah, upah dan nominal yang
diubah dengan alasan, acuan tunjangan, ringkasan negatif bila kasbon lebih
besar), modal rincian dengan rincian beku, modal Alasan dan pengali (ubah,
tambah, nonaktifkan), dialog cetak kedua surat dengan `window.print()` di Web
dan WebView2 Desktop termasuk pesan nomor kembar, simpan dua pola nomor baru di
Pengaturan surat lalu sinkron ke perangkat lain, dan pesan luring tanpa
koneksi. Yang sudah dirender adalah HTML hasil templat dengan media cetak di
Edge.
