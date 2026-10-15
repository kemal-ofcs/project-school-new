import "server-only";

import type { Client, Row, Transaction } from "@libsql/client";
import { ApiRequestError } from "@/lib/server/http/api-response";
import {
  hitungRapel,
  idRapel,
  komponenPersen,
  labelRapel,
  MAKS_SIMPAN_RAPEL,
  type RapelMenunggu,
  type RincianRapel,
  statusRapel,
  validateAlasanBatal,
  validateRentang,
} from "@/lib/validations/payroll-rapel";
import type {
  CalonRapel,
  PilihanRapel,
  RapelItem,
} from "@/types/payroll-rapel";

/**
 * Sisi Web rapel gaji, cermin `desktop/rapel.rs`. SQL dan pesan galat wajib
 * sama dengan Rust. Web menulis langsung ke database cloud; trigger
 * `sync_pulse` membuat setiap perangkat menarik perubahannya.
 */

type Executor = Client | Transaction;

const DETEKSI_RENTANG_SQL = `SELECT i.id, i.payroll_run_id, i.id_karyawan, i.nama_karyawan, r.period_start, r.period_end,
       i.total_regular_hours, i.total_overtime_index, i.total_holiday_overtime_index, i.breakdown_snapshot,
       COALESCE((SELECT rp.rate_baru FROM payroll_rapel rp
                 WHERE rp.id_item_asal = i.id AND rp.dibatalkan_pada IS NULL
                 ORDER BY rp.created_at DESC, rp.id_rapel DESC LIMIT 1), i.rate_per_hour) AS rate_terbayar,
       (SELECT sc.rate_per_hour FROM salary_configs sc
         WHERE sc.id_karyawan = i.id_karyawan AND sc.effective_date <= r.period_end
         ORDER BY sc.effective_date DESC LIMIT 1) AS rate_berlaku
FROM payroll_items i
JOIN payroll_runs r ON r.id = i.payroll_run_id
WHERE r.status = 'PAID' AND substr(r.period_start, 1, 7) BETWEEN ?1 AND ?2
ORDER BY i.nama_karyawan, r.period_start, i.id
LIMIT 5000;`;

const DETEKSI_ITEM_SQL = `SELECT i.id, i.payroll_run_id, i.id_karyawan, i.nama_karyawan, r.period_start, r.period_end,
       i.total_regular_hours, i.total_overtime_index, i.total_holiday_overtime_index, i.breakdown_snapshot,
       COALESCE((SELECT rp.rate_baru FROM payroll_rapel rp
                 WHERE rp.id_item_asal = i.id AND rp.dibatalkan_pada IS NULL
                 ORDER BY rp.created_at DESC, rp.id_rapel DESC LIMIT 1), i.rate_per_hour) AS rate_terbayar,
       (SELECT sc.rate_per_hour FROM salary_configs sc
         WHERE sc.id_karyawan = i.id_karyawan AND sc.effective_date <= r.period_end
         ORDER BY sc.effective_date DESC LIMIT 1) AS rate_berlaku
FROM payroll_items i
JOIN payroll_runs r ON r.id = i.payroll_run_id
WHERE r.status = 'PAID' AND i.id IN (SELECT value FROM json_each(?1))
ORDER BY i.nama_karyawan, r.period_start, i.id
LIMIT 5000;`;

const MENUNGGU_SQL = `SELECT rp.id_karyawan, rp.id_rapel, rp.jumlah, rp.period_start
FROM payroll_rapel rp
WHERE rp.dibatalkan_pada IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM payroll_items i
    JOIN payroll_runs r ON r.id = i.payroll_run_id,
         json_each(CASE WHEN json_valid(i.breakdown_snapshot) THEN i.breakdown_snapshot ELSE '{}' END, '$.rapel') k
    WHERE i.id_karyawan = rp.id_karyawan AND r.status <> 'REJECTED'
      AND json_extract(k.value, '$.id_rapel') = rp.id_rapel)
ORDER BY rp.id_karyawan, rp.period_start, rp.id_rapel
LIMIT 5000;`;

const DAFTAR_SQL = `SELECT rp.id_rapel, rp.id_karyawan, rp.nama_karyawan, rp.id_item_asal, rp.id_run_asal,
       rp.period_start, rp.period_end, rp.rate_lama, rp.rate_baru, rp.selisih_pokok, rp.selisih_lembur,
       rp.selisih_komponen, rp.jumlah, rp.dibuat_oleh, rp.created_at, rp.dibatalkan_oleh,
       rp.dibatalkan_pada, rp.alasan_batal,
       (SELECT r.id FROM payroll_items i
         JOIN payroll_runs r ON r.id = i.payroll_run_id,
              json_each(CASE WHEN json_valid(i.breakdown_snapshot) THEN i.breakdown_snapshot ELSE '{}' END, '$.rapel') k
         WHERE i.id_karyawan = rp.id_karyawan AND r.status <> 'REJECTED'
           AND json_extract(k.value, '$.id_rapel') = rp.id_rapel
         ORDER BY CASE r.status WHEN 'PAID' THEN 0 ELSE 1 END, r.id LIMIT 1) AS id_run,
       (SELECT r.status FROM payroll_items i
         JOIN payroll_runs r ON r.id = i.payroll_run_id,
              json_each(CASE WHEN json_valid(i.breakdown_snapshot) THEN i.breakdown_snapshot ELSE '{}' END, '$.rapel') k
         WHERE i.id_karyawan = rp.id_karyawan AND r.status <> 'REJECTED'
           AND json_extract(k.value, '$.id_rapel') = rp.id_rapel
         ORDER BY CASE r.status WHEN 'PAID' THEN 0 ELSE 1 END, r.id LIMIT 1) AS status_run
FROM payroll_rapel rp
ORDER BY rp.created_at DESC, rp.id_rapel
LIMIT 1000;`;

const STATUS_SATU_SQL = `SELECT rp.dibatalkan_pada,
       (SELECT r.id FROM payroll_items i
         JOIN payroll_runs r ON r.id = i.payroll_run_id,
              json_each(CASE WHEN json_valid(i.breakdown_snapshot) THEN i.breakdown_snapshot ELSE '{}' END, '$.rapel') k
         WHERE i.id_karyawan = rp.id_karyawan AND r.status <> 'REJECTED'
           AND json_extract(k.value, '$.id_rapel') = rp.id_rapel
         LIMIT 1) AS id_run
FROM payroll_rapel rp
WHERE rp.id_rapel = ?1;`;

const INSERT_RAPEL_SQL = `INSERT OR IGNORE INTO payroll_rapel (
        id_rapel, id_karyawan, nama_karyawan, id_item_asal, id_run_asal, period_start, period_end,
        rate_lama, rate_baru, selisih_pokok, selisih_lembur, selisih_komponen, jumlah, dibuat_oleh, created_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, datetime('now'));`;

const BATAL_RAPEL_SQL = `UPDATE payroll_rapel
    SET dibatalkan_oleh = ?2, dibatalkan_pada = datetime('now'), alasan_batal = ?3
    WHERE id_rapel = ?1 AND dibatalkan_pada IS NULL;`;

interface BarisSlip {
  id_item: string;
  id_run: string;
  id_karyawan: string;
  nama: string;
  period_start: string;
  period_end: string;
  slip: Parameters<typeof hitungRapel>[0];
  rate_terbayar: number;
  rate_berlaku: number | null;
}

function keBarisSlip(row: Row): BarisSlip {
  return {
    id_item: String(row.id),
    id_run: String(row.payroll_run_id),
    id_karyawan: String(row.id_karyawan),
    nama: String(row.nama_karyawan),
    period_start: String(row.period_start),
    period_end: String(row.period_end),
    slip: {
      regular_hours: Number(row.total_regular_hours ?? 0),
      overtime_index: Number(row.total_overtime_index ?? 0),
      holiday_overtime_index: Number(row.total_holiday_overtime_index ?? 0),
      komponen_persen: komponenPersen(String(row.breakdown_snapshot ?? "{}")),
    },
    rate_terbayar: Number(row.rate_terbayar),
    rate_berlaku: row.rate_berlaku === null ? null : Number(row.rate_berlaku),
  };
}

/** Cermin `calon`: selisih terhadap tarif yang sekarang berlaku, atau null. */
function calon(
  baris: BarisSlip,
): { rateBaru: number; rincian: RincianRapel } | null {
  if (
    baris.rate_berlaku === null ||
    baris.rate_berlaku === baris.rate_terbayar
  ) {
    return null;
  }
  const rincian = hitungRapel(
    baris.slip,
    baris.rate_terbayar,
    baris.rate_berlaku,
  );
  return rincian.jumlah === 0
    ? null
    : { rateBaru: baris.rate_berlaku, rincian };
}

export async function detectRapel(
  client: Executor,
  dari: string,
  sampai: string,
): Promise<{ items: CalonRapel[] }> {
  const rentang = validateRentang(dari, sampai);
  if (!rentang.ok) throw new ApiRequestError(rentang.error, 400);
  const result = await client.execute({
    sql: DETEKSI_RENTANG_SQL,
    args: [dari, sampai],
  });
  const items: CalonRapel[] = [];
  for (const baris of result.rows.map(keBarisSlip)) {
    const hasil = calon(baris);
    if (!hasil) continue;
    items.push({
      id_item: baris.id_item,
      id_run: baris.id_run,
      id_karyawan: baris.id_karyawan,
      nama_karyawan: baris.nama,
      period_start: baris.period_start,
      period_end: baris.period_end,
      label: labelRapel(baris.period_start),
      rate_lama: baris.rate_terbayar,
      rate_baru: hasil.rateBaru,
      ...hasil.rincian,
      kelebihan_bayar: hasil.rincian.jumlah < 0,
    });
  }
  return { items };
}

/**
 * Cermin `rapel::save`: jumlah selalu dihitung ulang di sini; tarif kiriman
 * layar hanya memastikan admin menyetujui angka yang sama dengan yang ditulis.
 */
export async function saveRapel(
  client: Client,
  operator: string,
  pilihan: PilihanRapel[],
): Promise<{ sukses: true; disimpan: number }> {
  if (pilihan.length === 0) {
    throw new ApiRequestError("Pilih minimal satu rapel.", 400);
  }
  if (pilihan.length > MAKS_SIMPAN_RAPEL) {
    throw new ApiRequestError(
      `Paling banyak ${MAKS_SIMPAN_RAPEL} rapel sekali simpan.`,
      400,
    );
  }
  const tx = await client.transaction("write");
  try {
    const ids = [...new Set(pilihan.map((item) => item.idItem))];
    const result = await tx.execute({
      sql: DETEKSI_ITEM_SQL,
      args: [JSON.stringify(ids)],
    });
    const slip = new Map(
      result.rows.map(keBarisSlip).map((baris) => [baris.id_item, baris]),
    );
    const statements = pilihan.map((item) => {
      const baris = slip.get(item.idItem);
      if (!baris) {
        throw new ApiRequestError(
          "Slip asal tidak ditemukan atau proses gajinya belum dibayar.",
          400,
        );
      }
      const label = labelRapel(baris.period_start);
      const hasil = calon(baris);
      if (!hasil || hasil.rateBaru !== item.rateBaru) {
        throw new ApiRequestError(
          `Tarif ${baris.nama} untuk ${label} berubah sejak dihitung. Muat ulang daftar.`,
          409,
        );
      }
      if (hasil.rincian.jumlah < 0) {
        throw new ApiRequestError(
          `${baris.nama} ${label}: tarif turun, ini kelebihan bayar dan tidak bisa disimpan sebagai rapel.`,
          400,
        );
      }
      return {
        sql: INSERT_RAPEL_SQL,
        args: [
          idRapel(baris.id_item, hasil.rateBaru),
          baris.id_karyawan,
          baris.nama,
          baris.id_item,
          baris.id_run,
          baris.period_start,
          baris.period_end,
          baris.rate_terbayar,
          hasil.rateBaru,
          hasil.rincian.selisih_pokok,
          hasil.rincian.selisih_lembur,
          hasil.rincian.selisih_komponen,
          hasil.rincian.jumlah,
          operator,
        ],
      };
    });
    const hasilTulis = await tx.batch(statements);
    await tx.commit();
    return {
      sukses: true,
      disimpan: hasilTulis.reduce((n, r) => n + r.rowsAffected, 0),
    };
  } finally {
    tx.close();
  }
}

export async function cancelRapel(
  client: Client,
  operator: string,
  id: string,
  alasanMentah: string,
): Promise<{ sukses: true }> {
  const alasan = validateAlasanBatal(alasanMentah);
  if (!alasan.ok) throw new ApiRequestError(alasan.error, 400);
  const tx = await client.transaction("write");
  try {
    const status = await tx.execute({ sql: STATUS_SATU_SQL, args: [id] });
    const baris = status.rows[0];
    if (!baris) throw new ApiRequestError("Rapel tidak ditemukan.", 404);
    if (baris.dibatalkan_pada !== null) {
      throw new ApiRequestError("Rapel ini sudah dibatalkan.", 400);
    }
    if (baris.id_run !== null) {
      throw new ApiRequestError(
        "Rapel sudah masuk proses gaji dan tidak bisa dibatalkan. Tolak proses gajinya lebih dulu bila perlu.",
        400,
      );
    }
    await tx.execute({
      sql: BATAL_RAPEL_SQL,
      args: [id, operator, alasan.value],
    });
    await tx.commit();
    return { sukses: true };
  } finally {
    tx.close();
  }
}

export async function listRapel(
  client: Executor,
): Promise<{ items: RapelItem[] }> {
  const result = await client.execute(DAFTAR_SQL);
  const teksAtauNull = (nilai: unknown) =>
    nilai === null || nilai === undefined ? null : String(nilai);
  return {
    items: result.rows.map((row) => ({
      id_rapel: String(row.id_rapel),
      id_karyawan: String(row.id_karyawan),
      nama_karyawan: String(row.nama_karyawan),
      id_item_asal: String(row.id_item_asal),
      id_run_asal: String(row.id_run_asal),
      label: labelRapel(String(row.period_start)),
      period_start: String(row.period_start),
      period_end: String(row.period_end),
      rate_lama: Number(row.rate_lama),
      rate_baru: Number(row.rate_baru),
      selisih_pokok: Number(row.selisih_pokok),
      selisih_lembur: Number(row.selisih_lembur),
      selisih_komponen: Number(row.selisih_komponen),
      jumlah: Number(row.jumlah),
      dibuat_oleh: String(row.dibuat_oleh),
      created_at: String(row.created_at),
      dibatalkan_oleh: teksAtauNull(row.dibatalkan_oleh),
      status: statusRapel(
        row.dibatalkan_pada !== null,
        teksAtauNull(row.status_run),
      ),
      dibatalkan_pada: teksAtauNull(row.dibatalkan_pada),
      alasan_batal: teksAtauNull(row.alasan_batal),
      id_run: teksAtauNull(row.id_run),
    })),
  };
}

/** Cermin `rapel_menunggu`: rapel yang ikut dibayar di proses gaji berikutnya. */
export async function rapelMenunggu(
  client: Executor,
): Promise<Map<string, RapelMenunggu[]>> {
  const result = await client.execute(MENUNGGU_SQL);
  const hasil = new Map<string, RapelMenunggu[]>();
  for (const row of result.rows) {
    const jumlah = Number(row.jumlah);
    if (jumlah <= 0) continue;
    const id = String(row.id_karyawan);
    const daftar = hasil.get(id) ?? [];
    daftar.push({
      id_rapel: String(row.id_rapel),
      jumlah,
      period_start: String(row.period_start),
    });
    hasil.set(id, daftar);
  }
  return hasil;
}
