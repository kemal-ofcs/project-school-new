import type { MetadataRoute } from "next";
import { resolveSiteUrl } from "@/lib/server/site-url";

/**
 * `/wali` dan `/pmb/status` dilarang di-crawl sejak sekarang, sebelum keduanya
 * ada.
 *
 * Keduanya adalah halaman yang menampilkan data seorang anak setelah
 * pemeriksaan identitas. Halaman seperti itu tidak boleh muncul di hasil
 * pencarian dalam bentuk apa pun — bukan karena `robots.txt` adalah pengaman
 * (ia hanya permintaan sopan, dan pengamannya adalah sesi di Fase 5.4),
 * melainkan karena URL-nya sendiri tidak perlu diketahui siapa-siapa.
 *
 * Ditulis lebih dulu supaya tidak ada jendela waktu di mana halamannya sudah
 * hidup sementara aturan ini belum menyusul.
 */
export default function robots(): MetadataRoute.Robots {
  const asal = resolveSiteUrl();

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/wali", "/wali/", "/pmb/status", "/api/"],
    },
    sitemap: `${asal}/sitemap.xml`,
  };
}
