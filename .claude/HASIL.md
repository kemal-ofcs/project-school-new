# HASIL.md — hasil `bun run check`

- Waktu: 2026-10-28 19:28 WIB
- Commit: dc4f89b (+ 1 berkas belum commit: inventaris-cicilan-prd.md)
- Perintah: `bun run check` (root)
- Exit code: 0
- Status: **LULUS**
- Log penuh: `.claude/check.log`

## Gate yang gagal
| Gate | Status |
| :--- | :--- |
| `audit:schema` | lulus |
| `audit:contract` | lulus |
| `audit:sql` | lulus |
| `audit:ui-guard` | lulus |
| `audit:a11y` | lulus |
| `audit:page-guard` | lulus |
| `audit:dialog` | lulus |
| `audit:route-guard` | lulus |
| `audit:confirm` | lulus |
| `audit:silent-catch` | lulus |
| `audit:list-bound` | lulus |
| `web-desktop` (`bun run check`) | lulus |
| `mobile` (`bun run check`) | lulus |
| `web-public` (`bun run check`) | lulus |

## Galat (maks 10, urutan kemunculan)
Tidak ada (0 galat).

## Catatan
- Seluruh 11 audit integritas lolos (skema 4-layer, kontrak rute kanonik & snapshot, SQL runtime, ui-guard, page-guard, dialog, route-guard, confirm, silent-catch, dan list-bound).
- Unit test Rust `web-desktop`: 485 passed; 0 failed.
- Unit test Rust `mobile`: 488 passed; 0 failed.
- Seluruh pengujian TypeScript/Bun di `web-desktop`, `mobile`, dan `web-public` lulus (0 fail).
