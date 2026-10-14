import type { Client } from "@libsql/client";

/**
 * Tagihan anak untuk portal wali (Fase K4c): HANYA BACA, dan hanya untuk satu
 * `id_siswa` yang datang dari SESI, tidak pernah dari permintaan.
 *
 * Sisa tagihan dan saldo titipan TIDAK disimpan di database; keduanya
 * diturunkan dengan rumus yang sama dengan panel admin (`DIBAYAR_SQL` dan
 * `SALDO_TITIPAN_SQL` di `web-desktop/src/lib/services/billing.ts`). Rumus yang
 * berbeda membuat wali melihat angka yang lain dari kuitansi di tangannya.
 */

/**
 * Setting tersinkron yang membuka halaman ini, cermin `PORTAL_WALI_TAGIHAN_KEY`
 * di `web-desktop/src/lib/validations/billing.ts`. Bawaannya mati: sekolah
 * memutuskan sendiri kapan data tagihannya cukup rapi untuk dilihat wali.
 */
export const PORTAL_WALI_TAGIHAN_KEY = "portal_wali_tagihan";

/** Riwayat kuitansi yang ditampilkan, dalam bulan. */
export const RIWAYAT_KUITANSI_BULAN = 12;

const TABEL_TAGIHAN = [
  "keu_tagihan",
  "keu_tagihan_batal",
  "keu_pembayaran",
  "keu_pembayaran_alokasi",
  "keu_pembayaran_batal",
];

/**
 * Halaman tagihan boleh tampil: modul tagihan sudah ada di database sekolah
 * ini DAN sekolah menyalakan sakelarnya. Tabelnya diperiksa di sini, bukan di
 * `REQUIRED_TABLES` global, dengan alasan yang sama dengan `modulNilaiTersedia`.
 */
export async function portalTagihanAktif(client: Client): Promise<boolean> {
  const hasil = await client.execute({
    sql: `SELECT
            (SELECT COUNT(*) FROM sqlite_master
              WHERE type = 'table' AND name IN (?, ?, ?, ?, ?)) AS tabel,
            (SELECT value FROM setting_gex_system WHERE key = ? LIMIT 1) AS sakelar;`,
    args: [...TABEL_TAGIHAN, PORTAL_WALI_TAGIHAN_KEY],
  });
  const baris = hasil.rows[0];
  return (
    Number(baris?.tabel ?? 0) === TABEL_TAGIHAN.length &&
    String(baris?.sakelar ?? "")
      .trim()
      .toLowerCase() === "true"
  );
}

const DIBAYAR = `SELECT a.id_tagihan, SUM(a.nominal) AS dibayar
     FROM keu_pembayaran_alokasi a
     JOIN keu_pembayaran p ON p.id_pembayaran = a.id_pembayaran
     LEFT JOIN keu_pembayaran_batal pb ON pb.id_pembayaran = p.id_pembayaran
     WHERE a.id_tagihan IS NOT NULL AND pb.id_pembayaran IS NULL
     GROUP BY a.id_tagihan
     -- batas: subquery yang di-JOIN ke tagihan, dibatasi kueri luarnya
     `;

export interface TunggakanAnak {
  namaTagihan: string;
  periode: string;
  jatuhTempo: string;
  sisa: number;
  terlambat: boolean;
}

export interface KuitansiAnak {
  tanggal: string;
  nomor: string;
  metode: string;
  total: number;
  dibatalkan: boolean;
}

export interface TagihanAnak {
  tunggakan: TunggakanAnak[];
  totalTunggakan: number;
  saldoTitipan: number;
  kuitansi: KuitansiAnak[];
}

export async function bacaTagihanAnak(
  client: Client,
  idSiswa: string,
): Promise<TagihanAnak> {
  const [tunggakan, titipan, kuitansi] = await Promise.all([
    client.execute({
      sql: `SELECT t.nama_tagihan, t.periode, t.jatuh_tempo,
                   t.nominal - t.potongan - COALESCE(d.dibayar, 0) AS sisa,
                   t.jatuh_tempo < date('now', '+7 hours') AS terlambat
              FROM keu_tagihan t
              LEFT JOIN keu_tagihan_batal b ON b.id_tagihan = t.id_tagihan
              LEFT JOIN (${DIBAYAR}) d ON d.id_tagihan = t.id_tagihan
             WHERE t.id_siswa = ? AND b.id_tagihan IS NULL
               AND t.nominal - t.potongan > COALESCE(d.dibayar, 0)
          ORDER BY t.jatuh_tempo, t.periode, t.id_tagihan
             LIMIT 500;`,
      args: [idSiswa],
    }),
    client.execute({
      sql: `SELECT COALESCE(SUM(CASE
                     WHEN p.metode = 'Titipan' THEN -a.nominal
                     WHEN a.id_tagihan IS NULL THEN a.nominal
                     ELSE 0 END), 0) AS saldo
              FROM keu_pembayaran p
              JOIN keu_pembayaran_alokasi a ON a.id_pembayaran = p.id_pembayaran
              LEFT JOIN keu_pembayaran_batal pb ON pb.id_pembayaran = p.id_pembayaran
             WHERE p.id_siswa = ? AND pb.id_pembayaran IS NULL
             -- batas: agregat, selalu satu baris
             ;`,
      args: [idSiswa],
    }),
    client.execute({
      sql: `SELECT p.tanggal, p.nomor, p.metode, p.total,
                   pb.id_pembayaran IS NOT NULL AS dibatalkan
              FROM keu_pembayaran p
              LEFT JOIN keu_pembayaran_batal pb ON pb.id_pembayaran = p.id_pembayaran
             WHERE p.id_siswa = ?
               AND p.tanggal >= date('now', '+7 hours', ?)
          ORDER BY p.tanggal DESC, p.nomor DESC
             LIMIT 200;`,
      args: [idSiswa, `-${RIWAYAT_KUITANSI_BULAN} months`],
    }),
  ]);

  const daftar = tunggakan.rows.map((baris) => ({
    namaTagihan: String(baris.nama_tagihan),
    periode: String(baris.periode),
    jatuhTempo: String(baris.jatuh_tempo ?? ""),
    sisa: Number(baris.sisa),
    terlambat: Number(baris.terlambat ?? 0) === 1,
  }));
  return {
    tunggakan: daftar,
    totalTunggakan: daftar.reduce((jumlah, item) => jumlah + item.sisa, 0),
    saldoTitipan: Number(titipan.rows[0]?.saldo ?? 0),
    kuitansi: kuitansi.rows.map((baris) => ({
      tanggal: String(baris.tanggal),
      nomor: String(baris.nomor),
      metode: String(baris.metode),
      total: Number(baris.total),
      dibatalkan: Number(baris.dibatalkan ?? 0) === 1,
    })),
  };
}

const NAMA_BULAN = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

/** Cermin `labelPeriode` panel admin: `2026-09` → `September 2026`. */
export function labelPeriode(periode: string): string {
  if (periode === "SEKALI") return "";
  const cocok = /^(\d{4})-(\d{2})$/.exec(periode);
  const bulan = cocok ? Number(cocok[2]) : 0;
  return cocok && bulan >= 1 && bulan <= 12
    ? `${NAMA_BULAN[bulan - 1]} ${cocok[1]}`
    : periode;
}

/** `2026-09-10` → `10/09/2026`. */
export function tanggalTampil(tanggal: string): string {
  const bagian = tanggal.split("-");
  return bagian.length === 3
    ? `${bagian[2]}/${bagian[1]}/${bagian[0]}`
    : tanggal;
}

export function rupiah(nilai: number): string {
  return `${nilai < 0 ? "-" : ""}Rp${Math.abs(nilai).toLocaleString("id-ID")}`;
}
