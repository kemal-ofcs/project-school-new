import type { MetadataRoute } from "next";
import { NAVIGASI } from "@/components/SiteChrome";
import { muatPilihanPmb } from "@/lib/server/pmb-data";
import { resolveSiteUrl } from "@/lib/server/site-url";
import { daftarHalamanUnit } from "@/lib/services/halaman-unit";

// Disusun per permintaan. Bila dibekukan saat build, alamatnya ikut membeku
// pada nilai di mesin build, dan image yang sama dipakai banyak sekolah.
export const dynamic = "force-dynamic";

/**
 * Sitemap diturunkan dari daftar navigasi yang sama yang dirender header.
 *
 * Menulisnya dua kali berarti rute baru bisa muncul di menu tetapi tidak pernah
 * masuk sitemap — kegagalan yang tidak terlihat dari halaman mana pun dan baru
 * ketahuan berbulan kemudian sebagai halaman yang tidak pernah ter-index.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const asal = resolveSiteUrl();
  const diperbarui = new Date();
  const pilihan = await muatPilihanPmb();
  // Unit gagal dibaca: sitemap tetap memuat halaman yang tidak bergantung padanya.
  const unit =
    pilihan.status === "ok" ? daftarHalamanUnit(pilihan.data.unit) : [];

  return [
    {
      url: asal,
      lastModified: diperbarui,
      changeFrequency: "weekly" as const,
      priority: 1,
    },
    ...[
      ...NAVIGASI.map((item) => item.href),
      "/selengkapnya",
      ...unit.map((u) => `/${u.slug}`),
    ].map((href) => ({
      url: `${asal}${href}`,
      lastModified: diperbarui,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
