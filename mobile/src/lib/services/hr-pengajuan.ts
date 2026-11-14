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
  ATURAN_CUTI_SQL,
  aturanCuti,
  type BarisJenis,
  type BarisKeputusan,
  type BarisPengajuan,
  type BarisPenyesuaian,
  BENTROK_JENIS_SQL,
  type Berlaku,
  bentrokPengajuan,
  berlakuDari,
  CLOUD_KEPUTUSAN_SQL,
  CLOUD_PENYESUAIAN_SQL,
  type CutiDibayar,
  DAFTAR_KEPUTUSAN_SQL,
  DAFTAR_PENGAJUAN_SQL,
  type DaftarPengajuan,
  dalamCakupan,
  HADIR_ORANG_SQL,
  HARI_ABSEN_SQL,
  type HasilSimpanPengajuan,
  hadirSaatCuti,
  hitungCutiDibayar,
  type IsiPengajuan,
  JADWAL_PEGAWAI_SQL,
  JATAH_PEGAWAI_SQL,
  JATAH_TERPAKAI_SQL,
  JENIS_SQL,
  type JenisDraft,
  type JenisPengajuan,
  JP_MAX_SQL,
  jadwalDariBaris,
  jatahCuti,
  KEPUTUSAN_SATU_SQL,
  type KelompokCuti,
  type Keputusan,
  kanonikPengajuan,
  LIBUR_SQL,
  MAKS_RENTANG_HARI,
  PEGAWAI_PENGAJUAN_SQL,
  PEGAWAI_SATU_SQL,
  PENGAJUAN_AKTIF_ORANG_SQL,
  PENGAJUAN_RENTANG_SQL,
  PENGAJUAN_SATU_SQL,
  PENYESUAIAN_ORANG_SQL,
  PENYESUAIAN_SATU_SQL,
  PERIODE_DIBAYAR_SQL,
  PERIODE_PERLU_ULANG_SQL,
  type PegawaiPengajuan,
  type PengajuanDraft,
  type PengajuanTersusun,
  penuhPada,
  periksaAksi,
  periksaJenis,
  periksaMaks,
  periksaSunting,
  periksaUrgent,
  pesanBertumpuk,
  pesanPeriodeDibayar,
  pesanRunUlang,
  RIWAYAT_PENGAJUAN_SQL,
  type Ringkas,
  type SaldoCuti,
  SIMPAN_JENIS_SQL,
  SIMPAN_PENGAJUAN_SQL,
  samaOrang,
  selisihHari,
  statusBerlaku,
  statusPengajuan,
  susunDaftar,
  tanggalWajib,
  UNIT_PERSONIL_SQL,
  validasiAturanCuti,
  validasiJenis,
  validasiPengajuan,
  validasiPenyesuaian,
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

async function barisPengajuan(
  db: Db,
  sql: string,
  args: string[],
): Promise<BarisPengajuan[]> {
  return (await db.execute({ sql, args })).rows.map(
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
}

async function barisKeputusan(
  db: Db,
  ids: string[],
): Promise<BarisKeputusan[]> {
  return (
    await db.execute({ sql: DAFTAR_KEPUTUSAN_SQL, args: [JSON.stringify(ids)] })
  ).rows.map(
    (r): BarisKeputusan => ({
      ...keputusanDari([r])[0],
      id_pengajuan: teks(r, "id_pengajuan"),
      alasan: teks(r, "alasan"),
      id_karyawan_oleh: teks(r, "id_karyawan_oleh"),
      unit_oleh: teks(r, "unit_oleh"),
    }),
  );
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
  const pengajuan = await barisPengajuan(client, DAFTAR_PENGAJUAN_SQL, [
    dari,
    sampai,
  ]);
  const keputusan = await barisKeputusan(
    client,
    pengajuan.map((p) => p.id_pengajuan),
  );
  const [jenis, pegawai] = await Promise.all([
    client.execute(JENIS_SQL),
    client.execute(PEGAWAI_PENGAJUAN_SQL),
  ]);
  const tersusun = susunDaftar(pengajuan, keputusan);
  await tandaiHadirSaatCuti(client, tersusun);
  return {
    pengajuan: tersusun,
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

// Pembaca 2b (Alfa, audit, gaji, jatah). Cermin `desktop/hr_pengajuan.rs`.

const kolomAngka = (row: Row | undefined, kolom: string) =>
  Number(row?.[kolom] ?? 0);

/** Cermin `muat_berlaku`. */
export async function muatBerlaku(
  db: Db,
  mulai: string,
  selesai: string,
): Promise<Berlaku[]> {
  return (
    await db.execute({ sql: PENGAJUAN_RENTANG_SQL, args: [mulai, selesai] })
  ).rows.map((r) => berlakuDari({ ...r }));
}

/** Cermin `pengajuan_pada`: id pegawai → ditutup hari penuh. */
export async function pengajuanPada(
  db: Db,
  tanggal: string,
): Promise<Map<string, boolean>> {
  const hasil = new Map<string, boolean>();
  for (const p of await muatBerlaku(db, tanggal, tanggal)) {
    hasil.set(
      p.id_karyawan,
      (hasil.get(p.id_karyawan) ?? false) || penuhPada(p, tanggal),
    );
  }
  return hasil;
}

async function muatKalender(db: Db, mulai: string, selesai: string) {
  const [libur, whitelist] = await Promise.all([
    db.execute({ sql: LIBUR_SQL, args: [mulai, selesai] }),
    db.execute(WHITELIST_SQL),
  ]);
  return {
    libur: new Set(libur.rows.map((r) => teks(r, "tanggal"))),
    whitelist: whitelist.rows.map(
      (r): HolidayWhitelistEntry => ({
        id: teks(r, "id"),
        scope_type: teks(r, "scope_type"),
        scope_value: teks(r, "scope_value"),
        tanggal_libur: teks(r, "tanggal_libur") || null,
        keterangan: null,
        status_aktif: kolomAngka(r, "status_aktif"),
      }),
    ),
  };
}

const jadwalBaris = (r: Row) =>
  jadwalDariBaris({
    divisi: r.divisi,
    hari_kerja: r.hari_kerja,
    kode_shift: r.kode_shift,
  });

/** Cermin `cuti_dibayar`: kait rekap gaji (§20.2.7). */
export async function cutiDibayar(
  db: Db,
  mulai: string,
  akhir: string,
): Promise<Map<string, CutiDibayar>> {
  const berlaku = (await muatBerlaku(db, mulai, akhir)).filter(
    (p) => p.dampak_gaji === "Dibayar",
  );
  if (berlaku.length === 0) return new Map();
  const [jadwalRes, kalender, absenRes] = await Promise.all([
    db.execute({
      sql: JADWAL_PEGAWAI_SQL,
      args: [JSON.stringify(berlaku.map((p) => p.id_karyawan))],
    }),
    muatKalender(db, mulai, akhir),
    db.execute({ sql: HARI_ABSEN_SQL, args: [mulai, akhir] }),
  ]);
  const jadwal = new Map(
    jadwalRes.rows.map((r) => [
      teks(r, "id_unik"),
      { jadwal: jadwalBaris(r), normal: kolomAngka(r, "jam_normal") },
    ]),
  );
  const absen = new Map<string, Map<string, [boolean, number]>>();
  for (const r of absenRes.rows) {
    const id = teks(r, "id_karyawan");
    const per = absen.get(id) ?? new Map<string, [boolean, number]>();
    per.set(teks(r, "tanggal"), [
      kolomAngka(r, "hadir") === 1,
      kolomAngka(r, "jam_kerja"),
    ]);
    absen.set(id, per);
  }
  const tanggal = new Map<string, [string, boolean][]>();
  for (const p of berlaku) {
    const j = jadwal.get(p.id_karyawan);
    if (!j) continue;
    const dari = p.tanggal_mulai > mulai ? p.tanggal_mulai : mulai;
    const sampai = p.tanggal_selesai < akhir ? p.tanggal_selesai : akhir;
    const daftar = tanggal.get(p.id_karyawan) ?? [];
    for (const t of tanggalWajib(
      j.jadwal,
      kalender.libur,
      kalender.whitelist,
      dari,
      sampai,
    )) {
      daftar.push([t, penuhPada(p, t)]);
    }
    tanggal.set(p.id_karyawan, daftar);
  }
  return new Map(
    [...tanggal].map(([id, daftar]) => [
      id,
      hitungCutiDibayar(
        daftar,
        absen.get(id) ?? new Map(),
        jadwal.get(id)?.normal ?? 0,
      ),
    ]),
  );
}

/** Cermin `tandai_hadir_saat_cuti`. */
async function tandaiHadirSaatCuti(db: Db, pengajuan: PengajuanTersusun[]) {
  const cuti = pengajuan.filter(
    (p) => p.kelompok === "Cuti" && statusBerlaku(p.status),
  );
  if (cuti.length === 0) return;
  const mulai = cuti.map((p) => p.tanggal_mulai).sort()[0];
  const selesai = cuti
    .map((p) => p.tanggal_selesai)
    .sort()
    .at(-1) as string;
  const hadir = new Set(
    (await db.execute({ sql: HARI_ABSEN_SQL, args: [mulai, selesai] })).rows
      .filter((r) => kolomAngka(r, "hadir") === 1)
      .map((r) => `${teks(r, "id_karyawan")}|${teks(r, "tanggal")}`),
  );
  for (const p of cuti) {
    if (hadirSaatCuti(berlakuDari({ ...p }), hadir)) {
      p.tanda.push("hadir_saat_cuti");
    }
  }
}

async function petaAturan(db: Db): Promise<Map<string, string>> {
  return new Map(
    (await db.execute(ATURAN_CUTI_SQL)).rows.map((r) => [
      teks(r, "key"),
      teks(r, "value"),
    ]),
  );
}

const aturanKeduanya = (peta: Map<string, string>) => ({
  guru: aturanCuti(peta, "guru"),
  tendik: aturanCuti(peta, "tendik"),
});

/** Cermin `tanggal_terpakai`: tanggal wajib Cuti `potong_jatah`, tanpa Hadir. */
async function tanggalTerpakai(
  db: Db,
  id: string,
  jadwal: ReturnType<typeof jadwalDariBaris>,
): Promise<string[]> {
  const rentang = (
    await db.execute({ sql: JATAH_TERPAKAI_SQL, args: [id] })
  ).rows.map((r) => [teks(r, "tanggal_mulai"), teks(r, "tanggal_selesai")]);
  if (rentang.length === 0) return [];
  const mulai = rentang.map((r) => r[0]).sort()[0];
  const selesai = rentang
    .map((r) => r[1])
    .sort()
    .at(-1) as string;
  const kalender = await muatKalender(db, mulai, selesai);
  const hadir = new Set(
    (
      await db.execute({ sql: HADIR_ORANG_SQL, args: [id, mulai, selesai] })
    ).rows.map((r) => teks(r, "tanggal")),
  );
  const tanggal = new Set(
    rentang
      .flatMap(([a, b]) =>
        tanggalWajib(jadwal, kalender.libur, kalender.whitelist, a, b),
      )
      .filter((t) => !hadir.has(t)),
  );
  return [...tanggal].sort();
}

/** Cermin `jatah_pegawai`. */
async function jatahPegawai(
  db: Db,
  peta: Map<string, string>,
  id: string,
  hariIni: string,
) {
  const p = (await db.execute({ sql: JATAH_PEGAWAI_SQL, args: [id] })).rows[0];
  if (!p) return null;
  const kelompok: KelompokCuti =
    kolomAngka(p, "guru") === 1 ? "guru" : "tendik";
  const jadwal = jadwalBaris(p);
  const penyesuaian = (
    await db.execute({ sql: PENYESUAIAN_ORANG_SQL, args: [id] })
  ).rows.map(
    (r): BarisPenyesuaian => ({
      id_penyesuaian: teks(r, "id_penyesuaian"),
      periode: teks(r, "periode"),
      jenis: teks(r, "jenis"),
      id_ref: teks(r, "id_ref"),
      hari: kolomAngka(r, "hari"),
      alasan: teks(r, "alasan"),
      dicatat_oleh: teks(r, "dicatat_oleh"),
      created_at: teks(r, "created_at"),
      dibatalkan: kolomAngka(r, "dibatalkan"),
    }),
  );
  const aktif = penyesuaian
    .filter((r) => r.jenis !== "Pembatalan" && r.dibatalkan === 0)
    .map((r) => [r.periode, r.hari] as const);
  const tmt = teks(p, "tmt");
  const periode = jatahCuti(
    tmt === "" ? null : tmt,
    aturanCuti(peta, kelompok),
    await tanggalTerpakai(db, id, jadwal),
    aktif,
    hariIni,
  );
  const berjalan =
    periode.find((x) => x.mulai <= hariIni && hariIni <= x.selesai) ?? null;
  const tanda: string[] = [];
  if (tmt === "") tanda.push("tanpa_tmt");
  if (berjalan && berjalan.sisa < 0) tanda.push("jatah_minus");
  return {
    info: {
      id_karyawan: id,
      nama: teks(p, "nama"),
      unit: teks(p, "unit"),
      kelompok,
      tmt,
      tanda,
      berjalan,
      penyesuaian,
    },
    jadwal,
    periode,
  };
}

const PESAN_BUKAN_PEGAWAI = "Jatah cuti hanya untuk pegawai (guru dan tendik).";

async function hariIniWib(db: Db) {
  return teks((await db.execute(WAKTU_SQL)).rows[0], "hari_ini");
}

/** Cermin `saldo_cuti`. */
export async function saldoCuti(
  client: Client,
  idKaryawan: string | null,
  mulai: string | null,
  selesai: string | null,
): Promise<SaldoCuti> {
  const hariIni = await hariIniWib(client);
  const peta = await petaAturan(client);
  const hasil: SaldoCuti = {
    aturan: aturanKeduanya(peta),
    hari_ini: hariIni,
    pegawai: null,
  };
  const id = (idKaryawan ?? "").trim();
  if (id === "") return hasil;
  const jatah = await jatahPegawai(client, peta, id, hariIni);
  if (!jatah) galat(PESAN_BUKAN_PEGAWAI);
  const riwayat = await barisPengajuan(client, RIWAYAT_PENGAJUAN_SQL, [id]);
  const tersusun = susunDaftar(
    riwayat,
    await barisKeputusan(
      client,
      riwayat.map((r) => r.id_pengajuan),
    ),
  );
  await tandaiHadirSaatCuti(client, tersusun);
  const pegawai: NonNullable<SaldoCuti["pegawai"]> = {
    ...jatah.info,
    periode: jatah.periode,
    riwayat: tersusun,
  };
  if (mulai !== null && selesai !== null) {
    if (
      !tanggalValid(mulai) ||
      !tanggalValid(selesai) ||
      selesai < mulai ||
      selisihHari(mulai, selesai) >= MAKS_RENTANG_HARI
    ) {
      galat("Rentang tanggal tidak valid.");
    }
    const kalender = await muatKalender(client, mulai, selesai);
    pegawai.hari_wajib = tanggalWajib(
      jatah.jadwal,
      kalender.libur,
      kalender.whitelist,
      mulai,
      selesai,
    ).length;
  }
  hasil.pegawai = pegawai;
  return hasil;
}

const UPSERT_SETTING_SQL =
  "INSERT INTO setting_gex_system (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value;";

/** Cermin `simpan_aturan_cuti`. Web menulis langsung ke cloud. */
export async function simpanAturanCuti(
  client: Client,
  draft: Record<string, unknown>,
) {
  const valid = validasiAturanCuti(draft);
  if (!valid.ok) galat(valid.pesan);
  await client.batch(
    valid.nilai.map(([key, value]) => ({
      sql: UPSERT_SETTING_SQL,
      args: [key, value],
    })),
    "write",
  );
  return aturanKeduanya(await petaAturan(client));
}

/** Cermin `sesuaikan_cuti`: penyesuaian append-only atau pembatalannya. */
export async function sesuaikanCuti(
  client: Client,
  operator: OperatorUser,
  draft: Record<string, unknown>,
) {
  const valid = validasiPenyesuaian(draft);
  if (!valid.ok) galat(valid.pesan);
  const s = valid.nilai;
  const tx = await client.transaction("write");
  try {
    let payload: Record<string, string | number>;
    if (s.batal === "") {
      const jatah = await jatahPegawai(
        tx,
        await petaAturan(tx),
        s.id_karyawan,
        await hariIniWib(tx),
      );
      if (!jatah) galat(PESAN_BUKAN_PEGAWAI);
      if (!jatah.periode.some((p) => p.mulai === s.periode)) {
        galat("Periode itu bukan periode jatah pegawai ini.");
      }
      payload = {
        id_penyesuaian: idBaru("cpy-"),
        id_karyawan: s.id_karyawan,
        periode: s.periode,
        jenis: s.jenis,
        id_ref: "",
        hari: s.hari,
        alasan: s.alasan,
        dicatat_oleh: operator.username,
      };
    } else {
      const target = (
        await tx.execute({ sql: PENYESUAIAN_SATU_SQL, args: [s.batal] })
      ).rows[0];
      if (!target || teks(target, "jenis") === "Pembatalan") {
        galat("Penyesuaian tidak ditemukan.");
      }
      if (kolomAngka(target, "dibatalkan") === 1) {
        galat("Penyesuaian ini sudah dibatalkan.");
      }
      payload = {
        id_penyesuaian: `batal-${s.batal}`,
        id_karyawan: teks(target, "id_karyawan"),
        periode: teks(target, "periode"),
        jenis: "Pembatalan",
        id_ref: s.batal,
        hari: 0,
        alasan: s.alasan,
        dicatat_oleh: operator.username,
      };
    }
    await tx.execute({
      sql: CLOUD_PENYESUAIAN_SQL,
      args: [
        payload.id_penyesuaian,
        payload.id_karyawan,
        payload.periode,
        payload.jenis,
        payload.id_ref,
        payload.hari,
        payload.alasan,
        payload.dicatat_oleh,
      ],
    });
    await tx.commit();
    return payload;
  } finally {
    tx.close();
  }
}
