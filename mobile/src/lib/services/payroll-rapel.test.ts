import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Client, createClient } from "@libsql/client";
import { initDatabaseSchema } from "@/lib/db-schema";

mock.module("server-only", () => ({}));

const { cancelRapel, detectRapel, listRapel, rapelMenunggu, saveRapel } =
  await import("@/lib/services/payroll-rapel");
const { computePayrollRecap } = await import("@/lib/services/payroll-recap");

// Berkas sungguhan, satu klien per berkas (pola `loan.test.ts`).
let client: Client;
let testDirectory: string;

async function tulisRun(id: string, status: string, snapshot: string) {
  await client.batch(
    [
      {
        sql: `INSERT INTO payroll_runs (id, idempotency_key, period_start, period_end, status,
                created_by, created_at, updated_at)
              VALUES (?1, ?1, '2026-07-01', '2026-07-31', ?2, 'admin', 'x', 'x');`,
        args: [id, status],
      },
      {
        sql: `INSERT INTO payroll_items (id, payroll_run_id, id_karyawan, nama_karyawan, divisi,
                total_regular_hours, total_overtime_hours, total_overtime_index,
                rate_per_hour, basic_salary, overtime_salary, gross_salary, net_salary,
                breakdown_snapshot, created_at)
              VALUES (?1 || '-K01', ?1, 'K01', 'Budi', 'Guru', 160, 2, 3.5,
                20000, 3200000, 70000, 3270000, 3270000, ?2, 'x');`,
        args: [id, snapshot],
      },
    ],
    "write",
  );
}

beforeAll(async () => {
  testDirectory = mkdtempSync(join(tmpdir(), "kos-rapel-web-"));
  client = createClient({ url: `file:${join(testDirectory, "test.db")}` });
  await initDatabaseSchema(client);
  await client.batch(
    [
      `INSERT INTO master_data (id_unik, kode_karyawan, nama, divisi, id_shift, jenis_personil, status_aktif)
       VALUES ('K01', 'K01', 'Budi', 'Guru', 1, 'Pegawai', 'Aktif');`,
      `INSERT INTO salary_configs (id, id_karyawan, rate_per_hour, effective_date, created_by, created_at)
       VALUES ('sc1', 'K01', 20000, '2026-01-01', 'admin', 'x'),
              ('sc2', 'K01', 22000, '2026-07-01', 'admin', 'x');`,
    ],
    "write",
  );
  await tulisRun(
    "PR1",
    "PAID",
    JSON.stringify({
      components: [
        { category: "ALLOWANCE", calc_type: "PERCENTAGE", rate: 10 },
      ],
    }),
  );
});

afterAll(async () => {
  client.close();
  await Bun.sleep(50);
  try {
    rmSync(testDirectory, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 50,
    });
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !("code" in error) ||
      error.code !== "EBUSY"
    ) {
      throw error;
    }
  }
});

async function statusDiDaftar() {
  return (await listRapel(client)).items[0]?.status;
}

// Cermin `deteksi_simpan_pegang_dan_batal` di `desktop/rapel.rs`, ditambah
// rekap payroll Web yang membayar rapelnya.
describe("rapel Web terhadap skema cloud asli", () => {
  test("deteksi, setujui, masuk rekap, dipegang draf, batal", async () => {
    const calon = (await detectRapel(client, "2026-07", "2026-07")).items;
    expect(calon).toHaveLength(1);
    expect(calon[0]).toMatchObject({
      jumlah: 359_000,
      rate_lama: 20_000,
      rate_baru: 22_000,
      label: "Rapel Juli 2026",
      kelebihan_bayar: false,
    });

    await expect(
      saveRapel(client, "admin", [{ idItem: "PR1-K01", rateBaru: 21_000 }]),
    ).rejects.toThrow("berubah sejak dihitung");
    expect(
      (
        await saveRapel(client, "admin", [
          { idItem: "PR1-K01", rateBaru: 22_000 },
        ])
      ).disimpan,
    ).toBe(1);
    expect((await detectRapel(client, "2026-07", "2026-07")).items).toEqual([]);
    expect(await statusDiDaftar()).toBe("Menunggu");

    // Proses gaji berikutnya membayar rapel sebagai tunjangan, di bruto.
    const rekap = await computePayrollRecap(client, "2026-10-01", "2026-10-31");
    const budi = rekap.find((row) => row.id_karyawan === "K01");
    expect(budi?.est_rapel).toBe(359_000);
    expect(budi?.est_total_allowance).toBeGreaterThanOrEqual(359_000);
    const snapshot = JSON.parse(budi?.breakdown_snapshot ?? "{}");
    expect(snapshot.rapel).toEqual([
      { id_rapel: "rpl-PR1-K01-22000", jumlah: 359_000 },
    ]);
    expect(
      snapshot.components.find(
        (c: { calc_type: string }) => c.calc_type === "RAPEL",
      )?.name,
    ).toBe("Rapel Juli 2026");

    // Draf yang memuatnya memegang rapel: tidak ikut lagi, tidak bisa batal.
    await tulisRun("PR2", "DRAFT", JSON.stringify({ rapel: snapshot.rapel }));
    expect((await rapelMenunggu(client)).size).toBe(0);
    expect(await statusDiDaftar()).toBe("Diproses");
    await expect(
      cancelRapel(client, "admin", "rpl-PR1-K01-22000", "salah"),
    ).rejects.toThrow("sudah masuk proses gaji");

    await client.execute(
      "UPDATE payroll_runs SET status = 'REJECTED' WHERE id = 'PR2';",
    );
    expect(await statusDiDaftar()).toBe("Menunggu");
    await cancelRapel(client, "admin", "rpl-PR1-K01-22000", "salah hitung");
    expect(await statusDiDaftar()).toBe("Dibatalkan");
    expect((await rapelMenunggu(client)).size).toBe(0);
    expect(
      (await detectRapel(client, "2026-07", "2026-07")).items[0]?.jumlah,
    ).toBe(359_000);
  });
});
