"use client";

import { requestWebApi } from "@/lib/client/api-client";
import { isDesktopRuntime } from "@/lib/runtime/app-runtime";
import { invokeDesktop } from "@/lib/runtime/desktop-commands";
import type {
  HariSekolah,
  JenisNilaiDraft,
} from "@/lib/validations/nilai-akhir";
import type {
  BahanErapor,
  KonfigurasiNilai,
  PenilaianDetail,
  PenilaianDraft,
  PenilaianFilter,
  PenilaianItem,
  RekapNilaiAkhir,
  SimpanNilaiDraft,
} from "@/types/grades";

export type {
  BahanErapor,
  JenisNilaiItem,
  JenisPenilaian,
  KonfigurasiNilai,
  NilaiSiswaItem,
  PenilaianDetail,
  PenilaianDraft,
  PenilaianFilter,
  PenilaianItem,
  RekapNilaiAkhir,
  Semester,
  SimpanNilaiDraft,
} from "@/types/grades";

/**
 * Gateway modul nilai.
 *
 * Berbeda dari gateway PMB: TIDAK ada penutupan khusus Mobile di sini. Kedua
 * tabelnya ikut sinkronisasi dan command Rust-nya menulis ke SQLite lokal,
 * sehingga fitur ini bekerja penuh tanpa jaringan — di Desktop maupun Mobile.
 * Guru menilai di kelas, dan kelas tidak selalu punya sinyal.
 *
 * Command-nya sampai ke Mobile lewat `commands.rs` dan `grades.rs` yang ikut
 * `sync-rust-modules.ts`; yang tersisa untuk Mobile hanyalah tiga berkas
 * pendaftaran dan halamannya (Fase 6.2).
 */

export async function daftarPenilaian(
  filter: PenilaianFilter,
): Promise<{ items: PenilaianItem[] }> {
  if (isDesktopRuntime()) {
    return invokeDesktop<{ items: PenilaianItem[] }>(
      "desktop_list_assessments",
      {
        idTahunAjaran: filter.id_tahun_ajaran,
        semester: filter.semester,
        idRombel: filter.id_rombel || null,
        idMapel: filter.id_mapel || null,
        jenis: filter.jenis || null,
      },
    );
  }
  return requestWebApi<{ items: PenilaianItem[] }>(
    "/api/academic/grades/query",
    "POST",
    filter,
  );
}

export async function getPenilaian(
  idPenilaian: string,
): Promise<PenilaianDetail> {
  if (isDesktopRuntime()) {
    return invokeDesktop<PenilaianDetail>("desktop_get_assessment", {
      idPenilaian,
    });
  }
  return requestWebApi<PenilaianDetail>("/api/academic/grades/get", "POST", {
    idPenilaian,
  });
}

export async function simpanPenilaian(
  draft: PenilaianDraft,
): Promise<{ id_penilaian?: string; idPenilaian?: string }> {
  if (isDesktopRuntime()) {
    return invokeDesktop<{ id_penilaian: string }>("desktop_save_assessment", {
      draft,
    });
  }
  return requestWebApi<{ idPenilaian: string }>(
    "/api/academic/grades/save",
    "POST",
    draft,
  );
}

/**
 * Simpan skor satu kelas sekaligus.
 *
 * `skor: null` berarti BELUM DINILAI dan disimpan apa adanya — bukan dilewati,
 * bukan diubah menjadi nol. Guru yang mengosongkan kembali sebuah nilai berhak
 * mengembalikan anak itu ke keadaan belum dinilai.
 */
export async function simpanNilai(
  draft: SimpanNilaiDraft,
): Promise<{ tersimpan: number }> {
  if (isDesktopRuntime()) {
    return invokeDesktop<{ tersimpan: number }>("desktop_save_scores", {
      draft,
    });
  }
  return requestWebApi<{ tersimpan: number }>(
    "/api/academic/grades/scores",
    "POST",
    draft,
  );
}

export async function hapusPenilaian(idPenilaian: string): Promise<void> {
  if (isDesktopRuntime()) {
    await invokeDesktop("desktop_delete_assessment", { idPenilaian });
    return;
  }
  await requestWebApi("/api/academic/grades/delete", "POST", { idPenilaian });
}

// ── Nilai akhir (N2a) ───────────────────────────────────────────────────────
// Command `desktop_grade_*` terdaftar di Desktop DAN Mobile (`nilai_akhir.rs`
// disalin `sync-rust-modules.ts`), jadi satu cabang `isDesktopRuntime()`.

async function panggil<T>(
  command: string,
  args: Record<string, unknown>,
  url: string,
): Promise<T> {
  if (isDesktopRuntime()) return invokeDesktop<T>(command, args);
  return requestWebApi<T>(url, "POST", args);
}

export function getKonfigurasiNilai(): Promise<KonfigurasiNilai> {
  return panggil("desktop_grade_config", {}, "/api/academic/grades/config");
}

export function simpanJenisNilai(
  draft: JenisNilaiDraft,
): Promise<{ sukses: boolean; id_jenis: string }> {
  if (isDesktopRuntime()) {
    return invokeDesktop("desktop_grade_save_type", { draft });
  }
  return requestWebApi("/api/academic/grades/save-type", "POST", draft);
}

export function hapusJenisNilai(idJenis: string): Promise<{ sukses: boolean }> {
  return panggil(
    "desktop_grade_delete_type",
    { idJenis },
    "/api/academic/grades/delete-type",
  );
}

export function simpanBobotNilai(
  bobotKehadiran: number,
  items: Array<{ id_jenis: string; bobot: number }>,
): Promise<{ sukses: boolean }> {
  return panggil(
    "desktop_grade_save_weights",
    { bobotKehadiran, items },
    "/api/academic/grades/save-weights",
  );
}

export function simpanHariSekolah(
  hariSekolah: HariSekolah,
): Promise<{ sukses: boolean; hari_sekolah: HariSekolah }> {
  return panggil(
    "desktop_grade_save_school_days",
    { hariSekolah },
    "/api/academic/grades/save-school-days",
  );
}

export function getRekapNilaiAkhir(
  idTahunAjaran: string,
  semester: string,
  idRombel: string,
  idMapel: string,
): Promise<RekapNilaiAkhir> {
  return panggil(
    "desktop_grade_recap",
    { idTahunAjaran, semester, idRombel, idMapel },
    "/api/academic/grades/recap",
  );
}

/** Bahan ekspor e-Rapor satu rombel × semester (N3). */
export function getBahanErapor(
  idTahunAjaran: string,
  semester: string,
  idRombel: string,
): Promise<BahanErapor> {
  return panggil(
    "desktop_grade_erapor",
    { idTahunAjaran, semester, idRombel },
    "/api/academic/grades/erapor",
  );
}
