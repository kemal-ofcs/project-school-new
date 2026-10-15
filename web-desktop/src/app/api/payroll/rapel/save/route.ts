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
import { saveRapel } from "@/lib/services/payroll-rapel";
import { MAKS_SIMPAN_RAPEL } from "@/lib/validations/payroll-rapel";

export const runtime = "nodejs";

const bodySchema = z
  .object({
    items: z
      .array(
        z
          .object({
            idItem: z.string().min(1).max(200),
            rateBaru: z.number().int().min(0),
          })
          .strict(),
      )
      .min(1)
      .max(MAKS_SIMPAN_RAPEL),
  })
  .strict();

export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    const actor = await requireWebPermission(request, "payroll.rapel.manage");
    await ensureServerDatabaseInitialized();
    const parsed = bodySchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return noStoreJson(
        { sukses: false, pesan: "Permintaan rapel tidak valid." },
        400,
      );
    }
    return noStoreJson(
      await saveRapel(getServerDatabase(), actor.username, parsed.data.items),
    );
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
