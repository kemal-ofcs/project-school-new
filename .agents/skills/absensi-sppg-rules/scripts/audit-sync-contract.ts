import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dir, "../../../..");
const errors: string[] = [];
const notes: string[] = [];

const expectedRoutes = [
  "attendance/create",
  "attendance/delete",
  "attendance/scan",
  "attendance/update",
  "backup/cancel",
  "backup/create",
  "company-profile/update",
  "correction/create",
  "correction/delete",
  "employee/create",
  "employee/status",
  "employee/token",
  "employee/update",
  "holiday-whitelist/create",
  "holiday-whitelist/delete",
  "holiday-whitelist/update",
  "holiday/create",
  "holiday/delete",
  "holiday/update",
  "id-card-template/save",
  "id-card/update",
  "log-scan/delete",
  "offline-import/delete",
  "offline-import/row",
  "payroll/bpjs-rule",
  "payroll/create-run",
  "payroll/delete",
  "payroll/overtime-rule",
  "payroll/payroll-component",
  "payroll/salary-config",
  "payroll/tax-rule",
  "payroll/transition-status",
  "setting/update",
  "setting/upsert",
  "shift/create",
  "shift/delete",
  "shift/update",
].sort();

const expectedSnapshotTriples = [
  "employees|employee|master_data",
  "idCards|id-card|id_card",
  "shifts|shift|tbl_shift",
  "holidays|holiday|tbl_hari_libur",
  "holidayWhitelists|holiday-whitelist|hari_libur_whitelist",
  "settings|setting|setting_gex_system",
  "companyProfiles|company-profile|company_profile",
  "idCardTemplates|id-card-template|id_card_template",
  "backups|backup|backup_karyawan",
  "corrections|correction|koreksi_admin",
  "imports|offline-import|import_offline",
  "attendance|attendance|absensi_harian",
  "scanLogs|log-scan|log_scan",
  "salaryConfigs|payroll|salary_configs",
  "overtimeTierRules|payroll|overtime_tier_rules",
  "payrollComponents|payroll|payroll_components",
  "taxRules|payroll|tax_rules",
  "bpjsRules|payroll|bpjs_rules",
  "payrollRuns|payroll|payroll_runs",
  "payrollItems|payroll|payroll_items",
  "payrollAuditLogs|payroll|payroll_audit_logs",
].sort();

// Tabel DDL lokal (storage.rs) yang memang TIDAK ikut snapshot sync.
// Setiap tabel di storage.rs wajib berada di daftar ini ATAU di SNAPSHOT_TABLES.
const expectedLocalOnlyTables = [
  // Foto bukti absensi. Di luar SNAPSHOT_TABLES dengan sengaja: satu foto ~40 KB,
  // dan menariknya massal membuat tiap siklus pull berukuran puluhan megabyte.
  // Foto ikut event 'attendance/scan' saat push, lalu dibaca satu per satu dari
  // cloud oleh halaman peninjauan.
  "absensi_foto",
  "audit_absensi",
  "desktop_client_identity",
  "desktop_credential_alias",
  "desktop_credential_index",
  "desktop_device_identity",
  "desktop_entity_revision",
  "desktop_login_rate_limit",
  "desktop_schema_migration",
  "desktop_security_audit",
  "desktop_sync_conflict",
  "desktop_sync_cursor",
  "desktop_sync_outbox",
  "desktop_sync_table_cursor",
].sort();

// Tabel DDL cloud (turso.rs) yang memang TIDAK ikut snapshot sync:
// RBAC, sesi, bookkeeping sync, dan jejak audit yang hidup hanya di server.
const expectedCloudOnlyTables = [
  // Lihat catatan pada expectedLocalOnlyTables: foto tidak pernah ikut snapshot.
  "absensi_foto",
  "app_bootstrap_state",
  "app_mail_config",
  "app_permission",
  "app_role",
  "app_session",
  "audit_absensi",
  "auth_login_rate_limit",
  "master_operator",
  "password_reset_request",
  "role_permission",
  "role_permission_audit",
  "schema_migration",
  "sync_change_log",
  "sync_changelog",
  "sync_operation_receipt",
  "sync_pulse",
].sort();

// Kolom DDL yang sengaja tidak didaftarkan pada SNAPSHOT_TABLES.columns.
// Kunci = nama tabel, nilai = kolom yang boleh absen dari registry sync.
const expectedUnsyncedColumns: Record<string, string[]> = {
  // Surrogate PK AUTOINCREMENT lokal; identitas lintas perangkat memakai entity_column.
  absensi_harian: ["id_absensi"],
  id_card: ["id_card_id"],
  import_offline: ["id_import"],
  koreksi_admin: ["id_koreksi"],
  // Timestamp yang diisi server lewat DEFAULT (datetime('now')).
  bpjs_rules: ["created_at"],
  payroll_components: ["created_at"],
  tax_rules: ["created_at"],
};

// Command yang dipanggil gateway bersama tetapi SENGAJA tidak didaftarkan di
// build Mobile. Dulu berisi 23 command administrasi payroll; sejak 2026-09-11
// modul itu disalin ke `mobile/payroll_admin/` oleh `sync-rust-modules.ts` dan
// didaftarkan, sehingga daftarnya kosong. Isi hanya bila sebuah command memang
// tidak boleh ada di Mobile — daftar yang basi membuat audit ini gagal.
const expectedMobileOnlyUnregisteredCommands: string[] = [];

/**
 * Indeks yang memakai kolom hasil `ensure_column` tidak boleh berada di dalam
 * pipeline DDL: pada database cloud yang sudah ada, kolomnya belum ada saat
 * pipeline berjalan, satu statement yang gagal membatalkan seluruh pipeline,
 * dan `ensure_column` yang justru menambahkan kolom itu tidak pernah sempat
 * dieksekusi. Database lama akan terkunci selamanya.
 */
function assertIndexAfterColumn(
  label: string,
  source: string,
  indexName: string,
  addColumnSql: string,
) {
  const indexAt = source.indexOf(indexName);
  const columnAt = source.indexOf(addColumnSql);
  if (indexAt < 0 || columnAt < 0) {
    fail(`${label}: ${indexName} atau "${addColumnSql}" tidak ditemukan.`);
    return;
  }
  if (indexAt < columnAt) {
    fail(
      `${label}: ${indexName} dibuat sebelum kolomnya ditambahkan ` +
        `("${addColumnSql}"). Pindahkan pembuatan indeks ke setelah loop ensure_column.`,
    );
  }
}

function fail(message: string) {
  errors.push(message);
}

function read(relativePath: string) {
  const path = resolve(projectRoot, relativePath);
  if (!existsSync(path)) {
    fail(`File wajib tidak ditemukan: ${relativePath}`);
    return "";
  }
  return readFileSync(path, "utf8");
}

function sameSet(label: string, actual: Iterable<string>, expected: string[]) {
  const normalized = [...new Set(actual)].sort();
  if (JSON.stringify(normalized) !== JSON.stringify(expected)) {
    fail(`${label} drift. Aktual=[${normalized.join(", ")}]`);
  }
}

function canonicalRoutes(source: string) {
  const block = source.match(
    /const CANONICAL_SYNC_ROUTES:[\s\S]*?=\s*&\[([\s\S]*?)\n\];/,
  )?.[1];
  if (!block) return [];
  return [...block.matchAll(/\("([^"]+)",\s*"([^"]+)"\)/g)].map(
    (match) => `${match[1]}/${match[2]}`,
  );
}

function schemaRoutes(source: string) {
  return [...source.matchAll(/eventSchema\(\s*"([^"]+)"\s*,\s*"([^"]+)"/g)].map(
    (match) => `${match[1]}/${match[2]}`,
  );
}

function snapshotBlock(source: string) {
  return (
    source
      .match(/const SNAPSHOT_TABLES:[\s\S]*?=\s*&\[([\s\S]*?)\n\];/)?.[1]
      ?.replace(/\s+/g, " ")
      .trim() ?? ""
  );
}

function snapshotTriples(source: string) {
  const block = snapshotBlock(source);
  return [...block.matchAll(/payload_key:\s*"([^"]+)"[\s\S]*?domain:\s*"([^"]+)"[\s\S]*?table:\s*"([^"]+)"/g)].map(
    (match) => `${match[1]}|${match[2]}|${match[3]}`,
  );
}

function snapshotDefinitions(source: string) {
  const block = source.match(
    /const SNAPSHOT_TABLES:[\s\S]*?=\s*&\[([\s\S]*?)\n\];/,
  )?.[1];
  if (!block) return [];
  return [...block.matchAll(/SnapshotTable\s*\{([\s\S]*?)\n\s*\},/g)].map(
    (match) => {
      const definition = match[1];
      return {
        table: definition.match(/table:\s*"([^"]+)"/)?.[1] ?? "",
        columns: [
          ...(
            definition.match(/columns:\s*&\[([\s\S]*?)\],\s*conflict_column/)?.[1] ??
            ""
          ).matchAll(/"([^"]+)"/g),
        ].map((column) => column[1]),
      };
    },
  );
}

function ddlColumns(source: string, table: string) {
  const escaped = table.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const body = source.match(
    new RegExp(`CREATE TABLE IF NOT EXISTS\\s+${escaped}\\s*\\(([\\s\\S]*?)\\);`),
  )?.[1];
  if (!body) return [];
  return body
    .split(",")
    .map((part) => part.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\s+/)?.[1] ?? "")
    .filter(
      (column) =>
        column.length > 0 &&
        !["PRIMARY", "FOREIGN", "UNIQUE", "CHECK", "CONSTRAINT"].includes(
          column.toUpperCase(),
        ),
    );
}

function registeredCommands(libSource: string) {
  const block = libSource.match(
    /invoke_handler\(tauri::generate_handler!\[([\s\S]*?)\n\s*\]\)/,
  )?.[1];
  if (!block) return [];
  return [
    ...block.matchAll(/([a-z_][a-z0-9_]*(?:::[a-z_][a-z0-9_]*)+)\s*,/g),
  ].map((match) => match[1]);
}

function definedCommands(source: string) {
  return [
    ...source.matchAll(
      /#\[tauri::command\][\s\S]{0,200}?\bfn\s+([a-z_][a-z0-9_]*)/g,
    ),
  ].map((match) => match[1]);
}

function invokedCommands(source: string) {
  // Parameter generik boleh bersarang (mis. `Omit<Foo, "bar">`), jadi pola
  // `<[^>]*>` yang lama diam-diam melewatkan pemanggilan seperti itu.
  return [
    ...source.matchAll(/invokeDesktop(?:<[\s\S]*?>)?\(\s*"([a-z0-9_]+)"/g),
  ].map((match) => match[1]);
}

/**
 * Potong isi blok `if (isMobileRuntime()) { ... }` dari sebuah badan fungsi.
 *
 * Dipakai untuk memisahkan jalur khusus Mobile dari jalur Desktop/Web di dalam
 * gateway bersama, sehingga audit tahu command mana yang benar-benar dipanggil
 * pada tiap build.
 */
function splitMobileBranch(body: string) {
  let mobileRegion = "";
  let otherRegion = "";
  let cursor = 0;
  const guard = /if\s*\(\s*isMobileRuntime\(\)\s*\)\s*\{/g;
  let match = guard.exec(body);
  while (match) {
    otherRegion += body.slice(cursor, match.index);
    let depth = 1;
    let index = match.index + match[0].length;
    while (index < body.length && depth > 0) {
      if (body[index] === "{") depth++;
      else if (body[index] === "}") depth--;
      index++;
    }
    mobileRegion += body.slice(match.index, index);
    cursor = index;
    guard.lastIndex = index;
    match = guard.exec(body);
  }
  otherRegion += body.slice(cursor);
  return { mobileRegion, otherRegion };
}

/**
 * Peta fungsi gateway -> potongan kode yang benar-benar dieksekusi pada satu build.
 *
 * Kalau sebuah fungsi punya cabang `isMobileRuntime()` yang langsung `return`,
 * maka pada build Mobile hanya cabang itulah yang jalan; sisa badan fungsi
 * adalah kode mati di sana dan tidak boleh ikut diaudit.
 */
function gatewayRegions(source: string, workspace: "web-desktop" | "mobile") {
  const lines = source.split("\n");
  const starts: { name: string; line: number }[] = [];
  lines.forEach((line, index) => {
    const match = line.match(/^(?:export )?(?:async )?function ([A-Za-z_]\w*)/);
    if (match) starts.push({ name: match[1], line: index });
  });
  const regions = new Map<string, string>();
  for (let i = 0; i < starts.length; i++) {
    const end = i + 1 < starts.length ? starts[i + 1].line : lines.length;
    const body = lines.slice(starts[i].line, end).join("\n");
    const { mobileRegion, otherRegion } = splitMobileBranch(body);
    if (workspace === "mobile") {
      regions.set(
        starts[i].name,
        mobileRegion.includes("return") ? mobileRegion : body,
      );
    } else {
      regions.set(starts[i].name, otherRegion);
    }
  }
  return regions;
}

function ddlTables(source: string) {
  return [
    ...new Set(
      [
        ...source.matchAll(
          /CREATE TABLE IF NOT EXISTS\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g,
        ),
      ].map((match) => match[1]),
    ),
  ].sort();
}

function producedRoutes(directory: string) {
  const routes: string[] = [];
  for (const filename of [
    "operational.rs",
    "administration.rs",
    "scanner.rs",
    "payroll/commands.rs",
  ]) {
    const path = resolve(directory, filename);
    if (!existsSync(path)) continue;
    const source = readFileSync(path, "utf8");
    for (const match of source.matchAll(
      /(?:sync::)?enqueue\([\s\S]{0,320}?\n\s*"([a-z0-9-]+)",\s*\n\s*"([a-z0-9-]+)"/g,
    )) {
      routes.push(`${match[1]}/${match[2]}`);
    }
  }
  return [...new Set(routes)].sort();
}

function walk(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).flatMap((entry) => {
    const path = resolve(directory, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const desktopSync = read("web-desktop/src-tauri/src/desktop/sync.rs");
const mobileSync = read("mobile/src-tauri/src/mobile/sync.rs");
const desktopTurso = read("web-desktop/src-tauri/src/desktop/turso.rs");
const mobileTurso = read("mobile/src-tauri/src/mobile/turso.rs");

for (const [label, source] of [
  ["turso.rs web-desktop", desktopTurso],
  ["turso.rs mobile", mobileTurso],
] as const) {
  assertIndexAfterColumn(
    label,
    source,
    "idx_master_operator_email",
    "ALTER TABLE master_operator ADD COLUMN email TEXT;",
  );
}
const desktopSchema = read(
  "web-desktop/src/lib/server/operational/sync-schema.ts",
);
const mobileSchema = read("mobile/src/lib/server/operational/sync-schema.ts");
const desktopStorage = read("web-desktop/src-tauri/src/desktop/storage.rs");
const mobileStorage = read("mobile/src-tauri/src/mobile/storage.rs");
const desktopDbSchema = read("web-desktop/src/lib/db-schema.ts");
const desktopConfig = read("web-desktop/src-tauri/src/desktop/config.rs");
const mobileConfig = read("mobile/src-tauri/src/mobile/config.rs");

sameSet("Route kanonik Rust desktop", canonicalRoutes(desktopSync), expectedRoutes);
sameSet("Route kanonik Rust mobile", canonicalRoutes(mobileSync), expectedRoutes);

for (const [label, routes] of [
  ["Validator TypeScript desktop", schemaRoutes(desktopSchema)],
  ["Validator TypeScript mobile", schemaRoutes(mobileSchema)],
] as const) {
  const missing = expectedRoutes.filter((route) => !routes.includes(route));
  if (missing.length > 0) fail(`${label} kehilangan route: ${missing.join(", ")}`);
}

sameSet(
  "Snapshot triple desktop",
  snapshotTriples(desktopSync),
  expectedSnapshotTriples,
);
sameSet(
  "Snapshot triple mobile",
  snapshotTriples(mobileSync),
  expectedSnapshotTriples,
);
if (snapshotBlock(desktopSync) !== snapshotBlock(mobileSync)) {
  fail("Definisi SNAPSHOT_TABLES desktop dan mobile tidak identik.");
}

const desktopProduced = producedRoutes(
  resolve(projectRoot, "web-desktop/src-tauri/src/desktop"),
);
const mobileProduced = producedRoutes(
  resolve(projectRoot, "mobile/src-tauri/src/mobile"),
);
// Domain yang secara sengaja hanya ditulis dari Desktop (mis. payroll: Desktop CRUD
// penuh, Mobile hanya baca slip lewat pull snapshot, tidak pernah enqueue outbox).
const desktopOnlyProducerDomains = ["payroll"];
const desktopProducedShared = desktopProduced.filter(
  (route) => !desktopOnlyProducerDomains.includes(route.split("/")[0]),
);
if (JSON.stringify(desktopProducedShared) !== JSON.stringify(mobileProduced)) {
  fail("Producer route desktop dan mobile tidak identik.");
}
for (const route of mobileProduced) {
  if (desktopOnlyProducerDomains.includes(route.split("/")[0])) {
    fail(`Mobile memproduksi route domain desktop-only: ${route}`);
  }
}
for (const route of [...desktopProduced, ...mobileProduced]) {
  if (!expectedRoutes.includes(route)) fail(`Producer memakai route non-kanonik: ${route}`);
}

for (const [label, syncSource, storageSource, cloudSource] of [
  ["desktop", desktopSync, desktopStorage, desktopTurso],
  ["mobile", mobileSync, mobileStorage, mobileTurso],
] as const) {
  for (const definition of snapshotDefinitions(syncSource)) {
    if (!definition.table || definition.columns.length === 0) {
      fail(`Definisi snapshot ${label} tidak dapat diparsing.`);
      continue;
    }
    const localColumns = ddlColumns(storageSource, definition.table);
    const cloudColumns = ddlColumns(cloudSource, definition.table);
    for (const column of definition.columns) {
      if (!localColumns.includes(column)) {
        fail(`Kolom lokal ${label} hilang: ${definition.table}.${column}`);
      }
      if (!cloudColumns.includes(column)) {
        fail(`Kolom Turso ${label} hilang: ${definition.table}.${column}`);
      }
    }

    // Arah balik: kolom yang sudah ada di DDL tetapi belum didaftarkan ke
    // SNAPSHOT_TABLES tidak akan pernah ikut push maupun pull — data diam-diam
    // hilang antar perangkat. Wajib terdaftar, atau eksplisit dikecualikan.
    const allowed = expectedUnsyncedColumns[definition.table] ?? [];
    for (const [origin, columns] of [
      ["lokal", localColumns],
      ["Turso", cloudColumns],
    ] as const) {
      for (const column of columns) {
        if (definition.columns.includes(column) || allowed.includes(column)) {
          continue;
        }
        fail(
          `Kolom ${origin} ${label} belum terdaftar di SNAPSHOT_TABLES: ${definition.table}.${column}. ` +
            "Daftarkan ke SNAPSHOT_TABLES.columns, atau catat di expectedUnsyncedColumns bila memang tidak disinkronkan.",
        );
      }
    }
  }

  // Tabel baru di DDL yang lupa didaftarkan ke SNAPSHOT_TABLES adalah penyebab
  // klasik "data tidak ikut sync". Setiap tabel wajib masuk snapshot, atau
  // tercatat eksplisit sebagai tabel yang memang tidak disinkronkan.
  const snapshotTableNames = snapshotDefinitions(syncSource).map(
    (definition) => definition.table,
  );
  for (const [origin, source, allowlist] of [
    ["lokal", storageSource, expectedLocalOnlyTables],
    ["Turso", cloudSource, expectedCloudOnlyTables],
  ] as const) {
    const tables = ddlTables(source);
    for (const table of tables) {
      if (snapshotTableNames.includes(table) || allowlist.includes(table)) {
        continue;
      }
      fail(
        `Tabel ${origin} ${label} belum terdaftar ke sync: ${table}. ` +
          "Tambahkan ke SNAPSHOT_TABLES, atau catat di daftar tabel non-sync bila memang lokal/server saja.",
      );
    }
    // Cegah daftar pengecualian membusuk: entri yang tabelnya sudah tidak ada
    // harus dibersihkan, supaya daftar ini tetap bisa dipercaya.
    for (const table of allowlist) {
      if (!tables.includes(table)) {
        fail(
          `Daftar tabel non-sync ${origin} ${label} basi: ${table} tidak lagi ada di DDL.`,
        );
      }
    }
  }
}

// Version gate hanya berguna kalau semua sisi menyebut angka yang sama.
{
  const serverVersion = Number(
    desktopDbSchema.match(/CURRENT_SCHEMA_VERSION\s*=\s*(\d+)/)?.[1] ?? Number.NaN,
  );
  if (Number.isNaN(serverVersion)) {
    fail("CURRENT_SCHEMA_VERSION tidak dapat dibaca dari db-schema.ts.");
  }
  for (const [label, source] of [
    ["desktop", desktopSync],
    ["mobile", mobileSync],
  ] as const) {
    const clientVersion = Number(
      source.match(/CLIENT_SCHEMA_VERSION:\s*i64\s*=\s*(\d+)/)?.[1] ?? Number.NaN,
    );
    if (Number.isNaN(clientVersion)) {
      fail(`CLIENT_SCHEMA_VERSION tidak ditemukan pada sync.rs ${label}.`);
      continue;
    }
    if (clientVersion !== serverVersion) {
      fail(
        `Versi skema drift: CLIENT_SCHEMA_VERSION ${label} = ${clientVersion}, ` +
          `CURRENT_SCHEMA_VERSION = ${serverVersion}.`,
      );
    }
  }
}

// Guard version gate harus tetap terpasang di jalur push.
for (const [label, source] of [
  ["desktop", desktopSync],
  ["mobile", mobileSync],
] as const) {
  for (const marker of [
    "assert_cloud_schema_compatible(&turso).await?;",
    "is_client_schema_outdated(cloud_version)",
  ]) {
    if (!source.includes(marker)) {
      fail(`Guard versi skema ${label} hilang: ${marker}`);
    }
  }
}

// Pengecualian kolom juga tidak boleh basi.
for (const [table, columns] of Object.entries(expectedUnsyncedColumns)) {
  const definition = snapshotDefinitions(desktopSync).find(
    (entry) => entry.table === table,
  );
  if (!definition) {
    fail(`expectedUnsyncedColumns basi: tabel ${table} bukan tabel snapshot.`);
    continue;
  }
  const ddl = [
    ...ddlColumns(desktopStorage, table),
    ...ddlColumns(desktopTurso, table),
  ];
  for (const column of columns) {
    if (!ddl.includes(column)) {
      fail(
        `expectedUnsyncedColumns basi: ${table}.${column} tidak lagi ada di DDL.`,
      );
    }
    if (definition.columns.includes(column)) {
      fail(
        `expectedUnsyncedColumns bertabrakan: ${table}.${column} sudah didaftarkan di SNAPSHOT_TABLES.`,
      );
    }
  }
}

for (const [label, source] of [
  ["desktop", desktopTurso],
  ["mobile", mobileTurso],
] as const) {
  for (const marker of [
    "BEGIN IMMEDIATE;",
    "ROLLBACK;",
    "sync_operation_receipt",
    "canonical_sync_route",
    "entity_key: &str",
    "mutations.is_empty()",
    "previous_route == Some((domain, operation))",
    "SELECT MAX(id) FROM sync_changelog",
    "Data server berubah setelah snapshot lokal dibuat.",
  ]) {
    if (!source.includes(marker)) fail(`Guard Turso ${label} hilang: ${marker}`);
  }
  const defaultPassword = source.indexOf('password: "admin123"');
  const testModule = source.indexOf("#[cfg(test)]");
  if (defaultPassword >= 0 && (testModule < 0 || defaultPassword < testModule)) {
    fail(`Kredensial default runtime ditemukan pada Turso ${label}.`);
  }
}

for (const [label, source] of [
  ["desktop", desktopConfig],
  ["mobile", mobileConfig],
] as const) {
  const releaseNone = source.match(
    /#\[cfg\(not\(debug_assertions\)\)\][\s\S]*?BUILD_TURSO_DATABASE_URL:[^=]+= None;[\s\S]*?#\[cfg\(not\(debug_assertions\)\)\][\s\S]*?BUILD_TURSO_AUTH_TOKEN:[^=]+= None;/,
  );
  if (!releaseNone) fail(`Release ${label} masih dapat mengompilasi token Turso.`);
}

for (const [label, source] of [
  ["desktop", desktopSync],
  ["mobile", mobileSync],
] as const) {
  for (const marker of [
    "is_canonical_sync_route(domain, operation)",
    "came_from_server",
    "desktop_entity_revision",
    "row_has_unsynced_change",
    // Push tetap wajib dijalankan lebih dulu di dalam `synchronize`, tetapi
    // kegagalannya sengaja TIDAK lagi membatalkan pull (lihat `push_error`):
    // satu event outbox bermasalah tidak boleh mematikan penerimaan data cloud.
    "push_outbox(state, token).await",
    "pull_snapshot(state, token).await",
  ]) {
    if (!source.includes(marker)) fail(`Guard sync ${label} hilang: ${marker}`);
  }
}

for (const relativePath of [
  "web-desktop/src/components/BootstrapPanel.tsx",
  "mobile/src/components/BootstrapPanel.tsx",
  "web-desktop/src/lib/gateways/bootstrap.ts",
  "mobile/src/lib/gateways/bootstrap.ts",
]) {
  read(relativePath);
}

for (const workspace of ["web-desktop", "mobile"]) {
  const sourceFiles = walk(resolve(projectRoot, workspace, "src")).filter((path) =>
    /\.(?:ts|tsx)$/.test(path),
  );
  for (const path of sourceFiles) {
    if (path.includes(".test.")) continue;
    if (readFileSync(path, "utf8").includes("admin123")) {
      fail(`admin123 ditemukan pada source runtime: ${path}`);
    }
  }
}

// ── Registrasi command Tauri ────────────────────────────────────────────────
// Tanpa cek ini, command yang terhapus (mis. karena sync-rust-modules.ts
// menimpa commands.rs dari web-desktop) baru ketahuan saat `cargo build`, dan
// Database Turso yang sama dibangun oleh DUA implementasi: `turso.rs`
// (provisioning dari Desktop/Mobile) dan `db-schema.ts` + `db-migrations.ts`
// (provisioning dari Web). Keduanya wajib menghasilkan tabel dan kolom yang
// sama; kalau tidak, database yang lahir dari satu jalur akan merusak jalur
// lain — dan `CREATE TABLE IF NOT EXISTS` tidak pernah memperbaikinya.
//
// Tabel di bawah sengaja hanya ada di satu sisi.
const expectedRustOnlyCloudTables = ["sync_pulse"];
const expectedWebOnlyCloudTables: string[] = [];

function cloudSchemaOf(source: string) {
  const tables: Record<string, Set<string>> = {};
  for (const table of source.matchAll(
    /CREATE TABLE IF NOT EXISTS\s+(\w+)\s*\(([\s\S]*?)\n\s*\)/g,
  )) {
    const [, name, body] = table;
    const columns: string[] = [];
    let depth = 0;
    let current = "";
    for (const character of body) {
      if (character === "(") depth++;
      if (character === ")") depth--;
      if (character === "," && depth === 0) {
        columns.push(current);
        current = "";
        continue;
      }
      current += character;
    }
    columns.push(current);
    tables[name] ??= new Set();
    for (const raw of columns) {
      const first = raw.trim().split(/\s+/)[0];
      if (
        /^\w+$/.test(first) &&
        !/^(PRIMARY|FOREIGN|UNIQUE|CHECK|CONSTRAINT)$/i.test(first)
      ) {
        tables[name].add(first);
      }
    }
  }
  for (const altered of source.matchAll(
    /ALTER TABLE\s+(\w+)\s+ADD COLUMN\s+(\w+)/gi,
  )) {
    tables[altered[1]] ??= new Set();
    tables[altered[1]].add(altered[2]);
  }
  return tables;
}

{
  const rustCloud = cloudSchemaOf(read("web-desktop/src-tauri/src/desktop/turso.rs"));
  const webCloud = cloudSchemaOf(
    `${read("web-desktop/src/lib/db-schema.ts")}\n${read("web-desktop/src/lib/db-migrations.ts")}`,
  );
  for (const table of [
    ...new Set([...Object.keys(rustCloud), ...Object.keys(webCloud)]),
  ].sort()) {
    const inRust = rustCloud[table] ?? new Set<string>();
    const inWeb = webCloud[table] ?? new Set<string>();
    if (inRust.size === 0) {
      if (!expectedWebOnlyCloudTables.includes(table)) {
        fail(
          `Tabel cloud '${table}' hanya dibuat jalur Web. Database hasil provisioning Desktop/Mobile akan kehilangan tabel ini.`,
        );
      }
      continue;
    }
    if (inWeb.size === 0) {
      if (!expectedRustOnlyCloudTables.includes(table)) {
        fail(
          `Tabel cloud '${table}' hanya dibuat jalur Desktop/Mobile. Database hasil provisioning Web akan kehilangan tabel ini.`,
        );
      }
      continue;
    }
    const missingInWeb = [...inRust].filter((column) => !inWeb.has(column));
    const missingInRust = [...inWeb].filter((column) => !inRust.has(column));
    if (missingInWeb.length) {
      fail(
        `Kolom cloud '${table}' ada di turso.rs tetapi tidak di db-migrations.ts: ${missingInWeb.join(", ")}.`,
      );
    }
    if (missingInRust.length) {
      fail(
        `Kolom cloud '${table}' ada di db-migrations.ts tetapi tidak di turso.rs: ${missingInRust.join(", ")}.`,
      );
    }
  }
  for (const table of expectedRustOnlyCloudTables) {
    if (webCloud[table]) {
      fail(`Daftar tabel khusus Rust basi: '${table}' kini juga dibuat jalur Web.`);
    }
  }

  // Sisi Web menganggap database "siap" hanya bila ke-31 tabel pada daftar
  // `isDatabaseSchemaReady` ada. Kalau provisioning dari Desktop/Mobile kurang
  // satu saja, Web akan terus menjalankan ulang `initDatabaseSchema` dan
  // fitur yang bergantung pada tabel itu gagal di runtime.
  const schemaSource = read("web-desktop/src/lib/db-schema.ts");
  const requiredList = schemaSource.match(
    /WHERE type = 'table' AND name IN \(([\s\S]*?)\)\s*\)\s*AS table_count/,
  )?.[1];
  if (!requiredList) {
    fail("Daftar tabel isDatabaseSchemaReady tidak dapat diparsing dari db-schema.ts.");
  } else {
    const requiredTables = [...requiredList.matchAll(/'(\w+)'/g)].map((m) => m[1]);
    const declaredCount = Number(
      schemaSource.match(/REQUIRED_TABLE_COUNT = (\d+)/)?.[1] ?? 0,
    );
    if (declaredCount !== requiredTables.length) {
      fail(
        `REQUIRED_TABLE_COUNT (${declaredCount}) tidak sama dengan jumlah tabel pada daftar isDatabaseSchemaReady (${requiredTables.length}).`,
      );
    }
    for (const [label, path] of [
      ["web-desktop", "web-desktop/src-tauri/src/desktop/turso.rs"],
      ["mobile", "mobile/src-tauri/src/mobile/turso.rs"],
    ] as const) {
      const created = new Set(
        [...read(path).matchAll(/CREATE TABLE IF NOT EXISTS\s+(\w+)/g)].map((m) => m[1]),
      );
      const missing = requiredTables.filter((table) => !created.has(table));
      if (missing.length) {
        fail(
          `Provisioning ${label} tidak membuat tabel yang diminta isDatabaseSchemaReady: ${missing.join(", ")}.`,
        );
      }
    }
  }
}

// ── Konvensi penamaan kontrak sync ─────────────────────────────────────────
//
// Tiga format hidup berdampingan dan tidak boleh tertukar:
//   snake_case  -> nama tabel dan kolom database
//   kebab-case  -> `domain` dan `operation` pada route kanonik
//   camelCase   -> `payload_key` snapshot dan field metadata event
// Salah format tidak memunculkan error — nilainya hanya diam-diam terbaca
// kosong di sisi penerima.
{
  const isSnake = (value: string) => /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/.test(value);
  const isKebab = (value: string) => /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(value);
  const isCamel = (value: string) =>
    /^[a-z][a-zA-Z0-9]*$/.test(value) && !value.includes("_") && !value.includes("-");

  for (const [label, source] of [
    ["desktop", desktopSync],
    ["mobile", mobileSync],
  ] as const) {
    for (const definition of source.matchAll(
      /SnapshotTable \{\s*payload_key: "([^"]+)",\s*domain: "([^"]+)",\s*table: "([^"]+)",\s*columns: &\[([\s\S]*?)\],\s*conflict_column: "([^"]+)",\s*entity_column: "([^"]+)"/g,
    )) {
      const [, payloadKey, domain, table, columnBlock, conflictColumn, entityColumn] = definition;
      if (!isCamel(payloadKey)) {
        fail(`payload_key ${label} bukan camelCase: "${payloadKey}" (tabel ${table}).`);
      }
      if (!isKebab(domain)) {
        fail(`domain ${label} bukan kebab-case: "${domain}" (tabel ${table}).`);
      }
      if (!isSnake(table)) fail(`Nama tabel ${label} bukan snake_case: "${table}".`);
      const columns = [...columnBlock.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
      for (const column of columns) {
        if (!isSnake(column)) {
          fail(`Kolom ${label} bukan snake_case: ${table}.${column}.`);
        }
      }
      // conflict_column dan entity_column menunjuk kolom nyata; salah ketik di
      // sini membuat SQL upsert gagal saat runtime, bukan saat build.
      for (const key of conflictColumn.split(",").map((part) => part.trim())) {
        if (!columns.includes(key)) {
          fail(`conflict_column "${key}" tidak ada pada daftar columns ${label} ${table}.`);
        }
      }
      if (!columns.includes(entityColumn)) {
        fail(`entity_column "${entityColumn}" tidak ada pada daftar columns ${label} ${table}.`);
      }
    }
    for (const route of canonicalRoutes(source)) {
      const [domain, operation] = route.split("/");
      if (!isKebab(domain)) fail(`Domain route ${label} bukan kebab-case: "${domain}".`);
      if (!isKebab(operation)) {
        fail(`Operation route ${label} bukan kebab-case: "${operation}".`);
      }
    }
  }
}

// ── Katalog permission RBAC ────────────────────────────────────────────────
//
// Jalur Web menanam `app_permission` dari `PERMISSION_CATALOG`, sedangkan jalur
// Rust menuliskannya sebagai literal SQL. Keduanya WAJIB sama: seed Mobile
// pernah tertinggal lima permission payroll dan menanam dua permission yang
// tidak ada di katalog, sehingga database yang di-provisioning dari Mobile
// membuat permission itu mustahil diberikan (FOREIGN KEY ke `app_permission`)
// dan hilang diam-diam dari daftar permission Superadmin.
{
  const catalogKeys = [
    ...read("web-desktop/src/lib/rbac/catalog.ts").matchAll(
      /key: "([a-z][a-z0-9._]*)"/g,
    ),
  ]
    .map((match) => match[1])
    .sort();
  if (catalogKeys.length === 0) {
    fail("PERMISSION_CATALOG tidak dapat diparsing dari catalog.ts.");
  }
  for (const [label, source] of [
    ["desktop", desktopTurso],
    ["mobile", mobileTurso],
  ] as const) {
    const seedBlock = source.match(
      /INSERT OR IGNORE INTO app_permission[\s\S]*?VALUES([\s\S]*?);"#/,
    )?.[1];
    if (!seedBlock) {
      fail(`Seed app_permission ${label} tidak ditemukan di turso.rs.`);
      continue;
    }
    const seeded = [...seedBlock.matchAll(/\('([a-z][a-z0-9._]*)',/g)]
      .map((match) => match[1])
      .sort();
    sameSet(`Seed permission ${label} vs PERMISSION_CATALOG`, seeded, catalogKeys);
  }
}

// ── Guard prioritas absensi di jalur Turso ─────────────────────────────────
//
// `attendanceBaseUpdatedAt` dikirim client dan divalidasi `sync-schema.ts`,
// tetapi jalur Turso 2-tier dulu tidak pernah membacanya: scan terminal yang
// datang belakangan bisa menghapus Koreksi Admin, dan dua perangkat yang
// menyunting sesi sama saling menimpa tanpa jejak.
for (const [label, source] of [
  ["desktop", desktopTurso],
  ["mobile", mobileTurso],
] as const) {
  for (const marker of [
    // Definisi guard-nya ada...
    "fn assert_attendance_precondition(",
    // ...DAN benar-benar dipanggil sebelum mutasi disusun.
    "if let Err(error) = assert_attendance_precondition(",
    "fn attendance_session_of(",
    "attendanceBaseUpdatedAt",
    "TURSO_SYNC_ATTENDANCE_PROTECTED",
    "TURSO_SYNC_ATTENDANCE_STALE",
  ]) {
    if (!source.includes(marker)) {
      fail(
        `Guard prioritas absensi ${label} hilang dari turso.rs: ${marker}. ` +
          "Tanpa ini scan terminal dapat menimpa Koreksi Admin di cloud.",
      );
    }
  }
}

// ── Kesetaraan constraint antar layer ──────────────────────────────────────
//
// Dua invarian yang dijaga di sini:
//
// 1. DDL cloud versi Rust dan versi Web WAJIB identik — keduanya membangun
//    database Turso yang sama. `receipt_json NOT NULL` tanpa DEFAULT di Rust
//    pernah membuat INSERT receipt dari Web gagal, dan `server_revision NOT NULL`
//    menolak nilai NULL yang sah untuk event rejected/conflict.
//
// 2. SQLite lokal TIDAK BOLEH lebih ketat daripada cloud. Tabel lokal menelan
//    apa pun yang ada di cloud lewat `apply_table`; satu baris cloud yang
//    melanggar CHECK lokal menggagalkan SELURUH transaksi snapshot, sehingga
//    sinkronisasi mati total di setiap perangkat.
type ParsedColumn = {
  type: string;
  notNull: boolean;
  unique: boolean;
  primaryKey: boolean;
  check: string | null;
  hasDefault: boolean;
};
type ParsedTable = {
  columns: Record<string, ParsedColumn>;
  primaryKey: string[];
  tableUnique: string[][];
};

function parseDdl(source: string): Record<string, ParsedTable> {
  const tables: Record<string, ParsedTable> = {};
  for (const match of source.matchAll(
    /CREATE TABLE IF NOT EXISTS\s+(\w+)\s*\(([\s\S]*?)\n\s*\)\s*;/g,
  )) {
    const [, name, body] = match;
    const parts: string[] = [];
    let depth = 0;
    let current = "";
    for (const character of body) {
      if (character === "(") depth++;
      if (character === ")") depth--;
      if (character === "," && depth === 0) {
        parts.push(current);
        current = "";
        continue;
      }
      current += character;
    }
    parts.push(current);
    const table: ParsedTable = { columns: {}, primaryKey: [], tableUnique: [] };
    for (const raw of parts) {
      const text = raw.trim();
      if (!text) continue;
      const upper = text.toUpperCase();
      if (upper.startsWith("PRIMARY KEY")) {
        table.primaryKey = [...text.matchAll(/\w+/g)]
          .map((word) => word[0])
          .filter((word) => !/^(PRIMARY|KEY)$/i.test(word));
        continue;
      }
      if (upper.startsWith("UNIQUE")) {
        table.tableUnique.push(
          (text.match(/\(([^)]*)\)/)?.[1] ?? "").split(",").map((s) => s.trim()),
        );
        continue;
      }
      if (/^(FOREIGN|CHECK|CONSTRAINT)/i.test(upper)) continue;
      const header = text.match(/^(\w+)\s+(\w+)/);
      if (!header) continue;
      const check = text.match(/CHECK\s*\(([\s\S]*)\)/i);
      table.columns[header[1]] = {
        type: header[2].toUpperCase(),
        notNull: /\bNOT\s+NULL\b/i.test(text),
        unique: /\bUNIQUE\b/i.test(text),
        primaryKey: /\bPRIMARY\s+KEY\b/i.test(text),
        check: check ? check[1].replace(/\s+/g, " ").trim() : null,
        hasDefault: /\bDEFAULT\b/i.test(text),
      };
      if (/\bPRIMARY\s+KEY\b/i.test(text)) table.primaryKey = [header[1]];
    }
    tables[name] = table;
  }
  return tables;
}

{
  const localDdl = parseDdl(read("web-desktop/src-tauri/src/desktop/storage.rs"));
  const cloudRustDdl = parseDdl(read("web-desktop/src-tauri/src/desktop/turso.rs"));
  const cloudWebDdl = parseDdl(
    `${read("web-desktop/src/lib/db-schema.ts")}\n${read("web-desktop/src/lib/db-migrations.ts")}`,
  );

  // Invarian 1: kedua DDL cloud identik.
  for (const table of Object.keys(cloudRustDdl).sort()) {
    const web = cloudWebDdl[table];
    const rust = cloudRustDdl[table];
    if (!web) continue; // sudah ditangani pemeriksaan tabel satu sisi di atas
    for (const column of Object.keys(rust.columns).sort()) {
      const rustColumn = rust.columns[column];
      const webColumn = web.columns[column];
      if (!webColumn) continue; // ditangani pemeriksaan kolom satu sisi di atas
      for (const property of ["notNull", "unique", "primaryKey", "hasDefault"] as const) {
        if (rustColumn[property] !== webColumn[property]) {
          fail(
            `Constraint cloud '${table}.${column}.${property}' berbeda: turso.rs=${rustColumn[property]}, db-migrations.ts=${webColumn[property]}. ` +
              "Keduanya membangun database Turso yang sama.",
          );
        }
      }
      if ((rustColumn.check ?? "") !== (webColumn.check ?? "")) {
        fail(
          `CHECK cloud '${table}.${column}' berbeda: turso.rs=${rustColumn.check ?? "-"}, db-migrations.ts=${webColumn.check ?? "-"}.`,
        );
      }
    }
    if (rust.primaryKey.join("+") !== web.primaryKey.join("+")) {
      fail(
        `PRIMARY KEY cloud '${table}' berbeda: turso.rs=[${rust.primaryKey.join(", ")}], db-migrations.ts=[${web.primaryKey.join(", ")}].`,
      );
    }
    const rustUnique = rust.tableUnique.map((u) => u.join("+")).sort();
    const webUnique = web.tableUnique.map((u) => u.join("+")).sort();
    if (JSON.stringify(rustUnique) !== JSON.stringify(webUnique)) {
      fail(
        `UNIQUE(tabel) cloud '${table}' berbeda: turso.rs=${JSON.stringify(rustUnique)}, db-migrations.ts=${JSON.stringify(webUnique)}.`,
      );
    }
  }

  // Invarian 2: lokal tidak boleh lebih ketat daripada cloud.
  for (const table of Object.keys(localDdl).sort()) {
    const cloud = cloudRustDdl[table];
    if (!cloud) continue; // tabel lokal murni
    for (const column of Object.keys(localDdl[table].columns).sort()) {
      const localColumn = localDdl[table].columns[column];
      const cloudColumn = cloud.columns[column];
      if (!cloudColumn) continue;
      if (localColumn.check && localColumn.check !== cloudColumn.check) {
        fail(
          `SQLite lokal lebih ketat daripada cloud pada '${table}.${column}': lokal CHECK (${localColumn.check}), cloud CHECK (${cloudColumn.check ?? "-"}). ` +
            "Satu baris cloud yang melanggar akan menggagalkan seluruh apply snapshot.",
        );
      }
      if (localColumn.notNull && !cloudColumn.notNull && !localColumn.hasDefault) {
        fail(
          `SQLite lokal lebih ketat daripada cloud pada '${table}.${column}': lokal NOT NULL tanpa DEFAULT, cloud mengizinkan NULL.`,
        );
      }
      if (localColumn.unique && !cloudColumn.unique) {
        fail(
          `SQLite lokal lebih ketat daripada cloud pada '${table}.${column}': lokal UNIQUE, cloud tidak. Duplikat dari cloud akan menggagalkan apply snapshot.`,
        );
      }
    }
  }
}

// Tarif default payroll wajib berasal dari satu berkas untuk lokal dan cloud.
// Dulu seed ditulis dua kali: `storage.rs` memakai id bertanda hubung sedangkan
// `turso.rs` memakai garis bawah dengan tarif berbeda, sehingga baris lokal ikut
// terdorong ke cloud — bracket PASAL_17 dobel dan push BPJS selalu gagal karena
// `component_code` UNIQUE bentrok.
for (const [workspace, rootModule] of [
  ["web-desktop", "desktop"],
  ["mobile", "mobile"],
] as const) {
  const seedPath = `${workspace}/src-tauri/src/${rootModule}/payroll_seed.rs`;
  const seed = read(seedPath);
  for (const constant of [
    "OVERTIME_TIER_RULES_SEED_SQL",
    "TAX_RULES_SEED_SQL",
    "BPJS_RULES_SEED_SQL",
    "DEFAULT_RATE_IDS",
    "LEGACY_RATE_IDS",
  ]) {
    if (!seed.includes(`pub const ${constant}`)) {
      fail(`Konstanta seed tarif hilang di ${seedPath}: ${constant}`);
    }
  }
  for (const file of ["storage.rs", "turso.rs"]) {
    const source = read(`${workspace}/src-tauri/src/${rootModule}/${file}`);
    for (const table of ["tax_rules", "bpjs_rules", "overtime_tier_rules"]) {
      if (source.includes(`INSERT OR IGNORE INTO ${table} (id`)) {
        fail(
          `Seed tarif ditulis ulang di ${workspace}/${file} untuk ${table}. ` +
            "Pakai konstanta di payroll_seed.rs agar lokal dan cloud tidak pernah berbeda.",
        );
      }
    }
    if (!source.includes("payroll_seed::")) {
      fail(`${workspace}/${file} tidak memakai payroll_seed sebagai sumber tarif default.`);
    }
  }
}

// Seed lokal dan seed cloud sekarang berbagi berkas, jadi cukup dibandingkan
// antar workspace supaya Desktop dan Mobile tidak pernah menyimpang.
if (
  read("web-desktop/src-tauri/src/desktop/payroll_seed.rs") !==
  read("mobile/src-tauri/src/mobile/payroll_seed.rs")
) {
  fail(
    "payroll_seed.rs Desktop dan Mobile berbeda. Salin ulang berkasnya agar tarif default identik.",
  );
}

// command yang tidak terdaftar baru ketahuan saat pengguna menekan tombolnya.
let commandNotes = "";
for (const [workspace, rootModule] of [
  ["web-desktop", "desktop"],
  ["mobile", "mobile"],
] as const) {
  const rustRoot = resolve(projectRoot, workspace, "src-tauri/src");
  const libPath = resolve(rustRoot, "lib.rs");
  if (!existsSync(libPath)) {
    fail(`File wajib tidak ditemukan: ${workspace}/src-tauri/src/lib.rs`);
    continue;
  }
  const registeredPaths = registeredCommands(readFileSync(libPath, "utf8"));
  if (registeredPaths.length === 0) {
    fail(`generate_handler! ${workspace} tidak dapat diparsing.`);
    continue;
  }
  const registered = registeredPaths.map((path) => path.split("::").at(-1) as string);

  // 1. Setiap entri generate_handler! harus benar-benar ada fungsinya.
  for (const path of registeredPaths) {
    const segments = path.split("::");
    const fn = segments.pop() as string;
    if (segments[0] !== rootModule) {
      fail(`Command ${workspace} memakai root modul tak dikenal: ${path}`);
      continue;
    }
    // Segmen root ikut dipakai: `desktop::commands` ada di `src/desktop/commands.rs`.
    const relative = segments.join("/");
    const file = [
      resolve(rustRoot, `${relative}.rs`),
      resolve(rustRoot, relative, "mod.rs"),
    ].find((candidate) => existsSync(candidate));
    if (!file) {
      fail(`Modul command ${workspace} tidak ditemukan: ${path}`);
      continue;
    }
    if (!definedCommands(readFileSync(file, "utf8")).includes(fn)) {
      fail(
        `Command ${workspace} terdaftar tetapi fungsinya tidak ada: ${path}. ` +
          "Kemungkinan terhapus saat sinkronisasi modul Rust dari web-desktop.",
      );
    }
  }

  // 2. Command yang ditulis tetapi tidak didaftarkan tidak akan pernah bisa
  //    dipanggil frontend — gagal saat runtime, bukan saat build.
  const rustFiles = walk(rustRoot).filter((path) => path.endsWith(".rs"));
  const defined = new Map<string, string>();
  for (const file of rustFiles) {
    for (const fn of definedCommands(readFileSync(file, "utf8"))) {
      defined.set(fn, file);
    }
  }
  for (const [fn, file] of defined) {
    if (!registered.includes(fn)) {
      fail(
        `Command ${workspace} tidak terdaftar di generate_handler!: ${fn} ` +
          `(${file.replace(projectRoot, "").replace(/\\/g, "/")})`,
      );
    }
  }

  // 3. Nama command yang dipanggil frontend harus terdaftar.
  const tsFiles = walk(resolve(projectRoot, workspace, "src")).filter((path) =>
    /\.(?:ts|tsx)$/.test(path),
  );
  const invoked = new Set<string>();
  for (const file of tsFiles) {
    const source = readFileSync(file, "utf8");
    for (const fn of invokedCommands(source)) invoked.add(fn);
    // Nama command non-literal membuat cek di atas bisa dilewati diam-diam.
    // Satu-satunya pengecualian adalah helper invokeDesktop itu sendiri.
    if (
      !file.replace(/\\/g, "/").endsWith("lib/runtime/desktop-commands.ts") &&
      /invokeDesktop(?:<[^>]*>)?\(\s*[^"\s)]/.test(source)
    ) {
      fail(
        `Nama command non-literal pada ${workspace}: ` +
          `${file.replace(projectRoot, "").replace(/\\/g, "/")}. ` +
          "Pakai string literal agar dapat diaudit.",
      );
    }
  }
  const allowedUnregistered =
    workspace === "mobile" ? expectedMobileOnlyUnregisteredCommands : [];
  for (const fn of invoked) {
    if (registered.includes(fn) || allowedUnregistered.includes(fn)) continue;
    // Command berawalan `mobile_` hanya dipanggil di balik `isMobileRuntime()`
    // pada gateway bersama, jadi wajar tidak terdaftar di build Desktop/Web.
    // Keterjangkauannya di Mobile dijamin pemeriksaan (4) di bawah.
    if (workspace === "web-desktop" && fn.startsWith("mobile_")) continue;
    fail(`Frontend ${workspace} memanggil command tak terdaftar: ${fn}`);
  }
  // Daftar pengecualian tidak boleh membusuk.
  for (const fn of allowedUnregistered) {
    if (registered.includes(fn)) {
      fail(
        `Daftar command desktop-only basi: ${fn} kini terdaftar di ${workspace}.`,
      );
    } else if (!invoked.has(fn)) {
      fail(
        `Daftar command desktop-only basi: ${fn} tidak lagi dipanggil di ${workspace}.`,
      );
    }
  }

  // 4. Daftar pengecualian di atas hanya boleh menutupi command yang MEMANG
  //    tidak pernah dijangkau UI workspace ini. Kalau sebuah halaman benar-benar
  //    memanggilnya, layarnya rusak saat dibuka — persis yang pernah terjadi
  //    pada slip gaji Mobile: gateway bersama memanggil command administrasi
  //    payroll yang tidak pernah didaftarkan di binary Mobile.
  const gatewayDir = resolve(projectRoot, workspace, "src/lib/gateways");
  const gatewayRegionsByFile = new Map<string, Map<string, string>>();
  for (const file of walk(gatewayDir)) {
    if (!file.endsWith(".ts") || file.includes(".test.")) continue;
    gatewayRegionsByFile.set(
      file,
      gatewayRegions(readFileSync(file, "utf8"), workspace),
    );
  }

  const reachableCommands = (
    file: string,
    name: string,
    seen: Set<string>,
  ): string[] => {
    const key = `${file}#${name}`;
    if (seen.has(key)) return [];
    seen.add(key);
    const region = gatewayRegionsByFile.get(file)?.get(name);
    if (region === undefined) return [];
    const found = invokedCommands(region);
    for (const call of region.matchAll(/\b([A-Za-z_]\w*)\s*\(/g)) {
      if (!gatewayRegionsByFile.get(file)?.has(call[1])) continue;
      found.push(...reachableCommands(file, call[1], seen));
    }
    return found;
  };

  const uiFiles = [
    ...walk(resolve(projectRoot, workspace, "src/app")),
    ...walk(resolve(projectRoot, workspace, "src/components")),
  ].filter((path) => /\.tsx?$/.test(path) && !path.includes(".test."));

  for (const uiFile of uiFiles) {
    const source = readFileSync(uiFile, "utf8");
    for (const importMatch of source.matchAll(
      /import\s*\{([\s\S]*?)\}\s*from\s*"@\/lib\/gateways\/([\w-]+)"/g,
    )) {
      const gatewayFile = resolve(gatewayDir, `${importMatch[2]}.ts`);
      if (!gatewayRegionsByFile.has(gatewayFile)) continue;
      const imported = importMatch[1]
        .split(",")
        .map((entry) => entry.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0])
        .filter((entry) => /^[A-Za-z_]\w*$/.test(entry));
      for (const name of imported) {
        for (const command of reachableCommands(gatewayFile, name, new Set())) {
          if (registered.includes(command)) continue;
          fail(
            `UI ${workspace} menjangkau command tak terdaftar: ${command} ` +
              `(lewat ${importMatch[2]}.ts#${name}, dipakai ${uiFile.replace(projectRoot, "").split("\\").join("/")}).`,
          );
        }
      }
    }
  }

  // 5. Terdaftar di generate_handler! belum berarti bisa dipanggil: Tauri v2
  //    masih menolak command yang tidak ada di allowlist ACL, dengan pesan
  //    "not allowed by ACL" yang hanya muncul saat runtime. Pemeriksaan (1)-(4)
  //    di atas semuanya hijau untuk command yang lupa didaftarkan di sini.
  const capabilityPath = resolve(
    projectRoot,
    workspace,
    "src-tauri/capabilities/default.json",
  );
  if (!existsSync(capabilityPath)) {
    fail(
      `File wajib tidak ditemukan: ${workspace}/src-tauri/capabilities/default.json`,
    );
  } else {
    let allowed: Set<string> | null = null;
    try {
      const parsed = JSON.parse(readFileSync(capabilityPath, "utf8")) as {
        permissions?: unknown;
      };
      if (!Array.isArray(parsed.permissions)) {
        fail(`capabilities/default.json ${workspace}: "permissions" bukan array.`);
      } else {
        allowed = new Set(
          parsed.permissions.filter(
            (entry): entry is string =>
              typeof entry === "string" && entry.startsWith("allow-"),
          ),
        );
      }
    } catch (error) {
      fail(
        `capabilities/default.json ${workspace} tidak dapat diparsing: ${String(error)}`,
      );
    }
    if (allowed) {
      // Tauri menurunkan identifier izin dari nama command: snake_case -> kebab-case.
      const permissionOf = (command: string) =>
        `allow-${command.replace(/_/g, "-")}`;
      for (const fn of registered) {
        if (allowed.has(permissionOf(fn))) continue;
        fail(
          `Command ${workspace} tidak diizinkan ACL: ${fn}. ` +
            `Tambahkan "${permissionOf(fn)}" ke capabilities/default.json.`,
        );
      }
      const knownPermissions = new Set(registered.map(permissionOf));
      for (const permission of allowed) {
        if (knownPermissions.has(permission)) continue;
        fail(
          `Izin ACL basi di ${workspace}: ${permission} tidak cocok dengan ` +
            "command mana pun di generate_handler!.",
        );
      }
    }
  }

  // 6. Tauri membangun berkas izin dari daftar command di `build.rs`, BUKAN dari
  //    `generate_handler!`. Command yang lupa didaftarkan di sana membuat
  //    `tauri_build` gagal dengan "Permission allow-... not found" — build
  //    berhenti total, dan pesannya tidak menyebut build.rs sama sekali.
  const buildPath = resolve(projectRoot, workspace, "src-tauri/build.rs");
  if (!existsSync(buildPath)) {
    fail(`File wajib tidak ditemukan: ${workspace}/src-tauri/build.rs`);
  } else {
    const manifestBlock = readFileSync(buildPath, "utf8").match(
      /const (?:DESKTOP|MOBILE)_COMMANDS: &\[&str\] = &\[([\s\S]*?)\n\];/,
    )?.[1];
    if (!manifestBlock) {
      fail(`Daftar command build.rs ${workspace} tidak dapat diparsing.`);
    } else {
      const manifest = new Set(
        [...manifestBlock.matchAll(/"([a-z0-9_]+)"/g)].map((match) => match[1]),
      );
      for (const fn of registered) {
        if (manifest.has(fn)) continue;
        fail(
          `Command ${workspace} tidak ada di daftar command build.rs: ${fn}. ` +
            "Tanpa itu tauri_build gagal membuat izinnya dan build berhenti.",
        );
      }
      for (const name of manifest) {
        if (registered.includes(name)) continue;
        fail(
          `Daftar command build.rs ${workspace} basi: ${name} tidak ada di generate_handler!.`,
        );
      }
    }
  }

  commandNotes += `${workspace}: ${registered.length} command terdaftar & terdefinisi. `;
}

if (errors.length > 0) {
  console.error("AUDIT SYNC CONTRACT: GAGAL");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

notes.push(`${expectedRoutes.length} route kanonik konsisten.`);
notes.push(`${expectedSnapshotTriples.length} tabel snapshot konsisten.`);
notes.push("Bootstrap, atomic receipt, entity-key, dan empty-cloud guard terdeteksi.");
notes.push(commandNotes.trim());
console.log("AUDIT SYNC CONTRACT: LULUS");
for (const note of notes) console.log(`- ${note}`);
