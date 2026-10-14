import "server-only";

import { randomBytes } from "node:crypto";
import type { Client, Transaction } from "@libsql/client";
import {
  type BarisTahunAjaran,
  type BobotJenis,
  hadirDiGerbang,
  hariSekolahUntuk,
  hitungNilaiAkhir,
  isJenisBawaan,
  jenisNilaiDraftSchema,
  KUNCI_BOBOT_KEHADIRAN,
  KUNCI_HARI_SEKOLAH,
  klasifikasiHari,
  parseHariSekolah,
  persenKehadiran,
  rataJenis,
  rentangSemester,
  type SkorPenilaian,
  validateBobotNilai,
  validateHariSekolah,
  validateJenisNilai,
} from "@/lib/validations/nilai-akhir";
import type { KonfigurasiNilai, RekapNilaiAkhir } from "@/types/grades";

/**
 * Sisi Web nilai akhir, cermin `desktop/nilai_akhir.rs`. Pesan galat wajib
 * sama dengan Rust, dan perhitungan memakai fungsi murni kembar yang sama.
 */

type Executor = Client | Transaction;

/** Cermin `JENIS_EFEKTIF_SQL`. */
export const JENIS_EFEKTIF_SQL = `COALESCE(NULLIF(TRIM(p.id_jenis), ''), CASE p.jenis
    WHEN 'Tugas' THEN 'jns-tugas'
    WHEN 'Ulangan Harian' THEN 'jns-uh'
    WHEN 'Praktik' THEN 'jns-praktik'
    WHEN 'UTS' THEN 'jns-uts'
    WHEN 'UAS' THEN 'jns-uas' END)`;

export class NilaiAkhirError extends Error {
  readonly code = "VALIDATION_ERROR";
  readonly status = 400;
}

function galat(pesan: string): never {
  throw new NilaiAkhirError(pesan);
}

function newId(prefix: string): string {
  return `${prefix}${randomBytes(16).toString("hex")}`;
}

function text(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

async function withTransaction<T>(
  client: Client,
  work: (tx: Transaction) => Promise<T>,
): Promise<T> {
  const tx = await client.transaction("write");
  try {
    const result = await work(tx);
    await tx.commit();
    return result;
  } catch (error) {
    await tx.rollback();
    throw error;
  } finally {
    tx.close();
  }
}

async function setting(tx: Executor, key: string): Promise<string | null> {
  const result = await tx.execute({
    sql: "SELECT value FROM setting_gex_system WHERE key = ?;",
    args: [key],
  });
  return text(result.rows[0]?.value);
}

async function bobotKehadiran(tx: Executor): Promise<number> {
  const nilai = Number((await setting(tx, KUNCI_BOBOT_KEHADIRAN))?.trim());
  return Number.isInteger(nilai) && nilai >= 0 && nilai <= 100 ? nilai : 0;
}

async function tulisSetting(tx: Transaction, key: string, value: string) {
  await tx.execute({
    sql: `INSERT INTO setting_gex_system (key, value) VALUES (?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
    args: [key, value],
  });
}

interface BarisJenis {
  id_jenis: string;
  nama: string;
  bobot: number;
  urutan: number;
  is_aktif: number;
}

async function semuaJenis(tx: Executor): Promise<BarisJenis[]> {
  const result = await tx.execute(
    `SELECT id_jenis, nama, bobot, urutan, is_aktif FROM nilai_jenis
     ORDER BY urutan, nama, id_jenis LIMIT 200;`,
  );
  return result.rows.map((row) => ({
    id_jenis: String(row.id_jenis),
    nama: String(row.nama),
    bobot: Number(row.bobot),
    urutan: Number(row.urutan),
    is_aktif: Number(row.is_aktif),
  }));
}

/** Cermin `config`. */
export async function config(client: Client): Promise<KonfigurasiNilai> {
  const dipakaiRes = await client.execute(
    `SELECT ${JENIS_EFEKTIF_SQL} AS id_jenis, COUNT(*) AS jumlah
     FROM nilai_penilaian p GROUP BY 1
     -- batas: agregat per jenis, satu baris per jenis
     ;`,
  );
  const dipakai = new Map(
    dipakaiRes.rows.map((row) => [String(row.id_jenis), Number(row.jumlah)]),
  );
  const jenis = (await semuaJenis(client)).map((item) => ({
    ...item,
    bawaan: isJenisBawaan(item.id_jenis),
    dipakai: dipakai.get(item.id_jenis) ?? 0,
  }));
  const kehadiran = await bobotKehadiran(client);
  const unit = await client.execute(
    "SELECT id_unit, nama_unit FROM akademik_unit ORDER BY nama_unit, id_unit LIMIT 100;",
  );
  return {
    jenis,
    bobot_kehadiran: kehadiran,
    total_bobot: jenis
      .filter((item) => item.is_aktif === 1)
      .reduce((sum, item) => sum + item.bobot, kehadiran),
    hari_sekolah: parseHariSekolah(await setting(client, KUNCI_HARI_SEKOLAH)),
    unit: unit.rows.map((row) => ({
      id_unit: String(row.id_unit),
      nama_unit: String(row.nama_unit),
    })),
  };
}

/** Cermin `save_type`. */
export async function saveType(
  client: Client,
  rawDraft: unknown,
): Promise<{ sukses: true; id_jenis: string }> {
  const parsed = jenisNilaiDraftSchema.safeParse(rawDraft);
  if (!parsed.success) galat("Data jenis penilaian tidak valid.");
  const hasil = validateJenisNilai(parsed.data);
  if (!hasil.ok) galat(hasil.error);
  const valid = hasil.value;
  return withTransaction(client, async (tx) => {
    const id = parsed.data.id_jenis?.trim() || newId("jns-");
    const kembar = await tx.execute({
      sql: "SELECT EXISTS(SELECT 1 FROM nilai_jenis WHERE LOWER(TRIM(nama)) = LOWER(?) AND id_jenis <> ?) AS ada;",
      args: [valid.nama, id],
    });
    if (Number(kembar.rows[0]?.ada) === 1) galat("Nama jenis sudah dipakai.");
    const lama = await tx.execute({
      sql: "SELECT bobot FROM nilai_jenis WHERE id_jenis = ?;",
      args: [id],
    });
    if (!valid.is_aktif && Number(lama.rows[0]?.bobot ?? 0) > 0) {
      galat(
        "Jenis yang masih berbobot tidak bisa dinonaktifkan. Pindahkan bobotnya ke jenis lain dulu.",
      );
    }
    await tx.execute({
      sql: `INSERT INTO nilai_jenis (id_jenis, nama, bobot, urutan, is_aktif, created_at, updated_at)
            VALUES (?, ?, 0, ?, ?, datetime('now'), datetime('now'))
            ON CONFLICT(id_jenis) DO UPDATE SET
              nama = excluded.nama,
              urutan = excluded.urutan,
              is_aktif = excluded.is_aktif,
              updated_at = excluded.updated_at;`,
      args: [id, valid.nama, valid.urutan, valid.is_aktif ? 1 : 0],
    });
    return { sukses: true as const, id_jenis: id };
  });
}

/** Cermin `delete_type`. */
export async function deleteType(
  client: Client,
  idJenis: string,
): Promise<{ sukses: true }> {
  if (isJenisBawaan(idJenis)) {
    galat("Jenis bawaan tidak bisa dihapus; nonaktifkan saja.");
  }
  return withTransaction(client, async (tx) => {
    const baris = await tx.execute({
      sql: "SELECT bobot FROM nilai_jenis WHERE id_jenis = ?;",
      args: [idJenis],
    });
    if (!baris.rows[0]) galat("Jenis tidak ditemukan.");
    const dipakai = await tx.execute({
      sql: "SELECT EXISTS(SELECT 1 FROM nilai_penilaian WHERE id_jenis = ?) AS ada;",
      args: [idJenis],
    });
    if (Number(dipakai.rows[0]?.ada) === 1) {
      galat("Jenis ini sudah dipakai penilaian; nonaktifkan saja.");
    }
    if (Number(baris.rows[0].bobot) > 0) {
      galat("Jenis yang masih berbobot tidak bisa dihapus.");
    }
    await tx.execute({
      sql: "DELETE FROM nilai_jenis WHERE id_jenis = ?;",
      args: [idJenis],
    });
    return { sukses: true as const };
  });
}

/** Cermin `save_weights`: seluruh bobot disimpan sekaligus. */
export async function saveWeights(
  client: Client,
  bobotKehadiranBaru: number,
  items: ReadonlyArray<{ id_jenis: string; bobot: number }>,
): Promise<{ sukses: true }> {
  return withTransaction(client, async (tx) => {
    const ada = await semuaJenis(tx);
    const baru = new Map<string, number>();
    for (const item of items) {
      const id = String(item.id_jenis ?? "").trim();
      if (!ada.some((row) => row.id_jenis === id))
        galat("Jenis tidak ditemukan.");
      baru.set(id, item.bobot);
    }
    const daftar: BobotJenis[] = ada.map((row) => ({
      id_jenis: row.id_jenis,
      bobot: baru.get(row.id_jenis) ?? row.bobot,
      is_aktif: row.is_aktif === 1,
    }));
    const cek = validateBobotNilai(bobotKehadiranBaru, daftar);
    if (!cek.ok) galat(cek.error);
    for (const [indeks, row] of ada.entries()) {
      const bobot = daftar[indeks]?.bobot ?? row.bobot;
      if (bobot === row.bobot) continue;
      await tx.execute({
        sql: "UPDATE nilai_jenis SET bobot = ?, updated_at = datetime('now') WHERE id_jenis = ?;",
        args: [bobot, row.id_jenis],
      });
    }
    await tulisSetting(tx, KUNCI_BOBOT_KEHADIRAN, String(bobotKehadiranBaru));
    return { sukses: true as const };
  });
}

/** Cermin `save_school_days`. */
export async function saveSchoolDays(
  client: Client,
  nilai: unknown,
): Promise<{ sukses: true; hari_sekolah: KonfigurasiNilai["hari_sekolah"] }> {
  const cek = validateHariSekolah(nilai);
  if (!cek.ok) galat(cek.error);
  await withTransaction(client, (tx) =>
    tulisSetting(tx, KUNCI_HARI_SEKOLAH, JSON.stringify(cek.value)),
  );
  return { sukses: true as const, hari_sekolah: cek.value };
}

/** Cermin `rentang_untuk`. */
export async function rentangUntuk(
  client: Executor,
  idTahunAjaran: string,
  semester: string,
): Promise<{ mulai: string; selesai: string }> {
  const pilihanRes = await client.execute({
    sql: "SELECT nama_tahun, semester, tanggal_mulai, tanggal_selesai FROM akademik_tahun_ajaran WHERE id_tahun_ajaran = ?;",
    args: [idTahunAjaran],
  });
  const row = pilihanRes.rows[0];
  if (!row) {
    const error = new NilaiAkhirError("Tahun ajaran tidak ditemukan.");
    Object.assign(error, { code: "NOT_FOUND", status: 404 });
    throw error;
  }
  const pilihan: BarisTahunAjaran = {
    nama_tahun: String(row.nama_tahun),
    semester: String(row.semester),
    tanggal_mulai: String(row.tanggal_mulai),
    tanggal_selesai: String(row.tanggal_selesai),
  };
  const saudaraRes = await client.execute({
    sql: `SELECT tanggal_mulai, tanggal_selesai FROM akademik_tahun_ajaran
          WHERE nama_tahun = ? AND semester = ? AND id_tahun_ajaran <> ?
          ORDER BY tanggal_mulai LIMIT 1;`,
    args: [pilihan.nama_tahun, semester, idTahunAjaran],
  });
  const saudara = saudaraRes.rows[0]
    ? {
        tanggal_mulai: String(saudaraRes.rows[0].tanggal_mulai),
        tanggal_selesai: String(saudaraRes.rows[0].tanggal_selesai),
      }
    : null;
  const hasil = rentangSemester(pilihan, saudara, semester);
  if (!hasil.ok) galat(hasil.error);
  return hasil.value;
}

export interface Kehadiran {
  hari_efektif: number;
  hadir: number;
  dispensasi: number;
  izin: number;
  sakit: number;
  alfa: number;
  bolos: number;
  catatan_bolos: Array<{ tanggal: string; mapel: string[] }>;
}

export function persenDari(k: Kehadiran): number | null {
  return persenKehadiran(
    k.hadir + k.dispensasi,
    k.hari_efektif,
    k.izin + k.sakit,
  );
}

export interface SiswaBerunit {
  id_siswa: string;
  nis: string | null;
  nisn: string | null;
  nama_lengkap: string;
  id_rombel: string;
  nama_rombel: string;
  id_unit: string | null;
}

/** Cermin `siswa_berunit`. */
export async function siswaBerunit(
  client: Executor,
  idRombel: string | null,
): Promise<SiswaBerunit[]> {
  const result = await client.execute({
    sql: `SELECT s.id_siswa, s.nis, s.nisn, s.nama_lengkap, s.id_rombel, r.nama_rombel,
                 (SELECT u.id_unit FROM akademik_unit u
                   WHERE LOWER(TRIM(u.nama_unit)) = LOWER(TRIM(m.unit))
                   ORDER BY u.id_unit LIMIT 1) AS id_unit
          FROM siswa_data s
          JOIN akademik_rombel r ON r.id_rombel = s.id_rombel
          LEFT JOIN master_data m ON m.id_unik = s.id_siswa
          WHERE s.status = 'Aktif' AND (?1 IS NULL OR s.id_rombel = ?1)
          ORDER BY s.nama_lengkap ASC, s.id_siswa
          LIMIT 3000;`,
    args: [idRombel],
  });
  return result.rows.map((row) => ({
    id_siswa: String(row.id_siswa),
    nis: text(row.nis),
    nisn: text(row.nisn),
    nama_lengkap: String(row.nama_lengkap),
    id_rombel: String(row.id_rombel),
    nama_rombel: String(row.nama_rombel),
    id_unit: text(row.id_unit),
  }));
}

/** Cermin `hari_dalam_rentang`. */
async function hariDalamRentang(
  client: Executor,
  mulai: string,
  selesai: string,
): Promise<Array<{ tanggal: string; hari: number; libur: boolean }>> {
  const result = await client.execute({
    sql: `WITH RECURSIVE hari(t) AS (
            SELECT ?1
            UNION ALL
            SELECT date(t, '+1 day') FROM hari WHERE t < ?2 AND t < date(?1, '+400 days')
          )
          SELECT h.t AS tanggal, CAST(strftime('%w', h.t) AS INTEGER) AS w,
                 EXISTS(SELECT 1 FROM tbl_hari_libur l WHERE l.tanggal = h.t AND l.status_aktif = 1) AS libur
          FROM hari h;`,
    args: [mulai, selesai],
  });
  return result.rows.map((row) => {
    const w = Number(row.w);
    return {
      tanggal: String(row.tanggal),
      hari: w === 0 ? 7 : w,
      libur: Number(row.libur) === 1,
    };
  });
}

/** Cermin `kehadiran_siswa`: dipakai rekap nilai akhir dan leger kehadiran. */
export async function kehadiranSiswa(
  client: Executor,
  mulai: string,
  selesai: string,
  idRombel: string | null,
  siswa: readonly SiswaBerunit[],
): Promise<Map<string, Kehadiran>> {
  // Berurutan, bukan `Promise.all`: bisa dipanggil di dalam transaksi libSQL.
  const hari = await hariDalamRentang(client, mulai, selesai);
  const konfigurasi = parseHariSekolah(
    await setting(client, KUNCI_HARI_SEKOLAH),
  );
  const gerbangRes = await client.execute({
    sql: `SELECT a.id_karyawan, a.tanggal,
                 MAX(CASE WHEN COALESCE(TRIM(a.jam_masuk), '') <> ''
                           AND COALESCE(a.status_kehadiran, '') <> 'Alfa'
                          THEN 1 ELSE 0 END) AS hadir_gerbang,
                 MAX(COALESCE(a.status_kehadiran, '')) AS status
          FROM absensi_harian a
          JOIN siswa_data s ON s.id_siswa = a.id_karyawan
          WHERE a.tanggal >= ?1 AND a.tanggal <= ?2 AND (?3 IS NULL OR s.id_rombel = ?3)
          GROUP BY a.id_karyawan, a.tanggal
          LIMIT 250000;`,
    args: [mulai, selesai, idRombel],
  });
  const gerbang = new Map<string, { hadir: number; status: string }>();
  for (const row of gerbangRes.rows) {
    gerbang.set(`${String(row.id_karyawan)}|${String(row.tanggal)}`, {
      hadir: Number(row.hadir_gerbang),
      status: String(row.status ?? ""),
    });
  }
  // Alfa di presensi mapel; digabung dengan scan gerbang inilah predikat
  // `BOLOS_DI_SEKOLAH` di `class-attendance.ts`.
  const alfaRes = await client.execute({
    sql: `SELECT d.id_siswa, p.tanggal, COALESCE(m.nama_mapel, p.id_mapel) AS mapel
          FROM presensi_mapel_detail d
          JOIN presensi_mapel p ON p.id_presensi_mapel = d.id_presensi_mapel
          JOIN siswa_data s ON s.id_siswa = d.id_siswa
          LEFT JOIN akademik_mapel m ON m.id_mapel = p.id_mapel
          WHERE d.status = 'Alfa' AND p.tanggal >= ?1 AND p.tanggal <= ?2
            AND (?3 IS NULL OR s.id_rombel = ?3)
          ORDER BY p.tanggal, CAST(p.jam_ke AS INTEGER), p.jam_ke, d.id_detail
          LIMIT 50000;`,
    args: [mulai, selesai, idRombel],
  });
  const alfa = new Map<string, string[]>();
  for (const row of alfaRes.rows) {
    const kunci = `${String(row.id_siswa)}|${String(row.tanggal)}`;
    const daftar = alfa.get(kunci) ?? [];
    const mapel = String(row.mapel ?? "");
    if (!daftar.includes(mapel)) daftar.push(mapel);
    alfa.set(kunci, daftar);
  }
  const hasil = new Map<string, Kehadiran>();
  for (const item of siswa) {
    const sekolah = hariSekolahUntuk(konfigurasi, item.id_unit);
    const k: Kehadiran = {
      hari_efektif: 0,
      hadir: 0,
      dispensasi: 0,
      izin: 0,
      sakit: 0,
      alfa: 0,
      bolos: 0,
      catatan_bolos: [],
    };
    for (const h of hari) {
      if (h.libur || !sekolah.includes(h.hari)) continue;
      k.hari_efektif += 1;
      const kunci = `${item.id_siswa}|${h.tanggal}`;
      const g = gerbang.get(kunci);
      const status = g?.status ?? "";
      const mapelAlfa = alfa.get(kunci);
      const kategori = klasifikasiHari(
        hadirDiGerbang(g?.hadir ?? 0, status),
        mapelAlfa !== undefined,
        status,
      );
      if (kategori === "Hadir") k.hadir += 1;
      else if (kategori === "Dispensasi") k.dispensasi += 1;
      else if (kategori === "Izin") k.izin += 1;
      else if (kategori === "Sakit") k.sakit += 1;
      else if (kategori === "Bolos") {
        k.bolos += 1;
        k.catatan_bolos.push({ tanggal: h.tanggal, mapel: mapelAlfa ?? [] });
      } else k.alfa += 1;
    }
    hasil.set(item.id_siswa, k);
  }
  return hasil;
}

/** Cermin `hari_efektif_bawaan`. */
export async function hariEfektifBawaan(
  client: Executor,
  mulai: string,
  selesai: string,
): Promise<number> {
  const konfigurasi = parseHariSekolah(
    await setting(client, KUNCI_HARI_SEKOLAH),
  );
  return (await hariDalamRentang(client, mulai, selesai)).filter(
    (h) => !h.libur && konfigurasi.bawaan.includes(h.hari),
  ).length;
}

function duaDesimal(nilai: number | null): number | null {
  return nilai === null ? null : Math.floor(nilai * 100 + 0.5) / 100;
}

/** Cermin `recap` (PRD 4.4/4.5), tanpa pembekuan (keputusan H). */
export async function recap(
  client: Client,
  idTahunAjaran: string,
  semester: string,
  idRombel: string,
  idMapel: string,
): Promise<RekapNilaiAkhir> {
  if (semester !== "Ganjil" && semester !== "Genap") {
    galat(`Semester '${semester}' tidak dikenal. Gunakan Ganjil atau Genap.`);
  }
  if (!idRombel.trim() || !idMapel.trim()) {
    galat("Rombel dan mata pelajaran wajib dipilih.");
  }
  const kehadiranBobot = await bobotKehadiran(client);
  const jenis = (await semuaJenis(client)).filter((row) => row.is_aktif === 1);
  const total = jenis.reduce((sum, row) => sum + row.bobot, kehadiranBobot);
  if (total !== 100) {
    galat(
      "Total bobot penilaian dan kehadiran belum 100%. Atur di tab Pengaturan Nilai.",
    );
  }
  const { mulai, selesai } = await rentangUntuk(
    client,
    idTahunAjaran,
    semester,
  );
  const mapelRes = await client.execute({
    sql: "SELECT nama_mapel FROM akademik_mapel WHERE id_mapel = ?;",
    args: [idMapel],
  });
  const namaMapel = text(mapelRes.rows[0]?.nama_mapel) ?? idMapel;
  const penilaianRes = await client.execute({
    sql: `SELECT p.id_penilaian, ${JENIS_EFEKTIF_SQL} AS id_jenis, p.bobot, p.nilai_maks
          FROM nilai_penilaian p
          WHERE p.id_tahun_ajaran = ?1 AND p.semester = ?2 AND p.id_rombel = ?3 AND p.id_mapel = ?4
          ORDER BY p.tanggal, p.id_penilaian
          LIMIT 500;`,
    args: [idTahunAjaran, semester, idRombel, idMapel],
  });
  const penilaian = penilaianRes.rows.map((row) => ({
    id_penilaian: String(row.id_penilaian),
    id_jenis: text(row.id_jenis),
    bobot: Math.max(1, Number(row.bobot ?? 1)),
    nilai_maks: Math.max(1, Number(row.nilai_maks ?? 100)),
  }));
  const skorRes = await client.execute({
    sql: `SELECT n.id_penilaian, n.id_siswa, n.skor
          FROM nilai_siswa n
          JOIN nilai_penilaian p ON p.id_penilaian = n.id_penilaian
          WHERE p.id_tahun_ajaran = ?1 AND p.semester = ?2 AND p.id_rombel = ?3 AND p.id_mapel = ?4
          LIMIT 100000;`,
    args: [idTahunAjaran, semester, idRombel, idMapel],
  });
  const skor = new Map<string, number | null>();
  for (const row of skorRes.rows) {
    skor.set(
      `${String(row.id_penilaian)}|${String(row.id_siswa)}`,
      row.skor === null ? null : Number(row.skor),
    );
  }
  const siswa = await siswaBerunit(client, idRombel);
  const kehadiran = await kehadiranSiswa(
    client,
    mulai,
    selesai,
    idRombel,
    siswa,
  );

  const jumlahPenilaian = (id: string) =>
    penilaian.filter((p) => p.id_jenis === id).length;
  const catatan = jenis
    .filter((row) => row.bobot > 0 && jumlahPenilaian(row.id_jenis) === 0)
    .map((row) => `${namaMapel}: belum ada penilaian ${row.nama}`);

  let nilaiKosong = 0;
  const baris: RekapNilaiAkhir["siswa"] = [];
  for (const item of siswa) {
    let kosong = 0;
    const komponen: Array<{ bobot: number; nilai: number | null }> = [];
    const rataPerJenis: Array<{ id_jenis: string; rata: number | null }> = [];
    for (const row of jenis) {
      const items: SkorPenilaian[] = penilaian
        .filter((p) => p.id_jenis === row.id_jenis)
        .map((p) => {
          const nilai = skor.get(`${p.id_penilaian}|${item.id_siswa}`) ?? null;
          if (nilai === null) kosong += 1;
          return { skor: nilai, nilai_maks: p.nilai_maks, bobot: p.bobot };
        });
      const rata = rataJenis(items);
      rataPerJenis.push({ id_jenis: row.id_jenis, rata });
      komponen.push({ bobot: row.bobot, nilai: rata });
    }
    const k = kehadiran.get(item.id_siswa);
    const persen = k ? persenDari(k) : null;
    komponen.push({ bobot: kehadiranBobot, nilai: persen });
    const { nilai_akhir, bobot_efektif } = hitungNilaiAkhir(komponen);
    nilaiKosong += kosong;
    const bobotHadir = bobot_efektif[bobot_efektif.length - 1] ?? null;
    baris.push({
      id_siswa: item.id_siswa,
      nama_lengkap: item.nama_lengkap,
      nis: item.nis ?? "",
      komponen: rataPerJenis.map((r, indeks) => {
        const bobot = bobot_efektif[indeks] ?? null;
        return {
          id_jenis: r.id_jenis,
          rata: duaDesimal(r.rata),
          bobot_efektif: duaDesimal(bobot),
          nilai_berbobot: duaDesimal(
            r.rata !== null && bobot !== null ? (r.rata * bobot) / 100 : null,
          ),
        };
      }),
      kehadiran: {
        hari_efektif: k?.hari_efektif ?? 0,
        masuk: (k?.hadir ?? 0) + (k?.dispensasi ?? 0),
        izin_sakit: (k?.izin ?? 0) + (k?.sakit ?? 0),
        tidak_masuk: (k?.alfa ?? 0) + (k?.bolos ?? 0),
        persen: duaDesimal(persen),
        bobot_efektif: duaDesimal(bobotHadir),
        nilai_berbobot: duaDesimal(
          persen !== null && bobotHadir !== null
            ? (persen * bobotHadir) / 100
            : null,
        ),
        bolos: k?.catatan_bolos ?? [],
      },
      nilai_akhir,
      kosong,
    });
  }
  const dicetak = await client.execute(
    "SELECT datetime('now', '+7 hours') AS t;",
  );
  return {
    nama_mapel: namaMapel,
    rentang: { mulai, selesai },
    bobot_kehadiran: kehadiranBobot,
    jenis: jenis.map((row) => ({
      id_jenis: row.id_jenis,
      nama: row.nama,
      bobot: row.bobot,
      jumlah_penilaian: jumlahPenilaian(row.id_jenis),
    })),
    catatan,
    nilai_kosong: nilaiKosong,
    siswa: baris,
    dicetak: String(dicetak.rows[0]?.t ?? ""),
  };
}
