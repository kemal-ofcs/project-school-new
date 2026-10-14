import { describe, expect, test } from "bun:test";
import { createClient } from "@libsql/client";
import {
  bacaTagihanAnak,
  labelPeriode,
  portalTagihanAktif,
  rupiah,
} from "./wali-tagihan";

// DDL disalin dari `web-desktop/src/lib/db-migrations.ts` (v41-v42).
async function siapkanDatabase() {
  const client = createClient({ url: ":memory:" });
  await client.executeMultiple(`
    CREATE TABLE setting_gex_system (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE keu_tagihan (
      id_tagihan TEXT PRIMARY KEY,
      id_siswa TEXT NOT NULL,
      nama_siswa TEXT NOT NULL,
      id_jenis_tagihan TEXT NOT NULL,
      nama_tagihan TEXT NOT NULL,
      periode TEXT NOT NULL,
      nominal INTEGER NOT NULL CHECK (nominal >= 0),
      potongan INTEGER NOT NULL DEFAULT 0 CHECK (potongan >= 0),
      jatuh_tempo TEXT NOT NULL,
      dibuat_oleh TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      CHECK (potongan <= nominal)
    );
    CREATE TABLE keu_tagihan_batal (
      id_tagihan TEXT PRIMARY KEY,
      alasan TEXT NOT NULL,
      dibatalkan_oleh TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE keu_pembayaran (
      id_pembayaran TEXT PRIMARY KEY,
      id_siswa TEXT NOT NULL,
      nama_siswa TEXT NOT NULL,
      tanggal TEXT NOT NULL,
      seri TEXT NOT NULL,
      nomor_urut INTEGER NOT NULL CHECK (nomor_urut > 0),
      nomor TEXT NOT NULL,
      metode TEXT NOT NULL CHECK (metode IN ('Tunai', 'Transfer', 'Titipan')),
      id_akun_kas TEXT,
      total INTEGER NOT NULL CHECK (total > 0),
      keterangan TEXT,
      dibuat_oleh TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE keu_pembayaran_alokasi (
      id_alokasi TEXT PRIMARY KEY,
      id_pembayaran TEXT NOT NULL,
      id_tagihan TEXT,
      nominal INTEGER NOT NULL CHECK (nominal > 0)
    );
    CREATE TABLE keu_pembayaran_batal (
      id_pembayaran TEXT PRIMARY KEY,
      alasan TEXT NOT NULL,
      dibatalkan_oleh TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return client;
}

describe("portal wali: tagihan", () => {
  test("tampil hanya bila modul ada dan sakelar menyala", async () => {
    const client = await siapkanDatabase();
    expect(await portalTagihanAktif(client)).toBe(false);
    await client.execute(
      "INSERT INTO setting_gex_system VALUES ('portal_wali_tagihan', 'true');",
    );
    expect(await portalTagihanAktif(client)).toBe(true);
    await client.execute("DROP TABLE keu_pembayaran_batal;");
    expect(await portalTagihanAktif(client)).toBe(false);
  });

  test("sisa, titipan, dan kuitansi hanya milik siswa sesi", async () => {
    const client = await siapkanDatabase();
    await client.executeMultiple(`
      INSERT INTO keu_tagihan (id_tagihan, id_siswa, nama_siswa, id_jenis_tagihan, nama_tagihan, periode, nominal, potongan, jatuh_tempo, dibuat_oleh) VALUES
        ('t1', 'S-01', 'Ani', 'spp', 'SPP', '2000-07', 300000, 50000, '2000-07-10', 'tu'),
        ('t2', 'S-01', 'Ani', 'spp', 'SPP', '2999-08', 300000, 0, '2999-08-10', 'tu'),
        ('t3', 'S-01', 'Ani', 'spp', 'SPP', '2000-06', 300000, 0, '2000-06-10', 'tu'),
        ('t4', 'S-01', 'Ani', 'buku', 'Buku', 'SEKALI', 100000, 0, '2000-07-01', 'tu'),
        ('t9', 'S-02', 'Budi', 'spp', 'SPP', '2000-07', 300000, 0, '2000-07-10', 'tu');
      INSERT INTO keu_tagihan_batal VALUES ('t4', 'Salah', 'tu', '2000-07-02');
      INSERT INTO keu_pembayaran (id_pembayaran, id_siswa, nama_siswa, tanggal, seri, nomor_urut, nomor, metode, total, dibuat_oleh) VALUES
        ('p1', 'S-01', 'Ani', date('now', '+7 hours', '-1 months'), 'WEB', 1, 'KWT/1', 'Tunai', 400000, 'tu'),
        ('p2', 'S-01', 'Ani', date('now', '+7 hours', '-2 months'), 'WEB', 2, 'KWT/2', 'Tunai', 50000, 'tu'),
        ('p3', 'S-01', 'Ani', date('now', '+7 hours', '-20 months'), 'WEB', 3, 'KWT/3', 'Tunai', 10000, 'tu'),
        ('p9', 'S-02', 'Budi', date('now', '+7 hours'), 'WEB', 9, 'KWT/9', 'Tunai', 300000, 'tu');
      INSERT INTO keu_pembayaran_alokasi VALUES
        ('a1', 'p1', 't3', 300000),
        ('a2', 'p1', 't1', 50000),
        ('a3', 'p1', NULL, 50000),
        ('a4', 'p2', 't1', 50000),
        ('a5', 'p3', NULL, 10000),
        ('a9', 'p9', 't9', 300000);
      INSERT INTO keu_pembayaran_batal VALUES ('p2', 'Ganda', 'tu', datetime('now'));
    `);

    const data = await bacaTagihanAnak(client, "S-01");
    // t1: 300.000 - 50.000 potongan - 50.000 (p2 batal tidak dihitung).
    expect(data.tunggakan).toEqual([
      {
        namaTagihan: "SPP",
        periode: "2000-07",
        jatuhTempo: "2000-07-10",
        sisa: 200000,
        terlambat: true,
      },
      {
        namaTagihan: "SPP",
        periode: "2999-08",
        jatuhTempo: "2999-08-10",
        sisa: 300000,
        terlambat: false,
      },
    ]);
    expect(data.totalTunggakan).toBe(500000);
    expect(data.saldoTitipan).toBe(60000);
    expect(data.kuitansi.map((k) => [k.nomor, k.dibatalkan])).toEqual([
      ["KWT/1", false],
      ["KWT/2", true],
    ]);
  });

  test("label dan format", () => {
    expect(labelPeriode("2026-09")).toBe("September 2026");
    expect(labelPeriode("SEKALI")).toBe("");
    expect(rupiah(1250000)).toBe("Rp1.250.000");
    expect(rupiah(-5000)).toBe("-Rp5.000");
  });
});
