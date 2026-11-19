/**
 * HRIS Fase 8b (`prd-hris/fase-8.md` §26.2.2): rekap PPh 21 bulanan, BPJS
 * bulanan, dan A1 tahunan.
 *
 * Cermin `desktop/lapor_pajak.rs`, diuji dengan vektor yang sama
 * (`lapor-pajak.vektor.json`); teks SQL, pesan, dan tanda dibandingkan
 * harfiah oleh `lapor-pajak.test.ts`. Angka laporan = angka yang dibekukan
 * slip, tidak dihitung ulang; slip pra-v67 tanpa `pajak` ditandai
 * `slip_lama`. Masa = bulan `period_start`, hanya run `PAID`.
 */
import { z } from "zod";
import { type AccessSubject, hasPermission } from "@/lib/auth/access";
import type { PermissionKey } from "@/lib/rbac/catalog";
import { objekKetat, rapikan } from "./transfer";

/** Cermin `IZIN_LAPOR`: laporan membuka NIK, NPWP, dan gaji semua pegawai. */
export const IZIN_LAPOR = [
  "payroll.export",
  "hr.finance.view",
] as const satisfies readonly PermissionKey[];
export type IzinLapor = (typeof IZIN_LAPOR)[number];
/** Cermin `IZIN_PEMOTONG`: khusus Superadmin. */
export const IZIN_PEMOTONG =
  "payroll.config.manage" as const satisfies PermissionKey;
export const STATUS_RUN_LAPOR = "PAID";
export const STATUS_RUN_DITOLAK = "REJECTED";

/** Cermin `TANDA_PPH`: tanda laporan, lalu `TANDA_PAJAK` yang dibawa slip. */
export const TANDA_PPH = [
  "tanpa_nik",
  "tanpa_npwp",
  "pph_negatif",
  "slip_lama",
  "lebih_potong_masa",
  "lintas_bulan",
  "tanpa_hari",
  "tarif_tidak_ada",
  "rumus_lama",
  "status_pajak_berubah",
  "komponen_per_run",
] as const;
export const TANDA_BPJS = [
  "dipotong_tanpa_nomor",
  "bernomor_tanpa_potongan",
  "slip_lama",
  "tarif_tidak_sah",
] as const;
export const TANDA_A1 = [
  "tanpa_nik",
  "tanpa_npwp",
  "slip_lama",
  "belum_masa_terakhir",
  "pph_tidak_cocok",
] as const;
export type TandaPph = (typeof TANDA_PPH)[number];
export type TandaBpjs = (typeof TANDA_BPJS)[number];
export type TandaA1 = (typeof TANDA_A1)[number];
export type TandaLapor = TandaPph | TandaBpjs | TandaA1;

export const LABEL_TANDA_LAPOR: Record<TandaLapor, string> = {
  tanpa_nik: "NIK belum diisi",
  tanpa_npwp: "NPWP belum diisi",
  pph_negatif: "PPh dikembalikan (negatif)",
  slip_lama: "Slip lama tanpa rincian pajak",
  lebih_potong_masa: "Lebih potong di masa ini",
  lintas_bulan: "Periode gaji lintas bulan",
  tanpa_hari: "Hari kerja kosong",
  tarif_tidak_ada: "Tarif pajak tidak ditemukan",
  rumus_lama: "Ada slip lama di tahun ini",
  status_pajak_berubah: "Status pajak berubah",
  komponen_per_run: "Komponen tetap di lebih dari satu run",
  dipotong_tanpa_nomor: "Ada iuran, nomor kepesertaan kosong",
  bernomor_tanpa_potongan: "Bernomor, tanpa iuran",
  tarif_tidak_sah: "Tarif BPJS tidak sah",
  belum_masa_terakhir: "Belum ada perhitungan masa terakhir",
  pph_tidak_cocok: "PPh setahun ≠ PPh dipotong",
};

/** Cermin `KUNCI_PEMOTONG`: kunci `app_lapor_setting`. */
export const KUNCI_PEMOTONG = [
  "npwp",
  "nitku",
  "nama_penandatangan",
  "nik_penandatangan",
  "no_bpjs_ketenagakerjaan",
  "no_bpjs_kesehatan",
] as const;
export type KunciPemotong = (typeof KUNCI_PEMOTONG)[number];
export const MAKS_NAMA_PENANDATANGAN = 100;

export const PESAN_MASA = "Masa wajib berformat YYYY-MM.";
export const PESAN_TAHUN = "Tahun wajib 4 digit.";
export const PESAN_NITKU_NPWP = "NITKU harus diawali NPWP pemotong.";

// SQL kembar (harfiah di `lapor_pajak.rs`)

/** ?1 = `YYYY-MM` atau `YYYY`; semua status ikut, penyaringan di `pilah`. */
export const SLIP_LAPOR_SQL =
  "SELECT r.id AS run_id, r.status AS status_run, r.period_start, i.id_karyawan, i.nama_karyawan, COALESCE(m.kode_karyawan, '') AS kode_karyawan, i.ptkp_status, i.gross_salary, i.pph21_amount, i.breakdown_snapshot, COALESCE(p.nik, '') AS nik, COALESCE(p.npwp, '') AS npwp, COALESCE(p.bpjs_kesehatan, '') AS bpjs_kesehatan, COALESCE(p.bpjs_ketenagakerjaan, '') AS bpjs_ketenagakerjaan FROM payroll_items i JOIN payroll_runs r ON r.id = i.payroll_run_id LEFT JOIN master_data m ON m.id_unik = i.id_karyawan LEFT JOIN hr_profil p ON p.id_karyawan = i.id_karyawan WHERE r.period_start LIKE ?1 || '-%' ORDER BY i.nama_karyawan, i.id_karyawan, r.period_start, r.id\n-- batas: slip satu masa atau satu tahun, jumlah pegawai kali run\n;";
export const PEMOTONG_SQL =
  "SELECT kunci, nilai FROM app_lapor_setting ORDER BY kunci LIMIT 50;";
export const SIMPAN_PEMOTONG_SQL =
  "INSERT INTO app_lapor_setting (kunci, nilai, diubah_oleh, updated_at) VALUES (?1, ?2, ?3, datetime('now')) ON CONFLICT(kunci) DO UPDATE SET nilai = excluded.nilai, diubah_oleh = excluded.diubah_oleh, updated_at = excluded.updated_at;";

// Validasi

type Hasil<T> = { ok: true; nilai: T } | { ok: false; galat: string };
const ok = <T>(nilai: T): Hasil<T> => ({ ok: true, nilai });
const gagal = <T = never>(galat: string): Hasil<T> => ({ ok: false, galat });
const isian = (v: unknown) => (typeof v === "string" ? v.trim() : "");

function isianTeks(d: Record<string, unknown>, kunci: string): Hasil<string> {
  const v = d[kunci];
  if (v === undefined || v === null) return ok("");
  if (typeof v === "string") return ok(v.trim());
  return gagal(`Isian '${kunci}' tidak valid.`);
}

/** Cermin `validasi_masa`: `{ masa: "YYYY-MM" }`. */
export function validasiMasa(draft: unknown): Hasil<string> {
  const o = objekKetat(draft, ["masa"]);
  if (!o.ok) return o;
  const masa = isian(o.nilai.masa);
  const bulan = Number(masa.slice(5));
  return /^\d{4}-\d{2}$/.test(masa) && bulan >= 1 && bulan <= 12
    ? ok(masa)
    : gagal(PESAN_MASA);
}

/** Cermin `validasi_tahun`: `{ tahun: "YYYY" }`. */
export function validasiTahun(draft: unknown): Hasil<string> {
  const o = objekKetat(draft, ["tahun"]);
  if (!o.ok) return o;
  const tahun = isian(o.nilai.tahun);
  return /^\d{4}$/.test(tahun) ? ok(tahun) : gagal(PESAN_TAHUN);
}

export type DataPemotong = Record<KunciPemotong, string>;

/** Cermin `bersihkan`: tanpa tanda baca ASCII dan spasi. */
const bersihkan = (t: string) =>
  [...t].filter((c) => !/^[\s!-/:-@[-`{-~]$/.test(c)).join("");

function digit(t: string, label: string, n: number): Hasil<string> {
  const a = bersihkan(t);
  if (a === "") return ok(a);
  if (!/^\d+$/.test(a)) return gagal(`${label} hanya boleh berisi angka.`);
  if (a.length !== n) return gagal(`${label} harus ${n} digit.`);
  return ok(a);
}

function nomorDaftar(t: string, label: string): Hasil<string> {
  const a = bersihkan(t);
  if (a === "") return ok(a);
  if (!/^[A-Za-z0-9]{5,20}$/.test(a)) {
    return gagal(`${label} harus 5 sampai 20 huruf atau angka.`);
  }
  return ok(a.toUpperCase());
}

/** Cermin `validasi_pemotong`. Semua isian opsional; kosong = belum diisi. */
export function validasiPemotong(draft: unknown): Hasil<DataPemotong> {
  const o = objekKetat(draft, KUNCI_PEMOTONG);
  if (!o.ok) return o;
  const t: Partial<DataPemotong> = {};
  for (const k of KUNCI_PEMOTONG) {
    const v = isianTeks(o.nilai, k);
    if (!v.ok) return v;
    t[k] = v.nilai;
  }
  const npwp = digit(t.npwp ?? "", "NPWP pemotong", 16);
  if (!npwp.ok) return npwp;
  const nitku = digit(t.nitku ?? "", "NITKU", 22);
  if (!nitku.ok) return nitku;
  if (
    nitku.nilai !== "" &&
    (npwp.nilai === "" || !nitku.nilai.startsWith(npwp.nilai))
  ) {
    return gagal(PESAN_NITKU_NPWP);
  }
  const nama = rapikan(t.nama_penandatangan ?? "");
  if ([...nama].length > MAKS_NAMA_PENANDATANGAN) {
    return gagal(
      `Nama penandatangan maksimal ${MAKS_NAMA_PENANDATANGAN} karakter.`,
    );
  }
  const nik = digit(t.nik_penandatangan ?? "", "NIK penandatangan", 16);
  if (!nik.ok) return nik;
  const tk = nomorDaftar(
    t.no_bpjs_ketenagakerjaan ?? "",
    "Nomor pendaftaran BPJS Ketenagakerjaan",
  );
  if (!tk.ok) return tk;
  const kes = nomorDaftar(
    t.no_bpjs_kesehatan ?? "",
    "Nomor pendaftaran BPJS Kesehatan",
  );
  if (!kes.ok) return kes;
  return ok({
    npwp: npwp.nilai,
    nitku: nitku.nilai,
    nama_penandatangan: nama,
    nik_penandatangan: nik.nilai,
    no_bpjs_ketenagakerjaan: tk.nilai,
    no_bpjs_kesehatan: kes.nilai,
  });
}

/** Cermin `baca_pemotong`: kunci asing diabaikan. */
export function bacaPemotong(
  daftar: readonly { kunci: unknown; nilai: unknown }[],
): DataPemotong {
  const nilai = (k: string) => {
    const b = daftar.find((x) => String(x.kunci ?? "") === k);
    return b ? String(b.nilai ?? "") : "";
  };
  return Object.fromEntries(
    KUNCI_PEMOTONG.map((k) => [k, nilai(k)]),
  ) as DataPemotong;
}

// Rekap

/** Satu baris `SLIP_LAPOR_SQL`; snapshot berupa teks JSON atau objek. */
export interface SlipLapor {
  run_id: string;
  status_run: string;
  period_start: string;
  id_karyawan: string;
  nama_karyawan: string;
  kode_karyawan?: string;
  ptkp_status?: string;
  gross_salary?: number;
  pph21_amount?: number;
  breakdown_snapshot?: unknown;
  nik?: string;
  npwp?: string;
  bpjs_kesehatan?: string;
  bpjs_ketenagakerjaan?: string;
}

export interface RunBelumDibayar {
  id: string;
  status: string;
  period_start: string;
}

type Obj = Record<string, unknown>;
const objek = (v: unknown): Obj =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {};
/** Cermin `as_i64`: bilangan bulat saja. */
const bulat = (v: unknown): number | null =>
  typeof v === "number" && Number.isInteger(v) ? v : null;
const teksAtauNull = (v: unknown): string | null =>
  typeof v === "string" ? v : null;
const daftarTeks = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((t): t is string => typeof t === "string") : [];
const banding = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

interface SlipBaca {
  slip: SlipLapor;
  snap: Obj;
}

/** Cermin `urai_snapshot`: teks rusak atau bukan objek = kosong. */
function uraiSnapshot(v: unknown): Obj {
  if (typeof v === "string") {
    try {
      return objek(JSON.parse(v));
    } catch {
      return {};
    }
  }
  return objek(v);
}

/** Cermin `pilah`. */
function pilah(slip: readonly SlipLapor[], periode: string) {
  const awalan = `${periode}-`;
  const pegawai: SlipBaca[][] = [];
  const run: string[] = [];
  const belum: RunBelumDibayar[] = [];
  for (const s of slip) {
    if (!s.period_start.startsWith(awalan)) continue;
    if (s.status_run !== STATUS_RUN_LAPOR) {
      if (
        s.status_run !== STATUS_RUN_DITOLAK &&
        !belum.some((r) => r.id === s.run_id)
      ) {
        belum.push({
          id: s.run_id,
          status: s.status_run,
          period_start: s.period_start,
        });
      }
      continue;
    }
    if (!run.includes(s.run_id)) run.push(s.run_id);
    const baca = { slip: s, snap: uraiSnapshot(s.breakdown_snapshot) };
    const g = pegawai.find((x) => x[0]?.slip.id_karyawan === s.id_karyawan);
    if (g) g.push(baca);
    else pegawai.push([baca]);
  }
  belum.sort(
    (a, b) => banding(a.period_start, b.period_start) || banding(a.id, b.id),
  );
  return { pegawai, jumlah_run: run.length, run_belum_dibayar: belum };
}

function urutTanda<T extends string>(
  kanon: readonly T[],
  aktif: readonly string[],
): T[] {
  return kanon.filter((t) => aktif.includes(t));
}

const pajakDari = (s: SlipBaca) => objek(s.snap.pajak);

/** Cermin `bruto`: slip lama memakai `gross_salary` beku. */
function brutoSlip(s: SlipBaca): [number, boolean] {
  const b = bulat(pajakDari(s).bruto_pajak);
  return b === null ? [s.slip.gross_salary ?? 0, true] : [b, false];
}

function statusPajak(s: SlipBaca): "tetap" | "tidak_tetap" {
  return pajakDari(s).status === "tidak_tetap" ? "tidak_tetap" : "tetap";
}

function ptkpStatus(s: SlipBaca): string {
  return (
    teksAtauNull(objek(s.snap.tax).ptkp_status) ?? s.slip.ptkp_status ?? ""
  );
}

const akhirDari = (g: SlipBaca[]) => g[g.length - 1] as SlipBaca;
const trim = (t: string | undefined) => (t ?? "").trim();

export interface BarisPph {
  id_karyawan: string;
  nama_karyawan: string;
  kode_karyawan: string;
  nik: string;
  npwp: string;
  ptkp_status: string;
  status: "tetap" | "tidak_tetap";
  metode: string | null;
  kategori: string | null;
  bruto: number;
  pph: number;
  jumlah_run: number;
  tanda: TandaPph[];
}

export interface RekapPph {
  masa: string;
  jumlah_run: number;
  run_belum_dibayar: RunBelumDibayar[];
  total_bruto: number;
  total_pph: number;
  baris: BarisPph[];
}

const jumlah = (d: readonly number[]) => d.reduce((s, n) => s + n, 0);

/** Cermin `rekap_pph`. */
export function rekapPph(slip: readonly SlipLapor[], masa: string): RekapPph {
  const p = pilah(slip, masa);
  const baris = p.pegawai.map((g): BarisPph => {
    const akhir = akhirDari(g);
    const s = akhir.slip;
    const aktif: string[] = [];
    let bruto = 0;
    let pph = 0;
    for (const b of g) {
      const [nilai, lama] = brutoSlip(b);
      bruto += nilai;
      pph += b.slip.pph21_amount ?? 0;
      if (lama) aktif.push("slip_lama");
      aktif.push(...daftarTeks(pajakDari(b).tanda));
    }
    if (trim(s.nik) === "") aktif.push("tanpa_nik");
    if (trim(s.npwp) === "") aktif.push("tanpa_npwp");
    if (pph < 0) aktif.push("pph_negatif");
    return {
      id_karyawan: s.id_karyawan,
      nama_karyawan: s.nama_karyawan,
      kode_karyawan: s.kode_karyawan ?? "",
      nik: trim(s.nik),
      npwp: trim(s.npwp),
      ptkp_status: ptkpStatus(akhir),
      status: statusPajak(akhir),
      metode: teksAtauNull(pajakDari(akhir).metode),
      kategori: teksAtauNull(pajakDari(akhir).kategori),
      bruto,
      pph,
      jumlah_run: g.length,
      tanda: urutTanda(TANDA_PPH, aktif),
    };
  });
  return {
    masa,
    jumlah_run: p.jumlah_run,
    run_belum_dibayar: p.run_belum_dibayar,
    total_bruto: jumlah(baris.map((b) => b.bruto)),
    total_pph: jumlah(baris.map((b) => b.pph)),
    baris,
  };
}

export interface BarisBpjs {
  id_karyawan: string;
  nama_karyawan: string;
  kode_karyawan: string;
  nik: string;
  no_bpjs_ketenagakerjaan: string;
  no_bpjs_kesehatan: string;
  dasar: number;
  iuran: Record<string, number>;
  pekerja: number;
  perusahaan: number;
  jumlah_run: number;
  tanda: TandaBpjs[];
}

export interface KodeBpjs {
  code: string;
  name: string;
  is_employee: boolean;
  total: number;
}

export interface RekapBpjs {
  masa: string;
  jumlah_run: number;
  run_belum_dibayar: RunBelumDibayar[];
  total_dasar: number;
  total_pekerja: number;
  total_perusahaan: number;
  kode: KodeBpjs[];
  baris: BarisBpjs[];
}

/** Cermin `kode_kesehatan`. */
export const kodeKesehatan = (code: string) => code.includes("KES");

/** Urut kunci seperti `BTreeMap` Rust. */
function urutKunci<T>(o: Record<string, T>): Record<string, T> {
  return Object.fromEntries(
    Object.entries(o).sort(([a], [b]) => banding(a, b)),
  );
}

/** Cermin `rekap_bpjs`. */
export function rekapBpjs(slip: readonly SlipLapor[], masa: string): RekapBpjs {
  const p = pilah(slip, masa);
  const kode: Record<string, KodeBpjs> = {};
  const baris = p.pegawai.map((g): BarisBpjs => {
    const s = akhirDari(g).slip;
    const aktif: string[] = [];
    const iuran: Record<string, number> = {};
    let dasar = 0;
    let pekerja = 0;
    let perusahaan = 0;
    let tk = 0;
    let kes = 0;
    for (const b of g) {
      const masaBpjs = objek(b.snap.bpjs_masa);
      const d = bulat(masaBpjs.dasar_run);
      if (d === null) aktif.push("slip_lama");
      else dasar += d;
      aktif.push(...daftarTeks(masaBpjs.tanda));
      for (const mentah of Array.isArray(b.snap.bpjs) ? b.snap.bpjs : []) {
        const r = objek(mentah);
        const code = teksAtauNull(r.code);
        if (code === null) continue;
        const nominal = bulat(r.nominal) ?? 0;
        const isEmployee = r.is_employee === true;
        iuran[code] = (iuran[code] ?? 0) + nominal;
        const k = kode[code] ?? {
          code,
          name: teksAtauNull(r.name) ?? "",
          is_employee: isEmployee,
          total: 0,
        };
        k.total += nominal;
        kode[code] = k;
        if (isEmployee) pekerja += nominal;
        else perusahaan += nominal;
        if (kodeKesehatan(code)) kes += nominal;
        else tk += nominal;
      }
    }
    const noTk = trim(s.bpjs_ketenagakerjaan);
    const noKes = trim(s.bpjs_kesehatan);
    if ((tk > 0 && noTk === "") || (kes > 0 && noKes === "")) {
      aktif.push("dipotong_tanpa_nomor");
    }
    if ((noTk !== "" && tk === 0) || (noKes !== "" && kes === 0)) {
      aktif.push("bernomor_tanpa_potongan");
    }
    return {
      id_karyawan: s.id_karyawan,
      nama_karyawan: s.nama_karyawan,
      kode_karyawan: s.kode_karyawan ?? "",
      nik: trim(s.nik),
      no_bpjs_ketenagakerjaan: noTk,
      no_bpjs_kesehatan: noKes,
      dasar,
      iuran: urutKunci(iuran),
      pekerja,
      perusahaan,
      jumlah_run: g.length,
      tanda: urutTanda(TANDA_BPJS, aktif),
    };
  });
  return {
    masa,
    jumlah_run: p.jumlah_run,
    run_belum_dibayar: p.run_belum_dibayar,
    total_dasar: jumlah(baris.map((b) => b.dasar)),
    total_pekerja: jumlah(baris.map((b) => b.pekerja)),
    total_perusahaan: jumlah(baris.map((b) => b.perusahaan)),
    kode: Object.values(urutKunci(kode)),
    baris,
  };
}

export interface BarisA1 {
  id_karyawan: string;
  nama_karyawan: string;
  kode_karyawan: string;
  nik: string;
  npwp: string;
  ptkp_status: string;
  status: "tetap" | "tidak_tetap";
  masa_awal: string;
  masa_akhir: string;
  jumlah_masa: number;
  bruto: number;
  pph_dipotong: number;
  a1: boolean;
  bruto_tahun: number | null;
  biaya_jabatan: number | null;
  iuran_pensiun: number | null;
  ptkp: number | null;
  pkp: number | null;
  pph_setahun: number | null;
  tanda: TandaA1[];
}

export interface RekapA1 {
  tahun: string;
  jumlah_run: number;
  run_belum_dibayar: RunBelumDibayar[];
  jumlah_a1: number;
  total_bruto: number;
  total_pph: number;
  baris: BarisA1[];
}

/** Cermin `rekap_a1`. */
export function rekapA1(slip: readonly SlipLapor[], tahun: string): RekapA1 {
  const p = pilah(slip, tahun);
  const baris = p.pegawai.map((g): BarisA1 => {
    const akhir = akhirDari(g);
    const s = akhir.slip;
    const aktif: string[] = [];
    let bruto = 0;
    let pph = 0;
    const masa: string[] = [];
    for (const b of g) {
      const [nilai, lama] = brutoSlip(b);
      bruto += nilai;
      pph += b.slip.pph21_amount ?? 0;
      if (lama) aktif.push("slip_lama");
      const m = [...b.slip.period_start].slice(0, 7).join("");
      if (!masa.includes(m)) masa.push(m);
    }
    masa.sort(banding);
    const status = statusPajak(akhir);
    const a1 = status !== "tidak_tetap";
    const terakhir = a1
      ? [...g]
          .reverse()
          .find((b) => pajakDari(b).metode === "PASAL_17_TERAKHIR")
      : undefined;
    const pasal17 = terakhir ? pajakDari(terakhir) : null;
    const ambil = (k: string) => (pasal17 ? bulat(pasal17[k]) : null);
    if (a1 && pasal17 === null) aktif.push("belum_masa_terakhir");
    const setahun = ambil("pph_setahun");
    if (setahun !== null && setahun !== pph) aktif.push("pph_tidak_cocok");
    if (trim(s.nik) === "") aktif.push("tanpa_nik");
    if (trim(s.npwp) === "") aktif.push("tanpa_npwp");
    return {
      id_karyawan: s.id_karyawan,
      nama_karyawan: s.nama_karyawan,
      kode_karyawan: s.kode_karyawan ?? "",
      nik: trim(s.nik),
      npwp: trim(s.npwp),
      ptkp_status: ptkpStatus(akhir),
      status,
      masa_awal: masa[0] ?? "",
      masa_akhir: masa[masa.length - 1] ?? "",
      jumlah_masa: masa.length,
      bruto,
      pph_dipotong: pph,
      a1,
      bruto_tahun: ambil("bruto_tahun"),
      biaya_jabatan: ambil("biaya_jabatan"),
      iuran_pensiun: ambil("iuran_pensiun"),
      ptkp: ambil("ptkp"),
      pkp: ambil("pkp"),
      pph_setahun: setahun,
      tanda: urutTanda(TANDA_A1, aktif),
    };
  });
  return {
    tahun,
    jumlah_run: p.jumlah_run,
    run_belum_dibayar: p.run_belum_dibayar,
    jumlah_a1: baris.filter((b) => b.a1).length,
    total_bruto: jumlah(baris.map((b) => b.bruto)),
    total_pph: jumlah(baris.map((b) => b.pph_dipotong)),
    baris,
  };
}

/** Laporan membuka NIK, NPWP, dan gaji: wajib kedua izin. */
export function bolehLapor(subjek: AccessSubject | null | undefined): boolean {
  return IZIN_LAPOR.every((izin) => hasPermission(subjek, izin));
}

// Skema rute Web

export const masaLaporSchema = z.object({ masa: z.string().max(20) }).strict();
export const tahunLaporSchema = z
  .object({ tahun: z.string().max(10) })
  .strict();
const isianPemotong = z.string().max(200).nullable().optional();
export const pemotongSchema = z
  .object({
    npwp: isianPemotong,
    nitku: isianPemotong,
    nama_penandatangan: isianPemotong,
    nik_penandatangan: isianPemotong,
    no_bpjs_ketenagakerjaan: isianPemotong,
    no_bpjs_kesehatan: isianPemotong,
  })
  .strict();
export const kosongLaporSchema = z.object({}).strict();

/** Jawaban command/rute laporan. */
export interface HasilLaporan<R> {
  rekap: R;
  pemotong: DataPemotong;
}
