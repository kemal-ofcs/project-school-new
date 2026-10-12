/**
 * Pasang ulang setelan rilis Android yang WAJIB, lalu buktikan ia terpasang.
 *
 * MENGAPA SKRIP INI ADA.
 * `src-tauri/gen/android` adalah proyek Gradle hasil generate dan ia
 * di-gitignore. Setiap `tauri android init` — di mesin baru, setelah clone,
 * atau setelah identifier aplikasi berubah — melahirkannya kembali dari
 * template Tauri, dan template itu memasang `isMinifyEnabled = true` pada
 * build release.
 *
 * Pada aplikasi Tauri setelan itu FATAL: R8 memotong nama method JNI internal
 * Tauri, dan aplikasinya mati seketika saat dibuka dengan
 * `UnsatisfiedLinkError`. Bentuk kegagalannya yang membuatnya berbahaya adalah
 * ini: BUILD-NYA TETAP SUKSES. APK terbentuk, Gradle melapor hijau, dan
 * kegagalannya baru muncul di tangan pengguna — bukan di layar orang yang
 * mem-build. Sudah dua kali setelan ini kembali menyala dengan sendirinya
 * dalam satu sesi kerja.
 *
 * Karena itu skrip ini tidak cukup "menambal": ia menambal LALU memeriksa
 * ulang hasilnya, dan berhenti dengan kode keluar bukan-nol bila pemeriksaan
 * itu gagal. Ia dirangkai ke setiap perintah build Android di `package.json`,
 * sehingga tidak ada yang perlu diingat siapa pun.
 *
 * PENANDATANGANAN — kegagalan kedua dengan bentuk yang sama.
 * Template Tauri juga TIDAK memasang `signingConfig` pada build release. APK
 * tetap terbentuk (namanya berakhiran `-unsigned.apk`), Gradle tetap hijau,
 * lalu Android menolak memasangnya dengan pesan "paket tidak valid". Ini yang
 * terjadi setelah identifier diganti dan `tauri android init` dijalankan ulang:
 * baris penandatanganan yang dulu ditambahkan manual ikut hilang. Bila blok
 * release belum punya `signingConfig` sama sekali, skrip ini memasang kunci
 * DEBUG — sama dengan workspace absensi-sppg asal. Konsekuensinya: APK hanya
 * cocok untuk dipasang langsung (sideload), bukan Play Store, dan APK yang
 * di-build di mesin lain bertanda tangan berbeda sehingga tidak bisa
 * memperbarui instalasi yang ada. Untuk distribusi resmi, ganti dengan
 * keystore rilis sendiri — skrip ini tidak menimpa `signingConfig` yang sudah
 * dipasang.
 *
 * IZIN KAMERA & LOKASI — kegagalan ketiga, dan yang paling sunyi.
 * Template Tauri hanya mendeklarasikan `INTERNET`. WebView Tauri (wry) memang
 * meminta izin runtime saat halaman memanggil `getUserMedia` atau
 * `navigator.geolocation`, tetapi Android hanya mau menampilkan dialog untuk
 * izin yang DIDEKLARASIKAN di manifest. Tanpa deklarasi, permintaannya ditolak
 * tanpa dialog, halaman menerima `NotAllowedError`, dan Pengaturan aplikasi
 * bahkan tidak punya entri Kamera untuk dinyalakan manual. Pemindai QR, foto
 * bukti scan, verifikasi wajah "Lupa Password", dan geofence mati semuanya.
 * `uses-feature ... required="false"` menyertai keduanya: tanpa itu, izin
 * kamera/lokasi menyiratkan perangkat WAJIB punya kamera dan GPS, sehingga
 * tablet tanpa kamera belakang tidak bisa memasang aplikasinya.
 *
 * Aturan lengkapnya:
 * `.agents/skills/absensi-sppg-rules/references/04-hardware-and-android-lifecycle.md`
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

const akarMobile = join(import.meta.dir, "..");
const gradle = join(akarMobile, "src-tauri/gen/android/app/build.gradle.kts");
const proguard = join(
  akarMobile,
  "src-tauri/gen/android/app/proguard-rules.pro",
);
const manifest = join(
  akarMobile,
  "src-tauri/gen/android/app/src/main/AndroidManifest.xml",
);
const tauriConf = join(akarMobile, "src-tauri/tauri.conf.json");
const keystoreProperties = join(akarMobile, "src-tauri/keystore.properties");

function keluarDenganPesan(pesan: string): never {
  console.error(`\n❌ ${pesan}\n`);
  process.exit(1);
}

// Berkas di lokasi yang salah tidak menghasilkan galat apa pun: skrip tidak
// menemukannya, diam-diam memakai kunci debug, dan Play Protect menandai APK-nya.
// Pernah terjadi, dan kata sandinya ikut ter-commit karena .gitignore hanya
// mengecualikan lokasi yang benar.
for (const salah of [
  "keystore.properties",
  "src-tauri/gen/keystore.properties",
]) {
  if (existsSync(join(akarMobile, salah))) {
    keluarDenganPesan(
      `mobile/${salah} ada di lokasi yang salah. Pindahkan ke mobile/src-tauri/keystore.properties — tanpa itu APK ditandatangani kunci debug.`,
    );
  }
}

if (!existsSync(gradle)) {
  keluarDenganPesan(
    "Proyek Android belum dibuat (src-tauri/gen/android tidak ada).\n" +
      "   Jalankan `bun run tauri:android:init` lebih dulu — direktori itu\n" +
      "   hasil generate dan sengaja tidak ikut di-commit.",
  );
}

/** Nama paket diambil dari identifier, bukan ditulis ulang di dua tempat. */
function bacaIdentifier(): string {
  const konfigurasi = JSON.parse(readFileSync(tauriConf, "utf8")) as {
    identifier?: string;
  };
  const nilai = konfigurasi.identifier?.trim();
  if (!nilai) {
    keluarDenganPesan("`identifier` tidak ada di src-tauri/tauri.conf.json.");
  }
  return nilai;
}

const identifier = bacaIdentifier();
let berubah = false;

// ── 1. Matikan R8 pada build release ────────────────────────────────────────
let isiGradle = readFileSync(gradle, "utf8");

// Hanya blok `release` yang disentuh: blok `debug` memang sudah false, dan
// mengubah keduanya secara membabi buta akan menyembunyikan bila template
// Tauri suatu saat mengubah bentuk berkasnya.
const blokRelease = /(getByName\("release"\)\s*\{)([\s\S]*?)(\n\s*\})/;
const cocok = blokRelease.exec(isiGradle);
if (!cocok) {
  keluarDenganPesan(
    'Blok `getByName("release")` tidak ditemukan di build.gradle.kts.\n' +
      "   Bentuk template Tauri berubah — periksa berkasnya sebelum menambal\n" +
      "   secara otomatis.",
  );
}

let badan = cocok[2] as string;
if (/isMinifyEnabled\s*=\s*true/.test(badan)) {
  badan = badan.replace(
    /isMinifyEnabled\s*=\s*true/,
    "isMinifyEnabled = false",
  );
  berubah = true;
}
if (!/isMinifyEnabled\s*=/.test(badan)) {
  badan = `\n            isMinifyEnabled = false${badan}`;
  berubah = true;
}
if (!/isShrinkResources\s*=/.test(badan)) {
  badan = badan.replace(
    /(isMinifyEnabled\s*=\s*false)/,
    "$1\n            isShrinkResources = false",
  );
  berubah = true;
}
// Tanpa signingConfig, APK release keluar TANPA tanda tangan dan Android
// menolaknya ("paket tidak valid").
//
// Kunci rilis dipakai bila `src-tauri/keystore.properties` ada. Berkas itu
// SENGAJA di luar `gen/android` (yang dilahirkan ulang setiap
// `tauri android init`) dan di-gitignore: isinya kata sandi keystore. Gradle
// membacanya saat build, jadi kata sandinya tidak pernah tertulis ke
// build.gradle.kts. Tanpa berkas itu, jatuh ke kunci DEBUG seperti semula.
// `signingConfig` lain yang dipasang manual tidak pernah ditimpa.
const SIGNING_DEBUG = 'signingConfig = signingConfigs.getByName("debug")';
const SIGNING_RELEASE = 'signingConfig = signingConfigs.getByName("release")';
const pakaiKunciRilis = existsSync(keystoreProperties);
if (pakaiKunciRilis && badan.includes(SIGNING_DEBUG)) {
  badan = badan.replace(SIGNING_DEBUG, SIGNING_RELEASE);
  berubah = true;
}
if (!/signingConfig\s*=/.test(badan)) {
  badan = `\n            ${pakaiKunciRilis ? SIGNING_RELEASE : SIGNING_DEBUG}${badan}`;
  berubah = true;
}
if (berubah) {
  isiGradle = isiGradle.replace(
    blokRelease,
    (_penuh, awal: string, _lama: string, akhir: string) =>
      `${awal}${badan}${akhir}`,
  );
}
if (pakaiKunciRilis && !isiGradle.includes('create("release")')) {
  const blokSigning = `    signingConfigs {
        // Dipasang oleh patch-android-release.ts. Kata sandi dibaca dari
        // src-tauri/keystore.properties (di-gitignore), bukan ditulis di sini.
        create("release") {
            val keystoreProperties = Properties().apply {
                rootProject.file("../../keystore.properties").inputStream().use { load(it) }
            }
            storeFile = file(keystoreProperties.getProperty("storeFile"))
            storePassword = keystoreProperties.getProperty("storePassword")
            keyAlias = keystoreProperties.getProperty("keyAlias")
            keyPassword = keystoreProperties.getProperty("keyPassword")
        }
    }
`;
  if (!/\n {4}buildTypes \{/.test(isiGradle)) {
    keluarDenganPesan(
      "Blok `buildTypes {` tidak ditemukan di build.gradle.kts — bentuk\n" +
        "   template Tauri berubah, periksa berkasnya sebelum menambal.",
    );
  }
  if (!isiGradle.includes("import java.util.Properties")) {
    isiGradle = `import java.util.Properties\n${isiGradle}`;
  }
  isiGradle = isiGradle.replace(
    /\n {4}buildTypes \{/,
    `\n${blokSigning}    buildTypes {`,
  );
  berubah = true;
}
if (berubah) {
  writeFileSync(gradle, isiGradle);
}

// ── 2. Aturan -keep ─────────────────────────────────────────────────────────
const aturan = [
  "-keep class app.tauri.** { *; }",
  `-keep class ${identifier}.** { *; }`,
];
let isiProguard = existsSync(proguard) ? readFileSync(proguard, "utf8") : "";
const hilang = aturan.filter((baris) => !isiProguard.includes(baris));
if (hilang.length > 0) {
  isiProguard += `\n# --- Aturan wajib proyek (dipasang ulang oleh patch-android-release.ts) ---\n${hilang.join(
    "\n",
  )}\n`;
  writeFileSync(proguard, isiProguard);
  berubah = true;
}

// ── 3. Izin kamera & lokasi di manifest ─────────────────────────────────────
const deklarasiIzin = [
  '<uses-permission android:name="android.permission.CAMERA" />',
  '<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />',
  '<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />',
  '<uses-feature android:name="android.hardware.camera" android:required="false" />',
  '<uses-feature android:name="android.hardware.location.gps" android:required="false" />',
];
/** Dicocokkan per nama, bukan per baris utuh: spasi atau atribut tambahan dari template tidak boleh membuat deklarasi dianggap hilang. */
const namaDeklarasi = (baris: string) =>
  /android:name="([^"]+)"/.exec(baris)?.[1] ?? baris;
const sudahDideklarasikan = (isi: string, baris: string) =>
  isi.includes(`android:name="${namaDeklarasi(baris)}"`);

let isiManifest = existsSync(manifest) ? readFileSync(manifest, "utf8") : "";
const izinHilang = deklarasiIzin.filter(
  (baris) => !sudahDideklarasikan(isiManifest, baris),
);
if (izinHilang.length > 0) {
  const titikSisip = isiManifest.indexOf("<application");
  if (titikSisip < 0) {
    keluarDenganPesan(
      "Tag `<application` tidak ditemukan di AndroidManifest.xml.\n" +
        "   Bentuk template Tauri berubah — periksa berkasnya sebelum menambal\n" +
        "   secara otomatis.",
    );
  }
  const sisipan = `<!-- Izin wajib proyek (dipasang ulang oleh patch-android-release.ts) -->\n    ${izinHilang.join("\n    ")}\n\n    `;
  isiManifest =
    isiManifest.slice(0, titikSisip) + sisipan + isiManifest.slice(titikSisip);
  writeFileSync(manifest, isiManifest);
  berubah = true;
}

// ── 3b. Visibilitas paket untuk penyerahan tautan ──────────────────────────
//
// Sejak Android 11 sebuah aplikasi tidak lagi bisa MELIHAT aplikasi lain tanpa
// mendeklarasikannya. Tanpa blok ini, Intent.ACTION_VIEW yang dipakai tombol
// "WA", "Hubungi Wali", dan tombol telepon tidak menemukan penanganya, dan
// kegagalannya senyap: pengguna menekan tombol dan tidak terjadi apa-apa.
const blokQueries = `    <queries>
        <intent>
            <action android:name="android.intent.action.VIEW" />
            <data android:scheme="tel" />
        </intent>
        <intent>
            <action android:name="android.intent.action.VIEW" />
            <data android:scheme="whatsapp" />
        </intent>
        <intent>
            <action android:name="android.intent.action.VIEW" />
            <data android:scheme="https" />
        </intent>
        <package android:name="com.whatsapp" />
        <package android:name="com.whatsapp.w4b" />
    </queries>

`;

if (!isiManifest.includes("<queries>")) {
  const titikSisipQueries = isiManifest.indexOf("<application");
  if (titikSisipQueries < 0) {
    keluarDenganPesan(
      "Tag `<application` tidak ditemukan saat memasang blok <queries>.",
    );
  }
  isiManifest =
    isiManifest.slice(0, titikSisipQueries) +
    blokQueries +
    isiManifest.slice(titikSisipQueries);
  writeFileSync(manifest, isiManifest);
  berubah = true;
}

// Template Tauri tidak menyebut `allowBackup`, dan bawaan Android adalah
// `true`: folder data aplikasi (vault token database dan `device_id` yang
// menjadi kuncinya) ikut ke backup Google dan ke HP baru lewat transfer data.
if (!/android:allowBackup="false"/.test(isiManifest)) {
  isiManifest = isiManifest.replace(
    /<application(?![^>]*android:allowBackup)/,
    '<application\n        android:allowBackup="false"',
  );
  writeFileSync(manifest, isiManifest);
  berubah = true;
}

// ── 4. Nama aplikasi di peluncur Android ────────────────────────────────────
//
// `productName` di `tauri.conf.json` hanya dibaca saat `tauri android init`
// MEMBUAT `strings.xml`. Pada proyek Android yang sudah terlanjur ada — dan
// direktori itu ada di setiap mesin yang pernah build — mengganti nama di
// konfigurasi tidak mengubah apa pun: APK-nya tetap terpasang dengan nama
// lama, dan build tetap hijau. Karena itu namanya ditambal dari SATU sumber
// yang sama seperti nama paket, bukan ditulis ulang di dua tempat.
function bacaProductName(): string {
  const konfigurasi = JSON.parse(readFileSync(tauriConf, "utf8")) as {
    productName?: string;
  };
  const nilai = konfigurasi.productName?.trim();
  if (!nilai) {
    keluarDenganPesan("`productName` tidak ada di src-tauri/tauri.conf.json.");
  }
  return nilai;
}

/** Teks XML: hanya tiga karakter yang benar-benar wajib di-escape di sini. */
const escapeXml = (nilai: string) =>
  nilai.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const productName = bacaProductName();
const namaAplikasi = escapeXml(productName);
const stringsXml = join(
  akarMobile,
  "src-tauri/gen/android/app/src/main/res/values/strings.xml",
);

if (existsSync(stringsXml)) {
  const isiAwal = readFileSync(stringsXml, "utf8");
  let isiStrings = isiAwal;
  for (const kunci of ["app_name", "main_activity_title"]) {
    const pola = new RegExp(
      `(<string name="${kunci}">)([\\s\\S]*?)(</string>)`,
    );
    if (pola.test(isiStrings)) {
      // Template Tauri membungkus nilainya dengan tanda kutip di dalam tag;
      // bentuk itu dipertahankan supaya spasi di awal/akhir tidak dipangkas
      // Android.
      isiStrings = isiStrings.replace(pola, `$1"${namaAplikasi}"$3`);
    } else {
      isiStrings = isiStrings.replace(
        "</resources>",
        `    <string name="${kunci}">"${namaAplikasi}"</string>\n</resources>`,
      );
    }
  }
  if (isiStrings !== isiAwal) {
    writeFileSync(stringsXml, isiStrings);
    berubah = true;
  }
}

// ── 4b. Aktifkan WebView Debugging di MainActivity ─────────────────────────
const mainActivityPath = join(
  akarMobile,
  "src-tauri/gen/android/app/src/main/java",
  ...identifier.split("."),
  "MainActivity.kt",
);

if (existsSync(mainActivityPath)) {
  let isiActivity = readFileSync(mainActivityPath, "utf8");
  if (!isiActivity.includes("setWebContentsDebuggingEnabled")) {
    if (!isiActivity.includes("import android.webkit.WebView")) {
      isiActivity = isiActivity.replace(
        "import android.os.Bundle",
        "import android.os.Bundle\nimport android.webkit.WebView",
      );
    }
    isiActivity = isiActivity.replace(
      "super.onCreate(savedInstanceState)",
      "super.onCreate(savedInstanceState)\n    WebView.setWebContentsDebuggingEnabled(true)",
    );
    writeFileSync(mainActivityPath, isiActivity);
    berubah = true;
  }
}

// ── 4c. Ikon peluncur ───────────────────────────────────────────────────────
//
// `tauri android init` memasang ikon bawaan Tauri, dan build tetap hijau
// dengan ikon itu. Ikon produk dihasilkan `tauri icon` ke
// `src-tauri/icons/android` (ikut di-commit) lalu disalin ke sini.
const ikonSumber = join(akarMobile, "src-tauri/icons/android");
const ikonTujuan = join(akarMobile, "src-tauri/gen/android/app/src/main/res");
if (!existsSync(ikonSumber)) {
  keluarDenganPesan(
    "src-tauri/icons/android tidak ada. Jalankan `tauri icon` sesuai\n" +
      "   web-desktop/src-tauri/icons/sumber/README.md.",
  );
}
const berkasIkon = readdirSync(ikonSumber, { recursive: true })
  .map(String)
  .filter((berkas) => statSync(join(ikonSumber, berkas)).isFile());
for (const berkas of berkasIkon) {
  const isi = readFileSync(join(ikonSumber, berkas));
  const tujuan = join(ikonTujuan, berkas);
  if (!existsSync(tujuan) || !readFileSync(tujuan).equals(isi)) {
    mkdirSync(dirname(tujuan), { recursive: true });
    writeFileSync(tujuan, isi);
    berubah = true;
  }
}

// ── 5. Verifikasi — inilah yang membedakan skrip ini dari sekadar menambal ──
const gradleAkhir = readFileSync(gradle, "utf8");
const releaseAkhir = blokRelease.exec(gradleAkhir)?.[2] ?? "";
const proguardAkhir = readFileSync(proguard, "utf8");
const manifestAkhir = existsSync(manifest)
  ? readFileSync(manifest, "utf8")
  : "";

const gagal: string[] = [];
for (const baris of deklarasiIzin) {
  if (!sudahDideklarasikan(manifestAkhir, baris)) {
    gagal.push(
      `AndroidManifest.xml: ${namaDeklarasi(baris)} tidak dideklarasikan — kamera/lokasi ditolak tanpa dialog`,
    );
  }
}
if (!manifestAkhir.includes("<queries>")) {
  gagal.push(
    "AndroidManifest.xml: blok <queries> hilang — tombol WhatsApp/telepon tidak menemukan aplikasi tujuan",
  );
}
if (!/android:allowBackup="false"/.test(manifestAkhir)) {
  gagal.push(
    'AndroidManifest.xml: `android:allowBackup="false"` tidak terpasang — vault token database ikut backup cloud',
  );
}
if (!/isMinifyEnabled\s*=\s*false/.test(releaseAkhir)) {
  gagal.push("build.gradle.kts: `isMinifyEnabled = false` tidak terpasang");
}
if (/isMinifyEnabled\s*=\s*true/.test(releaseAkhir)) {
  gagal.push("build.gradle.kts: masih ada `isMinifyEnabled = true`");
}
if (!/signingConfig\s*=/.test(releaseAkhir)) {
  gagal.push(
    "build.gradle.kts: build release tanpa `signingConfig` — APK tidak akan bisa dipasang",
  );
}
if (pakaiKunciRilis) {
  // Kunci rilis diminta: APK bertanda tangan debug di sini berarti update ke
  // instalasi lama ditolak HP pengguna, jadi build dihentikan, bukan diteruskan.
  if (releaseAkhir.includes(SIGNING_DEBUG)) {
    gagal.push(
      "build.gradle.kts: keystore.properties ada, tetapi release masih memakai kunci debug",
    );
  }
  const isiKeystore = readFileSync(keystoreProperties, "utf8");
  const nilai = (kunci: string) =>
    new RegExp(`^\\s*${kunci}\\s*=\\s*(.+?)\\s*$`, "m").exec(isiKeystore)?.[1];
  for (const kunci of [
    "storeFile",
    "storePassword",
    "keyAlias",
    "keyPassword",
  ]) {
    if (!nilai(kunci)) gagal.push(`keystore.properties: \`${kunci}\` kosong`);
  }
  const berkasKunci = nilai("storeFile");
  if (berkasKunci && !existsSync(berkasKunci)) {
    gagal.push(`keystore.properties: berkas kunci tidak ada di ${berkasKunci}`);
  }
}
for (const baris of aturan) {
  if (!proguardAkhir.includes(baris)) {
    gagal.push(`proguard-rules.pro: aturan hilang — ${baris}`);
  }
}
if (existsSync(stringsXml)) {
  const stringsAkhir = readFileSync(stringsXml, "utf8");
  for (const kunci of ["app_name", "main_activity_title"]) {
    const nilai = new RegExp(`<string name="${kunci}">"?([^"<]*)"?</string>`)
      .exec(stringsAkhir)?.[1]
      ?.trim();
    if (nilai !== namaAplikasi) {
      gagal.push(
        `strings.xml: ${kunci} masih "${nilai ?? "(tidak ada)"}" — APK akan terpasang dengan nama lama`,
      );
    }
  }
}
for (const berkas of berkasIkon) {
  const tujuan = join(ikonTujuan, berkas);
  if (
    !existsSync(tujuan) ||
    !readFileSync(tujuan).equals(readFileSync(join(ikonSumber, berkas)))
  ) {
    gagal.push(`res/${berkas}: ikon peluncur bukan ikon produk`);
  }
}

if (gagal.length > 0) {
  keluarDenganPesan(
    `Setelan rilis Android tidak lolos verifikasi:\n${gagal
      .map((baris) => `   - ${baris}`)
      .join("\n")}\n\n` +
      "   Build DIHENTIKAN. APK yang dibangun dengan R8 aktif tetap jadi,\n" +
      "   tetapi mati saat dibuka — kegagalan itu tidak akan terlihat di sini.",
  );
}

console.log(
  berubah
    ? `✅ Setelan rilis Android dipasang ulang (paket ${identifier}).`
    : `✅ Setelan rilis Android sudah benar (paket ${identifier}).`,
);
if (pakaiKunciRilis) {
  console.log("   Tanda tangan: kunci RILIS (src-tauri/keystore.properties).");
} else {
  console.warn(
    "⚠️  Tanda tangan: kunci DEBUG — Play Protect akan menandai APK ini.\n" +
      "   Buat mobile/src-tauri/keystore.properties untuk kunci rilis.",
  );
}
