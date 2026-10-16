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

/**
 * Poin keunggulan dari CMS: satu butir per baris, ATAU satu paragraf bernomor
 * ("1. A 2. B 3. C") seperti yang sering diketik di kotak deskripsi. Paragraf
 * hanya dipecah bila nomornya berurutan mulai 1, supaya angka biasa di tengah
 * kalimat ("setoran 3 Juz") tidak memotong poin.
 */
export function pecahPoin(teks: string): string[] {
  const baris = pecahButir(teks);
  if (baris.length !== 1) return baris;
  // Teks asli, bukan `baris[0]`: `pecahButir` sudah membuang "1." di depannya.
  const bagian = teks.trim().split(/\s+(?=\d{1,2}[.)]\s)/);
  const nomorUrut = bagian.every(
    (b, i) => Number.parseInt(b, 10) === i + 1 && /^\d{1,2}[.)]\s/.test(b),
  );
  if (bagian.length < 2 || !nomorUrut) return baris;
  return bagian
    .map((b) => b.replace(/^\d{1,2}[.)]\s*/, "").trim())
    .filter(Boolean);
}

/**
 * Tautan `wa.me` dari nomor telepon profil sekolah (`0812…`, `+62 812…`).
 * `null` bila nomornya kosong atau terlalu pendek untuk nomor sungguhan:
 * tombol WhatsApp disembunyikan, tidak diarahkan ke nomor contoh milik orang
 * lain.
 */
export function tautanWhatsApp(
  nomor: string | null | undefined,
  pesan: string,
): string | null {
  const angka = (nomor ?? "").replace(/\D/g, "");
  if (angka.length < 8) return null;
  const internasional = angka.startsWith("0") ? `62${angka.slice(1)}` : angka;
  return `https://wa.me/${internasional}?text=${encodeURIComponent(pesan)}`;
}
