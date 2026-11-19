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
import { simpanNota } from "@/lib/services/hr-reimburse";
import { notaDraftSchema } from "@/lib/validations/hr-reimburse";

export const runtime = "nodejs";

// Satu nota maks 1 MB (base64 ±1,4 MB) ditambah amplop JSON.
const BATAS_BODY = 1_677_722;

/** Tambah atau hapus nota; cermin `desktop_hr_reimburse_file_save`. */
export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    const actor = await requireWebPermission(request, "hr.reimburse.submit");
    await ensureServerDatabaseInitialized();
    const parsed = notaDraftSchema.safeParse(
      await readJsonBody(request, BATAS_BODY),
    );
    if (!parsed.success) {
      return noStoreJson(
        {
          sukses: false,
          pesan: parsed.error.issues[0]?.message ?? "Berkas tidak terbaca.",
        },
        400,
      );
    }
    return noStoreJson(
      await simpanNota(getServerDatabase(), actor, parsed.data),
    );
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
