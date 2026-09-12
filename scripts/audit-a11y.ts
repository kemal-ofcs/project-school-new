/**
 * Audit label kontrol formulir.
 *
 * Sebuah `<select>` tanpa label diumumkan pembaca layar hanya sebagai nilai
 * yang sedang terpilih — "Semua Divisi" — tanpa satu pun petunjuk bahwa ia
 * menyaring divisi, status, atau urutan. Pada halaman riwayat absensi ada tiga
 * select berdampingan yang semuanya terdengar seperti itu.
 *
 * `placeholder` BUKAN label: pengumumannya berbeda-beda antar pembaca layar,
 * dan ia lenyap begitu pengguna mulai mengetik — persis saat konfirmasi paling
 * dibutuhkan.
 *
 * ## Tiga bentuk label yang sama-sama sah
 *
 * 1. `<label htmlFor="x">` dipasangkan dengan `<input id="x">`
 * 2. `aria-label` atau `aria-labelledby` pada kontrolnya
 * 3. `<label>` yang MEMBUNGKUS kontrolnya (label implisit)
 *
 * Ketiganya wajib dikenali. Audit yang hanya menghitung `htmlFor` akan menuduh
 * ratusan kontrol yang sebenarnya benar — dan audit yang menuduh kode benar
 * akan dimatikan orang, lalu tidak menjaga apa pun.
 *
 * Pelajaran itu datang dari audit ini sendiri: pemeriksaan grep pertama
 * melaporkan halaman koreksi absensi punya 26 kontrol tanpa label, padahal
 * seluruhnya memakai `aria-label` yang kebetulan berada di baris BERIKUTNYA.
 *
 * DILARANG menambahkan daftar pengecualian. Kontrol yang melanggar diberi
 * label, bukan didaftarkan.
 */

import fs from "node:fs";
import path from "node:path";

const rootDir = path.resolve(import.meta.dir, "..");
// `web-public` ikut sejak Fase 5.0. Justru di sanalah aturan ini paling
// menggigit: formulir PMB diisi orang yang belum pernah melihat aplikasi ini,
// pada perangkat yang tidak dipilihkan sekolah, dan seringkali dibantu orang
// lain. Kontrol tanpa nama di panel admin merepotkan operator yang hafal
// letaknya; kontrol tanpa nama di formulir pendaftaran membuat orang salah
// mengisi berkas anaknya.
const WORKSPACES = ["web-desktop", "mobile", "web-public"];

interface Pelanggaran {
	berkas: string;
	baris: number;
	cuplikan: string;
}

function heading(text: string) {
	console.log(`\n${"─".repeat(70)}\n${text}\n${"─".repeat(70)}`);
}

function kumpulkanTsx(direktori: string, hasil: string[] = []): string[] {
	if (!fs.existsSync(direktori)) return hasil;
	for (const entri of fs.readdirSync(direktori, { withFileTypes: true })) {
		const penuh = path.join(direktori, entri.name);
		if (entri.isDirectory()) {
			if (entri.name === "node_modules") continue;
			kumpulkanTsx(penuh, hasil);
		} else if (entri.name.endsWith(".tsx")) {
			hasil.push(penuh);
		}
	}
	return hasil;
}

/**
 * Ambil teks pembuka tag, dari `<input` sampai `>` pasangannya.
 *
 * Penghitungan kurung kurawal dan tanda kutip diperlukan karena atribut JSX
 * memuat ekspresi yang sendirinya mengandung `>` — misalnya sebuah arrow
 * function pada `onChange`.
 */
function pembukaTag(sumber: string, mulai: number): string {
	let kedalaman = 0;
	let kutip: string | null = null;
	for (let i = mulai; i < sumber.length; i++) {
		const karakter = sumber[i] as string;
		if (kutip) {
			if (karakter === kutip) kutip = null;
			continue;
		}
		if (karakter === '"' || karakter === "'" || karakter === "`") {
			kutip = karakter;
			continue;
		}
		if (karakter === "{") kedalaman++;
		else if (karakter === "}") kedalaman--;
		else if (karakter === ">" && kedalaman === 0) {
			return sumber.slice(mulai, i + 1);
		}
	}
	return sumber.slice(mulai, mulai + 400);
}

/** Apakah kontrol pada posisi ini berada di dalam sebuah `<label>`? */
function dibungkusLabel(sumber: string, posisi: number): boolean {
	const sebelum = sumber.slice(0, posisi);
	const bukaLabel = sebelum.lastIndexOf("<label");
	if (bukaLabel === -1) return false;
	return sebelum.lastIndexOf("</label>") < bukaLabel;
}

heading("Audit Label Formulir — kontrol yang tidak punya nama");

let total = 0;
let berlabel = 0;
let takTerverifikasi = 0;
const pelanggaran: Pelanggaran[] = [];

for (const workspace of WORKSPACES) {
	const direktori = [
		path.join(rootDir, workspace, "src/app"),
		path.join(rootDir, workspace, "src/components"),
	];
	for (const berkasAbsolut of direktori.flatMap((d) => kumpulkanTsx(d))) {
		const sumber = fs.readFileSync(berkasAbsolut, "utf8");
		const berkas = path
			.relative(rootDir, berkasAbsolut)
			.split(path.sep)
			.join("/");

		const idBerlabel = new Set(
			[...sumber.matchAll(/htmlFor=\{?["'`]([^"'`]+)["'`]\}?/g)].map(
				(cocok) => cocok[1] as string,
			),
		);

		for (const cocok of sumber.matchAll(/<(input|select|textarea)\b/g)) {
			if (cocok.index === undefined) continue;
			const tag = pembukaTag(sumber, cocok.index);

			// Kontrol tersembunyi tidak pernah dibacakan.
			if (/type=["']hidden["']/.test(tag)) continue;
			total++;

			if (/aria-label(?:ledby)?=/.test(tag)) {
				berlabel++;
				continue;
			}
			if (dibungkusLabel(sumber, cocok.index)) {
				berlabel++;
				continue;
			}
			const id = tag.match(/\bid=\{?["'`]([^"'`{}]+)["'`]\}?/);
			if (id && idBerlabel.has(id[1] as string)) {
				berlabel++;
				continue;
			}
			// `id` yang dirakit saat runtime tidak bisa dipastikan dari sumber.
			// Dihitung terpisah, bukan dituduh — dan tetap terlihat.
			if (/\bid=\{/.test(tag) && !id) {
				takTerverifikasi++;
				continue;
			}

			pelanggaran.push({
				berkas,
				baris: sumber.slice(0, cocok.index).split("\n").length,
				cuplikan: tag.replace(/\s+/g, " ").slice(0, 88),
			});
		}
	}
}

console.log(`  Kontrol formulir     : ${total}`);
console.log(`  Berlabel             : ${berlabel}`);
console.log(`  Tanpa label          : ${pelanggaran.length}`);
if (takTerverifikasi > 0) {
	console.log(`  Tidak dapat dipastikan: ${takTerverifikasi} (id dirakit runtime)`);
}

if (pelanggaran.length > 0) {
	heading("Pelanggaran");
	for (const { berkas, baris, cuplikan } of pelanggaran) {
		console.log(`  ❌ ${berkas}:${baris}`);
		console.log(`     ${cuplikan}`);
	}
}

heading("Ringkasan");
if (pelanggaran.length === 0) {
	console.log("🎉 Setiap kontrol formulir punya nama yang bisa dibacakan.\n");
} else {
	console.error(
		`❌ ${pelanggaran.length} kontrol formulir tanpa label.\n` +
			"   Tambahkan `aria-label` yang menyebut FUNGSI kontrolnya, bukan nilai\n" +
			"   yang sedang terpilih — \"Filter divisi\", bukan \"Semua Divisi\".\n",
	);
	process.exit(1);
}
