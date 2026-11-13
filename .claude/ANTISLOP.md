# ANTISLOP.md — hasil antislop

- Waktu: 14 November 2026, 00:44 WIB
- Commit: fe84fa8 (+ berkas berubah, belum commit)
- Berkas disunting: 5

## Disunting
- `web-desktop/src/lib/validations/pajak.ts` — komentar — rapikan pembatas dekoratif berulang menjadi komentar baris tunggal
- `web-desktop/src-tauri/src/desktop/payroll/pajak.rs` — komentar — rapikan pembatas dekoratif berulang menjadi komentar baris tunggal
- `web-desktop/src-tauri/src/desktop/payroll/engine.rs` — komentar — ganti em dash pada doc comments dengan koma sesuai R-02
- `web-desktop/src/lib/services/payroll-calculator.ts` — komentar — ganti em dash pada doc comments dengan koma sesuai R-02
- `web-desktop/src/app/api/payroll/config/components/route.ts` — komentar — ganti em dash pada komentar penjelasan dengan tanda kurung sesuai R-02

## Dilewati
- `CLAUDE.md`, `.agents/`, `.claude/` — konfigurasi panduan agent
- `*.test.ts`, `*.test.tsx`, modul tes Rust — berkas dan fungsi pengujian
- `*.json` (`pajak-bawaan.json`, `pajak.vektor.json`, `tarif-payroll-bawaan.json`) — berkas data dan vektor
- `prd-hris.md` — dokumen spesifikasi produk
- Salinan `mobile/**` — turunan sinkronisasi dari `web-desktop`

## Perlu tindakan
Sync mobile sudah dijalankan ulang (`bun run sync:mobile`).
