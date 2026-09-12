import { describe, expect, test } from "bun:test";
import { resolveSiteUrl } from "./site-url";

describe("resolveSiteUrl", () => {
  test("variabel eksplisit menang", () => {
    expect(
      resolveSiteUrl({
        NEXT_PUBLIC_SITE_URL: "https://smknusantara.sch.id",
        VERCEL_PROJECT_PRODUCTION_URL: "proyek.vercel.app",
      }),
    ).toBe("https://smknusantara.sch.id");
  });

  test("garis miring penutup dibuang", () => {
    // `https://x//profil` sah secara teknis tetapi diperlakukan mesin pencari
    // sebagai alamat yang berbeda dari `https://x/profil`.
    expect(
      resolveSiteUrl({
        NEXT_PUBLIC_SITE_URL: "https://smknusantara.sch.id///",
      }),
    ).toBe("https://smknusantara.sch.id");
  });

  test("alamat tanpa skema dianggap https", () => {
    expect(
      resolveSiteUrl({
        NEXT_PUBLIC_SITE_URL: "smknusantara.sch.id",
      }),
    ).toBe("https://smknusantara.sch.id");
  });

  test("cadangan memakai domain produksi Vercel, bukan preview", () => {
    expect(
      resolveSiteUrl({
        VERCEL_PROJECT_PRODUCTION_URL: "sekolah.vercel.app",
        VERCEL_URL: "sekolah-git-cabang-acak.vercel.app",
      }),
    ).toBe("https://sekolah.vercel.app");
  });

  test("tanpa variabel apa pun jatuh ke localhost", () => {
    expect(resolveSiteUrl({})).toBe("http://localhost:3000");
  });
});
