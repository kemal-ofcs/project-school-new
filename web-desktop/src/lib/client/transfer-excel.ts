"use client";

/**
 * Berkas transfer gaji (HRIS Fase 8, §26.2.1) dari hasil `unduhTransfer`.
 * Tanpa format = Excel umum (Transfer, Perlu dibayar manual, Ringkasan).
 * Format kustom CSV/TXT lewat `renderTeks`, XLSX lewat `selFormat`, jadi isi
 * berkas sama dengan pratinjau. Nomor rekening selalu teks (nol depan).
 */
import {
  type BarisTransfer,
  type HasilBerkasTransfer,
  LABEL_JENIS_TRANSFER,
  LABEL_TANDA_TRANSFER,
  renderTeks,
  selFormat,
} from "@/lib/validations/transfer";
import { AngkaExcel, createXlsxWorkbook, type LembarXlsx } from "./xlsx";

export const MIME_XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const n = (v: number) => new AngkaExcel(v);
const tanda = (r: BarisTransfer) =>
  r.tanda.map((t) => LABEL_TANDA_TRANSFER[t]).join("; ");

function lembarBaris(nama: string, baris: readonly BarisTransfer[]) {
  return {
    nama,
    headers: [
      "No",
      "Kode",
      "Nama pegawai",
      "Bank",
      "Kode bank",
      "Nomor rekening",
      "Nama pemilik rekening",
      "Jenis",
      "Nominal",
      "Tanda",
    ],
    lebar: [5, 10, 28, 20, 9, 20, 28, 12, 14, 40],
    kolomBeku: 3,
    rows: baris.map((r, i) => [
      n(r.nomor_urut ?? i + 1),
      r.kode_karyawan,
      r.nama_karyawan,
      r.nama_bank,
      r.kode_bank,
      r.no_rekening,
      r.nama_rekening,
      r.jenis ? LABEL_JENIS_TRANSFER[r.jenis] : "",
      n(r.nominal),
      tanda(r),
    ]),
  } satisfies LembarXlsx;
}

/** Excel umum: selalu tersedia, juga sebagai daftar bayar manual. */
export function lembarTransferUmum(h: HasilBerkasTransfer): LembarXlsx[] {
  const s = h.susunan;
  const r = s.ringkasan;
  return [
    lembarBaris("Transfer", s.baris),
    lembarBaris("Perlu dibayar manual", [...s.manual, ...s.luar_cakupan]),
    {
      nama: "Ringkasan",
      headers: ["Keterangan", "Jumlah", "Total"],
      lebar: [40, 10, 18],
      rows: [
        ["Proses gaji", h.run.id, ""],
        ["Periode", `${h.run.period_start} s.d. ${h.run.period_end}`, ""],
        ["Status proses gaji", h.run.status, ""],
        [
          "Rekening debet",
          `${h.debet.nama_bank} ${h.debet.no_rekening} a.n. ${h.debet.nama_rekening}`,
          "",
        ],
        ["Tanggal efektif", s.tanggal_efektif, ""],
        ["Berita", s.berita, ""],
        ["Masuk berkas", n(r.jumlah_baris), n(r.total)],
        ...r.per_bank.map((b) => [
          `Bank ${b.nama_bank}`,
          n(b.jumlah),
          n(b.total),
        ]),
        [
          LABEL_JENIS_TRANSFER.sesama,
          n(r.per_jenis.sesama.jumlah),
          n(r.per_jenis.sesama.total),
        ],
        [
          LABEL_JENIS_TRANSFER.antarbank,
          n(r.per_jenis.antarbank.jumlah),
          n(r.per_jenis.antarbank.total),
        ],
        ["Perlu dibayar manual", n(r.jumlah_manual), n(r.total_manual)],
        [
          "Di luar cakupan format",
          n(r.jumlah_luar_cakupan),
          n(r.total_luar_cakupan),
        ],
        ["Total gaji bersih proses gaji", "", n(r.total_run)],
        ["Selisih (belum masuk berkas)", "", n(r.selisih)],
      ],
    },
  ];
}

const amanNama = (t: string) =>
  t.replace(/[^A-Za-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "berkas";

/** Isi berkas dan namanya; dipanggil sesudah `unduhTransfer` mencatat jejak. */
export function berkasTransfer(h: HasilBerkasTransfer): {
  blob: Blob;
  nama: string;
  mime: string;
} {
  const dasar = `transfer-${amanNama(h.run.id)}-${h.susunan.tanggal_efektif}`;
  const f = h.format;
  if (!f || !f.kolom) {
    return {
      blob: new Blob(
        [createXlsxWorkbook(lembarTransferUmum(h)) as unknown as BlobPart],
        { type: MIME_XLSX },
      ),
      nama: `${dasar}.xlsx`,
      mime: MIME_XLSX,
    };
  }
  const nama = `${dasar}-${amanNama(f.nama)}`;
  if (f.jenis === "xlsx") {
    const { judul, baris } = selFormat(h.susunan, { kolom: f.kolom });
    const kolom = f.kolom;
    const isi = createXlsxWorkbook([
      {
        nama: "Transfer",
        headers: judul,
        tanpaJudul: f.pakai_judul !== 1,
        rows: baris.map((sel) =>
          sel.map((v, i) =>
            kolom[i]?.isian === "nominal" || kolom[i]?.isian === "nomor_urut"
              ? n(Number(v))
              : v,
          ),
        ),
      },
    ]);
    return {
      blob: new Blob([isi as unknown as BlobPart], { type: MIME_XLSX }),
      nama: `${nama}.xlsx`,
      mime: MIME_XLSX,
    };
  }
  const mime = f.jenis === "csv" ? "text/csv" : "text/plain";
  return {
    blob: new Blob([renderTeks(h.susunan, { ...f, kolom: f.kolom })], {
      type: `${mime};charset=utf-8`,
    }),
    nama: `${nama}.${f.jenis}`,
    mime,
  };
}
