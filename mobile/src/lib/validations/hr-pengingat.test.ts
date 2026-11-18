import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as H from "./hr-pengajuan";
import * as P from "./hr-pengingat";
import vektor from "./hr-pengingat.vektor.json";
import * as R from "./hris";

// Vektor yang sama diuji di `desktop/hr_pengingat.rs` (modul `tests`).

const sebelum = (teks: string, awal: string, akhir: string) => {
  const mulai = teks.indexOf(awal);
  return teks.slice(mulai, teks.indexOf(akhir, mulai) + akhir.length);
};

describe("hr-pengingat: aturan kembar", () => {
  test("tambah tahun, sisa hari, jendela, KGB, pensiun", () => {
    for (const [t, n, hasil] of vektor.tambah_tahun)
      expect(P.tambahTahun(t as string, n as number)).toBe(
        hasil as string | null,
      );
    for (const [t, hariIni, hasil] of vektor.sisa_hari)
      expect(P.sisaHari(t as string, hariIni as string)).toBe(
        hasil as number | null,
      );
    for (const [sisa, batas, hasil] of vektor.jendela)
      expect(P.jendela(sisa as number, batas as number[])).toBe(
        hasil as number | null,
      );
    for (const [tmt, n, hariIni, hasil] of vektor.tanggal_kgb)
      expect(P.tanggalKgb(tmt as string, n as number, hariIni as string)).toBe(
        hasil as string | null,
      );
    for (const [lahir, usia, hasil] of vektor.tanggal_pensiun)
      expect(P.tanggalPensiun(lahir as string, usia as number)).toBe(
        hasil as string | null,
      );
  });

  test("pengingat dan saring", () => {
    for (const k of vektor.pengingat)
      expect(
        P.pengingat(k.data as P.DataPengingat, k.hari_ini, k.aturan),
      ).toEqual(k.hasil as P.ItemPengingat[]);
    const items = vektor.saring_items as P.ItemPengingat[];
    for (const k of vektor.saring)
      expect(P.saringPengingat(k.sesi, items).map((i) => i.kunci)).toEqual(
        k.kunci,
      );
  });

  test("SQL menyalin harfiah predikat sumbernya", () => {
    expect(P.PENGINGAT_PEGAWAI_SQL).toContain(R.PEGAWAI_SQL);
    expect(P.PENGINGAT_PEGAWAI_SQL).toContain(
      sebelum(R.STATUS_KINI_SQL, "COALESCE((SELECT k.status", "LIMIT 1)"),
    );
    expect(P.PENGINGAT_KONTRAK_SQL).toContain(
      sebelum(
        R.CERMIN_STATUS_SQL,
        "k.status <> 'Pembatalan' AND NOT EXISTS",
        "LIMIT 1",
      ),
    );
    const predikat = sebelum(
      H.PENGAJUAN_AKTIF_ORANG_SQL,
      "NOT EXISTS (SELECT 1 FROM hr_pengajuan_keputusan b",
      "LIMIT 1), '')",
    );
    expect(P.PENGINGAT_PENGAJUAN_SQL).toContain(`${predikat} = ''`);
  });

  test("SQL disalin harfiah ke hr_pengingat.rs (Desktop dan Mobile)", () => {
    const sql = [
      P.PENGINGAT_PEGAWAI_SQL,
      P.PENGINGAT_KONTRAK_SQL,
      P.PENGINGAT_DOKUMEN_SQL,
      P.PENGINGAT_SP_SQL,
      P.PENGINGAT_PENGAJUAN_SQL,
      P.PENGINGAT_SEMESTER_SQL,
    ];
    let diperiksa = 0;
    for (const dir of ["desktop", "mobile"]) {
      const lokasi = [
        join(import.meta.dir, `../../../src-tauri/src/${dir}/hr_pengingat.rs`),
        join(
          import.meta.dir,
          `../../../../mobile/src-tauri/src/${dir}/hr_pengingat.rs`,
        ),
      ].find(existsSync);
      if (!lokasi) continue;
      diperiksa++;
      const rust = readFileSync(lokasi, "utf8").replace(/\s+/g, "");
      for (const teks of sql)
        expect(rust).toContain(JSON.stringify(teks).replace(/\s+/g, ""));
      // Larik Rust bertanda koma akhir bila ditulis bertingkat.
      const larik = rust.replace(/,\]/g, "]");
      for (const [nama, daftar] of [
        ["KEJADIAN_PENGINGAT", P.KEJADIAN_PENGINGAT],
        ["IZIN_PENGINGAT", P.IZIN_PENGINGAT],
        ["STATUS_KONTRAK_BERAKHIR", P.STATUS_KONTRAK_BERAKHIR],
        ["STATUS_KGB", P.STATUS_KGB],
      ] as const)
        expect(larik).toContain(
          `${nama}:[&str;${daftar.length}]=${JSON.stringify(daftar)};`,
        );
      expect(rust).toContain(`KONTRAK_LEWAT_HARI:i64=${P.KONTRAK_LEWAT_HARI};`);
      expect(rust).toContain(`SK_LEWAT_HARI:i64=${P.SK_LEWAT_HARI};`);
    }
    expect(diperiksa).toBeGreaterThan(0);
  });
});
