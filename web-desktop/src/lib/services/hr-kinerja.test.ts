import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Client, createClient } from "@libsql/client";
import type { OperatorUser } from "@/lib/auth/operator-user";
import { runDatabaseMigrations } from "@/lib/db-migrations";
import { initDatabaseSchema } from "@/lib/db-schema";
import type { PermissionKey } from "@/lib/rbac/catalog";
import {
  PREDIKAT_BAWAAN,
  type TemplateDraft,
  TIPE_KEHADIRAN,
  TIPE_MANUAL,
} from "@/lib/validations/hr-kinerja";

mock.module("server-only", () => ({}));

const S = await import("./hr-kinerja");

// Jalur Web template kinerja (HRIS Fase 5a) pada skema Web sungguhan.
// Pasangan Rust: `hr_kinerja_template_cloud` di `hr_kinerja.rs`, dengan data
// yang sama. Satu klien per berkas.
let client: Client;
let testDirectory: string;

const pengatur: OperatorUser = {
  id: 1,
  kode_operator: "UJI",
  nama_operator: "uji",
  username: "uji",
  role: "Uji",
  roleId: 9,
  roleKey: "uji",
  isSuperadmin: false,
  permissions: ["hr.performance.config"] as PermissionKey[],
  permissionRevision: 1,
  idKaryawan: null,
};

const galat = async (janji: Promise<unknown>) => {
  try {
    await janji;
    return null;
  } catch (error) {
    return (error as Error).message;
  }
};

const hitung = async (sql: string) =>
  Number((await client.execute(sql)).rows[0]?.[0] ?? -1);

beforeAll(async () => {
  testDirectory = mkdtempSync(join(tmpdir(), "kos-kinerja-"));
  client = createClient({ url: `file:${join(testDirectory, "test.db")}` });
  await initDatabaseSchema(client);
  // Migrasi diulang: seed tetap sekali.
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

describe("hr-kinerja: template di database Web", () => {
  test("seed dua template bawaan, 14 aspek, dan tgs-ka-tu sekali", async () => {
    expect(
      await hitung(
        "SELECT COUNT(*) FROM hr_kinerja_template WHERE is_bawaan = 1;",
      ),
    ).toBe(2);
    expect(await hitung("SELECT COUNT(*) FROM hr_kinerja_aspek;")).toBe(14);
    expect(
      await hitung(
        "SELECT COUNT(*) FROM hr_tugas_jenis WHERE id_jenis = 'tgs-ka-tu';",
      ),
    ).toBe(1);
    expect(
      await hitung("SELECT COUNT(*) FROM schema_migration WHERE version = 71;"),
    ).toBe(1);
    const data = await S.daftarTemplate(client);
    const guru = data.template.find((t) => t.id_template === "ktp-guru");
    expect(guru?.aspek).toHaveLength(8);
    expect(guru?.aspek.reduce((n, a) => n + a.bobot, 0)).toBe(100);
    expect(data.pengaturan.ambang).toEqual([950, 900, 800, 700]);
    expect(
      data.pengaturan.predikat.map((p) => `${p.ambang}:${p.nama}`).join("|"),
    ).toBe(PREDIKAT_BAWAAN);
  });

  test("satu bawaan per kelompok, kelompok dan tipe terkunci, aspek tidak dihapus", async () => {
    const aspek = (nama: string, tipe: string, bobot: number) => ({
      nama,
      tipe,
      bobot,
      is_aktif: true,
    });
    const { id_template: id } = await S.simpanTemplate(client, pengatur, {
      nama: "Satpam",
      kelompok: "Tendik",
      is_bawaan: true,
      is_aktif: true,
      aspek: [
        aspek("Kehadiran", TIPE_KEHADIRAN, 40),
        aspek("Kewaspadaan", TIPE_MANUAL, 60),
      ],
    });
    expect(id.startsWith("ktp-")).toBe(true);
    expect(
      await hitung(
        "SELECT is_bawaan FROM hr_kinerja_template WHERE id_template = 'ktp-tendik';",
      ),
    ).toBe(0);
    expect(
      await hitung(
        "SELECT is_bawaan FROM hr_kinerja_template WHERE id_template = 'ktp-guru';",
      ),
    ).toBe(1);
    // Migrasi ulang tidak mengembalikan bawaan seed.
    await runDatabaseMigrations(client);
    expect(
      await hitung(
        "SELECT is_bawaan FROM hr_kinerja_template WHERE id_template = 'ktp-tendik';",
      ),
    ).toBe(0);

    const tersimpan = (
      await client.execute({
        sql: "SELECT id_aspek FROM hr_kinerja_aspek WHERE id_template = ? ORDER BY urutan;",
        args: [id],
      })
    ).rows.map((r) => String(r.id_aspek));
    const ubah = (
      nama: string,
      kelompok: string,
      tipePertama: string,
      denganKedua: boolean,
    ): TemplateDraft => ({
      id_template: id,
      nama,
      kelompok,
      is_bawaan: true,
      is_aktif: true,
      aspek: [
        {
          id_aspek: tersimpan[0],
          nama: "Kehadiran",
          tipe: tipePertama,
          bobot: 40,
          is_aktif: true,
        },
        denganKedua
          ? {
              id_aspek: tersimpan[1],
              nama: "Kewaspadaan",
              tipe: TIPE_MANUAL,
              bobot: 60,
              is_aktif: true,
            }
          : aspek("Ronda", TIPE_MANUAL, 60),
      ],
    });
    expect(
      await galat(
        S.simpanTemplate(
          client,
          pengatur,
          ubah("Satpam", "Guru", TIPE_KEHADIRAN, true),
        ),
      ),
    ).toBe("Kelompok template tidak bisa diubah.");
    expect(
      await galat(
        S.simpanTemplate(
          client,
          pengatur,
          ubah("Satpam", "Tendik", TIPE_MANUAL, true),
        ),
      ),
    ).toBe('Tipe aspek "Kehadiran" tidak bisa diubah.');
    expect(
      await galat(
        S.simpanTemplate(
          client,
          pengatur,
          ubah("Satpam", "Tendik", TIPE_KEHADIRAN, false),
        ),
      ),
    ).toBe("Aspek tidak bisa dihapus; nonaktifkan saja.");
    expect(
      await galat(
        S.simpanTemplate(
          client,
          pengatur,
          ubah("penilaian kinerja guru", "Tendik", TIPE_KEHADIRAN, true),
        ),
      ),
    ).toBe('Nama "penilaian kinerja guru" sudah dipakai template lain.');
    await S.simpanTemplate(
      client,
      pengatur,
      ubah("Satpam Malam", "Tendik", TIPE_KEHADIRAN, true),
    );
    expect(
      await hitung(
        "SELECT COUNT(*) FROM hr_kinerja_aspek WHERE id_template = (SELECT id_template FROM hr_kinerja_template WHERE nama = 'Satpam Malam');",
      ),
    ).toBe(2);
    expect(
      await galat(
        S.simpanTemplate(client, pengatur, {
          id_template: "ktp-tidak-ada",
          nama: "X",
          kelompok: "Guru",
          is_bawaan: false,
          is_aktif: true,
          aspek: [aspek("A", TIPE_MANUAL, 100)],
        }),
      ),
    ).toBe("Template kinerja tidak ditemukan.");
  });

  test("pengaturan tiga kunci sekaligus; salah satu rusak = tidak ada yang tertulis", async () => {
    expect(
      await galat(
        S.simpanPengaturanKinerja(client, {
          ambang: "900,800,700,600",
          predikat: "0:A",
          tanpa_kbm: "",
        }),
      ),
    ).toBe(
      "Predikat harus 2 sampai 7 pasangan nilai:nama dengan nilai turun dari 10000 dan yang terakhir 0.",
    );
    expect(
      await hitung(
        "SELECT COUNT(*) FROM setting_gex_system WHERE key LIKE 'hr_kinerja_%';",
      ),
    ).toBe(0);
    const hasil = await S.simpanPengaturanKinerja(client, {
      ambang: "900,800,700,600",
      predikat: "9000:A|0:B",
      tanpa_kbm: "2026-12-01..2026-12-12:PAS",
    });
    expect(hasil).toEqual({
      ambang: [900, 800, 700, 600],
      predikat: [
        { ambang: 9000, nama: "A" },
        { ambang: 0, nama: "B" },
      ],
      tanpa_kbm: [{ mulai: "2026-12-01", selesai: "2026-12-12", nama: "PAS" }],
    });
  });
});
