import type { Client } from "@libsql/client";

/**
 * Versi skema paling rendah yang sanggup dilayani situs publik.
 *
 * Angka ini MILIK web-public dan sengaja TIDAK diimpor dari
 * `web-desktop/src/lib/db-schema.ts`. Kedua aplikasi bergerak dengan kecepatan
 * berbeda: web-desktop menaikkan `CURRENT_SCHEMA_VERSION` setiap kali ia
 * menambah tabel untuk keperluannya sendiri, dan situs publik tidak boleh mati
 * hanya karena sebuah tabel payroll baru lahir. Yang diperiksa di sini adalah
 * batas bawah — "apakah database ini sudah cukup tua untuk punya yang saya
 * butuhkan" — bukan kesamaan versi.
 *
 * Naikkan angka ini hanya ketika web-public mulai membaca tabel yang lahir di
 * migrasi yang lebih baru. Fase 5.2 menaikkannya ke 26 (tabel PMB), Fase 5.4
 * ke 27 (portal wali).
 */
export const MINIMUM_SCHEMA_VERSION = 25;

/**
 * Tabel yang wajib ada sebelum satu pun halaman publik bisa dirender.
 *
 * Fase 5.1 hanya membaca profil sekolah dan branding — keduanya Kelas A yang
 * hanya DIBACA situs ini. Daftarnya bertambah per fase, tidak sekaligus:
 * memeriksa tabel yang belum dipakai berarti situs publik menolak melayani
 * karena sesuatu yang tidak ada hubungannya dengan halaman yang diminta.
 */
export const REQUIRED_TABLES = [
  "schema_migration",
  "company_profile",
  "setting_gex_system",
  // Fase 5.1: halaman Program membaca jurusan yang aktif.
  "akademik_jurusan",
] as const;

/**
 * Skema belum siap dilayani.
 *
 * Dibedakan dari error database biasa supaya lapisan di atasnya bisa
 * menampilkan halaman "situs sedang disiapkan" alih-alih 500 telanjang, dan
 * supaya pesannya menyebut TINDAKAN yang menyelesaikannya.
 */
export class SchemaNotReadyError extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(
      `Skema database belum lengkap: ${reason}. ` +
        "Buka aplikasi Desktop atau panel admin (app.<domain-sekolah>) satu kali " +
        "untuk memasangnya — situs publik sengaja tidak membuat tabel sendiri.",
    );
    this.name = "SchemaNotReadyError";
    this.reason = reason;
  }
}

export interface SchemaReadiness {
  ready: boolean;
  version: number;
  missingTables: string[];
}

/**
 * Periksa kesiapan skema TANPA menyentuhnya.
 *
 * Perbedaan penting dari `isDatabaseSchemaReady` di web-desktop: fungsi itu
 * adalah gerbang menuju `initDatabaseSchema`, yang akan MEMBUAT tabel yang
 * kurang. Fungsi ini tidak punya pasangan seperti itu, dan itu disengaja.
 *
 * Database Turso yang sama diprovisioning oleh tepat DUA jalur —
 * `turso.rs::ensure_schema` (Desktop/Mobile) dan `db-schema.ts` +
 * `db-migrations.ts` (panel admin). `CREATE TABLE IF NOT EXISTS` tidak pernah
 * memperbaiki tabel yang sudah terlanjur salah bentuk, sehingga jalur
 * provisioning KETIGA yang diam-diam membuat tabel adalah cara paling pasti
 * menghasilkan dua bentuk tabel berbeda di dua pemasangan. Situs publik
 * memilih gagal cepat dengan pesan yang bisa ditindaklanjuti.
 */
export async function inspectSchemaReadiness(
  client: Client,
  requiredTables: readonly string[] = REQUIRED_TABLES,
  minimumVersion: number = MINIMUM_SCHEMA_VERSION,
): Promise<SchemaReadiness> {
  const present = new Set<string>();
  let version = 0;

  // Nama tabel tidak bisa di-bind sebagai parameter, jadi ia disaring di sisi
  // klien: hanya nama yang memang ada di daftar konstanta di atas yang
  // dibandingkan. Daftarnya literal di kode, tidak pernah dari permintaan.
  const existing = await client.execute(
    "SELECT name FROM sqlite_master WHERE type = 'table';",
  );
  for (const row of existing.rows) {
    present.add(String(row.name));
  }

  const missingTables = requiredTables.filter((table) => !present.has(table));

  if (present.has("schema_migration")) {
    const result = await client.execute(
      "SELECT COALESCE(MAX(version), 0) AS version FROM schema_migration;",
    );
    version = Number(result.rows[0]?.version ?? 0);
  }

  return {
    ready: missingTables.length === 0 && version >= minimumVersion,
    version,
    missingTables,
  };
}

/** Bentuk melempar dari `inspectSchemaReadiness`, untuk dipakai route handler. */
export async function assertSchemaReady(
  client: Client,
  requiredTables: readonly string[] = REQUIRED_TABLES,
  minimumVersion: number = MINIMUM_SCHEMA_VERSION,
): Promise<void> {
  const readiness = await inspectSchemaReadiness(
    client,
    requiredTables,
    minimumVersion,
  );
  if (readiness.ready) return;

  if (readiness.missingTables.length > 0) {
    throw new SchemaNotReadyError(
      `tabel [${readiness.missingTables.join(", ")}] belum ada`,
    );
  }

  throw new SchemaNotReadyError(
    `versi skema ${readiness.version}, minimum yang dibutuhkan ${minimumVersion}`,
  );
}
