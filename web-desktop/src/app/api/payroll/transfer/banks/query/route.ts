import type { NextRequest } from "next/server";
import { requireWebSession } from "@/lib/server/auth/authorize";
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
import { bankAktif } from "@/lib/services/transfer";
import { kosongTransferSchema } from "@/lib/validations/transfer";

export const runtime = "nodejs";

/** Bank aktif untuk isian profil keuangan, cukup sesi; cermin `desktop_transfer_banks`. */
export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    await requireWebSession(request);
    await ensureServerDatabaseInitialized();
    const parsed = kosongTransferSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return noStoreJson(
        { sukses: false, pesan: "Permintaan daftar bank tidak valid." },
        400,
      );
    }
    return noStoreJson(await bankAktif(getServerDatabase()));
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
