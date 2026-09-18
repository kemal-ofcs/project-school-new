import { describe, expect, test } from "bun:test";
import {
  bangunKoleksi,
  KUNCI_KOLEKSI,
  MAKS_ITEM_KOLEKSI,
  normalisasiFasilitas,
  normalisasiPilar,
  uraiKoleksi,
  uraiSpecs,
} from "./landing-collections";

const PILAR_BAWAAN = [
  { title: "Bawaan 1", desc: "Desk 1", tag: "Tag 1" },
  { title: "Bawaan 2", desc: "Desk 2", tag: "Tag 2" },
];

describe("koleksi dinamis landing page", () => {
  test("JSON rusak diperlakukan sebagai belum diisi, bukan galat", () => {
    // Satu baris JSON cacat tidak boleh menjatuhkan halaman depan situs.
    expect(uraiKoleksi("{bukan json")).toEqual([]);
    expect(uraiKoleksi("null")).toEqual([]);
    expect(uraiKoleksi('"teks biasa"')).toEqual([]);
    expect(uraiKoleksi("{}")).toEqual([]);
    expect(uraiKoleksi(undefined)).toEqual([]);
    expect(uraiKoleksi("   ")).toEqual([]);
  });

  test("hanya objek yang dihitung, dan jumlahnya dibatasi", () => {
    expect(uraiKoleksi('[{"title":"A"},"teks",null,[1,2]]')).toEqual([
      { title: "A" },
    ]);
    const banyak = JSON.stringify(
      Array.from({ length: MAKS_ITEM_KOLEKSI + 10 }, (_, i) => ({
        title: `P${i}`,
      })),
    );
    expect(uraiKoleksi(banyak)).toHaveLength(MAKS_ITEM_KOLEKSI);
  });

  /**
   * Lapis kedua ini bukan kerapian. Pemasangan yang sudah mengisi konten lewat
   * panel versi sebelumnya menyimpannya di kunci bernomor; kalau kunci itu
   * berhenti dibaca, seluruh isinya lenyap saat aplikasi diperbarui.
   */
  test("urutan sumber: koleksi → kunci bernomor lama → bawaan", () => {
    const lama = [{ title: "Dari kunci lama", desc: "D", tag: "T" }];

    // 1. Koleksi ada → menang atas keduanya.
    expect(
      bangunKoleksi(
        uraiKoleksi('[{"title":"Dari koleksi","desc":"D2","tag":"T2"}]'),
        lama,
        PILAR_BAWAAN,
        normalisasiPilar,
      ),
    ).toEqual([{ title: "Dari koleksi", desc: "D2", tag: "T2" }]);

    // 2. Koleksi kosong → kunci lama.
    expect(bangunKoleksi([], lama, PILAR_BAWAAN, normalisasiPilar)).toEqual(
      lama,
    );

    // 3. Keduanya kosong → bawaan.
    expect(bangunKoleksi([], [], PILAR_BAWAAN, normalisasiPilar)).toEqual(
      PILAR_BAWAAN,
    );
  });

  test("field kosong pada item jatuh ke bawaan di posisi yang sama", () => {
    // Mengisi satu field saja tidak boleh mengosongkan sisanya.
    const hasil = bangunKoleksi(
      uraiKoleksi('[{"title":"Hanya judul"}]'),
      [],
      PILAR_BAWAAN,
      normalisasiPilar,
    );
    expect(hasil).toEqual([
      { title: "Hanya judul", desc: "Desk 1", tag: "Tag 1" },
    ]);
  });

  test("item melebihi jumlah bawaan tetap sah, tanpa cadangan", () => {
    const hasil = bangunKoleksi(
      uraiKoleksi(
        '[{"title":"A","desc":"a","tag":"x"},{"title":"B","desc":"b","tag":"y"},{"title":"C","desc":"c","tag":"z"}]',
      ),
      [],
      PILAR_BAWAAN,
      normalisasiPilar,
    );
    expect(hasil).toHaveLength(3);
    expect(hasil[2]).toEqual({ title: "C", desc: "c", tag: "z" });
  });

  test("specs menerima array maupun teks berbaris-baris", () => {
    expect(uraiSpecs(["  A  ", "", "B"])).toEqual(["A", "B"]);
    expect(uraiSpecs("A\n\n  B  \nC")).toEqual(["A", "B", "C"]);
    expect(uraiSpecs(undefined)).toEqual([]);
    expect(
      normalisasiFasilitas({ name: "Lab", specs: "X\nY" }, undefined).specs,
    ).toEqual(["X", "Y"]);
  });

  test("nama kunci koleksi adalah kontrak dengan panel admin", () => {
    // Berubah di satu sisi saja = koleksinya terbaca kosong tanpa pesan galat.
    expect(KUNCI_KOLEKSI).toEqual({
      pilar: "landing.pilar_items",
      ekskul: "landing.ekskul_items",
      fasilitas: "landing.fasilitas_items",
      stat: "landing.stat_items",
    });
  });
});
