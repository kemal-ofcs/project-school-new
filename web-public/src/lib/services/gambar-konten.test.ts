import { expect, test } from "bun:test";
import { srcGambarKonten, tautanGaleri, tautanLuar } from "./gambar-konten";
import { fotoJurusan, idFoto, koleksiFasilitas } from "./landing-collections";

const ID = "ba7816bf8f01cfea414140de5dae2223";

test("foto koleksi dan jurusan hanya menerima id 32 hex", () => {
  expect(idFoto(ID)).toBe(ID);
  expect(idFoto("../rahasia")).toBe("");
  expect(
    koleksiFasilitas({
      "landing.fasilitas_items": JSON.stringify([{ name: "Lab", foto: ID }]),
    })[0].foto,
  ).toBe(ID);
  expect(
    fotoJurusan({
      "landing.jurusan_foto": JSON.stringify({ TSM: ID, RPL: "bukan-id" }),
    }),
  ).toEqual({ TSM: ID });
  expect(fotoJurusan({ "landing.jurusan_foto": "{rusak" })).toEqual({});
});

test("sumber gambar: id ke rute ber-cache, data URL lama apa adanya", () => {
  expect(srcGambarKonten(ID)).toBe(`/api/konten/gambar/${ID}`);
  expect(srcGambarKonten("data:image/jpeg;base64,AAAA")).toBe(
    "data:image/jpeg;base64,AAAA",
  );
  expect(srcGambarKonten("javascript:alert(1)")).toBeNull();
  expect(srcGambarKonten(undefined)).toBeNull();
});

test("tautan luar hanya http(s); galeri jatuh ke Instagram", () => {
  expect(tautanLuar("javascript:alert(1)")).toBeNull();
  expect(tautanLuar("instagram.com/sekolah")).toBeNull();
  expect(tautanLuar(" https://instagram.com/sekolah ")).toBe(
    "https://instagram.com/sekolah",
  );
  expect(
    tautanGaleri({ "kontak.instagram": "https://instagram.com/sekolah" }),
  ).toEqual({
    href: "https://instagram.com/sekolah",
    label: "Lihat foto lainnya di Instagram",
  });
  expect(
    tautanGaleri({
      "kontak.galeri_url": "https://drive.google.com/galeri",
      "kontak.instagram": "https://instagram.com/sekolah",
    }),
  ).toEqual({
    href: "https://drive.google.com/galeri",
    label: "Lihat foto lainnya",
  });
  expect(tautanGaleri({})).toBeNull();
});
