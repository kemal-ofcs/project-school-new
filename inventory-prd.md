# PRD: Modul Inventaris & Sarpras Sekolah

**Produk:** Manajemen Sekolah (Web, Desktop Tauri v2, Mobile Android Tauri v2)
**Versi dokumen:** 2.2 (final, revisi dari draf 1.0 tanggal 7 Oktober 2026; menambah Buku Kunjungan UKS sebagai Fase 4)
**Status:** Semua keputusan di §11 sudah diambil. Fase 1, 2, 3, 4a, 4b, fase label QR + opname pindai (7 Oktober 2026), dan registri aset per unit (8 Oktober 2026) sudah diimplementasikan.
**Tanggal:** 7 Oktober 2026

---

## 0. Yang berubah dari draf 1.0

Draf 1.0 sudah benar soal masalah yang mau diselesaikan. Yang salah ada di model datanya. Empat hal di sana akan rusak begitu dua perangkat mencatat secara offline, dan ini aplikasi offline-first:

| # | Di draf 1.0 | Masalahnya | Di dokumen ini |
|---|---|---|---|
| 1 | `inventory_barang.stok_saat_ini` disimpan dan ikut sync | Sync menimpa baris (siapa terakhir, dia menang). HP UKS mengeluarkan 2 dari stok 10 lalu menulis 8. Laptop TU, sama-sama offline, mengeluarkan 3 lalu menulis 7. Setelah sync stoknya 7 atau 8, padahal yang benar 5. Selisih ini tidak pernah terlihat. | Stok **tidak disimpan**. Stok selalu dihitung dari jumlah mutasi (§5.3). |
| 2 | `saldo_sebelum` / `saldo_sesudah` disimpan per mutasi | Sama: setiap perangkat menghitungnya dari data lokal yang belum lengkap. Kartu stok jadi menampilkan saldo yang tidak pernah benar-benar terjadi. | Saldo berjalan dihitung saat kartu stok dibuka (window function). |
| 3 | `tanggal_expired` hanya ada di mutasi Masuk, mutasi Keluar tidak menunjuk batch mana yang keluar | Aplikasi tidak bisa tahu berapa butir paracetamol yang kedaluwarsa masih ada di rak. Fitur deteksi dini yang jadi tujuan utama tidak bisa dihitung. | Setiap mutasi Masuk untuk barang ber-expired menjadi **batch**. Mutasi keluar atau pindah menunjuk `id_batch` (§5.2). |
| 4 | Kondisi aset disimpan per barang (`kondisi_default`) | Ada 30 kursi dan 3 di antaranya patah. Satu kolom per barang tidak bisa menyimpan itu, apalagi kursi yang tersebar di 12 ruang. | Stok dihitung per **barang × tempat × kondisi × batch**. Pindah tempat dan perubahan kondisi dicatat sebagai mutasi `Pindah` (§5.2). |

Perubahan lain yang lebih kecil:

- **`inventory_kategori` dihapus**, diganti kolom teks `kategori` di barang. Draf memuat `jenis_kategori` di kategori sekaligus `tipe_barang` di barang. Keduanya bisa bertentangan (kategori "Medis_UKS" berisi barang bertipe "Aset"), dan setiap tabel sync menambah empat lapis skema, rute, dan trigger `sync_pulse`.
- **Tempat berupa satu kolom teks**, tanpa tabel master (§4.1). Isinya bebas: kelas, TU, kantor, yayasan, gudang, UKS. Hasilnya hanya ada dua tabel baru.
- **Tipe barang tinggal dua, `Aset` dan `Habis Pakai`.** `Medis/Bahan` dihapus karena sifat yang benar-benar mengubah perilaku aplikasi adalah `bisa_expired`, dan sifat itu tidak bergantung pada tipe. Obat UKS cukup diberi kategori "UKS".
- **Mutasi tidak bisa diubah atau dihapus.** Kesalahan dibetulkan dengan mutasi `Pembatalan` (§6.5). Akibatnya sync tidak butuh rute delete untuk mutasi, dan jejak audit tidak bisa dihapus diam-diam.
- **Nilai enum memakai ejaan tampilan** (`'Habis Pakai'`, `'Rusak Ringan'`), sama seperti `absensi_harian.sumber = 'Koreksi Admin'`. Ejaan `Habis_Pakai` di DB dan "Habis Pakai" di UI butuh pemetaan, dan pemetaan seperti itu yang biasanya melenceng.
- **Ambang expired dibuat satu angka, 30 hari.** Draf menyebut 30 hari di §2 dan §6 tetapi 60 hari di §4.4.
- **Mobile masuk sejak Fase 1, tidak menunggu Fase 3.** Petugas UKS adalah persona yang paling sering di lapangan.
- **"Lingkup UKS" pada izin dihapus dari v1.** Model RBAC aplikasi ini tidak punya pembatasan per tempat. Menjanjikannya di PRD akan membuat orang mengira data sudah terkunci, padahal belum.
- **`kode_operator` diambil dari sesi, tidak dari payload.** Ini pola yang sama dengan sakelar foto absensi: terminal yang dikuasai orang lain tidak boleh bisa mengaku sebagai operator lain.
- **"Real-time" diganti "terkini setelah sync".** Di perangkat yang offline, stok yang tampil adalah stok lokal.

---

## 1. Latar belakang

Barang di sekolah terbagi tiga jenis, masing-masing dengan masalahnya sendiri:

1. **Aset** (meja, kursi, papan tulis, proyektor, komputer, lemari, alat peraga). Sekolah sulit tahu di mana barang berada (kelas, TU, kantor, yayasan), berapa yang rusak, dan berapa yang hilang.
2. **Habis pakai** (HVS, spidol, tinta, pulpen, map). Stok tiba-tiba habis, dan tidak ada catatan siapa yang mengambil atau untuk keperluan apa.
3. **Barang ber-expired** (obat UKS, bahan lab, reagen). Obat kedaluwarsa bisa diberikan ke siswa karena tidak ada peringatan.

Petugas TU/Sarpras biasanya bekerja di laptop kantor. Kepala sekolah membuka laporan di browser. Petugas UKS dan kepala lab bergerak di lapangan dengan HP, sering tanpa WiFi.

## 2. Tujuan

1. Stok setiap barang bisa dilihat per tempat, per kondisi, dan per batch, berikut riwayat masuk dan keluarnya.
2. Setiap pengurangan stok mencatat **kenapa** (alasan), **untuk apa** (keperluan), **untuk siapa** (penerima), dan **oleh siapa** (operator dari sesi).
3. Batch yang mendekati atau melewati tanggal kedaluwarsa muncul sebagai peringatan, dan pemusnahannya tercatat.
4. Semua fitur jalan offline di Desktop dan Mobile, lalu tersinkron tanpa membuat outbox macet.
5. Setiap kunjungan UKS tercatat: siapa, kelas saat itu, jam masuk dan keluar, keluhan, tindakan, obat yang diberikan, dan tindak lanjutnya. Data kesehatan ini tidak tersalin ke perangkat lain (§4.11).

### Di luar cakupan v1

- ~~**Registri aset per unit**~~ Dikerjakan 8 Oktober 2026 (schema v37, `inventory_unit`). Keputusan rencananya: pilihan per barang Aset lewat "Daftarkan unit" atau kotak "Catat per unit" saat barang masuk; unit = batch berjumlah 1 (`id_unit` = id mutasi Masuk pembukanya); stok lama didaftarkan lewat Keluar + Masuk beralasan `Distribusi` (tanpa alasan baru, supaya CHECK perangkat lama tidak menolak) dan tidak bisa dibatalkan; kode unit `<kode barang>-NN`; isian hanya nomor seri dan catatan; unit yang tidak dipindai saat opname tetap dianggap ada sampai petugas menekan "Catat yang belum dipindai sebagai tidak ditemukan".
- **Pencatatan resmi BMD/KIB dan SPJ BOS (ARKAS).** Export Excel dari modul ini membantu menyusunnya, tetapi bukan format resmi dan tidak menggantikan aplikasi pemerintah.
- **Penilaian persediaan** (FIFO/rata-rata) dan nilai buku aset. Laporan hanya menjumlahkan nilai **pengadaan** dari harga yang diisi saat barang masuk.
- **Konversi satuan** (1 rim = 500 lembar). Satu barang punya satu satuan. Pilih satuan sesuai cara barang itu dikeluarkan.
- **Mengubah absensi otomatis dari kunjungan UKS.** Siswa yang pulang karena sakit tidak otomatis tercatat izin di `absensi_harian`. Aturan prioritas sumber absensi membuat keputusan itu terpisah.
- **Pemeriksaan medis terstruktur** (tensi, suhu, berat badan). Bila perlu, isi di kolom tindakan.
- **Pembatasan per tempat** pada izin.
- **Integrasi dengan kelas/rombel.** Tempat adalah teks bebas, tidak terhubung ke `akademik_rombel` (§11 no. 5).
- **Jumlah pecahan.** Jumlah selalu bilangan bulat, jadi alkohol dicatat dalam ml, bukan 0,5 liter.

## 3. Persona & izin

Izin baru, semuanya di area `inventory`:

| Izin | Isi | Sensitif? | Paket bawaan |
|---|---|---|---|
| `inventory.view` | Melihat barang, stok, kartu stok, dan peringatan | Tidak | Admin, Operator |
| `inventory.manage` | Mengelola master barang | Tidak | Admin |
| `inventory.record` | Mencatat Masuk, Keluar (pemakaian, peminjaman), Pindah, Pengembalian | Tidak | Admin |
| `inventory.adjust` | Stock opname, Pembatalan, dan penghapusan stok (Rusak/Afkir, Hilang, Kedaluwarsa) | **Ya**, masuk `SENSITIVE_MUTATION_PERMISSIONS` | Tidak ada, diberikan sadar |

`inventory.adjust` sengaja dipisah. Opname, pembatalan, dan penghapusan stok adalah tiga cara stok berkurang tanpa barangnya diterima siapa pun, jadi ketiganya juga cara paling mudah menutupi barang yang diambil orang. Pola ini sama dengan `class_attendance.delete`.

| Persona | Izin yang biasa diberikan |
|---|---|
| Superadmin, Kepala Sekolah | semua |
| Petugas Sarpras, Admin TU | `view`, `manage`, `record` (+ `adjust` bila ditunjuk) |
| Petugas UKS, Pembina PMR | `view`, `record` |
| Kepala Lab, Guru praktik | `view`, `record` |

Izin Buku Kunjungan UKS (Fase 4), di area `uks`:

| Izin | Isi | Sensitif? | Paket bawaan |
|---|---|---|---|
| `uks.view` | Melihat riwayat dan rekap kunjungan | Tidak, tetapi **tidak** masuk paket Operator | Admin |
| `uks.record` | Mencatat dan menutup kunjungan, termasuk mengeluarkan obat lewat kunjungan | Tidak | Admin |
| `uks.delete` | Menghapus kunjungan | **Ya**, masuk `SENSITIVE_MUTATION_PERMISSIONS` | Tidak ada |

`uks.view` adalah izin membaca riwayat kesehatan anak. Wali kelas dan guru tidak otomatis memilikinya.

Izin masuk dan keluar tidak dipisah (§11 no. 2). Tanpa pembatasan per tempat, pemisahan itu tidak benar-benar membatasi apa-apa: petugas UKS yang menerima obat dari gudang tetap butuh mencatat Pindah.

Sebelum rilis, cek `DEFAULT_ROLE_PERMISSIONS`. Halaman `/inventaris` dijaga `inventory.view` (aturan `audit:page-guard`).

## 4. Fitur

### 4.1 Tempat
Tempat adalah satu kolom teks bebas yang menunjukkan di mana barang disimpan atau ditempatkan, misalnya "Gudang", "Ruang TU", "Kantor Kepala Sekolah", "Yayasan", "UKS", "Kelas X RPL 1". Tempat tidak punya tabel master dan tidak terhubung ke data kelas.

Karena tempat ikut menentukan stok, teks bebas punya satu risiko: "UKS" dan "Ruang UKS" terbaca sebagai dua tempat berbeda. Tiga hal mencegahnya:
1. **Saran saat mengetik.** Isian Tempat menawarkan tempat yang sudah dipakai (`<datalist>`), yaitu tempat yang masih punya saldo ≠ 0 ditambah `tempat_utama` semua barang.
2. **Normalisasi saat menyimpan.** Spasi di awal dan akhir dibuang dan spasi ganda dirapatkan. Bila ada tempat lain yang sama persis tanpa memandang huruf besar-kecil, ejaan yang sudah ada itu yang dipakai. "ruang tu" otomatis disimpan sebagai "Ruang TU".
3. **Pengelompokan saldo tidak memandang huruf besar-kecil** (`LOWER(tempat)`). Ini menangani dua perangkat offline yang sama-sama menulis ejaan baru sebelum sempat sync.

Tempat yang salah ketik dibetulkan dengan mutasi Pindah ke tempat yang benar. Setelah saldonya 0, tempat yang salah itu hilang sendiri dari saran.

Batasnya: tempat tidak bisa diganti nama secara massal, karena mutasi tidak bisa diubah. Bila nanti sekolah butuh mengganti nama atau mengelola daftar tempat, tabel master baru ditambahkan saat itu.

### 4.2 Master barang
- `kode_barang` unik dicek di aplikasi (`assert_unique`), **tidak** pakai UNIQUE di DB. `nama_barang`, `kategori` (teks bebas dengan saran dari kategori yang sudah ada: ATK, UKS, Lab IPA, Mebel, Elektronik).
- **Kode otomatis memakai awalan yang bisa didaftarkan sendiri** (§11 no. 8). Daftarnya disimpan di kunci setting `inventory_kode_prefix` (JSON array, ikut sync, bawaan `["BRG"]`) dan dikelola dari halaman Inventaris oleh pemegang `inventory.manage`. Awalan berupa 1 sampai 6 huruf atau angka, maksimal 20 awalan, dan awalan teratas menjadi pilihan bawaan. Kode kosong diisi nomor urut per awalan (`UKS-0001`, `UKS-0002`). Hanya kode berbentuk `AWALAN-angka` yang dihitung. Menghapus awalan tidak mengubah kode yang sudah ada.
- Nomor urut dihitung dari data yang terlihat perangkat pencatat, jadi dua perangkat offline bisa menerbitkan nomor yang sama. DB tetap tanpa UNIQUE (outbox tidak macet), dan barang dengan kode kembar ditandai **kode ganda** di daftar barang supaya salah satunya diubah manual.
- `tipe`: `Aset` atau `Habis Pakai`.
- `satuan`: pcs, rim, lembar, botol, strip, tablet, kotak, set, ml.
- `bisa_expired`: bila 1, setiap Masuk wajib mengisi `tanggal_expired`.
- `stok_minimum`: dibandingkan dengan total stok kondisi Baik di semua tempat.
- `tempat_utama`: tempat yang terisi otomatis di formulir.
- **Setelah barang punya mutasi, `satuan` dan `bisa_expired` dikunci.** Mengubah satuan mengubah arti seluruh riwayat. Mengubah `bisa_expired` membuat mutasi lama tidak punya batch.
- Barang dinonaktifkan, tidak dihapus.

### 4.3 Barang masuk
Alasan: `Pengadaan`, `Hibah`, `Saldo Awal` (dipakai sekali saat sekolah mulai memakai modul ini). Isian: tanggal, tempat tujuan, kondisi (khusus aset), jumlah, sumber dana (teks bebas dengan saran BOSP Reguler, BOSP Kinerja, BOP, APBD, Yayasan, Komite, Hibah), nomor nota (opsional), harga satuan dalam rupiah bulat (opsional), dan `tanggal_expired` bila barangnya ber-expired.

Sumber dana sengaja tidak memakai CHECK. Namanya berganti mengikuti regulasi (BOS → BOSP) dan berbeda per daerah, sedangkan setiap nilai baru di CHECK cloud berarti migrasi.

### 4.4 Barang keluar
| Alasan | Penerima wajib? | Izin |
|---|---|---|
| `Pemakaian` (ATK untuk ujian, obat untuk siswa sakit) | Ya | `record` |
| `Peminjaman` (proyektor dipinjam selama KBM) | Ya | `record` |
| `Rusak/Afkir` | Tidak | `adjust` |
| `Hilang` | Tidak | `adjust` |
| `Kedaluwarsa` | Tidak | `adjust` |

Tipe penerima:
- `Personil`: siswa, guru, atau pegawai dari `master_data`. UI menampilkan jenis personil dan kelasnya.
- `Rombel`: kelas dari `akademik_rombel`.
- `Unit`: teks bebas seperti TU, UKS, Yayasan, Perpustakaan, dengan saran dari daftar tempat. `penerima_id` dibiarkan kosong.
- `Umum`.

`penerima_nama` disimpan sebagai salinan supaya riwayat tetap terbaca bila personilnya dinonaktifkan. `keperluan` wajib diisi untuk Pemakaian dan Peminjaman, maksimal 200 karakter. Teks bantuannya mengingatkan petugas untuk tidak menulis keluhan atau diagnosis (§11 no. 1).

**Obat untuk seseorang dicatat lewat kunjungan UKS (§4.11), bukan lewat formulir ini.** Mutasi yang dibuat kunjungan memakai penerima `Unit` "UKS" dan `id_ref` berisi nomor kunjungan. Nama penerimanya tidak pernah masuk `inventory_mutasi`, karena tabel itu tersalin ke semua perangkat. Sebelum Fase 4 selesai, obat UKS dicatat dengan penerima `Unit` "UKS".

### 4.5 Pindah
Satu mutasi bisa memindahkan tempat, mengubah kondisi, atau keduanya. Contoh:
- 30 bangku dari Gudang ke Kelas X RPL 1 (alasan `Distribusi`).
- 3 kursi di Ruang TU dari Baik ke Rusak Ringan (alasan `Perubahan Kondisi`).
- 2 strip paracetamol dari Gudang ke UKS (batch ikut pindah).

### 4.6 Peminjaman & pengembalian
Pengembalian adalah mutasi Masuk beralasan `Pengembalian` yang `id_ref`-nya menunjuk mutasi Peminjaman. Jumlah yang belum kembali dihitung dari jumlah dipinjam dikurangi total pengembaliannya. Daftar "Belum kembali" masuk Fase 2.

### 4.7 Pemantauan kedaluwarsa
- `sisa_hari = julianday(tanggal_expired) - julianday(date('now','+7 hours'))`, dihitung SQLite dengan tanggal WIB.
- **Aman:** sisa > 30. **Waspada:** 0 ≤ sisa ≤ 30. **Kedaluwarsa:** sisa < 0.
- Hari yang sama dengan `tanggal_expired` termasuk Waspada, karena label "ED" pada obat berarti masih boleh dipakai sampai tanggal itu. Draf memakai `<= 0`, yang membuat obat dianggap kedaluwarsa sehari lebih cepat.
- Yang dinilai hanya batch dengan saldo > 0.
- Ambang 30 hari ditulis sekali di Rust dan sekali di TS sebagai `INVENTORY_EXPIRY_WARNING_DAYS`, lalu diuji dengan vektor kembar. Setting baru dibuat hanya bila ada sekolah yang memintanya.
- Saat mengeluarkan barang ber-expired, formulir otomatis memilih batch yang paling dekat kedaluwarsanya (FEFO). Petugas tetap bisa memilih batch lain.
- Batch kedaluwarsa memunculkan tombol **Catat pemusnahan**, yaitu Keluar dengan alasan `Kedaluwarsa` (butuh `adjust`), lalu bisa dicetak berita acaranya.

### 4.8 Kartu stok
Riwayat mutasi per barang (bisa difilter per tempat) beserta saldo berjalannya, dalam rentang tanggal. Saldo awal rentang = jumlah semua mutasi sebelum tanggal awal. Rentang bawaannya 1 bulan dan wajib dibatasi (`audit:list-bound`).

### 4.9 Stock opname
Opname tidak punya tabel sendiri:
1. Pilih tempat. Aplikasi menampilkan saldo sistem per barang × kondisi × batch di tempat itu.
2. Petugas mengisi jumlah fisik.
3. Untuk setiap selisih, aplikasi menulis mutasi Masuk atau Keluar beralasan `Selisih Opname`. Semua mutasi itu memakai `nomor_dokumen` yang sama (`OPN-<tanggal>-<acak>`).
4. Berita acara opname dicetak dari mutasi dengan nomor dokumen itu.

Riwayat lama tidak diubah sama sekali.

### 4.10 Peringatan
- **Stok menipis:** total stok kondisi Baik < `stok_minimum`.
- **Kedaluwarsa:** batch Waspada dan Kedaluwarsa.
- **Stok minus:** saldo < 0 di suatu barang × tempat × kondisi × batch. Lihat §6.3.

### 4.11 Buku Kunjungan UKS (Fase 4)
Mencatat setiap orang yang datang ke UKS: siswa, guru, atau pegawai.

**Membuka kunjungan** (saat orangnya datang):
- **Nama:** dipilih dari `master_data`. Tetap bisa dipilih saat offline karena data personil ada di snapshot.
- **Kelas/rombel:** diisi otomatis dari rombel aktif siswa, lalu disimpan sebagai **salinan teks**. Kelas berganti setiap tahun ajaran, dan riwayat harus tetap menunjukkan kelas saat kejadian. Untuk guru dan pegawai kolom ini kosong.
- **Tanggal dan jam masuk:** default dari jam SQLite WIB (`datetime('now','+7 hours')`). Bisa dikoreksi untuk pencatatan susulan.
- **Keluhan:** teks bebas.

**Selama di UKS atau saat menutup kunjungan:**
- **Tindakan:** teks bebas, misalnya "Kompres, istirahat 30 menit".
- **Obat yang diberikan:** nol atau lebih baris berisi barang, batch (FEFO otomatis), dan jumlah. Setiap baris menjadi mutasi Keluar `Pemakaian` dengan penerima `Unit` "UKS" dan `id_ref` = `id_kunjungan`. Kunjungan dan mutasinya ditulis **dalam satu transaksi**, jadi stok obat tidak pernah perlu dicatat dua kali. Obat yang salah dicatat dibetulkan dengan Pembatalan (§6.5).
- **Jam keluar:** kosong selama orangnya masih di UKS.
- **Tindak lanjut:** **teks bebas** (§11 no. 6), misalnya "Kembali ke kelas", "Pulang, dijemput ayah", "Dirujuk ke Puskesmas". Isian ini menawarkan saran dari tindak lanjut yang pernah ditulis di perangkat itu, dengan cara yang sama seperti isian Tempat.
- **Petugas:** diambil dari sesi.

**Menutup kunjungan** berarti mengisi jam keluar dan tindak lanjut. Layar utama menampilkan **"Sedang di UKS"**, yaitu kunjungan yang jam keluarnya masih kosong. Petugas cukup mengetuk satu nama untuk menutupnya.

**Pemberitahuan WhatsApp ke wali** (khusus siswa):
- Sakelar induk `wa_notify_uks` di `setting_gex_system` (ikut sync) bawaannya **mati**, sama seperti keempat sakelar `wa_notify_*` lain.
- Bila sakelar hidup, formulir penutupan menampilkan kotak centang **"Kabari wali lewat WhatsApp"** yang bawaannya tidak dicentang. Karena tindak lanjut berupa teks bebas, aplikasi tidak bisa memutuskan sendiri kapan pesan perlu dikirim (misalnya saat "Pulang" atau "Dirujuk"). Petugas yang memutuskan.
- Pesan masuk antrean `notifikasi_wa` **saat kunjungan ditutup**, di dalam transaksi lokal yang sama (`queue_wa_notification_tx`). Jenisnya `uks` dan `dedupe_key`-nya `uks:<id_kunjungan>`, jadi satu kunjungan paling banyak menghasilkan satu pesan.
- Templatenya bisa disunting lewat `wa_template_uks` (izin `notification.template`). Isian yang tersedia: `{nama}` (wajib), `{rombel}` (nama yang sama dengan template WA lain; dulu ditulis `{kelas}` di draf ini), `{tanggal}`, `{jam_masuk}`, `{jam_keluar}`, `{tindak_lanjut}`, `{keluhan}`.
- Template bawaan **tidak** memakai `{keluhan}`: "Yth. Wali Murid dari {nama} ({rombel}). Kami informasikan bahwa ananda mendapat penanganan di UKS sekolah pada {tanggal} pukul {jam_masuk}. Tindak lanjut: {tindak_lanjut}." Alasannya, isi pesan bisa dibaca siapa pun yang punya akses tinjauan antrean WA. Sekolah boleh menambahkan `{keluhan}` dengan sadar.
- Aturan render dan validasi template ditulis kembar di `wa_notification.rs` dan `validations/wa-notification.ts`, seperti template lain.

**Konsekuensi pola datanya:**
- `uks_kunjungan` memakai pola `absensi_foto`: ditulis lokal, didorong ke cloud lewat outbox, dan **tidak** pernah ditarik ke perangkat lain.
- Perangkat pencatat (HP atau laptop UKS) membuka dan menutup kunjungan sepenuhnya offline. Daftar "Sedang di UKS" di perangkat itu berisi baris lokalnya sendiri.
- Perangkat lain hanya bisa melihat atau menutup kunjungan saat online. Daftarnya dibaca dari cloud, dan penutupannya ditulis langsung ke cloud, seperti `mobile_cancel_wa_notification`. Menulis ke SQLite lokal di perangkat yang tidak punya barisnya akan mengenai nol baris tetapi tetap melapor sukses.
- Riwayat dan rekap kunjungan (per bulan, per kelas, per keluhan) dibaca dari cloud, jadi butuh jaringan. Perangkat pencatat menggabungkan baris lokalnya yang belum terkirim, dengan dedupe berdasarkan `id_kunjungan`, seperti `gabung_antrean_wa`. Halamannya wajib mengatakan "butuh jaringan" alih-alih menampilkan daftar kosong.

## 5. Model data

Skema naik dari versi 34 ke 35 (hitung lagi di kode saat mulai, karena angka ini bisa sudah bergeser). Fase 1 menambah dua tabel, dan Fase 4 menambah satu tabel di luar snapshot (§5.4). Kedua tabel Fase 1 masuk `SNAPSHOT_TABLES` (`sync.rs`) dan `SNAPSHOT_SOURCES` (`turso.rs`). DDL ditulis sama persis di `storage.rs`, `turso.rs::ensure_schema`, dan `db-schema.ts` + `db-migrations.ts`.

Aturan yang berlaku untuk keduanya: PK berupa TEXT yang dibuat klien (bukan AUTOINCREMENT), tidak ada UNIQUE selain PK, semua tanggal bertipe TEXT `YYYY-MM-DD`, `created_at`/`updated_at` memakai `datetime('now')` seperti `hari_libur_whitelist`, dan tanggal operasional dihitung dengan `date('now','+7 hours')`.

### 5.1 `inventory_barang`
```sql
CREATE TABLE IF NOT EXISTS inventory_barang (
  id_barang TEXT PRIMARY KEY,               -- 'brg-<128 bit acak>'
  kode_barang TEXT NOT NULL,                 -- unik dicek di aplikasi
  nama_barang TEXT NOT NULL,
  kategori TEXT,
  tipe TEXT NOT NULL CHECK (tipe IN ('Aset', 'Habis Pakai')),
  satuan TEXT NOT NULL,
  bisa_expired INTEGER NOT NULL DEFAULT 0 CHECK (bisa_expired IN (0, 1)),
  stok_minimum INTEGER NOT NULL DEFAULT 0 CHECK (stok_minimum >= 0),
  tempat_utama TEXT,
  catatan TEXT,
  status_aktif INTEGER NOT NULL DEFAULT 1 CHECK (status_aktif IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```
Tidak ada kolom stok di tabel ini. Itu disengaja, lihat §0 no. 1.

### 5.2 `inventory_mutasi` (append-only)
```sql
CREATE TABLE IF NOT EXISTS inventory_mutasi (
  id_mutasi TEXT PRIMARY KEY,               -- 'mts-<128 bit acak>'; Pembatalan: 'batal-' || id_ref
  id_barang TEXT NOT NULL,
  jenis TEXT NOT NULL CHECK (jenis IN ('Masuk', 'Keluar', 'Pindah')),
  alasan TEXT NOT NULL CHECK (alasan IN (
    'Saldo Awal', 'Pengadaan', 'Hibah', 'Pengembalian',
    'Pemakaian', 'Peminjaman', 'Rusak/Afkir', 'Hilang', 'Kedaluwarsa',
    'Distribusi', 'Perubahan Kondisi',
    'Selisih Opname', 'Pembatalan')),
  tanggal TEXT NOT NULL,                     -- tanggal operasional WIB, tidak boleh di masa depan
  jumlah INTEGER NOT NULL CHECK (jumlah > 0),
  tempat_asal TEXT,                          -- NULL untuk Masuk
  kondisi_asal TEXT CHECK (kondisi_asal IN ('Baik', 'Rusak Ringan', 'Rusak Berat')),
  tempat_tujuan TEXT,                        -- NULL untuk Keluar
  kondisi_tujuan TEXT CHECK (kondisi_tujuan IN ('Baik', 'Rusak Ringan', 'Rusak Berat')),
  id_batch TEXT,                             -- barang ber-expired: id_mutasi Masuk asal batch
  tanggal_expired TEXT,                      -- hanya pada Masuk barang ber-expired
  id_ref TEXT,                               -- Pengembalian -> Peminjaman; Pembatalan -> mutasi yang dibatalkan; obat UKS -> id_kunjungan
  penerima_tipe TEXT CHECK (penerima_tipe IN ('Personil', 'Rombel', 'Unit', 'Umum')),
  penerima_id TEXT,                          -- id_unik master_data / id_rombel; NULL untuk Unit dan Umum
  penerima_nama TEXT,
  keperluan TEXT,
  sumber_dana TEXT,
  nomor_dokumen TEXT,
  harga_satuan INTEGER CHECK (harga_satuan IS NULL OR harga_satuan >= 0),  -- rupiah bulat
  catatan TEXT,
  dicatat_oleh TEXT NOT NULL,                -- username dari SESI, tidak pernah dari payload
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_inventory_mutasi_barang_tanggal ON inventory_mutasi(id_barang, tanggal);
CREATE INDEX IF NOT EXISTS idx_inventory_mutasi_batch ON inventory_mutasi(id_batch);
CREATE INDEX IF NOT EXISTS idx_inventory_mutasi_ref ON inventory_mutasi(id_ref);
```

Pasangan jenis dan alasan yang sah dicek di aplikasi, tidak di CHECK, dan aturannya ditulis kembar di Rust dan TS:

| Jenis | Alasan sah | asal | tujuan |
|---|---|---|---|
| Masuk | Saldo Awal, Pengadaan, Hibah, Pengembalian, Selisih Opname, Pembatalan | NULL | wajib |
| Keluar | Pemakaian, Peminjaman, Rusak/Afkir, Hilang, Kedaluwarsa, Selisih Opname, Pembatalan | wajib | NULL |
| Pindah | Distribusi, Perubahan Kondisi, Pembatalan | wajib | wajib |

Aturan kondisi: untuk barang `Habis Pakai` kondisinya selalu `'Baik'`. Untuk Masuk barang ber-expired, `id_batch = id_mutasi` miliknya sendiri, sehingga setiap baris punya batch dan rumus saldo tidak butuh cabang khusus. Tempat dinormalisasi sebelum disimpan (§4.1). Normalisasinya ditulis kembar di Rust dan TS.

### 5.3 Rumus stok (satu-satunya sumber kebenaran)
```sql
-- batas: satu baris per barang × tempat × kondisi × batch, tidak tumbuh per hari
SELECT id_barang, MIN(tempat) AS tempat, kondisi, id_batch, SUM(delta) AS saldo
FROM (
  SELECT id_barang, tempat_tujuan AS tempat, kondisi_tujuan AS kondisi, id_batch, jumlah AS delta
    FROM inventory_mutasi WHERE tempat_tujuan IS NOT NULL
  UNION ALL
  SELECT id_barang, tempat_asal, kondisi_asal, id_batch, -jumlah
    FROM inventory_mutasi WHERE tempat_asal IS NOT NULL
)
GROUP BY id_barang, LOWER(tempat), kondisi, id_batch;
```
Rumus ini ditulis sekali di Rust dan sekali di TS, lalu diuji dengan vektor kembar. Saldo berjalan di kartu stok memakai `SUM(delta) OVER (ORDER BY tanggal, created_at, id_mutasi)`.

Soal ukuran: sekolah menengah diperkirakan menghasilkan beberapa ribu mutasi per tahun. Bila nanti terbukti lambat, tambahkan cache saldo **lokal** yang tidak ikut sync dan bisa dibangun ulang dari mutasi. Jangan pernah menambahkan kolom stok yang ikut sync.

### 5.4 `uks_kunjungan` (Fase 4, di luar `SNAPSHOT_TABLES`)
Tabel ini ada di SQLite lokal dan di cloud, tetapi tidak masuk `SNAPSHOT_TABLES` maupun `SNAPSHOT_SOURCES`. Tabel ini didaftarkan di daftar tabel non-sync lokal **dan** cloud di `audit-sync-contract.ts`, seperti `absensi_foto`.
```sql
CREATE TABLE IF NOT EXISTS uks_kunjungan (
  id_kunjungan TEXT PRIMARY KEY,            -- 'uks-<128 bit acak>'
  id_personil TEXT NOT NULL,                 -- master_data.id_unik
  nama_personil TEXT NOT NULL,               -- salinan
  kelas TEXT,                                -- salinan nama rombel saat kejadian; NULL untuk guru/pegawai
  tanggal TEXT NOT NULL,                     -- WIB
  jam_masuk TEXT NOT NULL,                   -- 'HH:MM', WIB
  jam_keluar TEXT,                           -- NULL = masih di UKS
  keluhan TEXT NOT NULL,
  tindakan TEXT,
  tindak_lanjut TEXT,                        -- teks bebas, wajib saat menutup
  catatan TEXT,
  dicatat_oleh TEXT NOT NULL,                -- dari SESI
  ditutup_oleh TEXT,                         -- dari SESI
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_uks_kunjungan_tanggal ON uks_kunjungan(tanggal);
CREATE INDEX IF NOT EXISTS idx_uks_kunjungan_personil ON uks_kunjungan(id_personil, tanggal);
```
Obat yang diberikan **tidak** disimpan di tabel ini. Daftarnya dibaca dari `inventory_mutasi WHERE id_ref = id_kunjungan`, jadi stok dan catatan kunjungan tidak bisa saling bertentangan.

`notifikasi_wa.jenis` punya CHECK yang membatasi nilainya ke enam jenis yang ada sekarang. Menambah `'uks'` berarti **membangun ulang tabel itu** (buat tabel baru, salin, ganti nama) di `storage.rs`, `turso.rs::ensure_schema`, dan `db-migrations.ts`, karena SQLite tidak bisa mengubah CHECK lewat `ALTER`. Daftar kanonik jenisnya juga diperbarui di tiga tempat yang wajib sama. Ini bagian paling berisiko di Fase 4, jadi wajib diuji pada salinan database cloud yang sudah berisi antrean.

## 6. Aturan bisnis

### 6.1 Validasi sebelum menulis ke SQLite lokal
Rust memvalidasi semuanya sebelum menulis lokal dan mendaftarkan outbox, supaya cloud tidak menolak lalu outbox macet: enum sesuai CHECK, `jumlah > 0`, pasangan jenis-alasan, asal/tujuan wajib atau NULL sesuai tabel, `tanggal_expired` wajib bila `bisa_expired`, `id_batch` wajib untuk keluar/pindah barang ber-expired, penerima wajib untuk Pemakaian/Peminjaman, panjang teks dibatasi (tempat maksimal 80 karakter), `tanggal` ≤ hari ini (WIB). Zod memakai `.strict()`.

### 6.2 Cek saldo
Keluar dan Pindah ditolak bila saldo **lokal** di tempat × kondisi × batch asal kurang dari jumlah yang diminta. Pengecekan ini memakai saldo saat ini, bukan saldo pada `tanggal` mutasi. Pencatatan susulan yang membuat saldo masa lalu minus tetap diterima.

### 6.3 Cloud tidak pernah menolak karena stok
Dua perangkat offline bisa sama-sama mengeluarkan 5 bungkus terakhir. Bila cloud menolak push kedua (lewat CHECK, trigger, atau handler), event itu gagal permanen dan outbox macet. Barangnya pun sudah benar-benar keluar dari rak. Karena itu cloud menerima mutasi apa adanya, saldo boleh minus, dan dasbor menampilkan **Stok minus, perlu opname**. Opname adalah cara membetulkannya.

### 6.4 Handler cloud
Handler `inventory-mutation/create` memakai `INSERT ... ON CONFLICT(id_mutasi) DO NOTHING`. Mutasi tidak pernah di-update, dan event yang terkirim dua kali tidak berefek.

### 6.5 Pembatalan
Membatalkan mutasi X berarti menulis mutasi kebalikannya: asal dan tujuan ditukar, jumlah dan batch sama, `alasan = 'Pembatalan'`, `id_ref = X`, dan `id_mutasi = 'batal-' || X`. Karena id-nya ditentukan dari X, dua perangkat offline yang membatalkan mutasi yang sama akan menghasilkan PK yang sama, dan pembatalan kedua tidak berefek. Pembatalan tidak bisa dibatalkan lagi. Untuk itu, catat mutasi baru.

### 6.6 Pengembalian
Jumlah total pengembalian untuk satu Peminjaman tidak boleh melebihi jumlah yang dipinjam (dicek di aplikasi). Barang kembali ke tempat dan kondisi yang dipilih petugas, jadi proyektor yang kembali dalam keadaan rusak langsung tercatat Rusak Ringan.

### 6.7 Waktu
`tanggal` adalah tanggal operasional WIB. Defaultnya `date('now','+7 hours')` dari SQLite, tidak pernah `new Date()` di JS. `created_at` hanya dipakai untuk pengurutan dan audit.

### 6.8 Kunjungan UKS
- Membuka kunjungan, setiap pemberian obat, dan penutupan (beserta antrean WA-nya) masing-masing ditulis dalam **satu transaksi lokal**, bersama event outbox-nya.
- `jam_keluar` tidak boleh lebih awal dari `jam_masuk` pada tanggal yang sama. `tindak_lanjut` wajib diisi saat menutup.
- Kunjungan yang sudah ditutup masih bisa disunting tindakan dan tindak lanjutnya dengan `uks.record`. Cloud menerima event `uks-visit/save` sebagai upsert seluruh baris. Biasanya hanya satu perangkat yang menyentuh satu kunjungan, jadi siapa terakhir, dia menang sudah cukup.
- Menghapus kunjungan (`uks.delete`) tidak menghapus mutasi obatnya. Stok yang sudah keluar tetap keluar, dan mutasinya tetap menunjuk `id_kunjungan` yang sudah tidak ada. Kartu stok menampilkannya sebagai "Kunjungan UKS (dihapus)".

## 7. Arsitektur & sync

- **Rute kanonik baru** (tambahkan ke `CANONICAL_SYNC_ROUTES`): `("inventory-item", "save")`, `("inventory-mutation", "create")`. Rute delete tidak ada: barang dinonaktifkan lewat `save`, dan mutasi tidak pernah dihapus.
- **Fase 4** menambah `("uks-visit", "save")` dan `("uks-visit", "delete")`. Command untuk perangkat yang tidak memegang barisnya (melihat, menutup, atau menghapus dari cloud) memanggil `get_turso_client()` langsung, seperti command BK dan `mobile_cancel_wa_notification`.
- **Rust:** modul baru `desktop/inventory.rs` (logika dan command). Daftarkan di daftar salin `sync-rust-modules.ts`, lalu daftarkan command Mobile di `lib.rs`, `build.rs`, dan `capabilities/default.json`.
- **TS:** `lib/validations/inventory.ts` (aturan kembar), `lib/server/inventory/*` (Web), `lib/gateways/inventory.ts`, dan route handler `POST /api/inventory/*` dengan `assertSameOriginMutation`.
- **Mobile:** salinan lewat `sync-frontend-lib.ts` dan `sync-rust-modules.ts`. Jangan menyunting hasil salinan.
- **Audit yang terdampak:** `audit:schema`, `audit:contract` (rute, paritas `SNAPSHOT_TABLES` ↔ `SNAPSHOT_SOURCES`), `audit:sql`, `audit:list-bound` (`inventory_mutasi` bertambah setiap hari, jadi setiap daftar wajib dibatasi; rumus saldo dan daftar saran tempat diberi penanda `-- batas:`), `audit:ui-guard`, `audit:a11y`, `audit:page-guard`, `audit:dialog`, `audit:route-guard`.
- **Ukuran sync:** kedua tabel kecil dan berisi teks, jadi aman masuk snapshot. Foto barang sengaja tidak ada di v1. Bila nanti ditambahkan, foto harus di luar snapshot seperti `siswa_foto`.

## 8. Antarmuka

Satu halaman `/inventaris` dengan tab:

1. **Ringkasan:** empat angka (jumlah jenis barang, stok menipis, batch waspada/kedaluwarsa, stok minus). Setiap angka membuka daftar yang sudah terfilter.
2. **Barang:** tabel dengan filter kategori, tipe, dan tempat. Kolom stok berisi total kondisi Baik, dan bisa dibuka untuk melihat rincian per tempat × kondisi × batch beserta kartu stoknya.
3. **Catat:** satu formulir dengan pilihan Masuk / Keluar / Pindah. Isiannya berubah mengikuti pilihan, isian tanggal expired dan batch hanya muncul untuk barang ber-expired, dan pemilih penerima berubah mengikuti tipe penerima (Personil memakai pencarian `master_data` dengan nama kelas, Rombel memakai daftar kelas, Unit memakai teks dengan saran).
4. **Kedaluwarsa:** daftar batch berikut sisa hari dan tombol Catat pemusnahan.
5. **Opname:** alur §4.9.
6. **UKS** (Fase 4, dijaga `uks.view` / `uks.record`): daftar "Sedang di UKS", tombol "Kunjungan baru", riwayat, dan rekap. Tab ini bisa juga dibuat sebagai halaman sendiri `/uks` bila menu inventaris terasa penuh.

Ketentuan:
- Setiap handler yang menyimpan data dijaga `isSubmittingRef` (aturan 5). Semua dialog memakai `<Modal>`. Setiap isian punya label.
- Dark mode sebagai dasar, light mode lewat `globals.css` (Web/Desktop) dan variabel `data-theme` (Mobile).
- Di Mobile, tab Catat dan Kedaluwarsa diletakkan paling depan untuk petugas UKS. Setelah Fase 4, tab UKS yang paling depan.
- Teks UI tidak boleh memuat kata "SPPG".

## 9. Laporan & cetak
Laporan memakai alat yang sudah ada, tanpa dependensi baru:
- **Excel** lewat `src/lib/client/xlsx.ts`: rekap stok per tempat, kartu stok, dan rekap pengadaan per sumber dana per periode.
- **Cetak A4** lewat halaman cetak HTML (pola yang sama dengan cetak ID card): Berita Acara Serah Terima/Pengeluaran, Berita Acara Pemusnahan (Kedaluwarsa, Rusak/Afkir), dan Berita Acara Opname. PDF dibuat dari dialog cetak browser.
- Berkas di Android diserahkan lewat SAF (`android_fs_async`). Jangan menulis ke folder Download.

## 10. Fase rilis

**Fase 1: data dan transaksi (Web, Desktop, Mobile sekaligus)**
- Dua tabel di empat lapis, rute kanonik, validasi kembar, normalisasi tempat kembar, rumus saldo kembar beserta tesnya.
- Master barang.
- Masuk (termasuk Saldo Awal), Keluar Pemakaian, Pindah, Pembatalan.
- Batch dan pemilihan batch FEFO.
- Kartu stok.
- RBAC (empat izin dan area `inventory`).

**Fase 2: pemantauan** (keputusan rencana Fase 2: tanpa tanggal rencana kembali, opname bisa menambah barang yang ditemukan, Rusak/Afkir dan Hilang di tab Catat untuk pemegang `inventory.adjust`, pengembalian sebagian boleh)
- Tab Ringkasan dan peringatan (stok menipis, kedaluwarsa, stok minus).
- Tab Kedaluwarsa dan pemusnahan.
- Peminjaman, pengembalian, dan daftar Belum kembali.
- Rusak/Afkir, Hilang.
- Stock opname.

**Fase 3: laporan** (keputusan rencana Fase 3: berita acara dikelompokkan lewat nomor dokumen yang sama; cetak hanya di Web/Desktop karena WebView Android tidak punya dialog cetak; izin export dan cetak cukup `inventory.view`; opname yang semua cocok tidak menghasilkan berita acara; label QR aset dan opname dengan memindai label dipindah ke fase tersendiri)
- Export Excel dan tiga berita acara.
- Dikerjakan sebagai fase tersendiri (keputusan rencana: isi QR `INV:<id_barang>` karena kode bisa diubah dan bisa kembar; Aset +1 per pindaian ke baris Baik dimulai dari 1, Habis Pakai hanya membuka isian jumlah, baris yang tidak dipindai tetap sesuai sistem; barang yang tidak tercatat di tempat itu ditawarkan sebagai barang ditemukan; A4 3 × 8 label 64 × 33 mm tanpa tempat; jumlah bawaan Aset = total stok, Habis Pakai = 1; cetak hanya Web/Desktop). Rancangan awalnya: label QR aset (payload `INV:<kode_barang>`, **tanpa** karakter `|` supaya pemindai absensi tidak membacanya sebagai `id|token` dan mencatatnya di `log_scan`) dan opname dengan memindai label lewat kamera Mobile. Semuanya memakai `qrcode` dan `@zxing/browser` yang sudah terpasang.

**Fase 4: Buku Kunjungan UKS** (dipecah atas keputusan User: 4a = kunjungan, obat, riwayat, rekap, halaman `/uks`; 4b = WhatsApp ke wali. Kunjungan perangkat lain diubah setelah salinannya diambil dari cloud; salinan lokal yang sudah ditutup dan terkirim dihapus setelah 30 hari; halaman memberi tahu saat perangkat offline beserta kapan sinkronisasi terakhir berhasil)
- Tabel `uks_kunjungan` di luar snapshot (lokal + cloud), rute `uks-visit/*`, izin `uks.*`.
- Membuka dan menutup kunjungan, daftar "Sedang di UKS", serta obat lewat kunjungan (mutasi dalam transaksi yang sama).
- Riwayat dan rekap dari cloud, digabung dengan baris lokal yang belum terkirim.
- Membangun ulang `notifikasi_wa` untuk jenis `uks`, sakelar `wa_notify_uks`, template `wa_template_uks`, dan kotak centang "Kabari wali lewat WhatsApp".

## 11. Keputusan

Diputuskan User pada 7 Oktober 2026.

1. **Data kesehatan di UKS tidak pernah masuk tabel yang tersalin ke semua perangkat.**
   - `inventory_mutasi` tersalin ke SQLite di **setiap** perangkat, termasuk terminal pemindai di lobi. Karena itu mutasi obat UKS hanya mencatat penerima `Unit` "UKS" dan nomor kunjungan, tanpa nama orang atau keluhan.
   - Siapa yang menerima, keluhan, jam masuk dan keluar, dan tindak lanjutnya dicatat di Buku Kunjungan UKS (§4.11, Fase 4).
   - Tabel itu tidak cloud-only. Ia memakai pola `absensi_foto` dan `notifikasi_wa`: tabel lokal di luar `SNAPSHOT_TABLES` yang didorong ke cloud lewat outbox dan tidak pernah ditarik ke perangkat lain. HP UKS tetap bisa mencatat saat offline, sementara data kesehatan anak hanya ada di perangkat pencatat dan di cloud.
   - Harganya: riwayat dan rekap kunjungan butuh jaringan, kecuali baris milik perangkat pencatat sendiri.
2. **Izin masuk dan keluar tidak dipisah.** Cukup `inventory.record` (§3).
3. **Ambang waspada kedaluwarsa: 30 hari** (§4.7).
4. **Registri aset per unit ditunda** sampai setelah Fase 3. Sambil menunggu, aset bernilai tinggi dicatat per jumlah.
5. **Tempat berupa satu kolom teks bebas, tanpa tabel master dan tanpa integrasi kelas/rombel** (§4.1). Barang tidak selalu ada di kelas. Banyak yang ada di TU, kantor, atau yayasan, jadi isiannya harus bebas. Modul ini fokus ke inventaris.
6. **Buku Kunjungan UKS masuk sebagai Fase 4.** Tindak lanjutnya berupa teks bebas, bukan pilihan tetap, supaya bisa diisi sesuai keadaan.
7. **WhatsApp ke wali saat kunjungan ditutup: ya.** Sakelar induknya mati secara bawaan. Karena tindak lanjut berupa teks bebas, petugas yang memutuskan lewat kotak centang apakah wali dikabari (§4.11).
8. **Awalan kode barang bisa didaftarkan sendiri, dengan nomor urut per awalan** (§4.2). User memilih nomor urut meskipun dua perangkat offline bisa menerbitkan nomor kembar. Kembaran ditandai "kode ganda". Pengaturannya di halaman Inventaris (`inventory.manage`), dan awalan teratas menjadi bawaan.

## 12. Kriteria penerimaan
- Dua perangkat offline mengeluarkan barang yang sama dari stok 10, masing-masing 2 dan 3. Setelah keduanya sync, ketiga build menampilkan **5**.
- Dua perangkat offline membatalkan mutasi yang sama. Setelah sync, pembatalannya hanya terhitung sekali.
- Mengeluarkan melebihi saldo lokal ditolak dengan pesan yang jelas. Saldo minus akibat dua perangkat offline muncul di peringatan "Stok minus" tanpa ada event outbox yang gagal.
- Batch yang `tanggal_expired`-nya hari ini berstatus Waspada, dan besoknya berstatus Kedaluwarsa (dihitung dengan tanggal WIB).
- Tempat "ruang tu" yang diketik saat "Ruang TU" sudah ada tersimpan sebagai "Ruang TU". Dua ejaan yang berbeda huruf besar-kecilnya dari dua perangkat offline terhitung sebagai satu tempat.
- Setelah ada mutasi, `satuan` dan `bisa_expired` tidak bisa diubah.
- Payload yang memuat `dicatat_oleh` ditolak sebagai data tidak valid (Zod `.strict()` di Web, `deny_unknown_fields` di Rust). Nilainya selalu diambil dari sesi.
- Tes vektor kembar Rust ↔ TS untuk rumus saldo, normalisasi tempat, status expired, dan validasi pasangan jenis-alasan lulus.
- **Fase 4:**
  - HP UKS offline membuka kunjungan, memberikan 2 tablet obat, lalu menutupnya. Stok obat langsung berkurang 2 di HP itu. Setelah sync, perangkat lain melihat stok berkurang tetapi SQLite lokalnya **tidak** memuat baris `uks_kunjungan` maupun nama siswa di `inventory_mutasi`.
  - Kelas yang tersimpan di kunjungan tidak berubah setelah siswa naik kelas.
  - Dengan `wa_notify_uks` mati, kotak centang WA tidak muncul dan tidak ada antrean. Dengan sakelar hidup dan kotak dicentang, satu kunjungan menghasilkan tepat satu baris `notifikasi_wa` berjenis `uks`, termasuk bila penutupan dikirim dua kali.
  - Migrasi bangun ulang `notifikasi_wa` mempertahankan semua baris dan status lama.
  - Halaman riwayat UKS tanpa jaringan menampilkan pesan "butuh jaringan", bukan daftar kosong.
- `bun run check` hijau di kedua workspace.
