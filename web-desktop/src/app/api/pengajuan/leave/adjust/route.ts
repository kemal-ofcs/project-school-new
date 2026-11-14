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
import { sesuaikanCuti } from "@/lib/services/hr-pengajuan";
import { penyesuaianDraftSchema } from "@/lib/validations/hr-pengajuan";

export const runtime = "nodejs";

/** Penyesuaian jatah cuti atau pembatalannya; cermin `desktop_hr_leave_adjust`. */
export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    const actor = await requireWebPermission(request, "hr.leave.adjust");
    await ensureServerDatabaseInitialized();
    const parsed = penyesuaianDraftSchema.safeParse(
      await readJsonBody(request),
    );
    if (!parsed.success) {
      return noStoreJson(
        { sukses: false, pesan: "Data penyesuaian cuti tidak valid." },
        400,
      );
    }
    return noStoreJson(
      await sesuaikanCuti(getServerDatabase(), actor, parsed.data),
    );
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
