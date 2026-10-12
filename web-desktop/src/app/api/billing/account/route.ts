import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAnyWebPermission } from "@/lib/server/auth/authorize";
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
import { account } from "@/lib/services/billing";

export const runtime = "nodejs";

const bodySchema = z
  .object({
    idSiswa: z.string().min(1).max(200),
  })
  .strict();

export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    await requireAnyWebPermission(request, ["billing.collect", "billing.view"]);
    await ensureServerDatabaseInitialized();
    const parsed = bodySchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return noStoreJson(
        { sukses: false, pesan: "Permintaan pembukuan tidak valid." },
        400,
      );
    }
    return noStoreJson(await account(getServerDatabase(), parsed.data.idSiswa));
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
