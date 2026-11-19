import { describe, expect, test } from "bun:test";
import {
  type FormatTampil,
  type HasilBerkasTransfer,
  type RekeningTampil,
  susunTransfer,
} from "@/lib/validations/transfer";
import { berkasTransfer, lembarTransferUmum } from "./transfer-excel";

const debet = {
  id_rekening: "rek-1",
  id_bank: "bnk-014",
  no_rekening: "0001112223",
  nama_rekening: "Sekolah",
  keterangan: "",
  is_aktif: 1,
  diubah_oleh: "",
  updated_at: "",
  nama_bank: "BCA",
  kode_bank: "014",
  bank_aktif: 1,
} satisfies RekeningTampil;

function hasil(format: FormatTampil | null): HasilBerkasTransfer {
  const run = { period_start: "2026-11-01", period_end: "2026-11-30" };
  return {
    run: {
      id: "run-11",
      ...run,
      status: "APPROVED",
      total_net_payout: 3000,
      total_employees: 2,
    },
    debet,
    format,
    riwayat: [],
    dicatat: true,
    susunan: susunTransfer({
      run,
      item: [
        {
          id_karyawan: "k1",
          nama_karyawan: "Ani",
          kode_karyawan: "G01",
          net_salary: 1000,
          id_keluar: "",
          bank: "bca",
          no_rekening: "0123",
          nama_rekening: "Ani",
        },
        {
          id_karyawan: "k2",
          nama_karyawan: "Budi",
          kode_karyawan: "G02",
          net_salary: 2000,
          id_keluar: "",
          bank: "",
          no_rekening: "",
          nama_rekening: "",
        },
      ],
      bank: [
        {
          id_bank: "bnk-014",
          nama: "BCA",
          kode: "014",
          alias: "[]",
          is_aktif: 1,
        },
      ],
      debet,
      format,
      tanggal_efektif: "2026-11-25",
    }),
  };
}

describe("transfer-excel", () => {
  test("Excel umum: Transfer, Perlu dibayar manual, Ringkasan", () => {
    const lembar = lembarTransferUmum(hasil(null));
    expect(lembar.map((l) => l.nama)).toEqual([
      "Transfer",
      "Perlu dibayar manual",
      "Ringkasan",
    ]);
    expect(lembar[0].rows.length).toBe(1);
    expect(lembar[1].rows.length).toBe(1);
    expect(berkasTransfer(hasil(null)).nama).toBe(
      "transfer-run-11-2026-11-25.xlsx",
    );
  });

  test("format CSV memakai renderTeks, total = baris yang masuk", async () => {
    const format: FormatTampil = {
      id_format: "fmt-1",
      nama: "BCA KlikBisnis",
      id_bank: "",
      jenis: "csv",
      pemisah: ";",
      pakai_judul: 1,
      kutip: 0,
      desimal: 1,
      cakupan: "semua",
      kolom: [
        { isian: "no_rekening", judul: "Rek", teks: null },
        { isian: "nominal", judul: "Jumlah", teks: null },
      ],
      maks_berita: null,
      is_aktif: 1,
      diubah_oleh: "",
      updated_at: "",
      nama_bank: "",
    };
    const b = berkasTransfer(hasil(format));
    expect(b.nama).toBe("transfer-run-11-2026-11-25-BCA-KlikBisnis.csv");
    expect(await b.blob.text()).toBe("Rek;Jumlah\r\n0123;1000.00\r\n");
  });
});
