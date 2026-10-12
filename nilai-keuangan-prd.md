Sistem Manajemen Sekolah — PRD Nilai Akhir & Keuangan

Dua jalur kerja yang diputuskan bersama User pada 2026-10-12:

- **Jalur N (Nilai):** penyempurnaan `/nilai`, jenis penilaian dinamis, rekap nilai akhir berbobot (termasuk kehadiran), serta ekspor Excel/PDF.
- **Jalur K (Keuangan):** akuntansi berpasangan, kasbon karyawan yang dicicil lewat potong gaji, serta tagihan dan pembayaran siswa (SPP dan jenis lain yang diatur sekolah).

Dokumen ini adalah rancangan. Setiap fase tetap melewati alur `kerjakan-fitur-lintas-platform`: analisis kode yang disentuh, persetujuan User, lalu implementasi paritas TS+Rust dan gerbang kualitas penuh. Nama tabel, kolom, dan rute di bawah adalah usulan. Bila ternyata bertabrakan dengan kode, kodenya yang menang dan dokumen ini diperbarui.

    Kondisi saat dokumen ditulis (hitung ulang di kode sebelum mulai):
    CLIENT_SCHEMA_VERSION   38
    Tabel SNAPSHOT_TABLES   43
    Rute kanonik            95

---

## 1. Keputusan yang sudah diambil User

| # | Keputusan |
| --- | --- |
| 1 | Kurikulum **Merdeka**. |
| 2 | Aplikasi ini **pengolah nilai**. Rapor resmi dicetak e-Rapor Kemendikbud atau aplikasi rapor lain. Kita menghasilkan berkas untuk diimpor ke sana. |
| 3 | **LMS ditunda.** Fokus ke manajemen. |
| 4 | Jenis penilaian **dinamis** (CRUD di `/nilai`), masing-masing punya **bobot nilai akhir**. Kehadiran juga punya bobot. |
| 5 | Bobot berlaku untuk **seluruh sekolah**, totalnya wajib 100%. |
| 6 | Skor kosong pada penilaian yang ADA dihitung **0**, dengan peringatan sebelum ekspor. |
| 7 | Jenis yang tidak punya penilaian sama sekali di sebuah mapel **ditandai** ("Penjas: belum ada penilaian UH"), lalu bobotnya **dibagi ke jenis lain untuk mapel itu saja**. |
| 8 | Kehadiran dihitung **per hari**. Satu Alfa di mapel mana pun membuat hari itu tidak masuk, dengan catatan nama mapelnya. |
| 9 | Izin/Sakit/Dispensasi **di tengah hari** (anak sudah datang) tetap dihitung masuk. Sakit/Izin **seharian** dikeluarkan dari pembagi. Dispensasi seharian dihitung masuk. |
| 10 | Hari sekolah dalam seminggu diatur **per unit** (yayasan dengan lebih dari satu unit itu lazim). Tidak diisi ke `/holidays`. |
| 11 | Data keuangan **ikut sinkronisasi** (bekerja offline), dibatasi RBAC. |
| 12 | Nomor kuitansi **berurutan per perangkat**, setiap kuitansi berketerangan. |
| 13 | Semua transaksi keuangan **wajib masuk akuntansi berpasangan** dan selalu seimbang. |
| 14 | Pembayaran online (VA/QRIS) **ditunda**. |

---

## 2. Urutan fase

| Fase | Isi | Ubah skema? |
| --- | --- | --- |
| **N1** | `/nilai`: filter Jenis, pencarian peserta didik, "Semua rombel" + kolom Kelas | Tidak |
| **K1** | Fondasi akuntansi: bagan akun, jurnal, buku besar, neraca saldo | Ya |
| **K2** | Kasbon karyawan + cicilan potong gaji + jurnal payroll | Ya |
| **K3** | Tagihan & pembayaran siswa, kuitansi, tunggakan, lebih bayar | Ya |
| **N2** | Jenis dinamis, Hari Sekolah per unit, rekap nilai akhir, ekspor Excel/PDF | Ya |
| **K4** | Laporan keuangan, pengingat WA tagihan, tagihan di portal wali | Ya (CHECK `notifikasi_wa`) |
| **N3** | Ekspor format impor e-Rapor | Tidak (menunggu templat dari User) |

K1 wajib mendahului K2 dan K3. Setiap transaksi harus punya jurnal sejak hari pertama; kalau dibalik, transaksi lama tidak pernah punya jurnal dan pembukuan tidak pernah seimbang.

N2 tidak lagi menuntut semua perangkat diperbarui (lihat 4.1), jadi boleh dimajukan bila User menginginkannya.

---

## 3. N1 — Penyempurnaan `/nilai` (tanpa perubahan skema)

Kondisi saat ini: filter Tahun Ajaran, Semester, Rombel (wajib), Mapel. `list_assessments` (`desktop/grades.rs`) mewajibkan `id_rombel` dan sudah ber-`LIMIT 300`. Tabel daftar: Tanggal, Penilaian, Jenis, Mapel, Dinilai, Rata-rata, Aksi.

Lingkup:

1. **Filter Jenis** di daftar penilaian.
2. **Pilihan "Semua rombel".** `id_rombel` menjadi opsional di Rust dan TS. Saat aktif, **kolom Kelas** muncul. `LIMIT` wajib tetap ada (`audit:list-bound`).
3. **Pencarian peserta didik** di tabel input skor: menyaring baris berdasarkan nama/NIS di sisi klien, tanpa query baru.
4. Ketiganya di **Web/Desktop dan Mobile** (`mobile/src/app/nilai/page.tsx`). Gateway dan tipenya ikut `sync-frontend-lib.ts`, dan `grades.rs` ikut `sync-rust-modules.ts`.

Kriteria selesai: `bun run check` hijau; setiap `<select>` dan input baru berlabel fungsi (`audit:a11y`), misalnya "Filter jenis penilaian", bukan "Semua jenis".

---

## 4. N2 — Jenis dinamis, Hari Sekolah, rekap nilai akhir

### 4.1 Jenis penilaian dinamis tanpa membangun ulang tabel

Daftar lima jenis dikunci di empat tempat: CHECK `nilai_penilaian.jenis` (`db-migrations.ts`, `storage.rs` kedua workspace, `turso.rs`) dan `jenis_penilaian()` di `grades.rs`.

Membuang CHECK berarti membangun ulang tabel di tiga lapis. Lebih buruk lagi, perangkat yang belum diperbarui masih memegang CHECK lama dan akan menolak baris berjenis baru saat menarik data. Karena itu, pendekatannya:

- **Tabel tersinkron baru `nilai_jenis`**: `id_jenis` (TEXT PK), `nama`, `bobot` (INTEGER, persen), `urutan`, `is_aktif`, `created_at`, `updated_at`. Tanpa UNIQUE pada `nama`; keunikan dijaga di aplikasi.
- **Isian awal berid tetap** untuk kelima jenis lama (pola `payroll_seed::DEFAULT_RATE_IDS`), misalnya `jns-tugas`, `jns-uh`, `jns-praktik`, `jns-uts`, `jns-uas`, berbobot 0. Rekap menolak berjalan selama total bobot belum 100%.
- **Kolom baru `nilai_penilaian.id_jenis`** lewat `ALTER TABLE ADD COLUMN` (TS) + `ensure_column` (Rust), nullable. CHECK lama **dibiarkan**:
  - Penilaian berjenis bawaan menulis `jenis` = nama lamanya.
  - Penilaian berjenis buatan sekolah menulis `jenis = 'Tugas'` sebagai nilai warisan.
  - Perangkat lama tetap menerima barisnya. Perangkat lama yang menyunting baris itu tidak menyentuh `id_jenis`, karena kolom itu tidak ada di daftar `ON CONFLICT DO UPDATE` miliknya, sehingga `id_jenis` aman.
  - Harga yang diterima: perangkat lama menampilkan "Tugas" untuk jenis buatan sampai diperbarui.
- `id_jenis` NULL (baris lama, atau ditulis perangkat lama) **diturunkan dari `jenis`** ke id bawaan. Aturan ini dieja kembar TS/Rust dan diuji dengan vektor yang sama.
- **Bobot kehadiran** disimpan di setting tersinkron `nilai_bobot_kehadiran`. Validasi simpan: Σ bobot jenis aktif + bobot kehadiran = 100. Nilai yang tidak sah DITOLAK, tidak dinormalkan.
- CRUD jenis tersedia di `/nilai` (tab/modal "Pengaturan Jenis"). Jenis yang sudah dipakai penilaian tidak bisa dihapus, hanya dinonaktifkan.
- Rute kanonik baru: `grade-type/save`, `grade-type/delete`. Izin baru `grades.configure` (mengubah bobot mengubah nilai semua anak). Jangan dimasukkan ke paket bawaan operator; tentukan bersama User apakah masuk `SENSITIVE_MUTATION_PERMISSIONS`.

### 4.2 Hari Sekolah per unit

- Unit hidup di `akademik_unit`. Siswa terhubung lewat `master_data.unit`, yang menyimpan **nama** unit, bukan id; rename unit memperbaruinya di `academic.rs`.
- Disimpan sebagai **satu setting tersinkron** `hari_sekolah` (JSON), sehingga tidak ada perubahan skema:

  ```json
  { "bawaan": [1, 2, 3, 4, 5], "unit": { "<id_unit>": [1, 2, 3, 4, 5, 6] } }
  ```

  Angka hari: 1 = Senin s.d. 7 = Minggu, sama dengan Jadwal Mengajar (`academic.rs`). Siswa tanpa unit, atau unitnya tidak terdaftar, memakai `bawaan`.
- Validasi kembar TS/Rust: angka 1–7, tanpa duplikat, minimal satu hari. Tidak boleh masuk `DEVICE_LOCAL_SETTING_KEYS`, karena ini kebijakan sekolah.
- **Hanya untuk perhitungan siswa.** Scanner, Generate Alfa pegawai, dan payroll tidak membacanya. `/holidays` kembali khusus untuk libur sungguhan; mengisi Sabtu/Minggu ke sana mengubah perilaku scanner dan tarif lembur hari libur.

```
Hari efektif (siswa) = tanggal dalam rentang semester
                     − hari yang bukan Hari Sekolah unitnya
                     − tanggal aktif di tbl_hari_libur
```

**Temuan yang ikut diperbaiki:** `get_ledger_preview` (`desktop/attendance_ledger.rs`) menghitung `total_hari_efektif` sebagai `COUNT(DISTINCT tanggal) FROM absensi_harian` sepanjang **tahun ajaran**. Parameter `semester` tidak dipakai untuk rentang tanggal, dan tanggal yang hanya berisi scan pegawai (misalnya satpam hari Minggu) ikut terhitung hari efektif. Leger kehadiran wajib memakai definisi hari efektif yang sama dengan rekap nilai, supaya angka kehadiran di rapor dan di nilai akhir tidak berbeda. Periksa cermin TS-nya juga.

**Rentang semester:** `akademik_tahun_ajaran` hanya punya `tanggal_mulai`/`tanggal_selesai`. Cara menentukan batas Ganjil/Genap **belum diputuskan** (lihat bagian 9).

### 4.3 Aturan kehadiran untuk nilai akhir

Per siswa, per hari efektif:

| Keadaan hari itu | Hitungan |
| --- | --- |
| Scan gerbang ada, tidak ada Alfa di presensi mapel | **Masuk** |
| Scan gerbang ada, ada Alfa di satu mapel atau lebih (`BOLOS_DI_SEKOLAH`, `class_attendance.rs`) | **Tidak masuk**, catatan "Bolos: <mapel> (<tanggal>)" |
| Scan gerbang ada, Izin/Sakit/Dispensasi di mapel (pulang tengah hari) | **Masuk** |
| Tanpa scan, status harian Dispensasi | **Masuk** |
| Tanpa scan, status harian Izin atau Sakit | **Keluar dari pembagi** |
| Tanpa scan, Alfa atau tidak ada catatan sama sekali | **Tidak masuk** |

```
Kehadiran % = hari Masuk ÷ (hari efektif − hari Izin/Sakit seharian) × 100
```

Wajib memakai `GATE_SUMMARY_SUBQUERY` (multi-sesi, sanitasi `jam_masuk` kosong) dan predikat `jenis_personil` yang dinormalisasi. Definisi bolos memakai ulang query yang sudah ada, bukan ejaan kedua. Pembagi 0 (misalnya sakit sepanjang semester) menghasilkan kehadiran "—" dan bobot kehadiran dibagi ulang seperti 4.4b.

### 4.4 Rumus nilai akhir per siswa per mapel

```
rata_jenis  = Σ skor_ternormalisasi ÷ banyak penilaian jenis itu    (skor NULL = 0)
skor_ternormalisasi = skor ÷ nilai_maks × 100
nilai_akhir = Σ (rata_jenis × bobot_jenis) + (kehadiran% × bobot_kehadiran)   ÷ 100
```

a. **Skor kosong** pada penilaian yang ada → 0. Layar tetap menampilkan "Belum dinilai". Sebelum ekspor muncul peringatan: "N nilai kosong akan dihitung 0."

b. **Jenis tanpa penilaian** di mapel itu → rekap menandai "<Mapel>: belum ada penilaian <Jenis>", lalu bobotnya dibagi proporsional ke komponen lain yang ada untuk mapel itu saja:

   ```
   bobot_efektif_i = bobot_i × 100 ÷ Σ bobot komponen yang ada
   ```

   Bila tidak ada satu komponen pun, nilai akhir "—", bukan 0.

c. **Pembulatan:** dihitung penuh, dibulatkan **sekali** di akhir dengan `floor(x + 0.5)` (bukan `Math.round`/`f64::round`, pelajaran `face_match`). Rincian ditampilkan 2 desimal, nilai akhir bilangan bulat. Rumus dieja kembar Rust (`grades.rs` atau modul baru) dan TS, diuji dengan vektor yang sama, termasuk kasus pembagi 0.

d. **KKTP:** kolom `kkm` yang sudah ada dipakai apa adanya (dibekukan per penilaian). Label UI untuk Kurikulum Merdeka adalah **KKTP**. Kolom tidak di-rename.

### 4.5 Rekap & ekspor

- Tampilan rekap per rombel × mapel × semester: satu baris per siswa, kolom per jenis (rata-rata, bobot efektif, nilai berbobot), kehadiran (%, bobot, nilai berbobot, catatan bolos), total. Ada **pencarian peserta didik**.
- **Excel** memakai penulis yang sudah ada (`src/lib/client/xlsx.ts`, `saveWorkbook`), jadi tidak butuh dependensi baru.
- **PDF untuk HP:** WebView Android tidak punya dialog cetak, dan repo belum punya pustaka PDF. **Pemasangan dependensi wajib minta izin User dan dilaporkan** (memori `catat-setiap-pemasangan`). Calon: `jspdf` + `jspdf-autotable`. Berkas dibundel, tanpa CDN (offline-first). Penyerahan di Android lewat SAF (`android_fs_async`), bukan menulis ke `Download`. Di Desktop/Web, PDF yang sama atau `window.print()`.
- Rekap dihitung dari data lokal (Desktop/Mobile) atau cloud (Web). **Belum ada pembekuan** nilai akhir; ekspor mencantumkan waktu cetak. Pembekuan (analog `leger_kehadiran`) dipertimbangkan bersama N3.

---

## 5. Prinsip bersama Jalur K (keuangan)

Berlaku untuk K1–K4 tanpa kecuali:

1. **Saldo tidak pernah disimpan.** Saldo akun, sisa kasbon, dan tunggakan tagihan selalu dihitung dari baris transaksi (pola `inventory_saldo`). Kolom saldo yang ikut sync ditimpa siapa terakhir menang.
2. **Append-only.** Transaksi yang sudah diposting tidak diedit atau dihapus. Koreksi berupa transaksi pembalik berid deterministik (`'batal-' || id_asal`), sehingga pembatalan ganda dari dua perangkat menghasilkan PK yang sama dan cloud mengabaikannya (`ON CONFLICT DO NOTHING`).
3. **Cloud tidak pernah menolak karena aturan bisnis keuangan** (lebih bayar, saldo minus). Penolakan mengunci outbox (`next_retry_at = NULL`), padahal uangnya sudah berpindah tangan. Kejanggalan ditampilkan sebagai "perlu ditinjau".
4. **Validasi bentuk tetap di Rust SEBELUM menulis SQLite lokal** (enum = CHECK cloud, nominal > 0, panjang teks), supaya nilai cacat tidak pernah masuk outbox.
5. **Uang dalam rupiah bulat (`INTEGER`)** di database. Perhitungan persen/proporsi memakai `rust_decimal` di Rust dan aritmetika bilangan bulat di TS, diuji dengan vektor kembar. Tidak pernah `f64`/float JS.
6. **Tanpa UNIQUE selain PK, tanpa FOREIGN KEY** pada tabel tersinkron. PK TEXT buatan klien.
7. **Tanggal transaksi WIB** (`date('now','+7 hours')`), dihitung SQLite.
8. **Data tersalin ke setiap perangkat**, termasuk terminal pemindai (keputusan 11, risiko diterima User). RBAC membatasi tampilan, bukan isi disk. Jangan menyimpan data yang lebih sensitif dari yang perlu (misalnya alasan pribadi kasbon cukup "keterangan" singkat).

---

## 6. K1 — Fondasi akuntansi

### Tabel tersinkron

- `keu_akun`: `id_akun`, `kode`, `nama`, `kelompok` (CHECK: `Aset`, `Kewajiban`, `Aset Neto`/`Ekuitas`, `Pendapatan`, `Beban`), `saldo_normal` (`Debit`/`Kredit`), `id_induk` (opsional), `is_aktif`, `created_at`, `updated_at`.
  - Isian awal berid tetap (template akun sekolah) dari SATU berkas seed yang dipakai `storage.rs` dan `turso.rs`, pola `payroll_seed.rs`. Daftar id-nya wajib dikecualikan dari sync seperti `DEFAULT_RATE_IDS`.
  - Akun sistem yang dipakai jurnal otomatis (Kas, Bank, Piutang Karyawan, Piutang SPP, Pendapatan SPP, Beban Gaji, Utang PPh21, Utang BPJS, Titipan Wali) dikunci: bisa diganti nama, tidak bisa dihapus.
- `keu_jurnal` (header): `id_jurnal`, `tanggal`, `nomor` (lihat 8.1), `keterangan`, `sumber` (CHECK: `Manual`, `Kasbon`, `Payroll`, `Pembayaran`, `Tagihan`, `Pembatalan`), `id_sumber`, `id_jurnal_batal` (untuk pembalik), `dibuat_oleh`, `created_at`.
- `keu_jurnal_baris` (detail): `id_baris`, `id_jurnal`, `id_akun`, `debit` INTEGER ≥ 0, `kredit` INTEGER ≥ 0, `keterangan`. Tepat satu dari debit/kredit > 0.

### Aturan

- Σ debit = Σ kredit per jurnal, diperiksa di Rust dan TS sebelum menulis.
- **Satu jurnal = satu event outbox** (`journal/post`) yang membawa header + seluruh barisnya. Cloud menulisnya dalam satu batch, sehingga cloud tidak pernah memegang separuh jurnal. Pembatalan lewat `journal/reverse` (jurnal pembalik, `id = 'batal-' || id_jurnal`).
- Jurnal otomatis dari modul lain ditulis **dalam transaksi lokal yang sama** dengan transaksi sumbernya.
- Snapshot tabel tetap per tabel, jadi baris bisa tiba sebelum headernya. Semua laporan wajib `JOIN` ke header, sehingga baris yatim diabaikan sampai header tiba.
- Snapshot `keu_jurnal`/`keu_jurnal_baris` diberi `-- sengaja-utuh` (seperti `inventory_mutasi`): jendela waktu membuat saldo salah.
- Laporan K1: **buku besar per akun** dan **neraca saldo** per periode. Jurnal umum manual untuk transaksi di luar modul (misalnya bayar listrik).
- Izin: `accounting.view`, `accounting.manage` (akun + jurnal manual), `accounting.reverse` (**sensitif**).
- Tutup buku/kunci periode: **di luar K1**, tercatat di bagian 9.

---

## 7. K2 — Kasbon karyawan

Catatan istilah untuk UI: di pembukuan sekolah ini **Piutang Karyawan**. Di layar boleh tetap "Kasbon/Pinjaman Karyawan".

### Tabel tersinkron

- `keu_pinjaman`: `id_pinjaman`, `id_karyawan`, `pokok`, `cicilan_per_periode`, `tanggal_cair`, `mulai_potong` (periode), `keterangan`, `status` (CHECK: `Diajukan`, `Disetujui`, `Ditolak`, `Dibatalkan`), `disetujui_oleh`, `created_at`, `updated_at`.
- `keu_pinjaman_mutasi` (append-only): `id_mutasi`, `id_pinjaman`, `jenis` (CHECK: `Pencairan`, `Angsuran Gaji`, `Pelunasan Tunai`, `Pembatalan`), `jumlah`, `tanggal`, `id_ref` (misalnya id `payroll_items`), `id_jurnal`.
- `keu_pinjaman_tunda`: penundaan cicilan untuk satu periode tertentu (id deterministik `'tunda-' || id_pinjaman || periode`).

`Sisa = pokok − Σ (Angsuran Gaji + Pelunasan Tunai)`, selalu dihitung.

### Integrasi payroll

- Saat proses gaji dihitung, untuk setiap pinjaman `Disetujui` dengan sisa > 0, belum ditunda di periode itu, dan `mulai_potong` ≤ periode:

  ```
  potongan = min(cicilan_per_periode, sisa)
  ```

  Hasilnya masuk `breakdown_snapshot` sebagai potongan "Cicilan Kasbon" dan menambah `total_deductions`.
- **Gaji bersih tidak boleh negatif** (`payroll_items.net_salary` CHECK ≥ 0). Bila potongan membuatnya < 0, potongan dipotong sampai gaji bersih 0, sisanya terbawa ke periode berikutnya, dan slip menandainya.
- **Angsuran baru dicatat saat proses gaji berstatus `PAID`**, dengan id deterministik `'ang-' || id_payroll_item || '-' || id_pinjaman`, sehingga dua perangkat yang sama-sama memproses tidak mencatat dua kali. Jurnal payroll `PAID`:

  ```
  Beban Gaji (D) / Kas (K) + Utang PPh21 (K) + Utang BPJS (K) + Piutang Karyawan (K)
  ```

- **Wajib diverifikasi sebelum K2:** `src/app/api/payroll/runs/route.ts` dan `gateways/payroll.ts` menunjukkan Web punya jalur proses gaji sendiri. Bila Web menghitung gaji di TS, aturan potongan cicilan wajib dieja kembar dengan engine Rust (`desktop/payroll/engine.rs`) dan diuji dengan vektor yang sama. Periksa juga transisi status payroll: apa yang terjadi bila proses yang sudah `PAID` dibatalkan/ditolak.
- Mobile menjalankan payroll lewat command `desktop_*` yang sama (`payroll_admin/`), jadi tidak ada kalkulator kedua.

Izin: `loan.view`, `loan.manage` (ajukan, tunda, pelunasan tunai), `loan.approve` (**sensitif**: menyetujui atau membatalkan pencairan).

---

## 8. K3 — Tagihan & pembayaran siswa

### Tabel tersinkron

- `keu_jenis_tagihan`: `id_jenis_tagihan`, `nama` (SPP, Uang Gedung, Seragam, ...), `periodik` (CHECK: `Bulanan`, `Sekali`), `nominal_bawaan`, `id_akun_pendapatan`, `is_aktif`, plus nominal per unit/tingkat (tabel kecil `keu_tarif_tagihan`: `id_jenis_tagihan`, `id_unit`, `tingkat`, `nominal`).
- `keu_keringanan`: diskon per siswa per jenis (persen atau nominal, periode berlaku, alasan).
- `keu_tagihan`: `id_tagihan`, `id_siswa`, `id_jenis_tagihan`, `periode`, `nominal`, `potongan`, `jatuh_tempo`, `status` (CHECK: `Aktif`, `Dibatalkan`).
  - **Pembuatan massal ber-id deterministik** `'tgh-' || id_jenis_tagihan || '-' || id_siswa || '-' || periode`: dua perangkat yang membuat tagihan bulan yang sama menghasilkan PK yang sama, dan cloud mengabaikan yang kedua.
  - Nominal dibekukan saat dibuat (pola `kkm`); tarif yang berubah tidak mengubah tagihan yang sudah terbit.
- `keu_pembayaran` (kuitansi): `id_pembayaran`, `seri`, `nomor_urut`, `nomor` (tampilan), `id_siswa`, `tanggal`, `total`, `metode` (CHECK: `Tunai`, `Transfer`), `keterangan`, `status` (CHECK: `Sah`, `Dibatalkan`), `alasan_batal`, `id_jurnal`, `dicatat_oleh`, `created_at`.
- `keu_pembayaran_alokasi`: `id_alokasi`, `id_pembayaran`, `id_tagihan` (NULL = masuk Titipan Wali), `jumlah`. Satu kuitansi bisa melunasi beberapa tagihan, dan satu tagihan bisa dicicil beberapa kuitansi.

`Sisa tagihan = nominal − potongan − Σ alokasi dari pembayaran Sah`, selalu dihitung.

### 8.1 Nomor kuitansi berurutan per perangkat

```
KWT/<tahun>/<seri>/<nomor_urut 4 digit>      contoh: KWT/2026/TU1/0007
```

- **Seri** = kode pendek perangkat. Usul: tabel tersinkron kecil `keu_seri_perangkat` (`device_code` → `kode_seri` + nama ramah "Kasir TU"), diisi admin. Keunikan `kode_seri` dicek di aplikasi. Sebelum didaftarkan, seri bawaan = 4 karakter awal `device_code` (`license.rs`). Bentuk akhir dibahas dengan User di awal K3.
- **Nomor urut** = `MAX(nomor_urut) + 1` untuk seri milik perangkat itu, dihitung dari SQLite lokal. Kuitansi perangkat sendiri selalu ada di lokal, jadi urutannya benar walau offline, dan seri yang berbeda tidak pernah bentrok.
- Instal ulang Windows atau hapus data Android menghasilkan `device_code` baru, berarti seri baru. Itu benar: deret lama tidak pernah dilanjutkan oleh mesin lain.
- **Nomor tidak pernah dipakai ulang.** Kuitansi yang dibatalkan tetap ada dengan status `Dibatalkan` + alasan, sehingga deret tetap utuh untuk auditor.
- Pola yang sama dipakai nomor jurnal (`JU/<tahun>/<seri>/<nomor>`).

### 8.2 Pembayaran tercatat dua kali

Duplikat teknis (event terkirim ulang) sudah dicegah oleh PK buatan klien. Duplikat manusia ditangani tiga lapis:

1. **Saat input:** bila tagihan itu sudah punya pembayaran (cloud bila online, lokal bila offline), tampil peringatan "Sudah dibayar Rp... di <seri> pukul ..., tetap catat?".
2. **Setelah sinkron:** tagihan dengan Σ alokasi > sisa ditandai **"Lebih bayar"**. Pembayaran dengan siswa + tagihan + nominal sama pada tanggal sama dari seri berbeda ditandai **"Kemungkinan ganda"**. Keduanya masuk daftar tinjauan bendahara. Cloud tidak menolak (prinsip 5.3).
3. **Penyelesaian oleh bendahara:**
   - **Batalkan:** status `Dibatalkan`, jurnal pembalik, nomor tetap terpakai.
   - **Jadikan titipan:** alokasi dipindah ke Titipan Wali dan otomatis dipakai untuk tagihan berikutnya.
   - **Kembalikan:** jurnal kas keluar.

### Jurnal otomatis

```
Tagihan terbit:     Piutang SPP (D)  / Pendapatan <jenis> (K)
Pembayaran:         Kas/Bank (D)     / Piutang SPP (K)  [+ Titipan Wali (K) bila lebih]
Pembatalan:         jurnal pembalik
```

Kuitansi dicetak/dibagikan: Excel/PDF mengikuti keputusan pustaka PDF di N2; Mobile lewat SAF/share.

Izin: `billing.view`, `billing.manage` (jenis tagihan, tarif, keringanan, terbitkan tagihan), `billing.collect` (catat pembayaran), `billing.cancel` (**sensitif**).

---

## 9. Pertanyaan terbuka

| # | Pertanyaan | Dibutuhkan di |
| --- | --- | --- |
| 1 | Batas tanggal semester Ganjil/Genap: kolom baru di `akademik_tahun_ajaran`, setting, atau aturan tetap (Juli–Desember / Januari–Juni)? | N2 |
| 2 | `grades.configure` masuk `SENSITIVE_MUTATION_PERMISSIONS` atau tidak? | N2 |
| 3 | Persetujuan pustaka PDF (`jspdf` + `jspdf-autotable`) | N2 |
| 4 | Template bagan akun: standar laporan yayasan apa yang dipakai (misalnya ISAK 35 untuk entitas nonlaba)? Perlu dikonfirmasi ke User/akuntan sekolah. | K1 |
| 5 | Tutup buku / kunci periode: perlu kapan? | K1/K4 |
| 6 | Bentuk akhir kode seri perangkat (8.1) | K3 |
| 7 | Dana BOS tetap di luar (dilaporkan lewat ARKAS)? | K1 |
| 8 | Berkas templat impor e-Rapor dari sekolah | N3 |

---

## 10. Di luar lingkup

- LMS (materi, tugas, akun siswa).
- Pembayaran online (VA/QRIS/payment gateway).
- Pencetakan rapor resmi.
- Pembekuan nilai akhir (dipertimbangkan bersama N3).

---

## 11. Checklist setiap fase yang mengubah skema

Ikuti langkah 1–10 di `fase5.md` bagian 5, ditambah langkah 11–17 untuk tabel tersinkron di `fase6.md` bagian 5. Yang paling sering terlewat:

- `storage.rs` **kedua** workspace (tidak ikut `sync-rust-modules.ts`).
- `SNAPSHOT_TABLES` (`sync.rs`) = `SNAPSHOT_SOURCES` (`turso.rs`), paritas 100%.
- `CANONICAL_SYNC_ROUTES` + handler `apply_event_to_turso`.
- `CLOUD_MIRRORED_TABLES` di **kedua** `storage.rs` (klasifikasi pindah database). Data keuangan ikut dibuang saat pindah database sekolah.
- Pendaftaran command Mobile di **tiga** berkas: `lib.rs`, `build.rs`, `capabilities/default.json`. Modul Rust baru masuk `filesToSync`, dan komponen bersama masuk `filesToCopy` bila memang identik.
- Paket izin bawaan: `DEFAULT_ROLE_PERMISSIONS` ↔ `ADMIN_DEFAULT_EXCLUDED_PERMISSIONS` (`turso.rs`).
- Sentinel skema cloud Rust ikut dinaikkan (v34–v36 pernah lupa).
- Halaman baru: penjaga area (Mobile `router.replace`, bukan `redirect("/forbidden")`), `isSubmittingRef` di setiap aksi mutasi, label `a11y`, query ber-`LIMIT` atau berpenanda `-- sengaja-utuh`.
- Gerbang akhir: `bun run check` (termasuk cargo test), sekali di akhir.
