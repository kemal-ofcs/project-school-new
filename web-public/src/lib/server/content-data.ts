import "server-only";

import { cache } from "react";
import { getReadyPublicDatabase } from "@/lib/server/db";
import { type HasilMuat, petakanKegagalan } from "@/lib/server/school-data";
import {
  type PublicArticleDetail,
  type PublicArticleItem,
  readArticleBySlug,
  readPageContent,
  readPublishedArticles,
} from "@/lib/services/content";

/**
 * Pembungkus koneksi dan cache untuk pembacaan konten publik (Berita & CMS Halaman).
 * Menggunakan React cache() agar pemanggilan berulang dalam satu render cycle di-deduplicate.
 */

export const getPublishedArticles = cache(
  async (limit = 20): Promise<PublicArticleItem[]> => {
    return readPublishedArticles(await getReadyPublicDatabase(), limit);
  },
);

export const getArticleBySlug = cache(
  async (slug: string): Promise<PublicArticleDetail | null> => {
    return readArticleBySlug(await getReadyPublicDatabase(), slug);
  },
);

export const getPageContent = cache(
  async (halaman: string): Promise<Record<string, string>> => {
    return readPageContent(await getReadyPublicDatabase(), halaman);
  },
);

export async function muatBeritaPublik(
  limit = 20,
): Promise<HasilMuat<PublicArticleItem[]>> {
  try {
    const data = await getPublishedArticles(limit);
    return { status: "ok", data };
  } catch (error) {
    console.error("[web-public] gagal membaca daftar artikel berita:", error);
    return petakanKegagalan(error);
  }
}

export async function muatDetailBerita(
  slug: string,
): Promise<HasilMuat<PublicArticleDetail | null>> {
  try {
    const data = await getArticleBySlug(slug);
    return { status: "ok", data };
  } catch (error) {
    console.error(`[web-public] gagal membaca artikel slug '${slug}':`, error);
    return petakanKegagalan(error);
  }
}

export async function muatKontenHalaman(
  halaman: string,
): Promise<HasilMuat<Record<string, string>>> {
  try {
    const data = await getPageContent(halaman);
    return { status: "ok", data };
  } catch (error) {
    console.error(
      `[web-public] gagal membaca konten halaman '${halaman}':`,
      error,
    );
    return petakanKegagalan(error);
  }
}

export type { PublicArticleDetail, PublicArticleItem };
