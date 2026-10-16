# DESIGN.md — Design System & UI/UX Blueprint
**Project:** Redesign Website Resmi SMP IT Al-Falah (`smpit-alfalah.sch.id`)  
**Tech Stack:** Next.js (App Router), Tailwind CSS, Framer Motion, Embla Carousel / Swiper, Lucide Icons  
**Design Direction:** *Modern Islamic Academic Editorial* (Berwibawa, Hangat, Interaktif, dan Berdimensi)

---

## 1. Prinsip Utama Desain (Core Design Principles)

1. **No Flat White Surfaces (Berlapis & Berdimensi):** Hindari latar belakang putih polos (`#FFFFFF`) yang menyatu dengan kartu putih. Gunakan latar belakang hangat (*Warm Alabaster / Soft Sage Cream*) agar setiap kartu (`bg-white` atau *full-bleed photo card*) tampak menonjol dan memiliki kedalaman (*depth*).
2. **Interactive Storytelling (Geser & Jelajahi):** Pengunjung (terutama orang tua dan calon siswa) lebih menyukai visual kegiatan nyata dibandingkan teks panjang. Gunakan *draggable carousel* dan *multi-photo slider* untuk memamerkan dokumentasi kegiatan sekolah secara hidup.
3. **Islamic Geometric & Dot Texture Subtlety:** Identitas Sekolah Islam Terpadu ditampilkan secara elegan melalui ornamen garis geometris tipis di sudut section (`opacity: 0.04`) dan *radial dot matrix*, bukan keramaian visual yang berlebihan.
4. **Mobile-First Parent Experience:** Mayoritas orang tua mengakses website melalui smartphone (via WhatsApp/Instagram). Semua *slider* wajib mendukung *touch-swipe* yang mulus dan tombol CTA pendaftaran harus mudah dijangkau ibu jari.

---

## 2. Sistem Warna (Color Palette & Tokens)

Palet warna dirancang berdasarkan perpaduan **Deep Forest Emerald** (keteduhan, keislaman, pertumbuhan) dan **Warm Gold / Amber** (prestasi, kemuliaan, akreditasi) di atas kanvas **Warm Alabaster**.

### A. Surface & Background Colors
| Token / Peran | Hex Code | Padanan Tailwind CSS | Penggunaan |
| :--- | :--- | :--- | :--- |
| **Canvas Primary** | `#F7F8F4` | `bg-[#F7F8F4]` / `bg-stone-50` | Latar belakang utama halaman agar mata tidak cepat lelah |
| **Canvas Secondary** | `#EFF3EE` | `bg-[#EFF3EE]` | Latar selang-seling antar section (misal: Section Fasilitas & Ekskul) |
| **Surface Card** | `#FFFFFF` | `bg-white` | Permukaan kartu informasi standar |
| **Surface Dark Emerald** | `#0A3D2E` | `bg-[#0A3D2E]` / `bg-emerald-950` | Kartu Visi, Banner SPMB, Footer, & Overlay bawah pada kartu foto |

### B. Brand & Accent Colors
| Token / Peran | Hex Code | Padanan Tailwind CSS | Penggunaan |
| :--- | :--- | :--- | :--- |
| **Primary Brand** | `#0D4A38` | `text-[#0D4A38]` / `bg-emerald-900` | Judul utama (Heading), tombol navigasi aktif, header |
| **Interactive Emerald** | `#107C5C` | `bg-emerald-700 hover:bg-emerald-600` | Tombol utama, status aktif, aksen hover |
| **Warm Gold (Accent)** | `#C59B38` | `bg-[#C59B38]` / `text-amber-400` | Tombol Next carousel, badge program unggulan, link "Lihat Detail" |
| **Soft Gold Tint** | `#FBF6E9` | `bg-amber-50/80` | Latar belakang badge informasi penting |

### C. Text & Border Hierarchy
* **Heading Text:** `#0A3628` (Deep Emerald Charcoal — memberikan kesan lebih eksklusif daripada hitam pekat `#000000`).
* **Body Text Primary:** `#334155` (`text-slate-700` — kontras tinggi dan nyaman dibaca).
* **Body Text Muted:** `#64748B` (`text-slate-500` — untuk keterangan tambahan/tanggal).
* **Card Border Default:** `border-slate-200/80` (berubah menjadi `border-emerald-600/40` saat di-*hover*).

---

## 3. Sistem Tipografi (Typography System)

Menggunakan kombinasi **Editorial Serif** untuk judul section agar terlihat berwibawa dan berkelas, dipadukan dengan **Modern Sans-Serif** untuk keterbacaan UI yang bersih.

* **Font Heading (Display):** `Playfair Display` atau `Instrument Serif` (`font-serif`)
  * Digunakan pada: Judul Hero, Judul Section Utama (contoh: *"Program & Kegiatan Unggulan"*), dan Judul Kartu Program.
* **Font Body & UI:** `Plus Jakarta Sans` (`font-sans`)
  * Digunakan pada: Navigasi, sub-judul, deskripsi paragraf, *badge/pill*, dan tombol.

### Skala Tipografi (Type Scale)
* **Hero Headline:** `text-4xl md:text-6xl font-bold tracking-tight leading-[1.15]`
* **Section Title (H2):** `text-3xl md:text-5xl font-serif font-bold text-[#0A3D2E] tracking-tight`
* **Section Subtitle:** `text-base md:text-lg text-slate-600 font-normal leading-relaxed`
* **Card Title (Overlay/Bento):** `text-2xl md:text-3xl font-serif font-bold text-white leading-snug`
* **Badge / Pill Text:** `text-[11px] font-semibold uppercase tracking-wider`

---

## 4. Ornamen Latar & Elevasi (Backgrounds & Shadows)

Setiap section utama wajib memiliki salah satu atau kombinasi elemen tekstur berikut di layer paling belakang (`pointer-events-none -z-10`):

1. **Radial Dot Matrix (Sudut Kanan Atas):**
   ```html
   <div class="absolute right-0 top-0 h-80 w-80 bg-[radial-gradient(#0D4A38_1.5px,transparent_1.5px)] [background-size:16px_16px] opacity-[0.12] [mask-image:radial-gradient(ellipse_at_top_right,black_30%,transparent_75%)]"></div>
   ```
2. **Islamic Geometric Line Watermark (Sudut Kiri Atas):**
   * Pola bintang segi delapan (*Rub el Hizb* / *Octagram*) tipis dengan `stroke="#0D4A38"` dan `opacity="0.05"`.
3. **Card Elevation (Shadow System):**
   * **Default Card:** `shadow-[0_10px_30px_-10px_rgba(10,61,46,0.08)]`
   * **Hovered Photo Card:** `shadow-[0_24px_48px_-12px_rgba(10,61,46,0.28)]`

---

## 5. Spesifikasi UI/UX Per Section

### Section 01: Floating Glassmorphism Navbar
* **Perbaikan Teknis Utama:** Hapus penggunaan *Base64 image string* pada logo di `<header>`. Gunakan file `/public/logo-alfalah.webp` melalui komponen `<Image />` Next.js.
* **Bentuk Visual:** Melayang dari atas layar (`fixed top-4 inset-x-4 max-w-6xl mx-auto rounded-full`).
* **Material:** `bg-white/85 backdrop-blur-md border border-slate-200/80 shadow-lg shadow-emerald-950/5 px-6 py-3`.
* **Elemen Kanan:** Tombol CTA **"Daftar SPMB"** berbentuk *pill* (`rounded-full bg-[#0D4A38] text-white px-5 py-2.5`) dengan aksen titik hijau menyala.

---

### Section 02: Hero Section (Asymmetric Split + Floating Cards)
* **Layout:** 12 Kolom Grid (`lg:grid-cols-12 gap-10 items-center`).
* **Sisi Kiri (7 Kolom - Copywriting & Konversi):**
  * **Live Badge:** Pill `bg-emerald-50 border border-emerald-200 text-emerald-800` dengan indikator `animate-ping` bertuliskan *"Pendaftaran SPMB Tahun Ajaran Baru Dibuka"*.
  * **Headline:** Kombinasi teks reguler dan aksen *Gold/Emerald* pada kata kunci *"Generasi Qur'ani, Berakhlak & Berprestasi"*.
  * **Dual Action Buttons:**
    * Primary: *"Daftar Sekarang"* (`bg-[#0D4A38] hover:bg-emerald-800 text-white rounded-full px-7 py-4 shadow-xl shadow-emerald-950/15`).
    * Secondary: *"Lihat Program Kami"* (`bg-white border border-slate-300 hover:border-[#C59B38] text-slate-800 rounded-full px-7 py-4`).
* **Sisi Kanan (5 Kolom - Visual Berlapis):**
  * Bingkai foto utama siswa/gedung sekolah (`rounded-[28px] overflow-hidden shadow-2xl`).
  * **2 Floating Glass Cards** (`bg-white/90 backdrop-blur-md rounded-2xl p-4 shadow-xl border border-white`) di pojok kiri bawah dan kanan atas yang bergerak mengapung halus (*infinite y-axis float*).

---

### Section 03: Program & Kegiatan Unggulan (Interactive Draggable Slider)
*(Mengacu langsung pada referensi desain visual yang telah disepakati)*

#### A. Header Section & Kontrol Navigasi
* **Layout Header:** `flex flex-col md:flex-row md:items-end justify-between mb-10 gap-6`.
* **Sisi Kiri:**
  * Judul: **Program & Kegiatan Unggulan** (`font-serif text-4xl md:text-5xl font-bold text-[#0A3D2E]`).
  * Sub-judul: *"Momen seru dan penuh makna dalam pembentukan karakter siswa."*
* **Sisi Kanan (Navigation & Pagination Hub):**
  * **Tombol Prev & Next Circular:**
    * Tombol Prev (`<`): Lingkaran `w-12 h-12 rounded-full bg-[#0D4A38] text-white hover:bg-emerald-800 transition-transform active:scale-95`.
    * Tombol Next (`>`): Lingkaran `w-12 h-12 rounded-full bg-[#C59B38] text-white hover:bg-amber-600 transition-transform active:scale-95`.
  * **Expanding Pill Pagination (Di bawah tombol panah):**
    * Indikator slide aktif berupa *pill* memanjang (`w-7 h-2 rounded-full bg-[#0D4A38]`), sedangkan slide tidak aktif berupa titik bulat (`w-2 h-2 rounded-full bg-[#C59B38]/40`).

#### B. Mekanisme Slider & Multi-Foto
1. **Horizontal Card Dragging (Level Section):**
   * Menggunakan `embla-carousel-react` dengan mode `dragFree: true` dan `align: "start"`.
   * Kartu di sisi paling kiri dan kanan terpotong sebagian (*peek effect* / *bleed out of container*) untuk memberi petunjuk visual bahwa deretan kartu bisa digeser ke kanan/kiri.
   * Kursor berubah menjadi `cursor-grab` saat berada di atas area kartu dan `active:cursor-grabbing` saat ditarik.
2. **Multi-Foto di Dalam Satu Program (Level Kartu / Modal):**
   * Setiap program (misal: *MABIT*, *Tahfidz Camp*, *Outbound & LDKS*, *Market Day*) dapat memiliki **3–5 foto dokumentasi**.
   * **Opsi Interaksi 1 (In-Card Mini Swipe / Auto-Crossfade):** Saat kartu di-*hover* atau diketuk pada bagian atas foto, foto di dalam kartu dapat berganti (dilengkapi *mini progress bar* tipis di bagian paling atas kartu seperti Instagram Story).
   * **Opsi Interaksi 2 (Interactive Lightbox Drawer):** Saat pengguna mengeklik **"Lihat Detail ->"**, muncul *Modal / Drawer* modern yang menampilkan *Photo Carousel* ukuran penuh beserta deskripsi lengkap kegiatan tersebut.

#### C. Anatomi Kartu Program (Portrait Full-Bleed Card)
* **Dimensi & Bentuk:** `w-[310px] sm:w-[350px] h-[440px] rounded-[28px] relative overflow-hidden shrink-0 select-none group`.
* **Layer 1 — Background Image:**
  * Foto kegiatan memenuhi seluruh kartu (`absolute inset-0 w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105`).
* **Layer 2 — Gradient Scrim Overlay:**
  * Gradasi gelap bernuansa *Deep Emerald* dari bawah ke tengah agar teks putih dan emas selalu terbaca jelas:
    `bg-gradient-to-t from-[#06291F] via-[#06291F]/70 via-35% to-transparent`.
* **Layer 3 — Top Badges (Pojok Kiri & Kanan Atas):**
  * **Kiri Atas (Kategori):** Pill berwarna hijau tua transparan `bg-[#0D4A38]/85 backdrop-blur-md text-white text-[11px] font-bold tracking-wider uppercase px-3.5 py-1.5 rounded-full border border-white/15` (Contoh: `KEAGAMAAN`, `QUR'ANI`, `FISIK & KARAKTER`).
  * **Kanan Atas (Nama Singkat):** Pill berwarna emas `bg-[#C59B38] text-white text-[11px] font-bold tracking-wider uppercase px-3.5 py-1.5 rounded-full shadow-sm` (Contoh: `MABIT`, `TAHFIDZ CAMP`, `OUTBOUND & LDKS`).
* **Layer 4 — Bottom Content Area (`absolute inset-x-0 bottom-0 p-6 flex flex-col justify-end`):**
  * **Judul Program:** `font-serif text-3xl font-bold text-white mb-1` (Contoh: *Tahfidz Camp*).
  * **Sub-judul Program:** `text-sm text-emerald-100/90 font-medium mb-5` (Contoh: *Malam Bina Iman & Taqwa*).
  * **Footer Kartu (Tags & Action Link):**
    * Sisi Kiri: *Hashtag Pills* (`bg-white/10 backdrop-blur-sm border border-white/15 text-emerald-50 text-xs px-3 py-1 rounded-full`, contoh: `#Tahfidz`, `#Ukhuwah`).
    * Sisi Kanan: Link `Lihat Detail ->` dengan warna emas cerah (`text-[#E5B84B] text-xs font-semibold flex items-center gap-1 group-hover:translate-x-1 transition-transform`).

---

### Section 04: Sambutan Kepala Sekolah & Visi-Misi (Split Bento)
* **Sambutan Kepala Sekolah:**
  * Dikemas dalam 1 *Wide Executive Card* (`rounded-3xl bg-white p-8 md:p-12 border border-slate-200/70 shadow-sm`).
  * Sisi kiri menampilkan foto Kepala Sekolah dengan bingkai beraksen emas, sisi kanan menampilkan kutipan utama (*pull-quote*) dan tombol *expand* untuk membaca sambutan penuh tanpa membuat halaman terlalu panjang.
* **Visi & Misi (Asymmetric Grid):**
  * **Kartu Visi:** Berlatar `bg-[#0A3D2E] text-white rounded-3xl p-8 md:p-10` dengan ornamen kaligrafi/geometris samar di latar belakang.
  * **Kartu Misi:** Grid 2x2 berisi 4 kartu putih dengan badge nomor urut (`01`, `02`, `03`, `04`) berwarna *Warm Gold*.

---

### Section 05: Fasilitas Sekolah (Asymmetric Bento Grid + Multi-Photo Preview)
* **Layout:** `grid grid-cols-1 md:grid-cols-4 auto-rows-[250px] gap-5`.
* **Pembagian Ukuran Bento:**
  * Gedung Utama / Masjid Sekolah: `md:col-span-2 md:row-span-2` (Kotak Besar Utama).
  * Laboratorium Komputer / IPA: `md:col-span-2 md:row-span-1` (Persegi Panjang Lebar).
  * Perpustakaan & Lapangan Olahraga: Masing-masing `md:col-span-1 md:row-span-1`.
* **Interaksi Hover & Galeri:**
  * Setiap kartu fasilitas memiliki badge jumlah foto di pojok kanan atas (misal: `[ 📷 4 Foto ]`). Saat diklik, pengguna bisa menggeser foto-foto sudut ruangan fasilitas tersebut.

---

### Section 06: Ekstrakurikuler (Dynamic Action Cards)
* Menampilkan ekskul unggulan seperti **Karate, Paskibra, Pramuka, Panahan/Futsal, dan Rohis/Tahfidz**.
* **Desain Kartu:**
  * Bagian atas berupa foto kegiatan dengan rasio `16:10` dan *badge* kategori melayang.
  * Bagian bawah berlatar putih bersih dengan judul ekskul, jadwal/fokus pembinaan, dan 3 *skill pills* (`#Kedisiplinan`, `#MentalJuara`, `#Kepemimpinan`).
  * Memiliki garis aksen emas-hijau di dasar kartu yang memanjang (`w-0 group-hover:w-full`) saat di-*hover*.

---

### Section 07: Informasi SPMB (High-Conversion Stepper)
* **Timeline Gelombang Pendaftaran:**
  * Kartu gelombang yang sedang buka diberi label **"GELOMBANG AKTIF"** dengan `border-2 border-[#107C5C] bg-white shadow-xl` agar orang tua langsung fokus pada jadwal terdekat.
* **Alur Pendaftaran (4 Langkah):**
  * Dihubungkan dengan garis progres horizontal (di desktop) dan vertikal (di mobile).
* **Floating WhatsApp & CTA Banner:**
  * Banner penutup berlatar *Deep Emerald* dengan tombol langsung ke WhatsApp Panitia SPMB dan formulir pendaftaran online.

---

## 6. Spesifikasi Animasi & Micro-Interactions

1. **Carousel Physics:**
   * Gunakan transisi *spring* yang natural (`stiffness: 300, damping: 30`) saat kartu digeser dengan mouse maupun sentuhan jari.
2. **Scroll Reveal (Framer Motion):**
   * Setiap section muncul secara bertahap saat masuk ke layar (`viewport={{ once: true, margin: "-80px" }}`).
   * Kartu di dalam *slider* muncul berurutan dari kiri ke kanan (*stagger* `0.08s`).
3. **Hover Micro-Interactions:**
   * **Card Image Zoom:** `scale-100` ke `scale-105` dengan durasi `700ms ease-out`.
   * **Button Arrow Nudge:** Ikon panah pada `"Lihat Detail ->"` bergeser `4px` ke kanan saat kartu di-*hover*.

---

## 7. Checklist Implementasi Teknis (Next.js Optimization)

- [ ] **Optimasi Logo Header:** Pindahkan data Base64 logo dari komponen Header menjadi file statis `/public/images/logo-smpit-alfalah.webp` dan panggil dengan `<Image src="/images/logo-smpit-alfalah.webp" width={48} height={48} priority />`.
- [ ] **Instalasi Library Pendukung:**
  * `npm install embla-carousel-react framer-motion lucide-react clsx tailwind-merge`
- [ ] **Konfigurasi Font di `app/layout.tsx`:**
  * Muat `Playfair_Display` (variabel `--font-serif`) dan `Plus_Jakarta_Sans` (variabel `--font-sans`) dari `next/font/google`.
- [ ] **Struktur Data Program & Multi-Foto:**
  * Buat struktur data array di mana setiap item program memiliki properti `images: string[]` sehingga setiap kegiatan bisa menampung banyak foto dokumentasi sekaligus.