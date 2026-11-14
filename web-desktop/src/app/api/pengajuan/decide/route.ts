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
import { putuskanPengajuan } from "@/lib/services/hr-pengajuan";
import { keputusanDraftSchema } from "@/lib/validations/hr-pengajuan";

export const runtime = "nodejs";

/** Setujui, Tolak, Diketahui, Batal. Cermin `desktop_hr_request_decide`. */
export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    const actor = await requireAnyWebPermission(request, [
      "hr.request.submit",
      "hr.request.decide",
      "hr.request.decide_major",
    ]);
    await ensureServerDatabaseInitialized();
    const parsed = keputusanDraftSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return noStoreJson(
        { sukses: false, pesan: "Data keputusan tidak valid." },
        400,
      );
    }
    return noStoreJson(
      await putuskanPengajuan(
        getServerDatabase(),
        actor,
        parsed.data.id_pengajuan,
        parsed.data.aksi,
        parsed.data.alasan,
      ),
    );
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
