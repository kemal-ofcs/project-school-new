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
import { simpanLowongan } from "@/lib/services/hr-rekrutmen";
import { lowonganDraftSchema } from "@/lib/validations/hr-rekrutmen";

export const runtime = "nodejs";

/** Buat, ubah, tutup, atau buka lagi lowongan; cermin `desktop_hr_vacancy_save`. */
export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    const actor = await requireWebPermission(request, "hr.recruit.manage");
    await ensureServerDatabaseInitialized();
    const parsed = lowonganDraftSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return noStoreJson(
        {
          sukses: false,
          pesan: "Data lowongan tidak valid.",
        },
        400,
      );
    }
    const data = parsed.data;
    return noStoreJson(
      await simpanLowongan(getServerDatabase(), actor.username, data),
    );
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
