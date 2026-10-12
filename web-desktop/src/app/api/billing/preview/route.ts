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
import { preview } from "@/lib/services/billing";

export const runtime = "nodejs";

const bodySchema = z
  .object({
    idJenisTagihan: z.string().min(1).max(200),
    periode: z.string().max(20),
    unit: z.string().max(160).nullish(),
    idRombel: z.string().max(160).nullish(),
  })
  .strict();

export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    await requireWebPermission(request, "billing.manage");
    await ensureServerDatabaseInitialized();
    const parsed = bodySchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return noStoreJson(
        { sukses: false, pesan: "Permintaan pembukuan tidak valid." },
        400,
      );
    }
    return noStoreJson(
      await preview(
        getServerDatabase(),
        parsed.data.idJenisTagihan,
        parsed.data.periode,
        parsed.data.unit ?? null,
        parsed.data.idRombel ?? null,
      ),
    );
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
