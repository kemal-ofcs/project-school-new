import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";

/**
 * Audit kontrak sinkronisasi.
 *
 * Berbeda dari `schema-audit.ts` yang membandingkan BENTUK tabel, audit ini
 * memeriksa KONTRAK di sekelilingnya: rute outbox yang sah, kesetaraan salinan
 * Mobile, kelengkapan pendaftaran command Tauri, dan kesesuaian katalog
 * permission antara Rust dan TypeScript.
 *
 * Prinsip yang membedakannya dari versi di aplikasi turunan: sebisa mungkin
 * harapannya DITURUNKAN dari kode, bukan ditulis sebagai daftar tetap. Daftar
 * tetap memaksa setiap produk baru memelihara salinan kedua yang cepat atau
 * lambat berselisih dengan kenyataan — persis kelas kesalahan yang ingin
 * dicegah audit ini. Daftar tetap hanya dipakai di tempat yang memang berupa
 * KEPUTUSAN, misalnya tabel yang sengaja tidak ikut disinkronkan.
 */

const projectRoot = resolve(import.meta.dir, "..");
const errors: string[] = [];
const notes: string[] = [];

/**
 * Tabel yang SENGAJA hanya ada di satu sisi.
 *
 * Ini keputusan, bukan turunan — jadi memang ditulis tangan. Setiap penambahan
 * WAJIB disertai alasannya di sini, agar daftar ini tidak pelan-pelan berubah
 * menjadi tempat menyembunyikan drift.
 */
const RUST_ONLY_CLOUD_TABLES = [
	// Penghitung perubahan per tabel, dibuat `ensure_sync_pulse` dan digerakkan
	// trigger SQLite. Jalur Web menulis langsung ke database yang sama, sehingga
	// trigger yang sama sudah ikut menaikkannya.
	"sync_pulse",
	// Jejak baris yang dihapus, dipasang bersama `sync_pulse` dan digerakkan
	// trigger `AFTER DELETE` pada setiap tabel snapshot. Alasannya sama persis:
	// jalur Web menghapus di database yang sama, sehingga trigger-nya mencatat
	// penghapusan Web tanpa satu baris kode pun di sisi Web. Sebuah tabel yang
	// harus DITULIS aplikasi tidak boleh masuk daftar ini — yang ini tidak
	// pernah ditulis aplikasi mana pun.
	//
	// Database yang belum pernah disentuh klien Rust belum memilikinya, dan itu
	// tidak menimbulkan celah: perangkat baru selalu menarik snapshot penuh
	// lebih dulu sehingga titik awalnya sudah konsisten, dan tabel beserta
	// trigger-nya terpasang pada `ensure_schema` sebelum pull inkremental
	// pertama berjalan.
	"sync_tombstone",
];

const WEB_ONLY_CLOUD_TABLES: string[] = [];

function fail(message: string) {
	errors.push(message);
}

function read(relativePath: string) {
	const path = resolve(projectRoot, relativePath);
	if (!existsSync(path)) {
		fail(`Berkas wajib tidak ditemukan: ${relativePath}`);
		return "";
	}
	return readFileSync(path, "utf8");
}

function sameSet(
	label: string,
	actual: Iterable<string>,
	expected: Iterable<string>,
) {
	const left = [...new Set(actual)].sort();
	const right = [...new Set(expected)].sort();
	if (JSON.stringify(left) === JSON.stringify(right)) return;

	const onlyLeft = left.filter((item) => !right.includes(item));
	const onlyRight = right.filter((item) => !left.includes(item));
	const detail = [
		onlyLeft.length > 0 ? `hanya di kiri: ${onlyLeft.join(", ")}` : "",
		onlyRight.length > 0 ? `hanya di kanan: ${onlyRight.join(", ")}` : "",
	]
		.filter(Boolean)
		.join(" · ");
	fail(`${label} — ${detail}`);
}

// ── Pembaca sumber ──────────────────────────────────────────────────────────

function canonicalRoutes(source: string) {
	const block = source.match(
		/const CANONICAL_SYNC_ROUTES:[\s\S]*?=\s*&\[([\s\S]*?)\n\];/,
	)?.[1];
	if (!block) return [];
	return [...block.matchAll(/\("([^"]+)",\s*"([^"]+)"\)/g)].map(
		(match) => `${match[1]}/${match[2]}`,
	);
}

function snapshotTriples(source: string) {
	const block = source
		.match(/const SNAPSHOT_TABLES:[\s\S]*?=\s*&\[([\s\S]*?)\n\];/)?.[1]
		?.replace(/\s+/g, " ")
		.trim();
	if (!block) return [];
	return [
		...block.matchAll(
			/payload_key:\s*"([^"]+)"[\s\S]*?domain:\s*"([^"]+)"[\s\S]*?table:\s*"([^"]+)"/g,
		),
	].map((match) => `${match[1]}|${match[2]}|${match[3]}`);
}

function registeredCommands(libSource: string) {
	const block = libSource.match(
		/invoke_handler\(tauri::generate_handler!\[([\s\S]*?)\n\s*\]\)/,
	)?.[1];
	if (!block) return [];
	return [
		...block.matchAll(/([a-z_][a-z0-9_]*(?:::[a-z_][a-z0-9_]*)+)\s*,/g),
	].map((match) => match[1].split("::").pop() as string);
}

function definedCommands(source: string) {
	return [
		...source.matchAll(
			/#\[tauri::command\][\s\S]{0,200}?\bfn\s+([a-z_][a-z0-9_]*)/g,
		),
	].map((match) => match[1] as string);
}

function buildRsCommands(source: string) {
	const block = source.match(/=\s*&?\[([\s\S]*?)\];/)?.[1];
	if (!block) return [];
	return [...block.matchAll(/"([a-z_][a-z0-9_]*)"/g)].map(
		(match) => match[1] as string,
	);
}

function capabilityCommands(source: string) {
	return (
		[...source.matchAll(/"allow-([a-z0-9-]+)"/g)]
			.map((match) => (match[1] as string).replace(/-/g, "_"))
			// `mobile_` ikut: perintah yang hanya ada di biner Mobile memakai awalan
			// itu, dan menyaringnya di sini akan membuat audit melaporkan
			// "tanpa izin di capabilities" untuk izin yang sebenarnya ada.
			.filter(
				(name) => name.startsWith("desktop_") || name.startsWith("mobile_"),
			)
	);
}

/** Kunci permission dari seed SQL Rust. */
function seededPermissions(source: string) {
	const block = source.match(
		/INSERT OR IGNORE INTO app_permission[\s\S]*?VALUES([\s\S]*?);/,
	)?.[1];
	if (!block) return [];
	return [...block.matchAll(/\(\s*'([a-z_]+\.[a-z_.]+)'/g)].map(
		(match) => match[1] as string,
	);
}

/** Kunci permission dari katalog TypeScript. */
function catalogPermissions(source: string) {
	return [...source.matchAll(/key:\s*"([a-z_]+\.[a-z_.]+)"/g)].map(
		(match) => match[1] as string,
	);
}

function walk(directory: string): string[] {
	if (!existsSync(directory)) return [];
	const files: string[] = [];
	for (const entry of readdirSync(directory)) {
		const full = join(directory, entry);
		if (statSync(full).isDirectory()) {
			files.push(...walk(full));
			continue;
		}
		if ([".ts", ".tsx"].includes(extname(entry))) files.push(full);
	}
	return files;
}

/** Ubah `@/x/y` menjadi path berkas di dalam sebuah workspace. */
function resolveAliasImport(workspace: string, spec: string) {
	if (!spec.startsWith("@/")) return null;
	const base = resolve(projectRoot, workspace, "src", spec.slice(2));
	for (const candidate of [
		`${base}.ts`,
		`${base}.tsx`,
		join(base, "index.ts"),
		join(base, "index.tsx"),
	]) {
		if (existsSync(candidate)) return candidate;
	}
	return null;
}

/**
 * Bagian sebuah fungsi gateway yang benar-benar dieksekusi di Mobile.
 *
 * Gateway bersama bercabang `if (isMobileRuntime()) { … }`; segala sesuatu di
 * LUAR blok itu adalah jalur Desktop/Web yang tidak pernah berjalan di Mobile.
 * Tanpa pemisahan ini setiap command Desktop di gateway bersama tampak seperti
 * "command hantu" di Mobile — dan menutupinya dengan whitelist berarti
 * mematikan pemeriksaannya sekalian.
 *
 * Hanya guard POSITIF yang dikenali. Bentuk `if (!isMobileRuntime()) throw`
 * sengaja tidak dihitung: ia tidak memisahkan jalur, hanya menolak salah satu.
 */
function splitMobileBranch(body: string) {
	const guard = /if\s*\(\s*isMobileRuntime\(\)\s*\)\s*\{/g;
	const blocks: string[] = [];
	for (const match of body.matchAll(guard)) {
		const open = (match.index as number) + (match[0] as string).length - 1;
		let depth = 0;
		for (let i = open; i < body.length; i++) {
			if (body[i] === "{") depth++;
			else if (body[i] === "}") {
				depth--;
				if (depth === 0) {
					blocks.push(body.slice(open, i + 1));
					break;
				}
			}
		}
	}
	return blocks.length > 0 ? blocks.join("\n") : body;
}

/**
 * Peta nama ekspor → badan kodenya.
 *
 * `null` bila modulnya tidak punya ekspor yang bisa dipilah; pemanggil WAJIB
 * memperlakukan itu sebagai "periksa seluruh modul", supaya kegagalan pemilahan
 * membuat audit lebih galak alih-alih diam-diam melewatkan sesuatu.
 */
function exportBodies(source: string) {
	const starts: { name: string; index: number }[] = [];
	const pattern =
		/export\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)|export\s+const\s+([A-Za-z0-9_$]+)\s*=/g;
	for (const match of source.matchAll(pattern)) {
		starts.push({
			name: (match[1] ?? match[2]) as string,
			index: match.index as number,
		});
	}
	if (starts.length === 0) return null;
	// Kode sebelum ekspor pertama (helper modul seperti `kickDesktopSync`) ikut
	// disertakan ke setiap badan: lebih baik terlalu banyak daripada terlewat.
	const prologue = source.slice(0, starts[0]?.index ?? 0);
	const bodies = new Map<string, string>();
	for (let i = 0; i < starts.length; i++) {
		const from = starts[i]?.index as number;
		const to = i + 1 < starts.length ? (starts[i + 1]?.index as number) : source.length;
		bodies.set(starts[i]?.name as string, prologue + source.slice(from, to));
	}
	return bodies;
}

/**
 * Command yang benar-benar TERJANGKAU dari UI sebuah workspace.
 *
 * Penelusuran dimulai dari `src/app` dan `src/components`, mengikuti import
 * `@/…`, dan di dalam modul tujuan hanya membaca fungsi yang memang diimpor.
 * Ini yang dijanjikan CLAUDE.md ("the contract audit walks gateway call graphs
 * from `src/app`/`src/components`") — memindai seluruh `src/` secara datar akan
 * menuduh setiap command Desktop di dalam gateway bersama yang disalin ke
 * Mobile, padahal tidak satu pun halaman Mobile memanggilnya.
 */
function reachableCommands(workspace: string) {
	const found = new Set<string>();
	const seen = new Set<string>();
	const queue: { file: string; name: string | null }[] = [];
	for (const directory of ["app", "components"]) {
		for (const file of walk(resolve(projectRoot, workspace, "src", directory))) {
			queue.push({ file, name: null });
		}
	}

	while (queue.length > 0) {
		const job = queue.pop();
		if (!job) break;
		const key = `${job.file}#${job.name ?? "*"}`;
		if (seen.has(key) || !existsSync(job.file)) continue;
		seen.add(key);

		const source = readFileSync(job.file, "utf8");
		let scope = source;
		if (job.name !== null) {
			const bodies = exportBodies(source);
			if (bodies) scope = bodies.get(job.name) ?? "";
		}
		if (workspace === "mobile") scope = splitMobileBranch(scope);

		for (const match of scope.matchAll(
			/invokeDesktop(?:<[\s\S]*?>)?\(\s*"([a-z0-9_]+)"/g,
		)) {
			found.add(match[1] as string);
		}

		// Fungsi tetangga di modul yang sama ikut terjangkau bila namanya dipakai.
		const siblings = exportBodies(source);
		if (siblings) {
			for (const name of siblings.keys()) {
				if (name !== job.name && new RegExp(`\\b${name}\\s*\\(`).test(scope)) {
					queue.push({ file: job.file, name });
				}
			}
		}

		for (const match of source.matchAll(/import\s+([\s\S]*?)\s+from\s+"([^"]+)"/g)) {
			const clause = match[1] as string;
			const target = resolveAliasImport(workspace, match[2] as string);
			if (!target) continue;
			const named = clause.match(/\{([\s\S]*?)\}/);
			// Import default atau namespace tidak bisa dipetakan ke satu ekspor,
			// jadi modulnya diperiksa utuh.
			if (!named || clause.includes("*")) {
				queue.push({ file: target, name: null });
				continue;
			}
			for (const raw of (named[1] as string).split(",")) {
				const name = raw
					.replace(/\btype\b/, "")
					.split(/\sas\s/)[0]
					?.trim();
				if (name) queue.push({ file: target, name });
			}
		}
	}
	return found;
}

/** Rute yang benar-benar diproduksi outbox di dalam sumber Rust. */
function producedRoutes(source: string) {
	return [
		...source.matchAll(
			/enqueue_outbox\(\s*[^,]+,\s*"([^"]+)"\s*,\s*"([^"]+)"/g,
		),
	].map((match) => `${match[1]}/${match[2]}`);
}

// ── Sumber ──────────────────────────────────────────────────────────────────

const desktopSync = read("web-desktop/src-tauri/src/desktop/sync.rs");
const mobileSync = read("mobile/src-tauri/src/mobile/sync.rs");
const desktopLib = read("web-desktop/src-tauri/src/lib.rs");
const mobileLib = read("mobile/src-tauri/src/lib.rs");
// `commands.rs` DITAMBAH modul payroll: administrasi penggajian Desktop hidup
// di `payroll/commands.rs`, dan audit yang hanya membaca commands.rs akan
// menuduh command-nya "terdaftar tetapi fungsinya tidak ada".
const desktopCommands = [
	read("web-desktop/src-tauri/src/desktop/commands.rs"),
	read("web-desktop/src-tauri/src/desktop/payroll/commands.rs"),
].join("\n");

// SELURUH modul Mobile dibaca, bukan daftar nama yang ditulis keras.
//
// Perintah yang tidak punya padanan Desktop hidup di luar berkas yang disalin
// `sync-rust-modules.ts`, dan audit yang hanya membaca `commands.rs` akan
// menuduhnya "terdaftar tetapi fungsinya tidak ada". Sebelumnya daftar itu
// dieja satu per satu (`share.rs`, `payroll.rs`) — dan daftar seperti itu
// basi tanpa memberi tahu siapa pun: modul Mobile berikutnya yang lahir
// (`wa_review.rs`) langsung dituduh, padahal kodenya benar.
//
// Sebuah audit yang menuduh kode yang benar akan dimatikan orang, jadi
// cakupannya diambil dari direktorinya sendiri.
const mobileCommands = readdirSync(
	resolve(projectRoot, "mobile/src-tauri/src/mobile"),
)
	.filter((berkas) => berkas.endsWith(".rs"))
	.map((berkas) => read(`mobile/src-tauri/src/mobile/${berkas}`))
	.join("\n");
const desktopBuild = read("web-desktop/src-tauri/build.rs");
const mobileBuild = read("mobile/src-tauri/build.rs");
const desktopCapability = read(
	"web-desktop/src-tauri/capabilities/default.json",
);
const mobileCapability = read("mobile/src-tauri/capabilities/default.json");
const desktopTurso = read("web-desktop/src-tauri/src/desktop/turso.rs");
const desktopCatalog = read("web-desktop/src/lib/rbac/catalog.ts");

// ── 1. Rute kanonik ─────────────────────────────────────────────────────────
// Daftarnya DITURUNKAN dari sisi Desktop, lalu Mobile diwajibkan sama. Tidak
// ada daftar kedua yang harus dipelihara manusia.
const routes = canonicalRoutes(desktopSync);
if (routes.length === 0) {
	fail("CANONICAL_SYNC_ROUTES tidak terbaca dari sync.rs Desktop.");
} else {
	sameSet(
		"Rute kanonik Desktop vs Mobile",
		routes,
		canonicalRoutes(mobileSync),
	);
	notes.push(`${routes.length} rute kanonik konsisten di kedua workspace.`);
}

// Setiap rute yang benar-benar diproduksi outbox WAJIB ada di daftar kanonik.
// Rute karangan membuat event menggantung: ia terkirim, tetapi tidak ada
// pemroses yang mengenalinya.
for (const [label, source] of [
	["Desktop", desktopSync],
	["Mobile", mobileSync],
] as [string, string][]) {
	const produced = [...new Set(producedRoutes(source))];
	const unknown = produced.filter((route) => !routes.includes(route));
	if (unknown.length > 0) {
		fail(`Rute outbox ${label} di luar daftar kanonik: ${unknown.join(", ")}`);
	}
}

// ── 2. Tabel snapshot ───────────────────────────────────────────────────────
const triples = snapshotTriples(desktopSync);
if (triples.length === 0) {
	fail("SNAPSHOT_TABLES tidak terbaca dari sync.rs Desktop.");
} else {
	sameSet(
		"Tabel snapshot Desktop vs Mobile",
		triples,
		snapshotTriples(mobileSync),
	);
	notes.push(`${triples.length} tabel snapshot konsisten di kedua workspace.`);
}

// ── 3. Pendaftaran command Tauri ────────────────────────────────────────────
// Sebuah command hidup di empat tempat: definisinya, `invoke_handler`,
// `build.rs`, dan berkas capability. Melewatkan salah satunya membuat build
// gagal atau — lebih buruk — command terdaftar yang tidak punya izin.
for (const [label, lib, commands, build, capability] of [
	["web-desktop", desktopLib, desktopCommands, desktopBuild, desktopCapability],
	["mobile", mobileLib, mobileCommands, mobileBuild, mobileCapability],
] as [string, string, string, string, string][]) {
	const defined = new Set(definedCommands(commands));
	const registered = registeredCommands(lib);
	const declared = new Set(buildRsCommands(build));
	const allowed = new Set(capabilityCommands(capability));

	const missingDefinition = registered.filter((name) => !defined.has(name));
	if (missingDefinition.length > 0) {
		fail(
			`Command ${label} terdaftar tetapi fungsinya tidak ada: ${missingDefinition.join(", ")}`,
		);
	}

	const missingBuild = registered.filter((name) => !declared.has(name));
	if (missingBuild.length > 0) {
		fail(
			`Command ${label} tidak ada di daftar build.rs: ${missingBuild.join(", ")} — tauri_build gagal membuat izinnya dan build berhenti.`,
		);
	}

	const missingCapability = registered.filter((name) => !allowed.has(name));
	if (missingCapability.length > 0) {
		fail(
			`Command ${label} tanpa izin di capabilities/default.json: ${missingCapability.join(", ")}`,
		);
	}

	if (
		missingDefinition.length === 0 &&
		missingBuild.length === 0 &&
		missingCapability.length === 0
	) {
		notes.push(`${label}: ${registered.length} command terdaftar lengkap.`);
	}
}

// ── 4. Command yang dipanggil frontend benar-benar ada ──────────────────────
// Gateway yang memanggil command tidak dikenal hanya gagal saat dijalankan
// pengguna, bukan saat dibangun.
for (const [label, workspace, lib] of [
	["web-desktop", "web-desktop", desktopLib],
	["mobile", "mobile", mobileLib],
] as [string, string, string][]) {
	const registered = new Set(registeredCommands(lib));
	const invoked = reachableCommands(workspace);
	// Command berawalan `mobile_` hanya dipanggil di balik
	// `if (isMobileRuntime()) { … }` pada gateway bersama, jadi wajar tidak
	// terdaftar di biner Desktop/Web.
	//
	// TIDAK ADA pengecualian lain. Command Desktop yang hanya "menumpang" di
	// gateway bersama sudah tersaring oleh `reachableCommands`, yang menelusuri
	// dari halaman dan hanya membaca cabang `isMobileRuntime()` di Mobile —
	// jadi command yang tetap muncul di sini memang dipanggil UI dan memang
	// tidak terdaftar di binernya.
	const unknown = [...invoked].filter(
		(name) =>
			!registered.has(name) &&
			!(workspace === "web-desktop" && name.startsWith("mobile_")),
	);
	if (unknown.length > 0) {
		fail(
			`Frontend ${label} memanggil command yang tidak terdaftar: ${unknown.join(", ")}`,
		);
	}
}

// ── 5. Katalog permission Rust vs TypeScript ────────────────────────────────
// Seed Rust menanam permission ke database; katalog TypeScript yang menentukan
// apa yang tampil di layar Role & Akses. Selisihnya berarti ada izin yang tidak
// pernah bisa diberikan, atau yang diberikan tetapi tidak pernah ditanam.
const seeded = seededPermissions(desktopTurso);
const catalog = catalogPermissions(desktopCatalog);
if (seeded.length === 0 || catalog.length === 0) {
	fail("Katalog permission tidak terbaca dari salah satu sisi.");
} else {
	sameSet("Permission seed Rust vs katalog TypeScript", seeded, catalog);
	notes.push(`${catalog.length} permission konsisten di kedua sisi.`);
}

// ── 6. Tabel cloud yang sengaja hanya ada di satu sisi ──────────────────────
// Database yang sama dibangun DUA jalur: `turso.rs` (Desktop/Mobile) dan
// `db-schema.ts` + `db-migrations.ts` (Web). `CREATE TABLE IF NOT EXISTS` tidak
// pernah memperbaiki tabel yang sudah ada, sehingga selisih di sini merusak
// permanen jalur yang tidak sempat membuatnya.
function cloudTables(source: string) {
	return [...source.matchAll(/CREATE TABLE IF NOT EXISTS\s+(\w+)/g)].map(
		(match) => match[1] as string,
	);
}

{
	const rust = new Set(cloudTables(desktopTurso));
	const web = new Set(
		cloudTables(
			`${read("web-desktop/src/lib/db-schema.ts")}\n${read("web-desktop/src/lib/db-migrations.ts")}`,
		),
	);

	const rustOnly = [...rust].filter(
		(table) => !web.has(table) && !RUST_ONLY_CLOUD_TABLES.includes(table),
	);
	const webOnly = [...web].filter(
		(table) => !rust.has(table) && !WEB_ONLY_CLOUD_TABLES.includes(table),
	);

	if (rustOnly.length > 0) {
		fail(
			`Tabel cloud hanya dibuat jalur Rust: ${rustOnly.sort().join(", ")} — jalur Web tidak akan pernah memilikinya.`,
		);
	}
	if (webOnly.length > 0) {
		fail(
			`Tabel cloud hanya dibuat jalur Web: ${webOnly.sort().join(", ")} — jalur Desktop/Mobile tidak akan pernah memilikinya.`,
		);
	}
	if (rustOnly.length === 0 && webOnly.length === 0) {
		notes.push(
			`Kedua jalur provisioning membuat himpunan tabel yang sama (${RUST_ONLY_CLOUD_TABLES.length} pengecualian terdokumentasi).`,
		);
	}
}

// ── Hasil ───────────────────────────────────────────────────────────────────

console.log("Audit Kontrak Sinkronisasi\n");

if (errors.length === 0) {
	console.log("AUDIT SYNC CONTRACT: LULUS");
	for (const note of notes) console.log(`- ${note}`);
	console.log("");
	process.exit(0);
}

console.error("AUDIT SYNC CONTRACT: GAGAL");
for (const error of errors) console.error(`- ${error}`);
console.error("");
process.exit(1);
