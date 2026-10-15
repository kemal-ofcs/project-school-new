"use client";

import { requestWebApi } from "@/lib/client/api-client";
import { isDesktopRuntime } from "@/lib/runtime/app-runtime";
import { invokeDesktop, kickDesktopSync } from "@/lib/runtime/desktop-commands";
import type {
  CalonRapel,
  PilihanRapel,
  RapelItem,
} from "@/types/payroll-rapel";

export type {
  CalonRapel,
  PilihanRapel,
  RapelItem,
} from "@/types/payroll-rapel";

// Command `desktop_payroll_rapel_*` terdaftar di biner Desktop DAN Mobile
// (`rapel.rs` dan `commands.rs` disalin sync-rust-modules.ts), jadi satu
// cabang `isDesktopRuntime()` mencakup keduanya.

export async function daftarRapel(): Promise<{ items: RapelItem[] }> {
  if (isDesktopRuntime()) return invokeDesktop("desktop_payroll_rapel_list");
  return requestWebApi("/api/payroll/rapel/query", "POST", {});
}

export async function hitungCalonRapel(
  dari: string,
  sampai: string,
): Promise<{ items: CalonRapel[] }> {
  if (isDesktopRuntime()) {
    return invokeDesktop("desktop_payroll_rapel_detect", { dari, sampai });
  }
  return requestWebApi("/api/payroll/rapel/detect", "POST", { dari, sampai });
}

export async function simpanRapel(
  items: PilihanRapel[],
): Promise<{ sukses: boolean; disimpan: number }> {
  if (isDesktopRuntime()) {
    const hasil = await invokeDesktop<{ sukses: boolean; disimpan: number }>(
      "desktop_payroll_rapel_save",
      { items },
    );
    kickDesktopSync();
    return hasil;
  }
  return requestWebApi("/api/payroll/rapel/save", "POST", { items });
}

export async function batalkanRapel(
  idRapel: string,
  alasan: string,
): Promise<{ sukses: boolean }> {
  if (isDesktopRuntime()) {
    const hasil = await invokeDesktop<{ sukses: boolean }>(
      "desktop_payroll_rapel_cancel",
      { idRapel, alasan },
    );
    kickDesktopSync();
    return hasil;
  }
  return requestWebApi("/api/payroll/rapel/cancel", "POST", {
    idRapel,
    alasan,
  });
}
