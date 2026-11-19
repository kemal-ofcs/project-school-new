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
import { simpanKlaim } from "@/lib/services/hr-reimburse";
import { klaimDraftSchema } from "@/lib/validations/hr-reimburse";

export const runtime = "nodejs";

/** Catat klaim atas nama personil; cermin `desktop_hr_reimburse_save`. */
export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    const actor = await requireWebPermission(request, "hr.reimburse.submit");
    await ensureServerDatabaseInitialized();
    const parsed = klaimDraftSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return noStoreJson(
        { sukses: false, pesan: "Data klaim tidak valid." },
        400,
      );
    }
    return noStoreJson(
      await simpanKlaim(getServerDatabase(), actor.username, parsed.data),
    );
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
