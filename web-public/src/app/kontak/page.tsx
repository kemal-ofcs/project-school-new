import { Clock, Globe, Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import type { Metadata } from "next";
import { KepalaHalaman } from "@/components/KepalaHalaman";
import { MediaSosial } from "@/components/MediaSosial";
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

  const adaKontak = Boolean(
    alamat || telepon || email || whatsapp || konten["kontak.instagram"],
  );

  // Bersihkan format WhatsApp untuk URL
  const waClean = whatsapp ? whatsapp.replace(/\D/g, "") : null;

  const kartu = [
    alamat ? { ikon: MapPin, judul: "Alamat", isi: alamat } : null,
    jamKerja ? { ikon: Clock, judul: "Jam Layanan", isi: jamKerja } : null,
    telepon
      ? {
          ikon: Phone,
          judul: "Telepon Kantor",
          isi: telepon,
          href: `tel:${telepon}`,
        }
      : null,
    email
      ? { ikon: Mail, judul: "Email", isi: email, href: `mailto:${email}` }
      : null,
    profil.situs
      ? {
          ikon: Globe,
          judul: "Situs Resmi",
          isi: profil.situs,
          href: profil.situs,
          luar: true,
        }
      : null,
  ].filter((item) => item !== null);

  return (
    <main>
      <KepalaHalaman label="Pusat Informasi" judul="Hubungi Kami">
        Kami siap menjelaskan proses belajar dan penerimaan siswa baru.
      </KepalaHalaman>

      <div className="mx-auto max-w-4xl px-6 py-12 sm:py-16 space-y-10">
        {!adaKontak ? (
          <ProfilBelumLengkap />
        ) : (
          <>
            {/* WhatsApp jalur yang paling sering dipakai orang tua, jadi ia
                satu-satunya blok berwarna di halaman ini; hijau yang sama
                dengan tombol WhatsApp melayang di beranda. */}
            {whatsapp && waClean ? (
              <a
                className="muncul group flex flex-col gap-4 rounded-2xl bg-accent p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8 text-accent-foreground transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                href={`https://wa.me/${waClean}`}
                rel="noreferrer"
                target="_blank"
              >
                <span className="flex items-center gap-4">
                  <MessageCircle
                    aria-hidden="true"
                    className="size-8 shrink-0"
                  />
                  <span>
                    <span className="block font-bold text-lg">
                      Chat WhatsApp Humas
                    </span>
                    <span className="block text-sm opacity-90">{whatsapp}</span>
                  </span>
                </span>
                <span className="inline-flex min-h-11 items-center justify-center rounded-lg bg-accent-foreground/10 px-5 text-sm font-semibold">
                  Kirim pesan
                </span>
              </a>
            ) : null}

            {kartu.length > 0 ? (
              <div className="kartu-tengah sm:[--kolom:2]">
                {kartu.map((item) => {
                  const Ikon = item.ikon;
                  const isi = item.href ? (
                    <a
                      className="font-semibold text-foreground wrap-break-word underline-offset-4 hover:text-primary hover:underline"
                      href={item.href}
                      {...(item.luar
                        ? { target: "_blank", rel: "noreferrer" }
                        : {})}
                    >
                      {item.isi}
                    </a>
                  ) : (
                    <span className="text-foreground whitespace-pre-line">
                      {item.isi}
                    </span>
                  );
                  return (
                    <div
                      className="flex gap-4 rounded-2xl border border-border bg-card p-6"
                      key={item.judul}
                    >
                      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted text-primary">
                        <Ikon aria-hidden="true" className="size-5" />
                      </span>
                      <div className="min-w-0 space-y-1">
                        <h2 className="text-sm text-muted-foreground">
                          {item.judul}
                        </h2>
                        <p className="text-sm leading-relaxed">{isi}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}

            <MediaSosial konten={konten} className="justify-center" />
          </>
        )}
      </div>
    </main>
  );
}
