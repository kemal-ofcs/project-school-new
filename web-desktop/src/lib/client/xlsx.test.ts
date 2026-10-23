import { describe, expect, test } from "bun:test";
import {
  AngkaExcel,
  createXlsxBuffer,
  createXlsxWorkbook,
  readWorkbookRows,
} from "./xlsx";

describe("readWorkbookRows CSV", () => {
  test("sel berkutip yang memuat baris baru tetap satu sel", async () => {
    const csv = 'No;"Jml. Saudara\r\nKandung";Nama\r\n;;\r\n1;2;"Ani ""A"""\n';
    expect(await readWorkbookRows(new File([csv], "daftar_pd.csv"))).toEqual([
      ["No", "Jml. Saudara\r\nKandung", "Nama"],
      ["1", "2", 'Ani "A"'],
    ]);
  });
});

// Entri zip ditulis tanpa kompresi, jadi XML sheet terbaca langsung dari
// byte-nya. Pembaca (`readWorkbookTable`) butuh DOMParser peramban.
describe("createXlsxBuffer", () => {
  test("AngkaExcel menjadi sel Angka; nilai lain tetap teks", () => {
    const xml = new TextDecoder().decode(
      createXlsxBuffer(
        ["Kode", "Saldo", "NIK"],
        [["BRG-1", new AngkaExcel(10.25), 12]],
        "Uji",
      ),
    );
    expect(xml).toContain('<c r="B2"><v>10.25</v></c>');
    expect(xml).toContain('<c r="C2" t="inlineStr"><is><t>12</t></is></c>');
  });
});

describe("createXlsxWorkbook", () => {
  test("setiap lembar punya sheet, relasi, dan pane beku sendiri", () => {
    const xml = new TextDecoder().decode(
      createXlsxWorkbook([
        {
          nama: "Rekap",
          headers: ["No", "Nama", "1"],
          rows: [],
          kolomBeku: 2,
          lebar: [5, 30, 4],
        },
        { nama: "Detail", headers: ["Tanggal"], rows: [["2026-10-05"]] },
      ]),
    );
    expect(xml).toContain('<sheet name="Rekap" sheetId="1" r:id="rId1"/>');
    expect(xml).toContain('<sheet name="Detail" sheetId="2" r:id="rId2"/>');
    expect(xml).toContain('Target="worksheets/sheet2.xml"');
    expect(xml).toContain('<pane xSplit="2" ySplit="1" topLeftCell="C2"');
    expect(xml).toContain('<col min="2" max="2" width="30" customWidth="1"/>');
  });
});
