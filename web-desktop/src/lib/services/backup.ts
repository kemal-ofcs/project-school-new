import "server-only";

import { randomUUID } from "node:crypto";
import { normalizeDate } from "@/lib/attendance/time-policy";
import { db, ensureDbInitialized } from "@/lib/db";
import { isValidDate } from "@/lib/validations/inventory";

export interface PenugasanBackupInput {
  tanggal_tugas: string; // YYYY-MM-DD
  id_karyawan_asal: string;
  id_karyawan_pengganti: string;
  id_shift_backup: number;
  alasan_backup?: string;
  kode_operator: string;
  catatan?: string;
}

// Bentuk sama dengan Rust (`BCK-<tanggal tugas>-<10 hex>`). Angka acak 3 digit
// dulu bertabrakan dengan primary key bila ada puluhan backup sehari.
export function generateIdBackup(tanggal: string): string {
  const acak = randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase();
  return `BCK-${tanggal.replace(/-/g, "")}-${acak}`;
}

// Cermin `selaraskan_status_backup` di administration.rs.
const SQL_SELARASKAN_STATUS_BACKUP = `UPDATE master_data
    SET status_backup = CASE
      WHEN EXISTS(
        SELECT 1 FROM backup_karyawan
        WHERE id_karyawan_pengganti = ?1 AND status_tugas = 'Aktif'
      ) THEN 'BACKUP' ELSE 'NORMAL' END
    WHERE id_unik = ?1;`;

// Penugasan aktif yang bentrok dengan penugasan baru, kembar
// `SQL_BENTROK_BACKUP` di administration.rs. Urutannya menentukan pesan mana
// yang muncul bila ada beberapa yang bentrok.
const SQL_BENTROK_BACKUP = `SELECT id_backup, id_karyawan_asal FROM backup_karyawan
    WHERE tanggal_tugas = ?1 AND status_tugas = 'Aktif'
      AND (id_karyawan_asal = ?2 OR id_karyawan_asal = ?3 OR id_karyawan_pengganti = ?3)
    ORDER BY (id_karyawan_asal = ?2) DESC, (id_karyawan_asal = ?3) DESC
    LIMIT 1;`;

export async function buatPenugasanBackup(input: PenugasanBackupInput) {
  await ensureDbInitialized();

  const date = normalizeDate(input.tanggal_tugas);
  if (!isValidDate(date)) {
    return { sukses: false, pesan: "Data penugasan backup tidak valid." };
  }

  // 1. Validasi Karyawan Asal & Karyawan Pengganti
  const asalRes = await db.execute({
    sql: "SELECT * FROM master_data WHERE (id_unik = ? OR kode_karyawan = ?) AND status_aktif = 'Aktif' LIMIT 1;",
    args: [input.id_karyawan_asal, input.id_karyawan_asal],
  });

  if (asalRes.rows.length === 0) {
    return {
      sukses: false,
      pesan: `Gagal: Personil asal '${input.id_karyawan_asal}' tidak ditemukan atau non-aktif.`,
    };
  }

  const penggantiRes = await db.execute({
    sql: "SELECT * FROM master_data WHERE (id_unik = ? OR kode_karyawan = ?) AND status_aktif = 'Aktif' LIMIT 1;",
    args: [input.id_karyawan_pengganti, input.id_karyawan_pengganti],
  });

  if (penggantiRes.rows.length === 0) {
    return {
      sukses: false,
      pesan: `Gagal: Personil pengganti '${input.id_karyawan_pengganti}' tidak ditemukan atau non-aktif.`,
    };
  }

  const asal = asalRes.rows[0] as Record<string, unknown>;
  const pengganti = penggantiRes.rows[0] as Record<string, unknown>;

  if (String(asal.id_unik) === String(pengganti.id_unik)) {
    return {
      sukses: false,
      pesan:
        "Gagal: Personil asal dan personil pengganti tidak boleh orang yang sama.",
    };
  }

  const shiftRes = await db.execute({
    sql: "SELECT 1 FROM tbl_shift WHERE id_shift = ? LIMIT 1;",
    args: [input.id_shift_backup],
  });
  if (shiftRes.rows.length === 0) {
    return { sukses: false, pesan: "Gagal: Shift backup tidak ditemukan." };
  }

  const bentrokRes = await db.execute({
    sql: SQL_BENTROK_BACKUP,
    args: [date, String(asal.id_unik), String(pengganti.id_unik)],
  });
  const bentrok = bentrokRes.rows[0];
  if (bentrok) {
    const idBentrok = String(bentrok.id_backup || "");
    if (String(bentrok.id_karyawan_asal) === String(asal.id_unik)) {
      return {
        sukses: false,
        pesan: `Gagal: Sudah ada penugasan backup aktif untuk '${String(asal.nama)}' pada tanggal ${date}. (ID: ${idBentrok})`,
      };
    }
    if (String(bentrok.id_karyawan_asal) === String(pengganti.id_unik)) {
      return {
        sukses: false,
        pesan: `Gagal: Personil pengganti '${String(pengganti.nama)}' sendiri sedang digantikan pada tanggal ${date}. (ID: ${idBentrok})`,
      };
    }
    return {
      sukses: false,
      pesan: `Gagal: '${String(pengganti.nama)}' sudah menjadi pengganti di penugasan lain pada tanggal ${date}. (ID: ${idBentrok})`,
    };
  }

  const idBackup = generateIdBackup(date);
  const nowStr = new Date().toISOString();

  await db.batch(
    [
      {
        sql: `
      INSERT INTO backup_karyawan (
        id_backup, tanggal_tugas, id_karyawan_asal, nama_karyawan_asal, divisi_asal,
        id_shift_asal, id_karyawan_pengganti, nama_karyawan_pengganti, divisi_pengganti,
        id_shift_normal_pengganti, id_shift_backup, alasan_backup, status_tugas,
        kode_operator, waktu_input, catatan
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Aktif', ?, ?, ?);
    `,
        args: [
          idBackup,
          date,
          String(asal.id_unik),
          String(asal.nama),
          String(asal.divisi),
          Number(asal.id_shift || 1),
          String(pengganti.id_unik),
          String(pengganti.nama),
          String(pengganti.divisi),
          Number(pengganti.id_shift || 1),
          input.id_shift_backup,
          input.alasan_backup || "Penggantian Shift",
          input.kode_operator,
          nowStr,
          input.catatan || "",
        ],
      },
      { sql: SQL_SELARASKAN_STATUS_BACKUP, args: [String(pengganti.id_unik)] },
    ],
    "write",
  );

  return {
    sukses: true,
    pesan: `Penugasan backup ${pengganti.nama} menggantikan ${asal.nama} berhasil dibuat.`,
    id_backup: idBackup,
  };
}

export async function batalkanPenugasanBackup(
  id_backup: string,
  kode_operator: string,
) {
  await ensureDbInitialized();

  const existing = await db.execute({
    sql: "SELECT id_karyawan_pengganti FROM backup_karyawan WHERE id_backup = ? AND status_tugas = 'Aktif' LIMIT 1;",
    args: [id_backup],
  });
  const row = existing.rows[0];
  // Tanpa pemeriksaan ini pembatalan ulang menimpa jejak pembatalan pertama.
  if (!row) {
    return { sukses: false, pesan: "Penugasan backup aktif tidak ditemukan." };
  }

  const nowStr = new Date().toISOString();
  await db.batch(
    [
      {
        sql: `UPDATE backup_karyawan SET
          status_tugas = 'Dibatalkan', waktu_dibatalkan = ?, operator_pembatalan = ?
          WHERE id_backup = ? AND status_tugas = 'Aktif';`,
        args: [nowStr, kode_operator, id_backup],
      },
      {
        sql: SQL_SELARASKAN_STATUS_BACKUP,
        args: [String(row.id_karyawan_pengganti)],
      },
    ],
    "write",
  );

  return {
    sukses: true,
    pesan: `Penugasan backup '${id_backup}' berhasil dibatalkan.`,
  };
}

export async function hapusPenugasanBackup(id_backup: string) {
  await ensureDbInitialized();

  const existing = await db.execute({
    sql: `SELECT id_karyawan_pengganti,
            EXISTS(SELECT 1 FROM absensi_harian WHERE id_backup = ?1) AS dipakai
          FROM backup_karyawan WHERE id_backup = ?1 LIMIT 1;`,
    args: [id_backup],
  });
  const row = existing.rows[0];
  if (!row) {
    return {
      sukses: false,
      pesan: `Penugasan backup '${id_backup}' tidak ditemukan.`,
    };
  }
  // Pembatalan menyimpan jejak; hapus permanen hanya untuk penugasan yang
  // belum pernah dipakai, supaya `absensi_harian.id_backup` tidak menggantung.
  // Cerminan `delete_backup` di administration.rs.
  if (Number(row.dipakai) === 1) {
    return {
      sukses: false,
      pesan:
        "Penugasan backup sudah dipakai absensi. Batalkan penugasannya, jangan dihapus.",
    };
  }
  const pengganti = row.id_karyawan_pengganti
    ? String(row.id_karyawan_pengganti)
    : null;

  await db.batch(
    [
      {
        sql: "DELETE FROM backup_karyawan WHERE id_backup = ?;",
        args: [id_backup],
      },
      ...(pengganti
        ? [{ sql: SQL_SELARASKAN_STATUS_BACKUP, args: [pengganti] }]
        : []),
    ],
    "write",
  );

  return {
    sukses: true,
    pesan: `Penugasan backup '${id_backup}' berhasil dihapus.`,
  };
}

export async function getDaftarBackup(filter?: {
  tanggal?: string;
  status_tugas?: string;
}) {
  await ensureDbInitialized();

  let query = "SELECT * FROM backup_karyawan WHERE 1=1";
  const params: (string | number | boolean | null)[] = [];

  if (filter?.tanggal) {
    query += " AND tanggal_tugas = ?";
    params.push(filter.tanggal);
  }
  if (filter?.status_tugas) {
    query += " AND status_tugas = ?";
    params.push(filter.status_tugas);
  }

  query += " ORDER BY waktu_input DESC;";

  const res = await db.execute({ sql: query, args: params });
  return res.rows as unknown as Record<string, unknown>[];
}
