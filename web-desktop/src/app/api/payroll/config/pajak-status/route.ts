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
import { simpanSetting } from "@/lib/services/hris";
import {
  daftarStatusTidakTetap,
  KUNCI_STATUS_TIDAK_TETAP,
  PILIHAN_STATUS_TIDAK_TETAP,
  validasiStatusTidakTetap,
} from "@/lib/validations/pajak";

export const runtime = "nodejs";

const bodySchema = z
  .object({ daftar: z.array(z.string().max(40)).max(20) })
  .strict();

export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    await requireWebPermission(request, "payroll.config.manage");
    await ensureServerDatabaseInitialized();
    const parsed = bodySchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return noStoreJson(
        { sukses: false, pesan: "Daftar status tidak valid." },
        400,
      );
    }
    const valid = validasiStatusTidakTetap(parsed.data.daftar);
    if (!valid.ok) {
      return noStoreJson({ sukses: false, pesan: valid.galat }, 400);
    }
    await simpanSetting(
      getServerDatabase(),
      KUNCI_STATUS_TIDAK_TETAP,
      valid.nilai,
    );
    return noStoreJson({
      tersimpan: true,
      daftar: daftarStatusTidakTetap(valid.nilai),
      pilihan: PILIHAN_STATUS_TIDAK_TETAP,
    });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
