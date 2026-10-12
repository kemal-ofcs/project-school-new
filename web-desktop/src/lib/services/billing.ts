import "server-only";

import { randomBytes } from "node:crypto";
import type { Client, InStatement, Transaction } from "@libsql/client";
import {
  balikJurnalTx,
  nomorUrutBerikutnya,
  statementJurnal,
} from "@/lib/services/accounting";
import { isValidDate } from "@/lib/validations/accounting";
import {
  AKUN_PIUTANG_SISWA,
  hitungPotongan,
  idJurnalTagihan,
  idTagihan,
  jenisTagihanDraftSchema,
  type KeringananBerlaku,
  keringananBerlaku,
  keringananDraftSchema,
  kunciUnit,
  MAKS_ALASAN_BATAL_TAGIHAN,
  pilihTarif,
  type TarifBerlaku,
  tarifDraftSchema,
  validateJenisTagihan,
  validateKeringanan,
  validatePeriodeTagihan,
  validateTarif,
} from "@/lib/validations/billing";
import type {
  KeringananItem,
  MasterTagihan,
  PratinjauTagihan,
  SiswaTagihan,
  TagihanItem,
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

// ── Master ──────────────────────────────────────────────────────────────────

export async function master(client: Client): Promise<MasterTagihan> {
  const [jenis, tarif, unit, rombel, tahun] = await client.batch(
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
  };
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
  },
): Promise<{ items: TagihanItem[]; total_sisa: number }> {
  const isi = (value: string | null | undefined) => value?.trim() || null;
  const periode = isi(filter.periode);
  const idJenis = isi(filter.id_jenis_tagihan);
  const idRombel = isi(filter.id_rombel);
  const status = isi(filter.status);
  if (status && status !== "Aktif" && status !== "Dibatalkan") {
    throw new Error("Status tagihan tidak dikenal.");
  }
  let query = `SELECT t.id_tagihan, t.id_siswa, t.nama_siswa, COALESCE(r.nama_rombel, '') AS kelas,
            t.id_jenis_tagihan, t.nama_tagihan, t.periode, t.nominal, t.potongan, t.jatuh_tempo,
            b.alasan AS alasan_batal,
            CASE WHEN b.id_tagihan IS NULL THEN 'Aktif' ELSE 'Dibatalkan' END AS status
     FROM keu_tagihan t
     LEFT JOIN keu_tagihan_batal b ON b.id_tagihan = t.id_tagihan
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
  if (status) {
    query +=
      status === "Aktif"
        ? " AND b.id_tagihan IS NULL"
        : " AND b.id_tagihan IS NOT NULL";
  }
  // `LIMIT 1000` = `BATAS_DAFTAR_TAGIHAN`.
  query +=
    " ORDER BY t.periode DESC, kelas, t.nama_siswa, t.id_tagihan LIMIT 1000;";
  const [result, hari] = await Promise.all([
    client.execute({ sql: query, args }),
    hariIni(client),
  ]);
  const items = result.rows.map((row) => {
    const aktif = String(row.status) === "Aktif";
    const sisa = aktif ? Number(row.nominal) - Number(row.potongan) : 0;
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
      status: (aktif ? "Aktif" : "Dibatalkan") as TagihanItem["status"],
      sisa,
      terlambat: sisa > 0 && String(row.jatuh_tempo) < hari,
    };
  });
  return {
    items,
    total_sisa: items.reduce((sum, item) => sum + item.sisa, 0),
  };
}
