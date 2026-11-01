/**
 * Halaman per unit di situs publik (`/smp`, `/universitas`, dan seterusnya).
 *
 * `akademik_unit` tidak punya kolom kode, jadi alamatnya diturunkan dari nama
 * unit. Isinya disimpan di `konten_publik` dengan nama halaman `unit:<id_unit>`,
 * sehingga mengganti nama unit mengubah alamat tanpa melepas isinya.
 *
 * `KUNCI_UNIT` adalah KONTRAK dengan `KOLOM_HALAMAN_UNIT` di
 * `web-desktop/src/lib/constants/landing-cms-fields.ts` dan diuji di kedua sisi.
 */
export const KUNCI_UNIT = {
  foto: "unit.foto",
  tagline: "unit.tagline",
  deskripsi: "unit.deskripsi",
  visi: "unit.visi",
  misi: "unit.misi",
  sejarah: "unit.sejarah",
  sambutan: "unit.sambutan",
  kepalaNama: "unit.kepala_nama",
  kepalaJabatan: "unit.kepala_jabatan",
  akreditasi: "unit.akreditasi",
  whatsapp: "unit.whatsapp",
} as const;

export const halamanKontenUnit = (idUnit: string) => `unit:${idUnit}`;

/** Jumlah tombol unit di halaman depan sebelum sisanya pindah ke Selengkapnya. */
export const MAKS_TOMBOL_UNIT = 3;

/**
 * Nama folder di `src/app`. Halaman statis menang atas `[unit]`, jadi unit
 * bernama "Program" tanpa daftar ini tidak akan pernah terbuka halamannya.
 * Diuji terhadap isi folder itu.
 */
export const RUTE_TERPAKAI = new Set([
  "api",
  "beranda",
  "berita",
  "kontak",
  "pmb",
  "profil",
  "program",
  "selengkapnya",
  "wali",
]);

export interface HalamanUnit {
  idUnit: string;
  nama: string;
  slug: string;
}

function slugNama(nama: string): string {
  return nama
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Alamat setiap unit, mengikuti urutan masukan. Nama yang bentrok dengan rute
 * lain diberi awalan `unit-`, dan nama kembar diberi nomor mulai dari unit kedua.
 */
export function daftarHalamanUnit(
  unit: { idUnit: string; nama: string }[],
): HalamanUnit[] {
  const terpakai = new Set<string>();
  return unit.map(({ idUnit, nama }, indeks) => {
    const dasar = slugNama(nama) || String(indeks + 1);
    const awal =
      RUTE_TERPAKAI.has(dasar) || /^\d+$/.test(dasar) ? `unit-${dasar}` : dasar;
    let slug = awal;
    for (let nomor = 2; terpakai.has(slug); nomor++) slug = `${awal}-${nomor}`;
    terpakai.add(slug);
    return { idUnit, nama, slug };
  });
}
