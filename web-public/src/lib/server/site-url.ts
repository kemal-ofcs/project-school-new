/**
 * Alamat kanonik situs, untuk sitemap, robots, dan URL absolut di metadata.
 *
 * Dibaca dari environment karena tiap sekolah memakai domainnya sendiri dan
 * tidak ada satu pun nilai yang benar untuk semua. `VERCEL_PROJECT_PRODUCTION_URL`
 * dipakai sebagai cadangan supaya deployment pertama sudah menghasilkan sitemap
 * yang benar sebelum ada yang sempat menyetel variabelnya.
 *
 * Preview deployment SENGAJA tidak ikut dipakai sebagai fallback: alamatnya
 * berubah tiap build, dan sitemap yang menunjuk ke sana akan mengundang mesin
 * pencari meng-index salinan sementara sebagai situs resmi sekolah.
 */
export interface SiteUrlEnvironment {
  NEXT_PUBLIC_SITE_URL?: string;
  VERCEL_PROJECT_PRODUCTION_URL?: string;
  /**
   * Alamat deployment saat ini, termasuk preview. Didaftarkan di sini justru
   * untuk menegaskan bahwa ia SENGAJA tidak dibaca: nilainya berubah tiap
   * build, dan sitemap yang menunjuk ke sana mengundang mesin pencari
   * meng-index salinan sementara sebagai situs resmi sekolah.
   */
  VERCEL_URL?: string;
}

export function resolveSiteUrl(
  // `process.env` di Next diketik dengan `NODE_ENV` wajib, sehingga ia tidak
  // cocok langsung dengan bentuk sempit di atas. Bentuk sempit itulah yang
  // membuat tes bisa memanggil fungsi ini dengan objek biasa, tanpa harus
  // mengarang seluruh environment hanya untuk memeriksa satu variabel.
  environment: SiteUrlEnvironment = process.env as SiteUrlEnvironment,
): string {
  const eksplisit = environment.NEXT_PUBLIC_SITE_URL?.trim();
  if (eksplisit) return normalkan(eksplisit);

  const vercel = environment.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return normalkan(`https://${vercel}`);

  return "http://localhost:3000";
}

function normalkan(nilai: string): string {
  const berskema = /^https?:\/\//i.test(nilai) ? nilai : `https://${nilai}`;
  // Tanpa membuang garis miring penutup, setiap URL turunan akan berbentuk
  // `https://sekolah.sch.id//profil` — sah secara teknis, tetapi mesin pencari
  // memperlakukannya sebagai alamat yang berbeda dari versi satu garis miring.
  return berskema.replace(/\/+$/, "");
}
