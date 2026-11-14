import type { NextRequest } from "next/server";
import {
  requireAnyWebPermission,
  requireWebPermission,
} from "@/lib/server/auth/authorize";
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
import { saldoCuti } from "@/lib/services/hr-pengajuan";
import { saldoQuerySchema } from "@/lib/validations/hr-pengajuan";

export const runtime = "nodejs";

/**
 * Aturan cuti (juga untuk `hr.org.manage`); jatah satu pegawai khusus
 * `hr.request.view`. Cermin `desktop_hr_leave_balance`.
 */
export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    const parsed = saldoQuerySchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return noStoreJson(
        { sukses: false, pesan: "Permintaan jatah cuti tidak valid." },
        400,
      );
    }
    if ((parsed.data.id_karyawan ?? "").trim() !== "") {
      await requireWebPermission(request, "hr.request.view");
    } else {
      await requireAnyWebPermission(request, [
        "hr.request.view",
        "hr.org.manage",
      ]);
    }
    await ensureServerDatabaseInitialized();
    return noStoreJson(
      await saldoCuti(
        getServerDatabase(),
        parsed.data.id_karyawan ?? null,
        parsed.data.mulai ?? null,
        parsed.data.selesai ?? null,
      ),
    );
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
