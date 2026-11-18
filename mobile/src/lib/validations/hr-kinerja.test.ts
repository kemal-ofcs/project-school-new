import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as K from "./hr-kinerja";
import vektor from "./hr-kinerja.vektor.json";

// Vektor yang sama dengan `mod tests` di `desktop/hr_kinerja.rs`.

type Kasus = { nama: string; galat?: string; hasil?: unknown };

function cocok<T>(
  hasil: { ok: true; nilai: T } | { ok: false; galat: string },
  k: Kasus,
) {
  if (k.galat !== undefined) {
    expect(hasil.ok ? null : hasil.galat, k.nama).toBe(k.galat);
  } else {
    if (!hasil.ok) throw new Error(`${k.nama}: ${hasil.galat}`);
    expect(hasil.nilai as unknown, k.nama).toEqual(k.hasil);
  }
}

describe("hr-kinerja: SQL dan pesan kembar", () => {
  test("disalin harfiah ke hr_kinerja.rs (Desktop dan Mobile)", () => {
    const teks = [
      K.TEMPLATE_KINERJA_SQL,
      K.ASPEK_KINERJA_SQL,
      K.TEMPLATE_SATU_SQL,
      K.ASPEK_TEMPLATE_SQL,
      K.BENTROK_TEMPLATE_SQL,
      K.SIMPAN_TEMPLATE_SQL,
      K.LEPAS_BAWAAN_SQL,
      K.SIMPAN_ASPEK_SQL,
      K.SEED_TEMPLATE_SQL,
      K.SEED_ASPEK_SQL,
      K.SEED_TUGAS_KA_TU_SQL,
      K.PENGATURAN_KINERJA_SQL,
      K.PESAN_AMBANG,
      K.PESAN_PREDIKAT,
      K.PESAN_NAMA_PREDIKAT,
      K.PREDIKAT_BAWAAN,
      K.KUNCI_AMBANG,
      K.KUNCI_PREDIKAT,
      K.KUNCI_TANPA_KBM,
      ...K.TIPE_ASPEK,
    ];
    let diperiksa = 0;
    for (const dir of ["desktop", "mobile"]) {
      const lokasi = [
        join(import.meta.dir, `../../../src-tauri/src/${dir}/hr_kinerja.rs`),
        join(
          import.meta.dir,
          `../../../../mobile/src-tauri/src/${dir}/hr_kinerja.rs`,
        ),
      ].find(existsSync);
      if (!lokasi) continue;
      diperiksa++;
      const rust = readFileSync(lokasi, "utf8").replace(/\s+/g, "");
      for (const t of teks) {
        expect(rust).toContain(JSON.stringify(t).replace(/\s+/g, ""));
      }
      expect(rust).toContain(
        `AMBANG_BAWAAN:[i64;4]=[${K.AMBANG_BAWAAN.join(",")}];`,
      );
    }
    expect(diperiksa).toBeGreaterThan(0);
  });

  test("kunci pengaturan sama dengan yang dibaca PENGATURAN_KINERJA_SQL", () => {
    for (const kunci of [K.KUNCI_AMBANG, K.KUNCI_PREDIKAT, K.KUNCI_TANPA_KBM]) {
      expect(K.PENGATURAN_KINERJA_SQL).toContain(`'${kunci}'`);
    }
  });
});

describe("hr-kinerja: vektor", () => {
  test("template", () => {
    for (const k of vektor.template) {
      cocok(K.validasiTemplate(k.draft as K.TemplateDraft), k as Kasus);
    }
    for (const k of vektor.template_lama) {
      const baru = K.validasiTemplate(k.draft as K.TemplateDraft);
      if (!baru.ok) throw new Error(`${k.nama}: ${baru.galat}`);
      cocok(
        K.periksaTemplateLama(baru.nilai, k.kelompok_lama, k.aspek_lama),
        k as Kasus,
      );
    }
  });

  test("pengaturan", () => {
    for (const k of vektor.ambang) cocok(K.validasiAmbang(k.masukan), k);
    for (const k of vektor.predikat) cocok(K.validasiPredikat(k.masukan), k);
    for (const k of vektor.tanpa_kbm) cocok(K.validasiTanpaKbm(k.masukan), k);
    for (const k of vektor.pengaturan) {
      cocok(K.validasiPengaturanKinerja(k.draft), k as Kasus);
    }
    for (const k of vektor.berlaku) {
      expect(
        K.pengaturanKinerja(k.peta as Record<string, string>),
        k.nama,
      ).toEqual(k.hasil as K.PengaturanKinerja);
    }
  });

  test("skor dan predikat", () => {
    for (const k of vektor.skor_ambang) {
      expect(K.skorAmbang(k.permil, k.ambang), `${k.permil}`).toBe(k.skor);
    }
    for (const k of vektor.pilih_predikat) {
      const daftar = K.parsePredikat(k.predikat);
      expect(K.predikatNilai(k.nilai, daftar), `${k.nilai}`).toBe(k.hasil);
    }
  });

  test("template bawaan sah dan seed lengkap", () => {
    for (const t of K.TEMPLATE_BAWAAN) {
      const hasil = K.validasiTemplate({
        nama: t.nama,
        kelompok: t.kelompok,
        keterangan: t.keterangan,
        is_bawaan: true,
        is_aktif: true,
        aspek: t.aspek.map((a) => ({
          ...a,
          id_aspek: undefined,
          is_aktif: true,
        })),
      });
      expect(hasil.ok, t.id_template).toBe(true);
      for (const a of t.aspek) {
        expect(a.id_aspek.startsWith(`${t.id_template}:`)).toBe(true);
      }
    }
    // Dua template, 14 aspek, satu jenis tugas; sama dengan `seed_statements`.
    expect(K.seedKinerja()).toHaveLength(2 + 14 + 1);
  });
});
