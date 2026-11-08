/**
 * Notifikasi grup Telegram internal (schema v66): aturan murni.
 *
 * Kembar `desktop/telegram.rs`; setiap fungsi di sini diuji dengan vektor yang
 * sama di `telegram.test.ts` dan modul tes Rust-nya. Bot hanya MENGIRIM: tidak
 * ada perintah atau tombol dari Telegram yang bisa mengubah data, karena itu
 * akan melewati login, 2FA, dan RBAC.
 *
 * Kejadian tidak dikaitkan ke setiap jalur simpan. Pengirim membaca datanya
 * langsung (`TELEGRAM_SQL_*`) dan mencatatnya ke `notifikasi_telegram` dengan
 * id deterministik, jadi beberapa perangkat yang berjalan bersamaan tidak
 * pernah menggandakan pesan.
 */

import { formatRupiah } from "@/lib/validations/accounting";
import { formatJumlah } from "@/lib/validations/inventory";

export const TELEGRAM_BIDANG = ["inventaris", "keuangan"] as const;
export type BidangTelegram = (typeof TELEGRAM_BIDANG)[number];

export const TELEGRAM_KEJADIAN = [
  "pengajuan_baru",
  "pengajuan_putus",
  "stok_menipis",
] as const;
export type KejadianTelegram = (typeof TELEGRAM_KEJADIAN)[number];

/**
 * Grup tujuan setiap kejadian, ditetapkan di kode. Pengajuan baru ke Keuangan
 * karena merekalah yang meng-ACC; hasilnya ke Inventaris yang menunggu.
 */
export const BIDANG_KEJADIAN: Record<KejadianTelegram, BidangTelegram> = {
  pengajuan_baru: "keuangan",
  pengajuan_putus: "inventaris",
  stok_menipis: "inventaris",
};

export const LABEL_BIDANG: Record<BidangTelegram, string> = {
  inventaris: "Inventaris",
  keuangan: "Keuangan",
};

export const LABEL_KEJADIAN: Record<KejadianTelegram, string> = {
  pengajuan_baru: "Pengajuan pembelian baru",
  pengajuan_putus: "Pengajuan disetujui atau ditolak",
  stok_menipis: "Ringkasan stok di bawah minimum (sekali sehari)",
};

/** Kunci `app_telegram_setting`. Cermin konstanta `KUNCI_*` di Rust. */
export const KUNCI_TOKEN = "bot_token";
export const KUNCI_AKTIF = "aktif";
export const KUNCI_AKTIF_SEJAK = "aktif_sejak";
export const kunciGrup = (bidang: BidangTelegram) => `grup:${bidang}`;
export const kunciKirim = (kejadian: KejadianTelegram) => `kirim:${kejadian}`;

/** Ringkasan stok dikirim mulai jam ini (WIB), sekali per tanggal. */
export const JAM_RINGKASAN_STOK = 7;
export const MAKS_BARIS_STOK = 30;
/** Baris antrean per siklus; batas Telegram ±20 pesan/menit per grup. */
export const TELEGRAM_BATCH = 20;
export const TELEGRAM_RIWAYAT = 10;

export const TELEGRAM_UPSERT_SETTING_SQL =
  "INSERT INTO app_telegram_setting (kunci, nilai, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(kunci) DO UPDATE SET nilai = excluded.nilai, updated_at = excluded.updated_at;";

export const TELEGRAM_INSERT_ANTREAN_SQL =
  "INSERT OR IGNORE INTO notifikasi_telegram (id_notifikasi, kejadian, isi_pesan) VALUES (?, ?, ?);";

/**
 * Nilai pengajuan = jumlah `nilai_baris` (barang desimal menyimpan jumlah ×100).
 * Kejadian yang terjadi sebelum Telegram diaktifkan (`?` = `aktif_sejak`, UTC)
 * atau lebih dari 7 hari lalu tidak dikirim: grup tidak dibanjiri pesan basi.
 */
const NILAI_PENGAJUAN_SQL = `(SELECT COALESCE(SUM(CASE WHEN b.desimal = 1 THEN (b.jumlah * b.harga_satuan + 50) / 100 ELSE b.jumlah * b.harga_satuan END), 0) FROM inventory_pengajuan_baris b WHERE b.id_pengajuan = p.id_pengajuan)`;

export const TELEGRAM_SQL_PENGAJUAN_BARU = `SELECT p.id_pengajuan, p.nomor, p.keperluan, p.cara_bayar,
       COALESCE(o.nama_operator, p.diajukan_oleh) AS pengaju,
       (SELECT COUNT(*) FROM inventory_pengajuan_baris b WHERE b.id_pengajuan = p.id_pengajuan) AS jumlah_baris,
       ${NILAI_PENGAJUAN_SQL} AS total
FROM inventory_pengajuan p
LEFT JOIN master_operator o ON o.username = p.diajukan_oleh
WHERE p.created_at >= ? AND p.created_at >= datetime('now', '-7 days')
  AND p.disetujui_pada IS NULL AND p.ditolak_pada IS NULL AND p.dibatalkan_pada IS NULL
  AND NOT EXISTS (SELECT 1 FROM notifikasi_telegram n WHERE n.id_notifikasi = 'pgj-baru:' || p.id_pengajuan)
ORDER BY p.created_at
LIMIT 50;`;

/** `disetujui_pada`/`ditolak_pada` disimpan WIB, `aktif_sejak` UTC. */
export const TELEGRAM_SQL_PENGAJUAN_PUTUS = `SELECT p.id_pengajuan, p.nomor, p.keperluan,
       CASE WHEN p.disetujui_pada IS NOT NULL THEN 1 ELSE 0 END AS disetujui,
       COALESCE(o.nama_operator, p.disetujui_oleh, p.ditolak_oleh) AS pemutus,
       CASE WHEN p.disetujui_pada IS NOT NULL THEN p.catatan_persetujuan ELSE p.alasan_tolak END AS catatan,
       ${NILAI_PENGAJUAN_SQL} AS total
FROM inventory_pengajuan p
LEFT JOIN master_operator o ON o.username = COALESCE(p.disetujui_oleh, p.ditolak_oleh)
WHERE COALESCE(p.disetujui_pada, p.ditolak_pada) >= datetime(?, '+7 hours')
  AND COALESCE(p.disetujui_pada, p.ditolak_pada) >= datetime('now', '+7 hours', '-7 days')
  AND NOT EXISTS (SELECT 1 FROM notifikasi_telegram n WHERE n.id_notifikasi = 'pgj-putus:' || p.id_pengajuan)
ORDER BY COALESCE(p.disetujui_pada, p.ditolak_pada)
LIMIT 50;`;

/** Aturan `stokMenipis`: minimum di atas nol dan stok kondisi Baik di bawahnya. */
export const TELEGRAM_SQL_STOK_MENIPIS = `SELECT kode_barang, nama_barang, satuan, desimal, stok_minimum, stok_baik FROM (
  SELECT b.kode_barang, b.nama_barang, b.satuan, b.desimal, b.stok_minimum,
         COALESCE((SELECT SUM(s.saldo) FROM inventory_saldo s WHERE s.id_barang = b.id_barang AND s.kondisi = 'Baik'), 0) AS stok_baik
  FROM inventory_barang b
  WHERE b.status_aktif = 1 AND b.dihapus_pada IS NULL AND b.stok_minimum > 0
) WHERE stok_baik < stok_minimum
ORDER BY nama_barang COLLATE NOCASE
-- batas: satu baris per barang aktif yang stoknya di bawah minimum
;`;

export const TELEGRAM_SQL_JAM_WIB =
  "SELECT date('now', '+7 hours') AS tanggal, CAST(strftime('%H', 'now', '+7 hours') AS INTEGER) AS jam;";

export function idPengajuanBaru(idPengajuan: string) {
  return `pgj-baru:${idPengajuan}`;
}
export function idPengajuanPutus(idPengajuan: string) {
  return `pgj-putus:${idPengajuan}`;
}
export function idStokMenipis(tanggal: string) {
  return `stok:${tanggal}`;
}

/** Cermin `token_bot_valid`: `<id bot>:<rahasia>` dari BotFather. */
export function tokenBotValid(token: string): boolean {
  return /^\d{5,15}:[A-Za-z0-9_-]{30,60}$/.test(token);
}

/**
 * Cermin `normalisasi_chat_id`. String kosong = grup belum diatur;
 * `null` = isinya bukan id chat Telegram.
 */
export function normalisasiChatId(raw: string): string | null {
  const nilai = raw.trim();
  if (nilai === "") return "";
  return /^-?\d{1,20}$/.test(nilai) ? nilai : null;
}

/**
 * Token bot ada di URL API Telegram, jadi pesan galat jaringan bisa memuatnya.
 * Cermin `samarkan_token`: setiap kemunculannya diganti sebelum disimpan atau
 * ditampilkan.
 */
export function samarkanToken(teks: string, token: string): string {
  return token === "" ? teks : teks.split(token).join("***");
}

/** Cermin `potong`: dihitung per karakter, bukan byte. */
export function potong(teks: string, maks: number): string {
  const karakter = Array.from(teks.trim());
  return karakter.length <= maks
    ? karakter.join("")
    : `${karakter.slice(0, maks - 1).join("")}…`;
}

export interface IsiPengajuanBaru {
  nomor: string;
  keperluan: string;
  total: number;
  jumlahBaris: number;
  pengaju: string;
  caraBayar: string;
}

/** Cermin `pesan_pengajuan_baru`. */
export function pesanPengajuanBaru(isi: IsiPengajuanBaru): string {
  const baris = [
    `📦 Pengajuan pembelian baru: ${isi.nomor}`,
    `Keperluan: ${potong(isi.keperluan, 200)}`,
    `Total: ${formatRupiah(isi.total)} (${isi.jumlahBaris} barang)`,
  ];
  if (isi.caraBayar === "Cicilan") baris.push("Cara bayar: Cicilan");
  baris.push(`Diajukan oleh: ${isi.pengaju}`, "Menunggu ACC di aplikasi.");
  return baris.join("\n");
}

export interface IsiPengajuanPutus {
  nomor: string;
  keperluan: string;
  total: number;
  disetujui: boolean;
  pemutus: string;
  catatan: string;
}

/** Cermin `pesan_pengajuan_putus`. */
export function pesanPengajuanPutus(isi: IsiPengajuanPutus): string {
  const baris = [
    isi.disetujui
      ? `✅ Pengajuan ${isi.nomor} disetujui`
      : `❌ Pengajuan ${isi.nomor} ditolak`,
    `Keperluan: ${potong(isi.keperluan, 200)}`,
    `Total: ${formatRupiah(isi.total)}`,
    `${isi.disetujui ? "Disetujui" : "Ditolak"} oleh: ${isi.pemutus}`,
  ];
  if (isi.catatan.trim() !== "") {
    baris.push(
      `${isi.disetujui ? "Catatan" : "Alasan"}: ${potong(isi.catatan, 300)}`,
    );
  }
  return baris.join("\n");
}

export interface BarisStokMenipis {
  kode: string;
  nama: string;
  satuan: string;
  desimal: boolean;
  stok: number;
  minimum: number;
}

/** Cermin `pesan_stok_menipis`. Daftar kosong tidak menghasilkan pesan. */
export function pesanStokMenipis(daftar: BarisStokMenipis[]): string | null {
  if (daftar.length === 0) return null;
  const baris = [`⚠️ ${daftar.length} barang di bawah stok minimum`];
  for (const item of daftar.slice(0, MAKS_BARIS_STOK)) {
    baris.push(
      `• ${potong(item.nama, 60)} (${item.kode}): ${formatJumlah(item.stok, item.desimal)} dari minimum ${formatJumlah(item.minimum, item.desimal)} ${item.satuan}`,
    );
  }
  if (daftar.length > MAKS_BARIS_STOK) {
    baris.push(`dan ${daftar.length - MAKS_BARIS_STOK} barang lainnya.`);
  }
  return baris.join("\n");
}

export interface PermintaanTelegram {
  url: string;
  body: Record<string, unknown>;
}

/** Cermin `permintaan_kirim`. Teks polos, tanpa `parse_mode`: tanpa escape. */
export function permintaanKirim(
  token: string,
  chatId: string,
  teks: string,
): PermintaanTelegram {
  return {
    url: `https://api.telegram.org/bot${token}/sendMessage`,
    body: { chat_id: chatId, text: teks, disable_web_page_preview: true },
  };
}

/**
 * Cermin `galat_telegram`: `null` bila Telegram menjawab `ok: true`, selain
 * itu penjelasan dari Telegram atau kode HTTP-nya.
 */
export function galatTelegram(status: number, badan: string): string | null {
  let data: unknown = null;
  try {
    data = JSON.parse(badan);
  } catch {
    data = null;
  }
  const objek =
    data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  if (status >= 200 && status < 300 && objek.ok === true) return null;
  const penjelasan =
    typeof objek.description === "string" && objek.description !== ""
      ? objek.description
      : `HTTP ${status}`;
  return `Telegram: ${penjelasan}`;
}

export interface GrupTelegram {
  id: string;
  judul: string;
}

/**
 * Cermin `grup_dari_updates`: grup yang terlihat bot dari `getUpdates`, urut
 * kemunculan pertama, judul terakhir. Grup tempat bot sudah dikeluarkan dibuang.
 */
export function grupDariUpdates(respons: unknown): GrupTelegram[] {
  const daftar = new Map<string, string>();
  const hasil =
    respons && typeof respons === "object"
      ? (respons as Record<string, unknown>).result
      : null;
  if (!Array.isArray(hasil)) return [];
  for (const update of hasil) {
    if (!update || typeof update !== "object") continue;
    for (const jenis of [
      "message",
      "edited_message",
      "my_chat_member",
      "chat_member",
    ]) {
      const isi = (update as Record<string, unknown>)[jenis];
      if (!isi || typeof isi !== "object") continue;
      const chat = (isi as Record<string, unknown>).chat as
        | Record<string, unknown>
        | undefined;
      if (!chat || (chat.type !== "group" && chat.type !== "supergroup")) {
        continue;
      }
      if (typeof chat.id !== "number" || !Number.isInteger(chat.id)) continue;
      const id = String(chat.id);
      const anggotaBaru = (isi as Record<string, unknown>).new_chat_member as
        | Record<string, unknown>
        | undefined;
      if (
        jenis === "my_chat_member" &&
        (anggotaBaru?.status === "left" || anggotaBaru?.status === "kicked")
      ) {
        daftar.delete(id);
        continue;
      }
      daftar.set(id, typeof chat.title === "string" ? chat.title : id);
    }
  }
  return [...daftar].map(([id, judul]) => ({ id, judul }));
}

export interface RiwayatTelegram {
  id: string;
  kejadian: string;
  status: string;
  galat: string;
  dibuat: string;
  terkirim: string;
}

/** Bentuk yang dikembalikan `get_telegram_config` / `getTelegramConfig`. */
export interface TelegramConfig {
  aktif: boolean;
  tokenTersimpan: boolean;
  tokenAkhir: string;
  grup: Record<BidangTelegram, string>;
  kirim: Record<KejadianTelegram, boolean>;
  riwayat: RiwayatTelegram[];
}

/** `botToken` kosong = pakai token yang tersimpan. */
export interface TelegramConfigDraft {
  aktif: boolean;
  botToken: string;
  grup: Record<BidangTelegram, string>;
  kirim: Record<KejadianTelegram, boolean>;
}

export interface TelegramDrainResult {
  sukses: boolean;
  diproses: number;
  terkirim: number;
  gagal: number;
  dibatalkan: number;
  pesan: string;
}
