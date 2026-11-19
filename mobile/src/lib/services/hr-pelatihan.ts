import "server-only";

import type { Client } from "@libsql/client";
import { ApiRequestError } from "@/lib/server/http/api-response";
import {
  AMBIL_BERKAS_SERTIFIKAT_SQL,
  BATAL_PELATIHAN_SQL,
  type BarisRekap,
  BERKAS_SERTIFIKAT_SQL,
  type BerkasSertifikatBaris,
  BUANG_SERTIFIKAT_LEPAS_SQL,
  type DaftarPelatihan,
  HAPUS_BERKAS_SERTIFIKAT_SQL,
  HASIL_PESERTA_SQL,
  type IsiBerkasSertifikat,
  JENIS_AKTIF_SQL,
  JENIS_SERTIFIKAT_BAWAAN,
  LEPAS_PESERTA_SQL,
  MAKS_CATATAN_PESERTA,
  PELATIHAN_SQL,
  PESAN_BELUM_BERSERTIFIKAT,
  PESAN_JENIS_NONAKTIF,
  PESAN_LEPAS_BERSERTIFIKAT,
  PESAN_PELATIHAN_DIBATALKAN,
  PESAN_PELATIHAN_TIDAK_ADA,
  PESAN_PESERTA_DITOLAK,
  PESAN_PESERTA_GANDA,
  PESAN_PESERTA_TIDAK_ADA,
  PESAN_SERTIFIKAT_DITOLAK,
  PESERTA_SQL,
  type PelatihanBaris,
  type PelatihanDraft,
  type PelatihanQuery,
  type PesertaBaris,
  type PesertaDraft,
  REKAP_PELATIHAN_SQL,
  type RekapPelatihan,
  type RincianPelatihan,
  type RiwayatPelatihan,
  rekapPelatihan,
  type SertifikatDraft,
  SIMPAN_PELATIHAN_SQL,
  statusPelatihan,
  TAMBAH_PESERTA_SQL,
  TAUT_SERTIFIKAT_SQL,
  UBAH_PELATIHAN_SQL,
  validasiHasilPeserta,
  validasiPelatihan,
} from "@/lib/validations/hr-pelatihan";
import {
  ambil,
  angka,
  galat,
  hariIni,
  isian,
  satu,
  semua,
  teks,
  tulis,
} from "./hr-rekrutmen";
import { hapusDokumen, pernyataanDokumen, tambahBerkasDokumen } from "./hris";

// Cermin I/O cloud `desktop/hr_pelatihan.rs`. Tabelnya cloud-only, jadi Web
// dan Desktop menulis ke database yang sama tanpa outbox.

type Draft = Record<string, unknown>;

function idBaru(awalan: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return (
    awalan + [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")
  );
}

function rapikanPelatihan(
  p: Record<string, unknown>,
  hari: string,
): PelatihanBaris {
  return {
    ...p,
    status: statusPelatihan(
      teks(p, "tanggal_mulai"),
      teks(p, "tanggal_selesai"),
      teks(p, "dibatalkan_pada") !== "",
      hari,
    ),
    jumlah_jam: angka(p, "jumlah_jam"),
    biaya: angka(p, "biaya"),
    jumlah_peserta: angka(p, "jumlah_peserta"),
  } as unknown as PelatihanBaris;
}

async function pelatihanSatu(client: Client, id: string, hari: string) {
  const baris = await satu(client, PELATIHAN_SQL, ["", id]);
  if (!baris) galat(PESAN_PELATIHAN_TIDAK_ADA);
  return rapikanPelatihan(baris, hari);
}

async function peserta(
  client: Client,
  idPelatihan: string,
  idKaryawan: string,
  idPeserta: string,
): Promise<PesertaBaris[]> {
  return (
    await semua(client, PESERTA_SQL, [idPelatihan, idKaryawan, idPeserta])
  ).map(
    (p) =>
      ({ ...p, jumlah_jam: angka(p, "jumlah_jam") }) as unknown as PesertaBaris,
  );
}

async function pesertaSatu(client: Client, id: string) {
  const [p] = await peserta(client, "", "", id);
  if (!p) galat(PESAN_PESERTA_TIDAK_ADA);
  return p;
}

const berkas = async (
  client: Client,
  idPelatihan: string,
  idKaryawan: string,
) =>
  (await semua(client, BERKAS_SERTIFIKAT_SQL, [
    idPelatihan,
    idKaryawan,
  ])) as unknown as BerkasSertifikatBaris[];

/** Cermin `daftar_pelatihan`: mode `daftar`, `rincian`, `riwayat`, `rekap`. */
export async function daftarPelatihan(
  client: Client,
  query: PelatihanQuery,
): Promise<
  DaftarPelatihan | RincianPelatihan | RiwayatPelatihan | RekapPelatihan
> {
  const q = query as Draft;
  const hari = await hariIni(client);
  const tahun = isian(q, "tahun") ?? hari.slice(0, 4);
  const mode = isian(q, "mode") ?? "daftar";
  if (mode === "daftar") {
    const pelatihan = (await semua(client, PELATIHAN_SQL, [tahun, ""])).map(
      (p) => rapikanPelatihan(p, hari),
    );
    return { hari_ini: hari, tahun, pelatihan };
  }
  if (mode === "rincian") {
    const id = isian(q, "id_pelatihan") ?? galat(PESAN_PELATIHAN_TIDAK_ADA);
    return {
      hari_ini: hari,
      pelatihan: await pelatihanSatu(client, id, hari),
      peserta: await peserta(client, id, "", ""),
      berkas: await berkas(client, id, ""),
    };
  }
  if (mode === "riwayat") {
    const id = isian(q, "id_karyawan") ?? galat("Pegawai wajib dipilih.");
    return {
      hari_ini: hari,
      peserta: await peserta(client, "", id, ""),
      berkas: await berkas(client, "", id),
    };
  }
  if (mode !== "rekap") galat("Mode pelatihan tidak dikenal.");
  const bahan: BarisRekap[] = (
    await semua(client, REKAP_PELATIHAN_SQL, [
      tahun,
      isian(q, "kelompok") ?? "",
      isian(q, "unit") ?? "",
    ])
  ).map((b) => ({
    id_karyawan: teks(b, "id_karyawan"),
    nama: teks(b, "nama"),
    unit: teks(b, "unit"),
    kelompok: teks(b, "kelompok"),
    tanggal_selesai: teks(b, "tanggal_selesai"),
    jenis_penyelenggara: teks(b, "jenis_penyelenggara"),
    jumlah_jam: angka(b, "jumlah_jam"),
    hasil: teks(b, "hasil"),
    dibatalkan: angka(b, "dibatalkan") !== 0,
  }));
  return { hari_ini: hari, tahun, rekap: rekapPelatihan(bahan, hari) };
}

/** Cermin `simpan_pelatihan`: aksi `simpan` (buat/ubah) atau `batal`. */
export async function simpanPelatihan(
  client: Client,
  oleh: string,
  draft: PelatihanDraft,
): Promise<{ sukses: boolean; id_pelatihan?: string }> {
  const d = draft as Draft;
  const aksi = isian(d, "aksi") ?? "simpan";
  if (aksi === "batal") {
    const id = isian(d, "id_pelatihan") ?? galat(PESAN_PELATIHAN_TIDAK_ADA);
    const alasan = isian(d, "alasan");
    if (!alasan) galat("Alasan pembatalan wajib diisi.");
    if ([...alasan].length > MAKS_CATATAN_PESERTA)
      galat(`Alasan pembatalan maksimal ${MAKS_CATATAN_PESERTA} karakter.`);
    if ((await tulis(client, BATAL_PELATIHAN_SQL, [id, oleh, alasan])) === 0) {
      await pelatihanSatu(client, id, "");
      galat(PESAN_PELATIHAN_DIBATALKAN);
    }
    return { sukses: true };
  }
  if (aksi !== "simpan") galat("Aksi pelatihan tidak dikenal.");
  const sah = ambil(validasiPelatihan(d));
  const isi = (id: string) => [
    id,
    sah.nama,
    sah.jenis_penyelenggara,
    sah.penyelenggara,
    sah.tanggal_mulai,
    sah.tanggal_selesai,
    sah.lokasi,
    sah.jumlah_jam,
    sah.biaya,
    sah.keterangan,
    oleh,
  ];
  if (sah.id_pelatihan === null) {
    const id = idBaru("plt-");
    await tulis(client, SIMPAN_PELATIHAN_SQL, isi(id));
    return { sukses: true, id_pelatihan: id };
  }
  const id = sah.id_pelatihan;
  if ((await tulis(client, UBAH_PELATIHAN_SQL, isi(id))) === 0) {
    await pelatihanSatu(client, id, "");
    galat(PESAN_PELATIHAN_DIBATALKAN);
  }
  return { sukses: true, id_pelatihan: id };
}

/** Cermin `simpan_peserta`: aksi `tambah`, `lepas`, `hasil`. */
export async function simpanPeserta(
  client: Client,
  oleh: string,
  draft: PesertaDraft,
) {
  const d = draft as Draft;
  const aksi = isian(d, "aksi") ?? "tambah";
  if (aksi === "tambah") {
    const idPelatihan =
      isian(d, "id_pelatihan") ?? galat(PESAN_PELATIHAN_TIDAK_ADA);
    const idKaryawan =
      isian(d, "id_karyawan") ?? galat("Pegawai wajib dipilih.");
    const id = `${idPelatihan}:${idKaryawan}`;
    if (
      (await tulis(client, TAMBAH_PESERTA_SQL, [
        idPelatihan,
        idKaryawan,
        oleh,
      ])) === 0
    ) {
      const ganda = (await peserta(client, "", "", id)).length > 0;
      galat(ganda ? PESAN_PESERTA_GANDA : PESAN_PESERTA_DITOLAK);
    }
    return { sukses: true, id_peserta: id };
  }
  const id = isian(d, "id_peserta") ?? galat(PESAN_PESERTA_TIDAK_ADA);
  if (aksi === "lepas") {
    if ((await tulis(client, LEPAS_PESERTA_SQL, [id])) === 0) {
      await pesertaSatu(client, id);
      galat(PESAN_LEPAS_BERSERTIFIKAT);
    }
    return { sukses: true };
  }
  if (aksi !== "hasil") galat("Aksi peserta tidak dikenal.");
  const sah = ambil(validasiHasilPeserta(d));
  if (
    (await tulis(client, HASIL_PESERTA_SQL, [id, sah.hasil, sah.catatan])) === 0
  )
    galat(PESAN_PESERTA_TIDAK_ADA);
  return { sukses: true };
}

/**
 * Cermin `simpan_sertifikat` (Q-147, Q-148): aksi `simpan`, `hapus`,
 * `berkas_tambah`, `berkas_hapus`. Dokumen selalu dibaca dari baris peserta.
 */
export async function simpanSertifikat(
  client: Client,
  oleh: string,
  draft: SertifikatDraft,
): Promise<{ sukses?: boolean; id_dokumen?: string; id_berkas?: string }> {
  const d = draft as Draft;
  const idPeserta = isian(d, "id_peserta") ?? galat(PESAN_PESERTA_TIDAK_ADA);
  const p = await pesertaSatu(client, idPeserta);
  const idLama = p.id_dokumen;
  const aksi = isian(d, "aksi") ?? "simpan";
  if (aksi !== "simpan" && idLama === "") galat(PESAN_BELUM_BERSERTIFIKAT);
  const mentah = (kunci: string) =>
    typeof d[kunci] === "string" ? (d[kunci] as string) : "";
  if (aksi === "simpan") {
    const idJenis = isian(d, "id_jenis") ?? JENIS_SERTIFIKAT_BAWAAN;
    if (
      idJenis !== p.id_jenis &&
      !(await satu(client, JENIS_AKTIF_SQL, [idJenis]))
    )
      galat(PESAN_JENIS_NONAKTIF);
    const { id, sql, args } = pernyataanDokumen(oleh, {
      ...(idLama === "" ? {} : { id: idLama }),
      id_karyawan: p.id_karyawan,
      id_jenis: idJenis,
      nomor: mentah("nomor"),
      tanggal_terbit: mentah("tanggal_terbit"),
      tanggal_kedaluwarsa: mentah("tanggal_kedaluwarsa"),
      catatan: isian(d, "catatan") ?? p.nama_pelatihan,
    });
    await client.batch(
      [
        { sql, args },
        { sql: TAUT_SERTIFIKAT_SQL, args: [id, idPeserta] },
        { sql: BUANG_SERTIFIKAT_LEPAS_SQL, args: [id] },
      ],
      "write",
    );
    if ((await pesertaSatu(client, idPeserta)).id_dokumen !== id)
      galat(PESAN_SERTIFIKAT_DITOLAK);
    return { sukses: true, id_dokumen: id };
  }
  if (aksi === "hapus") return hapusDokumen(client, idLama);
  if (aksi === "berkas_tambah")
    return tambahBerkasDokumen(client, {
      id_dokumen: idLama,
      nama_berkas: mentah("nama_berkas"),
      mime_type: mentah("mime_type"),
      data_base64: mentah("data_base64"),
    });
  if (aksi !== "berkas_hapus") galat("Aksi sertifikat tidak dikenal.");
  const idBerkas = isian(d, "id_berkas") ?? galat("Berkas tidak ditemukan.");
  if (
    (await tulis(client, HAPUS_BERKAS_SERTIFIKAT_SQL, [
      idBerkas,
      idPeserta,
    ])) === 0
  )
    galat("Berkas tidak ditemukan.");
  return { sukses: true };
}

/** Cermin `berkas_sertifikat`: hanya berkas dokumen yang tertaut peserta. */
export async function ambilBerkasSertifikat(
  client: Client,
  idBerkas: string,
): Promise<IsiBerkasSertifikat> {
  const baris = await satu(client, AMBIL_BERKAS_SERTIFIKAT_SQL, [
    idBerkas.trim(),
  ]);
  if (!baris) throw new ApiRequestError("Berkas tidak ditemukan.", 404);
  return baris as unknown as IsiBerkasSertifikat;
}
