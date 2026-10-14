import { describe, expect, test } from "bun:test";
import {
  buatTabelPdf,
  tabelArusKas,
  tabelPosisi,
} from "@/components/keuangan/eksporKeuangan";

const teks = (isi: ArrayBuffer) => new TextDecoder("latin1").decode(isi);

describe("tabel laporan keuangan", () => {
  const posisi = {
    sampai: "2026-10-14",
    aset: [{ id_akun: "akun-kas", kode: "1101", nama: "Kas", saldo: 900_000 }],
    kewajiban: [],
    aset_neto: [],
    surplus_akumulasi: 1_000_000,
    total_aset: 900_000,
    total_kewajiban: 0,
    total_aset_neto: 1_000_000,
    selisih: -100_000,
  };

  test("posisi timpang membawa peringatan, seimbang tidak", () => {
    expect(tabelPosisi(posisi).peringatan).toContain("tidak seimbang");
    expect(
      tabelPosisi({ ...posisi, total_aset: 1_000_000, selisih: 0 }).peringatan,
    ).toBeNull();
    expect(tabelPosisi(posisi).periode).toBe("Per 14/10/2026");
  });

  test("arus kas memisah kelompok masuk dan keluar", () => {
    const t = tabelArusKas({
      dari: "2026-10-01",
      sampai: "2026-10-31",
      akun_kas: [{ id_akun: "akun-kas", kode: "1101", nama: "Kas" }],
      saldo_awal: 100,
      kelompok: [
        {
          sumber: "Pembayaran",
          label: "Penerimaan pembayaran siswa",
          masuk: 600,
          keluar: 100,
          bersih: 500,
        },
        {
          sumber: "Payroll",
          label: "Pembayaran gaji",
          masuk: 0,
          keluar: 200,
          bersih: -200,
        },
      ],
      total_masuk: 600,
      total_keluar: 300,
      saldo_akhir: 400,
    });
    const label = t.baris.map((b) => b.label);
    expect(label.indexOf("Penerimaan pembayaran siswa")).toBeLessThan(
      label.indexOf("Pengeluaran kas"),
    );
    expect(label.indexOf("Pembayaran gaji")).toBeGreaterThan(
      label.indexOf("Pengeluaran kas"),
    );
    expect(
      t.baris.find((b) => b.label === "Kenaikan (penurunan) kas")?.jumlah,
    ).toBe(300);
    // Pembatalan pembayaran mengurangi penerimaan, tidak tampil sebagai keluar.
    expect(
      t.baris.filter((b) => b.label === "Penerimaan pembayaran siswa"),
    ).toEqual([
      { jenis: "akun", label: "Penerimaan pembayaran siswa", jumlah: 500 },
    ]);
  });

  test("PDF memuat judul, akun, dan peringatan", async () => {
    const isi = teks(await buatTabelPdf(tabelPosisi(posisi)));
    expect(isi.startsWith("%PDF")).toBe(true);
    expect(isi).toContain("Laporan Posisi Keuangan");
    expect(isi).toContain("Kas");
    expect(isi).toContain("tidak seimbang");
  });
});
