import { NextResponse } from "next/server";
import { getReadyPublicDatabase } from "@/lib/server/db";
import {
  assertSameOriginMutation,
  getClientAddress,
  OriginTidakDiizinkanError,
} from "@/lib/server/http/request-security";
import { SchemaNotReadyError } from "@/lib/server/schema-readiness";
import {
  GelombangTidakTerbukaError,
  KuotaPenuhError,
  readGelombangAktif,
  tulisPendaftaran,
} from "@/lib/services/pmb";
import {
  catatPercobaan,
  KEBIJAKAN_DAFTAR_PMB,
  kunciRateLimit,
  periksaRateLimit,
} from "@/lib/services/rate-limit";
import { pendaftaranSchema } from "@/lib/validations/pmb";

/**
 * Terima satu pendaftaran PMB.
 *
 * `POST`, bukan karena static export melarang `GET` — workspace ini tidak
 * memakai static export — melainkan karena ia memang mengubah keadaan.
 *
 * Urutan pemeriksaannya disengaja, dan tiap langkah menolak sebelum langkah
 * berikutnya menghabiskan sumber daya yang lebih mahal:
 *
 *   1. Asal permintaan  — tanpa menyentuh database sama sekali.
 *   2. Rate limit       — satu query ringan, sebelum body dibaca sampai habis.
 *   3. Validasi Zod     — sebelum satu pun baris ditulis.
 *   4. Gelombang & kuota — di dalam service, bersama penulisannya.
 */
export async function POST(request: Request) {
  try {
    assertSameOriginMutation(request);

    const client = await getReadyPublicDatabase();
    const kunci = await kunciRateLimit("daftar", getClientAddress(request));

    const batas = await periksaRateLimit(client, kunci);
    if (!batas.diizinkan) {
      return NextResponse.json(
        {
          error: "TERLALU_BANYAK_PERMINTAAN",
          message: `Terlalu banyak percobaan pendaftaran. Coba lagi dalam ${Math.ceil(batas.cobaLagiDetik / 60)} menit.`,
        },
        {
          status: 429,
          headers: { "Retry-After": String(batas.cobaLagiDetik) },
        },
      );
    }
    // Percobaan dicatat SEBELUM hasilnya diketahui. Mencatat hanya saat gagal
    // membuat penyalahgunaan yang berhasil — seribu pendaftaran palsu yang
    // semuanya sah secara format — tidak pernah tersentuh rate limit.
    await catatPercobaan(client, kunci, KEBIJAKAN_DAFTAR_PMB);

    const parsed = pendaftaranSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "VALIDATION_ERROR",
          message: "Data pendaftaran belum lengkap atau tidak valid.",
          detail: parsed.error.issues.map((masalah) => ({
            field: masalah.path.join("."),
            message: masalah.message,
          })),
        },
        { status: 400 },
      );
    }

    const gelombang = await readGelombangAktif(client);
    if (!gelombang) throw new GelombangTidakTerbukaError();

    const hasil = await tulisPendaftaran(client, gelombang, parsed.data);

    return NextResponse.json({
      nomorPendaftaran: hasil.nomorPendaftaran,
      namaGelombang: gelombang.nama,
    });
  } catch (error) {
    return jawabKegagalan(error, "pendaftaran PMB");
  }
}

function jawabKegagalan(error: unknown, konteks: string) {
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
        message:
          "Pendaftaran daring belum dapat dilayani. Silakan hubungi sekolah.",
      },
      { status: 503 },
    );
  }

  if (
    error instanceof GelombangTidakTerbukaError ||
    error instanceof KuotaPenuhError
  ) {
    return NextResponse.json(
      { error: "TIDAK_DAPAT_DIPROSES", message: error.message },
      { status: error.status },
    );
  }

  // Dicatat, tidak didiamkan. Pesannya TIDAK diteruskan ke pemanggil: pesan
  // error database yang bocor ke internet terbuka menyebutkan nama tabel dan
  // kolom, dan itu adalah peta untuk percobaan berikutnya.
  console.error(`[web-public] ${konteks} gagal:`, error);
  return NextResponse.json(
    {
      error: "INTERNAL_ERROR",
      message: "Terjadi gangguan. Silakan coba beberapa saat lagi.",
    },
    { status: 500 },
  );
}
