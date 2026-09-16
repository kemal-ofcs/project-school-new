import { NextResponse } from "next/server";
import { getReadyPublicDatabase } from "@/lib/server/db";
import {
  assertSameOriginMutation,
  getClientAddress,
  OriginTidakDiizinkanError,
} from "@/lib/server/http/request-security";
import { SchemaNotReadyError } from "@/lib/server/schema-readiness";
import { COOKIE_SESI_WALI, OPSI_COOKIE_SESI } from "@/lib/server/wali-session";
import {
  catatPercobaan,
  KEBIJAKAN_CEK_STATUS,
  kunciRateLimit,
  periksaRateLimit,
} from "@/lib/services/rate-limit";
import {
  autentikasiPasswordWali,
  cariSiswaUntukOtp,
  terbitkanSesiWali,
  verifikasiOtp,
} from "@/lib/services/wali-auth";

export const runtime = "nodejs";

/**
 * Verifikasi kredensial (Kata Sandi atau OTP WhatsApp) dan terbitkan sesi wali.
 */
export async function POST(request: Request) {
  try {
    assertSameOriginMutation(request);

    const client = await getReadyPublicDatabase();
    const body = (await request.json().catch(() => ({}))) as {
      metode?: "password" | "otp";
      nomorInduk?: string;
      password?: string;
      kode?: string;
    };
    const nomorInduk = String(body.nomorInduk ?? "").trim();
    const isPasswordMode = body.metode === "password" || Boolean(body.password);

    if (isPasswordMode) {
      const password = String(body.password ?? "");
      const kunci = await kunciRateLimit(
        "wali-masuk-password",
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

      if (!nomorInduk || !password) {
        return NextResponse.json(
          {
            error: "VALIDATION_ERROR",
            message: "Nomor induk dan kata sandi wajib diisi.",
          },
          { status: 400 },
        );
      }

      const hasil = await autentikasiPasswordWali(client, nomorInduk, password);
      if (!hasil.sukses || !hasil.idSiswa) {
        return NextResponse.json(
          {
            error: "KATA_SANDI_TIDAK_COCOK",
            message: "Nomor induk atau kata sandi tidak cocok.",
          },
          { status: 401 },
        );
      }

      const { token } = await terbitkanSesiWali(
        client,
        hasil.idSiswa,
        hasil.nomorWali ?? "",
        request.headers.get("user-agent"),
      );

      const jawaban = NextResponse.json({
        masuk: true,
        perluGantiPassword: Boolean(hasil.perluGantiPassword),
      });
      jawaban.cookies.set(COOKIE_SESI_WALI, token, OPSI_COOKIE_SESI);
      return jawaban;
    }

    // Alur Masuk via OTP WhatsApp
    const kunci = await kunciRateLimit("wali-masuk", getClientAddress(request));
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

    const kode = String(body.kode ?? "").trim();
    if (!nomorInduk || !/^\d{6}$/.test(kode)) {
      return NextResponse.json(
        {
          error: "VALIDATION_ERROR",
          message: "Nomor induk dan kode enam digit wajib diisi.",
        },
        { status: 400 },
      );
    }

    const siswa = await cariSiswaUntukOtp(client, nomorInduk);
    if (!siswa) {
      return NextResponse.json(
        {
          error: "KODE_TIDAK_COCOK",
          message: "Kode tidak cocok atau sudah kedaluwarsa.",
        },
        { status: 401 },
      );
    }

    const hasil = await verifikasiOtp(client, "wali", siswa.idSiswa, kode);
    if (hasil.hasil !== "cocok") {
      return NextResponse.json(
        {
          error: "KODE_TIDAK_COCOK",
          message:
            hasil.hasil === "salah"
              ? `Kode tidak cocok. Sisa percobaan: ${hasil.sisaPercobaan}.`
              : "Kode tidak cocok atau sudah kedaluwarsa. Silakan minta kode baru.",
        },
        { status: 401 },
      );
    }

    const { token } = await terbitkanSesiWali(
      client,
      siswa.idSiswa,
      siswa.nomorWali,
      request.headers.get("user-agent"),
    );

    const jawaban = NextResponse.json({
      masuk: true,
      perluGantiPassword: false,
    });
    jawaban.cookies.set(COOKIE_SESI_WALI, token, OPSI_COOKIE_SESI);
    return jawaban;
  } catch (error) {
    if (error instanceof OriginTidakDiizinkanError) {
      return NextResponse.json(
        { error: "FORBIDDEN", message: error.message },
        { status: 403 },
      );
    }
    if (error instanceof SchemaNotReadyError) {
      return NextResponse.json(
        {
          error: "SKEMA_BELUM_SIAP",
          message: "Portal wali belum dapat dilayani. Silakan hubungi sekolah.",
        },
        { status: 503 },
      );
    }
    console.error("[web-public] masuk portal wali gagal:", error);
    return NextResponse.json(
      {
        error: "INTERNAL_ERROR",
        message: "Terjadi gangguan. Silakan coba beberapa saat lagi.",
      },
      { status: 500 },
    );
  }
}
