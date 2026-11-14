import "server-only";

import { createHash } from "node:crypto";
import type { Client, Row, Transaction } from "@libsql/client";
import { hasPermission } from "@/lib/auth/access";
import type { OperatorUser } from "@/lib/auth/operator-user";
import type { PermissionKey } from "@/lib/rbac/catalog";
import { ApiRequestError } from "@/lib/server/http/api-response";
import { parseJpMaxForUnit } from "@/lib/validations/class-attendance";
import { tanggalValid } from "@/lib/validations/hari-kerja";
import type { HolidayWhitelistEntry } from "@/lib/validations/holiday-whitelist";
import {
  type BarisJenis,
  type BarisKeputusan,
  type BarisPengajuan,
  BENTROK_JENIS_SQL,
  bentrokPengajuan,
  CLOUD_KEPUTUSAN_SQL,
  DAFTAR_KEPUTUSAN_SQL,
  DAFTAR_PENGAJUAN_SQL,
  type DaftarPengajuan,
  dalamCakupan,
  type HasilSimpanPengajuan,
  type IsiPengajuan,
  JENIS_SQL,
  type JenisDraft,
  type JenisPengajuan,
  JP_MAX_SQL,
  jadwalDariBaris,
  KEPUTUSAN_SATU_SQL,
  type Keputusan,
  kanonikPengajuan,
  LIBUR_SQL,
  PEGAWAI_PENGAJUAN_SQL,
  PEGAWAI_SATU_SQL,
  PENGAJUAN_AKTIF_ORANG_SQL,
  PENGAJUAN_SATU_SQL,
  PERIODE_DIBAYAR_SQL,
  PERIODE_PERLU_ULANG_SQL,
  type PegawaiPengajuan,
  type PengajuanDraft,
  periksaAksi,
  periksaJenis,
  periksaMaks,
  periksaSunting,
  periksaUrgent,
  pesanBertumpuk,
  pesanPeriodeDibayar,
  pesanRunUlang,
  type Ringkas,
  SIMPAN_JENIS_SQL,
  SIMPAN_PENGAJUAN_SQL,
  samaOrang,
  selisihHari,
  statusPengajuan,
  susunDaftar,
  tanggalWajib,
  UNIT_PERSONIL_SQL,
  validasiJenis,
  validasiPengajuan,
  WAKTU_SQL,
  WHITELIST_SQL,
} from "@/lib/validations/hr-pengajuan";

// Cermin penulisan lokal `desktop/hr_pengajuan.rs`. Web menulis langsung ke
// database cloud dengan SQL cloud (keputusan mencatat `diterima_cloud`);
// perangkat menerimanya lewat tarikan (`sync_pulse`).

type Db = Client | Transaction;

const teks = (row: Row | undefined, kolom: string) =>
  String(row?.[kolom] ?? "");
const angkaAtauNull = (nilai: unknown) =>
  nilai === null || nilai === undefined ? null : Number(nilai);

function galat(pesan: string): never {
  throw new ApiRequestError(pesan, 400);
}

function idBaru(awalan: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return (
    awalan + [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")
  );
}

/** Cermin `sidik_pengajuan`: SHA-256 heks dari `kanonikPengajuan`. */
export function sidikPengajuan(isi: IsiPengajuan): string {
  return createHash("sha256")
    .update(kanonikPengajuan(isi), "utf8")
    .digest("hex");
}

const punya = (operator: OperatorUser, izin: string) =>
  hasPermission(operator, izin as PermissionKey);
const tautan = (operator: OperatorUser) => (operator.idKaryawan ?? "").trim();

async function satuTeks(db: Db, sql: string, arg: string) {
  return teks((await db.execute({ sql, args: [arg] })).rows[0], "unit");
}

async function unitAkun(db: Db, operator: OperatorUser) {
  const id = tautan(operator);
  return id === "" ? "" : satuTeks(db, UNIT_PERSONIL_SQL, id);
}

async function waktuSekarang(db: Db) {
  return teks((await db.execute(WAKTU_SQL)).rows[0], "waktu");
}

async function periode(db: Db, sql: string, mulai: string, selesai: string) {
  const r = (await db.execute({ sql, args: [mulai, selesai] })).rows[0];
  return r ? [teks(r, "period_start"), teks(r, "period_end")] : null;
}

async function tolakPeriodeDibayar(db: Db, mulai: string, selesai: string) {
  const p = await periode(db, PERIODE_DIBAYAR_SQL, mulai, selesai);
  if (p) galat(pesanPeriodeDibayar(p[0], p[1]));
}

const keputusanDari = (rows: Row[]): Keputusan[] =>
  rows.map((r) => ({
    id_keputusan: teks(r, "id_keputusan"),
    jenis: teks(r, "jenis"),
    sidik: teks(r, "sidik"),
    oleh: teks(r, "oleh"),
    waktu_perangkat: teks(r, "waktu_perangkat"),
    diterima_cloud:
      r.diterima_cloud === null || r.diterima_cloud === undefined
        ? null
        : String(r.diterima_cloud),
  }));

/** Cermin `requests`. */
export async function daftarPengajuan(
  client: Client,
  operator: OperatorUser,
  dari: string,
  sampai: string,
): Promise<DaftarPengajuan> {
  if (!tanggalValid(dari) || !tanggalValid(sampai) || sampai < dari) {
    galat("Rentang tanggal tidak valid.");
  }
  const pengajuan = (
    await client.execute({ sql: DAFTAR_PENGAJUAN_SQL, args: [dari, sampai] })
  ).rows.map(
    (r): BarisPengajuan => ({
      id_pengajuan: teks(r, "id_pengajuan"),
      id_karyawan: teks(r, "id_karyawan"),
      nama: teks(r, "nama"),
      unit: teks(r, "unit"),
      guru: Number(r.guru ?? 0),
      id_jenis: teks(r, "id_jenis"),
      nama_jenis: teks(r, "nama_jenis"),
      kelompok: teks(r, "kelompok"),
      potong_jatah: Number(r.potong_jatah ?? 0),
      dampak_gaji: teks(r, "dampak_gaji"),
      izin_pemutus: teks(r, "izin_pemutus"),
      tanggal_mulai: teks(r, "tanggal_mulai"),
      tanggal_selesai: teks(r, "tanggal_selesai"),
      jam_mulai_ke: angkaAtauNull(r.jam_mulai_ke),
      jam_sampai_ke: angkaAtauNull(r.jam_sampai_ke),
      setengah_hari: Number(r.setengah_hari ?? 0),
      alasan: teks(r, "alasan"),
      sidik: teks(r, "sidik"),
      diajukan_oleh: teks(r, "diajukan_oleh"),
      waktu_perangkat: teks(r, "waktu_perangkat"),
    }),
  );
  const keputusan = (
    await client.execute({
      sql: DAFTAR_KEPUTUSAN_SQL,
      args: [JSON.stringify(pengajuan.map((p) => p.id_pengajuan))],
    })
  ).rows.map(
    (r): BarisKeputusan => ({
      ...keputusanDari([r])[0],
      id_pengajuan: teks(r, "id_pengajuan"),
      alasan: teks(r, "alasan"),
      id_karyawan_oleh: teks(r, "id_karyawan_oleh"),
      unit_oleh: teks(r, "unit_oleh"),
    }),
  );
  const [jenis, pegawai] = await Promise.all([
    client.execute(JENIS_SQL),
    client.execute(PEGAWAI_PENGAJUAN_SQL),
  ]);
  return {
    pengajuan: susunDaftar(pengajuan, keputusan),
    jenis: jenis.rows.map((r) => ({ ...r }) as unknown as BarisJenis),
    pegawai: pegawai.rows.map(
      (r): PegawaiPengajuan => ({
        id_unik: teks(r, "id_unik"),
        nama: teks(r, "nama"),
        unit: teks(r, "unit"),
        guru: Number(r.guru ?? 0),
      }),
    ),
    sesi: {
      id_karyawan: tautan(operator),
      unit: await unitAkun(client, operator),
      lingkup_semua: punya(operator, "hr.scope.all"),
    },
    dari,
    sampai,
  };
}

async function jenisSatu(db: Db, id: string): Promise<JenisPengajuan | null> {
  const baris = (await db.execute(JENIS_SQL)).rows.find(
    (r) => teks(r, "id_jenis") === id,
  );
  if (!baris) return null;
  const hasil = validasiJenis({ ...baris });
  return hasil.ok ? hasil.nilai : null;
}

async function hariKerja(
  db: Db,
  baris: Row,
  mulai: string,
  selesai: string,
): Promise<number> {
  const [libur, whitelist] = await Promise.all([
    db.execute({ sql: LIBUR_SQL, args: [mulai, selesai] }),
    db.execute(WHITELIST_SQL),
  ]);
  return tanggalWajib(
    jadwalDariBaris({
      divisi: baris.divisi,
      hari_kerja: baris.hari_kerja,
      kode_shift: baris.kode_shift,
    }),
    new Set(libur.rows.map((r) => teks(r, "tanggal"))),
    whitelist.rows.map(
      (r): HolidayWhitelistEntry => ({
        id: teks(r, "id"),
        scope_type: teks(r, "scope_type"),
        scope_value: teks(r, "scope_value"),
        tanggal_libur: teks(r, "tanggal_libur") || null,
        keterangan: null,
        status_aktif: Number(r.status_aktif ?? 0),
      }),
    ),
    mulai,
    selesai,
  ).length;
}

/** Cermin `simpan`: buat atau sunting selama Menunggu, urgent sekaligus. */
export async function simpanPengajuan(
  client: Client,
  operator: OperatorUser,
  draft: PengajuanDraft,
): Promise<HasilSimpanPengajuan> {
  const valid = validasiPengajuan(draft);
  if (!valid.ok) galat(valid.pesan);
  const p = valid.nilai;
  const idLama = draft.id_pengajuan?.trim() ?? "";
  const tx = await client.transaction("write");
  try {
    const orang = (
      await tx.execute({ sql: PEGAWAI_SATU_SQL, args: [p.id_karyawan] })
    ).rows[0];
    if (!orang) galat("Pengajuan hanya untuk pegawai (guru dan tendik).");
    const jenis = await jenisSatu(tx, p.id_jenis);
    if (!jenis) galat("Jenis pengajuan tidak ditemukan.");
    const jp = (
      await tx.execute({ sql: JP_MAX_SQL, args: [teks(orang, "unit")] })
    ).rows[0];
    const cek = periksaJenis(
      p,
      jenis,
      Number(orang.guru) === 1,
      parseJpMaxForUnit(
        jp?.unit == null ? null : String(jp.unit),
        jp?.sekolah == null ? null : String(jp.sekolah),
      ),
    );
    if (!cek.ok) galat(cek.pesan);
    if (jenis.maks_hari !== null) {
      const kalender = selisihHari(p.tanggal_mulai, p.tanggal_selesai) + 1;
      const kerja = await hariKerja(
        tx,
        orang,
        p.tanggal_mulai,
        p.tanggal_selesai,
      );
      const maks = periksaMaks(jenis, kerja, kalender);
      if (!maks.ok) galat(maks.pesan);
    }
    const sekarang = await waktuSekarang(tx);
    let id = idLama;
    let diajukanOleh = operator.username;
    if (idLama === "") {
      id = idBaru("pgn-");
    } else {
      const lama = (
        await tx.execute({ sql: PENGAJUAN_SATU_SQL, args: [idLama] })
      ).rows[0];
      if (!lama) galat("Pengajuan tidak ditemukan.");
      const kep = keputusanDari(
        (await tx.execute({ sql: KEPUTUSAN_SATU_SQL, args: [idLama] })).rows,
      );
      diajukanOleh = teks(lama, "diajukan_oleh");
      const sunting = periksaSunting(
        statusPengajuan(teks(lama, "sidik"), kep),
        samaOrang(diajukanOleh, operator.username),
        operator.isSuperadmin,
      );
      if (!sunting.ok) galat(sunting.pesan);
      await tolakPeriodeDibayar(
        tx,
        teks(lama, "tanggal_mulai"),
        teks(lama, "tanggal_selesai"),
      );
    }
    await tolakPeriodeDibayar(tx, p.tanggal_mulai, p.tanggal_selesai);
    const saya: Ringkas = {
      id_karyawan: p.id_karyawan,
      tanggal_mulai: p.tanggal_mulai,
      tanggal_selesai: p.tanggal_selesai,
      jam_mulai_ke: p.jam_mulai_ke,
      jam_sampai_ke: p.jam_sampai_ke,
    };
    const lain = (
      await tx.execute({
        sql: PENGAJUAN_AKTIF_ORANG_SQL,
        args: [p.id_karyawan, id, p.tanggal_mulai, p.tanggal_selesai],
      })
    ).rows.map(
      (r): Ringkas => ({
        id_karyawan: teks(r, "id_karyawan"),
        tanggal_mulai: teks(r, "tanggal_mulai"),
        tanggal_selesai: teks(r, "tanggal_selesai"),
        jam_mulai_ke: angkaAtauNull(r.jam_mulai_ke),
        jam_sampai_ke: angkaAtauNull(r.jam_sampai_ke),
      }),
    );
    const bentrok = lain.find((b) => bentrokPengajuan(saya, b));
    if (bentrok) {
      galat(pesanBertumpuk(bentrok.tanggal_mulai, bentrok.tanggal_selesai));
    }
    const isi: IsiPengajuan = {
      id_karyawan: p.id_karyawan,
      id_jenis: p.id_jenis,
      kelompok: jenis.kelompok,
      potong_jatah: jenis.potong_jatah,
      dampak_gaji: jenis.dampak_gaji,
      izin_pemutus: jenis.izin_pemutus,
      tanggal_mulai: p.tanggal_mulai,
      tanggal_selesai: p.tanggal_selesai,
      jam_mulai_ke: p.jam_mulai_ke,
      jam_sampai_ke: p.jam_sampai_ke,
      setengah_hari: p.setengah_hari,
      alasan: p.alasan,
    };
    const sidik = sidikPengajuan(isi);
    if (p.urgent) {
      if (!punya(operator, "hr.request.urgent")) {
        galat("Kamu tidak punya izin pengajuan urgent.");
      }
      const cakupan = dalamCakupan(
        punya(operator, "hr.scope.all"),
        await unitAkun(tx, operator),
        teks(orang, "unit"),
      );
      const urgent = periksaUrgent(tautan(operator) === p.id_karyawan, cakupan);
      if (!urgent.ok) galat(urgent.pesan);
    }
    const payload = {
      id_pengajuan: id,
      ...isi,
      potong_jatah: isi.potong_jatah ? 1 : 0,
      setengah_hari: isi.setengah_hari ? 1 : 0,
      sidik,
      diajukan_oleh: diajukanOleh,
      waktu_perangkat: sekarang,
    };
    await tx.execute({
      sql: SIMPAN_PENGAJUAN_SQL,
      args: [
        id,
        isi.id_karyawan,
        isi.id_jenis,
        isi.kelompok,
        payload.potong_jatah,
        isi.dampak_gaji,
        isi.izin_pemutus,
        isi.tanggal_mulai,
        isi.tanggal_selesai,
        isi.jam_mulai_ke,
        isi.jam_sampai_ke,
        payload.setengah_hari,
        isi.alasan,
        sidik,
        diajukanOleh,
        sekarang,
      ],
    });
    if (p.urgent) {
      await tx.execute({
        sql: CLOUD_KEPUTUSAN_SQL,
        args: [
          `urgent-${id}`,
          id,
          "Setujui Urgent",
          sidik,
          "",
          operator.username,
          tautan(operator),
          sekarang,
        ],
      });
    }
    const ulang = await periode(
      tx,
      PERIODE_PERLU_ULANG_SQL,
      p.tanggal_mulai,
      p.tanggal_selesai,
    );
    await tx.commit();
    return {
      pengajuan: payload,
      peringatan: ulang ? pesanRunUlang(ulang[0], ulang[1]) : null,
    };
  } finally {
    tx.close();
  }
}

/** Cermin `putuskan`: izin pemutus, cakupan, dan diri sendiri dari sesi. */
export async function putuskanPengajuan(
  client: Client,
  operator: OperatorUser,
  idPengajuan: string,
  aksi: string,
  alasan: string,
) {
  const tx = await client.transaction("write");
  try {
    const id = idPengajuan.trim();
    const p = (await tx.execute({ sql: PENGAJUAN_SATU_SQL, args: [id] }))
      .rows[0];
    if (!p) galat("Pengajuan tidak ditemukan.");
    const daftar = keputusanDari(
      (await tx.execute({ sql: KEPUTUSAN_SATU_SQL, args: [id] })).rows,
    );
    const sidik = teks(p, "sidik");
    const idKaryawan = teks(p, "id_karyawan");
    const unitPegawai = await satuTeks(tx, UNIT_PERSONIL_SQL, idKaryawan);
    const cek = periksaAksi(aksi, alasan, {
      status: statusPengajuan(sidik, daftar),
      sudah_diketahui: daftar.some((k) => k.jenis === "Diketahui"),
      pengaju_sendiri: samaOrang(teks(p, "diajukan_oleh"), operator.username),
      superadmin: operator.isSuperadmin,
      karyawan_sendiri:
        tautan(operator) !== "" && tautan(operator) === idKaryawan,
      boleh_putus: punya(operator, teks(p, "izin_pemutus")),
      dalam_cakupan: dalamCakupan(
        punya(operator, "hr.scope.all"),
        await unitAkun(tx, operator),
        unitPegawai,
      ),
    });
    if (!cek.ok) galat(cek.pesan);
    if (aksi === "Setujui" || aksi === "Batal") {
      await tolakPeriodeDibayar(
        tx,
        teks(p, "tanggal_mulai"),
        teks(p, "tanggal_selesai"),
      );
    }
    const idKeputusan =
      aksi === "Diketahui"
        ? `tahu-${id}`
        : aksi === "Batal"
          ? `batal-${id}`
          : idBaru("kpt-");
    const sekarang = await waktuSekarang(tx);
    const payload = {
      id_keputusan: idKeputusan,
      id_pengajuan: id,
      jenis: aksi,
      sidik,
      alasan: alasan.trim(),
      oleh: operator.username,
      id_karyawan_oleh: tautan(operator),
      waktu_perangkat: sekarang,
    };
    await tx.execute({
      sql: CLOUD_KEPUTUSAN_SQL,
      args: [
        payload.id_keputusan,
        id,
        aksi,
        sidik,
        payload.alasan,
        payload.oleh,
        payload.id_karyawan_oleh,
        sekarang,
      ],
    });
    await tx.commit();
    return payload;
  } finally {
    tx.close();
  }
}

/** Cermin `simpan_jenis`. */
export async function simpanJenisPengajuan(client: Client, draft: JenisDraft) {
  const valid = validasiJenis(draft);
  if (!valid.ok) galat(valid.pesan);
  const j = valid.nilai;
  const tx = await client.transaction("write");
  try {
    let id = draft.id_jenis?.trim() ?? "";
    if (id) {
      if (!(await jenisSatu(tx, id))) galat("Jenis pengajuan tidak ditemukan.");
    } else {
      id = idBaru("jns-");
    }
    const bentrok = await tx.execute({
      sql: BENTROK_JENIS_SQL,
      args: [j.nama, id],
    });
    if (bentrok.rows.length > 0) {
      galat(`Nama "${j.nama}" sudah dipakai jenis pengajuan lain.`);
    }
    await tx.execute({
      sql: SIMPAN_JENIS_SQL,
      args: [
        id,
        j.nama,
        j.kelompok,
        j.izin_pemutus,
        j.boleh_urgent ? 1 : 0,
        j.potong_jatah ? 1 : 0,
        j.wajib_dokumen ? 1 : 0,
        j.dampak_gaji,
        j.maks_hari,
        j.satuan_maks,
        j.is_aktif ? 1 : 0,
      ],
    });
    await tx.commit();
    return { ...j, id_jenis: id };
  } finally {
    tx.close();
  }
}
