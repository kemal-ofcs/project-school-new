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
import { simpanBagian } from "@/lib/services/hris";
import { bagianDraftSchema } from "@/lib/validations/hris";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    await requireWebPermission(request, "hr.org.manage");
    await ensureServerDatabaseInitialized();
    const parsed = bagianDraftSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return noStoreJson(
        { sukses: false, pesan: "Data bagian tidak valid." },
        400,
      );
    }
    return noStoreJson(await simpanBagian(getServerDatabase(), parsed.data));
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
