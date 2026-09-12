import type { Client } from "@libsql/client";

/**
 * Nilai anak untuk portal wali — HANYA BACA, dan hanya untuk satu `id_siswa`.
 *
 * `idSiswa` selalu datang dari SESI, tidak pernah dari permintaan. Lihat
 * `bacaSesiWali` untuk alasan lengkapnya.
 */

/**
 * Apakah database sekolah ini sudah punya modul nilai.
 *
 * Dipisahkan dari `REQUIRED_TABLES` global di `schema-readiness.ts` dengan
 * sengaja: daftar itu menjaga SELURUH situs, dan menaikkannya ke v28 akan
 * mematikan landing page beserta PMB pada sekolah yang databasenya masih v27 —
 * hanya karena satu tab di portal wali belum punya tabelnya. Yang benar adalah
 * halaman itu sendiri yang mengatakan "belum tersedia".
 */
export async function modulNilaiTersedia(client: Client): Promise<boolean> {
  const hasil = await client.execute(
    `SELECT COUNT(*) AS total FROM sqlite_master
      WHERE type = 'table' AND name IN ('nilai_penilaian', 'nilai_siswa');`,
  );
  return Number(hasil.rows[0]?.total ?? 0) === 2;
}

export interface NilaiAnakItem {
  idPenilaian: string;
  namaPenilaian: string;
  jenis: string;
  namaMapel: string;
  tanggal: string;
  kkm: number;
  nilaiMaks: number;
  /** `null` berarti BELUM DINILAI, bukan nol. */
  skor: number | null;
  keterangan: string | null;
}

export interface NilaiPerMapel {
  namaMapel: string;
  item: NilaiAnakItem[];
}

/**
 * Nilai anak, dikelompokkan per mata pelajaran.
 *
 * Yang TIDAK ikut, dan itu disengaja:
 *
 *   * Rata-rata kelas dan peringkat. Portal ini memperlihatkan satu anak kepada
 *     walinya, bukan posisinya terhadap teman-temannya. Angka pembanding
 *     mengubah percakapan di rumah dari "bagaimana kamu belajar" menjadi
 *     "kenapa kamu kalah", dan sekolah tidak bisa menariknya kembali.
 *   * Nilai akhir dan rapor. Keduanya menuntut pembobotan yang dibekukan, dan
 *     pembobotan itu kebijakan tiap sekolah — belum ada di sistem ini.
 *
 * `nilai_siswa` tumbuh per penilaian per siswa, jadi query-nya berbatas dua
 * kali: jendela tahun ajaran + semester, dan `LIMIT`.
 */
export async function bacaNilaiAnak(
  client: Client,
  idSiswa: string,
  batas = 300,
): Promise<NilaiPerMapel[]> {
  const hasil = await client.execute({
    sql: `SELECT p.id_penilaian, p.nama_penilaian, p.jenis, p.tanggal,
                 p.kkm, p.nilai_maks,
                 COALESCE(m.nama_mapel, '') AS nama_mapel,
                 n.skor, n.keterangan
            FROM nilai_siswa n
            JOIN nilai_penilaian p ON p.id_penilaian = n.id_penilaian
            LEFT JOIN akademik_mapel m ON m.id_mapel = p.id_mapel
           WHERE n.id_siswa = ?
        ORDER BY nama_mapel ASC, p.tanggal DESC
           LIMIT ?;`,
    args: [idSiswa, batas],
  });

  const perMapel = new Map<string, NilaiAnakItem[]>();

  for (const baris of hasil.rows) {
    const namaMapel = String(baris.nama_mapel ?? "").trim() || "Tanpa mapel";
    const item: NilaiAnakItem = {
      idPenilaian: String(baris.id_penilaian),
      namaPenilaian: String(baris.nama_penilaian ?? ""),
      jenis: String(baris.jenis ?? ""),
      namaMapel,
      tanggal: String(baris.tanggal ?? ""),
      kkm: Number(baris.kkm ?? 0),
      nilaiMaks: Number(baris.nilai_maks ?? 100),
      // `skor` dibaca apa adanya: NULL tetap null. `Number(null)` menghasilkan
      // 0, dan itulah cara paling mudah membuat anak yang belum dinilai tampak
      // mendapat nol di layar orang tuanya.
      skor:
        baris.skor === null || baris.skor === undefined
          ? null
          : Number(baris.skor),
      keterangan: String(baris.keterangan ?? "").trim() || null,
    };

    const daftar = perMapel.get(namaMapel);
    if (daftar) daftar.push(item);
    else perMapel.set(namaMapel, [item]);
  }

  return [...perMapel.entries()].map(([namaMapel, item]) => ({
    namaMapel,
    item,
  }));
}
