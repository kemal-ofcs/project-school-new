import { describe, expect, test } from "bun:test";
import {
  type BarisJadwal,
  jpPerMapel,
  kunciSel,
  petakanGrid,
  rencanaSimpan,
  salinKeGrid,
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
