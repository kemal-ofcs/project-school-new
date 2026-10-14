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
import { simpanGambarKonten } from "@/lib/services/content-images";

export const runtime = "nodejs";

// 400 KB biner = ±546 ribu karakter base64, ditambah awalan data URL.
const bodySchema = z.object({ dataUrl: z.string().max(560_000) }).strict();

export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    await requireWebPermission(request, "content.manage", true);
    await ensureServerDatabaseInitialized();

    const body = bodySchema.safeParse(await readJsonBody(request, 1024 * 1024));
    if (!body.success) {
      throw new ContentValidationError(
        "Foto masih lebih dari 400 KB setelah dikompres. Pilih foto lain.",
      );
    }
    return noStoreJson(
      await simpanGambarKonten(getServerDatabase(), body.data.dataUrl),
    );
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
