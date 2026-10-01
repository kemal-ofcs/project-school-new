// Peluncur Manajemen Sekolah untuk pemasangan tanpa Docker.
//
// Menjalankan tiga proses dan menjaganya tetap hidup: aplikasi admin, situs
// publik, dan proxy HTTPS (Caddy). Dijalankan oleh `node.exe` bawaan paket,
// tanpa dependensi lain.
//
// Kedua aplikasi hanya mendengarkan di 127.0.0.1. Satu-satunya pintu dari
// jaringan adalah Caddy lewat HTTPS: browser hanya mengizinkan kamera (pemindai
// QR, foto bukti) dan cookie login yang aman pada alamat HTTPS.
//
//   node mulai.mjs            menjalankan semuanya
//   node mulai.mjs --periksa  memeriksa `.env` lalu berhenti, tanpa menjalankan apa pun

import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const root = path.dirname(fileURLToPath(import.meta.url));
const exe = process.platform === "win32" ? ".exe" : "";

/** Alamat tanpa port, untuk sertifikat: `192.168.1.10:8443` menjadi `192.168.1.10`. */
function tanpaPort(alamat) {
  return alamat.replace(/:\d+$/, "");
}

/** Port HTTPS sebuah alamat; tanpa port berarti 443. */
function portDari(alamat) {
  return Number(alamat.match(/:(\d+)$/)?.[1] ?? 443);
}

/**
 * Susun lingkungan ketiga proses dari isi `.env`. Mengembalikan daftar masalah
 * bila ada isian wajib yang kosong; pemanggil yang memutuskan berhenti.
 */
export function susunLingkungan(isian, akar) {
  const masalah = [];
  const ambil = (kunci) => (isian[kunci] ?? "").trim();

  const alamatAdmin = ambil("KOS_SITE_ADDRESS");
  const alamatSitus = ambil("KOS_PUBLIC_ADDRESS");
  if (!alamatAdmin) masalah.push("KOS_SITE_ADDRESS belum diisi.");
  if (!alamatSitus) masalah.push("KOS_PUBLIC_ADDRESS belum diisi.");
  if (alamatAdmin && alamatAdmin === alamatSitus) {
    masalah.push(
      "KOS_PUBLIC_ADDRESS harus berbeda dari KOS_SITE_ADDRESS. Pada satu alamat IP, beri situs publik port lain, misalnya 192.168.1.10:8443.",
    );
  }

  const portAdmin = ambil("KOS_PORT_ADMIN") || "3000";
  const portSitus = ambil("KOS_PORT_SITUS") || "3001";
  for (const [nama, port] of [
    ["KOS_PORT_ADMIN", portAdmin],
    ["KOS_PORT_SITUS", portSitus],
  ]) {
    if (!/^\d{2,5}$/.test(port))
      masalah.push(`${nama} harus berupa angka port.`);
  }
  if (portAdmin === portSitus) {
    masalah.push("KOS_PORT_ADMIN dan KOS_PORT_SITUS tidak boleh sama.");
  }

  // Alamat database kosong berarti berkas SQLite di folder `data/`. Jalurnya
  // dibuat mutlak karena kedua aplikasi berjalan dari folder yang berbeda dan
  // harus membuka berkas yang SAMA.
  const berkasDatabase = path
    .join(akar, "data", "sekolah.db")
    .replace(/\\/g, "/");
  const databaseUrl = ambil("KOS_DATABASE_URL") || `file:${berkasDatabase}`;

  const dasar = {
    ...isian,
    NODE_ENV: "production",
    HOSTNAME: "127.0.0.1",
    KOS_DATABASE_URL: databaseUrl,
    // Tepat satu proxy (Caddy) di depan aplikasi.
    KOS_TRUSTED_PROXY_HOPS: "1",
  };

  return {
    masalah,
    alamatAdmin,
    alamatSitus,
    databaseUrl,
    // Port yang harus kosong sebelum menyala, beserta jalan keluarnya.
    portWajib: [
      {
        port: portDari(alamatAdmin),
        saran: `Beri KOS_SITE_ADDRESS port sendiri, misalnya ${tanpaPort(alamatAdmin)}:9443.`,
      },
      {
        port: portDari(alamatSitus),
        saran: `Beri KOS_PUBLIC_ADDRESS port lain, misalnya ${tanpaPort(alamatSitus)}:9444.`,
      },
      {
        port: Number(portAdmin),
        saran: "Ganti KOS_PORT_ADMIN dengan port lain.",
      },
      {
        port: Number(portSitus),
        saran: "Ganti KOS_PORT_SITUS dengan port lain.",
      },
    ],
    memakaiBerkas: databaseUrl.startsWith("file:"),
    admin: { ...dasar, PORT: portAdmin },
    situs: {
      ...dasar,
      PORT: portSitus,
      KOS_SITE_URL: `https://${alamatSitus}`,
    },
    proxy: {
      KOS_SITE_ADDRESS: alamatAdmin,
      KOS_PUBLIC_ADDRESS: alamatSitus,
      KOS_SITE_HOST: tanpaPort(alamatAdmin),
      KOS_TLS: ambil("KOS_TLS") || "internal",
      KOS_WEB_UPSTREAM: `127.0.0.1:${portAdmin}`,
      KOS_PUBLIC_UPSTREAM: `127.0.0.1:${portSitus}`,
      // Sertifikat disimpan di dalam paket, bukan di profil pengguna Windows,
      // supaya ikut tercadangkan bersama folder `data/`.
      XDG_DATA_HOME: path.join(akar, "data", "caddy"),
      XDG_CONFIG_HOME: path.join(akar, "data", "caddy-config"),
    },
  };
}

function prosesHidup(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (galat) {
    // Sinyal 0 hanya menanyakan keberadaan proses. EPERM berarti prosesnya ADA
    // tetapi milik akun lain: peluncur yang dijalankan otomatis oleh Windows
    // berjalan sebagai SYSTEM, dan tanpa cabang ini klik pada Mulai.cmd
    // menyalakan peluncur kedua di atasnya.
    return galat.code === "EPERM";
  }
}

/**
 * Adakah program yang sudah menjawab di port ini?
 *
 * Diperiksa dengan MENYAMBUNG, bukan dengan mencoba mendengarkan. Di Windows,
 * program kedua bisa berhasil mendengarkan di port yang sudah dipakai (Apache
 * mengizinkannya), tanpa galat apa pun, sementara semua sambungan tetap jatuh
 * ke program pertama. Caddy mengalaminya persis begitu: log-nya bersih dan
 * alamat admin menampilkan halaman milik program lain.
 */
function portTerpakai(port) {
  return new Promise((selesai) => {
    const soket = net.connect({ port, host: "127.0.0.1" });
    const jawab = (terpakai) => {
      soket.destroy();
      selesai(terpakai);
    };
    soket.setTimeout(1000);
    soket.once("connect", () => jawab(true));
    soket.once("error", () => jawab(false));
    soket.once("timeout", () => jawab(false));
  });
}

async function utama() {
  const berkasEnv = path.join(root, ".env");
  if (!existsSync(berkasEnv)) {
    console.error(
      "Berkas .env belum ada. Salin .env.example menjadi .env, isi, lalu jalankan lagi.",
    );
    process.exit(1);
  }
  const susunan = susunLingkungan(
    parseEnv(readFileSync(berkasEnv, "utf8")),
    root,
  );
  if (susunan.masalah.length > 0) {
    console.error("Berkas .env belum lengkap:");
    for (const masalah of susunan.masalah) console.error(`  - ${masalah}`);
    process.exit(1);
  }

  console.log("Manajemen Sekolah");
  console.log(`  Aplikasi admin : https://${susunan.alamatAdmin}`);
  console.log(`  Situs publik   : https://${susunan.alamatSitus}`);
  console.log(
    `  Database       : ${susunan.memakaiBerkas ? "berkas di folder data (Web saja)" : "server database dari .env"}`,
  );

  // Diperiksa lebih dulu: bila aplikasi ini sendiri sedang berjalan, port-nya
  // memang terpakai dan itu bukan bentrokan.
  const berkasPid = path.join(root, "data", "mulai.pid");
  if (existsSync(berkasPid)) {
    const lama = Number(readFileSync(berkasPid, "utf8").trim());
    if (Number.isInteger(lama) && lama > 0 && prosesHidup(lama)) {
      console.error(
        `\nSudah berjalan (proses ${lama}). Jalankan Hentikan.cmd lebih dulu bila ingin memulai ulang.`,
      );
      process.exit(1);
    }
  }

  const bentrok = new Map();
  for (const { port, saran } of susunan.portWajib) {
    if (!bentrok.has(port) && (await portTerpakai(port))) {
      bentrok.set(port, saran);
    }
  }
  if (bentrok.size > 0) {
    console.error("\nPort berikut sudah dipakai program lain di komputer ini:");
    for (const [port, saran] of bentrok) {
      console.error(`  - Port ${port}. ${saran}`);
    }
    console.error(
      "Port 443 sering sudah dipakai Aplikasi Dapodik. Ubah berkas .env, lalu jalankan lagi.",
    );
    process.exit(1);
  }
  // Port 80 hanya dipakai untuk mengalihkan `http://` ke `https://`. Bila sudah
  // dipakai program lain, pengalihan itu dimatikan dan aplikasi tetap menyala.
  if (await portTerpakai(80)) {
    susunan.proxy.KOS_AUTO_HTTPS = "auto_https disable_redirects";
    console.log(
      "\nPort 80 sudah dipakai program lain. Alamat yang tidak memakai port wajib diketik dengan https://.",
    );
  }

  if (process.argv.includes("--periksa")) {
    console.log(
      "\nBerkas .env sah dan port-nya kosong. Tidak ada yang dijalankan (--periksa).",
    );
    return;
  }

  mkdirSync(path.join(root, "data"), { recursive: true });
  mkdirSync(path.join(root, "log"), { recursive: true });
  writeFileSync(berkasPid, String(process.pid), "utf8");

  const node = path.join(root, "runtime", `node${exe}`);
  const layanan = [
    {
      nama: "admin",
      perintah: node,
      args: ["server.js"],
      cwd: path.join(root, "app", "admin"),
      env: susunan.admin,
    },
    {
      nama: "situs",
      perintah: node,
      args: ["server.js"],
      cwd: path.join(root, "app", "situs"),
      env: susunan.situs,
    },
    {
      nama: "proxy",
      perintah: path.join(root, "runtime", `caddy${exe}`),
      args: [
        "run",
        "--config",
        path.join(root, "Caddyfile"),
        "--adapter",
        "caddyfile",
      ],
      cwd: root,
      env: susunan.proxy,
    },
  ];

  let berhenti = false;
  const anak = new Map();

  function jalankan(item, jedaMs = 1000) {
    const log = openSync(path.join(root, "log", `${item.nama}.log`), "a");
    const proses = spawn(item.perintah, item.args, {
      cwd: item.cwd,
      env: { ...process.env, ...item.env },
      stdio: ["ignore", log, log],
      windowsHide: true,
    });
    const mulai = Date.now();
    anak.set(item.nama, proses);
    console.log(`[${item.nama}] berjalan (proses ${proses.pid})`);

    const ulang = (alasan) => {
      if (berhenti || anak.get(item.nama) !== proses) return;
      anak.delete(item.nama);
      // Proses yang bertahan lebih dari semenit dianggap sehat, jadi jedanya
      // kembali pendek. Yang langsung mati berulang-ulang ditunggu makin lama,
      // supaya salah konfigurasi tidak memutar CPU tanpa henti.
      const berikut =
        Date.now() - mulai > 60_000 ? 1000 : Math.min(jedaMs * 2, 30_000);
      console.error(
        `[${item.nama}] berhenti (${alasan}). Lihat log/${item.nama}.log. Dijalankan lagi dalam ${Math.round(jedaMs / 1000)} detik.`,
      );
      setTimeout(() => {
        if (!berhenti) jalankan(item, berikut);
      }, jedaMs);
    };
    proses.on("exit", (kode, sinyal) => ulang(sinyal ?? `kode ${kode}`));
    proses.on("error", (galat) => ulang(galat.message));
  }

  function hentikan() {
    if (berhenti) return;
    berhenti = true;
    console.log("\nMenghentikan...");
    for (const proses of anak.values()) proses.kill();
    rmSync(berkasPid, { force: true });
    // Memberi anak proses waktu menutup berkas sebelum peluncur ikut berhenti.
    setTimeout(() => process.exit(0), 500);
  }
  for (const sinyal of ["SIGINT", "SIGTERM", "SIGBREAK", "SIGHUP"]) {
    process.on(sinyal, hentikan);
  }

  for (const item of layanan) jalankan(item);
  console.log("\nBiarkan jendela ini terbuka. Tekan Ctrl+C untuk berhenti.");
}

// Hanya berjalan saat dipanggil langsung, supaya `susunLingkungan` bisa diuji.
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await utama();
}
