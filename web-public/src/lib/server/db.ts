import "server-only";

import { type Client, createClient } from "@libsql/client";
import { resolveServerDatabaseConfig } from "@/lib/server/database-config";
import { assertSchemaReady } from "@/lib/server/schema-readiness";

interface PublicDatabaseState {
  client: Client | null;
  readiness: Promise<void> | null;
}

const globalDatabase = globalThis as typeof globalThis & {
  __sppgPublicDatabase?: PublicDatabaseState;
};

if (!globalDatabase.__sppgPublicDatabase) {
  globalDatabase.__sppgPublicDatabase = { client: null, readiness: null };
}
const state = globalDatabase.__sppgPublicDatabase;

/**
 * Klien Turso untuk situs publik.
 *
 * Koneksinya lahir pada AKSES PERTAMA, bukan saat modul ini di-import. Pola
 * ini disalin dari `web-desktop/src/lib/server/db.ts` beserta alasannya:
 * menyelesaikan konfigurasi database saat modul dimuat membuat `next build`
 * gagal total di mesin build yang memang tidak punya kredensial cloud, karena
 * Next mengevaluasi setiap modul route saat mengumpulkan page data. Kegagalan
 * konfigurasi seharusnya muncul saat permintaan dilayani — sebagai error yang
 * bisa dijawab, bukan sebagai build yang tidak bisa selesai.
 */
/**
 * Apakah alamat database sudah disetel sama sekali.
 *
 * Dipisahkan dari `resolveServerDatabaseConfig` (yang merupakan salinan dari
 * web-desktop dan tidak boleh disunting di sini) karena dipakai untuk keputusan
 * yang berbeda: bukan "alamat ini boleh dipakai?", melainkan "apakah orang yang
 * menjalankan build ini sudah menyetelnya?".
 */
export interface AlamatDatabaseEnvironment {
  TURSO_DATABASE_URL?: string;
  SPPG_DATABASE_URL?: string;
}

export function alamatDatabaseTersetel(
  // `process.env` di Next diketik dengan `NODE_ENV` wajib sehingga tidak cocok
  // langsung dengan bentuk sempit ini; bentuk sempitnya yang membuat fungsi ini
  // bisa diuji dengan objek biasa.
  environment: AlamatDatabaseEnvironment = process.env as AlamatDatabaseEnvironment,
): boolean {
  return Boolean(
    environment.TURSO_DATABASE_URL?.trim() ||
      environment.SPPG_DATABASE_URL?.trim(),
  );
}

export function getPublicDatabase(): Client {
  if (!state.client) {
    const config = resolveServerDatabaseConfig(process.env);
    state.client = createClient({
      url: config.url,
      authToken: config.authToken,
    });
  }

  return state.client;
}

/**
 * Klien yang sudah dipastikan skemanya siap.
 *
 * INI SATU-SATUNYA jalan yang boleh dipakai halaman dan route handler untuk
 * menyentuh database. Perhatikan yang TIDAK ada di sini: tidak ada
 * `initDatabaseSchema`, tidak ada `runDatabaseMigrations`, dan tidak ada satu
 * pun `CREATE TABLE` di seluruh workspace ini.
 *
 * Database Turso yang sama diprovisioning oleh tepat DUA jalur — Rust
 * (`turso.rs::ensure_schema`) dan panel admin (`db-schema.ts` +
 * `db-migrations.ts`) — dan keduanya wajib menghasilkan bentuk tabel yang
 * identik. Menambahkan jalur ketiga di sini akan menyalakan perlombaan yang
 * tidak bisa dimenangkan: `CREATE TABLE IF NOT EXISTS` tidak pernah
 * memperbaiki tabel yang sudah ada, sehingga siapa pun yang kalah cepat akan
 * hidup selamanya dengan bentuk tabel milik yang lain.
 */
export async function getReadyPublicDatabase(): Promise<Client> {
  const client = getPublicDatabase();

  if (!state.readiness) {
    state.readiness = assertSchemaReady(client).catch((error) => {
      // Kegagalan tidak boleh di-cache: skema bisa dipasang semenit kemudian
      // oleh operator yang membuka aplikasi Desktop, dan situs publik harus
      // pulih sendiri tanpa perlu di-deploy ulang.
      state.readiness = null;
      throw error;
    });
  }

  await state.readiness;
  return client;
}
