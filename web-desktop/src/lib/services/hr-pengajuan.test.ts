import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Client, createClient } from "@libsql/client";
import type { OperatorUser } from "@/lib/auth/operator-user";
import { runDatabaseMigrations } from "@/lib/db-migrations";
import { initDatabaseSchema } from "@/lib/db-schema";
import type { PermissionKey } from "@/lib/rbac/catalog";

mock.module("server-only", () => ({}));

const S = await import("./hr-pengajuan");

// Jalur Web pengajuan (HRIS Fase 2a) pada skema Web sungguhan. Pasangan
// Rust: `sentinel_2045_hr_pengajuan_cloud_tidak_pernah_menolak` di
// `turso.rs`. Satu klien per berkas (pola `hris.test.ts`).
let client: Client;
let testDirectory: string;

const operator = (
  username: string,
  idKaryawan: string | null,
  permissions: string[],
): OperatorUser => ({
  id: 1,
  kode_operator: username.toUpperCase(),
  nama_operator: username,
  username,
  role: "Uji",
  roleId: 9,
  roleKey: "uji",
  isSuperadmin: false,
  permissions: permissions as PermissionKey[],
  permissionRevision: 1,
  idKaryawan,
});

const tu = operator("tu", null, ["hr.request.view", "hr.request.submit"]);
const kepsekSmp = operator("kepsek", "k1", [
  "hr.request.view",
  "hr.request.submit",
  "hr.request.urgent",
  "hr.request.decide",
]);
const kepsekSd = operator("kepsek-sd", "k2", ["hr.request.decide"]);

const galat = async (janji: Promise<unknown>) => {
  try {
    await janji;
    return null;
  } catch (error) {
    return (error as Error).message;
  }
};

beforeAll(async () => {
  testDirectory = mkdtempSync(join(tmpdir(), "kos-pengajuan-"));
  client = createClient({ url: `file:${join(testDirectory, "test.db")}` });
  await initDatabaseSchema(client);
  await client.batch(
    [
      "INSERT INTO master_data (id_unik, kode_karyawan, nama, divisi, jabatan_status, id_shift, jenis_personil, unit) VALUES ('g1', 'G1', 'Guru Satu', 'Guru', 'Guru', 999, 'GURU', 'SMP'), ('t1', 'T1', 'Tendik Satu', 'TU', 'Staf', 999, 'Pegawai', 'SMP'), ('k1', 'K1', 'Kepsek SMP', 'Pimpinan', 'Kepsek', 999, 'GURU', 'SMP'), ('k2', 'K2', 'Kepsek SD', 'Pimpinan', 'Kepsek', 999, 'GURU', 'SD'), ('s1', 'S1', 'Siswa', 'Kelas', 'Siswa', 999, 'SISWA', 'SMP');",
      "INSERT INTO guru_data (id_guru, created_at, updated_at) VALUES ('g1', 'x', 'x'), ('k1', 'x', 'x'), ('k2', 'x', 'x');",
    ],
    "write",
  );
  // Migrasi diulang: jenis bawaan tetap sepuluh.
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

describe("hr-pengajuan: Web", () => {
  test("v69: jenis bawaan sekali, versi tercatat", async () => {
    const n = await client.execute(
      "SELECT COUNT(*) AS n FROM hr_jenis_pengajuan;",
    );
    expect(Number(n.rows[0]?.n)).toBe(10);
    const v = await client.execute(
      "SELECT COUNT(*) AS n FROM schema_migration WHERE version = 69;",
    );
    expect(Number(v.rows[0]?.n)).toBe(1);
  });

  test("ajukan, putus dengan cakupan unit, dan status diturunkan", async () => {
    const dasar = {
      id_karyawan: "g1",
      id_jenis: "jns-sakit",
      tanggal_mulai: "2026-11-16",
      tanggal_selesai: "2026-11-16",
      jam_mulai_ke: 3,
      alasan: "Demam",
    };
    expect(
      await galat(
        S.simpanPengajuan(client, tu, { ...dasar, id_karyawan: "s1" }),
      ),
    ).toBe("Pengajuan hanya untuk pegawai (guru dan tendik).");
    expect(
      await galat(
        S.simpanPengajuan(client, tu, {
          ...dasar,
          id_karyawan: "t1",
        }),
      ),
    ).toBe("Jam ke-N hanya untuk guru.");
    const { pengajuan } = await S.simpanPengajuan(client, tu, dasar);
    const id = String(pengajuan.id_pengajuan);
    expect(
      await galat(S.simpanPengajuan(client, tu, { ...dasar, jam_mulai_ke: 1 })),
    ).toBe(
      "Tanggal itu bertumpuk dengan pengajuan lain pegawai ini (2026-11-16 s.d. 2026-11-16).",
    );
    // Jam pagi dan jam siang di tanggal yang sama tidak bertumpuk.
    await S.simpanPengajuan(client, tu, {
      ...dasar,
      id_jenis: "jns-dinas-luar",
      jam_mulai_ke: null,
      jam_sampai_ke: 2,
    });

    expect(
      await galat(S.putuskanPengajuan(client, kepsekSd, id, "Setujui", "")),
    ).toBe("Pegawai ini di luar unit yang kamu pegang.");
    expect(
      await galat(S.putuskanPengajuan(client, tu, id, "Setujui", "")),
    ).toBe("Kamu tidak punya izin memutus jenis pengajuan ini.");
    await S.putuskanPengajuan(client, kepsekSmp, id, "Setujui", "");
    const daftar = await S.daftarPengajuan(
      client,
      kepsekSmp,
      "2026-11-01",
      "2026-11-30",
    );
    const baris = daftar.pengajuan.find((p) => p.id_pengajuan === id);
    expect(baris?.status).toBe("Disetujui");
    expect(baris?.keputusan[0]?.diterima_cloud).not.toBeNull();
    expect(daftar.sesi).toEqual({
      id_karyawan: "k1",
      unit: "SMP",
      lingkup_semua: false,
    });
    expect(
      await galat(
        S.simpanPengajuan(client, tu, { ...dasar, id_pengajuan: id }),
      ),
    ).toBe("Pengajuan yang sudah diputus tidak bisa disunting.");
  });

  test("urgent dan pengajuan untuk diri sendiri", async () => {
    const diri = {
      id_karyawan: "k1",
      id_jenis: "jns-izin-dibayar",
      tanggal_mulai: "2026-11-20",
      tanggal_selesai: "2026-11-20",
      alasan: "Urusan keluarga",
    };
    expect(
      await galat(
        S.simpanPengajuan(client, kepsekSmp, { ...diri, urgent: true }),
      ),
    ).toBe(
      "Pengajuan urgent untuk dirimu sendiri tidak bisa disetujui sendiri.",
    );
    const { pengajuan } = await S.simpanPengajuan(client, kepsekSmp, diri);
    expect(
      await galat(
        S.putuskanPengajuan(
          client,
          kepsekSmp,
          String(pengajuan.id_pengajuan),
          "Setujui",
          "",
        ),
      ),
    ).toBe("Pengajuan untuk dirimu sendiri harus diputus orang lain.");

    const urgent = await S.simpanPengajuan(client, kepsekSmp, {
      ...diri,
      id_karyawan: "t1",
      tanggal_mulai: "2026-11-23",
      tanggal_selesai: "2026-11-23",
      urgent: true,
    });
    const idUrgent = String(urgent.pengajuan.id_pengajuan);
    const lihat = async () =>
      (
        await S.daftarPengajuan(client, kepsekSmp, "2026-11-01", "2026-11-30")
      ).pengajuan.find((p) => p.id_pengajuan === idUrgent);
    expect((await lihat())?.status).toBe("Disetujui (urgent)");
    expect((await lihat())?.tanda).toEqual(["perlu_diketahui"]);
    await S.putuskanPengajuan(client, kepsekSmp, idUrgent, "Diketahui", "");
    expect((await lihat())?.tanda).toEqual([]);
    expect(
      await galat(
        S.putuskanPengajuan(client, kepsekSmp, idUrgent, "Batal", " "),
      ),
    ).toBe("Alasan pembatalan wajib diisi.");
    await S.putuskanPengajuan(client, kepsekSmp, idUrgent, "Batal", "Masuk");
    expect((await lihat())?.status).toBe("Dibatalkan");
  });

  test("batas hari jenis dan periode gaji dibayar", async () => {
    expect(
      await galat(
        S.simpanPengajuan(client, tu, {
          id_karyawan: "t1",
          id_jenis: "jns-cuti-menikah",
          tanggal_mulai: "2026-12-01",
          tanggal_selesai: "2026-12-04",
          alasan: "Menikah",
        }),
      ),
    ).toBe("Cuti Menikah paling lama 3 hari kerja.");
    await client.execute(
      "INSERT INTO payroll_runs (id, idempotency_key, period_start, period_end, status, created_by) VALUES ('run-1', 'k-1', '2026-10-01', '2026-10-31', 'PAID', 'uji');",
    );
    expect(
      await galat(
        S.simpanPengajuan(client, tu, {
          id_karyawan: "t1",
          id_jenis: "jns-sakit",
          tanggal_mulai: "2026-10-30",
          tanggal_selesai: "2026-11-02",
          alasan: "Sakit",
        }),
      ),
    ).toBe(
      "Gaji periode 2026-10-01 s.d. 2026-10-31 sudah dibayar; pengajuan di tanggal itu tidak bisa diubah.",
    );
  });

  test("jenis: simpan, nama bentrok, kelompok asing ditolak", async () => {
    const jenis = {
      nama: "Izin Lomba",
      kelompok: "Dinas Luar" as const,
      izin_pemutus: "hr.request.decide" as const,
      boleh_urgent: true,
      potong_jatah: false,
      dampak_gaji: "Dibayar" as const,
      maks_hari: null,
      satuan_maks: "Hari Kerja" as const,
      wajib_dokumen: false,
      is_aktif: true,
    };
    const baru = await S.simpanJenisPengajuan(client, jenis);
    expect(baru.id_jenis.startsWith("jns-")).toBe(true);
    expect(
      await galat(S.simpanJenisPengajuan(client, { ...jenis, nama: "sakit" })),
    ).toBe('Nama "sakit" sudah dipakai jenis pengajuan lain.');
    expect(
      await galat(
        S.simpanJenisPengajuan(client, {
          ...jenis,
          kelompok: "Izin",
          potong_jatah: true,
        }),
      ),
    ).toBe("Hanya kelompok Cuti yang bisa memotong jatah cuti.");
  });
});
