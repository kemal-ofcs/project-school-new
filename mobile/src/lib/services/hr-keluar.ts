import "server-only";

import type { Client, Row } from "@libsql/client";
import { hasPermission } from "@/lib/auth/access";
import type { OperatorUser } from "@/lib/auth/operator-user";
import type { PermissionKey } from "@/lib/rbac/catalog";
import { ApiRequestError } from "@/lib/server/http/api-response";
import { sisaCutiPada } from "@/lib/services/hr-pengajuan";
import { tanggalValid } from "@/lib/validations/hari-kerja";
import {
  AKUN_TERTAUT_SQL,
  ALASAN_KELUAR_SQL,
  ALASAN_SATU_SQL,
  ALFA_SESUDAH_SQL,
  type AlasanKeluar,
  akhirMasaSp,
  BATALKAN_SQL,
  BERLAKUKAN_SQL,
  CABUT_SP_SQL,
  type ChecklistKeluar,
  DAFTAR_KELUAR_SQL,
  type DaftarKeluar,
  type DaftarSp,
  type HasilSimpanSp,
  JADWAL_AKTIF_KELUAR_SQL,
  JP_PENGGANTI_SESUDAH_SQL,
  KASBON_KELUAR_SQL,
  KELUAR_SATU_SQL,
  type KeluarBaris,
  type KeluarDraft,
  MAKS_TEKS_KELUAR,
  MAKS_TEKS_SP,
  MASA_SP_SQL,
  masaSpBerlaku,
  NOMOR_KEMBAR_SQL,
  PEGAWAI_KELUAR_SQL,
  PEGAWAI_SP_SQL,
  PENGAJUAN_SESUDAH_SQL,
  PESAN_BELUM_JATUH_TEMPO,
  PESAN_BLOKIR_JADWAL,
  PESAN_BLOKIR_WALI,
  PESAN_DIRI_SENDIRI,
  PESAN_KELUAR_BERLAKU,
  PESAN_KELUAR_DIBATALKAN,
  PESAN_KELUAR_TERBUKA,
  PESAN_SP_DICABUT,
  PESAN_SUPERADMIN_TERAKHIR,
  PINJAMAN_PERSONIL_SQL,
  periksaTingkat,
  periksaWewenangSp,
  RAPEL_KELUAR_SQL,
  type RincianKeluar,
  RUN_MASA_TERAKHIR_SQL,
  SIMPAN_KELUAR_SQL,
  SIMPAN_SP_SQL,
  SP_PEGAWAI_SQL,
  SP_SATU_SQL,
  type SpBaris,
  type SpDraft,
  type SpRingkas,
  SUPERADMIN_AKTIF_SQL,
  statusKeluar,
  statusSp,
  type TingkatSp,
  TUGAS_KELUAR_SQL,
  UBAH_KELUAR_SQL,
  UBAH_SP_SQL,
  usulanTingkat,
  validasiKeluar,
  validasiSp,
  WALI_KELUAR_SQL,
} from "@/lib/validations/hr-keluar";
import {
  dalamCakupan,
  UNIT_PERSONIL_SQL,
} from "@/lib/validations/hr-pengajuan";
import {
  HARI_INI_SQL,
  PESAN_PEGAWAI_BELUM_DI_CLOUD,
  STATUS_KINI_SQL,
} from "@/lib/validations/hris";

// Cermin I/O cloud `desktop/hr_keluar.rs`. Tabelnya cloud-only, jadi Web dan
// Desktop menulis ke database yang sama tanpa outbox.

const teks = (row: Row | undefined, kolom: string) =>
  String(row?.[kolom] ?? "");

function galat(pesan: string): never {
  throw new ApiRequestError(pesan, 400);
}

function idBaru(awalan: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return (
    awalan + [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")
  );
}

const punya = (operator: OperatorUser, izin: PermissionKey) =>
  hasPermission(operator, izin);
const tautan = (operator: OperatorUser) => (operator.idKaryawan ?? "").trim();

async function satu(client: Client, sql: string, args: string[] = []) {
  return (await client.execute({ sql, args })).rows[0];
}

async function hariIni(client: Client) {
  return teks(await satu(client, HARI_INI_SQL), "hari_ini");
}

async function masaSp(client: Client) {
  const baris = await satu(client, MASA_SP_SQL);
  return masaSpBerlaku(baris ? teks(baris, "value") : null);
}

/** "Diri sendiri" dan cakupan unit dari SESI, cermin `wewenang`. */
async function wewenang(
  client: Client,
  operator: OperatorUser,
  idKaryawan: string,
  unitSasaran: string,
  tingkat: string,
) {
  const sesi = tautan(operator);
  const unitAkun =
    sesi === ""
      ? ""
      : teks(await satu(client, UNIT_PERSONIL_SQL, [sesi]), "unit");
  const cek = periksaWewenangSp(
    tingkat,
    sesi !== "" && sesi === idKaryawan,
    dalamCakupan(punya(operator, "hr.scope.all"), unitAkun, unitSasaran),
    punya(operator, "hr.warning.sp3"),
  );
  if (!cek.ok) galat(cek.galat);
}

const ringkas = (rows: Row[]): SpRingkas[] =>
  rows.map((r) => ({
    tingkat: teks(r, "tingkat"),
    tanggal: teks(r, "tanggal"),
    berlaku_sampai: teks(r, "berlaku_sampai"),
    dicabut: teks(r, "dicabut_pada") !== "",
  }));

/** Cermin `daftar_sp`. */
export async function daftarSp(
  client: Client,
  idKaryawan: string,
): Promise<DaftarSp> {
  const id = idKaryawan.trim();
  if (!id) galat("Pegawai wajib dipilih.");
  const hari = await hariIni(client);
  const rows = (await client.execute({ sql: SP_PEGAWAI_SQL, args: [id] })).rows;
  const sp: SpBaris[] = rows.map((r) => {
    const baris = Object.fromEntries(
      Object.keys(r)
        .filter((k) => Number.isNaN(Number(k)))
        .map((k) => [k, teks(r, k)]),
    );
    return {
      ...(baris as unknown as SpBaris),
      tingkat: teks(r, "tingkat") as TingkatSp,
      usulan_tingkat: teks(r, "usulan_tingkat") as TingkatSp,
      masa_bulan: Number(r.masa_bulan ?? 0),
      status: statusSp(
        teks(r, "tanggal"),
        teks(r, "berlaku_sampai"),
        teks(r, "dicabut_pada") !== "",
        hari,
      ),
    };
  });
  return {
    sp,
    usulan: usulanTingkat(ringkas(rows), hari),
    masa_bulan: await masaSp(client),
    hari_ini: hari,
  };
}

async function nomorKembar(client: Client, nomor: string | null, idSp: string) {
  if (!nomor) return false;
  const r = await satu(client, NOMOR_KEMBAR_SQL, [nomor, idSp]);
  return Number(r?.jumlah ?? 0) > 0;
}

/** Cermin `simpan_sp`: SP baru, atau ubah teks SP yang belum dicabut. */
export async function simpanSp(
  client: Client,
  operator: OperatorUser,
  draft: SpDraft,
): Promise<HasilSimpanSp> {
  const hari = await hariIni(client);
  const cek = validasiSp(draft, hari);
  if (!cek.ok) galat(cek.galat);
  const sah = cek.nilai;
  if (sah.id_sp) {
    const lama = await satu(client, SP_SATU_SQL, [sah.id_sp]);
    if (!lama) galat("SP tidak ditemukan.");
    if (teks(lama, "dicabut_pada") !== "") galat(PESAN_SP_DICABUT);
    if (
      teks(lama, "id_karyawan") !== sah.id_karyawan ||
      teks(lama, "tingkat") !== sah.tingkat ||
      teks(lama, "tanggal") !== sah.tanggal
    ) {
      galat(
        "Tingkat dan tanggal SP tidak bisa diubah. Cabut SP ini lalu buat yang baru.",
      );
    }
    await wewenang(
      client,
      operator,
      sah.id_karyawan,
      teks(lama, "unit"),
      sah.tingkat,
    );
    const hasil = await client.execute({
      sql: UBAH_SP_SQL,
      args: [
        sah.id_sp,
        sah.nomor,
        sah.pelanggaran,
        sah.harapan,
        sah.penanda_nama,
        sah.penanda_jabatan,
        sah.penanda_nip,
        operator.username,
      ],
    });
    if (hasil.rowsAffected === 0) galat(PESAN_SP_DICABUT);
    return {
      sukses: true,
      id_sp: sah.id_sp,
      nomor_kembar: await nomorKembar(client, sah.nomor, sah.id_sp),
    };
  }
  const pegawai = await satu(client, PEGAWAI_SP_SQL, [sah.id_karyawan]);
  if (!pegawai) galat(PESAN_PEGAWAI_BELUM_DI_CLOUD);
  const unit = teks(pegawai, "unit");
  await wewenang(client, operator, sah.id_karyawan, unit, sah.tingkat);
  if (teks(pegawai, "status_aktif") !== "Aktif")
    galat("SP hanya untuk pegawai aktif.");
  const masuk = teks(pegawai, "tanggal_daftar");
  if (masuk !== "" && sah.tanggal < masuk)
    galat("Tanggal SP tidak boleh sebelum tanggal masuk pegawai.");
  const riwayat = (
    await client.execute({ sql: SP_PEGAWAI_SQL, args: [sah.id_karyawan] })
  ).rows;
  const usulan = usulanTingkat(ringkas(riwayat), sah.tanggal).tingkat;
  const tingkat = periksaTingkat(sah.tingkat, usulan, sah.alasan_tingkat);
  if (!tingkat.ok) galat(tingkat.galat);
  const masaBulan = await masaSp(client);
  const berlakuSampai = akhirMasaSp(sah.tanggal, masaBulan);
  if (!berlakuSampai) galat("Tanggal SP tidak valid.");
  const idSp = idBaru("sp-");
  await client.execute({
    sql: SIMPAN_SP_SQL,
    args: [
      idSp,
      sah.id_karyawan,
      sah.tingkat,
      usulan,
      sah.tingkat !== usulan ? sah.alasan_tingkat : null,
      sah.tanggal,
      masaBulan,
      berlakuSampai,
      sah.nomor,
      sah.pelanggaran,
      sah.harapan,
      sah.penanda_nama,
      sah.penanda_jabatan,
      sah.penanda_nip,
      unit,
      operator.username,
    ],
  });
  return {
    sukses: true,
    id_sp: idSp,
    nomor_kembar: await nomorKembar(client, sah.nomor, idSp),
  };
}

/** Cermin `cabut_sp`: dengan alasan, sekali. */
export async function cabutSp(
  client: Client,
  operator: OperatorUser,
  idSp: string,
  alasan: string,
) {
  const id = idSp.trim();
  const isi = alasan.trim();
  if (!isi) galat("Alasan pencabutan wajib diisi.");
  if ([...isi].length > MAKS_TEKS_SP)
    galat(`Alasan pencabutan maksimal ${MAKS_TEKS_SP} karakter.`);
  const lama = await satu(client, SP_SATU_SQL, [id]);
  if (!lama) galat("SP tidak ditemukan.");
  if (teks(lama, "dicabut_pada") !== "") galat(PESAN_SP_DICABUT);
  await wewenang(
    client,
    operator,
    teks(lama, "id_karyawan"),
    teks(lama, "unit"),
    "",
  );
  const hasil = await client.execute({
    sql: CABUT_SP_SQL,
    args: [id, operator.username, isi],
  });
  if (hasil.rowsAffected === 0) galat(PESAN_SP_DICABUT);
  return { sukses: true as const };
}

// ── Pegawai keluar (HRIS Fase 4b), cermin I/O cloud `desktop/hr_keluar.rs` ──

/** Baris hasil query menjadi objek berkunci kolom (tanpa indeks angka). */
const objek = (r: Row | undefined): Record<string, string> =>
  r
    ? Object.fromEntries(
        Object.keys(r)
          .filter((k) => Number.isNaN(Number(k)))
          .map((k) => [k, teks(r, k)]),
      )
    : {};

async function semua(client: Client, sql: string, args: string[] = []) {
  return (await client.execute({ sql, args })).rows;
}

const angka = (r: Row | undefined, kolom: string) => Number(r?.[kolom] ?? 0);

function denganStatusKeluar(r: Row, hari: string): KeluarBaris {
  return {
    ...(objek(r) as unknown as KeluarBaris),
    kartu_ditarik: angka(r, "kartu_ditarik") === 1,
    status: statusKeluar(
      teks(r, "tanggal_terakhir"),
      teks(r, "berlaku_pada") !== "",
      teks(r, "dibatalkan_pada") !== "",
      hari,
    ),
  };
}

async function alasanKeluar(client: Client): Promise<AlasanKeluar[]> {
  return (await semua(client, ALASAN_KELUAR_SQL)).map((r) => ({
    id_alasan: teks(r, "id_alasan"),
    nama: teks(r, "nama"),
    pengali_up: angka(r, "pengali_up"),
    pengali_upmk: angka(r, "pengali_upmk"),
    uph: angka(r, "uph") === 1,
    kompensasi_pkwt: angka(r, "kompensasi_pkwt") === 1,
    uang_pisah: angka(r, "uang_pisah") === 1,
    is_aktif: angka(r, "is_aktif") === 1,
    dasar_hukum: teks(r, "dasar_hukum"),
  }));
}

/** Cermin `daftar_keluar`. */
export async function daftarKeluar(client: Client): Promise<DaftarKeluar> {
  const hari = await hariIni(client);
  return {
    keluar: (await semua(client, DAFTAR_KELUAR_SQL)).map((r) =>
      denganStatusKeluar(r, hari),
    ),
    alasan: await alasanKeluar(client),
    hari_ini: hari,
  };
}

/** Cermin `checklist_keluar`; sisa cuti dari database yang sama. */
async function checklistKeluar(
  client: Client,
  id: string,
  tanggal: string,
): Promise<ChecklistKeluar> {
  const args = [id, tanggal];
  const kasbon = (await semua(client, KASBON_KELUAR_SQL, [id])).map((r) => ({
    id_pinjaman: teks(r, "id_pinjaman"),
    tanggal_cair: teks(r, "tanggal_cair"),
    pokok: angka(r, "pokok"),
    cicilan: angka(r, "cicilan"),
    sisa: angka(r, "sisa"),
  }));
  const jadwal = (await semua(client, JADWAL_AKTIF_KELUAR_SQL, args)).map(
    objek,
  );
  const wali = (await semua(client, WALI_KELUAR_SQL, args)).map(objek);
  return {
    blokir: jadwal.length + wali.length,
    jadwal,
    wali,
    tugas: (await semua(client, TUGAS_KELUAR_SQL, args)).map(objek),
    barang: (await semua(client, PINJAMAN_PERSONIL_SQL, [id])).map(objek),
    kasbon,
    sisa_kasbon: kasbon.reduce((n, k) => n + k.sisa, 0),
    sisa_cuti: await sisaCutiPada(client, id, tanggal),
    rapel: (await semua(client, RAPEL_KELUAR_SQL, [id])).map((r) => ({
      id_rapel: teks(r, "id_rapel"),
      period_start: teks(r, "period_start"),
      period_end: teks(r, "period_end"),
      jumlah: angka(r, "jumlah"),
    })),
    pengajuan: (await semua(client, PENGAJUAN_SESUDAH_SQL, args)).map(objek),
    jp_pengganti: (await semua(client, JP_PENGGANTI_SESUDAH_SQL, args)).map(
      objek,
    ),
    run_masa_terakhir: (await semua(client, RUN_MASA_TERAKHIR_SQL, args)).map(
      objek,
    ),
    alfa_sesudah: angka(
      (await semua(client, ALFA_SESUDAH_SQL, args))[0],
      "jumlah",
    ),
    akun: (await semua(client, AKUN_TERTAUT_SQL, [id])).map((r) => ({
      id: angka(r, "id"),
      username: teks(r, "username"),
      nama_operator: teks(r, "nama_operator"),
      status: teks(r, "status"),
      is_superadmin: angka(r, "is_superadmin") === 1,
    })),
  };
}

/** Status kini pada `tanggal` (`STATUS_KINI_SQL` dipakai utuh). */
async function statusKini(client: Client, id: string, tanggal: string) {
  const baris = (await semua(client, STATUS_KINI_SQL, [tanggal])).find(
    (r) => teks(r, "id_unik") === id,
  );
  return teks(baris, "status");
}

async function headerKeluar(client: Client, idKeluar: string): Promise<Row> {
  const r = await satu(client, KELUAR_SATU_SQL, [idKeluar.trim()]);
  if (!r) galat("Proses keluar tidak ditemukan.");
  return r;
}

/** Cermin `wewenang_keluar`: unit pegawai kini, dari sesi. */
async function wewenangKeluar(
  client: Client,
  operator: OperatorUser,
  idKaryawan: string,
) {
  const unit = teks(
    await satu(client, PEGAWAI_KELUAR_SQL, [idKaryawan]),
    "unit",
  );
  await wewenang(client, operator, idKaryawan, unit, "");
}

/** Cermin `rincian_keluar`: rincian proses atau pratinjau, dengan checklist. */
export async function rincianKeluar(
  client: Client,
  masukan: {
    id_keluar?: string;
    id_karyawan?: string;
    tanggal_terakhir?: string;
  },
): Promise<RincianKeluar> {
  const hari = await hariIni(client);
  let keluar: KeluarBaris | null = null;
  let id = (masukan.id_karyawan ?? "").trim();
  let tanggal = (masukan.tanggal_terakhir ?? "").trim();
  if ((masukan.id_keluar ?? "").trim() !== "") {
    keluar = denganStatusKeluar(
      await headerKeluar(client, masukan.id_keluar ?? ""),
      hari,
    );
    id = keluar.id_karyawan;
    tanggal = keluar.tanggal_terakhir;
  } else {
    if (!id) galat("Pegawai wajib dipilih.");
    if (!tanggalValid(tanggal)) galat("Hari terakhir bekerja tidak valid.");
  }
  const pegawai = await satu(client, PEGAWAI_KELUAR_SQL, [id]);
  if (!pegawai) galat(PESAN_PEGAWAI_BELUM_DI_CLOUD);
  return {
    keluar,
    pegawai: objek(pegawai) as unknown as RincianKeluar["pegawai"],
    status_kepegawaian: await statusKini(client, id, tanggal),
    checklist: await checklistKeluar(client, id, tanggal),
    alasan: await alasanKeluar(client),
    hari_ini: hari,
  };
}

/** Cermin `simpan_keluar`. `master_data` tidak berubah sebelum Berlakukan. */
export async function simpanKeluar(
  client: Client,
  operator: OperatorUser,
  draft: KeluarDraft,
) {
  const cek = validasiKeluar(draft);
  if (!cek.ok) galat(cek.galat);
  const sah = cek.nilai;
  const pegawai = await satu(client, PEGAWAI_KELUAR_SQL, [sah.id_karyawan]);
  if (!pegawai) galat(PESAN_PEGAWAI_BELUM_DI_CLOUD);
  await wewenang(client, operator, sah.id_karyawan, teks(pegawai, "unit"), "");
  if (sah.id_keluar) {
    const lama = await headerKeluar(client, sah.id_keluar);
    if (teks(lama, "id_karyawan") !== sah.id_karyawan)
      galat("Pegawai pada proses keluar tidak bisa diganti.");
    if (teks(lama, "dibatalkan_pada") !== "") galat(PESAN_KELUAR_DIBATALKAN);
    if (teks(lama, "berlaku_pada") !== "") galat(PESAN_KELUAR_BERLAKU);
  } else if (teks(pegawai, "status_aktif") !== "Aktif") {
    galat("Proses keluar hanya untuk pegawai aktif.");
  }
  const masuk = teks(pegawai, "tanggal_daftar");
  if (masuk !== "" && sah.tanggal_terakhir < masuk)
    galat("Hari terakhir bekerja tidak boleh sebelum tanggal masuk pegawai.");
  const alasan = await satu(client, ALASAN_SATU_SQL, [sah.id_alasan]);
  if (!alasan) galat("Alasan keluar tidak ditemukan.");
  if (angka(alasan, "is_aktif") !== 1) galat("Alasan keluar sudah nonaktif.");
  const id = sah.id_keluar ?? idBaru("klr-");
  const hasil = await client.execute({
    sql: sah.id_keluar ? UBAH_KELUAR_SQL : SIMPAN_KELUAR_SQL,
    args: [
      id,
      sah.id_karyawan,
      sah.id_alasan,
      teks(alasan, "nama"),
      sah.id_sp,
      await statusKini(client, sah.id_karyawan, sah.tanggal_terakhir),
      sah.tanggal_pemberitahuan,
      sah.tanggal_terakhir,
      sah.keterangan,
      masuk || null,
      sah.kartu_ditarik ? 1 : 0,
      sah.catatan_checklist,
      operator.username,
    ],
  });
  if (hasil.rowsAffected === 0)
    galat(sah.id_keluar ? PESAN_KELUAR_BERLAKU : PESAN_KELUAR_TERBUKA);
  return { sukses: true as const, id_keluar: id };
}

function periksaBlokir(c: ChecklistKeluar) {
  if (c.jadwal.length > 0) galat(PESAN_BLOKIR_JADWAL);
  if (c.wali.length > 0) galat(PESAN_BLOKIR_WALI);
}

/** Cermin `berlakukan_keluar`: satu batch cloud. */
export async function berlakukanKeluar(
  client: Client,
  operator: OperatorUser,
  idKeluar: string,
) {
  const hari = await hariIni(client);
  const header = await headerKeluar(client, idKeluar);
  const id = teks(header, "id_keluar");
  const idKaryawan = teks(header, "id_karyawan");
  const tanggal = teks(header, "tanggal_terakhir");
  await wewenangKeluar(client, operator, idKaryawan);
  const status = statusKeluar(
    tanggal,
    teks(header, "berlaku_pada") !== "",
    teks(header, "dibatalkan_pada") !== "",
    hari,
  );
  if (status === "Dijadwalkan") galat(PESAN_BELUM_JATUH_TEMPO);
  if (status === "Berlaku") galat(PESAN_KELUAR_BERLAKU);
  if (status === "Dibatalkan") galat(PESAN_KELUAR_DIBATALKAN);
  const potret = await checklistKeluar(client, idKaryawan, tanggal);
  periksaBlokir(potret);
  if (potret.akun.some((a) => a.id === operator.id)) galat(PESAN_DIRI_SENDIRI);
  const superTertaut = potret.akun.filter(
    (a) => a.is_superadmin && a.status === "Aktif",
  ).length;
  if (superTertaut > 0) {
    const total = angka(await satu(client, SUPERADMIN_AKTIF_SQL), "jumlah");
    if (total <= superTertaut) galat(PESAN_SUPERADMIN_TERAKHIR);
  }
  const args = [id, operator.username, JSON.stringify(potret), idKaryawan];
  await client.batch(
    BERLAKUKAN_SQL.map((sql) => ({ sql, args })),
    "write",
  );
  // Blokir yang muncul di antara pemeriksaan dan batch membuat statement
  // pertama tidak menyentuh apa pun; laporkan butirnya.
  const sesudah = await headerKeluar(client, id);
  if (teks(sesudah, "berlaku_pada") === "") {
    periksaBlokir(await checklistKeluar(client, idKaryawan, tanggal));
    galat(
      teks(sesudah, "dibatalkan_pada") === ""
        ? PESAN_BELUM_JATUH_TEMPO
        : PESAN_KELUAR_DIBATALKAN,
    );
  }
  return { sukses: true as const };
}

/** Cermin `batalkan_keluar`: alasan wajib, kapan saja. */
export async function batalkanKeluar(
  client: Client,
  operator: OperatorUser,
  idKeluar: string,
  alasan: string,
) {
  const isi = alasan.trim();
  if (!isi) galat("Alasan pembatalan wajib diisi.");
  if ([...isi].length > MAKS_TEKS_KELUAR)
    galat(`Alasan pembatalan maksimal ${MAKS_TEKS_KELUAR} karakter.`);
  const header = await headerKeluar(client, idKeluar);
  const id = teks(header, "id_keluar");
  await wewenangKeluar(client, operator, teks(header, "id_karyawan"));
  if (teks(header, "dibatalkan_pada") !== "") galat(PESAN_KELUAR_DIBATALKAN);
  await client.batch(
    [
      { sql: BATALKAN_SQL[0], args: [id] },
      { sql: BATALKAN_SQL[1], args: [id, operator.username, isi] },
    ],
    "write",
  );
  if (teks(await headerKeluar(client, id), "dibatalkan_pada") === "")
    galat(PESAN_KELUAR_DIBATALKAN);
  return { sukses: true as const };
}
