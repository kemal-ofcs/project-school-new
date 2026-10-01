/**
 * bun run paket:build [--versi 1.2.0]
 *
 * Paket Windows TANPA Docker untuk versi Web. Hasilnya satu folder dan satu zip
 * di `rilis/`, siap diserahkan ke pembeli:
 *
 *   manajemen-sekolah-<versi>-windows/
 *     app/admin, app/situs     hasil build `standalone` kedua aplikasi
 *     runtime/node.exe         Node.js, versinya dipatok di bawah
 *     runtime/caddy.exe        proxy HTTPS, versinya dipatok di bawah
 *     mulai.mjs, *.cmd         peluncur dan berkas pemasangan (deploy/windows)
 *     Caddyfile                sama dengan paket Docker (deploy/Caddyfile)
 *     .env.example, README.md  panduan untuk teknisi sekolah
 *
 * Hanya berjalan di Windows 64-bit: build standalone membawa pustaka database
 * (libSQL) dalam bentuk biner milik mesin yang membangunnya, jadi paket yang
 * dirakit di Linux tidak akan menyala di Windows.
 *
 * Tiga hal di sini berbentuk "build tetap hijau" dan karena itu DIPERIKSA,
 * bukan diasumsikan:
 *   1. Next.js menyalin setiap `.env*` ke `.next/standalone/`. Di jalur Docker
 *      `.dockerignore` menahannya; di sini build berjalan di folder kerja
 *      pengembang, tempat `.env` berisi alamat dan token database sungguhan.
 *   2. Source (`.ts`, `.tsx`, `.rs`) dan source map tidak boleh ikut.
 *   3. Node dan Caddy diunduh dari internet, jadi checksum-nya dicocokkan
 *      dengan nilai yang dipatok sebelum berkasnya dipakai.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { parseArgs, parseEnv } from "node:util";
import { versiSah } from "./build-images";

const rootDir = path.resolve(import.meta.dir, "..");
const PRODUCT = "manajemen-sekolah";

const APLIKASI = [
  { workspace: "web-desktop", folder: "admin", build: "build:web" },
  { workspace: "web-public", folder: "situs", build: "build" },
] as const;

/**
 * Berkas pihak ketiga yang ikut paket. Menaikkan versi berarti mengganti URL
 * DAN checksum-nya; checksum diambil dari halaman rilis resminya
 * (`SHASUMS256.txt` milik Node, `checksums.txt` milik Caddy).
 */
const NODE_VERSI = "22.23.3";
const CADDY_VERSI = "2.11.4";
const UNDUHAN = {
  node: {
    berkas: `node-${NODE_VERSI}.exe`,
    url: `https://nodejs.org/dist/v${NODE_VERSI}/win-x64/node.exe`,
    algoritme: "sha256",
    checksum:
      "9c9245166b4a8e182e0b797da9c20136117ff24368eaff1fec8343a123c8db0e",
  },
  lisensiNode: {
    berkas: `LICENSE-node-${NODE_VERSI}.txt`,
    url: `https://raw.githubusercontent.com/nodejs/node/v${NODE_VERSI}/LICENSE`,
    algoritme: "sha256",
    checksum:
      "c738ae413cf561f174e34f6961f8ca458aae2369a73640dda6234c629b98bcc4",
  },
  caddy: {
    berkas: `caddy-${CADDY_VERSI}.zip`,
    url: `https://github.com/caddyserver/caddy/releases/download/v${CADDY_VERSI}/caddy_${CADDY_VERSI}_windows_amd64.zip`,
    algoritme: "sha512",
    checksum:
      "cd5ccfd86a4b40732cf715890d0dca5bf3f63adefec5a7914de85adf240c60ce7e5d2791631b88ef9758e46b23bb1730e020b9c5d696889740b284ffd4788e35",
  },
} as const;

function gagal(pesan: string): never {
  console.error(`\nGagal: ${pesan}`);
  process.exit(1);
}

function jalankan(
  perintah: string,
  args: string[],
  cwd: string,
  env?: NodeJS.ProcessEnv,
) {
  console.log(`\n$ ${perintah} ${args.join(" ")}`);
  const hasil = spawnSync(perintah, args, { cwd, env, stdio: "inherit" });
  if (hasil.error) gagal(hasil.error.message);
  if (hasil.status !== 0) {
    gagal(
      `"${perintah} ${args.join(" ")}" berhenti dengan kode ${hasil.status}.`,
    );
  }
}

/** Semua berkas di bawah `folder`, sebagai jalur relatif bergaris miring. */
function daftarBerkas(folder: string, awalan = ""): string[] {
  return readdirSync(path.join(folder, awalan), {
    withFileTypes: true,
  }).flatMap((isi) => {
    const relatif = awalan ? `${awalan}/${isi.name}` : isi.name;
    return isi.isDirectory() ? daftarBerkas(folder, relatif) : [relatif];
  });
}

const dalamNodeModules = (relatif: string) =>
  relatif.split("/").includes("node_modules");

/**
 * Berkas yang tidak boleh sampai ke pembeli: `.env*` (kecuali contoh di akar
 * paket), source, dan source map. Aturannya sama dengan langkah pemeriksaan di
 * kedua `Dockerfile`. `node_modules` dikecualikan dengan alasan yang sama:
 * pustaka pihak ketiga memang membawa berkas `.ts` dan `.map` miliknya sendiri.
 */
export function berkasTerlarang(daftar: string[]) {
  return daftar.filter((relatif) => {
    if (relatif === ".env.example" || dalamNodeModules(relatif)) return false;
    const nama = relatif.slice(relatif.lastIndexOf("/") + 1);
    return nama.startsWith(".env") || /\.(ts|tsx|rs|map)$/.test(nama);
  });
}

/** Berkas `.env*` berisi nilai sungguhan di sebuah workspace (bukan contoh). */
function berkasEnvPengembang(workspace: string) {
  const folder = path.join(rootDir, workspace);
  return readdirSync(folder)
    .filter((nama) => nama.startsWith(".env") && nama !== ".env.example")
    .map((nama) => path.join(folder, nama));
}

/**
 * Lingkungan build yang setara dengan jalur Docker: setiap kunci di `.env`
 * pengembang dikosongkan. Next.js tidak menimpa variabel yang sudah ada di
 * lingkungan proses, jadi `.env` itu tidak terbaca selama build dan build tidak
 * pernah menyentuh database pengembang.
 */
function lingkunganBuild(workspace: string): NodeJS.ProcessEnv {
  const kosong: Record<string, string> = {};
  for (const berkas of berkasEnvPengembang(workspace)) {
    for (const kunci of Object.keys(parseEnv(readFileSync(berkas, "utf8")))) {
      kosong[kunci] = "";
    }
  }
  return {
    ...process.env,
    ...kosong,
    NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1",
    KOS_BUILD_STANDALONE: "1",
    // Paket pembeli SELALU menegakkan lisensi. Nilainya ditanam ke hasil build
    // (lihat `next.config.ts`), jadi tidak bisa dimatikan lewat `.env` pembeli.
    KOS_LICENSE_ENFORCED: "1",
  };
}

/**
 * Nilai rahasia dari semua `.env` pengembang: token, password, dan alamat.
 * Dipakai untuk menyisir paket; hanya NAMA kuncinya yang pernah dicetak.
 */
function rahasiaPengembang() {
  const rahasia = new Map<string, string>();
  for (const workspace of ["web-desktop", "web-public", "mobile"]) {
    for (const berkas of berkasEnvPengembang(workspace)) {
      const isi = parseEnv(readFileSync(berkas, "utf8"));
      for (const [kunci, nilai] of Object.entries(isi)) {
        // Nilai pendek ("24", "1") akan cocok dengan apa saja.
        if (
          nilai &&
          nilai.length >= 12 &&
          /TOKEN|PASSWORD|SECRET|_KEY|_URL$/.test(kunci)
        ) {
          rahasia.set(nilai, `${kunci} (${workspace})`);
        }
      }
    }
  }
  return rahasia;
}

async function unduh(
  cache: string,
  unduhan: (typeof UNDUHAN)[keyof typeof UNDUHAN],
) {
  const tujuan = path.join(cache, unduhan.berkas);
  const cocok = () =>
    createHash(unduhan.algoritme).update(readFileSync(tujuan)).digest("hex") ===
    unduhan.checksum;
  if (existsSync(tujuan) && cocok()) return tujuan;

  console.log(`\nMengunduh ${unduhan.url}`);
  const jawaban = await fetch(unduhan.url);
  if (!jawaban.ok) {
    gagal(`Unduhan ${unduhan.url} menjawab ${jawaban.status}.`);
  }
  writeFileSync(tujuan, Buffer.from(await jawaban.arrayBuffer()));
  if (!cocok()) {
    rmSync(tujuan, { force: true });
    gagal(
      `Checksum ${unduhan.berkas} tidak cocok dengan nilai yang dipatok. Berkasnya dibuang.`,
    );
  }
  return tujuan;
}

function keluaran(perintah: string, args: string[]) {
  const hasil = spawnSync(perintah, args, { encoding: "utf8" });
  return hasil.status === 0 ? hasil.stdout.trim() : "";
}

async function utama() {
  if (process.platform !== "win32" || process.arch !== "x64") {
    gagal(
      "Paket Windows hanya bisa dirakit di Windows 64-bit. Untuk Linux, pakai `bun run image:build`.",
    );
  }
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: { versi: { type: "string" } },
  });
  const paket = JSON.parse(
    readFileSync(path.join(rootDir, "web-desktop/package.json"), "utf8"),
  ) as { version?: string };
  const versi = values.versi ?? paket.version ?? "";
  if (!versiSah(versi)) {
    gagal(
      `Versi "${versi}" tidak sah. Pakai huruf, angka, titik, garis bawah, atau tanda minus, mis. --versi 1.2.0.`,
    );
  }
  // `tar.exe` bawaan Windows (bsdtar) bisa membaca dan menulis zip. Jalurnya
  // dieja penuh karena `tar` milik Git Bash tidak bisa.
  const tar = path.join(
    process.env.SystemRoot ?? "C:\\Windows",
    "System32",
    "tar.exe",
  );
  if (!existsSync(tar)) gagal(`${tar} tidak ditemukan.`);

  const cache = path.join(rootDir, "rilis", ".cache");
  mkdirSync(cache, { recursive: true });
  const nodeExe = await unduh(cache, UNDUHAN.node);
  const lisensiNode = await unduh(cache, UNDUHAN.lisensiNode);
  const caddyZip = await unduh(cache, UNDUHAN.caddy);

  for (const aplikasi of APLIKASI) {
    const workspace = path.join(rootDir, aplikasi.workspace);
    // Dibuang dulu: bila build tidak menghasilkan standalone, yang terbungkus
    // tidak boleh sisa build lama.
    rmSync(path.join(workspace, ".next", "standalone"), {
      recursive: true,
      force: true,
    });
    jalankan(
      "bun",
      ["run", aplikasi.build],
      workspace,
      lingkunganBuild(aplikasi.workspace),
    );
    if (!existsSync(path.join(workspace, ".next", "standalone", "server.js"))) {
      gagal(
        `${aplikasi.workspace} tidak menghasilkan .next/standalone/server.js.`,
      );
    }
  }

  const nama = `${PRODUCT}-${versi}-windows`;
  const folder = path.join(rootDir, "rilis", nama);
  rmSync(folder, { recursive: true, force: true });
  mkdirSync(path.join(folder, "runtime"), { recursive: true });

  for (const aplikasi of APLIKASI) {
    const workspace = path.join(rootDir, aplikasi.workspace);
    const tujuan = path.join(folder, "app", aplikasi.folder);
    // `dereference`: tautan simbolik tidak bertahan di dalam zip.
    const salin = (dari: string, ke: string) =>
      cpSync(dari, ke, { recursive: true, dereference: true });
    salin(path.join(workspace, ".next", "standalone"), tujuan);
    salin(
      path.join(workspace, ".next", "static"),
      path.join(tujuan, ".next", "static"),
    );
    const publik = path.join(workspace, "public");
    if (existsSync(publik)) salin(publik, path.join(tujuan, "public"));
  }

  copyFileSync(nodeExe, path.join(folder, "runtime", "node.exe"));
  copyFileSync(lisensiNode, path.join(folder, "runtime", "LICENSE-node.txt"));
  jalankan(
    tar,
    [
      "-xf",
      caddyZip,
      "-C",
      path.join(folder, "runtime"),
      "caddy.exe",
      "LICENSE",
    ],
    rootDir,
  );
  copyFileSync(
    path.join(folder, "runtime", "LICENSE"),
    path.join(folder, "runtime", "LICENSE-caddy.txt"),
  );
  rmSync(path.join(folder, "runtime", "LICENSE"));

  const deploy = path.join(rootDir, "deploy");
  copyFileSync(path.join(deploy, "Caddyfile"), path.join(folder, "Caddyfile"));
  for (const berkas of readdirSync(path.join(deploy, "windows"))) {
    copyFileSync(
      path.join(deploy, "windows", berkas),
      path.join(folder, berkas),
    );
  }

  // Buang yang diketahui ikut tersalin, lalu PERIKSA. Menghapus tanpa memeriksa
  // hanya memindahkan kepercayaan.
  for (const relatif of daftarBerkas(folder)) {
    const nama = relatif.slice(relatif.lastIndexOf("/") + 1);
    const env = nama.startsWith(".env") && relatif !== ".env.example";
    if ((env || nama.endsWith(".map")) && !dalamNodeModules(relatif)) {
      rmSync(path.join(folder, relatif));
    }
  }
  const semua = daftarBerkas(folder);
  const terlarang = berkasTerlarang(semua);
  if (terlarang.length > 0) {
    gagal(
      `Berkas yang tidak boleh ikut paket:\n${terlarang.map((b) => `  ${b}`).join("\n")}`,
    );
  }

  // Kedua program di `runtime/` dilewati: biner puluhan megabyte yang tidak
  // pernah menyentuh `.env` pengembang.
  const rahasia = rahasiaPengembang();
  const bocor = new Set<string>();
  for (const relatif of semua) {
    if (relatif.startsWith("runtime/")) continue;
    const isi = readFileSync(path.join(folder, relatif));
    for (const [nilai, kunci] of rahasia) {
      if (isi.includes(nilai)) bocor.add(`${relatif}: nilai ${kunci}`);
    }
  }
  if (bocor.size > 0) {
    gagal(
      `Nilai dari .env pengembang ditemukan di dalam paket:\n${[...bocor].map((b) => `  ${b}`).join("\n")}`,
    );
  }

  // Kedua program benar-benar bisa dijalankan dan versinya yang dipatok.
  const versiNode = keluaran(path.join(folder, "runtime", "node.exe"), [
    "--version",
  ]);
  if (versiNode !== `v${NODE_VERSI}`) {
    gagal(`runtime/node.exe melapor "${versiNode}", bukan v${NODE_VERSI}.`);
  }
  const versiCaddy = keluaran(path.join(folder, "runtime", "caddy.exe"), [
    "version",
  ]);
  if (!versiCaddy.startsWith(`v${CADDY_VERSI} `)) {
    gagal(`runtime/caddy.exe melapor "${versiCaddy}", bukan v${CADDY_VERSI}.`);
  }

  const zip = path.join(rootDir, "rilis", `${nama}.zip`);
  rmSync(zip, { force: true });
  jalankan(
    tar,
    ["-a", "-c", "-f", zip, "-C", path.join(rootDir, "rilis"), nama],
    rootDir,
  );
  if (!existsSync(zip) || statSync(zip).size === 0) {
    gagal(`Zip kosong atau tidak terbentuk: ${zip}`);
  }

  console.log(`\nPaket Windows ${versi} siap diserahkan:`);
  console.log(`  ${zip} (${(statSync(zip).size / 1_048_576).toFixed(0)} MB)`);
  console.log(
    `  ${semua.length} berkas, Node ${versiNode}, Caddy v${CADDY_VERSI}`,
  );
  console.log(
    `  Disisir terhadap ${rahasia.size} nilai rahasia dari .env pengembang: bersih.`,
  );
  console.log(
    "\nLisensi diterbitkan terpisah, setelah pembeli mengirim kode server dari halaman /setup.",
  );
}

if (import.meta.main) await utama();
