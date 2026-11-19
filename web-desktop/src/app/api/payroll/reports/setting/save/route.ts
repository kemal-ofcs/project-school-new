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
import { simpanPemotong } from "@/lib/services/lapor-pajak";
import { IZIN_PEMOTONG, pemotongSchema } from "@/lib/validations/lapor-pajak";

export const runtime = "nodejs";

/** Simpan NPWP, NITKU, penandatangan, dan nomor pendaftaran BPJS sekolah; cermin `desktop_report_setting_save`. */
export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    const actor = await requireWebPermission(request, IZIN_PEMOTONG);
    await ensureServerDatabaseInitialized();
    const parsed = pemotongSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return noStoreJson(
        { sukses: false, pesan: "Data pemotong tidak valid." },
        400,
      );
    }
    return noStoreJson(
      await simpanPemotong(getServerDatabase(), actor.username, parsed.data),
    );
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
