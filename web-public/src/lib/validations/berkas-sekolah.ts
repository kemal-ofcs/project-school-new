import { z } from "zod";

/**
 * Berkas pendaftar dan siswa: KK, akta, ijazah, rapor, pas foto (`pmb_berkas`
 * v8, `siswa_berkas` v59, keduanya cloud-only).
 *
 * Satu aturan untuk formulir PMB situs publik, unggahan admin di /pmb dan
 * /siswa, dan kembaran Rust `desktop/berkas_sekolah.rs`. Keduanya diuji dengan
 * vektor yang sama di `berkas-sekolah.vektor.json`.
 *
 * Ukurannya dihitung dari isi base64, tidak pernah dipercaya dari klien, dan
 * tanda tangan berkas harus cocok dengan jenis yang diakui supaya berkas yang
 * mengaku PDF tidak dibuka panitia sebagai sesuatu yang lain.
 */

// Daftar ini juga CHECK constraint `pmb_berkas` dan `siswa_berkas` di kedua
// jalur provisioning.
export const JENIS_BERKAS_SEKOLAH = [
  "kartu_keluarga",
  "akta_lahir",
  "ijazah",
  "rapor",
  "foto",
  "lainnya",
] as const;
export type JenisBerkasSekolah = (typeof JENIS_BERKAS_SEKOLAH)[number];

export const MIME_BERKAS_SEKOLAH = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;
export type MimeBerkasSekolah = (typeof MIME_BERKAS_SEKOLAH)[number];

export const LABEL_JENIS_BERKAS: Record<JenisBerkasSekolah, string> = {
  kartu_keluarga: "Kartu Keluarga",
  akta_lahir: "Akta Kelahiran",
  ijazah: "Ijazah / SKL",
  rapor: "Rapor",
  foto: "Pas foto",
  lainnya: "Berkas lain",
};

/**
 * Batas satu berkas setelah dipadatkan di perangkat. Foto dipadatkan ke
 * ±150 KB (`siapkan-berkas.ts`); PDF tidak bisa dipadatkan di browser, jadi
 * batas ini yang menolaknya. Berkas lama yang lebih besar tetap terbaca.
 */
export const MAKS_BYTE_BERKAS = 200 * 1024;
export const MAKS_BASE64_BERKAS = Math.ceil(MAKS_BYTE_BERKAS / 3) * 4;

export interface BerkasSekolah {
  jenis: JenisBerkasSekolah;
  namaFile: string;
  mime: MimeBerkasSekolah;
  ukuranByte: number;
  kontenBase64: string;
}

export const PESAN_BERKAS_TERLALU_BESAR = `Berkas lebih dari ${MAKS_BYTE_BERKAS / 1024} KB.`;

/** Ukuran hasil dekode base64 tanpa mendekodenya; -1 bila panjangnya cacat. */
export function ukuranBase64(base64: string): number {
  if (base64.length % 4 !== 0) return -1;
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return (base64.length / 4) * 3 - padding;
}

function tandaTanganCocok(mime: MimeBerkasSekolah, base64: string): boolean {
  let awal: string;
  try {
    awal = atob(base64.slice(0, 16));
  } catch {
    return false;
  }
  switch (mime) {
    case "image/jpeg":
      return awal.startsWith("\xff\xd8\xff");
    case "image/png":
      return awal.startsWith("\x89PNG");
    case "image/webp":
      return awal.slice(0, 4) === "RIFF" && awal.slice(8, 12) === "WEBP";
    case "application/pdf":
      return awal.startsWith("%PDF-");
  }
}

/** Cermin `urai_berkas` di Rust; pesan galatnya identik. */
export function uraiBerkasSekolah(masukan: {
  jenis: string;
  namaFile: string;
  mime: string;
  kontenBase64: string;
}): { ok: true; nilai: BerkasSekolah } | { ok: false; galat: string } {
  const jenis = JENIS_BERKAS_SEKOLAH.find((j) => j === masukan.jenis);
  if (!jenis) return { ok: false, galat: "Jenis berkas tidak dikenal." };
  const namaFile = masukan.namaFile.trim();
  if (!namaFile) return { ok: false, galat: "Nama berkas wajib diisi." };
  if ([...namaFile].length > 180) {
    return { ok: false, galat: "Nama berkas maksimal 180 karakter." };
  }
  const mime = MIME_BERKAS_SEKOLAH.find((m) => m === masukan.mime);
  if (!mime) {
    return {
      ok: false,
      galat: "Berkas harus berupa JPG, PNG, WEBP, atau PDF.",
    };
  }
  const kontenBase64 = masukan.kontenBase64.trim();
  const ukuranByte = /^[A-Za-z0-9+/]*={0,2}$/.test(kontenBase64)
    ? ukuranBase64(kontenBase64)
    : -1;
  if (ukuranByte <= 0) return { ok: false, galat: "Berkas tidak terbaca." };
  if (ukuranByte > MAKS_BYTE_BERKAS) {
    return { ok: false, galat: PESAN_BERKAS_TERLALU_BESAR };
  }
  if (!tandaTanganCocok(mime, kontenBase64)) {
    return { ok: false, galat: "Isi berkas tidak sesuai formatnya." };
  }
  return {
    ok: true,
    nilai: { jenis, namaFile, mime, ukuranByte, kontenBase64 },
  };
}

/** Satu berkas kiriman klien; `ukuranByte` dihitung ulang dari isinya. */
export const berkasSekolahSchema = z
  .object({
    jenis: z.string(),
    namaFile: z.string(),
    mime: z.string(),
    kontenBase64: z
      .string()
      .max(MAKS_BASE64_BERKAS + 8, PESAN_BERKAS_TERLALU_BESAR),
  })
  .strict()
  .transform((masukan, ctx) => {
    const hasil = uraiBerkasSekolah(masukan);
    if (hasil.ok) return hasil.nilai;
    ctx.addIssue({ code: "custom", message: hasil.galat });
    return z.NEVER;
  });

// ── SQL, dieja sama persis di `berkas_sekolah.rs` ──

// Satu berkas per jenis: unggahan baru menggantikan yang lama. Pendaftar yang
// sudah `Terdaftar` ditolak karena berkasnya sudah pindah ke `siswa_berkas`.
export const SQL_HAPUS_JENIS_BERKAS_PMB =
  "DELETE FROM pmb_berkas WHERE id_pendaftar = ? AND jenis = ? AND EXISTS (SELECT 1 FROM pmb_pendaftar WHERE id_pendaftar = ? AND status <> 'Terdaftar')";
export const SQL_SIMPAN_BERKAS_PMB =
  "INSERT INTO pmb_berkas (id_berkas, id_pendaftar, jenis, nama_file, mime, ukuran_byte, konten_base64, created_at) SELECT ?, ?, ?, ?, ?, ?, ?, datetime('now') WHERE EXISTS (SELECT 1 FROM pmb_pendaftar WHERE id_pendaftar = ? AND status <> 'Terdaftar')";
export const SQL_HAPUS_BERKAS_PMB =
  "DELETE FROM pmb_berkas WHERE id_berkas = ?";

// Siswa yang dibuat offline belum ada di cloud sampai tersinkron; `WHERE
// EXISTS` menolak baris yatim, pola `SQL_SIMPAN_DAPODIK_SISWA`.
export const SQL_HAPUS_JENIS_BERKAS_SISWA =
  "DELETE FROM siswa_berkas WHERE id_siswa = ? AND jenis = ? AND EXISTS (SELECT 1 FROM siswa_data WHERE id_siswa = ?)";
export const SQL_SIMPAN_BERKAS_SISWA =
  "INSERT INTO siswa_berkas (id_berkas, id_siswa, jenis, nama_file, mime, ukuran_byte, konten_base64, diunggah_oleh, created_at) SELECT ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+7 hours') WHERE EXISTS (SELECT 1 FROM siswa_data WHERE id_siswa = ?)";
export const SQL_HAPUS_BERKAS_SISWA =
  "DELETE FROM siswa_berkas WHERE id_berkas = ?";

// Berkas PMB DIPINDAH saat pendaftar diangkat menjadi siswa, supaya tidak
// tersimpan dua kali. Id berkas dipertahankan; `INSERT OR IGNORE` membuat
// pasangan ini aman diulang, dan DELETE hanya membuang yang sudah tersalin.
export const SQL_PINDAH_BERKAS_PMB =
  "INSERT OR IGNORE INTO siswa_berkas (id_berkas, id_siswa, jenis, nama_file, mime, ukuran_byte, konten_base64, diunggah_oleh, created_at) SELECT b.id_berkas, p.id_siswa, b.jenis, b.nama_file, b.mime, b.ukuran_byte, b.konten_base64, 'PMB', b.created_at FROM pmb_berkas b JOIN pmb_pendaftar p ON p.id_pendaftar = b.id_pendaftar WHERE p.status = 'Terdaftar' AND TRIM(COALESCE(p.id_siswa, '')) <> ''";
export const SQL_BUANG_BERKAS_PMB_TERPINDAH =
  "DELETE FROM pmb_berkas WHERE id_berkas IN (SELECT id_berkas FROM siswa_berkas)";

export const PESAN_PENDAFTAR_SUDAH_SISWA =
  "Pendaftar tidak ditemukan, atau sudah menjadi siswa. Kelola berkasnya di halaman Siswa.";
