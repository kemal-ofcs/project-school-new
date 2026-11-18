import type { NextRequest } from "next/server";
import { z } from "zod";
import {
  hashPassword,
  periksaPasswordBaru,
  verifyPassword,
} from "@/lib/auth/password";
import { revokeOperatorSessions } from "@/lib/operators/operator-admin";
import { requireWebSession } from "@/lib/server/auth/authorize";
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

export const runtime = "nodejs";

const bodySchema = z
  .object({
    currentPassword: z.string().max(256),
    newPassword: z.string().max(256),
  })
  .strict();

/**
 * Ganti password akun PEMANGGIL. Id operatornya diambil dari sesi, tidak
 * pernah dari badan permintaan. Semua sesi Web akun itu dicabut sesudahnya,
 * termasuk sesi ini, jadi pengguna login lagi dengan password baru.
 * Cerminan `desktop_change_own_password` di `commands.rs`.
 */
export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    const actor = await requireWebSession(request);
    await ensureServerDatabaseInitialized();
    const parsed = bodySchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      throw new ApiRequestError("Permintaan ganti password tidak valid.", 400);
    }
    const { currentPassword, newPassword } = parsed.data;
    const pesan = periksaPasswordBaru(currentPassword, newPassword);
    if (pesan) throw new ApiRequestError(pesan, 400);

    const database = getServerDatabase();
    const baris = await database.execute({
      sql: "SELECT password_hash FROM master_operator WHERE id = ? LIMIT 1;",
      args: [actor.id],
    });
    const cocok =
      currentPassword.length > 0 &&
      (
        await verifyPassword(
          currentPassword,
          String(baris.rows[0]?.password_hash ?? ""),
        )
      ).valid;
    if (!cocok) {
      throw new ApiRequestError("Password akun Anda tidak cocok.", 400);
    }

    await database.execute({
      sql: "UPDATE master_operator SET password_hash = ?, updated_at = datetime('now') WHERE id = ?;",
      args: [await hashPassword(newPassword), actor.id],
    });
    await revokeOperatorSessions(database, actor.id, "password-diganti");
    return noStoreJson({ sukses: true });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
