# Sistem Manajemen & Absensi Sekolah — Fase 4: Notifikasi Wali, Dasbor Kehadiran & Bimbingan Konseling

Fase pertama yang mengirim data ke luar aplikasi, dan fase pertama yang menyimpan catatan yang bisa merugikan seorang anak. Keduanya menuntut kehati-hatian yang berbeda dari tiga fase sebelumnya.

- Versi skema: 19 -> 20
- Rute kanonik: 67 -> 69 (`wa-notification/queue`, `wa-notification/cancel`)
- Tabel snapshot: 32 -> 32 (tetap 32 tabel snapshot terdistribusi; `notifikasi_wa` selective-pull di luar snapshot, `bk_kasus`, `bk_sesi`, `app_wa_config` cloud-only)
- Permission: 58 -> 65 (`attendance_dashboard.view`, `notification.view`, `notification.manage`, `notification.send`, `notification.delete`, `counseling.view`, `counseling.manage`, `counseling.delete`)

---

## Tiga Batasan yang Menentukan Seluruh Rencana

Fase 4 berbeda sifatnya. Tiga fase sebelumnya hanya memindahkan data di dalam sistem; fase ini mengirimkannya ke pihak ketiga dan menuliskan penilaian tentang perilaku seorang siswa. Ketiga batasan berikut bukan preferensi — dua di antaranya sudah terbukti mahal di repo ini:

### 1. Desktop tidak bisa memanggil gateway WhatsApp
CSP-nya `connect-src: ipc: http://ipc.localhost` — WebView Desktop tidak diizinkan menghubungi host mana pun. Rust bisa lewat reqwest, tetapi itu berarti dua implementasi pengirim dalam dua bahasa, dan melanggar janji offline-first.
Presedennya sudah ada dan sudah dipilih: pengiriman email hanya hidup di Web; Rust hanya menyimpan dan membaca `app_mail_config`. Ikuti itu — **perangkat MENGANTRE, Web MENGIRIM**.

### 2. Kegagalan pengiriman tidak boleh mematikan fiturnya
CLAUDE.md merekam kejadian nyatanya: email yang belum dikonfigurasi membuat pengiriman selalu gagal, dan kegagalan itu membatalkan permintaannya — “Lupa Password” mati total di seluruh pemasangan Mode Database Lokal. Jalur `in_app` lahir dari situ.
Analoginya untuk WhatsApp sudah tersedia gratis: tautan `wa.me` manual yang sudah dipakai sejak Fase 2 dan 3 di halaman siswa dan rekonsiliasi. Bila gateway belum dikonfigurasi atau gagal, notifikasi tetap mengantre dan muncul di layar tinjauan dengan tautan satu klik itu.

### 3. Catatan BK tidak boleh direplikasi ke setiap perangkat
`password_reset_request` sengaja cloud-only dengan alasan yang dieja CLAUDE.md: “jangan direplikasi ke SQLite tiap perangkat”.
Catatan kedisiplinan seorang anak yang tersimpan di SQLite terminal pemindai di lobi sekolah adalah kebocoran, bukan fitur. BK menukar akses offline dengan kerahasiaan — dan itu pertukaran yang benar, karena konseling adalah pekerjaan ruangan, bukan lapangan.

---

## A · Notifikasi WhatsApp
Pemberitahuan otomatis ke wali saat scan gerbang, deteksi bolos, dan ambang ketidakhadiran.

### Arsitektur: antre di perangkat, kirim di Web
| Pihak | Tugas | Tidak boleh |
| :--- | :--- | :--- |
| Desktop / Mobile | Menulis baris antrean lokal + event outbox | Memanggil gateway; menunggu jaringan |
| Cloud | Menampung antrean dari semua perangkat | — |
| Web | Menguras antrean, mengirim, mencatat hasilnya | Mengirim ganda |

Tabel `notifikasi_wa` mengikuti pola `siswa_foto` setelah perbaikan Fase 3: ditulis lokal lalu didorong lewat rute kanonik, tetapi di luar `SNAPSHOT_TABLES` — satu perangkat tidak perlu menarik antrean perangkat lain, dan barisnya memuat nomor telepon serta isi pesan.

### `notifikasi_wa` — kolom inti
| Kolom | Catatan |
| :--- | :--- |
| `id_notifikasi` | TEXT PK, dibuat klien, `wa_` + 128 bit acak |
| `dedupe_key` | Mis. `scan:<id_sesi>` atau `bolos:<id_siswa>:<tanggal>:<jam_ke>`. Tanpa UNIQUE (Rule 32) |
| `jenis` | CHECK: `scan_masuk`, `scan_pulang`, `bolos`, `ambang_alfa` |
| `id_siswa`, `tujuan_nomor` | Nomor kanonik `+62…` lewat `normalizeOperatorPhone` |
| `isi_pesan` | Dibekukan saat diantre, bukan disusun ulang saat kirim |
| `status` | CHECK: `Menunggu`, `Terkirim`, `Gagal`, `Dibatalkan` |
| `attempt_count`, `last_error`, `sent_at` | Meniru `desktop_sync_outbox` |

### Dedupe
Dua perangkat yang sama-sama offline bisa mengantre notifikasi untuk kejadian yang sama. UNIQUE (`dedupe_key`) melanggar Rule 32 karena push kedua akan gagal permanen.
Deduplikasi dilakukan di titik kirim, yaitu Web — satu-satunya penulis tunggal dalam sistem ini. Sebelum mengirim, worker menandai semua baris dengan `dedupe_key` yang sama sebagai `Dibatalkan` kecuali satu. Wali menerima satu pesan; antreannya tetap jujur mencatat bahwa dua perangkat mengusulkannya.

### Jangan
Scan gerbang tidak boleh menunggu jaringan. Terminal melayani antrean siswa pagi hari; satu panggilan HTTP yang menggantung akan menghentikan barisan. Mengantre lalu langsung kembali adalah satu-satunya perilaku yang dapat diterima.

### Konfigurasi & Biaya
- Tabel `app_wa_config` mencerminkan `app_mail_config`: provider (`fonnte`, `wablas`, `custom`), `api_key`, `pengirim`, `is_active`, `daily_limit`, `scan_masuk_enabled`, `scan_pulang_enabled`, `bolos_enabled`, `ambang_alfa_enabled`. Cloud-only — kunci API tidak pernah masuk tabel tersinkronisasi.
- Setiap pesan berbiaya uang. Sediakan batas harian dan throttle di worker, serta sakelar induk per jenis notifikasi.
- Nomor wali dikirim ke pihak ketiga. Itu keputusan sekolah, bukan bawaan: `is_active` mati (0) secara bawaan.
- Rute kanonik: `wa-notification/queue` dan `wa-notification/cancel`.
- Permission: `notification.view`, `notification.manage`, `notification.send`, dan `notification.delete` — dua yang terakhir masuk `SENSITIVE_MUTATION_PERMISSIONS`.

---

## B · Dasbor Audit Kehadiran
Analitik kehadiran guru dan siswa untuk kepala sekolah dan wakil kurikulum.

### Nol Tabel
Bagian ini tidak butuh satu pun tabel baru, rute kanonik baru, atau migrasi. Seluruhnya baca-saja di atas data yang sudah ada.
Pakai ulang modul analitik yang ada:
- `getRekapBulanan` (`report.ts`): Rekap absensi harian per bulan
- `getDashboardMetrics`: Metrik ringkas hari ini
- Pratinjau leger (Fase 3): Persentase kehadiran per siswa/semester
- Rekonsiliasi (Fase 2): Anomali bolos & tanpa scan gerbang
- `auditKualitasAbsensi`: Kesehatan data: sesi menggantung, belum absen

Yang ditambahkan: sisi kehadiran Guru/PTK berdampingan dengan siswa. Disaring dari `absensi_harian` lewat `normalizePersonnelRole`.
Permission: `attendance_dashboard.view`.

---

## C · Bimbingan Konseling
Pencatatan kasus kedisiplinan, surat panggilan wali, dan riwayat konseling.

### Cloud-Only (Kerahasiaan Tertinggi)
Dua tabel — `bk_kasus` dan `bk_sesi` — tidak masuk `SNAPSHOT_TABLES` dan tidak punya salinan lokal di SQLite perangkat. Dibaca dan ditulis langsung ke cloud, dari Web maupun dari Desktop lewat metode `TursoClient`, persis seperti alur `password_reset_request`.

### `bk_kasus` — kolom inti
- `id_kasus`: TEXT PK
- `id_siswa`: TEXT NOT NULL
- `id_tahun_ajaran`: TEXT NOT NULL
- `kategori`: CHECK (`kedisiplinan`, `akademik`, `kehadiran`, `sosial`)
- `ringkasan`: TEXT NOT NULL
- `kronologi`: TEXT
- `status`: CHECK (`Terbuka`, `Dalam Bimbingan`, `Selesai`)
- `dibuat_oleh`: Diambil dari SESI, tidak pernah dari payload
- `created_at`, `updated_at`: `datetime('now')`

### `bk_sesi` — kolom inti
- `id_sesi`: TEXT PK
- `id_kasus`: TEXT NOT NULL
- `tanggal`: TEXT NOT NULL
- `catatan_konseling`: TEXT NOT NULL
- `tindak_lanjut`: TEXT
- `konselor`: TEXT NOT NULL
- `created_at`, `updated_at`: `datetime('now')`

### Surat Panggilan
Bukan tabel baru. Surat adalah tampilan dari `bk_kasus` sebagai halaman cetak dokumen resmi.

Permission: `counseling.view`, `counseling.manage`, `counseling.delete`. `counseling.delete` masuk daftar sensitif.

---

## Urutan Pengerjaan
1. **01 Dasbor audit kehadiran**: Nol perubahan skema. Permission, service yang menyusun query yang sudah ada, halaman Web dan Mobile.
2. **02 Skema Fase 4**: `notifikasi_wa` (lokal & cloud, outbox push, di luar snapshot), `app_wa_config`, `bk_kasus`, `bk_sesi` (cloud-only). Naikkan `CURRENT_SCHEMA_VERSION` dan `CLIENT_SCHEMA_VERSION` ke 20 bersamaan.
3. **03 Antrean notifikasi**: Rute kanonik `wa-notification/queue` & `cancel`, handler cloud, validator Zod `.strict()`, pengantrean saat scan gerbang, rekonsiliasi bolos, dan ambang alfa.
4. **04 Layar tinjauan antrean**: Tinjauan pesan dengan tombol `wa.me` manual 1-klik sebagai fallback tanpa gateway.
5. **05 Pengirim otomatis di Web**: `app_wa_config`, worker penguras antrean, deduplikasi di titik kirim, throttle dan batas harian. Bawaan `is_active = 0`.
6. **06 Modul BK**: Cloud-only via `TursoClient` untuk Desktop/Mobile, service LibSQL untuk Web, halaman dengan RBAC ketat.
7. **07 Test paritas & verifikasi penuh**: Unit tests, schema audit, contract audit, dan `bun run check` penuh.
