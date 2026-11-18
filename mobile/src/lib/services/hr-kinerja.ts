import "server-only";

import type { Client } from "@libsql/client";
import type { OperatorUser } from "@/lib/auth/operator-user";
import { ApiRequestError } from "@/lib/server/http/api-response";
import {
  ASPEK_KINERJA_SQL,
  ASPEK_TEMPLATE_SQL,
  type AspekKinerja,
  BENTROK_TEMPLATE_SQL,
  type DataTemplateKinerja,
  LEPAS_BAWAAN_SQL,
  PENGATURAN_KINERJA_SQL,
  type PengaturanKinerja,
  type PengaturanKinerjaDraft,
  pengaturanKinerja,
  periksaTemplateLama,
  SIMPAN_ASPEK_SQL,
  SIMPAN_TEMPLATE_SQL,
  TEMPLATE_KINERJA_SQL,
  TEMPLATE_SATU_SQL,
  type TemplateDraft,
  type TemplateKinerja,
  validasiPengaturanKinerja,
  validasiTemplate,
} from "@/lib/validations/hr-kinerja";

// Cermin I/O `desktop/hr_kinerja.rs`. Tabel `hr_kinerja_*` cloud-only, jadi
// Web dan Desktop menulis ke database yang sama tanpa outbox.

function galat(pesan: string): never {
  throw new ApiRequestError(pesan, 400);
}

function idBaru(awalan: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return (
    awalan + [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")
  );
}

async function pengaturan(client: Client): Promise<PengaturanKinerja> {
  const rows = (await client.execute(PENGATURAN_KINERJA_SQL)).rows;
  return pengaturanKinerja(
    Object.fromEntries(rows.map((r) => [String(r.key), String(r.value ?? "")])),
  );
}

/** Cermin `daftar_template`: template dengan aspeknya + pengaturan. */
export async function daftarTemplate(
  client: Client,
): Promise<DataTemplateKinerja> {
  const template = (await client.execute(TEMPLATE_KINERJA_SQL)).rows;
  const aspek = (await client.execute(ASPEK_KINERJA_SQL)).rows.map(
    (a) => ({ ...a }) as unknown as AspekKinerja,
  );
  return {
    template: template.map(
      (t) =>
        ({
          ...t,
          aspek: aspek.filter((a) => a.id_template === t.id_template),
        }) as unknown as TemplateKinerja,
    ),
    pengaturan: await pengaturan(client),
  };
}

/**
 * Cermin `simpan_template`: buat atau ubah template beserta semua aspeknya
 * dalam satu batch; bawaan lain sekelompok dilepas di batch yang sama.
 */
export async function simpanTemplate(
  client: Client,
  operator: OperatorUser,
  draft: TemplateDraft,
): Promise<{ sukses: true; id_template: string }> {
  const cek = validasiTemplate(draft);
  if (!cek.ok) galat(cek.galat);
  const sah = cek.nilai;

  let id: string;
  let kelompokLama: string | null = null;
  let aspekLama: { id_aspek: string; tipe: string }[] = [];
  if (sah.id_template) {
    const lama = (
      await client.execute({ sql: TEMPLATE_SATU_SQL, args: [sah.id_template] })
    ).rows[0];
    if (!lama) galat("Template kinerja tidak ditemukan.");
    id = sah.id_template;
    kelompokLama = String(lama.kelompok);
    aspekLama = (
      await client.execute({ sql: ASPEK_TEMPLATE_SQL, args: [id] })
    ).rows.map((a) => ({ id_aspek: String(a.id_aspek), tipe: String(a.tipe) }));
  } else {
    id = idBaru("ktp-");
  }
  const lama = periksaTemplateLama(sah, kelompokLama, aspekLama);
  if (!lama.ok) galat(lama.galat);
  const bentrok = await client.execute({
    sql: BENTROK_TEMPLATE_SQL,
    args: [sah.nama, id],
  });
  if (bentrok.rows.length > 0) {
    galat(`Nama "${sah.nama}" sudah dipakai template lain.`);
  }

  const perintah = [
    {
      sql: SIMPAN_TEMPLATE_SQL,
      args: [
        id,
        sah.nama,
        sah.kelompok,
        sah.keterangan,
        sah.is_bawaan ? 1 : 0,
        sah.is_aktif ? 1 : 0,
        operator.username,
      ],
    },
  ];
  if (sah.is_bawaan) {
    perintah.push({ sql: LEPAS_BAWAAN_SQL, args: [sah.kelompok, id] });
  }
  for (const a of sah.aspek) {
    perintah.push({
      sql: SIMPAN_ASPEK_SQL,
      args: [
        a.id_aspek ?? idBaru(`${id}:`),
        id,
        a.nama,
        a.tipe,
        a.bobot,
        a.panduan,
        a.urutan,
        a.is_aktif ? 1 : 0,
      ],
    });
  }
  await client.batch(perintah, "write");
  return { sukses: true, id_template: id };
}

const UPSERT_SETTING_SQL =
  "INSERT INTO setting_gex_system (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value;";

/** Cermin `simpan_pengaturan`: ketiga kunci dalam satu batch atomik. */
export async function simpanPengaturanKinerja(
  client: Client,
  draft: PengaturanKinerjaDraft,
): Promise<PengaturanKinerja> {
  const cek = validasiPengaturanKinerja(draft);
  if (!cek.ok) galat(cek.galat);
  await client.batch(
    cek.nilai.map(([key, value]) => ({
      sql: UPSERT_SETTING_SQL,
      args: [key, value],
    })),
    "write",
  );
  return pengaturan(client);
}
