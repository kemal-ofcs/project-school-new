import type { NextRequest } from "next/server";
import { requireWebSession } from "@/lib/server/auth/authorize";
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
import { bersihkanPelamar } from "@/lib/services/hr-rekrutmen";
import { kosongSchema } from "@/lib/validations/hr-rekrutmen";

export const runtime = "nodejs";

/** Retensi pelamar 12 bulan sesudah lowongan ditutup; cukup sesi, hasilnya hanya hitungan. Cermin `desktop_hr_recruit_cleanup`. */
export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    await requireWebSession(request);
    await ensureServerDatabaseInitialized();
    const parsed = kosongSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return noStoreJson(
        {
          sukses: false,
          pesan: "Permintaan pembersihan tidak valid.",
        },
        400,
      );
    }
    return noStoreJson(await bersihkanPelamar(getServerDatabase()));
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
