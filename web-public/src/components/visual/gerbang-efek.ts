/**
 * Syarat efek desktop (keputusan User): layar minimal 1024px, mouse, tidak
 * memilih "kurangi gerakan", dan tidak dalam mode hemat data. HP tidak pernah
 * memenuhi syarat ini, sehingga modul efeknya tidak pernah diunduh di sana.
 *
 * Dieja dua kali dengan isi yang sama: sebagai teks skrip inline di `<head>`
 * (dijalankan sebelum halaman tergambar, supaya judul tidak tampil lalu tiba-tiba
 * mulai beranimasi) dan sebagai fungsi untuk komponen klien yang memantau
 * perubahan ukuran jendela.
 */
export const KUERI_EFEK_DESKTOP =
  "(min-width: 1024px) and (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)";

export function efekDesktopBoleh(): boolean {
  const koneksi = (
    navigator as Navigator & { connection?: { saveData?: boolean } }
  ).connection;
  return matchMedia(KUERI_EFEK_DESKTOP).matches && !koneksi?.saveData;
}

// Tanpa try/catch: satu-satunya yang bisa gagal adalah browser tanpa
// `matchMedia`, dan itu diperiksa lebih dulu, jadi browser itu tetap versi ringan.
export const SKRIP_GERBANG_EFEK = `(function(){var c=navigator.connection;if(window.matchMedia&&matchMedia(${JSON.stringify(
  KUERI_EFEK_DESKTOP,
)}).matches&&!(c&&c.saveData))document.documentElement.dataset.efek="desktop"})();`;
