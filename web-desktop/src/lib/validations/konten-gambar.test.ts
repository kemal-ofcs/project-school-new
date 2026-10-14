import { describe, expect, test } from "bun:test";
import {
  idGambarKontenSah,
  MAKS_BYTE_GAMBAR_KONTEN,
  ukuranBase64,
  uraiGambarKonten,
} from "./konten-gambar";

// Vektor kembar dengan `mod tests` di `desktop/konten_gambar.rs`. Ubah keduanya
// bersamaan.
const JPEG = "data:image/jpeg;base64,/9j/4AAQSkZJRgAB";
const WEBP = "data:image/webp;base64,UklGRiQAAABXRUJQVlA4IA==";
const PNG = "data:image/png;base64,iVBORw0KGgoAAAAA";
const WEBP_ISI_JPEG = "data:image/webp;base64,/9j/4AAQSkZJRgAB";
const TERLALU_BESAR = `data:image/jpeg;base64,/9j/${"A".repeat(546_132)}`;

const dekode = (b64: string) => new Uint8Array(Buffer.from(b64, "base64"));

describe("uraiGambarKonten", () => {
  test("menerima JPEG dan WebP bertanda tangan sah", () => {
    expect(uraiGambarKonten(JPEG, dekode)).toEqual({
      ok: true,
      jenis: "image/jpeg",
      base64: "/9j/4AAQSkZJRgAB",
      ukuran: 12,
    });
    const webp = uraiGambarKonten(WEBP, dekode);
    expect(webp.ok && webp.ukuran).toBe(16);
  });

  test("menolak jenis lain, isi yang tidak cocok, dan bentuk rusak", () => {
    expect(uraiGambarKonten(PNG, dekode)).toEqual({
      ok: false,
      pesan: "Foto harus berformat WebP atau JPEG.",
    });
    expect(uraiGambarKonten(WEBP_ISI_JPEG, dekode)).toEqual({
      ok: false,
      pesan: "Isi berkas tidak sesuai formatnya.",
    });
    for (const rusak of [
      "",
      "bukan data url",
      "data:image/jpeg;base64,",
      "data:image/jpeg;base64,abc",
    ]) {
      expect(uraiGambarKonten(rusak, dekode)).toEqual({
        ok: false,
        pesan: "Berkas foto tidak terbaca.",
      });
    }
  });

  test("menolak foto di atas 400 KB", () => {
    expect(ukuranBase64(TERLALU_BESAR.split(",")[1])).toBe(
      MAKS_BYTE_GAMBAR_KONTEN + 2,
    );
    expect(uraiGambarKonten(TERLALU_BESAR, dekode)).toEqual({
      ok: false,
      pesan: "Foto masih lebih dari 400 KB setelah dikompres. Pilih foto lain.",
    });
  });
});

test("idGambarKontenSah hanya menerima 32 hex huruf kecil", () => {
  expect(idGambarKontenSah("ba7816bf8f01cfea414140de5dae2223")).toBe(true);
  expect(idGambarKontenSah("BA7816BF8F01CFEA414140DE5DAE2223")).toBe(false);
  expect(idGambarKontenSah("ba7816bf8f01cfea414140de5dae222")).toBe(false);
  expect(idGambarKontenSah("../../etc/passwd")).toBe(false);
  expect(idGambarKontenSah(42)).toBe(false);
});
