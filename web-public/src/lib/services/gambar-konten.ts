import type { Client } from "@libsql/client";

/**
 * Foto konten (`konten_gambar`, v48) yang diunggah lewat panel konten admin.
 *
 * Id-nya hash isi berkas, jadi satu id selalu berarti gambar yang sama dan
 * boleh di-cache browser selamanya. Nilai CMS yang masih data URL (foto hero
 * sebelum v48) tetap dipakai apa adanya sampai diunggah ulang.
 */
export function srcGambarKonten(nilai: string | undefined): string | null {
  const teks = (nilai ?? "").trim();
  if (/^[0-9a-f]{32}$/.test(teks)) return `/api/konten/gambar/${teks}`;
  if (teks.startsWith("data:image/")) return teks;
  return null;
}

/** Tautan media sosial dari CMS: hanya alamat http(s) yang dipakai. */
export function tautanLuar(nilai: string | undefined): string | null {
  const teks = (nilai ?? "").trim();
  return /^https?:\/\/[^\s"'<>]+$/i.test(teks) ? teks : null;
}

export async function readContentImage(
  client: Client,
  id: string,
): Promise<{ jenis: string; bytes: Buffer } | null> {
  if (!/^[0-9a-f]{32}$/.test(id)) return null;
  const res = await client.execute({
    sql: "SELECT jenis, data_base64 FROM konten_gambar WHERE id_gambar = ? LIMIT 1;",
    args: [id],
  });
  const baris = res.rows[0];
  if (!baris) return null;
  const bytes = Buffer.from(String(baris.data_base64 ?? ""), "base64");
  return bytes.length > 0 ? { jenis: String(baris.jenis), bytes } : null;
}

/**
 * Tombol "Lihat foto lainnya" di bawah Fasilitas dan Ekstrakurikuler: tautan
 * galeri dari tab Kontak, atau Instagram sekolah bila tautan galeri kosong.
 */
export function tautanGaleri(
  kontak: Record<string, string | undefined>,
): { href: string; label: string } | null {
  const href =
    tautanLuar(kontak["kontak.galeri_url"]) ??
    tautanLuar(kontak["kontak.instagram"]);
  if (!href) return null;
  return {
    href,
    label: /instagram\.com/i.test(href)
      ? "Lihat foto lainnya di Instagram"
      : "Lihat foto lainnya",
  };
}
