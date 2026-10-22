import { describe, expect, test } from "bun:test";
import {
  barisEksporDapodik,
  dataDapodikSchema,
  isianWajibDapodik,
  JUDUL_EKSPOR_DAPODIK,
  KUNCI_DATA_DAPODIK,
  PEKERJAAN_MENINGGAL,
} from "./pmb-dapodik";

// Satu baris dari ekspor "daftar_pd" DAPODIK yang diberikan sekolah
// (Devina Assifa), dalam bentuk isian formulir PMB.
const ISIAN_CONTOH = {
  nik: "3216066612070011",
  agama: "Islam",
  noAktaLahir: "AL621120368",
  kebutuhanKhusus: "Tidak ada",
  anakKe: "1",
  jumlahSaudara: "3",
  hpSiswa: "089653357571",
  emailSiswa: "",
  rt: "2",
  rw: "6",
  dusun: "",
  kelurahan: "Setiamekar",
  kecamatan: "Kec. Tambun Selatan",
  kodePos: "17510",
  jenisTinggal: "Bersama orang tua",
  transportasi: "Jalan kaki",
  jarakKm: "0",
  noKk: "",
  ayahNama: "Iwan Umar Setiawan",
  ayahTahunLahir: "1975",
  ayahPendidikan: "SMP / sederajat",
  ayahPekerjaan: "Buruh",
  ayahPenghasilan: "Rp1.000.001 - Rp3.000.000",
  ayahNik: "3216061408850004",
  ibuNama: "Roepah",
  ibuTahunLahir: "1978",
  ibuPendidikan: "SMA / sederajat",
  ibuPekerjaan: "Tidak bekerja",
  ibuPenghasilan: "Tidak Berpenghasilan",
  ibuNik: "3216066209900018",
  waliNama: "Iwan Umar Setiawan",
  waliTahunLahir: "1975",
  waliPendidikan: "SMP / sederajat",
  waliPekerjaan: "Buruh",
  waliPenghasilan: "Rp1.000.001 - Rp3.000.000",
  waliNik: "",
  kps: "Tidak",
  noKps: "",
  kip: "Tidak",
  noKip: "",
  namaKip: "",
  noKks: "",
  beratKg: "60",
  tinggiCm: "150",
};

// Baris asli di atas mengosongkan tiga isian yang kini wajib di formulir.
const ISIAN_LENGKAP = {
  ...ISIAN_CONTOH,
  emailSiswa: "devina@example.com",
  noKk: "3216060101070001",
  waliNik: "3216061408850004",
};

describe("dataDapodikSchema", () => {
  test("isian contoh lolos dan dinormalkan", () => {
    const hasil = dataDapodikSchema.parse(ISIAN_LENGKAP);
    expect(hasil.anakKe).toBe(1);
    expect(hasil.jarakKm).toBe(0);
    expect(hasil.hpSiswa).toBe("+6289653357571");
    expect(hasil.dusun).toBeNull();
    expect(hasil.kps).toBe(false);
    expect(Object.keys(hasil)).toEqual(KUNCI_DATA_DAPODIK);
    expect(KUNCI_DATA_DAPODIK).not.toContain("lingkarKepalaCm");
  });

  test("isian wajib dan pilihan asing ditolak", () => {
    const tanpaWajib = dataDapodikSchema.safeParse({
      ...ISIAN_LENGKAP,
      nik: "123",
      ibuNama: "",
      kelurahan: " ",
      rt: "",
      tinggiCm: "",
      emailSiswa: "",
    });
    expect(tanpaWajib.success).toBe(false);
    const pesan = tanpaWajib.error?.issues.map((i) => i.message) ?? [];
    expect(pesan).toContain("NIK calon siswa harus 16 angka.");
    expect(pesan).toContain("Nama ibu kandung wajib diisi.");
    expect(pesan).toContain("Kelurahan/desa wajib diisi.");
    expect(pesan).toContain("RT berupa angka (maksimal 3).");
    expect(pesan).toContain("Tinggi badan harus 30 sampai 250 cm.");
    expect(pesan).toContain("Email calon siswa wajib diisi dengan benar.");

    // Isian contoh asli (email, No KK, NIK wali kosong) kini ditolak.
    expect(dataDapodikSchema.safeParse(ISIAN_CONTOH).success).toBe(false);
    expect(
      dataDapodikSchema.safeParse({ ...ISIAN_LENGKAP, agama: "islam" }).success,
    ).toBe(false);
    expect(
      dataDapodikSchema.safeParse({ ...ISIAN_LENGKAP, rt: "0002" }).success,
    ).toBe(false);
    expect(
      dataDapodikSchema.safeParse({ ...ISIAN_LENGKAP, kunciAsing: "x" })
        .success,
    ).toBe(false);
    expect(
      dataDapodikSchema.safeParse({ ...ISIAN_LENGKAP, lingkarKepalaCm: "50" })
        .success,
    ).toBe(false);
  });
});

// Keputusan User 2026-10-22: NIK orang tua opsional, orang tua yang meninggal
// dan ayah yang tidak diketahui, wali hanya lengkap bila tinggal bersama wali.
describe("isian orang tua bersyarat", () => {
  const pesanDari = (isian: Record<string, unknown>) =>
    dataDapodikSchema
      .safeParse({ ...ISIAN_LENGKAP, ...isian })
      .error?.issues.map((i) => i.message) ?? [];

  test("NIK orang tua boleh kosong, tetapi bila diisi harus 16 angka", () => {
    expect(pesanDari({ ayahNik: "", ibuNik: "", waliNik: "" })).toEqual([]);
    expect(pesanDari({ ibuNik: "123" })).toEqual(["NIK ibu harus 16 angka."]);
  });

  test("pekerjaan ayah tetap wajib bila nama ayah diisi", () => {
    expect(pesanDari({ ayahPekerjaan: "" })).toEqual(["Pilih pekerjaan ayah."]);
  });

  test("orang tua yang meninggal: penghasilan diisikan, pendidikan opsional", () => {
    const hasil = dataDapodikSchema.parse({
      ...ISIAN_LENGKAP,
      ayahPekerjaan: PEKERJAAN_MENINGGAL,
      ayahPenghasilan: "",
      ayahPendidikan: "",
      ayahNik: "",
    });
    expect(hasil.ayahPenghasilan).toBe("Tidak Berpenghasilan");
    expect(hasil.ayahPendidikan).toBeNull();
    expect(
      pesanDari({ ayahPekerjaan: PEKERJAAN_MENINGGAL, ayahTahunLahir: "" }),
    ).toEqual(["Tahun lahir ayah wajib diisi dengan benar."]);
  });

  test("ayah tidak diketahui: seluruh isian ayah boleh kosong", () => {
    expect(
      pesanDari({
        ayahNama: "",
        ayahTahunLahir: "",
        ayahPendidikan: "",
        ayahPekerjaan: "",
        ayahPenghasilan: "",
        ayahNik: "",
      }),
    ).toEqual([]);
    expect(pesanDari({ ibuNama: "" })).toContain(
      "Nama ibu kandung wajib diisi.",
    );
  });

  test("isian wali selain nama wajib hanya bila tinggal bersama wali", () => {
    const waliKosong = {
      waliTahunLahir: "",
      waliPendidikan: "",
      waliPekerjaan: "",
      waliPenghasilan: "",
    };
    expect(pesanDari(waliKosong)).toEqual([]);
    expect(pesanDari({ ...waliKosong, jenisTinggal: "Wali" })).toEqual([
      "Tahun lahir wali wajib diisi dengan benar.",
      "Pilih pekerjaan wali.",
      "Pilih pendidikan wali.",
      "Pilih penghasilan wali.",
    ]);
  });

  test("isianWajibDapodik tidak pernah memuat NIK orang tua", () => {
    const wajib = isianWajibDapodik({ ayahNama: "x", jenisTinggal: "Wali" });
    expect(wajib).not.toContain("ayahNik");
    expect(wajib).not.toContain("ibuNik");
    expect(wajib).not.toContain("waliNik");
    expect(wajib).toContain("waliPendidikan");
  });
});

describe("ekspor format DAPODIK", () => {
  test("judul dua baris mengikuti berkas DAPODIK", () => {
    const { baris1, baris2 } = JUDUL_EKSPOR_DAPODIK;
    expect(baris1.length).toBe(baris2.length);
    expect(baris1.slice(0, 5)).toEqual(["No", "Nama", "NIPD", "JK", "NISN"]);
    expect(baris1[24]).toBe("Data Ayah");
    expect(baris1[30]).toBe("Data Ibu");
    expect(baris1[36]).toBe("Data Wali");
    expect(baris2.slice(24, 30)).toEqual([
      "Nama",
      "Tahun Lahir",
      "Jenjang Pendidikan",
      "Pekerjaan",
      "Penghasilan",
      "NIK",
    ]);
    expect(baris1.at(-3)).toBe("Jarak Rumah ke Sekolah (KM)");
  });

  test("baris contoh sama dengan baris DAPODIK aslinya", () => {
    // Tiga isian yang kosong di berkas asli dikosongkan lagi supaya barisnya
    // tetap bisa dibandingkan dengan baris DAPODIK aslinya.
    const data = {
      ...dataDapodikSchema.parse(ISIAN_LENGKAP),
      emailSiswa: null,
      noKk: null,
      waliNik: null,
    };
    const baris = barisEksporDapodik(
      {
        nomor_pendaftaran: "PMB-2026-ACDEFG",
        nama_lengkap: "Devina Assifa",
        jenis_kelamin: "P",
        nisn: "0072120846",
        tempat_lahir: "Bekasi",
        tanggal_lahir: "2007-12-26",
        alamat: "Papan Mas Blok F 53/12",
        asal_sekolah: "SMP MEKARSARI 01",
        status: "Diterima",
        data_dapodik: JSON.stringify({ versi: 1, ...data }),
      },
      17,
    );
    // Baris asli dari berkas sekolah. Kolom yang diisi sekolah, bukan orang
    // tua (NIPD, rombel, lintang/bujur, layak PIP), dikosongkan, begitu pula
    // lingkar kepala yang di berkas asli bernilai 0 (belum diukur); penghasilan
    // wali di berkas asli memakai tanda pisah panjang, di sini tanda hubung.
    const asli =
      "17\tDevina Assifa\t\tP\t0072120846\tBekasi\t2007-12-26\t3216066612070011\tIslam\tPapan Mas Blok F 53/12\t2\t6\t\tSetiamekar\tKec. Tambun Selatan\t17510\tBersama orang tua\tJalan kaki\t\t089653357571\t\t\tTidak\t\tIwan Umar Setiawan\t1975\tSMP / sederajat\tBuruh\tRp1.000.001 - Rp3.000.000\t3216061408850004\tRoepah\t1978\tSMA / sederajat\tTidak bekerja\tTidak Berpenghasilan\t3216066209900018\tIwan Umar Setiawan\t1975\tSMP / sederajat\tBuruh\tRp1.000.001 - Rp3.000.000\t\t\t\t\tTidak\t\t\t\tAL621120368\t\t\t\t\t\tTidak ada\tSMP MEKARSARI 01\t1\t\t\t\t60\t150\t\t3\t0".split(
        "\t",
      );
    expect(baris.length).toBe(JUDUL_EKSPOR_DAPODIK.baris1.length);
    expect(baris.slice(0, asli.length)).toEqual(asli);
    expect(baris.slice(asli.length)).toEqual(["PMB-2026-ACDEFG", "Diterima"]);
  });
});
