import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getReadyPublicDatabase } from "@/lib/server/db";
import {
  assertSameOriginMutation,
  OriginTidakDiizinkanError,
} from "@/lib/server/http/request-security";
import { COOKIE_SESI_WALI } from "@/lib/server/wali-session";
import { cabutSesiWali } from "@/lib/services/wali-auth";

export const runtime = "nodejs";

/**
 * Keluar dari portal wali.
 *
 * Sesinya DICABUT di server, bukan sekadar cookienya dihapus. Cookie yang
 * dihapus hanya hilang dari peramban itu; tokennya tetap sah bila sempat
 * disalin — misalnya dari ponsel yang dipinjamkan. "Keluar" harus berarti
 * keluar.
 */
export async function POST(request: Request) {
  try {
    assertSameOriginMutation(request);

    const token = (await cookies()).get(COOKIE_SESI_WALI)?.value;
    if (token) {
      try {
        await cabutSesiWali(await getReadyPublicDatabase(), token);
      } catch (error) {
        // Database tidak terjangkau. Cookienya tetap dihapus supaya perangkat
        // ini berhenti memakai sesinya; pencabutan di server akan gagal dan itu
        // dicatat, bukan didiamkan — sesi yang tidak tercabut masih berlaku
        // sampai kedaluwarsa.
        console.error("[web-public] pencabutan sesi wali gagal:", error);
      }
    }

    const jawaban = NextResponse.json({ keluar: true });
    jawaban.cookies.delete(COOKIE_SESI_WALI);
    return jawaban;
  } catch (error) {
    if (error instanceof OriginTidakDiizinkanError) {
      return NextResponse.json(
        { error: "FORBIDDEN", message: error.message },
        { status: 403 },
      );
    }
    console.error("[web-public] keluar portal wali gagal:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Terjadi gangguan." },
      { status: 500 },
    );
  }
}
