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
import { listSiswaDapodik } from "@/lib/services/siswa-dapodik";
import { MAKS_ID_BACA_DAPODIK } from "@/lib/validations/siswa-dapodik";

export const runtime = "nodejs";

const bodySchema = z
  .object({
    ids: z.array(z.string().max(80)).max(MAKS_ID_BACA_DAPODIK),
  })
  .strict();

/**
 * Data DAPODIK sejumlah siswa (v57, cloud-only). `pmb.view`, bukan
 * `students.view`: isinya NIK, No KK, dan penghasilan orang tua.
 */
export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    await requireWebPermission(request, "pmb.view");
    await ensureServerDatabaseInitialized();

    const parsed = bodySchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      throw new PmbValidationError("Permintaan data DAPODIK tidak valid.");
    }
    const items = await listSiswaDapodik(getServerDatabase(), parsed.data.ids);
    return noStoreJson({ sukses: true, items });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
