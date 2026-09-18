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
    // Hero & Quick Stats
    "landing.hero_badge": "Akreditasi A Unggul (BAN-SM)",
    "landing.hero_title":
      "Wujudkan Generasi Pemimpin Cerdas, Berkarakter & Berdaya Saing Global",
    "landing.hero_subtitle":
      "Pendidikan holistik memadukan ketangguhan karakter moral, pengayaan kurikulum internasional, serta ekosistem pembelajaran modern berbasis riset dan teknologi masa depan.",
    "landing.stat1_label": "Akreditasi A",
    "landing.stat1_value": "98 / 100",
    "landing.stat1_sub": "BAN-SM Predikat Unggul",
    "landing.stat2_label": "Lulusan PTN/LN",
    "landing.stat2_value": "98.4%",
    "landing.stat2_sub": "UI, ITB, UGM & Luar Negeri",
    "landing.stat3_label": "Prestasi 2024",
    "landing.stat3_value": "150+",
    "landing.stat3_sub": "Tingkat Nasional & Dunia",
    "landing.stat4_label": "Komunitas",
    "landing.stat4_value": "1.250+",
    "landing.stat4_sub": "Siswa & Alumni Aktif",
    "landing.keunggulan_1": "Kurikulum Selaras Kebutuhan Industri",
    "landing.keunggulan_2": "Fasilitas Belajar & Lab Standar Internasional",
    "landing.keunggulan_3": "Jaringan Kemitraan & Penyaluran Kerja Luas",

    // 4 Pilar & Sambutan Pimpinan
    "landing.pillars_eyebrow": "Keunggulan Institusi",
    "landing.pillars_title": "4 Pilar Pendidikan Masa Depan",
    "landing.pillars_subtitle":
      "Kami memadukan ketangguhan moral spiritual, kurikulum berstandar internasional, serta ekosistem pembelajaran modern untuk melahirkan inovator muda yang berakhlak mulia.",
    "landing.pillars_badge": "Green & Digital Eco-Campus Bersertifikasi",

    "landing.pilar1_title": "Kurikulum Adaptif & Global",
    "landing.pilar1_desc":
      "Penyelarasan Kurikulum Merdeka dengan standar internasional, bilingual harian, serta muatan riset saintifik dan Coding terapan.",
    "landing.pilar1_tag": "Bilingual Pathway",

    "landing.pilar2_title": "Pendidik Berintegritas & Magister",
    "landing.pilar2_desc":
      "Lebih dari 90% staf pengajar berkualifikasi Magister & Doktor lulusan perguruan tinggi terkemuka dengan rasio guru-siswa ideal 1:12.",
    "landing.pilar2_tag": "Rasio Guru 1:12",

    "landing.pilar3_title": "Bina Karakter & Kepemimpinan",
    "landing.pilar3_desc":
      "Pembiasaan ibadah harian, program mentoring akhlak 1-on-1, wawasan kebangsaan, serta wadah kepemimpinan organisasi siswa aktif.",
    "landing.pilar3_tag": "Mentoring Karakter",

    "landing.pilar4_title": "Fasilitas Digital & Lab AI",
    "landing.pilar4_desc":
      "Smart Classroom interaktif, Laboratorium Robotika & Kecerdasan Buatan modern, perpustakaan digital, serta sarana olahraga berstandar.",
    "landing.pilar4_tag": "Smart Eco-Campus",

    "landing.sambutan_nama": "Nanang Kosim",
    "landing.sambutan_jabatan": "Kepala Yayasan",
    "landing.sambutan_badge": "Dewan Pembina Kurikulum",
    "landing.sambutan_quote":
      "“Pendidikan sejati bukan sekadar mengisi wadah pengetahuan, melainkan menyalakan api keingintahuan, memperkuat kompas moral, dan membekali anak-anak kita dengan keberanian untuk menjadi pemecah masalah di panggung global.”",
    "landing.sambutan_body":
      "Kami menyambut hangat setiap calon siswa dan orang tua untuk bertumbuh bersama dalam keluarga besar sekolah kami. Mari persiapkan generasi emas yang mandiri, berkarakter, dan berdaya saing internasional.",

    // Ekstrakurikuler Unggulan
    "landing.ekskul_eyebrow": "Eksplorasi Minat & Bakat",
    "landing.ekskul_title": "Program Akademik & Pengembangan Diri",
    "landing.ekskul_subtitle":
      "Pilihan kurikulum terintegrasi dan wadah ekstrakurikuler komprehensif untuk mengasah potensi intelektual, artistik, dan kepemimpinan setiap siswa.",

    "landing.ekskul1_title": "Robotika & Coding Club",
    "landing.ekskul1_cat": "Sains & Teknologi",
    "landing.ekskul1_desc":
      "Eksplorasi kecerdasan buatan, mikrokontroler IoT, kompetisi robotik nasional & internasional.",

    "landing.ekskul2_title": "Karya Ilmiah Remaja (KIR)",
    "landing.ekskul2_cat": "Riset Akademis",
    "landing.ekskul2_desc":
      "Inkubasi riset sains terapan, bioteknologi, dan publikasi jurnal ilmiah tingkat SMA.",

    "landing.ekskul3_title": "English Debate & Model UN",
    "landing.ekskul3_cat": "Bahasa & Diplomasi",
    "landing.ekskul3_desc":
      "Pengasahan retorika kritis, diplomasi internasional simulasi PBB, serta sertifikasi IELTS/TOEFL.",

    "landing.ekskul4_title": "Sport Club (Basket & Futsal)",
    "landing.ekskul4_cat": "Olahraga & Fisik",
    "landing.ekskul4_desc":
      "Pelatihan fisik intensif bersama pelatih berlisensi nasional, turnamen DBL dan liga antar-sekolah.",

    "landing.ekskul5_title": "Desain Grafis & Sinematografi",
    "landing.ekskul5_cat": "Kreatif & Seni",
    "landing.ekskul5_desc":
      "Produksi film pendek, fotografi jurnalistik, animasi 3D, serta manajemen media digital sekolah.",

    "landing.ekskul6_title": "Olimpiade Sains Nasional (OSN)",
    "landing.ekskul6_cat": "Intensif Prestasi",
    "landing.ekskul6_desc":
      "Bimbingan khusus calon juara OSN di bidang Matematika, Fisika, Kimia, Astronomi, dan Informatika.",

    // Fasilitas Kampus & Spesifikasi
    "landing.fasilitas_eyebrow": "Infrastruktur Kampus",
    "landing.fasilitas_title": "Fasilitas Modern Penunjang Potensi",
    "landing.fasilitas_subtitle":
      "Sarana dan prasarana berstandar internasional yang dirancang untuk kenyamanan belajar, kesehatan raga, dan eksplorasi kreativitas tanpa batas.",

    "landing.fasilitas1_name": "Interactive Smart Classroom",
    "landing.fasilitas1_tag": "Akademik Digital",
    "landing.fasilitas1_desc":
      "Papan tulis pintar 86 inci 4K, sistem tata udara sentral, dan koneksi internet serat optik dedicated.",
    "landing.fasilitas1_specs":
      "Interactive Smart Board 86 Inch 4K Touch\nKapasitas ergonomis 24 siswa per kelas\nSistem sirkulasi udara HEPA Filter & AC Inverter\nHigh-speed Wi-Fi 6 per ruangan",

    "landing.fasilitas2_name": "Laboratorium Robotika & AI",
    "landing.fasilitas2_tag": "High-Tech Lab",
    "landing.fasilitas2_desc":
      "Workstation Core i9 generasi terbaru, perangkat mikrokontroler IoT, 3D Printer, dan arena uji robot.",
    "landing.fasilitas2_specs":
      "40 Unit Workstation Grafis High-Performance\n3D Printer & CNC Laser Cutter untuk prototipe\nToolkit sensor IoT, drone autonomous, dan kit robotik\nLisensi software riset AI & IDE pemrograman",

    "landing.fasilitas3_name": "Perpustakaan Digital & E-Learning",
    "landing.fasilitas3_tag": "Pusat Riset",
    "landing.fasilitas3_desc":
      "Akses 10.000+ e-book, jurnal internasional terakreditasi, kubikel riset hening, dan ruang diskusi.",
    "landing.fasilitas3_specs":
      "Akses repositori jurnal Cambridge & JSTOR\nTablet e-reader & workstation katalog digital\nSilent study pods untuk belajar mandiri\nKoleksi literatur fisik 15.000 judul terkurasi",

    "landing.fasilitas4_name": "Indoor Sport Hall & Gymnasium",
    "landing.fasilitas4_tag": "Kebugaran Fisik",
    "landing.fasilitas4_desc":
      "Lapangan multifungsi basket berstandar FIBA, lapangan futsal vinyl, bulu tangkis, dan fitness corner.",
    "landing.fasilitas4_specs":
      "Lantai kayu parket standar turnamen DBL/FIBA\nTribun penonton kapasitas 600 orang\nPeralatan kebugaran & conditioning modern\nLoker privat dan kamar mandi bilas bersih",

    "landing.fasilitas5_name": "Studio Podcast & Penyiaran Media",
    "landing.fasilitas5_tag": "Komunikasi Kreatif",
    "landing.fasilitas5_desc":
      "Peredam suara akustik profesional, kamera cinema 4K, mikrofon broadcast, dan software editing video.",
    "landing.fasilitas5_specs":
      "Ruang rekaman kedap suara standar broadcast\nMulti-camera setup 4K & switcher video live\nMikrofon podcast Shure dengan audio interface\nWadah kreasi karya jurnalistik siswa & warta sekolah",

    "landing.fasilitas6_name": "Auditorium & Gedung Serbaguna",
    "landing.fasilitas6_tag": "Ajang Prestasi",
    "landing.fasilitas6_desc":
      "Kapasitas 1.000 kursi dengan tata panggung audio-visual canggih untuk wisuda, seminar, dan festival seni.",
    "landing.fasilitas6_specs":
      "Kapasitas ampiteater 1.000 audiens\nVideotron LED raksasa P2.5 High-Definition\nSistem tata suara digital line array 20.000 watt\nRuang transit VIP dan ruang rias pengisi acara",
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
  } catch (error) {
    // Tabelnya belum ada, atau databasenya tidak terjangkau. Situs tetap
    // dilayani memakai nilai bawaan — halaman publik tidak boleh mati hanya
    // karena satu tabel CMS belum dibuat.
    //
    // Tetapi kegagalannya WAJIB tercatat. Versi pertama menelannya tanpa jejak
    // apa pun, dan bentuk kegagalannya menyesatkan: admin menyimpan konten,
    // panel melapor sukses, situs publik tetap menampilkan teks bawaan, dan
    // tidak ada satu pun tempat yang menjelaskan kenapa. Penyebab paling
    // sering adalah `TURSO_DATABASE_URL` yang belum disetel di workspace ini —
    // lihat `web-public/.env.example`.
    console.error(
      `[web-public] konten halaman '${cleanHalaman}' gagal dibaca, memakai nilai bawaan:`,
      error,
    );
    return fallback;
  }
}
