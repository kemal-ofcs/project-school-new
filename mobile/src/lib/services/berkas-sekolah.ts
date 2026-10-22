import "server-only";

import type { Client } from "@libsql/client";
import { PmbNotFoundError, PmbValidationError } from "@/lib/services/pmb-admin";
import {
  type BerkasSekolah,
  berkasSekolahSchema,
  PESAN_PENDAFTAR_SUDAH_SISWA,
  SQL_HAPUS_BERKAS_PMB,
  SQL_HAPUS_BERKAS_SISWA,
  SQL_HAPUS_JENIS_BERKAS_PMB,
  SQL_HAPUS_JENIS_BERKAS_SISWA,
  SQL_SIMPAN_BERKAS_PMB,
  SQL_SIMPAN_BERKAS_SISWA,
} from "@/lib/validations/berkas-sekolah";
import { PESAN_SISWA_BELUM_DI_CLOUD } from "@/lib/validations/siswa-dapodik";
import type { PmbFileContent, PmbFileMeta } from "@/types/pmb";

/**
 * Berkas pendaftar dan siswa (v59, cloud-only). Kembaran fungsi di
 * `desktop/berkas_sekolah.rs`. Tidak ada outbox: tabelnya tidak pernah
 * tersalin ke perangkat.
 */

/** Bentuk `pmbf-<ms>-<12 hex>`, sama dengan `id_berkas` di Rust. */
function idBerkas(awalan: string): string {
  const acak = crypto.getRandomValues(new Uint8Array(6));
  const hex = Array.from(acak, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${awalan}-${Date.now()}-${hex}`;
}

export function uraiBerkasKiriman(masukan: unknown): BerkasSekolah {
  const hasil = berkasSekolahSchema.safeParse(masukan);
  if (!hasil.success) {
    throw new PmbValidationError(
      hasil.error.issues[0]?.message ?? "Berkas tidak terbaca.",
    );
  }
  return hasil.data;
}

/** Unggah atau ganti satu berkas pendaftar; satu berkas per jenis. */
export async function savePmbFile(
  client: Client,
  idPendaftar: string,
  berkas: BerkasSekolah,
): Promise<{ idBerkas: string }> {
  const id = idBerkas("pmbf");
  const [, simpan] = await client.batch(
    [
      {
        sql: SQL_HAPUS_JENIS_BERKAS_PMB,
        args: [idPendaftar, berkas.jenis, idPendaftar],
      },
      {
        sql: SQL_SIMPAN_BERKAS_PMB,
        args: [
          id,
          idPendaftar,
          berkas.jenis,
          berkas.namaFile,
          berkas.mime,
          berkas.ukuranByte,
          berkas.kontenBase64,
          idPendaftar,
        ],
      },
    ],
    "write",
  );
  if (Number(simpan?.rowsAffected ?? 0) === 0) {
    throw new PmbValidationError(PESAN_PENDAFTAR_SUDAH_SISWA);
  }
  return { idBerkas: id };
}

export async function deletePmbFile(
  client: Client,
  idBerkas: string,
): Promise<void> {
  await client.execute({ sql: SQL_HAPUS_BERKAS_PMB, args: [idBerkas] });
}

/** Daftar berkas seorang siswa, tanpa isinya. */
export async function listStudentFiles(
  client: Client,
  idSiswa: string,
): Promise<PmbFileMeta[]> {
  const hasil = await client.execute({
    sql: "SELECT id_berkas, jenis, nama_file, mime, ukuran_byte, diunggah_oleh, created_at FROM siswa_berkas WHERE id_siswa = ? ORDER BY jenis ASC LIMIT 20;",
    args: [idSiswa.trim()],
  });
  return hasil.rows as unknown as PmbFileMeta[];
}

export async function getStudentFile(
  client: Client,
  idBerkas: string,
): Promise<PmbFileContent> {
  const hasil = await client.execute({
    sql: "SELECT id_berkas, jenis, nama_file, mime, ukuran_byte, konten_base64 FROM siswa_berkas WHERE id_berkas = ? LIMIT 1;",
    args: [idBerkas],
  });
  const baris = hasil.rows[0];
  if (!baris) throw new PmbNotFoundError("Berkas tidak ditemukan.");
  return baris as unknown as PmbFileContent;
}

/** Unggah atau ganti satu berkas siswa; satu berkas per jenis. */
export async function saveStudentFile(
  client: Client,
  idSiswa: string,
  berkas: BerkasSekolah,
  operator: string,
): Promise<{ idBerkas: string }> {
  const siswa = idSiswa.trim();
  const id = idBerkas("sisf");
  const [, simpan] = await client.batch(
    [
      {
        sql: SQL_HAPUS_JENIS_BERKAS_SISWA,
        args: [siswa, berkas.jenis, siswa],
      },
      {
        sql: SQL_SIMPAN_BERKAS_SISWA,
        args: [
          id,
          siswa,
          berkas.jenis,
          berkas.namaFile,
          berkas.mime,
          berkas.ukuranByte,
          berkas.kontenBase64,
          operator,
          siswa,
        ],
      },
    ],
    "write",
  );
  if (Number(simpan?.rowsAffected ?? 0) === 0) {
    throw new PmbValidationError(PESAN_SISWA_BELUM_DI_CLOUD);
  }
  return { idBerkas: id };
}

export async function deleteStudentFile(
  client: Client,
  idBerkas: string,
): Promise<void> {
  await client.execute({ sql: SQL_HAPUS_BERKAS_SISWA, args: [idBerkas] });
}
