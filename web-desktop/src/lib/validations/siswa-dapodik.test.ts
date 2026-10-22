import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  AGAMA,
  ALAT_TRANSPORTASI,
  JENIS_TINGGAL,
  JENJANG_PENDIDIKAN,
  KEBUTUHAN_KHUSUS,
  KUNCI_DATA_DAPODIK,
  PEKERJAAN,
  PENGHASILAN,
} from "./pmb-dapodik";
import {
  ISIAN_WAJIB_DAPODIK,
  isianKurangDapodik,
  SQL_KOSONGKAN_DAPODIK_SISWA,
  SQL_SALIN_DAPODIK_PMB,
  SQL_SIMPAN_DAPODIK_SISWA,
  validasiSimpanDapodikSiswa,
} from "./siswa-dapodik";
import vektor from "./siswa-dapodik.vektor.json";

// Vektor yang sama dibaca `mod tests` di `src-tauri/src/desktop/siswa_dapodik.rs`.
describe("validasiSimpanDapodikSiswa", () => {
  for (const kasus of vektor as {
    nama: string;
    masukan: unknown;
    hasil?: unknown;
    galat?: string;
  }[]) {
    test(kasus.nama, () => {
      const hasil = validasiSimpanDapodikSiswa(kasus.masukan);
      if (kasus.hasil) {
        expect(hasil).toEqual({ ok: true, nilai: kasus.hasil as never });
      } else {
        expect(hasil.ok).toBe(false);
        if (kasus.galat && !hasil.ok) expect(hasil.galat).toBe(kasus.galat);
      }
    });
  }
});

describe("isianKurangDapodik", () => {
  test("tanpa baris, semua isian wajib kurang", () => {
    expect(isianKurangDapodik(null)).toEqual([
      "tempatLahir",
      "tanggalLahir",
      "sekolahAsal",
      ...ISIAN_WAJIB_DAPODIK,
    ]);
  });

  test("dusun dan blok bantuan tidak dihitung", () => {
    expect(ISIAN_WAJIB_DAPODIK).not.toContain("dusun");
    expect(ISIAN_WAJIB_DAPODIK).not.toContain("noKks");
    expect(ISIAN_WAJIB_DAPODIK).toContain("nik");
  });

  test("isian terisi tidak dihitung, nol tetap terisi", () => {
    const kurang = isianKurangDapodik({
      id_siswa: "s",
      tempat_lahir: "Bandung",
      tanggal_lahir: "2010-01-01",
      sekolah_asal: " ",
      data_dapodik: JSON.stringify({ versi: 1, nik: "1", jumlahSaudara: 0 }),
      diubah_oleh: null,
      updated_at: null,
    });
    expect(kurang).toContain("sekolahAsal");
    expect(kurang).not.toContain("nik");
    expect(kurang).not.toContain("jumlahSaudara");
    expect(kurang).toContain("agama");
  });
});

// Salinan Mobile tidak membawa berkas Rust desktop; di sana uji ini dilewati.
const berkasRust = join(
  import.meta.dir,
  "../../../src-tauri/src/desktop/siswa_dapodik.rs",
);
let rust = "";
try {
  rust = readFileSync(berkasRust, "utf8");
} catch {
  rust = "";
}

describe("kembaran Rust", () => {
  test.skipIf(!rust)("konstanta SQL dieja sama persis", () => {
    for (const sql of [
      SQL_SALIN_DAPODIK_PMB,
      SQL_SIMPAN_DAPODIK_SISWA,
      SQL_KOSONGKAN_DAPODIK_SISWA,
    ]) {
      expect(rust).toContain(`"${sql}"`);
    }
  });

  test.skipIf(!rust)("daftar pilihan dan kunci isian sama", () => {
    const daftarRust = (nama: string) => {
      const cocok = new RegExp(
        `pub const ${nama}: &\\[&str\\] = &\\[([^\\]]*)\\];`,
      ).exec(rust);
      return [...(cocok?.[1] ?? "").matchAll(/"([^"]*)"/g)].map((m) => m[1]);
    };
    expect(daftarRust("AGAMA")).toEqual([...AGAMA]);
    expect(daftarRust("JENIS_TINGGAL")).toEqual([...JENIS_TINGGAL]);
    expect(daftarRust("ALAT_TRANSPORTASI")).toEqual([...ALAT_TRANSPORTASI]);
    expect(daftarRust("JENJANG_PENDIDIKAN")).toEqual([...JENJANG_PENDIDIKAN]);
    expect(daftarRust("PEKERJAAN")).toEqual([...PEKERJAAN]);
    expect(daftarRust("PENGHASILAN")).toEqual([...PENGHASILAN]);
    expect(daftarRust("KEBUTUHAN_KHUSUS")).toEqual([...KEBUTUHAN_KHUSUS]);

    const kunciRust = [...rust.matchAll(/\(\s*"([a-zA-Z]+)",\s*Aturan::/g)].map(
      (m) => m[1],
    );
    expect(kunciRust).toEqual([...KUNCI_DATA_DAPODIK, "lingkarKepalaCm"]);
  });
});
