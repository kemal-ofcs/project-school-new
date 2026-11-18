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
import { daftarKinerja } from "@/lib/services/hr-kinerja";
import { daftarKinerjaSchema } from "@/lib/validations/hr-kinerja";

export const runtime = "nodejs";

/** Penilaian kinerja satu periode atau riwayat satu pegawai; cermin `desktop_hr_performance_list`. */
export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    const actor = await requireAnyWebPermission(request, [
      "hr.performance.view",
      "hr.performance.assess",
      "hr.performance.finalize",
    ]);
    await ensureServerDatabaseInitialized();
    const parsed = daftarKinerjaSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return noStoreJson(
        { sukses: false, pesan: "Permintaan daftar kinerja tidak valid." },
        400,
      );
    }
    return noStoreJson(
      await daftarKinerja(getServerDatabase(), actor, parsed.data),
    );
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
