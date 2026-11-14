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
import { daftarKeluar } from "@/lib/services/hr-keluar";
import { keluarRincianSchema } from "@/lib/validations/hr-keluar";

export const runtime = "nodejs";

/** Daftar proses pegawai keluar; cermin `desktop_hr_offboardings`. */
export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    await requireAnyWebPermission(request, [
      "hr.offboard.view",
      "hr.offboard.manage",
    ]);
    await ensureServerDatabaseInitialized();
    // Body kosong; skema rincian dipakai supaya kunci asing tetap ditolak.
    const parsed = keluarRincianSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return noStoreJson(
        { sukses: false, pesan: "Permintaan tidak valid." },
        400,
      );
    }
    return noStoreJson(await daftarKeluar(getServerDatabase()));
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
