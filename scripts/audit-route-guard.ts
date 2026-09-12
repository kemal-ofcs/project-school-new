/**
 * Audit proteksi asal permintaan pada route handler.
 *
 * Static export melarang handler `GET`, sehingga SETIAP endpoint — termasuk
 * yang hanya membaca — berbentuk `POST`. Akibatnya "metode aman" tidak bisa
 * lagi dipakai untuk menebak mana yang berbahaya, dan satu-satunya pembatas
 * asal permintaan yang tersisa adalah pemeriksaan eksplisit.
 *
 * Yang dicari: route yang mengekspor `POST`/`PUT`/`PATCH`/`DELETE` tanpa
 * `assertSameOriginMutation` maupun `isSameOriginMutation`. Kedua bentuk
 * diterima karena keduanya dipakai dan keduanya benar — `auth/session`
 * memilih bentuk boolean supaya bisa membalas JSON-nya sendiri, dan memeriksa
 * hanya nama yang pertama sempat melaporkannya melanggar padahal ia menjaga
 * POST dan DELETE sekaligus.
 *
 * Penjaganya menolak permintaan yang TIDAK membawa header `Origin`. Itu aman
 * di sini karena setiap pemanggil sah mengirimkannya: peramban menyertakan
 * `Origin` pada setiap POST, dan sisi Rust menyetelnya sendiri lewat
 * `.header(ORIGIN, state.server_origin())` di `remote.rs`. Periksa fakta itu
 * lagi sebelum memasang penjaga pada endpoint baru yang dipanggil Rust —
 * memasangnya tanpa memeriksa akan mematikan login Desktop pada instalasi yang
 * memakai server aplikasi.
 *
 * DILARANG menambahkan daftar pengecualian. Route yang melanggar diperbaiki.
 */

import fs from "node:fs";
import path from "node:path";

const rootDir = path.resolve(import.meta.dir, "..");
// Dua situs, satu aturan. `web-public` ikut sejak Fase 5.0, dan di sana
// alasannya berbeda dari yang dieja di atas: endpoint-nya melayani internet
// terbuka tanpa sesi sama sekali, sehingga pendaftaran PMB dan permintaan kode
// OTP bisa dipicu dari halaman mana pun milik siapa pun. Pemeriksaan asal
// permintaan bukan lapisan tambahan di sana — ia satu-satunya yang ada sebelum
// rate limit.
const API_DIRS = [
	path.join(rootDir, "web-desktop/src/app/api"),
	path.join(rootDir, "web-public/src/app/api"),
];

const METODE_MUTASI = /export\s+(?:async\s+)?function\s+(POST|PUT|PATCH|DELETE)\b/;
// Menuntut PANGGILAN, bukan sekadar penyebutan nama. Baris impor pun memuat
// nama itu, sehingga pemeriksaan yang hanya mencari identifiernya akan
// meloloskan berkas yang panggilannya sudah dihapus tetapi impornya tertinggal.
const PENJAGA = /\b(assert|is)SameOriginMutation\s*\(\s*request\s*\)/;

function heading(text: string) {
	console.log(`\n${"─".repeat(70)}\n${text}\n${"─".repeat(70)}`);
}

function kumpulkanRoute(direktori: string, hasil: string[] = []): string[] {
	if (!fs.existsSync(direktori)) return hasil;
	for (const entri of fs.readdirSync(direktori, { withFileTypes: true })) {
		const penuh = path.join(direktori, entri.name);
		if (entri.isDirectory()) kumpulkanRoute(penuh, hasil);
		else if (entri.name === "route.ts") hasil.push(penuh);
	}
	return hasil;
}

heading("Audit Asal Permintaan — setiap endpoint membatasi pemanggilnya");

let total = 0;
let terjaga = 0;
const pelanggaran: string[] = [];

for (const berkasAbsolut of API_DIRS.flatMap((dir) => kumpulkanRoute(dir))) {
	const sumber = fs.readFileSync(berkasAbsolut, "utf8");
	if (!METODE_MUTASI.test(sumber)) continue;

	total++;
	if (PENJAGA.test(sumber)) {
		terjaga++;
		continue;
	}
	pelanggaran.push(
		path.relative(rootDir, berkasAbsolut).split(path.sep).join("/"),
	);
}

console.log(`  Route endpoint : ${total}`);
console.log(`  Terjaga        : ${terjaga}`);
console.log(`  Melanggar      : ${pelanggaran.length}`);

if (pelanggaran.length > 0) {
	heading("Pelanggaran");
	for (const berkas of pelanggaran) console.log(`  ❌ ${berkas}`);
	console.error(
		`\n❌ ${pelanggaran.length} endpoint tanpa pembatasan asal permintaan.\n` +
			"   Panggil `assertSameOriginMutation(request)` di awal handler-nya,\n" +
			"   atau `isSameOriginMutation(request)` bila ingin membalas sendiri.\n",
	);
	process.exit(1);
}
console.log("\n🎉 Setiap endpoint membatasi asal permintaannya.\n");
