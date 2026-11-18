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
import { rincianKinerja } from "@/lib/services/hr-kinerja";
import { rincianKinerjaSchema } from "@/lib/validations/hr-kinerja";

export const runtime = "nodejs";

/** Rincian satu penilaian dengan hitungan otomatis hidup; cermin `desktop_hr_performance_detail`. */
export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    const actor = await requireAnyWebPermission(request, [
      "hr.performance.view",
      "hr.performance.assess",
      "hr.performance.finalize",
    ]);
    await ensureServerDatabaseInitialized();
    const parsed = rincianKinerjaSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return noStoreJson(
        { sukses: false, pesan: "Penilaian wajib dipilih." },
        400,
      );
    }
    return noStoreJson(
      await rincianKinerja(
        getServerDatabase(),
        actor,
        parsed.data.id_penilaian,
      ),
    );
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
