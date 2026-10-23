import { describe, expect, test } from "bun:test";
import {
  type BarisImporDapodik,
  cocokkanSiswaDapodik,
  uraiDaftarPd,
} from "./impor-dapodik";
import { JUDUL_EKSPOR_DAPODIK } from "./pmb-dapodik";

// Judul persis berkas daftar_pd DAPODIK: tanpa dua kolom PMB di ujung, dan
// dua judul terakhir memuat baris baru. Isi barisnya karangan.
const baris1 = JUDUL_EKSPOR_DAPODIK.baris1
  .slice(0, -2)
  .map((j) =>
    j === "Jml. Saudara Kandung"
      ? "Jml. Saudara\r\nKandung"
      : j === "Jarak Rumah ke Sekolah (KM)"
        ? "Jarak Rumah\r\nke Sekolah (KM)"
        : j,
  );
const baris2 = JUDUL_EKSPOR_DAPODIK.baris2.slice(0, -2);

function barisData(isi: Record<string, string>): string[] {
  const row = baris1.map(() => "");
  for (const [kolom, nilai] of Object.entries(isi)) {
    const [judul, kelompok] = kolom.split("@");
    const indeks = kelompok
      ? baris2.indexOf(judul, baris1.indexOf(kelompok))
      : baris1.findIndex((j) => j.replace(/\s+/g, " ") === judul);
    if (indeks < 0) throw new Error(`kolom ${kolom}`);
    row[indeks] = nilai;
  }
  return row;
}

describe("uraiDaftarPd", () => {
  const [hasil] = uraiDaftarPd([
    ["Daftar Peserta Didik"],
    baris1,
    baris2,
    barisData({
      Nama: " Budi  Santoso ",
      NISN: "0012345678",
      "Tanggal Lahir": "2009-05-01",
      NIK: "3,21606E+15",
      Agama: "Islam",
      "Nama di KIP": "0",
      "Sekolah Asal": " ",
      "Lingkar Kepala": "0",
      "Jml. Saudara Kandung": "2",
      "Nama@Data Ayah": "Ahmad",
      "Tahun Lahir@Data Ayah": "0",
      "Penghasilan@Data Ayah": "Rp1.000.001 â€“ Rp3.000.000",
      "Penghasilan@Data Ibu": "< Rp1.000.000",
      "Tahun Lahir@Data Ibu": "1985",
    }),
  ]);

  test("isian sah dibawa, tanda pisah dinormalkan, nol dan kosong dibuang", () => {
    expect(hasil.nama).toBe("Budi Santoso");
    expect(hasil.nisn).toBe("0012345678");
    expect(hasil.isian).toEqual({
      tanggalLahir: "2009-05-01",
      agama: "Islam",
      jumlahSaudara: "2",
      ayahNama: "Ahmad",
      ayahPenghasilan: "Rp1.000.001 - Rp3.000.000",
      ibuTahunLahir: "1985",
    });
  });

  test("nilai asing ditolak per sel, bukan per baris", () => {
    expect(hasil.ditolak.map((d) => d.label)).toEqual([
      "NIK",
      "Penghasilan (Data Ibu)",
    ]);
  });

  test("berkas tanpa judul Nama dan NISN ditolak", () => {
    expect(() => uraiDaftarPd([["id_siswa", "nama_lengkap"]])).toThrow(
      "Judul kolom Nama dan NISN",
    );
  });
});

describe("cocokkanSiswaDapodik", () => {
  const siswa = [
    { id_siswa: "S1", nama_lengkap: "Budi Santoso", nisn: "12345678" },
    { id_siswa: "S2", nama_lengkap: "Citra", nisn: "" },
    { id_siswa: "S3", nama_lengkap: "Dewi", nisn: "" },
    { id_siswa: "S4", nama_lengkap: "dewi", nisn: "" },
  ];
  const lahir = new Map([
    ["S2", "2010-01-02"],
    ["S3", "2010-03-04"],
    ["S4", "2010-03-04"],
  ]);
  const baris = (
    nama: string,
    nisn: string,
    tanggalLahir?: string,
  ): BarisImporDapodik => ({
    nama,
    nisn,
    isian: tanggalLahir ? { tanggalLahir } : {},
    ditolak: [],
  });

  test("NISN dicocokkan tanpa nol di depan, lalu nama + tanggal lahir", () => {
    expect(
      cocokkanSiswaDapodik(
        [
          baris("Siapa Saja", "0012345678"),
          baris("CITRA ", "999", "2010-01-02"),
          baris("Dewi", "", "2010-03-04"),
          baris("Budi Santoso", "12345678"),
          baris("Eka", "", "2010-01-02"),
        ],
        siswa,
        lahir,
      ),
    ).toEqual([
      { status: "cocok", idSiswa: "S1" },
      { status: "cocok", idSiswa: "S2" },
      { status: "ganda" },
      { status: "ganda" },
      { status: "tidakDitemukan" },
    ]);
  });
});
