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
import { simpanTemplate } from "@/lib/services/hr-kinerja";
import { templateDraftSchema } from "@/lib/validations/hr-kinerja";

export const runtime = "nodejs";

/**
 * Buat atau ubah template kinerja beserta semua aspeknya; cermin
 * `desktop_hr_performance_template_save`.
 */
export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    const actor = await requireWebPermission(request, "hr.performance.config");
    await ensureServerDatabaseInitialized();
    const parsed = templateDraftSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return noStoreJson(
        { sukses: false, pesan: "Data template kinerja tidak valid." },
        400,
      );
    }
    return noStoreJson(
      await simpanTemplate(getServerDatabase(), actor, parsed.data),
    );
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
