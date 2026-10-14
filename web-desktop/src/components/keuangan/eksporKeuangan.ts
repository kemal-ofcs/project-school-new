import { type DownloadResult, saveFileWithPicker } from "@/lib/client/download";
import { saveWorkbook } from "@/lib/client/xlsx";
import type {
  BukuBesar,
  LaporanAktivitas,
  LaporanArusKas,
  LaporanPosisiKeuangan,
  NeracaSaldo,
} from "@/lib/gateways/accounting";
import type { RekapPenerimaan, RekapRombel } from "@/lib/gateways/billing";
import { formatRupiah } from "@/lib/validations/accounting";
import { labelPeriode } from "@/lib/validations/billing";

/**
 * Laporan keuangan dalam bentuk tabel tunggal (Fase K4a). Layar, Excel, dan
 * PDF memakai baris yang sama dari fungsi `tabel*`, jadi ketiganya tidak bisa
 * menampilkan angka yang berbeda. Dipakai Web/Desktop dan Mobile (disalin
 * lewat `filesToCopy`).
 */

export interface BarisTabel {
  jenis: "bagian" | "akun" | "total";
  label: string;
  kode?: string;
  jumlah?: number;
}

export interface TabelLaporan {
  judul: string;
  periode: string;
  baris: BarisTabel[];
  /** Pesan yang wajib terlihat, misalnya laporan yang timpang. */
  peringatan: string | null;
  /** Keterangan netral di bawah periode, misalnya "sudah ditutup". */
  keterangan?: string;
}

function tanggal(teks: string): string {
  const [tahun, bulan, hari] = teks.split("-");
  return hari && bulan && tahun ? `${hari}/${bulan}/${tahun}` : teks;
}

function akunBaris(
  daftar: ReadonlyArray<{ kode: string; nama: string; saldo: number }>,
): BarisTabel[] {
  return daftar.map((a) => ({
    jenis: "akun",
    kode: a.kode,
    label: a.nama,
    jumlah: a.saldo,
  }));
}

export function tabelPosisi(d: LaporanPosisiKeuangan): TabelLaporan {
  return {
    judul: "Laporan Posisi Keuangan",
    periode: `Per ${tanggal(d.sampai)}`,
    baris: [
      { jenis: "bagian", label: "Aset" },
      ...akunBaris(d.aset),
      { jenis: "total", label: "Jumlah aset", jumlah: d.total_aset },
      { jenis: "bagian", label: "Kewajiban" },
      ...akunBaris(d.kewajiban),
      { jenis: "total", label: "Jumlah kewajiban", jumlah: d.total_kewajiban },
      { jenis: "bagian", label: "Aset neto" },
      ...akunBaris(d.aset_neto),
      {
        jenis: "akun",
        label: "Surplus (defisit) akumulasi",
        jumlah: d.surplus_akumulasi,
      },
      { jenis: "total", label: "Jumlah aset neto", jumlah: d.total_aset_neto },
      {
        jenis: "total",
        label: "Jumlah kewajiban dan aset neto",
        jumlah: d.total_kewajiban + d.total_aset_neto,
      },
    ],
    peringatan:
      d.selisih === 0
        ? null
        : `Laporan tidak seimbang: aset berselisih ${formatRupiah(d.selisih)} dari kewajiban dan aset neto. Biasanya sebagian baris jurnal belum selesai tersinkron ke perangkat ini. Jalankan sinkronisasi lalu buka lagi.`,
  };
}

export function tabelAktivitas(d: LaporanAktivitas): TabelLaporan {
  return {
    judul: "Laporan Penghasilan Komprehensif",
    periode: `${tanggal(d.dari)} s.d. ${tanggal(d.sampai)}`,
    baris: [
      { jenis: "bagian", label: "Pendapatan" },
      ...akunBaris(d.pendapatan),
      {
        jenis: "total",
        label: "Jumlah pendapatan",
        jumlah: d.total_pendapatan,
      },
      { jenis: "bagian", label: "Beban" },
      ...akunBaris(d.beban),
      { jenis: "total", label: "Jumlah beban", jumlah: d.total_beban },
      { jenis: "total", label: "Surplus (defisit)", jumlah: d.surplus },
    ],
    peringatan: null,
  };
}

/**
 * Setiap kelompok tampil sekali, di sisi arah bersihnya: pembatalan
 * pembayaran mengurangi baris "Penerimaan pembayaran siswa", dan pindah dana
 * antarakun kas yang sama-sama dipilih saling meniadakan.
 */
export function tabelArusKas(d: LaporanArusKas): TabelLaporan {
  const masuk = d.kelompok.filter((k) => k.bersih > 0);
  const keluar = d.kelompok.filter((k) => k.bersih < 0);
  const totalMasuk = masuk.reduce((n, k) => n + k.bersih, 0);
  const totalKeluar = keluar.reduce((n, k) => n - k.bersih, 0);
  return {
    judul: "Laporan Arus Kas",
    periode: `${tanggal(d.dari)} s.d. ${tanggal(d.sampai)}, akun ${d.akun_kas
      .map((a) => a.nama)
      .join(", ")}`,
    baris: [
      { jenis: "bagian", label: "Penerimaan kas" },
      ...masuk.map((k) => ({
        jenis: "akun" as const,
        label: k.label,
        jumlah: k.bersih,
      })),
      { jenis: "total", label: "Jumlah penerimaan", jumlah: totalMasuk },
      { jenis: "bagian", label: "Pengeluaran kas" },
      ...keluar.map((k) => ({
        jenis: "akun" as const,
        label: k.label,
        jumlah: -k.bersih,
      })),
      { jenis: "total", label: "Jumlah pengeluaran", jumlah: totalKeluar },
      {
        jenis: "total",
        label: "Kenaikan (penurunan) kas",
        jumlah: totalMasuk - totalKeluar,
      },
      { jenis: "akun", label: "Saldo awal kas", jumlah: d.saldo_awal },
      { jenis: "total", label: "Saldo akhir kas", jumlah: d.saldo_akhir },
    ],
    peringatan: null,
  };
}

function namaBerkas(judul: string, periode: string, ekstensi: string): string {
  return `${judul}-${periode}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80)
    .concat(`.${ekstensi}`);
}

export function eksporTabelExcel(t: TabelLaporan): Promise<DownloadResult> {
  const headers = ["Keterangan", "Kode", "Jumlah"];
  const rows: Record<string, unknown>[] = [
    { Keterangan: t.judul },
    { Keterangan: t.periode },
    ...(t.keterangan ? [{ Keterangan: t.keterangan }] : []),
    {},
    ...t.baris.map((b) => ({
      Keterangan: b.jenis === "akun" ? `  ${b.label}` : b.label,
      Kode: b.kode ?? "",
      Jumlah: b.jumlah ?? null,
    })),
  ];
  if (t.peringatan) rows.push({}, { Keterangan: t.peringatan });
  return saveWorkbook({
    headers,
    rows,
    filename: namaBerkas(t.judul, t.periode, "xlsx"),
    sheetName: t.judul.replace(/^Laporan /, ""),
  });
}

/** Isi PDF satu laporan. Dipisah dari penyimpanan supaya bisa diuji. */
export async function buatTabelPdf(t: TabelLaporan): Promise<ArrayBuffer> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(t.judul, 14, 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(doc.splitTextToSize(t.periode, 180) as string[], 14, 22);
  if (t.keterangan) {
    doc.text(doc.splitTextToSize(t.keterangan, 180) as string[], 14, 27);
  }
  autoTable(doc, {
    head: [["Keterangan", "Kode", "Jumlah"]],
    body: t.baris.map((b) => [
      b.jenis === "akun" ? `    ${b.label}` : b.label,
      b.kode ?? "",
      b.jumlah === undefined ? "" : formatRupiah(b.jumlah),
    ]),
    startY: t.keterangan ? 34 : 30,
    theme: "plain",
    styles: { fontSize: 9, cellPadding: 1.4 },
    headStyles: { fontStyle: "bold", lineWidth: { bottom: 0.3 } },
    columnStyles: {
      1: { cellWidth: 24 },
      2: { halign: "right", cellWidth: 45 },
    },
    didParseCell: (cell) => {
      const baris = t.baris[cell.row.index];
      if (cell.section === "body" && baris && baris.jenis !== "akun") {
        cell.cell.styles.fontStyle = "bold";
      }
    },
    margin: { left: 14, right: 14 },
  });
  if (t.peringatan) {
    const akhir =
      (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
        ?.finalY ?? 30;
    doc.setFontSize(9);
    doc.text(doc.splitTextToSize(t.peringatan, 180) as string[], 14, akhir + 8);
  }
  return doc.output("arraybuffer");
}

export async function unduhTabelPdf(t: TabelLaporan): Promise<DownloadResult> {
  return saveFileWithPicker(
    new Blob([await buatTabelPdf(t)], { type: "application/pdf" }),
    namaBerkas(t.judul, t.periode, "pdf"),
    {
      description: "Dokumen PDF (*.pdf)",
      accept: { "application/pdf": [".pdf"] },
    },
  );
}

export function eksporBukuBesar(
  data: BukuBesar,
  dari: string,
  sampai: string,
): Promise<DownloadResult> {
  const headers = [
    "Tanggal",
    "Nomor",
    "Keterangan",
    "Debit",
    "Kredit",
    "Saldo",
  ];
  const rows: Record<string, unknown>[] = [
    { Tanggal: `Buku besar ${data.akun.kode} ${data.akun.nama}` },
    { Tanggal: `${tanggal(dari)} s.d. ${tanggal(sampai)}` },
    {},
    { Keterangan: "Saldo awal", Saldo: data.saldo_awal },
    ...data.baris.map((b) => ({
      Tanggal: b.tanggal,
      Nomor: b.nomor,
      Keterangan: b.keterangan,
      Debit: b.debit,
      Kredit: b.kredit,
      Saldo: b.saldo,
    })),
    {
      Keterangan: "Jumlah",
      Debit: data.total_debit,
      Kredit: data.total_kredit,
      Saldo: data.saldo_akhir,
    },
  ];
  if (data.terpotong) {
    rows.push(
      {},
      {
        Tanggal:
          "Daftar baris terpotong; saldo akhir tetap dihitung dari seluruh jurnal.",
      },
    );
  }
  return saveWorkbook({
    headers,
    rows,
    filename: namaBerkas(
      `buku-besar-${data.akun.kode}`,
      `${dari}-${sampai}`,
      "xlsx",
    ),
    sheetName: "Buku Besar",
  });
}

export function eksporNeracaSaldo(
  data: NeracaSaldo,
  sampai: string,
): Promise<DownloadResult> {
  const headers = ["Kode", "Akun", "Kelompok", "Debit", "Kredit"];
  const rows: Record<string, unknown>[] = [
    { Kode: `Neraca saldo per ${tanggal(sampai)}` },
    {},
    ...data.items.map((i) => ({
      Kode: i.kode,
      Akun: i.nama,
      Kelompok: i.kelompok,
      Debit: i.debit,
      Kredit: i.kredit,
    })),
    { Akun: "Jumlah", Debit: data.total_debit, Kredit: data.total_kredit },
  ];
  return saveWorkbook({
    headers,
    rows,
    filename: namaBerkas("neraca-saldo", sampai, "xlsx"),
    sheetName: "Neraca Saldo",
  });
}

// ── Tabel banyak kolom: rekap tagihan dan penerimaan ────────────────────────

/** Sel angka ditulis sebagai rupiah di layar dan PDF, angka mentah di Excel. */
export type SelLebar = string | { rupiah: number } | { persen: number };

export interface TabelLebar {
  judul: string;
  /** Nama sheet Excel, paling banyak 31 karakter dan tidak terpotong. */
  lembar: string;
  periode: string;
  kolom: string[];
  baris: Array<{ sel: SelLebar[]; tebal?: boolean }>;
  /** Kalimat yang wajib ikut di bawah tabel, termasuk waktu cetak. */
  catatan: string[];
}

export function teksSel(sel: SelLebar): string {
  if (typeof sel === "string") return sel;
  return "rupiah" in sel ? formatRupiah(sel.rupiah) : `${sel.persen}%`;
}

function nilaiExcel(sel: SelLebar): string | number {
  if (typeof sel === "string") return sel;
  return "rupiah" in sel ? sel.rupiah : sel.persen;
}

const BULAN_PENDEK = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
];

function labelBulan(bulan: string): string {
  const [tahun, nomor] = bulan.split("-");
  return `${BULAN_PENDEK[Number(nomor) - 1] ?? nomor} ${tahun}`;
}

export function tabelRekapRombel(
  d: RekapRombel,
  namaJenis: string | null,
): TabelLebar {
  const sel = (b: RekapRombel["total"]): SelLebar[] => [
    b.nama,
    String(b.siswa),
    { rupiah: b.ditagih },
    { rupiah: b.terbayar },
    { rupiah: b.sisa },
    { persen: b.persen },
    String(b.menunggak),
  ];
  return {
    judul: "Rekap Tagihan per Rombel",
    lembar: "Rekap per Rombel",
    periode: `Periode ${labelPeriode(d.periode) || "sekali bayar"}${namaJenis ? `, ${namaJenis}` : ", semua jenis"}`,
    kolom: [
      "Rombel",
      "Siswa ditagih",
      "Ditagih",
      "Terbayar",
      "Sisa",
      "Terkumpul",
      "Siswa menunggak",
    ],
    baris: [
      ...d.baris.map((b) => ({ sel: sel(b) })),
      { sel: sel(d.total), tebal: true },
    ],
    catatan: [
      "Rombel mengikuti kelas siswa saat ini. Tagihan yang dibatalkan tidak dihitung.",
      `Dihitung ${d.dicetak} WIB.`,
    ],
  };
}

export function tabelPenerimaan(d: RekapPenerimaan): TabelLebar {
  const baris = (
    nama: string,
    perBulan: number[],
    total: number,
    tebal = false,
  ) => ({
    sel: [
      nama,
      ...perBulan.map((n) => ({ rupiah: n })),
      { rupiah: total },
    ] as SelLebar[],
    tebal,
  });
  const isi = [
    ...d.kas.map((b) => baris(b.nama, b.per_bulan, b.total)),
    baris("Jumlah penerimaan kas", d.total_per_bulan, d.total, true),
  ];
  if (d.dipakai_titipan.length > 0) {
    isi.push(
      {
        sel: ["Dipakai dari titipan (tidak termasuk penerimaan kas)"],
        tebal: true,
      },
      ...d.dipakai_titipan.map((b) => baris(b.nama, b.per_bulan, b.total)),
      baris(
        "Jumlah dipakai dari titipan",
        d.dipakai_per_bulan,
        d.total_dipakai,
        true,
      ),
    );
  }
  return {
    judul: "Penerimaan Pembayaran Siswa per Bulan",
    lembar: "Penerimaan per Bulan",
    periode: `${labelBulan(d.bulan[0] ?? "")} s.d. ${labelBulan(d.bulan[d.bulan.length - 1] ?? "")}, menurut tanggal kuitansi`,
    kolom: ["Jenis", ...d.bulan.map(labelBulan), "Jumlah"],
    baris: isi,
    catatan: [
      "Kuitansi yang dibatalkan tidak dihitung. Pembayaran dari titipan tidak masuk penerimaan kas karena uangnya sudah terhitung saat titipan diterima.",
      `Dihitung ${d.dicetak} WIB.`,
    ],
  };
}

export function eksporLebarExcel(t: TabelLebar): Promise<DownloadResult> {
  const pertama = t.kolom[0] ?? "Keterangan";
  const rows: Record<string, unknown>[] = [
    { [pertama]: t.judul },
    { [pertama]: t.periode },
    {},
    ...t.baris.map((b) =>
      Object.fromEntries(
        b.sel.map((sel, i) => [t.kolom[i] ?? "", nilaiExcel(sel)]),
      ),
    ),
    {},
    ...t.catatan.map((c) => ({ [pertama]: c })),
  ];
  return saveWorkbook({
    headers: t.kolom,
    rows,
    filename: namaBerkas(t.judul, t.periode, "xlsx"),
    sheetName: t.lembar,
  });
}

/** Isi PDF tabel lebar; mendatar bila kolomnya lebih dari delapan. */
export async function buatLebarPdf(t: TabelLebar): Promise<ArrayBuffer> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const mendatar = t.kolom.length > 8;
  const doc = new jsPDF({
    unit: "mm",
    format: "a4",
    orientation: mendatar ? "landscape" : "portrait",
  });
  const lebar = mendatar ? 269 : 182;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(t.judul, 14, 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(doc.splitTextToSize(t.periode, lebar) as string[], 14, 22);
  autoTable(doc, {
    head: [t.kolom],
    body: t.baris.map((b) => b.sel.map(teksSel)),
    startY: 28,
    theme: "plain",
    styles: { fontSize: mendatar ? 7 : 9, cellPadding: 1.2 },
    headStyles: { fontStyle: "bold", lineWidth: { bottom: 0.3 } },
    didParseCell: (cell) => {
      if (cell.column.index > 0) cell.cell.styles.halign = "right";
      if (cell.section === "body" && t.baris[cell.row.index]?.tebal) {
        cell.cell.styles.fontStyle = "bold";
      }
    },
    margin: { left: 14, right: 14 },
  });
  const akhir =
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
      ?.finalY ?? 28;
  doc.setFontSize(8);
  doc.text(
    doc.splitTextToSize(t.catatan.join(" "), lebar) as string[],
    14,
    akhir + 6,
  );
  return doc.output("arraybuffer");
}

export async function unduhLebarPdf(t: TabelLebar): Promise<DownloadResult> {
  return saveFileWithPicker(
    new Blob([await buatLebarPdf(t)], { type: "application/pdf" }),
    namaBerkas(t.judul, t.periode, "pdf"),
    {
      description: "Dokumen PDF (*.pdf)",
      accept: { "application/pdf": [".pdf"] },
    },
  );
}
