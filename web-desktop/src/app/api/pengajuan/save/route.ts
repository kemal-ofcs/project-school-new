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
import { simpanPengajuan } from "@/lib/services/hr-pengajuan";
import { pengajuanDraftSchema } from "@/lib/validations/hr-pengajuan";

export const runtime = "nodejs";

/** Ajukan atau sunting; urgent dinilai dari sesi. Cermin `desktop_hr_request_save`. */
export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    const actor = await requireWebPermission(request, "hr.request.submit");
    await ensureServerDatabaseInitialized();
    const parsed = pengajuanDraftSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return noStoreJson(
        { sukses: false, pesan: "Data pengajuan tidak valid." },
        400,
      );
    }
    return noStoreJson(
      await simpanPengajuan(getServerDatabase(), actor, parsed.data),
    );
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
