import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { StatusTidakTerbaca } from "@/components/StatusData";
import { HEADER_LISENSI } from "@/lib/server/license-gate";
import {
  muatGelombangAktif,
  muatPilihanPmb,
  muatRekeningPmb,
} from "@/lib/server/pmb-data";
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
  // Diperiksa SEBELUM formulir dirender, dengan alasan yang sama seperti
  // `revalidate = 0` di atas: orang yang mengisi seluruh formulir dan
  // mengunggah berkasnya tidak boleh baru tahu di akhir bahwa pendaftarannya
  // tidak diterima. Pesannya tidak menyebut alasan; lihat `license-gate.ts`.
  if ((await headers()).get(HEADER_LISENSI) === "baca-saja") {
    return (
      <main className="mx-auto max-w-3xl px-6 py-14">
        <h1 className="font-semibold text-3xl">Formulir Pendaftaran</h1>
        <div className="mt-6 rounded-lg border border-garis bg-latar-lembut p-5">
          <p className="font-medium">
            Pendaftaran online sedang ditutup sementara.
          </p>
          <p className="mt-2 text-sm text-teks-lembut leading-relaxed">
            Silakan hubungi sekolah untuk mendaftar. Informasi jalur dan jadwal
            tetap bisa dibaca di halaman{" "}
            <Link className="text-aksen hover:underline" href="/pmb">
              Pendaftaran
            </Link>
            , dan alamat serta nomor sekolah ada di halaman{" "}
            <Link className="text-aksen hover:underline" href="/kontak">
              Kontak
            </Link>
            .
          </p>
        </div>
      </main>
    );
  }

  const [gelombang, pilihan, rekening] = await Promise.all([
    muatGelombangAktif(),
    muatPilihanPmb(),
    muatRekeningPmb(),
  ]);

  // Unit dan program dibaca dari database yang sama dengan gelombang; tanpa
  // keduanya formulir hanya akan ditolak server di langkah terakhir.
  const gagal =
    gelombang.status !== "ok"
      ? gelombang
      : pilihan.status !== "ok"
        ? pilihan
        : null;
  if (gagal) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-14">
        <h1 className="font-semibold text-3xl">Formulir Pendaftaran</h1>
        <div className="mt-6">
          <StatusTidakTerbaca hasil={gagal} konteks="Formulir pendaftaran" />
        </div>
      </main>
    );
  }
  // Tidak pernah benar di titik ini; hanya menyempitkan tipe untuk TypeScript.
  if (gelombang.status !== "ok" || pilihan.status !== "ok") return null;

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
        <FormPendaftaran pilihan={pilihan.data} rekening={rekening} />
      </div>
    </main>
  );
}
