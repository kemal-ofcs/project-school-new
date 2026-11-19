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
import { simpanPelamar } from "@/lib/services/hr-rekrutmen";
import { pelamarDraftSchema } from "@/lib/validations/hr-rekrutmen";

export const runtime = "nodejs";

/** Pelamar baru (+ tahap Lamaran) atau ubah data pelamar; cermin `desktop_hr_applicant_save`. */
export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    const actor = await requireWebPermission(request, "hr.recruit.manage");
    await ensureServerDatabaseInitialized();
    const parsed = pelamarDraftSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return noStoreJson(
        {
          sukses: false,
          pesan: "Data pelamar tidak valid.",
        },
        400,
      );
    }
    const data = parsed.data;
    return noStoreJson(
      await simpanPelamar(getServerDatabase(), actor.username, data),
    );
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
