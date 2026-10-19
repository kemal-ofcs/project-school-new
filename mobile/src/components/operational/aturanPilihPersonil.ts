// Aturan murni pemilih personil halaman Operasional. Ikut disalin ke Mobile
// lewat `filesToCopy` bersama `PilihPersonil.tsx`.

export type JenisPersonil = "siswa" | "guru" | "pegawai";
export type SaringanJenis = JenisPersonil | "semua";

/** Koreksi dikirim satu per satu dan setiap koreksi siswa bisa mengantre WA wali. */
export const BATAS_KOREKSI_MASSAL = 50;
/** Sama dengan batas baris route `/api/offline-import`. */
export const BATAS_IMPORT_MASSAL = 500;

export const LABEL_JENIS: Record<JenisPersonil, string> = {
  siswa: "Siswa",
  guru: "Guru",
  pegawai: "Pegawai",
};

// `jenis_personil` tersimpan dengan ejaan campur ('SISWA', 'Siswa', 'Pegawai').
export function jenisPersonil(row: Record<string, unknown>): JenisPersonil {
  const jenis = String(row.jenis_personil ?? "")
    .trim()
    .toLowerCase();
  if (jenis === "siswa") return "siswa";
  if (jenis === "guru") return "guru";
  return "pegawai";
}

export function saringPersonil(
  daftar: Record<string, unknown>[],
  kata: string,
  jenis: SaringanJenis,
): Record<string, unknown>[] {
  const cari = kata.trim().toLowerCase();
  return daftar.filter(
    (row) =>
      (jenis === "semua" || jenisPersonil(row) === jenis) &&
      (!cari ||
        [row.nama, row.id_unik, row.kode_karyawan, row.divisi].some((nilai) =>
          String(nilai ?? "")
            .toLowerCase()
            .includes(cari),
        )),
  );
}

/** Menambah id tanpa duplikat, berhenti di `batas`. */
export function tambahTerpilih(
  terpilih: string[],
  tambahan: string[],
  batas: number,
): { hasil: string[]; terpotong: number } {
  const hasil = [...terpilih];
  let terpotong = 0;
  for (const id of tambahan) {
    if (hasil.includes(id)) continue;
    if (hasil.length >= batas) {
      terpotong++;
      continue;
    }
    hasil.push(id);
  }
  return { hasil, terpotong };
}

export interface HasilBerurutan {
  berhasil: string[];
  gagal: { id: string; pesan: string }[];
}

/**
 * Menjalankan `aksi` untuk setiap id secara berurutan. Satu kegagalan tidak
 * menghentikan sisanya; pesannya dikumpulkan untuk ringkasan.
 */
export async function jalankanBerurutan(
  ids: string[],
  aksi: (id: string) => Promise<{ sukses: boolean; pesan: string }>,
): Promise<HasilBerurutan> {
  const hasil: HasilBerurutan = { berhasil: [], gagal: [] };
  for (const id of ids) {
    try {
      const respons = await aksi(id);
      if (respons.sukses) hasil.berhasil.push(id);
      else hasil.gagal.push({ id, pesan: respons.pesan });
    } catch (error) {
      hasil.gagal.push({
        id,
        pesan: error instanceof Error ? error.message : "Gagal diproses.",
      });
    }
  }
  return hasil;
}

/** "18 berhasil, 2 gagal: Budi (alasan); Ani (alasan)" */
export function ringkasHasil(
  hasil: HasilBerurutan,
  namaDari: (id: string) => string,
): string {
  const dasar = `${hasil.berhasil.length} berhasil, ${hasil.gagal.length} gagal`;
  if (hasil.gagal.length === 0) return `${dasar}.`;
  const rincian = hasil.gagal
    .map((item) => `${namaDari(item.id)} (${item.pesan})`)
    .join("; ");
  return `${dasar}: ${rincian}`;
}
