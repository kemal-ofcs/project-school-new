import type { Metadata } from "next";
import { KepalaHalaman } from "@/components/KepalaHalaman";
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
    <main>
      <KepalaHalaman label="Akademik" judul="Program Keahlian">
        {ringkasanKejuruan ? (
          <span className="whitespace-pre-line">{ringkasanKejuruan}</span>
        ) : null}
      </KepalaHalaman>

      <div className="mx-auto max-w-4xl px-6 py-12 sm:py-16 space-y-16">
        {hasil.status !== "ok" ? (
          <StatusTidakTerbaca hasil={hasil} konteks="Daftar program keahlian" />
        ) : hasil.data.length === 0 ? (
          <DaftarKosong pesan="Belum ada program keahlian yang aktif. Administrator dapat menambahkannya melalui menu Akademik di panel admin." />
        ) : (
          <ul className="kartu-tengah sm:[--kolom:2]">
            {hasil.data.map((program) => (
              <li
                className="rounded-2xl border border-border bg-card p-6 transition-colors duration-200 hover:border-primary/40"
                key={program.kode || program.nama}
              >
                {program.kode ? (
                  <p className="text-sm font-semibold text-secondary">
                    {program.kode}
                  </p>
                ) : null}
                <h2 className="mt-1 font-bold text-lg text-foreground">
                  {program.nama}
                </h2>
                {program.deskripsi ? (
                  <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                    {program.deskripsi}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {/* Dua ringkasan naratif ditulis sebagai teks berjalan dua kolom,
            bukan kartu lagi, supaya halaman tidak menjadi deretan kotak
            yang sama dari atas sampai bawah. */}
        {ringkasanFasilitas || ringkasanEkskul ? (
          <div className="grid gap-12 md:grid-cols-2">
            {ringkasanFasilitas ? (
              <section className="muncul">
                <h2 className="font-bold text-2xl text-foreground">
                  Fasilitas
                </h2>
                <p className="mt-4 whitespace-pre-line text-muted-foreground leading-relaxed">
                  {ringkasanFasilitas}
                </p>
              </section>
            ) : null}
            {ringkasanEkskul ? (
              <section className="muncul">
                <h2 className="font-bold text-2xl text-foreground">
                  Ekstrakurikuler
                </h2>
                <p className="mt-4 whitespace-pre-line text-muted-foreground leading-relaxed">
                  {ringkasanEkskul}
                </p>
              </section>
            ) : null}
          </div>
        ) : null}
      </div>
    </main>
  );
}
