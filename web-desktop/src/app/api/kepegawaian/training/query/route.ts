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
import { daftarPelatihan } from "@/lib/services/hr-pelatihan";
import { pelatihanQuerySchema } from "@/lib/validations/hr-pelatihan";

export const runtime = "nodejs";

/** Daftar, rincian, riwayat, atau rekap pelatihan; cermin `desktop_hr_trainings`. */
export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    await requireAnyWebPermission(request, [
      "hr.training.view",
      "hr.training.manage",
    ]);
    await ensureServerDatabaseInitialized();
    const parsed = pelatihanQuerySchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return noStoreJson(
        {
          sukses: false,
          pesan: "Permintaan data pelatihan tidak valid.",
        },
        400,
      );
    }
    const data = parsed.data;
    return noStoreJson(await daftarPelatihan(getServerDatabase(), data));
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
