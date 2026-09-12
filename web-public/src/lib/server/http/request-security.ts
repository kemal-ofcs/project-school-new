import "server-only";

import { isSameOriginRequest } from "@/lib/auth/request-origin";

/**
 * Pembatas asal permintaan untuk endpoint situs publik.
 *
 * Penilaiannya dibagi dengan panel admin — `isSameOriginRequest` adalah berkas
 * hasil sinkronisasi dari web-desktop, jadi satu sisi tidak bisa diam-diam
 * lebih longgar daripada yang lain. Yang ditulis lokal hanyalah pembungkus yang
 * melempar, karena versi web-desktop melempar `AuthorizationError` yang menarik
 * seluruh pohon RBAC (`hasPermission`, `PermissionKey`, `OperatorUser`) ke
 * dalam situs yang tidak punya satu pun operator.
 *
 * Di sini alasannya berbeda dari di panel admin, dan lebih mendesak: endpoint
 * ini melayani internet terbuka tanpa sesi sama sekali. Pendaftaran PMB bisa
 * dipicu dari halaman mana pun milik siapa pun, dan pemeriksaan asal permintaan
 * adalah satu-satunya pembatas yang ada sebelum rate limit.
 *
 * Penjaganya MENOLAK permintaan tanpa header `Origin`. Peramban selalu
 * mengirimkannya pada setiap POST, dan tidak ada klien Rust yang memanggil
 * endpoint situs publik — berbeda dengan `POST /api/auth/login` di panel admin,
 * yang dipanggil `remote.rs` dan karenanya menyetel `Origin` sendiri.
 */
export class OriginTidakDiizinkanError extends Error {
  readonly status = 403;

  constructor() {
    super("Origin tidak diizinkan.");
    this.name = "OriginTidakDiizinkanError";
  }
}

export function isSameOriginMutation(request: Request) {
  return isSameOriginRequest(request);
}

export function assertSameOriginMutation(request: Request) {
  if (!isSameOriginMutation(request)) {
    throw new OriginTidakDiizinkanError();
  }
}

/**
 * Alamat pemanggil, dibaca dari header proxy — tidak pernah dari body.
 *
 * Sama seperti aturan pembatasan IP pada scanner: alamat yang dikirim sendiri
 * oleh klien bukan bukti apa pun. Nilainya dipakai sebagai kunci rate limit,
 * jadi klien yang bisa memilih alamatnya sendiri berarti rate limit yang bisa
 * dilewati dengan mengubah satu field.
 */
export function getClientAddress(request: Request) {
  const forwarded = request.headers
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
}
