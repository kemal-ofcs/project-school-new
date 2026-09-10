Sistem Manajemen & Absensi Sekolah — Fase 4

Notifikasi Wali, Dasbor Kehadiran & Bimbingan Konseling
Fase pertama yang mengirim data ke luar aplikasi, dan fase pertama yang menyimpan catatan yang bisa merugikan seorang anak. Keduanya menuntut kehati-hatian yang berbeda dari tiga fase sebelumnya.

Versi skema
19 → 20
Rute kanonik
67 → ~69
Tabel snapshot
32 → 32
Permission
58 → ~64
Tiga batasan yang menentukan seluruh rencana
Fase 4 berbeda sifatnya. Tiga fase sebelumnya hanya memindahkan data di dalam sistem; fase ini mengirimkannya ke pihak ketiga dan menuliskan penilaian tentang perilaku seorang siswa. Ketiga batasan berikut bukan preferensi — dua di antaranya sudah terbukti mahal di repo ini.

1
Desktop tidak bisa memanggil gateway WhatsApp. CSP-nya connect-src: ipc: http://ipc.localhost — WebView Desktop tidak diizinkan menghubungi host mana pun. Rust bisa lewat reqwest, tetapi itu berarti dua implementasi pengirim dalam dua bahasa, dan melanggar janji offline-first.

Presedennya sudah ada dan sudah dipilih: pengiriman email hanya hidup di Web; Rust hanya menyimpan dan membaca app_mail_config. Ikuti itu — perangkat MENGANTRE, Web MENGIRIM.

2
Kegagalan pengiriman tidak boleh mematikan fiturnya. CLAUDE.md merekam kejadian nyatanya: email yang belum dikonfigurasi membuat pengiriman selalu gagal, dan kegagalan itu membatalkan permintaannya — “Lupa Password” mati total di seluruh pemasangan Mode Database Lokal. Jalur in_app lahir dari situ.

Analoginya untuk WhatsApp sudah tersedia gratis: tautan wa.me manual yang sudah dipakai sejak Fase 2 dan 3 di halaman siswa dan rekonsiliasi. Bila gateway belum dikonfigurasi atau gagal, notifikasi tetap mengantre dan muncul di layar tinjauan dengan tautan satu klik itu.

3
Catatan BK tidak boleh direplikasi ke setiap perangkat. password_reset_request sengaja cloud-only dengan alasan yang dieja CLAUDE.md: “jangan direplikasi ke SQLite tiap perangkat”.

Catatan kedisiplinan seorang anak yang tersimpan di SQLite terminal pemindai di lobi sekolah adalah kebocoran, bukan fitur. BK menukar akses offline dengan kerahasiaan — dan itu pertukaran yang benar, karena konseling adalah pekerjaan ruangan, bukan lapangan.

A · Notifikasi WhatsApp
Pemberitahuan otomatis ke wali saat scan gerbang, deteksi bolos, dan ambang ketidakhadiran.

Arsitektur: antre di perangkat, kirim di Web
pembagian peran
Pihak	Tugas	Tidak boleh
Desktop / Mobile	Menulis baris antrean lokal + event outbox	Memanggil gateway; menunggu jaringan
Cloud	Menampung antrean dari semua perangkat	—
Web	Menguras antrean, mengirim, mencatat hasilnya	Mengirim ganda
Tabel notifikasi_wa mengikuti pola siswa_foto setelah perbaikan Fase 3: ditulis lokal lalu didorong lewat rute kanonik, tetapi di luar SNAPSHOT_TABLES — satu perangkat tidak perlu menarik antrean perangkat lain, dan barisnya memuat nomor telepon serta isi pesan.

notifikasi_wa — kolom inti
Kolom	Catatan
id_notifikasi	TEXT PK, dibuat klien, wa_ + 128 bit acak
dedupe_key	Mis. scan:<id_sesi>. Tanpa UNIQUE — lihat catatan di bawah
jenis	CHECK: scan_masuk, scan_pulang, bolos, ambang_alfa
id_siswa, tujuan_nomor	Nomor kanonik +62… lewat normalizeOperatorPhone
isi_pesan	Dibekukan saat diantre, bukan disusun ulang saat kirim
status	CHECK: Menunggu, Terkirim, Gagal, Dibatalkan
attempt_count, last_error, sent_at	Meniru desktop_sync_outbox
Dedupe
Dua perangkat yang sama-sama offline bisa mengantre notifikasi untuk kejadian yang sama. UNIQUE (dedupe_key) terasa jawabannya — dan itu salah: tabel ini didorong lewat outbox, sehingga push kedua akan gagal permanen (Rule 32).

Deduplikasi dilakukan di titik kirim, yaitu Web — satu-satunya penulis tunggal dalam sistem ini. Sebelum mengirim, worker menandai semua baris dengan dedupe_key yang sama sebagai Dibatalkan kecuali satu. Wali menerima satu pesan; antreannya tetap jujur mencatat bahwa dua perangkat mengusulkannya.

Jangan
Scan gerbang tidak boleh menunggu jaringan. Terminal melayani antrean siswa pagi hari; satu panggilan HTTP yang menggantung akan menghentikan barisan. Mengantre lalu langsung kembali adalah satu-satunya perilaku yang dapat diterima — dan itu otomatis benar bila arsitektur di atas diikuti.

Konfigurasi & biaya
Tabel app_wa_config mencerminkan app_mail_config: provider, api_key, pengirim, is_active. Cloud-only — kunci API tidak pernah masuk tabel tersinkronisasi.
Setiap pesan berbiaya uang. Sediakan batas harian dan throttle di worker, serta sakelar induk per jenis notifikasi — sekolah mungkin ingin pemberitahuan bolos tetapi tidak setiap scan masuk.
Nomor wali dikirim ke pihak ketiga. Itu keputusan sekolah, bukan bawaan: is_active mati secara bawaan, sama seperti app_mail_config.
Rute kanonik: wa-notification/queue dan wa-notification/cancel. Permission notification.view, notification.manage, notification.send, dan notification.delete — dua yang terakhir masuk SENSITIVE_MUTATION_PERMISSIONS: mengirim berarti membelanjakan uang sekolah dan menghubungi orang tua atas namanya.

B · Dasbor Audit Kehadiran
Analitik kehadiran guru dan siswa untuk kepala sekolah dan wakil kurikulum.

Nol tabel
Bagian ini tidak butuh satu pun tabel baru, rute kanonik baru, atau migrasi. Seluruhnya baca-saja di atas data yang sudah ada. Yang benar-benar baru hanyalah permission, satu service yang menyusun query, dan halamannya.

Empat mesin rekap sudah hidup di repo ini. Bahaya terbesar Fase 4 adalah menulis yang kelima:

yang sudah ada — pakai ulang, jangan tulis ulang
Sumber	Memberi
getRekapBulanan (report.ts)	Rekap absensi harian per bulan
getDashboardMetrics	Metrik ringkas hari ini
Pratinjau leger (Fase 3)	Persentase kehadiran per siswa/semester
Rekonsiliasi (Fase 2)	Anomali bolos & tanpa scan gerbang
auditKualitasAbsensi	Kesehatan data: sesi menggantung, belum absen
Yang belum ada dan memang perlu ditambahkan: sisi guru. Kehadiran PTK selama ini ikut jalur karyawan; dasbor ini yang pertama membutuhkannya berdampingan dengan siswa. Susun dari absensi_harian dengan penyaring jenis_personil lewat normalizePersonnelRole — bukan perbandingan string mentah.

Permission: attendance_dashboard.view. Areanya cukup satu, dan seluruh isinya baca-saja.

C · Bimbingan Konseling
Pencatatan kasus kedisiplinan, surat panggilan wali, dan riwayat konseling.

Cloud-only, dan itu keputusan sadar
Dua tabel — bk_kasus dan bk_sesi — tidak masuk SNAPSHOT_TABLES dan tidak punya salinan lokal. Dibaca dan ditulis langsung ke cloud, dari Web maupun dari Desktop lewat metode TursoClient, persis seperti alur password_reset_request.

Konsekuensinya jujur: BK tidak bisa dipakai saat jaringan mati. Itu diterima karena konseling berlangsung di ruangan dengan komputer, dan karena alternatifnya jauh lebih buruk — catatan penilaian perilaku seorang anak tersalin ke SQLite setiap terminal, termasuk yang berdiri di lobi.

bk_kasus — kolom inti
Kolom	Catatan
id_kasus	TEXT PK
id_siswa, id_tahun_ajaran	
kategori	CHECK: kedisiplinan, akademik, kehadiran, sosial
ringkasan, kronologi	
status	CHECK: Terbuka, Dalam Bimbingan, Selesai
dibuat_oleh	Diambil dari SESI, tidak pernah dari payload
created_at, updated_at	datetime('now')
Surat panggilan
Bukan tabel baru. Surat adalah tampilan dari sebuah bk_kasus — susun sebagai halaman cetak, dan bila perlu template yang bisa disunting, pakai ulang id_card_template.elements_json yang mekanismenya sudah terbukti di Fase 3.

Permission: counseling.view, counseling.manage, counseling.delete. Ketiganya berdiri sendiri — jangan menumpang students.view: melihat daftar siswa dan membaca catatan konseling adalah dua kewenangan yang berbeda. counseling.delete masuk daftar sensitif.

Urutan pengerjaan
Bagian B tidak bergantung pada apa pun dan tidak menyentuh skema — kerjakan lebih dulu untuk mendapat nilai paling cepat dengan risiko paling kecil.

01
Dasbor audit kehadiran
Nol perubahan skema. Permission, service yang menyusun query yang sudah ada, halaman Web dan Mobile. Selesai dalam satu putaran.

02
Skema Fase 4 — empat lapisan + SNAPSHOT_SOURCES
notifikasi_wa, app_wa_config, bk_kasus, bk_sesi. Naikkan CURRENT_SCHEMA_VERSION dan CLIENT_SCHEMA_VERSION ke 20 bersamaan. Ketiga tabel selain notifikasi_wa tidak masuk snapshot — pastikan itu disengaja dan tercatat.

03
Antrean notifikasi
Rute kanonik, handler cloud, validator Zod .strict(), dan pengantrean di titik kejadian: scan gerbang, rekonsiliasi bolos, ambang alfa. Belum ada pengiriman sama sekali di langkah ini.

04
Layar tinjauan antrean
Inilah jalur cadangannya. Dengan tautan wa.me satu klik, fitur ini sudah berguna penuh tanpa gateway mana pun — dan itu yang membuat langkah berikutnya boleh gagal tanpa merusak apa pun.

05
Pengirim otomatis di Web
app_wa_config, worker penguras antrean, deduplikasi di titik kirim, throttle dan batas harian. Bawaan is_active = 0.

06
Modul BK
Cloud-only. Metode TursoClient untuk Desktop, service langsung untuk Web, halaman dengan RBAC ketat.

07
Test paritas & dokumen
Vektor identik Rust ↔ TS, payload nyata diuji terhadap validator, perbarui dokumen referensi dan angka di CLAUDE.md.

Daftar periksa sebelum menyatakan selesai
Delapan butir pertama sudah terbukti gagal di fase-fase sebelumnya. Lima terakhir khusus Fase 4 — belum pernah diuji di repo ini karena belum pernah ada fitur yang mengirim keluar.

SNAPSHOT_SOURCES sepadan dengan SNAPSHOT_TABLES

Fase 1 melewatkannya; tujuh tabel akademik tidak pernah ikut ditarik ke perangkat lain.

CLIENT_SCHEMA_VERSION naik bersama CURRENT_SCHEMA_VERSION

Fase 1 hanya menaikkan satu; aplikasi menolak push ke database yang ia provisioning sendiri.

Tabel di luar snapshot tetap DIDORONG

Fase 3 menempatkan siswa_foto di luar snapshot dengan benar, tetapi lupa event outbox-nya — foto terkurung di perangkat yang memotretnya.

Tidak ada UNIQUE pada kolom bisnis tabel tersinkron

Berlaku penuh untuk dedupe_key. Deduplikasi milik titik kirim, bukan skema.

Enum dieja sama di CHECK, Rust, dan Zod

Fase 3: foto_mime divalidasi Zod tetapi tidak di Rust — nilai asing macet permanen di outbox.

Nilai dibandingkan lewat normalizer, bukan string mentah

Fase 2: jenisPersonil === "Guru" tidak pernah cocok dengan GURU di database; seluruh fitur mati tanpa galat.

UI Mobile ada, punya pintu masuk, arahnya benar

Fase 1 tanpa halaman mobile; Fase 2 punya halaman tanpa tautan.

Dokumen referensi, angka CLAUDE.md, dan bun run check penuh

check:quick tidak mengompilasi Rust. Fase 1 dinyatakan lulus sementara backend-nya tidak bisa dibangun.

Scan gerbang tidak pernah menunggu jaringan

Terminal melayani antrean pagi hari; satu panggilan HTTP yang menggantung menghentikan barisan.

Fitur tetap berguna penuh tanpa gateway dikonfigurasi

Email yang belum dikonfigurasi pernah mematikan “Lupa Password” sepenuhnya. Jalur cadangan bukan tambahan — ia yang bawaan.

Wali tidak pernah menerima pesan ganda

Dua perangkat offline bisa mengantre kejadian yang sama; deduplikasi wajib di penulis tunggal.

Kunci API tidak pernah di tabel tersinkronisasi, dan pengiriman mati secara bawaan

app_mail_config cloud-only dengan is_active = 0. Mengirim nomor wali ke pihak ketiga adalah keputusan sekolah.

Catatan BK tidak tersalin ke perangkat mana pun

Penilaian perilaku seorang anak di SQLite terminal lobi adalah kebocoran. Periksa SNAPSHOT_TABLES dan pastikan tidak ada salinan lokal.

Angka pada masthead dihitung dari kode setelah Fase 3 selesai (67 rute kanonik, 32 tabel snapshot, 58 permission, skema versi 19). Perkiraan untuk Fase 4 sengaja ditulis dengan tilde — hitung ulang di kode setelah implementasi, jangan percayai angka di dokumen mana pun, termasuk dokumen ini.