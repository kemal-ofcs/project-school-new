import type { NextRequest } from "next/server";
import { requireWebPermission } from "@/lib/server/auth/authorize";
import {
  ensureServerDatabaseInitialized,
  getServerDatabase,
} from "@/lib/server/db";
import {
  noStoreJson,
  readJsonBody,
  toApiErrorResponse,
} from "@/lib/server/http/api-response";
import { assertSameOriginMutation } from "@/lib/server/http/request-security";
import { laporanA1 } from "@/lib/services/lapor-pajak";
import { IZIN_LAPOR, tahunLaporSchema } from "@/lib/validations/lapor-pajak";

export const runtime = "nodejs";

/** Rekap A1 tahunan dari slip run PAID; cermin `desktop_report_a1_yearly`. Membuka NIK, NPWP, dan gaji semua pegawai, jadi wajib kedua izin. */
export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    await requireWebPermission(request, IZIN_LAPOR[0]);
    await requireWebPermission(request, IZIN_LAPOR[1]);
    await ensureServerDatabaseInitialized();
    const parsed = tahunLaporSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return noStoreJson(
        { sukses: false, pesan: "Tahun laporan tidak valid." },
        400,
      );
    }
    return noStoreJson(await laporanA1(getServerDatabase(), parsed.data));
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
