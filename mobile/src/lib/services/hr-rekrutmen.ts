import "server-only";

import type { Client, InValue, Row } from "@libsql/client";
import { ApiRequestError } from "@/lib/server/http/api-response";
import { saveTeacher } from "@/lib/services/academic/personnel";
import {
  type KaryawanInput,
  pesanBentrokIdentitasKaryawan,
  tambahKaryawan,
} from "@/lib/services/employee";
import { simpanKontrak } from "@/lib/services/hris";
import {
  AMBIL_BERKAS_PELAMAR_SQL,
  BATAL_TAHAP_SQL,
  BERKAS_PELAMAR_SQL,
  type BerkasPelamarBaris,
  type BerkasPelamarDraft,
  BUKA_LOWONGAN_SQL,
  CATAT_TAHAP_SQL,
  type DaftarLowongan,
  HAPUS_BERKAS_PELAMAR_SQL,
  HAPUS_PELAMAR_LAMA_SQL,
  HAPUS_PELAMAR_SQL,
  type HasilHire,
  HITUNG_PELAMAR_LAMA_SQL,
  HITUNG_PELAMAR_SQL,
  type HireData,
  type IsiBerkasPelamar,
  idDariPelamar,
  idPelamarBaru,
  KLAIM_PELAMAR_SQL,
  LAMARAN_PERTAMA_SQL,
  LOWONGAN_SATU_SQL,
  LOWONGAN_SQL,
  type LowonganBaris,
  type LowonganDraft,
  MAKS_CATATAN_TAHAP,
  PELAMAR_LOWONGAN_RINGKAS_SQL,
  PELAMAR_SQL,
  PERSONIL_ADA_SQL,
  PESAN_BELUM_DITERIMA,
  PESAN_BERKAS_PELAMAR_PENUH,
  PESAN_KELOMPOK_TERKUNCI,
  PESAN_KLAIM_GAGAL,
  PESAN_LOWONGAN_BELUM_DIBUKA,
  PESAN_LOWONGAN_BERUBAH,
  PESAN_LOWONGAN_TIDAK_ADA,
  PESAN_PELAMAR_TERKUNCI,
  PESAN_PELAMAR_TIDAK_ADA,
  PESAN_TAHAP_BERUBAH,
  PESAN_TANPA_LANJUTAN,
  type PelamarBaris,
  type PelamarDraft,
  periksaBatalTahap,
  periksaBukaLagi,
  periksaTahap,
  REFERENSI_LOWONGAN_SQL,
  type RincianPelamar,
  SIMPAN_LOWONGAN_SQL,
  SIMPAN_PELAMAR_SQL,
  statusLowongan,
  statusPelamar,
  TAHAP_SQL,
  TAMBAH_BERKAS_PELAMAR_SQL,
  type TahapBaris,
  type TahapDraft,
  type TahapRingkas,
  TUTUP_LOWONGAN_SQL,
  UBAH_LOWONGAN_SQL,
  UBAH_PELAMAR_SQL,
  validasiLowongan,
  validasiPelamar,
} from "@/lib/validations/hr-rekrutmen";
import {
  HARI_INI_SQL,
  nomorIdentitas,
  uraiBerkasDokumen,
  validasiKontrak,
} from "@/lib/validations/hris";
import {
  emailPersonil,
  firstValidationMessage,
  PESAN_EMAIL_TIDAK_VALID,
  validateEmployeeDraft,
} from "@/lib/validations/stabilization";

// Cermin I/O cloud `desktop/hr_rekrutmen.rs`. Tabelnya cloud-only, jadi Web
// dan Desktop menulis ke database yang sama tanpa outbox.

type Draft = Record<string, unknown>;

export const teks = (
  row: Row | Record<string, unknown> | undefined,
  kolom: string,
) => String(row?.[kolom] ?? "");
export const angka = (
  row: Row | Record<string, unknown> | undefined,
  kolom: string,
) => Number(row?.[kolom] ?? 0) || 0;

export function galat(pesan: string): never {
  throw new ApiRequestError(pesan, 400);
}

export function ambil<T>(
  hasil: { ok: true; nilai: T } | { ok: false; galat: string },
) {
  if (!hasil.ok) galat(hasil.galat);
  return hasil.nilai;
}

function idBaru(awalan: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return (
    awalan + [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")
  );
}

export const isian = (draft: Draft, kunci: string) => {
  const nilai = draft[kunci];
  return typeof nilai === "string" ? nilai.trim() || null : null;
};

function objek(rows: Row[]): Record<string, unknown>[] {
  return rows.map((row) => ({ ...row }));
}

export async function semua(client: Client, sql: string, args: InValue[] = []) {
  return objek((await client.execute({ sql, args })).rows);
}

export async function satu(client: Client, sql: string, args: InValue[] = []) {
  return (await semua(client, sql, args))[0];
}

export async function tulis(client: Client, sql: string, args: InValue[]) {
  return (await client.execute({ sql, args })).rowsAffected;
}

export async function hariIni(client: Client) {
  return teks(await satu(client, HARI_INI_SQL), "hari_ini");
}

async function lowonganSatu(client: Client, id: string) {
  const baris = await satu(client, LOWONGAN_SATU_SQL, [id]);
  if (!baris) galat(PESAN_LOWONGAN_TIDAK_ADA);
  return baris;
}

function rapikanPelamar(p: Record<string, unknown>): PelamarBaris {
  return {
    ...p,
    jumlah_berkas: angka(p, "jumlah_berkas"),
    mungkin_ganda: angka(p, "mungkin_ganda") !== 0,
  } as unknown as PelamarBaris;
}

async function pelamarSatu(client: Client, id: string) {
  const baris = await satu(client, PELAMAR_SQL, ["", id]);
  if (!baris) galat(PESAN_PELAMAR_TIDAK_ADA);
  return rapikanPelamar(baris);
}

function ringkasTahap(daftar: Record<string, unknown>[]): TahapRingkas[] {
  return daftar.map((t) => ({
    id_tahap: teks(t, "id_tahap"),
    urutan: angka(t, "urutan"),
    tahap: teks(t, "tahap"),
    dibatalkan: teks(t, "dibatalkan_pada") !== "",
  }));
}

/** Cermin `daftar_lowongan`. */
export async function daftarLowongan(client: Client): Promise<DaftarLowongan> {
  const hari = await hariIni(client);
  const hitungan = await semua(client, HITUNG_PELAMAR_SQL);
  const lowongan = (await semua(client, LOWONGAN_SQL)).map((l) => {
    const id = teks(l, "id_lowongan");
    const per_status: Record<string, number> = {};
    let total = 0;
    for (const h of hitungan) {
      if (teks(h, "id_lowongan") !== id) continue;
      per_status[teks(h, "status")] = angka(h, "jumlah");
      total += angka(h, "jumlah");
    }
    const jumlah = angka(l, "jumlah");
    return {
      ...l,
      status: statusLowongan(
        teks(l, "tanggal_buka"),
        teks(l, "tanggal_tutup"),
        teks(l, "ditutup_pada") !== "",
        hari,
      ),
      jumlah,
      pelamar_dihapus: angka(l, "pelamar_dihapus"),
      pelamar: total,
      per_status,
      lewat_kuota: (per_status.Diterima ?? 0) > jumlah,
    } as unknown as LowonganBaris;
  });
  return { hari_ini: hari, lowongan };
}

/** Cermin `simpan_lowongan`: aksi `simpan`, `tutup`, `buka`. */
export async function simpanLowongan(
  client: Client,
  oleh: string,
  draft: LowonganDraft,
) {
  const d = draft as Draft;
  const aksi = isian(d, "aksi") ?? "simpan";
  if (aksi === "tutup") {
    const id = isian(d, "id_lowongan") ?? galat(PESAN_LOWONGAN_TIDAK_ADA);
    await lowonganSatu(client, id);
    if ((await tulis(client, TUTUP_LOWONGAN_SQL, [id, oleh])) === 0)
      galat("Lowongan ini sudah ditutup.");
    return { sukses: true, id_lowongan: id };
  }
  if (aksi === "buka") {
    const id = isian(d, "id_lowongan") ?? galat(PESAN_LOWONGAN_TIDAK_ADA);
    const lama = await lowonganSatu(client, id);
    const tutup = isian(d, "tanggal_tutup");
    ambil(
      periksaBukaLagi(tutup, teks(lama, "tanggal_buka"), await hariIni(client)),
    );
    if ((await tulis(client, BUKA_LOWONGAN_SQL, [id, tutup, oleh])) === 0)
      galat("Lowongan ini belum ditutup.");
    return { sukses: true, id_lowongan: id };
  }
  if (aksi !== "simpan") galat("Aksi lowongan tidak dikenal.");
  const sah = ambil(validasiLowongan(d));
  const referensi = await satu(client, REFERENSI_LOWONGAN_SQL, [
    sah.unit,
    sah.id_bagian,
    sah.id_jabatan,
  ]);
  if (angka(referensi, "unit_ada") === 0)
    galat("Unit tidak ditemukan atau tidak aktif.");
  if (angka(referensi, "bagian_ada") === 0)
    galat("Bagian tidak ditemukan atau tidak aktif.");
  if (angka(referensi, "jabatan_ada") === 0)
    galat("Jabatan tidak ditemukan atau tidak aktif.");
  const isi = (id: string): InValue[] => [
    id,
    sah.judul,
    sah.kelompok,
    sah.unit,
    sah.id_bagian,
    sah.id_jabatan,
    sah.jumlah,
    sah.tanggal_buka,
    sah.tanggal_tutup,
    sah.keterangan,
    oleh,
  ];
  if (sah.id_lowongan === null) {
    const id = idBaru("low-");
    await tulis(client, SIMPAN_LOWONGAN_SQL, isi(id));
    return { sukses: true, id_lowongan: id };
  }
  const id = sah.id_lowongan;
  const lama = await lowonganSatu(client, id);
  const pelamar = await satu(client, PELAMAR_LOWONGAN_RINGKAS_SQL, [id]);
  if (angka(pelamar, "jumlah") > 0 && teks(lama, "kelompok") !== sah.kelompok)
    galat(PESAN_KELOMPOK_TERKUNCI);
  const awal = teks(pelamar, "lamaran_awal");
  if (awal !== "" && sah.tanggal_buka > awal)
    galat(
      `Tanggal buka tidak boleh sesudah tanggal lamaran pelamar pertama (${awal}).`,
    );
  if ((await tulis(client, UBAH_LOWONGAN_SQL, isi(id))) === 0)
    galat(PESAN_LOWONGAN_BERUBAH);
  return { sukses: true, id_lowongan: id };
}

/** Cermin `daftar_pelamar`. */
export async function daftarPelamar(
  client: Client,
  idLowongan: string,
  idPelamar: string,
): Promise<RincianPelamar | { pelamar: PelamarBaris[] }> {
  const lowongan = idLowongan.trim();
  const pelamar = idPelamar.trim();
  if (pelamar !== "") {
    return {
      pelamar: await pelamarSatu(client, pelamar),
      tahap: (await semua(client, TAHAP_SQL, [
        pelamar,
      ])) as unknown as TahapBaris[],
      berkas: (await semua(client, BERKAS_PELAMAR_SQL, [
        pelamar,
      ])) as unknown as BerkasPelamarBaris[],
    };
  }
  if (lowongan === "") galat("Lowongan atau pelamar wajib dipilih.");
  return {
    pelamar: (await semua(client, PELAMAR_SQL, [lowongan, ""])).map(
      rapikanPelamar,
    ),
  };
}

/** Cermin `simpan_pelamar`: pelamar baru + tahap Lamaran satu transaksi. */
export async function simpanPelamar(
  client: Client,
  oleh: string,
  draft: PelamarDraft,
) {
  const hari = await hariIni(client);
  const sah = ambil(validasiPelamar(draft as Draft, hari));
  const isi: InValue[] = [
    sah.nama,
    sah.no_hp,
    sah.email,
    sah.lp,
    sah.tanggal_lahir,
    sah.alamat,
    sah.pendidikan,
    sah.prodi,
    sah.sumber,
  ];
  if (sah.id_pelamar !== null) {
    const id = sah.id_pelamar;
    const lama = await pelamarSatu(client, id);
    if (lama.id_karyawan !== "") galat(PESAN_PELAMAR_TERKUNCI);
    if (lama.id_lowongan !== sah.id_lowongan)
      galat("Lowongan pelamar tidak bisa dipindah.");
    if (lama.tanggal_lamaran !== sah.tanggal_lamaran)
      galat("Tanggal lamaran tidak bisa diubah.");
    if (
      (await tulis(client, UBAH_PELAMAR_SQL, [
        id,
        ...isi,
        sah.catatan,
        oleh,
      ])) === 0
    )
      galat(PESAN_PELAMAR_TERKUNCI);
    const baru = await pelamarSatu(client, id);
    return { sukses: true, id_pelamar: id, mungkin_ganda: baru.mungkin_ganda };
  }
  const lowongan = await lowonganSatu(client, sah.id_lowongan);
  const tanggalBuka = teks(lowongan, "tanggal_buka");
  if (tanggalBuka > hari) galat(PESAN_LOWONGAN_BELUM_DIBUKA);
  if (sah.tanggal_lamaran < tanggalBuka)
    galat("Tanggal lamaran tidak boleh sebelum tanggal buka lowongan.");
  const id = idPelamarBaru();
  await client.batch(
    [
      {
        sql: SIMPAN_PELAMAR_SQL,
        args: [
          id,
          sah.id_lowongan,
          ...isi,
          sah.tanggal_lamaran,
          sah.catatan,
          oleh,
        ],
      },
      { sql: LAMARAN_PERTAMA_SQL, args: [id, oleh] },
    ],
    "write",
  );
  const baru = await satu(client, PELAMAR_SQL, ["", id]);
  if (!baru) galat(PESAN_LOWONGAN_BELUM_DIBUKA);
  return {
    sukses: true,
    id_pelamar: id,
    mungkin_ganda: rapikanPelamar(baru).mungkin_ganda,
  };
}

/** Cermin `tahap_pelamar`: aksi `catat` atau `batal`. */
export async function tahapPelamar(
  client: Client,
  oleh: string,
  draft: TahapDraft,
) {
  const d = draft as Draft;
  const id = isian(d, "id_pelamar") ?? galat(PESAN_PELAMAR_TIDAK_ADA);
  const pelamar = await pelamarSatu(client, id);
  const dijadikan = pelamar.id_karyawan !== "";
  const ringkas = ringkasTahap(await semua(client, TAHAP_SQL, [id]));
  const aksi = isian(d, "aksi") ?? "catat";
  if (aksi === "catat") {
    if (dijadikan) galat(PESAN_PELAMAR_TERKUNCI);
    const sah = ambil(
      periksaTahap(
        d,
        pelamar.kelompok,
        statusPelamar(ringkas),
        pelamar.tanggal_lamaran,
        await hariIni(client),
      ),
    );
    const maks = Math.max(0, ...ringkas.map((t) => t.urutan));
    if (
      (await tulis(client, CATAT_TAHAP_SQL, [
        id,
        sah.tahap,
        sah.tanggal,
        sah.catatan,
        oleh,
        maks,
      ])) === 0
    )
      galat(PESAN_TAHAP_BERUBAH);
    return { sukses: true, id_tahap: `${id}:${maks + 1}`, status: sah.tahap };
  }
  if (aksi !== "batal") galat("Aksi tahap tidak dikenal.");
  const idTahap = isian(d, "id_tahap") ?? galat("Tahap wajib dipilih.");
  const alasan = isian(d, "alasan");
  if (!alasan) galat("Alasan pembatalan wajib diisi.");
  if ([...alasan].length > MAKS_CATATAN_TAHAP)
    galat(`Alasan pembatalan maksimal ${MAKS_CATATAN_TAHAP} karakter.`);
  ambil(periksaBatalTahap(ringkas, idTahap, dijadikan));
  if ((await tulis(client, BATAL_TAHAP_SQL, [idTahap, oleh, alasan])) === 0)
    galat(PESAN_TAHAP_BERUBAH);
  return { sukses: true };
}

/** Cermin `berkas_pelamar`. */
export async function ambilBerkasPelamar(
  client: Client,
  idBerkas: string,
): Promise<IsiBerkasPelamar> {
  const baris = await satu(client, AMBIL_BERKAS_PELAMAR_SQL, [idBerkas.trim()]);
  if (!baris) throw new ApiRequestError("Berkas tidak ditemukan.", 404);
  return baris as unknown as IsiBerkasPelamar;
}

/** Cermin `simpan_berkas_pelamar` aksi `tambah`. */
export async function tambahBerkasPelamar(
  client: Client,
  draft: BerkasPelamarDraft,
) {
  const berkas = ambil(
    uraiBerkasDokumen(draft.nama_berkas, draft.mime_type, draft.data_base64),
  );
  const id = idBaru("plb-");
  if (
    (await tulis(client, TAMBAH_BERKAS_PELAMAR_SQL, [
      id,
      draft.id_pelamar.trim(),
      berkas.nama_berkas,
      berkas.mime_type,
      berkas.data_base64,
    ])) === 0
  )
    galat(PESAN_BERKAS_PELAMAR_PENUH);
  return { id_berkas: id };
}

/** Cermin `simpan_berkas_pelamar` aksi `hapus`. */
export async function hapusBerkasPelamar(client: Client, idBerkas: string) {
  if ((await tulis(client, HAPUS_BERKAS_PELAMAR_SQL, [idBerkas.trim()])) === 0)
    galat("Berkas tidak ditemukan, atau pelamarnya sudah menjadi personil.");
  return { sukses: true };
}

/** Cermin `hapus_pelamar`. */
export async function hapusPelamar(client: Client, idPelamar: string) {
  const id = idPelamar.trim();
  const pelamar = await pelamarSatu(client, id);
  if (pelamar.id_karyawan !== "") galat(PESAN_PELAMAR_TERKUNCI);
  await client.batch(
    HAPUS_PELAMAR_SQL.map((sql) => ({ sql, args: [id] })),
    "write",
  );
  if (await satu(client, PELAMAR_SQL, ["", id])) galat(PESAN_PELAMAR_TERKUNCI);
  return { sukses: true };
}

/** Cermin `bersihkan_pelamar`: retensi 12 bulan sesudah lowongan ditutup. */
export async function bersihkanPelamar(client: Client) {
  const jumlah = angka(await satu(client, HITUNG_PELAMAR_LAMA_SQL), "jumlah");
  if (jumlah > 0) {
    await client.batch(
      HAPUS_PELAMAR_LAMA_SQL.map((sql) => ({ sql, args: [] })),
      "write",
    );
  }
  return { dihapus: jumlah };
}

/**
 * Pelamar untuk Jadikan personil: rute membaca `kelompok` dari sini (lowongan
 * di cloud) untuk izin jalur personilnya, bukan dari payload (Q-142).
 */
export function pelamarUntukPersonil(client: Client, idPelamar: string) {
  return pelamarSatu(client, idPelamar.trim());
}

/**
 * Cermin `jadikan_personil` (§25.2.3): `jadikan` = klaim lalu personil dan
 * kontrak pertama; `lanjutkan` = klaim sudah ada, personil dilewati bila
 * sudah ada di database, kontrak diulang (berhenti di PK). Semua validasi
 * sebelum klaim. `saveTeacher`/`tambahKaryawan` tidak diubah, hanya dipanggil
 * dengan pemeriksaan yang sama dengan rutenya.
 */
export async function jadikanPersonil(
  client: Client,
  oleh: string,
  draft: HireData,
  pelamar: PelamarBaris,
): Promise<HasilHire> {
  const ids = ambil(idDariPelamar(pelamar.id_pelamar, pelamar.kelompok));
  const lanjutkan = draft.aksi === "lanjutkan";
  if (pelamar.status !== "Diterima") galat(PESAN_BELUM_DITERIMA);
  if (lanjutkan && pelamar.id_karyawan !== ids.id_unik)
    galat(PESAN_TANPA_LANJUTAN);
  if (!lanjutkan && pelamar.id_karyawan !== "") galat(PESAN_KLAIM_GAGAL);
  const guru = pelamar.kelompok === "Guru";
  const p = draft.personil;
  let email: string | undefined;
  try {
    email = emailPersonil(p.email);
  } catch {
    galat(PESAN_EMAIL_TIDAK_VALID);
  }
  const kontrak = ambil(
    validasiKontrak(
      {
        status: draft.kontrak.status,
        nomor: draft.kontrak.nomor,
        tanggal_mulai: draft.kontrak.tanggal_mulai,
        tanggal_selesai: draft.kontrak.tanggal_selesai,
        percobaan_selesai: draft.kontrak.percobaan_selesai,
        catatan: draft.kontrak.catatan,
      },
      guru,
    ),
  );
  const karyawan: KaryawanInput | null = guru
    ? null
    : {
        id_unik: ids.id_unik,
        kode_karyawan: p.kode_karyawan.trim() || ids.kode_karyawan,
        nama: p.nama.trim(),
        divisi: p.divisi.trim(),
        jabatan_status: p.jabatan_status.trim() || undefined,
        no_hp: p.no_hp.trim() || undefined,
        lp: p.lp === "P" ? "P" : "L",
        id_shift: p.id_shift ?? 0,
        status_aktif: p.status_aktif,
        catatan: p.catatan.trim() || undefined,
        tanggal_mulai_aktif: p.tanggal_mulai_aktif,
        unit: p.unit.trim() || undefined,
        email,
        id_bagian: p.id_bagian?.trim(),
        id_jabatan: p.id_jabatan?.trim(),
        id_atasan: p.id_atasan?.trim(),
      };
  if (karyawan) {
    const pesan = firstValidationMessage(validateEmployeeDraft(karyawan));
    if (pesan) galat(pesan);
  } else {
    if (!p.nama.trim()) galat("Nama guru wajib diisi.");
    ambil(nomorIdentitas("nuptk", p.nuptk));
  }

  if (
    !lanjutkan &&
    (await tulis(client, KLAIM_PELAMAR_SQL, [
      pelamar.id_pelamar,
      ids.id_unik,
      oleh,
    ])) === 0
  )
    galat(PESAN_KLAIM_GAGAL);
  if (!(await satu(client, PERSONIL_ADA_SQL, [ids.id_unik]))) {
    if (karyawan) {
      const bentrok = await pesanBentrokIdentitasKaryawan(
        karyawan.id_unik,
        karyawan.kode_karyawan,
      );
      if (bentrok) galat(bentrok);
      await tambahKaryawan(karyawan);
    } else {
      await saveTeacher({
        id_guru: ids.id_unik,
        is_edit: false,
        nama: p.nama,
        kode_karyawan: p.kode_karyawan,
        nip: p.nip,
        nuptk: p.nuptk,
        gelar: p.gelar,
        spesialisasi_mapel: p.spesialisasi_mapel,
        status_kepegawaian: p.status_kepegawaian,
        no_hp: p.no_hp,
        lp: p.lp,
        id_shift: p.id_shift,
        status_aktif: p.status_aktif,
        unit: p.unit,
        email,
        id_bagian: p.id_bagian,
        id_jabatan: p.id_jabatan,
        id_atasan: p.id_atasan,
        tanggal_mulai_aktif: p.tanggal_mulai_aktif,
      });
    }
  }
  await simpanKontrak(
    client,
    oleh,
    { ...kontrak, id_karyawan: ids.id_unik },
    ids.id_kontrak,
  );
  return {
    sukses: true,
    id_karyawan: ids.id_unik,
    id_kontrak: ids.id_kontrak,
    kelompok: pelamar.kelompok,
  };
}
