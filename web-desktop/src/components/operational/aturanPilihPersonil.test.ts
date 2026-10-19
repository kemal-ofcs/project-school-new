import { describe, expect, test } from "bun:test";
import {
  jalankanBerurutan,
  jenisPersonil,
  ringkasHasil,
  saringPersonil,
  tambahTerpilih,
} from "./aturanPilihPersonil";

const DAFTAR = [
  {
    id_unik: "S-01",
    nama: "Budi",
    divisi: "Peserta Didik",
    jenis_personil: "SISWA",
  },
  {
    id_unik: "S-02",
    nama: "Ani",
    divisi: "Peserta Didik",
    jenis_personil: "Siswa",
  },
  {
    id_unik: "G-01",
    nama: "Pak Joko",
    divisi: "Tenaga Pengajar",
    jenis_personil: "GURU",
  },
  {
    id_unik: "P-01",
    nama: "Sari",
    kode_karyawan: "TU-7",
    divisi: "Tata Usaha",
    jenis_personil: "Pegawai",
  },
  { id_unik: "P-02", nama: "Dodi", divisi: "Satpam", jenis_personil: null },
];

describe("pilihPersonil", () => {
  test("jenis dari ejaan campur", () => {
    expect(DAFTAR.map(jenisPersonil)).toEqual([
      "siswa",
      "siswa",
      "guru",
      "pegawai",
      "pegawai",
    ]);
  });

  test("cari nama, id, kode, dan divisi tanpa peka huruf", () => {
    const id = (kata: string) =>
      saringPersonil(DAFTAR, kata, "semua").map((row) => row.id_unik);
    expect(id("budi")).toEqual(["S-01"]);
    expect(id("p-0")).toEqual(["P-01", "P-02"]);
    expect(id("tu-7")).toEqual(["P-01"]);
    expect(id("satpam")).toEqual(["P-02"]);
    expect(id("  ")).toHaveLength(5);
  });

  test("saringan jenis digabung dengan kata cari", () => {
    expect(saringPersonil(DAFTAR, "", "siswa")).toHaveLength(2);
    expect(saringPersonil(DAFTAR, "ani", "guru")).toHaveLength(0);
  });

  test("tambahTerpilih tanpa duplikat dan berhenti di batas", () => {
    expect(tambahTerpilih(["A"], ["A", "B", "C", "D"], 3)).toEqual({
      hasil: ["A", "B", "C"],
      terpotong: 1,
    });
  });

  test("jalankanBerurutan mengumpulkan gagal tanpa berhenti", async () => {
    const urutan: string[] = [];
    const hasil = await jalankanBerurutan(["A", "B", "C"], async (id) => {
      urutan.push(id);
      if (id === "B") return { sukses: false, pesan: "sudah dikunci" };
      if (id === "C") throw new Error("putus");
      return { sukses: true, pesan: "ok" };
    });
    expect(urutan).toEqual(["A", "B", "C"]);
    expect(hasil.berhasil).toEqual(["A"]);
    expect(ringkasHasil(hasil, (id) => `N${id}`)).toBe(
      "1 berhasil, 2 gagal: NB (sudah dikunci); NC (putus)",
    );
    expect(ringkasHasil({ berhasil: ["A"], gagal: [] }, String)).toBe(
      "1 berhasil, 0 gagal.",
    );
  });
});
