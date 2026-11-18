import { describe, expect, test } from "bun:test";
import vektor from "../validations/password-baru.vektor.json";
import { periksaPasswordBaru } from "./password";

// Vektor kembar `password_baru_vektor` di desktop/commands.rs.
describe("periksaPasswordBaru (vektor)", () => {
  for (const kasus of vektor.kasus) {
    test(`${kasus.baru} -> ${kasus.hasil ?? "sah"}`, () => {
      expect(periksaPasswordBaru(kasus.lama, kasus.baru)).toBe(kasus.hasil);
    });
  }
});
