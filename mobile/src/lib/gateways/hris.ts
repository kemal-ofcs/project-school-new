"use client";

import { requestWebApi } from "@/lib/client/api-client";
import { isDesktopRuntime } from "@/lib/runtime/app-runtime";
import { invokeDesktop, kickDesktopSync } from "@/lib/runtime/desktop-commands";
import type { MasterDraft, OrgKepegawaian } from "@/lib/validations/hris";

export type {
  BagianOrg,
  JabatanOrg,
  MasterDraft,
  OrgKepegawaian,
  PegawaiKepegawaian,
} from "@/lib/validations/hris";

// Command `desktop_hr_*` terdaftar di biner Desktop DAN Mobile (`hris.rs` dan
// `commands.rs` disalin sync-rust-modules.ts), jadi satu cabang
// `isDesktopRuntime()` mencakup keduanya.

export async function muatOrgKepegawaian(): Promise<OrgKepegawaian> {
  if (isDesktopRuntime()) return invokeDesktop("desktop_hr_org");
  return requestWebApi("/api/kepegawaian/org/query", "POST", {});
}

export async function simpanBagian(draft: MasterDraft) {
  if (isDesktopRuntime()) {
    const hasil = await invokeDesktop<{ id_bagian: string }>(
      "desktop_hr_section_save",
      { draft },
    );
    kickDesktopSync();
    return hasil;
  }
  return requestWebApi<{ id_bagian: string }>(
    "/api/kepegawaian/section",
    "POST",
    draft,
  );
}

export async function gabungBagian(idAsal: string, idTujuan: string) {
  if (isDesktopRuntime()) {
    const hasil = await invokeDesktop("desktop_hr_section_merge", {
      idAsal,
      idTujuan,
    });
    kickDesktopSync();
    return hasil;
  }
  return requestWebApi("/api/kepegawaian/section/merge", "POST", {
    id_asal: idAsal,
    id_tujuan: idTujuan,
  });
}

export async function simpanJabatan(draft: MasterDraft) {
  if (isDesktopRuntime()) {
    const hasil = await invokeDesktop<{ id_jabatan: string }>(
      "desktop_hr_position_save",
      { draft },
    );
    kickDesktopSync();
    return hasil;
  }
  return requestWebApi<{ id_jabatan: string }>(
    "/api/kepegawaian/position",
    "POST",
    draft,
  );
}
