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
import { simpanSertifikat } from "@/lib/services/hr-pelatihan";
import { sertifikatDraftSchema } from "@/lib/validations/hr-pelatihan";

export const runtime = "nodejs";

// Aksi `berkas_tambah` membawa satu berkas maks 1 MB (base64 ±1,4 MB) ditambah
// amplop JSON.
const BATAS_BODY = 1_677_722;

/**
 * Sertifikat peserta: simpan (dokumen + tautan), hapus, tambah/hapus berkas;
 * cermin `desktop_hr_training_certificate_save`. Cukup `hr.training.manage`
 * karena dokumennya dibaca dari baris peserta (Q-148).
 */
export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    const actor = await requireWebPermission(request, "hr.training.manage");
    await ensureServerDatabaseInitialized();
    const parsed = sertifikatDraftSchema.safeParse(
      await readJsonBody(request, BATAS_BODY),
    );
    if (!parsed.success) {
      return noStoreJson(
        {
          sukses: false,
          pesan:
            parsed.error.issues[0]?.message ?? "Data sertifikat tidak valid.",
        },
        400,
      );
    }
    const data = parsed.data;
    return noStoreJson(
      await simpanSertifikat(getServerDatabase(), actor.username, data),
    );
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
