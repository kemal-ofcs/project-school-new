# HASIL.md — hasil `bun run check`

- Waktu: 2026-10-26 22:22 WIB
- Commit: e0371f4 (+ 74 berkas berubah, belum commit)
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
- Seluruh 11 audit integritas pra-pemeriksaan lolos (skema 4-layer, kontrak rute/snapshot/permission, SQL runtime, ui-guard, page-guard, dialog, route-guard, confirm, silent-catch, dan list-bound).
- Unit test Rust `web-desktop`: 473 passed; 0 failed.
- Unit test Rust `mobile`: 476 passed; 0 failed.
- Seluruh rangkaian pengujian Bun test pada `web-desktop`, `mobile`, dan `web-public` lulus.
