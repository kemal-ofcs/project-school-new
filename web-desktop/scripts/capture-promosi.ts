import { chromium, type Page } from "playwright";
import fs from "fs";
import path from "path";

const OUTPUT_DIR = path.resolve(__dirname, "../../screenshots/promosi");
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function waitForReady(p: Page) {
  // 1. Tunggu spinner dan teks loading auth / data selesai
  await p.waitForFunction(() => {
    const text = document.body ? document.body.innerText : "";
    const hasSpinner = !!document.querySelector(".animate-spin");
    const isChecking =
      text.includes("Memeriksa izin akses") ||
      text.includes("Memuat Dashboard") ||
      text.includes("Memuat bagan akun") ||
      text.includes("Memeriksa hak akses");
    return !hasSpinner && !isChecking;
  }, { timeout: 30_000 }).catch(() => {});

  // 2. Beri jeda 3 detik agar render grafik Recharts, animasi Tailwind, dan tabel stabil
  await p.waitForTimeout(3000);
}

async function capture() {
  console.log("Launching Chromium for Promotional Screenshots...");
  const browser = await chromium.launch({ headless: true });

  // 1. Desktop Context (Full HD 1920x1080, 2x Retina Scale for 4K crispness)
  const desktopContext = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
  });
  const page = await desktopContext.newPage();
  page.setDefaultTimeout(120_000);

  // 2. Mobile Context (Mobile Smartphone 412x915, 2.5x Scale)
  const mobileContext = await browser.newContext({
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2.5,
    isMobile: true,
    hasTouch: true,
  });
  const mobilePage = await mobileContext.newPage();
  mobilePage.setDefaultTimeout(120_000);

  console.log("Saving screenshots to:", OUTPUT_DIR);

  // ── 01. Login Page ──
  console.log("[1/18] Capturing Login Page...");
  await page.goto("http://localhost:3000/login", { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForSelector("#username-input", { timeout: 60_000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(OUTPUT_DIR, "01_login_page_desktop.png") });

  await mobilePage.goto("http://localhost:3000/login", { waitUntil: "domcontentloaded", timeout: 120_000 });
  await mobilePage.waitForSelector("#username-input", { timeout: 60_000 });
  await mobilePage.waitForTimeout(2000);
  await mobilePage.screenshot({ path: path.join(OUTPUT_DIR, "01_login_page_mobile.png") });

  // Login Desktop Page
  console.log("Logging in as superadmin on Desktop...");
  await page.fill("#username-input", "superadmin");
  await page.fill("#password-input", "Mekarsari1999**");
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 120_000 });
  await page.waitForTimeout(3000);
  console.log("Desktop Logged in! Current URL:", page.url());

  // Share session cookies to mobile context directly
  const cookies = await desktopContext.cookies();
  await mobileContext.addCookies(cookies);
  console.log("Mobile context authenticated via shared session cookies!");

  const targets = [
    { url: "/dashboard", name: "02_dashboard_utama", title: "Dashboard Utama (Grafik & Statistik)", mobile: true },
    { url: "/dasbor-kehadiran", name: "03_dasbor_kehadiran", title: "Dasbor Kehadiran Realtime", mobile: true },
    { url: "/scanner", name: "04_scanner_gerbang", title: "Scanner Absensi Gerbang", mobile: true },
    { url: "/inventaris", name: "05_inventaris_sarpras", title: "Inventaris Sarpras", mobile: false },
    { url: "/keuangan", name: "06_keuangan_pembukuan", title: "Keuangan Pembukuan", mobile: false },
    { url: "/tagihan", name: "07_tagihan_spp_siswa", title: "Tagihan SPP Siswa", mobile: false },
    { url: "/payroll", name: "08_payroll_penggajian", title: "Payroll Penggajian", mobile: false },
    { url: "/payroll/runs", name: "09_payroll_batch_runs", title: "Daftar Batch Payroll", mobile: false },
    { url: "/presensi-kelas", name: "10_presensi_kbm_kelas", title: "Presensi KBM Kelas", mobile: false },
    { url: "/jurnal-mengajar", name: "11_jurnal_mengajar_guru", title: "Jurnal Mengajar Guru", mobile: false },
    { url: "/notifikasi-wa", name: "12_notifikasi_whatsapp", title: "Gateway Notifikasi WhatsApp", mobile: false },
    { url: "/siswa", name: "13_manajemen_siswa", title: "Manajemen Siswa", mobile: false },
    { url: "/guru", name: "14_manajemen_guru", title: "Manajemen Guru", mobile: false },
    { url: "/id-cards", name: "15_cetak_id_card", title: "Cetak Kartu Siswa & Guru", mobile: false },
    { url: "/shift", name: "16_jadwal_shift_kerja", title: "Jadwal Shift Kerja", mobile: false },
    { url: "/settings", name: "17_pengaturan_sistem", title: "Pengaturan Sistem & Gateway", mobile: false },
  ];

  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    console.log(`\n[${i + 2}/${targets.length + 1}] Capturing ${t.title} (${t.url})...`);
    try {
      await page.goto(`http://localhost:3000${t.url}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
      await waitForReady(page);

      // Desktop screenshot
      await page.screenshot({ path: path.join(OUTPUT_DIR, `${t.name}_desktop.png`) });
      console.log(`  ✓ Berhasil (Desktop): ${t.name}_desktop.png`);

      // Mobile screenshot jika didukung
      if (t.mobile) {
        await mobilePage.goto(`http://localhost:3000${t.url}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
        await waitForReady(mobilePage);
        await mobilePage.screenshot({ path: path.join(OUTPUT_DIR, `${t.name}_mobile.png`) });
        console.log(`  ✓ Berhasil (Mobile): ${t.name}_mobile.png`);
      }
    } catch (err: any) {
      console.log(`  ✗ Gagal pada ${t.url}:`, err.message);
    }
  }

  await browser.close();
  console.log("\n=======================================================");
  console.log("Semua screenshot promosi berhasil disimpan di:", OUTPUT_DIR);
  console.log("=======================================================\n");
}

capture().catch(console.error);
