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
import { rentangJamKe } from "./class-attendance";
import { hariIso, tanggalValid } from "./hari-kerja";
import type { HolidayWhitelistEntry } from "./holiday-whitelist";
import { KEPALA_UNIT_SQL } from "./hr-beban";
import { PESAN_DI_LUAR_CAKUPAN, PESAN_DIRI_SENDIRI } from "./hr-keluar";
import TEMPLATE_BAWAAN_JSON from "./hr-kinerja-template-bawaan.json";
import {
  JADWAL_JP_SQL,
  type Jadwal,
  type JadwalJp,
  jpTerdampak,
  PENGAJUAN_BERLAKU_SQL,
  type PengajuanJp,
  taMemuat,
  tanggalRentang,
  tanggalWajib,
} from "./hr-pengajuan";

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

// SQL penilaian (5b). Penjaga keadaan memakai ?1 = id_penilaian.

/** Belum Final dan belum Batal. */
export const TERBUKA_SQL =
  "NOT EXISTS (SELECT 1 FROM hr_kinerja_keputusan k WHERE k.id_penilaian = ?1 AND k.jenis IN ('Final', 'Batal'))";
const AKHIR_AJUKAN_SQL =
  "COALESCE((SELECT a.jenis FROM hr_kinerja_keputusan a WHERE a.id_penilaian = ?1 AND a.jenis IN ('Ajukan', 'Kembalikan') ORDER BY a.urut DESC LIMIT 1), '')";
/** Draf: terbuka, dan keputusan Ajukan/Kembalikan terakhir bukan Ajukan. */
export const DRAF_SQL = `${TERBUKA_SQL} AND ${AKHIR_AJUKAN_SQL} <> 'Ajukan'`;
/** Diajukan: terbuka, dan keputusan Ajukan/Kembalikan terakhir adalah Ajukan. */
export const DIAJUKAN_SQL = `${TERBUKA_SQL} AND ${AKHIR_AJUKAN_SQL} = 'Ajukan'`;

export const TAHUN_AJARAN_SQL =
  "SELECT id_tahun_ajaran, nama_tahun, semester, tanggal_mulai, tanggal_selesai FROM akademik_tahun_ajaran ORDER BY tanggal_mulai, id_tahun_ajaran\n-- batas: dua semester per tahun ajaran sekolah\n;";
/**
 * Pegawai (bukan siswa) untuk penilaian; ?1 kosong = semua. Atasan hanya
 * bila aktif dan belum keluar.
 */
export const KINERJA_PEGAWAI_SQL =
  "SELECT m.id_unik, m.nama, COALESCE(m.unit, '') AS unit, COALESCE(m.divisi, '') AS divisi, CASE WHEN g.id_guru IS NOT NULL OR LOWER(TRIM(COALESCE(m.jenis_personil, ''))) = 'guru' THEN 'Guru' ELSE 'Tendik' END AS kelompok, s.hari_kerja, s.kode_shift, COALESCE(m.tanggal_daftar, '') AS tanggal_daftar, COALESCE(m.id_keluar, '') AS id_keluar, COALESCE(m.tanggal_selesai_aktif, '') AS tanggal_selesai_aktif, COALESCE(m.status_aktif, 'Aktif') AS status_aktif, CASE WHEN EXISTS (SELECT 1 FROM master_data a WHERE a.id_unik = m.id_atasan AND a.status_aktif = 'Aktif' AND a.id_keluar IS NULL) THEN m.id_atasan ELSE '' END AS id_atasan, COALESCE(j.nama, m.jabatan_status, '') AS jabatan FROM master_data m LEFT JOIN guru_data g ON g.id_guru = m.id_unik LEFT JOIN tbl_shift s ON s.id_shift = m.id_shift LEFT JOIN hr_jabatan j ON j.id_jabatan = m.id_jabatan WHERE (?1 = '' OR m.id_unik = ?1) AND LOWER(TRIM(COALESCE(m.jenis_personil, ''))) <> 'siswa' AND NOT EXISTS (SELECT 1 FROM siswa_data sd WHERE sd.id_siswa = m.id_unik) ORDER BY m.nama, m.id_unik\n-- batas: pegawai sekolah (guru dan tendik), dibatasi jumlah personil lembaga\n;";
/**
 * Kolom `LAPORAN_KEHADIRAN_SQL.hari` apa adanya + saringan satu pegawai
 * (?3), bukan `GATE_SUMMARY_SUBQUERY` (§23.1 temuan 1).
 */
export const KINERJA_HARI_SQL =
  "SELECT json_object('id', id_karyawan, 'tanggal', tanggal, 'hadir', MAX(CASE WHEN (COALESCE(TRIM(jam_masuk), '') <> '' AND COALESCE(status_kehadiran, '') <> 'Alfa') OR status_kehadiran IN ('Hadir', 'Terlambat') THEN 1 ELSE 0 END), 'telat', MAX(COALESCE(menit_terlambat, 0)), 'menit', SUM(COALESCE(menit_terlambat, 0)), 'sakit', MAX(CASE WHEN status_kehadiran = 'Sakit' THEN 1 ELSE 0 END), 'izin', MAX(CASE WHEN status_kehadiran = 'Izin' THEN 1 ELSE 0 END), 'dispensasi', MAX(CASE WHEN status_kehadiran IN ('Dispen', 'Dispensasi') THEN 1 ELSE 0 END), 'alfa', MAX(CASE WHEN status_kehadiran = 'Alfa' THEN 1 ELSE 0 END)) FROM absensi_harian WHERE id_karyawan = ?3 AND tanggal BETWEEN ?1 AND ?2 GROUP BY id_karyawan, tanggal ORDER BY tanggal\n-- batas: satu baris per tanggal dalam satu periode penilaian\n;";
/**
 * Kolom `PENGAJUAN_RENTANG_SQL` + satu pegawai (?3), predikat
 * `PENGAJUAN_BERLAKU_SQL` harfiah.
 */
export const KINERJA_PENGAJUAN_SQL = `SELECT p.id_pengajuan, p.id_karyawan, p.tanggal_mulai, p.tanggal_selesai, p.kelompok, p.dampak_gaji, p.potong_jatah, p.jam_mulai_ke, p.jam_sampai_ke, p.setengah_hari FROM hr_pengajuan p WHERE p.id_karyawan = ?3 AND p.tanggal_mulai <= ?2 AND p.tanggal_selesai >= ?1 AND ${PENGAJUAN_BERLAKU_SQL} ORDER BY p.tanggal_mulai, p.id_pengajuan\n-- batas: pengajuan satu pegawai dalam satu periode penilaian\n;`;
/**
 * Pengajuan Menunggu (tanpa keputusan atas sidik kini) per pegawai dalam
 * rentang; ?3 kosong = semua. Tanda `pengajuan_menunggu`.
 */
export const KINERJA_MENUNGGU_SQL =
  "SELECT p.id_karyawan, COUNT(*) AS jumlah FROM hr_pengajuan p WHERE (?3 = '' OR p.id_karyawan = ?3) AND p.tanggal_mulai <= ?2 AND p.tanggal_selesai >= ?1 AND NOT EXISTS (SELECT 1 FROM hr_pengajuan_keputusan b WHERE b.id_pengajuan = p.id_pengajuan AND b.jenis = 'Batal') AND NOT EXISTS (SELECT 1 FROM hr_pengajuan_keputusan k WHERE k.id_pengajuan = p.id_pengajuan AND k.sidik = p.sidik AND k.jenis IN ('Setujui', 'Tolak', 'Setujui Urgent')) GROUP BY p.id_karyawan ORDER BY p.id_karyawan\n-- batas: satu baris per pegawai\n;";
/** Salinan harfiah `KEPALA_UNIT_SQL` dengan jenis tugas `tgs-ka-tu` (Q-103). */
export const KEPALA_TU_SQL = KEPALA_UNIT_SQL.replaceAll(
  "'tgs-kepsek'",
  "'tgs-ka-tu'",
);
/** `JADWAL_JP_SQL` + satu guru (?3); sisanya salinan harfiah (§23.2.4). */
export const KINERJA_JADWAL_SQL = JADWAL_JP_SQL.replace(
  "t.tanggal_selesai >= ?1 ORDER BY",
  "t.tanggal_selesai >= ?1 AND j.id_guru = ?3 ORDER BY",
);
/**
 * Presensi kelas atas nama satu guru (?3). `jurnal_mengajar.id_presensi_mapel`
 * tidak unik, jadi `EXISTS`, bukan JOIN.
 */
export const KINERJA_PRESENSI_SQL =
  "SELECT p.id_presensi_mapel, p.id_rombel, p.tanggal, p.jam_ke, CASE WHEN EXISTS (SELECT 1 FROM jurnal_mengajar jm WHERE jm.id_presensi_mapel = p.id_presensi_mapel) THEN 1 ELSE 0 END AS berjurnal FROM presensi_mapel p WHERE p.id_guru = ?3 AND p.tanggal >= ?1 AND p.tanggal <= ?2 ORDER BY p.tanggal, p.id_rombel, CAST(p.jam_ke AS INTEGER), p.jam_ke, p.id_presensi_mapel\n-- batas: sesi presensi kelas satu guru dalam satu periode penilaian\n;";
/** SP yang berlaku pada suatu saat di dalam periode (Q-109, informasi). */
export const KINERJA_SP_SQL =
  "SELECT id_sp, tingkat, tanggal, berlaku_sampai, COALESCE(nomor, '') AS nomor, pelanggaran FROM hr_sp WHERE id_karyawan = ?1 AND dicabut_pada IS NULL AND tanggal <= ?3 AND berlaku_sampai >= ?2 ORDER BY tanggal, id_sp\n-- batas: surat peringatan satu pegawai\n;";

const PENILAIAN_KOLOM =
  "SELECT p.id_penilaian, p.id_karyawan, COALESCE(m.nama, p.id_karyawan) AS nama, COALESCE(p.id_ref, '') AS id_ref, COALESCE(p.alasan_koreksi, '') AS alasan_koreksi, p.periode_jenis, p.periode_kunci, p.periode_nama, p.periode_mulai, p.periode_selesai, p.id_template, p.template_nama, p.kelompok, COALESCE(p.unit, '') AS unit, COALESCE(p.jabatan, '') AS jabatan, COALESCE(p.status_kepegawaian, '') AS status_kepegawaian, COALESCE(p.id_penilai, '') AS id_penilai, COALESCE(p.penilai_nama, '') AS penilai_nama, p.penilai_oleh, COALESCE(p.catatan, '') AS catatan, COALESCE(p.dihitung_sampai, '') AS dihitung_sampai, p.dibuat_oleh, p.created_at, p.updated_at FROM hr_kinerja_penilaian p LEFT JOIN master_data m ON m.id_unik = p.id_karyawan";
export const PENILAIAN_SATU_SQL = `${PENILAIAN_KOLOM} WHERE p.id_penilaian = ?1;`;
export const PENILAIAN_PERIODE_SQL = `${PENILAIAN_KOLOM} WHERE p.periode_jenis = ?1 AND p.periode_kunci = ?2 ORDER BY nama, p.created_at, p.id_penilaian\n-- batas: satu penilaian akar per pegawai per periode, ditambah koreksinya\n;`;
export const PENILAIAN_PEGAWAI_SQL = `${PENILAIAN_KOLOM} WHERE p.id_karyawan = ?1 ORDER BY p.periode_mulai DESC, p.created_at, p.id_penilaian\n-- batas: dua penilaian per tahun sepanjang masa kerja satu pegawai\n;`;
/** Akar ?1 dan koreksinya. */
export const KELUARGA_SQL = `${PENILAIAN_KOLOM} WHERE p.id_penilaian = ?1 OR p.id_ref = ?1 ORDER BY p.created_at, p.id_penilaian\n-- batas: satu penilaian akar dan koreksinya\n;`;
/** ?1 = larik JSON id penilaian. */
export const KEPUTUSAN_KINERJA_SQL =
  "SELECT k.id_keputusan, k.id_penilaian, k.urut, k.jenis, COALESCE(k.alasan, '') AS alasan, k.nilai_akhir, COALESCE(k.predikat, '') AS predikat, k.oleh, COALESCE(k.id_karyawan_oleh, '') AS id_karyawan_oleh, k.created_at FROM hr_kinerja_keputusan k WHERE k.id_penilaian IN (SELECT value FROM json_each(?1)) ORDER BY k.id_penilaian, k.urut\n-- batas: beberapa keputusan per penilaian yang dibaca\n;";
/** ?1 = larik JSON id penilaian. */
export const NILAI_KINERJA_SQL =
  "SELECT id_penilaian, id_aspek, aspek_nama, tipe, bobot, urutan, skor, skor_hitung, catatan, rincian FROM hr_kinerja_nilai WHERE id_penilaian IN (SELECT value FROM json_each(?1)) ORDER BY id_penilaian, urutan, id_aspek\n-- batas: paling banyak 20 aspek per penilaian yang dibaca\n;";
/** Akar hidup (tidak dibatalkan) yang bertumpuk dengan ?1..?2; ?3 kosong = semua pegawai. */
export const AKAR_RENTANG_SQL =
  "SELECT x.id_penilaian, x.id_karyawan, x.periode_mulai, x.periode_selesai FROM hr_kinerja_penilaian x WHERE x.id_ref IS NULL AND x.periode_mulai <= ?2 AND x.periode_selesai >= ?1 AND (?3 = '' OR x.id_karyawan = ?3) AND NOT EXISTS (SELECT 1 FROM hr_kinerja_keputusan b WHERE b.id_penilaian = x.id_penilaian AND b.jenis = 'Batal') ORDER BY x.id_karyawan, x.periode_mulai\n-- batas: satu penilaian akar per pegawai per periode\n;";
export const KEPUTUSAN_ADA_SQL =
  "SELECT 1 FROM hr_kinerja_keputusan WHERE id_keputusan = ?1;";

const KOLOM_PENILAIAN =
  "INSERT INTO hr_kinerja_penilaian (id_penilaian, id_karyawan, id_ref, alasan_koreksi, periode_jenis, periode_kunci, periode_nama, periode_mulai, periode_selesai, id_template, template_nama, kelompok, unit, jabatan, status_kepegawaian, id_penilai, penilai_nama, penilai_oleh, catatan, dihitung_sampai, dibuat_oleh, created_at, updated_at)";
/**
 * Penilaian akar baru; tumpang tindih ditolak di statement yang sama (Q-94).
 * ?16 penilai_oleh juga menjadi `dibuat_oleh`.
 */
export const BUAT_PENILAIAN_SQL = `${KOLOM_PENILAIAN} SELECT ?1, ?2, NULL, NULL, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?16, datetime('now'), datetime('now') WHERE NOT EXISTS (SELECT 1 FROM hr_kinerja_penilaian x WHERE x.id_karyawan = ?2 AND x.id_ref IS NULL AND x.periode_mulai <= ?7 AND x.periode_selesai >= ?6 AND NOT EXISTS (SELECT 1 FROM hr_kinerja_keputusan b WHERE b.id_penilaian = x.id_penilaian AND b.jenis = 'Batal'));`;
/** Koreksi atas akar ?10: hanya bila akar Final, tidak Batal, dan tanpa koreksi terbuka. */
export const KOREKSI_PENILAIAN_SQL = `${KOLOM_PENILAIAN} SELECT ?1, a.id_karyawan, a.id_penilaian, ?2, a.periode_jenis, a.periode_kunci, a.periode_nama, a.periode_mulai, a.periode_selesai, ?3, ?4, a.kelompok, a.unit, a.jabatan, a.status_kepegawaian, ?5, ?6, ?7, ?8, ?9, ?7, datetime('now'), datetime('now') FROM hr_kinerja_penilaian a WHERE a.id_penilaian = ?10 AND a.id_ref IS NULL AND EXISTS (SELECT 1 FROM hr_kinerja_keputusan f WHERE f.id_penilaian = a.id_penilaian AND f.jenis = 'Final') AND NOT EXISTS (SELECT 1 FROM hr_kinerja_keputusan b WHERE b.id_penilaian = a.id_penilaian AND b.jenis = 'Batal') AND NOT EXISTS (SELECT 1 FROM hr_kinerja_penilaian x WHERE x.id_ref = a.id_penilaian AND NOT EXISTS (SELECT 1 FROM hr_kinerja_keputusan k WHERE k.id_penilaian = x.id_penilaian AND k.jenis IN ('Final', 'Batal')));`;
export const UBAH_PENILAIAN_SQL = `UPDATE hr_kinerja_penilaian SET id_template = ?2, template_nama = ?3, id_penilai = ?4, penilai_nama = ?5, penilai_oleh = ?6, catatan = ?7, dihitung_sampai = ?8, updated_at = datetime('now') WHERE id_penilaian = ?1 AND ${DRAF_SQL};`;
export const SAMPAI_PENILAIAN_SQL = `UPDATE hr_kinerja_penilaian SET dihitung_sampai = ?2, updated_at = datetime('now') WHERE id_penilaian = ?1 AND ${DRAF_SQL};`;
/** Baris nilai hanya ditulis ulang selama Draf. */
export const HAPUS_NILAI_SQL = `DELETE FROM hr_kinerja_nilai WHERE id_penilaian = ?1 AND ${DRAF_SQL};`;
export const SIMPAN_NILAI_SQL = `INSERT INTO hr_kinerja_nilai (id_nilai, id_penilaian, id_aspek, aspek_nama, tipe, bobot, urutan, skor, skor_hitung, catatan, rincian) SELECT ?1 || ':' || ?2, ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10 WHERE EXISTS (SELECT 1 FROM hr_kinerja_penilaian p WHERE p.id_penilaian = ?1) AND ${DRAF_SQL};`;
const KEPUTUSAN_KOLOM =
  "INSERT INTO hr_kinerja_keputusan (id_keputusan, id_penilaian, urut, jenis, alasan, nilai_akhir, predikat, oleh, id_karyawan_oleh, created_at) SELECT ?2, ?1, (SELECT COALESCE(MAX(u.urut), 0) + 1 FROM hr_kinerja_keputusan u WHERE u.id_penilaian = ?1), ?3, ?4, ?5, ?6, ?7, ?8, datetime('now') WHERE";
/** Keputusan append-only; `urut` = MAX + 1 di statement yang sama. Ajukan dijaga `DRAF_SQL`. */
export const KEPUTUSAN_DRAF_SQL = `${KEPUTUSAN_KOLOM} EXISTS (SELECT 1 FROM hr_kinerja_penilaian p WHERE p.id_penilaian = ?1) AND ${DRAF_SQL};`;
/** Kembalikan dan Final dijaga `DIAJUKAN_SQL`. */
export const KEPUTUSAN_DIAJUKAN_SQL = `${KEPUTUSAN_KOLOM} ${DIAJUKAN_SQL};`;
/** Batal dijaga `TERBUKA_SQL`. */
export const KEPUTUSAN_TERBUKA_SQL = `${KEPUTUSAN_KOLOM} ${TERBUKA_SQL};`;

// Penilaian: aturan murni (5b, §23.2.2–23.2.6)

export const JENIS_PERIODE = [
  "Semester",
  "Tahun Ajaran",
  "Rentang Tanggal",
] as const;
export type JenisPeriode = (typeof JENIS_PERIODE)[number];
export const AKSI_SIMPAN = ["Buat", "Simpan", "Muat ulang", "Koreksi"] as const;
export type AksiSimpan = (typeof AKSI_SIMPAN)[number];
export const JENIS_KEPUTUSAN = [
  "Ajukan",
  "Kembalikan",
  "Final",
  "Batal",
] as const;
export type JenisKeputusan = (typeof JENIS_KEPUTUSAN)[number];
export const AKSI_KINERJA = [...AKSI_SIMPAN, ...JENIS_KEPUTUSAN] as const;
export const STATUS_DRAF = "Draf";
export const STATUS_DIAJUKAN = "Diajukan";
export const STATUS_FINAL = "Final";
export const STATUS_DIBATALKAN = "Dibatalkan";
export type StatusKinerja =
  | typeof STATUS_DRAF
  | typeof STATUS_DIAJUKAN
  | typeof STATUS_FINAL
  | typeof STATUS_DIBATALKAN;
export const MAKS_CATATAN_ASPEK = 1000;
export const MAKS_CATATAN = 2000;
export const MAKS_ALASAN = 500;
export const MAKS_ALASAN_KOREKSI = 1000;
/** Kelompok pengajuan berlaku yang mengeluarkan tanggal dari pembagi (§23.2.3 baris 5). */
export const KELOMPOK_DIKECUALIKAN: readonly string[] = [
  "Cuti",
  "Izin",
  "Sakit",
];
/** Dinas Luar dihitung tepat waktu, seperti laporan sekolah (§23.2.3 baris 4). */
export const KELOMPOK_DINAS_LUAR = "Dinas Luar";

export const PESAN_IZIN = "Anda tidak punya izin untuk aksi penilaian ini.";
export const PESAN_OTOMATIS_BERUBAH =
  "Angka aspek otomatis berubah sejak layar dimuat. Periksa angka barunya, lalu ajukan sekali lagi.";
export const PESAN_KEADAAN_BERUBAH =
  "Penilaian ini baru saja diubah orang lain. Muat ulang, lalu coba lagi.";
export const PESAN_BELUM_FINAL_SENDIRI =
  "Penilaian atas diri Anda baru bisa dilihat sesudah final.";
export const PESAN_TIDAK_DITEMUKAN = "Penilaian kinerja tidak ditemukan.";

export interface TahunAjaran {
  id_tahun_ajaran: string;
  nama_tahun: string;
  semester: string;
  tanggal_mulai: string;
  tanggal_selesai: string;
}

export interface Periode {
  jenis: string;
  kunci: string;
  nama: string;
  mulai: string;
  selesai: string;
}

/** Jenis periode bebas (2026-11-21): kunci `YYYY-MM-DD_YYYY-MM-DD`. */
export const PERIODE_RENTANG = "Rentang Tanggal";
export const MAKS_HARI_PERIODE = 366;

/** Cermin `periode_rentang`: rentang sendiri, paling panjang 366 hari. */
export function periodeRentang(kunciMasuk: string): Hasil<Periode> {
  const kunci = kunciMasuk.trim();
  const m = /^(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})$/.exec(kunci);
  const mulai = m?.[1] ?? "";
  const selesai = m?.[2] ?? "";
  if (!tanggalValid(mulai) || !tanggalValid(selesai)) {
    return { ok: false, galat: "Rentang tanggal periode tidak valid." };
  }
  const hari = selisihHari(mulai, selesai);
  if (hari < 0) {
    return {
      ok: false,
      galat: "Tanggal selesai periode sebelum tanggal mulai.",
    };
  }
  if (hari + 1 > MAKS_HARI_PERIODE) {
    return {
      ok: false,
      galat: `Periode paling panjang ${MAKS_HARI_PERIODE} hari.`,
    };
  }
  return {
    ok: true,
    nilai: {
      jenis: PERIODE_RENTANG,
      kunci,
      nama: `${mulai} s.d. ${selesai}`,
      mulai,
      selesai,
    },
  };
}

/** Cermin `periode_dari_tahun_ajaran` (Q-94). */
export function periodeDariTahunAjaran(
  jenis: string,
  kunciMasuk: string,
  baris: TahunAjaran[],
): Hasil<Periode> {
  if (!(JENIS_PERIODE as readonly string[]).includes(jenis)) {
    return {
      ok: false,
      galat:
        "Jenis periode harus Semester, Tahun Ajaran, atau Rentang Tanggal.",
    };
  }
  if (jenis === PERIODE_RENTANG) return periodeRentang(kunciMasuk);
  const kunci = kunciMasuk.trim();
  const semester = jenis === "Semester";
  const dipilih = baris.filter((t) =>
    semester ? t.id_tahun_ajaran === kunci : t.nama_tahun.trim() === kunci,
  );
  const pertama = dipilih[0];
  if (kunci === "" || !pertama) {
    return { ok: false, galat: "Periode tidak ditemukan." };
  }
  const nama = semester
    ? `${pertama.nama_tahun.trim()} Semester ${pertama.semester}`
    : `Tahun Ajaran ${kunci}`;
  if (
    dipilih.some(
      (t) =>
        !tanggalValid(t.tanggal_mulai) ||
        !tanggalValid(t.tanggal_selesai) ||
        t.tanggal_selesai < t.tanggal_mulai,
    )
  ) {
    return { ok: false, galat: `Tanggal ${nama} tidak valid.` };
  }
  const mulai = dipilih.map((t) => t.tanggal_mulai).sort()[0] as string;
  const selesai = dipilih
    .map((t) => t.tanggal_selesai)
    .sort()
    .at(-1) as string;
  return { ok: true, nilai: { jenis, kunci, nama, mulai, selesai } };
}

export interface RentangAktif {
  mulai: string;
  akhir: string;
  /** `false` = tanda `periode_tidak_penuh`. */
  penuh: boolean;
}

/** Cermin `rentang_aktif` (§23.2.2). Kosong/tidak valid = tidak memotong. */
export function rentangAktif(
  periodeMulai: string,
  periodeSelesai: string,
  tanggalDaftar: string,
  tanggalKeluar: string,
): RentangAktif | null {
  const sah = (t: string) => (tanggalValid(t.trim()) ? t.trim() : null);
  const daftar = sah(tanggalDaftar);
  const keluar = sah(tanggalKeluar);
  const mulai = daftar && daftar > periodeMulai ? daftar : periodeMulai;
  const akhir = keluar && keluar < periodeSelesai ? keluar : periodeSelesai;
  if (mulai > akhir) return null;
  return {
    mulai,
    akhir,
    penuh: mulai === periodeMulai && akhir === periodeSelesai,
  };
}

/** Cermin `periksa_buat` (§23.2.2): hanya untuk penilaian akar baru. */
export function periksaBuat(
  aktif: boolean,
  sudahKeluar: boolean,
  periodeMulai: string,
  hariIni: string,
  rentang: RentangAktif | null,
): Hasil<null> {
  if (sudahKeluar) {
    return {
      ok: false,
      galat: "Pegawai ini sudah keluar; penilaian baru tidak bisa dibuat.",
    };
  }
  if (!aktif)
    return { ok: false, galat: "Pegawai nonaktif tidak bisa dinilai." };
  if (periodeMulai > hariIni) {
    return { ok: false, galat: "Periode ini belum dimulai." };
  }
  if (!rentang) {
    return { ok: false, galat: "Pegawai ini tidak aktif selama periode itu." };
  }
  return { ok: true, nilai: null };
}

/** Cermin `pesan_bertumpuk`. */
export const pesanBertumpuk = (mulai: string, selesai: string) =>
  `Pegawai ini sudah punya penilaian untuk periode ${mulai} s.d. ${selesai}.`;

export interface IsianNilai {
  id_aspek: string;
  skor: number | null;
  catatan: string | null;
}

export interface PenilaianSah {
  aksi: string;
  id_penilaian: string | null;
  id_karyawan: string | null;
  periode_jenis: string | null;
  periode_kunci: string | null;
  id_template: string | null;
  catatan: string | null;
  alasan_koreksi: string | null;
  nilai: IsianNilai[];
}

export interface PenilaianDraft {
  aksi: string;
  id_penilaian?: string;
  id_karyawan?: string;
  periode_jenis?: string;
  periode_kunci?: string;
  id_template?: string;
  catatan?: string;
  alasan_koreksi?: string;
  nilai?: unknown;
}

const teksDraft = (nilai: unknown) => (typeof nilai === "string" ? nilai : "");

function opsional(
  nilai: unknown,
  label: string,
  maks: number,
): Hasil<string | null> {
  const isi = kosongJadiNull(teksDraft(nilai));
  if (isi && panjang(isi) > maks) {
    return { ok: false, galat: `${label} maksimal ${maks} karakter.` };
  }
  return { ok: true, nilai: isi };
}

/** Cermin `validasi_penilaian`: bentuk isian `save`, tanpa data template. */
export function validasiPenilaian(draft: PenilaianDraft): Hasil<PenilaianSah> {
  const aksi = teksDraft(draft.aksi);
  if (!(AKSI_SIMPAN as readonly string[]).includes(aksi)) {
    return { ok: false, galat: "Aksi penilaian tidak dikenal." };
  }
  const idPenilaian = kosongJadiNull(teksDraft(draft.id_penilaian));
  let idKaryawan: string | null = null;
  let periodeJenis: string | null = null;
  let periodeKunci: string | null = null;
  if (aksi === "Buat") {
    idKaryawan = kosongJadiNull(teksDraft(draft.id_karyawan));
    if (!idKaryawan) return { ok: false, galat: "Pilih pegawai yang dinilai." };
    periodeJenis = teksDraft(draft.periode_jenis);
    if (!(JENIS_PERIODE as readonly string[]).includes(periodeJenis)) {
      return {
        ok: false,
        galat:
          "Jenis periode harus Semester, Tahun Ajaran, atau Rentang Tanggal.",
      };
    }
    periodeKunci = kosongJadiNull(teksDraft(draft.periode_kunci));
    if (!periodeKunci) return { ok: false, galat: "Pilih periode penilaian." };
  } else if (!idPenilaian) {
    return { ok: false, galat: "Penilaian wajib dipilih." };
  }
  const catatan = opsional(draft.catatan, "Catatan penilaian", MAKS_CATATAN);
  if (!catatan.ok) return catatan;
  let alasanKoreksi: string | null = null;
  if (aksi === "Koreksi") {
    const alasan = opsional(
      draft.alasan_koreksi,
      "Alasan koreksi",
      MAKS_ALASAN_KOREKSI,
    );
    if (!alasan.ok) return alasan;
    if (!alasan.nilai)
      return { ok: false, galat: "Alasan koreksi wajib diisi." };
    alasanKoreksi = alasan.nilai;
  }
  const mentah = draft.nilai ?? [];
  if (!Array.isArray(mentah) || mentah.length > MAKS_ASPEK) {
    return { ok: false, galat: "Isian nilai tidak valid." };
  }
  const nilai: IsianNilai[] = [];
  for (const n of mentah as Record<string, unknown>[]) {
    const idAspek = teksDraft(n?.id_aspek).trim();
    if (idAspek === "") return { ok: false, galat: "Isian nilai tidak valid." };
    if (nilai.some((x) => x.id_aspek === idAspek)) {
      return { ok: false, galat: "Aspek ganda dalam isian nilai." };
    }
    const s = n.skor;
    if (
      s !== undefined &&
      s !== null &&
      !(typeof s === "number" && Number.isInteger(s) && s >= 1 && s <= 5)
    ) {
      return { ok: false, galat: "Skor harus bilangan bulat 1 sampai 5." };
    }
    const cat = opsional(n.catatan, "Catatan aspek", MAKS_CATATAN_ASPEK);
    if (!cat.ok) return cat;
    nilai.push({
      id_aspek: idAspek,
      skor: typeof s === "number" ? s : null,
      catatan: cat.nilai,
    });
  }
  return {
    ok: true,
    nilai: {
      aksi,
      id_penilaian: idPenilaian,
      id_karyawan: idKaryawan,
      periode_jenis: periodeJenis,
      periode_kunci: periodeKunci,
      id_template: kosongJadiNull(teksDraft(draft.id_template)),
      catatan: catatan.nilai,
      alasan_koreksi: alasanKoreksi,
      nilai,
    },
  };
}

/** Satu baris `hr_kinerja_nilai` tanpa `id_nilai`/`id_penilaian`. */
export interface BarisNilai {
  id_aspek: string;
  aspek_nama: string;
  tipe: string;
  bobot: number;
  urutan: number;
  skor: number | null;
  skor_hitung: number | null;
  catatan: string | null;
  rincian: string | null;
}

/** Hitungan satu tipe aspek otomatis; `skor` null = tidak bisa dihitung (D = 0). */
export interface Otomatis {
  skor: number | null;
  rincian: string;
}

/** Cermin `muat_ulang_template`. */
export function muatUlangTemplate(
  baru: BarisNilai[],
  lama: BarisNilai[],
): BarisNilai[] {
  return baru.map((b) => {
    const l = lama.find((x) => x.id_aspek === b.id_aspek);
    return l
      ? { ...b, skor: l.skor, skor_hitung: l.skor_hitung, catatan: l.catatan }
      : b;
  });
}

/** Cermin `isian_tersimpan`: skor otomatis yang sama dengan hitungannya dilepas. */
export function isianTersimpan(baris: BarisNilai[]): IsianNilai[] {
  return baris.map((b) => ({
    id_aspek: b.id_aspek,
    skor:
      b.skor !== null && (b.tipe === TIPE_MANUAL || b.skor_hitung !== b.skor)
        ? b.skor
        : null,
    catatan: b.catatan,
  }));
}

/** Cermin `susun_nilai` (Q-100). */
export function susunNilai(
  baris: BarisNilai[],
  isian: IsianNilai[],
  otomatis: Record<string, Otomatis>,
): Hasil<BarisNilai[]> {
  if (isian.some((i) => !baris.some((b) => b.id_aspek === i.id_aspek))) {
    return {
      ok: false,
      galat: "Aspek penilaian tidak dikenal; muat ulang template.",
    };
  }
  const hasil: BarisNilai[] = [];
  for (const b of baris) {
    const isi = isian.find((i) => i.id_aspek === b.id_aspek);
    const baru: BarisNilai = {
      ...b,
      skor: isi?.skor ?? null,
      catatan: isi?.catatan ?? null,
      skor_hitung: null,
      rincian: null,
    };
    if (b.tipe !== TIPE_MANUAL) {
      const o = otomatis[b.tipe];
      if (o) {
        baru.rincian = o.rincian;
        baru.skor_hitung = o.skor;
      }
      const h = baru.skor_hitung;
      if (h !== null && baru.skor === null) {
        baru.skor = h;
      } else if (h !== null && baru.skor !== h && baru.catatan === null) {
        return {
          ok: false,
          galat: `Skor aspek "${b.aspek_nama}" yang diubah dari hitungan wajib diberi catatan alasannya.`,
        };
      } else if (h === null && baru.skor !== null && baru.catatan === null) {
        return {
          ok: false,
          galat: `Aspek "${b.aspek_nama}" belum bisa dihitung otomatis; beri catatan alasan skornya.`,
        };
      }
    }
    hasil.push(baru);
  }
  return { ok: true, nilai: hasil };
}

export const skorLengkap = (baris: BarisNilai[]) =>
  baris.length > 0 && baris.every((b) => b.skor !== null);

/** Cermin `nilai_akhir` (§23.2.5): Σ bobot × 25 × (skor − 1), null bila ada skor kosong. */
export function nilaiAkhir(baris: BarisNilai[]): number | null {
  let total = 0;
  for (const b of baris) {
    if (b.skor === null) return null;
    total += b.bobot * 25 * (b.skor - 1);
  }
  return total;
}

/** Cermin `format_nilai`: 7750 → `77,50`. */
export const formatNilai = (nilai: number) =>
  `${Math.trunc(nilai / 100)},${String(nilai % 100).padStart(2, "0")}`;

/** Permil → `83,3%`; `null` → `-`. */
export const persenPermil = (permil: number | null) =>
  permil === null ? "-" : `${Math.trunc(permil / 10)},${permil % 10}%`;

const angkaRincian = (teks: string | undefined) => Number(teks ?? 0);
const permilRincian = (teks: string | undefined) =>
  teks === undefined || teks === "" ? null : Number(teks);

export type RincianTerurai =
  | {
      tipe: "K";
      hari: number;
      tepat: number;
      telat: number;
      alfa: number;
      kosong: number;
      dikecualikan: number;
      permil: number | null;
      ambang: number[];
      sampai: string;
    }
  | {
      tipe: "PK";
      satuan: number;
      dikecualikan: number;
      terisi: number;
      pengganti: number;
      tanpa_penanganan: number;
      permil: number | null;
      ambang: number[];
      sampai: string;
    }
  | {
      tipe: "J";
      terisi: number;
      berjurnal: number;
      permil: number | null;
      ambang: number[];
      sampai: string;
    };

/**
 * Pecah `rincian` beku (`hitung_kehadiran`/`hitung_mengajar`) untuk layar dan
 * cetak; bentuk asing = `null`.
 */
export function uraiRincian(rincian: string | null): RincianTerurai | null {
  const b = (rincian ?? "").split("|");
  const ambang = (teks: string | undefined) =>
    (teks ?? "").split(",").map(Number);
  if (b[0] === "K" && b.length === 10) {
    return {
      tipe: "K",
      hari: angkaRincian(b[1]),
      tepat: angkaRincian(b[2]),
      telat: angkaRincian(b[3]),
      alfa: angkaRincian(b[4]),
      kosong: angkaRincian(b[5]),
      dikecualikan: angkaRincian(b[6]),
      permil: permilRincian(b[7]),
      ambang: ambang(b[8]),
      sampai: b[9] ?? "",
    };
  }
  if (b[0] === "PK" && b.length === 9) {
    return {
      tipe: "PK",
      satuan: angkaRincian(b[1]),
      dikecualikan: angkaRincian(b[2]),
      terisi: angkaRincian(b[3]),
      pengganti: angkaRincian(b[4]),
      tanpa_penanganan: angkaRincian(b[5]),
      permil: permilRincian(b[6]),
      ambang: ambang(b[7]),
      sampai: b[8] ?? "",
    };
  }
  if (b[0] === "J" && b.length === 6) {
    return {
      tipe: "J",
      terisi: angkaRincian(b[1]),
      berjurnal: angkaRincian(b[2]),
      permil: permilRincian(b[3]),
      ambang: ambang(b[4]),
      sampai: b[5] ?? "",
    };
  }
  return null;
}

/** Kalimat rumus satu aspek otomatis dari `rincian` beku (layar dan cetak). */
export function kalimatRincian(r: RincianTerurai): string {
  const hasil = (rumus: string) =>
    r.permil === null
      ? `${rumus}: tidak bisa dihitung, skor diisi penilai`
      : `${rumus} = ${persenPermil(r.permil)}`;
  const ambang = `ambang skor 5/4/3/2: ${r.ambang.map(persenPermil).join(" / ")}`;
  if (r.tipe === "K") {
    return `${hasil(`(2 × tepat ${r.tepat} + terlambat ${r.telat}) ÷ (2 × ${r.hari} hari wajib)`)}; alfa ${r.alfa}, tanpa catatan ${r.kosong}, ${r.dikecualikan} hari cuti/izin/sakit tidak dihitung; ${ambang}.`;
  }
  if (r.tipe === "PK") {
    return `${hasil(`presensi terisi ${r.terisi} ÷ ${r.satuan - r.dikecualikan} JP terjadwal`)}; ${r.dikecualikan} JP cuti/izin/sakit/dinas luar tidak dihitung (${r.tanpa_penanganan} belum ditangani), ${r.pengganti} JP sebagai pengganti (informasi); ${ambang}.`;
  }
  return `${hasil(`JP berjurnal ${r.berjurnal} ÷ ${r.terisi} JP terisi`)}; ${ambang}.`;
}

export interface KeputusanRingkas {
  urut: number;
  jenis: string;
}

/** Cermin `status_kinerja` (§23.2.6, berurutan). */
export function statusKinerja(keputusan: KeputusanRingkas[]): StatusKinerja {
  if (keputusan.some((k) => k.jenis === "Batal")) return STATUS_DIBATALKAN;
  if (keputusan.some((k) => k.jenis === "Final")) return STATUS_FINAL;
  let terakhir: KeputusanRingkas | null = null;
  for (const k of keputusan) {
    if (k.jenis !== "Ajukan" && k.jenis !== "Kembalikan") continue;
    if (!terakhir || k.urut > terakhir.urut) terakhir = k;
  }
  return terakhir?.jenis === "Ajukan" ? STATUS_DIAJUKAN : STATUS_DRAF;
}

export interface KeadaanKinerja {
  status: string;
  koreksi: boolean;
  sendiri: boolean;
  boleh_assess: boolean;
  boleh_finalize: boolean;
  dalam_cakupan: boolean;
  skor_lengkap: boolean;
  otomatis_sama: boolean;
  akar_final: boolean;
  koreksi_terbuka: boolean;
}

export const KEADAAN_KOSONG: KeadaanKinerja = {
  status: "",
  koreksi: false,
  sendiri: false,
  boleh_assess: false,
  boleh_finalize: false,
  dalam_cakupan: false,
  skor_lengkap: false,
  otomatis_sama: false,
  akar_final: false,
  koreksi_terbuka: false,
};

/** Cermin `periksa_aksi_kinerja` (§23.2.6, §23.4). */
export function periksaAksiKinerja(
  aksi: string,
  alasan: string,
  k: KeadaanKinerja,
): Hasil<null> {
  if (!(AKSI_KINERJA as readonly string[]).includes(aksi)) {
    return { ok: false, galat: "Aksi penilaian tidak dikenal." };
  }
  if (aksi !== "Koreksi" && panjang(alasan.trim()) > MAKS_ALASAN) {
    return { ok: false, galat: `Alasan maksimal ${MAKS_ALASAN} karakter.` };
  }
  if (k.sendiri) return { ok: false, galat: PESAN_DIRI_SENDIRI };
  const pengisi = k.boleh_assess || (k.koreksi && k.boleh_finalize);
  const izin =
    aksi === "Buat"
      ? k.boleh_assess
      : aksi === "Simpan" || aksi === "Muat ulang" || aksi === "Ajukan"
        ? pengisi
        : aksi === "Batal"
          ? k.boleh_assess || k.boleh_finalize
          : k.boleh_finalize;
  if (!izin) return { ok: false, galat: PESAN_IZIN };
  if (!k.dalam_cakupan) return { ok: false, galat: PESAN_DI_LUAR_CAKUPAN };
  const tanpaAlasan = alasan.trim() === "";
  const tolak = (galat: string): Hasil<null> => ({ ok: false, galat });
  switch (aksi) {
    case "Buat":
      break;
    case "Simpan":
    case "Muat ulang":
      if (k.status !== STATUS_DRAF) {
        return tolak(
          "Penilaian yang sudah diajukan atau selesai tidak bisa disunting.",
        );
      }
      break;
    case "Koreksi":
      if (!k.akar_final) {
        return tolak("Koreksi hanya untuk penilaian yang sudah final.");
      }
      if (k.koreksi_terbuka) {
        return tolak("Penilaian ini masih punya koreksi yang belum selesai.");
      }
      break;
    case "Ajukan":
      if (k.status !== STATUS_DRAF)
        return tolak("Hanya draf yang bisa diajukan.");
      if (!k.skor_lengkap) {
        return tolak("Isi skor semua aspek sebelum mengajukan.");
      }
      if (!k.otomatis_sama) return tolak(PESAN_OTOMATIS_BERUBAH);
      break;
    case "Kembalikan":
    case "Final":
      if (k.status !== STATUS_DIAJUKAN) {
        return tolak("Penilaian ini tidak sedang diajukan.");
      }
      if (aksi === "Kembalikan" && tanpaAlasan) {
        return tolak("Alasan pengembalian wajib diisi.");
      }
      break;
    default:
      if (k.status === STATUS_FINAL) {
        return tolak("Penilaian final tidak bisa dibatalkan; buat koreksi.");
      }
      if (k.status === STATUS_DIBATALKAN) {
        return tolak("Penilaian ini sudah dibatalkan.");
      }
      if (tanpaAlasan) return tolak("Alasan pembatalan wajib diisi.");
  }
  return { ok: true, nilai: null };
}

/** Cermin `boleh_baca_kinerja` (Q-105). */
export const bolehBacaKinerja = (
  sendiri: boolean,
  status: string,
  bolehView: boolean,
) => !sendiri || (status === STATUS_FINAL && bolehView);

export interface InfoTanda {
  status: string;
  penilai_oleh: string;
  id_penilai: string;
  penilai_bawaan: string;
  final_oleh: string;
  nilai: BarisNilai[];
  periode_penuh: boolean;
  periode_selesai: string;
  dihitung_sampai: string;
  pengajuan_menunggu: boolean;
  asn: boolean;
}

export type TandaKinerja =
  | "bukan_penilai_bawaan"
  | "dinilai_dan_difinalkan_sama"
  | "otomatis_diubah"
  | "otomatis_manual"
  | "periode_tidak_penuh"
  | "periode_belum_selesai"
  | "pengajuan_menunggu"
  | "asn"
  | "otomatis_berubah";

const samaOrang = (a: string, b: string) =>
  a.trim() !== "" && a.trim().toLowerCase() === b.trim().toLowerCase();

/** Cermin `tanda_kinerja`; `otomatis_berubah` dihitung terpisah di rincian. */
export function tandaKinerja(i: InfoTanda): TandaKinerja[] {
  const tanda: TandaKinerja[] = [];
  const bawaan = i.penilai_bawaan.trim();
  if (bawaan !== "" && i.id_penilai.trim() !== bawaan) {
    tanda.push("bukan_penilai_bawaan");
  }
  if (i.status === STATUS_FINAL && samaOrang(i.final_oleh, i.penilai_oleh)) {
    tanda.push("dinilai_dan_difinalkan_sama");
  }
  const otomatis = i.nilai.filter((b) => b.tipe !== TIPE_MANUAL);
  if (
    otomatis.some((b) => b.skor_hitung !== null && b.skor !== b.skor_hitung)
  ) {
    tanda.push("otomatis_diubah");
  }
  if (otomatis.some((b) => b.skor_hitung === null)) {
    tanda.push("otomatis_manual");
  }
  if (!i.periode_penuh) tanda.push("periode_tidak_penuh");
  if (i.dihitung_sampai !== "" && i.dihitung_sampai < i.periode_selesai) {
    tanda.push("periode_belum_selesai");
  }
  if (i.pengajuan_menunggu) tanda.push("pengajuan_menunggu");
  if (i.asn) tanda.push("asn");
  return tanda;
}

export interface KandidatBerlaku {
  id_penilaian: string;
  final_pada: string;
  koreksi: boolean;
}

/** Cermin `kinerja_berlaku`: Final paling akhir (seri: koreksi menang). */
export function kinerjaBerlaku(kandidat: KandidatBerlaku[]): string | null {
  let pilih: KandidatBerlaku | null = null;
  for (const k of kandidat) {
    if (
      !pilih ||
      k.final_pada > pilih.final_pada ||
      (k.final_pada === pilih.final_pada && k.koreksi && !pilih.koreksi)
    ) {
      pilih = k;
    }
  }
  return pilih?.id_penilaian ?? null;
}

export interface MasukanPenilai {
  id_karyawan: string;
  kelompok: string;
  id_atasan: string;
  kepala_unit: string;
  kepala_tu: string;
}

export interface PenilaiBawaan {
  id: string;
  sumber: "atasan" | "kepala_unit" | "kepala_tu";
}

/** Cermin `penilai_bawaan` (Q-103). */
export function penilaiBawaan(m: MasukanPenilai): PenilaiBawaan | null {
  const calon: [string, PenilaiBawaan["sumber"]][] = [
    [m.id_atasan, "atasan"],
    m.kelompok === "Guru"
      ? [m.kepala_unit, "kepala_unit"]
      : [m.kepala_tu, "kepala_tu"],
  ];
  for (const [mentah, sumber] of calon) {
    const id = mentah.trim();
    if (id !== "" && id !== m.id_karyawan.trim()) return { id, sumber };
  }
  return null;
}

// Aspek otomatis kehadiran (§23.2.3)

export interface HariKehadiran {
  tanggal: string;
  hadir: boolean;
  telat: boolean;
  sakit: boolean;
  izin: boolean;
  dispensasi: boolean;
  alfa: boolean;
}

const angkaJson = (nilai: unknown) => {
  const n = typeof nilai === "string" ? Number(nilai.trim()) : nilai;
  return typeof n === "number" && Number.isInteger(n) ? n : null;
};

/** Cermin `HariKehadiran::dari_json`: satu baris `KINERJA_HARI_SQL`. */
export function hariKehadiran(v: Record<string, unknown>): HariKehadiran {
  const satu = (k: string) => angkaJson(v[k]) === 1;
  return {
    tanggal: teksDraft(v.tanggal),
    hadir: satu("hadir"),
    telat: (angkaJson(v.telat) ?? 0) > 0,
    sakit: satu("sakit"),
    izin: satu("izin"),
    dispensasi: satu("dispensasi"),
    alfa: satu("alfa"),
  };
}

export interface PengajuanKehadiran {
  mulai: string;
  selesai: string;
  kelompok: string;
}

/** Cermin `PengajuanKehadiran::dari_json`: satu baris `KINERJA_PENGAJUAN_SQL`. */
export const pengajuanKehadiran = (
  v: Record<string, unknown>,
): PengajuanKehadiran => ({
  mulai: teksDraft(v.tanggal_mulai),
  selesai: teksDraft(v.tanggal_selesai),
  kelompok: teksDraft(v.kelompok),
});

export interface MasukanKehadiran {
  mulai: string;
  akhir: string;
  hari_ini: string;
  jadwal: Jadwal;
  hari: HariKehadiran[];
  pengajuan: PengajuanKehadiran[];
  libur: ReadonlySet<string>;
  whitelist: HolidayWhitelistEntry[];
  ambang: readonly number[];
}

export interface Kehadiran {
  hari: number;
  tepat: number;
  telat: number;
  alfa: number;
  kosong: number;
  dikecualikan: number;
  permil: number | null;
  ambang: number[];
  skor: number | null;
  sampai: string;
  rincian: string;
  tanggal_telat: string[];
  tanggal_alfa: string[];
  tanggal_kosong: string[];
}

function kodeTercatat(h: HariKehadiran | undefined): string | null {
  if (!h) return null;
  if (h.hadir) return h.telat ? "T" : "H";
  if (h.sakit) return "S";
  if (h.izin) return "I";
  if (h.dispensasi) return "D";
  if (h.alfa) return "A";
  return null;
}

/** Cermin `hitung_kehadiran` (Q-95); klasifikasi per tanggal mengikuti §23.2.3. */
export function hitungKehadiran(m: MasukanKehadiran): Kehadiran {
  const sampai = m.akhir < m.hari_ini ? m.akhir : m.hari_ini;
  const tanggal = m.mulai <= sampai ? tanggalRentang(m.mulai, sampai) : [];
  const dijadwalkan = new Set(
    tanggal.length > 0
      ? tanggalWajib(m.jadwal, m.libur, m.whitelist, m.mulai, sampai)
      : [],
  );
  const catatan = new Map(m.hari.map((h) => [h.tanggal, h]));
  const k: Kehadiran = {
    hari: 0,
    tepat: 0,
    telat: 0,
    alfa: 0,
    kosong: 0,
    dikecualikan: 0,
    permil: null,
    ambang: [...m.ambang],
    skor: null,
    sampai,
    rincian: "",
    tanggal_telat: [],
    tanggal_alfa: [],
    tanggal_kosong: [],
  };
  for (const t of tanggal) {
    const kelompok = m.pengajuan
      .filter((p) => p.mulai <= t && t <= p.selesai)
      .map((p) => p.kelompok);
    const kode = kodeTercatat(catatan.get(t));
    const tercatatAtauJadwal = kode !== null || dijadwalkan.has(t);
    if (kode === "H") k.tepat++;
    else if (kode === "T" && kelompok.length > 0) k.tepat++;
    else if (kode === "T") {
      k.telat++;
      k.tanggal_telat.push(t);
    } else if (tercatatAtauJadwal && kelompok.includes(KELOMPOK_DINAS_LUAR)) {
      k.tepat++;
    } else if (
      tercatatAtauJadwal &&
      kelompok.some((g) => KELOMPOK_DIKECUALIKAN.includes(g))
    ) {
      k.dikecualikan++;
    } else if (kode === "S" || kode === "I" || kode === "D") {
      k.dikecualikan++;
    } else if (kode !== null) {
      k.alfa++;
      k.tanggal_alfa.push(t);
    } else if (dijadwalkan.has(t)) {
      k.kosong++;
      k.tanggal_kosong.push(t);
    }
  }
  k.hari = k.tepat + k.telat + k.alfa + k.kosong;
  k.permil =
    k.hari > 0
      ? Math.floor(((2 * k.tepat + k.telat) * 1000) / (2 * k.hari))
      : null;
  k.skor = k.permil === null ? null : skorAmbang(k.permil, m.ambang);
  k.rincian = `K|${k.hari}|${k.tepat}|${k.telat}|${k.alfa}|${k.kosong}|${k.dikecualikan}|${k.permil ?? ""}|${m.ambang.join(",")}|${sampai}`;
  return k;
}

// Aspek otomatis presensi kelas dan jurnal (§23.2.4)

export interface PresensiKinerja {
  id_rombel: string;
  tanggal: string;
  jam_ke: string;
  berjurnal: boolean;
}

/** Cermin `PresensiKinerja::dari_json`: satu baris `KINERJA_PRESENSI_SQL`. */
export const presensiKinerja = (
  v: Record<string, unknown>,
): PresensiKinerja => ({
  id_rombel: teksDraft(v.id_rombel),
  tanggal: teksDraft(v.tanggal),
  jam_ke: teksDraft(v.jam_ke),
  berjurnal: angkaJson(v.berjurnal) === 1,
});

export interface MasukanMengajar {
  mulai: string;
  akhir: string;
  hari_ini: string;
  id_guru: string;
  jadwal: readonly JadwalJp[];
  presensi: readonly PresensiKinerja[];
  /** Hanya pengajuan berlaku guru itu (`KINERJA_PENGAJUAN_SQL`). */
  pengajuan: readonly PengajuanJp[];
  /** `id_penanganan` yang tercatat untuk pengajuan itu. */
  ditangani: ReadonlySet<string>;
  libur: ReadonlySet<string>;
  tanpa_kbm: readonly RentangTanpaKbm[];
  ambang: readonly number[];
}

export interface SatuanMengajar {
  tanggal: string;
  jam: number;
  id_rombel: string;
  nama_rombel: string;
}

export interface Mengajar {
  satuan: number;
  dikecualikan: number;
  terisi: number;
  berjurnal: number;
  pengganti: number;
  tanpa_penanganan: number;
  permil_presensi: number | null;
  skor_presensi: number | null;
  permil_jurnal: number | null;
  skor_jurnal: number | null;
  ambang: number[];
  sampai: string;
  rincian_presensi: string;
  rincian_jurnal: string;
  belum_terisi: SatuanMengajar[];
  tanpa_jurnal: SatuanMengajar[];
}

const memuatJam = (jamKe: string, jam: number) => {
  const r = rentangJamKe(jamKe);
  return r !== null && r.awal <= jam && jam <= r.akhir;
};

/**
 * Cermin `hitung_mengajar` (Q-96..Q-99): satuan (rombel, tanggal, jam) jadwal
 * guru itu, terisi oleh presensi atas namanya (mapel tidak dicocokkan),
 * berjurnal bila salah satu sesi penutupnya berjurnal. Sengaja per rombel,
 * bukan per (tanggal, jam) seperti honor JP.
 */
export function hitungMengajar(m: MasukanMengajar): Mengajar {
  const sampai = m.akhir < m.hari_ini ? m.akhir : m.hari_ini;
  const tanggal = m.mulai <= sampai ? tanggalRentang(m.mulai, sampai) : [];
  const jadwal = m.jadwal.filter((j) => j.id_guru === m.id_guru);
  const jpKena = new Map<string, boolean>();
  for (const jp of jpTerdampak(m.pengajuan, jadwal, m.libur, m.mulai, sampai)) {
    const kunci = `${jp.tanggal}|${jp.id_jadwal}`;
    jpKena.set(
      kunci,
      (jpKena.get(kunci) ?? false) || m.ditangani.has(jp.id_penanganan),
    );
  }
  const tanpaKbm = (t: string) =>
    m.tanpa_kbm.some((r) => r.mulai <= t && t <= r.selesai);

  const satuan = new Map<
    string,
    {
      tanggal: string;
      jam: number;
      id_rombel: string;
      nama_rombel: string;
      kecuali: boolean;
      ditangani: boolean;
    }
  >();
  for (const t of tanggal) {
    if (m.libur.has(t) || tanpaKbm(t)) continue;
    const hari = hariIso(t);
    if (hari === null) continue;
    for (const j of jadwal) {
      if (j.hari !== hari || !taMemuat(j, t)) continue;
      const r = rentangJamKe(j.jam_ke);
      if (r === null) continue;
      const kena = jpKena.get(`${t}|${j.id_jadwal}`);
      for (let jam = r.awal; jam <= r.akhir; jam++) {
        const kunci = `${t}|${jam}|${j.id_rombel}`;
        const s = satuan.get(kunci) ?? {
          tanggal: t,
          jam,
          id_rombel: j.id_rombel,
          nama_rombel: j.nama_rombel,
          kecuali: false,
          ditangani: false,
        };
        s.kecuali ||= kena !== undefined;
        s.ditangani ||= kena === true;
        satuan.set(kunci, s);
      }
    }
  }
  // Urutan sama dengan BTreeMap Rust: tanggal → jam → rombel.
  const urut = [...satuan.values()].sort((a, b) =>
    a.tanggal !== b.tanggal
      ? a.tanggal < b.tanggal
        ? -1
        : 1
      : a.jam !== b.jam
        ? a.jam - b.jam
        : a.id_rombel < b.id_rombel
          ? -1
          : a.id_rombel > b.id_rombel
            ? 1
            : 0,
  );

  const k: Mengajar = {
    satuan: satuan.size,
    dikecualikan: 0,
    terisi: 0,
    berjurnal: 0,
    pengganti: 0,
    tanpa_penanganan: 0,
    permil_presensi: null,
    skor_presensi: null,
    permil_jurnal: null,
    skor_jurnal: null,
    ambang: [...m.ambang],
    sampai,
    rincian_presensi: "",
    rincian_jurnal: "",
    belum_terisi: [],
    tanpa_jurnal: [],
  };
  for (const s of urut) {
    if (s.kecuali) {
      k.dikecualikan++;
      if (!s.ditangani) k.tanpa_penanganan++;
      continue;
    }
    const item = {
      tanggal: s.tanggal,
      jam: s.jam,
      id_rombel: s.id_rombel,
      nama_rombel: s.nama_rombel,
    };
    const sesi = m.presensi.filter(
      (p) =>
        p.id_rombel === s.id_rombel &&
        p.tanggal === s.tanggal &&
        memuatJam(p.jam_ke, s.jam),
    );
    if (sesi.length === 0) {
      k.belum_terisi.push(item);
      continue;
    }
    k.terisi++;
    if (sesi.some((p) => p.berjurnal)) k.berjurnal++;
    else k.tanpa_jurnal.push(item);
  }

  const terjadwal = (rombel: string, t: string, jam: number) => {
    const hari = hariIso(t);
    return jadwal.some(
      (j) =>
        j.id_rombel === rombel &&
        j.hari === hari &&
        taMemuat(j, t) &&
        memuatJam(j.jam_ke, jam),
    );
  };
  const pengganti = new Set<string>();
  for (const p of m.presensi) {
    if (p.tanggal < m.mulai || p.tanggal > sampai) continue;
    const r = rentangJamKe(p.jam_ke);
    if (r === null) continue;
    for (let jam = r.awal; jam <= r.akhir; jam++) {
      if (!terjadwal(p.id_rombel, p.tanggal, jam)) {
        pengganti.add(`${p.id_rombel}|${p.tanggal}|${jam}`);
      }
    }
  }
  k.pengganti = pengganti.size;

  const d = k.satuan - k.dikecualikan;
  k.permil_presensi = d > 0 ? Math.floor((k.terisi * 1000) / d) : null;
  k.skor_presensi =
    k.permil_presensi === null ? null : skorAmbang(k.permil_presensi, m.ambang);
  k.permil_jurnal =
    k.terisi > 0 ? Math.floor((k.berjurnal * 1000) / k.terisi) : null;
  k.skor_jurnal =
    k.permil_jurnal === null ? null : skorAmbang(k.permil_jurnal, m.ambang);
  const ambang = m.ambang.join(",");
  k.rincian_presensi = `PK|${k.satuan}|${k.dikecualikan}|${k.terisi}|${k.pengganti}|${k.tanpa_penanganan}|${k.permil_presensi ?? ""}|${ambang}|${sampai}`;
  k.rincian_jurnal = `J|${k.terisi}|${k.berjurnal}|${k.permil_jurnal ?? ""}|${ambang}|${sampai}`;
  return k;
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

// Bentuk data penilaian untuk layar (5b)

export interface PenilaianKinerja {
  id_penilaian: string;
  id_karyawan: string;
  nama: string;
  id_ref: string;
  alasan_koreksi: string;
  periode_jenis: JenisPeriode;
  periode_kunci: string;
  periode_nama: string;
  periode_mulai: string;
  periode_selesai: string;
  id_template: string;
  template_nama: string;
  kelompok: KelompokKinerja;
  unit: string;
  jabatan: string;
  status_kepegawaian: string;
  id_penilai: string;
  penilai_nama: string;
  penilai_oleh: string;
  catatan: string;
  dihitung_sampai: string;
  dibuat_oleh: string;
  created_at: string;
  updated_at: string;
}

export interface PenilaianDaftar extends PenilaianKinerja {
  status: StatusKinerja;
  tanda: TandaKinerja[];
  nilai_akhir: number | null;
  predikat: string | null;
  perlu_saya: boolean;
  penilai_bawaan: PenilaiBawaan | null;
}

export interface BelumDinilai {
  id_karyawan: string;
  nama: string;
  unit: string;
  kelompok: KelompokKinerja;
  jabatan: string;
  status_kepegawaian: string;
  perlu_saya: boolean;
  penilai_bawaan: PenilaiBawaan | null;
  periode_tidak_penuh: boolean;
}

export interface SesiKinerja {
  id_karyawan: string;
  unit: string;
  lingkup_semua: boolean;
}

export interface DaftarKinerja {
  periode: Periode;
  hari_ini: string;
  penilaian: PenilaianDaftar[];
  belum_dinilai: BelumDinilai[];
  sesi: SesiKinerja;
}

export interface RiwayatKinerja {
  penilaian: (PenilaianKinerja & {
    status: StatusKinerja;
    nilai_akhir?: number;
    predikat?: string;
    berlaku: boolean;
  })[];
  hari_ini: string;
}

export interface KeputusanKinerja {
  id_keputusan: string;
  id_penilaian: string;
  urut: number;
  jenis: JenisKeputusan;
  alasan: string;
  nilai_akhir: number | null;
  predikat: string;
  oleh: string;
  id_karyawan_oleh: string;
  created_at: string;
}

export interface KeluargaKinerja {
  id_penilaian: string;
  id_ref: string;
  alasan_koreksi: string;
  status: StatusKinerja;
  created_at: string;
  nilai_akhir: number | null;
  predikat: string | null;
  berlaku: boolean;
}

export interface SpKinerja {
  id_sp: string;
  tingkat: string;
  tanggal: string;
  berlaku_sampai: string;
  nomor: string;
  pelanggaran: string;
}

export interface RincianKinerja {
  penilaian: PenilaianKinerja;
  status: StatusKinerja;
  tanda: TandaKinerja[];
  nilai: BarisNilai[];
  keputusan: KeputusanKinerja[];
  nilai_akhir: number | null;
  predikat: string | null;
  kehadiran: Kehadiran | null;
  mengajar: Mengajar | null;
  hidup: Record<string, Otomatis>;
  rentang: RentangAktif | null;
  keluarga: KeluargaKinerja[];
  berlaku: string | null;
  sp: SpKinerja[];
  penilai_bawaan: (PenilaiBawaan & { nama: string | null }) | null;
  pengaturan: PengaturanKinerja;
  unit_pegawai: string;
  sendiri: boolean;
  hari_ini: string;
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

const isianNilaiSchema = z
  .object({
    id_aspek: z.string().max(200),
    skor: z.number().nullable().optional(),
    catatan: z.string().max(5000).nullable().optional(),
  })
  .strict();

export const penilaianDraftSchema = z
  .object({
    aksi: z.enum(AKSI_SIMPAN),
    id_penilaian: z.string().max(200).optional(),
    id_karyawan: z.string().max(200).optional(),
    periode_jenis: z.enum(JENIS_PERIODE).optional(),
    periode_kunci: z.string().max(200).optional(),
    id_template: z.string().max(200).optional(),
    catatan: z.string().max(10000).optional(),
    alasan_koreksi: z.string().max(5000).optional(),
    nilai: z.array(isianNilaiSchema).max(MAKS_ASPEK).optional(),
  })
  .strict();

export const keputusanDraftSchema = z
  .object({
    id_penilaian: z.string().min(1).max(200),
    jenis: z.enum(JENIS_KEPUTUSAN),
    alasan: z.string().max(5000).optional(),
    rincian: z.record(z.string().max(200), z.string().max(500)).optional(),
  })
  .strict();

export const daftarKinerjaSchema = z
  .object({
    periode_jenis: z.enum(JENIS_PERIODE).optional(),
    periode_kunci: z.string().max(200).optional(),
    id_karyawan: z.string().max(200).optional(),
  })
  .strict();

export const rincianKinerjaSchema = z
  .object({ id_penilaian: z.string().min(1).max(200) })
  .strict();
