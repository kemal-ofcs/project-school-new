import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseHariKerja } from "./hari-kerja";
import { KEPALA_UNIT_SQL } from "./hr-beban";
import * as K from "./hr-kinerja";
import vektor from "./hr-kinerja.vektor.json";
import { JADWAL_JP_SQL, PENGAJUAN_BERLAKU_SQL } from "./hr-pengajuan";

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
      K.TAHUN_AJARAN_SQL,
      K.KINERJA_PEGAWAI_SQL,
      K.KINERJA_HARI_SQL,
      K.KINERJA_PENGAJUAN_SQL,
      K.KINERJA_MENUNGGU_SQL,
      K.KEPALA_TU_SQL,
      K.KINERJA_SP_SQL,
      K.KINERJA_JADWAL_SQL,
      K.KINERJA_PRESENSI_SQL,
      K.PENILAIAN_SATU_SQL,
      K.PENILAIAN_PERIODE_SQL,
      K.PENILAIAN_PEGAWAI_SQL,
      K.KELUARGA_SQL,
      K.KEPUTUSAN_KINERJA_SQL,
      K.NILAI_KINERJA_SQL,
      K.AKAR_RENTANG_SQL,
      K.KEPUTUSAN_ADA_SQL,
      K.BUAT_PENILAIAN_SQL,
      K.KOREKSI_PENILAIAN_SQL,
      K.UBAH_PENILAIAN_SQL,
      K.SAMPAI_PENILAIAN_SQL,
      K.HAPUS_NILAI_SQL,
      K.SIMPAN_NILAI_SQL,
      K.KEPUTUSAN_DRAF_SQL,
      K.KEPUTUSAN_DIAJUKAN_SQL,
      K.KEPUTUSAN_TERBUKA_SQL,
      K.TERBUKA_SQL,
      K.DRAF_SQL,
      K.DIAJUKAN_SQL,
      K.PESAN_IZIN,
      K.PESAN_OTOMATIS_BERUBAH,
      K.PESAN_KEADAAN_BERUBAH,
      K.PESAN_BELUM_FINAL_SENDIRI,
      K.PESAN_TIDAK_DITEMUKAN,
      ...K.JENIS_PERIODE,
      ...K.AKSI_KINERJA,
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

  test("SQL 5b dan 5c memuat salinan harfiah sumbernya", () => {
    expect(
      K.KINERJA_JADWAL_SQL.replace(" AND j.id_guru = ?3 ORDER BY", " ORDER BY"),
    ).toBe(JADWAL_JP_SQL);
    expect(K.KINERJA_JADWAL_SQL).toContain("AND j.id_guru = ?3 ORDER BY");
    expect(K.KINERJA_PRESENSI_SQL).toContain("CAST(p.jam_ke AS INTEGER)");
    expect(K.KINERJA_PENGAJUAN_SQL).toContain(PENGAJUAN_BERLAKU_SQL);
    expect(K.KEPALA_TU_SQL.replaceAll("'tgs-ka-tu'", "'tgs-kepsek'")).toBe(
      KEPALA_UNIT_SQL,
    );
    expect(K.KEPALA_TU_SQL).toContain("'tgs-ka-tu'");
    for (const sql of [
      K.UBAH_PENILAIAN_SQL,
      K.SAMPAI_PENILAIAN_SQL,
      K.HAPUS_NILAI_SQL,
      K.SIMPAN_NILAI_SQL,
      K.KEPUTUSAN_DRAF_SQL,
    ]) {
      expect(sql).toContain(K.DRAF_SQL);
    }
    expect(K.KEPUTUSAN_DIAJUKAN_SQL).toContain(K.DIAJUKAN_SQL);
    expect(K.KEPUTUSAN_TERBUKA_SQL).toContain(K.TERBUKA_SQL);
    expect(K.KEPUTUSAN_TERBUKA_SQL).not.toContain(K.DRAF_SQL);
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

type Nilai = K.BarisNilai[];

describe("hr-kinerja: vektor penilaian 5b", () => {
  test("periode, rentang aktif, buat", () => {
    for (const k of vektor.periode) {
      cocok(K.periodeDariTahunAjaran(k.jenis, k.kunci, k.tahun), k as Kasus);
    }
    for (const k of vektor.rentang_aktif) {
      expect(
        K.rentangAktif(
          k.periode[0] as string,
          k.periode[1] as string,
          k.tanggal_daftar,
          k.tanggal_keluar,
        ),
        k.nama,
      ).toEqual(k.hasil);
    }
    for (const k of vektor.periksa_buat) {
      const hasil = K.periksaBuat(
        k.aktif,
        k.sudah_keluar,
        k.periode_mulai,
        k.hari_ini,
        k.rentang ? { mulai: "", akhir: "", penuh: true } : null,
      );
      expect(hasil.ok ? undefined : hasil.galat, k.nama).toBe(k.galat);
    }
  });

  test("validasi, susun nilai, isian tersimpan, muat ulang", () => {
    for (const k of vektor.validasi_penilaian) {
      cocok(K.validasiPenilaian(k.draft as K.PenilaianDraft), k as Kasus);
    }
    for (const k of vektor.susun_nilai) {
      cocok(
        K.susunNilai(
          k.baris as Nilai,
          k.isian as K.IsianNilai[],
          k.otomatis as Record<string, K.Otomatis>,
        ),
        k as Kasus,
      );
    }
    for (const k of vektor.isian_tersimpan) {
      expect(K.isianTersimpan(k.baris as Nilai), k.nama).toEqual(k.hasil);
    }
    for (const k of vektor.muat_ulang) {
      expect(
        K.muatUlangTemplate(k.baru as Nilai, k.lama as Nilai),
        k.nama,
      ).toEqual(k.hasil as Nilai);
    }
  });

  test("status, aksi, baca, tanda", () => {
    for (const k of vektor.status) {
      expect(K.statusKinerja(k.keputusan), JSON.stringify(k)).toBe(
        k.hasil as K.StatusKinerja,
      );
    }
    for (const k of vektor.aksi) {
      const hasil = K.periksaAksiKinerja(k.aksi, k.alasan, {
        ...K.KEADAAN_KOSONG,
        ...k.keadaan,
      });
      expect(hasil.ok ? undefined : hasil.galat, k.nama).toBe(
        (k as { galat?: string }).galat,
      );
    }
    for (const k of vektor.boleh_baca) {
      expect(K.bolehBacaKinerja(k.sendiri, k.status, k.view)).toBe(k.hasil);
    }
    for (const k of vektor.tanda) {
      expect(K.tandaKinerja(k.info as K.InfoTanda), k.nama).toEqual(
        k.hasil as K.TandaKinerja[],
      );
    }
  });

  test("nilai akhir, berlaku, penilai bawaan", () => {
    for (const k of vektor.nilai_akhir) {
      expect(K.nilaiAkhir(k.baris as Nilai), k.nama).toBe(k.hasil);
    }
    expect(K.formatNilai(7750)).toBe("77,50");
    expect(K.formatNilai(10000)).toBe("100,00");
    expect(K.formatNilai(5)).toBe("0,05");
    for (const k of vektor.kinerja_berlaku) {
      expect(K.kinerjaBerlaku(k.kandidat)).toBe(k.hasil);
    }
    for (const k of vektor.penilai_bawaan) {
      expect(K.penilaiBawaan(k.masukan), k.nama).toEqual(
        k.hasil as K.PenilaiBawaan | null,
      );
    }
  });

  test("kehadiran §23.2.3", () => {
    for (const k of vektor.kehadiran) {
      const m = k.masukan;
      const hasil = K.hitungKehadiran({
        mulai: m.mulai,
        akhir: m.akhir,
        hari_ini: m.hari_ini,
        jadwal: {
          hari_masuk: parseHariKerja(m.hari_kerja),
          divisi: m.divisi,
          kode_shift: m.kode_shift,
        },
        hari: m.hari.map(K.hariKehadiran),
        pengajuan: m.pengajuan.map(K.pengajuanKehadiran),
        libur: new Set(m.libur),
        whitelist: m.whitelist.map((w) => ({ ...w, keterangan: null })),
        ambang: m.ambang,
      });
      expect(hasil, k.nama).toEqual(k.hasil as K.Kehadiran);
    }
  });

  test("presensi kelas dan jurnal §23.2.4", () => {
    for (const k of vektor.mengajar) {
      const m = k.masukan;
      const hasil = K.hitungMengajar({
        ...m,
        presensi: m.presensi.map(K.presensiKinerja),
        pengajuan: m.pengajuan.map((p) => ({ ...p, nama_guru: "" })),
        ditangani: new Set(m.ditangani),
        libur: new Set(m.libur),
      });
      expect(hasil, k.nama).toEqual(k.hasil as K.Mengajar);
    }
  });
});
