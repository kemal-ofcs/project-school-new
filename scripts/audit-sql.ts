/**
 * Audit SQL — setiap query aplikasi di-`prepare` SQLite terhadap skema nyata.
 *
 * Fase 4 lolos seluruh gerbang mutu sambil membawa sembilan rujukan kolom yang
 * tidak pernah ada (`m.jabatan`, `m.nama_lengkap`, `pmd.status_kehadiran`).
 * Semua gerbang yang ada memeriksa BENTUK kode — lint memeriksa gaya, typecheck
 * memeriksa tipe TypeScript, `audit:schema` membandingkan lapisan skema satu
 * sama lain, `audit:contract` menelusuri rute dan command. Tidak satu pun
 * pernah MENJALANKAN SQL-nya, sehingga sebuah nama kolom yang salah ketik
 * hanyalah teks di dalam string bagi mereka semua.
 *
 * Audit ini menutup celah itu: ia membangun skema dari DDL yang sama yang
 * dipakai produksi, lalu meminta SQLite sendiri yang memvonis setiap query.
 *
 * Dua hal yang membuat audit ini jujur dan wajib dipertahankan:
 *
 * 1. Skemanya dibangun lewat `openDatabaseFromDdl` dari `scripts/lib` — jalur
 *    yang sama dengan `audit:schema`. Menyalin parser DDL ke sini akan
 *    menciptakan sumber drift yang justru ingin dicegah audit ini.
 * 2. Query yang tidak bisa direkonstruksi (interpolasi yang nilainya baru ada
 *    saat runtime) DIHITUNG dan DILAPORKAN, tidak dibuang diam-diam. Audit yang
 *    menyembunyikan cakupannya sendiri akan pelan-pelan berubah menjadi
 *    lolos-palsu, persis seperti versi lama `audit:schema` yang melaporkan
 *    "100% KONSISTEN" sambil memeriksa nol tabel.
 */

import fs from "node:fs";
import path from "node:path";
import type Database from "bun:sqlite";
import {
	collectCloudDdl,
	collectLocalDdl,
	collectRepairDdl,
	openDatabaseFromDdl,
} from "./lib/cloud-schema";
import { petikRust } from "./lib/rust-literals";

const rootDir = path.resolve(import.meta.dir, "..");

/**
 * Berkas yang ISI-nya memang DDL, bukan query terhadap skema.
 *
 * Ketiganya sudah diperiksa `audit:schema` dengan cara dijalankan; memeriksanya
 * lagi di sini hanya akan melaporkan "tabel belum ada" pada urutan pembuatannya
 * sendiri.
 */
const BERKAS_DDL = new Set([
	"web-desktop/src/lib/db-schema.ts",
	"web-desktop/src/lib/db-migrations.ts",
]);

interface Temuan {
	berkas: string;
	pesan: string;
	sql: string;
}

interface HasilBerkas {
	berkas: string;
	diperiksa: number;
	takTerbaca: number;
	temuan: Temuan[];
}

function heading(text: string) {
	console.log(`\n${"─".repeat(70)}\n${text}\n${"─".repeat(70)}`);
}

/** Kumpulkan berkas sumber secara rekursif. */
function kumpulkanBerkas(
	direktori: string,
	ekstensi: string,
	hasil: string[] = [],
): string[] {
	if (!fs.existsSync(direktori)) return hasil;
	for (const entri of fs.readdirSync(direktori, { withFileTypes: true })) {
		const penuh = path.join(direktori, entri.name);
		if (entri.isDirectory()) {
			if (entri.name === "node_modules" || entri.name === "target") continue;
			kumpulkanBerkas(penuh, ekstensi, hasil);
		} else if (entri.name.endsWith(ekstensi)) {
			hasil.push(penuh);
		}
	}
	return hasil;
}

/**
 * Peta konstanta SQL di dalam satu berkas.
 *
 * Potongan seperti `GATE_SUMMARY_SUBQUERY` disisipkan ke banyak query lewat
 * `{NAMA}` (Rust `format!`) atau `${NAMA}` (template TypeScript). Tanpa
 * substitusi ini, justru query paling rumit — yang memang paling mungkin salah
 * — akan terlewat dari pemeriksaan.
 */
function petaKonstanta(sumber: string): Map<string, string> {
	const peta = new Map<string, string>();
	const polaRust = /const\s+([A-Z][A-Z0-9_]*)\s*:\s*&str\s*=\s*r#"([\s\S]*?)"#\s*;/g;
	for (const cocok of sumber.matchAll(polaRust)) {
		peta.set(cocok[1] as string, cocok[2] as string);
	}
	const polaRustBiasa = /const\s+([A-Z][A-Z0-9_]*)\s*:\s*&str\s*=\s*"((?:[^"\\]|\\.)*)"\s*;/g;
	for (const cocok of sumber.matchAll(polaRustBiasa)) {
		peta.set(cocok[1] as string, (cocok[2] as string).replace(/\\n/g, "\n"));
	}
	const polaTs = /const\s+([A-Z][A-Z0-9_]*)\s*=\s*`([\s\S]*?)`\s*;/g;
	for (const cocok of sumber.matchAll(polaTs)) {
		peta.set(cocok[1] as string, cocok[2] as string);
	}
	return peta;
}

/**
 * Ambil calon literal SQL dari sebuah berkas Rust atau TypeScript.
 *
 * Sisi Rust dulu membaca `r#"…"#` SAJA. Gerbang ini ada justru karena Fase 4
 * meloloskan sembilan kolom yang tidak pernah ada lewat gerbang yang seluruhnya
 * hijau — dan selama ia hanya membaca raw string, ke-32 query `SNAPSHOT_SOURCES`
 * di `turso.rs` (yang semuanya berbentuk `sql: "SELECT …"`) tidak pernah
 * sekalipun diserahkan ke SQLite. Sebuah gerbang yang menyembunyikan
 * cakupannya sendiri membusuk menjadi lulus palsu, persis seperti
 * `schema-audit.ts` lama.
 *
 * Modul tes dikeluarkan, dan itu tidak mengurangi apa pun yang nyata. SQL di
 * dalam tes berjalan di atas tabel fixture yang baru dibuat saat runtime —
 * `t`, `test_jam`, `absensi` — sehingga mem-`prepare`-nya terhadap skema
 * sebenarnya hanya menghasilkan "no such table" atas kode yang benar. Lagi pula
 * `cargo test` MENJALANKAN query itu sungguhan terhadap skema hasil
 * `storage::initialize`, yang merupakan bentuk pemeriksaan lebih kuat daripada
 * `prepare` dan memang bentuk yang dianjurkan repo ini.
 */
function literalSql(sumber: string, jenis: "rust" | "ts"): string[] {
	if (jenis === "rust") {
		return petikRust(sumber, { tanpaModulTes: true }).map(
			(literal) => literal.isi,
		);
	}
	return [...sumber.matchAll(/`([\s\S]*?)`/g)].map((cocok) => cocok[1] as string);
}

/**
 * Sebuah literal baru dianggap calon query bila kata kerjanya benar-benar
 * diikuti sasaran, bukan sekadar diawali kata kerja.
 *
 * Bentuk lamanya (`^(SELECT|WITH|INSERT|UPDATE|DELETE)\b`) cukup selama yang
 * dibaca hanya raw string. Begitu literal kutip biasa ikut terbaca, pola itu
 * mulai menuduh string yang bukan SQL sama sekali: `sync::enqueue(…, "update",
 * …)` dan `(…, "delete", …)` adalah NAMA OPERASI outbox, dan hanya di
 * `academic.rs` ada 14 di antaranya. Menuduh kode yang benar adalah cara
 * tercepat membuat gerbang ini dimatikan orang.
 */
const AWALAN_QUERY =
	/^\s*(?:(?:SELECT|WITH)\s+\S|INSERT\s+(?:OR\s+\w+\s+)?INTO\s+\S|UPDATE\s+\S|DELETE\s+FROM\s+\S)/i;

/**
 * Pisahkan literal multi-statement menjadi pernyataan tunggal.
 *
 * Pemisahan menghormati tanda kutip DAN komentar SQL, supaya `;` yang berada di
 * dalam sebuah string atau di dalam komentar `--` tidak salah dianggap
 * pembatas — kesalahan itu memotong query menjadi dua penggalan yang keduanya
 * tidak sah, lalu dilaporkan sebagai cacat pada kode yang sebenarnya benar.
 */
function pecahStatement(sql: string): string[] {
	const hasil: string[] = [];
	let sekarang = "";
	let dalamKutip: string | null = null;
	let dalamKomentarBaris = false;
	let dalamKomentarBlok = false;
	for (let i = 0; i < sql.length; i++) {
		const karakter = sql[i] as string;
		const berikutnya = sql[i + 1];

		if (dalamKomentarBaris) {
			if (karakter === "\n") dalamKomentarBaris = false;
			sekarang += karakter;
			continue;
		}
		if (dalamKomentarBlok) {
			if (karakter === "*" && berikutnya === "/") {
				dalamKomentarBlok = false;
				sekarang += "*/";
				i++;
				continue;
			}
			sekarang += karakter;
			continue;
		}
		if (dalamKutip) {
			if (karakter === dalamKutip) dalamKutip = null;
			sekarang += karakter;
			continue;
		}
		if (karakter === "-" && berikutnya === "-") {
			dalamKomentarBaris = true;
			sekarang += "--";
			i++;
			continue;
		}
		if (karakter === "/" && berikutnya === "*") {
			dalamKomentarBlok = true;
			sekarang += "/*";
			i++;
			continue;
		}
		if (karakter === "'" || karakter === '"') {
			dalamKutip = karakter;
			sekarang += karakter;
			continue;
		}
		if (karakter === ";") {
			hasil.push(sekarang);
			sekarang = "";
			continue;
		}
		sekarang += karakter;
	}
	hasil.push(sekarang);
	return hasil.map((bagian) => bagian.trim()).filter((bagian) => bagian !== "");
}

function periksaBerkas(
	db: Database,
	berkasAbsolut: string,
	jenis: "rust" | "ts",
): HasilBerkas {
	const berkas = path
		.relative(rootDir, berkasAbsolut)
		.split(path.sep)
		.join("/");
	const hasil: HasilBerkas = {
		berkas,
		diperiksa: 0,
		takTerbaca: 0,
		temuan: [],
	};
	if (BERKAS_DDL.has(berkas)) return hasil;

	const sumber = fs.readFileSync(berkasAbsolut, "utf8");
	const konstanta = petaKonstanta(sumber);

	for (const literal of literalSql(sumber, jenis)) {
		let sql = literal.trim();
		if (!AWALAN_QUERY.test(sql)) continue;

		for (const [nama, isi] of konstanta) {
			// `${NAMA}` WAJIB diganti lebih dulu. Mengganti `{NAMA}` duluan akan
			// memakan bagian dalam interpolasi TypeScript dan meninggalkan `$`
			// yatim, yang lalu ditolak SQLite sebagai token asing — kegagalan yang
			// berasal dari audit ini sendiri, bukan dari kode yang diperiksanya.
			sql = sql.replaceAll(`\${${nama}}`, isi).replaceAll(`{${nama}}`, isi);
		}

		// Masih ada interpolasi yang nilainya baru lahir saat runtime.
		//
		// `${` diperiksa tanpa menuntut kurung penutupnya: template TypeScript
		// yang memuat template lain di dalam `${…}` akan terpotong oleh pemindai
		// literal di atas, menyisakan `${` yang menggantung. Menuntut bentuk
		// lengkap `${…}` membuat penggalan itu lolos ke SQLite dan dilaporkan
		// sebagai cacat kode, padahal ia cacat pembacaan audit ini sendiri.
		//
		// Bentuk POSISIONAL `{}` ikut dihitung di sini. Selama yang terbaca hanya
		// raw string, satu-satunya placeholder yang muncul adalah `{nama}`;
		// begitu literal kutip biasa ikut terbaca, `format!("INSERT INTO {} …")`
		// milik `apply_table` dan para perakit `UPDATE … SET {}` ikut terbawa,
		// dan menyerahkannya ke SQLite melaporkan "unrecognized token" atas kode
		// yang sepenuhnya benar. Itu cacat pembacaan audit ini, bukan cacat SQL.
		if (/\$\{|\{[A-Za-z0-9_]*(?::[^}]*)?\}/.test(sql)) {
			hasil.takTerbaca++;
			continue;
		}

		for (const statement of pecahStatement(sql)) {
			if (!AWALAN_QUERY.test(statement)) continue;
			hasil.diperiksa++;
			try {
				db.prepare(statement).finalize();
			} catch (error) {
				hasil.temuan.push({
					berkas,
					pesan: error instanceof Error ? error.message : String(error),
					sql: statement,
				});
			}
		}
	}
	return hasil;
}

// ── Skema referensi ─────────────────────────────────────────────────────────
heading("Audit SQL — query dijalankan, bukan dibaca");

const storageSource = fs.readFileSync(
	path.join(rootDir, "web-desktop/src-tauri/src/desktop/storage.rs"),
	"utf8",
);
const tursoSource = fs.readFileSync(
	path.join(rootDir, "web-desktop/src-tauri/src/desktop/turso.rs"),
	"utf8",
);

const db = openDatabaseFromDdl(
	[
		...collectLocalDdl(storageSource),
		...collectCloudDdl(tursoSource),
		...collectRepairDdl(tursoSource),
	],
	"gabungan lokal + cloud",
	true,
);

const jumlahTabel = (
	db
		.query(
			"SELECT COUNT(*) AS total FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%';",
		)
		.get() as { total: number }
).total;

// Skema kosong akan membuat SETIAP query gagal, dan skema yang nyaris kosong
// membuat audit ini lolos-palsu tanpa satu pun query benar-benar teruji.
if (jumlahTabel < 30) {
	console.error(
		`❌ Skema referensi hanya berisi ${jumlahTabel} tabel — DDL gagal terbaca. Audit dihentikan.\n`,
	);
	process.exit(1);
}
console.log(`  ✅ Skema referensi terbentuk: ${jumlahTabel} tabel`);

// ── Sasaran pemindaian ──────────────────────────────────────────────────────
const sasaran: Array<{ berkas: string; jenis: "rust" | "ts" }> = [];

for (const berkas of kumpulkanBerkas(
	path.join(rootDir, "web-desktop/src-tauri/src/desktop"),
	".rs",
)) {
	sasaran.push({ berkas, jenis: "rust" });
}

// Modul yang hanya ada di biner Mobile tidak pernah disalin dari web-desktop,
// jadi SQL-nya tidak akan pernah ikut terperiksa lewat sasaran di atas.
for (const berkas of kumpulkanBerkas(
	path.join(rootDir, "mobile/src-tauri/src/mobile"),
	".rs",
)) {
	if (path.basename(berkas) === "share.rs") {
		sasaran.push({ berkas, jenis: "rust" });
	}
}

for (const berkas of kumpulkanBerkas(
	path.join(rootDir, "web-desktop/src/lib"),
	".ts",
)) {
	if (berkas.endsWith(".test.ts")) continue;
	sasaran.push({ berkas, jenis: "ts" });
}

for (const berkas of kumpulkanBerkas(
	path.join(rootDir, "web-desktop/src/app/api"),
	".ts",
)) {
	if (berkas.endsWith(".test.ts")) continue;
	sasaran.push({ berkas, jenis: "ts" });
}

// Situs publik, sejak Fase 5.1. Ia membaca database yang sama tetapi TIDAK
// memilikinya: seluruh tabel dan kolom yang disebutnya dibuat jalur
// provisioning lain, dan ia sendiri tidak punya satu pun `CREATE TABLE` yang
// bisa menambal salah ketik. Justru karena itu ia paling butuh diperiksa di
// sini — sebuah `m.nama_lengkap` yang salah hanyalah teks di dalam string bagi
// lint maupun typecheck, dan baru berbunyi sebagai halaman 500 di hadapan
// calon pendaftar.
for (const direktori of [
	"web-public/src/lib",
	"web-public/src/app",
]) {
	for (const berkas of kumpulkanBerkas(path.join(rootDir, direktori), ".ts")) {
		if (berkas.endsWith(".test.ts")) continue;
		sasaran.push({ berkas, jenis: "ts" });
	}
}

// ── Pemeriksaan ─────────────────────────────────────────────────────────────
heading("Hasil per berkas");

let totalDiperiksa = 0;
let totalTakTerbaca = 0;
const semuaTemuan: Temuan[] = [];
const berkasTakTerbaca: HasilBerkas[] = [];

for (const { berkas, jenis } of sasaran) {
	const hasil = periksaBerkas(db, berkas, jenis);
	totalDiperiksa += hasil.diperiksa;
	totalTakTerbaca += hasil.takTerbaca;
	if (hasil.takTerbaca > 0) berkasTakTerbaca.push(hasil);
	if (hasil.temuan.length > 0) {
		semuaTemuan.push(...hasil.temuan);
		console.log(`  ❌ ${hasil.berkas}`);
		for (const temuan of hasil.temuan) {
			console.log(`    • ${temuan.pesan}`);
			console.log(`      ${temuan.sql.replace(/\s+/g, " ").slice(0, 160)}…`);
		}
	}
}

if (semuaTemuan.length === 0) {
	console.log(`  ✅ ${totalDiperiksa} query lolos di ${sasaran.length} berkas`);
}

// ── Cakupan ─────────────────────────────────────────────────────────────────
heading("Cakupan");
console.log(`  Query diperiksa      : ${totalDiperiksa}`);
console.log(`  Tidak dapat disusun  : ${totalTakTerbaca}`);
if (berkasTakTerbaca.length > 0) {
	console.log(
		"\n  Berkas berikut memuat query yang nilainya baru lahir saat runtime,",
	);
	console.log("  sehingga TIDAK ikut terperiksa audit ini:");
	for (const hasil of berkasTakTerbaca) {
		console.log(`    • ${hasil.berkas} (${hasil.takTerbaca})`);
	}
}

db.close();

// ── Ringkasan ───────────────────────────────────────────────────────────────
heading("Ringkasan");
if (semuaTemuan.length === 0) {
	console.log("🎉 Seluruh query yang dapat disusun diterima SQLite.\n");
} else {
	console.error(
		`❌ ${semuaTemuan.length} query ditolak SQLite — kolom atau tabelnya tidak ada.\n`,
	);
	process.exit(1);
}
