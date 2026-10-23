import {
  dataDapodikSiswaSchema,
  simpanDapodikSiswaSchema,
} from "./siswa-dapodik";

/**
 * Impor massal berkas "daftar_pd" DAPODIK (atau hasil "Ekspor DAPODIK", yang
 * judul kolomnya sama) ke `siswa_dapodik`. Hanya membaca dan mencocokkan;
 * penyimpanannya memakai simpan per siswa yang sudah ada, jadi aturan isiannya
 * tetap aturan kembar TS ↔ Rust di `siswa-dapodik.ts`.
 *
 * Keputusan User 2026-10-23: siswa dicocokkan lewat NISN lalu nama + tanggal
 * lahir (lebih dari satu calon = dilewati); sel kosong tidak menghapus isian
 * lama; nilai yang ditolak hanya membuang sel itu; kolom identitas (Nama,
 * NIPD, JK, NISN, Alamat, Rombel) hanya untuk mencocokkan, tidak mengubah
 * `siswa_data`.
 */

/** Judul kolom (spasi dirapatkan) → kunci isian. Kolom lain diabaikan. */
const KOLOM_ISIAN: Record<string, string> = {
  "Tempat Lahir": "tempatLahir",
  "Tanggal Lahir": "tanggalLahir",
  "Sekolah Asal": "sekolahAsal",
  NIK: "nik",
  Agama: "agama",
  RT: "rt",
  RW: "rw",
  Dusun: "dusun",
  Kelurahan: "kelurahan",
  Kecamatan: "kecamatan",
  "Kode Pos": "kodePos",
  "Jenis Tinggal": "jenisTinggal",
  "Alat Transportasi": "transportasi",
  HP: "hpSiswa",
  "E-Mail": "emailSiswa",
  "Penerima KPS": "kps",
  "No. KPS": "noKps",
  "Penerima KIP": "kip",
  "Nomor KIP": "noKip",
  "Nama di KIP": "namaKip",
  "Nomor KKS": "noKks",
  "No Registrasi Akta Lahir": "noAktaLahir",
  "Kebutuhan Khusus": "kebutuhanKhusus",
  "Anak ke-berapa": "anakKe",
  "No KK": "noKk",
  "Berat Badan": "beratKg",
  "Tinggi Badan": "tinggiCm",
  "Lingkar Kepala": "lingkarKepalaCm",
  "Jml. Saudara Kandung": "jumlahSaudara",
  "Jarak Rumah ke Sekolah (KM)": "jarakKm",
};

const KELOMPOK_ORANG_TUA: Record<string, string> = {
  "Data Ayah": "ayah",
  "Data Ibu": "ibu",
  "Data Wali": "wali",
};

const SUB_ORANG_TUA: Record<string, string> = {
  Nama: "Nama",
  "Tahun Lahir": "TahunLahir",
  "Jenjang Pendidikan": "Pendidikan",
  Pekerjaan: "Pekerjaan",
  Penghasilan: "Penghasilan",
  NIK: "Nik",
};

const KUNCI_ATAS = new Set(["tempatLahir", "tanggalLahir", "sekolahAsal"]);

export interface BarisImporDapodik {
  nama: string;
  nisn: string;
  /** Isian yang lolos validasi dan tidak kosong. */
  isian: Record<string, string>;
  ditolak: { label: string; nilai: string; pesan: string }[];
}

export type HasilCocokDapodik =
  | { status: "cocok"; idSiswa: string }
  | { status: "tidakDitemukan" }
  | { status: "ganda" };

const rapat = (teks: string) => teks.replace(/\s+/g, " ").trim();

function bersihkan(kunci: string, mentah: string): string {
  // DAPODIK menulis tanda pisah panjang di rentang penghasilan; daftar kita
  // memakai tanda hubung. "â€“" = tanda pisah yang tersimpan ulang salah kode.
  const teks = rapat(mentah.replace(/â€“|[–—]/g, "-"));
  // DAPODIK mengisi 0 untuk tahun lahir dan ukuran tubuh yang tidak diketahui.
  if (
    teks === "0" &&
    /TahunLahir$|^(beratKg|tinggiCm|lingkarKepalaCm)$/.test(kunci)
  ) {
    return "";
  }
  // Kolom "Nama di KIP" berisi 0/1 di daftar_pd, bukan nama.
  if (kunci === "namaKip" && /^\d+$/.test(teks)) return "";
  return teks;
}

function galatIsian(kunci: string, nilai: string): string | null {
  const hasil = KUNCI_ATAS.has(kunci)
    ? simpanDapodikSiswaSchema.safeParse({
        idSiswa: "-",
        data: {},
        [kunci]: nilai,
      })
    : dataDapodikSiswaSchema.safeParse({ [kunci]: nilai });
  return hasil.success
    ? null
    : (hasil.error.issues[0]?.message ?? "Isian tidak valid.");
}

/**
 * Baca baris berkas (`readWorkbookRows`). Judul kolom dicari lewat namanya,
 * karena berkas yang sudah disunting bisa punya baris tambahan di atasnya.
 */
export function uraiDaftarPd(rows: readonly string[][]): BarisImporDapodik[] {
  const iJudul = rows.findIndex(
    (row) => row.some((c) => rapat(c) === "Nama") && row.includes("NISN"),
  );
  if (iJudul < 0) {
    throw new Error(
      "Judul kolom Nama dan NISN tidak ditemukan. Pakai berkas daftar_pd dari DAPODIK atau hasil Ekspor DAPODIK.",
    );
  }
  const judul = rows[iJudul].map(rapat);
  const sub = (rows[iJudul + 1] ?? []).map(rapat);
  const kolom: { indeks: number; kunci: string; label: string }[] = [];
  judul.forEach((teks, indeks) => {
    if (KOLOM_ISIAN[teks]) {
      kolom.push({ indeks, kunci: KOLOM_ISIAN[teks], label: teks });
    }
    const awalan = KELOMPOK_ORANG_TUA[teks];
    if (!awalan) return;
    for (let i = indeks; i < indeks + 6; i++) {
      const akhiran = SUB_ORANG_TUA[sub[i] ?? ""];
      if (akhiran) {
        kolom.push({
          indeks: i,
          kunci: `${awalan}${akhiran}`,
          label: `${sub[i]} (${teks})`,
        });
      }
    }
  });
  const iNama = judul.indexOf("Nama");
  const iNisn = judul.indexOf("NISN");
  // Baris sub-judul orang tua tidak punya nama siswa; ikut terlewati di sini.
  return rows
    .slice(iJudul + 1)
    .filter((row) => rapat(row[iNama] ?? "") !== "")
    .map((row) => {
      const isian: Record<string, string> = {};
      const ditolak: BarisImporDapodik["ditolak"] = [];
      for (const { indeks, kunci, label } of kolom) {
        const nilai = bersihkan(kunci, row[indeks] ?? "");
        if (!nilai) continue;
        const galat = galatIsian(kunci, nilai);
        if (galat) ditolak.push({ label, nilai, pesan: galat });
        else isian[kunci] = nilai;
      }
      return {
        nama: rapat(row[iNama] ?? ""),
        nisn: rapat(row[iNisn] ?? ""),
        isian,
        ditolak,
      };
    });
}

// Excel membuang nol di depan NISN bila berkasnya disimpan ulang.
const kunciNisn = (nisn: unknown) => {
  const angka = String(nisn ?? "").replace(/\D/g, "");
  return angka ? angka.padStart(10, "0") : "";
};
const kunciNama = (nama: unknown) => rapat(String(nama ?? "")).toLowerCase();

/**
 * Cocokkan tiap baris dengan siswa: NISN dulu, lalu nama + tanggal lahir
 * (tanggal lahir siswa hanya ada di `siswa_dapodik`). Siswa yang sudah diambil
 * baris sebelumnya membuat baris berikutnya "ganda".
 */
export function cocokkanSiswaDapodik(
  baris: readonly BarisImporDapodik[],
  siswa: readonly {
    id_siswa?: unknown;
    nama_lengkap?: unknown;
    nisn?: unknown;
  }[],
  tanggalLahir: ReadonlyMap<string, string | null>,
): HasilCocokDapodik[] {
  const terpakai = new Set<string>();
  return baris.map((b) => {
    const nisn = kunciNisn(b.nisn);
    let calon = nisn ? siswa.filter((s) => kunciNisn(s.nisn) === nisn) : [];
    const lahir = b.isian.tanggalLahir;
    if (calon.length === 0 && lahir) {
      const nama = kunciNama(b.nama);
      calon = siswa.filter(
        (s) =>
          kunciNama(s.nama_lengkap) === nama &&
          tanggalLahir.get(String(s.id_siswa)) === lahir,
      );
    }
    if (calon.length === 0) return { status: "tidakDitemukan" };
    const idSiswa = String(calon[0].id_siswa);
    if (calon.length > 1 || terpakai.has(idSiswa)) return { status: "ganda" };
    terpakai.add(idSiswa);
    return { status: "cocok", idSiswa };
  });
}
