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
import {
  hapusBerkasPelamar,
  tambahBerkasPelamar,
} from "@/lib/services/hr-rekrutmen";
import {
  berkasPelamarSchema,
  idRekrutmenSchema,
} from "@/lib/validations/hr-rekrutmen";

export const runtime = "nodejs";

// Satu berkas maks 1 MB (base64 ±1,4 MB) ditambah amplop JSON.
const BATAS_BODY = 1_677_722;

/** Tambah berkas pelamar (maks 3); cermin `desktop_hr_applicant_file_save` aksi `tambah`. */
export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    await requireWebPermission(request, "hr.recruit.manage");
    await ensureServerDatabaseInitialized();
    const parsed = berkasPelamarSchema.safeParse(
      await readJsonBody(request, BATAS_BODY),
    );
    if (!parsed.success) {
      return noStoreJson(
        {
          sukses: false,
          pesan: parsed.error.issues[0]?.message ?? "Berkas tidak terbaca.",
        },
        400,
      );
    }
    const data = parsed.data;
    return noStoreJson(await tambahBerkasPelamar(getServerDatabase(), data));
  } catch (error) {
    return toApiErrorResponse(error);
  }
}

/** Hapus berkas pelamar; cermin `desktop_hr_applicant_file_save` aksi `hapus`. */
export async function DELETE(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    await requireWebPermission(request, "hr.recruit.manage");
    await ensureServerDatabaseInitialized();
    const parsed = idRekrutmenSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return noStoreJson(
        {
          sukses: false,
          pesan: "Berkas tidak dikenal.",
        },
        400,
      );
    }
    const data = parsed.data;
    return noStoreJson(await hapusBerkasPelamar(getServerDatabase(), data.id));
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
