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
import { listAssessments } from "@/lib/services/grades";
import { SEMESTER_LIST } from "@/types/grades";

export const runtime = "nodejs";

const opsional = z.string().max(160).nullish();

const bodySchema = z
  .object({
    id_tahun_ajaran: z.string().min(1).max(160),
    semester: z.enum(SEMESTER_LIST),
    id_rombel: opsional,
    id_mapel: opsional,
    jenis: opsional,
  })
  .strict();

export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    await requireWebPermission(request, "grades.view");
    await ensureServerDatabaseInitialized();

    const parsed = bodySchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return noStoreJson(
        { sukses: false, pesan: "Filter penilaian tidak valid." },
        400,
      );
    }
    const hasil = await listAssessments(getServerDatabase(), parsed.data);
    return noStoreJson({ sukses: true, items: hasil.items });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
