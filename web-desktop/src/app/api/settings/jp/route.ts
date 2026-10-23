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
import { readJpSettings } from "@/lib/services/class-attendance";
import {
  JP_DURATION_SETTING_KEY,
  JP_MAX_PER_DAY_SETTING_KEY,
  jpUnitKey,
  MAX_JAM_KE,
} from "@/lib/validations/class-attendance";

export const runtime = "nodejs";

/** `idUnit` kosong = pengaturan sekolah (berlaku untuk "Semua unit"). */
function unitDari(raw: unknown): string | null {
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    // Cukup sesi: layar presensi perlu tahu berapa jam pelajaran yang tersedia
    // sebelum gurunya menyimpan.
    await requireWebPermission(request, "home.view");
    await ensureServerDatabaseInitialized();

    const body = await readJsonBody<{ idUnit?: unknown }>(request);
    return noStoreJson(await readJpSettings(unitDari(body.idUnit)));
  } catch (error) {
    return toApiErrorResponse(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requireWebPermission(request, "settings.manage");
    assertSameOriginMutation(request);
    await ensureServerDatabaseInitialized();
    const client = getServerDatabase();

    const body = await readJsonBody<{
      maxPerHari?: unknown;
      durasiMenit?: unknown;
      idUnit?: unknown;
    }>(request);
    const maxPerHari = Number(body.maxPerHari);
    const durasiMenit = Number(body.durasiMenit);
    const idUnit = unitDari(body.idUnit);

    if (
      !Number.isInteger(maxPerHari) ||
      maxPerHari < 1 ||
      maxPerHari > MAX_JAM_KE
    ) {
      throw new ApiRequestError(
        `Jumlah jam pelajaran per hari harus di antara 1 dan ${MAX_JAM_KE}.`,
        400,
      );
    }
    if (
      !Number.isInteger(durasiMenit) ||
      durasiMenit < 1 ||
      durasiMenit > 240
    ) {
      throw new ApiRequestError(
        "Lama satu jam pelajaran harus di antara 1 dan 240 menit.",
        400,
      );
    }
    if (idUnit) {
      const unit = await client.execute({
        sql: "SELECT 1 FROM akademik_unit WHERE id_unit = ? LIMIT 1;",
        args: [idUnit],
      });
      if (unit.rows.length === 0) {
        throw new ApiRequestError(
          "Unit tidak ditemukan. Muat ulang daftar unit.",
          400,
        );
      }
    }
    // Dengan unit, nilainya masuk kunci unit itu; kunci sekolah tidak disentuh.
    const kunci = (base: string) => (idUnit ? jpUnitKey(base, idUnit) : base);

    await client.batch(
      [
        {
          sql: `INSERT INTO setting_gex_system (key, value) VALUES (?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
          args: [kunci(JP_MAX_PER_DAY_SETTING_KEY), String(maxPerHari)],
        },
        {
          sql: `INSERT INTO setting_gex_system (key, value) VALUES (?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
          args: [kunci(JP_DURATION_SETTING_KEY), String(durasiMenit)],
        },
      ],
      "write",
    );

    return noStoreJson({ sukses: true, maxPerHari, durasiMenit });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
