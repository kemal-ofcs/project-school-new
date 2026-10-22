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
import {
  saveStudentFile,
  uraiBerkasKiriman,
} from "@/lib/services/berkas-sekolah";
import { PmbValidationError } from "@/lib/services/pmb-admin";

export const runtime = "nodejs";

/**
 * Unggah atau ganti satu berkas siswa (v59, cloud-only). Dua izin seperti
 * simpan data DAPODIK siswa.
 */
export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    const operator = await requireWebPermission(request, "pmb.manage");
    await requireWebPermission(request, "students.manage");
    await ensureServerDatabaseInitialized();

    const { idSiswa, ...berkas } =
      await readJsonBody<Record<string, unknown>>(request);
    const id = z.string().trim().min(1).max(80).safeParse(idSiswa);
    if (!id.success) throw new PmbValidationError("Siswa tidak dikenal.");
    const hasil = await saveStudentFile(
      getServerDatabase(),
      id.data,
      uraiBerkasKiriman(berkas),
      operator.username,
    );
    return noStoreJson({ sukses: true, ...hasil });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
