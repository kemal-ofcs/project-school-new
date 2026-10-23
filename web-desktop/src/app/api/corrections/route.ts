import type { NextRequest } from "next/server";
import { requireWebPermission } from "@/lib/server/auth/authorize";
import { ensureServerDatabaseInitialized } from "@/lib/server/db";
import {
  ApiRequestError,
  noStoreJson,
  readJsonBody,
  toApiErrorResponse,
} from "@/lib/server/http/api-response";
import { assertSameOriginMutation } from "@/lib/server/http/request-security";
import {
  type KoreksiInput,
  prosesKoreksiAdmin,
} from "@/lib/services/correction";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    const actor = await requireWebPermission(request, "corrections.manage");
    const body = await readJsonBody<Record<string, unknown>>(request);
    // Tanggal, jenis, dan jam divalidasi `validasiKoreksi` di service.
    const draft: KoreksiInput = {
      tanggal: typeof body.tanggal === "string" ? body.tanggal.trim() : "",
      id_karyawan:
        typeof body.id_karyawan === "string" ? body.id_karyawan.trim() : "",
      jenis_koreksi: (typeof body.jenis_koreksi === "string"
        ? body.jenis_koreksi.trim()
        : "") as KoreksiInput["jenis_koreksi"],
      jam_koreksi:
        typeof body.jam_koreksi === "string"
          ? body.jam_koreksi.trim()
          : undefined,
      keterangan_admin:
        typeof body.keterangan_admin === "string"
          ? body.keterangan_admin.trim()
          : undefined,
      id_shift:
        typeof body.id_shift === "number" && Number.isSafeInteger(body.id_shift)
          ? body.id_shift
          : undefined,
      kode_operator: actor.kode_operator,
    };
    await ensureServerDatabaseInitialized();
    const result = await prosesKoreksiAdmin(draft);
    if (!result.sukses) throw new ApiRequestError(result.pesan, 409);
    return noStoreJson(result, 201);
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
