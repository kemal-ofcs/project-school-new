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
import { erapor } from "@/lib/services/nilai-akhir";

export const runtime = "nodejs";

const bodySchema = z
  .object({
    idTahunAjaran: z.string().min(1).max(160),
    semester: z.string().max(20),
    idRombel: z.string().max(160),
  })
  .strict();

export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    await requireWebPermission(request, "grades.view");
    await ensureServerDatabaseInitialized();
    const parsed = bodySchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return noStoreJson(
        { sukses: false, pesan: "Permintaan nilai tidak valid." },
        400,
      );
    }
    return noStoreJson(
      await erapor(
        getServerDatabase(),
        parsed.data.idTahunAjaran,
        parsed.data.semester,
        parsed.data.idRombel,
      ),
    );
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
