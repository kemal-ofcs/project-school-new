import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Client, createClient } from "@libsql/client";
import type { OperatorUser } from "@/lib/auth/operator-user";
import { initDatabaseSchema } from "@/lib/db-schema";
import type { PermissionKey } from "@/lib/rbac/catalog";
import {
  type KlaimPegawai,
  PESAN_AKUN_BAYAR,
  PESAN_BATAL_TERBAYAR,
  PESAN_BAYAR_SUDAH_BATAL,
  PESAN_BAYAR_TIDAK_SAH,
  PESAN_BUTUH_PEMUTUS,
  PESAN_DI_LUAR_CAKUPAN_REIMBURSE,
  PESAN_DIRI_SENDIRI_REIMBURSE,
  PESAN_JENIS_GANDA,
  PESAN_KLAIM_DITOLAK_SIMPAN,
  PESAN_KLAIM_TERKUNCI,
  PESAN_NOTA_DITOLAK,
  PESAN_NOTA_TERKUNCI,
  type RincianKlaim,
} from "@/lib/validations/hr-reimburse";

mock.module("server-only", () => ({}));

// Jalur Web reimbursement (HRIS Fase 8c) pada skema Web sungguhan. Pasangan
// Rust: `hr_reimburse_alur_cloud` di `hr_reimburse.rs`, dengan data dan
// langkah yang sama (`hr-reimburse.uji.sql`). Satu klien untuk seluruh berkas.
const testDirectory: string = mkdtempSync(join(tmpdir(), "kos-reimburse-"));
const client: Client = createClient({
  url: `file:${join(testDirectory, "test.db")}`,
});

const S = await import("./hr-reimburse");

const galat = async (janji: Promise<unknown>) => {
  try {
    await janji;
    return null;
  } catch (error) {
    return (error as Error).message;
  }
};

const hitung = async (sql: string) =>
  Number((await client.execute(sql)).rows[0]?.[0] ?? 0);

const operator = (
  username: string,
  idKaryawan: string | null,
  permissions: string[],
): OperatorUser => ({
  id: 2,
  kode_operator: "OP2",
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

/** PNG 1×1 terkecil yang lolos tanda tangan bita. */
const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

beforeAll(async () => {
  await initDatabaseSchema(client);
  await client.executeMultiple(
    readFileSync(join(import.meta.dir, "hr-reimburse.uji.sql"), "utf8"),
  );
}, 60_000);

afterAll(async () => {
  client.close();
  await Bun.sleep(50);
  try {
    rmSync(testDirectory, { recursive: true, force: true });
  } catch {
    // Berkas libsql di Windows kadang masih terkunci; folder sementara saja.
  }
});

describe("hr-reimburse: alur cloud", () => {
  test("klaim, nota, keputusan dari sesi, bayar, batal bayar", async () => {
    const staf = operator("staf", null, ["hr.reimburse.submit"]);
    const lain = operator("lain", null, ["hr.reimburse.submit"]);
    const kepalaSd = operator("kepsd", "rb-ks", ["hr.reimburse.decide"]);
    const kepalaSmp = operator("kepsmp", "rb-kp", ["hr.reimburse.decide"]);
    const ani = operator("ani", "rb-g1", [
      "hr.reimburse.decide",
      "hr.scope.all",
    ]);
    const yayasan = operator("yayasan", null, [
      "hr.reimburse.decide",
      "hr.scope.all",
    ]);

    // Jenis: nama aktif kembar ditolak; jenis nonaktif menolak klaim.
    expect(
      await galat(S.simpanJenis(client, "admin", { nama: " transport " })),
    ).toBe(PESAN_JENIS_GANDA);
    await S.simpanJenis(client, "admin", {
      id_jenis: "rmj-lainnya",
      nama: "Lainnya",
      is_aktif: false,
    });

    const klaim = (jenis: string, tanggal: string, nominal: number) => ({
      id_karyawan: "rb-g1",
      id_jenis: jenis,
      tanggal,
      nominal,
      keperluan: "Biaya dinas",
    });
    expect(
      await galat(
        S.simpanKlaim(client, "staf", klaim("rmj-lainnya", "2026-11-02", 5000)),
      ),
    ).toBe(PESAN_KLAIM_DITOLAK_SIMPAN);
    const k1 = (
      await S.simpanKlaim(
        client,
        "staf",
        klaim("rmj-uji", "2026-11-02", 150000),
      )
    ).id_klaim;
    const k2 = (
      await S.simpanKlaim(client, "staf", klaim("rmj-uji", "2026-11-03", 80000))
    ).id_klaim;
    const k3 = (
      await S.simpanKlaim(
        client,
        "staf",
        klaim("rmj-transport", "2026-11-04", 20000),
      )
    ).id_klaim;

    // Nota: hanya pengaju.
    const nota = {
      aksi: "tambah" as const,
      id_klaim: k1,
      nama_berkas: "nota.png",
      mime_type: "image/png",
      data_base64: PNG,
    };
    expect(await galat(S.simpanNota(client, lain, nota))).toBe(
      PESAN_NOTA_DITOLAK,
    );
    const idNota = (await S.simpanNota(client, staf, nota)).id_berkas ?? "";
    expect((await S.ambilNota(client, staf, idNota)).data_base64).toBe(PNG);
    expect(await galat(S.ambilNota(client, lain, idNota))).not.toBeNull();

    // Keputusan: beda unit dan diri sendiri ditolak, hr.scope.all lolos.
    const setujui = (id: string, nominal: number) => ({
      id_klaim: id,
      aksi: "Setujui" as const,
      nominal_disetujui: nominal,
      alasan: "Tarif",
    });
    expect(
      await galat(S.putusKlaim(client, kepalaSmp, setujui(k1, 100000))),
    ).toBe(PESAN_DI_LUAR_CAKUPAN_REIMBURSE);
    expect(await galat(S.putusKlaim(client, ani, setujui(k1, 100000)))).toBe(
      PESAN_DIRI_SENDIRI_REIMBURSE,
    );
    expect(await galat(S.putusKlaim(client, staf, setujui(k1, 100000)))).toBe(
      PESAN_BUTUH_PEMUTUS,
    );
    expect(
      (await S.putusKlaim(client, yayasan, setujui(k1, 100000))).status,
    ).toBe("Disetujui");
    expect(
      await galat(S.putusKlaim(client, yayasan, setujui(k1, 100000))),
    ).toBe(PESAN_KLAIM_TERKUNCI);
    expect(await galat(S.simpanNota(client, staf, nota))).toBe(
      PESAN_NOTA_TERKUNCI,
    );
    expect(
      await galat(
        S.simpanNota(client, staf, { aksi: "hapus", id_berkas: idNota }),
      ),
    ).toBe(PESAN_NOTA_TERKUNCI);
    await S.putusKlaim(client, kepalaSd, { id_klaim: k2, aksi: "Setujui" });
    const batal = (id: string) => ({
      id_klaim: id,
      aksi: "Batal" as const,
      alasan: "Salah",
    });
    expect((await S.putusKlaim(client, staf, batal(k3))).status).toBe(
      "Dibatalkan",
    );

    // Bayar: total dari nominal disetujui (100000 + 80000), bukan pengajuan.
    const bayar = {
      id_karyawan: "rb-g1",
      id_klaim: [k1, k2],
      tanggal: "2026-11-05",
    };
    // Akun bayar wajib Aset aktif; ditolak sebelum apa pun ditulis.
    expect(
      await galat(
        S.bayarKlaim(client, "bendahara", {
          ...bayar,
          id_akun_bayar: "akun-beban-reimburse",
        }),
      ),
    ).toBe(PESAN_AKUN_BAYAR);
    const dibayar = await S.bayarKlaim(client, "bendahara", bayar);
    expect(dibayar.total).toBe(180000);
    expect(
      await hitung("SELECT SUM(nominal) FROM hr_reimburse_bayar_baris"),
    ).toBe(180000);
    // Jurnal otomatis (v75): Beban Reimbursement D / Kas K, seri Web.
    const jurnal = `jrn-reimb-${dibayar.id_bayar}`;
    expect(
      await hitung(
        `SELECT COUNT(*) FROM keu_jurnal WHERE id_jurnal = '${jurnal}' AND sumber = 'Reimburse' AND id_sumber = '${dibayar.id_bayar}' AND seri = 'WEB' AND nomor LIKE 'JU/2026/WEB/%'`,
      ),
    ).toBe(1);
    expect(
      await hitung(
        `SELECT SUM(debit) FROM keu_jurnal_baris WHERE id_jurnal = '${jurnal}' AND id_akun = 'akun-beban-reimburse'`,
      ),
    ).toBe(180000);
    expect(
      await hitung(
        `SELECT SUM(kredit) FROM keu_jurnal_baris WHERE id_jurnal = '${jurnal}' AND id_akun = 'akun-kas'`,
      ),
    ).toBe(180000);
    expect(await galat(S.bayarKlaim(client, "bendahara", bayar))).toBe(
      PESAN_BAYAR_TIDAK_SAH,
    );
    expect(await galat(S.putusKlaim(client, yayasan, batal(k1)))).toBe(
      PESAN_BATAL_TERBAYAR,
    );

    // Batal bayar sekali, lalu klaim bisa dibatalkan.
    const batalB = { id_bayar: dibayar.id_bayar, alasan: "Salah transfer" };
    await S.batalBayar(client, "bendahara", batalB);
    expect(
      await hitung(
        `SELECT SUM(debit) FROM keu_jurnal_baris WHERE id_jurnal = 'batal-${jurnal}' AND id_akun = 'akun-kas'`,
      ),
    ).toBe(180000);
    expect(
      await hitung(
        `SELECT COUNT(*) FROM keu_jurnal WHERE id_jurnal = 'batal-${jurnal}' AND sumber = 'Pembatalan' AND id_jurnal_batal = '${jurnal}'`,
      ),
    ).toBe(1);
    expect(await galat(S.batalBayar(client, "bendahara", batalB))).toBe(
      PESAN_BAYAR_SUDAH_BATAL,
    );
    expect((await S.putusKlaim(client, yayasan, batal(k1))).status).toBe(
      "Dibatalkan",
    );

    // Daftar: pengaju lain tidak melihat klaim staf; staf melihat tiga.
    const q = { mode: "pegawai" as const, id_karyawan: "rb-g1" };
    expect(
      ((await S.daftarKlaim(client, lain, q)) as KlaimPegawai).klaim,
    ).toEqual([]);
    const milikStaf = (await S.daftarKlaim(client, staf, q)) as KlaimPegawai;
    expect(milikStaf.klaim.length).toBe(3);
    expect(milikStaf.bayar).toEqual([]);
    const rincian = (await S.daftarKlaim(client, yayasan, {
      mode: "rincian",
      id_klaim: k2,
    })) as RincianKlaim;
    expect(rincian.klaim.status).toBe("Disetujui");
    expect(rincian.klaim.status_bayar).toBe("Belum dibayar");
    expect(rincian.klaim.tanda).toEqual(["tanpa_nota"]);
    expect(rincian.bayar.length).toBe(1);
    expect(rincian.bayar[0]?.dibatalkan).toBe(true);
  });
});
