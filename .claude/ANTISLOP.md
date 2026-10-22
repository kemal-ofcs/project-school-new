# ANTISLOP.md — hasil antislop

- Waktu: 2026-10-22 18:28 WIB
- Commit: f82c471 (+ 6 berkas berubah, belum commit)
- Berkas disunting: 6

## Disunting
- `web-desktop/src/app/pmb/page.tsx` — teks UI & komentar — ganti em dash pada dialog konfirmasi, placeholder kosong, galat, dan komentar dengan tanda kurung, titik dua, dan tanda hubung
- `web-desktop/src/types/pmb.ts` — komentar — ganti em dash pada dokumentasi tipe PMB dengan titik dua dan tanda koma
- `web-desktop/src/lib/services/pmb-admin.ts` — komentar — ganti em dash pada dokumentasi layanan admin PMB dengan titik dua
- `web-public/src/app/pmb/daftar/FormPendaftaran.tsx` — teks UI & komentar — ganti placeholder em dash ringkasan pendaftaran dengan tanda hubung dan rapikan komentar
- `web-public/src/app/pmb/status/FormCekStatus.tsx` — komentar — ganti em dash pada penjelasan fungsi minta kode dan penjaga klik ganda dengan tanda kurung dan titik dua
- `web-public/src/lib/validations/pmb.ts` — komentar — ganti em dash pada penjelasan validasi nomor pendaftaran dan status dengan tanda kurung dan titik dua

## Dilewati
- `mobile/scripts/sync-*` — skrip sinkronisasi salinan Mobile
- `mobile/src/**` & `mobile/src-tauri/**` — salinan Mobile turunan yang dihasilkan skrip sync
- `*.test.ts`, `*.test.tsx`, `*.vektor.json` — berkas pengujian dan fixture data
- `*.toml`, `*.json`, `build.rs` — konfigurasi dan build artifact
- `web-desktop/src-tauri/**` & `web-desktop/src/lib/client/**` — komentar teknis dan teks UI sudah ringkas tanpa AI-slop

## Perlu tindakan
Jalankan `bun run sync:mobile` untuk memperbarui salinan Mobile dari `web-desktop/src/types/pmb.ts`.
