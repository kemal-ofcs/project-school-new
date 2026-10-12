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
import { list } from "@/lib/services/billing";

export const runtime = "nodejs";

const bodySchema = z
  .object({
    periode: z.string().max(160).nullish(),
    idJenisTagihan: z.string().max(160).nullish(),
    idRombel: z.string().max(160).nullish(),
    status: z.string().max(20).nullish(),
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
        { sukses: false, pesan: "Permintaan pembukuan tidak valid." },
        400,
      );
    }
    return noStoreJson(
      await list(getServerDatabase(), {
        periode: parsed.data.periode,
        id_jenis_tagihan: parsed.data.idJenisTagihan,
        id_rombel: parsed.data.idRombel,
        status: parsed.data.status,
      }),
    );
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
