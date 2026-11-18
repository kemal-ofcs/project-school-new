# PRD HRIS — Fase 6

Bagian §24 dari `prd-hris.md`. Istilah, keputusan pemilik (§5), hak akses umum (§15), dan sinkronisasi (§17) ada di `prd-hris.md`. Pola pengirim Telegram v66 ada di `references/17-gaji-unit-telegram-pajak.md`; invarian HRIS v68–v71 di `references/18-hris-kepegawaian.md`.

## 24. Urutan pengerjaan Fase 6

Ditulis setelah menelusuri kode sekolah (19 Nov 2026), sesudah Fase 5 lengkap
(§23.13). Bila §12 atau §17 (baris Fase 6) berbeda dengan bagian ini,
**bagian ini yang berlaku** setelah Q-112 sampai Q-129 dijawab (disetujui semua, §24.10). Belum ada kode
yang diubah.

Ringkasnya: **tanpa versi skema baru (tetap v71, sentinel `-2047`), tanpa
tabel, kolom, rute sync, atau izin baru.** Fase ini menambah satu bidang
Telegram `kepegawaian` dengan sembilan kejadian, dua kunci pengaturan di
`setting_gex_system`, satu modul aturan kembar `desktop/hr_pengingat.rs` ↔
`validations/hr-pengingat.ts` (SQL sumber, jendela tanggal, penyaring izin),
dan satu command + satu rute untuk kartu "Perlu perhatian". Kartu dan pengirim
Telegram membaca data yang sama dari cloud lewat SATU pemuat.

### 24.1 Temuan dari kode

Diverifikasi ke kode sekolah (baris per 19 Nov 2026).

**Salah atau perlu diubah:**

1. **Pengirim versi lama membatalkan kejadian yang tidak dikenalnya.**
   `drainTelegram` (`services/telegram.ts:560-572`) dan kembarannya di
   `telegram.rs` membaca `BIDANG_KEJADIAN[kejadian]`; kejadian asing
   (`bidang_kejadian` → `None`) diberi status `Dibatalkan` dengan alasan
   "Kejadian dimatikan atau grupnya belum diatur." Karena Fase 6 tidak menaikkan
   versi skema, Desktop/Mobile lama tetap sinkron dan `AutoTelegramRunner`-nya
   tetap mengosongkan antrean. Pesan kepegawaian yang dicatat pengirim baru bisa
   dibatalkan oleh perangkat lama, dan `INSERT OR IGNORE` tidak pernah
   mencatatnya ulang. Perbaikan dua lapis: (a) mulai Fase 6, kejadian asing
   **dibiarkan `Menunggu`** (dilewati, tidak dibatalkan), supaya kejadian Fase 7
   dan sesudahnya aman; (b) sakelar `kirim:<kejadian>` kepegawaian bawaannya mati,
   dan layar Telegram menyebut bahwa semua perangkat harus diperbarui sebelum
   sakelar dinyalakan (Q-127). Membatalkan karena sakelar mati atau grup kosong
   tetap seperti sekarang untuk kejadian yang dikenal.
2. **Tidak ada "beranda HRIS".** `/kepegawaian` (`app/kepegawaian/page.tsx:94`)
   langsung membuka tab `daftar`. Kartu "Perlu perhatian" HRIS diletakkan di atas
   baris tab, terlihat di semua tab; beranda aplikasi = `/dashboard`.
3. **Sertifikat pendidik tidak punya tanggal kedaluwarsa.** `hr_sertifikasi`
   hanya punya `tahun`/`nrg`/`nomor_sertifikat` (`db-migrations.ts:3608`), dan
   sertifikat pendidik memang berlaku seumur hidup. Sertifikat yang bisa
   kedaluwarsa (K3, SIM satpam, STR, sertifikat pelatihan) dicatat sebagai
   `hr_dokumen` berjenis, yang punya `tanggal_kedaluwarsa` (`:3631`). Kejadian
   "dokumen/sertifikat kedaluwarsa" hanya membaca `hr_dokumen`; tanpa kolom baru.
4. **Nomor SK pembagian tugas tidak disimpan** (§21, `suratKepegawaian.ts`
   merakit dan mencetak saja). "Belum dibuat" tidak bisa dideteksi dari data.
   Usulan: pengingat berbasis kalender semester, tanpa deteksi (Q-123).
5. **Tanggal lahir hanya di `hr_profil`** (`db-migrations.ts:3566`, KHUSUS
   CLOUD). `master_data` dan `guru_data` tidak menyimpannya. Kejadian pensiun
   hanya bisa dihitung dari cloud dan hanya untuk sesi yang memegang
   `hr.personal.view`.
6. **Status "Menunggu" pengajuan tidak punya predikat SQL tersendiri.**
   `statusPengajuan` (`validations/hr-pengajuan.ts:465`) diturunkan di kode;
   SQL yang ada (`PENGAJUAN_BERLAKU_SQL`, `PENGAJUAN_AKTIF_ORANG_SQL`) memuat
   potongan predikat. `PENGINGAT_PENGAJUAN_SQL` baru memakai salinan harfiah
   potongan itu (tanpa `Batal`, keputusan final bersidik kini tidak ada),
   diperiksa harfiah oleh tes seperti Fase 2.
7. **`berlaku_sampai` SP adalah hari terakhir berlaku.** `statusSp`
   (`validations/hr-keluar.ts:116`) memberi `Berlaku` selama
   `tanggal <= hari_ini <= berlaku_sampai`. "SP berakhir hari H" diartikan hari
   status beralih ke `Berakhir`, yaitu `berlaku_sampai + 1` (Q-121).

**Sudah ada dan dipakai ulang:**

- Pengirim v66: `catatKejadian`/`catat_kejadian` (per kejadian, id
  deterministik), `catatHarian`/`catat_harian` (sekali per tanggal mulai jam
  WIB, `TELEGRAM_SQL_JAM_WIB`, `belumTercatat`), `antrekan` dengan
  `TELEGRAM_INSERT_ANTREAN_SQL`, klaim atomik, riwayat 30 hari.
  `app_telegram_setting` key/value tanpa CHECK pada `kunci`, `notifikasi_telegram.kejadian`
  sengaja tanpa CHECK: bidang dan kejadian baru tidak menyentuh skema.
- Kontrak: `hr_kontrak.tanggal_selesai`, `percobaan_selesai` (tersinkron);
  urutan "kontrak sah terakhir" persis `CERMIN_STATUS_SQL`
  (`validations/hris.ts:945`); status kini `STATUS_KINI_SQL` (`:937`).
- TMT: `master_data.tanggal_mulai_aktif` (alias `tmt` di `ORG_PEGAWAI_SQL`,
  `:322`).
- Pegawai keluar: `master_data.id_keluar` + `status_aktif`; pegawai ber-`id_keluar`
  tidak diingatkan.
- JP terdampak: `jp_terdampak` (`hr_pengajuan.rs:2478`, murni) ↔ `jpTerdampak`,
  `hitung_jp`/`hitungJp`, SQL `JP_TERDAMPAK_SQL`, `JADWAL_JP_SQL`,
  `PENANGANAN_SQL`, `LIBUR_SQL`. Desktop `jp_terdampak_baca` (`:2772`) membaca
  SQLite lokal; pemuat cloud untuk tanggal hari ini ditambahkan di
  `hr_pengingat.rs` dengan teks SQL yang sama.
- Cakupan dan pemutus: `dalam_cakupan` (`hr_pengajuan.rs:626`), `unit_akun`,
  `tautan` (id pegawai sesi), `izin_pemutus` per jenis pengajuan.
- Pengaturan HR: `desktop_hr_settings_save` (`hris.rs:1282`, `hr.org.manage`)
  dengan `validasi_angka_pengaturan`; `PENGATURAN_KONTRAK_SQL` membaca lima kunci.
- Semester: `akademik_tahun_ajaran.semester` (`Ganjil`/`Genap`),
  `tanggal_mulai`, `tanggal_selesai`.
- Kartu di dashboard: pola `TiltCard`/`SpotlightCard` di `app/dashboard/page.tsx`.

**Kait:**

- Gaji: KGB hanya pengingat; tindak lanjutnya `salary_configs` baru lewat layar
  gaji yang ada, rapel menangani tanggal berlaku yang sudah lewat (§12). Kode
  gaji tidak disentuh.
- Fase 5 Q-111: Telegram kinerja tidak termasuk; tidak ada kejadian kinerja.

### 24.2 Rancangan per kejadian dan kartu

#### 24.2.1 Aturan umum

- **Satu sumber.** `muat_pengingat(turso, hari_ini)` ↔ `muatPengingat(client,
  hariIni)` menjalankan SQL sumber §24.3 di cloud dan menghasilkan daftar
  `ItemPengingat { kejadian, id_karyawan, nama, jabatan, unit, tanggal, kunci }`
  lewat fungsi murni `pengingat(data, hari_ini, pengaturan)` ↔
  `pengingat(...)`. Telegram dan kartu memanggil pemuat yang sama; yang berbeda
  hanya penyaringnya (kartu: izin sesi; Telegram: sakelar).
- **Jendela, bukan tanggal persis.** Pengingat H-n dicatat bila
  `sisa = tanggal − hari_ini` (hari, WIB, bilangan bulat) jatuh di jendelanya.
  Jendela bertingkat tidak bertumpuk: kontrak H-30 = `7 < sisa ≤ 30`, H-7 =
  `0 ≤ sisa ≤ 7`. Setiap jendela dicatat sekali lewat id deterministik, jadi
  runner yang mati beberapa hari tetap mengirim jendela yang masih terbuka, dan
  Telegram yang baru dinyalakan tidak mengirim jendela yang sudah tertutup.
  Aturan "7 hari / `aktif_sejak`" v66 tidak dipakai untuk pengingat berjendela;
  ringkasan harian tetap memakai id per tanggal.
- **Jam catat.** Semua kejadian kepegawaian dicatat mulai **07.00 WIB**
  (`JAM_RINGKASAN_STOK` yang ada), kecuali ringkasan JP mulai **06.00 WIB**
  (`JAM_RINGKASAN_JP` baru, Q-124).
- **Pegawai yang diingatkan:** `master_data` bukan siswa (`PEGAWAI_SQL`),
  `status_aktif = 'Aktif'`, dan `COALESCE(id_keluar, '') = ''`.
- **Isi pesan:** label kejadian + tanggal jatuh tempo + baris `nama — jabatan —
  unit` (`master_data.nama`, `jabatan_status`, `unit`; kosong = `-`). Tidak
  pernah: NIK, gaji, rekening, alasan/jenis pengajuan, tingkat/isi SP, tanggal
  lahir. Pensiun hanya menyebut **bulan dan tahun** (Q-120). Setiap pesan dipotong
  `potong()` yang ada; daftar maksimal `MAKS_BARIS_STOK` (30) baris + "dan N
  lainnya".

#### 24.2.2 Sembilan kejadian

| Kejadian (`kejadian`) | Sumber | Jendela / kapan | Id deterministik | Kartu: izin sesi |
| :-- | :-- | :-- | :-- | :-- |
| `kontrak_berakhir` | kontrak sah terakhir berstatus GTT/PTT dengan `tanggal_selesai` | `7 < sisa ≤ 30`, lalu `0 ≤ sisa ≤ 7` | `ktr-30:<id_kontrak>`, `ktr-7:<id_kontrak>` | `hr.contract.manage` |
| `percobaan_berakhir` | kontrak sah terakhir dengan `percobaan_selesai` | `0 ≤ sisa ≤ 7` | `coba:<id_kontrak>` | `hr.contract.manage` |
| `kgb` | TMT + k×N tahun berikutnya, status kini GTY/PTY | `0 ≤ sisa ≤ 30` | `kgb:<id_karyawan>:<tanggal>` | `hr.contract.manage` |
| `pensiun` | `hr_profil.tanggal_lahir` + usia pensiun | `0 ≤ sisa ≤ 90` | `pensiun:<id_karyawan>:<tanggal>` | `hr.personal.view` |
| `dokumen_kedaluwarsa` | dokumen terbaru per (pegawai, jenis) | `0 ≤ sisa ≤ 30` | `dok:<id_dokumen>:<tanggal_kedaluwarsa>` | `hr.document.view` |
| `sp_berakhir` | SP tidak dicabut, `berlaku_sampai = hari_ini − 1` | hari H | `sp-akhir:<id_sp>` | `hr.warning.view` |
| `pengajuan_menunggu` | pengajuan Menunggu, `updated_at` > 2 hari | ringkasan harian | `pgj-tunggu:<tanggal WIB>` | dapat diputus sesi |
| `jp_tanpa_penanganan` | JP terdampak hari ini tanpa `hr_jp_penanganan` | ringkasan pagi | `jp-kosong:<tanggal WIB>` | `hr.substitute.manage` + cakupan |
| `sk_pembagian_tugas` | semester yang `tanggal_mulai`-nya dalam 7 hari | sekali per semester | `sk-tugas:<id_tahun_ajaran>` | `hr.duty.manage` |

Rincian:

- **Kontrak sah terakhir** = baris `hr_kontrak` bukan `Pembatalan`, tidak
  dibatalkan, urutan `tanggal_mulai DESC, id_kontrak DESC` tanpa saringan
  tanggal (salinan predikat `CERMIN_STATUS_SQL`). Perpanjangan yang sudah
  dicatat (mulai di masa depan) menjadi kontrak terakhir dan menghentikan
  pengingat kontrak lama. Kontrak yang sudah lewat tanpa perpanjangan tidak
  diingatkan lagi oleh Telegram; kartu menampilkannya **sampai 30 hari sesudah**
  `tanggal_selesai` dengan tanda "lewat" (Q-114).
- **Percobaan** memakai kontrak yang sama; kontrak baru tanpa `percobaan_selesai`
  menghentikannya.
- **KGB:** `tanggal = TMT + k × N tahun`, k terkecil ≥ 1 yang hasilnya ≥
  `hari_ini`. N = `hr_kgb_tahun` (bawaan 2, 1–5). Hanya status kini GTY/PTY
  (`STATUS_KINI_SQL` pada hari ini) (Q-116, Q-117). TMT kosong = tanpa pengingat.
  Aplikasi tidak mencatat "KGB sudah diproses"; setiap kelipatan N diingatkan
  sekali.
- **Pensiun:** `tanggal = tanggal_lahir + usia` (`hr_pensiun_usia`, bawaan 60,
  50–70). Satu angka untuk guru dan tendik (Q-118).
- **Tambah tahun** (KGB dan pensiun) di fungsi murni kembar `tambah_tahun`:
  29 Februari ke tahun bukan kabisat menjadi 28 Februari. Tidak memakai
  `date(..., '+N years')` SQLite (menjadi 1 Maret). Vektor memuat kasus ini.
- **Dokumen:** baris `hr_dokumen` dengan `tanggal_kedaluwarsa` terisi yang tidak
  punya baris lain sepegawai sejenis dengan `tanggal_kedaluwarsa` lebih akhir
  (dokumen pengganti menutup pengingat lama). Pesan menyebut nama jenis dokumen
  (`hr_dokumen_jenis.nama`, Q-119). Tanggal dalam id: menyunting tanggal memicu
  pengingat baru. Kartu juga menampilkan dokumen terbaru yang sudah lewat
  (`sisa < 0`) sampai diganti.
- **SP berakhir:** hari pertama `Berakhir` menurut `statusSp`; SP yang dicabut
  tidak diingatkan. Pesan tanpa tingkat dan tanpa isi: "Masa SP berakhir: nama —
  jabatan — unit" (Q-121).
- **Pengajuan menunggu:** `datetime(p.updated_at) < datetime('now', '-2 days')`
  (UTC, `updated_at` karena suntingan menggugurkan keputusan). Tanpa saringan
  tanggal pengajuan: pengajuan lampau yang belum diputus tetap memengaruhi
  absensi dan gaji. Pesan: jumlah + daftar `nama — jabatan — unit (N hari)`.
  Kartu: hanya pengajuan yang sesi boleh putus (izin pemutus jenis,
  `dalam_cakupan`, bukan diri sendiri), dari aturan `periksa_aksi` (`hr_pengajuan.rs:661`) yang ada.
- **JP tanpa penanganan:** `jp_terdampak` untuk `hari_ini` dikurangi id
  penanganan `jp:<pengajuan>:<tanggal>:<id_jadwal>`; hari libur otomatis kosong.
  Pesan per unit rombel: jumlah JP + guru yang izin (`nama — jabatan`). Kartu:
  hanya unit dalam cakupan sesi (`dalam_cakupan` atas unit rombel). Isinya
  sama dengan "Jam kosong hari ini" yang sudah ada; kartu menautkan ke
  `/jam-kosong`.
- **SK pembagian tugas:** baris `akademik_tahun_ajaran` dengan
  `0 ≤ tanggal_mulai − hari_ini ≤ 7`; pesan menyebut semester, tahun, tanggal
  mulai, dan unit yang punya rombel aktif di semester itu. Tanpa deteksi "sudah
  dibuat" (temuan 4, Q-123). Kartu menampilkannya dari H-7 sampai H+14.

#### 24.2.3 Kartu "Perlu perhatian"

- Satu komponen `components/kepegawaian/PerluPerhatianCard.tsx`, dipasang di atas
  tab `/kepegawaian` dan di `/dashboard`.
- Isi: satu baris per kejadian yang punya item (label, jumlah, sampai lima nama
  terdekat), tautan ke tab tujuan (Kontrak, rincian pegawai, Dokumen, SP,
  Pengajuan, `/jam-kosong`, Surat).
- Item disaring backend dari SESI (tabel §24.2.2); kartu tidak dirender bila
  tidak ada item atau sesi tidak memegang satu pun izin itu.
- Butuh koneksi: tanpa koneksi command mengembalikan `PESAN_LURING`; kartu
  menampilkan satu baris "Pengingat kepegawaian butuh koneksi" dan tautan Jam
  Kosong (yang bekerja luring) (Q-125).
- Web/Desktop saja (Q-126).

### 24.3 Model data dan sinkronisasi

**Tanpa tabel, kolom, rute sync, atau versi skema baru.**

- Pengaturan baru di `setting_gex_system` (tersinkron lewat outbox seperti kunci
  HR lain): `hr_kgb_tahun` (bawaan 2, 1–5), `hr_pensiun_usia` (bawaan 60, 50–70).
  `desktop_hr_settings_save` menjadi tujuh isian wajib; `PENGATURAN_KONTRAK_SQL`
  membaca tujuh kunci (teks kembar, diperiksa harfiah). Desktop lama yang
  menyimpan pengaturan hanya menulis lima kuncinya, jadi dua kunci baru tidak
  terhapus.
- Telegram: `grup:kepegawaian` dan sembilan `kirim:<kejadian>` di
  `app_telegram_setting` (KHUSUS CLOUD, key/value). `TELEGRAM_BIDANG` /
  `BIDANG` menjadi empat; `TELEGRAM_KEJADIAN` menjadi tujuh belas;
  `BIDANG_KEJADIAN` ↔ `bidang_kejadian` dan `LABEL_*` ikut.
- SQL sumber baru, kembar di `hr_pengingat.rs` ↔ `validations/hr-pengingat.ts`,
  teks diperiksa harfiah oleh `hr-pengingat.test.ts` (Desktop + salinan Mobile):

| SQL | Isi | Salinan harfiah dari |
| :-- | :-- | :-- |
| `PENGINGAT_PEGAWAI_SQL` | pegawai aktif tidak keluar: id, nama, jabatan, unit, TMT, status kini, `hr_profil.tanggal_lahir` | `PEGAWAI_SQL`, predikat `STATUS_KINI_SQL` |
| `PENGINGAT_KONTRAK_SQL` | kontrak sah terakhir per pegawai aktif, `tanggal_selesai`, `percobaan_selesai` | urutan dan predikat `CERMIN_STATUS_SQL` |
| `PENGINGAT_DOKUMEN_SQL` | dokumen terbaru per (pegawai, jenis) ber-`tanggal_kedaluwarsa` ≤ `?1 + 30` | — |
| `PENGINGAT_SP_SQL` | SP tidak dicabut dengan `berlaku_sampai` di `[?1 − 1, ?1 − 1]` | — |
| `PENGINGAT_PENGAJUAN_SQL` | pengajuan Menunggu > 2 hari + `izin_pemutus` jenis + unit pegawai | potongan `PENGAJUAN_AKTIF_ORANG_SQL` |
| `PENGINGAT_SEMESTER_SQL` | semester mulai dalam `[?1 − 14, ?1 + 7]` + unit rombel aktif | — |
| JP hari ini | `JP_TERDAMPAK_SQL`, `JADWAL_JP_SQL`, `PENANGANAN_SQL`, `LIBUR_SQL` | dipakai apa adanya |

  Setiap SQL daftar memakai komentar `-- batas:` (`audit:list-bound`). Tanggal
  pembanding selalu `?1` = hari ini WIB dari `HARI_INI_SQL` di cloud, tidak dari
  jam klien.
- Antrean: `notifikasi_telegram` seperti v66, pesan sudah dirakit saat dicatat.
- `PROMOTION_PLAN`: tanpa perubahan (tidak ada tabel baru).

### 24.4 Hak akses

**Tanpa izin baru**, jadi tanpa versi skema baru (§21.1 temuan 3).

- Konfigurasi Telegram tetap hanya Superadmin (v66).
- Kartu: setiap kejadian disaring dengan izin HR yang sudah membuka datanya
  (tabel §24.2.2), dinilai dari SESI di backend, Rust dan TS kembar
  (`saring_pengingat(sesi, items)` ↔ `saringPengingat`, divektor).
- Cakupan unit hanya untuk dua kejadian yang menyangkut aksi (pengajuan untuk
  diputus, JP untuk ditangani), sesuai §15.2; pengingat lain mengikuti aturan
  "melihat menurut izin biasa".
- Command kartu sendiri dijaga `require_any_permission` atas gabungan izin di
  tabel; sesi tanpa satu pun mendapat daftar kosong, bukan galat, supaya
  dashboard tidak menampilkan pesan galat.
- Gerbang lisensi yang ada berlaku otomatis lewat `require_any_permission` /
  `requireWebPermission`.

### 24.5 Command, rute, gateway, layar

| Lapisan | Tambahan |
| :-- | :-- |
| Command | `desktop_hr_attention` (baca cloud lewat `TursoClient`, `PESAN_LURING` tanpa koneksi); terdaftar juga di Mobile karena `commands.rs` disalin |
| Rute Web | `POST /api/kepegawaian/attention/query` |
| Gateway | fungsi `getPerluPerhatian()` di `gateways/hris.ts` yang ada |
| Diubah | `desktop_hr_settings_save` + rute `kepegawaian/settings` (7 isian); `telegram.rs` ↔ `services/telegram.ts` (`catat_kepegawaian`, `catat_harian_kepegawaian`, kejadian asing dilewati); `validations/telegram.ts` (bidang, kejadian, label, sembilan fungsi `pesan_*` kembar) |
| Layar | `PerluPerhatianCard` di `/kepegawaian` dan `/dashboard`; dua isian di pengaturan Kepegawaian; grup Kepegawaian dan sembilan sakelar di `NotifikasiTelegramCard` |
| Mobile | `sync-rust-modules.ts` + `hr_pengingat.rs`; `sync-frontend-lib.ts` + `validations/hr-pengingat.ts`; tanpa layar |

**Angka sebelum → sesudah Fase 6**

| Angka | Sebelum | Sesudah |
| :-- | :-- | :-- |
| Versi skema / sentinel | v71 / `-2047` | v71 / `-2047` |
| `REQUIRED_TABLE_COUNT` | 131 | 131 |
| Tabel snapshot | 81 | 81 |
| Rute kanonik sync | 145 | 145 |
| Permission | 131 | 131 |
| Command Desktop / Mobile | 429 / 434 | 430 / 435 |
| Rute Web (`route.ts`) | 319 | 320 |
| Bidang / kejadian Telegram | 3 / 8 | 4 / 17 |

### 24.6 Tidak dikerjakan

- Mencatat "KGB sudah diproses", "SK sudah dibuat", atau menutup pengingat dari
  kartu (butuh tabel atau kunci tulis baru; usulkan bila pengingat terasa
  berulang).
- Usia pensiun terpisah guru/tendik, aturan pensiun ASN (BUP per jabatan).
- Notifikasi WA atau email untuk kejadian kepegawaian; pesan pribadi ke pegawai.
- Kejadian kinerja, pelatihan, rekrutmen (Fase 5 Q-111, Fase 7).
- Kartu di Mobile; pengingat luring di Desktop.
- Perubahan gaji otomatis dari KGB.

### 24.7 Langkah per sub-fase dengan gerbang

Dua sub-fase, satu sesi per sub-fase. Setiap sub-fase berakhir dengan
typecheck, Biome, dan tes per berkas hijau; `bun run check` penuh oleh pemilik
sesudah semua fase HRIS.

**6a — Aturan, pemuat, kartu** (batas: kartu tampil di Web/Desktop):

| # | Langkah | Gerbang |
| :-- | :-- | :-- |
| 1 | Pengaturan `hr_kgb_tahun`, `hr_pensiun_usia`: `validasi_angka_pengaturan`, `PENGATURAN_KONTRAK_SQL` 7 kunci, `desktop_hr_settings_save` + rute 7 isian, isian layar | `cargo test hris` per nama; `hris.test.ts` (teks harfiah) |
| 2 | Aturan kembar `hr_pengingat.rs` ↔ `validations/hr-pengingat.ts`: `tambah_tahun`, `sisa_hari`, `jendela`, `tanggal_kgb`, `tanggal_pensiun`, `pengingat`, `saring_pengingat`; SQL §24.3 | vektor `hr-pengingat.vektor.json` Rust ↔ TS (29 Feb, jendela 30/7 bertingkat, perpanjangan mencatat, pembatalan kontrak, dokumen pengganti, SP dicabut, pegawai keluar, TMT kosong, cakupan unit, diri sendiri); `hr-pengingat.test.ts` teks harfiah; `audit:sql`, `audit:list-bound` |
| 3 | Pemuat cloud `muat_pengingat` ↔ `muatPengingat` (termasuk JP hari ini dari cloud) | `cargo test hr_pengingat` (`TursoClient::local_file`: data dan angka sama dengan tes TS); `services/hr-pengingat.test.ts` |
| 4 | Command `desktop_hr_attention` + rute + gateway + `PerluPerhatianCard` di `/kepegawaian` dan `/dashboard` | `audit:contract` (430 command Desktop, 320 rute Web); `tsc` + Biome; `audit:a11y`, `audit:ui-guard`, `audit:page-guard` |

**6b — Telegram `kepegawaian`** (batas: Fase 6 lengkap). Satu sesi; langkah
5–9 ditulis semua dulu, lalu satu putaran cek (CLAUDE.md, "cara kerja hemat
konteks"). Kolom "Isi tes" adalah kasus yang wajib ADA di tes, bukan perintah
per langkah.

| # | Langkah | Isi tes |
| :-- | :-- | :-- |
| 5 | Kejadian asing dilewati, tidak dibatalkan (temuan 1), Rust dan TS | kejadian asing tetap `Menunggu` |
| 6 | Bidang `kepegawaian`, sembilan kejadian, label, `BIDANG_KEJADIAN` ↔ `bidang_kejadian`, sembilan `pesan_*` kembar, `JAM_RINGKASAN_JP` | vektor pesan `telegram.vektor.json` (tidak memuat NIK/gaji/tingkat SP/jenis pengajuan; pensiun hanya bulan; potong 30 baris) |
| 7 | `catat_kepegawaian` (berjendela) dan ringkasan harian lewat `muat_pengingat`; id §24.2.2 | `local_file` Rust + `services/telegram.test.ts` data sama: dua siklus tidak menggandakan, jendela 30 lalu 7, runner mati 3 hari, Telegram dinyalakan di H-5 hanya mengirim H-7, sakelar mati tidak mencatat |
| 8 | `NotifikasiTelegramCard`: grup Kepegawaian + sembilan sakelar + catatan perbarui perangkat | — |
| 9 | `sync-rust-modules`, `sync-frontend-lib`, paragraf `references/18` "HRIS pengingat (Fase 6, tetap v71)", catatan "Sudah dibangun" | — |

Putaran cek Claude di akhir 6b: `tsc` + Biome berkas yang diubah,
`telegram.test.ts` dan `services/telegram.test.ts` sekali, satu
`cargo test telegram` Desktop, `audit:contract` (angka tetap 430/435 command,
131 permission, 145 rute, 81 snapshot). Pemilik: `jalankan-antislop` lalu
`jalankan-check` (termasuk `audit:a11y`, `audit:confirm`, `audit:schema`,
`cargo test` Mobile).

### 24.8 Pertanyaan untuk pemilik (Fase 6)

| No | Pertanyaan | Usulan | Alasan |
| :-- | :-- | :-- | :-- |
| Q-112 | Fase 6 **tanpa versi skema, tabel, atau izin baru** (kunci pengaturan dan Telegram key/value saja)? | Ya | Versi baru menghentikan sinkron perangkat lama; semua data yang dibutuhkan sudah ada |
| Q-113 | Kartu dan Telegram memakai **satu pemuat cloud** dan satu fungsi `pengingat`? | Ya | Isi kartu dan pesan tidak bisa berbeda; hanya penyaringnya (izin sesi vs sakelar) yang beda |
| Q-114 | Kontrak: H-30 dan H-7 sebagai **jendela bertingkat**; perpanjangan yang sudah dicatat menghentikan pengingat; kartu menampilkan kontrak yang lewat tanpa perpanjangan sampai 30 hari? | Ya | Jendela tahan runner mati; kontrak lewat tanpa perpanjangan perlu tetap terlihat, tetapi tidak perlu dikirim ulang ke grup |
| Q-115 | Hanya **GTT/PTT** untuk kontrak berakhir (Honorer tidak)? | Ya | §12 menyebut GTT/PTT; Honorer di sekolah biasanya tanpa kontrak bertanggal selesai. Bila Honorer punya tanggal selesai, tambahkan |
| Q-116 | KGB dihitung dari **TMT** (`tanggal_mulai_aktif`), bukan `tanggal_daftar`? | Ya | TMT adalah dasar masa kerja di SK; `tanggal_daftar` adalah tanggal data dimasukkan ke aplikasi |
| Q-117 | KGB hanya untuk **GTY/PTY**, N bawaan **2 tahun** (1–5)? | Ya | KGB PNS/PPPK diurus BKD; GTT/PTT/Honorer umumnya tanpa KGB yayasan. Dua tahun mengikuti pola PNS yang banyak ditiru yayasan |
| Q-118 | Usia pensiun **satu angka** untuk guru dan tendik, bawaan 60 (50–70)? | Ya | §12 menyebut satu angka; pemisahan guru/tendik bisa ditambah sebagai kunci `:guru|tendik` bila yayasan membedakannya |
| Q-119 | Pesan dokumen kedaluwarsa menyebut **nama jenis dokumen** (mis. "STR")? | Ya | Tanpa jenis, Kepegawaian harus membuka aplikasi untuk tahu dokumen mana; jenis bukan data pribadi |
| Q-120 | Pesan pensiun hanya menyebut **bulan dan tahun**, tidak tanggal? | Ya | Tanggal pensiun = tanggal lahir + 60 tahun, jadi tanggal persis membuka tanggal lahir ke grup |
| Q-121 | SP berakhir dikirim pada **hari pertama status `Berakhir`** (`berlaku_sampai + 1`), tanpa tingkat SP? | Ya | Mengikuti `statusSp` yang diturunkan; tingkat termasuk isi SP yang tidak boleh dikirim |
| Q-122 | Pengajuan menunggu dihitung dari **`updated_at`** (> 2 hari), tanpa jenis pengajuan di pesan? | Ya | Suntingan menggugurkan keputusan, jadi waktu tunggu dimulai dari suntingan terakhir; jenis (Sakit) bisa membuka alasan |
| Q-123 | SK pembagian tugas: pengingat **kalender** H-7 sebelum semester mulai, tanpa deteksi "sudah dibuat"; kartu H-7 sampai H+14? | Ya | Nomor SK tidak disimpan (§21); deteksi butuh kunci tulis baru. Bila pengingat ini dirasa mengganggu, opsi (b): tombol "Sudah dibuat" yang menulis `hr_sk_tugas:<id_tahun_ajaran>` |
| Q-124 | Ringkasan JP tanpa penanganan mulai **06.00 WIB**, kejadian lain mulai 07.00 WIB? | Ya | Jam pertama mulai sekitar 07.00; 06.00 memberi Guru Piket waktu menunjuk pengganti. Syaratnya ada perangkat yang login (scanner gerbang biasanya sudah) |
| Q-125 | Kartu Desktop **membaca cloud**, tanpa koneksi hanya satu baris "butuh koneksi" + tautan Jam Kosong? | Ya | Separuh data (profil, dokumen, SP) khusus cloud; membaca lokal untuk separuh lainnya berarti dua pemuat dan isi yang bisa berbeda. Jam Kosong luring sudah ada |
| Q-126 | Kartu **Web/Desktop saja**? | Ya | Q-35, Q-88, Q-108; Mobile sudah punya `/jam-kosong` |
| Q-127 | Sakelar kejadian kepegawaian **bawaan mati**, dan dinyalakan sesudah semua Desktop/Mobile diperbarui? | Ya | Perangkat lama membatalkan kejadian yang tidak dikenalnya (temuan 1); perbaikan di 6b hanya berlaku untuk perangkat yang sudah diperbarui |
| Q-128 | Pesan **per orang** untuk pengingat berjendela, **ringkasan** untuk pengajuan dan JP? | Ya | Jumlah pengingat per bulan di satu sekolah kecil; per orang memudahkan Kepegawaian menandai yang sudah ditangani di grup |
| Q-129 | Dua sub-fase **6a** (aturan + kartu) dan **6b** (Telegram), satu sesi per sub-fase? | Ya | Kartu sudah berguna tanpa Telegram; Telegram bergantung pada pemuat yang sama |

### 24.9 Penanda yang ditinjau pemilik

**Yang dirasakan pengguna:**

- Kartu "Perlu perhatian" di atas tab Kepegawaian dan di Dashboard (Web/Desktop,
  butuh koneksi); isinya berbeda per role sesuai izin.
- Grup Telegram keempat, **Kepegawaian**, dengan sembilan sakelar di Pengaturan
  Notifikasi Telegram (Superadmin).
- Dua isian baru di pengaturan Kepegawaian: siklus KGB (tahun) dan usia pensiun.
- Pengingat pensiun hanya muncul bila tanggal lahir di data pribadi terisi;
  KGB hanya bila TMT terisi dan status kini GTY/PTY; dokumen hanya bila tanggal
  kedaluwarsa diisi.

**Risiko data dan keputusan:**

- Sertifikat yang bisa kedaluwarsa harus dicatat sebagai **dokumen** berjenis,
  bukan di Sertifikasi (temuan 3).
- Pengingat SK pembagian tugas datang setiap semester walau SK sudah dibuat
  (Q-123).
- KGB diingatkan setiap kelipatan N tahun dari TMT tanpa melihat KGB yang
  benar-benar diberikan; TMT yang salah memberi tanggal yang salah.
- Grup Kepegawaian menerima nama pegawai yang SP-nya berakhir dan yang akan
  pensiun; anggota grup harus dibatasi ke petugas kepegawaian.
- Bila tidak ada perangkat yang login pada 06.00–07.00, ringkasan pagi terlambat
  sampai ada sesi.

**Perangkat:**

- Tanpa versi skema baru: perangkat lama tetap sinkron. **Perbarui semua
  Desktop dan Mobile sebelum menyalakan sakelar kepegawaian** (Q-127), karena
  pengirim versi lama membatalkan kejadian yang tidak dikenalnya.
- Pengaturan KGB/pensiun yang disimpan di Desktop terbaca cloud sesudah
  outbox terdorong.

### 24.10 Jawaban Fase 6 (19 Nov 2026)

Pemilik menyetujui semua usulan Q-112 sampai Q-129 apa adanya. Pengerjaan
dimulai dari 6a (§24.7) di sesi baru.

### 24.11 Sudah dibangun

**Sudah dibangun: sub-fase 6a** (19 Nov 2026). Tanpa versi skema, tabel,
kolom, rute sync, atau izin baru (tetap v71, sentinel `-2047`).

- **Langkah 1, pengaturan.** `hr_kgb_tahun` (`ATURAN_KGB` 2, 1–5 tahun) dan
  `hr_pensiun_usia` (`ATURAN_PENSIUN` 60, 50–70) di `hris.rs` ↔
  `validations/hris.ts`; `PENGATURAN_KONTRAK_SQL` membaca tujuh kunci;
  `desktop_hr_settings_save` dan rute `kepegawaian/settings` (lewat
  `pengaturanKontrakSchema` yang `.strict()`) tujuh isian; dua isian baru di
  tab Organisasi ("Siklus KGB", "Usia pensiun"). Vektor `angka` dan
  `validasi_angka` di `hris.vektor.json` memuat kedua aturan; `hris.test.ts`
  juga memeriksa harfiah `ATURAN_SP_MASA`, `ATURAN_KGB`, `ATURAN_PENSIUN`, dan
  dua kunci baru.
- **Langkah 2, aturan kembar** `desktop/hr_pengingat.rs` ↔
  `validations/hr-pengingat.ts`: `tambah_tahun`, `sisa_hari`, `jendela`
  (batas menaik, `[7, 30]` = H-7 lalu H-30 tanpa tumpang), `tanggal_kgb`,
  `tanggal_pensiun`, `pengingat`, `saring_pengingat`, `izin_kejadian`, dan
  enam SQL §24.3 (`-- batas:` di semuanya). `ItemPengingat` mendapat tiga
  isian di luar §24.2.1: `sisa` (hari, untuk "lewat"/urutan kartu),
  `keterangan` (jenis dokumen, rombel + jam, atau semester + tahun), dan
  `izin` (izin pemutus pengajuan). Item yang hanya untuk kartu (kontrak lewat
  sampai 30 hari, dokumen lewat yang belum diganti, SK H+1 sampai H+14)
  berkunci `""`, jadi pengirim 6b cukup melewati kunci kosong. Urutan: per
  kejadian (`KEJADIAN_PENGINGAT`) lalu tanggal, stabil terhadap urutan SQL.
  Vektor `hr-pengingat.vektor.json`: 29 Februari, jendela 30/7 dan batasnya,
  kontrak H-31 dan lewat 40 hari, TMT kosong, pegawai keluar (tidak ada di
  daftar pegawai), JP yang sudah ditangani dan JP hari lain, cakupan unit,
  diri sendiri, akun tanpa unit, izin pemutus besar. `hr-pengingat.test.ts`
  memeriksa teks SQL harfiah ke Desktop dan Mobile serta salinan predikat
  `PEGAWAI_SQL`, `STATUS_KINI_SQL`, `CERMIN_STATUS_SQL`, dan
  `PENGAJUAN_AKTIF_ORANG_SQL`.
- **Langkah 3, pemuat** `muat_pengingat` ↔ `muatPengingat` (cloud; JP hari ini
  dari `JP_TERDAMPAK_SQL`/`JADWAL_JP_SQL`/`LIBUR_SQL`/`PENANGANAN_SQL` yang
  sama; angka KGB/pensiun dari `PENGATURAN_KONTRAK_SQL`) dan `perlu_perhatian`
  ↔ `perluPerhatian` (unit akun dari cloud). Data uji `muat` di vektor dipakai
  `hr_pengingat_muat_cloud` (Rust, `TursoClient::local_file`) dan
  `services/hr-pengingat.test.ts` dengan hasil yang sama: perpanjangan yang
  sudah dicatat menutup kontrak lama, kontrak yang dibatalkan dilewati,
  dokumen pengganti menutup yang lama, SP dicabut, pengajuan Ditolak/Batal,
  pegawai ber-`id_keluar`, siswa, JP yang sudah ditangani, dan kartu kepala
  SMP yang hanya melihat JP unitnya.
- **Langkah 4, command dan layar.** `desktop_hr_attention`
  (`require_any_permission(IZIN_PENGINGAT)`; `DESKTOP_ACCESS_DENIED` →
  daftar kosong; tanpa koneksi `PESAN_LURING`) terdaftar di Desktop dan
  Mobile (`build.rs`, `lib.rs`, `capabilities/default.json`). Rute
  `POST /api/kepegawaian/attention/query`: `requireWebSession`, sesi tanpa
  izin kartu → daftar kosong, lalu `requireAnyWebPermission` (gerbang
  lisensi). Gateway `getPerluPerhatian()` di `gateways/hris.ts`.
  `components/kepegawaian/PerluPerhatianCard.tsx` di atas tab `/kepegawaian`
  (tautan mengganti tab) dan di `/dashboard` (tautan ke `/kepegawaian`,
  `/pengajuan`, `/jam-kosong`); tanpa koneksi satu baris + tautan Jam Kosong.

**Keputusan kecil yang diambil saat membangun** (tinjau bila tidak sesuai):

- JP tanpa penanganan di kartu juga membuang JP milik sesi sendiri, selaras
  dengan aturan "penanganan tidak pernah untuk JP sendiri" (§20).
- Kartu pensiun menulis "N hari lagi", tanpa tanggal.
- `/kepegawaian` belum punya tautan langsung ke tab (`?tab=`); dari Dashboard
  tautan membuka tab Daftar.

**Dikerjakan lebih awal dari 6b:** sinkron Mobile (`sync-rust-modules.ts`
mendaftarkan `hr_pengingat.rs`, `sync-frontend-lib.ts` dijalankan) dan
pendaftaran command Mobile, karena `hris.test.ts` dan `hr-pengingat.test.ts`
memeriksa salinan Mobile. Paragraf `references/18` tetap di langkah 9.

**Angka sesudah 6a:** `audit:contract` 430 command Desktop / 435 Mobile, 131
permission, 145 rute kanonik, 81 tabel snapshot; 320 `route.ts`.

**Gerbang yang dijalankan:** `tsc` (Desktop dan Mobile) dan Biome berkas yang
diubah; `bun test` per berkas `hris.test.ts`, `hr-pengingat.test.ts`,
`hr-pengajuan.test.ts`, `services/hr-pengingat.test.ts` (Desktop dan salinan
Mobile); `cargo test` per nama `hris_vektor` dan `hr_pengingat` (Desktop);
`audit:contract`, `audit:sql`, `audit:list-bound`, `audit:a11y`,
`audit:ui-guard`, `audit:page-guard`. Belum: `bun run check` penuh, suite
Rust penuh, `cargo test hr_pengingat` di Mobile (langkah 9), uji browser
kartu.

**Sudah dibangun: sub-fase 6b** (19 Nov 2026). Fase 6 lengkap; tetap v71,
tanpa tabel, kolom, rute sync, atau izin baru.

- **Langkah 5, kejadian asing.** `drainTelegram` ↔ `drain` hanya membaca
  baris `Menunggu` yang kejadiannya dikenal (`kejadian IN (...)` dari
  `TELEGRAM_KEJADIAN`/`KEJADIAN`), jadi kejadian versi lebih baru tetap
  `Menunggu` dan tidak menyumbat batch 20; penjaga `Object.hasOwn` /
  `bidang_kejadian` → `None` tetap melewatinya. Kejadian dikenal yang
  sakelarnya mati atau grupnya kosong tetap `Dibatalkan`.
- **Langkah 6, bidang dan pesan.** `TELEGRAM_BIDANG`/`BIDANG` empat,
  `TELEGRAM_KEJADIAN` = delapan v66 + `KEJADIAN_PENGINGAT` (Rust: daftar
  harfiah 17, tes memeriksa `KEJADIAN[8..] == KEJADIAN_PENGINGAT`),
  `BIDANG_KEJADIAN` ↔ `bidang_kejadian`, `LABEL_*`, `JAM_RINGKASAN_JP` = 6.
  Sembilan `pesan_*` kembar plus `baris_orang`; `antrean_kepegawaian` ↔
  `antreanKepegawaian` menyusun (id, kejadian, isi) dari `ItemPengingat`:
  kunci `""` dilewati, satu pesan per orang untuk enam kejadian berjendela,
  satu ringkasan per kunci untuk pengajuan, JP, dan SK. Vektor baru
  `telegram.vektor.json` (jam 08.00/06.00/05.00, sakelar mati, sebagian
  sakelar, 32 pengajuan dipotong 30 baris).
- **Langkah 7, pencatat.** `catatKepegawaian` ↔ `catat_kepegawaian` dipanggil
  di akhir `catatKejadian` dengan jam dari `TELEGRAM_SQL_JAM_WIB`; tanpa
  sakelar kepegawaian yang siap atau sebelum 06.00 pemuat tidak dijalankan.
  Tes `local_file` Rust (`telegram_kepegawaian_siklus`,
  `telegram_kepegawaian_muat`, `telegram_kejadian_asing_menunggu`) dan
  `services/telegram.test.ts` memakai data vektor yang sama: sakelar mati,
  jendela 30, siklus kedua, runner mati 3 hari lalu jendela 7, dinyalakan di
  H-5 hanya H-7, data `muat` 6a tanpa teks terlarang (tingkat SP, alasan,
  jenis, izin), 25 kejadian asing + satu dikenal yang dimatikan.
- **Langkah 8, layar.** `NotifikasiTelegramCard`: grup Kepegawaian ikut daftar
  grup (kisi dua kolom), sakelar dikelompokkan per grup, dan di grup
  Kepegawaian catatan "perbarui semua Desktop dan Mobile dulu".
- **Langkah 9.** `sync-rust-modules.ts` dan `sync-frontend-lib.ts` dijalankan;
  paragraf `references/18` "HRIS pengingat (Fase 6, tetap v71)" dan satu
  frasa bidang keempat di `references/17`.

**Keputusan kecil yang diambil saat membangun** (tinjau bila tidak sesuai):

- Ringkasan JP: satu baris per unit rombel, `• SMP: 3 JP, Ani — Guru; Cici — -`.
- Pesan per orang menyebut tanggal dan "N hari lagi"/"hari ini"; pensiun
  hanya "Desember 2026".
- Pemuat dijalankan setiap siklus runner selama ada sakelar kepegawaian yang
  menyala (sekitar sepuluh SELECT ke cloud); id deterministik membuat
  pencatatan ulang tidak berefek.

**Gerbang yang dijalankan:** `tsc` Desktop dan Mobile, Biome berkas yang
diubah, `bun test` `validations/telegram.test.ts` (16) dan
`services/telegram.test.ts` (15) Desktop, `cargo test telegram` Desktop (14),
`audit:contract` (430/435 command, 131 permission, 145 rute, 81 snapshot),
`audit:sql`, `audit:list-bound`. Belum: `bun run check` penuh, `cargo test`
Mobile, tes salinan Mobile, uji browser kartu dan sakelar.
