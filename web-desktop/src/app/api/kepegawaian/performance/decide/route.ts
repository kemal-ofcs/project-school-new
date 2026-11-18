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
import { putuskanKinerja } from "@/lib/services/hr-kinerja";
import { keputusanDraftSchema } from "@/lib/validations/hr-kinerja";

export const runtime = "nodejs";

/** Ajukan, Kembalikan, Final, atau Batal; cermin `desktop_hr_performance_decide`. */
export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    const actor = await requireAnyWebPermission(request, [
      "hr.performance.assess",
      "hr.performance.finalize",
    ]);
    await ensureServerDatabaseInitialized();
    const parsed = keputusanDraftSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return noStoreJson(
        { sukses: false, pesan: "Keputusan penilaian tidak valid." },
        400,
      );
    }
    return noStoreJson(
      await putuskanKinerja(getServerDatabase(), actor, parsed.data),
    );
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
