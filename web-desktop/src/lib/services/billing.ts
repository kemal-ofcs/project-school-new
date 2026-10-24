import "server-only";

import { randomBytes } from "node:crypto";
import type { Client, InStatement, Transaction } from "@libsql/client";
import {
  isValidOperatorPhone,
  normalizeOperatorPhone,
} from "@/lib/operators/contact";
import {
  assertAkunBayar,
  balikJurnalTx,
  nomorUrutBerikutnya,
  statementJurnal,
  tulisJurnalTx,
} from "@/lib/services/accounting";
import { kopSekolah } from "@/lib/services/inventory";
import { assertPeriodeTerbuka } from "@/lib/services/tutup-buku";
import { generateWaNotificationId } from "@/lib/services/wa-notification";
import { formatRupiah, isValidDate } from "@/lib/validations/accounting";
import {
  AKUN_PIUTANG_SISWA,
  alokasiPembayaran,
  type BarisPenerimaan,
  type BarisRekapRombel,
  barisJurnalPembayaran,
  bulanRentang,
  formatNomorKuitansi,
  hitungPotongan,
  idAlokasi,
  idJurnalPembayaran,
  idJurnalTagihan,
  idTagihan,
  isianPengingat,
  jenisTagihanDraftSchema,
  type KeringananBerlaku,
  keringananBerlaku,
  keringananDraftSchema,
  klausaJatuhTempo,
  kunciUnit,
  MAKS_ALASAN_BATAL_TAGIHAN,
  MAKS_NAMA_PERANGKAT,
  MAKS_SISWA_PENGINGAT,
  PESAN_PENGINGAT_MATI,
  type PembayaranValid,
  PORTAL_WALI_TAGIHAN_KEY,
  pembayaranDraftSchema,
  pilihTarif,
  SERI_KUITANSI_WEB,
  susunPenerimaan,
  susunRekapRombel,
  type TagihanPengingat,
  type TagihanTerbuka,
  type TarifBerlaku,
  tarifDraftSchema,
  validateJenisTagihan,
  validateKeringanan,
  validatePembayaran,
  validatePeriodeTagihan,
  validateSeri,
  validateTarif,
} from "@/lib/validations/billing";
import {
  clampPengingatHariLewat,
  clampPengingatHariSebelum,
  composeWaMessage,
  DEFAULT_PENGINGAT_HARI_LEWAT,
  DEFAULT_PENGINGAT_HARI_SEBELUM,
  PENGINGAT_HARI_LEWAT_KEY,
  PENGINGAT_HARI_SEBELUM_KEY,
  PENGINGAT_OTOMATIS_KEY,
  PENGINGAT_TERAKHIR_KEY,
  pengingatHariIni,
  settingEnabled,
  WA_NOTIFY_TAGIHAN_KEY,
  waTemplateKey,
} from "@/lib/validations/wa-notification";
import type {
  AkunSiswaTagihan,
  DaftarTagihan,
  DetailKuitansi,
  HasilBayar,
  HasilPengingat,
  HasilPengingatOtomatis,
  KeringananItem,
  KuitansiItem,
  MasterTagihan,
  PratinjauTagihan,
  RekapPenerimaan,
  RekapRombel,
  SeriKuitansi,
  SiswaTagihan,
  TagihanItem,
  TinjauanPembayaran,
} from "@/types/billing";

/**
 * Sisi Web tagihan siswa, cermin `desktop/billing.rs`. Pesan galat wajib sama
 * dengan Rust.
 */

type Executor = Client | Transaction;

function newId(prefix: string): string {
  return `${prefix}${randomBytes(16).toString("hex")}`;
}

function text(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

async function withTransaction<T>(
  client: Client,
  work: (tx: Transaction) => Promise<T>,
): Promise<T> {
  const tx = await client.transaction("write");
  try {
    const result = await work(tx);
    await tx.commit();
    return result;
  } catch (error) {
    await tx.rollback();
    throw error;
  } finally {
    tx.close();
  }
}

async function hariIni(tx: Executor): Promise<string> {
  const result = await tx.execute("SELECT date('now', '+7 hours') AS hari;");
  return String(result.rows[0]?.hari ?? "");
}

/** Cermin `DIBAYAR_SQL`: alokasi kuitansi yang tidak dibatalkan per tagihan. */
const DIBAYAR_SQL = `SELECT a.id_tagihan, SUM(a.nominal) AS dibayar
     FROM keu_pembayaran_alokasi a
     JOIN keu_pembayaran p ON p.id_pembayaran = a.id_pembayaran
     LEFT JOIN keu_pembayaran_batal pb ON pb.id_pembayaran = p.id_pembayaran
     WHERE a.id_tagihan IS NOT NULL AND pb.id_pembayaran IS NULL
     GROUP BY a.id_tagihan
     -- batas: subquery yang di-JOIN ke tagihan, dibatasi kueri luarnya
     `;

/** Cermin `SALDO_TITIPAN_SQL`. */
const SALDO_TITIPAN_SQL = `SELECT COALESCE(SUM(CASE
            WHEN p.metode = 'Titipan' THEN -a.nominal
            WHEN a.id_tagihan IS NULL THEN a.nominal
            ELSE 0 END), 0) AS saldo
     FROM keu_pembayaran p
     JOIN keu_pembayaran_alokasi a ON a.id_pembayaran = p.id_pembayaran
     LEFT JOIN keu_pembayaran_batal pb ON pb.id_pembayaran = p.id_pembayaran
     WHERE p.id_siswa = ? AND pb.id_pembayaran IS NULL
     -- batas: agregat, selalu satu baris
     ;`;

// ── Master ──────────────────────────────────────────────────────────────────

export async function master(client: Client): Promise<MasterTagihan> {
  const [jenis, tarif, unit, rombel, tahun, portal] = await client.batch(
    [
      `SELECT id_jenis_tagihan, nama, periodik, nominal_bawaan, id_akun_pendapatan, is_aktif
       FROM keu_jenis_tagihan ORDER BY nama, id_jenis_tagihan LIMIT 500;`,
      `SELECT id_tarif, id_jenis_tagihan, nama_unit, tingkat, nominal
       FROM keu_tarif_tagihan ORDER BY id_jenis_tagihan, nama_unit, tingkat LIMIT 2000;`,
      `SELECT nama_unit AS nama FROM akademik_unit WHERE status_aktif = 1
       UNION SELECT DISTINCT unit FROM master_data WHERE TRIM(COALESCE(unit, '')) <> ''
       ORDER BY 1 LIMIT 200;`,
      `SELECT id_rombel, nama_rombel, tingkat FROM akademik_rombel WHERE is_aktif = 1
       ORDER BY tingkat, nama_rombel LIMIT 500;`,
      "SELECT nama_tahun FROM akademik_tahun_ajaran ORDER BY nama_tahun DESC LIMIT 50;",
      {
        sql: "SELECT value FROM setting_gex_system WHERE key = ? LIMIT 1;",
        args: [PORTAL_WALI_TAGIHAN_KEY],
      },
    ],
    "read",
  );
  return {
    jenis: jenis.rows.map((row) => ({
      id_jenis_tagihan: String(row.id_jenis_tagihan),
      nama: String(row.nama),
      periodik: String(
        row.periodik,
      ) as MasterTagihan["jenis"][number]["periodik"],
      nominal_bawaan: Number(row.nominal_bawaan),
      id_akun_pendapatan: String(row.id_akun_pendapatan),
      is_aktif: Number(row.is_aktif),
    })),
    tarif: tarif.rows.map((row) => ({
      id_tarif: String(row.id_tarif),
      id_jenis_tagihan: String(row.id_jenis_tagihan),
      nama_unit: String(row.nama_unit ?? ""),
      tingkat: row.tingkat === null ? null : Number(row.tingkat),
      nominal: Number(row.nominal),
    })),
    unit: unit.rows.map((row) => String(row.nama)),
    rombel: rombel.rows.map((row) => ({
      id_rombel: String(row.id_rombel),
      nama_rombel: String(row.nama_rombel),
      tingkat: Number(row.tingkat),
    })),
    tahun_ajaran: tahun.rows.map((row) => String(row.nama_tahun)),
    portal_wali_tagihan: settingEnabled(text(portal.rows[0]?.value)),
  };
}

/** Cermin `save_portal`: buka atau tutup halaman Tagihan di portal wali. */
export async function savePortal(
  client: Client,
  aktif: boolean,
): Promise<{ sukses: true; portal_wali_tagihan: boolean }> {
  await client.execute({
    sql: `INSERT INTO setting_gex_system (key, value) VALUES (?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
    args: [PORTAL_WALI_TAGIHAN_KEY, aktif ? "true" : "false"],
  });
  return { sukses: true, portal_wali_tagihan: aktif };
}

export async function saveJenis(
  client: Client,
  rawDraft: unknown,
): Promise<{ sukses: true; id_jenis_tagihan: string }> {
  const parsed = jenisTagihanDraftSchema.safeParse(rawDraft);
  if (!parsed.success) throw new Error("Data jenis tagihan tidak valid.");
  const hasil = validateJenisTagihan(parsed.data);
  if (!hasil.ok) throw new Error(hasil.error);
  const valid = hasil.value;
  return withTransaction(client, async (tx) => {
    const akun = await tx.execute({
      sql: "SELECT EXISTS(SELECT 1 FROM keu_akun WHERE id_akun = ? AND kelompok = 'Pendapatan' AND is_aktif = 1) AS sah;",
      args: [valid.id_akun_pendapatan],
    });
    if (Number(akun.rows[0]?.sah) !== 1) {
      throw new Error("Akun pendapatan harus akun Pendapatan yang aktif.");
    }
    const id = parsed.data.id_jenis_tagihan?.trim() || newId("jt-");
    // Cermin `save_jenis`: id tagihan memuat periodenya, jadi cara penagihan
    // yang berubah membuat penerbitan berikutnya menagih ulang siswa yang sama.
    const lama = await tx.execute({
      sql: "SELECT periodik FROM keu_jenis_tagihan WHERE id_jenis_tagihan = ?;",
      args: [id],
    });
    if (lama.rows[0] && String(lama.rows[0].periodik) !== valid.periodik) {
      throw new Error("Cara penagihan tidak bisa diubah setelah jenis dibuat.");
    }
    const nama = await tx.execute({
      sql: "SELECT EXISTS(SELECT 1 FROM keu_jenis_tagihan WHERE LOWER(nama) = LOWER(?) AND id_jenis_tagihan <> ?) AS ada;",
      args: [valid.nama, id],
    });
    if (Number(nama.rows[0]?.ada) === 1) {
      throw new Error("Nama tagihan sudah dipakai jenis lain.");
    }
    await tx.execute({
      sql: `INSERT INTO keu_jenis_tagihan (
              id_jenis_tagihan, nama, periodik, nominal_bawaan, id_akun_pendapatan, is_aktif,
              created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
            ON CONFLICT(id_jenis_tagihan) DO UPDATE SET
              nama = excluded.nama,
              periodik = excluded.periodik,
              nominal_bawaan = excluded.nominal_bawaan,
              id_akun_pendapatan = excluded.id_akun_pendapatan,
              is_aktif = excluded.is_aktif,
              updated_at = excluded.updated_at;`,
      args: [
        id,
        valid.nama,
        valid.periodik,
        valid.nominal_bawaan,
        valid.id_akun_pendapatan,
        valid.is_aktif ? 1 : 0,
      ],
    });
    return { sukses: true as const, id_jenis_tagihan: id };
  });
}

export async function saveTarif(
  client: Client,
  rawDraft: unknown,
): Promise<{ sukses: true; id_tarif: string }> {
  const parsed = tarifDraftSchema.safeParse(rawDraft);
  if (!parsed.success) throw new Error("Data tarif tidak valid.");
  const hasil = validateTarif(parsed.data);
  if (!hasil.ok) throw new Error(hasil.error);
  const valid = hasil.value;
  return withTransaction(client, async (tx) => {
    const id = parsed.data.id_tarif?.trim() || newId("trf-");
    const lain = await tx.execute({
      sql: `SELECT nama_unit, tingkat FROM keu_tarif_tagihan
            WHERE id_jenis_tagihan = ? AND id_tarif <> ? LIMIT 2000;`,
      args: [valid.id_jenis_tagihan, id],
    });
    const kembar = lain.rows.some(
      (row) =>
        kunciUnit(text(row.nama_unit)) === kunciUnit(valid.nama_unit) &&
        (row.tingkat === null ? null : Number(row.tingkat)) === valid.tingkat,
    );
    if (kembar) throw new Error("Tarif untuk unit dan tingkat ini sudah ada.");
    await tx.execute({
      sql: `INSERT INTO keu_tarif_tagihan (
              id_tarif, id_jenis_tagihan, nama_unit, tingkat, nominal, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
            ON CONFLICT(id_tarif) DO UPDATE SET
              id_jenis_tagihan = excluded.id_jenis_tagihan,
              nama_unit = excluded.nama_unit,
              tingkat = excluded.tingkat,
              nominal = excluded.nominal,
              updated_at = excluded.updated_at;`,
      args: [
        id,
        valid.id_jenis_tagihan,
        valid.nama_unit,
        valid.tingkat,
        valid.nominal,
      ],
    });
    return { sukses: true as const, id_tarif: id };
  });
}

export async function deleteTarif(
  client: Client,
  idTarif: string,
): Promise<{ sukses: true }> {
  await client.execute({
    sql: "DELETE FROM keu_tarif_tagihan WHERE id_tarif = ?;",
    args: [idTarif],
  });
  return { sukses: true as const };
}

export async function discounts(
  client: Client,
): Promise<{ items: KeringananItem[] }> {
  const result = await client.execute(
    `SELECT k.id_keringanan, k.id_siswa, COALESCE(s.nama_lengkap, k.id_siswa) AS nama_siswa,
            k.id_jenis_tagihan, COALESCE(j.nama, k.id_jenis_tagihan) AS nama_tagihan,
            k.jenis, k.nilai, k.periode_mulai, k.periode_selesai, k.alasan, k.is_aktif
     FROM keu_keringanan k
     LEFT JOIN siswa_data s ON s.id_siswa = k.id_siswa
     LEFT JOIN keu_jenis_tagihan j ON j.id_jenis_tagihan = k.id_jenis_tagihan
     ORDER BY k.is_aktif DESC, nama_siswa, k.id_keringanan
     LIMIT 2000;`,
  );
  return {
    items: result.rows.map((row) => ({
      id_keringanan: String(row.id_keringanan),
      id_siswa: String(row.id_siswa),
      nama_siswa: String(row.nama_siswa),
      id_jenis_tagihan: String(row.id_jenis_tagihan),
      nama_tagihan: String(row.nama_tagihan),
      jenis: String(row.jenis) as KeringananItem["jenis"],
      nilai: Number(row.nilai),
      periode_mulai: text(row.periode_mulai),
      periode_selesai: text(row.periode_selesai),
      alasan: text(row.alasan),
      is_aktif: Number(row.is_aktif),
    })),
  };
}

export async function saveKeringanan(
  client: Client,
  operator: string,
  rawDraft: unknown,
): Promise<{ sukses: true; id_keringanan: string }> {
  const parsed = keringananDraftSchema.safeParse(rawDraft);
  if (!parsed.success) throw new Error("Data keringanan tidak valid.");
  const hasil = validateKeringanan(parsed.data);
  if (!hasil.ok) throw new Error(hasil.error);
  const valid = hasil.value;
  return withTransaction(client, async (tx) => {
    const siswa = await tx.execute({
      sql: "SELECT EXISTS(SELECT 1 FROM siswa_data WHERE id_siswa = ?) AS ada;",
      args: [valid.id_siswa],
    });
    if (Number(siswa.rows[0]?.ada) !== 1)
      throw new Error("Siswa tidak ditemukan.");
    const id = parsed.data.id_keringanan?.trim() || newId("krg-");
    await tx.execute({
      sql: `INSERT INTO keu_keringanan (
              id_keringanan, id_siswa, id_jenis_tagihan, jenis, nilai, periode_mulai,
              periode_selesai, alasan, is_aktif, dibuat_oleh, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
            ON CONFLICT(id_keringanan) DO UPDATE SET
              id_siswa = excluded.id_siswa,
              id_jenis_tagihan = excluded.id_jenis_tagihan,
              jenis = excluded.jenis,
              nilai = excluded.nilai,
              periode_mulai = excluded.periode_mulai,
              periode_selesai = excluded.periode_selesai,
              alasan = excluded.alasan,
              is_aktif = excluded.is_aktif,
              updated_at = excluded.updated_at;`,
      args: [
        id,
        valid.id_siswa,
        valid.id_jenis_tagihan,
        valid.jenis,
        valid.nilai,
        valid.periode_mulai,
        valid.periode_selesai,
        valid.alasan,
        valid.is_aktif ? 1 : 0,
        operator,
      ],
    });
    return { sukses: true as const, id_keringanan: id };
  });
}

export async function students(
  client: Client,
): Promise<{ items: SiswaTagihan[] }> {
  const result = await client.execute(
    `SELECT s.id_siswa, s.nama_lengkap, COALESCE(s.nis, '') AS nis,
            COALESCE(r.nama_rombel, '') AS kelas
     FROM siswa_data s
     LEFT JOIN akademik_rombel r ON r.id_rombel = s.id_rombel
     WHERE s.status = 'Aktif'
     ORDER BY s.nama_lengkap, s.id_siswa
     LIMIT 3000;`,
  );
  return {
    items: result.rows.map((row) => ({
      id_siswa: String(row.id_siswa),
      nama_lengkap: String(row.nama_lengkap),
      nis: String(row.nis),
      kelas: String(row.kelas),
    })),
  };
}

// ── Penerbitan ──────────────────────────────────────────────────────────────

interface Jenis {
  id: string;
  nama: string;
  periodik: string;
  nominal_bawaan: number;
  id_akun_pendapatan: string;
}

interface Calon {
  id_siswa: string;
  nama: string;
  kelas: string;
  nominal: number;
  potongan: number;
  sudah_ada: boolean;
}

/** Cermin `susun_calon`: pratinjau dan penerbitan memakai hitungan yang sama. */
async function susunCalon(
  tx: Executor,
  idJenis: string,
  periodeMentah: string,
  unit: string | null,
  idRombel: string | null,
): Promise<{ jenis: Jenis; periode: string; calon: Calon[] }> {
  const jenisRes = await tx.execute({
    sql: `SELECT id_jenis_tagihan, nama, periodik, nominal_bawaan, id_akun_pendapatan, is_aktif
          FROM keu_jenis_tagihan WHERE id_jenis_tagihan = ?;`,
    args: [idJenis],
  });
  const row = jenisRes.rows[0];
  if (!row) throw new Error("Jenis tagihan tidak ditemukan.");
  if (Number(row.is_aktif) !== 1)
    throw new Error("Jenis tagihan ini nonaktif.");
  const jenis: Jenis = {
    id: String(row.id_jenis_tagihan),
    nama: String(row.nama),
    periodik: String(row.periodik),
    nominal_bawaan: Number(row.nominal_bawaan),
    id_akun_pendapatan: String(row.id_akun_pendapatan),
  };
  const cekPeriode = validatePeriodeTagihan(jenis.periodik, periodeMentah);
  if (!cekPeriode.ok) throw new Error(cekPeriode.error);
  const periode = cekPeriode.value;

  // Berurutan, bukan `Promise.all`: fungsi ini juga dipanggil di dalam
  // transaksi interaktif libSQL, yang menuntut statement satu per satu.
  const tarifRes = await tx.execute({
    sql: "SELECT nama_unit, tingkat, nominal FROM keu_tarif_tagihan WHERE id_jenis_tagihan = ? LIMIT 2000;",
    args: [jenis.id],
  });
  const keringananRes = await tx.execute({
    sql: `SELECT id_siswa, jenis, nilai, periode_mulai, periode_selesai FROM keu_keringanan
          WHERE id_jenis_tagihan = ? AND is_aktif = 1 LIMIT 5000;`,
    args: [jenis.id],
  });
  const sudahRes = await tx.execute({
    sql: "SELECT id_siswa FROM keu_tagihan WHERE id_jenis_tagihan = ? AND periode = ? LIMIT 5000;",
    args: [jenis.id, periode],
  });
  const siswaRes = await tx.execute(
    `SELECT s.id_siswa, s.nama_lengkap, s.id_rombel, COALESCE(r.nama_rombel, '') AS kelas,
            r.tingkat, COALESCE(m.unit, '') AS unit
     FROM siswa_data s
     LEFT JOIN akademik_rombel r ON r.id_rombel = s.id_rombel
     LEFT JOIN master_data m ON m.id_unik = s.id_siswa
     WHERE s.status = 'Aktif'
     ORDER BY r.tingkat, r.nama_rombel, s.nama_lengkap, s.id_siswa
     LIMIT 3000;`,
  );
  const tarif: TarifBerlaku[] = tarifRes.rows.map((item) => ({
    nama_unit: String(item.nama_unit ?? ""),
    tingkat: item.tingkat === null ? null : Number(item.tingkat),
    nominal: Number(item.nominal),
  }));
  const keringanan = new Map<string, KeringananBerlaku[]>();
  for (const item of keringananRes.rows) {
    const k: KeringananBerlaku = {
      jenis: String(item.jenis),
      nilai: Number(item.nilai),
      periode_mulai: text(item.periode_mulai),
      periode_selesai: text(item.periode_selesai),
    };
    if (!keringananBerlaku(k, jenis.periodik, periode)) continue;
    const id = String(item.id_siswa);
    keringanan.set(id, [...(keringanan.get(id) ?? []), k]);
  }
  const sudah = new Set(sudahRes.rows.map((item) => String(item.id_siswa)));
  const kunci = kunciUnit(unit);
  const rombel = idRombel?.trim() || null;
  const calon = siswaRes.rows
    .filter(
      (item) =>
        (!kunci || kunciUnit(text(item.unit)) === kunci) &&
        (!rombel || String(item.id_rombel) === rombel),
    )
    .map((item) => {
      const idSiswa = String(item.id_siswa);
      const nominal = pilihTarif(
        tarif,
        jenis.nominal_bawaan,
        text(item.unit),
        item.tingkat === null ? null : Number(item.tingkat),
      );
      return {
        id_siswa: idSiswa,
        nama: String(item.nama_lengkap),
        kelas: String(item.kelas),
        nominal,
        potongan: hitungPotongan(nominal, keringanan.get(idSiswa) ?? []),
        sudah_ada: sudah.has(idSiswa),
      };
    });
  return { jenis, periode, calon };
}

function ringkas(calon: Calon[]) {
  const baru = calon.filter((item) => !item.sudah_ada);
  return {
    items: calon.map((item) => ({
      id_siswa: item.id_siswa,
      nama: item.nama,
      kelas: item.kelas,
      nominal: item.nominal,
      potongan: item.potongan,
      bersih: item.nominal - item.potongan,
      sudah_ada: item.sudah_ada,
    })),
    jumlah_baru: baru.length,
    jumlah_sudah_ada: calon.length - baru.length,
    total_bersih: baru.reduce(
      (sum, item) => sum + item.nominal - item.potongan,
      0,
    ),
  };
}

export async function preview(
  client: Client,
  idJenis: string,
  periode: string,
  unit: string | null,
  idRombel: string | null,
): Promise<PratinjauTagihan> {
  const hasil = await susunCalon(client, idJenis, periode, unit, idRombel);
  return { periode: hasil.periode, ...ringkas(hasil.calon) };
}

export async function issue(
  client: Client,
  operator: string,
  idJenis: string,
  periodeMentah: string,
  jatuhTempo: string,
  unit: string | null,
  idRombel: string | null,
): Promise<{
  sukses: true;
  terbit: number;
  dilewati: number;
  periode: string;
}> {
  if (!isValidDate(jatuhTempo)) {
    throw new Error("Tanggal jatuh tempo tidak valid.");
  }
  return withTransaction(client, async (tx) => {
    const { jenis, periode, calon } = await susunCalon(
      tx,
      idJenis,
      periodeMentah,
      unit,
      idRombel,
    );
    const tanggal = await hariIni(tx);
    // Cermin gerbang `tulis_jurnal_tx`: jalur massal ini menulis jurnal lewat
    // `statementJurnal` tanpa melewati `tulisJurnalTx`.
    await assertPeriodeTerbuka(tx, tanggal);
    let nomorUrut = await nomorUrutBerikutnya(tx, tanggal.slice(0, 4));
    const statements: InStatement[] = [];
    let terbit = 0;
    for (const item of calon.filter((c) => !c.sudah_ada)) {
      const id = idTagihan(jenis.id, item.id_siswa, periode);
      statements.push({
        sql: `INSERT OR IGNORE INTO keu_tagihan (
                id_tagihan, id_siswa, nama_siswa, id_jenis_tagihan, nama_tagihan, periode,
                nominal, potongan, jatuh_tempo, dibuat_oleh, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'));`,
        args: [
          id,
          item.id_siswa,
          item.nama,
          jenis.id,
          jenis.nama,
          periode,
          item.nominal,
          item.potongan,
          jatuhTempo,
          operator,
        ],
      });
      const bersih = item.nominal - item.potongan;
      if (bersih > 0) {
        const idJurnal = idJurnalTagihan(id);
        statements.push(
          ...statementJurnal(
            {
              id_jurnal: idJurnal,
              tanggal,
              keterangan: `${jenis.nama} ${periode} ${item.nama}`,
              sumber: "Tagihan",
              id_sumber: id,
              id_jurnal_batal: null,
              dibuat_oleh: operator,
            },
            [
              {
                id_baris: `${idJurnal}-1`,
                id_akun: AKUN_PIUTANG_SISWA,
                debit: bersih,
                kredit: 0,
                keterangan: null,
                urutan: 1,
              },
              {
                id_baris: `${idJurnal}-2`,
                id_akun: jenis.id_akun_pendapatan,
                debit: 0,
                kredit: bersih,
                keterangan: null,
                urutan: 2,
              },
            ],
            nomorUrut++,
          ),
        );
      }
      terbit += 1;
    }
    if (statements.length > 0) await tx.batch(statements);
    return {
      sukses: true as const,
      terbit,
      dilewati: calon.length - terbit,
      periode,
    };
  });
}

export async function cancel(
  client: Client,
  operator: string,
  id: string,
  alasanMentah: string,
): Promise<{ sukses: true }> {
  const alasan = alasanMentah.trim();
  if (!alasan) throw new Error("Alasan pembatalan wajib diisi.");
  if (Array.from(alasan).length > MAKS_ALASAN_BATAL_TAGIHAN) {
    throw new Error("Alasan pembatalan maksimal 150 karakter.");
  }
  return withTransaction(client, async (tx) => {
    const tagihan = await tx.execute({
      sql: "SELECT nama_siswa, nama_tagihan, periode FROM keu_tagihan WHERE id_tagihan = ?;",
      args: [id],
    });
    const row = tagihan.rows[0];
    if (!row) throw new Error("Tagihan tidak ditemukan.");
    const bayar = await tx.execute({
      sql: `SELECT COALESCE(SUM(dibayar), 0) AS n FROM (${DIBAYAR_SQL}) WHERE id_tagihan = ?;`,
      args: [id],
    });
    if (Number(bayar.rows[0]?.n) > 0) {
      throw new Error(
        "Tagihan ini sudah dibayar. Batalkan kuitansinya atau pindahkan ke titipan lebih dulu.",
      );
    }
    const ditulis = await tx.execute({
      sql: `INSERT OR IGNORE INTO keu_tagihan_batal (id_tagihan, alasan, dibatalkan_oleh, created_at)
            VALUES (?, ?, ?, datetime('now'));`,
      args: [id, alasan, operator],
    });
    if (ditulis.rowsAffected === 0)
      throw new Error("Tagihan ini sudah dibatalkan.");
    await balikJurnalTx(
      tx,
      idJurnalTagihan(id),
      `Pembatalan ${String(row.nama_tagihan)} ${String(row.periode)} ${String(row.nama_siswa)}: ${alasan}`,
      operator,
    );
    return { sukses: true as const };
  });
}

export async function list(
  client: Client,
  filter: {
    periode?: string | null;
    id_jenis_tagihan?: string | null;
    id_rombel?: string | null;
    status?: string | null;
    jatuh_tempo?: string | null;
  },
): Promise<DaftarTagihan> {
  const saringanJatuhTempo = klausaJatuhTempo(filter.jatuh_tempo);
  const isi = (value: string | null | undefined) => value?.trim() || null;
  const periode = isi(filter.periode);
  const idJenis = isi(filter.id_jenis_tagihan);
  const idRombel = isi(filter.id_rombel);
  const status = isi(filter.status);
  if (status && !["Aktif", "Lunas", "Dibatalkan"].includes(status)) {
    throw new Error("Status tagihan tidak dikenal.");
  }
  let query = `SELECT t.id_tagihan, t.id_siswa, t.nama_siswa, COALESCE(r.nama_rombel, '') AS kelas,
            t.id_jenis_tagihan, t.nama_tagihan, t.periode, t.nominal, t.potongan, t.jatuh_tempo,
            b.alasan AS alasan_batal, COALESCE(d.dibayar, 0) AS dibayar,
            CASE WHEN b.id_tagihan IS NOT NULL THEN 'Dibatalkan'
                 WHEN t.nominal - t.potongan <= COALESCE(d.dibayar, 0) THEN 'Lunas'
                 ELSE 'Aktif' END AS status
     FROM keu_tagihan t
     LEFT JOIN keu_tagihan_batal b ON b.id_tagihan = t.id_tagihan
     LEFT JOIN (${DIBAYAR_SQL}) d ON d.id_tagihan = t.id_tagihan
     LEFT JOIN siswa_data s ON s.id_siswa = t.id_siswa
     LEFT JOIN akademik_rombel r ON r.id_rombel = s.id_rombel
     WHERE 1 = 1`;
  const args: string[] = [];
  if (periode) {
    query += " AND t.periode = ?";
    args.push(periode);
  }
  if (idJenis) {
    query += " AND t.id_jenis_tagihan = ?";
    args.push(idJenis);
  }
  if (idRombel) {
    query += " AND s.id_rombel = ?";
    args.push(idRombel);
  }
  if (status === "Aktif") {
    query +=
      " AND b.id_tagihan IS NULL AND t.nominal - t.potongan > COALESCE(d.dibayar, 0)";
  } else if (status === "Lunas") {
    query +=
      " AND b.id_tagihan IS NULL AND t.nominal - t.potongan <= COALESCE(d.dibayar, 0)";
  } else if (status) {
    query += " AND b.id_tagihan IS NOT NULL";
  }
  query += saringanJatuhTempo;
  // Jatuh tempo terlama di atas. `LIMIT 1000` = `BATAS_DAFTAR_TAGIHAN`.
  query +=
    " ORDER BY t.jatuh_tempo, kelas, t.nama_siswa, t.id_tagihan LIMIT 1000;";
  const [result, hari, sakelar] = await Promise.all([
    client.execute({ sql: query, args }),
    hariIni(client),
    client.execute({
      sql: "SELECT value FROM setting_gex_system WHERE key = ? LIMIT 1;",
      args: [WA_NOTIFY_TAGIHAN_KEY],
    }),
  ]);
  const items = result.rows.map((row) => {
    const aktif = String(row.status) === "Aktif";
    const sisa = aktif
      ? Number(row.nominal) - Number(row.potongan) - Number(row.dibayar)
      : 0;
    return {
      id_tagihan: String(row.id_tagihan),
      id_siswa: String(row.id_siswa),
      nama_siswa: String(row.nama_siswa),
      kelas: String(row.kelas),
      id_jenis_tagihan: String(row.id_jenis_tagihan),
      nama_tagihan: String(row.nama_tagihan),
      periode: String(row.periode),
      nominal: Number(row.nominal),
      potongan: Number(row.potongan),
      jatuh_tempo: String(row.jatuh_tempo),
      alasan_batal: text(row.alasan_batal),
      dibayar: Number(row.dibayar),
      status: String(row.status) as TagihanItem["status"],
      sisa,
      terlambat: sisa > 0 && String(row.jatuh_tempo) < hari,
    };
  });
  return {
    items,
    total_sisa: items.reduce((sum, item) => sum + item.sisa, 0),
    pengingat_wa: settingEnabled(text(sakelar.rows[0]?.value)),
  };
}

/**
 * Cermin `remind` (`desktop/billing.rs`): satu pesan per siswa berisi
 * seluruh tunggakannya. Syarat penerima sama dengan `queueWaliNotification`
 * (siswa, nomor wali sah, dedupe `tagihan:<siswa>:<tanggal WIB>` belum ada),
 * tetapi dibaca sekaligus untuk semua siswa lalu ditulis dalam satu batch:
 * empat round-trip per siswa ke Turso jarak jauh terlalu lambat untuk satu
 * angkatan.
 */
export async function remind(
  client: Client,
  filter: {
    periode?: string | null;
    id_jenis_tagihan?: string | null;
    id_rombel?: string | null;
    jatuh_tempo?: string | null;
  },
): Promise<HasilPengingat> {
  const saringanJatuhTempo = klausaJatuhTempo(filter.jatuh_tempo);
  return withTransaction(client, async (tx) => {
    const setelan = await tx.execute({
      sql: "SELECT key, value FROM setting_gex_system WHERE key IN (?, ?);",
      args: [WA_NOTIFY_TAGIHAN_KEY, waTemplateKey("tagihan")],
    });
    const nilai = new Map(
      setelan.rows.map((row) => [String(row.key), text(row.value)]),
    );
    if (!settingEnabled(nilai.get(WA_NOTIFY_TAGIHAN_KEY))) {
      throw new Error(PESAN_PENGINGAT_MATI);
    }
    const isi = (value: string | null | undefined) => value?.trim() || null;
    let query = `SELECT DISTINCT t.id_siswa
     FROM keu_tagihan t
     LEFT JOIN keu_tagihan_batal b ON b.id_tagihan = t.id_tagihan
     LEFT JOIN (${DIBAYAR_SQL}) d ON d.id_tagihan = t.id_tagihan
     LEFT JOIN siswa_data s ON s.id_siswa = t.id_siswa
     WHERE b.id_tagihan IS NULL AND t.nominal - t.potongan > COALESCE(d.dibayar, 0)`;
    const args: string[] = [];
    const periode = isi(filter.periode);
    const idJenis = isi(filter.id_jenis_tagihan);
    const idRombel = isi(filter.id_rombel);
    if (periode) {
      query += " AND t.periode = ?";
      args.push(periode);
    }
    if (idJenis) {
      query += " AND t.id_jenis_tagihan = ?";
      args.push(idJenis);
    }
    if (idRombel) {
      query += " AND s.id_rombel = ?";
      args.push(idRombel);
    }
    query += saringanJatuhTempo;
    // `LIMIT 501` = `MAKS_SISWA_PENGINGAT` + 1, supaya pemotongan terdeteksi.
    query += " ORDER BY t.id_siswa LIMIT 501;";
    const semua = (await tx.execute({ sql: query, args })).rows.map((row) =>
      String(row.id_siswa),
    );
    const siswa = semua.slice(0, MAKS_SISWA_PENGINGAT);
    const hasil = {
      siswa: siswa.length,
      diantre: 0,
      terpotong: semua.length > MAKS_SISWA_PENGINGAT,
    };
    if (siswa.length === 0) return hasil;

    const hari = await hariIni(tx);
    hasil.diantre = await antrePengingatTx(
      tx,
      siswa,
      hari,
      nilai.get(waTemplateKey("tagihan")) ?? null,
    );
    return hasil;
  });
}

/**
 * Antre satu pesan pengingat per siswa (dedupe `tagihan:<siswa>:<hari>`),
 * berisi seluruh tunggakannya, dalam satu batch. Cermin `antre_pengingat`;
 * dipakai tombol manual dan pengingat otomatis.
 */
async function antrePengingatTx(
  tx: Transaction,
  siswa: string[],
  hari: string,
  template: string | null,
): Promise<number> {
  if (siswa.length === 0) return 0;
  const tanda = siswa.map(() => "?").join(", ");
  const [tunggakan, wali, sudah] = await Promise.all([
    tx.execute({
      sql: `SELECT t.id_siswa, t.nama_tagihan, t.periode, t.jatuh_tempo,
                   t.nominal - t.potongan - COALESCE(d.dibayar, 0) AS sisa
            FROM keu_tagihan t
            LEFT JOIN keu_tagihan_batal b ON b.id_tagihan = t.id_tagihan
            LEFT JOIN (${DIBAYAR_SQL}) d ON d.id_tagihan = t.id_tagihan
            WHERE t.id_siswa IN (${tanda}) AND b.id_tagihan IS NULL
              AND t.nominal - t.potongan > COALESCE(d.dibayar, 0)
            ORDER BY t.id_siswa, t.jatuh_tempo, t.periode, t.id_tagihan
            -- batas: paling banyak MAKS_SISWA_PENGINGAT siswa dari langkah pertama
            LIMIT 250000;`,
      args: siswa,
    }),
    tx.execute({
      sql: `SELECT m.id_unik,
                   COALESCE(s.no_whatsapp_wali, m.no_hp, '') AS no_wa,
                   COALESCE(s.nama_lengkap, m.nama, '') AS nama,
                   COALESCE(r.nama_rombel, m.divisi, '') AS rombel
            FROM master_data m
            LEFT JOIN siswa_data s ON s.id_siswa = m.id_unik
            LEFT JOIN akademik_rombel r ON r.id_rombel = s.id_rombel
            WHERE m.id_unik IN (${tanda})
              AND (LOWER(TRIM(COALESCE(m.jenis_personil, ''))) = 'siswa'
                   OR s.id_siswa IS NOT NULL);`,
      args: siswa,
    }),
    tx.execute({
      // `LIMIT 500` = `MAKS_SISWA_PENGINGAT`: satu kunci per siswa.
      sql: `SELECT dedupe_key FROM notifikasi_wa WHERE dedupe_key IN (${tanda}) LIMIT 500;`,
      args: siswa.map((id) => `tagihan:${id}:${hari}`),
    }),
  ]);

  const perSiswa = new Map<string, TagihanPengingat[]>();
  for (const row of tunggakan.rows) {
    const id = String(row.id_siswa);
    const daftar = perSiswa.get(id) ?? [];
    // Cermin `LIMIT 500` per siswa di `tagihan_terbuka`.
    if (daftar.length < 500) {
      daftar.push({
        nama_tagihan: String(row.nama_tagihan),
        periode: String(row.periode),
        jatuh_tempo: String(row.jatuh_tempo ?? ""),
        sisa: Number(row.sisa),
      });
    }
    perSiswa.set(id, daftar);
  }
  const sudahDiantre = new Set(sudah.rows.map((row) => String(row.dedupe_key)));
  const statements: InStatement[] = [];
  for (const row of wali.rows) {
    const id = String(row.id_unik);
    const dedupe = `tagihan:${id}:${hari}`;
    const nomor = normalizeOperatorPhone(String(row.no_wa ?? ""));
    if (sudahDiantre.has(dedupe) || !isValidOperatorPhone(nomor)) continue;
    const pesan = composeWaMessage("tagihan", template, {
      nama: String(row.nama ?? "") || "Siswa",
      rombel: String(row.rombel ?? "") || "-",
      ...isianPengingat(perSiswa.get(id) ?? []),
    });
    statements.push({
      sql: `INSERT INTO notifikasi_wa (
              id_notifikasi, dedupe_key, jenis, id_siswa, tujuan_nomor,
              isi_pesan, status, attempt_count, created_at, updated_at
            ) VALUES (?, ?, 'tagihan', ?, ?, ?, 'Menunggu', 0, datetime('now'), datetime('now'));`,
      args: [generateWaNotificationId(), dedupe, id, nomor, pesan],
    });
  }
  if (statements.length > 0) await tx.batch(statements);
  return statements.length;
}

/** Siswa yang punya tunggakan, untuk satu potongan saringan jatuh tempo. */
async function siswaMenunggak(
  tx: Transaction,
  klausa: string,
  args: string[],
): Promise<string[]> {
  const hasil = await tx.execute({
    sql: `SELECT DISTINCT t.id_siswa
          FROM keu_tagihan t
          LEFT JOIN keu_tagihan_batal b ON b.id_tagihan = t.id_tagihan
          LEFT JOIN (${DIBAYAR_SQL}) d ON d.id_tagihan = t.id_tagihan
          WHERE b.id_tagihan IS NULL AND t.nominal - t.potongan > COALESCE(d.dibayar, 0)${klausa}
          ORDER BY t.id_siswa LIMIT 501;`,
    args,
  });
  return hasil.rows.map((row) => String(row.id_siswa));
}

/**
 * Cermin `remind_auto`: pengingat otomatis, paling banyak sekali sehari per
 * database (setting tersinkron `pengingat_tagihan_terakhir`), untuk tunggakan
 * yang jatuh tempo tepat H-n dan/atau (pada hari yang dipilih) yang sudah
 * lewat jatuh tempo.
 */
export async function remindAuto(
  client: Client,
): Promise<HasilPengingatOtomatis> {
  return withTransaction(client, async (tx) => {
    const setelan = await tx.execute({
      sql: "SELECT key, value FROM setting_gex_system WHERE key IN (?, ?, ?, ?, ?, ?);",
      args: [
        WA_NOTIFY_TAGIHAN_KEY,
        waTemplateKey("tagihan"),
        PENGINGAT_OTOMATIS_KEY,
        PENGINGAT_HARI_SEBELUM_KEY,
        PENGINGAT_HARI_LEWAT_KEY,
        PENGINGAT_TERAKHIR_KEY,
      ],
    });
    const nilai = new Map(
      setelan.rows.map((row) => [String(row.key), text(row.value)]),
    );
    if (
      !settingEnabled(nilai.get(WA_NOTIFY_TAGIHAN_KEY)) ||
      !settingEnabled(nilai.get(PENGINGAT_OTOMATIS_KEY))
    ) {
      return {
        dijalankan: false as const,
        alasan: "Pengingat otomatis belum dinyalakan.",
      };
    }
    const hari = await hariIni(tx);
    if (nilai.get(PENGINGAT_TERAKHIR_KEY) === hari) {
      return {
        dijalankan: false as const,
        alasan: "Sudah dijalankan hari ini.",
        hari,
      };
    }
    const hariSebelum = nilai.has(PENGINGAT_HARI_SEBELUM_KEY)
      ? clampPengingatHariSebelum(nilai.get(PENGINGAT_HARI_SEBELUM_KEY))
      : DEFAULT_PENGINGAT_HARI_SEBELUM;
    const hariLewat = nilai.has(PENGINGAT_HARI_LEWAT_KEY)
      ? clampPengingatHariLewat(nilai.get(PENGINGAT_HARI_LEWAT_KEY))
      : DEFAULT_PENGINGAT_HARI_LEWAT;
    const minggu = await tx.execute(
      "SELECT CAST(strftime('%w', date('now', '+7 hours')) AS INTEGER) AS hari;",
    );
    const mingguKe = Number(minggu.rows[0]?.hari ?? 0);
    const [sebelum, lewat] = pengingatHariIni(
      hariSebelum,
      hariLewat,
      mingguKe === 0 ? 7 : mingguKe,
    );
    const semua = new Set<string>();
    if (sebelum) {
      for (const id of await siswaMenunggak(
        tx,
        " AND t.jatuh_tempo = date('now', '+7 hours', ?)",
        [`+${hariSebelum} days`],
      )) {
        semua.add(id);
      }
    }
    if (lewat) {
      for (const id of await siswaMenunggak(
        tx,
        " AND t.jatuh_tempo < date('now', '+7 hours')",
        [],
      )) {
        semua.add(id);
      }
    }
    const urut = [...semua].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const siswa = urut.slice(0, MAKS_SISWA_PENGINGAT);
    const diantre = await antrePengingatTx(
      tx,
      siswa,
      hari,
      nilai.get(waTemplateKey("tagihan")) ?? null,
    );
    await tx.execute({
      sql: `INSERT INTO setting_gex_system (key, value) VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
      args: [PENGINGAT_TERAKHIR_KEY, hari],
    });
    return {
      dijalankan: true as const,
      hari,
      siswa: siswa.length,
      diantre,
      terpotong: urut.length > MAKS_SISWA_PENGINGAT,
    };
  });
}

// ── Pembayaran dan kuitansi (K3b) ───────────────────────────────────────────

const PEMBAYARAN_SQL = `SELECT id_pembayaran, id_siswa, nama_siswa, tanggal, seri, nomor_urut,
        nomor, metode, id_akun_kas, total, keterangan, dibuat_oleh, created_at
        FROM keu_pembayaran WHERE id_pembayaran = ?;`;

async function saldoTitipan(tx: Executor, idSiswa: string): Promise<number> {
  const result = await tx.execute({ sql: SALDO_TITIPAN_SQL, args: [idSiswa] });
  return Number(result.rows[0]?.saldo ?? 0);
}

/** Cermin `tagihan_terbuka`. */
async function tagihanTerbuka(tx: Executor, idSiswa: string) {
  const result = await tx.execute({
    sql: `SELECT t.id_tagihan, t.nama_tagihan, t.periode, t.jatuh_tempo,
                 t.nominal - t.potongan AS bersih, COALESCE(d.dibayar, 0) AS dibayar
          FROM keu_tagihan t
          LEFT JOIN keu_tagihan_batal b ON b.id_tagihan = t.id_tagihan
          LEFT JOIN (${DIBAYAR_SQL}) d ON d.id_tagihan = t.id_tagihan
          WHERE t.id_siswa = ? AND b.id_tagihan IS NULL
            AND t.nominal - t.potongan > COALESCE(d.dibayar, 0)
          ORDER BY t.jatuh_tempo, t.periode, t.id_tagihan
          LIMIT 500;`,
    args: [idSiswa],
  });
  return result.rows.map((row) => ({
    id_tagihan: String(row.id_tagihan),
    nama_tagihan: String(row.nama_tagihan),
    periode: String(row.periode),
    jatuh_tempo: String(row.jatuh_tempo),
    bersih: Number(row.bersih),
    dibayar: Number(row.dibayar),
    sisa: Number(row.bersih) - Number(row.dibayar),
  }));
}

/** Cermin `account`. */
export async function account(
  client: Client,
  idSiswa: string,
): Promise<AkunSiswaTagihan> {
  const siswa = await client.execute({
    sql: `SELECT s.id_siswa, s.nama_lengkap, COALESCE(r.nama_rombel, '') AS kelas,
                 COALESCE(s.nama_wali, '') AS nama_wali, COALESCE(s.no_whatsapp_wali, '') AS no_wali
          FROM siswa_data s
          LEFT JOIN akademik_rombel r ON r.id_rombel = s.id_rombel
          WHERE s.id_siswa = ?;`,
    args: [idSiswa],
  });
  const row = siswa.rows[0];
  if (!row) throw new Error("Siswa tidak ditemukan.");
  const riwayat = await client.execute({
    sql: `SELECT p.id_pembayaran, p.nomor, p.tanggal, p.metode, p.total,
                 CASE WHEN pb.id_pembayaran IS NULL THEN 'Sah' ELSE 'Dibatalkan' END AS status,
                 (SELECT GROUP_CONCAT(COALESCE(t.nama_tagihan || ' ' || t.periode, 'Titipan'), ', ')
                  FROM keu_pembayaran_alokasi a
                  LEFT JOIN keu_tagihan t ON t.id_tagihan = a.id_tagihan
                  WHERE a.id_pembayaran = p.id_pembayaran) AS rincian
          FROM keu_pembayaran p
          LEFT JOIN keu_pembayaran_batal pb ON pb.id_pembayaran = p.id_pembayaran
          WHERE p.id_siswa = ?
          ORDER BY p.tanggal DESC, p.created_at DESC, p.id_pembayaran
          LIMIT 10;`,
    args: [idSiswa],
  });
  return {
    siswa: {
      id_siswa: String(row.id_siswa),
      nama_lengkap: String(row.nama_lengkap),
      kelas: String(row.kelas),
      nama_wali: String(row.nama_wali),
      no_wali: String(row.no_wali),
    },
    tagihan: await tagihanTerbuka(client, idSiswa),
    titipan: await saldoTitipan(client, idSiswa),
    riwayat: riwayat.rows.map((item) => ({
      id_pembayaran: String(item.id_pembayaran),
      nomor: String(item.nomor),
      tanggal: String(item.tanggal),
      metode: String(item.metode) as KuitansiItem["metode"],
      total: Number(item.total),
      status: String(item.status) as KuitansiItem["status"],
      rincian: String(item.rincian ?? ""),
    })),
  };
}

/** Cermin `catat_pembayaran_tx`. Seri kuitansi Web selalu `WEB`. */
async function catatPembayaranTx(
  tx: Transaction,
  operator: string,
  valid: PembayaranValid,
): Promise<HasilBayar> {
  if (valid.tanggal > (await hariIni(tx))) {
    throw new Error("Tanggal pembayaran tidak boleh melewati hari ini.");
  }
  const siswa = await tx.execute({
    sql: "SELECT nama_lengkap FROM siswa_data WHERE id_siswa = ?;",
    args: [valid.id_siswa],
  });
  if (!siswa.rows[0]) throw new Error("Siswa tidak ditemukan.");
  const namaSiswa = String(siswa.rows[0].nama_lengkap);
  if (valid.id_akun_kas) await assertAkunBayar(tx, valid.id_akun_kas);
  const terbuka: TagihanTerbuka[] = (await tagihanTerbuka(tx, valid.id_siswa))
    .filter((item) => valid.id_tagihan.includes(item.id_tagihan))
    .map((item) => ({
      id_tagihan: item.id_tagihan,
      jatuh_tempo: item.jatuh_tempo,
      periode: item.periode,
      sisa: item.sisa,
    }));
  const { alokasi, titipan: keTitipan } = alokasiPembayaran(
    terbuka,
    valid.total,
  );
  if (valid.metode === "Titipan") {
    if (keTitipan > 0) {
      throw new Error(
        "Pembayaran dari titipan tidak boleh melebihi sisa tagihan yang dipilih.",
      );
    }
    const saldo = await saldoTitipan(tx, valid.id_siswa);
    if (valid.total > saldo) {
      throw new Error(
        `Saldo titipan tidak cukup. Tersedia ${formatRupiah(Math.max(saldo, 0))}.`,
      );
    }
  }

  const seri = SERI_KUITANSI_WEB;
  const tahun = valid.tanggal.slice(0, 4);
  const urut = await tx.execute({
    sql: `SELECT COALESCE(MAX(nomor_urut), 0) + 1 AS n FROM keu_pembayaran
          WHERE seri = ? AND substr(tanggal, 1, 4) = ?
          -- batas: agregat, selalu satu baris
          ;`,
    args: [seri, tahun],
  });
  const nomorUrut = Number(urut.rows[0]?.n ?? 1);
  const nomor = formatNomorKuitansi(tahun, seri, nomorUrut);
  const id = newId("kwt-");
  await tx.execute({
    sql: `INSERT INTO keu_pembayaran (
            id_pembayaran, id_siswa, nama_siswa, tanggal, seri, nomor_urut, nomor, metode,
            id_akun_kas, total, keterangan, dibuat_oleh, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'));`,
    args: [
      id,
      valid.id_siswa,
      namaSiswa,
      valid.tanggal,
      seri,
      nomorUrut,
      nomor,
      valid.metode,
      valid.id_akun_kas,
      valid.total,
      valid.keterangan,
      operator,
    ],
  });
  const barisAlokasi: Array<[string | null, number]> = alokasi.map((item) => [
    item.id_tagihan,
    item.nominal,
  ]);
  if (keTitipan > 0) barisAlokasi.push([null, keTitipan]);
  for (const [indeks, [idTagihanAlokasi, nominal]] of barisAlokasi.entries()) {
    await tx.execute({
      sql: `INSERT INTO keu_pembayaran_alokasi (id_alokasi, id_pembayaran, id_tagihan, nominal)
            VALUES (?, ?, ?, ?);`,
      args: [idAlokasi(id, indeks + 1), id, idTagihanAlokasi, nominal],
    });
  }

  const keTagihan = alokasi.reduce((sum, item) => sum + item.nominal, 0);
  const idJurnal = idJurnalPembayaran(id);
  await tulisJurnalTx(
    tx,
    {
      id_jurnal: idJurnal,
      tanggal: valid.tanggal,
      keterangan: `Kuitansi ${nomor} ${namaSiswa}`,
      sumber: "Pembayaran",
      id_sumber: id,
      id_jurnal_batal: null,
      dibuat_oleh: operator,
    },
    barisJurnalPembayaran(
      valid.metode,
      valid.id_akun_kas,
      keTagihan,
      keTitipan,
    ).map((item, indeks) => ({
      id_baris: `${idJurnal}-${indeks + 1}`,
      id_akun: item.id_akun,
      debit: item.debit,
      kredit: item.kredit,
      keterangan: null,
      urutan: indeks + 1,
    })),
  );
  return {
    sukses: true,
    id_pembayaran: id,
    nomor,
    ke_titipan: keTitipan,
  };
}

export async function pay(
  client: Client,
  operator: string,
  rawDraft: unknown,
): Promise<HasilBayar> {
  const parsed = pembayaranDraftSchema.safeParse(rawDraft);
  if (!parsed.success) throw new Error("Data pembayaran tidak valid.");
  const hasil = validatePembayaran(parsed.data);
  if (!hasil.ok) throw new Error(hasil.error);
  const valid = hasil.value;
  return withTransaction(client, (tx) =>
    catatPembayaranTx(tx, operator, valid),
  );
}

function validasiAlasanBatal(alasanMentah: string): string {
  const alasan = alasanMentah.trim();
  if (!alasan) throw new Error("Alasan pembatalan wajib diisi.");
  if (Array.from(alasan).length > MAKS_ALASAN_BATAL_TAGIHAN) {
    throw new Error("Alasan pembatalan maksimal 150 karakter.");
  }
  return alasan;
}

/** Cermin `batal_pembayaran_tx`. */
async function batalPembayaranTx(
  tx: Transaction,
  operator: string,
  id: string,
  alasan: string,
) {
  const asal = await tx.execute({ sql: PEMBAYARAN_SQL, args: [id] });
  const row = asal.rows[0];
  if (!row) throw new Error("Kuitansi tidak ditemukan.");
  const ditulis = await tx.execute({
    sql: `INSERT OR IGNORE INTO keu_pembayaran_batal (id_pembayaran, alasan, dibatalkan_oleh, created_at)
          VALUES (?, ?, ?, datetime('now'));`,
    args: [id, alasan, operator],
  });
  if (ditulis.rowsAffected === 0) {
    throw new Error("Kuitansi ini sudah dibatalkan.");
  }
  await balikJurnalTx(
    tx,
    idJurnalPembayaran(id),
    `Pembatalan ${String(row.nomor)} ${String(row.nama_siswa)}: ${alasan}`,
    operator,
  );
  return row;
}

export const PESAN_TITIPAN_TERPAKAI =
  "Titipan dari kuitansi ini sudah dipakai. Batalkan dulu kuitansi bermetode Titipan-nya.";

/** Cermin `assert_titipan_utuh`: kelebihan yang sudah terpakai tidak boleh hilang. */
async function assertTitipanUtuh(tx: Transaction, id: string) {
  const result = await tx.execute({
    sql: `SELECT p.id_siswa, COALESCE(SUM(CASE WHEN a.id_tagihan IS NULL THEN a.nominal END), 0) AS masuk
          FROM keu_pembayaran p
          LEFT JOIN keu_pembayaran_alokasi a ON a.id_pembayaran = p.id_pembayaran
          WHERE p.id_pembayaran = ?;`,
    args: [id],
  });
  const idSiswa = text(result.rows[0]?.id_siswa);
  const masuk = Number(result.rows[0]?.masuk ?? 0);
  if (idSiswa && masuk > 0 && masuk > (await saldoTitipan(tx, idSiswa))) {
    throw new Error(PESAN_TITIPAN_TERPAKAI);
  }
}

export async function cancelPayment(
  client: Client,
  operator: string,
  id: string,
  alasanMentah: string,
): Promise<{ sukses: true }> {
  const alasan = validasiAlasanBatal(alasanMentah);
  await withTransaction(client, async (tx) => {
    await assertTitipanUtuh(tx, id);
    await batalPembayaranTx(tx, operator, id, alasan);
  });
  return { sukses: true as const };
}

/** Cermin `move_to_deposit`. */
export async function moveToDeposit(
  client: Client,
  operator: string,
  id: string,
  alasanMentah: string,
): Promise<HasilBayar> {
  const alasan = validasiAlasanBatal(alasanMentah);
  return withTransaction(client, async (tx) => {
    const metode = await tx.execute({
      sql: "SELECT metode FROM keu_pembayaran WHERE id_pembayaran = ?;",
      args: [id],
    });
    if (text(metode.rows[0]?.metode) === "Titipan") {
      throw new Error(
        "Kuitansi dari titipan cukup dibatalkan; saldonya kembali dengan sendirinya.",
      );
    }
    const asal = await batalPembayaranTx(tx, operator, id, alasan);
    return catatPembayaranTx(tx, operator, {
      id_siswa: String(asal.id_siswa),
      tanggal: String(asal.tanggal),
      metode: String(asal.metode) as PembayaranValid["metode"],
      total: Number(asal.total),
      id_akun_kas: text(asal.id_akun_kas),
      keterangan: `Pengganti ${String(asal.nomor)}`,
      id_tagihan: [],
    });
  });
}

/** Cermin `payments`. */
export async function payments(
  client: Client,
  dari: string,
  sampai: string,
  seri: string | null,
): Promise<{ items: KuitansiItem[]; total_sah: number }> {
  if (!isValidDate(dari) || !isValidDate(sampai) || dari > sampai) {
    throw new Error("Rentang tanggal tidak valid.");
  }
  let query = `SELECT p.id_pembayaran, p.nomor, p.seri, p.tanggal, p.id_siswa, p.nama_siswa,
            COALESCE(r.nama_rombel, '') AS kelas, p.metode, p.total, p.dibuat_oleh,
            pb.alasan AS alasan_batal,
            CASE WHEN pb.id_pembayaran IS NULL THEN 'Sah' ELSE 'Dibatalkan' END AS status
     FROM keu_pembayaran p
     LEFT JOIN keu_pembayaran_batal pb ON pb.id_pembayaran = p.id_pembayaran
     LEFT JOIN siswa_data s ON s.id_siswa = p.id_siswa
     LEFT JOIN akademik_rombel r ON r.id_rombel = s.id_rombel
     WHERE p.tanggal >= ? AND p.tanggal <= ?`;
  const args = [dari, sampai];
  const seriBersih = seri?.trim();
  if (seriBersih) {
    query += " AND p.seri = ?";
    args.push(seriBersih);
  }
  // `LIMIT 1000` = `BATAS_DAFTAR_KUITANSI`.
  query +=
    " ORDER BY p.tanggal DESC, p.nomor DESC, p.id_pembayaran LIMIT 1000;";
  const result = await client.execute({ sql: query, args });
  const jumlah = new Map<string, number>();
  for (const row of result.rows) {
    const nomor = String(row.nomor);
    jumlah.set(nomor, (jumlah.get(nomor) ?? 0) + 1);
  }
  const items: KuitansiItem[] = result.rows.map((row) => ({
    id_pembayaran: String(row.id_pembayaran),
    nomor: String(row.nomor),
    seri: String(row.seri),
    tanggal: String(row.tanggal),
    id_siswa: String(row.id_siswa),
    nama_siswa: String(row.nama_siswa),
    kelas: String(row.kelas),
    metode: String(row.metode) as KuitansiItem["metode"],
    total: Number(row.total),
    dibuat_oleh: String(row.dibuat_oleh),
    alasan_batal: text(row.alasan_batal),
    status: String(row.status) as KuitansiItem["status"],
    nomor_ganda: (jumlah.get(String(row.nomor)) ?? 0) > 1,
  }));
  return {
    items,
    total_sah: items
      .filter((item) => item.status === "Sah")
      .reduce((sum, item) => sum + item.total, 0),
  };
}

/** Cermin `payment_detail`. */
export async function paymentDetail(
  client: Client,
  id: string,
): Promise<DetailKuitansi> {
  const result = await client.execute({
    sql: `SELECT p.id_pembayaran, p.id_siswa, p.nama_siswa, p.tanggal, p.seri, p.nomor, p.metode,
                 p.id_akun_kas, COALESCE(k.nama, '') AS nama_akun, p.total, p.keterangan,
                 p.dibuat_oleh, p.created_at, COALESCE(r.nama_rombel, '') AS kelas,
                 COALESCE(s.nama_wali, '') AS nama_wali, COALESCE(s.no_whatsapp_wali, '') AS no_wali,
                 pb.alasan AS alasan_batal,
                 CASE WHEN pb.id_pembayaran IS NULL THEN 'Sah' ELSE 'Dibatalkan' END AS status
          FROM keu_pembayaran p
          LEFT JOIN keu_pembayaran_batal pb ON pb.id_pembayaran = p.id_pembayaran
          LEFT JOIN keu_akun k ON k.id_akun = p.id_akun_kas
          LEFT JOIN siswa_data s ON s.id_siswa = p.id_siswa
          LEFT JOIN akademik_rombel r ON r.id_rombel = s.id_rombel
          WHERE p.id_pembayaran = ?;`,
    args: [id],
  });
  const row = result.rows[0];
  if (!row) throw new Error("Kuitansi tidak ditemukan.");
  const alokasi = await client.execute({
    sql: `SELECT a.id_alokasi, a.id_tagihan, t.nama_tagihan, t.periode, a.nominal
          FROM keu_pembayaran_alokasi a
          LEFT JOIN keu_tagihan t ON t.id_tagihan = a.id_tagihan
          WHERE a.id_pembayaran = ?
          ORDER BY a.id_alokasi
          LIMIT 200;`,
    args: [id],
  });
  return {
    pembayaran: {
      id_pembayaran: String(row.id_pembayaran),
      id_siswa: String(row.id_siswa),
      nama_siswa: String(row.nama_siswa),
      tanggal: String(row.tanggal),
      seri: String(row.seri),
      nomor: String(row.nomor),
      metode: String(row.metode) as KuitansiItem["metode"],
      id_akun_kas: text(row.id_akun_kas),
      nama_akun: String(row.nama_akun),
      total: Number(row.total),
      keterangan: text(row.keterangan),
      dibuat_oleh: String(row.dibuat_oleh),
      created_at: String(row.created_at),
      kelas: String(row.kelas),
      nama_wali: String(row.nama_wali),
      no_wali: String(row.no_wali),
      alasan_batal: text(row.alasan_batal),
      status: String(row.status) as KuitansiItem["status"],
    },
    alokasi: alokasi.rows.map((item) => ({
      id_alokasi: String(item.id_alokasi),
      id_tagihan: text(item.id_tagihan),
      nama_tagihan: text(item.nama_tagihan),
      periode: text(item.periode),
      nominal: Number(item.nominal),
    })),
    saldo_titipan: await saldoTitipan(client, String(row.id_siswa)),
    kop: await kopSekolah(client),
  };
}

/** Cermin `review`. */
export async function review(client: Client): Promise<TinjauanPembayaran> {
  const lebih = await client.execute(
    `SELECT t.id_tagihan, t.id_siswa, t.nama_siswa, t.nama_tagihan, t.periode,
            CASE WHEN b.id_tagihan IS NULL THEN t.nominal - t.potongan ELSE 0 END AS bersih,
            d.dibayar, CASE WHEN b.id_tagihan IS NULL THEN 0 ELSE 1 END AS dibatalkan
     FROM (${DIBAYAR_SQL}) d
     JOIN keu_tagihan t ON t.id_tagihan = d.id_tagihan
     LEFT JOIN keu_tagihan_batal b ON b.id_tagihan = t.id_tagihan
     WHERE d.dibayar > CASE WHEN b.id_tagihan IS NULL THEN t.nominal - t.potongan ELSE 0 END
     ORDER BY t.nama_siswa, t.periode, t.id_tagihan
     LIMIT 500;`,
  );
  const lebih_bayar: TinjauanPembayaran["lebih_bayar"] = [];
  for (const row of lebih.rows) {
    const kuitansi = await client.execute({
      sql: `SELECT p.id_pembayaran, p.nomor, p.tanggal, p.metode, p.seri, a.nominal
            FROM keu_pembayaran_alokasi a
            JOIN keu_pembayaran p ON p.id_pembayaran = a.id_pembayaran
            LEFT JOIN keu_pembayaran_batal pb ON pb.id_pembayaran = p.id_pembayaran
            WHERE a.id_tagihan = ? AND pb.id_pembayaran IS NULL
            ORDER BY p.tanggal, p.nomor
            LIMIT 20;`,
      args: [String(row.id_tagihan)],
    });
    lebih_bayar.push({
      id_tagihan: String(row.id_tagihan),
      id_siswa: String(row.id_siswa),
      nama_siswa: String(row.nama_siswa),
      nama_tagihan: String(row.nama_tagihan),
      periode: String(row.periode),
      bersih: Number(row.bersih),
      dibayar: Number(row.dibayar),
      dibatalkan: Number(row.dibatalkan),
      kuitansi: kuitansi.rows.map((item) => ({
        id_pembayaran: String(item.id_pembayaran),
        nomor: String(item.nomor),
        tanggal: String(item.tanggal),
        metode: String(item.metode) as KuitansiItem["metode"],
        seri: String(item.seri),
        nominal: Number(item.nominal),
      })),
    });
  }
  const ganda = await client.execute(
    `SELECT p.id_pembayaran, p.nomor, p.seri, p.tanggal, p.id_siswa, p.nama_siswa, p.total, p.metode
     FROM keu_pembayaran p
     LEFT JOIN keu_pembayaran_batal pb ON pb.id_pembayaran = p.id_pembayaran
     WHERE pb.id_pembayaran IS NULL
       AND EXISTS (
         SELECT 1 FROM keu_pembayaran q
         LEFT JOIN keu_pembayaran_batal qb ON qb.id_pembayaran = q.id_pembayaran
         WHERE qb.id_pembayaran IS NULL AND q.id_pembayaran <> p.id_pembayaran
           AND q.id_siswa = p.id_siswa AND q.tanggal = p.tanggal
           AND q.total = p.total AND q.seri <> p.seri
       )
     ORDER BY p.nama_siswa, p.tanggal, p.total, p.nomor
     LIMIT 500;`,
  );
  const minus = await client.execute(
    `SELECT p.id_siswa, MAX(p.nama_siswa) AS nama_siswa,
            SUM(CASE WHEN p.metode = 'Titipan' THEN -a.nominal
                     WHEN a.id_tagihan IS NULL THEN a.nominal ELSE 0 END) AS saldo
     FROM keu_pembayaran p
     JOIN keu_pembayaran_alokasi a ON a.id_pembayaran = p.id_pembayaran
     LEFT JOIN keu_pembayaran_batal pb ON pb.id_pembayaran = p.id_pembayaran
     WHERE pb.id_pembayaran IS NULL
     GROUP BY p.id_siswa
     HAVING saldo < 0
     ORDER BY nama_siswa, p.id_siswa
     LIMIT 500;`,
  );
  return {
    lebih_bayar,
    kemungkinan_ganda: ganda.rows.map((row) => ({
      id_pembayaran: String(row.id_pembayaran),
      nomor: String(row.nomor),
      seri: String(row.seri),
      tanggal: String(row.tanggal),
      id_siswa: String(row.id_siswa),
      nama_siswa: String(row.nama_siswa),
      total: Number(row.total),
      metode: String(row.metode) as KuitansiItem["metode"],
    })),
    titipan_minus: minus.rows.map((row) => ({
      id_siswa: String(row.id_siswa),
      nama_siswa: String(row.nama_siswa),
      saldo: Number(row.saldo),
    })),
  };
}

/** Cermin `series`. Web tidak punya kode perangkat; serinya selalu `WEB`. */
export async function series(client: Client): Promise<SeriKuitansi> {
  const result = await client.execute(
    `SELECT device_code, seri, nama_perangkat, updated_at FROM keu_seri_perangkat
     ORDER BY seri, device_code LIMIT 500;`,
  );
  return {
    device_code: null,
    seri_aktif: SERI_KUITANSI_WEB,
    terdaftar: true,
    items: result.rows.map((row) => ({
      device_code: String(row.device_code),
      seri: String(row.seri),
      nama_perangkat: String(row.nama_perangkat ?? ""),
      updated_at: String(row.updated_at),
    })),
  };
}

/** Cermin `save_series`. */
export async function saveSeries(
  client: Client,
  deviceCodeMentah: string,
  seriMentah: string,
  namaMentah: string,
): Promise<{ sukses: true; seri: string }> {
  const deviceCode = deviceCodeMentah.trim();
  if (!deviceCode || Array.from(deviceCode).length > 100) {
    throw new Error("Kode perangkat wajib diisi.");
  }
  const cek = validateSeri(seriMentah);
  if (!cek.ok) throw new Error(cek.error);
  const nama = namaMentah.trim();
  if (Array.from(nama).length > MAKS_NAMA_PERANGKAT) {
    throw new Error("Nama perangkat maksimal 60 karakter.");
  }
  return withTransaction(client, async (tx) => {
    const dipakai = await tx.execute({
      sql: "SELECT EXISTS(SELECT 1 FROM keu_seri_perangkat WHERE UPPER(seri) = ? AND device_code <> ?) AS ada;",
      args: [cek.value, deviceCode],
    });
    if (Number(dipakai.rows[0]?.ada) === 1) {
      throw new Error("Seri ini sudah dipakai perangkat lain.");
    }
    await tx.execute({
      sql: `INSERT INTO keu_seri_perangkat (device_code, seri, nama_perangkat, created_at, updated_at)
            VALUES (?, ?, ?, datetime('now'), datetime('now'))
            ON CONFLICT(device_code) DO UPDATE SET
              seri = excluded.seri,
              nama_perangkat = excluded.nama_perangkat,
              updated_at = excluded.updated_at;`,
      args: [deviceCode, cek.value, nama],
    });
    return { sukses: true as const, seri: cek.value };
  });
}

// ── Rekap tagihan dan penerimaan (lanjutan K4) ──────────────────────────────

async function waktuCetak(client: Client): Promise<string> {
  const result = await client.execute(
    "SELECT datetime('now', '+7 hours') AS waktu;",
  );
  return String(result.rows[0]?.waktu ?? "");
}

/** Cermin `recap_rombel`: rekap satu periode per rombel siswa SAAT INI. */
export async function recapRombel(
  client: Client,
  periodeMentah: string,
  idJenis: string | null | undefined,
): Promise<RekapRombel> {
  const periode = periodeMentah.trim();
  if (!periode) throw new Error("Periode tagihan wajib diisi.");
  let query = `SELECT COALESCE(r.id_rombel, '') AS id_rombel, COALESCE(r.nama_rombel, '') AS nama_rombel,
            COUNT(DISTINCT t.id_siswa) AS siswa,
            SUM(t.nominal - t.potongan) AS ditagih,
            SUM(MIN(COALESCE(d.dibayar, 0), t.nominal - t.potongan)) AS terbayar,
            COUNT(DISTINCT CASE WHEN t.nominal - t.potongan > COALESCE(d.dibayar, 0)
                                THEN t.id_siswa END) AS menunggak
     FROM keu_tagihan t
     LEFT JOIN keu_tagihan_batal b ON b.id_tagihan = t.id_tagihan
     LEFT JOIN (${DIBAYAR_SQL}) d ON d.id_tagihan = t.id_tagihan
     LEFT JOIN siswa_data s ON s.id_siswa = t.id_siswa
     LEFT JOIN akademik_rombel r ON r.id_rombel = s.id_rombel
     WHERE b.id_tagihan IS NULL AND t.periode = ?`;
  const args = [periode];
  const jenis = idJenis?.trim();
  if (jenis) {
    query += " AND t.id_jenis_tagihan = ?";
    args.push(jenis);
  }
  query +=
    " GROUP BY 1, 2 ORDER BY (r.id_rombel IS NULL), MAX(r.tingkat), 2, 1 LIMIT 500;";
  const [result, dicetak] = await Promise.all([
    client.execute({ sql: query, args }),
    waktuCetak(client),
  ]);
  const baris: BarisRekapRombel[] = result.rows.map((row) => ({
    id_rombel: String(row.id_rombel ?? ""),
    nama_rombel: String(row.nama_rombel ?? ""),
    siswa: Number(row.siswa ?? 0),
    ditagih: Number(row.ditagih ?? 0),
    terbayar: Number(row.terbayar ?? 0),
    menunggak: Number(row.menunggak ?? 0),
  }));
  return { periode, dicetak, ...susunRekapRombel(baris) };
}

/** Cermin `recap_receipts`: penerimaan per jenis per bulan, 12 bulan. */
export async function recapReceipts(
  client: Client,
  mulai: string,
): Promise<RekapPenerimaan> {
  const rentang = bulanRentang(mulai.trim());
  if (!rentang.ok) throw new Error(rentang.error);
  const { bulan, sesudah } = rentang.value;
  const [result, dicetak] = await Promise.all([
    client.execute({
      sql: `SELECT substr(p.tanggal, 1, 7) AS bulan,
                   CASE WHEN a.id_tagihan IS NULL THEN '' ELSE COALESCE(t.id_jenis_tagihan, '-') END AS id_jenis,
                   COALESCE(MAX(j.nama), MAX(t.nama_tagihan), 'Tagihan lain') AS nama,
                   p.metode = 'Titipan' AS dari_titipan,
                   SUM(a.nominal) AS jumlah
            FROM keu_pembayaran p
            JOIN keu_pembayaran_alokasi a ON a.id_pembayaran = p.id_pembayaran
            LEFT JOIN keu_pembayaran_batal pb ON pb.id_pembayaran = p.id_pembayaran
            LEFT JOIN keu_tagihan t ON t.id_tagihan = a.id_tagihan
            LEFT JOIN keu_jenis_tagihan j ON j.id_jenis_tagihan = t.id_jenis_tagihan
            WHERE pb.id_pembayaran IS NULL AND p.tanggal >= ? AND p.tanggal < ?
            GROUP BY 1, 2, 4
            LIMIT 5000;`,
      args: [`${bulan[0]}-01`, `${sesudah}-01`],
    }),
    waktuCetak(client),
  ]);
  const baris: BarisPenerimaan[] = result.rows.map((row) => ({
    bulan: String(row.bulan ?? ""),
    id_jenis: String(row.id_jenis ?? ""),
    nama: String(row.nama ?? ""),
    dari_titipan: Number(row.dari_titipan ?? 0) === 1,
    jumlah: Number(row.jumlah ?? 0),
  }));
  return { dicetak, ...susunPenerimaan(bulan, baris) };
}
