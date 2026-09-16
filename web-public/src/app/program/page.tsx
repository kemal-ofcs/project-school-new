import type { Metadata } from "next";
import { DaftarKosong, StatusTidakTerbaca } from "@/components/StatusData";
import { muatKontenHalaman } from "@/lib/server/content-data";
import { muatProgramStudi } from "@/lib/server/school-data";

export const metadata: Metadata = {
  title: "Program Keahlian",
};

/**
 * Daftar jurusan dibaca dari `akademik_jurusan` — tabel yang sama yang dipakai
 * sekolah untuk menempatkan siswanya ke rombel.
 *
 * Alternatifnya adalah menulis daftar jurusan sebagai teks di dalam kode
 * halaman ini. Itu terlihat lebih sederhana sampai sekolah membuka jurusan
 * baru: panel admin akan menerima siswanya, sementara situs publik tetap
 * memberitahu calon pendaftar bahwa jurusan itu tidak ada.
 */
export default async function HalamanProgram() {
  // Halaman ini menggabungkan DUA sumber, dan pembagiannya disengaja:
  // daftar jurusannya data master (`akademik_jurusan`), sedangkan ketiga
  // ringkasan naratif di bawah ini teks pemasaran yang disunting admin lewat
  // menu Konten → Program & Fasilitas.
  //
  // Ketiga kunci itu sudah bisa disunting sejak CMS-nya lahir, tetapi halaman
  // ini belum pernah membacanya: admin menyuntingnya, menekan Simpan, dan
  // situs publik tidak berubah sedikit pun — tanpa pesan kesalahan apa pun
  // yang menjelaskan kenapa.
  const [hasil, hasilKonten] = await Promise.all([
    muatProgramStudi(),
    muatKontenHalaman("program"),
  ]);
  const konten = hasilKonten.status === "ok" ? hasilKonten.data : {};
  const ringkasanKejuruan = konten["program.kejuruan_ringkasan"];
  const ringkasanFasilitas = konten["program.fasilitas_ringkasan"];
  const ringkasanEkskul = konten["program.ekstrakurikuler_ringkasan"];

  return (
    <main className="mx-auto max-w-3xl px-6 py-14">
      <h1 className="font-semibold text-3xl">Program Keahlian</h1>

      {ringkasanKejuruan ? (
        <p className="mt-4 text-sm text-teks-lembut leading-relaxed sm:text-base">
          {ringkasanKejuruan}
        </p>
      ) : null}

      <div className="mt-8">
        {hasil.status !== "ok" ? (
          <StatusTidakTerbaca hasil={hasil} konteks="Daftar program keahlian" />
        ) : hasil.data.length === 0 ? (
          <DaftarKosong pesan="Belum ada program keahlian yang aktif. Administrator dapat menambahkannya melalui menu Akademik di panel admin." />
        ) : (
          <ul className="grid gap-4">
            {hasil.data.map((program) => (
              <li
                className="rounded-lg border border-garis p-5"
                key={program.kode || program.nama}
              >
                <h2 className="font-medium text-lg">{program.nama}</h2>
                {program.kode ? (
                  <p className="mt-1 font-medium text-aksen text-xs uppercase tracking-widest">
                    {program.kode}
                  </p>
                ) : null}
                {program.deskripsi ? (
                  <p className="mt-3 text-sm text-teks-lembut leading-relaxed">
                    {program.deskripsi}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {ringkasanFasilitas || ringkasanEkskul ? (
        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          {ringkasanFasilitas ? (
            <section className="rounded-lg border border-garis p-5">
              <h2 className="font-medium text-lg">Fasilitas</h2>
              <p className="mt-2 whitespace-pre-line text-sm text-teks-lembut leading-relaxed">
                {ringkasanFasilitas}
              </p>
            </section>
          ) : null}
          {ringkasanEkskul ? (
            <section className="rounded-lg border border-garis p-5">
              <h2 className="font-medium text-lg">Ekstrakurikuler</h2>
              <p className="mt-2 whitespace-pre-line text-sm text-teks-lembut leading-relaxed">
                {ringkasanEkskul}
              </p>
            </section>
          ) : null}
        </div>
      ) : null}
    </main>
  );
}
