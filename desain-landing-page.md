# MASTER DESIGN BRIEF: LANDING PAGE & PORTAL PUBLIK (DESKTOP & UNIVERSAL SYSTEM)
**Produk:** Portal Publik & Sistem Penerimaan Murid Baru (PMB) SPPG  
**Repositori Target:** `E:\Freelance\Project Meksa\web-public`  
**Role:** Senior Product Designer & Design System Architect  
**Status:** Canonical Design Specification (Ready for Frontend Implementation)

---

## DAFTAR ISI
1. [Design Principles](#1-design-principles)
2. [Visual Direction & Mood](#2-visual-direction--mood)
3. [Design Tokens & System Tokens](#3-design-tokens--system-tokens)
4. [Screen Inventory & Page Objectives](#4-screen-inventory--page-objectives)
5. [User Flow & Primary Customer Journeys](#5-user-flow--primary-customer-journeys)
6. [Layout per Screen & Information Architecture](#6-layout-per-screen--information-architecture)
7. [Component Library (shadcn/ui + Radix UI + Lucide)](#7-component-library-shadcnui--radix-ui--lucide)
8. [UI State Management Matrix](#8-ui-state-management-matrix)
9. [Responsive Behaviour & Breakpoint Architecture](#9-responsive-behaviour--breakpoint-architecture)
10. [Accessibility (a11y) & Keyboard Navigation](#10-accessibility-a11y--keyboard-navigation)

---

## 1. DESIGN PRINCIPLES
Tiga prinsip absolut yang wajib dipatuhi oleh setiap komponen, layout, dan interaksi di antarmuka ini:

### Prinsip 1: *Institutional Prestige over Generic Commercialism*
- **Keputusan:** Tampilan harus memancarkan wibawa akademis, rasa aman, dan kredibilitas tinggi, bukan tampak seperti landing page SaaS generik atau template startup Silicon Valley.
- **Rasional:** Memilih sekolah adalah keputusan hidup dengan taruhan finansial dan emosional yang masif bagi orang tua. Tipografi yang kokoh, struktur grid simetris, hierarki lambang/akreditasi institusi, dan tata bahasa formal-hangat membangun kepercayaan instan sejak detik pertama (*3-second trust benchmark*).

### Prinsip 2: *Zero-Friction Conversion & Data Transparency*
- **Keputusan:** Seluruh informasi krusial—status gelombang aktif, sisa kuota, rincian biaya pendaftaran, program keahlian, dan jalur konsultasi WhatsApp—wajib dapat diakses dalam maksimal 2 kali klik tanpa *gimmick* formulir tersembunyi.
- **Rasional:** Calon wali murid menolak ambiguitas. Memberikan kepastian jadwal dan transparansi biaya membangun reputasi sekolah yang jujur dan melipatgandakan tingkat konversi pendaftaran online (PMB).

### Prinsip 3: *Light-First Foundation with Seamless Dark Adaptation*
- **Keputusan:** Basis visual antarmuka publik dibangun **Light-First** (latar terang dengan rasio kontras teks tinggi), dengan dukungan **Dark Mode** otomatis maupun manual yang presisi (mengikuti standar WCAG 2.1 AA/AAA).
- **Rasional:** Halaman publik dibuka oleh orang tua dan siswa di beragam kondisi pencahayaan (termasuk layar ponsel di luar ruangan saat berkunjung ke kampus). Desain *light-first* menjamin keterbacaan optimal di bawah sinar matahari langsung, sementara palet *dark mode* (slate navy) memberikan kenyamanan membaca saat malam hari tanpa silau.

---

## 2. VISUAL DIRECTION & MOOD

### 2.1 Mood & Brand Persona
- **Wibawa & Visioner:** Menggabungkan tradisi kehormatan sekolah unggulan dengan kemajuan teknologi modern (Kurikulum Merdeka + Pengayaan Internasional + Lab AI/Digital).
- **Hangat & Terbuka:** Ramah bagi calon siswa baru, memicu rasa bangga dan antusiasme untuk bertumbuh.
- **Referensi Estetika:**
  - *Universitas Unggulan Dunia (Harvard / Oxford Academic Portals):* Penataan hero yang elegan, penggunaan badge akreditasi, tipografi serif/clean-sans yang berwibawa.
  - *Stripe Docs / Tailwind UI Precision:* Kejelasan navigasi, micro-interactions subtil, border garis halus, card elevation terukur, dan layout yang bernapas lega (*generous whitespace*).

### 2.2 Apa yang Wajib Dihindari (Anti-Patterns)
1. **Dilarang menggunakan gambar stok palsu yang tidak realistis:** Hindari foto bule generik yang jelas-jelas bukan siswa/guru Indonesia. Gunakan visual autentik seragam siswa Indonesia, lingkungan hijau tropis, atau placeholder berbasis ilustrasi emblem akademis beresolusi tinggi.
2. **Dilarang memasang animasi berlebihan (No Motion Sickness):** Hindari teks berputar, partikel melayang acak, atau parallax ekstrem. Transisi dibatasi pada *fade-in*, *smooth collapse/accordion*, dan *hover lift* subtil (`translate-y: -2px`).
3. **Dilarang menyembunyikan data di balik modal berlapis:** Calon siswa harus dapat membaca silabus atau jurusan tanpa harus dipaksa mendaftar terlebih dahulu.
4. **Dilarang menggunakan Icon Font CDN (Material Symbols):** Menghindari ketergantungan webfont eksternal yang lambat dimuat, memicu layout shift, dan gagal saat jaringan terbatas. Seluruh ikon distandarkan ke **Lucide React** (`lucide-react`) berupa SVG inline.

---

## 3. DESIGN TOKENS & SYSTEM TOKENS

Format token dirancang 100% kompatibel dengan **Tailwind CSS v4** (`@theme inline` di `globals.css`) dan standar konvensi CSS variables **shadcn/ui**.

### 3.1 Palet Warna Utama (Color System)

| Token Nama | CSS Variable | Hex (Light Mode) | Hex (Dark Mode) | Peran & Alasan Pemilihan |
| :--- | :--- | :--- | :--- | :--- |
| **Primary** | `--primary` | `#00236f` | `#90a8ff` | **Prestige Academic Navy**: Melambangkan stabilitas, kedalaman intelektual, kepemimpinan, dan kehormatan institusi. |
| **Primary Foreground** | `--primary-foreground` | `#ffffff` | `#00164e` | Teks di atas warna utama; kontras ratio 14.8:1 (melebihi standar WCAG AAA). |
| **Primary Container** | `--primary-container` | `#1e3a8a` | `#1e293b` | Latar card sorotan, badge kategori, dan section hero. |
| **Secondary** | `--secondary` | `#855300` | `#ffb95f` | **Royal Amber Gold**: Representasi prestasi, medali kejuaraan, dan urgensi pendaftaran early-bird. |
| **Secondary Container** | `--secondary-container`| `#fea619` | `#ffb95f` | Tombol CTA utama ("Daftar PMB Sekarang") dan badge diskon biaya DPP. |
| **Secondary Foreground**| `--secondary-foreground`| `#2a1700` | `#1a0f00` | Teks di atas amber; kontras tinggi dan mudah dibaca sekilas. |
| **Accent / Success** | `--accent` | `#004b22` | `#2dd4bf` | **Forest Emerald**: Menandakan status akreditasi BAN-SM, verifikasi berkas lolos, dan legalitas resmi. |
| **Accent Foreground** | `--accent-foreground` | `#ffffff` | `#042f2e` | Teks penanda sukses dan kelulusan verifikasi. |
| **Background** | `--background` | `#f8f9ff` | `#0b1320` | Canvas utama; dingin dan tenang, mencegah kelelahan mata (*eye fatigue*). |
| **Foreground / Text** | `--foreground` | `#0b1c30` | `#f1f5f9` | Warna teks dasar (*body text*); kontras 15.2:1 terhadap background. |
| **Muted / Text Muted** | `--muted-foreground` | `#475569` | `#94a3b8` | Teks sekunder, catatan kaki, subtitle, dan timestamp. |
| **Card Surface** | `--card` | `#ffffff` | `#162032` | Latar kartu informasi dan kontainer formulir. |
| **Card Foreground** | `--card-foreground` | `#0b1c30` | `#f8fafc` | Teks di dalam kartu. |
| **Border / Garis** | `--border` | `#e2e8f0` | `#26354a` | Garis pemisah struktural halus, anti-distraksi. |
| **Destructive / Error** | `--destructive` | `#ba1a1a` | `#ffb4ab` | Penanda batas waktu gelombang tutup, kuota habis, atau berkas ditolak. |
| **Ring / Focus** | `--ring` | `#00236f` | `#90a8ff` | Outline fokus aksesibilitas keyboard (*visible focus indicator*). |

### 3.2 Skala Tipografi (Typography Hierarchy)
- **Font Family Utama:** `Inter`, `ui-sans-serif`, `system-ui`, `-apple-system`, `sans-serif`.
- **Alasan Pemilihan `Inter`:**
  - *Karakter Huruf Tinggi (High x-height) & Open Counters:* Sangat mudah dibaca pada resolusi layar rendah atau perangkat smartphone murah.
  - *Tabular Numbers (`tnum`):* Angka memiliki lebar seragam, esensial untuk penyusunan tabel biaya PMB, kalender tanggal, countdown timer gelombang, dan jam absensi gerbang.
  - *Bebas Lisensi & Ringan:* Variabel font modern yang mendukung performa Core Web Vitals (LCP < 1.2s).

| Token Tipografi | Ukuran (Font Size) | Line Height | Letter Spacing | Font Weight | Penggunaan Kontekstual |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Display** | 56px (3.5rem) | 64px (1.15) | -0.02em | 800 (Extrabold) | Headline Hero Desktop Utama |
| **Headline Large** | 40px (2.5rem) | 48px (1.2) | -0.015em | 700 (Bold) | Judul Section Utama (Keunggulan, Program, Biaya) |
| **Headline Medium** | 28px (1.75rem) | 36px (1.3) | -0.01em | 600 (Semibold) | Sub-judul section besar, angka metrik/statistik |
| **Headline Small** | 20px (1.25rem) | 28px (1.4) | 0 | 600 (Semibold) | Judul Kartu Jurusan, Nama Fasilitas Modal |
| **Title Large** | 18px (1.125rem) | 26px (1.45) | 0 | 600 (Semibold) | Judul FAQ Accordion, Judul Tahapan Alur PMB |
| **Title Medium** | 16px (1.0rem) | 24px (1.5) | 0 | 600 (Semibold) | Label Menu Navigasi, Nama Pimpinan Sambutan |
| **Body Large** | 18px (1.125rem) | 28px (1.55) | 0 | 400 (Regular) | Teks Lead Paragraf Hero & Sambutan Kepala Sekolah |
| **Body Medium** | 15px (0.9375rem) | 24px (1.6) | 0 | 400 (Regular) | Teks Konten Standar, Deskripsi Jurusan & PMB |
| **Body Small** | 13px (0.8125rem) | 20px (1.5) | 0 | 400 (Regular) | Keterangan Tambahan, Bantuan Input, Alamat Footer |
| **Label Large** | 14px (0.875rem) | 20px (1.4) | +0.01em | 600 (Semibold) | Teks Tombol CTA, Tab Trigger, Filter Button |
| **Label Small** | 11px (0.6875rem) | 14px (1.3) | +0.04em | 700 (Bold) | Badge Urgensi ("Sisa 18 Hari"), NPSN Tag, Tag Akreditasi |

### 3.3 Skala Spacing, Radius, dan Shadows (Elevation)
- **Baseline Spacing Grid (Kelipatan 4px/8px):**
  - `space-xs`: 4px (0.25rem) — Jarak antar ikon & teks badge
  - `space-sm`: 8px (0.5rem) — Jarak vertikal elemen dalam form
  - `space-md`: 16px (1.0rem) — Padding internal card kecil, gap antar form field
  - `space-lg`: 24px (1.5rem) — Padding kartu utama, margin antar sub-section
  - `space-xl`: 40px (2.5rem) — Padding kontainer besar, jarak antar section desktop
  - `space-2xl`: 64px (4.0rem) — Vertical padding section landing page desktop
  - `gutter`: 24px (1.5rem) — Margin sisi kiri/kanan halaman
  - `max-width`: `1280px` (`max-w-7xl`) — Batas lebar kontainer desktop untuk mencegah garis teks terlalu panjang (*optimal reading line length* 60–80 karakter)
- **Border Radius:**
  - `rounded-sm`: 4px (badge kecil, input checkbox)
  - `rounded-md`: 6px (input text, select dropdown, button standar)
  - `rounded-lg`: 8px (button CTA besar, card kontainer)
  - `rounded-xl`: 12px (feature card, pilar highlight, dialog modal)
  - `rounded-2xl`: 16px (hero banner container, sambutan pimpinan)
  - `rounded-full`: 9999px (pill badge, switch tema, floating helpdesk)
- **Elevation & Shadows:**
  - `shadow-sm`: `0 1px 2px 0 rgba(0, 0, 0, 0.05)` — Card statis, button default
  - `shadow-md`: `0 4px 6px -1px rgba(15, 23, 42, 0.08), 0 2px 4px -2px rgba(15, 23, 42, 0.04)` — Hover state card jurusan
  - `shadow-lg`: `0 10px 15px -3px rgba(15, 23, 42, 0.1), 0 4px 6px -4px rgba(15, 23, 42, 0.05)` — Floating action WhatsApp, sticky header
  - `shadow-xl`: `0 20px 25px -5px rgba(0, 35, 111, 0.15)` — Hero CTA button, dialog modal popup

---

## 4. SCREEN INVENTORY & PAGE OBJECTIVES

| ID Layar | Rute / Path | Tujuan Bisnis & Pengguna | Sumber Data Backend Turso | Caching Policy |
| :--- | :--- | :--- | :--- | :--- |
| **SCR-01** | `/` (Beranda) | Menghadirkan kesan pertama berwibawa, memaparkan profil unggulan, akreditasi, statistik prestasi, program keahlian, testimoni, dan mengonversi pengunjung ke PMB. | `company_profile`, `akademik_jurusan`, `pmb_gelombang` | `revalidate = 300` (ISR 5 Menit) |
| **SCR-02** | `/profil` | Menyajikan legalitas resmi sekolah, visi & misi, struktur pimpinan, sejarah, dan akreditasi BAN-SM. | `company_profile` (`readSchoolProfile`) | `revalidate = 300` |
| **SCR-03** | `/program` | Menampilkan seluruh program studi/jurusan aktif beserta kode, silabus, prospek karir, dan keunggulan. | `akademik_jurusan` (`readProgramStudi`) | `revalidate = 300` |
| **SCR-04** | `/pmb` | Pusat informasi pendaftaran: jadwal gelombang aktif, transparansi biaya pendaftaran, kuota, syarat berkas, dan alur pendaftaran 4 langkah. | `pmb_gelombang` (`readGelombangAktif`) | `revalidate = 0` (Real-time) |
| **SCR-05** | `/pmb/daftar` | Formulir pendaftaran calon siswa baru (data pribadi, asal sekolah, NISN, pilihan jurusan, dan upload berkas persyaratan max 500KB per file). | `pmb_gelombang`, `akademik_jurusan`, `tulisPendaftaran` | `revalidate = 0` |
| **SCR-06** | `/pmb/status` | Pelacakan status seleksi berkas mandiri (menggunakan Nomor Pendaftaran + Tanggal Lahir atau verifikasi OTP WhatsApp wali). | `pmb_pendaftar`, `pmb_berkas`, `readStatusPendaftaran` | `revalidate = 0` |
| **SCR-07** | `/kontak` | Kanal komunikasi resmi: lokasi Google Maps interaktif, telepon hotline, email resmi, dan tautan WhatsApp helpdesk. | `company_profile` | `revalidate = 300` |
| **SCR-08** | `/berita` | Portal publikasi warta sekolah, agenda kegiatan, pengumuman akademik, dan galeri prestasi. | Status kosong anggun (`DaftarKosong`) hingga modul berita aktif. | `revalidate = 300` |
| **SCR-09** | `/wali` | Gerbang autentikasi aman bagi orang tua murid (login via NISN + OTP WhatsApp) untuk mengakses pantauan presensi anak. | `master_data`, `wali_session` | `revalidate = 0` (No Cache) |
| **SCR-10** | `/wali/kehadiran` | Dashboard pantauan absensi harian gerbang RFID/QR anak (jam masuk, jam pulang, menit keterlambatan). | `absensi_harian` (`bacaKehadiran`) | `revalidate = 0` |

---

## 5. USER FLOW & PRIMARY CUSTOMER JOURNEYS

### 5.1 Journey 1: Pendaftaran Siswa Baru (PMB Conversion Funnel)
```
[Pengunjung Beranda SCR-01]
       │
       ▼ (Klik "Daftar PMB Sekarang" di Hero atau Sticky Header)
[Halaman Informasi PMB SCR-04]
       │
       ├── Cek Syarat, Kuota & Jadwal Gelombang
       ▼ (Klik "Isi Formulir Pendaftaran")
[Formulir Pendaftaran Online SCR-05]
       │
       ├── Langkah 1: Isi Identitas Calon Siswa (Nama, NISN, Tempat/Tgl Lahir, Asal Sekolah)
       ├── Langkah 2: Pilih Program Keahlian / Jurusan
       ├── Langkah 3: Isi Kontak Wali (Nama, No WhatsApp, Email)
       ├── Langkah 4: Unggah Berkas Persyaratan (Foto, KK, Akta, Rapor SMP - Validasi Base64)
       ▼ (Klik "Kirim Pendaftaran")
[Proses Batch Mutasi Atomik di Cloud Turso]
       │
       ├── Validasi Zod Server-Side .strict()
       ├── Pengecekan Kuota Penuh (KuotaPenuhError)
       ├── Auto-Generate Nomor Pendaftaran Unik (Percobaan Ulang Bentrok)
       ▼
[Layar Sukses Pendaftaran Modal / Redirect]
       │
       └── Mendapatkan Nomor Pendaftaran Resmi (Contoh: "PMB-2025-0819")
       └── Tautan Simpan Bukti Pendaftaran (PDF / Screenshot)
       └── Panduan Bayar Biaya Formulir di Loket Sekolah
```

### 5.2 Journey 2: Cek Status Berkas Pendaftaran via OTP WhatsApp
```
[Halaman Status PMB SCR-06]
       │
       ├── Masukkan Nomor Pendaftaran ("PMB-2025-0819") & Tanggal Lahir (YYYY-MM-DD)
       │    (Opsi B: Verifikasi via Kirim OTP ke No WhatsApp Wali Terdaftar)
       ▼ (Klik "Periksa Status")
[Server Validasi via readStatusPendaftaran]
       │
       ├── Status "Baru"           -> Badge Kuning: "Menunggu Verifikasi Berkas"
       ├── Status "Diverifikasi"   -> Badge Biru: "Berkas Lengkap & Valid. Jadwal Tes: DD-MM-YYYY"
       ├── Status "Lulus"          -> Badge Hijau: "Selamat! Diterima. Silakan Daftar Ulang"
       ├── Status "Ditolak"        -> Badge Merah: "Catatan Verifikator: Berkas Ijazah Kurang Jelas"
       └── Status "Terdaftar"      -> Badge Emas: "Resmi Menjadi Siswa Aktif"
```

### 5.3 Journey 3: Wali Murid Memantau Kehadiran Harian Gerbang
```
[Beranda / Menu "Portal Wali" SCR-09]
       │
       ├── Masukkan NIS / NISN Anak
       ▼ (Klik "Kirim Kode Verifikasi")
[Kirim OTP 6 Digit via WhatsApp Provider Resmi]
       │
       ├── Masukkan Kode OTP
       ▼ (Verifikasi Berhasil)
[Sesi Terbuat via HttpOnly Cookie (wali_session)]
       │
       ▼ (Redirect Otomatis)
[Dashboard Kehadiran Anak SCR-10]
       │
       ├── Ringkasan Hari Ini: "Sudah Masuk Pukul 06.42 WIB (Tepat Waktu)"
       └── Tabel Riwayat Presensi Gerbang 30 Hari Terakhir (Masuk, Pulang, Menit Terlambat)
```

---

## 6. LAYOUT PER SCREEN & INFORMATION ARCHITECTURE (DESKTOP)

### 6.1 SCR-01: Beranda (Desktop Grid 1280px)

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ [LOGO] SMA GLOBAL MANDIRI  [NPSN]      Profil  Program  Fasilitas  Biaya PMB  FAQ   [Mode][Daftar PMB] │ (Header 80px)
├────────────────────────────────────────────────────────────────────────────────────────┤
│ [ALERT BANNER] 🔥 PMB 2025/2026 Gelombang 1 Early Bird — Diskon DPP 25% • Sisa 18 Hari │ (40px)
├────────────────────────────────────────────────────────────────────────────────────────┤
│ HERO SECTION (Background Subtil Arsitektur Kampus + Dark Blue Gradient Scrim)         │
│                                                                                        │
│   [Badge: Akreditasi A Unggul BAN-SM]                                                 │
│   Wujudkan Generasi Pemimpin Cerdas,                                                  │
│   Berkarakter & Berdaya Saing Global                                                  │
│                                                                                        │
│   Pendidikan holistik berbasis Kurikulum Merdeka terintegrasi standar Cambridge       │
│   International dengan penguatan karakter religius dan ekosistem digital terpadu.      │
│                                                                                        │
│   [CTA: Daftar PMB Sekarang] (Amber)    [CTA Sekunder: Unduh Brosur PDF] (Ghost White)│
│                                                                                        │
│   ┌──────────────────┬──────────────────┬──────────────────┬──────────────────────┐    │
│   │ Akreditasi A     │ Lulusan PTN/LN   │ Prestasi 2024    │ Komunitas Siswa      │    │
│   │ 98 / 100         │ 98.4% Masuk Top  │ 150+ Juara       │ 1.250+ Siswa Aktif   │    │
│   │ BAN-SM Unggul    │ UI, ITB, Monash  │ Nasional & Dunia │ Jaringan Global      │    │
│   └──────────────────┴──────────────────┴──────────────────┴──────────────────────┘    │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 4 PILAR KEUNGGULAN INSTITUSI (Grid 4 Kolom)                                            │
│                                                                                        │
│   ┌──────────────────┬──────────────────┬──────────────────┬──────────────────────┐    │
│   │ [Icon: Globe]    │ [Icon: Award]    │ [Icon: Shield]   │ [Icon: Cpu]          │    │
│   │ Kurikulum        │ Pendidik         │ Pembinaan        │ Smart Campus         │    │
│   │ Cambridge        │ Magister 90%+    │ Karakter & Akhlak│ & Lab AI Modern      │    │
│   └──────────────────┴──────────────────┴──────────────────┴──────────────────────┘    │
│                                                                                        │
│   SAMBUTAN KEPALA SEKOLAH (Card Khusus Horizontal 2 Kolom)                             │
│   ┌───────────────────────┬────────────────────────────────────────────────────────┐   │
│   │ [Foto Resmi Pimpinan] │ "Pendidikan bukan sekadar mengisi wadah, melainkan    │   │
│   │ Dr. H. Bambang, M.Pd. │ menyalakan api keingintahuan dan integritas moral..." │   │
│   │ Kepala Sekolah        │ [Tanda Tangan Digital / Sambutan Lengkap ->]           │   │
│   └───────────────────────┴────────────────────────────────────────────────────────┘   │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ PROGRAM KEAHLIAN / JURUSAN & EKSTRAKURIKULER (Interaktif via Tabs shadcn/ui)           │
│   [ Tab: Program Pilihan Jurusan ]      [ Tab: Ekstrakurikuler Unggulan ]              │
│   ┌──────────────────────────────┬──────────────────────────────┬──────────────────┐   │
│   │ MIPA Unggulan Cambridge      │ IPS Global & Entrepreneur    │ Rekayasa AI/STEM │   │
│   │ Biologi, Fisika, Matematika  │ Riset Sosial, Bahasa, Bisnis │ Coding, Robotika │   │
│   │ [Pelajari Detail Jurusan ->] │ [Pelajari Detail Jurusan ->] │ [Detail ->]      │   │
│   └──────────────────────────────┴──────────────────────────────┴──────────────────┘   │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ FASILITAS UNGGULAN & GALERI KAMPUS (Grid 3 Kolom dengan Modal Preview)                 │
│   ┌──────────────────────────────┬──────────────────────────────┬──────────────────┐   │
│   │ [Foto: Smart Classroom]      │ [Foto: Lab Robotika & AI]    │ [Sport Center]   │   │
│   │ Interactive Board & AC       │ 40 Unit Workstation Core i9  │ Lap. Futsal/Basket│  │
│   └──────────────────────────────┴──────────────────────────────┴──────────────────┘   │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ TRANSPARANSI BIAYA & ALUR PENDAFTARAN PMB (Tabel Komparasi & 4 Langkah Berurutan)     │
│   Langkah 1: Formulir Online ──> Langkah 2: Berkas ──> Langkah 3: Tes ──> Langkah 4: DU│
├────────────────────────────────────────────────────────────────────────────────────────┤
│ FAQ ACCORDION (Pertanyaan Sering Ditanyakan seputar PMB, Beasiswa, & Asrama)          │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ FOOTER 4 KOLOM (Identitas Institusi, Navigasi Cepat, Legalitas Akreditasi, Kontak)     │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 7. COMPONENT LIBRARY (SHADCN/UI + RADIX UI + LUCIDE)

Seluruh komponen menggunakan fondasi arsitektur **shadcn/ui** yang telah disesuaikan dengan token sekolah di `globals.css`:

### 7.1 Button (`src/components/ui/button.tsx`)
- **Varian:**
  - `default`: Background `--primary` (`#00236f`), teks putih, hover `bg-primary/90`.
  - `secondary`: Background `--secondary-container` (`#fea619`), teks `--secondary-foreground`, hover `brightness-105`. Dipakai khusus tombol pendaftaran PMB.
  - `outline`: Border `1px solid --border`, background transparan, hover `bg-accent/10`.
  - `ghost`: Transparan, hover `bg-muted/50`.
  - `destructive`: Background `--destructive` (`#ba1a1a`), teks putih.
- **Ukuran:** `sm` (h-9, px-3), `default` (h-11, px-5), `lg` (h-13, px-8, font-semibold), `icon` (w-11, h-11).
- **Interaksi:** `active:scale-[0.98] transition-all duration-150`, `focus-visible:ring-2 focus-visible:ring-ring`.

### 7.2 Badge (`src/components/ui/badge.tsx`)
- **Varian:**
  - `prestige`: Latar `--primary-container`, teks putih, font-mono untuk NPSN.
  - `success`: Latar `#004b22`, teks putih, ikon `<CheckCircle2 className="w-3 h-3 mr-1" />`.
  - `warning`: Latar `#fea619`, teks `#2a1700` untuk penanda sisa kuota dan early-bird.
  - `outline`: Border halus abu-abu untuk kategori jurusan.

### 7.3 Card (`src/components/ui/card.tsx`)
- `Card`: Border `--border`, background `--card`, rounded-xl, padding `p-6`, shadow subtil.
- `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`.
- Varian Hover: `hover:shadow-md hover:-translate-y-1 transition-all duration-300`.

### 7.4 Accordion (`src/components/ui/accordion.tsx`)
- Primitif: `@radix-ui/react-accordion`.
- Ikon ekspansi: `<ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200" />`.
- Animasi buka-tutup halus berbasis CSS grid transition.

### 7.5 Tabs (`src/components/ui/tabs.tsx`)
- Primitif: `@radix-ui/react-tabs`.
- Navigasi keyboard otomatis (Arrow Left/Right).
- Digunakan pada pemilihan Jurusan vs Ekstrakurikuler di Beranda.

### 7.6 Dialog / Modal (`src/components/ui/dialog.tsx`)
- Primitif: `@radix-ui/react-dialog`.
- Dilengkapi dengan *focus-trap*, penekanan tombol `Esc` untuk menutup, dan backdrop blur `bg-black/50 backdrop-blur-sm`.
- Digunakan untuk melihat foto resolusi tinggi fasilitas sekolah dan pop-up bukti pendaftaran.

### 7.7 Form Controls (`Input`, `Label`, `Select`, `Textarea`)
- Tinggi input standar desktop: 44px (`h-11`).
- Border transisi biru fokus: `focus-visible:ring-2 focus-visible:ring-primary`.
- Penanganan error: border `--destructive`, label teks merah pembantu di bawah field.

### 7.8 Standar Ikonografi Lucide React
- `<GraduationCap />` (Kelulusan, PTN, Prestasi Akademik)
- `<Award />` (Akreditasi A BAN-SM, Prestasi Juara)
- `<BookOpen />` (Kurikulum, Jurusan, Pembelajaran)
- `<Calendar />` & `<Clock />` (Jadwal Gelombang, Waktu Absensi)
- `<MapPin />`, `<Phone />`, `<Mail />` (Kontak & Alamat)
- `<MessageCircle />` (WhatsApp PMB Helpdesk)
- `<Sun />` & `<Moon />` (Toggle Tema Terang/Gelap)
- `<Search />`, `<FileText />`, `<Download />`, `<UserPlus />`, `<ShieldCheck />`

---

## 8. UI STATE MANAGEMENT MATRIX

Seluruh layar publik terikat erat dengan arsitektur error handling `HasilMuat<T>` (`src/lib/server/school-data.ts`). Dilarang keras menampilkan data kosong palsu ketika terjadi kendala sistem!

| Kondisi State | Indikator Backend `HasilMuat<T>` | Perilaku Antarmuka (UI Reaction) | Komponen yang Ditampilkan |
| :--- | :--- | :--- | :--- |
| **Normal / Success** | `status: "ok"`, `data: T` | Konten penuh terender dengan animasi fade-in halus. | Data cards, tabel presensi, atau daftar jurusan. |
| **Empty State Sah** | `status: "ok"`, `data: []` atau `data: null` | Menjelaskan secara jujur dan ramah bahwa data memang belum ada dari pihak sekolah. | `DaftarKosong`: "Belum ada gelombang pendaftaran yang dibuka. Hubungi kontak sekolah untuk jadwal berikutnya." |
| **Loading / Prerender** | Proses asinkron pembacaan Turso DB | Menghindari layout shift (CLS = 0) dengan kerangka abu-abu proporsional. | `Skeleton` (Header bar shimmer, 3 kartu shimmer berukuran sama persis dengan kartu jurusan). |
| **Schema Belum Siap** | `status: "belum-siap"`, `error instanceof SchemaNotReadyError` | Menjelaskan bahwa sistem sedang dalam pemeliharaan/migrasi versi database baru. | `StatusTidakTerbaca` (Mode Pemeliharaan): Banner peringatan informatif dengan saran memuat ulang beberapa saat lagi. |
| **Gagal Koneksi / Error** | `status: "gagal"`, `error: unknown` | Menampilkan pesan error anggun tanpa mematikan seluruh situs (Header & Footer tetap berfungsi). | Banner status gagal + Tombol "Muat Ulang Halaman" (`window.location.reload()`). |
| **Profil Belum Diisi** | `profil.belumDikonfigurasi === true` | Dilarang mengarang "YOUR COMPANY" atau telepon palsu. | `ProfilBelumLengkap`: Memberi petunjuk bahwa admin dapat mengisinya melalui panel admin. |
| **Offline Mode** | `navigator.onLine === false` | Banner peringatan kuning di bagian atas: "Koneksi terputus. Menampilkan data tersimpan terakhir." | `Alert` peringatan jaringan offline. |

---

## 9. RESPONSIVE BEHAVIOUR & BREAKPOINT ARCHITECTURE

Sistem responsif menggunakan skala breakpoint baku Tailwind CSS v4:

```
Mobile (< 640px) ───> Tablet (640px - 1023px) ───> Desktop (1024px - 1279px) ───> Large Desktop (>= 1280px)
```

### 9.1 Transformasi Elemen Desktop ke Layar Lebih Kecil
1. **Navigasi Header:**
   - *Desktop (>= 1024px):* Menu bar horizontal lengkap dengan nomor telepon hotline dan tombol CTA PMB.
   - *Tablet / Mobile (< 1024px):* Menu terlipat ke dalam tombol burger yang memicu slide-over drawer (`Sheet` Radix UI).
2. **Hero Section:**
   - *Desktop:* Headline display 56px, 2 tombol aksi berdampingan, quick stats memanjang dalam grid 4 kolom.
   - *Tablet:* Headline 40px, quick stats grid 2x2.
3. **Pilar Keunggulan:**
   - *Desktop:* Grid 4 kolom horizontal sejajar.
   - *Tablet:* Grid 2x2.
4. **Tabel Transparansi Biaya:**
   - *Desktop:* Tabel perbandingan multi-kolom penuh dengan rincian biaya pendaftaran, DPP, dan SPP bulanan.
   - *Tablet:* Tabel dengan horizontal scroll container yang mulus (`overflow-x-auto`).
5. **Footer:**
   - *Desktop:* 4 kolom rapi (Identitas Institusi, Navigasi Cepat, Program PMB, Kontak Resmi).
   - *Tablet:* 2 kolom atas dan 2 kolom bawah.

---

## 10. ACCESSIBILITY (A11Y) & KEYBOARD NAVIGATION

Situs publik wajib memenuhi standar minimum **WCAG 2.1 Level AA** (dan Level AAA pada elemen tipografi utama):

### 10.1 Rasio Kontras Warna
- Teks Normal (< 18px): Rasio kontras minimal **4.5:1** terhadap latar belakang.
  - Teks `#0b1c30` di atas `#f8f9ff`: rasio **15.2:1** (Lolos AAA).
  - Teks `#90a8ff` di atas `#0b1320`: rasio **7.4:1** (Lolos AAA).
- Teks Besar / Headline (>= 18px bold atau >= 24px regular): Rasio kontras minimal **3.0:1**.
  - Tombol Amber `#fea619` dengan teks `#2a1700`: rasio **8.6:1** (Lolos AAA).

### 10.2 Navigasi Keyboard (Focus Order & Visual Indicator)
- Seluruh elemen interaktif (`<button>`, `<a>`, `<input>`, `<select>`, `<TabsTrigger>`, `<AccordionTrigger>`) dapat dijangkau menggunakan tombol `Tab` dan `Shift + Tab`.
- Indikator Fokus Jelas (*Visible Focus Ring*): Setiap elemen yang terfokus memiliki cincin kontras ganda:
  `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2`.
- Modal Dialog Focus Trapping: Saat modal fasilitas atau preview dibuka, fokus keyboard dikunci di dalam modal dan tombol `Esc` langsung menutup modal serta mengembalikan fokus ke pemanggil awal.

### 10.3 Semantik HTML5 & Atribut ARIA
- Menggunakan elemen semantik baku: `<header>`, `<nav>`, `<main>`, `<section>`, `<article>`, `<footer>`, `<aside>`.
- Hanya satu elemen `<h1>` per halaman untuk optimasi SEO dan pembaca layar (screen reader).
- Atribut ARIA penting:
  - `aria-label` pada tombol icon-only (contoh: tombol toggle tema, tombol WhatsApp helpdesk).
  - `aria-expanded="true|false"` pada Accordion FAQ dan Mobile Menu Burger.
  - `aria-live="polite"` pada pembaruan kuota pendaftaran dan notifikasi formulir.
  - `aria-describedby` untuk pesan error validasi input.