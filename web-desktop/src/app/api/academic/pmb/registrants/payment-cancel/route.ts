import type { NextRequest } from "next/server";
import { z } from "zod";
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
import { cancelPmbPayment, PmbValidationError } from "@/lib/services/pmb-admin";

export const runtime = "nodejs";

const bodySchema = z
  .object({
    idPendaftar: z.string().trim().min(1).max(80),
    alasan: z.string().max(255, "Alasan paling banyak 255 karakter."),
  })
  .strict();

/** Batalkan pembayaran yang salah dicatat. Cerminan `desktop_cancel_pmb_payment`. */
export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    const operator = await requireWebPermission(request, "pmb.manage");
    await ensureServerDatabaseInitialized();

    const parsed = bodySchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      throw new PmbValidationError(
        parsed.error.issues[0]?.message ?? "Permintaan pembatalan tidak valid.",
      );
    }
    await cancelPmbPayment(
      getServerDatabase(),
      parsed.data.idPendaftar,
      parsed.data.alasan,
      operator.username,
    );
    return noStoreJson({ sukses: true });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
