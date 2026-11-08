import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import { type Client, createClient } from "@libsql/client";

mock.module("server-only", () => ({}));

const { initDatabaseSchema } = await import("@/lib/db-schema");
const { drainTelegram, getTelegramConfig, saveTelegramConfig } = await import(
  "./telegram"
);
const { TELEGRAM_SQL_JAM_WIB, TELEGRAM_SQL_STOK_MENIPIS } = await import(
  "@/lib/validations/telegram"
);

const TOKEN = "123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw0";
const fetchAsli = globalThis.fetch;
// SATU klien untuk seluruh berkas, direset per tes (pola `wa-sender.test.ts`):
// di Bun Windows, klien libsql baru setelah klien lain ditutup bisa segfault.
const client: Client = createClient({ url: "file::memory:" });

type Kiriman = { url: string; body: Record<string, unknown> };
let kiriman: Kiriman[] = [];
let jawaban: () => Response = () =>
  new Response('{"ok":true,"result":{}}', { status: 200 });

beforeAll(async () => {
  await initDatabaseSchema(client);
});

beforeEach(async () => {
  await client.batch(
    [
      "DELETE FROM app_telegram_setting;",
      "DELETE FROM notifikasi_telegram;",
      "DELETE FROM inventory_pengajuan;",
      "DELETE FROM inventory_pengajuan_baris;",
      "DELETE FROM inventory_barang;",
    ],
    "write",
  );
  kiriman = [];
  jawaban = () => new Response('{"ok":true,"result":{}}', { status: 200 });
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    kiriman.push({ url, body: JSON.parse(String(init?.body ?? "{}")) });
    return jawaban();
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = fetchAsli;
});

afterAll(() => {
  client.close();
});

async function aktifkan(kirim: Record<string, string> = {}) {
  const nilai: Record<string, string> = {
    bot_token: TOKEN,
    aktif: "1",
    "grup:inventaris": "-100111",
    "grup:keuangan": "-222",
    "kirim:pengajuan_baru": "1",
    "kirim:pengajuan_putus": "1",
    "kirim:stok_menipis": "0",
    ...kirim,
  };
  for (const [kunci, isi] of Object.entries(nilai)) {
    await client.execute({
      sql: "INSERT OR REPLACE INTO app_telegram_setting (kunci, nilai) VALUES (?, ?);",
      args: [kunci, isi],
    });
  }
  await client.execute(
    "INSERT OR REPLACE INTO app_telegram_setting (kunci, nilai) VALUES ('aktif_sejak', datetime('now', '-1 hour'));",
  );
}

async function pengajuan(
  id: string,
  dibuat: string,
  keputusan: { disetujuiOleh?: string } = {},
) {
  await client.execute({
    sql: `INSERT INTO inventory_pengajuan (id_pengajuan, tanggal, seri, nomor_urut, nomor, keperluan,
            sidik_baris, diajukan_oleh, disetujui_pada, disetujui_oleh, created_at)
          VALUES (?, '2026-11-08', 'W', 1, ?, 'Alat tulis', 'x', 'sarpras', ?, ?, datetime('now', ?));`,
    args: [
      id,
      `PB-${id}`,
      keputusan.disetujuiOleh ? "2026-11-08 09:00:00" : null,
      keputusan.disetujuiOleh ?? null,
      dibuat,
    ],
  });
  if (keputusan.disetujuiOleh) {
    await client.execute({
      sql: "UPDATE inventory_pengajuan SET disetujui_pada = datetime('now', '+7 hours', '-5 minutes') WHERE id_pengajuan = ?;",
      args: [id],
    });
  }
  await client.batch(
    [
      {
        sql: "INSERT INTO inventory_pengajuan_baris (id_baris, id_pengajuan, urutan, nama_barang, satuan, desimal, jumlah, harga_satuan) VALUES (?, ?, 1, 'Kertas', 'rim', 0, 2, 50000);",
        args: [`${id}-1`, id],
      },
      {
        sql: "INSERT INTO inventory_pengajuan_baris (id_baris, id_pengajuan, urutan, nama_barang, satuan, desimal, jumlah, harga_satuan) VALUES (?, ?, 2, 'Cairan', 'liter', 1, 150, 10000);",
        args: [`${id}-2`, id],
      },
    ],
    "write",
  );
}

describe("pengirim Telegram", () => {
  test("belum aktif: tidak mencatat dan tidak mengirim apa pun", async () => {
    await pengajuan("a", "-10 minutes");
    const hasil = await drainTelegram(client, "uji", { jedaMs: 0 });
    expect(hasil.pesan).toBe("Notifikasi Telegram belum aktif.");
    expect(kiriman).toHaveLength(0);
    const antrean = await client.execute(
      "SELECT COUNT(*) AS n FROM notifikasi_telegram;",
    );
    expect(Number(antrean.rows[0]?.n)).toBe(0);
  });

  test("pengajuan baru ke grup Keuangan, sekali saja", async () => {
    await aktifkan();
    await pengajuan("a", "-10 minutes");
    // Dibuat sebelum Telegram diaktifkan: tidak dikirim.
    await pengajuan("lama", "-2 hours");

    const hasil = await drainTelegram(client, "uji", { jedaMs: 0 });
    expect(hasil).toMatchObject({ diproses: 1, terkirim: 1, gagal: 0 });
    expect(kiriman).toHaveLength(1);
    expect(kiriman[0]?.url).toBe(
      `https://api.telegram.org/bot${TOKEN}/sendMessage`,
    );
    expect(kiriman[0]?.body).toEqual({
      chat_id: "-222",
      // 2 × 50.000 + 1,50 × 10.000
      text: "📦 Pengajuan pembelian baru: PB-a\nKeperluan: Alat tulis\nTotal: Rp115.000 (2 barang)\nDiajukan oleh: sarpras\nMenunggu ACC di aplikasi.",
      disable_web_page_preview: true,
    });

    await drainTelegram(client, "uji", { jedaMs: 0 });
    expect(kiriman).toHaveLength(1);
  });

  test("keputusan ACC ke grup Inventaris; pengajuan yang sudah diputus tidak dikirim sebagai baru", async () => {
    await aktifkan();
    await pengajuan("b", "-10 minutes", { disetujuiOleh: "bendahara" });
    await drainTelegram(client, "uji", { jedaMs: 0 });
    expect(kiriman).toHaveLength(1);
    expect(kiriman[0]?.body.chat_id).toBe("-100111");
    expect(String(kiriman[0]?.body.text)).toStartWith(
      "✅ Pengajuan PB-b disetujui\n",
    );
  });

  test("gagal kirim: dicoba ulang dan token tidak bocor ke pesan galat", async () => {
    await aktifkan();
    await pengajuan("c", "-10 minutes");
    jawaban = () => {
      throw new Error(`connect ECONNREFUSED /bot${TOKEN}/sendMessage`);
    };
    const hasil = await drainTelegram(client, "uji", { jedaMs: 0 });
    expect(hasil.gagal).toBe(1);
    const baris = await client.execute(
      "SELECT status, attempt_count, last_error, klaim_oleh FROM notifikasi_telegram;",
    );
    expect(baris.rows[0]?.status).toBe("Menunggu");
    expect(Number(baris.rows[0]?.attempt_count)).toBe(1);
    expect(baris.rows[0]?.klaim_oleh).toBeNull();
    expect(String(baris.rows[0]?.last_error)).not.toContain(TOKEN);
    expect(String(baris.rows[0]?.last_error)).toContain("/bot***/");
  });

  test("kejadian yang dimatikan setelah tercatat dibatalkan, tidak dikirim", async () => {
    await aktifkan();
    await client.execute(
      "INSERT INTO notifikasi_telegram (id_notifikasi, kejadian, isi_pesan) VALUES ('pgj-baru:z', 'pengajuan_baru', 'x'), ('asing', 'gaji', 'y');",
    );
    await client.execute(
      "UPDATE app_telegram_setting SET nilai = '0' WHERE kunci = 'kirim:pengajuan_baru';",
    );
    const hasil = await drainTelegram(client, "uji", { jedaMs: 0 });
    expect(hasil.dibatalkan).toBe(2);
    expect(kiriman).toHaveLength(0);
  });

  test("SQL stok dan jam WIB berjalan pada skema nyata", async () => {
    await client.execute(
      "INSERT INTO inventory_barang (id_barang, kode_barang, nama_barang, tipe, satuan, stok_minimum) VALUES ('b1', 'BRG-1', 'Kertas A4', 'Habis Pakai', 'rim', 5), ('b2', 'BRG-2', 'Spidol', 'Habis Pakai', 'pcs', 0);",
    );
    const stok = await client.execute(TELEGRAM_SQL_STOK_MENIPIS);
    expect(stok.rows.map((row) => row.kode_barang)).toEqual(["BRG-1"]);
    expect(Number(stok.rows[0]?.stok_baik)).toBe(0);
    const jam = await client.execute(TELEGRAM_SQL_JAM_WIB);
    expect(String(jam.rows[0]?.tanggal)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("konfigurasi Telegram", () => {
  const draft = {
    aktif: true,
    botToken: "",
    grup: { inventaris: " -100111 ", keuangan: "" },
    kirim: { pengajuan_baru: true, pengajuan_putus: true, stok_menipis: false },
  };

  test("aktif tanpa token ditolak", async () => {
    await expect(saveTelegramConfig(client, draft)).rejects.toThrow(
      "Isi token bot lebih dulu",
    );
  });

  test("token disimpan tetapi tidak pernah dikembalikan; aktif_sejak diisi", async () => {
    const config = await saveTelegramConfig(client, {
      ...draft,
      botToken: TOKEN,
    });
    expect(config).toMatchObject({
      aktif: true,
      tokenTersimpan: true,
      tokenAkhir: "saw0",
      grup: { inventaris: "-100111", keuangan: "" },
    });
    expect(JSON.stringify(config)).not.toContain(TOKEN);
    const sejak = await client.execute(
      "SELECT nilai FROM app_telegram_setting WHERE kunci = 'aktif_sejak';",
    );
    expect(String(sejak.rows[0]?.nilai)).toMatch(/^\d{4}-\d{2}-\d{2} /);

    // Simpan ulang tanpa token: token lama tetap.
    await saveTelegramConfig(client, draft);
    expect((await getTelegramConfig(client)).tokenTersimpan).toBe(true);
  });

  test("id grup yang bukan angka ditolak", async () => {
    await expect(
      saveTelegramConfig(client, {
        ...draft,
        botToken: TOKEN,
        grup: { inventaris: "t.me/abc", keuangan: "" },
      }),
    ).rejects.toThrow("Id grup Inventaris tidak valid");
  });
});
