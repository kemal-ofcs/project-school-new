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
import { saveSchoolDays } from "@/lib/services/nilai-akhir";

export const runtime = "nodejs";

const bodySchema = z
  .object({
    hariSekolah: z
      .object({
        bawaan: z.array(z.number()).max(7),
        unit: z.record(z.string(), z.array(z.number()).max(7)).optional(),
      })
      .strict(),
  })
  .strict();

export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    await requireWebPermission(request, "grades.configure");
    await ensureServerDatabaseInitialized();
    const parsed = bodySchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return noStoreJson(
        { sukses: false, pesan: "Permintaan nilai tidak valid." },
        400,
      );
    }
    return noStoreJson(
      await saveSchoolDays(getServerDatabase(), parsed.data.hariSekolah),
    );
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
