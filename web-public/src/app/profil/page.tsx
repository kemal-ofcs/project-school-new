import type { Metadata } from "next";
import { ProfilBelumLengkap } from "@/components/SiteChrome";
import { StatusTidakTerbaca } from "@/components/StatusData";
import { muatProfilSekolah } from "@/lib/server/school-data";
import { namaTampil } from "@/lib/services/school-profile";

export const metadata: Metadata = {
  title: "Profil",
};

/**
 * Seluruh isi halaman ini berasal dari `company_profile` — satu baris yang
 * disunting administrator lewat menu Pengaturan. Tidak ada teks profil yang
 * ditulis di dalam kode: sekolah yang memakai template ini akan mengisi
 * namanya sendiri, dan deskripsi yang dikarang di sini akan salah untuk semua
 * kecuali satu.
 */
export default async function HalamanProfil() {
  const hasil = await muatProfilSekolah();

  if (hasil.status !== "ok") {
    return (
      <main className="mx-auto max-w-3xl px-6 py-14">
        <h1 className="font-semibold text-3xl">Profil</h1>
        <div className="mt-6">
          <StatusTidakTerbaca hasil={hasil} konteks="Profil sekolah" />
        </div>
      </main>
    );
  }

  const profil = hasil.data;
  const baris = [
    { label: "Nama sekolah", nilai: profil.namaSekolah },
    { label: "Unit", nilai: profil.namaCabang },
    { label: "Alamat", nilai: profil.alamat },
    { label: "Telepon", nilai: profil.telepon },
    { label: "Surel", nilai: profil.email },
    { label: "Situs", nilai: profil.situs },
    { label: profil.jabatanPimpinan ?? "Pimpinan", nilai: profil.namaPimpinan },
  ].filter((item) => item.nilai !== null);

  return (
    <main className="mx-auto max-w-3xl px-6 py-14">
      <h1 className="font-semibold text-3xl">Profil {namaTampil(profil)}</h1>

      {baris.length === 0 ? (
        <div className="mt-6">
          <ProfilBelumLengkap />
        </div>
      ) : (
        <dl className="mt-8 divide-y divide-garis border-garis border-t border-b">
          {baris.map((item) => (
            <div
              className="grid gap-1 py-4 sm:grid-cols-3 sm:gap-4"
              key={item.label}
            >
              <dt className="text-sm text-teks-lembut">{item.label}</dt>
              <dd className="sm:col-span-2">{item.nilai}</dd>
            </div>
          ))}
        </dl>
      )}
    </main>
  );
}
