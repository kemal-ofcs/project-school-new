import { z } from "zod";
import {
  isValidOperatorPhone,
  normalizeOperatorPhone,
} from "@/lib/operators/contact";

/**
 * Data peserta didik ala DAPODIK yang diisi orang tua di formulir PMB
 * (`pmb_pendaftar.data_dapodik`, JSON berversi, schema v49).
 *
 * Satu berkas untuk tiga pemakai: formulir dan validator situs publik
 * (disalin ke `web-public` oleh `sync-shared-lib.ts`), tampilan detail dan
 * ekspor di panel admin (disalin ke Mobile oleh `sync-frontend-lib.ts`).
 * Kanoniknya di `web-desktop`; jangan menyunting salinannya.
 *
 * Data ini SENGAJA tidak ikut ke `siswa_data` saat pendaftar diangkat menjadi
 * siswa: tabel itu tersalin ke setiap perangkat, termasuk terminal pemindai,
 * sedangkan NIK, No KK, dan penghasilan orang tua tidak boleh berada di sana.
 * Barisnya tetap terhubung ke siswanya lewat `pmb_pendaftar.id_siswa`.
 */

export const VERSI_DATA_DAPODIK = 1;

// Ejaan pilihan mengikuti ekspor "daftar_pd" DAPODIK yang diberikan sekolah;
// yang tidak muncul di contoh itu diambil dari referensi DAPODIK yang umum.
// Nilai di luar daftar DITOLAK, supaya ejaannya cocok saat dicocokkan.
export const AGAMA = [
  "Islam",
  "Kristen",
  "Katholik",
  "Hindu",
  "Budha",
  "Khonghucu",
  "Kepercayaan kpd Tuhan YME",
] as const;

export const JENIS_TINGGAL = [
  "Bersama orang tua",
  "Wali",
  "Kos",
  "Asrama",
  "Panti asuhan",
  "Pesantren",
  "Lainnya",
] as const;

export const ALAT_TRANSPORTASI = [
  "Jalan kaki",
  "Sepeda",
  "Sepeda motor",
  "Mobil pribadi",
  "Angkutan umum/bus/pete-pete",
  "Mobil/bus antar jemput",
  "Ojek",
  "Kereta api",
  "Andong/bendi/sado/dokar/delman/becak",
  "Perahu penyeberangan/rakit/getek",
  "Lainnya",
] as const;

export const JENJANG_PENDIDIKAN = [
  "Tidak sekolah",
  "SD / sederajat",
  "SMP / sederajat",
  "SMA / sederajat",
  "Paket A",
  "Paket B",
  "Paket C",
  "D1",
  "D2",
  "D3",
  "D4",
  "S1",
  "Profesi",
  "S2",
  "S3",
  "Lainnya",
] as const;

export const PEKERJAAN = [
  "Tidak bekerja",
  "Nelayan",
  "Petani",
  "Peternak",
  "PNS/TNI/Polri",
  "Karyawan Swasta",
  "Karyawan BUMN",
  "Pedagang Kecil",
  "Pedagang Besar",
  "Wiraswasta",
  "Wirausaha",
  "Buruh",
  "Pensiunan",
  "Tenaga Kerja Indonesia",
  "Sudah Meninggal",
  "Lainnya",
] as const;

// Belum terverifikasi terhadap aplikasi DAPODIK: hanya "Tidak Berpenghasilan"
// dan "Rp1.000.001 - Rp3.000.000" yang tercantum di contoh sekolah. Cocokkan
// dengan dropdown penghasilan di aplikasi DAPODIK lalu ubah daftar ini saja.
export const PENGHASILAN = [
  "Tidak Berpenghasilan",
  "Kurang dari Rp500.000",
  "Rp500.000 - Rp1.000.000",
  "Rp1.000.001 - Rp3.000.000",
  "Rp3.000.001 - Rp5.000.000",
  "Lebih dari Rp5.000.000",
] as const;

export const KEBUTUHAN_KHUSUS = [
  "Tidak ada",
  "Netra",
  "Rungu",
  "Grahita ringan",
  "Grahita sedang",
  "Daksa ringan",
  "Daksa sedang",
  "Laras",
  "Wicara",
  "Tuna ganda",
  "Hiperaktif",
  "Cerdas istimewa",
  "Bakat istimewa",
  "Kesulitan belajar",
  "Autis",
  "Lainnya",
] as const;

const kosongJadiNull = (nilai: unknown) =>
  typeof nilai === "string" && nilai.trim() === "" ? null : nilai;

const teks = (maks: number) =>
  z.preprocess(
    kosongJadiNull,
    z.string().trim().max(maks).nullable().default(null),
  );
const teksWajib = (maks: number, pesan: string) =>
  z.string({ error: pesan }).trim().min(1, pesan).max(maks);
// Isian lain selain yang memakai `teks` wajib diisi (keputusan User
// 2026-10-16): kosong ditolak dengan pesan isiannya, bukan disimpan null.
const pilihan = <T extends readonly [string, ...string[]]>(
  daftar: T,
  pesan: string,
) => z.preprocess(kosongJadiNull, z.enum(daftar, { error: pesan }));
const digit = (min: number, maks: number, pesan: string) =>
  z.preprocess(
    kosongJadiNull,
    z
      .string({ error: pesan })
      .trim()
      .regex(new RegExp(`^\\d{${min},${maks}}$`), pesan),
  );
const angka = (min: number, maks: number, pesan: string) =>
  z.preprocess(
    (nilai) => {
      const bersih = kosongJadiNull(nilai);
      if (typeof bersih === "string") return Number(bersih.replace(",", "."));
      return bersih;
    },
    z.number(pesan).min(min, pesan).max(maks, pesan),
  );
const yaTidak = z.preprocess(
  (nilai) =>
    nilai === "Ya" ? true : nilai === "Tidak" || nilai === "" ? false : nilai,
  z.boolean().default(false),
);
const tahunLahir = (siapa: string) =>
  angka(1900, 2100, `Tahun lahir ${siapa} wajib diisi dengan benar.`);

export const dataDapodikSchema = z
  .object({
    // Calon siswa
    nik: z
      .string({ error: "NIK calon siswa wajib diisi." })
      .trim()
      .regex(/^\d{16}$/, "NIK calon siswa harus 16 angka."),
    agama: z.enum(AGAMA, { error: "Pilih agama calon siswa." }),
    noAktaLahir: teksWajib(40, "No registrasi akta lahir wajib diisi."),
    kebutuhanKhusus: z.preprocess(
      (nilai) => kosongJadiNull(nilai) ?? "Tidak ada",
      z.enum(KEBUTUHAN_KHUSUS),
    ),
    anakKe: angka(1, 20, "Anak ke- harus 1 sampai 20."),
    jumlahSaudara: angka(0, 20, "Jumlah saudara kandung harus 0 sampai 20."),
    hpSiswa: z.preprocess(
      kosongJadiNull,
      z
        .string({ error: "Nomor HP calon siswa wajib diisi." })
        .trim()
        .refine(isValidOperatorPhone, "Nomor HP calon siswa tidak valid.")
        .transform(normalizeOperatorPhone),
    ),
    emailSiswa: z.preprocess(
      kosongJadiNull,
      z.email("Email calon siswa wajib diisi dengan benar.").max(120),
    ),

    // Alamat (jalan disimpan di kolom `alamat` yang sudah ada)
    rt: digit(1, 3, "RT berupa angka (maksimal 3)."),
    rw: digit(1, 3, "RW berupa angka (maksimal 3)."),
    dusun: teks(80),
    kelurahan: teksWajib(80, "Kelurahan/desa wajib diisi."),
    kecamatan: teksWajib(80, "Kecamatan wajib diisi."),
    kodePos: digit(5, 5, "Kode pos harus 5 angka."),
    jenisTinggal: pilihan(JENIS_TINGGAL, "Pilih tinggal bersama siapa."),
    transportasi: pilihan(ALAT_TRANSPORTASI, "Pilih alat transportasi."),
    jarakKm: angka(0, 500, "Jarak ke sekolah harus 0 sampai 500 km."),

    // Keluarga
    noKk: digit(16, 16, "Nomor KK harus 16 angka."),
    ayahNama: teksWajib(120, "Nama ayah wajib diisi."),
    ayahTahunLahir: tahunLahir("ayah"),
    ayahPendidikan: pilihan(JENJANG_PENDIDIKAN, "Pilih pendidikan ayah."),
    ayahPekerjaan: pilihan(PEKERJAAN, "Pilih pekerjaan ayah."),
    ayahPenghasilan: pilihan(PENGHASILAN, "Pilih penghasilan ayah."),
    ayahNik: digit(16, 16, "NIK ayah harus 16 angka."),
    ibuNama: teksWajib(120, "Nama ibu kandung wajib diisi."),
    ibuTahunLahir: tahunLahir("ibu"),
    ibuPendidikan: pilihan(JENJANG_PENDIDIKAN, "Pilih pendidikan ibu."),
    ibuPekerjaan: pilihan(PEKERJAAN, "Pilih pekerjaan ibu."),
    ibuPenghasilan: pilihan(PENGHASILAN, "Pilih penghasilan ibu."),
    ibuNik: digit(16, 16, "NIK ibu harus 16 angka."),
    waliNama: teksWajib(120, "Nama wali wajib diisi."),
    waliTahunLahir: tahunLahir("wali"),
    waliPendidikan: pilihan(JENJANG_PENDIDIKAN, "Pilih pendidikan wali."),
    waliPekerjaan: pilihan(PEKERJAAN, "Pilih pekerjaan wali."),
    waliPenghasilan: pilihan(PENGHASILAN, "Pilih penghasilan wali."),
    waliNik: digit(16, 16, "NIK wali harus 16 angka."),

    // Bantuan
    kps: yaTidak,
    noKps: teks(40),
    kip: yaTidak,
    noKip: teks(40),
    namaKip: teks(120),
    noKks: teks(40),

    // Periodik
    beratKg: angka(1, 200, "Berat badan harus 1 sampai 200 kg."),
    tinggiCm: angka(30, 250, "Tinggi badan harus 30 sampai 250 cm."),
  })
  .strict();

export type DataDapodik = z.output<typeof dataDapodikSchema>;
export type MasukanDataDapodik = z.input<typeof dataDapodikSchema>;

/** Nama isian formulir = kunci objek, dalam urutan skema. */
export const KUNCI_DATA_DAPODIK = Object.keys(
  dataDapodikSchema.shape,
) as (keyof DataDapodik)[];

/**
 * Baca kolom `data_dapodik`. Rusak atau kosong = `null`, bukan galat.
 *
 * `lingkarKepalaCm` dihapus dari formulir 2026-10-16; pendaftar lama masih
 * membawanya dan tetap diekspor ke kolom DAPODIK-nya.
 */
export function uraiDataDapodik(json: string | null | undefined):
  | (Partial<DataDapodik> & {
      versi?: number;
      lingkarKepalaCm?: number | null;
    })
  | null {
  if (!json) return null;
  try {
    const mentah = JSON.parse(json);
    return mentah && typeof mentah === "object" && !Array.isArray(mentah)
      ? mentah
      : null;
  } catch {
    return null;
  }
}

// ── Ekspor ────────────────────────────────────────────────────────────────

export interface PendaftarEkspor {
  nomor_pendaftaran: string;
  nama_lengkap: string;
  jenis_kelamin: string | null;
  nisn: string | null;
  tempat_lahir: string | null;
  tanggal_lahir: string | null;
  alamat: string | null;
  asal_sekolah: string | null;
  status: string;
  data_dapodik: string | null;
}

const ORANG_TUA = [
  "Nama",
  "Tahun Lahir",
  "Jenjang Pendidikan",
  "Pekerjaan",
  "Penghasilan",
  "NIK",
] as const;

/**
 * Dua baris judul ekspor, persis urutan berkas "daftar_pd" DAPODIK. Baris
 * pertama memuat "Data Ayah/Ibu/Wali" di kolom pertama kelompoknya; baris
 * kedua memuat sub-judul keenam kolomnya. Dua kolom terakhir tambahan PMB,
 * sengaja di ujung supaya urutan kolom DAPODIK tidak bergeser.
 */
export const JUDUL_EKSPOR_DAPODIK: { baris1: string[]; baris2: string[] } =
  (() => {
    const awal = [
      "No",
      "Nama",
      "NIPD",
      "JK",
      "NISN",
      "Tempat Lahir",
      "Tanggal Lahir",
      "NIK",
      "Agama",
      "Alamat",
      "RT",
      "RW",
      "Dusun",
      "Kelurahan",
      "Kecamatan",
      "Kode Pos",
      "Jenis Tinggal",
      "Alat Transportasi",
      "Telepon",
      "HP",
      "E-Mail",
      "SKHUN",
      "Penerima KPS",
      "No. KPS",
    ];
    const akhir = [
      "Rombel Saat Ini",
      "No Peserta Ujian Nasional",
      "No Seri Ijazah",
      "Penerima KIP",
      "Nomor KIP",
      "Nama di KIP",
      "Nomor KKS",
      "No Registrasi Akta Lahir",
      "Bank",
      "Nomor Rekening Bank",
      "Rekening Atas Nama",
      "Layak PIP (usulan dari sekolah)",
      "Alasan Layak PIP",
      "Kebutuhan Khusus",
      "Sekolah Asal",
      "Anak ke-berapa",
      "Lintang",
      "Bujur",
      "No KK",
      "Berat Badan",
      "Tinggi Badan",
      "Lingkar Kepala",
      "Jml. Saudara Kandung",
      "Jarak Rumah ke Sekolah (KM)",
      "No. Pendaftaran PMB",
      "Status PMB",
    ];
    const baris1 = [...awal];
    const baris2 = awal.map(() => "");
    for (const kelompok of ["Data Ayah", "Data Ibu", "Data Wali"]) {
      ORANG_TUA.forEach((sub, i) => {
        baris1.push(i === 0 ? kelompok : "");
        baris2.push(sub);
      });
    }
    baris1.push(...akhir);
    baris2.push(...akhir.map(() => ""));
    return { baris1, baris2 };
  })();

const teksSel = (nilai: unknown): string =>
  nilai === null || nilai === undefined ? "" : String(nilai);

/** `+6289...` disimpan kanonik; DAPODIK menulis `089...`. */
function hpLokal(nilai: unknown): string {
  const t = teksSel(nilai);
  return t.startsWith("+62") ? `0${t.slice(3)}` : t;
}

/** Satu baris ekspor per pendaftar, sejajar dengan `JUDUL_EKSPOR_DAPODIK`. */
export function barisEksporDapodik(
  pendaftar: PendaftarEkspor,
  nomor: number,
): string[] {
  const d = uraiDataDapodik(pendaftar.data_dapodik) ?? {};
  const orangTua = (awalan: "ayah" | "ibu" | "wali") =>
    (
      [
        "Nama",
        "TahunLahir",
        "Pendidikan",
        "Pekerjaan",
        "Penghasilan",
        "Nik",
      ] as const
    ).map((akhiran) => teksSel(d[`${awalan}${akhiran}` as keyof DataDapodik]));
  const yaTidakSel = (nilai: unknown) =>
    nilai === true ? "Ya" : nilai === false ? "Tidak" : "";
  return [
    String(nomor),
    pendaftar.nama_lengkap,
    "",
    teksSel(pendaftar.jenis_kelamin),
    teksSel(pendaftar.nisn),
    teksSel(pendaftar.tempat_lahir),
    teksSel(pendaftar.tanggal_lahir),
    teksSel(d.nik),
    teksSel(d.agama),
    teksSel(pendaftar.alamat),
    teksSel(d.rt),
    teksSel(d.rw),
    teksSel(d.dusun),
    teksSel(d.kelurahan),
    teksSel(d.kecamatan),
    teksSel(d.kodePos),
    teksSel(d.jenisTinggal),
    teksSel(d.transportasi),
    "",
    hpLokal(d.hpSiswa),
    teksSel(d.emailSiswa),
    "",
    yaTidakSel(d.kps),
    teksSel(d.noKps),
    ...orangTua("ayah"),
    ...orangTua("ibu"),
    ...orangTua("wali"),
    "",
    "",
    "",
    yaTidakSel(d.kip),
    teksSel(d.noKip),
    teksSel(d.namaKip),
    teksSel(d.noKks),
    teksSel(d.noAktaLahir),
    "",
    "",
    "",
    "",
    "",
    teksSel(d.kebutuhanKhusus),
    teksSel(pendaftar.asal_sekolah),
    teksSel(d.anakKe),
    "",
    "",
    teksSel(d.noKk),
    teksSel(d.beratKg),
    teksSel(d.tinggiCm),
    teksSel(d.lingkarKepalaCm),
    teksSel(d.jumlahSaudara),
    teksSel(d.jarakKm),
    pendaftar.nomor_pendaftaran,
    pendaftar.status,
  ];
}
