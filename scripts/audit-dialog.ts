/**
 * Cari permukaan modal buatan tangan yang melewati `<Modal>` dan `<dialog>`.
 *
 * Yang dicari: overlay `fixed inset-0` yang isinya berperilaku seperti dialog
 * (punya judul atau tombol tutup), tetapi bukan elemen `<dialog>` dan tidak
 * memakai `role="dialog"`. Permukaan seperti itu tidak punya fokus masuk,
 * tidak memulangkan fokus, tidak mengunci gulir, dan tidak menahan Tab.
 */
import fs from "node:fs";
import path from "node:path";

const rootDir = path.resolve(import.meta.dir, "..");
// `web-public` ikut sejak Fase 5.0, sebelum satu pun modal ditulis di sana.
// Itu disengaja: tujuh belas overlay buatan tangan di web-desktop lahir satu
// per satu, masing-masing tampak wajar saat ditulis, dan baru terlihat sebagai
// pola setelah menumpuk. Memasang gerbangnya sejak hari pertama lebih murah
// daripada mengulang pembersihan yang sama di workspace ketiga.
const WORKSPACES = ["web-desktop", "mobile", "web-public"];

function kumpulkan(dir: string, hasil: string[] = []): string[] {
  if (!fs.existsSync(dir)) return hasil;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules") continue;
      kumpulkan(p, hasil);
    } else if (e.name.endsWith(".tsx")) hasil.push(p);
  }
  return hasil;
}

/** Cari indeks tag pembuka JSX yang memiliki className pada posisi ini. */
function awalTag(sumber: string, posisi: number): number {
  return sumber.lastIndexOf("<", posisi);
}

let total = 0;
const temuan: Array<{ berkas: string; baris: number; petunjuk: string }> = [];

for (const ws of WORKSPACES) {
  for (const abs of [
    ...kumpulkan(path.join(rootDir, ws, "src/app")),
    ...kumpulkan(path.join(rootDir, ws, "src/components")),
  ]) {
    const berkas = path.relative(rootDir, abs).replace(/\\/g, "/");
    if (berkas.endsWith("ui/Modal.tsx")) continue;
    const sumber = fs.readFileSync(abs, "utf8");

    for (const m of sumber.matchAll(/fixed inset-0/g)) {
      if (m.index === undefined) continue;
      const mulaiTag = awalTag(sumber, m.index);
      if (mulaiTag === -1) continue;
      const namaTag = sumber.slice(mulaiTag + 1, mulaiTag + 9);
      // Elemen <dialog> native sudah membawa semantik dan Escape sendiri.
      if (namaTag.startsWith("dialog")) continue;

      total++;
      // Blok setelah overlay: apakah ia berperilaku seperti dialog?
      const blok = sumber.slice(m.index, m.index + 1600);
      // `role="dialog"` bisa berada SEBELUM `className` pada tag yang sama,
      // jadi jendela ke depan saja tidak cukup — itu sempat menuduh
      // QrFullscreenDialog yang sebenarnya sudah benar.
      const tagPenuh = sumber.slice(mulaiTag, m.index + 400);
      const punyaRole = /role=["']dialog["']/.test(tagPenuh);
      if (punyaRole) continue;

      const punyaJudul = /<h[1-4]\b/.test(blok);
      const punyaTutup = /Tutup|Batal|aria-label=["'][^"']*[Tt]utup/.test(blok);
      if (!punyaJudul && !punyaTutup) continue;

      temuan.push({
        berkas,
        baris: sumber.slice(0, m.index).split("\n").length,
        petunjuk: [punyaJudul ? "judul" : null, punyaTutup ? "tombol tutup" : null]
          .filter(Boolean)
          .join(" + "),
      });
    }
  }
}

console.log(`\n${"─".repeat(70)}\nAudit Permukaan Dialog\n${"─".repeat(70)}`);
console.log(`  Overlay layar penuh : ${total}`);
console.log(`  Tanpa semantik      : ${temuan.length}`);

if (temuan.length > 0) {
  console.log(`\n${"─".repeat(70)}\nPelanggaran\n${"─".repeat(70)}`);
  for (const t of temuan) {
    console.log(`  ❌ ${t.berkas}:${t.baris}  (${t.petunjuk})`);
  }
  console.error(
    `\n❌ ${temuan.length} permukaan dialog buatan tangan.\n` +
      '   Pakai <Modal> dari @/components/ui/Modal — ia membawa role="dialog",\n' +
      "   aria-modal, Escape, fokus masuk/kembali, kunci gulir, dan jebakan Tab.\n" +
      "   Dialog layar penuh yang memang bespoke boleh memakai <dialog> native.\n",
  );
  process.exit(1);
}
console.log("\n🎉 Setiap permukaan dialog memakai <Modal> atau <dialog> native.\n");
