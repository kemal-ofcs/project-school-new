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
import {
  jadikanPersonil,
  pelamarUntukPersonil,
} from "@/lib/services/hr-rekrutmen";
import { hireDraftSchema, izinPersonil } from "@/lib/validations/hr-rekrutmen";

export const runtime = "nodejs";

/**
 * Jadikan pelamar personil + kontrak pertama, atau Lanjutkan; cermin
 * `desktop_hr_applicant_hire`. Izin jalur personil dari kelompok lowongan di
 * database, bukan dari payload (Q-142).
 */
export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    const actor = await requireWebPermission(request, "hr.recruit.manage");
    await requireWebPermission(request, "hr.contract.manage");
    await ensureServerDatabaseInitialized();
    const parsed = hireDraftSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return noStoreJson(
        {
          sukses: false,
          pesan: "Data personil atau kontrak tidak valid.",
        },
        400,
      );
    }
    const data = parsed.data;
    const client = getServerDatabase();
    const pelamar = await pelamarUntukPersonil(client, data.id_pelamar);
    await requireWebPermission(request, izinPersonil(pelamar.kelompok));
    return noStoreJson(
      await jadikanPersonil(client, actor.username, data, pelamar),
    );
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
