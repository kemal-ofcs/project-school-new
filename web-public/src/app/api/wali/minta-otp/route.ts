import { NextResponse } from "next/server";
import { getReadyPublicDatabase } from "@/lib/server/db";
import {
  assertSameOriginMutation,
  getClientAddress,
  OriginTidakDiizinkanError,
} from "@/lib/server/http/request-security";
import { SchemaNotReadyError } from "@/lib/server/schema-readiness";
import {
  catatPercobaan,
  KEBIJAKAN_CEK_STATUS,
  kunciRateLimit,
  periksaRateLimit,
} from "@/lib/services/rate-limit";
import { readFullWaConfig, sendViaProvider } from "@/lib/services/wa-provider";
import {
  cariSiswaUntukOtp,
  OTP_UMUR_MENIT,
  samarkanNomor,
  tandaiPengirimanOtp,
  terbitkanOtp,
} from "@/lib/services/wali-auth";

export const runtime = "nodejs";

/**
 * Minta kode masuk portal wali.
 *
 * Balasannya SELALU berbentuk sama, ketemu atau tidak. Layar ini tidak boleh
 * bisa dipakai memetakan NIS mana yang terdaftar di sekolah ini — pola yang
 * sama dengan gerbang 2FA yang berjalan SETELAH password terbukti benar, supaya
 * layar login tidak bisa dipakai memetakan akun mana yang memakai 2FA.
 *
 * Konsekuensinya: nomor tersamar hanya dikembalikan bila siswanya memang ada.
 * Ketika tidak, balasannya tetap 200 dengan `nomorTersamar: null`, dan layar
 * menampilkan kolom kode seperti biasa. Penyerang tidak belajar apa pun;
 * wali yang salah ketik akan tahu setelah kodenya tidak pernah datang.
 */
export async function POST(request: Request) {
  try {
    assertSameOriginMutation(request);

    const client = await getReadyPublicDatabase();
    const kunci = await kunciRateLimit("wali-otp", getClientAddress(request));

    const batas = await periksaRateLimit(client, kunci);
    if (!batas.diizinkan) {
      return NextResponse.json(
        {
          error: "TERLALU_BANYAK_PERMINTAAN",
          message: `Terlalu banyak permintaan kode. Coba lagi dalam ${Math.ceil(batas.cobaLagiDetik / 60)} menit.`,
        },
        {
          status: 429,
          headers: { "Retry-After": String(batas.cobaLagiDetik) },
        },
      );
    }
    await catatPercobaan(client, kunci, KEBIJAKAN_CEK_STATUS);

    const body = (await request.json().catch(() => ({}))) as {
      nomorInduk?: string;
    };
    const nomorInduk = String(body.nomorInduk ?? "").trim();
    if (!nomorInduk || nomorInduk.length > 40) {
      return NextResponse.json(
        {
          error: "VALIDATION_ERROR",
          message: "Nomor induk siswa wajib diisi.",
        },
        { status: 400 },
      );
    }

    const siswa = await cariSiswaUntukOtp(client, nomorInduk);
    if (!siswa) {
      return NextResponse.json({
        dikirim: true,
        nomorTersamar: null,
        umurMenit: OTP_UMUR_MENIT,
      });
    }

    const otp = await terbitkanOtp(
      client,
      "wali",
      siswa.idSiswa,
      siswa.nomorWali,
    );

    const konfigurasi = await readFullWaConfig(client);
    if (!konfigurasi?.isActive || !konfigurasi.apiKey) {
      await tandaiPengirimanOtp(
        client,
        otp.idOtp,
        false,
        "Gateway WhatsApp belum aktif",
      );
      return NextResponse.json(
        {
          error: "GATEWAY_BELUM_SIAP",
          message:
            "Pengiriman kode belum dapat dilakukan. Silakan hubungi sekolah.",
        },
        { status: 503 },
      );
    }

    try {
      await sendViaProvider(
        konfigurasi,
        siswa.nomorWali,
        `Kode masuk portal wali untuk ${siswa.namaLengkap}: ${otp.kode}\n\nBerlaku ${OTP_UMUR_MENIT} menit. Jangan berikan kode ini kepada siapa pun.`,
      );
      await tandaiPengirimanOtp(client, otp.idOtp, true);
    } catch (error) {
      await tandaiPengirimanOtp(
        client,
        otp.idOtp,
        false,
        error instanceof Error ? error.message : String(error),
      );
      return NextResponse.json(
        {
          error: "PENGIRIMAN_GAGAL",
          message:
            "Kode gagal dikirim ke nomor wali. Silakan coba lagi atau hubungi sekolah.",
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      dikirim: true,
      nomorTersamar: samarkanNomor(siswa.nomorWali),
      umurMenit: OTP_UMUR_MENIT,
    });
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
    console.error("[web-public] permintaan OTP wali gagal:", error);
    return NextResponse.json(
      {
        error: "INTERNAL_ERROR",
        message: "Terjadi gangguan. Silakan coba beberapa saat lagi.",
      },
      { status: 500 },
    );
  }
}
