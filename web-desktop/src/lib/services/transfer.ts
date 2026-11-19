import "server-only";

import type { Client } from "@libsql/client";
import { kunciNama } from "@/lib/validations/hris";
import {
  AKSI_PENGATURAN,
  type AksiPengaturan,
  BANK_SATU_SQL,
  BANK_SQL,
  BARIS_TRANSFER_SQL,
  type BankBaris,
  bacaAlias,
  bankBentrok,
  CATAT_UNDUH_SQL,
  catatanUnduh,
  FORMAT_SQL,
  type FormatSusun,
  type FormatTampil,
  type HasilBerkasTransfer,
  type ItemTransfer,
  kolomTeks,
  PESAN_AKSI_PENGATURAN,
  PESAN_BANK_NONAKTIF,
  PESAN_DEBET_NONAKTIF,
  PESAN_FORMAT_GANDA,
  PESAN_FORMAT_NONAKTIF,
  PESAN_REKENING_GANDA,
  PESAN_RUN_TIDAK_ADA,
  PESAN_STATUS_RUN,
  type PengaturanTransfer,
  pesanBankGanda,
  REKENING_SQL,
  type RekeningTampil,
  RIWAYAT_UNDUH_SQL,
  RUN_TRANSFER_SQL,
  rekeningBentrok,
  SIMPAN_BANK_SQL,
  SIMPAN_FORMAT_SQL,
  SIMPAN_REKENING_SQL,
  STATUS_RUN_TRANSFER,
  susunTransfer,
  validasiBank,
  validasiFormat,
  validasiKolom,
  validasiPilihanTransfer,
  validasiRekening,
} from "@/lib/validations/transfer";
import {
  ambil,
  angka,
  galat,
  hariIni,
  satu,
  semua,
  teks,
  tulis,
} from "./hr-rekrutmen";

// Cermin I/O cloud `desktop/transfer.rs`. Ketiga tabel bank cloud-only, dan
// run serta slip dibaca dari database yang sama, jadi Web dan Desktop memakai
// kueri yang sama tanpa outbox.

type Baris = Record<string, unknown>;

function idBaru(awalan: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return (
    awalan + [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")
  );
}

const aktif = (b: Baris, kunci: string) => angka(b, kunci) === 1;

function bankTampil(b: Baris): Baris {
  return { ...b, alias: bacaAlias(teks(b, "alias")) };
}

/** Cermin `format_tampil`: kolom yang tidak lagi sah menjadi null. */
function formatTampil(f: Baris): FormatTampil {
  let kolom: unknown = null;
  try {
    const sah = validasiKolom(JSON.parse(teks(f, "kolom")));
    kolom = sah.ok ? sah.nilai : null;
  } catch {
    kolom = null;
  }
  return { ...f, kolom } as unknown as FormatTampil;
}

/** Cermin `bank_aktif`: bank aktif untuk isian profil keuangan (sesi). */
export async function bankAktif(client: Client) {
  const bank = (await semua(client, BANK_SQL))
    .filter((b) => aktif(b, "is_aktif"))
    .map(bankTampil);
  return { bank } as unknown as Pick<PengaturanTransfer, "bank">;
}

/** Cermin `pengaturan`. */
export async function pengaturanTransfer(
  client: Client,
  atur: boolean,
): Promise<PengaturanTransfer> {
  const bank = (await semua(client, BANK_SQL))
    .filter((b) => atur || aktif(b, "is_aktif"))
    .map(bankTampil);
  const rekening = (await semua(client, REKENING_SQL)).filter(
    (r) => atur || (aktif(r, "is_aktif") && aktif(r, "bank_aktif")),
  );
  const format = (await semua(client, FORMAT_SQL))
    .filter((f) => atur || aktif(f, "is_aktif"))
    .map(formatTampil);
  return { bank, rekening, format, atur } as unknown as PengaturanTransfer;
}

async function periksaBank(client: Client, idBank: string, tetap: boolean) {
  const b = await satu(client, BANK_SATU_SQL, [idBank]);
  if (!b) galat("Bank tidak ditemukan.");
  if (!tetap && !aktif(b, "is_aktif")) galat(PESAN_BANK_NONAKTIF);
}

function barisLama(
  daftar: Baris[],
  kunci: string,
  id: string | null,
  apa: string,
): Baris | null {
  if (id === null) return null;
  const lama = daftar.find((b) => teks(b, kunci) === id);
  if (!lama) galat(`${apa} tidak ditemukan.`);
  return lama;
}

/** Cermin `simpan_pengaturan`: draft `{ aksi, id, data }`. */
export async function simpanPengaturanTransfer(
  client: Client,
  oleh: string,
  draft: { aksi: string; id?: string | null; data: unknown },
): Promise<{ sukses: true; id: string }> {
  if (!(AKSI_PENGATURAN as readonly string[]).includes(draft.aksi)) {
    galat(PESAN_AKSI_PENGATURAN);
  }
  const aksi = draft.aksi as AksiPengaturan;
  const id = draft.id?.trim() || null;
  const data = draft.data ?? null;
  if (aksi === "bank") {
    const daftar = await semua(client, BANK_SQL);
    const lama = barisLama(daftar, "id_bank", id, "Bank");
    const sah = ambil(validasiBank(data, lama ? teks(lama, "nama") : null));
    const bentrok = bankBentrok(
      id,
      sah,
      daftar as unknown as readonly BankBaris[],
    );
    if (bentrok !== null) galat(pesanBankGanda(bentrok));
    const idBank = id ?? idBaru("bnk-");
    await tulis(client, SIMPAN_BANK_SQL, [
      idBank,
      sah.nama,
      sah.kode,
      JSON.stringify(sah.alias),
      sah.is_aktif,
      oleh,
    ]);
    return { sukses: true, id: idBank };
  }
  if (aksi === "rekening") {
    const daftar = await semua(client, REKENING_SQL);
    const lama = barisLama(daftar, "id_rekening", id, "Rekening");
    const sah = ambil(validasiRekening(data));
    await periksaBank(
      client,
      sah.id_bank,
      lama !== null && teks(lama, "id_bank") === sah.id_bank,
    );
    if (
      rekeningBentrok(
        id,
        sah,
        daftar as unknown as Parameters<typeof rekeningBentrok>[2],
      )
    ) {
      galat(PESAN_REKENING_GANDA);
    }
    const idRekening = id ?? idBaru("rek-");
    await tulis(client, SIMPAN_REKENING_SQL, [
      idRekening,
      sah.id_bank,
      sah.no_rekening,
      sah.nama_rekening,
      sah.keterangan,
      sah.is_aktif,
      oleh,
    ]);
    return { sukses: true, id: idRekening };
  }
  const daftar = await semua(client, FORMAT_SQL);
  const lama = barisLama(daftar, "id_format", id, "Format");
  const sah = ambil(validasiFormat(data));
  if (sah.id_bank !== null) {
    await periksaBank(
      client,
      sah.id_bank,
      lama !== null && teks(lama, "id_bank") === sah.id_bank,
    );
  }
  const kunci = kunciNama(sah.nama);
  if (
    daftar.some(
      (f) =>
        teks(f, "id_format") !== id && kunciNama(teks(f, "nama")) === kunci,
    )
  ) {
    galat(PESAN_FORMAT_GANDA);
  }
  const idFormat = id ?? idBaru("fmt-");
  await tulis(client, SIMPAN_FORMAT_SQL, [
    idFormat,
    sah.nama,
    sah.id_bank,
    sah.jenis,
    sah.pemisah,
    sah.pakai_judul,
    sah.kutip,
    sah.desimal,
    sah.cakupan,
    kolomTeks(sah.kolom),
    sah.maks_berita,
    sah.is_aktif,
    oleh,
  ]);
  return { sukses: true, id: idFormat };
}

/**
 * Cermin `berkas_transfer`: pratinjau (`catat = false`) atau unduh
 * (`catat = true`, menulis `TRANSFER_EXPORT`). `riwayat` = unduhan sebelum
 * permintaan ini.
 */
export async function berkasTransfer(
  client: Client,
  oleh: string,
  draft: unknown,
  catat: boolean,
): Promise<HasilBerkasTransfer> {
  const pilihan = ambil(validasiPilihanTransfer(draft));
  const run = await satu(client, RUN_TRANSFER_SQL, [pilihan.run_id]);
  if (!run) galat(PESAN_RUN_TIDAK_ADA);
  const status = teks(run, "status");
  if (!(STATUS_RUN_TRANSFER as readonly string[]).includes(status)) {
    galat(PESAN_STATUS_RUN);
  }
  const debet = (await semua(client, REKENING_SQL)).find(
    (r) =>
      teks(r, "id_rekening") === pilihan.id_rekening &&
      aktif(r, "is_aktif") &&
      aktif(r, "bank_aktif"),
  );
  if (!debet) galat(PESAN_DEBET_NONAKTIF);
  let format: FormatTampil | null = null;
  if (pilihan.id_format !== null) {
    const f = (await semua(client, FORMAT_SQL)).find(
      (x) => teks(x, "id_format") === pilihan.id_format && aktif(x, "is_aktif"),
    );
    format = f ? formatTampil(f) : null;
    if (!format || format.kolom === null) galat(PESAN_FORMAT_NONAKTIF);
  }
  const tanggal_efektif = pilihan.tanggal_efektif ?? (await hariIni(client));
  const susunan = susunTransfer({
    run: {
      period_start: teks(run, "period_start"),
      period_end: teks(run, "period_end"),
    },
    item: (await semua(client, BARIS_TRANSFER_SQL, [pilihan.run_id])).map(
      (i): ItemTransfer => ({
        id_karyawan: teks(i, "id_karyawan"),
        nama_karyawan: teks(i, "nama_karyawan"),
        kode_karyawan: teks(i, "kode_karyawan"),
        net_salary: angka(i, "net_salary"),
        id_keluar: teks(i, "id_keluar"),
        bank: teks(i, "bank"),
        no_rekening: teks(i, "no_rekening"),
        nama_rekening: teks(i, "nama_rekening"),
      }),
    ),
    bank: (await semua(client, BANK_SQL)).map(
      (b): BankBaris => ({
        id_bank: teks(b, "id_bank"),
        nama: teks(b, "nama"),
        kode: teks(b, "kode"),
        alias: teks(b, "alias"),
        is_aktif: angka(b, "is_aktif"),
      }),
    ),
    debet: {
      id_bank: teks(debet, "id_bank"),
      no_rekening: teks(debet, "no_rekening"),
      nama_rekening: teks(debet, "nama_rekening"),
    },
    format: format && (format as unknown as FormatSusun),
    tanggal_efektif,
  });
  const riwayat = await semua(client, RIWAYAT_UNDUH_SQL, [pilihan.run_id]);
  if (catat) {
    await tulis(client, CATAT_UNDUH_SQL, [
      idBaru("trf-"),
      pilihan.run_id,
      status,
      oleh,
      catatanUnduh(format?.nama ?? null, pilihan, susunan),
    ]);
  }
  return {
    run,
    debet: debet as unknown as RekeningTampil,
    format,
    susunan,
    riwayat,
    dicatat: catat,
  } as unknown as HasilBerkasTransfer;
}
