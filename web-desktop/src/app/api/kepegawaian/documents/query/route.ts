import type { NextRequest } from "next/server";
import { z } from "zod";
import { AuthorizationError } from "@/lib/auth/permission-assertion";
import { requireAnyWebPermission } from "@/lib/server/auth/authorize";
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
import { getDokumen } from "@/lib/services/hris";
import { bolehBacaDokumen } from "@/lib/validations/hris";

export const runtime = "nodejs";

const bodySchema = z
  .object({ id_karyawan: z.string().trim().max(80).default("") })
  .strict();

/**
 * Jenis dokumen; dengan `id_karyawan`, juga dokumen dan daftar berkasnya tanpa
 * isi. Jenis saja boleh dibaca pemegang `hr.org.manage`.
 */
export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    const actor = await requireAnyWebPermission(request, [
      "hr.document.view",
      "hr.org.manage",
    ]);
    await ensureServerDatabaseInitialized();
    const parsed = bodySchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return noStoreJson(
        { sukses: false, pesan: "Pegawai tidak dikenal." },
        400,
      );
    }
    if (!bolehBacaDokumen(actor, parsed.data.id_karyawan)) {
      throw new AuthorizationError("Akses ditolak untuk tindakan ini.", 403);
    }
    return noStoreJson(
      await getDokumen(getServerDatabase(), parsed.data.id_karyawan),
    );
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
