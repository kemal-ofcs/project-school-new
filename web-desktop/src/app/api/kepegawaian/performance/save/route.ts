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
import { simpanKinerja } from "@/lib/services/hr-kinerja";
import { penilaianDraftSchema } from "@/lib/validations/hr-kinerja";

export const runtime = "nodejs";

/** Buat, simpan draf, muat ulang template, atau buat koreksi; cermin `desktop_hr_performance_save`. */
export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    const actor = await requireAnyWebPermission(request, [
      "hr.performance.assess",
      "hr.performance.finalize",
    ]);
    await ensureServerDatabaseInitialized();
    const parsed = penilaianDraftSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return noStoreJson(
        { sukses: false, pesan: "Data penilaian kinerja tidak valid." },
        400,
      );
    }
    return noStoreJson(
      await simpanKinerja(getServerDatabase(), actor, parsed.data),
    );
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
