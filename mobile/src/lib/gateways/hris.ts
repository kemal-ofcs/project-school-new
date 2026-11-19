"use client";

import { requestWebApi } from "@/lib/client/api-client";
import { isDesktopRuntime } from "@/lib/runtime/app-runtime";
import { invokeDesktop, kickDesktopSync } from "@/lib/runtime/desktop-commands";
import type { DataBeban, SetupSurat } from "@/lib/validations/hr-beban";
import type {
  AlasanDraft,
  AlasanKeluar,
  DaftarKeluar,
  DaftarSp,
  HasilNomorKeluar,
  HasilSimpanSp,
  KeluarDraft,
  KeluarNomor,
  RincianKeluar,
  SpDraft,
} from "@/lib/validations/hr-keluar";
import type {
  DaftarKinerja,
  DataTemplateKinerja,
  JenisKeputusan,
  PengaturanKinerja,
  PengaturanKinerjaDraft,
  PenilaianDraft,
  RincianKinerja,
  RiwayatKinerja,
  TemplateDraft,
} from "@/lib/validations/hr-kinerja";
import type {
  DaftarPelatihan,
  IsiBerkasSertifikat,
  PelatihanDraft,
  PelatihanQuery,
  PesertaDraft,
  RekapPelatihan,
  RincianPelatihan,
  RiwayatPelatihan,
  SertifikatDraft,
} from "@/lib/validations/hr-pelatihan";
import type { PerluPerhatian } from "@/lib/validations/hr-pengingat";
import type {
  BerkasPelamarDraft,
  DaftarLowongan,
  HasilHire,
  HireDraft,
  IsiBerkasPelamar,
  LowonganDraft,
  PelamarBaris,
  PelamarDraft,
  RincianPelamar,
  TahapDraft,
} from "@/lib/validations/hr-rekrutmen";
import type {
  BerkasDokumenDraft,
  DaftarDokumen,
  DaftarKontrak,
  DaftarTugas,
  DokumenDraft,
  IsiBerkasDokumen,
  JenisDokumenDraft,
  JenisTugasDraft,
  KeuanganDraft,
  KontrakDraft,
  LaporanPtk,
  MasterDraft,
  OrgKepegawaian,
  PendidikanDraft,
  PengaturanKontrak,
  PengaturanKontrakDraft,
  PribadiDraft,
  ProfilPegawai,
  SertifikasiDraft,
  TugasDraft,
} from "@/lib/validations/hris";

export type {
  BagianOrg,
  BarisPtk,
  BerkasDokumenBaris,
  BerkasDokumenDraft,
  DaftarDokumen,
  DaftarKontrak,
  DaftarTugas,
  DokumenBaris,
  DokumenDraft,
  IsiBerkasDokumen,
  JabatanOrg,
  JenisDokumen,
  JenisDokumenDraft,
  JenisTugas,
  JenisTugasDraft,
  KeuanganDraft,
  KontrakBaris,
  KontrakDraft,
  LaporanPtk,
  MasterDraft,
  OrgKepegawaian,
  PegawaiKepegawaian,
  PendidikanBaris,
  PendidikanDraft,
  PengaturanKontrak,
  PribadiDraft,
  ProfilPegawai,
  RingkasKontrak,
  SertifikasiBaris,
  SertifikasiDraft,
  TugasBaris,
  TugasDraft,
} from "@/lib/validations/hris";

// Command `desktop_hr_*` terdaftar di biner Desktop DAN Mobile (`hris.rs` dan
// `commands.rs` disalin sync-rust-modules.ts), jadi satu cabang
// `isDesktopRuntime()` mencakup keduanya.

export async function muatOrgKepegawaian(): Promise<OrgKepegawaian> {
  if (isDesktopRuntime()) return invokeDesktop("desktop_hr_org");
  return requestWebApi("/api/kepegawaian/org/query", "POST", {});
}

export async function simpanBagian(draft: MasterDraft) {
  if (isDesktopRuntime()) {
    const hasil = await invokeDesktop<{ id_bagian: string }>(
      "desktop_hr_section_save",
      { draft },
    );
    kickDesktopSync();
    return hasil;
  }
  return requestWebApi<{ id_bagian: string }>(
    "/api/kepegawaian/section",
    "POST",
    draft,
  );
}

export async function gabungBagian(idAsal: string, idTujuan: string) {
  if (isDesktopRuntime()) {
    const hasil = await invokeDesktop("desktop_hr_section_merge", {
      idAsal,
      idTujuan,
    });
    kickDesktopSync();
    return hasil;
  }
  return requestWebApi("/api/kepegawaian/section/merge", "POST", {
    id_asal: idAsal,
    id_tujuan: idTujuan,
  });
}

export async function simpanJabatan(draft: MasterDraft) {
  if (isDesktopRuntime()) {
    const hasil = await invokeDesktop<{ id_jabatan: string }>(
      "desktop_hr_position_save",
      { draft },
    );
    kickDesktopSync();
    return hasil;
  }
  return requestWebApi<{ id_jabatan: string }>(
    "/api/kepegawaian/position",
    "POST",
    draft,
  );
}

// Fase 1b: kontrak, tugas tambahan, pengaturan, status pajak

async function mutasi<T>(
  command: string,
  args: Record<string, unknown>,
  url: string,
  body: unknown,
): Promise<T> {
  if (isDesktopRuntime()) {
    const hasil = await invokeDesktop<T>(command, args);
    kickDesktopSync();
    return hasil;
  }
  return requestWebApi<T>(url, "POST", body);
}

export async function muatKontrak(): Promise<DaftarKontrak> {
  if (isDesktopRuntime()) return invokeDesktop("desktop_hr_contracts");
  return requestWebApi("/api/kepegawaian/contracts/query", "POST", {});
}

export function simpanKontrak(draft: KontrakDraft) {
  return mutasi(
    "desktop_hr_contract_create",
    { draft },
    "/api/kepegawaian/contracts",
    draft,
  );
}

export function batalKontrak(idKontrak: string, alasan: string) {
  return mutasi(
    "desktop_hr_contract_cancel",
    { idKontrak, alasan },
    "/api/kepegawaian/contracts/cancel",
    { id: idKontrak, alasan },
  );
}

export function simpanPengaturanKontrak(
  draft: PengaturanKontrakDraft,
): Promise<PengaturanKontrak> {
  return mutasi(
    "desktop_hr_settings_save",
    { draft },
    "/api/kepegawaian/settings",
    draft,
  );
}

export function simpanJenisTugas(draft: JenisTugasDraft) {
  return mutasi(
    "desktop_hr_duty_types_save",
    { draft },
    "/api/kepegawaian/duty-type",
    draft,
  );
}

export async function muatTugas(): Promise<DaftarTugas> {
  if (isDesktopRuntime()) return invokeDesktop("desktop_hr_duties");
  return requestWebApi("/api/kepegawaian/duties/query", "POST", {});
}

export function simpanTugas(draft: TugasDraft) {
  return mutasi(
    "desktop_hr_duty_save",
    { draft },
    "/api/kepegawaian/duties",
    draft,
  );
}

export function batalTugas(idTugas: string, alasan: string) {
  return mutasi(
    "desktop_hr_duty_cancel",
    { idTugas, alasan },
    "/api/kepegawaian/duties/cancel",
    { id: idTugas, alasan },
  );
}

export interface StatusTidakTetap {
  /** `false` = kunci belum pernah disimpan, daftar = bawaan. */
  tersimpan: boolean;
  daftar: string[];
  pilihan: string[];
}

export async function muatStatusTidakTetap(): Promise<StatusTidakTetap> {
  if (isDesktopRuntime())
    return invokeDesktop("desktop_get_pajak_status_tidak_tetap");
  return requestWebApi("/api/payroll/config/pajak-status/query", "POST", {});
}

export function simpanStatusTidakTetap(
  daftar: string[],
): Promise<StatusTidakTetap> {
  return mutasi(
    "desktop_save_pajak_status_tidak_tetap",
    { daftar },
    "/api/payroll/config/pajak-status",
    { daftar },
  );
}

// HRIS 1c: data cloud-only. Desktop membaca dan menulis langsung ke database
// cloud lewat command `desktop_hr_*` (tanpa outbox, jadi tanpa kickDesktopSync);
// tanpa koneksi, command melempar `PESAN_LURING`.

function cloud<T>(
  command: string,
  args: Record<string, unknown>,
  url: string,
  body: unknown,
  method: "POST" | "DELETE" = "POST",
): Promise<T> {
  if (isDesktopRuntime()) return invokeDesktop<T>(command, args);
  return requestWebApi<T>(url, method, body);
}

export function muatProfilPegawai(idKaryawan: string): Promise<ProfilPegawai> {
  return cloud(
    "desktop_hr_profile",
    { idKaryawan },
    "/api/kepegawaian/profile/query",
    { id_karyawan: idKaryawan },
  );
}

export function simpanDataPribadi(draft: PribadiDraft) {
  return cloud(
    "desktop_hr_profile_save_personal",
    { idKaryawan: draft.id_karyawan, draft },
    "/api/kepegawaian/profile/personal",
    draft,
  );
}

export function simpanDataKeuangan(draft: KeuanganDraft) {
  return cloud(
    "desktop_hr_profile_save_finance",
    { idKaryawan: draft.id_karyawan, draft },
    "/api/kepegawaian/profile/finance",
    draft,
  );
}

export function simpanPendidikan(draft: PendidikanDraft) {
  return cloud<{ id_pendidikan: string }>(
    "desktop_hr_education_save",
    { draft },
    "/api/kepegawaian/education",
    draft,
  );
}

export function hapusPendidikan(id: string) {
  return cloud(
    "desktop_hr_education_delete",
    { idPendidikan: id },
    "/api/kepegawaian/education",
    { id },
    "DELETE",
  );
}

export function simpanSertifikasi(draft: SertifikasiDraft) {
  return cloud<{ id_sertifikasi: string }>(
    "desktop_hr_certification_save",
    { draft },
    "/api/kepegawaian/certification",
    draft,
  );
}

export function hapusSertifikasi(id: string) {
  return cloud(
    "desktop_hr_certification_delete",
    { idSertifikasi: id },
    "/api/kepegawaian/certification",
    { id },
    "DELETE",
  );
}

/** Tanpa `idKaryawan`: hanya jenis dokumen (cukup `hr.org.manage`). */
export function muatDokumen(idKaryawan = ""): Promise<DaftarDokumen> {
  return cloud(
    "desktop_hr_documents",
    { idKaryawan },
    "/api/kepegawaian/documents/query",
    { id_karyawan: idKaryawan },
  );
}

export function ambilBerkasDokumen(id: string): Promise<IsiBerkasDokumen> {
  return cloud(
    "desktop_hr_document_file",
    { idBerkas: id },
    "/api/kepegawaian/documents/file/query",
    { id },
  );
}

export function simpanDokumen(draft: DokumenDraft) {
  return cloud<{ id_dokumen: string }>(
    "desktop_hr_document_save",
    { draft },
    "/api/kepegawaian/documents",
    draft,
  );
}

export function hapusDokumen(id: string) {
  return cloud(
    "desktop_hr_document_delete",
    { idDokumen: id },
    "/api/kepegawaian/documents",
    { id },
    "DELETE",
  );
}

export function tambahBerkasDokumen(draft: BerkasDokumenDraft) {
  return cloud<{ id_berkas: string }>(
    "desktop_hr_document_file_add",
    {
      idDokumen: draft.id_dokumen,
      namaBerkas: draft.nama_berkas,
      mimeType: draft.mime_type,
      dataBase64: draft.data_base64,
    },
    "/api/kepegawaian/documents/file",
    draft,
  );
}

export function hapusBerkasDokumen(id: string) {
  return cloud(
    "desktop_hr_document_file_delete",
    { idBerkas: id },
    "/api/kepegawaian/documents/file",
    { id },
    "DELETE",
  );
}

export function simpanJenisDokumen(draft: JenisDokumenDraft) {
  return cloud<{ id_jenis: string }>(
    "desktop_hr_document_types_save",
    { draft },
    "/api/kepegawaian/document-types",
    draft,
  );
}

export function muatLaporanPtk(): Promise<LaporanPtk> {
  return cloud("desktop_hr_ptk_report", {}, "/api/kepegawaian/ptk/query", {});
}

/** Data mentah rekap beban mengajar; Desktop membaca SQLite lokal (luring). */
export async function muatBebanMengajar(
  idTahunAjaran: string,
): Promise<DataBeban> {
  if (isDesktopRuntime())
    return invokeDesktop("desktop_hr_teaching_load", { idTahunAjaran });
  return requestWebApi("/api/kepegawaian/teaching-load/query", "POST", {
    id_tahun_ajaran: idTahunAjaran,
  });
}

/** Bahan cetak SK dan surat pada `tanggal` (`""` = hari ini WIB). */
export async function muatSetupSurat(tanggal: string): Promise<SetupSurat> {
  if (isDesktopRuntime())
    return invokeDesktop("desktop_hr_letter_setup", { tanggal });
  return requestWebApi("/api/kepegawaian/letters/query", "POST", { tanggal });
}

/** Kelima belas kunci pengaturan surat sekaligus (`kunciPengaturanSurat`). */
export function simpanPengaturanSurat(
  draft: Record<string, string>,
): Promise<Record<string, string>> {
  return mutasi(
    "desktop_hr_letter_settings_save",
    { draft },
    "/api/kepegawaian/letters/settings",
    draft,
  );
}

// HRIS Fase 6a: kartu "Perlu perhatian", dibaca dari cloud.

export function getPerluPerhatian(): Promise<PerluPerhatian> {
  return cloud(
    "desktop_hr_attention",
    {},
    "/api/kepegawaian/attention/query",
    {},
  );
}

// HRIS Fase 4a: surat peringatan, cloud-only seperti data 1c.

export function muatSuratPeringatan(idKaryawan: string): Promise<DaftarSp> {
  return cloud(
    "desktop_hr_warnings",
    { idKaryawan },
    "/api/kepegawaian/warnings/query",
    { id_karyawan: idKaryawan },
  );
}

/** Buat SP (`id_sp` kosong) atau ubah teksnya. */
export function simpanSuratPeringatan(draft: SpDraft): Promise<HasilSimpanSp> {
  return cloud(
    "desktop_hr_warning_save",
    { draft },
    "/api/kepegawaian/warnings/save",
    draft,
  );
}

export function cabutSuratPeringatan(idSp: string, alasan: string) {
  return cloud(
    "desktop_hr_warning_revoke",
    { idSp, alasan },
    "/api/kepegawaian/warnings/revoke",
    { id_sp: idSp, alasan },
  );
}

// HRIS Fase 4b: pegawai keluar, cloud-only. Sesudah Berlakukan/Batalkan
// pemanggil menjalankan `syncNow()` supaya `master_data` perangkat ikut.

export function muatDaftarKeluar(): Promise<DaftarKeluar> {
  return cloud(
    "desktop_hr_offboardings",
    {},
    "/api/kepegawaian/offboarding/query",
    {},
  );
}

/** Rincian proses (`idKeluar`) atau pratinjau pegawai + hari terakhir. */
export function muatRincianKeluar(masukan: {
  idKeluar?: string;
  idKaryawan?: string;
  tanggalTerakhir?: string;
}): Promise<RincianKeluar> {
  return cloud(
    "desktop_hr_offboarding",
    masukan,
    "/api/kepegawaian/offboarding/detail",
    {
      id_keluar: masukan.idKeluar ?? "",
      id_karyawan: masukan.idKaryawan ?? "",
      tanggal_terakhir: masukan.tanggalTerakhir ?? "",
    },
  );
}

/** Catat (`id_keluar` kosong) atau ubah proses yang belum berlaku. */
export function simpanKeluar(
  draft: KeluarDraft,
): Promise<{ sukses: true; id_keluar: string }> {
  return cloud(
    "desktop_hr_offboarding_save",
    { draft },
    "/api/kepegawaian/offboarding/save",
    draft,
  );
}

/** Nomor SK Pemberhentian / surat keterangan pengalaman kerja (proses Berlaku). */
export function simpanNomorKeluar(
  draft: KeluarNomor,
): Promise<HasilNomorKeluar> {
  return cloud(
    "desktop_hr_offboarding_save",
    { draft },
    "/api/kepegawaian/offboarding/save",
    draft,
  );
}

/** Ubah (`id_alasan`) atau tambah alasan keluar dan pengalinya. */
export function simpanAlasanKeluar(
  draft: AlasanDraft,
): Promise<{ sukses: true; id_alasan: string; alasan: AlasanKeluar[] }> {
  return cloud(
    "desktop_hr_exit_reasons_save",
    { draft },
    "/api/kepegawaian/offboarding/reasons",
    draft,
  );
}

// HRIS Fase 5: penilaian kinerja. Template cloud-only; pengaturan tersinkron.

export function muatTemplateKinerja(): Promise<DataTemplateKinerja> {
  return cloud(
    "desktop_hr_performance_templates",
    {},
    "/api/kepegawaian/performance/templates",
    {},
  );
}

/** Buat (tanpa `id_template`) atau ubah template beserta semua aspeknya. */
export function simpanTemplateKinerja(
  draft: TemplateDraft,
): Promise<{ sukses: true; id_template: string }> {
  return cloud(
    "desktop_hr_performance_template_save",
    { draft },
    "/api/kepegawaian/performance/template-save",
    draft,
  );
}

export function simpanPengaturanKinerja(
  draft: PengaturanKinerjaDraft,
): Promise<PengaturanKinerja> {
  return mutasi(
    "desktop_hr_performance_settings_save",
    { draft },
    "/api/kepegawaian/performance/settings",
    draft,
  );
}

/** Penilaian satu periode (`periode_jenis` + `periode_kunci`). */
export function muatDaftarKinerja(
  periodeJenis: string,
  periodeKunci: string,
): Promise<DaftarKinerja> {
  const draft = { periode_jenis: periodeJenis, periode_kunci: periodeKunci };
  return cloud(
    "desktop_hr_performance_list",
    { draft },
    "/api/kepegawaian/performance/query",
    draft,
  );
}

/** Riwayat penilaian satu pegawai (tab Kinerja di rincian pegawai). */
export function muatRiwayatKinerja(
  idKaryawan: string,
): Promise<RiwayatKinerja> {
  const draft = { id_karyawan: idKaryawan };
  return cloud(
    "desktop_hr_performance_list",
    { draft },
    "/api/kepegawaian/performance/query",
    draft,
  );
}

export function muatRincianKinerja(
  idPenilaian: string,
): Promise<RincianKinerja> {
  return cloud(
    "desktop_hr_performance_detail",
    { idPenilaian },
    "/api/kepegawaian/performance/detail",
    { id_penilaian: idPenilaian },
  );
}

/** Buat, Simpan, Muat ulang, atau Koreksi. */
export function simpanPenilaianKinerja(
  draft: PenilaianDraft,
): Promise<{ sukses: true; id_penilaian: string }> {
  return cloud(
    "desktop_hr_performance_save",
    { draft },
    "/api/kepegawaian/performance/save",
    draft,
  );
}

/** Ajukan, Kembalikan, Final, atau Batal. */
export function putuskanPenilaianKinerja(draft: {
  id_penilaian: string;
  jenis: JenisKeputusan;
  alasan?: string;
  rincian?: Record<string, string>;
}): Promise<{ sukses: true; id_penilaian: string; id_keputusan: string }> {
  return cloud(
    "desktop_hr_performance_decide",
    { draft },
    "/api/kepegawaian/performance/decide",
    draft,
  );
}

export function berlakukanKeluar(idKeluar: string) {
  return cloud(
    "desktop_hr_offboarding_apply",
    { idKeluar },
    "/api/kepegawaian/offboarding/apply",
    { id_keluar: idKeluar },
  );
}

export function batalkanKeluar(idKeluar: string, alasan: string) {
  return cloud(
    "desktop_hr_offboarding_cancel",
    { idKeluar, alasan },
    "/api/kepegawaian/offboarding/cancel",
    { id_keluar: idKeluar, alasan },
  );
}

// HRIS Fase 7a: rekrutmen, cloud-only.

export function muatLowongan(): Promise<DaftarLowongan> {
  return cloud(
    "desktop_hr_vacancies",
    {},
    "/api/kepegawaian/recruitment/vacancies/query",
    {},
  );
}

/** Aksi `simpan` (buat/ubah), `tutup`, atau `buka`. */
export function simpanLowongan(
  draft: LowonganDraft,
): Promise<{ sukses: true; id_lowongan: string }> {
  return cloud(
    "desktop_hr_vacancy_save",
    { draft },
    "/api/kepegawaian/recruitment/vacancies/save",
    draft,
  );
}

export function muatPelamar(
  idLowongan: string,
): Promise<{ pelamar: PelamarBaris[] }> {
  return cloud(
    "desktop_hr_applicants",
    { idLowongan },
    "/api/kepegawaian/recruitment/applicants/query",
    { id_lowongan: idLowongan, id_pelamar: "" },
  );
}

export function muatRincianPelamar(idPelamar: string): Promise<RincianPelamar> {
  return cloud(
    "desktop_hr_applicants",
    { idPelamar },
    "/api/kepegawaian/recruitment/applicants/query",
    { id_lowongan: "", id_pelamar: idPelamar },
  );
}

export function simpanPelamar(
  draft: PelamarDraft,
): Promise<{ sukses: true; id_pelamar: string; mungkin_ganda: boolean }> {
  return cloud(
    "desktop_hr_applicant_save",
    { draft },
    "/api/kepegawaian/recruitment/applicants/save",
    draft,
  );
}

/** Aksi `catat` atau `batal` (tahap terakhir, alasan wajib). */
export function simpanTahapPelamar(draft: TahapDraft) {
  return cloud<{ sukses: true }>(
    "desktop_hr_applicant_stage",
    { draft },
    "/api/kepegawaian/recruitment/applicants/stage",
    draft,
  );
}

export function ambilBerkasPelamar(id: string): Promise<IsiBerkasPelamar> {
  return cloud(
    "desktop_hr_applicant_file",
    { idBerkas: id },
    "/api/kepegawaian/recruitment/applicants/file/query",
    { id },
  );
}

export function tambahBerkasPelamar(draft: BerkasPelamarDraft) {
  return cloud<{ id_berkas: string }>(
    "desktop_hr_applicant_file_save",
    { draft: { aksi: "tambah", ...draft } },
    "/api/kepegawaian/recruitment/applicants/file",
    draft,
  );
}

export function hapusBerkasPelamar(id: string) {
  return cloud<{ sukses: true }>(
    "desktop_hr_applicant_file_save",
    { draft: { aksi: "hapus", id_berkas: id } },
    "/api/kepegawaian/recruitment/applicants/file",
    { id },
    "DELETE",
  );
}

export function hapusPelamar(idPelamar: string) {
  return cloud<{ sukses: true }>(
    "desktop_hr_applicant_delete",
    { idPelamar },
    "/api/kepegawaian/recruitment/applicants/delete",
    { id: idPelamar },
    "DELETE",
  );
}

/** Retensi pelamar; dijalankan runner setiap sesi (7c). */
export function bersihkanPelamar(): Promise<{ dihapus: number }> {
  return cloud(
    "desktop_hr_recruit_cleanup",
    {},
    "/api/kepegawaian/recruitment/cleanup",
    {},
  );
}

/**
 * Jadikan personil atau Lanjutkan (HRIS Fase 7b). Di Desktop personil dan
 * kontraknya masuk SQLite + outbox, jadi sync didorong sesudahnya.
 */
export function jadikanPersonil(draft: HireDraft): Promise<HasilHire> {
  return mutasi(
    "desktop_hr_applicant_hire",
    { draft },
    "/api/kepegawaian/recruitment/applicants/hire",
    draft,
  );
}

// HRIS Fase 7b: pelatihan, cloud-only.

export function muatPelatihan(tahun: string): Promise<DaftarPelatihan> {
  const query = { mode: "daftar", tahun } as const;
  return cloud(
    "desktop_hr_trainings",
    { query },
    "/api/kepegawaian/training/query",
    query,
  );
}

export function muatRincianPelatihan(
  idPelatihan: string,
): Promise<RincianPelatihan> {
  const query = { mode: "rincian", id_pelatihan: idPelatihan } as const;
  return cloud(
    "desktop_hr_trainings",
    { query },
    "/api/kepegawaian/training/query",
    query,
  );
}

export function muatRiwayatPelatihan(
  idKaryawan: string,
): Promise<RiwayatPelatihan> {
  const query = { mode: "riwayat", id_karyawan: idKaryawan } as const;
  return cloud(
    "desktop_hr_trainings",
    { query },
    "/api/kepegawaian/training/query",
    query,
  );
}

export function muatRekapPelatihan(
  saring: Pick<PelatihanQuery, "tahun" | "kelompok" | "unit">,
): Promise<RekapPelatihan> {
  const query = { mode: "rekap", ...saring } as const;
  return cloud(
    "desktop_hr_trainings",
    { query },
    "/api/kepegawaian/training/query",
    query,
  );
}

/** Aksi `simpan` (buat/ubah) atau `batal` (alasan wajib). */
export function simpanPelatihan(
  draft: PelatihanDraft,
): Promise<{ sukses: true; id_pelatihan?: string }> {
  return cloud(
    "desktop_hr_training_save",
    { draft },
    "/api/kepegawaian/training/save",
    draft,
  );
}

/** Aksi `tambah`, `lepas`, atau `hasil`. */
export function simpanPeserta(
  draft: PesertaDraft,
): Promise<{ sukses: true; id_peserta?: string }> {
  return cloud(
    "desktop_hr_training_participants_save",
    { draft },
    "/api/kepegawaian/training/participants",
    draft,
  );
}

/** Aksi `simpan`, `hapus`, `berkas_tambah`, atau `berkas_hapus`. */
export function simpanSertifikat(
  draft: SertifikatDraft,
): Promise<{ sukses: true; id_dokumen?: string; id_berkas?: string }> {
  return cloud(
    "desktop_hr_training_certificate_save",
    { draft },
    "/api/kepegawaian/training/certificate",
    draft,
  );
}

export function ambilBerkasSertifikat(
  id: string,
): Promise<IsiBerkasSertifikat> {
  return cloud(
    "desktop_hr_training_certificate_file",
    { idBerkas: id },
    "/api/kepegawaian/training/certificate/file/query",
    { id },
  );
}
