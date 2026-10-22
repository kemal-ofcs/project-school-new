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
import { saveSiswaDapodik } from "@/lib/services/siswa-dapodik";

export const runtime = "nodejs";

/**
 * Simpan data DAPODIK seorang siswa (v57, cloud-only). Dua izin seperti angkat
 * siswa: `pmb.manage` untuk datanya, `students.manage` untuk siswanya. Body
 * divalidasi `simpanDapodikSiswaSchema` (strict) di dalam service.
 */
export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    const operator = await requireWebPermission(request, "pmb.manage");
    await requireWebPermission(request, "students.manage");
    await ensureServerDatabaseInitialized();

    await saveSiswaDapodik(
      getServerDatabase(),
      await readJsonBody(request),
      operator.username,
    );
    return noStoreJson({ sukses: true });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
