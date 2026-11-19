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
import { ambilBerkasPelamar } from "@/lib/services/hr-rekrutmen";
import { idRekrutmenSchema } from "@/lib/validations/hr-rekrutmen";

export const runtime = "nodejs";

/** Isi satu berkas pelamar; cermin `desktop_hr_applicant_file`. */
export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    await requireAnyWebPermission(request, [
      "hr.recruit.view",
      "hr.recruit.manage",
    ]);
    await ensureServerDatabaseInitialized();
    const parsed = idRekrutmenSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return noStoreJson(
        {
          sukses: false,
          pesan: "Berkas tidak dikenal.",
        },
        400,
      );
    }
    const data = parsed.data;
    return noStoreJson(await ambilBerkasPelamar(getServerDatabase(), data.id));
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
