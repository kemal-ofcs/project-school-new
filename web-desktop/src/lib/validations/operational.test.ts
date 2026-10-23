import { describe, expect, test } from "bun:test";
import { validasiBarisImport, validasiKoreksi } from "./operational";

// Vektor yang sama dengan `validasi_operasional_vektor_kembar` di administration.rs.
const HARI_INI = "2026-10-23";

describe("validasiKoreksi", () => {
  const dasar = {
    tanggal: "2026-10-20",
    id_karyawan: "K001",
    jenis_koreksi: "Lupa Absen Masuk",
    jam_koreksi: "07:10",
  };
  const kasus: [Partial<typeof dasar>, string | null][] = [
    [{}, null],
    [{ tanggal: "2026-02-30" }, "Data Koreksi Admin tidak valid."],
    [{ jenis_koreksi: "Cuti" }, "Data Koreksi Admin tidak valid."],
    [
      { jam_koreksi: "" },
      "Jenis koreksi 'Lupa Absen Masuk' wajib menyertakan jam koreksi (HH:mm).",
    ],
    [{ jam_koreksi: "99:99" }, "Jam koreksi harus berformat HH:mm."],
    [{ jam_koreksi: "7:10" }, "Jam koreksi harus berformat HH:mm."],
    [
      { tanggal: "2026-10-24" },
      "Tanggal 2026-10-24 belum terjadi; absensi berjam hanya boleh untuk hari ini atau sebelumnya.",
    ],
    [{ tanggal: "2026-10-24", jenis_koreksi: "Sakit", jam_koreksi: "" }, null],
  ];
  for (const [ubah, harapan] of kasus) {
    test(JSON.stringify(ubah), () => {
      expect(validasiKoreksi({ ...dasar, ...ubah }, HARI_INI)).toBe(harapan);
    });
  }
});

describe("validasiBarisImport", () => {
  const dasar = {
    tanggal: "2026-10-20",
    id_unik: "K001",
    jam_masuk: "07:00",
    jam_pulang: "15:00:00",
    status_kehadiran: "Hadir",
    status_absen: "",
  };
  const kasus: [Partial<typeof dasar>, string | null][] = [
    [{}, null],
    [{ id_unik: "" }, "Tanggal atau ID tidak valid."],
    [{ status_kehadiran: "hadir" }, "Status kehadiran 'hadir' tidak dikenal."],
    [{ status_absen: "Cuti" }, "Status absen 'Cuti' tidak dikenal."],
    [{ jam_masuk: "", jam_pulang: "" }, "Jam masuk/pulang tidak valid."],
    [{ jam_masuk: "07:0é" }, "Jam masuk/pulang tidak valid."],
    [
      { tanggal: "2026-10-24" },
      "Tanggal 2026-10-24 belum terjadi; absensi berjam hanya boleh untuk hari ini atau sebelumnya.",
    ],
    [{ status_kehadiran: "Sakit", jam_masuk: "garbage", jam_pulang: "" }, null],
    [{ status_kehadiran: "Izin", tanggal: "2026-10-24" }, null],
  ];
  for (const [ubah, harapan] of kasus) {
    test(JSON.stringify(ubah), () => {
      expect(validasiBarisImport({ ...dasar, ...ubah }, HARI_INI)).toBe(
        harapan,
      );
    });
  }
});
