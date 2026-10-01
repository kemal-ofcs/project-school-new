/**
 * bun run image:build [--versi 1.2.0]
 *
 * Padanan `tauri:build` untuk versi Web: membangun kedua image Docker (aplikasi
 * admin dan situs publik), lalu menyusun satu folder yang siap diserahkan ke
 * pembeli di `rilis/manajemen-sekolah-<versi>/`:
 *
 *   manajemen-sekolah-<versi>.tar   keempat image, dimuat dengan `docker load`
 *   docker-compose.yml, Caddyfile   dari `deploy/`
 *   .env.example                    dengan nama kedua image sudah terisi
 *   README.md                       panduan pemasangan untuk teknisi sekolah
 *
 * Arsipnya memuat EMPAT image: dua milik aplikasi ini, ditambah database dan
 * proxy yang dirujuk `deploy/docker-compose.yml`. Tanpa dua yang terakhir,
 * `docker compose up` di server pembeli masih harus mengunduhnya dari internet,
 * dan sekolah yang memasang tanpa internet akan gagal di langkah itu.
 *
 * Yang diserahkan adalah folder itu, bukan repo ini. Image-nya tidak memuat
 * source code, dan lisensinya selalu ditegakkan (`web-desktop/Dockerfile` dan
 * `web-public/Dockerfile` menanam sakelarnya saat build).
 *
 * Setiap langkah yang gagal menghentikan skrip dengan kode bukan-nol. Folder
 * rilis yang setengah jadi lebih berbahaya daripada tidak ada folder sama
 * sekali: ia tampak siap dikirim.
 */

import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

const rootDir = path.resolve(import.meta.dir, "..");
const PRODUCT = "manajemen-sekolah";
const IMAGES = [
  { workspace: "web-desktop", name: `${PRODUCT}-web`, env: "KOS_WEB_IMAGE" },
  {
    workspace: "web-public",
    name: `${PRODUCT}-situs`,
    env: "KOS_PUBLIC_IMAGE",
  },
] as const;

function gagal(pesan: string): never {
  console.error(`\nGagal: ${pesan}`);
  process.exit(1);
}

/** Tag Docker yang sah, supaya versi yang salah ketik tidak menjadi nama berkas. */
export function versiSah(versi: string) {
  return /^[0-9A-Za-z][0-9A-Za-z._-]{0,62}$/.test(versi);
}

/**
 * Image pihak ketiga yang dirujuk compose pembeli: setiap baris `image:` yang
 * bukan variabel `${...}`. Dibaca dari berkas compose-nya sendiri, supaya
 * daftar ini tidak ditulis di dua tempat lalu berbeda diam-diam.
 */
export function imagePendukung(compose: string) {
  return [
    ...new Set(
      [...compose.matchAll(/^\s*image:\s*(\S+)\s*$/gm)]
        .map((cocok) => cocok[1] as string)
        .filter((nama) => !nama.startsWith("${")),
    ),
  ];
}

/** Isi `.env.example` pembeli dengan nama image yang baru dibangun. */
export function isiNamaImage(contoh: string, versi: string) {
  let hasil = contoh;
  for (const image of IMAGES) {
    const baris = new RegExp(`^${image.env}=.*$`, "m");
    if (!baris.test(hasil)) {
      throw new Error(
        `deploy/.env.example tidak memuat baris ${image.env}=. Nama image tidak bisa diisikan.`,
      );
    }
    hasil = hasil.replace(baris, `${image.env}=${image.name}:${versi}`);
  }
  return hasil;
}

function jalankan(perintah: string, args: string[], cwd: string) {
  console.log(`\n$ ${perintah} ${args.join(" ")}`);
  const hasil = spawnSync(perintah, args, { cwd, stdio: "inherit" });
  if (hasil.error) {
    const kode = (hasil.error as NodeJS.ErrnoException).code;
    gagal(
      kode === "ENOENT"
        ? "Docker tidak ditemukan. Pasang Docker Desktop (atau Docker Engine), lalu jalankan lagi."
        : hasil.error.message,
    );
  }
  if (hasil.status !== 0) {
    gagal(`"${perintah} ${args[0]}" berhenti dengan kode ${hasil.status}.`);
  }
}

function utama() {
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

  // `docker version` juga gagal bila Docker terpasang tetapi belum dinyalakan,
  // dan itu lebih baik diketahui sekarang daripada setelah build pertama.
  jalankan("docker", ["version", "--format", "{{.Server.Version}}"], rootDir);

  const tags = IMAGES.map((image) => `${image.name}:${versi}`);
  for (const [index, image] of IMAGES.entries()) {
    jalankan(
      "docker",
      ["build", "-t", tags[index] as string, "."],
      path.join(rootDir, image.workspace),
    );
  }

  const deploy = path.join(rootDir, "deploy");
  const pendukung = imagePendukung(
    readFileSync(path.join(deploy, "docker-compose.yml"), "utf8"),
  );
  if (pendukung.length === 0) {
    gagal(
      "deploy/docker-compose.yml tidak memuat image database maupun proxy. Arsip tanpa keduanya tidak bisa dipasang tanpa internet.",
    );
  }
  // Diunduh di sini, di mesin yang punya internet, supaya server pembeli tidak
  // perlu mengunduhnya.
  for (const image of pendukung) jalankan("docker", ["pull", image], rootDir);

  const folder = path.join(rootDir, "rilis", `${PRODUCT}-${versi}`);
  rmSync(folder, { recursive: true, force: true });
  mkdirSync(folder, { recursive: true });

  const arsip = path.join(folder, `${PRODUCT}-${versi}.tar`);
  jalankan("docker", ["save", "-o", arsip, ...tags, ...pendukung], rootDir);

  for (const berkas of ["docker-compose.yml", "Caddyfile", "README.md"]) {
    copyFileSync(path.join(deploy, berkas), path.join(folder, berkas));
  }
  writeFileSync(
    path.join(folder, ".env.example"),
    isiNamaImage(
      readFileSync(path.join(deploy, ".env.example"), "utf8"),
      versi,
    ),
    "utf8",
  );

  // Diperiksa, bukan diasumsikan: `docker save` yang terputus bisa meninggalkan
  // berkas kosong, dan folder itu akan tetap tampak lengkap.
  if (!existsSync(arsip) || statSync(arsip).size === 0) {
    gagal(`Arsip image kosong atau tidak terbentuk: ${arsip}`);
  }
  const ukuranMb = (statSync(arsip).size / 1_048_576).toFixed(0);

  console.log(`\nRilis ${versi} siap diserahkan:`);
  console.log(`  ${folder}`);
  console.log(`    ${PRODUCT}-${versi}.tar (${ukuranMb} MB)`);
  for (const image of [...tags, ...pendukung]) console.log(`      ${image}`);
  console.log("    docker-compose.yml, Caddyfile, .env.example, README.md");
  console.log(
    "\nLisensi diterbitkan terpisah, setelah pembeli mengirim kode server dari halaman /setup.",
  );
}

if (import.meta.main) utama();
