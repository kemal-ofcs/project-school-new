import { describe, expect, test } from "bun:test";
import { jurusanUntukUnit, type PilihanPmb, tolakPilihanPmb } from "./pmb";

const PILIHAN: PilihanPmb = {
  unit: [
    { idUnit: "u-sd", nama: "SD" },
    { idUnit: "u-smk", nama: "SMK" },
  ],
  jurusan: [
    { nama: "TKJ", idUnit: "u-smk" },
    { nama: "TSM", idUnit: "u-smk" },
  ],
};

describe("jurusanUntukUnit", () => {
  test("hanya jurusan milik unit itu", () => {
    expect(jurusanUntukUnit(PILIHAN, "SMK")).toEqual(["TKJ", "TSM"]);
    expect(jurusanUntukUnit(PILIHAN, "SD")).toEqual([]);
  });

  test("belum memilih unit = belum ada program", () => {
    expect(jurusanUntukUnit(PILIHAN, null)).toEqual([]);
  });

  test("jurusan tanpa unit berlaku di semua unit", () => {
    const lama = { ...PILIHAN, jurusan: [{ nama: "Umum", idUnit: null }] };
    expect(jurusanUntukUnit(lama, "SD")).toEqual(["Umum"]);
  });

  test("sekolah tanpa unit: semua jurusan tanpa unit", () => {
    const tanpaUnit = { unit: [], jurusan: [{ nama: "TKJ", idUnit: null }] };
    expect(jurusanUntukUnit(tanpaUnit, null)).toEqual(["TKJ"]);
  });
});

describe("tolakPilihanPmb", () => {
  test("pendaftar SD tidak diminta program keahlian", () => {
    expect(tolakPilihanPmb(PILIHAN, "SD", null)).toBeNull();
  });

  test("pendaftar SMK wajib memilih program miliknya", () => {
    expect(tolakPilihanPmb(PILIHAN, "SMK", "TKJ")).toBeNull();
    expect(tolakPilihanPmb(PILIHAN, "SMK", null)?.field).toBe("pilihanJurusan");
  });

  test("unit wajib bila sekolah punya unit aktif", () => {
    expect(tolakPilihanPmb(PILIHAN, null, null)).toEqual({
      field: "pilihanUnit",
      message: "Pilih unit tujuan.",
    });
  });

  test("nilai asing ditolak", () => {
    expect(tolakPilihanPmb(PILIHAN, "SMA", null)?.field).toBe("pilihanUnit");
    expect(tolakPilihanPmb(PILIHAN, "SD", "TKJ")?.field).toBe("pilihanJurusan");
    expect(tolakPilihanPmb(PILIHAN, "SMK", "Akuntansi")?.field).toBe(
      "pilihanJurusan",
    );
  });

  test("sekolah tanpa unit dan tanpa jurusan menerima kosong", () => {
    expect(tolakPilihanPmb({ unit: [], jurusan: [] }, null, null)).toBeNull();
  });
});
