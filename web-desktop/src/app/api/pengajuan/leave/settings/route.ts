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
import { simpanAturanCuti } from "@/lib/services/hr-pengajuan";
import { aturanCutiDraftSchema } from "@/lib/validations/hr-pengajuan";

export const runtime = "nodejs";

/** Aturan cuti guru dan tendik; cermin `desktop_hr_leave_settings_save`. */
export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    await requireWebPermission(request, "hr.org.manage");
    await ensureServerDatabaseInitialized();
    const parsed = aturanCutiDraftSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return noStoreJson(
        { sukses: false, pesan: "Data aturan cuti tidak valid." },
        400,
      );
    }
    return noStoreJson(
      await simpanAturanCuti(getServerDatabase(), parsed.data),
    );
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
