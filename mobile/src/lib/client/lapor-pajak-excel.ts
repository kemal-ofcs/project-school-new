"use client";

/**
 * Excel rekap PPh 21, BPJS, dan A1 (HRIS Fase 8b, §26.2.2). Rekap saja, bukan
 * template impor Coretax/e-Bupot/SIPP: format resmi hanya dibangun dari
 * template yang diberikan pemilik (Q-154). Angka ditulis sebagai sel Angka;
 * NIK, NPWP, dan nomor BPJS sebagai teks supaya nol depan tidak hilang.
 */
import {
  type BarisA1,
  type DataPemotong,
  type HasilLaporan,
  LABEL_TANDA_LAPOR,
  type RekapA1,
  type RekapBpjs,
  type RekapPph,
  type RunBelumDibayar,
  type TandaLapor,
} from "@/lib/validations/lapor-pajak";
import { AngkaExcel, type LembarXlsx } from "./xlsx";

const n = (v: number | null) => (v === null ? "" : new AngkaExcel(v));
const tanda = (daftar: readonly TandaLapor[]) =>
  daftar.map((t) => LABEL_TANDA_LAPOR[t]).join("; ");

function keterangan(
  judul: string,
  periode: string,
  pemotong: DataPemotong,
  ringkasan: [string, unknown][],
  belum: readonly RunBelumDibayar[],
): LembarXlsx {
  return {
    nama: "Keterangan",
    headers: ["Keterangan", "Isi"],
    lebar: [36, 40],
    rows: [
      ["Laporan", judul],
      ["Periode", periode],
      ["NPWP pemotong", pemotong.npwp],
      ["NITKU", pemotong.nitku],
      ["Nama penandatangan", pemotong.nama_penandatangan],
      ["NIK penandatangan", pemotong.nik_penandatangan],
      [
        "No. pendaftaran BPJS Ketenagakerjaan",
        pemotong.no_bpjs_ketenagakerjaan,
      ],
      ["No. pendaftaran BPJS Kesehatan", pemotong.no_bpjs_kesehatan],
      ...ringkasan,
      [
        "Run belum dibayar (tidak dihitung)",
        belum.map((r) => `${r.id} (${r.status}, ${r.period_start})`).join("; "),
      ],
      ["Sumber", "Angka dibekukan slip gaji run PAID; tidak dihitung ulang."],
    ],
  };
}

export function lembarRekapPph(h: HasilLaporan<RekapPph>): LembarXlsx[] {
  const r = h.rekap;
  return [
    {
      nama: "PPh 21",
      headers: [
        "No",
        "NIK",
        "NPWP",
        "Nama",
        "Kode",
        "PTKP",
        "Status",
        "Metode",
        "Kategori TER",
        "Bruto",
        "PPh 21 dipotong",
        "Jumlah run",
        "Tanda",
      ],
      lebar: [5, 20, 20, 28, 10, 8, 12, 20, 12, 16, 16, 10, 40],
      kolomBeku: 4,
      rows: r.baris.map((b, i) => [
        new AngkaExcel(i + 1),
        b.nik,
        b.npwp,
        b.nama_karyawan,
        b.kode_karyawan,
        b.ptkp_status,
        b.status === "tetap" ? "Tetap" : "Tidak tetap",
        b.metode ?? "",
        b.kategori ?? "",
        n(b.bruto),
        n(b.pph),
        n(b.jumlah_run),
        tanda(b.tanda),
      ]),
    },
    keterangan(
      "Rekap PPh 21 bulanan",
      r.masa,
      h.pemotong,
      [
        ["Jumlah pegawai", n(r.baris.length)],
        ["Jumlah run", n(r.jumlah_run)],
        ["Total bruto", n(r.total_bruto)],
        ["Total PPh 21 dipotong", n(r.total_pph)],
      ],
      r.run_belum_dibayar,
    ),
  ];
}

export function lembarRekapBpjs(h: HasilLaporan<RekapBpjs>): LembarXlsx[] {
  const r = h.rekap;
  const kode = r.kode.map((k) => k.code);
  return [
    {
      nama: "BPJS",
      headers: [
        "No",
        "NIK",
        "Nama",
        "Kode",
        "No. BPJS Ketenagakerjaan",
        "No. BPJS Kesehatan",
        "Dasar upah",
        ...r.kode.map((k) => (k.name ? `${k.name} (${k.code})` : k.code)),
        "Total pekerja",
        "Total sekolah",
        "Jumlah run",
        "Tanda",
      ],
      kolomBeku: 3,
      rows: r.baris.map((b, i) => [
        new AngkaExcel(i + 1),
        b.nik,
        b.nama_karyawan,
        b.kode_karyawan,
        b.no_bpjs_ketenagakerjaan,
        b.no_bpjs_kesehatan,
        n(b.dasar),
        ...kode.map((k) => n(b.iuran[k] ?? 0)),
        n(b.pekerja),
        n(b.perusahaan),
        n(b.jumlah_run),
        tanda(b.tanda),
      ]),
    },
    keterangan(
      "Rekap iuran BPJS bulanan",
      r.masa,
      h.pemotong,
      [
        ["Jumlah pegawai", n(r.baris.length)],
        ["Jumlah run", n(r.jumlah_run)],
        ["Total dasar upah", n(r.total_dasar)],
        ["Total iuran pekerja", n(r.total_pekerja)],
        ["Total iuran sekolah", n(r.total_perusahaan)],
      ],
      r.run_belum_dibayar,
    ),
  ];
}

const angkaA1 = (b: BarisA1, v: number | null) => (b.a1 ? n(v) : "");

export function lembarRekapA1(h: HasilLaporan<RekapA1>): LembarXlsx[] {
  const r = h.rekap;
  return [
    {
      nama: "A1",
      headers: [
        "No",
        "NIK",
        "NPWP",
        "Nama",
        "Kode",
        "PTKP",
        "Status",
        "Masa awal",
        "Masa akhir",
        "Jumlah masa",
        "Bruto (slip PAID)",
        "PPh 21 dipotong",
        "Bruto setahun",
        "Biaya jabatan",
        "Iuran pensiun",
        "PTKP (Rp)",
        "PKP",
        "PPh 21 setahun",
        "Tanda",
      ],
      kolomBeku: 4,
      rows: r.baris.map((b, i) => [
        new AngkaExcel(i + 1),
        b.nik,
        b.npwp,
        b.nama_karyawan,
        b.kode_karyawan,
        b.ptkp_status,
        b.a1 ? "Tetap" : "Tidak tetap (tanpa A1)",
        b.masa_awal,
        b.masa_akhir,
        n(b.jumlah_masa),
        n(b.bruto),
        n(b.pph_dipotong),
        angkaA1(b, b.bruto_tahun),
        angkaA1(b, b.biaya_jabatan),
        angkaA1(b, b.iuran_pensiun),
        angkaA1(b, b.ptkp),
        angkaA1(b, b.pkp),
        angkaA1(b, b.pph_setahun),
        tanda(b.tanda),
      ]),
    },
    keterangan(
      "Rekap A1 tahunan (bahan, bukan formulir resmi)",
      r.tahun,
      h.pemotong,
      [
        ["Jumlah pegawai", n(r.baris.length)],
        ["Pegawai tetap (A1)", n(r.jumlah_a1)],
        ["Jumlah run", n(r.jumlah_run)],
        ["Total bruto", n(r.total_bruto)],
        ["Total PPh 21 dipotong", n(r.total_pph)],
      ],
      r.run_belum_dibayar,
    ),
  ];
}
