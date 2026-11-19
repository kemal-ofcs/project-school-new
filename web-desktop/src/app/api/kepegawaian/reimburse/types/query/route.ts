import type { NextRequest } from "next/server";
import { requireWebSession } from "@/lib/server/auth/authorize";
import {
  ensureServerDatabaseInitialized,
  getServerDatabase,
} from "@/lib/server/db";
import {
  noStoreJson,
  toApiErrorResponse,
} from "@/lib/server/http/api-response";
import { assertSameOriginMutation } from "@/lib/server/http/request-security";
import { jenisReimburse } from "@/lib/services/hr-reimburse";

export const runtime = "nodejs";

/** Jenis reimbursement; cermin `desktop_hr_reimburse_types`. */
export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    await requireWebSession(request);
    await ensureServerDatabaseInitialized();
    return noStoreJson(await jenisReimburse(getServerDatabase()));
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
