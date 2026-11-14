import type { NextRequest } from "next/server";
import { z } from "zod";
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
import { getProfil } from "@/lib/services/hris";
import { kelompokProfil } from "@/lib/validations/hris";

export const runtime = "nodejs";

const bodySchema = z
  .object({ id_karyawan: z.string().trim().min(1).max(80) })
  .strict();

/** Profil cloud-only: hanya kelompok yang izinnya dipegang sesi. */
export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    const actor = await requireAnyWebPermission(request, [
      "hr.personal.view",
      "hr.finance.view",
      "teachers.view",
    ]);
    await ensureServerDatabaseInitialized();
    const parsed = bodySchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return noStoreJson(
        { sukses: false, pesan: "Pegawai tidak dikenal." },
        400,
      );
    }
    return noStoreJson(
      await getProfil(
        getServerDatabase(),
        parsed.data.id_karyawan,
        kelompokProfil(actor),
      ),
    );
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
