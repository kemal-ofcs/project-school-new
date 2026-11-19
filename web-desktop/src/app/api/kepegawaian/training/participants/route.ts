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
import { simpanPeserta } from "@/lib/services/hr-pelatihan";
import { pesertaDraftSchema } from "@/lib/validations/hr-pelatihan";

export const runtime = "nodejs";

/** Tambah, lepas, atau catat hasil peserta; cermin `desktop_hr_training_participants_save`. */
export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    const actor = await requireWebPermission(request, "hr.training.manage");
    await ensureServerDatabaseInitialized();
    const parsed = pesertaDraftSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return noStoreJson(
        {
          sukses: false,
          pesan: "Data peserta tidak valid.",
        },
        400,
      );
    }
    const data = parsed.data;
    return noStoreJson(
      await simpanPeserta(getServerDatabase(), actor.username, data),
    );
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
