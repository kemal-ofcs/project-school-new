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

/** Pratinjau berkas transfer tanpa jejak unduhan; cermin `desktop_transfer_preview`. Membuka rekening semua pegawai, jadi wajib kedua izin. */
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
        false,
      ),
    );
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
