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
  PESAN_SK_BUKAN_TETAP,
  PESAN_SP_DICABUT,
  type SpDraft,
  statusAktifKeluar,
  tanggalSelesaiKeluar,
} from "@/lib/validations/hr-keluar";

mock.module("server-only", () => ({}));

// Sisa cuti = callback `sisa_tiga` di tes Rust 4c; `null` (tanpa periode)
// untuk tes 4b.
let sisaCuti: { sisa: number } | null = null;
const pengajuanAsli = await import("@/lib/services/hr-pengajuan");
mock.module("@/lib/services/hr-pengajuan", () => ({
  ...pengajuanAsli,
  sisaCutiPada: async () =>
    sisaCuti && {
      mulai: "2026-01-01",
      selesai: "2026-12-31",
      sisa: sisaCuti.sisa,
      sebelum_berhak: false,
    },
}));

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

// Pasangan Rust: `hr_keluar_pesangon_cloud`, data dan angka yang sama (P1/P2
// di sana = Q1/Q2 di sini; P1/P2 sudah dipakai tes SP berkas ini).
describe("hr-keluar: pesangon dan surat keluar di database Web", () => {
  const yayasan = operator("yayasan", null, [
    "hr.offboard.manage",
    "hr.offboard.decide",
    "hr.scope.all",
  ]);
  const rincianDb = async (id: string) =>
    (
      await client.execute({
        sql: "SELECT komponen, usulan, nominal, alasan_ubah FROM hr_keluar_rincian WHERE id_keluar = ? ORDER BY urutan;",
        args: [id],
      })
    ).rows.map((r) => [String(r.komponen), Number(r.nominal), r.alasan_ubah]);
  const alasan = {
    pengali_up: 0,
    pengali_upmk: 0,
    uph: true,
    kompensasi_pkwt: false,
    uang_pisah: false,
    is_aktif: true,
  };

  test("usulan upah, rincian satu batch, alasan, beku sejak berlaku, nomor", async () => {
    sisaCuti = { sisa: 3 };
    await client.batch(
      [
        "INSERT INTO tbl_shift (id_shift, kode_shift, nama_shift, jam_masuk, jam_pulang, jam_kerja_normal_menit, hari_kerja) VALUES (77, 77, 'Lima hari', '07:00', '15:00', 420, '1,2,3,4,5');",
        "INSERT INTO master_data (id_unik, kode_karyawan, nama, divisi, id_shift, jenis_personil, unit, tanggal_daftar, status_aktif) VALUES ('Q1', 'KQ1', 'Ani', 'Guru', 77, 'GURU', 'SMP', '2020-07-01', 'Aktif'), ('Q2', 'KQ2', 'Budi', 'Guru', 77, 'GURU', 'SMP', '2025-07-01', 'Aktif');",
        "INSERT INTO hr_kontrak (id_kontrak, id_karyawan, status, tanggal_mulai, tanggal_selesai) VALUES ('k1', 'Q1', 'GTY', '2020-07-01', NULL), ('k2', 'Q2', 'GTT', '2026-01-01', '2026-12-31');",
        "INSERT INTO payroll_runs (id, idempotency_key, period_start, period_end, status, created_by) VALUES ('r-apr', 'r-apr', '2026-04-01', '2026-04-30', 'PAID', 'x'), ('r-mei', 'r-mei', '2026-05-01', '2026-05-31', 'PAID', 'x'), ('r-mei2', 'r-mei2', '2026-05-01', '2026-05-31', 'PAID', 'x'), ('r-jun', 'r-jun', '2026-06-01', '2026-06-30', 'DRAFT', 'x'), ('r-lama', 'r-lama', '2025-05-01', '2025-05-31', 'PAID', 'x');",
        "INSERT INTO payroll_items (id, payroll_run_id, id_karyawan, nama_karyawan, divisi, total_regular_hours, total_overtime_hours, total_overtime_index, rate_per_hour, basic_salary, teaching_salary, overtime_salary, gross_salary, net_salary, breakdown_snapshot) VALUES ('i1', 'r-apr', 'Q1', 'Ani', 'Guru', 0, 0, 0, 0, 3000000, 1000000, 500000, 0, 0, '{}'), ('i2', 'r-mei', 'Q1', 'Ani', 'Guru', 0, 0, 0, 0, 3000000, 500000, 0, 0, 0, '{}'), ('i3', 'r-mei2', 'Q1', 'Ani', 'Guru', 0, 0, 0, 0, 0, 500000, 0, 0, 0, '{}'), ('i4', 'r-jun', 'Q1', 'Ani', 'Guru', 0, 0, 0, 0, 9000000, 0, 0, 0, 0, '{}'), ('i5', 'r-lama', 'Q1', 'Ani', 'Guru', 0, 0, 0, 0, 9000000, 0, 0, 0, 0, '{}');",
      ],
      "write",
    );
    const draft: KeluarDraft = {
      id_karyawan: "Q1",
      id_alasan: "klr-efisiensi",
      tanggal_terakhir: "2026-06-30",
    };
    const { id_keluar: id1 } = await S.simpanKeluar(client, yayasan, draft);
    const header = (
      await client.execute({
        sql: "SELECT upah_pokok, usulan_upah_pokok, tunjangan_tetap FROM hr_keluar WHERE id_keluar = ?;",
        args: [id1],
      })
    ).rows[0];
    expect([
      Number(header?.upah_pokok),
      Number(header?.usulan_upah_pokok),
      Number(header?.tunjangan_tetap),
    ]).toEqual([4_000_000, 4_000_000, 0]);
    expect((await rincianDb(id1)).map(([k, n]) => [k, n])).toEqual([
      ["UP", 28_000_000],
      ["UPMK", 12_000_000],
      ["UPH Cuti", 571_429],
      ["UPH Lainnya", 0],
      ["Lainnya", 0],
    ]);

    const ubah: KeluarDraft = {
      ...draft,
      id_keluar: id1,
      rincian: [{ komponen: "Lainnya", nominal: 250_000 }],
    };
    expect(await galat(S.simpanKeluar(client, yayasan, ubah))).toBe(
      "Nominal Lainnya berbeda dari usulan; alasannya wajib diisi.",
    );
    ubah.rincian = [
      {
        komponen: "Lainnya",
        nominal: 250_000,
        alasan_ubah: "Penghargaan masa bakti",
      },
    ];
    ubah.upah_pokok = 4_500_000;
    expect(await galat(S.simpanKeluar(client, yayasan, ubah))).toBe(
      "Upah pokok berbeda dari usulan; alasannya wajib diisi.",
    );
    ubah.alasan_upah = "Honor JP Juni";
    ubah.tunjangan_tetap = 500_000;
    await S.simpanKeluar(client, yayasan, ubah);
    const r = await rincianDb(id1);
    expect(r).toHaveLength(5);
    expect(r[0]?.[1]).toBe(35_000_000);
    expect(r[4]).toEqual(["Lainnya", 250_000, "Penghargaan masa bakti"]);

    // Pengali disunting: rincian tersimpan tidak tersentuh.
    await S.simpanAlasan(client, {
      ...alasan,
      id_alasan: "klr-efisiensi",
      nama: "PHK Efisiensi",
      pengali_up: 50,
      pengali_upmk: 100,
    });
    expect((await rincianDb(id1))[0]?.[1]).toBe(35_000_000);
    expect(
      await galat(
        S.simpanAlasan(client, {
          ...alasan,
          id_alasan: "klr-hilang",
          nama: "X",
        }),
      ),
    ).toBe("Alasan keluar tidak ditemukan.");
    const baru = await S.simpanAlasan(client, {
      ...alasan,
      nama: "Mutasi Yayasan",
    });
    expect(baru.alasan).toHaveLength(10);

    const rincian = await S.rincianKeluar(client, { id_keluar: id1 });
    expect(rincian.pesangon.usulan_upah_pokok).toBe(4_000_000);
    expect(rincian.pesangon.bulan_slip).toBe(2);
    expect(rincian.pesangon.pembagi).toBe(21);
    expect(rincian.status_kepegawaian).toBe("GTY");
    expect(rincian.rincian).toHaveLength(5);
    expect(rincian.ringkasan.total).toBe(
      35_000_000 + 15_000_000 + 714_286 + 250_000,
    );

    // GTT habis kontrak: kompensasi PKWT; tanpa slip upah wajib beralasan.
    const gtt: KeluarDraft = {
      id_karyawan: "Q2",
      id_alasan: "klr-habis-kontrak",
      tanggal_terakhir: "2026-06-30",
      upah_pokok: 3_000_000,
    };
    expect(await galat(S.simpanKeluar(client, yayasan, gtt))).toBe(
      "Upah pokok berbeda dari usulan; alasannya wajib diisi.",
    );
    const { id_keluar: id2 } = await S.simpanKeluar(client, yayasan, {
      ...gtt,
      alasan_upah: "Belum ada slip PAID",
    });
    expect((await rincianDb(id2)).map(([k, n]) => [k, n])).toEqual([
      ["UPH Cuti", 428_571],
      ["UPH Lainnya", 0],
      ["Kompensasi PKWT", 1_500_000],
      ["Lainnya", 0],
    ]);

    // Berlakukan: rincian beku dan ikut potret.
    await S.berlakukanKeluar(client, yayasan, id1);
    await S.berlakukanKeluar(client, yayasan, id2);
    const potret = JSON.parse(
      String(
        (
          await client.execute({
            sql: "SELECT checklist_saat_berlaku FROM hr_keluar WHERE id_keluar = ?;",
            args: [id1],
          })
        ).rows[0]?.checklist_saat_berlaku,
      ),
    );
    expect(potret.rincian).toHaveLength(5);
    expect(potret.ringkasan.perkiraan_diterima).toBe(potret.ringkasan.total);
    expect(
      await galat(S.simpanKeluar(client, yayasan, { ...ubah, rincian: [] })),
    ).toBe(PESAN_KELUAR_BERLAKU);
    expect((await rincianDb(id1))[4]?.[1]).toBe(250_000);

    // Nomor surat keluar: disimpan; kembar ditandai; SK hanya GTY/PTY.
    const sk = await S.simpanKeluar(client, yayasan, {
      id_keluar: id1,
      jenis_surat: "berhenti",
      nomor: "001/SK",
    });
    expect(sk.nomor_kembar).toBe(false);
    expect(
      await galat(
        S.simpanKeluar(client, yayasan, {
          id_keluar: id2,
          jenis_surat: "berhenti",
          nomor: "002/SK",
        }),
      ),
    ).toBe(PESAN_SK_BUKAN_TETAP);
    const ket = await S.simpanKeluar(client, yayasan, {
      id_keluar: id2,
      jenis_surat: "pengalaman",
      nomor: "001/SK",
    });
    expect(ket.nomor_kembar).toBe(true);
    sisaCuti = null;
  });
});
