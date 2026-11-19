import type { NextRequest } from "next/server";
import { requireAnyWebPermission } from "@/lib/server/auth/authorize";
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
import { ambilNota } from "@/lib/services/hr-reimburse";
import { idNotaSchema } from "@/lib/validations/hr-reimburse";

export const runtime = "nodejs";

/** Isi satu nota klaim; cermin `desktop_hr_reimburse_file`. */
export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    const actor = await requireAnyWebPermission(request, [
      "hr.reimburse.view",
      "hr.reimburse.submit",
      "hr.reimburse.decide",
      "hr.reimburse.pay",
    ]);
    await ensureServerDatabaseInitialized();
    const parsed = idNotaSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return noStoreJson(
        { sukses: false, pesan: "Berkas tidak dikenal." },
        400,
      );
    }
    return noStoreJson(
      await ambilNota(getServerDatabase(), actor, parsed.data.id),
    );
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
