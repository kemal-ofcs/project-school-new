import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { type Client, createClient } from "@libsql/client";
import { initDatabaseSchema } from "@/lib/db-schema";

mock.module("server-only", () => ({}));

// Satu klien untuk seluruh berkas (pola `attendance-dashboard.test.ts`): di Bun
// Windows, klien libsql kedua setelah yang pertama ditutup bisa segfault.
const client: Client = createClient({ url: "file::memory:" });

mock.module("@/lib/db", () => ({
  db: client,
  ensureDbInitialized: async () => {},
}));

const { saveClassAttendance, saveClassAttendanceGabungan } = await import(
  "@/lib/services/class-attendance"
);
const { saveTeachingJournal } = await import("@/lib/services/teaching-journal");

const TANGGAL = "2026-11-18";

const draft = (idRombel: string, idSiswa: string, jamKe = "1-2") => ({
  id_tahun_ajaran: "ta_2026",
  id_rombel: idRombel,
  id_mapel: "mp_psi",
  id_guru: "gur_01",
  tanggal: TANGGAL,
  jam_ke: jamKe,
  materi_pokok: "Psikotes",
  items: [{ id_siswa: idSiswa, status: "Hadir" as const }],
});

const jumlah = async (sql: string, args: string[] = []) =>
  Number((await client.execute({ sql, args })).rows[0]?.n ?? 0);

beforeAll(async () => {
  await initDatabaseSchema(client);
  await client.batch(
    [
      `INSERT INTO akademik_tahun_ajaran (
         id_tahun_ajaran, nama_tahun, semester, tanggal_mulai, tanggal_selesai,
         is_aktif, created_at, updated_at
       ) VALUES ('ta_2026', '2026/2027', 'Ganjil', '2026-07-01', '2026-12-31', 1,
                 '2026-07-01', '2026-07-01');`,
      `INSERT INTO akademik_rombel (
         id_rombel, id_tahun_ajaran, tingkat, nama_rombel, kapasitas, is_aktif
       ) VALUES ('r_tsm', 'ta_2026', 10, 'X TSM', 36, 1),
                ('r_otkp', 'ta_2026', 10, 'X OTKP', 36, 1),
                ('r_akl', 'ta_2026', 10, 'X AKL', 36, 1);`,
      `INSERT INTO akademik_mapel (
         id_mapel, kode_mapel, nama_mapel, beban_jam, kkm, is_aktif
       ) VALUES ('mp_psi', 'PSI', 'Psikotes', 1, 75, 1);`,
    ],
    "write",
  );
});

afterAll(() => {
  client.close();
});

describe("presensi kelas gabungan (Web)", () => {
  test("satu presensi per rombel, siswa di rombelnya masing-masing", async () => {
    const hasil = await saveClassAttendanceGabungan([
      draft("r_tsm", "sis_tsm"),
      draft("r_otkp", "sis_otkp"),
    ]);
    expect(hasil.id_presensi_mapel).toHaveLength(2);
    expect(
      await jumlah(
        "SELECT COUNT(*) AS n FROM presensi_mapel WHERE tanggal = ? AND id_guru = 'gur_01';",
        [TANGGAL],
      ),
    ).toBe(2);
    expect(
      await jumlah(
        `SELECT COUNT(*) AS n FROM presensi_mapel_detail d
         JOIN presensi_mapel p ON p.id_presensi_mapel = d.id_presensi_mapel
         WHERE p.id_rombel = 'r_tsm' AND d.id_siswa = 'sis_tsm';`,
      ),
    ).toBe(1);
  });

  test("satu rombel bentrok membatalkan semuanya, pesannya menyebut rombel", async () => {
    // r_otkp sudah punya sesi Psikotes jam 1-2 dari tes sebelumnya.
    await expect(
      saveClassAttendanceGabungan([
        draft("r_akl", "sis_akl"),
        draft("r_otkp", "sis_otkp_2"),
      ]),
    ).rejects.toThrow("Rombel X OTKP:");
    expect(
      await jumlah(
        "SELECT COUNT(*) AS n FROM presensi_mapel WHERE id_rombel = 'r_akl';",
      ),
    ).toBe(0);
  });

  test("aturan gabungan ditolak sebelum menulis", async () => {
    await expect(
      saveClassAttendanceGabungan([
        draft("r_akl", "sis_akl", "3"),
        draft("r_akl", "sis_akl", "3"),
      ]),
    ).rejects.toThrow("Ada rombel yang dipilih dua kali.");
  });
});

describe("jurnal kelas gabungan (Web)", () => {
  test("jurnal diterapkan ke sesi gabungan tanpa jurnal, yang berjurnal tidak ditimpa", async () => {
    // Sesi ketiga (AKL) jam yang sama tetapi sudah berjurnal sendiri.
    const akl = await saveClassAttendance(draft("r_akl", "sis_akl"));
    await saveTeachingJournal("operator_lain", {
      id_presensi_mapel: akl.id_presensi_mapel,
      materi_disampaikan: "Jurnal AKL sendiri",
    });
    // Sesi lain jam berbeda: bukan bagian kelas gabungan.
    await saveClassAttendance({ ...draft("r_tsm", "sis_tsm", "3") });

    const tsm = String(
      (
        await client.execute(
          "SELECT id_presensi_mapel FROM presensi_mapel WHERE id_rombel = 'r_tsm' AND jam_ke = '1-2';",
        )
      ).rows[0]?.id_presensi_mapel,
    );
    const hasil = await saveTeachingJournal("guru_psi", {
      id_presensi_mapel: tsm,
      materi_disampaikan: "Tes bakat minat",
      terapkan_gabungan: true,
    });

    expect(hasil.jumlah_gabungan).toBe(1);
    const jurnal = await client.execute(
      `SELECT p.id_rombel, p.jam_ke, j.materi_disampaikan FROM jurnal_mengajar j
       JOIN presensi_mapel p ON p.id_presensi_mapel = j.id_presensi_mapel
       ORDER BY p.id_rombel, p.jam_ke;`,
    );
    expect(
      jurnal.rows.map(
        (r) => `${r.id_rombel} ${r.jam_ke} ${r.materi_disampaikan}`,
      ),
    ).toEqual([
      "r_akl 1-2 Jurnal AKL sendiri",
      "r_otkp 1-2 Tes bakat minat",
      "r_tsm 1-2 Tes bakat minat",
    ]);
  });

  test("tanpa centang, hanya sesinya sendiri", async () => {
    const hasil = await saveTeachingJournal("guru_psi", {
      id_presensi_mapel: String(
        (
          await client.execute(
            "SELECT id_presensi_mapel FROM presensi_mapel WHERE id_rombel = 'r_tsm' AND jam_ke = '3';",
          )
        ).rows[0]?.id_presensi_mapel,
      ),
      materi_disampaikan: "Jam 3",
    });
    expect(hasil.jumlah_gabungan).toBe(0);
  });
});
