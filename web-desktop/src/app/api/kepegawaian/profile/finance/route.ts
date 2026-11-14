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
import { simpanKeuangan } from "@/lib/services/hris";
import { keuanganDraftSchema } from "@/lib/validations/hris";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    const actor = await requireWebPermission(request, "hr.finance.manage");
    await ensureServerDatabaseInitialized();
    const parsed = keuanganDraftSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return noStoreJson(
        {
          sukses: false,
          pesan: "Data keuangan tidak valid.",
        },
        400,
      );
    }
    return noStoreJson(
      await simpanKeuangan(getServerDatabase(), actor.username, parsed.data),
    );
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
