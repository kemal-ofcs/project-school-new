/**
 * Shift tempat sebuah scan dicatat, untuk karyawan yang bisa bekerja di lebih
 * dari satu shift dalam sehari (multi-sesi).
 *
 * Keputusan pemilik (2026-11-18):
 * - Sesi lanjutan berlaku untuk HARI ITU saja. Shift tetap karyawan di
 *   `master_data` tidak pernah dipindah oleh scanner; dulu pemindahan itu
 *   membuat scan pagi esok harinya dinilai terhadap shift siang dan ditolak
 *   "Terlalu Awal".
 * - Setelah sesi shift asal lengkap, scan berikutnya mencoba shift lanjutan
 *   yang ditunjuk admin, atau seluruh shift lain bila belum ditunjuk.
 * - Scan PERTAMA hari itu yang tidak masuk jendela shift asal hanya mencoba
 *   shift lanjutan yang DITUNJUK. Mencoba semua shift akan membuat siapa pun
 *   bisa "masuk" ke shift mana pun dan keterlambatan tidak pernah terdeteksi.
 * - Semuanya hanya bila multi-sesi menyala di shift ASAL karyawan.
 *
 * Cerminan `pilih_shift_sesi` di `scanner.rs`; vektor
 * `validations/sesi-lanjutan.vektor.json` dipakai keduanya.
 */

export interface KeadaanSesiAsal {
  id_shift: number;
  /** `tbl_shift.izinkan_multi_sesi` milik shift asal. */
  multi_sesi: boolean;
  /** `tbl_shift.shift_lanjutan_id` milik shift asal; 0 = belum ditunjuk. */
  shift_lanjutan_id: number;
  /** Sesi shift asal hari itu sudah masuk DAN pulang. */
  lengkap: boolean;
  /** Sesi shift asal hari itu sudah punya jam masuk. */
  dimulai: boolean;
  /** Jam scan masuk jendela scan masuk shift asal (shift fleksibel selalu). */
  jendela_cocok: boolean;
}

export interface KandidatSesi {
  id_shift: number;
  fleksibel: boolean;
  jendela_cocok: boolean;
}

/** Id shift yang dipakai; sama dengan `asal.id_shift` bila tidak berpindah. */
export function pilihShiftSesi(
  asal: KeadaanSesiAsal,
  kandidat: readonly KandidatSesi[],
): number {
  if (!asal.multi_sesi) return asal.id_shift;
  const lanjutan =
    asal.shift_lanjutan_id > 0 && asal.shift_lanjutan_id !== asal.id_shift
      ? asal.shift_lanjutan_id
      : 0;
  // Shift fleksibel menerima jam berapa pun, jadi akan menelan setiap sesi.
  const cocok = (k: KandidatSesi) =>
    k.id_shift !== asal.id_shift && !k.fleksibel && k.jendela_cocok;

  if (asal.lengkap) {
    const daftar = lanjutan
      ? kandidat.filter((k) => k.id_shift === lanjutan)
      : kandidat;
    return daftar.find(cocok)?.id_shift ?? asal.id_shift;
  }
  if (asal.dimulai || asal.jendela_cocok || !lanjutan) return asal.id_shift;
  return (
    kandidat.find((k) => k.id_shift === lanjutan && cocok(k))?.id_shift ??
    asal.id_shift
  );
}

/**
 * Id shift yang perlu dimuat sebagai kandidat. Tanpa shift lanjutan yang
 * ditunjuk, seluruh shift lain hanya dicoba setelah sesi asal lengkap.
 * Cerminan `kandidat_shift_sesi` di `scanner.rs`.
 */
export function kandidatShiftSesi(
  asal: KeadaanSesiAsal,
  semuaShiftLain: readonly number[],
): number[] {
  if (!asal.multi_sesi) return [];
  if (asal.shift_lanjutan_id > 0 && asal.shift_lanjutan_id !== asal.id_shift) {
    return [asal.shift_lanjutan_id];
  }
  return asal.lengkap ? [...semuaShiftLain] : [];
}
