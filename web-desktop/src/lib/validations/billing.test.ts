import { describe, expect, test } from "bun:test";
import {
  alokasiPembayaran,
  barisJurnalPembayaran,
  bulanRentang,
  formatNomorKuitansi,
  hitungPotongan,
  idTagihan,
  isianPengingat,
  type JenisTagihanDraft,
  jenisTagihanDraftSchema,
  type KeringananDraft,
  keringananBerlaku,
  keringananDraftSchema,
  labelPeriode,
  type PembayaranDraft,
  pembayaranDraftSchema,
  persenTerkumpul,
  pilihTarif,
  type TarifDraft,
  tarifDraftSchema,
  validateJenisTagihan,
  validateKeringanan,
  validatePembayaran,
  validatePeriodeTagihan,
  validateSeri,
  validateTarif,
} from "./billing";

// Vektor kembar `mod tests` di `src-tauri/src/desktop/billing.rs`.

const hasil = <T>(h: { ok: true; value: T } | { ok: false; error: string }) =>
  h.ok ? h.value : h.error;

describe("periode dan id", () => {
  test("validatePeriodeTagihan", () => {
    expect(hasil(validatePeriodeTagihan("Bulanan", "2026-07"))).toBe("2026-07");
    expect(hasil(validatePeriodeTagihan("Bulanan", "2026-7"))).toBe(
      "Periode bulanan harus berbentuk YYYY-MM.",
    );
    expect(hasil(validatePeriodeTagihan("Tahunan", " 2026/2027 "))).toBe(
      "2026/2027",
    );
    expect(hasil(validatePeriodeTagihan("Tahunan", ""))).toBe(
      "Tahun ajaran wajib dipilih.",
    );
    expect(hasil(validatePeriodeTagihan("Sekali", "apa saja"))).toBe("SEKALI");
    expect(hasil(validatePeriodeTagihan("Mingguan", "x"))).toBe(
      "Jenis periode tagihan tidak dikenal.",
    );
    expect(idTagihan("spp", "S-01", "2026-07")).toBe("tgh-spp-S-01-2026-07");
  });
});

describe("validateJenisTagihan", () => {
  const sah: JenisTagihanDraft = {
    nama: " SPP ",
    periodik: "Bulanan",
    nominal_bawaan: 300_000,
    id_akun_pendapatan: "akun-pendapatan-spp",
  };
  const galat = (ubah: Partial<JenisTagihanDraft>) =>
    hasil(
      validateJenisTagihan(jenisTagihanDraftSchema.parse({ ...sah, ...ubah })),
    );

  test("sah dan penolakan", () => {
    expect(galat({})).toEqual({
      nama: "SPP",
      periodik: "Bulanan",
      nominal_bawaan: 300_000,
      id_akun_pendapatan: "akun-pendapatan-spp",
      is_aktif: true,
    });
    expect(galat({ nama: " " })).toBe("Nama tagihan wajib diisi.");
    expect(galat({ periodik: "Mingguan" })).toBe(
      "Jenis periode tagihan tidak dikenal.",
    );
    expect(galat({ nominal_bawaan: -1 })).toBe(
      "Nominal harus rupiah bulat dan tidak negatif.",
    );
    expect(galat({ nominal_bawaan: 100_000_001 })).toBe(
      "Nominal maksimal Rp100.000.000.",
    );
    expect(galat({ id_akun_pendapatan: "" })).toBe(
      "Akun pendapatan wajib dipilih.",
    );
  });
});

describe("tarif", () => {
  const galat = (ubah: Partial<TarifDraft>) =>
    hasil(
      validateTarif(
        tarifDraftSchema.parse({
          id_jenis_tagihan: "spp",
          nama_unit: " SMP ",
          tingkat: 7,
          nominal: 500_000,
          ...ubah,
        }),
      ),
    );

  test("validateTarif", () => {
    expect(galat({})).toEqual({
      id_jenis_tagihan: "spp",
      nama_unit: "SMP",
      tingkat: 7,
      nominal: 500_000,
    });
    expect(galat({ nama_unit: "", tingkat: null })).toBe(
      "Pilih unit atau tingkat. Tarif untuk semua siswa diatur di nominal bawaan.",
    );
    expect(galat({ tingkat: 0 })).toBe("Tingkat harus bilangan 1 sampai 20.");
    expect(galat({ tingkat: 1.5 })).toBe("Tingkat harus bilangan 1 sampai 20.");
  });

  test("pilihTarif: paling spesifik menang", () => {
    const tarif = [
      { nama_unit: "SMP", tingkat: 7, nominal: 500_000 },
      { nama_unit: "smp ", tingkat: null, nominal: 450_000 },
      { nama_unit: "", tingkat: 7, nominal: 400_000 },
    ];
    expect(pilihTarif(tarif, 300_000, "SMP", 7)).toBe(500_000);
    expect(pilihTarif(tarif, 300_000, "SMP", 8)).toBe(450_000);
    expect(pilihTarif(tarif, 300_000, "SD", 7)).toBe(400_000);
    expect(pilihTarif(tarif, 300_000, "SD", 1)).toBe(300_000);
    expect(pilihTarif(tarif, 300_000, null, 7)).toBe(400_000);
    expect(pilihTarif(tarif, 300_000, " Smp ", 9)).toBe(450_000);
  });
});

describe("keringanan", () => {
  const sah: KeringananDraft = {
    id_siswa: "S-01",
    id_jenis_tagihan: "spp",
    jenis: "Persen",
    nilai: 50,
    periode_mulai: "2026-07",
    periode_selesai: "2026-12",
    alasan: " Beasiswa ",
  };
  const galat = (ubah: Partial<KeringananDraft>) =>
    hasil(validateKeringanan(keringananDraftSchema.parse({ ...sah, ...ubah })));

  test("validateKeringanan", () => {
    expect(galat({})).toEqual({
      id_siswa: "S-01",
      id_jenis_tagihan: "spp",
      jenis: "Persen",
      nilai: 50,
      periode_mulai: "2026-07",
      periode_selesai: "2026-12",
      alasan: "Beasiswa",
      is_aktif: true,
    });
    expect(galat({ jenis: "Diskon" })).toBe(
      "Jenis keringanan harus Persen atau Nominal.",
    );
    expect(galat({ nilai: 0 })).toBe(
      "Nilai keringanan harus bilangan bulat lebih dari nol.",
    );
    expect(galat({ nilai: 101 })).toBe("Keringanan persen maksimal 100.");
    expect(galat({ periode_selesai: "2026-06" })).toBe(
      "Periode selesai tidak boleh sebelum periode mulai.",
    );
    expect(galat({ alasan: "a".repeat(81) })).toBe(
      "Alasan maksimal 80 karakter.",
    );
  });

  test("keringananBerlaku", () => {
    const k = {
      jenis: "Persen",
      nilai: 50,
      periode_mulai: "2026-07",
      periode_selesai: "2026-12",
    };
    expect(keringananBerlaku(k, "Sekali", "SEKALI")).toBe(true);
    expect(keringananBerlaku(k, "Bulanan", "2026-08")).toBe(true);
    expect(keringananBerlaku(k, "Bulanan", "2026-06")).toBe(false);
    expect(keringananBerlaku(k, "Bulanan", "2027-01")).toBe(false);
    expect(
      keringananBerlaku(
        { ...k, periode_mulai: null, periode_selesai: null },
        "Tahunan",
        "2030/2031",
      ),
    ).toBe(true);
  });

  test("hitungPotongan: persen dibulatkan setengah ke atas, dibatasi nominal", () => {
    const persen = (nilai: number) => ({
      jenis: "Persen",
      nilai,
      periode_mulai: null,
      periode_selesai: null,
    });
    const nominal = (nilai: number) => ({ ...persen(nilai), jenis: "Nominal" });
    expect(hitungPotongan(350_000, [persen(15)])).toBe(52_500);
    expect(hitungPotongan(100_001, [persen(33)])).toBe(33_000);
    expect(hitungPotongan(150, [persen(1)])).toBe(2);
    expect(hitungPotongan(350_000, [persen(50), nominal(300_000)])).toBe(
      350_000,
    );
    expect(hitungPotongan(350_000, [])).toBe(0);
  });
});

describe("pembayaran", () => {
  test("nomor kuitansi dan seri", () => {
    expect(formatNomorKuitansi("2026", "TU1", 7)).toBe("KWT/2026/TU1/0007");
    expect(formatNomorKuitansi("2026", "WEB", 12345)).toBe(
      "KWT/2026/WEB/12345",
    );
    expect(hasil(validateSeri(" tu1 "))).toBe("TU1");
    expect(hasil(validateSeri("A"))).toBe(
      "Seri harus 2 sampai 8 huruf atau angka.",
    );
    expect(hasil(validateSeri("TU-1"))).toBe(
      "Seri harus 2 sampai 8 huruf atau angka.",
    );
    expect(hasil(validateSeri("ABCDEFGHI"))).toBe(
      "Seri harus 2 sampai 8 huruf atau angka.",
    );
    expect(hasil(validateSeri("web"))).toBe("Seri WEB dipakai aplikasi Web.");
  });

  const sah: PembayaranDraft = {
    id_siswa: " S-01 ",
    tanggal: "2026-07-15",
    metode: "Tunai",
    total: 500_000,
    id_akun_kas: "akun-kas",
    keterangan: " Titip kakak ",
    id_tagihan: ["t2", " t1 ", "t2", ""],
  };
  const galat = (ubah: Partial<PembayaranDraft>) =>
    hasil(validatePembayaran(pembayaranDraftSchema.parse({ ...sah, ...ubah })));

  test("validatePembayaran", () => {
    expect(galat({})).toEqual({
      id_siswa: "S-01",
      tanggal: "2026-07-15",
      metode: "Tunai",
      total: 500_000,
      id_akun_kas: "akun-kas",
      keterangan: "Titip kakak",
      id_tagihan: ["t2", "t1"],
    });
    expect(galat({ id_siswa: " " })).toBe("Siswa wajib dipilih.");
    expect(galat({ tanggal: "2026-02-30" })).toBe(
      "Tanggal pembayaran tidak valid.",
    );
    expect(galat({ metode: "QRIS" })).toBe("Metode pembayaran tidak dikenal.");
    expect(galat({ total: 0 })).toBe(
      "Jumlah bayar harus rupiah bulat lebih dari nol.",
    );
    expect(galat({ total: 1.5 })).toBe(
      "Jumlah bayar harus rupiah bulat lebih dari nol.",
    );
    expect(galat({ total: 100_000_001 })).toBe(
      "Jumlah bayar maksimal Rp100.000.000.",
    );
    expect(galat({ id_akun_kas: " " })).toBe("Akun penerima wajib dipilih.");
    expect(galat({ keterangan: "a".repeat(151) })).toBe(
      "Keterangan maksimal 150 karakter.",
    );
    expect(
      galat({ id_tagihan: Array.from({ length: 101 }, (_, i) => `t${i}`) }),
    ).toBe("Satu kuitansi paling banyak 100 tagihan.");
    expect(galat({ metode: "Titipan", id_tagihan: [] })).toBe(
      "Pilih tagihan yang dibayar dari titipan.",
    );
    expect(galat({ metode: "Titipan", id_akun_kas: "akun-kas" })).toEqual({
      id_siswa: "S-01",
      tanggal: "2026-07-15",
      metode: "Titipan",
      total: 500_000,
      id_akun_kas: null,
      keterangan: "Titip kakak",
      id_tagihan: ["t2", "t1"],
    });
  });

  test("alokasiPembayaran: jatuh tempo terlama dulu, kelebihan ke titipan", () => {
    const tagihan = [
      {
        id_tagihan: "b",
        jatuh_tempo: "2026-08-10",
        periode: "2026-08",
        sisa: 300_000,
      },
      {
        id_tagihan: "a",
        jatuh_tempo: "2026-07-10",
        periode: "2026-07",
        sisa: 150_000,
      },
      {
        id_tagihan: "c",
        jatuh_tempo: "2026-07-10",
        periode: "2026-07",
        sisa: 0,
      },
      {
        id_tagihan: "d",
        jatuh_tempo: "2026-07-10",
        periode: "2026-06",
        sisa: 100_000,
      },
    ];
    expect(alokasiPembayaran(tagihan, 400_000)).toEqual({
      alokasi: [
        { id_tagihan: "d", nominal: 100_000 },
        { id_tagihan: "a", nominal: 150_000 },
        { id_tagihan: "b", nominal: 150_000 },
      ],
      titipan: 0,
    });
    expect(alokasiPembayaran(tagihan, 600_000).titipan).toBe(50_000);
    expect(alokasiPembayaran([], 75_000)).toEqual({
      alokasi: [],
      titipan: 75_000,
    });
  });

  test("barisJurnalPembayaran", () => {
    expect(barisJurnalPembayaran("Tunai", "akun-kas", 550_000, 50_000)).toEqual(
      [
        { id_akun: "akun-kas", debit: 600_000, kredit: 0 },
        { id_akun: "akun-piutang-siswa", debit: 0, kredit: 550_000 },
        { id_akun: "akun-titipan-wali", debit: 0, kredit: 50_000 },
      ],
    );
    expect(barisJurnalPembayaran("Transfer", "akun-bank", 0, 75_000)).toEqual([
      { id_akun: "akun-bank", debit: 75_000, kredit: 0 },
      { id_akun: "akun-titipan-wali", debit: 0, kredit: 75_000 },
    ]);
    expect(barisJurnalPembayaran("Titipan", null, 40_000, 0)).toEqual([
      { id_akun: "akun-titipan-wali", debit: 40_000, kredit: 0 },
      { id_akun: "akun-piutang-siswa", debit: 0, kredit: 40_000 },
    ]);
  });
});

// Vektor kembar `isian_pengingat_kembar` di `desktop/billing.rs`.
describe("isian pengingat tagihan", () => {
  const NL = String.fromCharCode(10);
  const tp = (
    nama_tagihan: string,
    periode: string,
    jatuh_tempo: string,
    sisa: number,
  ) => ({ nama_tagihan, periode, jatuh_tempo, sisa });

  test("label periode", () => {
    expect(labelPeriode("2026-09")).toBe("September 2026");
    expect(labelPeriode("2026-13")).toBe("2026-13");
    expect(labelPeriode("2026/2027")).toBe("2026/2027");
    expect(labelPeriode("SEKALI")).toBe("");
  });

  test("rincian, total, dan jatuh tempo terawal", () => {
    expect(
      isianPengingat([
        tp("SPP", "2026-08", "2026-08-10", 150_000),
        tp("Seragam", "SEKALI", "", 275_000),
      ]),
    ).toEqual({
      total: "Rp425.000",
      jumlah: "2",
      rincian: `- SPP Agustus 2026: Rp150.000${NL}- Seragam: Rp275.000`,
      jatuh_tempo: "10/08/2026",
    });
    const tujuh = [1, 2, 3, 4, 5, 6, 7].map((bulan) =>
      tp("SPP", `2026-0${bulan}`, `2026-0${bulan}-10`, 100_000),
    );
    expect(isianPengingat(tujuh)).toEqual({
      total: "Rp700.000",
      jumlah: "7",
      rincian: [
        "- SPP Januari 2026: Rp100.000",
        "- SPP Februari 2026: Rp100.000",
        "- SPP Maret 2026: Rp100.000",
        "- SPP April 2026: Rp100.000",
        "- SPP Mei 2026: Rp100.000",
        "- dan 2 tagihan lain",
      ].join(NL),
      jatuh_tempo: "10/01/2026",
    });
    expect(isianPengingat([]).jatuh_tempo).toBe("-");
  });
});

// Vektor kembar `persen_dan_rentang_bulan_kembar` di `desktop/billing.rs`.
describe("persen terkumpul dan rentang bulan", () => {
  test("persen bulat setengah ke atas", () => {
    expect(persenTerkumpul(1, 3)).toBe(33);
    expect(persenTerkumpul(2, 3)).toBe(67);
    expect(persenTerkumpul(1, 8)).toBe(13);
    expect(persenTerkumpul(5, 0)).toBe(0);
  });

  test("dua belas bulan dan batas atasnya", () => {
    const hasil = bulanRentang("2026-07");
    if (!hasil.ok) throw new Error(hasil.error);
    expect(hasil.value.bulan[0]).toBe("2026-07");
    expect(hasil.value.bulan[11]).toBe("2027-06");
    expect(hasil.value.bulan.length).toBe(12);
    expect(hasil.value.sesudah).toBe("2027-07");
    const januari = bulanRentang("2026-01");
    expect(januari.ok && januari.value.sesudah).toBe("2027-01");
    for (const salah of ["2026-13", "2026-7", "26-07", "abcd-ef"]) {
      expect(bulanRentang(salah)).toEqual({
        ok: false,
        error: "Bulan awal harus berbentuk YYYY-MM.",
      });
    }
  });
});
