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
import { moveToDeposit } from "@/lib/services/billing";

export const runtime = "nodejs";

const bodySchema = z
  .object({
    idPembayaran: z.string().min(1).max(200),
    alasan: z.string().max(500),
  })
  .strict();

export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    const actor = await requireWebPermission(request, "billing.cancel");
    await ensureServerDatabaseInitialized();
    const parsed = bodySchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return noStoreJson(
        { sukses: false, pesan: "Permintaan pembukuan tidak valid." },
        400,
      );
    }
    return noStoreJson(
      await moveToDeposit(
        getServerDatabase(),
        actor.username,
        parsed.data.idPembayaran,
        parsed.data.alasan,
      ),
    );
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
