# PRD: Pembelian Barang Secara Cicilan

**Produk:** Manajemen Sekolah (Web, Desktop Tauri v2, Mobile Android Tauri v2)
**Versi dokumen:** 1.0 (final; keputusan §8 diambil User 28 Oktober 2026)
**Status:** Semua keputusan diambil, belum diimplementasikan. Implementasi tetap lewat alur `kerjakan-fitur-lintas-platform` (rencana teknis lalu persetujuan sebelum kode).
**Tanggal:** 28 Oktober 2026
**Dasar:** `inventaris-pengajuan-prd.md` (pengajuan pembelian v64, check lulus), `inventaris-lanjutan-prd.md` (jurnal pengadaan v62), pola kasbon K2 dan kuitansi K3b di ref 14.

    Kondisi saat dokumen ditulis (hitung ulang di kode sebelum mulai):
    CURRENT_SCHEMA_VERSION   64   (fitur ini = v65)
    Sentinel cloud Rust      -2040 (fitur ini = -2041)
    SUMBER_JURNAL            Manual, Kasbon, Payroll, Pembayaran, Tagihan, Inventaris, Pembatalan
    Akun bawaan terkait      akun-kas, akun-bank, akun-peralatan, akun-utang-usaha (2-1400),
                             akun-pendapatan-lain (4-1900), akun-beban-lain (5-1900)

Nama tabel, kolom, rute, dan kode akun di bawah adalah usulan. Bila bertabrakan dengan kode, kodenya yang menang dan dokumen ini diperbarui.

---

## 1. Latar belakang

Pengajuan pembelian (v64) menganggap setiap pembelian dibayar tunai: barang diterima, lalu dijurnal ke Kas atau Utang Usaha, selesai. Padahal sekolah juga membeli secara cicilan (laptop, proyektor, kendaraan, mebel), sering atas permintaan atasan atau bagian lain lewat Sarpras. Untuk pembelian seperti ini, saat ini tidak ada yang mencatat:

1. syarat cicilannya: DP, tenor, besar angsuran, kapan jatuh tempo;
2. sudah berapa yang dibayar, berapa yang tersisa, dan apakah ada angsuran yang telat;
3. berapa bunga yang sebenarnya dibayar sekolah;
4. denda keterlambatan dan potongan pelunasan, berikut alasannya.

Akuntansi menghitung semua itu di luar aplikasi. Neraca hanya memuat utang kalau jurnalnya dibuat manual satu per satu.

## 2. Tujuan

1. Sarpras bisa menandai sebuah pengajuan sebagai **Cicilan** dan mengisi syaratnya, supaya akuntansi bisa menghitung dulu sebelum ACC.
2. Setelah barang diterima, utangnya tercatat sebesar harga tunai, dan bunganya muncul sendiri sebagai selisih.
3. Setiap pembayaran (DP, angsuran, pelunasan dipercepat, denda) dicatat sekali dan langsung menjadi jurnal yang sudah dipisah antara pokok dan bunga.
4. Akuntansi selalu bisa melihat: angsuran ke berapa, total terbayar, sisa pokok, sisa bunga, angsuran berikutnya, dan yang menunggak.
5. Semuanya jalan offline di Desktop dan Mobile. Cloud tidak pernah menolak pembayaran.

### Di luar cakupan

- **Suku bunga dalam persen, anuitas, dan bunga efektif.** Bunga tidak pernah dihitung dari persen. Bunga = total yang dibayar − harga tunai (§4.1).
- **Denda otomatis berdasarkan aturan.** Denda dicatat manual, satu per satu, dengan keterangan.
- **Barang ditarik leasing, retur, putus kontrak, dan restrukturisasi jadwal.** Kontrak cukup ditutup beralasan, dan sisanya diselesaikan dengan jurnal manual (§3.7). Alurnya baru dibuat kalau kejadian nyatanya muncul.
- **Foto bukti transfer angsuran.** Yang disimpan cukup nomor referensi transfer berupa teks.
- **Pemberitahuan WhatsApp.** Pengingat jatuh tempo berupa tanda angka di tab.
- **Utang cicilan tanpa pengajuan** (misalnya renovasi). Kontrak selalu lahir dari pengajuan. Kebutuhan seperti itu bisa dibuat sebagai pengajuan berbarang Beban.
- **Cicilan atas penerimaan sebagian.** Pengajuan bercicilan wajib diterima penuh dalam satu penerimaan (§3.4).

---

## 3. Alur

```
Sarpras: Ajukan (cara bayar Cicilan + syarat) ──► Akuntansi: hitung, ACC/Tolak
   ──► Sarpras: Catat penerimaan PENUH + syarat final dari kontrak yang ditandatangani
         ├─ total bayar final ≤ yang di-ACC ──► kontrak Berjalan
         └─ total bayar final > yang di-ACC ──► Menunggu ACC ulang ──► Akuntansi: ACC ulang
   ──► Akuntansi: jurnal penerimaan (tab Dari Inventaris, kredit = Utang Cicilan)
   ──► Akuntansi: catat pembayaran (DP, angsuran, pelunasan, denda) ──► Lunas
```

### 3.1 Ajukan (Sarpras, `inventory.record`)

Formulir pengajuan v64 mendapat pilihan **Cara bayar: Tunai | Cicilan** (bawaan Tunai). Kalau yang dipilih Cicilan, muncul isian:

| Isian | Aturan |
|---|---|
| Kreditur | wajib, teks bebas (toko/leasing), maks 100 karakter |
| Nomor kontrak | opsional, maks 50 karakter, boleh diisi belakangan saat penerimaan |
| Uang muka (DP) | rupiah bulat ≥ 0, lebih kecil dari total pengajuan |
| Jadwal | **Berkala** atau **Manual** (§3.2) |

Layar langsung menampilkan hitungannya: harga tunai (= total pengajuan), DP, total angsuran, total bayar, dan **bunga = total bayar − harga tunai**.

Permintaan dari atasan atau bagian lain dicatat di `keperluan`/`catatan` yang sudah ada. Tidak ada kolom baru untuk itu.

### 3.2 Jadwal

- **Berkala**: tanggal jatuh tempo pertama, "setiap N Hari/Minggu/Bulan/Tahun" (N 1–365), tenor (1–360), dan nominal per angsuran. Sistem menyusun barisnya.
  - Bulan: tanggal mengikuti tanggal jatuh tempo pertama, dipotong ke akhir bulan bila bulannya lebih pendek. 31 Jan → 28/29 Feb → 31 Mar, selalu dihitung dari tanggal pertama, tidak berantai.
  - Tahun: 29 Feb jatuh ke 28 Feb di tahun bukan kabisat.
- **Manual**: baris diketik satu per satu (tanggal + nominal). Opsi ini untuk angsuran terakhir yang berbeda, masa tanpa angsuran di awal, atau jadwal yang tidak teratur. Pilihan Berkala bisa diubah menjadi Manual dengan isi yang sudah tersusun sebagai titik awal.

Validasi (§8 K): tenor 1–360, nominal setiap baris > 0, tanggal naik tajam (tidak boleh sama atau mundur), jatuh tempo pertama tidak sebelum tanggal pengajuan, total angsuran ≥ harga tunai − DP (bunga tidak boleh negatif), dan semua nominal ≤ `MAKS_NOMINAL`. Aturan susun dan validasinya dieja kembar `susun_jadwal`/`validate_syarat` ↔ `susunJadwal`/`validasiSyarat`, dengan vektor yang sama (termasuk 31 Jan dan 29 Feb).

### 3.3 Putuskan (Akuntansi, `accounting.manage`)

Tetap ACC/Tolak satu pengajuan utuh seperti v64. Bagian Menunggu persetujuan menampilkan ringkasan cicilannya (DP, tenor, total bayar, bunga, jadwal). ACC berlaku atas isi baris **dan** syarat yang dilihat akuntansi (§6.2). Total bayar yang di-ACC dibekukan di kontrak sebagai `total_disetujui`.

### 3.4 Penerimaan (Sarpras, `inventory.record`)

Penerimaan v64 dengan tiga tambahan untuk pengajuan Cicilan:

1. **Wajib penuh.** Semua baris harus diterima sejumlah yang di-ACC, dalam satu penerimaan. Penerimaan sebagian ditolak di perangkat.
2. **Syarat final.** Formulir menampilkan syarat yang di-ACC, dan Sarpras bisa menyesuaikannya dengan kontrak yang benar-benar ditandatangani (nomor kontrak, DP, jadwal). Harga tunai final = nilai barang yang diterima (harga sebenarnya).
3. **Aktivasi.**
   - Total bayar final ≤ `total_disetujui` → kontrak **Berjalan**.
   - Total bayar final > `total_disetujui` → kontrak **Menunggu ACC ulang**. Barang tetap masuk stok (sesuai keputusan v64 no. 4), tetapi pembayaran belum bisa dicatat sampai akuntansi meng-ACC ulang syarat finalnya (`accounting.manage`, atas sidik syarat yang dilihat, §6.2). Menolak ACC ulang tidak tersedia, karena barang sudah ada di rak dan kontrak sudah ditandatangani. Yang tersedia adalah ACC ulang atau tutup kontrak (§3.7).

Setelah aktif, syarat dibekukan dan tidak bisa diubah lagi.

Pengajuan Cicilan yang sudah di-ACC tetapi tidak jadi dibeli ditutup lewat Tutup pengajuan v64, dan kontraknya ikut berstatus **Dibatalkan**.

Mutasi hasil penerimaan bercicilan tidak bisa dibatalkan (`cancel_mutation`) setelah kontraknya punya pembayaran tak-dibatalkan. Diperiksa di perangkat, dengan pesan yang menyebut nomor kontraknya.

### 3.5 Jurnal penerimaan (Akuntansi, tab Dari Inventaris)

Tetap lewat `journal_post` Fase A, dengan satu perbedaan: untuk mutasi yang berasal dari pengajuan Cicilan, **akun kredit dikunci ke akun utang kontrak** (bawaan `akun-utang-cicilan`) dan tidak bisa dipilih. Debitnya tetap mengikuti tipe barang (Aset/Beban).

```
Aset Peralatan (D) 12.000.000  /  Utang Cicilan (K) 12.000.000
```

Pembayaran pertama (termasuk DP) baru bisa dicatat setelah semua mutasi penerimaan kontrak itu dijurnal. Dengan begitu Utang Cicilan tidak pernah berjalan tanpa sisi kreditnya. Tanggal pembayarannya tetap boleh mundur ke tanggal DP sebenarnya.

### 3.6 Catat pembayaran (Akuntansi, `accounting.manage`)

Tab **Cicilan** di Keuangan → pilih kontrak → "Catat pembayaran". Ada dua jenis:

**a. Bayar** (DP, angsuran, beberapa angsuran sekaligus, atau pelunasan)

| Isian | Aturan |
|---|---|
| Tanggal | boleh mundur, tidak setelah hari ini (WIB jam database), tidak sebelum tanggal pengajuan |
| Nominal dibayar | rupiah bulat ≥ 0 |
| Potongan | rupiah bulat ≥ 0, opsional; kalau > 0, **alasan wajib** (maks 150 karakter) |
| Akun bayar | `PilihAkunBayar` (Aset aktif, bawaan Kas) |
| Referensi | opsional, nomor transfer/kuitansi kreditur, maks 50 karakter |

Nominal + potongan harus > 0 dan tidak boleh melebihi sisa jadwal (diperiksa di perangkat, §6.3). Pembayaran tidak dicocokkan ke "angsuran ke-n" secara manual: uang dialokasikan ke jadwal mulai dari jatuh tempo terlama (§4.2).

**b. Denda**: tanggal, nominal > 0, **keterangan wajib** (misal "Denda telat angsuran ke-4, 5 hari"), akun bayar, dan referensi. Denda dicatat saat dibayar. Denda tidak mengurangi jadwal, dan denda yang belum dibayar tidak dilacak.

Setiap pembayaran memperoleh satu jurnal `jrn-<id_bayar>` bersumber **`Cicilan`** (§4.3), yang melewati gerbang tutup buku `tulis_jurnal_tx` ↔ `tulisJurnalTx` seperti jurnal lain.

**Pembatalan** (izin sensitif baru, §7.1): hanya untuk pembayaran tak-dibatalkan **yang terakhir** di kontrak itu, wajib beralasan. Pembatalan berupa baris pembatal plus `balik_jurnal_tx`. Membatasi ke yang terakhir menjaga pemisahan pokok/bunga pembayaran lain tetap sah, karena pemisahannya bergantung pada urutan (§4.2). Untuk membatalkan pembayaran yang lebih lama, batalkan dulu yang sesudahnya.

### 3.7 Tutup kontrak (izin sensitif baru)

Untuk barang yang ditarik, diretur, atau kontrak yang putus atau direstrukturisasi. Alasan wajib. Setelah ditutup, kontrak tidak menerima pembayaran baru, dan sisa utangnya dibereskan akuntansi dengan jurnal manual (atau, untuk restrukturisasi, lewat pengajuan Cicilan baru sebesar sisa pokok). Kontrak yang ditutup tidak bisa dibuka lagi.

### 3.8 Status kontrak (diturunkan, tidak disimpan)

| Status | Syarat (diperiksa berurutan) |
|---|---|
| Dibatalkan | pengajuannya Dibatalkan, Ditolak, atau ditutup sebelum diterima |
| Ditutup | `ditutup_pada` terisi |
| Draf | pengajuan masih Menunggu |
| Menunggu barang | pengajuan Disetujui, belum ada penerimaan |
| Menunggu ACC ulang | sudah diterima, total final > `total_disetujui`, belum di-ACC ulang |
| Lunas | tertutup ≥ total jadwal (DP + semua angsuran) |
| Menunggak | ada baris jadwal yang jatuh temponya sebelum hari ini dan belum tertutup penuh |
| Berjalan | selain itu |

"Tertutup" = jumlah nominal + potongan dari pembayaran jenis Bayar yang tidak dibatalkan (`TERTUTUP_CICILAN_SQL`, dieja kembar). Per baris jadwal, status Lunas/Sebagian/Belum/Terlambat diturunkan dengan mengisi baris dari yang terlama memakai nilai tertutup tadi.

---

## 4. Aturan hitung

### 4.1 Besaran kontrak

```
H  = harga tunai          = nilai barang yang diterima (sebelum penerimaan: total pengajuan)
DP = uang muka
TJ = total angsuran       = jumlah nominal baris jadwal (tanpa DP)
TB = total bayar          = DP + TJ
B  = bunga                = TB − H        (≥ 0, divalidasi)
```

DP disimpan sebagai **baris jadwal ke-0** (jatuh tempo = tanggal mulai kontrak, bunga 0), supaya alokasi DP dan angsuran memakai satu jalur.

### 4.2 Pemisahan pokok dan bunga (§8 D)

Bunga dibagi proporsional terhadap angsuran (bukan DP), dengan **pembulatan kumulatif** supaya jumlahnya selalu tepat B tanpa perlu menyimpan sisa pembulatan:

```
c0 = tertutup sebelum pembayaran ini, c1 = c0 + nominal + potongan
bunga_kum(c) = bulat_setengah_atas( min(max(c − DP, 0), TJ) × B / TJ )   (aritmetika bilangan bulat)
bunga_bagian = bunga_kum(c1) − bunga_kum(c0)
pokok_bagian = (c1 − c0) − bunga_bagian
```

Saat jadwal tertutup penuh, `bunga_kum` = B persis.

**Potongan** (diskon) lebih dulu mengurangi bunga, lalu sisanya mengurangi pokok:

```
bunga_diakui      = max(bunga_bagian − potongan, 0)
pendapatan_lain   = max(potongan − bunga_bagian, 0)
```

### 4.3 Jurnal

Sumber jurnal baru **`Cicilan`** (sebelum `Pembatalan` di `SUMBER_JURNAL`). CHECK `keu_jurnal.sumber` dibangun ulang di ketiga lapis, persis cara v62 menambah `Inventaris`. Itu termasuk memasang ulang indeks dan trigger dari `sqlite_master` setelah salin, dan menolak push perangkat lama lewat `assert_cloud_schema_compatible`. Label arus kas dan kelompoknya (operasi/investasi/pendanaan) ditentukan di rencana teknis, mengikuti cara `Inventaris` dipetakan.

| Kejadian | Debit | Kredit |
|---|---|---|
| Bayar | Utang Cicilan `pokok_bagian` + Beban Bunga `bunga_diakui` | akun bayar `nominal` + Pendapatan Lain-lain `pendapatan_lain` |
| Denda | Beban Denda `nominal` | akun bayar `nominal` |

Jurnal bayar seimbang karena konstruksinya: jumlah debit = `(c1 − c0) − min(potongan, bunga_bagian)` = jumlah kredit. Baris bernilai 0 dibuang. Disusun `susun_jurnal_cicilan` ↔ `susunJurnalCicilan` dengan vektor yang sama.

**Contoh** (H 12 jt, DP 2 jt, 10× 1,15 jt, B 1,5 jt):

| Pembayaran | c0 → c1 | Pokok | Bunga | Pendapatan lain |
|---|---|---|---|---|
| DP 2.000.000 | 0 → 2.000.000 | 2.000.000 | 0 | 0 |
| Angsuran 1.150.000 | 2.000.000 → 3.150.000 | 1.000.000 | 150.000 | 0 |
| ... (angsuran 2–6) | → 8.900.000 | | | |
| Pelunasan 4.200.000, potongan 400.000 | 8.900.000 → 13.500.000 | 4.000.000 | 200.000 (600.000 − 400.000) | 0 |

### 4.4 Akun

Tiga akun bawaan baru, ditanam lewat jalur akun bawaan yang sama (`akun-bawaan.json`). Database lama mendapatkannya lewat migrasi v65 tanpa mengubah akun yang sudah ada:

| id | Kode | Nama | Kelompok |
|---|---|---|---|
| `akun-utang-cicilan` | 2-1600 | Utang Cicilan | Kewajiban |
| `akun-beban-bunga` | 5-1500 | Beban Bunga | Beban |
| `akun-beban-denda` | 5-1600 | Beban Denda | Beban |

Kontrak menyimpan id akun utang, bunga, dan dendanya (bawaan tiga akun di atas, bisa dipilih saat ACC dari akun aktif dengan kelompok yang sama), supaya laporan lama tetap benar meskipun bawaannya berubah. Potongan yang melebihi bunga selalu masuk `akun-pendapatan-lain`.

---

## 5. Model data (schema v65)

### 5.1 `inventory_pengajuan`: kolom baru

```sql
cara_bayar TEXT NOT NULL DEFAULT 'Tunai' CHECK (cara_bayar IN ('Tunai', 'Cicilan'))
```

Masuk `ensure_column` Rust dan `ALTER TABLE` v65 TS. Baris lama otomatis Tunai.

### 5.2 `keu_cicilan` (masuk `SNAPSHOT_TABLES`)

```sql
CREATE TABLE IF NOT EXISTS keu_cicilan (
  id_cicilan TEXT PRIMARY KEY,               -- cil-<id_pengajuan>
  id_pengajuan TEXT NOT NULL,
  kreditur TEXT NOT NULL,
  nomor_kontrak TEXT,
  uang_muka INTEGER NOT NULL CHECK (uang_muka >= 0),
  pola TEXT NOT NULL CHECK (pola IN ('Berkala', 'Manual')),
  setiap INTEGER,                            -- N, hanya Berkala
  satuan TEXT CHECK (satuan IS NULL OR satuan IN ('Hari', 'Minggu', 'Bulan', 'Tahun')),
  id_akun_utang TEXT NOT NULL,
  id_akun_bunga TEXT NOT NULL,
  id_akun_denda TEXT NOT NULL,
  sidik_syarat TEXT NOT NULL,                -- §6.2
  total_disetujui INTEGER,                   -- TB saat ACC pengajuan
  diaktifkan_pada TEXT,                      -- saat penerimaan (syarat final dibekukan)
  disetujui_ulang_pada TEXT,
  disetujui_ulang_oleh TEXT,
  sidik_disetujui_ulang TEXT,
  ditutup_pada TEXT,
  ditutup_oleh TEXT,
  alasan_tutup TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 5.3 `keu_cicilan_jadwal` (masuk `SNAPSHOT_TABLES`)

```sql
CREATE TABLE IF NOT EXISTS keu_cicilan_jadwal (
  id_jadwal TEXT PRIMARY KEY,                -- <id_cicilan>-<ke>
  id_cicilan TEXT NOT NULL,
  ke INTEGER NOT NULL CHECK (ke >= 0),       -- 0 = DP
  jatuh_tempo TEXT NOT NULL,
  nominal INTEGER NOT NULL CHECK (nominal >= 0)
);
```

Baris jadwal diganti seluruhnya setiap syarat disimpan (selama Draf, dan sekali saat penerimaan), lalu beku setelah `diaktifkan_pada`. Pola penyimpanannya sama dengan baris pengajuan v64: baris berurutan lebih besar dihapus dan menyebar lewat tombstone, dan dilindungi `PendingGuard::induk_tertunda` selama event induknya tertunda.

### 5.4 `keu_cicilan_bayar` (masuk `SNAPSHOT_TABLES`, append-only)

```sql
CREATE TABLE IF NOT EXISTS keu_cicilan_bayar (
  id_bayar TEXT PRIMARY KEY,
  id_cicilan TEXT NOT NULL,
  jenis TEXT NOT NULL CHECK (jenis IN ('Bayar', 'Denda')),
  tanggal TEXT NOT NULL,
  nominal INTEGER NOT NULL CHECK (nominal >= 0),
  potongan INTEGER NOT NULL DEFAULT 0 CHECK (potongan >= 0),
  alasan_potongan TEXT,
  keterangan TEXT,
  referensi TEXT,
  id_akun_bayar TEXT NOT NULL,
  dicatat_oleh TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 5.5 `keu_cicilan_bayar_batal` (masuk `SNAPSHOT_TABLES`, append-only)

```sql
CREATE TABLE IF NOT EXISTS keu_cicilan_bayar_batal (
  id_bayar TEXT PRIMARY KEY,
  alasan TEXT NOT NULL,
  dibatalkan_oleh TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 5.6 Aturan bersama

- Tanpa UNIQUE selain PK. Tanpa kolom `status`, `sisa`, `terbayar`, atau `angsuran_ke`. Semuanya diturunkan.
- Kolom `*_oleh` diisi dari sesi. Payload yang membawanya ditolak (`.strict()` / `deny_unknown_fields`).
- `keu_cicilan_bayar` dan `keu_cicilan_bayar_batal` masuk `APPEND_ONLY_TABLES`. Keempat tabel masuk `TABEL_TUMBUH` dan ikut dibuang saat pindah database.
- DDL dieja identik di `storage.rs` (desktop dan mobile), `turso.rs`, dan `db-schema.ts`/`db-migrations.ts`. Sentinel cloud Rust `-2041`. `REQUIRED_TABLE_COUNT`, `isDatabaseSchemaReady`, `schema-consistency.test.ts`, dan daftar versi `rbac-migration.test.ts` diperbarui.

---

## 6. Sinkronisasi dan konflik

### 6.1 Rute

| Rute | Isi |
|---|---|
| `inventory-request/save` (diperluas) | header pengajuan + baris + kontrak + jadwal, satu event atomik |
| `inventory-request/approve` (diperluas) | membawa `sidik_disetujui` dan `sidik_syarat` yang dilihat |
| `inventory-receipt/create` (diperluas) | penerimaan + mutasi + syarat final + jadwal final, satu event |
| `installment/reapprove` | ACC ulang |
| `installment/close` | tutup kontrak |
| `installment-payment/create` | satu pembayaran, `ON CONFLICT DO NOTHING` |
| `installment-payment-cancel/create` | satu pembatalan, `ON CONFLICT DO NOTHING` |

### 6.2 Sidik syarat

`sidik_syarat` = SHA-256 bentuk kanonik syarat (kreditur, nomor kontrak, DP, pola, setiap, satuan, lalu baris jadwal urut `ke`; pemisah U+001F antar-kolom, U+001E antar-baris, sama dengan `sidik_baris`). Fungsinya dieja kembar `sidik_syarat` ↔ `sidikSyarat` dengan vektor yang sama.

- **ACC pengajuan** berlaku di cloud hanya bila `sidik_baris` **dan** `sidik_syarat` cloud sama dengan yang dilihat akuntansi. Suntingan syarat offline yang lebih dulu sampai menggugurkan ACC versi lama tanpa ada event yang ditolak, sama seperti v64.
- **ACC ulang** berlaku hanya bila `sidik_syarat` cloud = `sidik_disetujui_ulang` kiriman.
- `sidik_baris` v64 **tidak diubah**, supaya ACC pengajuan lama tetap sah.

### 6.3 Pembayaran dari dua perangkat (§8 E)

Cloud tidak pernah menolak pembayaran, pembatalan, atau tanggalnya, karena uangnya sudah keluar. Di perangkat, pembayaran ditolak bila nominal + potongan melebihi sisa jadwal, kontraknya belum Berjalan/Menunggak, atau jurnal penerimaannya belum ada. Dua perangkat offline yang sama-sama mencatat pelunasan akan menghasilkan tertutup > TB. Kontrak itu tampil di **Tinjauan** sebagai "lebih bayar", dengan bunga dibatasi B (rumus §4.2) dan kelebihannya mendebit Utang Cicilan. Koreksinya: batalkan pembayaran yang kembar.

Dua pembatalan dari dua perangkat atas pembayaran berbeda sama-sama diterima cloud. Aturan "hanya yang terakhir" hanya diperiksa di perangkat.

### 6.4 Waktu

Semua "hari ini", jatuh tempo, dan Menunggak memakai tanggal WIB jam database (`date('now','+7 hours')`).

---

## 7. Izin dan UI

### 7.1 Izin

| Aksi | Izin |
|---|---|
| Mengisi syarat cicilan, menerima barang dengan syarat final | `inventory.record` |
| Melihat tab Cicilan dan kartu kontrak | `accounting.view` |
| ACC/Tolak pengajuan (termasuk syarat), ACC ulang, catat pembayaran dan denda | `accounting.manage` |
| Membatalkan pembayaran, menutup kontrak | **`installment.cancel`** (baru, masuk `SENSITIVE_MUTATION_PERMISSIONS`, tidak ikut paket Admin) |

Aturan pemutus v64 juga berlaku untuk ACC ulang: pengaju tidak meng-ACC ulang kontraknya sendiri kecuali Superadmin (`validate_pemutus` ↔ `validatePemutus`). Sebelum implementasi, cek `DEFAULT_ROLE_PERMISSIONS`.

### 7.2 UI

- **Inventaris → tab Pengajuan** (`components/inventory/Pengajuan.tsx`): pilihan Cara bayar, isian syarat dengan ringkasan hitung langsung, syarat final di formulir penerimaan. Tanda **Cicilan** di daftar pengajuan.
- **Keuangan → tab Cicilan** (berkas baru `components/keuangan/CicilanWorkspace.tsx`, di `filesToCopy`):
  - daftar kontrak: kreditur, barang, sisa pokok, sisa bunga, angsuran berikutnya, status; saringan status;
  - **kartu kontrak**: syarat, jadwal per baris (Lunas/Sebagian/Belum/Terlambat), riwayat pembayaran dan denda beserta potongan dan alasannya, pembatalan;
  - **proyeksi kas keluar** 3 bulan ke depan (per bulan, dari sisa jadwal);
  - ekspor Excel daftar dan kartu kontrak (pola ekspor Keuangan yang ada);
  - tanda angka tab = kontrak Menunggak + angsuran yang jatuh tempo dalam 7 hari + kontrak Menunggu ACC ulang.
- **Keuangan → Tinjauan**: kontrak lebih bayar.
- **Inventaris → rincian barang**: tanda **Belum lunas** (barang → mutasi `id_ref` → baris → pengajuan → kontrak yang belum Lunas/Ditutup). Formulir Keluar dan afkir menampilkan peringatan, tanpa memblokir.
- Jalan di Web, Desktop, dan Mobile. Dialog memakai `<Modal>`, setiap isian berlabel, simpan dijaga `isSubmittingRef`, isian rupiah memakai pola isian jumlah yang ada (bukan `type="number"`). Dark mode sebagai dasar, light mode lewat `globals.css` / `data-theme`.

---

## 8. Keputusan

Diputuskan User pada 28 Oktober 2026.

| # | Pertanyaan | Keputusan |
|---|---|---|
| 1 | Cicilan khusus Inventaris atau Keuangan umum? | **Lahir dari pengajuan pembelian.** Permintaan atasan/bagian lain dicatat di keperluan/catatan. |
| 2 | Syarat diisi kapan? | **Saat pengajuan**, supaya akuntansi menghitung sebelum ACC. |
| 3 | Denda? | **Manual**, satu catatan per denda, dengan keterangan. |
| 4 | Pengingat? | **Tanda angka di tab**, tanpa WhatsApp. |
| 5 | Versi skema | **v65**, langsung di atas v64 yang sudah lulus check. |
| A | Syarat berubah antara ACC dan kontrak asli | Syarat final dikunci saat penerimaan. Total bayar > yang di-ACC → ACC ulang; sama/lebih kecil → langsung jalan. |
| B | Kapan utang lahir, DP | Utang = harga tunai saat penerimaan dijurnal. DP = pembayaran ke-0, bertanggal sebenarnya. Tanpa akun Uang Muka Pembelian. |
| C | Penerimaan sebagian | Pengajuan bercicilan wajib diterima penuh dalam satu penerimaan. |
| D | Pokok/bunga pada jadwal tidak rata | Proporsional, pembulatan kumulatif (§4.2), dieja kembar Rust ↔ TS. |
| E | Bayar dobel offline | Cloud menerima, Tinjauan menandai lebih bayar. Perangkat menolak bayar melebihi sisa. |
| F | Salah input pembayaran | Baris pembatal beralasan + jurnal pembalik, izin sensitif baru. |
| G | Ditarik/retur/putus kontrak | Ditunda. Tutup kontrak beralasan + jurnal manual. |
| H | Restrukturisasi | Ditunda. Tutup kontrak lama, buat pengajuan Cicilan baru sebesar sisa pokok. |
| I | Laporan | Daftar kontrak, kartu kontrak, proyeksi kas 3 bulan, ekspor Excel. |
| J | Foto bukti transfer | Tidak. Cukup nomor referensi. |
| K | Batas validasi | Tenor 1–360, nominal > 0, total jadwal ≥ H − DP, tanggal naik tajam. |

---

## 9. Kriteria penerimaan

1. Sarpras di HP offline mengajukan laptop Rp 12.000.000 bercicilan (DP 2 jt, setiap 1 Bulan, 10× Rp 1.150.000). Layar menampilkan total bayar Rp 13.500.000 dan bunga Rp 1.500.000. Setelah sync, akuntansi di Web melihat syarat dan jadwal yang sama.
2. Jadwal Berkala bulanan yang mulai 31 Januari jatuh tempo 28/29 Februari, 31 Maret, dan 30 April, sama di Rust dan TS.
3. Total angsuran yang membuat bunga negatif, tanggal manual yang mundur, atau tenor 361 ditolak di kedua sisi sebelum menulis apa pun.
4. Sarpras mengubah DP di HP offline sementara akuntansi meng-ACC versi lama di Desktop offline. Setelah sinkron, pengajuan kembali Menunggu, dan tidak ada event outbox yang gagal.
5. Penerimaan dengan jumlah kurang dari ACC ditolak untuk pengajuan Cicilan. Penerimaan penuh dengan syarat final sama atau lebih murah langsung membuat kontrak Berjalan. Kalau lebih mahal, kontrak menjadi Menunggu ACC ulang, dan pembayaran ditolak sampai ACC ulang.
6. Di tab Dari Inventaris, mutasi penerimaan bercicilan dijurnal dengan kredit Utang Cicilan yang tidak bisa diganti. Sebelum itu, "Catat pembayaran" ditolak dengan pesan yang jelas.
7. DP, enam angsuran, lalu pelunasan Rp 4.200.000 berpotongan Rp 400.000 (alasan "pelunasan dipercepat") menghasilkan jurnal sesuai contoh §4.3. Kontrak Lunas, dan total Beban Bunga = Rp 1.100.000.
8. Potongan yang melebihi sisa bunga membuat baris Pendapatan Lain-lain, dan jurnalnya seimbang.
9. Denda Rp 50.000 berketerangan masuk Beban Denda tanpa mengubah sisa jadwal.
10. Membatalkan pembayaran yang bukan terakhir ditolak. Membatalkan yang terakhir tanpa `installment.cancel` ditolak. Dengan izin itu, jurnalnya dibalik dan status kontrak kembali seperti sebelumnya.
11. Dua perangkat offline sama-sama mencatat pelunasan. Setelah sinkron, kontrak tampil lebih bayar di Tinjauan, dan tidak ada event yang ditolak.
12. Angsuran yang lewat jatuh tempo membuat kontrak Menunggak, dan tanda angka tab Cicilan bertambah. Pada pukul 00:30 WIB, tanggal "hari ini" sudah tanggal baru.
13. Barang dari kontrak yang belum lunas bertanda Belum lunas, dan formulir Keluar menampilkan peringatan.
14. Membatalkan mutasi penerimaan kontrak yang sudah punya pembayaran ditolak.
15. Pembayaran bertanggal di periode yang sudah ditutup buku ditolak oleh gerbang jurnal.
16. Event pembayaran yang terkirim dua kali tidak menggandakan apa pun. Perangkat lama yang belum v65 ditolak push-nya.
17. Migrasi v65 mempertahankan semua data lama di ketiga lapis (pengajuan lama = Tunai), dan `bun run check` hijau di kedua workspace.

## 10. Fase rilis

| Fase | Isi | Skema |
|---|---|---|
| **C** | Syarat di pengajuan, ACC atas sidik syarat, penerimaan penuh + syarat final + ACC ulang, jurnal penerimaan berkredit Utang Cicilan, pembayaran/denda/pembatalan/tutup kontrak, tab Cicilan, Tinjauan, tanda Belum lunas | v65 |

Implementasinya boleh dua langkah dalam satu skema, seperti v64: (1) tabel, sumber jurnal `Cicilan`, akun bawaan, syarat di pengajuan, dan ACC; (2) aktivasi saat penerimaan, pembayaran, laporan, dan tanda. Port ke `C:\dev\absensi-perusahaan` dikerjakan setelah check sekolah hijau, mengikuti pola port sebelumnya.
