/**
 * Audit teks putih di atas latar berwarna.
 *
 * Tema terang Web memaksa `.text-white`, `.text-slate-100`, dan
 * `.text-slate-200` menjadi tinta gelap (`globals.css`, blok "text-white"),
 * kecuali di atas sembilan latar solid yang didaftar di sana. Mobile lebih
 * keras: `--color-white` dibalik menjadi #0f172a, tanpa pengecualian. Akibatnya,
 * tombol `bg-indigo-600 text-white` atau chip `bg-[#003399] text-white` di
 * tema terang bertuliskan gelap di atas latar gelap (chip filter aktif dulu
 * ±1,6:1, hampir tak terbaca).
 *
 * Teks di atas latar berwarna memakai `text-on-accent`, yang putih di kedua
 * tema. Gate ini memeriksa setiap string literal di dalam `className`, karena
 * satu ternary bisa memuat cabang berwarna dan cabang slate yang benar memakai
 * `text-white`.
 *
 * Batasannya: latar yang datang dari elemen induk tidak terlihat oleh analisis
 * statis. Itu ditangkap penyisiran kontras saat berjalan (PRD UI navy + emas, 0c).
 */
import fs from "node:fs";
import path from "node:path";

const rootDir = path.resolve(import.meta.dir, "..");

/** Latar solid yang teks putihnya dipulihkan blok tema terang workspace itu. */
const DAFTAR_PUTIH: Record<string, Set<string>> = {
  "web-desktop": new Set([
    "bg-sky-500",
    "bg-sky-600",
    "bg-sky-700",
    "bg-blue-600",
    "bg-emerald-600",
    "bg-emerald-500",
    "bg-rose-600",
    "bg-rose-500",
    "bg-amber-600",
  ]),
  mobile: new Set(),
};

const TEKS_TERANG =
  /(?:^|\s)(text-white|text-slate-100|text-slate-200)(?=\s|$)/;
const LATAR =
  /(?:^|\s)(bg-(?:[a-z]+-(?:[5-9]00|950)|\[#[0-9a-fA-F]{3,8}\]|gradient-to-[a-z]+|linear-to-[a-z]+))(?=\s|$)/g;
const NETRAL = /^bg-(slate|gray|zinc|neutral|stone)-/;

interface Pelanggaran {
  berkas: string;
  baris: number;
  cuplikan: string;
}

function kumpulkanTsx(direktori: string, hasil: string[] = []): string[] {
  if (!fs.existsSync(direktori)) return hasil;
  for (const entri of fs.readdirSync(direktori, { withFileTypes: true })) {
    const penuh = path.join(direktori, entri.name);
    if (entri.isDirectory()) {
      if (entri.name !== "node_modules") kumpulkanTsx(penuh, hasil);
    } else if (entri.name.endsWith(".tsx")) {
      hasil.push(penuh);
    }
  }
  return hasil;
}

/** Ekspresi nilai `className=` sampai akhir atributnya (kurung kurawal seimbang). */
function nilaiAtribut(sumber: string, mulai: number): string {
  const awal = sumber[mulai];
  if (awal === '"' || awal === "'") {
    return sumber.slice(mulai, sumber.indexOf(awal, mulai + 1) + 1);
  }
  if (awal !== "{") return "";
  let kedalaman = 0;
  for (let i = mulai; i < sumber.length; i++) {
    const c = sumber[i];
    if (c === '"' || c === "'" || c === "`") {
      i = akhirString(sumber, i);
      continue;
    }
    if (c === "{") kedalaman++;
    if (c === "}" && --kedalaman === 0) return sumber.slice(mulai, i + 1);
  }
  return "";
}

function akhirString(sumber: string, mulai: number): number {
  const kutip = sumber[mulai];
  for (let i = mulai + 1; i < sumber.length; i++) {
    if (sumber[i] === "\\") i++;
    else if (kutip === "`" && sumber[i] === "$" && sumber[i + 1] === "{") {
      let kedalaman = 0;
      for (i++; i < sumber.length; i++) {
        if (sumber[i] === "{") kedalaman++;
        else if (sumber[i] === "}" && --kedalaman === 0) break;
        else if ("\"'`".includes(sumber[i])) i = akhirString(sumber, i);
      }
    } else if (sumber[i] === kutip) return i;
  }
  return sumber.length;
}

/** Setiap potongan teks statis: string kutip, dan bagian statis template literal. */
function literal(ekspresi: string, hasil: string[] = []): string[] {
  for (let i = 0; i < ekspresi.length; i++) {
    const c = ekspresi[i];
    if (c === '"' || c === "'") {
      const akhir = akhirString(ekspresi, i);
      hasil.push(ekspresi.slice(i + 1, akhir));
      i = akhir;
    } else if (c === "`") {
      let statis = "";
      let j = i + 1;
      for (; j < ekspresi.length && ekspresi[j] !== "`"; j++) {
        if (ekspresi[j] === "$" && ekspresi[j + 1] === "{") {
          let kedalaman = 0;
          const awal = j + 2;
          for (j++; j < ekspresi.length; j++) {
            if (ekspresi[j] === "{") kedalaman++;
            else if (ekspresi[j] === "}" && --kedalaman === 0) break;
            else if ("\"'`".includes(ekspresi[j])) j = akhirString(ekspresi, j);
          }
          literal(ekspresi.slice(awal, j), hasil);
          statis += " ";
        } else {
          statis += ekspresi[j];
        }
      }
      hasil.push(statis);
      i = j;
    }
  }
  return hasil;
}

const pelanggaran: Pelanggaran[] = [];
let diperiksa = 0;

for (const [workspace, daftarPutih] of Object.entries(DAFTAR_PUTIH)) {
  for (const penuh of kumpulkanTsx(path.join(rootDir, workspace, "src"))) {
    const sumber = fs.readFileSync(penuh, "utf8");
    const berkas = path.relative(rootDir, penuh).replaceAll("\\", "/");
    for (const cocok of sumber.matchAll(/className=/g)) {
      const ekspresi = nilaiAtribut(sumber, cocok.index + "className=".length);
      for (const potongan of literal(ekspresi)) {
        if (!TEKS_TERANG.test(potongan)) continue;
        diperiksa++;
        const latar = [...potongan.matchAll(LATAR)]
          .map((m) => m[1])
          .filter((b) => !NETRAL.test(b) && !daftarPutih.has(b));
        if (latar.length === 0) continue;
        pelanggaran.push({
          berkas,
          baris: sumber.slice(0, cocok.index).split("\n").length,
          cuplikan: potongan.replace(/\s+/g, " ").trim().slice(0, 88),
        });
      }
    }
  }
}

console.log(`\n  Potongan className bertinta terang: ${diperiksa}`);
console.log(`  Di atas latar berwarna             : ${pelanggaran.length}`);

if (pelanggaran.length > 0) {
  console.log(`\n${"─".repeat(70)}\nPelanggaran\n${"─".repeat(70)}`);
  for (const { berkas, baris, cuplikan } of pelanggaran) {
    console.log(`  ❌ ${berkas}:${baris}\n     ${cuplikan}`);
  }
  console.error(
    `\n❌ ${pelanggaran.length} teks putih di atas latar berwarna.\n` +
      "   Ganti `text-white` dengan `text-on-accent` pada potongan yang sama:\n" +
      "   tema terang membalik `text-white` menjadi tinta gelap.\n",
  );
  process.exit(1);
}
console.log("\n🎉 Tidak ada teks putih di atas latar berwarna.\n");
