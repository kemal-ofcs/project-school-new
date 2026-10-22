import { z } from "zod";
import {
  isValidOperatorEmail,
  normalizeOperatorEmail,
} from "@/lib/operators/contact";
import {
  type DataDapodik,
  dataDapodikSchema,
  KUNCI_DATA_DAPODIK,
  uraiDataDapodik,
} from "./pmb-dapodik";

/**
 * Data DAPODIK per siswa (`siswa_dapodik`, schema v57).
 *
 * Tabelnya cloud-only seperti `pmb_pendaftar`: NIK, No KK, dan penghasilan
 * orang tua tidak boleh tersalin ke SQLite setiap perangkat, termasuk
 * terminal pemindai. Barisnya lahir dari formulir PMB saat pendaftar diangkat
 * menjadi siswa (`SQL_SALIN_DAPODIK_PMB`), lalu diubah admin dari /siswa;
 * `pmb_pendaftar` tetap arsip formulir aslinya.
 *
 * Berbeda dari formulir PMB, admin boleh menyimpan data yang belum lengkap
 * (siswa lama diisi bertahap); kekurangannya ditampilkan lewat
 * `isianKurangDapodik`. Nilai pilihan yang asing tetap ditolak.
 *
 * Kembaran Rust: `desktop/siswa_dapodik.rs`, diuji dengan vektor yang sama di
 * `siswa-dapodik.vektor.json`.
 */

export interface BarisDapodikSiswa {
  id_siswa: string;
  tempat_lahir: string | null;
  tanggal_lahir: string | null;
  sekolah_asal: string | null;
  data_dapodik: string | null;
  diubah_oleh: string | null;
  updated_at: string | null;
}

// Dieja sama persis di `siswa_dapodik.rs`; `siswa-dapodik.test.ts` memeriksanya.
export const SQL_SALIN_DAPODIK_PMB =
  "INSERT OR IGNORE INTO siswa_dapodik (id_siswa, tempat_lahir, tanggal_lahir, sekolah_asal, data_dapodik, diubah_oleh, created_at, updated_at) SELECT id_siswa, tempat_lahir, tanggal_lahir, asal_sekolah, data_dapodik, 'PMB', datetime('now', '+7 hours'), datetime('now', '+7 hours') FROM pmb_pendaftar WHERE status = 'Terdaftar' AND TRIM(COALESCE(id_siswa, '')) <> ''";

// Siswa yang dibuat offline di Desktop belum ada di cloud sampai tersinkron;
// `WHERE EXISTS` menolak baris yatim alih-alih menyimpannya.
export const SQL_SIMPAN_DAPODIK_SISWA =
  "INSERT INTO siswa_dapodik (id_siswa, tempat_lahir, tanggal_lahir, sekolah_asal, data_dapodik, diubah_oleh, created_at, updated_at) SELECT ?, ?, ?, ?, ?, ?, datetime('now', '+7 hours'), datetime('now', '+7 hours') WHERE EXISTS (SELECT 1 FROM siswa_data WHERE id_siswa = ?) ON CONFLICT(id_siswa) DO UPDATE SET tempat_lahir = excluded.tempat_lahir, tanggal_lahir = excluded.tanggal_lahir, sekolah_asal = excluded.sekolah_asal, data_dapodik = excluded.data_dapodik, diubah_oleh = excluded.diubah_oleh, updated_at = excluded.updated_at";

// Mengosongkan, bukan DELETE: baris yang hilang akan diisi ulang dari PMB oleh
// salinan berikutnya, sedangkan baris kosong dibiarkan `INSERT OR IGNORE`.
export const SQL_KOSONGKAN_DAPODIK_SISWA =
  "UPDATE siswa_dapodik SET tempat_lahir = NULL, tanggal_lahir = NULL, sekolah_asal = NULL, data_dapodik = NULL, diubah_oleh = ?, updated_at = datetime('now', '+7 hours') WHERE id_siswa = ?";

export const PESAN_SISWA_BELUM_DI_CLOUD =
  "Siswa ini belum ada di database cloud. Jalankan sinkronisasi, lalu simpan lagi.";

/** Batas id per permintaan baca, sama dengan `MAKS_ID_BACA` di Rust. */
export const MAKS_ID_BACA_DAPODIK = 200;

const tanpaKosong = (nilai: unknown) =>
  nilai && typeof nilai === "object" && !Array.isArray(nilai)
    ? Object.fromEntries(
        Object.entries(nilai).filter(
          ([, isi]) =>
            isi !== null &&
            isi !== undefined &&
            !(typeof isi === "string" && isi.trim() === ""),
        ),
      )
    : nilai;

const PESAN_LINGKAR = "Lingkar kepala harus 1 sampai 100 cm.";

/**
 * Isian DAPODIK versi admin: semua opsional, kosong dibuang. Email memakai
 * aturan email operator karena aturan itu yang punya kembaran Rust.
 */
export const dataDapodikSiswaSchema = z.preprocess(
  tanpaKosong,
  dataDapodikSchema.partial().extend({
    emailSiswa: z
      .string()
      .trim()
      .refine(isValidOperatorEmail, "Email siswa tidak valid.")
      .transform(normalizeOperatorEmail)
      .optional(),
    // Dihapus dari formulir PMB, tetapi tetap kolom DAPODIK.
    lingkarKepalaCm: z
      .preprocess(
        (nilai) =>
          typeof nilai === "string" ? Number(nilai.replace(",", ".")) : nilai,
        z.number(PESAN_LINGKAR).min(1, PESAN_LINGKAR).max(100, PESAN_LINGKAR),
      )
      .optional(),
  }),
);

const teksOpsional = (maks: number, pesan: string) =>
  z.preprocess(
    (nilai) =>
      typeof nilai === "string" && nilai.trim() === "" ? null : nilai,
    z.string().trim().max(maks, pesan).nullable().default(null),
  );

function tanggalSah(teks: string): boolean {
  const cocok = /^(\d{4})-(\d{2})-(\d{2})$/.exec(teks);
  if (!cocok) return false;
  const [tahun, bulan, hari] = cocok.slice(1).map(Number);
  if (tahun < 1900 || bulan < 1 || bulan > 12 || hari < 1) return false;
  const kabisat = (tahun % 4 === 0 && tahun % 100 !== 0) || tahun % 400 === 0;
  const jumlahHari = [
    31,
    kabisat ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  return hari <= jumlahHari[bulan - 1];
}

export const simpanDapodikSiswaSchema = z
  .object({
    idSiswa: z
      .string({ error: "Siswa tidak dikenal." })
      .trim()
      .min(1, "Siswa tidak dikenal.")
      .max(80, "Siswa tidak dikenal."),
    tempatLahir: teksOpsional(80, "Tempat lahir maksimal 80 karakter."),
    tanggalLahir: z.preprocess(
      (nilai) =>
        typeof nilai === "string" && nilai.trim() === "" ? null : nilai,
      z
        .string()
        .trim()
        .refine(tanggalSah, "Tanggal lahir tidak valid.")
        .nullable()
        .default(null),
    ),
    sekolahAsal: teksOpsional(120, "Sekolah asal maksimal 120 karakter."),
    data: dataDapodikSiswaSchema,
  })
  .strict();

export type SimpanDapodikSiswa = z.output<typeof simpanDapodikSiswaSchema>;

/**
 * Validasi permintaan simpan; pesan galatnya pesan isian pertama yang salah.
 * Kembaran `siswa_dapodik::validasi_simpan`.
 */
export function validasiSimpanDapodikSiswa(
  masukan: unknown,
): { ok: true; nilai: SimpanDapodikSiswa } | { ok: false; galat: string } {
  const hasil = simpanDapodikSiswaSchema.safeParse(masukan);
  return hasil.success
    ? { ok: true, nilai: hasil.data }
    : {
        ok: false,
        galat: hasil.error.issues[0]?.message ?? "Data DAPODIK tidak valid.",
      };
}

// Mengikuti keputusan formulir PMB 2026-10-16: semua wajib kecuali dusun dan
// blok bantuan; kebutuhan khusus selalu terisi ("Tidak ada").
const TIDAK_WAJIB = new Set<string>([
  "dusun",
  "kebutuhanKhusus",
  "kps",
  "noKps",
  "kip",
  "noKip",
  "namaKip",
  "noKks",
]);

export const ISIAN_WAJIB_DAPODIK: (keyof DataDapodik)[] =
  KUNCI_DATA_DAPODIK.filter((kunci) => !TIDAK_WAJIB.has(kunci));

/** Kunci isian wajib yang masih kosong; `tempatLahir` dsb. ikut dihitung. */
export function isianKurangDapodik(
  baris: BarisDapodikSiswa | null | undefined,
): string[] {
  const d: Record<string, unknown> = uraiDataDapodik(baris?.data_dapodik) ?? {};
  const kosong = (nilai: unknown) =>
    nilai === null || nilai === undefined || String(nilai).trim() === "";
  return [
    ...(kosong(baris?.tempat_lahir) ? ["tempatLahir"] : []),
    ...(kosong(baris?.tanggal_lahir) ? ["tanggalLahir"] : []),
    ...(kosong(baris?.sekolah_asal) ? ["sekolahAsal"] : []),
    ...ISIAN_WAJIB_DAPODIK.filter((kunci) => kosong(d[kunci])),
  ];
}
