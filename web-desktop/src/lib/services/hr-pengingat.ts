import "server-only";

import type { Client, Row } from "@libsql/client";
import { hasPermission } from "@/lib/auth/access";
import type { OperatorUser } from "@/lib/auth/operator-user";
import { pengaturanKontrak } from "@/lib/services/hris";
import {
  JADWAL_JP_SQL,
  type JadwalJp,
  JP_TERDAMPAK_SQL,
  jpTerdampak,
  LIBUR_SQL,
  PENANGANAN_SQL,
  type PengajuanJp,
  UNIT_PERSONIL_SQL,
} from "@/lib/validations/hr-pengajuan";
import {
  type DataPengingat,
  type ItemPengingat,
  PENGINGAT_DOKUMEN_SQL,
  PENGINGAT_KONTRAK_SQL,
  PENGINGAT_PEGAWAI_SQL,
  PENGINGAT_PENGAJUAN_SQL,
  PENGINGAT_SEMESTER_SQL,
  PENGINGAT_SP_SQL,
  type PerluPerhatian,
  pengingat,
  saringPengingat,
} from "@/lib/validations/hr-pengingat";
import { HARI_INI_SQL } from "@/lib/validations/hris";

// Cermin pemuat `desktop/hr_pengingat.rs`. Web selalu membaca database cloud.

const teks = (row: Row | undefined, kolom: string) =>
  String(row?.[kolom] ?? "");
const angkaAtauNull = (nilai: unknown) =>
  nilai === null || nilai === undefined || nilai === "" ? null : Number(nilai);

/** Baris SQL ke objek berkolom teks, seperti `dari_teks` di Rust. */
function dariTeks<T>(rows: readonly Row[], kolom: readonly (keyof T)[]): T[] {
  return rows.map(
    (r) =>
      Object.fromEntries(
        kolom.map((k) => [k, teks(r, String(k))]),
      ) as unknown as T,
  );
}

async function baris(client: Client, sql: string, args: string[] = []) {
  return (await client.execute({ sql, args })).rows;
}

/** Cermin `muat_jp_hari_ini`. */
async function muatJpHariIni(
  client: Client,
  hariIni: string,
): Promise<Pick<DataPengingat, "jp" | "ditangani">> {
  const pengajuan = (
    await baris(client, JP_TERDAMPAK_SQL, [hariIni, hariIni, ""])
  ).map(
    (r): PengajuanJp => ({
      id_pengajuan: teks(r, "id_pengajuan"),
      id_karyawan: teks(r, "id_karyawan"),
      nama_guru: teks(r, "nama_guru"),
      tanggal_mulai: teks(r, "tanggal_mulai"),
      tanggal_selesai: teks(r, "tanggal_selesai"),
      jam_mulai_ke: angkaAtauNull(r.jam_mulai_ke),
      jam_sampai_ke: angkaAtauNull(r.jam_sampai_ke),
    }),
  );
  if (pengajuan.length === 0) return { jp: [], ditangani: [] };
  const rentang = [hariIni, hariIni];
  const [jadwal, libur, penanganan] = await Promise.all([
    baris(client, JADWAL_JP_SQL, rentang),
    baris(client, LIBUR_SQL, rentang),
    baris(client, PENANGANAN_SQL, rentang),
  ]);
  return {
    jp: jpTerdampak(
      pengajuan,
      jadwal.map(
        (r): JadwalJp => ({
          id_jadwal: teks(r, "id_jadwal"),
          id_guru: teks(r, "id_guru"),
          hari: Number(r.hari ?? 0),
          jam_ke: teks(r, "jam_ke"),
          id_rombel: teks(r, "id_rombel"),
          nama_rombel: teks(r, "nama_rombel"),
          id_mapel: teks(r, "id_mapel"),
          nama_mapel: teks(r, "nama_mapel"),
          unit: teks(r, "unit"),
          ta_mulai: teks(r, "ta_mulai"),
          ta_selesai: teks(r, "ta_selesai"),
        }),
      ),
      new Set(libur.map((r) => teks(r, "tanggal"))),
      hariIni,
      hariIni,
    ),
    ditangani: penanganan.map((r) => teks(r, "id_penanganan")),
  };
}

/** Cermin `muat_pengingat`: satu sumber untuk kartu dan Telegram. */
export async function muatPengingat(
  client: Client,
): Promise<{ hari_ini: string; items: ItemPengingat[] }> {
  const hariIni = teks((await baris(client, HARI_INI_SQL))[0], "hari_ini");
  const h = [hariIni];
  const [setelan, jp, pegawai, kontrak, dokumen, sp, pengajuan, semester] =
    await Promise.all([
      pengaturanKontrak(client),
      muatJpHariIni(client, hariIni),
      baris(client, PENGINGAT_PEGAWAI_SQL, h),
      baris(client, PENGINGAT_KONTRAK_SQL),
      baris(client, PENGINGAT_DOKUMEN_SQL, h),
      baris(client, PENGINGAT_SP_SQL, h),
      baris(client, PENGINGAT_PENGAJUAN_SQL),
      baris(client, PENGINGAT_SEMESTER_SQL, h),
    ]);
  const data: DataPengingat = {
    pegawai: dariTeks(pegawai, [
      "id_karyawan",
      "nama",
      "jabatan",
      "unit",
      "tmt",
      "status",
      "tanggal_lahir",
    ]),
    kontrak: dariTeks(kontrak, [
      "id_kontrak",
      "id_karyawan",
      "status",
      "tanggal_selesai",
      "percobaan_selesai",
    ]),
    dokumen: dariTeks(dokumen, [
      "id_dokumen",
      "id_karyawan",
      "nama_jenis",
      "tanggal_kedaluwarsa",
    ]),
    sp: dariTeks(sp, ["id_sp", "id_karyawan", "berlaku_sampai"]),
    pengajuan: dariTeks(pengajuan, ["id_karyawan", "izin_pemutus", "tanggal"]),
    semester: dariTeks(semester, [
      "id_tahun_ajaran",
      "nama_tahun",
      "semester",
      "tanggal_mulai",
      "unit",
    ]),
    ...jp,
  };
  return {
    hari_ini: hariIni,
    items: pengingat(data, hariIni, {
      kgb_tahun: setelan.berlaku.kgb_tahun,
      pensiun_usia: setelan.berlaku.pensiun_usia,
    }),
  };
}

/** Cermin `perlu_perhatian`: item kartu yang boleh dilihat sesi. */
export async function perluPerhatian(
  client: Client,
  operator: OperatorUser,
): Promise<PerluPerhatian> {
  const { hari_ini, items } = await muatPengingat(client);
  const id = (operator.idKaryawan ?? "").trim();
  const unit =
    id === ""
      ? ""
      : teks((await baris(client, UNIT_PERSONIL_SQL, [id]))[0], "unit");
  return {
    hari_ini,
    items: saringPengingat(
      {
        id_karyawan: id,
        unit,
        lingkup_semua: hasPermission(operator, "hr.scope.all"),
        superadmin: operator.isSuperadmin,
        izin: operator.permissions,
      },
      items,
    ),
  };
}
