---
name: audit-lalu-perbaiki
description: >-
  Audit berbasis bukti atas satu area Absensi SPPG (keamanan pre-launch, atau satu fitur seperti
  export/import/template, notifikasi WA, lisensi, ID card) di Web, Desktop, dan Mobile: petakan
  kodenya dari UI sampai Rust, laporkan temuan bernomor dengan severity + file:baris + dampak nyata +
  fix yang pasti, minta keputusan per huruf, BERHENTI, lalu setelah disetujui kerjakan HANYA yang
  disetujui dengan paritas TS+Rust, sinkronisasi Mobile, tes, dan gerbang kualitas penuh. Pakai
  setiap kali user meminta audit, review, atau "cek apakah sudah benar" atas sebuah area, misalnya
  "audit keamanan sebelum rilis", "audit fitur export import dan template", "cek apakah jalur X
  sudah aman", "review halaman karyawan guru siswa apakah sudah benar", "cari celah di login",
  "apakah fitur ini ada bug", atau ketika user membalas daftar temuan dengan keputusan per huruf
  ("A setuju, B lewati, lanjutkan rekomendasi kamu 5, 6, 8-16"). JANGAN dipakai untuk: satu bug
  dengan gejala yang sudah jelas dan user minta hipotesis dulu (itu alur debugging, bukan audit),
  fitur baru atau perubahan aturan bisnis (pakai `kerjakan-fitur-lintas-platform`), perbaikan
  tema/tampilan saja (`fix-mobile-theme-and-native-share`), konflik skema sync yang sudah terjadi
  (`resolve-sync-schema-mismatch`), review diff atau PR (`code-review`), pertanyaan penjelasan murni,
  build/rilis APK, atau commit/PR.
---

# Audit lalu Perbaiki

## Latar singkat (anggap Anda belum tahu apa pun soal proyek ini)

Absensi SPPG adalah aplikasi absensi + payroll sekolah yang offline-first, dengan tiga build dari
dua workspace, plus satu situs publik:

| Build | Folder | Logika | Akses data |
|---|---|---|---|
| Web (admin) | `web-desktop/` | TypeScript: route `src/app/api/**/route.ts`, service `src/lib/services/` | langsung ke database cloud LibSQL (Turso/sqld) |
| Desktop | `web-desktop/src-tauri/src/desktop/*.rs` | Rust (Tauri) | SQLite lokal + outbox, sinkron ke cloud |
| Mobile | `mobile/` (Rust di `src-tauri/src/mobile/`) | sama dengan Desktop | sama dengan Desktop |
| Portal publik (wali, PMB, berita) | `web-public/` | TypeScript, server Next.js | langsung ke cloud |

Fakta yang menentukan hampir setiap temuan dan setiap perbaikan:

1. Setiap aturan bisnis ditulis DUA kali (TS untuk Web, Rust untuk Desktop/Mobile) dan wajib
   identik. Temuan di satu bahasa hampir selalu punya kembaran di bahasa lain.
2. `web-desktop` adalah sumber kanonik. `mobile/src/lib/**` dan banyak `mobile/src-tauri/src/mobile/*.rs`
   adalah SALINAN hasil `mobile/scripts/sync-frontend-lib.ts` dan `mobile/scripts/sync-rust-modules.ts`.
   Menyunting salinan Mobile langsung = hilang pada sinkronisasi berikutnya. `src/app/**`,
   `src/components/**`, `storage.rs`, `lib.rs`, `build.rs`, `config.rs`, dan `secrets.rs` Mobile TIDAK
   disalin.
3. UI tidak memanggil backend langsung; semuanya lewat `src/lib/gateways/*.ts` yang bercabang Tauri
   (`invokeDesktop`) atau Web (`requestWebApi`).
4. Aturan proyek lengkap ada di `CLAUDE.md` (root), `web-desktop/AGENTS.md`, dan
   `.agents/skills/absensi-sppg-rules/`. Bila bertentangan dengan skill ini, `CLAUDE.md` menang.
5. Graph kode ada di `graphify-out/` (jalankan `graphify update .` bila perlu peta cepat).

## Instruksi

### Fase A: batasi cakupan (sebelum membaca kode)

1. Tulis ulang permintaan user dalam satu kalimat: area apa, build mana (Web, Desktop, Mobile,
   portal publik), dan jenis audit (keamanan atau fungsional).
2. Baca `MEMORY.md` di direktori memori proyek bila ada. Keputusan yang sudah ditutup user tidak
   boleh ditawarkan ulang.
3. Bila user menulis "JANGAN ubah kode sebelum saya approve" atau sejenisnya, catat: Fase B dan C
   hanya membaca. Kueri database pun hanya `SELECT`.
4. Jangan bertanya dulu kecuali cakupannya benar-benar tidak bisa ditebak. Tafsiran yang murah
   dikoreksi cukup disebut di kalimat pertama laporan.

### Fase B: petakan dan telusuri, dengan bukti

5. Inventaris titik masuk area itu di SEMUA build: halaman (`src/app/<halaman>/page.tsx` Web dan
   Mobile), komponen, gateway, route handler, service TS, command Rust (`commands.rs` + modul
   domainnya). Gunakan `Grep` pada nama fungsi dan nama field, bukan tebakan.
6. Untuk tiap alur, telusuri dari tombol sampai tulis database: validasi di mana, keunikan dicek
   di mana, apa yang terjadi pada data yang sudah ada, pesan galat apa yang sampai ke user.
7. Untuk audit keamanan, periksa kategori ini satu per satu dan catat hasil tiap kategori, termasuk
   yang bersih: autentikasi dan sesi; otorisasi dan IDOR; secret di kode atau bundle klien
   (`NEXT_PUBLIC_*`); injection (SQL, command, XSS lewat `innerHTML`/`dangerouslySetInnerHTML`);
   route tanpa `requireWebPermission`/`requireWebSession`; validasi input; rate limit dan brute
   force; CORS, security header, flag cookie; dependensi rentan (`bun audit` per workspace,
   `cargo audit` bila terpasang); data sensitif di log atau respons galat.
8. Untuk audit fungsional, uji jalur bolak-balik: template → isi → import, dan export → sunting →
   import ulang. Periksa apa yang hilang, apa yang diam-diam dilewati, dan apa yang tersimpan salah
   tanpa pesan.
9. Verifikasi setiap dugaan sebelum dilaporkan: baca baris kodenya, cek pemanggilnya, dan bila perlu
   jalankan pemeriksaan baca-saja (kueri `SELECT`, `bun audit`, membaca berkas di folder data
   aplikasi). Jangan pernah mencetak token, password, atau API key; laporkan "ada/kosong" saja.
10. Sebelum menulis rekomendasi fix untuk fungsi bersama, `Grep` semua pemanggilnya. Fix yang
    mengubah perilaku fungsi bersama bisa merusak halaman lain (lihat Failure mode 1 dan 2).

### Fase C: laporan dan keputusan, lalu BERHENTI

11. Tulis laporan memakai template "Laporan audit" di bawah: jawab pertanyaan langsung user dulu,
    lalu tabel temuan urut severity (Critical, High, Medium, Low), lalu kategori yang bersih, lalu
    yang belum tercakup, lalu keputusan berhuruf dengan rekomendasi Anda.
12. Pisahkan dua jenis temuan: bug murni (dikerjakan tanpa keputusan) dan hal yang butuh keputusan
    produk (diberi huruf A, B, C, ...).
13. Berhenti. Jangan menulis kode sampai user menjawab.

### Fase D: kerjakan hanya yang disetujui

14. Kalimat pertama: sebutkan tafsiran Anda atas jawaban user, terutama yang ambigu ("B lewati"
    berarti apa saja yang TIDAK dikerjakan). Bila user menambah permintaan di tengah jalan, masukkan
    ke rencana dan tanyakan hanya bila jawabannya mengubah desain.
15. Catat keputusan user ke memori proyek (berkas baru atau perbarui berkas keputusan yang sudah
    ada, lalu satu baris di `MEMORY.md`).
16. Kerjakan per nomor, dari yang paling kecil dan paling terisolasi. Untuk setiap perubahan:
    - sunting sumber kanonik `web-desktop`, cerminkan aturannya di TS DAN Rust dengan pesan galat
      yang sama;
    - bila fungsi bersama dipakai halaman lain, tambahkan opsi yang hanya dikirim pemanggil yang
      membutuhkan, jangan ubah bawaan;
    - tambahkan SATU tes yang gagal bila logikanya rusak (vektor kembar TS dan Rust bila aturannya
      dieja dua kali).
17. Setelah semua ditulis: jalankan dari `mobile/` `bun run scripts/sync-rust-modules.ts` dan
    `bun run scripts/sync-frontend-lib.ts`; kembalikan berkas Mobile yang hanya berubah akhir baris
    (`git diff --ignore-cr-at-eol --ignore-all-space --numstat -- <berkas>` kosong → `git checkout
    -- <berkas>`); format hanya berkas yang disentuh (`bunx biome check --write <berkas>`).
18. Untuk kode ber-`#[cfg(target_os = "android")]`, build host Windows tidak pernah
    mengompilasinya. Verifikasi dengan `cargo check --lib --target aarch64-linux-android` dengan
    `CC_aarch64_linux_android`, `AR_aarch64_linux_android`, dan
    `CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER` diarahkan ke clang/llvm-ar di NDK (`$NDK_HOME`).
19. Jalankan `bun run check` dari root SEKALI di latar belakang (±10 menit). Baca log: `EXIT`, baris
    `test result`, `LULUS`, `(fail)`, `error TS`. Baris `error:` yang berasal dari `console.error`
    di tes bukan kegagalan, tetapi bungkam di tesnya supaya log berikutnya bersih.
20. Jangan commit. Laporkan memakai template "Laporan selesai".

## Aturan dan batasan

Wajib:
- Setiap temuan punya bukti yang bisa dicek ulang: `file:baris`, potongan perilaku, atau hasil
  kueri/perintah. Temuan tanpa bukti tidak dilaporkan.
- Severity mencerminkan eksploitasi atau dampak NYATA di proyek ini, termasuk kondisi yang
  melemahkannya (misalnya "aman di Vercel, rentan di server sendiri").
- Kategori yang bersih disebut eksplisit; yang tidak diperiksa disebut sebagai "belum tercakup".
- Fix mengikuti aturan repo: paritas TS+Rust, sinkronisasi Mobile, tanpa UNIQUE constraint baru di
  tabel tersinkron, tanpa melonggarkan skrip audit (`scripts/audit-*.ts`).
- Label UI berbahasa Indonesia, tanpa em dash, dan tidak mengganti istilah resmi (misalnya "Nomor
  Induk Siswa Nasional").

Dilarang:
- Mengubah kode sebelum user menyetujui, bila user memintanya.
- Mengerjakan nomor yang tidak disetujui, atau "sekalian merapikan" kode di luar temuan.
- Mencetak secret, token, password, atau API key; menulis ke database produksi saat audit.
- Mengubah perilaku bawaan fungsi bersama tanpa memeriksa semua pemanggilnya.
- Menyunting salinan Mobile hasil skrip sebagai satu-satunya perbaikan.
- Suntingan massal lewat skrip tanpa dry-run yang ditinjau lebih dulu.
- Menyatakan selesai tanpa `bun run check` lulus, atau tanpa menyebut apa yang belum diverifikasi.

## Format output

### 1. Laporan audit (akhir Fase C)

```markdown
<Satu kalimat: berapa temuan, jenis audit, dan bahwa belum ada kode yang diubah.>

## Jawaban pertanyaan Anda
**"<pertanyaan user>"** <jawaban langsung, dengan file:baris bila relevan>

## Temuan, urut dari yang paling berdampak
| # | Area | Masalah | Dampak nyata |
|---|---|---|---|
| 1 | <halaman/modul> | <apa yang salah, dengan [file:baris](path#Lbaris)> | <apa yang dialami user/penyerang> |

<Untuk audit keamanan, tiap temuan diberi blok: Severity, Lokasi, Eksploitasi, Fix kode.>

**Yang sudah benar:** <kategori/alur yang bersih, eksplisit>
**Belum tercakup:** <apa yang tidak diperiksa dan kenapa>

## Keputusan yang saya perlukan
**A. <topik>:** <opsi>. *(Rekomendasi saya.)* <alternatif singkat>
**B. ...**

Bug murni yang saya kerjakan tanpa keputusan: <nomor>.
Tunggu persetujuan Anda sebelum saya mulai menulis kode.
```

### 2. Laporan selesai (akhir Fase D)

```markdown
<Status + bukti: "Semua yang disetujui selesai. `bun run check` lulus (EXIT 0): N tes Rust
web-desktop, M mobile, AUDIT SYNC CONTRACT: LULUS. Belum di-commit.">

## Yang berubah
**<Huruf/nomor>. <judul>:** <apa yang sekarang terjadi, tautan ke berkas>

## Penyimpangan dari rencana (bila ada)
<apa yang berbeda dari laporan audit dan kenapa>

## Perlu dicoba di aplikasi
1. <langkah uji manual konkret + hasil yang diharapkan>

<Bila ada UI yang disentuh: ringkasan antislop PASS/FAIL, termasuk bahwa R-35 belum terpenuhi bila
aplikasi belum diklik langsung.>
```

## Contoh lengkap

**Input user:**
> audit fitur export, import dan template di halaman karyawan, guru dan siswa. apakah sudah benar?
> lalu NIS tidak boleh dobel kan?

**Fase B (yang dilakukan):**
- Peta: `employee-workbook.ts` (Karyawan), `personnel-workbook.ts` + `validations/personnel-import.ts`
  (Guru, Siswa), `xlsx.ts` (baca/tulis), service `employee.ts` + `academic/personnel.ts`, Rust
  `operational.rs::import_employees` + `academic.rs::save_student`.
- Bukti: import Karyawan hanya INSERT dan melewati baris yang sudah ada (TS dan Rust); daftar
  Karyawan `WHERE 1=1` ikut memuat siswa dan guru; template memakai `id_shift` yang berbeda per
  perangkat; `lp` selain "P" menjadi "L"; kolom `unit` Guru diekspor tapi tidak dibaca; sel angka
  Excel merusak NIP menjadi `1.98…E+17`; CSV ber-BOM dan berpemisah `;` gagal; NIS dan NISN sudah
  dicek unik di TS (`assertUniqueValue`) dan Rust (`assert_unique_value`).

**Output Fase C (dipotong):**
> Audit selesai. Saya menemukan 11 masalah di fitur export, import, dan template. Belum ada kode
> yang saya ubah.
>
> **"NIS tidak boleh dobel?"** Sudah ditegakkan di Web dan Rust. Celahnya: NIS masih opsional...
>
> | 1 | Karyawan | Import hanya menambah; ID/kode yang ada dilewati diam-diam | Ekspor → sunting → impor ulang tidak mengubah apa pun |
> | ... |
>
> **D. Import Karyawan memperbarui baris yang ada.** *(Rekomendasi saya.)*
> **E. Halaman Karyawan hanya pegawai.** *(Rekomendasi saya.)*

**Balasan user:** "A setuju, B lewati, D kalau dobel jangan ditambah tapi tampilkan baris Excel
yang gagal, E sangat setuju"

**Fase D (yang dilakukan):** tafsiran disebut di kalimat pertama (D = tolak + laporan per baris,
bukan upsert); `Grep` pemanggil `getDaftarKaryawan` menemukan 6 halaman lain, jadi E dibuat sebagai
opsi `hanya_pegawai` yang hanya dikirim halaman Karyawan; backend TS dan Rust mengembalikan
`gagal: [{ index, pesan }]` dan klien menerjemahkannya ke nomor baris Excel lewat
`describeImportReport`; rename label memakai skrip dengan dry-run yang menangkap variabel `siswa`
sebelum rusak; tes TS dan Rust ditambah; sinkronisasi Mobile; `bun run check` lulus.

**Output Fase D (dipotong):**
> Semua yang Anda setujui selesai. `bun run check` lulus (EXIT 0): 280 tes Rust web-desktop,
> 283 mobile, AUDIT SYNC CONTRACT: LULUS. Belum di-commit.
>
> **D. Laporan import Karyawan:** baris yang bentrok tidak ditambahkan; ringkasannya "Baris 5: ID
> 'EMP_0003' sudah ada." di Web, Desktop, dan Mobile.

## Failure mode

1. **Rekomendasi fix yang merusak pemakaian normal.** Contoh nyata: menyarankan rate limit tidak
   lagi di-reset oleh login sukses, padahal setiap percobaan (termasuk yang sukses) menghitung kunci
   IP, sehingga sekolah di balik satu NAT akan terkunci tiap pagi. *Cegah:* sebelum menulis fix,
   telusuri efek sampingnya pada alur yang sah; bila ternyata salah saat implementasi, pindahkan fix
   ke tempat celahnya sebenarnya dan laporkan penyimpangannya.
2. **Mengubah fungsi bersama untuk satu halaman.** Contoh: memfilter daftar karyawan di fungsi
   yang juga dipakai payroll dan operasional. *Cegah:* `Grep` semua pemanggil; tambahkan opsi
   eksplisit yang hanya dikirim pemanggil yang butuh.
3. **Suntingan massal yang merusak kode.** Contoh: mengganti "siswa" menjadi "peserta didik" juga
   mengenai variabel `siswa` dan nilai logika `"siswa"`. *Cegah:* skrip dengan dry-run yang ditinjau,
   aturan hanya-di-dalam-string, pengecualian untuk istilah resmi, lalu typecheck.
4. **Salinan Mobile hilang atau kode Android tidak pernah dikompilasi.** Contoh: cabang
   `cfg(target_os = "android")` pernah hanya ditulis di salinan Mobile dan terhapus sinkronisasi;
   tombol "Buka WhatsApp" diam tanpa galat. *Cegah:* tulis di berkas kanonik, jalankan skrip sinkron,
   dan `cargo check --target aarch64-linux-android`.
5. **Menyatakan selesai terlalu cepat atau salah membaca log.** *Cegah:* `bun run check` penuh
   sekali di akhir, baca angka tes nyata, bedakan `console.error` yang disengaja dari kegagalan, dan
   sebut apa yang belum diklik di aplikasi.
