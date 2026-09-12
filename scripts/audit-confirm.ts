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
const WORKSPACES = ["web-desktop", "mobile", "web-public"];

/**
 * Panggilan dialog sistem, dengan atau tanpa awalan `window.`.
 *
 * Versi pertama audit ini HANYA mencari `window.confirm(`, dengan alasan bahwa
 * `confirm` juga nama yang wajar untuk variabel atau prop. Alasannya masuk akal,
 * akibatnya tidak: empat belas panggilan `confirm(` telanjang tersebar di
 * sepuluh berkas — menghapus aturan BPJS, jenjang lembur, lapisan pajak, jadwal
 * mengajar, konfigurasi database, bahkan logout — dan tidak satu pun pernah
 * terlihat audit ini. `confirm(` telanjang adalah pemanggilan global yang sama
 * persis dengan `window.confirm(`; yang berbeda hanya ejaannya.
 *
 * Kekhawatiran aslinya tetap dijawab, tetapi dengan cara yang benar: nama yang
 * DIIKAT secara lokal di berkas itu (import, const/let, parameter, destructure)
 * memang bukan pemanggilan global, dan dikecualikan lewat `terikatLokal`.
 * Mengecualikan berdasarkan bukti di berkasnya jauh lebih tepat daripada
 * mengecualikan seluruh bentuk ejaannya.
 */
const DIALOG_SISTEM = /(^|[^.\w$])(confirm|alert|prompt)\s*\(/gm;

/**
 * Apakah nama itu punya pengikatan lokal di berkas ini.
 *
 * Kalau ya, pemanggilannya bukan dialog sistem melainkan fungsi milik berkas
 * itu sendiri — dan audit yang menuduh kode benar akan dimatikan orang.
 */
function terikatLokal(sumber: string, nama: string): boolean {
	const pola = [
		new RegExp(`\\b(?:const|let|var|function)\\s+${nama}\\b`),
		new RegExp(`\\bimport\\s+[^;]*\\b${nama}\\b[^;]*from`),
		new RegExp(`\\b${nama}\\s*[:=]\\s*(?:async\\s*)?\\(`),
		new RegExp(`\\{[^}]*\\b${nama}\\b[^}]*\\}\\s*=`),
	];
	return pola.some((p) => p.test(sumber));
}

interface Pelanggaran {
	berkas: string;
	baris: number;
	cuplikan: string;
}

/**
 * Buang komentar SEBELUM memindai, dengan panjang berkas dipertahankan.
 *
 * Tanpa ini, komentar yang MENJELASKAN aturan ini akan dituduh melanggarnya —
 * dan itu bukan kekhawatiran teoretis: begitu audit ini diperketat, dua
 * pelanggaran pertamanya adalah dua baris komentar yang menerangkan mengapa
 * `confirm()` telanjang dilarang. Sebuah audit yang menuduh kode benar akan
 * dimatikan orang.
 *
 * Karakternya diganti spasi alih-alih dihapus supaya nomor baris dan indeks
 * yang dilaporkan tetap menunjuk posisi aslinya di berkas.
 */
function tanpaKomentar(sumber: string): string {
	return sumber
		.replace(/\/\*[\s\S]*?\*\//g, (cocok) => cocok.replace(/[^\n]/g, " "))
		.replace(/(^|[^:])\/\/[^\n]*/g, (cocok, awalan: string) =>
			awalan + cocok.slice(awalan.length).replace(/./g, " "),
		);
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
			const sumber = tanpaKomentar(fs.readFileSync(berkasAbsolut, "utf8"));
			const berkas = path
				.relative(rootDir, berkasAbsolut)
				.split(path.sep)
				.join("/");

			for (const cocok of sumber.matchAll(DIALOG_SISTEM)) {
				if (cocok.index === undefined) continue;
				const nama = cocok[2] as string;
				// `window.confirm(` selalu dialog sistem. `confirm(` telanjang
				// hanya dikecualikan bila berkasnya memang mengikat nama itu.
				const eksplisit = sumber
					.slice(Math.max(0, cocok.index - 7), cocok.index + 8)
					.includes(`window.${nama}`);
				if (!eksplisit && terikatLokal(sumber, nama)) continue;

				const mulai = cocok.index + (cocok[1]?.length ?? 0);
				pelanggaran.push({
					berkas,
					baris: sumber.slice(0, mulai).split("\n").length,
					cuplikan: sumber
						.slice(mulai, mulai + 80)
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
