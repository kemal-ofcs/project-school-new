/**
 * Koleksi berulang di landing page: statistik, pilar, ekstrakurikuler,
 * fasilitas, tahapan PMB, dan FAQ.
 *
 * SUMBERNYA HANYA DATABASE. Situs publik tidak lagi membawa isi bawaan apa pun
 * untuk blok-blok ini: CMS-nya sudah punya CRUD, sehingga teks contoh yang
 * tertanam di kode hanya menjadi konten kedua yang tidak bisa disunting siapa
 * pun — dan tampil di situs sekolah seolah-olah ditulis sekolah itu. Koleksi
 * yang kosong berarti blok itu disembunyikan, bukan diisi teks contoh.
 *
 * Aturan pembacaannya dua lapis:
 *
 *   1. Kunci koleksi berisi array yang tidak kosong → dipakai.
 *   2. Tidak ada → kunci bernomor lama (`landing.pilar1_title`, …).
 *
 * Lapis kedua MEMBACA DATABASE, bukan teks bawaan: pemasangan yang mengisi
 * konten lewat panel versi sebelumnya menyimpannya di kunci bernomor, dan
 * kontennya tidak boleh lenyap hanya karena aplikasinya diperbarui. Panel
 * admin memindahkan kunci lama ke koleksi saat konten pertama kali disimpan
 * ulang lalu mengosongkannya, jadi lapis ini pelan-pelan tidak terpakai.
 *
 * Nama kunci dan field-nya adalah KONTRAK dengan panel admin
 * (`web-desktop/src/lib/constants/landing-cms-fields.ts`). Mengubahnya di satu
 * sisi saja membuat koleksinya terbaca kosong tanpa satu pun pesan kesalahan.
 */

/** Batas jumlah item per koleksi. */
export const MAKS_ITEM_KOLEKSI = 24;

export const KUNCI_KOLEKSI = {
  stat: "landing.stat_items",
  pilar: "landing.pilar_items",
  ekskul: "landing.ekskul_items",
  fasilitas: "landing.fasilitas_items",
  pmbTahapan: "landing.pmb_tahapan_items",
  faq: "landing.faq_items",
} as const;

type Konten = Record<string, string | undefined>;

function teks(nilai: unknown): string {
  return typeof nilai === "string" ? nilai.trim() : "";
}

/**
 * Urai satu kunci koleksi menjadi daftar objek.
 *
 * JSON yang tidak bisa diurai diperlakukan sebagai "belum diisi", BUKAN galat:
 * satu baris rusak tidak boleh menjatuhkan halaman depan situs.
 */
export function uraiKoleksi(
  nilai: string | undefined,
): Record<string, unknown>[] {
  const mentah = teks(nilai);
  if (!mentah) return [];
  try {
    const hasil = JSON.parse(mentah);
    if (!Array.isArray(hasil)) return [];
    return hasil
      .filter(
        (item): item is Record<string, unknown> =>
          typeof item === "object" && item !== null && !Array.isArray(item),
      )
      .slice(0, MAKS_ITEM_KOLEKSI);
  } catch {
    return [];
  }
}

/**
 * Spesifikasi fasilitas: satu baris per poin.
 *
 * Diterima sebagai array (bentuk koleksi) maupun teks berbaris-baris (bentuk
 * kunci lama `landing.fasilitasN_specs`), supaya kedua jalur sama hasilnya.
 */
export function uraiSpecs(nilai: unknown): string[] {
  if (Array.isArray(nilai)) {
    return nilai.map((baris) => teks(baris)).filter(Boolean);
  }
  return teks(nilai)
    .split("\n")
    .map((baris) => baris.trim())
    .filter(Boolean);
}

/**
 * Peta kunci bernomor lama → nama field koleksi. Hanya empat blok pertama yang
 * pernah punya kunci bernomor; FAQ dan tahapan PMB lahir langsung sebagai
 * koleksi, jadi keduanya tidak punya lapis kedua.
 */
export const KUNCI_LAMA = {
  stat: {
    awalan: "stat",
    peta: { label: "label", value: "value", sub: "sub" },
  },
  pilar: {
    awalan: "pilar",
    peta: { title: "title", desc: "desc", tag: "tag" },
  },
  ekskul: {
    awalan: "ekskul",
    peta: { title: "title", category: "cat", desc: "desc" },
  },
  fasilitas: {
    awalan: "fasilitas",
    peta: { name: "name", tag: "tag", desc: "desc", specs: "specs" },
  },
} as const;

/** Nomor tertinggi yang diperiksa pada kunci bernomor lama. */
const BATAS_NOMOR_LAMA = MAKS_ITEM_KOLEKSI;

export function dariKunciBernomor(
  konten: Konten,
  awalan: string,
  peta: Record<string, string>,
): Record<string, unknown>[] {
  const hasil: Record<string, unknown>[] = [];
  for (let nomor = 1; nomor <= BATAS_NOMOR_LAMA; nomor++) {
    const item: Record<string, unknown> = {};
    let adaIsi = false;
    for (const [field, akhiran] of Object.entries(peta)) {
      const nilai = teks(konten[`landing.${awalan}${nomor}_${akhiran}`]);
      if (nilai) {
        item[field] = nilai;
        adaIsi = true;
      }
    }
    if (adaIsi) hasil.push(item);
  }
  return hasil;
}

/** Item yang seluruh field-nya kosong — baris yang ditambahkan lalu tak diisi. */
function adaIsi(item: object): boolean {
  return Object.values(item).some((nilai) =>
    Array.isArray(nilai) ? nilai.length > 0 : teks(nilai) !== "",
  );
}

function ambil<T extends object>(
  konten: Konten,
  kunci: string,
  lama: { awalan: string; peta: Record<string, string> } | null,
  normalisasi: (item: Record<string, unknown>) => T,
): T[] {
  const dariKoleksi = uraiKoleksi(konten[kunci]);
  const sumber =
    dariKoleksi.length > 0
      ? dariKoleksi
      : lama
        ? dariKunciBernomor(konten, lama.awalan, lama.peta)
        : [];
  return sumber.map(normalisasi).filter(adaIsi);
}

export interface ItemStat {
  label: string;
  value: string;
  sub: string;
}
export interface ItemPilar {
  title: string;
  desc: string;
  tag: string;
}
export interface ItemEkskul {
  title: string;
  category: string;
  desc: string;
}
export interface ItemFasilitas {
  name: string;
  tag: string;
  desc: string;
  specs: string[];
}
export interface ItemTahapan {
  title: string;
  desc: string;
}
export interface ItemFaq {
  q: string;
  a: string;
}

export const koleksiStat = (konten: Konten): ItemStat[] =>
  ambil(konten, KUNCI_KOLEKSI.stat, KUNCI_LAMA.stat, (item) => ({
    label: teks(item.label),
    value: teks(item.value),
    sub: teks(item.sub),
  }));

export const koleksiPilar = (konten: Konten): ItemPilar[] =>
  ambil(konten, KUNCI_KOLEKSI.pilar, KUNCI_LAMA.pilar, (item) => ({
    title: teks(item.title),
    desc: teks(item.desc),
    tag: teks(item.tag),
  }));

export const koleksiEkskul = (konten: Konten): ItemEkskul[] =>
  ambil(konten, KUNCI_KOLEKSI.ekskul, KUNCI_LAMA.ekskul, (item) => ({
    title: teks(item.title),
    category: teks(item.category),
    desc: teks(item.desc),
  }));

export const koleksiFasilitas = (konten: Konten): ItemFasilitas[] =>
  ambil(konten, KUNCI_KOLEKSI.fasilitas, KUNCI_LAMA.fasilitas, (item) => ({
    name: teks(item.name),
    tag: teks(item.tag),
    desc: teks(item.desc),
    specs: uraiSpecs(item.specs),
  }));

export const koleksiTahapanPmb = (konten: Konten): ItemTahapan[] =>
  ambil(konten, KUNCI_KOLEKSI.pmbTahapan, null, (item) => ({
    title: teks(item.title),
    desc: teks(item.desc),
  }));

export const koleksiFaq = (konten: Konten): ItemFaq[] =>
  ambil(konten, KUNCI_KOLEKSI.faq, null, (item) => ({
    q: teks(item.q),
    a: teks(item.a),
  }));
