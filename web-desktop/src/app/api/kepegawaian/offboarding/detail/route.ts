import type { NextRequest } from "next/server";
import { requireAnyWebPermission } from "@/lib/server/auth/authorize";
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
import { rincianKeluar } from "@/lib/services/hr-keluar";
import { keluarRincianSchema } from "@/lib/validations/hr-keluar";

export const runtime = "nodejs";

/**
 * Rincian proses keluar, atau pratinjau untuk pegawai dan hari terakhir,
 * beserta checklist; cermin `desktop_hr_offboarding`.
 */
export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    await requireAnyWebPermission(request, [
      "hr.offboard.view",
      "hr.offboard.manage",
    ]);
    await ensureServerDatabaseInitialized();
    const parsed = keluarRincianSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return noStoreJson(
        { sukses: false, pesan: "Data proses keluar tidak valid." },
        400,
      );
    }
    return noStoreJson(await rincianKeluar(getServerDatabase(), parsed.data));
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
