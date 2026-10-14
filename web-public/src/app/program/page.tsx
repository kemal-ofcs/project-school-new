import type { Metadata } from "next";
import { KepalaHalaman } from "@/components/KepalaHalaman";
import { FacilitiesSection } from "@/components/landing/FacilitiesSection";
import { TautanGaleri } from "@/components/landing/FotoKartu";
import {
  KartuEkskul,
  KartuJurusan,
} from "@/components/landing/ProgramsSection";
import { DaftarKosong, StatusTidakTerbaca } from "@/components/StatusData";
import { muatKontenHalaman } from "@/lib/server/content-data";
import { muatProgramStudi } from "@/lib/server/school-data";
import { tautanGaleri } from "@/lib/services/gambar-konten";
import {
  fotoJurusan,
  koleksiEkskul,
  koleksiFasilitas,
} from "@/lib/services/landing-collections";

export const metadata: Metadata = {
  title: "Program Sekolah",
  description:
    "Program, fasilitas, dan kegiatan ekstrakurikuler yang tersedia di sekolah.",
};

/**
 * Halaman Program menggabungkan tiga sumber:
 *
 * - jurusan dari `akademik_jurusan`, tabel yang sama yang dipakai sekolah untuk
 *   menempatkan siswa ke rombel, supaya situs tidak pernah menyangkal jurusan
 *   yang sudah menerima siswa;
 * - kartu fasilitas dan ekstrakurikuler dari koleksi beranda, beserta fotonya,
 *   jadi admin mengisinya sekali;
 * - tiga ringkasan naratif dari menu Konten → Program & Fasilitas, sebagai
 *   pengantar tiap bagian.
 *
 * Sekolah tanpa jurusan (SMP, SD) tidak melihat bagian jurusan sama sekali:
 * kotak "belum ada program keahlian" adalah pesan untuk admin, bukan untuk
 * calon wali yang membaca halaman ini.
 */
export default async function HalamanProgram() {
  const [hasil, hasilProgram, hasilLanding, hasilKontak] = await Promise.all([
    muatProgramStudi(),
    muatKontenHalaman("program"),
    muatKontenHalaman("landing"),
    muatKontenHalaman("kontak"),
  ]);
  const konten = hasilProgram.status === "ok" ? hasilProgram.data : {};
  const landing = hasilLanding.status === "ok" ? hasilLanding.data : {};
  const galeri = tautanGaleri(
    hasilKontak.status === "ok" ? hasilKontak.data : {},
  );

  const ringkasanKejuruan = konten["program.kejuruan_ringkasan"];
  const ringkasanFasilitas = konten["program.fasilitas_ringkasan"];
  const ringkasanEkskul = konten["program.ekstrakurikuler_ringkasan"];

  const jurusan = hasil.status === "ok" ? hasil.data : [];
  const fotoPerJurusan = fotoJurusan(landing);
  const adaFotoJurusan = Object.keys(fotoPerJurusan).length > 0;
  const adaFasilitas = koleksiFasilitas(landing).length > 0;
  const ekskul = koleksiEkskul(landing);
  const adaFotoEkskul = ekskul.some((item) => item.foto);

  const kosongSemua =
    hasil.status === "ok" &&
    jurusan.length === 0 &&
    !adaFasilitas &&
    ekskul.length === 0 &&
    !ringkasanFasilitas &&
    !ringkasanEkskul;

  return (
    <main>
      <KepalaHalaman
        label="Akademik"
        judul={jurusan.length > 0 ? "Program Keahlian" : "Program Sekolah"}
        lebar="max-w-7xl px-4 sm:px-6 lg:px-8"
      >
        {ringkasanKejuruan ? (
          <span className="whitespace-pre-line">{ringkasanKejuruan}</span>
        ) : null}
      </KepalaHalaman>

      {hasil.status !== "ok" ? (
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-12">
          <StatusTidakTerbaca hasil={hasil} konteks="Daftar jurusan" />
        </div>
      ) : null}

      {kosongSemua ? (
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
          <DaftarKosong pesan="Informasi program sekolah sedang disiapkan. Untuk pertanyaan, hubungi sekolah lewat halaman Kontak." />
        </div>
      ) : null}

      {jurusan.length > 0 ? (
        <section className="muncul py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-10">
            <KepalaBagian judul="Jurusan" />
            <div className="kartu-tengah md:[--kolom:2] lg:[--kolom:3]">
              {jurusan.map((prodi) => (
                <KartuJurusan
                  key={prodi.kode || prodi.nama}
                  prodi={prodi}
                  foto={fotoPerJurusan[prodi.kode] ?? ""}
                  adaFoto={adaFotoJurusan}
                />
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {adaFasilitas ? (
        <FacilitiesSection
          konten={landing}
          galeri={galeri}
          kepala={<KepalaBagian judul="Fasilitas" teks={ringkasanFasilitas} />}
        />
      ) : ringkasanFasilitas ? (
        <BagianTeks judul="Fasilitas" teks={ringkasanFasilitas} />
      ) : null}

      {ekskul.length > 0 ? (
        <section className="muncul py-16 sm:py-20 bg-muted/40 border-y border-border">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-10">
            <KepalaBagian judul="Ekstrakurikuler" teks={ringkasanEkskul} />
            <div className="kartu-tengah sm:[--kolom:2] lg:[--kolom:3]">
              {ekskul.map((item, i) => (
                <KartuEkskul
                  key={`${i}-${item.title}`}
                  item={item}
                  indeks={i}
                  adaFoto={adaFotoEkskul}
                />
              ))}
            </div>
            <TautanGaleri tautan={galeri} />
          </div>
        </section>
      ) : ringkasanEkskul ? (
        <BagianTeks judul="Ekstrakurikuler" teks={ringkasanEkskul} />
      ) : null}
    </main>
  );
}

/**
 * Judul bagian rata kiri, garis amber yang sama dengan kepala halaman, lalu
 * pengantar dari CMS tepat di bawahnya.
 */
function KepalaBagian({ judul, teks }: { judul: string; teks?: string }) {
  return (
    <div className="max-w-2xl">
      <h2 className="font-bold text-3xl text-foreground tracking-tight">
        {judul}
      </h2>
      <div
        aria-hidden="true"
        className="mt-3 h-1 w-10 rounded-full bg-secondary-container"
      />
      {teks ? (
        <p className="mt-4 leading-relaxed text-muted-foreground whitespace-pre-line">
          {teks}
        </p>
      ) : null}
    </div>
  );
}

/** Bagian yang baru punya ringkasan CMS, belum punya kartu. */
function BagianTeks({ judul, teks }: { judul: string; teks: string }) {
  return (
    <section className="muncul py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <KepalaBagian judul={judul} teks={teks} />
      </div>
    </section>
  );
}
