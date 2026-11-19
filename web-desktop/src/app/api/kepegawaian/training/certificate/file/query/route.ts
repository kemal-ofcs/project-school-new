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
import { ambilBerkasSertifikat } from "@/lib/services/hr-pelatihan";
import { idBerkasSertifikatSchema } from "@/lib/validations/hr-pelatihan";

export const runtime = "nodejs";

/** Isi satu berkas sertifikat yang tertaut peserta; cermin `desktop_hr_training_certificate_file`. */
export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    await requireAnyWebPermission(request, [
      "hr.training.view",
      "hr.training.manage",
    ]);
    await ensureServerDatabaseInitialized();
    const parsed = idBerkasSertifikatSchema.safeParse(
      await readJsonBody(request),
    );
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
    return noStoreJson(
      await ambilBerkasSertifikat(getServerDatabase(), data.id),
    );
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
