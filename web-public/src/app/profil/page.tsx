import type { Metadata } from "next";
import { KepalaHalaman } from "@/components/KepalaHalaman";
import { ProfilBelumLengkap } from "@/components/SiteChrome";
import { StatusTidakTerbaca } from "@/components/StatusData";
import { KataMuncul } from "@/components/visual/KataMuncul";
import { muatKontenHalaman } from "@/lib/server/content-data";
import { muatProfilSekolah } from "@/lib/server/school-data";
import { namaTampil } from "@/lib/services/school-profile";
import { pecahButir } from "@/lib/teks";

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

  const butirMisi = misi ? pecahButir(misi) : [];

  return (
    <main>
      <KepalaHalaman
        label="Tentang Lembaga"
        judul={`Profil ${namaTampil(profil)}`}
      />

      <div className="mx-auto max-w-4xl px-6 py-12 sm:py-16 space-y-16">
        {/* Visi — dari CMS saja; bagian yang belum diisi disembunyikan, versi
            sebelumnya menambalnya dengan kalimat contoh yang sama di situs
            setiap sekolah. Visi adalah satu-satunya blok navy di halaman ini:
            ia pernyataan paling penting, jadi ia yang menjadi titik fokus. */}
        {visi ? (
          <section className="muncul rounded-2xl bg-primary px-6 py-10 sm:px-12 sm:py-14 text-primary-foreground">
            <h2 className="text-sm font-semibold opacity-80">Visi Sekolah</h2>
            <p className="mt-4 text-xl sm:text-2xl font-semibold leading-snug whitespace-pre-line text-balance">
              {visi}
            </p>
          </section>
        ) : null}

        {butirMisi.length > 0 ? (
          <section className="muncul">
            <h2 className="font-bold text-2xl text-foreground">
              <KataMuncul teks="Misi Sekolah" />
            </h2>
            {butirMisi.length === 1 ? (
              <p className="mt-6 leading-relaxed text-muted-foreground whitespace-pre-line">
                {butirMisi[0]}
              </p>
            ) : (
              <ol className="mt-6 divide-y divide-border border-y border-border">
                {butirMisi.map((butir, i) => (
                  <li className="flex gap-5 py-5" key={`${i}-${butir}`}>
                    <span className="w-8 shrink-0 font-extrabold text-2xl leading-none tabular-nums text-secondary">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <p className="leading-relaxed text-foreground">{butir}</p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        ) : null}

        {/* Sambutan sengaja tanpa kotak: kutipan yang berdiri di latar
            halaman membedakannya dari blok visi dan daftar misi di atasnya. */}
        {sambutan ? (
          <section className="muncul relative sm:pl-16">
            <span
              aria-hidden="true"
              className="absolute -top-6 left-0 hidden select-none font-serif text-8xl leading-none text-primary/15 sm:block"
            >
              &ldquo;
            </span>
            <h2 className="text-sm font-semibold text-primary">
              Sambutan {profil.jabatanPimpinan || "Kepala Sekolah"}
            </h2>
            <blockquote className="mt-4 text-lg sm:text-xl leading-relaxed text-foreground whitespace-pre-line">
              {sambutan}
            </blockquote>
            {profil.namaPimpinan ? (
              <p className="mt-6 font-bold text-foreground">
                {profil.namaPimpinan}
                {profil.jabatanPimpinan ? (
                  <span className="block text-sm font-normal text-muted-foreground">
                    {profil.jabatanPimpinan}
                  </span>
                ) : null}
              </p>
            ) : null}
          </section>
        ) : null}

        {sejarah ? (
          <section className="muncul grid gap-4 md:grid-cols-[12rem_1fr] md:gap-10">
            <h2 className="font-bold text-2xl text-foreground">
              <KataMuncul teks="Sejarah Singkat" />
            </h2>
            <p className="leading-relaxed text-muted-foreground whitespace-pre-line">
              {sejarah}
            </p>
          </section>
        ) : null}

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
