# Memasang Manajemen Sekolah di Windows

Panduan ini untuk teknisi yang memasang aplikasi admin dan situs publik
sekolah di komputer Windows 64-bit milik sekolah. Tidak ada yang perlu dipasang
lebih dulu: semua yang dibutuhkan sudah ada di folder ini.

Server tidak perlu internet. Komputer dan HP lain cukup berada di jaringan
yang sama dengan server.

## Langkah pemasangan

1. Ekstrak folder ini ke lokasi tetap, misalnya `C:\ManajemenSekolah`. Jangan
   menjalankannya dari dalam berkas zip.
2. Salin `.env.example` menjadi `.env`, lalu isi `KOS_SITE_ADDRESS`,
   `KOS_PUBLIC_ADDRESS`, dan `KOS_SETUP_TOKEN`.
3. Klik dua kali `Mulai.cmd`. Bila Windows Firewall bertanya, izinkan akses
   untuk jaringan privat.
4. Buka `https://<KOS_SITE_ADDRESS>/setup` di browser. Halaman itu menampilkan
   kode server, berawalan `S-`. Kirim kode itu kepada Kemal Office Studio untuk
   mendapatkan lisensi.
5. Setelah lisensi diterima, kembali ke `/setup`: isi token, data akun
   Superadmin, dan tempel teks lisensinya.
6. Cetak atau salin delapan kode pemulihan yang tampil. Kode itu hanya tampil
   sekali, dan menjadi satu-satunya jalan masuk bila password Superadmin
   terlupa.
7. Kosongkan `KOS_SETUP_TOKEN` di `.env`, jalankan `Hentikan.cmd`, lalu
   `Mulai.cmd` lagi.

## Menyala otomatis

Klik kanan `Pasang-otomatis.cmd`, lalu pilih "Run as administrator". Setelah
itu aplikasi menyala sendiri setiap Windows dinyalakan, tanpa perlu ada yang
login. `Copot-otomatis.cmd` membatalkannya.

Tanpa langkah ini, aplikasi hanya berjalan selama jendela `Mulai.cmd` terbuka.

## Database

Bila `KOS_DATABASE_URL` di `.env` dikosongkan, data disimpan sebagai berkas di
folder `data`. Cara ini paling sederhana, tetapi hanya untuk versi Web:
aplikasi Desktop dan Mobile tidak bisa terhubung ke berkas itu.

Bila Desktop atau Mobile juga dipakai, isi `KOS_DATABASE_URL` dengan alamat
server database (libSQL di komputer lain dalam jaringan, atau Turso).

## Peringatan sertifikat

Server membuat sertifikat HTTPS-nya sendiri, sehingga browser menampilkan
peringatan pada kunjungan pertama. Ada dua cara menanganinya:

- Lanjutkan lewat peringatan itu di setiap perangkat.
- Pasang sertifikat akar server di setiap perangkat supaya peringatannya
  hilang. Berkasnya ada di
  `data\caddy\caddy\pki\authorities\local\root.crt`.

HTTPS tidak bisa dilewati. Browser hanya mengizinkan kamera, yang dipakai
pemindai QR dan foto bukti, pada alamat HTTPS.

## Lisensi

Kode server terikat pada database, bukan pada komputernya. Memindahkan folder
`data` ke server lain tidak mengubah kodenya, dan lisensinya tetap berlaku.
Database yang dibuat baru mendapat kode baru dan butuh lisensi baru.

Saat masa sewa berakhir, aplikasi tetap bisa dibuka dalam mode baca-saja: data
bisa dilihat dan diekspor, tetapi tidak bisa diubah. Situs publik tetap tampil,
tetapi pendaftaran online ditutup sementara. Superadmin memasang lisensi
perpanjangan dari Pengaturan, bagian Lisensi.

## Cadangan

Seluruh data ada di folder `data`. Jalankan `Hentikan.cmd`, salin folder itu ke
tempat lain, lalu jalankan `Mulai.cmd` lagi.

## Memperbarui aplikasi

1. Jalankan `Hentikan.cmd`.
2. Ekstrak paket versi baru ke folder baru.
3. Pindahkan folder `data` dan berkas `.env` dari pemasangan lama ke folder
   baru itu.
4. Jalankan `Mulai.cmd` di folder baru. Bila memakai menyala otomatis,
   jalankan lagi `Pasang-otomatis.cmd` dari folder baru.

## Bila ada yang tidak jalan

- `Mulai.cmd` langsung menutup: buka Command Prompt di folder ini, lalu jalankan
  `runtime\node.exe mulai.mjs --periksa`. Perintah itu menyebut isian `.env`
  yang kurang.
- Halaman tidak terbuka: lihat berkas di folder `log`. `proxy.log` untuk
  HTTPS, `admin.log` untuk aplikasi admin, `situs.log` untuk situs publik.
- Port 443 sudah dipakai program lain: beri `KOS_SITE_ADDRESS` port sendiri,
  misalnya `192.168.1.10:9443`.
- Port 80 sudah dipakai program lain (misalnya IIS): `proxy.log` menyebut
  port itu. Hentikan program tersebut, karena proxy memakai port 80 untuk
  mengalihkan alamat `http://` ke `https://`.
