import { describe, expect, test } from "bun:test";
import {
  hitungPotongan,
  idTagihan,
  type JenisTagihanDraft,
  jenisTagihanDraftSchema,
  type KeringananDraft,
  keringananBerlaku,
  keringananDraftSchema,
  pilihTarif,
  type TarifDraft,
  tarifDraftSchema,
  validateJenisTagihan,
  validateKeringanan,
  validatePeriodeTagihan,
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
