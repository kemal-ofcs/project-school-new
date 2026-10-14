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
import { ContentValidationError } from "@/lib/services/content-admin";
import { ambilGambarKonten } from "@/lib/services/content-images";
import { MAKS_ID_PRATINJAU_GAMBAR } from "@/lib/validations/konten-gambar";

export const runtime = "nodejs";

const bodySchema = z
  .object({
    ids: z.array(z.string().max(64)).max(MAKS_ID_PRATINJAU_GAMBAR),
  })
  .strict();

export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    await requireWebPermission(request, "content.view", false);
    await ensureServerDatabaseInitialized();

    const body = bodySchema.safeParse(await readJsonBody(request, 64 * 1024));
    if (!body.success) {
      throw new ContentValidationError("Daftar foto tidak sah.");
    }
    return noStoreJson(
      await ambilGambarKonten(getServerDatabase(), body.data.ids),
    );
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
