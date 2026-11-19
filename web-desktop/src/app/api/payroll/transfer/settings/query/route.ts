import type { NextRequest } from "next/server";
import { hasPermission } from "@/lib/auth/access";
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
import { pengaturanTransfer } from "@/lib/services/transfer";
import {
  IZIN_PENGATURAN,
  IZIN_UNDUH,
  kosongTransferSchema,
} from "@/lib/validations/transfer";

export const runtime = "nodejs";

/** Bank, rekening debet, dan format: semuanya untuk Pengaturan, yang aktif untuk pengunduh. Cermin `desktop_transfer_settings`. */
export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    const actor = await requireAnyWebPermission(request, [
      IZIN_PENGATURAN,
      IZIN_UNDUH[0],
    ]);
    const atur = hasPermission(actor, IZIN_PENGATURAN);
    if (!atur) await requireWebPermission(request, IZIN_UNDUH[1]);
    await ensureServerDatabaseInitialized();
    const parsed = kosongTransferSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return noStoreJson(
        { sukses: false, pesan: "Permintaan pengaturan transfer tidak valid." },
        400,
      );
    }
    return noStoreJson(await pengaturanTransfer(getServerDatabase(), atur));
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
