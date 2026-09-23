---
name: kerjakan-fitur-lintas-platform
description: >-
  Alur kerja lengkap untuk menambah fitur atau memperbaiki perilaku di Absensi SPPG yang harus
  bekerja SAMA di Web (TypeScript/Next.js), Desktop, dan Mobile (Rust/Tauri) — analisis dulu, minta
  persetujuan, lalu implementasi paritas TS+Rust, sinkronisasi salinan Mobile, tes vektor kembar,
  dan gerbang kualitas penuh. Pakai skill ini setiap kali user meminta fitur baru, perubahan aturan
  bisnis, sakelar/setting baru, perubahan skema tabel, command Tauri baru, atau menanyakan
  "selanjutnya apa" lalu memilih pekerjaan dari backlog di repo ini — misalnya "tambahkan kirim WA
  otomatis", "buat sakelar X di Pengaturan", "fitur ini harus jalan juga di mobile", "lanjutkan poin
  1", "kerjakan rencana itu", "implementasikan sekarang serta test-nya". JANGAN dipakai untuk:
  pertanyaan penjelasan murni tanpa perubahan kode, perbaikan tampilan/tema saja (pakai
  `fix-mobile-theme-and-native-share`), konflik skema sinkronisasi yang sudah terjadi di lapangan
  (pakai `resolve-sync-schema-mismatch`), build/rilis APK, atau commit/PR.
---

# Kerjakan Fitur Lintas Platform

## Latar singkat proyek (baca dulu — anggap Anda belum tahu apa-apa)

Absensi SPPG adalah aplikasi absensi + payroll sekolah/kantor yang **offline-first** dan jalan di tiga build dari dua workspace:

| Build | Workspace | Bahasa logika | Cara bicara ke data |
|---|---|---|---|
| Web | `web-desktop/` | TypeScript (route handler Next.js di `src/app/api/`, service di `src/lib/services/`) | langsung ke database cloud LibSQL |
| Desktop | `web-desktop/src-tauri/` | Rust (`src/desktop/*.rs`) | SQLite lokal + outbox, sinkron ke cloud |
| Mobile | `mobile/` | Rust (`src-tauri/src/mobile/*.rs`) | sama dengan Desktop |

Tiga fakta yang menentukan hampir setiap keputusan:

1. **Setiap aturan bisnis ditulis DUA kali** — sekali di TS (untuk Web), sekali di Rust (untuk Desktop/Mobile) — dan keduanya wajib memberi jawaban yang sama. Paritas dijaga dengan **vektor tes yang sama** di kedua bahasa, bukan dengan harapan.
2. **`web-desktop` adalah sumber kanonik.** Sebagian besar kode Mobile adalah SALINAN hasil skrip: `mobile/scripts/sync-frontend-lib.ts` (menyalin `src/lib/**`, `src/types`, dan komponen di `filesToCopy`) dan `mobile/scripts/sync-rust-modules.ts` (menyalin modul Rust di `filesToSync`, mengganti `Desktop*`→`Mobile*`). Menyunting salinan Mobile langsung = suntingan hilang pada sinkronisasi berikutnya.
3. **UI tidak pernah memanggil backend langsung.** Semua lewat `src/lib/gateways/*.ts`, yang bercabang: Tauri → `invokeDesktop("desktop_xxx", {...})`, Web → `requestWebApi("/api/...", "POST", body)`. Semua route handler memakai POST (static export melarang GET).

Aturan proyek selengkapnya ada di `CLAUDE.md` (root), `web-desktop/AGENTS.md`, dan `.agents/skills/absensi-sppg-rules/`. Skill ini merangkum alur kerjanya; bila ada yang bertentangan, `CLAUDE.md` yang menang.

## Instruksi

### Fase A — Pahami sebelum menyentuh apa pun

1. **Pastikan Anda tahu pekerjaan mana yang dimaksud.** Kalimat seperti "lanjutkan poin 1" merujuk ke daftar yang Anda atau user buat sebelumnya. Bila daftar itu punya beberapa "poin 1" (misal poin 1 = commit yang user bilang akan ia kerjakan sendiri), pilih tafsiran yang paling masuk akal, **sebutkan tafsiran itu di kalimat pertama**, lalu lanjut. Jangan berhenti hanya untuk bertanya bila tafsirannya bisa dikoreksi murah.
2. **Baca memori dan backlog.** Periksa `MEMORY.md` di direktori memori proyek (bila ada) — keputusan user yang sudah ditutup tercatat di sana dan tidak boleh ditawarkan ulang.
3. **Telusuri alur yang ada dari ujung ke ujung, di KEDUA bahasa.** Untuk fitur apa pun, temukan:
   - service TS + route handler Web-nya,
   - fungsi Rust + `#[tauri::command]`-nya di `commands.rs`,
   - gateway di `src/lib/gateways/`,
   - **setiap** layar/komponen yang membaca ATAU menulis data yang sama (Web page, Mobile page, kartu Pengaturan, komponen diagnostik). Pakai `grep` pada nama field, bukan tebakan.
   - komponen serupa yang sudah ada untuk dipakai ulang sebagai pola (misal runner periodik → `AutoAlfaRunner.tsx`).
4. **Bandingkan kontrak data antara UI dan Rust secara harfiah.** Tauri tidak mengonversi nama kunci di dalam objek JSON: bila UI mengirim `{ isActive }` dan Rust membaca `draft.get("is_active")`, nilainya selalu kosong tanpa error. Cek juga arah baca (bentuk yang dikembalikan Rust vs tipe yang dibaca UI). Ketidakcocokan di sini adalah bug diam-diam yang paling sering ditemukan.
5. **Cek semua "pembangun draft".** Bila beberapa layar menyimpan objek konfigurasi yang sama, pastikan setiap layar membawa SEMUA field — field yang dihilangkan akan tersimpan sebagai nilai bawaan dan menimpa pilihan user.

### Fase B — Rencana dan persetujuan (tanpa menulis kode)

6. **Tulis rencana memakai template "Rencana" di bawah.** Isinya: kondisi sekarang, pendekatan yang direkomendasikan beserta alasannya, alternatif yang ditolak dan kenapa, batasan yang perlu user tahu, dan **keputusan berhuruf (A, B, C, …) masing-masing dengan rekomendasi Anda**.
7. **Berhenti dan tunggu jawaban user.** Jangan menulis atau mengubah file kode sampai user menjawab. User biasanya menjawab singkat per huruf ("A setuju, B rekomendasi kamu, C sekalian") — perlakukan itu sebagai keputusan final dan jangan diperdebatkan lagi.
8. **Bila selama analisis Anda menemukan bug lama di jalur yang sama**, masukkan ke rencana sebagai bagian yang akan diperbaiki sekalian (dengan penjelasan dampaknya ke pengguna). Bila ditemukan saat implementasi, perbaiki bila memang di jalur yang sama dan menghalangi fitur, lalu laporkan.

### Fase C — Implementasi (setelah disetujui)

Kerjakan dengan urutan ini — urutan ini meminimalkan kerja ulang:

9. **Konstanta & tipe dulu.** Konstanta bersama di `src/lib/validations/*.ts` dengan cerminan `pub const` di modul Rust yang relevan (komentar di masing-masing menyebut pasangannya). Tambahkan field baru sebagai **wajib** (bukan `?:`) di tipe TS supaya `tsc` menunjuk setiap pembangun draft yang lupa.
10. **Skema (hanya bila ada tabel/kolom baru).** Ubah SEMUA lapis dalam satu perubahan:
    - DDL `CREATE TABLE` di `web-desktop/src-tauri/src/desktop/storage.rs` (lokal), `turso.rs` (cloud, `ensure_schema`), dan `web-desktop/src/lib/db-migrations.ts`;
    - `ensure_column` di Rust (lokal & cloud) **dan** blok migrasi `ALTER TABLE` di TS untuk database lama — ditaruh SETELAH rebuild tabel apa pun yang menyalin daftar kolom eksplisit;
    - naikkan versi di `CURRENT_SCHEMA_VERSION` (`db-schema.ts`), `CLIENT_SCHEMA_VERSION` (`sync.rs`), daftar seed `schema_migration` di `turso.rs`, dan daftar versi di `rbac-migration.test.ts`;
    - tabel baru: tambahkan ke `REQUIRED_TABLE_COUNT` + daftar `isDatabaseSchemaReady` dan ke `schema-consistency.test.ts`;
    - **`mobile/src-tauri/src/mobile/storage.rs` TIDAK disalin skrip** — sunting dengan tangan, persis sama.
    Setting sederhana lebih baik disimpan sebagai kunci di tabel `setting_gex_system` (ikut sinkronisasi, tanpa perubahan skema), bawaan MATI.
11. **Logika Rust** di `web-desktop/src-tauri/src/desktop/`. Bila menambah modul baru: `pub mod` di `desktop/mod.rs` DAN `mobile/src-tauri/src/mobile/mod.rs`, lalu tambahkan nama berkasnya ke `filesToSync` di `mobile/scripts/sync-rust-modules.ts`. Fungsi murni (keputusan, perhitungan, bentuk payload) dipisah dari I/O supaya bisa diuji dengan vektor.
12. **Command Tauri.** Command baru wajib terdaftar di: `lib.rs`, `build.rs`, `capabilities/default.json`, dan `permissions/autogenerated/<command>.toml` — di KEDUA workspace (berkas-berkas ini di Mobile tidak disalin skrip). Parameter command snake_case di Rust dipanggil camelCase dari JS (`otomatis: Option<bool>` ← `{ otomatis }`). Doc comment `///` diletakkan SEBELUM `#[tauri::command]`. Setiap command memanggil `require_permission(&state, "...")` lebih dulu.
13. **Logika TS**: service + route handler. Route wajib `assertSameOriginMutation(request)`, `requireWebPermission(...)`, dan memvalidasi body dengan Zod `.strict()`.
14. **Gateway** — satu fungsi, dua cabang, bentuk argumen sama.
15. **UI** — di Web page, Mobile page (`mobile/src/app/**` tidak disalin), dan setiap layar lain yang menyimpan data yang sama. Setiap kontrol form punya label (`htmlFor`/`id` atau `aria-label`); aksi mutasi di page dijaga `isSubmittingRef`. Komponen yang identik byte-demi-byte di kedua workspace (misal runner) dibuat sekali di `web-desktop/src/components/` dan didaftarkan di `filesToCopy`.
16. **Dependensi Rust**: bila kode aplikasi memakai crate (misal `tokio::time`), pastikan ia ada di `[dependencies]`, bukan hanya `[dev-dependencies]` — tes tidak akan menangkapnya, kompilasi lib yang gagal.
17. **Tes dengan vektor kembar.** Untuk setiap fungsi murni: tes Rust (`#[cfg(test)] mod tests` di modul yang sama) dan tes TS (`*.test.ts` di samping berkasnya) dengan input dan output yang identik; beri komentar yang saling menunjuk. Tambahkan satu tes integrasi TS yang memakai database memori sungguhan (`createClient({ url: "file::memory:" })` + `initDatabaseSchema`) untuk jalur yang paling berisiko. Mock `"server-only"` dengan `mock.module("server-only", () => ({}))` lalu impor modul lewat `await import(...)`.
18. **Perbarui dokumentasi** — paragraf terkait di `CLAUDE.md` bila perilaku arsitekturnya berubah (bukan catatan per fitur kecil).

### Fase D — Sinkronisasi dan verifikasi

19. Jalankan dari `mobile/`: `bun run scripts/sync-rust-modules.ts` dan `bun run scripts/sync-frontend-lib.ts`. Ulangi setiap kali berkas kanonik berubah lagi (termasuk setelah formatter).
20. Format hanya berkas yang Anda buat/ubah: `bunx biome format --write <berkas>` dan `rustfmt --edition 2021 <berkas-baru>.rs` (jangan memformat ulang berkas Rust besar yang sudah ada — diff-nya akan meledak).
21. Jalankan `bun run check:quick` dari root **sekali**, setelah semua ditulis. Perbaiki penyebabnya, bukan auditnya.
22. Jalankan `bun run check` (termasuk cargo test di kedua workspace, ±10 menit) di latar belakang. Bila user sebelumnya berkata "cargo nanti saja", lewati langkah ini dan katakan dengan jelas di laporan bahwa tes Rust belum dijalankan.
23. Jangan commit. User yang memutuskan kapan dan bagaimana commit.
24. Laporkan memakai template "Laporan selesai".

## Aturan dan batasan

**Wajib:**
- Analisis → persetujuan → kode, untuk setiap fitur baru atau perubahan perilaku. Satu-satunya pengecualian: user eksplisit berkata "langsung saja" / "implementasikan sekarang".
- Aturan yang ada di TS dan Rust harus identik dan diuji dengan vektor yang sama.
- Sunting sumber kanonik di `web-desktop`, lalu jalankan skrip sinkronisasi. Berkas Mobile yang tidak disalin (`storage.rs`, `lib.rs`, `build.rs`, `capabilities/default.json`, `config.rs`, `models.rs`, `mod.rs`, `src/app/**`, sebagian `src/components/**`) disunting tangan dengan isi setara.
- Setting/sakelar baru yang mengubah perilaku pemasangan berjalan (terutama yang mengirim sesuatu ke luar, seperti pesan WhatsApp) **bawaannya MATI**.
- Kunci/aturan diputuskan di satu tempat per bahasa (biasanya backend/pengirim), bukan disalin ke setiap komponen UI.
- Waktu operasional dihitung SQLite dengan zona WIB (`datetime('now','+7 hours')`), bukan `new Date()` atau `date('now')`.
- Laporan menyebut angka verifikasi yang nyata (jumlah tes lulus) dan apa pun yang BELUM diverifikasi.

**Dilarang:**
- Menulis kode sebelum user menyetujui rencana.
- Menyunting salinan Mobile hasil skrip sebagai satu-satunya perbaikan.
- Melonggarkan, mem-whitelist, atau mematikan skrip audit (`scripts/audit-*.ts`, `schema-audit.ts`) supaya lulus.
- Menambah `UNIQUE` constraint (selain PK) pada tabel yang disinkronkan — push outbox akan macet permanen saat dua perangkat offline bertabrakan.
- Menormalkan nilai enum yang tidak dikenal menjadi nilai "aman" — nilai asing ditolak dengan error validasi.
- Menyatakan "selesai" sebelum `bun run check` lulus (atau tanpa menyebut bahwa cargo belum dijalankan).
- Commit, push, atau membuat PR tanpa diminta.
- Menawarkan ulang opsi yang sudah ditolak user (cek memori).

## Format output

Ada dua keluaran, di dua giliran berbeda.

### 1. Rencana (akhir Fase B)

```markdown
Saya anggap "<rujukan user>" = <tafsiran>. Belum ada kode yang saya ubah. Berikut analisis dan rencananya.

## Kondisi sekarang
- <apa yang terjadi hari ini, dari sudut pandang pengguna>
- <apa yang sudah ada dan bisa dipakai ulang>

## Rencana: <nama pendekatan>
<2–4 kalimat: komponen apa yang ditambah/diubah, di mana, dan bagaimana alurnya>

**Kenapa bukan <alternatif>:** <alasan konkret>

## Batasan yang perlu kamu tahu
- <keterbatasan nyata yang akan dirasakan pengguna>

## Bug lama yang ikut ditemukan (bila ada)
- <gejala bagi pengguna> — <penyebab singkat>

## Keputusan yang saya butuhkan
**A. <topik>:** <opsi yang direkomendasikan>. *(Rekomendasi saya.)* <alternatif singkat bila ada>
**B. <topik>:** ...

Tunggu persetujuanmu sebelum saya mulai menulis kode.
```

### 2. Laporan selesai (akhir Fase D)

```markdown
<Kalimat pertama: status + bukti — mis. "Selesai. `bun run check` penuh lulus: 258 tes Rust di web-desktop dan 262 di mobile, semua audit dan tes TS hijau.">

**Fitur:**
- **<bagian>:** <apa yang sekarang terjadi, dan di berkas mana — tautan markdown ke file>

**Bug lama yang ikut diperbaiki:**
1. **<gejala>.** <penyebab dan perbaikan dalam 1–2 kalimat>

**Tes:** <tes baru apa yang menjaga apa>

**Belum diverifikasi / perlu dicoba di perangkat asli:**
1. <langkah uji manual konkret dan hasil yang diharapkan>

**RBAC / konfigurasi yang perlu disesuaikan:** <bila ada>

Perubahannya belum di-commit.
```

## Contoh lengkap

**Input user (sesi berjalan, setelah pengirim WhatsApp manual selesai dibuat):**
> Tidak usah commit, biar aku saja. Lanjutkan pekerjaan poin 1

Daftar sebelumnya: 1 = commit, 2 = uji manual, 3.1 = kirim WA otomatis terjadwal.

**Fase A (yang dilakukan):** menafsirkan "poin 1" sebagai pekerjaan pertama yang tersisa (3.1, karena commit ditangani user). Membaca `AutoAlfaRunner.tsx` (pola runner periodik), `AppShell.tsx`/`MobileAppShell.tsx` (tempat runner dipasang), route `/api/notifications/wa/drain`, dan daftar izin (`notification.send` ternyata izin sensitif, tidak ada di paket role Scanner).

**Output — Rencana:**
> Saya anggap "poin 1" di sini adalah pekerjaan pertama yang tersisa, yaitu **kirim WA otomatis terjadwal**. Belum ada kode yang saya ubah.
>
> ## Kondisi sekarang
> - Antrean WA baru terkirim kalau ada orang yang menekan "Kirim antrean". Pesan "anak sudah sampai" bisa tertahan berjam-jam.
> - Klaim v34 sudah membuat beberapa pengirim aman berjalan bersamaan; yang kurang tinggal pemicunya.
>
> ## Rencana: runner di aplikasi, seperti `AutoAlfaRunner`
> Komponen `AutoWaSenderRunner` di kedua shell, aktif hanya untuk operator ber-izin `notification.send`, menguras 25 pesan per menit dan langsung menyusul selama batch penuh. Sakelar "Kirim otomatis" (bawaan mati) diperiksa oleh pengirim, bukan runner.
>
> **Kenapa bukan cron server:** Vercel Cron tidak ada di mode server sendiri/database lokal dan paket gratisnya sekali sehari.
>
> ## Batasan
> - Hanya mengirim selama ada aplikasi terbuka oleh operator ber-izin; Android yang di-minimize berhenti.
>
> ## Keputusan
> **A. Letak sakelar:** di konfigurasi gateway WA. *(Rekomendasi saya.)*
> **B. Siapa yang menjalankan:** setiap sesi ber-izin `notification.send`. *(Rekomendasi saya.)*
> **C. Jam tenang:** belum perlu. *(Rekomendasi saya.)*
> **D. Interval:** 1 menit + batch beruntun. *(Rekomendasi saya.)*
>
> Tunggu persetujuanmu sebelum saya mulai menulis kode.

**User:** "A. aku setuju B. sangat setuju C. aku setuju D. aku setuju"

**Fase C (yang dilakukan):** konstanta `WA_AUTO_SEND_KEY = "wa_kirim_otomatis"` di TS dan Rust → field wajib `autoSendEnabled` di `WaConfig`/`WaConfigDraft` → `get/saveWaConfig` (TS) dan `get/save_wa_config` (Rust) membaca/menulis kunci itu dalam batch atomik yang sama → parameter `otomatis` di `drainWaQueue` dan `wa_sender::drain` (keluar lebih awal bila sakelar mati) → `desktop_drain_wa_queue(otomatis: Option<bool>)` dan body Zod `.strict()` di route → gateway `drainWaQueueGateway(otomatis)` → komponen runner + `filesToCopy` → checkbox di halaman Notifikasi WA Web & Mobile. Selama langkah 4–5 ditemukan: Rust membaca kunci snake_case padahal UI mengirim camelCase (setiap simpan dari Desktop/Mobile mematikan semua sakelar), dan draft halaman Web tidak membawa ambang alfa (tersimpan ulang ke 3/30). Keduanya diperbaiki. Tes baru: runner tidak mengirim apa pun selama sakelar mati, tombol manual tetap jalan.

**Output — Laporan selesai:**
> Selesai. `bun run check` penuh lulus: 258 tes Rust di web-desktop dan 262 di mobile, semua audit dan tes TS hijau.
>
> **Fitur:**
> - **Runner:** [AutoWaSenderRunner.tsx](web-desktop/src/components/AutoWaSenderRunner.tsx) di kedua shell, hanya untuk operator ber-izin `notification.send`.
> - **Sakelar:** "Kirim otomatis tanpa menekan tombol" di konfigurasi gateway, disimpan di `wa_kirim_otomatis`, bawaan mati.
>
> **Bug lama yang ikut diperbaiki:**
> 1. **Konfigurasi WA di Desktop/Mobile selalu kembali mati setelah disimpan.** Rust membaca kunci snake_case; sekarang memakai kontrak camelCase yang sama dengan TS.
> 2. **Simpan dari halaman Notifikasi WA Web mengembalikan ambang alfa ke 3/30.** Draft kini membawa nilainya.
>
> **Belum diverifikasi / perlu dicoba di perangkat asli:**
> 1. Nyalakan "Kirim otomatis"; dalam ±1 menit pesan menunggu terkirim sendiri.
> 2. Simpan konfigurasi dari Desktop/Mobile, buka lagi — nilainya harus tetap.
>
> **RBAC:** berikan `notification.send` ke role Scanner bila terminal lobi harus ikut mengirim.
>
> Perubahannya belum di-commit.

## Failure mode yang sering terjadi

1. **Kontrak TS↔Rust tidak cocok dan tidak ada yang berteriak.** UI mengirim camelCase, Rust membaca snake_case (atau sebaliknya pada nilai kembalian); semuanya "berhasil" tetapi menyimpan nilai bawaan. *Cegah:* di langkah 4, grep setiap nama kunci di kedua sisi; tes Rust memakai payload berbentuk persis seperti yang dikirim gateway, bukan bentuk karangan.
2. **Satu pembangun draft lupa membawa field baru → pilihan user tertimpa diam-diam.** Terjadi ketika beberapa layar menyimpan objek yang sama. *Cegah:* jadikan field baru wajib di tipe TS supaya `tsc` gagal di setiap pembangun yang lupa; grep nama tipe draft (`WaConfigDraft` dsb.) dan periksa satu per satu, termasuk layar Mobile yang tidak disalin.
3. **Salinan Mobile dilupakan atau disunting langsung.** Gejala: `audit:schema` melaporkan kolom "ada di Desktop, hilang di Mobile", command tak terdaftar di biner Mobile, atau perbaikan hilang setelah sinkronisasi. *Cegah:* selalu sunting `web-desktop`, jalankan kedua skrip sinkronisasi, lalu cek daftar berkas Mobile yang tidak disalin (lihat Aturan) — `storage.rs`, `lib.rs`, `build.rs`, `capabilities/default.json` paling sering terlewat.
4. **Menyatakan selesai terlalu cepat.** `check:quick` hijau tetapi Rust gagal dikompilasi (crate hanya ada di `[dev-dependencies]`, warning `dead_code` dari fungsi yang pemanggilnya dihapus). *Cegah:* jalankan `bun run check` penuh; baca bagian warning di log, bukan hanya kode keluar; tandai fungsi yang kini hanya dipakai tes dengan `#[cfg(test)]`.
5. **Kegagalan infrastruktur tes dikira bug kode (atau sebaliknya).** Di Bun Windows, modul native libsql segfault bila sebuah berkas tes membuat klien database baru setelah menutup klien lain — tes lulus satu per satu tetapi crash bila dijalankan bersama. *Cegah:* pakai SATU klien per berkas tes (`beforeAll` inisialisasi, `beforeEach` hapus baris, `afterAll` tutup), pola `attendance-dashboard.test.ts`; jalankan berkasnya beberapa kali untuk memastikan stabil sebelum menyimpulkan.
