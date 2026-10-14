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
import { saveType } from "@/lib/services/nilai-akhir";
import { jenisNilaiDraftSchema as bodySchema } from "@/lib/validations/nilai-akhir";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    await requireWebPermission(request, "grades.configure");
    await ensureServerDatabaseInitialized();
    const parsed = bodySchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return noStoreJson(
        { sukses: false, pesan: "Permintaan nilai tidak valid." },
        400,
      );
    }
    return noStoreJson(await saveType(getServerDatabase(), parsed.data));
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
