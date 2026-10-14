import { describe, expect, test } from "bun:test";
import {
  barisEksporDapodik,
  dataDapodikSchema,
  JUDUL_EKSPOR_DAPODIK,
  KUNCI_DATA_DAPODIK,
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
  lingkarKepalaCm: "",
};

describe("dataDapodikSchema", () => {
  test("isian contoh lolos dan dinormalkan", () => {
    const hasil = dataDapodikSchema.parse(ISIAN_CONTOH);
    expect(hasil.anakKe).toBe(1);
    expect(hasil.jarakKm).toBe(0);
    expect(hasil.hpSiswa).toBe("+6289653357571");
    expect(hasil.emailSiswa).toBeNull();
    expect(hasil.kps).toBe(false);
    expect(hasil.lingkarKepalaCm).toBeNull();
    expect(Object.keys(hasil)).toEqual(KUNCI_DATA_DAPODIK);
  });

  test("isian wajib dan pilihan asing ditolak", () => {
    const tanpaWajib = dataDapodikSchema.safeParse({
      ...ISIAN_CONTOH,
      nik: "123",
      ibuNama: "",
      kelurahan: " ",
    });
    expect(tanpaWajib.success).toBe(false);
    const pesan = tanpaWajib.error?.issues.map((i) => i.message) ?? [];
    expect(pesan).toContain("NIK calon siswa harus 16 angka.");
    expect(pesan).toContain("Nama ibu kandung wajib diisi.");
    expect(pesan).toContain("Kelurahan/desa wajib diisi.");

    expect(
      dataDapodikSchema.safeParse({ ...ISIAN_CONTOH, agama: "islam" }).success,
    ).toBe(false);
    expect(
      dataDapodikSchema.safeParse({ ...ISIAN_CONTOH, rt: "0002" }).success,
    ).toBe(false);
    expect(
      dataDapodikSchema.safeParse({ ...ISIAN_CONTOH, kunciAsing: "x" }).success,
    ).toBe(false);
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
    const data = dataDapodikSchema.parse(ISIAN_CONTOH);
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
