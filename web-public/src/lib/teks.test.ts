import { expect, test } from "bun:test";
import { pecahButir } from "./teks";

test("pecahButir membuang nomor/poin dan baris kosong", () => {
  expect(
    pecahButir("1. Satu\r\n\n2) Dua\n - Tiga\n• Empat\n10. Sepuluh 2024"),
  ).toEqual(["Satu", "Dua", "Tiga", "Empat", "Sepuluh 2024"]);
  expect(pecahButir("Tahun 2024 sekolah berdiri")).toEqual([
    "Tahun 2024 sekolah berdiri",
  ]);
});
