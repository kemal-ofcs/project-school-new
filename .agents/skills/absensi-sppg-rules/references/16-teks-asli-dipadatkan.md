# Teks asli yang dipadatkan di CLAUDE.md

Dipindahkan APA ADANYA dari CLAUDE.md pada pemadatan 2026-10-15. Di CLAUDE.md kini hanya ada versi ringkasnya; bila ada selisih makna, berkas INI yang menang.

**Two database providers.** The remote endpoint is either managed **Turso Cloud** or a **self-hosted libSQL server** (`sqld`/`libsql-server`) on the customer's own LAN machine, NAS, or VPS. Both speak the same Hrana HTTP pipeline, so the Rust client is unchanged; only address validation differs. The choice is stored explicitly as `TursoConfig.provider` (`turso` | `self_hosted` | `local_file`) — never inferred from the URL shape — alongside `allow_insecure_transport`. `normalize_database_url` in `turso.rs` is the single gate: Turso requires HTTPS, self-hosted may use plain HTTP to private-network hosts even in release builds, and plain HTTP to a public host needs the explicit opt-in flag. Auth tokens are required for Turso and for publicly-reachable HTTPS self-hosted servers, and optional for a libSQL server on a private network.

**Rust backend layering** (`src-tauri/src/desktop/*` or `src-tauri/src/mobile/*`): `commands.rs` (thin Tauri command handlers, auth/session checks) → `operational.rs`/`administration.rs`/`scanner.rs` (business logic) → `storage.rs` (local SQLite) / `turso.rs` (cloud LibSQL pipeline client). `secrets.rs` holds the AES-256-GCM + Argon2id credential vault (the Turso token vault is `SPPGTV3`: its key lives in Windows Credential Manager / macOS Keychain via `keyring` 3.x with explicit platform features, because the older `SPPGTV2` key was derived from `device_id`, which sits in plaintext beside the vault; v1/v2 vaults migrate on first open, Linux stays on v2, and a missing OS key is handled at startup like a corrupt vault); `time_policy.rs` is the sole source of truth for attendance timestamps (never trust client JS `Date`); `sync.rs` implements the outbox/snapshot sync engine.

**Sync engine (zero schema drift).** Table/column definitions must stay identical across three layers: Rust `SNAPSHOT_TABLES` in `sync.rs`, SQLite DDL in `storage.rs`, and server schema in `web-desktop/src/lib/db-schema.ts` + `db-migrations.ts`. (The fourth layer, the Zod validators in `sync-schema.ts`, was deleted together with the application-server sync path — see below.) Furthermore, Rust `turso.rs:625` defines `SNAPSHOT_SOURCES` which MUST stay in 100% parity with `SNAPSHOT_TABLES` (all 32 tables) — it is the single source for generating snapshot SELECT queries AND installing cloud `sync_pulse` triggers. Local mutations are queued in `desktop_sync_outbox` and pushed under one of the 69 canonical hyphen-case routes (e.g. `attendance/scan`, `company-profile/update`); `bun run audit:contract` enforces this. The list itself is `CANONICAL_SYNC_ROUTES` in `sync.rs`. Both counts drift with every phase — count them in the code rather than trusting these numbers. Pulls apply cloud snapshots into local SQLite without clobbering rows that still have a pending/conflict outbox entry.

**One cloud database, two provisioning paths.** The same Turso database is created either by Rust `turso.rs::ensure_schema` (bootstrap from Desktop/Mobile) or by TS `db-schema.ts` + `db-migrations.ts` (the web app). Both must produce identical tables and columns — `CREATE TABLE IF NOT EXISTS` never repairs a table that already exists, so a mismatch permanently breaks whichever path did not create it. `app_session`, `auth_login_rate_limit`, `role_permission_audit`, and `sync_change_log` are *web-owned*: Rust creates them only so the web keeps working, and must copy the TS definition verbatim. Columns only one side knows about go in Rust's `ensure_column` list *and* a TS `ALTER TABLE` migration, so either client heals the other's database. `bun run audit:contract` diffs the two implementations and checks that Rust provisioning creates every table `isDatabaseSchemaReady` counts.

Two things must never cross the sync boundary, and `bun run audit:contract` enforces both: the device-local connection keys in `sync::DEVICE_LOCAL_SETTING_KEYS` (they live in the synced `setting_gex_system` table but decide which cloud DB *this* device talks to), and the default payroll rate rows (`payroll_seed::default_rate_ids()`). The default rate tables (`overtime_tier_rules`, `tax_rules`, `bpjs_rules`) are seeded from ONE data file, `src/lib/validations/tarif-payroll-bawaan.json`: Rust reads it through `include_str!` in `desktop/payroll_seed.rs` (used by `storage.rs` and `turso.rs`) and the web's `db-migrations.ts` imports the same file, which also lists the legacy ids (`tax-p17-*`, `bpjs-*`) every path purges once. Before this, `db-migrations.ts` hand-wrote 2024 rates with those legacy ids and no TER brackets, so every Web-only installation computed PPh 21 as zero while Rust kept deleting the rows the web kept re-seeding. Never re-write those seeds anywhere else.

- `master_data.jenis_personil` tersimpan dengan ejaan yang BERBEDA-BEDA dan tidak boleh dibandingkan mentah. `academic.rs` / `academic.ts` menulis `'SISWA'` dan `'GURU'` huruf besar; impor Excel (`employee-workbook.ts`) dan `sync-push.ts` menulis `'Pegawai'` kapital awal; `normalizePersonnelRole` menghasilkan `'Siswa'`. Setiap predikat WAJIB memakai bentuk `LOWER(TRIM(COALESCE(m.jenis_personil, ''))) = 'siswa'` seperti di `attendance_dashboard.rs`. Sebuah `= 'Siswa'` mentah di `scanner.rs` membuat notifikasi wali tidak pernah terkirim untuk siswa yang dibuat alur akademik — justru siswa yang fiturnya dituju — dan tidak terlihat karena `OR s.id_siswa IS NOT NULL` menutupinya selama baris `siswa_data`-nya kebetulan ada. Menulis nilai baru tetap boleh apa adanya; yang dilarang adalah membandingkannya tanpa normalisasi.

- **`src/components/` is deliberately NOT synced, and most divergence there is intentional.** `DatabaseBackupCard` uses the Android Storage Access Framework path; `FeedbackBanner` and `StatusBadge` are parallel implementations with entirely different props (`children`/`tone`/`onDismiss` versus `message`/`type`/`onClose`); `BrandLogo` ships a different default size; `PasswordRecoveryCard` reaches light mode through semantic classes on web-desktop and inverted CSS variables on Mobile. Do not "unify" these — each fork exists for a reason. What *is* enforced: the three components that are byte-identical (`AutoAlfaRunner`, `AutoSyncRunner`, `LivenessCapture`) are listed in `filesToCopy` in `sync-frontend-lib.ts` so their sameness is maintained rather than coincidental — `AutoSyncRunner` drives the sync engine, and a fix landing on one side only would be invisible. Before adding a component to that list, confirm it is genuinely identical; copying a platform-specific one breaks the other build.

**Immersive 3D / motion UI stack (Desktop + Mobile).** The approved visual stack is fixed: React Three Fiber v9 + drei for real 3D, Spline for no-code hero/mascot scenes, Motion (Framer Motion) for pseudo-3D tilt and layout transitions, Rive for micro-animations and the sync status indicator, vendored Aceternity UI / Magic UI components for spotlight/bento/glow, `detect-gpu` to pick a quality tier, Draco / GLTF-Transform (devDependency only) to compress models, and Zustand purely as a bridge between app data and the canvas. Anything else needs explicit approval. Four constraints dominate every decision here: the app is offline-first so every `.glb`/`.riv`/`.wasm`/decoder/benchmark file must be bundled under `public/3d/` (Rive, `detect-gpu`, Draco, and Spline each default to a CDN and must be overridden, and Desktop's `connect-src` is `'self' ipc:` since v38 (approved for the bundled face models), so anything beyond same-origin fetches — `'wasm-unsafe-eval'`, `asset:` — is a CSP change that needs the user's approval first); `output: "export"` means 3D lives in `src/components/visual/` as `"use client"` modules loaded via `dynamic(..., { ssr: false })` and never imported from `src/lib/**`, which is synced to mobile; GPU capability is detected, never assumed, with tier stored device-local in `localStorage` (`sppg.visual.tier`) — never in the synced `setting_gex_system`; and no WebGL canvas may be mounted on the scanner page while the camera is live, with only one live WebGL context app-wide. The single exception is the face-verification engine's offscreen TFJS context, which the scanner needs while the photo camera is live. Full contract: `.agents/skills/absensi-sppg-rules/references/07-immersive-3d-ui-ux.md`.

**Light/Dark theme harmony & symmetric tone inversion.** All base JSX is strictly dark mode (`bg-slate-900`, `bg-slate-950`, `text-white`, `text-slate-400`); inline light base classes are forbidden. In `web-desktop`, light mode is handled centrally in `globals.css` where all container opacities (`.bg-slate-900\/95`, etc.) must be whitelisted. Light accent text in dark mode (`text-amber-100`, `text-rose-100`) must be symmetrically inverted in light mode to deep high-contrast tones (`#78350f`, `#9f1239`), and critical elements (recovery code pills, bootstrap panels, modals) must carry dedicated semantic classes (`.bootstrap-recovery-code`, `.recovery-code-pill`). In `mobile`, theme inversion is mirrored via `:root[data-theme="light"]` CSS variables (`--color-amber-100: #78350f`).

Local dev database: root `absensi-sppg.db` is the reference SQLite DB used by `bun run audit:schema` — that file name is historical and deliberately unchanged, like the `LEGACY_*` storage keys and `migrate-old-db.ts`'s `sourceDbPath`: it names something that already exists on disk, so renaming it would only make the tooling stop finding it. The Desktop app's real local DB lives at `%LOCALAPPDATA%\id.sekolah.manajemen\desktop-security.db`, where the folder is the `identifier` from `tauri.conf.json` — **changing that identifier moves the entire local database**, so an existing installation looks empty afterwards even though nothing was lost. Anything deriving that path (notably `migrate-old-db.ts`'s `targetDbPath`) must be updated in the same change, or the migration reports success while writing where the app never reads. `bun run migrate-old-db` (in `web-desktop/`) copies operational data from the legacy root DB into it without touching the RBAC/security schema.

## Blok perintah root (asli)

```bash
# Full quality gate across both workspaces (schema audit + sync contract audit + SQL audit + lint + typecheck + tests, both workspaces)
bun run check:quick

# Same as above, plus Rust cargo tests in both workspaces
bun run check

# Root-only: verify DB schema matches storage.rs/turso.rs/db-schema.ts across both workspaces
bun run audit:schema

# Root-only: verify outbox producers only use the canonical sync routes
bun run audit:contract

# Root-only: build the real schema from DDL, then ask SQLite to prepare every
# SQL literal in the repo. Every other gate checks the SHAPE of the code, so a
# mistyped column name is just text inside a string to all of them.
bun run audit:sql

# Root-only: every page that awaits a mutating gateway must guard it with
# `isSubmittingRef` (rule 5). Enforced, not remembered.
bun run audit:ui-guard

# Root-only: every form control must carry a name a screen reader can announce.
bun run audit:a11y

# Root-only: a page that redirects unauthenticated users to /login must also
# reject users who lack the permission, not merely hide its buttons.
bun run audit:page-guard

# Root-only: every query over a table that grows with each operating day must
# carry a bound. A query without LIMIT never feels wrong when written — on a
# development database it returns twenty rows.
bun run audit:list-bound

# Root-only: padanan `tauri:build` untuk versi Web. Membangun kedua image
# Docker (web-desktop + web-public) dan menyusun `rilis/manajemen-sekolah-<versi>/`,
# folder yang diserahkan ke pembeli self-hosted. Butuh Docker.
bun run image:build --versi 1.0.0

# Root-only: paket Windows TANPA Docker untuk versi Web. Membangun kedua
# aplikasi sebagai `standalone`, membungkusnya bersama Node dan Caddy (versi
# dan checksum dipatok di skripnya), lalu menyusun
# `rilis/manajemen-sekolah-<versi>-windows.zip`. Hanya di Windows 64-bit.
bun run paket:build --versi 1.0.0

# Reset superadmin password / clear rate limits (web-desktop)
bun run reset:superadmin
```
