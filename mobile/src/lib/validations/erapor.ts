import type { BahanErapor } from "@/types/grades";
import { bulatAkhir } from "./nilai-akhir";

/**
 * Penyusun berkas ekspor e-Rapor (Fase N3). Fungsi murni yang berjalan di
 * klien ketiga build dari bahan `erapor` (Rust maupun TS), sehingga satu
 * aturan saja yang menentukan isi berkas. Judul kolom mengikuti templat yang
 * diberikan sekolah apa adanya.
 */

export interface PemetaanErapor {
  /** Jenis penilaian untuk Sumatif Lingkup Materi. */
  lm: string;
  /** Jenis untuk Sumatif Tengah Semester. */
  sts: string;
  /** Jenis untuk Sumatif Akhir Semester. */
  sas: string;
}

export const PEMETAAN_BAWAAN: PemetaanErapor = {
  lm: "jns-uh",
  sts: "jns-uts",
  sas: "jns-uas",
};

/** Jumlah kolom Sumatif LM di templat; lebih banyak LM menambah kolom. */
export const KOLOM_LM_TEMPLAT = 3;

const KOLOM_AWAL = [
  "ID_Nilai",
  "Tahun_Ajaran",
  "Semester",
  "Tingkat_Kelas",
  "Rombel",
  "NISN",
  "NIPD / NIS",
  "Nama_Peserta_Didik",
  "Kode_Mapel",
  "Nama_Mata_Pelajaran",
  "Nama_Guru_Pengampu",
];

const KOLOM_AKHIR = [
  "Rata_Sumatif_LM (Auto)",
  "Sumatif_Tengah_Semester (STS)",
  "Sumatif_Akhir_Semester (SAS)",
  "Nilai_Akhir_Rapor (Auto)",
  "Kode_TP_Tercapai (Max)",
  "Kode_TP_Perlu_Bimbingan (Min)",
  "Capaian_Kompetensi_Tertinggi (Deskripsi Auto/Edit)",
  "Capaian_Kompetensi_Terendah (Deskripsi Auto/Edit)",
];

const ROMAWI = [
  "",
  "I",
  "II",
  "III",
  "IV",
  "V",
  "VI",
  "VII",
  "VIII",
  "IX",
  "X",
  "XI",
  "XII",
  "XIII",
];

export function labelTingkat(tingkat: number): string {
  const romawi = ROMAWI[tingkat];
  return romawi ? `${romawi} (${tingkat})` : String(tingkat);
}

export function labelSemester(semester: string): string {
  return semester === "Genap" ? "2 (Genap)" : "1 (Ganjil)";
}

/** Skor ke skala 0-100, dibulatkan seperti nilai akhir N2. */
export function skalaSeratus(skor: number, nilaiMaks: number): number {
  return bulatAkhir((skor * 100) / Math.max(nilaiMaks, 1));
}

interface NilaiLm {
  nama: string;
  nilai: number;
  kkm: number;
}

/** Kalimat capaian tertinggi: >= 90 sangat baik, >= KKTP baik, lainnya perlu bimbingan. */
export function capaianTertinggi(item: NilaiLm): string {
  if (item.nilai >= 90) {
    return `Menunjukkan penguasaan yang sangat baik dalam ${item.nama}.`;
  }
  if (item.nilai >= item.kkm) {
    return `Menunjukkan penguasaan yang baik dalam ${item.nama}.`;
  }
  return `Mulai memahami ${item.nama}, tetapi masih perlu bimbingan.`;
}

/** Kalimat capaian terendah, dengan batas yang sama. */
export function capaianTerendah(item: NilaiLm): string {
  if (item.nilai < item.kkm) return `Perlu bimbingan dalam ${item.nama}.`;
  if (item.nilai < 90) return `Perlu penguatan dalam ${item.nama}.`;
  return `Dapat ditantang lebih jauh dalam ${item.nama}.`;
}

/**
 * Deskripsi capaian dari penilaian LM yang sudah dinilai: skor tertinggi
 * dan terendah (yang pertama menurut tanggal bila sama). Terendah hanya ada
 * bila ada sedikitnya dua penilaian LM bernilai.
 */
export function deskripsiCapaian(lm: readonly NilaiLm[]): [string, string] {
  if (lm.length === 0) return ["", ""];
  let tinggi = 0;
  lm.forEach((item, i) => {
    if (item.nilai > (lm[tinggi]?.nilai ?? -1)) tinggi = i;
  });
  let rendah = -1;
  lm.forEach((item, i) => {
    if (i === tinggi) return;
    if (rendah < 0 || item.nilai < (lm[rendah]?.nilai ?? 101)) rendah = i;
  });
  const atas = lm[tinggi];
  const bawah = rendah >= 0 ? lm[rendah] : undefined;
  return [
    atas ? capaianTertinggi(atas) : "",
    bawah ? capaianTerendah(bawah) : "",
  ];
}

export type SelErapor = string | number;

export interface PeringatanErapor {
  tanpaNisn: number;
  skorKosong: number;
  tanpaSts: string[];
  tanpaSas: string[];
  lebihTigaLm: string[];
}

export interface BerkasErapor {
  kolom: string[];
  baris: SelErapor[][];
  peringatan: PeringatanErapor;
}

export function adaPeringatan(p: PeringatanErapor): boolean {
  return (
    p.tanpaNisn > 0 ||
    p.skorKosong > 0 ||
    p.tanpaSts.length > 0 ||
    p.tanpaSas.length > 0 ||
    p.lebihTigaLm.length > 0
  );
}

/**
 * Baris berkas: satu baris per mapel × siswa aktif rombel, urut mapel lalu
 * siswa. Skor yang belum diisi menjadi sel kosong; rata dan nilai akhir dari
 * rekap N2 (keputusan E1) dan kosong bila jenisnya belum punya skor sama
 * sekali untuk siswa itu.
 */
export function susunErapor(
  bahan: BahanErapor,
  pemetaan: PemetaanErapor,
  idMapel: string | null = null,
): BerkasErapor {
  const mapel = bahan.mapel.filter((m) => !idMapel || m.id_mapel === idMapel);
  const nLm = Math.max(
    KOLOM_LM_TEMPLAT,
    ...mapel.map(
      (m) => m.penilaian.filter((p) => p.id_jenis === pemetaan.lm).length,
    ),
  );
  const kolom = [
    ...KOLOM_AWAL,
    ...Array.from({ length: nLm }, (_, i) => `Sumatif_LM_${i + 1}`),
    ...KOLOM_AKHIR,
  ];
  const tahunAwal = (/^\d{4}/.exec(bahan.tahun_ajaran) ?? [""])[0];
  const noSemester = bahan.semester === "Genap" ? 2 : 1;
  const peringatan: PeringatanErapor = {
    tanpaNisn: bahan.siswa.filter((s) => !s.nisn.trim()).length,
    skorKosong: 0,
    tanpaSts: [],
    tanpaSas: [],
    lebihTigaLm: [],
  };
  const baris: SelErapor[][] = [];
  let urut = 0;
  for (const m of mapel) {
    const lm = m.penilaian.filter((p) => p.id_jenis === pemetaan.lm);
    const sts = m.penilaian.filter((p) => p.id_jenis === pemetaan.sts);
    const sas = m.penilaian.filter((p) => p.id_jenis === pemetaan.sas);
    if (sts.length === 0) peringatan.tanpaSts.push(m.nama_mapel);
    if (sas.length === 0) peringatan.tanpaSas.push(m.nama_mapel);
    if (lm.length > KOLOM_LM_TEMPLAT) peringatan.lebihTigaLm.push(m.nama_mapel);
    const skor = new Map(
      m.skor.map((s) => [`${s.id_penilaian}|${s.id_siswa}`, s.skor]),
    );
    const rekap = new Map(m.rekap.map((r) => [r.id_siswa, r]));
    for (const s of bahan.siswa) {
      const nilaiDari = (id: string) => skor.get(`${id}|${s.id_siswa}`);
      const terisi = (daftar: typeof lm) =>
        daftar.some((p) => nilaiDari(p.id_penilaian) !== undefined);
      for (const p of [...lm, ...sts, ...sas]) {
        if (nilaiDari(p.id_penilaian) === undefined) peringatan.skorKosong += 1;
      }
      const r = rekap.get(s.id_siswa);
      const rata = (jenis: string, daftar: typeof lm): SelErapor => {
        const nilai = r?.rata[jenis];
        return terisi(daftar) && nilai !== null && nilai !== undefined
          ? bulatAkhir(nilai)
          : "";
      };
      const lmBernilai: NilaiLm[] = [];
      const selLm: SelErapor[] = lm.map((p) => {
        const mentah = nilaiDari(p.id_penilaian);
        if (mentah === undefined) return "";
        const nilai = skalaSeratus(mentah, p.nilai_maks);
        lmBernilai.push({ nama: p.nama_penilaian, nilai, kkm: p.kkm });
        return nilai;
      });
      while (selLm.length < nLm) selLm.push("");
      const [tertinggi, terendah] = deskripsiCapaian(lmBernilai);
      urut += 1;
      baris.push([
        `NMP-${tahunAwal}${noSemester}-${String(urut).padStart(3, "0")}`,
        bahan.tahun_ajaran,
        labelSemester(bahan.semester),
        labelTingkat(bahan.tingkat),
        bahan.rombel,
        s.nisn,
        s.nis,
        s.nama,
        m.kode_mapel,
        m.nama_mapel,
        m.guru,
        ...selLm,
        rata(pemetaan.lm, lm),
        rata(pemetaan.sts, sts),
        rata(pemetaan.sas, sas),
        r?.nilai_akhir ?? "",
        "",
        "",
        tertinggi,
        terendah,
      ]);
    }
  }
  return { kolom, baris, peringatan };
}

/** Isi berkas teks bertab seperti templat; tab dan baris baru di sel diganti spasi. */
export function teksBertab(berkas: BerkasErapor): string {
  const sel = (nilai: SelErapor) => String(nilai).replace(/[\t\r\n]+/g, " ");
  return [berkas.kolom, ...berkas.baris]
    .map((baris) => baris.map(sel).join("\t"))
    .join("\n");
}
