import { describe, expect, test } from "bun:test";
import { uraiCsvImport } from "./csvImportManual";

describe("uraiCsvImport", () => {
  test("koma, BOM, dan keterangan berkutip yang memuat koma", () => {
    const rows = uraiCsvImport(
      '﻿tanggal,id_unik,jam_masuk,jam_pulang,status_kehadiran,keterangan\r\n2026-10-20,K001,07:00,15:00,Hadir,"Rapat, lalu pulang"\r\n',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      tanggal: "2026-10-20",
      id_unik: "K001",
      jam_masuk: "07:00",
      keterangan: "Rapat, lalu pulang",
    });
  });

  test("tempelan Excel bertab dan header berhuruf besar", () => {
    const rows = uraiCsvImport(
      "Tanggal\tID_Unik\tJam_Masuk\n2026-10-20\tK002\t07:05",
    );
    expect(rows[0]).toMatchObject({ id_unik: "K002", jam_masuk: "07:05" });
    expect(rows[0].status_kehadiran).toBe("Hadir");
  });

  test("titik koma dipakai sebagai pemisah", () => {
    const rows = uraiCsvImport(
      "tanggal;id_unik;status_kehadiran\n20/10/2026;K003;Sakit",
    );
    expect(rows[0]).toMatchObject({
      tanggal: "20/10/2026",
      status_kehadiran: "Sakit",
    });
  });

  test("tanggal kosong tidak diganti hari ini", () => {
    const rows = uraiCsvImport("tanggal,id_unik,jam_masuk\n,K004,07:00");
    expect(rows[0].tanggal).toBe("");
  });

  test("header tanpa kolom tanggal ditolak", () => {
    expect(() => uraiCsvImport("tgl,id_unik\n2026-10-20,K005")).toThrow(
      "Header CSV wajib memuat kolom tanggal dan id_unik.",
    );
  });
});
