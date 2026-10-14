import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Client, createClient } from "@libsql/client";
import { initDatabaseSchema } from "@/lib/db-schema";

mock.module("server-only", () => ({}));

const { list, recapReceipts, recapRombel } = await import(
  "@/lib/services/billing"
);

/** Salinan apa adanya `SEED_REKAP` di `desktop/billing.rs`. */
const SEED_REKAP = `
INSERT INTO akademik_rombel (id_rombel, id_tahun_ajaran, tingkat, nama_rombel) VALUES
  ('r8', 'ta', 8, 'VIII A'), ('r7', 'ta', 7, 'VII A');
INSERT INTO siswa_data (id_siswa, nama_lengkap, id_rombel, angkatan, status, created_at, updated_at) VALUES
  ('S-01', 'Ani', 'r7', 2026, 'Aktif', 'x', 'x'),
  ('S-02', 'Budi', 'r7', 2026, 'Aktif', 'x', 'x'),
  ('S-03', 'Cici', 'r8', 2025, 'Aktif', 'x', 'x'),
  ('S-04', 'Dodi', 'hilang', 2025, 'Aktif', 'x', 'x');
INSERT INTO keu_jenis_tagihan (id_jenis_tagihan, nama, periodik, nominal_bawaan, id_akun_pendapatan) VALUES
  ('spp', 'SPP', 'Bulanan', 300000, 'akun-pendapatan-spp'),
  ('buku', 'Buku', 'Sekali', 100000, 'akun-pendapatan-spp'),
  ('lab', 'Lab', 'Bulanan', 50000, 'akun-pendapatan-spp');
INSERT INTO keu_tagihan (id_tagihan, id_siswa, nama_siswa, id_jenis_tagihan, nama_tagihan, periode, nominal, potongan, jatuh_tempo, dibuat_oleh) VALUES
  ('t1', 'S-01', 'Ani', 'spp', 'SPP', '2026-07', 300000, 0, '2026-07-10', 'tu'),
  ('t2', 'S-02', 'Budi', 'spp', 'SPP', '2026-07', 300000, 100000, '2026-07-10', 'tu'),
  ('t3', 'S-03', 'Cici', 'spp', 'SPP', '2026-07', 300000, 0, '2026-07-10', 'tu'),
  ('t4', 'S-04', 'Dodi', 'spp', 'SPP', '2026-07', 300000, 0, '2026-07-10', 'tu'),
  ('t5', 'S-01', 'Ani', 'buku', 'Buku', 'SEKALI', 100000, 0, '2026-07-10', 'tu'),
  ('t6', 'S-02', 'Budi', 'spp', 'SPP', '2026-08', 300000, 0, '2026-08-10', 'tu'),
  ('t7', 'S-02', 'Budi', 'lab', 'Lab', '2026-07', 50000, 0, '2026-07-10', 'tu');
INSERT INTO keu_tagihan_batal (id_tagihan, alasan, dibatalkan_oleh) VALUES ('t7', 'Salah', 'tu');
INSERT INTO keu_pembayaran (id_pembayaran, id_siswa, nama_siswa, tanggal, seri, nomor_urut, nomor, metode, total, dibuat_oleh) VALUES
  ('p1', 'S-01', 'Ani', '2026-07-05', 'WEB', 1, 'KWT/1', 'Tunai', 300000, 'tu'),
  ('p2', 'S-02', 'Budi', '2026-07-20', 'WEB', 2, 'KWT/2', 'Transfer', 250000, 'tu'),
  ('p3', 'S-03', 'Cici', '2026-08-02', 'WEB', 3, 'KWT/3', 'Tunai', 100000, 'tu'),
  ('p4', 'S-02', 'Budi', '2026-08-15', 'WEB', 4, 'KWT/4', 'Titipan', 50000, 'tu'),
  ('p5', 'S-01', 'Ani', '2026-08-20', 'WEB', 5, 'KWT/5', 'Tunai', 100000, 'tu'),
  ('p6', 'S-03', 'Cici', '2027-07-01', 'WEB', 6, 'KWT/6', 'Tunai', 10000, 'tu'),
  ('p7', 'S-04', 'Dodi', '2026-06-30', 'WEB', 7, 'KWT/7', 'Tunai', 50000, 'tu');
INSERT INTO keu_pembayaran_alokasi (id_alokasi, id_pembayaran, id_tagihan, nominal) VALUES
  ('a1', 'p1', 't1', 300000),
  ('a2', 'p2', 't2', 200000),
  ('a3', 'p2', NULL, 50000),
  ('a4', 'p3', 't3', 100000),
  ('a5', 'p4', 't6', 50000),
  ('a6', 'p5', 't5', 100000),
  ('a7', 'p6', 't3', 10000),
  ('a8', 'p7', 't4', 50000);
INSERT INTO keu_pembayaran_batal (id_pembayaran, alasan, dibatalkan_oleh) VALUES ('p5', 'Ganda', 'tu');
`;

let client: Client;
let testDirectory: string;

beforeAll(async () => {
  testDirectory = mkdtempSync(join(tmpdir(), "kos-billing-rekap-"));
  client = createClient({ url: `file:${join(testDirectory, "test.db")}` });
  await initDatabaseSchema(client);
  await client.executeMultiple(SEED_REKAP);
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

const nol = (isi: Array<[number, number]>) => {
  const v = Array<number>(12).fill(0);
  for (const [i, n] of isi) v[i] = n;
  return v;
};

// Cermin `rekap_rombel_dan_penerimaan_skenario_kembar` di `desktop/billing.rs`.
describe("rekap tagihan: skenario kembar Rust", () => {
  test("rekap per rombel", async () => {
    const rekap = await recapRombel(client, "2026-07", null);
    expect(rekap.baris).toEqual([
      {
        nama: "VII A",
        siswa: 2,
        ditagih: 500000,
        terbayar: 500000,
        sisa: 0,
        persen: 100,
        menunggak: 0,
      },
      {
        nama: "VIII A",
        siswa: 1,
        ditagih: 300000,
        terbayar: 110000,
        sisa: 190000,
        persen: 37,
        menunggak: 1,
      },
      {
        nama: "Tanpa rombel",
        siswa: 1,
        ditagih: 300000,
        terbayar: 50000,
        sisa: 250000,
        persen: 17,
        menunggak: 1,
      },
    ]);
    expect(rekap.total).toEqual({
      nama: "Jumlah",
      siswa: 4,
      ditagih: 1100000,
      terbayar: 660000,
      sisa: 440000,
      persen: 60,
      menunggak: 2,
    });
    expect((await recapRombel(client, "2026-07", "spp")).total).toEqual(
      rekap.total,
    );
    expect((await recapRombel(client, "SEKALI", null)).baris).toEqual([
      {
        nama: "VII A",
        siswa: 1,
        ditagih: 100000,
        terbayar: 0,
        sisa: 100000,
        persen: 0,
        menunggak: 1,
      },
    ]);
    await expect(recapRombel(client, " ", null)).rejects.toThrow(
      "Periode tagihan wajib diisi.",
    );
  });

  test("penerimaan per jenis per bulan", async () => {
    const ajaran = await recapReceipts(client, "2026-07");
    expect(ajaran.kas).toEqual([
      {
        id_jenis: "spp",
        nama: "SPP",
        per_bulan: nol([
          [0, 500000],
          [1, 100000],
        ]),
        total: 600000,
      },
      {
        id_jenis: "",
        nama: "Masuk ke titipan",
        per_bulan: nol([[0, 50000]]),
        total: 50000,
      },
    ]);
    expect(ajaran.total_per_bulan).toEqual(
      nol([
        [0, 550000],
        [1, 100000],
      ]),
    );
    expect(ajaran.total).toBe(650000);
    expect(ajaran.dipakai_titipan).toEqual([
      {
        id_jenis: "spp",
        nama: "SPP",
        per_bulan: nol([[1, 50000]]),
        total: 50000,
      },
    ]);
    expect(ajaran.total_dipakai).toBe(50000);
    const kalender = await recapReceipts(client, "2026-01");
    expect(kalender.total).toBe(700000);
    expect(kalender.kas[0]?.per_bulan[5]).toBe(50000);
    await expect(recapReceipts(client, "2026-13")).rejects.toThrow(
      "Bulan awal harus berbentuk YYYY-MM.",
    );
  });
});

// Cermin `saringan_dan_urutan_jatuh_tempo` di `desktop/billing.rs`.
describe("saringan jatuh tempo", () => {
  test("lewat, segera, belum, dan urutan jatuh tempo terlama", async () => {
    await client.execute(
      `INSERT INTO keu_tagihan (id_tagihan, id_siswa, nama_siswa, id_jenis_tagihan, nama_tagihan, periode, nominal, potongan, jatuh_tempo, dibuat_oleh) VALUES
         ('t-jauh', 'S-1', 'Ani', 'jt', 'Uji', '2999-01', 100, 0, '2999-01-10', 'tu'),
         ('t-lewat', 'S-2', 'Budi', 'jt', 'Uji', '2000-01', 100, 0, '2000-01-10', 'tu'),
         ('t-segera', 'S-3', 'Cici', 'jt', 'Uji', '2026-10', 100, 0, date('now', '+7 hours', '+3 days'), 'tu');`,
    );
    const id = async (jatuh_tempo: string | null) =>
      (await list(client, { id_jenis_tagihan: "jt", jatuh_tempo })).items.map(
        (i) => i.id_tagihan,
      );
    expect(await id(null)).toEqual(["t-lewat", "t-segera", "t-jauh"]);
    expect(await id("lewat")).toEqual(["t-lewat"]);
    expect(await id("segera")).toEqual(["t-segera"]);
    expect(await id("belum")).toEqual(["t-segera", "t-jauh"]);
    await expect(id("kemarin")).rejects.toThrow(
      "Saringan jatuh tempo tidak dikenal.",
    );
  });
});
