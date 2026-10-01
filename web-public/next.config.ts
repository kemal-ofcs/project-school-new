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
/**
 * Build untuk image Docker pemasangan self-hosted, dan sakelar lisensinya.
 * Aturannya sama dengan `web-desktop/next.config.ts`, beserta alasannya:
 * keluaran standalone hanya diminta `Dockerfile`, dan sakelar lisensi DITANAM
 * ke hasil build supaya tidak bisa dimatikan lewat `.env` di server pembeli.
 */
const isStandaloneBuild = process.env.KOS_BUILD_STANDALONE === "1";
const licenseEnforced = process.env.KOS_LICENSE_ENFORCED === "1" ? "1" : "0";
const buildDateWib = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jakarta",
}).format(new Date());

const nextConfig: NextConfig = {
  ...(isStandaloneBuild ? { output: "standalone" as const } : {}),
  env: {
    KOS_LICENSE_ENFORCED: licenseEnforced,
    KOS_BUILD_DATE: buildDateWib,
    // Dibaca `school-data.ts`: build image tidak mem-prerender isi sekolah.
    KOS_SELF_HOSTED: isStandaloneBuild ? "1" : "0",
  },
  devIndicators: false,
  // Header keamanan situs publik. Minimal (tanpa `script-src`) supaya script
  // inline Next.js tidak ikut terblokir.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(self), geolocation=(), microphone=()",
          },
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'none'; object-src 'none'; base-uri 'none'",
          },
        ],
      },
    ];
  },
  // Repo ini punya beberapa lockfile (root, web-desktop, mobile, web-public).
  // Tanpa akar yang eksplisit, Turbopack menebaknya dari lockfile terdekat ke
  // atas dan mendarat di root repo — lalu ikut menarik workspace lain ke dalam
  // graf modulnya. `web-desktop` menyetel ini dengan alasan yang sama.
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
