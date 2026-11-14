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
import { simpanKontrak } from "@/lib/services/hris";
import { kontrakDraftSchema } from "@/lib/validations/hris";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    const actor = await requireWebPermission(request, "hr.contract.manage");
    await ensureServerDatabaseInitialized();
    const parsed = kontrakDraftSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return noStoreJson(
        { sukses: false, pesan: "Data kontrak tidak valid." },
        400,
      );
    }
    return noStoreJson(
      await simpanKontrak(getServerDatabase(), actor.username, parsed.data),
    );
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
