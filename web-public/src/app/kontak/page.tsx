import type { Metadata } from "next";
import { ProfilBelumLengkap } from "@/components/SiteChrome";
import { StatusTidakTerbaca } from "@/components/StatusData";
import { muatKontenHalaman } from "@/lib/server/content-data";
import { muatProfilSekolah } from "@/lib/server/school-data";

export const metadata: Metadata = {
  title: "Kontak & Layanan",
  description:
    "Informasi kontak resmi, lokasi kampus, nomor WhatsApp layanan, dan jam operasional sekolah.",
};

export default async function HalamanKontak() {
  const [hasilProfil, hasilKonten] = await Promise.all([
    muatProfilSekolah(),
    muatKontenHalaman("kontak"),
  ]);

  if (hasilProfil.status !== "ok") {
    return (
      <main className="mx-auto max-w-4xl px-6 py-14">
        <h1 className="font-semibold text-3xl">Kontak</h1>
        <div className="mt-6">
          <StatusTidakTerbaca hasil={hasilProfil} konteks="Informasi kontak" />
        </div>
      </main>
    );
  }

  const profil = hasilProfil.data;
  const konten = hasilKonten.status === "ok" ? hasilKonten.data : {};

  const alamat = profil.alamat || konten["kontak.alamat"];
  const telepon = profil.telepon || konten["kontak.telepon"];
  const email = profil.email || konten["kontak.email"];
  const whatsapp = konten["kontak.whatsapp"];
  const jamKerja = konten["kontak.jam_kerja"];

  const adaKontak = Boolean(alamat || telepon || email || whatsapp);

  // Bersihkan format WhatsApp untuk URL
  const waClean = whatsapp ? whatsapp.replace(/\D/g, "") : null;

  return (
    <main className="mx-auto max-w-4xl px-6 py-14 space-y-10">
      <div className="border-b border-garis pb-6">
        <p className="text-xs font-bold uppercase tracking-widest text-aksen">
          Pusat Informasi
        </p>
        <h1 className="mt-1 font-extrabold text-3xl sm:text-4xl tracking-tight text-teks-utama">
          Hubungi Kami
        </h1>
        <p className="mt-2 text-sm text-teks-lembut max-w-xl">
          Kami siap membantu memberikan penjelasan seputar proses belajar,
          penerimaan siswa baru, atau kemitraan industri.
        </p>
      </div>

      {!adaKontak ? (
        <div className="mt-6">
          <ProfilBelumLengkap />
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2">
          {/* Alamat Kampus */}
          {alamat ? (
            <div className="rounded-3xl border border-garis bg-kartu p-6 space-y-2 shadow-sm">
              <h2 className="text-xs font-bold uppercase tracking-wider text-aksen">
                Alamat Kampus
              </h2>
              <p className="text-sm leading-relaxed text-teks-utama">
                {alamat}
              </p>
            </div>
          ) : null}

          {/* Jam Layanan */}
          {jamKerja ? (
            <div className="rounded-3xl border border-garis bg-kartu p-6 space-y-2 shadow-sm">
              <h2 className="text-xs font-bold uppercase tracking-wider text-aksen">
                Jam Operasional & Layanan
              </h2>
              <p className="text-sm leading-relaxed text-teks-utama">
                {jamKerja}
              </p>
            </div>
          ) : null}

          {/* Telepon Kantor */}
          {telepon ? (
            <div className="rounded-3xl border border-garis bg-kartu p-6 space-y-2 shadow-sm">
              <h2 className="text-xs font-bold uppercase tracking-wider text-aksen">
                Telepon Kantor
              </h2>
              <p className="text-sm">
                <a
                  className="font-semibold text-teks-utama hover:text-aksen transition"
                  href={`tel:${telepon}`}
                >
                  {telepon}
                </a>
              </p>
            </div>
          ) : null}

          {/* WhatsApp Info */}
          {whatsapp ? (
            <div className="rounded-3xl border border-garis bg-kartu p-6 space-y-2 shadow-sm">
              <h2 className="text-xs font-bold uppercase tracking-wider text-aksen">
                WhatsApp Humas & Info
              </h2>
              <p className="text-sm">
                <a
                  className="font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
                  href={`https://wa.me/${waClean}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {whatsapp} ↗
                </a>
              </p>
            </div>
          ) : null}

          {/* Email Resmi */}
          {email ? (
            <div className="rounded-3xl border border-garis bg-kartu p-6 space-y-2 shadow-sm">
              <h2 className="text-xs font-bold uppercase tracking-wider text-aksen">
                Email Resmi
              </h2>
              <p className="text-sm">
                <a
                  className="font-semibold text-teks-utama hover:text-aksen transition"
                  href={`mailto:${email}`}
                >
                  {email}
                </a>
              </p>
            </div>
          ) : null}

          {/* Situs Web */}
          {profil.situs ? (
            <div className="rounded-3xl border border-garis bg-kartu p-6 space-y-2 shadow-sm">
              <h2 className="text-xs font-bold uppercase tracking-wider text-aksen">
                Situs Resmi
              </h2>
              <p className="text-sm">
                <a
                  className="font-semibold text-teks-utama hover:text-aksen transition"
                  href={profil.situs}
                  target="_blank"
                  rel="noreferrer"
                >
                  {profil.situs} ↗
                </a>
              </p>
            </div>
          ) : null}
        </div>
      )}
    </main>
  );
}
