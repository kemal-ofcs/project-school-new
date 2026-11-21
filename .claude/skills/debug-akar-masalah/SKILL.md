---
name: debug-akar-masalah
description: >-
  Cari akar masalah satu bug lalu perbaiki dengan diff minimal. Pakai untuk error, crash, log
  merah, "tidak jalan", "kenapa X begini", "analisa error/bug ini", data tidak tersimpan/tersinkron, hasil hitung salah.
  Bukan untuk audit satu area (`audit-lalu-perbaiki`), fitur baru (`kerjakan-fitur-lintas-platform`),
  atau konflik skema sync di lapangan (`resolve-sync-schema-mismatch`).
---

# Debug Akar Masalah

1. **Telusuri, jangan sunting.** Dari gejala ke sumber: UI → gateway → route/service TS dan
   command → logika Rust. Grep SEMUA pemanggil fungsi yang dicurigai. Kembaran TS ↔ Rust dan
   salinan Mobile hampir selalu membawa bug yang sama. Tanya user hanya bila tanpa jawabannya
   penelusuran bercabang mahal (satu pertanyaan).
2. **Lapor, lalu berhenti** (kecuali user bilang "langsung perbaiki"):
   - **Gejala** satu kalimat.
   - **Akar masalah** dengan tautan `file:baris`, plus bukti (baris kode/log yang membuktikan).
   - **Perbaikan**: titik yang dilalui semua pemanggil; tanpa refactor atau perubahan lain.
   - **Ikut terdampak**: kembaran/pemanggil lain yang rusak dengan cara sama.
   - Bila yakin < tinggi: sebut hipotesis kedua dan cara membedakannya.
3. **Perbaiki** hanya yang disetujui. Sunting `web-desktop`, lalu jalankan skrip `sync-*` dari
   `mobile/`. Tambah satu tes yang gagal tanpa perbaikan ini (vektor kembar bila menyangkut aturan).
4. **Verifikasi** sesuai CLAUDE.md: `tsc` + Biome berkas yang diubah, `bun test <berkas>`,
   `cargo test <nama>` ke scratchpad. Laporan akhir: apa yang diubah, tes yang lulus, langkah uji
   manual + hasil yang diharapkan, lalu pemilik menjalankan `jalankan-antislop` → `jalankan-check`.
