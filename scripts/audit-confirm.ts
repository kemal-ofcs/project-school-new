/**
 * Audit dialog sistem — `window.confirm` / `alert` / `prompt` di antarmuka.
 *
 * Dua belas aksi merusak pernah bergantung pada `window.confirm`, termasuk
 * menghapus seluruh rekam jejak Bimbingan Konseling seorang siswa. Empat
 * masalahnya semua terasa justru di tempat yang paling perlu dimengerti
 * sebelum dijalankan:
 *
 * - Tidak bisa ditata dan tidak mengikuti tema aplikasi.
 * - Pada WebView Android tampilannya berbeda dari yang dilihat pengembang di
 *   desktop, sehingga kalimat yang muat di satu tempat bisa terpotong di
 *   tempat lain.
 * - Hanya menerima teks datar: tidak ada tempat memisahkan apa yang HILANG
 *   dari apa yang TETAP ADA. Bagian kedua itu yang biasanya paling dibutuhkan
 *   — orang berhenti bukan karena tidak tahu ini berbahaya, melainkan karena
 *   tidak tahu seberapa jauh bahayanya.
 * - Memblokir thread render selama dialognya terbuka.
 *
 * Penggantinya `useConfirmDialog` di `lib/hooks` — berbasis Promise sehingga
 * pemanggilnya nyaris tidak berubah bentuk, dan ikut tersinkronisasi ke Mobile
 * sambil tetap memakai komponen `<Modal>` milik masing-masing workspace.
 *
 * Cakupannya sengaja hanya `src/app` dan `src/components`: hook penggantinya
 * sendiri hidup di `lib/hooks` dan menyebut `window.confirm` di dokumentasinya,
 * dan sebuah audit yang menuduh dokumentasi solusinya sendiri tidak akan
 * bertahan lama.
 *
 * DILARANG menambahkan daftar pengecualian.
 */

import fs from "node:fs";
import path from "node:path";

const rootDir = path.resolve(import.meta.dir, "..");
const WORKSPACES = ["web-desktop", "mobile"];

/** Panggilan dialog sistem, bukan sekadar penyebutan namanya. */
const DIALOG_SISTEM = /\b(?:window\.)?(confirm|alert|prompt)\s*\(/g;

/** `confirm(` juga nama yang wajar untuk variabel/prop; hanya panggilan global yang dicari. */
const GLOBAL_SAJA = /\bwindow\.(confirm|alert|prompt)\s*\(/g;

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
		} else if (entri.name.endsWith(".tsx") || entri.name.endsWith(".ts")) {
			hasil.push(penuh);
		}
	}
	return hasil;
}

heading("Audit Dialog Sistem — konfirmasi memakai antarmuka aplikasi");

const pelanggaran: Pelanggaran[] = [];
let diperiksa = 0;

for (const workspace of WORKSPACES) {
	for (const direktori of ["src/app", "src/components"]) {
		for (const berkasAbsolut of kumpulkanTsx(
			path.join(rootDir, workspace, direktori),
		)) {
			diperiksa++;
			const sumber = fs.readFileSync(berkasAbsolut, "utf8");
			const berkas = path
				.relative(rootDir, berkasAbsolut)
				.split(path.sep)
				.join("/");

			for (const cocok of sumber.matchAll(GLOBAL_SAJA)) {
				if (cocok.index === undefined) continue;
				pelanggaran.push({
					berkas,
					baris: sumber.slice(0, cocok.index).split("\n").length,
					cuplikan: sumber
						.slice(cocok.index, cocok.index + 80)
						.split("\n")[0] as string,
				});
			}
		}
	}
}

console.log(`  Berkas diperiksa : ${diperiksa}`);
console.log(`  Dialog sistem    : ${pelanggaran.length}`);

if (pelanggaran.length > 0) {
	heading("Pelanggaran");
	for (const { berkas, baris, cuplikan } of pelanggaran) {
		console.log(`  ❌ ${berkas}:${baris}`);
		console.log(`     ${cuplikan}`);
	}
	console.error(
		`\n❌ ${pelanggaran.length} dialog sistem di antarmuka.\n` +
			"   Pakai `useConfirmDialog` dari @/lib/hooks/useConfirmDialog — ia\n" +
			"   memisahkan apa yang HILANG dari apa yang TETAP ADA, dan tampil sama\n" +
			"   di Desktop maupun WebView Android.\n",
	);
	process.exit(1);
}
console.log("\n🎉 Tidak ada dialog sistem di antarmuka.\n");

// Konstanta ini sengaja tidak dipakai: menyimpan bentuk yang LEBIH luas
// (`confirm(` tanpa `window.`) sebagai catatan bahwa bentuk itu pernah
// dipertimbangkan dan ditolak — `confirm` juga nama prop yang wajar.
void DIALOG_SISTEM;
