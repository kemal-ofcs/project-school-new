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
   `KOS_PUBLIC_ADDRESS`, dan `KOS_SETUP_TOKEN`. Cara mendapatkan isinya ada di
   bagian [Mengisi .env](#mengisi-env) di bawah. Lisensi tidak diisi di sini.

   File Explorer menolak nama `.env` dengan pesan "You must type a file name".
   Pakai salah satu cara ini:
   - Di kolom alamat folder ini, ketik `cmd` lalu Enter, kemudian jalankan
     `copy .env.example .env`. Cara ini menyalin, jadi `.env.example` tetap
     ada sebagai contoh.
   - Atau salin `.env.example`, lalu ganti nama salinannya menjadi `.env.`
     (dengan titik di akhir). Windows membuang titik terakhir, dan hasilnya
     `.env`.

   Buka `.env` dengan klik kanan → **Open with** → **Notepad**.
3. Klik dua kali `Mulai.cmd`. Bila Windows Firewall bertanya, izinkan akses
   untuk jaringan privat.
4. Buka `https://<KOS_SITE_ADDRESS>/setup` di browser. Halaman itu menampilkan
   kode server, berawalan `S-`. Kirim kode itu kepada Kemal Office Studio untuk
   mendapatkan lisensi. Alamat yang diketik dengan `http://` dialihkan sendiri
   ke `https://`.
5. Setelah lisensi diterima, kembali ke `/setup`: isi token, data akun
   Superadmin, dan tempel teks lisensinya.
6. Cetak atau salin delapan kode pemulihan yang tampil. Kode itu hanya tampil
   sekali, dan menjadi satu-satunya jalan masuk bila password Superadmin
   terlupa.
7. Kosongkan `KOS_SETUP_TOKEN` di `.env`, jalankan `Hentikan.cmd`, lalu
   `Mulai.cmd` lagi.

## Mengisi .env

### KOS_SITE_ADDRESS dan KOS_PUBLIC_ADDRESS

Kedua isian ini adalah alamat yang nanti diketik di browser, tanpa `https://`.
Isinya tergantung siapa yang membuka aplikasi.

**Hanya di jaringan sekolah (WiFi atau LAN yang sama).** Pakai alamat IP
komputer ini:

1. Buka Command Prompt, ketik `ipconfig`, lalu tekan Enter.
2. Cari baris `IPv4 Address` pada adaptor yang tersambung (Wi-Fi atau
   Ethernet), misalnya `192.168.1.10`.
3. Isi:

   ```
   KOS_SITE_ADDRESS=192.168.1.10
   KOS_PUBLIC_ADDRESS=192.168.1.10:8443
   KOS_TLS=internal
   ```

   Situs publik memakai port lain (`:8443`) karena kedua alamat harus berbeda.
   Bila komputer ini juga menjalankan Aplikasi Dapodik, admin juga diberi port
   sendiri, misalnya `192.168.1.10:9443`.

Alamat IP ini bisa berubah setelah router atau komputer dinyalakan ulang, dan
aplikasi tidak lagi terbuka di alamat lama. Supaya tetap, atur "DHCP
reservation" untuk komputer ini di halaman router, atau beri alamat IP tetap di
pengaturan adaptor jaringan Windows.

**Dibuka dari internet.** Pakai nama domain milik sekolah:

1. Di panel penyedia domain, buka pengaturan DNS dan buat dua A record yang
   mengarah ke IP publik komputer ini, misalnya `admin` untuk aplikasi admin
   dan `@` atau `www` untuk situs publik.
2. Di router, teruskan port 80 dan 443 (TCP) ke IP lokal komputer ini.
3. Isi:

   ```
   KOS_SITE_ADDRESS=admin.sekolah.sch.id
   KOS_PUBLIC_ADDRESS=www.sekolah.sch.id
   KOS_TLS=email-pengelola@sekolah.sch.id
   ```

   Dengan alamat email di `KOS_TLS`, sertifikat HTTPS resmi diterbitkan
   otomatis dan peringatan sertifikat tidak muncul.

Cara ini butuh IP publik. Bandingkan IP WAN di halaman router dengan IP yang
ditampilkan situs seperti whatismyip.com. Bila berbeda, koneksi internetnya
memakai CGNAT dan komputer ini tidak bisa dijangkau dari internet. Ada tiga
jalan keluar: minta IP publik ke penyedia internet, pasang paket ini di VPS
Windows, atau pakai Cloudflare Tunnel (bagian
[Dibuka dari internet tanpa IP publik](#dibuka-dari-internet-tanpa-ip-publik-cloudflare-tunnel)).

### KOS_SETUP_TOKEN

Kata sandi sekali pakai untuk membuka halaman `/setup`. Token ini **bukan
lisensi** dan **bukan password Superadmin**: Anda membuatnya sendiri, dan
gunanya hanya supaya tidak ada orang lain yang mendahului Anda membuat akun
Superadmin pertama. Isinya minimal 32 karakter acak.

Cara membuatnya:

1. Buka folder ini di File Explorer.
2. Klik kolom alamat di bagian atas jendela (yang berisi lokasi folder),
   ketik `cmd`, lalu tekan Enter. Jendela Command Prompt terbuka di folder ini
   dan tetap terbuka.
3. Salin perintah berikut ke jendela itu, lalu tekan Enter:

   ```
   runtime\node.exe -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   ```

4. Muncul satu baris berisi 43 huruf dan angka acak, misalnya
   `q8Zr2mVx...`. Blok baris itu dengan mouse, lalu tekan Enter untuk
   menyalinnya.
5. Tempel di `.env` setelah tanda `=`, tanpa spasi dan tanpa tanda petik:

   ```
   KOS_SETUP_TOKEN=q8Zr2mVx...
   ```

6. Simpan juga token itu di catatan. Nanti token ini diketik ulang di halaman
   `/setup`.

Di halaman `/setup` ada tiga isian yang berbeda: **token** (isi dengan
`KOS_SETUP_TOKEN` ini), **data Superadmin** (username dan password baru untuk
login sehari-hari), dan **teks lisensi** (dari Kemal Office Studio). Setelah
Superadmin dibuat, kosongkan lagi isian ini (langkah 7). Sejak itu, login cukup
memakai username dan password Superadmin.

## Dibuka dari internet tanpa IP publik (Cloudflare Tunnel)

Banyak koneksi internet rumah dan kantor memakai CGNAT: satu IP publik dipakai
bersama banyak pelanggan, sehingga port forwarding di router tidak pernah
menerima koneksi dari internet. Cloudflare Tunnel membalik arahnya: komputer
ini yang menyambung ke Cloudflare, lalu pengunjung masuk lewat Cloudflare.
Semua yang dipakai di bagian ini gratis (paket Free).

Yang dibutuhkan: domain milik sendiri dan akun Cloudflare. Port forwarding di
router tidak dibutuhkan.

Nama menu Cloudflare kadang berubah. Bila nama di bawah tidak ditemukan, cari
menu dengan arti yang sama.

### 1. Pastikan koneksinya memang CGNAT

Buka Command Prompt, lalu jalankan `tracert -d 8.8.8.8`. Bila baris kedua
berisi alamat berawalan `10.`, `100.64` sampai `100.127`, atau `172.16` sampai
`172.31`, koneksinya memakai CGNAT dan bagian ini yang dipakai. Bila tidak,
pakai cara port forwarding di bagian "Dibuka dari internet" di atas, yang lebih
sederhana.

### 2. Hubungkan domain ke Cloudflare

1. Daftar di dash.cloudflare.com, lalu pilih **Add a site** → **Connect a
   domain** (bukan Transfer). Ketik nama domain tanpa `www` dan tanpa
   `https://`.
2. Pilih paket **Free** (ada di paling bawah daftar paket).
3. Biarkan **Import DNS records** pada **Automatic**. Pengaturan AI crawler
   boleh dibiarkan bawaan.
4. Di daftar record hasil impor, hapus record A yang mengarah ke IP komputer
   ini (misalnya `admin` dan `www`). Record itu nanti dibuat oleh tunnel.
   Jangan menambah record apa pun.
5. Cloudflare menampilkan dua nameserver, misalnya `xxx.ns.cloudflare.com`.
   Di panel penyedia domain, ganti nameserver domain dengan keduanya.
6. Tunggu sampai Cloudflare menyatakan domainnya aktif ("Your domain is now
   protected by Cloudflare"). Biasanya beberapa menit, paling lama beberapa
   jam.

### 3. Buat tunnel dan pasang cloudflared

1. Di Cloudflare, buka **Networking** → **Tunnels** → **Create a tunnel**,
   pilih **Cloudflared**, lalu beri nama, misalnya `server-sekolah`.
   Bila diminta memilih paket Zero Trust, pilih **Free**. Cloudflare bisa
   meminta kartu kredit atau PayPal untuk verifikasi, tetapi paket Free tidak
   ditagih.
2. Pilih **Windows** dan **64-bit**, unduh berkas `.msi` cloudflared, lalu
   pasang seperti aplikasi biasa.
3. Buka Command Prompt sebagai Administrator (klik kanan Command Prompt →
   **Run as administrator**). Salin perintah `cloudflared.exe service install
   eyJ...` dari halaman Cloudflare, tempel, lalu tekan Enter.
4. Tunggu sampai komputer ini tampil di daftar connector dengan status
   **Connected** atau **Healthy**.

Perintah `service install eyJ...` berisi token tunnel. Jangan dikirim ke siapa
pun: siapa pun yang memegangnya bisa menjalankan tunnel atas nama domain ini.
Setelah terpasang, cloudflared menyala sendiri setiap kali Windows dinyalakan.

### 4. Arahkan alamat ke aplikasi

Di halaman tunnel, buka tab **Routes** → **Add route** → **Published
application**. Buat dua route:

| Subdomain | Domain | Path | Service URL |
|---|---|---|---|
| `admin` | domain Anda | kosong | `http://127.0.0.1:3000` |
| `www` | domain Anda | kosong | `http://127.0.0.1:3001` |

Bagian **Additional application settings** dibiarkan bawaan. Bila
`KOS_PORT_ADMIN` atau `KOS_PORT_SITUS` di `.env` diubah, sesuaikan angka port
di atas.

Tiga hal di tabel itu sengaja, jangan diubah:

- **`127.0.0.1`**: aplikasi hanya menerima koneksi dari komputer ini sendiri,
  dan cloudflared berjalan di komputer yang sama. Karena itu cloudflared WAJIB
  dipasang di komputer yang menjalankan `Mulai.cmd`.
- **`http`, bukan `https`**: aplikasi di port itu tidak memegang sertifikat.
  Pengunjung tetap mendapat HTTPS dari Cloudflare, dan jalur Cloudflare ke
  komputer ini terenkripsi oleh tunnel. Memilih `https` menghasilkan galat 502.
- **Port aplikasi, bukan 443**: lewat port 443, setiap pengunjung tercatat
  dengan alamat yang sama, sehingga satu orang yang salah memasukkan password
  bisa mengunci login semua orang.

Situs publik memakai `www`, bukan domain utama. Route di domain utama hanya
mendapat alamat IPv6, dan kebanyakan koneksi masih memakai IPv4, sehingga
domain utama tidak bisa dibuka. Langkah 5 mengalihkan domain utama ke `www`.

### 5. Alihkan domain utama ke www

1. Di **DNS** → **Records**, klik **Add record**:
   - Type: `A`
   - Name: `@`
   - IPv4 address: `192.0.2.1`
   - Proxy status: **Proxied** (awan oranye)

   Alamat `192.0.2.1` memang tidak dipakai siapa pun. Pengunjung tidak pernah
   sampai ke sana, karena Cloudflare langsung mengalihkannya di langkah
   berikut.
2. Buka **Rules** → **Redirect Rules** → buat aturan baru dari template
   **Redirect from root to WWW**. Hati-hati: ada juga template "WWW to root"
   yang arahnya terbalik.
3. Periksa isiannya:
   - Request URL: `https://domain-anda/*`
   - Target URL: `https://www.domain-anda/${1}`
   - Status code: `301`
   - **Preserve query string**: dicentang
4. Klik **Deploy**.

### 6. Isi .env lalu nyalakan

```
KOS_SITE_ADDRESS=admin.domain-anda
KOS_PUBLIC_ADDRESS=www.domain-anda
KOS_TLS=internal
```

`KOS_TLS` tetap `internal`: sertifikat untuk pengunjung diurus Cloudflare.
Mengisinya dengan email membuat server terus mencoba meminta sertifikat ke
Let's Encrypt dan gagal, karena dari internet komputer ini tetap tidak bisa
dijangkau langsung.

Jalankan `Hentikan.cmd`, lalu `Mulai.cmd`. Supaya aplikasi juga menyala sendiri
setelah Windows dinyalakan, jalankan `Pasang-otomatis.cmd` (bagian "Menyala
otomatis").

Bila lisensi dikunci ke alamat, yang dicantumkan adalah `admin.domain-anda`
dan `www.domain-anda`.

### 7. Coba dari luar

Matikan WiFi di HP, lalu buka dengan data seluler:

- `https://admin.domain-anda/setup`: halaman setup atau login tampil.
- `https://domain-anda`: dialihkan ke `https://www.domain-anda`.

### Bila ada yang tidak jalan

- **502 Bad Gateway**: aplikasi di komputer ini mati, atau Service URL di
  route salah (`https` alih-alih `http`, atau port keliru). Jalankan
  `Mulai.cmd` dan periksa route.
- **"Situs tidak dapat dijangkau" setelah DNS diubah**: Windows masih
  mengingat jawaban lama. Jalankan `ipconfig /flushdns` di Command Prompt; di
  HP, nyalakan lalu matikan mode pesawat.
- **Domain utama tidak bisa dibuka, tetapi `www` bisa**: langkah 5 belum
  selesai, atau record A `@` tidak dalam keadaan Proxied.
- **524 A timeout occurred**: Cloudflare menunggu paling lama 100 detik. Proses
  yang lebih lama, misalnya impor Excel yang sangat besar, mungkin tetap
  selesai di server walau layarnya gagal. Periksa hasilnya sebelum mengulang.
- **Status tunnel Down/Inactive**: layanan cloudflared berhenti. Buka
  `services.msc`, cari **Cloudflared agent**, lalu klik **Start**.

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
peringatan pada kunjungan pertama di setiap komputer dan HP. Ada dua cara
menanganinya:

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
- `Mulai.cmd` melapor "Port 443 sudah dipakai program lain": di komputer
  operator sekolah, port itu sering sudah dipakai Aplikasi Dapodik. Beri
  `KOS_SITE_ADDRESS` port sendiri, misalnya `192.168.1.10:9443`, lalu buka
  aplikasi di `https://192.168.1.10:9443`.
- Alamat admin menampilkan halaman program lain (misalnya "Forbidden" dari
  Apache): penyebabnya sama, port 443 dipakai program itu. Jalan keluarnya
  sama dengan butir di atas.
- `Mulai.cmd` melapor port 80 sudah dipakai: aplikasi tetap menyala, tetapi
  alamat yang tidak memakai port harus diketik lengkap dengan `https://`.
- Terbuka di server tetapi tidak di komputer atau HP lain: pastikan perangkat
  itu di jaringan yang sama, lalu izinkan `runtime\caddy.exe` di Windows
  Firewall untuk jaringan privat.
