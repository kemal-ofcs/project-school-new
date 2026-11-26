# PRD: UI halaman dalam navy + emas

Status 2026-11-26: Fase 0, A, C, D, dan B (Web/Desktop) sudah ditulis dan **disetujui pemilik** (semua saran diterima). B Mobile ditulis 2026-11-26, belum ditinjau. `jalankan-antislop` → `jalankan-check` belum dijalankan pemilik.

**Progres Fase B Mobile (2026-11-26).**
- **B2.** `@theme` Mobile memakai skala navy yang sama dengan Web. Di tema terang skalanya dicermin: 950/900 → `#eef2fc`/`#dce4f9`, 400/300/200 → `#2f4fbf`/`#10308a`/`#0c2470` (teks terendah 5,7:1 di `#e2e8f0`), 100/50 → 900/950. `.theme-invariant` memakai nilai navy gelap. Aurora, seleksi, dan `--app-primary` terang ikut navy.
- **B1.** Ke cyan: `RunStatusBadge` Diajukan, `StatusBadge` "Datang Lebih Awal", pil `info` Operator, Cicilan "Menunggu barang", `FeedbackBanner` `info`, angka Izin Leger ×2, tombol Izin Presensi KBM. Tombol Izin Presensi KBM **Web** ikut pindah ke `bg-cyan-500` beserta legenda Izin-nya: di tema terang teksnya dipaksa `#020617` (`.status-kehadiran-pilihan`) di atas `bg-sky-700`, ±1,5:1.
- **B3.** 71 baris di 32 berkas Mobile: `bg-sky-400|500 … text-slate-950` → `bg-sky-700 text-on-accent`, `hover:bg-sky-300|400|500` → `hover:bg-sky-600`. Tombol audit-absensi `bg-sky-500` → 700. `inventory/gaya.ts` dan `nilai/EksporErapor.tsx` (salinan dari Web) memakai `text-white` di atas sky-600, yang di Mobile terang jadi tinta gelap di atas navy: disunting di Web lalu disinkron. Sinkron ini juga membawa hasil B3 Web ke salinan Mobile yang tertinggal (termasuk `PilihPersonil`).
- **Web.** Aturan terang `a[href="/scanner"].bg-sky-400` dan `button.bg-sky-400` dihapus. `button.border-sky-400` (tab bergaris bawah, teks navy) kini mengecualikan `bg-sky-500|600|700`: chip "Semua" `PilihPersonil` di `/operational` sebelumnya tertulis navy di atas navy.
- **Sidebar (permintaan pemilik).** Tombol hamburger layar lebar pindah ke kepala sidebar di samping logo. Saat sidebar disembunyikan, tombol muncul di bilah atas; fokus berpindah ke tombol pasangannya. Tombol laci HP tetap di bilah atas.
- Cek: `tsc` Web + Mobile, Biome 45 + 5 berkas, `audit:kontras` lulus. **Belum:** tangkapan layar Mobile kedua tema, tombol hamburger di browser.

**Progres Fase B Web/Desktop (2026-11-26).** Keputusan pemilik: status yang dulu `sky` pindah ke **cyan**; Web dulu, Mobile menyusul.
- **B1. Status keluar dari `sky`.** Ke cyan: Sakit (Dasbor Kehadiran ×3), Izin (Leger ×2), `StatusBadge` `info`, `RunStatusBadge`, `SyncPulse` "Menyinkronkan", Cicilan "Menunggu barang", fallback status Rekrutmen, status tujuan di `RunDetailClient`, `BootstrapPanel` info box (+ override terang `.bootstrap-info-box` ke cyan-800). Ke emerald: kartu "Hadir Hari Ini" dan legenda "Tepat Waktu" (`dashboard`), teks "Tepat Waktu" di `AttendanceGauge3D`/`AttendanceGaugeGate`, `--chart-tepat` (`#10b981` gelap, `#059669` terang), "Akun aktif" (`operators`), hasil scan sukses (`scanner`).
- **B2. Remap.** Blok `@theme` di `globals.css` Web: `--color-sky-50..950` = skala navy (`#eef2fc` … 400 `#7b93e3` 6,1:1 vs `#0f172a` … 700 `#10308a` = navy login … 950 `#061033`). Semua hex/`rgb` sky di `globals.css` (override tema terang, fokus input, sidebar aktif, seleksi, aurora) dipetakan ke skala yang sama.
- **B3. Tombol bertulisan gelap.** Dengan skala baru, teks `slate-950` di `bg-sky-500` hanya 4,06:1 dan `bg-sky-400` jadi pucat. 65 baris tombol/chip `bg-sky-500|400 … text-slate-950` diganti `bg-sky-700 hover:bg-sky-600 text-on-accent` (29 + 36 baris, termasuk `Modal`, `useConfirmDialog` `info`, `kepegawaian/gaya.ts`).
- **Di luar cakupan, tidak disentuh:** hex sky di data kartu ID (`id-card-*`, `db-schema.ts`), `LoginScene` 3D, overlay kanvas `scanner:1167`. Aturan terang `a[href="/scanner"].bg-sky-400` dan `button.bg-sky-400` di `globals.css` kini tak terpakai JSX; kandidat hapus.
- Cek: `tsc` Web lulus, Biome 85 berkas lulus, `audit:kontras` lulus. Penyisiran 0c pada `/`, `/dashboard`, `/scanner`, `/siswa`, `/presensi-kelas`, `/settings`, `/payroll` kedua tema: hanya 4 temuan, semuanya teks "Memuat…" `animate-pulse` yang tertangkap saat opasitas turun (sudah ada sebelum B). Tangkapan layar ketujuh halaman kedua tema diperiksa.

**Progres Fase D (2026-11-25):**
- **D1.** `HubRow` Mobile: `HubRowTone` dan prop `tone` dihapus (32 baris `tone=` di 5 halaman: dashboard, operasional-hub, personil, settings, settings/struktur-jadwal). Gaya di `.hub-row*` (`globals.css` Mobile, padanan `.aksi-cepat` Web): border `--app-gold-line`, kotak ikon navy dengan ikon emas, kartu putih di tema terang. Badge `bg-rose-500` → `bg-rose-700` (putih 6:1; sebelumnya ±3,7:1). Tautan `BackHeader` `text-sky-300` → `.hub-kembali` (`--app-gold-text`).
- **D2.** `StatTile` memakai `.kartu-angka` (transparan, garis emas); `tone` tetap warna status. `SummaryTile` lokal di `DashboardInsights` (salinan identik) dihapus, keempat kartunya kini `StatTile`.
- **D3.** Tema terang lewat token `--app-*` yang sudah ada di blok `:root[data-theme="light"]`; tidak ada variabel baru.
- **D4.** `TabBar` sudah di Mobile sejak A4. `MemuatHalaman` tidak disalin: Mobile tidak punya layar "Memuat otorisasi" yang setara.
- Cek: `tsc` Mobile lulus, Biome 9 berkas lulus, `audit:kontras` lulus. Tangkapan layar Playwright (sesi ditiru, API 503): K10 dashboard Mobile 390px kedua tema lulus; K1/K9 Web `/` 390px (2 kolom) dan 1280px (4 kolom) kedua tema lulus, tanpa label terpotong.
- **D5 (dari tangkapan layar, 2026-11-26).**
  - `/dashboard` Web: segmen "Rekap Kehadiran / Papan Peringkat" diganti `TabBar` (`idPrefix="dashboard"`, panel `panel-dashboard-laporan` ber-`role="tabpanel"`); `xl:shrink-0` supaya label tidak terpotong di 1280px. Chip "1 Tanggal / Rentang" masih `sky-700`, ikut Fase B.
  - `MobileBottomNav`: kelas dasar terang + varian `dark:` (`bg-white/95`, `ring-white`, ikon `text-white`) dibalik variabel tema terang Mobile, jadi bilah gelap dan ikon Scanner jadi tinta gelap. Ditulis ulang dengan dasar gelap (`bg-slate-950/95`, `border-white/10`, `ring-slate-950`); tab aktif `.nav-aktif` (`--app-gold-text`) dan `.nav-aktif-ikon`; tombol Scanner `.ikon-navy` (kelas yang sama dengan kotak ikon `HubRow`, sebelumnya `.hub-row-ikon`).
  - Cek: `tsc` Web + Mobile, Biome 4 berkas, `audit:kontras` lulus; tangkapan layar `/dashboard` Web 1280px dan dashboard Mobile 390px kedua tema benar.

**Progres Fase C (2026-11-25):**
- **C1.** `QuickActionItem` mendapat `visible?: boolean` (disaring bersama `area`). Penggajian: Batch Runs, Rapel Gaji (selalu), Pelaporan (`bolehLapor`), Konfigurasi Gaji (`payroll.config.manage`) pindah ke grid; header hanya "Buat Batch Payroll" (bila `payroll.run.create`).
- **C2.** Empat kartu Konfigurasi Gaji memakai `QuickActionGrid` dengan `subtitle`. Baris tab buatan sendiri di halaman yang sama (Rate Gaji / Komponen) ikut diganti `TabBar` (`idPrefix="konfigurasi-gaji"`, panel ber-`role="tabpanel"`).
- **C3.** Tidak ada perubahan: Settings hanya punya satu tautan kontekstual (ke Akademik) di dalam panel, Kepegawaian tidak punya tautan ke halaman lain; keduanya sudah memakai `TabBar`.
- Cek: `tsc` Web lulus, Biome 3 berkas lulus, grep K4 tetap bersih. **Belum:** uji manual K6/K7 dengan akun Superadmin dan Bendahara.

**Progres Fase A (2026-11-25):**
- **A1.** Token `--app-navy`, `--app-navy-strong`, `--app-gold-line` (gelap `#86682a` 3,4:1 vs `#0f172a`; terang `#d97706` 3,2:1), `--app-gold-text` (gelap `#f6c453` 11:1; terang `#92400e` 7,1:1) di `:root` dan blok terang, Web dan Mobile. Putih di navy `#10308a` 11,6:1.
- **A2.** `QuickActionTile` memakai kelas `.aksi-cepat*`; `tone` dan `isPrimaryAction` (tak terpakai) dihapus, `subtitle` kini tampil, judul tidak lagi `line-clamp`. Badge tetap berwarna status (rose/amber/emerald/sky 700 + `.text-on-accent`), jadi grep K2 masih menemukan `amber`/`emerald` di peta badge. `QuickActionGrid`: `grid-cols-2`, prop `kolom` 3/4 untuk ≥640px.
- **A3.** `PageHeader` memakai `.page-header*` (garis bawah emas, eyebrow `--app-gold-text`); tiga override terang lama dihapus.
- **A4.** `components/ui/TabBar.tsx` + `TabBar.test.ts` (4 lulus). 10 baris tab diganti, termasuk Akademik (kini ber-ARIA, panel `panel-akademik`). Settings memakai `vertikalLg`; id tabnya berubah `settings-tab-*` → `tab-settings-*`. Pengajuan memakai `panelId="daftar-pengajuan"` (id di `<ul>`). `TabBar` masuk `filesToCopy`; blok `.tab-bar` disalin ke `globals.css` Mobile. Grep K4: hanya `TabBar.tsx` (Web + salinan Mobile) dan tesnya.
- **A5.** `components/ui/MemuatHalaman.tsx` menggantikan 8 layar Payroll dan spinner `app/page.tsx`. Grep K8 = 0.
- Cek: `tsc` Web lulus, Biome berkas yang diubah lulus, `audit:kontras` lulus. **Belum:** tangkapan layar K1/K9 (dashboard 390px dan 1280px, kedua tema), `tsc` Mobile, uji panah keyboard di browser.

**Progres Fase 0 (2026-11-25):**
- **0a selesai.** `components/ui/Sakelar.tsx` beserta tes (`Sakelar.test.ts`, 4 lulus) masuk `filesToCopy` Mobile. 14 sakelar Web/Desktop dan 4 sakelar Mobile sudah diganti: `NotifikasiWaCard` ×8, `OtomasiAlfaCard`, `holidays`, `shift` ×2, `LayoutPanel` ×2; Mobile `shift`, `MailSettingsCard`, `settings/sistem`, `settings/keamanan-absensi`. Tambalan lama `input.peer ~ div.bg-slate-800` dihapus dari kedua `globals.css`.
- **0b dan 0d selesai.** `.text-on-accent` ditambahkan di Web. 68 potongan `className` diperbaiki (salinan Mobile disunting lewat berkas asli Web). `audit:kontras` lulus dan sudah terpasang di `check` dan `check:quick` root.
- **0c sebagian.** `web-desktop/scripts/sisir-kontras.mts` menyisir 40 dari 47 halaman. Temuan dan perbaikannya:
  - teks pudar tema terang (`text-slate-500`, badge netral) `#64748b` → `#5b677c`, di Web dan variabel Mobile;
  - teks aksen pucat 200-400 (biru, indigo, violet, ungu, teal, cyan, oranye, fuchsia, kuning, merah) digelapkan di Web;
  - teal-400 dan cyan-400 Mobile digelapkan.

  Sisanya belum disisir karena server dev mengompilasi ±15 detik per rute dan macet di `/dashboard`. Ulangi dengan server segar: `node scripts/sisir-kontras.mts laporan.json` (hasil ditulis per halaman; `SISIR_HALAMAN="/a,/b"` untuk sebagian).
- **Belum:** tangkapan layar K11 (keempat kombinasi tema × keadaan) dan uji klik → simpan → muat ulang untuk setiap sakelar. Keduanya diuji pemilik di browser.

Hanya tampilan: tidak ada tabel, kolom, command Tauri, rute API, atau izin baru.

## 1. Masalah dan tujuan

Halaman login sudah memakai palet navy + emas. Halaman dalam (dashboard dan 50 halaman lain) masih memakai palet lama:
- aksen `sky-*` yang ditulis langsung di tiap berkas,
- kartu Akses Cepat dengan warna berbeda per menu,
- baris tab yang ditulis ulang di setiap halaman,
- layar "memuat" yang tidak seragam.

Pemilik sudah membuat mockup dashboard (gelap dan terang, desktop dan HP) sebagai acuan.

Tujuan:
1. Satu bahasa visual untuk semua halaman dalam: kotak ikon navy, garis dan penanda aktif emas, kartu angka transparan.
2. Perubahan dilakukan di komponen bersama, supaya puluhan halaman ikut berubah tanpa disunting satu per satu.
3. Halaman yang isinya daftar sub-menu memakai grid Akses Cepat, bukan deretan tombol di header.

## 2. Keputusan pemilik

| Tanggal | Keputusan |
|---|---|
| 2026-11-25 | Navy + emas menjadi arah warna seluruh aplikasi, dikerjakan bertahap. Login sudah selesai. |
| 2026-11-25 | Mockup Akses Cepat dashboard menjadi acuan untuk menu-menu lain. |
| 2026-11-25 | Emas di latar terang wajib digelapkan sampai kontras teks ≥ 4,5:1. |
| 2026-11-25 | Antislop untuk pekerjaan UI ini dijalankan pemilik secara manual, bukan oleh Claude. |
| 2026-11-25 | Q-1: warna per menu (`tone`) di Akses Cepat dihapus. Satu nada navy, warna hanya untuk badge status. |
| 2026-11-25 | Q-2: Fase B (remap `sky`) ditunda sampai A + C disetujui. |
| 2026-11-25 | Q-3: Mobile (Fase D) dikerjakan setelah C. |
| 2026-11-25 | Q-4: sidebar dan hero dashboard dipindah ke PRD terpisah. |
| 2026-11-25 | Pemilik melaporkan dua bug yang sering muncul: (1) tombol on/off tidak berubah warna atau hilang saat dinyalakan/dimatikan, (2) teks hampir sewarna dengan latarnya sehingga tidak terbaca. Keduanya masuk Fase 0. |
| 2026-11-25 | Q-5: bug sakelar terjadi di semua perangkat (Web, Desktop, Mobile). |
| 2026-11-25 | Q-6: sakelar aktif berwarna **hijau**, nonaktif **netral**. Keadaan nonaktif harus tetap jelas terlihat dan tidak boleh menyatu dengan latar. Navy + emas adalah warna identitas, bukan warna status (§3a). |
| 2026-11-25 | Q-7: gate `audit:kontras` dibuat. |

Teks pada mockup tidak disalin karena ada salah ketik ("Personii", "Serpras", "Kenangan", "Dwki Pagi"). Label tetap diambil dari `navigation-items.ts`.

## 3a. Prinsip warna: identitas vs status

Warna dibagi menjadi dua kelompok yang tidak boleh saling meminjam.

| Kelompok | Dipakai untuk | Warna |
|---|---|---|
| **Identitas** (ikut tema) | Menu sidebar aktif, tab aktif, chip/filter terpilih, tombol utama, tautan, cincin fokus keyboard, kotak ikon Akses Cepat, garis kartu, judul halaman | Navy + emas |
| **Status** (tetap, sama di semua tema dan perangkat) | Aktif/nyala, berhasil, tepat waktu | Hijau |
| | Peringatan, terlambat | Kuning (amber) |
| | Gagal, hapus, belum absen | Merah (rose) |
| | Nonaktif, mati, kosong | Netral (abu-abu) yang tetap terlihat |

Aturan turunan:
- **Emas tidak pernah dipakai sebagai isi status.** Emas hanya muncul sebagai garis, penanda aktif, atau aksen tipis. Karena warnanya dekat dengan kuning peringatan, status peringatan selalu disertai ikon dan teks, bukan warna saja.
- **Keadaan tidak pernah ditunjukkan dengan warna saja.** Sakelar disertai teks "Aktif"/"Nonaktif", dan badge status disertai ikon atau teks.
- **Kontras:**
  - kontrol (sakelar, garis tombol, lintasan) ≥ 3:1 terhadap latar di belakangnya,
  - teks ≥ 4,5:1,
  - keduanya di kedua tema.

## 3. Alur pengguna

- **Admin TU / Superadmin (desktop).** Membuka Penggajian dan langsung melihat grid Akses Cepat: Batch Runs, Rapel, Pelaporan, Konfigurasi. Di header hanya ada satu tombol utama, "Buat Batch Payroll". Halaman Konfigurasi Gaji menampilkan empat aturan tarif dalam grid yang sama.
- **Bendahara.** Grid hanya menampilkan kartu yang boleh ia buka. Penyaringan memakai `area` atau izin yang sama dengan tombol yang digantikan, jadi tidak ada menu baru yang tiba-tiba terlihat atau hilang.
- **Guru (HP, Web).** Akses Cepat tampil 2 kolom, sehingga label tidak terpotong.
- **Semua peran.** Tab di Keuangan, Inventaris, Pengajuan, dan lainnya tampil dan berperilaku sama: tab aktif berlatar navy dengan garis emas, dan bisa dipindah dengan tombol panah keyboard.

## 4. Wajib ada

### Fase 0: bug sakelar dan kontras teks (Web/Desktop + Mobile)

Fase ini perbaikan bug, bukan ganti palet. Karena itu dikerjakan lebih dulu dan lepas dari keputusan warna.

- **0a. Komponen `Sakelar` bersama** (`components/ui/Sakelar.tsx`) menggantikan 13 sakelar buatan sendiri di Web/Desktop dan yang ada di 3 berkas Mobile (§8).
  - Elemen `<button role="switch" aria-checked>`.
  - Props: `checked`, `onChange`, `disabled`, `label` (dipakai untuk `aria-label`), dan `id` (opsional).
  - Gayanya ditulis sebagai kelas semantik di `globals.css` (`.sakelar`, `.sakelar[aria-checked="true"]`, `.sakelar-kenop`), mengikuti pola `.login-*`. Tidak memakai utilitas `bg-slate-*`/`bg-white`, karena utilitas itulah yang ditimpa blok tema terang Web dan dibalik variabel `--color-*` Mobile.
  - Warna (Q-6). Nilainya sama di kedua tema, sehingga tidak ada blok tema yang bisa menimpanya:

    | Keadaan | Lintasan | Kontras vs kartu gelap `#0f172a` | Kontras vs kartu terang `#ffffff` |
    |---|---|---|---|
    | Aktif | hijau `#059669` | ±4,7:1 | ±3,8:1 |
    | Nonaktif | netral `#64748b` | ±3,7:1 | ±4,8:1 |

    Kedua keadaan lolos syarat ≥ 3:1 (WCAG 1.4.11), jadi lintasan nonaktif tidak menyatu dengan kartu. Kenop putih dengan bayangan dan garis tepi tipis. Nilai akhir dicek ulang dengan pemeriksa kontras saat implementasi.
  - Disabled: opasitas 50% ditambah kursor `not-allowed`. Lintasannya tetap berwarna sesuai keadaannya.
  - Cincin fokus keyboard memakai warna identitas (emas di tema gelap, navy di tema terang), mengikuti §3a.
  - Keadaan tidak hanya ditunjukkan dengan warna: ada teks "Aktif"/"Nonaktif" di samping sakelar, yang bisa dimatikan lewat prop bila label baris sudah menyatakannya.
  - Bila berkas Web dan Mobile identik byte, komponen ini masuk `filesToCopy`. Bila tidak, port dengan tangan.
- **0b. Teks di atas latar berwarna.**
  - Web: tambahkan kelas `.text-on-accent` di `globals.css` Web (Mobile sudah punya, `mobile/src/app/globals.css:221-226`) dengan warna `#ffffff` di kedua tema, lalu pakai di 27 elemen Web dan 14 elemen Mobile yang terdaftar di §8.
  - Daftar putih `.bg-sky-500 … .bg-amber-600` di `globals.css:1118-1160` tidak ditambah warna baru satu per satu, karena daftar itulah yang terus tertinggal.
  - Dari sisi aturan: `.text-white` dan `.text-slate-100/200` tetap dipaksa gelap di tema terang. Aturan itu tidak diubah. Yang diperbaiki adalah elemen-elemen yang salah memakainya.
- **0c. Penyisiran kontras saat berjalan.** Pemindaian statis tidak menangkap teks putih yang warna latarnya berasal dari elemen induk. Jadi dibuat skrip Playwright (Node, memakai alur login `web-desktop/scripts/capture-promosi.ts`) yang membuka halaman utama di kedua tema dan menghitung kontras setiap simpul teks terhadap latar efektifnya.
  - Hasilnya ditulis ke berkas, tanpa dependensi baru (tanpa axe).
  - Pelanggaran yang ditemukan diperbaiki dengan `.text-on-accent` atau kelas semantik.
- **0d. Gate statis `audit:kontras`** (`scripts/audit-kontras.ts`). Gate ini gagal bila satu `className` memuat `text-white`/`text-slate-100`/`text-slate-200` bersama latar solid berwarna (`bg-{hue}-{500..900}`, `bg-gradient-*`, atau `bg-[#…]`) yang tidak ada di daftar putih tema terang. Tujuannya mencegah kasus yang sama muncul lagi. Gate ini tidak punya daftar pengecualian (`references/13`).

### Fase A: fondasi (Web/Desktop)

- **A1. Token warna.** Satu blok token navy + emas di `globals.css`, dipakai oleh komponen di bawah:
  - navy `#0a1a4f` / `#10308a` (sama dengan `.login-hero`),
  - emas `#f6c453` di tema gelap,
  - emas teks di tema terang memakai nada gelap yang lolos 4,5:1 terhadap `#ffffff`. Kandidatnya `#92400e`. Nilai `--app-gold` terang yang ada sekarang, `#d97706`, hanya ±3,2:1, jadi hanya boleh dipakai untuk garis dan border (syaratnya ≥ 3:1).
- **A2. `QuickActionTile` dan `QuickActionGrid`.**
  - Kotak ikon navy dengan ikon terang, border emas tipis, hover menebalkan border emas, fokus keyboard memakai cincin emas.
  - Warna per menu (`tone`) dihapus. Warna hanya dipakai untuk `badge` (status).
  - Grid `grid-cols-2 sm:grid-cols-4`, dengan jumlah kolom bisa diatur untuk hub yang kartunya 3 atau 4.
  - Tema terang: kartu putih, border emas, kotak ikon tetap navy.
- **A3. `PageHeader`.** Bentuknya sama dengan judul dashboard di mockup: titik dan label kecil emas, judul tebal, deskripsi redup, dan garis bawah emas tipis menggantikan `border-white/10`. API komponen tidak berubah, jadi ke-42 halaman pemakainya tidak disunting.
- **A4. `TabBar` bersama** di `components/ui/TabBar.tsx`:
  - Props: `tabs` (berisi `id`, `label`, `badge?`), `value`, `onChange`, `idPrefix`, `ariaLabel`.
  - Menghasilkan `role="tablist"` / `role="tab"`, `aria-selected`, `aria-controls="panel-{idPrefix}-{id}"`, dan `id="tab-{idPrefix}-{id}"`. Pola id ini sama dengan yang sekarang (`tab-keuangan-${id}`), jadi panel yang sudah ada tidak perlu diubah.
  - Navigasi keyboard: panah kiri/kanan, Home, End.
  - Tinggi minimal 44px dan bisa digulir ke samping di HP.
  - Menggantikan 10 baris tab yang ada (§7). Tab di Akademik yang belum punya ARIA ikut diganti.
- **A5. `MemuatHalaman`.** Satu komponen layar penuh untuk menunggu otorisasi. Menggantikan teks polos "Memuat otorisasi…" di 8 halaman Payroll dan spinner biru di `app/page.tsx:121`. Spinner kecil di dalam tombol atau tabel tidak disentuh.

### Fase C: hub Akses Cepat per modul (Web/Desktop)

- **C1. Penggajian** (`payroll/page.tsx`). Empat tombol navigasi di header dipindah ke grid Akses Cepat dengan syarat tampil yang persis sama:
  - Batch Runs dan Rapel: selalu tampil,
  - Pelaporan: `bolehLapor(user)`,
  - Konfigurasi: `payroll.config.manage`.

  Header hanya memuat "Buat Batch Payroll".
- **C2. Konfigurasi Gaji** (`payroll/config/page.tsx:363-420`). Empat kartu sub-modul dibuat ulang dengan `QuickActionTile`. Subjudulnya (mis. "PP 35/2021") tetap ditampilkan, jadi `QuickActionTile` perlu benar-benar menampilkan prop `subtitle` yang sekarang dideklarasikan tetapi tidak dipakai.
- **C3. Settings dan Kepegawaian.** Dinilai saat fase ini dikerjakan. Keduanya halaman ber-tab, bukan hub tautan, jadi cukup memakai `TabBar` dari A4. Grid hanya ditambahkan bila ternyata ada deretan tautan ke halaman lain.

### Fase B: remap warna aksen `sky` (opsional, menunggu keputusan Q-2)

- Di `@theme` `globals.css`, ganti nilai `--color-sky-*` dengan skala navy, sehingga sekitar 1.339 pemakaian `sky-*` di JSX ikut berubah dari satu berkas.
- Sebelum berjalan, inventaris dulu pemakaian `sky` yang bermakna "info" atau status. Pemakaian itu dipindah ke warna lain lebih dulu, supaya status tidak ikut menjadi navy.
- Override tema terang di `globals.css` yang menarget nama kelas (`button:is(.bg-sky-500, .bg-sky-700)`, sekitar baris 451-470) tetap berlaku dan harus dicek ulang kontrasnya.

### Fase D: Mobile

`src/components/` tidak disinkronkan, jadi port dilakukan dengan tangan:
- **`HubRow`.** Dipakai di 11 halaman, termasuk `dashboard/page.tsx:153`. Ada 10 nada warna di `HubRow.tsx:7-30`; diganti menjadi satu nada navy dengan ikon terang dan garis emas.
- **`StatTile`.** Diubah ke gaya kartu angka transparan seperti di mockup.
- **Tema terang Mobile.** Lewat variabel `:root[data-theme="light"]`.
- **`TabBar` dan `MemuatHalaman`.** Disalin ke Mobile hanya bila Mobile punya baris tab atau layar tunggu yang setara.

## 5. Di luar cakupan

- Merombak struktur halaman besar (`id-cards`, `akademik`, `siswa`: masing-masing sekitar 2.100 baris).
- Menyunting sidebar dan hero dashboard (`StatusHeroCard`). Keduanya dikerjakan di PRD lanjutan bila diminta, kecuali pemilik memasukkannya lewat Q-4.
- `web-public` (portal PMB), yang punya `DESIGN.md` sendiri.
- UI 3D/motion (`references/07`).
- Mengganti ikon atau menambah dependensi.

## 6. Kriteria penerimaan

| # | Kriteria | Platform |
|---|---|---|
| K1 | Di lebar 390px, Akses Cepat tampil 2 kolom dan tidak ada label yang terpotong. Di ≥ 640px tampil 4 kolom. | Web, Desktop |
| K2 | Semua kotak ikon Akses Cepat bernada navy yang sama. Tidak ada lagi kelas `purple`/`emerald`/`amber` di `QuickActionTile.tsx`. | Web, Desktop |
| K3 | Kontras teks emas di tema terang ≥ 4,5:1, dan border emas ≥ 3:1 (diperiksa dengan pemeriksa kontras). | Semua |
| K4 | `grep -rn 'role="tablist"' src` hanya menemukan `components/ui/TabBar.tsx`. | Web, Desktop |
| K5 | Pada `TabBar`, panah kanan memindah fokus dan pilihan ke tab berikutnya, dan Home/End ke tab pertama/terakhir. Tes `TabBar.test.tsx` lulus. | Web, Desktop |
| K6 | Akun tanpa `payroll.config.manage` tidak melihat kartu Konfigurasi di Penggajian. Akun yang `bolehLapor` bernilai salah tidak melihat kartu Pelaporan. Perilaku ini sama dengan tombol sebelumnya. | Web, Desktop |
| K7 | Header Penggajian hanya memuat satu tombol aksi. | Web, Desktop |
| K8 | `grep -rn "Memuat otorisasi" src/app` = 0 hasil. Kedelapan halaman memakai `MemuatHalaman`. | Web, Desktop |
| K9 | Tema terang: kartu putih, kotak ikon tetap navy, tidak ada teks putih di atas latar putih. Diperiksa lewat tangkapan layar Playwright. | Web, Desktop |
| K10 | Fase D: `HubRow` tidak lagi punya tipe `HubRowTone` dengan 10 nilai, dan dashboard Mobile tampil navy + emas di kedua tema. | Mobile |
| K11 | Setiap sakelar berubah warna saat diklik dan kenopnya terlihat di keempat kombinasi (gelap/terang × aktif/nonaktif). Diperiksa lewat tangkapan layar Pengaturan → Notifikasi WA, Hari Libur, dan Shift. | Semua |
| K12 | `grep -rn "peer-checked" src` = 0 hasil. Hanya `Sakelar.tsx` yang memuat `role="switch"`. Tes `Sakelar.test.tsx` lulus (klik dan Spasi membalik `aria-checked`; `disabled` tidak memanggil `onChange`). | Web, Desktop, Mobile |
| K13 | `bun run audit:kontras` lulus di kedua workspace. | Web, Desktop, Mobile |
| K14 | Penyisiran 0c tidak menemukan teks di bawah 4,5:1 (atau 3:1 untuk teks ≥ 18,66px tebal) di halaman yang disisir, pada kedua tema. | Web, Desktop |

## 7. Catatan teknis

- **Data dan sinkronisasi.** Tidak ada tabel, kolom, sync, izin, atau aturan kembar TS ↔ Rust. `audit:contract` dan `audit:schema` tidak terdampak.
- **Tema.** Sesuai CLAUDE.md "Light/Dark theme": JSX dasar ditulis untuk tema gelap, dan tema terang diatur di `globals.css`.
  - `QuickActionTile` sekarang memakai `bg-white dark:…`, menyimpang dari aturan itu. Fase A memindahkannya ke kelas semantik (mis. `.aksi-cepat`, `.aksi-cepat-ikon`), mengikuti pola `.login-*`. Alasannya sudah ditulis di `globals.css:2331-2334`: utilitas slate/white dibalik paksa oleh blok tema terang.
  - Container baru dengan opasitas harus didaftarkan di whitelist `globals.css`.
- **Izin.** Grid hub memakai `area` (`canAccessArea`) atau syarat izin yang sama persis dengan tombol yang digantikan. `QuickActionGrid` sekarang hanya menyaring per `area`. Untuk C1 diperlukan prop tambahan, mis. `visible?: boolean` per kartu, karena `bolehLapor` dan `payroll.config.manage` adalah izin, bukan area.
- **Mobile.** Mobile tidak punya `PageHeader` dan tidak punya `QuickActionGrid`. Fase D tidak menyalin komponen Web, tetapi mengubah gaya komponen Mobile yang sudah ada.
- **Invarian yang dirujuk:**
  - CLAUDE.md "`src/components/` tidak disinkronkan",
  - "Dropdown berisi data memakai `PilihCari`" (tidak tersentuh),
  - `references/07` (stack 3D tidak disentuh).

## 8. Temuan dari kode

| Berkas:baris | Temuan |
|---|---|
| `web-desktop/src/components/ui/QuickActionTile.tsx:17-48` | Ada 5 nada warna per menu (`primary`, `emerald`, `amber`, `purple`, `neutral`). Mockup memakai satu nada. |
| `web-desktop/src/components/ui/QuickActionTile.tsx:7` | Prop `subtitle` dideklarasikan tetapi tidak pernah ditampilkan. |
| `web-desktop/src/components/ui/QuickActionGrid.tsx:93` | `grid-cols-4` di semua lebar layar, padahal mockup HP 2 kolom. |
| `web-desktop/src/components/ui/PageHeader.tsx:22` | Garis bawah `border-white/10`, label kecil sudah `amber-300`. Satu komponen dipakai 42 dari 51 halaman. |
| `web-desktop/src/app/globals.css:19,66,84` | `--app-primary` masih `#007aff`/`#003399`. `--app-gold` terang `#d97706` (±3,2:1, tidak cukup untuk teks). Token `--app-*` hampir tidak dipakai di JSX (2 tempat). |
| JSX `web-desktop/src` | Sekitar 1.339 pemakaian `sky-*`, termasuk 54 `bg-sky-700` dan 27 `focus-visible:ring-sky-500`. |
| `web-desktop/src/app/globals.css:451-470` | Override tema terang menarget kelas `bg-sky-500`/`bg-sky-700` pada tombol. Override ini tetap aktif setelah remap Fase B. |
| Baris `role="tablist"` | `settings/page.tsx:1272`, `kepegawaian/page.tsx:174`, `nilai/page.tsx:468`, `payroll/pelaporan/page.tsx:170`, `components/keuangan/TagihanWorkspace.tsx:151`, `components/keuangan/KeuanganWorkspace.tsx:218`, `components/kepegawaian/RincianPegawai.tsx:244`, `components/kepegawaian/PengajuanWorkspace.tsx:236`, `components/inventory/InventarisWorkspace.tsx:462` (semua di `web-desktop/src`). |
| `web-desktop/src/app/akademik/page.tsx:764-800` | Tab dibuat sebagai tombol biasa tanpa `role="tab"`. |
| `web-desktop/src/components/keuangan/KeuanganWorkspace.tsx:223-240` | Contoh tab yang ditulis ulang: aktif `bg-sky-700`, tanpa `onKeyDown`. |
| `web-desktop/src/app/payroll/page.tsx:192-235` | Lima tombol di header. Empat di antaranya tautan navigasi. |
| `web-desktop/src/app/payroll/config/page.tsx:363-420` | Empat kartu sub-modul dibuat sendiri (`bg-slate-900 border-slate-800`), tidak memakai `QuickActionTile`. |
| `web-desktop/src/app/payroll/**` | "Memuat otorisasi…" sebagai teks polos di 8 tempat: `payroll/page.tsx:180`, `config/page.tsx:316`, `runs/page.tsx:73`, `runs/detail/RunDetailClient.tsx:133`, dan 4 halaman `config/*-rules`, `jp-rates`. |
| `mobile/src/components/ui/HubRow.tsx:7-30` | 10 nada warna. Dipakai 11 halaman Mobile, termasuk `dashboard/page.tsx:153`. |

### 8.1 Sakelar on/off (bug 1)

Ada 13 sakelar di Web/Desktop dengan empat cara pembuatan yang berbeda:
- **Pola `input.peer` + `div` dengan `after:`.** Semuanya memakai `bg-slate-800` saat mati, dan warna "nyala" tiap tempat berbeda: `NotifikasiWaCard.tsx:170,203,236,270,359,393,428,463` (emerald-500), `OtomasiAlfaCard.tsx:81` (amber-400), `holidays/page.tsx:619` (sky-500), `shift/page.tsx:1127` (amber-500).
- **Pola `<button>` dengan kenop `<span>`.** `shift/page.tsx:734` (sudah `role="switch"`, violet-500/slate-700) dan `id-cards/LayoutPanel.tsx:661` (tanpa `role` dan tanpa `aria-checked`, violet-500/slate-700).

Mobile: `settings/sistem/page.tsx`, `shift/page.tsx`, `components/MailSettingsCard.tsx`.

Penyebab yang terbukti dari kode:
1. **Lintasan "mati" hilang di tema gelap.** `bg-slate-800` (#1e293b) di atas kartu `bg-slate-900` (#0f172a) kontrasnya ±1,2:1, jadi yang terlihat hanya kenop putih. Ketika kenop bergeser, sakelar terlihat seperti tidak berubah atau hilang.
2. **Tema terang Web ditambal per pola.** Lintasan mati diatur lewat `globals.css:725-728` (`input.peer:not(:checked) ~ div.bg-slate-800`), dan `div.bg-slate-800` dikecualikan dengan `:not(.peer)` di `:717`. Sakelar `<button>` (`bg-slate-700`) tidak tercakup tambalan itu. Setiap pola baru butuh tambalan baru, dan tambalan yang terlewat menghasilkan gejala yang dilaporkan.
3. **Tema terang Mobile membalik skala warna.** `--color-white: #0f172a` dan skala slate dibalik (`mobile/src/app/globals.css:160-172`), jadi kenop `bg-white` berubah gelap dan lintasan `bg-slate-800` berubah terang. Hasilnya bergantung pada warna kartu di belakangnya.
4. **Status hanya ditunjukkan dengan warna**, dan warna "nyala" berbeda di tiap halaman. Pengguna tidak punya patokan seperti apa sakelar yang aktif.

Yang belum terbukti dari kode: kasus "tidak berubah warna" yang murni karena state (nilai kembali ke semula setelah disimpan). Bug terjadi di semua perangkat (Q-5), jadi di langkah 0.1 setiap sakelar yang diganti diuji dengan alur klik → simpan → muat ulang halaman. Bila nilainya kembali, akar masalah di state atau gateway dicari terpisah dengan `debug-akar-masalah`.

### 8.2 Teks sewarna latar (bug 2)

- **Web:** `globals.css:1094-1097` memaksa `.text-white` menjadi `#0f172a !important` di tema terang. Pengecualiannya hanya 9 kelas latar (`globals.css:1118-1160`). Semua latar berwarna lain mendapat teks gelap. Hasil pindai `className` (elemen yang sama):

  | Latar | Jumlah | Contoh | Kontras teks #0f172a |
  |---|---|---|---|
  | `bg-indigo-600` | 9 | `payroll/runs/detail/RunDetailClient.tsx:203`, `notifikasi-wa/page.tsx:467` | ±2,8:1 |
  | `bg-gradient-to-r` | 8 | `components/ui/DigitalReceiptCard.tsx:44`, `components/license/LicenseActivationPanel.tsx:214` | bergantung gradien |
  | `bg-violet-500` | 6 | `components/TwoFactorCard.tsx:191,241` | ±4,2:1 |
  | `bg-[#003399]` | 1 | `components/ui/ExceptionFilterBar.tsx:77` (chip filter aktif) | ±1,6:1, hampir tak terlihat |
  | `bg-teal-600`, `bg-gradient-to-br`, `bg-gradient-to-tr` | 3 | `RunDetailClient.tsx:213`, `components/ui/BrandLogo.tsx:42`, `components/ui/FloatingScanDock.tsx:24` | bergantung warna |

  Total 27 elemen. Teks yang latarnya datang dari elemen induk tidak tertangkap pemindaian ini, dan itulah alasan langkah 0c.
- **Mobile:** `--color-white` dibalik menjadi `#0f172a` di tema terang. Ada 14 elemen `text-white` di atas latar berwarna: `bg-indigo-500` ×7 (`notifikasi-wa/page.tsx:452,797`), `bg-violet-500` ×3 (`TwoFactorCard.tsx:206,263`), gradien ×3 (termasuk `MobileBottomNav.tsx:140`), dan `bg-[#003399]` ×1 (`ExceptionFilterBar.tsx:75`). `.text-on-accent` sudah tersedia tetapi belum dipakai di elemen-elemen ini.

## 9. Urutan pengerjaan

Sesuai cara kerja hemat konteks: semua langkah satu fase ditulis dulu, baru satu putaran cek di akhir fase.

| # | Langkah | Gerbang |
|---|---|---|
| 0.1 | 0a `Sakelar` di Web + ganti 13 sakelar, lalu port ke Mobile | `Sakelar.test.tsx`. Grep K12. Tangkapan layar K11. |
| 0.2 | 0b `.text-on-accent` + perbaiki 27 elemen Web dan 14 elemen Mobile. 0d `audit:kontras` | `audit:kontras` lulus (K13). `tsc` + Biome berkas yang diubah. |
| 0.3 | 0c penyisiran kontras saat berjalan, lalu perbaiki temuannya | Laporan penyisiran tanpa pelanggaran (K14). |
| 0.4 | Pemilik: `jalankan-antislop` → `jalankan-check` | `.claude/HASIL.md` hijau. |
| 1 | A1 token, A2 `QuickActionTile`/`QuickActionGrid`, A3 `PageHeader` | `tsc` + Biome berkas yang diubah. Tangkapan layar dashboard di kedua tema, 390px dan 1280px (K1, K2, K9). Pemeriksa kontras (K3). |
| 2 | A4 `TabBar` + ganti 10 baris tab | `TabBar.test.tsx` (K5). Grep K4. |
| 3 | A5 `MemuatHalaman` + ganti 8 layar tunggu | Grep K8. `tsc`. |
| 4 | Pemilik meninjau hasil A, lalu menjalankan `jalankan-antislop`, kemudian `jalankan-check` | `.claude/HASIL.md` hijau, dengan `Commit` dan `Waktu` lebih baru dari perubahan. |
| 5 | C1 Penggajian, C2 Konfigurasi Gaji, C3 penilaian Settings/Kepegawaian | Uji manual dengan akun Superadmin dan Bendahara (K6, K7). `tsc` + Biome. |
| 6 | B, hanya bila Q-2 = ya: inventaris `sky` bermakna status, lalu remap `@theme` | Tangkapan layar 5 halaman terpadat (scanner, siswa, presensi-kelas, settings, payroll) di kedua tema. Pemeriksa kontras. |
| 7 | D Mobile: `HubRow`, `StatTile`, tema terang | `tsc` + Biome Mobile. Tangkapan layar dashboard Mobile (K10). |
| 8 | Pemilik: `jalankan-antislop` → `jalankan-check` | `.claude/HASIL.md` hijau. |

## 10. Pertanyaan terbuka

Tidak ada. Q-1 sampai Q-7 sudah dijawab (§2).
