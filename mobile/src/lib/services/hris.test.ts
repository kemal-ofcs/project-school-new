import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Client, createClient } from "@libsql/client";
import { runDatabaseMigrations } from "@/lib/db-migrations";
import { initDatabaseSchema } from "@/lib/db-schema";

mock.module("server-only", () => ({}));

const H = await import("./hris");
const { assertPersonilAkun } = await import("@/lib/operators/operator-admin");

// Jalur Web organisasi (HRIS Fase 1a) pada skema Web sungguhan. Pasangan
// Rust: `sentinel_2043_memicu_organisasi_v68` di `turso.rs`. Satu klien per
// berkas (pola `payroll-pajak.test.ts`).
let client: Client;
let testDirectory: string;
const tu = `bag-${Buffer.from("tata usaha").toString("hex")}`;

const satu = async (sql: string, args: (string | number)[] = []) =>
  (await client.execute({ sql, args })).rows[0] ?? {};

beforeAll(async () => {
  testDirectory = mkdtempSync(join(tmpdir(), "kos-hris-"));
  client = createClient({ url: `file:${join(testDirectory, "test.db")}` });
  await initDatabaseSchema(client);
  await client.batch(
    [
      "INSERT INTO master_data (id_unik, kode_karyawan, nama, divisi, jabatan_status, id_shift, jenis_personil) VALUES ('p1', 'K1', 'Ani', 'Tata Usaha', 'Staf TU', 1, 'Pegawai'), ('p2', 'K2', 'Budi', 'tata usaha', '-', 1, 'Pegawai'), ('s1', 'S1', 'Cici', 'Peserta Didik', 'Siswa', 1, 'SISWA');",
      "INSERT INTO payroll_components (id, name, category, calc_type, default_value, applies_to) VALUES ('c1', 'Tunjangan TU', 'ALLOWANCE', 'FIXED', 100000, 'DIVISI:Tata Usaha');",
      "INSERT INTO hari_libur_whitelist (id, scope_type, scope_value) VALUES ('w1', 'DIVISI', 'Tata Usaha');",
      "DELETE FROM schema_migration WHERE version = 68;",
    ],
    "write",
  );
  await runDatabaseMigrations(client);
}, 60_000);

afterAll(async () => {
  client.close();
  await Bun.sleep(50);
  try {
    rmSync(testDirectory, { recursive: true, force: true, maxRetries: 10 });
  } catch {
    // Berkas sementara Windows kadang masih terkunci; dibersihkan OS nanti.
  }
});

describe("hris: organisasi di Web", () => {
  test("migrasi v68: id deterministik sama dengan Rust, siswa dikecualikan, sekali", async () => {
    const bagian = await client.execute(
      "SELECT id_bagian, nama FROM hr_bagian ORDER BY id_bagian;",
    );
    expect(bagian.rows.map((r) => [r.id_bagian, r.nama])).toEqual([
      [tu, "Tata Usaha"],
    ]);
    expect(
      (await satu("SELECT id_bagian FROM master_data WHERE id_unik = 'p2';"))
        .id_bagian,
    ).toBe(tu);
    expect(
      (await satu("SELECT id_bagian FROM master_data WHERE id_unik = 's1';"))
        .id_bagian,
    ).toBeNull();
    expect(
      Number((await satu("SELECT COUNT(*) AS n FROM hr_jabatan;")).n),
    ).toBe(1);

    await client.execute("DELETE FROM hr_bagian;");
    await runDatabaseMigrations(client);
    expect(Number((await satu("SELECT COUNT(*) AS n FROM hr_bagian;")).n)).toBe(
      0,
    );
    await client.execute({
      sql: "INSERT INTO hr_bagian (id_bagian, nama) VALUES (?1, 'Tata Usaha');",
      args: [tu],
    });
  });

  test("ganti nama menulis ulang anggota, DIVISI:, dan whitelist; nama lama tercadang", async () => {
    await H.simpanBagian(client, { id: tu, nama: "  Tata  Usaha Sekolah " });
    const teks = async (sql: string) =>
      String(Object.values(await satu(sql))[0]);
    expect(
      await teks("SELECT divisi FROM master_data WHERE id_unik = 'p2';"),
    ).toBe("Tata Usaha Sekolah");
    expect(
      await teks("SELECT applies_to FROM payroll_components WHERE id = 'c1';"),
    ).toBe("DIVISI:Tata Usaha Sekolah");
    expect(
      await teks(
        "SELECT scope_value FROM hari_libur_whitelist WHERE id = 'w1';",
      ),
    ).toBe("Tata Usaha Sekolah");
    expect(
      await teks("SELECT divisi FROM master_data WHERE id_unik = 's1';"),
    ).toBe("Peserta Didik");
    await expect(
      H.simpanBagian(client, { nama: "tata usaha" }),
    ).rejects.toThrow("sudah dipakai bagian lain");
  });

  test("Jadikan bagian menautkan pegawai berteks sama", async () => {
    await client.execute(
      "UPDATE master_data SET divisi = 'Satpam', id_bagian = NULL WHERE id_unik = 'p1';",
    );
    const { id_bagian } = await H.simpanBagian(client, { nama: "Satpam" });
    expect(
      (await satu("SELECT id_bagian FROM master_data WHERE id_unik = 'p1';"))
        .id_bagian,
    ).toBe(id_bagian);
  });

  test("atasan tanpa siklus; satu personil satu akun aktif", async () => {
    await client.execute(
      "UPDATE master_data SET id_atasan = 'p2' WHERE id_unik = 'p1';",
    );
    await expect(
      H.periksaOrganisasi(client, "p2", { id_atasan: "p1" }, false),
    ).rejects.toThrow("berputar");
    await expect(
      H.periksaOrganisasi(client, "p2", { id_atasan: "s1" }, false),
    ).rejects.toThrow("pegawai yang terdaftar");

    await client.execute(
      "INSERT INTO master_operator (kode_operator, nama_operator, username, password_hash, role, role_id, status, id_karyawan) VALUES ('OP1', 'Ani', 'ani', 'x', 'Operator', 3, 'Aktif', 'p1');",
    );
    await expect(assertPersonilAkun(client, "p1", "Aktif")).rejects.toThrow(
      "akun aktif lain",
    );
    await expect(assertPersonilAkun(client, "p1", "Nonaktif")).resolves.toBe(
      undefined,
    );
    await expect(assertPersonilAkun(client, "s1", "Aktif")).rejects.toThrow(
      "pegawai yang terdaftar",
    );
  });
});

// HRIS 1c: data cloud-only. Pasangan Rust: `hris_cloud_profil_dokumen_di_database`.
describe("hris 1c: profil dan dokumen di Web", () => {
  test("profil per kelompok izin; siswa ditolak; hapus dokumen membuang berkasnya", async () => {
    await H.simpanPribadi(client, "uji", {
      id_karyawan: "p1",
      nik: "3201.0101-0101 0001",
      no_kk: "",
      tempat_lahir: "",
      tanggal_lahir: "",
      agama: "Islam",
      status_nikah: "",
      nama_ibu_kandung: "",
      alamat_ktp: "",
      alamat_domisili: "",
      darurat_nama: "",
      darurat_hubungan: "",
      darurat_hp: "0812 3456 7890",
    });
    await expect(
      H.simpanKeuangan(client, "uji", {
        id_karyawan: "s1",
        bank: "",
        no_rekening: "123-456-789",
        nama_rekening: "",
        npwp: "",
        bpjs_kesehatan: "",
        bpjs_ketenagakerjaan: "",
      }),
    ).rejects.toThrow("Pegawai ini belum ada di database pusat");
    await H.simpanPendidikan(client, "uji", {
      id_karyawan: "p1",
      jenjang: "S1",
      prodi: "PGSD",
      perguruan_tinggi: "",
      tahun_lulus: 2015,
      linier: 1,
      catatan: "",
    });

    const pribadi = await H.getProfil(client, "p1", {
      pribadi: true,
      keuangan: false,
      pendidik: false,
    });
    expect(pribadi.pribadi?.nik).toBe("3201010101010001");
    expect(pribadi.pribadi?.darurat_hp).toBe("+6281234567890");
    expect("keuangan" in pribadi || "pendidik" in pribadi).toBe(false);
    const lain = await H.getProfil(client, "p1", {
      pribadi: false,
      keuangan: true,
      pendidik: true,
    });
    expect("pribadi" in lain).toBe(false);
    expect(lain.keuangan?.diubah_pada).toBe("");
    expect(lain.pendidik?.pendidikan[0]?.jenjang).toBe("S1");

    const { id_dokumen } = await H.simpanDokumen(client, "uji", {
      id_karyawan: "p1",
      id_jenis: "dok-ktp",
      nomor: "",
      tanggal_terbit: "2020-01-02",
      tanggal_kedaluwarsa: "",
      catatan: "",
    });
    const png =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
    const berkas = {
      id_dokumen,
      nama_berkas: "ktp.png",
      mime_type: "image/png",
      data_base64: png,
    };
    for (let i = 0; i < 5; i++) await H.tambahBerkasDokumen(client, berkas);
    await expect(H.tambahBerkasDokumen(client, berkas)).rejects.toThrow(
      "sudah berisi 5 berkas",
    );
    const daftar = await H.getDokumen(client, "p1");
    expect(daftar.berkas?.map((b) => b.urutan)).toEqual([1, 2, 3, 4, 5]);
    expect(daftar.berkas?.[0]?.ukuran_byte).toBe(70);
    expect(daftar.berkas?.[0]).not.toHaveProperty("data_base64");

    await H.hapusDokumen(client, id_dokumen);
    expect((await satu("SELECT COUNT(*) AS n FROM hr_dokumen_berkas;")).n).toBe(
      0,
    );
    expect((await H.getDokumen(client, "")).jenis.length).toBeGreaterThan(12);
  });
});
