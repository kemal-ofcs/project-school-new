import type { NextRequest } from "next/server";
import { z } from "zod";
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
  APPLIES_TO_ALL,
  APPLIES_TO_GROUP_PREFIXES,
  isStudentPersonnel,
  normalizeAppliesTo,
  PAYROLL_CALC_TYPES,
} from "@/lib/validations/payroll-policy";

export const runtime = "nodejs";

/**
 * Draft komponen; cermin `PayrollComponent` di `payroll/models.rs`.
 * `created_at` boleh terbawa dari baris yang sedang disunting, tetapi
 * diabaikan. Potongan tidak pernah menjadi dasar BPJS (v67, Q-3 (a)).
 */
const componentDraftSchema = z
  .object({
    id: z.string().max(128).optional(),
    name: z.string().trim().min(1).max(255),
    category: z.enum(["ALLOWANCE", "DEDUCTION"]),
    calc_type: z.enum(PAYROLL_CALC_TYPES),
    default_value: z.number().min(0).default(0),
    applies_to: z.string().max(255).default(""),
    is_active: z.union([z.literal(0), z.literal(1)]).default(1),
    dasar_bpjs: z.union([z.literal(0), z.literal(1)]).default(0),
    created_at: z.string().nullable().optional(),
  })
  .strict();

export async function POST(request: NextRequest) {
  try {
    await requireWebPermission(request, "payroll.view");
    await ensureServerDatabaseInitialized();
    const client = getServerDatabase();

    const result = await client.execute(
      "SELECT * FROM payroll_components ORDER BY category, name ASC;",
    );
    return noStoreJson({ data: result.rows });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requireWebPermission(request, "payroll.config.manage");
    assertSameOriginMutation(request);
    await ensureServerDatabaseInitialized();
    const client = getServerDatabase();

    const body = await readJsonBody<{ draft?: unknown }>(request);
    const parsed = componentDraftSchema.safeParse(body.draft);
    if (!parsed.success) {
      throw new ApiRequestError(
        "Data komponen tidak valid: nama, kategori, dan jenis perhitungan wajib diisi dengan nilai yang dikenal.",
        400,
      );
    }
    const draft = parsed.data;
    const compId = draft.id?.trim() ? draft.id.trim() : `comp-${Date.now()}`;

    // Penerima komponen: "ALL" atau satu personil yang benar-benar ada dan
    // bukan siswa. Cerminan validasi di `desktop_save_payroll_component`.
    // Tanpa ini, id yang salah ketik tersimpan sebagai komponen yang tidak
    // pernah berlaku untuk siapa pun (tanpa pesan), dan hanya terlihat sebagai
    // tunjangan yang "hilang" di slip orangnya.
    const appliesTo = normalizeAppliesTo(draft.applies_to);
    // Bentuk kelompok tidak diverifikasi ke master data: divisi atau status
    // yang hari ini belum dipakai siapa pun boleh didaftarkan lebih dulu, dan
    // komponennya diam sampai ada orangnya. Yang diverifikasi hanya bentuk
    // PERORANGAN. Cerminan validasi di `desktop_save_payroll_component`.
    const bentukKelompok = APPLIES_TO_GROUP_PREFIXES.some(
      (prefix) =>
        appliesTo.startsWith(`${prefix}:`) &&
        appliesTo.slice(prefix.length + 1).trim() !== "",
    );
    // Kecuali `TUGAS:`: sasarannya id jenis (Q-29), dan id yang salah ketik
    // sama butanya dengan id personil yang salah ketik.
    if (appliesTo.toUpperCase().startsWith("TUGAS:")) {
      const jenis = await client.execute({
        sql: "SELECT 1 FROM hr_tugas_jenis WHERE id_jenis = ?1;",
        args: [appliesTo.slice("TUGAS:".length).trim()],
      });
      if (jenis.rows.length === 0) {
        throw new ApiRequestError(
          "Jenis tugas tambahan untuk komponen ini tidak ditemukan.",
          400,
        );
      }
    }
    if (appliesTo !== APPLIES_TO_ALL && !bentukKelompok) {
      const personil = await client.execute({
        sql: "SELECT COALESCE(jenis_personil, '') AS jenis_personil FROM master_data WHERE id_unik = ? LIMIT 1;",
        args: [appliesTo],
      });
      const row = personil.rows[0];
      if (!row) {
        throw new ApiRequestError(
          "Penerima komponen tidak ditemukan pada data personil.",
          400,
        );
      }
      if (isStudentPersonnel(row.jenis_personil)) {
        throw new ApiRequestError(
          "Siswa tidak menerima komponen payroll.",
          400,
        );
      }
    }

    await client.execute({
      sql: `
        INSERT INTO payroll_components (
          id, name, category, calc_type, default_value, applies_to, is_active, dasar_bpjs
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          category = excluded.category,
          calc_type = excluded.calc_type,
          default_value = excluded.default_value,
          applies_to = excluded.applies_to,
          is_active = excluded.is_active,
          dasar_bpjs = excluded.dasar_bpjs;
      `,
      args: [
        compId,
        draft.name,
        draft.category,
        draft.calc_type,
        draft.default_value,
        appliesTo,
        draft.is_active,
        draft.category === "ALLOWANCE" ? draft.dasar_bpjs : 0,
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

    const body = await readJsonBody<{ id?: string }>(request);
    if (!body.id) {
      throw new ApiRequestError("id wajib diisi.", 400);
    }

    await client.execute({
      sql: "DELETE FROM payroll_components WHERE id = ?;",
      args: [body.id],
    });

    return noStoreJson({ sukses: true });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
