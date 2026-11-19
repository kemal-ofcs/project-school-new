import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as P from "./hr-pelatihan";
import vektor from "./hr-pelatihan.vektor.json";
import { PEGAWAI_SQL } from "./hris";

// Vektor yang sama dengan `mod tests` di `desktop/hr_pelatihan.rs`.

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

describe("hr-pelatihan: SQL dan pesan kembar", () => {
  test("disalin harfiah ke hr_pelatihan.rs (Desktop dan Mobile)", () => {
    const teks = [
      P.PELATIHAN_SQL,
      P.SIMPAN_PELATIHAN_SQL,
      P.UBAH_PELATIHAN_SQL,
      P.BATAL_PELATIHAN_SQL,
      P.PESERTA_SQL,
      P.BERKAS_SERTIFIKAT_SQL,
      P.TAMBAH_PESERTA_SQL,
      P.HASIL_PESERTA_SQL,
      P.LEPAS_PESERTA_SQL,
      P.JENIS_AKTIF_SQL,
      P.TAUT_SERTIFIKAT_SQL,
      P.BUANG_SERTIFIKAT_LEPAS_SQL,
      P.AMBIL_BERKAS_SERTIFIKAT_SQL,
      P.HAPUS_BERKAS_SERTIFIKAT_SQL,
      P.REKAP_PELATIHAN_SQL,
      P.JENIS_SERTIFIKAT_BAWAAN,
      P.PESAN_PELATIHAN_TIDAK_ADA,
      P.PESAN_PELATIHAN_DIBATALKAN,
      P.PESAN_PESERTA_TIDAK_ADA,
      P.PESAN_PESERTA_GANDA,
      P.PESAN_PESERTA_DITOLAK,
      P.PESAN_LEPAS_BERSERTIFIKAT,
      P.PESAN_BELUM_BERSERTIFIKAT,
      P.PESAN_JENIS_NONAKTIF,
      P.PESAN_SERTIFIKAT_DITOLAK,
    ];
    let diperiksa = 0;
    for (const dir of ["desktop", "mobile"]) {
      const lokasi = [
        join(import.meta.dir, `../../../src-tauri/src/${dir}/hr_pelatihan.rs`),
        join(
          import.meta.dir,
          `../../../../mobile/src-tauri/src/${dir}/hr_pelatihan.rs`,
        ),
      ].find(existsSync);
      if (!lokasi) continue;
      diperiksa++;
      const rust = readFileSync(lokasi, "utf8").replace(/\s+/g, "");
      for (const t of teks) {
        expect(rust).toContain(JSON.stringify(t).replace(/\s+/g, ""));
      }
      for (const [nama, daftar] of [
        ["JENIS_PENYELENGGARA", P.JENIS_PENYELENGGARA],
        ["HASIL_PESERTA", P.HASIL_PESERTA],
      ] as const) {
        expect(rust).toContain(
          `${nama}:[&str;${daftar.length}]=${JSON.stringify(daftar).replace(/\s+/g, "")};`,
        );
      }
    }
    expect(diperiksa).toBeGreaterThan(0);
  });

  test("peserta hanya pegawai: predikat PEGAWAI_SQL disalin harfiah", () => {
    expect(P.TAMBAH_PESERTA_SQL).toContain(PEGAWAI_SQL);
    expect(P.TAMBAH_PESERTA_SQL).toContain("COALESCE(m.id_keluar, '') = ''");
    expect(P.LEPAS_PESERTA_SQL).toContain("id_dokumen IS NULL");
  });
});

describe("hr-pelatihan: vektor", () => {
  test("pelatihan, status, hasil peserta, rekap", () => {
    for (const k of vektor.pelatihan) cocok(P.validasiPelatihan(k.draft), k);
    for (const k of vektor.status) {
      expect(
        P.statusPelatihan(
          k.tanggal_mulai,
          k.tanggal_selesai,
          k.dibatalkan,
          k.hari_ini,
        ),
        k.nama,
      ).toBe(k.hasil as P.StatusPelatihan);
    }
    for (const k of vektor.hasil_peserta)
      cocok(P.validasiHasilPeserta(k.draft), k);
    for (const k of vektor.rekap) {
      expect(P.rekapPelatihan(k.baris, k.hari_ini), k.nama).toEqual(k.hasil);
    }
  });
});
