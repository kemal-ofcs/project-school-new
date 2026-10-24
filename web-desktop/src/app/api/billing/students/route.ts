import type { NextRequest } from "next/server";
import { requireAnyWebPermission } from "@/lib/server/auth/authorize";
import {
  ensureServerDatabaseInitialized,
  getServerDatabase,
} from "@/lib/server/db";
import {
  noStoreJson,
  toApiErrorResponse,
} from "@/lib/server/http/api-response";
import { assertSameOriginMutation } from "@/lib/server/http/request-security";
import { students } from "@/lib/services/billing";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    // Cermin `desktop_billing_students`: kasir butuh daftar siswa di tab Bayar.
    await requireAnyWebPermission(request, [
      "billing.manage",
      "billing.collect",
    ]);
    await ensureServerDatabaseInitialized();
    return noStoreJson(await students(getServerDatabase()));
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
