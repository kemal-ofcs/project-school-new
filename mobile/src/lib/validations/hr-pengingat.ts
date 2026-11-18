/**
 * HRIS Fase 6 (`prd-hris/fase-6.md` §24): pengingat kepegawaian.
 *
 * Cermin `desktop/hr_pengingat.rs`, diuji dengan vektor yang sama
 * (`hr-pengingat.vektor.json`); teks SQL dibandingkan harfiah oleh
 * `hr-pengingat.test.ts`. Pemuatnya di `services/hr-pengingat.ts`; kartu
 * "Perlu perhatian" dan Telegram (6b) membaca pemuat yang sama.
 */
import { tanggalValid } from "./hari-kerja";
import { dalamCakupan, type Jp, selisihHari, tambahHari } from "./hr-pengajuan";

/** Urutan kejadian di kartu dan Telegram (§24.2.2). */
export const KEJADIAN_PENGINGAT = [
  "kontrak_berakhir",
  "percobaan_berakhir",
  "kgb",
  "pensiun",
  "dokumen_kedaluwarsa",
  "sp_berakhir",
  "pengajuan_menunggu",
  "jp_tanpa_penanganan",
  "sk_pembagian_tugas",
] as const;
export type KejadianPengingat = (typeof KEJADIAN_PENGINGAT)[number];

/** Gabungan izin kartu; `requireAnyWebPermission` atas daftar ini. */
export const IZIN_PENGINGAT = [
  "hr.contract.manage",
  "hr.personal.view",
  "hr.document.view",
  "hr.warning.view",
  "hr.request.decide",
  "hr.request.decide_major",
  "hr.substitute.manage",
  "hr.duty.manage",
] as const;

export const STATUS_KONTRAK_BERAKHIR = ["GTT", "PTT"];
export const STATUS_KGB = ["GTY", "PTY"];
export const KONTRAK_LEWAT_HARI = 30;
export const SK_LEWAT_HARI = 14;

// SQL, dieja harfiah sama di `hr_pengingat.rs`. ?1 = hari ini WIB dari
// `HARI_INI_SQL` di cloud.

export const PENGINGAT_PEGAWAI_SQL =
  "SELECT m.id_unik AS id_karyawan, m.nama, COALESCE(m.jabatan_status, '') AS jabatan, COALESCE(m.unit, '') AS unit, COALESCE(m.tanggal_mulai_aktif, '') AS tmt, COALESCE((SELECT k.status FROM hr_kontrak k WHERE k.id_karyawan = m.id_unik AND k.status <> 'Pembatalan' AND k.tanggal_mulai <= ?1 AND NOT EXISTS (SELECT 1 FROM hr_kontrak b WHERE b.status = 'Pembatalan' AND b.id_ref = k.id_kontrak) ORDER BY k.tanggal_mulai DESC, k.id_kontrak DESC LIMIT 1), g.status_kepegawaian, '') AS status, COALESCE(pr.tanggal_lahir, '') AS tanggal_lahir FROM master_data m LEFT JOIN guru_data g ON g.id_guru = m.id_unik LEFT JOIN hr_profil pr ON pr.id_karyawan = m.id_unik WHERE COALESCE(m.status_aktif, 'Aktif') = 'Aktif' AND COALESCE(m.id_keluar, '') = '' AND LOWER(TRIM(COALESCE(m.jenis_personil, ''))) <> 'siswa' AND NOT EXISTS (SELECT 1 FROM siswa_data sd WHERE sd.id_siswa = m.id_unik) ORDER BY m.nama, m.id_unik\n-- batas: pegawai aktif sekolah, dibatasi jumlah personil lembaga\n;";
export const PENGINGAT_KONTRAK_SQL =
  "SELECT x.id_kontrak, x.id_karyawan, x.status, COALESCE(x.tanggal_selesai, '') AS tanggal_selesai, COALESCE(x.percobaan_selesai, '') AS percobaan_selesai FROM master_data m JOIN hr_kontrak x ON x.id_kontrak = (SELECT k.id_kontrak FROM hr_kontrak k WHERE k.id_karyawan = m.id_unik AND k.status <> 'Pembatalan' AND NOT EXISTS (SELECT 1 FROM hr_kontrak b WHERE b.status = 'Pembatalan' AND b.id_ref = k.id_kontrak) ORDER BY k.tanggal_mulai DESC, k.id_kontrak DESC LIMIT 1) WHERE COALESCE(m.status_aktif, 'Aktif') = 'Aktif' AND COALESCE(m.id_keluar, '') = '' ORDER BY m.id_unik\n-- batas: satu kontrak terakhir per pegawai aktif\n;";
export const PENGINGAT_DOKUMEN_SQL =
  "SELECT d.id_dokumen, d.id_karyawan, COALESCE(j.nama, d.id_jenis) AS nama_jenis, d.tanggal_kedaluwarsa FROM hr_dokumen d LEFT JOIN hr_dokumen_jenis j ON j.id_jenis = d.id_jenis WHERE COALESCE(d.tanggal_kedaluwarsa, '') <> '' AND d.tanggal_kedaluwarsa <= date(?1, '+30 days') AND NOT EXISTS (SELECT 1 FROM hr_dokumen n WHERE n.id_karyawan = d.id_karyawan AND n.id_jenis = d.id_jenis AND n.id_dokumen <> d.id_dokumen AND COALESCE(n.tanggal_kedaluwarsa, '') <> '' AND (n.tanggal_kedaluwarsa > d.tanggal_kedaluwarsa OR (n.tanggal_kedaluwarsa = d.tanggal_kedaluwarsa AND n.id_dokumen > d.id_dokumen))) ORDER BY d.tanggal_kedaluwarsa, d.id_dokumen\n-- batas: dokumen terbaru per pegawai dan jenis yang kedaluwarsa dalam 30 hari atau belum diganti\n;";
export const PENGINGAT_SP_SQL =
  "SELECT s.id_sp, s.id_karyawan, s.berlaku_sampai FROM hr_sp s WHERE s.dicabut_pada IS NULL AND s.berlaku_sampai = date(?1, '-1 day') ORDER BY s.id_karyawan, s.id_sp\n-- batas: SP yang berakhir hari ini, beberapa per tahun\n;";
export const PENGINGAT_PENGAJUAN_SQL =
  "SELECT p.id_pengajuan, p.id_karyawan, p.izin_pemutus, date(p.updated_at, '+7 hours') AS tanggal FROM hr_pengajuan p WHERE datetime(p.updated_at) < datetime('now', '-2 days') AND NOT EXISTS (SELECT 1 FROM hr_pengajuan_keputusan b WHERE b.id_pengajuan = p.id_pengajuan AND b.jenis = 'Batal') AND COALESCE((SELECT k.jenis FROM hr_pengajuan_keputusan k WHERE k.id_pengajuan = p.id_pengajuan AND k.sidik = p.sidik AND k.jenis IN ('Setujui', 'Tolak', 'Setujui Urgent') ORDER BY k.diterima_cloud IS NULL, k.diterima_cloud, k.waktu_perangkat, k.id_keputusan LIMIT 1), '') = '' ORDER BY p.updated_at, p.id_pengajuan\n-- batas: pengajuan yang belum diputus lebih dari dua hari, dibatasi jumlah pegawai\n;";
export const PENGINGAT_SEMESTER_SQL =
  "SELECT t.id_tahun_ajaran, t.nama_tahun, t.semester, t.tanggal_mulai, COALESCE(u.nama_unit, '') AS unit FROM akademik_tahun_ajaran t LEFT JOIN akademik_rombel r ON r.id_tahun_ajaran = t.id_tahun_ajaran AND r.is_aktif = 1 LEFT JOIN akademik_unit u ON u.id_unit = r.id_unit WHERE t.tanggal_mulai >= date(?1, '-14 days') AND t.tanggal_mulai <= date(?1, '+7 days') GROUP BY t.id_tahun_ajaran, t.nama_tahun, t.semester, t.tanggal_mulai, COALESCE(u.nama_unit, '') ORDER BY t.tanggal_mulai, t.id_tahun_ajaran, unit\n-- batas: semester yang mulai dalam tiga minggu, sebesar jumlah unit\n;";

// Aturan murni (cermin Rust)

const kabisat = (tahun: number) =>
  (tahun % 4 === 0 && tahun % 100 !== 0) || tahun % 400 === 0;

/** Cermin `tambah_tahun`: 29 Februari ke tahun bukan kabisat = 28 Februari. */
export function tambahTahun(tanggal: string, tahun: number): string | null {
  if (!tanggalValid(tanggal)) return null;
  const baru = Number(tanggal.slice(0, 4)) + tahun;
  if (baru < 1 || baru > 9999) return null;
  const bulanHari = tanggal.slice(5);
  return `${String(baru).padStart(4, "0")}-${bulanHari === "02-29" && !kabisat(baru) ? "02-28" : bulanHari}`;
}

/** Cermin `sisa_hari`: `tanggal - hariIni` dalam hari; tanggal rusak = `null`. */
export function sisaHari(tanggal: string, hariIni: string): number | null {
  return tanggalValid(tanggal) ? selisihHari(hariIni, tanggal) : null;
}

/** Cermin `jendela`: batas terkecil (menaik) yang memuat `sisa`, mulai 0. */
export function jendela(sisa: number, batas: readonly number[]): number | null {
  if (sisa < 0) return null;
  return batas.find((b) => sisa <= b) ?? null;
}

/** Cermin `tanggal_kgb`: TMT + k × N tahun, k terkecil ≥ 1 yang ≥ hari ini. */
export function tanggalKgb(
  tmt: string,
  siklus: number,
  hariIni: string,
): string | null {
  if (siklus < 1 || !tanggalValid(tmt)) return null;
  for (let k = 1; k <= 100; k++) {
    const t = tambahTahun(tmt, k * siklus);
    if (t === null) return null;
    if (t >= hariIni) return t;
  }
  return null;
}

/** Cermin `tanggal_pensiun`. */
export const tanggalPensiun = (lahir: string, usia: number) =>
  tambahTahun(lahir, usia);

export interface PegawaiPengingat {
  id_karyawan: string;
  nama: string;
  jabatan: string;
  unit: string;
  tmt: string;
  status: string;
  tanggal_lahir: string;
}
export interface KontrakPengingat {
  id_kontrak: string;
  id_karyawan: string;
  status: string;
  tanggal_selesai: string;
  percobaan_selesai: string;
}
export interface DokumenPengingat {
  id_dokumen: string;
  id_karyawan: string;
  nama_jenis: string;
  tanggal_kedaluwarsa: string;
}
export interface SpPengingat {
  id_sp: string;
  id_karyawan: string;
  berlaku_sampai: string;
}
export interface PengajuanPengingat {
  id_karyawan: string;
  izin_pemutus: string;
  tanggal: string;
}
export interface SemesterPengingat {
  id_tahun_ajaran: string;
  nama_tahun: string;
  semester: string;
  tanggal_mulai: string;
  unit: string;
}
export interface DataPengingat {
  pegawai: PegawaiPengingat[];
  kontrak: KontrakPengingat[];
  dokumen: DokumenPengingat[];
  sp: SpPengingat[];
  pengajuan: PengajuanPengingat[];
  semester: SemesterPengingat[];
  jp: Jp[];
  ditangani: string[];
}
export interface PengaturanPengingat {
  kgb_tahun: number;
  pensiun_usia: number;
}

/** `kunci` = id Telegram (§24.2.2); `""` = hanya untuk kartu. */
export interface ItemPengingat {
  kejadian: KejadianPengingat;
  id_karyawan: string;
  nama: string;
  jabatan: string;
  unit: string;
  tanggal: string;
  sisa: number;
  kunci: string;
  keterangan: string;
  izin: string;
}

function item(
  kejadian: KejadianPengingat,
  p: PegawaiPengingat | null,
  tanggal: string,
  sisa: number,
  kunci: string,
): ItemPengingat {
  return {
    kejadian,
    id_karyawan: p?.id_karyawan ?? "",
    nama: p?.nama ?? "",
    jabatan: p?.jabatan ?? "",
    unit: p?.unit ?? "",
    tanggal,
    sisa,
    kunci,
    keterangan: "",
    izin: "",
  };
}

/** Cermin `pengingat`: urut per kejadian lalu tanggal (stabil). */
export function pengingat(
  data: DataPengingat,
  hariIni: string,
  aturan: PengaturanPengingat,
): ItemPengingat[] {
  const pegawai = new Map(data.pegawai.map((p) => [p.id_karyawan, p]));
  const sisa = (t: string) => sisaHari(t, hariIni);
  const hasil: ItemPengingat[] = [];

  for (const k of data.kontrak) {
    const p = pegawai.get(k.id_karyawan);
    if (!p) continue;
    if (STATUS_KONTRAK_BERAKHIR.includes(k.status)) {
      const s = sisa(k.tanggal_selesai);
      if (s !== null && s >= -KONTRAK_LEWAT_HARI && s <= 30) {
        const j = jendela(s, [7, 30]);
        const kunci = j === null ? "" : `ktr-${j}:${k.id_kontrak}`;
        hasil.push(item("kontrak_berakhir", p, k.tanggal_selesai, s, kunci));
      }
    }
    const s = sisa(k.percobaan_selesai);
    if (s !== null && jendela(s, [7]) !== null)
      hasil.push(
        item(
          "percobaan_berakhir",
          p,
          k.percobaan_selesai,
          s,
          `coba:${k.id_kontrak}`,
        ),
      );
  }
  for (const p of data.pegawai) {
    if (!STATUS_KGB.includes(p.status)) continue;
    const t = tanggalKgb(p.tmt, aturan.kgb_tahun, hariIni);
    const s = t === null ? null : sisa(t);
    if (t !== null && s !== null && jendela(s, [30]) !== null)
      hasil.push(item("kgb", p, t, s, `kgb:${p.id_karyawan}:${t}`));
  }
  for (const p of data.pegawai) {
    const t = tanggalPensiun(p.tanggal_lahir, aturan.pensiun_usia);
    const s = t === null ? null : sisa(t);
    if (t !== null && s !== null && jendela(s, [90]) !== null)
      hasil.push(item("pensiun", p, t, s, `pensiun:${p.id_karyawan}:${t}`));
  }
  for (const d of data.dokumen) {
    const p = pegawai.get(d.id_karyawan);
    const s = sisa(d.tanggal_kedaluwarsa);
    if (!p || s === null || s > 30) continue;
    const kunci =
      jendela(s, [30]) === null
        ? ""
        : `dok:${d.id_dokumen}:${d.tanggal_kedaluwarsa}`;
    const i = item("dokumen_kedaluwarsa", p, d.tanggal_kedaluwarsa, s, kunci);
    i.keterangan = d.nama_jenis;
    hasil.push(i);
  }
  for (const sp of data.sp) {
    const p = pegawai.get(sp.id_karyawan);
    if (!p || !tanggalValid(sp.berlaku_sampai)) continue;
    const t = tambahHari(sp.berlaku_sampai, 1);
    if (sisa(t) === 0)
      hasil.push(item("sp_berakhir", p, t, 0, `sp-akhir:${sp.id_sp}`));
  }
  for (const a of data.pengajuan) {
    const p = pegawai.get(a.id_karyawan);
    const s = sisa(a.tanggal);
    if (!p || s === null) continue;
    const i = item(
      "pengajuan_menunggu",
      p,
      a.tanggal,
      s,
      `pgj-tunggu:${hariIni}`,
    );
    i.izin = a.izin_pemutus;
    hasil.push(i);
  }
  const ditangani = new Set(data.ditangani);
  for (const j of data.jp) {
    if (j.tanggal !== hariIni || ditangani.has(j.id_penanganan)) continue;
    const p = pegawai.get(j.id_karyawan);
    if (!p) continue;
    const i = item(
      "jp_tanpa_penanganan",
      p,
      hariIni,
      0,
      `jp-kosong:${hariIni}`,
    );
    i.unit = j.unit;
    i.keterangan = `${j.nama_rombel} jam ke-${j.jam_ke}`;
    hasil.push(i);
  }
  for (const t of data.semester) {
    const s = sisa(t.tanggal_mulai);
    if (s === null || s < -SK_LEWAT_HARI || s > 7) continue;
    const kunci =
      jendela(s, [7]) === null ? "" : `sk-tugas:${t.id_tahun_ajaran}`;
    const i = item("sk_pembagian_tugas", null, t.tanggal_mulai, s, kunci);
    i.unit = t.unit;
    i.keterangan = `${t.semester} ${t.nama_tahun}`;
    hasil.push(i);
  }

  const urutan = (k: KejadianPengingat) => KEJADIAN_PENGINGAT.indexOf(k);
  return hasil.sort(
    (a, b) =>
      urutan(a.kejadian) - urutan(b.kejadian) ||
      (a.tanggal < b.tanggal ? -1 : a.tanggal > b.tanggal ? 1 : 0),
  );
}

/** Sesi penilai kartu, selalu dari SESI di backend. */
export interface SesiPengingat {
  id_karyawan: string;
  unit: string;
  lingkup_semua: boolean;
  superadmin: boolean;
  izin: readonly string[];
}

/** Cermin `izin_kejadian`; pengajuan memakai izin pemutus item. */
export function izinKejadian(kejadian: string): string {
  switch (kejadian) {
    case "kontrak_berakhir":
    case "percobaan_berakhir":
    case "kgb":
      return "hr.contract.manage";
    case "pensiun":
      return "hr.personal.view";
    case "dokumen_kedaluwarsa":
      return "hr.document.view";
    case "sp_berakhir":
      return "hr.warning.view";
    case "jp_tanpa_penanganan":
      return "hr.substitute.manage";
    case "sk_pembagian_tugas":
      return "hr.duty.manage";
    default:
      return "";
  }
}

/** Cermin `saring_pengingat` (§15.2, §24.4). */
export function saringPengingat(
  sesi: SesiPengingat,
  items: readonly ItemPengingat[],
): ItemPengingat[] {
  const punya = (izin: string) =>
    izin !== "" && (sesi.superadmin || sesi.izin.includes(izin));
  const sendiri = (id: string) =>
    sesi.id_karyawan !== "" && sesi.id_karyawan === id;
  return items.filter((i) => {
    if (
      i.kejadian === "pengajuan_menunggu" ||
      i.kejadian === "jp_tanpa_penanganan"
    ) {
      const izin =
        i.kejadian === "pengajuan_menunggu" ? i.izin : izinKejadian(i.kejadian);
      return (
        punya(izin) &&
        !sendiri(i.id_karyawan) &&
        dalamCakupan(sesi.lingkup_semua, sesi.unit, i.unit)
      );
    }
    return punya(izinKejadian(i.kejadian));
  });
}

/** Kembalian `desktop_hr_attention` / `POST /api/kepegawaian/attention/query`. */
export interface PerluPerhatian {
  hari_ini: string;
  items: ItemPengingat[];
}
