import type { NextRequest } from "next/server";
import { hasPermission } from "@/lib/auth/access";
import {
  requireAnyWebPermission,
  requireWebSession,
} from "@/lib/server/auth/authorize";
import {
  ensureServerDatabaseInitialized,
  getServerDatabase,
} from "@/lib/server/db";
import {
  noStoreJson,
  toApiErrorResponse,
} from "@/lib/server/http/api-response";
import { assertSameOriginMutation } from "@/lib/server/http/request-security";
import { perluPerhatian } from "@/lib/services/hr-pengingat";
import { IZIN_PENGINGAT } from "@/lib/validations/hr-pengingat";

export const runtime = "nodejs";

/**
 * Kartu "Perlu perhatian" HRIS; cermin `desktop_hr_attention`. Sesi tanpa
 * satu pun izin kartu mendapat daftar kosong, bukan galat.
 */
export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    const sesi = await requireWebSession(request);
    if (!IZIN_PENGINGAT.some((izin) => hasPermission(sesi, izin))) {
      return noStoreJson({ hari_ini: "", items: [] });
    }
    const operator = await requireAnyWebPermission(request, IZIN_PENGINGAT);
    await ensureServerDatabaseInitialized();
    return noStoreJson(await perluPerhatian(getServerDatabase(), operator));
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
