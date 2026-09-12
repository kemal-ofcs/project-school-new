import type { Metadata } from "next";
import { DaftarKosong } from "@/components/StatusData";

export const metadata: Metadata = {
  title: "Berita",
};

/**
 * Halaman berita, tanpa satu pun berita.
 *
 * Itu disengaja dan bukan kelalaian. Tidak ada tabel berita di skema hari ini
 * — 58 tabel cloud, tidak satu pun menyimpan artikel — sehingga satu-satunya
 * cara mengisi halaman ini sekarang adalah menuliskan berita di dalam kode.
 * Berita yang ditulis di dalam kode berarti setiap pengumuman sekolah menuntut
 * seorang programmer dan satu deployment, dan dalam sebulan halaman ini akan
 * menampilkan kabar yang sudah basi tanpa ada yang bisa memperbaikinya dari
 * panel admin.
 *
 * Rutenya tetap dibuat supaya tautannya di navigasi sudah punya alamat tetap
 * dan tidak berubah ketika modul beritanya lahir nanti.
 */
export default function HalamanBerita() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-14">
      <h1 className="font-semibold text-3xl">Berita</h1>
      <div className="mt-8">
        <DaftarKosong pesan="Belum ada berita yang dipublikasikan. Pengumuman sekolah akan tampil di halaman ini." />
      </div>
    </main>
  );
}
