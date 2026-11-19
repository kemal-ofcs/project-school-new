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
import { dataPemotong } from "@/lib/services/lapor-pajak";
import {
  IZIN_PEMOTONG,
  kosongLaporSchema,
} from "@/lib/validations/lapor-pajak";

export const runtime = "nodejs";

/** Data pemotong untuk Pengaturan; cermin `desktop_report_setting`. */
export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    await requireWebPermission(request, IZIN_PEMOTONG);
    await ensureServerDatabaseInitialized();
    const parsed = kosongLaporSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return noStoreJson(
        { sukses: false, pesan: "Permintaan data pemotong tidak valid." },
        400,
      );
    }
    return noStoreJson(await dataPemotong(getServerDatabase()));
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
