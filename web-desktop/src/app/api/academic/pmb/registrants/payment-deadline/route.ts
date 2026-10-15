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
import {
  extendPmbPaymentDeadline,
  PmbValidationError,
} from "@/lib/services/pmb-admin";
import { tanggalValid } from "@/lib/validations/hari-kerja";

export const runtime = "nodejs";

const bodySchema = z
  .object({
    idPendaftar: z.string().trim().min(1).max(80),
    batasBayar: z.string().refine(tanggalValid, "Batas bayar tidak valid."),
  })
  .strict();

/** Perpanjang batas bayar. Cerminan `desktop_extend_pmb_payment_deadline`. */
export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    await requireWebPermission(request, "pmb.manage");
    await ensureServerDatabaseInitialized();

    const parsed = bodySchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      throw new PmbValidationError(
        parsed.error.issues[0]?.message ??
          "Permintaan perpanjangan tidak valid.",
      );
    }
    await extendPmbPaymentDeadline(
      getServerDatabase(),
      parsed.data.idPendaftar,
      parsed.data.batasBayar,
    );
    return noStoreJson({ sukses: true });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
