import "server-only";

import type { Client } from "@libsql/client";
import { hasPermission } from "@/lib/auth/access";
import type { OperatorUser } from "@/lib/auth/operator-user";
import type { PermissionKey } from "@/lib/rbac/catalog";
import { ApiRequestError } from "@/lib/server/http/api-response";
import { tanggalValid } from "@/lib/validations/hari-kerja";
import {
  dalamCakupan,
  samaOrang,
  UNIT_PERSONIL_SQL,
} from "@/lib/validations/hr-pengajuan";
import {
  AKUN_BAYAR_BAWAAN,
  AKUN_BAYAR_SQL,
  AMBIL_NOTA_SQL,
  BATAL_BAYAR_SQL,
  BATAS_TUTUP_SQL,
  BAYAR_BARIS_SQL,
  BAYAR_SQL,
  type BatalBayarDraft,
  type BayarDraft,
  BENTROK_JENIS_REIMBURSE_SQL,
  HAPUS_NOTA_SQL,
  type IsiNota,
  IZIN_LIHAT_REIMBURSE,
  JENIS_REIMBURSE_SQL,
  type JenisReimburse,
  type JenisReimburseDraft,
  JURNAL_BATAL_BAYAR_SQL,
  JURNAL_BAYAR_SQL,
  KEPUTUSAN_SQL,
  type KeadaanKeputusan,
  type KeputusanBaris,
  type KeputusanDraft,
  KLAIM_SQL,
  type KlaimBaris,
  type KlaimBulan,
  type KlaimDraft,
  type KlaimPegawai,
  type KlaimQuery,
  MAKS_ALASAN_REIMBURSE,
  NOTA_SQL,
  type NotaBaris,
  type NotaDraft,
  PEMBAYARAN_SQL,
  PEMILIK_NOTA_SQL,
  PESAN_AKUN_BAYAR,
  PESAN_BAYAR_SUDAH_BATAL,
  PESAN_BAYAR_TIDAK_ADA,
  PESAN_JENIS_GANDA,
  PESAN_KLAIM_BERUBAH,
  PESAN_KLAIM_DITOLAK_SIMPAN,
  PESAN_KLAIM_TIDAK_ADA,
  PESAN_NOTA_DITOLAK,
  PESAN_NOTA_PENUH,
  PESAN_NOTA_TERKUNCI,
  type PembayaranBaris,
  PUTUS_KLAIM_SQL,
  pemutusSah,
  periksaBatalBayar,
  periksaBayar,
  periksaKeputusan,
  type RincianKlaim,
  type SesiReimburse,
  SIMPAN_JENIS_REIMBURSE_SQL,
  SIMPAN_KLAIM_SQL,
  statusBayar,
  statusKlaim,
  TAMBAH_NOTA_SQL,
  tandaKlaim,
  validasiBayar,
  validasiJenis,
  validasiKlaim,
} from "@/lib/validations/hr-reimburse";
import { uraiBerkasDokumen } from "@/lib/validations/hris";
import { cekPeriodeTerbuka } from "@/lib/validations/tutup-buku";
import {
  ambil,
  angka,
  galat,
  hariIni,
  isian,
  satu,
  semua,
  teks,
  tulis,
} from "./hr-rekrutmen";

// Cermin I/O cloud `desktop/hr_reimburse.rs`. Tabelnya cloud-only, jadi Web
// dan Desktop menulis ke database yang sama tanpa outbox.

type Draft = Record<string, unknown>;
type Baris = Record<string, unknown>;

function idBaru(awalan: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return (
    awalan + [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")
  );
}

const punya = (operator: OperatorUser, izin: PermissionKey) =>
  hasPermission(operator, izin);
const lihatSemua = (operator: OperatorUser) =>
  IZIN_LIHAT_REIMBURSE.some((i) => punya(operator, i));
const tautan = (operator: OperatorUser) => (operator.idKaryawan ?? "").trim();

const angkaOpsional = (b: Baris, kunci: string) =>
  b[kunci] === null || b[kunci] === undefined ? null : angka(b, kunci);
const daftarKoma = (t: string) => t.split(",").filter((a) => a !== "");

function rapikanKlaim(b: Baris): Omit<KlaimBaris, "tanda"> {
  const { aksi, ...sisa } = b;
  return {
    ...sisa,
    status: statusKlaim(daftarKoma(String(aksi ?? ""))),
    status_bayar: statusBayar(angka(b, "jumlah_bayar")),
    nominal: angka(b, "nominal"),
    jumlah_nota: angka(b, "jumlah_nota"),
    jumlah_bayar: angka(b, "jumlah_bayar"),
    nominal_disetujui: angkaOpsional(b, "nominal_disetujui"),
    batas_bulanan: angkaOpsional(b, "batas_bulanan"),
    wajib_nota: angka(b, "wajib_nota") !== 0,
  } as unknown as Omit<KlaimBaris, "tanda">;
}

/** Rapikan semua baris lalu beri tanda atas himpunan yang sama. */
function rapikanSemua(daftar: Baris[]): KlaimBaris[] {
  const rapi = daftar.map(rapikanKlaim);
  const tanda = tandaKlaim(rapi);
  return rapi.map((k, i) => ({ ...k, tanda: tanda[i] ?? [] }));
}

async function klaimSatu(client: Client, id: string) {
  const baris = await satu(client, KLAIM_SQL, ["", "", id]);
  if (!baris) galat(PESAN_KLAIM_TIDAK_ADA);
  return rapikanKlaim(baris);
}

const klaimPegawai = async (client: Client, idKaryawan: string) =>
  rapikanSemua(await semua(client, KLAIM_SQL, ["", idKaryawan, ""]));

async function pembayaran(
  client: Client,
  idKaryawan: string,
  idBayar: string,
): Promise<PembayaranBaris[]> {
  return (await semua(client, PEMBAYARAN_SQL, [idKaryawan, idBayar])).map(
    (b) =>
      ({
        ...b,
        total: angka(b, "total"),
        dibatalkan: angka(b, "dibatalkan") !== 0,
        klaim: daftarKoma(teks(b, "klaim")),
      }) as unknown as PembayaranBaris,
  );
}

async function unitSesi(client: Client, operator: OperatorUser) {
  const id = tautan(operator);
  if (!id) return "";
  return teks(await satu(client, UNIT_PERSONIL_SQL, [id]), "unit");
}

const bulanValid = (bulan: string) =>
  [...bulan].length === 7 && tanggalValid(`${bulan}-01`);

/** Cermin `jenis_reimburse`. */
export async function jenisReimburse(
  client: Client,
): Promise<{ jenis: JenisReimburse[] }> {
  const jenis = (await semua(client, JENIS_REIMBURSE_SQL)).map(
    (j) =>
      ({
        ...j,
        wajib_nota: angka(j, "wajib_nota") !== 0,
        is_aktif: angka(j, "is_aktif") !== 0,
        batas_bulanan: angkaOpsional(j, "batas_bulanan"),
      }) as unknown as JenisReimburse,
  );
  return { jenis };
}

/** Cermin `simpan_jenis`. */
export async function simpanJenis(
  client: Client,
  oleh: string,
  draft: JenisReimburseDraft,
) {
  const sah = ambil(validasiJenis(draft as Draft));
  const id = sah.id_jenis ?? idBaru("rmj-");
  if (
    sah.is_aktif &&
    (await satu(client, BENTROK_JENIS_REIMBURSE_SQL, [sah.nama, id]))
  )
    galat(PESAN_JENIS_GANDA);
  await tulis(client, SIMPAN_JENIS_REIMBURSE_SQL, [
    id,
    sah.nama,
    sah.wajib_nota ? 1 : 0,
    sah.batas_bulanan,
    sah.is_aktif ? 1 : 0,
    oleh,
  ]);
  return { sukses: true, id_jenis: id };
}

/** Cermin `daftar_klaim`: mode `bulan`, `pegawai`, `rincian`. */
export async function daftarKlaim(
  client: Client,
  operator: OperatorUser,
  query: KlaimQuery,
): Promise<KlaimBulan | KlaimPegawai | RincianKlaim> {
  const q = query as Draft;
  const hari = await hariIni(client);
  const lihat = lihatSemua(operator);
  const sesi: SesiReimburse = {
    id_karyawan: tautan(operator),
    unit: await unitSesi(client, operator),
    lingkup_semua: punya(operator, "hr.scope.all"),
    lihat_semua: lihat,
  };
  const milik = (k: KlaimBaris) =>
    lihat || samaOrang(k.diajukan_oleh, operator.username);
  const mode = isian(q, "mode") ?? "bulan";
  if (mode === "bulan") {
    const bulan = isian(q, "bulan") ?? hari.slice(0, 7);
    if (!bulanValid(bulan)) galat("Bulan tidak valid.");
    const klaim = rapikanSemua(
      await semua(client, KLAIM_SQL, [bulan, "", ""]),
    ).filter(milik);
    return { hari_ini: hari, bulan, sesi, klaim };
  }
  if (mode === "pegawai") {
    const id = isian(q, "id_karyawan") ?? galat("Pegawai wajib dipilih.");
    const klaim = (await klaimPegawai(client, id)).filter(milik);
    const bayar = lihat ? await pembayaran(client, id, "") : [];
    return { hari_ini: hari, sesi, klaim, bayar };
  }
  if (mode !== "rincian") galat("Mode reimbursement tidak dikenal.");
  const id = isian(q, "id_klaim") ?? galat(PESAN_KLAIM_TIDAK_ADA);
  const pegawai = teks((await klaimSatu(client, id)) as Baris, "id_karyawan");
  const klaim = (await klaimPegawai(client, pegawai)).find(
    (k) => k.id_klaim === id,
  );
  if (!klaim || !milik(klaim)) galat(PESAN_KLAIM_TIDAK_ADA);
  const keputusan = (await semua(client, KEPUTUSAN_SQL, [id])).map(
    (k) =>
      ({
        ...k,
        nominal_disetujui: angkaOpsional(k, "nominal_disetujui"),
      }) as unknown as KeputusanBaris,
  );
  const nota = (await semua(client, NOTA_SQL, [id])) as unknown as NotaBaris[];
  const bayar = lihat
    ? (await pembayaran(client, pegawai, "")).filter((b) =>
        b.klaim.includes(id),
      )
    : [];
  return { hari_ini: hari, sesi, klaim, keputusan, nota, bayar };
}

/** Cermin `simpan_klaim`. Klaim tidak pernah diubah (Q-162). */
export async function simpanKlaim(
  client: Client,
  oleh: string,
  draft: KlaimDraft,
) {
  const sah = ambil(validasiKlaim(draft as Draft, await hariIni(client)));
  const id = idBaru("rmb-");
  const n = await tulis(client, SIMPAN_KLAIM_SQL, [
    id,
    sah.id_karyawan,
    sah.id_jenis,
    sah.tanggal,
    sah.nominal,
    sah.keperluan,
    oleh,
  ]);
  if (n === 0) galat(PESAN_KLAIM_DITOLAK_SIMPAN);
  return { sukses: true, id_klaim: id };
}

/** Cermin `putus_klaim`: wewenang dan cakupan dari SESI. */
export async function putusKlaim(
  client: Client,
  operator: OperatorUser,
  draft: KeputusanDraft,
) {
  const id = isian(draft as Draft, "id_klaim") ?? galat(PESAN_KLAIM_TIDAK_ADA);
  const klaim = await klaimSatu(client, id);
  const sesi = tautan(operator);
  const keadaan: KeadaanKeputusan = {
    status: klaim.status,
    dibayar: klaim.jumlah_bayar > 0,
    nominal: klaim.nominal,
    boleh_putus: punya(operator, "hr.reimburse.decide"),
    sendiri: sesi !== "" && sesi === klaim.id_karyawan,
    dalam_cakupan: dalamCakupan(
      punya(operator, "hr.scope.all"),
      await unitSesi(client, operator),
      klaim.unit,
    ),
    pengaju_sendiri: samaOrang(klaim.diajukan_oleh, operator.username),
  };
  const sah = ambil(periksaKeputusan(draft as Draft, keadaan));
  const idKeputusan = idBaru("rmk-");
  const n = await tulis(client, PUTUS_KLAIM_SQL, [
    idKeputusan,
    id,
    sah.aksi,
    sah.nominal_disetujui,
    sah.alasan,
    operator.username,
    pemutusSah(keadaan) ? 0 : 1,
  ]);
  if (n === 0) galat(PESAN_KLAIM_BERUBAH);
  const { status } = await klaimSatu(client, id);
  return { sukses: true, id_keputusan: idKeputusan, status };
}

/** Cermin `simpan_nota`: hanya pengaju (atau Superadmin), selama Menunggu. */
export async function simpanNota(
  client: Client,
  operator: OperatorUser,
  draft: NotaDraft,
) {
  const d = draft as Draft;
  const boleh = (pengaju: string) =>
    operator.isSuperadmin || samaOrang(pengaju, operator.username);
  const aksi = isian(d, "aksi") ?? "tambah";
  if (aksi === "tambah") {
    const idKlaim = isian(d, "id_klaim") ?? galat(PESAN_KLAIM_TIDAK_ADA);
    const klaim = await klaimSatu(client, idKlaim);
    if (!boleh(klaim.diajukan_oleh)) galat(PESAN_NOTA_DITOLAK);
    const berkas = ambil(
      uraiBerkasDokumen(
        String(d.nama_berkas ?? ""),
        String(d.mime_type ?? ""),
        String(d.data_base64 ?? ""),
      ),
    );
    const id = idBaru("rmf-");
    const n = await tulis(client, TAMBAH_NOTA_SQL, [
      id,
      idKlaim,
      berkas.nama_berkas,
      berkas.mime_type,
      berkas.data_base64,
      operator.username,
    ]);
    if (n === 0) {
      const terkunci = (await klaimSatu(client, idKlaim)).status !== "Menunggu";
      galat(terkunci ? PESAN_NOTA_TERKUNCI : PESAN_NOTA_PENUH);
    }
    return { sukses: true, id_berkas: id };
  }
  if (aksi !== "hapus") galat("Aksi nota tidak dikenal.");
  const id = isian(d, "id_berkas") ?? galat("Berkas tidak ditemukan.");
  const pemilik = await satu(client, PEMILIK_NOTA_SQL, [id]);
  if (!pemilik) throw new ApiRequestError("Berkas tidak ditemukan.", 404);
  if (!boleh(teks(pemilik, "diajukan_oleh"))) galat(PESAN_NOTA_DITOLAK);
  if ((await tulis(client, HAPUS_NOTA_SQL, [id])) === 0)
    galat(PESAN_NOTA_TERKUNCI);
  return { sukses: true };
}

/** Cermin `ambil_nota`. */
export async function ambilNota(
  client: Client,
  operator: OperatorUser,
  idBerkas: string,
): Promise<IsiNota> {
  const b = await satu(client, AMBIL_NOTA_SQL, [idBerkas.trim()]);
  if (
    !b ||
    !(
      lihatSemua(operator) ||
      samaOrang(teks(b, "diajukan_oleh"), operator.username)
    )
  )
    throw new ApiRequestError("Berkas tidak ditemukan.", 404);
  return b as unknown as IsiNota;
}

/** Cermin `bayar_klaim`: total dari nominal disetujui, dijaga di transaksi. */
export async function bayarKlaim(
  client: Client,
  oleh: string,
  draft: BayarDraft,
) {
  const sah = ambil(validasiBayar(draft as Draft, await hariIni(client)));
  const total = ambil(
    periksaBayar(
      sah.id_karyawan,
      sah.id_klaim,
      await klaimPegawai(client, sah.id_karyawan),
    ),
  );
  // Jurnal otomatis (v75): akun bayar dan periode diperiksa SEBELUM batch,
  // cermin `bayar_klaim`.
  const akunBayar =
    (typeof draft.id_akun_bayar === "string"
      ? draft.id_akun_bayar.trim()
      : "") || AKUN_BAYAR_BAWAAN;
  if (!(await satu(client, AKUN_BAYAR_SQL, [akunBayar])))
    galat(PESAN_AKUN_BAYAR);
  const batas = teks((await satu(client, BATAS_TUTUP_SQL)) ?? {}, "batas");
  const periode = cekPeriodeTerbuka(sah.tanggal, batas || null);
  if (!periode.ok) galat(periode.error);
  const id = idBaru("rbb-");
  const daftar = JSON.stringify(sah.id_klaim);
  await client.batch(
    [
      {
        sql: BAYAR_SQL,
        args: [
          id,
          sah.id_karyawan,
          sah.tanggal,
          total,
          sah.keterangan,
          oleh,
          daftar,
        ],
      },
      { sql: BAYAR_BARIS_SQL, args: [id, daftar] },
      { sql: JURNAL_BAYAR_SQL[0], args: [id, oleh] },
      { sql: JURNAL_BAYAR_SQL[1], args: [id] },
      { sql: JURNAL_BAYAR_SQL[2], args: [id, akunBayar] },
    ],
    "write",
  );
  if ((await pembayaran(client, "", id)).length === 0)
    galat(PESAN_KLAIM_BERUBAH);
  return { sukses: true, id_bayar: id, total };
}

/** Cermin `batal_bayar`. */
export async function batalBayar(
  client: Client,
  oleh: string,
  draft: BatalBayarDraft,
) {
  const d = draft as Draft;
  const id = isian(d, "id_bayar") ?? galat(PESAN_BAYAR_TIDAK_ADA);
  const alasan = isian(d, "alasan");
  if (alasan && [...alasan].length > MAKS_ALASAN_REIMBURSE)
    galat(`Alasan pembatalan maksimal ${MAKS_ALASAN_REIMBURSE} karakter.`);
  const [bayar] = await pembayaran(client, "", id);
  if (!bayar) galat(PESAN_BAYAR_TIDAK_ADA);
  ambil(periksaBatalBayar(bayar.jenis, bayar.dibatalkan, alasan));
  // Pembalik jurnal di batch yang sama; dijaga baris `batal-<id>` (v75).
  const hari = await hariIni(client);
  const [hasil] = await client.batch(
    [
      { sql: BATAL_BAYAR_SQL, args: [id, hari, alasan, oleh] },
      { sql: JURNAL_BATAL_BAYAR_SQL[0], args: [id, hari, oleh] },
      { sql: JURNAL_BATAL_BAYAR_SQL[1], args: [id] },
    ],
    "write",
  );
  if (hasil.rowsAffected === 0) galat(PESAN_BAYAR_SUDAH_BATAL);
  return { sukses: true, id_bayar: `batal-${id}` };
}
