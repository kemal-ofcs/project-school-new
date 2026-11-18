import { describe, expect, test } from "bun:test";
import { validatePasswordStrength } from "@/lib/auth/password";
import {
  buatPasswordSementara,
  dasarKodeOperator,
  dasarUsername,
  jadikanUnik,
  susunDraftAkun,
} from "./akun-massal";

describe("akun massal", () => {
  test("password sementara selalu lolos aturan kekuatan", () => {
    for (let i = 0; i < 500; i++) {
      const password = buatPasswordSementara();
      expect(password).toHaveLength(12);
      expect(validatePasswordStrength(password)).toBeNull();
      expect(password).not.toMatch(/[0O1lI]/);
    }
  });

  test("username dari kode karyawan, cadangan dari nama", () => {
    expect(dasarUsername("KRY-0012", "Budi Santoso")).toBe("kry-0012");
    expect(dasarUsername("", "Siti Nur Aisyah")).toBe("siti.nur");
    expect(dasarUsername("", "Élise Ñoño")).toBe("elise.nono");
    expect(dasarUsername("", "Al")).toBe("alakun");
  });

  test("kode operator huruf besar dan sah", () => {
    expect(dasarKodeOperator("kry 0012")).toBe("KRY-0012");
    expect(dasarKodeOperator("g1")).toBe("AKNG1");
    expect(dasarKodeOperator("x".repeat(30))).toHaveLength(24);
  });

  test("unik tanpa beda huruf, akhiran tetap dalam batas panjang", () => {
    const terpakai = new Set(["budi", "budi2"]);
    expect(jadikanUnik("Budi", terpakai, 40)).toBe("Budi3");
    expect(terpakai.has("budi3")).toBe(true);
    const panjang = "a".repeat(40);
    expect(jadikanUnik(panjang, new Set([panjang]), 40)).toHaveLength(40);
  });

  test("susun draft tidak bentrok dengan akun lama maupun sesamanya", () => {
    const draft = susunDraftAkun(
      [
        {
          id_unik: "p1",
          nama: "Budi",
          kode_karyawan: "G001",
          no_hp: "0812",
          email: "",
        },
        {
          id_unik: "p2",
          nama: "Budi",
          kode_karyawan: "G001",
          no_hp: "0813",
          email: "b@x.id",
        },
      ],
      [{ username: "g001", kodeOperator: "G001" }],
    );
    expect(draft.map((d) => d.username)).toEqual(["g0012", "g0013"]);
    expect(draft.map((d) => d.kodeOperator)).toEqual(["G0012", "G0013"]);
    expect(draft[1].email).toBe("b@x.id");
    expect(draft[0].idKaryawan).toBe("p1");
  });
});
