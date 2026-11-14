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
      H.STATUS_KINI_SQL,
      H.CERMIN_STATUS_SQL,
      H.BERKONTRAK_SQL,
      H.SIMPAN_KONTRAK_SQL,
      H.KONTRAK_SQL,
      H.PENGATURAN_KONTRAK_SQL,
      H.HARI_INI_SQL,
      H.SIMPAN_JENIS_TUGAS_SQL,
      H.BENTROK_JENIS_TUGAS_SQL,
      H.JENIS_TUGAS_SQL,
      H.SIMPAN_TUGAS_SQL,
      H.BATAL_TUGAS_SQL,
      H.TUGAS_BERLAKU_SQL,
      H.TUGAS_SQL,
      H.WALI_KELAS_SQL,
      H.TAHUN_AJARAN_SQL,
      H.KUNCI_PERCOBAAN_MAKS,
      H.KUNCI_PKWT_MAKS,
      H.ID_WALI_KELAS,
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
      expect(rust).toContain(
        `STATUS_KONTRAK:[&str;${H.STATUS_KONTRAK.length}]=${JSON.stringify(H.STATUS_KONTRAK).replace(/\s+/g, "")};`,
      );
      for (const [nama, aturan] of [
        ["PERCOBAAN", H.ATURAN_PERCOBAAN],
        ["PKWT", H.ATURAN_PKWT],
      ] as const) {
        expect(rust).toContain(
          `ATURAN_${nama}:Aturan=Aturan{bawaan:${aturan.bawaan},min:${aturan.min},maks:${aturan.maks}};`,
        );
      }
    }
    expect(diperiksa).toBeGreaterThan(0);
  });
});

// Baris kontrak ringkas di vektor: [id, pegawai, status, id_ref, mulai, selesai, percobaan].
const kontrak = (baris: string[][]): H.KontrakBaris[] =>
  baris.map(([id, pegawai, status, ref, mulai, selesai, percobaan]) => ({
    id_kontrak: id,
    id_karyawan: pegawai,
    status,
    id_ref: ref,
    nomor: "",
    tanggal_mulai: mulai,
    tanggal_selesai: selesai,
    percobaan_selesai: percobaan,
    catatan: "",
    dicatat_oleh: "",
    created_at: "",
  }));

const aturanDari = (nama: string) =>
  nama === "percobaan" ? H.ATURAN_PERCOBAAN : H.ATURAN_PKWT;

describe("hris: kontrak dan tugas (kembar hris.rs)", () => {
  test("validasi kontrak dan alasan", () => {
    for (const k of vektor.kontrak) {
      const hasil = H.validasiKontrak(
        { ...vektor.kontrak_dasar, ...k.ubah },
        k.guru,
      );
      expect(hasil.ok ? null : hasil.galat).toBe(k.galat);
      if (hasil.ok) expect(hasil.nilai).toEqual(k.hasil as H.KontrakIsian);
    }
    for (const [masuk, nilai, galat] of vektor.alasan) {
      const hasil = H.validasiAlasan(masuk as string);
      expect(hasil.ok ? hasil.nilai : null).toBe(nilai);
      expect(hasil.ok ? null : hasil.galat).toBe(galat);
    }
  });

  test("tambah bulan, status kerja, tanda, susunan", () => {
    for (const [tanggal, bulan, hasil] of vektor.tambah_bulan) {
      expect(H.tambahBulan(tanggal as string, bulan as number)).toBe(
        hasil as string | null,
      );
    }
    for (const k of vektor.status_kerja) {
      expect(H.statusKerja(kontrak(k.kontrak), k.tanggal)).toEqual(
        k.hasil as H.StatusKerja,
      );
    }
    for (const k of vektor.tanda) {
      expect(H.tandaKontrak(kontrak(k.kontrak), k.aturan)).toEqual(k.hasil);
    }
    for (const k of vektor.susun_kontrak) {
      expect(H.susunKontrak(kontrak(k.kontrak), k.hari_ini, k.aturan)).toEqual(
        k.hasil as H.SusunanKontrak,
      );
    }
  });

  test("angka pengaturan", () => {
    for (const [nilai, nama, hasil] of vektor.angka) {
      expect(
        H.angkaPengaturan(nilai as string | null, aturanDari(nama as string)),
      ).toBe(hasil as number);
    }
    for (const [teks, nama, label, nilai, galat] of vektor.validasi_angka) {
      const hasil = H.validasiAngkaPengaturan(
        teks as string,
        aturanDari(nama as string),
        label as string,
      );
      expect(hasil.ok ? hasil.nilai : null).toBe(nilai);
      expect(hasil.ok ? null : hasil.galat).toBe(galat);
    }
  });

  test("tugas, jenis tugas, status tugas", () => {
    for (const k of vektor.tugas) {
      const hasil = H.validasiTugas({
        ...vektor.tugas_dasar,
        ...k.ubah,
      } as H.TugasIsian);
      expect(hasil.ok ? null : hasil.galat).toBe(k.galat);
      if (hasil.ok) expect(hasil.nilai).toEqual(k.hasil as H.TugasIsian);
    }
    for (const [nama, jp, hasilNama, galat] of vektor.jenis_tugas) {
      const hasil = H.validasiJenisTugas({
        nama: nama as string,
        ekuivalen_jp: jp as number,
      });
      expect(hasil.ok ? hasil.nilai.nama : null).toBe(
        hasilNama as string | null,
      );
      expect(hasil.ok ? null : hasil.galat).toBe(galat as string | null);
    }
    for (const [mulai, selesai, batal, hari, hasil] of vektor.status_tugas) {
      expect(
        H.statusTugas(
          {
            tanggal_mulai: mulai,
            tanggal_selesai: selesai,
            dibatalkan_pada: batal,
          },
          hari,
        ),
      ).toBe(hasil as H.StatusTugas);
    }
  });
});
