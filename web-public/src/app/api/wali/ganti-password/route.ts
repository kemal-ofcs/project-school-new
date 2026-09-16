import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getReadyPublicDatabase } from "@/lib/server/db";
import {
  assertSameOriginMutation,
  getClientAddress,
  OriginTidakDiizinkanError,
} from "@/lib/server/http/request-security";
import { COOKIE_SESI_WALI } from "@/lib/server/wali-session";
import {
  catatPercobaan,
  KEBIJAKAN_CEK_STATUS,
  kunciRateLimit,
  periksaRateLimit,
} from "@/lib/services/rate-limit";
import { bacaSesiWali, gantiPasswordWali } from "@/lib/services/wali-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOriginMutation(request);

    const client = await getReadyPublicDatabase();
    const token = (await cookies()).get(COOKIE_SESI_WALI)?.value;
    if (!token) {
      return NextResponse.json(
        {
          error: "UNAUTHORIZED",
          message: "Sesi tidak valid atau telah berakhir.",
        },
        { status: 401 },
      );
    }

    const sesi = await bacaSesiWali(client, token);
    if (!sesi) {
      return NextResponse.json(
        {
          error: "UNAUTHORIZED",
          message: "Sesi tidak valid atau telah berakhir.",
        },
        { status: 401 },
      );
    }

    const kunci = await kunciRateLimit(
      "wali-ganti-password",
      getClientAddress(request),
    );
    const batas = await periksaRateLimit(client, kunci);
    if (!batas.diizinkan) {
      return NextResponse.json(
        {
          error: "TERLALU_BANYAK_PERMINTAAN",
          message: `Terlalu banyak percobaan. Coba lagi dalam ${Math.ceil(batas.cobaLagiDetik / 60)} menit.`,
        },
        {
          status: 429,
          headers: { "Retry-After": String(batas.cobaLagiDetik) },
        },
      );
    }
    await catatPercobaan(client, kunci, KEBIJAKAN_CEK_STATUS);

    const body = (await request.json().catch(() => ({}))) as {
      passwordLama?: string;
      passwordBaru?: string;
    };
    const passwordLama = String(body.passwordLama ?? "");
    const passwordBaru = String(body.passwordBaru ?? "");

    if (!passwordLama || !passwordBaru) {
      return NextResponse.json(
        {
          error: "VALIDATION_ERROR",
          message: "Kata sandi saat ini dan kata sandi baru wajib diisi.",
        },
        { status: 400 },
      );
    }

    const hasil = await gantiPasswordWali(
      client,
      sesi.idSiswa,
      passwordLama,
      passwordBaru,
    );

    if (!hasil.sukses) {
      return NextResponse.json(
        {
          error: "VALIDATION_ERROR",
          message: hasil.pesanError ?? "Gagal mengubah kata sandi.",
        },
        { status: 400 },
      );
    }

    return NextResponse.json({
      berhasil: true,
      message: "Kata sandi berhasil diperbarui.",
    });
  } catch (error) {
    if (error instanceof OriginTidakDiizinkanError) {
      return NextResponse.json(
        { error: "FORBIDDEN", message: error.message },
        { status: 403 },
      );
    }
    console.error("[web-public] ganti password wali gagal:", error);
    return NextResponse.json(
      {
        error: "INTERNAL_ERROR",
        message: "Terjadi gangguan saat mengubah kata sandi.",
      },
      { status: 500 },
    );
  }
}
