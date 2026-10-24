import type { NextRequest } from "next/server";
import { AuthorizationError } from "@/lib/auth/permission-assertion";
import type { PermissionKey } from "@/lib/rbac/catalog";
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
import { assertAkunBayar } from "@/lib/services/accounting";
import { catatPembayaranPayrollTx } from "@/lib/services/loan";
import {
  canTransitionPayrollStatus,
  isValidPayrollStatus,
} from "@/lib/services/payroll-calculator";
import { computePayrollRecap } from "@/lib/services/payroll-recap";
import { AKUN_KAS } from "@/lib/validations/loan";
import {
  PESAN_PENYETUJU_SAMA,
  PESAN_PERIODE_PAYROLL_TIDAK_SAH,
  penyetujuSah,
  periodePayrollSah,
  pesanRunBeririsan,
  RUN_BERIRISAN_SQL,
} from "@/lib/validations/payroll-policy";

export const runtime = "nodejs";

/** Cerminan `new_payroll_id`: `Date.now()` saja bertabrakan dalam satu milidetik. */
function newPayrollId(prefix: string): string {
  return `${prefix}-${Math.floor(Date.now() / 1000)}-${crypto.randomUUID().slice(0, 12)}`;
}

// List (no runId) or single-run detail with items + audit logs (runId set).
// Kept on one static path (no [id] segment) so this route stays compatible
// with the Desktop/Mobile `output: export` build -- see runs/[id] history.
export async function POST(request: NextRequest) {
  try {
    await requireWebPermission(request, "payroll.view");
    await ensureServerDatabaseInitialized();
    const client = getServerDatabase();

    const body = await readJsonBody<{ status?: string; runId?: string }>(
      request,
    );

    if (body.runId) {
      const runResult = await client.execute({
        sql: "SELECT * FROM payroll_runs WHERE id = ? LIMIT 1;",
        args: [body.runId],
      });
      if (runResult.rows.length === 0) {
        throw new ApiRequestError("Batch payroll tidak ditemukan.", 404);
      }
      const itemsResult = await client.execute({
        sql: "SELECT * FROM payroll_items WHERE payroll_run_id = ? ORDER BY nama_karyawan ASC;",
        args: [body.runId],
      });
      const logsResult = await client.execute({
        sql: "SELECT * FROM payroll_audit_logs WHERE payroll_run_id = ? ORDER BY created_at ASC;",
        args: [body.runId],
      });
      return noStoreJson({
        run: runResult.rows[0],
        items: itemsResult.rows,
        audit_logs: logsResult.rows,
      });
    }

    const status = body.status;
    const query = status
      ? {
          sql: "SELECT * FROM payroll_runs WHERE status = ? ORDER BY period_start DESC, created_at DESC;",
          args: [status],
        }
      : {
          sql: "SELECT * FROM payroll_runs ORDER BY period_start DESC, created_at DESC;",
          args: [],
        };

    const result = await client.execute(query);
    return noStoreJson({ data: result.rows });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const actor = await requireWebPermission(request, "payroll.run.create");
    assertSameOriginMutation(request);
    await ensureServerDatabaseInitialized();
    const client = getServerDatabase();

    const body = await readJsonBody<{
      idempotencyKey?: string;
      periodStart?: string;
      periodEnd?: string;
    }>(request);

    if (!body.idempotencyKey || !body.periodStart || !body.periodEnd) {
      throw new ApiRequestError(
        "idempotencyKey, periodStart, dan periodEnd wajib diisi.",
        400,
      );
    }

    const existing = await client.execute({
      sql: "SELECT * FROM payroll_runs WHERE idempotency_key = ? LIMIT 1;",
      args: [body.idempotencyKey],
    });
    if (existing.rows.length > 0) {
      return noStoreJson({ data: existing.rows[0] });
    }
    if (!periodePayrollSah(body.periodStart, body.periodEnd)) {
      throw new ApiRequestError(PESAN_PERIODE_PAYROLL_TIDAK_SAH, 400);
    }
    const beririsan = await client.execute({
      sql: RUN_BERIRISAN_SQL,
      args: [body.periodStart, body.periodEnd],
    });
    const runLain = beririsan.rows[0];
    if (runLain) {
      throw new ApiRequestError(
        pesanRunBeririsan(
          String(runLain.id),
          String(runLain.period_start),
          String(runLain.period_end),
        ),
        409,
      );
    }

    // Awalan `est_` pada baris rekap berarti "estimasi" HANYA selama ia
    // ditampilkan sebagai pratinjau. Begitu sampai di sini, nilainya DIBEKUKAN
    // apa adanya menjadi `payroll_items` — inilah slip gaji yang dibayarkan,
    // bukan perkiraan. Jangan tergoda memperlakukannya sebagai angka kasar
    // yang boleh dihitung ulang dengan cara lain di titik ini: dua cara hitung
    // untuk satu periode adalah persis cacat yang membuat angka yang disetujui
    // berbeda dari angka yang dibayarkan.
    const recap = await computePayrollRecap(
      client,
      body.periodStart,
      body.periodEnd,
    );

    const runId = newPayrollId(`PR-${body.periodStart.replace(/-/g, "")}`);
    const now = new Date().toISOString();

    let totalGross = 0;
    let totalNet = 0;

    const itemStatements = recap.map((row) => {
      totalGross += row.est_gross_salary;
      totalNet += row.est_net_salary;
      return {
        sql: `
          INSERT INTO payroll_items (
            id, payroll_run_id, id_karyawan, nama_karyawan, divisi, ptkp_status,
            total_regular_hours, total_overtime_hours, total_overtime_index,
            total_holiday_hours, total_holiday_overtime_index,
            total_teaching_jp, teaching_salary,
            rate_per_hour, basic_salary, overtime_salary, gross_salary,
            total_allowances, total_deductions, bpjs_employee_total, bpjs_company_total,
            pph21_amount, net_salary, breakdown_snapshot, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        `,
        args: [
          `${runId}-${row.id_karyawan}`,
          runId,
          row.id_karyawan,
          row.nama_karyawan,
          row.divisi,
          row.ptkp_status,
          row.total_regular_hours,
          row.total_overtime_hours,
          row.total_overtime_index,
          row.total_holiday_hours,
          row.total_holiday_overtime_index,
          row.total_teaching_jp,
          row.teaching_salary,
          row.rate_per_hour,
          row.est_basic_salary,
          row.est_overtime_salary,
          row.est_gross_salary,
          row.est_total_allowance,
          row.est_total_deduction,
          row.est_bpjs_employee,
          row.bpjs_company_total,
          row.est_pph21,
          row.est_net_salary,
          row.breakdown_snapshot,
          now,
        ],
      };
    });

    const auditId = newPayrollId("audit");

    await client.batch(
      [
        {
          sql: `
            INSERT INTO payroll_runs (
              id, idempotency_key, period_start, period_end, status,
              total_gross_payout, total_net_payout, total_employees,
              created_by, created_at, updated_at
            ) VALUES (?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?);
          `,
          args: [
            runId,
            body.idempotencyKey,
            body.periodStart,
            body.periodEnd,
            totalGross,
            totalNet,
            recap.length,
            actor.username,
            now,
            now,
          ],
        },
        ...itemStatements,
        {
          sql: `
            INSERT INTO payroll_audit_logs (
              id, payroll_run_id, action, old_status, new_status, performed_by, notes, created_at
            ) VALUES (?, ?, 'CREATE_RUN', NULL, 'DRAFT', ?, 'Batch payroll dibuat.', ?);
          `,
          args: [auditId, runId, actor.username, now],
        },
      ],
      "write",
    );

    const runResult = await client.execute({
      sql: "SELECT * FROM payroll_runs WHERE id = ? LIMIT 1;",
      args: [runId],
    });

    return noStoreJson({ data: runResult.rows[0] });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    const body = await readJsonBody<{
      runId?: string;
      targetStatus?: string;
      notes?: string;
      idAkunBayar?: string | null;
    }>(request);

    if (!body.runId) {
      throw new ApiRequestError("runId wajib diisi.", 400);
    }
    const runId = body.runId;
    const target = (body.targetStatus || "").toUpperCase();

    if (!isValidPayrollStatus(target)) {
      throw new ApiRequestError("Status target tidak valid.", 400);
    }

    const requiredPermission: PermissionKey =
      target === "SUBMITTED"
        ? "payroll.run.create"
        : target === "REVIEWED"
          ? "payroll.run.review"
          : target === "APPROVED"
            ? "payroll.run.approve"
            : target === "PAID"
              ? "payroll.run.disburse"
              : "payroll.run.review";

    const actor = await requireWebPermission(request, requiredPermission);
    await ensureServerDatabaseInitialized();
    const client = getServerDatabase();
    const akunBayar = body.idAkunBayar?.trim() || AKUN_KAS;

    // Status, audit, dan (saat PAID) angsuran kasbon beserta jurnal payroll
    // ditulis dalam SATU transaksi, cermin `desktop_transition_payroll_status`.
    // Dulu status dan audit ditulis dua perintah terpisah; proses gaji yang
    // tercatat PAID tanpa pembukuannya tidak bisa diulang, karena PAID adalah
    // status akhir.
    const tx = await client.transaction("write");
    try {
      const currentResult = await tx.execute({
        sql: "SELECT status, created_by FROM payroll_runs WHERE id = ? LIMIT 1;",
        args: [runId],
      });
      if (currentResult.rows.length === 0) {
        throw new ApiRequestError("Batch payroll tidak ditemukan.", 404);
      }
      const currentStatus = String(currentResult.rows[0]?.status || "");
      if (!canTransitionPayrollStatus(currentStatus, target)) {
        throw new ApiRequestError(
          `Tidak dapat mengubah status dari ${currentStatus} ke ${target}.`,
          409,
        );
      }
      if (
        target === "APPROVED" &&
        !penyetujuSah(
          String(currentResult.rows[0]?.created_by ?? ""),
          actor.username,
        )
      ) {
        throw new AuthorizationError(PESAN_PENYETUJU_SAMA, 403);
      }
      if (target === "PAID") {
        await assertAkunBayar(tx, akunBayar);
      }

      const now = new Date().toISOString();
      await tx.execute({
        sql: "UPDATE payroll_runs SET status = ?, updated_at = ? WHERE id = ?;",
        args: [target, now, runId],
      });
      await tx.execute({
        sql: `
          INSERT INTO payroll_audit_logs (
            id, payroll_run_id, action, old_status, new_status, performed_by, notes, created_at
          ) VALUES (?, ?, 'TRANSITION_STATUS', ?, ?, ?, ?, ?);
        `,
        args: [
          newPayrollId("audit"),
          runId,
          currentStatus,
          target,
          actor.username,
          body.notes || "",
          now,
        ],
      });
      if (target === "PAID") {
        await catatPembayaranPayrollTx(tx, runId, akunBayar, actor.username);
      }
      await tx.commit();
    } catch (error) {
      await tx.rollback();
      throw error;
    } finally {
      tx.close();
    }

    const updatedResult = await client.execute({
      sql: "SELECT * FROM payroll_runs WHERE id = ? LIMIT 1;",
      args: [runId],
    });

    return noStoreJson({ data: updatedResult.rows[0] });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
