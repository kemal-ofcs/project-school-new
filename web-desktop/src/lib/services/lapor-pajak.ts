import "server-only";

import type { Client } from "@libsql/client";
import {
  bacaPemotong,
  type DataPemotong,
  type HasilLaporan,
  KUNCI_PEMOTONG,
  PEMOTONG_SQL,
  type RekapA1,
  type RekapBpjs,
  type RekapPph,
  rekapA1,
  rekapBpjs,
  rekapPph,
  SIMPAN_PEMOTONG_SQL,
  SLIP_LAPOR_SQL,
  type SlipLapor,
  validasiMasa,
  validasiPemotong,
  validasiTahun,
} from "@/lib/validations/lapor-pajak";
import { ambil, angka, semua, teks } from "./hr-rekrutmen";

// Cermin I/O cloud `desktop/lapor_pajak.rs`. Run, slip, dan profil dibaca dari
// database yang sama dengan Desktop; `app_lapor_setting` cloud-only.

/** Cermin `data_pemotong`. */
export async function dataPemotong(client: Client): Promise<DataPemotong> {
  return bacaPemotong(
    (await semua(client, PEMOTONG_SQL)) as {
      kunci: unknown;
      nilai: unknown;
    }[],
  );
}

/** Cermin `simpan_pemotong`: semua kunci dalam satu batch. */
export async function simpanPemotong(
  client: Client,
  oleh: string,
  draft: unknown,
): Promise<{ sukses: true; pemotong: DataPemotong }> {
  const sah = ambil(validasiPemotong(draft));
  await client.batch(
    KUNCI_PEMOTONG.map((k) => ({
      sql: SIMPAN_PEMOTONG_SQL,
      args: [k, sah[k], oleh],
    })),
    "write",
  );
  return { sukses: true, pemotong: sah };
}

async function muat(
  client: Client,
  periode: string,
): Promise<[SlipLapor[], DataPemotong]> {
  const slip = (await semua(client, SLIP_LAPOR_SQL, [periode])).map(
    (b): SlipLapor => ({
      run_id: teks(b, "run_id"),
      status_run: teks(b, "status_run"),
      period_start: teks(b, "period_start"),
      id_karyawan: teks(b, "id_karyawan"),
      nama_karyawan: teks(b, "nama_karyawan"),
      kode_karyawan: teks(b, "kode_karyawan"),
      ptkp_status: teks(b, "ptkp_status"),
      gross_salary: angka(b, "gross_salary"),
      pph21_amount: angka(b, "pph21_amount"),
      breakdown_snapshot: teks(b, "breakdown_snapshot"),
      nik: teks(b, "nik"),
      npwp: teks(b, "npwp"),
      bpjs_kesehatan: teks(b, "bpjs_kesehatan"),
      bpjs_ketenagakerjaan: teks(b, "bpjs_ketenagakerjaan"),
    }),
  );
  return [slip, await dataPemotong(client)];
}

/** Cermin `laporan_pph`. */
export async function laporanPph(
  client: Client,
  draft: unknown,
): Promise<HasilLaporan<RekapPph>> {
  const masa = ambil(validasiMasa(draft));
  const [slip, pemotong] = await muat(client, masa);
  return { rekap: rekapPph(slip, masa), pemotong };
}

/** Cermin `laporan_bpjs`. */
export async function laporanBpjs(
  client: Client,
  draft: unknown,
): Promise<HasilLaporan<RekapBpjs>> {
  const masa = ambil(validasiMasa(draft));
  const [slip, pemotong] = await muat(client, masa);
  return { rekap: rekapBpjs(slip, masa), pemotong };
}

/** Cermin `laporan_a1`. */
export async function laporanA1(
  client: Client,
  draft: unknown,
): Promise<HasilLaporan<RekapA1>> {
  const tahun = ambil(validasiTahun(draft));
  const [slip, pemotong] = await muat(client, tahun);
  return { rekap: rekapA1(slip, tahun), pemotong };
}
