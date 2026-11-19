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
import { daftarKlaim } from "@/lib/services/hr-reimburse";
import { klaimQuerySchema } from "@/lib/validations/hr-reimburse";

export const runtime = "nodejs";

/** Klaim per bulan, per pegawai, atau rincian; cermin `desktop_hr_reimburse_list`. */
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
    const parsed = klaimQuerySchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return noStoreJson(
        { sukses: false, pesan: "Permintaan klaim tidak valid." },
        400,
      );
    }
    return noStoreJson(
      await daftarKlaim(getServerDatabase(), actor, parsed.data),
    );
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
