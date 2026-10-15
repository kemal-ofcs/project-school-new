import "server-only";

import { cache } from "react";
import type { RekeningPmb } from "@/components/pmb/InfoBayarPmb";
import { getPageContent } from "@/lib/server/content-data";
import { getReadyPublicDatabase } from "@/lib/server/db";
import { type HasilMuat, petakanKegagalan } from "@/lib/server/school-data";
import { type GelombangAktif, readGelombangAktif } from "@/lib/services/pmb";

/**
 * Pembungkus koneksi untuk pembaca PMB.
 *
 * Pola yang sama dengan `school-data.ts`: logika murni yang menerima `Client`
 * tinggal di `services/` tanpa penanda `server-only` sehingga bisa diuji
 * terhadap SQLite sungguhan, dan modul yang membuka koneksi ada di sini.
 *
 * Hanya PEMBACAAN yang dibungkus `cache()`. Penulisan tidak pernah — sebuah
 * pendaftaran yang di-cache berarti dua permintaan berbeda berbagi satu hasil,
 * dan pendaftar kedua akan menerima nomor pendaftaran milik orang lain.
 */
export const getGelombangAktif = cache(
  async (): Promise<GelombangAktif | null> => {
    return readGelombangAktif(await getReadyPublicDatabase());
  },
);

/**
 * Bentuk yang membedakan "tidak ada gelombang" dari "tidak bisa dibaca".
 *
 * `null` di dalam `status: "ok"` berarti sekolah memang belum membuka
 * gelombang — keadaan yang sah dan punya layarnya sendiri. `status: "gagal"`
 * berarti pertanyaannya tidak terjawab. Menggabungkan keduanya membuat
 * gangguan database tampak seperti pendaftaran yang belum dibuka, dan calon
 * pendaftar akan berhenti mencoba.
 */
export async function muatGelombangAktif(): Promise<
  HasilMuat<GelombangAktif | null>
> {
  try {
    return { status: "ok", data: await getGelombangAktif() };
  } catch (error) {
    console.error("[web-public] gagal membaca gelombang PMB:", error);
    return petakanKegagalan(error);
  }
}

export type { GelombangAktif };

/**
 * Rekening biaya pendaftaran dari CMS halaman `landing`. Gagal dibaca = kosong:
 * blok bayar tetap tampil dengan instruksi bayar di loket.
 */
export async function muatRekeningPmb(): Promise<RekeningPmb> {
  try {
    const konten = await getPageContent("landing");
    return {
      bank: konten["landing.pmb_bayar_bank"],
      nomor: konten["landing.pmb_bayar_rekening"],
      atasNama: konten["landing.pmb_bayar_atas_nama"],
      instruksi: konten["landing.pmb_bayar_instruksi"],
    };
  } catch (error) {
    console.error("[web-public] gagal membaca rekening PMB:", error);
    return {};
  }
}
