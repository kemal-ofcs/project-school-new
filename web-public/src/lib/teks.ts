/**
 * Misi diketik di CMS satu butir per baris, sering sudah bernomor ("1. ...")
 * atau berpoin ("- ..."). Nomornya dibuang supaya daftar bernomor halaman
 * Profil tidak menampilkan "01  1. Menerapkan ...".
 */
export function pecahButir(teks: string): string[] {
  return teks
    .split(/\r?\n/)
    .map((baris) => baris.replace(/^\s*(?:\d+\s*[.)]|[-•*])\s*/, "").trim())
    .filter(Boolean);
}
