import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { daftarHalamanUnit, KUNCI_UNIT, RUTE_TERPAKAI } from "./halaman-unit";

const slug = (...nama: string[]) =>
  daftarHalamanUnit(nama.map((n, i) => ({ idUnit: `u${i}`, nama: n }))).map(
    (u) => u.slug,
  );

describe("alamat halaman unit", () => {
  test("nama menjadi alamat huruf kecil", () => {
    expect(slug("SMP", "SMP Islam Terpadu", "S.M.A.", "Universitas")).toEqual([
      "smp",
      "smp-islam-terpadu",
      "s-m-a",
      "universitas",
    ]);
  });

  test("nama yang bentrok dengan rute lain diberi awalan", () => {
    expect(slug("Program", "PMB", "Selengkapnya")).toEqual([
      "unit-program",
      "unit-pmb",
      "unit-selengkapnya",
    ]);
  });

  test("nama kembar diberi nomor, unit pertama tetap memegang alamatnya", () => {
    expect(slug("SMP", "S M P", "smp")).toEqual(["smp", "s-m-p", "smp-2"]);
  });

  test("nama tanpa huruf latin tetap mendapat alamat", () => {
    expect(slug("مدرسة", "2026")).toEqual(["unit-1", "unit-2026"]);
  });

  /** Folder baru di `src/app` tanpa entri di sini menutup halaman unit senama. */
  test("daftar rute terpakai sama dengan folder src/app", () => {
    const folder = readdirSync(join(import.meta.dir, "..", "..", "app"), {
      withFileTypes: true,
    })
      .filter((isi) => isi.isDirectory() && !isi.name.startsWith("["))
      .map((isi) => isi.name)
      .sort();
    expect(folder).toEqual([...RUTE_TERPAKAI].sort());
  });

  /** Kontrak dengan `KOLOM_HALAMAN_UNIT` di panel admin, yang menguji set sama. */
  test("kunci isian unit", () => {
    expect<string[]>(Object.values(KUNCI_UNIT).sort()).toEqual(
      [
        "unit.foto",
        "unit.tagline",
        "unit.deskripsi",
        "unit.visi",
        "unit.misi",
        "unit.sejarah",
        "unit.sambutan",
        "unit.kepala_nama",
        "unit.kepala_jabatan",
        "unit.akreditasi",
        "unit.whatsapp",
      ].sort(),
    );
  });
});
