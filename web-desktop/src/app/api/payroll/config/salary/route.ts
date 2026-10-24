import type { NextRequest } from "next/server";
import { requireWebPermission } from "@/lib/server/auth/authorize";
import {
  ensureServerDatabaseInitialized,
  getServerDatabase,
} from "@/lib/server/db";
import {
  ApiRequestError,
  noStoreJson,
  readJsonBody,
  toApiErrorResponse,
} from "@/lib/server/http/api-response";
import { assertSameOriginMutation } from "@/lib/server/http/request-security";
import {
  PENERIMA_GAJI_SQL,
  PESAN_PENERIMA_GAJI_TIDAK_ADA,
  pesanKonfigurasiGajiTidakSah,
} from "@/lib/validations/payroll-policy";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    await requireWebPermission(request, "payroll.view");
    await ensureServerDatabaseInitialized();
    const client = getServerDatabase();

    const body = await readJsonBody<{ search?: string }>(request);
    const searchPattern = body.search ? `%${body.search.trim()}%` : "%";

    const result = await client.execute({
      sql: `
        SELECT sc.id, sc.id_karyawan, sc.rate_per_hour, sc.rate_per_jp, sc.ptkp_status,
               sc.effective_date, sc.created_by, sc.created_at
        FROM salary_configs sc
        LEFT JOIN master_data md ON md.id_unik = sc.id_karyawan
        WHERE ? = '%' OR COALESCE(md.nama, '') LIKE ? OR COALESCE(md.kode_karyawan, '') LIKE ? OR sc.id_karyawan LIKE ?
        ORDER BY sc.effective_date DESC;
      `,
      args: [searchPattern, searchPattern, searchPattern, searchPattern],
    });

    return noStoreJson({ data: result.rows });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const actor = await requireWebPermission(request, "payroll.config.manage");
    assertSameOriginMutation(request);
    await ensureServerDatabaseInitialized();
    const client = getServerDatabase();

    const body = await readJsonBody<{ draft?: Record<string, unknown> }>(
      request,
    );
    const draft = body.draft;
    if (
      !draft ||
      !draft.id_karyawan ||
      draft.rate_per_hour === undefined ||
      !draft.effective_date
    ) {
      throw new ApiRequestError(
        "id_karyawan, rate_per_hour, dan effective_date wajib diisi.",
        400,
      );
    }
    const ratePerJp = draft.rate_per_jp ?? 0;
    const ptkpStatus = draft.ptkp_status || "TK/0";
    const pesan = pesanKonfigurasiGajiTidakSah({
      rate_per_hour: draft.rate_per_hour,
      rate_per_jp: ratePerJp,
      ptkp_status: ptkpStatus,
      effective_date: draft.effective_date,
    });
    if (pesan) {
      throw new ApiRequestError(pesan, 400);
    }
    const penerima = await client.execute({
      sql: PENERIMA_GAJI_SQL,
      args: [String(draft.id_karyawan)],
    });
    if (penerima.rows.length === 0) {
      throw new ApiRequestError(PESAN_PENERIMA_GAJI_TIDAK_ADA, 400);
    }

    const configId =
      typeof draft.id === "string" && draft.id.trim()
        ? draft.id.trim()
        : `sc-${Date.now()}`;
    const now = new Date().toISOString();

    await client.execute({
      sql: `
        INSERT INTO salary_configs (
          id, id_karyawan, rate_per_hour, rate_per_jp, ptkp_status, effective_date, created_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id_karyawan, effective_date) DO UPDATE SET
          rate_per_hour = excluded.rate_per_hour,
          rate_per_jp = excluded.rate_per_jp,
          ptkp_status = excluded.ptkp_status,
          created_by = excluded.created_by;
      `,
      args: [
        configId,
        String(draft.id_karyawan),
        Number(draft.rate_per_hour),
        Number(ratePerJp),
        String(ptkpStatus),
        String(draft.effective_date),
        actor.username,
        now,
      ],
    });

    return noStoreJson({ sukses: true });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireWebPermission(request, "payroll.config.manage");
    assertSameOriginMutation(request);
    await ensureServerDatabaseInitialized();
    const client = getServerDatabase();

    const body = await readJsonBody<{ id: string }>(request);
    await client.execute({
      sql: "DELETE FROM salary_configs WHERE id = ?;",
      args: [body.id],
    });

    return noStoreJson({ sukses: true });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
