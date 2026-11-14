import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Client, createClient } from "@libsql/client";
import type { OperatorUser } from "@/lib/auth/operator-user";
import { initDatabaseSchema } from "@/lib/db-schema";
import { LAPORAN_PENGAJUAN_SQL } from "@/lib/validations/hr-pengajuan";

mock.module("server-only", () => ({}));

const S = await import("./hr-pengajuan");
const { generateAlfaHarian } = await import("./alfa-audit");
const { auditKualitasAbsensi } = await import("./attendance-audit");
const { computePayrollRecap } = await import("./payroll-recap");

// HRIS 2b pada skema Web sungguhan: pengajuan berlaku menutup Alfa dan audit,
// cuti Dibayar masuk rekap gaji, jatah diturunkan. Fixture sama dengan
// `hr_pengajuan_cuti_dibayar_dari_database` di `hr_pengajuan.rs`.
let client: Client;
let testDirectory: string;

const hrd: OperatorUser = {
  id: 1,
  kode_operator: "HRD",
  nama_operator: "hrd",
  username: "hrd",
  role: "Uji",
  roleId: 9,
  roleKey: "uji",
  isSuperadmin: false,
  permissions: ["hr.request.view", "hr.leave.adjust", "hr.org.manage"],
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

beforeAll(async () => {
  testDirectory = mkdtempSync(join(tmpdir(), "kos-pengajuan-2b-"));
  client = createClient({ url: `file:${join(testDirectory, "test.db")}` });
  await initDatabaseSchema(client);
  await client.batch(
    [
      "INSERT INTO tbl_shift (id_shift, kode_shift, nama_shift, jam_masuk, jam_pulang, jam_kerja_normal_menit, hari_kerja) VALUES (91, 91, 'Uji', '07:00', '15:00', 420, '1,2,3,4,5');",
      "INSERT INTO master_data (id_unik, kode_karyawan, nama, divisi, jabatan_status, id_shift, status_aktif, jenis_personil, tanggal_mulai_aktif) VALUES ('P1', 'P1', 'Pegawai Satu', 'TU', 'Staf', 91, 'Aktif', 'Pegawai', '2024-01-01'), ('P2', 'P2', 'Pegawai Dua', 'TU', 'Staf', 91, 'Aktif', 'Pegawai', NULL);",
      `INSERT INTO hr_pengajuan (id_pengajuan, id_karyawan, id_jenis, kelompok, potong_jatah, dampak_gaji, izin_pemutus, tanggal_mulai, tanggal_selesai, setengah_hari, alasan, sidik, diajukan_oleh, waktu_perangkat) VALUES
        ('x1', 'P1', 'jns-cuti-tahunan', 'Cuti', 1, 'Dibayar', 'hr.request.decide', '2026-11-06', '2026-11-09', 0, 'a', 's1', 'u', '2026-11-01 08:00:00'),
        ('x2', 'P2', 'jns-izin-tidak-dibayar', 'Izin', 0, 'Potong Gaji', 'hr.request.decide', '2026-11-06', '2026-11-06', 0, 'a', 's2', 'u', '2026-11-01 08:00:00'),
        ('x3', 'P2', 'jns-izin-dibayar', 'Izin', 0, 'Dibayar', 'hr.request.decide', '2026-11-10', '2026-11-10', 0, 'a', 's3', 'u', '2026-11-01 08:00:00');`,
      `INSERT INTO hr_pengajuan_keputusan (id_keputusan, id_pengajuan, jenis, sidik, oleh, waktu_perangkat, diterima_cloud) VALUES
        ('k1', 'x1', 'Setujui', 's1', 'kepsek', '2026-11-02 08:00:00', '2026-11-02 01:00:00'),
        ('k2', 'x2', 'Setujui', 's2', 'kepsek', '2026-11-02 08:00:00', '2026-11-02 01:00:00'),
        ('k3', 'x3', 'Tolak', 's3', 'kepsek', '2026-11-02 08:00:00', '2026-11-02 01:00:00');`,
      "INSERT INTO absensi_harian (tanggal, id_karyawan, nama, kelas_divisi, jam_masuk, jam_pulang, status_kehadiran, status_absen, sumber, update_terakhir, jam_kerja, id_shift, bulan, tahun, id_sesi, mode_tugas) VALUES ('2026-11-09', 'P1', 'Pegawai Satu', 'TU', '07:00', '13:40', 'Hadir', 'Hadir', 'Scanner', '2026-11-09 15:00:00', 400, 91, 'November', 2026, 's-p1', 'NORMAL');",
    ],
    "write",
  );
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

describe("hr-pengajuan 2b: absensi, gaji, jatah", () => {
  test("cuti dibayar: Hadir menang, Potong Gaji dan Ditolak tidak ikut", async () => {
    const hasil = await S.cutiDibayar(client, "2026-11-01", "2026-11-30");
    expect([...hasil]).toEqual([
      ["P1", { hari: 1, menit: 420, jam_normal_nol: false }],
    ]);
  });

  test("rekap gaji: menit cuti masuk jam reguler dan snapshot", async () => {
    const rekap = await computePayrollRecap(client, "2026-11-01", "2026-11-30");
    const p1 = rekap.find((r) => r.id_karyawan === "P1");
    expect(p1).toMatchObject({
      total_hadir: 1,
      cuti_dibayar_hari: 1,
      cuti_dibayar_menit: 420,
      jam_normal_nol: false,
      total_regular_hours: (400 + 420) / 60,
    });
    expect(JSON.parse(String(p1?.breakdown_snapshot)).cuti_dibayar).toEqual({
      hari: 1,
      menit: 420,
    });
    const p2 = rekap.find((r) => r.id_karyawan === "P2");
    expect(p2?.cuti_dibayar_menit).toBe(0);
  });

  test("Generate Alfa dan audit melewati tanggal pengajuan berlaku", async () => {
    const malam = new Date("2026-11-06T23:30:00+07:00");
    const ringkasan = await generateAlfaHarian(malam, client);
    expect(ringkasan.jumlahPengajuan).toBe(2);
    expect(ringkasan.jumlahAlfaDibuat).toBe(0);
    expect(ringkasan.pesan).toContain("Pengajuan: 2");
    const audit = await auditKualitasAbsensi("2026-11-06", malam, client);
    expect(audit.ringkasan).toMatchObject({
      pengajuan: 2,
      tanpaData: 0,
      karyawanBermasalah: 0,
    });
    expect(audit.temuan.filter((t) => t.kategori === "Pengajuan")).toHaveLength(
      2,
    );
  });

  test("laporan dan daftar: pengajuan berlaku, tanda hadir_saat_cuti", async () => {
    const laporan = await client.execute({
      sql: LAPORAN_PENGAJUAN_SQL,
      args: ["2026-11-01", "2026-11-30"],
    });
    expect(laporan.rows.map((r) => JSON.parse(String(r[0])).id)).toEqual([
      "P1",
      "P2",
    ]);
    const daftar = await S.daftarPengajuan(
      client,
      hrd,
      "2026-11-01",
      "2026-11-30",
    );
    const x1 = daftar.pengajuan.find((p) => p.id_pengajuan === "x1");
    expect(x1?.tanda).toContain("hadir_saat_cuti");
  });

  test("jatah: diturunkan, penyesuaian append-only, pembatalan sekali", async () => {
    const saldo = await S.saldoCuti(client, "P1", "2026-11-02", "2026-11-08");
    const pegawai = saldo.pegawai;
    expect(pegawai?.kelompok).toBe("tendik");
    expect(pegawai?.hari_wajib).toBe(5);
    const periode = () =>
      S.saldoCuti(client, "P1", null, null).then(
        (s) => s.pegawai?.periode.find((p) => p.mulai === "2026-01-01")?.sisa,
      );
    expect(await periode()).toBe(11);
    expect(
      await galat(
        S.sesuaikanCuti(client, hrd, {
          id_karyawan: "P1",
          periode: "2026-02-01",
          jenis: "Koreksi",
          hari: 2,
          alasan: "salah",
        }),
      ),
    ).toBe("Periode itu bukan periode jatah pegawai ini.");
    const baru = await S.sesuaikanCuti(client, hrd, {
      id_karyawan: "P1",
      periode: "2026-01-01",
      jenis: "Saldo Awal",
      hari: 2,
      alasan: "sisa dari buku lama",
    });
    expect(await periode()).toBe(13);
    await S.sesuaikanCuti(client, hrd, {
      batal: String(baru.id_penyesuaian),
      alasan: "dobel",
    });
    expect(await periode()).toBe(11);
    expect(
      await galat(
        S.sesuaikanCuti(client, hrd, {
          batal: String(baru.id_penyesuaian),
          alasan: "lagi",
        }),
      ),
    ).toBe("Penyesuaian ini sudah dibatalkan.");
    const p2 = await S.saldoCuti(client, "P2", null, null);
    expect(p2.pegawai?.tanda).toEqual(["tanpa_tmt"]);
  });

  test("aturan cuti per kelompok tersimpan sebagai setting", async () => {
    const tendik = {
      ...(await S.saldoCuti(client, null, null, null)).aturan.tendik,
      hak: 15,
    };
    const guru = (await S.saldoCuti(client, null, null, null)).aturan.guru;
    const hasil = await S.simpanAturanCuti(client, { guru, tendik });
    expect(hasil.tendik.hak).toBe(15);
    expect(hasil.guru.bulan_awal).toBe(7);
    expect(
      await galat(
        S.simpanAturanCuti(client, { guru, tendik: { ...tendik, hak: 61 } }),
      ),
    ).toBe("Hak cuti tendik harus 0 sampai 60.");
  });
});
