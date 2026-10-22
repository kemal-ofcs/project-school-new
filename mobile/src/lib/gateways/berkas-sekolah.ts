"use client";

import { requestWebApi } from "@/lib/client/api-client";
import { isDesktopRuntime } from "@/lib/runtime/app-runtime";
import { invokeDesktop } from "@/lib/runtime/desktop-commands";
import type { PmbFileContent, PmbFileMeta } from "@/types/pmb";

/**
 * Unggah, ganti, dan hapus berkas pendaftar dan siswa (v59). Kedua tabelnya
 * cloud-only, jadi Desktop/Mobile butuh koneksi seperti halaman PMB. Isi
 * berkas sudah dipadatkan `siapkanBerkas` sebelum sampai di sini.
 */

export interface BerkasKiriman {
  jenis: string;
  namaFile: string;
  mime: string;
  kontenBase64: string;
}

export async function simpanBerkasPendaftar(
  idPendaftar: string,
  berkas: BerkasKiriman,
): Promise<void> {
  if (isDesktopRuntime()) {
    await invokeDesktop("desktop_save_pmb_file", { idPendaftar, ...berkas });
    return;
  }
  await requestWebApi("/api/academic/pmb/files/save", "POST", {
    idPendaftar,
    ...berkas,
  });
}

export async function hapusBerkasPendaftar(idBerkas: string): Promise<void> {
  if (isDesktopRuntime()) {
    await invokeDesktop("desktop_delete_pmb_file", { idBerkas });
    return;
  }
  await requestWebApi("/api/academic/pmb/files/delete", "POST", { idBerkas });
}

export async function daftarBerkasSiswa(
  idSiswa: string,
): Promise<PmbFileMeta[]> {
  const { items } = isDesktopRuntime()
    ? await invokeDesktop<{ items: PmbFileMeta[] }>(
        "desktop_list_student_files",
        { idSiswa },
      )
    : await requestWebApi<{ items: PmbFileMeta[] }>(
        "/api/students/files/query",
        "POST",
        { idSiswa },
      );
  return items;
}

export async function getBerkasSiswa(
  idBerkas: string,
): Promise<PmbFileContent> {
  if (isDesktopRuntime()) {
    return invokeDesktop<PmbFileContent>("desktop_get_student_file", {
      idBerkas,
    });
  }
  const { berkas } = await requestWebApi<{ berkas: PmbFileContent }>(
    "/api/students/files/get",
    "POST",
    { idBerkas },
  );
  return berkas;
}

export async function simpanBerkasSiswa(
  idSiswa: string,
  berkas: BerkasKiriman,
): Promise<void> {
  if (isDesktopRuntime()) {
    await invokeDesktop("desktop_save_student_file", { idSiswa, ...berkas });
    return;
  }
  await requestWebApi("/api/students/files/save", "POST", {
    idSiswa,
    ...berkas,
  });
}

export async function hapusBerkasSiswa(idBerkas: string): Promise<void> {
  if (isDesktopRuntime()) {
    await invokeDesktop("desktop_delete_student_file", { idBerkas });
    return;
  }
  await requestWebApi("/api/students/files/delete", "POST", { idBerkas });
}
