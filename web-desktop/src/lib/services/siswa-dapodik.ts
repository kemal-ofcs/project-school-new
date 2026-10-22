import "server-only";

import type { Client } from "@libsql/client";
import { PmbValidationError } from "@/lib/services/pmb-admin";
import { VERSI_DATA_DAPODIK } from "@/lib/validations/pmb-dapodik";
import {
  type BarisDapodikSiswa,
  MAKS_ID_BACA_DAPODIK,
  PESAN_SISWA_BELUM_DI_CLOUD,
  SQL_KOSONGKAN_DAPODIK_SISWA,
  SQL_SIMPAN_DAPODIK_SISWA,
  validasiSimpanDapodikSiswa,
} from "@/lib/validations/siswa-dapodik";

/**
 * Data DAPODIK per siswa (v57, cloud-only). Kembaran metode
 * `list/save/clear_siswa_dapodik` di `turso.rs`. Tidak ada outbox: tabelnya
 * tidak pernah tersalin ke perangkat.
 */

export async function listSiswaDapodik(
  client: Client,
  ids: string[],
): Promise<BarisDapodikSiswa[]> {
  const bersih = ids.map((id) => id.trim()).filter(Boolean);
  if (bersih.length > MAKS_ID_BACA_DAPODIK) {
    throw new PmbValidationError("Terlalu banyak siswa dalam satu permintaan.");
  }
  if (bersih.length === 0) return [];
  const hasil = await client.execute({
    sql: `SELECT id_siswa, tempat_lahir, tanggal_lahir, sekolah_asal, data_dapodik, diubah_oleh, updated_at FROM siswa_dapodik WHERE id_siswa IN (${bersih.map(() => "?").join(", ")});`,
    args: bersih,
  });
  return hasil.rows.map((baris) => ({
    id_siswa: String(baris.id_siswa),
    tempat_lahir: (baris.tempat_lahir as string | null) ?? null,
    tanggal_lahir: (baris.tanggal_lahir as string | null) ?? null,
    sekolah_asal: (baris.sekolah_asal as string | null) ?? null,
    data_dapodik: (baris.data_dapodik as string | null) ?? null,
    diubah_oleh: (baris.diubah_oleh as string | null) ?? null,
    updated_at: (baris.updated_at as string | null) ?? null,
  }));
}

export async function saveSiswaDapodik(
  client: Client,
  masukan: unknown,
  operator: string,
): Promise<void> {
  const hasil = validasiSimpanDapodikSiswa(masukan);
  if (!hasil.ok) throw new PmbValidationError(hasil.galat);
  const { idSiswa, tempatLahir, tanggalLahir, sekolahAsal, data } = hasil.nilai;
  const simpan = await client.execute({
    sql: SQL_SIMPAN_DAPODIK_SISWA,
    args: [
      idSiswa,
      tempatLahir,
      tanggalLahir,
      sekolahAsal,
      Object.keys(data).length > 0
        ? JSON.stringify({ versi: VERSI_DATA_DAPODIK, ...data })
        : null,
      operator,
      idSiswa,
    ],
  });
  if (Number(simpan.rowsAffected ?? 0) === 0) {
    throw new PmbValidationError(PESAN_SISWA_BELUM_DI_CLOUD);
  }
}

export async function clearSiswaDapodik(
  client: Client,
  idSiswa: string,
  operator: string,
): Promise<void> {
  await client.execute({
    sql: SQL_KOSONGKAN_DAPODIK_SISWA,
    args: [operator, idSiswa.trim()],
  });
}
