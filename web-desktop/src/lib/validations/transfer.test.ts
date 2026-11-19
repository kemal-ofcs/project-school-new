import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as R from "./hr-reimburse";
import * as T from "./transfer";
import vektor from "./transfer.vektor.json";

// Vektor yang sama dengan `mod tests` di `desktop/transfer.rs`.

type Kasus = { nama: string; galat?: string; hasil?: unknown };

function cocok<T>(
  hasil: { ok: true; nilai: T } | { ok: false; galat: string },
  k: Kasus,
) {
  if (k.galat !== undefined) {
    expect(hasil.ok ? null : hasil.galat, k.nama).toBe(k.galat);
  } else {
    if (!hasil.ok) throw new Error(`${k.nama}: ${hasil.galat}`);
    expect(hasil.nilai as unknown, k.nama).toEqual(k.hasil ?? null);
  }
}

function rustDi(berkas: string): string[] {
  const hasil: string[] = [];
  for (const dir of ["desktop", "mobile"]) {
    const lokasi = [
      join(import.meta.dir, `../../../src-tauri/src/${dir}/${berkas}`),
      join(
        import.meta.dir,
        `../../../../mobile/src-tauri/src/${dir}/${berkas}`,
      ),
    ].find(existsSync);
    if (lokasi) hasil.push(readFileSync(lokasi, "utf8").replace(/\s+/g, ""));
  }
  return hasil;
}

const harfiah = (t: string) => JSON.stringify(t).replace(/\s+/g, "");

describe("transfer: SQL dan pesan kembar", () => {
  test("disalin harfiah ke transfer.rs (Desktop dan Mobile)", () => {
    const teks = [
      T.SEED_BANK_SQL,
      T.BANK_SQL,
      T.REKENING_SQL,
      T.FORMAT_SQL,
      T.BANK_SATU_SQL,
      T.SIMPAN_BANK_SQL,
      T.SIMPAN_REKENING_SQL,
      T.SIMPAN_FORMAT_SQL,
      T.RUN_TRANSFER_SQL,
      T.BARIS_TRANSFER_SQL,
      T.CATAT_UNDUH_SQL,
      T.RIWAYAT_UNDUH_SQL,
      T.PESAN_STATUS_RUN,
      T.PESAN_RUN_TIDAK_ADA,
      T.PESAN_DEBET_NONAKTIF,
      T.PESAN_FORMAT_NONAKTIF,
      T.PESAN_REKENING_GANDA,
      T.PESAN_FORMAT_GANDA,
      T.PESAN_BANK_NONAKTIF,
      T.PESAN_AKSI_PENGATURAN,
      T.IZIN_PENGATURAN,
      ...T.IZIN_UNDUH,
      ...T.AKSI_PENGATURAN,
      ...T.JENIS_BERKAS,
      ...T.PEMISAH,
      ...T.CAKUPAN,
      ...T.ISIAN_TRANSFER,
      ...T.STATUS_RUN_TRANSFER,
      ...T.TANDA_MANUAL,
      ...T.TANDA_PERINGATAN,
    ];
    const rust = rustDi("transfer.rs");
    expect(rust.length).toBeGreaterThan(0);
    for (const isi of rust) {
      for (const t of teks) expect(isi).toContain(harfiah(t));
      for (const [nama, nilai] of [
        ["MAKS_NAMA:usize", T.MAKS_NAMA],
        ["MAKS_KETERANGAN:usize", T.MAKS_KETERANGAN],
        ["MAKS_ALIAS:usize", T.MAKS_ALIAS],
        ["MAKS_KOLOM_FORMAT:usize", T.MAKS_KOLOM_FORMAT],
        ["MAKS_JUDUL_KOLOM:usize", T.MAKS_JUDUL_KOLOM],
        ["MAKS_TEKS_KOLOM:usize", T.MAKS_TEKS_KOLOM],
        ["MAKS_PANJANG_BERITA:i64", T.MAKS_PANJANG_BERITA],
      ] as const) {
        expect(isi).toContain(`pubconst${nama}=${nilai};`);
      }
    }
    for (const isi of rustDi("hr_reimburse.rs")) {
      expect(isi).toContain(harfiah(R.SEED_JENIS_REIMBURSE_SQL));
    }
  });

  test("bank bawaan sah, berid kode BI, dan tidak saling bentrok", () => {
    const daftar = T.BANK_BAWAAN.map((b) => ({
      id_bank: b.id_bank,
      nama: b.nama,
      kode: b.kode ?? "",
      alias: JSON.stringify(b.alias),
      is_aktif: 1,
    }));
    for (const b of T.BANK_BAWAAN) {
      const sah = T.validasiBank(
        { nama: b.nama, kode: b.kode, alias: b.alias },
        null,
      );
      if (!sah.ok) throw new Error(`${b.nama}: ${sah.galat}`);
      expect(T.bankBentrok(b.id_bank, sah.nilai, daftar), b.nama).toBeNull();
      expect(b.id_bank).toBe(`bnk-${b.kode}`);
    }
  });
});

describe("transfer: izin unduh", () => {
  test("butuh payroll.run.disburse DAN hr.finance.view", () => {
    const subjek = (permissions: T.IzinUnduh[]) => ({
      isSuperadmin: false,
      permissions,
    });
    expect(T.bolehUnduh(subjek(["payroll.run.disburse"]))).toBe(false);
    expect(T.bolehUnduh(subjek(["hr.finance.view"]))).toBe(false);
    expect(
      T.bolehUnduh(subjek(["payroll.run.disburse", "hr.finance.view"])),
    ).toBe(true);
    expect(T.bolehUnduh({ isSuperadmin: true, permissions: [] })).toBe(true);
    expect(T.bolehUnduh(null)).toBe(false);
  });
});

describe("transfer: vektor kembar", () => {
  test("validasi bank, rekening, format, pilihan", () => {
    for (const k of vektor.bank)
      cocok(T.validasiBank(k.draft, k.nama_lama ?? null), k);
    for (const k of vektor.rekening) cocok(T.validasiRekening(k.draft), k);
    for (const k of vektor.format) cocok(T.validasiFormat(k.draft), k);
    for (const k of vektor.pilihan)
      cocok(T.validasiPilihanTransfer(k.draft), k);
  });

  test("cocok bank, jenis transfer, bank bentrok", () => {
    const daftar = vektor.daftar_bank as T.BankBaris[];
    for (const k of vektor.cocok_bank) {
      expect(T.cocokBank(k.teks, daftar)?.id_bank ?? null, k.nama).toBe(
        k.hasil,
      );
    }
    for (const k of vektor.jenis_transfer) {
      expect(T.jenisTransfer(k.bank_pegawai, k.bank_debet), k.nama).toBe(
        k.hasil as T.JenisTransfer,
      );
    }
    for (const k of vektor.bank_bentrok) {
      const sah = T.validasiBank(k.draft, null);
      if (!sah.ok) throw new Error(k.nama);
      expect(T.bankBentrok(k.id, sah.nilai, daftar), k.nama).toBe(k.hasil);
    }
  });

  test("susun baris: tanda, cakupan, total = Σ baris masuk", () => {
    for (const k of vektor.susun) {
      const hasil = T.susunTransfer(
        k.masukan as Parameters<typeof T.susunTransfer>[0],
      );
      expect(hasil as unknown, k.nama).toEqual(k.hasil);
      expect(hasil.ringkasan.total).toBe(
        hasil.baris.reduce((s, r) => s + r.nominal, 0),
      );
      expect(hasil.ringkasan.selisih).toBe(
        hasil.ringkasan.total_manual + hasil.ringkasan.total_luar_cakupan,
      );
    }
    const tanda = new Set(
      vektor.susun.flatMap((k) =>
        [...k.hasil.baris, ...k.hasil.manual].flatMap((r) => r.tanda),
      ),
    );
    expect([...tanda].sort()).toEqual(
      [...T.TANDA_MANUAL, ...T.TANDA_PERINGATAN].sort(),
    );
  });

  test("render CSV/TXT: kutip, desimal, berita dipangkas", () => {
    for (const k of vektor.render) {
      const susunan = vektor.susun[k.susun].hasil as T.SusunanTransfer;
      expect(T.renderTeks(susunan, k.format as T.FormatRender), k.nama).toBe(
        k.hasil,
      );
    }
  });
});
