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
import { PmbValidationError } from "@/lib/services/pmb-admin";
import { clearSiswaDapodik } from "@/lib/services/siswa-dapodik";

export const runtime = "nodejs";

const bodySchema = z
  .object({ idSiswa: z.string().trim().min(1).max(80) })
  .strict();

/** Kosongkan data DAPODIK seorang siswa; siswanya tidak tersentuh. */
export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    const operator = await requireWebPermission(request, "pmb.manage");
    await requireWebPermission(request, "students.manage");
    await ensureServerDatabaseInitialized();

    const parsed = bodySchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      throw new PmbValidationError("Siswa tidak dikenal.");
    }
    await clearSiswaDapodik(
      getServerDatabase(),
      parsed.data.idSiswa,
      operator.username,
    );
    return noStoreJson({ sukses: true });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
