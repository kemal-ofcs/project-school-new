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
import { getLaporanPtk } from "@/lib/services/hris";

export const runtime = "nodejs";

/** Baris Laporan PTK; ringkasan per unit dihitung di layar (`ringkasPtk`). */
export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    await requireWebPermission(request, "teachers.view");
    await ensureServerDatabaseInitialized();
    return noStoreJson(await getLaporanPtk(getServerDatabase()));
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
