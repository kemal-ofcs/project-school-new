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
  confirmPmbPayment,
  PmbValidationError,
} from "@/lib/services/pmb-admin";
import { tanggalValid } from "@/lib/validations/hari-kerja";
import { METODE_BAYAR_PMB } from "@/lib/validations/pmb-pembayaran";

export const runtime = "nodejs";

const bodySchema = z
  .object({
    idPendaftar: z.string().trim().min(1).max(80),
    jumlah: z.number().int().positive("Jumlah bayar harus lebih dari nol."),
    tanggal: z.string().refine(tanggalValid, "Tanggal bayar tidak valid."),
    metode: z.enum(METODE_BAYAR_PMB, { error: "Metode bayar tidak dikenali." }),
  })
  .strict();

/** Catat pembayaran biaya pendaftaran. Cerminan `desktop_confirm_pmb_payment`. */
export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    const operator = await requireWebPermission(request, "pmb.manage");
    await ensureServerDatabaseInitialized();

    const parsed = bodySchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      throw new PmbValidationError(
        parsed.error.issues[0]?.message ?? "Data pembayaran tidak valid.",
      );
    }
    await confirmPmbPayment(
      getServerDatabase(),
      parsed.data,
      operator.username,
    );
    return noStoreJson({ sukses: true });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
