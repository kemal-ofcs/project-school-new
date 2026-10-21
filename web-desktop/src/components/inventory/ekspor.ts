import type { DownloadResult } from "@/lib/client/download";
import { readWorkbookTable, saveWorkbook } from "@/lib/client/xlsx";
import {
  type BarangInventaris,
  type DaftarInventaris,
  formatAngka,
  type KartuStok,
  type RekapPengadaan,
} from "@/lib/validations/inventory";
import {
  type BarisImporBarang,
  INVENTARIS_WORKBOOK_HEADERS,
  judulAsing,
  parseInventarisRows,
} from "@/lib/validations/inventory-import";
import type { ImportRow } from "@/lib/validations/personnel-import";

// Export dan import Excel inventaris. `saveWorkbook` sudah memilih jalur per platform:
// unduhan biasa di Web, dialog simpan di Desktop, dialog SAF di Android.

/**
 * Isi kolom tambahan yang aktif, berjudul nama kolomnya. Angka ditulis
 * berformat Indonesia (`1.250,5`): penulis xlsx menyimpan semua sel sebagai
 * teks, dan impor membaca sel teks dengan format yang sama.
 */
function isiKolomTambahan(
  data: DaftarInventaris,
  barang: BarangInventaris,
): Record<string, string> {
  return Object.fromEntries(
    data.kolom
      .filter((kolom) => kolom.is_aktif)
      .map((kolom) => {
        const isi = barang.atribut[kolom.id_kolom] ?? "";
        return [
          kolom.nama,
          kolom.tipe === "Angka" && isi ? formatAngka(isi) : isi,
        ];
      }),
  );
}

function judulKolomTambahan(data: DaftarInventaris): string[] {
  return data.kolom
    .filter((kolom) => kolom.is_aktif)
    .map((kolom) => kolom.nama);
}

export function eksporRekapStok(
  data: DaftarInventaris,
): Promise<DownloadResult> {
  const headers = [
    "Kode",
    "Nama barang",
    "Kategori",
    "Tipe",
    "Satuan",
    ...judulKolomTambahan(data),
    "Tempat",
    "Kondisi",
    "Kedaluwarsa",
    "Saldo",
  ];
  const rows = data.barang.flatMap((barang) =>
    barang.posisi.map((posisi) => ({
      Kode: barang.kode_barang,
      "Nama barang": barang.nama_barang,
      Kategori: barang.kategori ?? "",
      Tipe: barang.tipe,
      Satuan: barang.satuan,
      ...isiKolomTambahan(data, barang),
      Tempat: posisi.tempat,
      Kondisi: posisi.kondisi,
      Kedaluwarsa: posisi.tanggal_expired ?? "",
      Saldo: posisi.saldo,
    })),
  );
  return saveWorkbook({
    headers,
    rows,
    filename: `rekap-stok-${data.hari_ini}.xlsx`,
    sheetName: "Rekap Stok",
  });
}

/**
 * Template impor yang sudah berisi semua barang beserta kodenya, sehingga
 * mengubah massal cukup unduh, sunting, lalu impor kembali.
 */
export function unduhTemplateBarang(
  data: DaftarInventaris,
): Promise<DownloadResult> {
  const rows = data.barang.map((barang) => ({
    Kode: barang.kode_barang,
    "Nama barang": barang.nama_barang,
    Kategori: barang.kategori ?? "",
    Tipe: barang.tipe,
    Satuan: barang.satuan,
    "Bisa kedaluwarsa": barang.bisa_expired ? "Ya" : "Tidak",
    "Stok minimum": barang.stok_minimum,
    "Tempat utama": barang.tempat_utama ?? "",
    Catatan: barang.catatan ?? "",
    ...isiKolomTambahan(data, barang),
  }));
  // Kolom tambahan di antara data barang dan kolom saldo awal.
  const akhirDataBarang = INVENTARIS_WORKBOOK_HEADERS.indexOf("Catatan") + 1;
  return saveWorkbook({
    headers: [
      ...INVENTARIS_WORKBOOK_HEADERS.slice(0, akhirDataBarang),
      ...judulKolomTambahan(data),
      ...INVENTARIS_WORKBOOK_HEADERS.slice(akhirDataBarang),
    ],
    rows,
    filename: `template-barang-${data.hari_ini}.xlsx`,
    sheetName: "Barang",
  });
}

export async function bacaImporBarang(
  file: File,
  data: DaftarInventaris,
): Promise<{ baris: ImportRow<BarisImporBarang>[]; judulAsing: string[] }> {
  const { rows, selAngka } = await readWorkbookTable(file);
  return {
    baris: parseInventarisRows(
      rows,
      data.barang,
      data.hari_ini,
      data.kolom,
      selAngka,
    ),
    judulAsing: judulAsing(rows[0] ?? [], data.kolom),
  };
}

export function eksporKartuStok(
  barang: BarangInventaris,
  kartu: KartuStok,
  dari: string,
  sampai: string,
): Promise<DownloadResult> {
  const headers = [
    "Tanggal",
    "Jenis",
    "Alasan",
    "Dari",
    "Ke",
    "Penerima",
    "Keperluan",
    "Masuk",
    "Keluar",
    "Saldo",
    "Nomor dokumen",
    "Dicatat oleh",
    "Status",
  ];
  const rows: Record<string, unknown>[] = [
    {
      Tanggal: `Sebelum ${dari}`,
      Alasan: "Saldo awal",
      Saldo: kartu.saldo_awal,
    },
    ...kartu.baris.map((baris) => ({
      Tanggal: baris.tanggal,
      Jenis: baris.jenis,
      Alasan: baris.alasan,
      Dari: baris.tempat_asal ?? "",
      Ke: baris.tempat_tujuan ?? "",
      Penerima: baris.penerima_nama ?? "",
      Keperluan: baris.keperluan ?? "",
      Masuk: baris.masuk || "",
      Keluar: baris.keluar || "",
      Saldo: baris.saldo,
      "Nomor dokumen": baris.nomor_dokumen ?? "",
      "Dicatat oleh": baris.dicatat_oleh,
      Status: baris.dibatalkan ? "Dibatalkan" : "",
    })),
  ];
  return saveWorkbook({
    headers,
    rows,
    filename: `kartu-stok-${barang.kode_barang}-${dari}-${sampai}.xlsx`,
    sheetName: "Kartu Stok",
  });
}

/** Rincian per baris, ditutup baris total per sumber dana dan total keseluruhan. */
export function eksporPengadaan(
  rekap: RekapPengadaan,
  dari: string,
  sampai: string,
): Promise<DownloadResult> {
  const headers = [
    "Sumber dana",
    "Tanggal",
    "Kode",
    "Nama barang",
    "Alasan",
    "Jumlah",
    "Satuan",
    "Harga satuan",
    "Nilai",
    "Nomor dokumen",
    "Disimpan di",
  ];
  const rows: Record<string, unknown>[] = rekap.baris.map((baris) => ({
    "Sumber dana": baris.sumber_dana || "Tanpa sumber dana",
    Tanggal: baris.tanggal,
    Kode: baris.kode_barang,
    "Nama barang": baris.nama_barang,
    Alasan: baris.alasan,
    Jumlah: baris.jumlah,
    Satuan: baris.satuan,
    "Harga satuan": baris.harga_satuan ?? "",
    Nilai: baris.harga_satuan === null ? "" : baris.nilai,
    "Nomor dokumen": baris.nomor_dokumen ?? "",
    "Disimpan di": baris.tempat_tujuan ?? "",
  }));
  rows.push({});
  for (const item of rekap.rekap) {
    rows.push({
      "Sumber dana": `Total ${item.sumber_dana}`,
      Nilai: item.nilai,
      "Nomor dokumen":
        item.tanpa_harga > 0 ? `${item.tanpa_harga} baris tanpa harga` : "",
    });
  }
  rows.push({ "Sumber dana": "Total keseluruhan", Nilai: rekap.total_nilai });
  return saveWorkbook({
    headers,
    rows,
    filename: `rekap-pengadaan-${dari}-${sampai}.xlsx`,
    sheetName: "Rekap Pengadaan",
  });
}
