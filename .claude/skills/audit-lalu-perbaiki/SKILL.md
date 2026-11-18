---
name: audit-lalu-perbaiki
description: >-
  Audit berbasis bukti atas satu area Manajemen Sekolah (keamanan pre-launch, atau satu fitur) di
  Web, Desktop, Mobile, dan portal publik: temuan bernomor dengan severity, file:baris, dampak nyata,
  dan fix; minta keputusan per huruf, BERHENTI, lalu kerjakan HANYA yang disetujui dengan paritas
  TS+Rust, sinkronisasi Mobile, dan tes. Pakai untuk "audit…", "cek apakah X sudah benar/aman",
  "cari celah di…", atau balasan keputusan per huruf atas daftar temuan. Bukan untuk satu bug yang
  gejalanya jelas, fitur baru (`kerjakan-fitur-lintas-platform`), tema saja, review diff/PR, atau
  commit.
---

# Audit lalu Perbaiki

Aturan proyek ada di `CLAUDE.md` dan `.agents/skills/absensi-sppg-rules/references/`; bila
bertentangan, `CLAUDE.md` menang. Ingat: aturan bisnis dieja kembar TS ↔ Rust, `web-desktop`
kanonik (Mobile `src/app/**`, `src/components/**`, `storage.rs`, `lib.rs`, `build.rs`, `config.rs`,
`secrets.rs` tidak disalin skrip), UI hanya lewat gateway. Portal publik ada di `web-public/`.

## A. Batasi cakupan

1. Satu kalimat: area, build, jenis audit (keamanan/fungsional). Cek `MEMORY.md`.
2. Bila user meminta "jangan ubah sebelum approve", Fase B–C hanya membaca; kueri hanya `SELECT`.
3. Jangan bertanya kecuali cakupan benar-benar tidak bisa ditebak; sebut tafsiran di kalimat pertama.

## B. Petakan dan buktikan

4. Inventaris titik masuk di semua build (halaman, komponen, gateway, route, service, command +
   modul Rust) lewat Grep nama fungsi/field.
5. Telusuri tiap alur dari tombol sampai tulis database: validasi, keunikan, nasib data lama, pesan
   galat.
6. Keamanan, periksa dan catat setiap kategori (termasuk yang bersih): autentikasi/sesi, otorisasi
   dan IDOR, secret di kode/bundle (`NEXT_PUBLIC_*`), injection (SQL, command, XSS `innerHTML`),
   route tanpa `requireWebPermission`/`requireWebSession`, validasi input, rate limit, CORS/header/
   cookie, dependensi (`bun audit`, `cargo audit`), data sensitif di log/galat.
7. Fungsional: uji bolak-balik (template → isi → import; export → sunting → import ulang).
8. Verifikasi setiap dugaan (baca baris, cek pemanggil, pemeriksaan baca-saja). Jangan mencetak
   secret; cukup "ada/kosong". Sebelum merekomendasikan fix fungsi bersama, Grep semua pemanggilnya.

## C. Laporan, lalu BERHENTI

```markdown
<Berapa temuan, jenis audit, belum ada kode diubah.>

## Jawaban pertanyaan Anda
**"<pertanyaan>"** <jawaban langsung, file:baris>

## Temuan (urut dampak)
| # | Area | Masalah ([file:baris](path#Lbaris)) | Dampak nyata |
<Keamanan: tiap temuan diberi Severity, Lokasi, Eksploitasi, Fix.>

**Yang sudah benar:** <kategori bersih>
**Belum tercakup:** <apa dan kenapa>

## Keputusan
**A. <topik>:** <opsi>. *(Rekomendasi saya.)*
Bug murni yang dikerjakan tanpa keputusan: <nomor>.
```

Severity = dampak nyata di proyek ini, termasuk kondisi yang melemahkannya. Temuan tanpa bukti
tidak dilaporkan.

## D. Kerjakan hanya yang disetujui

9. Kalimat pertama: tafsiran atas jawaban user, termasuk yang TIDAK dikerjakan. Catat keputusan di
   memori.
10. Per nomor, dari yang paling terisolasi: sunting `web-desktop`, aturan identik TS ↔ Rust dengan
    pesan sama; fungsi bersama diberi opsi yang hanya dikirim pemanggil yang butuh; satu tes yang
    gagal bila logikanya rusak (vektor kembar bila aturan dieja dua kali).
11. Dari `mobile/`: `bun run scripts/sync-rust-modules.ts` dan `bun run scripts/sync-frontend-lib.ts`;
    kembalikan berkas Mobile yang hanya berubah akhir baris; `bunx biome check --write <berkas>`.
12. Kode `#[cfg(target_os = "android")]`: `cargo check --lib --target aarch64-linux-android` dengan
    `CC_`/`AR_`/linker diarahkan ke NDK.
13. Verifikasi per berkas seperti `CLAUDE.md`: `tsc`, `bun test <berkas>`, `cargo test <nama>` ke
    scratchpad, audit relevan ke berkas. Claude TIDAK menjalankan `bun run check`/`check:quick`,
    suite Rust penuh, antislop, atau commit; pemilik menjalankan `jalankan-antislop` lalu
    `jalankan-check`.

## Laporan selesai

```markdown
<Status + bukti nyata (tes/audit yang lulus), dan bahwa `bun run check` menunggu pemilik.>
## Yang berubah
**<Huruf/nomor>. <judul>:** <perilaku sekarang, tautan berkas>
## Penyimpangan dari laporan audit (bila ada)
## Perlu dicoba di aplikasi
1. <langkah + hasil yang diharapkan>
Belum di-commit.
```

## Dilarang

Mengerjakan nomor yang tidak disetujui atau "sekalian merapikan"; menulis ke database produksi saat
audit; mengubah bawaan fungsi bersama tanpa memeriksa pemanggilnya; menyunting salinan Mobile saja;
suntingan massal tanpa dry-run; melonggarkan audit; `UNIQUE` baru di tabel tersinkron.

## Kegagalan yang sering terjadi

1. Fix yang merusak pemakaian sah (contoh: rate limit tanpa reset saat login sukses mengunci satu
   sekolah di balik NAT). Telusuri efek sampingnya dulu.
2. Fungsi bersama diubah demi satu halaman. Tambahkan opsi eksplisit.
3. Rename massal mengenai variabel dan nilai logika. Skrip dry-run, hanya di dalam string,
   pengecualian istilah resmi.
4. Cabang Android hanya ditulis di salinan Mobile lalu terhapus sinkronisasi.
