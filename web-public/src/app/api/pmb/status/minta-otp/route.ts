import { NextResponse } from "next/server";
import { getReadyPublicDatabase } from "@/lib/server/db";
import {
  assertSameOriginMutation,
  getClientAddress,
  OriginTidakDiizinkanError,
} from "@/lib/server/http/request-security";
import { pilihModeCekStatus } from "@/lib/server/pmb-status-mode";
import { SchemaNotReadyError } from "@/lib/server/schema-readiness";
import { cariPendaftarUntukOtp } from "@/lib/services/pmb";
import {
  catatPercobaan,
  KEBIJAKAN_CEK_STATUS,
  kunciRateLimit,
  periksaRateLimit,
} from "@/lib/services/rate-limit";
import { readFullWaConfig, sendViaProvider } from "@/lib/services/wa-provider";
import {
  OTP_UMUR_MENIT,
  samarkanNomor,
  tandaiPengirimanOtp,
  terbitkanOtp,
} from "@/lib/services/wali-auth";

export const runtime = "nodejs";

/**
 * Kirim kode cek status ke nomor wali yang dicatat saat mendaftar.
 *
 * Balasannya SELALU berbentuk sama, nomor pendaftaran ditemukan atau tidak.
 * Membedakannya mengubah layar ini menjadi alat untuk menguji nomor
 * pendaftaran mana yang benar-benar ada — dan nomor itu pendek serta
 * berpola.
 */
export async function POST(request: Request) {
  try {
    assertSameOriginMutation(request);

    const client = await getReadyPublicDatabase();
    const kunci = await kunciRateLimit(
      "pmb-status-otp",
      getClientAddress(request),
    );

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

    if ((await pilihModeCekStatus(client)) !== "otp") {
      return NextResponse.json(
        {
          error: "MODE_TIDAK_AKTIF",
          message:
            "Verifikasi lewat WhatsApp belum aktif. Gunakan tanggal lahir.",
        },
        { status: 409 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      nomorPendaftaran?: string;
    };
    const nomor = String(body.nomorPendaftaran ?? "").trim();
    if (!nomor || nomor.length > 40) {
      return NextResponse.json(
        {
          error: "VALIDATION_ERROR",
          message: "Nomor pendaftaran wajib diisi.",
        },
        { status: 400 },
      );
    }

    const pendaftar = await cariPendaftarUntukOtp(client, nomor);
    if (!pendaftar || !pendaftar.nomorWali) {
      return NextResponse.json({
        dikirim: true,
        nomorTersamar: null,
        umurMenit: OTP_UMUR_MENIT,
      });
    }

    const otp = await terbitkanOtp(
      client,
      "pmb",
      pendaftar.idPendaftar,
      pendaftar.nomorWali,
    );

    const konfigurasi = await readFullWaConfig(client);
    if (!konfigurasi) {
      await tandaiPengirimanOtp(
        client,
        otp.idOtp,
        false,
        "Konfigurasi WhatsApp hilang",
      );
      return NextResponse.json(
        {
          error: "GATEWAY_BELUM_SIAP",
          message: "Pengiriman kode gagal. Silakan hubungi sekolah.",
        },
        { status: 503 },
      );
    }

    try {
      await sendViaProvider(
        konfigurasi,
        pendaftar.nomorWali,
        `Kode cek status pendaftaran ${pendaftar.namaLengkap}: ${otp.kode}\n\nBerlaku ${OTP_UMUR_MENIT} menit.`,
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
            "Kode gagal dikirim. Silakan coba lagi atau hubungi sekolah.",
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      dikirim: true,
      nomorTersamar: samarkanNomor(pendaftar.nomorWali),
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
          message: "Layanan ini belum dapat dilayani. Silakan hubungi sekolah.",
        },
        { status: 503 },
      );
    }
    console.error("[web-public] permintaan OTP cek status gagal:", error);
    return NextResponse.json(
      {
        error: "INTERNAL_ERROR",
        message: "Terjadi gangguan. Silakan coba beberapa saat lagi.",
      },
      { status: 500 },
    );
  }
}
