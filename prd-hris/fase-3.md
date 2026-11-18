# PRD HRIS — Fase 3

Bagian §21 dari `prd-hris.md`, dipindahkan apa adanya pada 2026-11-18 supaya satu sesi cukup membaca satu fase. Nomor bagian tidak berubah: rujukan `prd-hris.md §21.x` di kode menunjuk ke berkas ini. Istilah, keputusan pemilik (§5), hak akses umum (§15), dan sinkronisasi (§17) ada di `prd-hris.md`.

## 21. Urutan pengerjaan Fase 3

Ditulis setelah menelusuri kode sekolah (14 Nov 2026) sesudah Fase 2 lengkap
(§20.13). Bila §9 dan bagian ini berbeda, **bagian ini yang berlaku** setelah
Q-59 sampai Q-72 dijawab. Belum ada kode yang diubah.

Ringkasnya: **tanpa tabel, tanpa versi skema, tanpa izin baru** (v69 tetap,
perangkat lama tetap sinkron). Rekap beban mengajar dibaca dari data
tersinkron dan jalan luring; cetak surat memakai pola berita acara inventaris
(HTML A4 + dialog cetak), hanya Web/Desktop.

### 21.1 Temuan dari kode

Diverifikasi ke kode sekolah (baris per 14 Nov 2026).

**Salah atau perlu diubah:**

1. **Ada dua sumber "siapa mengajar apa" yang tidak saling memeriksa.**
   `akademik_guru_mapel` (penugasan guru × rombel × mapel per tahun ajaran,
   dengan `akademik_mapel.beban_jam`; `academic.rs:1167-1260`, tab Penugasan
   `components/akademik/PenugasanPanel.tsx`) dan `jadwal_mengajar` (slot
   mingguan). `save_teaching_schedule` (`academic.rs:1417`) tidak memeriksa
   penugasan, jadi keduanya bisa berbeda. §9.1 memakai jadwal; honor JP dan
   presensi juga mengikuti jadwal/presensi, bukan penugasan (Q-61).
2. **`TUGAS_BERLAKU_SQL` tidak cukup untuk beban** (`hris.rs:335`): hanya
   mengembalikan `(id_karyawan, id_jenis)` tanpa ekuivalen JP, dan `UNION`
   melebur dua tugas berjenis sama (dua ekskul = satu baris; wali dua rombel =
   satu baris). Untuk sasaran `TUGAS:` gaji itu benar; untuk beban tidak. SQL
   baru `BEBAN_TUGAS_SQL` dengan predikat "berlaku" salinan harfiah (pola
   `PENGAJUAN_AKTIF_ORANG_SQL`, §20.13); gaji tidak disentuh.
3. **Izin baru berarti versi skema baru.** `app_permission` dan paket role
   HRIS (`ROLE_HRIS_BAWAAN`, `turso.rs:708`, ditulis `:4780`) hanya dijalankan
   `ensure_schema`, yang dilewati selama sentinel `-2045` ada
   (`turso.rs:5823-5852`); Web hanya menjalankan `runDatabaseMigrations` bila
   `MAX(version) < CURRENT_SCHEMA_VERSION` (`db-schema.ts`). Izin baru =
   v70 + sentinel `-2046`, dan `cloud_version > CLIENT_SCHEMA_VERSION`
   (`sync.rs:27`) menghentikan sinkron setiap perangkat v69. §15.1 sudah
   menaruh SK di `hr.duty.manage`, jadi tidak perlu izin baru (Q-60).
4. **Tidak ada data kepala per unit atau ketua yayasan.** `company_profile`
   satu baris (`leader_name/title/nip`, `storage.rs:1425`), `akademik_unit`
   hanya nama (`storage.rs:1301`). Kepala unit bisa diturunkan dari tugas
   `tgs-kepsek` yang berlaku dengan `unit` = nama unit; ketua yayasan tidak
   ada di mana pun → kunci pengaturan (Q-66).
5. **Kunci gabungan jam lintas unit.** `summarize_teaching`
   (`payroll/engine.rs:243` ↔ `payroll-calculator.ts:275`) melebur
   `(tanggal, jam)` tanpa melihat unit, padahal bel per unit berbeda (v60).
   Rekap memakai kunci yang sama `(hari, jam)` supaya JP rekap = JP yang
   dibayar, dan menandai peleburan lintas unit (`gabungan_lintas_unit`)
   karena itu hampir selalu jadwal yang salah.
6. **`PTK_SQL` memakai semester aktif** (`hris_cloud.rs:102`, `ta.is_aktif =
   1`), bukan semester pilihan. Rekap beban memakai `id_tahun_ajaran` pilihan
   sendiri; Laporan PTK tidak diubah.
7. **Bidang sertifikat teks bebas dan cloud-only** (`hr_sertifikasi.bidang_studi`,
   Q-31). Nama mapel juga teks. Pencocokan hanya bisa berupa petunjuk, dan
   hanya saat terhubung (Q-64).
8. **Pengajuan Dinas Luar tidak punya tempat tujuan** (`hr_pengajuan`, §20.3):
   Surat Tugas butuh tujuan/penyelenggara. Diketik saat cetak (Q-69).
9. **`desktop_hr_settings_save` mewajibkan kedua angka kontrak**
   (`hris.rs:1242`). Menambah batas JP ke command yang sama berarti setiap
   pembangun draft (bagian angka kontrak di tab Organisasi) wajib membawa
   empat isian; tipe TS dibuat wajib supaya `tsc` menunjuk yang lupa.
10. **`hr_kontrak` append-only**: nomor SK pengangkatan yang kosong saat
    kontrak dicatat tidak bisa diisi kemudian. Saat cetak, nomor kosong
    diketik dan tidak tersimpan (Q-59).
11. **Pembantu cetak tersalin dua kali**: `esc`, `tanggalPanjang`, kop, dan
    tanda tangan ada di `components/inventory/beritaAcara.ts` dan
    `components/keuangan/kuitansi.ts`. Surat Fase 3 memakai kop dan tanda
    tangan yang sama; bagian itu dipindah ke satu berkas bersama yang juga
    dipakai berita acara (kuitansi A5 dibiarkan).

**Sudah ada, dipakai ulang (tidak dibuat dua kali):**

- **Pola cetak A4**: `cetakBeritaAcara` (`beritaAcara.ts:167`): `div`
  `#kos-print-root` + `@media print` + `window.print()`, serif, hitam di atas
  putih apa pun temanya, tombol disembunyikan di Mobile (WebView Android
  tanpa dialog cetak). Berjalan di Web dan WebView2 Desktop.
- **Kop**: `kop_sekolah` (`inventory.rs:3328`, `pub(crate)`) ↔ `kopSekolah`
  (`services/inventory.ts:1467`), tipe `KopSekolah`
  (`validations/inventory.ts:947`): hanya kolom tampilan, tanpa menuntut
  `settings.manage`.
- **Jam pelajaran**: `jam_ke_range` (`class_attendance.rs:735`) ↔
  `rentangJamKe` (baris `3-4` = 2 JP), urutan `CAST(jam_ke AS INTEGER)`.
- **Tugas tambahan**: `hr_tugas_tambahan`, `hr_tugas_jenis` (ekuivalen bawaan
  `hris.rs:36`: Kepala Sekolah 24, Wakasek/Kaprog/Kaperpus/Kalab 12, Wali
  Kelas/Pembina OSIS/Pembina Ekskul 2, Piket 1, Bendahara BOS 0), wali kelas
  dari `akademik_rombel.id_wali_kelas` per semester, `desktop_hr_duties`,
  `desktop_hr_duty_save` (menyimpan `nomor_sk`/`tanggal_sk`).
- **Status kini**: `STATUS_KINI_SQL` (`hris.rs:305`); kontrak
  `desktop_hr_contracts`.
- **Sertifikat per guru**: `desktop_hr_ptk_report` (`teachers.view`, cloud)
  sudah mengembalikan `sertifikat_bidang`, `sertifikat_tahun`, `nrg` per
  pegawai; layar rekap memakainya ulang untuk tanda linier, tanpa command
  cloud baru.
- **Pengajuan Dinas Luar berlaku**: `desktop_hr_requests` (status, pegawai,
  rentang, alasan) + `PENGAJUAN_BERLAKU_SQL`.
- **Masa kerja**: `masaKerja` (`components/kepegawaian/gaya.ts:18`); hari ini
  WIB `HARI_INI_SQL` (`hris.rs:316`).
- **Penyimpan setting tersinkron**: `tulis_setting` (`hris.rs:1080`, outbox
  `setting`, kunci bebas, tanpa daftar izin kunci).
- **Ekspor Excel**: `exportToExcel` (`client/excel-export.ts`), pola
  `TabLaporanPtk.tsx`.
- **Pola "backend kirim data mentah, susun SEKALI di TS"**: laporan kehadiran
  (`susunLaporanKehadiran`, §20.1) dan ringkasan PTK (`ringkasPtk`, §19.13).

**Kait:**

- Versi tetap: `CURRENT_SCHEMA_VERSION` 69 dan `REQUIRED_TABLE_COUNT` 122
  (`db-schema.ts:5-6`), `CLIENT_SCHEMA_VERSION` 69 (`sync.rs:23`), sentinel
  `-2045` (`turso.rs:5427`, pemeriksa `:5841`).
- Snapshot 81 `SnapshotTable` (`sync.rs:81`), `CANONICAL_SYNC_ROUTES` 145
  (`sync.rs:1836`); tidak berubah.
- Command terdaftar: Desktop 408, Mobile 413 (dihitung dari blok
  `generate_handler!` kedua `lib.rs`); rute Web 298 (`src/app/api/**/route.ts`).
- RBAC: `hr.duty.manage` dipegang Yayasan, Kepala Sekolah, Kepegawaian, dan
  Admin bawaan (tidak sensitif); Kepala TU tidak (`catalog.ts:677-765`).
- Area `kepegawaian` lolos dengan `employees.view` ATAU `teachers.view`
  (`auth/access.ts:108`); tab memeriksa izinnya sendiri.

### 21.2 Rancangan per bagian

#### 21.2.1 Rekap beban mengajar (§9.1)

**Per semester** = satu baris `akademik_tahun_ajaran` (`id_tahun_ajaran`,
bawaan semester aktif). Backend hanya mengirim data mentah lewat empat SQL
kembar (teks diperiksa harfiah Rust ↔ TS); rekap disusun SEKALI di TS
`susunBebanMengajar` (Q-65), dipakai Web dan Desktop:

| SQL | Isi |
| :-- | :-- |
| `BEBAN_GURU_SQL` | guru aktif (punya `guru_data`) ∪ siapa pun yang punya jadwal aktif di semester itu: id, nama, gelar, NIP, NUPTK, unit utama, status kini (`STATUS_KINI_SQL` pada akhir semester), aktif/nonaktif |
| `BEBAN_JADWAL_SQL` | `jadwal_mengajar` aktif semester itu: id_guru, hari, `jam_ke`, rombel, unit rombel, mapel; `ORDER BY hari, CAST(jam_ke AS INTEGER), jam_ke` |
| `BEBAN_TUGAS_SQL` | tugas tambahan yang berlaku dan beririsan semester (predikat salinan harfiah `TUGAS_BERLAKU_SQL`), **per baris** dengan ekuivalen (`COALESCE(t.ekuivalen_jp, j.ekuivalen_jp)`), nama jenis, unit, nomor/tanggal SK; ditambah wali kelas **per rombel** dari `akademik_rombel` semester itu |
| `BEBAN_PENUGASAN_SQL` | `akademik_guru_mapel` tahun ajaran itu × `beban_jam` (pembanding, Q-61) |

`susunBebanMengajar(data, batas)` → per guru:

- **JP tatap muka** = jumlah pasangan `(hari, jam)` unik dari baris jadwalnya
  (rentang `3-4` = jam 3 dan 4), kunci yang sama dengan `summarize_teaching`
  (temuan 5). Rincian per mapel × rombel (JP masing-masing, sebelum
  peleburan) dan per unit rombel.
- **JP tugas** = jumlah ekuivalen setiap baris tugas berlaku (Q-63).
- **Total** = tatap muka + tugas, dibanding `batas.min`/`batas.maks`.
- **Tanda** (tidak pernah menolak, tidak pernah disimpan): `kurang_dari_batas`,
  `lebih_dari_batas`, `tanpa_jadwal`, `jam_tidak_terbaca` (`jam_ke` yang
  `rentangJamKe` tolak; barisnya tidak dihitung), `gabungan_lintas_unit`,
  `beda_penugasan` (JP jadwal suatu rombel × mapel ≠ `beban_jam`
  penugasannya, atau salah satunya tidak ada), `nonaktif` (punya jadwal tapi
  nonaktif), `mapel_di_luar_sertifikat` (saat daring, Q-64).

**Batas** di `setting_gex_system`, disimpan lewat `desktop_hr_settings_save`
yang ada (temuan 9; `hr.org.manage`), kembar Rust ↔ TS dengan
`validasi_angka_pengaturan`:

| Kunci | Bawaan | Rentang |
| :-- | :-- | :-- |
| `hr_beban_min_jp` | 24 | 0–60 |
| `hr_beban_maks_jp` | 40 | 1–60, ≥ min (ditolak bila kurang) |

Angka 24–40 dan ekuivalen tugas tetap **dicek ulang** (Permendikbud
15/2018 dan aturan turunannya).

**Tanda linier (Q-64)**: layar memanggil `desktop_hr_ptk_report` yang sudah
ada; bila berhasil, guru bersertifikat yang salah satu mapelnya tidak
"cocok" dengan bidang sertifikatnya mendapat tanda "Mapel di luar bidang
sertifikat (periksa)". Cocok = setelah huruf kecil dan buang tanda baca/spasi
ganda, nama mapel memuat bidang atau sebaliknya. Fungsi tampilan TS saja
(`cocokBidang`), seperti `ringkasPtk`. Luring: kolom sertifikat berisi
"Butuh koneksi", rekap lain tetap tampil.

**Ekspor Excel per unit**: satu sheet per pilihan unit (unit utama guru,
atau semua): No, Nama, NIP, NUPTK, Status, Unit, Mapel (rombel: JP), JP tatap
muka, Tugas tambahan (ekuivalen), JP tugas, Total, Batas, Keterangan
(tanda dalam kalimat), Bidang sertifikat (bila daring). Baris kosong lalu
ringkasan: jumlah guru, di bawah batas, di atas batas.

#### 21.2.2 Cetak SK dan surat (§9.2)

Semua dirakit di TS (HTML A4, `window.print()`), satu berkas
`components/kepegawaian/suratKepegawaian.ts`, memakai kop dan tanda tangan
bersama (temuan 11). Data diambil dari command yang sudah ada ditambah satu
command baca `desktop_hr_letter_setup` (kop, pengaturan surat, kepala per
unit, identitas guru). Isinya tidak disimpan; satu-satunya tulisan adalah
nomor SK tugas tambahan lewat `desktop_hr_duty_save` yang ada (Q-59).

| Dokumen | Sumber | Penanda tangan |
| :-- | :-- | :-- |
| **SK Pembagian Tugas Mengajar** (per semester per unit, lampiran tabel per guru) | rekap beban §21.2.1 untuk unit rombel itu (Q-66): mapel, rombel, JP, tugas tambahan + ekuivalen, total | Kepala unit |
| **SK Tugas Tambahan** (per baris tugas, atau semua tugas satu jenis satu tahun ajaran dalam satu SK dengan lampiran) | `desktop_hr_duties` + nama/NIP; nomor/tanggal dari baris tugas | Kepala unit tugas; tugas tanpa unit (yayasan) → ketua yayasan |
| **SK Pengangkatan GTY/PTY** | kontrak GTY/PTY sah (`desktop_hr_contracts`): nomor, TMT, status; jabatan, unit dari organisasi | Ketua yayasan |
| **Surat Tugas** (dinas luar) | pengajuan Dinas Luar **berlaku**: pegawai, rentang tanggal, alasan sebagai keperluan; tujuan/penyelenggara diketik saat cetak (temuan 8) | Kepala unit pegawai |
| **Surat Keterangan Aktif** (Bekerja untuk tendik, Mengajar untuk guru) | organisasi (nama, jabatan, unit, TMT, masa kerja) + status kini + NIP/NUPTK; guru: mapel semester aktif dari rekap | Kepala unit pegawai |

- **Kepala unit** = pegawai dengan tugas `tgs-kepsek` berlaku pada tanggal
  surat dan `LOWER(TRIM(unit))` = unit itu (yang `tanggal_mulai` terakhir),
  dengan gelar dan NIP; tidak ada → `company_profile.leader_*`; itu pun
  kosong → baris tanda tangan kosong untuk diisi tangan.
- **Kop** = `company_profile` (satu kop sekolah/yayasan) + nama unit sebagai
  baris kedua (Q-67).
- **Isi SK** (Menimbang, Mengingat, Memutuskan): Menimbang dan Mengingat
  per jenis dari pengaturan, kosong = teks bawaan di
  `validations/hr-surat-bawaan.json` (Q-68); Memutuskan dirakit dari data.
- **Nomor** (Q-59): dialog cetak mengisi pola jenis itu; pengguna mengetik
  nomor urut dari buku agenda surat keluar sekolah, lalu boleh mengubah
  hasil akhirnya. Token pola: `{urut}`, `{kode}`, `{unit}`, `{romawi}`
  (bulan Romawi tanggal surat), `{tahun}`. Bawaan
  `{urut}/{kode}/{unit}/{romawi}/{tahun}`, kode bawaan `SK-PTM`, `SK-TGS`,
  `SK-ANGKAT`, `ST`, `SKET`. Fungsi tampilan TS `nomorSurat(pola, isian)`.
  SK tugas tambahan yang nomornya diketik disimpan ke barisnya (izin
  `hr.duty.manage`, outbox biasa); SK pengangkatan memakai `hr_kontrak.nomor`
  bila ada.
- **Tanggal surat** bawaan hari ini WIB (`HARI_INI_SQL`), bisa diubah; tempat
  dari pengaturan (`hr_surat_kota`).
- **Mobile**: tidak ada (Q-35, dan WebView Android tanpa dialog cetak).

### 21.3 Model data dan sinkronisasi

**Tidak ada tabel baru, kolom baru, rute sync baru, atau versi skema baru.**
v69 dan sentinel `-2045` tetap; `REQUIRED_TABLE_COUNT` 122, snapshot 81,
rute kanonik 145 tidak berubah. Perangkat v69 yang belum diperbarui tetap
sinkron; mereka hanya tidak punya layar barunya.

**Pengaturan** (`setting_gex_system`, outbox `setting` lewat `tulis_setting`,
kosong/tidak ada = bawaan):

| Kunci | Isi | Disimpan oleh |
| :-- | :-- | :-- |
| `hr_beban_min_jp`, `hr_beban_maks_jp` | batas JP per minggu (§21.2.1) | `desktop_hr_settings_save` (diperluas) |
| `hr_surat_pola:<jenis>` | pola nomor; `<jenis>` ∈ `ptm`, `tugas`, `angkat`, `tugas_luar`, `aktif`; 1–80 karakter, wajib memuat `{urut}` | `desktop_hr_letter_settings_save` |
| `hr_surat_dasar:<jenis>` | Menimbang dan Mengingat (dua bagian dipisah baris `---`), ≤ 4.000 karakter; hanya jenis SK (`ptm`, `tugas`, `angkat`) | sama |
| `hr_surat_kota` | tempat penetapan, ≤ 60 | sama |
| `hr_surat_yayasan_nama`, `hr_surat_yayasan_ketua`, `hr_surat_yayasan_jabatan` | lembaga, nama ketua, jabatan (bawaan "Ketua Yayasan"), masing-masing ≤ 120 | sama |

Validasi kunci dan panjang kembar Rust ↔ TS (vektor di
`hr-surat.vektor.json`); nilai di luar daftar jenis ditolak, tidak
dinormalkan.

**Nomor surat tidak punya register** (Q-59). Register surat keluar (tabel
append-only bernomor seri perangkat seperti `keu_pembayaran`) ditunda: Fase 4
(`hr_sp`) adalah tempat pertama yang benar-benar butuh nomor tersimpan.

### 21.4 Hak akses

**Tanpa izin baru** (Q-60, temuan 3):

| Aksi | Izin | Sudah dipegang |
| :-- | :-- | :-- |
| Lihat rekap beban, unduh Excel | `teachers.view` | Operator, Yayasan, Kepala Sekolah, Kepegawaian, Admin |
| Tanda linier (sertifikat) | `teachers.view` (lewat `desktop_hr_ptk_report`) | sama |
| Batas JP, pengaturan surat | `hr.org.manage` | Yayasan, Kepegawaian, Admin |
| Cetak kelima surat (`desktop_hr_letter_setup`) | `hr.duty.manage` (§15.1: "tugas tambahan, SK") | Yayasan, Kepala Sekolah, Kepegawaian, Admin |
| Simpan nomor SK tugas | `hr.duty.manage` (command yang ada) | sama |

- Data sumber tiap surat tetap dijaga command asalnya: kontrak dan tugas
  `employees.view`/`teachers.view`, pengajuan `hr.request.view`. Tombol cetak
  hanya tampil bila kedua izin dipegang.
- **Kepala TU** tidak memegang `hr.duty.manage`; Superadmin memberikannya
  lewat Role & Akses bila TU yang mencetak surat keterangan tendik. Paket
  bawaan tidak diubah, jadi tidak ada role yang kehilangan atau mendapat akses
  tanpa disadari.
- Tidak ada area baru; tab baru di `/kepegawaian` memeriksa izinnya sendiri
  (`auth/access.ts:108`). Tidak ada halaman lama yang mendapat penjaga baru.

### 21.5 Command, rute, gateway, dan layar

**Rust**: modul baru `desktop/hr_beban.rs` (SQL kembar + baca + simpan
pengaturan surat; masuk `filesToSync`, `pub mod` di kedua `mod.rs`). Command
baru (3), terdaftar di kedua `lib.rs`, `build.rs`,
`capabilities/default.json`, `permissions/autogenerated`:

| Command | Izin | Isi |
| :-- | :-- | :-- |
| `desktop_hr_teaching_load` (`id_tahun_ajaran`) | `teachers.view` | data mentah §21.2.1 + batas + daftar semester; lokal, jalan luring |
| `desktop_hr_letter_setup` | `hr.duty.manage` | kop (`kop_sekolah`), pengaturan surat, kepala per unit pada `tanggal`, NIP/NUPTK/gelar guru, hari ini WIB; lokal |
| `desktop_hr_letter_settings_save` | `hr.org.manage` | kunci §21.3 dalam satu transaksi, outbox `setting` |

**Sesudahnya: Desktop 408 → 411, Mobile 413 → 416.**

Berubah tanpa command baru: `desktop_hr_settings_save` (+2 angka wajib),
`pengaturan_kontrak` (`hris.rs`, ikut mengembalikan batas JP) ↔ kembaran TS.

**Web**: `validations/hr-beban.ts` (SQL kembar, aturan pengaturan, vektor
`hr-surat.vektor.json`) + `services/hr-beban.ts`; rute baru `POST
/api/kepegawaian/teaching-load/query`, `letters/query`, `letters/settings`
(Zod `.strict()`, `assertSameOriginMutation`, `requireWebPermission`, tanpa
`GET`) → **298 → 301**; `/api/kepegawaian/settings` diperluas. Gateway di
`gateways/hris.ts`. Rakitan dan cetak (`susunBebanMengajar`, `cocokBidang`,
`nomorSurat`, templat surat) di TS saja, dipakai Web dan Desktop.

**Berkas bersama cetak**: `components/cetak-a4.ts` (`esc`, `tanggalPanjang`,
kop, tanda tangan, gaya dasar, `cetakA4(html)`), dipakai `beritaAcara.ts` dan
`suratKepegawaian.ts`; ditambahkan ke `filesToCopy` karena `beritaAcara.ts`
disalin ke Mobile.

**Layar (Web/Desktop saja, Q-71):**

1. **Tab "Beban Mengajar"** di `/kepegawaian` (`teachers.view`,
   `components/kepegawaian/TabBebanMengajar.tsx`): pilihan semester dan unit,
   tabel per guru (tatap muka, tugas, total, batas, tanda), rincian per guru
   (mapel × rombel × JP, tugas), Unduh Excel, tombol **Cetak SK Pembagian
   Tugas** (bila `hr.duty.manage`).
2. **Tab "Surat"** di `/kepegawaian` (`hr.duty.manage`): pilih jenis →
   pilih pegawai/tugas/kontrak/pengajuan → dialog (nomor dari pola, tanggal,
   isian tambahan Surat Tugas) → Cetak.
3. **Tombol cetak di tempat datanya**: baris tab Tugas Tambahan (SK Tugas),
   baris kontrak GTY/PTY di tab Kontrak (SK Pengangkatan), rincian pengajuan
   Dinas Luar berlaku di `/pengajuan` (Surat Tugas), rincian pegawai (Surat
   Keterangan Aktif). Semuanya membuka dialog yang sama.
4. **Tab Organisasi**: angka batas JP di bagian angka kontrak; bagian baru
   **Pengaturan surat** (kota, yayasan, pola dan kode per jenis, Menimbang/
   Mengingat per SK).

### 21.6 Tidak dikerjakan di fase ini

- Register/arsip surat keluar dan penghitung nomor otomatis (Q-59; Fase 4).
- Kontrak kerja GTT/PTT (PKWT) dan surat lain di luar daftar §9.2.
- Kop per unit (alamat, logo per unit) dan tanda tangan/stempel digital.
- PDF (jsPDF seperti kuitansi) dan cetak di Mobile (Q-35, Q-71).
- Daftar padanan mapel ↔ bidang sertifikat dan sinkron kode bidang studi
  resmi (Q-64).
- Menyamakan otomatis penugasan dan jadwal; tanda `beda_penugasan` hanya
  memberi tahu (Q-61).
- Telegram "SK pembagian tugas semester belum dibuat" (Fase 6); karena tidak
  ada register, Fase 6 memutuskan cara mendeteksinya.
- Tempat tujuan di pengajuan Dinas Luar (kolom baru = versi baru).
- Laporan PTK tetap memakai semester aktif (temuan 6).

### 21.7 Langkah

Dua sub-fase, masing-masing bisa dirilis sendiri (tidak ada skema). Setiap
sub-fase berakhir dengan typecheck, Biome, dan tes per berkas hijau; `bun run
check` penuh oleh pemilik sesudah semua fase HRIS.

**3a — Rekap beban mengajar** (batas: sesudah langkah 5, rekap dan Excel
jalan di Web/Desktop, luring di Desktop):

| # | Langkah | Gerbang |
| :-- | :-- | :-- |
| 1 | SQL kembar `hr_beban.rs` ↔ `validations/hr-beban.ts` (`BEBAN_GURU_SQL`, `BEBAN_JADWAL_SQL`, `BEBAN_TUGAS_SQL` dengan predikat salinan harfiah `TUGAS_BERLAKU_SQL`, `BEBAN_PENUGASAN_SQL`) | `bun test validations/hr-beban.test.ts` (teks dicek harfiah ke Desktop dan Mobile, predikat = `TUGAS_BERLAKU_SQL`); `audit:sql` |
| 2 | `susunBebanMengajar` + `cocokBidang` | `bun test` vektor: rentang `3-4`, dua rombel jam sama (satu JP), lintas unit (tanda), `jam_ke` rusak, tugas berekuivalen kosong = jenis, dua ekskul = dua baris, wali dua rombel, kurang/lebih batas, beda penugasan, nonaktif |
| 3 | Batas JP di `desktop_hr_settings_save` ↔ TS (`ATURAN_BEBAN_MIN/MAKS`, maks ≥ min) + pembacanya | `cargo test hris` per nama (Desktop); `hris.test.ts` vektor angka; `tsc` menunjuk setiap pembangun draft |
| 4 | Command `desktop_hr_teaching_load` + rute + gateway | `cargo test hr_beban` (database memori: semester lain tidak ikut, tugas batal tidak ikut); `services/hr-beban.test.ts` (database Web sungguhan); `audit:contract`, `audit:route-guard` |
| 5 | Tab Beban Mengajar + Excel + tanda linier lewat `desktop_hr_ptk_report` | `tsc` + Biome; `audit:a11y`, `audit:list-bound`, `audit:ui-guard`, `audit:page-guard` |

**3b — Cetak SK dan surat** (batas: Fase 3 lengkap):

| # | Langkah | Gerbang |
| :-- | :-- | :-- |
| 6 | `components/cetak-a4.ts`, `beritaAcara.ts` memakainya, `filesToCopy` | `tsc` kedua workspace; `sync-frontend-lib`; berita acara dicetak sekali di browser dan sama dengan sebelumnya |
| 7 | `desktop_hr_letter_setup`, `desktop_hr_letter_settings_save` ↔ rute `letters/query`, `letters/settings`; `KEPALA_UNIT_SQL`; validasi kunci/panjang pengaturan | vektor `hr-surat.vektor.json` Rust ↔ TS; `cargo test hr_beban` (kepala: tugas batal dan tugas selesai tidak dipakai, cadangan `company_profile`); `audit:contract` |
| 8 | `suratKepegawaian.ts`: lima templat, `nomorSurat`, teks bawaan `hr-surat-bawaan.json` | `bun test` `nomorSurat` (token, Romawi, pola tanpa `{urut}` ditolak) dan templat (setiap nilai di-escape; data kosong tidak menghasilkan "undefined") |
| 9 | Tab Surat, tombol cetak di Tugas/Kontrak/Pengajuan/Rincian, Pengaturan surat di Organisasi | `tsc` + Biome; `audit:a11y`, `audit:dialog`, `audit:confirm`, `audit:ui-guard`; cetak kelima surat sekali di browser |
| 10 | `sync-rust-modules`, `sync-frontend-lib`, paragraf ringkas `CLAUDE.md`, catatan "Sudah dibangun" | `audit:contract`, `audit:schema`; `cargo test hr_beban` Mobile |

### 21.8 Pertanyaan untuk pemilik (Fase 3)

Q-13 (§16) dijawab lewat Q-59.

| No | Pertanyaan | Usulan | Alasan |
| :-- | :-- | :-- | :-- |
| Q-59 | Q-13: nomor surat **semi-otomatis**: pola per jenis di Pengaturan, nomor urut diketik dari buku agenda surat keluar, hasil boleh diubah sebelum cetak; tanpa penghitung dan register di aplikasi; nomor SK tugas disimpan ke barisnya, nomor surat lain tidak disimpan? | Ya | Buku agenda sekolah juga memuat surat non-kepegawaian, jadi penghitung aplikasi pasti bertabrakan dengannya. Penghitung yang aman luring butuh tabel bernomor seri perangkat (pola kuitansi) dan versi skema baru. SK hanya beberapa per semester |
| Q-60 | **Tanpa izin baru dan tanpa versi skema**: cetak = `hr.duty.manage`, pengaturan = `hr.org.manage`, rekap = `teachers.view`; Kepala TU diberi `hr.duty.manage` lewat Role & Akses bila perlu? | Ya | Izin baru hanya sampai ke database lewat v70, dan v70 menghentikan sinkron setiap perangkat yang belum diperbarui (temuan 3). §15.1 sudah menaruh SK di `hr.duty.manage` |
| Q-61 | JP tatap muka dari **`jadwal_mengajar`** semester itu; penugasan (`akademik_guru_mapel` × `beban_jam`) hanya pembanding dengan tanda `beda_penugasan`? | Ya | Jadwal yang dipakai presensi, Jam Kosong, dan honor; penugasan tidak diperiksa saat jadwal disimpan (temuan 1). SK yang berbeda dari jadwal nyata menyesatkan |
| Q-62 | Peleburan jam memakai kunci `(hari, jam_ke)` **sama dengan honor** (kelas gabungan dihitung sekali), lintas unit ikut dilebur tetapi ditandai? | Ya | JP rekap = JP yang dibayar; jam yang sama di dua unit hampir selalu salah jadwal (temuan 5) |
| Q-63 | Ekuivalen tugas dijumlah **per baris tugas** yang berlaku di semester itu (dua ekskul = 2 × 2 JP, wali dua rombel = 2 × 2 JP), tugas yang berlaku sebagian semester dihitung penuh; batas 24–40 di `hr_beban_min_jp`/`hr_beban_maks_jp`? | Ya | Setiap tugas memang beban sendiri; SK dan rekap dibuat per semester, bukan per hari. Angka tetap dicek ulang |
| Q-64 | Tanda "mapel di luar bidang sertifikat" berupa **petunjuk** dari kecocokan nama (huruf kecil, memuat), hanya saat daring, tanpa daftar padanan? | Ya | Bidang dan mapel teks bebas (Q-36); daftar padanan menambah layar dan data. Bila tanda palsu terlalu sering, padanan ditambah kemudian sebagai kunci setting |
| Q-65 | Rekap disusun **sekali di TS** dari data mentah yang dikirim backend (pola laporan kehadiran), bukan fungsi kembar Rust ↔ TS; yang kembar adalah SQL-nya (dicek harfiah)? | Ya | Rekap hanya tampilan dan cetak, tidak menyentuh uang atau data tersimpan; satu fungsi berarti tidak ada dua jawaban |
| Q-66 | SK Pembagian Tugas dibuat **per unit rombel** (guru dua unit muncul di dua SK dengan JP unit itu); penanda tangan = kepala unit dari tugas `tgs-kepsek` berlaku, cadangan pimpinan di profil sekolah; SK Pengangkatan dan SK tugas tanpa unit ditandatangani **ketua yayasan** dari Pengaturan surat? | Ya | Tidak ada data kepala per unit atau ketua yayasan selain itu (temuan 4); tugas kepala sekolah sudah dicatat sejak Fase 1 |
| Q-67 | Satu kop dari profil sekolah + nama unit sebagai baris kedua, bukan kop per unit? | Ya | `akademik_unit` hanya punya nama; kop per unit butuh kolom baru (versi baru) |
| Q-68 | Menimbang dan Mengingat tiap SK bisa disunting di Pengaturan surat, bawaan dari berkas JSON? | Ya | Dasar hukum dan kebiasaan tiap yayasan berbeda; tanpa itu SK tetap harus diketik ulang di pengolah kata |
| Q-69 | Surat Tugas hanya untuk pengajuan Dinas Luar **berlaku**; tujuan dan penyelenggara diketik saat cetak dan tidak disimpan? | Ya | Pengajuan tidak punya kolom tujuan (temuan 8); menambahkannya butuh versi baru |
| Q-70 | Surat Keterangan Aktif tanpa data pribadi (tempat/tanggal lahir, NIK)? | Ya | Data pribadi cloud-only dan rahasia (`hr.personal.view`); tanpanya surat tetap bisa dicetak luring dan oleh pemegang `hr.duty.manage` saja. Bila instansi tujuan meminta, diketik tangan |
| Q-71 | Rekap dan cetak hanya Web/Desktop (`window.print`, pola berita acara), tidak di Mobile dan tanpa PDF? | Ya | Q-35; WebView Android tidak punya dialog cetak; Desktop bisa "Simpan sebagai PDF" dari dialog cetak |
| Q-72 | Fase 3 dipecah 3a (rekap) dan 3b (surat), satu sesi per sub-fase, masing-masing bisa dirilis sendiri? | Ya | Tidak ada skema bersama yang mengikat keduanya; 3a sudah berguna untuk tunjangan profesi tanpa menunggu surat |

### 21.9 Penanda yang ditinjau pemilik

**Yang dirasakan pengguna:**

- Tab baru **Beban Mengajar** dan **Surat** di Kepegawaian (Web/Desktop);
  tombol cetak di Tugas Tambahan, Kontrak, rincian pegawai, dan rincian
  pengajuan Dinas Luar.
- Bagian baru **Pengaturan surat** dan angka **batas JP** di tab Organisasi.
- Rekap jalan luring di Desktop; tanda bidang sertifikat hanya saat
  terhubung.

**Risiko data dan keputusan:**

- Rekap mengikuti jadwal; bila jadwal tidak dirawat (jadwal lama, guru salah),
  rekap dan SK ikut salah. Tanda `beda_penugasan` membantu menemukan selisih
  dengan penugasan.
- Nomor surat diketik; aplikasi tidak mencegah nomor kembar (Q-59).
- Tanda linier hanya petunjuk nama; keputusan linier tetap manusia (Q-64).
- Angka batas JP, ekuivalen tugas, dan teks Menimbang/Mengingat bawaan wajib
  dicek ulang sekolah/konsultan.
- Kepala unit diturunkan dari tugas Kepala Sekolah: unit yang belum punya
  tugas itu memakai pimpinan profil sekolah.

**Perangkat:**

- Tidak ada versi skema baru: perangkat v69 tetap sinkron. Layar baru hanya
  ada di aplikasi Desktop yang diperbarui; Mobile tidak berubah selain
  command yang ikut terdaftar.
- Pengaturan surat dan batas JP tersinkron lewat outbox `setting` (yang
  terakhir tiba di cloud berlaku).

### 21.10 Jawaban Fase 3 (14 Nov 2026)

- **Q-59 sampai Q-72**: semuanya sesuai usulan §21.8, dan penanda §21.9
  disetujui. Artinya: Q-13 = nomor surat semi-otomatis (pola per jenis di
  Pengaturan, nomor urut diketik dari buku agenda, tanpa penghitung dan
  register; hanya nomor SK tugas yang disimpan); tanpa izin baru dan tanpa
  versi skema (v69 tetap; cetak `hr.duty.manage`, pengaturan `hr.org.manage`,
  rekap `teachers.view`); JP tatap muka dari `jadwal_mengajar`, penugasan
  hanya pembanding; kunci gabungan `(hari, jam_ke)` sama dengan honor, lintas
  unit ditandai; ekuivalen per baris tugas, wali per rombel, batas 24–40 bisa
  diatur; tanda linier berupa petunjuk nama saat daring; rekap disusun sekali
  di TS, SQL-nya kembar dan dicek harfiah; SK Pembagian Tugas per unit rombel,
  kepala unit dari `tgs-kepsek`, ketua yayasan dari Pengaturan surat; satu kop
  + nama unit; Menimbang/Mengingat bisa disunting; Surat Tugas hanya untuk
  Dinas Luar berlaku dengan tujuan diketik; Surat Keterangan Aktif tanpa data
  pribadi; Web/Desktop saja tanpa PDF; sub-fase 3a lalu 3b.
- Angka batas JP, ekuivalen tugas, dan teks Menimbang/Mengingat bawaan tetap
  dicek ulang sekolah/konsultan.
- Eksekusi per sub-fase §21.7 di sesi terpisah, mulai 3a.

### 21.11 Sudah dibangun: sub-fase 3a (15 Nov 2026)

Langkah 1–5 §21.7 dibangun di v69 yang sama: tanpa versi skema, tabel, kolom,
rute sync, atau izin baru. Rekap beban mengajar per semester tampil di tab
**Beban Mengajar** `/kepegawaian` (Web/Desktop), bisa diunduh Excel per unit,
dan jalan luring di Desktop; tanda bidang sertifikat hanya saat terhubung.

- **SQL kembar** `desktop/hr_beban.rs` ↔ `validations/hr-beban.ts`:
  `SEMESTER_SQL`, `BEBAN_GURU_SQL` (guru aktif ber-`guru_data` ∪ siapa pun
  yang punya jadwal aktif di semester itu, dengan `aktif`), `BEBAN_JADWAL_SQL`
  (jadwal aktif `id_tahun_ajaran` itu, unit = nama unit rombel, urut
  `CAST(jam_ke AS INTEGER)`), `BEBAN_TUGAS_SQL` (per baris, `UNION ALL`, dua
  predikat "berlaku" salinan harfiah `TUGAS_BERLAKU_SQL`), `BEBAN_PENUGASAN_SQL`
  (`akademik_guru_mapel` × `beban_jam`). Status kini dibaca `STATUS_KINI_SQL`
  yang ada pada akhir semester. `TUGAS_BERLAKU_SQL` dan jalur gaji tidak
  diubah.
- **Rekap sekali di TS** (Q-65) `susunBebanMengajar(data, sertifikat)`:
  JP tatap muka = pasangan `(hari, jam)` unik (kunci `summarizeTeaching`,
  `rentangJamKe`); rincian per rombel × mapel sebelum peleburan, per unit
  rombel sesudah peleburan di dalam unit itu; JP tugas = jumlah ekuivalen per
  baris. Delapan tanda §21.2.1, kalimatnya `kalimatTandaBeban`. `cocokBidang`
  (huruf kecil, tanda baca jadi spasi, saling memuat), `daftarUnitBeban`,
  `dalamUnitBeban`.
- **Batas JP**: `hr_beban_min_jp` (24, 0–60) dan `hr_beban_maks_jp` (40, 1–60)
  lewat `desktop_hr_settings_save` ↔ `simpanPengaturan` (Zod `.strict()` kini
  empat isian wajib), dibaca `pengaturan_kontrak` ↔ `pengaturanKontrak`
  (`beban_min_jp`/`beban_maks_jp` + `berlaku`). Aturan kembar
  `validasi_batas_beban` ↔ `validasiBatasBeban` (maks < min ditolak) dan
  `batas_beban` ↔ `batasBeban`. Isian di bagian "Angka kontrak dan beban
  mengajar" tab Organisasi.
- **Command** `desktop_hr_teaching_load(id_tahun_ajaran)` (`teachers.view`,
  SQLite lokal) ↔ rute `POST /api/kepegawaian/teaching-load/query`
  (`assertSameOriginMutation`, `requireWebPermission`, `bebanQuerySchema`
  `.strict()`), gateway `muatBebanMengajar` di `gateways/hris.ts`. Kosong =
  semester aktif, lalu yang terbaru; id tak dikenal ditolak.
- **Layar** `components/kepegawaian/TabBebanMengajar.tsx`: pilihan semester
  (bawaan aktif) dan unit, tabel per guru (status, tatap muka, tugas, total,
  keterangan) dengan rincian `<details>` (mapel × rombel × JP + JP penugasan
  bila berbeda, per unit, tugas, jam rusak, bidang sertifikat), Unduh Excel
  (kolom §21.2.1 + ringkasan jumlah/di bawah/di atas batas). Bidang sertifikat
  dari `desktop_hr_ptk_report` yang ada; gagal = "Butuh koneksi" dan tanda
  linier tidak dinilai. Tab hanya untuk `teachers.view`.

Angka (dihitung ulang dari kode, `audit:contract` sebagai acuan):

| | Sebelum | Sesudah |
| :-- | :-- | :-- |
| Command Desktop / Mobile | 408 / 413 | 409 / 414 (`desktop_hr_teaching_load`) |
| Rute Web (`src/app/api/**/route.ts`) | 298 | 299 (`/api/kepegawaian/teaching-load/query`) |
| Skema, `REQUIRED_TABLE_COUNT`, snapshot, rute kanonik, permission | v69, 122, 81, 145, 120 | tetap |

Gerbang (oleh Claude, per berkas/per nama; `bun run check` belum, sesuai
keputusan pemilik):

| # | Gerbang | Hasil |
| :-- | :-- | :-- |
| 1 | `validations/hr-beban.test.ts`: lima SQL dicek harfiah ke `hr_beban.rs` Desktop dan Mobile, kedua predikat = potongan `TUGAS_BERLAKU_SQL`; `cargo test hr_beban` (`hr_beban_predikat_salinan_harfiah`); `audit:sql` | Lulus |
| 2 | Vektor `susunBebanMengajar`: rentang `3-4`, dua rombel jam sama (1 JP), lintas unit (tanda; unit kosong tidak dihitung), `jam_ke` rusak, dua ekskul dan wali dua rombel (4 baris), kurang/lebih batas dan tepat di batas, beda penugasan (JP beda, penugasan tanpa jadwal, sama = tanpa tanda), nonaktif, sertifikat luring/daring; `cocokBidang` 6 kasus; unit | Lulus. `hr-beban.test.ts` + `hris.test.ts` 30 tes di Desktop dan salinan Mobile |
| 3 | Vektor `batas_beban` (5) dan `validasi_batas_beban` (8) + 4 vektor `angka` baru di `hris.vektor.json`; `cargo test hris_vektor` Desktop; `tsc` | Lulus (Rust 6 tes `hris_vektor`). `tsc` menunjuk satu-satunya pembangun draft (`OrganisasiTugasKontrak.tsx`) |
| 4 | `cargo test hr_beban` (database memori: semester lain, jadwal nonaktif, tugas batal, tugas semester lalu, baris SK wali tidak ikut; ekuivalen kosong = jenis; wali memakai ekuivalen baris SK-nya; id tak dikenal ditolak); `services/hr-beban.test.ts` (data sama, database Web sungguhan, dijalankan tiga kali); `audit:contract`, `audit:route-guard` | Lulus: Rust 2 tes Desktop, TS 2 tes Desktop dan Mobile |
| 5 | `tsc --noEmit` dan Biome kedua workspace (berkas yang diubah); `audit:a11y`, `audit:list-bound`, `audit:ui-guard`, `audit:page-guard` | Lulus |
| — | `sync-rust-modules`, `sync-frontend-lib`; `cargo test hr_beban` Mobile | Lulus: Mobile 2 tes, crate Mobile terkompilasi tanpa warning kode |

Keputusan yang diambil di tengah jalan:

- **Pesan angka pengaturan bersatuan**: `Aturan` mendapat `satuan` ("bulan" /
  "JP") di kedua bahasa, karena pesan lama selalu menyebut "bulan". Pesan
  kontrak tidak berubah; pemeriksa harfiah `hris.test.ts` ikut `satuan`.
- **Maks < min saat dibaca** (dua perangkat menyimpan berbeda): maks dinaikkan
  ke min (`batas_beban`), tidak ditolak dan tidak kembali ke bawaan.
- **Wali kelas memakai ekuivalen baris SK walinya** (`hr_tugas_tambahan` jenis
  wali dengan `id_rombel` dan orang yang sama, belum dibatalkan, terbaru), bila
  kosong ekuivalen jenis (Q-63 "kosong = ekuivalen jenis"). Baris SK wali
  sendiri tetap tidak dihitung, seperti di gaji.
- **Unit**: guru masuk pilihan unit bila unit utamanya itu ATAU ia mengajar di
  rombel unit itu (Q-66, SK per unit rombel di 3b). Total JP tetap total guru;
  JP per unit ada di rincian.
- **`gabungan_lintas_unit` mengabaikan rombel tanpa unit** (kosong = belum
  diatur, memakai nilai sekolah), supaya sekolah satu unit tanpa unit rombel
  tidak ditandai.
- **`beda_penugasan`** membandingkan JP baris jadwal per rombel × mapel
  (sebelum peleburan) dengan jumlah `beban_jam` penugasannya; penugasan ganda
  dijumlah sehingga ikut ditandai.
- **`tanpa_jadwal`** = tidak ada baris jadwal; baris yang semuanya rusak
  bertanda `jam_tidak_terbaca`.
- **`aktif`** = `COALESCE(status_aktif, 'Aktif') = 'Aktif'`; guru nonaktif tanpa
  jadwal semester itu tidak ikut rekap.

Penyimpangan dari §21 untuk ditinjau:

- **Pembangun draft lama**: aplikasi Desktop yang belum diperbarui tetap
  menyimpan dua angka kontrak dan tidak menyentuh kunci batas JP; aplikasi baru
  yang menerima draft tanpa kunci batas JP menganggapnya kosong (= bawaan).
- **Tendik pemegang tugas** (misal Bendahara BOS tanpa `guru_data`) tidak ikut
  rekap kecuali punya jadwal.
- **Belum diuji di browser/perangkat**: tab Beban Mengajar (Web dan Desktop,
  daring dan luring), Unduh Excel, isian batas JP di tab Organisasi (simpan,
  tolak maks < min, sinkron ke perangkat lain).

### 21.12 Sudah dibangun: sub-fase 3b (15 Nov 2026)

Langkah 6–10 §21.7 dibangun di v69 yang sama: tanpa versi skema, tabel, kolom,
rute sync, atau izin baru. Kelima surat §21.2.2 dicetak dari tab **Surat**
`/kepegawaian` dan dari tombol di tempat datanya (Web/Desktop); dengan 3a,
**Fase 3 lengkap**.

- **Pembantu cetak bersama** `components/cetak-a4.ts` (`esc`, `tanggalPanjang`,
  `kop` dengan baris kedua pilihan, `tandaTangan`, `GAYA_A4`, `cetakDiAkar`,
  `cetakA4`), di `filesToCopy`. `beritaAcara.ts` (berita acara dan label QR)
  memakainya; kuitansi A5 tidak disentuh.
- **Bahan cetak** `desktop_hr_letter_setup(tanggal)` (`hr.duty.manage`, SQLite
  lokal) ↔ `POST /api/kepegawaian/letters/query` (`suratSetupSchema`
  `.strict()`): kop (`kop_sekolah` ↔ `kopSekolah`), kunci `hr_surat_*` apa
  adanya, kepala unit (`KEPALA_UNIT_SQL`), identitas pegawai
  (`IDENTITAS_PEGAWAI_SQL`), status kini pada tanggal surat (`STATUS_KINI_SQL`),
  hari ini WIB. Kosong = hari ini; tanggal rusak ditolak.
- **Pengaturan surat** `desktop_hr_letter_settings_save` (`hr.org.manage`, satu
  transaksi, `hris::tulis_setting` per kunci) ↔ `POST
  /api/kepegawaian/letters/settings` (`pengaturanSuratSchema`: objek
  `.strict()` dengan kedua belas kunci). Aturan kembar
  `validasi_setting_surat`/`validasi_pengaturan_surat` ↔
  `validasiSettingSurat`/`validasiPengaturanSurat`, vektor
  `validations/hr-surat.vektor.json`.
- **SQL kembar** di `desktop/hr_beban.rs` ↔ `validations/hr-beban.ts` (§21.5),
  dicek harfiah oleh `hr-beban.test.ts` di Desktop dan salinan Mobile.
- **Templat** `components/kepegawaian/suratKepegawaian.ts`: `nomorSurat`,
  `romawi`, `polaSurat`, `uraiDasar`/`dasarSurat` (bawaan
  `validations/hr-surat-bawaan.json`), `kepalaUnit`, `ketuaYayasan`,
  `gabungJabatan`, `barisSkPtm`, `unitSkTugas`, dan lima perakit
  (`suratPembagianTugas`, `suratTugasTambahan`, `suratPengangkatan`,
  `suratTugasLuar`, `suratKeteranganAktif`) + `cetakSurat`.
- **Layar**: `DialogCetakSurat.tsx` (satu dialog: tanggal bawaan hari ini WIB,
  nomor urut buku agenda → nomor dari pola yang boleh diubah, tujuan dan
  penyelenggara untuk Surat Tugas) dengan pembangun permintaan per sumber;
  `TabSurat.tsx`; `PengaturanSurat.tsx` di tab Organisasi; tombol **Cetak SK**
  di baris Tugas Tambahan dan riwayat kontrak GTY/PTY sah, **Cetak Surat
  Tugas** di rincian pengajuan Dinas Luar berlaku, **Cetak Surat Keterangan
  Aktif** di rincian pegawai, **Cetak SK Pembagian Tugas** di Beban Mengajar.
  Semua tombol hanya untuk `hr.duty.manage`; layar tempatnya sudah dijaga izin
  data sumbernya.

Angka (dihitung ulang dari kode, `audit:contract` sebagai acuan):

| | Sebelum | Sesudah |
| :-- | :-- | :-- |
| Command Desktop / Mobile | 409 / 414 | 411 / 416 (`desktop_hr_letter_setup`, `desktop_hr_letter_settings_save`) |
| Rute Web (`src/app/api/**/route.ts`) | 299 | 301 (`/api/kepegawaian/letters/query`, `/api/kepegawaian/letters/settings`) |
| Skema, `REQUIRED_TABLE_COUNT`, snapshot, rute kanonik, permission | v69, 122, 81, 145, 120 | tetap |

Gerbang (oleh Claude, per berkas/per nama; `bun run check` belum, sesuai
keputusan pemilik):

| # | Gerbang | Hasil |
| :-- | :-- | :-- |
| 6 | `tsc --noEmit` kedua workspace; `sync-frontend-lib`; HTML berita acara (Serah Terima, Pemusnahan, Stock Opname) dan label QR dari `beritaAcara.ts` HEAD dibandingkan dengan versi baru (DOM tiruan, spasi dinormalkan); render media cetak di Edge | Lulus: keempatnya identik; berita acara tercetak seperti sebelumnya |
| 7 | Vektor `hr-surat.vektor.json` (19 kunci tunggal, 6 draft) di `hr_beban_vektor_surat` dan `hr-beban.test.ts`; `cargo test hr_beban` (database memori: tugas kepala batal, selesai, dan belum mulai tidak dipakai; yang mulai terakhir menang; unit dibandingkan `LOWER(TRIM)`; cadangan `company_profile.leader_*`; identitas pegawai; simpan pengaturan = 12 event outbox; draft kurang satu kunci ditolak); `services/hr-beban.test.ts` dengan data yang sama di database Web sungguhan (tiga kali); `audit:contract` | Lulus: Rust 4 tes Desktop; TS 18 + 3 tes di Desktop dan salinan Mobile |
| 8 | `suratKepegawaian.test.ts`: `nomorSurat` (pola bawaan, setiap token, Romawi tiap bulan, pola tanpa `{urut}` ditolak, token kosong tanpa garis miring ganda), penanda tangan (kepala, cadangan profil, kosong; ketua yayasan), teks dasar, `gabungJabatan`, `barisSkPtm` (guru dua unit di dua SK, tugas tanpa unit ke unit utama), `unitSkTugas`, ketujuh varian templat dengan nilai jahat (di-escape) dan data kosong (tanpa `undefined`/`null`/`NaN`) | Lulus: 14 tes |
| 9 | `tsc` + Biome; `audit:a11y`, `audit:dialog`, `audit:confirm`, `audit:ui-guard`, `audit:route-guard`, `audit:list-bound`, `audit:page-guard`, `audit:sql`, `audit:silent-catch`; kelima surat (tujuh varian) dirakit dari templat sungguhan dan dirender media cetak A4 di Edge (PNG + PDF) | Lulus; tampilan diperiksa, dua perbaikan teks sesudahnya (baris Menetapkan, kata ganda di jabatan) |
| 10 | `sync-rust-modules`, `sync-frontend-lib`; `audit:contract`, `audit:schema`; `cargo test hr_beban` Mobile | Lulus: Mobile 4 tes, crate Mobile terkompilasi tanpa warning kode |

Keputusan yang diambil di tengah jalan:

- **Identitas semua pegawai di bahan cetak**: `IDENTITAS_PEGAWAI_SQL` (nama,
  gelar, NIP, NUPTK, jabatan, unit, TMT, guru/tendik) menggantikan "identitas
  guru" §21.5, supaya kelima surat mengambil identitas dari satu sumber dan
  Surat Tugas bisa dicetak dari `/pengajuan` tanpa memuat data organisasi.
  Tanpa data pribadi (Q-70); status kini ikut pada tanggal surat.
- **Kepala unit disaring di SQL**: satu baris per `LOWER(TRIM(unit))` lewat
  `NOT EXISTS` tugas kepala berlaku yang lebih baru (seri: `id_tugas`), jadi
  tidak ada kode penyaring di kedua bahasa. Cadangan profil sekolah dan baris
  kosong dipilih di TS `kepalaUnit`; jabatan kepala = "Kepala <unit>" (tanpa
  unit "Kepala Sekolah"), cadangan memakai `leader_title`.
- **Draft pengaturan wajib membawa kedua belas kunci** (supaya pembangun draft
  yang lupa satu kunci tidak mengosongkannya diam-diam); kunci asing diperiksa
  lebih dulu, token pola selain lima ditolak, panjang dihitung per karakter
  Unicode.
- **`{kode}` tanpa kunci pengaturan**: tabel §21.3 tidak memuat kunci kode, jadi
  kode bawaan (`SK-PTM`, `SK-TGS`, `SK-ANGKAT`, `ST`, `SKET`) tetap dan
  ditampilkan di label isian pola; kode lain ditulis langsung di pola.
- **Nomor**: pola kosong = bawaan; token kosong (unit kosong, tanggal rusak)
  tidak meninggalkan garis miring ganda. Nomor SK tugas yang diketik disimpan ke
  setiap baris yang nomor atau tanggal SK-nya berbeda.
- **Menimbang/Mengingat**: satu butir per baris; huruf (a, b, …) dan nomor
  ditambahkan saat cetak.
- **Ketua yayasan** = jabatan + nama yayasan tanpa kata ganda (`gabungJabatan`:
  "Ketua Yayasan" + "Yayasan Pendidikan X" → "Ketua Yayasan Pendidikan X");
  dipakai juga di kalimat pembuka Surat Tugas ("Kepala SMA" + "SMA Contoh").
- **SK Tugas Tambahan gabungan** (tab Surat: satu jenis × satu tahun ajaran):
  kepala unit bila semua baris satu unit, selain itu ketua yayasan.
- **SK Pembagian Tugas per unit**: tugas tanpa unit masuk SK unit utama guru;
  "Semua unit" mencetak satu SK berisi semuanya. Dari tab Surat hanya semester
  aktif; semester lain dari tab Beban Mengajar.
- **Surat Tugas di tab Surat**: daftar Dinas Luar berlaku tahun berjalan.
- **Surat Keterangan Aktif guru**: mapel semester aktif dari rekap beban, hanya
  bila sesi memegang `teachers.view`; selain itu surat tanpa baris mapel.
- **Dialog cetak dibuka sesudah modal rincian ditutup**: `Modal` menutup diri
  pada Escape lewat listener `window`, jadi dua modal bertumpuk tertutup
  bersama.
- **Pengaturan surat tampil bila `hr.duty.manage`** (dibaca lewat bahan
  cetak) dan bisa disimpan bila `hr.org.manage`. Ketiga role bawaan pemegang
  `hr.org.manage` juga memegang `hr.duty.manage`.
- Dialog cetak memakai `data-tanpa-konfirmasi` (dialognya sudah langkah
  konfirmasi); formulir Pengaturan surat ikut `KonfirmasiSimpan`.

Penyimpangan dari §21 untuk ditinjau:

- **Rombel tanpa unit** tidak masuk SK unit mana pun; ia hanya ada di SK
  "Semua unit".
- **SK yayasan memakai kop sekolah** + nama unit pegawai (Q-67), bukan kop
  yayasan tersendiri.
- **Tanggal surat bebas** (boleh mundur atau maju); kepala unit mengikuti
  tanggal itu.
- **Tidak ada pratinjau penanda tangan** di dialog; unit tanpa kepala dan tanpa
  pimpinan profil tercetak dengan garis nama kosong.
- **Keperluan Surat Tugas** = alasan pengajuan apa adanya; tujuan dan
  penyelenggara boleh kosong, kalimatnya menyesuaikan.

Belum diuji di browser/perangkat: alur layar sungguhan (tab Surat, kelima
tombol cetak, dialog, simpan nomor SK tugas lalu terlihat di baris, Pengaturan
surat simpan/tolak/sinkron ke perangkat lain), dialog cetak `window.print()`
di Web dan WebView2 Desktop, pindah halaman lampiran di kertas, dan logo kop.
Yang sudah dirender adalah HTML hasil templat dengan media cetak di Edge.
