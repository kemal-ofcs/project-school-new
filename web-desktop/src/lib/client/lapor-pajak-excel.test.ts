import { describe, expect, test } from "bun:test";
import {
  type HasilLaporan,
  type RekapPph,
  rekapA1,
  rekapBpjs,
  rekapPph,
  type SlipLapor,
} from "@/lib/validations/lapor-pajak";
import vektor from "@/lib/validations/lapor-pajak.vektor.json";
import {
  lembarRekapA1,
  lembarRekapBpjs,
  lembarRekapPph,
} from "./lapor-pajak-excel";
import { AngkaExcel, createXlsxWorkbook } from "./xlsx";

// Entri zip ditulis tanpa kompresi, jadi XML sheet terbaca dari byte-nya.

const slip = vektor.slip as SlipLapor[];
const pemotong = {
  npwp: "0123456789012345",
  nitku: "0123456789012345000000",
  nama_penandatangan: "Siti Kepala",
  nik_penandatangan: "",
  no_bpjs_ketenagakerjaan: "",
  no_bpjs_kesehatan: "",
};

describe("lapor-pajak: workbook rekap", () => {
  test("PPh 21 November: satu baris per pegawai, angka bertipe Angka, NIK teks", () => {
    const h: HasilLaporan<RekapPph> = {
      rekap: rekapPph(slip, "2026-11"),
      pemotong,
    };
    const lembar = lembarRekapPph(h);
    expect(lembar.map((l) => l.nama)).toEqual(["PPh 21", "Keterangan"]);
    const [pph] = lembar;
    expect(pph?.rows).toHaveLength(4);
    for (const baris of pph?.rows ?? []) {
      expect(baris).toHaveLength(pph?.headers.length ?? 0);
    }
    const ani = pph?.rows[0] ?? [];
    expect(ani[1]).toBe("3201010101010001");
    expect(ani[10]).toEqual(new AngkaExcel(150_000));
    expect(pph?.rows[3]?.[12]).toBe("Slip lama tanpa rincian pajak");

    const xml = new TextDecoder().decode(createXlsxWorkbook(lembar));
    expect(xml).toContain('<sheet name="PPh 21"');
    expect(xml).toContain("<t>3201010101010001</t>");
    expect(xml).toContain("<v>150000</v>");
    expect(xml).toContain("<t>0123456789012345000000</t>");
  });

  test("BPJS dan A1: kolom sejajar judul", () => {
    for (const lembar of [
      lembarRekapBpjs({ rekap: rekapBpjs(slip, "2026-11"), pemotong }),
      lembarRekapA1({ rekap: rekapA1(slip, "2026"), pemotong }),
    ]) {
      const [rekap] = lembar;
      for (const baris of rekap?.rows ?? []) {
        expect(baris).toHaveLength(rekap?.headers.length ?? 0);
      }
    }
  });
});
