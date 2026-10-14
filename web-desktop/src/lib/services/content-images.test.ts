import { afterAll, beforeAll, expect, mock, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Client, createClient } from "@libsql/client";
import { initDatabaseSchema } from "@/lib/db-schema";

mock.module("server-only", () => ({}));

const { ambilGambarKonten, idGambarKonten, simpanGambarKonten } = await import(
  "@/lib/services/content-images"
);
const { savePageContent } = await import("@/lib/services/content-admin");

// Satu klien berkas per berkas tes, pola `accounting.test.ts`.
let client: Client;
let testDirectory: string;

beforeAll(async () => {
  testDirectory = mkdtempSync(join(tmpdir(), "kos-content-images-"));
  client = createClient({ url: `file:${join(testDirectory, "test.db")}` });
  await initDatabaseSchema(client);
}, 60_000);

afterAll(async () => {
  client.close();
  await Bun.sleep(50);
  try {
    rmSync(testDirectory, { recursive: true, force: true });
  } catch {
    // Berkas masih terkunci di Windows; folder sementara dibersihkan OS.
  }
});

const JPEG = "data:image/jpeg;base64,/9j/4AAQSkZJRgAB";

test("id = 32 hex pertama SHA-256 (vektor kembar konten_gambar.rs)", () => {
  expect(idGambarKonten(new TextEncoder().encode("abc"))).toBe(
    "ba7816bf8f01cfea414140de5dae2223",
  );
});

test("unggah idempoten, pratinjau, dan bersih-bersih foto yatim", async () => {
  const { id } = await simpanGambarKonten(client, JPEG);
  expect(id).toBe("3c4bae649b6c0fade21c149e6ee9773e");
  expect((await simpanGambarKonten(client, JPEG)).id).toBe(id);
  expect(await ambilGambarKonten(client, [id, "bukan-id"])).toEqual({
    items: { [id]: JPEG },
  });

  await expect(
    simpanGambarKonten(client, "data:image/png;base64,iVBORw0KGgoAAAAA"),
  ).rejects.toThrow("Foto harus berformat WebP atau JPEG.");

  // Dirujuk konten: bertahan walau sudah lebih dari sehari.
  await client.execute({
    sql: "UPDATE konten_gambar SET created_at = datetime('now', '-2 day') WHERE id_gambar = ?;",
    args: [id],
  });
  await savePageContent(client, "landing", {
    "landing.fasilitas_items": JSON.stringify([{ name: "Lab", foto: id }]),
  });
  expect(Object.keys((await ambilGambarKonten(client, [id])).items)).toEqual([
    id,
  ]);

  // Rujukannya dilepas: terhapus pada simpan berikutnya.
  await savePageContent(client, "landing", { "landing.fasilitas_items": "" });
  expect((await ambilGambarKonten(client, [id])).items).toEqual({});
});
