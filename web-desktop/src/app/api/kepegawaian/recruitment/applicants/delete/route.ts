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
import { hapusPelamar } from "@/lib/services/hr-rekrutmen";
import { idRekrutmenSchema } from "@/lib/validations/hr-rekrutmen";

export const runtime = "nodejs";

/** Hapus permanen satu pelamar; cermin `desktop_hr_applicant_delete`. */
export async function DELETE(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    await requireWebPermission(request, "hr.recruit.delete");
    await ensureServerDatabaseInitialized();
    const parsed = idRekrutmenSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return noStoreJson(
        {
          sukses: false,
          pesan: "Pelamar tidak dikenal.",
        },
        400,
      );
    }
    const data = parsed.data;
    return noStoreJson(await hapusPelamar(getServerDatabase(), data.id));
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
