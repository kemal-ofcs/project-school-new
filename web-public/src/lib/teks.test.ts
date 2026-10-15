import { expect, test } from "bun:test";
import { pecahButir, pecahPoin } from "./teks";

test("pecahButir membuang nomor/poin dan baris kosong", () => {
  expect(
    pecahButir("1. Satu\r\n\n2) Dua\n - Tiga\n• Empat\n10. Sepuluh 2024"),
  ).toEqual(["Satu", "Dua", "Tiga", "Empat", "Sepuluh 2024"]);
  expect(pecahButir("Tahun 2024 sekolah berdiri")).toEqual([
    "Tahun 2024 sekolah berdiri",
  ]);
});

test("pecahPoin memecah paragraf bernomor dari CMS", () => {
  expect(
    pecahPoin(
      "1. Bilingual school 2. Pemanduan BTQ 3. Skill Paspor setoran 3 Juz 4. Hafalan surat pilihan",
    ),
  ).toEqual([
    "Bilingual school",
    "Pemanduan BTQ",
    "Skill Paspor setoran 3 Juz",
    "Hafalan surat pilihan",
  ]);
  // Per baris tetap dipecah per baris.
  expect(pecahPoin("A\nB")).toEqual(["A", "B"]);
  // Angka yang tidak berurutan dari 1 bukan daftar.
  expect(pecahPoin("Kelas 7 dan 8. Ruang 2. Lab")).toEqual([
    "Kelas 7 dan 8. Ruang 2. Lab",
  ]);
  expect(pecahPoin("Satu kalimat biasa.")).toEqual(["Satu kalimat biasa."]);
  expect(pecahPoin("")).toEqual([]);
});
