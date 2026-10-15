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
import { cancelRapel } from "@/lib/services/payroll-rapel";

export const runtime = "nodejs";

const bodySchema = z
  .object({
    idRapel: z.string().min(1).max(260),
    alasan: z.string().max(1000),
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
      await cancelRapel(
        getServerDatabase(),
        actor.username,
        parsed.data.idRapel,
        parsed.data.alasan,
      ),
    );
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
