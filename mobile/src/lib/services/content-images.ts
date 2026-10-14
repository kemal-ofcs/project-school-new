import "server-only";

import { createHash } from "node:crypto";
import type { Client } from "@libsql/client";
import {
  HAPUS_GAMBAR_YATIM_SQL,
  idGambarKontenSah,
  MAKS_ID_PRATINJAU_GAMBAR,
  uraiGambarKonten,
} from "@/lib/validations/konten-gambar";
import { ContentValidationError } from "./content-admin";

/**
 * Foto konten situs publik untuk jalur Web. Cermin `desktop/konten_gambar.rs`
 * (`simpan`, `ambil`). Pembersihan saat konten disimpan ada di
 * `savePageContent`.
 */

/** 32 hex pertama SHA-256 isi berkas; vektor kembar di `konten_gambar.rs`. */
export function idGambarKonten(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex").slice(0, 32);
}

const dekode = (base64: string) =>
  new Uint8Array(Buffer.from(base64, "base64"));

export async function simpanGambarKonten(
  client: Client,
  dataUrl: unknown,
): Promise<{ id: string }> {
  const hasil = uraiGambarKonten(dataUrl, dekode);
  if (!hasil.ok) throw new ContentValidationError(hasil.pesan);
  const bytes = dekode(hasil.base64);
  const id = idGambarKonten(bytes);
  await client.batch(
    [
      {
        sql: `INSERT OR IGNORE INTO konten_gambar (id_gambar, jenis, data_base64, ukuran_byte)
              VALUES (?, ?, ?, ?);`,
        args: [id, hasil.jenis, hasil.base64, bytes.length],
      },
      HAPUS_GAMBAR_YATIM_SQL,
    ],
    "write",
  );
  return { id };
}

export async function ambilGambarKonten(
  client: Client,
  ids: unknown,
): Promise<{ items: Record<string, string> }> {
  const sah = (Array.isArray(ids) ? ids : [])
    .filter(idGambarKontenSah)
    .slice(0, MAKS_ID_PRATINJAU_GAMBAR);
  const items: Record<string, string> = {};
  if (sah.length === 0) return { items };
  const res = await client.execute({
    sql: `SELECT id_gambar, jenis, data_base64 FROM konten_gambar
          WHERE id_gambar IN (${sah.map(() => "?").join(", ")});`,
    args: sah,
  });
  for (const row of res.rows) {
    items[String(row.id_gambar)] =
      `data:${String(row.jenis)};base64,${String(row.data_base64)}`;
  }
  return { items };
}
