/**
 * Halaman pemberitahuan saat situs tidak boleh dilayani.
 *
 * Ditulis sebagai HTML utuh, bukan halaman Next.js, karena tiga alasan:
 *
 * 1. Ia dikirim langsung oleh `proxy.ts`, sebelum layout dijalankan. Layout
 *    situs memuat profil sekolah untuk header dan footer; halaman ini justru
 *    tidak boleh menampilkan konten sekolah apa pun.
 * 2. Statusnya harus 503. Halaman yang dirender layout selalu 200, dan mesin
 *    pencari akan meng-index pemberitahuan ini sebagai isi situs sekolah.
 * 3. Ia harus tetap tampil walau database tidak terjangkau.
 *
 * Teksnya SENGAJA tidak menyebut alasan. Warna dan ukuran hurufnya mengikuti
 * token situs (`globals.css`) dan skala tipografi mobile di `DESIGN.md`.
 */
export const HALAMAN_TIDAK_TERSEDIA = `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Situs sedang tidak tersedia</title>
<style>
:root { color-scheme: light dark; --latar: #f8f9ff; --teks: #0b1c30; --teks-lembut: #475569; --garis: #e2e8f0; }
@media (prefers-color-scheme: dark) {
  :root { --latar: #0b1320; --teks: #f1f5f9; --teks-lembut: #94a3b8; --garis: #26354a; }
}
* { box-sizing: border-box; }
body {
  margin: 0; min-height: 100dvh; display: grid; align-items: center;
  padding: 24px 16px; background: var(--latar); color: var(--teks);
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
main { width: 100%; max-width: 32rem; margin: 0 auto; }
h1 { margin: 0; font-size: 1.5rem; line-height: 2rem; font-weight: 700; letter-spacing: -0.01em; }
p { margin: 12px 0 0; font-size: 0.9375rem; line-height: 1.375rem; color: var(--teks-lembut); }
.pengelola { margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--garis); font-size: 0.8125rem; line-height: 1.125rem; }
</style>
</head>
<body>
<main>
<h1>Situs ini sedang tidak tersedia</h1>
<p>Silakan kembali lagi nanti, atau hubungi sekolah secara langsung.</p>
<p class="pengelola">Pengelola situs: masuk ke aplikasi admin untuk melihat penyebabnya.</p>
</main>
</body>
</html>
`;

/** Jawaban API untuk keadaan yang sama; pemanggilnya menampilkan `message`. */
export const PESAN_SITUS_TIDAK_TERSEDIA = "Situs ini sedang tidak tersedia.";

/** Pendaftaran PMB saat lisensi dalam mode baca-saja. */
export const PESAN_PENDAFTARAN_DITUTUP =
  "Pendaftaran online sedang ditutup sementara. Silakan hubungi sekolah untuk mendaftar.";
