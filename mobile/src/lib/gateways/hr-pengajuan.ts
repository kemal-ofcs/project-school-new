"use client";

import { requestWebApi } from "@/lib/client/api-client";
import { isDesktopRuntime } from "@/lib/runtime/app-runtime";
import { invokeDesktop, kickDesktopSync } from "@/lib/runtime/desktop-commands";
import type {
  AturanCuti,
  AturanCutiDraft,
  DaftarPengajuan,
  HasilSimpanPengajuan,
  JenisDraft,
  PengajuanDraft,
  PenyesuaianDraft,
  SaldoCuti,
} from "@/lib/validations/hr-pengajuan";

export type {
  AturanCuti,
  AturanCutiDraft,
  BarisJenis,
  BarisKeputusan,
  BarisPenyesuaian,
  DaftarPengajuan,
  HasilSimpanPengajuan,
  JenisDraft,
  PegawaiPengajuan,
  PengajuanDraft,
  PengajuanTersusun,
  PenyesuaianDraft,
  PeriodeCuti,
  SaldoCuti,
} from "@/lib/validations/hr-pengajuan";

// Command `desktop_hr_request*` terdaftar di biner Desktop DAN Mobile
// (`hr_pengajuan.rs` disalin sync-rust-modules.ts); layarnya hanya Web/Desktop
// (Q-50).

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

export async function muatPengajuan(
  dari: string,
  sampai: string,
): Promise<DaftarPengajuan> {
  if (isDesktopRuntime()) {
    return invokeDesktop("desktop_hr_requests", { dari, sampai });
  }
  return requestWebApi("/api/pengajuan/query", "POST", { dari, sampai });
}

export function simpanPengajuan(draft: PengajuanDraft) {
  return mutasi<HasilSimpanPengajuan>(
    "desktop_hr_request_save",
    { draft },
    "/api/pengajuan/save",
    draft,
  );
}

export function putuskanPengajuan(
  idPengajuan: string,
  aksi: string,
  alasan: string,
) {
  return mutasi(
    "desktop_hr_request_decide",
    { idPengajuan, aksi, alasan },
    "/api/pengajuan/decide",
    { id_pengajuan: idPengajuan, aksi, alasan },
  );
}

export function simpanJenisPengajuan(draft: JenisDraft) {
  return mutasi(
    "desktop_hr_request_types_save",
    { draft },
    "/api/pengajuan/types",
    draft,
  );
}

/** Aturan cuti; dengan pegawai juga jatah, penyesuaian, dan riwayatnya. */
export async function muatSaldoCuti(
  idKaryawan: string | null,
  mulai: string | null = null,
  selesai: string | null = null,
): Promise<SaldoCuti> {
  if (isDesktopRuntime()) {
    return invokeDesktop("desktop_hr_leave_balance", {
      idKaryawan,
      mulai,
      selesai,
    });
  }
  return requestWebApi("/api/pengajuan/leave/query", "POST", {
    id_karyawan: idKaryawan,
    mulai,
    selesai,
  });
}

export function simpanAturanCuti(draft: AturanCutiDraft) {
  return mutasi<{ guru: AturanCuti; tendik: AturanCuti }>(
    "desktop_hr_leave_settings_save",
    { draft },
    "/api/pengajuan/leave/settings",
    draft,
  );
}

export function sesuaikanJatahCuti(draft: PenyesuaianDraft) {
  return mutasi(
    "desktop_hr_leave_adjust",
    { draft },
    "/api/pengajuan/leave/adjust",
    draft,
  );
}
