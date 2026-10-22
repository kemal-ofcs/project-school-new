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
import { getStudentFile } from "@/lib/services/berkas-sekolah";
import { PmbValidationError } from "@/lib/services/pmb-admin";

export const runtime = "nodejs";

/** Satu berkas siswa beserta isinya, diambil saat dibuka (v59). */
export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    await requireWebPermission(request, "pmb.view");
    await ensureServerDatabaseInitialized();

    const parsed = z
      .object({ idBerkas: z.string().trim().min(1).max(80) })
      .strict()
      .safeParse(await readJsonBody(request));
    if (!parsed.success) throw new PmbValidationError("Berkas tidak dikenal.");
    const berkas = await getStudentFile(
      getServerDatabase(),
      parsed.data.idBerkas,
    );
    return noStoreJson({ sukses: true, berkas });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
