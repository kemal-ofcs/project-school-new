# HASIL.md — hasil `bun run check`

- Waktu: 2026-11-27 20:42 WIB
- Commit: d06db36 (+ 18 berkas berubah, belum commit)
- Perintah: `bun run check` (root)
- Exit code: 1
- Status: **GAGAL**
- Log penuh: `.claude/check.log`

## Gate yang gagal
| Gate | Status |
| :--- | :--- |
| `audit:schema` (`scripts/schema-audit.ts`) | Lulus |
| `audit:contract` (`scripts/audit-sync-contract.ts`) | Lulus |
| `audit:sql` (`scripts/audit-sql.ts`) | Lulus |
| `audit:ui-guard` (`scripts/audit-ui-guard.ts`) | Lulus |
| `audit:a11y` (`scripts/audit-a11y.ts`) | Lulus |
| `audit:kontras` (`scripts/audit-kontras.ts`) | Lulus |
| `audit:page-guard` (`scripts/audit-page-guard.ts`) | Lulus |
| `audit:dialog` (`scripts/audit-dialog.ts`) | Lulus |
| `audit:route-guard` (`scripts/audit-route-guard.ts`) | Lulus |
| `audit:confirm` (`scripts/audit-confirm.ts`) | Lulus |
| `audit:silent-catch` (`scripts/audit-silent-catch.ts`) | Lulus |
| `audit:list-bound` (`scripts/audit-list-bound.ts`) | Lulus |
| `web-desktop` (`lint`) | GAGAL |
| `web-desktop` (`typecheck` + `bun test` + `cargo test`) | Tidak sempat jalan di pipeline (diverifikasi terpisah: `typecheck` & `cargo test --no-run` lulus) |
| `mobile` (`lint` + `typecheck` + `bun test` + `cargo test`) | Tidak sempat jalan di pipeline (diverifikasi terpisah: `lint` 649 berkas, `typecheck`, & `cargo test --no-run` lulus) |
| `web-public` (`check`) | Tidak sempat jalan di pipeline (diverifikasi terpisah: `check:quick` lulus) |

## Galat (maks 10, urutan kemunculan)
1. `web-desktop/scripts/capture-promosi.ts:1` — `web-desktop:lint`: urutan import belum diurutkan Biome (`assist/source/organizeImports`)
2. `web-desktop/scripts/capture-promosi.ts:10` — `web-desktop:lint`: format baris tidak sesuai formatter Biome
3. `web-desktop/scripts/seed-demo-promosi.ts:151` — `web-desktop:lint`: format baris tidak sesuai formatter Biome

## Catatan
- Ketiga galat Biome di atas berasal dari dua berkas skrip promosi lama (`capture-promosi.ts` dan `seed-demo-promosi.ts`) yang belum diformat sebelumnya; seluruh 9 berkas TS/TSX/JSON yang diubah pada optimasi build lolos `biome check` dengan 0 galat.
- Kompilasi dan linking Rust memakai `rust-lld.exe` serta `run_with_context` lulus tanpa galat baik di `web-desktop` maupun `mobile`.
