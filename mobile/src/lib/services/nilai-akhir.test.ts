import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Client, createClient } from "@libsql/client";
import { initDatabaseSchema } from "@/lib/db-schema";

mock.module("server-only", () => ({}));

const { config, deleteType, recap, saveSchoolDays, saveType, saveWeights } =
  await import("@/lib/services/nilai-akhir");

// Skenario kembar `pengaturan_dan_rekap_nilai_akhir` di `desktop/nilai_akhir.rs`.
// SQL seed-nya disalin apa adanya dari `SEED_SKENARIO`.
const SEED_SKENARIO = `
        INSERT INTO akademik_tahun_ajaran (id_tahun_ajaran, nama_tahun, semester, tanggal_mulai, tanggal_selesai, is_aktif, created_at, updated_at)
          VALUES ('ta1', '2026/2027', 'Ganjil', '2026-07-13', '2026-07-19', 1, 'x', 'x');
        INSERT INTO tbl_hari_libur (tanggal, nama_libur, status_aktif) VALUES ('2026-07-15', 'Libur uji', 1);
        INSERT INTO akademik_unit (id_unit, nama_unit, created_at, updated_at) VALUES ('u1', 'SMP', 'x', 'x');
        INSERT INTO akademik_rombel (id_rombel, id_tahun_ajaran, tingkat, nama_rombel) VALUES ('r7', 'ta1', 7, 'VII A');
        INSERT INTO akademik_mapel (id_mapel, kode_mapel, nama_mapel) VALUES ('mtk', 'MTK', 'Matematika'), ('ipa', 'IPA', 'IPA');
        INSERT INTO master_data (id_unik, kode_karyawan, nama, divisi, id_shift, jenis_personil, status_aktif, unit) VALUES
          ('S1', 'S1', 'Ani', 'Siswa', 1, 'Siswa', 'Aktif', 'smp '),
          ('S2', 'S2', 'Budi', 'Siswa', 1, 'Siswa', 'Aktif', NULL);
        INSERT INTO siswa_data (id_siswa, nama_lengkap, id_rombel, angkatan, status, created_at, updated_at) VALUES
          ('S1', 'Ani', 'r7', 2026, 'Aktif', 'x', 'x'),
          ('S2', 'Budi', 'r7', 2026, 'Aktif', 'x', 'x');
        INSERT INTO absensi_harian (tanggal, id_karyawan, nama, kelas_divisi, jam_masuk, status_kehadiran, status_absen, sumber, update_terakhir, id_shift, bulan, tahun, id_sesi) VALUES
          ('2026-07-13', 'S1', 'Ani', 'VII A', '07:00', 'Hadir', 'Masuk', 'Scanner', 'x', 1, '07', 2026, 's1-13'),
          ('2026-07-14', 'S1', 'Ani', 'VII A', '07:00', 'Hadir', 'Masuk', 'Scanner', 'x', 1, '07', 2026, 's1-14'),
          ('2026-07-16', 'S1', 'Ani', 'VII A', NULL, 'Sakit', 'Masuk', 'Koreksi Admin', 'x', 1, '07', 2026, 's1-16'),
          ('2026-07-17', 'S1', 'Ani', 'VII A', NULL, 'Dispensasi', 'Masuk', 'Koreksi Admin', 'x', 1, '07', 2026, 's1-17'),
          ('2026-07-13', 'S2', 'Budi', 'VII A', '07:00', 'Hadir', 'Masuk', 'Scanner', 'x', 1, '07', 2026, 's2-13'),
          ('2026-07-14', 'S2', 'Budi', 'VII A', '07:00', 'Hadir', 'Masuk', 'Scanner', 'x', 1, '07', 2026, 's2-14'),
          ('2026-07-16', 'S2', 'Budi', 'VII A', '07:00', 'Hadir', 'Masuk', 'Scanner', 'x', 1, '07', 2026, 's2-16'),
          ('2026-07-17', 'S2', 'Budi', 'VII A', '07:00', 'Hadir', 'Masuk', 'Scanner', 'x', 1, '07', 2026, 's2-17'),
          ('2026-07-18', 'S2', 'Budi', 'VII A', '07:00', 'Hadir', 'Masuk', 'Scanner', 'x', 1, '07', 2026, 's2-18');
        INSERT INTO presensi_mapel (id_presensi_mapel, id_tahun_ajaran, id_rombel, id_mapel, id_guru, tanggal, jam_ke, created_at, updated_at)
          VALUES ('pm1', 'ta1', 'r7', 'ipa', 'g', '2026-07-14', '3', 'x', 'x');
        INSERT INTO presensi_mapel_detail (id_detail, id_presensi_mapel, id_siswa, status, created_at, updated_at) VALUES
          ('d1', 'pm1', 'S1', 'Alfa', 'x', 'x'),
          ('d2', 'pm1', 'S2', 'Hadir', 'x', 'x');
        INSERT INTO nilai_penilaian (id_penilaian, id_tahun_ajaran, semester, id_rombel, id_mapel, id_guru, jenis, id_jenis, nama_penilaian, tanggal, bobot, nilai_maks, created_at, updated_at) VALUES
          ('p1', 'ta1', 'Ganjil', 'r7', 'mtk', 'g', 'Tugas', NULL, 'Tugas 1', '2026-07-13', 1, 100, 'x', 'x'),
          ('p2', 'ta1', 'Ganjil', 'r7', 'mtk', 'g', 'Tugas', 'jns-tugas', 'Tugas 2', '2026-07-14', 2, 50, 'x', 'x'),
          ('p3', 'ta1', 'Ganjil', 'r7', 'mtk', 'g', 'UTS', NULL, 'UTS', '2026-07-16', 1, 100, 'x', 'x');
        INSERT INTO nilai_siswa (id_nilai, id_penilaian, id_siswa, skor, created_at, updated_at) VALUES
          ('n1', 'p1', 'S1', 80, 'x', 'x'),
          ('n2', 'p2', 'S1', 40, 'x', 'x'),
          ('n3', 'p3', 'S1', 70, 'x', 'x'),
          ('n4', 'p2', 'S2', 50, 'x', 'x'),
          ('n5', 'p3', 'S2', 90, 'x', 'x');
    `;

let client: Client;
let testDirectory: string;

beforeAll(async () => {
  testDirectory = mkdtempSync(join(tmpdir(), "kos-nilai-akhir-web-"));
  client = createClient({ url: `file:${join(testDirectory, "test.db")}` });
  await initDatabaseSchema(client);
  await client.executeMultiple(SEED_SKENARIO);
});

afterAll(async () => {
  client.close();
  await Bun.sleep(50);
  try {
    rmSync(testDirectory, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 50,
    });
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !("code" in error) ||
      error.code !== "EBUSY"
    ) {
      throw error;
    }
  }
});

describe("nilai akhir Web terhadap skema cloud asli", () => {
  test("pengaturan dan rekap nilai akhir", async () => {
    const awal = await config(client);
    expect(awal.jenis.length).toBe(5);
    expect(awal.total_bobot).toBe(0);
    expect(awal.jenis.find((j) => j.id_jenis === "jns-tugas")?.dipakai).toBe(2);
    await expect(recap(client, "ta1", "Ganjil", "r7", "mtk")).rejects.toThrow(
      "Total bobot penilaian dan kehadiran belum 100%. Atur di tab Pengaturan Nilai.",
    );

    await expect(
      saveWeights(client, 20, [{ id_jenis: "jns-tugas", bobot: 30 }]),
    ).rejects.toThrow("Total bobot harus 100%, sekarang 50%.");
    await saveWeights(client, 20, [
      { id_jenis: "jns-tugas", bobot: 30 },
      { id_jenis: "jns-uts", bobot: 30 },
      { id_jenis: "jns-uas", bobot: 20 },
    ]);
    await saveSchoolDays(client, {
      bawaan: [1, 2, 3, 4, 5],
      unit: { u1: [1, 2, 3, 4, 5, 6] },
    });

    await expect(
      saveType(client, {
        id_jenis: "jns-uts",
        nama: "UTS",
        urutan: 4,
        is_aktif: false,
      }),
    ).rejects.toThrow(
      "Jenis yang masih berbobot tidak bisa dinonaktifkan. Pindahkan bobotnya ke jenis lain dulu.",
    );
    await expect(saveType(client, { nama: "uts" })).rejects.toThrow(
      "Nama jenis sudah dipakai.",
    );
    const { id_jenis: proyek } = await saveType(client, {
      nama: "Proyek",
      urutan: 6,
    });
    await expect(deleteType(client, "jns-uh")).rejects.toThrow(
      "Jenis bawaan tidak bisa dihapus; nonaktifkan saja.",
    );
    await deleteType(client, proyek);

    const hasil = await recap(client, "ta1", "Ganjil", "r7", "mtk");
    expect(hasil.catatan).toEqual(["Matematika: belum ada penilaian UAS"]);
    expect(hasil.nilai_kosong).toBe(1);
    const baris = (id: string) => hasil.siswa.find((s) => s.id_siswa === id);
    const ani = baris("S1");
    expect(ani?.kehadiran.hari_efektif).toBe(5);
    expect(ani?.kehadiran.masuk).toBe(2);
    expect(ani?.kehadiran.izin_sakit).toBe(1);
    expect(ani?.kehadiran.persen).toBe(50);
    expect(ani?.kehadiran.bolos).toEqual([
      { tanggal: "2026-07-14", mapel: ["IPA"] },
    ]);
    expect(ani?.nilai_akhir).toBe(69);
    const budi = baris("S2");
    expect(budi?.kehadiran.hari_efektif).toBe(4);
    expect(budi?.kehadiran.persen).toBe(100);
    expect(budi?.nilai_akhir).toBe(84);
    expect(budi?.kosong).toBe(1);
  });
});
