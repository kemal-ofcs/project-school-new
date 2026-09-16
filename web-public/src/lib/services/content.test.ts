import { describe, expect, test } from "bun:test";
import { createClient } from "@libsql/client";
import {
  DEFAULT_PAGE_CONTENT,
  readArticleBySlug,
  readArticleCoverBySlug,
  readPageContent,
  readPublishedArticles,
} from "./content";

function dbMemori() {
  return createClient({ url: ":memory:" });
}

async function setupDatabase(client: ReturnType<typeof dbMemori>) {
  await client.execute(`
    CREATE TABLE berita (
      id_berita TEXT PRIMARY KEY,
      judul TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      ringkasan TEXT NOT NULL DEFAULT '',
      isi TEXT NOT NULL,
      gambar_sampul TEXT,
      status TEXT NOT NULL DEFAULT 'Draft',
      tanggal_terbit TEXT,
      penulis TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  await client.execute(`
    CREATE TABLE konten_publik (
      halaman TEXT NOT NULL,
      kunci TEXT NOT NULL,
      nilai TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (halaman, kunci)
    );
  `);
}

describe("Tahap D: web-public Content Service & Fallback Contract", () => {
  test("readPublishedArticles hanya mengambil artikel dengan status 'Terbit'", async () => {
    const client = dbMemori();
    await setupDatabase(client);

    await client.execute({
      sql: `INSERT INTO berita (id_berita, judul, slug, ringkasan, isi, status, tanggal_terbit, created_at) VALUES
            ('b-1', 'Berita Terbit 1', 'berita-terbit-1', 'Ringkasan 1', 'Konten 1', 'Terbit', '2026-09-17 08:00:00', '2026-09-17 08:00:00'),
            ('b-2', 'Berita Draft', 'berita-draft', 'Ringkasan draft', 'Konten draft', 'Draft', NULL, '2026-09-17 09:00:00'),
            ('b-3', 'Berita Terbit 2', 'berita-terbit-2', 'Ringkasan 2', 'Konten 2', 'Terbit', '2026-09-17 10:00:00', '2026-09-17 10:00:00');`,
    });

    const articles = await readPublishedArticles(client);
    expect(articles.length).toBe(2);
    expect(articles[0].slug).toBe("berita-terbit-2"); // Terbit terbaru di atas
    expect(articles[1].slug).toBe("berita-terbit-1");
  });

  test("readArticleBySlug mengambil artikel terbit dan mengembalikan null jika draft/tidak ada", async () => {
    const client = dbMemori();
    await setupDatabase(client);

    await client.execute({
      sql: `INSERT INTO berita (id_berita, judul, slug, ringkasan, isi, status, tanggal_terbit, created_at) VALUES
            ('b-1', 'Judul Terbit', 'slug-terbit', 'Ringkasan', '<p>Isi HTML</p>', 'Terbit', '2026-09-17', '2026-09-17'),
            ('b-2', 'Judul Draft', 'slug-draft', 'Ringkasan', 'Isi draft', 'Draft', NULL, '2026-09-17');`,
    });

    const terbit = await readArticleBySlug(client, "slug-terbit");
    expect(terbit).not.toBeNull();
    expect(terbit?.judul).toBe("Judul Terbit");
    expect(terbit?.isi).toBe("<p>Isi HTML</p>");

    const draft = await readArticleBySlug(client, "slug-draft");
    expect(draft).toBeNull(); // Draft tidak boleh diakses publik lewat slug

    const tidakAda = await readArticleBySlug(client, "slug-ngawur");
    expect(tidakAda).toBeNull();
  });

  test("readPageContent memadukan data DB dengan default fallback", async () => {
    const client = dbMemori();
    await setupDatabase(client);

    // Kasus 1: Tabel masih kosong -> Mengembalikan full fallback statis
    const kontenAwal = await readPageContent(client, "profil");
    expect(kontenAwal["profil.visi"]).toBe(
      DEFAULT_PAGE_CONTENT.profil["profil.visi"],
    );

    // Kasus 2: DB diisi nilai khusus untuk visi sekolah
    await client.execute({
      sql: `INSERT INTO konten_publik (halaman, kunci, nilai) VALUES
            ('profil', 'profil.visi', 'Visi Baru dari CMS Sekolah.');`,
    });

    const kontenUpdate = await readPageContent(client, "profil");
    expect(kontenUpdate["profil.visi"]).toBe("Visi Baru dari CMS Sekolah.");
    // Misi dan sejarah tetap memakai fallback
    expect(kontenUpdate["profil.sejarah"]).toBe(
      DEFAULT_PAGE_CONTENT.profil["profil.sejarah"],
    );
  });

  /**
   * Endpoint gambar sampul bersifat PUBLIK, jadi syarat `status = 'Terbit'`
   * harus ada di query gambarnya sendiri — bukan hanya di query artikelnya.
   * Tanpa itu, sampul artikel yang masih Draft bisa diambil siapa pun yang
   * menebak slug-nya, padahal artikelnya belum diterbitkan.
   */
  test("readArticleCoverBySlug menolak artikel Draft dan baris tanpa gambar", async () => {
    const client = dbMemori();
    await setupDatabase(client);

    const gambar = "data:image/png;base64,iVBORw0KGgo=";
    await client.execute({
      sql: `INSERT INTO berita (id_berita, judul, slug, ringkasan, isi, gambar_sampul, status, created_at) VALUES
            ('c-1', 'Terbit Bergambar', 'terbit-bergambar', 'R', 'K', ?, 'Terbit', '2026-09-17 08:00:00'),
            ('c-2', 'Draft Bergambar', 'draft-bergambar', 'R', 'K', ?, 'Draft', '2026-09-17 08:00:00'),
            ('c-3', 'Terbit Tanpa Gambar', 'terbit-polos', 'R', 'K', NULL, 'Terbit', '2026-09-17 08:00:00'),
            ('c-4', 'Terbit Gambar Kosong', 'terbit-kosong', 'R', 'K', '   ', 'Terbit', '2026-09-17 08:00:00');`,
      args: [gambar, gambar],
    });

    expect(await readArticleCoverBySlug(client, "terbit-bergambar")).toBe(
      gambar,
    );
    // Draft: tidak boleh bocor meski slug-nya benar.
    expect(await readArticleCoverBySlug(client, "draft-bergambar")).toBeNull();
    expect(await readArticleCoverBySlug(client, "terbit-polos")).toBeNull();
    // Hanya spasi diperlakukan sama dengan kosong.
    expect(await readArticleCoverBySlug(client, "terbit-kosong")).toBeNull();
    expect(await readArticleCoverBySlug(client, "tidak-ada")).toBeNull();
    expect(await readArticleCoverBySlug(client, "  ")).toBeNull();

    // Daftar publik membawa PENANDA-nya, bukan gambarnya — itulah yang membuat
    // satu muat halaman tidak lagi mengangkut megabyte base64.
    const daftar = await readPublishedArticles(client);
    const bergambar = daftar.find((a) => a.slug === "terbit-bergambar");
    const polos = daftar.find((a) => a.slug === "terbit-polos");
    expect(bergambar?.punya_gambar).toBe(true);
    expect(polos?.punya_gambar).toBe(false);
    expect(bergambar).toBeDefined();
    expect("gambar_sampul" in (bergambar as object)).toBe(false);
  });
});
