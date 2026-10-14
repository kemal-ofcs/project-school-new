import { describe, expect, test } from "bun:test";
import {
  bandingSaldo,
  cekPeriodeTerbuka,
  isianPemberitahuan,
  type KejadianTutup,
  kejadianDariRiwayat,
  kunciPemberitahuan,
  saldoTutupJson,
  validateAlasanBuka,
  validateCatatanKeputusan,
  validateTutup,
  waktuTampil,
} from "./tutup-buku";
import { DEFAULT_WA_TEMPLATES, renderWaTemplate } from "./wa-notification";

// Vektor kembar `aturan_murni_kembar` di `desktop/tutup_buku.rs`.
describe("aturan tutup buku", () => {
  test("periode terbuka dan tertutup", () => {
    expect(cekPeriodeTerbuka("2026-10-01", null)).toEqual({
      ok: true,
      value: true,
    });
    expect(cekPeriodeTerbuka("2026-10-01", "2026-09-30")).toEqual({
      ok: true,
      value: true,
    });
    expect(cekPeriodeTerbuka("2026-09-30", "2026-09-30")).toEqual({
      ok: false,
      error:
        "Tanggal 30/09/2026 masuk periode yang sudah ditutup (sampai 30/09/2026). Catat dengan tanggal sesudahnya, atau minta pemegang izin tutup buku membuka periode itu.",
    });
  });

  test("tanggal tutup buku", () => {
    expect(validateTutup(" 2026-09-30 ", null, "2026-10-14")).toEqual({
      ok: true,
      value: "2026-09-30",
    });
    expect(validateTutup("2026-09-31", null, "2026-10-14")).toEqual({
      ok: false,
      error: "Tanggal tutup buku tidak valid.",
    });
    expect(validateTutup("2026-10-14", null, "2026-10-14")).toEqual({
      ok: false,
      error: "Tanggal tutup buku harus sebelum hari ini.",
    });
    expect(validateTutup("2026-08-31", "2026-08-31", "2026-10-14")).toEqual({
      ok: false,
      error: "Buku sudah ditutup sampai 31/08/2026. Pilih tanggal sesudahnya.",
    });
  });

  test("alasan membuka kembali", () => {
    expect(validateAlasanBuka("  Salah input  ")).toEqual({
      ok: true,
      value: "Salah input",
    });
    expect(validateAlasanBuka(" ")).toEqual({
      ok: false,
      error: "Alasan membuka kembali wajib diisi.",
    });
    expect(validateAlasanBuka("a".repeat(151))).toEqual({
      ok: false,
      error: "Alasan paling banyak 150 karakter.",
    });
  });

  test("potret saldo kanonik", () => {
    expect(
      saldoTutupJson([
        { id_akun: "akun-pendapatan-spp", debit: 0, kredit: 300000 },
        { id_akun: "akun-kas", debit: 300000, kredit: 0 },
        { id_akun: "akun-bank", debit: 0, kredit: 0 },
      ]),
    ).toBe(
      '[{"id_akun":"akun-kas","debit":300000,"kredit":0},{"id_akun":"akun-pendapatan-spp","debit":0,"kredit":300000}]',
    );
    expect(saldoTutupJson([])).toBe("[]");
  });
});

test("waktu tampil", () => {
  expect(waktuTampil("2026-10-14 08:05:09")).toBe("14/10/2026 08:05:09 WIB");
  expect(waktuTampil("2026-10-14")).toBe("2026-10-14");
});

// Vektor kembar `aturan_keputusan_kembar` di `desktop/tutup_buku.rs`.
test("banding saldo dan catatan keputusan", () => {
  expect(
    bandingSaldo(
      '[{"id_akun":"akun-kas","debit":100,"kredit":0},{"id_akun":"akun-spp","debit":0,"kredit":100}]',
      '[{"id_akun":"akun-bank","debit":50,"kredit":0},{"id_akun":"akun-kas","debit":100,"kredit":0},{"id_akun":"akun-spp","debit":0,"kredit":150}]',
    ),
  ).toEqual([
    ["akun-bank", 0, 50],
    ["akun-spp", -100, -150],
  ]);
  expect(bandingSaldo("rusak", "[]")).toEqual([]);
  expect(validateCatatanKeputusan("  ")).toEqual({ ok: true, value: null });
  expect(validateCatatanKeputusan(" Cocok dengan kas ")).toEqual({
    ok: true,
    value: "Cocok dengan kas",
  });
  expect(validateCatatanKeputusan("a".repeat(151))).toEqual({
    ok: false,
    error: "Catatan paling banyak 150 karakter.",
  });
});

describe("pemberitahuan tutup buku (kembar Rust pemberitahuan_kembar)", () => {
  const riwayat = [
    {
      id_tutup: "tb-1",
      status: "Menunggu",
      sampai_tanggal: "2026-09-30",
      dibuat_oleh: "bendahara",
      perlu_ditinjau: false,
    },
    {
      id_tutup: "tb-2",
      status: "Aktif",
      sampai_tanggal: "2026-08-31",
      dibuat_oleh: "kepala",
      perlu_ditinjau: true,
    },
    {
      id_tutup: "tb-3",
      status: "Aktif",
      sampai_tanggal: "2026-07-31",
      dibuat_oleh: "kepala",
      perlu_ditinjau: false,
    },
    {
      id_tutup: "tb-4",
      status: "Dibuka",
      sampai_tanggal: "2026-06-30",
      dibuat_oleh: "kepala",
      perlu_ditinjau: false,
    },
  ];

  test("kejadian, kunci, dan teks sama dengan Rust", () => {
    const kejadian = kejadianDariRiwayat(riwayat);
    expect(kejadian.map((k) => [k.id_tutup, k.kejadian])).toEqual([
      ["tb-1", "menunggu"],
      ["tb-2", "berubah"],
    ]);
    expect(kunciPemberitahuan("tb-1", "menunggu", "7")).toBe(
      "tutup_buku:tb-1:menunggu:7",
    );
    const teks = (k: KejadianTutup, nama: string) =>
      renderWaTemplate(
        DEFAULT_WA_TEMPLATES.tutup_buku,
        isianPemberitahuan(k, nama),
      );
    const [menunggu, berubah] = kejadian as [KejadianTutup, KejadianTutup];
    expect(teks(menunggu, "Bu Sari")).toBe(
      "Yth. Bu Sari. Tutup buku sampai 30/09/2026 perlu ditinjau karena ada versi lain yang menunggu keputusan. Versi itu ditutup oleh bendahara. Buka halaman Keuangan, tab Tutup Buku, untuk memutuskan.",
    );
    expect(teks(berubah, "  ")).toBe(
      "Yth. Bapak/Ibu. Tutup buku sampai 31/08/2026 perlu ditinjau karena saldonya berubah sesudah ditutup. Ada transaksi baru di periode yang ditutup oleh kepala. Buka halaman Keuangan, tab Tutup Buku, untuk memutuskan.",
    );
  });
});
