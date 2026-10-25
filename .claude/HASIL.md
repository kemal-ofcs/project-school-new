# HASIL.md — hasil `bun run check`

- Waktu: 2026-10-25 20:25 WIB
- Commit: a0b3747 (+ 2 berkas berubah, belum commit)
- Perintah: `bun run check` (root)
- Exit code: 1
- Status: **GAGAL**
- Log penuh: `.claude/check.log`

## Gate yang gagal

| Gate | Status |
| :--- | :--- |
| `audit:schema` | Lulus |
| `audit:contract` | Lulus |
| `audit:sql` | Lulus |
| `audit:ui-guard` | Lulus |
| `audit:a11y` | Lulus |
| `audit:page-guard` | Lulus |
| `audit:dialog` | Lulus |
| `audit:route-guard` | Lulus |
| `audit:confirm` | Lulus |
| `audit:silent-catch` | Lulus |
| `audit:list-bound` | Lulus |
| `web-desktop` (`lint` + `typecheck` + `bun test` + `cargo test`) | Lulus |
| `mobile` (`lint` + `typecheck` + `bun test` + `cargo test`) | **GAGAL** |
| `web-public` (`lint` + `typecheck` + `bun test`) | tidak sempat jalan |

## Galat (maks 10, urutan kemunculan)
1. `mobile/src-tauri/capabilities/default.json:1` — mobile (lint): Formatter would have printed formatted content
2. `mobile/src/components/ScannerView.tsx:1` — mobile (lint): Formatter would have printed formatted content
3. `mobile/src/components/inventory/InventarisWorkspace.tsx:1` — mobile (lint): Formatter would have printed formatted content
4. `mobile/src/components/inventory/KolomTambahan.tsx:1` — mobile (lint): Formatter would have printed formatted content
5. `mobile/src/lib/contracts/scanner.ts:1` — mobile (lint): Formatter would have printed formatted content
6. `mobile/src/lib/db-migrations.ts:1` — mobile (lint): Formatter would have printed formatted content
7. `mobile/src/lib/db-schema.ts:1` — mobile (lint): Formatter would have printed formatted content
8. `mobile/src/lib/gateways/inventory.ts:1` — mobile (lint): Formatter would have printed formatted content
9. `mobile/src/lib/rbac/catalog.ts:1` — mobile (lint): Formatter would have printed formatted content
10. `mobile/src/lib/rbac/rbac-migration.test.ts:1` — mobile (lint): Formatter would have printed formatted content

## Catatan
Workspace `mobile` gagal pada gate `lint` (`biome check .`) dengan total 16 berkas belum terformat sesuai konfigurasi biome mobile. Gerbang `web-public` tidak sempat jalan karena eksekusi terhenti di mobile.
