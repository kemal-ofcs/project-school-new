import type { KaryawanInput } from "@/lib/gateways/employee";
import type { SiswaInput } from "@/lib/gateways/student";
import type { GuruInput } from "@/lib/gateways/teacher";

/**
 * Nilai kanonik data guru & siswa yang dipakai formulir Web/Desktop, Mobile,
 * dan impor Excel sekaligus.
 *
 * `STATUS_SISWA` WAJIB sama dengan CHECK constraint `siswa_data.status` di
 * `db-migrations.ts`/`storage.rs` dan enum `sync-schema.ts`. Formulir Web dulu
 * mengeja daftarnya sendiri dan menawarkan "Mutasi" serta "Nonaktif" — dua
 * nilai yang ditolak database, sehingga memilihnya selalu gagal disimpan.
 */
export const STATUS_SISWA = [
  "Aktif",
  "Lulus",
  "Pindah",
  "Keluar",
  "Drop Out",
] as const;

export type StatusSiswa = (typeof STATUS_SISWA)[number];

/**
 * Nilai yang ditawarkan formulir guru; kolomnya sendiri tanpa CHECK.
 *
 * Gabungan dua daftar yang dulu dieja terpisah — Web/Desktop menawarkan GTT,
 * Mobile menawarkan Kontrak — supaya data yang sudah tersimpan dari kedua
 * build tetap sah ketika diekspor lalu diimpor ulang.
 */
export const STATUS_KEPEGAWAIAN_GURU = [
  "PNS",
  "PPPK",
  "GTY",
  "GTT",
  "Honorer",
  "Kontrak",
] as const;

/** Cocokkan tanpa peduli huruf besar/kecil; `null` bila tidak dikenal. */
export function normalizeStatusSiswa(raw: string): StatusSiswa | null {
  const value = raw.trim().toLowerCase();
  return STATUS_SISWA.find((status) => status.toLowerCase() === value) ?? null;
}

/**
 * Label shift yang menyebut jamnya. Shift menentukan jendela scan masuk dan
 * pulang seseorang, jadi nama saja ("Shift 1") tidak memberi tahu operator
 * kapan orang itu boleh scan — padahal itu yang sedang ia cari.
 */
export function shiftLabel(shift: Record<string, unknown>): string {
  const nama = String(shift.nama_shift || `Shift #${String(shift.id_shift)}`);
  const masuk = String(shift.jam_masuk ?? "").trim();
  const pulang = String(shift.jam_pulang ?? "").trim();
  return masuk && pulang ? `${nama} (${masuk}–${pulang})` : nama;
}

/**
 * Nilai filter "personil yang unitnya belum diisi".
 *
 * Sengaja sebuah sentinel, bukan string kosong: string kosong sudah dipakai
 * pilihan "Semua Unit", dan tanpa pilihan tersendiri baris yang unitnya kosong
 * tidak punya satu pun filter yang menampilkannya — padahal justru baris itu
 * yang perlu ditemukan untuk dilengkapi. Diawali `__` supaya tidak mungkin
 * bertabrakan dengan nama unit yang diketik manusia.
 */
export const TANPA_UNIT = "__tanpa_unit__";

/**
 * Pilihan dropdown filter unit: gabungan unit AKTIF dan unit yang benar-benar
 * dipakai baris yang sedang ditampilkan.
 *
 * Gabungan, bukan hanya unit aktif: unit yang sudah dinonaktifkan tetap
 * menempel pada personil lama, dan kalau ia hilang dari dropdown baris-baris
 * itu tidak bisa disaring sama sekali — tepat ketika seseorang perlu
 * memindahkannya ke unit pengganti.
 */
export function opsiFilterUnit(
  unitAktif: Record<string, unknown>[],
  baris: Record<string, unknown>[],
): string[] {
  const kumpulan = new Set<string>();
  for (const unit of unitAktif) {
    const nama = String(unit.nama_unit ?? "").trim();
    if (nama) kumpulan.add(nama);
  }
  for (const item of baris) {
    const nama = String(item.unit ?? "").trim();
    if (nama) kumpulan.add(nama);
  }
  return [...kumpulan].sort((a, b) => a.localeCompare(b, "id"));
}

/** Baris lolos filter unit: "" berarti semua, `TANPA_UNIT` yang unitnya kosong. */
export function cocokFilterUnit(
  baris: Record<string, unknown>,
  filterUnit: string,
): boolean {
  if (!filterUnit) return true;
  const unit = String(baris.unit ?? "").trim();
  return filterUnit === TANPA_UNIT ? unit === "" : unit === filterUnit;
}

/**
 * Pilihan filter tahun ajaran untuk siswa yang rombelnya BUKAN rombel tahun
 * aktif, yaitu yang belum dipindah lewat Ubah massal > Kelas / Rombel.
 * Tahun ajaran siswa selalu ikut rombelnya; `siswa_data` tidak menyimpannya.
 */
export const BELUM_TAHUN_AKTIF = "__belum_tahun_aktif__";

/** "" = semua; `BELUM_TAHUN_AKTIF` = di luar tahun aktif; selain itu id tahun. */
export function cocokFilterTahun(
  baris: Record<string, unknown>,
  filterTahun: string,
  idTahunAktif: string,
): boolean {
  if (!filterTahun) return true;
  const tahun = String(baris.id_tahun_ajaran ?? "");
  return filterTahun === BELUM_TAHUN_AKTIF
    ? !idTahunAktif || tahun !== idTahunAktif
    : tahun === filterTahun;
}

/** "2026/2027 Ganjil"; kosong bila tahunnya tidak ditemukan. */
export function labelTahunAjaran(tahun: Record<string, unknown> | undefined) {
  if (!tahun?.nama_tahun) return "";
  return `${String(tahun.nama_tahun)} ${String(tahun.semester ?? "")}`.trim();
}

/**
 * "Kelas 10 - IPA 1 (2026/2027 Ganjil)": rombel bernama sama dari tahun
 * berbeda adalah dua rombel, dan tanpa tahunnya keduanya tak bisa dibedakan.
 */
export function labelRombel(
  rombel: Record<string, unknown>,
  tahunList: Record<string, unknown>[],
) {
  const tahun = labelTahunAjaran(
    tahunList.find((t) => t.id_tahun_ajaran === rombel.id_tahun_ajaran),
  );
  const dasar = `Kelas ${String(rombel.tingkat)} - ${String(rombel.nama_rombel)}`;
  return tahun ? `${dasar} (${tahun})` : dasar;
}

/**
 * Pilihan dropdown filter kelas: rombel yang benar-benar punya siswa di
 * `baris` dan lolos `filterUnit`, sehingga memilih unit menyempitkan daftar
 * kelasnya dan tidak pernah menawarkan kelas yang hasilnya kosong.
 *
 * Kuncinya `id_rombel`, bukan nama: "X IPA 1" tahun ajaran ini dan tahun lalu
 * adalah dua rombel berbeda dengan nama yang sama.
 */
export function opsiFilterKelas(
  baris: Record<string, unknown>[],
  filterUnit: string,
): { id: string; label: string }[] {
  const kelas = new Map<string, { tingkat: string; nama: string }>();
  for (const item of baris) {
    const id = String(item.id_rombel ?? "").trim();
    if (!id || !cocokFilterUnit(item, filterUnit)) continue;
    kelas.set(id, {
      tingkat: String(item.tingkat ?? "").trim(),
      nama: String(item.nama_rombel ?? "").trim() || id,
    });
  }
  return [...kelas]
    .sort(
      ([, a], [, b]) =>
        (Number(a.tingkat) || 0) - (Number(b.tingkat) || 0) ||
        a.nama.localeCompare(b.nama, "id", { numeric: true }),
    )
    .map(([id, { tingkat, nama }]) => ({
      id,
      label: tingkat ? `Kelas ${tingkat} - ${nama}` : nama,
    }));
}

/**
 * Draft edit dari satu baris daftar. Dipakai form Edit satu orang DAN Ubah
 * massal: `simpanSiswa`, `simpanGuru`, dan `update_employee` (Rust) menimpa
 * setiap kolom, jadi draft yang kehilangan satu field mengosongkannya.
 */
export function draftSiswaDariBaris(item: Record<string, unknown>): SiswaInput {
  return {
    id_siswa: String(item.id_siswa),
    kode_karyawan: item.kode_karyawan ? String(item.kode_karyawan) : "",
    nama_lengkap: String(item.nama_lengkap),
    nis: item.nis ? String(item.nis) : "",
    nisn: item.nisn ? String(item.nisn) : "",
    jenis_kelamin: item.jenis_kelamin === "P" ? "P" : "L",
    id_rombel: String(item.id_rombel),
    nama_wali: item.nama_wali ? String(item.nama_wali) : "",
    no_whatsapp_wali: item.no_whatsapp_wali
      ? String(item.no_whatsapp_wali)
      : "",
    alamat: item.alamat ? String(item.alamat) : "",
    angkatan: Number(item.angkatan || new Date().getFullYear()),
    status: item.status ? String(item.status) : "Aktif",
    id_shift: item.id_shift ? Number(item.id_shift) : undefined,
    unit: item.unit ? String(item.unit) : "",
  };
}

/** Lihat `draftSiswaDariBaris`. */
export function draftGuruDariBaris(item: Record<string, unknown>): GuruInput {
  return {
    id_guru: String(item.id_guru),
    nama: String(item.nama),
    kode_karyawan: item.kode_karyawan ? String(item.kode_karyawan) : "",
    nip: item.nip ? String(item.nip) : "",
    nuptk: item.nuptk ? String(item.nuptk) : "",
    gelar: item.gelar ? String(item.gelar) : "",
    spesialisasi_mapel: item.spesialisasi_mapel
      ? String(item.spesialisasi_mapel)
      : "",
    status_kepegawaian: item.status_kepegawaian
      ? String(item.status_kepegawaian)
      : "Honorer",
    no_hp: item.no_hp ? String(item.no_hp) : "",
    lp: item.lp ? String(item.lp) : "L",
    id_shift: Number(item.id_shift || 1),
    status_aktif: item.status_aktif ? String(item.status_aktif) : "Aktif",
    unit: item.unit ? String(item.unit) : "",
    email: item.email ? String(item.email) : "",
  };
}

/** Lihat `draftSiswaDariBaris`. */
export function draftKaryawanDariBaris(
  row: Record<string, unknown>,
): KaryawanInput {
  return {
    id_unik: String(row.id_unik),
    kode_karyawan: String(row.kode_karyawan || ""),
    nama: String(row.nama || ""),
    divisi: String(row.divisi || "Operational"),
    jabatan_status: String(row.jabatan_status || "Staff"),
    no_hp: String(row.no_hp || ""),
    lp: (row.lp as "L" | "P") || "L",
    id_shift: Number(row.id_shift || 1),
    status_aktif: (row.status_aktif as "Aktif" | "Nonaktif") || "Aktif",
    tanggal_daftar: String(row.tanggal_daftar || ""),
    catatan: String(row.catatan || ""),
    jenis_personil: String(row.jenis_personil || "Pegawai"),
    tanggal_mulai_aktif: String(row.tanggal_mulai_aktif || ""),
    tanggal_selesai_aktif: String(row.tanggal_selesai_aktif || ""),
    unit: String(row.unit || ""),
    email: String(row.email || ""),
  };
}
