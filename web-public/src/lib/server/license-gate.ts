import "server-only";

import type { Client } from "@libsql/client";
import { getPublicDatabase } from "@/lib/server/db";
import {
  isLicenseEnforced,
  type LicenseReadOptions,
  resolveWebLicense,
} from "@/lib/server/license";

/**
 * Vonis lisensi untuk situs publik.
 *
 * Situs ini melayani database yang sama dengan aplikasi admin, jadi ia menilai
 * lisensi yang sama (`app_license`) dengan pemeriksa yang sama
 * (`server/license.ts`, salinan dari web-desktop). Yang berbeda adalah apa yang
 * dilakukan dengan hasilnya:
 *
 *   terbuka    Situs berjalan seperti biasa.
 *   baca-saja  Halaman tetap tampil; pendaftaran PMB baru ditolak. Sama dengan
 *              mode baca-saja aplikasi admin: yang sudah ada tetap terbaca,
 *              yang baru tidak diterima.
 *   terblokir  Pengunjung melihat pemberitahuan singkat, tanpa konten sekolah.
 *
 * Pengunjung tidak pernah diberi tahu ALASANNYA. Lisensi adalah urusan sekolah
 * dengan penyedia aplikasinya; menampilkannya di situs publik mempermalukan
 * sekolah di depan orang tua dan calon siswa. Alasan lengkapnya ada di layar
 * masuk aplikasi admin, tempat yang hanya dilihat pengelola.
 */
export type VonisLisensi = "terbuka" | "baca-saja" | "terblokir";

/**
 * Header internal dari `proxy.ts` ke halaman: berisi "baca-saja" saat lisensi
 * dalam mode itu, dan tidak ada sama sekali pada keadaan lain.
 */
export const HEADER_LISENSI = "x-kos-lisensi";

export async function vonisLisensiPublik(
  request: Request,
  // Hanya diisi tes: klien database memori dan kunci uji.
  opsi: LicenseReadOptions & { client?: Client } = {},
): Promise<VonisLisensi> {
  if (!isLicenseEnforced()) return "terbuka";

  try {
    const { evaluation } = await resolveWebLicense(
      opsi.client ?? getPublicDatabase(),
      request,
      // Situs publik tidak pernah menulis ke database, termasuk untuk
      // melahirkan id instance. Tanpa id, lisensi apa pun dinilai tidak
      // tercantum sampai aplikasi admin dibuka untuk pertama kali.
      { ...opsi, createInstance: false },
    );
    if (evaluation.state === "active") return "terbuka";
    return evaluation.state === "read_only" ? "baca-saja" : "terblokir";
  } catch (error) {
    // Database yang tidak terbaca BUKAN alasan untuk memblokir. Tanpa database
    // tidak ada konten yang bisa tampil, dan setiap halaman sudah punya
    // pesannya sendiri untuk keadaan itu ("sedang tidak dapat dimuat"), yang
    // lebih tepat daripada pemberitahuan umum di sini.
    console.error("[lisensi] Status lisensi tidak terbaca:", error);
    return "terbuka";
  }
}
