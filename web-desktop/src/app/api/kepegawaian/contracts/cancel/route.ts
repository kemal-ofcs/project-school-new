import type { NextRequest } from "next/server";
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
import { batalKontrak } from "@/lib/services/hris";
import { batalSchema } from "@/lib/validations/hris";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    const actor = await requireWebPermission(request, "hr.contract.manage");
    await ensureServerDatabaseInitialized();
    const parsed = batalSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return noStoreJson(
        { sukses: false, pesan: "Permintaan pembatalan tidak valid." },
        400,
      );
    }
    return noStoreJson(
      await batalKontrak(
        getServerDatabase(),
        actor.username,
        parsed.data.id,
        parsed.data.alasan,
      ),
    );
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
