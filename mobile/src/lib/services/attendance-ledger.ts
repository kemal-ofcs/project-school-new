import "server-only";

import { db, ensureDbInitialized } from "@/lib/db";
import { ApiRequestError } from "@/lib/server/http/api-response";
import {
  hariEfektifBawaan,
  kehadiranSiswa,
  persenDari,
  rentangUntuk,
  siswaBerunit,
} from "@/lib/services/nilai-akhir";

export interface LedgerStudentItem {
  id_siswa: string;
  nis: string | null;
  nisn: string | null;
  nama_lengkap: string;
  id_rombel: string;
  nama_rombel: string;
  id_tahun_ajaran: string;
  semester: string;
  total_hari_efektif: number;
  hadir: number;
  izin: number;
  sakit: number;
  alfa: number;
  dispensasi: number;
  persen_kehadiran: number;
}

export interface FrozenLedgerItem extends LedgerStudentItem {
  id_leger: string;
  dibekukan_at: string;
  dibekukan_oleh: string;
  created_at: string;
  updated_at: string;
}

export async function getLedgerPreview(
  idTahunAjaran: string,
  semester: string,
  idRombel?: string,
) {
  await ensureDbInitialized();
  const idTa = String(idTahunAjaran || "").trim();
  const sem = String(semester || "").trim();
  const rombel = idRombel ? String(idRombel).trim() : null;

  if (!idTa) {
    throw new ApiRequestError("ID Tahun Ajaran wajib diisi.", 400);
  }

  // Pengklasifikasi hari yang SAMA dengan rekap nilai akhir (keputusan E N2),
  // cermin `get_ledger_preview`. Hari efektif = rentang SEMESTER, Hari
  // Sekolah unit siswa, dan bukan libur aktif; hari bolos dihitung Alfa.
  const { mulai, selesai } = await rentangUntuk(db, idTa, sem);
  const totalHariEfektif = await hariEfektifBawaan(db, mulai, selesai);
  const siswa = await siswaBerunit(db, rombel);
  const kehadiran = await kehadiranSiswa(db, mulai, selesai, rombel, siswa);

  const students: LedgerStudentItem[] = siswa.map((item) => {
    const k = kehadiran.get(item.id_siswa);
    const persen = k ? persenDari(k) : null;
    return {
      id_siswa: item.id_siswa,
      nis: item.nis,
      nisn: item.nisn,
      nama_lengkap: item.nama_lengkap,
      id_rombel: item.id_rombel,
      nama_rombel: item.nama_rombel,
      id_tahun_ajaran: idTa,
      semester: sem,
      total_hari_efektif: k?.hari_efektif ?? 0,
      hadir: k?.hadir ?? 0,
      izin: k?.izin ?? 0,
      sakit: k?.sakit ?? 0,
      alfa: (k?.alfa ?? 0) + (k?.bolos ?? 0),
      dispensasi: k?.dispensasi ?? 0,
      persen_kehadiran:
        persen === null ? 0 : Math.floor(persen * 10 + 0.5) / 10,
    };
  });

  return {
    id_tahun_ajaran: idTa,
    semester: sem,
    id_rombel: rombel,
    total_hari_efektif: totalHariEfektif,
    students,
  };
}

export async function freezeAttendanceLedger(
  sessionOperator: string,
  payload: {
    id_tahun_ajaran: string;
    semester: string;
    id_rombel: string;
    items?: Array<Partial<LedgerStudentItem> & { id_leger?: string }>;
  },
) {
  await ensureDbInitialized();
  const idTa = String(payload.id_tahun_ajaran || "").trim();
  const sem = String(payload.semester || "").trim();
  const idRombel = String(payload.id_rombel || "").trim();
  const operator = String(sessionOperator || "").trim();

  if (!idTa || !sem || !idRombel) {
    throw new ApiRequestError(
      "Tahun ajaran, semester, dan rombel wajib diisi.",
      400,
    );
  }
  if (!operator) {
    throw new ApiRequestError(
      "Sesi operator tidak valid untuk membekukan leger.",
      400,
    );
  }

  let itemsToFreeze = payload.items;
  if (!itemsToFreeze || itemsToFreeze.length === 0) {
    const preview = await getLedgerPreview(idTa, sem, idRombel);
    itemsToFreeze = preview.students;
  }

  if (itemsToFreeze.length === 0) {
    throw new ApiRequestError(
      "Tidak ada siswa dalam rombel ini untuk dibekukan.",
      400,
    );
  }

  const existingRows = await db.execute({
    sql: `
      SELECT id_leger, id_siswa FROM leger_kehadiran
      WHERE id_tahun_ajaran = ? AND semester = ? AND id_rombel = ?;
    `,
    args: [idTa, sem, idRombel],
  });
  const existingMap = new Map<string, string>();
  for (const r of existingRows.rows) {
    existingMap.set(String(r.id_siswa), String(r.id_leger));
  }

  const batchStatements = itemsToFreeze.map((item) => {
    const idSiswa = String(item.id_siswa);
    const existingId = existingMap.get(idSiswa);
    const idLeger =
      item.id_leger?.trim() ||
      existingId ||
      `lgr_${crypto.randomUUID().replace(/-/g, "")}`;

    const totalHari = Math.max(0, Number(item.total_hari_efektif || 1));
    const hadir = Math.max(0, Number(item.hadir || 0));
    const izin = Math.max(0, Number(item.izin || 0));
    const sakit = Math.max(0, Number(item.sakit || 0));
    const alfa = Math.max(0, Number(item.alfa || 0));
    const dispensasi = Math.max(0, Number(item.dispensasi || 0));
    const persen = Math.max(
      0,
      Math.min(100, Number(item.persen_kehadiran || 0)),
    );

    return {
      sql: `
        INSERT INTO leger_kehadiran (
          id_leger, id_tahun_ajaran, semester, id_siswa, id_rombel,
          total_hari_efektif, hadir, izin, sakit, alfa, dispensasi,
          persen_kehadiran, dibekukan_at, dibekukan_oleh, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, datetime('now'), datetime('now'))
        ON CONFLICT(id_leger) DO UPDATE SET
          id_tahun_ajaran = excluded.id_tahun_ajaran,
          semester = excluded.semester,
          id_siswa = excluded.id_siswa,
          id_rombel = excluded.id_rombel,
          total_hari_efektif = excluded.total_hari_efektif,
          hadir = excluded.hadir,
          izin = excluded.izin,
          sakit = excluded.sakit,
          alfa = excluded.alfa,
          dispensasi = excluded.dispensasi,
          persen_kehadiran = excluded.persen_kehadiran,
          dibekukan_at = excluded.dibekukan_at,
          dibekukan_oleh = excluded.dibekukan_oleh,
          updated_at = excluded.updated_at;
      `,
      args: [
        idLeger,
        idTa,
        sem,
        idSiswa,
        idRombel,
        totalHari,
        hadir,
        izin,
        sakit,
        alfa,
        dispensasi,
        persen,
        operator,
      ],
    };
  });

  await db.batch(batchStatements, "write");

  return {
    sukses: true,
    total_dibekukan: batchStatements.length,
  };
}

export async function getFrozenLedger(
  idTahunAjaran: string,
  semester: string,
  idRombel?: string,
): Promise<FrozenLedgerItem[]> {
  await ensureDbInitialized();
  const idTa = String(idTahunAjaran || "").trim();
  const sem = String(semester || "").trim();
  const rombel = idRombel ? String(idRombel).trim() : null;

  const result = await db.execute({
    sql: `
      SELECT l.id_leger, l.id_tahun_ajaran, l.semester, l.id_siswa, l.id_rombel,
             l.total_hari_efektif, l.hadir, l.izin, l.sakit, l.alfa, l.dispensasi,
             l.persen_kehadiran, l.dibekukan_at, l.dibekukan_oleh,
             l.created_at, l.updated_at,
             s.nis, s.nisn, s.nama_lengkap, r.nama_rombel
      FROM leger_kehadiran l
      JOIN siswa_data s ON s.id_siswa = l.id_siswa
      JOIN akademik_rombel r ON r.id_rombel = l.id_rombel
      WHERE l.id_tahun_ajaran = ? AND l.semester = ?
        AND (? IS NULL OR l.id_rombel = ?)
      ORDER BY s.nama_lengkap ASC;
    `,
    args: [idTa, sem, rombel, rombel],
  });

  return result.rows.map((row) => ({
    id_leger: String(row.id_leger),
    id_tahun_ajaran: String(row.id_tahun_ajaran),
    semester: String(row.semester),
    id_siswa: String(row.id_siswa),
    id_rombel: String(row.id_rombel),
    total_hari_efektif: Number(row.total_hari_efektif),
    hadir: Number(row.hadir),
    izin: Number(row.izin),
    sakit: Number(row.sakit),
    alfa: Number(row.alfa),
    dispensasi: Number(row.dispensasi),
    persen_kehadiran: Number(row.persen_kehadiran),
    dibekukan_at: String(row.dibekukan_at),
    dibekukan_oleh: String(row.dibekukan_oleh),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    nis: row.nis ? String(row.nis) : null,
    nisn: row.nisn ? String(row.nisn) : null,
    nama_lengkap: String(row.nama_lengkap),
    nama_rombel: String(row.nama_rombel),
  }));
}

export async function deleteFrozenLedger(
  idTahunAjaran: string,
  semester: string,
  idRombel: string,
) {
  await ensureDbInitialized();
  const idTa = String(idTahunAjaran || "").trim();
  const sem = String(semester || "").trim();
  const rombel = String(idRombel || "").trim();

  const countRes = await db.execute({
    sql: "SELECT COUNT(*) as total FROM leger_kehadiran WHERE id_tahun_ajaran = ? AND semester = ? AND id_rombel = ?;",
    args: [idTa, sem, rombel],
  });
  const count = Number(countRes.rows[0]?.total || 0);
  if (count === 0) {
    throw new ApiRequestError(
      "Tidak ada catatan leger beku untuk rombel dan semester tersebut.",
      404,
    );
  }

  await db.execute({
    sql: "DELETE FROM leger_kehadiran WHERE id_tahun_ajaran = ? AND semester = ? AND id_rombel = ?;",
    args: [idTa, sem, rombel],
  });

  return { sukses: true, deleted_count: count };
}
