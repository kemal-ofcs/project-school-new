import { describe, expect, test } from "bun:test";
import {
  type BarisJadwal,
  jpPerMapel,
  kunciSel,
  petakanGrid,
  petakanPerGuru,
  rencanaSimpan,
  salinKeGrid,
  selisihGrid,
  terapkanPerubahan,
} from "./aturanJadwalGrid";

const baris = (
  id_jadwal: string,
  hari: number,
  jam_ke: string,
  id_mapel: string,
  id_guru = "g1",
  is_aktif = 1,
): BarisJadwal => ({ id_jadwal, hari, jam_ke, id_mapel, id_guru, is_aktif });

describe("petakanGrid", () => {
  test("rentang mengisi setiap selnya, baris nonaktif diabaikan", () => {
    const peta = petakanGrid([
      baris("a", 1, "1-2", "mtk"),
      baris("b", 1, "3", "ipa", "g1", 0),
    ]);
    expect([...peta.sel.keys()]).toEqual(["1:1", "1:2"]);
    expect(peta.bisaDiubah.map((r) => r.id_jadwal)).toEqual(["a"]);
    expect(peta.terkunci.size).toBe(0);
  });

  test("sel berisi dua mapel terkunci beserta seluruh rentang barisnya", () => {
    const peta = petakanGrid([
      baris("islam", 2, "1-2", "agama-i"),
      baris("kristen", 2, "2-3", "agama-k"),
      baris("lain", 2, "4", "mtk"),
    ]);
    expect([...peta.terkunci].sort()).toEqual(["2:1", "2:2", "2:3"]);
    expect(peta.tetap.map((r) => r.id_jadwal).sort()).toEqual([
      "islam",
      "kristen",
    ]);
    expect([...peta.sel.keys()]).toEqual(["2:4"]);
  });

  test("jam_ke tidak valid tidak masuk grid", () => {
    const peta = petakanGrid([baris("x", 1, "abc", "mtk")]);
    expect(peta.sel.size).toBe(0);
    expect(peta.tetap.map((r) => r.id_jadwal)).toEqual(["x"]);
  });
});

describe("rencanaSimpan", () => {
  test("sel bersebelahan dengan isi sama digabung menjadi rentang", () => {
    const sel = new Map([
      [kunciSel(1, 1), { id_mapel: "mtk", id_guru: "g1" }],
      [kunciSel(1, 2), { id_mapel: "mtk", id_guru: "g1" }],
      [kunciSel(1, 3), { id_mapel: "mtk", id_guru: "g2" }],
      [kunciSel(1, 5), { id_mapel: "mtk", id_guru: "g2" }],
    ]);
    const rencana = rencanaSimpan([], sel, [1]);
    expect(rencana.tambah.map((r) => `${r.jam_ke}/${r.id_guru}`)).toEqual([
      "1-2/g1",
      "3/g2",
      "5/g2",
    ]);
    expect(rencana.hapus).toEqual([]);
    expect(rencana.ubah).toEqual([]);
  });

  test("tanpa perubahan tidak menghasilkan apa pun", () => {
    const rows = [baris("a", 1, "1-2", "mtk"), baris("b", 1, "3", "ipa")];
    const peta = petakanGrid(rows);
    expect(rencanaSimpan(peta.bisaDiubah, peta.sel, [1])).toEqual({
      hapus: [],
      ubah: [],
      tambah: [],
    });
  });

  test("jam sama dengan isi berbeda diubah di tempat, id dipertahankan", () => {
    const peta = petakanGrid([baris("a", 1, "1-2", "mtk")]);
    const sel = new Map(peta.sel);
    sel.set("1:1", { id_mapel: "ipa", id_guru: "g9" });
    sel.set("1:2", { id_mapel: "ipa", id_guru: "g9" });
    const rencana = rencanaSimpan(peta.bisaDiubah, sel, [1]);
    expect(rencana.ubah).toEqual([
      {
        id_jadwal: "a",
        hari: 1,
        jam_ke: "1-2",
        id_mapel: "ipa",
        id_guru: "g9",
      },
    ]);
    expect(rencana.hapus).toEqual([]);
    expect(rencana.tambah).toEqual([]);
  });

  test("rentang yang berubah menjadi hapus + tambah", () => {
    const peta = petakanGrid([baris("a", 1, "1-2", "mtk")]);
    const sel = new Map(peta.sel);
    sel.delete("1:2");
    const rencana = rencanaSimpan(peta.bisaDiubah, sel, [1]);
    expect(rencana.hapus).toEqual(["a"]);
    expect(rencana.tambah).toEqual([
      { hari: 1, jam_ke: "1", id_mapel: "mtk", id_guru: "g1" },
    ]);
  });

  test("hari yang tidak disunting tidak disusun ulang", () => {
    // Dua baris lama `1` dan `2` bermapel sama tetap dua baris.
    const peta = petakanGrid([
      baris("a", 3, "1", "mtk"),
      baris("b", 3, "2", "mtk"),
    ]);
    const sel = new Map(peta.sel);
    sel.set("1:1", { id_mapel: "ipa", id_guru: "g1" });
    const rencana = rencanaSimpan(peta.bisaDiubah, sel, [1]);
    expect(rencana.hapus).toEqual([]);
    expect(rencana.tambah).toEqual([
      { hari: 1, jam_ke: "1", id_mapel: "ipa", id_guru: "g1" },
    ]);
  });

  test("sel yang dikosongkan menghapus barisnya", () => {
    const peta = petakanGrid([baris("a", 2, "4", "mtk")]);
    const rencana = rencanaSimpan(peta.bisaDiubah, new Map(), [2]);
    expect(rencana.hapus).toEqual(["a"]);
  });
});

describe("salinKeGrid", () => {
  test("guru dari penugasan tujuan, mapel terlarang dan sel terkunci dilewati", () => {
    const hasil = salinKeGrid(
      [
        baris("a", 1, "1-2", "mtk", "guru-xa"),
        baris("b", 1, "3", "bhs-smk", "guru-xa"),
        baris("c", 2, "1", "ipa", "guru-xa"),
        baris("d", 3, "1", "ips", "guru-xa"),
      ],
      {
        terkunci: new Set(["2:1"]),
        mapelBoleh: (id) => id !== "bhs-smk",
        guruPenugasan: new Map([["mtk", "guru-xb"]]),
      },
    );
    expect(hasil.disalin).toBe(2);
    expect(hasil.dilewati).toBe(2);
    expect(hasil.sel.get("1:1")).toEqual({
      id_mapel: "mtk",
      id_guru: "guru-xb",
    });
    expect(hasil.sel.get("3:1")).toEqual({
      id_mapel: "ips",
      id_guru: "guru-xa",
    });
    expect(hasil.sel.has("1:3")).toBe(false);
  });
});

test("jpPerMapel menjumlah grid dan baris terkunci", () => {
  const peta = petakanGrid([
    baris("a", 1, "1-2", "mtk"),
    baris("i", 2, "1-2", "agama-i"),
    baris("k", 2, "1-2", "agama-k"),
  ]);
  const jp = jpPerMapel(peta.sel, peta.tetap);
  expect(jp.get("mtk")).toBe(2);
  expect(jp.get("agama-i")).toBe(2);
  expect(jp.get("agama-k")).toBe(2);
});

describe("terapkanPerubahan", () => {
  const pjok = { id_mapel: "pjok", id_guru: "g-pjok" };

  test("isi sel kosong rombel lain, guru dari penugasan tujuan bila ada", () => {
    const awal = petakanGrid([]).sel;
    const akhir = new Map([
      [kunciSel(1, 1), pjok],
      [kunciSel(1, 2), pjok],
    ]);
    const tujuan = petakanGrid([baris("x", 1, "3", "mtk")]);
    const hasil = terapkanPerubahan(tujuan, selisihGrid(awal, akhir), {
      mapelBoleh: () => true,
      guruPenugasan: new Map([["pjok", "g-lain"]]),
    });
    expect(hasil.sel.get("1:1")).toEqual({
      id_mapel: "pjok",
      id_guru: "g-lain",
    });
    expect(hasil.sel.get("1:3")?.id_mapel).toBe("mtk");
    expect([...hasil.hariBerubah]).toEqual([1]);
    expect(hasil.dilewati).toEqual([]);
    const rencana = rencanaSimpan(
      tujuan.bisaDiubah,
      hasil.sel,
      hasil.hariBerubah,
    );
    expect(rencana.tambah).toEqual([
      { hari: 1, jam_ke: "1-2", id_mapel: "pjok", id_guru: "g-lain" },
    ]);
    expect(rencana.hapus).toEqual([]);
  });

  test("tidak menimpa mapel lain, sel terkunci, atau mapel unit lain", () => {
    const perubahan = selisihGrid(
      new Map(),
      new Map([
        [kunciSel(1, 1), pjok],
        [kunciSel(2, 1), pjok],
        [kunciSel(3, 1), pjok],
      ]),
    );
    const tujuan = petakanGrid([
      baris("m", 1, "1", "mtk"),
      baris("a", 2, "1", "agama-i"),
      baris("b", 2, "1", "agama-k"),
    ]);
    const hasil = terapkanPerubahan(tujuan, perubahan, {
      mapelBoleh: () => true,
      guruPenugasan: new Map(),
    });
    expect(hasil.dilewati.sort()).toEqual(["1:1", "2:1"]);
    expect(hasil.sel.get("1:1")?.id_mapel).toBe("mtk");
    expect(hasil.sel.get("3:1")).toEqual(pjok);

    const unitLain = terapkanPerubahan(petakanGrid([]), perubahan, {
      mapelBoleh: () => false,
      guruPenugasan: new Map(),
    });
    expect(unitLain.dilewati).toHaveLength(3);
    expect(unitLain.hariBerubah.size).toBe(0);
  });

  test("mengosongkan hanya menghapus mapel yang sama", () => {
    const perubahan = selisihGrid(
      new Map([
        [kunciSel(1, 1), pjok],
        [kunciSel(1, 2), pjok],
      ]),
      new Map(),
    );
    const tujuan = petakanGrid([
      baris("p", 1, "1", "pjok", "g-x"),
      baris("m", 1, "2", "mtk"),
    ]);
    const hasil = terapkanPerubahan(tujuan, perubahan, {
      mapelBoleh: () => true,
      guruPenugasan: new Map(),
    });
    expect(hasil.sel.has("1:1")).toBe(false);
    expect(hasil.sel.get("1:2")?.id_mapel).toBe("mtk");
    expect(
      rencanaSimpan(tujuan.bisaDiubah, hasil.sel, hasil.hariBerubah).hapus,
    ).toEqual(["p"]);
  });
});

describe("petakanPerGuru", () => {
  test("kelas gabungan satu sel, JP tatap muka dihitung sekali", () => {
    const rombel = (
      id: string,
      r: string,
      hari: number,
      jam: string,
      mapel = "pjok",
    ) => ({
      ...baris(id, hari, jam, mapel),
      id_rombel: r,
    });
    const hasil = petakanPerGuru([
      rombel("a", "7A", 1, "1-2"),
      rombel("b", "7B", 1, "1-2"),
      rombel("c", "7C", 1, "1-2"),
      rombel("d", "8A", 2, "3"),
      { ...rombel("e", "8B", 2, "4"), is_aktif: 0 },
    ]);
    expect(hasil.sel.get("1:1")).toEqual([
      { id_mapel: "pjok", rombel: ["7A", "7B", "7C"] },
    ]);
    expect(hasil.jpRombel).toBe(7);
    expect(hasil.jpTatapMuka).toBe(3);
  });
});
