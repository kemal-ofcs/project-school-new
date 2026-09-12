import type { NextConfig } from "next";

/**
 * Konfigurasi situs publik sekolah.
 *
 * TIDAK ADA `output: "export"` di sini, dan itu keseluruhan alasan workspace
 * ini terpisah dari `web-desktop`. Di sana `src/app` dikompilasi dua kali —
 * sekali sebagai build server untuk Vercel, sekali sebagai export statis yang
 * dibungkus ke dalam binary Tauri Desktop — sehingga setiap halaman wajib
 * hidup tanpa SSR, tanpa `GET` route handler, dan tanpa metadata dinamis.
 *
 * Halaman publik menuntut ketiganya. Landing page tanpa metadata dinamis tidak
 * bisa di-index dengan benar, dan PMB tanpa server tidak bisa menerima berkas.
 */
const nextConfig: NextConfig = {
  devIndicators: false,
  // Repo ini punya beberapa lockfile (root, web-desktop, mobile, web-public).
  // Tanpa akar yang eksplisit, Turbopack menebaknya dari lockfile terdekat ke
  // atas dan mendarat di root repo — lalu ikut menarik workspace lain ke dalam
  // graf modulnya. `web-desktop` menyetel ini dengan alasan yang sama.
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
