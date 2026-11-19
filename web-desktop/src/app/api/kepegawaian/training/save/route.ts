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
import { simpanPelatihan } from "@/lib/services/hr-pelatihan";
import { pelatihanDraftSchema } from "@/lib/validations/hr-pelatihan";

export const runtime = "nodejs";

/** Buat, ubah, atau batalkan pelatihan; cermin `desktop_hr_training_save`. */
export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    const actor = await requireWebPermission(request, "hr.training.manage");
    await ensureServerDatabaseInitialized();
    const parsed = pelatihanDraftSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return noStoreJson(
        {
          sukses: false,
          pesan: "Data pelatihan tidak valid.",
        },
        400,
      );
    }
    const data = parsed.data;
    return noStoreJson(
      await simpanPelatihan(getServerDatabase(), actor.username, data),
    );
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
