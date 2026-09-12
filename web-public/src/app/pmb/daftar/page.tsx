import type { Metadata } from "next";
import Link from "next/link";
import { StatusTidakTerbaca } from "@/components/StatusData";
import { muatGelombangAktif } from "@/lib/server/pmb-data";
import { muatProgramStudi } from "@/lib/server/school-data";
import { FormPendaftaran } from "./FormPendaftaran";

export const metadata: Metadata = {
  title: "Formulir Pendaftaran",
};

/**
 * Halaman pendaftaran TIDAK di-cache.
 *
 * `revalidate = 0` membatalkan warisan 300 detik dari layout. Alasannya
 * langsung: halaman ini menampilkan apakah gelombang sedang dibuka dan berapa
 * kuotanya. Versi yang dibekukan lima menit akan terus menerima pendaftaran
 * setelah gelombangnya ditutup — dan orang yang mengisinya baru tahu setelah
 * seluruh formulir selesai dan berkasnya terunggah.
 */
export const revalidate = 0;

export default async function HalamanDaftar() {
  const [gelombang, program] = await Promise.all([
    muatGelombangAktif(),
    muatProgramStudi(),
  ]);

  if (gelombang.status !== "ok") {
    return (
      <main className="mx-auto max-w-3xl px-6 py-14">
        <h1 className="font-semibold text-3xl">Formulir Pendaftaran</h1>
        <div className="mt-6">
          <StatusTidakTerbaca
            hasil={gelombang}
            konteks="Formulir pendaftaran"
          />
        </div>
      </main>
    );
  }

  if (!gelombang.data) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-14">
        <h1 className="font-semibold text-3xl">Formulir Pendaftaran</h1>
        <div className="mt-6 rounded-lg border border-garis bg-latar-lembut p-5">
          <p className="font-medium">
            Belum ada gelombang pendaftaran yang dibuka.
          </p>
          <p className="mt-2 text-sm text-teks-lembut leading-relaxed">
            Jadwal gelombang berikutnya akan diumumkan di halaman{" "}
            <Link className="text-aksen hover:underline" href="/pmb">
              Pendaftaran
            </Link>
            .
          </p>
        </div>
      </main>
    );
  }

  const aktif = gelombang.data;
  // Daftar jurusan hanyalah pilihan bantu pada formulir. Bila tidak terbaca,
  // formulirnya tetap tampil tanpa pilihan itu — memblokir pendaftaran karena
  // daftar opsional gagal dimuat jauh lebih merugikan daripada membiarkan satu
  // isian kosong yang bisa dilengkapi panitia.
  const jurusan =
    program.status === "ok" ? program.data.map((item) => item.nama) : [];

  return (
    <main className="mx-auto max-w-3xl px-6 py-14">
      <h1 className="font-semibold text-3xl">Formulir Pendaftaran</h1>
      <p className="mt-2 text-teks-lembut">
        {aktif.nama} · Tahun Ajaran {aktif.tahunAjaran}
      </p>
      <p className="mt-1 text-sm text-teks-lembut">
        Dibuka sampai {aktif.tanggalTutup}
      </p>

      <div className="mt-10">
        <FormPendaftaran jurusan={jurusan} />
      </div>
    </main>
  );
}
