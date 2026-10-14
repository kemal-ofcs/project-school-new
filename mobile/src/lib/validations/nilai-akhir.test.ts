import { describe, expect, test } from "bun:test";
import {
  bulatAkhir,
  hadirDiGerbang,
  hariSekolahUntuk,
  hitungNilaiAkhir,
  idJenisEfektif,
  jenisNilaiDraftSchema,
  jenisWarisan,
  klasifikasiHari,
  parseHariSekolah,
  persenKehadiran,
  rataJenis,
  rentangSemester,
  validateBobotNilai,
  validateDaftarHari,
  validateHariSekolah,
  validateJenisNilai,
} from "./nilai-akhir";

// Vektor kembar `mod tests` di `src-tauri/src/desktop/nilai_akhir.rs`.

const hasil = <T>(h: { ok: true; value: T } | { ok: false; error: string }) =>
  h.ok ? h.value : h.error;

describe("jenis", () => {
  test("id efektif dan jenis warisan", () => {
    expect(idJenisEfektif(null, "Ulangan Harian")).toBe("jns-uh");
    expect(idJenisEfektif(" ", "UAS")).toBe("jns-uas");
    expect(idJenisEfektif("jns-abc", "Tugas")).toBe("jns-abc");
    expect(idJenisEfektif(null, "Kuis")).toBeNull();
    expect(jenisWarisan("jns-uts")).toBe("UTS");
    expect(jenisWarisan("jns-abc")).toBe("Tugas");
  });

  test("validateJenisNilai", () => {
    const galat = (draft: object) =>
      hasil(validateJenisNilai(jenisNilaiDraftSchema.parse(draft)));
    expect(galat({ nama: " Proyek ", urutan: 6 })).toEqual({
      nama: "Proyek",
      urutan: 6,
      is_aktif: true,
    });
    expect(galat({ nama: " " })).toBe("Nama jenis wajib diisi.");
    expect(galat({ nama: "a".repeat(41) })).toBe(
      "Nama jenis maksimal 40 karakter.",
    );
    expect(galat({ nama: "X", urutan: 1000 })).toBe(
      "Urutan harus bilangan 0 sampai 999.",
    );
  });

  test("validateBobotNilai", () => {
    const j = (bobot: number, is_aktif = true) => ({
      id_jenis: "j",
      bobot,
      is_aktif,
    });
    expect(hasil(validateBobotNilai(10, [j(30), j(60), j(0, false)]))).toBe(
      100,
    );
    expect(hasil(validateBobotNilai(10, [j(30), j(50)]))).toBe(
      "Total bobot harus 100%, sekarang 90%.",
    );
    expect(hasil(validateBobotNilai(0, [j(90), j(10, false)]))).toBe(
      "Jenis nonaktif tidak boleh berbobot.",
    );
    expect(hasil(validateBobotNilai(0, [j(100.5)]))).toBe(
      "Bobot harus bilangan bulat 0 sampai 100.",
    );
    expect(hasil(validateBobotNilai(-1, [j(101)]))).toBe(
      "Bobot harus bilangan bulat 0 sampai 100.",
    );
  });
});

describe("hari sekolah", () => {
  test("validasi", () => {
    expect(hasil(validateDaftarHari([5, 1, 3]))).toEqual([1, 3, 5]);
    expect(hasil(validateDaftarHari([]))).toBe(
      "Pilih minimal satu hari sekolah.",
    );
    expect(hasil(validateDaftarHari([0, 1]))).toBe(
      "Hari sekolah harus angka 1 (Senin) sampai 7 (Minggu).",
    );
    expect(hasil(validateDaftarHari([1, 1]))).toBe(
      "Hari sekolah tidak boleh ganda.",
    );
    expect(
      hasil(
        validateHariSekolah({ bawaan: [1, 2, 3, 4, 5], unit: { u1: [6, 1] } }),
      ),
    ).toEqual({ bawaan: [1, 2, 3, 4, 5], unit: { u1: [1, 6] } });
    expect(hasil(validateHariSekolah({ bawaan: [1], lain: 1 }))).toBe(
      "Data hari sekolah tidak valid.",
    );
    expect(hasil(validateHariSekolah({ bawaan: [1], unit: { u1: [] } }))).toBe(
      "Pilih minimal satu hari sekolah.",
    );
  });

  test("parse dan pilih per unit", () => {
    expect(parseHariSekolah(null).bawaan).toEqual([1, 2, 3, 4, 5]);
    expect(parseHariSekolah("bukan json").bawaan).toEqual([1, 2, 3, 4, 5]);
    const cfg = parseHariSekolah(
      '{"bawaan":[1,2,3,4,5],"unit":{"u1":[1,2,3,4,5,6]}}',
    );
    expect(hariSekolahUntuk(cfg, "u1")).toEqual([1, 2, 3, 4, 5, 6]);
    expect(hariSekolahUntuk(cfg, "u2")).toEqual([1, 2, 3, 4, 5]);
    expect(hariSekolahUntuk(cfg, null)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("rentang semester", () => {
  const ganjil = {
    nama_tahun: "2026/2027",
    semester: "Ganjil",
    tanggal_mulai: "2026-07-13",
    tanggal_selesai: "2027-06-20",
  };
  test("baris sendiri, saudara, dan aturan tetap", () => {
    expect(hasil(rentangSemester(ganjil, null, "Ganjil"))).toEqual({
      mulai: "2026-07-13",
      selesai: "2027-06-20",
    });
    expect(
      hasil(
        rentangSemester(
          ganjil,
          { tanggal_mulai: "2027-01-04", tanggal_selesai: "2027-06-19" },
          "Genap",
        ),
      ),
    ).toEqual({ mulai: "2027-01-04", selesai: "2027-06-19" });
    expect(hasil(rentangSemester(ganjil, null, "Genap"))).toEqual({
      mulai: "2027-01-01",
      selesai: "2027-06-20",
    });
    expect(
      hasil(
        rentangSemester(
          {
            ...ganjil,
            semester: "Genap",
            tanggal_mulai: "2027-01-04",
            tanggal_selesai: "2027-06-30",
          },
          null,
          "Ganjil",
        ),
      ),
    ).toBe(
      "Rentang tanggal semester Ganjil tidak bisa ditentukan. Buat baris tahun ajaran untuk semester Ganjil.",
    );
  });
});

describe("kehadiran", () => {
  test("klasifikasi hari dan persen", () => {
    expect(hadirDiGerbang(1, "")).toBe(true);
    expect(hadirDiGerbang(0, "Terlambat")).toBe(true);
    expect(hadirDiGerbang(0, "Izin")).toBe(false);
    expect(klasifikasiHari(true, false, "Hadir")).toBe("Hadir");
    expect(klasifikasiHari(true, true, "Hadir")).toBe("Bolos");
    expect(klasifikasiHari(true, false, "Izin")).toBe("Hadir");
    expect(klasifikasiHari(false, false, "Dispensasi")).toBe("Dispensasi");
    expect(klasifikasiHari(false, false, "Sakit")).toBe("Sakit");
    expect(klasifikasiHari(false, true, "Izin")).toBe("Izin");
    expect(klasifikasiHari(false, false, "")).toBe("Alfa");
    expect(persenKehadiran(18, 22, 2)).toBe(90);
    expect(persenKehadiran(0, 5, 5)).toBeNull();
  });
});

describe("nilai akhir", () => {
  test("rata jenis ditimbang bobot penilaian, kosong = 0", () => {
    expect(
      rataJenis([
        { skor: 80, nilai_maks: 100, bobot: 1 },
        { skor: null, nilai_maks: 100, bobot: 1 },
        { skor: 45, nilai_maks: 50, bobot: 2 },
      ]),
    ).toBe(65);
    expect(rataJenis([])).toBeNull();
  });

  test("bobot dibagi ulang dan dibulatkan sekali", () => {
    expect(
      hitungNilaiAkhir([
        { bobot: 30, nilai: 65 },
        { bobot: 20, nilai: null },
        { bobot: 40, nilai: 90 },
        { bobot: 10, nilai: 80 },
      ]),
    ).toEqual({ nilai_akhir: 79, bobot_efektif: [37.5, null, 50, 12.5] });
    expect(
      hitungNilaiAkhir([
        { bobot: 50, nilai: 75 },
        { bobot: 50, nilai: 80 },
      ]).nilai_akhir,
    ).toBe(78);
    expect(hitungNilaiAkhir([{ bobot: 0, nilai: 50 }]).nilai_akhir).toBeNull();
    expect(
      hitungNilaiAkhir([{ bobot: 60, nilai: null }]).bobot_efektif,
    ).toEqual([null]);
    expect(bulatAkhir(77.49999999999)).toBe(78);
    expect(bulatAkhir(77.4)).toBe(77);
  });
});
