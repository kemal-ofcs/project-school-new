# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Manajemen Sekolah (formerly Absensi SPPG) is an offline-first school attendance/payroll system with two Bun/Next.js 16 + Tauri v2 workspaces that share nearly identical application code:

- `web-desktop/` — Next.js Web (Vercel/Node) + Turso LibSQL, and a Tauri Desktop (Windows/Mac/Linux) build using static export.
- `mobile/` — Tauri Mobile (Android APK, iOS) build, static export only, targeting the same backend.

Both workspaces embed a Rust/SQLite local database and sync bidirectionally with a shared LibSQL cloud database. There is no server component on Desktop/Mobile — they talk to the database directly (2-tier architecture).

**Two database providers.** The remote endpoint is Turso Cloud or a self-hosted libSQL server (`sqld`); both speak the same Hrana HTTP pipeline. The choice is stored explicitly as `TursoConfig.provider` (`turso` | `self_hosted` | `local_file`), never inferred from the URL, alongside `allow_insecure_transport`. `normalize_database_url` (`turso.rs`) is the single address gate: Turso needs HTTPS, self-hosted may use plain HTTP to private-network hosts, plain HTTP to a public host needs the opt-in flag. Auth tokens: required for Turso and public HTTPS self-hosted, optional on a private network.

**`web-desktop` is the canonical source for shared code.** `mobile/src/lib/*` and several `mobile/src-tauri/src/mobile/*.rs` files are generated copies produced by `mobile/scripts/sync-frontend-lib.ts` and `mobile/scripts/sync-rust-modules.ts` (the Rust sync also rewrites `Desktop*` → `Mobile*` identifiers and `crate::desktop` → `crate::mobile`). Edit the `web-desktop` originals first, then re-run these scripts from `mobile/` — do not hand-edit the generated files, changes will be silently overwritten on next sync.

## Commands

Run from the repo root unless noted. The root has no build of its own — it only orchestrates the two workspaces. Its `package.json`/`tsconfig.json` exist solely to type the audit scripts in `scripts/` (`@types/bun`, `@types/node`); no compiler runs there and nothing is bundled from it. Application dependencies belong in `web-desktop/` or `mobile/`, never here.

```bash
bun run check:quick      # audit:schema + audit:contract + audit:sql + lint + typecheck + tests, both workspaces
bun run check            # same + cargo tests in both workspaces
bun run audit:schema     # DB schema == storage.rs / turso.rs / db-schema.ts (also: audit:contract, audit:sql,
                         #   audit:ui-guard, audit:a11y, audit:page-guard, audit:list-bound; rationale: references/13)
bun run image:build --versi 1.0.0   # Web self-host: both Docker images -> rilis/manajemen-sekolah-<versi>/ (needs Docker)
bun run paket:build --versi 1.0.0   # Web self-host: Windows package without Docker -> rilis/...-windows.zip (Windows x64 only)
bun run reset:superadmin # reset superadmin password / clear rate limits (web-desktop)
```

Per-workspace (run inside `web-desktop/` or `mobile/`; scripts are identical in both):

```bash
bun dev                  # Next.js dev server (webpack)
bun run lint             # biome check .
bun run format           # biome format --write
bunx tsc --noEmit        # typecheck
bun run test             # runs every src/**/*.test.ts(x) via scripts/run-tests.ts
bun test path/to/file.test.ts   # run a single test file directly (bun:test)
bun run test:rust        # cargo test --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml <test_name>   # single Rust test
bun run check:quick      # lint + typecheck + test (this workspace only)
bun run check            # + test:rust
```

Builds:

```bash
# web-desktop
bun run build:web        # Next.js server build for Vercel
bun run build:desktop    # static export to out/ for Tauri Desktop
bun run tauri:build      # packages the Desktop installer (runs build:desktop first)
bun run tauri:preview    # tauri dev against src-tauri/tauri.preview.conf.json, --no-watch

# mobile
bun run build:mobile     # static export to out/ for Tauri Mobile
bun run tauri:android:build:arm64
bun run tauri:ios:build
```

`SPPG_BUILD_TARGET` / `NEXT_PUBLIC_SPPG_RUNTIME` (`web` | `desktop` | `mobile`) select the target at build/dev time — set by the scripts above, not manually.

Quality-gate discipline: Claude does NOT run `bun run check` or `bun run check:quick` itself — their output floods the context. After a change is fully written, stop and tell the user to run, in this order on their side: Antigravity skill `jalankan-antislop` (edits comments and UI text on changed files only; summary in `.claude/ANTISLOP.md`, read that file only) and THEN `jalankan-check`. Antislop goes first because it edits files; running it after a green check makes the check stale. Claude does not run antislop itself unless the user asks. The gate skill, which writes the summary to `.claude/HASIL.md` (full log in `.claude/check.log`). Read `.claude/HASIL.md` only, never the log in full; use Grep on the log if a line must be found. Check the `Commit` and `Waktu` lines first: if they predate the change, the result is stale — say so instead of trusting it. Individual gates for a single iteration (e.g. `bun run audit:sql`) may still be run, redirected to a file.

## Architecture

**Runtime detection & Gateway pattern.** `isDesktopRuntime()` (`src/lib/runtime/app-runtime.ts`) checks `NEXT_PUBLIC_SPPG_RUNTIME` / `window.__TAURI_INTERNALS__` to decide, at call time, whether the app is running as a Tauri app or a plain web page. UI components never call `invoke()` or `fetch("/api/...")` directly — every data operation goes through a module in `src/lib/gateways/*.ts`, which branches: Tauri → `invokeDesktop()`/`invokeMobile()` (Rust IPC command), web → `requestWebApi()` (Next.js route handler under `src/app/api/`).

**Static export constraint.** Desktop and Mobile Tauri builds use Next.js `output: "export"`, which cannot serve dynamic `GET` route handlers. Every handler under `src/app/api/**/route.ts` uses `POST` (commonly a `POST /.../query` endpoint for reads) or `PUT`/`PATCH`/`DELETE` — never `GET`.

**Rust backend layering** (`src-tauri/src/desktop/*` or `mobile/*`): `commands.rs` (thin handlers, auth/session checks) → `operational.rs`/`administration.rs`/`scanner.rs` (business logic) → `storage.rs` (local SQLite) / `turso.rs` (cloud pipeline client). `secrets.rs` is the AES-256-GCM + Argon2id vault (Turso token vault `SPPGTV3`, key in the OS keychain via `keyring` 3.x; v1/v2 vaults migrate on first open, Linux stays on v2, a missing OS key is handled like a corrupt vault). `time_policy.rs` is the sole source of attendance timestamps (never client JS `Date`). `sync.rs` is the outbox/snapshot engine.

**Sync engine (zero schema drift).** Table/column definitions stay identical across three layers: Rust `SNAPSHOT_TABLES` (`sync.rs`), SQLite DDL (`storage.rs`), and server schema (`web-desktop/src/lib/db-schema.ts` + `db-migrations.ts`). `SNAPSHOT_SOURCES` in `turso.rs` MUST stay in parity with `SNAPSHOT_TABLES` (single source for snapshot SELECTs and `sync_pulse` triggers). Local mutations queue in `desktop_sync_outbox` and push under canonical hyphen-case routes (`CANONICAL_SYNC_ROUTES` in `sync.rs`, e.g. `attendance/scan`); `bun run audit:contract` enforces it. Count tables and routes in code, not from docs. A pull never clobbers rows with a pending/conflict outbox entry. Details: `references/02` and `03`.

**One cloud database, two provisioning paths.** The cloud DB is created either by Rust `turso.rs::ensure_schema` or by TS `db-schema.ts` + `db-migrations.ts`; both MUST produce identical tables and columns (`CREATE TABLE IF NOT EXISTS` never repairs an existing table). `app_session`, `auth_login_rate_limit`, `role_permission_audit`, `sync_change_log` are web-owned: Rust copies the TS definition verbatim. A column only one side knows goes in Rust's `ensure_column` list AND a TS `ALTER TABLE` migration. `audit:contract` diffs both.

Never cross the sync boundary (`audit:contract` enforces both): the device-local connection keys in `sync::DEVICE_LOCAL_SETTING_KEYS`, and the default payroll rate rows (`payroll_seed::default_rate_ids()`). Default rate tables (`overtime_tier_rules`, `tax_rules`, `bpjs_rules`) are seeded from ONE file, `src/lib/validations/tarif-payroll-bawaan.json` (Rust `include_str!` in `desktop/payroll_seed.rs`; web `db-migrations.ts` imports the same file, which also lists legacy ids purged once). Never re-write those seeds elsewhere.
## Rujukan per domain (WAJIB dibuka sebelum menyentuh domain itu)

Isi lengkap tiap domain ada di `.agents/skills/absensi-sppg-rules/references/`. Satu baris di bawah hanyalah invarian yang tidak boleh dilanggar; alasan dan detailnya ada di berkas.

| Bila menyentuh | Buka | Invarian singkat |
|---|---|---|
| Sync: prioritas absensi, tarikan inkremental, gateway Mobile | `08-sync-arsitektur-lanjutan.md` | Jangan hidupkan lagi transport HTTP sync; kunci payload snapshot = kunci `SnapshotTable`; tabel `APPEND_ONLY_TABLES` tidak pernah di-UPDATE; kunci payload yang absen = "tidak berubah". |
| Login, Superadmin pertama, Lupa Password, TOTP | `09-auth-provisioning-lupa-password-totp.md` | Stempel waktu di alur ini selalu `datetime('now')` SQLite; TOTP SHA-1; kegagalan 2FA tidak boleh jatuh ke fallback offline; `normalizeRecoveryCode` TS = Rust. |
| Docker, paket Windows, lisensi, `web-public` berlisensi | `10-deploy-web-dan-lisensi.md` | Port database tidak dibuka; aplikasi hanya di `127.0.0.1` di belakang Caddy; lisensi dinilai di SATU gerbang (`require_any_permission` / `requireWebPermission`); teks publik tidak menyebut lisensi; sakelar lisensi ditanam saat build. |
| Foto bukti, IP allowlist, verifikasi wajah, hari libur/whitelist | `11-keamanan-absensi-wajah-libur.md` | Sakelar role dibaca dari SESI, tidak dari payload; allowlist IP kosong = belum diatur, whitelist libur kosong = tolak; cakupan whitelist pakai `kode_shift`/nama divisi, bukan `id_shift`; wajah tak terbaca tidak pernah menahan scan. |
| Build release, `gen/android`, penyimpanan Android, WhatsApp, jalur data Mobile | `12-build-android-wa-mobile.md` | Release butuh `.env`; jangan sunting `gen/android` dengan tangan (pakai `patch-android-release.ts`); simpan berkas Android lewat SAF `android_fs_async()`; batal/antre WA di Mobile menulis ke CLOUD. |
| Menambah atau membaca audit gate | `13-rasional-audit-gate.md` | Gate tidak boleh dilonggarkan atau diberi daftar pengecualian; perbaiki kode pemanggilnya. |
| Inventaris, jurnal, kasbon, tagihan, kuitansi, nilai, e-Rapor, tutup buku | `14-keuangan-nilai-inventaris.md` | Saldo/stok/sisa TIDAK pernah disimpan, selalu diturunkan; buku append-only, koreksi = baris pembalik berid deterministik; cloud tidak pernah menolak karena stok atau tanggal; aturan dieja kembar Rust ↔ TS dengan vektor yang sama. |
| Foto konten situs publik, formulir PMB | `15-konten-publik-pmb.md` | Foto konten hanya di tabel cloud-only `konten_gambar`; data DAPODIK tidak pernah disalin ke `siswa_data`. |

**Domain specifics worth knowing before touching attendance/payroll code:**
- Overnight shifts (`jam_pulang < jam_masuk`): scan-out belongs to the next calendar day; duration = `(out_min + 1440) - in_min`.
- Scan-in window (schema v21) runs BACKWARDS from Jam Masuk: Awal Absen → Tepat Waktu `[jam_masuk − batas_masuk, jam_masuk]` → Terlambat `(jam_masuk, jam_masuk + toleransi]` → rejected (contact Admin/Operator). Lateness is measured from Jam Masuk; Jam Kerja Normal = `(pulang − masuk) − istirahat`; actual work starts at `max(scan, jam_masuk)`; the break is deducted in full once check-out passes `jam_masuk + offset_istirahat_mulai`. Every path (scanner, correction, import, history edit, sync-push) must call `time-policy.ts` / `time_policy.rs` helpers (`hitungUlangAbsensiDariJam` / `recalculate_from_clock`) — details in `references/05-business-logic-edge-cases.md`.
- Attendance-record priority when reconciling sources: Admin Correction > Offline/Manual Import > Scanner > System-generated (auto-alfa). The literal `absensi_harian.sumber` values are `'Koreksi Admin'`, `'Import Offline'`, `'Import Manual'`, `'Scanner'`, `'Generate Sistem'` — the cloud CHECK constraint accepts only those five. Local SQLite has **no** CHECK on that column, so a value like `'Scanner Terminal'` is written happily on-device and then rejected forever on push, jamming the outbox (`next_retry_at = NULL`). Prefer the literal spellings above whenever writing or seeding this column, tests included.
- Payroll/tax math (PPh 21 TER/Pasal 17, BPJS) is computed in Rust using `rust_decimal`, never `f64`/JS floats; rates live in `tax_rules`/`bpjs_rules` keyed by `effective_date`, and each `payroll_runs` execution snapshots the rate it used.
- Camera lifecycle for the QR scanner must decouple unmount cleanup (`useEffect(() => () => stopCamera(), [])`, empty deps) from `visibilitychange` handling — coupling `stopCamera()` to a state-dependent effect kills the Android WebView camera immediately after open.
- **Perintah yang hanya ada di biner Mobile** hidup di modul di luar daftar salin `sync-rust-modules.ts` (`share.rs`, dan seterusnya) dan namanya WAJIB berawalan `mobile_`. Awalan itu yang dipakai `audit:contract` untuk membedakan "command hantu" dari "command khusus Mobile". Di sisi gateway bersama, panggilannya wajib berada di dalam blok `if (isMobileRuntime()) { … }` — guard POSITIF, bukan `if (!isMobileRuntime()) throw`, karena hanya bentuk itu yang dikenali `splitMobileBranch` di auditnya.
- Modal & form focus safety: In dialogs (`Modal`), callback props (`onClose`, `onSubmit`, `onChange`) MUST be stabilized via `useRef` (`onCloseRef.current = onClose`) so inline parent handlers do NOT re-trigger effects on every keystroke. Focus management (`dialogRef.current.focus()`) must run ONLY once on open transition (`[isOpen, mounted]`) and NEVER steal focus if `dialogRef.current.contains(document.activeElement)` (prevents the 1-keystroke input focus-loss bug).
- Scanner payload contract: Scanner strictly expects `id|token` format (`parts[1] == token`). Any personnel entity creation (`GURU`, `SISWA`, `PEGAWAI`) MUST generate a random `token_absensi` and write `qr_code = format!("{id}|{token}")` to `master_data`.
- No UNIQUE constraints on synced tables: Database-level `UNIQUE` constraints (besides Primary Key) on synced tables cause permanent outbox push failures (`next_retry_at = NULL`) on offline conflict. Business uniqueness must be asserted at the application layer (`assert_unique`).
- Multi-table relational soft deletes: Soft deleting child profiles (`siswa_data`, `guru_data`) must update `master_data.status_aktif = 'Nonaktif'` atomically. Cloud handlers must never hardcode status or drop relational fields (`id_shift`, `no_hp`, `lp`), preventing zombie resurrections on snapshot pull.
- Idempotent single-active state toggle: Cloud handlers for single-active entities (e.g. `akademik_tahun_ajaran.is_aktif = 1`) must deactivate others atomically: `UPDATE ... SET is_aktif = 0 WHERE id <> ?`.
- `master_data.jenis_personil` is stored with mixed spellings (`'SISWA'`/`'GURU'` from the academic flow, `'Pegawai'` from Excel import and `sync-push.ts`, `'Siswa'` from `normalizePersonnelRole`). Never compare raw: use `LOWER(TRIM(COALESCE(m.jenis_personil, ''))) = 'siswa'` as in `attendance_dashboard.rs`. A raw `= 'Siswa'` in `scanner.rs` silently drops guardian notifications for academic-flow students. Writing new values as-is is fine.
- Status `notifikasi_wa` yang tidak dikenal DITOLAK, tidak pernah dinormalkan menjadi `Menunggu`. `Menunggu` adalah satu-satunya status yang benar-benar dikirim, sehingga menormalkannya mengubah bug klien menjadi pesan WhatsApp ke nomor wali seorang siswa — tidak bisa ditarik kembali, dan tanpa jejak bahwa ada yang salah. Daftar kanoniknya dieja di tiga tempat yang wajib sama: CHECK constraint `notifikasi_wa.status`, `queue_wa_notification_tx` di `wa_notification.rs`, dan `WA_NOTIFICATION_STATUSES` di `src/lib/validations/wa-notification.ts`. Ini pola `class_status` Fase 2 dengan taruhan lebih tinggi: di sana nilai asing merusak rekap, di sini ia mengirim pesan.
- The `sync` area (`sync.view`) exists so Mobile's sync page can be guarded: it displays sync **conflicts**, whose payloads span every domain including payroll and counseling. `sync.view` already ships in the operator and scanner default bundles, so adding the guard denied nobody — check `DEFAULT_ROLE_PERMISSIONS` before guarding a page on any area, since a permission missing from those bundles locks existing roles out of a page they use today.
- **`src/components/` is deliberately NOT synced; most divergence is intentional** (`DatabaseBackupCard` uses Android SAF; `FeedbackBanner`/`StatusBadge` have different props; `BrandLogo` a different default size; `PasswordRecoveryCard` a different light-mode approach). Do not unify. Only byte-identical components are listed in `filesToCopy` in `sync-frontend-lib.ts` (e.g. `AutoAlfaRunner`, `AutoSyncRunner`, `LivenessCapture`); confirm they are genuinely identical before adding one.
- Audit script integrity: Never whitelist or loosen checks in `audit-sync-contract.ts`, `schema-audit.ts`, `audit-sql.ts`, `audit-ui-guard.ts`, `audit-a11y.ts`, `audit-page-guard.ts`, `audit-dialog.ts`, `audit-route-guard.ts`, or `audit-list-bound.ts` to make tests pass. Fix the calling code instead (e.g. guard with `if (isMobileRuntime())`).
- Page-level route guards: Every private page component needs `if (!canAccessArea(user, area)) redirect("/forbidden");`.
- Strict Zod schemas: Always use `.strict()`, never `.passthrough()`. Validate enums against CHECK constraints and validate nested objects recursively.
- Tauri v2 IPC parameter naming: Rust `snake_case` maps to JS `camelCase` (e.g. `id_rombel: Option<String>` -> `{ idRombel }`). Passing `snake_case` in JS results in silent `None`.
- Rust string slicing: Never use raw byte slicing `&id[4..10]`. Use UTF-8 safe character iterator `id.chars().skip(4).take(6).collect::<String>()`.
- Full check verification: completion means a green `bun run check` (which includes cargo tests), not just `bun run check:quick` — as reported in `.claude/HASIL.md` by the user's run (see "Quality-gate discipline"). Claude must not claim "verified" without a fresh, passing HASIL.md.
- Standar Tunggal Waktu Operasional & Tanggal Kanonik WIB: DILARANG menggunakan `date('now')` (UTC) atau `date('now','localtime')` untuk penentuan tanggal operasional, hari ini, filter presensi, rekonsiliasi, maupun snapshot. Antara pukul 00:00–07:00 WIB, query UTC menunjuk ke hari kemarin. Jam server/perangkat WAJIB menggunakan `date('now','+7 hours')` atau `datetime('now','+7 hours')` (mengikuti `current_jakarta_moment` di `scanner.rs`).
- Agregasi Wajib Scan Gerbang Multi-Sesi & Sanitasi Jam Masuk: Tabel `absensi_harian` mengizinkan multi-sesi per tanggal (`izinkan_multi_sesi = 1`). Melakukan join langsung ke `absensi_harian` menggandakan baris siswa dan anomali. Setiap query yang membutuhkan status scan gerbang WAJIB melalui subquery agregasi tunggal (`GATE_SUMMARY_SUBQUERY` / `GROUP BY id_karyawan, tanggal`) dengan `MIN(NULLIF(TRIM(jam_masuk), ''))` dan sanitasi string kosong (`jam_masuk IS NOT NULL AND TRIM(jam_masuk) <> ''`).
- Penolakan Ketat Status Presensi Kelas: Status kehadiran siswa pada presensi mapel terikat ketat pada 5 nilai kanonik: `Hadir`, `Izin`, `Sakit`, `Alfa`, `Dispensasi`. DILARANG mengubah nilai status asing atau error menjadi "Hadir" secara diam-diam (`_ => "Hadir"`). Nilai tak dikenal WAJIB ditolak dengan error validasi (`VALIDATION_ERROR` / HTTP 400).
- Pembersihan Detail Basi Saat Simpan Ulang Sesi Presensi: Saat menyimpan ulang sesi presensi kelas (`save_class_attendance`), backend WAJIB menghapus baris `presensi_mapel_detail` untuk siswa yang sudah tidak ada di roster yang dikirim (misal siswa pindah rombel/keluar), dan mendaftarkan event outbox `delete` untuk detail yang dibuang. Dilarang membiarkan detail usang tetap tersimpan karena akan membuat header `total_*` dan baris detail tidak sinkron serta menghasilkan rekonsiliasi palsu.
- Navigasi Aman & Larangan `redirect("/forbidden")` di Mobile Static Export: Mobile menggunakan Tauri v2 dengan Next.js static export (`output: "export"`) yang tidak memiliki rute `/forbidden`. DILARANG memanggil `redirect("/forbidden")` di mobile. Proteksi area privat di mobile WAJIB menggunakan `useEffect` dengan `router.replace("/dashboard")` untuk pengguna tidak berhak dan `router.replace("/login")` untuk unauthenticated.
- Penghapusan Sesi Presensi Wajib Berizin Sensitif (`class_attendance.delete`): Menghapus sesi presensi mapel memusnahkan seluruh rekam jejak kehadiran kelas jam tersebut. Aksi penghapusan ini WAJIB menuntut permission tersendiri `class_attendance.delete` yang terdaftar dalam `SENSITIVE_MUTATION_PERMISSIONS`, sehingga tidak diberikan secara otomatis ke role bawaan Admin.
- Pengurutan Numerik Jam Pelajaran (`CAST(jam_ke AS INTEGER)`): Kolom `jam_ke` bertipe TEXT sehingga pengurutan leksikografis biasa (`ORDER BY jam_ke ASC`) akan meletakkan jam ke-10 sebelum jam ke-2 (`1, 10, 2, 3...`). Pengurutan sesi dan rekonsiliasi WAJIB menggunakan numerik: `ORDER BY CAST(jam_ke AS INTEGER) ASC, jam_ke ASC`.
- Kesiapan Suara TTS Asinkron & Seleksi Suara Offline (`localService`): Pemanggilan `speechSynthesis.getVoices()` di WebView/Chromium bersifat asinkron dan kosong pada pemanggilan pertama. Modul audio WAJIB mendengarkan event `voiceschanged` dan meng-cache daftar suara. Untuk menjaga kepatuhan offline-first, seleksi suara bahasa Indonesia WAJIB memprioritaskan suara lokal (`voice.localService === true`) agar tidak bergantung pada koneksi internet.
- Gambar/Foto Siswa & Paraf Digital di luar SNAPSHOT_TABLES: Paraf digital jurnal mengajar disimpan sebagai nama + stempel waktu + operator dari sesi login (bukan upload gambar). Foto siswa (`siswa_foto`) dan foto absensi (`absensi_foto`) sengaja di luar `SNAPSHOT_TABLES` agar pull snapshot berkala tidak mengunduh megabytes biner. Namun "di luar snapshot" HANYA berarti tidak ditarik secara massal (pull); saat disimpan di lokal, baris WAJIB didorong ke cloud lewat outbox (`student-photo/save`, `attendance/scan`) dan ditarik on-demand via query endpoint jika perangkat belum memiliki salinannya. Dilarang menganggap "di luar snapshot" sebagai tabel lokal yang terputus dari sinkronisasi cloud.
- Validasi Input & MIME Type di Rust Backend (Anti-Outbox Jam): SQLite lokal bersifat *loose typing*. Backend Rust (`tauri::command` dan fungsi domain) WAJIB memvalidasi format, panjang karakter, batas ukuran (base64 foto siswa maks 500 KB, foto absensi maks 2 MB), dan whitelist enum/MIME type secara presisi (`image/jpeg`, `image/png`, `image/webp`) SESUAI PERSIS dengan CHECK constraint cloud SEBELUM menulis ke SQLite lokal dan mendaftarkan event outbox. Membiarkan nilai cacat tersimpan di lokal akan memicu penolakan di LibSQL cloud, mengunci status outbox menjadi `failed` permanen (`next_retry_at = NULL`).
- Scoping Hak Akses RBAC Sesuai Cakupan Data Nyata (Least Privilege): Periksa himpunan data riil yang disentuh oleh query command Rust. Jika suatu aksi menyentuh seluruh personil aktif di `master_data` (guru, siswa, dan karyawan/staf sekaligus, seperti `desktop_backfill_id_cards`), gunakan permission domain personil penuh (`employees.manage`). DILARANG menggunakan permission parsial domain tunggal (`students.manage`) yang menimbulkan celah eskalasi hak akses (*privilege escalation*).
- Urutan Kanonik Doc Comments dan Atribut `#[tauri::command]`: Doc comments `///` WAJIB selalu diletakkan SEBELUM atribut `#[tauri::command]`, lalu diikuti deklarasi fungsi `pub fn desktop_...`. DILARANG menyisipkan doc comment di antara `#[tauri::command]` dan `pub fn`; komentar panjang (>200 karakter) di posisi tersebut akan mematahkan regex scanner `audit:contract` dan menyebabkan command dilaporkan tidak terdefinisi.
- Leger Kehadiran Dual Mode (Pratinjau Langsung vs Leger Beku Rapor): Pratinjau langsung dihitung on-the-fly dari `absensi_harian` via `GATE_SUMMARY_SUBQUERY` dan `presensi_mapel_detail` tanpa tabel perantara. Nilai resmi rapor dikunci ke tabel tersinkronisasi `leger_kehadiran` (pembekuan ulang rombel wajib me-reuse `id_leger` lama demi idempotensi offline-first).
- Multi-Template ID Card & Backfill Otomatis Siswa/Guru: Pembuatan guru dan siswa otomatis mendaftarkan baris `id_card` (`WHERE NOT EXISTS`). Sistem mendukung multi-template (`default_template`, `template_guru`, `template_siswa`) yang dipetakan dinamis via `normalizePersonnelRole`, dengan command/service backfill untuk entitas lama.
- Proteksi Izin Sensitif Fase 3: Aksi penghapusan `teaching_journal.delete` dan `attendance_ledger.delete` WAJIB terdaftar dalam `SENSITIVE_MUTATION_PERMISSIONS` agar tidak diberikan secara otomatis ke peran selain Superadmin.

**Rapel gaji (schema v51).** Tabel tersinkron `payroll_rapel` (rute `payroll-rapel/save|cancel`, `delete_missing: false`, ikut dibuang saat pindah database) menyimpan selisih upah slip yang SUDAH PAID karena tarif per jam yang berlaku untuk periodenya berubah sesudah slip dibekukan. Selisihnya dihitung dari angka beku slip asal (`total_regular_hours` → menit bulat, indeks lembur dua desimal, komponen `PERCENTAGE` di `breakdown_snapshot`), tidak pernah dari absensi atau aturan hari ini, dan kedua sisi (tarif lama dan baru) dihitung dengan rumus yang sama supaya galat pembulatan slip asal tidak ikut menjadi rapel; honor per JP sengaja tidak dirapel karena slip tidak menyimpan rinciannya per mapel. "Tarif terbayar" = `rate_baru` rapel terakhir yang tidak dibatalkan, atau tarif beku; deteksi (`detect`, maks 12 bulan) membandingkannya dengan tarif `salary_configs` yang berlaku per `period_end`. Tarif turun ditampilkan sebagai kelebihan bayar dan tidak bisa disimpan. Admin menyetujui yang dicentang (`save`): jumlah dihitung ulang di backend, dan tarif kiriman layar hanya dipakai menolak bila tarifnya berubah sejak dihitung. Id deterministik `rpl-<slip>-<tarif baru>` (dua perangkat yang menyetujui hal sama menghasilkan satu baris). Status TIDAK disimpan: `Dibatalkan` dari `dibatalkan_pada`, sisanya dari proses gaji bukan-REJECTED yang memuat id rapel di `breakdown_snapshot.rapel` (`Diproses`/`Dibayar`), persis pola kasbon. Rapel `Menunggu` dibayar di KETIGA titik hitung gaji (pratinjau dan pembekuan Rust, `computePayrollRecap` Web) sebagai tunjangan: masuk `est_total_allowance`/bruto sehingga PPh 21, BPJS, kasbon, dan jurnal payroll mengikutinya tanpa kode tambahan, dan dibekukan sebagai entri `components` (`calc_type: RAPEL`, nama "Rapel Juli 2026") plus daftar `rapel`. Pembatalan wajib beralasan dan hanya untuk rapel yang belum dipegang proses gaji. Aturan murni dan SQL dieja kembar `desktop/rapel.rs` ↔ `validations/payroll-rapel.ts` + `services/payroll-rapel.ts` dengan vektor yang sama. Izin `payroll.rapel.manage` sensitif; daftar cukup `payroll.view`. UI: `components/payroll/RapelWorkspace.tsx` (di `filesToCopy`) di `/payroll/rapel` kedua build. Batasnya: karyawan nonaktif tidak masuk proses gaji, jadi rapelnya tetap `Menunggu`.

**Immersive 3D / motion UI stack (Desktop + Mobile).** The approved stack is fixed: React Three Fiber v9 + drei, Spline, Motion, Rive, vendored Aceternity/Magic UI, `detect-gpu`, Draco/GLTF-Transform (dev only), Zustand as the data bridge; anything else needs explicit approval. Constraints: every `.glb`/`.riv`/`.wasm`/decoder/benchmark file is bundled under `public/3d/` (no CDN; Desktop `connect-src` is `'self' ipc:`, so any CSP loosening needs user approval); 3D lives in `src/components/visual/` as `"use client"` + `dynamic(..., { ssr: false })` and is never imported from `src/lib/**`; GPU tier is detected and stored device-local (`localStorage` `sppg.visual.tier`), never in synced settings; no WebGL canvas on the scanner page while the camera is live, one live WebGL context app-wide (sole exception: the face engine's offscreen TFJS context). Full contract: `references/07-immersive-3d-ui-ux.md`.

**Light/Dark theme.** Base JSX is dark-mode only (`bg-slate-900`, `bg-slate-950`, `text-white`, `text-slate-400`); no inline light base classes. web-desktop handles light mode in `globals.css` (whitelist every container opacity, e.g. `.bg-slate-900\/95`); light accent text must be symmetrically inverted to deep tones (`#78350f`, `#9f1239`); recovery-code pills, bootstrap panels and modals carry semantic classes (`.bootstrap-recovery-code`, `.recovery-code-pill`). Mobile mirrors it with `:root[data-theme="light"]` CSS variables.

**Full engineering rules.** This repo carries a very detailed, mandatory rules set that goes beyond what's summarized above — anti-assumption/reuse-first discipline, the full canonical sync route list, R8/ProGuard and TLS requirements for Android, geofencing/GPS caching, auto-sync/outbox requirements, and more. Before non-trivial changes, consult:
- `.agents/skills/absensi-sppg-rules/SKILL.md` (and its `references/*.md`) — the authoritative "golden standard" doc.
- `web-desktop/AGENTS.md` / `mobile/AGENTS.md` — per-workspace condensed rules, loaded automatically per workspace. They are a *summary* of this file (about a third its length) and phrased per target, so where the two disagree, this file and the `.agents/skills` references win.
- `.agents/penting.md` — architecture/security/payroll principles in Indonesian.

Local dev database: root `absensi-sppg.db` is the reference SQLite DB for `bun run audit:schema` (historical name, do not rename). Desktop's real local DB is `%LOCALAPPDATA%\id.sekolah.manajemen\desktop-security.db`; the folder is the `identifier` from `tauri.conf.json`, so changing it moves the whole local DB, and anything deriving that path (notably `migrate-old-db.ts` `targetDbPath`) must change in the same commit. `bun run migrate-old-db` (in `web-desktop/`) copies operational data from the legacy DB without touching the RBAC/security schema.

**"SPPG" survives only in technical identifiers, on purpose.** The app was renamed to Manajemen Sekolah, and nothing a user sees (UI, emails, seed data, card text) may say "SPPG". The identifiers below keep the old name because each one names something already stored on a device or in a deployment, and renaming it strands that data: env vars `SPPG_*` / `NEXT_PUBLIC_SPPG_RUNTIME` (every machine's `.env`), vault magics `SPPGTV2`/`SPPGTV3` and backup magic `SPPGBACKUPAESv1` / `.sppgbak` (existing vaults and backups become unreadable), key-derivation labels `sppg-vault-master-*` / `sppg-offline-identity-v2` (offline login fails), `sppg-hub.db` (the local hub database looks empty), cookies `sppg_session` / `sppg_wali` (everyone is logged out), storage keys `absensi_sppg_*` / `sppg_*`, and the file/folder names `absensi-sppg.db` and `.agents/skills/absensi-sppg-rules`. Test fixtures that contain "SPPG" are data, not branding, and stay too.

<!-- antislop:start -->
## antislop
For UI, copy, people, mobile layout, or code comments work, load the `antislop` skill (core, installed as a plugin) and then the skill for the task:
- UI / visual: `antislop-ui`
- Copy & text: `antislop-copywriting`
- People: `antislop-human`
- Mobile / responsive: `antislop-layoutmobile`
- Code comments: `antislop-code`
- Runner pra-check: `jalankan-antislop` (`.agents/skills/jalankan-antislop/SKILL.md`) atau `/antislop` sebelum `/check`
Root `DESIGN.md` is the brief for `web-public` (PMB portal) only. `web-desktop` and `mobile` have no DESIGN.md; their direction is the theme and 3D rules in this file.
Before starting, ask the user when antislop applies: during the work, or after it is done.
<!-- antislop:end -->

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- When graphify-out/graph.json exists, run `graphify query "<question>"` before your first grep, search or source-file read for a codebase question, and put this rule in every subagent prompt that explores code. Read raw files only for lines the graph or an earlier read already located. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- A committed graphify-out/graph.json is rewritten whole on every build, so a large diff to it in a pull request is expected. Do not flag it as churn or suggest skipping the graph rebuild or its hooks.
