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
import { batalkanKeluar } from "@/lib/services/hr-keluar";
import { keluarBatalSchema } from "@/lib/validations/hr-keluar";

export const runtime = "nodejs";

/** Batalkan proses keluar dengan alasan; cermin `desktop_hr_offboarding_cancel`. */
export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    const actor = await requireWebPermission(request, "hr.offboard.decide");
    await ensureServerDatabaseInitialized();
    const parsed = keluarBatalSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return noStoreJson(
        { sukses: false, pesan: "Data pembatalan tidak valid." },
        400,
      );
    }
    return noStoreJson(
      await batalkanKeluar(
        getServerDatabase(),
        actor,
        parsed.data.id_keluar,
        parsed.data.alasan,
      ),
    );
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
