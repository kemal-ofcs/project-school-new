"use client";

import { requestWebApi } from "@/lib/client/api-client";
import { isDesktopRuntime } from "@/lib/runtime/app-runtime";
import { invokeDesktop, kickDesktopSync } from "@/lib/runtime/desktop-commands";
import type { AkunDraft, JurnalDraft } from "@/lib/validations/accounting";
import type {
  AkunItem,
  BukuBesar,
  JurnalDetail,
  JurnalItem,
  NeracaSaldo,
} from "@/types/accounting";

export type {
  AkunItem,
  BukuBesar,
  JurnalDetail,
  JurnalItem,
  NeracaSaldo,
} from "@/types/accounting";

// Command `desktop_accounting_*` terdaftar di biner Desktop DAN Mobile
// (`accounting.rs` disalin oleh sync-rust-modules.ts), jadi satu cabang
// `isDesktopRuntime()` mencakup keduanya. Keduanya membaca SQLite lokal, jadi
// pembukuan tetap bisa dibuka dan dicatat tanpa jaringan.

type Hasil = { sukses: boolean; id_jurnal: string; nomor: string };

export async function daftarAkun(): Promise<{ items: AkunItem[] }> {
  if (isDesktopRuntime()) {
    return invokeDesktop("desktop_accounting_accounts");
  }
  return requestWebApi("/api/accounting/accounts/query", "POST", {});
}

export async function simpanAkun(
  draft: AkunDraft,
): Promise<{ sukses: boolean; id_akun: string }> {
  if (isDesktopRuntime()) {
    const result = await invokeDesktop<{ sukses: boolean; id_akun: string }>(
      "desktop_accounting_save_account",
      { draft },
    );
    kickDesktopSync();
    return result;
  }
  return requestWebApi("/api/accounting/accounts/save", "POST", draft);
}

export async function daftarJurnal(
  dari: string,
  sampai: string,
  sumber: string | null,
): Promise<{ items: JurnalItem[] }> {
  if (isDesktopRuntime()) {
    return invokeDesktop("desktop_accounting_journals", {
      dari,
      sampai,
      sumber,
    });
  }
  return requestWebApi("/api/accounting/journals/query", "POST", {
    dari,
    sampai,
    sumber,
  });
}

export async function getJurnal(idJurnal: string): Promise<JurnalDetail> {
  if (isDesktopRuntime()) {
    return invokeDesktop("desktop_accounting_journal", { idJurnal });
  }
  return requestWebApi("/api/accounting/journals/get", "POST", { idJurnal });
}

export async function catatJurnal(draft: JurnalDraft): Promise<Hasil> {
  if (isDesktopRuntime()) {
    const result = await invokeDesktop<Hasil>(
      "desktop_accounting_post_journal",
      { draft },
    );
    kickDesktopSync();
    return result;
  }
  return requestWebApi("/api/accounting/journals/post", "POST", draft);
}

export async function batalkanJurnal(
  idJurnal: string,
  alasan: string,
): Promise<Hasil> {
  if (isDesktopRuntime()) {
    const result = await invokeDesktop<Hasil>(
      "desktop_accounting_reverse_journal",
      { idJurnal, alasan },
    );
    kickDesktopSync();
    return result;
  }
  return requestWebApi("/api/accounting/journals/reverse", "POST", {
    idJurnal,
    alasan,
  });
}

export async function getBukuBesar(
  idAkun: string,
  dari: string,
  sampai: string,
): Promise<BukuBesar> {
  if (isDesktopRuntime()) {
    return invokeDesktop("desktop_accounting_ledger", { idAkun, dari, sampai });
  }
  return requestWebApi("/api/accounting/ledger", "POST", {
    idAkun,
    dari,
    sampai,
  });
}

export async function getNeracaSaldo(sampai: string): Promise<NeracaSaldo> {
  if (isDesktopRuntime()) {
    return invokeDesktop("desktop_accounting_trial_balance", { sampai });
  }
  return requestWebApi("/api/accounting/trial-balance", "POST", { sampai });
}
