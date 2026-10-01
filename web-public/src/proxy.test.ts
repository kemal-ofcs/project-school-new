import { beforeEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

mock.module("server-only", () => ({}));

let vonis: "terbuka" | "baca-saja" | "terblokir" = "terbuka";
mock.module("@/lib/server/license-gate", () => ({
  HEADER_LISENSI: "x-kos-lisensi",
  vonisLisensiPublik: async () => vonis,
}));

const { proxy } = await import("@/proxy");

function buka(path: string, headers: Record<string, string> = {}) {
  return proxy(
    new NextRequest(`https://www.sekolah.sch.id${path}`, {
      method: path.startsWith("/api/") ? "POST" : "GET",
      headers,
    }),
  );
}

/** Header yang diteruskan `proxy` ke halaman, atau `null` bila tidak ada. */
const headerLisensi = (response: Response) =>
  response.headers.get("x-middleware-request-x-kos-lisensi");

beforeEach(() => {
  vonis = "terbuka";
});

describe("proxy situs publik", () => {
  test("terbuka: diteruskan apa adanya, header internal tidak ada", async () => {
    const response = await buka("/");
    expect(response.status).toBe(200);
    expect(headerLisensi(response)).toBeNull();
  });

  test("header internal kiriman pengunjung dibuang", async () => {
    const response = await buka("/pmb/daftar", {
      "x-kos-lisensi": "baca-saja",
    });
    expect(headerLisensi(response)).toBeNull();
    // Next mencatat nama header yang ia timpa atau hapus; yang dikirim
    // pengunjung harus tercatat di sana, bukan dibiarkan lewat.
    expect(response.headers.get("x-middleware-override-headers")).not.toContain(
      "x-kos-lisensi",
    );
  });

  test("terblokir: halaman 503 tanpa alasan dan tanpa konten sekolah", async () => {
    vonis = "terblokir";
    const response = await buka("/profil");
    expect(response.status).toBe(503);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
    expect(response.headers.get("retry-after")).toBe("3600");
    const html = await response.text();
    expect(html).toContain("Situs ini sedang tidak tersedia");
    // Publik tidak diberi tahu alasannya.
    expect(html.toLowerCase()).not.toMatch(/lisensi|bayar|sewa|tagihan/);
  });

  test("terblokir: endpoint menjawab 503 JSON, bukan halaman HTML", async () => {
    vonis = "terblokir";
    const response = await buka("/api/wali/masuk");
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "SITUS_TIDAK_TERSEDIA",
      message: "Situs ini sedang tidak tersedia.",
    });
  });

  test("baca-saja: halaman tetap tampil dan diberi tahu lewat header", async () => {
    vonis = "baca-saja";
    const response = await buka("/pmb/daftar");
    expect(response.status).toBe(200);
    expect(headerLisensi(response)).toBe("baca-saja");
  });

  test("baca-saja: pendaftaran PMB baru ditolak tanpa menyebut alasan", async () => {
    vonis = "baca-saja";
    const response = await buka("/api/pmb/daftar");
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error).toBe("PENDAFTARAN_DITUTUP");
    expect(body.message).toBe(
      "Pendaftaran online sedang ditutup sementara. Silakan hubungi sekolah untuk mendaftar.",
    );
    expect(body.message.toLowerCase()).not.toMatch(/lisensi|bayar|sewa/);
  });

  test("baca-saja: cek status PMB dan portal wali tetap dilayani", async () => {
    vonis = "baca-saja";
    for (const path of [
      "/api/pmb/status",
      "/api/wali/masuk",
      "/api/wali/ganti-password",
    ]) {
      expect((await buka(path)).status).toBe(200);
    }
  });
});
