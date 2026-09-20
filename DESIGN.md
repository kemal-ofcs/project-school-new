# MASTER DESIGN BRIEF: LANDING PAGE & PORTAL PUBLIK (MOBILE-FIRST ERGONOMICS)
**Produk:** Portal Publik & Sistem Penerimaan Murid Baru (PMB) SPPG  
**Repositori Target:** `E:\Freelance\Project Meksa\web-public`  
**Role:** Senior Product Designer & Mobile UX Architect  
**Status:** Canonical Mobile Design Specification (Ready for Frontend Implementation)

---

## DAFTAR ISI
1. [Mobile Design Principles & Ergonomics](#1-mobile-design-principles--ergonomics)
2. [Mobile Visual Direction & Constraints](#2-mobile-visual-direction--constraints)
3. [Mobile Design Tokens & Safe Areas](#3-mobile-design-tokens--safe-areas)
4. [Mobile Screen Inventory & Flow](#4-mobile-screen-inventory--flow)
5. [Mobile User Flow & Touch Journeys](#5-mobile-user-flow--touch-journeys)
6. [Mobile Layout per Screen & Section Hierarchy](#6-mobile-layout-per-screen--section-hierarchy)
7. [Mobile Component Library (shadcn/ui + Radix + Lucide)](#7-mobile-component-library-shadcnui--radix--lucide)
8. [Mobile UI State Matrix & Connectivity Resilience](#8-mobile-ui-state-matrix--connectivity-resilience)
9. [Adaptive Breakpoints & Phablet/Tablet Reflow](#9-adaptive-breakpoints--phablettablet-reflow)
10. [Mobile Accessibility (a11y) & Touch Standards](#10-mobile-accessibility-a11y--touch-standards)

---

## 1. MOBILE DESIGN PRINCIPLES & ERGONOMICS

Merancang untuk perangkat genggam (*smartphones* 360px–430px) bukan sekadar mengecilkan tampilan desktop, melainkan merombak arsitektur interaksi agar sesuai dengan biomekanik tangan manusia:

### Prinsip M-1: *The Natural Thumb-Zone Architecture*
- **Keputusan:** Seluruh tindakan konversi utama—tombol "Daftar PMB", tombol "Bantuan WhatsApp", navigasi drawer, dan tombol aksi form—ditempatkan di **Zona Hijau (40% area bawah layar)** yang dapat dijangkau oleh ibu jari satu tangan tanpa meregangkan telapak tangan.
- **Rasional:** Lebih dari 85% calon wali murid dan siswa membuka situs ini sambil berjalan atau memegang ponsel dengan satu tangan. Menaruh tombol penting di pojok kiri atas desktop memicu *thumb strain* dan menggagalkan konversi.

### Prinsip M-2: *Tactile Certainty & Zero Accidental Taps*
- **Keputusan:** Setiap target sentuh (*touch target*) memiliki dimensi fisik minimal **48 × 48 px** dengan margin pemisah minimal **8 px**. Setiap sentuhan wajib memberikan umpan balik visual instan melalui micro-animation (`active:scale-[0.97] transition-transform duration-100`).
- **Rasional:** Jari manusia jauh lebih tumpul daripada kursor mouse (`~10mm contact patch`). Target sentuh yang terlalu rapat menyebabkan salah klik antar link dan membuat pengguna frustrasi saat mengisi formulir pendaftaran.

### Prinsip M-3: *Extreme Mobile Performance & Zero Shift (CLS = 0)*
- **Keputusan:** Dilarang mengimpor webfont ikon pihak ketiga melalui CDN. Seluruh ikonografi menggunakan **Lucide React** SVG inline, gambar memiliki rasio aspek baku (`aspect-video` atau `aspect-[4/3]`) dengan latar abu-abu placeholder, dan *cumulative layout shift* dijaga 0.
- **Rasional:** Jaringan seluler 4G/3G sering mengalami lonjakan latensi. Layout yang bergeser saat gambar selesai dimuat membuat pengguna salah menekan tombol.

---

## 2. MOBILE VISUAL DIRECTION & CONSTRAINTS

### 2.1 Viewport Bounds & Safe Areas
- **Target Resolusi Acuan:** 360 × 800 px (Android standar), 390 × 844 px (iPhone standar), hingga 430 × 932 px (Pro Max).
- **Safe Area Inset Awareness:** Wajib menerapkan `pt-safe` pada header atas dan `pb-safe` (`env(safe-area-inset-bottom, 0px)`) pada bilah aksi bawah (sticky action bar) agar tidak bertabrakan dengan home bar iOS atau tombol navigasi Android.

### 2.2 Apa yang Dilarang Keras di Mobile (Anti-Patterns)
1. **Dilarang keras Horizontal Scroll pada level Halaman (`overflow-x: hidden` wajib):** Seluruh elemen konten (tabel, kartu, gambar) dilarang mendorong lebar layar melebihi 100vw. Tabel data harus bertransformasi menjadi kartu vertikal atau kontainer geser horizontal lokal (*card slider/carousel*).
2. **Dilarang Font Input di bawah 16px:** Menghindari bug bawaan iOS Safari yang otomatis memperbesar (*auto-zoom*) layar saat pengguna mengetuk input teks dengan ukuran font < 16px.
3. **Dilarang Pop-up / Interstitial Modal Memblokir Layar:** Seluruh dialog pada mobile wajib dirender sebagai **Bottom Sheet Drawer** (muncul mulus dari bawah layar dan dapat di-swipe ke bawah untuk menutup).
4. **Dilarang Disable Zooming:** Parameter `<meta name="viewport" content="width=device-width, initial-scale=1.0">` dilarang menyertakan `user-scalable=no` demi mematuhi pedoman aksesibilitas Apple dan W3C bagi pengguna berkebutuhan pembesaran teks.

---

## 3. MOBILE DESIGN TOKENS & SAFE AREAS

### 3.1 Skala Tipografi Khusus Mobile (Mobile Typography Scale)
Skala huruf desktop diperkecil secara proporsional agar tidak memakan ruang vertikal secara berlebihan (*line-height compaction*):

| Token Mobile | Font Size | Line Height | Letter Spacing | Weight | Penggunaan Kontekstual di Ponsel |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`font-headline-lg-mobile`** | 32px (2.0rem) | 38px (1.2) | -0.015em | 800 (Bold) | Judul Utama Hero Section Mobile |
| **`font-headline-md-mobile`** | 24px (1.5rem) | 32px (1.3) | -0.01em | 700 (Bold) | Judul Section (Pilar, Program, Biaya PMB) |
| **`font-headline-sm-mobile`** | 18px (1.125rem)| 26px (1.4) | 0 | 600 (Semibold)| Angka Statistik Quick Stats (2x2 Grid) |
| **`font-title-md-mobile`** | 16px (1.0rem) | 24px (1.5) | 0 | 600 (Semibold)| Judul Kartu Jurusan, Label Form Input |
| **`font-body-md-mobile`** | 15px (0.9375rem)| 22px (1.5) | 0 | 400 (Regular) | Teks Konten Paragraf, Deskripsi Singkat |
| **`font-body-sm-mobile`** | 13px (0.8125rem)| 18px (1.4) | 0 | 400 (Regular) | Catatan Kaki, Bantuan Form, Timestamp |
| **`font-label-lg-mobile`** | 15px (0.9375rem)| 20px (1.35)| +0.01em | 600 (Semibold)| Teks Tombol Utama Sticky Action Bar |
| **`font-label-sm-mobile`** | 11px (0.6875rem)| 14px (1.3) | +0.03em | 700 (Bold) | Badge Status Gelombang & Akreditasi A |

### 3.2 Mobile Spacing & Layout Tokens
- **Mobile Side Gutter:** `16px` (`px-4`) — ruang bernapas nyaman pada layar 360px tanpa memboroskan ruang baca.
- **Card Gap:** `12px` (`gap-3`) — pemisah antar kartu informasi vertikal.
- **Mobile Header Height:** `64px` (`h-16`) — tinggi ideal untuk identitas sekolah, tombol tema, dan tombol menu burger.
- **Mobile Sticky Action Bar Height:** `68px` (`h-[68px]` + `pb-safe`) — bilah aksi bawah mengambang untuk konversi pendaftaran.
- **Input Field Height:** `48px` (`h-12`) — memenuhi standar W3C Touch Targets.

---

## 4. MOBILE SCREEN INVENTORY & FLOW

| ID Layar | Komponen Kunci di Ponsel | Optimasi Mobile UX |
| :--- | :--- | :--- |
| **SCR-M01: Beranda** | Header ringkas (64px) + Banner Urgensi PMB (36px) + Hero Ringkas + Grid 2x2 Statistik + Kartu 4 Pilar Vertikal + Horizontal Scroll Fasilitas + Accordion FAQ + Sticky Bottom Action Bar. | Menghadirkan informasi esensial tanpa membuat pengguna lelah scrolling (*prevent infinite scroll fatigue*). |
| **SCR-M02: Program Keahlian** | Daftar kartu jurusan vertikal bertumpuk. Setiap kartu memiliki badge akreditasi, ikon bidang, deskripsi ringkas, dan tombol "Detail Jurusan" yang membuka **Bottom Sheet**. | Memudahkan perbandingan jurusan tanpa berpindah halaman web (*zero page refresh*). |
| **SCR-M03: Informasi PMB** | Stepper alur pendaftaran 4 langkah vertikal dengan garis penghubung visual (`vertical connecting line`). Menampilkan kartu jadwal gelombang aktif dan kalkulator estimasi biaya. | Memberikan kepastian biaya pendaftaran di layar kecil secara transparan. |
| **SCR-M04: Form Pendaftaran PMB** | Formulir *single-column* berurutan. Keyboard virtual dioptimalkan: `inputMode="numeric"` untuk NISN dan WhatsApp, serta tombol pemicu upload berkas kamera native ponsel. | Mencegah kesalahan ketik dan mempercepat proses pengisian berkas pendaftaran. |
| **SCR-M05: Cek Status PMB** | Input nomor pendaftaran sederhana + verifikasi WhatsApp OTP. Menampilkan status seleksi dalam bentuk kartu ringkasan visual dengan tombol share ke WhatsApp wali. | Orang tua dapat langsung membagikan bukti pendaftaran ke keluarga. |
| **SCR-M06: Portal Wali Murid** | Form login cepat via nomor WA + OTP. Menampilkan kartu riwayat presensi harian anak (kartu per tanggal, bukan tabel lebar yang terpotong). | Orang tua dapat memantau keterlambatan dan kepulangan anak dengan satu sentuhan. |

---

## 5. MOBILE USER FLOW & TOUCH JOURNEYS

### 5.1 Alur Konversi PMB via Sticky Bottom Action Bar
```
[Pengunjung Membuka SCR-M01 di Smartphone]
       │
       ├── Pengguna Menggulir Halaman (Scroll Bebas)
       │    └── [STICKY BOTTOM BAR TETAP MENGAMBANG DI BAWAH LAYAR]
       │         ├── Tombol Kiri (Icon-Only): [WhatsApp Helpdesk] -> Buka Aplikasi WA Native
       │         └── Tombol Kanan (Lebar):    [Daftar PMB Sekarang] -> Amber Glow
       ▼ (Ketuk "Daftar PMB Sekarang")
[Buka Layar Formulir PMB SCR-M04]
       │
       ├── Langkah 1: Ketik Data Calon Siswa (Keyboard Alfabetik)
       ├── Langkah 2: Ketik NISN (Keyboard Numeric Terbuka Otomatis)
       ├── Langkah 3: Pilih Jurusan (Native Dropdown / Bottom Sheet Selector)
       ├── Langkah 4: Unggah Dokumen (Ketuk Kotak Upload -> Buka Kamera / Galeri Ponsel)
       ▼ (Ketuk "Kirim Pendaftaran" di Bagian Bawah Form)
[Layar Bukti Pendaftaran Mobile / Bottom Sheet Sukses]
       │
       ├── Nomor Pendaftaran Tebal: "PMB-2025-0819"
       ├── Tombol "Simpan Gambar Bukti" (Screenshot Ready)
       └── Tombol "Bagikan ke WhatsApp" (Native Share API)
```

---

## 6. MOBILE LAYOUT PER SCREEN & SECTION HIERARCHY

### 6.1 SCR-M01: Beranda Mobile (Wireframe Vertikal)

```
┌────────────────────────────────────────┐
│ [LOGO] SMA GLOBAL MANDIRI   [Mode][Menu]│ (Header 64px, pt-safe)
├────────────────────────────────────────┤
│ ⚡ PMB Gelombang 1 Early Bird (Sisa 18h)│ (Urgency Strip 36px)
├────────────────────────────────────────┤
│ HERO SECTION                           │
│   [Badge: Akreditasi A BAN-SM]         │
│   Wujudkan Generasi Pemimpin Cerdas    │
│   & Berdaya Saing Global               │
│                                        │
│   Pendidikan holistik berstandar       │
│   internasional dengan ekosistem       │
│   digital terpadu.                     │
│                                        │
│   [ Tombol: Daftar PMB Sekarang ]      │ (h-12, w-full, Amber)
│   [ Tombol: Unduh Brosur (PDF)  ]      │ (h-11, w-full, Ghost)
│                                        │
│   QUICK STATS GRID (2 Kolom x 2 Baris) │
│   ┌──────────────────┬─────────────────┐
│   │ Akreditasi A     │ Lulus PTN/LN    │
│   │ 98 / 100         │ 98.4% Masuk Top │
│   ├──────────────────┼─────────────────┤
│   │ Prestasi 2024    │ Komunitas Siswa │
│   │ 150+ Juara       │ 1.250+ Siswa    │
│   └──────────────────┴─────────────────┘
├────────────────────────────────────────┤
│ 4 PILAR KEUNGGULAN (Stack Kartu)       │
│   ┌────────────────────────────────────┐
│   │ [Icon] Kurikulum Cambridge         │
│   │ Sinergi Kurikulum Merdeka & IGCSE  │
│   └────────────────────────────────────┘
│   ┌────────────────────────────────────┐
│   │ [Icon] Pendidik Magister 90%+      │
│   │ Rasio Guru dan Siswa 1:12          │
│   └────────────────────────────────────┘
│   ┌────────────────────────────────────┐
│   │ [Icon] Karakter & Kepemimpinan     │
│   │ Mentoring Akhlak & Spiritual       │
│   └────────────────────────────────────┘
│   ┌────────────────────────────────────┐
│   │ [Icon] Lab AI & Smart Classroom    │
│   │ Fasilitas High-Tech Digital Hub    │
│   └────────────────────────────────────┘
├────────────────────────────────────────┤
│ SAMBUTAN KEPALA SEKOLAH                │
│   [Foto Pimpinan Tengah 96x96 px]      │
│   "Mempersiapkan insan mulia..."       │
│   — Dr. H. Bambang, M.Pd. (Kepsek)     │
├────────────────────────────────────────┤
│ FASILITAS KAMPUS (Horizontal Carousel) │
│   <[Card Lab AI] [Card Sport] [Card] ->│ (Snap-X Scroll)
├────────────────────────────────────────┤
│ FAQ PMB (Accordion Vertikal)           │
│   ▼ Syarat Pendaftaran?                │
│   ► Apakah Tersedia Beasiswa?          │
│   ► Alur Tes Masuk?                    │
├────────────────────────────────────────┤
│ FOOTER RINGKAS (Alamat & Hak Cipta)    │
│   (pb-24 untuk memberi ruang bagi FAB) │
└────────────────────────────────────────┘
┌────────────────────────────────────────┐
│ [💬 WhatsApp PMB] │ [📋 Daftar PMB Sekarang] │ (STICKY BOTTOM BAR 68px, pb-safe)
└────────────────────────────────────────┘
```

---

## 7. MOBILE COMPONENT LIBRARY (SHADCN/UI + RADIX + LUCIDE)

Komponen dioptimalkan secara khusus untuk interaksi layar sentuh smartphone:

### 7.1 Mobile Navigation Sheet (`src/components/ui/sheet.tsx`)
- Menggunakan primitif Radix UI `@radix-ui/react-dialog` yang di-slide dari kanan layar saat tombol menu burger diketuk.
- Memuat logo sekolah, NPSN badge, link navigasi vertikal besar (tinggi link `h-12`, font 16px), tombol toggle dark mode, serta tombol login Portal Wali.
- Dilengkapi tombol silang `<X className="w-6 h-6" />` besar di pojok kanan atas yang mudah ditutup oleh ibu jari.

### 7.2 Sticky Bottom Conversion Bar
- Komponen bilah aksi mengambang yang menempel di bagian bawah layar (`fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-lg border-t border-border pb-safe`).
- **Susunan Dua Tombol Sentuh:**
  1. Tombol WhatsApp Helpdesk: `w-12 h-12 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm active:scale-95`.
  2. Tombol Pendaftaran PMB: `flex-1 h-12 rounded-xl bg-secondary-container text-secondary-foreground font-label-lg-mobile flex items-center justify-center gap-2 font-bold shadow-md active:scale-95`.

### 7.3 Bottom Sheet Modal (Drawer Pengganti Dialog)
- Ketika pengguna mengetuk detail fasilitas sekolah atau preview brosur, modal muncul dari bawah layar (*slide-up bottom sheet*), bukan pop-up tengah yang kecil.
- Dilengkapi drag handle indikator abu-abu (`w-12 h-1.5 rounded-full bg-muted mx-auto my-2`) yang memberikan petunjuk visual bahwa sheet dapat digeser ke bawah untuk menutup.

### 7.4 Input Form Mobile Ergonomis
- **Tinggi Input:** `h-12` (48px) dengan `text-base` (16px) untuk mencegah auto-zoom Safari.
- **Touch-Friendly Keyboard Input Modes:**
  - `inputMode="numeric"` pada field NISN, Kode Pos, dan Nomor WhatsApp.
  - `inputMode="email"` pada field Email Wali.
- **Upload Box Berkas:** Area sentuh besar bergaris putus-putus (`p-6 border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-2 active:bg-accent/10`), dengan pemicu native file picker kamera ponsel.

### 7.5 Mobile Card Presensi Siswa (Pengganti Tabel Lebar)
- Tabel lebar gerbang diubah menjadi kartu presensi harian di layar ponsel:
  ```
  ┌────────────────────────────────────────────────────────┐
  │ Senin, 15 September 2025                  [Tepat Waktu]│
  │ Masuk: 06.42 WIB        Pulang: 15.30 WIB             │
  └────────────────────────────────────────────────────────┘
  ```

---

## 8. MOBILE UI STATE MATRIX & CONNECTIVITY RESILIENCE

Jaringan internet seluler di smartphone sangat rentan terhadap gangguan sinyal (*flaky network*). Desain antarmuka mobile menangani seluruh kondisi secara proaktif:

| Kondisi Mobile | Deteksi Sistem | Tampilan Antarmuka (Mobile Reaction) | Solusi UX |
| :--- | :--- | :--- | :--- |
| **Koneksi Seluler Putus (Offline)** | `window.addEventListener('offline')` | Banner peringatan kuning mengambang tepat di bawah header: *"Koneksi terputus. Data formulir Anda tersimpan di memori perangkat."* | Mencegah hilangnya ketikan pendaftaran PMB saat sinyal hilang. |
| **Pemuatan Awal (Slow 3G)** | Waktu respon > 800ms | Kartu kerangka `Skeleton` shimmer abu-abu vertikal yang ukurannya identik dengan kartu jurusan dan quick stats. | Mencegah layout meloncat saat data Turso tiba. |
| **Formulir Sedang Mengirim** | Tombol submit diketuk | Tombol pendaftaran berubah menjadi spinner berputar `<Loader2 className="w-5 h-5 animate-spin mr-2" />` dan label *"Mengirim Berkas..."* dengan `disabled`. | Mencegah *double submission* / pengiriman formulir ganda. |
| **Gagal Validasi Berkas (> 500KB)** | Pemeriksaan ukuran file client-side | Pesan error merah tepat di bawah kotak upload: *"Ukuran foto melebihi 500KB. Otomatis dikompresi..."* | Membantu orang tua tanpa mengharuskan mereka membuka aplikasi editing foto. |

---

## 9. ADAPTIVE BREAKPOINTS & PHABLET/TABLET REFLOW

Desain mobile bertransisi mulus menuju phablet (layar lipat / folding phone) dan tablet mini:

1. **Resolusi 360px – 480px (Smartphone Murni):**
   - Single-column layout penuh.
   - Quick stats berbentuk 2 kolom x 2 baris.
   - Sticky bottom action bar aktif.
2. **Resolusi 481px – 767px (Phablet / Tablet Portret):**
   - Margin samping bertambah dari 16px menjadi 24px (`px-6`).
   - Quick stats tetap 2x2 atau bertransformasi menjadi 4 kolom horizontal.
   - Sticky bottom bar tetap ada untuk kemudahan konversi.
3. **Resolusi >= 768px (Tablet Landscape / iPad):**
   - Sticky bottom bar bertransisi kembali menjadi menu header desktop.
   - Drawer burger kembali menjadi menu horizontal desktop.

---

## 10. MOBILE ACCESSIBILITY (A11Y) & TOUCH STANDARDS

Mematuhi pedoman **W3C Mobile Accessibility Guidelines** dan standar **Apple iOS Human Interface Guidelines**:

### 10.1 Standar Target Sentuh (Minimum Touch Targets)
- Semua elemen interaktif memiliki bounding-box minimal **48 × 48 px**.
- Jarak antar tombol yang berdekatan minimal **8 px**, memastikan tidak ada salah sentuh bahkan saat pengguna berjalan atau berada di dalam kendaraan bergerak.

### 10.2 Keterbacaan di Luar Ruangan (Outdoor High-Contrast)
- Teks putih di atas tombol utama `#00236f` menghasilkan kontras **14.8:1**.
- Teks gelap di atas tombol amber `#fea619` menghasilkan kontras **8.6:1**.
- Kedua kombinasi tersebut melampaui batas ambang standar luar ruangan (*direct sunlight readability*).

### 10.3 Dukungan Gerakan Sentuh & Pembesaran Layar
- Animasi interaktif dapat dimatikan otomatis jika pengguna mengaktifkan preferensi hemat gerak sistem (`@media (prefers-reduced-motion: reduce)`).
- Struktur layout tetap utuh dan tidak terpotong saat font sistem di smartphone diperbesar hingga 200% (*Dynamic Type / Large Text Accessibility*).

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