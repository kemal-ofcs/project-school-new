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
Claude never runs the full Rust suite (`cargo test` without a test name, `bun run test:rust`): its output is thousands of lines, and every later turn re-sends it. To confirm one Rust test, run it by name, redirect output to the scratchpad, and read only the summary: `cargo test --manifest-path src-tauri/Cargo.toml <test_name> > "<scratchpad>/cargo.log" 2>&1; grep -E "^test result:|FAILED|panicked" "<scratchpad>/cargo.log"`. The same applies to `bun run test` (whole suite): run a single file instead.
Cara kerja hemat konteks (berlaku di atas kolom "Gerbang" PRD mana pun): tulis SEMUA langkah satu sub-fase dulu, baru satu putaran cek di akhir. Di tengah jalan hanya boleh tes vektor TS modul aturan baru, sekali. Putaran akhir: `tsc` + Biome berkas yang diubah, tes berkas yang BARU atau diubah untuk fitur itu (masing-masing sekali), satu `cargo test <nama_modul>` Desktop, dan `audit:contract` bila command, rute, atau tabel bertambah. Audit lain, tes salinan Mobile, `cargo test` Mobile, dan tes modul lama yang tidak disentuh dijalankan pemilik lewat `jalankan-check`. Grep pada berkas ber-SQL panjang memakai `-o`/`head_limit`; jangan membaca ulang berkas yang sudah dibaca.
Supaya tidak membaca dua kali: (1) saat diagnosis, baris yang akan disunting dibaca UTUH sekali (tanpa `cut -c`/pemotongan), karena teks itulah `old_string` nanti; pemotongan hanya untuk menjelajah. (2) Bagian yang baru diperlukan setelah keputusan user (opsi terpilih) baru dibaca setelah keputusan itu, satu kali. (3) Satu berkas satu alat: jangan menyunting berkas dengan `sed` lalu dengan Edit, karena `sed` memaksa Read ulang sebelum Edit. (4) Cek hasil `sync-*.ts` di salinan Mobile dengan grep literal kode satu baris yang baru ditulis (nama konstanta, potongan SQL), bukan kalimat komentar yang bisa terlipat ke baris berikutnya; grep 0 hasil berarti periksa polanya dulu sebelum menyimpulkan sinkron gagal.

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
| Inventaris, jurnal, kasbon, cicilan pembelian, tagihan, kuitansi, nilai, e-Rapor, tutup buku | `14-keuangan-nilai-inventaris.md` | Saldo/stok/sisa TIDAK pernah disimpan, selalu diturunkan; buku append-only, koreksi = baris pembalik berid deterministik; cloud tidak pernah menolak karena stok atau tanggal; aturan dieja kembar Rust ↔ TS dengan vektor yang sama. |
| Foto konten situs publik, formulir PMB, pembayaran PMB | `15-konten-publik-pmb.md` | Foto konten hanya di tabel cloud-only `konten_gambar`; data DAPODIK tidak pernah disalin ke `siswa_data`; keadaan bayar PMB diturunkan dari kolom, tidak pernah menjadi nilai baru di CHECK `status`. |
| Rapel gaji, unit & bel sekolah, notifikasi Telegram, PPh 21/BPJS per masa | `17-gaji-unit-telegram-pajak.md` | Status rapel diturunkan, tidak disimpan; token Telegram tidak pernah keluar dari cloud; satu fungsi pajak per bahasa untuk pratinjau dan pembekuan; run gaji lama tidak dihitung ulang. |
| HRIS: organisasi, kontrak, pengajuan/cuti/Jam Kosong, beban & SK, SP/keluar/pesangon, kinerja | `18-hris-kepegawaian.md` (PRD per fase di `prd-hris/`) | Data pribadi, SP, keluar, dan kinerja KHUSUS CLOUD (`PESAN_LURING`); status selalu diturunkan; izin, cakupan unit, dan "diri sendiri" dari SESI; SQL kembar diperiksa harfiah oleh tes. |
| UI 3D / motion (Desktop + Mobile) | `07-immersive-3d-ui-ux.md` | Stack tetap (R3F, drei, Spline, Motion, Rive); aset di `public/3d/` tanpa CDN; satu konteks WebGL; tanpa canvas di halaman scanner saat kamera hidup; tier GPU di `localStorage`. |

**Aturan domain (ringkas; teks lengkap dan alasannya di `references/19-aturan-domain-rinci.md`):**
- Shift malam (`jam_pulang < jam_masuk`): scan pulang milik H+1, durasi `(out_min + 1440) - in_min`.
- Jendela scan masuk (v21) mundur dari Jam Masuk. Setiap jalur (scanner, koreksi, impor, edit riwayat, sync-push) memakai `hitungUlangAbsensiDariJam` / `recalculate_from_clock`; rinci di `references/05`.
- `absensi_harian.sumber` hanya `'Koreksi Admin'` > `'Import Offline'`/`'Import Manual'` > `'Scanner'` > `'Generate Sistem'`. SQLite lokal tanpa CHECK, jadi nilai lain macet permanen di outbox (tes juga).
- Uang (gaji, PPh 21, BPJS) di Rust `rust_decimal`, tidak pernah float; tarif per `effective_date`, setiap `payroll_runs` membekukan tarifnya.
- Kamera scanner: cleanup unmount (`useEffect(() => () => stopCamera(), [])`) terpisah dari `visibilitychange`.
- Command khusus Mobile: modul di luar `sync-rust-modules.ts`, nama berawalan `mobile_`, di gateway di dalam `if (isMobileRuntime()) { … }` (guard positif).
- `Modal`: callback lewat `useRef`; fokus hanya saat transisi buka (`[isOpen, mounted]`) dan tidak dicuri bila fokus sudah di dalam dialog.
- Konfirmasi simpan otomatis lewat `KonfirmasiSimpan.tsx` di kedua shell: `data-tanpa-konfirmasi` untuk form cari/filter, `data-konfirmasi` untuk tombol di luar `<form>`.
- Dropdown berisi data memakai `components/ui/PilihCari.tsx` (isi dan `onChange` sama dengan `<select>`); pilihan tetap yang pendek tetap `<select>`.
- QR personil `id|token`: setiap pembuatan GURU/SISWA/PEGAWAI membuat `token_absensi` acak dan `qr_code = "{id}|{token}"`.
- Tabel tersinkron tanpa `UNIQUE` selain PK; keunikan bisnis di aplikasi (`assert_unique`).
- Soft delete `siswa_data`/`guru_data` menonaktifkan `master_data` di transaksi yang sama; handler cloud tidak menghardcode status atau membuang `id_shift`/`no_hp`/`lp`.
- Single-active (mis. `akademik_tahun_ajaran.is_aktif`): `UPDATE ... SET is_aktif = 0 WHERE id <> ?` di batch yang sama.
- `master_data.jenis_personil` ejaannya campur: bandingkan `LOWER(TRIM(COALESCE(m.jenis_personil, '')))`, tidak pernah mentah.
- Status `notifikasi_wa` asing DITOLAK, tidak dinormalkan ke `Menunggu`; daftarnya kembar di CHECK, `wa_notification.rs`, `WA_NOTIFICATION_STATUSES`.
- Sebelum menjaga halaman dengan area/izin, cek `DEFAULT_ROLE_PERMISSIONS` supaya role yang ada tidak terkunci.
- `src/components/` tidak disinkronkan dan perbedaannya disengaja; hanya komponen yang identik byte masuk `filesToCopy`.
- Audit gate (`scripts/audit-*.ts`, `schema-audit.ts`) tidak pernah dilonggarkan atau diberi pengecualian; perbaiki pemanggilnya.
- Halaman privat Web/Desktop: `if (!canAccessArea(user, area)) redirect("/forbidden");`. Mobile tidak punya `/forbidden`: `useEffect` + `router.replace("/dashboard")` / `("/login")`.
- Zod selalu `.strict()`, enum persis CHECK constraint, objek bersarang ikut divalidasi.
- IPC Tauri: argumen Rust `snake_case` dipanggil `camelCase` dari JS (`{ idRombel }`); kunci DI DALAM objek JSON tidak dikonversi.
- String Rust: jangan slice byte (`&id[4..10]`), pakai `chars()`.
- Tanggal operasional selalu WIB: `date('now','+7 hours')` / `datetime('now','+7 hours')`, tidak pernah `date('now')` atau `'localtime'`.
- Status scan gerbang multi-sesi lewat agregasi `GROUP BY id_karyawan, tanggal` (`GATE_SUMMARY_SUBQUERY`, `MIN(NULLIF(TRIM(jam_masuk), ''))`), bukan join langsung ke `absensi_harian`.
- Status presensi kelas hanya `Hadir`/`Izin`/`Sakit`/`Alfa`/`Dispensasi`; nilai lain ditolak (`VALIDATION_ERROR`), tidak pernah jadi `Hadir`.
- Simpan ulang sesi presensi menghapus detail siswa yang tidak ada di roster dan mencatat outbox `delete`.
- `class_attendance.delete`, `teaching_journal.delete`, `attendance_ledger.delete` ada di `SENSITIVE_MUTATION_PERMISSIONS`.
- Kelas gabungan = satu `presensi_mapel` per rombel dalam satu transaksi/batch; honor JP dihitung per (tanggal, jam), jangan "diperbaiki"; jurnal disalin ke sesi gabungan yang belum berjurnal, tidak pernah menimpa.
- Urutan jam pelajaran numerik: `ORDER BY CAST(jam_ke AS INTEGER) ASC, jam_ke ASC`.
- TTS: tunggu `voiceschanged`, utamakan suara Indonesia `localService === true`.
- Foto siswa/absensi di luar `SNAPSHOT_TABLES`, tetapi tetap didorong lewat outbox dan ditarik on-demand.
- Rust memvalidasi format, panjang, ukuran (foto siswa maks 500 KB, foto absensi maks 2 MB) dan MIME (`image/jpeg|png|webp`) persis CHECK cloud SEBELUM menulis lokal.
- Izin sesuai data yang benar-benar disentuh (aksi atas semua personil = `employees.manage`, bukan `students.manage`).
- Doc comment `///` diletakkan SEBELUM `#[tauri::command]`, tidak di antaranya (mematahkan `audit:contract`).
- Leger kehadiran: pratinjau dihitung langsung; nilai rapor dibekukan di `leger_kehadiran` dengan `id_leger` lama dipakai ulang.
- Pembuatan guru/siswa mendaftarkan `id_card` (`WHERE NOT EXISTS`); template dipetakan lewat `normalizePersonnelRole`.
- Next.js 16 punya breaking change: baca `web-desktop/node_modules/next/dist/docs/` sebelum memakai API yang belum dikenal.
- Spreadsheet lewat `src/lib/client/xlsx.ts` dan `excel-export.ts` (tanpa dependensi); jangan menambah `ExcelJS` lagi.
- Mode `local_file`: perangkat memegang `desktop-security.db` (operasional + outbox) dan `sppg-hub.db` (berperan cloud); ekspor dan promosi membaca hub, jadi mesin sync tetap wajib berjalan.

**Light/Dark theme.** Base JSX is dark-mode only (`bg-slate-900`, `bg-slate-950`, `text-white`, `text-slate-400`); no inline light base classes. web-desktop handles light mode in `globals.css` (whitelist every container opacity, e.g. `.bg-slate-900\/95`); light accent text must be symmetrically inverted to deep tones (`#78350f`, `#9f1239`); recovery-code pills, bootstrap panels and modals carry semantic classes (`.bootstrap-recovery-code`, `.recovery-code-pill`). Mobile mirrors it with `:root[data-theme="light"]` CSS variables.

**Full engineering rules.** This repo carries a very detailed, mandatory rules set that goes beyond what's summarized above — anti-assumption/reuse-first discipline, the full canonical sync route list, R8/ProGuard and TLS requirements for Android, geofencing/GPS caching, auto-sync/outbox requirements, and more. Before non-trivial changes, consult:
- `.agents/skills/absensi-sppg-rules/SKILL.md` (and its `references/*.md`) — the authoritative "golden standard" doc.
- `web-desktop/AGENTS.md` / `mobile/AGENTS.md` — ringkasan per workspace untuk agen lain (Codex, Antigravity); TIDAK dimuat Claude. Bila berbeda, berkas ini dan `references/` yang menang.
- `.agents/penting.md` — architecture/security/payroll principles in Indonesian.

Local dev database: root `absensi-sppg.db` is the reference SQLite DB for `bun run audit:schema` (historical name, do not rename). Desktop's real local DB is `%LOCALAPPDATA%\id.sekolah.manajemen\desktop-security.db`; the folder is the `identifier` from `tauri.conf.json`, so changing it moves the whole local DB, and anything deriving that path (notably `migrate-old-db.ts` `targetDbPath`) must change in the same commit. `bun run migrate-old-db` (in `web-desktop/`) copies operational data from the legacy DB without touching the RBAC/security schema.

**"SPPG" survives only in technical identifiers, on purpose.** The app was renamed to Manajemen Sekolah, and nothing a user sees (UI, emails, seed data, card text) may say "SPPG". The identifiers below keep the old name because each one names something already stored on a device or in a deployment, and renaming it strands that data: env vars `SPPG_*` / `NEXT_PUBLIC_SPPG_RUNTIME` (every machine's `.env`), vault magics `SPPGTV2`/`SPPGTV3` and backup magic `SPPGBACKUPAESv1` / `.sppgbak` (existing vaults and backups become unreadable), key-derivation labels `sppg-vault-master-*` / `sppg-offline-identity-v2` (offline login fails), `sppg-hub.db` (the local hub database looks empty), cookies `sppg_session` / `sppg_wali` (everyone is logged out), storage keys `absensi_sppg_*` / `sppg_*`, and the file/folder names `absensi-sppg.db` and `.agents/skills/absensi-sppg-rules`. Test fixtures that contain "SPPG" are data, not branding, and stay too.

<!-- antislop:start -->
## Memori

- Simpan hanya yang tidak tercatat di repo: keputusan/preferensi pemilik, hal yang ditunda, rujukan luar.
- Satu berkas per topik, maksimal sekitar 1.000 karakter. Perbarui dengan MENIMPA keadaan lama; jangan menambah log "Status sesi N".
- Progres fase, angka, daftar berkas, dan catatan "sudah dibangun" ditulis di PRD atau `references/`, bukan di memori.
- Satu baris per memori di `MEMORY.md`, maksimal sekitar 120 karakter.

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

`graphify-out/` berisi graf pengetahuan kode. Opsional, bukan wajib:
- Pakai `graphify query "<pertanyaan>"`, `graphify path "<A>" "<B>"`, atau `graphify explain "<konsep>"` untuk pertanyaan arsitektur yang luas atau saat belum tahu berkasnya. Bila brief atau pesan sudah menyebut berkas/fungsinya, langsung baca berkas itu.
- Graf sering basi selama satu fase berjalan (berkas baru belum masuk); bila hasilnya tidak relevan, lanjut dengan Grep/Read tanpa mengulang.
- Claude tidak menjalankan `graphify update .`; pemilik yang menjalankannya.
- Diff besar `graphify-out/graph.json` di PR itu wajar; jangan dianggap churn.
