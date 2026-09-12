import type { MetadataRoute } from "next";
import { NAVIGASI } from "@/components/SiteChrome";
import { resolveSiteUrl } from "@/lib/server/site-url";

/**
 * Sitemap diturunkan dari daftar navigasi yang sama yang dirender header.
 *
 * Menulisnya dua kali berarti rute baru bisa muncul di menu tetapi tidak pernah
 * masuk sitemap — kegagalan yang tidak terlihat dari halaman mana pun dan baru
 * ketahuan berbulan kemudian sebagai halaman yang tidak pernah ter-index.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const asal = resolveSiteUrl();
  const diperbarui = new Date();

  return NAVIGASI.map((item) => ({
    url: item.href === "/" ? asal : `${asal}${item.href}`,
    lastModified: diperbarui,
    changeFrequency: "weekly" as const,
    priority: item.href === "/" ? 1 : 0.7,
  }));
}
