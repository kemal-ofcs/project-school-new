# PRD: Pengajuan Pembelian Barang Inventaris

**Produk:** Manajemen Sekolah (Web, Desktop Tauri v2, Mobile Android Tauri v2)
**Versi dokumen:** 1.0 (final; keputusan §7 diambil User 28 Oktober 2026)
**Status:** Semua keputusan diambil, belum diimplementasikan. Implementasi tetap lewat alur `kerjakan-fitur-lintas-platform` (rencana teknis lalu persetujuan sebelum kode).
**Tanggal:** 28 Oktober 2026
**Dasar:** `inventory-prd.md` (v2.2, selesai) dan `inventaris-lanjutan-prd.md` (Fase A jurnal pengadaan v62, Fase B servis aset v63, keduanya selesai).

    Kondisi saat dokumen ditulis (hitung ulang di kode sebelum mulai):
    CURRENT_SCHEMA_VERSION   63
    Sentinel cloud Rust      -2039
    Izin inventaris          inventory.view, inventory.record, inventory.adjust,
                             inventory.manage, inventory.item.delete, inventory.column.delete
    Label QR                 INV:<id_barang> (barang), INV:<id_unit> (Aset per unit)

Nama tabel, kolom, dan rute di bawah adalah usulan. Bila bertabrakan dengan kode, kodenya yang menang dan dokumen ini diperbarui.

---

## 1. Latar belakang

Sekarang pembelian baru tercatat setelah barangnya datang, sebagai Masuk "Pengadaan". Langkah sebelumnya terjadi di luar aplikasi: petugas Sarpras meminta izin membeli lewat kertas atau chat, akuntansi menyetujui secara lisan, dan tidak ada yang mencatat:

1. barang apa yang diminta, berapa, dan berapa perkiraan harganya;
2. siapa yang menyetujui, kapan, atau kenapa ditolak;
3. apakah barang yang datang sama dengan yang disetujui (jumlah kurang, harga naik);
4. bukti bahwa barangnya benar-benar sudah ada di gudang.

Akuntansi baru tahu ada pembelian saat barisnya muncul di tab **Dari Inventaris** (Fase A), dan saat itu tidak punya apa pun untuk dibandingkan.

## 2. Tujuan

1. Setiap pembelian barang punya pengajuan tertulis (nama barang, jumlah, satuan, harga satuan, total) sebelum uangnya keluar.
2. Akuntansi menyetujui atau menolak di aplikasi, dan penolakan selalu beralasan.
3. Penerimaan barang di gudang dicatat sekali, dengan foto. Catatan itu langsung menjadi Masuk Pengadaan di stok dan baris di tab Dari Inventaris, tanpa diketik ulang.
4. Selisih antara yang disetujui dan yang diterima selalu terlihat oleh akuntansi.
5. Barang yang baru diterima bisa langsung dicetakkan label QR untuk ditempel di barang atau kardusnya.
6. Semuanya jalan offline di Desktop dan Mobile, dan cloud tidak pernah menolak event karena stok, tanggal, atau jumlah.

### Di luar cakupan

- **Label QR per batch/kardus.** Label tetap per barang (Habis Pakai, Aset tanpa unit) atau per unit (Aset per unit). Sepuluh kardus Habis Pakai mendapat sepuluh label yang sama, dan memindainya membuka barangnya, bukan batch-nya. Label per batch menjadi fase terpisah bila dibutuhkan (§7 no. 7).
- **Pemberitahuan WhatsApp** ke akuntansi atau Sarpras (§7 no. 8). Pemberitahuannya cukup tanda angka di tab.
- **Pembayaran ke toko, uang muka, dan utang usaha.** Penjurnalan tetap lewat tab Dari Inventaris seperti Fase A.
- **Anggaran/plafon per sumber dana.** Pengajuan tidak dibandingkan dengan anggaran.
- **Permintaan barang oleh guru/staf** dan **foto barang di data master.** Tetap ditunda (keputusan 26 Oktober 2026). Foto di PRD ini hanya bukti penerimaan.
- **Ekspor Excel dan cetak dokumen pengajuan.** Bisa ditambah nanti dari data yang sama.

---

## 3. Alur

```
Sarpras: Ajukan ──► Akuntansi: ACC ──► Sarpras: beli ──► Sarpras: Catat penerimaan + foto ──► stok + tab Dari Inventaris
                 └► Akuntansi: Tolak (alasan) ──► Sarpras: "Salin jadi pengajuan baru"
```

### 3.1 Ajukan (Sarpras, `inventory.record`)

1. Tab **Pengajuan** di halaman Inventaris → "Pengajuan baru".
2. Isian header: tanggal (bawaan hari ini WIB, tidak boleh setelah hari ini), keperluan (wajib, teks bebas, misal "ATK semester ganjil"), sumber dana (opsional, isian yang sama dengan Masuk), catatan.
3. Baris (minimal 1, maksimal `MAKS_BARIS_PENGAJUAN` = 100):
   - **Barang yang sudah ada** (pilih dari daftar barang aktif): nama dan satuan terisi dari barang dan tidak bisa diubah, **atau**
   - **Barang baru** (ketik nama dan satuan): barangnya belum dibuat, baru dibuat saat penerimaan (§3.3).
   - Jumlah (> 0, mengikuti `desimal` barang bila barangnya sudah ada; barang baru selalu bulat sampai dibuat), harga satuan perkiraan (≥ 0, rupiah bulat).
   - Total baris = jumlah × harga satuan (memakai aturan `NILAI_MUTASI_SQL` untuk barang desimal), total pengajuan = jumlah total baris. **Total tidak disimpan**, selalu dihitung.
4. Nomor: `PGJ/<tahun tanggal>/<seri>/<0001>`, seri dari `seri_perangkat` (Web `WEB`), pola nomor jurnal K1. Nomor kembar dari dua perangkat offline hanya ditandai `nomor_ganda`.
5. Selama **Menunggu**, Sarpras boleh mengubah seluruh isi atau membatalkan (wajib alasan).

### 3.2 Putuskan (Akuntansi, `accounting.manage`)

1. Tab **Dari Inventaris** di Keuangan mendapat bagian **Menunggu persetujuan**: daftar pengajuan dengan rincian baris dan totalnya.
2. **ACC**: seluruh pengajuan disetujui apa adanya (§7 no. 2). Catatan persetujuan opsional.
3. **Tolak**: wajib alasan. Sarpras melihat alasannya dan bisa menekan **"Salin jadi pengajuan baru"**, yang membuka formulir Ajukan berisi baris yang sama.
4. Keputusan bersifat final. ACC tidak bisa dicabut. Bila pembelian ternyata tidak jadi, Sarpras menutup pengajuan (§3.4).

### 3.3 Catat penerimaan (Sarpras, `inventory.record`)

Hanya untuk pengajuan **Disetujui** atau **Diterima sebagian**.

1. "Catat penerimaan" membuka formulir berisi semua baris yang belum lengkap. Per baris:
   - jumlah diterima (boleh 0 atau kosong bila belum datang; total semua penerimaan per baris tidak boleh melebihi jumlah yang di-ACC);
   - harga satuan sebenarnya (bawaan harga pengajuan, boleh diubah);
   - tempat, kondisi, tanggal kedaluwarsa bila barangnya `bisa_expired`, nomor seri bila Aset per unit (mengikuti formulir Masuk yang ada);
   - **barang baru**: tipe (Aset/Habis Pakai), kategori, dan pilihan desimal diisi di sini. Nama dan satuan dari pengajuan, boleh dirapikan. Barang dibuat lewat `save_item` ↔ `simpanBarang` di transaksi yang sama. Penerimaan berikutnya untuk baris yang sama memakai barang yang sudah dibuat (diturunkan dari mutasi pertama baris itu), tidak membuat barang kedua.
2. Tanggal penerimaan (bawaan hari ini WIB, tidak sebelum tanggal ACC, tidak setelah hari ini) dan catatan.
3. **Foto: wajib minimal 1, maksimal `MAKS_FOTO_PENERIMAAN` = 5** (§7 no. 6). Diambil dari kamera atau galeri, dikompres ke JPEG lewat `lib/client/image-optimizer.ts`, maksimal 2 MB per foto (batas foto absensi).
4. Simpan = **satu transaksi**:
   - satu baris `inventory_penerimaan` (header penerimaan) + fotonya;
   - satu Masuk `Pengadaan` per baris yang jumlahnya > 0, ditulis lewat `record_mutation_tx` ↔ `recordMutationTx` (Aset per unit tetap satu baris per unit, sesuai aturan v37). Isinya: `harga_satuan` sebenarnya, `sumber_dana` dari pengajuan, `nomor_dokumen` = nomor pengajuan, `id_ref` = `id_baris` pengajuan, id mutasi `<id_penerimaan>-<urut>` (deterministik terhadap penerimaan, sehingga event yang terkirim dua kali tidak menggandakan stok).
5. Setelah tersimpan, layar menawarkan **"Cetak label QR"** (Web/Desktop) yang membuka `LabelQr` dengan barang dan unit dari penerimaan ini sudah terpilih. Jumlah label bawaan Habis Pakai/Aset tanpa unit = jumlah diterima (dibatasi `MAKS_LABEL_PER_BARANG`), Aset per unit = satu per unit baru.
6. Mutasinya berperilaku seperti Masuk Pengadaan biasa: muncul di stok, kartu stok, Rekap Pengadaan, dan daftar Belum dijurnal. Membatalkannya memakai `cancel_mutation` (izin `inventory.adjust`), dan jumlah diterima baris itu ikut berkurang karena diturunkan.

> **Perlu dicek di rencana teknis:** `validate_mutation` ↔ `validasiMutasi` sekarang mengosongkan `id_ref` untuk alasan selain Pengembalian (`validations/inventory.ts` sekitar baris 540–581). Penerimaan harus mengisi `id_ref` setelah validasi, di service, tidak dari payload. Pastikan juga tidak ada pembaca `id_ref` lain yang menganggap Masuk Pengadaan ber-`id_ref` sebagai pengembalian.

### 3.4 Tutup pengajuan (Sarpras, `inventory.record`)

Untuk pengajuan **Disetujui** atau **Diterima sebagian** yang sisanya tidak akan datang (stok toko habis, tidak jadi membeli). Wajib alasan. Setelah ditutup, penerimaan baru ditolak. Penerimaan yang sudah ada tidak berubah.

### 3.5 Laporan untuk akuntansi

Di tab **Dari Inventaris**, setiap penerimaan tampil dengan:

- nomor pengajuan, tanggal ACC, tanggal terima, pencatat;
- per baris: jumlah dan harga di-ACC vs diterima, total di-ACC vs total diterima;
- tanda **selisih** bila harga satuan berbeda dari yang di-ACC atau baris belum diterima penuh, plus tanda **melebihi ACC** (§5.3);
- foto (dibuka besar saat diketuk). Foto yang belum terkirim dari perangkat pencatat ditampilkan "Foto belum terkirim dari perangkat pencatat".

Baris mutasi dari penerimaan di daftar Belum dijurnal membawa tautan "Lihat penerimaan" ke laporan ini, sehingga bendahara memeriksa foto dan selisih sebelum menjurnal (§7 no. 4).

### 3.6 Status (diturunkan, tidak disimpan)

| Status | Syarat (diperiksa berurutan) |
|---|---|
| Dibatalkan | `dibatalkan_pada` terisi |
| Ditolak | `ditolak_pada` terisi |
| Menunggu | `disetujui_pada` kosong |
| Selesai | `ditutup_pada` terisi, **atau** setiap baris sudah diterima penuh |
| Diterima sebagian | ada penerimaan, belum semua baris penuh |
| Disetujui | belum ada penerimaan |

"Diterima" per baris = jumlah Masuk tak-dibatalkan ber-`id_ref` = `id_baris` (`DITERIMA_BARIS_SQL`, dieja kembar Rust ↔ TS). Pola status turunan sama dengan kasbon, rapel, dan servis.

---

## 4. Model data (schema v64)

### 4.1 `inventory_pengajuan` (masuk `SNAPSHOT_TABLES`)

```sql
CREATE TABLE IF NOT EXISTS inventory_pengajuan (
  id_pengajuan TEXT PRIMARY KEY,
  nomor TEXT NOT NULL,
  tanggal TEXT NOT NULL,
  keperluan TEXT NOT NULL,
  sumber_dana TEXT,
  catatan TEXT,
  sidik_baris TEXT NOT NULL,           -- §5.2
  diajukan_oleh TEXT NOT NULL,
  disetujui_pada TEXT,
  disetujui_oleh TEXT,
  sidik_disetujui TEXT,                -- sidik_baris yang dilihat akuntansi saat ACC
  catatan_persetujuan TEXT,
  ditolak_pada TEXT,
  ditolak_oleh TEXT,
  alasan_tolak TEXT,
  dibatalkan_pada TEXT,
  alasan_batal TEXT,
  ditutup_pada TEXT,
  ditutup_oleh TEXT,
  alasan_tutup TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 4.2 `inventory_pengajuan_baris` (masuk `SNAPSHOT_TABLES`)

```sql
CREATE TABLE IF NOT EXISTS inventory_pengajuan_baris (
  id_baris TEXT PRIMARY KEY,
  id_pengajuan TEXT NOT NULL,
  urutan INTEGER NOT NULL,
  id_barang TEXT,                      -- NULL = barang baru
  nama_barang TEXT NOT NULL,
  satuan TEXT NOT NULL,
  jumlah INTEGER NOT NULL CHECK (jumlah > 0),          -- ×100 bila barangnya desimal
  harga_satuan INTEGER NOT NULL CHECK (harga_satuan >= 0)
);
```

Header dan seluruh barisnya = **satu event outbox** (`inventory-request/save`), diterapkan atomik di cloud seperti jurnal (`cloud_journal_statements`). Mengubah pengajuan mengganti seluruh barisnya. Snapshot baris `delete_missing: true` per pengajuan, atau baris lama dibuang di event yang sama (rencana teknis memilih yang sesuai `sync.rs`).

### 4.3 `inventory_penerimaan` (masuk `SNAPSHOT_TABLES`, append-only)

```sql
CREATE TABLE IF NOT EXISTS inventory_penerimaan (
  id_penerimaan TEXT PRIMARY KEY,
  id_pengajuan TEXT NOT NULL,
  tanggal TEXT NOT NULL,
  catatan TEXT,
  jumlah_foto INTEGER NOT NULL CHECK (jumlah_foto BETWEEN 1 AND 5),
  dicatat_oleh TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

`jumlah_foto` membuat akuntansi tahu ada foto yang belum terkirim (jumlah baris foto < `jumlah_foto`). Rute `inventory-receipt/create`, satu event berisi header + mutasinya + barang baru bila ada.

### 4.4 `inventory_penerimaan_foto` (DI LUAR snapshot, pola `absensi_foto`)

```sql
CREATE TABLE IF NOT EXISTS inventory_penerimaan_foto (
  id_foto TEXT PRIMARY KEY,            -- <id_penerimaan>-<1..5>
  id_penerimaan TEXT NOT NULL,
  urutan INTEGER NOT NULL CHECK (urutan BETWEEN 1 AND 5),
  mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  data_base64 TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

- Disimpan lokal, didorong ke cloud lewat outbox (`inventory-receipt-photo/save`, satu event per foto supaya satu event tidak berukuran 10 MB), dan ditarik **on-demand** lewat endpoint query bila perangkat belum punya salinannya. Tidak ikut tarikan snapshot berkala.
- Rust memvalidasi MIME, ukuran (maks 2 MB setelah base64 didekode), dan urutan sebelum menulis SQLite lokal (aturan anti-outbox-macet).

### 4.5 Aturan bersama untuk keempat tabel

- Tanpa UNIQUE selain PK. Tanpa kolom `status`.
- `diajukan_oleh`, `disetujui_oleh`, `ditolak_oleh`, `ditutup_oleh`, `dicatat_oleh` diisi dari sesi. Payload yang membawanya ditolak (`.strict()` / `deny_unknown_fields`).
- Ikut dibuang saat pindah database, didaftarkan di `TABEL_TUMBUH` (`audit:list-bound`).
- DDL dieja identik di `storage.rs` (desktop dan mobile, mobile disunting tangan), `turso.rs`, dan `db-migrations.ts`. Sentinel cloud Rust dinaikkan ke `-2040`. `REQUIRED_TABLE_COUNT`, `isDatabaseSchemaReady`, `schema-consistency.test.ts`, dan daftar versi `rbac-migration.test.ts` diperbarui.

---

## 5. Aturan sinkronisasi dan konflik

### 5.1 Yang pertama sampai di cloud yang berlaku

Pola servis aset (`CLOUD_UPSERT/CLOSE/CANCEL_SERVIS_SQL`):

| Event | Cloud menulis hanya bila |
|---|---|
| `inventory-request/save` (ubah) | belum ACC, belum ditolak, belum dibatalkan |
| `inventory-request/approve` | sama seperti di atas **dan** `sidik_baris` cloud = `sidik_disetujui` kiriman |
| `inventory-request/reject`, `cancel` | belum ACC, belum ditolak, belum dibatalkan |
| `inventory-request/close` | sudah ACC, belum ditutup |

Event yang kalah dilewati tanpa ditolak (outbox tidak macet). Perangkat yang kalah akhirnya menampilkan versi cloud setelah tarikan berikutnya. Rencana teknis wajib memastikan tarikan snapshot memang menimpa baris lokal yang tidak punya outbox tertunda.

### 5.2 Sidik baris (ACC atas isi yang dilihat)

`sidik_baris` = SHA-256 heksadesimal dari bentuk kanonik baris (urut `urutan`; `id_barang`, `nama_barang`, `satuan`, `jumlah`, `harga_satuan` dipisah karakter tetap), dihitung ulang setiap simpan. Fungsinya dieja kembar `sidik_baris` ↔ `sidikBaris` dengan vektor yang sama.

Kalau Sarpras mengubah pengajuan di satu perangkat sementara akuntansi meng-ACC versi lama di perangkat lain (keduanya offline), ACC itu gugur di cloud karena sidiknya tidak cocok. Pengajuannya kembali tampil **Menunggu** di semua perangkat setelah sinkron. Tidak ada event yang ditolak.

### 5.3 Penerimaan dari dua perangkat

Dua perangkat offline yang mencatat penerimaan untuk pengajuan yang sama menghasilkan dua `id_penerimaan` berbeda, dan keduanya masuk (stok tidak pernah ditolak cloud). Bila jumlah diterima sebuah baris melebihi yang di-ACC, baris itu ditandai **melebihi ACC** di laporan akuntansi dan di tab Pengajuan. Koreksinya: batalkan mutasi yang kembar (`inventory.adjust`). Batas "tidak melebihi ACC" hanya diperiksa di perangkat saat menyimpan.

### 5.4 Waktu

Semua "hari ini" memakai tanggal WIB jam database (`date('now','+7 hours')`).

---

## 6. Izin dan UI

### 6.1 Izin (tanpa izin baru, §7 no. 3)

| Aksi | Izin |
|---|---|
| Melihat tab Pengajuan dan foto penerimaan dari Inventaris | `inventory.view` |
| Ajukan, ubah, batalkan, catat penerimaan, tutup | `inventory.record` |
| Melihat Menunggu persetujuan dan laporan penerimaan di Keuangan | `accounting.view` |
| ACC / Tolak | `accounting.manage` |
| Membatalkan mutasi hasil penerimaan | `inventory.adjust` (aturan yang ada) |

Endpoint foto menerima `inventory.view` **atau** `accounting.view` (`require_any_permission` ↔ `requireAnyWebPermission`). Sebelum implementasi, cek `DEFAULT_ROLE_PERMISSIONS` supaya role yang memakai halaman ini hari ini tidak terkunci.

### 6.2 UI

- **Inventaris → tab Pengajuan** (berkas baru `components/inventory/Pengajuan.tsx`, di `filesToCopy`; jangan ditambahkan ke `InventarisWorkspace.tsx`). Daftar dengan saringan status, rincian pengajuan, formulir Ajukan, formulir Catat penerimaan, tombol Salin, Batalkan, Tutup, Cetak label. Tanda angka di tab = jumlah pengajuan Disetujui yang belum diterima penuh.
- **Keuangan → tab Dari Inventaris** (`components/keuangan/JurnalInventaris.tsx`): bagian **Menunggu persetujuan** dan **Penerimaan barang** (laporan §3.5). Tanda angka tab yang sudah ada ditambah jumlah pengajuan Menunggu. Foto ditampilkan lewat komponen bersama kecil (misal `components/inventory/FotoPenerimaan.tsx`), dipakai kedua tab.
- Jalan di Web, Desktop, dan Mobile. Mobile mengambil foto lewat kamera atau galeri. Tombol Cetak label disembunyikan di Mobile, seperti cetak label sekarang.
- Dialog memakai `<Modal>`, setiap isian berlabel, simpan dijaga `isSubmittingRef`, isian jumlah memakai `isianJumlah`/`bacaJumlah` (bukan `type="number"`). Dark mode sebagai dasar, light mode lewat `globals.css` / `data-theme`. Teks UI tidak memuat "SPPG".

---

## 7. Keputusan

Diputuskan User pada 28 Oktober 2026: semua mengikuti rekomendasi.

| # | Pertanyaan | Keputusan |
|---|---|---|
| 1 | Barang di pengajuan: wajib sudah terdaftar, atau boleh nama baru? | **Boleh keduanya.** Barang baru dibuat saat penerimaan, dan tipe/kategori diisi saat itu. |
| 2 | ACC seluruh pengajuan atau per baris? | **Seluruh pengajuan.** Yang tidak setuju ditolak beralasan, lalu Sarpras memakai "Salin jadi pengajuan baru". |
| 3 | Izin baru untuk ACC? | **Tidak.** Ajukan/terima `inventory.record`, ACC/Tolak `accounting.manage`. |
| 4 | Di mana akuntansi bekerja, dan apakah penerimaan perlu diverifikasi sebelum masuk stok? | **Tab Dari Inventaris di Keuangan, dengan tanda angka. Stok langsung masuk saat penerimaan.** Barang sudah di rak, dan stok yang ditahan membuat layar berbeda dengan rak. Verifikasi akuntansi = memeriksa foto dan selisih sebelum menjurnal. |
| 5 | Penerimaan bertahap dan harga berbeda? | **Boleh bertahap** sampai jumlah ACC terpenuhi, sisanya bisa ditutup. Jumlah tidak boleh melebihi ACC (diperiksa di perangkat). Harga sebenarnya boleh berbeda, dan selisihnya ditandai. |
| 6 | Foto penerimaan? | **Wajib 1–5 foto**, JPEG terkompres, maks 2 MB per foto, pola `absensi_foto`. |
| 7 | Label QR per kardus/batch? | **Tidak di fase ini.** Tombol "Cetak label" setelah penerimaan memakai label per barang/unit yang sudah ada. Label per batch jadi fase terpisah bila perlu. |
| 8 | Pemberitahuan ke akuntansi? | **Tanda angka di tab saja**, tanpa WhatsApp. |

---

## 8. Kriteria penerimaan

1. Sarpras di HP offline mengajukan 3 baris (1 barang lama, 2 barang baru), total Rp 1.250.000. Setelah sync, pengajuan muncul di Menunggu persetujuan di Web dan Desktop dengan total yang sama.
2. Akuntansi menolak dengan alasan. Sarpras melihat alasannya, menekan Salin, mengubah satu harga, dan mengajukan ulang dengan nomor baru.
3. Akuntansi meng-ACC di Desktop offline sementara Sarpras mengubah pengajuan yang sama di HP offline. Setelah keduanya sinkron, pengajuan tampil Menunggu di semua perangkat dan tidak ada event outbox yang gagal.
4. Penerimaan pertama mencatat 2 dari 3 baris dengan 2 foto. Stok bertambah, dua baris muncul di Belum dijurnal, status menjadi Diterima sebagian, dan barang baru terbuat sekali. Penerimaan kedua untuk baris ketiga memakai barang yang sudah dibuat dan status menjadi Selesai.
5. Penerimaan dengan jumlah melebihi ACC ditolak di perangkat. Penerimaan kembar dari dua perangkat offline ditandai "melebihi ACC" setelah sinkron.
6. Penerimaan tanpa foto ditolak. Foto 3 MB ditolak di Rust dan TS sebelum menulis apa pun.
7. Akuntansi di Web membuka foto penerimaan yang dicatat di HP. Selama HP belum mengirim fotonya, laporan menampilkan "Foto belum terkirim dari perangkat pencatat".
8. Harga sebenarnya Rp 60.000 vs ACC Rp 55.000 ditandai selisih di laporan. Jurnalnya (Fase A) memakai Rp 60.000.
9. Membatalkan mutasi hasil penerimaan mengembalikan status baris ke "belum diterima penuh" dan membalik jurnalnya bila sudah dijurnal.
10. Setelah penerimaan di Desktop, "Cetak label QR" membuka label untuk barang tersebut. Aset per unit mendapat satu label per unit baru.
11. Event `inventory-request/save` yang terkirim dua kali dan penerimaan yang terkirim dua kali tidak menggandakan baris atau stok.
12. Migrasi v64 mempertahankan semua data lama di ketiga lapis. `bun run check` hijau di kedua workspace.

## 9. Fase rilis

| Fase | Isi | Skema |
|---|---|---|
| **P** | Empat tabel §4, ajukan/ubah/batal/salin, ACC/tolak dengan sidik, penerimaan bertahap berfoto → Masuk Pengadaan, tutup pengajuan, laporan di Dari Inventaris, cetak label setelah penerimaan | v64 |

Satu fase, tetapi implementasinya boleh dua langkah dalam satu skema: (1) pengajuan + ACC/tolak, (2) penerimaan + foto + laporan + label. Langkah 1 tidak bisa dirilis sendiri karena pengajuan yang di-ACC tidak punya kelanjutan.
