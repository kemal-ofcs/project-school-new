import "server-only";

import { randomBytes } from "node:crypto";
import type { Client, Transaction } from "@libsql/client";
import { trialBalance } from "@/lib/services/accounting";
import {
  cekPeriodeTerbuka,
  saldoTutupJson,
  tanggalTampil,
  validateAlasanBuka,
  validateTutup,
} from "@/lib/validations/tutup-buku";
import type { StatusTutupBuku, TutupBukuItem } from "@/types/accounting";

/**
 * Sisi Web tutup buku, cermin `desktop/tutup_buku.rs`. Web menulis langsung ke
 * cloud, jadi `waktu_perangkat` dan `diterima_cloud` sama-sama jam database
 * dan kode perangkatnya `WEB`.
 */

type Executor = Client | Transaction;

const KODE_PERANGKAT_WEB = "WEB";

const KOLOM_TUTUP = `id_tutup, sampai_tanggal, dibuat_oleh, kode_perangkat, waktu_perangkat,
    diterima_cloud, saldo_json, status, alasan_buka, dibuka_oleh, dibuka_pada, created_at, updated_at`;

function text(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

/** Tanggal batas yang berlaku, atau `null`. Cermin `batas_tutup`. */
export async function batasTutup(tx: Executor): Promise<string | null> {
  const result = await tx.execute(
    `SELECT MAX(sampai_tanggal) AS batas FROM keu_tutup_buku WHERE status = 'Aktif'
     -- batas: agregat, selalu satu baris
     ;`,
  );
  return text(result.rows[0]?.batas);
}

/** Gerbang setiap penulis jurnal. Cermin `assert_periode_terbuka`. */
export async function assertPeriodeTerbuka(
  tx: Executor,
  tanggal: string,
): Promise<void> {
  const hasil = cekPeriodeTerbuka(tanggal, await batasTutup(tx));
  if (!hasil.ok) throw new Error(hasil.error);
}

function barisTutup(row: Record<string, unknown>): TutupBukuItem {
  return {
    id_tutup: String(row.id_tutup),
    sampai_tanggal: String(row.sampai_tanggal),
    dibuat_oleh: String(row.dibuat_oleh),
    kode_perangkat: String(row.kode_perangkat),
    waktu_perangkat: String(row.waktu_perangkat),
    diterima_cloud: text(row.diterima_cloud),
    saldo_json: String(row.saldo_json),
    status: String(row.status) as TutupBukuItem["status"],
    alasan_buka: text(row.alasan_buka),
    dibuka_oleh: text(row.dibuka_oleh),
    dibuka_pada: text(row.dibuka_pada),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

/** Cermin `status`. */
export async function status(client: Client): Promise<StatusTutupBuku> {
  const [riwayat, batas] = await Promise.all([
    client.execute(
      `SELECT ${KOLOM_TUTUP} FROM keu_tutup_buku
       ORDER BY sampai_tanggal DESC, waktu_perangkat DESC, id_tutup
       LIMIT 200;`,
    ),
    batasTutup(client),
  ]);
  return {
    batas,
    riwayat: riwayat.rows.map((row) =>
      barisTutup(row as unknown as Record<string, unknown>),
    ),
  };
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

/** Cermin `close`: tutup buku sampai `sampai` dengan potret saldo saat itu. */
export async function close(
  client: Client,
  operator: string,
  sampaiMentah: string,
): Promise<{ sukses: true; tutup: TutupBukuItem }> {
  const hariIni = await client.execute(
    "SELECT date('now', '+7 hours') AS hari;",
  );
  const valid = validateTutup(
    sampaiMentah,
    await batasTutup(client),
    String(hariIni.rows[0]?.hari ?? ""),
  );
  if (!valid.ok) throw new Error(valid.error);
  const neraca = await trialBalance(client, valid.value);
  const saldo = saldoTutupJson(neraca.items);
  const id = `tb-${randomBytes(16).toString("hex")}`;
  return withTransaction(client, async (tx) => {
    // Dicek ulang di dalam transaksi: tutup buku lain bisa masuk di antaranya.
    const batas = await batasTutup(tx);
    if (batas !== null && valid.value <= batas) {
      throw new Error(
        `Buku sudah ditutup sampai ${tanggalTampil(batas)}. Pilih tanggal sesudahnya.`,
      );
    }
    await tx.execute({
      sql: `INSERT INTO keu_tutup_buku (
              id_tutup, sampai_tanggal, dibuat_oleh, kode_perangkat, waktu_perangkat,
              diterima_cloud, saldo_json, status
            ) VALUES (?, ?, ?, ?, datetime('now', '+7 hours'), datetime('now', '+7 hours'), ?, 'Aktif');`,
      args: [id, valid.value, operator, KODE_PERANGKAT_WEB, saldo],
    });
    const baris = await tx.execute({
      sql: `SELECT ${KOLOM_TUTUP} FROM keu_tutup_buku WHERE id_tutup = ?;`,
      args: [id],
    });
    return {
      sukses: true as const,
      tutup: barisTutup(baris.rows[0] as unknown as Record<string, unknown>),
    };
  });
}

/** Cermin `reopen`: buka kembali batas terakhir, dengan alasan. */
export async function reopen(
  client: Client,
  operator: string,
  alasanMentah: string,
): Promise<{ sukses: true; batas: string | null }> {
  const alasan = validateAlasanBuka(alasanMentah);
  if (!alasan.ok) throw new Error(alasan.error);
  return withTransaction(client, async (tx) => {
    const batas = await batasTutup(tx);
    if (batas === null) throw new Error("Belum ada periode yang ditutup.");
    await tx.execute({
      sql: `UPDATE keu_tutup_buku
            SET status = 'Dibuka', alasan_buka = ?, dibuka_oleh = ?,
                dibuka_pada = datetime('now', '+7 hours'), updated_at = datetime('now')
            WHERE sampai_tanggal = ? AND status = 'Aktif';`,
      args: [alasan.value, operator, batas],
    });
    return { sukses: true as const, batas: await batasTutup(tx) };
  });
}
