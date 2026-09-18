/**
 * Koleksi berulang di landing page: pilar, ekstrakurikuler, fasilitas, statistik.
 *
 * Empat blok ini dulu disimpan sebagai KUNCI BERNOMOR yang jumlahnya tetap —
 * `landing.pilar1_title`, `pilar2_title`, sampai `pilar4_title`. Slotnya mati di
 * dalam kode, sehingga menambah pilar kelima mustahil tanpa menyunting komponen
 * dan panel adminnya sekaligus. Sekarang tiap blok disimpan sebagai SATU kunci
 * berisi JSON array, dan jumlahnya ditentukan orang yang mengisinya.
 *
 * Aturan pembacaannya sengaja berlapis, dan urutannya penting:
 *
 *   1. Kunci koleksi ada dan berisi array tidak kosong  → dipakai.
 *   2. Tidak ada                                        → kunci bernomor lama.
 *   3. Keduanya tidak ada                               → bawaan di komponen.
 *
 * Lapis kedua bukan kerapian, melainkan syarat: pemasangan yang sudah mengisi
 * konten lewat panel versi sebelumnya akan kehilangan seluruh isinya begitu
 * aplikasi diperbarui kalau kunci lamanya berhenti dibaca.
 *
 * Bentuk JSON-nya adalah KONTRAK dengan panel admin
 * (`web-desktop/src/lib/constants/landing-cms-fields.ts`). Kedua sisi menulis
 * dan membaca kunci yang sama; mengubah nama field di satu sisi saja membuat
 * koleksinya terbaca kosong tanpa satu pun pesan kesalahan.
 */

/** Batas jumlah item per koleksi. */
export const MAKS_ITEM_KOLEKSI = 24;

export const KUNCI_KOLEKSI = {
  pilar: "landing.pilar_items",
  ekskul: "landing.ekskul_items",
  fasilitas: "landing.fasilitas_items",
  stat: "landing.stat_items",
} as const;

function teks(nilai: unknown): string {
  return typeof nilai === "string" ? nilai.trim() : "";
}

/**
 * Urai satu kunci koleksi menjadi daftar objek.
 *
 * Nilai yang tidak bisa diurai diperlakukan sebagai "belum diisi", BUKAN
 * sebagai galat: satu baris JSON rusak tidak boleh menjatuhkan halaman depan
 * situs. Pemanggilnya lalu jatuh ke kunci lama atau ke nilai bawaan.
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

export interface ItemStat {
  label: string;
  value: string;
  sub: string;
}

/**
 * Spesifikasi fasilitas: satu baris per spesifikasi.
 *
 * Diterima sebagai array (bentuk baru) maupun teks berbaris-baris (bentuk lama
 * `landing.fasilitasN_specs`), supaya kedua jalur menghasilkan hal yang sama.
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
 * Bangun daftar final sebuah koleksi.
 *
 * `bawaan` dipakai utuh ketika tidak ada satu pun sumber lain, dan juga menjadi
 * cadangan per-field untuk item yang posisinya masih sejajar dengan bawaan —
 * itulah yang membuat mengisi satu field saja tidak mengosongkan sisanya.
 */
export function bangunKoleksi<T extends object>(
  dariKoleksi: Record<string, unknown>[],
  dariKunciLama: T[],
  bawaan: T[],
  normalisasi: (item: Record<string, unknown>, cadangan: T | undefined) => T,
): T[] {
  if (dariKoleksi.length > 0) {
    return dariKoleksi.map((item, index) => normalisasi(item, bawaan[index]));
  }
  if (dariKunciLama.length > 0) return dariKunciLama;
  return bawaan;
}

export function normalisasiPilar(
  item: Record<string, unknown>,
  cadangan?: ItemPilar,
): ItemPilar {
  return {
    title: teks(item.title) || cadangan?.title || "",
    desc: teks(item.desc) || cadangan?.desc || "",
    tag: teks(item.tag) || cadangan?.tag || "",
  };
}

export function normalisasiEkskul(
  item: Record<string, unknown>,
  cadangan?: ItemEkskul,
): ItemEkskul {
  return {
    title: teks(item.title) || cadangan?.title || "",
    category: teks(item.category) || cadangan?.category || "",
    desc: teks(item.desc) || cadangan?.desc || "",
  };
}

export function normalisasiFasilitas(
  item: Record<string, unknown>,
  cadangan?: ItemFasilitas,
): ItemFasilitas {
  const specs = uraiSpecs(item.specs);
  return {
    name: teks(item.name) || cadangan?.name || "",
    tag: teks(item.tag) || cadangan?.tag || "",
    desc: teks(item.desc) || cadangan?.desc || "",
    specs: specs.length > 0 ? specs : (cadangan?.specs ?? []),
  };
}

export function normalisasiStat(
  item: Record<string, unknown>,
  cadangan?: ItemStat,
): ItemStat {
  return {
    label: teks(item.label) || cadangan?.label || "",
    value: teks(item.value) || cadangan?.value || "",
    sub: teks(item.sub) || cadangan?.sub || "",
  };
}
