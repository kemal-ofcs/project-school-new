import { describe, expect, test } from "bun:test";
import {
  hitungRapel,
  idRapel,
  komponenPersen,
  komponenRapel,
  labelRapel,
  type SlipBeku,
  statusRapel,
  validateAlasanBatal,
  validateRentang,
} from "./payroll-rapel";

// Vektor kembar `mod tests` di `src-tauri/src/desktop/rapel.rs`.

const hasil = <T>(h: { ok: true; value: T } | { ok: false; error: string }) =>
  h.ok ? h.value : h.error;

const SLIP_A: SlipBeku = {
  regular_hours: 160,
  overtime_index: 3.5,
  holiday_overtime_index: 0,
  komponen_persen: [
    { category: "ALLOWANCE", rate: 10 },
    { category: "DEDUCTION", rate: 2 },
  ],
};

// 11 menit pada 18.750/jam = 3.437,5 tepat: titik tengah yang harus naik.
const SLIP_B: SlipBeku = {
  regular_hours: 11 / 60,
  overtime_index: 0,
  holiday_overtime_index: 1.25,
  komponen_persen: [{ category: "ALLOWANCE", rate: 12.5 }],
};

describe("hitungRapel", () => {
  test("kenaikan tarif", () => {
    expect(hitungRapel(SLIP_A, 20_000, 22_000)).toEqual({
      selisih_pokok: 320_000,
      selisih_lembur: 7_000,
      selisih_komponen: 25_600,
      jumlah: 352_600,
    });
  });

  test("pembulatan dihitung dari angka beku yang sama", () => {
    expect(hitungRapel(SLIP_B, 18_750, 18_751)).toEqual({
      selisih_pokok: 0,
      selisih_lembur: 1,
      selisih_komponen: 0,
      jumlah: 1,
    });
  });

  test("tarif turun = kelebihan bayar", () => {
    expect(hitungRapel(SLIP_A, 22_000, 20_000).jumlah).toBe(-352_600);
  });

  test("tarif sama = nol", () => {
    expect(hitungRapel(SLIP_A, 20_000, 20_000).jumlah).toBe(0);
  });
});

describe("komponenPersen", () => {
  test("hanya PERCENTAGE yang terbaca", () => {
    const snapshot = JSON.stringify({
      components: [
        { category: "ALLOWANCE", calc_type: "PERCENTAGE", rate: 10 },
        { category: "ALLOWANCE", calc_type: "FIXED", rate: 50_000 },
        { category: "DEDUCTION", calc_type: "PERCENTAGE", rate: 2 },
        { category: "DEDUCTION", calc_type: "KASBON", rate: 0 },
        { category: "ALLOWANCE", calc_type: "PERCENTAGE", rate: "5" },
      ],
    });
    expect(komponenPersen(snapshot)).toEqual([
      { category: "ALLOWANCE", rate: 10 },
      { category: "DEDUCTION", rate: 2 },
    ]);
  });

  test("snapshot rusak = tanpa komponen", () => {
    expect(komponenPersen("bukan json")).toEqual([]);
    expect(komponenPersen("{}")).toEqual([]);
  });
});

describe("rentang, alasan, label, status, id", () => {
  test("validateRentang", () => {
    expect(hasil(validateRentang("2026-01", "2026-12"))).toBeNull();
    expect(hasil(validateRentang("2026-01", "2027-01"))).toBe(
      "Rentang pencarian paling lama 12 bulan.",
    );
    expect(hasil(validateRentang("2026-05", "2026-04"))).toBe(
      "Bulan awal tidak boleh sesudah bulan akhir.",
    );
    expect(hasil(validateRentang("2026-1", "2026-02"))).toBe(
      "Bulan awal dan akhir wajib berformat YYYY-MM.",
    );
  });

  test("validateAlasanBatal", () => {
    expect(hasil(validateAlasanBatal("  salah hitung "))).toBe("salah hitung");
    expect(hasil(validateAlasanBatal("   "))).toBe(
      "Alasan pembatalan wajib diisi.",
    );
    expect(hasil(validateAlasanBatal("a".repeat(201)))).toBe(
      "Alasan pembatalan maksimal 200 karakter.",
    );
  });

  test("labelRapel", () => {
    expect(labelRapel("2026-07-01")).toBe("Rapel Juli 2026");
    expect(labelRapel("2026-12-16")).toBe("Rapel Desember 2026");
    expect(labelRapel("x")).toBe("Rapel x");
  });

  test("statusRapel", () => {
    expect(statusRapel(true, "PAID")).toBe("Dibatalkan");
    expect(statusRapel(false, null)).toBe("Menunggu");
    expect(statusRapel(false, "DRAFT")).toBe("Diproses");
    expect(statusRapel(false, "PAID")).toBe("Dibayar");
  });

  test("id dan entri slip", () => {
    expect(idRapel("PR-1-K01", 22_000)).toBe("rpl-PR-1-K01-22000");
    expect(
      komponenRapel([
        { id_rapel: "rpl-x-1", jumlah: 5_000, period_start: "2026-08-01" },
      ]),
    ).toEqual([
      {
        id: "rapel-rpl-x-1",
        name: "Rapel Agustus 2026",
        category: "ALLOWANCE",
        calc_type: "RAPEL",
        rate: 0,
        nominal: 5_000,
      },
    ]);
  });
});
