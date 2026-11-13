import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as H from "./hris";
import vektor from "./hris.vektor.json";

// Vektor yang sama diuji di `desktop/hris.rs` (modul `tests`).

const peta = (isi: object) =>
  new Map(Object.entries(isi as Record<string, string>));

describe("hris: aturan kembar", () => {
  test("nama: normalisasi, kunci, validasi", () => {
    for (const k of vektor.nama) {
      expect(H.normalisasiNama(k.masuk)).toBe(k.normal);
      expect(H.kunciNama(k.masuk)).toBe(k.kunci);
      const hasil = H.validasiNamaMaster(k.masuk, "bagian");
      expect(hasil.ok ? null : hasil.galat).toBe(k.galat);
      if (hasil.ok) expect(hasil.nama).toBe(k.normal);
    }
  });

  test("id nama bagian", () => {
    for (const k of vektor.id_nama) {
      expect(H.idNamaBagian(k.id_bagian, k.nama)).toBe(k.hasil);
    }
  });

  test("atasan dan siklus", () => {
    for (const k of vektor.atasan) {
      expect(H.periksaAtasan(k.id, k.atasan_baru, peta(k.peta))).toBe(k.galat);
    }
    for (const k of vektor.siklus) {
      expect(H.dalamSiklusAtasan(peta(k.peta))).toEqual(k.hasil);
    }
  });

  test("susun organisasi", () => {
    for (const k of vektor.susun) {
      expect(H.susunOrg(k.pegawai, k.bagian, k.nama_lama, k.jabatan)).toEqual(
        k.hasil,
      );
    }
  });

  test("SQL disalin harfiah ke hris.rs (Desktop dan Mobile)", () => {
    const sql: string[] = [
      H.PEGAWAI_SQL,
      ...H.MIGRASI_ORGANISASI_SQL,
      H.SIMPAN_BAGIAN_SQL,
      H.CATAT_NAMA_BAGIAN_SQL,
      H.SIMPAN_JABATAN_SQL,
      ...H.TULIS_ULANG_BAGIAN_SQL,
      H.TULIS_ULANG_JABATAN_SQL,
      ...H.GABUNG_BAGIAN_SQL,
      H.PETA_BAGIAN_SQL,
      H.PETA_JABATAN_SQL,
      H.BENTROK_BAGIAN_SQL,
      H.BENTROK_JABATAN_SQL,
      H.ORG_PEGAWAI_SQL,
      H.ORG_BAGIAN_SQL,
      H.ORG_BAGIAN_NAMA_SQL,
      H.ORG_JABATAN_SQL,
    ];
    let diperiksa = 0;
    for (const dir of ["desktop", "mobile"]) {
      const lokasi = [
        join(import.meta.dir, `../../../src-tauri/src/${dir}/hris.rs`),
        join(
          import.meta.dir,
          `../../../../mobile/src-tauri/src/${dir}/hris.rs`,
        ),
      ].find(existsSync);
      if (!lokasi) continue;
      diperiksa++;
      const rust = readFileSync(lokasi, "utf8").replace(/\s+/g, "");
      for (const teks of sql) {
        expect(rust).toContain(JSON.stringify(teks).replace(/\s+/g, ""));
      }
      expect(rust).toContain(`NAMA_MAKS:usize=${H.NAMA_MAKS};`);
    }
    expect(diperiksa).toBeGreaterThan(0);
  });
});
