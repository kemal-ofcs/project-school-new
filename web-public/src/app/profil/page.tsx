import type { Metadata } from "next";
import { ProfilBelumLengkap } from "@/components/SiteChrome";
import { StatusTidakTerbaca } from "@/components/StatusData";
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

  const visi = konten["profil.visi"];
  const misi = konten["profil.misi"];
  const sejarah = konten["profil.sejarah"];
  const sambutan = konten["profil.sambutan"];

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
    <main className="mx-auto max-w-4xl px-6 py-14 space-y-12">
      {/* Header Profil */}
      <div className="border-b border-garis pb-6">
        <p className="text-xs font-bold uppercase tracking-widest text-aksen">
          Tentang Lembaga
        </p>
        <h1 className="mt-1 font-extrabold text-3xl sm:text-4xl tracking-tight text-teks-utama">
          Profil {namaTampil(profil)}
        </h1>
      </div>

      {/* Sambutan Pimpinan */}
      {sambutan ? (
        <section className="rounded-3xl border border-garis bg-kartu p-6 sm:p-8 space-y-3 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-aksen">
            Sambutan {profil.jabatanPimpinan || "Kepala Sekolah"}
          </p>
          <p className="text-sm sm:text-base leading-relaxed text-teks-utama italic whitespace-pre-line">
            "{sambutan}"
          </p>
          {profil.namaPimpinan ? (
            <p className="font-bold text-sm text-teks-utama pt-2">
              — {profil.namaPimpinan}
            </p>
          ) : null}
        </section>
      ) : null}

      {/* Visi & Misi */}
      <section className="grid gap-8 sm:grid-cols-2">
        <div className="rounded-3xl border border-garis bg-kartu p-6 sm:p-8 space-y-3 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-xl bg-aksen/15 text-aksen font-bold text-sm">
              V
            </span>
            <h2 className="font-bold text-lg text-teks-utama">Visi Sekolah</h2>
          </div>
          <p className="text-sm leading-relaxed text-teks-lembut whitespace-pre-line">
            {visi ||
              "Mewujudkan generasi unggul, berakhlak mulia, dan berdaya saing global."}
          </p>
        </div>

        <div className="rounded-3xl border border-garis bg-kartu p-6 sm:p-8 space-y-3 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-xl bg-aksen/15 text-aksen font-bold text-sm">
              M
            </span>
            <h2 className="font-bold text-lg text-teks-utama">Misi Sekolah</h2>
          </div>
          <div className="text-sm leading-relaxed text-teks-lembut whitespace-pre-line space-y-1">
            {misi ||
              "Menyelenggarakan pendidikan berkualitas dan berintegritas tinggi."}
          </div>
        </div>
      </section>

      {/* Sejarah Singkat */}
      {sejarah ? (
        <section className="rounded-3xl border border-garis bg-kartu p-6 sm:p-8 space-y-3 shadow-sm">
          <h2 className="font-bold text-xl text-teks-utama">Sejarah Singkat</h2>
          <p className="text-sm sm:text-base leading-relaxed text-teks-lembut whitespace-pre-line">
            {sejarah}
          </p>
        </section>
      ) : null}

      {/* Identitas Resmi Sekolah */}
      <section className="space-y-4">
        <h2 className="font-bold text-xl text-teks-utama">
          Identitas & Informasi Resmi
        </h2>
        {baris.length === 0 ? (
          <div className="mt-4">
            <ProfilBelumLengkap />
          </div>
        ) : (
          <dl className="rounded-2xl border border-garis bg-kartu divide-y divide-garis overflow-hidden">
            {baris.map((item) => (
              <div
                className="grid grid-cols-1 sm:grid-cols-3 gap-2 px-6 py-4"
                key={item.label}
              >
                <dt className="text-xs font-semibold uppercase tracking-wider text-teks-lembut">
                  {item.label}
                </dt>
                <dd className="sm:col-span-2 text-sm font-medium text-teks-utama">
                  {item.nilai}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </section>
    </main>
  );
}
