import { describe, expect, test } from "bun:test";
import vektor from "../validations/sesi-lanjutan.vektor.json";
import { kandidatShiftSesi, pilihShiftSesi } from "./sesi-lanjutan";

// Vektor kembar `tests_sesi_lanjutan` di desktop/scanner.rs.
describe("pilihShiftSesi (vektor)", () => {
  for (const kasus of vektor.kasus) {
    test(kasus.nama, () => {
      expect(pilihShiftSesi(kasus.asal, kasus.kandidat)).toBe(kasus.hasil);
    });
  }
});

describe("kandidatShiftSesi (vektor)", () => {
  for (const kasus of vektor.kandidat_dimuat) {
    test(kasus.nama, () => {
      expect(kandidatShiftSesi(kasus.asal, kasus.semua)).toEqual(kasus.hasil);
    });
  }
});
