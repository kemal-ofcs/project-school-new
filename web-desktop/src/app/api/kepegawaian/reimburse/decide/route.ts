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
import { putusKlaim } from "@/lib/services/hr-reimburse";
import { keputusanDraftSchema } from "@/lib/validations/hr-reimburse";

export const runtime = "nodejs";

/** Setujui, Tolak, atau Batal; cermin `desktop_hr_reimburse_decide`. Wewenang, cakupan unit, dan "bukan diri sendiri" diperiksa service dari sesi. */
export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    const actor = await requireAnyWebPermission(request, [
      "hr.reimburse.decide",
      "hr.reimburse.submit",
    ]);
    await ensureServerDatabaseInitialized();
    const parsed = keputusanDraftSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return noStoreJson(
        { sukses: false, pesan: "Data keputusan tidak valid." },
        400,
      );
    }
    return noStoreJson(
      await putusKlaim(getServerDatabase(), actor, parsed.data),
    );
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
