import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type KeadaanPendaftarPmb,
  rupiahPmb,
  SQL_KEADAAN_BAYAR_PMB,
  SQL_MEMAKAN_KUOTA_PMB,
  tolakBatalBayarPmb,
  tolakKonfirmasiBayarPmb,
  tolakPerpanjangBayarPmb,
  tolakUbahStatusPmb,
} from "./pmb-pembayaran";

// Vektor kembar `mod tests` di `src-tauri/src/desktop/pmb_bayar.rs`.

const p = (status: string, keadaan: string): KeadaanPendaftarPmb => ({
  status,
  keadaan,
  biayaTagihan: 150000,
  hariIni: "2026-10-15",
});

describe("pmb-pembayaran", () => {
  test("rupiah titik ribuan", () => {
    expect(rupiahPmb(0)).toBe("0");
    expect(rupiahPmb(999)).toBe("999");
    expect(rupiahPmb(150000)).toBe("150.000");
    expect(rupiahPmb(1250000)).toBe("1.250.000");
  });

  test("ubah status saat belum lunas", () => {
    expect(
      tolakUbahStatusPmb("Menunggu Pembayaran", "Diterima"),
    ).not.toBeNull();
    expect(tolakUbahStatusPmb("Kedaluwarsa", "Berkas Lengkap")).not.toBeNull();
    expect(tolakUbahStatusPmb("Menunggu Pembayaran", "Ditolak")).toBeNull();
    expect(tolakUbahStatusPmb("Kedaluwarsa", "Dibatalkan")).toBeNull();
    expect(tolakUbahStatusPmb("Menunggu Pembayaran", "Baru")).toBeNull();
    expect(tolakUbahStatusPmb("Lunas", "Diterima")).toBeNull();
    expect(tolakUbahStatusPmb("Tanpa biaya", "Terverifikasi")).toBeNull();
  });

  test("konfirmasi bayar", () => {
    const menunggu = p("Baru", "Menunggu Pembayaran");
    const bayar = (q: KeadaanPendaftarPmb, jumlah: number, tanggal: string) =>
      tolakKonfirmasiBayarPmb(q, { jumlah, tanggal });
    expect(bayar(menunggu, 150000, "2026-10-15")).toBeNull();
    expect(bayar(menunggu, 100000, "2026-10-15")).toBe(
      "Jumlah bayar harus sama dengan biaya pendaftaran, Rp150.000.",
    );
    expect(bayar(menunggu, 150000, "2026-10-16")).toBe(
      "Tanggal bayar tidak boleh melewati hari ini.",
    );
    expect(bayar(p("Baru", "Kedaluwarsa"), 150000, "2026-10-15")).toBe(
      "Batas bayar sudah lewat. Perpanjang batas bayarnya lebih dulu.",
    );
    expect(bayar(p("Baru", "Lunas"), 150000, "2026-10-15")).toBe(
      "Pembayaran pendaftar ini sudah tercatat.",
    );
    expect(
      bayar(p("Ditolak", "Menunggu Pembayaran"), 150000, "2026-10-15"),
    ).toBe("Pendaftar berstatus 'Ditolak' tidak dapat dicatat pembayarannya.");
    expect(bayar(p("Baru", "Tanpa biaya"), 150000, "2026-10-15")).toBe(
      "Pendaftar ini tidak dikenai biaya pendaftaran.",
    );
  });

  test("batal bayar", () => {
    expect(tolakBatalBayarPmb(p("Baru", "Lunas"))).toBeNull();
    expect(tolakBatalBayarPmb(p("Diterima", "Lunas"))).toBe(
      "Pembayaran hanya bisa dibatalkan selama status pendaftar masih 'Baru'.",
    );
    expect(tolakBatalBayarPmb(p("Baru", "Menunggu Pembayaran"))).toBe(
      "Pendaftar ini belum punya pembayaran yang tercatat.",
    );
  });

  test("perpanjang bayar", () => {
    const perpanjang = (
      q: KeadaanPendaftarPmb,
      penuh: boolean,
      batas: string,
    ) => tolakPerpanjangBayarPmb({ ...q, kuotaPenuh: penuh }, batas);
    expect(
      perpanjang(p("Baru", "Kedaluwarsa"), false, "2026-10-20"),
    ).toBeNull();
    expect(
      perpanjang(p("Baru", "Menunggu Pembayaran"), true, "2026-10-15"),
    ).toBeNull();
    expect(perpanjang(p("Baru", "Kedaluwarsa"), true, "2026-10-20")).toBe(
      "Kuota gelombang penuh. Naikkan kuota atau tolak pendaftar lain lebih dulu.",
    );
    expect(perpanjang(p("Baru", "Kedaluwarsa"), false, "2026-10-14")).toBe(
      "Batas bayar baru tidak boleh sebelum hari ini.",
    );
    expect(perpanjang(p("Baru", "Lunas"), false, "2026-10-20")).toBe(
      "Pembayaran sudah tercatat; batas bayar tidak perlu diubah.",
    );
    expect(perpanjang(p("Baru", "Tanpa biaya"), false, "2026-10-20")).toBe(
      "Pendaftar ini tidak dikenai biaya pendaftaran.",
    );
    expect(perpanjang(p("Terdaftar", "Kedaluwarsa"), false, "2026-10-20")).toBe(
      "Pendaftar berstatus 'Terdaftar' tidak dapat diubah batas bayarnya.",
    );
  });

  // Salinan Mobile dan web-public tidak membawa berkas Rust; di sana uji ini
  // dilewati, sumbernya tetap diuji di web-desktop.
  const berkasRust = join(
    import.meta.dir,
    "../../../src-tauri/src/desktop/pmb_bayar.rs",
  );
  let rust = "";
  try {
    rust = readFileSync(berkasRust, "utf8");
  } catch {
    rust = "";
  }

  test.skipIf(!rust)("konstanta SQL dieja sama persis di pmb_bayar.rs", () => {
    for (const sql of [SQL_MEMAKAN_KUOTA_PMB, SQL_KEADAAN_BAYAR_PMB]) {
      expect(rust).toContain(`"${sql}"`);
    }
  });
});
