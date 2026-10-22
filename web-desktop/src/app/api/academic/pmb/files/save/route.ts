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
import { savePmbFile, uraiBerkasKiriman } from "@/lib/services/berkas-sekolah";
import { PmbValidationError } from "@/lib/services/pmb-admin";

export const runtime = "nodejs";

/**
 * Unggah atau ganti satu berkas pendaftar (v59, cloud-only). Isinya diperiksa
 * `berkasSekolahSchema`: ukuran dihitung dari isi dan tanda tangan berkas
 * harus cocok dengan jenisnya.
 */
export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    await requireWebPermission(request, "pmb.manage");
    await ensureServerDatabaseInitialized();

    const { idPendaftar, ...berkas } =
      await readJsonBody<Record<string, unknown>>(request);
    const id = z.string().trim().min(1).max(80).safeParse(idPendaftar);
    if (!id.success) throw new PmbValidationError("Pendaftar tidak dikenal.");
    const hasil = await savePmbFile(
      getServerDatabase(),
      id.data,
      uraiBerkasKiriman(berkas),
    );
    return noStoreJson({ sukses: true, ...hasil });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
