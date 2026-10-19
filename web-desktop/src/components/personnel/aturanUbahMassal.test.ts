import { describe, expect, test } from "bun:test";
import {
  alihkanSatu,
  alihkanSemuaTampil,
  type KolomMassal,
  kalimatKonfirmasiMassal,
  terapkanKolomMassal,
  validasiNilaiMassal,
} from "./aturanUbahMassal";

const KELAS: KolomMassal = {
  key: "id_rombel",
  label: "Kelas",
  opsi: [
    { value: "r1", label: "X IPA 1" },
    { value: "r2", label: "X IPA 2" },
  ],
};
const ANGKATAN: KolomMassal = {
  key: "angkatan",
  label: "Angkatan",
  jenis: "angka",
};
const MULAI: KolomMassal = {
  key: "tanggal_mulai_aktif",
  label: "Mulai aktif",
  jenis: "tanggal",
};

describe("aturanUbahMassal", () => {
  test("nilai kosong, di luar pilihan, dan format salah ditolak", () => {
    expect(validasiNilaiMassal(KELAS, " ")).toBe("Kelas wajib diisi.");
    expect(validasiNilaiMassal(KELAS, "r9")).toBe(
      "Pilihan Kelas tidak dikenal.",
    );
    expect(validasiNilaiMassal(KELAS, "r2")).toBeNull();
    expect(validasiNilaiMassal(ANGKATAN, "2025a")).toBe(
      "Angkatan harus berupa angka bulat.",
    );
    expect(validasiNilaiMassal(MULAI, "01/07/2026")).toBe(
      "Mulai aktif harus berupa tanggal.",
    );
    expect(validasiNilaiMassal(MULAI, "2026-07-01")).toBeNull();
  });

  test("hanya field yang dipilih yang berganti, field lain utuh", () => {
    const draft = {
      id_siswa: "S-1",
      nama_lengkap: "Budi",
      alamat: "Jl. A",
      angkatan: 2024,
    };
    expect(terapkanKolomMassal(draft, ANGKATAN, " 2025 ")).toEqual({
      ...draft,
      angkatan: 2025,
    });
  });

  test("kalimat konfirmasi memakai label pilihan dan memotong nama", () => {
    expect(
      kalimatKonfirmasiMassal(
        KELAS,
        "r1",
        ["Budi", "Ani", "Cici", "Dodi", "Eka"],
        "siswa",
      ),
    ).toBe(
      'Ubah Kelas menjadi "X IPA 1" untuk 5 siswa (Budi, Ani, Cici, dan 2 lainnya)?',
    );
  });

  test("pilih semua yang tampil, lalu lepas hanya yang tampil", () => {
    expect(alihkanSemuaTampil(["Z"], ["A", "B"])).toEqual(["Z", "A", "B"]);
    expect(alihkanSemuaTampil(["Z", "A", "B"], ["A", "B"])).toEqual(["Z"]);
    expect(alihkanSemuaTampil(["A"], [])).toEqual(["A"]);
    expect(alihkanSatu(["A", "B"], "A")).toEqual(["B"]);
    expect(alihkanSatu(["B"], "A")).toEqual(["B", "A"]);
  });
});
