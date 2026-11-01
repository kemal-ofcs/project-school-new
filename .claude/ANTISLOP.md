# ANTISLOP.md — hasil antislop

- Waktu: 2026-11-01 18:56 WIB
- Commit: 180eda5 (+ 29 berkas berubah, belum commit)
- Berkas disunting: 0

## Disunting
- Tidak ada berkas yang perlu disunting (seluruh komentar bernilai teknis/arsitektur dan teks antarmuka CMS & halaman publik bersih dari em dash serta pola AI slop).

## Dilewati
- `.agents/skills/...`, `DESIGN.md`, `web-public/AGENTS.md` — dokumentasi dan instruksi
- `mobile/scripts/sync-frontend-lib.ts` — skrip internal sinkronisasi
- `*.test.ts` — berkas pengujian dan fixture data
- `mobile/src/lib/**`, `mobile/src/components/**` — salinan Mobile turunan web-desktop

## Perlu tindakan
- Jalankan `bun run sync:mobile` dan `bun run sync:public` jika ada kode bersama yang disinkronkan.
