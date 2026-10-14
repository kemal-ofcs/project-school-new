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
import { saveWeights } from "@/lib/services/nilai-akhir";

export const runtime = "nodejs";

const bodySchema = z
  .object({
    bobotKehadiran: z.number(),
    items: z
      .array(
        z.object({ id_jenis: z.string().max(200), bobot: z.number() }).strict(),
      )
      .max(200),
  })
  .strict();

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
    return noStoreJson(
      await saveWeights(
        getServerDatabase(),
        parsed.data.bobotKehadiran,
        parsed.data.items,
      ),
    );
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
