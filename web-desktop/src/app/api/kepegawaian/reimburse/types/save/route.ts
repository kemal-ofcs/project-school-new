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
import { simpanJenis } from "@/lib/services/hr-reimburse";
import { jenisReimburseDraftSchema } from "@/lib/validations/hr-reimburse";

export const runtime = "nodejs";

/** Buat atau ubah jenis reimbursement; cermin `desktop_hr_reimburse_types_save`. */
export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    const actor = await requireWebPermission(request, "hr.reimburse.config");
    await ensureServerDatabaseInitialized();
    const parsed = jenisReimburseDraftSchema.safeParse(
      await readJsonBody(request),
    );
    if (!parsed.success) {
      return noStoreJson(
        { sukses: false, pesan: "Data jenis reimbursement tidak valid." },
        400,
      );
    }
    return noStoreJson(
      await simpanJenis(getServerDatabase(), actor.username, parsed.data),
    );
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
