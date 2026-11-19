import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as R from "./hr-reimburse";
import vektor from "./hr-reimburse.vektor.json";
import { PEGAWAI_SQL } from "./hris";

// Vektor yang sama dengan `mod tests` di `desktop/hr_reimburse.rs`.

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

describe("hr-reimburse: SQL dan pesan kembar", () => {
  test("disalin harfiah ke hr_reimburse.rs (Desktop dan Mobile)", () => {
    const teks = [
      R.SEED_JENIS_REIMBURSE_SQL,
      R.BAYAR_AKTIF_SQL,
      R.JENIS_REIMBURSE_SQL,
      R.SIMPAN_JENIS_REIMBURSE_SQL,
      R.BENTROK_JENIS_REIMBURSE_SQL,
      R.KLAIM_SQL,
      R.SIMPAN_KLAIM_SQL,
      R.KEPUTUSAN_SQL,
      R.PUTUS_KLAIM_SQL,
      R.NOTA_SQL,
      R.AMBIL_NOTA_SQL,
      R.PEMILIK_NOTA_SQL,
      R.TAMBAH_NOTA_SQL,
      R.HAPUS_NOTA_SQL,
      R.PEMBAYARAN_SQL,
      R.BAYAR_SQL,
      R.BAYAR_BARIS_SQL,
      R.BATAL_BAYAR_SQL,
      R.PESAN_KLAIM_TIDAK_ADA,
      R.PESAN_KLAIM_DITOLAK_SIMPAN,
      R.PESAN_KLAIM_TERKUNCI,
      R.PESAN_KLAIM_SELESAI,
      R.PESAN_BATAL_TERBAYAR,
      R.PESAN_DIRI_SENDIRI_REIMBURSE,
      R.PESAN_DI_LUAR_CAKUPAN_REIMBURSE,
      R.PESAN_BUTUH_PEMUTUS,
      R.PESAN_KLAIM_BERUBAH,
      R.PESAN_NOTA_TERKUNCI,
      R.PESAN_NOTA_PENUH,
      R.PESAN_NOTA_DITOLAK,
      R.PESAN_JENIS_GANDA,
      R.PESAN_BAYAR_KOSONG,
      R.PESAN_BAYAR_TIDAK_SAH,
      R.PESAN_BAYAR_TIDAK_ADA,
      R.PESAN_BAYAR_SUDAH_BATAL,
    ];
    let diperiksa = 0;
    for (const dir of ["desktop", "mobile"]) {
      const lokasi = [
        join(import.meta.dir, `../../../src-tauri/src/${dir}/hr_reimburse.rs`),
        join(
          import.meta.dir,
          `../../../../mobile/src-tauri/src/${dir}/hr_reimburse.rs`,
        ),
      ].find(existsSync);
      if (!lokasi) continue;
      diperiksa++;
      const rust = readFileSync(lokasi, "utf8").replace(/\s+/g, "");
      for (const t of teks) {
        expect(rust).toContain(JSON.stringify(t).replace(/\s+/g, ""));
      }
      for (const [nama, daftar] of [
        ["AKSI_KEPUTUSAN", R.AKSI_KEPUTUSAN],
        ["IZIN_LIHAT_REIMBURSE", R.IZIN_LIHAT_REIMBURSE],
      ] as const) {
        expect(rust).toContain(
          `${nama}:[&str;${daftar.length}]=${JSON.stringify(daftar).replace(/\s+/g, "")};`,
        );
      }
      for (const [nama, nilai] of [
        ["MAKS_NAMA_JENIS_REIMBURSE", R.MAKS_NAMA_JENIS_REIMBURSE],
        ["MAKS_KEPERLUAN", R.MAKS_KEPERLUAN],
        ["MAKS_ALASAN_REIMBURSE", R.MAKS_ALASAN_REIMBURSE],
        ["MAKS_KETERANGAN_BAYAR", R.MAKS_KETERANGAN_BAYAR],
        ["MAKS_KLAIM_BAYAR", R.MAKS_KLAIM_BAYAR],
      ] as const) {
        expect(rust).toContain(`${nama}:usize=${nilai};`);
      }
    }
    expect(diperiksa).toBeGreaterThan(0);
  });

  test("predikat pegawai dan pembayaran aktif disalin harfiah", () => {
    expect(R.SIMPAN_KLAIM_SQL).toContain(PEGAWAI_SQL);
    for (const sql of [R.KLAIM_SQL, R.PUTUS_KLAIM_SQL, R.BAYAR_SQL]) {
      expect(sql).toContain(R.BAYAR_AKTIF_SQL);
    }
  });
});

describe("hr-reimburse: vektor", () => {
  test("jenis", () => {
    for (const k of vektor.jenis) cocok(R.validasiJenis(k.draft), k);
  });

  test("klaim", () => {
    for (const k of vektor.klaim)
      cocok(R.validasiKlaim(k.draft as Record<string, unknown>, k.hari_ini), k);
  });

  test("status klaim dan status bayar", () => {
    for (const k of vektor.status)
      expect(R.statusKlaim(k.aksi), k.nama).toBe(k.hasil as R.StatusKlaim);
    for (const k of vektor.status_bayar)
      expect(R.statusBayar(k.jumlah), k.nama).toBe(k.hasil as R.StatusBayar);
  });

  test("keputusan", () => {
    for (const k of vektor.keputusan)
      cocok(
        R.periksaKeputusan(k.draft as Record<string, unknown>, k.keadaan),
        k,
      );
  });

  test("tanda", () => {
    for (const k of vektor.tanda)
      expect(R.tandaKlaim(k.klaim), k.nama).toEqual(
        k.hasil as R.TandaKlaim[][],
      );
  });

  test("validasi bayar dan periksa bayar", () => {
    for (const k of vektor.validasi_bayar)
      cocok(R.validasiBayar(k.draft as Record<string, unknown>, k.hari_ini), k);
    for (const k of vektor.bayar)
      cocok(R.periksaBayar(k.id_karyawan, k.id_klaim, k.klaim), k);
  });

  test("batal bayar", () => {
    for (const k of vektor.batal_bayar) {
      const hasil = R.periksaBatalBayar(
        k.jenis,
        k.sudah_dibatalkan,
        k.alasan ?? null,
      );
      expect(hasil.ok ? undefined : hasil.galat, k.nama).toBe(k.galat);
    }
  });
});
