import type { Metadata } from "next";
import Link from "next/link";
import { StatusTidakTerbaca } from "@/components/StatusData";
import { muatGelombangAktif } from "@/lib/server/pmb-data";

export const metadata: Metadata = {
  title: "Pendaftaran Peserta Didik Baru",
};

/**
 * Jadwal gelombang tidak boleh dibekukan lima menit.
 *
 * `revalidate = 0` membatalkan warisan dari layout. Halaman ini memberitahu
 * orang apakah pendaftaran sedang dibuka; versi yang basi lima menit akan
 * mengirim orang ke formulir yang sudah ditutup, atau menyembunyikan gelombang
 * yang baru saja dibuka panitia.
 */
export const revalidate = 0;

const LANGKAH = [
  "Mengisi formulir pendaftaran secara daring.",
  "Mengunggah berkas persyaratan.",
  "Menunggu verifikasi berkas oleh panitia sekolah.",
  "Memeriksa status pendaftaran menggunakan nomor pendaftaran.",
] as const;

export default async function HalamanPmb() {
  const gelombang = await muatGelombangAktif();

  return (
    <main className="mx-auto max-w-3xl px-6 py-14">
      <h1 className="font-semibold text-3xl leading-tight">
        Pendaftaran Peserta Didik Baru
      </h1>

      <div className="mt-6">
        {gelombang.status !== "ok" ? (
          <StatusTidakTerbaca hasil={gelombang} konteks="Jadwal pendaftaran" />
        ) : gelombang.data ? (
          <div className="rounded-lg border border-aksen p-5">
            <p className="font-semibold text-lg">{gelombang.data.nama}</p>
            <p className="mt-1 text-sm text-teks-lembut">
              Tahun Ajaran {gelombang.data.tahunAjaran} · dibuka{" "}
              {gelombang.data.tanggalBuka} sampai {gelombang.data.tanggalTutup}
            </p>
            {gelombang.data.biayaPendaftaran > 0 ? (
              <p className="mt-2 text-sm text-teks-lembut">
                Biaya pendaftaran: Rp
                {gelombang.data.biayaPendaftaran.toLocaleString("id-ID")}{" "}
                (dibayarkan langsung di sekolah)
              </p>
            ) : null}
            <p className="mt-5">
              <Link
                className="inline-block rounded-md bg-aksen px-5 py-3 font-medium text-aksen-teks"
                href="/pmb/daftar"
              >
                Isi formulir pendaftaran
              </Link>
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-garis bg-latar-lembut p-5">
            <p className="font-medium">
              Belum ada gelombang pendaftaran yang dibuka.
            </p>
            <p className="mt-2 text-sm text-teks-lembut leading-relaxed">
              Jadwal gelombang berikutnya akan diumumkan di halaman ini. Untuk
              pertanyaan, silakan hubungi sekolah melalui{" "}
              <Link className="text-aksen hover:underline" href="/kontak">
                halaman kontak
              </Link>
              .
            </p>
          </div>
        )}
      </div>

      <section className="mt-10">
        <h2 className="font-semibold text-xl">Alur pendaftaran</h2>
        <ol className="mt-5 space-y-4">
          {LANGKAH.map((langkah, urutan) => (
            <li className="flex gap-4" key={langkah}>
              <span
                aria-hidden="true"
                className="flex size-7 shrink-0 items-center justify-center rounded-full bg-aksen font-medium text-aksen-teks text-sm"
              >
                {urutan + 1}
              </span>
              <span className="pt-0.5 leading-relaxed">{langkah}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-10 rounded-lg border border-garis p-5">
        <h2 className="font-semibold text-lg">Sudah mendaftar?</h2>
        <p className="mt-2 text-sm text-teks-lembut leading-relaxed">
          Periksa perkembangan berkas Anda dengan nomor pendaftaran di{" "}
          <Link className="text-aksen hover:underline" href="/pmb/status">
            halaman status pendaftaran
          </Link>
          .
        </p>
      </section>

      <section className="mt-10">
        <h2 className="font-semibold text-xl">Program yang dibuka</h2>
        <p className="mt-3 text-sm text-teks-lembut leading-relaxed">
          Daftar program keahlian beserta penjelasannya tersedia di{" "}
          <Link className="text-aksen hover:underline" href="/program">
            halaman Program Keahlian
          </Link>
          .
        </p>
      </section>
    </main>
  );
}
