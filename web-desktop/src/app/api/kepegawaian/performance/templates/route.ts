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
import { daftarTemplate } from "@/lib/services/hr-kinerja";
import { kosongSchema } from "@/lib/validations/hr-kinerja";

export const runtime = "nodejs";

/** Template kinerja, aspek, dan pengaturan; cermin `desktop_hr_performance_templates`. */
export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    await requireAnyWebPermission(request, [
      "hr.performance.view",
      "hr.performance.assess",
      "hr.performance.finalize",
      "hr.performance.config",
    ]);
    await ensureServerDatabaseInitialized();
    const parsed = kosongSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return noStoreJson(
        { sukses: false, pesan: "Permintaan tidak valid." },
        400,
      );
    }
    return noStoreJson(await daftarTemplate(getServerDatabase()));
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
