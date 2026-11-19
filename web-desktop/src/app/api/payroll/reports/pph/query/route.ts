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
import { laporanPph } from "@/lib/services/lapor-pajak";
import { IZIN_LAPOR, masaLaporSchema } from "@/lib/validations/lapor-pajak";

export const runtime = "nodejs";

/** Rekap PPh 21 bulanan dari slip run PAID; cermin `desktop_report_pph_monthly`. Membuka NIK, NPWP, dan gaji semua pegawai, jadi wajib kedua izin. */
export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    await requireWebPermission(request, IZIN_LAPOR[0]);
    await requireWebPermission(request, IZIN_LAPOR[1]);
    await ensureServerDatabaseInitialized();
    const parsed = masaLaporSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return noStoreJson(
        { sukses: false, pesan: "Masa laporan tidak valid." },
        400,
      );
    }
    return noStoreJson(await laporanPph(getServerDatabase(), parsed.data));
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
