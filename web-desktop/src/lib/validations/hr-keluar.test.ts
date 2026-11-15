import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as K from "./hr-keluar";
import vektor from "./hr-keluar.vektor.json";
import {
  PENANGANAN_SQL,
  PENGAJUAN_AKTIF_ORANG_SQL,
  UNIT_PERSONIL_SQL,
} from "./hr-pengajuan";
import { STATUS_KINI_SQL } from "./hris";

// Vektor yang sama dengan `mod tests` di `desktop/hr_keluar.rs`.

describe("hr-keluar: SQL kembar", () => {
  test("SQL disalin harfiah ke hr_keluar.rs (Desktop dan Mobile)", () => {
    const sql = [
      K.SEED_ALASAN_SQL,
      K.SP_PEGAWAI_SQL,
      K.SP_SATU_SQL,
      K.PEGAWAI_SP_SQL,
      K.MASA_SP_SQL,
      K.NOMOR_KEMBAR_SQL,
      K.SIMPAN_SP_SQL,
      K.UBAH_SP_SQL,
      K.CABUT_SP_SQL,
      K.PESAN_DIRI_SENDIRI,
      K.PESAN_DI_LUAR_CAKUPAN,
      K.PESAN_BUTUH_SP3,
      K.PESAN_SP_DICABUT,
      // Fase 4b
      K.PESAN_SUDAH_KELUAR,
      K.PESAN_HAPUS_GURU_KELUAR,
      K.PESAN_SESI_KELUAR,
      K.PESAN_SUPERADMIN_TERAKHIR,
      K.PESAN_BLOKIR_JADWAL,
      K.PESAN_BLOKIR_WALI,
      K.PESAN_KELUAR_BERLAKU,
      K.PESAN_KELUAR_DIBATALKAN,
      K.PESAN_BELUM_JATUH_TEMPO,
      K.PESAN_KELUAR_TERBUKA,
      K.STATUS_AKTIF_KELUAR_SQL,
      K.TANGGAL_SELESAI_KELUAR_SQL,
      K.KELUAR_DI_PERIODE_SQL,
      K.KELUAR_LOKAL_SQL,
      K.JADWAL_AKTIF_KELUAR_SQL,
      K.WALI_KELUAR_SQL,
      K.TUGAS_KELUAR_SQL,
      K.PINJAMAN_PERSONIL_SQL,
      K.KASBON_KELUAR_SQL,
      K.RAPEL_KELUAR_SQL,
      K.PENGAJUAN_SESUDAH_SQL,
      K.JP_PENGGANTI_SESUDAH_SQL,
      K.RUN_MASA_TERAKHIR_SQL,
      K.ALFA_SESUDAH_SQL,
      K.AKUN_TERTAUT_SQL,
      K.SUPERADMIN_AKTIF_SQL,
      K.PEGAWAI_KELUAR_SQL,
      K.ALASAN_KELUAR_SQL,
      K.ALASAN_SATU_SQL,
      K.DAFTAR_KELUAR_SQL,
      K.KELUAR_SATU_SQL,
      K.SIMPAN_KELUAR_SQL,
      K.UBAH_KELUAR_SQL,
      ...K.BERLAKUKAN_SQL,
      ...K.BATALKAN_SQL,
      // Fase 4c
      K.UPAH_RATA_SQL,
      K.KONTRAK_KELUAR_SQL,
      K.TUNJANGAN_ACUAN_SQL,
      K.RINCIAN_KELUAR_SQL,
      K.HAPUS_RINCIAN_SQL,
      K.SIMPAN_RINCIAN_SQL,
      K.SIMPAN_ALASAN_SQL,
      K.UBAH_ALASAN_SQL,
      ...K.NOMOR_KELUAR_SQL,
      K.NOMOR_KELUAR_KEMBAR_SQL,
      K.PESAN_SURAT_BELUM_BERLAKU,
      K.PESAN_SK_BUKAN_TETAP,
      K.PESAN_KETERANGAN_NEGERI,
    ];
    let diperiksa = 0;
    for (const dir of ["desktop", "mobile"]) {
      const lokasi = [
        join(import.meta.dir, `../../../src-tauri/src/${dir}/hr_keluar.rs`),
        join(
          import.meta.dir,
          `../../../../mobile/src-tauri/src/${dir}/hr_keluar.rs`,
        ),
      ].find(existsSync);
      if (!lokasi) continue;
      diperiksa++;
      const rust = readFileSync(lokasi, "utf8").replace(/\s+/g, "");
      for (const teks of sql) {
        expect(rust).toContain(JSON.stringify(teks).replace(/\s+/g, ""));
      }
      // Unit akun sesi memakai SQL yang sama dengan cakupan pengajuan.
      expect(rust).toContain("hr_pengajuan::{dalam_cakupan,UNIT_PERSONIL_SQL}");
    }
    expect(diperiksa).toBeGreaterThan(0);
    expect(UNIT_PERSONIL_SQL).toContain("FROM master_data WHERE id_unik = ?1");
  });

  test("predikat checklist salinan harfiah modul asalnya", () => {
    const tanpaSpasi = (t: string) => t.replace(/\s+/g, "");
    // Selalu berkas kanonik web-desktop, juga dari salinan Mobile tes ini.
    const kanonik = join(import.meta.dir, "../../../../web-desktop/src/lib");
    const baca = (relatif: string) =>
      tanpaSpasi(readFileSync(join(kanonik, "validations", relatif), "utf8"));
    const potong = (sql: string, dari: string, sampai: string) => {
      const awal = sql.indexOf(dari);
      const akhir = sql.indexOf(sampai, awal);
      expect(awal).toBeGreaterThanOrEqual(0);
      expect(akhir).toBeGreaterThan(awal);
      return tanpaSpasi(sql.slice(awal, akhir + sampai.length));
    };
    const rust = (berkas: string) =>
      baca(`../../../src-tauri/src/desktop/${berkas}`);
    // Barang belum kembali = `inventory::list_loans`.
    expect(rust("inventory.rs")).toContain(
      potong(
        K.PINJAMAN_PERSONIL_SQL,
        "COALESCE((SELECT SUM(r.jumlah)",
        "), 0) AS kembali",
      ),
    );
    // Sisa efektif kasbon = `pokok − BAYAR_SQL − PENDING_SQL` (loan.rs, loan.ts).
    const bayar = potong(
      K.KASBON_KELUAR_SQL,
      "COALESCE((SELECT SUM(m.jumlah)",
      "'Pelunasan Tunai')), 0)",
    );
    const pending = potong(
      K.KASBON_KELUAR_SQL,
      "COALESCE((SELECT SUM(CAST(json_extract(k.value, '$.jumlah')",
      "= p.id_pinjaman), 0)",
    );
    for (const sumber of [rust("loan.rs"), baca("../services/loan.ts")]) {
      expect(sumber).toContain(bayar);
      expect(sumber).toContain(pending);
    }
    // Rapel Menunggu = `rapel::MENUNGGU_SQL` (dan kembaran TS).
    const menunggu = potong(
      K.RAPEL_KELUAR_SQL,
      "rp.dibatalkan_pada IS NULL",
      "= rp.id_rapel)",
    );
    expect(rust("rapel.rs")).toContain(menunggu);
    expect(baca("../services/payroll-rapel.ts")).toContain(menunggu);
    // Pengajuan "Menunggu atau berlaku" = `PENGAJUAN_AKTIF_ORANG_SQL`.
    const aktif = potong(
      PENGAJUAN_AKTIF_ORANG_SQL,
      "NOT EXISTS (SELECT 1 FROM hr_pengajuan_keputusan b",
      "'') <> 'Tolak'",
    );
    for (const sql of [
      K.PENGAJUAN_SESUDAH_SQL,
      K.JP_PENGGANTI_SESUDAH_SQL,
      PENANGANAN_SQL,
    ]) {
      expect(tanpaSpasi(sql)).toContain(aktif);
    }
    // Gaji terakhir: potongan yang sama di kedua titik rekap.
    expect(rust("payroll/commands.rs")).toContain(
      "keluar_di_periode=crate::desktop::hr_keluar::KELUAR_DI_PERIODE_SQL",
    );
    expect(baca("../services/payroll-recap.ts")).toContain(
      "KELUAR_DI_PERIODE_SQL})",
    );
    // Kontrak berlaku = subkueri `STATUS_KINI_SQL` (kontrak terakhir yang tidak dibatalkan).
    expect(tanpaSpasi(STATUS_KINI_SQL)).toContain(
      potong(K.KONTRAK_KELUAR_SQL, "k.status <> 'Pembatalan'", "LIMIT 1"),
    );
    // Komponen rincian = CHECK `hr_keluar_rincian.komponen` di kedua jalur provisioning.
    const check = `komponenIN(${K.KOMPONEN_RINCIAN.map((k) => `'${k}'`).join(",")})`;
    expect(rust("turso.rs")).toContain(tanpaSpasi(check));
    expect(baca("../db-migrations.ts")).toContain(tanpaSpasi(check));
  });

  test("sembilan alasan bawaan, pengali 0–1000", () => {
    expect(K.ALASAN_BAWAAN).toHaveLength(9);
    for (const a of K.ALASAN_BAWAAN) {
      expect(a.pengali_up).toBeGreaterThanOrEqual(0);
      expect(a.pengali_upmk).toBeLessThanOrEqual(1000);
      expect(K.seedAlasanArgs(a)).toHaveLength(8);
    }
  });
});

describe("hr-keluar: vektor SP", () => {
  test("masa, status, dan masa bawaan", () => {
    for (const k of vektor.akhir_masa) {
      expect(K.akhirMasaSp(k.tanggal, k.masa_bulan)).toBe(k.hasil);
    }
    for (const k of vektor.status) {
      expect(
        K.statusSp(k.tanggal, k.berlaku_sampai, k.dicabut, k.hari_ini),
      ).toBe(k.hasil as K.StatusSp);
    }
    for (const k of vektor.masa_setting) {
      expect(K.masaSpBerlaku(k.nilai)).toBe(k.hasil);
    }
  });

  test("usulan tingkat", () => {
    for (const k of vektor.usulan) {
      expect({ nama: k.nama, ...K.usulanTingkat(k.sp, k.tanggal) }).toEqual({
        nama: k.nama,
        tingkat: k.tingkat as K.TingkatSp,
        sp3_berlaku: k.sp3_berlaku,
      });
    }
  });

  test("status dan validasi keluar", () => {
    for (const k of vektor.status_keluar) {
      expect({
        nama: k.nama,
        hasil: K.statusKeluar(
          k.tanggal_terakhir,
          k.berlaku,
          k.dibatalkan,
          k.hari_ini,
        ),
      }).toEqual({ nama: k.nama, hasil: k.hasil as K.StatusKeluar });
    }
    for (const k of vektor.validasi_keluar) {
      const hasil = K.validasiKeluar(k.draft);
      expect({
        nama: k.nama,
        hasil: hasil.ok ? (hasil.nilai as unknown) : null,
        galat: hasil.ok ? null : hasil.galat,
      }).toEqual({ nama: k.nama, hasil: k.hasil, galat: k.galat });
    }
    expect(K.statusAktifKeluar("?")).toBe(
      "CASE WHEN COALESCE(master_data.id_keluar, '') <> '' THEN 'Nonaktif' ELSE ? END",
    );
  });

  test("pesangon (4c): masa kerja, upah, pembagi, usulan, rincian, alasan, surat", () => {
    for (const k of vektor.bulan_penuh) {
      expect({ k, hasil: K.bulanPenuh(k.mulai, k.akhir) }).toEqual({
        k,
        hasil: k.hasil,
      });
    }
    for (const k of vektor.masa_kerja) {
      expect({ k, hasil: K.masaKerjaBulan(k.mulai, k.terakhir) }).toEqual({
        k,
        hasil: k.hasil,
      });
    }
    for (const k of vektor.kelipatan) {
      expect([K.kelipatanUp(k.tahun), K.kelipatanUpmk(k.tahun)]).toEqual([
        k.up,
        k.upmk,
      ]);
    }
    for (const k of vektor.rata_upah) {
      expect(K.rataUpah(k.total, k.bulan)).toBe(k.hasil);
    }
    for (const k of vektor.pembagi) {
      expect(K.pembagiUph(k.hari_kerja)).toBe(k.hasil);
    }
    for (const k of vektor.kelompok) {
      expect(K.kelompokStatus(k.status)).toBe(k.hasil as K.KelompokStatus);
    }
    for (const k of vektor.pesangon) {
      expect({
        nama: k.nama,
        hasil: K.usulanPesangon(k.masukan as K.MasukanPesangon),
      }).toEqual({ nama: k.nama, hasil: k.hasil as K.Usulan[] });
    }
    for (const k of vektor.susun) {
      const hasil = K.susunRincian(
        k.usulan as K.Usulan[],
        k.isian as K.IsianRincian[],
      );
      expect({
        nama: k.nama,
        hasil: hasil.ok ? hasil.nilai : null,
        galat: hasil.ok ? null : hasil.galat,
      }).toEqual({ nama: k.nama, hasil: k.hasil as never, galat: k.galat });
    }
    for (const k of vektor.upah) {
      const hasil = K.periksaUpah(k.upah_pokok, k.usulan, k.alasan);
      expect(hasil.ok ? null : hasil.galat).toBe(k.galat);
    }
    for (const k of vektor.alasan) {
      const hasil = K.validasiAlasan(k.draft);
      expect({
        nama: k.nama,
        hasil: hasil.ok ? hasil.nilai : null,
        galat: hasil.ok ? null : hasil.galat,
      }).toEqual({ nama: k.nama, hasil: k.hasil as never, galat: k.galat });
    }
    for (const k of vektor.surat_keluar) {
      const hasil = K.periksaSuratKeluar(
        k.jenis,
        k.status_keluar,
        k.status_kepegawaian,
      );
      expect({ k, galat: hasil.ok ? null : hasil.galat }).toEqual({
        k,
        galat: k.galat,
      });
    }
    for (const k of vektor.ringkasan) {
      expect(K.ringkasanPesangon(k.nominal, k.sisa_kasbon)).toEqual(k.hasil);
    }
  });

  test("validasi, tingkat, dan wewenang", () => {
    for (const k of vektor.validasi) {
      const hasil = K.validasiSp(k.draft, k.hari_ini);
      expect({
        nama: k.nama,
        hasil: hasil.ok ? (hasil.nilai as unknown) : null,
        galat: hasil.ok ? null : hasil.galat,
      }).toEqual({ nama: k.nama, hasil: k.hasil, galat: k.galat });
    }
    for (const k of vektor.tingkat) {
      const hasil = K.periksaTingkat(k.tingkat, k.usulan, k.alasan);
      expect(hasil.ok ? null : hasil.galat).toBe(k.galat);
    }
    for (const k of vektor.wewenang) {
      const hasil = K.periksaWewenangSp(
        k.tingkat,
        k.sendiri,
        k.dalam_cakupan,
        k.boleh_sp3,
      );
      expect({ nama: k.nama, galat: hasil.ok ? null : hasil.galat }).toEqual({
        nama: k.nama,
        galat: k.galat,
      });
    }
  });
});
