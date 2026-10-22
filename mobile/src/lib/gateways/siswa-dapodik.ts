"use client";

import { requestWebApi } from "@/lib/client/api-client";
import { isDesktopRuntime } from "@/lib/runtime/app-runtime";
import { invokeDesktop } from "@/lib/runtime/desktop-commands";
import {
  type BarisDapodikSiswa,
  MAKS_ID_BACA_DAPODIK,
} from "@/lib/validations/siswa-dapodik";

/**
 * Data DAPODIK per siswa (v57). Tabelnya cloud-only, jadi Desktop/Mobile
 * butuh koneksi seperti halaman PMB.
 */

export interface SimpanDapodikSiswaInput {
  idSiswa: string;
  tempatLahir: string | null;
  tanggalLahir: string | null;
  sekolahAsal: string | null;
  data: Record<string, unknown>;
}

/** Dibaca per `MAKS_ID_BACA_DAPODIK` id, berapa pun jumlah siswanya. */
export async function daftarDapodikSiswa(
  ids: readonly string[],
): Promise<BarisDapodikSiswa[]> {
  const hasil: BarisDapodikSiswa[] = [];
  for (let i = 0; i < ids.length; i += MAKS_ID_BACA_DAPODIK) {
    const potong = ids.slice(i, i + MAKS_ID_BACA_DAPODIK);
    const { items } = isDesktopRuntime()
      ? await invokeDesktop<{ items: BarisDapodikSiswa[] }>(
          "desktop_list_student_dapodik",
          { ids: potong },
        )
      : await requestWebApi<{ items: BarisDapodikSiswa[] }>(
          "/api/students/dapodik/query",
          "POST",
          { ids: potong },
        );
    hasil.push(...items);
  }
  return hasil;
}

export async function simpanDapodikSiswa(
  input: SimpanDapodikSiswaInput,
): Promise<void> {
  if (isDesktopRuntime()) {
    await invokeDesktop("desktop_save_student_dapodik", { ...input });
    return;
  }
  await requestWebApi("/api/students/dapodik/save", "POST", input);
}

export async function kosongkanDapodikSiswa(idSiswa: string): Promise<void> {
  if (isDesktopRuntime()) {
    await invokeDesktop("desktop_clear_student_dapodik", { idSiswa });
    return;
  }
  await requestWebApi("/api/students/dapodik/clear", "POST", { idSiswa });
}
