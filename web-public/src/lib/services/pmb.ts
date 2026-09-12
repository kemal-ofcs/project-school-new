import type { Client, InStatement } from "@libsql/client";
import {
  buatIdBerkas,
  buatIdPendaftar,
  buatNomorPendaftaran,
  type MasukanCekStatus,
  type MasukanPendaftaran,
} from "@/lib/validations/pmb";

/**
 * Penulisan dan pembacaan PMB.
 *
 * Ketiga tabelnya CLOUD-ONLY: tidak pernah masuk `SNAPSHOT_TABLES`, tidak
 * pernah ada di SQLite perangkat, tidak pernah melewati outbox. Konsekuensinya
 * fitur ini MENUNTUT JARINGAN — dan setiap layar yang membacanya wajib
 * mengatakan itu, bukan menampilkan daftar kosong.
 *
 * Seluruh stempel waktu dihitung SQLite (`datetime('now')`), tidak pernah
 * `new Date().toISOString()`. Baris yang sama bisa dibaca panel admin yang
 * ditulis Rust, dan dua sumber jam yang berbeda menghasilkan urutan yang tidak
 * bisa dipercaya.
 */

export interface GelombangAktif {
  id: string;
  nama: string;
  tahunAjaran: string;
  tanggalBuka: string;
  tanggalTutup: string;
  kuota: number;
  biayaPendaftaran: number;
}

/**
 * Gelombang yang sedang dibuka, bila ada.
 *
 * Tanggal dibandingkan SQLite dengan standar WIB (`date('now','+7 hours')`),
 * bukan `new Date()` di proses Node. Server Vercel berjalan pada UTC, dan
 * antara pukul 00:00–07:00 WIB sebuah perbandingan UTC menunjuk hari kemarin —
 * gelombang yang tutup hari ini akan tampak masih terbuka sepanjang dini hari,
 * dan gelombang yang baru buka hari ini akan tampak belum dimulai.
 */
export async function readGelombangAktif(
  client: Client,
): Promise<GelombangAktif | null> {
  const hasil = await client.execute(
    `SELECT id_gelombang, nama, tahun_ajaran, tanggal_buka, tanggal_tutup,
            kuota, biaya_pendaftaran
       FROM pmb_gelombang
      WHERE is_aktif = 1
        AND date('now', '+7 hours') BETWEEN date(tanggal_buka) AND date(tanggal_tutup)
   ORDER BY tanggal_buka DESC
      LIMIT 1;`,
  );

  const baris = hasil.rows[0];
  if (!baris) return null;

  return {
    id: String(baris.id_gelombang),
    nama: String(baris.nama),
    tahunAjaran: String(baris.tahun_ajaran),
    tanggalBuka: String(baris.tanggal_buka),
    tanggalTutup: String(baris.tanggal_tutup),
    kuota: Number(baris.kuota ?? 0),
    biayaPendaftaran: Number(baris.biaya_pendaftaran ?? 0),
  };
}

export interface HasilPendaftaran {
  idPendaftar: string;
  nomorPendaftaran: string;
}

export class GelombangTidakTerbukaError extends Error {
  readonly status = 409;

  constructor() {
    super("Tidak ada gelombang pendaftaran yang sedang dibuka.");
    this.name = "GelombangTidakTerbukaError";
  }
}

export class KuotaPenuhError extends Error {
  readonly status = 409;

  constructor() {
    super("Kuota gelombang pendaftaran ini sudah terpenuhi.");
    this.name = "KuotaPenuhError";
  }
}

/**
 * Simpan satu pendaftaran beserta berkasnya, atomik.
 *
 * `batch(..., "write")` membungkusnya dalam satu transaksi. Tanpa itu, sebuah
 * kegagalan di tengah meninggalkan baris pendaftar tanpa berkas yang tampak
 * lengkap bagi panitia — dan pendaftar yang sudah menerima nomornya tidak punya
 * cara mengunggah ulang.
 *
 * Nomor pendaftaran dibangkitkan dengan percobaan ulang alih-alih diperiksa
 * lebih dulu: `idx_pmb_pendaftar_nomor` yang UNIQUE-lah yang memutuskan, dan
 * memeriksa-lalu-menulis punya jendela balapan di antaranya. Unique aman di
 * tabel ini justru karena ia tidak pernah melewati outbox — bentroknya muncul
 * saat itu juga sebagai error yang bisa dijawab, bukan sebagai push yang mati
 * permanen dengan `next_retry_at = NULL`.
 */
export async function tulisPendaftaran(
  client: Client,
  gelombang: GelombangAktif,
  masukan: MasukanPendaftaran,
  opsi: { percobaanMaks?: number; sekarang?: number; acak?: () => number } = {},
): Promise<HasilPendaftaran> {
  const percobaanMaks = opsi.percobaanMaks ?? 5;
  const tahun = Number(gelombang.tahunAjaran.slice(0, 4)) || 0;

  if (gelombang.kuota > 0) {
    const terpakai = await client.execute({
      sql: `SELECT COUNT(*) AS total
              FROM pmb_pendaftar
             WHERE id_gelombang = ?
               AND status NOT IN ('Ditolak', 'Dibatalkan');`,
      args: [gelombang.id],
    });
    if (Number(terpakai.rows[0]?.total ?? 0) >= gelombang.kuota) {
      throw new KuotaPenuhError();
    }
  }

  let terakhir: unknown = null;

  for (let percobaan = 0; percobaan < percobaanMaks; percobaan++) {
    const idPendaftar = buatIdPendaftar(opsi.sekarang, opsi.acak);
    const nomorPendaftaran = buatNomorPendaftaran(tahun, opsi.acak);

    const pernyataan: InStatement[] = [
      {
        sql: `INSERT INTO pmb_pendaftar (
                id_pendaftar, nomor_pendaftaran, id_gelombang, nama_lengkap,
                nisn, jenis_kelamin, tempat_lahir, tanggal_lahir, asal_sekolah,
                alamat, nama_wali, no_whatsapp_wali, email_wali, pilihan_jurusan,
                status, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Baru',
                        datetime('now'), datetime('now'));`,
        args: [
          idPendaftar,
          nomorPendaftaran,
          gelombang.id,
          masukan.namaLengkap,
          masukan.nisn,
          masukan.jenisKelamin,
          masukan.tempatLahir,
          masukan.tanggalLahir,
          masukan.asalSekolah,
          masukan.alamat,
          masukan.namaWali,
          masukan.noWhatsappWali,
          masukan.emailWali ?? null,
          masukan.pilihanJurusan,
        ],
      },
      ...masukan.berkas.map((berkas, urutan) => ({
        sql: `INSERT INTO pmb_berkas (
                id_berkas, id_pendaftar, jenis, nama_file, mime,
                ukuran_byte, konten_base64, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'));`,
        args: [
          buatIdBerkas((opsi.sekarang ?? Date.now()) + urutan, opsi.acak),
          idPendaftar,
          berkas.jenis,
          berkas.namaFile,
          berkas.mime,
          berkas.ukuranByte,
          berkas.kontenBase64,
        ],
      })),
    ];

    try {
      await client.batch(pernyataan, "write");
      return { idPendaftar, nomorPendaftaran };
    } catch (error) {
      if (!bentrokNomorPendaftaran(error)) throw error;
      terakhir = error;
    }
  }

  throw new Error(
    `Gagal membangkitkan nomor pendaftaran unik setelah ${percobaanMaks} percobaan: ${String(terakhir)}`,
  );
}

/**
 * Apakah kegagalan ini bentrok nomor pendaftaran, dan bukan kegagalan lain.
 *
 * Dicocokkan pada KOLOM yang bentrok, bukan sekadar kata "UNIQUE". Pencocokan
 * longgar akan ikut menelan bentrok primary key, dan percobaan ulang untuk
 * bentrok yang sebenarnya bug akan menyembunyikan bug itu di balik lima
 * percobaan diam.
 *
 * Versi pertama fungsi ini mencocokkan NAMA INDEX (`idx_pmb_pendaftar_nomor`),
 * dan itu keliru: SQLite menyebut kolomnya, bukan indexnya —
 * `UNIQUE constraint failed: pmb_pendaftar.nomor_pendaftaran`. Akibatnya
 * percobaan ulang tidak pernah aktif, dan bentrok nomor yang seharusnya
 * dipulihkan sendiri akan sampai ke pendaftar sebagai "Terjadi gangguan".
 * Nama index tetap ikut dicocokkan karena sebagian versi/rangkaian pesan
 * menyebutnya.
 */
function bentrokNomorPendaftaran(error: unknown): boolean {
  const pesan = error instanceof Error ? error.message : String(error);
  return (
    pesan.includes("pmb_pendaftar.nomor_pendaftaran") ||
    pesan.includes("idx_pmb_pendaftar_nomor")
  );
}

export interface StatusPendaftaran {
  nomorPendaftaran: string;
  namaLengkap: string;
  status: string;
  catatanVerifikator: string | null;
  namaGelombang: string;
  tanggalDaftar: string;
  jumlahBerkas: number;
}

/**
 * Status satu pendaftaran, dicari dengan nomor + tanggal lahir.
 *
 * Keduanya WAJIB cocok dalam satu query. Memeriksa nomornya lebih dulu lalu
 * membandingkan tanggal lahir di JavaScript akan membuat balasannya berbeda
 * antara "nomor tidak ada" dan "tanggal lahir salah" — dan perbedaan itu
 * cukup untuk memetakan nomor mana yang terdaftar.
 *
 * `konten_base64` TIDAK ikut: berkasnya hanya dihitung. Satu berkas sampai
 * 500 KB, dan halaman status tidak menampilkannya.
 */
export async function readStatusPendaftaran(
  client: Client,
  masukan: MasukanCekStatus,
): Promise<StatusPendaftaran | null> {
  const hasil = await client.execute({
    sql: `SELECT p.nomor_pendaftaran, p.nama_lengkap, p.status,
                 p.catatan_verifikator, p.created_at,
                 COALESCE(g.nama, '') AS nama_gelombang,
                 (SELECT COUNT(*) FROM pmb_berkas b
                   WHERE b.id_pendaftar = p.id_pendaftar) AS jumlah_berkas
            FROM pmb_pendaftar p
            LEFT JOIN pmb_gelombang g ON g.id_gelombang = p.id_gelombang
           WHERE p.nomor_pendaftaran = ?
             AND p.tanggal_lahir = ?
           LIMIT 1;`,
    args: [masukan.nomorPendaftaran.toUpperCase(), masukan.tanggalLahir],
  });

  const baris = hasil.rows[0];
  if (!baris) return null;

  return {
    nomorPendaftaran: String(baris.nomor_pendaftaran),
    namaLengkap: String(baris.nama_lengkap),
    status: String(baris.status),
    catatanVerifikator: String(baris.catatan_verifikator ?? "").trim() || null,
    namaGelombang: String(baris.nama_gelombang ?? ""),
    tanggalDaftar: String(baris.created_at),
    jumlahBerkas: Number(baris.jumlah_berkas ?? 0),
  };
}

export interface PendaftarUntukOtp {
  idPendaftar: string;
  namaLengkap: string;
  nomorWali: string;
}

/**
 * Cari pendaftar untuk pengiriman OTP cek status.
 *
 * Pendaftar yang sudah menjadi siswa (`Terdaftar`) tetap boleh memeriksa
 * statusnya — justru itu kabar yang paling ingin ia baca.
 */
export async function cariPendaftarUntukOtp(
  client: Client,
  nomorPendaftaran: string,
): Promise<PendaftarUntukOtp | null> {
  const hasil = await client.execute({
    sql: `SELECT id_pendaftar, nama_lengkap, no_whatsapp_wali
            FROM pmb_pendaftar
           WHERE nomor_pendaftaran = ?
           LIMIT 1;`,
    args: [nomorPendaftaran.trim().toUpperCase()],
  });

  const baris = hasil.rows[0];
  if (!baris) return null;

  return {
    idPendaftar: String(baris.id_pendaftar),
    namaLengkap: String(baris.nama_lengkap ?? ""),
    nomorWali: String(baris.no_whatsapp_wali ?? "").trim(),
  };
}

/** Status satu pendaftaran, dicari lewat id — dipakai setelah OTP terverifikasi. */
export async function readStatusPendaftaranById(
  client: Client,
  idPendaftar: string,
): Promise<StatusPendaftaran | null> {
  const hasil = await client.execute({
    sql: `SELECT p.nomor_pendaftaran, p.nama_lengkap, p.status,
                 p.catatan_verifikator, p.created_at,
                 COALESCE(g.nama, '') AS nama_gelombang,
                 (SELECT COUNT(*) FROM pmb_berkas b
                   WHERE b.id_pendaftar = p.id_pendaftar) AS jumlah_berkas
            FROM pmb_pendaftar p
            LEFT JOIN pmb_gelombang g ON g.id_gelombang = p.id_gelombang
           WHERE p.id_pendaftar = ?
           LIMIT 1;`,
    args: [idPendaftar],
  });

  const baris = hasil.rows[0];
  if (!baris) return null;

  return {
    nomorPendaftaran: String(baris.nomor_pendaftaran),
    namaLengkap: String(baris.nama_lengkap),
    status: String(baris.status),
    catatanVerifikator: String(baris.catatan_verifikator ?? "").trim() || null,
    namaGelombang: String(baris.nama_gelombang ?? ""),
    tanggalDaftar: String(baris.created_at),
    jumlahBerkas: Number(baris.jumlah_berkas ?? 0),
  };
}
