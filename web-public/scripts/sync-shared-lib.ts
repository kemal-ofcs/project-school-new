import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Salin modul bersama dari `web-desktop` ke `web-public`.
 *
 * `web-desktop` adalah sumber kanonik, sama seperti untuk `mobile`. Berkas
 * hasil salinan JANGAN disunting di sini — perubahannya akan tertimpa diam-diam
 * pada sinkronisasi berikutnya. Sunting aslinya, lalu jalankan skrip ini.
 *
 * YANG DISALIN — hanya aturan yang WAJIB sama di kedua sisi, bukan kenyamanan.
 * Masing-masing menjaga sesuatu yang akan rusak tanpa suara bila berbeda:
 *
 *   validations/database-endpoint.ts  Aturan transport alamat database. Situs
 *                                     publik menunjuk database yang sama dengan
 *                                     aplikasi Desktop; satu deployment tidak
 *                                     boleh diam-diam lebih longgar daripada
 *                                     yang lain.
 *   server/database-config.ts         Cara alamat itu dibaca dari environment,
 *                                     termasuk penolakan `local_file` di sisi
 *                                     server.
 *   auth/request-origin.ts            Penilaian asal permintaan. Situs publik
 *                                     memakai penilaian yang SAMA PERSIS dengan
 *                                     panel admin; satu sisi yang lebih longgar
 *                                     berarti satu sisi yang bisa ditembus.
 *   operators/contact.ts              Normalisasi nomor `+62…`. Nomor wali yang
 *                                     masuk lewat formulir PMB harus berbentuk
 *                                     sama dengan nomor yang sudah tersimpan di
 *                                     `siswa_data`, atau pencocokan OTP-nya
 *                                     tidak akan pernah cocok.
 *   services/wa-provider.ts           Kontrak gateway WhatsApp: cara membaca
 *                                     konfigurasinya dari `app_wa_config` dan
 *                                     cara memanggil providernya. Satu
 *                                     implementasi, dua pemakai — aturan yang
 *                                     ditulis dua kali akan salah di salah
 *                                     satunya, dan yang membayar tagihan pesan
 *                                     gagal adalah sekolah.
 *   validations/wa-notification.ts    Konstanta yang dipakai modul di atas.
 *
 * YANG SENGAJA TIDAK DISALIN, dan harus tetap begitu:
 *
 *   db-schema.ts / db-migrations.ts   Menyalinnya berarti web-public menjadi
 *                                     jalur provisioning KETIGA. Lihat
 *                                     `src/lib/server/db.ts` untuk alasan
 *                                     lengkapnya. Situs publik memeriksa skema,
 *                                     tidak pernah membuatnya.
 *   components/                       Situs publik punya bahasa visual sendiri;
 *                                     komponen panel admin dibangun untuk layar
 *                                     operator, bukan untuk calon siswa.
 *   server/http/request-security.ts   Mengimpor `auth/permission-assertion`,
 *                                     yang menarik seluruh pohon RBAC
 *                                     (`auth/access`, `rbac/catalog`,
 *                                     `OperatorUser`) ke dalam situs yang tidak
 *                                     punya satu pun operator maupun role. Yang
 *                                     dibagi adalah ATURAN-nya —
 *                                     `isSameOriginRequest` di atas — sementara
 *                                     pembungkus yang melempar ditulis lokal.
 *   security/totp.ts                  Sempat direncanakan untuk hash OTP wali,
 *                                     tetapi tidak diperlukan: OTP di sini
 *                                     enam digit acak yang di-hash SHA-256
 *                                     lewat WebCrypto, bukan kode berbasis
 *                                     waktu. Menyalin modul TOTP hanya untuk
 *                                     satu fungsi hash akan membawa seluruh
 *                                     aritmetika HOTP/RFC 6238 yang tidak punya
 *                                     pemanggil di sini.
 */
const filesToCopy = [
  "lib/validations/database-endpoint.ts",
  "lib/validations/database-endpoint.test.ts",
  "lib/server/database-config.ts",
  "lib/server/database-config.test.ts",
  "lib/auth/request-origin.ts",
  "lib/operators/contact.ts",
  "lib/operators/contact.test.ts",
  "lib/services/wa-provider.ts",
  "lib/validations/wa-notification.ts",
];

const desktopSrc = join(import.meta.dir, "../../web-desktop/src");
const publicSrc = join(import.meta.dir, "../src");

let copied = 0;
const missing: string[] = [];

for (const file of filesToCopy) {
  const source = join(desktopSrc, file);
  const destination = join(publicSrc, file);

  if (!existsSync(source)) {
    missing.push(file);
    continue;
  }

  mkdirSync(dirname(destination), { recursive: true });
  cpSync(source, destination);
  console.log(`Disalin  ${file}`);
  copied++;
}

if (missing.length > 0) {
  // Berkas yang hilang berarti aslinya dipindah atau dihapus di web-desktop.
  // Membiarkannya lewat akan meninggalkan salinan basi di sini yang tampak
  // seperti kode hidup, jadi ini dijadikan kegagalan yang keras.
  console.error("\nBerkas sumber tidak ditemukan di web-desktop:");
  for (const file of missing) console.error(`  - ${file}`);
  console.error(
    "\nPerbarui `filesToCopy` di skrip ini, atau kembalikan berkasnya.",
  );
  process.exit(1);
}

console.log(`\n${copied} berkas tersinkronisasi dari web-desktop.`);
