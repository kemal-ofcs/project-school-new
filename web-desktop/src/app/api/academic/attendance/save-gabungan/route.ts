import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireWebPermission } from "@/lib/server/auth/authorize";
import { ensureServerDatabaseInitialized } from "@/lib/server/db";
import {
  noStoreJson,
  readJsonBody,
  toApiErrorResponse,
} from "@/lib/server/http/api-response";
import { assertSameOriginMutation } from "@/lib/server/http/request-security";
import {
  type StudentAttendanceDraftItem,
  saveClassAttendanceGabungan,
} from "@/lib/services/class-attendance";
import { MAKS_ROMBEL_GABUNGAN } from "@/lib/validations/class-attendance";

export const runtime = "nodejs";

// Status dibiarkan string di sini: nilai asing ditolak `siapkanSimpanPresensi`
// dengan pesan yang sama seperti simpan biasa, bukan pesan Zod generik. Karena
// itu tipe di bawah hanya ditegaskan, tidak dipercaya.
const itemSchema = z
  .object({
    id_siswa: z.string().max(200),
    status: z.string().max(40),
    catatan: z.string().max(1000).nullish(),
  })
  .strict();

const draftSchema = z
  .object({
    id_presensi_mapel: z.string().max(200).nullish(),
    id_tahun_ajaran: z.string().max(200),
    id_rombel: z.string().max(200),
    id_mapel: z.string().max(200),
    id_guru: z.string().max(200),
    tanggal: z.string().max(20),
    jam_ke: z.string().max(20),
    materi_pokok: z.string().max(2000).nullish(),
    catatan: z.string().max(2000).nullish(),
    items: z.array(itemSchema).max(2000),
  })
  .strict();

const bodySchema = z
  .object({
    drafts: z.array(draftSchema).max(MAKS_ROMBEL_GABUNGAN + 1),
  })
  .strict();

export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    await requireWebPermission(request, "class_attendance.manage");
    await ensureServerDatabaseInitialized();
    const parsed = bodySchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return noStoreJson(
        { sukses: false, pesan: "Data presensi gabungan tidak valid." },
        400,
      );
    }
    const drafts = parsed.data.drafts.map((draft) => ({
      ...draft,
      id_presensi_mapel: draft.id_presensi_mapel ?? undefined,
      items: draft.items.map((item) => ({
        ...item,
        status: item.status as StudentAttendanceDraftItem["status"],
      })),
    }));
    return noStoreJson(await saveClassAttendanceGabungan(drafts));
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
