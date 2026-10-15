import type { NextRequest } from "next/server";
import { requireWebPermission } from "@/lib/server/auth/authorize";
import {
  ensureServerDatabaseInitialized,
  getServerDatabase,
} from "@/lib/server/db";
import {
  noStoreJson,
  toApiErrorResponse,
} from "@/lib/server/http/api-response";
import { assertSameOriginMutation } from "@/lib/server/http/request-security";
import { listRapel } from "@/lib/services/payroll-rapel";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    await requireWebPermission(request, "payroll.view");
    await ensureServerDatabaseInitialized();
    return noStoreJson(await listRapel(getServerDatabase()));
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
