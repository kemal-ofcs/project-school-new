import type { PermissionKey } from "@/lib/rbac/catalog";

export interface OperatorUser {
  id: number;
  kode_operator: string;
  nama_operator: string;
  username: string;
  role: string;
  roleId: number;
  roleKey: string;
  isSuperadmin: boolean;
  permissions: PermissionKey[];
  permissionRevision: number;
  /**
   * Role ini mewajibkan foto bukti pada setiap scan absensi.
   *
   * Opsional supaya sesi lama yang sudah tersimpan tetap terbaca; nilai yang
   * hilang diperlakukan sebagai "tidak wajib", persis seperti kolom database
   * yang default-nya 0.
   */
  requireScanPhoto?: boolean;
  /** Role ini hanya boleh melakukan scan dari alamat IP yang terdaftar. */
  requireScanIpAllowlist?: boolean;
  /**
   * Personil yang ditautkan ke akun ini (A-2, HRIS Fase 2 §20.2.10). Kosong =
   * tak tertaut. Opsional supaya sesi/vault lama tetap terbaca (Q-53).
   */
  idKaryawan?: string | null;
  loginAt?: string;
}
