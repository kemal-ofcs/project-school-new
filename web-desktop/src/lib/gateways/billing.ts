"use client";

import { requestWebApi } from "@/lib/client/api-client";
import { isDesktopRuntime } from "@/lib/runtime/app-runtime";
import { invokeDesktop, kickDesktopSync } from "@/lib/runtime/desktop-commands";
import type {
  JenisTagihanDraft,
  KeringananDraft,
  PembayaranDraft,
  TarifDraft,
} from "@/lib/validations/billing";
import type {
  AkunSiswaTagihan,
  DaftarTagihan,
  DetailKuitansi,
  HasilBayar,
  HasilPengingat,
  HasilPengingatOtomatis,
  KeringananItem,
  KuitansiItem,
  MasterTagihan,
  PratinjauTagihan,
  RekapPenerimaan,
  RekapRombel,
  SeriKuitansi,
  SiswaTagihan,
  TinjauanPembayaran,
} from "@/types/billing";

export type {
  AkunSiswaTagihan,
  DaftarTagihan,
  DetailKuitansi,
  HasilBayar,
  HasilPengingat,
  HasilPengingatOtomatis,
  JenisTagihanItem,
  KeringananItem,
  KuitansiItem,
  MasterTagihan,
  PratinjauTagihan,
  RekapPenerimaan,
  RekapRombel,
  SeriKuitansi,
  SiswaTagihan,
  TagihanItem,
  TarifItem,
  TinjauanPembayaran,
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
  jatuhTempo: string | null;
}): Promise<DaftarTagihan> {
  return baca("desktop_billing_list", filter, "/api/billing/list");
}

/** Buka atau tutup halaman Tagihan di portal wali (K4c). */
export function simpanPortalTagihan(
  aktif: boolean,
): Promise<{ sukses: boolean; portal_wali_tagihan: boolean }> {
  return tulis(
    "desktop_billing_save_portal",
    { aktif },
    "/api/billing/save-portal",
    { aktif },
  );
}

/** Antre pengingat tunggakan WhatsApp untuk siswa pada saringan ini (K4b). */
export function kirimPengingatTagihan(filter: {
  periode: string | null;
  idJenisTagihan: string | null;
  idRombel: string | null;
  jatuhTempo: string | null;
}): Promise<HasilPengingat> {
  return tulis("desktop_billing_remind", filter, "/api/billing/remind", filter);
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

// ── Pembayaran (K3b) ────────────────────────────────────────────────────────

export function getAkunSiswa(idSiswa: string): Promise<AkunSiswaTagihan> {
  return baca("desktop_billing_account", { idSiswa }, "/api/billing/account");
}

export function catatPembayaran(draft: PembayaranDraft): Promise<HasilBayar> {
  return tulis("desktop_billing_pay", { draft }, "/api/billing/pay", draft);
}

export function daftarKuitansi(
  dari: string,
  sampai: string,
  seri: string | null,
): Promise<{ items: KuitansiItem[]; total_sah: number }> {
  return baca(
    "desktop_billing_payments",
    { dari, sampai, seri },
    "/api/billing/payments",
  );
}

export function getDetailKuitansi(
  idPembayaran: string,
): Promise<DetailKuitansi> {
  return baca(
    "desktop_billing_payment_detail",
    { idPembayaran },
    "/api/billing/payment-detail",
  );
}

export function batalkanKuitansi(
  idPembayaran: string,
  alasan: string,
): Promise<{ sukses: boolean }> {
  const args = { idPembayaran, alasan };
  return tulis(
    "desktop_billing_cancel_payment",
    args,
    "/api/billing/cancel-payment",
    args,
  );
}

export function pindahkanKeTitipan(
  idPembayaran: string,
  alasan: string,
): Promise<HasilBayar> {
  const args = { idPembayaran, alasan };
  return tulis(
    "desktop_billing_move_to_deposit",
    args,
    "/api/billing/move-to-deposit",
    args,
  );
}

export function getTinjauanPembayaran(): Promise<TinjauanPembayaran> {
  return baca("desktop_billing_review", {}, "/api/billing/review");
}

export function getSeriKuitansi(): Promise<SeriKuitansi> {
  return baca("desktop_billing_series", {}, "/api/billing/series");
}

export function simpanSeriKuitansi(
  deviceCode: string,
  seri: string,
  namaPerangkat: string,
): Promise<{ sukses: boolean; seri: string }> {
  const args = { deviceCode, seri, namaPerangkat };
  return tulis(
    "desktop_billing_save_series",
    args,
    "/api/billing/save-series",
    args,
  );
}

// ── Rekap (lanjutan K4) ─────────────────────────────────────────────────────

export function getRekapRombel(
  periode: string,
  idJenisTagihan: string | null,
): Promise<RekapRombel> {
  return baca(
    "desktop_billing_recap_rombel",
    { periode, idJenisTagihan },
    "/api/billing/recap-rombel",
  );
}

export function getRekapPenerimaan(mulai: string): Promise<RekapPenerimaan> {
  return baca(
    "desktop_billing_recap_receipts",
    { mulai },
    "/api/billing/recap-receipts",
  );
}

/** Pengingat tagihan otomatis; dipanggil komponen latar, sekali sehari. */
export function jalankanPengingatOtomatis(): Promise<HasilPengingatOtomatis> {
  return tulis(
    "desktop_billing_remind_auto",
    {},
    "/api/billing/remind-auto",
    {},
  );
}
