import Link from "next/link";
import { ProfilBelumLengkap } from "@/components/SiteChrome";
import { StatusTidakTerbaca } from "@/components/StatusData";
import { muatProfilSekolah } from "@/lib/server/school-data";
import { namaTampil } from "@/lib/services/school-profile";

const PINTU_MASUK = [
  {
    href: "/pmb",
    judul: "Pendaftaran Siswa Baru",
    teks: "Informasi gelombang, syarat berkas, dan alur pendaftaran.",
  },
  {
    href: "/program",
    judul: "Program Keahlian",
    teks: "Jurusan yang dibuka dan penjelasan singkatnya.",
  },
  {
    href: "/kontak",
    judul: "Hubungi Sekolah",
    teks: "Alamat, nomor telepon, dan surel resmi.",
  },
] as const;

export default async function Beranda() {
  const hasil = await muatProfilSekolah();

  if (hasil.status !== "ok") {
    return (
      <main className="mx-auto max-w-5xl px-6 py-16">
        <StatusTidakTerbaca hasil={hasil} konteks="Informasi sekolah" />
      </main>
    );
  }

  const profil = hasil.data;
  const nama = namaTampil(profil);

  return (
    <main className="mx-auto max-w-5xl px-6 py-14">
      <section>
        <h1 className="font-semibold text-3xl leading-tight sm:text-4xl">
          {nama}
        </h1>
        {profil.namaCabang ? (
          <p className="mt-2 text-teks-lembut">{profil.namaCabang}</p>
        ) : null}
        {profil.alamat ? (
          <p className="mt-4 max-w-2xl text-base text-teks-lembut leading-relaxed">
            {profil.alamat}
          </p>
        ) : null}
        {profil.belumDikonfigurasi || !profil.namaSekolah ? (
          <div className="mt-6 max-w-2xl">
            <ProfilBelumLengkap />
          </div>
        ) : null}
      </section>

      <section className="mt-12">
        <h2 className="font-semibold text-xl">Mulai dari sini</h2>
        <ul className="mt-5 grid gap-4 sm:grid-cols-3">
          {PINTU_MASUK.map((pintu) => (
            <li key={pintu.href}>
              <Link
                className="block h-full rounded-lg border border-garis p-5 transition-colors hover:border-aksen"
                href={pintu.href}
              >
                <span className="font-medium">{pintu.judul}</span>
                <span className="mt-2 block text-sm text-teks-lembut leading-relaxed">
                  {pintu.teks}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-12 rounded-lg border border-garis bg-latar-lembut p-6">
        <h2 className="font-semibold text-lg">Portal Wali Murid</h2>
        <p className="mt-2 max-w-2xl text-sm text-teks-lembut leading-relaxed">
          Orang tua akan dapat memeriksa kehadiran anaknya di halaman ini
          menggunakan nomor induk siswa dan kode yang dikirim ke nomor WhatsApp
          wali yang terdaftar di sekolah. Fitur ini sedang disiapkan.
        </p>
      </section>
    </main>
  );
}
