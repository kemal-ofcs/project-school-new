import "server-only";

import type { Client, Row, Transaction } from "@libsql/client";
import { ApiRequestError } from "@/lib/server/http/api-response";
import {
  ATURAN_PERCOBAAN,
  ATURAN_PKWT,
  angkaPengaturan,
  BATAL_TUGAS_SQL,
  BENTROK_BAGIAN_SQL,
  BENTROK_JABATAN_SQL,
  BENTROK_JENIS_TUGAS_SQL,
  CATAT_NAMA_BAGIAN_SQL,
  CERMIN_STATUS_SQL,
  type DaftarKontrak,
  type DaftarTugas,
  GABUNG_BAGIAN_SQL,
  HARI_INI_SQL,
  ID_WALI_KELAS,
  idNamaBagian,
  JENIS_TUGAS_SQL,
  type JenisTugas,
  type JenisTugasDraft,
  KONTRAK_SQL,
  type KontrakBaris,
  type KontrakDraft,
  KUNCI_PERCOBAAN_MAKS,
  KUNCI_PKWT_MAKS,
  type MasterDraft,
  normalisasiNama,
  ORG_BAGIAN_NAMA_SQL,
  ORG_BAGIAN_SQL,
  ORG_JABATAN_SQL,
  ORG_PEGAWAI_SQL,
  type OrgKepegawaian,
  PEGAWAI_SQL,
  PENGATURAN_KONTRAK_SQL,
  type PegawaiKepegawaian,
  type PengaturanKontrak,
  type PengaturanKontrakDraft,
  periksaAtasan,
  SIMPAN_BAGIAN_SQL,
  SIMPAN_JABATAN_SQL,
  SIMPAN_JENIS_TUGAS_SQL,
  SIMPAN_KONTRAK_SQL,
  SIMPAN_TUGAS_SQL,
  STATUS_KINI_SQL,
  STATUS_PEMBATALAN,
  statusTugas,
  susunKontrak,
  susunOrg,
  TAHUN_AJARAN_SQL,
  TUGAS_BERLAKU_SQL,
  TUGAS_SQL,
  TULIS_ULANG_BAGIAN_SQL,
  TULIS_ULANG_JABATAN_SQL,
  type TugasDraft,
  validasiAlasan,
  validasiAngkaPengaturan,
  validasiJenisTugas,
  validasiKontrak,
  validasiNamaMaster,
  validasiTugas,
  WALI_KELAS_SQL,
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
  const kini = await statusKini(client, await hariIni(client));
  for (const p of daftar) {
    const status = kini.get(p.id_unik);
    if (status !== undefined) p.status_kepegawaian = status;
  }
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
    jenis_tugas: await jenisTugas(client),
    pengaturan: await pengaturanKontrak(client),
  };
}

// Fase 1b: kontrak, tugas, pengaturan (cermin desktop/hris.rs)

export async function hariIni(db: Db): Promise<string> {
  return teks((await db.execute(HARI_INI_SQL)).rows[0], "hari_ini");
}

/** `STATUS_KINI_SQL` pada `tanggal`: id pegawai → status kepegawaian. */
export async function statusKini(
  db: Db,
  tanggal: string,
): Promise<Map<string, string>> {
  const rows = (await db.execute({ sql: STATUS_KINI_SQL, args: [tanggal] }))
    .rows;
  return new Map(rows.map((r) => [teks(r, "id_unik"), teks(r, "status")]));
}

/** `TUGAS_BERLAKU_SQL` pada [awal, akhir]: id pegawai → id jenis tugas. */
export async function tugasBerlaku(
  db: Db,
  awal: string,
  akhir: string,
): Promise<Map<string, string[]>> {
  const hasil = new Map<string, string[]>();
  for (const r of (
    await db.execute({ sql: TUGAS_BERLAKU_SQL, args: [awal, akhir] })
  ).rows) {
    const id = teks(r, "id_karyawan");
    hasil.set(id, [...(hasil.get(id) ?? []), teks(r, "id_jenis")]);
  }
  return hasil;
}

async function jenisTugas(db: Db): Promise<JenisTugas[]> {
  return (await db.execute(JENIS_TUGAS_SQL)).rows.map((r) => ({
    id_jenis: teks(r, "id_jenis"),
    nama: teks(r, "nama"),
    ekuivalen_jp: Number(r.ekuivalen_jp ?? 0),
    is_aktif: Number(r.is_aktif ?? 1),
  }));
}

async function pengaturanKontrak(db: Db): Promise<PengaturanKontrak> {
  const nilai = new Map(
    (await db.execute(PENGATURAN_KONTRAK_SQL)).rows.map((r) => [
      teks(r, "key"),
      teks(r, "value"),
    ]),
  );
  const percobaan = nilai.get(KUNCI_PERCOBAAN_MAKS) ?? "";
  const pkwt = nilai.get(KUNCI_PKWT_MAKS) ?? "";
  return {
    percobaan_maks_bulan: percobaan,
    pkwt_maks_bulan: pkwt,
    berlaku: {
      percobaan_maks_bulan: angkaPengaturan(percobaan, ATURAN_PERCOBAAN),
      pkwt_maks_bulan: angkaPengaturan(pkwt, ATURAN_PKWT),
    },
  };
}

const UPSERT_SETTING_SQL =
  "INSERT INTO setting_gex_system (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value;";

/** Pegawai (bukan siswa) yang ada; `true` bila punya `guru_data`. */
async function pegawaiGuru(db: Db, id: string): Promise<boolean | null> {
  const row = (
    await db.execute({
      sql: `SELECT EXISTS (SELECT 1 FROM guru_data WHERE id_guru = m.id_unik) AS guru FROM master_data m WHERE m.id_unik = ?1 AND ${PEGAWAI_SQL};`,
      args: [id],
    })
  ).rows[0];
  return row ? Number(row.guru) === 1 : null;
}

function kontrakBaris(r: Row): KontrakBaris {
  return {
    id_kontrak: teks(r, "id_kontrak"),
    id_karyawan: teks(r, "id_karyawan"),
    status: teks(r, "status"),
    id_ref: teks(r, "id_ref"),
    nomor: teks(r, "nomor"),
    tanggal_mulai: teks(r, "tanggal_mulai"),
    tanggal_selesai: teks(r, "tanggal_selesai"),
    percobaan_selesai: teks(r, "percobaan_selesai"),
    catatan: teks(r, "catatan"),
    dicatat_oleh: teks(r, "dicatat_oleh"),
    created_at: teks(r, "created_at"),
  };
}

export async function getKontrak(client: Client): Promise<DaftarKontrak> {
  const kontrak = (await client.execute(KONTRAK_SQL)).rows.map(kontrakBaris);
  const hari = await hariIni(client);
  const pengaturan = await pengaturanKontrak(client);
  return {
    ...susunKontrak(kontrak, hari, pengaturan.berlaku),
    kontrak,
    hari_ini: hari,
    pengaturan,
  };
}

async function tulisKontrak(tx: Transaction, k: KontrakBaris) {
  await tx.execute({
    sql: SIMPAN_KONTRAK_SQL,
    args: [
      k.id_kontrak,
      k.id_karyawan,
      k.status,
      k.id_ref,
      k.nomor,
      k.tanggal_mulai,
      k.tanggal_selesai,
      k.percobaan_selesai,
      k.catatan,
      k.dicatat_oleh,
    ],
  });
  await tx.execute({ sql: CERMIN_STATUS_SQL, args: [k.id_karyawan] });
}

export async function simpanKontrak(
  client: Client,
  oleh: string,
  draft: KontrakDraft,
) {
  const tx = await client.transaction("write");
  try {
    const guru = await pegawaiGuru(tx, draft.id_karyawan.trim());
    if (guru === null) galat("Kontrak hanya untuk pegawai (guru dan tendik).");
    const valid = validasiKontrak(
      {
        status: draft.status,
        nomor: draft.nomor ?? "",
        tanggal_mulai: draft.tanggal_mulai,
        tanggal_selesai: draft.tanggal_selesai ?? "",
        percobaan_selesai: draft.percobaan_selesai ?? "",
        catatan: draft.catatan ?? "",
      },
      guru,
    );
    if (!valid.ok) galat(valid.galat);
    const baris: KontrakBaris = {
      ...valid.nilai,
      id_kontrak: idBaru("kon-"),
      id_karyawan: draft.id_karyawan.trim(),
      id_ref: "",
      dicatat_oleh: oleh,
      created_at: "",
    };
    await tulisKontrak(tx, baris);
    await tx.commit();
    return baris;
  } finally {
    tx.close();
  }
}

export async function batalKontrak(
  client: Client,
  oleh: string,
  idKontrak: string,
  alasan: string,
) {
  const valid = validasiAlasan(alasan);
  if (!valid.ok) galat(valid.galat);
  const id = idKontrak.trim();
  const tx = await client.transaction("write");
  try {
    const asal = (
      await tx.execute({
        sql: "SELECT id_karyawan, tanggal_mulai FROM hr_kontrak WHERE id_kontrak = ?1 AND status <> 'Pembatalan';",
        args: [id],
      })
    ).rows[0];
    if (!asal) galat("Kontrak tidak ditemukan.");
    if (
      await ada(
        tx,
        "SELECT 1 FROM hr_kontrak WHERE status = 'Pembatalan' AND id_ref = ?1;",
        [id],
      )
    )
      galat("Kontrak ini sudah dibatalkan.");
    const baris: KontrakBaris = {
      id_kontrak: `batal-${id}`,
      id_karyawan: teks(asal, "id_karyawan"),
      status: STATUS_PEMBATALAN,
      id_ref: id,
      nomor: "",
      tanggal_mulai: teks(asal, "tanggal_mulai"),
      tanggal_selesai: "",
      percobaan_selesai: "",
      catatan: valid.nilai,
      dicatat_oleh: oleh,
      created_at: "",
    };
    await tulisKontrak(tx, baris);
    await tx.commit();
    return baris;
  } finally {
    tx.close();
  }
}

export async function simpanPengaturan(
  client: Client,
  draft: PengaturanKontrakDraft,
): Promise<PengaturanKontrak> {
  const percobaan = validasiAngkaPengaturan(
    draft.percobaan_maks_bulan,
    ATURAN_PERCOBAAN,
    "Masa percobaan",
  );
  if (!percobaan.ok) galat(percobaan.galat);
  const pkwt = validasiAngkaPengaturan(
    draft.pkwt_maks_bulan,
    ATURAN_PKWT,
    "Batas GTT/PTT",
  );
  if (!pkwt.ok) galat(pkwt.galat);
  await client.batch(
    [
      {
        sql: UPSERT_SETTING_SQL,
        args: [KUNCI_PERCOBAAN_MAKS, percobaan.nilai],
      },
      { sql: UPSERT_SETTING_SQL, args: [KUNCI_PKWT_MAKS, pkwt.nilai] },
    ],
    "write",
  );
  return pengaturanKontrak(client);
}

/** Kunci `pajak_status_tidak_tetap` dari centang kartu konstanta pajak. */
export async function simpanSetting(
  client: Client,
  key: string,
  value: string,
) {
  await client.execute({ sql: UPSERT_SETTING_SQL, args: [key, value] });
}

export async function simpanJenisTugas(client: Client, draft: JenisTugasDraft) {
  const valid = validasiJenisTugas({
    nama: draft.nama,
    ekuivalen_jp: draft.ekuivalen_jp,
  });
  if (!valid.ok) galat(valid.galat);
  const isAktif = draft.is_aktif ?? 1;
  const tx = await client.transaction("write");
  try {
    let id = draft.id?.trim() ?? "";
    if (id) {
      if (
        !(await ada(tx, "SELECT 1 FROM hr_tugas_jenis WHERE id_jenis = ?1;", [
          id,
        ]))
      )
        galat("Jenis tugas tidak ditemukan.");
    } else {
      id = idBaru("tgs-");
    }
    if (await ada(tx, BENTROK_JENIS_TUGAS_SQL, [valid.nilai.nama, id]))
      galat(`Nama "${valid.nilai.nama}" sudah dipakai jenis tugas lain.`);
    await tx.execute({
      sql: SIMPAN_JENIS_TUGAS_SQL,
      args: [id, valid.nilai.nama, valid.nilai.ekuivalen_jp, isAktif],
    });
    await tx.commit();
    return {
      id_jenis: id,
      nama: valid.nilai.nama,
      ekuivalen_jp: valid.nilai.ekuivalen_jp,
      is_aktif: isAktif,
    };
  } finally {
    tx.close();
  }
}

export async function getTugas(client: Client): Promise<DaftarTugas> {
  const hari = await hariIni(client);
  const [tugas, wali, tahun] = await Promise.all(
    [TUGAS_SQL, WALI_KELAS_SQL, TAHUN_AJARAN_SQL].map((sql) =>
      client.execute(sql),
    ),
  );
  return {
    jenis: await jenisTugas(client),
    tugas: tugas.rows.map((r) => {
      const baris = {
        id_tugas: teks(r, "id_tugas"),
        id_karyawan: teks(r, "id_karyawan"),
        id_jenis: teks(r, "id_jenis"),
        unit: teks(r, "unit"),
        tahun_ajaran: teks(r, "tahun_ajaran"),
        id_rombel: teks(r, "id_rombel"),
        nomor_sk: teks(r, "nomor_sk"),
        tanggal_sk: teks(r, "tanggal_sk"),
        ekuivalen_jp: r.ekuivalen_jp === null ? null : Number(r.ekuivalen_jp),
        tanggal_mulai: teks(r, "tanggal_mulai"),
        tanggal_selesai: teks(r, "tanggal_selesai"),
        dicatat_oleh: teks(r, "dicatat_oleh"),
        dibatalkan_pada: teks(r, "dibatalkan_pada"),
        dibatalkan_oleh: teks(r, "dibatalkan_oleh"),
        alasan_batal: teks(r, "alasan_batal"),
      };
      return { ...baris, status: statusTugas(baris, hari) };
    }),
    wali_kelas: wali.rows.map((r) => ({
      id_rombel: teks(r, "id_rombel"),
      nama_rombel: teks(r, "nama_rombel"),
      id_wali_kelas: teks(r, "id_wali_kelas"),
      nama_tahun: teks(r, "nama_tahun"),
      semester: teks(r, "semester"),
      tanggal_mulai: teks(r, "tanggal_mulai"),
      tanggal_selesai: teks(r, "tanggal_selesai"),
    })),
    tahun_ajaran: tahun.rows.map((r) => ({
      nama_tahun: teks(r, "nama_tahun"),
      tanggal_mulai: teks(r, "tanggal_mulai"),
      tanggal_selesai: teks(r, "tanggal_selesai"),
    })),
    hari_ini: hari,
  };
}

export async function simpanTugas(
  client: Client,
  oleh: string,
  draft: TugasDraft,
) {
  const valid = validasiTugas({
    id_karyawan: draft.id_karyawan,
    id_jenis: draft.id_jenis,
    unit: draft.unit ?? "",
    tahun_ajaran: draft.tahun_ajaran,
    id_rombel: draft.id_rombel ?? "",
    nomor_sk: draft.nomor_sk ?? "",
    tanggal_sk: draft.tanggal_sk ?? "",
    ekuivalen_jp: draft.ekuivalen_jp ?? null,
    tanggal_mulai: draft.tanggal_mulai,
    tanggal_selesai: draft.tanggal_selesai ?? "",
  });
  if (!valid.ok) galat(valid.galat);
  const t = valid.nilai;
  const idLama = draft.id?.trim() ?? "";
  const tx = await client.transaction("write");
  try {
    let jenisLama: string | null = null;
    if (idLama) {
      const lama = (
        await tx.execute({
          sql: "SELECT id_jenis, dibatalkan_pada FROM hr_tugas_tambahan WHERE id_tugas = ?1;",
          args: [idLama],
        })
      ).rows[0];
      if (!lama) galat("Tugas tidak ditemukan.");
      if (lama.dibatalkan_pada !== null)
        galat("Tugas yang sudah dibatalkan tidak bisa diubah.");
      jenisLama = teks(lama, "id_jenis");
    }
    if ((await pegawaiGuru(tx, t.id_karyawan)) === null)
      galat("Tugas tambahan hanya untuk pegawai (guru dan tendik).");
    const jenis = (
      await tx.execute({
        sql: "SELECT nama, is_aktif FROM hr_tugas_jenis WHERE id_jenis = ?1;",
        args: [t.id_jenis],
      })
    ).rows[0];
    if (!jenis) galat("Jenis tugas tidak ditemukan.");
    if (Number(jenis.is_aktif) !== 1 && jenisLama !== t.id_jenis)
      galat(`Jenis tugas "${teks(jenis, "nama")}" sudah nonaktif.`);
    if (
      t.id_jenis === ID_WALI_KELAS &&
      !(await ada(
        tx,
        "SELECT 1 FROM akademik_rombel WHERE id_rombel = ?1 AND id_wali_kelas = ?2;",
        [t.id_rombel, t.id_karyawan],
      ))
    )
      galat("Rombel ini tidak berwali pegawai tersebut.");
    const id = idLama || idBaru("tgt-");
    await tx.execute({
      sql: SIMPAN_TUGAS_SQL,
      args: [
        id,
        t.id_karyawan,
        t.id_jenis,
        t.unit,
        t.tahun_ajaran,
        t.id_rombel,
        t.nomor_sk,
        t.tanggal_sk,
        t.ekuivalen_jp,
        t.tanggal_mulai,
        t.tanggal_selesai,
        oleh,
      ],
    });
    await tx.commit();
    return { id_tugas: id, ...t, dicatat_oleh: oleh };
  } finally {
    tx.close();
  }
}

export async function batalTugas(
  client: Client,
  oleh: string,
  idTugas: string,
  alasan: string,
) {
  const valid = validasiAlasan(alasan);
  if (!valid.ok) galat(valid.galat);
  const id = idTugas.trim();
  const tx = await client.transaction("write");
  try {
    const lama = (
      await tx.execute({
        sql: "SELECT dibatalkan_pada FROM hr_tugas_tambahan WHERE id_tugas = ?1;",
        args: [id],
      })
    ).rows[0];
    if (!lama) galat("Tugas tidak ditemukan.");
    if (lama.dibatalkan_pada !== null) galat("Tugas ini sudah dibatalkan.");
    await tx.execute({ sql: BATAL_TUGAS_SQL, args: [id, oleh, valid.nilai] });
    await tx.commit();
    return { id_tugas: id, dibatalkan_oleh: oleh, alasan_batal: valid.nilai };
  } finally {
    tx.close();
  }
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
