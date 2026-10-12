import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { type Client, createClient } from "@libsql/client";
import { initDatabaseSchema } from "@/lib/db-schema";
import type { JenisPenilaian } from "@/types/grades";

mock.module("server-only", () => ({}));

const { listAssessments } = await import("@/lib/services/grades");

const client: Client = createClient({ url: "file::memory:" });

/**
 * Vektor kembar `daftar_penilaian_semua_rombel_dan_filter_jenis` di
 * `src-tauri/src/desktop/grades.rs`: data dan harapan yang sama persis.
 */
beforeAll(async () => {
  await initDatabaseSchema(client);
  await client.batch(
    [
      `INSERT INTO akademik_rombel (id_rombel, id_tahun_ajaran, tingkat, nama_rombel)
       VALUES ('r7a', 'ta1', 7, 'VII A'), ('r7b', 'ta1', 7, 'VII B');`,
      `INSERT INTO nilai_penilaian (id_penilaian, id_tahun_ajaran, semester, id_rombel,
         id_mapel, id_guru, jenis, nama_penilaian, tanggal, created_at, updated_at)
       VALUES
         ('p1', 'ta1', 'Ganjil', 'r7a', 'mtk', 'g', 'UTS', 'UTS MTK', '2026-09-01', 'x', 'x'),
         ('p2', 'ta1', 'Ganjil', 'r7b', 'mtk', 'g', 'Tugas', 'Tugas 1', '2026-09-02', 'x', 'x'),
         ('p3', 'ta1', 'Ganjil', 'r7b', 'ipa', 'g', 'UTS', 'UTS IPA', '2026-09-03', 'x', 'x'),
         ('p4', 'ta1', 'Genap', 'r7a', 'mtk', 'g', 'UTS', 'UTS Genap', '2026-09-04', 'x', 'x');`,
    ],
    "write",
  );
});

afterAll(() => client.close());

async function ids(
  id_rombel: string | null,
  id_mapel: string | null,
  jenis: string | null,
) {
  const { items } = await listAssessments(client, {
    id_tahun_ajaran: "ta1",
    semester: "Ganjil",
    id_rombel,
    id_mapel,
    jenis: jenis as JenisPenilaian | null,
  });
  return items.map((item) => `${item.id_penilaian}:${item.nama_rombel}`);
}

describe("listAssessments", () => {
  test("rombel kosong = semua rombel, dengan nama rombel", async () => {
    expect(await ids(null, null, null)).toEqual([
      "p3:VII B",
      "p2:VII B",
      "p1:VII A",
    ]);
    expect(await ids(" ", "", "")).toEqual(await ids(null, null, null));
  });

  test("filter rombel, jenis, dan gabungan", async () => {
    expect(await ids("r7b", null, null)).toEqual(["p3:VII B", "p2:VII B"]);
    expect(await ids(null, null, "UTS")).toEqual(["p3:VII B", "p1:VII A"]);
    expect(await ids("r7b", "mtk", "Tugas")).toEqual(["p2:VII B"]);
  });

  test("jenis asing ditolak, bukan diabaikan", async () => {
    await expect(ids(null, null, "Kuis")).rejects.toThrow("tidak dikenal");
  });
});
