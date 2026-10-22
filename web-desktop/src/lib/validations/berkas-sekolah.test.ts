import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  berkasSekolahSchema,
  JENIS_BERKAS_SEKOLAH,
  MAKS_BYTE_BERKAS,
  MIME_BERKAS_SEKOLAH,
  PESAN_BERKAS_TERLALU_BESAR,
  SQL_BUANG_BERKAS_PMB_TERPINDAH,
  SQL_HAPUS_BERKAS_PMB,
  SQL_HAPUS_BERKAS_SISWA,
  SQL_HAPUS_JENIS_BERKAS_PMB,
  SQL_HAPUS_JENIS_BERKAS_SISWA,
  SQL_PINDAH_BERKAS_PMB,
  SQL_SIMPAN_BERKAS_PMB,
  SQL_SIMPAN_BERKAS_SISWA,
  uraiBerkasSekolah,
} from "./berkas-sekolah";
import vektor from "./berkas-sekolah.vektor.json";

type Masukan = Parameters<typeof uraiBerkasSekolah>[0];

// Vektor yang sama dibaca `mod tests` di `src-tauri/src/desktop/berkas_sekolah.rs`.
describe("uraiBerkasSekolah", () => {
  for (const kasus of vektor as {
    nama: string;
    masukan: Masukan;
    hasil?: unknown;
    galat?: string;
  }[]) {
    test(kasus.nama, () => {
      const hasil = uraiBerkasSekolah(kasus.masukan);
      if (kasus.hasil) {
        expect(hasil).toEqual({ ok: true, nilai: kasus.hasil as never });
      } else {
        expect(hasil).toEqual({ ok: false, galat: kasus.galat as string });
      }
    });
  }

  test("batas ukuran dihitung dari isi, bukan dari klien", () => {
    const jpeg = (byte: number) =>
      Buffer.concat([
        Buffer.from([0xff, 0xd8, 0xff]),
        Buffer.alloc(byte - 3),
      ]).toString("base64");
    const masukan = { jenis: "foto", namaFile: "f.jpg", mime: "image/jpeg" };
    const pas = uraiBerkasSekolah({
      ...masukan,
      kontenBase64: jpeg(MAKS_BYTE_BERKAS),
    });
    expect(pas.ok && pas.nilai.ukuranByte).toBe(MAKS_BYTE_BERKAS);
    expect(
      uraiBerkasSekolah({
        ...masukan,
        kontenBase64: jpeg(MAKS_BYTE_BERKAS + 1),
      }),
    ).toEqual({ ok: false, galat: PESAN_BERKAS_TERLALU_BESAR });
  });

  test("skema menolak kunci asing dan tidak memercayai ukuranByte", () => {
    const [kasus] = vektor as { masukan: Masukan }[];
    expect(
      berkasSekolahSchema.safeParse({ ...kasus.masukan, ukuranByte: 1 })
        .success,
    ).toBe(false);
    const hasil = berkasSekolahSchema.safeParse(kasus.masukan);
    expect(hasil.success && hasil.data.ukuranByte).toBeGreaterThan(1);
  });
});

// Salinan Mobile/web-public tidak membawa berkas Rust desktop; di sana dilewati.
let rust = "";
try {
  rust = readFileSync(
    join(import.meta.dir, "../../../src-tauri/src/desktop/berkas_sekolah.rs"),
    "utf8",
  );
} catch {
  rust = "";
}

describe("kembaran Rust", () => {
  test.skipIf(!rust)("konstanta SQL dieja sama persis", () => {
    for (const sql of [
      SQL_HAPUS_JENIS_BERKAS_PMB,
      SQL_SIMPAN_BERKAS_PMB,
      SQL_HAPUS_BERKAS_PMB,
      SQL_HAPUS_JENIS_BERKAS_SISWA,
      SQL_SIMPAN_BERKAS_SISWA,
      SQL_HAPUS_BERKAS_SISWA,
      SQL_PINDAH_BERKAS_PMB,
      SQL_BUANG_BERKAS_PMB_TERPINDAH,
    ]) {
      expect(rust).toContain(`"${sql}"`);
    }
  });

  test.skipIf(!rust)("daftar jenis, mime, dan batas sama", () => {
    const daftar = (nama: string) =>
      [
        ...(
          new RegExp(`pub const ${nama}: &\\[&str\\] = &\\[([^\\]]*)\\];`).exec(
            rust,
          )?.[1] ?? ""
        ).matchAll(/"([^"]*)"/g),
      ].map((m) => m[1]);
    expect(daftar("JENIS_BERKAS")).toEqual([...JENIS_BERKAS_SEKOLAH]);
    expect(daftar("MIME_BERKAS")).toEqual([...MIME_BERKAS_SEKOLAH]);
    expect(rust).toContain(
      `pub const MAKS_BYTE_BERKAS: usize = ${MAKS_BYTE_BERKAS / 1024} * 1024;`,
    );
  });
});
