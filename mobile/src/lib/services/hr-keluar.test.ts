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
  BERLAKUKAN_SQL,
  type KeluarDraft,
  PESAN_BLOKIR_JADWAL,
  PESAN_BLOKIR_WALI,
  PESAN_BUTUH_SP3,
  PESAN_DI_LUAR_CAKUPAN,
  PESAN_DIRI_SENDIRI,
  PESAN_KELUAR_BERLAKU,
  PESAN_KELUAR_DIBATALKAN,
  PESAN_KELUAR_TERBUKA,
  PESAN_SP_DICABUT,
  type SpDraft,
  statusAktifKeluar,
  tanggalSelesaiKeluar,
} from "@/lib/validations/hr-keluar";

mock.module("server-only", () => ({}));

const S = await import("./hr-keluar");

// Jalur Web SP (HRIS Fase 4a) pada skema Web sungguhan. Pasangan Rust:
// `hr_keluar_sp_cloud` di `hr_keluar.rs`, dengan data yang sama. Satu klien
// per berkas.
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

const kepsek = operator("kepsek", "KS", [
  "hr.warning.view",
  "hr.warning.manage",
]);
const yayasan = operator("yayasan", null, [
  "hr.warning.cancel",
  "hr.scope.all",
]);

const draft = (id: string, tingkat: SpDraft["tingkat"]): SpDraft => ({
  id_karyawan: id,
  tingkat,
  tanggal: "2026-01-10",
  pelanggaran: "Terlambat berulang",
  penanda_nama: "Kepala SMP",
  penanda_jabatan: "Kepala SMP",
  alasan_tingkat: "Pelanggaran berat",
});

const galat = async (janji: Promise<unknown>) => {
  try {
    await janji;
    return null;
  } catch (error) {
    return (error as Error).message;
  }
};

beforeAll(async () => {
  testDirectory = mkdtempSync(join(tmpdir(), "kos-keluar-"));
  client = createClient({ url: `file:${join(testDirectory, "test.db")}` });
  await initDatabaseSchema(client);
  await client.execute(
    "INSERT INTO master_data (id_unik, kode_karyawan, nama, divisi, id_shift, jenis_personil, unit, tanggal_daftar, status_aktif) VALUES ('P1', 'K1', 'Ani', 'Guru', 999, 'GURU', 'SMP', '2020-01-01', 'Aktif'), ('P2', 'K2', 'Budi', 'Guru', 999, 'GURU', 'SMA', '2020-01-01', 'Aktif'), ('KS', 'K3', 'Kepala SMP', 'Guru', 999, 'GURU', 'SMP', '2020-01-01', 'Aktif');",
  );
  // Migrasi diulang: alasan bawaan tetap sembilan.
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

describe("hr-keluar: SP di database Web", () => {
  test("skema v70: alasan bawaan dan kolom id_keluar", async () => {
    const alasan = await client.execute(
      "SELECT COUNT(*) AS n FROM hr_keluar_alasan;",
    );
    expect(Number(alasan.rows[0]?.n)).toBe(9);
    const kolom = await client.execute("PRAGMA table_info(master_data);");
    expect(kolom.rows.map((r) => String(r.name))).toContain("id_keluar");
  });

  test("wewenang dari sesi, eskalasi, ubah, dan cabut sekali", async () => {
    expect(await galat(S.simpanSp(client, kepsek, draft("P2", "SP1")))).toBe(
      PESAN_DI_LUAR_CAKUPAN,
    );
    expect(await galat(S.simpanSp(client, kepsek, draft("KS", "SP1")))).toBe(
      PESAN_DIRI_SENDIRI,
    );
    expect(await galat(S.simpanSp(client, kepsek, draft("P1", "SP3")))).toBe(
      PESAN_BUTUH_SP3,
    );
    expect(
      await galat(
        S.simpanSp(client, kepsek, {
          ...draft("P1", "SP2"),
          alasan_tingkat: "",
        }),
      ),
    ).toBe("Tingkat berbeda dari usulan (SP1); alasannya wajib diisi.");

    const baru = await S.simpanSp(client, kepsek, draft("P1", "SP1"));
    const baris = (
      await client.execute({
        sql: "SELECT unit, masa_bulan, berlaku_sampai, alasan_tingkat FROM hr_sp WHERE id_sp = ?;",
        args: [baru.id_sp],
      })
    ).rows[0];
    expect([
      baris?.unit,
      Number(baris?.masa_bulan),
      baris?.berlaku_sampai,
      baris?.alasan_tingkat,
    ]).toEqual(["SMP", 6, "2026-07-09", null]);

    expect(
      await galat(
        S.simpanSp(client, kepsek, {
          ...draft("P1", "SP2"),
          id_sp: baru.id_sp,
        }),
      ),
    ).toStartWith("Tingkat dan tanggal SP");
    const ubah: SpDraft = {
      ...draft("P1", "SP1"),
      id_sp: baru.id_sp,
      nomor: "001/SP/SMP/I/2026",
    };
    expect((await S.simpanSp(client, kepsek, ubah)).nomor_kembar).toBe(false);

    const daftar = await S.daftarSp(client, "P1");
    expect(daftar.sp).toHaveLength(1);
    expect(daftar.sp[0]?.nomor).toBe("001/SP/SMP/I/2026");
    expect(daftar.masa_bulan).toBe(6);

    expect(await galat(S.cabutSp(client, yayasan, baru.id_sp, " "))).toBe(
      "Alasan pencabutan wajib diisi.",
    );
    await S.cabutSp(client, yayasan, baru.id_sp, "Salah orang");
    expect(await galat(S.cabutSp(client, yayasan, baru.id_sp, "Lagi"))).toBe(
      PESAN_SP_DICABUT,
    );
    expect(await galat(S.simpanSp(client, kepsek, ubah))).toBe(
      PESAN_SP_DICABUT,
    );
    const sesudah = await S.daftarSp(client, "P1");
    expect(sesudah.sp[0]?.status).toBe("Dicabut");
    expect(sesudah.usulan.tingkat).toBe("SP1");
  });
});

// Pasangan Rust: `hr_keluar_berlakukan_dan_batalkan_cloud` dengan data yang
// sama (G1 = P1 di sana, KS tetap).
describe("hr-keluar: pegawai keluar di database Web", () => {
  const kepeg = operator("kepeg", "KS", ["hr.offboard.manage"]);
  const yayasan = operator("yayasan", null, [
    "hr.offboard.decide",
    "hr.scope.all",
  ]);
  const draftKeluar = (id = "G1"): KeluarDraft => ({
    id_karyawan: id,
    id_alasan: "klr-resign",
    tanggal_terakhir: "2026-06-30",
  });
  const satuBaris = async (sql: string) =>
    (await client.execute(sql)).rows[0] ?? {};

  test("catat, blokir, Berlakukan, tekan ganda, Batalkan", async () => {
    await client.batch(
      [
        "INSERT INTO master_data (id_unik, kode_karyawan, nama, divisi, id_shift, jenis_personil, unit, tanggal_daftar, status_aktif) VALUES ('G1', 'KG1', 'Ani', 'Guru', 999, 'GURU', 'SMP', '2020-01-01', 'Aktif');",
        "INSERT INTO akademik_tahun_ajaran (id_tahun_ajaran, nama_tahun, semester, tanggal_mulai, tanggal_selesai, is_aktif, created_at, updated_at) VALUES ('T1', '2025/2026', 'Genap', '2026-01-01', '2026-06-30', 0, 'x', 'x'), ('T2', '2026/2027', 'Ganjil', '2026-07-01', '2026-12-31', 1, 'x', 'x');",
        "INSERT INTO akademik_rombel (id_rombel, id_tahun_ajaran, tingkat, nama_rombel, id_wali_kelas, is_aktif) VALUES ('R1', 'T1', 7, '7A lama', 'G1', 1), ('R2', 'T2', 8, '8A', 'G1', 1);",
        "INSERT INTO jadwal_mengajar (id_jadwal, id_tahun_ajaran, id_rombel, id_mapel, id_guru, hari, jam_ke, is_aktif, created_at, updated_at) VALUES ('J1', 'T1', 'R1', 'M1', 'G1', 1, '1', 1, 'x', 'x'), ('J2', 'T2', 'R2', 'M1', 'G1', 1, '2', 1, 'x', 'x');",
        "INSERT INTO master_operator (id, kode_operator, nama_operator, username, password_hash, role, status, id_karyawan) VALUES (10, 'OP10', 'Ani', 'ani', 'x', 'Operator', 'Aktif', 'G1');",
        "INSERT INTO app_session (session_id, token_hash, operator_id, permission_revision, created_at, expires_at, last_seen_at) VALUES ('s1', 'h1', 10, 1, 'x', '2999-01-01', 'x');",
      ],
      "write",
    );

    expect(await galat(S.simpanKeluar(client, kepeg, draftKeluar("KS")))).toBe(
      PESAN_DIRI_SENDIRI,
    );
    const { id_keluar: id } = await S.simpanKeluar(
      client,
      kepeg,
      draftKeluar(),
    );
    expect(await galat(S.simpanKeluar(client, kepeg, draftKeluar()))).toBe(
      PESAN_KELUAR_TERBUKA,
    );
    expect(
      (
        await satuBaris(
          "SELECT status_aktif FROM master_data WHERE id_unik = 'G1';",
        )
      ).status_aktif,
    ).toBe("Aktif");

    const rincian = await S.rincianKeluar(client, { id_keluar: id });
    expect(rincian.keluar?.status).toBe("Jatuh tempo");
    expect(rincian.checklist.blokir).toBe(2);
    expect(rincian.checklist.akun[0]?.username).toBe("ani");

    expect(await galat(S.berlakukanKeluar(client, yayasan, id))).toBe(
      PESAN_BLOKIR_JADWAL,
    );
    await client.execute(
      "UPDATE jadwal_mengajar SET is_aktif = 0 WHERE id_jadwal = 'J2';",
    );
    expect(await galat(S.berlakukanKeluar(client, yayasan, id))).toBe(
      PESAN_BLOKIR_WALI,
    );
    await client.execute(
      "UPDATE akademik_rombel SET id_wali_kelas = 'KS' WHERE id_rombel = 'R2';",
    );
    expect(
      await galat(S.berlakukanKeluar(client, { ...yayasan, id: 10 }, id)),
    ).toBe(PESAN_DIRI_SENDIRI);
    await S.berlakukanKeluar(client, yayasan, id);
    expect(await galat(S.berlakukanKeluar(client, yayasan, id))).toBe(
      PESAN_KELUAR_BERLAKU,
    );
    // Batch yang sama dijalankan ulang tidak mengubah apa pun.
    await client.batch(
      BERLAKUKAN_SQL.map((sql) => ({ sql, args: [id, "lain", "{}", "G1"] })),
      "write",
    );

    const pegawai = await satuBaris(
      "SELECT status_aktif, tanggal_selesai_aktif, id_keluar, (SELECT status FROM master_operator WHERE id = 10) AS akun, (SELECT COUNT(*) FROM app_session WHERE revoked_at IS NOT NULL) AS sesi FROM master_data WHERE id_unik = 'G1';",
    );
    expect([
      pegawai.status_aktif,
      pegawai.tanggal_selesai_aktif,
      pegawai.id_keluar,
      pegawai.akun,
      Number(pegawai.sesi),
    ]).toEqual(["Nonaktif", "2026-06-30", id, "Nonaktif", 1]);
    expect(
      (
        await client.execute({
          sql: "SELECT berlaku_oleh FROM hr_keluar WHERE id_keluar = ?;",
          args: [id],
        })
      ).rows[0]?.berlaku_oleh,
    ).toBe("yayasan");
    expect(
      await galat(
        S.simpanKeluar(client, kepeg, { ...draftKeluar(), id_keluar: id }),
      ),
    ).toBe(PESAN_KELUAR_BERLAKU);

    // Potongan zombie (Q-80) pada penulis Web: status dan tanggal tetap.
    await client.execute({
      sql: `UPDATE master_data SET status_aktif = ${statusAktifKeluar("?")}, tanggal_selesai_aktif = ${tanggalSelesaiKeluar("?")} WHERE id_unik = ?;`,
      args: ["Aktif", "", "G1"],
    });
    expect(
      await satuBaris(
        "SELECT status_aktif, tanggal_selesai_aktif FROM master_data WHERE id_unik = 'G1';",
      ),
    ).toMatchObject({
      status_aktif: "Nonaktif",
      tanggal_selesai_aktif: "2026-06-30",
    });

    expect(await galat(S.batalkanKeluar(client, yayasan, id, " "))).toBe(
      "Alasan pembatalan wajib diisi.",
    );
    await S.batalkanKeluar(client, yayasan, id, "Batal resign");
    expect(await galat(S.batalkanKeluar(client, yayasan, id, "Lagi"))).toBe(
      PESAN_KELUAR_DIBATALKAN,
    );
    expect(
      await satuBaris(
        "SELECT status_aktif, id_keluar, (SELECT status FROM master_operator WHERE id = 10) AS akun FROM master_data WHERE id_unik = 'G1';",
      ),
    ).toMatchObject({
      status_aktif: "Aktif",
      id_keluar: null,
      akun: "Nonaktif",
    });
    const daftar = await S.daftarKeluar(client);
    expect(daftar.keluar[0]?.status).toBe("Dibatalkan");
    expect(daftar.alasan).toHaveLength(9);
    await S.simpanKeluar(client, kepeg, draftKeluar());
  });
});
