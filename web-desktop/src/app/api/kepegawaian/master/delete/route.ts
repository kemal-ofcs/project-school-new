import type { NextRequest } from "next/server";
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
import { hapusMasterOrganisasi } from "@/lib/services/hris";
import { hapusMasterSchema } from "@/lib/validations/hris";

export const runtime = "nodejs";

/** Hapus bagian/jabatan/jenis tugas/jenis pengajuan. Cermin `desktop_hr_master_delete`. */
export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    await requireWebPermission(request, "hr.org.manage");
    await ensureServerDatabaseInitialized();
    const parsed = hapusMasterSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return noStoreJson(
        { sukses: false, pesan: "Data yang dihapus tidak valid." },
        400,
      );
    }
    return noStoreJson(
      await hapusMasterOrganisasi(
        getServerDatabase(),
        parsed.data.jenis,
        parsed.data.id,
      ),
    );
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
