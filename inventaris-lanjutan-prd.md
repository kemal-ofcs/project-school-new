# PRD: Inventaris Lanjutan — Jurnal Pengadaan & Servis Aset

**Produk:** Manajemen Sekolah (Web, Desktop Tauri v2, Mobile Android Tauri v2)
**Versi dokumen:** 1.1 (final; keputusan §6 diambil User 26 Oktober 2026)
**Status:** Semua keputusan di §6 sudah diambil. Fase A diimplementasikan 26 Oktober 2026 dan lolos `bun run check` penuh (470 tes Rust web-desktop, 473 mobile). Fase B diimplementasikan 26 Oktober 2026 dan lolos `bun run check` penuh (473 tes Rust web-desktop, 476 mobile); keputusan rencananya: tab Servis tersendiri menggantikan saringan di tab Barang, hanya tanggal dibawa/penyedia/keluhan yang bisa diubah, tanggal tidak boleh setelah hari ini, mutasi kondisi hasil servis tidak bisa dibatalkan. Fase A sudah diport ke absensi-perusahaan; Fase B diport setelah check sekolah hijau. Setiap fase tetap melewati alur `kerjakan-fitur-lintas-platform`.
**Tanggal:** 26 Oktober 2026
**Dasar:** `inventory-prd.md` (v2.2, seluruhnya sudah dikerjakan) dan `nilai-keuangan-prd.md` (K1–K4, tutup buku).

    Kondisi saat dokumen ditulis (hitung ulang di kode sebelum mulai):
    CURRENT_SCHEMA_VERSION   61
    keu_jurnal.sumber        'Manual','Kasbon','Payroll','Pembayaran','Tagihan','Pembatalan'
    Akun bawaan terkait      akun-peralatan, akun-beban-atk, akun-beban-pemeliharaan,
                             akun-utang-usaha, akun-sumbangan (semuanya sistem = false)

Nama tabel, kolom, dan rute di bawah adalah usulan. Bila bertabrakan dengan kode, kodenya yang menang dan dokumen ini diperbarui.

---

## 1. Latar belakang

Modul Inventaris dan modul Keuangan sudah lengkap masing-masing, tetapi tidak saling bicara.

1. **Pembelian dicatat dua kali.** Petugas Sarpras mencatat Masuk "Pengadaan" lengkap dengan harga satuan dan sumber dana. Bendahara lalu mengetik ulang pembelian yang sama sebagai jurnal manual. Kalau salah satu lupa, laporan pengadaan dan laporan keuangan tidak cocok dan tidak ada yang memberi tahu.
2. **Servis aset tidak tercatat.** Proyektor yang dibawa ke tukang servis hanya bisa dicatat lewat "Perubahan Kondisi". Tidak ada catatan sejak kapan, di mana, keluhannya apa, berapa biayanya, dan apakah sudah kembali. Saat opname, unit yang sedang diservis tampak hilang.

## 2. Tujuan

1. Setiap Masuk Pengadaan (dan Hibah, bila diputuskan §6 no. 3) yang berharga bisa dijadikan jurnal dengan beberapa klik, tanpa mengetik ulang angka, dan selalu ketahuan mana yang **belum** dijurnal.
2. Membatalkan mutasi yang sudah dijurnal otomatis membalik jurnalnya. Angka inventaris dan keuangan tidak bisa menyimpang lewat jalur pembatalan.
3. Setiap servis aset tercatat dari dibawa sampai kembali, termasuk perubahan kondisinya dan biayanya. Biaya servis masuk daftar "belum dijurnal" yang sama.
4. Semuanya jalan offline di Desktop dan Mobile, dan cloud tetap tidak pernah menolak event karena stok, tanggal, atau saldo.

### Di luar cakupan

- **Penilaian persediaan dan penyusutan** (tetap seperti `inventory-prd.md` §2). Jurnal hanya mencatat uang keluar saat membeli. Habis Pakai langsung dibebankan, tidak ada akun Persediaan.
- **Pelunasan Utang Usaha.** Bila pembelian dikreditkan ke Utang Usaha, pelunasannya dicatat dengan jurnal manual seperti sekarang.
- **Jurnal dari Saldo Awal.** Saldo awal barang bukan pembelian baru. Saldo awal keuangan sudah diisi lewat jurnal manual.
- **Permintaan barang oleh guru/staf** (kandidat no. 3) dan **foto barang** (kandidat no. 4). Ditunda atas keputusan User 26 Oktober 2026.
- **Jadwal perawatan berkala** (servis AC tiap 6 bulan dan sejenisnya). Fase B hanya mencatat servis yang terjadi.

---

## 3. Fase A: Jurnal pengadaan

### 3.1 Alur

1. Petugas Sarpras mencatat Masuk Pengadaan seperti biasa. Tidak ada yang berubah di formulirnya.
2. Bendahara (pemegang `accounting.manage`) membuka daftar **Belum dijurnal** (lihat §3.6), menyaring tanggal, mencentang baris, memilih akun, lalu menekan "Catat ke jurnal".
3. Backend menghitung ulang nilai setiap baris, menulis satu jurnal per baris dalam **satu transaksi**, dan barisnya hilang dari daftar.

Alasan jalur ini (bukan kotak centang di formulir Masuk), lihat §6 no. 1: petugas Sarpras umumnya tidak memegang izin keuangan dan tidak tahu uangnya keluar dari kas mana. Pengadaan yang dicatat sebelum fitur ini ada juga otomatis tercakup.

### 3.2 Baris yang memenuhi syarat

Satu baris `inventory_mutasi` masuk daftar Belum dijurnal bila **semua** terpenuhi:

- `jenis = 'Masuk'` dan `alasan = 'Pengadaan'` (ditambah `'Hibah'` bila §6 no. 3 = ya).
- `harga_satuan IS NOT NULL` dan nilainya (`NILAI_MUTASI_SQL`) > 0.
- Belum dibatalkan (`NOT EXISTS ... 'batal-' || id_mutasi`).
- Belum dijurnal: `NOT EXISTS (SELECT 1 FROM keu_jurnal WHERE id_jurnal = 'jrn-inv-' || m.id_mutasi)`.

Status "sudah dijurnal" **tidak disimpan** di baris mutasi (mutasi append-only). Ia selalu diturunkan dari keberadaan jurnal berid deterministik, pola yang sama dengan status kasbon dan rapel.

### 3.3 Isi jurnal

Satu baris mutasi = satu jurnal (§6 no. 2):

| Bagian | Isi |
|---|---|
| `id_jurnal` | `jrn-inv-<id_mutasi>` (deterministik: dua perangkat yang menjurnal baris sama menghasilkan PK yang sama) |
| `tanggal` | `tanggal` mutasi (tanggal barang diterima), bukan tanggal menekan tombol |
| `sumber` / `id_sumber` | `'Inventaris'` / `id_mutasi` |
| `keterangan` | `Pengadaan <nama barang> <jumlah> <satuan>` + ` (<nomor_dokumen>)` bila ada; jumlah memakai `formatJumlah` (barang desimal tampil berkoma) |
| Debit | Akun barang. Bawaan: Aset → `akun-peralatan`, Habis Pakai → `akun-beban-atk`. Boleh diganti ke akun **Aset** atau **Beban** aktif lain (obat UKS dan bahan lab bukan ATK). |
| Kredit | Akun bayar: akun **Aset** atau **Kewajiban** aktif. Bawaan `akun-kas`. `akun-bank` dan `akun-utang-usaha` lazim. |
| Hibah (bila ya) | Debit sama; kredit akun **Pendapatan** aktif, bawaan `akun-sumbangan` |

Aturan:

- Nilai dihitung **di backend** dari baris mutasi (`NILAI_MUTASI_SQL`: barang desimal dibagi 100, dibulatkan per baris). Angka dari layar tidak pernah dipakai.
- Satu pilihan akun berlaku untuk semua baris yang dicentang dalam satu tekan, **kecuali** akun debit, yang dipilih per tipe barang (Aset / Habis Pakai) supaya satu tekan bisa memuat keduanya.
- Akun bawaan yang dinonaktifkan sekolah tidak dipilih otomatis. Isiannya kosong dan wajib dipilih.
- Maksimal `MAKS_JURNAL_INVENTARIS` = 200 baris per tekan (sejalan dengan `audit:list-bound`).
- Semua lewat `tulis_jurnal_tx` ↔ `tulisJurnalTx`, sehingga gerbang tutup buku berlaku tanpa kode tambahan. Baris bertanggal di periode tertutup ditampilkan nonaktif dengan keterangan "periode sudah ditutup s.d. <tanggal>". Backend tetap menolak seluruh tekan bila ada yang lolos (semua atau tidak sama sekali).
- Daftar dan susunan barisnya dieja kembar `inventory.rs` ↔ `services/inventory.ts` (`syarat_jurnal_sql`, `susun_jurnal_pengadaan` ↔ `susunJurnalPengadaan`) dengan vektor yang sama.

### 3.4 Pembatalan

- `cancel_mutation` ↔ `cancelMutation` untuk baris yang sudah punya `jrn-inv-<id>` memanggil `balik_jurnal_tx` **di transaksi yang sama**. Pembaliknya bertanggal hari pembatalan (WIB), mengikuti aturan pembalik yang sudah ada, sehingga periode lama yang sudah ditutup tidak tersentuh.
- Bila hari ini sendiri berada di periode tertutup (jarang), pembatalan mutasinya ikut tertolak dengan pesan dari gerbang tutup buku. Stok dan jurnal tidak boleh berpisah.
- Izin tetap `inventory.adjust` (pola kasbon: pembalik jurnal ikut izin modul sumbernya, bukan `accounting.reverse`).
- Jurnal bersumber `Inventaris` **tidak bisa** dibatalkan dari layar Keuangan (hanya `Manual` yang bisa, aturan K1 tetap). Jalurnya satu: batalkan mutasinya.

### 3.5 Model data dan sinkronisasi

- **Tidak ada tabel baru.** Jurnal memakai `keu_jurnal` / `keu_jurnal_baris` dan rute `accounting-journal/post` yang sudah ada.
- **CHECK `keu_jurnal.sumber` ditambah `'Inventaris'`** (schema v62). `CREATE TABLE IF NOT EXISTS` tidak memperbaiki CHECK, jadi ketiga lapis (`storage.rs`, `turso.rs`, `db-migrations.ts`) membangun ulang tabel dengan menyalin **irisan kolom** dari `PRAGMA table_info`, pola `notifikasi_wa` v36/v44. Sentinel skema cloud Rust dinaikkan.
- `label_sumber_kas` ↔ `labelSumberKas`: `'Inventaris'` → "Pembelian barang dan servis". Tanpa ini arus kas memasukkannya ke kelompok "Pembatalan" (cabang `_`).
- **Risiko perangkat lama:** perangkat yang belum diperbarui punya CHECK lama dan tidak bisa menyimpan jurnal `Inventaris` hasil tarikan. Rencana Fase A wajib memastikan dulu apa yang terjadi di `sync.rs` saat satu baris snapshot melanggar CHECK (satu tabel gagal, atau seluruh siklus), lalu menuliskan konsekuensinya. Aturan operasionalnya (§6 no. 8): semua perangkat diperbarui sebelum tombol "Catat ke jurnal" dipakai.
- **Dua perangkat menjurnal baris yang sama secara offline** dengan akun berbeda: id-nya sama, cloud menyimpan yang tiba lebih dulu (`ON CONFLICT DO NOTHING`). Ini sama dengan `jrn-cair-<pinjaman>` di K2. Rencana Fase A wajib mengecek apakah perangkat yang kalah akhirnya memakai versi cloud. Kalau tidak, tambahkan tinjauan "jurnal berbeda dari cloud", jangan biarkan diam-diam.

### 3.6 Izin dan UI

- Melihat daftar Belum dijurnal: `accounting.view` (halaman Keuangan memang dijaga area akuntansi). Pemegang `inventory.view` saja melihat ringkasan "N baris belum dicatat di pembukuan" di Rekap Pengadaan dan kolom Jurnal di Excel-nya. Menekan "Catat ke jurnal": `accounting.manage`. Tidak ada izin baru (keputusan rencana Fase A, B).
- Letak: tab baru **Dari Inventaris** di halaman Keuangan (`KeuanganWorkspace`, sudah di `filesToCopy`), karena penggunanya bendahara. Laporan Pengadaan di Inventaris mendapat kolom "Jurnal" (nomor jurnal atau "Belum") dan tautan ke tab tersebut.
- Empat isian akun per tekan (debit Aset, debit Habis Pakai, kredit Pengadaan, kredit Hibah; hanya yang dibutuhkan baris tercentang yang tampil), dipilih dari bagan akun yang sudah dimuat halaman Keuangan, sehingga `PilihAkunBayar` tidak perlu diubah (keputusan rencana C). Akun salah dikoreksi dengan jurnal manual reklasifikasi (keputusan rencana D).
- Tab "Dari Inventaris" membawa tanda angka (baris belum dijurnal + jurnal yang perlu dibalik), seperti tanda di tab Tutup Buku (keputusan rencana A; halaman Keuangan tidak punya tab Ringkasan).
- Jurnal yang mutasinya dibatalkan di perangkat lain sebelum jurnalnya tertarik tampil sebagai "perlu dibalik" beserta tombol Balik.
- Jalan juga di Mobile. Tidak ada cetak.

---

## 4. Fase B: Servis aset

### 4.1 Alur

1. **Buka servis.** Dari rincian barang (atau unit): pilih unit (barang per unit) atau jumlah (Aset tanpa unit), tempat dan kondisi asalnya, tanggal dibawa, penyedia servis (teks bebas: "Toko Elektronik Jaya", "Pak Budi teknisi"), dan keluhan.
2. **Selama diservis** barang tetap milik sekolah di tempat asalnya. Stok tidak berubah. Rincian barang, kartu stok, dan opname menampilkan tanda "Sedang diservis di <penyedia> sejak <tanggal>".
3. **Tutup servis.** Isi tanggal kembali, hasil, biaya (boleh 0), dan catatan. Bila hasilnya kondisi yang berbeda dari kondisi asal, aplikasi menulis mutasi Pindah `Perubahan Kondisi` di transaksi yang sama.
4. **Batalkan servis** (salah input, atau tidak jadi dibawa): hanya untuk servis yang belum ditutup, wajib beralasan.

### 4.2 Model data: `inventory_servis` (schema v63, masuk `SNAPSHOT_TABLES`)

```sql
CREATE TABLE IF NOT EXISTS inventory_servis (
  id_servis TEXT PRIMARY KEY,
  id_barang TEXT NOT NULL,
  id_unit TEXT,                       -- wajib bila barangnya per unit
  jumlah INTEGER NOT NULL CHECK (jumlah > 0),   -- 1 untuk unit
  tempat TEXT NOT NULL,               -- dinormalisasi normalize_tempat
  kondisi_awal TEXT NOT NULL CHECK (kondisi_awal IN ('Baik', 'Rusak Ringan', 'Rusak Berat')),
  tanggal_mulai TEXT NOT NULL,
  penyedia TEXT,
  keluhan TEXT NOT NULL,
  tanggal_selesai TEXT,
  hasil TEXT CHECK (hasil IS NULL OR hasil IN ('Baik', 'Rusak Ringan', 'Rusak Berat', 'Tidak Bisa Diperbaiki')),
  biaya INTEGER CHECK (biaya IS NULL OR biaya >= 0),
  catatan_selesai TEXT,
  dibatalkan_pada TEXT,
  alasan_batal TEXT,
  dibuka_oleh TEXT NOT NULL,
  ditutup_oleh TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

- Tanpa UNIQUE selain PK (aturan tabel tersinkron). Tanpa kolom `status`: **Dibatalkan** dari `dibatalkan_pada`, **Selesai** dari `tanggal_selesai`, sisanya **Sedang diservis**.
- Rute kanonik `inventory-service/save` (buka, dan ubah selama masih terbuka), `inventory-service/close`, `inventory-service/cancel`. Snapshot `delete_missing: false`; ikut dibuang saat pindah database; daftar di `TABEL_TUMBUH`.
- **Penutupan pertama yang menang.** Handler cloud `close` dan `cancel` hanya menulis bila `tanggal_selesai IS NULL AND dibatalkan_pada IS NULL`; `save` hanya menulis bila servisnya masih terbuka. Dua perangkat offline yang menutup servis yang sama tidak saling menimpa. Event yang kalah tidak ditolak (outbox tidak macet), hanya diabaikan.
- `dibuka_oleh` / `ditutup_oleh` dari sesi, payload yang membawanya ditolak (`.strict()` / `deny_unknown_fields`).

### 4.3 Aturan

- **Validasi buka** (`validate_servis` ↔ `validateServis`, vektor kembar): barang Aset aktif; barang per unit wajib `id_unit` dan jumlah 1 (`validate_unit_rules`); barang tanpa unit wajib saldo lokal ≥ jumlah di tempat dan kondisi itu, dikurangi jumlah yang sedang diservis dari baris yang sama. Satu unit tidak boleh punya dua servis terbuka. Habis Pakai tidak bisa diservis.
- **Mutasi saat menutup** berid deterministik `srv-<id_servis>`, sehingga penutupan yang terkirim dua kali hanya memindahkan kondisi sekali. Bila saldo di tempat dan kondisi asal sudah tidak cukup (barangnya dipindah selama diservis), penutupan ditolak di perangkat dengan pesan yang menyebut tempat dan kondisinya. Cloud tetap tidak menolak.
- **Hasil "Tidak Bisa Diperbaiki"** tidak mengubah stok otomatis. Setelah ditutup, aplikasi menawarkan tombol "Catat Rusak/Afkir" yang membuka formulir Keluar yang sudah ada (butuh `inventory.adjust`) (§6 no. 6).
- **Unit yang sedang diservis** diperingatkan bila dipilih di Keluar atau Pindah, tidak ditolak (§6 no. 5).
- **Opname:** unit atau jumlah yang sedang diservis ditampilkan berlabel dan **tidak** ikut "Catat yang belum dipindai sebagai tidak ditemukan".
- **Servis yang sudah ditutup bersifat final** (§6 no. 7). Biaya yang salah dikoreksi dengan jurnal manual.

### 4.4 Biaya servis ke jurnal

- Servis yang ditutup dengan biaya > 0 masuk daftar **Dari Inventaris** (§3.6) yang sama dengan pengadaan, jadi bendahara punya satu tempat.
- Jurnal `jrn-srv-<id_servis>`, tanggal = `tanggal_selesai`, sumber `'Inventaris'`, id_sumber = `id_servis`. Debit bawaan `akun-beban-pemeliharaan` (boleh Beban aktif lain), kredit akun bayar seperti §3.3.
- Karena servis yang ditutup tidak bisa dibatalkan, jurnalnya tidak punya jalur pembalikan otomatis.

### 4.5 Izin, UI, laporan

- Buka, tutup, dan batalkan servis: `inventory.record`. Melihat: `inventory.view`. Tidak ada izin baru.
- Rincian barang dan unit: bagian "Riwayat servis". Tab **Barang**: saringan "Sedang diservis". Tab **Ringkasan**: jumlah servis terbuka dan yang lebih dari 30 hari (peringatan, angka tetap).
- Export Excel: lembar "Servis" (rentang tanggal mulai, semua kolom plus status turunan).
- UI di komponen inventaris bersama (`filesToCopy`), sebaiknya berkas baru `components/inventory/Servis.tsx`, bukan ditambahkan ke `InventarisWorkspace.tsx` yang sudah 93 KB.

---

## 5. Aturan lintas fase

- Aturan murni dieja kembar Rust ↔ TS dengan vektor yang sama; Mobile memakai salinan hasil `sync-frontend-lib.ts` / `sync-rust-modules.ts`, tidak disunting tangan.
- Cloud tidak pernah menolak event karena stok, saldo, atau tanggal. Semua penolakan terjadi di perangkat sebelum menulis SQLite lokal.
- Semua tanggal operasional memakai tanggal WIB jam database (`date('now','+7 hours')`), bukan jam perangkat.
- Teks UI tidak memuat "SPPG". Dark mode sebagai dasar, light mode lewat `globals.css` / `data-theme`. Dialog memakai `<Modal>`, setiap isian berlabel, simpan dijaga `isSubmittingRef`.

## 6. Keputusan

Diputuskan User pada 26 Oktober 2026: semua mengikuti rekomendasi di kolom kanan.

| # | Pertanyaan | Keputusan |
|---|---|---|
| 1 | Jurnal dibuat dari mana? (a) daftar "Belum dijurnal" di Keuangan oleh bendahara, (b) kotak centang saat petugas menyimpan Masuk, (c) keduanya | **(a)**. Satu jalur, cocok dengan pembagian kerja Sarpras ↔ bendahara, dan otomatis mencakup pengadaan lama. (b) bisa ditambah nanti memakai fungsi yang sama. |
| 2 | Satu jurnal per baris mutasi, atau satu jurnal per nomor dokumen? | **Per baris.** Id deterministik dan pembatalan per baris jadi sederhana. Harganya: membeli 30 unit kursi = 30 jurnal di buku besar (masing-masing satu unit aset). Per dokumen tidak aman karena nomor dokumen bisa kembar antarperangkat offline. |
| 3 | Hibah yang diberi harga ikut dijurnal (kredit Sumbangan)? | **Ya.** Fungsinya sama, dan barang hibah memang menambah aset sekolah. |
| 4 | Pengadaan sebelum fitur ini ada boleh dijurnal? | **Ya**, lewat saringan tanggal. Periode tertutup tetap tertolak. |
| 5 | Unit yang sedang diservis: Keluar/Pindah-nya ditolak atau diperingatkan? | **Diperingatkan.** Menolak memaksa petugas menutup servis palsu dulu bila datanya terlambat dicatat. |
| 6 | Hasil "Tidak Bisa Diperbaiki": otomatis afkir, atau hanya ditawarkan? | **Ditawarkan.** Afkir adalah penghapusan stok berizin sensitif `inventory.adjust`, tidak boleh terjadi lewat izin `inventory.record`. |
| 7 | Servis yang sudah ditutup bisa diubah/dibatalkan? | **Tidak (final).** Koreksi biaya lewat jurnal manual. |
| 8 | Perangkat lama setelah CHECK `sumber` berubah | **Semua perangkat wajib diperbarui sebelum "Catat ke jurnal" dipakai.** Dicantumkan di catatan rilis. |

## 7. Kriteria penerimaan

**Fase A**
- Masuk Pengadaan 3 rim HVS @ Rp 55.000 dicatat di HP offline. Setelah sync, baris itu muncul di Belum dijurnal di ketiga build dengan nilai Rp 165.000. Menjurnalnya menghasilkan Beban ATK D 165.000 / Kas K 165.000 bertanggal tanggal mutasi, dan barisnya hilang dari daftar.
- Barang desimal 2,5 kg @ Rp 12.345 dijurnal Rp 30.863 (pembulatan per baris sama dengan laporan Pengadaan).
- Dua perangkat offline menjurnal baris yang sama. Setelah sync hanya ada satu jurnal `jrn-inv-<id>` di cloud, dan neraca saldo tidak menghitungnya dua kali.
- Membatalkan mutasi yang sudah dijurnal menghasilkan satu jurnal pembalik bertanggal hari ini (WIB). Membatalkannya dari dua perangkat tetap satu pembalik.
- Baris bertanggal di periode tertutup tidak bisa dijurnal. Payload yang menyelundupkannya ditolak seluruhnya.
- Jurnal bersumber Inventaris tidak punya tombol batal di layar Keuangan. Arus kas menampilkannya di kelompok "Pembelian barang dan servis".
- Migrasi v62 mempertahankan semua baris `keu_jurnal` lama di ketiga lapis.

**Fase B**
- Unit PRJ-03 dibuka servisnya di Desktop. Mobile, setelah sync, menampilkan tanda "Sedang diservis" di rincian dan di opname. Unit itu tidak ikut tercatat "tidak ditemukan".
- Servis ditutup dengan hasil Baik dari kondisi Rusak Ringan: stok PRJ-03 pindah ke Baik di tempat yang sama, satu mutasi `srv-<id>`. Penutupan yang terkirim dua kali tetap satu mutasi.
- Dua perangkat offline menutup servis yang sama dengan biaya berbeda: setelah sync semua perangkat menampilkan penutupan yang lebih dulu tiba di cloud, dan tidak ada event outbox yang gagal.
- Biaya servis Rp 350.000 muncul di Belum dijurnal dan dijurnal ke Beban Pemeliharaan.
- Membuka servis kedua untuk unit yang servisnya masih terbuka ditolak.
- `bun run check` hijau di kedua workspace.

## 8. Fase rilis

| Fase | Isi | Skema |
|---|---|---|
| **A** | CHECK `sumber` + `'Inventaris'`, daftar Belum dijurnal (pengadaan, hibah), jurnal per baris, pembalikan saat mutasi dibatalkan, kolom Jurnal di laporan Pengadaan, label arus kas | v62 |
| **B** | Tabel `inventory_servis`, buka/tutup/batal, mutasi Perubahan Kondisi saat tutup, tanda di rincian/opname/Ringkasan, lembar Excel, biaya servis masuk daftar Belum dijurnal | v63 |

Fase B bergantung pada Fase A hanya untuk §4.4. Bila Fase B mau didahulukan, §4.4 ditunda sampai Fase A selesai.
