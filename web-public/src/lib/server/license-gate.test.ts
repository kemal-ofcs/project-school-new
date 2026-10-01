import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import crypto from "node:crypto";
import { type Client, createClient } from "@libsql/client";

mock.module("server-only", () => ({}));

const { instanceCodeFromId, invalidateLicenseCache } = await import(
  "@/lib/server/license"
);
const { vonisLisensiPublik } = await import("@/lib/server/license-gate");

/**
 * Kunci uji yang sama dengan alat penerbit dan `license.rs` (seed 0x01).
 * Aturan isi lisensinya sendiri diuji di web-desktop (`license.test.ts`) dengan
 * vektor bersama; yang diuji di sini hanya apa yang situs publik LAKUKAN dengan
 * hasilnya.
 */
const KUNCI_UJI = crypto.createPrivateKey({
  key: Buffer.concat([
    Buffer.from("302e020100300506032b657004220420", "hex"),
    Buffer.alloc(32, 1),
  ]),
  format: "der",
  type: "pkcs8",
});
const PUBLIC_UJI =
  "8a88e3dd7409f195fd52db2d3cba5d72ca6709bf1d94121bf3748801b40f6f5c";
const ID_INSTANCE = "id-instance-uji";
const KODE_INSTANCE = instanceCodeFromId(ID_INSTANCE);

function lisensi(ubah: Record<string, unknown> = {}) {
  const isi = {
    v: 1,
    produk: "kos-absensi",
    id: "LIS-UJI",
    pemegang: "SMK Uji",
    jenis: "beli_putus",
    terbit: "2020-01-01",
    pembaruan_sampai: "2099-01-01",
    berlaku_sampai: null,
    perangkat: [],
    kunci_mobile: false,
    instance_web: KODE_INSTANCE,
    ...ubah,
  };
  const masukan = `LIS1.${Buffer.from(JSON.stringify(isi), "utf8").toString("base64url")}`;
  const tandaTangan = crypto
    .sign(null, Buffer.from(masukan, "utf8"), KUNCI_UJI)
    .toString("base64url");
  return `${masukan}.${tandaTangan}`;
}

let client: Client;
const permintaan = (host = "192.168.1.10") =>
  new Request("http://x/", { headers: { host } });
const vonis = (request = permintaan()) =>
  vonisLisensiPublik(request, { client, publicKeyHex: PUBLIC_UJI });

async function setel(key: string, value: string) {
  await client.execute({
    sql: "INSERT INTO setting_gex_system (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value;",
    args: [key, value],
  });
  invalidateLicenseCache();
}

beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  // Workspace ini tidak pernah membuat tabel di database sungguhan. Tabel di
  // bawah hanya ada di memori tes, dengan bentuk kolom yang dibaca pemeriksa.
  await client.execute(
    "CREATE TABLE setting_gex_system (key TEXT PRIMARY KEY, value TEXT);",
  );
});

beforeEach(async () => {
  await client.execute("DELETE FROM setting_gex_system;");
  invalidateLicenseCache();
  process.env.KOS_LICENSE_ENFORCED = "1";
});

afterAll(() => {
  delete process.env.KOS_LICENSE_ENFORCED;
  client.close();
});

describe("vonis lisensi situs publik", () => {
  test("build yang tidak menegakkan lisensi selalu terbuka", async () => {
    delete process.env.KOS_LICENSE_ENFORCED;
    expect(await vonis()).toBe("terbuka");
  });

  test("tanpa lisensi: terblokir, dan situs tidak menulis apa pun", async () => {
    expect(await vonis()).toBe("terblokir");
    const baris = await client.execute(
      "SELECT COUNT(*) AS total FROM setting_gex_system;",
    );
    // Id instance TIDAK dilahirkan di sini; itu pekerjaan aplikasi admin.
    expect(Number(baris.rows[0]?.total)).toBe(0);
  });

  test("lisensi sah tetapi id instance belum ada: terblokir", async () => {
    await setel("app_license", lisensi());
    expect(await vonis()).toBe("terblokir");
  });

  test("lisensi aktif untuk database ini: terbuka", async () => {
    await setel("web_instance_id", ID_INSTANCE);
    await setel("app_license", lisensi());
    expect(await vonis()).toBe("terbuka");
  });

  test("sewa habis: baca-saja", async () => {
    await setel("web_instance_id", ID_INSTANCE);
    await setel(
      "app_license",
      lisensi({ jenis: "sewa", berlaku_sampai: "2020-02-01" }),
    );
    expect(await vonis()).toBe("baca-saja");
  });

  test("lisensi untuk database lain: terblokir", async () => {
    await setel("web_instance_id", "id-database-lain");
    await setel("app_license", lisensi());
    expect(await vonis()).toBe("terblokir");
  });

  test("lisensi yang dikunci ke alamat: alamat situs publik wajib tercantum", async () => {
    await setel("web_instance_id", ID_INSTANCE);
    await setel(
      "app_license",
      lisensi({ website: ["absensi.smk-uji.sch.id", "www.smk-uji.sch.id"] }),
    );
    expect(await vonis(permintaan("www.smk-uji.sch.id"))).toBe("terbuka");
    expect(await vonis(permintaan("situs-lain.example.com"))).toBe("terblokir");
  });

  test("database yang tidak terbaca tidak dijadikan alasan memblokir", async () => {
    const rusak = createClient({ url: "file::memory:" });
    try {
      // Tabelnya tidak ada: pembacaan lisensi gagal. Halaman situs sudah punya
      // pesannya sendiri untuk database yang bermasalah.
      expect(
        await vonisLisensiPublik(permintaan(), {
          client: rusak,
          publicKeyHex: PUBLIC_UJI,
        }),
      ).toBe("terbuka");
    } finally {
      rusak.close();
    }
  });
});
