import { describe, expect, test } from "bun:test";
import {
  type BarisStokMenipis,
  BIDANG_KEJADIAN,
  galatTelegram,
  grupDariUpdates,
  normalisasiChatId,
  permintaanKirim,
  pesanPengajuanBaru,
  pesanPengajuanPutus,
  pesanStokMenipis,
  potong,
  samarkanToken,
  tokenBotValid,
} from "./telegram";

// Vektor yang sama diuji di `desktop/telegram.rs` (modul `tests`).
describe("aturan murni Telegram", () => {
  test("token dan chat id", () => {
    expect(tokenBotValid("123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw0")).toBe(
      true,
    );
    expect(tokenBotValid("123456789AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw0")).toBe(
      false,
    );
    expect(tokenBotValid("12:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw0")).toBe(false);
    expect(tokenBotValid("123456789:pendek")).toBe(false);
    expect(
      tokenBotValid("123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PAL Dsaw0"),
    ).toBe(false);

    expect(normalisasiChatId("  ")).toBe("");
    expect(normalisasiChatId(" -1001234567890 ")).toBe("-1001234567890");
    expect(normalisasiChatId("12345")).toBe("12345");
    expect(normalisasiChatId("-")).toBeNull();
    expect(normalisasiChatId("https://t.me/+abc")).toBeNull();
    expect(normalisasiChatId("@grupku")).toBeNull();
  });

  test("samarkan dan potong", () => {
    expect(
      samarkanToken("gagal ke /bot123:ABC/sendMessage dan 123:ABC", "123:ABC"),
    ).toBe("gagal ke /bot***/sendMessage dan ***");
    expect(samarkanToken("apa adanya", "")).toBe("apa adanya");
    expect(potong("  pendek  ", 10)).toBe("pendek");
    expect(potong("ééééé", 5)).toBe("ééééé");
    expect(potong("ééééééé", 5)).toBe("éééé…");
  });

  test("isi pesan pengajuan", () => {
    expect(
      pesanPengajuanBaru({
        nomor: "PB-2026-0012",
        keperluan: "Alat tulis",
        total: 2_450_000,
        jumlahBaris: 6,
        pengaju: "Sarpras",
        caraBayar: "Tunai",
      }),
    ).toBe(
      "📦 Pengajuan pembelian baru: PB-2026-0012\nKeperluan: Alat tulis\nTotal: Rp2.450.000 (6 barang)\nDiajukan oleh: Sarpras\nMenunggu ACC di aplikasi.",
    );
    expect(
      pesanPengajuanBaru({
        nomor: "PB-1",
        keperluan: "Laptop",
        total: 9_000_000,
        jumlahBaris: 1,
        pengaju: "Budi",
        caraBayar: "Cicilan",
      }),
    ).toBe(
      "📦 Pengajuan pembelian baru: PB-1\nKeperluan: Laptop\nTotal: Rp9.000.000 (1 barang)\nCara bayar: Cicilan\nDiajukan oleh: Budi\nMenunggu ACC di aplikasi.",
    );
    expect(
      pesanPengajuanPutus({
        nomor: "PB-1",
        keperluan: "Laptop",
        total: 9_000_000,
        disetujui: true,
        pemutus: "Bendahara",
        catatan: "",
      }),
    ).toBe(
      "✅ Pengajuan PB-1 disetujui\nKeperluan: Laptop\nTotal: Rp9.000.000\nDisetujui oleh: Bendahara",
    );
    expect(
      pesanPengajuanPutus({
        nomor: "PB-1",
        keperluan: "Laptop",
        total: 9_000_000,
        disetujui: false,
        pemutus: "Bendahara",
        catatan: "Anggaran habis",
      }),
    ).toBe(
      "❌ Pengajuan PB-1 ditolak\nKeperluan: Laptop\nTotal: Rp9.000.000\nDitolak oleh: Bendahara\nAlasan: Anggaran habis",
    );
  });

  test("isi pesan stok", () => {
    expect(pesanStokMenipis([])).toBeNull();
    const barang = (i: number): BarisStokMenipis => ({
      kode: `BRG-${i}`,
      nama: "Kertas A4",
      satuan: "rim",
      desimal: false,
      stok: 3,
      minimum: 10,
    });
    expect(
      pesanStokMenipis([
        barang(1),
        {
          kode: "BRG-2",
          nama: "Cairan pel",
          satuan: "liter",
          desimal: true,
          stok: 150,
          minimum: 500,
        },
      ]),
    ).toBe(
      "⚠️ 2 barang di bawah stok minimum\n• Kertas A4 (BRG-1): 3 dari minimum 10 rim\n• Cairan pel (BRG-2): 1,50 dari minimum 5 liter",
    );
    const pesan =
      pesanStokMenipis(Array.from({ length: 32 }, (_, i) => barang(i + 1))) ??
      "";
    expect(pesan.startsWith("⚠️ 32 barang di bawah stok minimum\n")).toBe(true);
    expect(
      pesan.endsWith(
        "• Kertas A4 (BRG-30): 3 dari minimum 10 rim\ndan 2 barang lainnya.",
      ),
    ).toBe(true);
  });

  test("permintaan dan galat", () => {
    expect(permintaanKirim("1:A", "-100", "Halo")).toEqual({
      url: "https://api.telegram.org/bot1:A/sendMessage",
      body: { chat_id: "-100", text: "Halo", disable_web_page_preview: true },
    });
    expect(galatTelegram(200, '{"ok":true,"result":{}}')).toBeNull();
    expect(
      galatTelegram(
        400,
        '{"ok":false,"error_code":400,"description":"Bad Request: chat not found"}',
      ),
    ).toBe("Telegram: Bad Request: chat not found");
    expect(galatTelegram(502, "<html>")).toBe("Telegram: HTTP 502");
    expect(galatTelegram(200, '{"ok":false}')).toBe("Telegram: HTTP 200");
  });

  test("grup dari getUpdates", () => {
    const respons = {
      ok: true,
      result: [
        {
          update_id: 1,
          my_chat_member: {
            chat: { id: -100111, title: "Inventaris", type: "supergroup" },
            new_chat_member: { status: "member" },
          },
        },
        {
          update_id: 2,
          message: {
            chat: { id: 555, first_name: "Budi", type: "private" },
            text: "/start",
          },
        },
        {
          update_id: 3,
          message: {
            chat: { id: -222, title: "Keuangan", type: "group" },
            text: "/start",
          },
        },
        {
          update_id: 4,
          edited_message: {
            chat: {
              id: -100111,
              title: "Inventaris Sekolah",
              type: "supergroup",
            },
          },
        },
        {
          update_id: 5,
          my_chat_member: {
            chat: { id: -333, title: "Lama", type: "group" },
            new_chat_member: { status: "member" },
          },
        },
        {
          update_id: 6,
          my_chat_member: {
            chat: { id: -333, title: "Lama", type: "group" },
            new_chat_member: { status: "kicked" },
          },
        },
        { update_id: 7, message: { chat: { id: "-444", type: "group" } } },
      ],
    };
    expect(grupDariUpdates(respons)).toEqual([
      { id: "-100111", judul: "Inventaris Sekolah" },
      { id: "-222", judul: "Keuangan" },
    ]);
    expect(grupDariUpdates({ ok: false })).toEqual([]);
  });

  test("pemetaan kejadian", () => {
    expect(BIDANG_KEJADIAN.pengajuan_baru).toBe("keuangan");
    expect(BIDANG_KEJADIAN.pengajuan_putus).toBe("inventaris");
    expect(BIDANG_KEJADIAN.stok_menipis).toBe("inventaris");
  });
});
