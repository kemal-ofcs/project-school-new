import type { Metadata } from "next";
import Link from "next/link";
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
    <main className="mx-auto max-w-5xl px-6 py-14">
      <div className="border-b border-garis pb-6">
        <p className="text-xs font-bold uppercase tracking-widest text-aksen">
          Kabar Sekolah
        </p>
        <h1 className="mt-1 font-extrabold text-3xl sm:text-4xl tracking-tight text-teks-utama">
          Berita & Kegiatan
        </h1>
        <p className="mt-2 text-sm text-teks-lembut max-w-2xl">
          Ikuti perkembangan terkini, liputan aktivitas pembelajaran, pencapaian
          siswa, serta informasi penting seputar sivitas akademika.
        </p>
      </div>

      {articles.length === 0 ? (
        <div className="mt-12">
          <DaftarKosong pesan="Belum ada berita yang dipublikasikan. Pengumuman sekolah akan tampil di halaman ini." />
        </div>
      ) : (
        <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {articles.map((item) => (
            <article
              key={item.id_berita}
              className="group flex flex-col overflow-hidden rounded-2xl border border-garis bg-kartu transition duration-200 hover:-translate-y-1 hover:shadow-xl hover:border-aksen/40"
            >
              <Link
                href={`/berita/${item.slug}`}
                className="flex flex-col h-full"
              >
                {/* Gambar Sampul atau Fallback Visual */}
                <div className="relative aspect-video w-full overflow-hidden bg-slate-100 dark:bg-slate-800">
                  {item.gambar_sampul ? (
                    // biome-ignore lint/performance/noImgElement: Data URI dari database cloud
                    <img
                      src={item.gambar_sampul}
                      alt={item.judul}
                      className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-aksen/10 to-sky-500/20 text-xs font-semibold text-aksen">
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
    </main>
  );
}
