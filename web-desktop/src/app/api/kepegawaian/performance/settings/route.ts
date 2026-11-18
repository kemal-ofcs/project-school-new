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
import { simpanPengaturanKinerja } from "@/lib/services/hr-kinerja";
import { pengaturanKinerjaSchema } from "@/lib/validations/hr-kinerja";

export const runtime = "nodejs";

/** Ambang, predikat, dan rentang tanpa KBM sekaligus; cermin `desktop_hr_performance_settings_save`. */
export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    await requireWebPermission(request, "hr.performance.config");
    await ensureServerDatabaseInitialized();
    const parsed = pengaturanKinerjaSchema.safeParse(
      await readJsonBody(request),
    );
    if (!parsed.success) {
      return noStoreJson(
        { sukses: false, pesan: "Pengaturan kinerja tidak valid." },
        400,
      );
    }
    return noStoreJson(
      await simpanPengaturanKinerja(getServerDatabase(), parsed.data),
    );
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
