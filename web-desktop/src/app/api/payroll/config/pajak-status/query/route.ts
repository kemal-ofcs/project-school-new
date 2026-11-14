import type { NextRequest } from "next/server";
import { requireWebPermission } from "@/lib/server/auth/authorize";
import {
  ensureServerDatabaseInitialized,
  getServerDatabase,
} from "@/lib/server/db";
import {
  noStoreJson,
  toApiErrorResponse,
} from "@/lib/server/http/api-response";
import { assertSameOriginMutation } from "@/lib/server/http/request-security";
import {
  daftarStatusTidakTetap,
  KUNCI_STATUS_TIDAK_TETAP,
  PILIHAN_STATUS_TIDAK_TETAP,
} from "@/lib/validations/pajak";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    await requireWebPermission(request, "payroll.view");
    await ensureServerDatabaseInitialized();
    const row = (
      await getServerDatabase().execute({
        sql: "SELECT value FROM setting_gex_system WHERE key = ?1 LIMIT 1;",
        args: [KUNCI_STATUS_TIDAK_TETAP],
      })
    ).rows[0];
    const tersimpan = row ? String(row.value ?? "") : null;
    return noStoreJson({
      tersimpan: tersimpan !== null,
      daftar: daftarStatusTidakTetap(tersimpan),
      pilihan: PILIHAN_STATUS_TIDAK_TETAP,
    });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
