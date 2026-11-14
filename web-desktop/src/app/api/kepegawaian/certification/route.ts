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
import { hapusBaris, simpanSertifikasi } from "@/lib/services/hris";
import {
  HAPUS_SERTIFIKASI_SQL,
  idSchema,
  sertifikasiDraftSchema,
} from "@/lib/validations/hris";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    const actor = await requireWebPermission(request, "teachers.manage");
    await ensureServerDatabaseInitialized();
    const parsed = sertifikasiDraftSchema.safeParse(
      await readJsonBody(request),
    );
    if (!parsed.success) {
      return noStoreJson(
        {
          sukses: false,
          pesan: "Data sertifikat tidak valid.",
        },
        400,
      );
    }
    return noStoreJson(
      await simpanSertifikasi(getServerDatabase(), actor.username, parsed.data),
    );
  } catch (error) {
    return toApiErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    await requireWebPermission(request, "teachers.manage");
    await ensureServerDatabaseInitialized();
    const parsed = idSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return noStoreJson(
        {
          sukses: false,
          pesan: "Sertifikat tidak dikenal.",
        },
        400,
      );
    }
    return noStoreJson(
      await hapusBaris(
        getServerDatabase(),
        HAPUS_SERTIFIKASI_SQL,
        parsed.data.id,
      ),
    );
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
