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
import { bayarKlaim } from "@/lib/services/hr-reimburse";
import { bayarDraftSchema } from "@/lib/validations/hr-reimburse";

export const runtime = "nodejs";

/** Catat pembayaran klaim Disetujui; cermin `desktop_hr_reimburse_pay`. */
export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    const actor = await requireWebPermission(request, "hr.reimburse.pay");
    await ensureServerDatabaseInitialized();
    const parsed = bayarDraftSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return noStoreJson(
        { sukses: false, pesan: "Data pembayaran tidak valid." },
        400,
      );
    }
    return noStoreJson(
      await bayarKlaim(getServerDatabase(), actor.username, parsed.data),
    );
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
