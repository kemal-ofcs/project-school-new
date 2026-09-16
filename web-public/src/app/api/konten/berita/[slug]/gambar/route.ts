import { NextResponse } from "next/server";
import { getReadyPublicDatabase } from "@/lib/server/db";
import { readArticleCoverBySlug } from "@/lib/services/content";

export const runtime = "nodejs";

/**
 * Gambar sampul satu artikel berita.
 *
 * Sengaja `GET`, dan itu sah di sini: `web-public` adalah build server tanpa
 * `output: "export"` — larangan handler `GET` di repo ini berlaku untuk
 * `web-desktop` dan `mobile`, yang mengekspor statis. Tidak ada mutasi di sini,
 * jadi juga tidak ada `assertSameOriginMutation`: ini gambar publik yang memang
 * dimaksudkan tampil di halaman mana pun.
 *
 * Alasan endpoint ini ada: sebelumnya data URI gambarnya disisipkan langsung ke
 * dalam HTML daftar berita. Dengan batas 500 KB per gambar dan 20 artikel per
 * halaman, satu kali muat bisa mengirim sekitar 10 MB, tidak bisa di-cache
 * terpisah, dan tidak bisa dimuat malas. Dilayani sebagai berkas seperti ini,
 * ketiganya beres sekaligus.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  try {
    const client = await getReadyPublicDatabase();
    const dataUri = await readArticleCoverBySlug(client, slug);
    if (!dataUri) {
      return new NextResponse(null, { status: 404 });
    }

    // Bentuknya sudah dijamin validator penyimpanan di kedua jalur tulis
    // (`validasiGambarSampul` di TypeScript, `is_valid_cover_image_data_uri` di
    // Rust). Tetap diurai dengan hati-hati: baris yang lahir sebelum keduanya
    // ada bisa saja berbentuk lain, dan 404 jauh lebih baik daripada melempar.
    // `[\s\S]` dan bukan bendera `s`: target TypeScript workspace ini di bawah
    // es2018, dan bendera itu belum ada di sana.
    const cocok = /^data:(image\/(?:jpeg|png|webp));base64,([\s\S]+)$/.exec(
      dataUri,
    );
    if (!cocok) {
      return new NextResponse(null, { status: 404 });
    }

    const [, mime, base64] = cocok;
    let bytes: Buffer;
    try {
      bytes = Buffer.from(base64, "base64");
    } catch {
      return new NextResponse(null, { status: 404 });
    }
    if (bytes.length === 0) {
      return new NextResponse(null, { status: 404 });
    }

    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Content-Length": String(bytes.length),
        // Disamakan dengan ISR situs (300 detik). `stale-while-revalidate`
        // membuat gambar lama tetap tampil selagi yang baru diambil, sehingga
        // mengganti sampul tidak pernah memunculkan kotak kosong sesaat.
        "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      },
    });
  } catch (error) {
    console.error(`[web-public] gagal membaca gambar sampul '${slug}':`, error);
    return new NextResponse(null, { status: 404 });
  }
}
