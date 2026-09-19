import { describe, expect, test } from "bun:test";
import {
  dariKunciBernomor,
  KUNCI_KOLEKSI,
  KUNCI_LAMA,
  koleksiFaq,
  koleksiFasilitas,
  koleksiPilar,
  koleksiStat,
  koleksiTahapanPmb,
  MAKS_ITEM_KOLEKSI,
  uraiKoleksi,
  uraiSpecs,
} from "./landing-collections";

describe("koleksi dinamis landing page", () => {
  /**
   * Situs publik tidak membawa isi bawaan lagi. Teks contoh yang tertanam di
   * kode tampil di situs sekolah seolah-olah ditulis sekolah itu, dan tidak
   * bisa disunting siapa pun lewat CMS.
   */
  test("tanpa isi di database, setiap koleksi kosong — tidak ada teks contoh", () => {
    expect(koleksiStat({})).toEqual([]);
    expect(koleksiPilar({})).toEqual([]);
    expect(koleksiFasilitas({})).toEqual([]);
    expect(koleksiTahapanPmb({})).toEqual([]);
    expect(koleksiFaq({})).toEqual([]);
  });

  test("JSON rusak diperlakukan sebagai belum diisi, bukan galat", () => {
    // Satu baris JSON cacat tidak boleh menjatuhkan halaman depan situs.
    expect(uraiKoleksi("{bukan json")).toEqual([]);
    expect(uraiKoleksi("null")).toEqual([]);
    expect(uraiKoleksi('"teks biasa"')).toEqual([]);
    expect(uraiKoleksi("{}")).toEqual([]);
    expect(uraiKoleksi(undefined)).toEqual([]);
    expect(koleksiFaq({ [KUNCI_KOLEKSI.faq]: "[{rusak" })).toEqual([]);
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

  test("baris yang ditambahkan lalu tidak diisi tidak ditampilkan", () => {
    const konten = {
      [KUNCI_KOLEKSI.pilar]: JSON.stringify([
        { title: "Pilar A", desc: "", tag: "" },
        { title: "  ", desc: "", tag: "" },
      ]),
    };
    expect(koleksiPilar(konten)).toEqual([
      { title: "Pilar A", desc: "", tag: "" },
    ]);
  });

  /**
   * Lapis kedua membaca DATABASE, bukan teks bawaan. Pemasangan yang mengisi
   * konten lewat panel versi sebelumnya menyimpannya di kunci bernomor, dan
   * isinya tidak boleh lenyap hanya karena aplikasinya diperbarui.
   */
  test("kunci bernomor lama dibaca ketika koleksinya belum ada", () => {
    const konten = {
      "landing.pilar1_title": "Pilar Lama",
      "landing.pilar1_tag": "Tag Lama",
      "landing.pilar3_desc": "Nomor boleh berlubang",
    };
    expect(koleksiPilar(konten)).toEqual([
      { title: "Pilar Lama", desc: "", tag: "Tag Lama" },
      { title: "", desc: "Nomor boleh berlubang", tag: "" },
    ]);
  });

  test("koleksi yang ada menang atas kunci bernomor lama", () => {
    const konten = {
      "landing.pilar1_title": "Pilar Lama",
      [KUNCI_KOLEKSI.pilar]: '[{"title":"Pilar Baru","desc":"D","tag":"T"}]',
    };
    expect(koleksiPilar(konten)).toEqual([
      { title: "Pilar Baru", desc: "D", tag: "T" },
    ]);
  });

  test("ekskul lama memakai akhiran `_cat`, bukan `_category`", () => {
    // Ejaan kunci lama dan nama field koleksi memang berbeda di sini.
    expect(
      dariKunciBernomor(
        { "landing.ekskul1_cat": "Olahraga" },
        KUNCI_LAMA.ekskul.awalan,
        KUNCI_LAMA.ekskul.peta,
      ),
    ).toEqual([{ category: "Olahraga" }]);
  });

  test("FAQ dan tahapan PMB tidak punya lapis kunci lama", () => {
    expect(koleksiFaq({ "landing.faq1_q": "Tidak pernah ada" })).toEqual([]);
    expect(
      koleksiTahapanPmb({
        [KUNCI_KOLEKSI.pmbTahapan]: '[{"title":"Daftar","desc":"Isi form"}]',
      }),
    ).toEqual([{ title: "Daftar", desc: "Isi form" }]);
  });

  test("specs menerima array maupun teks berbaris-baris", () => {
    expect(uraiSpecs(["  A  ", "", "B"])).toEqual(["A", "B"]);
    expect(uraiSpecs("A\n\n  B  \nC")).toEqual(["A", "B", "C"]);
    expect(uraiSpecs(undefined)).toEqual([]);
    expect(
      koleksiFasilitas({ "landing.fasilitas1_specs": "X\nY" })[0].specs,
    ).toEqual(["X", "Y"]);
  });

  test("nama kunci koleksi adalah kontrak dengan panel admin", () => {
    // Berubah di satu sisi saja = koleksinya terbaca kosong tanpa pesan galat.
    expect(KUNCI_KOLEKSI).toEqual({
      stat: "landing.stat_items",
      pilar: "landing.pilar_items",
      ekskul: "landing.ekskul_items",
      fasilitas: "landing.fasilitas_items",
      pmbTahapan: "landing.pmb_tahapan_items",
      faq: "landing.faq_items",
    });
  });
});
