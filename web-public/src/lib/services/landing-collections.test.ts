import { describe, expect, test } from "bun:test";
import {
  dariKunciBernomor,
  KUNCI_KOLEKSI,
  KUNCI_LAMA,
  koleksiFaq,
  koleksiFasilitas,
  koleksiProgram,
  koleksiStat,
  koleksiTahapanPmb,
  MAKS_ITEM_KOLEKSI,
  uraiKoleksi,
  uraiSpecs,
  uraiTagar,
} from "./landing-collections";

describe("koleksi dinamis landing page", () => {
  /**
   * Situs publik tidak membawa isi bawaan lagi. Teks contoh yang tertanam di
   * kode tampil di situs sekolah seolah-olah ditulis sekolah itu, dan tidak
   * bisa disunting siapa pun lewat CMS.
   */
  test("tanpa isi di database, setiap koleksi kosong — tidak ada teks contoh", () => {
    expect(koleksiStat({})).toEqual([]);
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
      [KUNCI_KOLEKSI.stat]: JSON.stringify([
        { label: "Akreditasi", value: "", sub: "" },
        { label: "  ", value: "", sub: "" },
      ]),
    };
    expect(koleksiStat(konten)).toEqual([
      { label: "Akreditasi", value: "", sub: "" },
    ]);
  });

  /**
   * Lapis kedua membaca DATABASE, bukan teks bawaan. Pemasangan yang mengisi
   * konten lewat panel versi sebelumnya menyimpannya di kunci bernomor, dan
   * isinya tidak boleh lenyap hanya karena aplikasinya diperbarui.
   */
  test("kunci bernomor lama dibaca ketika koleksinya belum ada", () => {
    const konten = {
      "landing.stat1_label": "Stat Lama",
      "landing.stat1_sub": "Sub Lama",
      "landing.stat3_value": "Nomor boleh berlubang",
    };
    expect(koleksiStat(konten)).toEqual([
      { label: "Stat Lama", value: "", sub: "Sub Lama" },
      { label: "", value: "Nomor boleh berlubang", sub: "" },
    ]);
  });

  test("koleksi yang ada menang atas kunci bernomor lama", () => {
    const konten = {
      "landing.stat1_label": "Stat Lama",
      [KUNCI_KOLEKSI.stat]: '[{"label":"Stat Baru","value":"A","sub":"S"}]',
    };
    expect(koleksiStat(konten)).toEqual([
      { label: "Stat Baru", value: "A", sub: "S" },
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
      ekskul: "landing.ekskul_items",
      program: "landing.program_items",
      fasilitas: "landing.fasilitas_items",
      pmbTahapan: "landing.pmb_tahapan_items",
      faq: "landing.faq_items",
    });
  });
});

describe("kartu program di slider beranda", () => {
  test("tagar dipisah koma, `#` yang ikut diketik dibuang, dan tidak dobel", () => {
    expect(uraiTagar(" #Tahfidz, Ukhuwah ,, ##Ukhuwah, ")).toEqual([
      "Tahfidz",
      "Ukhuwah",
    ]);
    expect(uraiTagar(undefined)).toEqual([]);
  });

  test("program membaca subjudul dan tagar; item lama tanpa keduanya tetap terbaca", () => {
    const konten = {
      [KUNCI_KOLEKSI.program]: JSON.stringify([
        { title: "MABIT", subtitle: "Malam Bina Iman", tags: "Kemandirian" },
        { title: "Market Day", category: "Wirausaha" },
      ]),
    };
    expect(koleksiProgram(konten)).toEqual([
      {
        title: "MABIT",
        subtitle: "Malam Bina Iman",
        category: "",
        desc: "",
        tags: ["Kemandirian"],
        foto: "",
      },
      {
        title: "Market Day",
        subtitle: "",
        category: "Wirausaha",
        desc: "",
        tags: [],
        foto: "",
      },
    ]);
  });
});
