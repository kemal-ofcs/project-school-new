import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import {
  daftarHalamanUnit,
  halamanKontenLingkup,
  halamanKontenUnit,
  hrefDaftarLingkup,
  LINGKUP_UMUM,
  lingkupUnit,
  profilUnit,
  RUTE_TERPAKAI,
} from "./halaman-unit";
import { profilKosong } from "./school-profile";

const slug = (...nama: string[]) =>
  daftarHalamanUnit(nama.map((n, i) => ({ idUnit: `u${i}`, nama: n }))).map(
    (u) => u.slug,
  );

const SMP = { idUnit: "u1", nama: "SMP", slug: "smp" };

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
    expect(slug("Program", "PMB", "Kontak")).toEqual([
      "unit-program",
      "unit-pmb",
      "unit-kontak",
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
    const app = join(import.meta.dir, "..", "..", "app");
    const isi = (folder: string) =>
      readdirSync(folder, { withFileTypes: true })
        .filter((item) => item.isDirectory())
        .map((item) => item.name);
    const folder = [
      ...isi(app).filter((nama) => !/^[[(]/.test(nama)),
      ...isi(join(app, "(umum)")),
    ].sort();
    expect(folder).toEqual([...RUTE_TERPAKAI].sort());
  });
});

describe("lingkup konten", () => {
  /** Kontrak dengan `halamanKontenCms` di panel admin, vektor yang sama. */
  test("nama halaman konten", () => {
    expect(halamanKontenUnit("u1", "profil")).toBe("unit:u1:profil");
    expect(halamanKontenLingkup(lingkupUnit(SMP), "landing")).toBe(
      "unit:u1:landing",
    );
    expect(halamanKontenLingkup(LINGKUP_UMUM, "profil")).toBe("profil");
  });

  test("tombol daftar situs unit membuka formulir unit itu", () => {
    expect(hrefDaftarLingkup(lingkupUnit(SMP))).toBe("/pmb/daftar?unit=smp");
    expect(hrefDaftarLingkup(LINGKUP_UMUM)).toBe("/pmb");
  });

  /** Data yayasan yang terbaca seolah milik unit lebih buruk dari kolom kosong. */
  test("identitas unit tidak mewarisi kontak dan pimpinan yayasan", () => {
    const yayasan = {
      ...profilKosong(),
      namaSekolah: "Yayasan Harapan",
      alamat: "Jl. Yayasan",
      telepon: "021",
      email: "yayasan@contoh.id",
      situs: "https://contoh.id",
      namaPimpinan: "Ketua Yayasan",
      jabatanPimpinan: "Ketua",
      logoUrl: "logo",
    };
    const kosong = profilUnit(yayasan, SMP, {}, {});
    expect(kosong.namaSekolah).toBe("SMP");
    expect(kosong.namaCabang).toBe("Yayasan Harapan");
    expect(kosong.logoUrl).toBe("logo");
    expect([
      kosong.alamat,
      kosong.telepon,
      kosong.email,
      kosong.situs,
      kosong.namaPimpinan,
      kosong.jabatanPimpinan,
    ]).toEqual([null, null, null, null, null, null]);

    const terisi = profilUnit(
      yayasan,
      SMP,
      { "kontak.alamat": "Jl. SMP", "kontak.telepon": "022" },
      { "landing.sambutan_nama": "Rina", "landing.sambutan_jabatan": "Kepala" },
    );
    expect(terisi.alamat).toBe("Jl. SMP");
    expect(terisi.telepon).toBe("022");
    expect(terisi.namaPimpinan).toBe("Rina");
    expect(terisi.jabatanPimpinan).toBe("Kepala");
  });
});
