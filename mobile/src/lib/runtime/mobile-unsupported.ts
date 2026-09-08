"use client";

import { isMobileRuntime } from "@/lib/runtime/app-runtime";

/**
 * Hentikan sebuah fitur yang memang TIDAK tersedia di build Mobile.
 *
 * Modul di `src/lib` disalin apa adanya ke workspace `mobile`, jadi setiap
 * gateway ikut hadir di sana meskipun command Rust-nya tidak pernah didaftarkan
 * di `mobile/src-tauri/src/lib.rs`. Gateway yang hadir tanpa command dan tanpa
 * halaman adalah ranjau: begitu seseorang membuat halaman Mobile yang
 * memakainya, yang muncul adalah kegagalan IPC yang membingungkan, bukan
 * penjelasan.
 *
 * Fungsi ini membuat batasnya berbicara. Ia sengaja memakai guard POSITIF
 * `isMobileRuntime()` — bentuk yang sama yang dikenali `audit:contract`.
 *
 * Dipakai oleh Bimbingan Konseling dan tinjauan antrean WhatsApp. Keduanya
 * bukan kelalaian, melainkan keputusan:
 *
 * - **Bimbingan Konseling** bersandar pada `bk_kasus`/`bk_sesi` yang
 *   cloud-only. Catatan kedisiplinan seorang anak sengaja TIDAK direplikasi ke
 *   SQLite setiap perangkat — terminal pemindai di lobi sekolah tidak boleh
 *   menyimpannya. Konsekuensinya BK menuntut jaringan di Desktop juga, dan
 *   halaman Mobile-nya hanya akan menjadi layar yang gagal ketika sinyal hilang
 *   — persis saat seorang guru BK berada di lapangan.
 * - **Tinjauan antrean WhatsApp** membaca `notifikasi_wa` lokal, dan tabel itu
 *   tidak ditarik snapshot. Sebuah ponsel hanya akan melihat antrean yang ia
 *   buat sendiri, yang pada perangkat non-terminal berarti kosong.
 *
 * Yang IKUT ke Mobile adalah Dasbor Audit Kehadiran, karena ia benar-benar
 * offline: seluruh tabel yang dibacanya ada di `SNAPSHOT_TABLES`.
 */
export function assertTersediaDiMobile(namaFitur: string): void {
  if (isMobileRuntime()) {
    throw new Error(
      `${namaFitur} tidak tersedia di aplikasi Mobile. Gunakan versi Web atau Desktop.`,
    );
  }
}
