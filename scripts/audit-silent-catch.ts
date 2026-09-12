/**
 * Audit kegagalan yang didiamkan.
 *
 * Sebuah `catch` yang tidak menyurfacekan apa pun dan tidak melempar ulang
 * membuat kegagalan tampak persis seperti keberhasilan yang kebetulan kosong.
 * Dasbor Mobile pernah begitu: metrik gagal dimuat, layar tampil kosong, dan
 * hasilnya tidak bisa dibedakan dari hari yang memang belum ada aktivitasnya —
 * bentuk TypeScript dari pelajaran `unwrap_or(0)` di dasbor Rust.
 *
 * Mendiamkan kegagalan KADANG memang benar, dan repo ini punya contohnya:
 * kegagalan sinkronisasi tidak boleh menghalangi pemuatan data lokal, konteks
 * WebGL yang sudah dilepas peramban tidak perlu dilaporkan, dan pengguna yang
 * menutup dialog berkas adalah pembatalan, bukan kesalahan.
 *
 * Karena itu audit ini tidak melarang diam — ia menuntut ALASANNYA TERTULIS.
 * Sebuah `// Ignore` tidak memberi tahu pembaca berikutnya apakah keheningan
 * itu hasil pertimbangan atau kemalasan; ia harus menyebutkan mengapa
 * kegagalan di titik itu memang tidak perlu diketahui siapa pun.
 *
 * DILARANG menambahkan daftar pengecualian. Komentar yang menjelaskan jauh
 * lebih murah daripada sebuah daftar yang harus dipelihara.
 */

import fs from "node:fs";
import path from "node:path";

const rootDir = path.resolve(import.meta.dir, "..");
const WORKSPACES = ["web-desktop", "mobile", "web-public"];

/** Komentar yang tidak menjelaskan apa pun. */
const KOSONG_MAKNA =
	/^(ignore|ignored|abaikan|skip|noop|no-op|silent|silently handled|handled silently|do nothing|nothing)\.?$/i;

interface Pelanggaran {
	berkas: string;
	baris: number;
	alasan: string;
}

function heading(text: string) {
	console.log(`\n${"─".repeat(70)}\n${text}\n${"─".repeat(70)}`);
}

function kumpulkan(direktori: string, hasil: string[] = []): string[] {
	if (!fs.existsSync(direktori)) return hasil;
	for (const entri of fs.readdirSync(direktori, { withFileTypes: true })) {
		const penuh = path.join(direktori, entri.name);
		if (entri.isDirectory()) {
			if (entri.name === "node_modules") continue;
			kumpulkan(penuh, hasil);
		} else if (/\.tsx?$/.test(entri.name) && !/\.test\.tsx?$/.test(entri.name)) {
			hasil.push(penuh);
		}
	}
	return hasil;
}

/** Indeks kurung kurawal penutup yang cocok. */
function penutup(sumber: string, buka: number): number {
	let kedalaman = 0;
	for (let i = buka; i < sumber.length; i++) {
		const karakter = sumber[i];
		if (karakter === "{") kedalaman++;
		else if (karakter === "}") {
			kedalaman--;
			if (kedalaman === 0) return i;
		}
	}
	return -1;
}

heading("Audit Kegagalan Didiamkan — diam boleh, tanpa alasan tidak");

let total = 0;
let diam = 0;
const pelanggaran: Pelanggaran[] = [];

for (const workspace of WORKSPACES) {
	for (const direktori of ["src/app", "src/components", "src/lib"]) {
		for (const berkasAbsolut of kumpulkan(
			path.join(rootDir, workspace, direktori),
		)) {
			const sumber = fs.readFileSync(berkasAbsolut, "utf8");
			const berkas = path
				.relative(rootDir, berkasAbsolut)
				.split(path.sep)
				.join("/");

			for (const cocok of sumber.matchAll(/\bcatch\s*(?:\([^)]*\))?\s*\{/g)) {
				if (cocok.index === undefined) continue;
				const buka = sumber.indexOf("{", cocok.index);
				const tutup = penutup(sumber, buka);
				if (tutup === -1) continue;
				total++;

				const badan = sumber.slice(buka + 1, tutup);
				const tanpaKomentar = badan
					.replace(/\/\/[^\n]*/g, "")
					.replace(/\/\*[\s\S]*?\*\//g, "")
					.trim();

				// Ada kode nyata di dalamnya → bukan keheningan.
				if (tanpaKomentar !== "") continue;
				diam++;

				const komentar = [...badan.matchAll(/\/\/\s*(.*)/g)]
					.map((k) => (k[1] as string).trim())
					.filter(Boolean)
					.join(" ");
				const baris = sumber.slice(0, cocok.index).split("\n").length;

				if (komentar === "") {
					pelanggaran.push({
						berkas,
						baris,
						alasan: "didiamkan tanpa komentar apa pun",
					});
					continue;
				}
				if (KOSONG_MAKNA.test(komentar) || komentar.length < 20) {
					pelanggaran.push({
						berkas,
						baris,
						alasan: `komentarnya tidak menjelaskan: "${komentar}"`,
					});
				}
			}
		}
	}
}

console.log(`  Blok catch        : ${total}`);
console.log(`  Sengaja diam      : ${diam}`);
console.log(`  Tanpa alasan jelas: ${pelanggaran.length}`);

if (pelanggaran.length > 0) {
	heading("Pelanggaran");
	for (const { berkas, baris, alasan } of pelanggaran) {
		console.log(`  ❌ ${berkas}:${baris}`);
		console.log(`     ${alasan}`);
	}
	console.error(
		`\n❌ ${pelanggaran.length} kegagalan didiamkan tanpa alasan yang tertulis.\n` +
			"   Surfacekan kegagalannya, ATAU tulis mengapa diam memang benar di\n" +
			"   titik itu — pembaca berikutnya tidak bisa membedakan pertimbangan\n" +
			"   dari kelalaian hanya dari kata \"Ignore\".\n",
	);
	process.exit(1);
}
console.log("\n🎉 Setiap kegagalan yang didiamkan punya alasan tertulis.\n");
