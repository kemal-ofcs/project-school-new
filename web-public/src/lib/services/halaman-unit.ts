import type { SchoolProfile } from "@/lib/services/school-profile";
import { namaTampil } from "@/lib/services/school-profile";

/**
 * Situs per unit (`/smp`, `/smp/profil`, dan seterusnya).
 *
 * `akademik_unit` tidak punya kolom kode, jadi alamatnya diturunkan dari nama
 * unit. Isinya memakai kolom CMS yang sama dengan halaman umum, disimpan di
 * `konten_publik` dengan nama halaman `unit:<id_unit>:<tab>`, sehingga mengganti
 * nama unit mengubah alamat tanpa melepas isinya.
 *
 * Bentuk nama halamannya KONTRAK dengan `halamanKontenCms` di
 * `web-desktop/src/lib/constants/landing-cms-fields.ts` dan diuji di kedua sisi.
 */
export type TabKonten = "profil" | "kontak" | "program" | "landing";

export const halamanKontenUnit = (idUnit: string, tab: TabKonten) =>
  `unit:${idUnit}:${tab}`;

/** Jumlah tombol unit di halaman depan sebelum sisanya dilipat. */
export const MAKS_TOMBOL_UNIT = 3;

/**
 * Nama folder di `src/app`. Halaman statis menang atas `[unit]`, jadi unit
 * bernama "Program" tanpa daftar ini tidak akan pernah terbuka halamannya.
 * Diuji terhadap isi folder itu.
 */
export const RUTE_TERPAKAI = new Set([
  "api",
  "berita",
  "kontak",
  "pmb",
  "profil",
  "program",
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

/**
 * Di bagian situs mana sebuah halaman dirender. `prefiks` kosong = situs umum,
 * `/smp` = situs unit itu.
 */
export interface Lingkup {
  unit: HalamanUnit | null;
  prefiks: string;
}

export const LINGKUP_UMUM: Lingkup = { unit: null, prefiks: "" };

export const lingkupUnit = (unit: HalamanUnit): Lingkup => ({
  unit,
  prefiks: `/${unit.slug}`,
});

export const halamanKontenLingkup = (lingkup: Lingkup, tab: TabKonten) =>
  lingkup.unit ? halamanKontenUnit(lingkup.unit.idUnit, tab) : tab;

/** Tujuan tombol daftar: situs unit langsung membuka formulir unit itu. */
export const hrefDaftarLingkup = (lingkup: Lingkup) =>
  lingkup.unit ? `/pmb/daftar?unit=${lingkup.unit.slug}` : "/pmb";

/**
 * Identitas yang ditampilkan situs unit.
 *
 * Alamat, kontak, dan pimpinan milik yayasan SENGAJA tidak diwarisi: isian unit
 * yang kosong disembunyikan, supaya data yayasan tidak terbaca seolah milik unit.
 * Logo tetap satu karena CMS tidak punya kolom logo per unit.
 */
export function profilUnit(
  profil: SchoolProfile,
  unit: HalamanUnit,
  kontak: Record<string, string | undefined>,
  landing: Record<string, string | undefined>,
): SchoolProfile {
  return {
    ...profil,
    namaSekolah: unit.nama,
    namaCabang: profil.namaSekolah ? namaTampil(profil) : null,
    alamat: kontak["kontak.alamat"] || null,
    telepon: kontak["kontak.telepon"] || null,
    email: kontak["kontak.email"] || null,
    situs: null,
    namaPimpinan: landing["landing.sambutan_nama"] || null,
    jabatanPimpinan: landing["landing.sambutan_jabatan"] || null,
  };
}
