/**
 * Audit penjaga anti klik ganda pada halaman yang bermutasi.
 *
 * Aturan 5 menuntut setiap formulir dilindungi `isSubmittingRef = useRef(false)`.
 * Sampai audit ini ada, satu-satunya penegaknya adalah ingatan orang yang
 * sedang menulis kodenya — dan pemeriksaan pertama menemukan 11 dari 18 halaman
 * yang memanggil gateway mutasi tidak memilikinya, termasuk halaman payroll,
 * pengaturan, dan manajemen operator.
 *
 * Mengapa `useRef`, bukan `useState`: pembaruan state React dijadwalkan, jadi
 * dua klik dalam satu tick sama-sama membaca nilai lama dan keduanya lolos.
 * Sebuah ref berubah seketika. Pada halaman seperti Bimbingan Konseling
 * akibatnya bukan sekadar baris ganda, melainkan dua rekam jejak kedisiplinan
 * untuk satu peristiwa yang sama pada seorang anak.
 *
 * Cara audit ini menghindari tuduhan palsu: yang dihitung HANYA fungsi yang
 * benar-benar diimpor dari `@/lib/gateways/*` lalu di-`await`. Pemeriksaan yang
 * hanya mencocokkan nama akan menandai `createQrPng` (menggambar PNG di kanvas)
 * dan `saveFileWithPicker` (dialog simpan berkas) sebagai mutasi server —
 * keduanya bukan, dan audit yang menuduh kode yang benar akan cepat dimatikan
 * orang.
 *
 * DILARANG menambahkan daftar pengecualian di sini. Halaman yang melanggar
 * diperbaiki, bukan didaftarkan — sebuah daftar putih akan pelan-pelan menjadi
 * tempat menyembunyikan pelanggaran, dan audit ini kehilangan seluruh gunanya.
 */

import fs from "node:fs";
import path from "node:path";

const rootDir = path.resolve(import.meta.dir, "..");

const WORKSPACES = ["web-desktop", "mobile"];

/**
 * Awalan nama yang menandai sebuah gateway mengubah data.
 *
 * Sengaja awalan, bukan potongan di mana saja: `updateStatusIdCard` bermutasi,
 * sedangkan `getLastUpdate` tidak.
 */
const AWALAN_MUTASI =
	/^(save|create|update|delete|cancel|queue|submit|insert|edit|generate|import|reset|approve|revoke|assign|toggle|purge|drain|backfill|freeze|remove|add|send|apply|restore|promote|link|unlink|bulk)[A-Z]/;

const PENJAGA = "isSubmittingRef";

interface Pelanggaran {
	berkas: string;
	fungsi: string[];
}

function heading(text: string) {
	console.log(`\n${"─".repeat(70)}\n${text}\n${"─".repeat(70)}`);
}

function kumpulkanHalaman(direktori: string, hasil: string[] = []): string[] {
	if (!fs.existsSync(direktori)) return hasil;
	for (const entri of fs.readdirSync(direktori, { withFileTypes: true })) {
		const penuh = path.join(direktori, entri.name);
		if (entri.isDirectory()) {
			if (entri.name === "node_modules") continue;
			kumpulkanHalaman(penuh, hasil);
		} else if (entri.name === "page.tsx") {
			hasil.push(penuh);
		}
	}
	return hasil;
}

/** Nama fungsi (bukan tipe) yang diimpor dari `@/lib/gateways/*`. */
function imporGateway(sumber: string): Set<string> {
	const nama = new Set<string>();
	const pola =
		// `[^}]*`, BUKAN `[\s\S]*?`. Yang kedua boleh melintasi blok impor lain:
		// pencocokan dimulai dari `import {` pertama di berkas dan merentang
		// sampai kurung penutup milik impor gateway, sehingga nama PERTAMA di
		// blok gateway menempel pada teks di depannya dan hilang dari daftar.
		// Cacat itu membuat audit ini meloloskan halaman yang justru melanggar.
		/import\s*\{([^}]*)\}\s*from\s*["']@\/lib\/gateways\/[^"']+["']/g;
	for (const cocok of sumber.matchAll(pola)) {
		for (const bagian of (cocok[1] as string).split(",")) {
			const teks = bagian.trim();
			if (!teks || teks.startsWith("type ")) continue;
			const alias = teks.split(/\s+as\s+/);
			nama.add((alias[1] ?? alias[0] ?? "").trim());
		}
	}
	nama.delete("");
	return nama;
}

/** Gateway mutasi yang benar-benar dipanggil dengan `await` pada sepotong kode. */
function mutasiDipanggil(sumber: string, gateway: Set<string>): string[] {
	const dipanggil = [
		...sumber.matchAll(/await\s+([a-zA-Z_$][\w$]*)\s*\(/g),
	].map((cocok) => cocok[1] as string);
	return [
		...new Set(
			dipanggil.filter((nama) => gateway.has(nama) && AWALAN_MUTASI.test(nama)),
		),
	].sort();
}

/** Indeks kurung kurawal penutup yang cocok untuk pembuka di `buka`. */
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

interface Handler {
	nama: string;
	badan: string;
}

/** Setiap handler bertingkat dua di dalam komponen, beserta badannya. */
function handlerKomponen(sumber: string): Handler[] {
	const hasil: Handler[] = [];
	for (const cocok of sumber.matchAll(
		/\n  const (\w+) = (?:async )?\([^)]*\)(?::[^=]*)? => \{/g,
	)) {
		if (cocok.index === undefined) continue;
		const buka = sumber.indexOf("{", cocok.index + cocok[0].length - 1);
		const tutup = penutup(sumber, buka);
		if (tutup === -1) continue;
		hasil.push({
			nama: cocok[1] as string,
			badan: sumber.slice(buka, tutup + 1),
		});
	}
	return hasil;
}

heading("Audit Penjaga Formulir — anti klik ganda");

let totalHalaman = 0;
let totalTerjaga = 0;
const pelanggaran: Pelanggaran[] = [];

for (const workspace of WORKSPACES) {
	for (const berkasAbsolut of kumpulkanHalaman(
		path.join(rootDir, workspace, "src/app"),
	)) {
		const sumber = fs.readFileSync(berkasAbsolut, "utf8");
		const gateway = imporGateway(sumber);
		const mutasi = mutasiDipanggil(sumber, gateway);
		if (mutasi.length === 0) continue;

		totalHalaman++;
		const berkas = path
			.relative(rootDir, berkasAbsolut)
			.split(path.sep)
			.join("/");

		if (!sumber.includes(PENJAGA)) {
			pelanggaran.push({ berkas, fungsi: mutasi });
			continue;
		}

		// Deklarasi saja tidak cukup. Sebuah halaman bisa mendeklarasikan
		// penjaganya lalu tidak memakainya di satu pun handler — dan pemeriksaan
		// yang hanya mencari namanya di berkas akan meloloskannya. Setiap handler
		// yang memanggil gateway mutasi wajib benar-benar menyentuh penjaganya.
		const handlerLalai = handlerKomponen(sumber)
			.filter(
				(handler) =>
					mutasiDipanggil(handler.badan, gateway).length > 0 &&
					!handler.badan.includes(`${PENJAGA}.current`),
			)
			.map((handler) => `${handler.nama}() tidak memakai ${PENJAGA}`);
		if (handlerLalai.length > 0) {
			pelanggaran.push({ berkas, fungsi: handlerLalai });
			continue;
		}

		// Penjaga yang dideklarasikan SETELAH sebuah early return adalah hook
		// bersyarat: ia dilewati pada sebagian render, urutan hook berubah, dan
		// React menjatuhkan seluruh halaman. Ini kesalahan yang mudah dibuat
		// justru saat menambahkan penjaganya.
		const posisiPenjaga = sumber.indexOf(`const ${PENJAGA} = useRef`);
		const posisiReturnAwal = sumber.search(/\n\s{2}if \([^)]*\)\s*\{\n\s+return/);
		if (
			posisiPenjaga !== -1 &&
			posisiReturnAwal !== -1 &&
			posisiPenjaga > posisiReturnAwal
		) {
			pelanggaran.push({
				berkas,
				fungsi: [
					`${PENJAGA} dideklarasikan setelah early return (hook bersyarat)`,
				],
			});
			continue;
		}

		totalTerjaga++;
	}
}

console.log(`  Halaman memanggil gateway mutasi : ${totalHalaman}`);
console.log(`  Terjaga                          : ${totalTerjaga}`);
console.log(`  Melanggar                        : ${pelanggaran.length}`);

if (pelanggaran.length > 0) {
	heading("Pelanggaran");
	for (const { berkas, fungsi } of pelanggaran) {
		console.log(`  ❌ ${berkas}`);
		console.log(`     ${fungsi.join(", ")}`);
	}
}

heading("Ringkasan");
if (pelanggaran.length === 0) {
	console.log(
		"🎉 Setiap halaman yang memanggil gateway mutasi punya penjaga klik ganda.\n",
	);
} else {
	console.error(
		`❌ ${pelanggaran.length} halaman bermutasi tanpa penjaga \`${PENJAGA}\`.\n` +
			"   Tambahkan `const isSubmittingRef = useRef(false);` DI ATAS setiap early\n" +
			"   return, lalu pada tiap handler: `if (isSubmittingRef.current) return;`,\n" +
			"   set `true` sebelum `try`, dan kembalikan ke `false` di `finally`.\n",
	);
	process.exit(1);
}
