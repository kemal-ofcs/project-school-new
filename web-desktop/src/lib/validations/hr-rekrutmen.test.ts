import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as R from "./hr-rekrutmen";
import vektor from "./hr-rekrutmen.vektor.json";

// Vektor yang sama dengan `mod tests` di `desktop/hr_rekrutmen.rs`.

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

describe("hr-rekrutmen: SQL dan pesan kembar", () => {
  test("disalin harfiah ke hr_rekrutmen.rs (Desktop dan Mobile)", () => {
    const teks = [
      R.TUTUP_EFEKTIF_SQL,
      R.STATUS_PELAMAR_SQL,
      R.LOWONGAN_SQL,
      R.LOWONGAN_SATU_SQL,
      R.HITUNG_PELAMAR_SQL,
      R.PELAMAR_LOWONGAN_RINGKAS_SQL,
      R.REFERENSI_LOWONGAN_SQL,
      R.SIMPAN_LOWONGAN_SQL,
      R.UBAH_LOWONGAN_SQL,
      R.TUTUP_LOWONGAN_SQL,
      R.BUKA_LOWONGAN_SQL,
      R.PELAMAR_SQL,
      R.TAHAP_SQL,
      R.SIMPAN_PELAMAR_SQL,
      R.LAMARAN_PERTAMA_SQL,
      R.UBAH_PELAMAR_SQL,
      R.CATAT_TAHAP_SQL,
      R.BATAL_TAHAP_SQL,
      R.BERKAS_PELAMAR_SQL,
      R.AMBIL_BERKAS_PELAMAR_SQL,
      R.TAMBAH_BERKAS_PELAMAR_SQL,
      R.HAPUS_BERKAS_PELAMAR_SQL,
      R.PELAMAR_LAMA_SQL,
      R.HITUNG_PELAMAR_LAMA_SQL,
      ...R.HAPUS_PELAMAR_LAMA_SQL,
      ...R.HAPUS_PELAMAR_SQL,
      R.PESAN_LOWONGAN_TIDAK_ADA,
      R.PESAN_LOWONGAN_BERUBAH,
      R.PESAN_KELOMPOK_TERKUNCI,
      R.PESAN_LOWONGAN_BELUM_DIBUKA,
      R.PESAN_PELAMAR_TIDAK_ADA,
      R.PESAN_PELAMAR_TERKUNCI,
      R.PESAN_TAHAP_AKHIR,
      R.PESAN_TAHAP_BERUBAH,
      R.PESAN_BERKAS_PELAMAR_PENUH,
      ...R.KELOMPOK_LOWONGAN,
      ...R.TAHAP_PROSES,
      ...R.TAHAP_AKHIR,
    ];
    let diperiksa = 0;
    for (const dir of ["desktop", "mobile"]) {
      const lokasi = [
        join(import.meta.dir, `../../../src-tauri/src/${dir}/hr_rekrutmen.rs`),
        join(
          import.meta.dir,
          `../../../../mobile/src-tauri/src/${dir}/hr_rekrutmen.rs`,
        ),
      ].find(existsSync);
      if (!lokasi) continue;
      diperiksa++;
      const rust = readFileSync(lokasi, "utf8").replace(/\s+/g, "");
      for (const t of teks) {
        expect(rust).toContain(JSON.stringify(t).replace(/\s+/g, ""));
      }
      expect(rust).toContain(
        `RETENSI_PELAMAR_BULAN:i64=${R.RETENSI_PELAMAR_BULAN};`,
      );
      expect(rust).toContain(
        `MAKS_BERKAS_PELAMAR:usize=${R.MAKS_BERKAS_PELAMAR};`,
      );
    }
    expect(diperiksa).toBeGreaterThan(0);
  });

  test("predikat bersama disalin harfiah ke SQL pemakainya", () => {
    for (const sql of [R.LOWONGAN_SQL, R.PELAMAR_LAMA_SQL]) {
      expect(sql).toContain(R.TUTUP_EFEKTIF_SQL);
    }
    expect(R.PELAMAR_LAMA_SQL).toContain(
      `'+${R.RETENSI_PELAMAR_BULAN} months'`,
    );
    for (const sql of [
      R.HITUNG_PELAMAR_LAMA_SQL,
      ...R.HAPUS_PELAMAR_LAMA_SQL,
    ]) {
      expect(sql).toContain(R.PELAMAR_LAMA_SQL);
    }
    for (const sql of [R.HITUNG_PELAMAR_SQL, R.PELAMAR_SQL]) {
      expect(sql).toContain(R.STATUS_PELAMAR_SQL);
    }
    // Pelamar dihapus paling akhir; personil tidak pernah tersentuh.
    expect(R.HAPUS_PELAMAR_LAMA_SQL[3]).toStartWith("DELETE FROM hr_pelamar ");
    expect(R.HAPUS_PELAMAR_SQL[3]).toContain("id_karyawan IS NULL");
    expect(R.TAMBAH_BERKAS_PELAMAR_SQL).toContain(
      `VALUES ${Array.from({ length: R.MAKS_BERKAS_PELAMAR }, (_, i) => `(${i + 1})`).join(", ")})`,
    );
  });
});

describe("hr-rekrutmen: vektor", () => {
  test("lowongan, status, buka lagi", () => {
    for (const k of vektor.lowongan) cocok(R.validasiLowongan(k.draft), k);
    for (const k of vektor.status_lowongan) {
      expect(
        R.statusLowongan(
          k.tanggal_buka,
          k.tanggal_tutup,
          k.ditutup,
          k.hari_ini,
        ),
        k.nama,
      ).toBe(k.hasil as R.StatusLowongan);
    }
    for (const k of vektor.buka_lagi) {
      cocok(R.periksaBukaLagi(k.tanggal_tutup, k.tanggal_buka, k.hari_ini), k);
    }
  });

  test("pelamar, tahap, status, batal, id personil", () => {
    for (const k of vektor.pelamar)
      cocok(R.validasiPelamar(k.draft, k.hari_ini), k);
    for (const k of vektor.tahap) {
      cocok(
        R.periksaTahap(
          k.draft,
          k.kelompok,
          k.status,
          k.tanggal_lamaran,
          k.hari_ini,
        ),
        k,
      );
    }
    for (const k of vektor.status_pelamar)
      expect(R.statusPelamar(k.tahap), k.nama).toBe(k.hasil);
    for (const k of vektor.batal_tahap)
      cocok(R.periksaBatalTahap(k.tahap, k.id_tahap, k.dijadikan), k);
    for (const k of vektor.id_personil)
      cocok(R.idDariPelamar(k.id_pelamar, k.kelompok), k);
    expect(R.idPelamarBaru()).toMatch(/^plm-[0-9a-f]{32}$/);
  });
});
