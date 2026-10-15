import type { NextRequest } from "next/server";
import { requireWebPermission } from "@/lib/server/auth/authorize";
import { ensureServerDatabaseInitialized } from "@/lib/server/db";
import {
  ApiRequestError,
  noStoreJson,
  readJsonBody,
  toApiErrorResponse,
} from "@/lib/server/http/api-response";
import { assertSameOriginMutation } from "@/lib/server/http/request-security";
import { tambahHariLiburMassal } from "@/lib/services/holiday";
import { validateLiburMassal } from "@/lib/validations/hari-kerja";

export const runtime = "nodejs";

/** Rentang tanggal dan impor libur nasional. Cermin `desktop_create_holidays_bulk`. */
export async function POST(request: NextRequest) {
  try {
    await requireWebPermission(request, "holidays.manage");
    assertSameOriginMutation(request);
    await ensureServerDatabaseInitialized();

    const body = await readJsonBody<Record<string, unknown>>(request);
    if (Object.keys(body).some((kunci) => kunci !== "entries")) {
      throw new ApiRequestError("Permintaan tidak valid.", 400);
    }
    const hasil = validateLiburMassal(body.entries);
    if (!hasil.ok) throw new ApiRequestError(hasil.error, 400);

    return noStoreJson(await tambahHariLiburMassal(hasil.value), 201);
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
