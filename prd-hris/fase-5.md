# PRD HRIS — Fase 5

Bagian §23 dari `prd-hris.md`, dipindahkan apa adanya pada 2026-11-18 supaya satu sesi cukup membaca satu fase. Nomor bagian tidak berubah: rujukan `prd-hris.md §23.x` di kode menunjuk ke berkas ini. Istilah, keputusan pemilik (§5), hak akses umum (§15), dan sinkronisasi (§17) ada di `prd-hris.md`.

## 23. Urutan pengerjaan Fase 5

Ditulis setelah menelusuri kode sekolah (18 Nov 2026), sesudah Fase 4 lengkap
(§22.13) dan pekerjaan di luar HRIS (grid jadwal per rombel, kelas gabungan,
shift multi-sesi, ganti password sendiri). Bila §11, §15.1 (`hr.performance.*`),
atau §17 (baris Fase 5) berbeda dengan bagian ini, **bagian ini yang berlaku**
setelah Q-91 sampai Q-111 dijawab. Belum ada kode yang diubah.

Ringkasnya: **v71, sentinel `-2047` `hris-kinerja-v1`**, lima tabel **khusus
cloud** (`hr_kinerja_template`, `hr_kinerja_aspek`, `hr_kinerja_penilaian`,
`hr_kinerja_nilai`, `hr_kinerja_keputusan`), empat izin baru, tujuh command,
tanpa tabel snapshot atau rute sync baru. Aturan skala, status, koreksi, dan
rumus disiplin diambil dari HRIS perusahaan (`absensi-perusahaan` §21, fase 6,
v41); kodenya ditulis ulang karena di sini datanya khusus cloud, kelompoknya
guru/tendik, periodenya semester/tahun ajaran, dan tiga aspek otomatisnya khas
sekolah (kehadiran, keterisian presensi kelas, kelengkapan jurnal).

### 23.1 Temuan dari kode

Diverifikasi ke kode sekolah (baris per 18 Nov 2026).

**Salah atau perlu diubah:**

1. **`GATE_SUMMARY_SUBQUERY` tidak cocok sebagai sumber kehadiran pegawai.**
   Definisinya kembar di `attendance_dashboard.rs:6` ↔
   `services/attendance-dashboard.ts:6` (salinan lain di
   `class_attendance.rs:822` ↔ `class-attendance.ts:43`):
   - `status_kehadiran` diambil dengan `MAX(COALESCE(status_kehadiran, ''))`,
     yaitu maksimum **leksikografis**: hari multi-sesi dengan `Hadir` dan
     `Sakit` terbaca `Sakit`, `Alfa` dan `Hadir` terbaca `Hadir`. Daftar guru di
     dasbor (`attendance_dashboard.rs:118`) menampilkannya apa adanya;
   - `hadir_gerbang` hanya menghitung baris ber-`jam_masuk`, jadi Koreksi Admin
     `Hadir`/`Terlambat` tanpa jam tidak terbaca hadir;
   - tanpa `WHERE`, subkueri mengelompokkan seluruh `absensi_harian`.

   Yang tepat untuk kinerja adalah `LAPORAN_KEHADIRAN_SQL.hari`
   (`administration.rs:2377` ↔ `services/report.ts:346`): agregasi yang sama
   (`GROUP BY id_karyawan, tanggal`, multi-sesi digabung, `telat` = `MAX
   (menit_terlambat)`), tetapi hadir juga menerima status `Hadir`/`Terlambat`
   dan setiap status punya bendera sendiri. Fase 5 memakai kolomnya apa adanya
   ditambah saringan `id_karyawan` (pola `DISIPLIN_HARI_SQL` perusahaan).
   `GATE_SUMMARY_SUBQUERY` dan daftar dasbor tidak diubah di fase ini.
2. **Klasifikasi per hari hanya ada di TS.** `susunLaporanKehadiran`
   (`validations/laporan-kehadiran.ts:173`) menyusun matriks untuk ketiga build;
   Rust hanya mengirim data mentah (`administration.rs:2451`). Padanan Rust
   untuk potongannya sudah ada: `parse_hari_kerja` (`hari_kerja.rs:51`),
   `wajib_masuk` (`:96`), `evaluate_holiday_scan` (`scanner.rs:315`),
   `tanggal_wajib` (`hr_pengajuan.rs:602`). Nilai otomatis dibekukan dan wajib
   dihitung ulang backend, jadi klasifikasinya perlu fungsi kembar Rust ↔ TS
   (perusahaan melakukan hal yang sama). Laporan sendiri tidak diubah.
   `getLaporanKehadiran` juga dibatasi 92 hari (`MAKS_HARI_LAPORAN`,
   `administration.rs:2355`) dan memuat semua personil, jadi tidak bisa
   dipakai untuk periode semester.
3. **Izin per jam tetap membuat "terlambat".** Pengajuan Fase 2 bisa "mulai jam
   ke-N" (`jam_mulai_ke`/`jam_sampai_ke`). Guru yang izin jam 1–3 lalu scan
   pukul 10.00 punya `menit_terlambat > 0`; laporan menampilkan `T` karena
   `H`/`T` menang atas pengajuan (`laporan-kehadiran.ts:246`). Untuk kinerja,
   hari terlambat yang ditutup pengajuan berlaku dihitung tepat waktu (Q-95).
4. **Persen laporan menurunkan nilai karena cuti.** `persen` = (hadir + DL) ÷
   hari wajib, dan hari wajib memuat S/I/C (`laporan-kehadiran.ts:288`). Kinerja
   tidak boleh memakai angka itu; izin/cuti/sakit dikeluarkan dari pembagi.
5. **Jadwal mengajar tidak punya riwayat.** `jadwal_mengajar` hanya punya
   `is_aktif` (`storage.rs:2103`), dan Hapus menghapus barisnya
   (`academic.rs:1602`, handler cloud `turso.rs:13823`, Web
   `academic/schedule.ts:396`); grid jadwal per rombel menyimpan baris demi
   baris dengan urutan hapus → ubah → tambah. Jadwal yang diubah di tengah
   semester mengubah "JP terjadwal" tanggal-tanggal yang sudah lewat. Fase 5
   tidak menambah riwayat jadwal: angka otomatis dihitung saat Ajukan dan
   dibekukan, dan penilai boleh mengubah skornya dengan alasan (Q-100).
6. **Tidak ada kalender non-KBM.** Libur hanya `tbl_hari_libur`; minggu PTS/PAS,
   class meeting, dan MPLS tetap terbaca sebagai hari mengajar penuh. Hari
   Libur tidak bisa dipakai untuk itu: Generate Alfa melewati tanggal libur, jadi
   siswa yang bolos saat ujian tidak mendapat Alfa. Fase 5 butuh rentang "tanpa
   KBM terjadwal" sendiri (Q-99).
7. **`JP_TERDAMPAK_SQL` memuat pengajuan Menunggu** (`hr_pengajuan.rs:2359`,
   `<> 'Tolak'`), karena Jam Kosong harus tampil sebelum diputus. Untuk
   mengecualikan JP dari pembagi, hanya pengajuan **berlaku** yang boleh dipakai
   (`PENGAJUAN_BERLAKU_SQL`, `:50`); butuh SQL sendiri dengan predikat salinan
   harfiah.
8. **Kepala TU tidak punya penanda di data.** Kepala sekolah dikenali dari tugas
   `tgs-kepsek` (`KEPALA_UNIT_SQL`, `hr_beban.rs:39` ↔ `hr-beban.ts:351`);
   seed `hr_tugas_jenis` (`validations/hris.ts:274`) tidak punya kepala TU, dan
   role `kepala-tu` (`catalog.ts:814`) hanya paket izin. Cakupan unit
   (`dalam_cakupan`, `hr_pengajuan.rs:626`) juga tidak membedakan guru dan
   tendik, jadi Kepala TU di unit yang sama bisa menilai guru. Penilai bawaan
   tendik butuh sumber data (Q-103).
9. **Izin baru = versi baru** (§21.1 temuan 3, §22.1 temuan 9). Seed
   `app_permission` hanya jalan saat versi/sentinel naik, jadi empat izin
   `hr.performance.*` memaksa v71; perangkat v70 berhenti sinkron sampai
   diperbarui (`sync.rs:23`).

**Sudah ada, dipakai ulang (tidak dibuat dua kali):**

- **Kehadiran**: kolom `LAPORAN_KEHADIRAN_SQL.hari`, `LIBUR_SQL` dan
  `WHITELIST_SQL` (`hr_pengajuan.rs:87-88`), `tanggal_wajib`, `wajib_masuk`,
  `evaluate_holiday_scan`, `kodeKelompok` (`laporan-kehadiran.ts`), urutan
  "H/T > pengajuan > S/I/D > A > -" (§20.2.6).
- **Pengajuan berlaku**: `PENGAJUAN_BERLAKU_SQL` (`hr_pengajuan.rs:50`), pola
  `LAPORAN_PENGAJUAN_SQL` (`:750`), `PENGAJUAN_RENTANG_SQL` (`:52`, membawa jam).
- **JP terjadwal**: `JADWAL_JP_SQL` (`:2362`: jadwal aktif tahun ajaran yang
  bertumpuk rentang, dengan unit rombel), `jp_terdampak` (`:2478`: libur
  dilewati, semester dicek per tanggal, baris rentang `3-4` dihitung utuh),
  `tanggal_rentang` (`:199`), `jam_ke_range` (`class_attendance.rs:735`),
  `PENANGANAN_SQL` (`:2364`), `id_penanganan` (`:2454`).
- **Jangan disamakan dengan honor**: `summarize_teaching`
  (`payroll/engine.rs:243`) menghitung satu jam per (tanggal, jam) supaya kelas
  gabungan tidak dibayar berlipat. Keterisian presensi justru per rombel,
  karena setiap rombel butuh presensinya sendiri (§23.2.4). Keduanya benar
  untuk tujuannya masing-masing.
- **Kelas gabungan**: jadwal satu baris per rombel (bentrok jadwal dinilai per
  rombel + mapel + hari, `academic.rs:1489`), presensi satu sesi per rombel
  (`desktop_save_class_attendance_gabungan`), jurnal disalin ke sesi gabungan
  yang belum berjurnal (`terapkan_gabungan`, `teaching_journal.rs:282`,
  `SESI_GABUNGAN_TANPA_JURNAL_SQL` `:352`).
- **Paraf jurnal**: setiap simpan jurnal mengisi `paraf_at` dan
  `paraf_operator` dari sesi (`teaching_journal.rs:215-222`), jadi "berparaf" =
  baris `jurnal_mengajar` ada. `jurnal_mengajar.id_presensi_mapel` hanya
  berindeks (`storage.rs:1969`), bukan unik: dua perangkat bisa membuat dua
  jurnal untuk satu sesi, jadi hitungan memakai `EXISTS`, bukan `JOIN`.
- **Cakupan dan sesi**: `dalam_cakupan` ↔ `dalamCakupan`, `UNIT_PERSONIL_SQL`
  (`hr_pengajuan.rs:83`), pola `wewenang` (`hr_keluar.rs:279`: diri sendiri dan
  unit dari sesi, unit dibaca di cloud), `OperatorUser.id_karyawan`
  (`models.rs:47`), `hr.scope.all`.
- **Atasan**: `master_data.id_atasan` (`storage.rs:637`), `periksa_atasan` dan
  `dalam_siklus_atasan` (`hris.rs:131`, `:157`).
- **Status kepegawaian**: `STATUS_KINI_SQL` (`hris.rs:314`), `kelompok_status`
  (`hr_keluar.rs:665`: `tetap`, `kontrak`, `negeri`, `lainnya`).
- **Pegawai keluar**: `master_data.id_keluar` + `tanggal_selesai_aktif`
  (§22.2.2), `tanggal_daftar` sebagai tanggal masuk (`PEGAWAI_SP_SQL`,
  `hr_keluar.rs:208`).
- **Khusus cloud**: `klien_cloud` (`commands.rs:3280`), `PESAN_LURING` dan
  `luring` (`hris_cloud.rs:35`, `:415`), `execute_atomic` dengan penjaga
  keadaan lalu dibaca ulang (§22.13), pola `hr_sp`/`hr_keluar`.
- **Kelompok guru/tendik**: `CASE WHEN g.id_guru IS NOT NULL OR jenis_personil =
  'guru'` (daftar pegawai `hris.rs:322`, `IDENTITAS_PEGAWAI_SQL`
  `hr_beban.rs:42`).
- **Cetak**: `components/cetak-a4.ts`, `suratKepegawaian.ts`, bahan kop
  `desktop_hr_letter_setup`; tanggal WIB `HARI_INI_SQL` (`hris.rs:325`).
- **SP**: `hr_sp` khusus cloud; SP Berlaku dalam periode dibaca langsung.

**Kait:**

- Versi sekarang: `CURRENT_SCHEMA_VERSION` 70 dan `REQUIRED_TABLE_COUNT` 126
  (`db-schema.ts:5-6`), `CLIENT_SCHEMA_VERSION` 70 (`sync.rs:23`), sentinel
  `-2046` (`turso.rs:5562`, pemeriksa `:6001`).
- `audit:contract` 18 Nov 2026: 145 rute kanonik, 81 tabel snapshot, command
  Desktop **422** / Mobile **427**, 127 permission; rute Web **312**
  (`src/app/api/**/route.ts`). Angka §22.13 (420/425, 310) sudah lewat: kelas
  gabungan dan ganti password sendiri masing-masing menambah satu command dan
  satu rute.
- RBAC: `SENSITIVE_MUTATION_PERMISSIONS` (`catalog.ts:581`),
  `CONFIDENTIAL_PERMISSIONS` (`:695`), `DEFAULT_ROLE_PERMISSIONS` (`:723`) ↔
  `ROLE_HRIS_BAWAAN` (`turso.rs`). Area `kepegawaian` = `employees.view` atau
  `teachers.view` (`auth/access.ts:108`); kelima role HRIS memegang
  `employees.view` kecuali Guru Piket.
- `PROMOTION_PLAN` (`server/database-promotion.ts:41`), tab `/kepegawaian`
  (`app/kepegawaian/page.tsx:50`).

### 23.2 Rancangan per bagian

#### 23.2.1 Template dan aspek

- **Template** (`validasi_template` ↔ `validasiTemplate`): `nama` 1–100, unik di
  aplikasi (dicek di batch cloud, tanpa `UNIQUE`); `kelompok` `Guru` atau
  `Tendik`, **terkunci** sejak dibuat; `keterangan` ≤ 1.000.
- **Bawaan**: paling banyak satu template aktif ber-`is_bawaan = 1` per
  kelompok, dijaga di batch yang sama (`UPDATE … SET is_bawaan = 0 WHERE
  kelompok = ? AND id_template <> ?`, aturan single-active). Template bawaan
  tidak bisa dinonaktifkan selagi bawaan.
- **Aspek aktif** 1–20; nama 1–100 unik dalam template; bobot bilangan bulat
  1–100, **total aspek aktif tepat 100**; `panduan` ≤ 1.000 (rubrik untuk
  penilai). Aspek tidak dihapus, hanya dinonaktifkan; tipenya terkunci.
- **Tipe** (CHECK, nilai asing ditolak):

  | Tipe | Kelompok | Paling banyak |
  | :-- | :-- | :-- |
  | `Manual` | Guru, Tendik | tanpa batas |
  | `Otomatis Kehadiran` | Guru, Tendik | satu per template |
  | `Otomatis Presensi Kelas` | Guru | satu per template |
  | `Otomatis Jurnal` | Guru | satu per template |

  Template Tendik dengan aspek presensi kelas atau jurnal ditolak.
- **Pilihan template** (Q-92): saat penilaian dibuat, template bawaan
  kelompoknya terpilih; penilai boleh memilih template aktif lain **dari
  kelompok yang sama** (misalnya template satpam untuk tendik keamanan). Tanpa
  tabel pemetaan jabatan.
- **Mengubah template yang sudah dipakai**: boleh. Penilaian menyalin nama,
  tipe, bobot, dan urutan aspek ke `hr_kinerja_nilai`; perubahan hanya berlaku
  untuk penilaian sesudahnya. Draf bisa **Muat ulang template** (skor aspek
  yang `id_aspek`-nya masih ada dipertahankan).
- **Template bawaan ditanam** (Q-93) dari
  `validations/hr-kinerja-template-bawaan.json`, `INSERT OR IGNORE` di cloud
  saja, **wajib dicek ulang yayasan**:

  | Guru (`ktp-guru`) | Bobot | | Tendik (`ktp-tendik`) | Bobot |
  | :-- | --: | :-- | :-- | --: |
  | Kehadiran (otomatis) | 10 | | Kehadiran (otomatis) | 20 |
  | Keterisian presensi kelas (otomatis) | 10 | | Kualitas hasil kerja | 25 |
  | Kelengkapan jurnal mengajar (otomatis) | 10 | | Ketepatan dan tanggung jawab | 20 |
  | Supervisi akademik (observasi kelas) | 20 | | Pelayanan | 15 |
  | Kompetensi pedagogik | 15 | | Kerja sama | 10 |
  | Kompetensi kepribadian | 10 | | Integritas dan kedisiplinan | 10 |
  | Kompetensi sosial | 10 | | | |
  | Kompetensi profesional | 15 | | | |

#### 23.2.2 Periode

- **Jenis** (Q-94) dari `akademik_tahun_ajaran` (satu baris = satu semester,
  `storage.rs:1775`):
  - `Semester`: satu baris; `periode_kunci` = `id_tahun_ajaran`,
    rentang = `tanggal_mulai`..`tanggal_selesai` baris itu;
  - `Tahun Ajaran`: semua baris ber-`nama_tahun` sama; `periode_kunci` =
    `nama_tahun`, rentang = MIN mulai..MAX selesai.

  Payload menyebut jenis + kunci; rentang dihitung backend dari tabel dan
  disalin ke penilaian (`periode_nama`, `periode_mulai`, `periode_selesai`),
  jadi tanggal tahun ajaran yang disunting kemudian tidak mengubah penilaian
  lama. Rentang bebas tidak didukung.
- **Satu penilaian per pegawai per periode**: penilaian akar (tanpa `id_ref`)
  yang tidak dibatalkan dan rentangnya bertumpuk dengan akar lain pegawai itu
  (jenis apa pun) **ditolak di batch cloud** (`INSERT … SELECT … WHERE NOT
  EXISTS`, dibaca ulang). Karena khusus cloud, tidak ada kembaran luring dan
  tanda `penilaian_ganda` perusahaan tidak diperlukan.
- **Rentang aktif** (`rentang_aktif` ↔ `rentangAktif`): mulai = max
  (`periode_mulai`, `tanggal_daftar` bila valid); akhir = min
  (`periode_selesai`, `tanggal_selesai_aktif` bila `id_keluar` terisi). Rentang
  aktif kosong = tidak bisa dinilai; lebih pendek dari periode = tanda
  `periode_tidak_penuh`.
- **Dihitung sampai** = min(akhir aktif, hari ini WIB). Ajukan terbuka sejak
  periode dimulai (Q-102); bila dihitung sampai < `periode_selesai`, tanggalnya
  ikut dibekukan di `rincian` dan muncul tanda `periode_belum_selesai`.
- **Membuat**: pegawai aktif tanpa `id_keluar`, bukan siswa. Sesudah keluar
  berlaku, penilaian baru ditolak; draf dan yang diajukan tetap bisa diselesaikan
  atau dibatalkan.
- **PNS/PPPK** (`kelompok_status` = `negeri`, Q-106): boleh dinilai sebagai
  penilaian internal, tetapi tidak masuk daftar "Belum dinilai"; tanda `asn`
  ("penilaian resmi ASN ada di platform pemerintah").

#### 23.2.3 Aspek otomatis: kehadiran

Fungsi murni kembar `hitung_kehadiran` ↔ `hitungKehadiran`, masukan dari SQL
kembar (teks diperiksa harfiah): `KINERJA_PEGAWAI_SQL` (unit, divisi, kelompok,
`hari_kerja`, `kode_shift`, `tanggal_daftar`, `id_keluar`,
`tanggal_selesai_aktif`, `id_atasan`, jabatan), `KINERJA_HARI_SQL` (kolom
`LAPORAN_KEHADIRAN_SQL.hari` + `id_karyawan = ?3`), `KINERJA_PENGAJUAN_SQL`
(kolom `PENGAJUAN_RENTANG_SQL` + `id_karyawan = ?3`, predikat
`PENGAJUAN_BERLAKU_SQL` harfiah), `LIBUR_SQL`, `WHITELIST_SQL` apa adanya.

**Klasifikasi per tanggal** dalam rentang dihitung (yang pertama cocok, Q-95):

| # | Keadaan | Kelas |
| :-- | :-- | :-- |
| 1 | Hadir, tidak terlambat (`H`) | tepat |
| 2 | Hadir, terlambat, **dan** ada pengajuan berlaku apa pun di tanggal itu (izin per jam, setengah hari) | tepat |
| 3 | Hadir, terlambat (`T`) | telat |
| 4 | pengajuan berlaku `Dinas Luar`, tanggal itu tercatat atau dijadwalkan | tepat |
| 5 | pengajuan berlaku `Cuti`/`Izin`/`Sakit`, tercatat atau dijadwalkan | dikecualikan |
| 6 | tercatat `Sakit`/`Izin`/`Dispen` (Koreksi Admin) | dikecualikan |
| 7 | tercatat `Alfa` | alfa |
| 8 | dijadwalkan (`tanggal_wajib`: shift, libur, whitelist) tanpa catatan | kosong |
| 9 | selain itu (libur, libur mingguan) | tidak dihitung |

Urutan 1, 3, 5–9 sama dengan `susunLaporanKehadiran`; baris 2 menutup temuan 3,
baris 4 mengikuti laporan sekolah (DL dihitung hadir). Laporan tidak diubah.

**Aritmetika** (`i64` ↔ `number`, bilangan bulat; hasil kali maks 2 × 366 ×
1.000):

- `D` = tepat + telat + alfa + kosong.
- `P` (permil) = ⌊(2 × tepat + telat) × 1.000 / (2 × D)⌋.
- Skor dari ambang `hr_kinerja_ambang` (a₅, a₄, a₃, a₂; bawaan 950, 900, 800,
  700): 5 bila P ≥ a₅, …, selain itu 1 (`skor_ambang` ↔ `skorAmbang`).
- `D = 0`: skor tidak dihitung, penilai mengisi manual dengan catatan wajib,
  tanda `otomatis_manual`.
- `rincian` = `K|D|tepat|telat|alfa|kosong|dikecualikan|P|a5,a4,a3,a2|sampai`.

Vektor (dari perusahaan §21.6, ditambah kasus sekolah): tepat 17, telat 2, alfa
1 → P = 36.000 / 40 = 900 → 4. Tepat 20, telat 1 → ⌊41.000/42⌋ = 976 → 5. Kosong
3 → 0 → 1. Tepat 10 + cuti 4 → D = 10 → 1.000 → 5. Telat 1 hari dengan izin jam
1–3 berlaku → tepat. DL 2 hari tanpa scan → tepat 2. Shift multi-sesi dengan
sesi kedua terlambat → satu hari telat.

#### 23.2.4 Aspek otomatis: presensi kelas dan jurnal (guru)

Fungsi murni kembar `hitung_mengajar` ↔ `hitungMengajar`, masukan dari SQL
kembar: `KINERJA_JADWAL_SQL` (`JADWAL_JP_SQL` + `AND j.id_guru = ?3`, teks
lainnya salinan harfiah), `KINERJA_PRESENSI_SQL` (`presensi_mapel` guru itu
dalam rentang: `id_presensi_mapel`, `id_rombel`, `tanggal`, `jam_ke`, dan
`berjurnal` = `EXISTS jurnal_mengajar`), `KINERJA_JP_BERLAKU_SQL` (pola
`JP_TERDAMPAK_SQL` untuk satu guru dengan predikat `PENGAJUAN_BERLAKU_SQL`
harfiah, temuan 7), `PENANGANAN_SQL` disaring ke pengajuan itu, dan pengaturan
`hr_kinerja_tanpa_kbm`.

**Satuan** = (rombel, tanggal, jam) milik jadwal guru itu (Q-96):

1. Untuk setiap tanggal dalam rentang dihitung yang bukan libur dan bukan
   rentang tanpa KBM (Q-99), setiap jadwal aktif guru dengan `hari` = hari ISO
   tanggal itu dari tahun ajaran yang memuat tanggalnya (`ta_memuat`), setiap jam
   di `jam_ke_range(jam_ke)` menjadi satu satuan. Satuan kembar (kunci sama)
   dihitung sekali.
2. **Dikecualikan**: satuan dari baris jadwal yang ada di `jp_terdampak`
   pengajuan berlaku guru itu (izin/sakit/cuti/DL per JP; baris `3-4` yang
   tersentuh dikecualikan utuh, sama dengan Fase 2).
3. **Terisi**: ada `presensi_mapel` dengan `id_guru` = guru, `id_rombel` dan
   `tanggal` sama, dan jam satuan ada di `jam_ke_range` sesinya. Mapel tidak
   dicocokkan.
4. **Berjurnal**: satuan terisi yang salah satu sesi penutupnya `berjurnal`.

Akibatnya, tanpa kode khusus:

- **Kelas gabungan** terjadwal tiga rombel di jam yang sama = tiga satuan;
  presensi gabungan tiga sesi = 3/3, dua sesi = 2/3. Tidak berlipat (yang
  dihitung hanya satuan terjadwal) dan tidak terpotong (per rombel, bukan per
  jam seperti honor).
- **Agama yang memecah rombel** (dua guru, rombel dan jam sama, mapel beda):
  setiap guru hanya dinilai atas jadwal dan presensinya sendiri.
- **Sesi kembar dari dua perangkat** tidak menggandakan apa pun.
- **Presensi sebagai pengganti** (JP guru lain) tidak masuk pembagi; dihitung
  sebagai `jp_pengganti` untuk informasi.
- **Jurnal gabungan** yang tidak diterapkan ke rombel lain terbaca kurang
  (misalnya 1/3); layar menunjuk tanggal dan rombelnya.

**Aritmetika**: presensi kelas `D` = satuan − dikecualikan, P = ⌊terisi × 1.000
/ D⌋; jurnal `D` = terisi, P = ⌊berjurnal × 1.000 / D⌋; skor lewat ambang yang
sama. `D = 0` (guru BK, kepala sekolah tanpa JP, semua JP izin) = skor manual
dengan catatan, tanda `otomatis_manual`.

`rincian` presensi kelas `PK|satuan|dikecualikan|terisi|pengganti|tanpa_penanganan|P|a5,a4,a3,a2|sampai`,
jurnal `J|terisi|berjurnal|P|a5,a4,a3,a2|sampai`.

**JP terdampak tanpa penanganan** (`hr_jp_penanganan` kosong, Fase 2c): hanya
**informasi** di rincian presensi (`tanpa_penanganan`), tidak mengubah skor
(Q-98). Penanganan ditulis Kepala Sekolah/Guru Piket (`hr.substitute.manage`),
bukan guru yang izin.

Vektor (minimal): jadwal Senin jam `1-2` rombel A dan jam 3 rombel B dan C
(gabungan), empat Senin dengan satu libur → 12 satuan; B dan C terisi semua, A
terisi 2 dari 3 Senin → terisi 10 → ⌊10.000/12⌋ = 833 → skor 3. Senin yang A
kosong ditutup izin berlaku jam 1–2 → D = 10, terisi 10 → 1.000 → 5. Presensi
`3-4` menutup jadwal `3` dan `4` → 2/2. Sesi kembar → tetap 10. Terisi 10,
berjurnal 9 → 900 → 4. Tanggal di rentang tanpa KBM → tidak ada satuan.
Tanggal di luar semester jadwal → tidak ada satuan.

#### 23.2.5 Skor, nilai akhir, predikat

- **Skor aspek** bilangan bulat 1–5. Aspek otomatis: `skor_hitung` dari rumus;
  `skor` = `skor_hitung` kecuali penilai mengubahnya dengan catatan wajib (Q-100,
  tanda `otomatis_diubah` di daftar dan rincian penilai akhir).
- **Nilai aspek** = (skor − 1) × 25 (1 → 0, 3 → 50, 5 → 100).
- **Nilai akhir ×100** (`nilai_akhir` ↔ `nilaiAkhir`) = Σ bobot × 25 × (skor −
  1), bilangan bulat 0–10.000, tanpa pembulatan; tampil `77,50`.
- **Predikat** (`predikat` ↔ `predikatNilai`): pasangan pertama
  `hr_kinerja_predikat` yang ambangnya ≤ nilai akhir ×100. Bawaan (Q-101)
  mengikuti rentang PermenPAN-RB 16/2009: `9100:Amat Baik|7600:Baik|6100:Cukup|5100:Sedang|0:Kurang`.
- Nilai akhir dan predikat **dibekukan** di baris keputusan `Final`; mengubah
  pengaturan tidak mengubah penilaian final.
- Vektor: bobot template Guru 10/10/10/20/15/10/10/15 dengan skor
  4/5/4/4/3/4/4/3 → 750 + 1.000 + 750 + 1.500 + 750 + 750 + 750 + 750 = 7.000 →
  70,00 Cukup. Perusahaan: 40/35/25 dengan 4/5/3 → 7.750 → 77,50 Baik. Semua 5
  → 10.000 Amat Baik; semua 1 → 0 Kurang.

#### 23.2.6 Alur, status, dan koreksi

**Status turunan** (`status_kinerja` ↔ `statusKinerja`, tidak disimpan),
keputusan urut menurut `urut`:

1. `Dibatalkan`: ada keputusan `Batal`.
2. `Final`: ada keputusan `Final`.
3. `Diajukan`: keputusan `Ajukan`/`Kembalikan` terakhir adalah `Ajukan`.
4. `Draf`.

Karena khusus cloud dengan satu penulis per batch, sidik isi (pola
`sidik_pengajuan`) tidak dibutuhkan: setiap tulis dijaga keadaan di SQL yang
sama. Penjaga kembar diperiksa harfiah: `DRAF_SQL` (tidak ada `Final`/`Batal`,
dan keputusan Ajukan/Kembalikan terakhir bukan `Ajukan`) dan `DIAJUKAN_SQL`.
`urut` = `COALESCE(MAX(urut), 0) + 1` per penilaian di statement `INSERT` yang
sama.

**Aksi** (`periksa_aksi_kinerja` ↔ `periksaAksiKinerja`; semuanya ditolak untuk
`id_karyawan` = `id_karyawan` sesi, termasuk Superadmin; cakupan unit dari sesi,
§23.4):

| Aksi | Izin | Syarat | Tulis (satu batch) |
| :-- | :-- | :-- | :-- |
| Buat | `assess` | pegawai boleh dinilai (§23.2.2), tidak bertumpuk | header + baris nilai salinan template + hitung otomatis |
| Simpan draf | `assess` | Draf | header + semua baris nilai, otomatis dihitung ulang; penilai = sesi penyimpan terakhir |
| Muat ulang template | `assess` | Draf | baris nilai ditulis ulang dari template kini |
| Ajukan | `assess` | Draf; semua skor terisi; catatan wajib terisi; `rincian` kiriman layar = hitungan backend saat itu (bila beda: `PESAN_OTOMATIS_BERUBAH`, layar memuat ulang) | baris nilai otomatis beku + keputusan `Ajukan` |
| Kembalikan | `finalize` | Diajukan; alasan 1–500 | keputusan |
| Final | `finalize` | Diajukan | keputusan dengan `nilai_akhir` + `predikat` beku |
| Batal | `assess` atau `finalize` | Draf atau Diajukan; alasan wajib | keputusan |
| Koreksi | `finalize` | akar Final; tidak ada koreksi terbuka untuk akar itu; alasan 1–1.000 | penilaian baru ber-`id_ref` akar, nilai disalin dari penilaian berlaku |

- Desktop: Ajukan menjalankan `syncNow()` dulu supaya presensi, jurnal, dan
  absensi perangkat itu yang masih di outbox sampai ke cloud; gagal sinkron =
  Ajukan tetap jalan dengan peringatan (pola Q-72 perusahaan, arah dorong).
- Koreksi melewati Draf → Diajukan → Final yang sama; aspek otomatis koreksi
  dihitung ulang. **Nilai berlaku** (`kinerja_berlaku` ↔ `kinerjaBerlaku`) =
  penilaian Final di keluarga akar yang keputusan `Final`-nya paling akhir.
- **Tanda** (`tanda_kinerja` ↔ `tandaKinerja`): `bukan_penilai_bawaan`,
  `dinilai_dan_difinalkan_sama` (preseden Q-28 perusahaan), `otomatis_diubah`,
  `otomatis_manual`, `periode_tidak_penuh`, `periode_belum_selesai`,
  `pengajuan_menunggu` (ada pengajuan Menunggu dalam periode, angka bisa
  berubah), `asn`. `otomatis_berubah` (hitungan hidup ≠ `rincian` beku) hanya
  di layar rincian.

**Penilai bawaan** (`penilai_bawaan` ↔ `penilaiBawaan`, Q-103) hanya menentukan
daftar "Perlu saya nilai" dan tanda, tidak membatasi:

1. `master_data.id_atasan` bila terisi dan aktif;
2. guru: kepala unitnya pada `periode_selesai` (`KEPALA_UNIT_SQL`);
3. tendik: pemegang tugas **baru** `tgs-ka-tu` (Kepala Tata Usaha) di unitnya
   pada `periode_selesai` (`KEPALA_TU_SQL`, salinan harfiah `KEPALA_UNIT_SQL`
   dengan id jenis lain);
4. tidak ada = "belum ada penilai bawaan".

**SP** (Q-109): SP Berlaku dalam periode tampil di rincian sebagai informasi,
tidak mengubah angka dan tidak dicetak.

#### 23.2.7 Cetak

**Lembar Hasil Penilaian Kinerja** (Q-107), Web/Desktop, hanya penilaian
`Final` (Draf dan Diajukan tidak bisa dicetak). Templat `lembarKinerja` di
`suratKepegawaian.ts` dengan kerangka `cetak-a4.ts` dan kop dari
`desktop_hr_letter_setup` (izinnya ditambah `hr.performance.view` dan
`.finalize`, pola §22.13). Tanpa nomor, jadi tidak lewat `DialogCetakSurat`.

Isi: identitas tanpa data pribadi (nama, NIP/NUPTK, jabatan, unit, status kini,
kelompok), periode dan rentang aktif, template, tabel aspek (bobot, skor, nilai,
catatan), rumus dan angka setiap aspek otomatis dari `rincian` beku (termasuk
"dihitung sampai"), nilai akhir dan predikat, catatan umum, keterangan koreksi
bila ada, tiga tanda tangan: penilai (nama beku di penilaian), pegawai yang
dinilai, dan "Mengetahui" (kepala unit pada tanggal Final; bila penilainya kepala
unit, ketua yayasan dari `hr_surat_yayasan_*`). Dialog cetak dibuka sesudah
modal rincian ditutup.

#### 23.2.8 Telegram dan gaji

Tidak ada kejadian Telegram (Fase 6) dan tidak ada kait ke gaji, KGB, atau
perpanjangan kontrak (Q-111).

### 23.3 Model data dan sinkronisasi

**Kenapa khusus cloud (Q-91)**, berbeda dengan perusahaan (Q-71 di sana memilih
tersinkron semua):

- nilai dan catatan penilai rahasia; sekolah sudah memilih khusus cloud untuk
  data serupa (`hr_profil` Q-33, SP dan pesangon Q-73), jadi tidak tersalin ke
  setiap SQLite termasuk terminal scanner;
- masukan aspek otomatis dibaca dari cloud oleh kedua jalur (Desktop lewat
  `TursoClient`, seperti bahan pesangon 4c), jadi angkanya satu sumber dan
  masalah "disiplin basi" perusahaan (Q-72 di sana) hilang;
- penilaian dikerjakan sedikit orang di akhir semester dan diputus satu orang,
  jadi keadaan bisa dijaga di batch cloud: tumpang tindih periode dan tulis
  sesudah Final **ditolak**, bukan dijadikan tanda.

Akibatnya: butuh koneksi untuk menilai (`PESAN_LURING`), dan tidak ada layar
Mobile.

**Khusus cloud** (`turso.rs` + `db-schema.ts`/`db-migrations.ts`; tidak di
`storage.rs`, snapshot, atau outbox; tanpa `UNIQUE` selain PK; `created_at`/
`updated_at` `NOT NULL DEFAULT (datetime('now'))`):

| Tabel | Kolom |
| :-- | :-- |
| `hr_kinerja_template` | `id_template` PK (`ktp-<acak>`, bawaan `ktp-guru`/`ktp-tendik`); `nama` NOT NULL; `kelompok` NOT NULL CHECK IN (`Guru`, `Tendik`); `keterangan`; `is_bawaan`, `is_aktif` INTEGER NOT NULL CHECK (0,1); `diubah_oleh` NOT NULL; `created_at`, `updated_at`. Indeks `kelompok` |
| `hr_kinerja_aspek` | `id_aspek` PK (`<id_template>:<acak>`); `id_template` NOT NULL; `nama` NOT NULL; `tipe` NOT NULL CHECK IN (`Manual`, `Otomatis Kehadiran`, `Otomatis Presensi Kelas`, `Otomatis Jurnal`); `bobot` INTEGER NOT NULL CHECK 1–100; `panduan`; `urutan` INTEGER NOT NULL DEFAULT 0; `is_aktif` NOT NULL DEFAULT 1 CHECK (0,1); `created_at`, `updated_at`. Indeks `id_template` |
| `hr_kinerja_penilaian` | `id_penilaian` PK (`knj-<acak>`); `id_karyawan` NOT NULL; `id_ref` (koreksi: id AKAR); `alasan_koreksi`; `periode_jenis` NOT NULL CHECK IN (`Semester`, `Tahun Ajaran`); `periode_kunci`, `periode_nama`, `periode_mulai`, `periode_selesai` NOT NULL, CHECK `periode_selesai >= periode_mulai`; `id_template`, `template_nama`, `kelompok` NOT NULL (salinan); `unit`, `jabatan`, `status_kepegawaian` (salinan saat dibuat, untuk tampilan dan cetak); `id_penilai` (id karyawan sesi), `penilai_nama`, `penilai_oleh` NOT NULL (username penyimpan terakhir); `catatan`; `dihitung_sampai`; `dibuat_oleh` NOT NULL; `created_at`, `updated_at`. Indeks `(id_karyawan, periode_mulai)`, `id_ref`, `(periode_mulai, periode_selesai)` |
| `hr_kinerja_nilai` | `id_nilai` PK (`<id_penilaian>:<id_aspek>`); `id_penilaian`, `id_aspek`, `aspek_nama` NOT NULL; `tipe` NOT NULL CHECK sama; `bobot` INTEGER NOT NULL CHECK 1–100; `urutan` NOT NULL DEFAULT 0; `skor` INTEGER CHECK (`skor IS NULL OR skor BETWEEN 1 AND 5`); `skor_hitung` INTEGER CHECK sama (hanya otomatis); `catatan`; `rincian` (teks kanonik, hanya otomatis). Indeks `id_penilaian` |
| `hr_kinerja_keputusan` | `id_keputusan` PK (`kpk-<acak>`); `id_penilaian` NOT NULL; `urut` INTEGER NOT NULL; `jenis` NOT NULL CHECK IN (`Ajukan`, `Kembalikan`, `Final`, `Batal`); `alasan`; `nilai_akhir` INTEGER CHECK (`nilai_akhir IS NULL OR nilai_akhir BETWEEN 0 AND 10000`, hanya `Final`); `predikat` (hanya `Final`); `oleh` NOT NULL; `id_karyawan_oleh`; `created_at`. Indeks `id_penilaian`. Append-only |

Template, aspek, dan keputusan tidak pernah dihapus; baris nilai ditulis ulang
hanya selama Draf.

**Tersinkron (Q-103)**: satu baris seed `hr_tugas_jenis` (`tgs-ka-tu`, "Kepala
Tata Usaha", `ekuivalen_jp` 0), `INSERT OR IGNORE` dengan id deterministik di
kedua jalur provisioning; perangkat mendapatkannya lewat tarikan biasa. Tugasnya
dicatat di tab Tugas Tambahan yang ada (unit wajib). Tanpa kolom baru.

**Pengaturan** (`setting_gex_system`, tersinkron, lewat command baru
`desktop_hr_performance_settings_save` dengan validator sendiri
`validasi_pengaturan_kinerja` ↔ `validasiPengaturanKinerja`, ketiga kunci wajib
sekaligus, pola `desktop_hr_letter_settings_save`; kosong atau rusak = bawaan):

| Kunci | Bawaan | Aturan |
| :-- | :-- | :-- |
| `hr_kinerja_ambang` | `950,900,800,700` | empat bilangan bulat 1–1.000, turun tegas |
| `hr_kinerja_predikat` | `9100:Amat Baik\|7600:Baik\|6100:Cukup\|5100:Sedang\|0:Kurang` | 2–7 pasangan `ambang×100:nama`, turun tegas, terakhir 0, nama 1–50 tanpa `\|` dan `:` |
| `hr_kinerja_tanpa_kbm` | kosong | 0–30 rentang `YYYY-MM-DD..YYYY-MM-DD:Nama` dipisah `\|`, mulai ≤ selesai, tiap rentang ≤ 31 hari, nama 1–50 |

**Versi dan angka:**

| | Sekarang | Sesudah Fase 5 |
| :-- | :-- | :-- |
| Skema / sentinel | v70 / `-2046` | v71 / `-2047` `hris-kinerja-v1` (+ daftar sentinel tes `turso.rs`, versi tes RBAC) |
| `REQUIRED_TABLE_COUNT` | 126 | 131 (+5 khusus cloud; `isDatabaseSchemaReady`, `schema-consistency.test.ts`, daftar harapan khusus cloud `audit-sync-contract.ts`) |
| Tabel snapshot | 81 | 81 |
| Rute kanonik | 145 | 145 |
| Permission | 127 | 131 |
| Command Desktop / Mobile | 422 / 427 | 429 / 434 |
| Rute Web | 312 | 319 |
| Kunci pengaturan kinerja | 0 | 3 |

`PROMOTION_PLAN` mendapat kelima tabel (`hr_kinerja_aspek` sesudah
`hr_kinerja_template`; `hr_kinerja_penilaian` sesudah `master_data` dan
template; nilai dan keputusan sesudah penilaian); semuanya dibuang saat pindah
database seperti tabel HRIS lain. Seed template hanya di cloud sesudah
`CREATE`, aman karena tidak lewat outbox.

### 23.4 Hak akses

| Izin | Sensitif | Rahasia | Paket bawaan |
| :-- | :-- | :-- | :-- |
| `hr.performance.view` (baca semua penilaian) | | ya | Yayasan, Kepala Sekolah, Kepegawaian |
| `hr.performance.assess` (buat, isi, ajukan, batalkan draf) | | ya | Yayasan, Kepala Sekolah, Kepala TU |
| `hr.performance.finalize` (kembalikan, final, koreksi) | ya | | Yayasan |
| `hr.performance.config` (template, pengaturan) | ya | | Yayasan, Kepegawaian |

- Sensitif → `SENSITIVE_MUTATION_PERMISSIONS`; rahasia →
  `CONFIDENTIAL_PERMISSIONS`; semuanya `NOT IN` seed Admin Rust. **Admin bawaan
  tidak mendapat satu pun** (Q-104): `config` dijadikan sensitif karena bobot,
  ambang, dan predikat menentukan nilai setiap penilaian yang belum Final, dan
  tanpa itu katalog otomatis memasukkannya ke paket Admin (`catalog.ts:727`).
- Paket: `DEFAULT_ROLE_PERMISSIONS` ↔ `ROLE_HRIS_BAWAAN`. Guru Piket tidak
  mendapat apa pun.
- **Sekolah negeri** (Q-15): `hr.performance.finalize` diberikan ke Kepala
  Sekolah lewat Role & Akses, tanpa kode khusus; penilai yang juga memfinalkan
  ditandai `dinilai_dan_difinalkan_sama`.
- **Cakupan unit** (`dalam_cakupan`, unit akun dari sesi lewat
  `UNIT_PERSONIL_SQL`, unit sasaran = unit pegawai kini): buat, simpan, ajukan,
  batal, kembalikan, final, koreksi. `hr.scope.all` lintas unit.
- **Diri sendiri**: semua aksi ditolak; penilaian atas diri sesi tidak terbaca
  selama belum Final, dan sesudah Final hanya lewat `view` (Q-85 perusahaan).
- **Membaca** daftar dan rincian: `view`, `assess`, atau `finalize`, tanpa
  saringan unit (A-5, sama dengan SP; Q-105). Template: keempat izin.
- Tidak ada area baru; tab Kinerja di `/kepegawaian` memeriksa izinnya sendiri
  (`auth/access.ts:108`), backend memeriksa ulang.

### 23.5 Command, rute, gateway, dan layar

**Rust**: modul baru `desktop/hr_kinerja.rs` (aturan murni, SQL kembar, I/O
cloud lewat `klien_cloud`, tanpa koneksi `PESAN_LURING`); `filesToSync`,
`pub mod` di kedua `mod.rs`; terdaftar di kedua `lib.rs`, `build.rs`,
`capabilities/default.json`, `permissions/autogenerated`.

| Command | Izin | Rute Web (`POST /api/kepegawaian/performance/…`) |
| :-- | :-- | :-- |
| `desktop_hr_performance_templates` (template, aspek, pengaturan) | salah satu dari empat | `templates` |
| `desktop_hr_performance_template_save` | `config` | `template-save` |
| `desktop_hr_performance_settings_save` | `config` | `settings` |
| `desktop_hr_performance_list` (per periode: penilaian, status, tanda, belum dinilai, perlu saya nilai; atau riwayat satu pegawai) | `view` / `assess` / `finalize` | `query` |
| `desktop_hr_performance_detail` (rincian, hitungan otomatis hidup, riwayat koreksi, SP Berlaku, penilai bawaan) | `view` / `assess` / `finalize` | `detail` |
| `desktop_hr_performance_save` (buat, simpan draf, muat ulang, koreksi) | `assess`; koreksi `finalize` | `save` |
| `desktop_hr_performance_decide` (Ajukan, Kembalikan, Final, Batal) | menurut §23.2.6 | `decide` |

Semua rute: Zod `.strict()`, enum persis CHECK, `assertSameOriginMutation`,
`requireWebPermission`/`requireAnyWebPermission`. Web:
`validations/hr-kinerja.ts` + `services/hr-kinerja.ts`, gateway
`gateways/hris.ts`.

**Berubah tanpa command baru**: `desktop_hr_letter_setup` dan `letters/query`
(izin + `hr.performance.view`/`.finalize`).

**Layar (Web/Desktop, Q-108):**

1. Tab **Kinerja** di `/kepegawaian` (`TabKinerja.tsx`): pemilih periode
   (semester atau tahun ajaran), daftar per status (Belum dinilai, Draf,
   Diajukan, Final, Dibatalkan) dengan saringan "Perlu saya nilai" dan tanda;
   rincian dengan skor per aspek, panduan, panel rumus setiap aspek otomatis
   (angka, tanggal dan rombel yang kosong), ubah skor otomatis dengan alasan, SP
   Berlaku, nilai akhir hidup, Ajukan/Kembalikan/Final/Batal/Buat koreksi/Cetak.
2. Bagian **Template dan pengaturan** di tab yang sama (`config`): template per
   kelompok, aspek dan bobot (penjumlah 100 hidup), bawaan, ambang, predikat,
   dan rentang tanpa KBM.
3. Tab **Kinerja** di rincian pegawai (`RincianPegawai.tsx`, `view`): nilai
   berlaku per periode dan riwayat koreksi.

**Mobile**: command ikut terdaftar (salinan), tanpa layar.

### 23.6 Tidak dikerjakan di fase ini

- Penilaian diri, banyak penilai, atau 360°; Portal Guru (K-5).
- Instrumen PKG resmi (14 kompetensi, butir per indikator): template bisa
  meniru strukturnya, tetapi tanpa butir di bawah aspek.
- Riwayat jadwal mengajar (temuan 5) dan rentang tanpa KBM untuk Jam Kosong dan
  JP terdampak.
- Ketepatan waktu jurnal (`paraf_at` dibanding tanggal sesi) dan kualitas isi
  jurnal.
- JP tanpa penanganan sebagai pengurang skor; SP sebagai pengurang skor.
- Kait nilai ke gaji, KGB, perpanjangan kontrak, atau tunjangan.
- Pemetaan template per jabatan (cukup pilih template sekelompok).
- Ekspor Excel rekap kinerja; layar Mobile; Telegram (Fase 6).

### 23.7 Langkah

Tiga sub-fase; v71 penuh di 5a supaya perangkat hanya diperbarui sekali.
Setiap sub-fase berakhir dengan typecheck, Biome, dan tes per berkas hijau;
`bun run check` penuh oleh pemilik sesudah semua fase HRIS.

**5a — Skema, hak akses, template** (batas: template dan pengaturan bisa
disunting di Web/Desktop):

| # | Langkah | Gerbang |
| :-- | :-- | :-- |
| 1 | Skema v71: lima tabel khusus cloud + seed template dari JSON; seed `tgs-ka-tu` di kedua jalur; versi `db-schema.ts`, `sync.rs`, sentinel `-2047`, `REQUIRED_TABLE_COUNT` 131, `isDatabaseSchemaReady`, daftar khusus cloud `audit-sync-contract.ts` (pengetatan), `PROMOTION_PLAN`, tes skema | `audit:schema`, `audit:contract`; `cargo test` sentinel per nama; `schema-consistency.test.ts`, `database-promotion.test.ts` |
| 2 | RBAC: empat izin di `catalog.ts`, sensitif/rahasia, `NOT IN` Admin Rust, `ROLE_HRIS_BAWAAN` ↔ `DEFAULT_ROLE_PERMISSIONS`, `rbac-migration.test.ts` + 71 | `rbac-migration.test.ts`, `audit:contract` (131) |
| 3 | Aturan kembar `hr_kinerja.rs` ↔ `validations/hr-kinerja.ts`: `validasi_template`, `validasi_pengaturan_kinerja`, `skor_ambang`, `predikat`, rentang tanpa KBM | vektor `hr-kinerja.vektor.json` Rust ↔ TS; `cargo test hr_kinerja`; `hr-kinerja.test.ts` |
| 4 | Command `templates`, `template_save`, `settings_save` + rute + gateway; bagian Template dan pengaturan | `cargo test hr_kinerja` (`TursoClient::local_file`: satu bawaan per kelompok, total bobot 100, tipe dan kelompok terkunci, tipe guru di template tendik ditolak, nama kembar ditolak); `services/hr-kinerja.test.ts`; `audit:route-guard`, `audit:a11y`, `audit:dialog`, `audit:confirm`, `audit:ui-guard` |

**5b — Alur penilaian dan kehadiran otomatis** (batas: penilaian bisa dibuat,
diajukan, difinalkan, dikoreksi; aspek presensi kelas dan jurnal sementara
diisi manual dengan tanda `otomatis_manual`):

| # | Langkah | Gerbang |
| :-- | :-- | :-- |
| 5 | Aturan kembar: `periode_dari_tahun_ajaran`, `rentang_aktif`, `validasi_penilaian`, `status_kinerja`, `periksa_aksi_kinerja`, `tanda_kinerja`, `nilai_akhir`, `kinerja_berlaku`, `penilai_bawaan`; SQL penjaga `DRAF_SQL`/`DIAJUKAN_SQL`, simpan, keputusan, tumpang tindih, `KEPALA_TU_SQL` | vektor; `hr-kinerja.test.ts` teks harfiah Desktop + Mobile; `audit:sql`, `audit:list-bound` |
| 6 | `hitung_kehadiran` (klasifikasi §23.2.3 di Rust dan TS), `KINERJA_PEGAWAI_SQL`, `KINERJA_HARI_SQL`, `KINERJA_PENGAJUAN_SQL` | vektor §23.2.3; teks SQL harfiah terhadap `LAPORAN_KEHADIRAN_SQL.hari` dan `PENGAJUAN_BERLAKU_SQL` |
| 7 | Command `list`, `detail`, `save`, `decide` + rute + gateway; batch dijaga keadaan; Ajukan Desktop `syncNow()` | `cargo test hr_kinerja` (`local_file`: buat, tumpang tindih ditolak, simpan, ajukan, otomatis berubah ditolak, kembalikan, final beku, simpan sesudah Final ditolak, koreksi, diri sendiri, unit lain, pegawai keluar, `assess` tanpa `view` tidak membaca dirinya); `services/hr-kinerja.test.ts` dengan data dan angka sama |
| 8 | Tab Kinerja + tab Kinerja rincian pegawai | `tsc` + Biome; `audit:a11y`, `audit:dialog`, `audit:confirm`, `audit:ui-guard`, `audit:page-guard` |

**5c — Mengajar otomatis dan cetak** (batas: Fase 5 lengkap):

| # | Langkah | Gerbang |
| :-- | :-- | :-- |
| 9 | `hitung_mengajar` (satuan, pengecualian lewat `jp_terdampak`, terisi, berjurnal, pengganti, tanpa penanganan, tanpa KBM); `KINERJA_JADWAL_SQL`, `KINERJA_PRESENSI_SQL`, `KINERJA_JP_BERLAKU_SQL` | vektor §23.2.4 (gabungan, agama, `3-4`, sesi kembar, pengganti, izin per JP, libur, tanpa KBM, di luar semester); teks harfiah terhadap `JADWAL_JP_SQL`, `PENGAJUAN_BERLAKU_SQL` |
| 10 | Lembar Hasil Penilaian Kinerja (`lembarKinerja` + `cetak-a4.ts`), izin `desktop_hr_letter_setup` | `suratKepegawaian.test.ts` (nilai jahat, data kosong, koreksi, rumus otomatis); PDF A4 di Edge |
| 11 | `sync-rust-modules`, `sync-frontend-lib`, paragraf `CLAUDE.md` "HRIS kinerja (v71)", catatan "Sudah dibangun" | `audit:contract` (429/434 command, 131 permission, 145 rute, 81 snapshot), `audit:schema`; `cargo test hr_kinerja` Mobile |

### 23.8 Pertanyaan untuk pemilik (Fase 5)

| No | Pertanyaan | Usulan | Alasan |
| :-- | :-- | :-- | :-- |
| Q-91 | Data kinerja **khusus cloud** (lima tabel §23.3), bukan tersinkron seperti perusahaan? | Ya | Rahasia (pola Q-33, Q-73); masukan otomatis satu sumber di cloud untuk Web dan Desktop; keadaan dijaga di batch sehingga periode ganda dan tulis sesudah Final ditolak. Harga: butuh koneksi, tanpa Mobile |
| Q-92 | Template **per kelompok** (Guru/Tendik) dengan satu bawaan per kelompok; penilai boleh memilih template aktif lain sekelompok; tanpa tabel pemetaan jabatan? | Ya | Pembagian nyata di sekolah adalah guru vs tendik; tendik dengan tugas berbeda (satpam, TU) cukup memilih template saat membuat. Pemetaan per jabatan bisa ditambah kemudian |
| Q-93 | Tanam **dua template bawaan** (§23.2.1) dari JSON, bisa disunting? | Ya | Penilaian langsung bisa dipakai tanpa menyusun template dulu; aspek guru mengikuti empat kompetensi guru + supervisi akademik. Bobot wajib dicek yayasan |
| Q-94 | Periode **Semester** atau **Tahun Ajaran** dari `akademik_tahun_ajaran`, tanpa rentang bebas; satu penilaian per pegawai per periode bertumpuk, ditolak cloud? | Ya | Supervisi per semester, PKG per tahun ajaran; rentang bebas membuka penilaian bertumpuk yang sulit dibandingkan |
| Q-95 | Rumus kehadiran §23.2.3: tepat 1, telat ½, Alfa dan tanpa catatan 0; C/I/S dan S/I/D koreksi dikeluarkan; **DL = tepat**; **telat di hari berpengajuan berlaku = tepat**; ambang 950/900/800/700? | Ya | Izin dan cuti tidak boleh menurunkan nilai; DL dihitung hadir seperti laporan sekolah; izin per jam (Fase 2) membuat guru datang siang dengan sah (temuan 3) |
| Q-96 | Keterisian presensi kelas per **(rombel, tanggal, jam)** jadwal guru itu, terisi oleh presensi atas namanya; JP izin berlaku dikecualikan; JP pengganti hanya informasi? | Ya | Setiap rombel butuh presensinya sendiri; hanya satuan terjadwal yang dihitung, jadi gabungan tidak berlipat dan sesi kembar tidak menggandakan. Sengaja beda dari honor JP per (tanggal, jam) |
| Q-97 | Kelengkapan jurnal = satuan terisi yang sesinya berjurnal (setiap jurnal sudah berparaf) ÷ satuan terisi? | Ya | Paraf selalu terisi saat simpan; pembagi terisi memisahkan "tidak mengisi presensi" dari "tidak mengisi jurnal" |
| Q-98 | JP terdampak tanpa penanganan hanya **informasi**, tidak mengurangi skor? | Ya | Penanganan ditulis Kepala Sekolah/Guru Piket, bukan guru yang izin; JP yang ditinggalkan tanpa izin sudah tertangkap oleh keterisian |
| Q-99 | Rentang **tanpa KBM terjadwal** (PTS, PAS, class meeting) diatur di pengaturan kinerja `hr_kinerja_tanpa_kbm`, bukan lewat Hari Libur dan bukan ditebak otomatis? | Ya | Hari Libur mematikan Alfa siswa saat ujian (temuan 6); menebak "rombel tanpa presensi seharian = tidak ada KBM" menyembunyikan guru kelas SD yang tidak mengisi seharian |
| Q-100 | Skor aspek otomatis **boleh diubah penilai** dengan alasan wajib dan tanda `otomatis_diubah` (perusahaan menguncinya)? | Ya | Jadwal tanpa riwayat (temuan 5) dan kegiatan non-KBM yang belum dicatat bisa membuat angka salah; perubahan tetap terlihat oleh pemutus dan tercetak di lembar hasil |
| Q-101 | Nilai akhir ×100 = Σ bobot × 25 × (skor − 1) tanpa pembulatan; predikat bawaan **Amat Baik ≥ 91, Baik ≥ 76, Cukup ≥ 61, Sedang ≥ 51, Kurang**, beku saat Final? | Ya | Rentang PKG/PermenPAN-RB 16/2009 dikenal sekolah; bilangan bulat ×100 tanpa float; pengaturan yang berubah tidak menyentuh penilaian final |
| Q-102 | Alur Draf → Ajukan (`assess`) → Kembalikan/Final (`finalize`), Batal, koreksi berjejak oleh `finalize`; Ajukan **terbuka sejak periode dimulai** dengan "dihitung sampai" beku dan tanda `periode_belum_selesai`? | Ya | Sekolah menilai sebelum rapor, sebelum `tanggal_selesai` semester; tanggalnya terlihat di rincian dan cetak |
| Q-103 | Penilai bawaan: `id_atasan` bila terisi; selain itu guru → kepala unit (`tgs-kepsek`), tendik → pemegang tugas baru **`tgs-ka-tu`** di unitnya; hanya untuk "Perlu saya nilai" dan tanda, tidak membatasi? | Ya | Kepala TU belum punya penanda di data (temuan 8); satu baris seed tugas memberinya penanda tanpa kolom baru. Wakasek yang menyupervisi atas nama kepala sekolah tetap bisa menilai, dengan tanda |
| Q-104 | **Empat izin** §23.4: `view` dan `assess` rahasia; `finalize` dan `config` sensitif; Admin tanpa satu pun; Kepala Sekolah `view` + `assess`, Kepala TU `assess`, Kepegawaian `view` + `config`, Yayasan keempatnya? | Ya | Pemutus akhir Yayasan (negeri: Kepala Sekolah lewat Role & Akses, Q-15); `config` menentukan nilai semua penilaian terbuka, jadi tidak ikut Admin |
| Q-105 | Aksi dibatasi **cakupan unit** dan "bukan diri sendiri" dari sesi; membaca tanpa saringan unit, penilaian atas diri sendiri baru terbaca sesudah Final lewat `view`? | Ya | Sama dengan SP (§22.4) dan A-5; Kepegawaian yayasan perlu melihat semua unit tanpa `hr.scope.all` |
| Q-106 | PNS/PPPK boleh dinilai secara internal tetapi tidak masuk "Belum dinilai" (tanda `asn`); pegawai keluar tidak bisa dinilai baru, draf tetap bisa diselesaikan? | Ya | Penilaian resmi ASN di luar cakupan (§18); keluar mengikuti Q-80 perusahaan |
| Q-107 | Cetak **Lembar Hasil Penilaian Kinerja** hanya untuk Final, tanpa nomor, dengan rumus otomatis dan tiga tanda tangan (penilai, pegawai, mengetahui)? | Ya | Berkas PKG yang ditandatangani dibutuhkan untuk akreditasi dan berkas pegawai; draf yang tercetak mudah dikira hasil akhir |
| Q-108 | Layar **Web/Desktop saja**? | Ya | Q-35, Q-88; data khusus cloud dan cetak tidak ada di Mobile |
| Q-109 | SP Berlaku hanya informasi di rincian? | Ya | Q-77 perusahaan; SP sudah punya akibatnya sendiri (eskalasi) |
| Q-110 | Tiga sub-fase **5a** (skema v71 penuh + RBAC + template), **5b** (alur + kehadiran), **5c** (mengajar + cetak), satu sesi per sub-fase? | Ya | Skema dan izin sekali di 5a supaya perangkat diperbarui sekali; 5b sudah berguna untuk tendik |
| Q-111 | Tanpa Telegram dan tanpa kait ke gaji/KGB/kontrak di fase ini? | Ya | Telegram di Fase 6 bersama bidang `kepegawaian`; kait ke uang butuh kebijakan yayasan yang belum ada |

### 23.9 Penanda yang ditinjau pemilik

**Yang dirasakan pengguna:**

- Tab **Kinerja** di Kepegawaian dan di rincian pegawai (Web/Desktop, butuh
  koneksi); tombol cetak lembar hasil untuk penilaian Final.
- Tiga aspek otomatis untuk guru (kehadiran, presensi kelas, jurnal) dan satu
  untuk tendik, dengan rumus dan angka yang terlihat penilai.
- Kepala TU perlu dicatat sebagai tugas tambahan "Kepala Tata Usaha" (atau
  diisi sebagai atasan langsung tendik) supaya daftar "Perlu saya nilai"-nya
  terisi.
- Sekolah perlu mengisi rentang tanpa KBM setiap semester; tanpa itu minggu
  ujian menurunkan keterisian presensi semua guru.

**Risiko data dan keputusan:**

- Bobot template bawaan, ambang, predikat, dan rumus wajib dicek ulang yayasan.
- Jadwal yang diubah di tengah semester mengubah JP terjadwal tanggal lampau
  (temuan 5); angkanya dibekukan saat Ajukan dan bisa diubah penilai dengan
  alasan.
- Shift guru yang salah (misalnya enam hari untuk guru honorer dua hari)
  membuat hari tanpa catatan dihitung 0, sama dengan yang sudah terjadi di
  Generate Alfa dan laporan.
- Presensi kelas yang diisi atas nama guru lain (guru tidak punya akun dan
  operator salah pilih) terbaca "tidak terisi" bagi guru terjadwal.
- Admin bawaan tidak bisa membuka penilaian maupun template; Superadmin memberi
  izin lewat Role & Akses.

**Perangkat:**

- **v71 menghentikan sinkron perangkat v70 sampai diperbarui.** Perbarui semua
  Desktop dan Mobile sebelum 5a dipasang di cloud.
- Penilaian dan template butuh koneksi (`PESAN_LURING`). Presensi, jurnal, dan
  absensi di outbox Desktop baru terhitung sesudah terdorong; Ajukan di Desktop
  menyinkronkan dulu.

### 23.10 Jawaban Fase 5 (18 Nov 2026)

- **Q-91 sampai Q-111**: semuanya sesuai usulan §23.8, dan penanda §23.9
  disetujui. Artinya:
  - **Model data**: lima tabel khusus cloud (template per kelompok Guru/Tendik,
    aspek, penilaian, nilai, keputusan dengan `urut`), keadaan dijaga di batch
    cloud tanpa sidik, tanpa pemetaan jabatan; dua template bawaan dari JSON.
  - **Periode**: Semester atau Tahun Ajaran; penilaian bertumpuk ditolak.
  - **Kehadiran**: dari kolom `LAPORAN_KEHADIRAN_SQL.hari`; DL dan telat di
    hari berpengajuan berlaku dihitung tepat.
  - **Mengajar**: presensi kelas per (rombel, tanggal, jam) jadwal guru,
    jurnal ÷ terisi; JP tanpa penanganan hanya informasi; rentang tanpa KBM di
    `hr_kinerja_tanpa_kbm`.
  - **Skor**: otomatis boleh diubah dengan alasan; predikat bawaan Amat
    Baik/Baik/Cukup/Sedang/Kurang (91/76/61/51).
  - **Alur**: Ajukan sejak periode dimulai.
  - **Penilai**: bawaan `id_atasan` → kepala unit (guru) / `tgs-ka-tu` (tendik).
  - **Izin**: empat izin; Admin tanpa paket.
  - **Cakupan**: aksi dibatasi unit dari sesi, membaca tanpa saringan unit.
  - **Batas pegawai**: PNS/PPPK di luar "Belum dinilai"; pegawai keluar tidak
    bisa dinilai baru.
  - **Cetak dan layar**: cetak hanya Final; layar Web/Desktop saja.
  - **Lain-lain**: SP hanya informasi; sub-fase 5a/5b/5c; tanpa Telegram dan
    tanpa kait gaji.
- Bobot template bawaan, ambang, predikat, dan rumus tetap dicek ulang yayasan.
- Eksekusi per sub-fase §23.7 di sesi terpisah, mulai 5a.

### 23.11 Sudah dibangun: sub-fase 5a (18 Nov 2026)

Langkah 1–4 §23.7 dibangun: skema v71 penuh (termasuk tabel penilaian yang
baru dipakai 5b), empat izin, aturan template dan pengaturan, tiga command,
dan bagian Template dan pengaturan di tab Kinerja. Batas 5a tercapai: template
dan pengaturan bisa disunting di Web/Desktop.

- **Skema v71, sentinel `-2047` `hris-kinerja-v1`**: lima tabel khusus cloud
  di `turso.rs` dan blok v71 `db-migrations.ts` (DDL identik §23.3, tujuh
  indeks); `ensure_hris_kinerja_v71` ↔ `seedKinerja` menanam dua template
  bawaan (`ktp-guru` 8 aspek, `ktp-tendik` 6 aspek) dari
  `validations/hr-kinerja-template-bawaan.json` dan `tgs-ka-tu` ke
  `hr_tugas_jenis`, `INSERT OR IGNORE` di setiap provisioning (pola v70).
  `CURRENT_SCHEMA_VERSION`/`CLIENT_SCHEMA_VERSION` 71,
  `REQUIRED_TABLE_COUNT` 131 + daftar `isDatabaseSchemaReady` dan
  `schema-consistency.test.ts`, `PROMOTION_PLAN` lapisan 7, daftar sentinel
  tes `turso.rs` + `-2047`, versi tes RBAC + 71. Tanpa perubahan
  `storage.rs`, snapshot, atau rute sync.
- **RBAC**: `hr.performance.view`/`.assess` di `CONFIDENTIAL_PERMISSIONS`,
  `.finalize`/`.config` di `SENSITIVE_MUTATION_PERMISSIONS`, keempatnya di
  `ADMIN_DEFAULT_EXCLUDED_PERMISSIONS` dan seed `app_permission` (urutan
  1424–1427). Paket `DEFAULT_ROLE_PERMISSIONS` ↔ `ROLE_HRIS_BAWAAN`: Yayasan
  keempatnya, Kepala Sekolah `view` + `assess`, Kepala TU `assess`,
  Kepegawaian `view` + `config`.
- **Aturan kembar** `desktop/hr_kinerja.rs` ↔ `validations/hr-kinerja.ts`:
  `validasi_template` (nama, kelompok, keterangan, bawaan aktif, 1–20 aspek
  aktif dari maks 100, nama aspek unik tanpa beda huruf, tipe dikenal, aspek
  presensi/jurnal hanya Guru, bobot bulat 1–100, satu aspek per tipe
  otomatis, total aktif 100), `periksa_template_lama` (kelompok, tipe, dan
  keberadaan aspek lama terkunci), `validasi_ambang`, `validasi_predikat`,
  `validasi_tanpa_kbm` (bentuk kanonik), `parse_*` (rusak = bawaan),
  `validasi_pengaturan_kinerja`, `pengaturan_kinerja`, `skor_ambang`,
  `predikat_nilai`. Vektor `hr-kinerja.vektor.json`; teks SQL, pesan, kunci,
  dan tipe dibandingkan harfiah oleh `hr-kinerja.test.ts` (Desktop + salinan
  Mobile).
- **Command** (terdaftar di kedua `lib.rs`, `build.rs`,
  `capabilities/default.json`, `permissions/autogenerated`) ↔ rute `POST
  /api/kepegawaian/performance/…` (Zod `.strict()`):
  `desktop_hr_performance_templates` (salah satu dari empat izin, `templates`),
  `desktop_hr_performance_template_save` (`config`, `template-save`, satu
  batch cloud: template, `LEPAS_BAWAAN_SQL` bila bawaan, semua aspek),
  `desktop_hr_performance_settings_save` (`config`, `settings`, tiga kunci
  lewat `hris::tulis_setting` lokal + outbox; Web satu batch). Gateway
  `muatTemplateKinerja`, `simpanTemplateKinerja`, `simpanPengaturanKinerja`
  di `gateways/hris.ts`.
- **Layar** `components/kepegawaian/TabKinerja.tsx`, tab **Kinerja** di
  `/kepegawaian` untuk pemegang salah satu izin kinerja: kartu template per
  kelompok, modal tambah/ubah (kelompok dan tipe aspek tersimpan terkunci,
  aspek tersimpan hanya bisa dinonaktifkan, penjumlah bobot hidup), dan
  Pengaturan kinerja (ambang dalam persen satu desimal, predikat dalam nilai
  dua desimal, rentang tanpa KBM bertanggal). Tanpa `config` semuanya hanya
  terbaca.

Angka (dihitung ulang dari kode; `audit:contract` sebagai acuan):

| | Sebelum | Sesudah |
| :-- | :-- | :-- |
| Skema / sentinel | v70 / `-2046` | v71 / `-2047` |
| `REQUIRED_TABLE_COUNT` | 126 | 131 |
| Tabel snapshot / rute kanonik | 81 / 145 | 81 / 145 |
| Permission | 127 | 131 |
| Command Desktop / Mobile | 422 / 427 | 425 / 430 |
| Rute Web (`src/app/api/**/route.ts`) | 312 | 315 |

Gerbang (oleh Claude, per berkas/per nama; `bun run check` dan suite Rust penuh
belum, sesuai keputusan pemilik):

| # | Gerbang | Hasil |
| :-- | :-- | :-- |
| 1 | `audit:schema`, `audit:contract`; `cargo test desktop::turso::tests` (69 tes); `schema-consistency.test.ts`, `database-promotion.test.ts` | Lulus. `sentinel_2043_memicu_organisasi_v68` disesuaikan: jenis tugas 10 → 11 karena seed v71 |
| 2 | `rbac-migration.test.ts`, `audit:contract` (131) | Lulus, kedua workspace |
| 3 | Vektor (template 22, template lama 6, ambang 13, predikat 15, tanpa KBM 14, pengaturan 4, berlaku 3, skor 11, predikat terpilih 10) di `hr_kinerja::tests` dan `hr-kinerja.test.ts` | Lulus Rust dan TS (Desktop + salinan Mobile) |
| 4 | `hr_kinerja_template_cloud` (`TursoClient::local_file`: seed sekali walau provisioning diulang, satu bawaan per kelompok dan bawaan seed tidak kembali, kelompok/tipe terkunci, aspek tidak dihapus, nama kembar, template tak dikenal); `services/hr-kinerja.test.ts` dengan data dan pesan sama di database Web sungguhan (plus pengaturan rusak tidak menulis apa pun); `audit:route-guard`, `audit:a11y`, `audit:dialog`, `audit:confirm`, `audit:ui-guard`, `audit:page-guard`, `audit:sql`, `audit:list-bound`; `tsc` kedua workspace; Biome berkas yang diubah | Lulus: Desktop dan Mobile `hr_kinerja` 5 tes, TS 3 tes di kedua workspace; crate tanpa warning kode |

Keputusan yang diambil di tengah jalan:

- **Pengaturan dibaca dari perangkat di Desktop**: `desktop_hr_performance_templates`
  membaca template dari cloud tetapi `hr_kinerja_*` dari SQLite perangkat,
  supaya nilai yang baru disimpan langsung terlihat sebelum outbox terdorong.
  Perhitungan otomatis 5b membaca cloud; Ajukan di Desktop menyinkronkan dulu
  (§23.2.6).
- **`skor_ambang` dan `predikat_nilai` Rust `#[cfg(test)]`** sampai alur 5b
  memanggilnya, supaya crate tanpa warning `dead_code`; TS sudah mengekspor
  keduanya.
- **Layar memeriksa template dengan `validasiTemplate`** sebelum mengirim,
  sehingga pesannya sama di Web dan Desktop (Web menolak `bobot` non-angka di
  Zod sebelum sampai ke aturan).
- **Angka layar ke bilangan bulat tanpa float**: ambang persen satu desimal
  → permil (95,5 → 955), nilai predikat dua desimal → ×100 (91,25 → 9125),
  lewat pemotongan teks.
- **Rentang tanpa KBM** sudah bisa disimpan, tetapi baru dipakai hitungan
  presensi kelas di 5c.

Penyimpangan dari §23 untuk ditinjau:

- **`tgs-ka-tu` ditanam setiap provisioning** (`INSERT OR IGNORE`, pola seed
  v70), bukan sekali per database. Jenis tugas tidak pernah dihapus
  (dinonaktifkan), jadi hasilnya sama; sekolah yang sudah membuat jenis
  "Kepala Tata Usaha" sendiri dengan id lain akan melihat dua jenis bernama
  sama.
- **Template bawaan** juga ditanam setiap provisioning. Yang sudah disunting
  tidak ditimpa, bawaan yang dilepas tidak kembali (diuji), dan aspek seed
  yang dinonaktifkan tetap nonaktif, karena id-nya terkunci dan barisnya
  tidak pernah dihapus.

Belum diuji di browser/perangkat: tab Kinerja (kartu template, modal
tambah/ubah dengan aspek baru dan nonaktif, penjumlah bobot, pesan galat),
Pengaturan kinerja (ambang, predikat, rentang tanpa KBM) di Web dan WebView2
Desktop, sinkron pengaturan ke perangkat lain, pesan luring tanpa koneksi, dan
role Kepala TU/Kepegawaian dengan izin bawaannya. **Berikutnya: 5b** (alur
penilaian dan kehadiran otomatis, langkah 5–8) di sesi baru.

### 23.12 Sudah dibangun: sub-fase 5b (18 Nov 2026)

Langkah 5–8 §23.7 dibangun di v71 yang sama (tanpa versi skema, izin, tabel,
kolom, atau rute sync baru). Batas 5b tercapai: penilaian bisa dibuat,
diajukan, dikembalikan, difinalkan, dibatalkan, dan dikoreksi di Web/Desktop;
aspek presensi kelas dan jurnal sementara diisi manual dengan tanda
`otomatis_manual`.

- **Aturan kembar** `desktop/hr_kinerja.rs` ↔ `validations/hr-kinerja.ts`
  (vektor `hr-kinerja.vektor.json`): `periode_dari_tahun_ajaran` (Semester =
  satu baris, Tahun Ajaran = MIN..MAX baris ber-`nama_tahun` sama, nama
  periode disalin), `rentang_aktif`, `periksa_buat`, `validasi_penilaian`
  (aksi Buat/Simpan/Muat ulang/Koreksi, skor bulat 1–5, catatan, alasan
  koreksi), `susun_nilai` + `isian_tersimpan` + `muat_ulang_template`,
  `status_kinerja` (dari `urut`), `periksa_aksi_kinerja`, `boleh_baca_kinerja`,
  `tanda_kinerja`, `nilai_akhir`, `kinerja_berlaku`, `penilai_bawaan`, dan
  `hitung_kehadiran` (tabel §23.2.3 lengkap, termasuk DL = tepat dan telat di
  hari berpengajuan berlaku = tepat). `skor_ambang` dan `predikat_nilai` Rust
  tidak lagi `#[cfg(test)]`.
- **SQL kembar** (teks harfiah diperiksa `hr-kinerja.test.ts` Desktop +
  salinan Mobile, dan `hr_kinerja_sql_salinan` di Rust): penjaga `TERBUKA_SQL`,
  `DRAF_SQL`, `DIAJUKAN_SQL` (salinannya ada di setiap statement tulis);
  `BUAT_PENILAIAN_SQL` (tumpang tindih akar hidup ditolak di statement yang
  sama), `KOREKSI_PENILAIAN_SQL` (akar Final, tanpa koreksi terbuka),
  `UBAH_PENILAIAN_SQL`, `SAMPAI_PENILAIAN_SQL`, `HAPUS_NILAI_SQL`,
  `SIMPAN_NILAI_SQL`, tiga `KEPUTUSAN_*_SQL` dengan `urut` = MAX + 1;
  `KEPALA_TU_SQL` (= `KEPALA_UNIT_SQL` dengan `'tgs-ka-tu'`, diuji
  `replace`), `KINERJA_PEGAWAI_SQL`, `KINERJA_HARI_SQL` (kolom
  `LAPORAN_KEHADIRAN_SQL.hari` tanpa spasi identik, diuji di
  `services/hr-kinerja.test.ts`), `KINERJA_PENGAJUAN_SQL` (memuat
  `PENGAJUAN_BERLAKU_SQL` harfiah), `KINERJA_MENUNGGU_SQL`, `KINERJA_SP_SQL`,
  `LIBUR_SQL`/`WHITELIST_SQL` apa adanya.
- **Command** (kedua `lib.rs`, `build.rs`, `capabilities/default.json`,
  `permissions/autogenerated`) ↔ rute `POST /api/kepegawaian/performance/…`
  (Zod `.strict()`, enum persis CHECK, `assertSameOriginMutation`,
  `requireAnyWebPermission`): `desktop_hr_performance_list` (`query`; periode
  atau `id_karyawan`), `_detail` (`detail`), `_save` (`save`), `_decide`
  (`decide`). Gerbang command: baca = view/assess/finalize, tulis =
  assess/finalize; izin per aksi, cakupan unit (`dalam_cakupan` +
  `UNIT_PERSONIL_SQL`), dan diri sendiri dinilai `periksa_aksi_kinerja` dari
  sesi. Setiap batch dibaca ulang (penilaian ada, keputusan ada, atau status
  masih Draf); kalau penjaganya menolak, pesannya `PESAN_KEADAAN_BERUBAH` atau
  pesan tumpang tindih. Gateway `muatDaftarKinerja`, `muatRiwayatKinerja`,
  `muatRincianKinerja`, `simpanPenilaianKinerja`, `putuskanPenilaianKinerja`.
- **Layar** `components/kepegawaian/PenilaianKinerja.tsx` (bagian Penilaian di
  atas template pada tab Kinerja; tab Kinerja di `RincianPegawai` untuk
  `hr.performance.view`): pemilih Semester/Tahun Ajaran dari
  `akademik_tahun_ajaran`, saringan status termasuk "Belum dinilai" dan "Hanya
  yang perlu saya nilai", tombol Mulai menilai; rincian berisi skor per aspek
  dengan panduan, panel rumus kehadiran (angka, persen, ambang, tanggal tanpa
  catatan/alfa/telat; sesudah Ajukan dibaca dari `rincian` beku), pilihan
  "Ikuti hitungan (n)" atau skor lain dengan catatan, nilai akhir hidup, Muat
  ulang template, Ajukan/Kembalikan/Final/Batal/Buat koreksi, SP berlaku, dan
  riwayat koreksi dengan penanda Berlaku.

Angka (`audit:contract` sebagai acuan):

| | Sebelum | Sesudah |
| :-- | :-- | :-- |
| Skema / sentinel | v71 / `-2047` | v71 / `-2047` |
| `REQUIRED_TABLE_COUNT` | 131 | 131 |
| Tabel snapshot / rute kanonik | 81 / 145 | 81 / 145 |
| Permission | 131 | 131 |
| Command Desktop / Mobile | 425 / 430 | 429 / 434 |
| Rute Web (`src/app/api/**/route.ts`) | 315 | 319 |

Gerbang (oleh Claude, per berkas/per nama; `bun run check` dan suite Rust penuh
belum, sesuai keputusan pemilik):

| # | Gerbang | Hasil |
| :-- | :-- | :-- |
| 5 | Vektor periode 6, rentang aktif 6, buat 5, validasi 20, susun nilai 8, isian tersimpan 1, muat ulang 1, status 8, aksi 30, baca 5, tanda 8, nilai akhir 5, berlaku 4, penilai bawaan 5; teks SQL harfiah Desktop + Mobile; `audit:sql`, `audit:list-bound` | Lulus Rust dan TS |
| 6 | Vektor kehadiran 16 (§23.2.3: 900 → 4, 976 → 5, kosong → 1, cuti dikecualikan, telat berizin, DL tanpa scan, multi-sesi, libur ber-whitelist, Koreksi Admin S/I/D, D = 0, dihitung sampai hari ini, DL menang atas Cuti, akhir pekan); `KINERJA_HARI_SQL` ↔ `LAPORAN_KEHADIRAN_SQL.hari`, `PENGAJUAN_BERLAKU_SQL` | Lulus Rust dan TS |
| 7 | `hr_kinerja_penilaian_cloud` (`TursoClient::local_file`) ↔ `services/hr-kinerja.test.ts` (database Web sungguhan) dengan data dan angka sama: buat (kehadiran `K|9|6|1|1|1|0|722|…` → skor 2), tumpang tindih Tahun Ajaran ditolak, simpan (aspek tanpa hitungan wajib bercatatan), otomatis berubah ditolak lalu `833` → 3, kembalikan (izin dan alasan), simpan saat Diajukan ditolak, final beku 7250 Cukup `urut` 4 dan tanda `otomatis_berubah` sesudah absensi dikoreksi, simpan sesudah Final ditolak, koreksi (izin, alasan, satu koreksi terbuka, `888` → 3, berlaku = koreksi), diri sendiri, `assess` tanpa `view` tidak membaca penilaian dirinya, unit lain, pegawai keluar, batal, daftar per periode dan "belum dinilai" | Lulus: Desktop `hr_kinerja` 9 tes, Mobile `hr_kinerja` 9 tes; TS validations 12 + services 5 (Desktop), 17 (salinan Mobile) |
| 8 | `tsc` kedua workspace; Biome berkas yang diubah; `audit:contract`, `audit:schema`, `audit:route-guard`, `audit:page-guard`, `audit:ui-guard`, `audit:a11y`, `audit:dialog`, `audit:confirm` | Lulus; crate tanpa warning kode (hanya LNK4099 libsodium bawaan) |

Keputusan yang diambil di tengah jalan:

- **Skor otomatis "mengikuti hitungan"**: baris yang `skor` = `skor_hitung`
  dianggap belum diubah (`isian_tersimpan`), jadi Ajukan, Muat ulang, dan
  Koreksi memakai hitungan terbaru; layar mengirim skor kosong untuk pilihan
  "Ikuti hitungan". Tanpa ini, absensi yang bertambah sesudah draf disimpan
  akan menolak Simpan karena skor lama terbaca "diubah tanpa catatan".
- **Aspek otomatis tanpa hitungan** (presensi kelas/jurnal di 5b, atau D = 0)
  memakai aturan yang sama: skor boleh diisi asal bercatatan.
- **Ajukan di layar** menyimpan draf, lalu (Desktop) `syncNow()`, lalu
  mengirim `rincian` yang tampil di layar. Bila sinkron atau data lain
  mengubah angka, backend menolak dengan `PESAN_OTOMATIS_BERUBAH` dan layar
  memuat ulang rincian supaya angka baru terlihat sebelum diajukan lagi.
- **Daftar per periode** menyaring penilaian dengan `periode_jenis` +
  `periode_kunci` persis; "Belum dinilai" memakai tumpang tindih
  (`AKAR_RENTANG_SQL`), jadi pegawai yang sudah dinilai per tahun ajaran tidak
  muncul sebagai belum dinilai di daftar semester. Pegawai sesi sendiri tidak
  pernah tampil di "Belum dinilai".
- **`KINERJA_MENUNGGU_SQL`** (pengajuan tanpa keputusan atas sidik kini dan
  tidak batal) ditambahkan untuk tanda `pengajuan_menunggu`; tidak tercantum
  di daftar SQL §23.2.3.
- **Status kepegawaian salinan** diambil dari `STATUS_KINI_SQL` pada hari
  pembuatan; tanda `asn` di daftar dan rincian memakai salinan itu.
- **Fragmen penjaga Rust** (`TERBUKA_SQL`, `DRAF_SQL`, `DIAJUKAN_SQL`)
  `#[cfg(test)]`: statement memuat salinan harfiahnya dan tes Rust + TS
  memastikan salinannya sama.

Penyimpangan dari §23 untuk ditinjau:

- **Pemutus boleh mengisi koreksi**: Simpan, Muat ulang, dan Ajukan pada
  penilaian koreksi boleh oleh `finalize` selain `assess` (pola §21.7
  perusahaan); tabel aksi §23.2.6 hanya menyebut `assess`. Tanpa ini Yayasan
  yang membuat koreksi tidak bisa menyelesaikannya.
- **Penilai bawaan melewati diri pegawai itu sendiri**: kepala sekolah yang
  juga guru di unitnya tidak menjadi penilai bawaan dirinya; urutan lanjut ke
  calon berikutnya atau "belum ada penilai bawaan". Tanda
  `bukan_penilai_bawaan` hanya muncul bila penilai bawaan ada.

Belum diuji di browser/perangkat: bagian Penilaian di tab Kinerja (pemilih
periode, saringan, Mulai menilai), modal rincian (skor, catatan, nilai akhir
hidup, panel kehadiran Draf dan beku, Muat ulang template, setiap tombol aksi
beserta konfirmasi `data-konfirmasi`, pesan otomatis berubah lalu muat ulang),
tab Kinerja di rincian pegawai, `syncNow()` sebelum Ajukan di WebView2
Desktop, pesan luring tanpa koneksi, dan role Kepala Sekolah/Kepala
TU/Yayasan dengan izin bawaannya. **Berikutnya: 5c** (presensi kelas dan
jurnal otomatis, Lembar Hasil Penilaian Kinerja, paragraf `CLAUDE.md`,
langkah 9–11) di sesi baru.

### 23.13 Sudah dibangun: sub-fase 5c (18 Nov 2026)

Langkah 9–11 §23.7 dibangun di v71 yang sama, tanpa versi skema, izin, tabel,
kolom, rute sync, atau command baru. Batas 5c tercapai, jadi **Fase 5
lengkap**: ketiga aspek otomatis guru terhitung, dan penilaian Final bisa
dicetak sebagai Lembar Hasil Penilaian Kinerja.

- **Aturan kembar** `hitung_mengajar` ↔ `hitungMengajar` (§23.2.4, vektor
  `mengajar` di `hr-kinerja.vektor.json`). Satuan (rombel, tanggal, jam) dari
  jadwal guru itu, dengan `ta_memuat` (kini `pub`/diekspor dari
  `hr_pengajuan`), `jam_ke_range`, dan `hari_iso`. Libur dan rentang
  `hr_kinerja_tanpa_kbm` dilewati, satuan kembar dihitung sekali. Satuan dari
  baris jadwal yang ada di `jp_terdampak` pengajuan berlaku dikecualikan utuh.
  Terisi = presensi atas nama guru di rombel dan tanggal yang sama yang
  `jam_ke`-nya memuat jam itu; berjurnal = salah satu sesi penutupnya
  berjurnal. Pengganti dan tanpa penanganan hanya informasi. Aritmetika permil
  bilangan bulat; `rincian` `PK|satuan|dikecualikan|terisi|pengganti|tanpa_penanganan|P|a5,a4,a3,a2|sampai`
  dan `J|terisi|berjurnal|P|a5,a4,a3,a2|sampai`. Daftar satuan belum terisi
  dan tanpa jurnal (tanggal, jam, rombel) ikut dikirim untuk layar.
- **SQL kembar** (teks harfiah diperiksa `hr-kinerja.test.ts` Desktop + salinan
  Mobile): `KINERJA_JADWAL_SQL` (= `JADWAL_JP_SQL` + `AND j.id_guru = ?3`,
  diuji `replace` di Rust dan TS) dan `KINERJA_PRESENSI_SQL` (presensi guru
  dalam rentang, `berjurnal` lewat `EXISTS`, urutan `CAST(jam_ke AS
  INTEGER)`). `PENANGANAN_SQL` dipakai apa adanya lalu disaring ke pengajuan
  berlaku guru itu.
- **I/O**: `hitung_otomatis` ↔ `hitungOtomatis` kini mengembalikan kehadiran
  dan mengajar; `peta_otomatis` ↔ `petaOtomatis` mengisi `TIPE_PRESENSI` dan
  `TIPE_JURNAL`, sehingga `susun_nilai`, Ajukan (perbandingan `rincian`), dan
  `otomatis_berubah` berlaku untuk ketiganya tanpa kode baru. Rincian membawa
  `mengajar`. `barisJadwalJp`/`barisPengajuanJp` diekspor dari
  `services/hr-pengajuan.ts` dan dipakai ulang.
- **Layar** (`PenilaianKinerja.tsx`): satu `PanelOtomatis` untuk ketiga aspek
  (kalimat rumus dari `kalimatRincian`, "dihitung sampai", dan pada Draf
  tanggal/rombel yang menurunkan nilai, paling banyak 30 per daftar). Tombol
  **Cetak lembar hasil** hanya pada penilaian Final; tombol itu menutup modal
  rincian dulu, lalu memuat bahan cetak dan membuka dialog cetak.
- **Cetak** `lembarKinerja` di `suratKepegawaian.ts` dengan kerangka
  `cetak-a4.ts`: kop unit, identitas tanpa data pribadi (nama, NIP, NUPTK
  untuk guru, jabatan, unit, status kini, kelompok), periode dan masa aktif
  bila tidak penuh, template, tabel aspek (bobot, skor, nilai 0–100, catatan,
  "Hitungan n, diubah penilai"), nilai akhir dan predikat beku, rumus setiap
  aspek otomatis dari `rincian` beku beserta "dihitung sampai", catatan
  penilai, kotak KOREKSI dengan alasannya, dan tiga tanda tangan (penilai beku,
  pegawai, "Mengetahui" = kepala unit pada tanggal Final; ketua yayasan bila
  penilainya kepala unit itu). `uraiRincian`, `kalimatRincian`, dan
  `persenPermil` di `validations/hr-kinerja.ts` dipakai layar dan cetak.
- **Izin bahan cetak**: `desktop_hr_letter_setup` dan rute `letters/query`
  ditambah `hr.performance.view` dan `hr.performance.finalize` (pola §22.13).
- **Dokumentasi**: paragraf `CLAUDE.md` "HRIS kinerja (schema v71)".

Angka (`audit:contract` sebagai acuan):

| | Sebelum | Sesudah |
| :-- | :-- | :-- |
| Skema / sentinel | v71 / `-2047` | v71 / `-2047` |
| `REQUIRED_TABLE_COUNT` | 131 | 131 |
| Tabel snapshot / rute kanonik | 81 / 145 | 81 / 145 |
| Permission | 131 | 131 |
| Command Desktop / Mobile | 429 / 434 | 429 / 434 |
| Rute Web (`src/app/api/**/route.ts`) | 319 | 319 |

Gerbang (oleh Claude, per berkas/per nama; `bun run check` dan suite Rust penuh
belum, sesuai keputusan pemilik):

| # | Gerbang | Hasil |
| :-- | :-- | :-- |
| 9 | Vektor `mengajar` 12 kasus Rust ↔ TS: gabungan 833 → 3 dan jurnal 900 → 4, izin per JP 1000 → 5 (tanpa penanganan 2), JP izin yang sudah ditangani, sesi kembar, agama (guru lain di rombel dan jam sama), pengganti, tanpa KBM, di luar semester (presensinya terbaca pengganti), dihitung sampai hari ini, `3-4` menutup jadwal 3 dan 4, gabungan tiga rombel dua sesi, D = 0. Teks harfiah `KINERJA_JADWAL_SQL` ↔ `JADWAL_JP_SQL`, `KINERJA_PENGAJUAN_SQL` ↔ `PENGAJUAN_BERLAKU_SQL` | Lulus Rust dan TS |
| 9 | `hr_kinerja_penilaian_cloud` ↔ `services/hr-kinerja.test.ts`, data dan angka sama: jadwal G1 (Senin `1-2` dan Selasa 1 di 7A, Kamis 2 dan Jumat 3 di 7B), presensi, jurnal (dua jurnal satu sesi, sesi kembar, satu JP pengganti), penanganan. Hasil `PK|9|2|6|1|1|857|…` → 3 dan `J|6|5|833|…` → 3 terbekukan saat Buat, tanda `otomatis_manual` hilang, skor presensi yang diubah tanpa catatan ditolak, Ajukan membandingkan `rincian` ketiganya, final 6750 Cukup | Lulus: Desktop `hr_kinerja` 10 tes; TS validations 13 + services 5 (Desktop), 18 (salinan Mobile) |
| 10 | `suratKepegawaian.test.ts`: tanggal Final UTC → WIB, hanya Final, rumus ketiga aspek dan "dihitung sampai", "Mengetahui" ketua yayasan/kepala unit, koreksi dan masa aktif, D = 0 dan data kosong, nilai jahat di-escape | Lulus, 23 tes |
| 11 | `sync-rust-modules`, `sync-frontend-lib`; `cargo test hr_kinerja` Mobile; `tsc` kedua workspace; Biome berkas yang diubah; `audit:contract` (429/434, 131, 145, 81), `audit:schema`, `audit:sql`, `audit:list-bound`, `audit:route-guard`, `audit:page-guard`, `audit:ui-guard`, `audit:a11y`, `audit:dialog`, `audit:confirm` | Lulus; crate tanpa warning kode (hanya LNK4099 libsodium bawaan) |

Keputusan yang diambil di tengah jalan:

- **Mengajar dihitung untuk setiap pegawai**, termasuk tendik: tanpa jadwal
  hasilnya D = 0, dan hanya dipakai bila template memuat aspek presensi atau
  jurnal (template tendik menolak aspek itu sejak 5a). Tanpa cabang khusus
  kelompok di kedua bahasa.
- **Tanpa penanganan dihitung per satuan (jam)**, sama dengan dikecualikan,
  sehingga tanpa penanganan ≤ dikecualikan. Jam Kosong Fase 2 tetap per baris
  jadwal.
- **JP pengganti** = jam presensi atas nama guru yang tidak ada di jadwalnya
  pada hari itu (termasuk tanggal di luar semester jadwal), dihitung sekali per
  (rombel, tanggal, jam) dalam rentang dihitung.
- **Tanggal lembar** = tanggal WIB dari `created_at` keputusan Final (tersimpan
  UTC `datetime('now')`, ditambah 7 jam di `tanggalWibDari`), dipakai untuk kop,
  kepala unit, dan status kini.
- **Pembaca `rincian`** (`uraiRincian`, `kalimatRincian`) hanya di TS karena
  dipakai layar dan cetak, bukan aturan yang ditulis backend.
- **Cetak dari modal rincian di tab Kinerja**; tab Kinerja di rincian pegawai
  tetap ringkasan tanpa modal dan tanpa tombol cetak.

Penyimpangan dari §23 untuk ditinjau:

- **`KINERJA_JP_BERLAKU_SQL` tidak dibuat.** `KINERJA_PENGAJUAN_SQL` (5b) sudah
  berisi pengajuan berlaku satu pegawai dalam rentang dengan predikat
  `PENGAJUAN_BERLAKU_SQL` harfiah, dan sudah membawa `jam_mulai_ke` dan
  `jam_sampai_ke`; satu kueri itu kini dipakai kehadiran dan `jp_terdampak`.
  Bedanya dengan pola `JP_TERDAMPAK_SQL` hanya `nama_guru` dan `EXISTS` jadwal
  aktif, dan keduanya tidak mengubah hasil karena `jp_terdampak` hanya
  mencocokkan jadwal guru itu.
- **"Mengetahui" ketua yayasan** hanya bila kepala unit tercatat lewat tugas
  `tgs-kepsek` dan id-nya sama dengan penilai. Bila kepala unit diambil dari
  profil sekolah (tanpa tugas), id tidak ada, jadi lembar tetap memakai kepala
  unit itu.

Belum diuji di browser/perangkat: panel ketiga aspek otomatis di modal rincian
(Draf dengan daftar tanggal/rombel, Diajukan/Final dari `rincian` beku), Ajukan
dengan presensi atau jurnal yang berubah sesudah layar dimuat, dan tombol Cetak
lembar hasil beserta PDF A4 di Edge/Chrome dan WebView2 Desktop (logo, tabel
panjang, tanda tangan tidak terpotong). Belum diuji juga Desktop yang presensi
kelasnya masih di outbox saat Ajukan, serta role Yayasan/Kepala Sekolah/
Kepegawaian yang membuka bahan cetak dengan izin kinerja saja.
