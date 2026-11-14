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
import { hapusBaris, tambahBerkasDokumen } from "@/lib/services/hris";
import {
  berkasDokumenSchema,
  HAPUS_BERKAS_SQL,
  idSchema,
} from "@/lib/validations/hris";

export const runtime = "nodejs";

// Satu berkas maks 1 MB (base64 ±1,4 MB) ditambah amplop JSON.
const BATAS_BODY = 1_677_722;

export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    await requireWebPermission(request, "hr.document.manage");
    await ensureServerDatabaseInitialized();
    const parsed = berkasDokumenSchema.safeParse(
      await readJsonBody(request, BATAS_BODY),
    );
    if (!parsed.success) {
      return noStoreJson(
        {
          sukses: false,
          pesan: parsed.error.issues[0]?.message ?? "Berkas tidak terbaca.",
        },
        400,
      );
    }
    return noStoreJson(
      await tambahBerkasDokumen(getServerDatabase(), parsed.data),
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
          pesan: "Berkas tidak dikenal.",
        },
        400,
      );
    }
    return noStoreJson(
      await hapusBaris(getServerDatabase(), HAPUS_BERKAS_SQL, parsed.data.id),
    );
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
