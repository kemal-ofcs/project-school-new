/**
 * HRIS Fase 5 (`prd-hris.md` §23): penilaian kinerja guru dan tendik.
 *
 * Kelima tabel `hr_kinerja_*` KHUSUS CLOUD (Q-91): dibaca dan ditulis lewat
 * `services/hr-kinerja.ts` (Web) dan `TursoClient` di `desktop/hr_kinerja.rs`
 * (Desktop/Mobile), tanpa SQLite perangkat, snapshot, atau outbox. Pengaturan
 * `hr_kinerja_*` tetap di `setting_gex_system` yang tersinkron.
 *
 * Aturan dan SQL di sini kembar `desktop/hr_kinerja.rs`; vektornya
 * `hr-kinerja.vektor.json`, teks SQL dan pesan dibandingkan harfiah oleh
 * `hr-kinerja.test.ts`.
 */

import { z } from "zod";
import { tanggalValid } from "./hari-kerja";
import TEMPLATE_BAWAAN_JSON from "./hr-kinerja-template-bawaan.json";

type Hasil<T> = { ok: true; nilai: T } | { ok: false; galat: string };

const panjang = (teks: string) => [...teks].length;

// Konstanta (cermin `pub const` di `hr_kinerja.rs`)

export const KELOMPOK_KINERJA = ["Guru", "Tendik"] as const;
export type KelompokKinerja = (typeof KELOMPOK_KINERJA)[number];

export const TIPE_MANUAL = "Manual";
export const TIPE_KEHADIRAN = "Otomatis Kehadiran";
export const TIPE_PRESENSI = "Otomatis Presensi Kelas";
export const TIPE_JURNAL = "Otomatis Jurnal";
export const TIPE_ASPEK = [
  TIPE_MANUAL,
  TIPE_KEHADIRAN,
  TIPE_PRESENSI,
  TIPE_JURNAL,
] as const;
export type TipeAspek = (typeof TIPE_ASPEK)[number];
/** Aspek yang hanya punya data untuk guru (jadwal, presensi, jurnal). */
export const TIPE_KHUSUS_GURU: readonly string[] = [TIPE_PRESENSI, TIPE_JURNAL];

export const MAKS_NAMA_TEMPLATE = 100;
export const MAKS_KETERANGAN = 1000;
export const MAKS_ASPEK = 100;
export const MAKS_ASPEK_AKTIF = 20;
export const MAKS_NAMA_ASPEK = 100;
export const MAKS_PANDUAN = 1000;
export const TOTAL_BOBOT = 100;

export const KUNCI_AMBANG = "hr_kinerja_ambang";
export const KUNCI_PREDIKAT = "hr_kinerja_predikat";
export const KUNCI_TANPA_KBM = "hr_kinerja_tanpa_kbm";
export const AMBANG_BAWAAN = [950, 900, 800, 700] as const;
/** Rentang PKG/PermenPAN-RB 16/2009 (Q-101); ambang dalam nilai ×100. */
export const PREDIKAT_BAWAAN =
  "9100:Amat Baik|7600:Baik|6100:Cukup|5100:Sedang|0:Kurang";
export const MIN_PREDIKAT = 2;
export const MAKS_PREDIKAT = 7;
export const MAKS_NAMA_PREDIKAT = 50;
export const MAKS_RENTANG_KBM = 30;
export const MAKS_HARI_RENTANG = 31;
export const MAKS_NAMA_RENTANG = 50;

export const PESAN_AMBANG =
  "Ambang harus empat bilangan bulat 1 sampai 1000 yang turun, misalnya 950,900,800,700.";
export const PESAN_PREDIKAT =
  "Predikat harus 2 sampai 7 pasangan nilai:nama dengan nilai turun dari 10000 dan yang terakhir 0.";
export const PESAN_NAMA_PREDIKAT =
  "Nama predikat 1 sampai 50 karakter tanpa tanda | dan :.";

// SQL kembar (teks harfiah sama dengan `hr_kinerja.rs`)

export const TEMPLATE_KINERJA_SQL =
  "SELECT id_template, nama, kelompok, COALESCE(keterangan, '') AS keterangan, is_bawaan, is_aktif, diubah_oleh, updated_at FROM hr_kinerja_template ORDER BY kelompok, is_aktif DESC, is_bawaan DESC, nama, id_template\n-- batas: template kinerja sekolah, dibuat tangan oleh pengatur\n;";
export const ASPEK_KINERJA_SQL =
  "SELECT id_aspek, id_template, nama, tipe, bobot, COALESCE(panduan, '') AS panduan, urutan, is_aktif FROM hr_kinerja_aspek ORDER BY id_template, urutan, id_aspek\n-- batas: paling banyak 100 aspek per template\n;";
export const TEMPLATE_SATU_SQL =
  "SELECT id_template, kelompok FROM hr_kinerja_template WHERE id_template = ?1;";
export const ASPEK_TEMPLATE_SQL =
  "SELECT id_aspek, tipe FROM hr_kinerja_aspek WHERE id_template = ?1 ORDER BY id_aspek\n-- batas: paling banyak 100 aspek per template\n;";
export const BENTROK_TEMPLATE_SQL =
  "SELECT 1 FROM hr_kinerja_template WHERE LOWER(TRIM(nama)) = LOWER(TRIM(?1)) AND id_template <> ?2 LIMIT 1;";
/** Kelompok tidak ikut diperbarui: terkunci sejak dibuat. */
export const SIMPAN_TEMPLATE_SQL =
  "INSERT INTO hr_kinerja_template (id_template, nama, kelompok, keterangan, is_bawaan, is_aktif, diubah_oleh, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, datetime('now'), datetime('now')) ON CONFLICT(id_template) DO UPDATE SET nama = excluded.nama, keterangan = excluded.keterangan, is_bawaan = excluded.is_bawaan, is_aktif = excluded.is_aktif, diubah_oleh = excluded.diubah_oleh, updated_at = excluded.updated_at;";
/** Satu bawaan per kelompok, di batch yang sama dengan simpan template. */
export const LEPAS_BAWAAN_SQL =
  "UPDATE hr_kinerja_template SET is_bawaan = 0, updated_at = datetime('now') WHERE kelompok = ?1 AND id_template <> ?2 AND is_bawaan = 1;";
/** Tipe dan template aspek tidak ikut diperbarui: terkunci sejak dibuat. */
export const SIMPAN_ASPEK_SQL =
  "INSERT INTO hr_kinerja_aspek (id_aspek, id_template, nama, tipe, bobot, panduan, urutan, is_aktif, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, datetime('now'), datetime('now')) ON CONFLICT(id_aspek) DO UPDATE SET nama = excluded.nama, bobot = excluded.bobot, panduan = excluded.panduan, urutan = excluded.urutan, is_aktif = excluded.is_aktif, updated_at = excluded.updated_at;";
export const SEED_TEMPLATE_SQL =
  "INSERT OR IGNORE INTO hr_kinerja_template (id_template, nama, kelompok, keterangan, is_bawaan, is_aktif, diubah_oleh) VALUES (?1, ?2, ?3, ?4, 1, 1, 'sistem');";
export const SEED_ASPEK_SQL =
  "INSERT OR IGNORE INTO hr_kinerja_aspek (id_aspek, id_template, nama, tipe, bobot, panduan, urutan) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7);";
/** Penanda Kepala TU untuk penilai bawaan tendik (Q-103), tersinkron. */
export const SEED_TUGAS_KA_TU_SQL =
  "INSERT OR IGNORE INTO hr_tugas_jenis (id_jenis, nama, ekuivalen_jp) VALUES ('tgs-ka-tu', 'Kepala Tata Usaha', 0);";
export const PENGATURAN_KINERJA_SQL =
  "SELECT key, value FROM setting_gex_system WHERE key IN ('hr_kinerja_ambang', 'hr_kinerja_predikat', 'hr_kinerja_tanpa_kbm') ORDER BY key;";

// Template bawaan (seed cloud v71)

export interface AspekBawaan {
  id_aspek: string;
  nama: string;
  tipe: TipeAspek;
  bobot: number;
  panduan: string;
}

export interface TemplateBawaan {
  id_template: string;
  nama: string;
  kelompok: KelompokKinerja;
  keterangan: string;
  aspek: AspekBawaan[];
}

export const TEMPLATE_BAWAAN = TEMPLATE_BAWAAN_JSON as TemplateBawaan[];

/** Cermin `seed_statements`: template, aspeknya, lalu `tgs-ka-tu`. */
export function seedKinerja(): { sql: string; args: (string | number)[] }[] {
  const hasil: { sql: string; args: (string | number)[] }[] = [];
  for (const t of TEMPLATE_BAWAAN) {
    hasil.push({
      sql: SEED_TEMPLATE_SQL,
      args: [t.id_template, t.nama, t.kelompok, t.keterangan],
    });
    t.aspek.forEach((a, urutan) => {
      hasil.push({
        sql: SEED_ASPEK_SQL,
        args: [
          a.id_aspek,
          t.id_template,
          a.nama,
          a.tipe,
          a.bobot,
          a.panduan,
          urutan,
        ],
      });
    });
  }
  hasil.push({ sql: SEED_TUGAS_KA_TU_SQL, args: [] });
  return hasil;
}

// Template

export interface AspekDraft {
  id_aspek?: string;
  nama: string;
  tipe: string;
  bobot: number;
  panduan?: string;
  is_aktif: boolean;
}

export interface TemplateDraft {
  id_template?: string;
  nama: string;
  kelompok: string;
  keterangan?: string;
  is_bawaan: boolean;
  is_aktif: boolean;
  aspek: AspekDraft[];
}

export interface AspekSah {
  id_aspek: string | null;
  nama: string;
  tipe: string;
  bobot: number;
  panduan: string | null;
  urutan: number;
  is_aktif: boolean;
}

export interface TemplateSah {
  id_template: string | null;
  nama: string;
  kelompok: string;
  keterangan: string | null;
  is_bawaan: boolean;
  is_aktif: boolean;
  aspek: AspekSah[];
}

const kosongJadiNull = (teks: string | undefined) => {
  const t = (teks ?? "").trim();
  return t === "" ? null : t;
};

/** Cermin `validasi_template`; urutan pemeriksaan dan pesannya sama. */
export function validasiTemplate(draft: TemplateDraft): Hasil<TemplateSah> {
  const nama = draft.nama.trim();
  if (nama === "") return { ok: false, galat: "Nama template wajib diisi." };
  if (panjang(nama) > MAKS_NAMA_TEMPLATE) {
    return {
      ok: false,
      galat: `Nama template maksimal ${MAKS_NAMA_TEMPLATE} karakter.`,
    };
  }
  const kelompok = draft.kelompok;
  if (!(KELOMPOK_KINERJA as readonly string[]).includes(kelompok)) {
    return { ok: false, galat: "Kelompok template harus Guru atau Tendik." };
  }
  const keterangan = kosongJadiNull(draft.keterangan);
  if (keterangan && panjang(keterangan) > MAKS_KETERANGAN) {
    return {
      ok: false,
      galat: `Keterangan maksimal ${MAKS_KETERANGAN} karakter.`,
    };
  }
  if (draft.is_bawaan && !draft.is_aktif) {
    return { ok: false, galat: "Template bawaan tidak bisa dinonaktifkan." };
  }
  if (draft.aspek.length > MAKS_ASPEK) {
    return { ok: false, galat: `Aspek paling banyak ${MAKS_ASPEK}.` };
  }

  const aspek: AspekSah[] = [];
  const namaDipakai = new Set<string>();
  for (const [urutan, a] of draft.aspek.entries()) {
    const namaAspek = a.nama.trim();
    if (namaAspek === "")
      return { ok: false, galat: "Nama aspek wajib diisi." };
    if (panjang(namaAspek) > MAKS_NAMA_ASPEK) {
      return {
        ok: false,
        galat: `Nama aspek maksimal ${MAKS_NAMA_ASPEK} karakter.`,
      };
    }
    if (!(TIPE_ASPEK as readonly string[]).includes(a.tipe)) {
      return { ok: false, galat: `Tipe aspek "${a.tipe}" tidak dikenal.` };
    }
    if (kelompok === "Tendik" && TIPE_KHUSUS_GURU.includes(a.tipe)) {
      return {
        ok: false,
        galat: `Aspek ${a.tipe} hanya untuk template Guru.`,
      };
    }
    if (!Number.isInteger(a.bobot) || a.bobot < 1 || a.bobot > TOTAL_BOBOT) {
      return {
        ok: false,
        galat: `Bobot aspek "${namaAspek}" harus bilangan bulat 1 sampai 100.`,
      };
    }
    const panduan = kosongJadiNull(a.panduan);
    if (panduan && panjang(panduan) > MAKS_PANDUAN) {
      return {
        ok: false,
        galat: `Panduan aspek "${namaAspek}" maksimal ${MAKS_PANDUAN} karakter.`,
      };
    }
    const kunci = namaAspek.toLowerCase();
    if (namaDipakai.has(kunci)) {
      return {
        ok: false,
        galat: `Nama aspek "${namaAspek}" dipakai dua kali.`,
      };
    }
    namaDipakai.add(kunci);
    aspek.push({
      id_aspek: kosongJadiNull(a.id_aspek),
      nama: namaAspek,
      tipe: a.tipe,
      bobot: a.bobot,
      panduan,
      urutan,
      is_aktif: a.is_aktif,
    });
  }

  const aktif = aspek.filter((a) => a.is_aktif);
  if (aktif.length === 0) {
    return {
      ok: false,
      galat: "Template butuh paling sedikit satu aspek aktif.",
    };
  }
  if (aktif.length > MAKS_ASPEK_AKTIF) {
    return {
      ok: false,
      galat: `Aspek aktif paling banyak ${MAKS_ASPEK_AKTIF}.`,
    };
  }
  for (const tipe of TIPE_ASPEK) {
    if (tipe === TIPE_MANUAL) continue;
    if (aktif.filter((a) => a.tipe === tipe).length > 1) {
      return {
        ok: false,
        galat: `Aspek ${tipe} hanya boleh satu per template.`,
      };
    }
  }
  const total = aktif.reduce((jumlah, a) => jumlah + a.bobot, 0);
  if (total !== TOTAL_BOBOT) {
    return {
      ok: false,
      galat: `Total bobot aspek aktif harus 100, sekarang ${total}.`,
    };
  }

  return {
    ok: true,
    nilai: {
      id_template: kosongJadiNull(draft.id_template),
      nama,
      kelompok,
      keterangan,
      is_bawaan: draft.is_bawaan,
      is_aktif: draft.is_aktif,
      aspek,
    },
  };
}

/**
 * Cermin `periksa_template_lama`: kelompok, tipe aspek, dan keberadaan aspek
 * lama terkunci. `kelompokLama` null = template baru.
 */
export function periksaTemplateLama(
  baru: TemplateSah,
  kelompokLama: string | null,
  aspekLama: { id_aspek: string; tipe: string }[],
): Hasil<null> {
  if (kelompokLama !== null && kelompokLama !== baru.kelompok) {
    return { ok: false, galat: "Kelompok template tidak bisa diubah." };
  }
  const lama = new Map(aspekLama.map((a) => [a.id_aspek, a.tipe]));
  for (const a of baru.aspek) {
    if (a.id_aspek === null) continue;
    const tipe = lama.get(a.id_aspek);
    if (tipe === undefined) {
      return { ok: false, galat: "Aspek tidak dikenal untuk template ini." };
    }
    if (tipe !== a.tipe) {
      return { ok: false, galat: `Tipe aspek "${a.nama}" tidak bisa diubah.` };
    }
  }
  const dikirim = new Set(baru.aspek.map((a) => a.id_aspek));
  for (const id of lama.keys()) {
    if (!dikirim.has(id)) {
      return {
        ok: false,
        galat: "Aspek tidak bisa dihapus; nonaktifkan saja.",
      };
    }
  }
  return { ok: true, nilai: null };
}

// Pengaturan

export interface Predikat {
  ambang: number;
  nama: string;
}

export interface RentangTanpaKbm {
  mulai: string;
  selesai: string;
  nama: string;
}

const ANGKA = /^\d+$/;

/** Cermin `validasi_ambang`: bentuk kanonik `950,900,800,700`. */
export function validasiAmbang(teks: string): Hasil<string> {
  const bagian = teks.split(",").map((s) => s.trim());
  if (bagian.length !== 4 || !bagian.every((s) => ANGKA.test(s))) {
    return { ok: false, galat: PESAN_AMBANG };
  }
  const angka = bagian.map(Number);
  for (const [i, a] of angka.entries()) {
    if (a < 1 || a > 1000) return { ok: false, galat: PESAN_AMBANG };
    if (i > 0 && a >= (angka[i - 1] as number)) {
      return { ok: false, galat: PESAN_AMBANG };
    }
  }
  return { ok: true, nilai: angka.join(",") };
}

/** Cermin `parse_ambang`: kosong atau rusak = bawaan. */
export function parseAmbang(nilai: string | null): number[] {
  const hasil = nilai === null ? null : validasiAmbang(nilai);
  return hasil?.ok ? hasil.nilai.split(",").map(Number) : [...AMBANG_BAWAAN];
}

/** Cermin `validasi_predikat`: bentuk kanonik `9100:Amat Baik|…|0:Kurang`. */
export function validasiPredikat(teks: string): Hasil<string> {
  const bagian = teks.split("|");
  if (bagian.length < MIN_PREDIKAT || bagian.length > MAKS_PREDIKAT) {
    return { ok: false, galat: PESAN_PREDIKAT };
  }
  const daftar: Predikat[] = [];
  for (const b of bagian) {
    const titik = b.indexOf(":");
    if (titik < 0) return { ok: false, galat: PESAN_PREDIKAT };
    const ambangTeks = b.slice(0, titik).trim();
    const nama = b.slice(titik + 1).trim();
    if (!ANGKA.test(ambangTeks)) return { ok: false, galat: PESAN_PREDIKAT };
    const ambang = Number(ambangTeks);
    if (ambang > 10000) return { ok: false, galat: PESAN_PREDIKAT };
    if (
      nama === "" ||
      panjang(nama) > MAKS_NAMA_PREDIKAT ||
      nama.includes(":")
    ) {
      return { ok: false, galat: PESAN_NAMA_PREDIKAT };
    }
    const sebelum = daftar.at(-1);
    if (sebelum && ambang >= sebelum.ambang) {
      return { ok: false, galat: PESAN_PREDIKAT };
    }
    daftar.push({ ambang, nama });
  }
  if (daftar.at(-1)?.ambang !== 0) return { ok: false, galat: PESAN_PREDIKAT };
  return {
    ok: true,
    nilai: daftar.map((p) => `${p.ambang}:${p.nama}`).join("|"),
  };
}

function urai(kanonik: string): Predikat[] {
  return kanonik.split("|").map((b) => {
    const titik = b.indexOf(":");
    return { ambang: Number(b.slice(0, titik)), nama: b.slice(titik + 1) };
  });
}

/** Cermin `parse_predikat`: kosong atau rusak = bawaan. */
export function parsePredikat(nilai: string | null): Predikat[] {
  const hasil = nilai === null ? null : validasiPredikat(nilai);
  return urai(hasil?.ok ? hasil.nilai : PREDIKAT_BAWAAN);
}

/** Cermin `predikat_nilai`: pasangan pertama yang ambangnya ≤ nilai ×100. */
export function predikatNilai(nilaiX100: number, daftar: Predikat[]): string {
  return (
    daftar.find((p) => p.ambang <= nilaiX100)?.nama ?? daftar.at(-1)?.nama ?? ""
  );
}

// `[\s\S]*`, bukan `.*`: nama boleh memuat karakter apa pun, sama dengan
// pemotongan manual di `hr_kinerja.rs`.
const RENTANG = /^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2}):([\s\S]*)$/;

const selisihHari = (mulai: string, selesai: string) =>
  (Date.parse(`${selesai}T00:00:00Z`) - Date.parse(`${mulai}T00:00:00Z`)) /
  86_400_000;

/** Cermin `validasi_tanpa_kbm`: kosong sah; bentuk kanonik dipisah `|`. */
export function validasiTanpaKbm(teks: string): Hasil<string> {
  const isi = teks.trim();
  if (isi === "") return { ok: true, nilai: "" };
  const bagian = isi.split("|").map((s) => s.trim());
  if (bagian.length > MAKS_RENTANG_KBM) {
    return {
      ok: false,
      galat: `Rentang tanpa KBM paling banyak ${MAKS_RENTANG_KBM}.`,
    };
  }
  const hasil: string[] = [];
  for (const b of bagian) {
    const cocok = RENTANG.exec(b);
    if (!cocok) {
      return {
        ok: false,
        galat: `Rentang "${b}" harus berbentuk YYYY-MM-DD..YYYY-MM-DD:Nama.`,
      };
    }
    const mulai = cocok[1] as string;
    const selesai = cocok[2] as string;
    const nama = (cocok[3] as string).trim();
    if (nama === "" || panjang(nama) > MAKS_NAMA_RENTANG) {
      return {
        ok: false,
        galat: `Nama rentang 1 sampai ${MAKS_NAMA_RENTANG} karakter.`,
      };
    }
    if (!tanggalValid(mulai) || !tanggalValid(selesai)) {
      return { ok: false, galat: `Tanggal rentang "${nama}" tidak valid.` };
    }
    const hari = selisihHari(mulai, selesai);
    if (hari < 0) {
      return { ok: false, galat: `Rentang "${nama}" berakhir sebelum mulai.` };
    }
    if (hari + 1 > MAKS_HARI_RENTANG) {
      return {
        ok: false,
        galat: `Rentang "${nama}" paling panjang ${MAKS_HARI_RENTANG} hari.`,
      };
    }
    hasil.push(`${mulai}..${selesai}:${nama}`);
  }
  return { ok: true, nilai: hasil.join("|") };
}

/** Cermin `parse_tanpa_kbm`: kosong atau rusak = tanpa rentang. */
export function parseTanpaKbm(nilai: string | null): RentangTanpaKbm[] {
  const hasil = nilai === null ? null : validasiTanpaKbm(nilai);
  if (!hasil?.ok || hasil.nilai === "") return [];
  return hasil.nilai.split("|").map((b) => {
    const cocok = RENTANG.exec(b) as RegExpExecArray;
    return {
      mulai: cocok[1] as string,
      selesai: cocok[2] as string,
      nama: cocok[3] as string,
    };
  });
}

export interface PengaturanKinerjaDraft {
  ambang: string;
  predikat: string;
  tanpa_kbm: string;
}

/** Cermin `validasi_pengaturan_kinerja`: ketiga kunci wajib sekaligus. */
export function validasiPengaturanKinerja(
  draft: PengaturanKinerjaDraft,
): Hasil<[string, string][]> {
  const ambang = validasiAmbang(draft.ambang);
  if (!ambang.ok) return ambang;
  const predikat = validasiPredikat(draft.predikat);
  if (!predikat.ok) return predikat;
  const tanpaKbm = validasiTanpaKbm(draft.tanpa_kbm);
  if (!tanpaKbm.ok) return tanpaKbm;
  return {
    ok: true,
    nilai: [
      [KUNCI_AMBANG, ambang.nilai],
      [KUNCI_PREDIKAT, predikat.nilai],
      [KUNCI_TANPA_KBM, tanpaKbm.nilai],
    ],
  };
}

export interface PengaturanKinerja {
  ambang: number[];
  predikat: Predikat[];
  tanpa_kbm: RentangTanpaKbm[];
}

/** Cermin `pengaturan_kinerja`: nilai berlaku dari `setting_gex_system`. */
export function pengaturanKinerja(
  peta: Record<string, string | null | undefined>,
): PengaturanKinerja {
  return {
    ambang: parseAmbang(peta[KUNCI_AMBANG] ?? null),
    predikat: parsePredikat(peta[KUNCI_PREDIKAT] ?? null),
    tanpa_kbm: parseTanpaKbm(peta[KUNCI_TANPA_KBM] ?? null),
  };
}

/** Cermin `skor_ambang`: permil ke skor 1–5 lewat (a₅, a₄, a₃, a₂). */
export function skorAmbang(permil: number, ambang: readonly number[]): number {
  for (const [i, a] of ambang.entries()) {
    if (permil >= a) return 5 - i;
  }
  return 1;
}

// Bentuk data untuk layar

export interface AspekKinerja {
  id_aspek: string;
  id_template: string;
  nama: string;
  tipe: TipeAspek;
  bobot: number;
  panduan: string;
  urutan: number;
  is_aktif: number;
}

export interface TemplateKinerja {
  id_template: string;
  nama: string;
  kelompok: KelompokKinerja;
  keterangan: string;
  is_bawaan: number;
  is_aktif: number;
  diubah_oleh: string;
  updated_at: string;
  aspek: AspekKinerja[];
}

export interface DataTemplateKinerja {
  template: TemplateKinerja[];
  pengaturan: PengaturanKinerja;
}

// Zod (rute Web; `.strict()`, enum diperiksa `validasiTemplate`)

const aspekDraftSchema = z
  .object({
    id_aspek: z.string().max(200).optional(),
    nama: z.string().max(500),
    tipe: z.string().max(100),
    bobot: z.number(),
    panduan: z.string().max(5000).optional(),
    is_aktif: z.boolean(),
  })
  .strict();

export const templateDraftSchema = z
  .object({
    id_template: z.string().max(200).optional(),
    nama: z.string().max(500),
    kelompok: z.string().max(50),
    keterangan: z.string().max(5000).optional(),
    is_bawaan: z.boolean(),
    is_aktif: z.boolean(),
    aspek: z.array(aspekDraftSchema).max(MAKS_ASPEK + 1),
  })
  .strict();

export const pengaturanKinerjaSchema = z
  .object({
    ambang: z.string().max(200),
    predikat: z.string().max(1000),
    tanpa_kbm: z.string().max(5000),
  })
  .strict();

export const kosongSchema = z.object({}).strict();
