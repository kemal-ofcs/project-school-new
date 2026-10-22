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
import { listStudentFiles } from "@/lib/services/berkas-sekolah";
import { PmbValidationError } from "@/lib/services/pmb-admin";

export const runtime = "nodejs";

/**
 * Daftar berkas seorang siswa tanpa isinya (v59, cloud-only). `pmb.view`
 * seperti data DAPODIK siswa: isinya KK dan akta.
 */
export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    await requireWebPermission(request, "pmb.view");
    await ensureServerDatabaseInitialized();

    const parsed = z
      .object({ idSiswa: z.string().trim().min(1).max(80) })
      .strict()
      .safeParse(await readJsonBody(request));
    if (!parsed.success) throw new PmbValidationError("Siswa tidak dikenal.");
    const items = await listStudentFiles(
      getServerDatabase(),
      parsed.data.idSiswa,
    );
    return noStoreJson({ sukses: true, items });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
