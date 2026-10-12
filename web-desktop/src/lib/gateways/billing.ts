"use client";

import { requestWebApi } from "@/lib/client/api-client";
import { isDesktopRuntime } from "@/lib/runtime/app-runtime";
import { invokeDesktop, kickDesktopSync } from "@/lib/runtime/desktop-commands";
import type {
  JenisTagihanDraft,
  KeringananDraft,
  TarifDraft,
} from "@/lib/validations/billing";
import type {
  KeringananItem,
  MasterTagihan,
  PratinjauTagihan,
  SiswaTagihan,
  TagihanItem,
} from "@/types/billing";

export type {
  JenisTagihanItem,
  KeringananItem,
  MasterTagihan,
  PratinjauTagihan,
  SiswaTagihan,
  TagihanItem,
  TarifItem,
} from "@/types/billing";

// Command `desktop_billing_*` terdaftar di biner Desktop DAN Mobile
// (`billing.rs` disalin oleh sync-rust-modules.ts), jadi satu cabang
// `isDesktopRuntime()` mencakup keduanya. Keduanya membaca dan menulis SQLite
// lokal + outbox, sehingga tagihan bisa diterbitkan tanpa jaringan.

async function baca<T>(
  command: string,
  args: Record<string, unknown>,
  url: string,
): Promise<T> {
  if (isDesktopRuntime()) return invokeDesktop<T>(command, args);
  return requestWebApi<T>(url, "POST", args);
}

async function tulis<T>(
  command: string,
  args: Record<string, unknown>,
  url: string,
  body: unknown,
): Promise<T> {
  if (isDesktopRuntime()) {
    const result = await invokeDesktop<T>(command, args);
    kickDesktopSync();
    return result;
  }
  return requestWebApi<T>(url, "POST", body);
}

export function getMasterTagihan(): Promise<MasterTagihan> {
  return baca("desktop_billing_master", {}, "/api/billing/master");
}

export function simpanJenisTagihan(
  draft: JenisTagihanDraft,
): Promise<{ sukses: boolean; id_jenis_tagihan: string }> {
  return tulis(
    "desktop_billing_save_type",
    { draft },
    "/api/billing/save-type",
    draft,
  );
}

export function simpanTarif(
  draft: TarifDraft,
): Promise<{ sukses: boolean; id_tarif: string }> {
  return tulis(
    "desktop_billing_save_rate",
    { draft },
    "/api/billing/save-rate",
    draft,
  );
}

export function hapusTarif(idTarif: string): Promise<{ sukses: boolean }> {
  return tulis(
    "desktop_billing_delete_rate",
    { idTarif },
    "/api/billing/delete-rate",
    { idTarif },
  );
}

export function daftarKeringanan(): Promise<{ items: KeringananItem[] }> {
  return baca("desktop_billing_discounts", {}, "/api/billing/discounts");
}

export function simpanKeringanan(
  draft: KeringananDraft,
): Promise<{ sukses: boolean; id_keringanan: string }> {
  return tulis(
    "desktop_billing_save_discount",
    { draft },
    "/api/billing/save-discount",
    draft,
  );
}

export function daftarSiswaTagihan(): Promise<{ items: SiswaTagihan[] }> {
  return baca("desktop_billing_students", {}, "/api/billing/students");
}

export function pratinjauTagihan(
  idJenisTagihan: string,
  periode: string,
  unit: string | null,
  idRombel: string | null,
): Promise<PratinjauTagihan> {
  return baca(
    "desktop_billing_preview",
    { idJenisTagihan, periode, unit, idRombel },
    "/api/billing/preview",
  );
}

export function terbitkanTagihan(
  idJenisTagihan: string,
  periode: string,
  jatuhTempo: string,
  unit: string | null,
  idRombel: string | null,
): Promise<{
  sukses: boolean;
  terbit: number;
  dilewati: number;
  periode: string;
}> {
  const args = { idJenisTagihan, periode, jatuhTempo, unit, idRombel };
  return tulis("desktop_billing_issue", args, "/api/billing/issue", args);
}

export function daftarTagihan(filter: {
  periode: string | null;
  idJenisTagihan: string | null;
  idRombel: string | null;
  status: string | null;
}): Promise<{ items: TagihanItem[]; total_sisa: number }> {
  return baca("desktop_billing_list", filter, "/api/billing/list");
}

export function batalkanTagihan(
  idTagihan: string,
  alasan: string,
): Promise<{ sukses: boolean }> {
  return tulis(
    "desktop_billing_cancel",
    { idTagihan, alasan },
    "/api/billing/cancel",
    { idTagihan, alasan },
  );
}
