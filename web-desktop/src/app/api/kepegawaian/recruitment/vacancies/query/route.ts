import type { NextRequest } from "next/server";
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
import { daftarLowongan } from "@/lib/services/hr-rekrutmen";
import { kosongSchema } from "@/lib/validations/hr-rekrutmen";

export const runtime = "nodejs";

/** Daftar lowongan dengan status dan hitungan pelamar; cermin `desktop_hr_vacancies`. */
export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    await requireAnyWebPermission(request, [
      "hr.recruit.view",
      "hr.recruit.manage",
    ]);
    await ensureServerDatabaseInitialized();
    const parsed = kosongSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return noStoreJson(
        {
          sukses: false,
          pesan: "Permintaan daftar lowongan tidak valid.",
        },
        400,
      );
    }
    return noStoreJson(await daftarLowongan(getServerDatabase()));
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
