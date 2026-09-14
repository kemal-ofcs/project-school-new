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