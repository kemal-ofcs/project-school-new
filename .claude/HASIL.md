# HASIL.md — hasil `bun run check` (CONTOH, akan ditimpa)

Ditulis oleh agen Gemini di Antigravity. Dibaca Claude Code. Jangan disunting tangan.

- Waktu: 2026-10-15 14:32 WIB
- Commit: e0b9b7f (+ 12 berkas berubah, belum commit)
- Perintah: `bun run check` (root)
- Exit code: 1
- Status: **GAGAL**
- Log penuh: `.claude/check.log`

## Gate yang gagal

| Gate | Hasil |
|------|-------|
| audit:schema | lulus |
| audit:contract | lulus |
| audit:sql | GAGAL |
| lint (web-desktop) | lulus |
| typecheck (web-desktop) | lulus |
| test (web-desktop) | lulus |
| lint / typecheck / test (mobile) | lulus |
| cargo test (web-desktop) | tidak sempat jalan |
| cargo test (mobile) | tidak sempat jalan |

## Galat (maks 10, urutan kemunculan)

1. `web-desktop/src-tauri/src/desktop/billing.rs:412` — audit:sql: no such column `k.sisa`
2. ...

## Catatan

Kosongkan bagian ini bila tidak ada. Isi hanya fakta dari log, bukan dugaan perbaikan.
