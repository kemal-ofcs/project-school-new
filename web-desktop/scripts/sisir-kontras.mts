/**
 * Penyisiran kontras saat berjalan (PRD UI navy + emas, langkah 0c).
 *
 * `audit:kontras` hanya membaca `className`, jadi teks putih yang latarnya
 * berasal dari elemen induk lolos. Skrip ini membuka setiap halaman di kedua
 * tema, lalu menghitung kontras setiap simpul teks terhadap latar efektifnya
 * (warna latar leluhur yang ditumpuk sampai buram).
 *
 * Tanpa database: sesi Superadmin ditiru, semua `/api/**` lain dibalas 503
 * (bukan 401, karena 401 mengakhiri sesi). Halaman tampil dalam keadaan kosong
 * atau galat, dan justru itu yang ikut diperiksa.
 *
 * Jalankan dengan Node (Bun macet meluncurkan Chromium di Windows) saat
 * `bun dev` menyala:
 *   node scripts/sisir-kontras.mts [laporan.json]
 */
import fs from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.SISIR_BASE ?? "http://localhost:3000";
const OUT = process.argv[2] ?? "sisir-kontras.json";
const HALAMAN = [
  "/",
  "/akademik",
  "/audit-absensi",
  "/bimbingan-konseling",
  "/dasbor-kehadiran",
  "/dashboard",
  "/forbidden",
  "/foto-absensi",
  "/guru",
  "/history",
  "/holidays",
  "/id-cards",
  "/inventaris",
  "/jam-kosong",
  "/jurnal-mengajar",
  "/karyawan",
  "/kasbon",
  "/kepegawaian",
  "/keuangan",
  "/konten",
  "/leger-kehadiran",
  "/login",
  "/lupa-password",
  "/nilai",
  "/notifikasi-wa",
  "/operational",
  "/operators",
  "/payroll",
  "/payroll/config",
  "/payroll/config/bpjs-rules",
  "/payroll/config/jp-rates",
  "/payroll/config/overtime-rules",
  "/payroll/config/tax-rules",
  "/payroll/pelaporan",
  "/payroll/rapel",
  "/payroll/runs",
  "/pengajuan",
  "/pmb",
  "/presensi-kelas",
  "/riwayat-identitas-karyawan",
  "/riwayat-reset-password",
  "/settings",
  "/shift",
  "/siswa",
  "/tagihan",
  "/uks",
  "/wajah",
];

const OPERATOR = {
  id: 1,
  kode_operator: "OP-001",
  nama_operator: "Superadmin",
  username: "superadmin",
  role: "Superadmin",
  roleId: 1,
  roleKey: "superadmin",
  isSuperadmin: true,
  permissions: [],
  permissionRevision: 1,
};

interface Temuan {
  halaman: string;
  tema: string;
  teks: string;
  warna: string;
  latar: string;
  rasio: number;
  minimal: number;
  elemen: string;
}

type Rgba = { r: number; g: number; b: number; a: number };

/** Dijalankan di halaman: daftar teks yang kontrasnya di bawah ambang WCAG. */
function periksa() {
  // Tailwind v4 menulis warna sebagai oklch(); kanvas menormalkan format apa
  // pun ke sRGB, jadi tidak ada warna yang diam-diam terbaca "kosong".
  const kanvas = document.createElement("canvas").getContext("2d", {
    willReadFrequently: true,
  }) as CanvasRenderingContext2D;
  const rgba = (s: string): Rgba | null => {
    if (!s || s === "transparent") return null;
    kanvas.clearRect(0, 0, 1, 1);
    kanvas.fillStyle = "#000";
    kanvas.fillStyle = s;
    kanvas.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = kanvas.getImageData(0, 0, 1, 1).data;
    return a === 0 ? null : { r, g, b, a: a / 255 };
  };
  const lum = ({ r, g, b }: { r: number; g: number; b: number }) => {
    const f = (c: number) => {
      const v = c / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const tumpuk = (atas: Rgba, bawah: Rgba): Rgba => ({
    r: atas.r * atas.a + bawah.r * (1 - atas.a),
    g: atas.g * atas.a + bawah.g * (1 - atas.a),
    b: atas.b * atas.a + bawah.b * (1 - atas.a),
    a: 1,
  });
  /** Latar efektif; null bila ada gradien/gambar di jalurnya (tak bisa dihitung). */
  const latarEfektif = (el: Element) => {
    const lapisan: Rgba[] = [];
    for (let n: Element | null = el; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage !== "none") return null;
      const c = rgba(cs.backgroundColor);
      if (c && c.a > 0) {
        lapisan.push(c);
        if (c.a >= 1) break;
      }
    }
    let hasil = { r: 255, g: 255, b: 255, a: 1 };
    for (const l of lapisan.reverse()) hasil = tumpuk(l, hasil);
    return hasil;
  };
  const temuan: Omit<Temuan, "halaman" | "tema">[] = [];
  const jalan = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const sudah = new Set<Element>();
  for (let t = jalan.nextNode(); t; t = jalan.nextNode()) {
    const el = t.parentElement;
    if (!el || sudah.has(el) || !t.textContent?.trim()) continue;
    sudah.add(el);
    if (
      el.closest(
        "[disabled],[aria-disabled='true'],[aria-hidden='true'],.sr-only,svg,canvas,video",
      )
    )
      continue;
    const cs = getComputedStyle(el);
    const kotak = el.getBoundingClientRect();
    if (kotak.width === 0 || kotak.height === 0 || cs.visibility === "hidden")
      continue;
    let opasitas = 1;
    for (let n: Element | null = el; n; n = n.parentElement)
      opasitas *= Number(getComputedStyle(n).opacity);
    if (opasitas < 0.1) continue;
    const latar = latarEfektif(el);
    const warna = rgba(cs.color);
    if (!latar || !warna) continue;
    const depan = tumpuk({ ...warna, a: warna.a * opasitas }, latar);
    const [a, b] = [lum(depan), lum(latar)].sort((x, y) => y - x);
    const rasio = (a + 0.05) / (b + 0.05);
    const px = Number.parseFloat(cs.fontSize);
    const tebal = Number(cs.fontWeight) >= 700;
    const minimal = px >= 24 || (px >= 18.66 && tebal) ? 3 : 4.5;
    if (rasio >= minimal) continue;
    const hex = (c: Rgba) =>
      `#${[c.r, c.g, c.b].map((v: number) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
    temuan.push({
      teks: t.textContent.trim().slice(0, 60),
      warna: hex(depan),
      latar: hex(latar),
      rasio: Math.round(rasio * 100) / 100,
      minimal,
      elemen: `${el.tagName.toLowerCase()}.${String(el.className).split(/\s+/).slice(0, 8).join(".")}`,
    });
  }
  return temuan;
}

const browser = await chromium.launch({ channel: "msedge", headless: true });
const semua: Temuan[] = [];
// Kedua tema berjalan bersamaan; spinner yang tak pernah hilang (API dibalas
// 503) hanya ditunggu 4 detik supaya satu putaran tidak memakan setengah jam.
await Promise.all(
  ["dark", "light"].map(async (tema) => {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    });
    await ctx.addInitScript((t) => localStorage.setItem("sppg_theme", t), tema);
    await ctx.route("**/api/**", (route) => {
      if (route.request().url().includes("/api/auth/session")) {
        return route.fulfill({
          status: 200,
          json: { sukses: true, operator: OPERATOR },
        });
      }
      return route.fulfill({
        status: 503,
        json: { sukses: false, pesan: "sisir" },
      });
    });
    const page = await ctx.newPage();
    // SISIR_HALAMAN="/guru,/history" menyisir sebagian saja.
    for (const halaman of process.env.SISIR_HALAMAN?.split(",") ?? HALAMAN) {
      try {
        await page.goto(BASE + halaman, {
          waitUntil: "domcontentloaded",
          timeout: 180_000,
        });
        await page
          .waitForFunction(
            () => !document.querySelector(".animate-spin"),
            null,
            {
              timeout: 4_000,
            },
          )
          .catch(() => {});
        await page.waitForTimeout(500);
        const hasil = await page.evaluate(periksa);
        for (const h of hasil) semua.push({ halaman, tema, ...h });
        // Ditulis setiap halaman: server dev mengompilasi tiap rute saat
        // pertama dibuka (±15 dtk), jadi putaran yang terpotong tetap berguna.
        fs.writeFileSync(OUT, JSON.stringify(semua, null, 2));
        console.log(`${tema.padEnd(5)} ${halaman.padEnd(34)} ${hasil.length}`);
      } catch (galat) {
        console.log(
          `${tema.padEnd(5)} ${halaman.padEnd(34)} GAGAL ${(galat as Error).message.slice(0, 60)}`,
        );
      }
    }
    await ctx.close();
  }),
);
await browser.close();
fs.writeFileSync(OUT, JSON.stringify(semua, null, 2));
console.log(`\n${semua.length} teks di bawah ambang. Laporan: ${OUT}`);
