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
import { berlakukanKeluar } from "@/lib/services/hr-keluar";
import { keluarIdSchema } from "@/lib/validations/hr-keluar";

export const runtime = "nodejs";

/**
 * Berlakukan proses keluar dalam satu batch; cermin
 * `desktop_hr_offboarding_apply`.
 */
export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    const actor = await requireWebPermission(request, "hr.offboard.decide");
    await ensureServerDatabaseInitialized();
    const parsed = keluarIdSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return noStoreJson(
        { sukses: false, pesan: "Proses keluar tidak ditemukan." },
        400,
      );
    }
    return noStoreJson(
      await berlakukanKeluar(getServerDatabase(), actor, parsed.data.id_keluar),
    );
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
