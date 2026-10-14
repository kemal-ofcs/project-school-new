import { NextResponse } from "next/server";
import { getReadyPublicDatabase } from "@/lib/server/db";
import { readContentImage } from "@/lib/services/gambar-konten";

export const runtime = "nodejs";

/**
 * Foto konten situs publik (fasilitas, jurusan, ekskul, hero).
 *
 * `GET` sah di sini karena `web-public` bukan static export (lihat rute gambar
 * sampul berita). Id-nya hash isi berkas, jadi jawabannya tidak pernah berubah
 * untuk id yang sama: `immutable` setahun, dan mengganti foto menghasilkan id,
 * URL, dan unduhan baru dengan sendirinya.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const gambar = await readContentImage(await getReadyPublicDatabase(), id);
    if (!gambar) return new NextResponse(null, { status: 404 });
    return new NextResponse(new Uint8Array(gambar.bytes), {
      status: 200,
      headers: {
        "Content-Type": gambar.jenis,
        "Content-Length": String(gambar.bytes.length),
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    // Tabelnya belum ada (database belum dimigrasi v48) atau tidak terjangkau.
    console.error(`[web-public] gagal membaca foto konten '${id}':`, error);
    return new NextResponse(null, { status: 404 });
  }
}
