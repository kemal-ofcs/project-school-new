import { NextResponse } from "next/server";
import { getReadyPublicDatabase } from "@/lib/server/db";
import {
  assertSameOriginMutation,
  getClientAddress,
  OriginTidakDiizinkanError,
} from "@/lib/server/http/request-security";
import { pilihModeCekStatus } from "@/lib/server/pmb-status-mode";
import { SchemaNotReadyError } from "@/lib/server/schema-readiness";
import {
  cariPendaftarUntukOtp,
  readStatusPendaftaran,
  readStatusPendaftaranById,
} from "@/lib/services/pmb";
import {
  catatPercobaan,
  KEBIJAKAN_CEK_STATUS,
  kunciRateLimit,
  periksaRateLimit,
} from "@/lib/services/rate-limit";
import { verifikasiOtp } from "@/lib/services/wali-auth";
import { cekStatusSchema } from "@/lib/validations/pmb";

export const runtime = "nodejs";

/**
 * Periksa status satu pendaftaran.
 *
 * `POST` meski hanya membaca, dan itu disengaja: nomor pendaftaran, tanggal
 * lahir, dan kode sekali-pakai tidak boleh berakhir di query string, tempat
 * mereka tersimpan di riwayat peramban, log server, dan header `Referer` yang
 * dikirim ke setiap sumber daya pihak ketiga yang dimuat halaman berikutnya.
 *
 * DUA jalur bukti, dan SERVER yang memutuskan mana yang sah — lihat
 * `pilihModeCekStatus`. Membiarkan klien memilih akan membuat jalur OTP
 * sekadar hiasan: siapa pun tinggal mengirim tanggal lahir.
 *
 * Balasan untuk semua kegagalan pencocokan dibuat SATU BENTUK. Membedakan
 * "nomor tidak ada" dari "tanggal lahir salah" cukup untuk memetakan nomor mana
 * yang terdaftar — pola yang sama yang membuat layar login tidak boleh
 * membedakan "akun tidak ada" dari "password salah".
 */
export async function POST(request: Request) {
  try {
    assertSameOriginMutation(request);

    const client = await getReadyPublicDatabase();
    const kunci = await kunciRateLimit("status", getClientAddress(request));

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
      nomorPendaftaran?: string;
      tanggalLahir?: string;
      kode?: string;
    };
    const mode = await pilihModeCekStatus(client);

    const tidakDitemukan = NextResponse.json(
      {
        error: "TIDAK_DITEMUKAN",
        message:
          mode === "otp"
            ? "Kode tidak cocok atau sudah kedaluwarsa. Silakan minta kode baru."
            : "Pendaftaran tidak ditemukan. Periksa kembali nomor pendaftaran dan tanggal lahir.",
      },
      { status: 404 },
    );

    if (mode === "otp") {
      const nomor = String(body.nomorPendaftaran ?? "").trim();
      const kode = String(body.kode ?? "").trim();
      if (!nomor || !/^\d{6}$/.test(kode)) {
        return NextResponse.json(
          {
            error: "VALIDATION_ERROR",
            message: "Nomor pendaftaran dan kode enam digit wajib diisi.",
          },
          { status: 400 },
        );
      }

      const pendaftar = await cariPendaftarUntukOtp(client, nomor);
      if (!pendaftar) return tidakDitemukan;

      const hasil = await verifikasiOtp(
        client,
        "pmb",
        pendaftar.idPendaftar,
        kode,
      );
      if (hasil.hasil !== "cocok") return tidakDitemukan;

      const status = await readStatusPendaftaranById(
        client,
        pendaftar.idPendaftar,
      );
      if (!status) return tidakDitemukan;
      return NextResponse.json({ status });
    }

    const parsed = cekStatusSchema.safeParse({
      nomorPendaftaran: body.nomorPendaftaran,
      tanggalLahir: body.tanggalLahir,
    });
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "VALIDATION_ERROR",
          message:
            "Nomor pendaftaran dan tanggal lahir wajib diisi dengan benar.",
        },
        { status: 400 },
      );
    }

    const status = await readStatusPendaftaran(client, parsed.data);
    if (!status) return tidakDitemukan;
    return NextResponse.json({ status });
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

    console.error("[web-public] cek status PMB gagal:", error);
    return NextResponse.json(
      {
        error: "INTERNAL_ERROR",
        message: "Terjadi gangguan. Silakan coba beberapa saat lagi.",
      },
      { status: 500 },
    );
  }
}
