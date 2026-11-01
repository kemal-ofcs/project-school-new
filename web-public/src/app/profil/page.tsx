import type { Metadata } from "next";
import { BlokProfil } from "@/components/BlokProfil";
import { KepalaHalaman } from "@/components/KepalaHalaman";
import { ProfilBelumLengkap } from "@/components/SiteChrome";
import { StatusTidakTerbaca } from "@/components/StatusData";
import { KataMuncul } from "@/components/visual/KataMuncul";
import { muatKontenHalaman } from "@/lib/server/content-data";
import { muatProfilSekolah } from "@/lib/server/school-data";
import { namaTampil } from "@/lib/services/school-profile";

export const metadata: Metadata = {
  title: "Profil Sekolah",
  description:
    "Profil lengkap, visi, misi, sejarah, serta sambutan pimpinan sekolah.",
};

export default async function HalamanProfil() {
  const [hasilProfil, hasilKonten] = await Promise.all([
    muatProfilSekolah(),
    muatKontenHalaman("profil"),
  ]);

  if (hasilProfil.status !== "ok") {
    return (
      <main className="mx-auto max-w-4xl px-6 py-14">
        <h1 className="font-semibold text-3xl">Profil</h1>
        <div className="mt-6">
          <StatusTidakTerbaca hasil={hasilProfil} konteks="Profil sekolah" />
        </div>
      </main>
    );
  }

  const profil = hasilProfil.data;
  const konten = hasilKonten.status === "ok" ? hasilKonten.data : {};

  const baris = [
    { label: "Nama sekolah", nilai: profil.namaSekolah },
    { label: "Unit / Cabang", nilai: profil.namaCabang },
    { label: "Alamat Lengkap", nilai: profil.alamat },
    { label: "Telepon Kantor", nilai: profil.telepon },
    { label: "Email Resmi", nilai: profil.email },
    { label: "Situs Web", nilai: profil.situs },
    { label: profil.jabatanPimpinan ?? "Pimpinan", nilai: profil.namaPimpinan },
  ].filter((item) => item.nilai !== null);

  return (
    <main>
      <KepalaHalaman
        label="Tentang Lembaga"
        judul={`Profil ${namaTampil(profil)}`}
      />

      <div className="mx-auto max-w-4xl px-6 py-12 sm:py-16 space-y-16">
        <BlokProfil
          jabatanPimpinan={profil.jabatanPimpinan || "Kepala Sekolah"}
          misi={konten["profil.misi"]}
          namaPimpinan={profil.namaPimpinan}
          sambutan={konten["profil.sambutan"]}
          sebutan="Sekolah"
          sejarah={konten["profil.sejarah"]}
          visi={konten["profil.visi"]}
        />

        <section className="muncul space-y-6">
          <h2 className="font-bold text-2xl text-foreground">
            <KataMuncul teks="Identitas & Informasi Resmi" />
          </h2>
          {baris.length === 0 ? (
            <ProfilBelumLengkap />
          ) : (
            <dl className="rounded-2xl border border-border bg-card divide-y divide-border overflow-hidden">
              {baris.map((item) => (
                <div
                  className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-4 px-6 py-4"
                  key={item.label}
                >
                  <dt className="text-sm text-muted-foreground">
                    {item.label}
                  </dt>
                  <dd className="sm:col-span-2 text-sm font-medium text-foreground wrap-break-word">
                    {item.nilai}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </section>
      </div>
    </main>
  );
}
