import "server-only";

import type { Client, Row, Transaction } from "@libsql/client";
import { ApiRequestError } from "@/lib/server/http/api-response";
import {
  BENTROK_BAGIAN_SQL,
  BENTROK_JABATAN_SQL,
  CATAT_NAMA_BAGIAN_SQL,
  GABUNG_BAGIAN_SQL,
  idNamaBagian,
  type MasterDraft,
  normalisasiNama,
  ORG_BAGIAN_NAMA_SQL,
  ORG_BAGIAN_SQL,
  ORG_JABATAN_SQL,
  ORG_PEGAWAI_SQL,
  type OrgKepegawaian,
  PEGAWAI_SQL,
  type PegawaiKepegawaian,
  periksaAtasan,
  SIMPAN_BAGIAN_SQL,
  SIMPAN_JABATAN_SQL,
  susunOrg,
  TULIS_ULANG_BAGIAN_SQL,
  TULIS_ULANG_JABATAN_SQL,
  validasiNamaMaster,
} from "@/lib/validations/hris";

// Cermin penulisan lokal `desktop/hris.rs`. Web menulis langsung ke database
// cloud; perangkat menerima hasilnya lewat tarikan (`sync_pulse`).

type Db = Client | Transaction;

const teks = (row: Row, kolom: string) => String(row[kolom] ?? "");

function galat(pesan: string): never {
  throw new ApiRequestError(pesan, 400);
}

function idBaru(awalan: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return (
    awalan + [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")
  );
}

async function ada(db: Db, sql: string, args: (string | number)[]) {
  return (await db.execute({ sql, args })).rows.length > 0;
}

export async function getOrg(client: Client): Promise<OrgKepegawaian> {
  const [pegawai, bagian, nama, jabatan] = await Promise.all(
    [ORG_PEGAWAI_SQL, ORG_BAGIAN_SQL, ORG_BAGIAN_NAMA_SQL, ORG_JABATAN_SQL].map(
      (sql) => client.execute(sql),
    ),
  );
  const daftar: PegawaiKepegawaian[] = pegawai.rows.map((r) => ({
    id_unik: teks(r, "id_unik"),
    kode_karyawan: teks(r, "kode_karyawan"),
    nama: teks(r, "nama"),
    unit: teks(r, "unit"),
    divisi: teks(r, "divisi"),
    jabatan_status: teks(r, "jabatan_status"),
    id_bagian: teks(r, "id_bagian"),
    id_jabatan: teks(r, "id_jabatan"),
    id_atasan: teks(r, "id_atasan"),
    status_aktif: teks(r, "status_aktif"),
    tmt: teks(r, "tmt"),
    kelompok: teks(r, "kelompok") === "Guru" ? "Guru" : "Tendik",
    status_kepegawaian: teks(r, "status_kepegawaian"),
  }));
  const master = (rows: Row[], kolom: string) =>
    rows.map((r) => ({
      id: teks(r, kolom),
      nama: teks(r, "nama"),
      is_aktif: Number(r.is_aktif ?? 1),
    }));
  return {
    ...susunOrg(
      daftar,
      master(bagian.rows, "id_bagian"),
      nama.rows.map((r) => ({
        id_bagian: teks(r, "id_bagian"),
        nama: teks(r, "nama"),
      })),
      master(jabatan.rows, "id_jabatan"),
    ),
    pegawai: daftar,
  };
}

export async function simpanBagian(client: Client, draft: MasterDraft) {
  const valid = validasiNamaMaster(draft.nama, "bagian");
  if (!valid.ok) galat(valid.galat);
  const isAktif = draft.is_aktif ?? 1;
  const tx = await client.transaction("write");
  try {
    let id = draft.id?.trim() ?? "";
    if (id) {
      if (
        !(await ada(tx, "SELECT 1 FROM hr_bagian WHERE id_bagian = ?1;", [id]))
      )
        galat("Bagian tidak ditemukan.");
    } else {
      id = idBaru("bag-");
    }
    if (await ada(tx, BENTROK_BAGIAN_SQL, [valid.nama, id])) {
      galat(
        `Nama "${valid.nama}" sudah dipakai bagian lain (nama sekarang atau nama lamanya).`,
      );
    }
    await tx.execute({
      sql: SIMPAN_BAGIAN_SQL,
      args: [id, valid.nama, isAktif],
    });
    await tx.execute({
      sql: CATAT_NAMA_BAGIAN_SQL,
      args: [idNamaBagian(id, valid.nama), id, valid.nama],
    });
    for (const sql of TULIS_ULANG_BAGIAN_SQL) {
      await tx.execute({ sql, args: [id] });
    }
    await tx.commit();
    return { id_bagian: id, nama: valid.nama, is_aktif: isAktif };
  } finally {
    tx.close();
  }
}

export async function gabungBagian(
  client: Client,
  idAsal: string,
  idTujuan: string,
) {
  const asal = idAsal.trim();
  const tujuan = idTujuan.trim();
  if (!asal || !tujuan || asal === tujuan)
    galat("Pilih dua bagian yang berbeda.");
  const tx = await client.transaction("write");
  try {
    if (
      !(await ada(tx, "SELECT 1 FROM hr_bagian WHERE id_bagian = ?1;", [asal]))
    )
      galat("Bagian asal tidak ditemukan.");
    if (
      !(await ada(
        tx,
        "SELECT 1 FROM hr_bagian WHERE id_bagian = ?1 AND is_aktif = 1;",
        [tujuan],
      ))
    )
      galat("Bagian tujuan harus bagian aktif.");
    for (const sql of GABUNG_BAGIAN_SQL) {
      await tx.execute({ sql, args: [asal, tujuan] });
    }
    for (const sql of TULIS_ULANG_BAGIAN_SQL) {
      await tx.execute({ sql, args: [tujuan] });
    }
    await tx.commit();
    return { id_asal: asal, id_tujuan: tujuan };
  } finally {
    tx.close();
  }
}

export async function simpanJabatan(client: Client, draft: MasterDraft) {
  const valid = validasiNamaMaster(draft.nama, "jabatan");
  if (!valid.ok) galat(valid.galat);
  const isAktif = draft.is_aktif ?? 1;
  const tx = await client.transaction("write");
  try {
    let id = draft.id?.trim() ?? "";
    if (id) {
      if (
        !(await ada(tx, "SELECT 1 FROM hr_jabatan WHERE id_jabatan = ?1;", [
          id,
        ]))
      )
        galat("Jabatan tidak ditemukan.");
    } else {
      id = idBaru("jab-");
    }
    if (await ada(tx, BENTROK_JABATAN_SQL, [valid.nama, id])) {
      galat(`Nama "${valid.nama}" sudah dipakai jabatan lain.`);
    }
    await tx.execute({
      sql: SIMPAN_JABATAN_SQL,
      args: [id, valid.nama, isAktif],
    });
    await tx.execute({ sql: TULIS_ULANG_JABATAN_SQL, args: [id] });
    await tx.commit();
    return { id_jabatan: id, nama: valid.nama, is_aktif: isAktif };
  } finally {
    tx.close();
  }
}

export interface OrganisasiValid {
  id_bagian: string;
  divisi: string;
  id_jabatan: string;
  jabatan_status: string;
  id_atasan: string;
}

/**
 * Pilihan bagian/jabatan/atasan dari form Karyawan dan Guru; cermin
 * `periksa_organisasi`. Master baru wajib aktif; master nonaktif yang SUDAH
 * dipegang orang itu boleh tetap. Tanpa `id_bagian`, teks `divisi` berlaku.
 */
export async function periksaOrganisasi(
  db: Db,
  idKaryawan: string,
  draft: {
    divisi?: string | null;
    jabatan_status?: string | null;
    id_bagian?: string | null;
    id_jabatan?: string | null;
    id_atasan?: string | null;
  },
  bagianWajib: boolean,
): Promise<OrganisasiValid> {
  const lama = (
    await db.execute({
      sql: "SELECT COALESCE(id_bagian, '') AS id_bagian, COALESCE(id_jabatan, '') AS id_jabatan FROM master_data WHERE id_unik = ?1;",
      args: [idKaryawan],
    })
  ).rows[0];
  const hasil: OrganisasiValid = {
    id_bagian: "",
    divisi: normalisasiNama(draft.divisi ?? ""),
    id_jabatan: "",
    jabatan_status: normalisasiNama(draft.jabatan_status ?? ""),
    id_atasan: "",
  };
  const idBagian = draft.id_bagian?.trim() ?? "";
  if (!idBagian) {
    if (bagianWajib) galat("Bagian wajib dipilih.");
  } else {
    const b = (
      await db.execute({
        sql: "SELECT nama, is_aktif FROM hr_bagian WHERE id_bagian = ?1;",
        args: [idBagian],
      })
    ).rows[0];
    if (!b) galat("Bagian tidak ditemukan.");
    if (Number(b.is_aktif) !== 1 && idBagian !== String(lama?.id_bagian ?? ""))
      galat(`Bagian "${teks(b, "nama")}" sudah nonaktif.`);
    hasil.id_bagian = idBagian;
    hasil.divisi = teks(b, "nama");
  }
  const idJabatan = draft.id_jabatan?.trim() ?? "";
  if (idJabatan) {
    const j = (
      await db.execute({
        sql: "SELECT nama, is_aktif FROM hr_jabatan WHERE id_jabatan = ?1;",
        args: [idJabatan],
      })
    ).rows[0];
    if (!j) galat("Jabatan tidak ditemukan.");
    if (
      Number(j.is_aktif) !== 1 &&
      idJabatan !== String(lama?.id_jabatan ?? "")
    )
      galat(`Jabatan "${teks(j, "nama")}" sudah nonaktif.`);
    hasil.id_jabatan = idJabatan;
    hasil.jabatan_status = teks(j, "nama");
  }
  const idAtasan = draft.id_atasan?.trim() ?? "";
  if (idAtasan) {
    if (
      !(await ada(
        db,
        `SELECT 1 FROM master_data m WHERE m.id_unik = ?1 AND ${PEGAWAI_SQL};`,
        [idAtasan],
      ))
    )
      galat("Atasan harus pegawai yang terdaftar.");
    const peta = new Map(
      (
        await db.execute(
          "SELECT id_unik, COALESCE(id_atasan, '') AS id_atasan FROM master_data WHERE COALESCE(id_atasan, '') <> ''\n-- batas: pegawai yang punya atasan, dibatasi jumlah personil lembaga\n;",
        )
      ).rows.map((r) => [teks(r, "id_unik"), teks(r, "id_atasan")]),
    );
    const salah = periksaAtasan(idKaryawan, idAtasan, peta);
    if (salah) galat(salah);
    hasil.id_atasan = idAtasan;
  }
  return hasil;
}

/** Kolom organisasi satu pegawai di cloud; kosong = NULL. */
export async function tulisOrganisasi(
  db: Db,
  idKaryawan: string,
  org: OrganisasiValid,
) {
  await db.execute({
    sql: "UPDATE master_data SET id_bagian = NULLIF(?2, ''), id_jabatan = NULLIF(?3, ''), id_atasan = NULLIF(?4, '') WHERE id_unik = ?1;",
    args: [idKaryawan, org.id_bagian, org.id_jabatan, org.id_atasan],
  });
}
