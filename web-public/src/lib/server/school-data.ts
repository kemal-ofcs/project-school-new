import "server-only";

import { cache } from "react";
import {
  alamatDatabaseTersetel,
  getReadyPublicDatabase,
} from "@/lib/server/db";
import { SchemaNotReadyError } from "@/lib/server/schema-readiness";
import {
  type ProgramStudi,
  readProgramStudi,
  readSchoolProfile,
  type SchoolProfile,
} from "@/lib/services/school-profile";

/**
 * Pembungkus koneksi untuk pembaca di `services/school-profile.ts`.
 *
 * Pemisahannya disengaja dan mengikuti pola `schema-readiness.ts`: logika murni
 * yang menerima `Client` sebagai argumen tinggal di `services/` tanpa penanda
 * `server-only`, sehingga bisa diuji terhadap SQLite di memori; modul yang
 * benar-benar membuka koneksi dan membaca environment ada di sini dan
 * menyandang penandanya.
 *
 * Tanpa pemisahan itu, satu `import "server-only"` di modul pembaca membuat
 * seluruh berkas tidak bisa diimpor `bun test`, dan pengujiannya akan diganti
 * mock — yang berarti query-nya tidak pernah benar-benar dijalankan SQLite, dan
 * salah nama kolom baru ketahuan di produksi.
 */

/**
 * Hasil pemuatan yang MEMBEDAKAN kosong dari gagal.
 *
 * Ini bukan kerumitan yang bisa dihemat. Pelajarannya sudah dibayar di Fase 4
 * dan dieja di CLAUDE.md: daftar kosong yang sebenarnya kegagalan tidak bisa
 * dibedakan dari "belum ada isinya". Di situs publik taruhannya lebih besar
 * lagi — pengunjung yang melihat halaman Program kosong akan menyimpulkan
 * sekolahnya tidak membuka jurusan apa pun, lalu pergi.
 */
export type HasilMuat<T> =
  | { status: "ok"; data: T }
  | { status: "belum-siap"; pesan: string }
  | { status: "gagal"; pesan: string };

/**
 * Tolak build produksi yang alamat databasenya belum disetel.
 *
 * Tanpa ini, `next build` tanpa `TURSO_DATABASE_URL` tetap SUKSES: setiap
 * halaman jatuh ke cabang "gagal", dan HTML yang berisi "sedang tidak dapat
 * dimuat" itulah yang dibekukan sebagai hasil prerender. Dengan `revalidate`
 * 300, setiap pengunjung pada lima menit pertama setelah deploy membaca pesan
 * kegagalan pada situs yang sebenarnya sehat — dan tidak ada satu pun baris
 * merah di log build yang memberitahu siapa pun.
 *
 * Pola kegagalannya sudah dua kali mahal di repo ini: build release Desktop
 * yang mati saat dibuka karena `.env` kosong, dan APK Android yang terbangun
 * hijau lalu `UnsatisfiedLinkError` di tangan pengguna. Keduanya sama — build
 * yang melaporkan sukses untuk artefak yang tidak bisa dipakai.
 *
 * Yang ditolak HANYA konfigurasi yang belum disetel, bukan database yang
 * skemanya belum lengkap atau sedang tidak terjangkau. Dua yang terakhir adalah
 * keadaan operasional yang memang harus dilayani halaman dengan anggun.
 */
function tolakBuildTanpaKonfigurasi(): void {
  if (process.env.NEXT_PHASE !== "phase-production-build") return;
  if (alamatDatabaseTersetel()) return;

  throw new Error(
    "TURSO_DATABASE_URL (atau SPPG_DATABASE_URL) belum disetel saat build. " +
      "Seluruh isi situs publik berasal dari database sekolah, sehingga build " +
      "tanpa alamat database hanya akan membekukan halaman kegagalan selama " +
      "masa ISR. Setel variabelnya di environment build, lalu ulangi.",
  );
}

export function petakanKegagalan(error: unknown): HasilMuat<never> {
  if (error instanceof SchemaNotReadyError) {
    return { status: "belum-siap", pesan: error.reason };
  }
  return {
    status: "gagal",
    pesan: error instanceof Error ? error.message : String(error),
  };
}

/**
 * `cache()` menyatukan pemanggilan dalam SATU permintaan.
 *
 * Layout merender header dan footer dari profil yang sama yang dibaca badan
 * halaman. Tanpa ini, satu kunjungan menghasilkan tiga perjalanan ke Turso
 * untuk baris yang sama persis.
 */
export const getSchoolProfile = cache(async (): Promise<SchoolProfile> => {
  return readSchoolProfile(await getReadyPublicDatabase());
});

export const getProgramStudi = cache(async (): Promise<ProgramStudi[]> => {
  return readProgramStudi(await getReadyPublicDatabase());
});

export async function muatProfilSekolah(): Promise<HasilMuat<SchoolProfile>> {
  tolakBuildTanpaKonfigurasi();
  try {
    return { status: "ok", data: await getSchoolProfile() };
  } catch (error) {
    // Kegagalan TIDAK didiamkan: ia dikembalikan sebagai status yang wajib
    // ditangani pemanggil, dan dicatat supaya operator punya jejak. Halaman
    // publik tidak boleh menjatuhkan seluruh situs hanya karena database
    // sedang tidak terjangkau — tetapi juga tidak boleh berpura-pura kosong.
    console.error("[web-public] gagal membaca profil sekolah:", error);
    return petakanKegagalan(error);
  }
}

export async function muatProgramStudi(): Promise<HasilMuat<ProgramStudi[]>> {
  tolakBuildTanpaKonfigurasi();
  try {
    return { status: "ok", data: await getProgramStudi() };
  } catch (error) {
    console.error("[web-public] gagal membaca program studi:", error);
    return petakanKegagalan(error);
  }
}
