# Memasang Manajemen Sekolah di server sendiri

Panduan ini untuk teknisi yang memasang aplikasi admin dan situs publik
sekolah di server milik sekolah.
Server tidak perlu internet untuk berjalan sehari-hari. Internet hanya dipakai
saat mengunduh image.

## Yang dibutuhkan

- Komputer atau server dengan Docker dan Docker Compose.
- Alamat dua image (aplikasi admin dan situs publik) serta akses registry dari
  Kemal Office Studio.
- Alamat IP tetap untuk server di jaringan sekolah, atau dua nama domain: satu
  untuk aplikasi admin, satu untuk situs publik.

## Langkah pemasangan

1. Salin folder ini ke server.
2. Masuk ke registry dengan akses yang Anda terima:
   `docker login <alamat-registry>`
3. Salin `.env.example` menjadi `.env`, lalu isi `KOS_WEB_IMAGE`,
   `KOS_PUBLIC_IMAGE`, `KOS_SITE_ADDRESS`, `KOS_PUBLIC_ADDRESS`, dan
   `KOS_SETUP_TOKEN`.
   Token bisa dibuat dengan `openssl rand -base64 32`.
4. Jalankan `docker compose up -d`.
5. Buka `https://<KOS_SITE_ADDRESS>/setup` di browser. Halaman itu menampilkan
   kode server, berawalan `S-`. Kirim kode itu kepada Kemal Office Studio untuk
   mendapatkan lisensi.
6. Setelah lisensi diterima, kembali ke `/setup`: isi token, data akun
   Superadmin, dan tempel teks lisensinya.
7. Cetak atau salin delapan kode pemulihan yang tampil. Kode itu hanya tampil
   sekali, dan menjadi satu-satunya jalan masuk bila password Superadmin
   terlupa.
8. Kosongkan `KOS_SETUP_TOKEN` di `.env`, lalu jalankan `docker compose up -d`
   sekali lagi.

## Situs publik

Situs publik dibuka di `https://<KOS_PUBLIC_ADDRESS>`. Isinya diatur dari
aplikasi admin, dan situs baru bisa tampil setelah Superadmin dibuat dan
lisensi terpasang.

Sebelum itu, dan setiap kali lisensinya tidak berlaku untuk server ini,
pengunjung melihat pemberitahuan "Situs ini sedang tidak tersedia". Halaman itu
sengaja tidak menyebut alasannya. Penyebab sebenarnya tampil di halaman masuk
aplikasi admin.

Bila lisensi dikunci ke alamat, alamat situs publik harus ikut tercantum di
lisensi, bersama alamat aplikasi admin.

## Lisensi

Kode server terikat pada database, bukan pada komputernya. Memindahkan folder
`data/database` ke server lain tidak mengubah kodenya, dan lisensinya tetap
berlaku. Database yang dibuat baru mendapat kode baru dan butuh lisensi baru.

Bila lisensi dikunci ke sebuah alamat, aplikasi hanya bisa dibuka lewat alamat
itu. Membukanya lewat alamat lain menampilkan layar aktivasi.

Saat masa sewa berakhir, aplikasi tetap bisa dibuka dalam mode baca-saja: data
bisa dilihat dan diekspor, tetapi tidak bisa diubah. Situs publik tetap tampil,
tetapi pendaftaran online ditutup sementara. Superadmin memasang lisensi
perpanjangan dari Pengaturan, bagian Lisensi.

## Peringatan sertifikat di jaringan lokal

Dengan `KOS_TLS=internal`, server membuat sertifikatnya sendiri, sehingga
browser menampilkan peringatan pada kunjungan pertama. Ada dua cara
menanganinya:

- Lanjutkan lewat peringatan itu di setiap perangkat.
- Pasang sertifikat akar server di setiap perangkat supaya peringatannya
  hilang. Berkasnya ada di
  `data/caddy/caddy/pki/authorities/local/root.crt`.

HTTPS tidak bisa dilewati. Browser hanya mengizinkan kamera, yang dipakai
pemindai QR dan foto bukti, pada alamat HTTPS.

## Cadangan

Seluruh data ada di folder `data/database`. Hentikan layanan dengan
`docker compose stop`, salin folder itu ke tempat lain, lalu jalankan
`docker compose start`.

## Memperbarui aplikasi

Ganti versi pada `KOS_WEB_IMAGE` di `.env`, lalu jalankan:

```
docker compose pull
docker compose up -d
```

## Aplikasi Desktop dan Mobile

Port database tidak dibuka secara bawaan. Bila Desktop atau Mobile perlu
menyambung ke database ini, ikuti catatan pada layanan `database` di
`docker-compose.yml`, dan pasang autentikasinya sebelum membuka port.
