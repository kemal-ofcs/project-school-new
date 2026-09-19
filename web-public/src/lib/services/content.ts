import type { Client } from "@libsql/client";

export interface PublicArticleItem {
  id_berita: string;
  judul: string;
  slug: string;
  ringkasan: string;
  /**
   * Apakah artikel ini punya gambar sampul — BUKAN gambarnya sendiri.
   *
   * Gambarnya diambil terpisah lewat `GET /api/konten/berita/<slug>/gambar`.
   * Versi pertama halaman ini menyisipkan data URI-nya langsung ke dalam HTML:
   * dengan batas 500 KB per gambar dan 20 artikel per halaman, satu kali muat
   * bisa mengirim sekitar 10 MB — dan base64 menambah sepertiga lagi di atas
   * ukuran aslinya. Daftar di panel admin sudah lama tidak mengambil kolom ini
   * dengan alasan yang persis sama; halaman yang paling banyak dikunjungi
   * justru yang belum mengikutinya.
   */
  punya_gambar: boolean;
  tanggal_terbit: string | null;
  penulis: string | null;
  created_at: string;
}

export interface PublicArticleDetail extends PublicArticleItem {
  isi: string;
}

/**
 * Membaca daftar artikel berita yang sudah berstatus 'Terbit'.
 */
export async function readPublishedArticles(
  client: Client,
  limit = 20,
): Promise<PublicArticleItem[]> {
  const boundedLimit = Math.max(1, Math.min(limit, 50));
  const res = await client.execute({
    sql: `SELECT id_berita, judul, slug, ringkasan,
                 CASE WHEN COALESCE(TRIM(gambar_sampul), '') <> '' THEN 1 ELSE 0 END AS punya_gambar,
                 tanggal_terbit, penulis, created_at
            FROM berita
           WHERE status = 'Terbit'
        ORDER BY COALESCE(tanggal_terbit, created_at) DESC
           LIMIT ?;`,
    args: [boundedLimit],
  });

  return res.rows.map((row) => ({
    ...(row as unknown as PublicArticleItem),
    punya_gambar: Number(row.punya_gambar) === 1,
  }));
}

/**
 * Data URI gambar sampul satu artikel terbit, atau null.
 *
 * Dipisahkan dari pembacaan artikelnya supaya kolom yang besar itu hanya
 * melintas ketika benar-benar diminta. `status = 'Terbit'` diulang di sini —
 * endpoint gambarnya publik, dan tanpa syarat itu sampul artikel yang masih
 * Draft bisa diambil siapa pun yang menebak slug-nya.
 */
export async function readArticleCoverBySlug(
  client: Client,
  slug: string,
): Promise<string | null> {
  const cleanSlug = String(slug || "").trim();
  if (!cleanSlug) return null;

  const res = await client.execute({
    sql: `SELECT gambar_sampul
            FROM berita
           WHERE slug = ? AND status = 'Terbit'
           LIMIT 1;`,
    args: [cleanSlug],
  });

  const nilai = res.rows[0]?.gambar_sampul;
  const bersih = String(nilai ?? "").trim();
  return bersih ? bersih : null;
}

/**
 * Membaca detail lengkap artikel berita berdasarkan slug uniknya.
 */
export async function readArticleBySlug(
  client: Client,
  slug: string,
): Promise<PublicArticleDetail | null> {
  const cleanSlug = String(slug || "").trim();
  if (!cleanSlug) return null;

  const res = await client.execute({
    sql: `SELECT id_berita, judul, slug, ringkasan, isi,
                 CASE WHEN COALESCE(TRIM(gambar_sampul), '') <> '' THEN 1 ELSE 0 END AS punya_gambar,
                 tanggal_terbit, penulis, created_at
            FROM berita
           WHERE slug = ? AND status = 'Terbit'
           LIMIT 1;`,
    args: [cleanSlug],
  });

  const baris = res.rows[0];
  if (!baris) return null;
  return {
    ...(baris as unknown as PublicArticleDetail),
    punya_gambar: Number(baris.punya_gambar) === 1,
  };
}

/**
 * Membaca key-value konten halaman publik dari tabel `konten_publik`.
 *
 * Hanya database — tidak ada teks bawaan yang digabungkan. Versi sebelumnya
 * menambal kunci yang kosong dengan isi contoh yang tertanam di kode, sehingga
 * situs setiap sekolah menampilkan visi, misi, dan sambutan yang sama persis
 * sampai ada yang menimpanya, dan tidak ada yang bisa membedakan teks sekolah
 * dari teks contoh. Kunci yang belum diisi kini tidak ada di hasilnya, dan
 * halaman yang memakainya menyembunyikan bagian itu.
 */
export async function readPageContent(
  client: Client,
  halaman: string,
): Promise<Record<string, string>> {
  const cleanHalaman = String(halaman || "").trim();

  try {
    const res = await client.execute({
      sql: `SELECT kunci, nilai FROM konten_publik WHERE halaman = ?;`,
      args: [cleanHalaman],
    });

    const dbMap: Record<string, string> = {};
    for (const row of res.rows) {
      const k = String(row.kunci ?? "");
      const v = String(row.nilai ?? "").trim();
      if (k && v) {
        dbMap[k] = v;
      }
    }
    return dbMap;
  } catch (error) {
    // Tabelnya belum ada, atau databasenya tidak terjangkau. Halaman tetap
    // dilayani — bagian yang butuh konten CMS saja yang tersembunyi.
    //
    // Kegagalannya WAJIB tercatat: panel admin melapor sukses menyimpan,
    // situs tidak berubah, dan tanpa catatan ini tidak ada satu pun tempat yang
    // menjelaskan kenapa. Penyebab paling sering adalah `TURSO_DATABASE_URL`
    // yang belum disetel di workspace ini — lihat `web-public/.env.example`.
    console.error(
      `[web-public] konten halaman '${cleanHalaman}' gagal dibaca:`,
      error,
    );
    return {};
  }
}
