import type { Metadata } from "next";
import { ProfilBelumLengkap } from "@/components/SiteChrome";
import { StatusTidakTerbaca } from "@/components/StatusData";
import { muatProfilSekolah } from "@/lib/server/school-data";

export const metadata: Metadata = {
  title: "Kontak",
};

export default async function HalamanKontak() {
  const hasil = await muatProfilSekolah();

  if (hasil.status !== "ok") {
    return (
      <main className="mx-auto max-w-3xl px-6 py-14">
        <h1 className="font-semibold text-3xl">Kontak</h1>
        <div className="mt-6">
          <StatusTidakTerbaca hasil={hasil} konteks="Informasi kontak" />
        </div>
      </main>
    );
  }

  const profil = hasil.data;
  const adaKontak = Boolean(profil.telepon || profil.email || profil.alamat);

  return (
    <main className="mx-auto max-w-3xl px-6 py-14">
      <h1 className="font-semibold text-3xl">Kontak</h1>

      {!adaKontak ? (
        <div className="mt-6">
          {/* Nomor telepon yang dikarang lebih buruk daripada tidak ada nomor:
              pengunjung akan meneleponnya. */}
          <ProfilBelumLengkap />
        </div>
      ) : (
        <div className="mt-8 space-y-6">
          {profil.alamat ? (
            <section>
              <h2 className="font-medium text-sm text-teks-lembut">Alamat</h2>
              <p className="mt-1 leading-relaxed">{profil.alamat}</p>
            </section>
          ) : null}
          {profil.telepon ? (
            <section>
              <h2 className="font-medium text-sm text-teks-lembut">Telepon</h2>
              <p className="mt-1">
                <a className="hover:text-aksen" href={`tel:${profil.telepon}`}>
                  {profil.telepon}
                </a>
              </p>
            </section>
          ) : null}
          {profil.email ? (
            <section>
              <h2 className="font-medium text-sm text-teks-lembut">Surel</h2>
              <p className="mt-1">
                <a className="hover:text-aksen" href={`mailto:${profil.email}`}>
                  {profil.email}
                </a>
              </p>
            </section>
          ) : null}
          {profil.situs ? (
            <section>
              <h2 className="font-medium text-sm text-teks-lembut">Situs</h2>
              <p className="mt-1">
                <a
                  className="hover:text-aksen"
                  href={profil.situs}
                  rel="noreferrer"
                  target="_blank"
                >
                  {profil.situs}
                </a>
              </p>
            </section>
          ) : null}
        </div>
      )}
    </main>
  );
}
