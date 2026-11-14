"use client";

import { requestWebApi } from "@/lib/client/api-client";
import { isDesktopRuntime } from "@/lib/runtime/app-runtime";
import { invokeDesktop, kickDesktopSync } from "@/lib/runtime/desktop-commands";
import type {
  DaftarKontrak,
  DaftarTugas,
  JenisTugasDraft,
  KontrakDraft,
  MasterDraft,
  OrgKepegawaian,
  PengaturanKontrak,
  PengaturanKontrakDraft,
  TugasDraft,
} from "@/lib/validations/hris";

export type {
  BagianOrg,
  DaftarKontrak,
  DaftarTugas,
  JabatanOrg,
  JenisTugas,
  JenisTugasDraft,
  KontrakBaris,
  KontrakDraft,
  MasterDraft,
  OrgKepegawaian,
  PegawaiKepegawaian,
  PengaturanKontrak,
  RingkasKontrak,
  TugasBaris,
  TugasDraft,
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

// Fase 1b: kontrak, tugas tambahan, pengaturan, status pajak

async function mutasi<T>(
  command: string,
  args: Record<string, unknown>,
  url: string,
  body: unknown,
): Promise<T> {
  if (isDesktopRuntime()) {
    const hasil = await invokeDesktop<T>(command, args);
    kickDesktopSync();
    return hasil;
  }
  return requestWebApi<T>(url, "POST", body);
}

export async function muatKontrak(): Promise<DaftarKontrak> {
  if (isDesktopRuntime()) return invokeDesktop("desktop_hr_contracts");
  return requestWebApi("/api/kepegawaian/contracts/query", "POST", {});
}

export function simpanKontrak(draft: KontrakDraft) {
  return mutasi(
    "desktop_hr_contract_create",
    { draft },
    "/api/kepegawaian/contracts",
    draft,
  );
}

export function batalKontrak(idKontrak: string, alasan: string) {
  return mutasi(
    "desktop_hr_contract_cancel",
    { idKontrak, alasan },
    "/api/kepegawaian/contracts/cancel",
    { id: idKontrak, alasan },
  );
}

export function simpanPengaturanKontrak(
  draft: PengaturanKontrakDraft,
): Promise<PengaturanKontrak> {
  return mutasi(
    "desktop_hr_settings_save",
    { draft },
    "/api/kepegawaian/settings",
    draft,
  );
}

export function simpanJenisTugas(draft: JenisTugasDraft) {
  return mutasi(
    "desktop_hr_duty_types_save",
    { draft },
    "/api/kepegawaian/duty-type",
    draft,
  );
}

export async function muatTugas(): Promise<DaftarTugas> {
  if (isDesktopRuntime()) return invokeDesktop("desktop_hr_duties");
  return requestWebApi("/api/kepegawaian/duties/query", "POST", {});
}

export function simpanTugas(draft: TugasDraft) {
  return mutasi(
    "desktop_hr_duty_save",
    { draft },
    "/api/kepegawaian/duties",
    draft,
  );
}

export function batalTugas(idTugas: string, alasan: string) {
  return mutasi(
    "desktop_hr_duty_cancel",
    { idTugas, alasan },
    "/api/kepegawaian/duties/cancel",
    { id: idTugas, alasan },
  );
}

export interface StatusTidakTetap {
  /** `false` = kunci belum pernah disimpan, daftar = bawaan. */
  tersimpan: boolean;
  daftar: string[];
  pilihan: string[];
}

export async function muatStatusTidakTetap(): Promise<StatusTidakTetap> {
  if (isDesktopRuntime())
    return invokeDesktop("desktop_get_pajak_status_tidak_tetap");
  return requestWebApi("/api/payroll/config/pajak-status/query", "POST", {});
}

export function simpanStatusTidakTetap(
  daftar: string[],
): Promise<StatusTidakTetap> {
  return mutasi(
    "desktop_save_pajak_status_tidak_tetap",
    { daftar },
    "/api/payroll/config/pajak-status",
    { daftar },
  );
}
