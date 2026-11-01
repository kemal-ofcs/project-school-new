import "server-only";

import { notFound } from "next/navigation";
import { muatKontenHalaman } from "@/lib/server/content-data";
import { muatPilihanPmb } from "@/lib/server/pmb-data";
import { type HasilMuat, muatProfilSekolah } from "@/lib/server/school-data";
import {
  daftarHalamanUnit,
  halamanKontenLingkup,
  type Lingkup,
  lingkupUnit,
  profilUnit,
  type TabKonten,
} from "@/lib/services/halaman-unit";
import type { SchoolProfile } from "@/lib/services/school-profile";

/** Konten satu tab CMS; gagal dibaca = kosong, bagian itu saja yang hilang. */
export async function muatKontenLingkup(
  lingkup: Lingkup,
  tab: TabKonten,
): Promise<Record<string, string>> {
  const hasil = await muatKontenHalaman(halamanKontenLingkup(lingkup, tab));
  return hasil.status === "ok" ? hasil.data : {};
}

export async function muatProfilLingkup(
  lingkup: Lingkup,
): Promise<HasilMuat<SchoolProfile>> {
  const hasil = await muatProfilSekolah();
  if (hasil.status !== "ok" || !lingkup.unit) return hasil;
  const [kontak, landing] = await Promise.all([
    muatKontenLingkup(lingkup, "kontak"),
    muatKontenLingkup(lingkup, "landing"),
  ]);
  return {
    status: "ok",
    data: profilUnit(hasil.data, lingkup.unit, kontak, landing),
  };
}

/**
 * Lingkup halaman di bawah `[unit]`. Alamat yang bukan unit aktif menjadi 404.
 * Daftar unit yang gagal dibaca sudah dijawab `[unit]/layout.tsx`, yang tidak
 * merender halamannya.
 */
export async function lingkupDariSlug(slug: string): Promise<Lingkup> {
  const pilihan = await muatPilihanPmb();
  const unit =
    pilihan.status === "ok"
      ? daftarHalamanUnit(pilihan.data.unit).find((u) => u.slug === slug)
      : null;
  if (!unit) notFound();
  return lingkupUnit(unit);
}
