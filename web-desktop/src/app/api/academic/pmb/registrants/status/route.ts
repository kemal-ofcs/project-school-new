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
import { PmbValidationError, updatePmbStatus } from "@/lib/services/pmb-admin";

export const runtime = "nodejs";

const bodySchema = z
  .object({
    idPendaftar: z.string().trim().min(1).max(80),
    status: z.string().trim().min(1).max(40),
    catatan: z.string().max(1000).nullish(),
  })
  .strict();

export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    const operator = await requireWebPermission(request, "pmb.manage");
    await ensureServerDatabaseInitialized();

    const parsed = bodySchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      throw new PmbValidationError("Permintaan ubah status tidak valid.");
    }
    const body = parsed.data;

    await updatePmbStatus(
      getServerDatabase(),
      body.idPendaftar,
      body.status,
      body.catatan ?? null,
      operator.username,
    );
    return noStoreJson({ sukses: true });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
