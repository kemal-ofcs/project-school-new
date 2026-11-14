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
import { simpanKeluar } from "@/lib/services/hr-keluar";
import { keluarDraftSchema } from "@/lib/validations/hr-keluar";

export const runtime = "nodejs";

/**
 * Catat atau ubah proses keluar yang belum berlaku; cermin
 * `desktop_hr_offboarding_save`. Cakupan unit dan "bukan diri sendiri" dari sesi.
 */
export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    const actor = await requireWebPermission(request, "hr.offboard.manage");
    await ensureServerDatabaseInitialized();
    const parsed = keluarDraftSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return noStoreJson(
        { sukses: false, pesan: "Data proses keluar tidak valid." },
        400,
      );
    }
    return noStoreJson(
      await simpanKeluar(getServerDatabase(), actor, parsed.data),
    );
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
