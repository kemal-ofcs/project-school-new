/**
 * Aturan tagihan siswa (Fase K3a), cermin `desktop/billing.rs`.
 *
 * Setiap fungsi di sini punya pasangan Rust bernama sama dalam snake_case dan
 * diuji dengan vektor yang sama (`billing.test.ts` ↔ `mod tests` di
 * `billing.rs`). Pesan galatnya pun wajib identik. Uang selalu rupiah bulat.
 */

import { z } from "zod";
import { formatRupiah, type Hasil } from "./accounting";
import { isValidPeriode } from "./loan";

/** WAJIB sama dengan CHECK `keu_jenis_tagihan.periodik` di ketiga DDL. */
export const PERIODIK = ["Bulanan", "Tahunan", "Sekali"] as const;
/** WAJIB sama dengan CHECK `keu_keringanan.jenis` di ketiga DDL. */
export const JENIS_KERINGANAN = ["Persen", "Nominal"] as const;
/**
 * Status TURUNAN, bukan kolom: tagihan tidak pernah diubah (prinsip 5.2 PRD),
 * pembatalannya adalah baris `keu_tagihan_batal`. Dengan begitu kedua tabel
 * append-only dan ditarik inkremental (`sync::APPEND_ONLY_TABLES`).
 */
export const STATUS_TAGIHAN = ["Aktif", "Dibatalkan"] as const;

/** Periode tetap jenis `Sekali`: id deterministiknya membuat tagihan itu hanya bisa terbit sekali per siswa. */
export const PERIODE_SEKALI = "SEKALI";
export const MAKS_NOMINAL_TAGIHAN = 100_000_000;
export const MAKS_NAMA_TAGIHAN = 80;
export const MAKS_ALASAN_KERINGANAN = 80;
export const MAKS_PERIODE = 20;
export const MAKS_ALASAN_BATAL_TAGIHAN = 150;
/** Cermin `LIMIT 1000` daftar tagihan di `billing.rs` dan `services/billing.ts`. */
export const BATAS_DAFTAR_TAGIHAN = 1000;

export const AKUN_PIUTANG_SISWA = "akun-piutang-siswa";
export const AKUN_PENDAPATAN_SPP = "akun-pendapatan-spp";

export type Periodik = (typeof PERIODIK)[number];
export type JenisKeringanan = (typeof JENIS_KERINGANAN)[number];
export type StatusTagihan = (typeof STATUS_TAGIHAN)[number];

function panjang(value: string): number {
  return Array.from(value).length;
}

function rupiah(nilai: number): boolean {
  return Number.isInteger(nilai) && nilai >= 0;
}

/** Cermin `kunci_unit`: nama unit dibandingkan tanpa peduli spasi tepi dan huruf besar. */
export function kunciUnit(unit: string | null | undefined): string {
  return (unit ?? "").trim().toLowerCase();
}

export const idTagihan = (idJenis: string, idSiswa: string, periode: string) =>
  `tgh-${idJenis}-${idSiswa}-${periode}`;
export const idJurnalTagihan = (id: string) => `jrn-${id}`;

/** Cermin `validate_periode_tagihan`: bentuk periode mengikuti jenisnya. */
export function validatePeriodeTagihan(
  periodik: string,
  periode: string,
): Hasil<string> {
  const bersih = periode.trim();
  if (periodik === "Sekali") return { ok: true, value: PERIODE_SEKALI };
  if (periodik === "Bulanan") {
    return isValidPeriode(bersih)
      ? { ok: true, value: bersih }
      : { ok: false, error: "Periode bulanan harus berbentuk YYYY-MM." };
  }
  if (periodik === "Tahunan") {
    if (!bersih) return { ok: false, error: "Tahun ajaran wajib dipilih." };
    if (panjang(bersih) > MAKS_PERIODE) {
      return { ok: false, error: "Periode maksimal 20 karakter." };
    }
    return { ok: true, value: bersih };
  }
  return { ok: false, error: "Jenis periode tagihan tidak dikenal." };
}

// ── Jenis tagihan ───────────────────────────────────────────────────────────

export const jenisTagihanDraftSchema = z
  .object({
    id_jenis_tagihan: z.string().nullish(),
    nama: z.string().default(""),
    periodik: z.string().default(""),
    nominal_bawaan: z.number().default(0),
    id_akun_pendapatan: z.string().default(""),
    is_aktif: z.boolean().default(true),
  })
  .strict();

export type JenisTagihanDraft = z.input<typeof jenisTagihanDraftSchema>;
type JenisTagihanParsed = z.output<typeof jenisTagihanDraftSchema>;

export interface JenisTagihanValid {
  nama: string;
  periodik: Periodik;
  nominal_bawaan: number;
  id_akun_pendapatan: string;
  is_aktif: boolean;
}

/** Cermin `validate_jenis_tagihan`. */
export function validateJenisTagihan(
  draft: JenisTagihanParsed,
): Hasil<JenisTagihanValid> {
  const nama = draft.nama.trim();
  if (!nama) return { ok: false, error: "Nama tagihan wajib diisi." };
  if (panjang(nama) > MAKS_NAMA_TAGIHAN) {
    return { ok: false, error: "Nama tagihan maksimal 80 karakter." };
  }
  if (!(PERIODIK as readonly string[]).includes(draft.periodik)) {
    return { ok: false, error: "Jenis periode tagihan tidak dikenal." };
  }
  if (!rupiah(draft.nominal_bawaan)) {
    return {
      ok: false,
      error: "Nominal harus rupiah bulat dan tidak negatif.",
    };
  }
  if (draft.nominal_bawaan > MAKS_NOMINAL_TAGIHAN) {
    return {
      ok: false,
      error: `Nominal maksimal ${formatRupiah(MAKS_NOMINAL_TAGIHAN)}.`,
    };
  }
  const id_akun_pendapatan = draft.id_akun_pendapatan.trim();
  if (!id_akun_pendapatan) {
    return { ok: false, error: "Akun pendapatan wajib dipilih." };
  }
  return {
    ok: true,
    value: {
      nama,
      periodik: draft.periodik as Periodik,
      nominal_bawaan: draft.nominal_bawaan,
      id_akun_pendapatan,
      is_aktif: draft.is_aktif,
    },
  };
}

// ── Tarif ───────────────────────────────────────────────────────────────────

export const tarifDraftSchema = z
  .object({
    id_tarif: z.string().nullish(),
    id_jenis_tagihan: z.string().default(""),
    nama_unit: z.string().nullish(),
    tingkat: z.number().nullish(),
    nominal: z.number().default(0),
  })
  .strict();

export type TarifDraft = z.input<typeof tarifDraftSchema>;
type TarifParsed = z.output<typeof tarifDraftSchema>;

export interface TarifValid {
  id_jenis_tagihan: string;
  nama_unit: string;
  tingkat: number | null;
  nominal: number;
}

/** Cermin `validate_tarif`. Unit kosong = semua unit, tingkat kosong = semua tingkat. */
export function validateTarif(draft: TarifParsed): Hasil<TarifValid> {
  const id_jenis_tagihan = draft.id_jenis_tagihan.trim();
  if (!id_jenis_tagihan) {
    return { ok: false, error: "Jenis tagihan wajib dipilih." };
  }
  const nama_unit = (draft.nama_unit ?? "").trim();
  if (panjang(nama_unit) > MAKS_NAMA_TAGIHAN) {
    return { ok: false, error: "Nama unit maksimal 80 karakter." };
  }
  const tingkat = draft.tingkat ?? null;
  if (
    tingkat !== null &&
    (!Number.isInteger(tingkat) || tingkat < 1 || tingkat > 20)
  ) {
    return { ok: false, error: "Tingkat harus bilangan 1 sampai 20." };
  }
  if (!nama_unit && tingkat === null) {
    return {
      ok: false,
      error:
        "Pilih unit atau tingkat. Tarif untuk semua siswa diatur di nominal bawaan.",
    };
  }
  if (!rupiah(draft.nominal)) {
    return {
      ok: false,
      error: "Nominal harus rupiah bulat dan tidak negatif.",
    };
  }
  if (draft.nominal > MAKS_NOMINAL_TAGIHAN) {
    return {
      ok: false,
      error: `Nominal maksimal ${formatRupiah(MAKS_NOMINAL_TAGIHAN)}.`,
    };
  }
  return {
    ok: true,
    value: { id_jenis_tagihan, nama_unit, tingkat, nominal: draft.nominal },
  };
}

export interface TarifBerlaku {
  nama_unit: string;
  tingkat: number | null;
  nominal: number;
}

/**
 * Cermin `pilih_tarif`. Yang paling spesifik menang: unit + tingkat, lalu
 * unit saja, lalu tingkat saja, lalu nominal bawaan jenisnya.
 */
export function pilihTarif(
  tarif: readonly TarifBerlaku[],
  nominalBawaan: number,
  unit: string | null,
  tingkat: number | null,
): number {
  const kunci = kunciUnit(unit);
  const cocok = (
    item: TarifBerlaku,
    pakaiUnit: boolean,
    pakaiTingkat: boolean,
  ) =>
    (pakaiUnit
      ? kunciUnit(item.nama_unit) === kunci && kunci !== ""
      : item.nama_unit === "") &&
    (pakaiTingkat
      ? item.tingkat !== null && item.tingkat === tingkat
      : item.tingkat === null);
  for (const [pakaiUnit, pakaiTingkat] of [
    [true, true],
    [true, false],
    [false, true],
  ] as const) {
    const ketemu = tarif.find((item) => cocok(item, pakaiUnit, pakaiTingkat));
    if (ketemu) return ketemu.nominal;
  }
  return nominalBawaan;
}

// ── Keringanan ──────────────────────────────────────────────────────────────

export const keringananDraftSchema = z
  .object({
    id_keringanan: z.string().nullish(),
    id_siswa: z.string().default(""),
    id_jenis_tagihan: z.string().default(""),
    jenis: z.string().default(""),
    nilai: z.number().default(0),
    periode_mulai: z.string().nullish(),
    periode_selesai: z.string().nullish(),
    alasan: z.string().nullish(),
    is_aktif: z.boolean().default(true),
  })
  .strict();

export type KeringananDraft = z.input<typeof keringananDraftSchema>;
type KeringananParsed = z.output<typeof keringananDraftSchema>;

export interface KeringananValid {
  id_siswa: string;
  id_jenis_tagihan: string;
  jenis: JenisKeringanan;
  nilai: number;
  periode_mulai: string | null;
  periode_selesai: string | null;
  alasan: string | null;
  is_aktif: boolean;
}

function bersih(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

/** Cermin `validate_keringanan`. */
export function validateKeringanan(
  draft: KeringananParsed,
): Hasil<KeringananValid> {
  const id_siswa = draft.id_siswa.trim();
  if (!id_siswa) return { ok: false, error: "Siswa wajib dipilih." };
  const id_jenis_tagihan = draft.id_jenis_tagihan.trim();
  if (!id_jenis_tagihan) {
    return { ok: false, error: "Jenis tagihan wajib dipilih." };
  }
  if (!(JENIS_KERINGANAN as readonly string[]).includes(draft.jenis)) {
    return { ok: false, error: "Jenis keringanan harus Persen atau Nominal." };
  }
  if (!Number.isInteger(draft.nilai) || draft.nilai <= 0) {
    return {
      ok: false,
      error: "Nilai keringanan harus bilangan bulat lebih dari nol.",
    };
  }
  if (draft.jenis === "Persen" && draft.nilai > 100) {
    return { ok: false, error: "Keringanan persen maksimal 100." };
  }
  if (draft.jenis === "Nominal" && draft.nilai > MAKS_NOMINAL_TAGIHAN) {
    return {
      ok: false,
      error: `Keringanan nominal maksimal ${formatRupiah(MAKS_NOMINAL_TAGIHAN)}.`,
    };
  }
  const periode_mulai = bersih(draft.periode_mulai);
  const periode_selesai = bersih(draft.periode_selesai);
  if (
    (periode_mulai && panjang(periode_mulai) > MAKS_PERIODE) ||
    (periode_selesai && panjang(periode_selesai) > MAKS_PERIODE)
  ) {
    return { ok: false, error: "Periode maksimal 20 karakter." };
  }
  if (periode_mulai && periode_selesai && periode_selesai < periode_mulai) {
    return {
      ok: false,
      error: "Periode selesai tidak boleh sebelum periode mulai.",
    };
  }
  const alasan = bersih(draft.alasan);
  if (alasan && panjang(alasan) > MAKS_ALASAN_KERINGANAN) {
    return { ok: false, error: "Alasan maksimal 80 karakter." };
  }
  return {
    ok: true,
    value: {
      id_siswa,
      id_jenis_tagihan,
      jenis: draft.jenis as JenisKeringanan,
      nilai: draft.nilai,
      periode_mulai,
      periode_selesai,
      alasan,
      is_aktif: draft.is_aktif,
    },
  };
}

export interface KeringananBerlaku {
  jenis: string;
  nilai: number;
  periode_mulai: string | null;
  periode_selesai: string | null;
}

/**
 * Cermin `keringanan_berlaku`. Jenis `Sekali` tidak punya rentang periode;
 * selain itu periode dibandingkan sebagai teks (`YYYY-MM` dan `2026/2027`
 * sama-sama urut secara leksikografis).
 */
export function keringananBerlaku(
  item: KeringananBerlaku,
  periodik: string,
  periode: string,
): boolean {
  if (periodik === "Sekali") return true;
  if (item.periode_mulai && periode < item.periode_mulai) return false;
  if (item.periode_selesai && periode > item.periode_selesai) return false;
  return true;
}

/**
 * Cermin `hitung_potongan`. Persen dibulatkan ke rupiah terdekat dengan
 * aritmetika bilangan bulat (setengah ke atas), lalu semua keringanan
 * dijumlahkan dan dibatasi nominal tagihannya.
 */
export function hitungPotongan(
  nominal: number,
  keringanan: readonly KeringananBerlaku[],
): number {
  let total = 0;
  for (const item of keringanan) {
    total +=
      item.jenis === "Persen"
        ? Math.floor((nominal * item.nilai + 50) / 100)
        : item.nilai;
  }
  return Math.min(total, nominal);
}
