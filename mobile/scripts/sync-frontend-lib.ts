import { cpSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const desktopSrc = join(__dirname, "../../web-desktop/src");
const mobileSrc = join(__dirname, "../src");

const desktopIcons = join(__dirname, "../../web-desktop/src-tauri/icons");
const mobileIcons = join(__dirname, "../src-tauri/icons");

if (existsSync(desktopIcons)) {
  mkdirSync(mobileIcons, { recursive: true });
  cpSync(desktopIcons, mobileIcons, { recursive: true });
  console.log("Copied icons to src-tauri/icons");
}

/**
 * Berkas tunggal yang disalin apa adanya dari web-desktop.
 *
 * Tiga komponen di bawah SUDAH identik byte-per-byte di kedua workspace, dan
 * daftar ini yang membuat kesamaan itu terjaga alih-alih kebetulan. Sebelumnya
 * seluruh folder `components/` berada di luar sinkronisasi, sehingga sebuah
 * perbaikan bisa mendarat di satu sisi saja tanpa apa pun yang menyadarinya —
 * dan komponen seperti `AutoSyncRunner` menggerakkan mesin sinkronisasi.
 *
 * JANGAN menambahkan komponen yang memang BERBEDA antar-platform ke sini:
 * `DatabaseBackupCard` memakai dialog Storage Access Framework khusus Android,
 * `Modal`, `FeedbackBanner`, dan `StatusBadge` punya kontrak props sendiri,
 * dan `BrandLogo` memakai ukuran bawaan yang berbeda. Menyalinnya akan
 * mematahkan salah satu build.
 */
const filesToCopy = [
  "lib/db.ts",
  "lib/db-schema.ts",
  "lib/db-migrations.ts",
  "components/AutoAlfaRunner.tsx",
  "components/AutoSyncRunner.tsx",
  "components/LivenessCapture.tsx",
];

for (const file of filesToCopy) {
  const src = join(desktopSrc, file);
  const dest = join(mobileSrc, file);
  if (existsSync(src)) {
    cpSync(src, dest);
    console.log(`Copied ${file} to mobile`);
  }
}

const dirsToCopy = [
  "lib/attendance",
  "lib/auth",
  "lib/client",
  "lib/constants",
  "lib/context",
  "lib/contracts",
  "lib/gateways",
  "lib/hooks",
  // Konfigurasi pengirim email sistem dan mesin liveness "Lupa Password":
  // keduanya murni logika lintas platform dan WAJIB identik di kedua workspace
  // karena Web menghitung ulang vonis liveness dengan modul yang sama.
  "lib/mail",
  "lib/operators",
  "lib/rbac",
  "lib/runtime",
  "lib/security",
  "lib/server",
  "lib/services",
  "lib/utils",
  "lib/validations",
  "types",
];

/**
 * Berkas yang HANYA ada di Mobile padahal berada di dalam direktori yang ikut
 * disinkronkan.
 *
 * `cpSync` menyalin per nama dan tidak pernah menghapus, sehingga berkas ini
 * selamat setiap kali sinkronisasi berjalan — sampai suatu hari `web-desktop`
 * membuat berkas dengan nama yang sama. Saat itu terjadi, versi Mobile-nya
 * tertimpa TANPA SUARA, dan ke-43 titik impor di halaman Mobile mulai memanggil
 * implementasi milik platform lain.
 *
 * Daftar ini mengubah penimpaan senyap itu menjadi kegagalan lantang. Ia BUKAN
 * daftar pengecualian: tidak ada yang dilewati atau disembunyikan — setiap
 * nama di sini justru diperiksa lebih keras daripada berkas lainnya.
 */
const MOBILE_ONLY_IN_SYNCED_DIRS = [
  "lib/client/audio.ts",
  "lib/client/external-link.ts",
  "lib/client/haptics.ts",
  "lib/client/share.ts",
  "lib/client/wakelock.ts",
];

const bentrok = MOBILE_ONLY_IN_SYNCED_DIRS.filter((file) =>
  existsSync(join(desktopSrc, file)),
);
if (bentrok.length > 0) {
  console.error(
    "\nSinkronisasi DIBATALKAN: web-desktop kini memiliki berkas yang selama ini\n" +
      "hanya ada di Mobile. Menyalinnya akan menimpa implementasi Mobile tanpa\n" +
      "suara dan mematahkan halaman yang mengimpornya:\n" +
      bentrok.map((file) => `  • ${file}`).join("\n") +
      "\n\nPindahkan versi Mobile-nya ke luar direktori tersinkronisasi lebih dulu,\n" +
      "lalu hapus namanya dari MOBILE_ONLY_IN_SYNCED_DIRS.\n",
  );
  process.exit(1);
}

for (const dir of dirsToCopy) {
  const src = join(desktopSrc, dir);
  const dest = join(mobileSrc, dir);
  if (existsSync(src)) {
    mkdirSync(dest, { recursive: true });
    cpSync(src, dest, { recursive: true });
    console.log(`Copied ${dir} to mobile`);
  }
}
