# HASIL.md — hasil `bun run check`

- Waktu: 2026-10-23 14:59 WIB
- Commit: 69cfcfc (+ 35 berkas berubah, belum commit)
- Perintah: `bun run check` (root)
- Exit code: 1
- Status: **GAGAL**
- Log penuh: `.claude/check.log`

## Gate yang gagal

| Gate | Status |
| :--- | :--- |
| Audit skema (`schema-audit.ts`) | lulus |
| Kontrak sinkronisasi (`audit-sync-contract.ts`) | lulus |
| Audit SQL (`audit-sql.ts`) | lulus |
| Audit UI guard (`audit-ui-guard.ts`) | lulus |
| Audit aksesibilitas (`audit-a11y.ts`) | lulus |
| Audit guard halaman (`audit-page-guard.ts`) | lulus |
| Audit permukaan dialog (`audit-dialog.ts`) | GAGAL |
| Audit guard route (`audit-route-guard.ts`) | tidak sempat jalan |
| Audit konfirmasi (`audit-confirm.ts`) | tidak sempat jalan |
| Audit penanganan galat (`audit-silent-catch.ts`) | tidak sempat jalan |
| Audit pembatas daftar (`audit-list-bound.ts`) | tidak sempat jalan |
| Web-Desktop (lint, typecheck, test, cargo test) | tidak sempat jalan |
| Mobile (lint, typecheck, test, cargo test) | tidak sempat jalan |
| Web-Public (lint, typecheck, test) | tidak sempat jalan |

## Galat (maks 10, urutan kemunculan)
1. `mobile/src/components/ScannerView.tsx:813` — audit-dialog: 1 permukaan dialog buatan tangan (`fixed inset-0` tanpa `role="dialog"`)

## Catatan
`audit-dialog.ts` mendeteksi overlay layar penuh `fixed inset-0` pada `ScannerView.tsx:813` yang memuat judul tanpa semantik dialog (`role="dialog"` atau `<dialog>`).
