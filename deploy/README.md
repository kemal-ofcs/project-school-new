# Memasang Manajemen Sekolah di server sendiri

Panduan ini untuk teknisi yang memasang aplikasi admin dan situs publik
sekolah di server milik sekolah.
Server tidak perlu internet untuk berjalan sehari-hari. Bila image diterima
sebagai berkas `.tar`, pemasangannya pun tidak butuh internet: berkas itu
memuat keempat image yang dipakai, termasuk database dan proxy. Yang harus
sudah terpasang di server hanya Docker.

Untuk server Windows tanpa Docker ada paket terpisah dengan panduannya sendiri
(`manajemen-sekolah-<versi>-windows.zip`).

## Yang dibutuhkan

- Komputer atau server dengan Docker dan Docker Compose.
- Image aplikasi dari Kemal Office Studio: sebagai satu berkas `.tar`, atau
  sebagai alamat registry beserta aksesnya.
- Alamat IP tetap untuk server di jaringan sekolah, atau dua nama domain: satu
  untuk aplikasi admin, satu untuk situs publik.

## Langkah pemasangan

1. Salin folder ini ke server.
2. Siapkan image-nya dengan salah satu cara:
   - Berkas `.tar`: `docker load -i manajemen-sekolah-<versi>.tar`
   - Registry: `docker login <alamat-registry>`
3. Salin `.env.example` menjadi `.env`, lalu isi `KOS_SITE_ADDRESS`,
   `KOS_PUBLIC_ADDRESS`, dan `KOS_SETUP_TOKEN`. Pada paket berkas `.tar`,
   `KOS_WEB_IMAGE` dan `KOS_PUBLIC_IMAGE` sudah terisi. Pada jalur registry,
   isi keduanya dengan alamat yang Anda terima. Cara mendapatkan isinya ada di
   bagian [Mengisi .env](#mengisi-env) di bawah.
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

## Mengisi .env

### KOS_SITE_ADDRESS dan KOS_PUBLIC_ADDRESS

Kedua isian ini adalah alamat yang nanti diketik di browser, tanpa `https://`.
Isinya tergantung siapa yang membuka aplikasi.

**Hanya di jaringan sekolah (WiFi atau LAN yang sama).** Pakai alamat IP
server:

1. Di terminal server, jalankan `hostname -I`. Angka pertama yang tampil,
   misalnya `192.168.1.10`, adalah alamat IP server di jaringan.
2. Isi:

   ```
   KOS_SITE_ADDRESS=192.168.1.10
   KOS_PUBLIC_ADDRESS=192.168.1.10:8443
   KOS_TLS=internal
   ```

   Situs publik memakai port `8443` karena kedua alamat harus berbeda, dan
   `docker-compose.yml` sudah membuka port itu.

Alamat IP ini bisa berubah setelah router atau server dinyalakan ulang, dan
aplikasi tidak lagi terbuka di alamat lama. Supaya tetap, atur "DHCP
reservation" untuk server ini di halaman router, atau beri alamat IP tetap di
pengaturan jaringan servernya.

**Dibuka dari internet.** Pakai nama domain milik sekolah:

1. Di panel penyedia domain, buka pengaturan DNS dan buat dua A record yang
   mengarah ke IP publik server, misalnya `admin` untuk aplikasi admin dan `@`
   atau `www` untuk situs publik.
2. Buka port 80 dan 443 (TCP) di firewall server (misalnya
   `sudo ufw allow 80,443/tcp`) dan, bila server ada di jaringan sekolah,
   teruskan kedua port itu dari router ke IP lokal server.
3. Isi:

   ```
   KOS_SITE_ADDRESS=admin.sekolah.sch.id
   KOS_PUBLIC_ADDRESS=www.sekolah.sch.id
   KOS_TLS=email-pengelola@sekolah.sch.id
   ```

   Dengan alamat email di `KOS_TLS`, sertifikat HTTPS resmi diterbitkan
   otomatis dan peringatan sertifikat tidak muncul.

Server di jaringan sekolah butuh IP publik untuk cara ini. Bandingkan IP WAN
di halaman router dengan hasil `curl ifconfig.me` di server. Bila berbeda,
koneksi internetnya memakai CGNAT dan server tidak bisa dijangkau dari
internet: minta IP publik ke penyedia internet, atau pasang di VPS.

### KOS_SETUP_TOKEN

Kata sandi sekali pakai untuk membuka halaman `/setup`. Token ini **bukan
lisensi** dan **bukan password Superadmin**: Anda membuatnya sendiri, dan
gunanya hanya supaya tidak ada orang lain yang mendahului Anda membuat akun
Superadmin pertama. Isinya minimal 32 karakter acak.

Cara membuatnya:

1. Di terminal server, jalankan:

   ```
   openssl rand -base64 32
   ```

2. Muncul satu baris berisi 44 karakter acak, misalnya `q8Zr2mVx...=`.
   Salin seluruh baris itu, termasuk tanda `=` di ujungnya bila ada.
3. Tempel di `.env` setelah tanda `=`, tanpa spasi dan tanpa tanda petik:

   ```
   KOS_SETUP_TOKEN=q8Zr2mVx...=
   ```

4. Simpan juga token itu di catatan. Nanti token ini diketik ulang di halaman
   `/setup`.

Di halaman `/setup` ada tiga isian yang berbeda: **token** (isi dengan
`KOS_SETUP_TOKEN` ini), **data Superadmin** (username dan password baru untuk
login sehari-hari), dan **teks lisensi** (dari Kemal Office Studio). Setelah
Superadmin dibuat, kosongkan lagi isian ini (langkah 8). Sejak itu, login cukup
memakai username dan password Superadmin.

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

Ganti versi pada `KOS_WEB_IMAGE` dan `KOS_PUBLIC_IMAGE` di `.env`, lalu:

- Berkas `.tar`: muat berkas versi baru dengan `docker load -i <berkas>`, lalu
  jalankan `docker compose up -d`.
- Registry: jalankan `docker compose pull`, lalu `docker compose up -d`.

Data tidak tersentuh: ia ada di folder `data/`, di luar image.

## Aplikasi Desktop dan Mobile

Port database tidak dibuka secara bawaan. Bila Desktop atau Mobile perlu
menyambung ke database ini, ikuti catatan pada layanan `database` di
`docker-compose.yml`, dan pasang autentikasinya sebelum membuka port.
