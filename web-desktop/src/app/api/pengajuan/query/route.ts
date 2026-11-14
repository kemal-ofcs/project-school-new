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
import { daftarPengajuan } from "@/lib/services/hr-pengajuan";
import { daftarQuerySchema } from "@/lib/validations/hr-pengajuan";

export const runtime = "nodejs";

/** Daftar pengajuan cuti/izin; cermin `desktop_hr_requests`. */
export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    const actor = await requireWebPermission(request, "hr.request.view");
    await ensureServerDatabaseInitialized();
    const parsed = daftarQuerySchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return noStoreJson(
        { sukses: false, pesan: "Rentang tanggal tidak valid." },
        400,
      );
    }
    return noStoreJson(
      await daftarPengajuan(
        getServerDatabase(),
        actor,
        parsed.data.dari,
        parsed.data.sampai,
      ),
    );
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
