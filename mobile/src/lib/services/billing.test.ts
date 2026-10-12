import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Client, createClient } from "@libsql/client";
import { initDatabaseSchema } from "@/lib/db-schema";

mock.module("server-only", () => ({}));

const {
  account,
  cancel,
  cancelPayment,
  issue,
  list,
  moveToDeposit,
  pay,
  paymentDetail,
  payments,
  preview,
  review,
  saveJenis,
  saveKeringanan,
  saveSeries,
  saveTarif,
} = await import("@/lib/services/billing");
const { trialBalance } = await import("@/lib/services/accounting");

// Berkas sungguhan, satu klien per berkas (pola `inventory.test.ts`).
let client: Client;
let testDirectory: string;

beforeAll(async () => {
  testDirectory = mkdtempSync(join(tmpdir(), "kos-billing-web-"));
  client = createClient({ url: `file:${join(testDirectory, "test.db")}` });
  await initDatabaseSchema(client);
  await client.batch(
    [
      `INSERT INTO akademik_rombel (id_rombel, id_tahun_ajaran, tingkat, nama_rombel) VALUES
         ('r7', 'ta', 7, 'VII A'), ('r8', 'ta', 8, 'VIII A');`,
      `INSERT INTO master_data (id_unik, kode_karyawan, nama, divisi, id_shift, jenis_personil, status_aktif, unit) VALUES
         ('S-01', 'S-01', 'Ani', 'Siswa', 1, 'Siswa', 'Aktif', 'SMP'),
         ('S-02', 'S-02', 'Budi', 'Siswa', 1, 'Siswa', 'Aktif', 'SMP'),
         ('S-03', 'S-03', 'Cici', 'Siswa', 1, 'Siswa', 'Aktif', 'SMP');`,
      `INSERT INTO siswa_data (id_siswa, nama_lengkap, id_rombel, angkatan, status, created_at, updated_at, no_whatsapp_wali) VALUES
         ('S-01', 'Ani', 'r7', 2026, 'Aktif', 'x', 'x', '+6281234567890'),
         ('S-02', 'Budi', 'r8', 2025, 'Aktif', 'x', 'x', NULL),
         ('S-03', 'Cici', 'r8', 2025, 'Lulus', 'x', 'x', NULL);`,
    ],
    "write",
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

async function saldo(akun: string): Promise<number> {
  const neraca = await trialBalance(client, "2099-12-31");
  expect(neraca.total_debit).toBe(neraca.total_kredit);
  const baris = neraca.items.find((item) => item.id_akun === akun);
  return baris ? baris.debit - baris.kredit : 0;
}

// Cermin `terbit_massal_idempoten_dan_batal` di `desktop/billing.rs`.
describe("tagihan Web terhadap skema cloud asli", () => {
  test("terbit massal idempoten, keringanan, dan pembatalan", async () => {
    const { id_jenis_tagihan: jt } = await saveJenis(client, {
      nama: "SPP",
      periodik: "Bulanan",
      nominal_bawaan: 300_000,
      id_akun_pendapatan: "akun-pendapatan-spp",
    });
    await expect(
      saveJenis(client, {
        nama: "Buku",
        periodik: "Tahunan",
        nominal_bawaan: 1,
        id_akun_pendapatan: "akun-kas",
      }),
    ).rejects.toThrow("Akun pendapatan harus akun Pendapatan yang aktif.");
    await saveTarif(client, {
      id_jenis_tagihan: jt,
      nama_unit: "SMP",
      tingkat: 7,
      nominal: 500_000,
    });
    await expect(
      saveTarif(client, {
        id_jenis_tagihan: jt,
        nama_unit: "smp",
        tingkat: 7,
        nominal: 1,
      }),
    ).rejects.toThrow("Tarif untuk unit dan tingkat ini sudah ada.");
    await saveKeringanan(client, "bendahara", {
      id_siswa: "S-02",
      id_jenis_tagihan: jt,
      jenis: "Persen",
      nilai: 50,
    });

    const pratinjau = await preview(client, jt, "2026-07", null, null);
    expect(pratinjau.jumlah_baru).toBe(2);
    expect(pratinjau.total_bersih).toBe(650_000);

    const hasil = await issue(
      client,
      "bendahara",
      jt,
      "2026-07",
      "2026-07-10",
      null,
      null,
    );
    expect(hasil.terbit).toBe(2);
    expect(await saldo("akun-piutang-siswa")).toBe(650_000);
    const ulang = await issue(
      client,
      "bendahara",
      jt,
      "2026-07",
      "2026-07-10",
      null,
      null,
    );
    expect(ulang.terbit).toBe(0);
    expect(await saldo("akun-piutang-siswa")).toBe(650_000);

    const id = `tgh-${jt}-S-01-2026-07`;
    await cancel(client, "kepala", id, "Salah tingkat");
    await expect(cancel(client, "kepala", id, "Lagi")).rejects.toThrow(
      "Tagihan ini sudah dibatalkan.",
    );
    expect(await saldo("akun-piutang-siswa")).toBe(150_000);
    const daftar = await list(client, { periode: "2026-07", status: "Aktif" });
    expect(daftar.items.length).toBe(1);
    expect(daftar.total_sisa).toBe(150_000);
  });
});

// Cermin `pembayaran_alokasi_titipan_dan_tinjauan` di `desktop/billing.rs`.
// Siswa S-02 dipakai di sini karena S-01 sudah punya tagihan batal di atas.
describe("pembayaran Web terhadap skema cloud asli", () => {
  test("alokasi, titipan, pembatalan, pindah ke titipan, dan tinjauan", async () => {
    const { id_jenis_tagihan: jt } = await saveJenis(client, {
      nama: "Uang Kegiatan",
      periodik: "Bulanan",
      nominal_bawaan: 300_000,
      id_akun_pendapatan: "akun-pendapatan-spp",
    });
    await issue(client, "tu", jt, "2026-07", "2026-07-10", null, "r8");
    await issue(client, "tu", jt, "2026-08", "2026-08-10", null, "r8");
    const juli = `tgh-${jt}-S-02-2026-07`;
    const agustus = `tgh-${jt}-S-02-2026-08`;
    const piutangAwal = await saldo("akun-piutang-siswa");
    const kasAwal = await saldo("akun-kas");

    await expect(
      pay(client, "tu", {
        id_siswa: "S-02",
        tanggal: "2999-01-01",
        metode: "Tunai",
        total: 1,
        id_akun_kas: "akun-kas",
        id_tagihan: [juli],
      }),
    ).rejects.toThrow("Tanggal pembayaran tidak boleh melewati hari ini.");

    const kwt1 = await pay(client, "tu", {
      id_siswa: "S-02",
      tanggal: "2026-07-15",
      metode: "Tunai",
      total: 400_000,
      id_akun_kas: "akun-kas",
      id_tagihan: [agustus, juli],
    });
    expect(kwt1.nomor).toBe("KWT/2026/WEB/0001");
    expect(await saldo("akun-piutang-siswa")).toBe(piutangAwal - 400_000);
    expect(await saldo("akun-kas")).toBe(kasAwal + 400_000);
    const daftar = await list(client, { id_jenis_tagihan: jt });
    const item = (id: string) => daftar.items.find((t) => t.id_tagihan === id);
    expect(item(juli)?.status).toBe("Lunas");
    expect(item(agustus)?.sisa).toBe(200_000);
    await expect(cancel(client, "kepala", juli, "x")).rejects.toThrow(
      "Tagihan ini sudah dibayar. Batalkan kuitansinya atau pindahkan ke titipan lebih dulu.",
    );

    const kwt2 = await pay(client, "tu", {
      id_siswa: "S-02",
      tanggal: "2026-07-16",
      metode: "Transfer",
      total: 250_000,
      id_akun_kas: "akun-bank",
      id_tagihan: [agustus],
    });
    expect(kwt2.ke_titipan).toBe(50_000);
    expect(kwt2.nomor).toBe("KWT/2026/WEB/0002");
    const akun = await account(client, "S-02");
    expect(akun.titipan).toBe(50_000);
    expect(akun.tagihan.filter((t) => t.id_tagihan.includes(jt)).length).toBe(
      0,
    );
    expect(akun.riwayat.length).toBe(2);

    await expect(
      pay(client, "tu", {
        id_siswa: "S-02",
        tanggal: "2026-07-16",
        metode: "Titipan",
        total: 10_000,
        id_tagihan: [agustus],
      }),
    ).rejects.toThrow(
      "Pembayaran dari titipan tidak boleh melebihi sisa tagihan yang dipilih.",
    );

    await cancelPayment(client, "kepala", kwt1.id_pembayaran, "Salah input");
    await expect(
      cancelPayment(client, "kepala", kwt1.id_pembayaran, "Lagi"),
    ).rejects.toThrow("Kuitansi ini sudah dibatalkan.");
    expect(await saldo("akun-kas")).toBe(kasAwal);

    const kwt3 = await pay(client, "tu", {
      id_siswa: "S-02",
      tanggal: "2026-07-17",
      metode: "Titipan",
      total: 50_000,
      id_tagihan: [juli],
    });
    expect((await account(client, "S-02")).titipan).toBe(0);
    await expect(
      pay(client, "tu", {
        id_siswa: "S-02",
        tanggal: "2026-07-17",
        metode: "Titipan",
        total: 1,
        id_tagihan: [juli],
      }),
    ).rejects.toThrow("Saldo titipan tidak cukup. Tersedia Rp0.");

    const pengganti = await moveToDeposit(
      client,
      "kepala",
      kwt2.id_pembayaran,
      "Sudah dibayar di perangkat lain",
    );
    expect(pengganti.ke_titipan).toBe(250_000);
    expect((await account(client, "S-02")).titipan).toBe(200_000);
    expect(await saldo("akun-titipan-wali")).toBe(-200_000);
    await expect(
      moveToDeposit(client, "kepala", kwt3.id_pembayaran, "x"),
    ).rejects.toThrow(
      "Kuitansi dari titipan cukup dibatalkan; saldonya kembali dengan sendirinya.",
    );

    await client.batch(
      [
        `INSERT INTO keu_pembayaran (id_pembayaran, id_siswa, nama_siswa, tanggal, seri, nomor_urut, nomor, metode, id_akun_kas, total, dibuat_oleh)
           VALUES ('kwt-lain', 'S-02', 'Budi', '2026-07-17', 'TU9', 1, 'KWT/2026/TU9/0001', 'Titipan', NULL, 50000, 'tu2');`,
        {
          sql: `INSERT INTO keu_pembayaran_alokasi (id_alokasi, id_pembayaran, id_tagihan, nominal)
                VALUES ('kwt-lain-1', 'kwt-lain', ?, 50000);`,
          args: [juli],
        },
      ],
      "write",
    );
    const tinjau = await review(client);
    expect(tinjau.kemungkinan_ganda.length).toBe(2);
    expect(tinjau.lebih_bayar.length).toBe(0);
    expect(tinjau.titipan_minus.length).toBe(0);

    const detail = await paymentDetail(client, pengganti.id_pembayaran);
    expect(detail.pembayaran.no_wali).toBe("");
    expect(detail.alokasi[0]?.id_tagihan).toBeNull();
    expect(detail.pembayaran.keterangan?.startsWith("Pengganti KWT/")).toBe(
      true,
    );
    const semua = await payments(client, "2026-07-01", "2026-07-31", null);
    expect(semua.items.length).toBe(5);
    expect(semua.total_sah).toBe(350_000);

    await saveSeries(client, "W-AB12", " tu1 ", "Loket TU");
    await expect(saveSeries(client, "kode-lain", "TU1", "")).rejects.toThrow(
      "Seri ini sudah dipakai perangkat lain.",
    );
  });
});
