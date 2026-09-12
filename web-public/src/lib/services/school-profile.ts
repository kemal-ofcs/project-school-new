import type { Client } from "@libsql/client";

/**
 * Profil sekolah untuk situs publik — DIBACA, tidak pernah ditulis.
 *
 * Bandingkan dengan `getCompanyProfile` di web-desktop: fungsi itu melakukan
 * `INSERT OR IGNORE` ketika barisnya belum ada, dan itu benar di sana — panel
 * admin memang pemilik baris tersebut. Di sini tidak. `company_profile` adalah
 * tabel Kelas A yang ikut `SNAPSHOT_TABLES`, sehingga satu INSERT dari situs
 * publik akan menaikkan `sync_pulse` dan ditarik ke SQLite SETIAP perangkat
 * pada siklus berikutnya — termasuk setiap terminal pemindai. Situs publik
 * membaca apa adanya dan menambal yang kosong di memori.
 */

/**
 * Nilai bawaan template yang dipasang saat instalasi baru.
 *
 * Ini BUKAN nama sekolah — ini placeholder yang menunggu diisi lewat halaman
 * Pengaturan. Menampilkannya sebagai judul situs publik lebih buruk daripada
 * tidak menampilkan apa-apa: pengunjung akan membaca "YOUR COMPANY" sebagai
 * nama sekolahnya. Daftarnya dicocokkan case-insensitive dan dianggap "belum
 * dikonfigurasi".
 */
const PLACEHOLDER_VALUES = new Set([
  "your company",
  "operations center",
  "your company address",
  "your name",
  "director",
  "info@yourcompany.com",
  "https://yourcompany.com",
  "-",
]);

function bersihkan(nilai: unknown): string | null {
  const teks = String(nilai ?? "").trim();
  if (!teks) return null;
  if (PLACEHOLDER_VALUES.has(teks.toLowerCase())) return null;
  return teks;
}

export interface SchoolProfile {
  /** Nama sekolah, atau null bila admin belum mengisinya. */
  namaSekolah: string | null;
  namaCabang: string | null;
  logoUrl: string | null;
  alamat: string | null;
  telepon: string | null;
  email: string | null;
  situs: string | null;
  namaPimpinan: string | null;
  jabatanPimpinan: string | null;
  /** Nama aplikasi dari `setting_gex_system`, dipakai pada metadata. */
  namaAplikasi: string | null;
  /** True bila `company_profile` sama sekali belum punya baris. */
  belumDikonfigurasi: boolean;
}

/** Label yang aman dipakai sebagai judul ketika nama sekolah belum diisi. */
export const LABEL_SEKOLAH_BELUM_DIISI = "Sekolah";

export function namaTampil(profil: SchoolProfile): string {
  return profil.namaSekolah ?? LABEL_SEKOLAH_BELUM_DIISI;
}

/**
 * Baca profil dan nama aplikasi dalam satu perjalanan ke database.
 *
 * Dipisah dari `getSchoolProfile` supaya bisa diuji terhadap database di
 * memori tanpa menyentuh singleton koneksi.
 */
export async function readSchoolProfile(
  client: Client,
): Promise<SchoolProfile> {
  const [profil, pengaturan] = await client.batch(
    [
      // `id = 'default_company'` adalah baris tunggal yang dipakai seluruh
      // aplikasi; `LIMIT 1` menegaskannya meski PK sudah menjaminnya.
      `SELECT company_name, branch_name, logo_url, address, phone, email,
              website, leader_name, leader_title
         FROM company_profile
        WHERE id = 'default_company'
        LIMIT 1;`,
      `SELECT value FROM setting_gex_system WHERE key = 'app_display_name' LIMIT 1;`,
    ],
    "read",
  );

  const baris = profil.rows[0];
  const namaAplikasi = bersihkan(pengaturan.rows[0]?.value);

  if (!baris) {
    return {
      namaSekolah: null,
      namaCabang: null,
      logoUrl: null,
      alamat: null,
      telepon: null,
      email: null,
      situs: null,
      namaPimpinan: null,
      jabatanPimpinan: null,
      namaAplikasi,
      belumDikonfigurasi: true,
    };
  }

  return {
    namaSekolah: bersihkan(baris.company_name),
    namaCabang: bersihkan(baris.branch_name),
    logoUrl: bersihkan(baris.logo_url),
    alamat: bersihkan(baris.address),
    telepon: bersihkan(baris.phone),
    email: bersihkan(baris.email),
    situs: bersihkan(baris.website),
    namaPimpinan: bersihkan(baris.leader_name),
    jabatanPimpinan: bersihkan(baris.leader_title),
    namaAplikasi,
    belumDikonfigurasi: false,
  };
}

export interface ProgramStudi {
  kode: string;
  nama: string;
  deskripsi: string | null;
}

/**
 * Jurusan yang aktif, dibaca dari `akademik_jurusan`.
 *
 * Halaman Program menampilkan data yang benar-benar dipakai sekolah untuk
 * menempatkan siswanya, bukan teks pemasaran yang ditulis terpisah lalu basi.
 * Ketika sekolah menambah jurusan di panel admin, halaman publiknya ikut.
 *
 * `akademik_jurusan` tidak tumbuh per hari operasional — jumlahnya dibatasi
 * kurikulum — jadi ia di luar daftar tabel yang dijaga `audit:list-bound`.
 * Batasnya tetap dipasang karena halaman ini melayani internet terbuka dan
 * tidak ada yang mengawasi berapa baris yang sempat masuk.
 */
export async function readProgramStudi(
  client: Client,
  batas = 50,
): Promise<ProgramStudi[]> {
  const hasil = await client.execute({
    sql: `SELECT kode_jurusan, nama_jurusan, deskripsi
            FROM akademik_jurusan
           WHERE is_aktif = 1
        ORDER BY nama_jurusan ASC
           LIMIT ?;`,
    args: [batas],
  });

  return hasil.rows.map((baris) => ({
    kode: String(baris.kode_jurusan ?? "").trim(),
    nama: String(baris.nama_jurusan ?? "").trim(),
    deskripsi: bersihkan(baris.deskripsi),
  }));
}

/**
 * Profil netral untuk dipakai kerangka halaman saat data tidak terbaca.
 *
 * Header dan footer harus tetap tampil agar pengunjung bisa berpindah halaman
 * meski database sedang tidak terjangkau. Yang TIDAK boleh dilakukan adalah
 * mengarang isinya — semua nilainya null, sehingga tiap bagian yang opsional
 * (alamat, telepon, surel) sekadar tidak dirender.
 */
export function profilKosong(): SchoolProfile {
  return {
    namaSekolah: null,
    namaCabang: null,
    logoUrl: null,
    alamat: null,
    telepon: null,
    email: null,
    situs: null,
    namaPimpinan: null,
    jabatanPimpinan: null,
    namaAplikasi: null,
    belumDikonfigurasi: true,
  };
}
