import type { Metadata } from "next";
import Link from "next/link";
import { KepalaHalaman } from "@/components/KepalaHalaman";
import { DaftarKosong, StatusTidakTerbaca } from "@/components/StatusData";
import { muatBeritaPublik } from "@/lib/server/content-data";

export const metadata: Metadata = {
  title: "Berita & Pengumuman",
  description:
    "Kabar terbaru, agenda kegiatan, liputan prestasi, dan pengumuman resmi sekolah.",
};

export default async function HalamanBerita() {
  const hasil = await muatBeritaPublik(30);

  if (hasil.status !== "ok") {
    return (
      <main className="mx-auto max-w-5xl px-6 py-14">
        <h1 className="font-semibold text-3xl tracking-tight">
          Berita & Pengumuman
        </h1>
        <div className="mt-8">
          <StatusTidakTerbaca hasil={hasil} konteks="Daftar berita sekolah" />
        </div>
      </main>
    );
  }

  const articles = hasil.data;

  return (
    <main>
      <KepalaHalaman
        label="Kabar Sekolah"
        judul="Berita & Kegiatan"
        lebar="max-w-5xl"
      >
        Kegiatan belajar, prestasi siswa, dan pengumuman resmi sekolah.
      </KepalaHalaman>

      <div className="mx-auto max-w-5xl px-6 pb-16">
        {articles.length === 0 ? (
          <div className="mt-12">
            <DaftarKosong pesan="Belum ada berita yang dipublikasikan. Pengumuman sekolah akan tampil di halaman ini." />
          </div>
        ) : (
          <div className="mt-10 kartu-tengah [--jarak:2rem] sm:[--kolom:2] lg:[--kolom:3]">
            {articles.map((item) => (
              <article
                key={item.id_berita}
                className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition duration-200 hover:-translate-y-0.5 hover:border-primary/40 focus-within:ring-2 focus-within:ring-ring"
              >
                <Link
                  href={`/berita/${item.slug}`}
                  className="flex flex-col h-full"
                >
                  {/* Gambar Sampul atau Fallback Visual */}
                  <div className="relative aspect-video w-full overflow-hidden bg-slate-100 dark:bg-slate-800">
                    {item.punya_gambar ? (
                      // biome-ignore lint/performance/noImgElement: gambar dari database cloud, bukan aset build
                      <img
                        src={`/api/konten/berita/${encodeURIComponent(item.slug)}/gambar`}
                        alt={item.judul}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-muted text-sm font-semibold text-primary">
                        Kabar Sekolah
                      </div>
                    )}
                  </div>

                  <div className="flex flex-1 flex-col p-5">
                    <div className="flex items-center gap-2 text-xs text-teks-lembut">
                      {item.tanggal_terbit ? (
                        <time dateTime={item.tanggal_terbit}>
                          {new Date(item.tanggal_terbit).toLocaleDateString(
                            "id-ID",
                            {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            },
                          )}
                        </time>
                      ) : null}
                      {item.penulis ? (
                        <>
                          <span>•</span>
                          <span>{item.penulis}</span>
                        </>
                      ) : null}
                    </div>

                    <h2 className="mt-2.5 font-bold text-base text-teks-utama leading-snug group-hover:text-aksen transition-colors line-clamp-2">
                      {item.judul}
                    </h2>

                    <p className="mt-2 text-xs text-teks-lembut leading-relaxed line-clamp-3 flex-1">
                      {item.ringkasan || "Klik untuk membaca selengkapnya..."}
                    </p>

                    <div className="mt-4 pt-3 border-t border-garis/60 flex items-center text-xs font-bold text-aksen">
                      <span>Baca selengkapnya</span>
                      <span className="ml-1 transition-transform group-hover:translate-x-1">
                        →
                      </span>
                    </div>
                  </div>
                </Link>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
