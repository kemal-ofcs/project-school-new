import { describe, expect, test } from "bun:test";
import type { BahanErapor } from "@/types/grades";
import {
  adaPeringatan,
  capaianTerendah,
  capaianTertinggi,
  deskripsiCapaian,
  labelSemester,
  labelTingkat,
  PEMETAAN_BAWAAN,
  susunErapor,
  teksBertab,
} from "./erapor";

function bahan(lmTambahan = 0): BahanErapor {
  const lm = [
    { id: "lm1", nama: "Berpikir Komputasional", tanggal: "2026-08-01" },
    { id: "lm2", nama: "Algoritma", tanggal: "2026-08-15" },
    { id: "lm3", nama: "Arsitektur Komputer", tanggal: "2026-09-01" },
    ...Array.from({ length: lmTambahan }, (_, i) => ({
      id: `lmx${i}`,
      nama: `Materi ${i}`,
      tanggal: "2026-09-10",
    })),
  ];
  return {
    tahun_ajaran: "2026/2027",
    semester: "Ganjil",
    rombel: "VII-A",
    tingkat: 7,
    dicetak: "2026-12-10 10:00:00",
    jenis: [],
    siswa: [
      { id_siswa: "S1", nama: "Ahmad", nis: "262707001", nisn: "0123456789" },
      { id_siswa: "S2", nama: "Siti", nis: "262707002", nisn: "" },
    ],
    mapel: [
      {
        id_mapel: "inf",
        kode_mapel: "MP-INF-07",
        nama_mapel: "Informatika",
        guru: "Budi Santoso, S.Kom.",
        penilaian: [
          ...lm.map((p) => ({
            id_penilaian: p.id,
            id_jenis: "jns-uh",
            nama_penilaian: p.nama,
            tanggal: p.tanggal,
            nilai_maks: 100,
            kkm: 75,
          })),
          {
            id_penilaian: "sts",
            id_jenis: "jns-uts",
            nama_penilaian: "STS",
            tanggal: "2026-10-01",
            nilai_maks: 50,
            kkm: 75,
          },
        ],
        skor: [
          { id_penilaian: "lm1", id_siswa: "S1", skor: 88 },
          { id_penilaian: "lm2", id_siswa: "S1", skor: 92 },
          { id_penilaian: "lm3", id_siswa: "S1", skor: 70 },
          { id_penilaian: "sts", id_siswa: "S1", skor: 42 },
        ],
        rekap: [
          {
            id_siswa: "S1",
            nilai_akhir: 83,
            rata: { "jns-uh": 83.33, "jns-uts": 84, "jns-uas": null },
          },
          {
            id_siswa: "S2",
            nilai_akhir: null,
            rata: { "jns-uh": 0, "jns-uts": 0, "jns-uas": null },
          },
        ],
      },
    ],
  };
}

describe("ekspor e-Rapor", () => {
  test("label kolom identitas", () => {
    expect(labelTingkat(7)).toBe("VII (7)");
    expect(labelTingkat(20)).toBe("20");
    expect(labelSemester("Ganjil")).toBe("1 (Ganjil)");
    expect(labelSemester("Genap")).toBe("2 (Genap)");
  });

  test("kalimat capaian mengikuti batas skor", () => {
    expect(capaianTertinggi({ nama: "X", nilai: 92, kkm: 75 })).toBe(
      "Menunjukkan penguasaan yang sangat baik dalam X.",
    );
    expect(capaianTertinggi({ nama: "X", nilai: 80, kkm: 75 })).toBe(
      "Menunjukkan penguasaan yang baik dalam X.",
    );
    expect(capaianTertinggi({ nama: "X", nilai: 60, kkm: 75 })).toBe(
      "Mulai memahami X, tetapi masih perlu bimbingan.",
    );
    expect(capaianTerendah({ nama: "Y", nilai: 70, kkm: 75 })).toBe(
      "Perlu bimbingan dalam Y.",
    );
    expect(capaianTerendah({ nama: "Y", nilai: 80, kkm: 75 })).toBe(
      "Perlu penguatan dalam Y.",
    );
    expect(deskripsiCapaian([{ nama: "Satu", nilai: 90, kkm: 75 }])).toEqual([
      "Menunjukkan penguasaan yang sangat baik dalam Satu.",
      "",
    ]);
    expect(deskripsiCapaian([])).toEqual(["", ""]);
  });

  test("baris, sel kosong, dan peringatan", () => {
    const berkas = susunErapor(bahan(), PEMETAAN_BAWAAN);
    expect(berkas.kolom.length).toBe(22);
    expect(berkas.kolom[11]).toBe("Sumatif_LM_1");
    expect(berkas.kolom[14]).toBe("Rata_Sumatif_LM (Auto)");
    expect(berkas.baris[0]).toEqual([
      "NMP-20261-001",
      "2026/2027",
      "1 (Ganjil)",
      "VII (7)",
      "VII-A",
      "0123456789",
      "262707001",
      "Ahmad",
      "MP-INF-07",
      "Informatika",
      "Budi Santoso, S.Kom.",
      88,
      92,
      70,
      83,
      84,
      "",
      83,
      "",
      "",
      "Menunjukkan penguasaan yang sangat baik dalam Algoritma.",
      "Perlu bimbingan dalam Arsitektur Komputer.",
    ]);
    // Siswa tanpa skor: sel kosong, bukan 0.
    expect(berkas.baris[1]?.slice(11, 18)).toEqual([
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ]);
    expect(berkas.baris[1]?.[0]).toBe("NMP-20261-002");
    expect(berkas.peringatan).toEqual({
      tanpaNisn: 1,
      skorKosong: 4,
      tanpaSts: [],
      tanpaSas: ["Informatika"],
      lebihTigaLm: [],
    });
    expect(adaPeringatan(berkas.peringatan)).toBe(true);
  });

  test("lebih dari tiga LM menambah kolom", () => {
    const berkas = susunErapor(bahan(2), PEMETAAN_BAWAAN);
    expect(berkas.kolom.slice(11, 16)).toEqual([
      "Sumatif_LM_1",
      "Sumatif_LM_2",
      "Sumatif_LM_3",
      "Sumatif_LM_4",
      "Sumatif_LM_5",
    ]);
    expect(berkas.peringatan.lebihTigaLm).toEqual(["Informatika"]);
    expect(susunErapor(bahan(), PEMETAAN_BAWAAN, "lain").baris).toEqual([]);
  });

  test("teks bertab", () => {
    const teks = teksBertab(susunErapor(bahan(), PEMETAAN_BAWAAN));
    const baris = teks.split("\n");
    expect(baris.length).toBe(3);
    expect(baris[0]?.split("\t")[0]).toBe("ID_Nilai");
    expect(baris[1]?.split("\t")[11]).toBe("88");
  });
});
