import { type NextRequest, NextResponse } from "next/server";
import {
  HALAMAN_TIDAK_TERSEDIA,
  PESAN_PENDAFTARAN_DITUTUP,
  PESAN_SITUS_TIDAK_TERSEDIA,
} from "@/lib/server/halaman-tidak-tersedia";
import { HEADER_LISENSI, vonisLisensiPublik } from "@/lib/server/license-gate";

/**
 * Gerbang lisensi situs publik.
 *
 * Ada di sini, bukan di layout, karena dua hal. Layout membaca profil sekolah
 * dan di-cache lima menit; membaca host permintaan di sana membuat seluruh
 * situs dirender ulang pada setiap kunjungan. Dan jawaban yang benar untuk
 * situs yang tidak boleh dilayani adalah 503, yang tidak bisa dikirim dari
 * dalam layout.
 *
 * Pada build yang tidak menegakkan lisensi, `vonisLisensiPublik` langsung
 * menjawab "terbuka" tanpa menyentuh database.
 */
export async function proxy(request: NextRequest) {
  // Nilai kiriman klien SELALU dibuang lebih dulu, supaya header ini hanya
  // pernah berisi apa yang diputuskan di sini.
  const headers = new Headers(request.headers);
  headers.delete(HEADER_LISENSI);

  const vonis = await vonisLisensiPublik(request);
  const path = request.nextUrl.pathname;
  const api = path.startsWith("/api/");

  if (vonis === "terblokir") {
    const jawaban = {
      status: 503,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": "3600",
        "X-Robots-Tag": "noindex",
      },
    };
    if (api) {
      return NextResponse.json(
        { error: "SITUS_TIDAK_TERSEDIA", message: PESAN_SITUS_TIDAK_TERSEDIA },
        jawaban,
      );
    }
    return new NextResponse(HALAMAN_TIDAK_TERSEDIA, {
      ...jawaban,
      headers: {
        ...jawaban.headers,
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",
      },
    });
  }

  if (vonis === "baca-saja") {
    // Pendaftaran baru ditolak di sini, sebelum berkas 5 MB-nya dibaca.
    // Halaman formulirnya membaca header di bawah dan tidak menampilkan
    // formulir sama sekali, supaya tidak ada yang mengisinya sampai selesai
    // hanya untuk ditolak di akhir.
    if (path === "/api/pmb/daftar") {
      return NextResponse.json(
        { error: "PENDAFTARAN_DITUTUP", message: PESAN_PENDAFTARAN_DITUTUP },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    headers.set(HEADER_LISENSI, "baca-saja");
  }

  return NextResponse.next({ request: { headers } });
}

export const config = {
  // Aset build tidak perlu melewati gerbang: halaman pemberitahuan tidak
  // memakainya, dan halaman lain sudah lolos gerbang sebelum memintanya.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
