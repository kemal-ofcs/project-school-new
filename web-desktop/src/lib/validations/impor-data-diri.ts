// Impor data diri pegawai (tab Pribadi dan Keuangan) dari Excel. Hanya
// mengurai dan memeriksa berkas di klien; penyimpanan tetap lewat gateway
// `simpanDataPribadi`/`simpanDataKeuangan` per baris, sehingga izin dan aturan
// isian kembar TS/Rust diperiksa server seperti pada formulir.

import {
  type Keuangan,
  type Pribadi,
  validasiKeuangan,
  validasiPribadi,
} from "./hris";
import { tanggalExcel, teksIdentitas } from "./personnel-import";

export const KOLOM_PRIBADI = [
  "nik",
  "no_kk",
  "tempat_lahir",
  "tanggal_lahir",
  "agama",
  "status_nikah",
  "nama_ibu_kandung",
  "alamat_ktp",
  "alamat_domisili",
  "darurat_nama",
  "darurat_hubungan",
  "darurat_hp",
] as const satisfies readonly (keyof Pribadi)[];

export const KOLOM_KEUANGAN = [
  "bank",
  "no_rekening",
  "nama_rekening",
  "npwp",
  "bpjs_kesehatan",
  "bpjs_ketenagakerjaan",
] as const satisfies readonly (keyof Keuangan)[];

/**
 * Nomor yang rusak bila menjadi sel Angka: digit ke-16 dst. dibulatkan dan nol
 * depan hilang. Dibulatkan diam-diam tetap lolos `validasiPribadi` (NIK tetap
 * 16 digit), jadi tipe selnya yang diperiksa, bukan isinya.
 */
const KOLOM_NOMOR: ReadonlySet<string> = new Set([
  "nik",
  "no_kk",
  "darurat_hp",
  "no_rekening",
  "npwp",
  "bpjs_kesehatan",
  "bpjs_ketenagakerjaan",
]);

export const MAKS_BARIS_DATA_DIRI = 500;

const kosong = <K extends string>(kunci: readonly K[]) =>
  Object.fromEntries(kunci.map((k) => [k, ""])) as Record<K, string>;
export const PRIBADI_KOSONG: Pribadi = kosong(KOLOM_PRIBADI);
export const KEUANGAN_KOSONG: Keuangan = kosong(KOLOM_KEUANGAN);

export interface PegawaiRujukan {
  id_unik: string;
  kode_karyawan: string;
  nama: string;
}

export interface BarisDataDiri {
  /** Nomor baris Excel (judul = 1). */
  baris: number;
  id_karyawan: string;
  nama: string;
  /** Hanya sel yang berisi; `null` = kelompok ini tidak disentuh. */
  pribadi: Partial<Pribadi> | null;
  keuangan: Partial<Keuangan> | null;
  galat: string | null;
}

export interface HasilUraiDataDiri {
  baris: BarisDataDiri[];
  /** Kolom yang diabaikan karena izin, untuk ditampilkan di pratinjau. */
  catatan: string[];
}

/**
 * Urai tabel dari `readWorkbookTable`. Baris tanpa satu pun isian dilewati
 * (template yang belum diisi); baris bermasalah tetap dikembalikan dengan
 * `galat` supaya pratinjau bisa menunjukkannya.
 */
export function uraiDataDiri(
  tabel: { rows: string[][]; selAngka: boolean[][] },
  pegawai: readonly PegawaiRujukan[],
  izin: { pribadi: boolean; keuangan: boolean },
): HasilUraiDataDiri {
  const [judul = [], ...data] = tabel.rows;
  const indeks = new Map(judul.map((h, i) => [h.trim().toLowerCase(), i]));
  if (!indeks.has("id_unik") && !indeks.has("kode_karyawan")) {
    throw new Error(
      "Kolom 'id_unik' atau 'kode_karyawan' tidak ditemukan di baris judul. Pakai template dari tombol Unduh template.",
    );
  }
  const ada = (daftar: readonly string[]) => daftar.some((k) => indeks.has(k));
  const catatan: string[] = [];
  if (ada(KOLOM_PRIBADI) && !izin.pribadi) {
    catatan.push(
      "Kolom data pribadi diabaikan: Anda tidak punya izin mengubah data pribadi.",
    );
  }
  if (ada(KOLOM_KEUANGAN) && !izin.keuangan) {
    catatan.push(
      "Kolom data keuangan diabaikan: Anda tidak punya izin mengubah data keuangan.",
    );
  }
  const kolomPribadi = izin.pribadi ? KOLOM_PRIBADI : [];
  const kolomKeuangan = izin.keuangan ? KOLOM_KEUANGAN : [];
  if (!ada(kolomPribadi) && !ada(kolomKeuangan)) {
    throw new Error(
      catatan.length > 0
        ? catatan.join(" ")
        : "Tidak ada kolom data diri di berkas. Pakai template dari tombol Unduh template.",
    );
  }

  const perId = new Map(pegawai.map((p) => [p.id_unik.toLowerCase(), p]));
  const perKode = new Map(
    pegawai
      .filter((p) => p.kode_karyawan)
      .map((p) => [p.kode_karyawan.toLowerCase(), p]),
  );
  const barisPertama = new Map<string, number>();
  const hasil: BarisDataDiri[] = [];

  data.forEach((row, i) => {
    const baris = i + 2;
    const angka = tabel.selAngka[i + 1] ?? [];
    const sel = (kolom: string) => {
      const idx = indeks.get(kolom);
      return idx === undefined ? "" : (row[idx] ?? "").trim();
    };
    const id = sel("id_unik");
    const kode = sel("kode_karyawan");
    if (!id && !kode) return;

    const cocok =
      perId.get(id.toLowerCase()) ?? perKode.get(kode.toLowerCase()) ?? null;
    const dasar = {
      baris,
      id_karyawan: cocok?.id_unik ?? (id || kode),
      nama: cocok?.nama ?? sel("nama"),
      pribadi: null,
      keuangan: null,
    };
    try {
      if (!cocok) {
        throw new Error(`Pegawai '${id || kode}' tidak ditemukan.`);
      }
      const isi = (kolom: string) => {
        const nilai = sel(kolom);
        if (!nilai || !KOLOM_NOMOR.has(kolom)) return nilai;
        if (angka[indeks.get(kolom) ?? -1]) {
          throw new Error(
            `${kolom} tersimpan sebagai Angka di Excel, sehingga digit atau nol depannya bisa hilang. Ketik ulang dengan awalan tanda kutip (') atau format kolomnya sebagai Teks.`,
          );
        }
        return teksIdentitas(nilai, kolom, baris);
      };
      const ambil = <K extends string>(kolom: readonly K[]) => {
        const terisi: Partial<Record<K, string>> = {};
        for (const k of kolom) {
          const nilai =
            k === "tanggal_lahir"
              ? (tanggalExcel(sel(k), k, baris) ?? "")
              : isi(k);
          if (nilai) terisi[k] = nilai;
        }
        return Object.keys(terisi).length > 0 ? terisi : null;
      };
      const pribadi = ambil(kolomPribadi);
      const keuangan = ambil(kolomKeuangan);
      if (!pribadi && !keuangan) return;

      const sebelumnya = barisPertama.get(cocok.id_unik);
      if (sebelumnya !== undefined) {
        throw new Error(`Pegawai ini sudah ada di baris ${sebelumnya}.`);
      }
      barisPertama.set(cocok.id_unik, baris);

      const cekPribadi = pribadi
        ? validasiPribadi({ ...PRIBADI_KOSONG, ...pribadi })
        : null;
      if (cekPribadi && !cekPribadi.ok) throw new Error(cekPribadi.galat);
      const cekKeuangan = keuangan
        ? validasiKeuangan({ ...KEUANGAN_KOSONG, ...keuangan })
        : null;
      if (cekKeuangan && !cekKeuangan.ok) throw new Error(cekKeuangan.galat);

      hasil.push({ ...dasar, pribadi, keuangan, galat: null });
    } catch (error) {
      const pesan = error instanceof Error ? error.message : String(error);
      hasil.push({
        ...dasar,
        galat: pesan.replace(/^Baris \d+: /, ""),
      });
    }
  });

  if (hasil.length === 0) {
    throw new Error("Tidak ada isian data diri di berkas.");
  }
  if (hasil.length > MAKS_BARIS_DATA_DIRI) {
    throw new Error(
      `Maksimal ${MAKS_BARIS_DATA_DIRI} pegawai per berkas; berkas ini berisi ${hasil.length}.`,
    );
  }
  return { baris: hasil, catatan };
}

/**
 * Isian akhir satu kelompok: sel berisi dari berkas menimpa, sisanya nilai
 * lama (keputusan A1: sel kosong tidak menghapus). `lama` hanya dibaca pada
 * kunci `dasar`, jadi kolom jejak (`diubah_oleh`, ...) tidak ikut terkirim.
 */
export function gabungIsian<T extends { [K in keyof T]: string }>(
  dasar: T,
  lama: Partial<Record<keyof T, unknown>> | null,
  baru: Partial<T>,
): T {
  const hasil = { ...dasar };
  for (const k of Object.keys(dasar) as (keyof T)[]) {
    const nilai = baru[k] || String(lama?.[k] ?? "");
    hasil[k] = nilai as T[keyof T];
  }
  return hasil;
}
