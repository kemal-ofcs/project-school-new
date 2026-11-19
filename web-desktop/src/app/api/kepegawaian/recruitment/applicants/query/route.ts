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
import { daftarPelamar } from "@/lib/services/hr-rekrutmen";
import { pelamarQuerySchema } from "@/lib/validations/hr-rekrutmen";

export const runtime = "nodejs";

/** Pelamar satu lowongan atau rincian satu pelamar; cermin `desktop_hr_applicants`. */
export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    await requireAnyWebPermission(request, [
      "hr.recruit.view",
      "hr.recruit.manage",
    ]);
    await ensureServerDatabaseInitialized();
    const parsed = pelamarQuerySchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return noStoreJson(
        {
          sukses: false,
          pesan: "Permintaan daftar pelamar tidak valid.",
        },
        400,
      );
    }
    const data = parsed.data;
    return noStoreJson(
      await daftarPelamar(
        getServerDatabase(),
        data.id_lowongan,
        data.id_pelamar,
      ),
    );
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
