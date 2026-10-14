/**
 * Aturan tagihan siswa (Fase K3a), cermin `desktop/billing.rs`.
 *
 * Setiap fungsi di sini punya pasangan Rust bernama sama dalam snake_case dan
 * diuji dengan vektor yang sama (`billing.test.ts` ↔ `mod tests` di
 * `billing.rs`). Pesan galatnya pun wajib identik. Uang selalu rupiah bulat.
 */

import { z } from "zod";
import { formatRupiah, type Hasil, isValidDate } from "./accounting";
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
export const STATUS_TAGIHAN = ["Aktif", "Lunas", "Dibatalkan"] as const;

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
export const AKUN_TITIPAN_WALI = "akun-titipan-wali";
export const AKUN_BANK = "akun-bank";

/** WAJIB sama dengan CHECK `keu_pembayaran.metode` di ketiga DDL. */
export const METODE_BAYAR = ["Tunai", "Transfer", "Titipan"] as const;
export const MAKS_KETERANGAN_BAYAR = 150;
export const MAKS_TAGIHAN_PER_KUITANSI = 100;
export const MAKS_NAMA_PERANGKAT = 60;
/** Seri kuitansi milik aplikasi Web; tidak boleh didaftarkan untuk perangkat. */
export const SERI_KUITANSI_WEB = "WEB";
/** Cermin `LIMIT 1000` daftar kuitansi di `billing.rs` dan `services/billing.ts`. */
export const BATAS_DAFTAR_KUITANSI = 1000;

export type Periodik = (typeof PERIODIK)[number];
export type JenisKeringanan = (typeof JENIS_KERINGANAN)[number];
export type StatusTagihan = (typeof STATUS_TAGIHAN)[number];
export type MetodeBayar = (typeof METODE_BAYAR)[number];

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

// ── Pembayaran (K3b) ────────────────────────────────────────────────────────

export const idJurnalPembayaran = (id: string) => `jrn-${id}`;
export const idAlokasi = (idPembayaran: string, urutan: number) =>
  `${idPembayaran}-${urutan}`;

/** Cermin `format_nomor_kuitansi`. */
export function formatNomorKuitansi(
  tahun: string,
  seri: string,
  nomorUrut: number,
): string {
  return `KWT/${tahun}/${seri}/${String(nomorUrut).padStart(4, "0")}`;
}

/** Akun penerima bawaan per metode; hanya untuk pilihan awal di layar. */
export function akunBawaanMetode(metode: string): string | null {
  if (metode === "Tunai") return "akun-kas";
  if (metode === "Transfer") return AKUN_BANK;
  return null;
}

/**
 * Cermin `validate_seri`. Huruf diperiksa SEBELUM dijadikan kapital, karena
 * `toUpperCase` JS mengubah sebagian huruf non-ASCII menjadi dua huruf ASCII
 * sedangkan Rust tidak.
 */
export function validateSeri(seri: string): Hasil<string> {
  const bersih = seri.trim();
  if (!/^[A-Za-z0-9]{2,8}$/.test(bersih)) {
    return { ok: false, error: "Seri harus 2 sampai 8 huruf atau angka." };
  }
  const kapital = bersih.toUpperCase();
  if (kapital === SERI_KUITANSI_WEB) {
    return { ok: false, error: "Seri WEB dipakai aplikasi Web." };
  }
  return { ok: true, value: kapital };
}

export const pembayaranDraftSchema = z
  .object({
    id_siswa: z.string().default(""),
    tanggal: z.string().default(""),
    metode: z.string().default(""),
    total: z.number().default(0),
    id_akun_kas: z.string().nullish(),
    keterangan: z.string().nullish(),
    id_tagihan: z.array(z.string()).default([]),
  })
  .strict();

export type PembayaranDraft = z.input<typeof pembayaranDraftSchema>;
type PembayaranParsed = z.output<typeof pembayaranDraftSchema>;

export interface PembayaranValid {
  id_siswa: string;
  tanggal: string;
  metode: MetodeBayar;
  total: number;
  id_akun_kas: string | null;
  keterangan: string | null;
  id_tagihan: string[];
}

/** Cermin `validate_pembayaran`. Tanggal masa depan diperiksa di backend. */
export function validatePembayaran(
  draft: PembayaranParsed,
): Hasil<PembayaranValid> {
  const id_siswa = draft.id_siswa.trim();
  if (!id_siswa) return { ok: false, error: "Siswa wajib dipilih." };
  if (!isValidDate(draft.tanggal)) {
    return { ok: false, error: "Tanggal pembayaran tidak valid." };
  }
  if (!(METODE_BAYAR as readonly string[]).includes(draft.metode)) {
    return { ok: false, error: "Metode pembayaran tidak dikenal." };
  }
  if (!Number.isInteger(draft.total) || draft.total <= 0) {
    return {
      ok: false,
      error: "Jumlah bayar harus rupiah bulat lebih dari nol.",
    };
  }
  if (draft.total > MAKS_NOMINAL_TAGIHAN) {
    return {
      ok: false,
      error: `Jumlah bayar maksimal ${formatRupiah(MAKS_NOMINAL_TAGIHAN)}.`,
    };
  }
  const titipan = draft.metode === "Titipan";
  const id_akun_kas = titipan ? null : draft.id_akun_kas?.trim() || null;
  if (!titipan && !id_akun_kas) {
    return { ok: false, error: "Akun penerima wajib dipilih." };
  }
  const keterangan = draft.keterangan?.trim() || null;
  if (keterangan && panjang(keterangan) > MAKS_KETERANGAN_BAYAR) {
    return { ok: false, error: "Keterangan maksimal 150 karakter." };
  }
  const id_tagihan: string[] = [];
  for (const id of draft.id_tagihan) {
    const bersih = id.trim();
    if (bersih && !id_tagihan.includes(bersih)) id_tagihan.push(bersih);
  }
  if (id_tagihan.length > MAKS_TAGIHAN_PER_KUITANSI) {
    return { ok: false, error: "Satu kuitansi paling banyak 100 tagihan." };
  }
  if (titipan && id_tagihan.length === 0) {
    return { ok: false, error: "Pilih tagihan yang dibayar dari titipan." };
  }
  return {
    ok: true,
    value: {
      id_siswa,
      tanggal: draft.tanggal,
      metode: draft.metode as MetodeBayar,
      total: draft.total,
      id_akun_kas,
      keterangan,
      id_tagihan,
    },
  };
}

export interface TagihanTerbuka {
  id_tagihan: string;
  jatuh_tempo: string;
  periode: string;
  sisa: number;
}

/**
 * Cermin `alokasi_pembayaran`: tagihan dengan jatuh tempo terlama dilunasi
 * lebih dulu, kelebihannya menjadi Titipan Wali. Urutan dibandingkan per
 * byte (bukan `localeCompare`) supaya sama dengan Rust.
 */
export function alokasiPembayaran(
  tagihan: readonly TagihanTerbuka[],
  total: number,
): {
  alokasi: Array<{ id_tagihan: string; nominal: number }>;
  titipan: number;
} {
  const banding = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  const urut = [...tagihan].sort(
    (a, b) =>
      banding(a.jatuh_tempo, b.jatuh_tempo) ||
      banding(a.periode, b.periode) ||
      banding(a.id_tagihan, b.id_tagihan),
  );
  let sisa = total;
  const alokasi: Array<{ id_tagihan: string; nominal: number }> = [];
  for (const item of urut) {
    if (sisa <= 0) break;
    if (item.sisa <= 0) continue;
    const nominal = Math.min(item.sisa, sisa);
    alokasi.push({ id_tagihan: item.id_tagihan, nominal });
    sisa -= nominal;
  }
  return { alokasi, titipan: sisa };
}

export interface BarisJurnalBayar {
  id_akun: string;
  debit: number;
  kredit: number;
}

/**
 * Cermin `baris_jurnal_pembayaran`. Uang tunai/transfer: Kas atau Bank (D) /
 * Piutang Siswa (K) + Titipan Wali (K) untuk kelebihannya. Dari titipan:
 * Titipan Wali (D) / Piutang Siswa (K). Seimbang karena konstruksinya.
 */
export function barisJurnalPembayaran(
  metode: string,
  idAkunKas: string | null,
  keTagihan: number,
  keTitipan: number,
): BarisJurnalBayar[] {
  if (metode === "Titipan") {
    return [
      { id_akun: AKUN_TITIPAN_WALI, debit: keTagihan, kredit: 0 },
      { id_akun: AKUN_PIUTANG_SISWA, debit: 0, kredit: keTagihan },
    ];
  }
  const baris: BarisJurnalBayar[] = [
    { id_akun: idAkunKas ?? "", debit: keTagihan + keTitipan, kredit: 0 },
  ];
  if (keTagihan > 0) {
    baris.push({ id_akun: AKUN_PIUTANG_SISWA, debit: 0, kredit: keTagihan });
  }
  if (keTitipan > 0) {
    baris.push({ id_akun: AKUN_TITIPAN_WALI, debit: 0, kredit: keTitipan });
  }
  return baris;
}
