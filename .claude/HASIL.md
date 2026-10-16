# HASIL.md — hasil `bun run check`

- Waktu: 2026-10-16 15:39:55 WIB
- Commit: 87bb4ec (+ 9 berkas berubah, belum commit)
- Perintah: `bun run check` (root)
- Exit code: 0
- Status: **LULUS**
- Log penuh: `.claude/check.log`

## Gate yang gagal

| Gate | Status |
| :--- | :--- |
| `schema-audit.ts` | lulus |
| `audit-sync-contract.ts` | lulus |
| `audit-sql.ts` | lulus |
| `audit-ui-guard.ts` | lulus |
| `audit-a11y.ts` | lulus |
| `audit-page-guard.ts` | lulus |
| `audit-dialog.ts` | lulus |
| `audit-route-guard.ts` | lulus |
| `audit-confirm.ts` | lulus |
| `audit-silent-catch.ts` | lulus |
| `audit-list-bound.ts` | lulus |
| `web-desktop:lint` | lulus |
| `web-desktop:typecheck` | lulus |
| `web-desktop:test` | lulus |
| `web-desktop:test:rust` | lulus |
| `mobile` | lulus |
| `web-public` | lulus |

## Galat (maks 10, urutan kemunculan)

*(tidak ada galat)*

## Catatan

- Seluruh gate lulus tanpa error (11 skrip audit root, web-desktop lint/typecheck/unit test/cargo test, mobile check, dan web-public check).
