import { createClient } from "@libsql/client";
import { resolveServerDatabaseConfig } from "../src/lib/server/database-config";
import {
  MINIMUM_SCHEMA_VERSION,
  REQUIRED_TABLES,
} from "../src/lib/server/schema-readiness";

/**
 * Periksa kesiapan skema dari terminal, memakai environment yang SAMA dengan
 * situs publik.
 *
 * Ada karena pesan "Database sekolah belum selesai disiapkan" di layar sengaja
 * tidak menyebut alasannya, sementara alasannya hanya tercetak di log server —
 * tempat yang merepotkan untuk dibaca ketika yang ingin dijawab cuma satu
 * pertanyaan: database mana yang sebenarnya sedang dibaca, dan apa yang kurang
 * di sana.
 *
 * Skrip ini HANYA MEMBACA. Ia tidak pernah membuat tabel — aturan yang sama
 * dengan situs publiknya sendiri.
 */

const config = resolveServerDatabaseConfig(process.env);

// Token TIDAK pernah dicetak. Yang dicetak hanya host-nya, yang justru itulah
// yang perlu dibandingkan antara dua project Vercel.
let host = config.url;
try {
  host = new URL(config.url).host || config.url;
} catch {
  // URL berbentuk `file:…` tidak punya host; dicetak apa adanya. Ini bukan
  // kegagalan — justru temuan penting, karena berarti environment-nya tidak
  // menunjuk Turso sama sekali.
}

console.log("──────────────────────────────────────────────");
console.log(`  Database dibaca : ${host}`);
console.log(`  Bertoken        : ${config.authToken ? "ya" : "TIDAK"}`);
console.log(
  `  Remote          : ${config.isRemote ? "ya" : "TIDAK (berkas lokal!)"}`,
);
console.log("──────────────────────────────────────────────");

const client = createClient({ url: config.url, authToken: config.authToken });

try {
  const daftar = await client.execute(
    "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name;",
  );
  const ada = new Set(daftar.rows.map((baris) => String(baris.name)));

  console.log(`  Total tabel     : ${ada.size}`);

  let versi = 0;
  if (ada.has("schema_migration")) {
    const hasil = await client.execute(
      "SELECT COALESCE(MAX(version), 0) AS version FROM schema_migration;",
    );
    versi = Number(hasil.rows[0]?.version ?? 0);
  }
  console.log(
    `  Versi skema     : ${versi} (minimum ${MINIMUM_SCHEMA_VERSION})`,
  );
  console.log("");

  const hilang: string[] = [];
  for (const tabel of REQUIRED_TABLES) {
    const punya = ada.has(tabel);
    console.log(`  ${punya ? "✅" : "❌"} ${tabel}`);
    if (!punya) hilang.push(tabel);
  }

  console.log("");
  if (hilang.length === 0 && versi >= MINIMUM_SCHEMA_VERSION) {
    console.log("  🎉 Skema SIAP. Situs publik seharusnya bisa melayani.");
    console.log(
      "     Bila layarnya masih menolak, environment di Vercel berbeda dari",
    );
    console.log("     yang dipakai skrip ini — bandingkan host di atas.");
  } else if (hilang.length > 0) {
    console.log(`  ❌ Tabel belum ada: ${hilang.join(", ")}`);
    console.log(
      "     Buka panel admin (web-desktop) atau aplikasi Desktop yang menunjuk",
    );
    console.log("     database INI satu kali untuk memasangnya.");
  } else {
    console.log(
      `  ❌ Versi skema ${versi} di bawah minimum ${MINIMUM_SCHEMA_VERSION}.`,
    );
    console.log(
      "     Panel admin yang memprovisioning database ini memakai kode lama;",
    );
    console.log("     deploy ulang panel adminnya lalu buka sekali.");
  }
} finally {
  client.close();
}
