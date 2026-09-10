/**
 * Audit penjaga otorisasi tingkat halaman.
 *
 * Aturan repo menuntut setiap halaman privat menolak pengguna yang tidak
 * berhak, bukan sekadar yang belum login. Sebelum audit ini ada, aturan itu
 * hanya hidup di ingatan penulis kodenya — dan lima permukaan payroll
 * (`payroll`, `payroll/runs`, `payroll/runs/detail`, serta dua padanannya di
 * Mobile) memang hanya memeriksa autentikasi. Akibatnya operator terminal
 * pemindai maupun guru bisa membuka daftar gaji seluruh karyawan beserta slip
 * per orangnya.
 *
 * ## Bagaimana audit ini tahu sebuah halaman bersifat privat
 *
 * Tanpa daftar pengecualian, dan tanpa menebak dari nama folder: sebuah berkas
 * MENGAKU privat ketika ia sendiri mengalihkan pengguna yang belum terautentikasi
 * ke `/login`. Halaman publik — login, forbidden, lupa-password — tidak pernah
 * melakukan itu, sehingga mereka tidak pernah masuk cakupan dan tidak perlu
 * dikecualikan. Pengakuan itu datang dari kodenya sendiri, bukan dari sebuah
 * daftar yang harus dipelihara manusia.
 *
 * ## Yang dihitung sebagai penjaga
 *
 * Pemeriksaan izin saja TIDAK cukup: `payroll/page.tsx` sudah memanggil
 * `hasPermission` sebelum diperbaiki, tetapi hanya untuk menyalakan tombol —
 * datanya tetap termuat. Yang dituntut adalah pemeriksaan izin yang
 * BERKONSEKUENSI NAVIGASI: `canAccessArea`, `hasPermission`, atau
 * `isSuperadmin` yang cabangnya memanggil `redirect`, `router.push`, atau
 * `router.replace`. Perbedaan antara penjaga dan penanda fitur itulah yang
 * membuat celah ini lolos selama ini.
 *
 * Ketiga bentuk penjaga diterima karena ketiganya dipakai dan ketiganya sah:
 * `operators/page.tsx` menuntut `isSuperadmin` — lebih ketat daripada area —
 * dan halaman konfigurasi payroll menuntut `payroll.config.manage` lalu
 * memulangkan pengguna ke `/payroll`.
 *
 * DILARANG menambahkan daftar pengecualian. Halaman yang melanggar diperbaiki.
 */

import fs from "node:fs";
import path from "node:path";

const rootDir = path.resolve(import.meta.dir, "..");
const WORKSPACES = ["web-desktop", "mobile"];

/** Predikat otorisasi yang diakui. */
const PREDIKAT = /\b(canAccessArea|hasPermission|isSuperadmin)\b/g;

/** Panggilan navigasi yang membuat sebuah pemeriksaan menjadi penjaga. */
const NAVIGASI = /\b(redirect|router\.push|router\.replace)\s*\(/;

interface Pelanggaran {
	berkas: string;
	alasan: string;
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
 * Apakah berkas ini mengalihkan pengguna yang belum terautentikasi ke `/login`?
 *
 * Menyebut `"/login"` saja tidak cukup — halaman `forbidden` dan
 * `lupa-password` MENAUT ke sana tanpa menjadi halaman privat. Yang dicari
 * adalah cabang atas `!isAuthenticated` yang navigasinya menuju `/login`.
 */
function mengakuPrivat(sumber: string): boolean {
	for (const cocok of sumber.matchAll(/!\s*isAuthenticated/g)) {
		if (cocok.index === undefined) continue;
		const cabang = sumber.slice(cocok.index, cocok.index + 240);
		if (/["'`]\/login["'`]/.test(cabang) && NAVIGASI.test(cabang)) return true;
	}
	return false;
}

/**
 * Apakah berkas ini memuat data domain?
 *
 * Halaman yang tidak memanggil satu pun gateway tidak menampilkan apa pun yang
 * perlu diotorisasi — `forbidden` adalah justru TUJUAN penolakan, dan halaman
 * lupa-password memang dilayani tanpa sesi. Keduanya keluar dari cakupan lewat
 * sifatnya sendiri, bukan lewat daftar pengecualian.
 */
function memuatDataDomain(sumber: string): boolean {
	return /from\s+["']@\/lib\/gateways\//.test(sumber);
}

/**
 * Adakah pemeriksaan izin yang benar-benar memulangkan pengguna?
 *
 * Dua bentuk sama-sama diterima karena keduanya dipakai di repo ini:
 *
 * - LANGSUNG — `if (!canAccessArea(user, "payroll")) redirect(...)`, gaya
 *   web-desktop.
 * - LEWAT VARIABEL — `const canView = canAccessArea(...)` di atas, lalu
 *   `if (!canView) router.replace(...)` jauh di bawahnya, gaya Mobile.
 *
 * Menuntut bentuk langsung saja akan menuduh halaman Mobile yang sebenarnya
 * sudah benar. Sebaliknya, menerima pemeriksaan izin apa pun tanpa menuntut
 * navigasi akan meloloskan `payroll/page.tsx` versi lama, yang memanggil
 * `hasPermission` hanya untuk menyalakan tombol sementara datanya tetap termuat.
 */
function punyaPenjagaOtorisasi(sumber: string): boolean {
	// Nama variabel yang MENAMPUNG hasil pemeriksaan izin.
	const penanda = [
		...sumber.matchAll(
			/\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*(?:canAccessArea|hasPermission)\s*\(/g,
		),
	].map((cocok) => cocok[1] as string);

	// Penjaga WAJIB berbentuk sebuah kondisi `if`, bukan sekadar penyebutan.
	//
	// Versi pertama audit ini hanya mencari predikat di dekat sebuah navigasi,
	// dan itu meloloskan `mobile/settings/page.tsx`: di sana `user?.isSuperadmin`
	// muncul di dalam DEPENDENCY ARRAY sebuah `useEffect`, tujuh baris di atas
	// `router.replace("/login")` milik tombol keluar. Dua hal yang sama sekali
	// tidak berhubungan terbaca sebagai penjaga.
	for (const cocok of sumber.matchAll(/\bif\s*\(/g)) {
		if (cocok.index === undefined) continue;
		const bukaKurung = cocok.index + cocok[0].length - 1;
		const tutupKurung = penutupKurung(sumber, bukaKurung);
		if (tutupKurung === -1) continue;

		const kondisi = sumber.slice(bukaKurung, tutupKurung + 1);
		const menguji =
			/\b(canAccessArea|hasPermission|isSuperadmin)\b/.test(kondisi) ||
			penanda.some((nama) => new RegExp(`\\b${nama}\\b`).test(kondisi));
		if (!menguji) continue;

		// Badan cabangnya harus benar-benar memulangkan pengguna.
		const badan = sumber.slice(tutupKurung + 1, tutupKurung + 220);
		if (NAVIGASI.test(badan)) return true;
	}

	return false;
}

/**
 * Berapa banyak area BERBEDA yang diperiksa halaman ini?
 *
 * Halaman yang menawarkan jalan ke banyak tujuan berizin — Pengaturan Mobile
 * memeriksa 13 area, Dasbor memeriksa 3 — adalah HUB navigasi, dan pemeriksaan
 * per-kartu itulah otorisasinya: setiap operator berhak membukanya, lalu hanya
 * melihat kartu yang boleh ia lihat.
 *
 * Menuntut satu penjaga tunggal di halaman seperti itu justru berbahaya.
 * Pengaturan Mobile dipetakan ke izin `branding.manage`, yang TIDAK ada di
 * paket bawaan peran operator maupun scanner — memasang penjaganya akan
 * mengurung kedua peran itu tanpa akses ke 2FA, pemulihan password, bahkan
 * tombol keluar, karena di Mobile halaman itulah satu-satunya jalannya.
 *
 * Halaman domain berbeda bentuknya: `operational` memeriksa satu area,
 * `sync` tidak memeriksa apa pun. Merekalah yang dituntut punya penjaga.
 */
const AMBANG_HUB = 3;

function adalahHub(sumber: string): boolean {
	const area = new Set(
		[...sumber.matchAll(/canAccessArea\(\s*user\s*,\s*["']([a-z_]+)["']\s*\)/g)].map(
			(cocok) => cocok[1] as string,
		),
	);
	return area.size >= AMBANG_HUB;
}

/** Indeks kurung tutup yang cocok untuk kurung buka di `buka`. */
function penutupKurung(sumber: string, buka: number): number {
	let kedalaman = 0;
	for (let i = buka; i < sumber.length; i++) {
		const karakter = sumber[i];
		if (karakter === "(") kedalaman++;
		else if (karakter === ")") {
			kedalaman--;
			if (kedalaman === 0) return i;
		}
	}
	return -1;
}

heading("Audit Penjaga Halaman — otorisasi, bukan sekadar autentikasi");

let privat = 0;
let terjaga = 0;
const pelanggaran: Pelanggaran[] = [];
const hub: string[] = [];

for (const workspace of WORKSPACES) {
	for (const berkasAbsolut of kumpulkanTsx(
		path.join(rootDir, workspace, "src/app"),
	)) {
		const sumber = fs.readFileSync(berkasAbsolut, "utf8");
		if (!mengakuPrivat(sumber)) continue;
		if (!memuatDataDomain(sumber)) continue;

		privat++;
		const berkas = path
			.relative(rootDir, berkasAbsolut)
			.split(path.sep)
			.join("/");

		if (adalahHub(sumber)) {
			hub.push(berkas);
			continue;
		}

		if (punyaPenjagaOtorisasi(sumber)) {
			terjaga++;
			continue;
		}
		pelanggaran.push({
			berkas,
			alasan:
				"mengalihkan yang belum login, tetapi tidak menolak yang tidak berhak",
		});
	}
}

console.log(`  Halaman privat  : ${privat}`);
console.log(`  Terjaga         : ${terjaga}`);
console.log(`  Hub navigasi    : ${hub.length} (otorisasinya per-kartu)`);
console.log(`  Melanggar       : ${pelanggaran.length}`);

if (pelanggaran.length > 0) {
	heading("Pelanggaran");
	for (const { berkas, alasan } of pelanggaran) {
		console.log(`  ❌ ${berkas}`);
		console.log(`     ${alasan}`);
	}
}

heading("Ringkasan");
if (pelanggaran.length === 0) {
	console.log(
		"🎉 Setiap halaman yang mengaku privat juga menolak pengguna tak berhak.\n",
	);
} else {
	console.error(
		`❌ ${pelanggaran.length} halaman privat tanpa penjaga otorisasi.\n` +
			"   Tambahkan pemeriksaan `canAccessArea(user, \"<area>\")` yang cabangnya\n" +
			"   memanggil `redirect(\"/forbidden\")` (web-desktop) atau\n" +
			"   `router.replace(\"/dashboard\")` (mobile — static export tidak punya\n" +
			"   rute /forbidden).\n",
	);
	process.exit(1);
}
