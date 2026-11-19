import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as L from "./lapor-pajak";
import vektor from "./lapor-pajak.vektor.json";
import * as P from "./pajak";

// Vektor yang sama dengan `mod tests` di `desktop/lapor_pajak.rs`.

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
const slip = vektor.slip as L.SlipLapor[];

describe("lapor-pajak: SQL, pesan, tanda kembar", () => {
  test("disalin harfiah ke lapor_pajak.rs (Desktop dan Mobile)", () => {
    const teks = [
      L.SLIP_LAPOR_SQL,
      L.PEMOTONG_SQL,
      L.SIMPAN_PEMOTONG_SQL,
      L.PESAN_MASA,
      L.PESAN_TAHUN,
      L.PESAN_NITKU_NPWP,
      L.IZIN_PEMOTONG,
      L.STATUS_RUN_LAPOR,
      L.STATUS_RUN_DITOLAK,
      P.STATUS_TIDAK_TETAP,
      P.METODE_PASAL_17_TERAKHIR,
      ...L.IZIN_LAPOR,
      ...L.KUNCI_PEMOTONG,
    ];
    const rust = rustDi("lapor_pajak.rs");
    expect(rust.length).toBeGreaterThan(0);
    for (const isi of rust) {
      for (const t of teks) expect(isi).toContain(harfiah(t));
      for (const [nama, daftar] of [
        ["TANDA_PPH", L.TANDA_PPH],
        ["TANDA_BPJS", L.TANDA_BPJS],
        ["TANDA_A1", L.TANDA_A1],
      ] as const) {
        expect(isi.replaceAll(",]", "]")).toContain(
          `pubconst${nama}:[&str;${daftar.length}]=[${daftar.map((t) => `"${t}"`).join(",")}];`,
        );
      }
      expect(isi).toContain(
        `pubconstMAKS_NAMA_PENANDATANGAN:usize=${L.MAKS_NAMA_PENANDATANGAN};`,
      );
    }
  });

  test("tanda pajak slip = TANDA_PAJAK, urutan sama", () => {
    expect(L.TANDA_PPH.slice(4)).toEqual([...P.TANDA_PAJAK]);
    for (const t of [...L.TANDA_PPH, ...L.TANDA_BPJS, ...L.TANDA_A1]) {
      expect(L.LABEL_TANDA_LAPOR[t], t).toBeTruthy();
    }
  });

  test("laporan butuh payroll.export DAN hr.finance.view", () => {
    const subjek = (permissions: L.IzinLapor[]) => ({
      isSuperadmin: false,
      permissions,
    });
    expect(L.bolehLapor(subjek(["payroll.export"]))).toBe(false);
    expect(L.bolehLapor(subjek(["hr.finance.view"]))).toBe(false);
    expect(L.bolehLapor(subjek(["payroll.export", "hr.finance.view"]))).toBe(
      true,
    );
    expect(L.bolehLapor(null)).toBe(false);
  });
});

describe("lapor-pajak: vektor kembar", () => {
  test("validasi masa, tahun, data pemotong", () => {
    for (const k of vektor.masa) cocok(L.validasiMasa(k.draft), k);
    for (const k of vektor.tahun) cocok(L.validasiTahun(k.draft), k);
    for (const k of vektor.pemotong) cocok(L.validasiPemotong(k.draft), k);
  });

  test("rekap PPh, BPJS, A1", () => {
    for (const k of vektor.pph) {
      expect(L.rekapPph(slip, k.masa) as unknown, k.nama).toEqual(k.hasil);
    }
    for (const k of vektor.bpjs) {
      expect(L.rekapBpjs(slip, k.masa) as unknown, k.nama).toEqual(k.hasil);
    }
    for (const k of vektor.a1) {
      expect(L.rekapA1(slip, k.tahun) as unknown, k.nama).toEqual(k.hasil);
    }
  });

  test("total = Σ baris; vektor memuat setiap tanda rekap", () => {
    const pph = vektor.pph.map((k) => L.rekapPph(slip, k.masa));
    const bpjs = vektor.bpjs.map((k) => L.rekapBpjs(slip, k.masa));
    const a1 = vektor.a1.map((k) => L.rekapA1(slip, k.tahun));
    for (const r of pph) {
      expect(r.total_pph).toBe(r.baris.reduce((s, b) => s + b.pph, 0));
    }
    for (const r of bpjs) {
      expect(r.total_pekerja + r.total_perusahaan).toBe(
        r.kode.reduce((s, k) => s + k.total, 0),
      );
    }
    const muncul = new Set<string>(
      [...pph, ...bpjs, ...a1].flatMap((r) =>
        r.baris.flatMap((b) => b.tanda as string[]),
      ),
    );
    // `pph_tidak_cocok` dan tanda pajak lain diuji lewat jalurnya sendiri.
    for (const t of [
      "tanpa_nik",
      "tanpa_npwp",
      "pph_negatif",
      "slip_lama",
      "dipotong_tanpa_nomor",
      "bernomor_tanpa_potongan",
      "tarif_tidak_sah",
      "belum_masa_terakhir",
    ]) {
      expect(muncul.has(t), t).toBe(true);
    }
  });

  test("PPh setahun ≠ dipotong ditandai pph_tidak_cocok", () => {
    const tanpaSatu = slip.filter(
      (s) => !(s.id_karyawan === "p1" && s.run_id === "run-b"),
    );
    const p1 = L.rekapA1(tanpaSatu, "2026").baris.find(
      (b) => b.id_karyawan === "p1",
    );
    expect(p1?.pph_dipotong).toBe(225_000);
    expect(p1?.tanda).toEqual(["pph_tidak_cocok"]);
  });
});
