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
import { hapusDokumen, simpanDokumen } from "@/lib/services/hris";
import { dokumenDraftSchema, idSchema } from "@/lib/validations/hris";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    const actor = await requireWebPermission(request, "hr.document.manage");
    await ensureServerDatabaseInitialized();
    const parsed = dokumenDraftSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return noStoreJson(
        {
          sukses: false,
          pesan: "Data dokumen tidak valid.",
        },
        400,
      );
    }
    return noStoreJson(
      await simpanDokumen(getServerDatabase(), actor.username, parsed.data),
    );
  } catch (error) {
    return toApiErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    await requireWebPermission(request, "hr.document.manage");
    await ensureServerDatabaseInitialized();
    const parsed = idSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return noStoreJson(
        {
          sukses: false,
          pesan: "Dokumen tidak dikenal.",
        },
        400,
      );
    }
    return noStoreJson(await hapusDokumen(getServerDatabase(), parsed.data.id));
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
