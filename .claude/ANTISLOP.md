# ANTISLOP.md — hasil antislop

- Waktu: 2026-10-22 12:02 WIB
- Commit: 6e6f971 (+ 83 berkas berubah, belum commit)
- Berkas disunting: 1

## Disunting
- `web-desktop/src/components/siswa/DapodikSiswa.tsx` — teks UI — ganti em dash pada judul modal dan opsi placeholder dengan titik dua dan tanda kurung

## Dilewati
- `mobile/scripts/sync-*` — skrip sinkronisasi salinan Mobile
- `mobile/src/**` & `mobile/src-tauri/**` — salinan Mobile turunan yang dihasilkan skrip sync
- `*.test.ts`, `*.test.tsx`, `*.vektor.json` — berkas pengujian dan fixture data
- `*.toml`, `*.json`, `build.rs` — konfigurasi dan build artifact
- `web-desktop/src-tauri/**` & `web-desktop/src/**` — komentar teknis dan teks UI sudah ringkas tanpa AI-slop
- `web-public/src/**` — komentar teknis dan teks formulir PMB sudah presisi

## Perlu tindakan
Jalankan `bun run sync:mobile` untuk memperbarui salinan Mobile dari `web-desktop/src/components/siswa/DapodikSiswa.tsx`.
