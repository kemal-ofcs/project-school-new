# PRD HRIS — Fase 2

Bagian §20 dari `prd-hris.md`, dipindahkan apa adanya pada 2026-11-18 supaya satu sesi cukup membaca satu fase. Nomor bagian tidak berubah: rujukan `prd-hris.md §20.x` di kode menunjuk ke berkas ini. Istilah, keputusan pemilik (§5), hak akses umum (§15), dan sinkronisasi (§17) ada di `prd-hris.md`.

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
