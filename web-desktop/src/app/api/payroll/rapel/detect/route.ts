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
import { detectRapel } from "@/lib/services/payroll-rapel";

export const runtime = "nodejs";

const bodySchema = z
  .object({
    dari: z.string().max(7),
    sampai: z.string().max(7),
  })
  .strict();

export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    await requireWebPermission(request, "payroll.rapel.manage");
    await ensureServerDatabaseInitialized();
    const parsed = bodySchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return noStoreJson(
        { sukses: false, pesan: "Permintaan rapel tidak valid." },
        400,
      );
    }
    return noStoreJson(
      await detectRapel(
        getServerDatabase(),
        parsed.data.dari,
        parsed.data.sampai,
      ),
    );
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
