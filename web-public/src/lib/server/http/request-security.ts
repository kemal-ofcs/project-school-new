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
 *
 * Yang dibaca adalah entri PALING KANAN `X-Forwarded-For`, dikurangi jumlah
 * proxy tepercaya (`SPPG_TRUSTED_PROXY_HOPS`, bawaan 1). Entri paling kiri
 * adalah isian klien: di belakang nginx/Caddy yang MENAMBAHKAN alamat, klien
 * bebas menulisnya sendiri. Di Vercel header ini ditimpa platform (satu
 * alamat), jadi hasilnya sama. Cerminan fungsi yang sama di `web-desktop`.
 */
export function getClientAddress(request: Request) {
  const hops = Math.max(1, Number(process.env.SPPG_TRUSTED_PROXY_HOPS) || 1);
  const rantai = (request.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((alamat) => alamat.trim())
    .filter(Boolean);
  return (
    rantai[rantai.length - hops] ??
    (request.headers.get("x-real-ip")?.trim() || "unknown")
  );
}
