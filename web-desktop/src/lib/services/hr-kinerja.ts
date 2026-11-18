import "server-only";

import type { Client, InStatement, Row } from "@libsql/client";
import { hasPermission } from "@/lib/auth/access";
import type { OperatorUser } from "@/lib/auth/operator-user";
import type { PermissionKey } from "@/lib/rbac/catalog";
import { ApiRequestError } from "@/lib/server/http/api-response";
import type { HolidayWhitelistEntry } from "@/lib/validations/holiday-whitelist";
import { KEPALA_UNIT_SQL } from "@/lib/validations/hr-beban";
import { kelompokStatus } from "@/lib/validations/hr-keluar";
import {
  AKAR_RENTANG_SQL,
  ASPEK_KINERJA_SQL,
  ASPEK_TEMPLATE_SQL,
  type AspekKinerja,
  type BarisNilai,
  BENTROK_TEMPLATE_SQL,
  BUAT_PENILAIAN_SQL,
  bolehBacaKinerja,
  type DaftarKinerja,
  type DataTemplateKinerja,
  HAPUS_NILAI_SQL,
  hariKehadiran,
  hitungKehadiran,
  isianTersimpan,
  JENIS_KEPUTUSAN,
  type KandidatBerlaku,
  KEADAAN_KOSONG,
  KELUARGA_SQL,
  KEPALA_TU_SQL,
  KEPUTUSAN_ADA_SQL,
  KEPUTUSAN_DIAJUKAN_SQL,
  KEPUTUSAN_DRAF_SQL,
  KEPUTUSAN_KINERJA_SQL,
  KEPUTUSAN_TERBUKA_SQL,
  type KeadaanKinerja,
  type Kehadiran,
  KINERJA_HARI_SQL,
  KINERJA_MENUNGGU_SQL,
  KINERJA_PEGAWAI_SQL,
  KINERJA_PENGAJUAN_SQL,
  KINERJA_SP_SQL,
  KOREKSI_PENILAIAN_SQL,
  kinerjaBerlaku,
  LEPAS_BAWAAN_SQL,
  type MasukanPenilai,
  muatUlangTemplate,
  NILAI_KINERJA_SQL,
  nilaiAkhir,
  type Otomatis,
  PENGATURAN_KINERJA_SQL,
  PENILAIAN_PEGAWAI_SQL,
  PENILAIAN_PERIODE_SQL,
  PENILAIAN_SATU_SQL,
  PESAN_BELUM_FINAL_SENDIRI,
  PESAN_KEADAAN_BERUBAH,
  PESAN_TIDAK_DITEMUKAN,
  type PengaturanKinerja,
  type PengaturanKinerjaDraft,
  type PenilaianDraft,
  type Periode,
  pengajuanKehadiran,
  pengaturanKinerja,
  penilaiBawaan,
  periksaAksiKinerja,
  periksaBuat,
  periksaTemplateLama,
  periodeDariTahunAjaran,
  pesanBertumpuk,
  predikatNilai,
  type RentangAktif,
  type RincianKinerja,
  type RiwayatKinerja,
  rentangAktif,
  SAMPAI_PENILAIAN_SQL,
  SIMPAN_ASPEK_SQL,
  SIMPAN_NILAI_SQL,
  SIMPAN_TEMPLATE_SQL,
  STATUS_DIAJUKAN,
  STATUS_DRAF,
  STATUS_FINAL,
  skorLengkap,
  statusKinerja,
  susunNilai,
  TAHUN_AJARAN_SQL,
  TEMPLATE_KINERJA_SQL,
  TEMPLATE_SATU_SQL,
  type TemplateDraft,
  type TemplateKinerja,
  TIPE_KEHADIRAN,
  TIPE_MANUAL,
  tandaKinerja,
  UBAH_PENILAIAN_SQL,
  validasiPengaturanKinerja,
  validasiPenilaian,
  validasiTemplate,
} from "@/lib/validations/hr-kinerja";
import {
  dalamCakupan,
  jadwalDariBaris,
  LIBUR_SQL,
  UNIT_PERSONIL_SQL,
  WHITELIST_SQL,
} from "@/lib/validations/hr-pengajuan";
import {
  HARI_INI_SQL,
  PESAN_PEGAWAI_BELUM_DI_CLOUD,
  STATUS_KINI_SQL,
} from "@/lib/validations/hris";

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

// Penilaian: I/O cloud (5b), cermin `daftar_kinerja`, `rincian_kinerja`,
// `simpan_kinerja`, `putuskan_kinerja`. Izin, cakupan, dan "diri sendiri" dari
// SESI; keadaan dijaga di batch lalu dibaca ulang.

type Arg = string | number | null;

const teks = (row: Row | undefined, kolom: string) => {
  const v = row?.[kolom];
  return v === null || v === undefined ? "" : String(v);
};
const teksOpsi = (row: Row | undefined, kolom: string) =>
  teks(row, kolom) || null;
const angkaOpsi = (row: Row | undefined, kolom: string) => {
  const v = row?.[kolom];
  return v === null || v === undefined || v === "" ? null : Number(v);
};
const angka = (row: Row | undefined, kolom: string) =>
  angkaOpsi(row, kolom) ?? 0;

const punya = (operator: OperatorUser, izin: PermissionKey) =>
  hasPermission(operator, izin);
const tautan = (operator: OperatorUser) => (operator.idKaryawan ?? "").trim();
const diriSendiri = (operator: OperatorUser, idKaryawan: string) => {
  const sesi = tautan(operator);
  return sesi !== "" && sesi === idKaryawan.trim();
};
const kunciUnit = (unit: string) => unit.trim().toLowerCase();

async function baris(client: Client, sql: string, args: Arg[] = []) {
  return (await client.execute({ sql, args })).rows;
}

async function satu(client: Client, sql: string, args: Arg[] = []) {
  return (await baris(client, sql, args))[0];
}

/** Baris SQL `json_object(...)`: satu kolom berisi teks JSON. */
async function barisJson(client: Client, sql: string, args: Arg[]) {
  return (await baris(client, sql, args)).map(
    (r) => JSON.parse(String(r[0])) as Record<string, unknown>,
  );
}

async function hariIni(client: Client) {
  const hasil = teks(await satu(client, HARI_INI_SQL), "hari_ini");
  if (!hasil) throw new Error("Tanggal server tidak terbaca.");
  return hasil;
}

function wajib<T>(
  hasil: { ok: true; nilai: T } | { ok: false; galat: string },
): T {
  if (!hasil.ok) galat(hasil.galat);
  return hasil.nilai;
}

async function bacaPeriode(
  client: Client,
  jenis: string,
  kunci: string,
): Promise<Periode> {
  const tahun = (await baris(client, TAHUN_AJARAN_SQL)).map((r) => ({
    id_tahun_ajaran: teks(r, "id_tahun_ajaran"),
    nama_tahun: teks(r, "nama_tahun"),
    semester: teks(r, "semester"),
    tanggal_mulai: teks(r, "tanggal_mulai"),
    tanggal_selesai: teks(r, "tanggal_selesai"),
  }));
  return wajib(periodeDariTahunAjaran(jenis, kunci, tahun));
}

const pegawai = (client: Client, id: string) =>
  baris(client, KINERJA_PEGAWAI_SQL, [id]);

async function satuPegawai(client: Client, id: string): Promise<Row> {
  const p = (await pegawai(client, id))[0];
  if (!p) galat(PESAN_PEGAWAI_BELUM_DI_CLOUD);
  return p;
}

async function kepala(client: Client, sql: string, tanggal: string) {
  return new Map(
    (await baris(client, sql, [tanggal])).map((r) => [
      teks(r, "kunci_unit"),
      teks(r, "id_karyawan"),
    ]),
  );
}

async function unitSesi(client: Client, operator: OperatorUser) {
  const sesi = tautan(operator);
  return sesi === ""
    ? ""
    : teks(await satu(client, UNIT_PERSONIL_SQL, [sesi]), "unit");
}

function rentangPegawai(p: Row, mulai: string, selesai: string) {
  const keluar = teks(p, "id_keluar") ? teks(p, "tanggal_selesai_aktif") : "";
  return rentangAktif(mulai, selesai, teks(p, "tanggal_daftar"), keluar);
}

function masukanPenilai(
  p: Row,
  kepsek: Map<string, string>,
  katu: Map<string, string>,
): MasukanPenilai {
  const unit = kunciUnit(teks(p, "unit"));
  return {
    id_karyawan: teks(p, "id_unik"),
    kelompok: teks(p, "kelompok"),
    id_atasan: teks(p, "id_atasan"),
    kepala_unit: kepsek.get(unit) ?? "",
    kepala_tu: katu.get(unit) ?? "",
  };
}

/** Cermin `hitung_otomatis`: kehadiran atas rentang aktif. */
async function hitungOtomatis(
  client: Client,
  p: Row,
  rentang: RentangAktif | null,
  hari: string,
  ambang: readonly number[],
): Promise<Kehadiran | null> {
  if (!rentang) return null;
  const args = [rentang.mulai, rentang.akhir, teks(p, "id_unik")];
  const [catatan, pengajuan, libur, whitelist] = await Promise.all([
    barisJson(client, KINERJA_HARI_SQL, args),
    baris(client, KINERJA_PENGAJUAN_SQL, args),
    baris(client, LIBUR_SQL, [rentang.mulai, rentang.akhir]),
    baris(client, WHITELIST_SQL),
  ]);
  return hitungKehadiran({
    mulai: rentang.mulai,
    akhir: rentang.akhir,
    hari_ini: hari,
    jadwal: jadwalDariBaris({
      divisi: p.divisi,
      hari_kerja: p.hari_kerja,
      kode_shift: p.kode_shift,
    }),
    hari: catatan.map(hariKehadiran),
    pengajuan: pengajuan.map((r) => pengajuanKehadiran({ ...r })),
    libur: new Set(libur.map((r) => teks(r, "tanggal"))),
    whitelist: whitelist.map(
      (w): HolidayWhitelistEntry => ({
        id: teks(w, "id"),
        scope_type: teks(w, "scope_type"),
        scope_value: teks(w, "scope_value"),
        tanggal_libur: teksOpsi(w, "tanggal_libur"),
        keterangan: null,
        status_aktif: angka(w, "status_aktif"),
      }),
    ),
    ambang,
  });
}

/** Presensi kelas dan jurnal menyusul di 5c; sampai itu diisi manual. */
const petaOtomatis = (k: Kehadiran | null): Record<string, Otomatis> =>
  k ? { [TIPE_KEHADIRAN]: { skor: k.skor, rincian: k.rincian } } : {};

const barisNilai = (v: Row): BarisNilai => ({
  id_aspek: teks(v, "id_aspek"),
  aspek_nama: teks(v, "aspek_nama"),
  tipe: teks(v, "tipe"),
  bobot: angka(v, "bobot"),
  urutan: angka(v, "urutan"),
  skor: angkaOpsi(v, "skor"),
  skor_hitung: angkaOpsi(v, "skor_hitung"),
  catatan: teksOpsi(v, "catatan"),
  rincian: teksOpsi(v, "rincian"),
});

const milik = (rows: Row[], id: string) =>
  rows.filter((r) => teks(r, "id_penilaian") === id);

const statusDari = (keputusan: Row[], id: string) =>
  statusKinerja(
    milik(keputusan, id).map((k) => ({
      urut: angka(k, "urut"),
      jenis: teks(k, "jenis"),
    })),
  );

const finalDari = (keputusan: Row[], id: string) =>
  milik(keputusan, id)
    .filter((k) => teks(k, "jenis") === "Final")
    .at(-1);

async function keputusanDanNilai(client: Client, ids: string[]) {
  const larik = JSON.stringify(ids);
  const [keputusan, nilai] = await Promise.all([
    baris(client, KEPUTUSAN_KINERJA_SQL, [larik]),
    baris(client, NILAI_KINERJA_SQL, [larik]),
  ]);
  return { keputusan, nilai };
}

/** Cermin `template_aspek`: template aktif sekelompok, pilihan atau bawaan. */
async function templateAspek(
  client: Client,
  idTemplate: string | null,
  kelompok: string,
): Promise<{ id: string; nama: string; aspek: BarisNilai[] }> {
  const template = await baris(client, TEMPLATE_KINERJA_SQL);
  const pilih = template.find((t) =>
    idTemplate !== null
      ? teks(t, "id_template") === idTemplate
      : teks(t, "kelompok") === kelompok && angka(t, "is_bawaan") === 1,
  );
  if (
    !pilih ||
    teks(pilih, "kelompok") !== kelompok ||
    angka(pilih, "is_aktif") !== 1
  ) {
    galat(
      idTemplate !== null
        ? `Pilih template aktif kelompok ${kelompok}.`
        : `Belum ada template kinerja bawaan untuk kelompok ${kelompok}.`,
    );
  }
  const id = teks(pilih, "id_template");
  const aspek = (await baris(client, ASPEK_KINERJA_SQL))
    .filter((a) => teks(a, "id_template") === id && angka(a, "is_aktif") === 1)
    .map(
      (a): BarisNilai => ({
        id_aspek: teks(a, "id_aspek"),
        aspek_nama: teks(a, "nama"),
        tipe: teks(a, "tipe"),
        bobot: angka(a, "bobot"),
        urutan: angka(a, "urutan"),
        skor: null,
        skor_hitung: null,
        catatan: null,
        rincian: null,
      }),
    );
  return { id, nama: teks(pilih, "nama"), aspek };
}

/** Penilai = personil tertaut sesi (nama dari data pegawai), atau nama operator. */
async function penilaiSesi(client: Client, operator: OperatorUser) {
  const id = tautan(operator);
  const nama = id ? teks((await pegawai(client, id))[0], "nama") : "";
  return { id: id || null, nama: nama || operator.nama_operator };
}

async function keadaanDasar(
  client: Client,
  operator: OperatorUser,
  idKaryawan: string,
  unitSasaran: string,
): Promise<KeadaanKinerja> {
  const unitAkun = await unitSesi(client, operator);
  return {
    ...KEADAAN_KOSONG,
    sendiri: diriSendiri(operator, idKaryawan),
    boleh_assess: punya(operator, "hr.performance.assess"),
    boleh_finalize: punya(operator, "hr.performance.finalize"),
    dalam_cakupan: dalamCakupan(
      punya(operator, "hr.scope.all"),
      unitAkun,
      unitSasaran,
    ),
  };
}

const periksa = (aksi: string, alasan: string, keadaan: KeadaanKinerja) =>
  wajib(periksaAksiKinerja(aksi, alasan, keadaan));

const statementNilai = (id: string, nilai: BarisNilai[]): InStatement[] =>
  nilai.map((b) => ({
    sql: SIMPAN_NILAI_SQL,
    args: [
      id,
      b.id_aspek,
      b.aspek_nama,
      b.tipe,
      b.bobot,
      b.urutan,
      b.skor,
      b.skor_hitung,
      b.catatan,
      b.rincian,
    ],
  }));

const sampai = (rentang: RentangAktif | null, hari: string) =>
  rentang ? (rentang.akhir < hari ? rentang.akhir : hari) : null;

const statusKiniPegawai = async (client: Client, tanggal: string) =>
  new Map(
    (await baris(client, STATUS_KINI_SQL, [tanggal])).map((r) => [
      teks(r, "id_unik"),
      teks(r, "status"),
    ]),
  );

/** Cermin `daftar_kinerja`: satu periode, atau riwayat satu pegawai. */
export async function daftarKinerja(
  client: Client,
  operator: OperatorUser,
  draft: {
    periode_jenis?: string;
    periode_kunci?: string;
    id_karyawan?: string;
  },
): Promise<DaftarKinerja | RiwayatKinerja> {
  const hari = await hariIni(client);
  const sesi = tautan(operator);
  const view = punya(operator, "hr.performance.view");
  const idKaryawan = (draft.id_karyawan ?? "").trim();

  if (idKaryawan !== "") {
    const rows = await baris(client, PENILAIAN_PEGAWAI_SQL, [idKaryawan]);
    const { keputusan } = await keputusanDanNilai(
      client,
      rows.map((r) => teks(r, "id_penilaian")),
    );
    const kandidat = new Map<string, KandidatBerlaku[]>();
    const hasil: Record<string, unknown>[] = [];
    for (const r of rows) {
      const id = teks(r, "id_penilaian");
      const status = statusDari(keputusan, id);
      if (!bolehBacaKinerja(diriSendiri(operator, idKaryawan), status, view)) {
        continue;
      }
      const akar = teksOpsi(r, "id_ref") ?? id;
      const item: Record<string, unknown> = { ...r, status };
      const f = status === STATUS_FINAL ? finalDari(keputusan, id) : undefined;
      if (f) {
        item.nilai_akhir = angka(f, "nilai_akhir");
        item.predikat = teks(f, "predikat");
        kandidat.set(akar, [
          ...(kandidat.get(akar) ?? []),
          {
            id_penilaian: id,
            final_pada: teks(f, "created_at"),
            koreksi: akar !== id,
          },
        ]);
      }
      hasil.push(item);
    }
    const berlaku = new Set([...kandidat.values()].map(kinerjaBerlaku));
    for (const r of hasil) r.berlaku = berlaku.has(String(r.id_penilaian));
    return { penilaian: hasil, hari_ini: hari } as unknown as RiwayatKinerja;
  }

  const periode = await bacaPeriode(
    client,
    draft.periode_jenis ?? "",
    draft.periode_kunci ?? "",
  );
  const semua = await pegawai(client, "");
  const peta = new Map(semua.map((p) => [teks(p, "id_unik"), p]));
  const statusKini = await statusKiniPegawai(
    client,
    periode.selesai < hari ? periode.selesai : hari,
  );
  const kepsek = await kepala(client, KEPALA_UNIT_SQL, periode.selesai);
  const katu = await kepala(client, KEPALA_TU_SQL, periode.selesai);
  const rentangArgs = [periode.mulai, periode.selesai, ""];
  const akar = new Set(
    (await baris(client, AKAR_RENTANG_SQL, rentangArgs)).map((r) =>
      teks(r, "id_karyawan"),
    ),
  );
  const menunggu = new Set(
    (await baris(client, KINERJA_MENUNGGU_SQL, rentangArgs)).map((r) =>
      teks(r, "id_karyawan"),
    ),
  );
  const rows = await baris(client, PENILAIAN_PERIODE_SQL, [
    periode.jenis,
    periode.kunci,
  ]);
  const { keputusan, nilai } = await keputusanDanNilai(
    client,
    rows.map((r) => teks(r, "id_penilaian")),
  );
  const atur = await pengaturan(client);

  const penilaian: Record<string, unknown>[] = [];
  for (const r of rows) {
    const id = teks(r, "id_penilaian");
    const idK = teks(r, "id_karyawan");
    const status = statusDari(keputusan, id);
    if (!bolehBacaKinerja(diriSendiri(operator, idK), status, view)) continue;
    const p = peta.get(idK);
    const bawaan = p ? penilaiBawaan(masukanPenilai(p, kepsek, katu)) : null;
    const rentang = p
      ? rentangPegawai(p, teks(r, "periode_mulai"), teks(r, "periode_selesai"))
      : null;
    const barisR = milik(nilai, id).map(barisNilai);
    const akhir =
      status === STATUS_FINAL ? finalDari(keputusan, id) : undefined;
    const tanda = tandaKinerja({
      status,
      penilai_oleh: teks(r, "penilai_oleh"),
      id_penilai: teks(r, "id_penilai"),
      penilai_bawaan: bawaan?.id ?? "",
      final_oleh: akhir ? teks(akhir, "oleh") : "",
      nilai: barisR,
      periode_penuh: rentang ? rentang.penuh : true,
      periode_selesai: teks(r, "periode_selesai"),
      dihitung_sampai: teks(r, "dihitung_sampai"),
      pengajuan_menunggu: menunggu.has(idK),
      asn: kelompokStatus(teks(r, "status_kepegawaian")) === "negeri",
    });
    const nilaiR = akhir ? angka(akhir, "nilai_akhir") : nilaiAkhir(barisR);
    penilaian.push({
      ...r,
      status,
      tanda,
      nilai_akhir: nilaiR,
      predikat: akhir
        ? teks(akhir, "predikat")
        : nilaiR === null
          ? null
          : predikatNilai(nilaiR, atur.predikat),
      perlu_saya: status === STATUS_DRAF && sesi !== "" && bawaan?.id === sesi,
      penilai_bawaan: bawaan,
    });
  }

  const belum: Record<string, unknown>[] = [];
  for (const p of semua) {
    const id = teks(p, "id_unik");
    const status = statusKini.get(id) ?? "";
    const rentang = rentangPegawai(p, periode.mulai, periode.selesai);
    if (
      diriSendiri(operator, id) ||
      teks(p, "status_aktif") !== "Aktif" ||
      teks(p, "id_keluar") !== "" ||
      akar.has(id) ||
      kelompokStatus(status) === "negeri" ||
      !rentang
    ) {
      continue;
    }
    const bawaan = penilaiBawaan(masukanPenilai(p, kepsek, katu));
    belum.push({
      id_karyawan: id,
      nama: teks(p, "nama"),
      unit: teks(p, "unit"),
      kelompok: teks(p, "kelompok"),
      jabatan: teks(p, "jabatan"),
      status_kepegawaian: status,
      perlu_saya: sesi !== "" && bawaan?.id === sesi,
      penilai_bawaan: bawaan,
      periode_tidak_penuh: !rentang.penuh,
    });
  }
  return {
    periode,
    hari_ini: hari,
    penilaian,
    belum_dinilai: belum,
    sesi: {
      id_karyawan: sesi,
      unit: await unitSesi(client, operator),
      lingkup_semua: punya(operator, "hr.scope.all"),
    },
  } as unknown as DaftarKinerja;
}

/** Cermin `rincian_kinerja`. */
export async function rincianKinerja(
  client: Client,
  operator: OperatorUser,
  idPenilaian: string,
): Promise<RincianKinerja> {
  const id = idPenilaian.trim();
  const p = await satu(client, PENILAIAN_SATU_SQL, [id]);
  if (!p) galat(PESAN_TIDAK_DITEMUKAN);
  const idK = teks(p, "id_karyawan");
  const akar = teksOpsi(p, "id_ref") ?? id;
  const keluarga = await baris(client, KELUARGA_SQL, [akar]);
  const { keputusan, nilai } = await keputusanDanNilai(
    client,
    keluarga.map((r) => teks(r, "id_penilaian")),
  );
  const status = statusDari(keputusan, id);
  const view = punya(operator, "hr.performance.view");
  const sendiri = diriSendiri(operator, idK);
  if (!bolehBacaKinerja(sendiri, status, view)) {
    galat(PESAN_BELUM_FINAL_SENDIRI);
  }
  const hari = await hariIni(client);
  const atur = await pengaturan(client);
  const mulai = teks(p, "periode_mulai");
  const selesai = teks(p, "periode_selesai");
  const orang = (await pegawai(client, idK))[0];
  const rentang = orang ? rentangPegawai(orang, mulai, selesai) : null;
  const kehadiran = orang
    ? await hitungOtomatis(client, orang, rentang, hari, atur.ambang)
    : null;
  const hidup = petaOtomatis(kehadiran);
  const barisP = milik(nilai, id).map(barisNilai);

  const kepsek = await kepala(client, KEPALA_UNIT_SQL, selesai);
  const katu = await kepala(client, KEPALA_TU_SQL, selesai);
  const bawaan = orang
    ? penilaiBawaan(masukanPenilai(orang, kepsek, katu))
    : null;
  const bawaanNama = bawaan
    ? teksOpsi((await pegawai(client, bawaan.id))[0], "nama")
    : null;
  const menunggu =
    (await baris(client, KINERJA_MENUNGGU_SQL, [mulai, selesai, idK])).length >
    0;
  const akhir = status === STATUS_FINAL ? finalDari(keputusan, id) : undefined;
  const tanda = tandaKinerja({
    status,
    penilai_oleh: teks(p, "penilai_oleh"),
    id_penilai: teks(p, "id_penilai"),
    penilai_bawaan: bawaan?.id ?? "",
    final_oleh: akhir ? teks(akhir, "oleh") : "",
    nilai: barisP,
    periode_penuh: rentang ? rentang.penuh : true,
    periode_selesai: selesai,
    dihitung_sampai: teks(p, "dihitung_sampai"),
    pengajuan_menunggu: menunggu,
    asn: kelompokStatus(teks(p, "status_kepegawaian")) === "negeri",
  });
  if (
    status !== STATUS_DRAF &&
    barisP.some((b) => {
      const o = hidup[b.tipe];
      return b.rincian !== null && o !== undefined && o.rincian !== b.rincian;
    })
  ) {
    tanda.push("otomatis_berubah");
  }
  const nilaiP = akhir ? angka(akhir, "nilai_akhir") : nilaiAkhir(barisP);
  const predikatP = akhir
    ? teks(akhir, "predikat")
    : nilaiP === null
      ? null
      : predikatNilai(nilaiP, atur.predikat);

  const kandidat: KandidatBerlaku[] = [];
  const riwayat: Record<string, unknown>[] = [];
  for (const r of keluarga) {
    const idR = teks(r, "id_penilaian");
    const statusR = statusDari(keputusan, idR);
    if (!bolehBacaKinerja(sendiri, statusR, view)) continue;
    const f = statusR === STATUS_FINAL ? finalDari(keputusan, idR) : undefined;
    if (f) {
      kandidat.push({
        id_penilaian: idR,
        final_pada: teks(f, "created_at"),
        koreksi: idR !== akar,
      });
    }
    riwayat.push({
      id_penilaian: idR,
      id_ref: teks(r, "id_ref"),
      alasan_koreksi: teks(r, "alasan_koreksi"),
      status: statusR,
      created_at: teks(r, "created_at"),
      nilai_akhir: f ? angka(f, "nilai_akhir") : null,
      predikat: f ? teks(f, "predikat") : null,
    });
  }
  const berlaku = kinerjaBerlaku(kandidat);
  for (const r of riwayat) r.berlaku = berlaku === r.id_penilaian;
  const sp = await baris(client, KINERJA_SP_SQL, [idK, mulai, selesai]);
  return {
    penilaian: { ...p },
    status,
    tanda,
    nilai: barisP,
    keputusan: milik(keputusan, id).map((k) => ({ ...k })),
    nilai_akhir: nilaiP,
    predikat: predikatP,
    kehadiran,
    hidup,
    rentang,
    keluarga: riwayat,
    berlaku,
    sp: sp.map((s) => ({ ...s })),
    penilai_bawaan: bawaan ? { ...bawaan, nama: bawaanNama } : null,
    pengaturan: atur,
    unit_pegawai: orang ? teks(orang, "unit") : "",
    sendiri,
    hari_ini: hari,
  } as unknown as RincianKinerja;
}

/** Cermin `simpan_kinerja`: Buat, Simpan, Muat ulang, Koreksi. */
export async function simpanKinerja(
  client: Client,
  operator: OperatorUser,
  draft: PenilaianDraft,
): Promise<{ sukses: true; id_penilaian: string }> {
  const sah = wajib(validasiPenilaian(draft));
  const hari = await hariIni(client);
  const atur = await pengaturan(client);
  const penilai = await penilaiSesi(client, operator);

  if (sah.aksi === "Buat") {
    const idK = sah.id_karyawan ?? "";
    const orang = await satuPegawai(client, idK);
    periksa(
      "Buat",
      "",
      await keadaanDasar(client, operator, idK, teks(orang, "unit")),
    );
    const periode = await bacaPeriode(
      client,
      sah.periode_jenis ?? "",
      sah.periode_kunci ?? "",
    );
    const rentang = rentangPegawai(orang, periode.mulai, periode.selesai);
    wajib(
      periksaBuat(
        teks(orang, "status_aktif") === "Aktif",
        teks(orang, "id_keluar") !== "",
        periode.mulai,
        hari,
        rentang,
      ),
    );
    const bentrok = async () => {
      const b = (
        await baris(client, AKAR_RENTANG_SQL, [
          periode.mulai,
          periode.selesai,
          idK,
        ])
      )[0];
      return b
        ? pesanBertumpuk(teks(b, "periode_mulai"), teks(b, "periode_selesai"))
        : null;
    };
    const awal = await bentrok();
    if (awal) galat(awal);
    const kelompok = teks(orang, "kelompok");
    const template = await templateAspek(client, sah.id_template, kelompok);
    const kehadiran = await hitungOtomatis(
      client,
      orang,
      rentang,
      hari,
      atur.ambang,
    );
    const nilai = wajib(
      susunNilai(template.aspek, sah.nilai, petaOtomatis(kehadiran)),
    );
    const statusKini = (await statusKiniPegawai(client, hari)).get(idK) ?? "";
    const id = idBaru("knj-");
    await client.batch(
      [
        {
          sql: BUAT_PENILAIAN_SQL,
          args: [
            id,
            idK,
            periode.jenis,
            periode.kunci,
            periode.nama,
            periode.mulai,
            periode.selesai,
            template.id,
            template.nama,
            kelompok,
            teks(orang, "unit"),
            teks(orang, "jabatan"),
            statusKini,
            penilai.id,
            penilai.nama,
            operator.username,
            sah.catatan,
            sampai(rentang, hari),
          ],
        },
        ...statementNilai(id, nilai),
      ],
      "write",
    );
    if (!(await satu(client, PENILAIAN_SATU_SQL, [id]))) {
      galat((await bentrok()) ?? PESAN_KEADAAN_BERUBAH);
    }
    return { sukses: true, id_penilaian: id };
  }

  const idAwal = sah.id_penilaian ?? "";
  const p = await satu(client, PENILAIAN_SATU_SQL, [idAwal]);
  if (!p) galat(PESAN_TIDAK_DITEMUKAN);
  const idK = teks(p, "id_karyawan");
  const akar = teksOpsi(p, "id_ref") ?? idAwal;
  const keluarga = await baris(client, KELUARGA_SQL, [akar]);
  const ids = keluarga.map((r) => teks(r, "id_penilaian"));
  const { keputusan, nilai: nilaiSemua } = await keputusanDanNilai(client, ids);
  const orang = await satuPegawai(client, idK);
  const rentang = rentangPegawai(
    orang,
    teks(p, "periode_mulai"),
    teks(p, "periode_selesai"),
  );
  const keadaan = await keadaanDasar(
    client,
    operator,
    idK,
    teks(orang, "unit"),
  );
  const otomatis = petaOtomatis(
    await hitungOtomatis(client, orang, rentang, hari, atur.ambang),
  );
  const dihitung = sampai(rentang, hari);

  if (sah.aksi === "Koreksi") {
    keadaan.akar_final = statusDari(keputusan, akar) === STATUS_FINAL;
    keadaan.koreksi_terbuka = ids
      .filter((x) => x !== akar)
      .some((x) => {
        const s = statusDari(keputusan, x);
        return s === STATUS_DRAF || s === STATUS_DIAJUKAN;
      });
    periksa("Koreksi", "", keadaan);
    const kandidat: KandidatBerlaku[] = [];
    for (const x of ids) {
      const f =
        statusDari(keputusan, x) === STATUS_FINAL
          ? finalDari(keputusan, x)
          : undefined;
      if (f) {
        kandidat.push({
          id_penilaian: x,
          final_pada: teks(f, "created_at"),
          koreksi: x !== akar,
        });
      }
    }
    const sumber = kinerjaBerlaku(kandidat) ?? akar;
    const asal = keluarga.find((r) => teks(r, "id_penilaian") === sumber) ?? p;
    const lama = milik(nilaiSemua, sumber).map(barisNilai);
    const nilai = wajib(susunNilai(lama, isianTersimpan(lama), otomatis));
    const id = idBaru("knj-");
    await client.batch(
      [
        {
          sql: KOREKSI_PENILAIAN_SQL,
          args: [
            id,
            sah.alasan_koreksi,
            teks(asal, "id_template"),
            teks(asal, "template_nama"),
            penilai.id,
            penilai.nama,
            operator.username,
            teksOpsi(asal, "catatan"),
            dihitung,
            akar,
          ],
        },
        ...statementNilai(id, nilai),
      ],
      "write",
    );
    if (!(await satu(client, PENILAIAN_SATU_SQL, [id]))) {
      galat("Penilaian ini masih punya koreksi yang belum selesai.");
    }
    return { sukses: true, id_penilaian: id };
  }

  keadaan.status = statusDari(keputusan, idAwal);
  keadaan.koreksi = teks(p, "id_ref") !== "";
  periksa(sah.aksi, "", keadaan);
  const tersimpan = milik(nilaiSemua, idAwal).map(barisNilai);
  let idT = teks(p, "id_template");
  let namaT = teks(p, "template_nama");
  let nilai: BarisNilai[];
  if (sah.aksi === "Muat ulang") {
    const template = await templateAspek(
      client,
      sah.id_template ?? idT,
      teks(p, "kelompok"),
    );
    idT = template.id;
    namaT = template.nama;
    const baru = muatUlangTemplate(template.aspek, tersimpan);
    nilai = wajib(susunNilai(baru, isianTersimpan(baru), otomatis));
  } else {
    nilai = wajib(susunNilai(tersimpan, sah.nilai, otomatis));
  }
  const catatan =
    sah.aksi === "Muat ulang" ? teksOpsi(p, "catatan") : sah.catatan;
  await client.batch(
    [
      {
        sql: UBAH_PENILAIAN_SQL,
        args: [
          idAwal,
          idT,
          namaT,
          penilai.id,
          penilai.nama,
          operator.username,
          catatan,
          dihitung,
        ],
      },
      { sql: HAPUS_NILAI_SQL, args: [idAwal] },
      ...statementNilai(idAwal, nilai),
    ],
    "write",
  );
  const sesudah = await keputusanDanNilai(client, [idAwal]);
  if (statusDari(sesudah.keputusan, idAwal) !== STATUS_DRAF) {
    galat(PESAN_KEADAAN_BERUBAH);
  }
  return { sukses: true, id_penilaian: idAwal };
}

/** Cermin `putuskan_kinerja`: Ajukan, Kembalikan, Final, Batal. */
export async function putuskanKinerja(
  client: Client,
  operator: OperatorUser,
  draft: {
    id_penilaian: string;
    jenis: string;
    alasan?: string;
    rincian?: Record<string, string>;
  },
): Promise<{ sukses: true; id_penilaian: string; id_keputusan: string }> {
  const jenis = draft.jenis;
  if (!(JENIS_KEPUTUSAN as readonly string[]).includes(jenis)) {
    galat("Aksi penilaian tidak dikenal.");
  }
  const id = draft.id_penilaian.trim();
  const alasan = (draft.alasan ?? "").trim();
  const p = await satu(client, PENILAIAN_SATU_SQL, [id]);
  if (!p) galat(PESAN_TIDAK_DITEMUKAN);
  const idK = teks(p, "id_karyawan");
  const { keputusan, nilai: nilaiSemua } = await keputusanDanNilai(client, [
    id,
  ]);
  const orang = await satuPegawai(client, idK);
  const keadaan = await keadaanDasar(
    client,
    operator,
    idK,
    teks(orang, "unit"),
  );
  keadaan.status = statusDari(keputusan, id);
  keadaan.koreksi = teks(p, "id_ref") !== "";
  keadaan.skor_lengkap = true;
  keadaan.otomatis_sama = true;
  const tersimpan = milik(nilaiSemua, id).map(barisNilai);
  const hari = await hariIni(client);
  const atur = await pengaturan(client);
  const idKeputusan = idBaru("kpk-");
  const sesi = tautan(operator) || null;
  const alasanAtauNull = alasan || null;
  const perintah: InStatement[] = [];

  if (jenis === "Ajukan") {
    const rentang = rentangPegawai(
      orang,
      teks(p, "periode_mulai"),
      teks(p, "periode_selesai"),
    );
    const otomatis = petaOtomatis(
      await hitungOtomatis(client, orang, rentang, hari, atur.ambang),
    );
    keadaan.otomatis_sama = tersimpan.every((b) => {
      const o = otomatis[b.tipe];
      return (
        b.tipe === TIPE_MANUAL ||
        o === undefined ||
        draft.rincian?.[b.id_aspek] === o.rincian
      );
    });
    const susun = susunNilai(tersimpan, isianTersimpan(tersimpan), otomatis);
    keadaan.skor_lengkap = susun.ok ? skorLengkap(susun.nilai) : true;
    periksa("Ajukan", alasan, keadaan);
    perintah.push(
      { sql: HAPUS_NILAI_SQL, args: [id] },
      ...statementNilai(id, wajib(susun)),
      { sql: SAMPAI_PENILAIAN_SQL, args: [id, sampai(rentang, hari)] },
      {
        sql: KEPUTUSAN_DRAF_SQL,
        args: [
          id,
          idKeputusan,
          "Ajukan",
          alasanAtauNull,
          null,
          null,
          operator.username,
          sesi,
        ],
      },
    );
  } else if (jenis === "Kembalikan" || jenis === "Final") {
    periksa(jenis, alasan, keadaan);
    let nilai: number | null = null;
    let predikat: string | null = null;
    if (jenis === "Final") {
      nilai = nilaiAkhir(tersimpan);
      if (nilai === null) galat("Isi skor semua aspek sebelum mengajukan.");
      predikat = predikatNilai(nilai, atur.predikat);
    }
    perintah.push({
      sql: KEPUTUSAN_DIAJUKAN_SQL,
      args: [
        id,
        idKeputusan,
        jenis,
        alasanAtauNull,
        nilai,
        predikat,
        operator.username,
        sesi,
      ],
    });
  } else {
    periksa("Batal", alasan, keadaan);
    perintah.push({
      sql: KEPUTUSAN_TERBUKA_SQL,
      args: [
        id,
        idKeputusan,
        "Batal",
        alasan,
        null,
        null,
        operator.username,
        sesi,
      ],
    });
  }
  await client.batch(perintah, "write");
  if (!(await satu(client, KEPUTUSAN_ADA_SQL, [idKeputusan]))) {
    galat(PESAN_KEADAAN_BERUBAH);
  }
  return { sukses: true, id_penilaian: id, id_keputusan: idKeputusan };
}
