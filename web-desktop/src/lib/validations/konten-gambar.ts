/**
 * Aturan foto konten situs publik (tabel cloud-only `konten_gambar`, v48).
 *
 * Kembaran Rust: `desktop/konten_gambar.rs`. Keduanya diuji dengan vektor yang
 * sama di `konten-gambar.test.ts` dan modul Rust itu; mengubah satu sisi saja
 * membuat foto yang lolos di Web ditolak di Desktop, atau sebaliknya.
 *
 * Foto disimpan terpisah dari JSON konten dan dirujuk lewat id. Id adalah 32
 * hex pertama SHA-256 isi berkasnya, dihitung SERVER, sehingga isi yang sama
 * selalu satu baris dan situs publik boleh menyimpan gambarnya di cache
 * browser selamanya: id baru berarti isi baru.
 */

/** Batas setelah kompresi di perangkat (WebP 1600px mutu 0,8 biasanya 100-250 KB). */
export const MAKS_BYTE_GAMBAR_KONTEN = 400 * 1024;

/** Jumlah id per permintaan pratinjau, setara satu koleksi penuh plus cadangan. */
export const MAKS_ID_PRATINJAU_GAMBAR = 30;

export const JENIS_GAMBAR_KONTEN = ["image/webp", "image/jpeg"] as const;
export type JenisGambarKonten = (typeof JENIS_GAMBAR_KONTEN)[number];

const POLA_ID = /^[0-9a-f]{32}$/;
const POLA_DATA_URL = /^data:(image\/[a-z]+);base64,([A-Za-z0-9+/]*={0,2})$/;

export function idGambarKontenSah(nilai: unknown): nilai is string {
  return typeof nilai === "string" && POLA_ID.test(nilai);
}

export type HasilUraiGambar =
  | { ok: true; jenis: JenisGambarKonten; base64: string; ukuran: number }
  | { ok: false; pesan: string };

/**
 * Tanda tangan berkas harus cocok dengan jenis yang diakui: WebP diawali
 * `RIFF....WEBP`, JPEG diawali `FF D8 FF`. Berkas yang mengaku WebP tetapi
 * isinya lain ditolak, supaya situs publik tidak pernah menyajikan sesuatu
 * dengan `Content-Type` yang salah.
 */
export function tandaTanganCocok(
  jenis: JenisGambarKonten,
  awal: Uint8Array,
): boolean {
  if (jenis === "image/jpeg") {
    return awal[0] === 0xff && awal[1] === 0xd8 && awal[2] === 0xff;
  }
  const ascii = (dari: number, sampai: number) =>
    String.fromCharCode(...awal.slice(dari, sampai));
  return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
}

/** Ukuran hasil dekode base64 tanpa mendekodenya. */
export function ukuranBase64(base64: string): number {
  if (base64.length % 4 !== 0) return -1;
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return (base64.length / 4) * 3 - padding;
}

/**
 * Urai data URL kiriman perangkat. Byte awalnya diterima terpisah karena
 * cara mendekode base64 berbeda per bahasa; aturannya tetap satu.
 */
export function uraiGambarKonten(
  dataUrl: unknown,
  dekodeAwal: (base64: string) => Uint8Array,
): HasilUraiGambar {
  const cocok = POLA_DATA_URL.exec(String(dataUrl ?? "").trim());
  if (!cocok) {
    return { ok: false, pesan: "Berkas foto tidak terbaca." };
  }
  const [, jenisMentah, base64] = cocok;
  const jenis = JENIS_GAMBAR_KONTEN.find((j) => j === jenisMentah);
  if (!jenis) {
    return { ok: false, pesan: "Foto harus berformat WebP atau JPEG." };
  }
  const ukuran = ukuranBase64(base64);
  if (ukuran <= 0) {
    return { ok: false, pesan: "Berkas foto tidak terbaca." };
  }
  if (ukuran > MAKS_BYTE_GAMBAR_KONTEN) {
    return {
      ok: false,
      pesan: "Foto masih lebih dari 400 KB setelah dikompres. Pilih foto lain.",
    };
  }
  if (!tandaTanganCocok(jenis, dekodeAwal(base64.slice(0, 16)))) {
    return { ok: false, pesan: "Isi berkas tidak sesuai formatnya." };
  }
  return { ok: true, jenis, base64, ukuran };
}

/**
 * Foto yatim: lebih dari sehari dan tidak dirujuk konten mana pun. Jeda sehari
 * melindungi foto yang baru diunggah tetapi kontennya belum disimpan.
 * Dieja sama di `desktop/konten_gambar.rs`.
 */
export const HAPUS_GAMBAR_YATIM_SQL = `DELETE FROM konten_gambar
  WHERE created_at < datetime('now', '-1 day')
    AND NOT EXISTS (
      SELECT 1 FROM konten_publik k WHERE instr(k.nilai, konten_gambar.id_gambar) > 0
    );`;
