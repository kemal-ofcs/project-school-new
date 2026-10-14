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
import { recapRombel } from "@/lib/services/billing";

export const runtime = "nodejs";

const bodySchema = z
  .object({
    periode: z.string().max(160),
    idJenisTagihan: z.string().max(160).nullish(),
  })
  .strict();

export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    await requireWebPermission(request, "billing.view");
    await ensureServerDatabaseInitialized();
    const parsed = bodySchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return noStoreJson(
        { sukses: false, pesan: "Permintaan rekap tidak valid." },
        400,
      );
    }
    return noStoreJson(
      await recapRombel(
        getServerDatabase(),
        parsed.data.periode,
        parsed.data.idJenisTagihan,
      ),
    );
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
