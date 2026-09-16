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
 * Nilai bawaan (statis fallback) untuk konten halaman publik.
 * Memastikan situs tidak pernah tampak kosong sekalipun database cloud baru dibuat.
 */
export const DEFAULT_PAGE_CONTENT: Record<string, Record<string, string>> = {
  profil: {
    "profil.visi":
      "Mewujudkan generasi unggul, berakhlak mulia, berwawasan global, dan berdaya saing di era digital.",
    "profil.misi":
      "1. Menyelenggarakan pendidikan berkualitas berbasis teknologi dan industri modern.\n2. Menumbuhkan integritas, disiplin, dan budi pekerti luhur bagi seluruh sivitas akademika.\n3. Mengembangkan potensi bakat, kreativitas, dan kepemimpinan siswa yang berkarakter mandiri.\n4. Membangun kemitraan strategis dengan dunia usaha dan industri bertaraf nasional maupun global.",
    "profil.sejarah":
      "Didirikan dengan dedikasi untuk mencerdaskan kehidupan bangsa, sekolah ini terus bertransformasi menjadi pusat keunggulan pendidikan vokasi dan teknologi. Berbekal sarana modern serta tenaga pendidik profesional, kami telah melahirkan ribuan alumni yang sukses berkarier di berbagai sektor industri.",
    "profil.sambutan":
      "Selamat datang di portal resmi sekolah kami. Kami berkomitmen memberikan pengalaman belajar terbaik yang adaptif terhadap tantangan abad ke-21.",
  },
  kontak: {
    "kontak.alamat": "Jl. Pendidikan No. 1, Kompleks Pendidikan",
    "kontak.telepon": "(021) 1234567",
    "kontak.whatsapp": "+6281234567890",
    "kontak.email": "info@sekolah.sch.id",
    "kontak.jam_kerja": "Senin - Jumat, 07:00 - 16:00 WIB",
  },
  program: {
    "program.kejuruan_ringkasan":
      "Program keahlian terakreditasi dirancang selaras dengan standar kompetensi kerja nasional dan industri modern.",
    "program.fasilitas_ringkasan":
      "Laboratorium komputer berkecepatan tinggi, bengkel praktik standar industri, ruang multimedia, dan perpustakaan digital.",
    "program.ekstrakurikuler_ringkasan":
      "Lebih dari 15 klub kegiatan kesiswaan meliputi bidang sains, olahraga, seni rupa, musik, robotika, dan kepemimpinan.",
  },
  landing: {
    "landing.hero_title":
      "Membentuk Generasi Unggul Berkarakter & Berdaya Saing",
    "landing.hero_subtitle":
      "Lembaga pendidikan terakreditasi A dengan kurikulum adaptif industri, fasilitas pembelajaran modern, serta penyiapan karier masa depan.",
    "landing.keunggulan_1": "Kurikulum Selaras Kebutuhan Industri",
    "landing.keunggulan_2": "Fasilitas Belajar & Lab Standar Internasional",
    "landing.keunggulan_3": "Jaringan Kemitraan & Penyaluran Kerja Luas",
  },
};

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
 * Menggabungkan data database dengan fallback statis agar tidak pernah kosong.
 */
export async function readPageContent(
  client: Client,
  halaman: string,
): Promise<Record<string, string>> {
  const cleanHalaman = String(halaman || "").trim();
  const fallback = DEFAULT_PAGE_CONTENT[cleanHalaman] || {};

  try {
    const res = await client.execute({
      sql: `SELECT kunci, nilai FROM konten_publik WHERE halaman = ?;`,
      args: [cleanHalaman],
    });

    const dbMap: Record<string, string> = {};
    for (const row of res.rows) {
      const k = String(row.kunci ?? "");
      const v = String(row.nilai ?? "");
      if (k && v) {
        dbMap[k] = v;
      }
    }

    return {
      ...fallback,
      ...dbMap,
    };
  } catch {
    // Jika tabel belum siap di database, gunakan fallback default
    return fallback;
  }
}
