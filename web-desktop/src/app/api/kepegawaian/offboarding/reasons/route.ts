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
import { simpanAlasan } from "@/lib/services/hr-keluar";
import { alasanDraftSchema } from "@/lib/validations/hr-keluar";

export const runtime = "nodejs";

/**
 * Ubah atau tambah alasan keluar beserta pengalinya; cermin
 * `desktop_hr_exit_reasons_save`. Proses yang sudah berlaku tidak tersentuh.
 */
export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    await requireWebPermission(request, "hr.offboard.decide");
    await ensureServerDatabaseInitialized();
    const parsed = alasanDraftSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return noStoreJson(
        { sukses: false, pesan: "Data alasan keluar tidak valid." },
        400,
      );
    }
    return noStoreJson(await simpanAlasan(getServerDatabase(), parsed.data));
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
