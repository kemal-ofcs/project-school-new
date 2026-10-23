import { describe, expect, test } from "bun:test";
import { AngkaExcel, createXlsxBuffer, readWorkbookRows } from "./xlsx";

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
