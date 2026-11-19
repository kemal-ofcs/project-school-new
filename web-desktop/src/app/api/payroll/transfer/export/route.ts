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
import { berkasTransfer } from "@/lib/services/transfer";
import { IZIN_UNDUH, pilihanTransferSchema } from "@/lib/validations/transfer";

export const runtime = "nodejs";

/** Data berkas transfer untuk diunduh dan mencatat `TRANSFER_EXPORT`; cermin `desktop_transfer_export`. */
export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    const actor = await requireWebPermission(request, IZIN_UNDUH[0]);
    await requireWebPermission(request, IZIN_UNDUH[1]);
    await ensureServerDatabaseInitialized();
    const parsed = pilihanTransferSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return noStoreJson(
        { sukses: false, pesan: "Pilihan berkas transfer tidak valid." },
        400,
      );
    }
    return noStoreJson(
      await berkasTransfer(
        getServerDatabase(),
        actor.username,
        parsed.data,
        true,
      ),
    );
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
