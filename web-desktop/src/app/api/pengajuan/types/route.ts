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
import { simpanJenisPengajuan } from "@/lib/services/hr-pengajuan";
import { jenisDraftSchema } from "@/lib/validations/hr-pengajuan";

export const runtime = "nodejs";

/** Jenis pengajuan baru atau sunting. Cermin `desktop_hr_request_types_save`. */
export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    await requireWebPermission(request, "hr.org.manage");
    await ensureServerDatabaseInitialized();
    const parsed = jenisDraftSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return noStoreJson(
        { sukses: false, pesan: "Data jenis pengajuan tidak valid." },
        400,
      );
    }
    return noStoreJson(
      await simpanJenisPengajuan(getServerDatabase(), parsed.data),
    );
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
