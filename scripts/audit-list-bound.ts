/**
 * Audit daftar tak terbatas.
 *
 * Sebuah query tanpa `LIMIT` atas tabel yang tumbuh setiap hari operasional
 * tidak pernah terasa salah saat ditulis: pada database pengembangan ia
 * mengembalikan dua puluh baris. Ia menjadi salah secara diam-diam, berbulan
 * kemudian, di sekolah yang sudah berjalan — dan yang menanggungnya adalah
 * perangkat paling lemah yang memakai aplikasi ini.
 *
 * `getRekapHarian` adalah contohnya: tipe filternya tidak punya `limit` sama
 * sekali, sehingga TIDAK ADA pemanggil yang bisa membatasinya. Pada 800
 * personil dengan rentang satu bulan ia mengembalikan ±24.000 baris, seluruhnya
 * dirender ke satu tabel.
 *
 * KRITERIA "TUMBUH" — dan mengapa ia bukan sekadar "tabel besar":
 * yang dihitung bukan jumlah barisnya hari ini, melainkan apakah barisnya
 * bertambah setiap hari operasional tanpa ada yang memangkasnya. `master_data`
 * berisi 800 personil dan itu banyak, tetapi jumlahnya dibatasi oleh
 * institusinya; `absensi_harian` tidak dibatasi apa pun kecuali waktu. Sebuah
 * daftar shift atau daftar hari libur tidak akan pernah menjadi masalah, dan
 * menuduhnya hanya akan membuat gerbang ini dimatikan orang.
 *
 * UNIT PEMERIKSAANNYA SATU QUERY, BUKAN SATU FUNGSI. `dashboard_data` di Rust
 * adalah satu fungsi dengan banyak cabang `kind`; cabang "top" punya `LIMIT`
 * dan cabang "daily" tidak. Memeriksa per fungsi akan membuat yang pertama
 * memaafkan yang kedua — bentuk kesalahan yang sama seperti memeriksa apakah
 * sebuah berkas "menyebut" `isSubmittingRef` alih-alih memakainya.
 *
 * DILARANG menambahkan daftar pengecualian. Ada dua penanda yang boleh ditulis
 * DI DALAM query-nya, dan keduanya menuntut alasan tertulis di tempat query itu
 * berada — bukan di sebuah daftar terpisah yang tidak pernah dibaca ulang:
 *
 *   `-- batas: …`         query ini terbatas karena alasan yang tidak terlihat
 *                         dari SQL-nya sendiri.
 *   `-- sengaja-utuh: …`  query ini memang TIDAK boleh dibatasi. Snapshot
 *                         sinkronisasi contohnya: memotongnya membuat perangkat
 *                         menarik data tak lengkap lalu menganggapnya lengkap,
 *                         dan kegagalan itu tidak meninggalkan jejak apa pun.
 *
 * Penanda kedua TIDAK menyembunyikan apa pun: query yang memakainya tetap
 * dihitung dan tetap didaftar setiap kali gerbang ini berjalan. Audit yang
 * menyembunyikan cakupannya sendiri membusuk menjadi lulus palsu, persis
 * seperti `schema-audit.ts` lama yang melaporkan "100% KONSISTEN" sambil
 * memeriksa nol tabel.
 */

import fs from "node:fs";
import path from "node:path";

import { petikRust } from "./lib/rust-literals";

const rootDir = path.resolve(import.meta.dir, "..");

/**
 * Tabel yang barisnya bertambah tiap hari operasional dan tidak dipangkas.
 * Alasannya ditulis supaya penambahan berikutnya harus memenuhi kriteria yang
 * sama, bukan sekadar "terasa besar".
 */
const TABEL_TUMBUH: Record<string, string> = {
	absensi_harian: "satu baris per personil per hari",
	log_scan: "satu baris per pemindaian",
	presensi_mapel: "satu baris per kelas per jam pelajaran per hari",
	presensi_mapel_detail: "satu baris per siswa per jam pelajaran",
	absensi_foto: "satu baris per pemindaian berfoto",
	notifikasi_wa: "dua baris per siswa per hari",
	jurnal_mengajar: "satu baris per sesi mengajar",
	payroll_items: "satu baris per personil per periode gaji",
	leger_kehadiran: "satu baris per siswa per periode rapor",
};

const SUMBER: Array<{ dir: string; ext: ".ts" | ".rs" }> = [
	{ dir: "web-desktop/src/lib/services", ext: ".ts" },
	{ dir: "web-desktop/src/lib/server", ext: ".ts" },
	{ dir: "web-desktop/src-tauri/src/desktop", ext: ".rs" },
	{ dir: "mobile/src-tauri/src/mobile", ext: ".rs" },
	// Situs publik, sejak Fase 5.0. Portal wali membaca `absensi_harian` dan
	// `presensi_mapel_detail` — dua tabel yang tumbuh setiap hari operasional —
	// dan membacanya untuk pengunjung yang tidak diundang siapa pun. Di panel
	// admin, query tak berbatas menghasilkan halaman yang lambat bagi satu
	// operator; di sini ia menghasilkan endpoint yang bisa dipanggil berulang
	// dari luar.
	{ dir: "web-public/src/lib/services", ext: ".ts" },
	{ dir: "web-public/src/lib/server", ext: ".ts" },
];

interface Pelanggaran {
	berkas: string;
	baris: number;
	tabel: string;
	alasan: string;
	cuplik: string;
}

function heading(text: string) {
	console.log(`\n${"─".repeat(70)}\n${text}\n${"─".repeat(70)}`);
}

function kumpulkan(direktori: string, ext: string, hasil: string[] = []): string[] {
	if (!fs.existsSync(direktori)) return hasil;
	for (const entri of fs.readdirSync(direktori, { withFileTypes: true })) {
		const penuh = path.join(direktori, entri.name);
		if (entri.isDirectory()) {
			if (entri.name === "node_modules" || entri.name === "target") continue;
			kumpulkan(penuh, ext, hasil);
		} else if (entri.name.endsWith(ext) && !entri.name.endsWith(`.test${ext}`)) {
			hasil.push(penuh);
		}
	}
	return hasil;
}

/**
 * Query yang dirakit bertahap: `let q = \`SELECT …\`` lalu `q += " WHERE …"`.
 *
 * Tanpa melipat potongan-potongan itu, justru query yang paling mungkin salah —
 * yang cabangnya dirakit saat runtime — akan tampak tidak punya WHERE maupun
 * LIMIT sama sekali, dan gerbangnya menuduh berdasarkan potongan, bukan
 * berdasarkan query yang benar-benar dijalankan.
 */
function lipatRakitan(sumber: string, indeksLiteral: number, variabel: string): string {
	let gabung = "";

	// Pelipatan berhenti di DEKLARASI ULANG variabel yang sama. Tanpa batas ini
	// `getRekapHarian` menyerap `GROUP BY` milik `getRekapBulanan` di bawahnya —
	// keduanya memakai nama `query` — sehingga query tak terbatas diloloskan
	// oleh potongan fungsi lain. Ini bentuk kesalahan yang sama seperti
	// memeriksa per fungsi alih-alih per query, hanya satu tingkat lebih halus.
	const ulang = new RegExp(`(?:let|const|var)\\s+(?:mut\\s+)?${variabel}\\s*(?::|=)`, "g");
	ulang.lastIndex = indeksLiteral;
	const berikutnya = ulang.exec(sumber);
	const batasAkhir = berikutnya ? berikutnya.index : sumber.length;
	// TypeScript: `q += " AND … LIMIT ?"`.
	// Rust: `q.push_str(" AND …")` dan `q.push_str(&format!(" LIMIT {n};"))`.
	const pola = new RegExp(
		`\\b${variabel}\\s*(?:\\+=|\\.push_str\\s*\\(\\s*&?(?:format!\\s*\\()?)\\s*` +
			`(?:\`([\\s\\S]*?)\`|"((?:[^"\\\\]|\\\\.)*)")`,
		"g",
	);
	pola.lastIndex = indeksLiteral;
	for (const cocok of sumber.matchAll(pola)) {
		if (cocok.index === undefined || cocok.index < indeksLiteral) continue;
		if (cocok.index >= batasAkhir) break;
		gabung += ` ${cocok[1] ?? cocok[2] ?? ""}`;
	}
	return gabung;
}

/**
 * Nama variabel yang menerima literal ini, bila ada.
 *
 * Menangkap `let q = \`…\`` (TS) maupun `let mut q = String::from(r#"…"#)`
 * (Rust) — tanpa bentuk kedua, seluruh query Rust yang dirakit bertahap akan
 * dinilai dari penggalan pembukanya saja, yang memang belum punya LIMIT.
 */
function variabelPenerima(sumber: string, indeksLiteral: number): string | null {
	const sebelum = sumber.slice(Math.max(0, indeksLiteral - 160), indeksLiteral);
	const cocok =
		/(?:let|const|var)\s+(?:mut\s+)?(\w+)\s*(?::[^=]+)?=\s*(?:String::from\s*\(\s*)?$/.exec(
			sebelum,
		);
	return cocok ? (cocok[1] as string) : null;
}

/**
 * Query ini sudah terbatas?
 *
 * Tiga bentuk diterima, dan ketiganya benar-benar dipakai repo ini:
 *   1. `LIMIT` eksplisit;
 *   2. agregat/GROUP BY, yang mengerucutkan hasil ke jumlah kelompok;
 *   3. penguncian kesetaraan pada tanggal atau id induk — TETAPI hanya bila
 *      query yang sama tidak juga punya cabang rentang. `getRekapHarian` punya
 *      keduanya: cabang `tanggal = ?` aman, cabang `>= ? AND <= ?` tidak, dan
 *      memperlakukan yang pertama sebagai bukti akan meloloskan yang kedua.
 */
function terbatas(sql: string): { ok: boolean; alasan: string } {
	const atas = sql.toUpperCase();

	if (/--\s*SENGAJA-UTUH:/i.test(sql))
		return { ok: true, alasan: "sengaja utuh" };
	if (/--\s*BATAS:/i.test(sql)) return { ok: true, alasan: "alasan tertulis" };
	if (/\bLIMIT\b/.test(atas)) return { ok: true, alasan: "LIMIT" };
	if (/\bGROUP\s+BY\b/.test(atas)) return { ok: true, alasan: "GROUP BY" };
	if (/\bSELECT\s+(?:DISTINCT\s+)?(COUNT|SUM|AVG|TOTAL|MAX|MIN)\s*\(/.test(atas))
		return { ok: true, alasan: "agregat" };

	const adaRentang = /(>=\s*[?'{]|<=\s*[?'{]|\bBETWEEN\b)/.test(atas);
	// Skema ini memakai awalan `id_` (`id_rombel`, `id_tahun_ajaran`), bukan
	// akhiran `_id`. Mencari hanya bentuk kedua membuat query leger yang
	// terkunci pada satu rombel dituduh tak terbatas.
	const adaPin =
		/\bTANGGAL\s*=\s*(\?|'|\{)/.test(atas) ||
		/\bID_\w+\s*=\s*(\?|'|\{)/.test(atas) ||
		/\b\w+_ID\s*=\s*(\?|'|\{)/.test(atas);
	if (adaPin && !adaRentang)
		return { ok: true, alasan: "terkunci pada satu tanggal/induk" };

	return { ok: false, alasan: "" };
}

heading("Audit Daftar Tak Terbatas — query atas tabel yang tumbuh tiap hari");

let diperiksa = 0;
let lolos = 0;
const pelanggaran: Pelanggaran[] = [];
const sengajaUtuh: Pelanggaran[] = [];

for (const { dir, ext } of SUMBER) {
	for (const berkasAbsolut of kumpulkan(path.join(rootDir, dir), ext)) {
		const sumber = fs.readFileSync(berkasAbsolut, "utf8");
		const berkas = path.relative(rootDir, berkasAbsolut).split(path.sep).join("/");

		// Di TypeScript, SQL tidak selalu ditulis dalam template literal:
		// `snapshot.ts` menaruh sebagian querynya sebagai string berkutip biasa.
		// Membaca backtick saja membuat query itu tidak terlihat sama sekali —
		// lubang cakupan yang diam, persis yang membuat `schema-audit.ts` lama
		// melaporkan "100% KONSISTEN" sambil memeriksa nol tabel.
		const literal: Array<{ isi: string; index: number }> =
			ext === ".rs"
				? // Query di dalam `mod tests` hanya menegaskan isi fixture berisi
					// segelintir baris; menuduhnya berarti menuduh kode yang benar.
					petikRust(sumber, { tanpaModulTes: true })
				: [
						...sumber.matchAll(/`([\s\S]*?)`/g),
						...sumber.matchAll(/"((?:[^"\\\n]|\\.)*)"/g),
					].map((cocok) => ({
						isi: cocok[1] as string,
						index: cocok.index ?? 0,
					}));

		for (const { isi: mentah, index: indeks } of literal) {
			if (!/^\s*(SELECT|WITH)\b/i.test(mentah)) continue;

			// `query_row` mengembalikan tepat satu baris menurut konstruksinya,
			// berapa pun besar tabelnya. Menuduhnya berarti menuduh kode yang
			// tidak mungkin salah, dan gerbang yang berbuat begitu akan dimatikan.
			const sebelumLiteral = sumber.slice(Math.max(0, indeks - 90), indeks);
			if (/\bquery_row\s*\(/.test(sebelumLiteral)) continue;

			let sql = mentah;
			const variabel = variabelPenerima(sumber, indeks);
			if (variabel) sql += lipatRakitan(sumber, indeks, variabel);

			const tabel = Object.keys(TABEL_TUMBUH).find((nama) =>
				new RegExp(`\\b(FROM|JOIN)\\s+${nama}\\b`, "i").test(sql),
			);
			if (!tabel) continue;

			diperiksa++;
			const vonis = terbatas(sql);
			if (vonis.ok) {
				lolos++;
				if (vonis.alasan === "sengaja utuh") {
					sengajaUtuh.push({
						berkas,
						baris: sumber.slice(0, indeks).split("\n").length,
						tabel,
						alasan: (/--\s*sengaja-utuh:\s*(.*)/i.exec(sql)?.[1] ?? "").trim(),
						cuplik: "",
					});
				}
				continue;
			}

			pelanggaran.push({
				berkas,
				baris: sumber.slice(0, indeks).split("\n").length,
				tabel,
				alasan: TABEL_TUMBUH[tabel] as string,
				cuplik: sql.replace(/\s+/g, " ").trim().slice(0, 96),
			});
		}
	}
}

console.log(`  Query atas tabel tumbuh : ${diperiksa}`);
console.log(`  Sudah terbatas          : ${lolos}`);
console.log(`  Sengaja utuh            : ${sengajaUtuh.length}`);
console.log(`  Tanpa batas             : ${pelanggaran.length}`);

// Dilaporkan SETIAP kali, bukan hanya saat gerbang merah: sebuah query yang
// sengaja tidak dibatasi adalah keputusan yang harus tetap terlihat.
if (sengajaUtuh.length > 0) {
	heading("Sengaja utuh — tidak boleh dibatasi, dan alasannya");
	for (const { berkas, baris, tabel, alasan } of sengajaUtuh) {
		console.log(`  • ${berkas}:${baris} [${tabel}]`);
		console.log(`    ${alasan || "(alasan tidak ditulis)"}`);
	}
}

if (pelanggaran.length > 0) {
	heading("Pelanggaran");
	for (const { berkas, baris, tabel, alasan, cuplik } of pelanggaran) {
		console.log(`  ❌ ${berkas}:${baris}`);
		console.log(`     ${tabel} — ${alasan}`);
		console.log(`     ${cuplik}…`);
	}
	console.error(
		`\n❌ ${pelanggaran.length} query tanpa batas atas tabel yang tumbuh tiap hari.\n` +
			"   Pasang LIMIT yang dijepit di lapisan servis (pola yang sudah dipakai\n" +
			"   getRiwayatScan dan wa-notification), kerucutkan dengan agregat, atau —\n" +
			"   bila ia memang terbatas karena alasan yang tak terlihat dari SQL-nya —\n" +
			'   tulis alasan itu sebagai komentar "-- batas: …" di dalam query.\n',
	);
	process.exit(1);
}
console.log("\n🎉 Setiap query atas tabel yang tumbuh punya batasnya.\n");
