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
import { tahapPelamar } from "@/lib/services/hr-rekrutmen";
import { tahapDraftSchema } from "@/lib/validations/hr-rekrutmen";

export const runtime = "nodejs";

/** Catat tahap atau batalkan tahap terakhir; cermin `desktop_hr_applicant_stage`. */
export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    const actor = await requireWebPermission(request, "hr.recruit.manage");
    await ensureServerDatabaseInitialized();
    const parsed = tahapDraftSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return noStoreJson(
        {
          sukses: false,
          pesan: "Data tahap pelamar tidak valid.",
        },
        400,
      );
    }
    const data = parsed.data;
    return noStoreJson(
      await tahapPelamar(getServerDatabase(), actor.username, data),
    );
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
